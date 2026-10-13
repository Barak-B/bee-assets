/**
 * Survey report PDF — real Hebrew text (embedded Heebo), word wrap, photos with
 * preserved aspect ratio, page numbers and a content hash in the footer.
 *
 * Load lazily from the UI (`await import('./pdf')`) — the embedded font is
 * ~220 KB of base64 and only needed when a report is requested.
 */
import { MUTED, OK_GREEN, WARN_RED, Writer, createDoc, safeFilename } from './pdfkit'
import { formatNumber } from './rtl'
import { mapRoofType, parseGps } from './schema'
import {
  PHOTO_FIELD_LABELS,
  type CompletenessReport,
  type PhotoFieldKey,
  type SiteSurveyProject,
  type SurveyPhoto,
} from './types'

export interface SurveyPdfMeta {
  /** Short content hash printed in the footer (first 8 hex chars). */
  hash: string
  pages: number
  bytes: number
}

export interface SurveyPdfResult {
  blob: Blob
  bytes: ArrayBuffer
  meta: SurveyPdfMeta
}

export async function shortContentHash(project: SiteSurveyProject, photos: SurveyPhoto[]): Promise<string> {
  const material = JSON.stringify({
    project,
    photos: photos.map((p) => ({ id: p.id, field: p.field, sha256: p.sha256 ?? null, annotated: !!p.annotated })),
  })
  const bytes = new TextEncoder().encode(material)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const PHOTO_ORDER: PhotoFieldKey[] = [
  'siteOverview',
  'roof',
  'electricalPanel',
  'busbars',
  'cableRoute',
  'inverterLocation',
  'craneAccess',
]

function yesNo(v: boolean): string {
  return v ? 'כן' : 'לא'
}

function withUnit(value: string, unit: string, fraction = 1): string {
  const t = value.trim()
  if (!t) return ''
  return `${formatNumber(t, fraction)} ${unit}`
}

export async function buildSurveyPdfDetailed(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
  completeness: CompletenessReport,
): Promise<SurveyPdfResult> {
  const hash = await shortContentHash(project, photos)
  const doc = createDoc({
    title: `B.E.E סקר אתר — ${project.projectName || project.id}`,
    subject: 'סקר אתר סולארי · Hive Collect',
  })

  const w = new Writer(
    doc,
    {
      title: 'סקר אתר סולארי · טיוטה לאישור',
      sub: `${project.projectName || 'ללא שם'} · ${project.surveyDate || ''}${project.surveyor ? ` · סוקר: ${project.surveyor}` : ''}`,
    },
    {
      right: 'טיוטה בלבד · Law #2 · אין שליחה ללקוח ללא אישור ברק',
      left: `survey ${project.id.slice(0, 8)} · ${hash}`,
    },
  )

  // ── Readiness ───────────────────────────────────────────────
  w.section('מוכנות לכוורת · Wave 54')
  const ready = completeness.readyForWave54
  w.paragraph(
    ready ? `מוכן · ציון ${completeness.score}/100` : `חסר · ציון ${completeness.score}/100`,
    'bold',
    11,
    ready ? OK_GREEN : WARN_RED,
  )
  if (completeness.missingRequired.length) {
    w.paragraph('חובה להשלים:', 'bold', 10)
    w.bullets(completeness.missingRequired, WARN_RED)
  }
  if (completeness.missingRecommended.length) {
    w.paragraph('מומלץ להשלים:', 'bold', 10)
    w.bullets(completeness.missingRecommended, MUTED)
  }
  if (completeness.warnings.length) w.bullets(completeness.warnings, MUTED)
  w.space()

  // ── General ────────────────────────────────────────────────
  w.section('פרטים כלליים')
  const gps = parseGps(project.gps)
  const lat = project.lat ?? gps.lat
  const lon = project.lon ?? gps.lon
  w.row('שם הפרויקט', project.projectName)
  w.row('תאריך סקר', project.surveyDate)
  w.row('סוקר', project.surveyor)
  w.row('כתובת', project.address)
  w.row('GPS', lat != null && lon != null ? `${lat}, ${lon}` : project.gps)
  w.row('מזהה סקר', project.id)
  w.row('עודכן', project.updatedAt ? project.updatedAt.replace('T', ' ').slice(0, 16) : '')
  w.space()

  // ── Electrical ────────────────────────────────────────────
  w.section('חשמל ומונים')
  w.row('מפסק ראשי במתקן', project.mainBreaker)
  w.row('מקום בלוח למפסק סולארי', project.panelSpace)
  w.row('מפסק ראשי סולארי', project.solarBreaker)
  w.row('סוג מונה סולארי', project.meterType)
  w.row('מספר מונה', project.meterNumber)
  w.row('מיקום מונה', project.meterLocation)
  w.row('אורך כבל AC משוער', withUnit(project.cableLengthM, 'מ׳'))
  w.row('מיקום קיר ממירים', project.inverterLocation)
  w.row('תוואי כבילה — הערות', project.cableNotes)
  w.space()

  // ── Roof / design target ──────────────────────────────────
  w.section('גג · גיאומטריה · יעד תכנון (Wave 54)')
  const roofCanon = project.roofTypeHe ? mapRoofType(project.roofTypeHe) : ''
  w.row('סוג גג', project.roofTypeHe ? `${project.roofTypeHe} (${roofCanon})` : '')
  w.row('שטח שימושי', withUnit(project.usableAreaM2, 'מ״ר'))
  w.row('אזימוט', project.azimuthDeg ? `${project.azimuthDeg}° (180 = דרום)` : '')
  w.row('שיפוע', project.tiltDeg ? `${project.tiltDeg}°` : '')
  w.row('צריכה שנתית', withUnit(project.annualConsumptionKwh, 'kWh'))
  w.row('יעד הספק', withUnit(project.targetKwp, 'kWp', 2))
  w.row('תקציב', withUnit(project.budgetIls, '₪'))
  w.row('העדפת ממיר', project.inverterBrandPref)
  w.row('לכלול סוללה בתכנון', yesNo(project.includeBattery))
  w.space()

  // ── Notes ─────────────────────────────────────────────────
  const custom = project.customFields.filter((f) => f.label.trim() || f.value.trim())
  if (project.generalNotes.trim() || custom.length) {
    w.section('הערות ושדות נוספים')
    if (project.generalNotes.trim()) w.paragraph(project.generalNotes.trim())
    if (custom.length) {
      w.space(2)
      for (const f of custom) w.row(f.label.trim() || 'שדה', f.value)
    }
    w.space()
  }

  // ── Photos ────────────────────────────────────────────────
  const byField = new Map<PhotoFieldKey, SurveyPhoto[]>()
  for (const p of photos) byField.set(p.field, [...(byField.get(p.field) ?? []), p])
  const fields = PHOTO_ORDER.filter((f) => byField.has(f))
  if (fields.length) {
    w.section(`צילומים (${photos.length})`)
    for (const field of fields) {
      const list = byField.get(field)!
      w.paragraph(`${PHOTO_FIELD_LABELS[field]} · ${list.length}`, 'bold', 10.5)
      w.photoGrid(list, (p, i) => `${PHOTO_FIELD_LABELS[field]} ${i + 1}${p.annotated ? ' · מסומן' : ''}`)
      w.space(2)
    }
  } else {
    w.section('צילומים')
    w.paragraph('לא צורפו תמונות.', 'normal', 10.5, MUTED)
  }

  const bytes = w.finish()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return { blob, bytes, meta: { hash, pages: doc.getNumberOfPages(), bytes: bytes.byteLength } }
}

export async function buildSurveyPdf(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
  completeness: CompletenessReport,
): Promise<Blob> {
  return (await buildSurveyPdfDetailed(project, photos, completeness)).blob
}

export function surveyPdfFilename(project: SiteSurveyProject): string {
  const base = safeFilename(project.projectName, project.id.slice(0, 8))
  return `bee-survey-${base}-${project.surveyDate || project.id.slice(0, 8)}.pdf`
}
