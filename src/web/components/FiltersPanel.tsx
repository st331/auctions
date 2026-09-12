import { TERTIARY_STATS } from '../../shared/decode.ts'
import { NO_TERTIARY, type Filters, type SocketFilter } from '../../shared/filters.ts'
import { CURRENT_SEASON, type DifficultyKey } from '../../shared/season.ts'
import type { RegionData } from '../../shared/types.ts'
import { ItemPicker } from './ItemPicker.tsx'
import { RealmPicker } from './RealmPicker.tsx'
import { SecondaryFilter } from './SecondaryFilter.tsx'

interface Props {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onReset: () => void
  regionData: RegionData | null
  itemCounts: Map<number, number>
  realmCounts: Map<number, number>
  /** Item levels reachable on each difficulty track this season, ascending. */
  levelsByDifficulty: Record<DifficultyKey, number[]>
}

function levelsFor(levelsByDifficulty: Record<DifficultyKey, number[]>, difficulties: DifficultyKey[]): number[] {
  const keys = difficulties.length > 0 ? difficulties : (Object.keys(levelsByDifficulty) as DifficultyKey[])
  const set = new Set<number>()
  for (const k of keys) for (const l of levelsByDifficulty[k] ?? []) set.add(l)
  return [...set].sort((a, b) => a - b)
}

const BUYOUT_PRESETS = [50_000, 100_000, 250_000, 500_000, 1_000_000]

function formatShortGold(g: number): string {
  return g >= 1_000_000 ? `${g / 1_000_000}M` : `${g / 1000}k`
}

