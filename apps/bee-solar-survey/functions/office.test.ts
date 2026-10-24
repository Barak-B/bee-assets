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
import { onRequestPost as jobsPost } from './api/office/jobs/index'
import { onRequestGet as surveyorsGet } from './api/office/surveyors'
import { onRequestGet as surveyGet } from './api/surveys/[id]'
import { onRequestGet as healthGet } from './api/health'
import { onRequestGet as messagesGet, onRequestPost as messagesPost } from './api/office/messages/[id]'
import { onRequestGet as timelineGet } from './api/office/timeline/[id]'
import { onRequestGet as companyGet } from './api/company'
import { onRequestPut as companyPut } from './api/office/company'
import { onRequestGet as submissionGet, onRequestPut as submissionPut } from './api/office/submission/[id]'
import { onRequestGet as pageGet } from './q/[token]'

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

  it('milestones from the office move the job through S04–S12, with checks, and reach the phone', async () => {
    const e = env()
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', MASTER, surveyRecord()), { id: ID }))
    const { body: office } = await newKey(e, 'רונית', 'office')
    const put = (body: unknown) => statusPut(ctx(e, `/api/office/status/${ID}`, jsonInit('PUT', office.key, body), { id: ID }))
    const job = async () => ((await (await overviewGet(ctx(e, '/api/office/overview', { headers: bearer(office.key) }))).json()) as { jobs: Record<string, any>[] }).jobs[0]!
    const err = async (body: unknown) => {
      const r = await put(body)
      expect(r.status).toBe(400)
      return ((await r.json()) as { message_he: string }).message_he
    }

    expect(await err({ milestones: { signed: { date: '2026-10-01' } } })).toContain('לא מוכרת')
    expect(await err({ milestones: { contract_signed: { date: '1.10.2026' } } })).toContain('תאריך לא תקין')
    expect(await err({ milestones: { contract_signed: { date: '2099-01-01' } } })).toContain('עוד לא הגיע')
    expect(await err({ milestones: { iec_submitted: { date: '2026-10-01', ref: 'פנייה 12' } } })).toContain('אסמכתא')
    expect(await err({ milestones: [] })).toContain('מבנה')

    // A paper contract and a deposit, no online approval: past S04.
    expect((await put({ milestones: { contract_signed: { date: '2026-10-01' }, deposit_paid: { date: '2026-10-02', ref: 'R-118' } } })).status).toBe(200)
    let j = await job()
    expect(j.stage).toBe('permits')
    expect(j.office.milestones).toEqual({ contract_signed: { date: '2026-10-01' }, deposit_paid: { date: '2026-10-02', ref: 'R-118' } })

    // Only the keys sent change; the IEC answer implies the submission.
    await put({ milestones: { iec_approved: { date: '2026-10-08' }, design_approved: { date: '2026-10-09' } } })
    j = await job()
    expect(j.stage).toBe('procurement')
    expect(j.milestones.iec_submitted).toMatchObject({ date: '2026-10-08', auto: expect.any(String) })
    expect(Object.keys(j.office.milestones).sort()).toEqual(['contract_signed', 'deposit_paid', 'design_approved', 'iec_approved'])

    // null takes one back.
    await put({ milestones: { design_approved: null } })
    expect((await job()).stage).toBe('permits')

    // The phone gets them with the office row and derives the same stage.
    const listed = (await (await listGet(ctx(e, '/api/surveys', { headers: bearer(MASTER) }))).json()) as { surveys: { office: { milestones: object } }[] }
    expect(Object.keys(listed.surveys[0]!.office.milestones)).toHaveLength(3)

    // Every milestone with a reference, plus a full Hebrew note, still fits R2 metadata.
    const every = Object.fromEntries(
      ['contract_signed', 'deposit_paid', 'iec_submitted', 'iec_approved', 'design_approved', 'equipment_ordered', 'equipment_delivered', 'installation_done', 'inspector_passed', 'meter_installed', 'grid_approved', 'handover_signed', 'final_invoice', 'monitoring_active'].map((k) => [k, { date: '2026-10-01', ref: 'X'.repeat(24) }]),
    )
    expect((await put({ milestones: every, note: 'ש'.repeat(200) })).status).toBe(200)
    expect((await job()).stage).toBe('service')
  })
})

