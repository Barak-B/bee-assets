/**
 * The five field-report templates of plan step 6, from spec 15:
 *  - daily_report            §a.2 (DSL "PV" daily report)
 *  - installation_checklist  §a.3 (per roof type / optimizers / battery; ends with ready_for_inspection)
 *  - inspection_62446        §b.3 (IEC 62446-1 category 1 test record — DSL "בודק")
 *  - defects                 §b.5 (DSL "ליקויים"; can be generated from a failed inspection)
 *  - handover                §d.1–d.4 (commissioning + handover to the customer)
 *
 * Regulatory thresholds that are not verified against the standard text
 * (Riso minimum, Voc/Isc tolerance, continuity limit) are report fields
 * marked "לאימות" — never constants in code. Rule references (R11…R23) point
 * to the rules table of the plan; their values are not restated here.
 */
import { parseNumber } from '@bee/quote-core'
import type { ChecklistItemDef, Option, ReportInstance, ReportTemplate, Row, TemplateKey } from './types'

// ── helpers ──────────────────────────────────────────────────────────────

/** Field text → number with the same locale-tolerant parser as everywhere else ("1,000" is a thousand). */
export function num(s: string | undefined | null): number | null {
  if (s === undefined || s === null) return null
  return parseNumber(String(s).trim())
}

const fmt = (n: number | null, digits = 1) => (n === null ? '' : String(Math.round(n * 10 ** digits) / 10 ** digits))

const today = () => new Date().toISOString().slice(0, 10)

const WEATHER: Option[] = [
  { value: 'clear', label_he: 'בהיר' },
  { value: 'partly_cloudy', label_he: 'מעונן חלקית' },
  { value: 'cloudy', label_he: 'מעונן' },
  { value: 'rain', label_he: 'גשם' },
  { value: 'dust', label_he: 'אובך / אבק' },
  { value: 'wind', label_he: 'רוח חזקה' },
]

const field = (r: ReportInstance, section: string, key: string) => r.fields[section]?.[key] ?? ''

// ── 1. Daily report ──────────────────────────────────────────────────────

const daily: ReportTemplate = {
  key: 'daily_report',
  version: 1,
  title_he: 'דוח יומי — ביצוע',
  description_he: 'צוות, שעות, התקדמות, חסמים וחריגות מהתכנון (as-made), עם תמונות וחתימת מנהל העבודה.',
  sections: [
    {
      kind: 'fields',
      key: 'general',
      title_he: 'כללי',
      fields: [
        { key: 'date', label_he: 'תאריך', kind: 'date', required: true, prefill: today },
        { key: 'foreman', label_he: 'מנהל עבודה', kind: 'text', required: true },
        { key: 'crew', label_he: 'צוות באתר', kind: 'textarea', hint_he: 'שם ותפקיד, שורה לכל אחד' },
        { key: 'hours', label_he: 'שעות עבודה', kind: 'number', unit: 'שעות' },
        { key: 'weather', label_he: 'מזג אוויר', kind: 'select', options: WEATHER },
        { key: 'safety_briefing', label_he: 'תדריך בטיחות בוצע', kind: 'yesno', required: true },
      ],
    },
    {
      kind: 'fields',
      key: 'progress',
      title_he: 'התקדמות',
      fields: [
        { key: 'modules_planned', label_he: 'מודולים בתכנון', kind: 'number', prefill: (c) => (c.moduleCount ? String(c.moduleCount) : '') },
        { key: 'modules_mounted', label_he: 'מודולים שהותקנו עד היום', kind: 'number', required: true },
        { key: 'strings_wired', label_he: 'מחרוזות שחווטו', kind: 'number' },
        { key: 'mounting_done', label_he: 'קונסטרוקציה הושלמה', kind: 'yesno' },
        { key: 'inverter_mounted', label_he: 'ממיר הותקן', kind: 'yesno' },
        { key: 'ac_connected', label_he: 'צד AC חובר ללוח', kind: 'yesno' },
      ],
    },
    {
      kind: 'fields',
      key: 'issues',
      title_he: 'חסמים וחריגות',
      fields: [
        { key: 'blockers', label_he: 'חסמים', kind: 'textarea', hint_he: 'מה עצר את העבודה ומה צריך כדי להמשיך' },
        { key: 'as_made', label_he: 'שינויים מול התכנון (as-made)', kind: 'textarea', hint_he: 'מספר מודולים בפאה, חלוקת מחרוזות, תוואי, מיקום ממיר…' },
        { key: 'missing_material', label_he: 'ציוד חסר', kind: 'textarea' },
        { key: 'notes', label_he: 'הערות', kind: 'textarea' },
      ],
    },
    { kind: 'photos', key: 'photos', title_he: 'תמונות היום', min: 1 },
    { kind: 'signatures', key: 'sign', title_he: 'חתימה', signers: [{ key: 'foreman', label_he: 'מנהל העבודה', required: true }] },
  ],
  outcome: (r) => {
    const planned = num(field(r, 'progress', 'modules_planned'))
    const done = num(field(r, 'progress', 'modules_mounted'))
    if (planned === null || done === null || planned <= 0) return null
    const pct = Math.min(100, Math.round((done / planned) * 100))
    return { tone: field(r, 'issues', 'blockers').trim() ? 'warn' : 'ok', label_he: `${pct}% מהמודולים הותקנו${field(r, 'issues', 'blockers').trim() ? ' · יש חסמים' : ''}` }
  },
}

// ── 2. Installation checklist (spec 15 §a.3) ─────────────────────────────

