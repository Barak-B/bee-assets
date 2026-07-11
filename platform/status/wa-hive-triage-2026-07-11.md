# WA self-chat triage — bee-hive status 2026-07-11

> From Barak's WhatsApp self-chat (`bee-hive` / `bee-desktop` digests) after Brain Bus wire.

## Urgent (from hive digest)

| # | Item | Notes / action |
|---|---|---|
| 1 | **Hermes WA bridge "offline :3000"** | Hive says restart Hermes. **Conflict:** Plugin Manager showed `(3000:) WhatsApp Bridge` 🟢 protected at ~20:41. Re-check `Test-NetConnection localhost -Port 3000` and which process owns 3000 vs Hermes `bridge_port: 3100` (we set 3100 in config — hive text may still assume 3000). |
| 2 | **Cognee API key on bee-prod** | `ssh` → `/srv/bee/cognee/.env` → `ANTHROPIC_API_KEY` → `docker compose restart cognee-api`. **Do not paste keys into chat/git.** If key appeared in a screenshot shared externally — rotate. |
| 3 | **Claude routines** | Register `ledger-recon` + chain: morning-briefing → site-health-sweep → cash-followup → weekly-tender-sweep on claude.ai/code/routines. |
| 4 | **Solar telemetry collapse** | Digest: 20+ sites no data 48h; bee-desktop coverage **89/144 → 1/144**. Separate from Brain Bus — check SolarEdge/iSolarCloud tokens + `Inbound Watcher` / monitoring path. |
| 5 | **Google Calendar OAuth** | Token missing/invalid — refresh (known Phase-1 leftover). |

## Not Brain-Bus blockers

- Voice note transcription request — Alfred Wave-12 voice path if live.
- Late pings "אהלן נרמס" / "אלפרד?" — agents may not have answered if bridge/session odd.

## Port map (reconcile)

| Port | Who (expected) | Tonight's evidence |
|---|---|---|
| 18789 | OpenClaw gateway | Plugin Manager 🟢 |
| **3000** | WA Bridge (Alfred transport / protected) | Plugin Manager 🟢 · Hive claims Hermes offline here |
| **3100** | Hermes `bridge_port` after our wire | Config written; confirm Hermes process listens |
| 3002 | Brain Server | Plugin Manager 🟢 |

**Hypothesis:** Hive digest still labels "Hermes bridge :3000" while the protected WA bridge on 3000 is a BEE-supervised process (not Hermes). After moving Hermes to 3100, digests that probe :3000 for "Hermes" will false-alarm. Fix: update hive healthcheck to probe the correct owner/port, or confirm Hermes should still own 3000 (would contradict protocol Alfred≈3000 / Hermes≈3100).

## Ordered next 15 minutes

1. Confirm ports: 3000 / 3100 / 18789 listening + process names.
2. Restart Hermes gateway once; ask bank/VAT Q&A (Brain Bus verify).
3. Cognee key on server (private) if cognee is needed tonight.
4. Telemetry outage = separate firefight (tokens/APIs), not canon wire.
