/**
 * Restoring a backup file (or a survey pulled from the server) onto a device
 * that may already hold newer work. The rules are non-destructive:
 *
 *  - a survey is replaced only by a strictly newer copy (updatedAt);
 *  - a quote version is immutable — an existing one is never overwritten;
 *  - a locked (final) report is never overwritten; a draft gives way to the
 *    final copy of the same report, or to a newer draft;
 *  - a photo is replaced only when its survey or report was taken from the file;
 *  - the price book is replaced only by a newer one.
 *
 * The whole file is validated before anything is written, so a damaged file
 * changes nothing.
 */
import type { StoredPricing, StoredPhoto, StoredQuote } from './db'
import type { ReportInstance } from './reports/types'
import type { SiteSurveyProject } from './types'

export interface BackupData {
  projects: SiteSurveyProject[]
  photos: StoredPhoto[]
  quotes: StoredQuote[]
  reports: ReportInstance[]
  pricing: StoredPricing | null
}

export class BackupError extends Error {}

export type Decision = 'add' | 'update' | 'skip'

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  pricing: boolean
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function list(raw: Record<string, unknown>, key: string, label: string, ok: (row: Record<string, unknown>) => boolean): unknown[] {
  const v = raw[key]
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new BackupError(`הקובץ פגום: "${key}" אינו רשימה`)
  v.forEach((row, i) => {
    if (!isObj(row) || !ok(row)) throw new BackupError(`הקובץ פגום: ${label} מספר ${i + 1} אינו תקין — לא שוחזר דבר`)
  })
  return v
}

/** Validate a parsed backup file. Throws BackupError (Hebrew) and writes nothing when anything is off. */
export function parseBackup(raw: unknown): BackupData {
  if (!isObj(raw)) throw new BackupError('הקובץ אינו קובץ גיבוי')
  if (raw.app !== undefined && raw.app !== 'bee-solar-survey') throw new BackupError('הקובץ אינו גיבוי של אפליקציית הסקרים')
  const projects = list(raw, 'projects', 'סקר', (p) => isStr(p.id) && isStr(p.updatedAt) && typeof p.projectName === 'string')
  const photos = list(raw, 'photos', 'תמונה', (p) => isStr(p.id) && isStr(p.projectId) && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/'))
  const quotes = list(
    raw,
    'quotes',
    'גרסת הצעה',
    (q) => isStr(q.id) && isStr(q.projectId) && Number.isInteger(q.version_no) && (q.version_no as number) >= 1 && isObj(q.quote),
  )
  const reports = list(
    raw,
    'reports',
    'דוח',
    (r) =>
      isStr(r.id) &&
      isStr(r.projectId) &&
      isStr(r.templateKey) &&
      isStr(r.updatedAt) &&
      Array.isArray(r.photos) &&
      (r.status === 'draft' || (r.status === 'final' && isStr(r.contentHash))),
  )
  const pricing = toStoredPricing(raw.pricing)
  if (!projects.length && !photos.length && !quotes.length && !reports.length && !pricing) throw new BackupError('קובץ הגיבוי ריק')
  return {
    projects: projects as SiteSurveyProject[],
    photos: photos as StoredPhoto[],
    quotes: quotes as StoredQuote[],
    reports: reports as ReportInstance[],
    pricing,
  }
}

export function decideProject(local: SiteSurveyProject | undefined, incoming: SiteSurveyProject): Decision {
  if (!local) return 'add'
  return incoming.updatedAt > local.updatedAt ? 'update' : 'skip'
}

export function decideQuote(local: StoredQuote | undefined): Decision {
  return local ? 'skip' : 'add'
}

export function decideReport(local: ReportInstance | undefined, incoming: ReportInstance): Decision {
  if (!local) return 'add'
  if (local.status === 'final') return 'skip'
  if (incoming.status === 'final') return 'update'
  return incoming.updatedAt > local.updatedAt ? 'update' : 'skip'
}

/** A photo follows its owner: replaced only when the survey (or report) it belongs to was taken from the file. */
export function decidePhoto(local: StoredPhoto | undefined, ownerTaken: boolean): Decision {
  if (!local) return 'add'
  return ownerTaken ? 'update' : 'skip'
}

/**
 * A price book in any of the shapes it travels in: the `pricing` part of a
 * backup, a whole backup or pricing-only file, or the server's copy. `null`
 * when it is not one (no catalog with a product list, or no rules).
 */
export function toStoredPricing(raw: unknown): StoredPricing | null {
  if (!isObj(raw)) return null
  if (isObj(raw.pricing)) return toStoredPricing(raw.pricing)
  if (!isObj(raw.catalog) || !Array.isArray(raw.catalog.products) || !isObj(raw.rules)) return null
  return { catalog: raw.catalog as unknown as StoredPricing['catalog'], rules: raw.rules as unknown as StoredPricing['rules'], ...(isStr(raw.updatedAt) ? { updatedAt: raw.updatedAt } : {}) }
}

/** Take the incoming price book only when it is newer (an undated local one gives way to a dated one). */
export function decidePricing(local: StoredPricing | null, incoming: StoredPricing | null): boolean {
  if (!incoming) return false
  if (!local) return true
  if (!incoming.updatedAt) return false
  return !local.updatedAt || incoming.updatedAt > local.updatedAt
}
