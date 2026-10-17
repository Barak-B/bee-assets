/**
 * Where a job stands. The stage is derived from what actually happened —
 * nobody has to remember to move a card — and the office can put a status on
 * top (on hold / lost / closed) that the data cannot know.
 *
 * Shared by the field app (list chip) and the server (office screen).
 */

export type Stage = 'survey' | 'quote' | 'sent' | 'accepted' | 'installation' | 'handover'
export const STAGES: Stage[] = ['survey', 'quote', 'sent', 'accepted', 'installation', 'handover']

export const STAGE_LABEL_HE: Record<Stage, string> = {
  survey: 'סקר',
  quote: 'הצעה',
  sent: 'נשלח ללקוח',
  accepted: 'הלקוח אישר',
  installation: 'בהתקנה',
  handover: 'נמסר',
}

export type OfficeStatus = 'active' | 'on_hold' | 'lost' | 'closed'
export const OFFICE_STATUSES: OfficeStatus[] = ['active', 'on_hold', 'lost', 'closed']
export const OFFICE_STATUS_LABEL_HE: Record<OfficeStatus, string> = {
  active: 'פעיל',
  on_hold: 'מוקפא',
  lost: 'לא רלוונטי',
  closed: 'סגור',
}

export interface StageFacts {
  quoteVersions: number
  /** Customer links that are still up. */
  liveLinks: number
  /** Any version approved by the customer (kept even if its link was later taken down). */
  accepted: boolean
  /** Installation-side reports of any status: daily report, installation checklist, 62446 inspection, defects. */
  installationReports: number
  /** A locked handover report. */
  handoverFinal: boolean
}

const INSTALLATION_TEMPLATES = new Set(['daily_report', 'installation_checklist', 'inspection_62446', 'defects'])

export function isInstallationTemplate(templateKey: string): boolean {
  return INSTALLATION_TEMPLATES.has(templateKey)
}

/** The furthest point the job has reached. */
export function deriveStage(f: StageFacts): Stage {
  if (f.handoverFinal) return 'handover'
  if (f.installationReports > 0) return 'installation'
  if (f.accepted) return 'accepted'
  if (f.liveLinks > 0) return 'sent'
  if (f.quoteVersions > 0) return 'quote'
  return 'survey'
}

/** What the next step is, in the office's words — one line under the stage. */
export function nextStepHe(stage: Stage): string {
  switch (stage) {
    case 'survey':
      return 'להפיק הצעת מחיר'
    case 'quote':
      return 'לשלוח קישור ללקוח'
    case 'sent':
      return 'לחכות לאישור / להתקשר ללקוח'
    case 'accepted':
      return 'לתאם התקנה ולחתום הסכם'
    case 'installation':
      return 'לסיים התקנה, בדיקה ומסירה'
    case 'handover':
      return 'להוציא חשבון סופי ולסגור'
  }
}

export function isOfficeStatus(v: unknown): v is OfficeStatus {
  return typeof v === 'string' && (OFFICE_STATUSES as string[]).includes(v)
}
