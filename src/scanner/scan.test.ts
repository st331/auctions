import { describe, expect, it } from 'vitest'
import { CURRENT_SEASON } from '../shared/season.ts'
import type { RegionData } from '../shared/types.ts'
import { HttpError, fetchWithRetry, mapConcurrent } from './api.ts'
import { scanRegion } from './scan.ts'

const LAST_MOD_1 = 'Sat, 12 Sep 2026 05:00:00 GMT'
const LAST_MOD_2 = 'Sat, 12 Sep 2026 05:30:00 GMT'

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } })
}

interface FakeOptions {
  realm1Status?: number
  realm1Failures?: number
}

/** A fake Blizzard API with two connected realms. */
function fakeApi(opts: FakeOptions = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  let realm1Failures = opts.realm1Failures ?? 0
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    calls.push({ url, headers })
    if (url.startsWith('https://oauth.battle.net/token')) return jsonResponse({ access_token: 'tok', token_type: 'bearer', expires_in: 86399 })
    if (url.includes('/connected-realm/index')) {
      return jsonResponse({ connected_realms: [{ href: 'https://us.api.blizzard.com/data/wow/connected-realm/2?namespace=dynamic-us' }, { href: 'https://us.api.blizzard.com/data/wow/connected-realm/1?namespace=dynamic-us' }] })
    }
    if (/\/connected-realm\/1\?/.test(url)) return jsonResponse({ id: 1, realms: [{ id: 1, name: 'Illidan', slug: 'illidan' }] })
    if (/\/connected-realm\/2\?/.test(url)) return jsonResponse({ id: 2, realms: [{ id: 3, name: 'Winterhoof', slug: 'winterhoof' }, { id: 2, name: 'Kilrogg', slug: 'kilrogg' }] })
    if (url.includes('/connected-realm/1/auctions')) {
      if (realm1Failures > 0) {
        realm1Failures--
        return new Response('upstream error', { status: 503 })
      }
      if (opts.realm1Status && opts.realm1Status !== 200) return new Response('nope', { status: opts.realm1Status })
      return jsonResponse(
        {
          auctions: [
            { id: 11, item: { id: 271444, bonus_lists: [12841, 13668], modifiers: [{ type: 29, value: 32 }, { type: 30, value: 36 }] }, buyout: 12_000_000, quantity: 1, time_left: 'VERY_LONG' },
            { id: 12, item: { id: 271444, bonus_lists: [12833] }, bid: 1000, quantity: 1, time_left: 'SHORT' },
            { id: 13, item: { id: 999999 }, buyout: 5, quantity: 1, time_left: 'SHORT' },
            { id: 14, item: { id: 271638, bonus_lists: [12849, 41], modifiers: [{ type: 29, value: 49 }, { type: 30, value: 40 }] }, buyout: 50_000_000, quantity: 1, time_left: 'LONG' },
          ],
        },
        { headers: { 'last-modified': LAST_MOD_1 } },
      )
    }
    if (url.includes('/connected-realm/2/auctions')) {
      if (headers['if-modified-since'] === LAST_MOD_2) return new Response(null, { status: 304 })
      return jsonResponse({ auctions: [{ id: 21, item: { id: 271435, bonus_lists: [12825] }, buyout: 3_000_000, quantity: 1, time_left: 'MEDIUM' }] }, { headers: { 'last-modified': LAST_MOD_2 } })
    }
    if (url.includes('/token/index')) return jsonResponse({ price: 2_500_000 })
    return new Response('not found', { status: 404 })
  }
  return { fetchFn, calls }
}

const deps = (fetchFn: typeof fetch) => ({ fetchFn, log: () => {}, now: () => new Date('2026-09-12T06:00:00Z'), retry: { attempts: 3, sleep: async () => {} } })

