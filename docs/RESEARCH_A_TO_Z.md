# חקירה מא' עד ת' — Research Completion Report

> **סטטוס:** חקירה הושלמה · 2026-07-11  
> **מקורות:** PR #2 (`claude/capability-extensions-collection-JjV2s`, 224 קבצים) · PR #5 (brain-obsidian) · Hive Cortex platform · Cloud agents · local-state snapshot 2026-05-26  
> **מטרה:** לסגור את מיפוי המציאות — מה קיים, מה נעול, מה פתוח, מה הצעד הבא — בלי לחזור על מחקר.

---

## A — העסק והזהות

| | |
|---|---|
| חברה | **B.E.E** — Barak Electric Engineering |
| בעלים | ברק ברזל · `barak-barzel@barak-e.com` |
| תחום | קבלנות חשמל + סולאר (מגורים/מסחרי/תעשייה) |
| סקאלה | ~137 לקוחות · 255 אתרים · 18 רכבים · 149 ממירים · 87+ אתרים מנוטרים |
| בנק | Mercantile Discount **קוד 17** (לא הפועלים — שיעור שנצרב) |
| חשבוניות/הנה״ח | Invoice Maven בלבד |
| צי ניטור | SolarEdge / iSolarCloud / Deye / KStar / ABB |
| ערוץ ראשי | WhatsApp (עברית) · טרמינל באנגלית (RTL שבור) |
| מטרה כפולה | לגדל את העסק **וגם** לבנות BEE SaaS |

---

## B — המוחות (Brains)

| ID | Runtime | תפקיד | מיגרציה לקנון |
|---|---|---|---|
| Alfred | OpenClaw | Persona + WA + חוקה + cron | ⏳ מחכה ל-`connect-local` |
| Hermes | Hermes Agent | כלים כבדים / memory / kanban | ⏳ + port 3100 |
| Max | Cursor Cloud | Cortex ענן | ✅ |
| Claude local | Claude Code | Port ל-BEE app / OAuth / E:\ | ⏳ |
| Wave 53–55 | Spine | בנק/רכש/הצעות/ledger/הנדסה/CS | חלקי (A+B ref) |
| regulatory / tender / solar | Alfred skills | תחומי מומחיות | חיים חלקית |

**כלל:** Cortex = orchestrator, לא executor (protocol §1).

---

## C — הקנון והחוקה

