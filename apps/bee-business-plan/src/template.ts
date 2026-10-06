import templateMd from '../../../prompts/ai-app-business-plan-generator.md?raw'
import specJson from '../../../prompts/ai-app-business-plan-generator.json'
import type {
  BriefInputs,
  BriefReadiness,
  PromptSpec,
  StartupBrief,
  VariableSpec,
} from './types'

/** Single source of truth: <repo>/prompts/ai-app-business-plan-generator.{md,json} */
export const PROMPT_SPEC: PromptSpec = specJson as PromptSpec
export const PROMPT_TEMPLATE: string = templateMd.replace(/\r\n/g, '\n').trimEnd()

export const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g

/** Unique placeholder names in order of first appearance */
export function listPlaceholders(template: string = PROMPT_TEMPLATE): string[] {
  const seen = new Set<string>()
  for (const m of template.matchAll(PLACEHOLDER_RE)) seen.add(m[1]!)
  return [...seen]
}

export function variableByName(name: string): VariableSpec | undefined {
  return (
    PROMPT_SPEC.variables.find((v) => v.name === name) ??
    PROMPT_SPEC.extras.fields.find((v) => v.name === name)
  )
}

/** "12,500" | "12.5k" | "1.2M" | "12500 followers" → 12500; null when not a count */
export function parseFollowerCount(raw: string): number | null {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/followers?$/i, '')
    .replace(/[,\s_]/g, '')
  if (!t) return null
  const m = t.match(/^(\d+(?:\.\d+)?)([km]?)$/)
  if (!m) return null
  let n = Number(m[1])
  if (m[2] === 'k') n *= 1_000
  if (m[2] === 'm') n *= 1_000_000
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function formatFollowerCount(raw: string): string {
  const n = parseFollowerCount(raw)
  return n === null ? raw.trim() : n.toLocaleString('en-US')
}

/** Values exactly as they will be substituted into the template */
export function normalizeInputs(inputs: BriefInputs): BriefInputs {
  const out: BriefInputs = {}
  for (const v of PROMPT_SPEC.variables) {
    const raw = (inputs[v.name] ?? '').trim()
    out[v.name] = v.format === 'thousands' ? formatFollowerCount(raw) : raw
  }
  return out
}

/** Collect-stage completeness: all six canonical variables filled */
export function assessBrief(inputs: BriefInputs, extras: BriefInputs = {}): BriefReadiness {
  const missingRequired: string[] = []
  const warnings: string[] = []

  for (const v of PROMPT_SPEC.variables) {
    if (v.required && !(inputs[v.name] ?? '').trim()) missingRequired.push(v.label)
  }

  const followers = (inputs['platform_follower_count'] ?? '').trim()
  if (followers && parseFollowerCount(followers) === null) {
    warnings.push('Follower count is not a number — it will be inserted exactly as typed.')
  }

  const vertical = (inputs['industry_vertical'] ?? '').trim()
  if (vertical && vertical.length < 4) {
    warnings.push('Industry vertical is very short — a specific niche gives a sharper plan.')
  }

  const lang = (extras['output_language'] ?? '').trim()
  if (lang && lang.toLowerCase() !== 'english') {
    warnings.push(`The plan will be written in ${lang}; resource links keep their original language.`)
  }

  const required = PROMPT_SPEC.variables.filter((v) => v.required).length
  const filled = required - missingRequired.length
  const score = required === 0 ? 100 : Math.round((filled / required) * 100)

  return { score, ready: missingRequired.length === 0, missingRequired, warnings }
}

export interface RenderResult {
  /** Final prompt text (template + optional Additional Context section) */
  prompt: string
  /** Normalized values that were substituted */
  values: BriefInputs
  /** Canonical variables left empty — their placeholders stay in the text */
  missing: string[]
  /** Placeholders still present after substitution (should be [] when ready) */
  unresolved: string[]
  /** Extras that produced an Additional Context line */
  extrasApplied: string[]
}

function extraLine(field: VariableSpec, value: string): string {
  if (field.name === 'output_language') {
    return `- Output language: write the entire output in ${value}.`
  }
  if (field.type === 'textarea' && value.includes('\n')) {
    const body = value
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .join('\n  ')
    return `- ${field.label}:\n  ${body}`
  }
  return `- ${field.label}: ${value}`
}

/**
 * Edit-stage render: fill {{placeholders}} from the brief.
 * The canonical template is never altered; extras only append a trailing section.
 */
export function renderPrompt(inputs: BriefInputs, extras: BriefInputs = {}): RenderResult {
  const values = normalizeInputs(inputs)
  const missing = PROMPT_SPEC.variables.filter((v) => !values[v.name]).map((v) => v.name)

  let prompt = PROMPT_TEMPLATE.replace(PLACEHOLDER_RE, (whole: string, name: string) => {
    const val = values[name]
    return val ? val : whole
  })

  const lines: string[] = []
  const extrasApplied: string[] = []
  for (const field of PROMPT_SPEC.extras.fields) {
    const value = (extras[field.name] ?? '').trim()
    if (!value) continue
    if (field.default && value.toLowerCase() === field.default.toLowerCase()) continue
    lines.push(extraLine(field, value))
    extrasApplied.push(field.name)
  }
  if (lines.length) {
    prompt += `\n\n## ${PROMPT_SPEC.extras.appendSection}\n${lines.join('\n')}`
  }

  return { prompt, values, missing, unresolved: listPlaceholders(prompt), extrasApplied }
}

export function briefTitle(inputs: BriefInputs): string {
  const vertical = (inputs['industry_vertical'] ?? '').trim()
  const platform = (inputs['platform'] ?? '').trim()
  const followers = (inputs['platform_follower_count'] ?? '').trim()
  const parts = [vertical || 'Untitled brief']
  if (platform) parts.push(platform)
  if (followers) parts.push(`${formatFollowerCount(followers)} followers`)
  return parts.join(' · ')
}

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function emptyBrief(partial?: Partial<StartupBrief>): StartupBrief {
  const now = new Date().toISOString()
  const inputs: BriefInputs = {}
  for (const v of PROMPT_SPEC.variables) inputs[v.name] = v.default ?? ''
  const extras: BriefInputs = {}
  for (const f of PROMPT_SPEC.extras.fields) extras[f.name] = f.default ?? ''
  return {
    id: crypto.randomUUID(),
    name: '',
    inputs,
    extras,
    plan: null,
    createdAt: now,
    updatedAt: now,
    hiveReady: false,
    ...partial,
  }
}
