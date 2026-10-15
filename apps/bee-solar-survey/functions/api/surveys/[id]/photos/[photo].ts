/** PUT/GET /api/surveys/<id>/photos/<photoId>.<sha12> — photo bytes (auth). */
import type { Handler } from '../../../../_lib/env'
import { json, param, preflight, requireKey } from '../../../../_lib/http'
import { PHOTO_KEY_RE, UUID_RE, getPhoto, putPhoto } from '../../../../_lib/surveys'

const MAX = 6 * 1024 * 1024
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const id = param(params.id)
  const key = param(params.photo)
  if (!UUID_RE.test(id) || !PHOTO_KEY_RE.test(key)) return json(request, env, { error: 'bad_key' }, 400)
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim()
  if (!TYPES.has(type)) return json(request, env, { error: 'bad_type' }, 415)
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) return json(request, env, { error: 'empty' }, 400)
  if (bytes.byteLength > MAX) return json(request, env, { error: 'too_large' }, 413)
  await putPhoto(env, id, key, bytes, type)
  return json(request, env, { ok: true, bytes: bytes.byteLength }, 201)
}

export const onRequestGet: Handler = async ({ request, env, params }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const id = param(params.id)
  const key = param(params.photo)
  if (!UUID_RE.test(id) || !PHOTO_KEY_RE.test(key)) return json(request, env, { error: 'bad_key' }, 400)
  const bytes = await getPhoto(env, id, key)
  if (!bytes) return json(request, env, { error: 'not_found' }, 404)
  return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } })
}