const ci = (code: string, label_he: string, evidence: ChecklistItemDef['evidence'], extra: Partial<ChecklistItemDef> = {}): ChecklistItemDef => ({
  code,
  label_he,
  evidence,
  required: true,
  ...extra,
})

const installation: ReportTemplate = {
  key: 'installation_checklist',
  version: 1,
  title_he: 'צ׳קליסט התקנה',
  description_he: 'בדיקת ביצוע לפי סוג הגג, הממיר, אופטימייזרים ואגירה. הפריט האחרון — מוכן לבודק — הוא תנאי היציאה מההתקנה.',
  sections: [
    {
      kind: 'checklist',
      key: 'safety',
      title_he: 'בטיחות',
      items: [
        ci('SAF-01', 'תדריך בטיחות בוצע ונחתם', 'none'),
        ci('SAF-02', 'קו חיים / מעקה / רתמות לפי גובה העבודה', 'photo'),
        ci('SAF-03', 'אזור העבודה מגודר ומסומן', 'photo'),
      ],
    },
    {
      kind: 'checklist',
      key: 'structure',
      title_he: 'קונסטרוקציה',
      items: [
        ci('STR-TILE-1', 'ווי גג לפי תוכנית הקונסטרוקטור — מרווח ועיגון לקורה', 'photo', { applies: { roofTypes: ['tile'] } }),
        ci('STR-TILE-2', 'אטימה סביב כל חדירה', 'photo', { applies: { roofTypes: ['tile'] } }),
        ci('STR-TILE-3', 'מסילות ופרופילי חיבור מהודקים', 'photo', { applies: { roofTypes: ['tile'] } }),
        ci('STR-METAL-1', 'קלאמפים / ברגי self-drill לפי היצרן, אטמי EPDM', 'photo', { applies: { roofTypes: ['metal-standing-seam', 'metal-trapezoidal'] } }),
        ci('STR-METAL-2', 'אין ניקובים מיותרים בפח', 'photo', { applies: { roofTypes: ['metal-standing-seam', 'metal-trapezoidal'] } }),
        ci('STR-FLAT-1', 'בלסט / חדירות לפי הקונסטרוקטור', 'photo', { applies: { roofTypes: ['flat'] } }),
        ci('STR-FLAT-2', 'משקל בלסט למודול', 'value', { unit: 'ק״ג', applies: { roofTypes: ['flat'] } }),
        ci('STR-FLAT-3', 'הגנת יריעת איטום ומרווחי שורות לפי תכנון הצל', 'photo', { applies: { roofTypes: ['flat'] } }),
        ci('STR-GND-1', 'יסודות / עמודים לפי התוכנית, גובה תחתון וגידור', 'photo', { applies: { roofTypes: ['ground'] } }),
        ci('STR-ALL-1', 'אישור קונסטרוקטור בתיק', 'document', { required: false }),
      ],
    },
    {
      kind: 'checklist',
      key: 'modules',
      title_he: 'מודולים',
      items: [
        ci('MOD-01', 'כמות ודגם לפי כתב הכמויות', 'value', { unit: 'מודולים' }),
        ci('MOD-02', 'סריאלים נסרקו (קובץ / תמונות מדבקות)', 'document'),
        ci('MOD-03', 'קלאמפים בהידוק לפי מומנט היצרן, מרווחי התפשטות', 'photo'),
      ],
    },
    {
      kind: 'checklist',
      key: 'dc',
      title_he: 'DC',
      items: [
        ci('DC-01', 'כבל סולארי בחתך לפי התכנון', 'value', { unit: 'mm²' }),
        ci('DC-02', 'סימון +/− ומספר מחרוזת בשני הקצוות', 'photo'),
        ci('DC-03', 'תעלות / הגנת UV, רדיוסי כיפוף', 'photo'),
        ci('DC-04', 'מחברים מאותו יצרן בשני הצדדים', 'photo'),
        ci('DC-OPT-1', 'סריאל אופטימייזר ↔ מיקום במפה (layout)', 'document', { applies: { hasOptimizers: true } }),
        ci('DC-OPT-2', 'pairing בוצע; מתח מחרוזת לפני pairing כצפוי (≈1V לאופטימייזר)', 'value', { unit: 'V', applies: { hasOptimizers: true } }),
        ci('DC-STR-1', 'Voc של כל מחרוזת בטווח ה-MPPT (לפני חיבור)', 'value', { unit: 'V', applies: { hasOptimizers: false } }),
        ci('DC-STR-2', 'קוטביות נבדקה לפני חיבור לממיר', 'none', { applies: { hasOptimizers: false } }),
      ],
    },
    {
      kind: 'checklist',
      key: 'inverter',
      title_he: 'ממיר',
      items: [
        ci('INV-01', 'מיקום, אוורור ומרחקים לפי היצרן', 'photo'),
        ci('INV-02', 'הארקת ממיר — חתך בפועל', 'value', { unit: 'mm²', ruleRef: 'R14' }),
        ci('INV-03', 'מפסק / מנתק לפי מרחק', 'photo', { ruleRef: 'R12' }),
        ci('INV-04', 'שילוט על הממיר', 'photo'),
      ],
    },
    {
      kind: 'checklist',
      key: 'ac',
      title_he: 'AC ולוח',
      items: [
        ci('AC-01', 'מפסק ראשי PV + שלט', 'photo', { ruleRef: 'R11' }),
        ci('AC-02', 'ממסר פחת — סוג B, או הצהרת ממיר 62109 בתיק', 'photo', { ruleRef: 'R13' }),
        ci('AC-03', 'מדידה עקיפה כשנדרש', 'none', { ruleRef: 'R9', required: false }),
        ci('AC-04', 'ארון מונה ייצור כשנדרש', 'photo', { ruleRef: 'R8', required: false }),
        ci('AC-05', 'לוח בתו תקן', 'photo', { ruleRef: 'R23' }),
      ],
    },
    {
      kind: 'checklist',
      key: 'earthing',
      title_he: 'הארקה ו-SPD',
      items: [
        ci('EAR-01', 'פס השוואת פוטנציאלים', 'photo', { ruleRef: 'R14' }),
        ci('EAR-02', 'SPD בצד DC ובצד AC', 'photo'),
        ci('EAR-03', 'רציפות הארקה — מדידה ראשונית', 'value', { unit: 'Ω' }),
      ],
    },
    {
      kind: 'checklist',
      key: 'battery',
      title_he: 'אגירה',
      applies: { hasBattery: true },
      items: [
        ci('BAT-01', 'מפסק משולט, לחצן חירום, מרחקים ומעבר לפי הכללים', 'photo', { ruleRef: 'R20' }),
        ci('BAT-02', 'תקן הסוללה בתיק', 'document', { ruleRef: 'R22' }),
      ],
    },
    {
      kind: 'checklist',
      key: 'labels_comm',
      title_he: 'שילוט, כבאות ותקשורת',
      items: [
        ci('LAB-01', 'שילוט DC/AC, ניתוק חירום, מנתקי DC', 'photo', { ruleRef: 'R19' }),
        ci('COMM-01', 'ממיר מחובר לרשת (ETH / WiFi / LTE) ונראה באפליקציית היצרן', 'photo'),
        ci('COMM-02', 'IP / SIM נרשמו', 'value', { required: false }),
      ],
    },
    {
      kind: 'checklist',
      key: 'cleanup',
      title_he: 'ניקיון',
      items: [ci('CLN-01', 'פינוי פסולת, גג נקי, תמונות "אחרי"', 'photo')],
    },
    {
      kind: 'signatures',
      key: 'sign',
      title_he: 'מוכן לבדיקת בודק',
      hint_he: 'חתימת מנהל העבודה מאשרת שההתקנה הושלמה ומוכנה לבודק.',
      signers: [{ key: 'foreman', label_he: 'מנהל העבודה', required: true }],
    },
  ],
  outcome: (r) => {
    const fails = Object.values(r.checklists).flatMap((s) => Object.values(s)).filter((e) => e.result === 'fail').length
    return fails ? { tone: 'fail', label_he: `${fails} פריטים לא תקינים` } : null
  },
}

