/**
 * POST /api/office/jobs — a new job opened by the office (a phone call, a lead
 * from the website): customer, address, note, and optionally the surveyor and
 * the planned survey date. Role: office.
 *
 * It is stored as an ordinary survey record (no photos, not yet surveyed —
 * stage "ממתין לסקר"), so the assigned surveyor's phone pulls it on its next
 * sync and carries on from there; from then on the phone's copy is the survey.
 */
import { emptyProject } from '../../../../src/schema'
import { authenticate } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, preflight } from '../../../_lib/http'
import { putOfficeStatus, resolveOfficeUpdate } from '../../../_lib/office'
import { clip, putSurvey, type SurveyRecord } from '../../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

const text = (v: unknown, max: number) => clip(typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '', max)

export const onRequestPost: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > 8192) return json(request, env, { error: 'too_large' }, 413)
    body = JSON.parse(raw)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!body || typeof body !== 'object') return json(request, env, { error: 'bad_json' }, 400)

  const customerName = text(body.customerName, 80)
  const customerPhone = text(body.customerPhone, 30)
  const address = text(body.address, 160)
  const projectName = text(body.projectName, 80) || [customerName, address.split(',').pop()?.trim()].filter(Boolean).join(' · ')
  if (!customerName && !projectName) return json(request, env, { error: 'bad_job', message_he: 'נא למלא שם לקוח או שם פרויקט' }, 400)
  if (!address) return json(request, env, { error: 'bad_job', message_he: 'נא למלא כתובת' }, 400)
  if (!customerPhone) return json(request, env, { error: 'bad_job', message_he: 'נא למלא טלפון של הלקוח' }, 400)

  const now = new Date()
  const id = crypto.randomUUID()
  const planned = typeof body.planned_date === 'string' ? body.planned_date : ''
  const project = emptyProject({
    id,
    projectName,
    customerName,
    customerPhone,
    customerEmail: text(body.customerEmail, 80),
    address,
    generalNotes: text(body.note, 500),
    surveyDate: /^\d{4}-\d{2}-\d{2}$/.test(planned) ? planned : '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
  const record: SurveyRecord = {
    schema: 'bee.survey-record/1',
    project: project as unknown as SurveyRecord['project'],
    photos: [],
    completeness: { score: 0, readyForWave54: false },
    contentHash: `office-${id}`,
    client: { app: 'bee-office', sentAt: now.toISOString() },
  }

  // The assignment is checked before anything is written, so a bad surveyor leaves no half-made job.
  const update = { assigned_to: typeof body.assigned_to === 'string' ? body.assigned_to : '', planned_date: planned, note: text(body.note, 200) }
  const office = await resolveOfficeUpdate(env, null, update, auth.principal, now)
  if ('error' in office) return json(request, env, { error: 'bad_field', message_he: office.error }, 400)
  await putSurvey(env, id, record, now, auth.principal.name)
  await putOfficeStatus(env, id, office.row)
  return json(request, env, { ok: true, id, office: office.row }, 201)
}
