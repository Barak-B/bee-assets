/**
 * Quotes dialog for one survey: create a new version from the current survey +
 * price book, list saved versions, and export each as PDF / BOQ Excel
 * (customer, internal) / JSON. Every export button is its own tap, so the
 * share sheet always has a fresh user gesture (iOS requirement).
 */
import { diffIsEmpty, formatIls, pricingReadiness, publishBlockers, quoteSummaryHe, type QuoteVersion } from '@bee/quote-core'
import {
  getProject,
  getPublication,
  getPublishSettings,
  listPhotos,
  listQuotes,
  savePublication,
  saveQuote,
  type Publication,
  type PublishSettings,
  type StoredQuote,
} from './db'
import { PublishError, publishQuote, quoteViews, revokeQuote, settingsProblem } from './publish'
import { quoteMessage, whatsappUrl } from './customer'
import { escapeAttr, escapeHtml } from './html'
import { loadPricing } from './pricing'
import { buildQuoteDraft } from './quote'
import { markDirty } from './sync'
import { assessCompleteness } from './schema'
import { outcomeToast, shareOrDownload, shareOrDownloadJson } from './share'
import type { SiteSurveyProject } from './types'
import { fmtDate, fmtDateTime } from './dates'

interface Ctx {
  toast: (msg: string) => void
  openPricing: () => void
  /** Something shown in the survey list changed (e.g. a customer approval was seen). */
  onChanged?: () => void
}

function host(): HTMLElement {
  let el = document.getElementById('dialogHost')
  if (!el) {
    el = document.createElement('div')
    el.id = 'dialogHost'
    document.body.appendChild(el)
  }
  return el
}

function close() {
  host().innerHTML = ''
}

function deltaText(q: QuoteVersion): string {
  if (!q.changes) return ''
  if (diffIsEmpty(q.changes)) return ' · ללא שינוי בשורות'
  const d = q.changes.total_delta_incl_vat_ils
  const n = q.changes.added.length + q.changes.removed.length + q.changes.changed.length
  return ` · ${n} שינויים${d === null ? '' : ` · ${d > 0 ? '+' : ''}${formatIls(d)}`}`
}

/** Isolate each "a · b · c" part so mixed Hebrew/number/Latin parts keep their order in RTL. */
function bidiParts(s: string): string {
  return s
    .split(' · ')
    .filter(Boolean)
    .map((x) => `<bdi>${escapeHtml(x)}</bdi>`)
    .join(' · ')
}

function publishBlock(row: StoredQuote, pub: Publication | null, settingsIssue: string | null, project: SiteSurveyProject): string {
  // Stored rows can come from a backup file — never trust them into an attribute raw.
  const v = escapeAttr(String(row.version_no))
  if (pub && !pub.revokedAt) {
    return `
      <div class="pub" data-pub="${v}">
        <div class="pub-head">קישור ללקוח · פורסם ${escapeHtml(fmtDateTime(pub.publishedAt))} <span class="meta" data-views="${v}"></span></div>
        <input class="pub-url" dir="ltr" readonly value="${escapeHtml(pub.url)}" aria-label="קישור ההצעה" />
        <div class="badge badge-ok hidden" data-accepted="${v}"></div>
        <div class="item-actions">
          ${whatsappUrl(project.customerPhone ?? '', '') ? `<button class="btn btn-primary" data-q-wa="${v}">וואטסאפ ל${escapeHtml(project.customerName?.trim() || 'לקוח')}</button>` : ''}
          <button class="btn ${whatsappUrl(project.customerPhone ?? '', '') ? 'btn-secondary' : 'btn-primary'}" data-q-share="${v}">שתף קישור</button>
          <button class="btn btn-secondary" data-q-copy="${v}">העתק</button>
          <button class="btn btn-secondary" data-q-open="${v}">פתח</button>
          <button class="btn btn-danger" data-q-revoke="${v}">בטל קישור</button>
        </div>
      </div>`
  }
  const blockers = publishBlockers(row.quote)
  const reason = blockers[0] ?? settingsIssue
  return `
    <div class="pub">
      <button class="btn btn-primary" data-q-publish="${v}" ${reason ? 'aria-disabled="true"' : ''}>קישור ללקוח (אונליין)</button>
      ${reason ? `<div class="meta">${escapeHtml(reason)}</div>` : ''}
      ${pub?.revokedAt ? `<div class="meta">הקישור הקודם בוטל ${escapeHtml(fmtDate(pub.revokedAt))}</div>` : ''}
    </div>`
}

