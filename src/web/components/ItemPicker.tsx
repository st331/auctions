import { useEffect, useRef } from 'react'
import { CURRENT_SEASON } from '../../shared/season.ts'
import { itemIconUrl } from '../lib/data.ts'

interface Props {
  /** Selected item ids, or null for "all". */
  selected: number[] | null
  onChange: (items: number[] | null) => void
  counts: Map<number, number>
}

const ALL_IDS = CURRENT_SEASON.categories.flatMap((c) => c.items.map((i) => i.id))

/** Checkbox that shows the partial (indeterminate) state when only some of a group's items are selected. */
function GroupCheckbox({ onCount, total, onToggle }: { onCount: number; total: number; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = onCount > 0 && onCount < total
  }, [onCount, total])
  return <input ref={ref} type="checkbox" checked={onCount === total} onChange={onToggle} aria-label="Toggle group" />
}

export function ItemPicker({ selected, onChange, counts }: Props) {
  const isOn = (id: number) => selected === null || selected.includes(id)
  const set = (ids: number[]) => onChange(ids.length === ALL_IDS.length ? null : ids)
  const toggle = (id: number) => {
    const current = selected ?? ALL_IDS
    set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }
  const setGroup = (ids: number[], on: boolean) => {
    const current = new Set(selected ?? ALL_IDS)
    for (const id of ids) (on ? current.add(id) : current.delete(id))
    set(ALL_IDS.filter((id) => current.has(id)))
  }

  return (
    <div className="card">
      <h2>
        Items
        <span className="right">
          <button className="link-btn" onClick={() => onChange(null)}>
            all
          </button>
          <button className="link-btn" onClick={() => onChange([])}>
            none
          </button>
        </span>
      </h2>
      {CURRENT_SEASON.categories.map((cat) => {
        const ids = cat.items.map((i) => i.id)
        const onCount = ids.filter(isOn).length
        return (
          <div className="item-group" key={cat.id}>
            <label className="item-group-head" title={onCount === ids.length ? `Deselect all ${cat.label}` : `Select all ${cat.label}`}>
              <GroupCheckbox onCount={onCount} total={ids.length} onToggle={() => setGroup(ids, onCount !== ids.length)} />
              <span>{cat.label}</span>
              <span className="faint" style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12 }}>
                {onCount}/{ids.length}
              </span>
            </label>
            {cat.items.map((item) => (
              <label className={`item-row ${isOn(item.id) ? '' : 'off'}`} key={item.id}>
                <input type="checkbox" checked={isOn(item.id)} onChange={() => toggle(item.id)} />
                <img src={itemIconUrl(item.id)} alt="" loading="lazy" />
                <span className="name">{item.name}</span>
                <span className="slot">
                  {item.slot}
                  {counts.has(item.id) ? ` · ${counts.get(item.id)}` : ''}
                </span>
              </label>
            ))}
          </div>
        )
      })}
    </div>
  )
}
