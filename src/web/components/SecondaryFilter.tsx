import { SECONDARY_STATS, statLabel } from '../../shared/decode.ts'
import type { SecondaryMode } from '../../shared/filters.ts'

interface Props {
  wanted: number[]
  excluded: number[]
  mode: SecondaryMode
  majorStat: number | null
  onChange: (patch: { secondaries?: number[]; excludedSecondaries?: number[]; secondaryMode?: SecondaryMode; majorStat?: number | null }) => void
}

function joinNames(ids: number[], word: string): string {
  const names = ids.map((s) => statLabel(s, true))
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} ${word} ${names[names.length - 1]}`
}

function describe(wanted: number[], excluded: number[], mode: SecondaryMode, major: number | null): string {
  const parts: string[] = []
  if (wanted.length > 0) parts.push(`with ${joinNames(wanted, mode === 'all' ? 'and' : 'or')}`)
  if (excluded.length > 0) parts.push(`without ${joinNames(excluded, 'or')}`)
  let text = parts.length === 0 ? 'Any secondary stats.' : `Items ${parts.join(', ')}.`
  if (major !== null) text += ` ${statLabel(major, true)} must be the major stat.`
  return text
}

export function SecondaryFilter({ wanted, excluded, mode, majorStat, onChange }: Props) {
  const toggleWant = (id: number) =>
    onChange({
      secondaries: wanted.includes(id) ? wanted.filter((s) => s !== id) : [...wanted, id],
      excludedSecondaries: excluded.filter((s) => s !== id),
    })
  const toggleExclude = (id: number) =>
    onChange({
      excludedSecondaries: excluded.includes(id) ? excluded.filter((s) => s !== id) : [...excluded, id],
      secondaries: wanted.filter((s) => s !== id),
      majorStat: majorStat === id && !excluded.includes(id) ? null : majorStat,
    })
  const excludeRest = () => onChange({ excludedSecondaries: SECONDARY_STATS.map((s) => s.id).filter((id) => !wanted.includes(id)), secondaryMode: 'all' })
  const active = wanted.length > 0 || excluded.length > 0 || majorStat !== null

  return (
    <div className="card">
      <h2>
        Secondary stats
        {active && (
          <span className="right">
            <button className="link-btn" onClick={() => onChange({ secondaries: [], excludedSecondaries: [], majorStat: null, secondaryMode: 'any' })}>
              clear
            </button>
          </span>
        )}
      </h2>
      <div className="stat-grid" role="table" aria-label="Secondary stat filter">
        <div className="stat-grid-head" role="row">
          <span role="columnheader" />
          <span role="columnheader" title="The item must have this stat">
            Want
          </span>
          <span role="columnheader" title="The item must not have this stat">
            Exclude
          </span>
        </div>
        {SECONDARY_STATS.map((s) => {
          const w = wanted.includes(s.id)
          const x = excluded.includes(s.id)
          return (
            <div className="stat-grid-row" role="row" key={s.id}>
              <span className={`stat-name ${w ? 'want' : x ? 'exclude' : ''}`} role="cell">
                {s.label}
              </span>
              <button className={`tri want ${w ? 'on' : ''}`} aria-pressed={w} onClick={() => toggleWant(s.id)} title={`Want ${s.label}`}>
                {w ? '✓' : ''}
              </button>
              <button className={`tri exclude ${x ? 'on' : ''}`} aria-pressed={x} onClick={() => toggleExclude(s.id)} title={`Exclude ${s.label}`}>
                {x ? '✕' : ''}
              </button>
            </div>
          )
        })}
      </div>
      <div className="row wrap" style={{ marginTop: 10, gap: '8px 14px' }}>
        <span className="row">
          <span className="lgl">Wanted</span>
          <div className="seg">
            <button className={mode === 'any' ? 'on' : ''} onClick={() => onChange({ secondaryMode: 'any' })} title="At least one of the wanted stats">
              Any of
            </button>
            <button className={mode === 'all' ? 'on' : ''} onClick={() => onChange({ secondaryMode: 'all' })} title="Every wanted stat">
              All of
            </button>
          </div>
        </span>
        {wanted.length > 0 && wanted.length < SECONDARY_STATS.length && (
          <button className="link-btn" onClick={excludeRest} title="Only the wanted stats: exclude every other secondary">
            exclude the rest
          </button>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="lgl" style={{ whiteSpace: 'nowrap' }}>
          Major stat
        </span>
        <select value={majorStat ?? ''} onChange={(e) => onChange({ majorStat: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Any</option>
          {SECONDARY_STATS.filter((s) => !excluded.includes(s.id)).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">{describe(wanted, excluded, mode, majorStat)}</p>
    </div>
  )
}
