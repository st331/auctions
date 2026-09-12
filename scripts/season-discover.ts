// Finds candidate raid BoE item ids for a new season by scanning one region's auction houses
// for raid-context items that are not in the current season list.
//   npm run season:discover -- [region] [minItemId]
// Needs BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET in the environment or .env.
import fs from 'node:fs/promises'
import { auctionsUrl, connectedRealmIndexUrl, parseConnectedRealmId, regionConfig } from '../src/shared/blizzard.ts'
import { CURRENT_SEASON, seasonItemIds } from '../src/shared/season.ts'
import type { BlizzardAuctionsResponse } from '../src/shared/types.ts'
import { fetchJson, getAccessToken, mapConcurrent } from '../src/scanner/api.ts'

const RAID_CONTEXTS = new Set([3, 4, 5, 6, 82, 83, 84, 85, 89, 90, 91, 92, 93, 94, 95, 96])

async function loadDotEnv() {
  try {
    for (const line of (await fs.readFile('.env', 'utf8')).split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
      if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env */
  }
}

async function main() {
  await loadDotEnv()
  const region = regionConfig(process.argv[2] ?? 'us')
  const known = seasonItemIds(CURRENT_SEASON)
  const minId = Number(process.argv[3] ?? Math.max(...known))
  const clientId = process.env.BLIZZARD_CLIENT_ID ?? process.env.CLIENT_ID
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET ?? process.env.CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET are required')
  const log = (m: string) => console.error(m)
  const token = await getAccessToken(fetch, clientId, clientSecret, { log })

  const index = await fetchJson<{ connected_realms?: { href: string }[] }>(fetch, connectedRealmIndexUrl(region), token, { log })
  const crIds = (index.json?.connected_realms ?? []).map((c) => parseConnectedRealmId(c.href)).filter((n): n is number => n !== null)
  log(`Scanning ${crIds.length} connected realms in ${region.slug} for raid items with id > ${minId}…`)

  const found = new Map<number, { count: number; contexts: Set<number>; bonus: Set<string> }>()
  await mapConcurrent(crIds, 6, async (cr) => {
    try {
      const res = await fetchJson<BlizzardAuctionsResponse>(fetch, auctionsUrl(region, cr), token, { log, validate: (j) => (Array.isArray(j?.auctions) ? null : 'missing auctions') })
      for (const a of res.json?.auctions ?? []) {
        const id = a.item?.id
        if (!id || known.has(id) || id <= minId) continue
        if (!RAID_CONTEXTS.has(a.item.context ?? -1)) continue
        if (!a.item.bonus_lists || a.item.bonus_lists.length === 0) continue
        const entry = found.get(id) ?? { count: 0, contexts: new Set<number>(), bonus: new Set<string>() }
        entry.count++
        entry.contexts.add(a.item.context ?? -1)
        entry.bonus.add(a.item.bonus_lists.join(':'))
        found.set(id, entry)
      }
    } catch (err) {
      log(`realm ${cr} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  const rows = [...found.entries()].sort((a, b) => b[1].count - a[1].count)
  if (rows.length === 0) {
    console.log('No new raid-context items found.')
    return
  }
  console.log('itemId\tlistings\tcontexts\texample bonus ids')
  for (const [id, e] of rows) console.log(`${id}\t${e.count}\t${[...e.contexts].join(',')}\t${[...e.bonus][0] ?? ''}`)
  console.log(`\nLook them up on Wowhead (https://www.wowhead.com/item=<id>) to confirm they are BoE, then run: npm run season:lookup -- ${rows.slice(0, 20).map(([id]) => id).join(' ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
