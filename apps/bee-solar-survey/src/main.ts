import './style.css'
import { registerSW } from 'virtual:pwa-register'
import {
  deletePhoto,
  deleteProject,
  exportBackup,
  getProject,
  countPhotos,
  getOfficeStatus,
  getPublication,
  getPublishSettings,
  getSurveyors,
  getSyncState,
  importBackup,
  listPhotos,
  listProjects,
  listQuotes,
  listReports,
  rememberSurveyor,
  savePhoto,
  saveProject,
  type StoredPhoto,
} from './db'
import { BackupError, parseBackup } from './backup'
import { customerWarnings, normalizePhone } from './customer'
import { countsHe } from './counts'
import { fmtDay, israelToday } from './dates'
import { OFFICE_STATUS_LABEL_HE, STAGE_LABEL_HE, deriveStage, isInstallationTemplate, type Stage } from './stage'
import { buildHiveExportBundle } from './hive'
import { revokeQuote, settingsProblem } from './publish'
import { fileToSurveyPhoto, getCurrentGps } from './photos'
import { escapeAttr, escapeHtml, safeImageSrc } from './html'
import { renderPricingScreen } from './pricingScreen'
import { openQuotesDialog } from './quotesDialog'
import { openReportsDialog, renderReportEditor } from './reports/ui'
import { outcomeToast, shareOrDownload, shareOrDownloadJson } from './share'
import { assessCompleteness, emptyProject, parseGps, sha256OfDataUrl } from './schema'
import { STATUS_LABEL, SyncError, isSyncConfigured, markDirty, restoreFromServer, statusOf, syncAll, type SyncStatus } from './sync'
import {
  BREAKER_OPTIONS,
  PHOTO_FIELD_LABELS,
  type CustomField,
  type PhotoFieldKey,
  type SiteSurveyProject,
} from './types'

type Screen = 'list' | 'form' | 'pricing' | 'report'

const app = document.querySelector<HTMLDivElement>('#app')!

let screen: Screen = 'list'
let editing: SiteSurveyProject = emptyProject()
let photos: StoredPhoto[] = []
let search = ''
let toastTimer = 0
let autoSaveTimer = 0
let drawTarget: StoredPhoto | null = null
let syncTimer = 0
/** Surveys waiting for the debounced background sync ('all' = every survey). */
let syncIds: Set<string> | 'all' = new Set()
let lastBgSyncError = ''
let reportId = ''

function toast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200)
}

function scheduleAutoSave() {
  window.clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(async () => {
    if (!editing.projectName.trim()) return
    await persistCurrent()
    const ind = document.getElementById('autosave')
    if (ind) {
      ind.textContent = 'נשמר אוטומטית ✓'
      ind.classList.remove('hidden')
    }
  }, 800)
}

async function persistCurrent() {
  const gpsParsed = parseGps(editing.gps)
  editing.lat = editing.lat ?? gpsParsed.lat
  editing.lon = editing.lon ?? gpsParsed.lon
  editing.updatedAt = new Date().toISOString()
  editing.hiveReady = assessCompleteness(editing, photos).readyForWave54
  await saveProject(editing)
  if (editing.surveyor) await rememberSurveyor(editing.surveyor)
  requestSync(4000, [editing.id])
}

/** Debounced background backup; quiet unless something actually failed. `ids` limits it to those surveys. */
function requestSync(delayMs = 4000, ids?: string[]) {
  if (!ids) syncIds = 'all'
  else if (syncIds !== 'all') for (const id of ids) syncIds.add(id)
  window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => void runSync(false), delayMs)
}

async function runSync(manual: boolean) {
  const ids = syncIds
  syncIds = new Set()
  if (!navigator.onLine && !manual) {
    if (ids !== 'all') for (const id of ids) requestSyncLater(id)
    return
  }
  if (!(await isSyncConfigured())) {
    if (manual) toast('לא הוגדר שרת גיבוי — מחירון → שרת החברה')
    return
  }
  try {
    // Manual: every survey, re-read in full. Background: the surveys asked for, trusting the change markers.
    const r = manual ? await syncAll(undefined, { deep: true }) : await syncAll(ids === 'all' ? undefined : [...ids])
    if (manual) {
      toast(
        r.offline
          ? 'אין חיבור — השינויים ממתינים בתור וישלחו כשהחיבור יחזור'
          : r.failed
            ? `גיבוי נכשל: ${r.errors[0]}`
            : r.synced
              ? `גובה לשרת: ${countsHe({ surveys: r.synced, photos: r.photos, quotes: r.quotes, reports: r.reports })}`
              : 'הכול כבר מגובה ✓',
      )
    } else if (r.failed && r.errors[0] !== lastBgSyncError) {
      // Background runs repeat; say each distinct failure once.
      toast(`גיבוי נכשל: ${r.errors[0]}`)
    }
    lastBgSyncError = r.failed ? (r.errors[0] ?? '') : ''
    if (r.assigned.length) {
      // New jobs from the office: show them now, then say so (re-render replaces the toast).
      if (screen === 'list') await render()
      toast(r.assigned.length === 1 ? `עבודה חדשה מהמשרד: ${r.assigned[0]}` : `${r.assigned.length} עבודות חדשות מהמשרד`)
    } else if (r.pricing) toast('המחירון עודכן מהמשרד')
  } catch (err) {
    if (manual) toast(err instanceof SyncError ? err.message : 'הגיבוי נכשל')
  }
  if (screen === 'list') {
    await refreshSyncChips()
    await refreshStageChips()
  }
}

