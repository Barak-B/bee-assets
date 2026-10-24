import { describe, expect, it } from 'vitest'
import { BackupError, decidePhoto, decidePricing, decideProject, decideQuote, decideReport, parseBackup, toStoredPricing } from './backup'
import type { StoredPhoto, StoredPricing, StoredQuote } from './db'
import type { ReportInstance } from './reports/types'
import { emptyProject } from './schema'
import { SyncError } from './sync'

const project = (updatedAt: string) => ({ ...emptyProject(), id: 'p1', projectName: 'בית', updatedAt })
const report = (status: 'draft' | 'final', updatedAt: string) =>
  ({ id: 'r1', projectId: 'p1', templateKey: 'daily_report', status, updatedAt, contentHash: status === 'final' ? 'ab'.repeat(32) : null, photos: [] }) as unknown as ReportInstance
const photo = { id: 'ph1', projectId: 'p1', dataUrl: 'data:image/jpeg;base64,AAAA' } as StoredPhoto

describe('backup file restore', () => {
  it('accepts a valid backup and normalises missing lists', () => {
    const b = parseBackup({ app: 'bee-solar-survey', projects: [project('2026-01-01T00:00:00.000Z')] })
    expect(b.projects).toHaveLength(1)
    expect(b.photos).toEqual([])
    expect(b.pricing).toBeNull()
  })

  it('rejects other apps, damaged rows and empty files before writing anything', () => {
    expect(() => parseBackup({ app: 'other', projects: [] })).toThrow(BackupError)
    expect(() => parseBackup([])).toThrow(BackupError)
    expect(() => parseBackup({ projects: [{ id: '', updatedAt: 'x', projectName: '' }] })).toThrow(/סקר מספר 1/)
    expect(() => parseBackup({ projects: [project('x')], photos: [{ ...photo, dataUrl: 'javascript:alert(1)' }] })).toThrow(/תמונה/)
    expect(() => parseBackup({ projects: [project('x')], quotes: [{ id: 'p1:0', projectId: 'p1', version_no: 0, quote: {} }] })).toThrow(/גרסת הצעה/)
    expect(() => parseBackup({ projects: [project('x')], reports: [{ ...report('final', 'x'), contentHash: null }] })).toThrow(/דוח/)
    expect(() => parseBackup({ projects: 'nope' })).toThrow(BackupError)
    expect(() => parseBackup({})).toThrow(/ריק/)
  })

  it('never replaces newer local work', () => {
    expect(decideProject(undefined, project('2026-01-01'))).toBe('add')
    expect(decideProject(project('2026-02-01'), project('2026-01-01'))).toBe('skip')
    expect(decideProject(project('2026-01-01'), project('2026-01-01'))).toBe('skip')
    expect(decideProject(project('2026-01-01'), project('2026-02-01'))).toBe('update')
  })

  it('keeps quote versions and locked reports immutable', () => {
    expect(decideQuote({} as StoredQuote)).toBe('skip')
    expect(decideQuote(undefined)).toBe('add')
    expect(decideReport(report('final', '2026-01-01'), report('draft', '2026-09-01'))).toBe('skip')
    expect(decideReport(report('final', '2026-01-01'), report('final', '2026-09-01'))).toBe('skip')
    expect(decideReport(report('draft', '2026-09-01'), report('final', '2026-01-01'))).toBe('update')
    expect(decideReport(report('draft', '2026-09-01'), report('draft', '2026-01-01'))).toBe('skip')
    expect(decideReport(report('draft', '2026-01-01'), report('draft', '2026-09-01'))).toBe('update')
  })

  it('replaces a photo only with its survey, and the price book only with a newer one', () => {
    expect(decidePhoto(undefined, false)).toBe('add')
    expect(decidePhoto(photo, false)).toBe('skip')
    expect(decidePhoto(photo, true)).toBe('update')
    const pb = (updatedAt?: string) => ({ catalog: {}, rules: {}, updatedAt }) as unknown as StoredPricing
    expect(decidePricing(null, pb('2026-01-01'))).toBe(true)
    expect(decidePricing(pb('2026-02-01'), pb('2026-01-01'))).toBe(false)
    expect(decidePricing(pb('2026-01-01'), pb('2026-02-01'))).toBe(true)
    expect(decidePricing(pb('2026-01-01'), pb(undefined))).toBe(false)
    expect(decidePricing(pb('2026-01-01'), null)).toBe(false)
    expect(decidePricing(pb(undefined), pb('2026-01-01'))).toBe(true)
  })

  it('reads a price book from a backup, a pricing-only file or a bare one', () => {
    const bare = { catalog: { products: [] }, rules: {}, updatedAt: '2026-10-01T00:00:00.000Z' }
    expect(toStoredPricing(bare)).toEqual(bare)
    expect(toStoredPricing({ app: 'bee-solar-survey', pricing: bare })).toEqual(bare)
    expect(toStoredPricing({ catalog: { products: [] }, rules: {} })).toEqual({ catalog: { products: [] }, rules: {} })
    for (const bad of [null, 'x', [], {}, { catalog: {}, rules: {} }, { catalog: { products: [] } }, { pricing: { rules: {} } }]) expect(toStoredPricing(bad)).toBeNull()
  })
})

describe('sync errors', () => {
  it('treats content refusals as permanent and network/auth/server trouble as retryable', () => {
    for (const status of [400, 409, 413, 422]) expect(new SyncError('x', false, status).permanent).toBe(true)
    for (const status of [401, 403, 404, 429, 500, 503]) expect(new SyncError('x', false, status).permanent).toBe(false)
    expect(new SyncError('offline', true).permanent).toBe(false)
  })
})
