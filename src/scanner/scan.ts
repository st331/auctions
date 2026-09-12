// ---------------------------------------------------------------------------
// Region scan pipeline: connected realms -> auction houses -> season BoEs.
// All I/O goes through the injected fetch function so the pipeline can be
// exercised with fixtures in tests.
// ---------------------------------------------------------------------------

import { auctionsUrl, connectedRealmIndexUrl, connectedRealmUrl, extractSeasonAuctions, parseConnectedRealmId, regionConfig, tokenIndexUrl } from '../shared/blizzard.ts'
import { seasonItemIds, type SeasonConfig } from '../shared/season.ts'
import type { BlizzardAuctionsResponse, RawAuction, RealmInfo, RegionData } from '../shared/types.ts'
import { describeError, fetchJson, mapConcurrent, type FetchFn, type RetryOptions } from './api.ts'

export interface ScanDeps {
  fetchFn: FetchFn
  log: (msg: string) => void
  now: () => Date
  retry?: RetryOptions
}

export interface ScanRegionConfig {
  region: string
  token: string
  season: SeasonConfig
  /** Data from the previous scan (used for conditional requests and as a fallback). */
  previous: RegionData | null
  concurrency: number
}

interface ConnectedRealmIndexResponse {
  connected_realms?: { href: string }[]
}

interface ConnectedRealmResponse {
  id: number
  realms?: { id: number; name: string; slug: string }[]
}

interface TokenIndexResponse {
  price?: number
}

export async function scanRegion(cfg: ScanRegionConfig, deps: ScanDeps): Promise<RegionData> {
  const started = deps.now()
  const region = regionConfig(cfg.region)
  const itemIds = seasonItemIds(cfg.season)
  const retry: RetryOptions = { ...deps.retry, log: deps.log }
  const errors: string[] = []
  const log = (msg: string) => deps.log(`[${region.slug}] ${msg}`)

  // 1. Connected realm ids
  const index = await fetchJson<ConnectedRealmIndexResponse>(deps.fetchFn, connectedRealmIndexUrl(region), cfg.token, {
    ...retry,
    validate: (j) => (Array.isArray(j?.connected_realms) ? null : 'missing connected_realms'),
  })
  const crIds = (index.json?.connected_realms ?? [])
    .map((cr) => parseConnectedRealmId(cr.href))
    .filter((id): id is number => id !== null)
    .sort((a, b) => a - b)
  if (crIds.length === 0) throw new Error(`No connected realms returned for region ${region.slug}`)
  log(`${crIds.length} connected realms`)

  // 2. Realm names
  const previousRealms = cfg.previous?.realms ?? {}
  const realmInfos = await mapConcurrent(crIds, Math.max(cfg.concurrency, 4), async (crId): Promise<RealmInfo> => {
    try {
      const res = await fetchJson<ConnectedRealmResponse>(deps.fetchFn, connectedRealmUrl(region, crId), cfg.token, {
        ...retry,
        validate: (j) => (Array.isArray(j?.realms) ? null : 'missing realms'),
      })
      const realms = (res.json?.realms ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
      return { id: crId, names: realms.map((r) => r.name), slugs: realms.map((r) => r.slug) }
    } catch (err) {
      const prev = previousRealms[String(crId)]
      errors.push(`realm ${crId}: could not fetch realm names (${describeError(err)})`)
      return prev ? { id: crId, names: prev.names, slugs: prev.slugs } : { id: crId, names: [`Connected realm ${crId}`], slugs: [] }
    }
  })
  const realms: Record<string, RealmInfo> = {}
  for (const info of realmInfos) realms[String(info.id)] = info

  // 3. Auctions
  const previousByRealm = new Map<number, RawAuction[]>()
  for (const a of cfg.previous?.auctions ?? []) {
    if (!itemIds.has(a.item)) continue
    let list = previousByRealm.get(a.cr)
    if (!list) previousByRealm.set(a.cr, (list = []))
    list.push(a)
  }

  let fetched = 0
  let reused = 0
  let failed = 0
  const auctions: RawAuction[] = []
  const pad = String(crIds.length).length

  await mapConcurrent(crIds, cfg.concurrency, async (crId, i) => {
    const realm = realms[String(crId)] as RealmInfo
    const prev = previousRealms[String(crId)]
    // A realm that was scanned before (even with zero season listings) can be re-used on a 304.
    const canReuse = prev !== undefined && prev.lastModified !== undefined
    const prevAuctions = canReuse ? (previousByRealm.get(crId) ?? []) : undefined
    const label = `[${String(i + 1).padStart(pad, ' ')}/${crIds.length}] ${realm.names.join(', ')}`
    try {
      const res = await fetchJson<BlizzardAuctionsResponse>(deps.fetchFn, auctionsUrl(region, crId), cfg.token, {
        ...retry,
        ifModifiedSince: canReuse ? prev.lastModified : undefined,
        validate: (j) => (Array.isArray(j?.auctions) ? null : 'missing auctions array'),
      })
      realm.fetchedAt = deps.now().toISOString()
      if (res.status === 304 && canReuse && prevAuctions) {
        realm.lastModified = prev.lastModified
        auctions.push(...prevAuctions)
        reused++
        log(`${label}: unchanged since ${prev.lastModified}, re-used ${prevAuctions.length} auctions`)
        return
      }
      const found = extractSeasonAuctions(res.json ?? {}, crId, itemIds)
      if (res.lastModified) realm.lastModified = res.lastModified
      if ((res.json?.auctions?.length ?? 0) === 0) realm.empty = true
      auctions.push(...found)
      fetched++
      log(`${label}: ${found.length} season BoE auctions of ${res.json?.auctions?.length ?? 0}`)
    } catch (err) {
      failed++
      const reason = describeError(err)
      if (prevAuctions) {
        realm.stale = true
        realm.lastModified = prev?.lastModified
        realm.fetchedAt = prev?.fetchedAt
        auctions.push(...prevAuctions)
        errors.push(`realm ${crId} (${realm.names.join(', ')}): fetch failed, re-used previous data (${reason})`)
        log(`${label}: FAILED (${reason}); re-used ${prevAuctions.length} previous auctions`)
      } else {
        realm.stale = true
        errors.push(`realm ${crId} (${realm.names.join(', ')}): fetch failed, no data (${reason})`)
        log(`${label}: FAILED (${reason}); no previous data`)
      }
    }
  })

  // 4. WoW Token price (best effort)
  let tokenPrice: number | undefined
  try {
    const res = await fetchJson<TokenIndexResponse>(deps.fetchFn, tokenIndexUrl(region), cfg.token, { ...retry, attempts: 2 })
    if (typeof res.json?.price === 'number') tokenPrice = res.json.price
  } catch (err) {
    log(`token price unavailable (${describeError(err)})`)
  }

  auctions.sort((a, b) => a.cr - b.cr || a.buyout - b.buyout || a.id - b.id)
  const finished = deps.now()
  const data: RegionData = {
    region: region.slug,
    season: cfg.season.id,
    generatedAt: finished.toISOString(),
    realms,
    auctions,
    stats: {
      realmsTotal: crIds.length,
      realmsFetched: fetched,
      realmsReused: reused,
      realmsFailed: failed,
      durationMs: finished.getTime() - started.getTime(),
    },
  }
  if (tokenPrice !== undefined) data.tokenPrice = tokenPrice
  if (errors.length > 0) data.errors = errors
  log(`done: ${auctions.length} auctions, ${fetched} realms fetched, ${reused} unchanged, ${failed} failed, ${Math.round(data.stats!.durationMs / 1000)}s`)
  return data
}
