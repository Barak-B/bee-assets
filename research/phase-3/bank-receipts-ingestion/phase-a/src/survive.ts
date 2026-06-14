// PROTOCOL §4.1 + §4.4 — err_manifest + alertBarak
//
// err_manifest: append-only JSONL log of root causes. Path comes from env,
// default per protocol = E:\bee-build\err_manifest.json (but a directory makes
// safer concurrent writes — we use .jsonl).
//
// alertBarak: wraps Alfred's dispatchSend() to push a ⚡ to self-chat.
// In phase A we ship a thin shim that prefers Alfred when available + falls
// back to stderr; full wiring lives in BEE app after port.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MANIFEST = process.env.ERR_MANIFEST_PATH ?? "E:/bee-build/err_manifest.jsonl";

export interface ManifestEntry {
  ts?: string;
  kind: string;          // "ingest_throw" | "validation_fail" | "dedup_loop" | ...
  runId?: string;
  stream?: string;       // pipeline name
  root_cause?: string;
  context?: Record<string, unknown>;
  fix?: string;
  commit?: string;
  [k: string]: unknown;
}

export async function logManifest(e: ManifestEntry): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...e }) + "\n";
  try {
    await mkdir(dirname(MANIFEST), { recursive: true });
    await appendFile(MANIFEST, line, "utf8");
  } catch (err) {
    // Last-resort: stderr so it ends up in cron logs
    process.stderr.write(`[err_manifest write fail] ${String(err)}\n${line}`);
  }
}

/**
 * Send ⚡ to Barak self-chat. In phase A this is best-effort:
 *   1. If ALFRED_DISPATCH_URL is set, POST to it (Alfred exposes an HTTP shim in BEE app)
 *   2. Else: stderr + manifest entry
 *
 * BEE-app port: replace the shim with direct `dispatchSend()` import from
 * alfred-inbound-watcher.js. The 4-destinations rule (constitutional law #1)
 * is enforced inside dispatchSend — we never bypass it from this layer.
 */
export async function alertBarak(text: string, opts?: { urgent?: boolean }): Promise<void> {
  const prefix = opts?.urgent ? "⚡⚡ " : "⚡ ";
  const body = prefix + text;

  const url = process.env.ALFRED_DISPATCH_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: "self", text: body }),
      });
      return;
    } catch (e) {
      await logManifest({ kind: "alert_dispatch_fail", root_cause: String(e), context: { text } });
      // fall through to stderr
    }
  }

  process.stderr.write(`[ALERT_BARAK] ${body}\n`);
}