describe('scanRegion', () => {
  it('scans every connected realm and keeps only season BoEs with a buyout', async () => {
    const api = fakeApi()
    const data = await scanRegion({ region: 'us', token: 'tok', season: CURRENT_SEASON, previous: null, concurrency: 2 }, deps(api.fetchFn))
    expect(data.region).toBe('us')
    expect(data.season).toBe(CURRENT_SEASON.id)
    expect(Object.keys(data.realms)).toEqual(['1', '2'])
    expect(data.realms['2']).toMatchObject({ id: 2, names: ['Kilrogg', 'Winterhoof'], slugs: ['kilrogg', 'winterhoof'], lastModified: LAST_MOD_2 })
    expect(data.auctions).toEqual([
      { id: 11, cr: 1, item: 271444, buyout: 12_000_000, b: [12841, 13668], m: [[29, 32], [30, 36]], tl: 'VERY_LONG' },
      { id: 14, cr: 1, item: 271638, buyout: 50_000_000, b: [12849, 41], m: [[29, 49], [30, 40]], tl: 'LONG' },
      { id: 21, cr: 2, item: 271435, buyout: 3_000_000, b: [12825], tl: 'MEDIUM' },
    ])
    expect(data.tokenPrice).toBe(2_500_000)
    expect(data.stats).toMatchObject({ realmsTotal: 2, realmsFetched: 2, realmsReused: 0, realmsFailed: 0 })
    expect(data.errors).toBeUndefined()
    // no conditional requests without previous data
    expect(api.calls.filter((c) => c.headers['if-modified-since']).length).toBe(0)
  })

  it('re-uses unchanged realms via If-Modified-Since', async () => {
    const api = fakeApi()
    const previous: RegionData = {
      region: 'us',
      season: CURRENT_SEASON.id,
      generatedAt: '2026-09-12T05:40:00Z',
      realms: {
        '1': { id: 1, names: ['Illidan'], slugs: ['illidan'], lastModified: 'Sat, 12 Sep 2026 04:00:00 GMT' },
        '2': { id: 2, names: ['Kilrogg', 'Winterhoof'], slugs: ['kilrogg', 'winterhoof'], lastModified: LAST_MOD_2, fetchedAt: '2026-09-12T05:40:00Z' },
      },
      auctions: [
        { id: 21, cr: 2, item: 271435, buyout: 3_000_000, b: [12825], tl: 'MEDIUM' },
        { id: 22, cr: 2, item: 123, buyout: 1, tl: 'MEDIUM' }, // item no longer in the season -> dropped
      ],
    }
    const data = await scanRegion({ region: 'us', token: 'tok', season: CURRENT_SEASON, previous, concurrency: 2 }, deps(api.fetchFn))
    expect(data.stats).toMatchObject({ realmsFetched: 1, realmsReused: 1, realmsFailed: 0 })
    expect(data.auctions.filter((a) => a.cr === 2)).toEqual([{ id: 21, cr: 2, item: 271435, buyout: 3_000_000, b: [12825], tl: 'MEDIUM' }])
    expect(data.realms['2']).toMatchObject({ lastModified: LAST_MOD_2, fetchedAt: '2026-09-12T06:00:00.000Z' })
    expect(data.realms['2']?.stale).toBeUndefined()
    const realm1 = api.calls.find((c) => c.url.includes('/connected-realm/1/auctions'))
    expect(realm1?.headers['if-modified-since']).toBe('Sat, 12 Sep 2026 04:00:00 GMT')
  })

  it('retries transient failures', async () => {
    const api = fakeApi({ realm1Failures: 2 })
    const data = await scanRegion({ region: 'us', token: 'tok', season: CURRENT_SEASON, previous: null, concurrency: 1 }, deps(api.fetchFn))
    expect(data.stats).toMatchObject({ realmsFetched: 2, realmsFailed: 0 })
    expect(data.auctions.length).toBe(3)
  })

  it('falls back to previous data for a realm that keeps failing and records the error', async () => {
    const api = fakeApi({ realm1Status: 404 })
    const previous: RegionData = {
      region: 'us',
      season: CURRENT_SEASON.id,
      generatedAt: '2026-09-12T05:40:00Z',
      realms: { '1': { id: 1, names: ['Illidan'], slugs: ['illidan'], lastModified: 'Sat, 12 Sep 2026 04:00:00 GMT', fetchedAt: '2026-09-12T05:40:00Z' } },
      auctions: [{ id: 99, cr: 1, item: 271444, buyout: 7_000_000 }],
    }
    const data = await scanRegion({ region: 'us', token: 'tok', season: CURRENT_SEASON, previous, concurrency: 2 }, deps(api.fetchFn))
    expect(data.stats).toMatchObject({ realmsFetched: 1, realmsReused: 0, realmsFailed: 1 })
    expect(data.realms['1']).toMatchObject({ stale: true, lastModified: 'Sat, 12 Sep 2026 04:00:00 GMT', fetchedAt: '2026-09-12T05:40:00Z' })
    expect(data.auctions.filter((a) => a.cr === 1)).toEqual([{ id: 99, cr: 1, item: 271444, buyout: 7_000_000 }])
    expect(data.errors?.length).toBe(1)
    expect(data.errors?.[0]).toContain('realm 1')
  })

  it('marks a failing realm without previous data as stale and continues', async () => {
    const api = fakeApi({ realm1Status: 404 })
    const data = await scanRegion({ region: 'us', token: 'tok', season: CURRENT_SEASON, previous: null, concurrency: 2 }, deps(api.fetchFn))
    expect(data.stats).toMatchObject({ realmsFetched: 1, realmsFailed: 1 })
    expect(data.realms['1']?.stale).toBe(true)
    expect(data.auctions.map((a) => a.cr)).toEqual([2])
  })
})

describe('fetchWithRetry', () => {
  it('retries 429/5xx and network errors, but not 404', async () => {
    let n = 0
    const flaky: typeof fetch = async () => {
      n++
      if (n === 1) return new Response('', { status: 429, headers: { 'retry-after': '1' } })
      if (n === 2) throw new TypeError('fetch failed')
      if (n === 3) return new Response('', { status: 502 })
      return new Response('ok', { status: 200 })
    }
    const res = await fetchWithRetry(flaky, 'https://x/', {}, { attempts: 5, sleep: async () => {} })
    expect(res.status).toBe(200)
    expect(n).toBe(4)

    let m = 0
    const notFound: typeof fetch = async () => {
      m++
      return new Response('', { status: 404 })
    }
    await expect(fetchWithRetry(notFound, 'https://x/', {}, { attempts: 5, sleep: async () => {} })).rejects.toBeInstanceOf(HttpError)
    expect(m).toBe(1)
  })

  it('gives up after the configured attempts', async () => {
    let n = 0
    const down: typeof fetch = async () => {
      n++
      return new Response('', { status: 500 })
    }
    await expect(fetchWithRetry(down, 'https://x/', {}, { attempts: 3, sleep: async () => {} })).rejects.toThrow()
    expect(n).toBe(3)
  })
})

describe('mapConcurrent', () => {
  it('preserves order and respects the concurrency limit', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const out = await mapConcurrent([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, n))
      inFlight--
      return n * 10
    })
    expect(out).toEqual([50, 10, 40, 20, 30])
    expect(maxInFlight).toBe(2)
  })
})