describe('new jobs from the office and assignment', () => {
  it('opens a job, assigns it, and the assigned phone sees it as its own', async () => {
    const e = env()
    const { body: dani } = await newKey(e, 'דני', 'surveyor')
    const { body: avi } = await newKey(e, 'אבי', 'surveyor')
    const { body: ronit } = await newKey(e, 'רונית', 'office')
    const people = (await (await surveyorsGet(ctx(e, '/api/office/surveyors', { headers: bearer(ronit.key) }))).json()) as { surveyors: { id: string; name: string }[] }
    expect(people.surveyors.map((p) => p.name)).toEqual(['אבי', 'דני', 'רונית'])
    expect(JSON.stringify(people)).not.toContain(dani.key)
    expect((await surveyorsGet(ctx(e, '/api/office/surveyors', { headers: bearer(dani.key) }))).status).toBe(403)

    const open = (body: unknown, key = ronit.key) => jobsPost(ctx(e, '/api/office/jobs', jsonInit('POST', key, body)))
    // A surveyor cannot open jobs; missing phone / address are refused; an unknown surveyor leaves nothing behind.
    expect((await open({ customerName: 'x', customerPhone: '1', address: 'y' }, dani.key)).status).toBe(403)
    expect((await open({ customerName: 'משה', address: 'הזית 7, גדרה' })).status).toBe(400)
    expect((await open({ customerName: 'משה', customerPhone: '054-1112233' })).status).toBe(400)
    const bad = await open({ customerName: 'משה', customerPhone: '054-1112233', address: 'הזית 7, גדרה', assigned_to: crypto.randomUUID() })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ message_he: expect.stringContaining('לא נמצא') })
    expect((e.QUOTES as MemoryBucket).store.size).toBe(3) // only the three keys

    const res = await open({ customerName: 'משה אברהם', customerPhone: '054-1112233', address: 'הזית 7, גדרה', note: 'גג רעפים, זמין אחרי 16:00', assigned_to: dani.row.id, planned_date: '2026-10-22' })
    expect(res.status).toBe(201)
    const { id, office } = (await res.json()) as { id: string; office: Record<string, string> }
    expect(office).toMatchObject({ status: 'active', assigned_to_id: dani.row.id, assigned_to_name: 'דני', planned_date: '2026-10-22', updated_by: 'רונית' })

    // The survey record is an ordinary one: the phone can pull it and carry on.
    const got = (await (await surveyGet(ctx(e, `/api/surveys/${id}`, { headers: bearer(dani.key) }, { id }))).json()) as { survey: { project: Record<string, unknown>; photos: unknown[] } }
    expect(got.survey.project).toMatchObject({ id, projectName: 'משה אברהם · גדרה', customerName: 'משה אברהם', customerPhone: '054-1112233', address: 'הזית 7, גדרה', surveyDate: '2026-10-22', generalNotes: 'גג רעפים, זמין אחרי 16:00', customFields: [] })
    expect(got.survey.photos).toEqual([])

    const list = async (key: string) => ((await (await listGet(ctx(e, '/api/surveys', { headers: bearer(key) }))).json()) as { surveys: { id: string; assigned_to_me: boolean }[] }).surveys
    expect((await list(dani.key)).find((r) => r.id === id)?.assigned_to_me).toBe(true)
    expect((await list(avi.key)).find((r) => r.id === id)?.assigned_to_me).toBe(false)

    // On the office screen it waits for its survey, then moves on once the phone sends one with photos.
    const jobs = async () => ((await (await overviewGet(ctx(e, '/api/office/overview', { headers: bearer(ronit.key) }))).json()) as { jobs: Record<string, any>[] }).jobs
    expect((await jobs())[0]).toMatchObject({ id, stage: 'lead', receivedBy: 'רונית' })

    // Reassign to Avi, keep the date: only the fields sent change.
    const re = await statusPut(ctx(e, `/api/office/status/${id}`, jsonInit('PUT', ronit.key, { assigned_to: avi.row.id }), { id }))
    expect(await re.json()).toMatchObject({ office: { assigned_to_name: 'אבי', planned_date: '2026-10-22', status: 'active', note: 'גג רעפים, זמין אחרי 16:00' } })
    expect((await list(avi.key)).find((r) => r.id === id)?.assigned_to_me).toBe(true)
    const badDate = await statusPut(ctx(e, `/api/office/status/${id}`, jsonInit('PUT', ronit.key, { planned_date: '22/10/2026' }), { id }))
    expect(badDate.status).toBe(400)
  })
})

