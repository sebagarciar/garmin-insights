// Display helpers. Kept apart from the components so restyling never has to
// touch the rounding rules.

import type { MetricDef, MetricSnapshot, Point } from './types'

export function formatValue(def: MetricDef, value: number | null): string {
  if (value === null || value === undefined) return '--'
  const scaled = value / (def.scale || 1)
  return scaled.toFixed(def.precision) + (def.unit ? ` ${def.unit}` : '')
}

/** The same number without its unit, for when the unit is already on the axis
 *  or in the column head and repeating it is noise. */
export function formatBare(def: MetricDef, value: number | null): string {
  if (value === null || value === undefined) return '--'
  return (value / (def.scale || 1)).toFixed(def.precision)
}

export function formatDeviation(pct: number | null): string {
  if (pct === null || pct === undefined) return '--'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`
}

/** Is this deviation a good thing? Depends on the metric: HRV up is good,
 *  resting heart rate up is not. Returns 'good' | 'bad' | 'neutral'. */
export function deviationTone(def: MetricDef, pct: number | null): 'good' | 'bad' | 'neutral' {
  if (pct === null || Math.abs(pct) < 3) return 'neutral'
  const up = pct > 0
  const wantUp = def.better === 'higher'
  return up === wantUp ? 'good' : 'bad'
}

export function verdictOf(tone: 'good' | 'bad' | 'neutral', pct: number | null): string {
  if (pct === null) return 'no baseline yet'
  if (tone === 'neutral') return 'in line with normal'
  return tone === 'good' ? 'better than normal' : 'worse than normal'
}

// ---------- dates ----------
// An ISO day is split by hand rather than handed to Date(), which reads a bare
// "2026-06-27" as UTC midnight and can render it as the day before.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

/** Axis ticks: "27 Jun". Never 06/27, which half the world reads as 6 July. */
export const shortDate = (iso: string) => {
  const { m, d } = parts(iso)
  return `${d} ${MONTHS[m - 1]}`
}

/** Tooltips and table rows: "Sat 27 Jun". */
export const fullDate = (iso: string) => {
  const { y, m, d } = parts(iso)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${wd} ${d} ${MONTHS[m - 1]}`
}

export function sinceLabel(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export const latestReal = (points: Point[]): Point | null =>
  [...points].reverse().find((p) => p.value !== null) ?? null

// ---------- today ----------

export interface Standout {
  metric: MetricSnapshot
  pct: number
  tone: 'good' | 'bad'
}

export interface TodayRead {
  date: string | null
  good: number
  bad: number
  neutral: number
  standout: Standout | null
}

/** What today actually says, before any chart is drawn. The standout is the
 *  metric furthest from its own normal in either direction; a day where
 *  nothing moved has none, and says so. Metrics with no baseline yet are
 *  counted nowhere, because the API withholds a deviation until the window
 *  has enough real readings behind it. */
export function readToday(metrics: MetricSnapshot[]): TodayRead {
  let good = 0, bad = 0, neutral = 0
  let standout: Standout | null = null
  let date: string | null = null

  for (const m of metrics) {
    const pct = m.latest?.deviation_pct ?? null
    if (pct === null) continue
    if (m.latest?.date && (date === null || m.latest.date > date)) date = m.latest.date

    const tone = deviationTone(m, pct)
    if (tone === 'good') good++
    else if (tone === 'bad') bad++
    else { neutral++; continue }

    if (standout === null || Math.abs(pct) > Math.abs(standout.pct)) {
      standout = { metric: m, pct, tone }
    }
  }

  return { date, good, bad, neutral, standout }
}

// ---------- correlation ----------

/** Least squares fit, used only to draw the line the r value already states.
 *  Withheld under three points, where a "trend" is just the points joined up. */
export function leastSquares(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  if (points.length < 3) return null
  const n = points.length
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0, den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  if (den === 0) return null
  const slope = num / den
  return { slope, intercept: my - slope * mx }
}

// ---------- axes ----------

/** Recharts' 'auto' domain rounds out to the next nice number, which on a
 *  series that peaks at 95 leaves a quarter of the plot empty above the line;
 *  padding the domain by hand fixes the space but lands ticks on 41, 56, 71.
 *  This does both: a round step, and a domain snapped to it. */
export function niceAxis(values: number[]): { domain: [number, number]; ticks: number[] } | null {
  const real = values.filter((v) => Number.isFinite(v))
  if (real.length === 0) return null

  const min = Math.min(...real)
  const max = Math.max(...real)
  const span = max - min || Math.abs(max) || 1
  const rough = span / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude

  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 1000; t += step) ticks.push(Number(t.toPrecision(12)))

  return { domain: [lo, hi], ticks }
}
