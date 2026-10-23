# MVP tender-tracker — Phase 1 Action #7

**Source:** master-plan-v1-v20.md v15 Action #9 + v18 15.A (Q71 = tenders missed!)  
**Time:** ~4h (MVP only — full tender-agent is Phase 3a, 38h)  
**Risk:** 🟡 medium (network scraping, depends on gov.il portal stability)  
**ROI:** **Insane** — 1 captured tender ≥ ₪500K (we lost ₪800K-3M to Ashkelon + קרית גת)

## ה-business case

ברק **לא הגיש** את מכרזי חוף אשקלון (deadline 12.5) + קרית גת (deadline 13.5). אובדן הזדמנות **₪800K-3M**. זה לא יקרה שוב — MVP tender-tracker פותר את הproblem של "didn't see it in time".

## מה ה-MVP **כן** עושה (Phase 1, 4h)

✅ Daily scan of gov.il + municipal RSS for "מכרז" + electrical/solar keywords  
✅ De-dup against already-captured tenders  
✅ Sync new finds to Monday "Tenders" board (creates board if missing)  
✅ Deadline alert chain T-30/14/7/3/1/0 days → ⚡ Barak via WhatsApp self-chat  
✅ Manual entry: WhatsApp command `/tender add <url>` to inject privately-known tenders  

## מה ה-MVP **לא** עושה (saved for Phase 3a)

❌ Document aggregation (insurance certs, financials)  
❌ Draft Hebrew RFP response  
❌ Submission tracking + win/loss outcomes  
❌ Auto-create `:Project` in KG on win  
❌ Past-tender similarity (find patterns)  
❌ Multi-channel ingestion (only RSS + WA command in MVP)  

זה בא ב-tender-agent הרחב (v16 13.B, ~38h, Phase 3a).

## Files

```
tender-tracker-mvp/
├── README.md                    ← this file
├── config.example.json          ← copy → config.json, fill in
├── package.json                 ← deps: node-fetch, rss-parser, better-sqlite3
├── index.js                     ← main entry, runs all phases
├── gov-rss-poller.js            ← scrape gov.il + Tel Aviv + Jerusalem + Ashkelon + Kiryat Gat + ...
├── monday-board-sync.js         ← Monday API integration
├── deadline-watcher.js          ← T-N day alert chain
└── tenders.db                   ← created at runtime — sqlite local cache
```

## Install

```bash
cd E:\Desktop\OpenClawAgent\tender-tracker-mvp
npm install
cp config.example.json config.json
# Edit config.json — fill in Monday API token + board ID (create if missing)
```

## Run

```bash
# One-shot poll + dedup + sync + alerts
node index.js

# Dry run (no Monday writes, no WA alerts)
node index.js --dry-run

# Just poll new tenders, don't alert
node index.js --no-alerts

# Just run alert chain on already-known tenders
node index.js --alerts-only
```

## Cron schedule

Add to Alfred cron (after testing):

```bash
openclaw cron add tender-tracker-poll \
    --schedule "0 7 * * *" \
    --script "scripts/tender-tracker-mvp/index.js" \
    --timezone "Asia/Jerusalem"
```

Runs daily 07:00 (before Barak starts work — alerts are ready).

## Sources scanned (configurable)

Per `config.json.sources[]`:
- **gov.il main tender portal** (Ministry of Energy)
- **רשות החשמל** (PUA)
- **Municipalities (RSS where available):**
  - Tel Aviv: https://www.tel-aviv.gov.il/Pages/default.aspx (or tender feed if exists)
  - Jerusalem
  - Ashkelon ← **the one we missed**
  - Kiryat Gat ← **the one we missed**
  - Eilat, Ashdod, Beersheba, Haifa, Rishon LeZion
- **HUD / housing authority** (יחידת שיכון ציבורי)
- **IDF tenders** (selective — solar for bases)

## Manual command via WhatsApp

In addition to RSS scraping, Barak can post in self-chat:

```
/tender add https://example.gov.il/tender/12345
/tender add deadline=2026-06-30 name="מכרז סולארי באר שבע" link=https://...
/tender list
/tender close <id>   # mark as not pursuing
```

This requires wiring `alfred-handle.js` to intercept `/tender` commands → call `index.js add`.

## Alerts

Sent via Alfred self-chat (constitutional law: never sends to customer):

```
T-30 days:  📅 New tender: <name> deadline <date>. Review when ready.
T-14 days:  📋 Tender <name> — 14 days. Schedule prep time.
T-7 days:   ⚠️ Tender <name> — 7 days. Start gathering documents.
T-3 days:   🚨 Tender <name> — 3 DAYS. Finalize submission.
T-1 day:    🚨🚨 Tender <name> — TOMORROW. Last chance.
T-0:        🚨🚨🚨 Tender <name> — DEADLINE TODAY. Did we submit? Reply YES/NO/SKIP.
T+1 day:    Auto-mark as "missed" if no YES received.
```

## Monday "Tenders" board schema

Auto-created if missing. Columns:

| Column | Type | Purpose |
|---|---|---|
| שם המכרז | text | Tender title (Hebrew) |
| מקור | dropdown | gov.il / municipality / private |
| תאריך deadline | date | Submission deadline |
| ערך מוערך (₪) | numbers | Estimated value |
| סטטוס | status | פתוח / בהכנה / הוגש / זכינו / לא זכינו / נסגר |
| הסתברות זכייה | numbers | 0-100 |
| BEE Tender ID | text | UUID synced with local db + KG (Phase 2) |
| קישור | link | Tender source URL |

## Configuration (config.example.json)

See sibling file. Required:
- Monday API token (from monday.com → admin → API)
- Self phone for WA alerts (`+972509554483`)
- Hermes bridge URL (`http://127.0.0.1:3000/send`)

Optional:
- Custom keywords list (default: solar/electrical/inverter/PV in Hebrew + English)
- Custom RSS sources (add municipal feeds)
- Alert thresholds (default: 30,14,7,3,1,0 days)

## Verification

After first run:

1. `tenders.db` should exist with `tenders` table
2. Monday "Tenders" board exists, has 0+ rows (new finds from past 30 days)
3. WA self-chat received "tender-tracker boot" message: how many new finds, how many alerts triggered
4. Log file `tender-tracker.log` with no errors

If 0 new finds — that's fine, means no recent tenders match keywords. **You should still see alerts for any existing manually-entered tenders nearing deadline.**

## Maintenance

- Weekly: review Monday "Tenders" board, mark "סטטוס" on each item
- On win: change status, optionally trigger Phase 2 KG `:Project` creation
- On miss/loss: capture reason — feed to Phase 3a tender-agent learning loop

## Phase 3a evolution (not in MVP)

When you grow this:
- Add document aggregator (`document_aggregator` sub-skill)
- Add draft_preparer (Hebrew RFP response)
- Add submission_tracker (sync with portals via API where available)
- Tie to BEE Operations app (writeback per v19 paradigm)
- KG `:Tender` node with full lifecycle

See master-plan-v1-v20.md v16 13.B for full design.

## Rollback

```bash
openclaw cron disable tender-tracker-poll
# Optionally delete:
rm -rf E:\Desktop\OpenClawAgent\tender-tracker-mvp\tenders.db
```

Monday board kept intact — manual cleanup if you want.
