/**
 * Pricing screen ("מחירון והגדרות"): Barak fills supplier costs, margins, VAT,
 * labour per roof, sizing parameters and the payment schedule — in the app,
 * offline. Saved to IndexedDB; every quote built afterwards uses it.
 */
import {
  KIND_LABELS_HE,
  ROOF_LABELS_HE,
  SUGGESTED_ROI,
  SUGGESTED_SIZING,
  EMPTY_ROI_RULES,
  TRACK_LABELS_HE,
  priceListTemplateCsv,
  pricingReadiness,
  seedCatalog,
  seedPricingRules,
  type Catalog,
  type Currency,
  type PricingRules,
  type Product,
  type ProductKind,
  type RoofType,
  type RoiRules,
  type TariffTrack,
} from '@bee/quote-core'
import { clearPricing, getPublishSettings, savePublishSettings } from './db'
import { defaultBaseUrl } from './publish'
import { isPublicBaseUrl } from '@bee/quote-core'
import { escapeAttr, escapeHtml, numValue, readNum } from './html'
import { importPriceListFile, loadPricing, persistPricing, type Pricing } from './pricing'
import { outcomeToast, shareOrDownload, shareOrDownloadJson } from './share'

interface Ctx {
  app: HTMLElement
  toast: (msg: string) => void
  onBack: () => void
}

const MARGIN_KINDS: ProductKind[] = ['module', 'inverter', 'optimizer', 'battery', 'mounting', 'cable', 'cabinet', 'accessory', 'meter', 'labour', 'service']
const ROOFS: RoofType[] = ['flat', 'tile', 'metal-standing-seam', 'metal-trapezoidal', 'ground', 'other']
const KIND_ORDER: ProductKind[] = ['module', 'inverter', 'optimizer', 'battery', 'mounting', 'cable', 'cabinet', 'accessory', 'meter', 'labour', 'service', 'fee', 'breaker', 'tray']

const SIZING_FIELDS: { key: keyof PricingRules['sizing']; label: string }[] = [
  { key: 'area_m2_per_kwp', label: 'שטח גג ל-kWp (מ״ר)' },
  { key: 'specific_yield_kwh_per_kwp', label: 'תפוקה סגולית (kWh/kWp/שנה)' },
  { key: 'dc_ac_ratio_max', label: 'יחס DC/AC מרבי' },
  { key: 'dc_cable_m_per_module', label: 'כבל DC למודול (מ׳)' },
  { key: 'default_ac_cable_m', label: 'כבל AC ברירת מחדל (מ׳)' },
  { key: 'strings_modules_per_string', label: 'מודולים למחרוזת (הערכה)' },
]

type RoiNumKey = Exclude<keyof RoiRules, 'track' | 'verification'>
/** `scale` 100 = stored as a fraction, shown as %. */
const ROI_FIELDS: { key: RoiNumKey; label: string; scale?: number; tracks?: TariffTrack[] }[] = [
  { key: 'consumption_tariff_ils_kwh', label: 'תעריף צריכה (₪ לקוט״ש, לפני מע״מ)', tracks: ['net_metering', 'self_consumption'] },
  { key: 'surplus_tariff_ils_kwh', label: 'תעריף עודפים (₪ לקוט״ש)', tracks: ['self_consumption'] },
  { key: 'self_consumption_share', label: 'חלק הצריכה העצמית (%)', scale: 100, tracks: ['self_consumption'] },
  { key: 'feed_in_tariff_ils_kwh', label: 'תעריף הזנה (₪ לקוט״ש)', tracks: ['feed_in_full'] },
  { key: 'tariff_escalation_pct', label: 'עליית תעריף שנתית (%)' },
  { key: 'degradation_pct_year', label: 'דעיכה שנתית (%)' },
  { key: 'first_year_degradation_pct', label: 'דעיכת שנה ראשונה (%)' },
  { key: 'om_cost_pct_capex', label: 'אחזקה שנתית (% מעלות המערכת)' },
  { key: 'discount_rate_pct', label: 'שיעור היוון (%)' },
  { key: 'horizon_years', label: 'אופק (שנים)' },
  { key: 'co2_kg_per_kwh', label: 'מקדם פליטה (ק״ג CO₂ לקוט״ש, אופציונלי)' },
]

