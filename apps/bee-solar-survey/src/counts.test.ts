import { describe, expect, it } from 'vitest'
import { countsHe } from './counts'

describe('countsHe', () => {
  it('one, many, and no zeros', () => {
    expect(countsHe({ surveys: 1, photos: 0, quotes: 1, reports: 3 })).toBe('סקר אחד · הצעה אחת · 3 דוחות')
    expect(countsHe({ surveys: 2, photos: 1 })).toBe('2 סקרים · תמונה אחת')
    expect(countsHe({})).toBe('')
  })
})