// ── 3. IEC 62446-1 inspection, category 1 (spec 15 §b.3) ────────────────

/** Optimizer systems (SolarEdge) read ≈1 V per optimizer before pairing, not module Voc. */
export const OPTIMIZER_SAFE_V = 1

/**
 * Expected Voc at the measured module temperature (schema: moduleStc.vocV × N × (1 + βVoc × (T − 25))).
 * βVoc of a PV module is always negative: −|β| is used, so "0.28" typed on a phone keypad
 * without a minus key means −0.28 %/°C.
 */
export function expectedVoc(r: ReportInstance, row: Row): number | null {
  const n = num(row.modules)
  if (n === null) return null
  if (r.context.hasOptimizers) return n * OPTIMIZER_SAFE_V
  const voc = num(field(r, 'system', 'module_voc'))
  if (voc === null) return null
  const beta = -Math.abs(num(field(r, 'system', 'beta_voc')) ?? 0)
  const t = num(field(r, 'environment', 'module_temp'))
  const factor = t === null ? 1 : 1 + (beta / 100) * (t - 25)
  return voc * n * factor
}

/** Megger readings above range (">2000", "OL") are a pass, not a missing value. */
export function readRiso(s: string | undefined): number | null {
  const t = String(s ?? '').trim()
  if (/^(OL|>\s*\d)/i.test(t)) return Number.POSITIVE_INFINITY
  return num(t)
}

/** Expected Isc scaled by irradiance (schema: moduleStc.iscA × G/1000). */
export function expectedIsc(r: ReportInstance): number | null {
  const isc = num(field(r, 'system', 'module_isc'))
  const g = num(field(r, 'environment', 'irradiance'))
  if (isc === null || g === null) return null
  return isc * (g / 1000)
}

export function deviationPct(measured: number | null, expected: number | null): number | null {
  if (measured === null || expected === null || expected === 0) return null
  return ((measured - expected) / expected) * 100
}

export type StringResult = 'pass' | 'warn' | 'fail' | ''

/**
 * pass / warn / fail for one string. Polarity or Riso below the limit fail;
 * Voc/Isc outside the tolerance warn (spec: tolerance is a warning, values לאימות).
 * Empty when there is not enough data to decide.
 */
export function stringResult(r: ReportInstance, row: Row): StringResult {
  if (row.polarity === 'no') return 'fail'
  const riso = readRiso(row.riso)
  const rmin = num(field(r, 'thresholds', 'riso_min'))
  if (riso !== null && rmin !== null && riso < rmin) return 'fail'
  if (row.polarity !== 'yes' || num(row.voc) === null || riso === null) return ''
  const vt = num(field(r, 'thresholds', 'voc_tol'))
  const it = num(field(r, 'thresholds', 'isc_tol'))
  const dv = deviationPct(num(row.voc), expectedVoc(r, row))
  const di = deviationPct(num(row.isc), expectedIsc(r))
  if ((vt !== null && dv !== null && Math.abs(dv) > vt) || (it !== null && di !== null && Math.abs(di) > it)) return 'warn'
  return 'pass'
}

