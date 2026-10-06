import { describe, expect, it } from 'vitest'
import jobSchema from '../../../platform/schema/job.schema.json'
import loops from '../../../platform/schema/loops.json'
import { LOOPS, buildHiveExportBundle, slugify } from './hive'
import { emptyBrief } from './template'
import type { HiveJob, StartupBrief } from './types'

function completeBrief(partial?: Partial<StartupBrief>): StartupBrief {
  return emptyBrief({
    inputs: {
      industry_vertical: 'fitness coaching for busy parents',
      platform: 'TikTok',
      platform_follower_count: '48,000',
      experience_level: 'Beginner — comfortable with no-code tools, little or no code',
      hours_per_week: '5–10 hours per week',
      budget_range: 'Under $500',
    },
    ...partial,
  })
}

const schema = jobSchema as {
  required: string[]
  properties: Record<string, { enum?: string[]; pattern?: string }>
}

function expectValidJob(job: HiveJob) {
  for (const key of schema.required) {
    expect(job, `job ${job.loop} missing ${key}`).toHaveProperty(key)
  }
  expect(schema.properties['kind']!.enum).toContain(job.kind)
  expect(schema.properties['status']!.enum).toContain(job.status)
  expect(schema.properties['trustTier']!.enum).toContain(job.trustTier)
  expect(job.loop).toMatch(new RegExp(schema.properties['loop']!.pattern!))
  expect(job.loop.startsWith(`${job.kind}.`)).toBe(true)
  expect(job.costTier).toBeGreaterThanOrEqual(0)
  expect(job.costTier).toBeLessThanOrEqual(4)
  expect(() => new Date(job.createdAt).toISOString()).not.toThrow()
}

describe('hive export bundle', () => {
  it('builds Collect → Edit → Dispatch when the brief is complete', async () => {
    const bundle = await buildHiveExportBundle(completeBrief())
    expect(bundle.app).toBe('bee-business-plan')
    expect(bundle.template.id).toBe('ai-app-business-plan-generator')
    expect(bundle.jobs.map((j) => j.loop)).toEqual([LOOPS.collect, LOOPS.render, LOOPS.dispatch])

    const [collect, render, dispatch] = bundle.jobs as [HiveJob, HiveJob, HiveJob]
    expect(collect.status).toBe('succeeded')
    expect(render.status).toBe('succeeded')
    expect(render.payload['collectJobId']).toBe(collect.id)
    expect(dispatch.payload['upstreamJobId']).toBe(render.id)

    const result = render.result as { prompt: string; promptSha256: string; outputSections: string[] }
    expect(result.prompt).not.toContain('{{')
    expect(result.promptSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.outputSections[7]).toBe('8. TikTok Marketing Strategy')

    expect(dispatch.outbound?.destinationClass).toBe('drafts_group')
    expect(dispatch.outbound?.requiresHumanPick).toBe(true)
    for (const job of bundle.jobs) expectValidJob(job)
  })

  it('adds a cost-tier-2 generate job when a plan exists', async () => {
    const brief = completeBrief({
      plan: {
        markdown: '# Plan\n\n## 1. Market Analysis\n…',
        model: 'claude-opus-5-5',
        createdAt: '2026-10-06T12:00:00.000Z',
        stopReason: 'end_turn',
        promptSha256: 'f'.repeat(64),
        usage: { inputTokens: 1200, outputTokens: 6000 },
      },
    })
    const bundle = await buildHiveExportBundle(brief)
    expect(bundle.jobs.map((j) => j.loop)).toEqual([
      LOOPS.collect,
      LOOPS.render,
      LOOPS.generate,
      LOOPS.dispatch,
    ])
    const generate = bundle.jobs[2]!
    expect(generate.costTier).toBe(2)
    expect(generate.status).toBe('succeeded')
    expect((generate.result as { planMarkdown: string }).planMarkdown).toContain('Market Analysis')
    expect(bundle.jobs[3]!.payload['upstreamJobId']).toBe(generate.id)
    expect(bundle.jobs[3]!.payload['planAttached']).toBe(true)
    for (const job of bundle.jobs) expectValidJob(job)
  })

  it('blocks the edit and skips dispatch when required inputs are missing', async () => {
    const brief = completeBrief()
    brief.inputs['budget_range'] = ''
    const bundle = await buildHiveExportBundle(brief)
    expect(bundle.jobs).toHaveLength(2)
    expect(bundle.jobs[0]!.status).toBe('queued')
    expect(bundle.jobs[1]!.status).toBe('blocked_trust')
    expect(bundle.jobs[1]!.error).toContain('Initial budget range')
    expect(bundle.jobs[1]!.result).toBeNull()
  })

  it('never targets a customer or supplier (Law #1 / Law #2)', async () => {
    const bundle = await buildHiveExportBundle(completeBrief({ plan: null }))
    for (const job of bundle.jobs) {
      expect(job.outbound).toBeDefined()
      expect(['customer', 'supplier', 'other']).not.toContain(job.outbound!.destinationClass)
      expect(job.outbound!.requiresHumanPick).toBe(true)
    }
  })

  it('uses loops that are declared in platform/schema/loops.json', () => {
    const declared = new Set((loops as { loops: { name: string }[] }).loops.map((l) => l.name))
    for (const loop of Object.values(LOOPS)) {
      expect(declared.has(loop), `${loop} not declared`).toBe(true)
    }
  })
})

describe('slugify', () => {
  it('makes safe filenames, keeping Hebrew letters', () => {
    expect(slugify('Home Solar & Energy · Instagram')).toBe('home-solar-energy-instagram')
    expect(slugify('תוכנית עסקית')).toBe('תוכנית-עסקית')
    expect(slugify('   ')).toBe('brief')
  })
})
