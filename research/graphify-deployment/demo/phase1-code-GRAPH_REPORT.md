# Graph Report - .  (2026-06-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 236 nodes · 432 edges · 19 communities (13 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `log()` - 14 edges
2. `processEvent()` - 14 edges
3. `processVoiceEvent()` - 12 edges
4. `processEvent()` - 12 edges
5. `db()` - 11 edges
6. `selfTest()` - 11 edges
7. `selfTest()` - 10 edges
8. `log()` - 9 edges
9. `selfTest()` - 9 edges
10. `ingestText()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `enrich()` --calls--> `plan()`  [INFERRED]
  alfred-enrich.js → alfred-swarm.js
- `dispatchSend()` --calls--> `isAllowedDestination()`  [EXTRACTED]
  alfred-intake.js → alfred-inbound-watcher.js
- `eventToMessage()` --calls--> `normalizeTs()`  [EXTRACTED]
  alfred-intake.js → alfred-inbound-watcher.js
- `makeEvent()` --calls--> `normalizeTs()`  [EXTRACTED]
  alfred-intake.js → alfred-inbound-watcher.js
- `processEvent()` --calls--> `resolveOutbound()`  [EXTRACTED]
  alfred-intake.js → alfred-inbound-watcher.js

## Import Cycles
- None detected.

## Communities (19 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (39): ALLOWED, archiveArtifacts(), archiveVoice(), ARGV, BRIDGE_URL, dispatchSend(), FAILED_FILE, fs (+31 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (26): addRelation(), arg(), crypto, Database, db(), extractAmount(), findEntity(), fs (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (25): ARGV, BRIDGE_URL, dispatchSend(), eventToMessage(), fromCron(), fromGmail(), fromManual(), fs (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (22): addIndex(), appendConversation(), archiveFile(), archiveSummary(), archiveText(), archiveTranscript(), arg(), crypto (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (20): ACTIVE_STUCK, crypto, Database, db(), fs, get(), getArg(), list() (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (19): ALLOW_UNPAIRED, BRIDGE_ERR, BRIDGE_OUT, fs, HOME, isRegistered(), log(), LOG_DIR (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.19
Nodes (15): CATEGORIES, fs, getRoster(), loadRoster(), normalizeEmail(), normalizePhone(), os, parseRosterYaml() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.35
Nodes (9): deliver(), formatAlert(), getArg(), hasFlag(), main(), os, path, runSweep() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.35
Nodes (10): AGENTS, CAPABILITY_OWNER, INTENTS, main(), plan(), PLANS, route(), s() (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (9): bee, enrich(), main(), path, PLANS, resolveClient(), resolveSite(), safe() (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.38
Nodes (6): check(), Database, DRY_RUN, getTokensLast24h(), path, sendAlert()

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (3): classifyTask(), pickProvider(), PROVIDER_PRIORITY

### Community 12 - "Community 12"
Cohesion: 0.83
Nodes (3): check(), warn(), smoke-test.sh script

## Knowledge Gaps
- **83 isolated node(s):** `fs`, `path`, `crypto`, `INDEX`, `TYPE_DIR` (+78 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `plan()` connect `Community 8` to `Community 9`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `enrich()` connect `Community 9` to `Community 8`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `normalizeTs()` connect `Community 0` to `Community 2`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `crypto` to the rest of the system?**
  _83 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11219512195121951 - nodes in this community are weakly interconnected._
- **Should `Community 5` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._