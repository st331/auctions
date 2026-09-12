// ---------------------------------------------------------------------------
// Browser-side Blizzard API access used for real-time verification.
//
// The Blizzard OAuth token endpoint and the Game Data API both allow
// cross-origin requests, so the browser can talk to them directly. The
// site owner's API client id/secret are stored in this browser only
// (localStorage) and are sent to Blizzard exclusively.
// ---------------------------------------------------------------------------

import { OAUTH_TOKEN_URL, auctionsUrl, basicAuthHeader, regionConfig } from '../../shared/blizzard.ts'
import type { BlizzardAuctionsResponse } from '../../shared/types.ts'
import { readJson, remove, writeJson } from './storage.ts'

const CREDENTIALS_KEY = 'boe-scanner.blizzard-credentials'
const TOKEN_KEY = 'boe-scanner.blizzard-token'

export interface Credentials {
  clientId: string
  clientSecret: string
}

interface CachedToken {
  accessToken: string
  expiresAt: number
}

export function loadCredentials(): Credentials | null {
  const c = readJson<Credentials>(CREDENTIALS_KEY)
  return c && c.clientId && c.clientSecret ? c : null
}

export function saveCredentials(c: Credentials): void {
  writeJson(CREDENTIALS_KEY, { clientId: c.clientId.trim(), clientSecret: c.clientSecret.trim() })
  remove(TOKEN_KEY)
}

export function clearCredentials(): void {
  remove(CREDENTIALS_KEY)
  remove(TOKEN_KEY)
}

export class VerifyError extends Error {
  constructor(
    message: string,
    public readonly kind: 'credentials' | 'network' | 'http' | 'unknown',
  ) {
    super(message)
    this.name = 'VerifyError'
  }
}

function describeNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `Could not reach Blizzard (${msg}). Check your connection, ad blockers or privacy extensions.`
}

export async function getAccessToken(creds: Credentials, force = false): Promise<string> {
  const cached = readJson<CachedToken>(TOKEN_KEY)
  if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken

  let res: Response
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(creds.clientId, creds.clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
  } catch (err) {
    throw new VerifyError(describeNetworkError(err), 'network')
  }
  if (res.status === 401 || res.status === 403) {
    throw new VerifyError('Blizzard rejected the client id / secret. Check them in Settings.', 'credentials')
  }
  if (!res.ok) throw new VerifyError(`Blizzard token request failed with HTTP ${res.status}.`, 'http')
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new VerifyError('Blizzard returned no access token.', 'unknown')
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
  writeJson(TOKEN_KEY, { accessToken: json.access_token, expiresAt: Date.now() + expiresIn * 1000 } satisfies CachedToken)
  return json.access_token
}

export interface RealmSnapshot {
  response: BlizzardAuctionsResponse
  /** Blizzard's snapshot time for this realm's auction house, if the header was exposed. */
  lastModified?: string
  fetchedAt: Date
}

/** Download the current auction house snapshot of one connected realm. */
export async function fetchRealmAuctions(region: string, connectedRealmId: number, creds: Credentials): Promise<RealmSnapshot> {
  const url = auctionsUrl(regionConfig(region), connectedRealmId)
  let token = await getAccessToken(creds)
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    } catch (err) {
      throw new VerifyError(describeNetworkError(err), 'network')
    }
    if (res.status === 401 && attempt === 0) {
      token = await getAccessToken(creds, true)
      continue
    }
    if (res.status === 401 || res.status === 403) throw new VerifyError('Blizzard rejected the access token. Check your credentials in Settings.', 'credentials')
    if (res.status === 404) throw new VerifyError('Blizzard has no auction data for this realm right now (HTTP 404).', 'http')
    if (!res.ok) throw new VerifyError(`Blizzard returned HTTP ${res.status}.`, 'http')
    const response = (await res.json()) as BlizzardAuctionsResponse
    return { response, lastModified: res.headers.get('last-modified') ?? undefined, fetchedAt: new Date() }
  }
  throw new VerifyError('Verification failed.', 'unknown')
}

/** Quick credential check used by the settings dialog. */
export async function testCredentials(creds: Credentials): Promise<void> {
  await getAccessToken(creds, true)
}
