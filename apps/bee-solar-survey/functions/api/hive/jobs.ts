/**
 * GET /api/hive/jobs[?since=ISO] — hive jobs (collect / edit / dispatch.draft)
 * from surveys received since a timestamp, for the supervisor / Alfred to pull.
 * Read-only; nothing here sends anything anywhere (Law #1/#2).
 */
import type { Handler } from '../../_lib/env'
import { json, preflight, requireKey } from '../../_lib/http'
import { getSurvey, listSurveys } from '../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const since = new URL(request.url).searchParams.get('since') ?? undefined
  const rows = await listSurveys(env, since)
  const jobs: unknown[] = []
  for (const r of rows) {
    const rec = await getSurvey(env, r.id)
    for (const j of rec?.hive?.jobs ?? []) jobs.push({ ...(j as object), survey_id: r.id, received_at: r.receivedAt })
  }
  return json(request, env, { since: since ?? null, until: new Date().toISOString(), jobs })
}
