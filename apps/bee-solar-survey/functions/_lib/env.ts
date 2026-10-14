/**
 * Minimal Cloudflare Pages Functions types (only what we use), so the code
 * type-checks without @cloudflare/workers-types and runs under vitest with an
 * in-memory bucket.
 */
export interface R2ObjectLike {
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
  customMetadata?: Record<string, string>
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>
  delete(key: string | string[]): Promise<void>
}

export interface Env {
  /** R2 bucket holding published quotes (binding name in wrangler.toml). */
  QUOTES: R2BucketLike
  /** Public origin for customer links, e.g. https://app.barak-e.com — never localhost. */
  PUBLIC_BASE_URL?: string
  /** Secret the app sends as `Authorization: Bearer …` to publish / revoke. */
  PUBLISH_KEY?: string
  /** Comma-separated extra origins allowed to call the API (when the app runs elsewhere). */
  ALLOWED_ORIGINS?: string
  /** "1" only for local `wrangler pages dev` — allows non-public base URLs. */
  ALLOW_LOCAL_LINKS?: string
}

export interface Ctx {
  request: Request
  env: Env
  params: Record<string, string | string[]>
  waitUntil?: (p: Promise<unknown>) => void
}

export type Handler = (ctx: Ctx) => Promise<Response>
