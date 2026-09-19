// Every call is relative: the Vite proxy handles it in development, FastAPI
// serves both the UI and the API in normal use.

import type { Activity, Correlation, MetricDef, Overview, Point, Status } from './types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export const getStatus = () => get<Status>('/api/status')
export const getOverview = (days: number) => get<Overview>(`/api/overview?days=${days}`)
export const getMetrics = () => get<MetricDef[]>('/api/metrics')
export const getActivities = (days: number) => get<Activity[]>(`/api/activities?days=${days}`)

export const getSeries = (metric: string, days: number) =>
  get<{ metric: string; definition: MetricDef; points: Point[] }>(
    `/api/series?metric=${metric}&days=${days}`,
  )

export const getCorrelation = (x: string, y: string, lag: number, days: number) =>
  get<Correlation>(`/api/correlation?x=${x}&y=${y}&lag=${lag}&days=${days}`)

export interface SyncResult {
  run_id: number
  ok: number
  partial: number
  missing: number
  activities: number
}

export async function sync(days: number): Promise<SyncResult> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail ?? `sync failed (${res.status})`)
  return body as SyncResult
}
