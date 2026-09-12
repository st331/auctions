// ---------------------------------------------------------------------------
// Shapes of the JSON files produced by the scanner and consumed by the site.
// ---------------------------------------------------------------------------

export type TimeLeft = 'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG'

/** One auction as stored in data/<region>.json. Keys are short to keep the file small. */
export interface RawAuction {
  /** Blizzard auction id (unique per connected realm). */
  id: number
  /** Connected realm id. */
  cr: number
  /** Item id. */
  item: number
  /** Buyout in copper. */
  buyout: number
  /** Bonus list ids. */
  b?: number[]
  /** Item modifiers that carry secondary stats: [type, value] pairs (type 29 = major, 30 = minor). */
  m?: [number, number][]
  /** Auction time left bucket. */
  tl?: TimeLeft
}

export interface RealmInfo {
  id: number
  /** Realm names in this connected-realm group. */
  names: string[]
  slugs: string[]
  /** Value of Blizzard's Last-Modified header for the auction snapshot we used. */
  lastModified?: string
  /** When the scanner fetched / re-used this realm (ISO). */
  fetchedAt?: string
  /** True if the last fetch failed and the previous scan's data was re-used. */
  stale?: boolean
  /** Blizzard's auction endpoint reported no auctions (e.g. realm down). */
  empty?: boolean
}

export interface RegionData {
  region: string
  season: string
  generatedAt: string
  /** WoW Token price in copper, if available. */
  tokenPrice?: number
  realms: Record<string, RealmInfo>
  auctions: RawAuction[]
  errors?: string[]
  stats?: {
    realmsTotal: number
    realmsFetched: number
    realmsReused: number
    realmsFailed: number
    durationMs: number
  }
}

export interface DataIndexRegion {
  region: string
  generatedAt: string
  auctions: number
  realms: number
}

export interface DataIndex {
  generatedAt: string
  season: { id: string; name: string; raid: string }
  regions: DataIndexRegion[]
}

/** Subset of Blizzard's auctions response that we rely on. */
export interface BlizzardAuction {
  id: number
  item: {
    id: number
    context?: number
    bonus_lists?: number[]
    modifiers?: { type: number; value: number }[]
  }
  buyout?: number
  bid?: number
  unit_price?: number
  quantity: number
  time_left: TimeLeft
}

export interface BlizzardAuctionsResponse {
  auctions?: BlizzardAuction[]
}