/** Keep an offline survey in the queue for the next run (the 'online' event or the periodic retry). */
function requestSyncLater(id: string) {
  if (syncIds !== 'all') syncIds.add(id)
}

/** Where each job stands, from what this phone knows (quotes, links, approvals seen, reports, office status). */
async function localStage(id: string): Promise<{ stage: Stage; office: string; planned: string; plannedIso: string }> {
  const project = await getProject(id)
  const quotes = await listQuotes(id)
  const pubs = await Promise.all(quotes.map((q) => getPublication(q.id)))
  const reports = await listReports(id)
  const office = await getOfficeStatus(id)
  const finalAt = (key: string) => reports.find((r) => r.templateKey === key && r.status === 'final')?.finalizedAt ?? undefined
  const stage = deriveStage({
    surveyed: !!project?.hiveReady || (await countPhotos(id)) > 0,
    quoteVersions: quotes.length,
    liveLinks: pubs.filter((p) => p && !p.revokedAt).length,
    accepted: pubs.some((p) => !!p?.acceptedAt),
    installationReports: reports.filter((r) => isInstallationTemplate(r.templateKey)).length,
    handoverFinal: !!finalAt('handover'),
    handoverFinalAt: finalAt('handover'),
    installationChecklistFinalAt: finalAt('installation_checklist'),
    milestones: office?.milestones ?? {},
  })
  // A planned date matters only until the site is surveyed.
  const plannedIso = stage === 'lead' && office?.planned_date ? office.planned_date : ''
  const planned = plannedIso ? plannedIso.split('-').reverse().slice(0, 2).join('.') : ''
  return { stage, office: office && office.status !== 'active' ? OFFICE_STATUS_LABEL_HE[office.status] : '', planned, plannedIso }
}

async function refreshStageChips() {
  const counts: Partial<Record<Stage, number>> = {}
  const plannedDays: string[] = []
  for (const el of app.querySelectorAll<HTMLElement>('[data-stage-chip]')) {
    const { stage, office, planned, plannedIso } = await localStage(el.dataset.stageChip!)
    if (!office) counts[stage] = (counts[stage] ?? 0) + 1
    if (plannedIso) plannedDays.push(plannedIso)
    el.textContent = [STAGE_LABEL_HE[stage], planned && `📅 ${planned}`, office].filter(Boolean).join(' · ')
    el.className = `badge stage-chip stage-${stage}${office ? ' stage-office' : ''}`
    el.dataset.stage = stage
  }
  renderToday(counts, plannedDays)
}

/** The top of the list: what is waiting for this surveyor, instead of a banner. */
function renderToday(counts: Partial<Record<Stage, number>>, plannedDays: string[]) {
  const box = document.getElementById('todayBox')
  if (!box) return
  const today = israelToday()
  const upcoming = plannedDays.filter((d) => d >= today).sort()
  const items: string[] = []
  if (counts.lead) items.push(`<li><b>${counts.lead}</b> ממתינים לסקר${upcoming[0] ? ` · הקרוב ${escapeHtml(fmtDay(upcoming[0]))}${upcoming[0] === today ? ' (היום)' : ''}` : ''}</li>`)
  if (counts.survey) items.push(`<li><b>${counts.survey}</b> נסקרו ומחכים להצעה</li>`)
  if (counts.quote) items.push(`<li><b>${counts.quote}</b> הצעות שעוד לא נשלחו ללקוח</li>`)
  if (counts.sent) items.push(`<li><b>${counts.sent}</b> נשלחו ומחכים לאישור הלקוח</li>`)
  if (counts.accepted) items.push(`<li><b>${counts.accepted}</b> הלקוח אישר — הסכם ומקדמה</li>`)
  // After the contract the office drives the job; the phone shows where it is.
  const later = (['permits', 'procurement'] as Stage[]).reduce((n, st) => n + (counts[st] ?? 0), 0)
  if (later) items.push(`<li><b>${later}</b> בהכנה להתקנה (חח״י, תכנון, רכש)</li>`)
  if (counts.installation) items.push(`<li><b>${counts.installation}</b> בהתקנה</li>`)
  const closing = (['inspection', 'grid', 'handover'] as Stage[]).reduce((n, st) => n + (counts[st] ?? 0), 0)
  if (closing) items.push(`<li><b>${closing}</b> לקראת מסירה (בודק, מונה, מסירה)</li>`)
  box.innerHTML = items.length ? `<h2>מה מחכה לך</h2><ul>${items.join('')}</ul>` : '<h2>אין עבודות פתוחות</h2><p class="meta">סקר חדש — או סנכרון כדי לקבל עבודות מהמשרד.</p>'
}

async function refreshSyncChips() {
  const configured = await isSyncConfigured()
  const items = app.querySelectorAll<HTMLElement>('[data-sync-chip]')
  for (const el of items) {
    const id = el.dataset.syncChip!
    const p = await getProject(id)
    if (!p) continue
    const st: SyncStatus = statusOf(p, await getSyncState(id), configured)
    el.textContent = STATUS_LABEL[st]
    el.className = `badge sync-chip sync-${st}${st === 'off' ? ' hidden' : ''}`
    el.dataset.status = st
  }
}

function refreshCustomerWarnings() {
  const warn = document.getElementById('customerWarnings')
  if (warn) warn.innerHTML = customerWarnings(editing).map((w) => `<li>${escapeHtml(w)}</li>`).join('')
}

