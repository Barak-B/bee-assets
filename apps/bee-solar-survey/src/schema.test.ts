import { describe, expect, it } from 'vitest'
import {
  assessCompleteness,
  emptyProject,
  mapRoofType,
  parseGps,
  toDesignSuitePayload,
} from './schema'
import { buildHiveExportBundle } from './hive'
import type { SurveyPhoto } from './types'

function photo(field: SurveyPhoto['field'] = 'roof'): SurveyPhoto {
  return {
    id: 'p1',
    field,
    dataUrl: 'data:image/jpeg;base64,/9j/aGVsbG8=',
    mimeType: 'image/jpeg',
    sha256: 'abc123',
    createdAt: new Date().toISOString(),
  }
}

describe('mapRoofType', () => {
  it('maps Hebrew Tamir labels to Wave 54 canonical', () => {
    expect(mapRoofType('בטון')).toBe('flat')
    expect(mapRoofType('רעפים')).toBe('tile')
    expect(mapRoofType('פנל מבודד')).toBe('metal-standing-seam')
    expect(mapRoofType('איסכורית')).toBe('metal-trapezoidal')
    expect(mapRoofType('קרקע')).toBe('ground')
  })
})

describe('parseGps', () => {
  it('parses lat,lon', () => {
    expect(parseGps('31.768, 35.214')).toEqual({ lat: 31.768, lon: 35.214 })
  })
  it('rejects garbage', () => {
    expect(parseGps('not-a-gps')).toEqual({ lat: null, lon: null })
  })
})

describe('assessCompleteness + hive export', () => {
  it('marks incomplete surveys not Wave54-ready', () => {
    const p = emptyProject({ projectName: 'Test' })
    const report = assessCompleteness(p, [])
    expect(report.readyForWave54).toBe(false)
    expect(report.missingRequired.length).toBeGreaterThan(0)
  })

  it('builds Collect→Edit→Dispatch bundle when complete', () => {
    const p = emptyProject({
      projectName: 'גג תל אביב',
      address: 'רחוב הרצל 1, תל אביב',
      roofTypeHe: 'בטון',
      usableAreaM2: '120',
      targetKwp: '15',
      gps: '32.08, 34.78',
      surveyor: 'תמיר',
      mainBreaker: '63A',
    })
    const photos = [photo('roof'), photo('electricalPanel')]
    photos[1]!.id = 'p2'
    photos[1]!.field = 'electricalPanel'

    const report = assessCompleteness(p, photos)
    expect(report.readyForWave54).toBe(true)

    const payload = toDesignSuitePayload(p, photos)
    expect(payload.site.roofType).toBe('flat')
    expect(payload.site.usableAreaM2).toBe(120)
    expect(payload.target.sizeKwp).toBe(15)
    expect(payload.site.photos.length).toBe(2)

    const bundle = buildHiveExportBundle(p, photos)
    expect(bundle.jobs).toHaveLength(3)
    expect(bundle.jobs[0]!.loop).toBe('collect.site-survey')
    expect(bundle.jobs[1]!.loop).toBe('edit.normalize-site-survey')
    expect(bundle.jobs[2]!.loop).toBe('dispatch.draft')
    expect(bundle.jobs[2]!.outbound?.destinationClass).toBe('drafts_group')
    expect(bundle.jobs[2]!.outbound?.requiresHumanPick).toBe(true)
    // Law #1/#2 — never customer
    for (const job of bundle.jobs) {
      expect(job.outbound?.destinationClass).not.toBe('customer')
    }
  })

  it('blocks edit when required fields missing', () => {
    const p = emptyProject({ projectName: 'חלקי' })
    const bundle = buildHiveExportBundle(p, [])
    expect(bundle.jobs).toHaveLength(2)
    expect(bundle.jobs[1]!.status).toBe('blocked_trust')
  })
})
