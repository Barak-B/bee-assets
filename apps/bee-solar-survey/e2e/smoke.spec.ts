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

test.beforeEach(async ({ page }) => {
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
  await expect(page.locator('#toast')).toContainText('יובאו')

  // Rules
  await page.fill('#p_vat', '18')
  await page.fill('#p_defMargin', '25')
  await page.fill('#p_validity', '30')
  await page.fill('#p_round', '10')
  await page.fill('#p_usd', '3.7')
  await page.fill('#p_eur', '4')
  for (const [roof, v] of [['flat', '300'], ['tile', '350'], ['metal-standing-seam', '280'], ['metal-trapezoidal', '280'], ['ground', '320']]) {
    await page.fill(`#p_l_${roof}`, v)
  }
  await page.click('#pSuggest')
  for (const [i, v] of ['30', '40', '20', '5', '5'].entries()) await page.fill(`#p_pay_${i}`, v)
  await page.click('#pSave')
  await expect(page.locator('#pricingReadiness')).toContainText('מוכן')
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
