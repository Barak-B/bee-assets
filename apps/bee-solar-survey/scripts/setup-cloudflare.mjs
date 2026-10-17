#!/usr/bin/env node
/**
 * One-command activation on Cloudflare (docs/QUOTES_ONLINE.md, "הפעלה").
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run setup:cloudflare -- --domain app.barak-e.com
 *
 * Idempotent: every step checks first and only creates what is missing.
 *   1. the token works;
 *   2. R2 bucket bee-quotes;
 *   3. Pages project bee-solar-survey;
 *   4. PUBLISH_KEY secret — generated here and printed ONCE, only when the
 *      project has none (or with --rotate-key);
 *   5. build + deploy (bindings and PUBLIC_BASE_URL come from wrangler.toml);
 *   6. custom domain (with --domain), through the Cloudflare API;
 *   7. GET /api/health with the key, and the result of every check.
 *
 * --dry-run prints the plan and runs nothing that changes Cloudflare.
 * Token permissions: Account → Cloudflare Pages: Edit, Workers R2 Storage: Edit.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT = 'bee-solar-survey'
const BUCKET = 'bee-quotes'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = flag('dry-run')
const rotate = flag('rotate-key')
const skipBuild = flag('skip-build')
const domain = value('domain')
const WIN = process.platform === 'win32'
// The project's own wrangler, run through node itself — the same on Windows,
// macOS and Linux (no .cmd shims, no shell). Tests point WRANGLER_BIN at a stub.
const WRANGLER_JS = join(APP, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const WRANGLER = process.env.WRANGLER_BIN || process.execPath

const out = (s = '') => process.stdout.write(`${s}\n`)
/** "created" — or, in a dry run, "would be created". */
const made = (he) => (dryRun ? `ייווצר (dry-run)` : he)
const step = (n, s) => out(`\n[${n}/7] ${s}`)
const fail = (msg) => {
  out(`\n✗ ${msg}`)
  process.exit(1)
}

function run(cmd, cmdArgs, { input, mutates = false, quiet = false, shell = false } = {}) {
  if (dryRun && mutates) {
    out(`  (dry-run) ${cmd} ${cmdArgs.join(' ')}`)
    return { ok: true, stdout: '' }
  }
  const r = spawnSync(cmd, cmdArgs, { cwd: APP, input, encoding: 'utf8', env: process.env, shell })
  const stdout = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (!quiet && r.status !== 0) out(stdout.trim().split('\n').slice(-8).join('\n'))
  return { ok: r.status === 0, stdout }
}
/** `wrangler <args>`; the dry-run line shows the wrangler arguments only. */
function wrangler(a, o = {}) {
  if (dryRun && o.mutates) return run('wrangler', a, o)
  return process.env.WRANGLER_BIN ? run(WRANGLER, a, o) : run(WRANGLER, [WRANGLER_JS, ...a], o)
}

if (!process.env.WRANGLER_BIN && !existsSync(WRANGLER_JS)) fail(`חסרות תלויות. הריצו קודם בתיקייה ${APP}:  npm install`)
if (!process.env.CLOUDFLARE_API_TOKEN) fail('חסר CLOUDFLARE_API_TOKEN (Account → Cloudflare Pages: Edit, Workers R2 Storage: Edit)')
if (!process.env.CLOUDFLARE_ACCOUNT_ID) fail('חסר CLOUDFLARE_ACCOUNT_ID (מופיע בדשבורד של Cloudflare, בצד ימין של דף החשבון)')
if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) fail(`--domain לא תקין: ${domain}`)

const toml = readFileSync(join(APP, 'wrangler.toml'), 'utf8')
const baseUrl = /PUBLIC_BASE_URL\s*=\s*"([^"]+)"/.exec(toml)?.[1] ?? ''
if (domain && baseUrl && new URL(baseUrl).host !== domain) {
  fail(`wrangler.toml קובע PUBLIC_BASE_URL = ${baseUrl}, אבל --domain הוא ${domain}. ישרו ביניהם — כל קישור ללקוח נבנה מ-PUBLIC_BASE_URL.`)
}

out(`הפעלה של ${PROJECT} ב-Cloudflare${dryRun ? ' (dry-run — שום דבר לא משתנה)' : ''}`)

step(1, 'בדיקת הטוקן')
const who = wrangler(['whoami'], { quiet: true })
if (!who.ok) fail('הטוקן לא עובד. בדקו את CLOUDFLARE_API_TOKEN ואת ההרשאות שלו.')
out('  ✓ הטוקן תקין')

step(2, `אחסון R2: ${BUCKET}`)
const buckets = wrangler(['r2', 'bucket', 'list'], { quiet: true })
if (!buckets.ok) fail('לא ניתן לקרוא את רשימת ה-buckets. לטוקן חסרה הרשאת Workers R2 Storage: Edit, או ש-R2 לא הופעל בחשבון (Dashboard → R2 → Enable).')
if (new RegExp(`\\b${BUCKET}\\b`).test(buckets.stdout)) out('  ✓ קיים')
else {
  if (!wrangler(['r2', 'bucket', 'create', BUCKET], { mutates: true }).ok) fail('יצירת ה-bucket נכשלה')
  out(`  ✓ ${made('נוצר')}`)
}

