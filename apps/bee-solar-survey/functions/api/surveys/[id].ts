/**
 * PUT /api/surveys/<id> — upsert the survey record from the field app (auth).
 *   Responds with the photos the server still lacks, so the app can upload them.
 * GET /api/surveys/<id> — the latest record + its quote versions (auth; used to
 *   restore surveys onto a new phone and by the hive to pick up the survey).
 */
import type { Handler } from '../../_lib/env'
import { json, param, preflight, requireKey } from '../../_lib/http'
import { UUID_RE, getSurvey, isSurveyRecord, listQuoteVersions, putSurvey } from '../../_lib/surveys'

const MAX = 2 * 1024 * 1024

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  const text = await request.text()
  if (text.length > MAX) return json(request, env, { error: 'too_large' }, 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!isSurveyRecord(body, id)) return json(request, env, { error: 'bad_record', message_he: 'מבנה סקר לא תקין' }, 400)
  const res = await putSurvey(env, id, body)
  return json(request, env, { ok: true, changed: res.changed, missing_photos: res.missingPhotos, received_at: res.row.receivedAt })
}

export const onRequestGet: Handler = async ({ request, env, params }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  const rec = await getSurvey(env, id)
  if (!rec) return json(request, env, { error: 'not_found' }, 404)
  return json(request, env, { survey: rec, quotes: await listQuoteVersions(env, id) })
}
