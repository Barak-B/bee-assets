import { describe, expect, it } from 'vitest'
import {
  PROMPT_SPEC,
  PROMPT_TEMPLATE,
  assessBrief,
  briefTitle,
  emptyBrief,
  formatFollowerCount,
  listPlaceholders,
  parseFollowerCount,
  renderPrompt,
  sha256Text,
} from './template'
import type { BriefInputs } from './types'

const COMPLETE: BriefInputs = {
  industry_vertical: 'home solar and energy savings',
  platform: 'Instagram',
  platform_follower_count: '12.5k',
  experience_level: 'No coding experience',
  hours_per_week: '10–20 hours per week',
  budget_range: '$2,000–$5,000',
}

describe('canonical prompt asset', () => {
  it('is the verbatim AI App Business Plan Generator prompt', () => {
    expect(PROMPT_TEMPLATE.startsWith('# AI App Business Plan Generator')).toBe(true)
    expect(PROMPT_TEMPLATE).toContain('## Role')
    expect(PROMPT_TEMPLATE).toContain('### 4. Concept Evaluation Matrix')
    expect(PROMPT_TEMPLATE).toContain('### 8. {{platform}} Marketing Strategy')
    expect(PROMPT_TEMPLATE).toContain('- Design for MVP launch within 90 days')
    expect(PROMPT_TEMPLATE.trim().endsWith('- Technical feasibility for a beginner')).toBe(true)
  })

  it('declares exactly the placeholders the template uses, in order of appearance', () => {
    expect(listPlaceholders()).toEqual([
      'industry_vertical',
      'platform',
      'platform_follower_count',
      'experience_level',
      'hours_per_week',
      'budget_range',
    ])
    expect(PROMPT_SPEC.variables.map((v) => v.name).sort()).toEqual(listPlaceholders().sort())
  })

  it('keeps the spec and template consistent', () => {
    expect(PROMPT_SPEC.id).toBe('ai-app-business-plan-generator')
    expect(PROMPT_SPEC.template).toBe('ai-app-business-plan-generator.md')
    expect(PROMPT_SPEC.outputSections).toHaveLength(8)
    for (const section of PROMPT_SPEC.outputSections) {
      expect(PROMPT_TEMPLATE).toContain(`### ${section}`)
    }
    for (const constraint of PROMPT_SPEC.constraints) {
      expect(PROMPT_TEMPLATE).toContain(`- ${constraint}`)
    }
    for (const v of PROMPT_SPEC.variables) {
      if (v.type === 'select') expect(v.options?.length ?? 0).toBeGreaterThan(1)
      expect(v.required).toBe(true)
    }
  })
})

describe('parseFollowerCount / formatFollowerCount', () => {
  it('parses plain, comma, k and m forms', () => {
    expect(parseFollowerCount('12500')).toBe(12500)
    expect(parseFollowerCount('12,500')).toBe(12500)
    expect(parseFollowerCount('12.5k')).toBe(12500)
    expect(parseFollowerCount('1.2M')).toBe(1_200_000)
    expect(parseFollowerCount(' 800 followers ')).toBe(800)
  })
  it('rejects non-counts', () => {
    expect(parseFollowerCount('')).toBeNull()
    expect(parseFollowerCount('a lot')).toBeNull()
    expect(parseFollowerCount('-5')).toBeNull()
  })
  it('formats with thousands separators, otherwise keeps the text', () => {
    expect(formatFollowerCount('12.5k')).toBe('12,500')
    expect(formatFollowerCount('about 10k people')).toBe('about 10k people')
  })
})

describe('renderPrompt', () => {
  it('fills every placeholder for a complete brief', () => {
    const r = renderPrompt(COMPLETE)
    expect(r.missing).toEqual([])
    expect(r.unresolved).toEqual([])
    expect(r.prompt).not.toContain('{{')
    expect(r.prompt).toContain(
      "mobile application in home solar and energy savings, leveraging the founder's Instagram presence (12,500 followers).",
    )
    expect(r.prompt).toContain('### 8. Instagram Marketing Strategy')
    expect(r.prompt).toContain('- Instagram fit')
    expect(r.prompt).toContain('- Keep initial costs under $2,000–$5,000')
    expect(r.prompt).toContain('- Available time commitment: 10–20 hours per week')
    expect(r.extrasApplied).toEqual([])
    expect(r.prompt).not.toContain('## Additional Context')
  })

  it('leaves placeholders visible when inputs are missing', () => {
    const r = renderPrompt({ ...COMPLETE, platform: '', budget_range: '  ' })
    expect(r.missing).toEqual(['platform', 'budget_range'])
    expect(r.unresolved).toEqual(['platform', 'budget_range'])
    expect(r.prompt).toContain('{{platform}} Marketing Strategy')
  })

  it('appends Additional Context only for non-default extras', () => {
    const english = renderPrompt(COMPLETE, { output_language: 'English', founder_notes: '' })
    expect(english.prompt).not.toContain('## Additional Context')

    const hebrew = renderPrompt(COMPLETE, {
      output_language: 'Hebrew',
      founder_notes: 'Audience is mostly Israeli homeowners.\nAlready sells consulting calls.',
    })
    expect(hebrew.extrasApplied).toEqual(['output_language', 'founder_notes'])
    expect(hebrew.prompt).toContain('## Additional Context')
    expect(hebrew.prompt).toContain('- Output language: write the entire output in Hebrew.')
    expect(hebrew.prompt).toContain(
      '- Founder notes:\n  Audience is mostly Israeli homeowners.\n  Already sells consulting calls.',
    )
    // canonical body untouched, extras strictly appended
    expect(hebrew.prompt.startsWith(renderPrompt(COMPLETE).prompt)).toBe(true)
  })

  it('never substitutes into the extras section placeholders', () => {
    const r = renderPrompt(COMPLETE, { founder_notes: 'Keep {{platform}} literal' })
    expect(r.prompt).toContain('Keep {{platform}} literal')
    expect(r.unresolved).toEqual(['platform'])
  })
})

describe('assessBrief', () => {
  it('scores by required fields and lists missing labels', () => {
    const r = assessBrief({ ...COMPLETE, hours_per_week: '', experience_level: '' })
    expect(r.ready).toBe(false)
    expect(r.score).toBe(67)
    expect(r.missingRequired).toEqual(['Programming experience level', 'Available time commitment'])
  })

  it('is ready at 100 with warnings for odd values', () => {
    const r = assessBrief({ ...COMPLETE, platform_follower_count: 'a few' }, { output_language: 'Hebrew' })
    expect(r.ready).toBe(true)
    expect(r.score).toBe(100)
    expect(r.warnings.some((w) => w.includes('not a number'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('Hebrew'))).toBe(true)
  })

  it('emptyBrief starts unready with defaults applied', () => {
    const b = emptyBrief()
    expect(assessBrief(b.inputs).ready).toBe(false)
    expect(b.extras['output_language']).toBe('English')
    expect(Object.keys(b.inputs).sort()).toEqual(PROMPT_SPEC.variables.map((v) => v.name).sort())
  })
})

describe('helpers', () => {
  it('briefTitle summarises the brief', () => {
    expect(briefTitle(COMPLETE)).toBe('home solar and energy savings · Instagram · 12,500 followers')
    expect(briefTitle({})).toBe('Untitled brief')
  })

  it('sha256Text is stable', async () => {
    expect(await sha256Text('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
