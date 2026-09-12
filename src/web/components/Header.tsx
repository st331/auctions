import { REGIONS } from '../../shared/blizzard.ts'
import { CURRENT_SEASON } from '../../shared/season.ts'
import type { DataIndex, RegionData } from '../../shared/types.ts'
import { formatRelative, formatTime } from '../lib/data.ts'

interface Props {
  index: DataIndex | null
  regionData: RegionData | null
  region: string | null
  onRegion: (region: string) => void
  hasCredentials: boolean
  onOpenSettings: () => void
}

export function Header({ index, regionData, region, onRegion, hasCredentials, onOpenSettings }: Props) {
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
          {regionData.tokenPrice ? <span className="faint">· Token {Math.round(regionData.tokenPrice / 10000).toLocaleString('en-US')}g</span> : null}
        </span>
      )}
      <button className="btn small" onClick={onOpenSettings} title="Blizzard API credentials for real-time verification">
        ⚙ {hasCredentials ? 'Verification on' : 'Set up verification'}
      </button>
    </header>
  )
}
