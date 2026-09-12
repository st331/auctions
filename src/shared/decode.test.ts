import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { compactBonusTable, type CompactBonusTable, type RaidbotsBonus } from './bonuses.ts'
import { decodeItem, formatGold } from './decode.ts'
import { CURRENT_SEASON } from './season.ts'

const vendored = JSON.parse(fs.readFileSync(new URL('./vendor/bonuses.compact.json', import.meta.url), 'utf8')) as CompactBonusTable

describe('compactBonusTable', () => {
  it('keeps only the fields we need', () => {
    const raw: Record<string, RaidbotsBonus> = {
      '1': { id: 1, rawStats: [{ stat: 7, amount: 100, name: 'Sta' }], tag: 'Heroic' },
      '2': { id: 2, level: 0 },
      '3': { id: 3, socket: 1 },
      '4': { id: 4, upgrade: { name: 'Hero', level: 2, max: 6, itemLevel: 308 }, itemLevel: { amount: 308, priority: 0, squishEra: 2 } },
      '5': { id: 5, rawStats: [{ stat: 32, amount: 5000 }, { stat: 40, amount: 2000 }] },
      '6': { id: 6, tag: 'Mythic+' },
      '7': { id: 7, level: 20 },
    }
    const c = compactBonusTable(raw)
    expect(c['1']).toEqual({ t: 'Heroic' })
    expect(c['2']).toBeUndefined()
    expect(c['3']).toEqual({ k: 1 })
    expect(c['4']).toEqual({ s: 308, e: 2, u: ['Hero', 2, 6], ui: 308 })
    expect(c['5']).toEqual({ st: [32, 40] })
    expect(c['6']).toBeUndefined()
    expect(c['7']).toEqual({ l: 20 })
  })
})

describe('decodeItem (Midnight Season 2 raid gear)', () => {
  const item = 271444 // Pauldrons of the Forgotten Sacrifice, base ilvl 219

  it('reads item level + difficulty from the upgrade track bonus', () => {
    // 12841 = Hero 1/6 (305), 13668 = socket, 41 = Leech
    const d = decodeItem({ itemId: item, bonusIds: [12841, 13668, 41], modifiers: [[29, 32], [30, 36]], baseIlvl: 219 }, vendored)
    expect(d.ilvl).toBe(305)
    expect(d.difficulty).toBe('heroic')
    expect(d.track).toEqual({ name: 'Hero', level: 1, max: 6 })
    expect(d.socket).toBe(true)
    expect(d.tertiary).toBe(62)
    expect(d.secondaries).toEqual([32, 36])
  })

  it('orders secondaries major first regardless of modifier order', () => {
    const d = decodeItem({ itemId: item, bonusIds: [12833], modifiers: [{ type: 30, value: 49 }, { type: 29, value: 40 }], baseIlvl: 219 }, vendored)
    expect(d.secondaries).toEqual([40, 49])
    expect(d.ilvl).toBe(292)
    expect(d.difficulty).toBe('normal')
    expect(d.socket).toBe(false)
    expect(d.tertiary).toBeUndefined()
  })

  it('maps every season difficulty track', () => {
    expect(decodeItem({ itemId: item, bonusIds: [12825], baseIlvl: 219 }, vendored)).toMatchObject({ ilvl: 279, difficulty: 'lfr' })
    expect(decodeItem({ itemId: item, bonusIds: [12849], baseIlvl: 219 }, vendored)).toMatchObject({ ilvl: 318, difficulty: 'mythic' })
    expect(decodeItem({ itemId: item, bonusIds: [12854], baseIlvl: 219 }, vendored)).toMatchObject({ ilvl: 334, difficulty: 'mythic', track: { name: 'Myth', level: 6, max: 6 } })
  })

  it('falls back to stat bonus ids for secondaries on older-style items', () => {
    const d = decodeItem({ itemId: item, bonusIds: [1676, 43], baseIlvl: 219 }, vendored)
    expect(d.secondaries).toEqual([32, 40])
    expect(d.tertiary).toBe(64)
  })

  it('uses the base item level plus deltas when there is no set-level bonus', () => {
    const table: CompactBonusTable = { '100': { l: 20 }, '101': { t: 'Heroic' } }
    const d = decodeItem({ itemId: item, bonusIds: [100, 101], baseIlvl: 219 }, table)
    expect(d.ilvl).toBe(239)
    expect(d.difficulty).toBe('heroic')
  })

  it('translates set-levels from an older squish era via the upgrade item level', () => {
    const table: CompactBonusTable = { '200': { s: 714, p: 9999, e: 1, u: ['Hero', 7, 8], ui: 154 } }
    const d = decodeItem({ itemId: item, bonusIds: [200], baseIlvl: 219 }, table)
    expect(d.ilvl).toBe(154)
  })

  it('prefers the highest-priority set-level', () => {
    const table: CompactBonusTable = { '300': { s: 250, e: 2 }, '301': { s: 300, p: 100, e: 2 } }
    expect(decodeItem({ itemId: item, bonusIds: [300, 301], baseIlvl: 219 }, table).ilvl).toBe(300)
    expect(decodeItem({ itemId: item, bonusIds: [301, 300], baseIlvl: 219 }, table).ilvl).toBe(300)
  })

  it('infers difficulty from item level thresholds when no track or tag is present', () => {
    const table: CompactBonusTable = { '400': { s: 310, e: 2 } }
    expect(decodeItem({ itemId: item, bonusIds: [400], baseIlvl: 219 }, table, CURRENT_SEASON).difficulty).toBe('heroic')
    expect(decodeItem({ itemId: item, bonusIds: [], baseIlvl: 219 }, table, CURRENT_SEASON).difficulty).toBeUndefined()
  })

  it('formats gold', () => {
    expect(formatGold(1234567890)).toBe('123,456g')
    expect(formatGold(9999)).toBe('0g')
  })
})
