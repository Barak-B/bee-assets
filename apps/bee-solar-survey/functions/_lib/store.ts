import type { PublicQuote } from '../../../../packages/quote-core/src/public'
import type { Env } from './env'

export interface PublishedRecord {
  quote: PublicQuote
  published_at: string
  has_pdf: boolean
}

export interface ViewStats {
  views: number
  first_viewed_at: string | null
  last_viewed_at: string | null
}

/**
 * Customer approval from the quote page (spec 12 §7.1 stage A, without OTP).
 * It records an approval in principle of one exact version — the binding
 * agreement is signed separately. Kept even if the link is later revoked.
 */
export interface Acceptance {
  name: string
  id_last4: string
  accepted_at: string
  ip: string | null
  user_agent: string | null
  quote_number: string
  version_no: number
  /** The public quote reference (first 12 hex of the snapshot hash) shown on the page. */
  reference: string
  total_incl_vat_ils: number | null
  /** sha256 of the customer PDF that was on offer, when there was one. */
  pdf_sha256: string | null
  /** Copy of what the customer saw, for the record. */
  quote: PublicQuote
}

const key = (token: string, name: 'quote.json' | 'quote.pdf' | 'views.json' | 'acceptance.json') => `quotes/${token}/${name}`

export async function putQuote(env: Env, token: string, rec: PublishedRecord, pdf: Uint8Array | null): Promise<void> {
  if (pdf) await env.QUOTES.put(key(token, 'quote.pdf'), pdf, { httpMetadata: { contentType: 'application/pdf' } })
  await env.QUOTES.put(key(token, 'quote.json'), JSON.stringify(rec), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { quote_number: rec.quote.quote_number, version_no: String(rec.quote.version_no) },
  })
}

export async function getQuote(env: Env, token: string): Promise<PublishedRecord | null> {
  const obj = await env.QUOTES.get(key(token, 'quote.json'))
  if (!obj) return null
  try {
    return JSON.parse(await obj.text()) as PublishedRecord
  } catch {
    return null
  }
}

export async function getPdf(env: Env, token: string): Promise<ArrayBuffer | null> {
  const obj = await env.QUOTES.get(key(token, 'quote.pdf'))
  return obj ? obj.arrayBuffer() : null
}

/** Revoke the link. An acceptance, if any, is kept as the record of what was approved. */
export async function deleteQuote(env: Env, token: string): Promise<void> {
  await env.QUOTES.delete([key(token, 'quote.json'), key(token, 'quote.pdf'), key(token, 'views.json')])
}

export async function getAcceptance(env: Env, token: string): Promise<Acceptance | null> {
  const obj = await env.QUOTES.get(key(token, 'acceptance.json'))
  if (!obj) return null
  try {
    return JSON.parse(await obj.text()) as Acceptance
  } catch {
    return null
  }
}

/** Create-only: the first approval wins; returns false when one already exists (double tap, two people). */
export async function putAcceptance(env: Env, token: string, a: Acceptance): Promise<boolean> {
  const res = await env.QUOTES.put(key(token, 'acceptance.json'), JSON.stringify(a), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: new Headers({ 'if-none-match': '*' }),
  })
  return res !== null
}

export async function getViews(env: Env, token: string): Promise<ViewStats> {
  const obj = await env.QUOTES.get(key(token, 'views.json'))
  if (!obj) return { views: 0, first_viewed_at: null, last_viewed_at: null }
  try {
    return JSON.parse(await obj.text()) as ViewStats
  } catch {
    return { views: 0, first_viewed_at: null, last_viewed_at: null }
  }
}

/**
 * Best-effort counter (R2 has no atomic increment; a lost update under
 * concurrent views is acceptable). Opens within 10 s of the last one are not
 * written, so a script looping on a link cannot run up R2 write operations.
 */
export async function recordView(env: Env, token: string, now = new Date()): Promise<void> {
  const v = await getViews(env, token)
  if (v.last_viewed_at && now.getTime() - Date.parse(v.last_viewed_at) < 10_000) return
  const ts = now.toISOString()
  await env.QUOTES.put(key(token, 'views.json'), JSON.stringify({ views: v.views + 1, first_viewed_at: v.first_viewed_at ?? ts, last_viewed_at: ts }), {
    httpMetadata: { contentType: 'application/json' },
  })
}

/** Every customer approval since `since` (ISO), newest first — for the hive feed. */
export async function listAcceptances(env: Env, since?: string): Promise<(Acceptance & { token: string })[]> {
  const out: (Acceptance & { token: string })[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix: 'quotes/', cursor, limit: 1000 })
    for (const o of res.objects) {
      if (!o.key.endsWith('/acceptance.json')) continue
      if (since && o.uploaded.toISOString() <= since) continue
      const token = o.key.split('/')[1]!
      const a = await getAcceptance(env, token)
      if (a && (!since || a.accepted_at > since)) out.push({ ...a, token })
    }
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return out.sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))
}
