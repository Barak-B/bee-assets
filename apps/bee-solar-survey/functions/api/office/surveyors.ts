/** GET /api/office/surveyors — who a job can be assigned to: active personal keys (names only). Role: office. */
import { authenticate, listKeys } from '../../_lib/auth'
import type { Handler } from '../../_lib/env'
import { json, preflight } from '../../_lib/http'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const people = (await listKeys(env)).filter((k) => !k.revoked_at).map((k) => ({ id: k.id, name: k.name, role: k.role }))
  return json(request, env, { surveyors: people.sort((a, b) => a.name.localeCompare(b.name, 'he')) })
}