function versionCard(row: StoredQuote, pub: Publication | null, settingsIssue: string | null, project: SiteSurveyProject): string {
  const q = row.quote
  return `
    <article class="quote-card" data-ver="${escapeAttr(String(row.version_no))}">
      <h3>גרסה ${escapeHtml(String(row.version_no))} · <bdi>${escapeHtml(q.quote_number)}</bdi></h3>
      <div class="meta">
        <span>${escapeHtml(fmtDateTime(q.created_at))}</span>
        <span>${bidiParts(quoteSummaryHe(q) + deltaText(q))}</span>
        <span class="badge ${q.needs_owner_input ? 'badge-warn' : 'badge-ok'}">${q.needs_owner_input ? 'מחירים לאימות' : 'מתומחר'}</span>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary" data-q-pdf="${escapeAttr(String(row.version_no))}">PDF</button>
        <button class="btn btn-secondary" data-q-xlsx="customer" data-v="${escapeAttr(String(row.version_no))}">Excel ללקוח</button>
        <button class="btn btn-secondary" data-q-xlsx="internal" data-v="${escapeAttr(String(row.version_no))}">Excel פנימי</button>
        <button class="btn btn-ghost" data-q-json="${escapeAttr(String(row.version_no))}">JSON</button>
      </div>
      ${publishBlock(row, pub, settingsIssue, project)}
    </article>`
}

