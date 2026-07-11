// gov-rss-poller.js
//
// Polls all configured sources (RSS + HTML scraping) and normalizes
// into a uniform { name_he, description, source, source_url, deadline_date, ... } shape.

import fetch from "node-fetch";
import Parser from "rss-parser";

const rssParser = new Parser({
  customFields: {
    item: [["pubDate", "pubDate"], ["description", "description"]],
  },
});

/**
 * Poll every source defined in config.sources.
 * Returns array of normalized tender candidates.
 *
 * @param {object} config
 * @param {object} opts
 * @returns {Promise<Array<{name_he, description, source, source_url, deadline_date, raw}>>}
 */
export async function pollAllSources(config, opts = {}) {
  const { verbose = false } = opts;
  const allCandidates = [];

  for (const source of config.sources) {
    try {
      if (verbose) console.log(`[poller] ${source.name} (${source.type})`);
      let items = [];

      if (source.type === "rss") {
        items = await pollRss(source, config);
      } else if (source.type === "html") {
        items = await pollHtml(source, config);
      } else {
        console.warn(`[poller] Unknown source type: ${source.type}`);
        continue;
      }

      if (verbose) console.log(`  → ${items.length} items`);
      allCandidates.push(...items);

      // Polite delay between sources
      await sleep(config.polling.delay_between_sources_ms || 2000);
    } catch (e) {
      console.error(`[poller] ${source.name}: ${e.message}`);
      // Continue with next source — single failure shouldn't stop the run
    }
  }

  return allCandidates;
}

// ===== RSS handler =====
async function pollRss(source, config) {
  const feed = await rssParser.parseURL(source.url);
  return (feed.items || []).map((item) => {
    return {
      name_he: item.title || "(no title)",
      description: stripHtml(item.contentSnippet || item.content || item.description || ""),
      source: source.name,
      source_url: item.link,
      issued_date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : null,
      deadline_date: extractDeadline(item.title + " " + (item.description || "")),
      raw: item,
    };
  }).filter((t) => t.deadline_date); // skip items where we can't find a deadline
}

// ===== HTML handler =====
// Best-effort scraping. Real-world municipal sites vary wildly — this is a starting
// point. For each site you may need a custom selector & parser in Phase 3.
async function pollHtml(source, config) {
  const res = await fetch(source.url, {
    headers: { "User-Agent": config.polling.user_agent },
    signal: AbortSignal.timeout(config.polling.timeout_ms),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Naive: find all anchors that look tender-ish
  // For production, switch to firecrawl (already in skill set per v17)
  const candidates = extractTendersFromHtml(html, source);
  return candidates;
}

function extractTendersFromHtml(html, source) {
  const out = [];

  // Pattern 1: anchor with "מכרז" in text
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*מכרז[^<]*)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const [, href, text] = m;
    const fullUrl = href.startsWith("http") ? href : new URL(href, source.url).href;
    out.push({
      name_he: text.trim(),
      description: "",
      source: source.name,
      source_url: fullUrl,
      issued_date: null,
      deadline_date: null,  // will need to fetch detail page — TODO Phase 3
      raw: { matched: text, href },
    });
  }

  // Pattern 2: look for tender-row class items
  // (very source-specific — Phase 3 will have per-source parsers)

  return out;
}

// ===== Helpers =====

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, "").trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Best-effort Hebrew date extraction. Returns ISO date or null.
 *
 * Recognizes:
 *  - DD.MM.YYYY  /  DD/MM/YYYY  /  DD-MM-YYYY
 *  - DD.MM       (current year assumed)
 *  - "עד תאריך X" / "המכרז נסגר ביום X"
 *  - Hebrew month names (ינואר, פברואר, ...)
 */
function extractDeadline(text) {
  if (!text) return null;

  // Pattern 1: dotted date
  const dotted = text.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (dotted) {
    let [, dd, mm, yy] = dotted;
    if (!yy) yy = new Date().getFullYear();
    if (yy.length === 2) yy = "20" + yy;
    const dt = new Date(`${yy}-${pad(mm)}-${pad(dd)}`);
    if (!isNaN(dt) && dt > new Date(Date.now() - 90 * 86400000)) {
      // Sanity: deadline not more than 90 days in the past
      return dt.toISOString().slice(0, 10);
    }
  }

  // Pattern 2: Hebrew month name
  const hebMonths = {
    "ינואר": 1, "פברואר": 2, "מרץ": 3, "אפריל": 4, "מאי": 5, "יוני": 6,
    "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12,
  };
  for (const [name, num] of Object.entries(hebMonths)) {
    const re = new RegExp(`(\\d{1,2})[\\s־-]+ב?${name}`, "u");
    const m = text.match(re);
    if (m) {
      const dt = new Date(`${new Date().getFullYear()}-${pad(num)}-${pad(m[1])}`);
      if (!isNaN(dt)) return dt.toISOString().slice(0, 10);
    }
  }

  // Pattern 3: explicit "עד" or "deadline"
  // (extend per real-world examples)

  return null;
}

function pad(n) {
  return String(n).padStart(2, "0");
}
