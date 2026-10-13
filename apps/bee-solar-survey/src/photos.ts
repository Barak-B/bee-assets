import { sha256OfDataUrl } from './schema'
import type { PhotoFieldKey } from './types'

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.72

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void }

/** Decode an image file; falls back to <img> where createImageBitmap is missing (older Safari). */
async function decodeImage(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      // e.g. HEIC/unsupported in createImageBitmap but decodable by <img> — fall through
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

export async function compressImageFile(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  const img = await decodeImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img.source, 0, 0, w, h)
  img.release()
  const mimeType = 'image/jpeg'
  const dataUrl = canvas.toDataURL(mimeType, JPEG_QUALITY)
  return { dataUrl, mimeType }
}

export async function fileToSurveyPhoto(
  file: File,
  field: PhotoFieldKey,
): Promise<{ id: string; field: PhotoFieldKey; dataUrl: string; mimeType: string; sha256: string; createdAt: string }> {
  const { dataUrl, mimeType } = await compressImageFile(file)
  const sha256 = await sha256OfDataUrl(dataUrl)
  return {
    id: crypto.randomUUID(),
    field,
    dataUrl,
    mimeType,
    sha256,
    createdAt: new Date().toISOString(),
  }
}

export async function getCurrentGps(): Promise<{ gps: string; lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS לא נתמך במכשיר'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lon = Number(pos.coords.longitude.toFixed(6))
        resolve({ gps: `${lat}, ${lon}`, lat, lon })
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
