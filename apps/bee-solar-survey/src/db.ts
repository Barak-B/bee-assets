import type { Catalog, PricingRules, QuoteVersion } from '@bee/quote-core'
import type { ReportInstance } from './reports/types'
import type { SiteSurveyProject, SurveyPhoto } from './types'

const DB_NAME = 'bee-solar-survey'
// v2: + quotes store (quote versions per project)
// v3: + reports store (field reports per project)
const DB_VER = 3

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' })
        store.createIndex('byProject', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('quotes')) {
        const store = db.createObjectStore('quotes', { keyPath: 'id' })
        store.createIndex('byProject', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains('reports')) {
        const store = db.createObjectStore('reports', { keyPath: 'id' })
        store.createIndex('byProject', 'projectId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export interface StoredPhoto extends SurveyPhoto {
  projectId: string
}

export async function listProjects(): Promise<SiteSurveyProject[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly')
    const req = tx.objectStore('projects').getAll()
    req.onsuccess = () => {
      const rows = (req.result as SiteSurveyProject[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getProject(id: string): Promise<SiteSurveyProject | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('projects', 'readonly').objectStore('projects').get(id)
    req.onsuccess = () => resolve(req.result as SiteSurveyProject | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function saveProject(project: SiteSurveyProject): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('projects', 'readwrite')
  tx.objectStore('projects').put({ ...project, updatedAt: new Date().toISOString() })
  await txDone(tx)
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(['projects', 'photos', 'quotes', 'reports'], 'readwrite')
  tx.objectStore('projects').delete(id)
  for (const storeName of ['photos', 'quotes', 'reports'] as const) {
    const req = tx.objectStore(storeName).index('byProject').getAllKeys(id)
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        for (const key of req.result) tx.objectStore(storeName).delete(key)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }
  await txDone(tx)
}

export async function listPhotos(projectId: string): Promise<StoredPhoto[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const idx = db.transaction('photos', 'readonly').objectStore('photos').index('byProject')
    const req = idx.getAll(projectId)
    req.onsuccess = () => resolve(req.result as StoredPhoto[])
    req.onerror = () => reject(req.error)
  })
}

export async function savePhoto(photo: StoredPhoto): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('photos', 'readwrite')
  tx.objectStore('photos').put(photo)
  await txDone(tx)
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('photos', 'readwrite')
  tx.objectStore('photos').delete(id)
  await txDone(tx)
}

export async function getSurveyors(): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get('surveyors')
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string[] } | undefined
      resolve(row?.value ?? [])
    }
    req.onerror = () => reject(req.error)
  })
}

export async function rememberSurveyor(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await getSurveyors()
  if (existing.includes(trimmed)) return
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'surveyors', value: [trimmed, ...existing].slice(0, 20) })
  await txDone(tx)
}

export async function exportBackup(): Promise<object> {
  const projects = await listProjects()
  const db = await openDB()
  const photos = await new Promise<StoredPhoto[]>((resolve, reject) => {
    const req = db.transaction('photos', 'readonly').objectStore('photos').getAll()
    req.onsuccess = () => resolve(req.result as StoredPhoto[])
    req.onerror = () => reject(req.error)
  })
  const quotes = await new Promise<StoredQuote[]>((resolve, reject) => {
    const req = db.transaction('quotes', 'readonly').objectStore('quotes').getAll()
    req.onsuccess = () => resolve(req.result as StoredQuote[])
    req.onerror = () => reject(req.error)
  })
  const reports = await new Promise<ReportInstance[]>((resolve, reject) => {
    const req = db.transaction('reports', 'readonly').objectStore('reports').getAll()
    req.onsuccess = () => resolve(req.result as ReportInstance[])
    req.onerror = () => reject(req.error)
  })
  const pricing = await getPricing()
  return {
    app: 'bee-solar-survey',
    version: 3,
    exportedAt: new Date().toISOString(),
    projects,
    photos,
    quotes,
    reports,
    pricing,
  }
}

export async function importBackup(data: {
  projects?: SiteSurveyProject[]
  photos?: StoredPhoto[]
  quotes?: StoredQuote[]
  reports?: ReportInstance[]
  pricing?: StoredPricing | null
}): Promise<number> {
  const projects = data.projects ?? []
  const photos = data.photos ?? []
  const quotes = data.quotes ?? []
  const reports = data.reports ?? []
  const db = await openDB()
  const tx = db.transaction(['projects', 'photos', 'quotes', 'reports'], 'readwrite')
  for (const p of projects) tx.objectStore('projects').put(p)
  for (const ph of photos) tx.objectStore('photos').put(ph)
  for (const q of quotes) tx.objectStore('quotes').put(q)
  for (const r of reports) tx.objectStore('reports').put(r)
  await txDone(tx)
  if (data.pricing?.catalog && data.pricing?.rules) await savePricing(data.pricing)
  return projects.length
}

// ── Pricing (catalog + rules edited in the app) ─────────────────────────

