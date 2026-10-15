import { describe, expect, it } from 'vitest'
import { EMPTY_ROI_RULES, SUGGESTED_ROI, SUGGESTED_SIZING, applyPriceList, buildQuote, markRulesFilled, seedCatalog, seedPricingRules, toPublicQuote, type Catalog, type PricingRules, type PublicQuote } from '@bee/quote-core'
import type { Ctx, Env } from './_lib/env'
import { MemoryBucket } from './_lib/memoryBucket'
import { onRequestPost } from './api/quotes/index'
import { onRequestDelete, onRequestGet as statusGet } from './api/quotes/[token]'
import { onRequestGet as pageGet } from './q/[token]'
import { onRequestGet as pdfGet } from './q/[token]/pdf'
import { onRequestPost as acceptPost } from './q/[token]/accept'
import { onRequestGet as hiveJobs } from './api/hive/jobs'

const KEY = 'test-publish-key-0123456789'

function env(over: Partial<Env> = {}): Env {
  return { QUOTES: new MemoryBucket(), PUBLIC_BASE_URL: 'https://app.barak-e.com', PUBLISH_KEY: KEY, ...over }
}

function ctx(e: Env, url: string, init: RequestInit = {}, params: Record<string, string> = {}): Ctx {
  return { request: new Request(url, init), env: e, params }
}

async function publicQuote(withRoi = false): Promise<PublicQuote> {
  const catalog: Catalog = { ...applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 't').catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  Object.assign(rules, { vat_rate: 0.18, default_margin_pct: 0.25, validity_days: 30 })
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  if (withRoi) rules.roi = { ...EMPTY_ROI_RULES, ...SUGGESTED_ROI, track: 'net_metering', consumption_tariff_ils_kwh: 0.6 }
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

  it('shows the savings estimate with inline charts and no script', async () => {
    const e = env()
    const pq = await publicQuote(true)
    expect(pq.roi).toBeDefined()
    const { token, url } = (await (await publish(e, { quote: pq })).json()) as { token: string; url: string }
    const htmlText = await (await pageGet(ctx(e, url, {}, { token }))).text()
    expect(htmlText).toContain('תחזית ייצור וחיסכון')
    expect(htmlText.match(/<svg class="chart"/g)).toHaveLength(2)
    expect(htmlText).toContain('אינו ייעוץ מס')
    expect(htmlText).not.toMatch(/<script|npv|irr/i)
    const without = (await (await publish(e, { quote: await publicQuote() })).json()) as { token: string; url: string }
    expect(await (await pageGet(ctx(e, without.url, {}, { token: without.token }))).text()).not.toContain('תחזית ייצור וחיסכון')
  })

  it('lets the customer approve the exact version once, and reports it to the app', async () => {
    const e = env()
    const pq = await publicQuote()
    const { token, url } = (await (await publish(e, { quote: pq, pdfBase64: PDF_B64 })).json()) as { token: string; url: string }
    const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
      acceptPost(ctx(e, `${url}/accept`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://app.barak-e.com', 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Mobile Safari', ...headers }, body: new URLSearchParams(fields).toString() }, { token }))
    const good = { name: '  ישראל   ישראלי ', id4: '1234', agree: 'yes', ref: pq.reference }

    let page = await (await pageGet(ctx(e, url, {}, { token }))).text()
    expect(page).toContain(`action="/q/${token}/accept"`)
    expect(page).toContain('אני מאשר/ת את ההצעה')

    // Validation re-renders the page with the message and keeps the name.
    for (const [bad, msg] of [
      [{ ...good, agree: '' }, 'נא לסמן'],
      [{ ...good, id4: '12a4' }, '4 ספרות'],
      [{ ...good, name: 'א' }, 'שם מלא'],
      [{ ...good, ref: 'aaaaaaaaaaaa' }, 'ההצעה עודכנה'],
    ] as const) {
      const r = await form(bad)
      expect(r.status).toBe(400)
      expect(await r.text()).toContain(msg)
    }
    expect((await form(good, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await form(good, { origin: '', 'sec-fetch-site': 'cross-site' })).status).toBe(403)

    const ok = await form(good)
    expect(ok.status).toBe(303)
    expect(ok.headers.get('location')).toBe(`/q/${token}?accepted=1#accept`)
    page = await (await pageGet(ctx(e, `${url}?accepted=1`, {}, { token }))).text()
    expect(page).toContain('תודה! ההצעה אושרה')
    expect(page).toContain('ישראל ישראלי')
    expect(page).toMatch(/<bdi dir="ltr">\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}<\/bdi>/) // Israel time, no bidi reordering
    expect(page).not.toContain(`action="/q/${token}/accept"`)

    // A second post does not overwrite the first approval.
    expect((await form({ ...good, name: 'מישהו אחר' })).status).toBe(303)
    const status = (await (await statusGet(ctx(e, `https://app.barak-e.com/api/quotes/${token}`, { headers: { authorization: `Bearer ${KEY}` } }, { token }))).json()) as {
      accepted: { name: string; version_no: number; reference: string } | null
    }
    expect(status.accepted).toMatchObject({ name: 'ישראל ישראלי', version_no: pq.version_no, reference: pq.reference })

    const raw = JSON.parse(await (await e.QUOTES.get(`quotes/${token}/acceptance.json`))!.text())
    expect(raw).toMatchObject({ id_last4: '1234', ip: '203.0.113.7', user_agent: 'Mobile Safari' })
    expect(raw.pdf_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(raw.quote.reference).toBe(pq.reference)

    const feed = (await (await hiveJobs(ctx(e, 'https://app.barak-e.com/api/hive/jobs', { headers: { authorization: `Bearer ${KEY}` } }))).json()) as { events: { type: string; customer_name: string; token: string; requiresHumanPick: boolean }[]; until: string }
    expect(feed.events).toEqual([expect.objectContaining({ type: 'quote.accepted', customer_name: 'ישראל ישראלי', token, requiresHumanPick: true })])
    await new Promise((r) => setTimeout(r, 5))
    const later = (await (await hiveJobs(ctx(e, `https://app.barak-e.com/api/hive/jobs?since=${encodeURIComponent(feed.until)}`, { headers: { authorization: `Bearer ${KEY}` } }))).json()) as { events: unknown[] }
    expect(later.events).toEqual([])

    // Revoking the link keeps the approval record.
    await onRequestDelete(ctx(e, `https://app.barak-e.com/api/quotes/${token}`, { method: 'DELETE', headers: { authorization: `Bearer ${KEY}` } }, { token }))
    expect(await e.QUOTES.get(`quotes/${token}/acceptance.json`)).not.toBeNull()
    expect((await form(good)).status).toBe(404)
  })

  it('an expired quote cannot be approved', async () => {
    const e = env()
    const pq = { ...(await publicQuote()), valid_until: '2020-01-01' }
    const { token, url } = (await (await publish(e, { quote: pq })).json()) as { token: string; url: string }
    expect(await (await pageGet(ctx(e, url, {}, { token }))).text()).not.toContain('/accept"')
    const r = await acceptPost(ctx(e, `${url}/accept`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'ישראל', id4: '1234', agree: 'yes', ref: pq.reference }).toString() }, { token }))
    expect(r.status).toBe(410)
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
