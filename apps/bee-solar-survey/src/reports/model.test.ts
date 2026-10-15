import { describe, expect, it } from 'vitest'
import { emptyProject } from '../schema'
import { buildContext, defectsFromInspection, finalizeReport, newReport, reviseReport, validateReport, visibleSections, template, ReportLockedError } from './model'
import { expectedVoc, inspectionVerdict, openDefects, stringResult, TEMPLATES, TEMPLATE_ORDER } from './templates'
import type { ReportInstance } from './types'

const project = emptyProject({ projectName: 'גג הרצל', address: 'הרצל 1', roofTypeHe: 'רעפים', mainBreaker: '3x40A', meterNumber: 'M-123', surveyor: 'תמיר', inverterBrandPref: 'KStar' })
const ctx = (over = {}) => ({ ...buildContext(project, null, ['מודולים — 12 שנה', 'עבודה — 5 שנים']), ...over })
const sig = { name: 'ישראל', dataUrl: 'data:image/png;base64,AAAA', signedAt: '2026-10-15T10:00:00.000Z' }

function inspection(): ReportInstance {
  const r = newReport('inspection_62446', project.id, ctx())
  Object.assign(r.fields.inspector!, { name: 'בודק', license: '123' })
  Object.assign(r.fields.system!, { module_voc: '50', module_isc: '14', beta_voc: '-0.25' })
  Object.assign(r.fields.environment!, { irradiance: '800', irradiance_method: 'pyranometer', module_temp: '45' })
  Object.assign(r.fields.thresholds!, { riso_min: '1', voc_tol: '5', isc_tol: '10' })
  r.tables.instruments = [{ kind: 'megger', model: 'Fluke 1587', sn: '1', calibration: '2027-01' }]
  r.tables.strings = [{ label: 'S1', inverter: 'INV1/M1', modules: '10', polarity: 'yes', voc: '475', isc: '11.2', riso: '40' }]
  for (const entries of Object.values(r.checklists)) for (const e of Object.values(entries)) e.result = 'ok'
  r.signatures.inspector = sig
  return r
}

describe('templates', () => {
  it('every template has a key, a title and only sections the editor knows', () => {
    expect(TEMPLATE_ORDER).toHaveLength(5)
    for (const k of TEMPLATE_ORDER) {
      const t = TEMPLATES[k]
      expect(t.key).toBe(k)
      expect(t.title_he).toBeTruthy()
      for (const s of t.sections) expect(['fields', 'checklist', 'table', 'photos', 'signatures']).toContain(s.kind)
      const codes = t.sections.flatMap((s) => (s.kind === 'checklist' ? s.items.map((i) => i.code) : []))
      expect(new Set(codes).size).toBe(codes.length) // unique item codes
    }
  })

  it('installation checklist follows roof type, optimizers and battery', () => {
    const tile = newReport('installation_checklist', project.id, ctx())
    const codes = (r: ReportInstance) => visibleSections(template(r), r).flatMap((s) => (s.kind === 'checklist' ? s.items.map((i) => i.code) : []))
    expect(codes(tile)).toContain('STR-TILE-1')
    expect(codes(tile)).not.toContain('STR-FLAT-1')
    expect(codes(tile)).toContain('DC-STR-1') // KStar = string inverter
    expect(codes(tile)).not.toContain('BAT-01')
    const flatSe = newReport('installation_checklist', project.id, ctx({ roofType: 'flat', hasOptimizers: true, hasBattery: true }))
    expect(codes(flatSe)).toEqual(expect.arrayContaining(['STR-FLAT-2', 'DC-OPT-1', 'BAT-01']))
    expect(codes(flatSe)).not.toContain('DC-STR-1')
    expect(Object.keys(flatSe.checklists.structure!)).not.toContain('STR-TILE-1') // only applicable items are stored
  })

  it('prefills from the job and numbers revisions per template', () => {
    const h = newReport('handover', project.id, ctx({ moduleCount: 34, moduleModel: 'מודול 450W', inverterModel: 'KStar 10kW', inverterCount: 1 }))
    expect(h.fields.meter!.meter_serial).toBe('M-123')
    expect(h.fields.warranty!.lines).toBe('מודולים — 12 שנה\nעבודה — 5 שנים')
    expect(h.tables.equipment!.map((r) => r.item)).toEqual(['מודולים', 'ממיר'])
    const d1 = newReport('daily_report', project.id, ctx())
    const d2 = newReport('daily_report', project.id, ctx(), [d1, h])
    expect([d1.revision, d2.revision]).toEqual([1, 2])
  })
})

