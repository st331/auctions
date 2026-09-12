// ---------------------------------------------------------------------------
// Compact item-bonus table.
//
// Blizzard describes item variations (item level, upgrade track, sockets,
// tertiary stats, difficulty tags, ...) through "bonus ids" attached to each
// auction. Raidbots publishes a decoded dump of all bonus ids at
// https://www.raidbots.com/static/data/live/bonuses.json. We keep only the
// fields we need in a compact form that is small enough to ship to the browser.
// ---------------------------------------------------------------------------

/** Raidbots bonus entry (only the fields we read). */
export interface RaidbotsBonus {
  id: number
  level?: number
  itemLevel?: { amount: number; priority?: number; squishEra?: number }
  upgrade?: { name?: string; level?: number; max?: number; itemLevel?: number; fullName?: string; seasonId?: number }
  tag?: string
  socket?: number
  rawStats?: { stat: number; amount: number; name?: string }[]
}

export interface CompactBonus {
  /** Item level delta. */
  l?: number
  /** Absolute ("set") item level. */
  s?: number
  /** Priority of the set item level (highest wins). */
  p?: number
  /** Squish era the set item level is expressed in. */
  e?: number
  /** Upgrade track: [name, level, max]. */
  u?: [string, number, number]
  /** Item level of the upgrade step, in the current era. */
  ui?: number
  /** Difficulty tag, e.g. "Heroic". */
  t?: string
  /** Adds a socket. */
  k?: 1
  /** Stat ids granted by this bonus (secondary or tertiary), in the order Blizzard lists them. */
  st?: number[]
}

export type CompactBonusTable = Record<string, CompactBonus>

export const STAT_IDS = {
  CRIT: 32,
  HASTE: 36,
  VERS: 40,
  MASTERY: 49,
  SPEED: 61,
  LEECH: 62,
  AVOIDANCE: 63,
  INDESTRUCTIBLE: 64,
} as const

export const SECONDARY_STAT_IDS: readonly number[] = [STAT_IDS.CRIT, STAT_IDS.HASTE, STAT_IDS.MASTERY, STAT_IDS.VERS]
export const TERTIARY_STAT_IDS: readonly number[] = [STAT_IDS.LEECH, STAT_IDS.AVOIDANCE, STAT_IDS.SPEED, STAT_IDS.INDESTRUCTIBLE]

const DIFFICULTY_TAG = /^(Fated )?(Raid Finder|Normal|Heroic|Mythic)$/

const INTERESTING_STATS = new Set<number>([...SECONDARY_STAT_IDS, ...TERTIARY_STAT_IDS])

/** Convert Raidbots' full dump into the compact table used by the scanner and the site. */
export function compactBonusTable(raw: Record<string, RaidbotsBonus> | RaidbotsBonus[]): CompactBonusTable {
  const out: CompactBonusTable = {}
  const entries = Array.isArray(raw) ? raw : Object.values(raw)
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'number') continue
    const c: CompactBonus = {}
    if (typeof entry.level === 'number' && entry.level !== 0) c.l = entry.level
    if (entry.itemLevel && typeof entry.itemLevel.amount === 'number') {
      c.s = entry.itemLevel.amount
      if (typeof entry.itemLevel.priority === 'number' && entry.itemLevel.priority !== 0) c.p = entry.itemLevel.priority
      if (typeof entry.itemLevel.squishEra === 'number') c.e = entry.itemLevel.squishEra
    }
    if (entry.upgrade && typeof entry.upgrade.name === 'string') {
      c.u = [entry.upgrade.name, entry.upgrade.level ?? 0, entry.upgrade.max ?? 0]
      if (typeof entry.upgrade.itemLevel === 'number') c.ui = entry.upgrade.itemLevel
    }
    if (typeof entry.tag === 'string' && DIFFICULTY_TAG.test(entry.tag)) c.t = entry.tag.replace(/^Fated /, '')
    if (entry.socket) c.k = 1
    if (Array.isArray(entry.rawStats)) {
      const stats = entry.rawStats.filter((s) => INTERESTING_STATS.has(s.stat)).map((s) => s.stat)
      if (stats.length > 0) c.st = stats
    }
    if (Object.keys(c).length > 0) out[String(entry.id)] = c
  }
  return out
}