const RESULT_HE: Record<StringResult, string> = { pass: 'תקין', warn: 'אזהרה', fail: 'נכשל', '': '' }

export function inspectionVerdict(r: ReportInstance): { overall: 'pass' | 'pass_with_defects' | 'fail' | ''; fails: string[]; warns: string[] } {
  const fails: string[] = []
  const warns: string[] = []
  for (const row of r.tables.strings ?? []) {
    const res = stringResult(r, row)
    if (res === 'fail') fails.push(`מחרוזת ${row.label || '?'}`)
    if (res === 'warn') warns.push(`מחרוזת ${row.label || '?'}`)
  }
  for (const [sec, entries] of Object.entries(r.checklists)) {
    for (const [code, e] of Object.entries(entries)) if (e.result === 'fail') fails.push(`${code}${sec === 'functional' ? ' (תפקוד)' : ''}`)
  }
  for (const row of r.tables.earthing ?? []) if (row.result === 'fail') fails.push(`רציפות ${row.from || ''}→${row.to || ''}`)
  for (const row of r.tables.rcd ?? []) if (row.result === 'fail') fails.push(`פחת ${row.board || ''}`)
  for (const row of r.tables.inverters ?? []) if (row.start === 'no' || row.anti_islanding === 'no') fails.push(`ממיר ${row.sn || ''}`)
  // A pass needs every listed string evaluated — one unreadable value means no verdict yet.
  const rows = (r.tables.strings ?? []).filter((row) => Object.values(row).some((v) => (v ?? '').trim()))
  const allEvaluated = rows.length > 0 && rows.every((row) => stringResult(r, row) !== '')
  const overall = fails.length ? 'fail' : !allEvaluated ? '' : warns.length ? 'pass_with_defects' : 'pass'
  return { overall, fails, warns }
}

const visual = (code: string, label_he: string, ruleRef?: string): ChecklistItemDef => ({ code, label_he, evidence: 'none', required: true, ...(ruleRef ? { ruleRef } : {}) })

