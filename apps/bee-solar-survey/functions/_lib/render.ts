/**
 * Server-rendered customer quote page (/q/<token>). Plain HTML + inline CSS,
 * no JavaScript, RTL Hebrew, self-hosted fonts from the same Pages project.
 */
import type { PublicQuote, PublicQuoteLine } from '../../../../packages/quote-core/src/public'

const UNIT_HE: Record<PublicQuoteLine['unit'], string> = {
  unit: 'יח׳',
  m: 'מ׳',
  m2: 'מ״ר',
  set: 'סט',
  komplet: 'קומפלט',
  day: 'יום',
  hour: 'שעה',
  kwp: 'kWp',
  kwh: 'kWh',
  year: 'שנה',
  piece_3m: 'יח׳ (3 מ׳)',
}

const ROOF_HE: Record<string, string> = {
  flat: 'גג בטון שטוח',
  tile: 'גג רעפים',
  'metal-standing-seam': 'גג פנל מבודד',
  'metal-trapezoidal': 'גג איסכורית',
  ground: 'מתקן קרקעי',
  other: 'אחר',
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function ils(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? '—' : `<bdi>${num(n, digits)}&nbsp;₪</bdi>`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `<bdi>${esc(d)}/${esc(m)}/${esc(y)}</bdi>`
}

const STYLE = `
@font-face{font-family:Heebo;font-weight:400;src:url(/fonts/heebo-400-hebrew.woff2) format('woff2');unicode-range:U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}
@font-face{font-family:Heebo;font-weight:400;src:url(/fonts/heebo-400-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:Heebo;font-weight:700;src:url(/fonts/heebo-700-hebrew.woff2) format('woff2');unicode-range:U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}
@font-face{font-family:Heebo;font-weight:700;src:url(/fonts/heebo-700-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
:root{--ink:#0f1c24;--muted:#5d6b73;--line:#e2dccf;--paper:#fffdf8;--sand:#f3eee4;--honey:#e4b23c;--ok:#1f7a4d;--warn:#8a5a00;--warn-bg:#fff4e5}
*{box-sizing:border-box}
body{margin:0;font-family:Heebo,Arial,sans-serif;color:var(--ink);background:var(--sand);line-height:1.6;-webkit-text-size-adjust:100%}
header{background:var(--ink);color:#fff;padding:20px 16px}
.wrap{max-width:820px;margin:0 auto;padding:0 16px}
header .wrap{padding:0}
.brand{display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand b{color:var(--honey);font-size:22px;letter-spacing:.04em}
h1{font-size:22px;margin:12px 0 2px}
.sub{color:#cfd8de;font-size:14px}
main{padding:16px 0 40px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
h2{font-size:18px;margin:0 0 10px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat{background:var(--sand);border-radius:12px;padding:12px}
.stat strong{display:block;font-size:20px}
.stat span{color:var(--muted);font-size:13px}
.total strong{color:var(--ok)}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0}
dt{color:var(--muted)}
dd{margin:0}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}
th{font-weight:700;color:var(--muted);font-size:13px}
td.n,th.n{text-align:left;white-space:nowrap}
tr.sec td{background:var(--sand);font-weight:700}
tr.sum td{font-weight:700;border-top:2px solid var(--ink)}
tr.grand td{font-size:17px;color:var(--ok)}
.note{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:10px 12px;font-size:14px}
.muted{color:var(--muted);font-size:13px}
.btn{display:inline-block;background:var(--honey);color:var(--ink);font-weight:700;text-decoration:none;padding:12px 18px;border-radius:12px}
footer{color:var(--muted);font-size:12px;text-align:center;padding:20px 16px}
.sm-only{display:none}
@media (max-width:560px){
.stats{grid-template-columns:1fr}
table.items thead{display:none}
table.items,table.items tbody{display:block}
table.items tr{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;border-bottom:1px solid var(--line);padding:8px 2px}
table.items td{display:block;border:0;padding:0}
table.items tr.sec{background:var(--sand);border-radius:8px}
table.items td.name{flex:1 1 60%}
table.items tr.line td.name{flex-basis:100%}
table.items td.unit{display:none}
table.items td.qty,table.items td.price{color:var(--muted);font-size:13px}
table.items td.qty::after{content:' ×'}
table.items td.total{margin-inline-start:auto}
.sm-only{display:inline}
}
@media print{body{background:#fff}.btn{display:none}.card{break-inside:avoid;border-color:#ccc}}
`

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>${body}</body>
</html>`
}

export interface RenderOpts {
  token: string
  hasPdf: boolean
  now?: Date
}

export function renderQuotePage(q: PublicQuote, opts: RenderOpts): string {
  const now = opts.now ?? new Date()
  const expired = !!q.valid_until && q.valid_until < now.toISOString().slice(0, 10)
  const s = q.system
  const t = q.totals

  const rows = q.sections
    .map((sec) => {
      const lines = sec.lines
        .map(
          (l) => `<tr class="line">
            <td class="name">${esc(l.name_he)}${l.description_he ? `<div class="muted">${esc(l.description_he)}</div>` : ''}</td>
            <td class="unit">${esc(UNIT_HE[l.unit] ?? l.unit)}</td>
            <td class="n qty"><bdi>${num(l.qty, l.qty % 1 ? 2 : 0)}</bdi><span class="sm-only"> ${esc(UNIT_HE[l.unit] ?? l.unit)}</span></td>
            <td class="n price">${l.passthrough ? 'לפי חשבון' : ils(l.unit_price_ils, 2)}</td>
            <td class="n total">${l.passthrough ? 'לא כלול' : ils(l.line_total_ils, 2)}</td>
          </tr>`,
        )
        .join('')
      return `<tr class="sec"><td class="name" colspan="4"><bdi>${esc(sec.code)}</bdi> · ${esc(sec.title_he)}</td><td class="n total">${ils(sec.total_ils, 2)}</td></tr>${lines}`
    })
    .join('')

  const vatLabel = t.vat_rate === null ? 'מע״מ' : `מע״מ (<bdi>${num(t.vat_rate * 100, t.vat_rate * 100 % 1 ? 1 : 0)}%</bdi>)`

  const body = `
<header>
  <div class="wrap">
    <div class="brand"><b>B.E.E</b><span class="sub">ברק אלקטריק אנג׳ינירינג</span></div>
    <h1>הצעת מחיר למערכת סולארית <bdi>${num(s.dc_kwp, 2)} kWp</bdi></h1>
    <div class="sub">הצעה <bdi>${esc(q.quote_number)}</bdi> · גרסה ${esc(q.version_no)} · ${formatDate(q.issued_at)}${q.valid_until ? ` · בתוקף עד ${formatDate(q.valid_until)}` : ''}</div>
  </div>
</header>
<main class="wrap">
  ${expired ? `<div class="card note">תוקף ההצעה הסתיים ב-${formatDate(q.valid_until)}. לעדכון ההצעה פנו אלינו.</div>` : ''}

  <section class="card">
    <h2>${esc(q.project.name)}</h2>
    <div class="muted">${esc(q.project.address)}${q.project.customer_name ? ` · ${esc(q.project.customer_name)}` : ''}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><strong><bdi>${num(s.dc_kwp, 2)} kWp</bdi></strong><span>הספק המערכת</span></div>
      <div class="stat"><strong>${s.annual_yield_kwh_estimate ? `<bdi>${num(s.annual_yield_kwh_estimate)} kWh</bdi>` : '—'}</strong><span>ייצור שנתי משוער*</span></div>
      <div class="stat total"><strong>${ils(t.total_incl_vat_ils)}</strong><span>סה״כ כולל מע״מ</span></div>
    </div>
  </section>

  <section class="card">
    <h2>המערכת המוצעת</h2>
    <dl>
      <dt>פאנלים</dt><dd><bdi>${num(s.module_count)}</bdi> פאנלים${s.module_w ? ` · <bdi>${num(s.module_w)}W</bdi> לפאנל` : ''}</dd>
      <dt>ממיר</dt><dd><bdi>${num(s.inverter_count)}</bdi> ממיר${s.inverter_count > 1 ? 'ים' : ''}${s.inverter_ac_kw ? ` · <bdi>${num(s.inverter_ac_kw, 1)} kW</bdi>` : ''}</dd>
      <dt>אגירה</dt><dd>${s.has_battery ? 'כלולה' : 'לא כלולה'}</dd>
      <dt>התקנה</dt><dd>${esc(ROOF_HE[s.roof_type] ?? s.roof_type)}</dd>
    </dl>
  </section>

  <section class="card">
    <h2>פירוט ומחיר</h2>
    <table class="items">
      <thead><tr><th>פריט</th><th>יח׳</th><th class="n">כמות</th><th class="n">מחיר יח׳</th><th class="n">סה״כ</th></tr></thead>
      <tbody>
        ${rows}
        <tr class="sum"><td class="name" colspan="4">סה״כ לפני מע״מ</td><td class="n total">${ils(t.subtotal_excl_vat_ils, 2)}</td></tr>
        <tr class="vat"><td class="name" colspan="4">${vatLabel}</td><td class="n total">${ils(t.vat_ils, 2)}</td></tr>
        <tr class="sum grand"><td class="name" colspan="4">סה״כ כולל מע״מ</td><td class="n total">${ils(t.total_incl_vat_ils, 2)}</td></tr>
      </tbody>
    </table>
    <p class="muted">${esc(t.passthrough_note_he)}${t.price_per_kwp_excl_vat_ils ? ` · מחיר ל-kWp לפני מע״מ: ${ils(t.price_per_kwp_excl_vat_ils)}` : ''}</p>
  </section>

  ${
    q.payment_schedule.length
      ? `<section class="card">
    <h2>לוח תשלומים</h2>
    <table>
      <thead><tr><th>אבן דרך</th><th class="n">%</th><th class="n">סכום</th></tr></thead>
      <tbody>${q.payment_schedule
        .map((m) => `<tr><td>${esc(m.label_he)}</td><td class="n">${m.pct === null ? '—' : `<bdi>${num(m.pct)}%</bdi>`}</td><td class="n">${ils(m.amount_ils)}</td></tr>`)
        .join('')}</tbody>
    </table>
  </section>`
      : ''
  }

  <section class="card">
    <h2>תנאים</h2>
    <ul>
      <li>${q.valid_until ? `ההצעה בתוקף עד ${formatDate(q.valid_until)}.` : 'תוקף ההצעה ייקבע בהסכם.'}</li>
      <li>${q.terms.linkage === 'fx' ? 'מחירי הציוד צמודים לשער המטבע ביום ההצעה.' : 'המחיר קבוע לתקופת התוקף.'}</li>
      <li>לא כלול: חיזוקי קונסטרוקציה או שיפוץ גג, הגדלת חיבור ואגרות חברת החשמל, עבודות בנייה.</li>
      <li>פריסה סופית ומפרט מדויק ייקבעו בתכנון המפורט.</li>
      <li>* ייצור משוער לפי ממוצע אזורי; הייצור בפועל משתנה בין שנים.</li>
    </ul>
  </section>

  ${opts.hasPdf ? `<p style="text-align:center"><a class="btn" href="/q/${esc(opts.token)}/pdf">הורדת ההצעה כ-PDF</a></p>` : ''}
</main>
<footer>B.E.E · ברק אלקטריק אנג׳ינירינג · אסמכתא <bdi>${esc(q.reference)}</bdi></footer>`

  return page(`הצעת מחיר ${q.quote_number} · B.E.E`, body)
}

export function renderMessagePage(title: string, message: string): string {
  return page(
    `${title} · B.E.E`,
    `<header><div class="wrap"><div class="brand"><b>B.E.E</b><span class="sub">ברק אלקטריק אנג׳ינירינג</span></div><h1>${esc(title)}</h1></div></header>
<main class="wrap"><section class="card"><p>${esc(message)}</p></section></main>`,
  )
}
