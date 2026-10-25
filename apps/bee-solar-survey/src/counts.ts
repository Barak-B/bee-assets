/**
 * "סקר אחד · 3 תמונות · הצעה אחת" — Hebrew counts for toasts. Zeros are left
 * out: "0 תמונות" after a sync reads like a failure when the photos were
 * simply backed up already.
 */
const NOUNS = {
  surveys: ['סקר אחד', 'סקרים'],
  photos: ['תמונה אחת', 'תמונות'],
  quotes: ['הצעה אחת', 'הצעות'],
  reports: ['דוח אחד', 'דוחות'],
} as const

export type Counts = Partial<Record<keyof typeof NOUNS, number>>

export function countsHe(c: Counts): string {
  return (Object.keys(NOUNS) as (keyof typeof NOUNS)[])
    .filter((k) => (c[k] ?? 0) > 0)
    .map((k) => (c[k] === 1 ? NOUNS[k][0] : `${c[k]} ${NOUNS[k][1]}`))
    .join(' · ')
}
