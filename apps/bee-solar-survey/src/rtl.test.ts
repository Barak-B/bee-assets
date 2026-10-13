import { describe, expect, it } from 'vitest'
import { formatNumber, mirrorBrackets } from './rtl'

describe('mirrorBrackets', () => {
  it('mirrors brackets that sit in a Hebrew (RTL) run', () => {
    expect(mirrorBrackets('בטון (flat)')).toBe('בטון )flat(')
    expect(mirrorBrackets('כתובת (Wave 54) תל אביב')).toBe('כתובת )Wave 54( תל אביב')
  })

  it('leaves brackets inside a pure Latin run alone', () => {
    expect(mirrorBrackets('SolarEdge (SE5K) inverter')).toBe('SolarEdge (SE5K) inverter')
  })

  it('treats digits as RTL context (UAX #9 N1), matching the jsPDF engine', () => {
    expect(mirrorBrackets('ממיר 10 (kW)')).toBe('ממיר 10 )kW(')
    expect(mirrorBrackets('כבל DC 6 ממ״ר (H1Z2Z2-K)')).toBe('כבל DC 6 ממ״ר )H1Z2Z2-K(')
  })

  it('is a no-op without brackets', () => {
    expect(mirrorBrackets('שלום עולם 123')).toBe('שלום עולם 123')
  })
})

describe('formatNumber', () => {
  it('adds thousands separators and respects fraction digits', () => {
    expect(formatNumber('120000')).toBe('120,000')
    expect(formatNumber('15.5', 2)).toBe('15.5')
    expect(formatNumber(1234.567, 1)).toBe('1,234.6')
  })
  it('returns non-numeric input unchanged', () => {
    expect(formatNumber('abc')).toBe('abc')
    expect(formatNumber('')).toBe('')
    expect(formatNumber(null)).toBe('')
  })
})