let state: Pricing | null = null

function input(id: string, value: string, attrs = ''): string {
  return `<input id="${id}" inputmode="decimal" value="${escapeAttr(value)}" ${attrs} />`
}

function readinessBox(p: Pricing): string {
  const r = pricingReadiness(p.catalog, p.rules)
  return `
    <div class="completeness" id="pricingReadiness">
      <strong>מוכנות מחירון: ${r.ready ? 'מוכן — הצעות יצאו עם מחירים' : 'חסר — הצעות יסומנו "לאימות"'} · ${r.pricedCount}/${r.totalCount} פריטים מתומחרים</strong>
      <div class="score-bar"><span style="width:${r.totalCount ? Math.round((r.pricedCount / r.totalCount) * 100) : 0}%"></span></div>
      ${r.missing.length ? `<div>חסר: <ul>${r.missing.map((m) => `<li>${escapeHtml(m.label_he)}</li>`).join('')}</ul></div>` : ''}
      ${r.recommended.length ? `<div id="pricingRecommended">מומלץ (בלי זה ההצעה תצא בלי הסעיף): <ul>${r.recommended.map((m) => `<li>${escapeHtml(m.label_he)}</li>`).join('')}</ul></div>` : ''}
      ${p.isSeed ? '<div class="meta">עדיין לא נשמר מחירון — מוצג הזרע הריק.</div>' : `<div class="meta">נשמר לאחרונה: ${escapeHtml((p.updatedAt ?? '').replace('T', ' ').slice(0, 16))}</div>`}
    </div>`
}

function productRow(p: Product): string {
  const tableLabour = p.kind === 'labour' && p.subkind === 'install_modules'
  const fee = p.kind === 'fee'
  const note = tableLabour
    ? '<div class="meta">מתומחר מטבלת "עבודה למודול לפי גג" — אין צורך בעלות</div>'
    : fee
      ? '<div class="meta">אגרה — לפי חשבון בפועל; עלות כאן = אומדן בלבד, לא נכלל בסה״כ</div>'
      : p.cost_source
        ? `<div class="meta">מקור: ${escapeHtml(p.cost_source)}</div>`
        : ''
  const missing = !tableLabour && !fee && (p.unit_cost === null || p.unit_cost === undefined)
  return `
    <div class="price-row${missing ? ' price-missing' : ''}" data-sku="${escapeAttr(p.sku)}">
      <div class="price-name">
        <strong>${escapeHtml(p.name_he)}</strong>
        <span class="meta">${escapeHtml(p.sku)} · ${escapeHtml(p.unit)}</span>
        ${note}
      </div>
      <div class="price-inputs">
        <select data-cur="${escapeAttr(p.sku)}" aria-label="מטבע">
          ${(['ILS', 'USD', 'EUR'] as Currency[]).map((c) => `<option value="${c}" ${c === p.currency ? 'selected' : ''}>${c === 'ILS' ? '₪' : c}</option>`).join('')}
        </select>
        <input data-cost="${escapeAttr(p.sku)}" inputmode="decimal" placeholder="עלות" value="${escapeAttr(numValue(p.unit_cost))}" aria-label="עלות ליחידה" />
      </div>
    </div>`
}

interface PubForm {
  baseUrl: string
  key: string
}

let pub: PubForm = { baseUrl: '', key: '' }

function pubStatus(s: PubForm): string {
  if (!s.baseUrl) return 'לא הוגדר — הצעות לא יקבלו קישור אונליין'
  if (!isPublicBaseUrl(s.baseUrl)) return `⚠ ${s.baseUrl} אינה כתובת ציבורית https — לא ייווצרו קישורים`
  if (!s.key) return 'חסר מפתח שרת'
  return `קישורים ייווצרו בכתובת ${s.baseUrl.replace(/\/+$/, '')}/q/… · הסקרים מגובים לאותו שרת`
}

