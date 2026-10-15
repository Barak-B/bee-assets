/**
 * PUT /api/surveys/<id>/reports/<reportId> — back up a field report (auth).
 * Drafts may be replaced; a final report never changes (other content → 409).
 * Responds with the photos the server still lacks.
 */
import type { Handler } from '../../../../_lib/env'
import { json, param, preflight, requireKey } from '../../../../_lib/http'
import { UUID_RE, getSurvey, isReportWire, putReport } from '../../../../_lib/surveys'

const MAX = 2 * 1024 * 1024

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const id = param(params.id)
  const rid = param(params.report)
  if (!UUID_RE.test(id) || !UUID_RE.test(rid)) return json(request, env, { error: 'bad_key' }, 400)
  if (!(await getSurvey(env, id))) return json(request, env, { error: 'survey_first', message_he: 'יש לסנכרן את הסקר לפני הדוח' }, 409)
  const text = await request.text()
  if (text.length > MAX) return json(request, env, { error: 'too_large' }, 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!isReportWire(body, id, rid)) return json(request, env, { error: 'bad_report', message_he: 'מבנה דוח לא תקין' }, 400)
  const res = await putReport(env, id, body)
  if (res.result === 'conflict') return json(request, env, { error: 'report_final', message_he: 'הדוח כבר נעול בשרת עם תוכן אחר' }, 409)
  return json(request, env, { ok: true, result: res.result, missing_photos: res.missingPhotos }, res.result === 'stored' ? 201 : 200)
}
