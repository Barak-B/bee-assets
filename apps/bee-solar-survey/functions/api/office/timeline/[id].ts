/** GET /api/office/timeline/<surveyId> — every event on the job, newest first (role: office). */
import { authenticate } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, param, preflight } from '../../../_lib/http'
import { UUID_RE } from '../../../_lib/surveys'
import { buildTimeline } from '../../../_lib/timeline'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  return json(request, env, { events: await buildTimeline(env, id) })
}
