// tender-detail-fetcher.js — Phase 1.5
//
// For each tender row with `deadline_date: null`, fetch the source URL detail page
// and extract: deadline date, estimated value, submission method, required docs.
//
// SOURCE: phase-1-final-status.md §Phase 1.5 #2 — Kiryat Gat tenders captured but
// deadlines null (parser limitation).
//
// FLOW per tender:
//   1. Read all tenders where deadline_date IS NULL
//   2. fetchWithFirecrawlFallback(source_url) to get detail page HTML/markdown
//   3. Try regex extraction first (cheap, fast):
//        - Hebrew dates: "12.5.2026" / "12/5/26" / "עד 12 במאי 2026"
//        - Value: "₪500,000" / "סך 1.2 מיליון" / "תקציב חזוי"
//        - Method: "הגשה מקוונת" / "תיבת מכרזים" / email pattern
//   4. If regex fails, call DeepSeek-v4-flash for LLM extraction (cheap, structured output)
//   5. UPDATE tenders SET deadline_date, estimated_value_nis, submission_method, required_docs
//   6. Re-trigger deadline-watcher on the updated row
//
// USAGE:
//   node tender-detail-fetcher.js              # process all NULL-deadline tenders
//   node tender-detail-fetcher.js --id <uuid>  # single tender
//   node tender-detail-fetcher.js --dry-run    # extract but don't UPDATE

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import fetch from "node-fetch";

import { fetchWithFirecrawlFallback } from "./firecrawl-fallback.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, "config.json"), "utf-8"));
const db = new Database(join(__dirname, "tenders.db"));

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const TARGET_ID = (() => {
  const i = process.argv.indexOf("--id");
  return i >= 0 ? process.argv[i + 1] : null;
})();

// ===== Main =====
async function main() {
  let tenders;
  if (TARGET_ID) {
    tenders = db.prepare("SELECT * FROM tenders WHERE id = ?").all(TARGET_ID);
  } else {
    tenders = db
      .prepare(
        `SELECT * FROM tenders
         WHERE status IN ('open', 'applying')
           AND deadline_date IS NULL
           AND source_url IS NOT NULL
         ORDER BY created_at DESC`
      )
      .all();
  }

  console.log(`[detail-fetcher] processing ${tenders.length} tenders`);

  for (const tender of tenders) {
    try {
      await processTender(tender);
    } catch (e) {
      console.error(`[${tender.id}] ${e.message}`);
    }
  }

  db.close();
}

