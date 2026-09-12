import { SECONDARY_STATS, statLabel } from '../../shared/decode.ts'
import type { SecondaryMode } from '../../shared/filters.ts'

interface Props {
  selected: number[]
  mode: SecondaryMode
  majorStat: number | null
  onChange: (patch: { secondaries?: number[]; secondaryMode?: SecondaryMode; majorStat?: number | null }) => void
}

const MODE_LABELS: Record<SecondaryMode, string> = { any: 'Any of', all: 'All of', exact: 'Exactly' }

function describe(selected: number[], mode: SecondaryMode, major: number | null): string {
  const names = selected.map((s) => statLabel(s, true))
  let text: string
  if (names.length === 0) {
    text = 'No secondary-stat filter.'
  } else if (names.length === 1) {
    text = mode === 'exact' ? `Only items whose single secondary stat is ${names[0]}.` : `Items that have ${names[0]} (with any other stat).`
  } else {
    const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    const orList = `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
    if (mode === 'any') text = `Items with at least one of ${orList}.`
    else if (mode === 'all') text = `Items that have both ${list} (nothing else fits on a two-stat item).`
    else text = `Items whose stats are exactly ${list}.`
  }
  if (major !== null) text += ` ${statLabel(major, true)} must be the major (higher) stat.`
  return text
}

export function SecondaryFilter({ selected, mode, majorStat, onChange }: Props) {
  const toggle = (id: number) => onChange({ secondaries: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] })
  return (
    <div className="card">
      <h2>
        Secondary stats
        {(selected.length > 0 || majorStat !== null) && (
          <span className="right">
            <button className="link-btn" onClick={() => onChange({ secondaries: [], majorStat: null })}>
              clear
            </button>
          </span>
        )}
      </h2>
      <div className="chips">
        {SECONDARY_STATS.map((s) => (
          <button key={s.id} className={`chip ${selected.includes(s.id) ? 'on' : ''}`} onClick={() => toggle(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="faint" style={{ fontSize: 12 }}>
          Match
        </span>
        <div className="seg">
          {(Object.keys(MODE_LABELS) as SecondaryMode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => onChange({ secondaryMode: m })} title={MODE_LABELS[m]}>
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          Major stat
        </span>
        <select value={majorStat ?? ''} onChange={(e) => onChange({ majorStat: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Any</option>
          {SECONDARY_STATS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">{describe(selected, mode, majorStat)}</p>
      <p className="hint">
        <strong>Any of</strong> = at least one selected stat · <strong>All of</strong> = every selected stat · <strong>Exactly</strong> = the selected stats and no other. Raid BoEs
        carry two secondaries; the first one listed gets the larger share.
      </p>
    </div>
  )
}
