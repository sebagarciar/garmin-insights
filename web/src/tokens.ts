// Chart colours. Recharts needs real values, not CSS variables, so this file
// mirrors the tokens in styles.css. Change both together.
//
// Only three hues ever carry meaning here: the structural blue for a measured
// series, and the status pair for "better than his normal" / "worse than his
// normal". Everything else is ink or hairline. The sticker palette stays out
// of the chrome, as the design system asks.

export const chartTokens = {
  series: '#0075de',
  seriesSoft: 'rgba(0, 117, 222, 0.10)',
  reference: '#a39e98',
  good: '#008b7d',
  goodSoft: 'rgba(0, 139, 125, 0.10)',
  bad: '#dd5b00',
  grid: '#e6e6e6',
  axis: '#615d59',
  surface: '#ffffff',
} as const

/** Axis defaults shared by every chart: hairline, solid, recessive. */
export const axisProps = {
  stroke: chartTokens.grid,
  tickLine: false,
  axisLine: { stroke: chartTokens.grid },
} as const
