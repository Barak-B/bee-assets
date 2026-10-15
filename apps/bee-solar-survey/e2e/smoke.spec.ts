import { expect, test, type Download, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import zlib from 'node:zlib'

/** Minimal valid 64×48 RGB PNG, generated so the repo carries no binary fixture. */
function pngFixture(): Buffer {
  const w = 64
  const h = 48
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = (x * 4) & 255
      raw[o + 1] = (y * 5) & 255
      raw[o + 2] = 128
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => {
    let c = 0xffffffff
    for (const byte of b) c = crcTable[(c ^ byte) & 255]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function bytesOf(d: Download): Promise<Buffer> {
  const path = await d.path()
  return readFile(path!)
}

async function createSurvey(page: Page, name: string) {
  await page.goto('/')
  await page.click('#btnNew')
  await page.fill('#f_projectName', name)
  await page.fill('#f_address', 'רחוב הרצל 1, תל אביב')
  await page.fill('#f_gps', '32.08, 34.78')
  await page.fill('#f_surveyor', 'תמיר')
  await page.selectOption('#f_roofType', 'בטון')
  await page.selectOption('#f_mainBreaker', '63A')
  await page.fill('#f_usableArea', '120')
  await page.fill('#f_targetKwp', '15')
  await page.fill('#f_cableLength', '35')
  await page.selectOption('#f_inverterBrand', 'SolarEdge')
  await page.fill('#f_generalNotes', 'הערה ארוכה לבדיקת גלישה של טקסט בדוח. '.repeat(8))
  await page.dispatchEvent('#f_targetKwp', 'change')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('.photo-block[data-field="roof"] [data-action="gallery"]'),
  ])
  await chooser.setFiles({ name: 'roof.png', mimeType: 'image/png', buffer: pngFixture() })
  await expect(page.locator('.photo-block[data-field="roof"] .thumb')).toHaveCount(1)
  await page.click('#btnSave')
  await expect(page.locator('.project-item', { hasText: name })).toBeVisible()
}

async function fillPriceBook(page: Page, publish?: { baseUrl: string; key: string }, roi = false) {
  // Pricing: download template, fill every cost, import it back.
  await page.click('#btnPricing')
  await expect(page.locator('#pricingReadiness')).toContainText('חסר')
  const [tpl] = await Promise.all([page.waitForEvent('download'), page.click('#pTemplate')])
  const csv = (await bytesOf(tpl)).toString('utf8')
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/)
  const header = lines[0]!.split(',')
  const costIdx = header.indexOf('unit_cost')
  // Only name_he can contain quoted commas, so address the cost column from the right.
  const fromRight = header.length - costIdx
  const filled = [lines[0], ...lines.slice(1).map((l, i) => {
    const cells = l.split(',')
    cells[cells.length - fromRight] = String(60 + i * 15)
    return cells.join(',')
  })].join('\r\n')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#pImport')])
  await chooser.setFiles({ name: 'supplier.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + filled, 'utf8') })
  await expect(page.locator('#piSummary')).toContainText('מחירים חדשים')
  await page.click('#piApprove')
  await expect(page.locator('#toast')).toContainText('יובאו')

  // Rules
  await page.fill('#p_vat', '18')
  await page.fill('#p_defMargin', '25')
  await page.fill('#p_validity', '30')
  await page.fill('#p_round', '10')
  await page.fill('#p_usd', '3.7')
  await page.fill('#p_eur', '4')
  for (const [roof, v] of [['flat', '300'], ['tile', '350'], ['metal-standing-seam', '280'], ['metal-trapezoidal', '280'], ['ground', '320'], ['other', '300']]) {
    await page.fill(`#p_l_${roof}`, v)
  }
  await page.click('#pSuggest')
  for (const [i, v] of ['30', '40', '20', '5', '5'].entries()) await page.fill(`#p_pay_${i}`, v)
  if (roi) {
    await page.selectOption('#p_roi_track', 'net_metering')
    await expect(page.locator('#p_roi_feed_in_tariff_ils_kwh')).toBeHidden() // only the chosen track's fields
    await page.fill('#p_roi_consumption_tariff_ils_kwh', '0.6') // test tariff, not a real one
    await page.click('#pSuggestRoi')
    await expect(page.locator('#p_roi_horizon_years')).toHaveValue('25')
    await page.fill('#p_t_warranty', 'עבודה והתקנה — 5 שנים\n\n  ')
    await page.fill('#p_t_excluded', 'חיזוק גג')
  }
  if (publish) {
    await page.fill('#p_pubBase', publish.baseUrl)
    await page.fill('#p_pubKey', publish.key)
  }
  await page.click('#pSave')
  await expect(page.locator('#pricingReadiness')).toContainText('מוכן')
  await page.click('#pBack')

}

test.beforeEach(async ({ page }) => {
  // Background backup must never reach the real domain from a test; tests that exercise it route it themselves.
  await page.route('https://app.barak-e.com/api/surveys**', (r) => r.abort('internetdisconnected'))
  page.on('dialog', (d) => void d.accept())
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  ;(page as unknown as { __errors: string[] }).__errors = errors
})

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([])
})

