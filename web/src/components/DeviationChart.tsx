import { useState } from 'react'
import type { Key } from 'react'
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { deviationTone, formatBare, fullDate, niceAxis, shortDate, verdictOf } from '../format'
import { axisProps, chartTokens } from '../tokens'
import { ChartTooltip, Legend } from './ChartBits'
import type { MetricDef, Point } from '../types'

/** Recharts hands a custom dot renderer a wide prop bag; these are the
 *  three fields we use out of it. */
interface DotProps {
  key?: Key | null
  cx?: number
  cy?: number
  payload?: { date: string }
}

/** The measured value against its own trailing baseline.
 *  Two series, so a legend is always shown. The baseline is drawn dashed
 *  because it is a reference, not a measurement. */
export function DeviationChart({ def, points }: { def: MetricDef; points: Point[] }) {
  const data = points.map((p) => ({
    ...p,
    displayValue: p.value === null ? null : p.value / (def.scale || 1),
    displayBaseline: p.baseline === null ? null : p.baseline / (def.scale || 1),
  }))
  const lastReal = [...data].reverse().find((p) => p.displayValue !== null)
  const yAxis = niceAxis(
    data.flatMap((p) => [p.displayValue, p.displayBaseline]).filter((v): v is number => v !== null),
  )

  return (
    <div className="chart">
      <div className="chart__header">
        <span className="eyebrow">Reading vs normal{def.unit ? ` · ${def.unit}` : ''}</span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={chartTokens.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={44} {...axisProps} />
          <YAxis domain={yAxis?.domain} ticks={yAxis?.ticks} width={40} {...axisProps} />
          <Tooltip
            cursor={{ stroke: chartTokens.gridStrong }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <ChartTooltip
                  title={fullDate(String(label))}
                  rows={[
                    {
                      label: def.label,
                      color: chartTokens.series,
                      value: row.displayValue === null ? 'no reading' : row.displayValue.toFixed(def.precision),
                    },
                    {
                      label: 'your normal',
                      shape: 'dashed',
                      value: row.displayBaseline === null ? '--' : row.displayBaseline.toFixed(def.precision),
                    },
                    {
                      label: 'difference',
                      color: 'transparent',
                      value: row.deviation_pct === null ? '--' : `${row.deviation_pct > 0 ? '+' : ''}${row.deviation_pct}%`,
                    },
                  ]}
                />
              )
            }}
          />
          <Line
            type="monotone" dataKey="displayBaseline" stroke={chartTokens.reference}
            strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false}
          />
          <Line
            type="monotone" dataKey="displayValue" stroke={chartTokens.series} strokeWidth={2}
            connectNulls={false} isAnimationActive={false}
            dot={(props: DotProps) => {
              // Only today is marked. A dot on all ninety would be a wall.
              if (!lastReal || props.payload?.date !== lastReal.date) return <g key={props.key} />
              return (
                <circle
                  key={props.key} cx={props.cx} cy={props.cy} r={3.5}
                  fill={chartTokens.series} stroke={chartTokens.surface} strokeWidth={2}
                />
              )
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <Legend
        entries={[
          { label: def.label, color: chartTokens.series },
          { label: 'your rolling normal', color: chartTokens.reference, shape: 'dashed' },
        ]}
      />
      <p className="chart__caption">
        Gaps are days with no reading, drawn as gaps rather than joined up, so a week
        the watch was off never looks like a flat week.
      </p>
    </div>
  )
}

/** The same series as distance from normal, with each day coloured by whether
 *  that distance was good or bad for this particular metric. Zero is an
 *  ordinary day. HRV up is good, resting heart rate up is not, and the chart
 *  knows the difference. */
export function DeviationBars({ def, points }: { def: MetricDef; points: Point[] }) {
  const [showTable, setShowTable] = useState(false)
  const withReadings = points.filter((p) => p.deviation_pct !== null)

  return (
    <div className="chart">
      <div className="chart__header">
        <span className="eyebrow">Distance from normal · %</span>
        <button className="button-utility" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Show chart' : 'Show numbers'}
        </button>
      </div>

      {showTable ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>
                <th className="num">Normal</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="key">{fullDate(p.date)}</td>
                  <td className="num">{formatBare(def, p.value)}</td>
                  <td className="num">{formatBare(def, p.baseline)}</td>
                  <td className="num">{p.deviation_pct === null ? '--' : `${p.deviation_pct > 0 ? '+' : ''}${p.deviation_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chartTokens.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={44} {...axisProps} />
              <YAxis width={40} unit="%" tickCount={5} {...axisProps} />
              <ReferenceLine y={0} stroke={chartTokens.reference} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as Point
                  const tone = deviationTone(def, row.deviation_pct)
                  return (
                    <ChartTooltip
                      title={fullDate(String(label))}
                      rows={[{
                        label: verdictOf(tone, row.deviation_pct),
                        color: tone === 'good' ? chartTokens.good : tone === 'bad' ? chartTokens.bad : chartTokens.reference,
                        shape: 'block',
                        value: row.deviation_pct === null ? '--' : `${row.deviation_pct > 0 ? '+' : ''}${row.deviation_pct}%`,
                      }]}
                    />
                  )
                }}
              />
              <Bar dataKey="deviation_pct" radius={2} maxBarSize={14} isAnimationActive={false}>
                {points.map((p) => {
                  const tone = deviationTone(def, p.deviation_pct)
                  return (
                    <Cell
                      key={p.date}
                      fill={tone === 'good' ? chartTokens.good : tone === 'bad' ? chartTokens.bad : chartTokens.reference}
                    />
                  )
                })}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
          <Legend
            entries={[
              { label: 'better than your normal', color: chartTokens.good, shape: 'block' },
              { label: 'worse than your normal', color: chartTokens.bad, shape: 'block' },
              { label: 'within 3%, an ordinary day', color: chartTokens.reference, shape: 'block' },
            ]}
          />
          <p className="chart__caption">
            {withReadings.length} days with a reading in this window.{' '}
            {def.better === 'higher' ? 'Higher is better for this metric.' : 'Lower is better for this metric.'}
          </p>
        </>
      )}
    </div>
  )
}
