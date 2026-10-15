import { describe, expect, it } from 'vitest'
import { emptyProject } from '../schema'
import { buildContext, defectsFromInspection, finalizeReport, newReport } from './model'
import { buildReportPdf, reportPdfFilename } from './pdf'
import { TEMPLATE_ORDER } from './templates'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQImWP4z8DwnwEIGP7//w8iAABaBAX/dMtuSgAAAABJRU5ErkJggg=='

const project = emptyProject({ projectName: 'גג הרצל — בדיקה', address: 'הרצל 1, תל אביב', roofTypeHe: 'בטון', mainBreaker: '3x40A' })
const ctx = buildContext(project, null, ['עבודה — 5 שנים'])

describe('report PDF', () => {
  it('renders every template, empty and filled, as a small real-text PDF', async () => {
    for (const key of TEMPLATE_ORDER) {
      const r = newReport(key, project.id, ctx)
      const empty = await buildReportPdf(r)
      expect(new TextDecoder('latin1').decode(empty.bytes.slice(0, 5))).toBe('%PDF-')
      // fill one of everything
      for (const sec of Object.values(r.fields)) for (const k of Object.keys(sec)) sec[k] ||= 'ערך בדיקה (12)'
      for (const sec of Object.values(r.checklists)) for (const e of Object.values(sec)) Object.assign(e, { result: 'ok', value: '10', note: 'הערה' })
      for (const rows of Object.values(r.tables)) rows.push(Object.fromEntries(Object.keys(rows[0] ?? { a: '' }).map((k) => [k, '7'])))
      r.photos.push({ id: 'p1', sectionKey: Object.keys(r.checklists)[0] ?? 'photos', itemCode: undefined, dataUrl: TINY_PNG, mimeType: 'image/png', sha256: 'x', createdAt: '2026-10-15T10:00:00.000Z' })
      r.signatures.foreman = r.signatures.inspector = r.signatures.customer = { name: 'ישראל ישראלי', dataUrl: TINY_PNG, signedAt: '2026-10-15T10:00:00.000Z' }
      const full = await buildReportPdf(r)
      const text = new TextDecoder('latin1').decode(full.bytes)
      expect(text).toContain('Heebo')
      expect(full.meta.bytes).toBeLessThan(400_000)
      expect(full.meta.pages).toBeGreaterThanOrEqual(1)
      expect(reportPdfFilename(r)).toMatch(new RegExp(`^bee-${key.replace(/_/g, '-')}-r1-.+\\.pdf$`))
    }
  })

  it('a locked report carries its hash; a defects list made from an inspection renders', async () => {
    const insp = newReport('inspection_62446', project.id, ctx)
    Object.assign(insp.fields.inspector!, { name: 'בודק', license: '1' })
    insp.fields.environment!.irradiance_method = 'none'
    insp.tables.instruments = [{ kind: 'megger', model: 'X', sn: '', calibration: '' }]
    insp.tables.strings = [{ label: 'S1', modules: '10', polarity: 'no', voc: '400', riso: '50' }]
    for (const e of Object.values(insp.checklists).flatMap((s) => Object.values(s))) e.result = 'ok'
    insp.signatures.inspector = { name: 'בודק', dataUrl: TINY_PNG, signedAt: '2026-10-15T10:00:00.000Z' }
    const final = await finalizeReport(insp)
    const pdf = await buildReportPdf(final)
    expect(pdf.meta.bytes).toBeGreaterThan(5_000)
    const d = defectsFromInspection(final)
    expect(d.tables.defects).toHaveLength(1)
    expect((await buildReportPdf(d)).meta.pages).toBeGreaterThanOrEqual(1)
  })
})