step(3, `פרויקט Pages: ${PROJECT}`)
const projects = wrangler(['pages', 'project', 'list'], { quiet: true })
if (!projects.ok) fail('לא ניתן לקרוא את רשימת פרויקטי Pages. לטוקן חסרה הרשאת Cloudflare Pages: Edit.')
let created = false
if (new RegExp(`\\b${PROJECT}\\b`).test(projects.stdout)) out('  ✓ קיים')
else {
  if (!wrangler(['pages', 'project', 'create', PROJECT, '--production-branch', 'main'], { mutates: true }).ok) fail('יצירת הפרויקט נכשלה')
  created = true
  out(`  ✓ ${made('נוצר')}`)
}

step(4, 'מפתח ראשי (PUBLISH_KEY)')
let key = null
const secrets = created ? { ok: true, stdout: '' } : wrangler(['pages', 'secret', 'list', '--project-name', PROJECT], { quiet: true })
const hasKey = secrets.ok && /PUBLISH_KEY/.test(secrets.stdout)
if (hasKey && !rotate) out('  ✓ כבר מוגדר (להחלפה: --rotate-key)')
else {
  const fresh = randomBytes(32).toString('base64url')
  // No trailing newline: the secret is exactly the key.
  if (!wrangler(['pages', 'secret', 'put', 'PUBLISH_KEY', '--project-name', PROJECT], { input: fresh, mutates: true }).ok) fail('הגדרת המפתח נכשלה')
  if (!dryRun) key = fresh
  out(`  ✓ ${made(hasKey ? 'הוחלף' : 'נוצר')}`)
}

step(5, 'בנייה ופריסה')
if (!skipBuild) {
  const b = run('npm', ['run', 'build'], { quiet: true, shell: WIN })
  if (!b.ok) fail(`הבנייה נכשלה:\n${b.stdout.trim().split('\n').slice(-15).join('\n')}`)
  out('  ✓ נבנה')
}
const dep = wrangler(['pages', 'deploy', 'dist', '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'], { mutates: true })
if (!dep.ok) fail('הפריסה נכשלה')
// The deploy prints a per-deployment URL; production is always served at <project>.pages.dev too.
const deployedUrl = `https://${PROJECT}.pages.dev`
const preview = /https:\/\/[a-z0-9.-]+\.pages\.dev/i.exec(dep.stdout)?.[0]
out(`  ✓ ${made('נפרס')}: ${deployedUrl}${preview && preview !== deployedUrl ? ` (הפריסה הזו: ${preview})` : ''}`)

step(6, domain ? `דומיין: ${domain}` : 'דומיין (דילוג — אין --domain)')
if (domain) {
  if (dryRun) out(`  (dry-run) POST /accounts/…/pages/projects/${PROJECT}/domains {"name":"${domain}"}`)
  else {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT}/domains`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    const already = (body.errors ?? []).some((e) => /already/i.test(String(e.message)))
    if (res?.ok || already) out(`  ✓ ${already ? 'כבר מחובר' : 'חובר'}. אם ${domain.split('.').slice(-2).join('.')} מנוהל ב-Cloudflare, ה-DNS נוצר לבד; אחרת הוסיפו CNAME ל-${PROJECT}.pages.dev.`)
    else out(`  ✗ חיבור הדומיין נכשל (${(body.errors ?? []).map((e) => e.message).join('; ') || res?.status || 'אין חיבור'}). אפשר לחבר ידנית: Pages → ${PROJECT} → Custom domains.`)
  }
}

step(7, 'בדיקת חיבור')
const target = domain ? `https://${domain}` : deployedUrl
if (dryRun) out(`  (dry-run) GET ${target}/api/health`)
else {
  const res = await fetch(`${target}/api/health`, { headers: key ? { authorization: `Bearer ${key}` } : {} }).catch(() => null)
  if (!res) out(`  ✗ ${target} לא עונה עדיין (DNS ותעודה יכולים לקחת כמה דקות). נסו שוב: ${target}/api/health`)
  else {
    const h = await res.json().catch(() => ({ checks: [] }))
    for (const c of h.checks ?? []) out(`  ${c.ok ? '✓' : '✗'} ${c.message_he}`)
  }
}

out('')
if (key) {
  out('════════════════════════════════════════════════════════════')
  out('  המפתח הראשי — מוצג פעם אחת בלבד. שמרו אותו במקום בטוח:')
  out(`  ${key}`)
  out('  השתמשו בו רק כדי להיכנס ל-/office וליצור מפתח לכל סוקר.')
  out('════════════════════════════════════════════════════════════')
}
out(`\n${dryRun ? 'dry-run הסתיים.' : 'סיום.'} הצעד הבא: ${target}/office → "מפתחות" → מפתח לכל סוקר.`)
