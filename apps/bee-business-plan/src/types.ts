/** Variable kinds supported by prompts/*.json specs */
export type VariableType = 'text' | 'select' | 'number' | 'textarea'

export interface VariableSpec {
  name: string
  label: string
  type: VariableType
  required: boolean
  options?: string[]
  allowCustom?: boolean
  placeholder?: string
  help?: string
  examples?: string[]
  default?: string
  min?: number
  /** `thousands` → "12500" / "12.5k" is rendered as "12,500" */
  format?: 'thousands'
}

/** Shape of prompts/ai-app-business-plan-generator.json */
export interface PromptSpec {
  id: string
  version: string
  title: string
  kind: string
  summary: string
  template: string
  placeholderSyntax: string
  app: string
  links: { app: string; site: string; source: string }
  hive: {
    collect: string
    edit: string[]
    dispatch: string
    trustTier: TrustTier
    law2: string
  }
  variables: VariableSpec[]
  extras: { appendSection: string; fields: VariableSpec[] }
  outputSections: string[]
  constraints: string[]
}

/** Raw founder answers keyed by variable name */
export type BriefInputs = Record<string, string>

export interface GeneratedPlan {
  markdown: string
  model: string
  createdAt: string
  stopReason: string | null
  promptSha256: string
  usage?: { inputTokens: number; outputTokens: number }
}

export interface StartupBrief {
  id: string
  name: string
  inputs: BriefInputs
  extras: BriefInputs
  plan?: GeneratedPlan | null
  createdAt: string
  updatedAt: string
  hiveReady?: boolean
}

export interface BriefReadiness {
  score: number
  ready: boolean
  missingRequired: string[]
  warnings: string[]
}

// ---- Hive (platform/schema/job.schema.json) ----

export type HiveJobKind = 'collect' | 'edit' | 'dispatch'
export type TrustTier = 'L0' | 'L1' | 'L2'
export type HiveJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked_trust'
  | 'cancelled'

export type OutboundChannel = 'whatsapp' | 'email' | 'db' | 'none'
export type DestinationClass =
  | 'self_chat'
  | 'neri_group'
  | 'drafts_group'
  | 'voice_transcripts'
  | 'customer'
  | 'supplier'
  | 'other'

export interface HiveJob {
  id: string
  kind: HiveJobKind
  loop: string
  status: HiveJobStatus
  trustTier: TrustTier
  costTier: number
  source: string
  payload: Record<string, unknown>
  result?: Record<string, unknown> | null
  error?: string | null
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
  outbound?: {
    channel: OutboundChannel
    destinationClass: DestinationClass
    requiresHumanPick: boolean
  }
}
