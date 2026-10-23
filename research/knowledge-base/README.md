# BEE Knowledge Base — Israeli Regulatory + Domain

> Autonomous research store, per Barak's directive 2026-06-15 ("תלמד את כל הנושאים בצורה אוטונומית ותאחסן בצורה נגישה") and `protocol_hive.md` §3.6a + §6.
>
> **Confidence legend** (every fact carries one):
> - `[VERIFIED]` — confirmed from an official/primary source (gov.il, רשות המסים, רשות החשמל, חח"י, ת"י)
> - `[SECONDARY]` — from a reputable secondary source (accounting firms, established vendors); good but verify before acting
> - `[CONFLICT]` — sources disagree; do NOT act until resolved (flagged for Barak / רו"ח)
> - `[OPEN]` — not yet researched / needs a primary doc only Barak can access
>
> **Hard rule:** regulatory errors are dangerous (§3.6a). Nothing here is acted on by an agent at `L1`+ without a `[VERIFIED]` tag. `engineering-agent` and `regulatory-agent` read this KB as grounding, but cite the source line on any regulatory claim they surface.

---

## Files

| File | Topic | State |
|---|---|---|
**Existing files** (on disk):

| File | Topic | State |
|---|---|---|
| `il-einvoicing-shaam.md` | חשבוניות ישראל / מספר הקצאה (e-invoicing allocation numbers) | first pass — 1 CONFLICT flagged |
| `il-solar-regulation.md` | רשות החשמל — מונה נטו, תעריפים, הסדרות סולאריות | first pass |
| `il-pv-grid-connection.md` | חח"י — נוהל חיבור מתקן PV, טפסים, בדיקות בודק | first pass |

**Planned files** (NOT yet created — see research queue below; do not link as if present):

| Planned file | Topic | State |
|---|---|---|
| `il-electrical-code.md` | חוק החשמל + תקנות + ת"י | `[OPEN]` — research queued |
| `il-self-employed-tax.md` | מע"מ, ביטוח לאומי לעצמאי (מקדמות = 0% per LD-2) | `[OPEN]` — research queued |
| `product-certs.md` | KStar / SolarEdge / ABB / Deye — specs, warranties, installer portals | `[OPEN]` — research queued |

## Research queue (autonomous — next sessions)

1. `[OPEN]` חוק החשמל ותקנותיו — תקנות התקנת מתקני חשמל, הארקות, בדיקות תקופתיות (primary: gov.il + רשם החשמל)
2. `[OPEN]` ת"י רלוונטיים ל-PV — IEC 62446 (commissioning/testing), IEC 60364-7-712, ת"י לארונות + מפסקי DC
3. `[OPEN]` תעריפי מונה-נטו מדויקים 2026 + תוספת עירונית 6 אג'/קוט"ש — מספרים מאומתים מרשות החשמל
4. `[OPEN]` SHAAM API — מפרט טכני להפקת מספר הקצאה אוטומטית (חיבור ל-Invoice Maven / BEE app) — feeds Wave 53 reconciliation
5. `[OPEN]` מע"מ לעצמאי + ביטוח לאומי — לוחות זמנים שייכנסו ל-alfred-deadlines.js. **NOTE: VAT cadence is MONTHLY for BEE per the locked decision LD-3 (`phase-3/decisions-2026-06-16.md`, `VAT_PERIOD_MONTHS=1`), NOT bi-monthly. מקדמות מס הכנסה = 0% per LD-2 (no filing).** The general "דו-חודשי is common in Israel" fact does not apply to BEE — Barak chose monthly.
6. `[OPEN]` product datasheets — KStar inverters, Deye ESS Modbus registers (feeds engineering-agent fault_analysis + bee-whisper site monitoring)

## How agents use this

- `regulatory-agent` (Alfred skill, exists) — already monitors gov.il RSS; this KB is its long-term grounding store.
- `engineering-agent` (phase-3 spec) — `protection_coordination` + `wire_sizing` sub-skills cite `il-electrical-code.md` once it's `[VERIFIED]`.
- `tender-agent` (phase-3 spec) — `il-solar-regulation.md` informs bid feasibility.
- Bank/finance (Wave 53) — `il-einvoicing-shaam.md` + `il-self-employed-tax.md` drive deadline alerts + invoice compliance.

## Sync

This dir is part of the §6 loop: git → Obsidian (`3-Projects\BEE\knowledge-base\`) → graphify (`graphify extract . --update`). Re-run after each research session.
