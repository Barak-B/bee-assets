// PROTOCOL §3.4 — counterparty normalization
// Strip Hebrew connectives + collapse whitespace + lowercase.
// Deterministic Tier-0; NO LLM here.

import { fromZonedTime } from "date-fns-tz";

const HEBREW_CONNECTIVES = [
  "ה", "של", "מ", "מן", "אצל", "אצלו", "ל", "ב", "בית",
  "אל", "מאת", "דרך", "בעבור", "עבור", "מטעם",
];

/** Strip leading connectives + extra whitespace; safe for re-entry (idempotent). */
export function cleanCounterparty(s: string): string {
  if (!s) return "";
  let t = s.trim().toLowerCase();

  // Strip Hebrew connective prefixes that appear as standalone words
  // We iterate twice because some inputs have nested prefixes: "אצל ה <name>"
  for (let pass = 0; pass < 2; pass++) {
    for (const c of HEBREW_CONNECTIVES) {
      const re = new RegExp(`^${c}\\s+`, "u");
      t = t.replace(re, "");
    }
  }

  // Strip common Hebrew prefixes attached to a word with a maqaf or no space
  // e.g. "מ-בנק" -> "בנק", "ה-לקוח" -> "לקוח"
  t = t.replace(/^[המבלשו]־/u, "");

  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();

  // Normalize quotes/dashes
  t = t.replace(/[״"']+/g, '"').replace(/[־–—]+/g, "-");

  return t;
}

/** Parse an Israeli-bank amount string ("1,234.56" or "1234.56-" suffix) → signed integer cents. */
export function parseAmountCents(raw: string): bigint {
  if (!raw) throw new Error("empty amount");
  let s = raw.trim();

  // Trailing minus convention: "1234.56-"
  let negative = false;
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1).trim(); }

  // Strip thousands separators (comma, narrow nbsp)
  s = s.replace(/[,  \s]/g, "");

  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`unparseable amount: ${raw}`);
  const whole = BigInt(m[1]);
  const fracStr = (m[2] || "").padEnd(2, "0").slice(0, 2);
  const frac = BigInt(fracStr);
  const cents = whole * 100n + frac;
  return negative ? -cents : cents;
}

/** Parse "DD/MM/YYYY" or "DD/MM/YY" Israeli formats → UTC Date at midnight Asia/Jerusalem. */
export function parseIsraeliDate(raw: string): Date {
  if (!raw) throw new Error("empty date");
  const s = raw.trim();
  // Accept DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, with 2- or 4-digit year
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (!m) throw new Error(`unparseable date: ${raw}`);
  let [_, dd, mm, yy] = m;
  let year = parseInt(yy, 10);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const iso = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`;
  return fromZonedTime(iso, "Asia/Jerusalem");
}
