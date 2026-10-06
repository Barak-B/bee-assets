import Anthropic from '@anthropic-ai/sdk'

/**
 * In-app generation is "bring your own key": the founder's Anthropic key is used
 * directly from the browser (api.anthropic.com allows browser calls when the SDK
 * is created with `dangerouslyAllowBrowser`). The key is never written into
 * briefs, hive jobs or backups.
 */

export const MODEL_OPTIONS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — recommended' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — faster, lower cost' },
] as const

export type ModelId = (typeof MODEL_OPTIONS)[number]['id']
export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5'

export const SYSTEM_PROMPT = [
  'You are the AI App Business Plan Generator, a tool published by B.E.E — Barak Electric Engineering (https://www.barak-e.com).',
  'The user message is a complete consulting brief. Follow its sections, output format, constraints and success criteria exactly, in the order given.',
  'Write GitHub-flavored Markdown: use the eight numbered sections as "##" headings, a table for the concept evaluation matrix, and bullet lists for actionable steps.',
  'Where the brief asks for visual aids, use Markdown tables or short text diagrams.',
  'Cite only tools, services and resources you are confident exist, with their real names and URLs. Label market figures as estimates and give ranges rather than invented precision.',
].join(' ')

export interface GenerateOptions {
  apiKey: string
  prompt: string
  model?: ModelId
  signal?: AbortSignal
  /** Called with each text delta and the accumulated text so far */
  onText?: (delta: string, snapshot: string) => void
}

export interface GenerateResult {
  text: string
  model: string
  stopReason: string | null
  refusal: { category: string | null; explanation: string | null } | null
  usage: { inputTokens: number; outputTokens: number }
}

export async function generatePlan(opts: GenerateOptions): Promise<GenerateResult> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  })

  const stream = client.beta.messages.stream(
    {
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 32000,
      // Server-side fallback: if the primary model declines on policy grounds,
      // the API re-runs the same request on Anthropic's default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: opts.prompt }],
    },
    { signal: opts.signal },
  )

  if (opts.onText) {
    const onText = opts.onText
    stream.on('text', (delta, snapshot) => onText(delta, snapshot))
  }

  const message = await stream.finalMessage()

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')

  const refusal =
    message.stop_reason === 'refusal'
      ? {
          category: message.stop_details?.category ?? null,
          explanation: message.stop_details?.explanation ?? null,
        }
      : null

  return {
    text,
    model: message.model,
    stopReason: message.stop_reason,
    refusal,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Anthropic.APIUserAbortError
}

/** Typed SDK errors → one plain sentence for the UI */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'The API key was rejected. Check it in the Anthropic Console and paste it again.'
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'This key is not allowed to use the selected model.'
  }
  if (err instanceof Anthropic.NotFoundError) {
    return 'The selected model is not available to this key. Try the other model.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'The API rate-limited this key. Wait a minute and try again.'
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `The API rejected the request: ${err.message}`
  }
  if (err instanceof Anthropic.InternalServerError) {
    return 'The Anthropic API had a temporary problem. Try again shortly.'
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach api.anthropic.com. Check the connection and any ad blocker or firewall.'
  }
  if (err instanceof Anthropic.APIError) {
    return `API error${err.status ? ` ${err.status}` : ''}: ${err.message}`
  }
  return err instanceof Error ? err.message : String(err)
}
