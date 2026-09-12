import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractSeasonAuctions } from '../shared/blizzard.ts'
import type { CompactBonusTable } from '../shared/bonuses.ts'
import { formatGold } from '../shared/decode.ts'
import { DEFAULT_FILTERS, applyFilters, sortAuctions, type DecodedAuction, type Filters, type SortKey } from '../shared/filters.ts'
import { CURRENT_SEASON, seasonItemIds, seasonItems } from '../shared/season.ts'
import type { DataIndex, RegionData } from '../shared/types.ts'
import { FiltersPanel } from './components/FiltersPanel.tsx'
import { Header } from './components/Header.tsx'
import { ResultsTable, type LiveRealm, type VerifyResult } from './components/ResultsTable.tsx'
import { SettingsDialog } from './components/SettingsDialog.tsx'
import { VerifyError, clearCredentials, fetchRealmAuctions, loadCredentials, saveCredentials, type Credentials } from './lib/blizzardClient.ts'
import { decodeAuctions, formatRelative, formatTime, itemIconUrl, itemName, loadBonusTable, loadIndex, loadRegion, realmLabel } from './lib/data.ts'
import { DEFAULT_SORT, loadInitialState, persistState, type ViewState } from './state/filters.ts'

const PAGE_SIZE = 50
const ITEM_IDS = seasonItemIds(CURRENT_SEASON)

interface Banner {
  tone: 'ok' | 'bad' | 'warn'
  text: string
}

