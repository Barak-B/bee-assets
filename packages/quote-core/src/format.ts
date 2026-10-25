import type { QuoteVersion } from './types'

export function formatIls(n: number | null | undefined, fraction = 0): string {
  if (n === null || n === undefined) return 'לאימות'
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: fraction })} ₪`
}

const FLAG_LABELS: Record<string, string> = {
  'sizing:no_kwp_basis': 'אין בסיס לקביעת הספק: חסר יעד kWp, שטח או צריכה',
  'sizing:area_insufficient': 'השטח השימושי קטן מהנדרש להספק המבוקש',
  'sizing:multiple_inverters': 'נדרש יותר מממיר אחד',
  'catalog:no_module': 'אין מודול פעיל בקטלוג',
  'catalog:no_inverter': 'לא נמצא ממיר מתאים בקטלוג',
  'catalog:no_optimizer': 'חסר אופטימייזר בקטלוג',
  'catalog:no_battery': 'חסרה סוללה בקטלוג',
  'catalog:no_mounting': 'אין קונסטרוקציה פעילה בקטלוג לסוג הגג',
  'rules:vat_missing': 'שיעור מע״מ לא הוגדר',
  'rules:needs_owner_input': 'כללי התמחור הם זרע — ברק צריך למלא',
  'budget:exceeded': 'ההצעה חורגת מהתקציב שצוין בסקר',
  'pricing:labour_per_module_missing': 'חסר מחיר עבודה למודול לסוג הגג',
  'pricing:cost_missing': 'חסר מחיר עלות בקטלוג',
  'pricing:margin_missing': 'חסר מרווח לסוג הפריט',
  'roi:orientation_assumed_optimal': 'תחזית הייצור מניחה כיוון ושיפוע אופטימליים (לא נמדד שיפוע בסקר)',
  'roi:consumption_unknown': 'צריכה שנתית לא ידועה — הקיזוז חושב על כל הייצור',
  'roi:tax_not_included': 'החיסכון לא כולל מס על הכנסה ממכירת חשמל',
}

export function flagLabelHe(flag: string): string {
  if (FLAG_LABELS[flag]) return FLAG_LABELS[flag]!
  const [key, ...rest] = flag.split(':')
  const base = Object.keys(FLAG_LABELS).find((k) => flag.startsWith(k))
  if (base) return `${FLAG_LABELS[base]} (${rest.join(':')})`
  if (key === 'pricing' && flag.startsWith('pricing:unpriced_lines')) return `${rest[rest.length - 1]} שורות ללא מחיר — לא נכללות בסה״כ`
  if (flag.startsWith('catalog:no_inverter_for_brand')) return `אין ממיר מהמותג המבוקש בקטלוג (${rest[rest.length - 1]})`
  if (flag.startsWith('pricing:fx_missing')) return `חסר שער חליפין ל-${rest[rest.length - 1]}`
  return flag
}

/** Short Hebrew summary for a toast / draft message. */
export function quoteSummaryHe(q: QuoteVersion): string {
  const d = q.design
  const parts = [
    `${d.dc_kwp} kWp · ${d.module_count} מודולים`,
    d.inverter_sku ? `${d.inverter_count} ממיר${d.inverter_count > 1 ? 'ים' : ''}` : 'ללא ממיר',
  ]
  if (q.totals.total_incl_vat_ils !== null) parts.push(`סה״כ ${formatIls(q.totals.total_incl_vat_ils)} כולל מע״מ`)
  else parts.push(`${q.lines.length} שורות · מחירים לאימות`)
  return parts.join(' · ')
}
