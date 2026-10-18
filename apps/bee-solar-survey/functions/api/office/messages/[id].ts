/**
 * /api/office/messages/<surveyId> — messages the office opened for the
 * customer (role: office).
 *   GET  → { messages: [...] } newest first
 *   POST { template_key, channel: whatsapp|sms|email, to, subject?, body } → { message }
 * Nothing is sent from here: the office presses send in WhatsApp / SMS / mail.
 */
import { authenticate } from '../../../_lib/auth'
import type { Handler } from '../../../_lib/env'
import { json, param, preflight } from '../../../_lib/http'
import { addMessage, listMessages, parseMessage } from '../../../_lib/messages'
import { UUID_RE, getSurvey } from '../../../_lib/surveys'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  return json(request, env, { messages: await listMessages(env, id) })
}

export const onRequestPost: Handler = async ({ request, env, params }) => {
  const auth = await authenticate(request, env, 'office')
  if (!auth.ok) return auth.response
  const id = param(params.id)
  if (!UUID_RE.test(id)) return json(request, env, { error: 'bad_id' }, 400)
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > 16384) return json(request, env, { error: 'too_large' }, 413)
    raw = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  const parsed = parseMessage(raw)
  if ('error' in parsed) return json(request, env, { error: 'bad_field', message_he: parsed.error }, 400)
  if (!(await getSurvey(env, id))) return json(request, env, { error: 'not_found' }, 404)
  return json(request, env, { ok: true, message: await addMessage(env, id, parsed.entry, auth.principal.name) }, 201)
}
