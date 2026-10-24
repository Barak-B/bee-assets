/** GET /q/<token>/pdf — the customer PDF of a published quote. */
import { QUOTE_TOKEN_RE } from '../../../../../packages/quote-core/src/public'
import type { Handler } from '../../_lib/env'
import { html, param } from '../../_lib/http'
import { renderMessagePage } from '../../_lib/render'
import { getPdf, getQuote } from '../../_lib/store'

export const onRequestGet: Handler = async ({ env, params }) => {
  const token = param(params.token)
  if (!QUOTE_TOKEN_RE.test(token)) return html(renderMessagePage('לא נמצא', 'הקישור אינו תקף.'), 404)
  const [rec, pdf] = await Promise.all([getQuote(env, token), getPdf(env, token)])
  if (!rec || !pdf) return html(renderMessagePage('לא נמצא', 'קובץ ההצעה אינו זמין.'), 404)
  const filename = `BEE-quote-${rec.quote.quote_number}-v${rec.quote.version_no}.pdf`
  return new Response(pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
