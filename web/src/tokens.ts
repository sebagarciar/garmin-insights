// Chart colours. Recharts needs real values, not CSS variables, so this file
// mirrors the tokens in styles.css. Change both together.
//
// Only three hues ever carry meaning here: the structural blue for a measured
// series, and the status pair for "better than your normal" / "worse than your
// normal". Everything else is ink or hairline. The sticker palette stays out
// of the chrome, as the design system asks.

export const chartTokens = {
  series: '#0075de',
  seriesSoft: 'rgba(0, 117, 222, 0.10)',
  reference: '#a39e98',
  good: '#008b7d',
  goodSoft: 'rgba(0, 139, 125, 0.10)',
  bad: '#dd5b00',
  grid: '#efeeec',
  gridStrong: '#e6e6e6',
  axis: '#6b6661',
  ink: '#191817',
  surface: '#ffffff',
} as const

/** Axis defaults shared by every chart: hairline, solid, recessive. The axis
 *  line itself is dropped; the outermost gridline already draws it, and two
 *  rules a pixel apart is noise. */
export const axisProps = {
  stroke: chartTokens.grid,
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const
