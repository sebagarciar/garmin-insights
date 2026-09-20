import type { Key } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { deviationTone, formatBare, formatDeviation, verdictOf } from '../format'
import { chartTokens } from '../tokens'
import type { MetricSnapshot } from '../types'

/** Recharts hands a custom dot renderer a wide prop bag; these are the
 *  three fields we use out of it. */
interface DotProps {
  key?: Key | null
  cx?: number
  cy?: number
  payload?: { date: string }
}

/** One metric, read the way the PRD asks for: the number is secondary, the
 *  distance from his own normal is the headline.
 *
 *  The verdict never rests on colour alone. An arrow and a written phrase say
 *  the same thing, so the card still works in greyscale or with any kind of
 *  colour blindness.
 *
 *  The date is not repeated on every card: one "as of" line above the grid
 *  covers all ten. */
export function MetricCard({ metric, onSelect, selected }: {
  metric: MetricSnapshot
  onSelect: (key: string) => void
  selected: boolean
}) {
  const latest = metric.latest
  const pct = latest?.deviation_pct ?? null
  const tone = deviationTone(metric, pct)

  const arrow = pct === null ? '' : pct > 0 ? '↑' : pct < 0 ? '↓' : ''
  const verdict = verdictOf(tone, pct)

  // Null values are passed through rather than filtered out, so a week the
  // watch was off draws as a gap here exactly as it does in the full chart.
  const spark = metric.points.map((p) => ({ ...p, v: p.value }))
  const lastReal = [...spark].reverse().find((p) => p.v !== null)
  const dotColor = tone === 'good' ? chartTokens.good : tone === 'bad' ? chartTokens.bad : chartTokens.series

  return (
    <button
      className="metric-card"
      data-selected={selected}
      onClick={() => onSelect(metric.key)}
      aria-pressed={selected}
    >
      <span className="metric-card__label">{metric.label}</span>
      <span className="metric-card__deviation" data-tone={tone}>
        <span className="metric-card__arrow" aria-hidden="true">{arrow}</span>
        {formatDeviation(pct)}
      </span>
      <span className="metric-card__verdict">{verdict}</span>
      <span className="metric-card__value">
        {formatBare(metric, latest?.value ?? null)}
        {latest?.baseline != null ? ` vs ${formatBare(metric, latest.baseline)}` : ''}
        {metric.unit ? ` ${metric.unit}` : ''}
      </span>
      <span className="metric-card__spark">
        <ResponsiveContainer width="100%" height={30}>
          <LineChart data={spark} margin={{ top: 4, bottom: 4, left: 2, right: 3 }}>
            <Line
              type="monotone" dataKey="v" strokeWidth={1.5}
              stroke={chartTokens.series} connectNulls={false} isAnimationActive={false}
              dot={(props: DotProps) => {
                // Only the latest reading is marked, in the tone of today's
                // verdict. The rest of the line is shape, not readable values.
                if (!lastReal || props.payload?.date !== lastReal.date) return <g key={props.key} />
                return (
                  <circle
                    key={props.key} cx={props.cx} cy={props.cy} r={2.5}
                    fill={dotColor} stroke={chartTokens.surface} strokeWidth={2}
                  />
                )
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </span>
    </button>
  )
}
