// Mirrors what api/main.py returns. One place to change if the API changes.

export interface MetricDef {
  key: string
  label: string
  unit: string
  better: 'higher' | 'lower'
  precision: number
  scale: number
}

export interface Point {
  date: string
  value: number | null
  baseline: number | null
  baseline_n: number
  deviation_pct: number | null
}

export interface MetricSnapshot extends MetricDef {
  latest: Point | null
  points: Point[]
}

export interface LoadPoint {
  date: string
  load: number
  acute: number
  chronic: number | null
  ratio: number | null
  warmed_up: boolean
  chronic_sessions: number
  enough_sessions: boolean
  zone: string | null
  zone_label: string | null
}

export interface QualityReport {
  start: string
  end: string
  days: number
  never_pulled: string[]
  by_metric: Record<string, Record<string, number>>
  problems: { date: string; metric: string; status: string; detail: string | null }[]
}

export interface Overview {
  start: string
  end: string
  metrics: MetricSnapshot[]
  load: LoadPoint[]
  load_latest: LoadPoint | null
  quality: QualityReport
}

export interface SyncRun {
  id: number
  started_at: string
  finished_at: string | null
  mode: string
  start_date: string
  end_date: string
  days_ok: number
  days_partial: number
  days_failed: number
  activities_written: number
  status: string
  error: string | null
}

export interface Status {
  counts: { days: number; activities: number }
  first_day: string | null
  last_day: string | null
  last_sync_at: string | null
  authenticated: boolean
  baseline_window_days: number
  recent_runs: SyncRun[]
}

export interface Correlation {
  x: string
  y: string
  lag: number
  n: number
  r: number | null
  strength: string
  points: { date: string; x: number; y: number }[]
}

export interface Activity {
  activity_id: number
  date: string
  start_local: string | null
  type_key: string | null
  name: string | null
  duration_s: number | null
  distance_m: number | null
  avg_hr: number | null
  max_hr: number | null
  garmin_load: number | null
  computed_load: number | null
  load_source: string | null
  /** The one load figure the dashboard uses: Garmin's own, or an estimate
   *  from his median for that activity type when Garmin scored none. */
  load: number | null
  load_basis: 'garmin' | 'estimated' | 'unknown'
}
