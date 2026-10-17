/**
 * Publish a saved quote version to the B.E.E Pages project and get the
 * customer link (https://<domain>/q/<token>). The link is checked here too:
 * anything that is not https on a public host is rejected, so a link built
 * from a local server address can never reach a customer.
 */
import { isPublicBaseUrl, publishBlockers, toPublicQuote, type QuoteVersion } from '@bee/quote-core'
import { idLast4 } from './customer'
import type { Publication, PublishSettings } from './db'
import type { SiteSurveyProject } from './types'

export class PublishError extends Error {}

/** The app's own origin when it is served from the real domain; else empty. */
export function defaultBaseUrl(): string {
  if (typeof location === 'undefined') return ''
  return isPublicBaseUrl(location.origin) ? location.origin : ''
}

export function settingsProblem(s: PublishSettings | null): string | null {
  if (!s || !s.baseUrl) return 'לא הוגדרה כתובת אתר לפרסום (מסך מחירון → שרת החברה)'
  if (!isPublicBaseUrl(s.baseUrl)) return `הכתובת ${s.baseUrl} אינה כתובת ציבורית https — הגדירו את דומיין החברה`
  if (!s.key) return 'חסר מפתח פרסום (מסך מחירון → שרת החברה)'
  return null
}

function toBase64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

async function call(settings: PublishSettings, path: string, init: RequestInit): Promise<Response> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${settings.key}` },
    })
  } catch {
    throw new PublishError('אין חיבור לשרת — הפרסום דורש אינטרנט')
  }
  if (!res.ok) {
    let msg = `השרת החזיר ${res.status}`
    try {
      const j = (await res.json()) as { message_he?: string; error?: string }
      msg = j.message_he ?? j.error ?? msg
    } catch {
      /* not json */
    }
    throw new PublishError(res.status === 401 ? 'מפתח הפרסום שגוי' : msg)
  }
  return res
}

export async function publishQuote(quote: QuoteVersion, project: SiteSurveyProject, settings: PublishSettings): Promise<Publication> {
  const problem = settingsProblem(settings)
  if (problem) throw new PublishError(problem)
  const blockers = publishBlockers(quote)
  if (blockers.length) throw new PublishError(blockers.join(' · '))

  const { buildQuotePdf } = await import('./quotePdf')
  const pdf = await buildQuotePdf(quote, project, { audience: 'customer' })
  const res = await call(settings, '/api/quotes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quote: toPublicQuote(quote),
      pdfBase64: toBase64(pdf.bytes),
      // Private, never shown on the customer page: which survey the link belongs to (office
      // screen) and the last 4 ID digits the customer's online approval is checked against.
      survey_id: project.id,
      ...(idLast4(project.customerIdNumber) ? { customer_id_last4: idLast4(project.customerIdNumber) } : {}),
    }),
  })
  const data = (await res.json()) as { token: string; url: string; published_at: string }
  let origin = ''
  try {
    origin = new URL(data.url).origin
  } catch {
    /* handled below */
  }
  if (!isPublicBaseUrl(origin)) {
    // Never hand a customer a link to a local machine — fail loudly instead.
    throw new PublishError(`השרת החזיר קישור לא ציבורי (${data.url}). יש להגדיר PUBLIC_BASE_URL בשרת לדומיין החברה.`)
  }
  return { token: data.token, url: data.url, publishedAt: data.published_at }
}

export async function revokeQuote(token: string, settings: PublishSettings): Promise<void> {
  await call(settings, `/api/quotes/${encodeURIComponent(token)}`, { method: 'DELETE' })
}

export interface QuoteStatus {
  views: number
  last_viewed_at: string | null
  /** The customer approved this version on the quote page. */
  accepted?: { name: string; accepted_at: string; version_no: number; reference: string } | null
}

export async function quoteViews(token: string, settings: PublishSettings): Promise<QuoteStatus | null> {
  try {
    const res = await call(settings, `/api/quotes/${encodeURIComponent(token)}`, { method: 'GET' })
    return (await res.json()) as QuoteStatus
  } catch {
    return null
  }
}

export interface HealthCheck {
  key: string
  ok: boolean
  message_he: string
}

/**
 * Activation check against /api/health. A network error usually means the
 * domain is not deployed yet, or (when the app runs on another origin) CORS —
 * both are named so Barak knows which step to fix.
 */
export async function checkServer(settings: { baseUrl: string; key: string }): Promise<{ ok: boolean; checks: HealthCheck[] }> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  if (!isPublicBaseUrl(base)) return { ok: false, checks: [{ key: 'base', ok: false, message_he: 'כתובת האתר אינה https ציבורית' }] }
  let res: Response
  try {
    res = await fetch(`${base}/api/health`, { headers: settings.key ? { authorization: `Bearer ${settings.key}` } : {} })
  } catch {
    const cross = typeof location !== 'undefined' && location.origin !== new URL(base).origin
    return {
      ok: false,
      checks: [
        {
          key: 'reach',
          ok: false,
          message_he: cross
            ? `אין תשובה מ-${base}. אם הפרויקט כבר פרוס: הוסיפו את ${location.origin} ל-ALLOWED_ORIGINS בשרת`
            : `אין תשובה מ-${base} — הדומיין עוד לא מחובר לפרויקט Pages`,
        },
      ],
    }
  }
  if (!res.ok) return { ok: false, checks: [{ key: 'reach', ok: false, message_he: `השרת החזיר ${res.status} — ייתכן שה-Functions לא נפרסו` }] }
  try {
    return (await res.json()) as { ok: boolean; checks: HealthCheck[] }
  } catch {
    return { ok: false, checks: [{ key: 'reach', ok: false, message_he: 'התשובה אינה מהשרת של האפליקציה (אולי הדומיין מצביע לאתר אחר)' }] }
  }
}