test('survey → Hebrew PDF report with real text', async ({ page }) => {
  await createSurvey(page, 'גג בדיקה PDF')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.project-item', { hasText: 'גג בדיקה PDF' }).locator('[data-pdf]').click()])
  expect(dl.suggestedFilename()).toMatch(/^bee-survey-.+\.pdf$/)
  const pdf = await bytesOf(dl)
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(10_000)
  expect(pdf.length).toBeLessThan(400_000) // old renderer: ~2 MB per page of text
  expect(pdf.toString('latin1')).toContain('Heebo')
})

test('price book import → priced quote, BOQ Excel and versioning', async ({ page }) => {
  await createSurvey(page, 'גג בדיקה הצעה')

  await fillPriceBook(page)

  // Re-import with a big jump → flagged for review; cancelling keeps the price book as it was.
  await page.click('#btnPricing')
  const before = await page.inputValue('[data-cost="BEE-CAB-AC"]')
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.click('#pImport')])
  await again.setFiles({ name: 'supplier-v2.csv', mimeType: 'text/csv', buffer: Buffer.from(`sku,unit_cost\r\nBEE-CAB-AC,${Number(before) * 2}\r\nNOPE-123,5\r\n`, 'utf8') })
  await expect(page.locator('#piSummary')).toContainText('1 לבדיקה')
  await expect(page.locator('tr.pi-alert')).toContainText('+100%')
  await expect(page.locator('.dialog')).toContainText('NOPE-123')
  await page.click('#piCancel')
  await expect(page.locator('#toast')).toContainText('הייבוא בוטל')
  await expect(page.locator('[data-cost="BEE-CAB-AC"]')).toHaveValue(before)
  await page.click('#pBack')

  // Quote v1
  await page.locator('.project-item', { hasText: 'גג בדיקה הצעה' }).locator('[data-quote]').click()
  await expect(page.locator('.note-ok')).toBeVisible()
  await page.click('#qdNew')
  const card = page.locator('.quote-card[data-ver="1"]')
  await expect(card).toContainText('מתומחר')
  await expect(card).toContainText('כולל מע״מ')

  const [qpdf] = await Promise.all([page.waitForEvent('download'), card.locator('[data-q-pdf]').click()])
  const qbytes = await bytesOf(qpdf)
  expect(qbytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  for (const view of ['customer', 'internal']) {
    const [x] = await Promise.all([page.waitForEvent('download'), card.locator(`[data-q-xlsx="${view}"]`).click()])
    expect(x.suggestedFilename()).toMatch(new RegExp(`^BOQ_Q-\\d{6}-[0-9A-F]{6}_v1_${view}\\.xlsx$`))
    const xb = await bytesOf(x)
    expect(xb.subarray(0, 2).toString('latin1')).toBe('PK')
  }

  // Same inputs → no new version
  await page.click('#qdNew')
  await expect(page.locator('#toast')).toContainText('אין שינוי')
  await expect(page.locator('.quote-card')).toHaveCount(1)

  // Change the survey → v2 with a diff
  await page.click('#qdClose')
  await page.locator('.project-item', { hasText: 'גג בדיקה הצעה' }).locator('[data-edit]').click()
  await page.fill('#f_targetKwp', '20')
  await page.dispatchEvent('#f_targetKwp', 'change')
  await page.click('#btnQuote')
  await page.click('#qdNew')
  await expect(page.locator('.quote-card[data-ver="2"]')).toContainText('שינויים')
})

