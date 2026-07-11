# 🚀 Activation Runbook — Two Agents on Two Numbers

**Alfred** (OpenClaw brain) on **+972 50-955-4483** · **Robin** (Hermes) on **+972 53-323-3866**

Prepared while Barak is out. **Everything below is staged** — the ONLY remaining steps that
need *you* are the **two QR pairings** (one per phone). Each command block is copy-paste ready
for a **regular PowerShell** window (not a Claude session).

---

## Topology (what runs where)

| | Alfred | Robin |
|---|---|---|
| Number | +972509554483 (050) | +972533233866 (053) |
| Brain | OpenClaw gateway (`:18789`, already running) | Hermes gateway (Python) |
| Transport | standalone `bridge.js` on **:3000** | Hermes-spawned bridge on **:3100** |
| Session dir | `~/.hermes/platforms/whatsapp/session` | `~/.hermes/platforms/whatsapp/session-robin` |
| Mode | **bot** (sees all inbound) | **self-chat** (only you on 053) |
| Sends | drafts → 4 constitutional groups; you forward to clients | drafts only (responds to you) |
| Consumer | `alfred-inbound-watcher.js` | the Hermes gateway itself |

Two sessions, two ports, two numbers → **zero conflict**. All hops are `127.0.0.1` (zero egress).

**Already staged for you:**
- ✅ Hermes `config.yaml` repurposed for Robin: `bridge_port: 3100`, `session_path: …\session-robin`, `allow_from: ['+972533233866']`, `dm_policy: allowlist`. (Backup: `config.yaml.bak.robin-*`.) YAML validated.
- ✅ `…\session-robin\` dir created (empty, ready to pair).
- ✅ Alfred stack present + tested: `bridge-supervisor.js`, `alfred-inbound-watcher.js`, `qr-png.js`.

> ⚠️ **Persona caveat (finalize when supervised):** Hermes still uses the `alfred` persona text,
> so Robin will *identify as Alfred* until we add a `robin` personality block. Functional now;
> cosmetic only. (Editing the big persona block unattended is risky, so I deferred it.)

---

## A. Activate ALFRED (phone 1 — 050)

**A1. Pair number 1** (scan with the 050 phone):
```powershell
chcp 65001
$env:WA_SESSION_DIR = "$env:USERPROFILE\.hermes\platforms\whatsapp\session"
cd "C:\Users\Barak\AppData\Local\hermes\hermes-agent\scripts\whatsapp-bridge"
node qr-png.js --fresh        # a PNG opens — scan with WhatsApp on the 050 phone
# wait for "✅ PAIRED + CONNECTED ✓"  →  Ctrl+C
```

**A2. Start Alfred's bridge** (bot mode, full coverage):
```powershell
cd "E:\Desktop\OpenClawAgent"
$env:WHATSAPP_MODE = "bot"
$env:WHATSAPP_ALLOWED_USERS = "*"
node bridge-supervisor.js     # expect: spawn → "WhatsApp connected" → "http_listening"
```
Verify (another window): `curl http://127.0.0.1:3000/health` → `{"status":"connected",…}`

**A3. Start the watcher — DRY-RUN first**:
```powershell
cd "E:\Desktop\OpenClawAgent"
node alfred-inbound-watcher.js          # dry-run (default)
```
Send yourself a WhatsApp note. Confirm the log shows `DRYRUN_send` only to the 4 constitutional
JIDs (self-chat / Drafts / Voice / Neri). Then Ctrl+C and go live:
```powershell
node alfred-inbound-watcher.js --live
```

---

## B. Activate ROBIN (phone 2 — 053)

**B1. Pair number 2** (scan with the 053 phone):
```powershell
chcp 65001
$env:WA_SESSION_DIR = "$env:USERPROFILE\.hermes\platforms\whatsapp\session-robin"
cd "C:\Users\Barak\AppData\Local\hermes\hermes-agent\scripts\whatsapp-bridge"
node qr-png.js --fresh        # scan with WhatsApp on the 053 phone
# wait for "✅ PAIRED + CONNECTED ✓"  →  Ctrl+C
```

**B2. Start the Hermes gateway (= Robin)** — it spawns Robin's bridge on :3100 using the paired
session-robin:
```powershell
hermes gateway run            # foreground (recommended); or: hermes gateway start  (background service)
```
Verify: `curl http://127.0.0.1:3100/health` → `{"status":"connected",…}`
Then text the **053 self-chat** — Robin should respond (drafts to you only).

---

## Verify both are live
```powershell
curl http://127.0.0.1:3000/health   # Alfred  (connected)
curl http://127.0.0.1:3100/health   # Robin   (connected)
```
- Alfred: text a client-style message to the 050 → a **draft** appears in your Drafts group; you forward.
- Robin: text the 053 self-chat → Robin replies to you.

---

## Safety + gotchas (hard-won this session)
- **Never abruptly kill a CONNECTED bridge** — WhatsApp invalidates the session → forces re-pair.
  To stop: `Ctrl+C` the supervisor / `hermes gateway stop`. Prefer graceful.
- **Drain conflict:** `:3000`'s `/messages` has ONE consumer (the watcher). Don't run a second
  consumer on the same port. Robin is on `:3100` — independent.
- **Pairing path must match run path** — that's why pairing uses the same `WA_SESSION_DIR` the
  bridge/gateway reads. Don't mix the two numbers' sessions.
- **Auto-start on reboot:** `hermes gateway install` (Robin) makes it a background service.
  Alfred's supervisor can go in the Startup folder.

## To finalize when supervised (optional polish)
1. Add a `robin` persona to `config.yaml` (`agent.personalities.robin` + `display.personality: robin`)
   so Robin identifies as Robin, not Alfred.
2. Decide if Robin should later serve more than self-chat (widen `allow_from`).

---

*Staged 2026-05-27. Activation = 2 QR scans + the command blocks above. Nothing was started/killed
while unattended; only safe config staging + the new session dir.*
