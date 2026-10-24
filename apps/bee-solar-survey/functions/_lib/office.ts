/**
 * The office screen's view of every job: survey + customer + quotes + customer
 * links (views, approval) + field reports + the office's own status, with the
 * stage derived from all of it. Read from what the field app and the customer
 * page already wrote — nothing here is entered twice.
 *
 *   office/<surveyId>   tiny object; customMetadata = the office status row
 *                       (status, note, assigned surveyor, planned survey date,
 *                       lifecycle milestones as "cs=20261020,is=20261022~123")
 */
import {
  MILESTONE_BY_KEY,
  MILESTONE_REF_RE,
  OFFICE_STATUS_LABEL_HE,
  decodeMilestones,
  deriveStage,
  effectiveMilestones,
  encodeMilestones,
  isInstallationTemplate,
  isMilestoneKey,
  isOfficeStatus,
  type Milestones,
  type OfficeStatus,
  type Stage,
} from '../../src/stage'
import { listKeys, type Principal } from './auth'
import type { Env } from './env'
import { israelToday } from './http'
import { getAcceptance, getViews, listQuoteLinks, type QuoteLinkRow } from './store'
import { UUID_RE, clip, decodeMeta, encodeMeta, listSurveys, readIndex, type SurveyIndexRow } from './surveys'

export interface OfficeStatusRow {
  status: OfficeStatus
  note: string
  updated_at: string
  updated_by: string
  /** Personal key id of the surveyor the job is assigned to ('' = nobody). */
  assigned_to_id: string
  assigned_to_name: string
  /** Planned survey date, YYYY-MM-DD ('' = not set). */
  planned_date: string
  /** Planned installation start, YYYY-MM-DD ('' = not set). */
  install_date: string
  /** Lifecycle milestones the office marked (contract, IEC, meter…). */
  milestones: Milestones
}

export const EMPTY_OFFICE: Omit<OfficeStatusRow, 'updated_at' | 'updated_by'> = { status: 'active', note: '', assigned_to_id: '', assigned_to_name: '', planned_date: '', install_date: '', milestones: {} }

/** R2 caps customMetadata at 2048 bytes (keys + values). */
const META_LIMIT = 2000

const officeKey = (id: string) => `office/${id}`

export async function getOfficeStatus(env: Env, id: string): Promise<OfficeStatusRow | null> {
  const obj = await env.QUOTES.get(officeKey(id))
  return obj?.customMetadata ? rowFromMeta(obj.customMetadata) : null
}

function rowFromMeta(raw: Record<string, string>): OfficeStatusRow | null {
  const m = decodeMeta(raw)
  if (!isOfficeStatus(m.status)) return null
  return {
    status: m.status,
    note: m.note ?? '',
    updated_at: m.updated_at ?? '',
    updated_by: m.updated_by ?? '',
    assigned_to_id: m.assigned_to_id ?? '',
    assigned_to_name: m.assigned_to_name ?? '',
    planned_date: m.planned_date ?? '',
    install_date: m.install_date ?? '',
    milestones: decodeMilestones(m.ms),
  }
}

function metaOf(row: OfficeStatusRow): Record<string, string> {
  const { milestones, ...rest } = row
  return encodeMeta({ ...rest, ms: encodeMilestones(milestones) })
}

const metaBytes = (m: Record<string, string>) => Object.entries(m).reduce((n, [k, v]) => n + k.length + v.length, 0)

export async function putOfficeStatus(env: Env, id: string, row: OfficeStatusRow): Promise<void> {
  await env.QUOTES.put(officeKey(id), '', { customMetadata: metaOf(row) })
}