const inspection: ReportTemplate = {
  key: 'inspection_62446',
  version: 1,
  title_he: 'בדיקת מתקן — IEC 62446-1 (קטגוריה 1)',
  description_he: 'רשומת בדיקה: בחינה חזותית, רציפות הארקה, מדידות לכל מחרוזת (קוטביות, Voc, Isc, Riso), ממירים, פחת ותפקוד. הספים הם פרמטרים לאימות.',
  sections: [
    {
      kind: 'fields',
      key: 'inspector',
      title_he: 'בודק ומועד',
      fields: [
        { key: 'name', label_he: 'שם הבודק', kind: 'text', required: true },
        { key: 'license', label_he: 'מספר רישיון', kind: 'text', required: true },
        { key: 'license_type', label_he: 'סוג בודק', kind: 'select', options: ['1', '2', '3'].map((v) => ({ value: v, label_he: `סוג ${v}` })), hint_he: 'הסף לפי גודל המתקן — לאימות (R17)' },
        { key: 'date', label_he: 'תאריך הבדיקה', kind: 'date', required: true, prefill: today },
        { key: 'kind', label_he: 'סוג בדיקה', kind: 'select', options: [{ value: 'initial', label_he: 'ראשונה' }, { value: 'retest', label_he: 'חוזרת' }, { value: 'periodic', label_he: 'תקופתית' }] },
      ],
    },
    {
      kind: 'fields',
      key: 'system',
      title_he: 'המערכת',
      hint_he: 'נתוני דף הנתונים של המודול משמשים לחישוב ה-Voc וה-Isc הצפויים.',
      fields: [
        { key: 'dc_kwp', label_he: 'הספק DC', kind: 'number', unit: 'kWp', prefill: (c) => (c.dcKwp ? String(c.dcKwp) : '') },
        { key: 'ac_kw', label_he: 'הספק AC', kind: 'number', unit: 'kW', prefill: (c) => (c.acKw ? String(c.acKw) : '') },
        { key: 'main_breaker', label_he: 'מפסק ראשי', kind: 'text', prefill: (c) => c.mainBreaker },
        { key: 'module_model', label_he: 'דגם מודול', kind: 'text', prefill: (c) => c.moduleModel },
        { key: 'module_count', label_he: 'מספר מודולים', kind: 'number', prefill: (c) => (c.moduleCount ? String(c.moduleCount) : '') },
        { key: 'module_voc', label_he: 'Voc של מודול (STC)', kind: 'number', unit: 'V', hint_he: 'מדף הנתונים' },
        { key: 'module_isc', label_he: 'Isc של מודול (STC)', kind: 'number', unit: 'A', hint_he: 'מדף הנתונים' },
        { key: 'beta_voc', label_he: 'מקדם טמפ׳ Voc', kind: 'number', unit: '%/°C', hint_he: 'מדף הנתונים, למשל 0.25 — נחשב תמיד כשלילי' },
        { key: 'inverters', label_he: 'ממירים (דגם וסריאל)', kind: 'textarea', prefill: (c) => (c.inverterModel ? `${c.inverterCount ?? 1} × ${c.inverterModel}` : '') },
      ],
    },
    {
      kind: 'fields',
      key: 'environment',
      title_he: 'תנאי סביבה',
      fields: [
        { key: 'irradiance', label_he: 'קרינה', kind: 'number', unit: 'W/m²' },
        { key: 'irradiance_method', label_he: 'אמצעי מדידת קרינה', kind: 'select', options: [{ value: 'pyranometer', label_he: 'פירנומטר' }, { value: 'reference_cell', label_he: 'תא ייחוס' }, { value: 'app_estimate', label_he: 'הערכה מאפליקציה' }, { value: 'none', label_he: 'לא נמדד' }], required: true },
        { key: 'ambient', label_he: 'טמפ׳ סביבה', kind: 'number', unit: '°C' },
        { key: 'module_temp', label_he: 'טמפ׳ מודול', kind: 'number', unit: '°C' },
        { key: 'weather', label_he: 'מזג אוויר', kind: 'select', options: WEATHER },
      ],
    },
    {
      kind: 'fields',
      key: 'thresholds',
      title_he: 'ספי בדיקה',
      hint_he: 'פרמטרים — הערכים בתקן לא אומתו. ספים שלא מולאו לא נבדקים.',
      fields: [
        { key: 'riso_min', label_he: 'Riso מינימלי', kind: 'number', unit: 'MΩ', unverified: true },
        { key: 'riso_test_v', label_he: 'מתח בדיקת בידוד', kind: 'select', options: ['250', '500', '1000', '1500'].map((v) => ({ value: v, label_he: `${v} V` })), unverified: true, hint_he: 'לא פחות מ-Voc בקור של המחרוזת' },
        { key: 'voc_tol', label_he: 'סטיית Voc מותרת (אזהרה)', kind: 'number', unit: '%', unverified: true, prefill: () => '5' },
        { key: 'isc_tol', label_he: 'סטיית Isc מותרת (אזהרה)', kind: 'number', unit: '%', unverified: true },
      ],
    },
    {
      kind: 'table',
      key: 'instruments',
      title_he: 'מכשירי מדידה',
      minRows: 1,
      addLabel_he: 'הוסף מכשיר',
      columns: [
        { key: 'kind', label_he: 'סוג', kind: 'select', required: true, w: 2, options: [{ value: 'megger', label_he: 'מגר' }, { value: 'clamp_dc', label_he: 'מצמד DC' }, { value: 'multimeter', label_he: 'רב-מודד' }, { value: 'irradiance_meter', label_he: 'מד קרינה' }, { value: 'rcd_tester', label_he: 'בודק פחת' }, { value: 'earth_tester', label_he: 'בודק הארקה' }, { value: 'ir_camera', label_he: 'מצלמה תרמית' }, { value: 'other', label_he: 'אחר' }] },
        { key: 'model', label_he: 'דגם', kind: 'text', required: true, w: 2 },
        { key: 'sn', label_he: 'סריאלי', kind: 'text', w: 2 },
        { key: 'calibration', label_he: 'כיול עד', kind: 'text', w: 1.5 },
      ],
    },
    {
      kind: 'checklist',
      key: 'visual',
      title_he: 'בחינה חזותית',
      items: [
        visual('V-DC-01', 'כבלי DC מוגנים, מסומנים ומעוגנים; ללא נזק'),
        visual('V-DC-02', 'מחברים תואמים, סגורים ונעולים'),
        visual('V-AC-01', 'חיווט AC ולוחות תקינים, ללא חום חריג'),
        visual('V-LAB-01', 'שילוט DC/AC, מפסקים ואזהרות', 'R19'),
        visual('V-PRT-01', 'הגנות זרם-יתר ו-SPD לפי התכנון'),
        visual('V-DIS-01', 'אמצעי ניתוק DC ו-AC נגישים ומסומנים', 'R12'),
        visual('V-DIS-02', 'מפסק ראשי PV ושלט', 'R11'),
        visual('V-EAR-01', 'מוליכי הארקה והשוואת פוטנציאלים', 'R14'),
        visual('V-STR-01', 'מבנה, עיגון ואטימות תקינים'),
        { ...visual('V-BAT-01', 'אגירה: מרחקים, אוורור, ניתוק חירום', 'R20'), applies: { hasBattery: true } },
      ],
    },
    {
      kind: 'table',
      key: 'earthing',
      title_he: 'רציפות הארקה',
      addLabel_he: 'הוסף מדידה',
      columns: [
        { key: 'from', label_he: 'מ-', kind: 'text', required: true, w: 2 },
        { key: 'to', label_he: 'אל', kind: 'text', required: true, w: 2 },
        { key: 'ohm', label_he: 'התנגדות', kind: 'number', unit: 'Ω', required: true, w: 1.2 },
        { key: 'mm2', label_he: 'חתך', kind: 'number', unit: 'mm²', w: 1 },
        { key: 'result', label_he: 'תוצאה', kind: 'select', required: true, w: 1.2, options: [{ value: 'pass', label_he: 'תקין' }, { value: 'fail', label_he: 'נכשל' }] },
      ],
    },
    {
      kind: 'table',
      key: 'strings',
      title_he: 'מחרוזות',
      hint_he: 'שורה לכל מחרוזת. בלי שורה לכל מחרוזת אי אפשר לחתום על הבדיקה.',
      minRows: 1,
      addLabel_he: 'הוסף מחרוזת',
      columns: [
        { key: 'label', label_he: 'מחרוזת', kind: 'text', required: true, w: 1.2 },
        { key: 'inverter', label_he: 'ממיר / MPPT', kind: 'text', w: 1.4 },
        { key: 'modules', label_he: 'מודולים', kind: 'number', required: true, w: 1 },
        { key: 'polarity', label_he: 'קוטביות', kind: 'yesno', required: true, w: 1 },
        { key: 'voc', label_he: 'Voc', kind: 'number', unit: 'V', required: true, w: 1 },
        { key: 'voc_exp', label_he: 'Voc צפוי', kind: 'computed', unit: 'V', w: 1, compute: (row, r) => fmt(expectedVoc(r, row), 0) },
        { key: 'voc_dev', label_he: 'סטיית Voc', kind: 'computed', unit: '%', w: 0.9, compute: (row, r) => fmt(deviationPct(num(row.voc), expectedVoc(r, row))) },
        { key: 'isc', label_he: 'Isc', kind: 'number', unit: 'A', w: 0.9 },
        { key: 'isc_dev', label_he: 'סטיית Isc', kind: 'computed', unit: '%', w: 0.9, compute: (row, r) => fmt(deviationPct(num(row.isc), expectedIsc(r))) },
        { key: 'riso', label_he: 'Riso', kind: 'number', unit: 'MΩ', required: true, w: 1 },
        { key: 'result', label_he: 'תוצאה', kind: 'computed', w: 1, compute: (row, r) => RESULT_HE[stringResult(r, row)] },
      ],
    },
    {
      kind: 'table',
      key: 'inverters',
      title_he: 'ממירים',
      addLabel_he: 'הוסף ממיר',
      columns: [
        { key: 'sn', label_he: 'סריאלי', kind: 'text', required: true, w: 2 },
        { key: 'start', label_he: 'הפעלה תקינה', kind: 'yesno', required: true, w: 1.2 },
        { key: 'anti_islanding', label_he: 'ניתוק בהפסקת רשת', kind: 'yesno', w: 1.4 },
        { key: 'profile', label_he: 'פרופיל רשת', kind: 'text', w: 1.4 },
        { key: 'firmware', label_he: 'קושחה', kind: 'text', w: 1.2 },
        { key: 'comm', label_he: 'תקשורת', kind: 'yesno', w: 1 },
      ],
    },
    {
      kind: 'table',
      key: 'rcd',
      title_he: 'לוחות וממסר פחת',
      addLabel_he: 'הוסף לוח',
      columns: [
        { key: 'board', label_he: 'לוח', kind: 'text', required: true, w: 2 },
        { key: 'type', label_he: 'סוג פחת', kind: 'select', w: 1, options: ['A', 'B', 'F', 'AC', 'none'].map((v) => ({ value: v, label_he: v === 'none' ? 'אין' : v })) },
        { key: 'rated', label_he: 'זרם נקוב', kind: 'number', unit: 'mA', w: 1 },
        { key: 'trip_ms', label_he: 'זמן ניתוק', kind: 'number', unit: 'ms', w: 1 },
        { key: 'button', label_he: 'לחצן בדיקה', kind: 'yesno', w: 1 },
        { key: 'result', label_he: 'תוצאה', kind: 'select', required: true, w: 1, options: [{ value: 'pass', label_he: 'תקין' }, { value: 'fail', label_he: 'נכשל' }, { value: 'na', label_he: 'לא רלוונטי' }] },
      ],
    },
    {
      kind: 'checklist',
      key: 'functional',
      title_he: 'בדיקות תפקוד',
      items: [
        visual('F-01', 'מפסקים ומנתקים פועלים'),
        visual('F-02', 'ניתוק חירום פועל', 'R11'),
        visual('F-03', 'תקשורת ניטור פועלת'),
        { ...visual('F-04', 'הגבלת ייצוא אומתה (כשנדרש)', 'R10'), required: false },
      ],
    },
    {
      kind: 'fields',
      key: 'summary',
      title_he: 'סיכום',
      fields: [{ key: 'notes', label_he: 'הערות הבודק', kind: 'textarea' }],
    },
    { kind: 'photos', key: 'photos', title_he: 'תמונות' },
    {
      kind: 'signatures',
      key: 'sign',
      title_he: 'חתימות',
      signers: [
        { key: 'inspector', label_he: 'הבודק', required: true },
        { key: 'installer', label_he: 'המתקין (נוכח)' },
      ],
    },
  ],
  validate: (r) => {
    const out: string[] = []
    if (field(r, 'environment', 'irradiance_method') !== 'none' && num(field(r, 'environment', 'irradiance')) === null) out.push('חסרה מדידת קרינה (או לסמן "לא נמדד")')
    if (!r.context.hasOptimizers && num(field(r, 'thresholds', 'voc_tol')) !== null && (num(field(r, 'environment', 'module_temp')) === null || num(field(r, 'system', 'beta_voc')) === null)) {
      out.push('Voc צפוי מחושב בלי תיקון טמפרטורה — חסרים טמפ׳ מודול או מקדם טמפ׳')
    }
    if (r.context.hasOptimizers) out.push('מערכת עם אופטימייזרים: Voc צפוי ≈ 1V לאופטימייזר (לפני pairing)')
    if (!num(field(r, 'thresholds', 'riso_min'))) out.push('לא הוגדר סף Riso — הבידוד לא נבדק מול סף (פרמטר לאימות)')
    return out
  },
  outcome: (r) => {
    const v = inspectionVerdict(r)
    if (!v.overall) return null
    if (v.overall === 'fail') return { tone: 'fail', label_he: `נכשל · ${v.fails.length} ליקויים` }
    if (v.overall === 'pass_with_defects') return { tone: 'warn', label_he: `עבר עם הערות · ${v.warns.length} אזהרות` }
    return { tone: 'ok', label_he: 'עבר' }
  },
}

