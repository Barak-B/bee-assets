import { describe, expect, it } from 'vitest'
import { SUGGESTED_SIZING, applyPriceList, buildQuote, markRulesFilled, seedCatalog, seedPricingRules, toPublicQuote, type Catalog, type PricingRules } from '@bee/quote-core'
import type { Ctx, Env } from './_lib/env'
import { MemoryBucket } from './_lib/memoryBucket'
import { onRequestPost as publishPost } from './api/quotes/index'
import { onRequestDelete as revokeDelete } from './api/quotes/[token]'
import { onRequestPost as acceptPost } from './q/[token]/accept'
import { onRequestPut as surveyPut } from './api/surveys/[id]'
import { onRequestGet as listGet } from './api/surveys/index'
import { onRequestPut as quotePut } from './api/surveys/[id]/quotes/[version]'
import { onRequestPut as reportPut } from './api/surveys/[id]/reports/[report]'
import { onRequestGet as hiveJobs } from './api/hive/jobs'
import { onRequestGet as overviewGet } from './api/office/overview'
import { onRequestPut as statusPut } from './api/office/status/[id]'
import { onRequestGet as keysGet, onRequestPost as keysPost } from './api/office/keys/index'
import { onRequestDelete as keyDelete } from './api/office/keys/[id]'
import { onRequestGet as meGet } from './api/me'
import { onRequestGet as healthGet } from './api/health'

const MASTER = 'test-publish-key-0123456789'
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const RID = '9b2d7a4e-3c1f-4e8a-b5d6-1a2b3c4d5e6f'
const BASE = 'https://app.barak-e.com'

