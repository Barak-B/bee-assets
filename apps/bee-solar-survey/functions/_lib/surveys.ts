/**
 * Survey backup + hive intake on our own Pages project (step 4 of the plan,
 * without waiting for bee-live). Layout in R2:
 *
 *   surveys/<id>/survey.json                 latest record from the field app
 *   surveys/<id>/history/<receivedAt>.json   every distinct version received
 *   surveys/<id>/photos/<photoId>.<sha12>    photo bytes (content-addressed)
 *   surveys/<id>/quotes/v<N>.json            quote versions (immutable)
 *   surveys/<id>/reports/<reportId>.json     field reports (a final one never changes)
 *   survey-index/<id>                        tiny object; customMetadata = list row
 *   report-index/<reportId>                  tiny object; customMetadata = report row (hive feed)
 */
import type { Env } from './env'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const PHOTO_KEY_RE = /^[0-9a-f-]{36}\.[0-9a-f]{12}$/i

export interface SurveyPhotoMeta {
  id: string
  field: string
  key: string // `${id}.${sha256.slice(0, 12)}`
  sha256: string
  mimeType: string
  annotated?: boolean
  createdAt?: string
}

export interface SurveyRecord {
  schema: 'bee.survey-record/1'
  project: Record<string, unknown> & { id: string; projectName?: string; address?: string; surveyor?: string; updatedAt?: string }
  photos: SurveyPhotoMeta[]
  /** Hive export bundle as built by the app (collect / edit / dispatch jobs). */
  hive?: { jobs?: unknown[] } & Record<string, unknown>
  completeness?: { score?: number; readyForWave54?: boolean }
  contentHash: string
  client?: Record<string, unknown>
}

export interface SurveyIndexRow {
  id: string
  projectName: string
  address: string
  surveyor: string
  updatedAt: string
  receivedAt: string
  readyForWave54: boolean
  score: number
  photoCount: number
  contentHash: string
  quoteVersions: number
}

const k = {
  report: (id: string, rid: string) => `surveys/${id}/reports/${rid}.json`,
  reportIndex: (rid: string) => `report-index/${rid}`,
  survey: (id: string) => `surveys/${id}/survey.json`,
  history: (id: string, at: string) => `surveys/${id}/history/${at}.json`,
  photo: (id: string, key: string) => `surveys/${id}/photos/${key}`,
  quote: (id: string, v: number) => `surveys/${id}/quotes/v${v}.json`,
  index: (id: string) => `survey-index/${id}`,
}

export function isSurveyRecord(x: unknown, id: string): x is SurveyRecord {
  if (!x || typeof x !== 'object') return false
  const o = x as Partial<SurveyRecord>
  return (
    o.schema === 'bee.survey-record/1' &&
    !!o.project &&
    typeof o.project === 'object' &&
    o.project.id === id &&
    Array.isArray(o.photos) &&
    o.photos.every((p) => p && typeof p.key === 'string' && PHOTO_KEY_RE.test(p.key)) &&
    typeof o.contentHash === 'string'
  )
}

function str(v: unknown, max = 200): string {
  return String(v ?? '').slice(0, max)
}

export async function getSurvey(env: Env, id: string): Promise<SurveyRecord | null> {
  const obj = await env.QUOTES.get(k.survey(id))
  if (!obj) return null
  try {
    return JSON.parse(await obj.text()) as SurveyRecord
  } catch {
    return null
  }
}

export async function countQuotes(env: Env, id: string): Promise<number> {
  const res = await env.QUOTES.list({ prefix: `surveys/${id}/quotes/` })
  return res.objects.length
}

export async function putSurvey(env: Env, id: string, rec: SurveyRecord, now = new Date()): Promise<{ changed: boolean; missingPhotos: string[]; row: SurveyIndexRow }> {
  const prev = await getSurvey(env, id)
  const changed = !prev || prev.contentHash !== rec.contentHash
  // receivedAt moves only when the content does, so the hive feed (?since=) never repeats a survey.
  const prevRow = changed ? null : await readIndex(env, id)
  const receivedAt = prevRow?.receivedAt || now.toISOString()
  const body = JSON.stringify(rec)
  if (changed) {
    await env.QUOTES.put(k.survey(id), body, { httpMetadata: { contentType: 'application/json' } })
    await env.QUOTES.put(k.history(id, receivedAt.replace(/[:.]/g, '-')), body, { httpMetadata: { contentType: 'application/json' } })
  }
  const missingPhotos: string[] = []
  for (const p of rec.photos) {
    if (!(await env.QUOTES.head(k.photo(id, p.key)))) missingPhotos.push(p.key)
  }
  const row: SurveyIndexRow = {
    id,
    projectName: str(rec.project.projectName),
    address: str(rec.project.address),
    surveyor: str(rec.project.surveyor, 80),
    updatedAt: str(rec.project.updatedAt, 40),
    receivedAt,
    readyForWave54: !!rec.completeness?.readyForWave54,
    score: Number(rec.completeness?.score ?? 0),
    photoCount: rec.photos.length,
    contentHash: rec.contentHash,
    quoteVersions: await countQuotes(env, id),
  }
  await writeIndex(env, row)
  return { changed, missingPhotos, row }
}

