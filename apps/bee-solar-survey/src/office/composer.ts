/**
 * "הודעה ללקוח" in the job drawer: pick a plan template, see it filled from
 * the job, fill what is missing, open it in WhatsApp / SMS / mail. The person
 * presses send there (Law #2); the opening is logged on the job.
 */
import { escapeAttr, escapeHtml } from '../html'
import { CHANNEL_HE, CUSTOMER_TEMPLATES, PLACEHOLDER_LABEL_HE, TEMPLATE_MILESTONE, TEMPLATE_TITLE_HE, channelUrl, contextFor, renderMessage, templatesFor, type Channel, type MessageJob, type MessageTemplate, type Sender } from '../messages'
import { MILESTONES, type MilestoneKey } from '../stage'
import { ApiError, type Api, type MessageEntry, type Me, type OfficeJob } from './api'

interface Draft {
  key: string
  values: Record<string, string>
  /** Typed over by hand: stop refilling it from the fields. */
  body: string | null
  subject: string | null
  /** Any field typed in by hand. */
  edited: boolean
  /** The person picked this template; otherwise it follows the job. */
  chosen: boolean
}

const drafts = new Map<string, Draft>()
const logs = new Map<string, MessageEntry[] | 'loading' | 'error'>()
const SENDER_KEY = 'bee-office-sender'
/** The company's phone (office screen loads it): the default for "our phone". */
let companyPhone = ''
export function setCompanyPhone(p: string) {
  companyPhone = p
}
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email']

function readSender(me: Me): Sender {
  try {
    const s = JSON.parse(localStorage.getItem(SENDER_KEY) ?? '{}') as Partial<Sender>
    return { name: s.name || me.name, phone: s.phone || companyPhone }
  } catch {
    return { name: me.name, phone: companyPhone }
  }
}

function saveSender(s: Sender) {
  try {
    localStorage.setItem(SENDER_KEY, JSON.stringify(s))
  } catch {
    /* private mode: typed again next time */
  }
}

export function messageJob(j: OfficeJob, origin: string): MessageJob {
  const live = j.links.find((l) => !l.revoked_at)
  return {
    id: j.id,
    stage: j.stage,
    customerName: j.customerName,
    customerPhone: j.customerPhone,
    customerEmail: j.customerEmail,
    address: j.address,
    milestones: j.milestones ?? {},
    surveyorName: j.office?.assigned_to_name || j.surveyor,
    plannedDate: j.office?.planned_date ?? '',
    latestQuote: j.latestQuote,
    link: live ? `${origin}/q/${live.token}` : '',
  }
}

/** The most useful template now: an update for a milestone just marked and not yet sent, else the stage's first. */
function defaultTemplate(j: OfficeJob, sent: MessageEntry[]): MessageTemplate {
  const done = new Set(sent.map((m) => m.template_key))
  const ms = j.milestones ?? {}
  // Newest first; on the same day, the one further along the lifecycle.
  const order = (m: MilestoneKey) => MILESTONES.findIndex((x) => x.key === m)
  const update = Object.entries(TEMPLATE_MILESTONE)
    .filter(([key, m]) => m && ms[m] && !done.has(key))
    .sort(([, a], [, b]) => (ms[b!]!.date ?? '').localeCompare(ms[a!]!.date ?? '') || order(b!) - order(a!))[0]?.[0]
  const { now, other } = templatesFor(j.stage)
  return CUSTOMER_TEMPLATES.find((t) => t.key === update) ?? now.find((t) => !done.has(t.key)) ?? now[0] ?? other[0]!
}

function draftFor(j: OfficeJob, me: Me, key?: string): Draft {
  const have = drafts.get(j.id)
  if (have?.edited && (!key || have.key === key)) return have
  const sent = logs.get(j.id)
  // Untouched: refill from the job as it is now (a milestone just marked, a new link).
  const pick = key ?? (have?.chosen ? have.key : undefined)
  const t = pick ? CUSTOMER_TEMPLATES.find((x) => x.key === pick)! : defaultTemplate(j, Array.isArray(sent) ? sent : [])
  const d: Draft = { key: t.key, values: contextFor(t, messageJob(j, location.origin), readSender(me)), body: null, subject: null, edited: false, chosen: !!pick }
  drafts.set(j.id, d)
  return d
}

