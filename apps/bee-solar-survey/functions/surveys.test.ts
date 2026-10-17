import { describe, expect, it } from 'vitest'
import type { Ctx, Env } from './_lib/env'
import { MemoryBucket } from './_lib/memoryBucket'
import { onRequestGet as listGet } from './api/surveys/index'
import { onRequestGet as surveyGet, onRequestOptions as surveyOptions, onRequestPut as surveyPut } from './api/surveys/[id]'
import { onRequestGet as photoGet, onRequestPut as photoPut } from './api/surveys/[id]/photos/[photo]'
import { onRequestPut as quotePut } from './api/surveys/[id]/quotes/[version]'
import { onRequestGet as jobsGet } from './api/hive/jobs'
import { onRequestPut as reportPut } from './api/surveys/[id]/reports/[report]'

const KEY = 'test-publish-key-0123456789'
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PHOTO = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const SHA = '474ebe266cd7f9ed28807fa3fdfe0c04cdb3cef9313cdda5c08b15910fcc8184' // sha256 of JPEG
const PKEY = `${PHOTO}.${SHA.slice(0, 12)}`
const AUTH = { authorization: `Bearer ${KEY}` }

const env = (): Env => ({ QUOTES: new MemoryBucket(), PUBLIC_BASE_URL: 'https://app.barak-e.com', PUBLISH_KEY: KEY })
const ctx = (e: Env, path: string, init: RequestInit = {}, params: Record<string, string> = {}): Ctx => ({
  request: new Request(`https://app.barak-e.com${path}`, init),
  env: e,
  params,
})

function record(over: Record<string, unknown> = {}) {
  return {
    schema: 'bee.survey-record/1',
    project: { id: ID, projectName: 'גג הרצל', address: 'הרצל 1', surveyor: 'תמיר', updatedAt: '2026-10-15T08:00:00.000Z' },
    photos: [{ id: PHOTO, field: 'roof', key: PKEY, sha256: SHA, mimeType: 'image/jpeg', annotated: false, createdAt: '2026-10-15T08:00:00.000Z' }],
    hive: { jobs: [{ id: 'j1', kind: 'collect', outbound: { requiresHumanPick: true, destinationClass: 'drafts_group' } }] },
    completeness: { score: 90, readyForWave54: true },
    contentHash: 'h1',
    ...over,
  }
}

const putSurvey = (e: Env, body: unknown, headers: Record<string, string> = AUTH) =>
  surveyPut(ctx(e, `/api/surveys/${ID}`, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }, { id: ID }))

