import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, NO_TERTIARY, applyFilters, matchesFilters, matchesSecondaries, sortAuctions, type DecodedAuction, type Filters } from './filters.ts'

const CRIT = 32
const HASTE = 36
const VERS = 40
const MASTERY = 49
const LEECH = 62
const SPEED = 61

function auction(over: Omit<Partial<DecodedAuction>, 'decoded'> & { decoded?: Partial<DecodedAuction['decoded']> } = {}): DecodedAuction {
  const { decoded, ...rest } = over
  return {
    id: 1,
    cr: 10,
    item: 271444,
    buyout: 100 * 10000,
    ...rest,
    decoded: { ilvl: 305, socket: false, secondaries: [CRIT, HASTE], ...decoded },
  }
}

describe('matchesSecondaries', () => {
  const critHaste = [CRIT, HASTE]
  it('any: at least one wanted stat present', () => {
    expect(matchesSecondaries(critHaste, [CRIT], 'any')).toBe(true)
    expect(matchesSecondaries(critHaste, [VERS], 'any')).toBe(false)
    expect(matchesSecondaries(critHaste, [VERS, HASTE], 'any')).toBe(true)
  })
  it('all: every wanted stat present', () => {
    expect(matchesSecondaries(critHaste, [CRIT], 'all')).toBe(true)
    expect(matchesSecondaries(critHaste, [CRIT, HASTE], 'all')).toBe(true)
    expect(matchesSecondaries(critHaste, [CRIT, VERS], 'all')).toBe(false)
  })
  it('excluded stats must be absent', () => {
    expect(matchesSecondaries(critHaste, [], 'any', [VERS])).toBe(true)
    expect(matchesSecondaries(critHaste, [], 'any', [HASTE])).toBe(false)
    expect(matchesSecondaries(critHaste, [CRIT], 'any', [HASTE])).toBe(false)
    expect(matchesSecondaries([CRIT, MASTERY], [CRIT], 'any', [HASTE, VERS])).toBe(true)
  })
  it('"exactly crit and haste" = want both + exclude the rest', () => {
    expect(matchesSecondaries(critHaste, [CRIT, HASTE], 'all', [MASTERY, VERS])).toBe(true)
    expect(matchesSecondaries([CRIT, MASTERY], [CRIT, HASTE], 'all', [MASTERY, VERS])).toBe(false)
  })
  it('no selection matches everything', () => {
    expect(matchesSecondaries(critHaste, [], 'any')).toBe(true)
    expect(matchesSecondaries([], [], 'all')).toBe(true)
  })
})

