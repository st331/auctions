import { REGIONS } from '../../shared/blizzard.ts'
import { CURRENT_SEASON } from '../../shared/season.ts'
import type { DataIndex, RegionData } from '../../shared/types.ts'
import { formatRelative, formatTime } from '../lib/data.ts'
import { GOLD_PRICE_CURRENCIES, type GoldPrice } from '../lib/money.ts'

interface Props {
  index: DataIndex | null
  regionData: RegionData | null
  region: string | null
  onRegion: (region: string) => void
  onRefresh: () => void
  refreshing: boolean
  goldPrice: GoldPrice
  onGoldPrice: (price: GoldPrice) => void
}

/** Blizzard's snapshot time for the region: realms of a region share one hourly snapshot, so show the newest. */
function snapshotTime(regionData: RegionData | null): string | undefined {
  let newest = 0
  for (const r of Object.values(regionData?.realms ?? {})) {
    const t = r.lastModified ? new Date(r.lastModified).getTime() : 0
    if (t > newest) newest = t
  }
  return newest > 0 ? new Date(newest).toISOString() : undefined
}

export function Header({ index, regionData, region, onRegion, onRefresh, refreshing, goldPrice, onGoldPrice }: Props) {
  const snapshot = snapshotTime(regionData)
  const regions = index?.regions ?? []
  const stats = regionData?.stats
  const problems = (regionData?.errors?.length ?? 0) > 0
  const title = stats
    ? `Scan finished ${formatTime(regionData?.generatedAt)} · ${stats.realmsFetched} realms downloaded, ${stats.realmsReused} unchanged, ${stats.realmsFailed} failed · ${Math.round(stats.durationMs / 1000)}s`
    : ''
  return (
    <header className="header">
      <div>
        <h1>BoE Auction Scanner</h1>
        <div className="season">
          {CURRENT_SEASON.name} · {CURRENT_SEASON.raid} raid BoEs · every auction house in the region
        </div>
      </div>
      <div className="spacer" />
      <label className="gold-price" title="What you pay for gold, per 1,000,000 gold. Drives the 'Your rate' cost column. Stored in this browser only.">
        <span className="muted">Gold price</span>
        <select value={goldPrice.currency} onChange={(e) => onGoldPrice({ ...goldPrice, currency: e.target.value })} aria-label="Currency">
          {GOLD_PRICE_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step={0.5}
          inputMode="decimal"
          placeholder="e.g. 12"
          aria-label="Price per million gold"
          value={goldPrice.perMillion ?? ''}
          onChange={(e) => {
            const v = Number(e.target.value)
            onGoldPrice({ ...goldPrice, perMillion: e.target.value.trim() === '' || !Number.isFinite(v) || v <= 0 ? null : v })
          }}
        />
        <span className="faint">per 1M gold</span>
      </label>
      {regions.length > 1 && (
        <label className="row">
          <span className="muted">Region</span>
          <select value={region ?? ''} onChange={(e) => onRegion(e.target.value)} style={{ width: 'auto' }}>
            {regions.map((r) => (
              <option key={r.region} value={r.region}>
                {REGIONS[r.region]?.label ?? r.region.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      )}
      {regions.length === 1 && <span className="muted">{REGIONS[regions[0]!.region]?.label ?? regions[0]!.region.toUpperCase()}</span>}
      {regionData && (
        <span className="status" title={title}>
          {problems ? '⚠' : '●'} Scanned {formatRelative(regionData.generatedAt)}
          {snapshot && (
            <span className="faint" title="Blizzard publishes a new auction-house snapshot per region roughly once an hour; this is the snapshot the listings come from">
              · Blizzard snapshot {formatTime(snapshot)} ({formatRelative(snapshot)})
            </span>
          )}
          <button className="btn small" onClick={onRefresh} disabled={refreshing} title="Check for a newer scan now (the page also checks every minute)">
            {refreshing ? <span className="spinner" /> : '↻'}
          </button>
        </span>
      )}
    </header>
  )
}