const quote = (v: number, hash: string) => ({ version_no: v, snapshot_hash: hash, quote_number: 'Q-1', input: { projectId: ID } })
const putQuote = (e: Env, v: number, body: unknown) =>
  quotePut(ctx(e, `/api/surveys/${ID}/quotes/${v}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) }, { id: ID, version: String(v) }))

describe('survey backup API', () => {
  it('stores the survey, reports missing photos, then accepts them', async () => {
    const e = env()
    let res = await putSurvey(e, record())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, changed: true, missing_photos: [PKEY] })

    const jpeg = JPEG
    // Bytes that do not match the key's fingerprint are refused (photos are content-addressed).
    const other = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])
    res = await photoPut(ctx(e, `/api/surveys/${ID}/photos/${PKEY}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'image/jpeg' }, body: other }, { id: ID, photo: PKEY }))
    expect(res.status).toBe(400)
    res = await photoPut(ctx(e, `/api/surveys/${ID}/photos/${PKEY}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'image/jpeg' }, body: jpeg }, { id: ID, photo: PKEY }))
    expect(res.status).toBe(201)

    res = await putSurvey(e, record())
    expect(await res.json()).toMatchObject({ changed: false, missing_photos: [] })

    const got = await photoGet(ctx({ ...e, ALLOWED_ORIGINS: 'https://survey.barak-e.com' }, `/api/surveys/${ID}/photos/${PKEY}`, { headers: { ...AUTH, origin: 'https://survey.barak-e.com' } }, { id: ID, photo: PKEY }))
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(jpeg)
    expect(got.headers.get('access-control-allow-origin')).toBe('https://survey.barak-e.com') // restore from another origin works
  })

  it('keeps history only for distinct content and lists surveys for restore', async () => {
    const e = env()
    await putSurvey(e, record())
    await putSurvey(e, record())
    await putSurvey(e, record({ contentHash: 'h2' }))
    const bucket = e.QUOTES as MemoryBucket
    expect([...bucket.store.keys()].filter((k) => k.includes('/history/'))).toHaveLength(2)

    const res = await listGet(ctx(e, '/api/surveys', { headers: AUTH }))
    const { surveys } = (await res.json()) as { surveys: { id: string; projectName: string; readyForWave54: boolean; photoCount: number }[] }
    expect(surveys).toEqual([expect.objectContaining({ id: ID, projectName: 'גג הרצל', readyForWave54: true, photoCount: 1 })])
  })

  it('quote versions are immutable and need the survey first', async () => {
    const e = env()
    expect((await putQuote(e, 1, quote(1, 's1'))).status).toBe(409) // survey_first
    await putSurvey(e, record())
    expect((await putQuote(e, 1, quote(1, 's1'))).status).toBe(201)
    expect((await putQuote(e, 1, quote(1, 's1'))).status).toBe(200) // retry after a lost reply
    expect((await putQuote(e, 1, quote(1, 'other'))).status).toBe(409)
    expect((await putQuote(e, 2, quote(3, 's3'))).status).toBe(400) // number mismatch
    expect((await putQuote(e, 2, { ...quote(2, 's2'), input: { projectId: 'someone-else' } })).status).toBe(400)

    const res = await surveyGet(ctx(e, `/api/surveys/${ID}`, { headers: AUTH }, { id: ID }))
    const body = (await res.json()) as { survey: { contentHash: string }; quotes: { version_no: number }[] }
    expect(body.survey.contentHash).toBe('h1')
    expect(body.quotes.map((q) => q.version_no)).toEqual([1])
    const list = (await (await listGet(ctx(e, '/api/surveys', { headers: AUTH }))).json()) as { surveys: { quoteVersions: number }[] }
    expect(list.surveys[0]!.quoteVersions).toBe(1)
  })

  it('hive feed returns jobs with the survey id and honours since', async () => {
    const e = env()
    await putSurvey(e, record())
    const res = await jobsGet(ctx(e, '/api/hive/jobs', { headers: AUTH }))
    const body = (await res.json()) as { jobs: { kind: string; survey_id: string; outbound: { requiresHumanPick: boolean } }[]; until: string }
    expect(body.jobs).toEqual([expect.objectContaining({ kind: 'collect', survey_id: ID, content_hash: 'h1', outbound: expect.objectContaining({ requiresHumanPick: true }) })])
    // `until` lags a minute behind, so a write that lands while the feed is listed is re-sent, never lost.
    expect(Date.now() - Date.parse(body.until)).toBeGreaterThanOrEqual(59_000)
    const mark = new Date().toISOString()
    await new Promise((r) => setTimeout(r, 5))
    await putSurvey(e, record()) // same content re-sent (e.g. after a lost reply) is not news for the hive
    const later = (await (await jobsGet(ctx(e, `/api/hive/jobs?since=${encodeURIComponent(mark)}`, { headers: AUTH }))).json()) as { jobs: unknown[] }
    expect(later.jobs).toEqual([])
    await putSurvey(e, record({ contentHash: 'h2' }))
    // `since` without milliseconds is normalised, so nothing slips through string comparison.
    const noMs = mark.replace(/\.\d{3}Z$/, 'Z')
    const changed = (await (await jobsGet(ctx(e, `/api/hive/jobs?since=${encodeURIComponent(noMs)}`, { headers: AUTH }))).json()) as { jobs: { content_hash: string }[] }
    expect(changed.jobs.map((j) => j.content_hash)).toEqual(['h2'])
    expect((await jobsGet(ctx(e, '/api/hive/jobs?since=yesterday', { headers: AUTH }))).status).toBe(400)
  })

  it('lets the app on our domain PUT across origins (CORS preflight)', async () => {
    const e = { ...env(), ALLOWED_ORIGINS: 'https://survey.barak-e.com' }
    const res = await surveyOptions(ctx(e, `/api/surveys/${ID}`, { method: 'OPTIONS', headers: { origin: 'https://survey.barak-e.com', 'access-control-request-method': 'PUT' } }, { id: ID }))
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://survey.barak-e.com')
  })

  it('rejects missing keys, bad ids, mismatched records and non-images', async () => {
    const e = env()
    expect((await putSurvey(e, record(), {})).status).toBe(401)
    expect((await listGet(ctx(e, '/api/surveys'))).status).toBe(401)
    expect((await jobsGet(ctx(e, '/api/hive/jobs', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401)
    expect((await putSurvey(e, record({ project: { id: 'other' } }))).status).toBe(400)
    expect((await putSurvey(e, record({ photos: [{ key: '../../quotes/x' }] }))).status).toBe(400)
    const bad = await surveyPut(ctx(e, '/api/surveys/x', { method: 'PUT', headers: AUTH, body: '{}' }, { id: '../x' }))
    expect(bad.status).toBe(400)
    const html = await photoPut(ctx(e, `/api/surveys/${ID}/photos/${PKEY}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'text/html' }, body: '<b>' }, { id: ID, photo: PKEY }))
    expect(html.status).toBe(415)
    expect((await surveyGet(ctx(e, `/api/surveys/${ID}`, { headers: AUTH }, { id: ID }))).status).toBe(404)
  })
})

