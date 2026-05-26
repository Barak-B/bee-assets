# Wave 9 — Langfuse Self-Host Deploy Runbook

**יעד:** bee-prod-1 (Hetzner CX52, Tailscale-only · 16 vCPU / 32 GB / 320 GB)
**זמן:** ~30 דקות בפעם ראשונה
**תוצאה:** Langfuse v3 + PostgreSQL + ClickHouse + Redis + MinIO רץ ב-docker-compose, חשוף רק על Tailscale subnet

**Status:** SSH מ-Claude session היה flaky (תפסה timeout אחרי enumeration probe — fail2ban?). הפעולה הזו דורשת shell יציב לכמה דקות. בצע בעצמך בכלים שלך.

## למה Langfuse?

מתוך מחקר Wave 9: Langfuse v3 (MIT) = ה-stack המוביל ל-LLM observability + experiments + auto-tuning ב-2026. תחליף Helicone (now in maintenance). מאפשר:
- 📊 **Tracing מלא** של כל Alfred LLM call (input/output/cost/latency)
- 🧪 **Prompt experiments** — A/B prompt versions on production traffic
- 📈 **Versioned datasets** — replay state.db sessions against new prompts
- 🎯 **LLM-as-judge evaluators** — "next user msg = correction" auto-scoring
- 🚨 **Auto-rollback** via API if judge-score regresses

## דרישות מקדימות

- [x] bee-prod-1 SSH access (root@bee-prod-1 דרך Tailscale)
- [x] Docker + docker-compose installed (Hetzner default has it)
- [x] ≥4 vCPU + 8 GB free (CX52 has 16/32 — plenty)
- [x] ≥10 GB disk free
- [ ] **Run from regular shell** (not flaky Claude session)

## Commands — copy/paste sequentially

### Step 1 — SSH in + assess
```bash
ssh root@bee-prod-1

# Sanity check
free -h
df -h /
docker --version
docker ps -a | head -10
ss -tnl | grep -E ':(3000|5432|6379|9000|8123)' || echo "Ports clear"
```

If port 3000 is in use → choose alt port (e.g., 4000) and adjust below.
If memory < 8GB free → check what else is running.

### Step 2 — Clone Langfuse
```bash
cd /opt
git clone https://github.com/langfuse/langfuse.git langfuse
cd langfuse
git checkout main  # or pin to v3.x latest stable
```

### Step 3 — Generate secrets + write .env
```bash
cd /opt/langfuse

# Generate 4 secrets
NEXTAUTH_SECRET=$(openssl rand -hex 32)
SALT=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
LANGFUSE_INIT_USER_PASSWORD=$(openssl rand -hex 16)

# Get Tailscale IP for binding
TS_IP=$(ip -4 addr show tailscale0 | awk '/inet/ {print $2}' | cut -d/ -f1)
echo "Tailscale IP: $TS_IP"
# Likely 100.90.97.36 — confirms

cp .env.dev.example .env

# Write minimal production .env
cat > .env <<EOF
# Public URL — accessed via Tailscale only
NEXTAUTH_URL=http://${TS_IP}:3000
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
SALT=${SALT}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Telemetry off
TELEMETRY_ENABLED=false
LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true

# Init user (login first time)
LANGFUSE_INIT_ORG_ID=bee
LANGFUSE_INIT_ORG_NAME=BEE
LANGFUSE_INIT_PROJECT_ID=alfred
LANGFUSE_INIT_PROJECT_NAME=Alfred
LANGFUSE_INIT_USER_EMAIL=barak-barzel@barak-e.com
LANGFUSE_INIT_USER_PASSWORD=${LANGFUSE_INIT_USER_PASSWORD}
LANGFUSE_INIT_USER_NAME=Barak

# Databases — defaults from docker-compose
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_MIGRATION_URL=clickhouse://clickhouse:9000
CLICKHOUSE_USER=clickhouse
CLICKHOUSE_PASSWORD=clickhouse
CLICKHOUSE_CLUSTER_ENABLED=false
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_AUTH=mypassword

# MinIO (S3-compatible)
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_EVENT_UPLOAD_REGION=auto
LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID=minio
LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=miniosecret
LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT=http://minio:9000
LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE=true
LANGFUSE_S3_EVENT_UPLOAD_PREFIX=events/

LANGFUSE_S3_MEDIA_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_MEDIA_UPLOAD_REGION=auto
LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID=minio
LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=miniosecret
LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT=http://minio:9000
LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE=true
LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=media/
EOF

echo "Init password (save this): $LANGFUSE_INIT_USER_PASSWORD"
chmod 600 .env
```

### Step 4 — Launch
```bash
# Pull images (~5 minutes)
docker compose pull

# Start in detached mode
docker compose up -d

# Watch startup (Ctrl+C to exit log)
docker compose logs -f --tail=20
# Wait for "Listening on port 3000" in langfuse-web logs (~60s after pull)
```