async function render(projectId: string, ctx: Ctx) {
  const project = await getProject(projectId)
  if (!project) return close()
  const [photos, quotes, pricing, settings] = await Promise.all([listPhotos(projectId), listQuotes(projectId), loadPricing(), getPublishSettings()])
  const pubs = new Map<number, Publication | null>()
  await Promise.all(quotes.map(async (q) => pubs.set(q.version_no, await getPublication(q.id))))
  const settingsIssue = settingsProblem(settings)
  const ready = pricingReadiness(pricing.catalog, pricing.rules)
  const survey = assessCompleteness(project, photos)

  host().innerHTML = `
    <div class="dialog-backdrop" id="qdBackdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="qdTitle">
        <header class="dialog-head">
          <h2 id="qdTitle">הצעות מחיר · ${escapeHtml(project.projectName || 'ללא שם')}</h2>
          <button class="icon-btn" id="qdClose" aria-label="סגור">סגור</button>
        </header>
        ${
          ready.ready
            ? '<div class="note note-ok">המחירון מלא — ההצעה תצא עם מחירים.</div>'
            : `<div class="note note-warn">המחירון לא מלא — מחירים יסומנו "לאימות". חסר: ${escapeHtml(ready.missing.map((m) => m.label_he).join(' · '))}
                 <button class="btn btn-ghost" id="qdPricing">פתח מחירון</button></div>`
        }
        ${!project.roofTypeHe ? '<div class="note note-warn">חובה לבחור סוג גג בסקר לפני הצעה.</div>' : ''}
        ${!survey.readyForWave54 && project.roofTypeHe ? `<div class="note">הסקר עדיין חסר: ${escapeHtml(survey.missingRequired.join(', '))}</div>` : ''}
        <button class="btn btn-primary btn-block" id="qdNew" ${project.roofTypeHe ? '' : 'disabled'}>
          ${quotes.length ? `חשב גרסה ${quotes[0]!.version_no + 1} מהסקר והמחירון` : 'חשב הצעה ראשונית'}
        </button>
        <div class="quote-list">
          ${quotes.length ? quotes.map((q) => versionCard(q, pubs.get(q.version_no) ?? null, settingsIssue, project)).join('') : '<div class="empty">עדיין אין הצעות לסקר הזה.</div>'}
        </div>
        <p class="meta">כל גרסה נשמרת ואינה משתנה. האפליקציה לא שולחת דבר ללקוח — "וואטסאפ" ו"שתף קישור" רק פותחים את ההודעה, ואתם לוחצים שלח (Law #2).</p>
      </div>
    </div>`

  const h = host()
  h.querySelector('#qdClose')?.addEventListener('click', close)
  h.querySelector('#qdBackdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close()
  })
  h.querySelector('#qdPricing')?.addEventListener('click', () => {
    close()
    ctx.openPricing()
  })
  h.querySelector('#qdNew')?.addEventListener('click', async () => {
    const btn = h.querySelector<HTMLButtonElement>('#qdNew')
    if (btn) btn.disabled = true
    try {
      const previous = quotes[0]?.quote ?? null
      const bundle = await buildQuoteDraft(project, photos, pricing.catalog, pricing.rules, { previous })
      if (previous && bundle.quote.snapshot_hash === previous.snapshot_hash) {
        ctx.toast(`אין שינוי מגרסה ${previous.version_no} — לא נוצרה גרסה חדשה`)
      } else {
        await saveQuote(project.id, bundle.quote)
        await markDirty(project.id)
        window.dispatchEvent(new Event('bee-sync-request'))
        ctx.toast(`נוצרה גרסה ${bundle.quote.version_no} · ${quoteSummaryHe(bundle.quote)}`)
      }
      await render(projectId, ctx)
    } catch (err) {
      console.error(err)
      ctx.toast('חישוב ההצעה נכשל')
      if (btn) btn.disabled = false
    }
  })

  const find = (v: string | undefined) => quotes.find((q) => String(q.version_no) === v)

  h.querySelectorAll<HTMLElement>('[data-q-pdf]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = find(b.dataset.qPdf)
      if (!row) return
      ctx.toast('מכין PDF...')
      try {
        const { buildQuotePdf, quotePdfFilename } = await import('./quotePdf')
        const pdf = await buildQuotePdf(row.quote, project)
        ctx.toast(outcomeToast(await shareOrDownload(pdf.blob, quotePdfFilename(row.quote, project), `הצעה ${row.quote.quote_number}`), 'ה-PDF'))
      } catch (err) {
        console.error(err)
        ctx.toast('יצירת ה-PDF נכשלה')
      }
    }),
  )
  h.querySelectorAll<HTMLElement>('[data-q-xlsx]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = find(b.dataset.v)
      const view = b.dataset.qXlsx === 'internal' ? 'internal' : 'customer'
      if (!row) return
      ctx.toast('מכין Excel...')
      try {
        const { buildBoqXlsx, boqFilename } = await import('./boqXlsx')
        const x = await buildBoqXlsx(row.quote, project, view)
        ctx.toast(outcomeToast(await shareOrDownload(x.blob, boqFilename(row.quote, view), 'כתב כמויות'), 'כתב הכמויות'))
      } catch (err) {
        console.error(err)
        ctx.toast('יצירת ה-Excel נכשלה')
      }
    }),
  )
  h.querySelectorAll<HTMLElement>('[data-q-json]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = find(b.dataset.qJson)
      if (!row) return
      const bundle = { exportedAt: new Date().toISOString(), app: 'bee-solar-survey', kind: 'quote-version', projectId: project.id, quote: row.quote }
      ctx.toast(outcomeToast(await shareOrDownloadJson(`quote-${row.quote.quote_number}-v${row.version_no}.json`, bundle, 'הצעה (JSON)'), 'ה-JSON'))
    }),
  )
  bindPublishing(h, projectId, project, quotes, settings, pubs, ctx)
}

