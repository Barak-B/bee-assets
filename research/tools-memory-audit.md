# Alfred + Hermes — Tools & Memory Completeness Audit

**תאריך:** 2026-05-27 · **מצב:** read-only audit (לא שונה קוד/קונפיג, לא הופעל שירות)
**מקורות שנקראו:** `E:\Desktop\OpenClawAgent\alfred-*.js` (כותרות), `alfred-swarm.js` (מלא), `C:\Users\Barak\AppData\Local\hermes\config.yaml`, plugin manifests, `~/.openclaw/workspace`, `E:\bee-archive`.

**ההנחיה (הכוורת):** Alfred = המוח (שפה/חשיבה/מדיה). Hermes = תחבורה + כלים כבדים + זיכרון.

---

> **עדכון 2026-05-27 (אחרי הביקורת — הפער נסגר):** הביקורת למטה היא צילום-מצב לפני הבנייה. מאז: `alfred-archive.js` + `E:\bee-data` **נבנו, נבדקו (8/8) ומחווטים ל-watcher** — כל ארטיפקט (תמונה/PDF/אודיו+תמלול/שיחה/סיכום) נשמר ב-`E:\bee-data` ונרשם ב-`index.jsonl`. כמו כן `alfred-pdf` **כן מחווט** ל-`alfred-handle.js` (Step 1.0, שורה 79) — הסימון ⚠️ בטבלה היה שגוי ותוקן.

## פסק דין (Headline Verdict)

**Brain + Transport + Memory-for-reasoning = שלם. Cold-storage archive = חסר לגמרי.**

מחזור החיים ingest→classify→enrich→compose→clarify→output→learn מכוסה במלואו עם מודול בעלים + שכבת זיכרון לכל שלב. אבל שני השלבים שהמשימה הדגישה — **media-preprocess** (אוטומטי, מחווט) ו-**archive** (אחסון קר מאורגן של כל ארטיפקט + `index.jsonl`) — **אינם קיימים כמודול חי**. `alfred-archive.js` ו-`E:\bee-data` **לא קיימים**. היכולת "store ALL company data in organized folders" **לא ממומשת**.

---

## 1. Alfred Tools — מודולים ב-`E:\Desktop\OpenClawAgent\`