const label = (p: string) => PLACEHOLDER_LABEL_HE[p] ?? p

function current(d: Draft) {
  const t = CUSTOMER_TEMPLATES.find((x) => x.key === d.key)!
  const r = renderMessage(t, d.values)
  const body = d.body ?? r.body
  const subject = d.subject ?? r.subject
  // Still missing = empty and its marker is still in the text (typing over the marker fills it too).
  const missing = r.missing.filter((k) => body.includes(`[${label(k)}]`) || subject.includes(`[${label(k)}]`))
  return { t, body, subject, missing }
}

export const composerSlot = () => '<section class="o-msg" id="oMsg"></section>'

/** A full refresh: read every log again next time. */
export function forgetComposerLogs() {
  logs.clear()
}

export function mountComposer(el: HTMLElement, j: OfficeJob, deps: { api: Api; me: Me; toast: (s: string) => void; onLogged?: () => void }) {
  if (!logs.has(j.id)) {
    logs.set(j.id, 'loading')
    deps.api.messages(j.id).then(
      (r) => {
        logs.set(j.id, r.messages)
        // The default depends on what was already sent; pick again unless the person started on one.
        if (!drafts.get(j.id)?.edited) drafts.delete(j.id)
        if (el.isConnected) mountComposer(el, j, deps)
      },
      () => {
        logs.set(j.id, 'error')
        if (el.isConnected) mountComposer(el, j, deps)
      },
    )
  }
  const d = draftFor(j, deps.me)
  const { t } = current(d)
  const { now, other } = templatesFor(j.stage)
  const opt = (x: MessageTemplate) => `<option value="${x.key}" ${x.key === d.key ? 'selected' : ''}>${escapeHtml(TEMPLATE_TITLE_HE[x.key] ?? x.key)}</option>`
  const log = logs.get(j.id)
  el.innerHTML = `
    <h3>הודעה ללקוח</h3>
    <label class="o-msg-pick">תבנית
      <select data-c-tpl>
        ${now.length ? `<optgroup label="מתאים לשלב">${now.map(opt).join('')}</optgroup>` : ''}
        <optgroup label="כל ההודעות">${other.map(opt).join('')}</optgroup>
      </select>
    </label>
    <div class="o-msg-fields">${t.placeholders
      .map((p) => `<label data-c-field="${p}">${escapeHtml(label(p))}<input data-c-ph="${p}" value="${escapeAttr(d.values[p] ?? '')}" ${/link|url/.test(p) ? 'dir="ltr"' : ''} /></label>`)
      .join('')}</div>
    ${t.subject ? `<label class="o-msg-text">נושא<input data-c-subject /></label>` : ''}
    <label class="o-msg-text">ההודעה<textarea data-c-body rows="6"></textarea></label>
    <div class="note note-warn" data-c-missing hidden></div>
    <div class="row o-msg-send">${CHANNELS.map((ch) => `<button class="btn ${ch === t.channel ? 'btn-primary' : 'btn-secondary'}" data-c-send="${ch}">${CHANNEL_HE[ch]}</button>`).join('')}</div>
    <p class="meta">נפתח אצלכם עם ההודעה מוכנה — אתם לוחצים שלח. הפתיחה נרשמת ביומן של העבודה.</p>
    <h4>הודעות שנפתחו</h4>
    ${
      log === 'loading'
        ? '<div class="meta">טוען…</div>'
        : log === 'error'
          ? '<div class="meta">היומן לא נטען.</div>'
          : log?.length
            ? `<ul class="o-list" data-c-log>${log.map(logItem).join('')}</ul>`
            : '<div class="meta">עדיין לא נפתחו הודעות.</div>'
    }`
  refresh(el, j, d)

  el.querySelector<HTMLSelectElement>('[data-c-tpl]')!.addEventListener('change', (e) => {
    drafts.delete(j.id)
    draftFor(j, deps.me, (e.target as HTMLSelectElement).value)
    mountComposer(el, j, deps)
  })
  // Assigned, not added: mounting again on the same element (after the log loads) must not double the handlers.
  el.oninput = (e) => {
    const t = e.target as HTMLElement
    d.edited = true
    if (t.matches('[data-c-ph]')) {
      const p = (t as HTMLInputElement).dataset.cPh!
      d.values[p] = (t as HTMLInputElement).value
      if (p === 'contact_name' || p === 'contact_phone') {
        const s = readSender(deps.me)
        saveSender({ ...s, [p === 'contact_name' ? 'name' : 'phone']: (t as HTMLInputElement).value })
      }
      refresh(el, j, d)
    } else if (t.matches('[data-c-body]')) {
      d.body = (t as HTMLTextAreaElement).value
      refresh(el, j, d, true)
    } else if (t.matches('[data-c-subject]')) {
      d.subject = (t as HTMLInputElement).value
      refresh(el, j, d, true)
    }
  }
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-c-send]')
    if (!b || b.disabled) return
    const ch = b.dataset.cSend as Channel
    const { body, subject } = current(d)
    const url = channelUrl(ch, { phone: j.customerPhone, email: j.customerEmail }, subject, body)
    if (!url) return
    // Open first, inside the click, so the browser does not block it.
    if (ch === 'whatsapp') window.open(url, '_blank', 'noopener')
    else {
      const a = document.createElement('a')
      a.href = url
      a.click()
    }
    const to = ch === 'email' ? j.customerEmail : j.customerPhone
    deps.api.logMessage(j.id, { template_key: d.key, channel: ch, to, subject: ch === 'email' ? subject : '', body }).then(
      ({ message }) => {
        const list = logs.get(j.id)
        logs.set(j.id, [message, ...(Array.isArray(list) ? list : [])])
        drafts.delete(j.id)
        if (el.isConnected) mountComposer(el, j, deps)
        deps.toast(`נפתח ב${CHANNEL_HE[ch]} · נרשם ביומן`)
        deps.onLogged?.()
      },
      (err) => deps.toast(`נפתח ב${CHANNEL_HE[ch]}, אבל הרישום ביומן נכשל${err instanceof ApiError ? `: ${err.message}` : ''}`),
    )
  }
}

