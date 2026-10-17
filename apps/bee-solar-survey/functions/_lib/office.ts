/**
 * The office screen's view of every job: survey + customer + quotes + customer
 * links (views, approval) + field reports + the office's own status, with the
 * stage derived from all of it. Read from what the field app and the customer
 * page already wrote — nothing here is entered twice.
 *
 *   office/<surveyId>   tiny object; customMetadata = the office status row
 */
import { deriveStage, isInstallationTemplate, isOfficeStatus, type OfficeStatus, type Stage } from '../../src/stage'
import type { Env } from './env'
import { getAcceptance, getViews, listQuoteLinks, type QuoteLinkRow } from './store'
import { UUID_RE, decodeMeta, encodeMeta, listSurveys, type SurveyIndexRow } from './surveys'

export interface OfficeStatusRow {
  status: OfficeStatus
  note: string
  updated_at: string
  updated_by: string
}

const officeKey = (id: string) => `office/${id}`

export async function getOfficeStatus(env: Env, id: string): Promise<OfficeStatusRow | null> {
  const obj = await env.QUOTES.get(officeKey(id))
  return obj?.customMetadata ? rowFromMeta(obj.customMetadata) : null
}

function rowFromMeta(raw: Record<string, string>): OfficeStatusRow | null {
  const m = decodeMeta(raw)
  if (!isOfficeStatus(m.status)) return null
  return { status: m.status, note: m.note ?? '', updated_at: m.updated_at ?? '', updated_by: m.updated_by ?? '' }
}

export async function putOfficeStatus(env: Env, id: string, row: OfficeStatusRow): Promise<void> {
  await env.QUOTES.put(officeKey(id), '', { customMetadata: encodeMeta({ ...row }) })
}

export interface OfficeLink extends QuoteLinkRow {
  views: number
  last_viewed_at: string | null
  accepted: { name: string; accepted_at: string; id_verified: boolean; total_incl_vat_ils: number | null } | null
}

export interface OfficeReport {
  reportId: string
  templateKey: string
  title_he: string
  revision: number
  status: string
  updatedAt: string
  outcomeTone: string
  outcomeLabel: string
}

export interface LatestQuote {
  version_no: number
  quote_number: string
  created_at: string
  total_incl_vat_ils: number | null
  dc_kwp: number | null
  needs_owner_input: boolean
}

export interface OfficeRow extends SurveyIndexRow {
  stage: Stage
  office: OfficeStatusRow | null
  latestQuote: LatestQuote | null
  links: OfficeLink[]
  reports: OfficeReport[]
  /** Newest thing that happened on the job (survey, link, view, approval, report, office note). */
  lastActivityAt: string
}

async function listAll(env: Env, prefix: string): Promise<{ key: string; meta: Record<string, string> }[]> {
  const out: { key: string; meta: Record<string, string> }[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix, cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) out.push({ key: o.key, meta: o.customMetadata ?? {} })
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return out
}

async function latestQuote(env: Env, id: string): Promise<LatestQuote | null> {
  const objs = await listAll(env, `surveys/${id}/quotes/`)
  const versions = objs.map((o) => Number(/\/v(\d+)\.json$/.exec(o.key)?.[1] ?? 0)).filter((n) => n > 0)
  if (!versions.length) return null
  const v = Math.max(...versions)
  const obj = await env.QUOTES.get(`surveys/${id}/quotes/v${v}.json`)
  if (!obj) return null
  try {
    const q = JSON.parse(await obj.text()) as {
      quote_number?: string
      created_at?: string
      needs_owner_input?: boolean
      totals?: { total_incl_vat_ils?: number | null }
      design?: { dc_kwp?: number | null }
    }
    return {
      version_no: v,
      quote_number: String(q.quote_number ?? ''),
      created_at: String(q.created_at ?? ''),
      total_incl_vat_ils: typeof q.totals?.total_incl_vat_ils === 'number' ? q.totals.total_incl_vat_ils : null,
      dc_kwp: typeof q.design?.dc_kwp === 'number' ? q.design.dc_kwp : null,
      needs_owner_input: !!q.needs_owner_input,
    }
  } catch {
    return null
  }
}

async function officeLinks(env: Env, id: string): Promise<OfficeLink[]> {
  const links = await listQuoteLinks(env, id)
  return Promise.all(
    links.map(async (l) => {
      const [v, a] = await Promise.all([getViews(env, l.token), getAcceptance(env, l.token)])
      return {
        ...l,
        views: v.views,
        last_viewed_at: v.last_viewed_at,
        accepted: a ? { name: a.name, accepted_at: a.accepted_at, id_verified: !!a.id_verified, total_incl_vat_ils: a.total_incl_vat_ils } : null,
      }
    }),
  )
}

function reportsBySurvey(objs: { key: string; meta: Record<string, string> }[]): Map<string, OfficeReport[]> {
  const out = new Map<string, OfficeReport[]>()
  for (const o of objs) {
    const m = decodeMeta(o.meta)
    const surveyId = m.surveyId || o.key.split('/')[1] || ''
    if (!surveyId || !m.reportId) continue
    const list = out.get(surveyId) ?? []
    list.push({
      reportId: m.reportId,
      templateKey: m.templateKey ?? '',
      title_he: m.title_he ?? '',
      revision: Number(m.revision ?? 0),
      status: m.status ?? '',
      updatedAt: m.updatedAt ?? '',
      outcomeTone: m.outcomeTone ?? '',
      outcomeLabel: m.outcomeLabel ?? '',
    })
    out.set(surveyId, list)
  }
  for (const list of out.values()) list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return out
}

/** One job, fully resolved. */
export async function officeRow(env: Env, row: SurveyIndexRow, reports: OfficeReport[], office: OfficeStatusRow | null): Promise<OfficeRow> {
  const [quote, links] = await Promise.all([latestQuote(env, row.id), officeLinks(env, row.id)])
  const stage = deriveStage({
    quoteVersions: quote?.version_no ?? 0,
    liveLinks: links.filter((l) => !l.revoked_at).length,
    accepted: links.some((l) => !!l.accepted),
    installationReports: reports.filter((r) => isInstallationTemplate(r.templateKey)).length,
    handoverFinal: reports.some((r) => r.templateKey === 'handover' && r.status === 'final'),
  })
  const times = [
    row.receivedAt,
    office?.updated_at ?? '',
    ...links.flatMap((l) => [l.published_at, l.last_viewed_at ?? '', l.accepted?.accepted_at ?? '', l.revoked_at ?? '']),
    ...reports.map((r) => r.updatedAt),
  ]
  return { ...row, stage, office, latestQuote: quote, links, reports, lastActivityAt: times.filter(Boolean).sort().pop() ?? row.receivedAt }
}

/** Every office status, by survey id (one list call). */
export async function listOfficeStatuses(env: Env): Promise<Map<string, OfficeStatusRow>> {
  const office = new Map<string, OfficeStatusRow>()
  for (const o of await listAll(env, 'office/')) {
    const id = o.key.slice('office/'.length)
    const row = rowFromMeta(o.meta)
    if (UUID_RE.test(id) && row) office.set(id, row)
  }
  return office
}

/** Every job, most recent activity first. */
export async function buildOverview(env: Env): Promise<OfficeRow[]> {
  const [surveys, reportObjs, office] = await Promise.all([listSurveys(env), listAll(env, 'report-index/'), listOfficeStatuses(env)])
  const reports = reportsBySurvey(reportObjs)
  const rows = await Promise.all(surveys.map((s) => officeRow(env, s, reports.get(s.id) ?? [], office.get(s.id) ?? null)))
  return rows.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
}
