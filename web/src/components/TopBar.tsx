import { useState } from 'react'
import { sync } from '../api'
import { sinceLabel } from '../format'
import type { Status } from '../types'

/** The whole top bar: what state the data is in on the left, every control
 *  that scopes or changes it on the right.
 *
 *  Both filters live here rather than inside the cards, so one range governs
 *  every chart on the page. The Sync button is the only control in the app
 *  that writes anything: nothing syncs on a schedule, data arrives when this
 *  is pressed. */
export function TopBar({ status, days, onDays, ranges, onSynced }: {
  status: Status | null
  days: number
  onDays: (d: number) => void
  ranges: number[]
  onSynced: () => void
}) {
  const [pull, setPull] = useState(7)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const r = await sync(pull)
      setMessage(
        `${r.ok} complete ${r.ok === 1 ? 'day' : 'days'}, ${r.partial} partial, ` +
          `${r.missing} with no data, ${r.activities} activities`,
      )
      onSynced()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <nav className="nav-bar">
      <div className="nav-bar__brand">
        <span className="nav-bar__wordmark">Garmin Insights</span>
        {status && (
          <span className="nav-bar__state">
            <span className="status-dot" data-ok={status.authenticated} />
            {status.authenticated
              ? `synced ${sinceLabel(status.last_sync_at)}`
              : 'not logged in, run scripts/login.py'}
          </span>
        )}
      </div>

      <div className="nav-bar__tools">
        <label className="field">
          Range
          <select value={days} onChange={(e) => onDays(Number(e.target.value))}>
            {ranges.map((d) => <option key={d} value={d}>last {d} days</option>)}
          </select>
        </label>

        <span className="nav-bar__rule" aria-hidden="true" />

        <label className="field">
          Pull
          <select value={pull} onChange={(e) => setPull(Number(e.target.value))} disabled={busy}>
            {[3, 7, 14, 30, 60].map((d) => <option key={d} value={d}>last {d} days</option>)}
          </select>
        </label>
        <button className="button-primary" onClick={run} disabled={busy}>
          {busy ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {busy && <p className="nav-bar__note">Garmin is pulled one day at a time, so this takes a few seconds per day.</p>}
      {message && <p className="nav-bar__note">{message}</p>}
      {error && <p className="nav-bar__note" data-tone="bad">{error}</p>}
    </nav>
  )
}
