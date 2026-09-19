// Display helpers. Kept apart from the components so restyling never has to
// touch the rounding rules.

import type { MetricDef, Point } from './types'

export function formatValue(def: MetricDef, value: number | null): string {
  if (value === null || value === undefined) return '--'
  const scaled = value / (def.scale || 1)
  return scaled.toFixed(def.precision) + (def.unit ? ` ${def.unit}` : '')
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

export const shortDate = (iso: string) => iso.slice(5).replace('-', '/')

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
