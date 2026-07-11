# Live Plugin Manager snapshot — 2026-07-11

> Captured from Barak's **BEE Plugin Manager** UI after Brain Bus wire.

## Running (all up)

| Plugin | Port / note | Status |
|---|---|---|
| Hebrew dictation + AHK interceptor | hotkeys | 🟢 |
| BEE Hotkeys / Watchdog | — | 🟢 |
| Postgres Watchdog (`E:\pg`) | — | 🟢 |
| LLM Ollama (local) | — | 🟢 |
| **OpenClaw Gateway** | ws crons | 🟢 PIDs 33436, 33716 |
| Bridge Supervisor | — | 🟡 amber |
| **WhatsApp Bridge** | **:3000** | 🟢 protected |
| Watcher Supervisor | — | 🟢 |
| Inbound Watcher (--live) | — | 🟢 protected |
| **Brain Server** | **:3002** | 🟢 |

## Readings vs Hive Cortex / canon

1. **OpenClaw is live** — Alfred side can pick up `AGENTS.md` step 5 + `BEE_CANON.md` on next session/turn.
2. **WA Bridge still on :3000** — matches "Alfred transport ≈3000". Hermes `bridge_port: 3100` in config does **not** conflict with this UI row if Hermes is a separate process; if Hermes *was* the :3000 bridge historically, confirm which binary owns 3000 now (likely the protected WhatsApp Bridge under BEE supervisors).
3. **Brain Server :3002** — local brain HTTP surface; distinct from Graphify MCP :8090 and from Hive Cortex cloud.
4. **Bridge Supervisor amber** — only yellow light; worth checking its log if WA flaky, not blocking Brain Bus verify.
5. **Hermes not listed as its own row** — restart/verify Hermes outside this panel (Hermes CLI/gateway), then Q&A.

## Verify next (unchanged)

Ask Alfred (OpenClaw main / WA self-chat): bank + VAT → expect Mercantile 17 / monthly.  
Same for Hermes after gateway reload.