function readFormIntoEditing() {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? ''
  editing.projectName = g('f_projectName')
  editing.surveyDate = g('f_date')
  editing.surveyor = g('f_surveyor')
  editing.gps = g('f_gps')
  editing.address = g('f_address')
  editing.customerName = g('f_customerName').trim()
  editing.customerPhone = g('f_customerPhone').trim()
  editing.customerEmail = g('f_customerEmail').trim()
  editing.customerIdNumber = g('f_customerId').trim()
  editing.mainBreaker = g('f_mainBreaker')
  editing.phases = (['1', '3'].includes(g('f_phases')) ? g('f_phases') : '') as SiteSurveyProject['phases']
  editing.panelSpace = g('f_panelSpace') as SiteSurveyProject['panelSpace']
  editing.solarBreaker = g('f_solarBreaker')
  editing.meterNumber = g('f_meterNumber')
  editing.meterType = g('f_meterType') as SiteSurveyProject['meterType']
  editing.meterLocation = g('f_meterLocation')
  editing.cableLengthM = g('f_cableLength')
  editing.cableNotes = g('f_cableNotes')
  editing.roofTypeHe = g('f_roofType') as SiteSurveyProject['roofTypeHe']
  editing.inverterLocation = g('f_inverterLocation')
  editing.usableAreaM2 = g('f_usableArea')
  editing.azimuthDeg = g('f_azimuth')
  editing.tiltDeg = g('f_tilt')
  editing.annualConsumptionKwh = g('f_consumption')
  editing.targetKwp = g('f_targetKwp')
  editing.budgetIls = g('f_budget')
  editing.inverterBrandPref = g('f_inverterBrand') as SiteSurveyProject['inverterBrandPref']
  editing.includeBattery = (document.getElementById('f_battery') as HTMLInputElement | null)?.checked ?? false
  editing.customerType = g('f_customerType') === 'business' ? 'business' : 'private'
  editing.generalNotes = g('f_generalNotes')
}

