// alfred-identity-roster-patch.js — Phase 1 Action #4
//
// Adds Source 0 (roster.yaml) to alfred-identity.js's resolution cascade.
// Roster is HIGHEST priority — confidence 0.99 — because it's hand-curated.
//
// USAGE — Barak: do NOT replace alfred-identity.js. Instead:
//   1. Review this file.
//   2. Apply the 3 edits described in the "WIRING INSTRUCTIONS" block at bottom.
//   3. Run the tests below.
//
// DEPENDENCY:
//   js-yaml is NOT installed in C:\Users\Barak\.openclaw\workspace\node_modules
//   or E:\Desktop\OpenClawAgent\node_modules. This patch ships a minimal pure-JS
//   YAML reader (handles the roster.yaml subset only — no anchors, no flow style).
//   If you `npm i js-yaml` in OpenClawAgent later, the patch auto-detects and uses it.
//
// PATH:
//   Roster lives at C:\Users\Barak\.openclaw\workspace\roster.yaml
//   (same WORKSPACE constant alfred-identity.js already uses for contacts.md)

const fs = require("fs");
const path = require("path");
const os = require("os");

const WORKSPACE = path.join(os.homedir(), ".openclaw", "workspace");
const ROSTER_FILE = path.join(WORKSPACE, "roster.yaml");

// ============================================================
// YAML loader (js-yaml if available, else minimal in-house parser)
// ============================================================

function loadRoster() {
  if (!fs.existsSync(ROSTER_FILE)) return null;
  const text = fs.readFileSync(ROSTER_FILE, "utf8");
  // Fast path — js-yaml if installed
  try {
    const yaml = require("js-yaml");
    return yaml.load(text);
  } catch (_) {
    // Fallback — minimal parser for our flat-ish roster format
    return parseRosterYaml(text);
  }
}

