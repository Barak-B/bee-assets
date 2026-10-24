/** PUT /api/office/company — set the company profile (role: admin). Body: CompanyProfile fields. */
import { companyErrors, normalizeCompany } from '../../../src/company'
import { authenticate } from '../../_lib/auth'
import { putCompany } from '../../_lib/company'
import type { Handler } from '../../_lib/env'
import { json, preflight } from '../../_lib/http'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestPut: Handler = async ({ request, env }) => {
  const auth = await authenticate(request, env, 'admin')
  if (!auth.ok) return auth.response
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > 4096) return json(request, env, { error: 'too_large' }, 413)
    raw = JSON.parse(text)
  } catch {
    return json(request, env, { error: 'bad_json' }, 400)
  }
  const company = normalizeCompany(raw)
  const errors = companyErrors(company)
  if (errors.length) return json(request, env, { error: 'bad_field', message_he: errors.join(' · ') }, 400)
  await putCompany(env, company, auth.principal.name)
  return json(request, env, { ok: true, company })
}
