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
  updateSyncState,
  listPhotos,
  listProjects,
  listQuotes,
  listReports,
  saveOfficeStatus,
  saveSyncState,
  type LocalOfficeStatus,
  type PublishSettings,
  type StoredPhoto,
  type StoredQuote,
  type SyncState,
} from './db'
import { buildHiveExportBundle } from './hive'
import { template } from './reports/model'
import type { ReportInstance, ReportPhoto } from './reports/types'
import { assessCompleteness, sha256OfDataUrl } from './schema'
import { settingsProblem } from './publish'
import type { SiteSurveyProject } from './types'

export type SyncStatus = 'off' | 'pending' | 'synced' | 'error'

export class SyncError extends Error {
  readonly offline: boolean
  /** HTTP status when the server answered. */
  readonly status: number | null
  constructor(message: string, offline = false, status: number | null = null) {
    super(message)
    this.offline = offline
    this.status = status
  }
  /** The server refused this item for good: retrying the same content cannot succeed. */
  get permanent(): boolean {
    return this.status !== null && [400, 409, 410, 413, 415, 422].includes(this.status)
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

/** A report as sent to the server: photo bytes go separately, by key. */
export type ReportWire = Omit<ReportInstance, 'photos'> & {
  photos: (Omit<ReportPhoto, 'dataUrl'> & { key: string })[]
  title_he: string
  outcome: { tone: string; label_he: string } | null
}

export const reportTag = (r: ReportInstance) => `${r.status}:${r.updatedAt}`

export function toReportWire(r: ReportInstance): ReportWire {
  const t = template(r)
  return {
    ...r,
    photos: r.photos.map(({ dataUrl: _d, ...p }) => ({ ...p, key: photoKey(p.id, p.sha256) })),
    title_he: t.title_he,
    outcome: t.outcome?.(r) ?? null,
  }
}

async function photoMeta(p: StoredPhoto): Promise<PhotoMeta> {
  // Always from the bytes: the server checks the key against the upload, and a
  // photo annotated by an older version may still carry the pre-drawing hash.
  const sha = await sha256OfDataUrl(p.dataUrl)
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
    throw new SyncError(res.status === 401 ? 'מפתח הגיבוי שגוי' : msg, false, res.status)
  }
  return res
}

const enc = encodeURIComponent

// ── Status ─────────────────────────────────────────────────────────────

export function statusOf(project: SiteSurveyProject, state: SyncState | null, configured: boolean): SyncStatus {
  if (!configured) return 'off'
  if (!state) return 'pending'
  if (state.error && !state.offline) return 'error'
  if (state.rejected && Object.keys(state.rejected).length) return 'error'
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
  reports: number
  errors: string[]
}

async function syncOne(s: PublishSettings, project: SiteSurveyProject, report: SyncReport, deep: boolean): Promise<void> {
  const startedAt = new Date().toISOString()
  const state = await getSyncState(project.id)
  // Cheap path for background runs: every change marks the survey (updatedAt or
  // markDirty), so an unmarked survey that synced cleanly needs no photo reads.
  if (!deep && state && state.hash && !state.error && !state.dirty && state.projectUpdatedAt === project.updatedAt) {
    report.skipped++
    return
  }
  const photos = await listPhotos(project.id)
  const quotes = await listQuotes(project.id)
  const record = await buildSurveyRecord(project, photos)
  const done = new Set(state?.photoKeys ?? [])
  const doneQuotes = new Set(state?.quoteVersions ?? [])
  const quotesLeft = quotes.filter((q) => !doneQuotes.has(q.version_no))
  const reports = await listReports(project.id)
  const reportRevs: Record<string, string> = { ...(state?.reportRevs ?? {}) }
  const reportsLeft = reports.filter((r) => reportRevs[r.id] !== reportTag(r))
  const rejected: Record<string, string> = { ...(state?.rejected ?? {}) }
  const surveyTag = `survey:${record.contentHash}`
  const label = project.projectName || project.id
  const nothingToSend =
    state && !state.error && state.hash === record.contentHash && record.photos.every((p) => done.has(p.key)) && quotesLeft.length === 0 && reportsLeft.length === 0
  if (nothingToSend) {
    await updateSyncState(project.id, (prev) =>
      prev ? { ...prev, projectUpdatedAt: project.updatedAt, dirty: !!prev.dirtyAt && prev.dirtyAt >= startedAt } : null,
    )
    report.skipped++
    return
  }
  if (rejected[surveyTag]) {
    // Refused before with this exact content; wait for the survey to change.
    report.failed++
    report.errors.push(`${label}: ${rejected[surveyTag]}`)
    return
  }

  /** Run one item; a permanent refusal is recorded against its tag and the run moves on. */
  const attempt = async (tag: string, fn: () => Promise<void>): Promise<boolean> => {
    if (rejected[tag]) return false
    try {
      await fn()
      return true
    } catch (err) {
      if (err instanceof SyncError && err.permanent) {
        rejected[tag] = err.message
        return false
      }
      throw err
    }
  }

  const base = `/api/surveys/${enc(project.id)}`
  const putBlob = async (key: string, dataUrl: string, mimeType: string) => {
    const blob = await (await fetch(dataUrl)).blob()
    await call(s, `${base}/photos/${enc(key)}`, { method: 'PUT', headers: { 'content-type': blob.type || mimeType || 'image/jpeg' }, body: blob })
    done.add(key)
    report.photos++
  }
  const upload = (key: string) =>
    attempt(`photo:${key}`, async () => {
      const i = record.photos.findIndex((m) => m.key === key)
      const p = photos.find((x) => x.id === record.photos[i]?.id)
      if (p) await putBlob(key, p.dataUrl, p.mimeType)
    })
  const liveTags = new Set<string>([surveyTag])
  let surveyOk = false
  try {
    let uploaded = false
    for (const m of record.photos) {
      liveTags.add(`photo:${m.key}`)
      if (!done.has(m.key) && (await upload(m.key))) uploaded = true
    }
    if (uploaded || !state || state.hash !== record.contentHash) {
      surveyOk = await attempt(surveyTag, async () => {
        const res = await call(s, base, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) })
        const body = (await res.json()) as { missing_photos?: string[]; office?: LocalOfficeStatus | null }
        if (body.office !== undefined) await saveOfficeStatus(project.id, body.office)
        for (const key of body.missing_photos ?? []) await upload(key)
      })
    } else surveyOk = true
    if (surveyOk) {
      for (const q of quotesLeft.sort((a, b) => a.version_no - b.version_no)) {
        liveTags.add(`quote:${q.version_no}`)
        const ok = await attempt(`quote:${q.version_no}`, async () => {
          await call(s, `${base}/quotes/${q.version_no}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q.quote) })
        })
        if (ok) {
          doneQuotes.add(q.version_no)
          report.quotes++
        }
      }
      // Field reports: photos first (same photo route, by key), then the report. Oldest first.
      for (const r of reportsLeft.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        const wire = toReportWire(r)
        const tag = `report:${r.id}:${reportTag(r)}`
        liveTags.add(tag)
        const putPhoto = (key: string) =>
          attempt(`photo:${key}`, async () => {
            const p = r.photos.find((x) => photoKey(x.id, x.sha256) === key)
            if (p) await putBlob(key, p.dataUrl, p.mimeType)
          })
        for (const p of wire.photos) {
          liveTags.add(`photo:${p.key}`)
          if (!done.has(p.key)) await putPhoto(p.key)
        }
        const ok = await attempt(tag, async () => {
          const rr = await call(s, `${base}/reports/${enc(r.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(wire) })
          for (const key of ((await rr.json()) as { missing_photos?: string[] }).missing_photos ?? []) await putPhoto(key)
        })
        if (ok) {
          reportRevs[r.id] = reportTag(r)
          report.reports++
        }
      }
    }
    // Forget refusals of content that no longer exists (the item was edited or removed).
    for (const tag of Object.keys(rejected)) if (!liveTags.has(tag)) delete rejected[tag]
    const refusals = Object.values(rejected)
    await updateSyncState(project.id, (prev) => ({
      hash: surveyOk ? record.contentHash : (state?.hash ?? ''),
      projectUpdatedAt: surveyOk ? project.updatedAt : (state?.projectUpdatedAt ?? ''),
      syncedAt: new Date().toISOString(),
      photoKeys: [...done],
      quoteVersions: [...doneQuotes].sort((a, b) => a - b),
      error: refusals[0] ?? null,
      offline: false,
      // Something marked while this run was in flight is not covered by it.
      dirty: !!prev?.dirtyAt && prev.dirtyAt >= startedAt,
      dirtyAt: prev?.dirtyAt,
      reportRevs,
      rejected,
    }))
    if (refusals.length) {
      report.failed++
      report.errors.push(`${label}: ${refusals[0]}`)
    } else report.synced++
  } catch (err) {
    const e = err instanceof SyncError ? err : new SyncError(String(err))
    await updateSyncState(project.id, (prev) => ({
      hash: state?.hash ?? '',
      projectUpdatedAt: state?.projectUpdatedAt ?? '',
      syncedAt: state?.syncedAt ?? null,
      photoKeys: [...done],
      quoteVersions: [...doneQuotes],
      error: e.message,
      offline: e.offline,
      dirty: true,
      dirtyAt: prev?.dirtyAt,
      reportRevs,
      rejected,
    }))
    if (e.offline) report.offline = true
    else report.failed++
    report.errors.push(`${label}: ${e.message}`)
    if (e.offline || e.status === 401) throw e
  }
}

