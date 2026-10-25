/**
 * /api/office/submission/<surveyId> — the job's submission file (role: office).
 *   GET → { submission | null, suggested: { id, why_he } }
 *   PUT { track?, steps?: { <step>: { date, ref? } | null }, docs?: { <kind>: { date } | null }, na?: [phase] }
 *       → { submission, office } (steps that are milestones mark them too)
 */
import { authenticate } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, param, preflight } from '../../../_lib/http'
import { getOfficeStatus, latestQuoteOf, updateOffice } from '../../../_lib/office'
import { getSubmission, putSubmission, resolveSubmission, suggestFor } from '../../../_lib/submission'
import { UUID_RE, getSurvey } from '../../../_lib/surveys'
import { logEvents, logOfficeChanges } from '../../../_lib/timeline'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

async function suggestion(env: Parameters<Handler>[0]['env'], id: string) {
  const [survey, quote] = await Promise.all([getSurvey(env, id), latestQuoteOf(env, id)])
  return { survey, suggested: suggestFor(quote?.inverter_ac_kw ?? quote?.dc_kwp ?? null, (survey?.project as Record<string, unknown> | undefined)?.customerType) }
}

export const onRequestGet: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  const [{ survey, suggested }, submission] = await Promise.all([suggestion(env, id), getSubmission(env, id)])
  if (!survey) return json(request, env, { error: 'not_found' }, 404)
  return json(request, env, { submission, suggested })
}

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > 16384) return json(request, env, { error: 'too_large' }, 413)
    body = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (!body || typeof body !== 'object') return json(request, env, { error: 'bad_json' }, 400)
  const { survey, suggested } = await suggestion(env, id)
  if (!survey) return json(request, env, { error: 'not_found' }, 404)
  const now = new Date()
  const res = resolveSubmission(await getSubmission(env, id), body, auth.principal.name, suggested.id, now)
  if ('error' in res) return json(request, env, { error: 'bad_field', message_he: res.error }, 400)
  await putSubmission(env, id, res.row)

  // The same fact as a milestone: mark it, unless the office already did.
  const have = (await getOfficeStatus(env, id))?.milestones ?? {}
  const fresh = Object.fromEntries(Object.entries(res.milestones).filter(([k]) => !have[k as keyof typeof have]))
  let office = null
  if (Object.keys(fresh).length) {
    const up = await updateOffice(env, id, { milestones: fresh }, auth.principal, now)
    if ('row' in up) {
      office = up.row
      await logOfficeChanges(env, id, up.prev, up.row, auth.principal.name, now, res.events)
    }
  } else await logEvents(env, id, res.events, auth.principal.name, now)
  return json(request, env, { ok: true, submission: res.row, office })
}
