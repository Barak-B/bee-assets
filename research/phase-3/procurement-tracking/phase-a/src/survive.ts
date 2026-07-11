// PROTOCOL §4.1 + §4.4 — err_manifest + alertBarak shim.
// Byte-parity with bank-receipts/survive.ts. BEE-app port replaces both with
// a single shared module + Alfred dispatchSend() import.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MANIFEST = process.env.ERR_MANIFEST_PATH ?? "E:/bee-build/err_manifest.jsonl";

export interface ManifestEntry {
  ts?: string;
  kind: string;
  runId?: string;
  stream?: string;
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
    process.stderr.write(`[err_manifest write fail] ${String(err)}\n${line}`);
  }
}

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
    }
  }
  process.stderr.write(`[ALERT_BARAK] ${body}\n`);
}
