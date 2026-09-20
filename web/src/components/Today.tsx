import { fullDate, readToday } from '../format'
import type { MetricSnapshot } from '../types'

/** The answer, before the evidence.
 *
 *  A dashboard that opens with its own methodology makes the reader do the
 *  work. This opens with the one metric furthest from normal today, then the
 *  tally, and leaves the method to a footnote. The colour is never alone: the
 *  direction is written out, and the tally names each group. */
export function Today({ metrics }: { metrics: MetricSnapshot[] }) {
  const { date, good, bad, neutral, standout } = readToday(metrics)

  const headline = standout
    ? (
        <>
          {standout.metric.label} is{' '}
          <em data-tone={standout.tone}>
            {Math.abs(standout.pct).toFixed(1)}% {standout.pct > 0 ? 'above' : 'below'}
          </em>{' '}
          your normal
        </>
      )
    : good + bad + neutral > 0
      ? <>Every metric is in line with your normal</>
      : <>Not enough history yet to know what your normal is</>

  const tally: { n: number; label: string; tone: 'good' | 'bad' | 'neutral' }[] = [
    { n: bad, label: 'worse than normal', tone: 'bad' },
    { n: good, label: 'better than normal', tone: 'good' },
    { n: neutral, label: 'in line', tone: 'neutral' },
  ]

  return (
    <header className="today">
      <p className="eyebrow">Today{date ? ` · ${fullDate(date)}` : ''}</p>
      <h1>{headline}</h1>
      <p className="today__tally">
        {tally.filter((t) => t.n > 0).map((t) => (
          <span className="today__tally-item" key={t.label}>
            <span className="today__swatch" data-tone={t.tone} />
            <strong>{t.n}</strong> {t.label}
          </span>
        ))}
      </p>
    </header>
  )
}
