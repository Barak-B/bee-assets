# Port probe — 2026-07-11 ~20:57 Asia/Jerusalem

```
18789 Listen  PID 33716  → OpenClaw Gateway
3002  Listen  PID 22192  → Brain Server
3000  Listen  PID 25120  → node.exe (WhatsApp Bridge — protected)
3100  (none)             → Hermes NOT listening
```

## Conclusions

1. **bee-hive "Hermes bridge offline :3000" is misleading.** Port 3000 is up; owner is `node` WhatsApp Bridge, not a dead port.
2. **Hermes itself is down on the wired port 3100.** Config was updated (`bridge_port: 3100`, `external_dirs` bee-canon) but no process is bound to 3100 — restart/start Hermes did not happen or failed.
3. **Alfred/OpenClaw path is live** (18789) — Brain Bus Q&A for Alfred can proceed now.
4. **Hermes Brain Bus Q&A blocked** until Hermes gateway is started and `3100` shows Listen.

## Next commands (Barak)

```powershell
# Start Hermes the way you usually do (examples — use your real entrypoint):
# hermes gateway start
# OR from E:\bee-hermes / Task Scheduler / Plugin Manager if a Hermes row exists

# After start:
Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue |
  Select-Object LocalPort,State,OwningProcess
```

Then ask Alfred (and Hermes once 3100 is up): bank + VAT cadence.
