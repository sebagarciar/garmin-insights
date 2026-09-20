import type { ReactNode } from 'react'
import { chartTokens } from '../tokens'

export interface LegendEntry {
  label: string
  color: string
  shape?: 'line' | 'block' | 'dashed'
}

/** A legend is present whenever a chart draws two or more series, so identity
 *  never rests on colour alone. A single-series chart is named by its heading
 *  and gets none. */
export function Legend({ entries }: { entries: LegendEntry[] }) {
  return (
    <div className="legend">
      {entries.map((e) => (
        <span className="legend__item" key={e.label}>
          <span
            className="legend__swatch"
            data-shape={e.shape ?? 'line'}
            style={e.shape === 'dashed' ? undefined : { background: e.color }}
          />
          {e.label}
        </span>
      ))}
    </div>
  )
}

export interface TooltipRow {
  label: string
  value: ReactNode
  color?: string
  shape?: 'line' | 'block' | 'dashed'
}

/** One tooltip shape for every chart. Values sit in ink, with a small coloured
 *  swatch carrying identity, rather than colouring the text itself. A row with
 *  no swatch (a derived figure, not a series) passes colour 'transparent'. */
export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="tooltip">
      <div className="tooltip__date">{title}</div>
      {rows.map((r) => (
        <div className="tooltip__row" key={r.label}>
          <span
            className="tooltip__swatch"
            data-shape={r.shape ?? 'line'}
            style={r.shape === 'dashed' ? undefined : { background: r.color ?? chartTokens.reference }}
          />
          {r.label}
          <span className="tooltip__value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}
