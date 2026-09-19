import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { deviationTone, formatDeviation, formatValue } from '../format'
import { chartTokens } from '../tokens'
import type { MetricSnapshot } from '../types'

/** One metric, read the way the PRD asks for: the number is secondary, the
 *  distance from his own normal is the headline.
 *
 *  The verdict never rests on colour alone. An arrow and a written phrase say
 *  the same thing, so the card still works in greyscale or with any kind of
 *  colour blindness. */
export function MetricCard({ metric, onSelect, selected }: {
  metric: MetricSnapshot
  onSelect: (key: string) => void
  selected: boolean
}) {
  const latest = metric.latest
  const pct = latest?.deviation_pct ?? null
  const tone = deviationTone(metric, pct)
  const spark = metric.points.filter((p) => p.value !== null)

  const arrow = pct === null ? '' : pct > 0 ? '↑' : pct < 0 ? '↓' : ''
  const verdict =
    pct === null ? 'no baseline yet'
      : tone === 'neutral' ? 'in line with normal'
      : tone === 'good' ? 'better than normal'
      : 'worse than normal'

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
        {formatValue(metric, latest?.value ?? null)}
        <span className="metric-card__baseline">
          {latest?.baseline != null ? ` vs ${formatValue(metric, latest.baseline)}` : ''}
        </span>
      </span>
      <span className="metric-card__spark">
        <ResponsiveContainer width="100%" height={32}>
          <LineChart data={spark} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
            <Line
              type="monotone" dataKey="value" dot={false} strokeWidth={2}
              stroke={chartTokens.series} isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </span>
      {latest?.date && <span className="metric-card__date">as of {latest.date}</span>}
    </button>
  )
}
