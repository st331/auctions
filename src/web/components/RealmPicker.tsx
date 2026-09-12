import { useMemo, useState } from 'react'
import type { RegionData } from '../../shared/types.ts'

interface Props {
  regionData: RegionData | null
  selected: number[] | null
  onChange: (realms: number[] | null) => void
  counts: Map<number, number>
}

export function RealmPicker({ regionData, selected, onChange, counts }: Props) {
  const [open, setOpen] = useState(selected !== null)
  const [query, setQuery] = useState('')
  const realms = useMemo(() => {
    const list = Object.values(regionData?.realms ?? {})
    list.sort((a, b) => (a.names[0] ?? '').localeCompare(b.names[0] ?? ''))
    return list
  }, [regionData])
  const visible = query ? realms.filter((r) => r.names.some((n) => n.toLowerCase().includes(query.toLowerCase()))) : realms
  const isOn = (id: number) => selected === null || selected.includes(id)
  const toggle = (id: number) => {
    const all = realms.map((r) => r.id)
    const current = selected ?? all
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    onChange(next.length === all.length ? null : next)
  }

  return (
    <div className="card">
      <h2>
        Realms
        <span className="right">
          {selected !== null && (
            <button className="link-btn" onClick={() => onChange(null)}>
              all
            </button>
          )}
          <button className="link-btn" onClick={() => setOpen(!open)}>
            {open ? 'hide' : selected === null ? 'all realms' : `${selected.length} selected`}
          </button>
        </span>
      </h2>
      {open && (
        <>
          <input type="search" placeholder="Search realm…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="realm-list">
            {visible.map((r) => (
              <label key={r.id}>
                <input type="checkbox" checked={isOn(r.id)} onChange={() => toggle(r.id)} />
                <span style={{ flex: 1 }}>{r.names.join(' / ')}</span>
                <span className="faint">{counts.get(r.id) ?? 0}</span>
              </label>
            ))}
            {visible.length === 0 && <div className="empty">No realm matches.</div>}
          </div>
        </>
      )}
    </div>
  )
}
