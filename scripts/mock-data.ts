// Generates realistic-looking sample data in public/data so the site can be developed
// and demoed without Blizzard API credentials:  npm run mock-data
import fs from 'node:fs/promises'
import path from 'node:path'
import { CURRENT_SEASON, seasonItems } from '../src/shared/season.ts'
import type { DataIndex, RawAuction, RegionData, TimeLeft } from '../src/shared/types.ts'

const REALMS = [
  ['Illidan'], ['Area 52'], ['Stormrage'], ['Tichondrius'], ['Mal\'Ganis'], ['Zul\'jin'], ['Bleeding Hollow'], ['Sargeras'], ['Thrall'], ['Frostmourne'],
  ['Kilrogg', 'Winterhoof'], ['Aegwynn', 'Bonechewer', 'Daggerspine', 'Gurubashi', 'Hakkar'], ['Proudmoore'], ['Moon Guard'], ['Wyrmrest Accord'],
  ['Dalaran'], ['Emerald Dream'], ['Hyjal'], ['Barthilas'], ['Kel\'Thuzad'], ['Turalyon'], ['Lightbringer'], ['Ysera', 'Durotan'], ['Malfurion', 'Trollbane'],
  ['Azralon'], ['Nemesis'], ['Ragnaros'], ['Quel\'Thalas'], ['Goldrinn'], ['Gallywix'],
]

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const TRACKS: Record<string, number[]> = {
  // upgrade bonus ids for each difficulty track, levels 1..6 (Midnight Season 2)
  lfr: [12825, 12826, 12827, 12828, 12829, 12830],
  normal: [12833, 12834, 12835, 12836, 12837, 12838],
  heroic: [12841, 12842, 12843, 12844, 12845, 12846],
  mythic: [12849, 12850, 12851, 12852, 12853, 12854],
}
const SOCKET = 13668
const TERTIARIES = [40, 41, 42, 43]
const STATS = [32, 36, 40, 49]
const TIME_LEFT: TimeLeft[] = ['SHORT', 'MEDIUM', 'LONG', 'VERY_LONG']

async function main() {
  const out = process.argv[2] ?? 'public/data'
  const random = rng(20260912)
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)] as T
  const items = seasonItems(CURRENT_SEASON)
  const now = new Date()

  const realms: RegionData['realms'] = {}
  REALMS.forEach((names, i) => {
    const id = 1000 + i * 7
    realms[String(id)] = {
      id,
      names,
      slugs: names.map((n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      lastModified: new Date(now.getTime() - Math.floor(random() * 55) * 60_000).toUTCString(),
      fetchedAt: now.toISOString(),
    }
  })

  const auctions: RawAuction[] = []
  let nextId = 500_000
  for (const realm of Object.values(realms)) {
    const count = 8 + Math.floor(random() * 30)
    for (let i = 0; i < count; i++) {
      const item = pick(items)
      const r = random()
      const diff = r < 0.15 ? 'lfr' : r < 0.55 ? 'normal' : r < 0.9 ? 'heroic' : 'mythic'
      const track = TRACKS[diff] as number[]
      const level = random() < 0.8 ? 0 : Math.floor(random() * 6)
      const bonus: number[] = [track[level] as number]
      if (random() < 0.15) bonus.push(SOCKET)
      if (random() < 0.12) bonus.push(pick(TERTIARIES))
      const major = pick(STATS)
      let minor = pick(STATS)
      while (minor === major) minor = pick(STATS)
      const baseGold = { lfr: 8_000, normal: 25_000, heroic: 90_000, mythic: 400_000 }[diff]
      const gold = Math.round(baseGold * (0.5 + random() * 3) * (bonus.includes(SOCKET) ? 1.5 : 1))
      auctions.push({ id: nextId++, cr: realm.id, item: item.id, buyout: gold * 10000, b: bonus, m: [[29, major], [30, minor]], tl: pick(TIME_LEFT) })
    }
  }
  auctions.sort((a, b) => a.cr - b.cr || a.buyout - b.buyout)

  const region: RegionData = {
    region: 'us',
    season: CURRENT_SEASON.id,
    generatedAt: now.toISOString(),
    tokenPrice: 285_000 * 10000,
    realms,
    auctions,
    stats: { realmsTotal: REALMS.length, realmsFetched: REALMS.length, realmsReused: 0, realmsFailed: 0, durationMs: 42_000 },
  }
  const index: DataIndex = {
    generatedAt: now.toISOString(),
    season: { id: CURRENT_SEASON.id, name: CURRENT_SEASON.name, raid: CURRENT_SEASON.raid },
    regions: [{ region: 'us', generatedAt: now.toISOString(), auctions: auctions.length, realms: REALMS.length }],
  }
  await fs.mkdir(out, { recursive: true })
  await fs.writeFile(path.join(out, 'us.json'), JSON.stringify(region), 'utf8')
  await fs.writeFile(path.join(out, 'index.json'), JSON.stringify(index), 'utf8')
  await fs.copyFile(new URL('../src/shared/vendor/bonuses.compact.json', import.meta.url), path.join(out, 'bonuses.json'))
  console.log(`Wrote mock data for ${REALMS.length} realms / ${auctions.length} auctions to ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
