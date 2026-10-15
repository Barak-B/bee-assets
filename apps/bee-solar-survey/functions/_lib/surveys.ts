/**
 * Survey backup + hive intake on our own Pages project (step 4 of the plan,
 * without waiting for bee-live). Layout in R2:
 *
 *   surveys/<id>/survey.json                 latest record from the field app
 *   surveys/<id>/history/<receivedAt>.json   every distinct version received
 *   surveys/<id>/photos/<photoId>.<sha12>    photo bytes (content-addressed)
 *   surveys/<id>/quotes/v<N>.json            quote versions (immutable)
 *   survey-index/<id>                        tiny object; customMetadata = list row
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

async function writeIndex(env: Env, row: SurveyIndexRow): Promise<void> {
  const meta: Record<string, string> = {}
  for (const [key, v] of Object.entries(row)) meta[key] = String(v)
  await env.QUOTES.put(k.index(row.id), '', { customMetadata: meta })
}

async function readIndex(env: Env, id: string): Promise<SurveyIndexRow | null> {
  const obj = await env.QUOTES.get(k.index(id))
  return obj?.customMetadata ? rowFromMeta(obj.customMetadata) : null
}

function rowFromMeta(m: Record<string, string>): SurveyIndexRow {
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