const env = (): Env => ({ QUOTES: new MemoryBucket(), PUBLIC_BASE_URL: BASE, PUBLISH_KEY: MASTER })
const ctx = (e: Env, path: string, init: RequestInit = {}, params: Record<string, string> = {}): Ctx => ({ request: new Request(`${BASE}${path}`, init), env: e, params })
const bearer = (k: string) => ({ authorization: `Bearer ${k}` })
const jsonInit = (method: string, key: string, body: unknown): RequestInit => ({ method, headers: { ...bearer(key), 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function newKey(e: Env, name: string, role: string, by = MASTER) {
  const res = await keysPost(ctx(e, '/api/office/keys', jsonInit('POST', by, { name, role })))
  return { res, body: (await res.json()) as { key: string; row: { id: string; name: string; role: string; hint: string } } }
}

function surveyRecord(contentHash = 'h1') {
  return {
    schema: 'bee.survey-record/1',
    project: { id: ID, projectName: 'גג הרצל', address: 'הרצל 1', surveyor: 'תמיר', updatedAt: '2026-10-17T08:00:00.000Z', customerName: 'ישראל ישראלי', customerPhone: '050-1234567', customerEmail: 'israel@example.com' },
    photos: [],
    completeness: { score: 90, readyForWave54: true },
    contentHash,
  }
}

async function publicQuote() {
  const catalog: Catalog = { ...applyPriceList(seedCatalog, seedCatalog.products.map((p, i) => ({ sku: p.sku, unit_cost: 50 + i * 10 })), 't').catalog, fx_rates: { USD: 3.7, EUR: 4 } }
  const rules: PricingRules = structuredClone(seedPricingRules)
  Object.assign(rules, { vat_rate: 0.18, default_margin_pct: 0.25, validity_days: 30 })
  rules.labour_per_module_ils = { flat: 300, tile: 350, 'metal-standing-seam': 280, 'metal-trapezoidal': 280, ground: 320, other: 300 }
  rules.sizing = { ...SUGGESTED_SIZING }
  rules.payment_schedule = rules.payment_schedule.map((m, i) => ({ ...m, pct: [30, 40, 20, 5, 5][i] ?? null }))
  const q = await buildQuote(
    { projectId: ID, projectName: 'גג הרצל', customerName: 'ישראל ישראלי', address: 'הרצל 1', roofType: 'flat', usableAreaM2: 120, targetKwp: 15, inverterBrand: 'SolarEdge', includeBattery: false, acCableLengthM: 35, phases: 3 },
    catalog,
    markRulesFilled(rules, catalog),
  )
  return { q, pq: toPublicQuote(q) }
}

const accept = (e: Env, token: string, id4: string, ref: string) =>
  acceptPost(
    ctx(e, `/q/${token}/accept`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: new URLSearchParams({ name: 'ישראל ישראלי', id4, agree: 'yes', ref }).toString() }, { token }),
  )

describe('personal keys and roles', () => {
  it('the master key is admin; personal keys carry their name and role and can be revoked one by one', async () => {
    const e = env()
    const me = (k: string) => meGet(ctx(e, '/api/me', { headers: bearer(k) }))
    expect(await (await me(MASTER)).json()).toMatchObject({ role: 'admin' })

    const { res, body } = await newKey(e, 'דני', 'surveyor')
    expect(res.status).toBe(201)
    expect(body.key).toMatch(/^bee_[A-Za-z0-9_-]{43}$/)
    expect(body.row).toMatchObject({ name: 'דני', role: 'surveyor', hint: body.key.slice(-4) })
    expect(await (await me(body.key)).json()).toMatchObject({ name: 'דני', role: 'surveyor', role_he: 'סוקר' })

    // Only the hash is stored: the plain key appears nowhere in the bucket.
    const bucket = e.QUOTES as MemoryBucket
    expect(JSON.stringify([...bucket.store.entries()])).not.toContain(body.key)

    // A surveyor works on surveys but is not the office and cannot make keys.
    expect((await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', body.key, surveyRecord()), { id: ID }))).status).toBe(200)
    expect((await overviewGet(ctx(e, '/api/office/overview', { headers: bearer(body.key) }))).status).toBe(403)
    expect((await hiveJobs(ctx(e, '/api/hive/jobs', { headers: bearer(body.key) }))).status).toBe(403)
    expect((await newKey(e, 'x', 'admin', body.key)).res.status).toBe(403)

    const office = await newKey(e, 'רונית', 'office')
    expect((await overviewGet(ctx(e, '/api/office/overview', { headers: bearer(office.body.key) }))).status).toBe(200)
    expect((await keysGet(ctx(e, '/api/office/keys', { headers: bearer(office.body.key) }))).status).toBe(403)

    // Lost phone: revoke Dani's key only.
    const del = await keyDelete(ctx(e, `/api/office/keys/${body.row.id}`, { method: 'DELETE', headers: bearer(MASTER) }, { id: body.row.id }))
    expect(del.status).toBe(200)
    const after = await me(body.key)
    expect(after.status).toBe(401)
    expect(await after.json()).toMatchObject({ message_he: expect.stringContaining('בוטל') })
    expect((await me(office.body.key)).status).toBe(200)

    const list = (await (await keysGet(ctx(e, '/api/office/keys', { headers: bearer(MASTER) }))).json()) as { keys: { name: string; revoked_at: string | null }[] }
    expect(list.keys.map((k) => [k.name, !!k.revoked_at]).sort()).toEqual([
      ['דני', true],
      ['רונית', false],
    ])
    expect(JSON.stringify(list)).not.toContain(body.key)
  })

  it('refuses made-up keys, bad names and roles', async () => {
    const e = env()
    expect((await meGet(ctx(e, '/api/me', { headers: bearer(`bee_${'A'.repeat(43)}`) }))).status).toBe(401)
    expect((await meGet(ctx(e, '/api/me'))).status).toBe(401)
    expect((await newKey(e, ' ', 'surveyor')).res.status).toBe(400)
    expect((await newKey(e, 'דני', 'root')).res.status).toBe(400)
  })

  it('health check says whose key it is', async () => {
    const e = env()
    const { body } = await newKey(e, 'דני', 'surveyor')
    const h = (await (await healthGet(ctx(e, '/api/health', { headers: bearer(body.key) }))).json()) as { checks: { key: string; ok: boolean; message_he: string }[]; who: { name: string } }
    expect(h.who).toMatchObject({ name: 'דני', role: 'surveyor' })
    expect(h.checks.find((c) => c.key === 'key_match')).toMatchObject({ ok: true, message_he: expect.stringContaining('דני') })
  })
})

describe('customer on the server', () => {
  it('keeps the customer and the sender on the survey row', async () => {
    const e = env()
    const { body } = await newKey(e, 'דני', 'surveyor')
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', body.key, surveyRecord()), { id: ID }))
    const { surveys } = (await (await listGet(ctx(e, '/api/surveys', { headers: bearer(MASTER) }))).json()) as { surveys: Record<string, unknown>[] }
    expect(surveys[0]).toMatchObject({ customerName: 'ישראל ישראלי', customerPhone: '050-1234567', customerEmail: 'israel@example.com', receivedBy: 'דני' })
  })

  it('checks the 4 ID digits against the customer on file, and locks after 5 wrong tries', async () => {
    const e = env()
    const { pq } = await publicQuote()
    const res = await publishPost(ctx(e, '/api/quotes', jsonInit('POST', MASTER, { quote: pq, survey_id: ID, customer_id_last4: '4321' })))
    const { token } = (await res.json()) as { token: string }
    // The digits are private: not on the stored public quote, not on the page.
    const stored = JSON.parse(await (await e.QUOTES.get(`quotes/${token}/quote.json`))!.text())
    expect(stored.quote).not.toHaveProperty('id_last4')
    expect(JSON.stringify(stored.quote)).not.toContain('4321')

    let r = await accept(e, token, '1111', pq.reference)
    expect(r.status).toBe(400)
    expect(await r.text()).toContain('נותרו 4 ניסיונות')
    r = await accept(e, token, '4321', pq.reference)
    expect(r.status).toBe(303)
    const a = JSON.parse(await (await e.QUOTES.get(`quotes/${token}/acceptance.json`))!.text())
    expect(a).toMatchObject({ id_last4: '4321', id_verified: true })

    // Another link: five wrong tries lock it, and even the right digits no longer go through.
    const res2 = await publishPost(ctx(e, '/api/quotes', jsonInit('POST', MASTER, { quote: pq, survey_id: ID, customer_id_last4: '4321' })))
    const t2 = ((await res2.json()) as { token: string }).token
    for (let i = 0; i < 4; i++) expect((await accept(e, t2, '0000', pq.reference)).status).toBe(400)
    expect((await accept(e, t2, '0000', pq.reference)).status).toBe(429)
    expect((await accept(e, t2, '4321', pq.reference)).status).toBe(429)
    expect(await e.QUOTES.get(`quotes/${t2}/acceptance.json`)).toBeNull()
  })

  it('without an ID on file any 4 digits are taken, marked as not verified', async () => {
    const e = env()
    const { pq } = await publicQuote()
    const { token } = (await (await publishPost(ctx(e, '/api/quotes', jsonInit('POST', MASTER, { quote: pq })))).json()) as { token: string }
    expect((await accept(e, token, '1234', pq.reference)).status).toBe(303)
    expect(JSON.parse(await (await e.QUOTES.get(`quotes/${token}/acceptance.json`))!.text())).toMatchObject({ id_verified: false })
  })
})

describe('office overview', () => {
  it('follows a job from survey to handover, with links, views, approval and reports', async () => {
    const e = env()
    const { body: dani } = await newKey(e, 'דני', 'surveyor')
    const jobs = async () => ((await (await overviewGet(ctx(e, '/api/office/overview', { headers: bearer(MASTER) }))).json()) as { jobs: Record<string, any>[] }).jobs
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', dani.key, surveyRecord()), { id: ID }))
    expect((await jobs())[0]).toMatchObject({ id: ID, stage: 'survey', customerName: 'ישראל ישראלי', latestQuote: null, links: [], reports: [] })

    const { q, pq } = await publicQuote()
    await quotePut(ctx(e, `/api/surveys/${ID}/quotes/1`, jsonInit('PUT', dani.key, { ...q, version_no: 1 }), { id: ID, version: '1' }))
    let job = (await jobs())[0]!
    expect(job.stage).toBe('quote')
    expect(job.latestQuote).toMatchObject({ version_no: 1, total_incl_vat_ils: q.totals.total_incl_vat_ils })

    const pub = await publishPost(ctx(e, '/api/quotes', jsonInit('POST', dani.key, { quote: pq, survey_id: ID })))
    const { token } = (await pub.json()) as { token: string }
    job = (await jobs())[0]!
    expect(job.stage).toBe('sent')
    expect(job.links).toEqual([expect.objectContaining({ token, published_by: 'דני', revoked_at: null, views: 0, accepted: null })])

    await accept(e, token, '1234', pq.reference)
    job = (await jobs())[0]!
    expect(job.stage).toBe('accepted')
    expect(job.links[0].accepted).toMatchObject({ name: 'ישראל ישראלי', id_verified: false })

    // Taking the link down later keeps it listed, revoked — and the approval still counts.
    await revokeDelete(ctx(e, `/api/quotes/${token}`, { method: 'DELETE', headers: bearer(MASTER) }, { token }))
    job = (await jobs())[0]!
    expect(job.links[0].revoked_at).toBeTruthy()
    expect(job.stage).toBe('accepted')

    const report = (templateKey: string, status: 'draft' | 'final', rid = RID) => ({
      id: rid,
      projectId: ID,
      templateKey,
      templateVersion: 1,
      revision: 1,
      status,
      updatedAt: '2026-10-17T10:00:00.000Z',
      finalizedAt: status === 'final' ? '2026-10-17T10:00:00.000Z' : null,
      contentHash: status === 'final' ? 'a'.repeat(64) : null,
      photos: [],
      title_he: templateKey === 'handover' ? 'הפעלה ומסירה' : 'דוח יומי',
      outcome: null,
    })
    await reportPut(ctx(e, `/api/surveys/${ID}/reports/${RID}`, jsonInit('PUT', dani.key, report('daily_report', 'draft')), { id: ID, report: RID }))
    expect((await jobs())[0]!.stage).toBe('installation')
    const HID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    await reportPut(ctx(e, `/api/surveys/${ID}/reports/${HID}`, jsonInit('PUT', dani.key, report('handover', 'final', HID)), { id: ID, report: HID }))
    job = (await jobs())[0]!
    expect(job.stage).toBe('handover')
    expect(job.reports.map((r: { templateKey: string }) => r.templateKey).sort()).toEqual(['daily_report', 'handover'])
  })

  it('the office status rides on top of the stage and back to the phone', async () => {
    const e = env()
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', MASTER, surveyRecord()), { id: ID }))
    const { body: office } = await newKey(e, 'רונית', 'office')
    const put = (key: string, body: unknown, id = ID) => statusPut(ctx(e, `/api/office/status/${id}`, jsonInit('PUT', key, body), { id }))
    expect((await put(office.key, { status: 'nope' })).status).toBe(400)
    expect((await put(office.key, { status: 'lost' }, '3fa85f64-5717-4562-b3fc-2c963f66afa6')).status).toBe(404)
    const { body: dani } = await newKey(e, 'דני', 'surveyor')
    expect((await put(dani.key, { status: 'lost' })).status).toBe(403)

    expect((await put(office.key, { status: 'on_hold', note: 'הלקוח בחו״ל עד נובמבר' })).status).toBe(200)
    const jobs = ((await (await overviewGet(ctx(e, '/api/office/overview', { headers: bearer(office.key) }))).json()) as { jobs: Record<string, any>[] }).jobs
    expect(jobs[0]).toMatchObject({ stage: 'survey', office: { status: 'on_hold', note: 'הלקוח בחו״ל עד נובמבר', updated_by: 'רונית' } })

    const listed = (await (await listGet(ctx(e, '/api/surveys', { headers: bearer(dani.key) }))).json()) as { surveys: { office: { status: string } | null }[] }
    expect(listed.surveys[0]!.office).toMatchObject({ status: 'on_hold' })

    const back = (await (await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', dani.key, surveyRecord('h2')), { id: ID }))).json()) as { office: { status: string } }
    expect(back.office).toMatchObject({ status: 'on_hold' })
  })
})
