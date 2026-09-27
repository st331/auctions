import { SECONDARY_STATS, statLabel } from '../../shared/decode.ts'
import type { SecondaryMode } from '../../shared/filters.ts'

interface Patch {
  secondaries?: number[]
  excludedSecondaries?: number[]
  secondaryMode?: SecondaryMode
  majorStat?: number | null
  notMajorStats?: number[]
}

interface Props {
  wanted: number[]
  excluded: number[]
  mode: SecondaryMode
  majorStat: number | null
  notMajor: number[]
  onChange: (patch: Patch) => void
}

function joinNames(ids: number[], word: string): string {
  const names = ids.map((s) => statLabel(s, true))
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} ${word} ${names[names.length - 1]}`
}

function describe(wanted: number[], excluded: number[], mode: SecondaryMode, major: number | null, notMajor: number[]): string {
  const parts: string[] = []
  if (wanted.length > 0) parts.push(`with ${joinNames(wanted, mode === 'all' ? 'and' : 'or')}`)
  if (excluded.length > 0) parts.push(`without ${joinNames(excluded, 'or')}`)
  const sentences: string[] = [parts.length === 0 ? 'Any secondary stats.' : `Items ${parts.join(', ')}.`]
  if (major !== null) sentences.push(`${statLabel(major, true)} must be the major stat.`)
  if (notMajor.length > 0) sentences.push(`${joinNames(notMajor, 'and')} must not be the major stat.`)
  return sentences.join(' ')
}

/** A pair of single-click toggles: ✓ (yes) and ✕ (no); clicking the active one clears it. */
function Pair({ value, onSet, yesTitle, noTitle, disabled }: { value: 'yes' | 'no' | null; onSet: (v: 'yes' | 'no' | null) => void; yesTitle: string; noTitle: string; disabled?: boolean }) {
  return (
    <span className={`pair ${disabled ? 'disabled' : ''}`} role="group">
      <button className={`tri yes ${value === 'yes' ? 'on' : ''}`} aria-pressed={value === 'yes'} title={yesTitle} disabled={disabled} onClick={() => onSet(value === 'yes' ? null : 'yes')}>
        ✓
      </button>
      <button className={`tri no ${value === 'no' ? 'on' : ''}`} aria-pressed={value === 'no'} title={noTitle} disabled={disabled} onClick={() => onSet(value === 'no' ? null : 'no')}>
        ✕
      </button>
    </span>
  )
}

export function SecondaryFilter({ wanted, excluded, mode, majorStat, notMajor, onChange }: Props) {
  const without = (list: number[], id: number) => list.filter((s) => s !== id)

  const setHave = (id: number, v: 'yes' | 'no' | null) => {
    const patch: Patch = { secondaries: without(wanted, id), excludedSecondaries: without(excluded, id) }
    if (v === 'yes') patch.secondaries = [...patch.secondaries!, id]
    if (v === 'no') {
      // An excluded stat is never on the item, so any major rule for it is moot.
      patch.excludedSecondaries = [...patch.excludedSecondaries!, id]
      if (majorStat === id) patch.majorStat = null
      patch.notMajorStats = without(notMajor, id)
    }
    onChange(patch)
  }

  const setMajor = (id: number, v: 'yes' | 'no' | null) => {
    const patch: Patch = { notMajorStats: without(notMajor, id) }
    if (majorStat === id) patch.majorStat = null
    if (v === 'yes') {
      // Only one stat can be the major one; being the major stat implies the item has it.
      patch.majorStat = id
      patch.excludedSecondaries = without(excluded, id)
      if (!wanted.includes(id)) patch.secondaries = [...wanted, id]
    }
    if (v === 'no') patch.notMajorStats = [...patch.notMajorStats!, id]
    onChange(patch)
  }

  const excludeRest = () =>
    onChange({ excludedSecondaries: SECONDARY_STATS.map((s) => s.id).filter((id) => !wanted.includes(id)), secondaryMode: 'all', notMajorStats: notMajor.filter((id) => wanted.includes(id)) })
  const active = wanted.length > 0 || excluded.length > 0 || majorStat !== null || notMajor.length > 0

  return (
    <div className="card">
      <h2>
        Secondary stats
        {active && (
          <span className="right">
            <button className="link-btn" onClick={() => onChange({ secondaries: [], excludedSecondaries: [], majorStat: null, notMajorStats: [], secondaryMode: 'any' })}>
              clear
            </button>
          </span>
        )}
      </h2>
      <div className="stat-grid" role="table" aria-label="Secondary stat filter">
        <div className="stat-grid-head" role="row">
          <span role="columnheader" />
          <span role="columnheader" title="✓ the item must have this stat · ✕ the item must not have it">
            Have
          </span>
          <span role="columnheader" title="✓ this must be the major (larger) stat · ✕ this must not be the major stat">
            Major
          </span>
        </div>
        {SECONDARY_STATS.map((s) => {
          const have: 'yes' | 'no' | null = wanted.includes(s.id) ? 'yes' : excluded.includes(s.id) ? 'no' : null
          const major: 'yes' | 'no' | null = majorStat === s.id ? 'yes' : notMajor.includes(s.id) ? 'no' : null
          return (
            <div className="stat-grid-row" role="row" key={s.id}>
              <span className={`stat-name ${have === 'yes' ? 'want' : have === 'no' ? 'exclude' : ''}`} role="cell">
                {s.label}
                {major === 'yes' && <span className="mark" title="must be the major stat"> ★</span>}
              </span>
              <Pair value={have} onSet={(v) => setHave(s.id, v)} yesTitle={`Must have ${s.label}`} noTitle={`Must not have ${s.label}`} />
              <Pair
                value={major}
                onSet={(v) => setMajor(s.id, v)}
                yesTitle={`${s.label} must be the major stat`}
                noTitle={`${s.label} must not be the major stat`}
                disabled={have === 'no'}
              />
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
      <p className="hint">{describe(wanted, excluded, mode, majorStat, notMajor)}</p>
    </div>
  )
}
