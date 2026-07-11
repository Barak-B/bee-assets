# 🔀 Migration Runbook — OpenClaw-alfred as the sole WhatsApp brain

**Decision (Barak, 2026-05-27):** Alfred = the OpenClaw personal assistant (faster, more
professional). Hermes becomes **transport** (the Baileys bridge on `:3000`) + heavy-tool
backend. This runbook turns that decision into a live setup.

```
WhatsApp ─▶ Hermes bridge (:3000) ─▶ queue
                                       │  GET /messages  (DRAIN)
                                       ▼
                         alfred-inbound-watcher.js   ← the migration keystone
                                       │  → alfred-handle.handle() / voice-action.processVoice()
                                       │  → resolveOutbound() (4 constitutional dests only)
                                       ▼  POST /send {chatId,message}
                         Hermes bridge ─▶ WhatsApp
```

## Components (all built + unit-verified)

| File | Role | Verified |
|---|---|---|
| `E:\Desktop\OpenClawAgent\alfred-inbound-watcher.js` | Polls `/messages`, runs the brain, sends to the 4 dests | ✅ 44/44 self-test · ✅ dry-run e2e (`internal-task`→self-chat) |
| `E:\Desktop\OpenClawAgent\bridge-supervisor.js` | Keeps `bridge.js` alive standalone; safe restart; stops on logout | ✅ pre-flight refusal (unregistered session) |
| `…\hermes-agent\scripts\whatsapp-bridge\bridge.js` | Hermes Baileys bridge (transport) | patched (quotedBody) |
| `E:\Desktop\OpenClawAgent\qr-png.js` | Pair via scannable PNG QR | used previously ("עובד") |

## 🔒 Constitutional outbound rule (immutable)