// ── 4. Defects (spec 15 §b.5) ────────────────────────────────────────────

export const SEVERITY: Option[] = [
  { value: 'critical', label_he: 'קריטי' },
  { value: 'major', label_he: 'מהותי' },
  { value: 'minor', label_he: 'קל' },
]

export const DEFECT_STATUS: Option[] = [
  { value: 'open', label_he: 'פתוח' },
  { value: 'fixed', label_he: 'תוקן — ממתין לבדיקה' },
  { value: 'closed', label_he: 'נסגר' },
  { value: 'waived', label_he: 'ויתור (באישור ברק)' },
]

export function openDefects(r: ReportInstance): Row[] {
  return (r.tables.defects ?? []).filter((d) => (d.description || d.code) && d.status !== 'closed' && d.status !== 'waived')
}

const defects: ReportTemplate = {
  key: 'defects',
  version: 1,
  title_he: 'רשימת ליקויים',
  description_he: 'ליקויים מבדיקה, מהשטח או מחח״י: חומרה, מיקום, סטטוס ותיקון. ליקוי פתוח חוסם מסירה.',
  sections: [
    {
      kind: 'fields',
      key: 'general',
      title_he: 'מקור',
      fields: [
        { key: 'source', label_he: 'מקור הליקויים', kind: 'select', required: true, options: [{ value: 'inspector', label_he: 'בודק פרטי' }, { value: 'iec', label_he: 'בודק חח״י' }, { value: 'internal', label_he: 'פנימי / שטח' }, { value: 'customer', label_he: 'לקוח' }] },
        { key: 'date', label_he: 'תאריך', kind: 'date', required: true, prefill: today },
        { key: 'ref', label_he: 'אסמכתא (דוח בדיקה)', kind: 'text' },
      ],
    },
    {
      kind: 'table',
      key: 'defects',
      title_he: 'ליקויים',
      minRows: 1,
      addLabel_he: 'הוסף ליקוי',
      columns: [
        { key: 'code', label_he: 'קוד', kind: 'text', w: 1 },
        { key: 'severity', label_he: 'חומרה', kind: 'select', options: SEVERITY, required: true, w: 1 },
        { key: 'blocks', label_he: 'חוסם חיבור', kind: 'yesno', w: 1 },
        { key: 'location', label_he: 'מיקום', kind: 'text', w: 1.4 },
        { key: 'description', label_he: 'תיאור', kind: 'text', required: true, w: 3 },
        { key: 'status', label_he: 'סטטוס', kind: 'select', options: DEFECT_STATUS, required: true, w: 1.4 },
        { key: 'fix', label_he: 'תיקון / הערה', kind: 'text', w: 2 },
      ],
    },
    { kind: 'photos', key: 'photos', title_he: 'תמונות' },
    { kind: 'signatures', key: 'sign', title_he: 'חתימה', signers: [{ key: 'responsible', label_he: 'אחראי' }] },
  ],
  validate: (r) => {
    const out: string[] = []
    for (const d of r.tables.defects ?? []) {
      if (d.status === 'waived' && !(d.fix ?? '').trim()) out.push(`ויתור על ליקוי ${d.code || d.description} — חסרה סיבה בעמודת ההערה`)
    }
    return out
  },
  outcome: (r) => {
    const open = openDefects(r)
    if (!open.length) return (r.tables.defects ?? []).some((d) => d.description) ? { tone: 'ok', label_he: 'כל הליקויים נסגרו' } : null
    const critical = open.filter((d) => d.severity === 'critical' || d.blocks === 'yes').length
    return { tone: critical ? 'fail' : 'warn', label_he: `${open.length} פתוחים${critical ? ` · ${critical} חוסמים` : ''}` }
  },
}

