import type { QualityReport } from '../types'

/** Missing data is stated, never smoothed over: a gap that is not visible
 *  ends up looking like a low reading and drags a baseline with it. */
export function QualityPanel({ quality }: { quality: QualityReport }) {
  const missingDays = new Set(
    quality.problems.filter((p) => p.status === 'missing').map((p) => p.date),
  )
  const errors = quality.problems.filter((p) => p.status === 'error')

  return (
    <div className="quality">
      <p className="quality__summary">
        {quality.days} days in range. <strong>{missingDays.size}</strong> with a missing
        reading, <strong>{quality.never_pulled.length}</strong> never pulled,{' '}
        <strong>{errors.length}</strong> that errored.
      </p>

      {quality.never_pulled.length > 0 && (
        <details>
          <summary>{quality.never_pulled.length} days never pulled from Garmin</summary>
          <p className="quality__dates">{quality.never_pulled.join(', ')}</p>
        </details>
      )}

      {missingDays.size > 0 && (
        <details>
          <summary>{missingDays.size} days with no reading (watch not worn, or not synced)</summary>
          <p className="quality__dates">{[...missingDays].join(', ')}</p>
        </details>
      )}

      {errors.length > 0 && (
        <details open>
          <summary>{errors.length} endpoint errors</summary>
          <ul className="quality__dates">
            {errors.map((e) => (
              <li key={`${e.date}-${e.metric}`}>{e.date} {e.metric}: {e.detail}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
