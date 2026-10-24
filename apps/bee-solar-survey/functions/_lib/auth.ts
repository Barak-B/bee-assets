/**
 * Who is calling. Two kinds of key:
 *
 *  - PUBLISH_KEY (Pages secret) — the owner's master key, role admin. It also
 *    keeps working as before, so nothing breaks when keys are introduced.
 *  - Personal keys created on the office screen, one per surveyor / office
 *    worker: `bee_<43 base64url chars>`. Only their sha256 is stored, at
 *    auth/keys/<sha256> (customMetadata = the key's row), so a leaked bucket
 *    listing does not leak keys. One lost phone = revoke that one key.
 *
 * Roles are ranked: surveyor < office < admin. A route names the lowest role
 * it accepts.
 */
import type { Env } from './env'
import { json } from './http'

export type Role = 'surveyor' | 'office' | 'admin'
export const ROLES: Role[] = ['surveyor', 'office', 'admin']
const RANK: Record<Role, number> = { surveyor: 1, office: 2, admin: 3 }
export const ROLE_LABEL_HE: Record<Role, string> = { surveyor: 'סוקר', office: 'משרד', admin: 'מנהל' }

export interface Principal {
  id: string
  name: string
  role: Role
}

export interface KeyRow {
  id: string
  name: string
  role: Role
  created_at: string
  created_by: string
  revoked_at: string | null
  /** Last 4 characters of the key, so a person can tell their key apart. */
  hint: string
}

export type AuthResult = { ok: true; principal: Principal } | { ok: false; response: Response }

export const KEY_RE = /^bee_[A-Za-z0-9_-]{43}$/
const ADMIN: Principal = { id: 'admin', name: 'מנהל', role: 'admin' }

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  let diff = ea.length ^ eb.length
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0)
  return diff === 0
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const keyPath = (hash: string) => `auth/keys/${hash}`
const enc = encodeURIComponent
const dec = (v: string | undefined) => {
  try {
    return decodeURIComponent(v ?? '')
  } catch {
    return v ?? ''
  }
}

function rowFromMeta(m: Record<string, string>): KeyRow | null {
  if (!m.id || !ROLES.includes(m.role as Role)) return null
  return { id: m.id, name: dec(m.name), role: m.role as Role, created_at: m.created_at ?? '', created_by: dec(m.created_by), revoked_at: m.revoked_at || null, hint: m.hint ?? '' }
}

function toMeta(r: KeyRow): Record<string, string> {
  return { id: r.id, name: enc(r.name), role: r.role, created_at: r.created_at, created_by: enc(r.created_by), revoked_at: r.revoked_at ?? '', hint: r.hint }
}

/** Resolve the bearer key to a principal, or the 401/403/503 response to return. */
export async function authenticate(request: Request, env: Env, need: Role = 'surveyor'): Promise<AuthResult> {
  if (!env.PUBLISH_KEY) return { ok: false, response: json(request, env, { error: 'publishing_not_configured', message_he: 'PUBLISH_KEY לא מוגדר בשרת' }, 503) }
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  const token = m?.[1]?.trim() ?? ''
  const unauthorized = (message_he = 'מפתח שגוי') => ({ ok: false as const, response: json(request, env, { error: 'unauthorized', message_he }, 401) })
  if (!token) return unauthorized()

  let principal: Principal | null = null
  if (timingSafeEqual(token, env.PUBLISH_KEY)) principal = ADMIN
  else if (KEY_RE.test(token)) {
    const obj = await env.QUOTES.get(keyPath(await sha256Hex(token)))
    const row = obj?.customMetadata ? rowFromMeta(obj.customMetadata) : null
    if (!row) return unauthorized()
    if (row.revoked_at) return unauthorized('המפתח בוטל — בקשו מפתח חדש מהמשרד')
    principal = { id: row.id, name: row.name, role: row.role }
  }
  if (!principal) return unauthorized()
  if (RANK[principal.role] < RANK[need]) {
    return { ok: false, response: json(request, env, { error: 'forbidden', message_he: `אין הרשאה — נדרש תפקיד ${ROLE_LABEL_HE[need]}` }, 403) }
  }
  return { ok: true, principal }
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Create a personal key. The plain key is returned once and never stored. */
export async function createKey(env: Env, name: string, role: Role, by: Principal, now = new Date()): Promise<{ key: string; row: KeyRow }> {
  const key = `bee_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`
  const row: KeyRow = { id: crypto.randomUUID(), name, role, created_at: now.toISOString(), created_by: by.name, revoked_at: null, hint: key.slice(-4) }
  await env.QUOTES.put(keyPath(await sha256Hex(key)), '', { customMetadata: toMeta(row) })
  return { key, row }
}

async function listKeyObjects(env: Env): Promise<{ path: string; row: KeyRow }[]> {
  const out: { path: string; row: KeyRow }[] = []
  let cursor: string | undefined
  do {
    const res = await env.QUOTES.list({ prefix: 'auth/keys/', cursor, limit: 1000, include: ['customMetadata'] })
    for (const o of res.objects) {
      const row = o.customMetadata ? rowFromMeta(o.customMetadata) : null
      if (row) out.push({ path: o.key, row })
    }
    cursor = res.truncated ? res.cursor : undefined
  } while (cursor)
  return out
}

export async function listKeys(env: Env): Promise<KeyRow[]> {
  return (await listKeyObjects(env)).map((x) => x.row).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Revoke a key by id. Returns the updated row, or null when there is no such key. Kept, not deleted, for the record. */
export async function revokeKey(env: Env, id: string, now = new Date()): Promise<KeyRow | null> {
  const hit = (await listKeyObjects(env)).find((x) => x.row.id === id)
  if (!hit) return null
  if (hit.row.revoked_at) return hit.row
  const row = { ...hit.row, revoked_at: now.toISOString() }
  await env.QUOTES.put(hit.path, '', { customMetadata: toMeta(row) })
  return row
}
