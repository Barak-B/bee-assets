import { sha256OfDataUrl } from './schema'
import type { PhotoFieldKey } from './types'

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.72

export async function compressImageFile(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
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
