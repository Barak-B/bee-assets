#!/usr/bin/env node
/**
 * A day of real work against a real server: the Pages Functions in workerd
 * with a local R2, three browsers, screenshots of every step.
 *
 *   npm run build && node scripts/walkthrough.mjs [outDir]
 *
 *   office (desktop)  opens a job for a phone call and assigns Dani
 *   Dani (phone)      sets up the price book and server, syncs, gets the job,
 *                     surveys it, builds a quote, publishes it, opens WhatsApp
 *   customer (phone)  opens the link, mistypes the ID digits, approves
 *   Dani              sees the approval
 *   office            marks contract, deposit, IEC, design, equipment
 *   Dani              syncs, sees "בהתקנה", opens a daily report
 *   office            sees the job with its report
 *   customer          opens the link again: where the project stands
 *
 * The app only talks to https://app.barak-e.com (it refuses local addresses
 * on purpose), so every browser maps that origin onto the local server.
 * Nothing leaves the machine; WhatsApp is intercepted.
 *
 * Writes <outDir>/NN-*.png and <outDir>/findings.json (page errors, console
 * errors, unexpected HTTP errors, step failures). Exit code 1 if any step failed.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { chromium, devices } from '@playwright/test'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] || join(APP, 'walkthrough-out')
const PORT = 8799
const LOCAL = `http://127.0.0.1:${PORT}`
const PUBLIC = 'https://app.barak-e.com'
const MASTER = `walk-${randomBytes(12).toString('hex')}`

mkdirSync(OUT, { recursive: true })
// A run's screenshots only: numbers shift when steps change.
for (const f of readdirSync(OUT)) if (/^\d{2}-.*\.png$/.test(f)) rmSync(join(OUT, f))
const findings = { steps: [], pageErrors: [], consoleErrors: [], httpErrors: [] }
let shot = 0

// ── helpers ────────────────────────────────────────────────────────────

function png(w = 96, h = 64, tint = 0) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = (x * 3 + tint) & 255
      raw[o + 1] = (y * 4) & 255
      raw[o + 2] = 140
    }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b) => {
    let c = 0xffffffff
    for (const byte of b) c = table[(c ^ byte) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function api(method, path, key, body) {
  const res = await fetch(LOCAL + path, { method, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`)
  return JSON.parse(text)
}

async function snap(page, name, fullPage = false) {
  shot++
  const file = join(OUT, `${String(shot).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage })
  return file
}

async function step(name, fn) {
  const t = Date.now()
  try {
    await fn()
    findings.steps.push({ name, ok: true, ms: Date.now() - t })
    process.stdout.write(`  ✓ ${name}\n`)
  } catch (err) {
    findings.steps.push({ name, ok: false, error: String(err?.message ?? err).split('\n').slice(0, 6).join(' | ') })
    process.stdout.write(`  ✗ ${name}: ${String(err?.message ?? err).split('\n')[0]}\n`)
    throw err
  }
}

/** A browser context that sees https://app.barak-e.com as the local server, and records errors. */
async function context(browser, who, opts) {
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true, ...opts })
  await ctx.route(`${PUBLIC}/**`, (route) => mapToLocal(route).catch((e) => {
    findings.routeErrors = [...(findings.routeErrors ?? []), { who, url: route.request().url(), method: route.request().method(), error: String(e?.message ?? e).slice(0, 300) }]
    return route.abort()
  }))
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>WhatsApp (intercepted)</p>' }))
  ctx.on('page', (page) => watch(page, who))
  return ctx
}

async function mapToLocal(route) {
  {
    const url = route.request().url().replace(PUBLIC, LOCAL)
    // Redirects are followed here (Playwright cannot hand a redirect after a POST back to the
    // page), so after a redirect the address bar keeps the old URL; steps check content, not URL.
    const res = await route.fetch({ url })
    await route.fulfill({ response: res })
  }
}

function watch(page, who) {
  page.on('pageerror', (e) => findings.pageErrors.push({ who, url: page.url(), error: e.message }))
  page.on('console', (m) => {
    if (m.type() === 'error') findings.consoleErrors.push({ who, url: page.url(), text: m.text().slice(0, 300) })
  })
  page.on('response', (r) => {
    const u = r.url()
    // Expected refusals are asserted in the steps; anything else ≥ 400 is a finding.
    if (r.status() >= 400 && !u.includes('/accept') && !u.includes('/api/me')) findings.httpErrors.push({ who, status: r.status(), url: u.replace(LOCAL, PUBLIC) })
  })
}

