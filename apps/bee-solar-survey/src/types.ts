/** Canonical roof types from Wave 54 DesignSuiteReq */
export type RoofTypeCanonical =
  | 'flat'
  | 'tile'
  | 'metal-standing-seam'
  | 'metal-trapezoidal'
  | 'ground'
  | 'other'

/** Hebrew field labels used by surveyors (Tamir UX + BEE extensions) */
export type RoofTypeHe =
  | 'בטון'
  | 'רעפים'
  | 'פנל מבודד'
  | 'איסכורית'
  | 'קרקע'
  | 'אחר'

export type PanelSpace = 'כן' | 'לא' | 'דורש בדיקה' | ''
export type MeterType = 'ישיר' | 'ארון מניה' | ''
export type InverterBrand = 'SolarEdge' | 'KStar' | 'ABB' | 'Deye' | ''

export type PhotoFieldKey =
  | 'electricalPanel'
  | 'busbars'
  | 'cableRoute'
  | 'roof'
  | 'inverterLocation'
  | 'craneAccess'
  | 'siteOverview'

export interface SurveyPhoto {
  id: string
  field: PhotoFieldKey
  dataUrl: string
  mimeType: string
  sha256?: string
  createdAt: string
  annotated?: boolean
}

export interface CustomField {
  id: string
  section: 'general' | 'electrical' | 'roof' | 'design' | 'notes'
  label: string
  value: string
}

export interface SiteSurveyProject {
  id: string
  projectName: string
  surveyDate: string
  surveyor: string
  gps: string
  lat?: number | null
  lon?: number | null
  address: string

  // Electrical (Tamir)
  mainBreaker: string
  panelSpace: PanelSpace
  solarBreaker: string
  meterNumber: string
  meterType: MeterType
  meterLocation: string
  cableLengthM: string
  cableNotes: string

  // Roof / site geometry (Tamir + Wave 54)
  roofTypeHe: RoofTypeHe | ''
  inverterLocation: string
  usableAreaM2: string
  azimuthDeg: string
  tiltDeg: string
  annualConsumptionKwh: string

  // Design target (Wave 54)
  targetKwp: string
  budgetIls: string
  inverterBrandPref: InverterBrand
  includeBattery: boolean

  generalNotes: string
  customFields: CustomField[]

  createdAt: string
  updatedAt: string
  hiveReady?: boolean
}

export interface SiteSurveyRecord {
  project: SiteSurveyProject
  photos: SurveyPhoto[]
}

/** Wave 54 DesignSuiteReq.site subset produced by Edit normalize */
export interface DesignSuiteSitePayload {
  addressLine: string
  lat: number | null
  lon: number | null
  roofType: RoofTypeCanonical
  usableAreaM2: number | null
  azimuthDeg: number | null
  tiltDeg: number | null
  photos: { sha256: string; mimeType: string; path: string; field: PhotoFieldKey }[]
  annualConsumptionKwh?: number
}

export interface DesignSuiteTargetPayload {
  sizeKwp?: number
  budgetCents?: number
}

export type HiveJobKind = 'collect' | 'edit' | 'dispatch'
export type TrustTier = 'L0' | 'L1' | 'L2'
export type HiveJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked_trust'
  | 'cancelled'

export interface HiveJob {
  id: string
  kind: HiveJobKind
  loop: string
  status: HiveJobStatus
  trustTier: TrustTier
  costTier: number
  source: string
  payload: Record<string, unknown>
  result?: Record<string, unknown> | null
  error?: string | null
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
  outbound?: {
    channel: 'whatsapp' | 'email' | 'db' | 'none'
    destinationClass:
      | 'self_chat'
      | 'neri_group'
      | 'drafts_group'
      | 'voice_transcripts'
      | 'customer'
      | 'supplier'
      | 'other'
    requiresHumanPick: boolean
  }
}

export interface CompletenessReport {
  score: number
  readyForWave54: boolean
  missingRequired: string[]
  missingRecommended: string[]
  warnings: string[]
}

export const PHOTO_FIELD_LABELS: Record<PhotoFieldKey, string> = {
  electricalPanel: 'לוח חשמל פתוח',
  busbars: 'פסי צבירה והארקות',
  cableRoute: 'תוואי כבילה',
  roof: 'גג',
  inverterLocation: 'מיקום ממירים',
  craneAccess: 'גישה למנוף',
  siteOverview: 'מבט כללי על האתר',
}

export const BREAKER_OPTIONS = [
  '10A',
  '16A',
  '20A',
  '25A',
  '32A',
  '40A',
  '50A',
  '63A',
  '80A',
  '100A',
  '125A',
  '160A',
  '200A',
  '250A',
  '320A',
  '400A',
  '500A',
  '630A',
  '800A',
  '1000A',
  '1250A',
  '1600A',
] as const
