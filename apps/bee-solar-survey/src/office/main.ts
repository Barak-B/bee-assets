/**
 * Office screen (/office): every job in one place, for the people who are not
 * on the roof. Read-mostly — the field app stays the source of the survey,
 * quotes and reports; the office sets only its own status and note, and (as
 * admin) hands out and revokes personal keys.
 */
import '../style.css'
import './office.css'
import { formatIls } from '@bee/quote-core'
import { normalizePhone } from '../customer'
import { escapeAttr, escapeHtml } from '../html'
import { israelToday } from '../dates'
import {
  MILESTONES,
  OFFICE_STATUSES,
  OFFICE_STATUS_LABEL_HE,
  PLAN_STAGE,
  STAGES,
  STAGE_LABEL_HE,
  nextStepHe,
  skippedMilestones,
  stageMilestones,
  type MilestoneKey,
  type OfficeStatus,
  type Stage,
} from '../stage'
import type { OfficeUpdate } from './api'
import { Api, ApiError, type KeyRow, type Me, type OfficeJob } from './api'
import { attentionHe } from './attention'

const root = document.querySelector<HTMLDivElement>('#office')!
const STORE = 'bee-office-key'

type StatusFilter = OfficeStatus | 'all'

const state: {
  api: Api | null
  me: Me | null
  jobs: OfficeJob[]
  generatedAt: string
  tab: 'jobs' | 'keys'
  stage: Stage | 'any' | 'attention'
  status: StatusFilter
  search: string
  selected: string | null
  keys: KeyRow[]
  newKey: { key: string; row: KeyRow } | null
  /** People a job can be assigned to (active personal keys). */
  surveyors: { id: string; name: string; role: string }[]
  /** The "new job" form is open in the side panel. */
  creating: boolean
  loading: boolean
  error: string
} = { api: null, me: null, jobs: [], generatedAt: '', tab: 'jobs', stage: 'any', status: 'active', search: '', selected: null, keys: [], newKey: null, surveyors: [], creating: false, loading: false, error: '' }

const ROLE_HE: Record<KeyRow['role'], string> = { surveyor: 'סוקר', office: 'משרד', admin: 'מנהל' }

function readStoredKey(): string {
  try {
    return localStorage.getItem(STORE) ?? ''
  } catch {
    return ''
  }
}

function storeKey(k: string | null) {
  try {
    if (k) localStorage.setItem(STORE, k)
    else localStorage.removeItem(STORE)
  } catch {
    /* private mode: the key lasts for this page only */
  }
}

const fmtDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
}