test('app shell works offline after first load', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload() // let the SW take control
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#btnNew')).toBeVisible()
  await context.setOffline(false)
})

test('publish a priced quote → customer link on our domain, never 127.0.0.1', async ({ page }) => {
  const BASE = 'https://app.barak-e.com'
  const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'
  let published: { quote: Record<string, unknown>; pdfBase64: string } | null = null
  let auth = ''
  await page.route(`${BASE}/api/quotes`, async (route) => {
    auth = route.request().headers()['authorization'] ?? ''
    published = route.request().postDataJSON()
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token: TOKEN, url: `${BASE}/q/${TOKEN}`, published_at: '2026-10-14T10:00:00.000Z' }) })
  })
  await page.route(`${BASE}/api/quotes/${TOKEN}`, async (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ views: 3, last_viewed_at: '2026-10-14T11:00:00.000Z', accepted: { name: 'ישראל ישראלי', accepted_at: '2026-10-14T12:00:00.000Z', version_no: 1, reference: 'abc' } }) })
  })

  await createSurvey(page, 'גג בדיקה פרסום')
  await fillPriceBook(page, { baseUrl: BASE, key: 'e2e-key' }, true)
  await page.click('#btnPricing')
  await expect(page.locator('#p_pubStatus')).toContainText(`${BASE}/q/`)
  await expect(page.locator('#pricingRecommended')).toHaveCount(0) // savings estimate configured
  await page.click('#pBack')

  await page.locator('.project-item', { hasText: 'גג בדיקה פרסום' }).locator('[data-quote]').click()
  await page.click('#qdNew')
  const card = page.locator('.quote-card[data-ver="1"]')
  await card.locator('[data-q-publish]').click()
  await expect(card.locator('.pub-url')).toHaveValue(`${BASE}/q/${TOKEN}`)
  await expect(card.locator('[data-views="1"]')).toContainText('3')
  await expect(card.locator('[data-accepted="1"]')).toContainText('הלקוח אישר את ההצעה: ישראל ישראלי')

  expect(auth).toBe('Bearer e2e-key')
  const body = JSON.stringify(published)
  expect(body).toContain('"schema":"bee.public-quote/1"')
  const roi = (published!.quote as { roi?: { savings_y1_ils: number; cumulative: unknown[]; monthly_kwh: number[] } }).roi
  expect(roi?.savings_y1_ils).toBeGreaterThan(0)
  expect(roi?.cumulative).toHaveLength(25)
  expect(roi?.monthly_kwh).toHaveLength(12)
  expect((published!.quote as { terms: { texts?: { warranty: string[]; excluded: string[]; included: string[] } } }).terms.texts).toEqual({
    included: [],
    excluded: ['חיזוק גג'],
    warranty: ['עבודה והתקנה — 5 שנים'],
    customer_obligations: [],
  })
  // Check the quote JSON only — the base64 PDF next to it can contain any letters.
  const quoteJson = JSON.stringify(published!.quote)
  for (const banned of ['"unit_cost"', '"margin_pct"', '"fx_rate"', '"sku"', '"flags"', '"npv_ils"', '"irr_pct"']) expect(quoteJson).not.toContain(banned)
  const pdf = Buffer.from(published!.pdfBase64, 'base64')
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  // Survives a reload (stored locally), then revoke.
  await page.click('#qdClose')
  await page.locator('.project-item', { hasText: 'גג בדיקה פרסום' }).locator('[data-quote]').click()
  await expect(page.locator('.quote-card[data-ver="1"] .pub-url')).toHaveValue(`${BASE}/q/${TOKEN}`)
  await page.locator('.quote-card[data-ver="1"] [data-q-revoke]').click()
  await expect(page.locator('.quote-card[data-ver="1"] [data-q-publish]')).toBeVisible()
})

