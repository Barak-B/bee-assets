# Alfred "Falling" — Recovery + Permanent Prevention

**Diagnosis:** Not an Alfred crash. The **WhatsApp bridge** (Hermes-side process)
got logged out when it was killed (SIGKILL) to load a Wave 12 patch. WhatsApp
Server invalidates a session whose device disconnects abruptly → QR re-pair forced.

This will **recur on every bridge.js patch** unless we change the restart pattern.
Below: (1) immediate recovery, (2) permanent prevention.

---

## Part 1 — Immediate recovery (5 min, needs your phone)

The session is invalidated server-side. Only a QR re-pair fixes it now.

```powershell
# 1. Regular PowerShell (NOT Claude session)

# 2. Clear stale session
Remove-Item "C:\Users\Barak\.hermes\platforms\whatsapp\session\*" -Force -Recurse

# 3. Start via the NEW supervisor (see Part 2) — or directly for now:
$env:WHATSAPP_ALLOWED_USERS = "+972509554483"
node "C:\Users\Barak\AppData\Local\hermes\hermes-agent\scripts\whatsapp-bridge\bridge.js" `
  --port 3000 `
  --session "C:\Users\Barak\.hermes\platforms\whatsapp\session" `
  --mode bot 2>&1 | Tee-Object "$env:LOCALAPPDATA\Temp\hermes-bridge\bridge-fresh.log"

# 4. QR appears in the console / log. On phone:
#    WhatsApp → Settings → Linked Devices → Link a Device → scan

# 5. Verify
curl http://127.0.0.1:3000/health
# {"status":"connected", ...}
```

---

## Part 2 — Permanent prevention (so this NEVER recurs)

Two pieces: **(A)** a supervisor that does graceful reloads, **(B)** a
bridge.js SIGTERM handler so Baileys saves creds on shutdown.

### A. bridge-supervisor.js (in this folder)

Run the bridge UNDER the supervisor instead of directly:

```powershell
node "E:\Desktop\OpenClawAgent\bridge-supervisor.js" `
  --bridge "C:\Users\Barak\AppData\Local\hermes\hermes-agent\scripts\whatsapp-bridge\bridge.js" `
  --port 3000 `
  --session "C:\Users\Barak\.hermes\platforms\whatsapp\session"
```

The supervisor:
- Spawns + monitors the bridge as a child
- On reload request → **SIGTERM** (graceful), waits for clean exit, respawns
  with the **same valid creds → NO QR**
- Auto-restarts on crash with backoff
- Resets crash counter after 2 min stable

**To reload after patching bridge.js (no session loss):**

```powershell
# Windows: drop a trigger file
echo "" > "C:\Users\Barak\.hermes\platforms\whatsapp\RELOAD_TRIGGER"

# Linux/WSL: signal
kill -SIGHUP <supervisor_pid>
```

The supervisor catches it, SIGTERMs the bridge, bridge saves creds + exits
cleanly, supervisor respawns. **Creds stay valid because the shutdown was
graceful — WA Server is told "going offline", not "disconnected".**

### B. bridge.js SIGTERM handler (REQUIRED patch)

For graceful reload to preserve the session, bridge.js must handle SIGTERM by
closing the Baileys socket **without** logging out, after flushing creds. Add
near the top-level of bridge.js (after `sock` is created):