/** YYYY-MM-DD → dd.mm.yy, without a time zone shift. */
const fmtDay = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}` : d)
const ils = (n: number | null | undefined) => `<bdi dir="ltr">${escapeHtml(formatIls(n ?? null))}</bdi>`
const officeStatus = (j: OfficeJob): OfficeStatus => j.office?.status ?? 'active'

function toast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  window.setTimeout(() => el.classList.remove('show'), 2600)
}

// ── Data ───────────────────────────────────────────────────────────────

async function login(key: string) {
  const api = new Api(key)
  try {
    state.me = await api.me()
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : 'הכניסה נכשלה'
    state.api = null
    render()
    return
  }
  if (state.me.role === 'surveyor') {
    state.error = `המפתח של ${state.me.name} הוא מפתח סוקר — מסך המשרד דורש מפתח משרד או מנהל`
    state.me = null
    render()
    return
  }
  state.api = api
  state.error = ''
  storeKey(key)
  await load()
}

async function load() {
  if (!state.api) return
  state.loading = true
  render()
  try {
    const [r, people] = await Promise.all([state.api.overview(), state.api.surveyors().catch(() => ({ surveyors: [] }))])
    state.jobs = r.jobs
    state.surveyors = people.surveyors
    state.generatedAt = r.generated_at
    state.error = ''
    if (state.me?.role === 'admin' && state.tab === 'keys') state.keys = (await state.api.keys()).keys
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : 'הטעינה נכשלה'
    if (err instanceof ApiError && err.status === 401) logout()
  } finally {
    state.loading = false
    render()
  }
}

function logout() {
  storeKey(null)
  state.api = null
  state.me = null
  state.jobs = []
  state.selected = null
}

// ── Filters ────────────────────────────────────────────────────────────

function matches(j: OfficeJob): boolean {
  if (state.status !== 'all' && officeStatus(j) !== state.status) return false
  if (state.stage === 'attention' && !attentionHe(j)) return false
  if (state.stage !== 'any' && state.stage !== 'attention' && j.stage !== state.stage) return false
  const q = state.search.trim().toLowerCase()
  if (!q) return true
  const phoneQ = normalizePhone(q)
  if (phoneQ && normalizePhone(j.customerPhone) === phoneQ) return true
  return [j.projectName, j.customerName, j.customerPhone, j.customerEmail, j.address, j.surveyor, j.office?.assigned_to_name ?? '', j.latestQuote?.quote_number ?? ''].join(' ').toLowerCase().includes(q)
}

// ── Render ─────────────────────────────────────────────────────────────

function render() {
  if (!state.api || !state.me) {
    root.innerHTML = loginView()
    return
  }
  root.innerHTML = `
    <header class="topbar">
      <div class="brand"><div class="brand-mark">BEE</div><div class="brand-text"><strong>משרד · עבודות</strong><span>${escapeHtml(state.me.name)} · ${escapeHtml(state.me.role_he)}</span></div></div>
      <nav class="o-tabs">
        <button class="o-tab ${state.tab === 'jobs' ? 'on' : ''}" data-tab="jobs">עבודות</button>
        ${state.me.role === 'admin' ? `<button class="o-tab ${state.tab === 'keys' ? 'on' : ''}" data-tab="keys">מפתחות</button>` : ''}
        <button class="o-tab" id="oRefresh">${state.loading ? 'טוען…' : 'רענון'}</button>
        <button class="o-tab" id="oLogout">יציאה</button>
      </nav>
    </header>
    <main class="o-main">
      ${state.error ? `<div class="note note-warn">${escapeHtml(state.error)}</div>` : ''}
      ${state.tab === 'keys' ? keysView() : jobsView()}
    </main>
    ${state.creating ? newJobView() : state.selected ? drawerView() : ''}
    <div class="toast" id="toast"></div>`
}

function loginView(): string {
  return `
    <main class="o-login">
      <div class="o-card">
        <h1>B.E.E · מסך משרד</h1>
        <p class="meta">כניסה עם מפתח משרד או מנהל. המפתח נשמר בדפדפן הזה בלבד.</p>
        <form id="oLogin">
          <input class="search" id="oKey" type="password" autocomplete="current-password" placeholder="מפתח" dir="ltr" required />
          <button class="btn btn-primary btn-block" type="submit">כניסה</button>
        </form>
        ${state.error ? `<div class="note note-warn">${escapeHtml(state.error)}</div>` : ''}
      </div>
    </main>`
}

function jobsView(): string {
  const now = new Date()
  const active = state.jobs.filter((j) => officeStatus(j) === 'active')
  const byStage = (s: Stage) => active.filter((j) => j.stage === s)
  const waiting = byStage('sent')
  const monthAgo = now.getTime() - 30 * 86_400_000
  const acceptedRecent = state.jobs.flatMap((j) => j.links.filter((l) => l.accepted && Date.parse(l.accepted.accepted_at) >= monthAgo))
  const attention = active.filter((j) => attentionHe(j, now))
  const rows = state.jobs.filter(matches)
  return `
    <section class="o-kpis">
      <div class="o-kpi"><div class="o-kpi-v">${active.length}</div><div class="o-kpi-l">עבודות פעילות</div></div>
      <div class="o-kpi"><div class="o-kpi-v">${waiting.length}</div><div class="o-kpi-l">ממתינות לאישור · ${ils(waiting.reduce((s, j) => s + (j.latestQuote?.total_incl_vat_ils ?? 0), 0))}</div></div>
      <div class="o-kpi"><div class="o-kpi-v">${acceptedRecent.length}</div><div class="o-kpi-l">אושרו ב-30 יום · ${ils(acceptedRecent.reduce((s, l) => s + (l.accepted?.total_incl_vat_ils ?? 0), 0))}</div></div>
      <button class="o-kpi o-kpi-warn ${state.stage === 'attention' ? 'on' : ''}" data-stage="attention"><div class="o-kpi-v">${attention.length}</div><div class="o-kpi-l">דורשות טיפול</div></button>
    </section>
    <section class="o-pipe" aria-label="שלבים">
      <button class="o-step ${state.stage === 'any' ? 'on' : ''}" data-stage="any"><span>הכול</span><b>${active.length}</b></button>
      ${STAGES.map((s) => `<button class="o-step stage-${s} ${state.stage === s ? 'on' : ''} ${byStage(s).length ? '' : 'zero'}" data-stage="${s}" title="${PLAN_STAGE[s]}"><span>${STAGE_LABEL_HE[s]}</span><b>${byStage(s).length}</b></button>`).join('')}
    </section>
    <section class="o-filters">
      <button class="btn btn-primary" id="oNewJob">+ עבודה חדשה</button>
      <input class="search" id="oSearch" placeholder="חיפוש: שם, לקוח, טלפון, כתובת, מספר הצעה" value="${escapeAttr(state.search)}" />
      <select id="oStatus" aria-label="סטטוס משרד">
        ${OFFICE_STATUSES.map((s) => `<option value="${s}" ${state.status === s ? 'selected' : ''}>${OFFICE_STATUS_LABEL_HE[s]}</option>`).join('')}
        <option value="all" ${state.status === 'all' ? 'selected' : ''}>כל הסטטוסים</option>
      </select>
    </section>
    ${
      rows.length
        ? `<div class="o-table-wrap"><table class="o-table">
        <thead><tr><th>פרויקט · לקוח</th><th>שלב</th><th>הצעה אחרונה</th><th>קישור ללקוח</th><th>דוחות</th><th>סוקר</th><th>פעילות אחרונה</th></tr></thead>
        <tbody>${rows.map((j) => jobRow(j, now)).join('')}</tbody>
      </table></div>`
        : `<div class="empty">${state.jobs.length ? 'אין עבודות שמתאימות לסינון.' : 'עדיין לא הגיעו סקרים מהשטח. הם מופיעים כאן אחרי הסנכרון הראשון מהטלפון.'}</div>`
    }
    <p class="meta o-foot">עודכן ${escapeHtml(fmtDate(state.generatedAt, true))} · השלב נקבע לפי מה שקרה בפועל: הצעה, קישור, אישור, דוחות, ואבני הדרך שהמשרד מסמן בפרטי העבודה (הסכם, חח״י, ציוד, בודק, מונה, מסירה).</p>`
}

/** Who surveys / surveyed it. For a job the office opened, the sender is the office — not a surveyor. */
function surveyorOf(j: OfficeJob): string {
  return j.office?.assigned_to_name || j.surveyor || (j.stage === 'lead' ? '' : j.receivedBy) || '—'
}

/** The next step, with what the office already arranged for a new job. */
function nextLine(j: OfficeJob): string {
  const o = j.office
  if (j.stage === 'lead' && o?.assigned_to_id) return o.planned_date ? `סקר ב-${fmtDay(o.planned_date)} · ${o.assigned_to_name}` : `לקבוע מועד סקר עם ${o.assigned_to_name}`
  return nextStepHe(j.stage, j.milestones ?? {})
}

const MS_STAGES = STAGES.filter((s) => stageMilestones(s).length)

/** Where the job is on S01–S12, and the milestones the office marks. */
function lifecyclePart(j: OfficeJob): string {
  const at = STAGES.indexOf(j.stage)
  const ms = j.milestones ?? {}
  const skipped = skippedMilestones(j.stage, ms)
  const today = israelToday()
  const row = (key: MilestoneKey) => {
    const d = MILESTONES.find((m) => m.key === key)!
    const m = ms[key]
    if (m?.auto) return `<div class="o-ms-row auto"><span>✓ ${escapeHtml(d.label_he)}</span><span class="meta">${escapeHtml(fmtDay(m.date))} · ${escapeHtml(m.auto)}</span></div>`
    return `<div class="o-ms-row" data-ms="${d.key}">
        <label class="o-ms-check"><input type="checkbox" data-ms-on ${m ? 'checked' : ''} /> ${escapeHtml(d.label_he)}</label>
        <input type="date" data-ms-date max="${today}" value="${escapeAttr(m?.date ?? '')}" aria-label="${escapeAttr(`${d.label_he} — תאריך`)}" />
        ${d.ref_he ? `<input data-ms-ref dir="ltr" maxlength="24" placeholder="${escapeAttr(d.ref_he)}" value="${escapeAttr(m?.ref ?? '')}" aria-label="${escapeAttr(d.ref_he)}" />` : ''}
      </div>`
  }
  return `
        <section>
          <h3>מחזור חיים</h3>
          <ol class="o-life">${STAGES.map((s, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}" title="${PLAN_STAGE[s]}">${s === 'lead' ? 'ליד' : STAGE_LABEL_HE[s]}</li>`).join('')}</ol>
          ${skipped.length ? `<div class="note note-warn">העבודה התקדמה בלי לסמן: ${escapeHtml(skipped.map((d) => d.label_he).join(', '))}</div>` : ''}
          <div class="o-ms" id="oMs">
            ${MS_STAGES.map(
              (s) => `<details ${s === j.stage ? 'open' : ''}><summary>${STAGE_LABEL_HE[s]} <span class="meta">${stageMilestones(s).filter((d) => ms[d.key]).length}/${stageMilestones(s).length}</span></summary>
              ${stageMilestones(s)
                .map((d) => row(d.key))
                .join('')}</details>`,
            ).join('')}
          </div>
          <button class="btn btn-primary" id="oSaveMs">שמור אבני דרך</button>
        </section>`
}

/** What changed in the milestone form, as an update (null clears). */
function readMilestones(j: OfficeJob): { update: OfficeUpdate['milestones']; error?: string } {
  const update: NonNullable<OfficeUpdate['milestones']> = {}
  for (const el of document.querySelectorAll<HTMLElement>('#oMs [data-ms]')) {
    const key = el.dataset.ms as MilestoneKey
    const on = el.querySelector<HTMLInputElement>('[data-ms-on]')!.checked
    const date = el.querySelector<HTMLInputElement>('[data-ms-date]')!.value
    const ref = el.querySelector<HTMLInputElement>('[data-ms-ref]')?.value.trim() ?? ''
    const prev = j.office?.milestones?.[key]
    if (!on) {
      if (prev) update[key] = null
      continue
    }
    if (!date) return { update, error: `${MILESTONES.find((m) => m.key === key)!.label_he}: חסר תאריך` }
    if (!prev || prev.date !== date || (prev.ref ?? '') !== ref) update[key] = { date, ref }
  }
  return { update }
}

function linkCell(j: OfficeJob): string {
  const accepted = j.links.find((l) => l.accepted)
  if (accepted?.accepted) return `<span class="badge badge-ok">✓ אושר ${escapeHtml(fmtDate(accepted.accepted.accepted_at))}</span>`
  const live = j.links.find((l) => !l.revoked_at)
  if (!live) return j.links.length ? '<span class="meta">בוטל</span>' : '<span class="meta">—</span>'
  return live.views ? `נפתח ${live.views}× · ${escapeHtml(fmtDate(live.last_viewed_at))}` : `<span class="badge badge-warn">טרם נפתח</span>`
}

function jobRow(j: OfficeJob, now: Date): string {
  const att = attentionHe(j, now)
  const st = officeStatus(j)
  const phone = normalizePhone(j.customerPhone)
  return `
    <tr data-job="${escapeAttr(j.id)}" class="${state.selected === j.id ? 'sel' : ''}">
      <td data-label="פרויקט · לקוח">
        <div class="o-name">${escapeHtml(j.projectName || 'ללא שם')}</div>
        <div class="meta">${escapeHtml(j.customerName || 'אין שם לקוח')}${phone ? ` · <a dir="ltr" href="tel:${escapeAttr(phone)}" data-stop>${escapeHtml(j.customerPhone)}</a>` : ''} · ${escapeHtml(j.address)}</div>
      </td>
      <td data-label="שלב">
        <span class="badge stage-chip stage-${j.stage}">${STAGE_LABEL_HE[j.stage]}</span>
        ${st !== 'active' ? `<span class="badge stage-chip stage-office">${OFFICE_STATUS_LABEL_HE[st]}</span>` : ''}
        <div class="meta">${att ? `<span class="o-att">⚠ ${escapeHtml(att)}</span>` : escapeHtml(nextLine(j))}</div>
      </td>
      <td data-label="הצעה אחרונה" ${j.latestQuote ? '' : 'data-empty'}>${j.latestQuote ? `<bdi dir="ltr">v${j.latestQuote.version_no}</bdi> · ${ils(j.latestQuote.total_incl_vat_ils)}${j.latestQuote.dc_kwp ? ` · <bdi dir="ltr">${j.latestQuote.dc_kwp} kWp</bdi>` : ''}${j.latestQuote.needs_owner_input ? ' <span class="badge badge-warn">לאימות</span>' : ''}` : '<span class="meta">—</span>'}</td>
      <td data-label="קישור ללקוח" ${j.links.length ? '' : 'data-empty'}>${linkCell(j)}</td>
      <td data-label="דוחות" ${j.reports.length ? '' : 'data-empty'}>${j.reports.length ? `${j.reports.length}${j.reports.some((r) => r.outcomeTone === 'fail') ? ' <span class="badge badge-fail">כשל</span>' : ''}` : '<span class="meta">—</span>'}</td>
      <td data-label="סוקר">${escapeHtml(surveyorOf(j))}${j.stage === 'lead' && j.office?.planned_date ? `<div class="meta">📅 ${escapeHtml(fmtDay(j.office.planned_date))}</div>` : ''}</td>
      <td data-label="פעילות אחרונה">${escapeHtml(fmtDate(j.lastActivityAt, true))}</td>
    </tr>`
}

function drawerView(): string {
  const j = state.jobs.find((x) => x.id === state.selected)
  if (!j) return ''
  const st = officeStatus(j)
  const phone = normalizePhone(j.customerPhone)
  return `
    <aside class="o-drawer" role="dialog" aria-modal="false" aria-labelledby="oDrawerTitle">
      <header class="dialog-head"><h2 id="oDrawerTitle">${escapeHtml(j.projectName || 'ללא שם')}</h2><button class="icon-btn" id="oClose">סגור</button></header>
      <div class="o-drawer-body">
        <section>
          <h3>לקוח</h3>
          <div>${escapeHtml(j.customerName || 'אין שם לקוח בסקר')}</div>
          <div class="meta">
            ${phone ? `<a dir="ltr" href="tel:${escapeAttr(phone)}">${escapeHtml(j.customerPhone)}</a> · <a href="https://wa.me/972${escapeAttr(phone.slice(1))}" target="_blank" rel="noopener">וואטסאפ</a>` : 'אין טלפון'}
            ${j.customerEmail ? ` · <a dir="ltr" href="mailto:${escapeAttr(j.customerEmail)}">${escapeHtml(j.customerEmail)}</a>` : ''}
          </div>
          <div class="meta">${escapeHtml(j.address)}</div>
        </section>
        <section>
          <h3>שלב: ${STAGE_LABEL_HE[j.stage]}</h3>
          <div class="meta">${escapeHtml(attentionHe(j) ?? nextLine(j))}</div>
          <div class="o-status">
            <label>סטטוס משרד
              <select id="oSetStatus">${OFFICE_STATUSES.map((s) => `<option value="${s}" ${st === s ? 'selected' : ''}>${OFFICE_STATUS_LABEL_HE[s]}</option>`).join('')}</select>
            </label>
            <label>הערה<input id="oNote" maxlength="200" value="${escapeAttr(j.office?.note ?? '')}" /></label>
            <label>סוקר${surveyorSelect('oAssign', j.office?.assigned_to_id ?? '')}</label>
            <label ${j.stage === 'lead' ? '' : 'hidden'}>מועד סקר<input id="oPlanned" type="date" value="${escapeAttr(j.office?.planned_date ?? '')}" /></label>
            <button class="btn btn-primary" id="oSave">שמור</button>
          </div>
          ${j.office ? `<div class="meta">עודכן ע״י ${escapeHtml(j.office.updated_by)} · ${escapeHtml(fmtDate(j.office.updated_at, true))}</div>` : ''}
        </section>
        ${lifecyclePart(j)}
        <section>
          <h3>הצעות וקישורים</h3>
          ${j.latestQuote ? `<div>גרסה אחרונה: <bdi dir="ltr">${escapeHtml(j.latestQuote.quote_number)} v${j.latestQuote.version_no}</bdi> · ${ils(j.latestQuote.total_incl_vat_ils)} · ${escapeHtml(fmtDate(j.latestQuote.created_at))}</div>` : '<div class="meta">אין עדיין הצעה.</div>'}
          ${
            j.links.length
              ? `<ul class="o-list">${j.links
                  .map(
                    (l) => `<li>
                <bdi dir="ltr">v${l.version_no}</bdi> · פורסם ${escapeHtml(fmtDate(l.published_at, true))}${l.published_by ? ` ע״י ${escapeHtml(l.published_by)}` : ''}
                ${l.revoked_at ? ` · <span class="meta">בוטל ${escapeHtml(fmtDate(l.revoked_at))}</span>` : ` · <a href="/q/${escapeAttr(l.token)}" target="_blank" rel="noopener">דף הלקוח</a> · <a href="/q/${escapeAttr(l.token)}/pdf" target="_blank" rel="noopener">PDF</a>`}
                <div class="meta">${l.views ? `נפתח ${l.views} פעמים, לאחרונה ${escapeHtml(fmtDate(l.last_viewed_at, true))}` : 'טרם נפתח'}</div>
                ${l.accepted ? `<div class="badge badge-ok">✓ ${escapeHtml(l.accepted.name)} אישר/ה ${escapeHtml(fmtDate(l.accepted.accepted_at, true))} · ${ils(l.accepted.total_incl_vat_ils)}${l.accepted.id_verified ? ' · ת״ז אומתה' : ' · ת״ז לא נבדקה'}</div>` : ''}
              </li>`,
                  )
                  .join('')}</ul>`
              : ''
          }
        </section>
        <section>
          <h3>דוחות שטח</h3>
          ${
            j.reports.length
              ? `<ul class="o-list">${j.reports
                  .map(
                    (r) => `<li>${escapeHtml(r.title_he || r.templateKey)}${r.revision > 1 ? ` · גרסה ${r.revision}` : ''} · ${r.status === 'final' ? 'נעול' : 'טיוטה'} · ${escapeHtml(fmtDate(r.updatedAt))}
                ${r.outcomeLabel ? `<span class="badge ${r.outcomeTone === 'ok' ? 'badge-ok' : r.outcomeTone === 'fail' ? 'badge-fail' : 'badge-warn'}">${escapeHtml(r.outcomeLabel)}</span>` : ''}</li>`,
                  )
                  .join('')}</ul>`
              : '<div class="meta">אין דוחות.</div>'
          }
        </section>
        <section>
          <h3>סקר</h3>
          <div class="meta">סוקר: ${escapeHtml(j.surveyor || '—')} · שלמות ${j.score}% · ${j.photoCount} תמונות · התקבל ${escapeHtml(fmtDate(j.receivedAt, true))}${j.receivedBy ? ` מ${escapeHtml(j.receivedBy)}` : ''}</div>
          <div id="oSurvey" class="meta">טוען פרטי סקר…</div>
          <div id="oPhotos" class="o-photos"></div>
        </section>
      </div>
    </aside>`
}

function surveyorSelect(id: string, selected: string): string {
  const known = state.surveyors.some((p) => p.id === selected)
  return `<select id="${id}">
    <option value="">— לא שובץ —</option>
    ${state.surveyors.map((p) => `<option value="${escapeAttr(p.id)}" ${p.id === selected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
    ${selected && !known ? `<option value="${escapeAttr(selected)}" selected>(מפתח שבוטל)</option>` : ''}
  </select>`
}

function newJobView(): string {
  return `
    <aside class="o-drawer" role="dialog" aria-modal="false" aria-labelledby="oNewTitle">
      <header class="dialog-head"><h2 id="oNewTitle">עבודה חדשה</h2><button class="icon-btn" id="oClose">סגור</button></header>
      <form class="o-drawer-body o-form" id="oJobForm">
        <p class="meta">שיחה מלקוח או ליד מהאתר. העבודה תופיע בטלפון של הסוקר שמשובץ, בסנכרון הבא שלו.</p>
        <label>שם הלקוח *<input name="customerName" required maxlength="80" autocomplete="off" /></label>
        <label>טלפון *<input name="customerPhone" required type="tel" dir="ltr" maxlength="30" autocomplete="off" /></label>
        <label>מייל<input name="customerEmail" type="email" dir="ltr" maxlength="80" autocomplete="off" /></label>
        <label>כתובת *<input name="address" required maxlength="160" autocomplete="off" /></label>
        <label>שם הפרויקט<input name="projectName" maxlength="80" placeholder="ריק = שם הלקוח · העיר" autocomplete="off" /></label>
        <label>הערה לסוקר<textarea name="note" rows="3" maxlength="500" placeholder="למשל: גג רעפים, הלקוח זמין אחרי 16:00"></textarea></label>
        <label>סוקר${surveyorSelect('oNewAssign', '')}</label>
        <label>מועד סקר<input name="planned_date" type="date" /></label>
        ${state.surveyors.length ? '' : '<div class="note note-warn">אין עדיין סוקרים עם מפתח אישי — אפשר לפתוח את העבודה ולשבץ אחר כך.</div>'}
        <button class="btn btn-primary" type="submit">פתח עבודה</button>
      </form>
    </aside>`
}

function keysView(): string {
  return `
    <section class="o-card o-wide">
      <h2>מפתחות אישיים</h2>
      <p class="meta">מפתח לכל סוקר ולכל עובד משרד. טלפון אבד? מבטלים את המפתח שלו בלבד — כל השאר ממשיכים לעבוד. המפתח הראשי (PUBLISH_KEY) נשאר אצל ברק.</p>
      <form id="oNewKey" class="o-newkey">
        <input id="oKeyName" placeholder="שם (למשל: דני — סוקר)" required maxlength="40" />
        <select id="oKeyRole"><option value="surveyor">סוקר</option><option value="office">משרד</option><option value="admin">מנהל</option></select>
        <button class="btn btn-primary" type="submit">צור מפתח</button>
      </form>
      ${
        state.newKey
          ? `<div class="note note-ok">
        <div>המפתח של ${escapeHtml(state.newKey.row.name)} — <b>מוצג פעם אחת בלבד</b>. הדביקו אותו בטלפון שלו: מחירון → שרת החברה → מפתח.</div>
        <input class="pub-url" dir="ltr" readonly value="${escapeAttr(state.newKey.key)}" id="oNewKeyValue" />
        <button class="btn btn-secondary" id="oCopyKey">העתק</button>
      </div>`
          : ''
      }
      <table class="o-table">
        <thead><tr><th>שם</th><th>תפקיד</th><th>נוצר</th><th>סיומת</th><th></th></tr></thead>
        <tbody>${
          state.keys.length
            ? state.keys
                .map(
                  (k) => `<tr class="${k.revoked_at ? 'revoked' : ''}">
            <td>${escapeHtml(k.name)}</td><td>${ROLE_HE[k.role]}</td><td>${escapeHtml(fmtDate(k.created_at))} · ${escapeHtml(k.created_by)}</td><td dir="ltr">…${escapeHtml(k.hint)}</td>
            <td>${k.revoked_at ? `בוטל ${escapeHtml(fmtDate(k.revoked_at))}` : `<button class="btn btn-danger btn-sm" data-revoke="${escapeAttr(k.id)}">בטל</button>`}</td></tr>`,
                )
                .join('')
            : '<tr><td colspan="5" class="meta">אין עדיין מפתחות אישיים.</td></tr>'
        }</tbody>
      </table>
    </section>`
}

// ── Detail: survey fields and photos (loaded when the drawer opens) ────

const FIELD_HE: [string, string][] = [
  ['roofTypeHe', 'סוג גג'],
  ['usableAreaM2', 'שטח שימושי (מ״ר)'],
  ['targetKwp', 'יעד kWp'],
  ['annualConsumptionKwh', 'צריכה שנתית (kWh)'],
  ['mainBreaker', 'מפסק ראשי'],
  ['phases', 'פאזות'],
  ['inverterBrandPref', 'ממיר מועדף'],
  ['generalNotes', 'הערות'],
]

const photoUrls: string[] = []

/**
 * Save the office's row; with `reload`, refetch the job so the stage (derived
 * on the server from milestones and reports) is the server's.
 */
async function saveOffice(id: string, u: OfficeUpdate, reload = false) {
  try {
    const { office } = await state.api!.updateOffice(id, u)
    const job = state.jobs.find((j) => j.id === id)
    if (job) job.office = office
    if (reload) await load()
    else render()
    void loadDrawerDetails(id)
    toast('נשמר')
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'השמירה נכשלה')
  }
}

async function loadDrawerDetails(id: string) {
  if (!state.api) return
  for (const u of photoUrls.splice(0)) URL.revokeObjectURL(u)
  try {
    const { survey } = await state.api.survey(id)
    if (state.selected !== id) return
    const p = survey.project
    const el = document.getElementById('oSurvey')
    if (el) {
      el.innerHTML = FIELD_HE.filter(([k]) => p[k] !== undefined && p[k] !== '' && p[k] !== null)
        .map(([k, label]) => `<div><b><bdi>${escapeHtml(label)}</bdi>:</b> <bdi>${escapeHtml(String(p[k]))}</bdi></div>`)
        .join('') || 'אין פרטים נוספים.'
    }
    const host = document.getElementById('oPhotos')
    for (const ph of survey.photos.slice(0, 8)) {
      const url = await state.api.photoUrl(id, ph.key)
      if (!url || state.selected !== id) continue
      photoUrls.push(url)
      host?.insertAdjacentHTML('beforeend', `<a href="${escapeAttr(url)}" target="_blank" rel="noopener"><img src="${escapeAttr(url)}" alt="" /></a>`)
    }
  } catch {
    const el = document.getElementById('oSurvey')
    if (el) el.textContent = 'לא ניתן לטעון את פרטי הסקר.'
  }
}

// ── Events (delegated; the DOM is re-rendered on every change) ─────────

root.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement
  if (form.id === 'oLogin') {
    e.preventDefault()
    void login((document.getElementById('oKey') as HTMLInputElement).value.trim())
  } else if (form.id === 'oJobForm') {
    e.preventDefault()
    const f = new FormData(form)
    const v = (k: string) => String(f.get(k) ?? '').trim()
    const job = {
      customerName: v('customerName'),
      customerPhone: v('customerPhone'),
      customerEmail: v('customerEmail'),
      address: v('address'),
      projectName: v('projectName'),
      note: v('note'),
      assigned_to: (document.getElementById('oNewAssign') as HTMLSelectElement).value,
      planned_date: v('planned_date'),
    }
    void (async () => {
      try {
        const { id } = await state.api!.createJob(job)
        state.creating = false
        await load()
        state.selected = id
        state.status = 'active'
        render()
        void loadDrawerDetails(id)
        toast(job.assigned_to ? 'העבודה נפתחה ותופיע בטלפון של הסוקר' : 'העבודה נפתחה')
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'פתיחת העבודה נכשלה')
      }
    })()
  } else if (form.id === 'oNewKey') {
    e.preventDefault()
    const name = (document.getElementById('oKeyName') as HTMLInputElement).value
    const role = (document.getElementById('oKeyRole') as HTMLSelectElement).value as KeyRow['role']
    void (async () => {
      try {
        state.newKey = await state.api!.createKey(name, role)
        state.keys = (await state.api!.keys()).keys
        render()
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'יצירת המפתח נכשלה')
      }
    })()
  }
})