test('a server that answers with a local link is refused', async ({ page }) => {
  const BASE = 'https://app.barak-e.com'
  await page.route(`${BASE}/api/quotes`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token: 'fvBWhmaLosj9mcwEloHsiA', url: 'http://127.0.0.1:50973/q/fvBWhmaLosj9mcwEloHsiA', published_at: '2026-10-14T10:00:00.000Z' }) }),
  )
  await createSurvey(page, 'גג בדיקה קישור מקומי')
  await fillPriceBook(page, { baseUrl: BASE, key: 'e2e-key' })
  await page.locator('.project-item', { hasText: 'גג בדיקה קישור מקומי' }).locator('[data-quote]').click()
  await page.click('#qdNew')
  await page.locator('.quote-card[data-ver="1"] [data-q-publish]').click()
  await expect(page.locator('#toast')).toContainText('לא ציבורי')
  await expect(page.locator('.pub-url')).toHaveCount(0)
})

test('local addresses cannot be saved as the publishing domain', async ({ page }) => {
  await page.goto('/')
  await page.click('#btnPricing')
  await page.fill('#p_pubBase', 'http://127.0.0.1:50973')
  await page.click('#pSave')
  await expect(page.locator('#toast')).toContainText('כתובת האתר לא נשמרה')
  await expect(page.locator('#p_pubStatus')).toContainText('לא הוגדר')
})

/** Tiny stand-in for the Pages Functions survey API, enough to drive the app's sync and restore. */
function fakeSurveyServer(key: string) {
  const surveys = new Map<string, Record<string, unknown>>()
  const photos = new Map<string, { body: Buffer; type: string }>()
  const quotes = new Map<string, Record<string, unknown>>()
  const reports = new Map<string, Record<string, unknown>>()
  const state = { down: false, auth: new Set<string>() }
  const handler = async (route: import('@playwright/test').Route) => {
    if (state.down) return route.abort('internetdisconnected')
    const req = route.request()
    state.auth.add(req.headers()['authorization'] ?? '')
    if (req.headers()['authorization'] !== `Bearer ${key}`) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' })
    const path = new URL(req.url()).pathname
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    let m: RegExpMatchArray | null
    if (path === '/api/surveys' && req.method() === 'GET') {
      return json(200, { surveys: [...surveys.values()].map((r) => ({ id: (r.project as { id: string }).id, projectName: (r.project as { projectName: string }).projectName })) })
    }
    if ((m = path.match(/^\/api\/surveys\/([^/]+)\/photos\/([^/]+)$/))) {
      if (req.method() === 'PUT') {
        photos.set(`${m[1]}/${m[2]}`, { body: req.postDataBuffer()!, type: req.headers()['content-type'] ?? '' })
        return json(201, { ok: true })
      }
      const ph = photos.get(`${m[1]}/${m[2]}`)
      return ph ? route.fulfill({ status: 200, contentType: ph.type, body: ph.body }) : json(404, { error: 'not_found' })
    }
    if ((m = path.match(/^\/api\/surveys\/([^/]+)\/reports\/([^/]+)$/))) {
      const rec = req.postDataJSON() as { photos: { key: string }[] }
      reports.set(`${m[1]}/${m[2]}`, rec)
      return json(201, { ok: true, result: 'stored', missing_photos: rec.photos.map((p) => p.key).filter((k) => !photos.has(`${m![1]}/${k}`)) })
    }
    if ((m = path.match(/^\/api\/surveys\/([^/]+)\/quotes\/(\d+)$/))) {
      quotes.set(`${m[1]}/${m[2]}`, req.postDataJSON())
      return json(201, { ok: true, result: 'created' })
    }
    if ((m = path.match(/^\/api\/surveys\/([^/]+)$/))) {
      const id = decodeURIComponent(m[1]!)
      if (req.method() === 'PUT') {
        const rec = req.postDataJSON() as { photos: { key: string }[] }
        surveys.set(id, rec)
        return json(200, { ok: true, changed: true, missing_photos: rec.photos.map((p) => p.key).filter((k) => !photos.has(`${id}/${k}`)) })
      }
      const rec = surveys.get(id)
      if (!rec) return json(404, { error: 'not_found' })
      const mine = <T,>(map: Map<string, T>) => [...map.entries()].filter(([k]) => k.startsWith(`${id}/`)).map(([, v]) => v)
      return json(200, { survey: rec, quotes: mine(quotes), reports: mine(reports) })
    }
    return json(404, { error: 'not_found' })
  }
  return { surveys, photos, quotes, reports, state, handler }
}

