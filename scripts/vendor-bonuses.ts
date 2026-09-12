// Downloads Raidbots' bonus table and stores the compact form as the offline fallback
// used when the scanner cannot reach raidbots.com.
//   npm run bonuses:vendor              (downloads)
//   npm run bonuses:vendor -- <file>    (uses a local bonuses.json)
import fs from 'node:fs/promises'
import path from 'node:path'
import { compactBonusTable, type RaidbotsBonus } from '../src/shared/bonuses.ts'

const RAIDBOTS_BONUSES_URL = 'https://www.raidbots.com/static/data/live/bonuses.json'

async function main() {
  const local = process.argv[2]
  let raw: Record<string, RaidbotsBonus>
  if (local) {
    raw = JSON.parse(await fs.readFile(local, 'utf8')) as Record<string, RaidbotsBonus>
  } else {
    const res = await fetch(RAIDBOTS_BONUSES_URL)
    if (!res.ok) throw new Error(`Failed to download ${RAIDBOTS_BONUSES_URL}: HTTP ${res.status}`)
    raw = (await res.json()) as Record<string, RaidbotsBonus>
  }
  const compact = compactBonusTable(raw)
  const target = path.resolve('src/shared/vendor/bonuses.compact.json')
  await fs.writeFile(target, JSON.stringify(compact), 'utf8')
  console.log(`Wrote ${Object.keys(compact).length} bonus entries to ${target}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
