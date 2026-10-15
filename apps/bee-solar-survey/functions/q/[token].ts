/** GET /q/<token> — the customer's quote page. */
import { QUOTE_TOKEN_RE } from '../../../../packages/quote-core/src/public'
import type { Handler } from '../_lib/env'
import { html, param } from '../_lib/http'
import { renderMessagePage, renderQuotePage } from '../_lib/render'
import { getAcceptance, getQuote, recordView } from '../_lib/store'

export const onRequestGet: Handler = async ({ request, env, params, waitUntil }) => {
  const token = param(params.token)
  const notFound = () => html(renderMessagePage('ההצעה לא נמצאה', 'הקישור אינו תקף או שההצעה הוסרה. לפרטים פנו לברק אלקטריק אנג׳ינירינג.'), 404)
  if (!QUOTE_TOKEN_RE.test(token)) return notFound()
  const rec = await getQuote(env, token)
  if (!rec) return notFound()

  // Count real opens only (not link-preview bots that send HEAD or prefetch).
  const purpose = request.headers.get('purpose') ?? request.headers.get('sec-purpose') ?? ''
  if (!/prefetch|prerender/i.test(purpose)) {
    const p = recordView(env, token).catch(() => undefined)
    if (waitUntil) waitUntil(p)
    else await p
  }
  const acceptance = await getAcceptance(env, token)
  const justAccepted = !!acceptance && new URL(request.url).searchParams.get('accepted') === '1'
  return html(renderQuotePage(rec.quote, { token, hasPdf: rec.has_pdf, acceptance, justAccepted }))
}
