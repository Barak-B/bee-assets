/** GET /api/me — who this key belongs to (office login, app settings). Any role. */
import { ROLE_LABEL_HE, authenticate } from '../_lib/auth'
import type { Handler } from '../_lib/env'
import { json, preflight } from '../_lib/http'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.response
  return json(request, env, { ...auth.principal, role_he: ROLE_LABEL_HE[auth.principal.role] })
}
