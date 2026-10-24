import { describe, expect, it } from 'vitest'
import { ACTOR_HE, DOC_NAME_HE, STEP_MILESTONE, TRACKS, submissionProgress, suggestTrack, trackPhases } from './submission'

describe('submission file from the plan tracks', () => {
  it('picks the track by AC power and customer type; storage and historic distributors are the office’s call', () => {
    expect(suggestTrack(10, 'private').id).toBe('residential_le15')
    expect(suggestTrack(10, 'business').id).toBe('commercial_15_100')
    expect(suggestTrack(15, 'private').id).toBe('residential_le15')
    expect(suggestTrack(15.1, 'private').id).toBe('commercial_15_100')
    expect(suggestTrack(250, 'business').id).toBe('commercial_100_630')
    expect(suggestTrack(1000, 'business').id).toBe('mv_gt630')
    expect(suggestTrack(null, 'private').why_he).toContain('לבדוק')
    expect(TRACKS.map((t) => t.id)).toEqual(expect.arrayContaining(['bess_add', 'historic_distributor']))
  })

  it('shows people’s steps, keeps the documents of the automated ones', () => {
    const phases = trackPhases('residential_le15')
    expect(phases.map((p) => p.phase)).toEqual(['pre', 'mun', 'fire', 'insp', 'tar', 'op'])
    const pre = phases[0]!
    const ids = pre.steps.map((s) => s.id)
    expect(ids).toContain('pre.05.submit_portal')
    expect(ids).not.toContain('pre.02.resolve_track')
    expect(ids).not.toContain('pre.04.build_pack')
    expect(ids).not.toContain('pre.09.close')
    // The pack's documents stay; its index is not a document.
    const docs = pre.docs.map((d) => d.kind)
    expect(docs).toEqual(expect.arrayContaining(['electric_bill_last', 'iec_form_22_8_22', 'fee_receipt_iec', 'power_of_attorney']))
    expect(docs).not.toContain('pack_cover_index')
    expect(pre.docs.find((d) => d.kind === 'power_of_attorney')).toMatchObject({ required: false })
    expect(pre.docs.find((d) => d.kind === 'iec_form_22_8_22')).toMatchObject({ required: true, signed_by: 'customer' })
    expect(pre.steps.find((s) => s.id === 'pre.06.pay_fee')!.fee?.expected_amount_ils).toBe(704.22)
  })

  it('every actor and document has a Hebrew name; milestone steps exist in the tracks', () => {
    for (const t of TRACKS)
      for (const p of trackPhases(t.id)) {
        for (const s of p.steps) expect(ACTOR_HE[s.actor], `${t.id} ${s.id}`).toBeTruthy()
        for (const d of p.docs) expect(DOC_NAME_HE[d.kind], d.kind).toBeTruthy()
      }
    const all = new Set(TRACKS.flatMap((t) => t.steps.map((s) => s.id)))
    for (const id of Object.keys(STEP_MILESTONE)) expect(all.has(id), id).toBe(true)
  })

  it('progress counts only phases that apply, and names the missing documents', () => {
    const empty = submissionProgress({ track: 'residential_le15', steps: {}, docs: {}, na: [] })
    const lean = submissionProgress({ track: 'residential_le15', steps: {}, docs: {}, na: ['fire', 'op', 'mun'] })
    expect(lean.steps).toBeLessThan(empty.steps)
    expect(lean.docs).toBeLessThan(empty.docs)
    const some = submissionProgress({ track: 'residential_le15', steps: { 'pre.05.submit_portal': { date: '2026-10-01' } }, docs: { electric_bill_last: { date: '2026-10-01' } }, na: ['fire', 'op', 'mun'] })
    expect(some).toMatchObject({ stepsDone: 1, docsDone: 1 })
    expect(some.missingDocs).toContain(DOC_NAME_HE.iec_form_22_8_22)
    expect(some.missingDocs).not.toContain(DOC_NAME_HE.electric_bill_last)
  })
})
