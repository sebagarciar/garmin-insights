import { fullDate } from '../format'
import type { Activity } from '../types'

const duration = (s: number | null) => {
  if (!s) return '--'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

/** Numbers sit right-aligned in tabular figures so a column can be scanned as
 *  a column. The unit lives once in the head rather than on every cell. */
export function ActivityTable({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="muted" style={{ padding: 'var(--s-lg)', margin: 0, fontSize: 'var(--fs-sm)' }}>
      No activities in this window.
    </p>
  }
  return (
    <div className="table-scroll table-scroll--flush">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Activity</th>
            <th className="num">Duration</th>
            <th className="num">Avg HR</th>
            <th className="num">Load</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.activity_id}>
              <td className="key">{fullDate(a.date)}</td>
              <td>{a.name ?? a.type_key ?? 'Activity'}</td>
              <td className="num">{duration(a.duration_s)}</td>
              <td className="num">{a.avg_hr ? Math.round(a.avg_hr) : '--'}</td>
              <td
                className="num"
                title={
                  a.load_basis === 'estimated'
                    ? 'No heart rate recorded, so Garmin scored no load. Estimated from the median load per minute of your own sessions of this type.'
                    : "Garmin's own training load for the session"
                }
              >
                {a.load ?? '--'}
                {a.load_basis === 'estimated' && <span className="estimated">est</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
