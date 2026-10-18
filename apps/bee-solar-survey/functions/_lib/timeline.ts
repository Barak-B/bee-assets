/**
 * "What happened with this customer?" — every event on one job, newest
 * first, for the office drawer.
 *
 * Most of it is read from what is already stored (survey versions, quote
 * versions, customer links, views, the approval, field reports, messages).
 * What the office changes in place (status, note, assignment, survey date,
 * milestones) leaves no trace in the office row itself, so every change is
 * also appended here:
 *
 *   events/<surveyId>/<iso>_<rand>.json   { at, by, kind, text_he }
 */
import { TEMPLATE_TITLE_HE } from '../../src/messages'
import { MILESTONES, OFFICE_STATUS_LABEL_HE } from '../../src/stage'
import type { Env } from './env'
import { listMessages } from './messages'
import { EMPTY_OFFICE, listAll, officeLinks, reportsBySurvey, type OfficeStatusRow } from './office'
import { decodeMeta } from './surveys'

export type EventKind = 'office' | 'milestone' | 'survey' | 'quote' | 'link' | 'view' | 'accepted' | 'report' | 'message'

export interface TimelineEvent {
  at: string
  kind: EventKind
  text_he: string
  by: string
  tone?: 'ok' | 'warn'
}

const day = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d)

/** One line per field that changed, in the office's words. */
export function officeChanges(prev: OfficeStatusRow | null, next: OfficeStatusRow): { kind: EventKind; text_he: string }[] {
  const out: { kind: EventKind; text_he: string }[] = []
  const was: Omit<OfficeStatusRow, 'updated_at' | 'updated_by'> = prev ?? EMPTY_OFFICE
  if (was.status !== next.status) out.push({ kind: 'office', text_he: `סטטוס: ${OFFICE_STATUS_LABEL_HE[was.status]} ← ${OFFICE_STATUS_LABEL_HE[next.status]}` })
  if (was.note !== next.note) out.push({ kind: 'office', text_he: next.note ? `הערה: ${next.note}` : 'ההערה נמחקה' })
  if (was.assigned_to_id !== next.assigned_to_id) out.push({ kind: 'office', text_he: next.assigned_to_id ? `שובץ לסוקר: ${next.assigned_to_name}` : 'בוטל השיבוץ' })
  if (was.planned_date !== next.planned_date) out.push({ kind: 'office', text_he: next.planned_date ? `מועד סקר: ${day(next.planned_date)}` : 'מועד הסקר בוטל' })
  for (const d of MILESTONES) {
    const a = was.milestones?.[d.key]
    const b = next.milestones?.[d.key]
    if (!a && b) out.push({ kind: 'milestone', text_he: `✓ ${d.label_he} · ${day(b.date)}${b.ref ? ` · ${d.ref_he ?? 'אסמכתא'} ${b.ref}` : ''}` })
    else if (a && !b) out.push({ kind: 'milestone', text_he: `בוטל: ${d.label_he}` })
    else if (a && b && (a.date !== b.date || (a.ref ?? '') !== (b.ref ?? ''))) out.push({ kind: 'milestone', text_he: `עודכן: ${d.label_he} · ${day(b.date)}${b.ref ? ` · ${b.ref}` : ''}` })
  }
  return out
}

/** Append the office's changes to the job's event log. */
export async function logOfficeChanges(env: Env, id: string, prev: OfficeStatusRow | null, next: OfficeStatusRow, by: string, now = new Date(), extra: { kind: EventKind; text_he: string }[] = []): Promise<void> {
  await logEvents(env, id, [...extra, ...officeChanges(prev, next)], by, now)
}

/** Append lines to the job's event log, in the order given. */
export async function logEvents(env: Env, id: string, changes: { kind: EventKind; text_he: string }[], by: string, now = new Date()): Promise<void> {
  const at = now.toISOString()
  await Promise.all(
    changes.map((c, i) => {
      const rand = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('')
      // The index keeps the order of lines written in the same millisecond.
      return env.QUOTES.put(`events/${id}/${at}_${String(i).padStart(2, '0')}${rand}.json`, JSON.stringify({ at, by, ...c }), { httpMetadata: { contentType: 'application/json' } })
    }),
  )
}

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const obj = await env.QUOTES.get(key)
  if (!obj) return null
  try {
    return JSON.parse(await obj.text()) as T
  } catch {
    return null
  }
}