export function App() {
  const [view, setView] = useState<ViewState>(() => loadInitialState())
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [bonusTable, setBonusTable] = useState<CompactBonusTable | null>(null)
  const [regionData, setRegionData] = useState<RegionData | null>(null)
  const [auctions, setAuctions] = useState<DecodedAuction[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsHint, setSettingsHint] = useState<string | null>(null)
  const [busyRealm, setBusyRealm] = useState<number | null>(null)
  const [liveRealms, setLiveRealms] = useState<Map<number, LiveRealm>>(new Map())
  const [verifyResults, setVerifyResults] = useState<Map<string, VerifyResult>>(new Map())
  const [banner, setBanner] = useState<Banner | null>(null)

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

  // ---- load region data whenever the region changes
  useEffect(() => {
    if (!view.region || !bonusTable) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const data = await loadRegion(view.region as string)
        if (cancelled) return
        setRegionData(data)
        setAuctions(decodeAuctions(data.auctions, bonusTable))
        setLiveRealms(new Map())
        setVerifyResults(new Map())
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
  }, [view.region, bonusTable])

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
  const cheapestPerItem = useMemo(() => {
    const m = new Map<number, DecodedAuction>()
    for (const a of filtered) {
      const cur = m.get(a.item)
      if (!cur || a.buyout < cur.buyout) m.set(a.item, a)
    }
    return m
  }, [filtered])

  // ---- real-time verification
  const verify = useCallback(
    async (a: DecodedAuction) => {
      if (!view.region || !bonusTable) return
      const creds = loadCredentials()
      if (!creds) {
        setSettingsHint('Enter your Blizzard API client to verify listings in real time.')
        setSettingsOpen(true)
        return
      }
      setBusyRealm(a.cr)
      setBanner(null)
      try {
        const snapshot = await fetchRealmAuctions(view.region, a.cr, creds)
        const fresh = decodeAuctions(extractSeasonAuctions(snapshot.response, a.cr, ITEM_IDS), bonusTable)
        const stillThere = fresh.some((x) => x.id === a.id)
        const at = snapshot.fetchedAt.toISOString()
        setAuctions((prev) => [...prev.filter((x) => x.cr !== a.cr), ...fresh])
        setLiveRealms((prev) => new Map(prev).set(a.cr, { at, lastModified: snapshot.lastModified }))
        setVerifyResults((prev) => {
          const next = new Map<string, VerifyResult>()
          for (const [k, v] of prev) if (!k.startsWith(`${a.cr}:`)) next.set(k, v)
          if (stillThere) next.set(`${a.cr}:${a.id}`, { ok: true, at })
          return next
        })
        const realm = realmLabel(regionData, a.cr)
        const snap = snapshot.lastModified ? ` Blizzard's snapshot for this realm is from ${formatTime(new Date(snapshot.lastModified).toISOString())}.` : ''
        setBanner(
          stillThere
            ? { tone: 'ok', text: `${itemName(a.item)} for ${formatGold(a.buyout)} is still listed on ${realm}. All ${fresh.length} season BoE listings on this realm were refreshed.${snap}` }
            : { tone: 'bad', text: `${itemName(a.item)} for ${formatGold(a.buyout)} is no longer listed on ${realm} (sold, cancelled or expired) and has been removed. ${fresh.length} current listings on this realm were loaded instead.${snap}` },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setBanner({ tone: 'bad', text: `Verification failed: ${msg}` })
        if (err instanceof VerifyError && err.kind === 'credentials') {
          setSettingsHint(msg)
          setSettingsOpen(true)
        }
      } finally {
        setBusyRealm(null)
      }
    },
    [view.region, bonusTable, regionData],
  )

  const staleRealms = useMemo(() => Object.values(regionData?.realms ?? {}).filter((r) => r.stale).length, [regionData])

  if (loadError && !regionData) {
    return (
      <div className="app">
        <Header index={index} regionData={null} region={view.region} onRegion={() => {}} hasCredentials={!!credentials} onOpenSettings={() => setSettingsOpen(true)} />
        <div className="banner bad">
          <div>
            <strong>Could not load auction data.</strong> {loadError}
            <div className="hint">
              The data files are produced by the "Scan auctions and deploy" GitHub Actions workflow. Run it once (Actions tab → Run workflow) after adding the
              Blizzard API secrets; locally you can generate sample data with <code>npm run mock-data</code>.
            </div>
          </div>
        </div>
        <SettingsDialog open={settingsOpen} credentials={credentials} hint={settingsHint} onSave={(c) => { saveCredentials(c); setCredentials(c); setSettingsOpen(false) }} onClear={() => { clearCredentials(); setCredentials(null) }} onClose={() => setSettingsOpen(false)} />
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        index={index}
        regionData={regionData}
        region={view.region}
        onRegion={(region) => setView((v) => ({ ...v, region, filters: { ...v.filters, realms: null } }))}
        hasCredentials={!!credentials}
        onOpenSettings={() => {
          setSettingsHint(null)
          setSettingsOpen(true)
        }}
      />

      {loading && !regionData ? (
        <div className="loading">
          <span className="spinner" /> Loading auction data…
        </div>
      ) : (
        <div className="layout">
          <FiltersPanel filters={view.filters} onChange={setFilters} onReset={resetFilters} regionData={regionData} itemCounts={itemCounts} realmCounts={realmCounts} />
          <main>
            {banner && (
              <div className={`banner ${banner.tone}`}>
                <span>{banner.tone === 'ok' ? '✓' : banner.tone === 'bad' ? '✗' : '⚠'}</span>
                <span>{banner.text}</span>
                <button className="close" onClick={() => setBanner(null)} aria-label="Dismiss">
                  ×
                </button>
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
              busyRealm={busyRealm}
              liveRealms={liveRealms}
              verifyResults={verifyResults}
              onVerify={verify}
              onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE * 2)}
            />

            <div className="footer">
              Prices are buyouts from Blizzard's auction house snapshots, which update roughly hourly per realm; the scan runs every 30 minutes. Hover an item name for
              the Wowhead tooltip of that exact variant. Gold is warband-wide, so a level 1 character on the listing's realm can buy the item and mail it through the
              warband bank. Not affiliated with Blizzard Entertainment.
            </div>
          </main>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        credentials={credentials}
        hint={settingsHint}
        onSave={(c) => {
          saveCredentials(c)
          setCredentials(c)
          setSettingsOpen(false)
          setSettingsHint(null)
        }}
        onClear={() => {
          clearCredentials()
          setCredentials(null)
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
