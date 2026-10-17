import { describe, expect, it } from 'vitest'
import { customerWarnings, idLast4, isMobile, isValidIsraeliId, normalizePhone, quoteMessage, whatsappUrl } from './customer'
import { deriveStage, type StageFacts } from './stage'

describe('customer card', () => {
  it('normalises Israeli phone numbers in the forms people type them', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567')
    expect(normalizePhone('+972 50 123 4567')).toBe('0501234567')
    expect(normalizePhone('972501234567')).toBe('0501234567')
    expect(normalizePhone('03-6123456')).toBe('036123456')
    expect(normalizePhone('12345')).toBe('')
    expect(normalizePhone('+44 20 7946 0958')).toBe('')
    expect(isMobile('050-1234567')).toBe(true)
    expect(isMobile('03-6123456')).toBe(false)
  })

  it('opens WhatsApp with the number and the message — the surveyor still presses send', () => {
    const url = whatsappUrl('050-1234567', quoteMessage('ישראל', 'https://app.barak-e.com/q/abc', 'Q-2026-0001'))!
    expect(url.startsWith('https://wa.me/972501234567?text=')).toBe(true)
    const text = decodeURIComponent(url.split('text=')[1]!)
    expect(text).toContain('שלום ישראל,')
    expect(text).toContain('https://app.barak-e.com/q/abc')
    expect(text).toContain('Q-2026-0001')
    expect(whatsappUrl('', 'x')).toBeNull()
  })

  it('checks the ID check digit (ת״ז and ח״פ) and takes the last 4 digits for the approval', () => {
    expect(isValidIsraeliId('000000018')).toBe(true)
    expect(isValidIsraeliId('18')).toBe(true) // short IDs are left-padded
    expect(isValidIsraeliId('123456782')).toBe(true)
    expect(isValidIsraeliId('123456789')).toBe(false)
    expect(isValidIsraeliId('000000000')).toBe(false)
    expect(isValidIsraeliId('')).toBe(false)
    expect(idLast4('123-45678-2')).toBe('6782')
    expect(idLast4('12')).toBe('')
    expect(idLast4(undefined)).toBe('')
  })

  it('warns, never blocks', () => {
    expect(customerWarnings({ customerName: '', customerPhone: '', customerEmail: '', customerIdNumber: '' })).toHaveLength(2)
    expect(customerWarnings({ customerName: 'ישראל', customerPhone: '050-1234567', customerEmail: 'a@b.co', customerIdNumber: '123456782' })).toEqual([])
    const w = customerWarnings({ customerName: 'ישראל', customerPhone: '123', customerEmail: 'nope', customerIdNumber: '123456789' })
    expect(w.join(' ')).toMatch(/טלפון.*מייל.*ביקורת/)
  })
})

describe('job stage', () => {
  const base: StageFacts = { quoteVersions: 0, liveLinks: 0, accepted: false, installationReports: 0, handoverFinal: false }
  it('moves forward with what actually happened', () => {
    expect(deriveStage(base)).toBe('survey')
    expect(deriveStage({ ...base, quoteVersions: 2 })).toBe('quote')
    expect(deriveStage({ ...base, quoteVersions: 2, liveLinks: 1 })).toBe('sent')
    // All links taken down and nothing approved: back to "quote".
    expect(deriveStage({ ...base, quoteVersions: 2, liveLinks: 0 })).toBe('quote')
    expect(deriveStage({ ...base, quoteVersions: 2, accepted: true })).toBe('accepted')
    expect(deriveStage({ ...base, accepted: true, installationReports: 1 })).toBe('installation')
    expect(deriveStage({ ...base, installationReports: 3, handoverFinal: true })).toBe('handover')
  })
})