### Step 5 — Verify
```bash
# Check all 6 containers up
docker compose ps

# Should see: postgres, clickhouse, redis, minio, langfuse-web, langfuse-worker (all "running")

# Health check
curl -s http://localhost:3000/api/public/health | jq
# Expected: {"status":"OK","version":"v3.x.x"}
```

### Step 6 — Open UI from Windows
On Windows machine (Tailscale connected):
```
Browser → http://100.90.97.36:3000
# Login: barak-barzel@barak-e.com + password from .env
# Will land in BEE org, Alfred project
```

### Step 7 — Generate API keys
In Langfuse UI:
1. Settings → API Keys → Create new
2. Save: `LANGFUSE_PUBLIC_KEY` (pk-lf-...) + `LANGFUSE_SECRET_KEY` (sk-lf-...)
3. Save: `LANGFUSE_HOST=http://100.90.97.36:3000`

### Step 8 — Firewall hardening
On bee-prod-1:
```bash
# Allow Tailscale only (not public internet)
ufw status verbose
# If not configured, set up:
ufw default deny incoming
ufw allow in on tailscale0 to any port 3000   # Langfuse UI
ufw allow in on tailscale0 to any port 22     # SSH
ufw allow in on tailscale0 to any port 6333 2>/dev/null  # Qdrant future
ufw enable
```

### Step 9 — Backup automation
```bash
# Add nightly backup cron
cat > /etc/cron.daily/langfuse-backup <<'EOF'
#!/bin/bash
set -e
DST=/var/backups/langfuse
mkdir -p "$DST"
cd /opt/langfuse
docker compose exec -T postgres pg_dump -U postgres postgres | gzip > "$DST/pg-$(date +%F).sql.gz"
# Keep 7 days
find "$DST" -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/langfuse-backup
```

## Steps 10+ — Instrument Alfred (after deploy)

### On Windows (Alfred's machine)
```bash
cd E:\Desktop\OpenClawAgent
npm install langfuse openllmetry-traceloop

# Edit secrets/bee-integrations.env — add:
echo 'LANGFUSE_PUBLIC_KEY=pk-lf-...' >> secrets/bee-integrations.env
echo 'LANGFUSE_SECRET_KEY=sk-lf-...' >> secrets/bee-integrations.env
echo 'LANGFUSE_HOST=http://100.90.97.36:3000' >> secrets/bee-integrations.env
```

### Patch alfred-router.js
Replace existing telemetry section with Langfuse tracing:
```javascript
const { Langfuse } = require("langfuse");
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
});

// In classify():
const trace = langfuse.trace({ name: "alfred-router-classify", input: { text, sender, source } });
const generation = trace.generation({
  name: "intent-classification",
  model: cfg.model,
  modelParameters: { provider: cfg.kind, tier: cfg.tier },
  input: { messages },
  metadata: { sessionId: message.sessionId, intent_predicted: parsed.intent }
});
// ... after API call
generation.end({ output: parsed, usage: { input: j.usage.input_tokens, output: j.usage.output_tokens } });
trace.update({ output: parsed });
await langfuse.flushAsync();
```

### Wire next-msg-correction judge
After `alfred-correction-detector.processInbound()` (already integrated):
```javascript
if (corr.matched) {
  // Existing logging...
  langfuse.score({
    traceId: corr.previousTraceId, // need to add traceId to watch payload
    name: "correction",
    value: 0,  // 0 = bad, 1 = good
    comment: `Barak corrected with: ${text.slice(0, 200)}`
  });
}
```

### Add datasets (one-time)
In Langfuse UI: Datasets → Create
- Name: `alfred-hebrew-classification`
- Description: `Past WhatsApp messages with confirmed intents`
- Import from `decisions.sqlite` once you have 50+ rows

## Steps 11+ — Inspect AI nightly Hebrew suite

Separate setup, after Langfuse stable. See [research/continuous-learning-plan.md](https://github.com/Barak-B/bee-assets/blob/claude/capability-extensions-collection-JjV2s/research/continuous-learning-plan.md) §Layer 5.

## Rollback

If anything breaks:
```bash
cd /opt/langfuse
docker compose down -v   # ⚠️ -v deletes volumes (full reset)
# OR just stop without data loss:
docker compose down      # keeps volumes
```

## Cost estimate

| Resource | Monthly |
|---|---|
| Hetzner CX52 (already paid) | €0 marginal |
| Anthropic Haiku 4.5 (judge, ~10K calls/mo) | ~$5 |
| Total Langfuse overhead | **~$5/mo** |

## Verify it's working

After Alfred runs for a few hours with instrumentation:
- Langfuse UI → Tracing → should see Alfred sessions
- Settings → Projects → Alfred → Stats → should show events
- If empty after 1 hour with traffic — check `LANGFUSE_HOST` reachable from Windows, check API keys saved correctly

---

*נכתב 2026-05-26 17:00. SSH to bee-prod-1 from Claude session was flaky (likely fail2ban after enumeration probe). Runbook ready for manual execution from stable terminal.*
