/**
 * The job's submission file (src/submission.ts): which track, which steps are
 * done and which documents are in hand.
 *
 *   submission/<surveyId>.json   SubmissionRecord
 *
 * A step that is the same fact as a lifecycle milestone (submitted to the
 * IEC, its answer, the meter, the operation approval) marks the milestone
 * too, when the office has not marked it already.
 */
import { MILESTONE_REF_RE, type Milestones } from '../../src/stage'
import { DOC_NAME_HE, OPTIONAL_PHASES, PHASE_LABEL_HE, STEP_MILESTONE, TRACK_BY_ID, suggestTrack, trackPhases, type Phase, type SubmissionMark, type SubmissionRecord } from '../../src/submission'
import type { Env } from './env'
import { israelToday } from './http'
import type { EventKind } from './timeline'

const key = (id: string) => `submission/${id}.json`

export async function getSubmission(env: Env, id: string): Promise<SubmissionRecord | null> {
  const obj = await env.QUOTES.get(key(id))
  if (!obj) return null
  try {
    return JSON.parse(await obj.text()) as SubmissionRecord
  } catch {
    return null
  }
}

export interface SubmissionUpdate {
  track?: unknown
  steps?: unknown
  docs?: unknown
  na?: unknown
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

function mark(v: unknown, label: string, today: string): SubmissionMark | null | { error: string } {
  if (v === null) return null
  const { date, ref = '' } = (v ?? {}) as { date?: unknown; ref?: unknown }
  if (!isDay(date)) return { error: `${label}: תאריך לא תקין` }
  if (date > today) return { error: `${label}: התאריך עוד לא הגיע` }
  if (typeof ref !== 'string' || !MILESTONE_REF_RE.test(ref.trim())) return { error: `${label}: אסמכתא — ספרות ואותיות לועזיות בלבד, עד 24 תווים` }
  return { date, ...(ref.trim() ? { ref: ref.trim() } : {}) }
}

export interface ResolvedSubmission {
  row: SubmissionRecord
  /** Lines for the job's timeline. */
  events: { kind: EventKind; text_he: string }[]
  /** Milestones to mark because a matching step was ticked. */
  milestones: Milestones
}

/** A partial update merged into `prev`, or a Hebrew error. Writes nothing. */
export function resolveSubmission(prev: SubmissionRecord | null, u: SubmissionUpdate, by: string, suggested: string, now = new Date()): ResolvedSubmission | { error: string } {
  const today = israelToday(now)
  const next: SubmissionRecord = { track: suggested, steps: {}, docs: {}, na: [], ...(prev ?? {}), updated_at: now.toISOString(), updated_by: by }
  const events: ResolvedSubmission['events'] = []
  const milestones: Milestones = {}
  if (u.track !== undefined) {
    if (typeof u.track !== 'string' || !TRACK_BY_ID[u.track]) return { error: 'מסלול לא מוכר' }
    if (u.track !== next.track) {
      events.push({ kind: 'office', text_he: `מסלול הגשה: ${TRACK_BY_ID[u.track]!.name_he}` })
      next.track = u.track
    }
  }
  const phases = trackPhases(next.track)
  const stepName = new Map(phases.flatMap((p) => p.steps.map((s) => [s.id, s.name_he] as const)))
  if (u.steps !== undefined) {
    if (!u.steps || typeof u.steps !== 'object' || Array.isArray(u.steps)) return { error: 'שלבים: מבנה לא תקין' }
    next.steps = { ...next.steps }
    for (const [id, v] of Object.entries(u.steps as Record<string, unknown>)) {
      const name = stepName.get(id)
      if (!name) return { error: `שלב לא קיים במסלול הזה: ${id}` }
      const m = mark(v, name, today)
      if (m && 'error' in m) return m
      if (m === null) {
        if (next.steps[id]) events.push({ kind: 'office', text_he: `תיק הגשה — בוטל: ${name}` })
        delete next.steps[id]
        continue
      }
      if (!next.steps[id]) events.push({ kind: 'office', text_he: `תיק הגשה — ✓ ${name}${m.ref ? ` · ${m.ref}` : ''}` })
      next.steps[id] = m
      const ms = STEP_MILESTONE[id]
      if (ms) milestones[ms] = { date: m.date, ...(m.ref && ms === 'iec_submitted' ? { ref: m.ref } : {}) }
    }
  }
  if (u.docs !== undefined) {
    if (!u.docs || typeof u.docs !== 'object' || Array.isArray(u.docs)) return { error: 'מסמכים: מבנה לא תקין' }
    next.docs = { ...next.docs }
    for (const [kind, v] of Object.entries(u.docs as Record<string, unknown>)) {
      const name = DOC_NAME_HE[kind]
      if (!name) return { error: `מסמך לא מוכר: ${kind}` }
      const m = mark(v, name, today)
      if (m && 'error' in m) return m
      if (m === null) {
        if (next.docs[kind]) events.push({ kind: 'office', text_he: `מסמך סומן כחסר: ${name}` })
        delete next.docs[kind]
      } else {
        if (!next.docs[kind]) events.push({ kind: 'office', text_he: `מסמך התקבל: ${name}` })
        next.docs[kind] = m
      }
    }
  }
  if (u.na !== undefined) {
    if (!Array.isArray(u.na) || !u.na.every((p) => OPTIONAL_PHASES.has(p as Phase))) return { error: 'אפשר לסמן כלא רלוונטי רק רשות מקומית, כבאות והיתר הפעלה' }
    const na = [...new Set(u.na as Phase[])]
    for (const p of na) if (!next.na.includes(p)) events.push({ kind: 'office', text_he: `לא רלוונטי לעבודה: ${PHASE_LABEL_HE[p]}` })
    for (const p of next.na) if (!na.includes(p)) events.push({ kind: 'office', text_he: `חזר לתיק: ${PHASE_LABEL_HE[p]}` })
    next.na = na
  }
  return { row: next, events, milestones }
}

export async function putSubmission(env: Env, id: string, row: SubmissionRecord): Promise<void> {
  await env.QUOTES.put(key(id), JSON.stringify(row), { httpMetadata: { contentType: 'application/json' } })
}

/** The plan's track for this job: AC power from the newest quote, customer type from the survey. */
export function suggestFor(acKw: number | null, customerType: unknown) {
  return suggestTrack(acKw, customerType === 'business' ? 'business' : 'private')
}
