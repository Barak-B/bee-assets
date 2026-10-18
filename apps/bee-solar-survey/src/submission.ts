/**
 * The submission file of a job (S05 / S10): the steps and documents of its
 * regulatory track, from docs/plan/templates/submission-templates.json.
 *
 * Until the engine builds packs and talks to the IEC portals, people do the
 * steps; this is their checklist. Steps that are pure engine automation
 * (running the resolver, merging the pack, closing) are not shown, but the
 * documents they need are. Fees and SLAs are shown only where the plan has a
 * verified number — nothing here is invented.
 */
import plan from '../../../docs/plan/templates/submission-templates.json'
import type { MilestoneKey } from './stage'

export interface PlanStep {
  id: string
  name_he: string
  stage: string
  actor: string
  documents_required: string[]
  documents_conditional?: { kind: string; when: string }[]
  fee?: { expected_amount_ils: number | null }
  notes?: string
}

export interface Track {
  id: string
  name_he: string
  steps: PlanStep[]
}

export const TRACKS = plan.tracks as unknown as Track[]
export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t])) as Record<string, Track>
export const DOC_NAME_HE = Object.fromEntries(Object.entries(plan.document_kinds as Record<string, { name_he: string }>).map(([k, v]) => [k, v.name_he])) as Record<string, string>
const DOC_SIGNED_BY = Object.fromEntries(Object.entries(plan.document_kinds as Record<string, { signed_by: string | null }>).map(([k, v]) => [k, v.signed_by])) as Record<string, string | null>

export type Phase = 'pre' | 'hd' | 'mun' | 'fire' | 'insp' | 'tar' | 'op'
export const PHASE_ORDER: Phase[] = ['pre', 'hd', 'mun', 'fire', 'insp', 'tar', 'op']
export const PHASE_LABEL_HE: Record<Phase, string> = {
  pre: 'הגשה מקדימה לחח״י',
  hd: 'מחלק היסטורי',
  mun: 'רשות מקומית (היתר / פטור)',
  fire: 'כבאות',
  insp: 'בדיקת מתקן וחיבור',
  tar: 'רישום לאסדרה',
  op: 'היתר הפעלה',
}
/** Phases that may simply not apply to a job (no fire plan needed, no operating permit). */
export const OPTIONAL_PHASES = new Set<Phase>(['mun', 'fire', 'op'])

export const ACTOR_HE: Record<string, string> = {
  pm: 'משרד',
  owner: 'ברק',
  customer: 'לקוח',
  iec: 'חח״י',
  distributor: 'מחלק',
  pua: 'רשות החשמל',
  structural_engineer: 'קונסטרוקטור',
  fire_consultant: 'יועץ בטיחות',
  system: 'בדיקה',
}

export const SIGNED_BY_HE: Record<string, string> = { customer: 'חתימת לקוח', designer: 'חתימת מתכנן', inspector: 'חתימת בודק', installer: 'חתימת מתקין', iec: 'מחח״י', structural_engineer: 'חתימת קונסטרוקטור' }

const phaseOf = (id: string) => id.split('.')[0] as Phase

/** Engine-only steps: the documents stay, the step is not a person's to tick. */
const isAutomation = (s: PlanStep) => s.actor === 'system' && /resolve_track|build_pack|\.close$|gate_/.test(s.id)

/** Not a document anyone hands in: the pack's own index. */
const NOT_A_DOC = new Set(['pack_cover_index'])

export interface PhaseView {
  phase: Phase
  steps: PlanStep[]
  /** Required documents, then conditional ones ("if needed"). */
  docs: { kind: string; required: boolean; when?: string; signed_by: string | null }[]
}

