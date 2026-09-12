// ---------------------------------------------------------------------------
// Current season configuration.
//
// Only the items listed here are kept by the scanner and shown on the site.
// When a new raid tier / season starts, replace this file (see README:
// "Updating for a new season"). `npm run season:lookup -- <itemId...>` prints
// ready-to-paste entries using Raidbots' public item data, and
// `npm run season:discover` scans one region's auction houses for new raid BoEs.
// ---------------------------------------------------------------------------

export type DifficultyKey = 'lfr' | 'normal' | 'heroic' | 'mythic'

export interface DifficultyConfig {
  key: DifficultyKey
  label: string
  /** Upgrade track name used by Blizzard for drops of this difficulty (e.g. "Hero"). */
  track: string
  /** Item level at which this difficulty drops (track level 1). */
  ilvl: number
}

export interface SeasonItem {
  id: number
  name: string
  /** Inventory slot label shown in the UI. */
  slot: string
  /** Wowhead icon name (https://wow.zamimg.com/images/wow/icons/large/<icon>.jpg). */
  icon: string
  /** Base item level of the item template (used only when no upgrade/set-level bonus is present). */
  baseIlvl: number
}

export interface SeasonCategory {
  id: string
  label: string
  items: SeasonItem[]
}

export interface SeasonConfig {
  id: string
  name: string
  raid: string
  patch: string
  /** Blizzard's item level "squish era" for this expansion; used to interpret set-level bonuses. */
  squishEra: number
  difficulties: DifficultyConfig[]
  categories: SeasonCategory[]
}

export const CURRENT_SEASON: SeasonConfig = {
  id: 'midnight-s2',
  name: 'Midnight Season 2',
  raid: 'The Venomous Abyss',
  patch: '12.1',
  squishEra: 2,
  difficulties: [
    { key: 'lfr', label: 'Raid Finder', track: 'Veteran', ilvl: 279 },
    { key: 'normal', label: 'Normal', track: 'Champion', ilvl: 292 },
    { key: 'heroic', label: 'Heroic', track: 'Hero', ilvl: 305 },
    { key: 'mythic', label: 'Mythic', track: 'Myth', ilvl: 318 },
  ],
  categories: [
    {
      id: 'plate',
      label: 'Plate',
      items: [
        { id: 271444, name: 'Pauldrons of the Forgotten Sacrifice', slot: 'Shoulder', icon: 'inv_shoulder_plate_raiddeathknightulatek_d_01', baseIlvl: 219 },
        { id: 271445, name: "Fanged Brute's Greatbelt", slot: 'Waist', icon: 'inv_belt_plate_raidwarriorulatek_d_01', baseIlvl: 219 },
      ],
    },
    {
      id: 'mail',
      label: 'Mail',
      items: [
        { id: 271441, name: 'Crushing Coiler Coif', slot: 'Head', icon: 'inv_helm_mail_raidhunterulatek_d_01', baseIlvl: 219 },
        { id: 271440, name: 'Greaves of the Noxious Depths', slot: 'Feet', icon: 'inv_boot_mail_raidshamanulatek_d_01', baseIlvl: 219 },
      ],
    },
    {
      id: 'leather',
      label: 'Leather',
      items: [
        { id: 271438, name: "Temple Delver's Mystic Helm", slot: 'Head', icon: 'inv_helm_leather_raidmonkulatek_d_01', baseIlvl: 219 },
        { id: 271436, name: 'Slitherscale Girdle', slot: 'Waist', icon: 'inv_belt_leather_raiddemonhunterulatek_d_01', baseIlvl: 219 },
      ],
    },
    {
      id: 'cloth',
      label: 'Cloth',
      items: [
        { id: 271434, name: 'Venom Rite Mantle', slot: 'Shoulder', icon: 'inv_shoulder_cloth_raidpriestulatek_d_01', baseIlvl: 219 },
        { id: 271435, name: 'Slippers of the Hissing Cult', slot: 'Feet', icon: 'inv_boot_cloth_raidwarlockulatek_d_01', baseIlvl: 219 },
      ],
    },
    {
      id: 'jewelry',
      label: 'Jewelry',
      items: [
        { id: 271638, name: "Bound Serpent's Jade Eye", slot: 'Neck', icon: 'inv_121_jewelry_neck01_green', baseIlvl: 219 },
      ],
    },
  ],
}

/** All items of the season, in category order. */
export function seasonItems(season: SeasonConfig = CURRENT_SEASON): SeasonItem[] {
  return season.categories.flatMap((c) => c.items)
}

/** Item id -> item lookup. */
export function seasonItemMap(season: SeasonConfig = CURRENT_SEASON): Map<number, SeasonItem & { category: SeasonCategory }> {
  const map = new Map<number, SeasonItem & { category: SeasonCategory }>()
  for (const category of season.categories) {
    for (const item of category.items) {
      map.set(item.id, { ...item, category })
    }
  }
  return map
}

export function seasonItemIds(season: SeasonConfig = CURRENT_SEASON): Set<number> {
  return new Set(seasonItems(season).map((i) => i.id))
}

export function difficultyForTrack(track: string | undefined, season: SeasonConfig = CURRENT_SEASON): DifficultyConfig | undefined {
  if (!track) return undefined
  return season.difficulties.find((d) => d.track.toLowerCase() === track.toLowerCase())
}

/** Highest difficulty whose drop item level is <= the given item level. */
export function difficultyForIlvl(ilvl: number, season: SeasonConfig = CURRENT_SEASON): DifficultyConfig | undefined {
  let best: DifficultyConfig | undefined
  for (const d of season.difficulties) {
    if (ilvl >= d.ilvl && (!best || d.ilvl > best.ilvl)) best = d
  }
  return best
}

export type BonusTrackInfo = Record<string, { u?: [string, number, number]; ui?: number }>

/**
 * Item levels reachable on each difficulty's upgrade track this season (every upgrade step,
 * read from the bonus table), sorted ascending. Steps far above the top difficulty belong to
 * a later season and are ignored.
 */
export function seasonTrackLevels(table: BonusTrackInfo, season: SeasonConfig = CURRENT_SEASON): Record<DifficultyKey, number[]> {
  const lowest = Math.min(...season.difficulties.map((d) => d.ilvl))
  const ceiling = Math.max(...season.difficulties.map((d) => d.ilvl)) + 20
  const out = {} as Record<DifficultyKey, number[]>
  for (const d of season.difficulties) {
    const levels = new Set<number>([d.ilvl])
    for (const b of Object.values(table)) {
      if (b.u && b.ui !== undefined && b.u[0].toLowerCase() === d.track.toLowerCase() && b.ui >= lowest && b.ui <= ceiling) levels.add(b.ui)
    }
    out[d.key] = [...levels].sort((a, b) => a - b)
  }
  return out
}

/**
 * Item levels that gear of this season can have: the union of all difficulty tracks plus any
 * levels observed in the data (inside the season's range). Sorted ascending.
 */
export function seasonItemLevels(table: BonusTrackInfo, observed: Iterable<number> = [], season: SeasonConfig = CURRENT_SEASON): number[] {
  const lowest = Math.min(...season.difficulties.map((d) => d.ilvl))
  const ceiling = Math.max(...season.difficulties.map((d) => d.ilvl)) + 20
  const levels = new Set<number>()
  for (const list of Object.values(seasonTrackLevels(table, season))) for (const l of list) levels.add(l)
  for (const ilvl of observed) if (ilvl >= lowest && ilvl <= ceiling) levels.add(ilvl)
  return [...levels].sort((a, b) => a - b)
}
