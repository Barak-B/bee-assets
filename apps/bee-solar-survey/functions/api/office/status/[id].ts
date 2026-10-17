/**
 * PUT /api/office/status/<surveyId> — the office's status and note on a job
 * (active / on hold / lost / closed). Body: { status, note? }. Role: office.
 * Stored apart from the survey record, so the field app never overwrites it.
 */
import { OFFICE_STATUS_LABEL_HE, isOfficeStatus } from '../../../../src/stage'
import { authenticate } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, param, preflight } from '../../../_lib/http'
import { putOfficeStatus } from '../../../_lib/office'
import { UUID_RE, clip, getSurvey } from '../../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  let body: { status?: unknown; note?: unknown }
  try {
    const text = await request.text()
    if (text.length > 4096) return json(request, env, { error: 'too_large' }, 413)
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!isOfficeStatus(body.status)) return json(request, env, { error: 'bad_status', message_he: `סטטוס לא מוכר. אפשר: ${Object.values(OFFICE_STATUS_LABEL_HE).join(' / ')}` }, 400)
  if (!(await getSurvey(env, id))) return json(request, env, { error: 'not_found' }, 404)
  // 200 code points: R2 metadata is capped at 2 KB and Hebrew URL-encodes to 6 bytes a letter.
  const row = { status: body.status, note: clip(typeof body.note === 'string' ? body.note.trim() : '', 200), updated_at: new Date().toISOString(), updated_by: auth.principal.name }
  await putOfficeStatus(env, id, row)
  return json(request, env, { ok: true, office: row })
}
