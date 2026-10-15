/**
 * GET /api/hive/jobs[?since=ISO] — hive jobs (collect / edit / dispatch.draft)
 * from surveys received since a timestamp, for the supervisor / Alfred to pull,
 * plus `events`: customer approvals of published quotes (quote.accepted) and
 * locked field reports (report.finalized — e.g. a failed inspection or a signed handover).
 *
 * Delivery is at-least-once: `until` is taken before listing and moved back by
 * OVERLAP_MS, so a write that lands while we list is seen on the next poll
 * rather than lost. Consumers dedupe on `event_id` / (`survey_id`, `content_hash`).
 * Read-only; nothing here sends anything anywhere (Law #1/#2).
 */
import type { Handler } from '../../_lib/env'
import { json, parseSince, preflight, requireKey } from '../../_lib/http'
import { listAcceptances } from '../../_lib/store'
import { getSurvey, listFinalReports, listSurveys } from '../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

const OVERLAP_MS = 60_000

export const onRequestGet: Handler = async ({ request, env }) => {
  const denied = requireKey(request, env)
  if (denied) return denied
  const { since, error } = parseSince(request, env)
  if (error) return error
  const until = new Date(Date.now() - OVERLAP_MS).toISOString()
  const rows = await listSurveys(env, since)
  const jobs: unknown[] = []
  for (const r of rows) {
    const rec = await getSurvey(env, r.id)
    const list = Array.isArray(rec?.hive?.jobs) ? rec!.hive!.jobs! : []
    for (const j of list) if (j && typeof j === 'object') jobs.push({ ...(j as object), survey_id: r.id, content_hash: r.contentHash, received_at: r.receivedAt })
  }
  const events: Record<string, unknown>[] = (await listAcceptances(env, since)).map((a) => ({
    event_id: `quote.accepted:${a.token}`,
    type: 'quote.accepted',
    at: a.accepted_at,
    token: a.token,
    quote_number: a.quote_number,
    version_no: a.version_no,
    reference: a.reference,
    customer_name: a.name,
    total_incl_vat_ils: a.total_incl_vat_ils,
    // Next step is a human one: Barak prepares the agreement (Law #2 — nothing is sent automatically).
    requiresHumanPick: true,
  }))
  for (const r of await listFinalReports(env, since)) {
    events.push({
      event_id: `report.finalized:${r.reportId}:${r.contentHash}`,
      type: 'report.finalized',
      at: r.receivedFinalAt,
      survey_id: r.surveyId,
      report_id: r.reportId,
      template: r.templateKey,
      title_he: r.title_he,
      revision: r.revision,
      content_hash: r.contentHash,
      outcome: r.outcomeTone ? { tone: r.outcomeTone, label_he: r.outcomeLabel } : null,
      requiresHumanPick: true,
    })
  }
  return json(request, env, { since: since ?? null, until, jobs, events })
}
