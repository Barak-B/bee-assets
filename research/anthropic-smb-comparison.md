# Comparison: Anthropic SMB Plugin Pack ↔ BEE Stack

**Source:** [anthropic/knowledge-work-plugins/small-business](https://github.com/anthropics/knowledge-work-plugins/tree/main/small-business)
**Date:** 2026-05-26
**Context:** Comparing Anthropic's official SMB plugin pack against BEE's actual stack documented in `master-plan-v1-v20.md`.

---

## TL;DR

The Anthropic pack is **well-architected but US-SaaS-shaped**: 12 cloud MCP integrations (QuickBooks/PayPal/HubSpot/Stripe/etc.), atomic-skills + commands + router pattern, English-only, focused on retail/SaaS SMB workflows.

**What to do:**
1. **Adopt the architecture pattern** — atomic skills + chained commands + intent router. It's clean and matches BEE's v11+ direction.
2. **Adopt 9 of 31 skills as concept** — rewire to BEE's stack (Monday instead of HubSpot, Invoice Maven instead of QuickBooks, BEE app PostgreSQL instead of QuickBooks ledger).
3. **Skip 12 skills** — they assume US tax law, PayPal/Stripe/Square retail, HubSpot CRM, Canva design which don't apply.
4. **10 skills are unique to BEE** — engineering-agent, tender-agent, solar-agent, regulatory-agent, voice pipeline — Anthropic has no equivalent.
5. **Zero of their 12 MCPs are usable as-is** — all need Israeli/BEE alternatives.

**Net:** Use Anthropic's pack as **design reference**, not drop-in plugin. Their `SKILL.md` format, approval gates, and command-naming conventions are excellent templates.

---

## 1. Architecture comparison

| Axis | Anthropic SMB | BEE current | Verdict |
|---|---|---|---|
| **Layers** | 3 (atomic → commands → router) | 4 (L1 transport → L2 agents → L3 bee-hive → L4 task bus) per shannholmberg | BEE is more ambitious; Anthropic's 3-layer is achievable today |
| **Atomic skills** | 15 explicit | 31 OpenClaw + 84 Hermes (~115 total, but 5 BEE-local) | BEE has more skill volume; less curated |
| **Workflows / commands** | 15 commands (`/plan-payroll`, `/sales-brief`, ...) | implicit in cron + intents | BEE missing command layer — opportunity |
| **Router** | `smb-router` skill — intent → command table | `alfred-router.js` — intent → provider | Different purposes; BEE could add a command-router on top |
| **Approval gates** | Universal — every action confirmed | Universal — "4 destinations" constitutional law, drafts pattern | Aligned |
| **Channels** | Slack-primary, also Gmail | **WhatsApp-only active** | Big mismatch |
| **Language** | English | Hebrew + English mixed | BEE-specific need |
| **Owner** | "small business owner" generic | Barak (engineer + manager + builder) | BEE has technical owner — can build deeper |

**Insight:** Anthropic's 3-layer pattern (atomic + commands + router) is a **simpler version** of what BEE is heading toward with bee-hive (L3). BEE could **adopt the commands layer first** — easy win — before tackling bee-hive orchestration.

---

## 2. 31 Skills — relevance matrix for BEE

Legend:
- 🟢 **ADOPT** — concept directly applicable, adapt MCP wiring
- 🟡 **PARTIAL** — borrow patterns, but BEE has different need
- 🔴 **SKIP** — assumes US SaaS stack BEE doesn't use
- ⭐ **BEE-UNIQUE** — Anthropic has no equivalent

### Money & Finance (5 commands + 5 skills)

| Skill | Status | Notes |
|---|---|---|
| `cash-flow-snapshot` | 🟢 ADOPT | 30/60/90 forecast w/ confidence bands. **Rewire:** QuickBooks → BEE app PostgreSQL + Invoice Maven AR data. Critical for commercial customers (137). |
| `invoice-chase` | 🟢 ADOPT | Overdue invoice follow-up. **Rewire:** PayPal → Invoice Maven + WhatsApp send (not email). |
| `margin-analyzer` | 🟢 ADOPT | Profit margin per project. **Rewire:** pricebook xlsx (already exists) + BEE app project data. **High value** — BEE has 9 batteries + 8 panel types + supplier prices. |
| `month-end-prep` | 🟡 PARTIAL | Israeli tax cycle: BEE files VAT **monthly** per LD-3 (`VAT_PERIOD_MONTHS=1`). Adapt to ה-תקנות הישראליות. |
| `close-month` | 🟡 PARTIAL | Same — adapt to Israeli accounting. |
| `tax-prep` | 🔴 SKIP | US tax — irrelevant. Israeli equivalent: `alfred-deadlines.js` already covers VAT/income/insurance per AGENTS.md. |
| `tax-season-organizer` | 🔴 SKIP | US-specific. |
| `plan-payroll` | 🟡 PARTIAL | Israeli payroll = משכורות (separate compliance). Maybe useful for sub-contractor pay schedules. |
| `price-check` | 🟢 ADOPT | 3-scenario pricing — directly fits BEE quoting workflow. **Rewire:** Stripe → pricebook + supplier prices. |

### Sales & Marketing (3 commands + 3 skills)

| Skill | Status | Notes |
|---|---|---|
| `lead-triage` | 🟢 ADOPT | Engagement + fit + urgency + recency scoring. **Rewire:** HubSpot → Monday "Leads" board + WhatsApp engagement signals (last_message, response rate, group activity). **Critical for BEE pipeline.** |
| `call-list` | 🟢 ADOPT | Top-5 leads + talking points + calendar slots. Fits BEE morning briefing pattern. |
| `run-campaign` | 🔴 SKIP | HubSpot campaign engine — BEE not running outbound marketing campaigns per v14 (commercial customers come differently). |
| `content-strategy` | 🟡 PARTIAL | Could feed bee-ai-watcher knowledge sync (v17 Action #16). |
| `sales-brief` | 🟢 ADOPT | Top/bottom performers + content strategy. **Rewire:** to Monday "Deals" board. |
| `canva-creator` | 🔴 SKIP | Design asset gen — not BEE priority. |

### Customers & Operations (4 commands + 4 skills)

| Skill | Status | Notes |
|---|---|---|
| `customer-pulse` | 🟢 ADOPT | Sentiment + health score per customer. **Critical for BEE commercial accounts** (Rafael 10.7MW, Palar 5.6MW, etc.). Maps to v11 8.C customer-success-agent. **Rewire:** Slack/HubSpot → WhatsApp + Gmail + BEE app. |
| `customer-pulse-check` | 🟢 ADOPT | Periodic review with response templates. |
| `handle-complaint` | 🟢 ADOPT | End-to-end complaint workflow. **Rewire:** Zendesk-style → WhatsApp + Monday "Activities" board + customer health update. **Maps to BEE `client-fault` intent.** |
| `ticket-deflector` | 🟡 PARTIAL | Auto-FAQ replies — needs Hebrew templates. |
| `crm-cleanup` | 🔴 SKIP | HubSpot dedup — BEE's CRM is Monday, structurally different. |
| `crm-maintenance` | 🔴 SKIP | Same. |
| `review-contract` | 🟢 ADOPT | Plain-Hebrew contract analysis. **Critical** — BEE handles MW-scale contracts. |
| `contract-review` | 🟢 ADOPT | Duplicate-ish of review-contract; combine. |
| `smb-onboard` | 🟡 PARTIAL | Adapt for commercial customer onboarding (per v8 5.D customer onboarding 30d). |

### Business Intelligence (3 commands + 2 skills)

| Skill | Status | Notes |
|---|---|---|
| `monday-brief` | 🟢 ADOPT | Weekly Monday briefing. **Direct fit** — BEE already runs morning crons. |
| `friday-brief` | 🟢 ADOPT | Weekly Friday summary. **Fit** for Israeli work week (Sun-Thu). |
| `quarterly-review` | 🟢 ADOPT | QBR PDF generator. **Maps directly to v11 8.C QBR generation** for Rafael, Palar, etc. 6-step workflow is excellent template. |
| `business-pulse` | 🟢 ADOPT | Business snapshot. Fits BEE's existing dashboard panels (v17 14.A.3). |
| `month-heads-up` | 🟡 PARTIAL | 30-day cash outlook — fits cash-flow-snapshot. |

### Hiring (1 skill)

| Skill | Status | Notes |
|---|---|---|
| `job-post-builder` | 🟡 PARTIAL | If BEE hires technicians/electricians. Need Hebrew templates + Israeli employment law. Low priority. |

### Tally for BEE

- 🟢 ADOPT: **14 skills** (cash-flow, invoice-chase, margin, price-check, lead-triage, call-list, sales-brief, customer-pulse×2, handle-complaint, review/contract×2, monday/friday brief, quarterly-review, business-pulse)
- 🟡 PARTIAL: **8 skills**
- 🔴 SKIP: **9 skills** (US-tax, HubSpot-specific, Stripe/Canva-specific)

---

## 3. ⭐ Skills BEE has that Anthropic DOESN'T

These are unique BEE territory — Anthropic's pack has no equivalent. **Build these ourselves** (most are in v15 Top-10 / v16 designs):

| BEE skill | Source plan | Why unique |
|---|---|---|
| `engineering-agent` | v16 13.A | PV design + protection coordination + BOM — solar-specific, Anthropic doesn't address trades |
| `tender-agent` | v16 13.B | Government tender capture — Israeli public-sector + missed Ashkelon/Kiryat Gat |
| `solar-agent` | existing | SolarEdge/Sungrow/SMA monitoring |
| `regulatory-agent` | existing | Israeli electrical regs, IEC permits, Ministry of Energy RSS |
| `weather-agent` (alfred-weather) | existing | Open-Meteo for field work scheduling |
| `voice-call-pipeline` | v5 | Phone calls + voicemail + missed-call recovery |
| `bee-ai-watcher v2` | v17 14.D #16 | Idea curation pipeline (Obsidian-synced) |
| `field-dispatch-agent` | v11 8.D | Tech routing for 18 vehicles × 255 sites |
| `proposal-generator` | v11 8.E | Hebrew RFP responses |
| `site-dossier-updater` | existing | Auto-update sites/<X>.md from WA groups |

**Implication:** BEE's competitive moat is in **trades/Israeli/Hebrew/own-SaaS** territory. Anthropic's pack is a useful baseline for the *generic* SMB workflows but doesn't touch BEE's actual edge.

---

## 4. MCP integration — major mismatch

Anthropic's `.mcp.json` references **12 cloud MCP servers**. **Zero are directly usable for BEE**:

| Anthropic MCP | BEE reality | Replacement |
|---|---|---|
| `quickbooks` | Israeli accounting — uses Invoice Maven | Build `invoice-maven-mcp` |
| `paypal` | No evidence of use | N/A |
| `hubspot` | Uses Monday.com (100 boards) | Build `monday-mcp` (real one, not just GraphQL) |
| `canva` | Not BEE priority | Skip |
| `docusign` | Maybe for commercial contracts? | Investigate |
| `slack` | Uses WhatsApp | Use existing WA bridge |
| `stripe` | No evidence | Skip |
| `square` | No evidence | Skip |
| `ms365` | Maybe for customer portals? | Investigate |
| `gmail` | ✅ matches BEE's `alfred-gmail.js` | Could adopt if compatible |
| `google calendar` | ✅ matches BEE's calendar-agent | Could adopt if compatible |
| `google drive` | Used for call recordings | Maybe adopt |

**3 of 12 MCPs potentially usable** (Gmail, GCal, GDrive — Google ecosystem). **9 of 12 not relevant.**

**Action:** When wiring BEE's MCP layer (v15 Action #15 `bee-mcp-server`, Phase 2), borrow Anthropic's Gmail/GCal/GDrive MCP server specs as starting templates if their auth pattern matches. Build BEE-specific MCPs for Monday + Invoice Maven + BEE Operations DB ourselves.

---

## 5. Patterns worth borrowing (architecture, not code)

### 5.1 Atomic skills + commands + router (3 layers)

This is **cleaner** than BEE's current "everything is an Alfred script". Recommendation:

```
Atomic skill   = single capability  (e.g., "fetch unpaid invoices")
                  ↓ composes into
Command        = multi-step workflow (e.g., /invoice-chase = fetch + classify + draft + queue)
                  ↓ invoked via
Router         = NL → command match  (e.g., "send chase emails" → /invoice-chase)
```

**For BEE:**
- L1 (Hermes transport) → unchanged
- L2 (specialized agents) → **rewrite as atomic skills**, each ~50-100 LOC
- (NEW) L2.5 **commands layer** → workflows like `/morning-brief`, `/tender-review`, `/customer-checkup`
- L3 (bee-hive) → **intent router** + workflow execution + state machine

This makes bee-hive less mysterious — it's a smb-router + workflow engine.

### 5.2 Approval gates per skill

Every Anthropic skill has explicit "Approval Gates" section. **Adopt verbatim.** Example from `lead-triage`:
> "drafts emails without sending, proposes calendar slots without booking, never modifies HubSpot data without explicit owner direction"

For BEE: rewrite as "drafts WhatsApp replies but never sends to customer chats, proposes Monday updates but requires confirmation, never modifies BEE app data without explicit task ID."

### 5.3 Connector-awareness in router

Anthropic's `smb-router` Step 8: "explicitly communicates connector gaps before attempting commands that require them". BEE today doesn't have this — Alfred just fails. Add to alfred-router post-Phase 2.

### 5.4 Skill versioning

Every Anthropic SKILL.md starts with `name: ... version: 0.1.1`. **BEE skills don't version.** Add to roster of skills → enables A/B testing of skill changes.

### 5.5 Output format consistency

Anthropic skills output: chat summary + downloadable artifact (XLSX/PDF/MD). **Adopt for BEE QBRs + proposals + reports** — already in plan via Anthropic docx/xlsx skills (v6+).

### 5.6 Cadence triplet (Monday-brief, Friday-brief, Quarterly-review)

Three cadences:
- **Daily** (BEE has morning/evening digests ✅)
- **Weekly Monday** (start-of-week planning) ← NEW pattern to adopt
- **Weekly Friday** (week wrap-up) ← NEW
- **Quarterly** (QBR) ← new pattern for BEE commercial customers

**Add to v15 Top-N actions:** create `/monday-brief` and `/friday-brief` Alfred commands. Each ~3h build. **High ROI.**

---

## 6. Integration into BEE roadmap

Map Anthropic-pack adoptions to BEE's existing phases (per `master-plan-v1-v20.md` v20 17.E):

### Phase 1 (Week 1, currently 14h) — additions

| New action | Source | Time | Why now |
|---|---|---|---|
| `/monday-brief` Alfred command | Anthropic `monday-brief` | 3h | Quick win, low risk, fits cadence |
| `/friday-brief` Alfred command | Anthropic `friday-brief` | 3h | Same |

**Updated Phase 1:** 14h → 20h.

### Phase 2 (Week 2-3, 44h) — additions

Add to Foundation:
- Adopt Anthropic SKILL.md format for BEE's 5 local Hermes skills + new ones (zero code, ~1h doc work)
- Build `invoice-maven-mcp` (per BEE-mcp-server framework, Action #15)

### Phase 3 (Weeks 4-8) — adoptions

When building Phase 3 agents, **borrow templates** from Anthropic for:
- **engineering-agent** ← borrow `margin-analyzer` structure for BOM analysis sub-skill
- **tender-agent** ← borrow `review-contract` for RFP parsing
- **customer-success-agent (v11 8.C)** ← borrow `customer-pulse` + `quarterly-review` directly. ~40% time saved.

### Phase 4 — adoptions

- **proposal-generator (v11 8.E)** ← borrow `price-check` 3-scenario pricing pattern
- **cash-flow-agent** (NEW domain — add as #18) ← adopt `cash-flow-snapshot` directly with PostgreSQL rewire

### Phase 5 — defer

- Generic SMB onboarding (`smb-onboard`) — only if BEE pivots to multi-tenant SaaS

---

## 7. The MCP gap is the real story

Anthropic's pack is **cloud-SaaS-shaped**. Every skill assumes a hosted MCP server (mcp.hubspot.com, mcp.canva.com, etc.). **BEE has zero MCP servers configured** (v14 11.A) and uses **on-prem + self-hosted** (BEE Operations app, Monday GraphQL, Invoice Maven REST, SolarEdge API, Hetzner PostgreSQL).

This means:
- **You cannot install Anthropic's pack as-is** and have it work for BEE.
- **You can adopt the skill structure + concept** and rewire to BEE's connectors.
- **The real Phase 2 work** (Actions #14 + #15: BEE API doc + bee-mcp-server) becomes the **MCP foundation** — once done, BEE has its own MCP layer that can host adapted skills.

**Strategic implication:** the order of operations is:
1. **Phase 1** ← independent of Anthropic pack
2. **Phase 2** ← build BEE-specific MCPs first (Action #15)
3. **Phase 2.5** ← THEN port Anthropic skills (one at a time, rewired)

Trying to short-circuit and adopt Anthropic skills before MCPs are built = wasted time.

---

## 8. Recommended adoption order

### Immediate (Phase 1, no MCP needed)

1. **Borrow SKILL.md format** for roster.yaml description + future BEE skills (~1h docs).
2. **Add `/monday-brief` + `/friday-brief`** as Alfred commands (~6h total) — pure new value.

### After Phase 2 (BEE MCPs in place)

3. Port `cash-flow-snapshot` → rewire to Invoice Maven + BEE app PostgreSQL (~10h)
4. Port `invoice-chase` → rewire to Invoice Maven + WhatsApp send via Hermes (~6h)
5. Port `customer-pulse` → integrate into customer-success-agent (v11 8.C build, ~30h includes this)
6. Port `lead-triage` → rewire to Monday Leads + WA engagement (~8h)

### When Phase 3 agents being built

7. Reference `review-contract` when building tender-agent (~free, just pattern matching)
8. Reference `margin-analyzer` when building engineering-agent (~free)
9. Reference `quarterly-review` 6-step workflow for customer-success-agent (~free)

### Skip entirely (don't waste time)

- `tax-prep`, `tax-season-organizer` (US-specific)
- `canva-creator` (low priority)
- `crm-cleanup`, `crm-maintenance` (BEE doesn't use HubSpot)
- `run-campaign` (BEE doesn't run outbound marketing campaigns)
- `job-post-builder` (low priority, easy to do ad-hoc when needed)
- `plan-payroll` (Israeli payroll is its own beast)
- `ticket-deflector` (BEE's customer support is high-touch, not deflection-mode)
- `smb-onboard` (BEE onboards commercial customers differently — covered in v8 5.D)

---

## 9. The honest verdict

**Strengths of Anthropic's pack:**
- Clean skill structure (use as template)
- Approval gates pattern (adopt verbatim)
- Cadence triplet (Monday/Friday/Quarterly)
- Cash-flow + margin + invoice-chase workflows (high-value adapt targets)
- Quarterly-review 6-step structure (free for BEE QBRs)
- Connector-awareness in router

**Weaknesses for BEE:**
- US-SaaS stack (QuickBooks/PayPal/HubSpot/Stripe) — none match
- English-only — needs Hebrew rebuild for customer-facing
- Cloud MCPs — BEE needs self-hosted equivalents
- Generic SMB — doesn't touch trades, solar, regulatory, engineering
- Retail-shaped — BEE is commercial B2B

**What it teaches us about BEE's roadmap:**
- ✅ BEE's 4-Levels ambition (L1→L4) is correct direction — Anthropic confirmed atomic→commands→router is the right pattern
- ✅ BEE's MCP-foundation plan (Action #14+#15) is necessary, not optional
- ✅ Approval gates (4-destinations law) align with industry best practice
- ⚠️ BEE missing a **commands layer** — should add `/monday-brief`-style workflows as quick wins
- ⚠️ BEE has no published SKILL.md format — should formalize per Anthropic pattern

---

## 10. Next actions

Add to master-plan as v21 update:

```yaml
phase_1_additions:
  - id: action_17
    name: /monday-brief Alfred command
    source: Anthropic monday-brief skill
    hours: 3
    roi: 8/10
    
  - id: action_18
    name: /friday-brief Alfred command
    source: Anthropic friday-brief skill
    hours: 3
    roi: 8/10

phase_2_additions:
  - id: action_19
    name: Adopt SKILL.md format for 5 local Hermes skills
    source: Anthropic skill template
    hours: 1
    roi: 5/10
    
  - id: action_20
    name: Build invoice-maven-mcp (BEE equivalent of QuickBooks MCP)
    source: borrow from Anthropic QB MCP pattern
    hours: 6
    roi: 8/10

phase_3_additions:
  - id: action_21
    name: Port cash-flow-snapshot to BEE
    source: Anthropic skill, rewired
    hours: 10
    roi: 8/10
    
  - id: action_22
    name: Port invoice-chase to BEE
    source: Anthropic skill, rewired
    hours: 6
    roi: 8/10
    
  - id: action_23
    name: Port lead-triage to BEE Monday
    source: Anthropic skill, rewired
    hours: 8
    roi: 8/10
    
  - id: action_24
    name: Use customer-pulse + quarterly-review as template
                  for customer-success-agent (v11 8.C)
    source: Anthropic templates
    hours: -10 (saves time within existing 30h budget)
    roi: efficiency gain
```

**Net effect on roadmap:**
- Phase 1: +6h (`/monday-brief` + `/friday-brief`) → total 20h
- Phase 2: +7h (SKILL.md format + invoice-maven-mcp) → total 51h
- Phase 3: +24h ports, -10h efficiency = +14h → total ~94h
- **Overall: +27h** to roadmap, but with several high-value workflows that BEE didn't have.

---

## 11. One-paragraph executive summary

Anthropic's SMB plugin pack is an **excellent design reference** for BEE's emerging command layer but **cannot be installed as-is** — its 12 cloud MCPs (QuickBooks/PayPal/HubSpot/Stripe/etc.) don't match BEE's stack (Invoice Maven/Monday/own SaaS). The high-value extraction is **architectural** (atomic skills + commands + router, approval gates, cadence triplet) and **skill templates** for 9 of 31 skills that map to BEE needs (cash-flow, invoice-chase, margin-analyzer, lead-triage, customer-pulse, handle-complaint, contract-review, quarterly-review, monday/friday-brief). All ports require **rewiring to BEE-specific connectors**, which is **why Phase 2 (BEE MCP foundation, Actions #14+#15) must complete first**. Adopting Anthropic's pack adds **~27h** to the roadmap but unlocks **~6 production workflows** BEE doesn't currently have. Net: high-leverage if sequenced correctly.

---

_Document: 2026-05-26 cloud session. Plan version reference: v20._
