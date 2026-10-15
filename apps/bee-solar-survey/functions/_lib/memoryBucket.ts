/** In-memory R2 stand-in for the Functions tests (never bundled into a route). */
import type { R2BucketLike, R2ListResult, R2ObjectLike } from './env'

export class MemoryBucket implements R2BucketLike {
  store = new Map<string, { data: Uint8Array; meta?: Record<string, string>; uploaded: Date }>()
  async get(key: string): Promise<R2ObjectLike | null> {
    const v = this.store.get(key)
    if (!v) return null
    return {
      text: async () => new TextDecoder().decode(v.data),
      arrayBuffer: async () => v.data.slice().buffer,
      customMetadata: v.meta,
    }
  }
  async head(key: string) {
    const v = this.store.get(key)
    return v ? { key, size: v.data.byteLength } : null
  }
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}): Promise<R2ListResult> {
    const keys = [...this.store.keys()].filter((k) => k.startsWith(opts.prefix ?? '')).sort()
    const from = opts.cursor ? Number(opts.cursor) : 0
    const limit = opts.limit ?? 1000
    const page = keys.slice(from, from + limit)
    const truncated = from + limit < keys.length
    return {
      objects: page.map((key) => {
        const v = this.store.get(key)!
        return { key, size: v.data.byteLength, uploaded: v.uploaded, customMetadata: v.meta }
      }),
      truncated,
      cursor: truncated ? String(from + limit) : undefined,
    }
  }
  async put(key: string, value: string | ArrayBuffer | Uint8Array, opts?: { customMetadata?: Record<string, string> }) {
    const data = typeof value === 'string' ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value)
    this.store.set(key, { data, meta: opts?.customMetadata, uploaded: new Date() })
  }
  async delete(key: string | string[]) {
    for (const k of Array.isArray(key) ? key : [key]) this.store.delete(k)
  }
}
