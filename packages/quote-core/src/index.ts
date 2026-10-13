export * from './types'
export { buildQuote, sizeSystem, buildAssemblies, priceLines, computeTotals, quoteNumberFor } from './engine'
export type { BuildQuoteOptions, SizingResult } from './engine'
export { round2, roundToStep, pct, canonicalJson, sha256Hex } from './money'
export { formatIls, quoteSummaryHe, flagLabelHe } from './format'
import catalogJson from './seed/catalog.seed.json'
import rulesJson from './seed/pricing-rules.seed.json'
import type { Catalog, PricingRules } from './types'

/** Seed catalog — every cost is null until Barak fills it from a supplier price list. */
export const seedCatalog: Catalog = catalogJson as unknown as Catalog
/** Seed pricing rules — all parameters null (`needs_owner_input`). */
export const seedPricingRules: PricingRules = rulesJson as unknown as PricingRules
