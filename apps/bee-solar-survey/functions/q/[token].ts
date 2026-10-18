/** GET /q/<token> — the customer's quote page. */
import { QUOTE_TOKEN_RE } from '../../../../packages/quote-core/src/public'
import type { Handler } from '../_lib/env'
import { html, param } from '../_lib/http'
import { getCompany } from '../_lib/company'
import { jobFor } from '../_lib/office'
import { renderMessagePage, renderQuotePage, type CustomerProgress } from '../_lib/render'
import { STAGES, stageMilestones, type Stage } from '../../src/stage'
import { getAcceptance, getQuote, recordView } from '../_lib/store'

export const onRequestGet: Handler = async ({ request, env, params, waitUntil }) => {
  const token = param(params.token)
  const notFound = () => html(renderMessagePage('ההצעה לא נמצאה', 'הקישור אינו תקף או שההצעה הוסרה. לפרטים פנו לברק אלקטריק אנג׳ינירינג.'), 404)
  if (!QUOTE_TOKEN_RE.test(token)) return notFound()
  const rec = await getQuote(env, token)
  if (!rec) return notFound()

  // Count real opens only (not link-preview bots that send HEAD or prefetch).
  const purpose = request.headers.get('purpose') ?? request.headers.get('sec-purpose') ?? ''
  if (!/prefetch|prerender/i.test(purpose)) {
    const p = recordView(env, token).catch(() => undefined)
    if (waitUntil) waitUntil(p)
    else await p
  }
  const acceptance = await getAcceptance(env, token)
  const justAccepted = !!acceptance && new URL(request.url).searchParams.get('accepted') === '1'
  const [progress, company] = await Promise.all([acceptance && rec.survey_id ? customerProgress(env, rec.survey_id).catch(() => null) : null, getCompany(env)])
  return html(renderQuotePage(rec.quote, { token, hasPdf: rec.has_pdf, acceptance, justAccepted, progress, company }))
}

/**
 * Where the project stands, for the customer: the stage only, and the day
 * each stage was completed. Nothing internal (notes, references, people).
 * A job the office marked lost or closed shows no progress.
 */
async function customerProgress(env: Parameters<Handler>[0]['env'], surveyId: string): Promise<CustomerProgress | null> {
  const job = await jobFor(env, surveyId)
  if (!job || job.office?.status === 'lost' || job.office?.status === 'closed') return null
  const doneOn: Partial<Record<Stage, string>> = {}
  for (const s of STAGES) {
    const dates = stageMilestones(s).map((d) => job.milestones[d.key]?.date ?? '')
    if (dates.length && dates.every(Boolean)) doneOn[s] = dates.sort().pop()!
  }
  return { stage: job.stage, onHold: job.office?.status === 'on_hold', doneOn }
}
