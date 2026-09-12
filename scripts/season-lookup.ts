// Prints ready-to-paste season.ts entries for the given item ids using Raidbots' public item dump.
//   npm run season:lookup -- 271444 271445 271638
import { type RaidbotsBonus } from '../src/shared/bonuses.ts'

const ITEMS_URL = 'https://www.raidbots.com/static/data/live/equippable-items.json'

interface RaidbotsItem {
  id: number
  name: string
  icon: string
  quality: number
  itemClass: number
  itemSubClass: number
  inventoryType: number
  itemLevel: number
  expansion?: number
  bonusLists?: number[]
}

const SLOTS: Record<number, string> = {
  1: 'Head', 2: 'Neck', 3: 'Shoulder', 4: 'Shirt', 5: 'Chest', 6: 'Waist', 7: 'Legs', 8: 'Feet', 9: 'Wrist', 10: 'Hands', 11: 'Finger', 12: 'Trinket',
  13: 'One-Hand', 14: 'Shield', 15: 'Ranged', 16: 'Back', 17: 'Two-Hand', 20: 'Chest', 21: 'Main Hand', 22: 'Off Hand', 23: 'Held In Off-hand', 25: 'Thrown', 26: 'Ranged',
}
const ARMOR: Record<number, string> = { 0: 'Jewelry', 1: 'Cloth', 2: 'Leather', 3: 'Mail', 4: 'Plate', 6: 'Shield' }

async function main() {
  const ids = process.argv.slice(2).map((v) => Number(v)).filter((n) => Number.isInteger(n))
  if (ids.length === 0) {
    console.error('Usage: npm run season:lookup -- <itemId> [itemId...]')
    process.exit(1)
  }
  console.error(`Downloading ${ITEMS_URL} (large file)…`)
  const res = await fetch(ITEMS_URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const items = (await res.json()) as RaidbotsItem[]
  const byId = new Map(items.map((i) => [i.id, i]))
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const it = byId.get(id)
    if (!it) {
      console.error(`Item ${id} not found`)
      continue
    }
    const category = it.itemClass === 2 ? 'Weapon' : (ARMOR[it.itemSubClass] ?? `Class ${it.itemClass}/${it.itemSubClass}`)
    const line = `        { id: ${it.id}, name: ${JSON.stringify(it.name)}, slot: '${SLOTS[it.inventoryType] ?? `Type ${it.inventoryType}`}', icon: '${it.icon}', baseIlvl: ${it.itemLevel} },`
    const list = groups.get(category) ?? []
    list.push(line)
    groups.set(category, list)
  }
  for (const [category, lines] of groups) {
    console.log(`    {\n      id: '${category.toLowerCase()}',\n      label: '${category}',\n      items: [\n${lines.join('\n')}\n      ],\n    },`)
  }
}

// keep the bonus type import referenced so the file stays self-describing for future extension
void (null as RaidbotsBonus | null)

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
