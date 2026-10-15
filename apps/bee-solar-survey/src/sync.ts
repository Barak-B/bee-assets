/**
 * Backup of surveys, photos and quote versions to our own Pages project
 * (R2), plus restore onto a new phone. Offline-first: every change stays in
 * IndexedDB; a survey is "pending" until the server holds the same content,
 * and the queue drains on app start, when the network comes back, after a
 * save, or from the "סנכרן" button.
 *
 * Order per survey: photos → survey record → quote versions, so the server
 * never lists a photo it does not have, and a quote never arrives before its
 * survey. Nothing here sends anything to a customer (Law #2).
 */
import { canonicalJson, sha256Hex, type QuoteVersion } from '@bee/quote-core'
import {
  getProject,
  getPublishSettings,
  getSyncState,
  importBackup,
  listPhotos,
  listProjects,
  listQuotes,
  saveSyncState,
  type PublishSettings,
  type StoredPhoto,
  type StoredQuote,
  type SyncState,
} from './db'
import { buildHiveExportBundle } from './hive'
import { assessCompleteness, sha256OfDataUrl } from './schema'
import { settingsProblem } from './publish'
import type { SiteSurveyProject } from './types'

export type SyncStatus = 'off' | 'pending' | 'synced' | 'error'

export class SyncError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.offline = offline
  }
}

export interface PhotoMeta {
  id: string
  field: string
  key: string
  sha256: string
  mimeType: string
  annotated: boolean
  createdAt: string
}

export interface SurveyRecordOut {
  schema: 'bee.survey-record/1'
  project: SiteSurveyProject
  photos: PhotoMeta[]
  hive: ReturnType<typeof buildHiveExportBundle>
  completeness: { score: number; readyForWave54: boolean }
  contentHash: string
  client: { app: 'bee-solar-survey'; sentAt: string }
}

export const photoKey = (id: string, sha256: string) => `${id}.${sha256.slice(0, 12)}`

async function photoMeta(p: StoredPhoto): Promise<PhotoMeta> {
  const sha = p.sha256 && /^[0-9a-f]{64}$/.test(p.sha256) ? p.sha256 : await sha256OfDataUrl(p.dataUrl)
  return { id: p.id, field: p.field, key: photoKey(p.id, sha), sha256: sha, mimeType: p.mimeType || 'image/jpeg', annotated: !!p.annotated, createdAt: p.createdAt }
}

/** Content hash ignores updatedAt (autosave touches it) and the hive job ids/timestamps. */
export async function surveyContentHash(project: SiteSurveyProject, photos: PhotoMeta[]): Promise<string> {
  const { updatedAt: _u, ...rest } = project
  return sha256Hex(canonicalJson({ project: rest, photos: photos.map(({ key, field, annotated }) => ({ key, field, annotated })) }))
}

export async function buildSurveyRecord(project: SiteSurveyProject, photos: StoredPhoto[], now = new Date()): Promise<SurveyRecordOut> {
  const meta = await Promise.all(photos.map(photoMeta))
  const c = assessCompleteness(project, photos)
  return {
    schema: 'bee.survey-record/1',
    project,
    photos: meta,
    hive: buildHiveExportBundle(project, photos),
    completeness: { score: c.score, readyForWave54: c.readyForWave54 },
    contentHash: await surveyContentHash(project, meta),
    client: { app: 'bee-solar-survey', sentAt: now.toISOString() },
  }
}

// ── HTTP ───────────────────────────────────────────────────────────────

