import { describe, expect, it } from 'vitest'
import { buildSurveyPdfDetailed, shortContentHash, surveyPdfFilename } from './pdf'
import { assessCompleteness, emptyProject } from './schema'
import type { SurveyPhoto } from './types'

// 2×2 RGB PNG (valid, decodable by jsPDF's PNG reader)
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVQImWP4z8DwnwEIGP7//w8iAABaBAX/dMtuSgAAAABJRU5ErkJggg=='

function photo(field: SurveyPhoto['field'], id: string): SurveyPhoto {
  return { id, field, dataUrl: TINY_PNG, mimeType: 'image/png', sha256: `sha-${id}`, createdAt: '2026-10-13T10:00:00.000Z' }
}

const fullProject = () =>
  emptyProject({
    id: '11111111-2222-3333-4444-555555555555',
    projectName: 'גג תל אביב — בדיקה',
    address: 'רחוב הרצל 1, תל אביב (Wave 54)',
    surveyor: 'תמיר',
    surveyDate: '2026-10-13',
    gps: '32.08, 34.78',
    roofTypeHe: 'בטון',
    mainBreaker: '63A',
    usableAreaM2: '120',
    targetKwp: '15',
    budgetIls: '120000',
    inverterBrandPref: 'SolarEdge',
    includeBattery: true,
    generalNotes: 'הערה ארוכה מאוד לבדיקת גלישה של טקסט בדוח. '.repeat(12),
    cableNotes: 'תוואי לאורך הקיר המערבי, חציית גג דרך שרוול קיים.',
    customFields: [{ id: 'c1', section: 'notes', label: 'מספר חוזה חח"י', value: '52181659' }],
    updatedAt: '2026-10-13T10:00:00.000Z',
    createdAt: '2026-10-13T09:00:00.000Z',
  })

describe('survey PDF', () => {
  it('produces a small, multi-section PDF with real text and embedded Heebo', async () => {
    const p = fullProject()
    const photos = [photo('roof', 'p1'), photo('electricalPanel', 'p2'), photo('roof', 'p3')]
    const c = assessCompleteness(p, photos)
    const res = await buildSurveyPdfDetailed(p, photos, c)

    expect(res.meta.pages).toBeGreaterThanOrEqual(1)
    expect(res.meta.hash).toMatch(/^[0-9a-f]{8}$/)
    // Old renderer produced ~2 MB for one page of text; this must stay well under 400 KB.
    expect(res.meta.bytes).toBeLessThan(400_000)

    const raw = new TextDecoder('latin1').decode(res.bytes)
    expect(raw).toContain('/Type /Font')
    expect(raw).toContain('Heebo')
    expect(raw.startsWith('%PDF-')).toBe(true)
  })

  it('handles an empty project without photos', async () => {
    const p = emptyProject({ projectName: 'ריק' })
    const res = await buildSurveyPdfDetailed(p, [], assessCompleteness(p, []))
    expect(res.meta.pages).toBeGreaterThanOrEqual(1)
    expect(res.meta.bytes).toBeLessThan(400_000)
  })

  it('hash changes when content changes', async () => {
    const a = fullProject()
    const b = { ...a, address: 'אחר' }
    expect(await shortContentHash(a, [])).not.toBe(await shortContentHash(b, []))
    expect(await shortContentHash(a, [])).toBe(await shortContentHash({ ...a }, []))
  })

  it('builds a filesystem-safe filename', () => {
    const p = fullProject()
    expect(surveyPdfFilename(p)).toBe('bee-survey-11111111-2026-10-13.pdf') // Hebrew name → id fallback
    expect(surveyPdfFilename({ ...p, projectName: 'Roof TLV (test)' })).toBe('bee-survey-Roof_TLV_(test)-2026-10-13.pdf')
    expect(surveyPdfFilename(emptyProject({ id: 'abcdefgh-xxxx', surveyDate: '2026-01-01' }))).toBe('bee-survey-abcdefgh-2026-01-01.pdf')
  })
})