/** Everything that happened on the job, newest first. */
export async function buildTimeline(env: Env, id: string): Promise<TimelineEvent[]> {
  const [history, quotes, events, reportObjs, links, messages] = await Promise.all([
    listAll(env, `surveys/${id}/history/`),
    listAll(env, `surveys/${id}/quotes/`),
    listAll(env, `events/${id}/`),
    listAll(env, `report-index/${id}/`),
    officeLinks(env, id),
    listMessages(env, id, 100),
  ])
  const out: TimelineEvent[] = []

  history
    .sort((a, b) => a.key.localeCompare(b.key))
    .forEach((h, i) => {
      const m = decodeMeta(h.meta)
      // Older versions carry no metadata: the time is in the key (":" and "." were made "-").
      const t = /history\/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(h.key)
      const at = m.at || (t ? `${t[1]}:${t[2]}:${t[3]}.${t[4]}Z` : '')
      out.push({ at, kind: 'survey', text_he: i === 0 ? 'הסקר הגיע לשרת' : `הסקר עודכן (גרסה ${i + 1})`, by: m.by ?? '' })
    })

  const versions = await Promise.all(
    quotes
      .filter((q) => /\/v\d+\.json$/.test(q.key))
      .map(async (q) => ({ v: Number(/\/v(\d+)\.json$/.exec(q.key)![1]), q: await readJson<{ created_at?: string; quote_number?: string; totals?: { total_incl_vat_ils?: number | null } }>(env, q.key) })),
  )
  for (const { v, q } of versions) {
    if (!q?.created_at) continue
    const total = q.totals?.total_incl_vat_ils
    out.push({ at: q.created_at, kind: 'quote', text_he: `הצעת מחיר גרסה ${v}${typeof total === 'number' ? ` · ${Math.round(total).toLocaleString('en-US')} ₪` : ''}`, by: '' })
  }

  for (const l of links) {
    out.push({ at: l.published_at, kind: 'link', text_he: `קישור ללקוח פורסם (גרסה ${l.version_no})`, by: l.published_by })
    if (l.last_viewed_at) out.push({ at: l.last_viewed_at, kind: 'view', text_he: l.views > 1 ? `הלקוח פתח את ההצעה (${l.views} פעמים, האחרונה כאן)` : 'הלקוח פתח את ההצעה', by: '' })
    if (l.accepted) out.push({ at: l.accepted.accepted_at, kind: 'accepted', text_he: `${l.accepted.name} אישר/ה את ההצעה (גרסה ${l.version_no})${l.accepted.id_verified ? ' · ת״ז אומתה' : ''}`, by: '', tone: 'ok' })
    if (l.revoked_at) out.push({ at: l.revoked_at, kind: 'link', text_he: `הקישור (גרסה ${l.version_no}) בוטל`, by: '' })
  }

  for (const r of reportsBySurvey(reportObjs).get(id) ?? []) {
    const title = r.title_he || r.templateKey
    out.push({
      at: r.updatedAt,
      kind: 'report',
      text_he: r.status === 'final' ? `${title} ננעל${r.outcomeLabel ? ` · ${r.outcomeLabel}` : ''}` : `${title} (טיוטה)`,
      by: '',
      ...(r.outcomeTone === 'fail' ? { tone: 'warn' as const } : r.status === 'final' ? { tone: 'ok' as const } : {}),
    })
  }

  const logged = await Promise.all(events.map((e) => readJson<TimelineEvent>(env, e.key)))
  for (const e of logged) if (e?.at && e.text_he) out.push({ at: e.at, kind: e.kind, text_he: e.text_he, by: e.by ?? '' })

  for (const m of messages) {
    out.push({ at: m.at, kind: 'message', text_he: `הודעה ללקוח נפתחה ב${m.channel === 'email' ? 'מייל' : m.channel === 'sms' ? 'SMS' : 'וואטסאפ'}: ${TEMPLATE_TITLE_HE[m.template_key] ?? m.template_key}`, by: m.by })
  }

  // Same instant (several milestones in one save): the one written later is newer.
  return out
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.at)
    .sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i)
    .map(({ e }) => e)
}