/**
 * R2 custom metadata travels like HTTP headers; values are URL-encoded so
 * Hebrew names never depend on non-ASCII header support.
 */
export function encodeMeta(o: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).map(([key, v]) => [key, encodeURIComponent(String(v ?? ''))]))
}

export function decodeMeta(m: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(m).map(([key, v]) => {
      try {
        return [key, decodeURIComponent(v)]
      } catch {
        return [key, v]
      }
    }),
  )
}

async function writeIndex(env: Env, row: SurveyIndexRow): Promise<void> {
  await env.QUOTES.put(k.index(row.id), '', { customMetadata: encodeMeta({ ...row }) })
}

async function readIndex(env: Env, id: string): Promise<SurveyIndexRow | null> {
  const obj = await env.QUOTES.get(k.index(id))
  return obj?.customMetadata ? rowFromMeta(obj.customMetadata) : null
}

function rowFromMeta(raw: Record<string, string>): SurveyIndexRow {
  const m = decodeMeta(raw)
  return {
    id: m.id ?? '',
    projectName: m.projectName ?? '',
    address: m.address ?? '',
    surveyor: m.surveyor ?? '',
    updatedAt: m.updatedAt ?? '',
    receivedAt: m.receivedAt ?? '',
    readyForWave54: m.readyForWave54 === 'true',
    score: Number(m.score ?? 0),
    photoCount: Number(m.photoCount ?? 0),
    contentHash: m.contentHash ?? '',
    quoteVersions: Number(m.quoteVersions ?? 0),
  }
}

