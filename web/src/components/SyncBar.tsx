import { useState } from 'react'
import { sync } from '../api'
import { sinceLabel } from '../format'
import type { Status } from '../types'

/** The only control in the app that writes anything. Nothing syncs on a
 *  schedule: data arrives when this button is pressed. */
export function SyncBar({ status, onSynced }: { status: Status | null; onSynced: () => void }) {
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const r = await sync(days)
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
    <section className="card sync-bar">
      <div className="sync-bar__facts">
        <span><strong>{status?.counts.days ?? 0}</strong> days stored</span>
        <span><strong>{status?.counts.activities ?? 0}</strong> activities</span>
        <span>last sync {sinceLabel(status?.last_sync_at ?? null)}</span>
        {status && (
          <span>
            <span className="status-dot" data-ok={status.authenticated} />{' '}
            {status.authenticated ? 'Garmin connected' : 'not logged in, run scripts/login.py'}
          </span>
        )}
      </div>

      <div className="sync-bar__controls">
        <label className="field">
          Pull last
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={busy}>
            {[3, 7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <button className="button-primary" onClick={run} disabled={busy}>
          {busy ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {busy && <p className="sync-bar__note">Garmin is pulled one day at a time, so this takes a few seconds per day.</p>}
      {message && <p className="sync-bar__note">{message}</p>}
      {error && <p className="sync-bar__note" data-tone="bad">{error}</p>}
    </section>
  )
}
