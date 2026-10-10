# Dashboard design rules

Moved out of `garmin/CLAUDE.md` so it only loads when touching `web/`. Read it before changing a colour, a chart or a card.

## The look is a Notion-derived system, and it is tokenised

- `web/src/styles.css` holds every value as a CSS custom property; components never use raw
  hex. `web/src/tokens.ts` mirrors the colours Recharts needs as real values. Change both.
- Warm paper canvas `#f6f5f4`, white cards, 1px `#e6e6e6` hairlines, 12px radius, elevation
  from many near-transparent layers. Inter with negative tracking set at every heading size.
- **One structural accent.** `#0075de` paints the Sync button, the measured series in every
  chart, and the focus ring. Nothing else. The sticker palette (pink, purple, sky, brown)
  never appears in this app.
- **Three hues carry meaning, and only three**: that blue, plus the better/worse pair below.
- **Ink is near-black `#191817`**, never `#000`.
- **The dashboard speaks to Seba, not about him.** "Where you are today", "your normal".
  Never third person.
- **The answer comes before the evidence.** The page opens with the metric furthest from its
  normal today, then the better / worse / in line tally, then the grid. Method is a footnote.
  `readToday()` in `web/src/format.ts` counts only metrics the API gave a deviation for.
- **Prose never outranks the number.** 30px headline, 25px card figure, 19px section
  heading, 13px supporting copy. Section subtitles are one line or absent.
- **A metric card carries five things**: name, deviation, verdict, value vs baseline,
  sparkline. The date is stated once above the grid.
- **No dark mode.** It needs its own teal and orange steps; never fake it with `filter: invert`.

## Why "better" is teal and not green

Sticker green against sticker orange collapses to a colour difference of 1.7 under
protanopia: a red-blind reader could not tell a good day from a bad one. The pair is
`#008b7d` (teal, deepened to clear the chroma floor and 4:1 contrast) against `#dd5b00`,
which separates by 12.1 and passes all six palette checks. Verify changes with the palette validator that ships with the `dataviz` skill
(`validate_palette.js`), run on `#0075de,#008b7d,#dd5b00` in light mode on a `#ffffff` surface.
It is not part of this repo.

Colour never carries a verdict alone: every card shows an arrow and "better than normal" /
"worse than normal", and the deviation chart says which direction is good for that metric.

## Chart rules that are not negotiable

- **No dual-axis charts.** Two scales aligned arbitrarily invent a relationship.
- **Grids are solid hairlines.** Dashes are reserved for reference series that are not
  measurements: the rolling baseline, the 28-day average, the least-squares fit.
- **A legend whenever two or more series are drawn.** A single series gets none.
- **Every chart has a way to read the numbers.** "Show numbers" swaps the detail chart for a
  table. A tooltip is never the only route to a value.
- **Dates on an axis are `27 Jun`, never `06/27`.**
- **Round ticks, full plot.** `niceAxis()` in `web/src/format.ts` snaps the domain to a round
  step; Recharts' `auto` left a quarter of a plot empty.
- **Only the latest point wears a dot.** The sparkline's dot takes today's verdict tone; the
  detail chart's stays blue.
- **The correlation scatter draws its least-squares fit**, withheld under three points. The
  verdict ("No real relationship") leads and r supports it.
- **A derived figure is withheld until it has the history it needs** (7 readings for a
  baseline). Apply the same guard to anything added later.
