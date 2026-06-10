# Graph Report - .  (2026-06-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 452 nodes · 757 edges · 32 communities (23 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `688fded8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 16 edges
2. `main()` - 16 edges
3. `log()` - 14 edges
4. `processEvent()` - 14 edges
5. `processVoiceEvent()` - 12 edges
6. `processEvent()` - 12 edges
7. `db()` - 11 edges
8. `selfTest()` - 11 edges
9. `mcpCall()` - 11 edges
10. `selfTest()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `enrich()` --calls--> `plan()`  [INFERRED]
  phase-1/alfred-enrich.js → phase-1/alfred-swarm.js
- `dispatchSend()` --calls--> `isAllowedDestination()`  [EXTRACTED]
  phase-1/alfred-intake.js → phase-1/alfred-inbound-watcher.js
- `eventToMessage()` --calls--> `normalizeTs()`  [EXTRACTED]
  phase-1/alfred-intake.js → phase-1/alfred-inbound-watcher.js
- `makeEvent()` --calls--> `normalizeTs()`  [EXTRACTED]
  phase-1/alfred-intake.js → phase-1/alfred-inbound-watcher.js
- `processEvent()` --calls--> `resolveOutbound()`  [EXTRACTED]
  phase-1/alfred-intake.js → phase-1/alfred-inbound-watcher.js

## Import Cycles
- None detected.

## Communities (32 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (37): buildMessage(), daysUntil(), runDeadlineWatcher(), sendAlert(), extractDeadline(), extractTendersFromHtml(), pad(), pollAllSources() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (34): DRY_RUN, formatCash(), formatCompleted(), formatNextWeek(), formatSlipped(), formatWeekend(), formatWins(), hebrewDateString() (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (37): ALLOWED, archiveArtifacts(), archiveVoice(), ARGV, BRIDGE_URL, dispatchSend(), FAILED_FILE, fs (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (35): alert_thresholds_days, alfred, alert_destination, hermes_bridge_url, self_phone_e164, bee_tender_id, deadline, estimated_value (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (27): resolveOutbound(), resolveTargetJid(), ARGV, BRIDGE_URL, dispatchSend(), eventToMessage(), fromCron(), fromGmail() (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (26): addRelation(), arg(), crypto, Database, db(), extractAmount(), findEntity(), fs (+18 more)

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (22): addIndex(), appendConversation(), archiveFile(), archiveSummary(), archiveText(), archiveTranscript(), arg(), crypto (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (20): ACTIVE_STUCK, crypto, Database, db(), fs, get(), getArg(), list() (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (19): bee, enrich(), main(), path, PLANS, resolveClient(), resolveSite(), safe() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (19): ALLOW_UNPAIRED, BRIDGE_ERR, BRIDGE_OUT, fs, HOME, isRegistered(), log(), LOG_DIR (+11 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (12): allTools, ctx, httpServer, PORT, server, toolMap, transport, alertTools (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (15): fetchWithFirecrawlFallback(), firecrawlScrape(), needsFirecrawl(), config, db, __dirname, DRY_RUN, extractWithLLM() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (15): CATEGORIES, fs, getRoster(), loadRoster(), normalizeEmail(), normalizePhone(), os, parseRosterYaml() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (14): dependencies, dotenv, @modelcontextprotocol/sdk, node-fetch, description, license, main, name (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (14): dependencies, better-sqlite3, node-fetch, rss-parser, yaml, description, license, main (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.35
Nodes (9): deliver(), formatAlert(), getArg(), hasFlag(), main(), os, path, runSweep() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.31
Nodes (7): load_roster(), main(), parse_args(), Generic :Person seeder. category_key = 'employees' | 'contractors' | etc., seed_customers(), seed_persons(), seed_suppliers()

### Community 17 - "Community 17"
Cohesion: 0.36
Nodes (6): args, __dirname, loadBeeSites(), loadWaGroups(), main(), scoreMatch()

### Community 18 - "Community 18"
Cohesion: 0.38
Nodes (6): check(), Database, DRY_RUN, getTokensLast24h(), path, sendAlert()

### Community 19 - "Community 19"
Cohesion: 0.83
Nodes (3): check(), smoke-test.sh script, warn()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (3): classifyTask(), pickProvider(), PROVIDER_PRIORITY

### Community 21 - "Community 21"
Cohesion: 0.50
Nodes (3): 120363409665555113@g.us, _comment, _example_only_120000000000000001@g.us

## Knowledge Gaps
- **166 isolated node(s):** `deploy.sh script`, `index-bee-app.sh script`, `prepare-fork.sh script`, `rollback.sh script`, `verify-network-egress.sh script` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `deploy.sh script`, `index-bee-app.sh script`, `prepare-fork.sh script` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08859357696567 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13225371120107962 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11605937921727395 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05873015873015873 - nodes in this community are weakly interconnected._
- **Should `Community 9` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._
- **Should `Community 10` be split into smaller, more focused modules?**
  _Cohesion score 0.13450292397660818 - nodes in this community are weakly interconnected._