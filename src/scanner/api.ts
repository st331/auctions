// ---------------------------------------------------------------------------
// Minimal Blizzard API client for the scanner: OAuth client-credentials token,
// retrying JSON fetch with timeouts and conditional (If-Modified-Since) requests.
// ---------------------------------------------------------------------------

import { OAUTH_TOKEN_URL, basicAuthHeader } from '../shared/blizzard.ts'

export type FetchFn = typeof fetch

export interface RetryOptions {
  attempts?: number
  timeoutMs?: number
  /** Base delay for exponential backoff (ms). */
  baseDelayMs?: number
  log?: (msg: string) => void
  sleep?: (ms: number) => Promise<void>
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`)
    this.name = 'HttpError'
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status <= 599)
}

/**
 * Fetch with retries for network errors, timeouts, 429 and 5xx responses.
 * Non-retryable HTTP errors are thrown as HttpError immediately.
 */
export async function fetchWithRetry(fetchFn: FetchFn, url: string, init: RequestInit = {}, opts: RetryOptions = {}): Promise<Response> {
  const attempts = opts.attempts ?? 5
  const timeoutMs = opts.timeoutMs ?? 90_000
  const baseDelay = opts.baseDelayMs ?? 1000
  const sleep = opts.sleep ?? defaultSleep
  const log = opts.log ?? (() => {})

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchFn(url, { ...init, signal: controller.signal })
      if (res.ok || res.status === 304) return res
      if (!isRetryableStatus(res.status)) {
        throw new HttpError(res.status, url)
      }
      lastError = new HttpError(res.status, url)
      const retryAfter = Number(res.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : backoff(baseDelay, attempt)
      log(`HTTP ${res.status} for ${url} (attempt ${attempt}/${attempts}), retrying in ${Math.round(delay)}ms`)
      if (attempt < attempts) await sleep(delay)
    } catch (err) {
      if (err instanceof HttpError) throw err
      lastError = err
      const delay = backoff(baseDelay, attempt)
      log(`${describeError(err)} for ${url} (attempt ${attempt}/${attempts}), retrying in ${Math.round(delay)}ms`)
      if (attempt < attempts) await sleep(delay)
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}: ${String(lastError)}`)
}

function backoff(base: number, attempt: number): number {
  return base * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5)
}

export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Timeout'
    const cause = (err as { cause?: { code?: string; message?: string } }).cause
    return cause?.code ? `${err.message} (${cause.code})` : err.message
  }
  return String(err)
}

export interface JsonResult<T> {
  status: number
  json?: T
  lastModified?: string
}

/**
 * GET a JSON resource. When `ifModifiedSince` is given the request is conditional and a
 * 304 result is returned without a body. Malformed JSON bodies are retried like network errors.
 */
export async function fetchJson<T>(
  fetchFn: FetchFn,
  url: string,
  token: string,
  opts: RetryOptions & { ifModifiedSince?: string; validate?: (json: T) => string | null } = {},
): Promise<JsonResult<T>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  if (opts.ifModifiedSince) headers['If-Modified-Since'] = opts.ifModifiedSince

  const attempts = opts.attempts ?? 5
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetchWithRetry(fetchFn, url, { method: 'GET', headers }, { ...opts, attempts: attempts - attempt + 1 })
    if (res.status === 304) return { status: 304, lastModified: opts.ifModifiedSince }
    try {
      const json = (await res.json()) as T
      const problem = opts.validate ? opts.validate(json) : null
      if (problem) throw new Error(problem)
      return { status: res.status, json, lastModified: res.headers.get('last-modified') ?? undefined }
    } catch (err) {
      lastError = err
      opts.log?.(`Bad response body for ${url} (attempt ${attempt}/${attempts}): ${describeError(err)}`)
      if (attempt < attempts) await (opts.sleep ?? defaultSleep)(backoff(opts.baseDelayMs ?? 1000, attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export async function getAccessToken(fetchFn: FetchFn, clientId: string, clientSecret: string, opts: RetryOptions = {}): Promise<string> {
  const res = await fetchWithRetry(
    fetchFn,
    OAUTH_TOKEN_URL,
    {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    },
    { ...opts, timeoutMs: opts.timeoutMs ?? 30_000 },
  )
  const json = (await res.json()) as Partial<TokenResponse>
  if (!json.access_token) throw new Error('OAuth response did not include an access_token')
  return json.access_token
}

/** Run `worker` over `items` with at most `concurrency` in flight. Results keep input order. */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i] as T, i)
    }
  })
  await Promise.all(runners)
  return results
}
