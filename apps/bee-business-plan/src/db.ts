import type { StartupBrief } from './types'

const DB_NAME = 'bee-business-plan'
const DB_VER = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('briefs')) {
        db.createObjectStore('briefs', { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listBriefs(): Promise<StartupBrief[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('briefs', 'readonly').objectStore('briefs').getAll()
    req.onsuccess = () => {
      const rows = (req.result as StartupBrief[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getBrief(id: string): Promise<StartupBrief | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('briefs', 'readonly').objectStore('briefs').get(id)
    req.onsuccess = () => resolve(req.result as StartupBrief | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function saveBrief(brief: StartupBrief): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('briefs', 'readwrite')
  tx.objectStore('briefs').put({ ...brief, updatedAt: new Date().toISOString() })
  await txDone(tx)
}

export async function deleteBrief(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('briefs', 'readwrite')
  tx.objectStore('briefs').delete(id)
  await txDone(tx)
}

export async function exportBackup(): Promise<object> {
  const briefs = await listBriefs()
  return {
    app: 'bee-business-plan',
    version: 1,
    exportedAt: new Date().toISOString(),
    briefs,
  }
}

export async function importBackup(data: { briefs?: StartupBrief[] }): Promise<number> {
  const briefs = Array.isArray(data.briefs) ? data.briefs : []
  const db = await openDB()
  const tx = db.transaction('briefs', 'readwrite')
  for (const b of briefs) {
    if (b && typeof b.id === 'string' && b.inputs) tx.objectStore('briefs').put(b)
  }
  await txDone(tx)
  return briefs.length
}

// ---- Device-local settings (never exported, never in hive jobs) ----

const SETTINGS_PREFIX = 'bee-business-plan:'

export function getSetting(key: string): string | null {
  try {
    return localStorage.getItem(SETTINGS_PREFIX + key)
  } catch {
    return null
  }
}

export function setSetting(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(SETTINGS_PREFIX + key)
    else localStorage.setItem(SETTINGS_PREFIX + key, value)
  } catch {
    // storage unavailable (private mode) — settings stay in memory only
  }
}
