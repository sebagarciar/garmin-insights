# garmin — read before touching this project

Seba's Garmin data, pulled onto his own laptop and turned into insight rather
than another set of charts. One file, one place: if a decision about this
project has already been made, it is written down below. Do not re-derive it.

- `src/` — ingestion, storage, and the maths behind every number
- `api/` — the FastAPI read layer the dashboard talks to
- `web/` — the React dashboard
- `scripts/` — login, backfill, and the one command that starts everything
- `data/` — raw JSON archive and the SQLite database. Gitignored, always
- `garmin-insights-prd.md` — the original brief
- `NOTES.md` — local only, gitignored. What his own data showed, the backstory of the
  decisions below, and where things stood. Read it before changing any metric, threshold
  or chart. `recommendations.md` (also local only) is the write-up of those findings for him.

## Repo

Git repo `sebagarciar/garmin-insights` on GitHub, **public**. Commit to `main`.
Nothing about his health goes into a tracked file: not `data/`, not his readings, and not
the findings drawn from them (his heart rate figures, sleep patterns, dated life periods).
Those go in `NOTES.md` or `recommendations.md`. Rules in this file say how the code works,
never what his body does.

## Nothing in this project runs on a schedule

No cron, no launchd job, no n8n, no alerting. Seba decided this explicitly: he syncs when he
wants to look at the data, and he does not want to be notified about his own heart rate. The
PRD's daily automated sync (v2) and Telegram threshold alerts (v4) were dropped after he read
them. Do not add a scheduler, a webhook, a notifier or a background job, and do not propose
one. Data arrives when the Sync button is pressed or `python -m src.ingest` is run.

The PRD calls the Kindle digest "the n8n pattern". It is not: that project is started by
hand and talks to the Telegram API directly. n8n is not installed on this machine.

## The two layers, and why the raw one exists

Every Garmin response is written to `data/raw/YYYY/MM/DD/<endpoint>.json` before anything is
parsed. The SQLite database is built from those files. No view, endpoint or chart ever reads
the raw archive directly.

`python-garminconnect` is unofficial. When Garmin renames a field the parser breaks, and the
archive is what stands between that and a lost year of history. Fix `src/transform.py`, then
rebuild from disk with no network calls:

```bash
./.venv/bin/python -m src.ingest --start 2026-01-01 --replay
```

**An archived day is final only once it is settled**: pulled after noon the following day
(`SETTLED_HOUR` in `src/ingest.py`, judged by the file's modification time). Anything pulled
earlier is fetched again on the next sync. "Skip if the file exists" once left a day pulled
at 00:37 sitting as "no reading" for a week. Do not go back to it.

## Baselines are computed, never stored

`src/metrics.py` derives every baseline, deviation and ratio at read time. None of it is
written to the database: a day's 30-day baseline keeps changing as more days arrive, so a
stored copy would be quietly wrong rather than loudly missing. A baseline needs at least 7
real observations in the window (`MIN_BASELINE_DAYS`) or it reports nothing.

## Training load

The training load view was removed in Sep 2026. The acute:chronic ratio assumes training
several times a week and collapses on a sparser pattern; the first commit has it if that ever
changes. Activities are still ingested and listed, `metrics.effective_loads()` still attaches
a load to each, and "Training load" is still an option in the correlation panel.

- The load figure is **Garmin's own** `activityTrainingLoad` (EPOC-based), not Banister
  TRIMP. The two ranked the same sessions in opposite orders and Garmin's matched reality.
  Do not switch back without asking Seba.
- A session Garmin scored nothing for is estimated from the median load per minute of his
  own sessions of that type, carries `load_basis = 'estimated'`, is marked "est", and is
  derived at read time.
- `HR_MAX` in `.env` is his own measured peak, not 220-minus-age. `.env.example` keeps a
  generic 190 because it is a template. It feeds only the TRIMP figure kept for comparison.

## Missing data is recorded, never a silent NULL

Each ingestion run writes a row per day and metric into `data_quality`: ok, missing, partial
or error. A silent NULL behaves like a zero in a rolling average and drags the baseline with
it, so `metrics.series()` skips missing days and the charts draw gaps instead of joining the
line. A day is `missing` only when the required endpoints (stats, sleep, HRV) all came back
empty. Training readiness is optional: it exists on newer watches and can arrive on a day
nothing else did.

## Credentials

`scripts/login.py` asks for the password once, in his terminal, mints a token into
`~/.garmin_tokens/garmin_tokens.json` (mode 600, outside the repo) and never stores the
password. Later runs refuse to re-login with a password if the token stops working: a silent
re-login on every sync is how an account gets flagged, and the failure names the script to
run. Never write the password to `.env`, never print a token, never commit `data/`.

## Stack: FastAPI plus React, not Streamlit

The PRD said Streamlit; dropped before any code because Streamlit renders its own widgets.
Vite + React + TypeScript + Recharts, matching his finance dashboard, over a thin FastAPI
read layer. The API holds no logic; every number comes from `src/metrics.py`.

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
which separates by 12.1 and passes all six palette checks. Verify changes with the validator:

```bash
node scripts/validate_palette.js "#0075de,#008b7d,#dd5b00" --mode light --surface "#ffffff"
```

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

## Sleep timing

`metrics.bedtime_table()` and `metrics.rough_nights()`, behind `/api/sleep-timing`. One
endpoint, because the table reports itself both with and without the flagged nights.

- **Duration and overnight physiology are shown side by side, never averaged into one
  verdict.** They respond to bedtime differently.
- **The bucket boundaries are settled.** A first pass read an artefact as a cliff. The
  numbers are in `NOTES.md`; read it before moving any line.
- **A rough night is defined on sleep inputs only**: overnight stress a full standard
  deviation above his trailing 30-day normal *and* REM at or below 70% of it. Heart rate stays
  out of the test, so the resting HR and HRV columns are a finding, not a restatement. No
  whole-dataset z-score, no `sleep_score` (a stored baseline in disguise).
- **Bedtime is hours past midnight with the wrap removed** (01:46 is 25.77). Wake time is the
  plain clock and never wraps: wrapping it turned a 05:30 wake into 29.5, and that shipped once.
- **A sleep record starting between 06:00 and 20:00 is a nap or a flight**: excluded from
  the buckets, with the count in the caption.
- `MIN_BUCKET_NIGHTS` is 7, matching `MIN_BASELINE_DAYS`.

## Traps the live data exposed

- Check which activity types are actually in the account before naming one in code.
- Overnight metrics start months after daily ones. Trust `baseline_n` over the date range.
- Check any physiological constant against his own data before trusting it.
- A metric can be correct and still not fit his pattern. Correct is not the same as useful.

## Local only

The dashboard, the database and the planned weekly summary all run on his hardware. The only
network call is to Garmin Connect. The weekly summary will use Ollama with the model set by
`OLLAMA_MODEL`. If Ollama is not running the button says so plainly; it never falls back to a
cloud API.

## Open questions

- Inter loads from Google Fonts in `web/index.html`, which breaks "the only network call is
  Garmin" and falls back to the system face offline. Self-hosting the woff2 in `web/public`
  fixes both; downloading the font files is Seba's call.
- Which Ollama model for the weekly summary (`llama3.1:8b` by default, as in the Kindle digest).
- How far back the backfill should go.
