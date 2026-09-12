// ---------------------------------------------------------------------------
// Decode an auctioned item (item id + bonus ids + modifiers) into the
// properties the site filters on: item level, difficulty / upgrade track,
// socket, tertiary stat and the two secondary stats (major first).
// ---------------------------------------------------------------------------

import { SECONDARY_STAT_IDS, STAT_IDS, TERTIARY_STAT_IDS, type CompactBonusTable } from './bonuses.ts'
import { CURRENT_SEASON, difficultyForIlvl, difficultyForTrack, type DifficultyKey, type SeasonConfig } from './season.ts'

/** Item modifier types that carry the item's secondary stats (see warcraft.wiki.gg/wiki/ItemLink). */
export const MODIFIER_STAT_MAJOR = 29
export const MODIFIER_STAT_MINOR = 30

export interface StatInfo {
  id: number
  label: string
  short: string
}

export const SECONDARY_STATS: readonly StatInfo[] = [
  { id: STAT_IDS.CRIT, label: 'Critical Strike', short: 'Crit' },
  { id: STAT_IDS.HASTE, label: 'Haste', short: 'Haste' },
  { id: STAT_IDS.MASTERY, label: 'Mastery', short: 'Mastery' },
  { id: STAT_IDS.VERS, label: 'Versatility', short: 'Vers' },
]

export const TERTIARY_STATS: readonly StatInfo[] = [
  { id: STAT_IDS.LEECH, label: 'Leech', short: 'Leech' },
  { id: STAT_IDS.AVOIDANCE, label: 'Avoidance', short: 'Avoid' },
  { id: STAT_IDS.SPEED, label: 'Speed', short: 'Speed' },
  { id: STAT_IDS.INDESTRUCTIBLE, label: 'Indestructible', short: 'Indestr.' },
]

const STAT_BY_ID = new Map<number, StatInfo>([...SECONDARY_STATS, ...TERTIARY_STATS].map((s) => [s.id, s]))

export function statLabel(id: number, short = false): string {
  const s = STAT_BY_ID.get(id)
  return s ? (short ? s.short : s.label) : `Stat ${id}`
}

export interface UpgradeTrack {
  name: string
  level: number
  max: number
}

export interface DecodedItem {
  ilvl: number
  track?: UpgradeTrack
  difficulty?: DifficultyKey
  socket: boolean
  tertiary?: number
  /** Secondary stat ids, major stat first. */
  secondaries: number[]
}

export interface DecodeInput {
  itemId: number
  bonusIds?: readonly number[]
  /** [type, value] pairs, or Blizzard's {type, value} objects. */
  modifiers?: readonly (readonly [number, number] | { type: number; value: number })[]
  baseIlvl?: number
}

function modifierPair(m: readonly [number, number] | { type: number; value: number }): [number, number] {
  return Array.isArray(m) ? [m[0], m[1]] : [(m as { type: number }).type, (m as { value: number }).value]
}

export function decodeItem(input: DecodeInput, table: CompactBonusTable, season: SeasonConfig = CURRENT_SEASON): DecodedItem {
  const bonusIds = input.bonusIds ?? []

  let setIlvl: number | undefined
  let setPriority = -Infinity
  let delta = 0
  let track: UpgradeTrack | undefined
  let tag: string | undefined
  let socket = false
  let tertiary: number | undefined
  let bonusSecondaries: number[] | undefined

  for (const id of bonusIds) {
    const b = table[String(id)]
    if (!b) continue
    if (b.l) delta += b.l
    if (b.s !== undefined) {
      const priority = b.p ?? 0
      // Set-levels from an older squish era are expressed in old numbers; the upgrade
      // step's item level (ui) is always in current-era numbers.
      const sameEra = b.e === undefined || b.e === season.squishEra
      const value = sameEra ? b.s : (b.ui ?? b.s)
      if (priority >= setPriority) {
        setPriority = priority
        setIlvl = value
      }
    }
    if (b.u) track = { name: b.u[0], level: b.u[1], max: b.u[2] }
    if (b.t && !tag) tag = b.t
    if (b.k) socket = true
    if (b.st) {
      const tert = b.st.find((s) => TERTIARY_STAT_IDS.includes(s))
      if (tert !== undefined && tertiary === undefined) tertiary = tert
      const secs = b.st.filter((s) => SECONDARY_STAT_IDS.includes(s))
      if (secs.length > 0 && !bonusSecondaries) bonusSecondaries = secs
    }
  }

  const base = setIlvl ?? input.baseIlvl ?? 0
  const ilvl = base + delta

  // Secondary stats: modern raid gear encodes them as item modifiers 29 (major) and 30 (minor).
  const modSecondaries: { type: number; value: number }[] = []
  for (const m of input.modifiers ?? []) {
    const [type, value] = modifierPair(m)
    if ((type === MODIFIER_STAT_MAJOR || type === MODIFIER_STAT_MINOR) && SECONDARY_STAT_IDS.includes(value)) {
      modSecondaries.push({ type, value })
    }
  }
  modSecondaries.sort((a, b) => a.type - b.type)
  const secondaries = dedupe(modSecondaries.length > 0 ? modSecondaries.map((m) => m.value) : (bonusSecondaries ?? []))

  let difficulty: DifficultyKey | undefined = difficultyForTrack(track?.name, season)?.key
  if (!difficulty && tag) difficulty = difficultyFromTag(tag)
  if (!difficulty && ilvl > 0) difficulty = difficultyForIlvl(ilvl, season)?.key

  const out: DecodedItem = { ilvl, socket, secondaries }
  if (track) out.track = track
  if (difficulty) out.difficulty = difficulty
  if (tertiary !== undefined) out.tertiary = tertiary
  return out
}

function difficultyFromTag(tag: string): DifficultyKey | undefined {
  switch (tag) {
    case 'Raid Finder':
      return 'lfr'
    case 'Normal':
      return 'normal'
    case 'Heroic':
      return 'heroic'
    case 'Mythic':
      return 'mythic'
    default:
      return undefined
  }
}

function dedupe(values: number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** Gold value (floored) of an amount in copper. */
export function copperToGold(copper: number): number {
  return Math.floor(copper / 10000)
}

export function formatGold(copper: number): string {
  return `${copperToGold(copper).toLocaleString('en-US')}g`
}
