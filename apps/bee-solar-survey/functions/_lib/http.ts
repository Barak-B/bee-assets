import type { Env } from './env'

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  // Quotes are private documents behind an unguessable link — keep them out of search engines.
  'x-robots-tag': 'noindex, nofollow',
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin) return {}
  const allowed = new Set((env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  try {
    if (origin === new URL(request.url).origin) allowed.add(origin)
  } catch {
    /* ignore */
  }
  if (!allowed.has(origin)) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  }
}

export function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...corsHeaders(request, env) },
  })
}

export function preflight(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...corsHeaders(request, env) } })
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // no-store: the page changes when the customer approves the quote.
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      ...SECURITY_HEADERS,
    },
  })
}

export function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location, 'cache-control': 'no-store', ...SECURITY_HEADERS } })
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

/** null = authorised; otherwise the error response to return. */
export function requireKey(request: Request, env: Env): Response | null {
  if (!env.PUBLISH_KEY) return json(request, env, { error: 'publishing_not_configured', message_he: 'PUBLISH_KEY לא מוגדר בשרת' }, 503)
  const auth = request.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m || !timingSafeEqual(m[1]!.trim(), env.PUBLISH_KEY)) {
    return json(request, env, { error: 'unauthorized', message_he: 'מפתח פרסום שגוי' }, 401)
  }
  return null
}

export function param(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}
