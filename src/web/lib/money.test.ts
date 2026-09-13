import { describe, expect, it } from 'vitest'
import { costAtGoldPrice, costViaToken, formatMoney, tokenRatePerMillion } from './money.ts'

describe('money', () => {
  it('prices a buyout at the user gold rate', () => {
    // 3,999,999g at $12 per million
    expect(costAtGoldPrice(3_999_999 * 10000, { perMillion: 12, currency: 'USD' })).toBeCloseTo(48, 3)
    expect(costAtGoldPrice(500_000 * 10000, { perMillion: 8.5, currency: 'EUR' })).toBeCloseTo(4.25, 6)
    expect(costAtGoldPrice(500_000 * 10000, { perMillion: null, currency: 'USD' })).toBeNull()
  })
  it('prices a buyout via the WoW Token', () => {
    // 570,000g when a token sells for 285,000g and costs €20 -> 2 tokens -> €40
    expect(costViaToken(570_000 * 10000, 285_000 * 10000, 'eu')).toBeCloseTo(40, 6)
    expect(costViaToken(570_000 * 10000, 285_000 * 10000, 'us')).toBeCloseTo(40, 6)
    expect(costViaToken(570_000 * 10000, undefined, 'eu')).toBeNull()
    expect(costViaToken(570_000 * 10000, 285_000 * 10000, null)).toBeNull()
    expect(tokenRatePerMillion(285_000 * 10000, 'eu')).toEqual({ amount: (1_000_000 / 285_000) * 20, currency: 'EUR' })
  })
  it('formats money', () => {
    expect(formatMoney(48, 'USD')).toMatch(/48\.00/)
    expect(formatMoney(1234.5, 'USD')).toMatch(/1,?235|1\.?235/)
  })
})
