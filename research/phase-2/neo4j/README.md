# Neo4j KG — Phase 2 Action #7

**Source:** master-plan-v1-v20.md v6 3.A + v15 12.B
**Deploy target:** bee-prod-1 (Hetzner CX52)
**Cost:** $0 (Community edition)
**Time:** ~19h (deploy 5h + schema 6h + 2 seed scripts 8h)

## ⚡ Quick start (~30 min if everything ready)

```bash
ssh barak@bee-prod-1

# 1. Pull files
mkdir -p ~/bee-neo4j && cd ~/bee-neo4j
# Copy from this repo:
#   docker-compose.yml
#   .env.example -> .env (fill NEO4J_PASSWORD)
#   schema.cypher
#   seed-from-roster.py
#   verify.cypher

# 2. Set password
cp .env.example .env
nano .env   # set NEO4J_PASSWORD=$(openssl rand -base64 24)

# 3. Create host data dirs
sudo mkdir -p /var/lib/bee-neo4j/{data,logs,import,plugins}
sudo chown -R 7474:7474 /var/lib/bee-neo4j   # neo4j uid

# 4. Boot
docker compose up -d
docker compose logs -f bee-neo4j
# Wait for "Started." line

# 5. Apply schema
docker exec -i bee-neo4j cypher-shell -u neo4j -p $(grep PASSWORD .env | cut -d= -f2) < schema.cypher

# 6. Seed roster
pip install neo4j pyyaml
NEO4J_PASSWORD=$(grep PASSWORD .env | cut -d= -f2) \
  python3 seed-from-roster.py \
  --roster /path/to/roster.yaml \
  --neo4j-uri bolt://localhost:7687

# 7. Verify
docker exec -i bee-neo4j cypher-shell -u neo4j -p $PWD < verify.cypher
```

## 🌐 Access from local PC

```powershell
# SSH tunnel from Windows PC
ssh -L 7474:127.0.0.1:7474 -L 7687:127.0.0.1:7687 barak@bee-prod-1

# Then open http://localhost:7474 in browser
# Username: neo4j  /  Password: (from .env)
```

## 📐 Schema overview

13 node labels:

```cypher
:Person      // employees + contractors + inspectors (16 from roster seed)
:Self        // marker label for Barak (subset of :Person)
:Customer    // 137 total — 10 from roster, rest via BEE snapshot
:Site        // 255 — via BEE snapshot
:Project     // commercial engagements (Q73 paradigm)
:Job         // units of work
:Equipment   // 149 inverters + batteries + panels — via BEE snapshot
:Supplier    // Prime Energy + others
:Tender      // tender-tracker MVP + Phase 3a tender-agent
:Quote       // proposal-generator output
:Invoice     // Invoice Maven sync
:Call        // v5 voice pipeline
:Message     // WA + Email captures
:Lead        // Monday Leads board sync
:System      // sync markers
```

Key relationships:

```cypher
(:Customer)-[:HAS_PROJECT]->(:Project)
(:Project)-[:AT_SITE]->(:Site)
(:Project)-[:CONTAINS]->(:Job)
(:Site)-[:HAS_EQUIPMENT]->(:Equipment)
(:Job)-[:ASSIGNED_TO]->(:Person)
(:Quote)-[:LED_TO]->(:Project)
(:Tender)-[:RESULTED_IN]->(:Project)  // if won
(:Equipment)-[:SUPPLIED_BY]->(:Supplier)
(:Message)-[:MENTIONS]->(:Person|:Site|:Equipment)
(:Call)-[:WITH]->(:Person)
```

## 🔁 Sync to BEE app (Q78 paradigm)

Per v19, KG mirrors BEE app data — does NOT replace it. Sync flow:

```
BEE App PostgreSQL (source of truth)
       │
       │ (1) hourly snapshot export
       ▼
JSON dumps in ~/bee-prod-1/data/exports/
       │
       │ (2) seed-from-bee-snapshot.py
       ▼
Neo4j KG (read mirror for graph queries)
       │
       │ (3) Alfred/Hermes query KG for cross-entity questions
       │     ("which customer is at site X? which jobs blocked by Y?")
       ▼
Outputs → back to BEE App via bee-mcp-server (Phase 2 Action #15)
```

`seed-from-bee-snapshot.py` is TBD — requires BEE app source for schema knowledge.

## ⚠️ Operational notes

### Backup

Phase 2 deploys WITHOUT backup. Phase 5 adds nightly snapshot to Backblaze B2:

```bash
# Manual backup (until Phase 5 automation)
docker exec bee-neo4j neo4j-admin database dump --to-path=/import neo4j
ssh barak@bee-prod-1 'gpg --output - /var/lib/bee-neo4j/import/neo4j.dump | aws s3 cp - s3://bee-backup/neo4j-$(date +%Y%m%d).dump.gpg'
```

### Security

- Bind to 127.0.0.1 only (compose file enforces)
- Strong password from openssl rand
- GDS procedures allowlisted
- No public network exposure — Tailscale or SSH tunnel only

### Resource sizing

- 100K nodes ≈ 2GB RAM heap + 1GB pagecache
- BEE current scale (137 customers + 255 sites + 1.4K jobs + 1M WA messages potential)
  fits comfortably in 4GB total
- Bump heap to 4G if jobs/messages explode

## 🔗 Next steps after seed

1. Build `seed-from-bee-snapshot.py` — Barak provides PostgreSQL schema dump
2. Wire `bee-mcp-server` (Phase 2 Action #15) — KG read access for Alfred + Hermes
3. Hourly sync cron — BEE PG → KG
4. Start Phase 3a (tender-agent) — first user of the KG

## 🧪 Test queries (after full seed)

```cypher
// "Which customers have >5 sites with low production this week?"
MATCH (c:Customer)-[:HAS_PROJECT]->(p:Project)-[:AT_SITE]->(s:Site)
WHERE s.last_production_kwh < s.expected_production_kwh * 0.8
WITH c, count(DISTINCT s) AS lowSites
WHERE lowSites > 5
RETURN c.name_he, lowSites
ORDER BY lowSites DESC;

// "Who's our top supplier by spend YTD?"
MATCH (sup:Supplier)<-[:SUPPLIED_BY]-(e:Equipment)
WHERE e.install_date >= date('2026-01-01')
RETURN sup.name, count(e) AS units, sum(e.cost_nis) AS total_spend
ORDER BY total_spend DESC LIMIT 5;

// "Which technician has the most open jobs?"
MATCH (j:Job {status: 'open'})-[:ASSIGNED_TO]->(p:Person)
RETURN p.name_he, count(j) AS open_jobs ORDER BY open_jobs DESC;
```