// Minimal YAML parser tailored to roster.yaml structure.
// Supports: top-level scalars, top-level mappings, top-level lists of mappings,
// nested 1-level lists (specialties / tags / common_sites / calendars).
// Does NOT support: anchors, flow style, multi-line strings, block scalars.
function parseRosterYaml(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  let currentKey = null;        // top-level key
  let currentValue = null;      // built-up value (object | array)
  let listItem = null;          // current list item being built
  let listInnerKey = null;      // current key inside list item being filled (for inline arrays)

  function commit() {
    if (currentKey !== null) out[currentKey] = currentValue;
    currentKey = null;
    currentValue = null;
    listItem = null;
    listInnerKey = null;
  }

  function parseScalar(s) {
    const t = s.trim();
    if (t === "" || t === "null" || t === "~") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    // Strip surrounding quotes
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  }

  function parseInlineArray(s) {
    // [a, b, c]
    const inner = s.trim().slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(x => parseScalar(x));
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Strip trailing comments (only when # is preceded by space or line-start, AND not inside quotes)
    let line = raw;
    if (line.includes("#")) {
      // Strip trailing comment, respecting quoted regions.
      let inQuote = null;
      let cut = -1;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (inQuote) {
          if (ch === inQuote) inQuote = null;
        } else if (ch === '"' || ch === "'") {
          inQuote = ch;
        } else if (ch === "#" && (j === 0 || /\s/.test(line[j - 1]))) {
          cut = j; break;
        }
      }
      if (cut >= 0) line = line.slice(0, cut);
    }
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const content = line.trim();

    if (indent === 0) {
      // Top-level: "key:" or "key: value"
      commit();
      const colon = content.indexOf(":");
      if (colon < 0) continue;
      currentKey = content.slice(0, colon).trim();
      const rest = content.slice(colon + 1).trim();
      if (rest === "") {
        currentValue = null; // determined by next line (list vs mapping)
      } else if (rest.startsWith("[")) {
        currentValue = parseInlineArray(rest);
      } else {
        currentValue = parseScalar(rest);
      }
    } else if (indent === 2) {
      if (content.startsWith("- ")) {
        // Start of a new list item
        if (!Array.isArray(currentValue)) currentValue = [];
        listItem = {};
        listInnerKey = null;
        currentValue.push(listItem);
        const itemFirst = content.slice(2).trim();
        const colon = itemFirst.indexOf(":");
        if (colon > 0) {
          const k = itemFirst.slice(0, colon).trim();
          const v = itemFirst.slice(colon + 1).trim();
          if (v === "") {
            listInnerKey = k;
            listItem[k] = null;
          } else if (v.startsWith("[")) {
            listItem[k] = parseInlineArray(v);
          } else {
            listItem[k] = parseScalar(v);
          }
        }
      } else {
        // 2-indent non-list line: continuation of a top-level mapping (object value)
        if (currentValue === null || Array.isArray(currentValue)) {
          currentValue = (typeof currentValue === "object" && !Array.isArray(currentValue) && currentValue) ? currentValue : {};
        }
        const colon = content.indexOf(":");
        if (colon < 0) continue;
        const k = content.slice(0, colon).trim();
        const v = content.slice(colon + 1).trim();
        if (v === "") {
          currentValue[k] = null;
        } else if (v.startsWith("[")) {
          currentValue[k] = parseInlineArray(v);
        } else {
          currentValue[k] = parseScalar(v);
        }
      }
    } else if (indent === 4 && listItem) {
      // Keys inside the current list item
      if (content.startsWith("- ")) {
        // Nested list value (e.g. represents_customers: \n      - foo)
        if (listInnerKey) {
          if (!Array.isArray(listItem[listInnerKey])) listItem[listInnerKey] = [];
          listItem[listInnerKey].push(parseScalar(content.slice(2)));
        }
        continue;
      }
      const colon = content.indexOf(":");
      if (colon < 0) continue;
      const k = content.slice(0, colon).trim();
      const v = content.slice(colon + 1).trim();
      if (v === "") {
        listInnerKey = k;
        listItem[k] = null;
      } else if (v.startsWith("[")) {
        listItem[k] = parseInlineArray(v);
        listInnerKey = null;
      } else {
        listItem[k] = parseScalar(v);
        listInnerKey = null;
      }
    } else if (indent === 6 && listItem && listInnerKey && content.startsWith("- ")) {
      // Nested list under a list-item key (6-space indent)
      if (!Array.isArray(listItem[listInnerKey])) listItem[listInnerKey] = [];
      listItem[listInnerKey].push(parseScalar(content.slice(2)));
    }
    // Other indents: ignore (we don't support deeper nesting in this minimal parser)
  }
  commit();
  return out;
}

// ============================================================
// Cache loaded roster in memory (re-read on file change)
// ============================================================
let ROSTER_CACHE = null;
let ROSTER_MTIME = 0;

function getRoster() {
  if (!fs.existsSync(ROSTER_FILE)) return null;
  const mtime = fs.statSync(ROSTER_FILE).mtimeMs;
  if (!ROSTER_CACHE || mtime !== ROSTER_MTIME) {
    ROSTER_CACHE = loadRoster();
    ROSTER_MTIME = mtime;
  }
  return ROSTER_CACHE;
}

// ============================================================
// Phone normalization — must match alfred-identity.js semantics
// ============================================================
function normalizePhone(input) {
  if (!input) return null;
  let s = String(input).replace(/[\s\-()]/g, "").trim();
  s = s.replace(/^\+/, "").replace(/^00/, "");
  if (/^0[2-9]\d{7,8}$/.test(s)) s = "972" + s.slice(1);
  if (!/^\d+$/.test(s)) return null;
  return s;
}

function normalizeEmail(input) {
  if (!input) return null;
  return String(input).trim().toLowerCase();
}

// ============================================================
// PUBLIC API
// ============================================================

const CATEGORIES = [
  "employees",
  "contractors",
  "external_inspectors",
  "suppliers",
  "key_customers",
  "customer_contacts",
  "tender_contacts",
];

