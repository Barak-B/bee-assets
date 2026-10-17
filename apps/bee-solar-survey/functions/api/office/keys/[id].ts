/** DELETE /api/office/keys/<id> — revoke one personal key (kept for the record). Role: admin. */
import { authenticate, revokeKey } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, param, preflight } from '../../../_lib/http'
import { UUID_RE } from '../../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestDelete: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'admin')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  const row = await revokeKey(env, id)
  if (!row) return json(request, env, { error: 'not_found' }, 404)
  return json(request, env, { ok: true, row })
}
