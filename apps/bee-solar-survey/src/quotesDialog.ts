/**
 * Quotes dialog for one survey: create a new version from the current survey +
 * price book, list saved versions, and export each as PDF / BOQ Excel
 * (customer, internal) / JSON. Every export button is its own tap, so the
 * share sheet always has a fresh user gesture (iOS requirement).
 */
import { diffIsEmpty, formatIls, pricingReadiness, quoteSummaryHe, type QuoteVersion } from '@bee/quote-core'
import { getProject, listPhotos, listQuotes, saveQuote, type StoredQuote } from './db'
import { escapeHtml } from './html'
import { loadPricing } from './pricing'
import { buildQuoteDraft } from './quote'
import { assessCompleteness } from './schema'
import { outcomeToast, shareOrDownload, shareOrDownloadJson } from './share'
import type { SiteSurveyProject } from './types'

interface Ctx {
  toast: (msg: string) => void
  openPricing: () => void
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

function versionCard(row: StoredQuote): string {
  const q = row.quote
  return `
    <article class="quote-card" data-ver="${row.version_no}">
      <h3>גרסה ${row.version_no} · <bdi>${escapeHtml(q.quote_number)}</bdi></h3>
      <div class="meta">
        <span>${escapeHtml(q.created_at.replace('T', ' ').slice(0, 16))}</span>
        <span>${bidiParts(quoteSummaryHe(q) + deltaText(q))}</span>
        <span class="badge ${q.needs_owner_input ? 'badge-warn' : 'badge-ok'}">${q.needs_owner_input ? 'מחירים לאימות' : 'מתומחר'}</span>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary" data-q-pdf="${row.version_no}">PDF</button>
        <button class="btn btn-secondary" data-q-xlsx="customer" data-v="${row.version_no}">Excel ללקוח</button>
        <button class="btn btn-secondary" data-q-xlsx="internal" data-v="${row.version_no}">Excel פנימי</button>
        <button class="btn btn-ghost" data-q-json="${row.version_no}">JSON</button>
      </div>
    </article>`
}

async function render(projectId: string, ctx: Ctx) {
  const project = await getProject(projectId)
  if (!project) return close()
  const [photos, quotes, pricing] = await Promise.all([listPhotos(projectId), listQuotes(projectId), loadPricing()])
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
          ${quotes.length ? quotes.map(versionCard).join('') : '<div class="empty">עדיין אין הצעות לסקר הזה.</div>'}
        </div>
        <p class="meta">כל גרסה נשמרת ואינה משתנה. הכל טיוטה בלבד — אין שליחה ללקוח מהאפליקציה (Law #2).</p>
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
}

export async function openQuotesDialog(project: SiteSurveyProject | string, ctx: Ctx): Promise<void> {
  await render(typeof project === 'string' ? project : project.id, ctx)
}

