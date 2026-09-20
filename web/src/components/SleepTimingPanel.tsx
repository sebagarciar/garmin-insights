import { fullDate } from '../format'
import type { SleepTiming } from '../types'

/** 25.77 back into "01:46". The API keeps onset as hours past midnight so that
 *  later is always a larger number; only the display needs a clock again. */
const clock = (hours: number | null): string => {
  if (hours === null || hours === undefined) return '--'
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const hrs = (seconds: number | null): string =>
  seconds === null || seconds === undefined ? '--' : `${(seconds / 3600).toFixed(2)} h`

const num = (value: number | null): string =>
  value === null || value === undefined ? '--' : String(value)

const signed = (value: number | null): string =>
  value === null || value === undefined ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`

/** The bedtime table.
 *
 *  Two channels, deliberately shown side by side rather than averaged into one
 *  verdict: sleep duration falls from midnight onwards because wake time is
 *  anchored, while the overnight heart figures hold flat until 02:00 and then
 *  step down. Switching the rough nights out is what separates them, so the
 *  toggle is the point of this view rather than an option on it.
 */
export function BedtimeTable({
  timing,
  excludeRough,
  onExcludeRough,
}: {
  timing: SleepTiming
  excludeRough: boolean
  onExcludeRough: (value: boolean) => void
}) {
  return (
    <>
      <div className="toggle-row">
        <span className="toggle-row__label">Count</span>
        <div className="toggle-row__options">
          <button
            type="button"
            className="button-utility"
            data-active={!excludeRough}
            onClick={() => onExcludeRough(false)}
          >
            All nights
          </button>
          <button
            type="button"
            className="button-utility"
            data-active={excludeRough}
            onClick={() => onExcludeRough(true)}
          >
            Excluding rough nights
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Asleep by</th>
              <th className="num">Nights</th>
              <th className="num">Slept</th>
              <th className="num">Woke</th>
              <th className="num">REM</th>
              <th className="num">Resting HR</th>
              <th className="num">HRV</th>
              <th className="num">Rough</th>
            </tr>
          </thead>
          <tbody>
            {timing.buckets.map((b) => {
              const s = excludeRough ? b.clean : b.all
              return (
                <tr key={b.label}>
                  <td className="key">{b.label}</td>
                  <td className="num">{s.nights}</td>
                  {s.enough ? (
                    <>
                      <td className="num">{hrs(s.sleep_seconds)}</td>
                      <td className="num">{clock(s.wake_hours)}</td>
                      <td className="num">{hrs(s.rem_seconds)}</td>
                      <td className="num">{num(s.resting_hr)}</td>
                      <td className="num">{num(s.hrv_last_night)}</td>
                    </>
                  ) : (
                    <td className="num withheld" colSpan={5}>
                      under {timing.min_bucket_nights} nights, no average shown
                    </td>
                  )}
                  <td className="num">
                    {excludeRough ? (
                      <span className="withheld">excluded</span>
                    ) : b.rough_nights > 0 ? (
                      `${b.rough_nights} (${b.rough_rate_pct}%)`
                    ) : (
                      '0'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="chart__caption">
        Resting HR is in bpm and HRV in ms, both measured overnight, and both
        are raw readings rather than distance from a baseline: these are your
        averages for each group of nights, not your deviation. {timing.nights}{' '}
        nights in this window
        {timing.skipped_daytime > 0 &&
          `, plus ${timing.skipped_daytime} daytime record${
            timing.skipped_daytime === 1 ? '' : 's'
          } left out as naps rather than nights`}
        . A group with fewer than {timing.min_bucket_nights} nights shows no
        average at all, for the same reason a baseline is withheld until it has
        seven real readings behind it.
      </p>
    </>
  )
}

/** The rough-night flag.
 *
 *  Flagged on sleep inputs only: overnight stress above his own trailing
 *  normal while REM falls below 70% of it. The heart rate columns are what
 *  that turned out to cost, which is a finding and not part of the test.
 */
export function RoughNightPanel({ timing }: { timing: SleepTiming }) {
  const { rough } = timing
  const cost = rough.cost

  if (rough.eligible === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
        No night in this window has 30 days of sleep behind it yet, so none can
        be judged against its own normal.
      </p>
    )
  }

  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <span className="stat__value">
            {rough.count}
            <span className="stat__of"> of {rough.eligible}</span>
          </span>
          <span className="stat__label">
            rough nights, {rough.rate_pct}% of the nights that could be judged
          </span>
        </div>
        <div className="stat">
          <span className="stat__value" data-tone={cost.resting_hr ? 'bad' : undefined}>
            {signed(cost.resting_hr)}
          </span>
          <span className="stat__label">bpm resting HR, worse than your normal</span>
        </div>
        <div className="stat">
          <span className="stat__value" data-tone={cost.hrv_last_night ? 'bad' : undefined}>
            {signed(cost.hrv_last_night)}
          </span>
          <span className="stat__label">ms HRV, worse than your normal</span>
        </div>
      </div>

      {rough.count === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
          None in this window.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Night</th>
                <th className="num">Asleep</th>
                <th className="num">Slept</th>
                <th className="num">REM</th>
                <th className="num">Your normal REM</th>
                <th className="num">Resting HR</th>
                <th className="num">HRV</th>
              </tr>
            </thead>
            <tbody>
              {rough.nights.map((n) => (
                <tr key={n.date}>
                  <td className="key">{fullDate(n.date)}</td>
                  <td className="num">{clock(n.bedtime_hours)}</td>
                  <td className="num">{hrs(n.sleep_seconds)}</td>
                  <td className="num">{hrs(n.rem_seconds)}</td>
                  <td className="num withheld">{hrs(n.rem_baseline)}</td>
                  <td className="num">
                    {num(n.resting_hr)}
                    <Delta value={n.resting_hr_delta} better="lower" />
                  </td>
                  <td className="num">
                    {num(n.hrv_last_night)}
                    <Delta value={n.hrv_delta} better="higher" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="chart__caption">
        An arrow is distance from that night's own 30 day normal. Lower resting
        HR is better, higher HRV is better. A night is flagged when overnight
        stress runs a full standard deviation above your trailing normal{' '}
        <em>and</em> REM falls to 70% of it. Both tests are on sleep alone:
        flagging on heart rate and then reporting a heart rate cost would only
        restate the definition. How long you slept and when you went to bed are
        not part of the test, and on these nights they come out close to
        ordinary. These are not short nights.
      </p>
    </>
  )
}

/** The arrow and the direction stated in words, never colour on its own: this
 *  dashboard has to work in greyscale and for a reader who cannot separate
 *  teal from orange. The words are in the caption, once, rather than repeated
 *  into every cell of a dense table. */
function Delta({ value, better }: { value: number | null; better: 'higher' | 'lower' }) {
  if (value === null || value === undefined) return null
  const up = value > 0
  const tone = up === (better === 'higher') ? 'good' : 'bad'
  return (
    <span className="delta" data-tone={tone}>
      {up ? '↑' : '↓'}
      {Math.abs(value).toFixed(1)}
      <span className="sr-only">
        {' '}
        {tone === 'good' ? 'better than normal' : 'worse than normal'}
      </span>
    </span>
  )
}
