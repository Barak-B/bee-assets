# Session Handoff — 2026-05-26 Cloud Session

**Read this first.** The plan file (`research/master-plan-v1-v20.md`) is 6,800 lines of context. This document is the **executable summary** so you can start work in 5 minutes.

---

## TL;DR

1. **Pull the latest** from branch `claude/capability-extensions-collection-JjV2s` (PR #2 draft).
2. **Read `research/phase-1/README.md`** — it's the 14-hour execution playbook.
3. **Start with the 30-minute wins**: Action #1 (router fix) + Action #2 (re-enable crons) + Action #5 (heartbeat watcher). These pay for themselves immediately.
4. **THE urgent one** is Action #7 (tender-tracker MVP, 4h) — we lost ₪800K-3M to missed Ashkelon + Kiryat Gat tenders. Build this so it doesn't repeat.
5. Phase 2 (~44h) is blocked on **BEE app source code access** + **workspace.db export**. Surface those when you're ready.

---

## What happened in this cloud session

1. **Started with stale assumptions.** I (the cloud session) had been doing generic Israeli SMB research (Cardcom, Hashavshevet, investment management, mass personal agents) without grounding in your actual data. Barak called this out — "אתה עושה לי פאדיחות בשביל מה נתתי לך את כל המידע עד היום?"

2. **Reset with deep file scans.** Read all 17 files in `research/local-state/` thoroughly (`openclaw/AGENTS.md` 820 lines, `hermes-overview.html`, `alfred-overview.html`, plugins, skills, crons). 4 separate Explore-agent passes.

3. **Built a 20-version plan** (~6,800 lines, `research/master-plan-v1-v20.md`). Key versions:
   - **v10**: Reset — formally discarded ~250h of irrelevant generic plans
   - **v11**: Focused research on 5 actual BEE domains (engineering, Obsidian, customer success, dispatch, proposals)
   - **v12**: WA groups + email + company picture (5 documented groups, 56K Gmail msgs, BEE = 22.7+ MW integrator)
   - **v14**: Critical realities (MCP=0 in both engines, WhatsApp=only active channel, 87 SolarEdge sites monitored, 280.6M Hermes tokens/14d)
   - **v15**: Top-10 actions ranked by ROI/hour + 5-phase roadmap
   - **v16**: Detailed `engineering-agent` + `tender-agent` SKILL.md designs
   - **v18**: 3 confirmed Q's from Barak (tenders missed, BEE has partial portal, bee-hive = planning only)
   - **v19**: 🔥 **Architectural shift** — AI agents write back to BEE app (source of truth), not produce side outputs
   - **v20**: Final Q closure (most active sites have WA groups, Gmail = OAuth issue, bee-ai-watcher never ran)

4. **Built Phase 1 deliverables** — 14 files in `research/phase-1/`, ready to apply locally.

---

## What's on the PR right now

PR #2 (draft): https://github.com/Barak-B/bee-assets/pull/2

New commits in this session:
- `9cbc233` — Add v5 voice pipeline + v6-v20 master plan
- `7bbdcb6` — Add Phase 1 deliverables — 7 actions ready for local execution

Files added:
```
research/voice-and-call-pipeline-v5.md       (922 lines — phone/voicemail pipeline)
research/master-plan-v1-v20.md               (6,832 lines — full context)
research/phase-1/
  README.md
  alfred-router.patched.js
  cron-restore.sh
  heartbeat-watcher.js
  roster.yaml.template
  gmail-oauth-recovery.md
  deepseek-anomaly-hunt.md
  tender-tracker-mvp/
    README.md
    package.json
    config.example.json
    index.js
    gov-rss-poller.js
    monday-board-sync.js
    deadline-watcher.js
```

---

## Phase 1 — Execution order (14h total)

Apply in **this order** — dependencies matter.

### Day 1 morning (~5h, quick wins)

| # | File | Action | Time |
|---|---|---|---|
| 1 | `phase-1/alfred-router.patched.js` | Replace `pickProvider()` in `alfred-router.js`. Smart routing: bulk→deepseek-flash, reasoning→deepseek-v4-pro, quality→Sonnet. | 0.5h |
| 2 | `phase-1/cron-restore.sh` | Re-enable 5 disabled crons (morning/evening digests, weekly self-review, Neri activity). **Skip gmail-morning-digest** — needs OAuth recovery first. | 1h |
| 3 | `phase-1/heartbeat-watcher.js` | New cron daily 23:55. If Hermes 0 tokens/24h → ⚡ alert. Prevents the DeepSeek-$0 silent outage from recurring. | 1h |
| 4 | `phase-1/roster.yaml.template` | Copy to `~/.openclaw/workspace/roster.yaml`. Fill in TODO fields (phones, emails). Wire into `alfred-identity.js` per snippet at bottom of file. | 2h (mostly your input) |

### Day 1 afternoon / Day 2 (~9h, real builds)

| # | File | Action | Time |
|---|---|---|---|
| 5 | `phase-1/gmail-oauth-recovery.md` | Follow 6-step playbook. Restore OAuth for primary `barak@bee.co.il` AND wire up secondary `barak-barzel@barak-e.com`. Re-enable cron at end. | 3h |
| 6 | `phase-1/deepseek-anomaly-hunt.md` | SQL queries to find who's burning 169M tokens on `deepseek-chat`. Fix the caller, add regression guard. Recovers $7/m now, prevents $50/m if compounds. | 3h |
| 7 | `phase-1/tender-tracker-mvp/` | `npm install`, fill `config.json`, register cron. Daily poll of 9 sources (Ashkelon + Kiryat Gat + 7 more) + Monday "Tenders" board auto-create + T-30/14/7/3/1/0 alert chain. | 4h |

### Verification after each step

Every Phase 1 file has a `## Verification` or `## Test` section. Run those before moving on.

---

## What I CAN'T do that you CAN (the cloud limitation)

I had **zero access** to:
- `E:\Desktop\OpenClawAgent\` (Alfred workspace)
- `E:\bee-hermes\` (Hermes workspace)
- `bee-prod-1` (Hetzner VPS — SSH)
- `workspace.db` (WhatsApp DB with 14.6K chats, 1M messages, 704 active)
- BEE Operations app source code (41 routes, 38 Prisma models)
- 22 of 27 `alfred-*.js` scripts (only saw names, not code)
- Live state (cron logs, Hermes state.db queries, etc.)

**Implications:**
- My Phase 1 code is **untested**. Run dry-runs first.
- Schema assumptions (e.g., `session_messages` table in Hermes state.db) may be off — adjust queries to actual schema.
- File paths use my best guess — verify they match your install.
- The router patch assumes existing `alfred-router.js` shape; you may need to merge by hand if your file differs.

**Local Claude Code can verify all of this in minutes.**

---

## Open questions still pending from Barak

These were Q71-Q80 in the plan. Status:

| # | Question | Status |
|---|---|---|
| Q71 | Ashkelon + Kiryat Gat tenders submitted? | ✅ Answered: **NO, missed** |
| Q72 | How many site groups in `site-groups.json`? | ✅ Answered: **most active sites have WA groups** (~150-180) |
| Q73 | BEE Operations app — who uses, customer portal, mobile? | ✅ Answered: **portal for some customers** |
| Q74 | gmail-morning-digest disabled — why? | ✅ Answered: **OAuth issue** |
| Q75 | bee-ai-watcher — how many reviews? | ✅ Answered: **never ran** |
| Q76 | bee-hive status? | ✅ Answered: **planning only, no code** |
| Q77 | deepseek-chat 169M token anomaly source? | ⏳ Auto-discoverable via Action #6 |
| Q78 | Solar @ 35% — what's the biggest gap? | ✅ Answered: **all of it — push to BEE app central hub** (🔥 paradigm shift) |
| Q79 | Hermes L2 agents 15% — which agents? | ✅ Answered: **the 3 local skills** (barak-business-integrations, barak-activity-reporting, alfred-platform-upgrade) |
| Q80 | Connect BEE Operations to Hermes? | ✅ Answered: **yes** |

**Q78 reshaped the architecture entirely** — see v19 16.A in the plan file. Every agent now writes back to BEE app entities, not produces side outputs.

---

## What needs to happen for Phase 2 (~44h)

Phase 2 (Week 2-3) builds the foundation for the rest. **Blocked on access:**

| Blocker | What's needed | Why |
|---|---|---|
| BEE app source code | git clone access | Action #14: write API documentation + AI agent SDK |
| BEE app PostgreSQL | DB schema dump or live read | KG mirror schema design |
| `workspace.db` chat list | sqlite export: `SELECT chat_id, name FROM chats WHERE chat_id LIKE '%@g.us'` | Action #11: build `sites/_mapping.json` for ~150-180 sites |
| bee-prod-1 SSH | for Action #7: Neo4j Docker deploy | KG foundation |

**Once you have a local Claude Code session with access to these, hand it this handoff + the master-plan and it can start Phase 2.**

---

## Architectural notes you'll want to remember

### The 4-destinations constitutional law (v17 14.A.7)

Alfred can ONLY send to 4 destinations:
1. Your self-chat (`+972509554483`)
2. Drafts group (`120363407758194119@g.us` — "מענה לאנשי קשר")
3. Voice transcripts group (`120363409101459201@g.us` — "תמלולים אלפרד")
4. Neri sync group (`120363425994041413@g.us` — "עדכונים על עבודה על התשתיות שלנו")

**Never** site groups (read-only). **Never** customer chats. **Never** unknown contacts.

### Hermes 4-Levels architecture (per shannholmberg)

- **L1** Hermes core = transport (60% built)
- **L2** Specialized agents = your local skills (15% built; needs 5 more agents to reach 50%)
- **L3** bee-hive orchestrator = **planning only** (0% built per Q76)
- **L4** Task Bus (inbox → working → outbox → done) = 0%

`bee-hive` is your future orchestrator, not an unknown component.

### The paradigm shift (Q78 → v19)

```
WRONG:  AI → produce output files → send to user
RIGHT:  AI → produce data → write to BEE app entities → BEE app shows user
```

Every agent (engineering, tender, customer-success, etc.) updates BEE app records. Status of sites/projects/jobs auto-advances through agent activity. BEE app is the **single source of truth**; agents are extensions that capture + augment + write back.

### The 5 WA groups (full taxonomy, v12 9.A)

| Group | JID | Purpose | Capture | Reply |
|---|---|---|---|---|
| Self chat | `+972509554483` | Voice memos input, primary I/O | yes | yes |
| Neri sync | `120363425994041413@g.us` | Activity digests 10:00 + 22:00 | yes | scheduled cron only |
| Drafts | `120363407758194119@g.us` | Reply suggestions for unauthorized senders | no, agent use | only drafts |
| Voice transcripts | `120363409101459201@g.us` | STT results posted by Alfred | no, agent use | only transcripts |
| Site groups (~150-180) | `120363409665555113@g.us` + many | Customer install groups | yes | NEVER — read-only |
| Ai (archived) | `120363305783926068@g.us` | Idea incubator → bee-ai-watcher | yes | never |

### Cost reality

- **DeepSeek balance:** $96.57 (topped up 2026-05-26)
- **May spend:** $23.42 on 570M tokens (deepseek-v4-pro 166M + v4-flash 404M)
- **Hermes 14-day window:** 16,532 messages, 280.6M tokens — that's ~1,180 msgs/day
- **Smart routing potential:** 50-70% savings on bulk operations via DeepSeek-flash vs Anthropic Sonnet

---

## What I recommend the local session do first

```bash
# 1. Pull the branch
git checkout claude/capability-extensions-collection-JjV2s
git pull

# 2. Read in order
cat research/phase-1/README.md
cat research/phase-1/HANDOFF.md   # this file
cat research/master-plan-v1-v20.md | head -200   # context preamble

# 3. Verify your local state matches what I assumed
ls C:\Users\Barak\.openclaw\workspace\
ls C:\Users\Barak\AppData\Local\hermes\
ssh barak@bee-prod-1 'docker ps'

# 4. Start Action #1 (router fix) — 30 min round-trip
code research/phase-1/alfred-router.patched.js
# Compare against existing alfred-router.js, merge by hand if needed.

# 5. Once Action #1 working, move down the list in README.md order.
```

---

## Status of related research files (already pushed)

| File | Status | Relevance |
|---|---|---|
| `research/federation-plan.md` (v1) | ✅ pushed earlier | Foundation — federation thesis |
| `research/tools-deep-audit.md` | ✅ pushed earlier | Bug list (most now in Phase 1) |
| `research/federation-plan-v2.md` | ✅ pushed earlier | RAG + sandbox + Frigate ideas |
| `research/office-automation-architecture.md` (v3) | ✅ pushed earlier | 9-layer architecture |
| `research/deeper-tools-research-v4.md` | ✅ pushed earlier | A2A + SHAAM + voice |
| `research/voice-and-call-pipeline-v5.md` | ✅ pushed this session | Phone/voicemail pipeline |
| `research/master-plan-v1-v20.md` | ✅ pushed this session | **Master document** |
| `research/phase-1/` | ✅ pushed this session | **Executable code** |
| `research/session-handoff.md` | ✅ pushed earlier | Previous handoff (now stale; supersede with this) |

---

## Final note

The cloud session was deliberately verbose (20 plan iterations, many false starts, several reset moments when I got off-track). **Don't read the plan top-to-bottom** — use it as a reference. Phase 1 README + this handoff have the executable summary you need.

The plan file's value is for:
- v15 Top-10 actions (the priority list)
- v19 16.A (the architecture paradigm — read this carefully)
- v16 (the detailed `engineering-agent` + `tender-agent` SKILL.md designs)
- v20 17.E (the build roadmap by week)

Skim those four sections (~600 lines total) and the local session will have everything.

---

_Cloud session ended 2026-05-26 ~05:00 UTC. Next session can pick up here._
