// shared/format-brief.js — formatting helper for Hebrew briefs

import fetch from "node-fetch";

/**
 * Format brief sections into a single WhatsApp message.
 *
 * @param {object} args
 * @param {string} args.title
 * @param {string} args.intro
 * @param {Array<{emoji, heading, body}>} args.sections
 * @param {string} args.footer
 * @returns {string}
 */
export function formatBrief({ title, intro, sections, footer }) {
  const parts = [title, "", intro, ""];
  for (const s of sections) {
    parts.push(`${s.emoji} *${s.heading}*`);
    parts.push(s.body || "_(empty)_");
    parts.push("");
  }
  if (footer) parts.push(footer);
  return parts.join("\n");
}

/**
 * Send message to Barak's self-chat via Hermes bridge.
 *
 * @param {string} message
 */
export async function sendToSelfChat(message) {
  const url = process.env.HERMES_BRIDGE_URL || "http://127.0.0.1:3000/send";
  const phone = process.env.SELF_PHONE_E164 || "972509554483";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: `${phone}@s.whatsapp.net`,
        text: message,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Bridge ${res.status}`);
  } catch (e) {
    // Queue to disk if bridge down — heartbeat-watcher will alert
    const { appendFileSync } = await import("node:fs");
    const stuckPath = process.env.STUCK_BRIEFS_PATH ||
      `${process.env.HOME || process.env.USERPROFILE}/.openclaw/workspace/memory/briefs-pending.jsonl`;
    appendFileSync(stuckPath, JSON.stringify({
      ts: new Date().toISOString(),
      message,
      error: e.message,
    }) + "\n");
    throw e;
  }
}