async function waitText(page, selector, text, timeout = 15000) {
  await page.locator(selector).filter({ hasText: text }).first().waitFor({ timeout })
}

// ── server ─────────────────────────────────────────────────────────────

const persist = mkdtempSync(join(tmpdir(), 'bee-walk-'))
const server = spawn(
  process.execPath,
  [join(APP, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'pages', 'dev', 'dist', '--port', String(PORT), '--persist-to', persist,
    '--binding', `PUBLISH_KEY=${MASTER}`, '--binding', `PUBLIC_BASE_URL=${PUBLIC}`],
  { cwd: APP, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
)
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += d))
server.stderr.on('data', (d) => (serverLog += d))

async function waitServer() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${LOCAL}/api/health`)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`server did not start:\n${serverLog.slice(-2000)}`)
}

// ── the day ────────────────────────────────────────────────────────────

let failed = false
const browser = await chromium.launch()
try {
  await waitServer()
  console.log('server up; walking through')
  const dani = await api('POST', '/api/office/keys', MASTER, { name: 'דני', role: 'surveyor' })
  const ronit = await api('POST', '/api/office/keys', MASTER, { name: 'רונית', role: 'office' })

  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(Date.now() + 86_400_000))
  const officeCtx = await context(browser, 'office', { viewport: { width: 1366, height: 860 } })
  const office = await officeCtx.newPage()
  const phoneCtx = await context(browser, 'surveyor', { ...devices['Pixel 7'] })
  const phone = await phoneCtx.newPage()
  phone.on('dialog', (d) => void d.accept())
  const customerCtx = await context(browser, 'customer', { ...devices['iPhone 13'] })
  const customer = await customerCtx.newPage()
  let link = ''

  await step('office: log in and open a job for a phone call, assigned to Dani', async () => {
    await office.goto(`${PUBLIC}/office`)
    await office.fill('#oKey', ronit.key)
    await office.click('#oLogin button')
    await office.waitForSelector('#oNewJob')
    await snap(office, 'office-empty')
    await office.click('#oNewJob')
    await office.fill('#oJobForm [name="customerName"]', 'משה אברהם')
    await office.fill('#oJobForm [name="customerPhone"]', '054-111-2233')
    await office.fill('#oJobForm [name="customerEmail"]', 'moshe@example.com')
    await office.fill('#oJobForm [name="address"]', 'הזית 7, גדרה')
    await office.fill('#oJobForm [name="note"]', 'גג בטון, הלקוח זמין אחרי 16:00')
    await office.selectOption('#oNewAssign', { label: 'דני' })
    await office.fill('#oJobForm [name="planned_date"]', tomorrow)
    await snap(office, 'office-new-job-form')
    await office.click('#oJobForm button[type="submit"]')
    await waitText(office, 'tr[data-job]', 'משה אברהם')
    await snap(office, 'office-job-opened')
  })

  await step('Dani: price book, server and key on the phone', async () => {
    await phone.goto(PUBLIC + '/')
    await phone.click('#btnPricing')
    const [tpl] = await Promise.all([phone.waitForEvent('download'), phone.click('#pTemplate')])
    const csv = (await import('node:fs')).readFileSync(await tpl.path(), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
    const header = csv[0].split(',')
    const fromRight = header.length - header.indexOf('unit_cost')
    const filled = [csv[0], ...csv.slice(1).map((l, i) => {
      const cells = l.split(',')
      cells[cells.length - fromRight] = String(60 + i * 15)
      return cells.join(',')
    })].join('\r\n')
    const [chooser] = await Promise.all([phone.waitForEvent('filechooser'), phone.click('#pImport')])
    await chooser.setFiles({ name: 'supplier.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + filled, 'utf8') })
    await phone.click('#piApprove')
    await waitText(phone, '#toast', 'יובאו')
    for (const [id, v] of [['#p_vat', '18'], ['#p_defMargin', '25'], ['#p_validity', '30'], ['#p_round', '10'], ['#p_usd', '3.7'], ['#p_eur', '4']]) await phone.fill(id, v)
    for (const roof of ['flat', 'tile', 'metal-standing-seam', 'metal-trapezoidal', 'ground', 'other']) await phone.fill(`#p_l_${roof}`, '300')
    await phone.click('#pSuggest')
    for (const [i, v] of ['30', '40', '20', '5', '5'].entries()) await phone.fill(`#p_pay_${i}`, v)
    await phone.selectOption('#p_roi_track', 'net_metering')
    await phone.fill('#p_roi_consumption_tariff_ils_kwh', '0.6')
    await phone.click('#pSuggestRoi')
    await phone.fill('#p_t_warranty', 'פאנלים — 25 שנות ביצועים\nממיר — 12 שנים\nעבודה והתקנה — 5 שנים')
    await phone.fill('#p_t_excluded', 'חיזוק גג\nהעתקת לוח חשמל')
    await phone.fill('#p_pubBase', PUBLIC)
    await phone.fill('#p_pubKey', dani.key)
    await phone.click('#pSave')
    await phone.click('#pPubTest')
    await waitText(phone, '#p_pubCheck', 'דני')
    await snap(phone, 'phone-connection-check', true)
    await phone.click('#pBack')
  })

  await step('Dani: sync brings the assigned job, prefilled', async () => {
    await phone.click('#btnSync')
    await waitText(phone, '.project-item', 'משה אברהם')
    await snap(phone, 'phone-list-with-assigned-job')
    await phone.locator('.project-item', { hasText: 'משה אברהם' }).locator('[data-edit]').click()
    await phone.waitForSelector('#f_customerName')
    const name = await phone.inputValue('#f_customerName')
    if (name !== 'משה אברהם') throw new Error(`customer not prefilled: "${name}"`)
    await snap(phone, 'phone-form-prefilled')
  })

  await step('Dani: survey the roof (fields, ID, two photos) and save', async () => {
    await phone.fill('#f_customerId', '123456782')
    await phone.fill('#f_gps', '31.81, 34.77')
    await phone.fill('#f_surveyor', 'דני')
    await phone.selectOption('#f_roofType', 'בטון')
    await phone.selectOption('#f_mainBreaker', '63A')
    await phone.selectOption('#f_phases', '3')
    await phone.fill('#f_usableArea', '110')
    await phone.fill('#f_targetKwp', '15')
    await phone.fill('#f_consumption', '9000')
    await phone.fill('#f_cableLength', '30')
    await phone.selectOption('#f_inverterBrand', 'SolarEdge')
    for (const [field, tint] of [['roof', 0], ['electricalPanel', 90]]) {
      const btn = phone.locator(`.photo-block[data-field="${field}"] [data-action="gallery"]`)
      if (!(await btn.count())) continue
      const [chooser] = await Promise.all([phone.waitForEvent('filechooser'), btn.click()])
      await chooser.setFiles({ name: `${field}.png`, mimeType: 'image/png', buffer: png(96, 64, tint) })
      await phone.locator(`.photo-block[data-field="${field}"] .thumb`).first().waitFor()
    }
    await snap(phone, 'phone-form-filled', true)
    await phone.click('#btnSave')
    await waitText(phone, '.project-item', 'משה אברהם')
    await snap(phone, 'phone-list-after-survey')
  })

  await step('Dani: quote v1, publish the customer link, WhatsApp it', async () => {
    await phone.locator('.project-item', { hasText: 'משה אברהם' }).locator('[data-quote]').click()
    await phone.click('#qdNew')
    const card = phone.locator('.quote-card[data-ver="1"]')
    await card.waitFor()
    await snap(phone, 'phone-quote-v1')
    await card.locator('[data-q-publish]').click()
    await card.locator('.pub-url').waitFor({ timeout: 30000 })
    link = await card.locator('.pub-url').inputValue()
    if (!link.startsWith(`${PUBLIC}/q/`)) throw new Error(`unexpected link ${link}`)
    await snap(phone, 'phone-quote-published')
    const [wa] = await Promise.all([phone.waitForEvent('popup'), card.locator('[data-q-wa]').click()])
    await wa.waitForLoadState()
    const text = new URL(wa.url()).searchParams.get('text') ?? ''
    if (!text.includes(link)) throw new Error('WhatsApp text has no link')
    findings.whatsappText = text
    await wa.close()
    await phone.click('#qdClose')
  })

  await step('customer: opens the link on an iPhone, reads, gets the ID wrong, approves', async () => {
    await customer.goto(link)
    await customer.waitForSelector('form[action*="/accept"]')
    await snap(customer, 'customer-quote-top')
    await snap(customer, 'customer-quote-full', true)
    // The request API bypasses the origin mapping, so ask the local server directly.
    const pdf = await fetch(`${link}/pdf`.replace(PUBLIC, LOCAL))
    findings.customerPdf = { status: pdf.status, type: pdf.headers.get('content-type'), bytes: (await pdf.arrayBuffer()).byteLength }
    await customer.fill('input[name="name"]', 'משה אברהם')
    await customer.fill('input[name="id4"]', '1111')
    await customer.check('input[name="agree"]')
    await customer.click('form[action*="/accept"] button[type="submit"]')
    await waitText(customer, 'body', 'אינן תואמות')
    await snap(customer, 'customer-wrong-id')
    await customer.fill('input[name="name"]', 'משה אברהם')
    await customer.fill('input[name="id4"]', '6782')
    await customer.check('input[name="agree"]')
    await customer.click('form[action*="/accept"] button[type="submit"]')
    await waitText(customer, '#accept', 'ההצעה אושרה').catch(async () => {
      throw new Error(`no approval: alert=${(await customer.locator('[role=alert]').allTextContents()).join(' / ')}`)
    })
    await snap(customer, 'customer-approved', true)
  })

  await step('Dani: sees the approval', async () => {
    await phone.locator('.project-item', { hasText: 'משה אברהם' }).locator('[data-quote]').click()
    await waitText(phone, '[data-accepted="1"]', 'הלקוח אישר')
    await snap(phone, 'phone-quote-accepted')
    await phone.click('#qdClose')
    await waitText(phone, '[data-stage-chip]', 'הלקוח אישר')
  })

  // The office drives the job after the approval (S04–S07): contract, deposit, IEC, design, equipment.
  const tick = async (key, ref) => {
    const row = office.locator(`[data-ms="${key}"]`)
    if (!(await row.isVisible())) await row.locator('xpath=ancestor::details').locator('summary').click()
    await row.locator('[data-ms-on]').check()
    if (ref) await row.locator('[data-ms-ref]').fill(ref)
  }
  const saveMs = async () => {
    await office.click('#oSaveMs')
    await waitText(office, '#toast', 'נשמר')
  }
  await step('office: contract and deposit, then the IEC and the design', async () => {
    await office.click('#oRefresh')
    await waitText(office, 'tr[data-job]', 'הלקוח אישר')
    await office.locator('tr[data-job]', { hasText: 'משה אברהם' }).click()
    await waitText(office, '.o-life li.now', 'הלקוח אישר')
    await snap(office, 'office-drawer-accepted')
    await tick('contract_signed')
    await tick('deposit_paid', 'R-118')
    await saveMs()
    await waitText(office, '.o-life li.now', 'חח״י ותכנון')
    // The IEC submission from the submission file: the track is suggested, the step marks the milestone.
    const sub = office.locator('#oSub')
    await sub.locator('[data-s-step]').first().waitFor()
    findings.submissionTrack = await sub.locator('[data-s-track]').inputValue()
    const stepRow = (id) => sub.locator(`[data-s-step="${id}"]`)
    await stepRow('pre.01.collect_inputs').locator('[data-s-on]').check()
    await sub.locator('[data-s-doc="electric_bill_last"] [data-s-on]').check()
    await stepRow('pre.03.fill_form_22_8_22').locator('[data-s-on]').check()
    await sub.locator('[data-s-doc="iec_form_22_8_22"] [data-s-on]').check()
    await stepRow('pre.05.submit_portal').locator('[data-s-on]').check()
    await stepRow('pre.05.submit_portal').locator('[data-s-ref]').fill('7004512')
    await sub.locator('[data-s-phase="fire"] summary').click()
    await sub.locator('[data-s-na="fire"]').check()
    await office.click('#oSaveSub')
    await waitText(office, '#toast', 'גם אבן הדרך סומנה')
    await waitText(office, 'tr[data-job]', 'לקבל תשובה מחח״י')
    await office.locator('#oSub .o-sub-progress').waitFor()
    findings.submissionProgress = await office.locator('#oSub .o-sub-progress').innerText()
    await office.locator('#oSub').scrollIntoViewIfNeeded()
    await snap(office, 'office-submission-file')
    await snap(office, 'office-drawer-permits')
    // The update that goes with it: the composer offers it, filled with the request number.
    const msg = office.locator('#oMsg')
    await office.waitForFunction(() => document.querySelector('#oMsg [data-c-body]')?.value.includes('7004512'), null, { timeout: 15000 }).catch(async () => {
      const state = await office.evaluate(() => ({ tpl: document.querySelector('#oMsg [data-c-tpl]')?.value, body: document.querySelector('#oMsg [data-c-body]')?.value, html: document.querySelector('#oMsg')?.innerHTML.slice(0, 300) }))
      throw new Error(`composer: ${JSON.stringify(state)}`)
    })
    if ((await msg.locator('[data-c-tpl]').inputValue()) !== 'iec_submitted') throw new Error('composer did not offer the IEC update')
    await msg.locator('[data-c-ph="expected_bd"]').fill('כ-30')
    if (await msg.locator('[data-c-ph="contact_phone"]').count()) await msg.locator('[data-c-ph="contact_phone"]').fill('08-1234567')
    await msg.scrollIntoViewIfNeeded()
    await snap(office, 'office-message-iec')
    const [wa] = await Promise.all([office.context().waitForEvent('page'), msg.locator('[data-c-send="whatsapp"]').click()])
    await wa.waitForLoadState()
    findings.officeMessage = new URL(wa.url()).searchParams.get('text')
    await wa.close()
    await waitText(office, '#oMsg [data-c-log]', 'הבקשה הוגשה לחח״י')
    await tick('iec_approved')
    await tick('design_approved')
    await tick('equipment_ordered', 'PO-2231')
    await tick('equipment_delivered')
    await saveMs()
    await waitText(office, '.o-life li.now', 'בהתקנה')
    await snap(office, 'office-drawer-ready-to-install', true)
  })

  await step('Dani: syncs, sees it is ready to install, opens a daily report', async () => {
    await phone.click('#btnSync')
    await waitText(phone, '[data-stage-chip]', 'בהתקנה')
    await snap(phone, 'phone-list-ready-to-install')
    await phone.locator('.project-item', { hasText: 'משה אברהם' }).locator('[data-reports]').click()
    await phone.click('[data-r-new="daily_report"]')
    await phone.waitForSelector('#rpBack')
    await snap(phone, 'phone-daily-report', true)
    await phone.click('#rpBack')
    await phone.click('#btnSync')
    await phone.waitForTimeout(1500)
    await snap(phone, 'phone-list-end')
  })

  await step('office: the job with its report; nothing skipped', async () => {
    await office.click('#oRefresh')
    await waitText(office, 'tr[data-job]', 'בהתקנה')
    await snap(office, 'office-list-end')
    await office.locator('tr[data-job]', { hasText: 'משה אברהם' }).click()
    await waitText(office, '#oSurvey', 'סוג גג')
    if (await office.locator('.o-drawer .note-warn', { hasText: 'בלי לסמן' }).count()) throw new Error('milestones reported as skipped')
    // The whole story in the timeline, newest first.
    await office.locator('#oTimeline .o-tl-item').first().waitFor()
    if (await office.locator('#oTlAll').count()) await office.click('#oTlAll')
    findings.timeline = await office.locator('#oTimeline .o-tl-item').allInnerTexts()
    const must = ['תיק הגשה — ✓ הגשה ב-digitalorders', 'מסמך התקבל: חשבון חשמל אחרון', 'העבודה נפתחה במשרד', 'שובץ לסוקר: דני', 'הסקר הגיע לשרת', 'הצעת מחיר גרסה 1', 'קישור ללקוח פורסם', 'הלקוח פתח את ההצעה', 'משה אברהם אישר/ה', 'הסכם נחתם', 'מספר פנייה 7004512', 'הודעה ללקוח נפתחה בוואטסאפ', 'דוח יומי']
    const missing = must.filter((m) => !findings.timeline.some((t) => t.includes(m)))
    if (missing.length) throw new Error(`timeline is missing: ${missing.join(' | ')}`)
    await office.locator('#oTimeline').scrollIntoViewIfNeeded()
    await snap(office, 'office-timeline')
    await office.waitForTimeout(800)
    await snap(office, 'office-drawer-end')
    findings.officeJob = (await api('GET', '/api/office/overview', ronit.key)).jobs[0]
  })

  await step('customer: opens the same link a few days later and sees where the project stands', async () => {
    await customer.goto(link)
    await waitText(customer, '#progress', 'איפה הפרויקט עומד')
    findings.customerProgress = await customer.locator('#progress').innerText()
    if (!/בהתקנה|התקנה/.test(await customer.locator('#progress li.now').innerText())) throw new Error('customer page not at installation')
    for (const secret of ['7004512', 'R-118', 'PO-2231', 'רונית']) if ((await customer.content()).includes(secret)) throw new Error(`internal detail on the customer page: ${secret}`)
    await customer.locator('#progress').scrollIntoViewIfNeeded()
    await snap(customer, 'customer-progress')
  })
} catch {
  failed = true
} finally {
  await browser.close()
  server.kill()
  rmSync(persist, { recursive: true, force: true })
  writeFileSync(join(OUT, 'findings.json'), JSON.stringify(findings, null, 2))
  const n = findings.pageErrors.length + findings.consoleErrors.length + findings.httpErrors.length
  console.log(`\n${findings.steps.filter((s) => s.ok).length}/${findings.steps.length} steps ok · ${n} errors recorded · ${shot} screenshots → ${OUT}`)
  process.exit(failed ? 1 : 0)
}