export interface OfficeUpdate {
  status?: unknown
  note?: unknown
  /** Personal key id, or '' to unassign. */
  assigned_to?: unknown
  /** YYYY-MM-DD, or '' to clear. */
  planned_date?: unknown
  /** Planned installation start, YYYY-MM-DD, or '' to clear. */
  install_date?: unknown
  /** { <milestone>: { date: YYYY-MM-DD, ref? } | null }; only the keys sent change, null clears. */
  milestones?: unknown
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

/**
 * A partial update merged into `prev` (only the fields present change), or a
 * Hebrew error for a bad field. Writes nothing.
 */
export async function resolveOfficeUpdate(env: Env, prev: OfficeStatusRow | null, u: OfficeUpdate, by: Principal, now = new Date()): Promise<{ row: OfficeStatusRow } | { error: string }> {
  const next: OfficeStatusRow = { ...EMPTY_OFFICE, ...(prev ?? {}), updated_at: now.toISOString(), updated_by: by.name }
  if (u.status !== undefined) {
    if (!isOfficeStatus(u.status)) return { error: `סטטוס לא מוכר. אפשר: ${Object.values(OFFICE_STATUS_LABEL_HE).join(' / ')}` }
    next.status = u.status
  }
  // 200 code points: R2 metadata is capped at 2 KB and Hebrew URL-encodes to 6 bytes a letter.
  if (u.note !== undefined) next.note = clip(typeof u.note === 'string' ? u.note.trim() : '', 200)
  if (u.planned_date !== undefined) {
    if (u.planned_date !== '' && !isDay(u.planned_date)) return { error: 'תאריך לא תקין (YYYY-MM-DD)' }
    next.planned_date = u.planned_date as string
  }
  if (u.install_date !== undefined) {
    if (u.install_date !== '' && !isDay(u.install_date)) return { error: 'מועד התקנה לא תקין (YYYY-MM-DD)' }
    next.install_date = u.install_date as string
  }
  if (u.assigned_to !== undefined) {
    if (u.assigned_to === '') {
      next.assigned_to_id = ''
      next.assigned_to_name = ''
    } else {
      const key = (await listKeys(env)).find((k) => k.id === u.assigned_to && !k.revoked_at)
      if (!key) return { error: 'הסוקר לא נמצא, או שהמפתח שלו בוטל' }
      next.assigned_to_id = key.id
      next.assigned_to_name = key.name
    }
  }
  if (u.milestones !== undefined) {
    if (!u.milestones || typeof u.milestones !== 'object' || Array.isArray(u.milestones)) return { error: 'אבני דרך: מבנה לא תקין' }
    const ms: Milestones = { ...next.milestones }
    const today = israelToday(now)
    for (const [key, v] of Object.entries(u.milestones as Record<string, unknown>)) {
      if (!isMilestoneKey(key)) return { error: `אבן דרך לא מוכרת: ${key}` }
      const label = MILESTONE_BY_KEY[key].label_he
      if (v === null) {
        delete ms[key]
        continue
      }
      const { date, ref = '' } = (v ?? {}) as { date?: unknown; ref?: unknown }
      if (!isDay(date)) return { error: `${label}: תאריך לא תקין` }
      // A milestone is something that happened.
      if (date > today) return { error: `${label}: התאריך עוד לא הגיע` }
      if (typeof ref !== 'string' || !MILESTONE_REF_RE.test(ref.trim())) return { error: `${label}: אסמכתא — ספרות ואותיות לועזיות בלבד, עד 24 תווים` }
      ms[key] = { date, ...(ref.trim() ? { ref: ref.trim() } : {}) }
    }
    next.milestones = ms
  }
  if (metaBytes(metaOf(next)) > META_LIMIT) return { error: 'ההערה ארוכה מדי — קצרו אותה' }
  return { row: next }
}

/** Merge a partial update into the job's office row and store it. */
export async function updateOffice(env: Env, id: string, u: OfficeUpdate, by: Principal, now = new Date()): Promise<{ row: OfficeStatusRow; prev: OfficeStatusRow | null } | { error: string }> {
  const prev = await getOfficeStatus(env, id)
  const res = await resolveOfficeUpdate(env, prev, u, by, now)
  if (!('row' in res)) return res
  await putOfficeStatus(env, id, res.row)
  return { row: res.row, prev }
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
  /** YYYY-MM-DD ('' when the quote has none). */
  valid_until: string
  inverter_ac_kw: number | null
}

export interface OfficeRow extends SurveyIndexRow {
  stage: Stage
  office: OfficeStatusRow | null
  /** The office's milestones plus what locked reports prove (those carry `auto`). */
  milestones: Milestones
  latestQuote: LatestQuote | null
  links: OfficeLink[]
  reports: OfficeReport[]
  /** Newest thing that happened on the job (survey, link, view, approval, report, office note). */
  lastActivityAt: string
}

export async function listAll(env: Env, prefix: string): Promise<{ key: string; meta: Record<string, string> }[]> {
  const out: { key: string; meta: Record<string, string> }[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix, cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) out.push({ key: o.key, meta: o.customMetadata ?? {} })
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return out
}

/** The newest quote version of a job, summarised. */
export async function latestQuoteOf(env: Env, id: string): Promise<LatestQuote | null> {
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
      terms?: { valid_until?: string | null }
      needs_owner_input?: boolean
      totals?: { total_incl_vat_ils?: number | null }
      design?: { dc_kwp?: number | null; inverter_ac_kw?: number | null }
    }
    return {
      version_no: v,
      quote_number: String(q.quote_number ?? ''),
      created_at: String(q.created_at ?? ''),
      total_incl_vat_ils: typeof q.totals?.total_incl_vat_ils === 'number' ? q.totals.total_incl_vat_ils : null,
      dc_kwp: typeof q.design?.dc_kwp === 'number' ? q.design.dc_kwp : null,
      needs_owner_input: !!q.needs_owner_input,
      valid_until: typeof q.terms?.valid_until === 'string' ? q.terms.valid_until.slice(0, 10) : '',
      inverter_ac_kw: typeof q.design?.inverter_ac_kw === 'number' ? q.design.inverter_ac_kw : null,
    }
  } catch {
    return null
  }
}

