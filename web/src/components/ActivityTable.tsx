import type { Activity } from '../types'

const duration = (s: number | null) => {
  if (!s) return '--'
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function ActivityTable({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return <p className="muted">No activities in this window.</p>
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr><th>Date</th><th>Activity</th><th>Duration</th><th>Avg HR</th><th>Load</th></tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.activity_id}>
              <td>{a.date}</td>
              <td className="text">{a.name ?? a.type_key ?? 'Activity'}</td>
              <td>{duration(a.duration_s)}</td>
              <td>{a.avg_hr ? Math.round(a.avg_hr) : '--'}</td>
              <td
                title={
                  a.load_basis === 'estimated'
                    ? 'No heart rate recorded, so Garmin scored no load. Estimated from the median load per minute of your own sessions of this type.'
                    : "Garmin's own training load for the session"
                }
              >
                {a.load ?? '--'}
                {a.load_basis === 'estimated' && <span className="estimated"> est</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
