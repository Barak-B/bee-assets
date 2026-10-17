#!/usr/bin/env bash
# cron-restore.sh — Phase 1 Action #2 (re-enable disabled crons)
#
# SOURCE: master-plan-v1-v20.md v15 12.B Action #3
# PROBLEM: 5 crons disabled (per AGENTS.md audit) — morning/evening digests,
#          weekly self-review, gmail-morning-digest, neri-activity reports.
#          Result: Barak misses daily AI summaries.
#
# PRE-CONDITION:
#   - DeepSeek balance > $0 (currently $96.57 ✅)
#   - alfred-router.patched.js applied (Phase 1 Action #1) — so cheaper routing works
#   - Hermes 0.13+ running, port 3000 listening
#   - gmail-morning-digest: STILL skip until OAuth recovered (Action #5)
#
# HOW TO RUN:
#   Windows PowerShell:
#     bash cron-restore.sh
#   OR (if bash not available):
#     execute each `openclaw cron enable` command manually
#
# ROLLBACK:
#   openclaw cron disable <cron-name>  (per individual cron)
#
# VERIFICATION (after run):
#   openclaw cron list | grep enabled

set -euo pipefail

echo "=== Alfred cron restoration — Phase 1 Action #2 ==="
echo ""
echo "Pre-flight checks:"
echo ""

# Check 1: DeepSeek balance signal (via Hermes config or env)
echo "1. DeepSeek balance: check at platform.deepseek.com (should be > \$5)"

# Check 2: alfred-router.patched.js applied?
echo "2. alfred-router.js: ensure Phase 1 Action #1 applied"

# Check 3: Hermes bridge alive
if curl -sS -m 5 http://127.0.0.1:3000/health > /dev/null 2>&1; then
  echo "3. Hermes bridge :3000 — ✓ alive"
else
  echo "3. Hermes bridge :3000 — ✗ NOT responding. Fix before continuing!"
  echo "   Run: hermes gateway status, hermes gateway restart"
  exit 1
fi

echo ""
read -p "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

echo ""
echo "=== Enabling crons ==="
echo ""

# === Cron #1: Morning urgent digest (08:00 daily) ===
echo "▶ morning-urgent-digest (08:00 daily)"
openclaw cron enable morning-urgent-digest && \
  echo "  ✓ enabled" || \
  echo "  ✗ failed — check cron name with: openclaw cron list"

# === Cron #2: Evening urgent digest (22:00 daily) ===
echo "▶ evening-urgent-digest (22:00 daily)"
openclaw cron enable evening-urgent-digest && \
  echo "  ✓ enabled" || \
  echo "  ✗ failed"

# === Cron #3: Weekly self-review (Sun 09:00) ===
echo "▶ weekly-self-review (Sun 09:00)"
openclaw cron enable weekly-self-review && \
  echo "  ✓ enabled" || \
  echo "  ✗ failed"

# === Cron #4 & #5: Neri activity digests (10:00 + 22:00) ===
# CONDITIONAL: only if Neri sync group still active
echo ""
read -p "Re-enable Neri activity digests (10:00 + 22:00)? [y/N] " neri
if [[ "$neri" =~ ^[Yy]$ ]]; then
  echo "▶ morning-activity-neri"
  openclaw cron enable morning-activity-neri && echo "  ✓" || echo "  ✗"
  echo "▶ evening-activity-neri"
  openclaw cron enable evening-activity-neri && echo "  ✓" || echo "  ✗"
fi

# === Cron #6: Gmail morning digest — SKIP until OAuth recovered ===
echo ""
echo "⚠️  SKIPPING gmail-morning-digest — wait for Phase 1 Action #5 (Gmail OAuth recovery)"

echo ""
echo "=== Verifying ==="
openclaw cron list | grep -E "enabled|disabled" | head -20

echo ""
echo "=== Next steps ==="
echo "1. Wait for next 08:00 or 22:00 to see digest arrive in self-chat"
echo "2. If digest doesn't appear within 24h, run heartbeat-watcher.js manually:"
echo "     node scripts/heartbeat-watcher.js --verbose"
echo "3. Check costs: openclaw cost show --since today"
echo ""
echo "Done."