describe('messages to the customer', () => {
  it('the office logs what it opened; newest first, checked, never sent from here', async () => {
    const e = env()
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', MASTER, surveyRecord()), { id: ID }))
    const { body: office } = await newKey(e, 'רונית', 'office')
    const { body: dani } = await newKey(e, 'דני', 'surveyor')
    const post = (key: string, body: unknown, id = ID) => messagesPost(ctx(e, `/api/office/messages/${id}`, jsonInit('POST', key, body), { id }))
    const list = async () => ((await (await messagesGet(ctx(e, `/api/office/messages/${ID}`, { headers: bearer(office.key) }, { id: ID }))).json()) as { messages: Record<string, string>[] }).messages
    const msg = { template_key: 'quote_sent', channel: 'whatsapp', to: '050-1234567', body: 'שלום ישראל, הצעת המחיר מוכנה' }

    expect((await post(dani.key, msg)).status).toBe(403)
    expect((await post(office.key, { ...msg, channel: 'fax' })).status).toBe(400)
    expect((await post(office.key, { ...msg, template_key: 'Quote Sent' })).status).toBe(400)
    expect((await post(office.key, { ...msg, body: '  ' })).status).toBe(400)
    expect((await post(office.key, { ...msg, body: 'א'.repeat(2001) })).status).toBe(400)
    expect((await post(office.key, msg, '3fa85f64-5717-4562-b3fc-2c963f66afa6')).status).toBe(404)
    expect(await list()).toEqual([])

    const r = await post(office.key, msg)
    expect(r.status).toBe(201)
    await new Promise((ok) => setTimeout(ok, 3)) // "newest first" needs two different milliseconds
    await post(office.key, { ...msg, template_key: 'quote_email_cover', channel: 'email', to: 'israel@example.com', subject: 'הצעת מחיר' })
    const got = await list()
    expect(got.map((m) => m.template_key)).toEqual(['quote_email_cover', 'quote_sent'])
    expect(got[1]).toMatchObject({ ...msg, by: 'רונית', subject: '' })
    expect(got[0]).toMatchObject({ channel: 'email', subject: 'הצעת מחיר' })
  })
})