root.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (t.closest('[data-stop]')) return
  const tab = t.closest<HTMLElement>('[data-tab]')
  if (tab) {
    state.tab = tab.dataset.tab as 'jobs' | 'keys'
    state.selected = null
    state.newKey = null
    if (state.tab === 'keys') void state.api!.keys().then((r) => ((state.keys = r.keys), render()), (err) => toast(err.message))
    render()
    return
  }
  const stage = t.closest<HTMLElement>('[data-stage]')
  if (stage) {
    const v = stage.dataset.stage as Stage | 'any' | 'attention'
    state.stage = state.stage === v && v !== 'any' ? 'any' : v
    render()
    return
  }
  const row = t.closest<HTMLElement>('[data-job]')
  if (row) {
    state.selected = row.dataset.job!
    render()
    void loadDrawerDetails(state.selected)
    return
  }
  if (t.closest('#oNewJob')) {
    state.creating = true
    state.selected = null
    render()
    ;(document.querySelector('#oJobForm input') as HTMLInputElement | null)?.focus()
    return
  }
  if (t.closest('#oClose')) {
    state.creating = false
    state.selected = null
    render()
    return
  }
  if (t.closest('#oRefresh')) return void load()
  if (t.closest('#oLogout')) {
    logout()
    render()
    return
  }
  const msOn = t.closest<HTMLInputElement>('[data-ms-on]')
  if (msOn?.checked) {
    // Ticking a milestone means "today", unless a date is already there.
    const date = msOn.closest('[data-ms]')!.querySelector<HTMLInputElement>('[data-ms-date]')!
    if (!date.value) date.value = israelToday()
    return
  }
  if (t.closest('#oSave')) {
    const status = (document.getElementById('oSetStatus') as HTMLSelectElement).value as OfficeStatus
    const note = (document.getElementById('oNote') as HTMLInputElement).value
    const assigned_to = (document.getElementById('oAssign') as HTMLSelectElement).value
    const planned_date = (document.getElementById('oPlanned') as HTMLInputElement).value
    void saveOffice(state.selected!, { status, note, assigned_to, planned_date })
    return
  }
  if (t.closest('#oSaveMs')) {
    const job = state.jobs.find((j) => j.id === state.selected)
    if (!job) return
    const { update, error } = readMilestones(job)
    if (error) return toast(error)
    if (!Object.keys(update ?? {}).length) return toast('אין שינוי')
    void saveOffice(job.id, { milestones: update }, true)
    return
  }
  if (t.closest('#oCopyKey')) {
    const input = document.getElementById('oNewKeyValue') as HTMLInputElement
    void navigator.clipboard?.writeText(input.value).then(
      () => toast('המפתח הועתק'),
      () => (input.select(), toast('סמנו והעתיקו')),
    )
    return
  }
  const revoke = t.closest<HTMLElement>('[data-revoke]')
  if (revoke) {
    const k = state.keys.find((x) => x.id === revoke.dataset.revoke)
    if (!k || !confirm(`לבטל את המפתח של ${k.name}? הטלפון שלו יפסיק לגבות ולפרסם עד שיקבל מפתח חדש.`)) return
    void (async () => {
      try {
        await state.api!.revokeKey(k.id)
        state.keys = (await state.api!.keys()).keys
        render()
        toast('המפתח בוטל')
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'הביטול נכשל')
      }
    })()
  }
})

root.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement
  if (t.id === 'oSearch') {
    state.search = t.value
    const pos = t.selectionStart
    render()
    const again = document.getElementById('oSearch') as HTMLInputElement | null
    again?.focus()
    if (again && pos !== null) again.setSelectionRange(pos, pos)
  }
})

root.addEventListener('change', (e) => {
  const t = e.target as HTMLSelectElement
  if (t.id === 'oStatus') {
    state.status = t.value as StatusFilter
    render()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state.selected || state.creating)) {
    state.selected = null
    state.creating = false
    render()
  }
})

const saved = readStoredKey()
if (saved) void login(saved)
else render()
