/**
 * The company profile (src/company.ts), one object:
 *
 *   settings/company.json   CompanyProfile + updated_at / updated_by
 */
import { DEFAULT_COMPANY, normalizeCompany, type CompanyProfile } from '../../src/company'
import type { Env } from './env'

const KEY = 'settings/company.json'

export async function getCompany(env: Env): Promise<CompanyProfile> {
  const obj = await env.QUOTES.get(KEY)
  if (!obj) return { ...DEFAULT_COMPANY }
  try {
    return normalizeCompany(JSON.parse(await obj.text()))
  } catch {
    return { ...DEFAULT_COMPANY }
  }
}

export async function putCompany(env: Env, p: CompanyProfile, by: string, now = new Date()): Promise<void> {
  await env.QUOTES.put(KEY, JSON.stringify({ ...p, updated_at: now.toISOString(), updated_by: by }), { httpMetadata: { contentType: 'application/json' } })
}