describe('job timeline', () => {
  it('every event on one job, newest first, with who did it — office changes included', async () => {
    const e = env()
    const { body: office } = await newKey(e, 'רונית', 'office')
    const { body: dani } = await newKey(e, 'דני', 'surveyor')
    const opened = await jobsPost(ctx(e, '/api/office/jobs', jsonInit('POST', office.key, { customerName: 'משה אברהם', customerPhone: '054-1112233', address: 'הזית 7, גדרה', assigned_to: dani.row.id, planned_date: '2026-10-22' })))
    const { id } = (await opened.json()) as { id: string }
    const timeline = async () => ((await (await timelineGet(ctx(e, `/api/office/timeline/${id}`, { headers: bearer(office.key) }, { id }))).json()) as { events: { kind: string; text_he: string; by: string; at: string; tone?: string }[] }).events
    const texts = async () => (await timeline()).map((ev) => ev.text_he)

    expect(await texts()).toEqual(expect.arrayContaining(['העבודה נפתחה במשרד', 'שובץ לסוקר: דני', 'מועד סקר: 22.10.2026', 'הסקר הגיע לשרת']))
    expect((await timeline()).find((ev) => ev.text_he === 'שובץ לסוקר: דני')!.by).toBe('רונית')

    // The phone sends the survey, a quote, a link; the customer opens and approves.
    const sr = await surveyPut(ctx(e, `/api/surveys/${id}`, jsonInit('PUT', dani.key, { ...surveyRecord('h2'), project: { ...surveyRecord().project, id } }), { id }))
    const { q, pq } = await publicQuote()
    expect(sr.status).toBe(200)
    expect((await quotePut(ctx(e, `/api/surveys/${id}/quotes/1`, jsonInit('PUT', dani.key, { ...q, input: { ...q.input, projectId: id }, version_no: 1 }), { id, version: '1' }))).status).toBe(201)
    const { token } = (await (await publishPost(ctx(e, '/api/quotes', jsonInit('POST', dani.key, { quote: pq, survey_id: id })))).json()) as { token: string }
    await pageGet(ctx(e, `/q/${token}`, {}, { token }))
    await accept(e, token, '1234', pq.reference)
    await statusPut(ctx(e, `/api/office/status/${id}`, jsonInit('PUT', office.key, { milestones: { contract_signed: { date: '2026-10-01' } }, note: 'לקוח מהיר' }), { id }))
    await statusPut(ctx(e, `/api/office/status/${id}`, jsonInit('PUT', office.key, { milestones: { contract_signed: null } }), { id }))
    await messagesPost(ctx(e, `/api/office/messages/${id}`, jsonInit('POST', office.key, { template_key: 'quote_followup', channel: 'whatsapp', to: '054-1112233', body: 'שלום' }), { id }))

    const ev = await timeline()
    const t = ev.map((x) => x.text_he)
    expect(t).toEqual(
      expect.arrayContaining([
        'הסקר עודכן (גרסה 2)',
        expect.stringMatching(/^הצעת מחיר גרסה 1 · [\d,]+ ₪$/),
        'קישור ללקוח פורסם (גרסה 1)',
        'הלקוח פתח את ההצעה',
        'ישראל ישראלי אישר/ה את ההצעה (גרסה 1)',
        '✓ הסכם נחתם · 01.10.2026',
        'הערה: לקוח מהיר',
        'בוטל: הסכם נחתם',
        'הודעה ללקוח נפתחה בוואטסאפ: מעקב אחרי ההצעה',
      ]),
    )
    expect(ev.find((x) => x.kind === 'accepted')!.tone).toBe('ok')
    expect(ev.find((x) => x.text_he === 'קישור ללקוח פורסם (גרסה 1)')!.by).toBe('דני')
    // Newest first (actions in the same millisecond may come in either order).
    expect([...ev].sort((a, b) => b.at.localeCompare(a.at))).toEqual(ev)
    expect(ev.at(-1)!.text_he).not.toContain('הודעה')
    // Surveyors don't read it.
    expect((await timelineGet(ctx(e, `/api/office/timeline/${id}`, { headers: bearer(dani.key) }, { id }))).status).toBe(403)
  })
})