const RID = '9b2e1c3a-5d4f-4a6b-8c7d-0e1f2a3b4c5d'
const RPHOTO = 'c56a4180-65aa-42ec-a945-5fd21dec0538'
const RKEY = `${RPHOTO}.${'b'.repeat(12)}`

function reportWire(over: Record<string, unknown> = {}) {
  return {
    id: RID,
    projectId: ID,
    templateKey: 'inspection_62446',
    templateVersion: 1,
    revision: 1,
    status: 'draft',
    updatedAt: '2026-10-15T09:00:00.000Z',
    finalizedAt: null,
    contentHash: null,
    photos: [{ id: RPHOTO, key: RKEY, sha256: 'b'.repeat(64), mimeType: 'image/jpeg', sectionKey: 'photos', createdAt: '2026-10-15T09:00:00.000Z' }],
    signatures: { inspector: { name: 'דני', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', signedAt: '2026-10-15T09:00:00.000Z' } },
    title_he: 'בדיקת מתקן — IEC 62446-1',
    outcome: { tone: 'fail', label_he: 'נכשל · 2 ליקויים' },
    fields: {},
    ...over,
  }
}

const putReport = (e: Env, body: unknown, rid = RID) =>
  reportPut(ctx(e, `/api/surveys/${ID}/reports/${rid}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) }, { id: ID, report: rid }))

describe('field report backup API', () => {
  it('needs the survey first, then stores drafts and reports missing photos', async () => {
    const e = env()
    expect((await putReport(e, reportWire())).status).toBe(409)
    await putSurvey(e, record())
    const r1 = await putReport(e, reportWire())
    expect(r1.status).toBe(201)
    expect(await r1.json()).toMatchObject({ result: 'stored', missing_photos: [RKEY] })
    // A draft may be replaced.
    expect((await putReport(e, reportWire({ updatedAt: '2026-10-15T09:05:00.000Z', fields: { a: { b: 'c' } } }))).status).toBe(201)
    const got = (await (await surveyGet(ctx(e, `/api/surveys/${ID}`, { headers: AUTH }, { id: ID }))).json()) as { reports: { id: string; fields: unknown }[] }
    expect(got.reports).toEqual([expect.objectContaining({ id: RID, fields: { a: { b: 'c' } } })])
  })

  it('a final report never changes, and shows up once in the hive feed', async () => {
    const e = env()
    await putSurvey(e, record())
    const final = reportWire({ status: 'final', finalizedAt: '2026-10-15T10:00:00.000Z', contentHash: 'c'.repeat(64) })
    expect((await putReport(e, final)).status).toBe(201)
    expect((await putReport(e, final)).status).toBe(200) // retry after a lost reply
    expect((await putReport(e, { ...final, contentHash: 'd'.repeat(64) })).status).toBe(409)
    expect((await putReport(e, { ...final, status: 'draft', contentHash: null })).status).toBe(409) // cannot un-finalize

    const feed = (await (await jobsGet(ctx(e, '/api/hive/jobs', { headers: AUTH }))).json()) as { events: { type: string; report_id: string; title_he: string; outcome: { tone: string; label_he: string } }[]; until: string }
    const ev = feed.events.filter((x) => x.type === 'report.finalized')
    expect(ev).toEqual([expect.objectContaining({ report_id: RID, event_id: `report.finalized:${RID}:${'c'.repeat(64)}`, title_he: 'בדיקת מתקן — IEC 62446-1', outcome: { tone: 'fail', label_he: 'נכשל · 2 ליקויים' } })])
    await new Promise((r) => setTimeout(r, 5))
    const later = (await (await jobsGet(ctx(e, `/api/hive/jobs?since=${encodeURIComponent(new Date().toISOString())}`, { headers: AUTH }))).json()) as { events: unknown[] }
    expect(later.events).toEqual([])
    // Hebrew is stored URL-encoded in R2 metadata, never raw.
    const meta = (await e.QUOTES.get(`report-index/${ID}/${RID}`))!.customMetadata!
    expect(meta.title_he).not.toMatch(/[\u0590-\u05FF]/)
    expect(decodeURIComponent(meta.title_he!)).toBe('בדיקת מתקן — IEC 62446-1')
  })

  it('rejects bad ids, unknown templates, mismatched ids, bad photo keys and final reports without a hash', async () => {
    const e = env()
    await putSurvey(e, record())
    expect((await putReport(e, reportWire(), '../x')).status).toBe(400)
    expect((await putReport(e, reportWire({ templateKey: 'evil' }))).status).toBe(400)
    expect((await putReport(e, reportWire({ projectId: 'other' }))).status).toBe(400)
    expect((await putReport(e, reportWire({ photos: [{ key: '../../quotes/x' }] }))).status).toBe(400)
    expect((await putReport(e, reportWire({ status: 'final', contentHash: null }))).status).toBe(400)
    const noAuth = await reportPut(ctx(e, `/api/surveys/${ID}/reports/${RID}`, { method: 'PUT', body: '{}' }, { id: ID, report: RID }))
    expect(noAuth.status).toBe(401)
  })

  it('survey list rows survive the metadata encoding', async () => {
    const e = env()
    await putSurvey(e, record())
    const { surveys } = (await (await listGet(ctx(e, '/api/surveys', { headers: AUTH }))).json()) as { surveys: { projectName: string; readyForWave54: boolean; score: number }[] }
    expect(surveys[0]).toMatchObject({ projectName: 'גג הרצל', readyForWave54: true, score: 90 })
  })
})

describe('review fixes', () => {
  it('a malformed hive bundle is refused, so it can never break the feed', async () => {
    const e = env()
    expect((await putSurvey(e, record({ hive: { jobs: {} } }))).status).toBe(400)
  })

  it('names with emoji at the cut-off never break the index write', async () => {
    const e = env()
    const name = 'א'.repeat(199) + '😀'
    const res = await putSurvey(e, record({ project: { id: ID, projectName: name } }))
    expect(res.status).toBe(200)
    const { surveys } = (await (await listGet(ctx(e, '/api/surveys', { headers: AUTH }))).json()) as { surveys: { projectName: string }[] }
    expect(surveys[0]!.projectName.length).toBeGreaterThan(198)
  })

  it('a report signature must be a PNG data URL — nothing that could become markup', async () => {
    const e = env()
    await putSurvey(e, record())
    const evil = reportWire({ signatures: { inspector: { name: 'x', dataUrl: 'x" onerror="alert(1)', signedAt: '' } } })
    expect((await putReport(e, evil)).status).toBe(400)
    expect((await putReport(e, reportWire({ photos: [{ id: 'not-a-uuid"><img', key: RKEY, sha256: 'b'.repeat(64) }] }))).status).toBe(400)
  })

  it('the same report id under another survey cannot touch the first survey\'s hive row', async () => {
    const e = env()
    await putSurvey(e, record())
    const final = reportWire({ status: 'final', finalizedAt: '2026-10-15T10:00:00.000Z', contentHash: 'c'.repeat(64) })
    await putReport(e, final)
    const other = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
    await surveyPut(ctx(e, `/api/surveys/${other}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(record({ project: { id: other } })) }, { id: other }))
    await reportPut(ctx(e, `/api/surveys/${other}/reports/${RID}`, { method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify({ ...reportWire(), projectId: other }) }, { id: other, report: RID }))
    const meta = (await e.QUOTES.get(`report-index/${ID}/${RID}`))!.customMetadata!
    expect(decodeURIComponent(meta.status!)).toBe('final')
  })

  it('two phones racing on the same quote version: exactly one wins', async () => {
    const e = env()
    await putSurvey(e, record())
    const [a, b] = await Promise.all([putQuote(e, 1, quote(1, 'phone-a')), putQuote(e, 1, quote(1, 'phone-b'))])
    expect([a.status, b.status].sort()).toEqual([201, 409])
  })
})
