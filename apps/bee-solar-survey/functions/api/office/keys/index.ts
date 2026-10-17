/**
 * GET  /api/office/keys — personal keys (never the keys themselves). Role: admin.
 * POST /api/office/keys — { name, role } → the new key, shown once. Role: admin.
 */
import { ROLES, authenticate, createKey, listKeys, type Role } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, preflight } from '../../../_lib/http'
import { clip } from '../../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'admin')
  if (!auth.ok) return auth.response
  return json(request, env, { keys: await listKeys(env) })
}

export const onRequestPost: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'admin')
  if (!auth.ok) return auth.response
  let body: { name?: unknown; role?: unknown }
  try {
    const text = await request.text()
    if (text.length > 2048) return json(request, env, { error: 'too_large' }, 413)
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  const name = clip(typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '', 40)
  if (name.length < 2) return json(request, env, { error: 'bad_name', message_he: 'נא לתת שם למפתח (למשל שם הסוקר)' }, 400)
  if (!ROLES.includes(body.role as Role)) return json(request, env, { error: 'bad_role', message_he: 'תפקיד לא מוכר' }, 400)
  const { key, row } = await createKey(env, name, body.role as Role, auth.principal)
  return json(request, env, { key, row }, 201)
}
