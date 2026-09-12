import { useEffect, useState } from 'react'
import { testCredentials, type Credentials } from '../lib/blizzardClient.ts'

interface Props {
  open: boolean
  credentials: Credentials | null
  hint?: string | null
  onSave: (c: Credentials) => void
  onClear: () => void
  onClose: () => void
}

export function SettingsDialog({ open, credentials, hint, onSave, onClear, onClose }: Props) {
  const [clientId, setClientId] = useState(credentials?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState(credentials?.clientSecret ?? '')
  const [status, setStatus] = useState<{ kind: 'ok' | 'bad' | 'busy'; text: string } | null>(null)

  useEffect(() => {
    if (open) {
      setClientId(credentials?.clientId ?? '')
      setClientSecret(credentials?.clientSecret ?? '')
      setStatus(null)
    }
  }, [open, credentials])

  if (!open) return null

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0

  const test = async () => {
    setStatus({ kind: 'busy', text: 'Requesting a token from Blizzard…' })
    try {
      await testCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
      setStatus({ kind: 'ok', text: 'Blizzard accepted the credentials.' })
    } catch (err) {
      setStatus({ kind: 'bad', text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>Real-time verification</h2>
        {hint && <p className="msg-bad">{hint}</p>}
        <p>
          The scan runs every 30 minutes. To check whether a listing is still up <em>right now</em>, the site can re-download that realm's
          auction house directly from Blizzard in your browser. That needs a Blizzard API client:
        </p>
        <ol>
          <li>
            Go to <a href="https://develop.battle.net/access/clients" target="_blank" rel="noreferrer">develop.battle.net/access/clients</a> and create a client
            (any name, no redirect URL needed).
          </li>
          <li>Paste its Client ID and Client Secret below. They are stored only in this browser (localStorage) and are sent only to Blizzard.</li>
        </ol>
        <div className="field">
          <label>Client ID</label>
          <input type="text" autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Client Secret</label>
          <input type="password" autoComplete="off" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
        </div>
        {status && (
          <p className={status.kind === 'ok' ? 'msg-ok' : status.kind === 'bad' ? 'msg-bad' : 'muted'} style={{ marginTop: 10 }}>
            {status.kind === 'busy' && <span className="spinner" />} {status.text}
          </p>
        )}
        <p className="hint">
          Note: Blizzard refreshes each realm's auction snapshot roughly once an hour, so "verified" means "present in Blizzard's latest snapshot".
        </p>
        <div className="actions">
          <button className="btn" onClick={test} disabled={!canSave || status?.kind === 'busy'}>
            Test
          </button>
          {credentials && (
            <button
              className="btn"
              onClick={() => {
                onClear()
                setClientId('')
                setClientSecret('')
                setStatus(null)
              }}
            >
              Forget credentials
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={!canSave} onClick={() => onSave({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
