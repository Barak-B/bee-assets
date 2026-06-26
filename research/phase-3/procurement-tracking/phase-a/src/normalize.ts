// Procurement Phase A — supplier-name + description normalization
// Tier 0 only. Deterministic. NO LLM.
//
// Builds on bank-receipts/normalize.ts::cleanCounterparty. Adds suffix-stripping
// of Israeli corporate marks ("בע"מ", "ושות'", "(2007)") so that
// 'אלקטרו-טק בע"מ' fuzzy-matches 'אלקטרו טק'.

import { fromZonedTime } from "date-fns-tz";

const HEBREW_CONNECTIVES = [
  "ה", "של", "מ", "מן", "אצל", "אצלו", "ל", "ב", "בית",
  "אל", "מאת", "דרך", "בעבור", "עבור", "מטעם",
];

// Corporate-form suffixes — strip from END of normalized name.
// Hebrew patterns use explicit (^|\s) / (\s|$|\.|,) boundaries because JS
// regex \b uses ASCII \w only — Hebrew letters are NOT word chars, so \b
// silently fails to match a "space → Hebrew" transition.
// Order matters: Hebrew first, then English; longer/more-specific patterns first.
const CORP_SUFFIX_HEBREW = [
  /(^|\s)בע[״"']?מ(\s|$|[.,;])/gu,   // בע"מ / בע'מ
  /(^|\s)בעמ(\s|$|[.,;])/gu,         // בעמ (no quote)
  /(^|\s)ושות[״"']?(\s|$|[.,;])/gu,  // ושות'
  /(^|\s)שות['']?(\s|$|[.,;])/gu,
];
const CORP_SUFFIX_LATIN = [
  /\bsolutions?\b/giu,
  /\benterprises?\b/giu,
  /\bgroup\b/giu,
  /\bltd\.?\b/giu,
  /\binc\.?\b/giu,
  /\bllc\b/giu,
  /\(\d{4}\)/gu,             // (2007) year-suffixed company variants
];

/** Idempotent supplier-name normalizer. */
export function cleanSupplierName(s: string): string {
  if (!s) return "";
  let t = s.trim().toLowerCase();

  // Strip Hebrew connectives (two passes to handle nested 'אצל ה <name>')
  for (let pass = 0; pass < 2; pass++) {
    for (const c of HEBREW_CONNECTIVES) {
      t = t.replace(new RegExp(`^${c}\\s+`, "u"), "");
    }
  }

  // Strip prefix-attached connectives ("מ-בנק" → "בנק")
  t = t.replace(/^[המבלשו]־/u, "");

  // Strip corporate suffixes — Hebrew first (preserve boundary chars), then Latin
  for (const re of CORP_SUFFIX_HEBREW) {
    t = t.replace(re, "$1$2");
  }
  for (const re of CORP_SUFFIX_LATIN) {
    t = t.replace(re, " ");
  }

  // Quote / dash normalization
  t = t.replace(/[״"']+/g, '"').replace(/[־–—]+/g, "-");

  // Collapse whitespace + drop trailing punctuation
  t = t.replace(/\s+/g, " ").replace(/[.,;:\s]+$/u, "").trim();

  return t;
}

/** Description normalization for line-item benchmark grouping. */
export function cleanDescription(s: string): string {
  if (!s) return "";
  let t = s.trim().toLowerCase();
  // Strip parenthetical sub-codes
  t = t.replace(/\([^)]*\)/g, " ");
  // Strip leading bullets / hyphens
  t = t.replace(/^[-*•·]+\s*/u, "");
  // Normalize cable-size units: "6 mm²" / "6 mm 2" / "6mm²" → "6mm2"
  // (digit, optional space, mm, optional space, ² or 2) → "(digit)mm2"
  t = t.replace(/(\d)\s*mm\s*[²2]/giu, "$1mm2");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** Strict amount parser — signed integer cents. Accepts "1,234.56" / "-50" / "1234.56-". */
export function parseAmountCents(raw: string): bigint {
  if (!raw) throw new Error("empty amount");
  let s = raw.trim();
  let negative = false;
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1).trim(); }
  s = s.replace(/[,  \s]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`unparseable amount: ${raw}`);
  const whole = BigInt(m[1]);
  const fracStr = (m[2] || "").padEnd(2, "0").slice(0, 2);
  const cents = whole * 100n + BigInt(fracStr);
  return negative ? -cents : cents;
}

/** "DD/MM/YYYY" Israeli format → UTC Date pinned to Asia/Jerusalem midnight. */
export function parseIsraeliDate(raw: string): Date {
  if (!raw) throw new Error("empty date");
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) throw new Error(`unparseable date: ${raw}`);
  let [_, dd, mm, yy] = m;
  let year = parseInt(yy, 10);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const iso = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`;
  return fromZonedTime(iso, "Asia/Jerusalem");
}

/** Deterministic categorization stub — string-matched. Tier-1 LLM call replaces this in Phase D. */
export function guessCategory(supplierName: string, description?: string): string | null {
  const haystack = (supplierName + " " + (description ?? "")).toLowerCase();
  if (/(panel|module|מודול|פאנל|פוטו[- ]?וולט)/u.test(haystack)) return "pv-modules";
  if (/(inverter|ממיר|deye|kstar|sungrow|huawei|fronius|sma)/iu.test(haystack)) return "inverters";
  if (/(cable|כבל|חוט|wire|6\s?mm|10\s?mm|16\s?mm)/iu.test(haystack)) return "cables";
  if (/(labor|עבודה|התקנה|installer|טכנאי)/u.test(haystack)) return "labor";
  if (/(office|משרד|stationery|כלי כתיבה)/iu.test(haystack)) return "office";
  if (/(fuel|דלק|gas|petrol|רכב|leasing|ליסינג)/iu.test(haystack)) return "vehicle";
  return null;
}
