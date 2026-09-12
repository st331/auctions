// ---------------------------------------------------------------------------
// View state (region, filters, sort) <-> URL query string / localStorage.
// The URL is the source of truth when it carries parameters, so filtered
// views can be bookmarked and shared; otherwise the last used state is restored.
// ---------------------------------------------------------------------------

import { DEFAULT_FILTERS, type Filters, type SecondaryMode, type SortKey, type SortSpec } from '../../shared/filters.ts'
import { SECONDARY_STATS, TERTIARY_STATS } from '../../shared/decode.ts'
import { CURRENT_SEASON, seasonItemIds, type DifficultyKey } from '../../shared/season.ts'
import { readJson, writeJson } from '../lib/storage.ts'

export interface ViewState {
  region: string | null
  filters: Filters
  sort: SortSpec
}

export const DEFAULT_SORT: SortSpec = { key: 'buyout', dir: 'asc' }

const STORAGE_KEY = 'boe-scanner.view'
const SORT_KEYS: SortKey[] = ['buyout', 'ilvl', 'item', 'realm', 'timeLeft']
const MODES: SecondaryMode[] = ['any', 'all', 'exact']
const SECONDARY_IDS = SECONDARY_STATS.map((s) => s.id)
const TERTIARY_IDS = TERTIARY_STATS.map((s) => s.id)
const DIFFICULTY_KEYS = CURRENT_SEASON.difficulties.map((d) => d.key)

function numList(value: string | null, valid?: ReadonlySet<number> | readonly number[]): number[] {
  if (!value) return []
  const validSet = valid ? new Set(valid) : null
  return value
    .split(',')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && (!validSet || validSet.has(n)))
}

export function parseQuery(search: string): Partial<ViewState> {
  const q = new URLSearchParams(search)
  if ([...q.keys()].length === 0) return {}
  const f: Filters = { ...DEFAULT_FILTERS }
  const items = numList(q.get('items'), seasonItemIds(CURRENT_SEASON))
  f.items = items.length > 0 ? items : null
  f.difficulties = (q.get('diff') ?? '')
    .split(',')
    .filter((d): d is DifficultyKey => (DIFFICULTY_KEYS as string[]).includes(d))
  const ilvl = /^(\d*)-(\d*)$/.exec(q.get('ilvl') ?? '')
  if (ilvl) {
    f.ilvlMin = ilvl[1] ? Number(ilvl[1]) : null
    f.ilvlMax = ilvl[2] ? Number(ilvl[2]) : null
  }
  const socket = q.get('socket')
  if (socket === 'yes' || socket === 'no') f.socket = socket
  const max = Number(q.get('max'))
  if (q.get('max') && Number.isFinite(max) && max > 0) f.maxBuyoutGold = max
  f.secondaries = numList(q.get('sec'), SECONDARY_IDS)
  const mode = q.get('mode')
  if (mode && (MODES as string[]).includes(mode)) f.secondaryMode = mode as SecondaryMode
  const major = Number(q.get('major'))
  if (q.get('major') && SECONDARY_IDS.includes(major)) f.majorStat = major
  f.tertiaries = numList(q.get('tert'), [...TERTIARY_IDS, 0])
  const realms = numList(q.get('realms'))
  f.realms = realms.length > 0 ? realms : null

  const state: Partial<ViewState> = { filters: f }
  const region = q.get('region')
  if (region) state.region = region.toLowerCase()
  const sort = /^(\w+):(asc|desc)$/.exec(q.get('sort') ?? '')
  if (sort && (SORT_KEYS as string[]).includes(sort[1] ?? '')) state.sort = { key: sort[1] as SortKey, dir: sort[2] as 'asc' | 'desc' }
  return state
}

export function toQuery(state: ViewState): string {
  const q = new URLSearchParams()
  const f = state.filters
  if (state.region) q.set('region', state.region)
  if (f.items) q.set('items', f.items.join(','))
  if (f.difficulties.length) q.set('diff', f.difficulties.join(','))
  if (f.ilvlMin !== null || f.ilvlMax !== null) q.set('ilvl', `${f.ilvlMin ?? ''}-${f.ilvlMax ?? ''}`)
  if (f.socket !== 'any') q.set('socket', f.socket)
  if (f.maxBuyoutGold !== null) q.set('max', String(f.maxBuyoutGold))
  if (f.secondaries.length) q.set('sec', f.secondaries.join(','))
  if (f.secondaryMode !== 'any') q.set('mode', f.secondaryMode)
  if (f.majorStat !== null) q.set('major', String(f.majorStat))
  if (f.tertiaries.length) q.set('tert', f.tertiaries.join(','))
  if (f.realms) q.set('realms', f.realms.join(','))
  if (state.sort.key !== DEFAULT_SORT.key || state.sort.dir !== DEFAULT_SORT.dir) q.set('sort', `${state.sort.key}:${state.sort.dir}`)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function loadInitialState(): ViewState {
  const fromUrl = parseQuery(window.location.search)
  const stored = readJson<Partial<ViewState>>(STORAGE_KEY)
  const base: ViewState = { region: null, filters: { ...DEFAULT_FILTERS }, sort: DEFAULT_SORT }
  const merged: ViewState = {
    region: fromUrl.region ?? stored?.region ?? base.region,
    filters: { ...base.filters, ...(fromUrl.filters ?? stored?.filters ?? {}) },
    sort: fromUrl.sort ?? stored?.sort ?? base.sort,
  }
  // Drop stale item selections from a previous season.
  if (merged.filters.items) {
    const valid = seasonItemIds(CURRENT_SEASON)
    const items = merged.filters.items.filter((id) => valid.has(id))
    merged.filters.items = items.length > 0 ? items : null
  }
  return merged
}

export function persistState(state: ViewState): void {
  writeJson(STORAGE_KEY, state)
  const query = toQuery(state)
  const url = `${window.location.pathname}${query}${window.location.hash}`
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', url)
  }
}
