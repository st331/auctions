import { describe, expect, it } from 'vitest'
import { auctionsUrl, extractSeasonAuctions, parseConnectedRealmId, regionConfig, wowheadDataAttr, wowheadItemUrl } from './blizzard.ts'

describe('blizzard helpers', () => {
  it('builds namespaced urls', () => {
    expect(auctionsUrl(regionConfig('us'), 3676)).toBe('https://us.api.blizzard.com/data/wow/connected-realm/3676/auctions?namespace=dynamic-us&locale=en_US')
    expect(auctionsUrl(regionConfig('eu'), 1)).toContain('eu.api.blizzard.com')
    expect(() => regionConfig('cn')).toThrow()
  })
  it('parses connected realm ids from index hrefs', () => {
    expect(parseConnectedRealmId('https://us.api.blizzard.com/data/wow/connected-realm/3676?namespace=dynamic-us')).toBe(3676)
    expect(parseConnectedRealmId('nope')).toBeNull()
  })
  it('extracts season BoEs with a buyout only', () => {
    const items = new Set([271444])
    const out = extractSeasonAuctions(
      {
        auctions: [
          { id: 1, item: { id: 271444, bonus_lists: [12841, 41], modifiers: [{ type: 9, value: 80 }, { type: 29, value: 32 }, { type: 30, value: 36 }] }, buyout: 5000000, quantity: 1, time_left: 'LONG' },
          { id: 2, item: { id: 271444 }, bid: 100, quantity: 1, time_left: 'SHORT' },
          { id: 3, item: { id: 12345 }, buyout: 100, quantity: 1, time_left: 'SHORT' },
          { id: 4, item: { id: 271444 }, buyout: 0, quantity: 1, time_left: 'SHORT' },
        ],
      },
      3676,
      items,
    )
    expect(out).toEqual([{ id: 1, cr: 3676, item: 271444, buyout: 5000000, b: [12841, 41], m: [[29, 32], [30, 36]], tl: 'LONG' }])
    expect(extractSeasonAuctions({}, 1, items)).toEqual([])
  })
  it('builds wowhead links', () => {
    expect(wowheadItemUrl(271444, [12841, 41], [[29, 32], [30, 36]])).toBe('https://www.wowhead.com/item=271444?bonus=12841:41&crafted-stats=32:36')
    expect(wowheadItemUrl(271444, [], [], 'kr')).toBe('https://ko.wowhead.com/item=271444')
    expect(wowheadDataAttr(271444, [12841], [[29, 32]])).toBe('item=271444&bonus=12841&crafted-stats=32')
  })
})