/** Text, missing note and buttons — without touching what the person is typing in. */
function refresh(el: HTMLElement, j: OfficeJob, d: Draft, typing = false) {
  const { body, subject, missing } = current(d)
  const bodyEl = el.querySelector<HTMLTextAreaElement>('[data-c-body]')!
  const subjEl = el.querySelector<HTMLInputElement>('[data-c-subject]')
  if (!typing) {
    bodyEl.value = body
    if (subjEl) subjEl.value = subject
  }
  for (const f of el.querySelectorAll<HTMLElement>('[data-c-field]')) f.classList.toggle('miss', missing.includes(f.dataset.cField!))
  const note = el.querySelector<HTMLElement>('[data-c-missing]')!
  note.hidden = !missing.length
  note.textContent = missing.length ? `חסר: ${missing.map(label).join(', ')}` : ''
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-c-send]')) {
    const ch = b.dataset.cSend as Channel
    const reachable = !!channelUrl(ch, { phone: j.customerPhone, email: j.customerEmail }, '', 'x')
    b.disabled = !!missing.length || !reachable || !body.trim()
    b.title = !reachable ? (ch === 'email' ? 'אין מייל ללקוח' : ch === 'sms' ? 'אין מספר נייד ללקוח' : 'אין טלפון ללקוח') : missing.length ? 'יש שדות חסרים' : ''
  }
}

function logItem(m: MessageEntry): string {
  const when = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(m.at))
  return `<li><b>${escapeHtml(TEMPLATE_TITLE_HE[m.template_key] ?? m.template_key)}</b> · ${CHANNEL_HE[m.channel]} · ${escapeHtml(when)} · ${escapeHtml(m.by)}
    <details><summary class="meta">הטקסט</summary><div class="o-msg-sent">${escapeHtml(m.body)}</div></details></li>`
}