export function trackPhases(trackId: string): PhaseView[] {
  const t = TRACK_BY_ID[trackId]
  if (!t) return []
  return PHASE_ORDER.flatMap((phase) => {
    const all = t.steps.filter((s) => phaseOf(s.id) === phase)
    if (!all.length) return []
    const docs = new Map<string, { kind: string; required: boolean; when?: string; signed_by: string | null }>()
    for (const s of all) for (const k of s.documents_required) if (!NOT_A_DOC.has(k)) docs.set(k, { kind: k, required: true, signed_by: DOC_SIGNED_BY[k] ?? null })
    for (const s of all) for (const c of s.documents_conditional ?? []) if (!docs.has(c.kind)) docs.set(c.kind, { kind: c.kind, required: false, when: c.when, signed_by: DOC_SIGNED_BY[c.kind] ?? null })
    return [{ phase, steps: all.filter((s) => !isAutomation(s)), docs: [...docs.values()] }]
  })
}

/**
 * The track the plan's selection rules give. Storage added to an existing
 * system and historic distributors (kibbutz / moshav) are the office's call.
 */
export function suggestTrack(acKw: number | null, customerType: string): { id: string; why_he: string } {
  if (acKw === null || !(acKw > 0)) return { id: 'residential_le15', why_he: 'אין עדיין הספק מההצעה — ברירת מחדל, לבדוק' }
  const kw = `${Math.round(acKw * 10) / 10} kW`
  if (acKw > 630) return { id: 'mv_gt630', why_he: `${kw} — מעל 630 kW` }
  if (acKw > 100) return { id: 'commercial_100_630', why_he: `${kw} — 100–630 kW` }
  if (acKw > 15) return { id: 'commercial_15_100', why_he: `${kw} — 15–100 kW` }
  return customerType === 'business' ? { id: 'commercial_15_100', why_he: `${kw}, לקוח עסקי (לפי התוכנית: לאימות)` } : { id: 'residential_le15', why_he: `${kw}, לקוח פרטי` }
}

export interface SubmissionMark {
  /** YYYY-MM-DD. */
  date: string
  ref?: string
}

export interface SubmissionRecord {
  track: string
  steps: Record<string, SubmissionMark>
  docs: Record<string, SubmissionMark>
  /** Optional phases marked as not relevant for this job. */
  na: Phase[]
  updated_at: string
  updated_by: string
}

/**
 * Steps that are the same fact as a lifecycle milestone: ticking one marks
 * the other, so nothing is entered twice.
 */
export const STEP_MILESTONE: Record<string, MilestoneKey> = {
  'pre.05.submit_portal': 'iec_submitted',
  'pre.07.wait_distributor_answer': 'iec_approved',
  'hd.02.application_to_distributor': 'iec_submitted',
  'hd.05.distributor_answer': 'iec_approved',
  'insp.07.meter': 'meter_installed',
  'insp.08.operation_approval': 'grid_approved',
}

/** Steps whose reference is worth keeping (request number, receipt). */
export const STEP_REF_HE: Record<string, string> = {
  'pre.05.submit_portal': 'מספר בקשה',
  'pre.06.pay_fee': 'קבלה',
  'insp.03.order_inspection': 'מספר הזמנה',
  'insp.04.pay_inspection_fee': 'קבלה',
  'insp.07.meter': 'מספר מונה',
  'tar.02.submit_producers_portal': 'מספר פנייה',
  'op.03.submit_pua': 'מספר פנייה',
  'hd.02.application_to_distributor': 'מספר בקשה',
}

export interface Progress {
  steps: number
  stepsDone: number
  docs: number
  docsDone: number
  /** Required documents still missing, by name. */
  missingDocs: string[]
}

/** Progress over the phases that apply (required documents only). */
export function submissionProgress(rec: Pick<SubmissionRecord, 'track' | 'steps' | 'docs' | 'na'>): Progress {
  const out: Progress = { steps: 0, stepsDone: 0, docs: 0, docsDone: 0, missingDocs: [] }
  const counted = new Set<string>()
  for (const p of trackPhases(rec.track)) {
    if (rec.na.includes(p.phase)) continue
    out.steps += p.steps.length
    out.stepsDone += p.steps.filter((s) => rec.steps[s.id]).length
    for (const d of p.docs.filter((x) => x.required && !counted.has(x.kind))) {
      counted.add(d.kind)
      out.docs++
      if (rec.docs[d.kind]) out.docsDone++
      else out.missingDocs.push(DOC_NAME_HE[d.kind] ?? d.kind)
    }
  }
  return out
}
