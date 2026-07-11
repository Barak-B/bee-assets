# Phase 1 Action #6 — DeepSeek-chat Anomaly Hunt

**Source:** master-plan-v1-v20.md v14 11.F.5 + v15 12.B Action #2 + v17 14.G  
**Time:** ~3h  
**Risk:** 🟢 low (pure investigation)  
**Expected ROI:** $50/month savings (30% Hermes cost reduction)

## ה-context

Per `hermes-overview.html`:
> "CLI sessions = 59% מהטוקנים מ-2.5% מהsessions (heavy!) · **deepseek-chat anomaly (169M tokens unexplained)**."

**169M tokens** on model `deepseek-chat` (= legacy deepseek-v3?) — no one knows who's calling it or why. At ~$0.04/M tokens that's ~$7/month wasted; if anomaly grows ~$50/month.

Three hypotheses:
1. **Legacy skill still hardcoded to `deepseek-chat`** (older model name from Hermes 0.11 era)
2. **A loop / retry bug** — some skill calling repeatedly
3. **An unmaintained cron** writing voluminous output to /dev/null

## Investigation playbook

### Step 1: Confirm the anomaly is real (10 min)

```bash
# On bee-prod-1 or wherever Hermes runs
ssh barak@bee-prod-1
cd ~/.local/share/hermes/  # or wherever state.db lives

# Query 1: tokens by model, last 14 days
sqlite3 state.db <<'SQL'
SELECT
  model,
  COUNT(*) AS calls,
  SUM(input_tokens) AS in_tokens,
  SUM(output_tokens) AS out_tokens,
  SUM(input_tokens + output_tokens) AS total_tokens,
  ROUND(AVG(input_tokens + output_tokens)) AS avg_per_call
FROM session_messages
WHERE created_at > datetime('now', '-14 days')
GROUP BY model
ORDER BY total_tokens DESC;
SQL
```

Expected output:
```
deepseek-v4-pro       ~9300 calls   ~166M tokens   avg ~17.8K
deepseek-v4-flash     ~6600 calls   ~404M tokens   avg ~61K
deepseek-chat         ~???? calls   ~169M tokens   avg ~???? ← THE ANOMALY
```

If `deepseek-chat` doesn't appear → anomaly already self-resolved.

### Step 2: Identify the caller (20 min)

```bash
# Query 2: who's calling deepseek-chat? group by skill/session
sqlite3 state.db <<'SQL'
SELECT
  skill_name,
  session_id,
  COUNT(*) AS calls,
  SUM(input_tokens + output_tokens) AS tokens,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM session_messages
WHERE model = 'deepseek-chat'
  AND created_at > datetime('now', '-14 days')
GROUP BY skill_name, session_id
ORDER BY tokens DESC
LIMIT 20;
SQL
```

Likely culprits:
- A **CLI session** (the "59% from 2.5%" hint)
- A **cron job** with hardcoded model name
- A **plugin** that didn't get model-update treatment

### Step 3: Sample the actual prompts (15 min)

```bash
# Query 3: what is deepseek-chat being asked to do?
sqlite3 state.db <<'SQL'
SELECT
  skill_name,
  substr(prompt, 1, 200) AS prompt_snippet,
  input_tokens,
  output_tokens,
  created_at
FROM session_messages
WHERE model = 'deepseek-chat'
ORDER BY input_tokens DESC
LIMIT 10;
SQL
```

This reveals **what** is being processed. If it's:
- Customer messages → fix routing
- Code review / dev work → fine, but consider migrating to v4-pro
- Logs / debug → ELIMINATE — pipe to /dev/null instead

### Step 4: Find the hardcoded reference (30 min)

