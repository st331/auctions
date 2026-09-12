import { decodeItem } from '../../shared/decode.ts'
import type { CompactBonusTable } from '../../shared/bonuses.ts'
import type { DecodedAuction } from '../../shared/filters.ts'
import { CURRENT_SEASON, seasonItemMap } from '../../shared/season.ts'
import type { DataIndex, RawAuction, RegionData } from '../../shared/types.ts'

const ITEM_MAP = seasonItemMap(CURRENT_SEASON)

function dataUrl(file: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`
  return `${base}data/${file}?t=${Math.floor(Date.now() / 60_000)}`
}

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file), { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Could not load ${file} (HTTP ${res.status}). Has the scan workflow run yet?`)
  return (await res.json()) as T
}

export const loadIndex = () => getJson<DataIndex>('index.json')
export const loadBonusTable = () => getJson<CompactBonusTable>('bonuses.json')
export const loadRegion = (region: string) => getJson<RegionData>(`${region}.json`)

export function decodeAuctions(raw: readonly RawAuction[], table: CompactBonusTable): DecodedAuction[] {
  return raw.map((a) => ({
    ...a,
    decoded: decodeItem({ itemId: a.item, bonusIds: a.b, modifiers: a.m, baseIlvl: ITEM_MAP.get(a.item)?.baseIlvl }, table, CURRENT_SEASON),
  }))
}

export function itemName(id: number): string {
  return ITEM_MAP.get(id)?.name ?? `Item ${id}`
}

export function itemIconUrl(id: number): string | undefined {
  const icon = ITEM_MAP.get(id)?.icon
  return icon ? `https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg` : undefined
}

export function realmLabel(data: RegionData | null, cr: number): string {
  const realm = data?.realms[String(cr)]
  if (!realm) return `Realm ${cr}`
  return realm.names.join(' / ')
}

export function formatRelative(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'unknown'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Math.max(0, now - t)
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${min % 60} min ago`
  return `${Math.floor(h / 24)} d ago`
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
}
