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

const key = (token: string, name: 'quote.json' | 'quote.pdf' | 'views.json') => `quotes/${token}/${name}`

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

export async function deleteQuote(env: Env, token: string): Promise<void> {
  await env.QUOTES.delete([key(token, 'quote.json'), key(token, 'quote.pdf'), key(token, 'views.json')])
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

/** Best-effort counter (R2 has no atomic increment; a lost update under concurrent views is acceptable). */
export async function recordView(env: Env, token: string, now = new Date()): Promise<void> {
  const v = await getViews(env, token)
  const ts = now.toISOString()
  await env.QUOTES.put(key(token, 'views.json'), JSON.stringify({ views: v.views + 1, first_viewed_at: v.first_viewed_at ?? ts, last_viewed_at: ts }), {
    httpMetadata: { contentType: 'application/json' },
  })
}
