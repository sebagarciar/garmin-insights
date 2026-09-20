import { useEffect, useState } from 'react'
import {
  CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { getCorrelation } from '../api'
import { fullDate, leastSquares, niceAxis } from '../format'
import { axisProps, chartTokens } from '../tokens'
import { ChartTooltip } from './ChartBits'
import type { Correlation, MetricDef } from '../types'

const PRESETS: { label: string; x: string; y: string; lag: number }[] = [
  { label: 'Sleep score, next day resting HR', x: 'sleep_score', y: 'resting_hr', lag: 1 },
  { label: 'Training load, next day HRV', x: 'load', y: 'hrv_last_night', lag: 1 },
  { label: 'Sleep duration, same day stress', x: 'sleep_seconds', y: 'stress_avg', lag: 0 },
  { label: 'HRV, same day readiness', x: 'hrv_last_night', y: 'training_readiness', lag: 0 },
]

/** The view Garmin Connect has no answer for: does one metric move another,
 *  and with what delay. One series of points, so no legend: the axes name it. */
export function CorrelationPanel({ defs, days }: { defs: MetricDef[]; days: number }) {
  const [x, setX] = useState(PRESETS[0].x)
  const [y, setY] = useState(PRESETS[0].y)
  const [lag, setLag] = useState(PRESETS[0].lag)
  const [result, setResult] = useState<Correlation | null>(null)
  const [showTable, setShowTable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getCorrelation(x, y, lag, days)
      .then((r) => live && (setResult(r), setError(null)))
      .catch((e) => live && setError(String(e)))
    return () => { live = false }
  }, [x, y, lag, days])

  // "load" is summed from activities rather than being a daily column, so it
  // is offered here without living in the metric catalogue.
  const options = [{ key: 'load', label: 'Training load' }, ...defs.map((d) => ({ key: d.key, label: d.label }))]
  const labelOf = (k: string) => options.find((o) => o.key === k)?.label ?? k

  // The fit only redraws what r already states. It is dashed, like every other
  // reference series here, because it is not a measurement.
  const fit = result ? leastSquares(result.points) : null
  const xs = result?.points.map((p) => p.x) ?? []
  const xAxis = niceAxis(xs)
  const yAxis = niceAxis(result?.points.map((p) => p.y) ?? [])
  const fitLine: [{ x: number; y: number }, { x: number; y: number }] | null =
    fit && xs.length
      ? [
          { x: Math.min(...xs), y: fit.intercept + fit.slope * Math.min(...xs) },
          { x: Math.max(...xs), y: fit.intercept + fit.slope * Math.max(...xs) },
        ]
      : null

  return (
    <>
      <div className="correlation__presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className="button-utility"
            onClick={() => { setX(p.x); setY(p.y); setLag(p.lag) }}
            data-active={p.x === x && p.y === y && p.lag === lag}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="correlation__controls">
        <label className="field">
          When this
          <select value={x} onChange={(e) => setX(e.target.value)}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          moves this
          <select value={y} onChange={(e) => setY(e.target.value)}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          after
          <select value={lag} onChange={(e) => setLag(Number(e.target.value))}>
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={d}>{d === 0 ? 'same day' : `${d} day${d > 1 ? 's' : ''}`}</option>
            ))}
          </select>
        </label>
        {result && result.points.length > 0 && (
          <button className="button-utility" style={{ marginLeft: 'auto' }} onClick={() => setShowTable((s) => !s)}>
            {showTable ? 'Show chart' : 'Show numbers'}
          </button>
        )}
      </div>

      {error && <p className="error-note">{error}</p>}

      {result && (
        <>
          {/* The verdict leads, the coefficient supports it. A reader who does
              not know what r = -0.07 means still gets an answer. */}
          <p className="correlation__verdict">
            <strong>
              {result.strength.charAt(0).toUpperCase() + result.strength.slice(1)}
            </strong>
            {result.r !== null && (
              <>
                <span className="r-value">r = {result.r.toFixed(2)}</span> over {result.n} paired days
              </>
            )}
          </p>

          {showTable ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">{labelOf(x)}</th>
                    <th className="num">{labelOf(y)}{lag > 0 ? `, ${lag} day${lag > 1 ? 's' : ''} later` : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.points].reverse().map((p) => (
                    <tr key={p.date}>
                      <td className="key">{fullDate(p.date)}</td>
                      <td className="num">{Math.round(p.x * 10) / 10}</td>
                      <td className="num">{Math.round(p.y * 10) / 10}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 6, right: 10, bottom: 24, left: 6 }}>
                <CartesianGrid stroke={chartTokens.grid} />
                <XAxis
                  type="number" dataKey="x" name={labelOf(x)} domain={xAxis?.domain} ticks={xAxis?.ticks}
                  label={{ value: labelOf(x), position: 'insideBottom', offset: -18, fill: chartTokens.axis, fontSize: 11 }}
                  {...axisProps}
                />
                <YAxis
                  type="number" dataKey="y" name={labelOf(y)} domain={yAxis?.domain} ticks={yAxis?.ticks} width={68}
                  label={{ value: labelOf(y), angle: -90, position: 'insideLeft', offset: 0, fill: chartTokens.axis, fontSize: 11 }}
                  {...axisProps}
                />
                <ZAxis range={[64, 64]} />
                <Tooltip
                  cursor={{ stroke: chartTokens.gridStrong }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as { date?: string; x: number; y: number }
                    if (!row.date) return null
                    return (
                      <ChartTooltip
                        title={fullDate(row.date)}
                        rows={[
                          { label: labelOf(x), color: chartTokens.series, value: Math.round(row.x * 10) / 10 },
                          { label: labelOf(y), color: chartTokens.reference, value: Math.round(row.y * 10) / 10 },
                        ]}
                      />
                    )
                  }}
                />
                {fitLine && (
                  <ReferenceLine
                    segment={fitLine}
                    stroke={chartTokens.reference}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    ifOverflow="hidden"
                  />
                )}
                <Scatter
                  data={result.points} fill={chartTokens.series} fillOpacity={0.7}
                  stroke={chartTokens.surface} strokeWidth={2} isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}

          <p className="chart__caption">
            {!showTable && fitLine && 'The dashed line is the straight-line fit the r value describes. '}
            Correlation is not cause: two readings from the same body on the same day move
            together for plenty of reasons, and a thin sample can show a pattern that a
            month of extra data erases.
          </p>
        </>
      )}
    </>
  )
}
