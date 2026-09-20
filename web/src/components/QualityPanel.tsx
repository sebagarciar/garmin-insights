import { fullDate } from '../format'
import type { QualityReport, Status } from '../types'

/** Missing data is stated, never smoothed over: a gap that is not visible
 *  ends up looking like a low reading and drags a baseline with it.
 *
 *  This is also where the size of the archive lives. It belongs next to what
 *  is missing from it, not in the header competing with today's numbers. */
export function QualityPanel({ quality, status }: { quality: QualityReport; status: Status | null }) {
  const missingDays = new Set(
    quality.problems.filter((p) => p.status === 'missing').map((p) => p.date),
  )
  const errors = quality.problems.filter((p) => p.status === 'error')

  const stats: { value: string; label: string; tone?: 'bad' }[] = [
    { value: String(status?.counts.days ?? 0), label: 'days stored' },
    { value: String(status?.counts.activities ?? 0), label: 'activities' },
    { value: String(quality.days), label: 'days in range' },
    { value: String(missingDays.size), label: 'with no reading', tone: missingDays.size ? 'bad' : undefined },
    { value: String(quality.never_pulled.length), label: 'never pulled', tone: quality.never_pulled.length ? 'bad' : undefined },
    { value: String(errors.length), label: 'endpoint errors', tone: errors.length ? 'bad' : undefined },
  ]

  return (
    <div className="quality">
      <div className="stat-row">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <span className="stat__value" data-tone={s.tone}>{s.value}</span>
            <span className="stat__label">{s.label}</span>
          </div>
        ))}
      </div>

      {quality.never_pulled.length === 0 && missingDays.size === 0 && errors.length === 0 && (
        <p className="caption" style={{ margin: 0 }}>
          Every day in this window was pulled and had a reading.
        </p>
      )}

      {quality.never_pulled.length > 0 && (
        <details>
          <summary>{quality.never_pulled.length} days never pulled from Garmin</summary>
          <p className="quality__dates">{quality.never_pulled.map(fullDate).join(' · ')}</p>
        </details>
      )}

      {missingDays.size > 0 && (
        <details>
          <summary>{missingDays.size} days with no reading (watch not worn, or not synced)</summary>
          <p className="quality__dates">{[...missingDays].map(fullDate).join(' · ')}</p>
        </details>
      )}

      {errors.length > 0 && (
        <details open>
          <summary>{errors.length} endpoint errors</summary>
          <ul className="quality__dates">
            {errors.map((e) => (
              <li key={`${e.date}-${e.metric}`}>{fullDate(e.date)} {e.metric}: {e.detail}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
