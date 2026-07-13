import type { SiteSurveyProject, SurveyPhoto } from './types'

const DB_NAME = 'bee-solar-survey'
const DB_VER = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('photos')) {
        const store = db.createObjectStore('photos', { keyPath: 'id' })
        store.createIndex('byProject', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
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

export interface StoredPhoto extends SurveyPhoto {
  projectId: string
}

export async function listProjects(): Promise<SiteSurveyProject[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly')
    const req = tx.objectStore('projects').getAll()
    req.onsuccess = () => {
      const rows = (req.result as SiteSurveyProject[]).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )
      resolve(rows)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getProject(id: string): Promise<SiteSurveyProject | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('projects', 'readonly').objectStore('projects').get(id)
    req.onsuccess = () => resolve(req.result as SiteSurveyProject | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function saveProject(project: SiteSurveyProject): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('projects', 'readwrite')
  tx.objectStore('projects').put({ ...project, updatedAt: new Date().toISOString() })
  await txDone(tx)
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(['projects', 'photos'], 'readwrite')
  tx.objectStore('projects').delete(id)
  const idx = tx.objectStore('photos').index('byProject')
  const req = idx.getAllKeys(id)
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      for (const key of req.result) tx.objectStore('photos').delete(key)
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
}

export async function listPhotos(projectId: string): Promise<StoredPhoto[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const idx = db.transaction('photos', 'readonly').objectStore('photos').index('byProject')
    const req = idx.getAll(projectId)
    req.onsuccess = () => resolve(req.result as StoredPhoto[])
    req.onerror = () => reject(req.error)
  })
}

export async function savePhoto(photo: StoredPhoto): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('photos', 'readwrite')
  tx.objectStore('photos').put(photo)
  await txDone(tx)
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('photos', 'readwrite')
  tx.objectStore('photos').delete(id)
  await txDone(tx)
}

export async function getSurveyors(): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get('surveyors')
    req.onsuccess = () => {
      const row = req.result as { key: string; value: string[] } | undefined
      resolve(row?.value ?? [])
    }
    req.onerror = () => reject(req.error)
  })
}

export async function rememberSurveyor(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await getSurveyors()
  if (existing.includes(trimmed)) return
  const db = await openDB()
  const tx = db.transaction('meta', 'readwrite')
  tx.objectStore('meta').put({ key: 'surveyors', value: [trimmed, ...existing].slice(0, 20) })
  await txDone(tx)
}

export async function exportBackup(): Promise<object> {
  const projects = await listProjects()
  const db = await openDB()
  const photos = await new Promise<StoredPhoto[]>((resolve, reject) => {
    const req = db.transaction('photos', 'readonly').objectStore('photos').getAll()
    req.onsuccess = () => resolve(req.result as StoredPhoto[])
    req.onerror = () => reject(req.error)
  })
  return {
    app: 'bee-solar-survey',
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    photos,
  }
}

export async function importBackup(data: {
  projects?: SiteSurveyProject[]
  photos?: StoredPhoto[]
}): Promise<number> {
  const projects = data.projects ?? []
  const photos = data.photos ?? []
  const db = await openDB()
  const tx = db.transaction(['projects', 'photos'], 'readwrite')
  for (const p of projects) tx.objectStore('projects').put(p)
  for (const ph of photos) tx.objectStore('photos').put(ph)
  await txDone(tx)
  return projects.length
}