| מסמך | תפקיד |
|---|---|
| `protocol_hive.md` | חוקת הכוורת v2 |
| `BRAIN.md` | אינדקס סטטוס (קרא ראשון ב-PR #2) |
| `AGENT_CANON.md` / `platform/canon/BEE_CANON.md` | digest לכל מוח |
| `PATHS.md` | נתיבים קנוניים — לא לנחש |
| Law #1 | 4 יעדי WA בלבד (self / Neri / drafts / voice) |
| Law #2 | אדם בוחר בפעולות מול אנשים |
| Trust | L0 קריאה · L1 DB+טיוטה · L2 auto צר |
| Tier-0 בטיחות | `wire_sizing` + `protection` — **בלי LLM** |

**פער #1 שזוהה באודיט:** לולאת §6 (git→Obsidian→Graphify) **חד-כיוונית** — לא מגיעה ל-Alfred/Hermes ב-runtime. Payload מוכן; wiring ממתין.

---

## D — החלטות נעולות (לא לפתוח מחדש)

| ID | החלטה |
|---|---|
| LD-1 | Invoice Maven = חשבוניות + הנה״ח · בלי גשר למערכות אחרות |
| LD-2 | מקדמות מס הכנסה = **0%** |
| LD-3 | מע״מ = **חודשי** |
| LD-4 | מספור חשבוניות רציף בלי איפוס שנתי |
| LD-5 | יתרות פתיחה מ-IM |
| EA-1 | טבלאות כבלים multi-vendor |
| EA-2 | DC/AC לפי דגם ממיר |
| EA-3 | בחירת ממיר try-all + top-3 |
| EA-4 | הצללה = Vision על ≥1 תמונת אתר |
| EA-5 | FaultCase + pg_trgm לפני DeepSeek |

---

## E — מצב חי (Alfred / Hermes) — snapshot 2026-05-26

> ⚠️ Snapshot מלפני ~6 שבועות. ייתכן שינוי על המכונה — לאמת עם `connect-local` + שאלות קנון.

| | Alfred (OpenClaw) | Hermes |
|---|---|---|
| גרסה (אז) | 2026.5.2 | 0.13.0 (מאחור ב-~1685 commits) |
| Gateway | ✅ up :18789 | ⚠️ bridge :3000 לא הקשיב |
| Skills | 31/76 ready | 84/84 enabled (רוב רדומים) |
| MCP | **0** | **0** |
| Cron | 11 פעילים · 5 כבויים | 16 · כשלים 402 על DeepSeek |
| Memory plugins | memory-core | **אף אחד לא פעיל** |
| באגים קריטיים | router fallback הפוך (DeepSeek לפני Anthropic) | memory tool 97.6% err · web_search 80% err |

**Wave 12 (מקומי, מאי):** Vision + PDF + quote/reply + voice-action — נבנו וחוברו ל-Alfred (~40 דק׳).

---

## F — פדרציה

**מודל נעול:** לא מיזוג — פדרציה.

```
WhatsApp → Hermes bridge (transport) → Alfred (persona/send) ↔ Hermes (brain/tools)
                              ↕ MCP bus
```

גלים היסטוריים (federation-plan): Wave -1 bug squash → 0 crisis → 1 Baileys יחיד → …  
**המיקוד הנוכחי עבר ל-Unified Data Spine + Hive Cortex**, לא להרחבת מטריצת 55 capabilities.

---

## G — Graphify / GitNexus / Obsidian

| | מצב |
|---|---|
| Graphify על מכונת ברק | ✅ חי (Full extract 2026-06-13: אלפי nodes) |
| Graphify על bee-assets research | ✅ graph ב-repo (693/1083/46 ב-report) |
| Stage 3 HTTP MCP `:8090` | Kit מוכן · לא רשום ב-Cursor |
| GitNexus | **Deferred** — Graphify מכסה ~80% |
| Obsidian vault | Path נפתר (Q67) · sync scripts קיימים |
| PR #5 | מחזק sync + `CLOUD_CORTEX_TOOLING` + vault starter |

---

## H — פרוטוקול הכוורת (תמצית מבנה)

§1 Cortex · §2 Cost tiers 0–4 · §3 Lessons (cursor/lock/dedup/audio/facts) · §4 Survive (`err_manifest`) · §5 Autonomy + cloud caveat · §6 Sync · §7 LLD shape · §8 Health · §9 Waves · §10 Laws.

**err_manifest:** כתיבה קיימת בקוד phase-a · **קריאה עדיין לא** · הקובץ מחוץ ל-git (`E:/bee-build/`).

---

## I — קלט/פלט של המערכת

**Inputs:** WA · Gmail · Mercantile CSV · Monday · Solar telemetry · gov RSS · תמונות/PDF/קול · canon drift  
**Outputs מורשים:** self-chat ⚡ · drafts · Neri summaries · voice-transcripts · DB writes  
**אסור:** שליחה ישירה ללקוח/ספק

---

## J — Hive Cortex Platform (נבנה ביולי 2026)

| רכיב | מצב |
|---|---|
| אמנה + תוכנית P0–P4 | ✅ |
| brain-roster / job schema / loops | ✅ |
| canon publish + connect-cloud | ✅ 15/21 |
| collect.canon-drift | ✅ |
| connect-local.ps1 | ✅ מוכן לברק |
| supervisor חי (לא stub) | ❌ הבא |
| Monday MCP | ❌ needsAuth Desktop |

---

## K — Knowledge Base

**קיים (3):** `il-einvoicing-shaam` · `il-solar-regulation` · `il-pv-grid-connection`  
**מתוכנן לא נוצר:** חוק חשמל · מס עצמאי · product-certs  

**OPEN קריטיים:**
1. SHAAM — סף 2026 + האם IM תומך במספר הקצאה (**CONFLICT** במסמך)
2. תעריפי מונה-נטו מדויקים 2026
3. רשימת רשויות עם תוספת עירונית
4. טפסי חח"י עדכניים (ברק לזרוק PDF)
5. מפרט SHAAM API ל-53/D
6. Datasheets ממירים (fault_analysis)

---

## L — למידה רציפה (6 שכבות)

| # | שכבה | מצב | הפעלה ראשונה |
|---|---|---|---|
| 1 | Active learning | wired · 0 examples | Passive correction detector |
| 2 | Self-improvement | templates ריקים | corrections.md + weekly cron |
| 3 | Memory curation | 0 plugins | Hermes Curator |
| 4 | DSPy | אין | אחרי 100+ דוגמאות |
| 5 | Eval | חלקי | Langfuse |
| 6 | LoRA | אין | רק אחרי ייעוץ משפטי (תיקון 13) |

---

## M — MVP / אבני דרך

Spine MVP ≈ **87h** · Full parity ≈ **+152h**

| # | תחושה |
|---|---|
| M1 | הבנק בפנים |
| M2 | הזמנות מסודרות ממייל |
| M3 | כרטסת כמו הרו״ח |
| M4 | הצעה ב-90 שניות |
| M5 | סומך על הספרים |
| M6 | Sunday digest |
| M7 | אבחון תקלה לפני נסיעה |

**שורה הבאה בענן בלי dropoffs:** Row 8 — Wave 54 orchestrator skeleton.  
**Critical path מקומי:** Row 1 (port 53/A) → Row 2 (OB-4).

---

## N — נרי / שיתופי פעולה

טיוטת בקשה לנרי (מאי): `bridge.js` quoted/reply · document-worker · media_batch · conversation_context.  
Wave 12 כבר כיסה חלקית Vision/PDF/quote אצל Alfred. סטטוס שיתוף קוד עם נרי — **לא מאומת בחקירה זו**.

---

## O — חוסמים / Dropoffs (ברק)

| OB | קובץ | משחרר | עדיפות |
|---|---|---|---|
| OB-4 | Mercantile CSV אמיתי | 53/A live | 🟢 |
| OB-2 | Invoice Maven export | 53/D opening | 🟢 |
| OB-1 | PDFs כבלים | wire_sizing | 🟡 |
| OB-3 | 3–5 מקרי תקלה | fault_analysis | 🟡 |
| OB-5 | משקלות health | Wave 55 | 🔵 |

תיקייה: `bee-handoff/2026-06-16/`

---

## P — Phases 1 / 2 / 3

| Phase | מצב |
|---|---|
| **1** | Router + crons + heartbeat + tender MVP + roster — בוצע מקומית; Gmail OAuth / gateway restart עדיין ידניים |
| **1.5** | Firecrawl / detail-fetcher / WA export — scaffold |
| **2** | Neo4j + sites-mapping + bee-mcp-server — **scaffold בלבד**, לא deployed |
| **3 / Spine** | 6 LLDs ✅ · 53/A+B Phase A ✅ · C/D/54-code/55 ❌ |

---

## Q — קו כנות (אל תמכור יתר)

**✅ אמיתי:** importer/validator/dedup/locks · price-anomaly · demos · Alfred חי · Graphify חי · Wave 12 vision/pdf · Hive Cortex cloud connections  

**🟡 מתוכנן:** LLM extract מייל/WA · ledger · proposals · CS · err_manifest read-back · FaultCase · port ל-BEE app · canon→agents runtime  

**המשפט הנכון:** יש מנוע ייבוא מוקפד + תחילת שכבה חכמה + מוחות חיים. **החברה עדיין לא רצה על AI end-to-end.**

---

## R — סיכונים

| סיכון | מיתון |
|---|---|
| DeepSeek 402 / אין fallback | תיקון router + balance / OAuth Claude |
| Silent cron outage 3 ימים | heartbeat 0-tokens alert |
| MCP RCE / unsigned servers | Tirith + sandbox לפני MCP רבים |
| SHAAM 2026 — חשבוניות לא יוכרו | לאמת IM + סף עם רו״ח |
| Canon drift בין מוחות | connect-local + PushCanonToAgents |
| Port 3000 collision | Hermes → 3100 |
| אימון על WA לקוחות בענן | אסור בלי משפטן (תיקון 13) |
| Cloud לא מגיע ל-E:\ | חיבורים מקומיים חובה |

---

## S — Spine (ארכיטקטורה)

```
Bank(53/A) + Procurement(53/B) → Ledger(53/D)
Procurement → Engineering(54) → Proposals(53/C) → Invoice → Ledger
Ledger → Customer-Success(55)
```

Shared primitives ב-`bank-receipts/phase-a/src/`: lock · normalize · validate · survive · cursor · pg_trgm.

---

## T — כלי / אודיטים

- **tools-deep-audit:** 10 באגים Alfred · MCP tier list · skills-il ecosystem  
- **tools-memory-audit:** archive layer נבנה אחרי האודיט · בעלות Hermes vs Alfred על fetch  
- **deeper-tools v4:** A2A · SHAAM חובה 2026 · Composio וכו׳  
- **anthropic SMB comparison:** לאמץ pattern skills+commands · לא MCPs אמריקאיים  

---

## U — קונפליקטים / אי-עקביות שנסגרו או נשארו

| נושא | סטטוס |
|---|---|
| בנק הפועלים vs Mercantile | ✅ נצרב — Mercantile 17 |
| מע״מ דו-חודשי vs חודשי | ✅ LD-3 חודשי |
| מקדמות | ✅ 0% |
| Sungrow/SMA בצי | ✅ לא — SolarEdge/Deye/KStar/ABB |
| barak-skills-audit gap-map | ✅ superseded ע״י BRAIN §2 |
| SHAAM threshold 5K/10K/15K | ❌ CONFLICT פתוח |
| Snapshot Hermes down vs "חי" | לאמת מחדש על המכונה |
| master-plan v1–v20 vs Spine | Spine + BRAIN מנצחים; master-plan = ארכיון מחקר |

---

## V — Voice / שיחות

- WA voice notes: ✅ Groq Whisper + classify (Wave 12 action loop)  
- Phone inbound/outbound / missed-call / voicemail: ❌ מתוכנן (v5)  
- ROI הגבוה ביותר במסמך: missed-call auto-WA  

---

## W — Waves — טבלת-על

| Wave | תוכן | LLD | Code | Live |
|---|---|---|---|---|
| Fed -1/0/1… | פדרציה/באגים | plans | חלקי מקומי | חלקי |
| 12 | Vision/PDF/quote/voice | — | ✅ Alfred | ✅ |
| Graphify | KG | kit | ✅ | ✅ PC |
| 53/A | Bank | ✅ | Phase A | ❌ app |
| 53/B | Procurement | ✅ | Phase A + anomaly | ❌ app |
| 53/C | Proposals | ✅ | ❌ | ❌ |
| 53/D | Ledger | ✅ | ❌ | ❌ |
| 54 | Engineering | ✅ | specs | ❌ |
| 55 | CS | ✅ | ❌ | ❌ |
| Hive Cortex | Platform | ✅ charter | stub+connect | cloud partial |

---

## X — פערים צולבים (Cross-cutting)

1. Canon → live agents (P0)  
2. Phase-a → BEE Operations app  
3. MCP = 0 על שני המנועים החיים  
4. Monday MCP ל-Cursor Cloud  
5. Graphify Stage 3 HTTP MCP  
6. Learning loop ריק (0 examples)  
7. err_manifest read-back  
8. Research על `main` — **אין** (רק PR #2 / #5 / #9)

---

## Y — מה ברק צריך לעשות (ממוין ROI)

| # | פעולה | זמן משוער | משחרר |
|---|---|---|---|
| 1 | `connect-local.ps1` + AGENTS.md step 5 + Hermes external_dirs/3100 | 30–60 דק׳ | Brain Bus |
| 2 | Monday MCP auth ב-Cursor Desktop | 5 דק׳ | collect.monday בענן |
| 3 | OB-4 Mercantile CSV + OB-2 IM export | 15–30 דק׳ | M1/M3 path |
| 4 | Gateway restart + Gmail OAuth (אם עדיין) | 10 דק׳ | digests |
| 5 | OB-1/OB-3 כשיש זמן | משתנה | Wave 54 עומק |
| 6 | אשר SHAAM מול רו״ח | שיחה | ציות 2026 |

---

## Z — סיכום מנהלים + סדר ביצוע מומלץ

### מה החקירה סגרה
- מיפוי מלא של 224 קבצי research + פלטפורמת Cortex + מצב חיבורים  
- הבחנה חדה REAL vs DESIGNED  
- רשימת OPEN / CONFLICT / dropoffs / פעולות ברק  
- צפון ברור: **Hive Cortex מפעיל Spine תחת חוקה**

### סדר ביצוע מומלץ (אחרי החקירה)

```
1. P0 Brain Bus מקומי          ← ברק (connect-local)
2. Monday MCP auth             ← ברק (Desktop)
3. Supervisor חי + drift cron  ← ענן/מקס
4. Row 8 Wave 54 skeleton      ← ענן (בלי dropoffs)
5. Row 1 port 53/A → BEE app   ← Claude מקומי
6. OB-4 + Row 2 bank live      ← ברק+מקומי → M1
7. Learning Wave 8 detector    ← אחרי שיש תנועה
8. KB OPEN (SHAAM/tariffs)     ← ענן + רו״ח
```

### מה *לא* לעשות עכשיו
- לא לפתוח מחדש LD/EA  
- לא להתחיל GitNexus  
- לא LoRA על שיחות לקוחות  
- לא סוכן WhatsApp חדש במקום Alfred  
- לא למכור 53/C–55 כאילו רצים  

---

## נספח — אינדקס מקורות

| אזור | איפה |
|---|---|
| Entry | PR #2 `research/BRAIN.md` |
| חוקה | `protocol_hive.md` · `AGENT_CANON.md` |
| Spine | `phase-3/*` |
| חי | `local-state/` |
| למידה | `continuous-learning-plan.md` |
| Voice | `voice-and-call-pipeline-v5.md` |
| פדרציה | `federation-plan.md` (+v2) |
| כלים | `tools-deep-audit.md` · `deeper-tools-research-v4.md` |
| פלטפורמה | `docs/HIVE_CORTEX_PLATFORM.md` · `platform/` |
| חיבורים | `docs/CONNECTIONS_STATUS.md` |
| דוח זה | `docs/RESEARCH_A_TO_Z.md` |

---

*חקירה אוטונומית הושלמה 2026-07-11 ע״י מקס. אין צורך בסיבוב מחקר נוסף לפני ביצוע P0/P1 — אלא אם המציאות על המכונה של ברק השתנתה מאז snapshot מאי/יוני.*
