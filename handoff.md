# Handoff — B.E.E Solar Site Survey (Hive Collect)

> העבר לסשן מקומי. אל תנחש נתיבים — ראה §Paths.

**Cloud run:** https://cursor.com/agents/bc-9bb92be1-3678-4e6c-9f65-a47b3b959f06  
**Owner:** ברק ברזל · `barak-barzel@barak-e.com`  
**Date:** 2026-07-13  
**Repo:** `github.com/Barak-B/bee-assets`  
**Branch:** `cursor/bee-solar-survey-hive-9f06`  
**PR:** https://github.com/Barak-B/bee-assets/pull/11 (draft)  
**Base:** `main`

---

## 1 — Request

Open Tamir’s solar site survey (`https://solar-survey.pages.dev/`) and rebuild it according to **B.E.E Hive model** (Collect → Edit → Dispatch → Wave 54).

---

## 2 — What shipped

Hebrew RTL field PWA based on Tamir’s UX, branded B.E.E, exporting hive jobs:

```
collect.site-survey
  → edit.normalize-site-survey
  → dispatch.draft          (Law #2 · requiresHumanPick)
  → wave-54.designSuite
```

| Path | Role |
|---|---|
| `apps/bee-solar-survey/` | Vite + TS PWA |
| `docs/BEE_SOLAR_SURVEY_HIVE.md` | Hive integration charter |
| `platform/schema/loops.json` | Added `collect.site-survey` + `edit.normalize-site-survey` |
| `platform/schema/job.schema.json` | Hive job contract (from cortex branch) |
| `apps/bee-solar-survey/README.md` | Run / deploy notes |

### Kept from Tamir
- RTL Hebrew, local projects, backup/restore
- Camera/gallery, photo markup, GPS
- Electrical / meter / roof / inverter fields + PDF + IndexedDB

### Added for B.E.E / Wave 54
- Hebrew roof → canonical enum (`flat` / `tile` / `metal-standing-seam` / `metal-trapezoidal` / `ground`)
- `usableAreaM2`, azimuth, tilt, annual kWh, target kWp / budget ₪
- Inverter pref: SolarEdge / KStar / ABB / Deye
- Wave 54 readiness score
- Hive JSON export (`src/hive.ts`)
- Trust L1 · never `destinationClass=customer` · `customer.id = [OPEN]`

### Verify (already green in cloud)
```powershell
cd apps\bee-solar-survey
npm test
npm run build
```

---

## 3 — Paths (Windows · from PATHS.md)

| What | Path |
|---|---|
| **bee-assets (local)** | `E:\bee-assets` |
| App | `E:\bee-assets\apps\bee-solar-survey` |
| Alfred | `E:\Desktop\OpenClawAgent\` |
| Hermes | `E:\bee-hermes\` |
| Obsidian BEE | `E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\3-Projects\BEE\` |

Do **not** use placeholder `C:\path\to\...`.

---

## 4 — Run locally (PowerShell)

Windows PowerShell 5.x: **no `&&`** — use `;` or separate lines.

```powershell
cd E:\bee-assets
git fetch origin
git checkout cursor/bee-solar-survey-hive-9f06
cd apps\bee-solar-survey
npm install
npm run dev
```

Open: `http://localhost:5173`

If `E:\bee-assets` missing:

```powershell
cd E:\
git clone https://github.com/Barak-B/bee-assets.git
cd bee-assets
git checkout cursor/bee-solar-survey-hive-9f06
cd apps\bee-solar-survey
npm install
npm run dev
```

Quick existence check:

```powershell
Test-Path E:\bee-assets
```

---

## 5 — Key source files for local agent

1. `apps/bee-solar-survey/src/schema.ts` — mapping + completeness  
2. `apps/bee-solar-survey/src/hive.ts` — Collect/Edit/Dispatch jobs  
3. `apps/bee-solar-survey/src/main.ts` — UI  
4. `docs/BEE_SOLAR_SURVEY_HIVE.md` — product/architecture  
5. Canon (other branch): `research/phase-3/engineering-agent/LLD.md` on `claude/capability-extensions-collection-JjV2s`  
6. `AGENT_CANON` / `docs/HIVE_CORTEX_PLATFORM.md` on `cursor/hive-cortex-platform-634e`

---

## 6 — Status / next

| Item | Status |
|---|---|
| PWA + schema + hive export + tests | ✅ |
| PR #11 draft | ✅ |
| Cloudflare Pages deploy | ⏳ root=`apps/bee-solar-survey`, build=`npm run build`, out=`dist` |
| Wire to Alfred drafts / live supervisor | ⏳ after local Brain Bus |
| Merge to `main` | ⏳ after Barak review |

---

## 7 — Prompt for local session

```
המשך מ-PR #11 (branch cursor/bee-solar-survey-hive-9f06).
סקר אתר B.E.E כ-collect.site-survey ל-Wave 54.
נתיב: E:\bee-assets\apps\bee-solar-survey
קרא handoff.md + docs/BEE_SOLAR_SURVEY_HIVE.md.
הרץ npm install; npm run dev (PowerShell בלי &&).
בדוק UX מול https://solar-survey.pages.dev/ וחבר Pages / Alfred drafts לפי הצורך.
חוקה: Law #1/#2, customer.id=[OPEN], wire_sizing/protection = Tier-0.
```

---

## 8 — Constitutional reminders

- Law #1 — only 4 authorized WA destinations; never customer from this app  
- Law #2 — every outbound is draft + human pick  
- §3.6a — don’t invent operator/CRM facts  
- Bank Mercantile 17 · VAT monthly · fleet SolarEdge/iSolarCloud/Deye/KStar/ABB  