async function configureServer(page: Page, baseUrl: string, key: string) {
  await page.goto('/')
  await page.click('#btnPricing')
  await page.fill('#p_pubBase', baseUrl)
  await page.fill('#p_pubKey', key)
  await page.click('#pSave')
  await expect(page.locator('#p_pubStatus')).toContainText(new URL(baseUrl).host)
  await page.click('#pBack')
}

test('surveys back up to our server, queue while offline, and restore on a new phone', async ({ page, browser }) => {
  const BASE = 'https://app.barak-e.com'
  const KEY = 'field-key-123'
  const server = fakeSurveyServer(KEY)
  await page.route(`${BASE}/api/surveys**`, server.handler)

  // Offline in the field: the survey is kept and queued.
  server.state.down = true
  await configureServer(page, BASE, KEY)
  await createSurvey(page, 'גג בדיקה גיבוי')
  const chip = page.locator('.project-item', { hasText: 'גג בדיקה גיבוי' }).locator('[data-sync-chip]')
  await expect(chip).toHaveText('ממתין לגיבוי')
  await page.click('#btnSync')
  await expect(page.locator('#toast')).toContainText('ממתינים בתור')
  expect(server.surveys.size).toBe(0)

  // Network back → the queue drains on its own.
  server.state.down = false
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(chip).toHaveText('מגובה ✓', { timeout: 10_000 })
  expect(server.surveys.size).toBe(1)
  const rec = [...server.surveys.values()][0] as { project: { projectName: string }; photos: { key: string; sha256: string }[]; hive: { jobs: { kind: string; outbound: { requiresHumanPick: boolean } }[] } }
  expect(rec.project.projectName).toBe('גג בדיקה גיבוי')
  expect(rec.photos).toHaveLength(1)
  expect(rec.photos[0]!.key).toMatch(/^[0-9a-f-]{36}\.[0-9a-f]{12}$/)
  expect(server.photos.size).toBe(1)
  const photo = [...server.photos.values()][0]!
  expect(photo.body.subarray(0, 3).toString('hex')).toMatch(/^ffd8ff|^89504e/) // real image bytes, not a data URL
  expect(rec.hive.jobs.map((j) => j.kind)).toContain('collect')
  expect(rec.hive.jobs.every((j) => j.outbound.requiresHumanPick)).toBe(true)
  expect([...server.state.auth]).toEqual([`Bearer ${KEY}`])

  // Nothing changed → a manual sync sends nothing new.
  await page.click('#btnSync')
  await expect(page.locator('#toast')).toContainText('הכול כבר מגובה')

  // A field report (with a photo) joins the same queue.
  await page.locator('.project-item', { hasText: 'גג בדיקה גיבוי' }).locator('[data-reports]').click()
  await page.click('[data-r-new="defects"]')
  await page.selectOption('[data-f="general|source"]', 'internal')
  await page.fill('[data-t="defects|0|description"]', 'חסר שלט DC בממיר')
  const [pick] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-padd="photos|"]').last().click()])
  await pick.setFiles({ name: 'defect.png', mimeType: 'image/png', buffer: pngFixture() })
  await expect(page.locator('[data-sec="photos"] .thumb')).toHaveCount(1)
  await page.click('#rpBack')
  await expect(chip).toHaveText('ממתין לגיבוי')
  await page.click('#btnSync')
  await expect(page.locator('#toast')).toContainText('1 דוחות')
  await expect(chip).toHaveText('מגובה ✓')
  expect(server.reports.size).toBe(1)
  const sentReport = [...server.reports.values()][0] as { templateKey: string; title_he: string; photos: { key: string; dataUrl?: string }[] }
  expect(sentReport).toMatchObject({ templateKey: 'defects', title_he: 'רשימת ליקויים' })
  expect(sentReport.photos).toHaveLength(1)
  expect(sentReport.photos[0]!.dataUrl).toBeUndefined() // bytes go through the photo route
  expect(server.photos.size).toBe(2)

  // A new phone: empty storage, same server → the survey and its photo come back.
  const fresh = await browser.newContext()
  const phone = await fresh.newPage()
  phone.on('dialog', (d) => void d.accept())
  await phone.route(`${BASE}/api/surveys**`, server.handler)
  await configureServer(phone, BASE, KEY)
  await expect(phone.locator('.project-item')).toHaveCount(0)
  await phone.click('#btnRestoreServer')
  await expect(phone.locator('#toast')).toContainText('שוחזרו 1 סקרים')
  await expect(phone.locator('#toast')).toContainText('1 דוחות')
  const item = phone.locator('.project-item', { hasText: 'גג בדיקה גיבוי' })
  await expect(item).toBeVisible()
  await expect(item.locator('[data-sync-chip]')).toHaveText('מגובה ✓')
  await item.locator('[data-edit]').click()
  await expect(phone.locator('.photo-block[data-field="roof"] .thumb')).toHaveCount(1)
  await expect(phone.locator('#f_address')).toHaveValue('רחוב הרצל 1, תל אביב')
  await phone.click('#btnCancel')
  await phone.locator('.project-item', { hasText: 'גג בדיקה גיבוי' }).locator('[data-reports]').click()
  await phone.locator('#rdList [data-r-open]').click()
  await expect(phone.locator('[data-t="defects|0|description"]')).toHaveValue('חסר שלט DC בממיר')
  await expect(phone.locator('[data-sec="photos"] .thumb')).toHaveCount(1)
  await fresh.close()
})