| מודול | תפקיד (מכותרת הקובץ) | שלב מחזור-חיים |
|---|---|---|
| `alfred-handle.js` | Entry point: INGEST→INTENT→ENRICH→COMPOSE→envelope. לא שולח. | אורקסטרציה |
| `alfred-router.js` | מסווג כוונה (10 intents) + entity hints + urgency. Few-shot מ-`task-examples.md`. Tiered providers + fallback. | classify |
| `alfred-intake.js` | **INGEST רב-מקור** (Gmail/Calendar/Cron/Manual) → סכמת event אחת → work-ledger → handle. WhatsApp עובר בנפרד דרך watcher. | ingest |
| `alfred-inbound-watcher.js` | Keystone: drain של גשר Hermes (:3000) → handle/voice-action → resolveOutbound (4 יעדים בלבד) → POST /send. | ingest + output |
| `alfred-enrich.js` | Fan-out מקבילי לפי-intent ל-BEE DB / monitoring / calendar / `sites/*.md`. | enrich |
| `alfred-compose.js` | Renderer של תבניות `templates/<intent>.md` (Mustache-lite) → טיוטה עברית. | compose |
| `alfred-clarify.js` | החלטה אם לשאול שאלת הבהרה; לוג few-shot; TASKS.md; תזכורת יומן. | clarify |
| `alfred-correction-detector.js` | מזהה תיקון של ברק (חלון דקות) → כותב `decisions.sqlite` + `task-examples.md`. | learn |
| `alfred-vision.js` | OCR + תיאור תמונה (חשבונית/תמונת אתר). Gemini 2.5 Pro. | media-preprocess |
| `alfred-pdf.js` | חילוץ טקסט PDF (pdfjs → fallback Gemini Vision). ✅ מחווט ל-`alfred-handle.js` (Step 1.0, שורה 79). | media-preprocess |
| `alfred-voice-action.js` | תמלול קולי → router → הצעת פעולה (פגישה וכו'). | media-preprocess |
| `alfred-work-ledger.js` | Tracker עמיד: received→processing→drafted→awaiting_barak→done/dropped/failed. SQLite. | lifecycle spine |
| `alfred-ledger-sweep.js` | Cron guard: צף פריטים תקועים → self-chat. dry-run by default. | lifecycle guard |
| `alfred-swarm.js` | חוזה חלוקת-העבודה (CAPABILITY_OWNER + plan()). לוגיקה טהורה. | coordination |
| **`alfred-archive.js`** | Cold storage: כל ארטיפקט → `E:\bee-data` (images/pdfs/voice/conversations/summaries) + `index.jsonl`. נבדק 8/8, מחווט ל-watcher. | archive ✅ |

**מודולים נוספים נוכחים** (data/enrich helpers, רובם בבעלות-עניינית של Hermes אך מיושמים כ-JS צד-Alfred): `alfred-bee.js`, `alfred-monday.js` / `alfred-monday-deep.js` / `alfred-monday-digest.js`, `alfred-calendar.js`, `alfred-gmail.js`, `alfred-solaredge.js`, `alfred-tracer.js`, `alfred-invoice-maven.js`, `alfred-customer360.js` / `alfred-customer-intelligence.js` / `alfred-identity.js` / `alfred-contacts-auto.js`, `alfred-knowledge.js`, `alfred-reports.js`, `alfred-deadlines.js` / `alfred-tomorrow-digest.js`, `alfred-weather.js`, `alfred-gov-rss.js` / `alfred-govmap.js`, `alfred-cost-monitor.js` / `alfred-budget-alert.js`, `alfred-heartbeat.js`, `alfred-mcp-gateway.js`, `alfred-session-parser.js`. (יש גם `*.test.js` ל-vision/pdf/correction-detector, ו-`backups/`.)

> **הערה — מנוע מדיה נסתר:** `E:\bee-archive\tools\` מכיל סקריפטים עצמאיים של preprocess מדיה (`wa-ocr-image.js`, `wa-transcribe-audio.js`, `wa-extract-pdf.js`, `wa-generate-thumbnail.js`, `wa-extract-media-meta.js`, `wa-batch-process.js` + tesseract/sharp/ffmpeg). הם **לא מחווטים** ל-pipeline של Alfred — נכס שמתאים בדיוק ל-archive שחסר.

---

## 2. Hermes Tools — מ-`config.yaml` (מה שמוגדר בפועל)

| תחום | מצב בקונפיג | פרטים |
|---|---|---|
| מודל ראשי | `deepseek-v4-pro` (provider deepseek) | vision aux = `deepseek-v4-flash` |
| Toolsets | `hermes-cli` בלבד ברמה הגלובלית | `terminal, code_execution, computer_use, file_write, delegation, cronjob, messaging` — **disabled** |
| WhatsApp transport | **enabled** | Baileys bridge port 3000; allow_from `+972509554483`; group_policy=deny |
| platform_toolsets | cli: browser, clarify, file, image_gen, kanban, **memory**, session_search, skills, todo, tts, vision, web | whatsapp→`hermes-whatsapp` |
| Memory | `provider: holographic`, `memory_enabled: true` | curator `enabled: true`, interval 168h |
| STT / TTS | STT local (whisper base); TTS edge | — |
| Web | firecrawl | — |
| Email platform | **enabled: false** | — |
| **Solar (SolarEdge/Sungrow/Tracer)** | **❌ לא מוגדר** ב-config | אין MCP server / plugin |
| **Monday.com** | **❌ לא מוגדר** | — |
| **Google Workspace / Calendar** | **❌ לא מוגדר** | — |
| **Frigate** | **❌ לא מוגדר** | — |

**מסקנה קריטית:** הכלים ה"כבדים" שהחוזה (`alfred-swarm.js`) מייחס ל-Hermes (`solar-monitoring`, `monday`, `google-workspace`, `calendar-fetch`, `tender-fetch`) **אינם מוגדרים כ-MCP servers ב-Hermes**. בפועל הם ממומשים כמודולי `alfred-*.js` בצד Alfred (`alfred-solaredge.js`, `alfred-monday*.js`, `alfred-calendar.js`, `alfred-gmail.js`, `alfred-tracer.js`). כלומר ה-data-fetch רץ בצד "המוח", לא בצד "הידיים" — **פער בין החוזה התיאורטי למימוש**. ל-Hermes מוגדר בפועל רק: WhatsApp transport + holographic memory + curator + כלי CLI גנריים (browser/web/vision/tts/stt).

> זמינים כ-manifests ב-`plugins/` (לא מאופשרים ב-config): memory providers נוספים (mem0, honcho, supermemory…), platforms (teams, google_chat, irc), spotify, image_gen. קיומם ≠ הפעלתם.

---

## 3. Memory Layers — מה / איפה / מטרה

| שכבה | מיקום | מאחסן | מצב |
|---|---|---|---|
| Learned corrections | `~/.openclaw/workspace/decisions.sqlite` | זוגות העדפה (override) שנלמדו מתיקונים | ✅ 28 KB |
| Few-shot corpus | `~/.openclaw/workspace/task-examples.md` | דוגמאות מתויגות ל-router | ✅ 946 B |
| Correction watches | `~/.openclaw/workspace/correction-watches.json` | watches ממתינים לזיהוי תיקון | ✅ 1.4 KB |
| Work ledger | `~/.openclaw/workspace/work-ledger.db` | מחזור-חיי כל בקשה (8 סטטוסים) | ✅ 24 KB |
| Daily notes | `~/.openclaw/workspace/memory/*.md` | יומני יום + `media-status.md` + cron-errors | ✅ ~14 קבצים |
| Per-site memory | `~/.openclaw/workspace/sites/` | זיכרון per-site | ⚠️ קיים אך **דליל (2 פריטים בלבד** מתוך 486 אתרים) |
| Hot preferences | `~/.openclaw/workspace/skills/self-improving/memory.md` | העדפות "חמות" | ✅ 3.9 KB |
| Holographic memory | Hermes (SQLite + FTS5, HRR retrieval) | זיכרון ארוך-טווח, trust scoring | ✅ provider=holographic, on_session_end |
| Curator | Hermes | תחזוקת/קישור ידע | ✅ enabled (168h) |
| **Cold-storage archive** | **`E:\bee-data` (מתוכנן)** | images/pdfs/voice(audio+transcript)/conversations/summaries + `index.jsonl` master index | **❌ לא קיים — לא התיקייה, לא `index.jsonl`, לא `alfred-archive.js`** |

> בדקתי `E:\bee-archive` — זו **לא** שכבת ה-archive המבוקשת: זהו dump ידני (downloads snapshot, ריפו `bee-site`, `whatsapp.db`, דוחות Q1), ללא מבנה images/pdfs/voice וללא `index.jsonl`.

---

## 4. Lifecycle → Owner Map

| שלב | מודול בעלים | סוכן | שכבת זיכרון | מצב |
|---|---|---|---|---|
| **ingest** | `alfred-inbound-watcher` (WA) · `alfred-intake` (email/cal/cron/manual) | Alfred (transport: Hermes bridge) | work-ledger (`received`) | ✅ |
| **media-preprocess** | `alfred-vision` · `alfred-pdf` · `alfred-voice-action` | Alfred | `memory/media-status.md` | ⚠️ vision/voice מחווטים; **pdf לא מחווט ל-handle** |
| **classify** | `alfred-router` | Alfred | `task-examples.md` (few-shot) | ✅ |
| **enrich** | `alfred-enrich` (+ bee/monday/calendar/solaredge…) | חוזה=Hermes · בפועל=Alfred | `sites/*.md`, holographic | ⚠️ owner-drift; sites דליל |
| **compose** | `alfred-compose` | Alfred | `templates/<intent>.md` | ✅ |
| **clarify** | `alfred-clarify` | Alfred | `pending-clarifications.json`, TASKS.md | ✅ |
| **output** | `alfred-inbound-watcher` resolveOutbound (4 יעדים) | Alfred (Hermes pipe) | work-ledger (`drafted`/`awaiting_barak`) | ✅ (dry-run default) |
| **archive** | — | — | `E:\bee-data` + `index.jsonl` | **❌ חסר לגמרי** |
| **learn** | `alfred-correction-detector` | Alfred | `decisions.sqlite` + `task-examples.md` | ✅ |
| (guard) | `alfred-ledger-sweep` | Alfred | work-ledger | ✅ |

---

## 5. Gaps & Recommendations

### פערים קריטיים (חוסמים את "execute ALL + store ALL")

1. **Archive layer לא קיים (P0).** אין `alfred-archive.js`, אין `E:\bee-data`, אין `index.jsonl`. אף ארטיפקט (תמונה/PDF/קול/שיחה/סיכום) לא נשמר באחסון קר מאורגן. זהו הפער היחיד שמפיל את שלב ה-archive במלואו ואת היעד "store ALL company data in organized folders".
   → לבנות `alfred-archive.js`: לכתוב כל ארטיפקט מ-handle/watcher ל-`E:\bee-data/{images,pdfs,voice,conversations,summaries}/YYYY/MM/` + append ל-`index.jsonl`. ניתן לעטוף את הסקריפטים הקיימים ב-`E:\bee-archive\tools\` (thumbnail/meta/ocr/transcribe) במקום לכתוב מאפס.

2. **Owner-drift: כלי Hermes הכבדים לא מוגדרים ב-Hermes (P1).** `solar-monitoring`, `monday`, `google-workspace`, `calendar-fetch`, `tender-fetch` מיוחסים ל-Hermes בחוזה אך מוגדרים בפועל כ-`alfred-*.js` בצד המוח; ב-`config.yaml` של Hermes אין להם MCP server. כלומר ה-fetch/credentials חיים בצד Alfred — בניגוד לעיקרון "המוח לא מחזיק טוקן ספק". היכולת לבצע משימות קיימת, אבל גבול האבטחה שהחוזה מבטיח אינו אכוף.
   → או לרשום את אלה כ-MCP servers ב-Hermes (יישור למימוש לעיקרון), או לעדכן את `alfred-swarm.js` שיתאר את המציאות (Alfred מבצע fetch). כיום שני המסמכים סותרים.

3. **`alfred-pdf` לא מחווט (P2).** הכותרת מצהירה "built but NOT wired into alfred-handle.js" — PDF נכנס בוואטסאפ לא עובר חילוץ אוטומטי במחזור החיים.
   → לחווט את `extractText/extractInvoice` לתוך media-preprocess ב-`alfred-handle.js`.

### פערים משניים
4. **Per-site memory דליל:** `sites/` מכיל 2 פריטים בלבד מול 486 אתרים → enrich של client-fault/status נשען על זיכרון כמעט-ריק. לאכלס מ-BEE DB.
5. **אין archive-retention/dedupe policy:** גם כשה-archive ייבנה — להגדיר מבנה תיקיות, מפתח dedupe (hash), ושדות `index.jsonl` (ts, source, type, path, sha256, intent, workItemId) מראש.

### מה שלם ועובד
מחזור החיים classify→enrich→compose→clarify→output→learn מכוסה end-to-end; work-ledger + sweep נותנים ערובת "נ��ת falls through the cracks"; שכבות הזיכרון של למידה (decisions/task-examples/corrections) + holographic + curator פעילות; חוקת ה-4-יעדים + dry-run-by-default מספקות בלימת-נזק.