export function FiltersPanel({ filters, onChange, onReset, regionData, itemCounts, realmCounts, levelsByDifficulty }: Props) {
  // Only offer the item levels of the selected difficulty tracks (all tracks when none is selected).
  const ilvlOptions = levelsFor(levelsByDifficulty, filters.difficulties)
  const lowestIlvl = ilvlOptions[0] ?? null
  const highestIlvl = ilvlOptions[ilvlOptions.length - 1] ?? null
  // The drop-downs always show a concrete level; the season's bounds mean "no limit" in the filter model.
  const setIlvlMin = (value: number) => {
    const min = value === lowestIlvl ? null : value
    const max = filters.ilvlMax !== null && filters.ilvlMax < value ? null : filters.ilvlMax
    onChange({ ilvlMin: min, ilvlMax: max })
  }
  const setIlvlMax = (value: number) => {
    const max = value === highestIlvl ? null : value
    const min = filters.ilvlMin !== null && filters.ilvlMin > value ? null : filters.ilvlMin
    onChange({ ilvlMin: min, ilvlMax: max })
  }
  const toggleDifficulty = (key: DifficultyKey) => {
    const difficulties = filters.difficulties.includes(key) ? filters.difficulties.filter((d) => d !== key) : [...filters.difficulties, key]
    // Drop level bounds that the new track selection can no longer offer.
    const options = levelsFor(levelsByDifficulty, difficulties)
    const ilvlMin = filters.ilvlMin !== null && options.includes(filters.ilvlMin) && filters.ilvlMin !== options[0] ? filters.ilvlMin : null
    const ilvlMax = filters.ilvlMax !== null && options.includes(filters.ilvlMax) && filters.ilvlMax !== options[options.length - 1] ? filters.ilvlMax : null
    onChange({ difficulties, ilvlMin, ilvlMax })
  }
  const toggleTertiary = (id: number) =>
    onChange({ tertiaries: filters.tertiaries.includes(id) ? filters.tertiaries.filter((t) => t !== id) : [...filters.tertiaries, id] })
  const numberOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))) || null)

  return (
    <aside className="filters">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Filters</strong>
        <button className="btn small" onClick={onReset}>
          Reset all
        </button>
      </div>

      <ItemPicker selected={filters.items} onChange={(items) => onChange({ items })} counts={itemCounts} />

      <div className="card">
        <h2>
          Item level
          {(filters.difficulties.length > 0 || filters.ilvlMin !== null || filters.ilvlMax !== null) && (
            <span className="right">
              <button className="link-btn" onClick={() => onChange({ difficulties: [], ilvlMin: null, ilvlMax: null })}>
                clear
              </button>
            </span>
          )}
        </h2>
        <div className="chips">
          {CURRENT_SEASON.difficulties.map((d) => (
            <button
              key={d.key}
              className={`chip ${filters.difficulties.includes(d.key) ? 'on' : ''}`}
              onClick={() => toggleDifficulty(d.key)}
              title={`${d.track} track, drops at item level ${d.ilvl}`}
            >
              {d.label} <span className="faint">{d.ilvl}+</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Min ilvl</label>
            <select value={filters.ilvlMin ?? lowestIlvl ?? ''} onChange={(e) => setIlvlMin(Number(e.target.value))} disabled={ilvlOptions.length === 0}>
              {ilvlOptions.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                  {lvl === lowestIlvl ? ' (lowest)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Max ilvl</label>
            <select value={filters.ilvlMax ?? highestIlvl ?? ''} onChange={(e) => setIlvlMax(Number(e.target.value))} disabled={ilvlOptions.length === 0}>
              {ilvlOptions.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                  {lvl === highestIlvl ? ' (highest)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          Difficulty chips match the item's upgrade track (LFR = Veteran, Normal = Champion, Heroic = Hero, Mythic = Myth) and can be combined. The
          level drop-downs list the upgrade steps of the selected tracks (all tracks when none is selected).
        </p>
      </div>

      <div className="card">
        <h2>Max buyout</h2>
        <div className="row">
          <input
            type="number"
            min={0}
            step={1000}
            placeholder="no limit (gold)"
            value={filters.maxBuyoutGold ?? ''}
            onChange={(e) => onChange({ maxBuyoutGold: numberOrNull(e.target.value) })}
          />
          <span className="muted">g</span>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {BUYOUT_PRESETS.map((g) => (
            <button key={g} className={`chip ${filters.maxBuyoutGold === g ? 'on' : ''}`} onClick={() => onChange({ maxBuyoutGold: filters.maxBuyoutGold === g ? null : g })}>
              ≤ {formatShortGold(g)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Socket</h2>
        <div className="seg block">
          {(['any', 'yes', 'no'] as SocketFilter[]).map((s) => (
            <button key={s} className={filters.socket === s ? 'on' : ''} onClick={() => onChange({ socket: s })}>
              {s === 'any' ? 'Any' : s === 'yes' ? 'Has socket' : 'No socket'}
            </button>
          ))}
        </div>
      </div>

      <SecondaryFilter
        selected={filters.secondaries}
        mode={filters.secondaryMode}
        majorStat={filters.majorStat}
        onChange={(patch) => onChange(patch)}
      />

      <div className="card">
        <h2>
          Tertiary stat
          {filters.tertiaries.length > 0 && (
            <span className="right">
              <button className="link-btn" onClick={() => onChange({ tertiaries: [] })}>
                clear
              </button>
            </span>
          )}
        </h2>
        <div className="chips">
          {TERTIARY_STATS.map((t) => (
            <button key={t.id} className={`chip tone-green ${filters.tertiaries.includes(t.id) ? 'on' : ''}`} onClick={() => toggleTertiary(t.id)}>
              {t.label}
            </button>
          ))}
          <button className={`chip ${filters.tertiaries.includes(NO_TERTIARY) ? 'on' : ''}`} onClick={() => toggleTertiary(NO_TERTIARY)}>
            None
          </button>
          <button
            className="chip"
            onClick={() => onChange({ tertiaries: TERTIARY_STATS.map((t) => t.id) })}
            title="Any tertiary stat"
          >
            Any tertiary
          </button>
        </div>
        <p className="hint">Items match if their tertiary is one of the selected ones. "None" selects items without a tertiary.</p>
      </div>

      <RealmPicker regionData={regionData} selected={filters.realms} onChange={(realms) => onChange({ realms })} counts={realmCounts} />
    </aside>
  )
}