async function signReport(page: Page, key: string, name: string) {
  await page.click(`[data-sign="${key}"]`)
  await page.fill('#sgName', name)
  const b = (await page.locator('#sgCanvas').boundingBox())!
  await page.mouse.move(b.x + 20, b.y + 40)
  await page.mouse.down()
  await page.mouse.move(b.x + 120, b.y + 80, { steps: 5 })
  await page.mouse.move(b.x + 220, b.y + 30, { steps: 5 })
  await page.mouse.up()
  await page.click('#sgSave')
  await expect(page.locator(`[data-sclear="${key}"]`)).toBeVisible()
}

test('field reports: inspection → lock → defects from the failures → handover warns until fixed', async ({ page }) => {
  await createSurvey(page, 'גג בדיקה דוחות')
  await page.locator('.project-item', { hasText: 'גג בדיקה דוחות' }).locator('[data-reports]').click()
  await expect(page.locator('[data-r-new]')).toHaveCount(5)
  await page.click('[data-r-new="inspection_62446"]')

  // Prefilled from the survey.
  await expect(page.locator('[data-f="system|main_breaker"]')).toHaveValue('63A')
  await page.fill('[data-f="inspector|name"]', 'דני הבודק')
  await page.fill('[data-f="inspector|license"]', '12345')
  await page.fill('[data-f="system|module_voc"]', '50')
  await page.fill('[data-f="system|beta_voc"]', '-0.25')
  await page.selectOption('[data-f="environment|irradiance_method"]', 'pyranometer')
  await page.fill('[data-f="environment|irradiance"]', '820')
  await page.fill('[data-f="environment|module_temp"]', '45')
  await page.fill('[data-f="thresholds|riso_min"]', '1')
  await page.selectOption('[data-t="instruments|0|kind"]', 'megger')
  await page.fill('[data-t="instruments|0|model"]', 'Fluke 1587')
  await page.fill('[data-t="strings|0|label"]', 'S1')
  await page.fill('[data-t="strings|0|modules"]', '10')
  await page.selectOption('[data-t="strings|0|polarity"]', 'yes')
  await page.fill('[data-t="strings|0|voc"]', '10')
  await page.fill('[data-t="strings|0|riso"]', '35')
  // The test survey is SolarEdge: before pairing a string reads ≈1 V per optimizer → 10 V, pass
  await expect(page.locator('[data-tc="strings|0|voc_exp"]')).toHaveText('10')
  await expect(page.locator('[data-tc="strings|0|result"]')).toHaveText('תקין')
  await page.fill('[data-t="strings|0|riso"]', '0.4')
  await expect(page.locator('[data-tc="strings|0|result"]')).toHaveText('נכשל')

  await page.click('[data-ckall="visual"]')
  await page.click('[data-ck="visual|V-LAB-01"][data-res="fail"]')
  await page.fill('[data-ckn="visual|V-LAB-01"]', 'חסר שלט DC בממיר')
  await page.click('[data-ckall="functional"]')

  // Locking needs the inspector's signature.
  await page.click('#rpFinalize')
  await expect(page.locator('#rpMissing')).toContainText('חתימה: הבודק')
  await signReport(page, 'inspector', 'דני הבודק')
  await page.click('#rpFinalize')
  await expect(page.locator('#toast')).toContainText('ננעל')
  await expect(page.locator('#rpOutcome')).toContainText('נכשל')
  await expect(page.locator('[data-f="inspector|name"]')).toBeDisabled()

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#rpPdf')])
  expect(pdf.suggestedFilename()).toMatch(/^bee-inspection-62446-r1-.+\.pdf$/)
  const bytes = await bytesOf(pdf)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')

  // Failures → defects list, linked to the locked inspection.
  await page.click('#rpDefects')
  await expect(page.locator('#toast')).toContainText('2 פריטים')
  await expect(page.locator('[data-t="defects|0|code"]')).toHaveValue('V-LAB-01')
  await expect(page.locator('[data-t="defects|1|code"]')).toHaveValue('STR-S1')
  await expect(page.locator('[data-t="defects|1|severity"]')).toHaveValue('critical')

  // Handover lists the failed inspection and the open defects.
  await page.click('#rpBack')
  await page.locator('.project-item', { hasText: 'גג בדיקה דוחות' }).locator('[data-reports]').click()
  await expect(page.locator('#rdList .quote-card')).toHaveCount(2)
  await expect(page.locator('#rdList')).toContainText('2 פתוחים')
  await page.click('[data-r-new="handover"]')
  await page.click('[data-ckall="commissioning"]')
  await page.click('#rpFinalize')
  await expect(page.locator('#rpMissing')).toBeVisible() // values, photos and signatures still missing

  // Survives a reload (IndexedDB) and a draft can be deleted.
  await page.reload()
  await page.locator('.project-item', { hasText: 'גג בדיקה דוחות' }).locator('[data-reports]').click()
  await expect(page.locator('#rdList .quote-card')).toHaveCount(3)
  await page.locator('#rdList .quote-card', { hasText: 'הפעלה ומסירה' }).locator('[data-r-open]').click()
  await page.click('#rpDelete')
  await page.locator('.project-item', { hasText: 'גג בדיקה דוחות' }).locator('[data-reports]').click()
  await expect(page.locator('#rdList .quote-card')).toHaveCount(2)
})

