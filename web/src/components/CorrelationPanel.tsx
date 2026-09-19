import { useEffect, useState } from 'react'
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { getCorrelation } from '../api'
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
 *  and with what delay. One series, so no legend: the heading names it. */
export function CorrelationPanel({ defs, days }: { defs: MetricDef[]; days: number }) {
  const [x, setX] = useState(PRESETS[0].x)
  const [y, setY] = useState(PRESETS[0].y)
  const [lag, setLag] = useState(PRESETS[0].lag)
  const [result, setResult] = useState<Correlation | null>(null)
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
      </div>

      {error && <p className="error-note">{error}</p>}

      {result && (
        <>
          <p className="correlation__verdict">
            {result.r === null
              ? result.strength
              : <>r = <strong>{result.r.toFixed(2)}</strong>, {result.strength}, over {result.n} paired days</>}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
              <CartesianGrid stroke={chartTokens.grid} />
              <XAxis
                type="number" dataKey="x" name={labelOf(x)} domain={['auto', 'auto']}
                label={{ value: labelOf(x), position: 'insideBottom', offset: -16, fill: chartTokens.axis, fontSize: 12 }}
                {...axisProps}
              />
              <YAxis
                type="number" dataKey="y" name={labelOf(y)} domain={['auto', 'auto']} width={56}
                label={{ value: labelOf(y), angle: -90, position: 'insideLeft', fill: chartTokens.axis, fontSize: 12 }}
                {...axisProps}
              />
              <ZAxis range={[70, 70]} />
              <Tooltip
                cursor={{ strokeDasharray: '0', stroke: chartTokens.grid }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as { date: string; x: number; y: number }
                  return (
                    <ChartTooltip
                      title={row.date}
                      rows={[
                        { label: labelOf(x), color: chartTokens.series, value: Math.round(row.x * 10) / 10 },
                        { label: labelOf(y), value: Math.round(row.y * 10) / 10 },
                      ]}
                    />
                  )
                }}
              />
              <Scatter
                data={result.points} fill={chartTokens.series} fillOpacity={0.75}
                stroke={chartTokens.surface} strokeWidth={2} isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="chart__caption">
            Correlation is not cause. Two readings from the same body on the same day
            move together for plenty of reasons, and a thin sample can show a pattern
            that a month of extra data erases.
          </p>
        </>
      )}
    </>
  )
}