describe('matchesFilters', () => {
  const f = (over: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...over })

  it('accepts everything with default filters', () => {
    expect(matchesFilters(auction(), DEFAULT_FILTERS)).toBe(true)
  })
  it('filters by item and realm', () => {
    expect(matchesFilters(auction(), f({ items: [271445] }))).toBe(false)
    expect(matchesFilters(auction(), f({ items: [271444, 271445] }))).toBe(true)
    expect(matchesFilters(auction(), f({ realms: [11] }))).toBe(false)
    expect(matchesFilters(auction(), f({ realms: [10] }))).toBe(true)
  })
  it('filters by max buyout in gold', () => {
    expect(matchesFilters(auction({ buyout: 1500 * 10000 }), f({ maxBuyoutGold: 1000 }))).toBe(false)
    expect(matchesFilters(auction({ buyout: 1000 * 10000 }), f({ maxBuyoutGold: 1000 }))).toBe(true)
  })
  it('filters by item level range', () => {
    expect(matchesFilters(auction(), f({ ilvlMin: 306 }))).toBe(false)
    expect(matchesFilters(auction(), f({ ilvlMin: 305, ilvlMax: 305 }))).toBe(true)
    expect(matchesFilters(auction(), f({ ilvlMax: 304 }))).toBe(false)
  })
  it('filters by difficulty (multi-select)', () => {
    const heroic = auction({ decoded: { difficulty: 'heroic' } })
    const mythic = auction({ decoded: { difficulty: 'mythic' } })
    const unknown = auction()
    expect(matchesFilters(heroic, f({ difficulties: ['heroic'] }))).toBe(true)
    expect(matchesFilters(mythic, f({ difficulties: ['heroic'] }))).toBe(false)
    expect(matchesFilters(mythic, f({ difficulties: ['heroic', 'mythic'] }))).toBe(true)
    expect(matchesFilters(unknown, f({ difficulties: ['heroic'] }))).toBe(false)
    expect(matchesFilters(unknown, f({ difficulties: [] }))).toBe(true)
  })
  it('filters by socket', () => {
    expect(matchesFilters(auction(), f({ socket: 'yes' }))).toBe(false)
    expect(matchesFilters(auction(), f({ socket: 'no' }))).toBe(true)
    expect(matchesFilters(auction({ decoded: { socket: true } }), f({ socket: 'yes' }))).toBe(true)
    expect(matchesFilters(auction({ decoded: { socket: true } }), f({ socket: 'no' }))).toBe(false)
  })
  it('filters by tertiary including "none"', () => {
    const leech = auction({ decoded: { tertiary: LEECH } })
    expect(matchesFilters(leech, f({ tertiaries: [LEECH] }))).toBe(true)
    expect(matchesFilters(leech, f({ tertiaries: [SPEED] }))).toBe(false)
    expect(matchesFilters(leech, f({ tertiaries: [SPEED, LEECH] }))).toBe(true)
    expect(matchesFilters(auction(), f({ tertiaries: [LEECH] }))).toBe(false)
    expect(matchesFilters(auction(), f({ tertiaries: [NO_TERTIARY] }))).toBe(true)
    expect(matchesFilters(leech, f({ tertiaries: [NO_TERTIARY] }))).toBe(false)
  })
  it('expresses "rings with crit", "crit and haste", "just crit", "no vers" and "crit as the major stat"', () => {
    const critHaste = auction({ decoded: { secondaries: [CRIT, HASTE] } })
    const hasteCrit = auction({ decoded: { secondaries: [HASTE, CRIT] } })
    const critVers = auction({ decoded: { secondaries: [CRIT, VERS] } })
    const versMastery = auction({ decoded: { secondaries: [VERS, MASTERY] } })
    const all = [critHaste, hasteCrit, critVers, versMastery]

    // "all rings that have crit on them"
    expect(all.map((a) => matchesFilters(a, f({ secondaries: [CRIT] })))).toEqual([true, true, true, false])
    // "all rings with crit and haste"
    expect(all.map((a) => matchesFilters(a, f({ secondaries: [CRIT, HASTE], secondaryMode: 'all' })))).toEqual([true, true, false, false])
    // "rings with crit but never vers"
    expect(all.map((a) => matchesFilters(a, f({ secondaries: [CRIT], excludedSecondaries: [VERS] })))).toEqual([true, true, false, false])
    // "just crit and haste, nothing else"
    expect(all.map((a) => matchesFilters(a, f({ secondaries: [CRIT, HASTE], secondaryMode: 'all', excludedSecondaries: [MASTERY, VERS] })))).toEqual([true, true, false, false])
    // "crit is the item's major stat"
    expect(all.map((a) => matchesFilters(a, f({ majorStat: CRIT })))).toEqual([true, false, true, false])
    // combination: crit major, haste wanted, vers excluded
    expect(all.map((a) => matchesFilters(a, f({ secondaries: [HASTE], majorStat: CRIT, excludedSecondaries: [VERS] })))).toEqual([true, false, false, false])
  })
})

describe('sortAuctions', () => {
  const a1 = auction({ id: 1, buyout: 300 * 10000, decoded: { ilvl: 292 } })
  const a2 = auction({ id: 2, buyout: 100 * 10000, decoded: { ilvl: 305 } })
  const a3 = auction({ id: 3, buyout: 100 * 10000, decoded: { ilvl: 318 } })
  const names = () => 'x'
  it('sorts by buyout ascending with higher ilvl breaking ties', () => {
    expect(sortAuctions([a1, a2, a3], { key: 'buyout', dir: 'asc' }, names, names).map((a) => a.id)).toEqual([3, 2, 1])
  })
  it('sorts by ilvl descending', () => {
    expect(sortAuctions([a1, a2, a3], { key: 'ilvl', dir: 'desc' }, names, names).map((a) => a.id)).toEqual([3, 2, 1])
    expect(sortAuctions([a1, a2, a3], { key: 'ilvl', dir: 'asc' }, names, names).map((a) => a.id)).toEqual([1, 2, 3])
  })
  it('applyFilters keeps order', () => {
    expect(applyFilters([a1, a2, a3], { ...DEFAULT_FILTERS, ilvlMin: 300 }).map((a) => a.id)).toEqual([2, 3])
  })
})