export interface StoredPricing {
  catalog: Catalog
  rules: PricingRules
  updatedAt?: string
}

export async function getPricing(): Promise<StoredPricing | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get('pricing')
    req.onsuccess = () => {
      const row = req.result as { key: string; value: StoredPricing } | undefined
      resolve(row?.value ?? null)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function savePricing(pricing: StoredPricing): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'pricing', value: { ...pricing, updatedAt: new Date().toISOString() } })
  await txDone(tx)
}

export async function clearPricing(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').delete('pricing')
  await txDone(tx)
}

// ── Quote versions ─────────────────────────────────────────────────────

export interface StoredQuote {
  /** `${projectId}:${version_no}` */
  id: string
  projectId: string
  version_no: number
  quote_number: string
  created_at: string
  snapshot_hash: string
  quote: QuoteVersion
}

export async function listQuotes(projectId: string): Promise<StoredQuote[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('quotes', 'readonly').objectStore('quotes').index('byProject').getAll(projectId)
    req.onsuccess = () => resolve((req.result as StoredQuote[]).sort((a, b) => b.version_no - a.version_no))
    req.onerror = () => reject(req.error)
  })
}

export async function saveQuote(projectId: string, quote: QuoteVersion): Promise<StoredQuote> {
  const row: StoredQuote = {
    id: `${projectId}:${quote.version_no}`,
    projectId,
    version_no: quote.version_no,
    quote_number: quote.quote_number,
    created_at: quote.created_at,
    snapshot_hash: quote.snapshot_hash,
    quote,
  }
  const db = await openDB()
  const tx = db.transaction('quotes', 'readwrite')
  // add(), not put(): a stored version is immutable (spec 12 principle 3).
  tx.objectStore('quotes').add(row)
  await txDone(tx)
  return row
}

// ── Online publishing (customer links under our domain) ────────────────

export interface PublishSettings {
  /** Public origin of the Pages project, e.g. https://app.barak-e.com */
  baseUrl: string
  /** Bearer key matching the server's PUBLISH_KEY secret. */
  key: string
}

export interface Publication {
  token: string
  url: string
  publishedAt: string
  revokedAt?: string | null
}

async function metaGet<T>(key: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get(key)
    req.onsuccess = () => resolve(((req.result as { value?: T } | undefined)?.value ?? null) as T | null)
    req.onerror = () => reject(req.error)
  })
}

async function metaPut(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key, value })
  await txDone(tx)
}

export const getPublishSettings = () => metaGet<PublishSettings>('publish')
export const savePublishSettings = (s: PublishSettings) => metaPut('publish', s)
export const getPublication = (quoteId: string) => metaGet<Publication>(`pub:${quoteId}`)
export const savePublication = (quoteId: string, p: Publication) => metaPut(`pub:${quoteId}`, p)

// ── Server backup state (per survey) ───────────────────────────────────

export interface SyncState {
  /** contentHash the server holds. */
  hash: string
  /** project.updatedAt at the last successful sync. */
  projectUpdatedAt: string
  syncedAt: string | null
  /** Photo keys (`<id>.<sha12>`) the server is known to hold. */
  photoKeys: string[]
  /** Quote version numbers the server holds. */
  quoteVersions: number[]
  error: string | null
  /** Last attempt failed only for lack of network (queued, not an error). */
  offline: boolean
  /** Something changed that updatedAt does not show (e.g. a new quote version). */
  dirty: boolean
  /** Field reports the server holds: reportId → `${status}:${updatedAt}`. */
  reportRevs?: Record<string, string>
}

export const getSyncState = (projectId: string) => metaGet<SyncState>(`sync:${projectId}`)
export const saveSyncState = (projectId: string, s: SyncState) => metaPut(`sync:${projectId}`, s)

// ── Field reports ──────────────────────────────────────────────────────

export async function listReports(projectId: string): Promise<ReportInstance[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('reports', 'readonly').objectStore('reports').index('byProject').getAll(projectId)
    req.onsuccess = () => resolve((req.result as ReportInstance[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    req.onerror = () => reject(req.error)
  })
}

export async function getReport(id: string): Promise<ReportInstance | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('reports', 'readonly').objectStore('reports').get(id)
    req.onsuccess = () => resolve(req.result as ReportInstance | undefined)
    req.onerror = () => reject(req.error)
  })
}

/** Save a draft, or lock it (draft → final). A stored final report is never overwritten. */
export async function saveReport(r: ReportInstance): Promise<void> {
  const prev = await getReport(r.id)
  if (prev?.status === 'final') throw new Error('report is final')
  const db = await openDB()
  const tx = db.transaction('reports', 'readwrite')
  tx.objectStore('reports').put(r)
  await txDone(tx)
}

export async function deleteDraftReport(id: string): Promise<void> {
  const prev = await getReport(id)
  if (!prev || prev.status === 'final') return
  const db = await openDB()
  const tx = db.transaction('reports', 'readwrite')
  tx.objectStore('reports').delete(id)
  await txDone(tx)
}
