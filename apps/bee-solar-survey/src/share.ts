/**
 * Getting a file out of the PWA and into the surveyor's hands.
 *
 * `a.click()` on a blob URL silently does nothing in an iOS home-screen app, so
 * the order here is: Web Share API (WhatsApp / Files / Mail sheet) → open in a
 * new tab (iOS standalone fallback) → classic download link.
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'opened' | 'downloaded'

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

export function isIosStandalone(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as NavigatorWithStandalone
  const ios = /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
  return ios && standalone
}

function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

function downloadViaAnchor(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function shareOrDownload(blob: Blob, filename: string, title?: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: title ?? filename })
      return 'shared'
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled'
      // Any other failure (e.g. share target refused the type) → fall through to download
    }
  }

  const url = URL.createObjectURL(blob)
  // Revoke late enough for the browser to start the download / open the tab.
  const revoke = () => window.setTimeout(() => URL.revokeObjectURL(url), 60_000)

  if (isIosStandalone()) {
    const win = window.open(url, '_blank')
    if (win) {
      revoke()
      return 'opened'
    }
  }

  downloadViaAnchor(url, filename)
  revoke()
  return 'downloaded'
}

export async function shareOrDownloadJson(filename: string, data: unknown, title?: string, pretty = true): Promise<ShareOutcome> {
  const blob = new Blob([pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)], { type: 'application/json' })
  return shareOrDownload(blob, filename, title)
}

export function outcomeToast(outcome: ShareOutcome, what: string): string {
  switch (outcome) {
    case 'shared':
      return `${what} שותף`
    case 'cancelled':
      return 'השיתוף בוטל'
    case 'opened':
      return `${what} נפתח בלשונית חדשה — שמור משם`
    case 'downloaded':
      return `${what} הורד`
  }
}
