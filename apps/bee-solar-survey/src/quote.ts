/**
 * Survey → quote-lite adapter. Builds a draft QuoteVersion from a saved survey
 * and wraps it as a `dispatch.draft` hive job (Law #2: human picks, never customer).
 */
import {
  buildQuote,
  seedCatalog,
  seedPricingRules,
  type Catalog,
  type InverterBrand,
  type PricingRules,
  type QuoteInput,
  type QuoteVersion,
} from '@bee/quote-core'
import { mapRoofType, parseOptionalNumber, toDesignSuitePayload } from './schema'
import type { HiveJob, SiteSurveyProject, SurveyPhoto } from './types'

/** Rough phase inference from the main breaker label; ≥ 40A on an Israeli supply is almost always 3-phase. */
/**
 * Phases: the surveyed value wins; else an explicit "1x40A" / "3X25A" in the breaker
 * text; else unknown. Amperage alone is ambiguous in Israel (1×40A homes, 3×25A homes),
 * so it is never used to guess — an unknown phase count just doesn't filter inverters.
 */
export function inferPhases(mainBreaker: string, surveyed?: '1' | '3' | ''): 1 | 3 | undefined {
  if (surveyed === '1' || surveyed === '3') return Number(surveyed) as 1 | 3
  const m = /^\s*([13])\s*[x×X*]\s*\d/.exec(mainBreaker ?? '')
  return m ? (Number(m[1]) as 1 | 3) : undefined
}

export function surveyToQuoteInput(project: SiteSurveyProject, photos: SurveyPhoto[]): QuoteInput {
  const payload = toDesignSuitePayload(project, photos)
  const brand = (project.inverterBrandPref || '') as InverterBrand | ''
  return {
    projectId: project.id,
    projectName: project.projectName,
    ...(project.customerName?.trim() ? { customerName: project.customerName.trim() } : {}),
    address: project.address,
    roofType: project.roofTypeHe ? mapRoofType(project.roofTypeHe) : 'other',
    usableAreaM2: payload.site.usableAreaM2,
    targetKwp: payload.target.sizeKwp ?? null,
    budgetIls: parseOptionalNumber(project.budgetIls),
    annualConsumptionKwh: payload.site.annualConsumptionKwh ?? null,
    azimuthDeg: payload.site.azimuthDeg,
    tiltDeg: payload.site.tiltDeg,
    customerType: project.customerType ?? 'private',
    inverterBrand: brand,
    includeBattery: project.includeBattery,
    acCableLengthM: parseOptionalNumber(project.cableLengthM),
    mainBreaker: project.mainBreaker || undefined,
    phases: inferPhases(project.mainBreaker, project.phases),
    craneAccess: photos.some((p) => p.field === 'craneAccess') ? true : null,
  }
}

export interface QuoteDraftBundle {
  exportedAt: string
  app: 'bee-solar-survey'
  kind: 'quote-draft'
  quote: QuoteVersion
  job: HiveJob
}

export interface QuoteDraftOptions {
  /** Previous saved version — the new one becomes version_no + 1 with a diff. */
  previous?: QuoteVersion | null
  now?: Date
}

export async function buildQuoteDraft(
  project: SiteSurveyProject,
  photos: SurveyPhoto[],
  catalog: Catalog = seedCatalog,
  rules: PricingRules = seedPricingRules,
  opts: QuoteDraftOptions = {},
): Promise<QuoteDraftBundle> {
  const input = surveyToQuoteInput(project, photos)
  const quote = await buildQuote(input, catalog, rules, { previous: opts.previous ?? null, now: opts.now })
  const now = new Date().toISOString()
  const job: HiveJob = {
    id: crypto.randomUUID(),
    kind: 'dispatch',
    loop: 'dispatch.draft',
    status: 'queued',
    trustTier: 'L1',
    costTier: 0,
    source: 'bee-solar-survey',
    payload: {
      projectId: project.id,
      quoteNumber: quote.quote_number,
      versionNo: quote.version_no,
      snapshotHash: quote.snapshot_hash,
      supersedesHash: quote.supersedes_hash,
      titleHe: `טיוטת הצעת מחיר ${quote.quote_number} v${quote.version_no} — ${project.projectName}`,
      messageHe: quote.needs_owner_input
        ? 'הצעה ראשונית מהסקר. חסרים מחירים/פרמטרים — ברק משלים לפני כל שימוש. אין שליחה ללקוח.'
        : 'הצעה ראשונית מהסקר מוכנה לעיון ברק. אין שליחה ללקוח.',
      needsOwnerInput: quote.needs_owner_input,
      flags: quote.flags,
      nextAgent: 'wave-54',
    },
    result: null,
    error: null,
    createdAt: now,
    outbound: {
      channel: 'whatsapp',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
  return { exportedAt: now, app: 'bee-solar-survey', kind: 'quote-draft', quote, job }
}
