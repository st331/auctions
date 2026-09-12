// ---------------------------------------------------------------------------
// Blizzard Game Data API helpers shared by the scanner (Node) and the site
// (browser, for real-time verification).
// ---------------------------------------------------------------------------

import { MODIFIER_STAT_MAJOR, MODIFIER_STAT_MINOR } from './decode.ts'
import type { BlizzardAuctionsResponse, RawAuction } from './types.ts'

export interface RegionConfig {
  slug: string
  label: string
  host: string
  locale: string
}

export const REGIONS: Record<string, RegionConfig> = {
  us: { slug: 'us', label: 'Americas & Oceania', host: 'https://us.api.blizzard.com', locale: 'en_US' },
  eu: { slug: 'eu', label: 'Europe', host: 'https://eu.api.blizzard.com', locale: 'en_GB' },
  kr: { slug: 'kr', label: 'Korea', host: 'https://kr.api.blizzard.com', locale: 'ko_KR' },
  tw: { slug: 'tw', label: 'Taiwan', host: 'https://tw.api.blizzard.com', locale: 'zh_TW' },
}

export const OAUTH_TOKEN_URL = 'https://oauth.battle.net/token'

export function regionConfig(slug: string): RegionConfig {
  const r = REGIONS[slug]
  if (!r) throw new Error(`Unknown region "${slug}" (expected one of ${Object.keys(REGIONS).join(', ')})`)
  return r
}

export function apiUrl(region: RegionConfig, path: string, namespace: 'dynamic' | 'static' = 'dynamic'): string {
  const url = new URL(region.host + path)
  url.searchParams.set('namespace', `${namespace}-${region.slug}`)
  url.searchParams.set('locale', region.locale)
  return url.toString()
}

export function connectedRealmIndexUrl(region: RegionConfig): string {
  return apiUrl(region, '/data/wow/connected-realm/index')
}

export function connectedRealmUrl(region: RegionConfig, id: number): string {
  return apiUrl(region, `/data/wow/connected-realm/${id}`)
}

export function auctionsUrl(region: RegionConfig, connectedRealmId: number): string {
  return apiUrl(region, `/data/wow/connected-realm/${connectedRealmId}/auctions`)
}

export function tokenIndexUrl(region: RegionConfig): string {
  return apiUrl(region, '/data/wow/token/index')
}

/** Parse the connected realm id out of an index href such as ".../connected-realm/3676?namespace=dynamic-us". */
export function parseConnectedRealmId(href: string): number | null {
  const m = /\/connected-realm\/(\d+)/.exec(href)
  return m && m[1] ? Number(m[1]) : null
}

/**
 * Reduce a full auction house dump to the season's BoE auctions that can be bought out.
 * Bid-only auctions are ignored because they cannot be purchased immediately.
 */
export function extractSeasonAuctions(
  response: BlizzardAuctionsResponse,
  connectedRealmId: number,
  itemIds: ReadonlySet<number>,
): RawAuction[] {
  const out: RawAuction[] = []
  for (const a of response.auctions ?? []) {
    if (!a || !a.item || !itemIds.has(a.item.id)) continue
    const buyout = typeof a.buyout === 'number' ? a.buyout : 0
    if (buyout <= 0) continue
    const raw: RawAuction = { id: a.id, cr: connectedRealmId, item: a.item.id, buyout }
    if (a.item.bonus_lists && a.item.bonus_lists.length > 0) raw.b = [...a.item.bonus_lists]
    const mods = (a.item.modifiers ?? [])
      .filter((m) => m.type === MODIFIER_STAT_MAJOR || m.type === MODIFIER_STAT_MINOR)
      .map((m): [number, number] => [m.type, m.value])
    if (mods.length > 0) raw.m = mods
    if (a.time_left) raw.tl = a.time_left
    out.push(raw)
  }
  return out
}

/** Encode client credentials for the OAuth Basic header. Works in Node and browsers. */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`
  const b64 = typeof btoa === 'function' ? btoa(raw) : Buffer.from(raw, 'utf8').toString('base64')
  return `Basic ${b64}`
}

/** Wowhead item link with bonus ids and modified crafting stats so the tooltip shows the exact variant. */
export function wowheadItemUrl(itemId: number, bonusIds?: readonly number[], modifiers?: readonly (readonly [number, number])[], region?: string): string {
  const domain = region === 'kr' ? 'ko' : region === 'tw' ? 'tw' : 'www'
  const params: string[] = []
  if (bonusIds && bonusIds.length > 0) params.push(`bonus=${bonusIds.join(':')}`)
  const stats = (modifiers ?? []).filter((m) => m[0] === MODIFIER_STAT_MAJOR || m[0] === MODIFIER_STAT_MINOR).map((m) => m[1])
  if (stats.length > 0) params.push(`crafted-stats=${stats.join(':')}`)
  return `https://${domain}.wowhead.com/item=${itemId}${params.length ? `?${params.join('&')}` : ''}`
}

/** Value for Wowhead's data-wowhead attribute (same content as the URL query, & separated). */
export function wowheadDataAttr(itemId: number, bonusIds?: readonly number[], modifiers?: readonly (readonly [number, number])[]): string {
  const parts = [`item=${itemId}`]
  if (bonusIds && bonusIds.length > 0) parts.push(`bonus=${bonusIds.join(':')}`)
  const stats = (modifiers ?? []).filter((m) => m[0] === MODIFIER_STAT_MAJOR || m[0] === MODIFIER_STAT_MINOR).map((m) => m[1])
  if (stats.length > 0) parts.push(`crafted-stats=${stats.join(':')}`)
  return parts.join('&')
}

/**
 * Undermine Exchange page for an item on a realm. Their router reads
 * `#<region>-<realm slug>/<item id>[-<item level>]`; any realm of a connected-realm group
 * selects that group's auction house, and the item level picks the exact variant.
 */
export function undermineExchangeUrl(region: string, realmSlug: string, itemId: number, itemLevel?: number): string {
  const variant = itemLevel && itemLevel > 0 ? `-${itemLevel}` : ''
  return `https://undermine.exchange/#${region.toLowerCase()}-${realmSlug}/${itemId}${variant}`
}
