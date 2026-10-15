import { describe, expect, it } from 'vitest'
import { SUGGESTED_SIZING, applyPriceList, buildQuote, markRulesFilled, seedCatalog, seedPricingRules, toPublicQuote, type Catalog, type PricingRules, type PublicQuote } from '@bee/quote-core'
import type { Ctx, Env } from './_lib/env'
import { MemoryBucket } from './_lib/memoryBucket'
import { onRequestPost } from './api/quotes/index'
import { onRequestDelete, onRequestGet as statusGet } from './api/quotes/[token]'
import { onRequestGet as pageGet } from './q/[token]'
import { onRequestGet as pdfGet } from './q/[token]/pdf'

const KEY = 'test-publish-key-0123456789'

function env(over: Partial<Env> = {}): Env {
  return { QUOTES: new MemoryBucket(), PUBLIC_BASE_URL: 'https://app.barak-e.com', PUBLISH_KEY: KEY, ...over }
}

function ctx(e: Env, url: string, init: RequestInit = {}, params: Record<string, string> = {}): Ctx {
  return { request: new Request(url, init), env: e, params }
}

async function publicQuote(): Promise<PublicQuote> {
  const catalog: Catalog = { ...applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 't').catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  Object.assign(rules, { vat_rate: 0.18, default_margin_pct: 0.25, validity_days: 30 })
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  const q = await buildQuote(
    { projectId: 'p1', projectName: 'גג <b>תל אביב</b>', address: 'הרצל 1', roofType: 'flat', usableAreaM2: 120, targetKwp: 15, inverterBrand: 'SolarEdge', includeBattery: false, acCableLengthM: 35, phases: 3 },
    catalog,
    markRulesFilled(rules, catalog),
  )
  return toPublicQuote(q)
}

const PDF_B64 = btoa('%PDF-1.3\n% test\n')

async function publish(e: Env, body: unknown, auth = `Bearer ${KEY}`) {
  return onRequestPost(
    ctx(e, 'https://app.barak-e.com/api/quotes', {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json', origin: 'https://app.barak-e.com' },
      body: JSON.stringify(body),
    }),
  )
}

describe('publish API', () => {
  it('publishes under the public domain and serves the page and PDF', async () => {
    const e = env()
    const pq = await publicQuote()
    const res = await publish(e, { quote: pq, pdfBase64: PDF_B64 })
    expect(res.status).toBe(201)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.barak-e.com')
    const { token, url } = (await res.json()) as { token: string; url: string }
    expect(url).toBe(`https://app.barak-e.com/q/${token}`)
    expect(url).not.toMatch(/127\.0\.0\.1|localhost/)

    const page = await pageGet(ctx(e, url, {}, { token }))
    expect(page.status).toBe(200)
    expect(page.headers.get('x-robots-tag')).toContain('noindex')
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'")
    const htmlText = await page.text()
    expect(htmlText).toContain('dir="rtl"')
    expect(htmlText).toContain(pq.quote_number)
    expect(htmlText).toContain('סה״כ כולל מע״מ')
    expect(htmlText).toContain(`/q/${token}/pdf`)
    expect(htmlText).toContain('גג &lt;b&gt;תל אביב&lt;/b&gt;') // escaped, not injected
    expect(htmlText).not.toMatch(/unit_cost|margin_pct|fx_rate|BEE-[A-Z]{3}-/)

    const pdf = await pdfGet(ctx(e, `${url}/pdf`, {}, { token }))
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(new TextDecoder().decode(await pdf.arrayBuffer()).startsWith('%PDF-')).toBe(true)

    const status = await statusGet(ctx(e, `https://app.barak-e.com/api/quotes/${token}`, { headers: { authorization: `Bearer ${KEY}` } }, { token }))
    const st = (await status.json()) as { views: number; last_viewed_at: string | null }
    expect(st.views).toBe(1)
    expect(st.last_viewed_at).not.toBeNull()

    const del = await onRequestDelete(ctx(e, `https://app.barak-e.com/api/quotes/${token}`, { method: 'DELETE', headers: { authorization: `Bearer ${KEY}` } }, { token }))
    expect(del.status).toBe(200)
    expect((await pageGet(ctx(e, url, {}, { token }))).status).toBe(404)
  })

  it('refuses to mint links on a local or private base URL (the 127.0.0.1 bug)', async () => {
    for (const base of ['http://127.0.0.1:50973', 'http://localhost:8788', 'https://192.168.1.20']) {
      const res = await publish(env({ PUBLIC_BASE_URL: base }), { quote: await publicQuote() })
      expect(res.status, base).toBe(500)
      expect(((await res.json()) as { error: string }).error).toBe('base_url_not_public')
    }
    // Without PUBLIC_BASE_URL the request origin is used — still checked.
    const res = await onRequestPost(
      ctx(env({ PUBLIC_BASE_URL: undefined }), 'http://127.0.0.1:50973/api/quotes', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ quote: await publicQuote() }),
      }),
    )
    expect(res.status).toBe(500)
    // Explicit local-dev escape hatch.
    const dev = await publish(env({ PUBLIC_BASE_URL: 'http://127.0.0.1:8788', ALLOW_LOCAL_LINKS: '1' }), { quote: await publicQuote() })
    expect(dev.status).toBe(201)
  })

  it('rejects bad keys, bad bodies and fake PDFs', async () => {
    const e = env()
    expect((await publish(e, { quote: await publicQuote() }, 'Bearer nope')).status).toBe(401)
    expect((await publish(env({ PUBLISH_KEY: undefined }), { quote: await publicQuote() })).status).toBe(503)
    expect((await publish(e, { quote: { hello: 1 } })).status).toBe(400)
    expect((await publish(e, { quote: await publicQuote(), pdfBase64: btoa('<html>') })).status).toBe(400)
  })

  it('serves a friendly 404 for unknown or malformed tokens', async () => {
    const e = env()
    expect((await pageGet(ctx(e, 'https://app.barak-e.com/q/zzz', {}, { token: 'zzz' }))).status).toBe(404)
    expect((await pageGet(ctx(e, 'https://app.barak-e.com/q/AAAAAAAAAAAAAAAAAAAAAA', {}, { token: 'AAAAAAAAAAAAAAAAAAAAAA' }))).status).toBe(404)
  })
})