Alfred sends to **exactly four** destinations — all Barak's own internal surfaces. It NEVER
messages a client directly (client sends are always Barak's manual forward from Drafts).
Enforced in `resolveOutbound()` + the bridge's Layer-9 gate.

| `dispatch.target` | JID | Purpose |
|---|---|---|
| `self-chat` / `ideas-drawer` | `972509554483@s.whatsapp.net` | summaries · clarifications · ideas |
| `drafts-group` | `120363407758194119@g.us` | reviewable reply drafts |
| `voice-group` | `120363409101459201@g.us` | voice-memo transcripts |
| `neri-sync` | `120363425994041413@g.us` | Neri coordination |

Anything resolving outside these 4 → dropped + logged (`BLOCKED_non_constitutional_dest`).

---

## ⛔ CURRENT BLOCKER — re-pair required (Barak's phone)

Both candidate session dirs show **`registered=false`** (verified 2026-05-27):
- `C:\Users\Barak\.hermes\platforms\whatsapp\session` — creds present, **not registered**
- `C:\Users\Barak\AppData\Local\hermes\whatsapp\session` — creds present, **not registered**

No live WhatsApp session exists → the bridge cannot connect until a QR re-pair. This is the
one step only Barak can do. Everything downstream is ready and waiting.

**Root cause of past "session path mismatch":** three different default paths were in play.
This migration standardizes on ONE: `C:\Users\Barak\.hermes\platforms\whatsapp\session`
(the `qr-png.js` default). The supervisor passes it to `bridge.js --session` explicitly, so
pairing and the bridge always agree.

---

## Go-live sequence (run in a REGULAR PowerShell, not a Claude session)

### Step 0 — Take the Hermes gateway OUT of the WhatsApp loop (avoid drain conflict)
`GET /messages` is a *drain* — only ONE consumer may poll it. If the gateway also runs
WhatsApp, it and the watcher steal messages from each other (~50% vanish).
- Confirm the gateway is not managing WhatsApp, or set `platforms.whatsapp.enabled: false`
  in `C:\Users\Barak\AppData\Local\hermes\config.yaml` and restart the gateway.
- (Right now the gateway's WhatsApp is already down — nothing competes for `:3000`.)

### Step 1 — Pair (Barak's phone)
```powershell
chcp 65001                              # UTF-8 so the QR isn't garbled
cd "C:\Users\Barak\AppData\Local\hermes\hermes-agent\scripts\whatsapp-bridge"
node qr-png.js --fresh                  # opens a scannable PNG; scan with WhatsApp
# Wait for: "✅ PAIRED + CONNECTED ✓"  → Ctrl+C
```
Verify the session is now registered:
```powershell
(Get-Content "$env:USERPROFILE\.hermes\platforms\whatsapp\session\creds.json" -Raw |
  ConvertFrom-Json).registered      # → True
```

### Step 2 — Start the bridge (standalone, via supervisor) — **BOT MODE / full coverage**
Barak's choice: **bot mode** so Alfred sees client + group messages, not just self-chat.
(Outbound stays locked to the 4 constitutional dests regardless of mode.)
```powershell
cd "E:\Desktop\OpenClawAgent"
$env:WHATSAPP_MODE = "bot"
$env:WHATSAPP_ALLOWED_USERS = "*"     # full coverage. Narrow to a comma-list of phones if noisy/costly.
node bridge-supervisor.js
# Expect: spawn → "WhatsApp connected" → "http_listening"
# (Empty WHATSAPP_ALLOWED_USERS in bot mode = bridge rejects ALL incoming → supervisor WARNs.)
```
**Cost/noise note:** in `*` mode every inbound message Barak receives is classified (one LLM
call each; `noise` → log-only, no send). Cheap tier (DeepSeek) handles bulk. Narrow the
allowlist if volume is high.
In another window, confirm health:
```powershell
curl http://127.0.0.1:3000/health      # → {"status":"connected","queueLength":0,"uptime":…}
```

### Step 3 — Start the watcher in DRY-RUN (no sends yet)
```powershell
cd "E:\Desktop\OpenClawAgent"
node alfred-inbound-watcher.js          # SEND_MODE defaults to dry-run
```
Send yourself a WhatsApp message (to your own self-chat). In the watcher log you should see:
```
{"event":"polled","count":1}
{"event":"processed","intent":"…","target":"self-chat","outboundCount":1}
{"event":"DRYRUN_send","jid":"972509554483@s.whatsapp.net","kind":"summary","preview":"⚡ *📨 …"}
```
Confirm every `DRYRUN_send.jid` is one of the 4 constitutional JIDs. No `BLOCKED_…` lines.

### Step 4 — Flip to LIVE
```powershell
# Ctrl+C the dry-run watcher, then:
node alfred-inbound-watcher.js --live
```
Now Alfred actually posts summaries/drafts to the 4 surfaces.
*(Voice transcription stays deferred unless `GROQ_API_KEY` is set — see below.)*

---

## End-to-end test matrix (after Step 4)

| # | Send to your self-chat | Expect |
|---|---|---|
| A | Plain text "תזכיר לי להתקשר ליוסף מחר" | self-chat summary, intent `internal-task` |
| B | Image of an invoice + caption "תפתח חשבונית" | vision OCR → `client-*` → **draft to Drafts group** + self-chat summary |
| C | PDF + caption "סכם" | pdf extract → summary to self-chat |
| D | Reply (quote) to a prior Alfred draft with "לא, זה כהן" | correction-detector match → **log-only, no send** |
| E | Voice memo "תקבע פגישה עם נרי שלישי 14:00" | (needs `GROQ_API_KEY`) transcript→voice group + action proposal to self-chat |

Verify routing in the log:
```powershell
Get-Content "E:\Desktop\OpenClawAgent\logs\inbound-watcher.jsonl" -Tail 30
```

---

## Stopping safely (avoid the 2026-05-26 incident)

**Never** abruptly kill a CONNECTED bridge — WhatsApp invalidates the session → forces re-pair.
- The supervisor never proactively kills the bridge; it only respawns after a self-exit, and
  **stops** (won't loop) if the bridge exits logged-out.
- To stop WhatsApp deliberately, prefer a graceful `hermes whatsapp logout` (Baileys logout →
  session reusable) over Ctrl+C on the supervisor.
- Ctrl+C on the supervisor sends SIGTERM to the bridge (never SIGKILL), but still stops a
  connected bridge — only do it when you mean to take WhatsApp down.

## Notes & options
- **Bridge mode:** **bot / full coverage** (Barak's decision) — Alfred sees client + group
  messages, set via `$env:WHATSAPP_MODE="bot"` + `$env:WHATSAPP_ALLOWED_USERS="*"`. Outbound
  is still constrained to the 4 dests regardless. Fall back to `self-chat` only if you want
  the conservative "Barak's own self-notes only" behavior.
- **Voice:** set `GROQ_API_KEY` to activate Whisper transcription in the watcher; otherwise
  voice memos are logged as `voice_deferred` and skipped (the orchestration to
  `alfred-voice-action.processVoice` is already wired).
- **Failed sends** are appended to `logs\inbound-watcher.failed.jsonl` (nothing lost silently).

## Verification status (honest)
- ✅ Watcher pure-logic: 44/44 offline invariants.
- ✅ Watcher full pipeline: dry-run e2e through real `handle()` → correct self-chat routing.
- ✅ Supervisor pre-flight: refuses unregistered session with actionable guidance.
- ⏳ **Live e2e (Steps 1-4 + test matrix): BLOCKED on the QR re-pair.** Not yet run.

---

*Wave 13 migration. Built 2026-05-27. Keystone: `alfred-inbound-watcher.js`.*
