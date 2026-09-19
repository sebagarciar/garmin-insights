import { useCallback, useEffect, useState } from 'react'
import { getActivities, getOverview, getSeries, getStatus } from './api'
import { SyncBar } from './components/SyncBar'
import { MetricCard } from './components/MetricCard'
import { DeviationBars, DeviationChart } from './components/DeviationChart'
import { CorrelationPanel } from './components/CorrelationPanel'
import { QualityPanel } from './components/QualityPanel'
import { ActivityTable } from './components/ActivityTable'
import type { Activity, MetricDef, Overview, Point, Status } from './types'

const RANGES = [30, 60, 90, 180]

export default function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [days, setDays] = useState(90)
  const [selected, setSelected] = useState('hrv_last_night')
  const [series, setSeries] = useState<{ definition: MetricDef; points: Point[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([getStatus(), getOverview(days), getActivities(days)])
      .then(([s, o, a]) => {
        setStatus(s); setOverview(o); setActivities(a); setError(null)
      })
      .catch((e) => setError(String(e)))
  }, [days])

  useEffect(load, [load])

  useEffect(() => {
    getSeries(selected, days).then(setSeries).catch((e) => setError(String(e)))
  }, [selected, days])

  const empty = status !== null && status.counts.days === 0

  return (
    <>
      <nav className="nav-bar">
        <span className="nav-bar__wordmark">Garmin Insights</span>
        <div className="nav-bar__tools">
          {/* One range control above everything, so every chart on the page
              always shows the same slice of time. */}
          <label className="field">
            Range
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((d) => <option key={d} value={d}>last {d} days</option>)}
            </select>
          </label>
        </div>
      </nav>

      <main className="page">
        <header className="page__intro">
          <h1>How today compares to his own normal</h1>
          <p>
            Every figure is measured against Seba's own rolling{' '}
            {status?.baseline_window_days ?? 30} day average, not against a population.
            Zero is an ordinary day for him.
          </p>
        </header>

        <SyncBar status={status} onSynced={load} />

        {error && <p className="error-note">{error}</p>}

        {empty && (
          <section className="empty-state">
            <h2>No data yet</h2>
            <p>Two commands, once:</p>
            <pre>
{`./.venv/bin/python scripts/login.py
./.venv/bin/python scripts/backfill.py --start 2026-01-01`}
            </pre>
            <p>After that, the Sync button above is the only thing you ever need to press.</p>
          </section>
        )}

        {overview && !empty && (
          <>
            <section className="section">
              <div className="section__head">
                <h2>Where he is today</h2>
                <p>Each card shows distance from his own normal. Pick one to chart it below.</p>
              </div>
              <div className="metric-grid">
                {overview.metrics.map((m) => (
                  <MetricCard key={m.key} metric={m} selected={m.key === selected} onSelect={setSelected} />
                ))}
              </div>
            </section>

            {series && (
              <section className="section">
                <div className="section__head">
                  <h2>{series.definition.label}</h2>
                  <p>The measured value against the baseline it is judged by, then the same days as distance from that baseline.</p>
                </div>
                <div className="card">
                  <DeviationChart def={series.definition} points={series.points} />
                  <DeviationBars def={series.definition} points={series.points} />
                </div>
              </section>
            )}

            <section className="section">
              <div className="section__head">
                <h2>Correlation</h2>
                <p>Whether one metric moves another, and after how long.</p>
              </div>
              <div className="card">
                <CorrelationPanel defs={overview.metrics} days={days} />
              </div>
            </section>

            <section className="section">
              <div className="section__head">
                <h2>Activities</h2>
              </div>
              <div className="card">
                <ActivityTable activities={activities} />
              </div>
            </section>

            <section className="section">
              <div className="section__head">
                <h2>Data quality</h2>
                <p>What is missing, stated plainly, because a hidden gap drags a baseline with it.</p>
              </div>
              <div className="card">
                <QualityPanel quality={overview.quality} />
              </div>
            </section>
          </>
        )}
      </main>
    </>
  )
}
