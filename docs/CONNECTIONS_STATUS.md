# Connections status — after fix-hermes-all PASS (2026-07-12)

## Green

| Item | Status |
|---|---|
| Hermes `config.yaml` parses | ✅ YAML_OK + `hermes config` clean |
| `external_dirs` bee-canon (indented) | ✅ |
| `memory_char_limit` 4096 | ✅ |
| Alfred `AGENTS.md` step-5 ×1 | ✅ |
| `BEE_CANON.md` in Alfred + Hermes dirs | ✅ |
| `concurrent-log-handler` | ✅ |

## You do now

1. **New PowerShell window** (leave open):
   ```powershell
   hermes gateway run
   ```
2. Other window:
   ```powershell
   Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue
   ```
3. Ask **Alfred** (OpenClaw / WA self-chat):  
   `what bank does BEE use and VAT cadence?`  
   Expect: Mercantile code 17 / monthly

Paste Alfred's answer (+ whether 3100 is Listen).
