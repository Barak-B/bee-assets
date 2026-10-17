/**
 * POST /q/<token>/accept — the customer approves this version from the quote
 * page (plain HTML form, no script). Spec 12 §7.1 stage A without OTP: name,
 * last 4 ID digits and an explicit checkbox, stored with time, IP, user agent,
 * the version reference and the PDF fingerprint. One approval per link; an
 * expired or revoked quote cannot be approved. Nothing is sent anywhere (Law #2).
 */
import { QUOTE_TOKEN_RE } from '../../../../../packages/quote-core/src/public'
import type { Handler } from '../../_lib/env'
import { html, israelToday, param, redirect } from '../../_lib/http'
import { renderMessagePage, renderQuotePage } from '../../_lib/render'
import { MAX_ACCEPT_FAILS, addAcceptFail, getAcceptFails, getAcceptance, getPdf, getQuote, putAcceptance } from '../../_lib/store'

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const onRequestPost: Handler = async ({ request, env, params }) => {
  const token = param(params.token)
  const notFound = () => html(renderMessagePage('ההצעה לא נמצאה', 'הקישור אינו תקף או שההצעה הוסרה. לפרטים פנו לברק אלקטריק אנג׳ינירינג.'), 404)
  if (!QUOTE_TOKEN_RE.test(token)) return notFound()

  // The form lives on our own page; refuse cross-site posts. Sec-Fetch-Site is
  // set by the browser itself; Origin is checked against our own origins (the
  // request URL can differ from the public domain behind a proxy or in dev).
  const site = request.headers.get('sec-fetch-site')
  const origin = request.headers.get('origin')
  const ours = new Set([new URL(request.url).origin])
  try {
    if (env.PUBLIC_BASE_URL) ours.add(new URL(env.PUBLIC_BASE_URL).origin)
  } catch {
    /* ignore a malformed setting */
  }
  if (site === 'cross-site' || (origin && origin !== 'null' && !ours.has(origin))) {
    return html(renderMessagePage('הבקשה נדחתה', 'יש לאשר את ההצעה מתוך דף ההצעה.'), 403)
  }

  const rec = await getQuote(env, token)
  if (!rec) return notFound()
  const page = `/q/${token}`
  if (await getAcceptance(env, token)) return redirect(`${page}#accept`)

  const now = new Date()
  // Validity is an Israeli calendar date.
  if (rec.quote.valid_until && rec.quote.valid_until < israelToday(now)) {
    return html(renderMessagePage('תוקף ההצעה הסתיים', 'לא ניתן לאשר הצעה שתוקפה הסתיים. פנו אלינו לקבלת הצעה מעודכנת.'), 410)
  }

  // The page posts a small urlencoded form; anything else (or anything big) is not ours.
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (type !== 'application/x-www-form-urlencoded' || Number(request.headers.get('content-length') ?? 0) > 8192) {
    return html(renderMessagePage('הבקשה נדחתה', 'יש לאשר את ההצעה מתוך דף ההצעה.'), 400)
  }
  const raw = await request.text()
  if (raw.length > 8192) return html(renderMessagePage('הבקשה נדחתה', 'יש לאשר את ההצעה מתוך דף ההצעה.'), 413)
  const form = new URLSearchParams(raw)
  const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim()
  const id4 = String(form.get('id4') ?? '').trim()
  const agree = form.get('agree') === 'yes'
  const ref = String(form.get('ref') ?? '')

  let error = ''
  if (ref !== rec.quote.reference) error = 'ההצעה עודכנה מאז שנפתח הדף. עברו על הגרסה המעודכנת ואשרו שוב.'
  else if (name.length < 2 || name.length > 80) error = 'נא למלא שם מלא.'
  else if (!/^\d{4}$/.test(id4)) error = 'נא למלא 4 ספרות אחרונות של תעודת הזהות או ח״פ.'
  else if (!agree) error = 'נא לסמן שקראתם את ההצעה ואתם מאשרים אותה.'
  if (error) {
    return html(renderQuotePage(rec.quote, { token, hasPdf: rec.has_pdf, now, acceptError: error, form: { name } }), 400)
  }

  // When the surveyor recorded the customer's ID, the 4 digits must match it.
  // A few tries only, so the form cannot be used to guess them.
  if (rec.id_last4) {
    const locked = () => html(renderMessagePage('האישור ננעל', 'היו יותר מדי ניסיונות עם ספרות שגויות. פנו אלינו ונשלח קישור חדש.'), 429)
    if ((await getAcceptFails(env, token)) >= MAX_ACCEPT_FAILS) return locked()
    if (id4 !== rec.id_last4) {
      const fails = await addAcceptFail(env, token, now)
      if (fails >= MAX_ACCEPT_FAILS) return locked()
      const left = MAX_ACCEPT_FAILS - fails
      return html(
        renderQuotePage(rec.quote, { token, hasPdf: rec.has_pdf, now, acceptError: `4 הספרות אינן תואמות את פרטי הלקוח שנמסרו לנו. נותרו ${left} ניסיונות.`, form: { name } }),
        400,
      )
    }
  }

  const pdf = rec.has_pdf ? await getPdf(env, token) : null
  const first = await putAcceptance(env, token, {
    name,
    id_last4: id4,
    accepted_at: new Date().toISOString(),
    ip: request.headers.get('cf-connecting-ip'),
    user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300) || null,
    quote_number: rec.quote.quote_number,
    version_no: rec.quote.version_no,
    reference: rec.quote.reference,
    total_incl_vat_ils: rec.quote.totals.total_incl_vat_ils,
    pdf_sha256: pdf ? await sha256Hex(pdf) : null,
    quote: rec.quote,
    id_verified: !!rec.id_last4,
  })
  // Lost the race to an earlier approval: show that one, never overwrite it.
  if (!first) return redirect(`${page}#accept`)
  return redirect(`${page}?accepted=1#accept`)
}