function options(list: readonly string[], selected: string): string {
  return [`<option value="">בחר...</option>`, ...list.map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`)].join('')
}

function photoBlock(field: PhotoFieldKey, required = false): string {
  const list = photos.filter((p) => p.field === field)
  return `
    <div class="photo-block" data-field="${field}">
      <h3>${PHOTO_FIELD_LABELS[field]}${required ? ' <span class="req">*</span>' : ''} <span class="meta">(${list.length}/10)</span></h3>
      <div class="photo-actions">
        <button type="button" class="btn btn-secondary" data-action="camera" data-field="${field}">מצלמה</button>
        <button type="button" class="btn btn-secondary" data-action="gallery" data-field="${field}">גלריה</button>
      </div>
      <div class="thumbs">
        ${list
          .map(
            (p) => `
          <div class="thumb" data-photo="${escapeAttr(p.id)}">
            <img src="${safeImageSrc(p.dataUrl)}" alt="" />
            <button type="button" title="מחק" data-action="del-photo" data-id="${escapeAttr(p.id)}">×</button>
          </div>`,
          )
          .join('')}
      </div>
    </div>`
}

function completenessBox(): string {
  const c = assessCompleteness(editing, photos)
  return `
    <div class="completeness">
      <strong>מוכנות כוורת → Wave 54: ${c.readyForWave54 ? 'מוכן' : 'חסר'} · ציון ${c.score}</strong>
      <div class="score-bar"><span style="width:${c.score}%"></span></div>
      ${
        c.missingRequired.length
          ? `<div>חובה: <ul>${c.missingRequired.map((x) => `<li>${x}</li>`).join('')}</ul></div>`
          : '<div>כל שדות החובה מלאים.</div>'
      }
      ${
        c.missingRecommended.length
          ? `<div>מומלץ: <ul>${c.missingRecommended.map((x) => `<li>${x}</li>`).join('')}</ul></div>`
          : ''
      }
      ${c.warnings.map((w) => `<div class="meta">${w}</div>`).join('')}
    </div>`
}

async function render() {
  if (screen === 'list') {
    const projects = await listProjects()
    const filtered = projects.filter((p) => {
      const q = search.trim()
      if (!q) return true
      const phoneQ = normalizePhone(q)
      if (phoneQ && normalizePhone(p.customerPhone ?? '') === phoneQ) return true
      return [p.projectName, p.address, p.surveyor, p.customerName ?? '', p.customerPhone ?? '', p.customerEmail ?? ''].join(' ').toLowerCase().includes(q.toLowerCase())
    })

    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">BEE</div>
          <div class="brand-text">
            <strong>ברק הנדסת חשמל</strong>
            <span>Hive Collect · סקר אתר</span>
          </div>
        </div>
      </header>
      <main class="shell">
        <section class="today" id="todayBox" aria-live="polite"></section>
        <button class="btn btn-primary btn-block" id="btnNew">+ סקר חדש</button>
        <div class="row">
          <button class="btn btn-secondary" id="btnSync">סנכרן לשרת</button>
          <button class="btn btn-secondary" id="btnPricing">מחירון והגדרות</button>
        </div>
        <details class="tools">
          <summary>גיבוי ושחזור</summary>
          <div class="row">
            <button class="btn btn-secondary" id="btnRestoreServer">שחזור מהשרת (טלפון חדש)</button>
            <button class="btn btn-secondary" id="btnBackup">גיבוי לקובץ</button>
            <button class="btn btn-secondary" id="btnRestore">שחזור מקובץ</button>
          </div>
        </details>
        <input class="search" id="search" placeholder="חיפוש פרויקט..." value="${escapeAttr(search)}" />
        <div class="project-list">
          ${
            filtered.length === 0
              ? `<div class="empty">אין סקרים עדיין. התחל בסקר חדש מהשטח.</div>`
              : filtered
                  .map(
                    (p, i) => `
            <article class="project-item" style="animation-delay:${i * 40}ms" data-open="${escapeAttr(p.id)}">
              <h3>${escapeHtml(p.projectName || 'ללא שם')}</h3>
              <div class="meta">
                <span>${escapeHtml(fmtDay(p.surveyDate))}</span>
                <span>${escapeHtml(p.surveyor || '')}</span>
                <span>${escapeHtml(p.address || '')}</span>
                ${p.customerName ? `<span>👤 ${escapeHtml(p.customerName)}</span>` : ''}
                ${p.customerPhone && normalizePhone(p.customerPhone) ? `<a class="tel" dir="ltr" href="tel:${escapeAttr(normalizePhone(p.customerPhone))}" data-stop>${escapeHtml(p.customerPhone)}</a>` : ''}
                <span class="badge ${p.hiveReady ? 'badge-ok' : 'badge-warn'}">${p.hiveReady ? 'סקר מלא' : 'סקר חסר'}</span>
                <span class="badge stage-chip hidden" data-stage-chip="${escapeAttr(p.id)}"></span>
                <span class="badge sync-chip hidden" data-sync-chip="${escapeAttr(p.id)}"></span>
              </div>
              <div class="item-actions">
                <button class="btn btn-secondary" data-edit="${escapeAttr(p.id)}">סקר</button>
                <button class="btn btn-secondary" data-quote="${escapeAttr(p.id)}">הצעות מחיר</button>
                <button class="btn btn-secondary" data-reports="${escapeAttr(p.id)}">דוחות שטח</button>
                <button class="btn btn-secondary" data-pdf="${escapeAttr(p.id)}">PDF סקר</button>
              </div>
              <details class="more" data-stop>
                <summary>עוד</summary>
                <div class="item-actions">
                  <button class="btn btn-secondary" data-hive="${escapeAttr(p.id)}">ייצוא לכוורת (JSON)</button>
                  <button class="btn btn-danger" data-del="${escapeAttr(p.id)}">מחק סקר</button>
                </div>
              </details>
            </article>`,
                  )
                  .join('')
          }
        </div>
      </main>
      <div class="toast" id="toast"></div>`

    document.getElementById('btnNew')?.addEventListener('click', () => {
      editing = emptyProject()
      photos = []
      screen = 'form'
      void render()
    })
    document.getElementById('search')?.addEventListener('input', (e) => {
      search = (e.target as HTMLInputElement).value
      void render()
    })
    document.getElementById('btnPricing')?.addEventListener('click', () => {
      screen = 'pricing'
      void render()
    })
    document.getElementById('btnSync')?.addEventListener('click', () => void runSync(true))
    document.getElementById('btnRestoreServer')?.addEventListener('click', async () => {
      try {
        toast('מושך סקרים מהשרת...')
        const r = await restoreFromServer()
        await render() // re-render first: it replaces the toast element
        toast(r.restored ? `שוחזר מהשרת: ${countsHe({ surveys: r.restored, photos: r.photos, quotes: r.quotes, reports: r.reports })}` : `אין סקרים חדשים בשרת${r.skipped ? ` (${r.skipped} כבר במכשיר)` : ''}`)
      } catch (err) {
        toast(err instanceof SyncError ? err.message : 'השחזור נכשל')
      }
    })
    void refreshSyncChips()
    void refreshStageChips()
    document.getElementById('btnBackup')?.addEventListener('click', async () => {
      try {
        const data = await exportBackup()
        // Compact: photos are inline base64, and indentation only adds size.
        const outcome = await shareOrDownloadJson(`bee-survey-backup-${new Date().toISOString().slice(0, 10)}.json`, data, 'גיבוי סקרים B.E.E', false)
        toast(outcomeToast(outcome, 'הגיבוי'))
      } catch {
        toast('הגיבוי לקובץ נכשל — ייתכן שהוא גדול מדי למכשיר; השתמש ב"סנכרן לשרת"')
      }
    })
    document.getElementById('btnRestore')?.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        try {
          let raw: unknown
          try {
            raw = JSON.parse(await file.text())
          } catch {
            throw new BackupError('הקובץ אינו קובץ JSON תקין')
          }
          const r = await importBackup(parseBackup(raw))
          await render() // re-render first: it replaces the toast element
          toast(
            `נוספו ${r.added} סקרים · עודכנו ${r.updated}` +
              (r.skipped ? ` · ${r.skipped} נשארו כמו במכשיר (חדשים יותר)` : '') +
              (r.pricing ? ' · המחירון עודכן' : ''),
          )
          requestSync(1000)
        } catch (err) {
          toast(err instanceof BackupError ? err.message : 'השחזור מהקובץ נכשל')
        }
      }
      input.click()
    })

    app.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = (btn as HTMLElement).dataset.edit!
        await openEditor(id)
      }),
    )
    app.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = (btn as HTMLElement).dataset.del!
        // Customer links of this survey's quotes: once the survey is gone the app
        // no longer knows their tokens, so they are taken down first.
        const live: string[] = []
        for (const q of await listQuotes(id)) {
          const pub = await getPublication(q.id)
          if (pub && !pub.revokedAt) live.push(pub.token)
        }
        const msg = live.length
          ? `לסקר יש ${live.length} קישורים פעילים ללקוח. המחיקה תבטל אותם — הלקוח לא יוכל לפתוח את ההצעה. הגיבוי בשרת נשמר. למחוק?`
          : 'למחוק את הסקר מהמכשיר? (הגיבוי בשרת, אם יש, נשמר)'
        if (!confirm(msg)) return
        if (live.length) {
          const settings = await getPublishSettings()
          try {
            if (settingsProblem(settings) || !settings) throw new Error('no settings')
            for (const token of live) await revokeQuote(token, settings)
          } catch {
            toast('לא ניתן לבטל את הקישורים ללקוח כרגע — הסקר לא נמחק. נסה שוב כשיש חיבור')
            return
          }
        }
        await deleteProject(id)
        toast('נמחק')
        void render()
      }),
    )
    app.querySelectorAll('[data-hive]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await exportHiveFor((btn as HTMLElement).dataset.hive!)
      }),
    )
    app.querySelectorAll('[data-pdf]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await exportPdfFor((btn as HTMLElement).dataset.pdf!)
      }),
    )
    app.querySelectorAll('[data-reports]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await openReportsDialog((btn as HTMLElement).dataset.reports!, reportsCtx)
      }),
    )
    app.querySelectorAll('[data-quote]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await openQuotesDialog((btn as HTMLElement).dataset.quote!, quotesCtx)
      }),
    )
    // A tap on the customer's phone dials; it must not also open the survey.
    app.querySelectorAll('[data-stop]').forEach((el) => el.addEventListener('click', (e) => e.stopPropagation()))
    app.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', async () => {
        await openEditor((el as HTMLElement).dataset.open!)
      }),
    )
    return
  }

  if (screen === 'report') {
    await renderReportEditor(reportId, {
      app,
      toast,
      openReport: reportsCtx.openReport,
      onBack: () => {
        screen = 'list'
        void render()
      },
    })
    return
  }

  if (screen === 'pricing') {
    await renderPricingScreen({
      app,
      toast,
      onBack: () => {
        screen = 'list'
        void render()
      },
    })
    return
  }

  if (screen === 'form') {
    const surveyors = await getSurveyors()
    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">BEE</div>
          <div class="brand-text">
            <strong>סקר אתר</strong>
            <span id="autosave" class="hidden">נשמר אוטומטית ✓</span>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" id="btnBack">חזרה</button>
        </div>
      </header>
      <main class="shell">
        ${completenessBox()}

        <section class="section">
          <h2>פרטים כלליים</h2>
          <p class="hint">Collect — קלט שטח בסיסי</p>
          <div class="field"><label>שם הפרויקט <span class="req">*</span></label><input id="f_projectName" value="${escapeAttr(editing.projectName)}" /></div>
          <div class="grid-2">
            <div class="field"><label>תאריך בדיקה</label><input type="date" id="f_date" value="${escapeAttr(editing.surveyDate)}" /></div>
            <div class="field"><label>שם הסוקר</label><input id="f_surveyor" list="surveyorsList" value="${escapeAttr(editing.surveyor)}" /><datalist id="surveyorsList">${surveyors.map((s) => `<option value="${escapeAttr(s)}"></option>`).join('')}</datalist></div>
          </div>
          <div class="field"><label>כתובת <span class="req">*</span></label><input id="f_address" value="${escapeAttr(editing.address)}" /></div>
          <div class="field"><label>GPS</label><div class="gps-row"><input id="f_gps" dir="ltr" inputmode="decimal" value="${escapeAttr(editing.gps)}" placeholder="31.77, 35.21" /><button type="button" class="btn btn-secondary" id="btnGps">GPS</button></div></div>
        </section>

        <section class="section">
          <h2>לקוח</h2>
          <p class="hint">למי ההצעה, ואיך שולחים לו את הקישור. אפשר להשלים גם אחרי הסקר.</p>
          <div class="field"><label>שם הלקוח</label><input id="f_customerName" autocomplete="off" value="${escapeAttr(editing.customerName ?? '')}" /></div>
          <div class="grid-2">
            <div class="field"><label>טלפון</label><input id="f_customerPhone" type="tel" inputmode="tel" dir="ltr" autocomplete="off" value="${escapeAttr(editing.customerPhone ?? '')}" placeholder="050-0000000" /></div>
            <div class="field"><label>מייל</label><input id="f_customerEmail" type="email" inputmode="email" dir="ltr" autocomplete="off" value="${escapeAttr(editing.customerEmail ?? '')}" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>ת״ז / ח״פ</label><input id="f_customerId" inputmode="numeric" dir="ltr" autocomplete="off" value="${escapeAttr(editing.customerIdNumber ?? '')}" /><p class="hint">לא מופיע בדף הלקוח. 4 הספרות האחרונות נבדקות כשהלקוח מאשר אונליין.</p></div>
            <div class="field"><label>סוג לקוח</label><select id="f_customerType"><option value="private" ${editing.customerType !== 'business' ? 'selected' : ''}>פרטי (מחירים כולל מע״מ)</option><option value="business" ${editing.customerType === 'business' ? 'selected' : ''}>עסקי (לפני מע״מ)</option></select></div>
          </div>
          <ul class="warn-list" id="customerWarnings">${customerWarnings(editing).map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
        </section>

        <section class="section">
          <h2>חשמל ומונים</h2>
          <p class="hint">קלט הנדסי ל־protection / wire_sizing</p>
          <div class="grid-2">
            <div class="field"><label>מפסק ראשי במתקן</label><select id="f_mainBreaker">${options(BREAKER_OPTIONS, editing.mainBreaker)}</select></div>
            <div class="field"><label>פאזות</label><select id="f_phases"><option value="" ${!editing.phases ? 'selected' : ''}>לא ידוע</option><option value="1" ${editing.phases === '1' ? 'selected' : ''}>חד-פאזי</option><option value="3" ${editing.phases === '3' ? 'selected' : ''}>תלת-פאזי</option></select></div>
            <div class="field"><label>מקום בלוח למפסק סולארי</label><select id="f_panelSpace">${options(['כן', 'לא', 'דורש בדיקה'], editing.panelSpace)}</select></div>
            <div class="field"><label>מפסק ראשי סולארי</label><select id="f_solarBreaker">${options(BREAKER_OPTIONS, editing.solarBreaker)}</select></div>
            <div class="field"><label>סוג מונה סולארי</label><select id="f_meterType">${options(['ישיר', 'ארון מניה'], editing.meterType)}</select></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>מספר מונה</label><input id="f_meterNumber" value="${escapeAttr(editing.meterNumber)}" /></div>
            <div class="field"><label>מיקום מונה</label><input id="f_meterLocation" value="${escapeAttr(editing.meterLocation)}" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>אורך כבל AC משוער (מ׳)</label><input id="f_cableLength" inputmode="decimal" value="${escapeAttr(editing.cableLengthM)}" /></div>
            <div class="field"><label>מיקום קיר ממירים</label><input id="f_inverterLocation" value="${escapeAttr(editing.inverterLocation)}" /></div>
          </div>
          <div class="field"><label>תוואי כבילה — הערות</label><textarea id="f_cableNotes">${escapeHtml(editing.cableNotes)}</textarea></div>
          ${photoBlock('electricalPanel', true)}
          ${photoBlock('busbars')}
          ${photoBlock('cableRoute')}
        </section>

        <section class="section">
          <h2>גג · גיאומטריה · יעד (Wave 54)</h2>
          <p class="hint">שדות DesignSuiteReq.site / target</p>
          <div class="field"><label>סוג גג <span class="req">*</span></label><select id="f_roofType">${options(['בטון', 'רעפים', 'פנל מבודד', 'איסכורית', 'קרקע', 'אחר'], editing.roofTypeHe)}</select></div>
          <div class="grid-2">
            <div class="field"><label>שטח שימושי (מ״ר)</label><input id="f_usableArea" inputmode="decimal" value="${escapeAttr(editing.usableAreaM2)}" /></div>
            <div class="field"><label>אזימוט (180=דרום)</label><input id="f_azimuth" inputmode="decimal" value="${escapeAttr(editing.azimuthDeg)}" /></div>
            <div class="field"><label>שיפוע (°)</label><input id="f_tilt" inputmode="decimal" value="${escapeAttr(editing.tiltDeg)}" /></div>
            <div class="field"><label>צריכה שנתית kWh</label><input id="f_consumption" inputmode="decimal" value="${escapeAttr(editing.annualConsumptionKwh)}" /></div>
            <div class="field"><label>יעד kWp</label><input id="f_targetKwp" inputmode="decimal" value="${escapeAttr(editing.targetKwp)}" /></div>
            <div class="field"><label>תקציב ₪</label><input id="f_budget" inputmode="decimal" value="${escapeAttr(editing.budgetIls)}" /></div>
          </div>
          <div class="field"><label>העדפת ממיר (צי B.E.E)</label><select id="f_inverterBrand">${options(['Deye', 'Sungrow', 'SolarEdge', 'KStar', 'ABB'], editing.inverterBrandPref)}</select></div>
          <label class="checkbox-row"><input type="checkbox" id="f_battery" ${editing.includeBattery ? 'checked' : ''}/> לכלול סוללה בתכנון</label>
          ${photoBlock('roof', true)}
          ${photoBlock('siteOverview')}
          ${photoBlock('inverterLocation')}
          ${photoBlock('craneAccess')}
        </section>

        <section class="section">
          <h2>הערות</h2>
          <div class="field"><label>הערות כלליות</label><textarea id="f_generalNotes">${escapeHtml(editing.generalNotes)}</textarea></div>
          <div id="customFields"></div>
          <button type="button" class="btn btn-ghost" id="btnAddCustom">+ הוסף שדה</button>
        </section>
      </main>
      <div class="sticky-actions">
        <button class="btn btn-secondary" id="btnCancel">ביטול</button>
        <button class="btn btn-secondary" id="btnHive">ייצוא כוורת</button>
        <button class="btn btn-secondary" id="btnQuote">הצעות מחיר</button>
        <button class="btn btn-secondary" id="btnReports">דוחות שטח</button>
        <button class="btn btn-primary" id="btnSave">שמור סקר</button>
      </div>
      <div class="toast" id="toast"></div>
      <div id="drawHost"></div>`

    bindFormEvents()
    renderCustomFields()
    return
  }
}

function renderCustomFields() {
  const host = document.getElementById('customFields')
  if (!host) return
  host.innerHTML = editing.customFields
    .map(
      (f, idx) => `
    <div class="grid-2" data-cf="${escapeAttr(f.id)}">
      <div class="field"><label>תווית</label><input data-cf-label="${idx}" value="${escapeAttr(f.label)}" /></div>
      <div class="field"><label>ערך</label><div class="gps-row"><input data-cf-value="${idx}" value="${escapeAttr(f.value)}" /><button type="button" class="btn btn-danger" data-cf-del="${idx}">×</button></div></div>
    </div>`,
    )
    .join('')

  host.querySelectorAll('[data-cf-label]').forEach((el) =>
    el.addEventListener('input', () => {
      const i = Number((el as HTMLElement).dataset.cfLabel)
      editing.customFields[i]!.label = (el as HTMLInputElement).value
      scheduleAutoSave()
    }),
  )
  host.querySelectorAll('[data-cf-value]').forEach((el) =>
    el.addEventListener('input', () => {
      const i = Number((el as HTMLElement).dataset.cfValue)
      editing.customFields[i]!.value = (el as HTMLInputElement).value
      scheduleAutoSave()
    }),
  )
  host.querySelectorAll('[data-cf-del]').forEach((el) =>
    el.addEventListener('click', () => {
      const i = Number((el as HTMLElement).dataset.cfDel)
      editing.customFields.splice(i, 1)
      renderCustomFields()
      scheduleAutoSave()
    }),
  )
}

function bindFormEvents() {
  document.getElementById('btnBack')?.addEventListener('click', async () => {
    readFormIntoEditing()
    if (editing.projectName.trim()) await persistCurrent()
    screen = 'list'
    void render()
  })
  document.getElementById('btnCancel')?.addEventListener('click', () => {
    screen = 'list'
    void render()
  })
  document.getElementById('btnSave')?.addEventListener('click', async () => {
    readFormIntoEditing()
    if (!editing.projectName.trim()) {
      toast('חובה שם פרויקט')
      return
    }
    await persistCurrent()
    toast('הסקר נשמר')
    screen = 'list'
    void render()
  })
  document.getElementById('btnHive')?.addEventListener('click', async () => {
    readFormIntoEditing()
    await persistCurrent()
    const bundle = buildHiveExportBundle(editing, photos)
    const outcome = await shareOrDownloadJson(`hive-site-survey-${editing.id.slice(0, 8)}.json`, bundle, 'ייצוא כוורת')
    toast(`${outcomeToast(outcome, 'ייצוא הכוורת')} · ${bundle.jobs.length === 3 ? 'מלא' : 'חלקי — חסרים שדות'}`)
  })
  document.getElementById('btnReports')?.addEventListener('click', async () => {
    readFormIntoEditing()
    if (!editing.projectName.trim()) {
      toast('יש למלא שם פרויקט לפני דוחות')
      return
    }
    await persistCurrent()
    await openReportsDialog(editing.id, reportsCtx)
  })
  document.getElementById('btnQuote')?.addEventListener('click', async () => {
    readFormIntoEditing()
    if (!editing.projectName.trim()) {
      toast('חובה שם פרויקט')
      return
    }
    await persistCurrent()
    await openQuotesDialog(editing.id, quotesCtx)
  })
  document.getElementById('btnGps')?.addEventListener('click', async () => {
    try {
      const g = await getCurrentGps()
      editing.gps = g.gps
      editing.lat = g.lat
      editing.lon = g.lon
      const input = document.getElementById('f_gps') as HTMLInputElement
      input.value = g.gps
      toast('GPS נקלט')
      scheduleAutoSave()
    } catch {
      toast('לא הצלחתי לקבל GPS')
    }
  })
  document.getElementById('btnAddCustom')?.addEventListener('click', () => {
    const field: CustomField = {
      id: crypto.randomUUID(),
      section: 'notes',
      label: '',
      value: '',
    }
    editing.customFields.push(field)
    renderCustomFields()
  })

  app.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('change', () => {
      readFormIntoEditing()
      scheduleAutoSave()
      // refresh completeness without full remount of photos handlers complexity — soft update
      const box = app.querySelector('.completeness')
      if (box) box.outerHTML = completenessBox()
      refreshCustomerWarnings()
    })
    el.addEventListener('input', () => {
      readFormIntoEditing()
      scheduleAutoSave()
      if ((el as HTMLElement).id.startsWith('f_customer')) refreshCustomerWarnings()
    })
  })

  app.querySelectorAll('[data-action="camera"], [data-action="gallery"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = (btn as HTMLElement).dataset.field as PhotoFieldKey
      const camera = (btn as HTMLElement).dataset.action === 'camera'
      pickFiles(field, camera)
    })
  })

  app.querySelectorAll('[data-action="del-photo"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = (btn as HTMLElement).dataset.id!
      await deletePhoto(id)
      photos = photos.filter((p) => p.id !== id)
      readFormIntoEditing()
      await persistCurrent()
      await render()
    })
  })

  app.querySelectorAll('.thumb img').forEach((img) => {
    img.addEventListener('click', () => {
      const id = (img.closest('.thumb') as HTMLElement).dataset.photo!
      const ph = photos.find((p) => p.id === id)
      if (ph) openDrawEditor(ph)
    })
  })
}

function pickFiles(field: PhotoFieldKey, camera: boolean) {
  const existing = photos.filter((p) => p.field === field).length
  if (existing >= 10) {
    toast('מקסימום 10 תמונות לשדה')
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = !camera
  if (camera) input.setAttribute('capture', 'environment')
  input.onchange = async () => {
    const files = [...(input.files ?? [])].slice(0, 10 - existing)
    for (const file of files) {
      const base = await fileToSurveyPhoto(file, field)
      const stored: StoredPhoto = { ...base, projectId: editing.id }
      await savePhoto(stored)
      photos.push(stored)
    }
    readFormIntoEditing()
    await persistCurrent()
    await render()
    toast('תמונות נוספו')
  }
  input.click()
}

function openDrawEditor(photo: StoredPhoto) {
  drawTarget = photo
  const host = document.getElementById('drawHost')
  if (!host) return
  host.innerHTML = `
    <div class="draw-modal">
      <div class="draw-toolbar">
        <button type="button" data-tool="pen" class="active">קו</button>
        <button type="button" data-tool="text">טקסט</button>
        <button type="button" id="drawUndo">בטל</button>
        <button type="button" id="drawClear">נקה</button>
        <button type="button" id="drawClose">סגור</button>
        <button type="button" id="drawSave">שמור</button>
      </div>
      <div class="draw-canvas-wrap"><canvas id="drawCanvas"></canvas></div>
    </div>`

  const canvas = document.getElementById('drawCanvas') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const img = new Image()
  const history: ImageData[] = []
  let tool: 'pen' | 'text' = 'pen'
  let drawing = false

  img.onload = () => {
    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  }
  img.src = photo.dataUrl

  host.querySelectorAll('[data-tool]').forEach((b) =>
    b.addEventListener('click', () => {
      host.querySelectorAll('[data-tool]').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      tool = (b as HTMLElement).dataset.tool as 'pen' | 'text'
    }),
  )

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e)
    if (tool === 'text') {
      const t = prompt('טקסט לסימון')
      if (!t) return
      ctx.fillStyle = '#f0c14b'
      ctx.font = `${Math.max(24, canvas.width * 0.03)}px Heebo, Arial`
      ctx.fillText(t, p.x, p.y)
      history.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
      return
    }
    drawing = true
    ctx.strokeStyle = '#f0c14b'
    ctx.lineWidth = Math.max(3, canvas.width * 0.004)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  })
  canvas.addEventListener('pointerup', () => {
    if (!drawing) return
    drawing = false
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  })

  document.getElementById('drawUndo')?.addEventListener('click', () => {
    if (history.length <= 1) return
    history.pop()
    ctx.putImageData(history[history.length - 1]!, 0, 0)
  })
  document.getElementById('drawClear')?.addEventListener('click', () => {
    if (!history.length) return
    ctx.putImageData(history[0]!, 0, 0)
    history.length = 1
  })
  document.getElementById('drawClose')?.addEventListener('click', () => {
    host.innerHTML = ''
    drawTarget = null
  })
  document.getElementById('drawSave')?.addEventListener('click', async () => {
    if (!drawTarget) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    drawTarget.dataUrl = dataUrl
    drawTarget.annotated = true
    drawTarget.mimeType = 'image/jpeg'
    // The pixels changed — the fingerprint used by the hive export and server sync must too.
    drawTarget.sha256 = await sha256OfDataUrl(dataUrl)
    await savePhoto(drawTarget)
    host.innerHTML = ''
    drawTarget = null
    await markDirty(editing.id)
    requestSync()
    toast('סימון נשמר')
    await render()
  })
}

async function openEditor(id: string) {
  const p = await getProject(id)
  if (!p) return
  editing = p
  photos = await listPhotos(id)
  screen = 'form'
  await render()
}

async function exportHiveFor(id: string) {
  const p = await getProject(id)
  if (!p) return
  const ph = await listPhotos(id)
  const bundle = buildHiveExportBundle(p, ph)
  const outcome = await shareOrDownloadJson(`hive-site-survey-${id.slice(0, 8)}.json`, bundle, 'ייצוא כוורת')
  toast(`${outcomeToast(outcome, 'ייצוא הכוורת')} · ${bundle.jobs.some((j) => j.loop === 'dispatch.draft') ? 'מלא' : 'חלקי'}`)
}

async function exportPdfFor(id: string) {
  const p = await getProject(id)
  if (!p) return
  const ph = await listPhotos(id)
  const c = assessCompleteness(p, ph)
  toast('מכין PDF...')
  try {
    // Lazy: jsPDF + embedded Hebrew font are only loaded when a report is requested.
    const { buildSurveyPdfDetailed, surveyPdfFilename } = await import('./pdf')
    const res = await buildSurveyPdfDetailed(p, ph, c)
    const outcome = await shareOrDownload(res.blob, surveyPdfFilename(p), `סקר אתר — ${p.projectName}`)
    toast(`${outcomeToast(outcome, 'הדוח')} · ${res.meta.pages} עמ׳ · ${Math.round(res.meta.bytes / 1024)} KB`)
  } catch (err) {
    console.error(err)
    toast('יצירת ה-PDF נכשלה')
  }
}

const reportsCtx = {
  toast,
  openReport: async (id: string) => {
    reportId = id
    screen = 'report'
    window.scrollTo(0, 0)
    await render()
  },
}

const quotesCtx = {
  toast,
  openPricing: () => {
    screen = 'pricing'
    void render()
  },
  onChanged: () => {
    if (screen === 'list') void refreshStageChips()
  },
}

// Offline-first: precached app shell. A new version waits until the user taps
// "עדכן" — never a reload in the middle of a survey or a signature.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (document.getElementById('updateBar')) return
    const bar = document.createElement('div')
    bar.id = 'updateBar'
    bar.className = 'update-bar'
    bar.innerHTML = '<span>גרסה חדשה של האפליקציה זמינה</span><button class="btn btn-primary" type="button">עדכן עכשיו</button>'
    bar.querySelector('button')!.addEventListener('click', async () => {
      if (screen === 'form' && editing.projectName.trim()) {
        readFormIntoEditing()
        await persistCurrent()
      }
      await updateSW(true)
    })
    document.body.appendChild(bar)
  },
})

// Backup queue: drain on start, when the network returns, on explicit requests
// (new quote version, report change), and every few minutes while something waits.
window.addEventListener('online', () => requestSync(500))
window.addEventListener('bee-sync-request', () => requestSync(1000))
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestSync(1500)
})
window.setInterval(() => {
  if (navigator.onLine && document.visibilityState === 'visible') requestSync(0)
}, 5 * 60_000)

void render().then(() => requestSync(1500))
