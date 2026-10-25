/**
 * GET /api/health — "is the Cloudflare side set up?" for the one-time
 * activation (docs/QUOTES_ONLINE.md). Without a key it only says which
 * settings exist (never their values). With the right key it also writes,
 * reads and deletes a probe object in R2, so a wrong bucket binding shows up
 * before the first customer link does.
 */
import { isPublicBaseUrl } from '../../../../packages/quote-core/src/public'
import type { Handler } from '../_lib/env'
import { ROLE_LABEL_HE, authenticate } from '../_lib/auth'
import { json, preflight } from '../_lib/http'

interface Check {
  key: string
  ok: boolean
  message_he: string
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

  let who: { name: string; role: string } | null = null
  if (request.headers.get('authorization') && env.PUBLISH_KEY) {
    const auth = await authenticate(request, env)
    checks.push({
      key: 'key_match',
      ok: auth.ok,
      message_he: auth.ok ? `המפתח תקין — ${auth.principal.name} (${ROLE_LABEL_HE[auth.principal.role]})` : 'המפתח באפליקציה לא מוכר בשרת (שגוי או בוטל)',
    })
    if (auth.ok) who = { name: auth.principal.name, role: auth.principal.role }
    if (auth.ok && hasBucket) {
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

  return json(request, env, { ok: checks.every((c) => c.ok), checks, who, server_time: new Date().toISOString() })
}