export async function officeLinks(env: Env, id: string): Promise<OfficeLink[]> {
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

export function reportsBySurvey(objs: { key: string; meta: Record<string, string> }[]): Map<string, OfficeReport[]> {
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
  const [quote, links] = await Promise.all([latestQuoteOf(env, row.id), officeLinks(env, row.id)])
  const finalAt = (key: string) => reports.find((r) => r.templateKey === key && r.status === 'final')?.updatedAt
  const facts = {
    surveyed: row.photoCount > 0 || row.readyForWave54,
    quoteVersions: quote?.version_no ?? 0,
    liveLinks: links.filter((l) => !l.revoked_at).length,
    accepted: links.some((l) => !!l.accepted),
    installationReports: reports.filter((r) => isInstallationTemplate(r.templateKey)).length,
    handoverFinal: !!finalAt('handover'),
    handoverFinalAt: finalAt('handover'),
    installationChecklistFinalAt: finalAt('installation_checklist'),
    milestones: office?.milestones ?? {},
  }
  const stage = deriveStage(facts)
  const times = [
    row.receivedAt,
    office?.updated_at ?? '',
    ...links.flatMap((l) => [l.published_at, l.last_viewed_at ?? '', l.accepted?.accepted_at ?? '', l.revoked_at ?? '']),
    ...reports.map((r) => r.updatedAt),
  ]
  return { ...row, stage, office, milestones: effectiveMilestones(facts), latestQuote: quote, links, reports, lastActivityAt: times.filter(Boolean).sort().pop() ?? row.receivedAt }
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

/** One job, as the office sees it (the customer page reads its stage from here). */
export async function jobFor(env: Env, surveyId: string): Promise<OfficeRow | null> {
  const [row, reportObjs, office] = await Promise.all([readIndex(env, surveyId), listAll(env, `report-index/${surveyId}/`), getOfficeStatus(env, surveyId)])
  if (!row) return null
  return officeRow(env, row, reportsBySurvey(reportObjs).get(surveyId) ?? [], office)
}