describe('submission file', () => {
  it('suggests the track, checks every step and document, and a submitted step marks the milestone', async () => {
    const e = env()
    const { body: office } = await newKey(e, 'רונית', 'office')
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', MASTER, surveyRecord()), { id: ID }))
    const { q } = await publicQuote()
    await quotePut(ctx(e, `/api/surveys/${ID}/quotes/1`, jsonInit('PUT', MASTER, { ...q, version_no: 1 }), { id: ID, version: '1' }))
    const get = async () => (await (await submissionGet(ctx(e, `/api/office/submission/${ID}`, { headers: bearer(office.key) }, { id: ID }))).json()) as { submission: Record<string, any> | null; suggested: { id: string; why_he: string } }
    const put = (body: unknown) => submissionPut(ctx(e, `/api/office/submission/${ID}`, jsonInit('PUT', office.key, body), { id: ID }))
    const err = async (body: unknown) => {
      const r = await put(body)
      expect(r.status).toBe(400)
      return ((await r.json()) as { message_he: string }).message_he
    }

    const first = await get()
    expect(first.submission).toBeNull()
    expect(first.suggested.id).toBe('commercial_15_100') // the test quote is a little over 15 kW
    expect(first.suggested.why_he).toContain('kW')

    expect(await err({ track: 'nope' })).toContain('מסלול')
    expect(await err({ steps: { 'xx.01': { date: '2026-10-01' } } })).toContain('לא קיים')
    expect(await err({ steps: { 'pre.05.submit_portal': { date: '2099-01-01' } } })).toContain('עוד לא הגיע')
    expect(await err({ docs: { selfie: { date: '2026-10-01' } } })).toContain('לא מוכר')
    expect(await err({ na: ['pre'] })).toContain('לא רלוונטי')

    const r = await put({ steps: { 'pre.01.collect_inputs': { date: '2026-10-01' }, 'pre.05.submit_portal': { date: '2026-10-03', ref: '7004512' } }, docs: { electric_bill_last: { date: '2026-10-01' } }, na: ['fire'] })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { submission: Record<string, any>; office: { milestones: Record<string, unknown> } }
    expect(body.submission).toMatchObject({ track: 'commercial_15_100', na: ['fire'], updated_by: 'רונית' })
    // The submission step is the IEC milestone: marked once, with the request number.
    expect(body.office.milestones.iec_submitted).toEqual({ date: '2026-10-03', ref: '7004512' })
    expect((await get()).submission!.steps['pre.05.submit_portal']).toEqual({ date: '2026-10-03', ref: '7004512' })

    // Changing the track keeps what was ticked; a step of another track is refused.
    await put({ track: 'residential_le15' })
    expect((await get()).submission!.steps['pre.01.collect_inputs']).toBeTruthy()
    expect(await err({ steps: { 'hd.01.identify_distributor': { date: '2026-10-01' } } })).toContain('לא קיים')

    const tl = ((await (await timelineGet(ctx(e, `/api/office/timeline/${ID}`, { headers: bearer(office.key) }, { id: ID }))).json()) as { events: { text_he: string }[] }).events.map((x) => x.text_he)
    expect(tl).toEqual(expect.arrayContaining([expect.stringContaining('תיק הגשה — ✓ הגשה ב-digitalorders'), expect.stringContaining('מסמך התקבל: חשבון חשמל אחרון'), 'לא רלוונטי לעבודה: כבאות', '✓ הוגשה בקשה לחח״י · 03.10.2026 · מספר פנייה 7004512', 'מסלול הגשה: ביתי עד 15 kW']))
  })
})

