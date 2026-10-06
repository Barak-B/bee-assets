# AI App Business Plan Generator in the B.E.E hive

> **What:** a startup idea research prompt + PWA — six founder answers → a complete consulting brief for an AI-powered mobile app
> **Where:** app.barak-e.com (app) · www.barak-e.com (site) · [`apps/bee-business-plan/`](../apps/bee-business-plan) (code)
> **Asset:** [`prompts/ai-app-business-plan-generator.md`](../prompts/ai-app-business-plan-generator.md) + [`.json`](../prompts/ai-app-business-plan-generator.json)
> **Updated:** 2026-10-06

> תקציר: מחולל תוכנית עסקית לאפליקציית AI — היזם עונה על שש שאלות, האפליקציה ממלאת את הפרומפט הקנוני, מריצה אותו (Claude / ChatGPT או ייצור בתוך האפליקציה עם מפתח של היזם) ומייצאת לכוורת כ־Collect → Edit → Dispatch תחת Law #1/#2.

## Why it is part of the hive

B.E.E meets founders and small-business owners who already have an audience and want
an app. The prompt turns that first conversation into a structured brief: market
analysis, personas, three AI app concepts, an evaluation matrix, a winning concept,
business model, a 90-day low-code roadmap and a platform marketing plan. Running it
through the hive means the brief is ledgered, the rendered prompt is hashed, and any
generated plan stays a **draft** until Barak picks it.

## Flow

| Step | Loop | Trust · cost | Output |
|---|---|---|---|
| Collect | `collect.startup-brief` | L1 · 0 | raw inputs + extras + readiness score |
| Edit | `edit.render-business-plan-prompt` | L1 · 0 | rendered prompt, `promptSha256`, output sections; `blocked_trust` while inputs are missing |
| Edit (optional) | `edit.generate-business-plan` | L1 · 2 | Markdown plan generated in-app with the founder's own key (BYOK) |
| Dispatch | `dispatch.draft` | L1 · human pick | draft to drafts group / Barak — **never** customer |

All three new loops are declared in [`platform/schema/loops.json`](../platform/schema/loops.json);
jobs follow [`platform/schema/job.schema.json`](../platform/schema/job.schema.json).

## The prompt asset contract

Two files in `prompts/` are the single source of truth. The app imports both; the
site or any other hive component can fetch them raw from GitHub.

| File | Role |
|---|---|
| `ai-app-business-plan-generator.md` | the prompt, verbatim, with `{{placeholder}}` syntax |
| `ai-app-business-plan-generator.json` | id, version, variables (type, options, help), extras, output sections, constraints, hive loop names, links |

### Variables

| Placeholder | Appears | Field |
|---|---|---|
| `{{industry_vertical}}` | Context, Input Requirements | free text, examples suggested |
| `{{platform}}` | Context, Inputs, matrix, §8 heading, constraints, success criteria | select + custom |
| `{{platform_follower_count}}` | Context, Inputs | number; `12.5k` renders as `12,500` |
| `{{experience_level}}` | Inputs | select + custom |
| `{{hours_per_week}}` | Inputs | select + custom |
| `{{budget_range}}` | Inputs, constraints | select + custom |

### Extras (optional, appended only)

`output_language` (English leaves the prompt untouched; anything else appends
"write the entire output in …") and `founder_notes`. Both land in a trailing
`## Additional Context` section. The canonical text above it is byte-identical to
the `.md` asset, which is what `edit.render-business-plan-prompt` hashes.

### Versioning

Bump `version` in the JSON whenever the `.md` changes. Hive jobs carry
`template.id` + `template.version`, so old briefs stay traceable to the prompt that
produced them.

## Running the prompt

1. **Anywhere:** Copy / Download `.md` / Open in Claude / Open in ChatGPT from the Prompt tab.
2. **In-app:** Plan tab → paste an Anthropic API key (kept in memory, or on-device only when ticked) → Generate. Streams the plan, renders it, saves it with the brief, exports it inside `edit.generate-business-plan`.

## Laws

- Law #1 — no WhatsApp/email to a founder, customer or supplier from the app.
- Law #2 — `requiresHumanPick: true` on every outbound; `dispatch.draft` only.
- API keys are device-local and never enter briefs, hive jobs or backups.

## Status

| Item | State |
|---|---|
| Canonical prompt asset (`prompts/`) | ✅ |
| PWA (form, live prompt, saved briefs, hive export) | ✅ in code |
| BYOK Claude generation (streaming, refusal handling) | ✅ in code |
| Tests (template, hive, loops consistency) | ✅ `npm test` |
| Loops declared | ✅ `collect.startup-brief`, `edit.render-business-plan-prompt`, `edit.generate-business-plan` |
| Cloudflare Pages project → app.barak-e.com | ⏳ connect to `apps/bee-business-plan` |
| Link from www.barak-e.com | ⏳ after deploy |
| Live supervisor / Alfred ingest of exported JSON | ⏳ after Brain Bus wiring |
