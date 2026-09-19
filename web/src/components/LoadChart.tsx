import {
  Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { shortDate } from '../format'
import { axisProps, chartTokens } from '../tokens'
import { ChartTooltip, Legend } from './ChartBits'
import type { LoadPoint } from '../types'

/** Two charts, not one with two scales.
 *
 *  Load and the acute:chronic ratio have unrelated units, and putting them on
 *  twin y-axes lets the reader see a relationship that the alignment of the
 *  two scales invented. Stacked over a shared x-axis, every comparison the
 *  reader makes is one they actually made themselves. */
export function LoadCharts({ points }: { points: LoadPoint[] }) {
  return (
    <>
      <div className="chart">
        <div className="chart__header">
          <span className="eyebrow">Load per day</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chartTokens.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
            <YAxis width={48} {...axisProps} />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as LoadPoint
                return (
                  <ChartTooltip
                    title={String(label)}
                    rows={[
                      { label: 'that day', color: chartTokens.series, value: row.load },
                      { label: '28 day average', value: row.chronic ?? 'not enough history yet' },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="load" fill={chartTokens.series} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line
              type="monotone" dataKey="chronic" stroke={chartTokens.reference} strokeWidth={2}
              strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <Legend
          entries={[
            { label: 'session load that day', color: chartTokens.series, shape: 'block' },
            { label: '28 day average', color: chartTokens.reference, shape: 'dashed' },
          ]}
        />
        <p className="chart__caption">
          Load per session is Garmin's own training load, which weights intensity
          rather than time on the clock: 35 minutes of intervals outranks a four hour
          round of golf. A session recorded without heart rate has no Garmin score, so
          it is estimated from the median load per minute of your own sessions of that
          type and marked "est" in the activity table.
        </p>
      </div>

      <RatioChart points={points} />
    </>
  )
}

/** The ratio, or an honest explanation of why there isn't one.
 *
 *  Acute:chronic was designed for athletes training several times a week. On
 *  sparse training the 28-day average collapses towards zero and one ordinary
 *  session divides into a number that looks alarming and means nothing, so the
 *  figure is withheld rather than dressed up. */
function RatioChart({ points }: { points: LoadPoint[] }) {
  const latest = points.at(-1)
  const reportable = points.filter((p) => p.ratio !== null)

  if (reportable.length === 0) {
    return (
      <div className="chart">
        <div className="chart__header">
          <span className="eyebrow">Acute : chronic ratio</span>
        </div>
        <div className="empty-state">
          <p>
            Not enough training in this window to say anything. The ratio compares the
            last 7 days against the last 28, and it needs at least 4 sessions inside
            that month before the comparison means anything.{' '}
            {latest && <>There {latest.chronic_sessions === 1 ? 'was 1 session' : `were ${latest.chronic_sessions} sessions`} in the last 28 days.</>}
          </p>
          <p className="caption">
            With fewer than that, a single session divides into a near-zero average and
            reads as a spike that never happened. The load bars above are still real.
          </p>
        </div>
      </div>
    )
  }

  return (
      <div className="chart">
        <div className="chart__header">
          <span className="eyebrow">Acute : chronic ratio</span>
          {latest?.ratio != null && (
            <p className="load-verdict">
              <strong>{latest.ratio.toFixed(2)}</strong>
              <span className="zone-pill" data-zone={latest.zone}>{latest.zone_label}</span>
            </p>
          )}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chartTokens.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
            <YAxis width={48} domain={[0, 2]} {...axisProps} />
            <ReferenceArea y1={0.8} y2={1.3} fill={chartTokens.goodSoft} fillOpacity={1} />
            <ReferenceLine y={1} stroke={chartTokens.grid} />
            <Tooltip
              cursor={{ stroke: chartTokens.grid }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as LoadPoint
                return (
                  <ChartTooltip
                    title={String(label)}
                    rows={[
                      { label: 'ratio', color: chartTokens.series, value: row.ratio ?? '--' },
                      { label: 'last 7 days', value: row.acute },
                      { label: 'last 28 days', value: row.chronic ?? 'not enough history yet' },
                    ]}
                  />
                )
              }}
            />
            <Line
              type="monotone" dataKey="ratio" stroke={chartTokens.series} strokeWidth={2}
              dot={false} connectNulls={false} isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <Legend
          entries={[
            { label: 'acute : chronic', color: chartTokens.series },
            { label: '0.8 to 1.3, in step with the last month', color: chartTokens.good, shape: 'block' },
          ]}
        />
        <p className="chart__caption">
          The ratio starts once 28 days of history sit behind it, and is withheld
          entirely when that month holds fewer than 4 sessions, so a blank stretch is
          a statement about the training rather than about the data.
        </p>
      </div>
  )
}
