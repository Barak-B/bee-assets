/** GET /api/surveys[?since=ISO] — every backed-up survey, newest first (auth). */
import type { Handler } from '../../_lib/env'
import { json, parseSince, preflight, requireKey } from '../../_lib/http'
import { listSurveys } from '../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const { since, error } = parseSince(request, env)
  if (error) return error
  return json(request, env, { surveys: await listSurveys(env, since) })
}
