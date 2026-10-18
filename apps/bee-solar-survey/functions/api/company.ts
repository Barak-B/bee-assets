/**
 * GET /api/company — the company's public details (name, company number,
 * license, address, phone, email, site): what customers see on the quote
 * page and PDFs. No key needed; nothing private is in it.
 */
import { getCompany } from '../_lib/company'
import type { Handler } from '../_lib/env'
import { json, preflight } from '../_lib/http'

export const onRequestOptions: Handler = async ({ request, env }) => preflight(request, env)

export const onRequestGet: Handler = async ({ request, env }) => json(request, env, { company: await getCompany(env) })
