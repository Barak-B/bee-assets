# Wire Alfred + Hermes to read the canon (close the propagation gap)

> The §6 sync loop publishes the canon to git/vault/graphify but **never reaches the live
> agents** — so Alfred & Hermes drift. This wires the return-edge: each agent reads
> `BEE_CANON.md` (the digest in `research/AGENT_CANON.md`) at startup and treats its locked
> facts as authoritative. Do this ONCE, on Barak's machine. All paths per `PATHS.md` — adjust
> if yours differ.

---

## Step 0 — point the sync at the agent dirs + push the canon once

```powershell
# create the Hermes canon dir (Alfred uses its existing workspace)
New-Item -ItemType Directory -Force "C:\Users\Barak\.hermes\bee-canon" | Out-Null

# tell the sync script where each agent reads (persists across sessions)
setx BEE_ALFRED_WORKSPACE  "C:\Users\Barak\.openclaw\workspace"
setx BEE_HERMES_MEMORY_DIR "C:\Users\Barak\.hermes\bee-canon"

# open a NEW PowerShell (so setx takes effect), then push the canon into both agents:
cd E:\Desktop\bee-assets
git pull
pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -SkipGraphify -PushCanonToAgents
# → creates BEE_CANON.md in C:\Users\Barak\.openclaw\workspace\ and ...\.hermes\bee-canon\
```

From now on, every commit's hook refreshes `BEE_CANON.md` in both places (add
`-PushCanonToAgents` to the hook's `BEE_HOOK_ARGS` env once you're happy with it:
`setx BEE_HOOK_ARGS "-SkipPull -SkipCluster -PushCanonToAgents"`).

---

## Step 1 — Alfred (OpenClaw): add ONE step to `AGENTS.md`

This is a **constitutional edit** — only Barak makes it (Alfred can't edit its own `AGENTS.md`).
In `E:\Desktop\OpenClawAgent\AGENTS.md`, find the `## Session Startup` block (currently steps
1–4) and add step 5, verbatim:

```markdown
5. **Read `BEE_CANON.md`** (in your workspace) — the cross-agent canon digest synced from the
   bee-assets repo. Its locked facts (bank = Mercantile code 17, VAT monthly, 0% מקדמות, the 4
   authorized outbound destinations, the agent roster, "never invent operator facts") are
   **AUTHORITATIVE**. If anything in `MEMORY.md` or a daily note conflicts with `BEE_CANON.md`,
   `BEE_CANON.md` wins. It is refreshed from git on every sync — **do not edit it locally**;
   propose canon changes back in self-chat (they belong in the git repo).
```

That's it — Alfred already reads its workspace at startup, so it will pick up `BEE_CANON.md`.

---

## Step 2 — Hermes: add the canon dir to `memory.external_dirs`

Hermes loads `memory.external_dirs` as memory context — no hook needed. In Hermes' config
(`C:\Users\Barak\.hermes\...\config.yaml`), change:

```yaml
memory:
  memory_enabled: true
  memory_char_limit: 2200
  external_dirs: []
```

to:

```yaml
memory:
  memory_enabled: true
  memory_char_limit: 2200
  external_dirs:
    - "C:\\Users\\Barak\\.hermes\\bee-canon"
```

> ⚠️ `memory_char_limit: 2200` — `AGENT_CANON.md` is ~2.5KB, so it may be truncated. Either
> raise the limit (e.g. `4096`), or trust that the top section (the constitutional laws +
> locked facts) loads first since it's at the top of the file. Confirm Hermes loads the file
> after the change (it should appear in its memory context).

**Fallback if `external_dirs` doesn't load it:** paste the "Identity + control" and "Locked
business facts" sections of `AGENT_CANON.md` directly into Hermes' `MEMORY.md` (which is always
loaded), and re-paste when the canon changes.

---

## Step 3 — while you're in there, fix the port collision

Hermes' `bridge_port` is `3000`, which collides with the port the canon assigns Alfred.
Per `protocol_hive` §1/§8: **Alfred ≈ 3000, Hermes ≈ 3100.** Set Hermes' `bridge_port: 3100`.

---

## Verify

- Alfred: next session, ask it "what bank does BEE use and what's the VAT cadence?" → it should
  answer Mercantile (code 17) / monthly, citing BEE_CANON.
- Hermes: confirm `BEE_CANON.md` shows in its loaded memory; same question.
- Both should now refuse to "guess" an operator fact and should know the 6-agent roster.

Once verified, the canon → agents edge is closed: a fact burned into git propagates to both
live brains on the next commit, automatically.