async function call(s: PublishSettings, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${s.baseUrl.replace(/\/+$/, '')}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${s.key}` } })
  } catch {
    throw new SyncError('אין חיבור לשרת — הגיבוי ימתין לחיבור', true)
  }
  if (!res.ok) {
    let msg = `השרת החזיר ${res.status}`
    try {
      const j = (await res.json()) as { message_he?: string; error?: string }
      msg = j.message_he ?? j.error ?? msg
    } catch {
      /* not json */
    }
    throw new SyncError(res.status === 401 ? 'מפתח הגיבוי שגוי' : msg)
  }
  return res
}

const enc = encodeURIComponent

// ── Status ─────────────────────────────────────────────────────────────

export function statusOf(project: SiteSurveyProject, state: SyncState | null, configured: boolean): SyncStatus {
  if (!configured) return 'off'
  if (!state) return 'pending'
  if (state.error && !state.offline) return 'error'
  if (state.projectUpdatedAt !== project.updatedAt || state.dirty) return 'pending'
  return 'synced'
}

export const STATUS_LABEL: Record<SyncStatus, string> = {
  off: '',
  pending: 'ממתין לגיבוי',
  synced: 'מגובה ✓',
  error: 'שגיאת גיבוי',
}

// ── Push ───────────────────────────────────────────────────────────────

export interface SyncReport {
  synced: number
  skipped: number
  failed: number
  offline: boolean
  photos: number
  quotes: number
  errors: string[]
}

async function syncOne(s: PublishSettings, project: SiteSurveyProject, report: SyncReport): Promise<void> {
  const state = await getSyncState(project.id)
  const photos = await listPhotos(project.id)
  const quotes = await listQuotes(project.id)
  const record = await buildSurveyRecord(project, photos)
  const done = new Set(state?.photoKeys ?? [])
  const doneQuotes = new Set(state?.quoteVersions ?? [])
  const quotesLeft = quotes.filter((q) => !doneQuotes.has(q.version_no))
  if (state && !state.error && !state.dirty && state.hash === record.contentHash && record.photos.every((p) => done.has(p.key)) && quotesLeft.length === 0) {
    if (state.projectUpdatedAt !== project.updatedAt) await saveSyncState(project.id, { ...state, projectUpdatedAt: project.updatedAt })
    report.skipped++
    return
  }

  const base = `/api/surveys/${enc(project.id)}`
  const upload = async (key: string) => {
    const p = photos.find((x) => photoKey(x.id, record.photos.find((m) => m.id === x.id)!.sha256) === key)
    if (!p) return
    const blob = await (await fetch(p.dataUrl)).blob()
    await call(s, `${base}/photos/${enc(key)}`, { method: 'PUT', headers: { 'content-type': blob.type || p.mimeType || 'image/jpeg' }, body: blob })
    done.add(key)
    report.photos++
  }
  try {
    for (const m of record.photos) if (!done.has(m.key)) await upload(m.key)
    const res = await call(s, base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) })
    const body = (await res.json()) as { missing_photos?: string[] }
    for (const key of body.missing_photos ?? []) await upload(key)
    for (const q of quotesLeft.sort((a, b) => a.version_no - b.version_no)) {
      await call(s, `${base}/quotes/${q.version_no}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q.quote) })
      doneQuotes.add(q.version_no)
      report.quotes++
    }
    await saveSyncState(project.id, {
      hash: record.contentHash,
      projectUpdatedAt: project.updatedAt,
      syncedAt: new Date().toISOString(),
      photoKeys: record.photos.map((p) => p.key),
      quoteVersions: [...doneQuotes].sort((a, b) => a - b),
      error: null,
      offline: false,
      dirty: false,
    })
    report.synced++
  } catch (err) {
    const e = err instanceof SyncError ? err : new SyncError(String(err))
    await saveSyncState(project.id, {
      hash: state?.hash ?? '',
      projectUpdatedAt: state?.projectUpdatedAt ?? '',
      syncedAt: state?.syncedAt ?? null,
      photoKeys: [...done],
      quoteVersions: [...doneQuotes],
      error: e.message,
      offline: e.offline,
      dirty: true,
    })
    if (e.offline) report.offline = true
    else report.failed++
    report.errors.push(`${project.projectName || project.id}: ${e.message}`)
    if (e.offline) throw e
  }
}

let running: Promise<SyncReport> | null = null

