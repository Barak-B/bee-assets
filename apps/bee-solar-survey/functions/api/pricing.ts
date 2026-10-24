/**
 * GET /api/pricing — the company's price book for the phones (any key).
 * `{ pricing: null }` until the office uploads one.
 */
import { authenticate } from '../_lib/auth'
import type { Handler } from '../_lib/env'
import { json, preflight } from '../_lib/http'
import { getServerPricing } from '../_lib/pricing'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.response
  return json(request, env, { pricing: await getServerPricing(env) })
}
