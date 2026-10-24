/**
 * The company's price book in the office screen.
 *
 *   GET /api/office/pricing   what is loaded: date, by whom, product count (role: office)
 *   PUT /api/office/pricing   load a price book (role: admin). Body: a backup or
 *                             pricing file from the app, or { catalog, rules }.
 */
import { toStoredPricing } from '../../../src/backup'
import { authenticate } from '../../_lib/auth'
import type { Handler } from '../../_lib/env'
import { json, preflight } from '../../_lib/http'
import { getServerPricing, putServerPricing, summarizePricing } from '../../_lib/pricing'

/** A price book is a few hundred products; a whole backup with photos is not one. */
const MAX_BYTES = 2_000_000

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const p = await getServerPricing(env)
  return json(request, env, { summary: p ? summarizePricing(p) : null })
}

export const onRequestPut: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'admin')
  if (!auth.ok) return auth.response
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BYTES) return json(request, env, { error: 'too_large', message_he: 'המחירון גדול מדי' }, 413)
    raw = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json', message_he: 'זה לא קובץ JSON תקין' }, 400)
  }
  const pricing = toStoredPricing(raw)
  if (!pricing) return json(request, env, { error: 'not_pricing', message_he: 'בקובץ אין מחירון (קטלוג וכללים)' }, 400)
  if (!pricing.catalog.products.length) return json(request, env, { error: 'empty', message_he: 'המחירון ריק — אין בו מוצרים' }, 400)
  const row = await putServerPricing(env, pricing, auth.principal.name)
  return json(request, env, { ok: true, summary: summarizePricing(row) })
}
