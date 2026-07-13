import { jsPDF } from 'jspdf'
import type { CompletenessReport } from './types'
import type { SiteSurveyProject } from './types'
import type { StoredPhoto } from './db'
import { PHOTO_FIELD_LABELS } from './types'
import { mapRoofType } from './schema'

function text(doc: jsPDF, value: string, x: number, y: number, options?: { align?: 'right' | 'left' | 'center' }) {
  // jsPDF built-in fonts lack Hebrew; embed as RTL-friendly placeholder via canvas bitmap sections.
  doc.text(value, x, y, options)
}

async function hebrewLineToDataUrl(label: string, value: string, width = 700): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = 36
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, 36)
  ctx.fillStyle = '#1a1a1a'
  ctx.font = '600 18px Heebo, Arial, sans-serif'
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.fillText(`${label}: ${value || '—'}`, width - 8, 24)
  return canvas.toDataURL('image/png')
}

async function hebrewHeading(title: string, width = 700): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = 44
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0f1c24'
  ctx.fillRect(0, 0, width, 44)
  ctx.fillStyle = '#f0c14b'
  ctx.font = '700 22px Heebo, Arial, sans-serif'
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.fillText(title, width - 12, 30)
  return canvas.toDataURL('image/png')
}

export async function buildSurveyPdf(
  project: SiteSurveyProject,
  photos: StoredPhoto[],
  completeness: CompletenessReport,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 12
  let y = 12

  const brand = await hebrewHeading('B.E.E · סקר אתר סולארי · טיוטה לאישור')
  doc.addImage(brand, 'PNG', margin, y, pageW - margin * 2, 12)
  y += 16

  const metaLines: [string, string][] = [
    ['פרויקט', project.projectName],
    ['תאריך סקר', project.surveyDate],
    ['סוקר', project.surveyor],
    ['כתובת', project.address],
    ['GPS', project.gps],
    ['מוכנות Wave 54', completeness.readyForWave54 ? 'מוכן' : `חסר · ציון ${completeness.score}`],
  ]

  for (const [label, value] of metaLines) {
    const img = await hebrewLineToDataUrl(label, value)
    doc.addImage(img, 'PNG', margin, y, pageW - margin * 2, 8)
    y += 9
  }

  y += 2
  const elecHead = await hebrewHeading('חשמל ומונים')
  doc.addImage(elecHead, 'PNG', margin, y, pageW - margin * 2, 10)
  y += 12

  for (const [label, value] of [
    ['מפסק ראשי', project.mainBreaker],
    ['מקום בלוח לסולארי', project.panelSpace],
    ['מפסק סולארי', project.solarBreaker],
    ['סוג מונה', project.meterType],
    ['מיקום מונה', project.meterLocation],
    ['אורך כבל AC (מ׳)', project.cableLengthM],
  ] as [string, string][]) {
    const img = await hebrewLineToDataUrl(label, value)
    if (y > 270) {
      doc.addPage()
      y = 12
    }
    doc.addImage(img, 'PNG', margin, y, pageW - margin * 2, 8)
    y += 9
  }

  y += 2
  if (y > 250) {
    doc.addPage()
    y = 12
  }
  const roofHead = await hebrewHeading('גג · גיאומטריה · יעד תכנון (Wave 54)')
  doc.addImage(roofHead, 'PNG', margin, y, pageW - margin * 2, 10)
  y += 12

  const roofCanon = project.roofTypeHe ? mapRoofType(project.roofTypeHe) : '—'
  for (const [label, value] of [
    ['סוג גג', `${project.roofTypeHe || '—'} (${roofCanon})`],
    ['שטח שימושי מ״ר', project.usableAreaM2],
    ['אזימוט', project.azimuthDeg],
    ['שיפוע', project.tiltDeg],
    ['צריכה שנתית kWh', project.annualConsumptionKwh],
    ['יעד kWp', project.targetKwp],
    ['תקציב ₪', project.budgetIls],
    ['העדפת ממיר', project.inverterBrandPref],
    ['מיקום ממירים', project.inverterLocation],
  ] as [string, string][]) {
    const img = await hebrewLineToDataUrl(label, value)
    if (y > 270) {
      doc.addPage()
      y = 12
    }
    doc.addImage(img, 'PNG', margin, y, pageW - margin * 2, 8)
    y += 9
  }

  if (project.generalNotes.trim()) {
    if (y > 250) {
      doc.addPage()
      y = 12
    }
    const notes = await hebrewLineToDataUrl('הערות', project.generalNotes)
    doc.addImage(notes, 'PNG', margin, y, pageW - margin * 2, 8)
    y += 10
  }

  // Photos
  const byField = new Map<string, StoredPhoto[]>()
  for (const ph of photos) {
    const list = byField.get(ph.field) ?? []
    list.push(ph)
    byField.set(ph.field, list)
  }

  for (const [field, list] of byField) {
    if (y > 200) {
      doc.addPage()
      y = 12
    }
    const label = PHOTO_FIELD_LABELS[field as keyof typeof PHOTO_FIELD_LABELS] ?? field
    const head = await hebrewHeading(`צילומים · ${label}`)
    doc.addImage(head, 'PNG', margin, y, pageW - margin * 2, 10)
    y += 12

    for (const ph of list.slice(0, 8)) {
      if (y > 200) {
        doc.addPage()
        y = 12
      }
      try {
        const imgW = pageW - margin * 2
        const imgH = 55
        doc.addImage(ph.dataUrl, 'JPEG', margin, y, imgW, imgH)
        y += imgH + 6
      } catch {
        text(doc, `[photo ${ph.id}]`, margin, y)
        y += 8
      }
    }
  }

  // Trust footer
  if (y > 260) {
    doc.addPage()
    y = 12
  }
  const footer = await hebrewLineToDataUrl(
    'אמון כוורת',
    'טיוטה בלבד · Law #2 · אין שליחה ללקוח ללא אישור ברק',
  )
  doc.addImage(footer, 'PNG', margin, y, pageW - margin * 2, 8)

  return doc.output('blob')
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
