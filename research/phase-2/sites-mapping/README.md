# sites/_mapping.json Generator — Phase 2 Action #11

**Source:** master-plan v17 14.A.4 + v20 17.A
**Time:** ~8h (script 4h + Barak review of medium-conf 4h)
**Pre-req:** Phase 1.5 #3 (workspace.db readable) + BEE app sites snapshot

## ה-context

ה-AGENTS.md מגדיר ש-`~/.openclaw/workspace/sites/_mapping.json` ממפה JID של קבוצת WA → site_slug. כרגע יש רק entry אחד (כפר יובל). ברק אישר ב-Q72 שיש WA groups לרוב ה-active sites (~150-180). זה ה-build שמעלה את ה-coverage.

## איך זה עובד

3 פלטים:

| File | מה זה | שימוש |
|---|---|---|
| `_mapping.json` | High-confidence matches (≥0.8 score) — auto-applied | ⇒ `sites/_mapping.json` ישירות |
| `_mapping_review.json` | Medium-confidence (0.5-0.8) — דורש Barak review | פתח בעורך, סמן OK/NOT, ה-script הבא יקדם |
| `_mapping_unmatched.json` | Low-conf — כנראה customer-personal chats, לא site groups | manual investigation |

## Algorithm — match score

לכל זוג (WA group, BEE site):

```
score = 0
+0.6 if site.name_he appears in group.name
+0.1 if site name is prefix or suffix
+0.2 if customer_name in group.name
+0.15 if city in group.name
+0.1 if "התקנת/מערכת/סולא" + site_name in group.name
×0.5 if site_name very short (<4 chars) — ambiguous penalty
```

Threshold: ≥0.8 auto, 0.5-0.8 review, <0.5 unmatched.

## איך להריץ

```bash
cd research/phase-2/sites-mapping
npm install better-sqlite3

node generate-mapping.js \
  --workspace-db /path/to/workspace.db \
  --sites /path/to/bee-sites-snapshot.json \
  --out ./output \
  --verbose

# Or dry-run first
node generate-mapping.js --workspace-db ... --sites ... --dry-run --verbose
```

## Sites snapshot format

The `--sites` JSON should be an array of:

```json
[
  {
    "id": "kfar-yuval",
    "name_he": "כפר יובל",
    "name": "Kfar Yuval",
    "customer_name": "Prime Energy",
    "city": "כפר יובל"
  },
  {
    "id": "rafael-solar-tel-aviv-1",
    "name_he": "רפאל סולאר - תל אביב 1",
    "customer_name": "Rafael Solar",
    "city": "תל אביב"
  },
  ...
]
```

Get from BEE app:

```bash
# Phase 2: when bee-mcp-server is up
mcp call bee.listSites --output json > bee-sites-snapshot.json

# Phase 2 fallback (before MCP): query BEE PG directly
psql -h bee-prod-1 -U bee -d bee_ops -c \
  "COPY (SELECT json_agg(row_to_json(s)) FROM (
     SELECT id, name AS name_he, customer_name, city FROM sites WHERE active=true
   ) s) TO STDOUT" > bee-sites-snapshot.json
```

## אחרי שגיניתי mapping

1. **Auto-apply high-conf:**
   ```bash
   cp output/_mapping.json ~/.openclaw/workspace/sites/_mapping.json
   ```

2. **Review medium-conf:**
   - פתח `output/_mapping_review.json` בעורך
   - לכל entry: ה-`best.site_name` נראה נכון? אם כן → קדם ל-`_mapping.json`. אם לא → מחק.

3. **Investigate unmatched:**
   - חלק יהיו customer-personal chats (DM של לקוח, לא site)
   - חלק יהיו group chats שאינם sites (family, friends, etc.)
   - אם מצאת site groups שלא matched — manually add to `_mapping.json`

4. **Wire into alfred-handle.js:**
   - The constitutional law (4-destinations) means Alfred LISTENS to site groups but never sends.
   - Site dossier auto-update: every message in mapped group → append to `sites/<slug>.md`
   - Already exists per AGENTS.md L430 — just needs the mapping file to be populated.

## Verification

After deploy, send a WA message to a known site group (e.g., כפר יובל test group). Within minutes:

```bash
# Watch for new entry in site dossier
tail -f ~/.openclaw/workspace/sites/kfar-yuval.md
```

Should see new event row appended.

## Expected coverage

Per Q72 ("רוב ה-active sites"):
- ~150-180 sites with WA groups
- ~80-90% auto-match (high-conf) if site names are consistent
- ~10-15% review (slight variations: "כפר יובל - התקנת מערכת" vs "כפר יובל ENERGY")
- ~5-10% unmatched (one-off chats not tied to specific site)

## Maintenance

After Phase 2 deploy, add hourly cron to refresh mapping:

```javascript
// alfred-sites-mapping-refresh.js
// cron: 0 * * * *  (hourly)
// 1. Re-query workspace.db for newly-added groups
// 2. Match against fresh BEE sites
// 3. Append new high-conf matches to _mapping.json
// 4. Alert if review-pile grows by >5 in one day
```

## Privacy note

Same as Phase 1.5 #3: script reads chat metadata (group_id, name) only — no message content.
Group names may contain customer identifiers — that's how matching works.
Output files stay on bee-prod-1 + Barak's PC. Do NOT commit `_mapping.json` to public repo (committed `.example.json` is sanitized).