/** Push every pending survey. One run at a time; a second call joins the first. */
export function syncAll(only?: string[]): Promise<SyncReport> {
  if (running) return running
  running = (async () => {
    const report: SyncReport = { synced: 0, skipped: 0, failed: 0, offline: false, photos: 0, quotes: 0, errors: [] }
    const s = await getPublishSettings()
    const problem = settingsProblem(s)
    if (problem || !s) throw new SyncError(problem ?? 'לא הוגדר שרת')
    const projects = only ? (await Promise.all(only.map((id) => getProject(id)))).filter((p): p is SiteSurveyProject => !!p) : await listProjects()
    for (const p of projects) {
      if (!p.projectName.trim()) continue
      try {
        await syncOne(s, p, report)
      } catch (err) {
        if (err instanceof SyncError && err.offline) break // no network: stop, retry later
        throw err
      }
    }
    return report
  })().finally(() => {
    running = null
  })
  return running
}

/** Mark a survey as changed (e.g. a new quote version) so the next run sends it. */
export async function markDirty(projectId: string): Promise<void> {
  const st = await getSyncState(projectId)
  if (st) await saveSyncState(projectId, { ...st, dirty: true })
}

export async function isSyncConfigured(): Promise<boolean> {
  return settingsProblem(await getPublishSettings()) === null
}

// ── Restore ────────────────────────────────────────────────────────────

interface RemoteRow {
  id: string
  projectName: string
  updatedAt: string
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export interface RestoreReport {
  restored: number
  skipped: number
  photos: number
  quotes: number
}

/**
 * Bring surveys that are on the server but not on this device. Surveys that
 * already exist locally are left as they are — the device copy wins and is
 * pushed on the next sync — so a restore can never overwrite field work.
 */
export async function restoreFromServer(): Promise<RestoreReport> {
  const s = await getPublishSettings()
  const problem = settingsProblem(s)
  if (problem || !s) throw new SyncError(problem ?? 'לא הוגדר שרת')
  const res = await call(s, '/api/surveys')
  const { surveys } = (await res.json()) as { surveys: RemoteRow[] }
  const local = new Set((await listProjects()).map((p) => p.id))
  const out: RestoreReport = { restored: 0, skipped: 0, photos: 0, quotes: 0 }
  for (const row of surveys) {
    if (local.has(row.id)) {
      out.skipped++
      continue
    }
    const r = await call(s, `/api/surveys/${enc(row.id)}`)
    const { survey, quotes } = (await r.json()) as { survey: SurveyRecordOut; quotes: QuoteVersion[] }
    const photos: StoredPhoto[] = []
    for (const m of survey.photos) {
      const pr = await call(s, `/api/surveys/${enc(row.id)}/photos/${enc(m.key)}`)
      const blob = new Blob([await pr.arrayBuffer()], { type: m.mimeType })
      photos.push({ id: m.id, projectId: row.id, field: m.field as StoredPhoto['field'], dataUrl: await blobToDataUrl(blob), mimeType: m.mimeType, sha256: m.sha256, createdAt: m.createdAt, annotated: m.annotated })
    }
    const stored: StoredQuote[] = quotes.map((q) => ({
      id: `${row.id}:${q.version_no}`,
      projectId: row.id,
      version_no: q.version_no,
      quote_number: q.quote_number,
      created_at: q.created_at,
      snapshot_hash: q.snapshot_hash,
      quote: q,
    }))
    await importBackup({ projects: [survey.project], photos, quotes: stored })
    await saveSyncState(row.id, {
      hash: survey.contentHash,
      projectUpdatedAt: survey.project.updatedAt,
      syncedAt: new Date().toISOString(),
      photoKeys: survey.photos.map((p) => p.key),
      quoteVersions: stored.map((q) => q.version_no),
      error: null,
      offline: false,
      dirty: false,
    })
    out.restored++
    out.photos += photos.length
    out.quotes += stored.length
  }
  return out
}