function bindPublishing(h: HTMLElement, projectId: string, project: SiteSurveyProject, quotes: StoredQuote[], settings: PublishSettings | null, pubs: Map<number, Publication | null>, ctx: Ctx) {
  const find = (v: string | undefined) => quotes.find((q) => String(q.version_no) === v)
  const pubOf = (v: string | undefined) => (v ? pubs.get(Number(v)) ?? null : null)

  h.querySelectorAll<HTMLElement>('[data-q-publish]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = find(b.dataset.qPublish)
      if (!row) return
      const blockers = publishBlockers(row.quote)
      if (blockers.length) return ctx.toast(blockers[0]!)
      const issue = settingsProblem(settings)
      if (issue) {
        ctx.toast(issue)
        return
      }
      b.setAttribute('aria-disabled', 'true')
      ctx.toast('מפרסם...')
      try {
        const pub = await publishQuote(row.quote, project, settings!)
        await savePublication(row.id, pub)
        await render(projectId, ctx)
        ctx.toast('הקישור מוכן — "שתף קישור" לשליחה')
      } catch (err) {
        console.error(err)
        b.removeAttribute('aria-disabled')
        ctx.toast(err instanceof PublishError ? err.message : 'הפרסום נכשל')
      }
    }),
  )

  h.querySelectorAll<HTMLElement>('[data-q-share]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = find(b.dataset.qShare)
      const pub = pubOf(b.dataset.qShare)
      if (!row || !pub) return
      const text = `הצעת מחיר ${row.quote.quote_number} — ${project.projectName}`
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: text, text, url: pub.url })
          return
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return
        }
      }
      await navigator.clipboard?.writeText(pub.url).catch(() => undefined)
      ctx.toast('הקישור הועתק')
    }),
  )

  // Opens WhatsApp with the customer's number and the message typed in; the surveyor presses send (Law #2).
  h.querySelectorAll<HTMLElement>('[data-q-wa]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = find(b.dataset.qWa)
      const pub = pubOf(b.dataset.qWa)
      const url = row && pub ? whatsappUrl(project.customerPhone ?? '', quoteMessage(project.customerName, pub.url, row.quote.quote_number)) : null
      if (url) window.open(url, '_blank', 'noopener')
    }),
  )

  h.querySelectorAll<HTMLElement>('[data-q-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const pub = pubOf(b.dataset.qCopy)
      if (!pub) return
      try {
        await navigator.clipboard.writeText(pub.url)
        ctx.toast('הקישור הועתק')
      } catch {
        const input = h.querySelector<HTMLInputElement>(`[data-pub="${b.dataset.qCopy}"] .pub-url`)
        input?.select()
        ctx.toast('סמנו והעתיקו את הקישור')
      }
    }),
  )

  h.querySelectorAll<HTMLElement>('[data-q-open]').forEach((b) =>
    b.addEventListener('click', () => {
      const pub = pubOf(b.dataset.qOpen)
      if (pub) window.open(pub.url, '_blank', 'noopener')
    }),
  )

  h.querySelectorAll<HTMLElement>('[data-q-revoke]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = find(b.dataset.qRevoke)
      const pub = pubOf(b.dataset.qRevoke)
      if (!row || !pub || !settings) return
      if (!confirm('לבטל את הקישור? הלקוח לא יוכל לפתוח אותו יותר.')) return
      try {
        await revokeQuote(pub.token, settings)
        await savePublication(row.id, { ...pub, revokedAt: new Date().toISOString() })
        await render(projectId, ctx)
        ctx.toast('הקישור בוטל')
      } catch (err) {
        ctx.toast(err instanceof PublishError ? err.message : 'ביטול הקישור נכשל')
      }
    }),
  )

  // View counts are best-effort and need the network; fill them in after render.
  if (settings && !settingsProblem(settings)) {
    for (const [v, pub] of pubs) {
      if (!pub || pub.revokedAt) continue
      void quoteViews(pub.token, settings).then((st) => {
        const el = h.querySelector(`[data-views="${v}"]`)
        if (el && st) el.textContent = st.views ? `· נפתח ${st.views} פעמים, לאחרונה ${fmtDateTime(st.last_viewed_at)}` : '· טרם נפתח'
        const acc = h.querySelector<HTMLElement>(`[data-accepted="${v}"]`)
        if (st?.accepted && !pub.acceptedAt) {
          // Remember it, so the survey list shows "הלקוח אישר" without the network.
          pub.acceptedAt = st.accepted.accepted_at
          pub.acceptedBy = st.accepted.name
          void savePublication(`${projectId}:${v}`, pub).then(() => ctx.onChanged?.())
        }
        if (acc && st?.accepted) {
          acc.textContent = `✓ הלקוח אישר את ההצעה: ${st.accepted.name} · ${new Date(st.accepted.accepted_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`
          acc.classList.remove('hidden')
        }
      })
    }
  }
}

export async function openQuotesDialog(project: SiteSurveyProject | string, ctx: Ctx): Promise<void> {
  await render(typeof project === 'string' ? project : project.id, ctx)
}

