# Phase 1 Deliverables — Quick Wins (Week 1, ~14h)

מבוסס על **master-plan-v1-v20.md** v15 12.B (Top-10 actions) + v18-v20 updates.

## 🎯 מה זה

7 קבצים מוכנים-להחלה ל-Phase 1. כל קובץ = פעולה אחת מ-ה-Top-10. אני (הסשן הענני) **לא** יכול להריץ ב-E:\ או על bee-prod-1 — לכן זה **deliverables לBarak להחיל מקומית** דרך Claude Code, manual copy, או Hermes/Alfred CLI.

## ⏱️ סדר ביצוע מומלץ (14h סה"כ)

| # | Action | Time | Risk | File |
|---|---|---:|---|---|
| 1 | Smart router fix (DeepSeek-aware) | 0.5h | 🟢 low | `alfred-router.patched.js` |
| 2 | Re-enable 5 disabled crons | 1h | 🟢 low | `cron-restore.sh` |
| 3 | Heartbeat watcher | 1h | 🟢 low | `heartbeat-watcher.js` |
| 4 | roster.yaml build | 2h | 🟢 low | `roster.yaml.template` |
| 5 | Gmail OAuth recovery | 3h | 🟡 med | `gmail-oauth-recovery.md` |
| 6 | DeepSeek-chat anomaly hunt | 3h | 🟢 low | `deepseek-anomaly-hunt.md` |
| 7 | MVP tender-tracker | 4h | 🟡 med | `tender-tracker-mvp/` |

**סה"כ:** ~14.5h ביצוע ע"י ברק (או Claude Code local).

## 🚦 dependencies

- #1 לפני #3 (router צריך לעבוד לפני שheartbeat יבדוק tokens)
- #2 לפני #6 (אם crons מנוטרלים, anomaly hunt קשה יותר)
- #5 לפני digest cron יעבוד
- #4 חוסם את כל המקומות עם entity resolution (Phase 2 חוסם)
- #7 עצמאי — יכול לרוץ במקביל לכל השאר

## ✅ Pre-flight checklist (לפני שמתחילים)

לפי master-plan v9 6.A — לוודא:

- [ ] Access ל-`E:\Desktop\OpenClawAgent\` (Windows PC)
- [ ] Access ל-`E:\bee-hermes\`
- [ ] SSH access ל-bee-prod-1 (Hetzner CX52)
- [ ] Backup `~/.openclaw/` ו-`~/AppData/Local/hermes/` לתיקייה backup-2026-05-26
- [ ] Git status נקי בכל workspace לפני התחלת changes
- [ ] DeepSeek balance > $5 (currently $96.57 ✅)
- [ ] Anthropic API key valid

## 🔄 After Phase 1

Phase 2 (Week 2-3, ~44h): Foundation:
- roster.yaml application
- BEE app write API doc (#14)
- bee-mcp-server build (#15)
- KG Neo4j foundation (#7)
- sites/_mapping.json (#11, ~150-180 entries)

Phase 3+ per master-plan v20.

## 📝 Notes

- כל קובץ JS/Python בPhase-1 → **untested in cloud**. תרוץ בdry-run mode קודם.
- כל script מסומן `# requires manual review by Barak before production`.
- Rollback instructions בכל קובץ.

---

_Cloud session: 2026-05-26. Plan version: v20._
