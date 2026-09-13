import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CompactBonusTable } from '../shared/bonuses.ts'
import { formatGold } from '../shared/decode.ts'
import { DEFAULT_FILTERS, applyFilters, sortAuctions, type DecodedAuction, type Filters, type SortKey } from '../shared/filters.ts'
import { CURRENT_SEASON, seasonItems, seasonTrackLevels, type DifficultyKey } from '../shared/season.ts'
import type { DataIndex, RegionData } from '../shared/types.ts'
import { FiltersPanel } from './components/FiltersPanel.tsx'
import { Header } from './components/Header.tsx'
import { ResultsTable } from './components/ResultsTable.tsx'
import { decodeAuctions, formatRelative, formatTime, itemIconUrl, itemName, loadBonusTable, loadIndex, loadRegion, realmLabel } from './lib/data.ts'
import { TOKEN_COST, formatMoney, loadGoldPrice, saveGoldPrice, tokenRatePerMillion, type GoldPrice } from './lib/money.ts'
import { DEFAULT_SORT, loadInitialState, persistState, type ViewState } from './state/filters.ts'

const PAGE_SIZE = 50

export function App() {
  const [view, setView] = useState<ViewState>(() => loadInitialState())
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [bonusTable, setBonusTable] = useState<CompactBonusTable | null>(null)
  const [regionData, setRegionData] = useState<RegionData | null>(null)
  const [auctions, setAuctions] = useState<DecodedAuction[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [goldPrice, setGoldPrice] = useState<GoldPrice>(() => loadGoldPrice())

  /** Incremented when a newer scan is detected; forces the region data to reload. */
  const [dataVersion, setDataVersion] = useState(0)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // Re-render every 30 s so "x min ago" labels stay honest.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // ---- initial load: index + bonus table
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [idx, table] = await Promise.all([loadIndex(), loadBonusTable()])
        if (cancelled) return
        setIndex(idx)
        setBonusTable(table)
        setView((v) => {
          const available = idx.regions.map((r) => r.region)
          const region = v.region && available.includes(v.region) ? v.region : (available[0] ?? null)
          return region === v.region ? v : { ...v, region }
        })
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- load region data whenever the region changes or a newer scan was published
  useEffect(() => {
    if (!view.region || !bonusTable) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await loadRegion(view.region as string)
        if (cancelled) return
        setRegionData((prev) => {
          if (prev && prev.region === data.region && prev.generatedAt !== data.generatedAt) setUpdatedAt(data.generatedAt)
          return data
        })
        setAuctions(decodeAuctions(data.auctions, bonusTable))
        setLoadError(null)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view.region, bonusTable, dataVersion])

  // ---- poll for newer scans: every minute, when the tab becomes visible again, and on demand.
  // An open tab would otherwise keep showing the data it loaded hours ago.
  const checkForUpdates = useCallback(async () => {
    if (!view.region) return
    setRefreshing(true)
    try {
      const idx = await loadIndex()
      setIndex(idx)
      const entry = idx.regions.find((r) => r.region === view.region)
      if (entry && (!regionData || entry.generatedAt !== regionData.generatedAt)) setDataVersion((v) => v + 1)
    } catch {
      // transient network problem; the next poll will try again
    } finally {
      setRefreshing(false)
    }
  }, [view.region, regionData])
  useEffect(() => {
    const id = setInterval(() => void checkForUpdates(), 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdates()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [checkForUpdates])

  useEffect(() => {
    persistState(view)
  }, [view])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [view.filters, view.sort, view.region])

  const setFilters = useCallback((patch: Partial<Filters>) => setView((v) => ({ ...v, filters: { ...v.filters, ...patch } })), [])
  const resetFilters = useCallback(() => setView((v) => ({ ...v, filters: { ...DEFAULT_FILTERS }, sort: DEFAULT_SORT })), [])
  const onSort = useCallback(
    (key: SortKey) =>
      setView((v) => ({
        ...v,
        sort: v.sort.key === key ? { key, dir: v.sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'ilvl' ? 'desc' : 'asc' },
      })),
    [],
  )
  const onGoldPrice = useCallback((price: GoldPrice) => {
    setGoldPrice(price)
    saveGoldPrice(price)
  }, [])

  const filtered = useMemo(() => applyFilters(auctions, view.filters), [auctions, view.filters])
  const sorted = useMemo(
    () => sortAuctions(filtered, view.sort, itemName, (cr) => realmLabel(regionData, cr)),
    [filtered, view.sort, regionData],
  )
  const rows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount])

  // Counts shown next to items / realms use every filter except the one being counted.
  const itemCounts = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of applyFilters(auctions, { ...view.filters, items: null })) m.set(a.item, (m.get(a.item) ?? 0) + 1)
    return m
  }, [auctions, view.filters])
  const realmCounts = useMemo(() => {
    const m = new Map<number, number>()
    for (const a of applyFilters(auctions, { ...view.filters, realms: null })) m.set(a.cr, (m.get(a.cr) ?? 0) + 1)
    return m
  }, [auctions, view.filters])
  // Item levels per difficulty: the track's upgrade steps plus whatever the scan actually observed.
  const levelsByDifficulty = useMemo(() => {
    const byTrack = seasonTrackLevels(bonusTable ?? {})
    const sets = new Map<DifficultyKey, Set<number>>(Object.entries(byTrack).map(([k, v]) => [k as DifficultyKey, new Set(v)]))
    for (const a of auctions) {
      if (a.decoded.difficulty && a.decoded.ilvl > 0) sets.get(a.decoded.difficulty)?.add(a.decoded.ilvl)
    }
    const out = {} as Record<DifficultyKey, number[]>
    for (const [k, v] of sets) out[k] = [...v].sort((x, y) => x - y)
    return out
  }, [bonusTable, auctions])
  const cheapestPerItem = useMemo(() => {
    const m = new Map<number, DecodedAuction>()
    for (const a of filtered) {
      const cur = m.get(a.item)
      if (!cur || a.buyout < cur.buyout) m.set(a.item, a)
    }
    return m
  }, [filtered])

  const staleRealms = useMemo(() => Object.values(regionData?.realms ?? {}).filter((r) => r.stale).length, [regionData])
  const tokenRate = tokenRatePerMillion(regionData?.tokenPrice, view.region)
  const tokenCost = view.region ? TOKEN_COST[view.region] : undefined

  const header = (
    <Header
      index={index}
      regionData={regionData}
      region={view.region}
      onRegion={(region) => setView((v) => ({ ...v, region, filters: { ...v.filters, realms: null } }))}
      onRefresh={() => void checkForUpdates()}
      refreshing={refreshing || loading}
      goldPrice={goldPrice}
      onGoldPrice={onGoldPrice}
    />
  )

  if (loadError && !regionData) {
    return (
      <div className="app">
        {header}
        <div className="banner bad">
          <div>
            <strong>Could not load auction data.</strong> {loadError}
            <div className="hint">
              The data files are produced by the "Scan auctions and deploy" GitHub Actions workflow. Run it once (Actions tab → Run workflow) after adding the
              Blizzard API secrets; locally you can generate sample data with <code>npm run mock-data</code>.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {header}

      {loading && !regionData ? (
        <div className="loading">
          <span className="spinner" /> Loading auction data…
        </div>
      ) : (
        <div className="layout">
          <FiltersPanel
            filters={view.filters}
            onChange={setFilters}
            onReset={resetFilters}
            regionData={regionData}
            itemCounts={itemCounts}
            realmCounts={realmCounts}
            levelsByDifficulty={levelsByDifficulty}
          />
          <main>
            {updatedAt && (
              <div className="banner ok">
                <span>↻</span>
                <span>Newer scan loaded automatically ({formatTime(updatedAt)}). Your filters were kept.</span>
                <button className="close" onClick={() => setUpdatedAt(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}
            {regionData && Date.now() - new Date(regionData.generatedAt).getTime() > 45 * 60_000 && (
              <div className="banner warn">
                <span>⚠</span>
                <span>
                  The last scan finished {formatRelative(regionData.generatedAt)}; the scanner should publish every ~10 minutes, so listings may be out of date.
                  Check the "Scan auctions and deploy" workflow on the repository's Actions tab.
                </span>
              </div>
            )}
            {(regionData?.errors?.length ?? 0) > 0 && (
              <div className="banner warn">
                <span>⚠</span>
                <span>
                  The last scan had problems on {regionData?.errors?.length} realm(s){staleRealms > 0 ? `; ${staleRealms} realm(s) show older data` : ''}.{' '}
                  <span className="faint" title={regionData?.errors?.join('\n')}>
                    (hover for details)
                  </span>
                </span>
              </div>
            )}

            <div className="results-head">
              <span className="count">
                {filtered.length.toLocaleString('en-US')} listing{filtered.length === 1 ? '' : 's'}
              </span>
              <span className="sub">
                of {auctions.length.toLocaleString('en-US')} season BoEs across {Object.keys(regionData?.realms ?? {}).length} connected realms · scanned{' '}
                {formatRelative(regionData?.generatedAt)}
              </span>
              {loading && <span className="spinner" />}
            </div>
            <div className="rates">
              <span title="Buyout × your gold price">
                Your rate: {goldPrice.perMillion !== null ? <strong>{formatMoney(goldPrice.perMillion, goldPrice.currency)} per 1M gold</strong> : <span className="faint">not set (enter it in the header)</span>}
              </span>
              <span title={tokenCost ? `WoW Token: ${tokenCost.note}` : undefined}>
                Via token:{' '}
                {tokenRate && regionData?.tokenPrice && tokenCost ? (
                  <>
                    <strong>{formatMoney(tokenRate.amount, tokenRate.currency)} per 1M gold</strong>
                    <span className="faint">
                      {' '}
                      (token sells for {formatGold(regionData.tokenPrice)}, costs {formatMoney(tokenCost.amount, tokenCost.currency)})
                    </span>
                  </>
                ) : (
                  <span className="faint">token price unavailable</span>
                )}
              </span>
            </div>

            <div className="summary">
              {seasonItems(CURRENT_SEASON)
                .filter((item) => view.filters.items === null || view.filters.items.includes(item.id))
                .map((item) => {
                  const cheapest = cheapestPerItem.get(item.id)
                  return (
                    <button
                      key={item.id}
                      className="tile"
                      title={cheapest ? `Cheapest ${item.name} matching the filters: ${formatGold(cheapest.buyout)} on ${realmLabel(regionData, cheapest.cr)} (ilvl ${cheapest.decoded.ilvl})` : `No ${item.name} matches the filters`}
                      onClick={() => setFilters({ items: view.filters.items?.length === 1 && view.filters.items[0] === item.id ? null : [item.id] })}
                    >
                      <img src={itemIconUrl(item.id)} alt="" />
                      <span>
                        {CURRENT_SEASON.categories.find((c) => c.items.includes(item))?.label} {item.slot}
                      </span>
                      {cheapest ? <span className="price">{formatGold(cheapest.buyout)}</span> : <span className="none">none</span>}
                    </button>
                  )
                })}
            </div>

            <ResultsTable
              rows={rows}
              total={sorted.length}
              sort={view.sort}
              onSort={onSort}
              regionData={regionData}
              region={view.region}
              goldPrice={goldPrice}
              onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE * 2)}
            />

            <div className="footer">
              Prices are buyouts from Blizzard's auction house snapshots, which update roughly hourly per realm; the scan runs every 10 minutes and the page reloads
              newer data on its own. Click an item to open it on Undermine Exchange for that realm; hover for the Wowhead tooltip of that exact variant. Gold is
              warband-wide, so a level 1 character on the listing's realm can buy the item and mail it through the warband bank. Not affiliated with Blizzard
              Entertainment.
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
