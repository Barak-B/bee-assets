import type {
  CompletenessReport,
  DesignSuiteSitePayload,
  DesignSuiteTargetPayload,
  RoofTypeCanonical,
  RoofTypeHe,
  SiteSurveyProject,
  SurveyPhoto,
} from './types'

/** Map Tamir/BEE Hebrew roof labels → Wave 54 canonical enum */
export const ROOF_HE_TO_CANONICAL: Record<RoofTypeHe, RoofTypeCanonical> = {
  בטון: 'flat',
  רעפים: 'tile',
  'פנל מבודד': 'metal-standing-seam',
  איסכורית: 'metal-trapezoidal',
  קרקע: 'ground',
  אחר: 'other',
}

export function mapRoofType(he: string): RoofTypeCanonical {
  if (he in ROOF_HE_TO_CANONICAL) {
    return ROOF_HE_TO_CANONICAL[he as RoofTypeHe]
  }
  return 'other'
}

export function parseGps(gps: string): { lat: number | null; lon: number | null } {
  const cleaned = gps.trim().replace(/\s+/g, ' ')
  if (!cleaned) return { lat: null, lon: null }

  // "31.77, 35.21" or "31.77 35.21" or "31.77N 35.21E"
  const m = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return { lat: null, lon: null }
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { lat: null, lon: null }
  return { lat, lon }
}

export function parseOptionalNumber(value: string): number | null {
  const t = value.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function ilsToCents(ils: string): number | null {
  const n = parseOptionalNumber(ils)
  if (n === null) return null
  return Math.round(n * 100)
}

export async function sha256OfDataUrl(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function emptyProject(partial?: Partial<SiteSurveyProject>): SiteSurveyProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    projectName: '',
    surveyDate: now.slice(0, 10),
    surveyor: '',
    gps: '',
    lat: null,
    lon: null,
    address: '',
    mainBreaker: '',
    panelSpace: '',
    solarBreaker: '',
    meterNumber: '',
    meterType: '',
    meterLocation: '',
    cableLengthM: '',
    cableNotes: '',
    roofTypeHe: '',
    inverterLocation: '',
    usableAreaM2: '',
    azimuthDeg: '180',
    tiltDeg: '',
    annualConsumptionKwh: '',
    targetKwp: '',
    budgetIls: '',
    inverterBrandPref: '',
    includeBattery: false,
    generalNotes: '',
    customFields: [],
    createdAt: now,
    updatedAt: now,
    hiveReady: false,
    ...partial,
  }
}

/** Edit-normalize: survey record → Wave 54 site + target payloads */
export function toDesignSuitePayload(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
): {
  site: DesignSuiteSitePayload
  target: DesignSuiteTargetPayload
  preferences: {
    inverterBrand?: 'SolarEdge' | 'KStar' | 'ABB' | 'Deye'
    includeBattery?: boolean
  }
  electricalIntake: Record<string, unknown>
} {
  const gps = parseGps(project.gps)
  const lat = project.lat ?? gps.lat
  const lon = project.lon ?? gps.lon

  const sitePhotos = photos.map((p) => ({
    sha256: p.sha256 || `pending:${p.id}`,
    mimeType: p.mimeType || 'image/jpeg',
    path: `survey://${project.id}/photos/${p.field}/${p.id}`,
    field: p.field,
  }))

  const sizeKwp = parseOptionalNumber(project.targetKwp)
  const budgetCents = ilsToCents(project.budgetIls)
  const target: DesignSuiteTargetPayload = {}
  if (sizeKwp !== null) target.sizeKwp = sizeKwp
  if (budgetCents !== null) target.budgetCents = budgetCents

  const preferences: {
    inverterBrand?: 'SolarEdge' | 'KStar' | 'ABB' | 'Deye'
    includeBattery?: boolean
  } = {}
  if (project.inverterBrandPref) preferences.inverterBrand = project.inverterBrandPref
  if (project.includeBattery) preferences.includeBattery = true

  const annual = parseOptionalNumber(project.annualConsumptionKwh)

  return {
    site: {
      addressLine: project.address.trim(),
      lat,
      lon,
      roofType: project.roofTypeHe ? mapRoofType(project.roofTypeHe) : 'other',
      usableAreaM2: parseOptionalNumber(project.usableAreaM2),
      azimuthDeg: parseOptionalNumber(project.azimuthDeg),
      tiltDeg: parseOptionalNumber(project.tiltDeg),
      photos: sitePhotos,
      ...(annual !== null ? { annualConsumptionKwh: annual } : {}),
    },
    target,
    preferences,
    electricalIntake: {
      mainBreaker: project.mainBreaker || null,
      panelSpaceForSolar: project.panelSpace || null,
      solarMainBreaker: project.solarBreaker || null,
      meterNumber: project.meterNumber || null,
      meterType: project.meterType || null,
      meterLocation: project.meterLocation || null,
      acCableLengthM: parseOptionalNumber(project.cableLengthM),
      cableRouteNotes: project.cableNotes || null,
      inverterWallLocation: project.inverterLocation || null,
    },
  }
}

/**
 * Completeness for Wave 54 designSuite.
 * Required for ready: name, address, roof, ≥1 roof/site photo, usable area OR target kWp.
 * GPS strongly recommended (performance_forecast).
 */
export function assessCompleteness(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
): CompletenessReport {
  const missingRequired: string[] = []
  const missingRecommended: string[] = []
  const warnings: string[] = []

  if (!project.projectName.trim()) missingRequired.push('שם הפרויקט')
  if (!project.address.trim()) missingRequired.push('כתובת')
  if (!project.roofTypeHe) missingRequired.push('סוג גג')

  const roofPhotos = photos.filter((p) => p.field === 'roof' || p.field === 'siteOverview')
  if (roofPhotos.length === 0) {
    missingRequired.push('צילום גג / מבט אתר (Wave 54 performance_forecast דורש תמונה)')
  }

  const hasArea = parseOptionalNumber(project.usableAreaM2) !== null
  const hasTarget =
    parseOptionalNumber(project.targetKwp) !== null || ilsToCents(project.budgetIls) !== null
  if (!hasArea && !hasTarget) {
    missingRequired.push('שטח שימושי (מ״ר) או יעד kWp / תקציב')
  }

  if (!project.surveyor.trim()) missingRecommended.push('שם הסוקר')
  if (!project.mainBreaker) missingRecommended.push('מפסק ראשי')
  if (!photos.some((p) => p.field === 'electricalPanel')) {
    missingRecommended.push('צילום לוח חשמל')
  }
  if (!project.gps.trim() && project.lat == null) {
    missingRecommended.push('GPS (לתחזית ייצור)')
  }
  if (parseOptionalNumber(project.azimuthDeg) === null) {
    missingRecommended.push('אזימוט (ברירת מחדל ישראל: 180 דרום)')
  }
  if (parseOptionalNumber(project.tiltDeg) === null) {
    missingRecommended.push('שיפוע גג')
  }

  const targetBoth =
    parseOptionalNumber(project.targetKwp) !== null && ilsToCents(project.budgetIls) !== null
  if (targetBoth) {
    warnings.push('Wave 54 מצפה ל-sizeKwp או budget — לא לשניהם; העריכה תעביר את שניהם עם אזהרה')
  }

  const requiredTotal = 5
  const requiredOk = requiredTotal - missingRequired.length
  const recTotal = 6
  const recOk = recTotal - missingRecommended.length
  const score = Math.max(
    0,
    Math.min(100, Math.round((requiredOk / requiredTotal) * 70 + (recOk / recTotal) * 30)),
  )

  return {
    score,
    readyForWave54: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
    warnings,
  }
}
