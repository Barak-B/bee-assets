/** PUT /api/surveys/<id>/quotes/<version> — store a quote version; versions never change (auth). */
import type { Handler } from '../../../../_lib/env'
import { authenticate } from '../../../../_lib/auth'
import { json, param, preflight } from '../../../../_lib/http'
import { UUID_RE, getSurvey, putQuoteVersion } from '../../../../_lib/surveys'

const MAX = 2 * 1024 * 1024

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env)
  if (!auth.ok) return auth.response
  const id = param(params.id)
  const version = Number(param(params.version))
  if (!UUID_RE.test(id) || !Number.isInteger(version) || version < 1 || version > 9999) return json(request, env, { error: 'bad_key' }, 400)
  if (!(await getSurvey(env, id))) return json(request, env, { error: 'survey_first', message_he: 'יש לסנכרן את הסקר לפני ההצעה' }, 409)
  const text = await request.text()
  if (text.length > MAX) return json(request, env, { error: 'too_large' }, 413)
  let quote: { version_no?: unknown; snapshot_hash?: unknown; input?: { projectId?: unknown } }
  try {
    quote = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  if (quote.version_no !== version || typeof quote.snapshot_hash !== 'string' || quote.input?.projectId !== id) {
    return json(request, env, { error: 'bad_quote' }, 400)
  }
  const res = await putQuoteVersion(env, id, version, quote)
  if (res === 'conflict') return json(request, env, { error: 'version_conflict', message_he: `גרסה ${version} כבר קיימת בשרת עם תוכן אחר` }, 409)
  return json(request, env, { ok: true, result: res }, res === 'created' ? 201 : 200)
}
