import { PROMPT_SPEC, assessBrief, renderPrompt, sha256Text, briefTitle } from './template'
import type { RenderResult } from './template'
import type { HiveJob, StartupBrief } from './types'

export const APP_SOURCE = 'bee-business-plan'

export const LOOPS = {
  collect: 'collect.startup-brief',
  render: 'edit.render-business-plan-prompt',
  generate: 'edit.generate-business-plan',
  dispatch: 'dispatch.draft',
} as const

function isoNow(): string {
  return new Date().toISOString()
}

/** Collect loop: founder brief → work-ledger job (Trust L1, never customer outbound) */
export function buildCollectBriefJob(brief: StartupBrief): HiveJob {
  const readiness = assessBrief(brief.inputs, brief.extras)
  return {
    id: crypto.randomUUID(),
    kind: 'collect',
    loop: LOOPS.collect,
    status: readiness.ready ? 'succeeded' : 'queued',
    trustTier: 'L1',
    costTier: 0,
    source: APP_SOURCE,
    payload: {
      briefId: brief.id,
      title: brief.name || briefTitle(brief.inputs),
      template: { id: PROMPT_SPEC.id, version: PROMPT_SPEC.version },
      inputs: brief.inputs,
      extras: brief.extras,
      readiness,
    },
    result: null,
    error: null,
    createdAt: isoNow(),
    startedAt: isoNow(),
    finishedAt: readiness.ready ? isoNow() : null,
    outbound: {
      channel: 'none',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

/** Edit loop: fill the canonical template; blocked while required inputs are missing */
export function buildRenderPromptJob(
  brief: StartupBrief,
  collectJobId: string,
  rendered: RenderResult,
  promptSha256: string,
): HiveJob {
  const readiness = assessBrief(brief.inputs, brief.extras)
  const blocked = !readiness.ready || rendered.unresolved.length > 0

  return {
    id: crypto.randomUUID(),
    kind: 'edit',
    loop: LOOPS.render,
    status: blocked ? 'blocked_trust' : 'succeeded',
    trustTier: 'L1',
    costTier: 0,
    source: APP_SOURCE,
    payload: {
      collectJobId,
      briefId: brief.id,
      template: {
        id: PROMPT_SPEC.id,
        version: PROMPT_SPEC.version,
        file: `prompts/${PROMPT_SPEC.template}`,
      },
      values: rendered.values,
      extrasApplied: rendered.extrasApplied,
      readiness,
    },
    result: blocked
      ? null
      : {
          prompt: rendered.prompt,
          promptSha256,
          promptChars: rendered.prompt.length,
          outputSections: PROMPT_SPEC.outputSections.map((s) =>
            s.replace('{{platform}}', rendered.values['platform'] ?? '{{platform}}'),
          ),
        },
    error: blocked
      ? `Missing required inputs: ${[
          ...readiness.missingRequired,
          ...rendered.unresolved.map((u) => `{{${u}}}`),
        ].join(', ')}`
      : null,
    createdAt: isoNow(),
    startedAt: isoNow(),
    finishedAt: isoNow(),
    outbound: {
      channel: 'db',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

/** Edit loop (cost tier 2): plan generated in-app with the founder's own key */
export function buildGeneratePlanJob(brief: StartupBrief, renderJobId: string): HiveJob | null {
  const plan = brief.plan
  if (!plan) return null
  return {
    id: crypto.randomUUID(),
    kind: 'edit',
    loop: LOOPS.generate,
    status: plan.stopReason === 'refusal' ? 'failed' : 'succeeded',
    trustTier: 'L1',
    costTier: 2,
    source: APP_SOURCE,
    payload: {
      renderJobId,
      briefId: brief.id,
      model: plan.model,
      promptSha256: plan.promptSha256,
      usage: plan.usage ?? null,
    },
    result: {
      planMarkdown: plan.markdown,
      planChars: plan.markdown.length,
      stopReason: plan.stopReason,
      generatedAt: plan.createdAt,
    },
    error: plan.stopReason === 'refusal' ? 'Model declined to generate this plan' : null,
    createdAt: plan.createdAt,
    startedAt: plan.createdAt,
    finishedAt: plan.createdAt,
    outbound: {
      channel: 'db',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

/**
 * Dispatch draft only — Law #2.
 * Never marks destinationClass=customer. Barak picks before any external send.
 */
export function buildDispatchDraftJob(brief: StartupBrief, upstreamJobId: string): HiveJob {
  const title = brief.name || briefTitle(brief.inputs)
  return {
    id: crypto.randomUUID(),
    kind: 'dispatch',
    loop: LOOPS.dispatch,
    status: 'queued',
    trustTier: 'L1',
    costTier: 0,
    source: APP_SOURCE,
    payload: {
      upstreamJobId,
      briefId: brief.id,
      title: `Startup brief draft — ${title}`,
      titleHe: `טיוטת תוכנית עסקית לאפליקציה — ${title}`,
      planAttached: !!brief.plan,
      nextStep: 'human-review',
      message:
        'AI app business plan brief is ready for review. After Barak approves → share with the founder. Nothing is sent automatically.',
      messageHe:
        'תוכנית עסקית לאפליקציה מוכנה לעיון. לאחר אישור ברק → שיתוף עם היזם. אין שליחה אוטומטית.',
    },
    result: null,
    error: null,
    createdAt: isoNow(),
    outbound: {
      channel: 'whatsapp',
      destinationClass: 'drafts_group',
      requiresHumanPick: true,
    },
  }
}

export interface HiveExportBundle {
  exportedAt: string
  app: typeof APP_SOURCE
  template: { id: string; version: string }
  hiveModel: 'Collect → Edit → Dispatch'
  trust: {
    law1: '4 authorized WA destinations only'
    law2: 'Human picks — no customer auto-send'
    tier: 'L1'
  }
  jobs: HiveJob[]
}

export async function buildHiveExportBundle(brief: StartupBrief): Promise<HiveExportBundle> {
  const rendered = renderPrompt(brief.inputs, brief.extras)
  const promptSha256 = await sha256Text(rendered.prompt)

  const collect = buildCollectBriefJob(brief)
  const render = buildRenderPromptJob(brief, collect.id, rendered, promptSha256)
  const jobs: HiveJob[] = [collect, render]

  if (render.status === 'succeeded') {
    let upstream = render.id
    const generate = buildGeneratePlanJob(brief, render.id)
    if (generate) {
      jobs.push(generate)
      upstream = generate.id
    }
    jobs.push(buildDispatchDraftJob(brief, upstream))
  }

  return {
    exportedAt: isoNow(),
    app: APP_SOURCE,
    template: { id: PROMPT_SPEC.id, version: PROMPT_SPEC.version },
    hiveModel: 'Collect → Edit → Dispatch',
    trust: {
      law1: '4 authorized WA destinations only',
      law2: 'Human picks — no customer auto-send',
      tier: 'L1',
    },
    jobs,
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename)
}

export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename)
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9֐-׿]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'brief'
  )
}