test('connection check names what is missing on the server', async ({ page }) => {
  const BASE = 'https://app.barak-e.com'
  let healthy = false
  let auth = ''
  await page.route(`${BASE}/api/health`, (route) => {
    auth = route.request().headers()['authorization'] ?? ''
    const checks = healthy
      ? [{ key: 'r2_binding', ok: true, message_he: 'אחסון R2 מחובר (QUOTES)' }, { key: 'key_match', ok: true, message_he: 'המפתח באפליקציה תואם לשרת' }]
      : [{ key: 'r2_binding', ok: false, message_he: 'אין חיבור לאחסון: Settings → Functions → R2 bindings → QUOTES → bee-quotes' }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: healthy, checks }) })
  })
  await page.goto('/')
  await page.click('#btnPricing')
  await page.fill('#p_pubBase', BASE)
  await page.fill('#p_pubKey', 'k-1')
  await page.click('#pPubTest')
  await expect(page.locator('#p_pubCheck .bad')).toContainText('R2 bindings')
  expect(auth).toBe('Bearer k-1')
  healthy = true
  await page.click('#pPubTest')
  await expect(page.locator('#p_pubCheck')).toContainText('השרת מוכן')
  await expect(page.locator('#p_pubCheck .bad')).toHaveCount(0)
  // Not deployed yet → says so instead of failing silently.
  await page.unroute(`${BASE}/api/health`)
  await page.route(`${BASE}/api/health`, (route) => route.abort('namenotresolved'))
  await page.click('#pPubTest')
  await expect(page.locator('#p_pubCheck .bad')).toContainText('אין תשובה')
})
