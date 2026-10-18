/** Office screen ↔ the Pages Functions API on the same origin. */
import type { Milestone, MilestoneKey, Milestones, OfficeStatus, Stage } from '../stage'
import type { CompanyProfile } from '../company'
import type { SubmissionRecord } from '../submission'

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
  office: OfficeRow | null
  /** The office's milestones plus what locked reports prove (those carry `auto`). */
  milestones: Milestones
  latestQuote: { version_no: number; quote_number: string; created_at: string; total_incl_vat_ils: number | null; dc_kwp: number | null; needs_owner_input: boolean; valid_until?: string } | null
  links: OfficeLink[]
  reports: OfficeReport[]
  lastActivityAt: string
}

export interface OfficeRow {
  status: OfficeStatus
  note: string
  updated_at: string
  updated_by: string
  assigned_to_id: string
  assigned_to_name: string
  planned_date: string
  milestones: Milestones
}

export interface OfficeUpdate {
  status?: OfficeStatus
  note?: string
  assigned_to?: string
  planned_date?: string
  /** Only the keys sent change; null clears one. */
  milestones?: Partial<Record<MilestoneKey, Pick<Milestone, 'date' | 'ref'> | null>>
}

export interface NewJob {
  customerName: string
  customerPhone: string
  customerEmail: string
  address: string
  projectName: string
  note: string
  assigned_to: string
  planned_date: string
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

export interface MessageEntry {
  at: string
  by: string
  template_key: string
  channel: 'whatsapp' | 'sms' | 'email'
  to: string
  subject: string
  body: string
}

export interface TimelineEvent {
  at: string
  kind: 'office' | 'milestone' | 'survey' | 'quote' | 'link' | 'view' | 'accepted' | 'report' | 'message'
  text_he: string
  by: string
  tone?: 'ok' | 'warn'
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
  updateOffice = (id: string, u: OfficeUpdate) => this.call<{ office: OfficeRow }>(`/api/office/status/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(u) })
  createJob = (job: NewJob) => this.call<{ id: string; office: OfficeRow }>('/api/office/jobs', { method: 'POST', body: JSON.stringify(job) })
  surveyors = () => this.call<{ surveyors: { id: string; name: string; role: string }[] }>('/api/office/surveyors')
  keys = () => this.call<{ keys: KeyRow[] }>('/api/office/keys')
  createKey = (name: string, role: KeyRow['role']) => this.call<{ key: string; row: KeyRow }>('/api/office/keys', { method: 'POST', body: JSON.stringify({ name, role }) })
  submission = (id: string) => this.call<{ submission: SubmissionRecord | null; suggested: { id: string; why_he: string } }>(`/api/office/submission/${encodeURIComponent(id)}`)
  saveSubmission = (id: string, body: Record<string, unknown>) => this.call<{ submission: SubmissionRecord; office: OfficeRow | null }>(`/api/office/submission/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
  company = () => this.call<{ company: CompanyProfile }>('/api/company')
  saveCompany = (c: CompanyProfile) => this.call<{ company: CompanyProfile }>('/api/office/company', { method: 'PUT', body: JSON.stringify(c) })
  timeline = (id: string) => this.call<{ events: TimelineEvent[] }>(`/api/office/timeline/${encodeURIComponent(id)}`)
  messages = (id: string) => this.call<{ messages: MessageEntry[] }>(`/api/office/messages/${encodeURIComponent(id)}`)
  logMessage = (id: string, m: Omit<MessageEntry, 'at' | 'by'>) => this.call<{ message: MessageEntry }>(`/api/office/messages/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(m) })
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