export async function listSurveys(env: Env, since?: string): Promise<SurveyIndexRow[]> {
  const rows: SurveyIndexRow[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix: 'survey-index/', cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) if (o.customMetadata) rows.push(rowFromMeta(o.customMetadata))
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return rows.filter((r) => !since || r.receivedAt > since).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

export async function putPhoto(env: Env, id: string, key: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  await env.QUOTES.put(k.photo(id, key), bytes, { httpMetadata: { contentType } })
}

export async function getPhoto(env: Env, id: string, key: string): Promise<ArrayBuffer | null> {
  const obj = await env.QUOTES.get(k.photo(id, key))
  return obj ? obj.arrayBuffer() : null
}

export type PutQuoteResult = 'created' | 'unchanged' | 'conflict'

/** Quote versions are immutable: the same version number with different content is a conflict. */
export async function putQuoteVersion(env: Env, id: string, version: number, quote: { snapshot_hash?: unknown }): Promise<PutQuoteResult> {
  const existing = await env.QUOTES.get(k.quote(id, version))
  if (existing) {
    try {
      const prev = JSON.parse(await existing.text()) as { snapshot_hash?: unknown }
      return prev.snapshot_hash === quote.snapshot_hash ? 'unchanged' : 'conflict'
    } catch {
      return 'conflict'
    }
  }
  await env.QUOTES.put(k.quote(id, version), JSON.stringify(quote), { httpMetadata: { contentType: 'application/json' } })
  const row = await readIndex(env, id)
  if (row) await writeIndex(env, { ...row, quoteVersions: await countQuotes(env, id) })
  return 'created'
}

export async function listQuoteVersions(env: Env, id: string): Promise<unknown[]> {
  const res = await env.QUOTES.list({ prefix: `surveys/${id}/quotes/` })
  const out: unknown[] = []
  for (const o of res.objects) {
    const obj = await env.QUOTES.get(o.key)
    if (obj) out.push(JSON.parse(await obj.text()))
  }
  return out
}

// ── Field reports ──────────────────────────────────────────────────────

export const REPORT_TEMPLATES = new Set(['daily_report', 'installation_checklist', 'inspection_62446', 'defects', 'handover'])

/** What the app sends: the report without photo bytes (photos go through the photo route by key). */
export interface ReportWire {
  id: string
  projectId: string
  templateKey: string
  revision: number
  status: 'draft' | 'final'
  updatedAt: string
  finalizedAt: string | null
  contentHash: string | null
  photos: { id: string; key: string; sha256: string; mimeType: string; sectionKey: string; itemCode?: string; createdAt: string }[]
  title_he?: string
  outcome?: { tone: string; label_he: string } | null
  [extra: string]: unknown
}

export interface ReportIndexRow {
  surveyId: string
  reportId: string
  templateKey: string
  title_he: string
  revision: number
  status: string
  updatedAt: string
  finalizedAt: string
  contentHash: string
  outcomeTone: string
  outcomeLabel: string
  /** Server time the final version first arrived — the hive feed's clock. */
  receivedFinalAt: string
}

export function isReportWire(x: unknown, id: string, rid: string): x is ReportWire {
  if (!x || typeof x !== 'object') return false
  const o = x as Partial<ReportWire>
  return (
    o.id === rid &&
    o.projectId === id &&
    typeof o.templateKey === 'string' &&
    REPORT_TEMPLATES.has(o.templateKey) &&
    (o.status === 'draft' || o.status === 'final') &&
    Number.isInteger(o.revision) &&
    Array.isArray(o.photos) &&
    o.photos.every((p) => p && typeof p.key === 'string' && PHOTO_KEY_RE.test(p.key)) &&
    (o.status === 'draft' || (typeof o.contentHash === 'string' && /^[0-9a-f]{64}$/.test(o.contentHash)))
  )
}

export type PutReportResult = { result: 'stored' | 'unchanged' | 'conflict'; missingPhotos: string[] }

/** Drafts may be replaced; a final report is immutable (same hash → unchanged, other content → conflict). */
export async function putReport(env: Env, id: string, rec: ReportWire, now = new Date()): Promise<PutReportResult> {
  const prevObj = await env.QUOTES.get(k.report(id, rec.id))
  let prev: ReportWire | null = null
  if (prevObj) {
    try {
      prev = JSON.parse(await prevObj.text()) as ReportWire
    } catch {
      prev = null
    }
  }
  const missingPhotos: string[] = []
  for (const p of rec.photos) if (!(await env.QUOTES.head(k.photo(id, p.key)))) missingPhotos.push(p.key)
  if (prev?.status === 'final') return { result: prev.contentHash === rec.contentHash ? 'unchanged' : 'conflict', missingPhotos }
  await env.QUOTES.put(k.report(id, rec.id), JSON.stringify(rec), { httpMetadata: { contentType: 'application/json' } })
  const row: ReportIndexRow = {
    surveyId: id,
    reportId: rec.id,
    templateKey: rec.templateKey,
    title_he: String(rec.title_he ?? '').slice(0, 80),
    revision: rec.revision,
    status: rec.status,
    updatedAt: String(rec.updatedAt ?? '').slice(0, 40),
    finalizedAt: String(rec.finalizedAt ?? ''),
    contentHash: String(rec.contentHash ?? ''),
    outcomeTone: String(rec.outcome?.tone ?? '').slice(0, 10),
    outcomeLabel: String(rec.outcome?.label_he ?? '').slice(0, 80),
    receivedFinalAt: rec.status === 'final' ? now.toISOString() : '',
  }
  await env.QUOTES.put(k.reportIndex(rec.id), '', { customMetadata: encodeMeta({ ...row }) })
  return { result: 'stored', missingPhotos }
}

export async function listReports(env: Env, id: string): Promise<ReportWire[]> {
  const res = await env.QUOTES.list({ prefix: `surveys/${id}/reports/` })
  const out: ReportWire[] = []
  for (const o of res.objects) {
    const obj = await env.QUOTES.get(o.key)
    if (!obj) continue
    try {
      out.push(JSON.parse(await obj.text()) as ReportWire)
    } catch {
      /* skip a damaged object */
    }
  }
  return out
}

/** Final reports that arrived after `since` (server time), newest first. */
export async function listFinalReports(env: Env, since?: string): Promise<ReportIndexRow[]> {
  const rows: ReportIndexRow[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix: 'report-index/', cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) {
      if (!o.customMetadata) continue
      const m = decodeMeta(o.customMetadata)
      if (m.status !== 'final' || !m.receivedFinalAt || (since && m.receivedFinalAt <= since)) continue
      rows.push({ ...(m as unknown as ReportIndexRow), revision: Number(m.revision ?? 0) })
    }
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return rows.sort((a, b) => b.receivedFinalAt.localeCompare(a.receivedFinalAt))
}
