/**
 * GET    /api/quotes/<token> — publication status, view count and customer approval (auth)
 * DELETE /api/quotes/<token> — revoke the customer link (auth)
 */
import { QUOTE_TOKEN_RE } from '../../../../../packages/quote-core/src/public'
import type { Handler } from '../../_lib/env'
import { authenticate } from '../../_lib/auth'
import { json, param, preflight } from '../../_lib/http'
import { deleteQuote, getAcceptance, getQuote, getViews } from '../../_lib/store'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.response
  const token = param(params.token)
  if (!QUOTE_TOKEN_RE.test(token)) return json(request, env, { error: 'bad_token' }, 400)
  const rec = await getQuote(env, token)
  if (!rec) return json(request, env, { error: 'not_found' }, 404)
  const views = await getViews(env, token)
  const a = await getAcceptance(env, token)
  const accepted = a ? { name: a.name, accepted_at: a.accepted_at, version_no: a.version_no, reference: a.reference } : null
  return json(request, env, { token, quote_number: rec.quote.quote_number, version_no: rec.quote.version_no, published_at: rec.published_at, ...views, accepted })
}

export const onRequestDelete: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.response
  const token = param(params.token)
  if (!QUOTE_TOKEN_RE.test(token)) return json(request, env, { error: 'bad_token' }, 400)
  await deleteQuote(env, token)
  return json(request, env, { ok: true })
}