/** Office statuses (on hold / lost / closed) set since the phone last sent each survey: one list call, at most every 10 minutes. */
let officePulledAt = 0
const OFFICE_PULL_MS = 10 * 60_000

async function pullOfficeStatuses(s: PublishSettings, force: boolean, now = Date.now()): Promise<void> {
  if (!force && now - officePulledAt < OFFICE_PULL_MS) return
  const res = await call(s, '/api/surveys')
  const { surveys } = (await res.json()) as { surveys: { id: string; office?: LocalOfficeStatus | null }[] }
  const local = new Set((await listProjects()).map((p) => p.id))
  for (const row of surveys) if (local.has(row.id) && row.office !== undefined) await saveOfficeStatus(row.id, row.office)
  officePulledAt = now
}

let running: Promise<SyncReport> | null = null
/** Requests that arrived while a run was in flight: run again for them afterwards. */
let queued: { ids: Set<string> | 'all'; deep: boolean } | null = null

function enqueue(only: string[] | undefined, deep: boolean) {
  const ids = !only || queued?.ids === 'all' ? 'all' : new Set([...(queued?.ids ?? []), ...only])
  queued = { ids, deep: deep || !!queued?.deep }
}

/**
 * Push pending surveys (`only` limits the run to some). One run at a time; a
 * call made while one is running joins it and queues a follow-up run, so a
 * change made mid-run is still sent. `deep` re-reads every survey's photos and
 * reports instead of trusting the change markers (the manual "סנכרן" button).
 */
