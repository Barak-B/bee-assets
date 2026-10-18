import { describe, expect, it } from 'vitest'
import { MILESTONES, PLAN_STAGE, STAGES, decodeMilestones, deriveStage, effectiveMilestones, encodeMilestones, nextStepHe, skippedMilestones, type Milestones, type StageFacts } from './stage'

const approved: StageFacts = { surveyed: true, quoteVersions: 1, liveLinks: 1, accepted: true, installationReports: 0, handoverFinal: false }
const d = (date: string, ref?: string) => ({ date, ...(ref ? { ref } : {}) })
const all = (upTo: number): Milestones => Object.fromEntries(MILESTONES.slice(0, upTo).map((m) => [m.key, d('2026-10-01')]))

describe('lifecycle S01–S12', () => {
  it('every stage maps to the plan, in order', () => {
    expect(STAGES.map((s) => PLAN_STAGE[s])).toEqual(['S01', 'S02', 'S03', 'S04', 'S04', 'S05+S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'])
    // Codes are stored; they must stay unique.
    expect(new Set(MILESTONES.map((m) => m.code)).size).toBe(MILESTONES.length)
  })

  it('after the approval the office milestones move the job, one stage at a time', () => {
    expect(deriveStage(approved)).toBe('accepted')
    expect(deriveStage({ ...approved, milestones: { contract_signed: d('2026-10-01') } })).toBe('accepted')
    expect(deriveStage({ ...approved, milestones: all(2) })).toBe('permits')
    expect(deriveStage({ ...approved, milestones: all(4) })).toBe('permits') // design not approved yet
    expect(deriveStage({ ...approved, milestones: all(5) })).toBe('procurement')
    expect(deriveStage({ ...approved, milestones: all(7) })).toBe('installation')
    expect(deriveStage({ ...approved, milestones: all(8) })).toBe('inspection')
    expect(deriveStage({ ...approved, milestones: all(9) })).toBe('grid')
    expect(deriveStage({ ...approved, milestones: all(11) })).toBe('handover')
    expect(deriveStage({ ...approved, milestones: all(14) })).toBe('service')
  })

  it('a later milestone is evidence on its own: a paper contract, an answer without the submission', () => {
    const offline: StageFacts = { ...approved, accepted: false, liveLinks: 0 }
    expect(deriveStage({ ...offline, milestones: { contract_signed: d('2026-10-01') } })).toBe('accepted')
    // The IEC answered → it was submitted; still waiting for design in the same stage.
    const ms = { ...all(2), iec_approved: d('2026-10-05') }
    expect(effectiveMilestones({ ...approved, milestones: ms }).iec_submitted).toMatchObject({ date: '2026-10-05', auto: expect.any(String) })
    expect(deriveStage({ ...approved, milestones: ms })).toBe('permits')
    expect(nextStepHe('permits', effectiveMilestones({ ...approved, milestones: ms }))).toBe('לאשר תכנון מפורט')
  })

  it('locked reports count: an installation checklist ends installation, a handover report signs the handover', () => {
    const roof = { ...approved, installationReports: 2 }
    expect(deriveStage(roof)).toBe('installation')
    expect(skippedMilestones('installation', effectiveMilestones(roof)).map((m) => m.key)).toEqual(['contract_signed', 'deposit_paid', 'iec_submitted', 'iec_approved', 'design_approved', 'equipment_ordered', 'equipment_delivered'])
    expect(deriveStage({ ...roof, installationChecklistFinalAt: '2026-10-10T08:00:00Z' })).toBe('inspection')
    const handed = { ...roof, handoverFinal: true, handoverFinalAt: '2026-10-12T08:00:00Z' }
    expect(deriveStage(handed)).toBe('handover')
    expect(effectiveMilestones(handed).handover_signed).toEqual({ date: '2026-10-12', auto: 'דוח מסירה נעול' })
    expect(nextStepHe('handover', effectiveMilestones(handed))).toBe('להוציא חשבון סופי')
    expect(deriveStage({ ...handed, milestones: { final_invoice: d('2026-10-13'), monitoring_active: d('2026-10-13') } })).toBe('service')
  })

  it('before the approval nothing changed', () => {
    const base: StageFacts = { surveyed: false, quoteVersions: 0, liveLinks: 0, accepted: false, installationReports: 0, handoverFinal: false }
    expect(deriveStage(base)).toBe('lead')
    expect(deriveStage({ ...base, surveyed: true, quoteVersions: 2, liveLinks: 1 })).toBe('sent')
    expect(nextStepHe('sent')).toBe('לחכות לאישור / להתקשר ללקוח')
  })

  it('milestones are stored compactly and survive the trip; derived ones are not stored', () => {
    const ms: Milestones = { contract_signed: d('2026-10-01'), iec_submitted: d('2026-10-03', '7004512'), handover_signed: { date: '2026-10-09', auto: 'דוח מסירה נעול' } }
    const s = encodeMilestones(ms)
    expect(s).toBe('cs=20261001,is=20261003~7004512')
    expect(decodeMilestones(s)).toEqual({ contract_signed: d('2026-10-01'), iec_submitted: d('2026-10-03', '7004512') })
    expect(decodeMilestones('zz=20261001,cs=bad,,is=20261003~a b')).toEqual({})
    expect(decodeMilestones(undefined)).toEqual({})
  })
})
