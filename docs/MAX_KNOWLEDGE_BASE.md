# בסיס ידע למקס — Max Onboarding Canon

> **למי:** מקס (Cursor Cloud / Grok cortex) וכל סשן עתידי שצריך להתחבר לעניינים מא' עד ת'.
> **מתי לקרוא:** בתחילת כל סשן. זה ה-digest. הפרטים המלאים חיים ב-branch
> `claude/capability-extensions-collection-JjV2s` תחת `research/` — במיוחד `BRAIN.md`.
> **עודכן:** 2026-07-11 · ריצת ענן `bc-df5ef7ee-734d-4460-b339-aa78c363634e` ("בסיס ידע למקס").

---

## 0 — מי זה מי

| | |
|---|---|
| **ברק ברזל** | בעלים · `barak-barzel@barak-e.com` · B.E.E (Barak Electric Engineering) |
| **העסק** | קבלנות חשמל + סולאר בישראל: ~137 לקוחות · 255 אתרים · 18 רכבים · 149 ממירים ב-87+ אתרים מנוטרים |
| **בנק** | Mercantile Discount — **קוד 17** (לא הפועלים — שיעור שנצרב) |
| **חשבוניות/הנה״ח** | Invoice Maven בלבד (אין Hashavshevet/Rivhit/Priority) |
| **שפה** | עברית ב-WhatsApp / UI · אנגלית בקונסולה (RTL נשבר בטרמינל) |
| **סגנון** | ישיר, בלי מילוי · לחקור לפני שמציעים · הנדסה קודם (לא רק ניהול) |
| **מקס** | ה-cortex הזה (Cursor Cloud). ריצה נוכחית: [בסיס ידע למקס](https://cursor.com/agents/bc-df5ef7ee-734d-4460-b339-aa78c363634e) |

---

## 1 — חוקים חוקתיים (לא לדרוס)

1. **Law #1 — 4 יעדי WhatsApp בלבד:** self-chat של ברק (`+972509554483`) · קבוצת Neri (סיכומים מתוזמנים) · קבוצת drafts · קבוצת voice-transcripts. **אסור לשלוח ללקוח/ספק/צד ג׳.**
2. **Law #2 — אדם בוחר.** כל פעולה שנוגעת ביחסים אמיתיים = טיוטה שברק מאשר. לא auto-fire.
3. **§3.6a — לא להמציא עובדות מפעיל.** בנק, נתיב, ספק, סף, פורט — מהקנון או `[OPEN]` + שאלה.
4. **Trust tiers:** L0 קריאה · L1 כתיבת DB + טיוטה · L2 שליחה אוטומטית צרה ומאושרת מראש. רוב הסוכנים = L1.
5. **Tier-0 בטיחות:** `wire_sizing` + `protection_coordination` — **בלי LLM לעולם.** הזיה על גודל כבל = שריפה.

---

## 2 — איפה האמת חיה (סדר קריאה)

ה-repo `bee-assets` על `main` הוא **נכסים ציבוריים** (לוגואים + דוח מלאי). הידע האמיתי נמצא ב-branch המחקר:

**Branch קנוני:** `claude/capability-extensions-collection-JjV2s` · **PR #2** (OPEN)

| קובץ | תפקיד |
|---|---|
| `research/BRAIN.md` | **נקודת הכניסה** — מפת כל הפרויקט, סטטוס, פגמים, מה הבא |
| `research/AGENT_CANON.md` | Digest חד-מסך לכל המוחות (Alfred/Hermes/Claude/Max) |
| `research/protocol_hive.md` | חוקת הכוורת v2 — Tiers, locks, LLD shape §7 |
| `research/PATHS.md` | טופולוגיית המכונה — **לעולם לא לנחש נתיב** |
| `research/phase-3/decisions-2026-06-16.md` | 10 החלטות נעולות (LD-1..5, EA-1..5) |
| `research/phase-3/mvp-build-plan.md` | Roadmap סמכותי — שורות, שעות, חוסמים |
| `research/phase-3/Wave_53_Unified_Data_Spine.md` | מפת העמוד השדרה 53/A–D + 54/55 |
| `research/knowledge-base/` | רגולציה ישראלית — כל טענה עם VERIFIED/OPEN |
| `research/session-handoff*.md` | העברות סשן (מאי–יוני 2026) |

**קריאה מהירה בסשן חדש:**
```
git show origin/claude/capability-extensions-collection-JjV2s:research/BRAIN.md
git show origin/claude/capability-extensions-collection-JjV2s:research/AGENT_CANON.md
git show origin/claude/capability-extensions-collection-JjV2s:research/PATHS.md
```

---

## 3 — ארכיטקטורת הכוורת (במשפט)

```
WhatsApp (טלפון אחד)
    → Layer 1 TRANSPORT (Hermes bridge, port ~3100)
        → Layer 2 PERSONA — Alfred/OpenClaw (WhatsApp voice, AGENTS.md, cron, drafts)
        → Layer 3 BRAIN — Hermes (tools כבדים, MoA, memory, kanban)
            ↔ MCP bus משותף (Monday, Google, Israeli MCPs)
```

**Alfred** = persona + שליחה חוקתית · **Hermes** = כלים כבדים · כל פלט WA עובר דרך Alfred.

### סוכנים / גלים

| Wave | רכיב | LLD | קוד | הערה |
|---|---|---|---|---|
| 53/A | bank-receipts (Mercantile) | ✅ | ✅ Phase A | importer אמיתי |
| 53/B | procurement-tracking | ✅ | ✅ Phase A + price-anomaly | anomaly detector נבדק 7/7 |
| 53/C | proposal-generator | ✅ | ❌ | |
| 53/D | accounting-ledger | ✅ | ❌ | כרטסות/AR-AP/VAT חודשי |
| 54 | engineering-agent (PV brain) | ✅ | partial specs | wire/protection = Tier-0 |
| 55 | customer-success | ✅ | ❌ | |
| — | regulatory / tender | skill | חי / spec | |
| — | Alfred + Hermes | — | חי | |

**קו כנות:** היום המערכת היא **importer + normalizer + validator** דטרמיניסטי + price-anomaly. שכבת ה-"חכם" (LLM extraction, lead-time learning, fault grounding) = מתוכננת, לא מקודדת.

---

## 4 — החלטות נעולות (לא לפתוח מחדש)

| ID | החלטה |
|---|---|
| LD-1 | Invoice Maven = חשבוניות + הנה״ח. בלי גשר למערכות אחרות |
| LD-2 | מקדמות מס הכנסה = **0%** |
| LD-3 | מע״מ = **חודשי** |
| LD-4 | מספור חשבוניות רציף, בלי איפוס שנתי |
| LD-5 | יתרות פתיחה מ-IM (idempotent `IM-OPENING-${id}`) |
| EA-1 | טבלאות כבלים multi-vendor |
| EA-2 | יחס DC/AC לפי דגם ממיר |
| EA-3 | בחירת ממיר = try-all + top-3 |
| EA-4 | הצללה = Vision LLM על תמונות אתר (≥1 חובה) |
| EA-5 | fault_analysis מעוגן ב-`FaultCase` (pg_trgm לפני DeepSeek) |

---

## 5 — מכונת ברק (נתיבים קנוניים)

| מה | נתיב |
|---|---|
| Alfred scripts (`alfred-*.js`) | `E:\Desktop\OpenClawAgent\` (שורש — **אין** `scripts\` / `workspace\`) |
| OpenClaw workspace | `C:\Users\Barak\.openclaw\workspace\` |
| Hermes repo | `E:\bee-hermes\` |
| Hermes state | `C:\Users\Barak\AppData\Local\hermes\` |
| Secrets | `E:\Desktop\OpenClawAgent\secrets\bee-integrations.env` |
| Obsidian vault | `E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\` · BEE ב-`3-Projects\BEE\` |
| פרויקטים | `E:\bee-hive`, `E:\bee-build`, `E:\bee-assets`, `E:\bee-ai-watcher` |
| BEE app (Drive) | `K:\האחסון שלי\BEE_Operations` |
| bee-prod-1 | `/opt/bee-ops` (Hetzner CX52) |

**נתיבים שגויים ידועים:** כל וריאציה של `OpenClawAgent\workspace\` או `OpenClawAgent\scripts\` — לא קיימים.

**פורטים:** Alfred ≈3000 · Hermes ≈3100 · n8n 5678 · Redis 6379.

---

## 6 — ריצות Cloud Agents (נכון ל-2026-07-11)

| bcId | שם | סטטוס | מה קרה |
|---|---|---|---|
| `bc-df5ef7ee-...` | בסיס ידע למקס | RUNNING | הריצה הזו — איסוף זיכרון + מסמך זה |
| `bc-68ffc151-...` | מידול תלת-ממדי רחפן | IDLE | Design-first; ממתין לאישור מלווה ויזואלי; **אין קוד** |

סביבה: Personal `Barak-B/bee-assets` · egress פתוח · Notion/Monday/GitLab MCP = **needsAuth** (לא מחוברים עדיין).

---

## 7 — ענפים ו-PRs פעילים

| PR | Branch | מצב | תוכן |
|---|---|---|---|
| #2 | `claude/capability-extensions-collection-JjV2s` | OPEN | **הקנון המלא** — ~224 קבצי research, LLDs, phase-a, graphify |
| #1 | `claude/electron-chat-integration-5VtHN` | DRAFT | `master-plan.html` scaffold |
| #3 | `cursor/folder-inventory-html-436d` | MERGED | דוח מלאי RTL → `main` |
| #4 | אותו branch | OPEN | גרסה self-contained + docs/index |
| #5 | `cursor/brain-obsidian-bridge-436d` | DRAFT | חיבור BRAIN↔Obsidian + sync hardening |
| #6 | `cursor/setup-dev-environment-7dda` | DRAFT | `AGENTS.md` ל-Cursor Cloud |

---

## 8 — מה באמת רץ מול מה מתוכנן

**✅ אמיתי בקוד (נבדק):**
- Dedup קשיח + fuzzy (pg_trgm > 0.85)
- Distributed lock Redis→PG, UoW אטומי
- Validation circuit, Hebrew normalize, CSV→PO
- Price-anomaly detector (z-score, 7/7 pure tests)
- Demo: `parse-bank-csv.mjs` (read-only על דאטה אמיתי)
- Graphify על מכונת ברק (אלפי nodes; DeepSeek backend)
- Alfred + Hermes חיים על Windows

**🟡 מתוכנן בלבד:**
- LLM extraction מאימייל/WA/PDF → PO
- err_manifest read-back
- LeadTimeRecord learning
- FaultCase grounding
- 53/C, 53/D, Wave 55 code
- Canon → Alfred/Hermes runtime sync (payload מוכן; wiring ממתין לאישור ברק)

---

## 9 — חוסמים אצל ברק (artifact dropoffs)

| # | קובץ | משחרר |
|---|---|---|
| OB-1 | PDFs טבלאות כבלים | Wave 54 Phase B |
| OB-2 | דוגמת export מ-Invoice Maven | 53/D opening balances |
| OB-3 | 3–5 מקרי תקלה סגורים | Wave 54 FaultCase seed |
| OB-4 | כותרות CSV אמיתיות מ-Mercantile | 53/A live bank |
| OB-5 | משקלות health (אופציונלי) | Wave 55 |

---

## 10 — פערים שמקס צריך לדעת

1. **`main` ≠ הקנון.** הקנון על branch Claude / PR #2. אל תבנה על `main` כאילו יש שם research.
2. **Cloud לא מגיע ל-`E:\` / Obsidian.** כתיבה מקומית = סשן מקומי או הנחיות לברק.
3. **MCP חיצוניים:** Notion / Monday / GitLab דורשים auth מהמשתמש ב-Cursor.
4. **Canon drift:** `AGENT_CANON` + sync script קיימים, אבל Alfred/Hermes עדיין לא קוראים אותם ב-startup (ממתין לאישור חוקתי).
5. **Hermes bridge_port 3000** מתנגש עם Alfred — להעביר ל-3100 לפי protocol.
6. ריצת "מידול רחפן" פתוחה וממתינה — לא לערבב עם עבודת הכוורת בלי בקשה מפורשת.

---

## 11 — איך מקס עובד מכאן

1. קרא את הקובץ הזה → אחר כך `BRAIN.md` מה-branch הקנוני.
2. לפני כל נתיב מקומי → `PATHS.md`. לפני ledger/הנדסה → `decisions-2026-06-16.md`.
3. לפני עיצוב רכיב → `protocol_hive.md` §7 (צורת LLD מחייבת).
4. אל תמכור יכולת שלא בקוד — ראה §8 ו-`BRAIN` §4b.
5. שינוי ארכיטקטוני → עדכן `BRAIN.md` + ה-LLD באותו commit; graphify extract מקומי.
6. עדיפות build (כשאין dropoffs): **mvp-build-plan row 8** — skeleton של Wave 54 orchestrator.
7. העדפת ברק: סוכני **הנדסה** (חישובים, PV, תקנים, BOM) לפני סוכני ניטור עסקי.

---

## 12 — זיכרון אישי של ברק (מה-USER.md של Hermes)

- עדיפויות כפולות: לגדל את העסק **וגם** לבנות את BEE SaaS.
- WhatsApp מפוענח (~890MB, מאי 2026) — רוצה Obsidian לתיעוד/צ׳אטים.
- V2.0 של משהו הושלם (דירוג 9/10).
- מחקר לפני הצעה במשימות מורכבות.
- על WhatsApp — עברית כברירת מחדל.

---

## 13 — מפת תוכן המחקר (על branch Claude)

```
research/
  BRAIN.md, AGENT_CANON.md, protocol_hive.md, PATHS.md
  phase-1/          ← Alfred scripts, tender MVP, bridge recovery, commands
  phase-2/          ← Neo4j, bee-mcp-server skeleton, sites mapping
  phase-3/          ← LLDs 53/A-D + 54 + 55, decisions, MVP plan, spine
  knowledge-base/   ← IL solar/regulation/einvoicing + skills audit
  graphify-deployment/ + graphify-out/
  gitnexus-deployment/
  local-state/      ← snapshots חיים של Alfred + Hermes (redacted)
  demos/            ← parse-bank-csv, price-anomaly
  scripts/          ← sync vault/graphify, hooks, connect-brain-to-obsidian
  *.html            ← מפות ויזואליות (hive, architecture, inventory, learning)
```

~224 קבצים · עשרות אלפי שורות מחקר + קוד ייחוס.

---

*מסמך זה נכתב ע״י מקס ב-2026-07-11 כחלק מפתיחת ה-cortex למקסימום הקשר.
כשהקנון על branch Claude מתעדכן — עדכן גם את הסעיפים כאן, או הפנה במפורש ל-`BRAIN.md` כמקור סטטוס.*