```javascript
// ── Graceful shutdown handler (enables supervisor reload w/o QR) ──
let shuttingDownGracefully = false;

async function gracefulShutdown(signal) {
  if (shuttingDownGracefully) return;
  shuttingDownGracefully = true;
  console.log(`[bridge] ${signal} received — graceful shutdown`);

  try {
    // 1. Stop accepting new HTTP requests
    if (httpServer) httpServer.close();

    // 2. Flush Baileys creds to disk (CRITICAL — preserves session)
    //    saveCreds is the callback Baileys gave you via creds.update event.
    if (typeof saveCreds === "function") {
      await saveCreds();
      console.log("[bridge] creds saved");
    }

    // 3. Close the socket WITHOUT logout.
    //    sock.end() closes the WS connection but KEEPS the session valid.
    //    DO NOT call sock.logout() — that invalidates server-side (the bug).
    if (sock?.ws) {
      sock.end(undefined);   // graceful WS close, session reusable
      console.log("[bridge] socket closed (session preserved)");
    }

    // 4. Give Baileys a moment to flush, then exit clean
    await new Promise((r) => setTimeout(r, 1500));
    console.log("[bridge] graceful exit");
    process.exit(0);
  } catch (e) {
    console.error(`[bridge] shutdown error: ${e.message}`);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

**Key distinction (this is the whole fix):**
| Call | Effect | Session after |
|---|---|---|
| `Stop-Process` / SIGKILL | abrupt — WA sees "disconnected" | ❌ invalidated → QR |
| `sock.logout()` | explicit logout | ❌ invalidated → QR (by design) |
| `sock.end()` + saveCreds | graceful WS close | ✅ **reusable, no QR** |

The Wave 12 incident used SIGKILL. With the SIGTERM handler + supervisor,
patches load via graceful `sock.end()` → session survives → no QR ever again
(except genuine logout / phone unlink).

---

## Part 3 — Crash-loop guard (if the bridge keeps falling AFTER re-pair)

If Alfred "falls" repeatedly even after QR (not just the one logout event),
suspect the **Wave 12 hooks in alfred-handle.js** throwing on certain messages.
Wave 12 added vision (image) + PDF + quote-context hooks at "Step 1.0". If any
throws unhandled on a malformed media message → the handler crashes per-message.

Defensive wrap (apply in alfred-handle.js around the Wave 12 Step 1.0 block):

```javascript
// Wrap media analysis so a vision/PDF failure degrades gracefully
let mediaAnalysis = null;
if (message.mediaType === "image" && message.mediaUrls?.[0]) {
  try {
    mediaAnalysis = await withTimeout(
      alfredVision.analyzeImage({ imagePath: message.mediaUrls[0] }),
      20000  // 20s cap — Gemini can hang
    );
  } catch (e) {
    console.error(`[handle] vision failed, continuing text-only: ${e.message}`);
    mediaAnalysis = { error: e.message };  // don't crash — degrade
  }
}
// same try/catch pattern for PDF block

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}
```

**Rule:** any external call (Gemini vision, PDF parse, LLM) inside the message
handler must be try/caught + timed-out. A single bad image must never crash
Alfred's whole message loop.

To check if this is the issue:
```powershell
# Look for unhandled rejections / repeated crashes in Alfred logs
Get-Content "C:\Users\Barak\.openclaw\logs\*.log" -Tail 100 | Select-String "Error|throw|unhandled|crash"
# Or check if gateway PID keeps changing (= respawning = crash loop)
```

---

## Part 4 — Verification checklist

After recovery + prevention applied:

- [ ] `curl http://127.0.0.1:3000/health` → `connected`
- [ ] Send yourself a WA message → Alfred receives (check logs)
- [ ] Bridge running UNDER supervisor (`Get-Process node` → supervisor + child)
- [ ] Test graceful reload: drop RELOAD_TRIGGER → bridge restarts → **still connected, no QR**
- [ ] Send an image → vision hook runs OR degrades gracefully (no crash)
- [ ] Send a malformed/huge file → handler doesn't crash
- [ ] Gateway PID stable for >10 min (not respawning)

---

## Summary

| Question | Answer |
|---|---|
| Why did Alfred "fall"? | WA bridge killed → session invalidated → logged out |
| Is it a code bug? | No — Baileys/WA design constraint when killed abruptly |
| Immediate fix? | QR re-pair (Part 1, 5 min, your phone) |
| Why does it recur? | Every bridge.js patch used kill-restart |
| Permanent fix? | Supervisor + SIGTERM graceful shutdown (Part 2) → reload without QR |
| If it STILL falls after re-pair? | Wave 12 media hooks may throw — add try/catch+timeout (Part 3) |

The supervisor + SIGTERM patch means **you can patch bridge.js as often as you
want without ever scanning a QR again** (except a real phone-side unlink).
