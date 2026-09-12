// ---------------------------------------------------------------------------
// Filter model shared by the site (and its unit tests).
// ---------------------------------------------------------------------------

import type { DecodedItem } from './decode.ts'
import type { DifficultyKey } from './season.ts'
import type { RawAuction } from './types.ts'

/**
 * How the selected secondary stats are matched against an item's stats:
 *  - any:   the item has at least one of the selected stats
 *  - all:   the item has every selected stat (it may have others too)
 *  - exact: the item's stats are exactly the selected ones, nothing more
 */
export type SecondaryMode = 'any' | 'all' | 'exact'

export type SocketFilter = 'any' | 'yes' | 'no'

/** Sentinel used in `tertiaries` to mean "items without a tertiary stat". */
export const NO_TERTIARY = 0

export interface Filters {
  /** Item ids to include; null = all items of the season. */
  items: number[] | null
  /** Difficulties (upgrade tracks) to include; empty = all. */
  difficulties: DifficultyKey[]
  ilvlMin: number | null
  ilvlMax: number | null
  socket: SocketFilter
  /** Maximum buyout in gold; null = no limit. */
  maxBuyoutGold: number | null
  secondaries: number[]
  secondaryMode: SecondaryMode
  /** If set, the item's major (higher-budget) secondary must be this stat. */
  majorStat: number | null
  /** Tertiary stat ids to include (NO_TERTIARY = items without a tertiary); empty = no filter. */
  tertiaries: number[]
  /** Connected realm ids to include; null = all realms. */
  realms: number[] | null
}

export const DEFAULT_FILTERS: Filters = {
  items: null,
  difficulties: [],
  ilvlMin: null,
  ilvlMax: null,
  socket: 'any',
  maxBuyoutGold: null,
  secondaries: [],
  secondaryMode: 'any',
  majorStat: null,
  tertiaries: [],
  realms: null,
}

export interface DecodedAuction extends RawAuction {
  decoded: DecodedItem
}

export function matchesSecondaries(itemStats: readonly number[], selected: readonly number[], mode: SecondaryMode): boolean {
  if (selected.length === 0) return true
  switch (mode) {
    case 'any':
      return selected.some((s) => itemStats.includes(s))
    case 'all':
      return selected.every((s) => itemStats.includes(s))
    case 'exact': {
      if (itemStats.length !== new Set(selected).size) return false
      return selected.every((s) => itemStats.includes(s))
    }
  }
}

export function matchesFilters(a: DecodedAuction, f: Filters): boolean {
  if (f.items && !f.items.includes(a.item)) return false
  if (f.realms && !f.realms.includes(a.cr)) return false
  if (f.maxBuyoutGold !== null && a.buyout > f.maxBuyoutGold * 10000) return false

  const d = a.decoded
  if (f.difficulties.length > 0 && (!d.difficulty || !f.difficulties.includes(d.difficulty))) return false
  if (f.ilvlMin !== null && d.ilvl < f.ilvlMin) return false
  if (f.ilvlMax !== null && d.ilvl > f.ilvlMax) return false
  if (f.socket === 'yes' && !d.socket) return false
  if (f.socket === 'no' && d.socket) return false

  if (f.tertiaries.length > 0) {
    const t = d.tertiary ?? NO_TERTIARY
    if (!f.tertiaries.includes(t)) return false
  }

  if (!matchesSecondaries(d.secondaries, f.secondaries, f.secondaryMode)) return false
  if (f.majorStat !== null && d.secondaries[0] !== f.majorStat) return false

  return true
}

export function applyFilters(auctions: readonly DecodedAuction[], f: Filters): DecodedAuction[] {
  return auctions.filter((a) => matchesFilters(a, f))
}

export type SortKey = 'buyout' | 'ilvl' | 'item' | 'realm' | 'timeLeft'

export interface SortSpec {
  key: SortKey
  dir: 'asc' | 'desc'
}

const TIME_LEFT_ORDER: Record<string, number> = { SHORT: 0, MEDIUM: 1, LONG: 2, VERY_LONG: 3 }

export function sortAuctions(
  auctions: readonly DecodedAuction[],
  sort: SortSpec,
  itemName: (id: number) => string,
  realmName: (cr: number) => string,
): DecodedAuction[] {
  const mul = sort.dir === 'asc' ? 1 : -1
  const cmp = (a: DecodedAuction, b: DecodedAuction): number => {
    switch (sort.key) {
      case 'buyout':
        return a.buyout - b.buyout
      case 'ilvl':
        return a.decoded.ilvl - b.decoded.ilvl
      case 'item':
        return itemName(a.item).localeCompare(itemName(b.item))
      case 'realm':
        return realmName(a.cr).localeCompare(realmName(b.cr))
      case 'timeLeft':
        return (TIME_LEFT_ORDER[a.tl ?? 'VERY_LONG'] ?? 3) - (TIME_LEFT_ORDER[b.tl ?? 'VERY_LONG'] ?? 3)
    }
  }
  return [...auctions].sort((a, b) => {
    const primary = cmp(a, b) * mul
    if (primary !== 0) return primary
    // Stable, sensible tie-breakers: cheaper first, then higher item level.
    if (a.buyout !== b.buyout) return a.buyout - b.buyout
    if (a.decoded.ilvl !== b.decoded.ilvl) return b.decoded.ilvl - a.decoded.ilvl
    return a.id - b.id
  })
}