/**
 * Resolve a phone → roster person.
 * Accepts: "+972...", "972...", "05...", JID — all normalized internally.
 * Returns: { category, person, confidence, method } or null.
 */
function resolvePhone(phoneOrJid) {
  const roster = getRoster();
  if (!roster) return null;
  // Accept JID
  const cleaned = String(phoneOrJid || "").replace(/@.*$/, "");
  const target = normalizePhone(cleaned);
  if (!target) return null;
  // Self check first
  if (roster.self && roster.self.phone_normalized === target) {
    return {
      category: "self",
      person: roster.self,
      confidence: 0.99,
      method: "roster-self-phone",
    };
  }
  for (const cat of CATEGORIES) {
    const list = roster[cat] || [];
    for (const p of list) {
      const cand = p.phone_normalized || normalizePhone(p.phone) || normalizePhone(p.primary_contact_phone);
      if (cand && cand === target) {
        return {
          category: cat,
          person: p,
          confidence: 0.99,
          method: "roster-phone",
        };
      }
    }
  }
  return null;
}

/**
 * Resolve an email → roster person.
 */
function resolveEmail(email) {
  const roster = getRoster();
  if (!roster) return null;
  const target = normalizeEmail(email);
  if (!target) return null;
  if (roster.self) {
    if (normalizeEmail(roster.self.email_primary) === target || normalizeEmail(roster.self.email_secondary) === target) {
      return { category: "self", person: roster.self, confidence: 0.99, method: "roster-self-email" };
    }
  }
  for (const cat of CATEGORIES) {
    const list = roster[cat] || [];
    for (const p of list) {
      const candidates = [p.email, p.email_secondary, p.reportEmail].filter(Boolean).map(normalizeEmail);
      if (candidates.includes(target)) {
        return { category: cat, person: p, confidence: 0.99, method: "roster-email" };
      }
    }
  }
  return null;
}

/**
 * Resolve a JID → roster person. Strips @suffix and uses phone match.
 */
function resolveJid(jid) {
  return resolvePhone(jid);
}

/**
 * Resolve a name (Hebrew or English, substring match) → roster person.
 * Returns null if 0 or 2+ matches (ambiguous).
 */
function resolveName(text) {
  const roster = getRoster();
  if (!roster) return null;
  if (!text) return null;
  const needle = String(text).toLowerCase().trim();
  if (!needle) return null;
  const hits = [];
  for (const cat of CATEGORIES) {
    const list = roster[cat] || [];
    for (const p of list) {
      const heMatch = p.name_he && p.name_he.toLowerCase().includes(needle);
      const enMatch = p.name_en && p.name_en.toLowerCase().includes(needle);
      const nameMatch = p.name && p.name.toLowerCase().includes(needle);
      const contactMatch = p.primary_contact_name && p.primary_contact_name.toLowerCase().includes(needle);
      if (heMatch || enMatch || nameMatch || contactMatch) {
        hits.push({ category: cat, person: p });
      }
    }
  }
  // Self
  if (roster.self) {
    if ((roster.self.name_he || "").toLowerCase().includes(needle) ||
        (roster.self.name_en || "").toLowerCase().includes(needle)) {
      hits.push({ category: "self", person: roster.self });
    }
  }
  if (hits.length === 1) {
    return { ...hits[0], confidence: 0.95, method: "roster-name" };
  }
  if (hits.length > 1) {
    return { category: "ambiguous", candidates: hits, confidence: 0.50, method: "roster-name-ambiguous" };
  }
  return null;
}

module.exports = {
  getRoster,
  resolvePhone,
  resolveEmail,
  resolveJid,
  resolveName,
  // exposed for tests
  _parseRosterYaml: parseRosterYaml,
  _normalizePhone: normalizePhone,
};

