/** Office screen ↔ the Pages Functions API on the same origin. */
import type { OfficeStatus, Stage } from '../stage'

export interface Me {
  id: string
  name: string
  role: 'surveyor' | 'office' | 'admin'
  role_he: string
}

export interface OfficeLink {
  token: string
  quote_number: string
  version_no: number
  published_at: string
  published_by: string
  revoked_at: string | null
  views: number
  last_viewed_at: string | null
  accepted: { name: string; accepted_at: string; id_verified: boolean; total_incl_vat_ils: number | null } | null
}

export interface OfficeReport {
  reportId: string
  templateKey: string
  title_he: string
  revision: number
  status: string
  updatedAt: string
  outcomeTone: string
  outcomeLabel: string
}

export interface OfficeJob {
  id: string
  projectName: string
  address: string
  surveyor: string
  updatedAt: string
  receivedAt: string
  readyForWave54: boolean
  score: number
  photoCount: number
  customerName: string
  customerPhone: string
  customerEmail: string
  receivedBy: string
  stage: Stage
  office: { status: OfficeStatus; note: string; updated_at: string; updated_by: string } | null
  latestQuote: { version_no: number; quote_number: string; created_at: string; total_incl_vat_ils: number | null; dc_kwp: number | null; needs_owner_input: boolean } | null
  links: OfficeLink[]
  reports: OfficeReport[]
  lastActivityAt: string
}

export interface KeyRow {
  id: string
  name: string
  role: 'surveyor' | 'office' | 'admin'
  created_at: string
  created_by: string
  revoked_at: string | null
  hint: string
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class Api {
  private readonly key: string
  constructor(key: string) {
    this.key = key
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response
    try {
      res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${this.key}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } })
    } catch {
      throw new ApiError('אין חיבור לשרת', 0)
    }
    if (!res.ok) {
      let msg = `השרת החזיר ${res.status}`
      try {
        const j = (await res.json()) as { message_he?: string; error?: string }
        msg = j.message_he ?? j.error ?? msg
      } catch {
        /* not json */
      }
      throw new ApiError(msg, res.status)
    }
    return (await res.json()) as T
  }

  me = () => this.call<Me>('/api/me')
  overview = () => this.call<{ jobs: OfficeJob[]; generated_at: string }>('/api/office/overview')
  survey = (id: string) => this.call<{ survey: { project: Record<string, unknown>; photos: { key: string; field: string }[] } }>(`/api/surveys/${encodeURIComponent(id)}`)
  setStatus = (id: string, status: OfficeStatus, note: string) =>
    this.call<{ office: OfficeJob['office'] }>(`/api/office/status/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status, note }) })
  keys = () => this.call<{ keys: KeyRow[] }>('/api/office/keys')
  createKey = (name: string, role: KeyRow['role']) => this.call<{ key: string; row: KeyRow }>('/api/office/keys', { method: 'POST', body: JSON.stringify({ name, role }) })
  revokeKey = (id: string) => this.call<{ row: KeyRow }>(`/api/office/keys/${encodeURIComponent(id)}`, { method: 'DELETE' })

  /** A survey photo as an object URL (photos need the key, so no plain <img src>). */
  async photoUrl(id: string, key: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/surveys/${encodeURIComponent(id)}/photos/${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${this.key}` } })
      if (!res.ok) return null
      return URL.createObjectURL(await res.blob())
    } catch {
      return null
    }
  }
}