// ── 5. Commissioning + handover (spec 15 §d) ─────────────────────────────

const hi = (code: string, label_he: string, evidence: ChecklistItemDef['evidence'], extra: Partial<ChecklistItemDef> = {}): ChecklistItemDef => ({
  code,
  label_he,
  evidence,
  required: true,
  ...extra,
})

const handover: ReportTemplate = {
  key: 'handover',
  version: 1,
  title_he: 'הפעלה ומסירה ללקוח',
  description_he: 'הפעלה ראשונה, נתוני מונה, רשימת ציוד וסריאלים, תיק מתקן, אחריות, הדרכה וחתימת הלקוח.',
  sections: [
    {
      kind: 'checklist',
      key: 'commissioning',
      title_he: 'הפעלה (commissioning)',
      items: [
        hi('COM-01', 'אישור הפעלה של חח״י התקבל', 'document'),
        hi('COM-03', 'פרופיל רשת בממיר מוגדר לישראל', 'photo', { ruleRef: 'V8' }),
        hi('COM-04', 'כל הממירים במצב ייצור, ללא קודי תקלה', 'photo'),
        hi('COM-05', 'הספק AC רגעי', 'value', { unit: 'kW' }),
        hi('COM-07', 'המונה סופר נכון (כיוון זרימה, השוואה לממיר)', 'value', { unit: 'kWh' }),
        hi('COM-08', 'אגירה: מחזור טעינה/פריקה וגבולות לפי האישור', 'value', { applies: { hasBattery: true }, ruleRef: 'R21' }),
        hi('COM-09', 'ניתוק חירום / מפסק ראשי PV נבדק בפועל', 'photo', { ruleRef: 'R11' }),
        hi('COM-10', 'האתר מופיע באפליקציית היצרן ומציג ייצור', 'photo'),
      ],
    },
    {
      kind: 'fields',
      key: 'meter',
      title_he: 'מונה וחיבור',
      fields: [
        { key: 'meter_serial', label_he: 'מספר מונה', kind: 'text', required: true, prefill: (c) => c.meterNumber },
        { key: 'contract', label_he: 'מספר חוזה / חשבון חח״י', kind: 'text' },
        { key: 'connection', label_he: 'גודל חיבור', kind: 'text', prefill: (c) => c.mainBreaker },
        { key: 'activated_at', label_he: 'תאריך הפעלה', kind: 'date', required: true, prefill: today },
      ],
    },
    {
      kind: 'table',
      key: 'equipment',
      title_he: 'ציוד וסריאלים',
      minRows: 1,
      addLabel_he: 'הוסף פריט',
      prefillRows: (c) => {
        const rows: Row[] = []
        if (c.moduleCount) rows.push({ item: 'מודולים', model: c.moduleModel, qty: String(c.moduleCount), serial: '' })
        if (c.inverterModel) rows.push({ item: 'ממיר', model: c.inverterModel, qty: String(c.inverterCount ?? 1), serial: '' })
        if (c.optimizerCount) rows.push({ item: 'אופטימייזרים', model: '', qty: String(c.optimizerCount), serial: '' })
        if (c.batteryModel) rows.push({ item: 'סוללה', model: c.batteryModel, qty: '1', serial: '' })
        return rows
      },
      columns: [
        { key: 'item', label_he: 'פריט', kind: 'text', required: true, w: 1.5 },
        { key: 'model', label_he: 'דגם', kind: 'text', w: 2.5 },
        { key: 'qty', label_he: 'כמות', kind: 'number', w: 0.8 },
        { key: 'serial', label_he: 'סריאלי / קובץ סריאלים', kind: 'text', w: 2.5 },
      ],
    },
    {
      kind: 'checklist',
      key: 'handover',
      title_he: 'מסירה',
      items: [
        hi('HND-01', 'דוח בדיקה 62446-1 חתום, ללא ליקויים פתוחים', 'document'),
        hi('HND-04', 'רשימת ציוד וסריאלים בתיק', 'document'),
        hi('HND-05', 'דפי נתונים לכל הציוד', 'document'),
        hi('HND-07', 'הוראות הפעלה, כיבוי, חירום ותחזוקה', 'document'),
        hi('HND-09', 'מסמכי אחריות נמסרו ללקוח', 'document'),
        hi('HND-10', 'אישורי חח״י בתיק', 'document'),
        hi('HND-12', 'תעודת בודק — עותק ללקוח', 'document'),
        hi('HND-13', 'תמונות לפני / אחרי', 'photo'),
        hi('HND-15', 'הדרכת לקוח: כיבוי חירום, אפליקציה, מה עושים בהתראה, ניקוי', 'none'),
        hi('HND-16', 'גישה לאפליקציית היצרן בחשבון של הלקוח', 'value'),
        hi('HND-17', 'הוצגה הצעה לחוזה תחזוקה', 'none', { required: false }),
      ],
    },
    {
      kind: 'fields',
      key: 'warranty',
      title_he: 'אחריות',
      fields: [{ key: 'lines', label_he: 'אחריות לפי רכיב', kind: 'textarea', hint_he: 'שורה לכל רכיב — מולא מהמחירון', prefill: (c) => c.warrantyLines.join('\n') }],
    },
    { kind: 'photos', key: 'photos', title_he: 'תמונות', min: 1 },
    {
      kind: 'signatures',
      key: 'sign',
      title_he: 'חתימות מסירה',
      hint_he: 'הלקוח מאשר שקיבל את המערכת, את תיק המתקן ואת ההדרכה.',
      signers: [
        { key: 'customer', label_he: 'הלקוח', required: true },
        { key: 'bee', label_he: 'נציג B.E.E', required: true },
      ],
    },
  ],
  validate: (_r, others) => {
    const out: string[] = []
    // The latest locked inspection decides (a passed retest supersedes a failed one).
    const latest = others
      .filter((o) => o.templateKey === 'inspection_62446' && o.status === 'final')
      .sort((a, b) => (b.finalizedAt ?? '').localeCompare(a.finalizedAt ?? ''))[0]
    if (!latest) out.push('אין דוח בדיקה 62446-1 נעול לפרויקט (HND-01)')
    else if (inspectionVerdict(latest).overall === 'fail') out.push('דוח הבדיקה האחרון נכשל — נדרשת בדיקה חוזרת שעברה')
    // Only the latest revision of each defects list counts (rev 2 that closes everything supersedes rev 1).
    const superseded = new Set(others.map((o) => o.supersedes).filter(Boolean))
    const open = others.filter((o) => o.templateKey === 'defects' && !superseded.has(o.id)).flatMap(openDefects)
    if (open.length) out.push(`${open.length} ליקויים פתוחים בדוחות הליקויים`)
    return out
  },
  outcome: (r) => (r.signatures.customer ? { tone: 'ok', label_he: `נמסר ללקוח · ${r.signatures.customer.name}` } : null),
}

export const TEMPLATES: Record<TemplateKey, ReportTemplate> = {
  daily_report: daily,
  installation_checklist: installation,
  inspection_62446: inspection,
  defects,
  handover,
}

export const TEMPLATE_ORDER: TemplateKey[] = ['daily_report', 'installation_checklist', 'inspection_62446', 'defects', 'handover']
