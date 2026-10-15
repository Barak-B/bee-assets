export * from './types'
export { buildQuote, sizeSystem, buildAssemblies, priceLines, computeTotals, quoteNumberFor, isBlockingFlag } from './engine'
export { diffQuotes, diffIsEmpty } from './diff'
export {
  BOQ_SECTIONS,
  boqSectionTitle,
  ROOF_LABELS_HE,
  KIND_LABELS_HE,
  pricingReadiness,
  SUGGESTED_SIZING,
  parseNumber,
  parseCurrency,
  rowsFromTable,
  parsePriceListCsv,
  applyPriceList,
  priceListTemplateCsv,
  markRulesFilled,
} from './pricebook'
export type { PricingReadiness, ReadinessItem, PriceRow, ApplyResult } from './pricebook'
export type { BuildQuoteOptions, SizingResult } from './engine'
export { round2, roundToStep, pct, canonicalJson, sha256Hex } from './money'
export {
  toPublicQuote,
  publishBlockers,
  isPublicQuote,
  isPublicBaseUrl,
  quoteLink,
  newQuoteToken,
  QUOTE_TOKEN_RE,
  NotPublishableError,
} from './public'
export type { PublicQuote, PublicQuoteLine, PublicQuoteSection, PublicRoi } from './public'
export { formatIls, quoteSummaryHe, flagLabelHe } from './format'
export { computeRoi, roiReadiness, orientationFactor, irrPct, SUGGESTED_ROI, EMPTY_ROI_RULES, TRACK_LABELS_HE, ROI_FIELD_LABELS_HE, MONTHLY_SHARE_IL } from './roi'
import catalogJson from './seed/catalog.seed.json'
import rulesJson from './seed/pricing-rules.seed.json'
import type { Catalog, PricingRules } from './types'

/** Seed catalog — every cost is null until Barak fills it from a supplier price list. */
export const seedCatalog: Catalog = catalogJson as unknown as Catalog
/** Seed pricing rules — all parameters null (`needs_owner_input`). */
export const seedPricingRules: PricingRules = rulesJson as unknown as PricingRules
