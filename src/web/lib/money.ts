// ---------------------------------------------------------------------------
// Real-money cost of a buyout: at the user's own gold price (what they pay per
// million gold) and via the WoW Token (the region's token price in gold vs. what
// Blizzard charges for a token).
// ---------------------------------------------------------------------------

import { readJson, writeJson } from './storage.ts'

export interface TokenCost {
  currency: string
  amount: number
  note: string
}

/** What Blizzard charges for one WoW Token in each region's shop. */
export const TOKEN_COST: Record<string, TokenCost> = {
  us: { currency: 'USD', amount: 20, note: 'US$20 in the Blizzard shop' },
  eu: { currency: 'EUR', amount: 20, note: '€20 in the Blizzard shop (£15 in the UK)' },
  kr: { currency: 'KRW', amount: 22000, note: '₩22,000 in the Blizzard shop' },
  tw: { currency: 'TWD', amount: 500, note: 'NT$500 in the Blizzard shop' },
}

export const GOLD_PRICE_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD'] as const

export interface GoldPrice {
  /** What the user pays per 1,000,000 gold, in `currency`; null = not set. */
  perMillion: number | null
  currency: string
}

const STORAGE_KEY = 'boe-scanner.gold-price'
export const DEFAULT_GOLD_PRICE: GoldPrice = { perMillion: null, currency: 'USD' }

export function loadGoldPrice(): GoldPrice {
  const stored = readJson<Partial<GoldPrice>>(STORAGE_KEY)
  const perMillion = typeof stored?.perMillion === 'number' && stored.perMillion > 0 ? stored.perMillion : null
  const currency = typeof stored?.currency === 'string' && /^[A-Z]{3}$/.test(stored.currency) ? stored.currency : DEFAULT_GOLD_PRICE.currency
  return { perMillion, currency }
}

export function saveGoldPrice(price: GoldPrice): void {
  writeJson(STORAGE_KEY, price)
}

export function formatMoney(amount: number, currency: string): string {
  const digits = amount < 1000 ? 2 : 0
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)
  } catch {
    return `${amount.toFixed(digits)} ${currency}`
  }
}

/** Cost of a buyout (copper) at the user's gold price, or null when no price is set. */
export function costAtGoldPrice(buyoutCopper: number, price: GoldPrice): number | null {
  if (price.perMillion === null || price.perMillion <= 0) return null
  return (buyoutCopper / 10000 / 1_000_000) * price.perMillion
}

/** Cost of a buyout (copper) if the gold were bought with WoW Tokens at the region's current token price. */
export function costViaToken(buyoutCopper: number, tokenPriceCopper: number | undefined, region: string | null): number | null {
  const cost = region ? TOKEN_COST[region] : undefined
  if (!cost || !tokenPriceCopper || tokenPriceCopper <= 0) return null
  return (buyoutCopper / tokenPriceCopper) * cost.amount
}

/** Real-money cost of 1,000,000 gold via tokens, for the summary line. */
export function tokenRatePerMillion(tokenPriceCopper: number | undefined, region: string | null): { amount: number; currency: string } | null {
  const cost = region ? TOKEN_COST[region] : undefined
  if (!cost || !tokenPriceCopper || tokenPriceCopper <= 0) return null
  return { amount: (1_000_000 / (tokenPriceCopper / 10000)) * cost.amount, currency: cost.currency }
}