function render(ctx: Ctx, p: Pricing) {
  const r = p.rules
  const byKind = new Map<ProductKind, Product[]>()
  for (const prod of p.catalog.products) byKind.set(prod.kind, [...(byKind.get(prod.kind) ?? []), prod])

  ctx.app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">BEE</div>
        <div class="brand-text">
          <strong>מחירון והגדרות תמחור</strong>
          <span>הצעות מחיר משתמשות בנתונים כאן</span>
        </div>
      </div>
      <div class="topbar-actions"><button class="icon-btn" id="pBack">חזרה</button></div>
    </header>
    <main class="shell">
      ${readinessBox(p)}

      <section class="section">
        <h2>ייבוא וגיבוי</h2>
        <p class="hint">מחירון ספק ב-CSV או Excel עם עמודות מק״ט ועלות (ומטבע אם יש). הורידו את התבנית, מלאו עמודת unit_cost וייבאו בחזרה.</p>
        <div class="row">
          <button class="btn btn-primary" id="pImport">ייבוא מחירון (CSV / Excel)</button>
          <button class="btn btn-secondary" id="pTemplate">הורדת תבנית מחירון</button>
        </div>
        <div class="row">
          <button class="btn btn-secondary" id="pBackup">גיבוי מחירון (JSON)</button>
          <button class="btn btn-secondary" id="pRestore">שחזור מחירון</button>
          <button class="btn btn-danger" id="pReset">איפוס לזרע</button>
        </div>
      </section>

      <section class="section" id="pubSection">
        <h2>שרת החברה — הצעות אונליין וגיבוי</h2>
        <p class="hint">אותו שרת משמש לקישורי הצעה ללקוח ולגיבוי אוטומטי של הסקרים, התמונות וגרסאות ההצעה. קישור ללקוח נוצר רק תחת כתובת האתר שלנו (https). כתובות מקומיות כמו 127.0.0.1 או localhost נחסמות.</p>
        <div class="field"><label>כתובת האתר</label><input id="p_pubBase" dir="ltr" inputmode="url" placeholder="https://app.barak-e.com" value="${escapeAttr(pub.baseUrl)}" /></div>
        <div class="field"><label>מפתח שרת (פרסום וגיבוי)</label><input id="p_pubKey" dir="ltr" type="password" autocomplete="off" placeholder="PUBLISH_KEY" value="${escapeAttr(pub.key)}" /></div>
        <div class="meta" id="p_pubStatus">${escapeHtml(pubStatus(pub))}</div>
      </section>

      <section class="section">
        <h2>פרמטרים כלליים</h2>
        <div class="grid-2">
          <div class="field"><label>מע״מ (%)</label>${input('p_vat', numValue(r.vat_rate, 100))}</div>
          <div class="field"><label>מרווח ברירת מחדל (%)</label>${input('p_defMargin', numValue(r.default_margin_pct, 100))}</div>
          <div class="field"><label>תוקף הצעה (ימים)</label>${input('p_validity', numValue(r.validity_days))}</div>
          <div class="field"><label>עיגול סה״כ (₪)</label>${input('p_round', numValue(r.final_round_step_ils), 'placeholder="ללא"')}</div>
          <div class="field"><label>שער USD (₪)</label>${input('p_usd', numValue(p.catalog.fx_rates.USD))}</div>
          <div class="field"><label>שער EUR (₪)</label>${input('p_eur', numValue(p.catalog.fx_rates.EUR))}</div>
        </div>
      </section>

      <section class="section">
        <h2>מרווח לפי סוג פריט (%)</h2>
        <p class="hint">ריק = מרווח ברירת המחדל. המרווח מחושב על העלות: מחיר = עלות × (1 + מרווח).</p>
        <div class="grid-2">
          ${MARGIN_KINDS.map((k) => `<div class="field"><label>${KIND_LABELS_HE[k]}</label>${input(`p_m_${k}`, numValue(r.margins[k] ?? null, 100))}</div>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2>עבודה למודול לפי סוג גג (₪, מחיר מכירה)</h2>
        <div class="grid-2">
          ${ROOFS.map((roof) => `<div class="field"><label>${ROOF_LABELS_HE[roof]}</label>${input(`p_l_${roof}`, numValue(r.labour_per_module_ils[roof] ?? null))}</div>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2>פרמטרי תכנון מהיר</h2>
        <p class="hint">משמשים לגזירת הספק משטח/צריכה, בחירת ממיר וכמויות כבל. לכייל מול פרויקטים אמיתיים.</p>
        <div class="grid-2">
          ${SIZING_FIELDS.map((f) => `<div class="field"><label>${f.label}</label>${input(`p_s_${f.key}`, numValue(r.sizing[f.key]))}</div>`).join('')}
        </div>
        <button type="button" class="btn btn-ghost" id="pSuggest">מלא ערכים מומלצים (לאימות)</button>
      </section>

      <section class="section" id="roiSection">
        <h2>תחזית ייצור וחיסכון ללקוח</h2>
        <p class="hint">בלי מסלול ותעריף, ההצעה יוצאת בלי עמוד חיסכון. התעריפים לא ממולאים אוטומטית — יש להזין את הערכים בתוקף. הייצור מחושב מהתפוקה הסגולית, מתוקן לפי האזימוט והשיפוע מהסקר.</p>
        <div class="field"><label>מסלול</label><select id="p_roi_track">
          <option value="">— ללא תחזית חיסכון —</option>
          ${(Object.keys(TRACK_LABELS_HE) as TariffTrack[]).map((t) => `<option value="${t}" ${r.roi?.track === t ? 'selected' : ''}>${escapeHtml(TRACK_LABELS_HE[t])}</option>`).join('')}
        </select></div>
        <div class="grid-2">
          ${ROI_FIELDS.map((f) => `<div class="field" data-roi-tracks="${(f.tracks ?? []).join(' ')}"><label>${f.label}</label>${input(`p_roi_${f.key}`, numValue(r.roi?.[f.key] ?? null, f.scale))}</div>`).join('')}
        </div>
        <button type="button" class="btn btn-ghost" id="pSuggestRoi">מלא ערכים כלליים מומלצים (בלי תעריפים)</button>
      </section>

      <section class="section">
        <h2>לוח תשלומים (%)</h2>
        <div class="grid-2">
          ${r.payment_schedule.map((m, i) => `<div class="field"><label>${escapeHtml(m.label_he)}</label>${input(`p_pay_${i}`, numValue(m.pct))}</div>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2>קטלוג ועלויות</h2>
        <p class="hint">עלות נטו ליחידה במטבע הספק. פריט מסומן באדום = חסר מחיר.</p>
        ${KIND_ORDER.filter((k) => byKind.has(k))
          .map((k) => `<h3 class="price-group">${KIND_LABELS_HE[k]}</h3>${byKind.get(k)!.map(productRow).join('')}`)
          .join('')}
      </section>
    </main>
    <div class="sticky-actions">
      <button class="btn btn-secondary" id="pCancel">ביטול</button>
      <button class="btn btn-primary" id="pSave">שמור מחירון</button>
    </div>
    <div class="toast" id="toast"></div>`

  bind(ctx)
}

function readForm(ctx: Ctx, base: Pricing): { catalog: Catalog; rules: PricingRules } {
  const q = (id: string) => ctx.app.querySelector<HTMLInputElement>(`#${id}`)
  const catalog: Catalog = structuredClone(base.catalog)
  const rules: PricingRules = structuredClone(base.rules)
  const today = new Date().toISOString().slice(0, 10)

  rules.vat_rate = readNum(q('p_vat'), 100)
  rules.default_margin_pct = readNum(q('p_defMargin'), 100)
  rules.validity_days = readNum(q('p_validity'))
  rules.final_round_step_ils = readNum(q('p_round'))
  catalog.fx_rates = { ...catalog.fx_rates, USD: readNum(q('p_usd')), EUR: readNum(q('p_eur')), source: 'ידני', as_of: today }
  for (const k of MARGIN_KINDS) rules.margins[k] = readNum(q(`p_m_${k}`), 100)
  for (const roof of ROOFS) rules.labour_per_module_ils[roof] = readNum(q(`p_l_${roof}`))
  for (const f of SIZING_FIELDS) rules.sizing[f.key] = readNum(q(`p_s_${f.key}`))
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: readNum(q(`p_pay_${i}`)) }))
  const roi: RoiRules = { ...EMPTY_ROI_RULES, ...(rules.roi ?? {}) }
  const track = ctx.app.querySelector<HTMLSelectElement>('#p_roi_track')?.value ?? ''
  roi.track = track ? (track as TariffTrack) : null
  for (const f of ROI_FIELDS) roi[f.key] = readNum(q(`p_roi_${f.key}`), f.scale)
  rules.roi = roi

  for (const prod of catalog.products) {
    const costEl = ctx.app.querySelector<HTMLInputElement>(`[data-cost="${CSS.escape(prod.sku)}"]`)
    const curEl = ctx.app.querySelector<HTMLSelectElement>(`[data-cur="${CSS.escape(prod.sku)}"]`)
    const cost = readNum(costEl)
    const cur = (curEl?.value ?? prod.currency) as Currency
    if (cost !== prod.unit_cost || cur !== prod.currency) {
      prod.unit_cost = cost
      prod.currency = cur
      prod.cost_source = cost === null ? undefined : `ידני · ${today}`
      prod.needs_owner_input = cost === null
      if (cost !== null && prod.verification === 'unverified') prod.verification = 'office'
    }
  }
  return { catalog, rules }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = accept
    el.onchange = () => resolve(el.files?.[0] ?? null)
    el.click()
  })
}

