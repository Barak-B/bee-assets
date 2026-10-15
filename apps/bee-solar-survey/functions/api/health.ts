/**
 * GET /api/health — "is the Cloudflare side set up?" for the one-time
 * activation (docs/QUOTES_ONLINE.md). Without a key it only says which
 * settings exist (never their values). With the right key it also writes,
 * reads and deletes a probe object in R2, so a wrong bucket binding shows up
 * before the first customer link does.
 */
import { isPublicBaseUrl } from '../../../../packages/quote-core/src/public'
import type { Handler } from '../_lib/env'
import { json, preflight } from '../_lib/http'

interface Check {
  key: string
  ok: boolean
  message_he: string
}

function keyMatches(request: Request, key: string | undefined): boolean | null {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!m) return null
  if (!key) return false
  const a = new TextEncoder().encode(m[1]!.trim())
  const b = new TextEncoder().encode(key)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => {
  const checks: Check[] = []
  const bucket = env.QUOTES as unknown as { get?: unknown; put?: unknown } | undefined
  const hasBucket = !!bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function'
  checks.push({ key: 'r2_binding', ok: hasBucket, message_he: hasBucket ? 'אחסון R2 מחובר (QUOTES)' : 'אין חיבור לאחסון: Settings → Functions → R2 bindings → QUOTES → bee-quotes' })

  const base = env.PUBLIC_BASE_URL ?? ''
  const baseOk = !!base && isPublicBaseUrl(base)
  checks.push({
    key: 'public_base_url',
    ok: baseOk || env.ALLOW_LOCAL_LINKS === '1',
    message_he: baseOk
      ? `קישורים ייבנו מ-${base.replace(/\/+$/, '')}`
      : env.ALLOW_LOCAL_LINKS === '1'
        ? 'מצב פיתוח מקומי (ALLOW_LOCAL_LINKS) — הקישורים אינם ציבוריים'
        : base
          ? `PUBLIC_BASE_URL (${base}) אינה כתובת https ציבורית`
          : 'חסר PUBLIC_BASE_URL — הדומיין של החברה, למשל https://app.barak-e.com',
  })

  const host = new URL(request.url).hostname
  if (env.ALLOW_LOCAL_LINKS === '1' && isPublicBaseUrl(`https://${host}`)) {
    checks.push({ key: 'allow_local_links', ok: false, message_he: 'ALLOW_LOCAL_LINKS מוגדר בפרויקט האמיתי — יש למחוק אותו (רק לפיתוח מקומי)' })
  }

  checks.push({ key: 'publish_key', ok: !!env.PUBLISH_KEY, message_he: env.PUBLISH_KEY ? 'מפתח שרת מוגדר' : 'חסר PUBLISH_KEY (Secret) בהגדרות הפרויקט' })

  const auth = keyMatches(request, env.PUBLISH_KEY)
  if (auth !== null) {
    checks.push({ key: 'key_match', ok: auth, message_he: auth ? 'המפתח באפליקציה תואם לשרת' : 'המפתח באפליקציה לא תואם ל-PUBLISH_KEY בשרת' })
    if (auth && hasBucket) {
      const probe = `health/${crypto.randomUUID()}`
      let ok = false
      try {
        await env.QUOTES.put(probe, 'ok')
        ok = (await (await env.QUOTES.get(probe))?.text()) === 'ok'
        await env.QUOTES.delete(probe)
      } catch {
        ok = false
      }
      checks.push({ key: 'r2_write', ok, message_he: ok ? 'כתיבה וקריאה מהאחסון עובדות' : 'האחסון מחובר אבל כתיבה נכשלה — בדקו את ה-bucket bee-quotes' })
    }
  }

  return json(request, env, { ok: checks.every((c) => c.ok), checks, server_time: new Date().toISOString() })
}