describe('62446 calculations', () => {
  it('expected Voc follows module temperature; tolerance warns, polarity and Riso fail', () => {
    const r = inspection()
    const row = r.tables.strings![0]!
    // 50 V × 10 × (1 − 0.0025 × 20) = 475 V
    expect(expectedVoc(r, row)).toBeCloseTo(475, 6)
    expect(stringResult(r, row)).toBe('pass')
    expect(stringResult(r, { ...row, voc: '420' })).toBe('warn') // −11.6% > 5%
    expect(stringResult(r, { ...row, isc: '8' })).toBe('warn') // expected 11.2
    expect(stringResult(r, { ...row, polarity: 'no' })).toBe('fail')
    expect(stringResult(r, { ...row, riso: '0.5' })).toBe('fail')
    expect(stringResult(r, { ...row, riso: '' })).toBe('') // not enough data
    const noLimit = inspection()
    noLimit.fields.thresholds!.riso_min = ''
    expect(stringResult(noLimit, { ...row, riso: '0.5' })).toBe('pass') // no unverified constant in code
    expect(validateReport(noLimit).warnings.join()).toContain('סף Riso')
  })

  it('verdict: fail on any failed item, pass with remarks on warnings', () => {
    const r = inspection()
    expect(inspectionVerdict(r).overall).toBe('pass')
    r.tables.strings!.push({ label: 'S2', modules: '10', polarity: 'yes', voc: '400', isc: '11', riso: '30' })
    expect(inspectionVerdict(r).overall).toBe('pass_with_defects')
    r.checklists.visual!['V-DC-01']!.result = 'fail'
    expect(inspectionVerdict(r).overall).toBe('fail')
    expect(template(r).outcome!(r)?.tone).toBe('fail')
  })
})

describe('lifecycle', () => {
  it('lists what is missing and refuses to lock until it is complete', async () => {
    const r = newReport('daily_report', project.id, ctx())
    const v = validateReport(r)
    expect(v.missing).toEqual(expect.arrayContaining(['כללי: מנהל עבודה', 'התקדמות: מודולים שהותקנו עד היום', 'תמונות היום: נדרשת לפחות 1 תמונה', 'חתימה: מנהל העבודה']))
    await expect(finalizeReport(r)).rejects.toBeInstanceOf(ReportLockedError)
  })

  it('locks with a content hash; a change is a new revision without signatures', async () => {
    const r = inspection()
    expect(validateReport(r).missing).toEqual([])
    const f = await finalizeReport(r, [], new Date('2026-10-15T12:00:00Z'))
    expect(f.status).toBe('final')
    expect(f.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect((await finalizeReport({ ...r }, [], new Date('2026-10-16T00:00:00Z'))).contentHash).toBe(f.contentHash) // time does not change the hash
    await expect(finalizeReport(f)).rejects.toThrow('נעול')
    const rev = reviseReport(f, [f])
    expect(rev).toMatchObject({ revision: 2, supersedes: f.id, status: 'draft', contentHash: null, signatures: {} })
    expect(rev.tables.strings).toEqual(f.tables.strings)
    rev.tables.strings![0]!.voc = '470'
    expect(f.tables.strings![0]!.voc).toBe('475') // deep copy
  })

  it('a failed inspection becomes an open defects list that blocks handover', async () => {
    const insp = inspection()
    insp.checklists.visual!['V-LAB-01'] = { result: 'fail', value: '', note: 'חסר שלט DC' }
    insp.tables.strings!.push({ label: 'S2', inverter: 'INV1/M2', modules: '10', polarity: 'no', voc: '470', riso: '30' })
    const final = await finalizeReport(insp)
    const d = defectsFromInspection(final)
    expect(d.sourceReportId).toBe(final.id)
    expect(d.fields.general!.ref).toContain(final.contentHash!.slice(0, 12))
    expect(d.tables.defects!.map((x) => [x.code, x.severity, x.blocks])).toEqual([
      ['V-LAB-01', 'major', ''],
      ['STR-S2', 'critical', 'yes'],
    ])
    expect(d.tables.defects![0]!.description).toContain('חסר שלט DC')
    expect(openDefects(d)).toHaveLength(2)

    const h = newReport('handover', project.id, ctx())
    const warns = validateReport(h, [final, d]).warnings.join(' | ')
    expect(warns).toContain('נכשל')
    expect(warns).toContain('2 ליקויים פתוחים')

    // Fix everything and pass a retest → handover is clear.
    d.tables.defects!.forEach((x) => (x.status = 'closed'))
    const retest = reviseReport(final, [final])
    retest.checklists.visual!['V-LAB-01'] = { result: 'ok', value: '', note: '' }
    retest.tables.strings![1]!.polarity = 'yes'
    retest.signatures.inspector = sig
    const retestFinal = await finalizeReport(retest, [], new Date(Date.now() + 1000))
    expect(validateReport(h, [final, d, retestFinal]).warnings.filter((w) => /נכשל|ליקויים|62446/.test(w))).toEqual([])
  })

  it('waiving a defect needs a reason', () => {
    const d = newReport('defects', project.id, ctx())
    d.tables.defects = [{ code: 'X', severity: 'minor', blocks: '', location: '', description: 'שריטה', status: 'waived', fix: '' }]
    expect(validateReport(d).warnings.join()).toContain('חסרה סיבה')
    expect(openDefects(d)).toHaveLength(0)
  })
})
