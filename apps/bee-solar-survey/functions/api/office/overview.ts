/** GET /api/office/overview — every job for the office screen. Role: office. */
import { authenticate } from '../../_lib/auth'
import type { Handler } from '../../_lib/env'
import { json, preflight } from '../../_lib/http'
import { buildOverview } from '../../_lib/office'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  return json(request, env, { jobs: await buildOverview(env), generated_at: new Date().toISOString() })
}
