/**
 * POST /api/quotes — publish a quote version and get its customer link.
 * Body: { quote: PublicQuote, pdfBase64?: string }  ·  Auth: Bearer PUBLISH_KEY
 * The link is always built from PUBLIC_BASE_URL (or this request's origin) and
 * is refused if it is not https on a real host — no more http://127.0.0.1:…/q/… links.
 */
import { isPublicBaseUrl, isPublicQuote, newQuoteToken, quoteLink } from '../../../../../packages/quote-core/src/public'
import type { Handler } from '../../_lib/env'
import { json, preflight, requireKey } from '../../_lib/http'
import { putQuote } from '../../_lib/store'

const MAX_BODY = 6 * 1024 * 1024
const MAX_PDF = 4 * 1024 * 1024

export function linkBase(request: Request, env: { PUBLIC_BASE_URL?: string; ALLOW_LOCAL_LINKS?: string }): { base: string; ok: boolean } {
  const base = (env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '')
  return { base, ok: env.ALLOW_LOCAL_LINKS === '1' || isPublicBaseUrl(base) }
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPost: Handler = async ({ request, env }) => {
  const denied = requireKey(request, env)
  if (denied) return denied

  const { base, ok } = linkBase(request, env)
  if (!ok) {
    return json(request, env, { error: 'base_url_not_public', message_he: `כתובת הבסיס ${base} אינה ציבורית — הגדירו PUBLIC_BASE_URL לדומיין (https://…)` }, 500)
  }

  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > MAX_BODY) return json(request, env, { error: 'too_large' }, 413)
  let body: { quote?: unknown; pdfBase64?: unknown }
  try {
    const text = await request.text()
    if (text.length > MAX_BODY) return json(request, env, { error: 'too_large' }, 413)
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!isPublicQuote(body.quote)) return json(request, env, { error: 'bad_quote', message_he: 'מבנה הצעה לא תקין' }, 400)

  let pdf: Uint8Array | null = null
  if (typeof body.pdfBase64 === 'string' && body.pdfBase64) {
    try {
      pdf = decodeBase64(body.pdfBase64)
    } catch {
      return json(request, env, { error: 'bad_pdf' }, 400)
    }
    if (pdf.byteLength > MAX_PDF) return json(request, env, { error: 'pdf_too_large' }, 413)
    if (String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') return json(request, env, { error: 'bad_pdf' }, 400)
  }

  const token = newQuoteToken()
  const published_at = new Date().toISOString()
  await putQuote(env, token, { quote: body.quote, published_at, has_pdf: !!pdf }, pdf)
  return json(request, env, { token, url: quoteLink(base, token), published_at }, 201)
}
