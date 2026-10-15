import { describe, expect, it } from 'vitest'
import { buildQuoteDraft, inferPhases, surveyToQuoteInput } from './quote'
import { buildQuotePdf, quotePdfFilename } from './quotePdf'
import { emptyProject } from './schema'

const project = () =>
  emptyProject({
    id: '11111111-2222-3333-4444-555555555555',
    projectName: 'גג תל אביב',
    address: 'הרצל 1, תל אביב',
    roofTypeHe: 'רעפים',
    mainBreaker: '63A', phases: '3',
    usableAreaM2: '120',
    targetKwp: '15',
    budgetIls: '120000',
    annualConsumptionKwh: '18000',
    cableLengthM: '35',
    inverterBrandPref: 'SolarEdge',
    includeBattery: false,
  })

describe('survey → quote adapter', () => {
  it('maps survey fields to QuoteInput', () => {
    const input = surveyToQuoteInput(project(), [])
    expect(input.roofType).toBe('tile')
    expect(input.targetKwp).toBe(15)
    expect(input.usableAreaM2).toBe(120)
    expect(input.budgetIls).toBe(120000)
    expect(input.annualConsumptionKwh).toBe(18000)
    expect(input.acCableLengthM).toBe(35)
    expect(input.inverterBrand).toBe('SolarEdge')
    expect(input.phases).toBe(3) // surveyed
    expect(input.craneAccess).toBeNull()
  })

  it('takes phases from the survey or an explicit "1x"/"3x"; amperage alone is never a guess', () => {
    expect(inferPhases('40A', '1')).toBe(1) // 1×40A homes are common in Israel
    expect(inferPhases('25A', '3')).toBe(3)
    expect(inferPhases('3x25A')).toBe(3)
    expect(inferPhases('1X40A')).toBe(1)
    expect(inferPhases('63A')).toBeUndefined()
    expect(inferPhases('40A', '')).toBeUndefined()
    expect(inferPhases('')).toBeUndefined()
  })

  it('builds a draft bundle wrapped as a dispatch.draft job that never targets the customer', async () => {
    const bundle = await buildQuoteDraft(project(), [])
    expect(bundle.kind).toBe('quote-draft')
    expect(bundle.quote.design.module_count).toBe(34)
    expect(bundle.quote.lines.some((l) => l.sku === 'BEE-MNT-TILE')).toBe(true)
    expect(bundle.quote.needs_owner_input).toBe(true) // seed catalog has no prices
    expect(bundle.job.loop).toBe('dispatch.draft')
    expect(bundle.job.outbound?.requiresHumanPick).toBe(true)
    expect(bundle.job.outbound?.destinationClass).toBe('drafts_group')
    expect(bundle.job.payload.snapshotHash).toBe(bundle.quote.snapshot_hash)
  })

  it('renders the quote PDF with real text and a draft watermark', async () => {
    const p = project()
    const bundle = await buildQuoteDraft(p, [])
    const res = await buildQuotePdf(bundle.quote, p)
    expect(res.meta.pages).toBeGreaterThanOrEqual(1)
    expect(res.meta.bytes).toBeLessThan(400_000)
    const raw = new TextDecoder('latin1').decode(res.bytes)
    expect(raw).toContain('Heebo')
    expect(quotePdfFilename(bundle.quote, p)).toMatch(/^bee-quote-Q-\d{6}-[0-9A-F]{6}-11111111\.pdf$/)
  })
})
