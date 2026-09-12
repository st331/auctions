// ---------------------------------------------------------------------------
// Scanner entry point.
//
//   npm run scan -- [--out public/data] [--regions us,eu] [--concurrency 6]
//                   [--previous <url-or-dir>] [--offline-bonuses]
//
// Environment: BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET (or a .env file),
//              REGIONS, PREVIOUS_DATA_URL, SCAN_CONCURRENCY.
// ---------------------------------------------------------------------------

import fs from 'node:fs/promises'
import path from 'node:path'
import { compactBonusTable, type CompactBonusTable, type RaidbotsBonus } from '../shared/bonuses.ts'
import { CURRENT_SEASON } from '../shared/season.ts'
import type { DataIndex, RegionData } from '../shared/types.ts'
import { describeError, fetchWithRetry, getAccessToken } from './api.ts'
import { scanRegion } from './scan.ts'

const RAIDBOTS_BONUSES_URL = 'https://www.raidbots.com/static/data/live/bonuses.json'

interface CliArgs {
  out: string
  regions: string[]
  concurrency: number
  previous?: string
  offlineBonuses: boolean
}

function parseArgs(argv: string[], env: NodeJS.ProcessEnv): CliArgs {
  const args: CliArgs = {
    out: 'public/data',
    regions: (env.REGIONS ?? 'us').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean),
    concurrency: Number(env.SCAN_CONCURRENCY ?? 6) || 6,
    previous: env.PREVIOUS_DATA_URL || undefined,
    offlineBonuses: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`Missing value for ${a}`)
      return v
    }
    switch (a) {
      case '--out':
        args.out = next()
        break
      case '--regions':
        args.regions = next().split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
        break
      case '--concurrency':
        args.concurrency = Number(next()) || 6
        break
      case '--previous':
        args.previous = next()
        break
      case '--offline-bonuses':
        args.offlineBonuses = true
        break
      case '--help':
      case '-h':
        console.log('Usage: npm run scan -- [--out dir] [--regions us,eu] [--concurrency N] [--previous <url-or-dir>] [--offline-bonuses]')
        process.exit(0)
      // eslint-disable-next-line no-fallthrough
      default:
        throw new Error(`Unknown argument ${a}`)
    }
  }
  return args
}

/** Load KEY=VALUE pairs from .env into process.env (existing variables win). No dependency needed. */
async function loadDotEnv(file = '.env'): Promise<void> {
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m || !m[1]) continue
    let value = m[2] ?? ''
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
}

async function loadBonusTable(offline: boolean, log: (m: string) => void): Promise<CompactBonusTable> {
  const vendoredPath = new URL('../shared/vendor/bonuses.compact.json', import.meta.url)
  if (!offline) {
    try {
      const res = await fetchWithRetry(fetch, RAIDBOTS_BONUSES_URL, {}, { attempts: 3, timeoutMs: 60_000, log })
      const raw = (await res.json()) as Record<string, RaidbotsBonus>
      const table = compactBonusTable(raw)
      log(`bonus table: ${Object.keys(table).length} entries from Raidbots`)
      return table
    } catch (err) {
      log(`bonus table: Raidbots unavailable (${describeError(err)}), using vendored copy`)
    }
  }
  const table = JSON.parse(await fs.readFile(vendoredPath, 'utf8')) as CompactBonusTable
  log(`bonus table: ${Object.keys(table).length} entries from vendored copy`)
  return table
}

async function loadPrevious(source: string | undefined, out: string, region: string, log: (m: string) => void): Promise<RegionData | null> {
  const candidates: string[] = []
  if (source) candidates.push(source)
  candidates.push(out)
  for (const base of candidates) {
    try {
      let text: string
      if (/^https?:\/\//.test(base)) {
        const url = new URL(`${base.replace(/\/?$/, '/')}${region}.json`)
        url.searchParams.set('t', String(Date.now()))
        const res = await fetchWithRetry(fetch, url.toString(), { headers: { 'Cache-Control': 'no-cache' } }, { attempts: 2, timeoutMs: 30_000 })
        text = await res.text()
      } else {
        text = await fs.readFile(path.join(base, `${region}.json`), 'utf8')
      }
      const data = JSON.parse(text) as RegionData
      if (data && data.region === region && Array.isArray(data.auctions) && data.realms) {
        log(`[${region}] previous data from ${base}: ${data.auctions.length} auctions generated ${data.generatedAt}`)
        return data
      }
    } catch (err) {
      log(`[${region}] no previous data at ${base} (${describeError(err)})`)
    }
  }
  return null
}

async function main() {
  await loadDotEnv()
  const args = parseArgs(process.argv.slice(2), process.env)
  const log = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`)

  const clientId = process.env.BLIZZARD_CLIENT_ID ?? process.env.CLIENT_ID
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET ?? process.env.CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set (environment or .env file)')
  }

  log(`season: ${CURRENT_SEASON.name} (${CURRENT_SEASON.raid}), regions: ${args.regions.join(', ')}, out: ${args.out}`)
  await fs.mkdir(args.out, { recursive: true })

  const bonusTable = await loadBonusTable(args.offlineBonuses, log)
  const token = await getAccessToken(fetch, clientId, clientSecret, { log })
  log('access token acquired')

  const results: RegionData[] = []
  const failures: string[] = []
  for (const region of args.regions) {
    const previous = await loadPrevious(args.previous, args.out, region, log)
    try {
      const data = await scanRegion(
        { region, token, season: CURRENT_SEASON, previous, concurrency: args.concurrency },
        { fetchFn: fetch, log, now: () => new Date() },
      )
      if (data.stats && data.stats.realmsFetched + data.stats.realmsReused === 0) {
        throw new Error(`every realm failed (${data.errors?.length ?? 0} errors)`)
      }
      await fs.writeFile(path.join(args.out, `${region}.json`), JSON.stringify(data), 'utf8')
      results.push(data)
    } catch (err) {
      failures.push(`${region}: ${describeError(err)}`)
      log(`[${region}] scan FAILED: ${describeError(err)}`)
      if (previous) {
        log(`[${region}] keeping previous data`)
        await fs.writeFile(path.join(args.out, `${region}.json`), JSON.stringify(previous), 'utf8')
        results.push(previous)
      }
    }
  }

  await fs.writeFile(path.join(args.out, 'bonuses.json'), JSON.stringify(bonusTable), 'utf8')
  const index: DataIndex = {
    generatedAt: new Date().toISOString(),
    season: { id: CURRENT_SEASON.id, name: CURRENT_SEASON.name, raid: CURRENT_SEASON.raid },
    regions: results.map((r) => ({ region: r.region, generatedAt: r.generatedAt, auctions: r.auctions.length, realms: Object.keys(r.realms).length })),
  }
  await fs.writeFile(path.join(args.out, 'index.json'), JSON.stringify(index), 'utf8')
  log(`wrote ${path.join(args.out, 'index.json')} (${results.length} region(s))`)

  if (results.length === 0) {
    throw new Error(`No region could be scanned: ${failures.join('; ')}`)
  }
  if (failures.length > 0) {
    log(`WARNING: ${failures.length} region(s) failed and kept previous data: ${failures.join('; ')}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