// ============================================================
// CLI smoke test
//   node alfred-identity-roster-patch.js +972509554483
//   node alfred-identity-roster-patch.js "רפאל"
//   node alfred-identity-roster-patch.js shlomi@barak-e.com
// ============================================================
if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node alfred-identity-roster-patch.js <phone|email|name|jid>");
    process.exit(2);
  }
  let r;
  if (arg.includes("@") && !arg.includes("@s.whatsapp.net") && !arg.includes("@g.us")) {
    r = resolveEmail(arg);
  } else if (/^\+?\d|@s\.whatsapp\.net/.test(arg)) {
    r = resolvePhone(arg);
  } else {
    r = resolveName(arg);
  }
  console.log(JSON.stringify(r, null, 2));
}

// ============================================================
// WIRING INSTRUCTIONS — to apply in alfred-identity.js
// ============================================================
//
// EDIT 1 — Add require near the top (after the existing `const os = require("os");`):
//
//     const roster = require("./alfred-identity-roster-patch.js");
//
//   (Place this patch file next to alfred-identity.js — i.e. in
//    E:\Desktop\OpenClawAgent\)
//
// EDIT 2 — In the `resolve()` function, insert Source 0 BEFORE the existing
// "1. BEE phone" block (around line 330). Add this block:
//
//     // 0. Roster (hand-curated, highest confidence)
//     if (phoneNorm) {
//       const m = roster.resolvePhone(phoneNorm);
//       if (m) result.matches.push({ source: "roster", confidence: m.confidence, method: m.method, category: m.category, person: m.person });
//     }
//     if (emailNorm) {
//       const m = roster.resolveEmail(emailNorm);
//       if (m) result.matches.push({ source: "roster", confidence: m.confidence, method: m.method, category: m.category, person: m.person });
//     }
//
// EDIT 3 — In the name-fallback block (around line 360), prepend a roster name lookup:
//
//     const nameToTry = name || pushName;
//     if (nameToTry && result.matches.length === 0) {
//       const rosterM = roster.resolveName(nameToTry);
//       if (rosterM && rosterM.category !== "ambiguous") {
//         result.matches.push({ source: "roster", confidence: rosterM.confidence, method: rosterM.method, category: rosterM.category, person: rosterM.person });
//       }
//       // ... existing BEE + Monday name lookups remain below ...
//
// EDIT 4 — Extend `inferRelationship()` (around line 385) to map roster categories:
//
//     if (match.source === "roster") {
//       switch (match.category) {
//         case "self":              return "self";
//         case "employees":         return "employee";
//         case "contractors":       return "contractor";
//         case "external_inspectors": return "inspector";
//         case "suppliers":         return "supplier";
//         case "key_customers":     return "client";
//         case "customer_contacts": return "customer-contact-person";
//         case "tender_contacts":   return "tender-contact";
//         default:                  return "roster-person";
//       }
//     }
//
// AFTER APPLYING — run these tests:
//
//   node alfred-identity.js resolve --phone +972509554483
//     # Expected: bestMatch.source === "roster", relationship === "self"
//
//   node alfred-identity.js resolve --phone +972557257516
//     # Expected: bestMatch.source === "roster", relationship === "employee"
//     #           (Shlomi Shirazi)
//
//   node alfred-identity.js resolve --email lederbergneri@gmail.com
//     # Expected: bestMatch.source === "roster", relationship === "employee"
//     #           (Neri Lederberg)
//
//   node alfred-identity.js resolve --name "רפאל"
//     # Expected: bestMatch.source === "roster", relationship === "client"
//     #           (Rafael Solar)
//
//   node alfred-identity.js resolve --phone +972533334119
//     # Expected: bestMatch.source === "roster", relationship === "tender-contact"
//     #           (Yaron Yuze, אסם הגליל)
//
// ROLLBACK — if anything misbehaves, simply remove the require + the 3 inserted
// blocks. The original cascade (BEE → Monday → contacts.md → site-groups → name)
// continues to function unchanged.