export function syncAll(only?: string[], opts: { deep?: boolean } = {}): Promise<SyncReport> {
  if (running) {
    enqueue(only, !!opts.deep)
    return running
  }
  running = (async () => {
    const report: SyncReport = { synced: 0, skipped: 0, failed: 0, offline: false, photos: 0, quotes: 0, reports: 0, errors: [] }
    const s = await getPublishSettings()
    const problem = settingsProblem(s)
    if (problem || !s) throw new SyncError(problem ?? 'לא הוגדר שרת')
    const projects = only ? (await Promise.all(only.map((id) => getProject(id)))).filter((p): p is SiteSurveyProject => !!p) : await listProjects()
    for (const p of projects) {
      if (!p.projectName.trim()) continue
      try {
        await syncOne(s, p, report, !!opts.deep)
      } catch (err) {
        if (err instanceof SyncError && (err.offline || err.status === 401)) break // no network / wrong key: stop, retry later
        throw err
      }
    }
    if (!report.offline) await pullOfficeStatuses(s, !!opts.deep).catch(() => undefined)
    return report
  })().finally(() => {
    running = null
    const next = queued
    queued = null
    if (next) void syncAll(next.ids === 'all' ? undefined : [...next.ids], { deep: next.deep }).catch(() => undefined)
  })
  return running
}

/** Mark a survey as changed (e.g. a new quote version) so the next run sends it. */
export async function markDirty(projectId: string): Promise<void> {
  const now = new Date().toISOString()
  await updateSyncState(projectId, (prev) => (prev ? { ...prev, dirty: true, dirtyAt: now } : null))
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
  reports: number
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
  const out: RestoreReport = { restored: 0, skipped: 0, photos: 0, quotes: 0, reports: 0 }
  for (const row of surveys) {
    if (local.has(row.id)) {
      out.skipped++
      continue
    }
    const r = await call(s, `/api/surveys/${enc(row.id)}`)
    const { survey, quotes, reports: wires = [] } = (await r.json()) as { survey: SurveyRecordOut; quotes: QuoteVersion[]; reports?: ReportWire[] }
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
    const reports: ReportInstance[] = []
    for (const w of wires) {
      const rphotos: ReportPhoto[] = []
      for (const p of w.photos) {
        const pr = await call(s, `/api/surveys/${enc(row.id)}/photos/${enc(p.key)}`)
        const { key: _k, ...meta } = p
        rphotos.push({ ...meta, dataUrl: await blobToDataUrl(new Blob([await pr.arrayBuffer()], { type: p.mimeType })) })
      }
      const { title_he: _t, outcome: _o, ...rest } = w
      reports.push({ ...rest, photos: rphotos })
    }
    await importBackup({ projects: [survey.project], photos, quotes: stored, reports, pricing: null })
    await saveSyncState(row.id, {
      hash: survey.contentHash,
      projectUpdatedAt: survey.project.updatedAt,
      syncedAt: new Date().toISOString(),
      photoKeys: survey.photos.map((p) => p.key),
      quoteVersions: stored.map((q) => q.version_no),
      error: null,
      offline: false,
      dirty: false,
      reportRevs: Object.fromEntries(reports.map((x) => [x.id, reportTag(x)])),
    })
    out.restored++
    out.reports += reports.length
    out.photos += photos.length
    out.quotes += stored.length
  }
  return out
}
