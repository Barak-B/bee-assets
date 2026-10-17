/**
 * PUT /api/office/status/<surveyId> — the office's row on a job. Body: any of
 * { status: active|on_hold|lost|closed, note, assigned_to: <key id>|'', planned_date: YYYY-MM-DD|'' };
 * only the fields sent change. Role: office. Stored apart from the survey
 * record, so the field app never overwrites it.
 */
import { authenticate } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, param, preflight } from '../../../_lib/http'
import { updateOffice, type OfficeUpdate } from '../../../_lib/office'
import { UUID_RE, getSurvey } from '../../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  let body: OfficeUpdate
  try {
    const text = await request.text()
    if (text.length > 4096) return json(request, env, { error: 'too_large' }, 413)
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!body || typeof body !== 'object') return json(request, env, { error: 'bad_json' }, 400)
  if (!(await getSurvey(env, id))) return json(request, env, { error: 'not_found' }, 404)
  const res = await updateOffice(env, id, body, auth.principal)
  if ('error' in res) return json(request, env, { error: 'bad_field', message_he: res.error }, 400)
  return json(request, env, { ok: true, office: res.row })
}
