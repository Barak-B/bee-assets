/**
 * The company's price book, uploaded once in the office screen and pulled by
 * every phone on sync (src/sync.ts). It holds costs and margins, so it is
 * served only with a key — never on a public page.
 *
 *   settings/pricing.json   StoredPricing + updated_by
 */
import { toStoredPricing } from '../../src/backup'
import type { StoredPricing } from '../../src/db'
import type { Env } from './env'

const KEY = 'settings/pricing.json'

export interface ServerPricing extends StoredPricing {
  updatedAt: string
  updated_by: string
}

export interface PricingSummary {
  updatedAt: string
  updated_by: string
  products: number
  active: number
}

export async function getServerPricing(env: Env): Promise<ServerPricing | null> {
  const obj = await env.QUOTES.get(KEY)
  if (!obj) return null
  try {
    const raw = JSON.parse(await obj.text()) as Record<string, unknown>
    const p = toStoredPricing(raw)
    return p?.updatedAt ? { ...p, updatedAt: p.updatedAt, updated_by: typeof raw.updated_by === 'string' ? raw.updated_by : '' } : null
  } catch {
    return null
  }
}

/** Store the price book stamped now, so it is newer than every phone's copy. */
export async function putServerPricing(env: Env, p: StoredPricing, by: string, now = new Date()): Promise<ServerPricing> {
  const row: ServerPricing = { catalog: p.catalog, rules: p.rules, updatedAt: now.toISOString(), updated_by: by }
  await env.QUOTES.put(KEY, JSON.stringify(row), { httpMetadata: { contentType: 'application/json' } })
  return row
}

export function summarizePricing(p: ServerPricing): PricingSummary {
  const products = p.catalog.products ?? []
  return { updatedAt: p.updatedAt, updated_by: p.updated_by, products: products.length, active: products.filter((x) => x.is_active !== false).length }
}