```bash
# Search Hermes codebase for hardcoded 'deepseek-chat'
cd ~/code/hermes-agent   # or wherever Hermes source lives
grep -rn "deepseek-chat" --include="*.py" --include="*.js" --include="*.yaml" --include="*.toml" --include="*.json"

# Search skills
cd ~/.local/share/hermes/skills
grep -rn "deepseek-chat" --include="*.md" --include="*.py" --include="*.js"

# Also check workspace SKILL.md files
grep -rn "deepseek-chat" ~/.config/hermes/

# And check env files
grep -i "deepseek" ~/.env ~/.bashrc ~/.zshrc 2>/dev/null
```

Typical findings:
- `default_model: deepseek-chat` in some skill's frontmatter
- `MODEL = 'deepseek-chat'` in legacy Python helper
- A migration leftover from Hermes 0.11 → 0.13

### Step 5: Fix (15 min)

Once located, update to:

```yaml
# OLD (legacy)
default_model: deepseek-chat

# NEW (smart routing — match v9 Step 1 + Phase 1 Action #1 logic)
default_model: deepseek-v4-flash   # for bulk
# OR
default_model: deepseek-v4-pro     # for reasoning
# OR
default_model: claude-sonnet-4-6   # for high quality
```

### Step 6: Re-test (10 min)

```bash
# After fix, run the suspect skill / cron once
hermes skill run <skill-name> --dry-run

# Verify it no longer uses deepseek-chat
sqlite3 state.db "SELECT model, COUNT(*) FROM session_messages WHERE created_at > datetime('now', '-10 minutes') GROUP BY model;"
# deepseek-chat should not appear
```

### Step 7: Add regression guard (15 min)

Add to heartbeat-watcher or a separate cron:

```javascript
// alert if deepseek-chat usage > 0 going forward
const legacyUse = db.prepare(`
  SELECT COUNT(*) AS n
  FROM session_messages
  WHERE model = 'deepseek-chat'
    AND created_at > datetime('now', '-24 hours')
`).get();

if (legacyUse.n > 0) {
  await sendAlert(`⚠️ deepseek-chat anomaly resurfaced — ${legacyUse.n} calls in 24h. Investigate.`);
}
```

---

## Possible findings & responses

### Finding A: CLI sessions (most likely)

**Pattern:** Barak (or Claude Code locally) was running `hermes "..."` from terminal with default model set to `deepseek-chat`.

**Fix:** Update Hermes config:
```yaml
# ~/.config/hermes/config.yaml
model:
  cli_default: deepseek-v4-pro  # or claude-sonnet
```

### Finding B: Hardcoded in a skill

**Pattern:** A `barak-business-integrations` or similar local skill has `model: deepseek-chat` in frontmatter.

**Fix:** Edit SKILL.md, update model, restart Hermes.

### Finding C: Loop bug

**Pattern:** A cron retries on failure without exponential backoff, eating tokens.

**Fix:** Add retry limit + circuit breaker.

### Finding D: Anomaly already gone

**Pattern:** When you query state.db now, `deepseek-chat` doesn't appear in last 24h.

**Reason:** DeepSeek 402 incident (May 22) may have killed whatever was using it. Now that balance restored, watch for next 7 days.

**Action:** Add the regression guard from Step 7 and move on.

---

## Documentation

After fixing, document in `~/.openclaw/workspace/memory/2026-05-26.md`:

```markdown
## DeepSeek anomaly resolved
- Cause: <what you found>
- Fix: <what you changed>
- Verified: <how>
- Savings: ~$X/month
- Prevention: heartbeat-watcher updated to alert on `deepseek-chat` usage
```

---

## ROI calc

| Scenario | Monthly cost |
|---|---|
| Before fix (169M tokens × $0.04/M) | ~$6.76 |
| After fix (0 tokens on deepseek-chat) | $0 |
| If anomaly compounds untreated | ~$50-100 |

Plus indirect: identifying the bad pattern prevents similar issues in future skills.

---

## Next

After anomaly hunt, **continue v15 12.B Top-10**:
- Action #3: cron-restore (parallel to this — quick to run)
- Action #5: heartbeat-watcher (proactive defense)
- Action #6: Gmail OAuth (separate doc)
