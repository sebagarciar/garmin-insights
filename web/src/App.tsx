import { useCallback, useEffect, useState } from 'react'
import { getActivities, getOverview, getSeries, getSleepTiming, getStatus } from './api'
import { TopBar } from './components/TopBar'
import { Today } from './components/Today'
import { MetricCard } from './components/MetricCard'
import { DeviationBars, DeviationChart } from './components/DeviationChart'
import { CorrelationPanel } from './components/CorrelationPanel'
import { QualityPanel } from './components/QualityPanel'
import { ActivityTable } from './components/ActivityTable'
import { BedtimeTable, RoughNightPanel } from './components/SleepTimingPanel'
import { fullDate, readToday } from './format'
import type { Activity, MetricDef, Overview, Point, SleepTiming, Status } from './types'

const RANGES = [30, 60, 90, 180]

export default function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [days, setDays] = useState(90)
  const [selected, setSelected] = useState('hrv_last_night')
  const [series, setSeries] = useState<{ definition: MetricDef; points: Point[] } | null>(null)
  const [timing, setTiming] = useState<SleepTiming | null>(null)
  const [excludeRough, setExcludeRough] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([getStatus(), getOverview(days), getActivities(days), getSleepTiming(days)])
      .then(([s, o, a, t]) => {
        setStatus(s); setOverview(o); setActivities(a); setTiming(t); setError(null)
      })
      .catch((e) => setError(String(e)))
  }, [days])

  useEffect(load, [load])

  useEffect(() => {
    getSeries(selected, days).then(setSeries).catch((e) => setError(String(e)))
  }, [selected, days])

  const empty = status !== null && status.counts.days === 0
  const asOf = overview ? readToday(overview.metrics).date : null
  const readings = series ? series.points.filter((p) => p.value !== null).length : 0

  return (
    <>
      <TopBar status={status} days={days} onDays={setDays} ranges={RANGES} onSynced={load} />

      <main className="page">
        {overview && !empty && <Today metrics={overview.metrics} />}

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
                <div className="section__head-text">
                  <h2>Every metric</h2>
                  <p>
                    Distance from your own rolling {status?.baseline_window_days ?? 30} day
                    normal. Pick one to chart it below.
                  </p>
                </div>
                {asOf && <span className="section__aside">as of {fullDate(asOf)}</span>}
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
                  <div className="section__head-text">
                    <h2>{series.definition.label}</h2>
                    <p>The reading against the normal it is judged by, then the same days as distance from it.</p>
                  </div>
                  <span className="section__aside">{readings} readings in this window</span>
                </div>
                <div className="card">
                  <DeviationChart def={series.definition} points={series.points} />
                  <DeviationBars def={series.definition} points={series.points} />
                </div>
              </section>
            )}

            {timing && (
              <>
                <section className="section">
                  <div className="section__head">
                    <div className="section__head-text">
                      <h2>What time you fell asleep</h2>
                      <p>Every night in this window, grouped by the hour you went under.</p>
                    </div>
                    <span className="section__aside">{timing.nights} nights</span>
                  </div>
                  <div className="card">
                    <BedtimeTable
                      timing={timing}
                      excludeRough={excludeRough}
                      onExcludeRough={setExcludeRough}
                    />
                  </div>
                </section>

                <section className="section">
                  <div className="section__head">
                    <div className="section__head-text">
                      <h2>Rough nights</h2>
                      <p>Nights your body worked through instead of resting, and what each cost you.</p>
                    </div>
                  </div>
                  <div className="card">
                    <RoughNightPanel timing={timing} />
                  </div>
                </section>
              </>
            )}

            <section className="section">
              <div className="section__head">
                <div className="section__head-text">
                  <h2>Correlation</h2>
                  <p>Whether one metric moves another, and after how long.</p>
                </div>
              </div>
              <div className="card">
                <CorrelationPanel defs={overview.metrics} days={days} />
              </div>
            </section>

            <section className="section">
              <div className="section__head">
                <div className="section__head-text">
                  <h2>Activities</h2>
                  <p>Garmin's own training load for each session, estimated only where it scored none.</p>
                </div>
                <span className="section__aside">{activities.length} in this window</span>
              </div>
              <div className="card card--flush">
                <ActivityTable activities={activities} />
              </div>
            </section>

            <section className="section">
              <div className="section__head">
                <div className="section__head-text">
                  <h2>Data quality</h2>
                  <p>What is missing, stated plainly, because a hidden gap drags a baseline with it.</p>
                </div>
              </div>
              <div className="card">
                <QualityPanel quality={overview.quality} status={status} />
              </div>
            </section>

            <p className="footnote">
              Every figure is measured against your own rolling{' '}
              {status?.baseline_window_days ?? 30} day average, not against a population, and a
              baseline is withheld until it has at least seven real readings behind it. Nothing
              leaves this machine except the login to Garmin.
            </p>
          </>
        )}
      </main>
    </>
  )
}