function bind(ctx: Ctx) {
  const $ = (id: string) => ctx.app.querySelector<HTMLElement>(`#${id}`)
  const leave = () => {
    state = null
    ctx.onBack()
  }
  $('pBack')?.addEventListener('click', leave)
  $('pCancel')?.addEventListener('click', leave)

  $('pSave')?.addEventListener('click', async () => {
    if (!state) return
    const { catalog, rules } = readForm(ctx, state)
    pub = {
      baseUrl: (ctx.app.querySelector<HTMLInputElement>('#p_pubBase')?.value ?? '').trim().replace(/\/+$/, ''),
      key: (ctx.app.querySelector<HTMLInputElement>('#p_pubKey')?.value ?? '').trim(),
    }
    const badUrl = !!pub.baseUrl && !isPublicBaseUrl(pub.baseUrl)
    if (badUrl) pub.baseUrl = ''
    await savePublishSettings(pub)
    state = await persistPricing(catalog, rules)
    const r = pricingReadiness(state.catalog, state.rules)
    render(ctx, state) // re-render first: it replaces the toast element
    ctx.toast(
      badUrl
        ? 'המחירון נשמר · כתובת האתר לא נשמרה — חייבת להיות https על דומיין ציבורי (לא 127.0.0.1 / localhost)'
        : r.ready
          ? 'המחירון נשמר · מוכן להצעות'
          : `המחירון נשמר · חסרים ${r.missing.length} סעיפים`,
    )
  })

  $('pSuggest')?.addEventListener('click', () => {
    for (const f of SIZING_FIELDS) {
      const el = ctx.app.querySelector<HTMLInputElement>(`#p_s_${f.key}`)
      if (el && !el.value.trim()) el.value = String(SUGGESTED_SIZING[f.key] ?? '')
    }
    ctx.toast('מולאו ערכים מומלצים בשדות הריקים — לחצו שמור')
  })

  $('pSuggestRoi')?.addEventListener('click', () => {
    for (const [key, v] of Object.entries(SUGGESTED_ROI)) {
      const el = ctx.app.querySelector<HTMLInputElement>(`#p_roi_${key}`)
      if (el && !el.value.trim() && typeof v === 'number') el.value = String(v)
    }
    ctx.toast('מולאו ערכים כלליים בשדות הריקים — התעריפים נשארים לכם · לחצו שמור')
  })
  const trackSel = ctx.app.querySelector<HTMLSelectElement>('#p_roi_track')
  const syncTrackFields = () => {
    const t = trackSel?.value ?? ''
    ctx.app.querySelectorAll<HTMLElement>('[data-roi-tracks]').forEach((el) => {
      const tracks = (el.dataset.roiTracks ?? '').split(' ').filter(Boolean)
      el.classList.toggle('hidden', !!tracks.length && !tracks.includes(t))
    })
  }
  trackSel?.addEventListener('change', syncTrackFields)
  syncTrackFields()

  $('pImport')?.addEventListener('click', async () => {
    if (!state) return
    const file = await pickFile('.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    if (!file) return
    // Keep anything typed on screen, then layer the file on top.
    const current = readForm(ctx, state)
    try {
      const res = await importPriceListFile(file, current.catalog)
      const lines = [
        `עודכנו ${res.applied} מחירים · ללא שינוי ${res.unchanged}`,
        res.unknownSkus.length ? `מק״טים לא מוכרים (${res.unknownSkus.length}): ${res.unknownSkus.slice(0, 12).join(', ')}${res.unknownSkus.length > 12 ? '…' : ''}` : '',
        res.invalid.length ? `שורות שנדחו (${res.invalid.length}): ${res.invalid.slice(0, 8).map((x) => `שורה ${x.row} — ${x.reason}`).join('; ')}` : '',
      ].filter(Boolean)
      if (!res.applied) {
        alert(`לא עודכן אף מחיר.\n${lines.join('\n')}`)
        return
      }
      if (!confirm(`${lines.join('\n')}\n\nלשמור את המחירון?`)) return
      state = await persistPricing(res.catalog, current.rules)
      render(ctx, state)
      ctx.toast(`יובאו ${res.applied} מחירים`)
    } catch (err) {
      console.error(err)
      alert('קריאת הקובץ נכשלה. ודאו שזה CSV או XLSX עם שורת כותרת (sku, unit_cost).')
    }
  })

  $('pTemplate')?.addEventListener('click', async () => {
    if (!state) return
    const { catalog } = readForm(ctx, state)
    const blob = new Blob([priceListTemplateCsv(catalog)], { type: 'text/csv;charset=utf-8' })
    ctx.toast(outcomeToast(await shareOrDownload(blob, 'bee-pricelist-template.csv', 'תבנית מחירון B.E.E'), 'התבנית'))
  })

  $('pBackup')?.addEventListener('click', async () => {
    if (!state) return
    const { catalog, rules } = readForm(ctx, state)
    const outcome = await shareOrDownloadJson(`bee-pricing-${new Date().toISOString().slice(0, 10)}.json`, { app: 'bee-solar-survey', kind: 'pricing', catalog, rules }, 'גיבוי מחירון')
    ctx.toast(outcomeToast(outcome, 'גיבוי המחירון'))
  })

  $('pRestore')?.addEventListener('click', async () => {
    const file = await pickFile('application/json,.json')
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as { catalog?: Catalog; rules?: PricingRules; pricing?: { catalog: Catalog; rules: PricingRules } }
      const src = data.pricing ?? data
      if (!src.catalog?.products || !src.rules) throw new Error('not a pricing file')
      await persistPricing(src.catalog, src.rules)
      state = await loadPricing()
      render(ctx, state)
      ctx.toast('המחירון שוחזר')
    } catch {
      alert('הקובץ אינו גיבוי מחירון תקין.')
    }
  })

  $('pReset')?.addEventListener('click', async () => {
    if (!confirm('לאפס את המחירון לזרע הריק? כל המחירים שהוזנו יימחקו (הצעות שכבר נשמרו לא ישתנו).')) return
    await clearPricing()
    state = { catalog: structuredClone(seedCatalog), rules: structuredClone(seedPricingRules), isSeed: true }
    render(ctx, state)
    ctx.toast('המחירון אופס')
  })
}

export async function renderPricingScreen(ctx: Ctx): Promise<void> {
  const saved = await getPublishSettings()
  pub = { baseUrl: saved?.baseUrl || defaultBaseUrl(), key: saved?.key ?? '' }
  state = await loadPricing()
  render(ctx, state)
}