describe('customer page after the approval', () => {
  it('shows where the project stands in the customer’s words, follows the office, and keeps internal details out', async () => {
    const e = env()
    const { body: office } = await newKey(e, 'רונית', 'office')
    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', MASTER, surveyRecord()), { id: ID }))
    const { pq } = await publicQuote()
    const { token } = (await (await publishPost(ctx(e, '/api/quotes', jsonInit('POST', MASTER, { quote: pq, survey_id: ID })))).json()) as { token: string }
    const page = async () => (await pageGet(ctx(e, `/q/${token}`, {}, { token }))).text()
    const status = (body: unknown) => statusPut(ctx(e, `/api/office/status/${ID}`, jsonInit('PUT', office.key, body), { id: ID }))

    expect(await page()).not.toContain('איפה הפרויקט עומד') // not before the approval
    await accept(e, token, '1234', pq.reference)
    let html = await page()
    expect(html).toContain('איפה הפרויקט עומד')
    expect(html).toContain('ניצור קשר לחתימה על ההסכם')
    expect(html).toMatch(/<li class="now" aria-current="step">הסכם ומקדמה<\/li>/)

    await status({ milestones: { contract_signed: { date: '2026-10-01' }, deposit_paid: { date: '2026-10-02', ref: 'R-118' } }, note: 'לקוח לחוץ' })
    await submissionPut(ctx(e, `/api/office/submission/${ID}`, jsonInit('PUT', office.key, { steps: { 'pre.05.submit_portal': { date: '2026-10-03', ref: '7004512' } } }), { id: ID }))
    html = await page()
    expect(html).toMatch(/<li class="done">הסכם ומקדמה <span class="muted">· <bdi>02\/10\/2026<\/bdi><\/span><\/li>/)
    expect(html).toMatch(/<li class="now" aria-current="step">בקשה לחברת החשמל ותכנון הנדסי<\/li>/)
    expect(html).toContain('נעדכן כשתתקבל תשובה')
    // Nothing internal: no note, no references, no names of the office.
    for (const secret of ['לקוח לחוץ', 'R-118', '7004512', 'רונית']) expect(html).not.toContain(secret)

    await status({ status: 'on_hold' })
    expect(await page()).toContain('הפרויקט בהמתנה כרגע')
    await status({ status: 'lost' })
    expect(await page()).not.toContain('איפה הפרויקט עומד')
  })
})

describe('company profile', () => {
  it('admins set it; anyone reads it; the customer page carries it', async () => {
    const e = env()
    const { body: office } = await newKey(e, 'רונית', 'office')
    const read = async () => ((await (await companyGet(ctx(e, '/api/company'))).json()) as { company: Record<string, string> }).company
    expect(await read()).toMatchObject({ brand: 'B.E.E', name_he: 'ברק הנדסת חשמל בע״מ', company_id: '515839090', phone: '050-955-4483' })

    const put = (key: string, body: unknown) => companyPut(ctx(e, '/api/office/company', jsonInit('PUT', key, body)))
    expect((await put(office.key, { name_he: 'x' })).status).toBe(403)
    const bad = await put(MASTER, { name_he: 'ברק הנדסת חשמל בע״מ', company_id: '123456789' })
    expect(bad.status).toBe(400)
    expect(((await bad.json()) as { message_he: string }).message_he).toContain('ח״פ')
    expect((await put(MASTER, { name_he: 'ברק הנדסת חשמל בע״מ', company_id: '123456782', phone: '08-1234567', email: 'office@barak-e.com', address: 'גדרה' })).status).toBe(200)
    expect(await read()).toMatchObject({ company_id: '123456782', phone: '08-1234567' })

    await surveyPut(ctx(e, `/api/surveys/${ID}`, jsonInit('PUT', MASTER, surveyRecord()), { id: ID }))
    const { pq } = await publicQuote()
    const { token } = (await (await publishPost(ctx(e, '/api/quotes', jsonInit('POST', MASTER, { quote: pq, survey_id: ID })))).json()) as { token: string }
    let html = await (await pageGet(ctx(e, `/q/${token}`, {}, { token }))).text()
    expect(html).toContain('src="/brand/bee-logo.png"')
    expect(html).toContain('ח״פ <bdi>123456782</bdi>')
    expect(html).toContain('href="tel:+97281234567"')
    await accept(e, token, '1234', pq.reference)
    html = await (await pageGet(ctx(e, `/q/${token}`, {}, { token }))).text()
    expect(html).toMatch(/לשאלות — התקשרו אלינו: <a href="tel:\+97281234567">/)
  })
})
