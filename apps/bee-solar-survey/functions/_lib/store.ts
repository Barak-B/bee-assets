import type { PublicQuote } from '../../../../packages/quote-core/src/public'
import type { Env } from './env'

export interface PublishedRecord {
  quote: PublicQuote
  published_at: string
  has_pdf: boolean
  /** Survey the link belongs to (office screen). Never shown to the customer. */
  survey_id?: string
  /** Last 4 digits of the customer's ID on file; the online approval must match them. Never shown. */
  id_last4?: string
  /** Who published it (key name). */
  published_by?: string
}

/** One published link of a survey, as the office screen lists it (kept after revoke, with revoked_at). */
export interface QuoteLinkRow {
  token: string
  quote_number: string
  version_no: number
  published_at: string
  published_by: string
  revoked_at: string | null
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
  /** The 4 digits matched the customer's ID on file (false: no ID on file to check against). */
  id_verified?: boolean
}

const key = (token: string, name: 'quote.json' | 'quote.pdf' | 'views.json' | 'acceptance.json' | 'accept-fails.json') => `quotes/${token}/${name}`
const linkKey = (surveyId: string, token: string) => `quote-links/${surveyId}/${token}`

export async function putQuote(env: Env, token: string, rec: PublishedRecord, pdf: Uint8Array | null): Promise<void> {
  if (pdf) await env.QUOTES.put(key(token, 'quote.pdf'), pdf, { httpMetadata: { contentType: 'application/pdf' } })
  await env.QUOTES.put(key(token, 'quote.json'), JSON.stringify(rec), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { quote_number: rec.quote.quote_number, version_no: String(rec.quote.version_no) },
  })
  if (rec.survey_id) await writeLink(env, rec.survey_id, { token, quote_number: rec.quote.quote_number, version_no: rec.quote.version_no, published_at: rec.published_at, published_by: rec.published_by ?? '', revoked_at: null })
}

async function writeLink(env: Env, surveyId: string, row: QuoteLinkRow): Promise<void> {
  await env.QUOTES.put(linkKey(surveyId, row.token), '', {
    customMetadata: {
      token: row.token,
      quote_number: encodeURIComponent(row.quote_number),
      version_no: String(row.version_no),
      published_at: row.published_at,
      published_by: encodeURIComponent(row.published_by),
      revoked_at: row.revoked_at ?? '',
    },
  })
}

const dec = (v: string | undefined) => {
  try {
    return decodeURIComponent(v ?? '')
  } catch {
    return v ?? ''
  }
}

/** Every link ever published for a survey, newest first. */
export async function listQuoteLinks(env: Env, surveyId: string): Promise<QuoteLinkRow[]> {
  const out: QuoteLinkRow[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix: `quote-links/${surveyId}/`, cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) {
      const m = o.customMetadata ?? {}
      out.push({
        token: m.token ?? o.key.split('/').pop()!,
        quote_number: dec(m.quote_number),
        version_no: Number(m.version_no ?? 0),
        published_at: m.published_at ?? '',
        published_by: dec(m.published_by),
        revoked_at: m.revoked_at || null,
      })
    }
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return out.sort((a, b) => b.published_at.localeCompare(a.published_at))
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
export async function deleteQuote(env: Env, token: string, now = new Date()): Promise<void> {
  const rec = await getQuote(env, token)
  await env.QUOTES.delete([key(token, 'quote.json'), key(token, 'quote.pdf'), key(token, 'views.json')])
  // The office keeps seeing that the link existed and when it was taken down.
  if (rec?.survey_id) {
    const row = (await listQuoteLinks(env, rec.survey_id)).find((r) => r.token === token)
    if (row && !row.revoked_at) await writeLink(env, rec.survey_id, { ...row, revoked_at: now.toISOString() })
  }
}

/** Failed ID checks on the approval form; after MAX_ACCEPT_FAILS the form is locked for that link. */
export const MAX_ACCEPT_FAILS = 5

export async function getAcceptFails(env: Env, token: string): Promise<number> {
  const obj = await env.QUOTES.get(key(token, 'accept-fails.json'))
  if (!obj) return 0
  try {
    return Number((JSON.parse(await obj.text()) as { count?: number }).count ?? 0)
  } catch {
    return 0
  }
}

/** Best-effort counter: a lost update under a burst only loosens the limit by a few tries. */
export async function addAcceptFail(env: Env, token: string, now = new Date()): Promise<number> {
  const count = (await getAcceptFails(env, token)) + 1
  await env.QUOTES.put(key(token, 'accept-fails.json'), JSON.stringify({ count, last: now.toISOString() }), { httpMetadata: { contentType: 'application/json' } })
  return count
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
