/**
 * The log of messages the office opened for a customer. Append-only: one
 * object per message, so two people never overwrite each other.
 *
 *   messages/<surveyId>/<iso>_<rand>.json   { at, by, template_key, channel, to, subject, body }
 *                                           customMetadata: at, by, template_key, channel
 *
 * "Opened" is all the server can know: the person presses send in WhatsApp /
 * SMS / mail themselves (Law #2).
 */
import type { Env } from './env'
import { clip, decodeMeta, encodeMeta } from './surveys'

export type MessageChannel = 'whatsapp' | 'sms' | 'email'
const CHANNELS = new Set<MessageChannel>(['whatsapp', 'sms', 'email'])

export interface MessageEntry {
  at: string
  by: string
  template_key: string
  channel: MessageChannel
  to: string
  subject: string
  body: string
}

const prefix = (id: string) => `messages/${id}/`

export function parseMessage(raw: unknown): { entry: Omit<MessageEntry, 'at' | 'by'> } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'מבנה לא תקין' }
  const m = raw as Record<string, unknown>
  const key = typeof m.template_key === 'string' ? m.template_key : ''
  if (!/^[a-z0-9_]{1,40}$/.test(key)) return { error: 'תבנית לא תקינה' }
  if (!CHANNELS.has(m.channel as MessageChannel)) return { error: 'ערוץ לא מוכר' }
  const body = typeof m.body === 'string' ? m.body.trim() : ''
  if (!body) return { error: 'ההודעה ריקה' }
  if (Array.from(body).length > 2000) return { error: 'ההודעה ארוכה מדי' }
  return { entry: { template_key: key, channel: m.channel as MessageChannel, to: clip(m.to, 100), subject: clip(m.subject, 200), body } }
}

export async function addMessage(env: Env, surveyId: string, entry: Omit<MessageEntry, 'at' | 'by'>, by: string, now = new Date()): Promise<MessageEntry> {
  const full: MessageEntry = { at: now.toISOString(), by, ...entry }
  const rand = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')
  await env.QUOTES.put(`${prefix(surveyId)}${full.at}_${rand}.json`, JSON.stringify(full), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: encodeMeta({ at: full.at, by, template_key: full.template_key, channel: full.channel }),
  })
  return full
}

/** Newest first, with bodies, at most `limit`. */
export async function listMessages(env: Env, surveyId: string, limit = 30): Promise<MessageEntry[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix: prefix(surveyId), cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) keys.push(o.key)
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  const newest = keys.sort().reverse().slice(0, limit)
  const out = await Promise.all(
    newest.map(async (k) => {
      const obj = await env.QUOTES.get(k)
      if (!obj) return null
      try {
        return JSON.parse(await obj.text()) as MessageEntry
      } catch {
        const m = decodeMeta(obj.customMetadata ?? {})
        return { at: m.at ?? '', by: m.by ?? '', template_key: m.template_key ?? '', channel: (m.channel ?? 'whatsapp') as MessageChannel, to: '', subject: '', body: '' }
      }
    }),
  )
  return out.filter((m): m is MessageEntry => !!m)
}
