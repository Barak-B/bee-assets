// parse-bank-csv.mjs — SEE the bank-ingest capability on YOUR real data.
//
// Pure Node. NO dependencies, NO database, NO network. Nothing is written or sent
// anywhere — it only READS the CSV you point at and PRINTS what the engine extracts.
// This is the same Tier-0 logic the real pipeline uses (Hebrew normalization, Israeli
// date parsing, signed-amount parsing), inlined so it runs with zero install.
//
// USAGE (PowerShell):
//   node research\demos\parse-bank-csv.mjs "C:\path\to\mercantile-export.csv"
//
// If the auto-detected columns are wrong, override them (use the EXACT Hebrew header text):
//   node research\demos\parse-bank-csv.mjs "...csv" --date "תאריך ערך" --debit "חובה" --credit "זכות" --desc "תיאור" --ref "אסמכתא"
//   (or --amount "סכום" if the bank uses ONE signed column instead of debit/credit)
//
// What you'll see: the detected headers, the column mapping used, the first rows parsed
// into {date, amount-in-shekels, normalized-counterparty}, and summary totals. That's the
// raw material every later step (dedup, reconcile, kartset) is built on.

import { readFileSync } from "node:fs";

// ---- args ----
const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
function flag(name) { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; }
if (!file) {
  console.error('Usage: node research/demos/parse-bank-csv.mjs "<path-to-csv>" [--date H --debit H --credit H --amount H --desc H --ref H]');
  process.exit(2);
}

// ---- decode (utf-8, fall back to windows-1255 which Israeli banks often use) ----
const buf = readFileSync(file);
let text;
if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
  text = buf.slice(3).toString("utf-8");                       // strip BOM
} else {
  const utf = buf.toString("utf-8");
  text = utf.includes("�") ? new TextDecoder("windows-1255").decode(buf) : utf;
}

// ---- minimal CSV parse (quoted fields, embedded commas) ----
function splitLines(t) {
  const out = []; let b = "", q = false;
  for (const c of t) {
    if (c === '"') { q = !q; b += c; continue; }
    if (c === "\n" && !q) { out.push(b.replace(/\r$/, "")); b = ""; } else b += c;
  }
  if (b) out.push(b);
  return out;
}
function splitCells(line) {
  const out = []; let b = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { b += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(b); b = ""; } else b += c;
  }
  out.push(b);
  return out;
}
const lines = splitLines(text).filter((l) => l.trim().length);
if (!lines.length) { console.error("empty file"); process.exit(1); }
const headers = splitCells(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));

// ---- the actual engine logic (inlined from src/normalize.ts, post-audit) ----
const CONNECTIVES = ["של", "מן", "אצל", "אצלו", "מאת", "דרך", "בעבור", "עבור", "מטעם"];
function cleanCounterparty(s) {
  if (!s) return "";
  let t = s.trim().toLowerCase();
  for (let p = 0; p < 2; p++) for (const c of CONNECTIVES) t = t.replace(new RegExp(`^${c}\\s+`, "u"), "");
  t = t.replace(/^[המבלשו][־-]\s*/u, "");
  t = t.replace(/\s+/g, " ").trim().replace(/[״"']+/g, '"').replace(/[־–—]+/g, "-");
  return t;
}
function parseAmountCents(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim(); let neg = false;
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1).trim(); }
  if (s.startsWith("-")) { neg = true; s = s.slice(1).trim(); }
  s = s.replace(/[₪,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = BigInt(m[1]) * 100n + BigInt((m[2] || "").padEnd(2, "0").slice(0, 2));
  return neg ? -cents : cents;
}
function parseILDate(raw) {
  if (!raw) return null;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(String(raw).trim());
  if (!m) return null;
  let y = parseInt(m[3], 10); if (y < 100) y += y >= 70 ? 1900 : 2000;
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// ---- column auto-detection (override with flags) ----
function find(aliases) { return headers.find((h) => aliases.some((a) => h.includes(a))); }
const col = {
  date:   flag("date")   ?? find(["תאריך ערך", "ת. ערך", "תאריך", "value", "date"]),
  amount: flag("amount") ?? find(["סכום", "amount"]),
  debit:  flag("debit")  ?? find(["חובה", "debit"]),
  credit: flag("credit") ?? find(["זכות", "credit"]),
  desc:   flag("desc")   ?? find(["תיאור", "פרטים", "תנועה", "שם", "narrative", "description", "details", "memo", "payee"]),
  ref:    flag("ref")    ?? find(["אסמכתא", "אסמכתה", "reference", "ref"]),
};

console.log("\n=== HEADERS DETECTED (this is OB-4 — paste these back to me) ===");
headers.forEach((h, i) => console.log(`  [${i}] ${h}`));
console.log("\n=== COLUMN MAPPING USED (override with --date / --amount / --debit / --credit / --desc) ===");
for (const [k, v] of Object.entries(col)) console.log(`  ${k.padEnd(7)} -> ${v ?? "(not found)"}`);

// ---- parse rows ----
const rows = lines.slice(1).map((l) => { const c = splitCells(l); const o = {}; headers.forEach((h, i) => (o[h] = (c[i] ?? "").trim())); return o; });
let ok = 0, bad = 0, inflow = 0n, outflow = 0n;
const counterparties = new Map();
const sample = [];
for (const r of rows) {
  const d = parseILDate(col.date ? r[col.date] : "");
  let amt = null;
  if (col.amount && r[col.amount]) amt = parseAmountCents(r[col.amount]);
  else {
    const dr = col.debit ? parseAmountCents(r[col.debit]) : null;
    const cr = col.credit ? parseAmountCents(r[col.credit]) : null;
    if (cr != null || dr != null) amt = (cr ?? 0n) - (dr ?? 0n);   // inflow positive
  }
  const cp = cleanCounterparty(col.desc ? r[col.desc] : "");
  if (d && amt != null) {
    ok++;
    if (amt >= 0n) inflow += amt; else outflow += -amt;
    if (cp) counterparties.set(cp, (counterparties.get(cp) ?? 0n) + (amt < 0n ? -amt : amt));
    if (sample.length < 12) sample.push({ d, amt, cp, raw: col.desc ? r[col.desc] : "" });
  } else bad++;
}
const ils = (c) => (Number(c) / 100).toLocaleString("he-IL", { minimumFractionDigits: 2 });

console.log(`\n=== PARSED ${ok}/${rows.length} rows  (failed: ${bad}) ===`);
console.log("date        amount ₪        counterparty (normalized)            raw");
console.log("-".repeat(90));
for (const s of sample) {
  const sign = s.amt >= 0n ? "+" : "-";
  console.log(`${s.d}  ${(sign + ils(s.amt < 0n ? -s.amt : s.amt)).padStart(13)}   ${(s.cp || "—").padEnd(34).slice(0, 34)} ${s.raw.slice(0, 22)}`);
}
console.log("-".repeat(90));
console.log(`inflow:  +₪${ils(inflow)}    outflow: -₪${ils(outflow)}    net: ₪${ils(inflow - outflow)}`);
const top = [...counterparties.entries()].sort((a, b) => Number(b[1] - a[1])).slice(0, 5);
console.log("\ntop counterparties by volume:");
for (const [name, vol] of top) console.log(`  ₪${ils(vol).padStart(12)}  ${name}`);
console.log("\nNothing was stored or sent. This is read-only. If columns look wrong, re-run with --flags above.\n");
