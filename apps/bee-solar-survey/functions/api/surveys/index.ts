/** GET /api/surveys[?since=ISO] — every backed-up survey, newest first, with the office status (auth). */
import type { Handler } from '../../_lib/env'
import { authenticate } from '../../_lib/auth'
import { json, parseSince, preflight } from '../../_lib/http'
import { listOfficeStatuses } from '../../_lib/office'
import { listSurveys } from '../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.response
  const { since, error } = parseSince(request, env)
  if (error) return error
  const [surveys, office] = await Promise.all([listSurveys(env, since), listOfficeStatuses(env)])
  // The office status rides along, so phones pick it up without re-sending unchanged surveys.
  return json(request, env, { surveys: surveys.map((s) => ({ ...s, office: office.get(s.id) ?? null })) })
}
