import { useState } from 'react'
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { deviationTone, formatValue, shortDate } from '../format'
import { axisProps, chartTokens } from '../tokens'
import { ChartTooltip, Legend } from './ChartBits'
import type { MetricDef, Point } from '../types'

/** The measured value against its own trailing baseline.
 *  Two series, so a legend is always shown. The baseline is drawn dashed
 *  because it is a reference, not a measurement. */
export function DeviationChart({ def, points }: { def: MetricDef; points: Point[] }) {
  const data = points.map((p) => ({
    ...p,
    displayValue: p.value === null ? null : p.value / (def.scale || 1),
    displayBaseline: p.baseline === null ? null : p.baseline / (def.scale || 1),
  }))

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={chartTokens.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
          <YAxis domain={['auto', 'auto']} width={48} {...axisProps} />
          <Tooltip
            cursor={{ stroke: chartTokens.grid }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as (typeof data)[number]
              return (
                <ChartTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: def.label,
                      color: chartTokens.series,
                      value: row.displayValue === null ? 'no reading' : row.displayValue.toFixed(def.precision),
                    },
                    {
                      label: 'his normal',
                      value: row.displayBaseline === null ? '--' : row.displayBaseline.toFixed(def.precision),
                    },
                    {
                      label: 'vs normal',
                      color: chartTokens.surface,
                      value: row.deviation_pct === null ? '--' : `${row.deviation_pct > 0 ? '+' : ''}${row.deviation_pct}%`,
                    },
                  ]}
                />
              )
            }}
          />
          <Area
            type="monotone" dataKey="displayBaseline" stroke={chartTokens.reference}
            strokeWidth={1.5} strokeDasharray="4 4" fill={chartTokens.reference}
            fillOpacity={0.07} isAnimationActive={false}
          />
          <Line
            type="monotone" dataKey="displayValue" stroke={chartTokens.series} strokeWidth={2}
            dot={false} connectNulls={false} isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend
        entries={[
          { label: def.label, color: chartTokens.series },
          { label: `his rolling normal`, color: chartTokens.reference, shape: 'dashed' },
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
        <span className="eyebrow">Distance from normal</span>
        <button className="button-utility" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Show chart' : 'Show numbers'}
        </button>
      </div>

      {showTable ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Date</th><th>{def.label}</th><th>Normal</th><th>Difference</th></tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{formatValue(def, p.value)}</td>
                  <td>{formatValue(def, p.baseline)}</td>
                  <td>{p.deviation_pct === null ? '--' : `${p.deviation_pct > 0 ? '+' : ''}${p.deviation_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chartTokens.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
              <YAxis width={48} unit="%" {...axisProps} />
              <ReferenceLine y={0} stroke={chartTokens.axis} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as Point
                  const tone = deviationTone(def, row.deviation_pct)
                  return (
                    <ChartTooltip
                      title={String(label)}
                      rows={[{
                        label: tone === 'neutral' ? 'in line with normal' : tone === 'good' ? 'better than normal' : 'worse than normal',
                        color: tone === 'good' ? chartTokens.good : tone === 'bad' ? chartTokens.bad : chartTokens.reference,
                        value: row.deviation_pct === null ? '--' : `${row.deviation_pct > 0 ? '+' : ''}${row.deviation_pct}%`,
                      }]}
                    />
                  )
                }}
              />
              <Bar dataKey="deviation_pct" radius={[3, 3, 0, 0]} isAnimationActive={false}>
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
              { label: 'better than his normal', color: chartTokens.good, shape: 'block' },
              { label: 'worse than his normal', color: chartTokens.bad, shape: 'block' },
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
