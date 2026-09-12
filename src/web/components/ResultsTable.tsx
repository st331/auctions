import { useEffect } from 'react'
import { wowheadDataAttr, wowheadItemUrl } from '../../shared/blizzard.ts'
import { formatCopperExact, formatGold, statLabel } from '../../shared/decode.ts'
import type { DecodedAuction, SortKey, SortSpec } from '../../shared/filters.ts'
import { CURRENT_SEASON, seasonItemMap } from '../../shared/season.ts'
import type { RegionData } from '../../shared/types.ts'
import { formatRelative, itemIconUrl } from '../lib/data.ts'

export interface VerifyResult {
  ok: boolean
  at: string
}

export interface LiveRealm {
  at: string
  lastModified?: string
}

interface Props {
  rows: DecodedAuction[]
  total: number
  sort: SortSpec
  onSort: (key: SortKey) => void
  regionData: RegionData | null
  region: string | null
  busyRealm: number | null
  liveRealms: Map<number, LiveRealm>
  verifyResults: Map<string, VerifyResult>
  onVerify: (a: DecodedAuction) => void
  onShowMore: () => void
}

const ITEMS = seasonItemMap(CURRENT_SEASON)
const DIFFICULTY_LABEL = new Map(CURRENT_SEASON.difficulties.map((d) => [d.key, d.label]))
const TIME_LEFT_LABEL: Record<string, string> = { SHORT: '< 30 min', MEDIUM: '30 min – 2 h', LONG: '2 – 12 h', VERY_LONG: '12 – 48 h' }

/** "Aegwynn / Bonechewer +3" for large connected-realm groups; the full list is in the cell's tooltip. */
function realmShortLabel(names: string[]): string {
  if (names.length <= 2) return names.join(' / ')
  return `${names[0]} / ${names[1]} +${names.length - 2}`
}

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'item', label: 'Item' },
  { key: 'ilvl', label: 'iLvl' },
  { key: null, label: 'Secondaries' },
  { key: null, label: 'Extras' },
  { key: 'buyout', label: 'Buyout' },
  { key: 'realm', label: 'Realm' },
  { key: 'timeLeft', label: 'Time left' },
  { key: null, label: 'Verify' },
]

export function ResultsTable({ rows, total, sort, onSort, regionData, region, busyRealm, liveRealms, verifyResults, onVerify, onShowMore }: Props) {
  useEffect(() => {
    window.$WowheadPower?.refreshLinks?.()
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <div className="empty">No listings match the current filters.</div>
      </div>
    )
  }

  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.label} className={c.key ? 'sortable' : ''} onClick={c.key ? () => onSort(c.key as SortKey) : undefined}>
                {c.label}
                {c.key && sort.key === c.key && <span className="arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const item = ITEMS.get(a.item)
            const realm = regionData?.realms[String(a.cr)]
            const live = liveRealms.get(a.cr)
            const result = verifyResults.get(`${a.cr}:${a.id}`)
            const busy = busyRealm === a.cr
            const d = a.decoded
            return (
              <tr key={`${a.cr}:${a.id}`} className={`${live ? 'verified-live' : ''} ${realm?.stale ? 'stale' : ''}`}>
                <td>
                  <div className="item-cell">
                    <img src={itemIconUrl(a.item)} alt="" loading="lazy" />
                    <div>
                      <a href={wowheadItemUrl(a.item, a.b, a.m, region ?? undefined)} data-wowhead={wowheadDataAttr(a.item, a.b, a.m)} target="_blank" rel="noreferrer">
                        {item?.name ?? `Item ${a.item}`}
                      </a>
                      <div className="slot">
                        {item?.category.label} · {item?.slot}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="ilvl">{d.ilvl || '?'}</span>
                  {d.difficulty && <span className={`badge ${d.difficulty}`} style={{ marginLeft: 6 }}>{DIFFICULTY_LABEL.get(d.difficulty)}</span>}
                  {d.track && (
                    <span className="track">
                      {d.track.name} {d.track.level}/{d.track.max}
                    </span>
                  )}
                </td>
                <td className="stats">
                  {d.secondaries.length === 0 ? (
                    <span className="faint">unknown</span>
                  ) : (
                    d.secondaries.map((s, i) => (
                      <span key={s}>
                        {i > 0 && <span className="sep">/</span>}
                        <span className={i === 0 ? 'major' : 'minor'}>{statLabel(s, true)}</span>
                      </span>
                    ))
                  )}
                </td>
                <td>
                  {d.socket && <span className="badge socket">Socket</span>}{' '}
                  {d.tertiary !== undefined && <span className="badge tert">{statLabel(d.tertiary)}</span>}
                  {!d.socket && d.tertiary === undefined && <span className="faint">—</span>}
                </td>
                <td className="price" title={formatCopperExact(a.buyout)}>
                  {formatGold(a.buyout)}
                </td>
                <td title={realm?.names.join(' / ')}>
                  {realm ? realmShortLabel(realm.names) : `Realm ${a.cr}`}
                  {realm?.stale && (
                    <span className="badge" style={{ marginLeft: 6 }} title="The last scan could not download this realm; showing older data">
                      stale
                    </span>
                  )}
                </td>
                <td>
                  <span className={`time-left ${a.tl ?? ''}`}>{a.tl ? TIME_LEFT_LABEL[a.tl] ?? a.tl : '—'}</span>
                </td>
                <td>
                  <div className="verify-cell">
                    {busy ? (
                      <>
                        <span className="spinner" /> <span className="muted">checking realm…</span>
                      </>
                    ) : (
                      <>
                        <button className="btn small" onClick={() => onVerify(a)} title="Re-download this realm's auction house from Blizzard now">
                          {live ? 'Re-check' : 'Verify'}
                        </button>
                        {result?.ok && <span className="ok">✓ listed {formatRelative(result.at)}</span>}
                        {!result && live && <span className="faint">live {formatRelative(live.at)}</span>}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length < total && (
        <div className="pager">
          <button className="btn" onClick={onShowMore}>
            Show more ({total - rows.length} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