async function processTender(tender) {
  console.log(`\n[${tender.id}] ${tender.name_he}`);
  console.log(`  URL: ${tender.source_url}`);

  // 1. Fetch detail page
  const source = {
    name: tender.source,
    url: tender.source_url,
    use_firecrawl: needsFirecrawlForUrl(tender.source_url),
  };
  let detailHtml;
  try {
    const fetched = await fetchWithFirecrawlFallback(source, config);
    detailHtml = fetched.html;
    if (VERBOSE) console.log(`  Fetched ${detailHtml.length} chars via ${fetched.method}`);
  } catch (e) {
    console.error(`  Fetch failed: ${e.message}`);
    return;
  }

  // 2. Try regex extraction
  let extracted = extractWithRegex(detailHtml);
  if (VERBOSE) console.log(`  Regex extracted: ${JSON.stringify(extracted)}`);

  // 3. If regex missed critical fields, try LLM extraction
  if (!extracted.deadline_date || !extracted.estimated_value_nis) {
    if (VERBOSE) console.log("  Regex incomplete, calling LLM...");
    const llmExtracted = await extractWithLLM(detailHtml, tender.name_he);
    extracted = { ...llmExtracted, ...extracted }; // regex wins ties
  }

  // 4. Update db
  if (extracted.deadline_date) {
    if (DRY_RUN) {
      console.log(`  [DRY] Would UPDATE: deadline=${extracted.deadline_date}, value=${extracted.estimated_value_nis}`);
    } else {
      db.prepare(
        `UPDATE tenders
         SET deadline_date = COALESCE(?, deadline_date),
             estimated_value_nis = COALESCE(?, estimated_value_nis),
             submission_method = COALESCE(?, submission_method),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        extracted.deadline_date,
        extracted.estimated_value_nis || null,
        extracted.submission_method || null,
        tender.id
      );
      console.log(`  ✓ Updated`);
    }
  } else {
    console.log(`  ✗ Could not extract deadline`);
  }
}

// ===== Regex extractors (cheap path) =====

function extractWithRegex(html) {
  const result = {
    deadline_date: null,
    estimated_value_nis: null,
    submission_method: null,
  };

  // -- Deadline date --
  // Pattern: "המכרז ייסגר בתאריך 30.6.2026 בשעה 12:00"
  // Pattern: "מועד אחרון להגשת הצעות: 30/6/2026"
  // Pattern: "עד יום ראשון 30 ביוני 2026"
  const dateContexts = [
    /(?:מועד אחרון|אחרון להגש|ייסגר ב|לא יאוחר מ|עד תאריך|deadline)[\s:.]{0,40}(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/u,
    /הגשה\s+עד\s+(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/u,
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\s+ב?שעה/u, // implicit deadline
  ];
  for (const re of dateContexts) {
    const m = html.match(re);
    if (m) {
      let [, dd, mm, yy] = m;
      if (yy.length === 2) yy = "20" + yy;
      const dt = new Date(`${yy}-${pad(mm)}-${pad(dd)}`);
      if (!isNaN(dt) && dt > new Date()) {
        result.deadline_date = dt.toISOString().slice(0, 10);
        break;
      }
    }
  }

  // Hebrew month names
  if (!result.deadline_date) {
    const hebMonths = {
      "ינואר": 1, "פברואר": 2, "מרץ": 3, "אפריל": 4, "מאי": 5, "יוני": 6,
      "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12,
    };
    for (const [name, num] of Object.entries(hebMonths)) {
      const re = new RegExp(`(\\d{1,2})\\s+ב?${name}\\s+(\\d{4})`, "u");
      const m = html.match(re);
      if (m) {
        const dt = new Date(`${m[2]}-${pad(num)}-${pad(m[1])}`);
        if (!isNaN(dt) && dt > new Date()) {
          result.deadline_date = dt.toISOString().slice(0, 10);
          break;
        }
      }
    }
  }

  // -- Estimated value --
  // Pattern: "₪500,000" / "500,000 ש"ח" / "סך 1.2 מיליון" / "תקציב 2 מיליון ₪"
  const valuePatterns = [
    /₪\s*([\d,]+(?:\.\d+)?)\s*(?:מיליון|מליון|אלף|alf|million)?/iu,
    /([\d,]+(?:\.\d+)?)\s*(?:מיליון|מליון)\s*(?:₪|ש["׳]ח|שח)/iu,
    /([\d,]+)\s*(?:₪|ש["׳]ח|שח|NIS)/iu,
    /סך\s+(?:של\s+)?([\d,]+(?:\.\d+)?)/u,
  ];
  for (const re of valuePatterns) {
    const m = html.match(re);
    if (m) {
      let num = parseFloat(m[1].replace(/,/g, ""));
      // If "מיליון" appears nearby, multiply
      const ctx = html.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20);
      if (/מיליון|מליון|million/u.test(ctx)) num *= 1_000_000;
      else if (/אלף|thousand/u.test(ctx)) num *= 1_000;
      if (num > 1000) {
        result.estimated_value_nis = Math.round(num);
        break;
      }
    }
  }

  // -- Submission method --
  if (/הגשה\s+מקוונת|portal|online submission/iu.test(html)) {
    result.submission_method = "online";
  } else if (/תיבת\s+מכרזים/u.test(html)) {
    result.submission_method = "physical-box";
  } else if (/דוא["׳]ל|email/iu.test(html)) {
    result.submission_method = "email";
  }

  return result;
}

// ===== LLM extractor (expensive fallback) =====

async function extractWithLLM(html, tenderName) {
  // Truncate to ~10K chars to control cost
  const corpus = html.replace(/\s+/g, " ").slice(0, 10000);

  const prompt = `You are a Hebrew tender document parser. Extract structured data from the text below.

Tender name: ${tenderName}
Tender text (truncated): ${corpus}

Return ONLY a JSON object with these fields (use null if missing):
{
  "deadline_date": "YYYY-MM-DD",
  "estimated_value_nis": number,
  "submission_method": "online" | "physical-box" | "email" | null,
  "required_documents": ["doc1", "doc2"]
}`;

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_KEY) {
    console.warn("  DEEPSEEK_API_KEY missing, skipping LLM extraction");
    return {};
  }

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`  LLM call failed: ${res.status}`);
      return {};
    }
    const data = await res.json();
    const content = data.choices[0]?.message?.content;
    if (!content) return {};
    const parsed = JSON.parse(content);
    // Validate date format
    if (parsed.deadline_date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline_date)) {
      parsed.deadline_date = null;
    }
    return parsed;
  } catch (e) {
    console.warn(`  LLM error: ${e.message}`);
    return {};
  }
}

// ===== Helpers =====

function pad(n) {
  return String(n).padStart(2, "0");
}

function needsFirecrawlForUrl(url) {
  return /ashkelon|jerusalem|spa|angular/i.test(url || "");
}

// ===== Run =====
main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
