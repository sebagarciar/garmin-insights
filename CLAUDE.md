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

## Nothing in this project runs on a schedule

There is no cron, no launchd job, no n8n, and no alerting. Seba decided this
explicitly: he syncs when he wants to look at the data, and he does not want
to be notified about his own heart rate.

The PRD proposed daily automated sync (v2) and threshold alerts to Telegram
(v4). Both were dropped after he read them. Do not add a scheduler, a webhook,
a notifier or a background job, and do not propose one. Data arrives when the
Sync button is pressed or `python -m src.ingest` is run.

The PRD also cites the Kindle digest as "the n8n pattern". It is not: that
project runs on launchd and talks to the Telegram API directly. n8n is not
installed on this machine.

## The two layers, and why the raw one exists

Every Garmin response is written to `data/raw/YYYY/MM/DD/<endpoint>.json`
before anything is parsed. The SQLite database is built from those files.

`python-garminconnect` is unofficial. When Garmin renames a field, the parser
breaks, and the only thing standing between that and a lost year of history is
the archive. Fix `src/transform.py`, then:

```bash
./.venv/bin/python -m src.ingest --start 2026-01-01 --replay
```

That rebuilds the database from disk with no network calls at all. No view,
endpoint or chart ever reads the raw archive directly.

## Baselines are computed, never stored

`src/metrics.py` derives every baseline, deviation and ratio at read time.
None of it is written to the database, on purpose: the 30-day baseline for a
day in July keeps changing as more days arrive, so a stored copy would be
quietly wrong rather than loudly missing.

A baseline needs at least 7 real observations in the window (`MIN_BASELINE_DAYS`)
or it reports nothing. A percentage computed from four scattered days is noise
with a number on it.

## The training load view was removed

Removed Sep 2026. The acute:chronic ratio is built for someone training
several times a week, and it does not survive a sparser, more irregular
pattern: the 28-day average collapses towards zero and one ordinary session
reads as a spike. Guarded behind a minimum session count, it spent most of its
life withholding itself, which is an honest answer but not a useful view. The
first commit has the whole thing if the training pattern ever changes.

What stayed: activities are still ingested and listed, `metrics.effective_loads()`
still attaches a load figure to each one, and "Training load" is still an
option in the correlation panel, because whether a round of golf moves the next
night's HRV is a real question.

That load figure is **Garmin's own** `activityTrainingLoad`, not a formula. The
first version computed Banister TRIMP, on the reasoning that Garmin's number is
undocumented and absent on the activity types in this account. Checking against
the live data falsified the second half: it is present on all but the sessions
recorded with no heart rate at all, where nothing can be computed either way.

The two models also ranked the same activities in **opposite orders**. TRIMP is
duration-weighted, so several hours of low-intensity movement outweighs a short
session at near-maximum heart rate. Garmin's is EPOC-based and does not. They do
not disagree about magnitude, they disagree about which session was the hard one,
and the body agrees with Garmin. Do not switch back without asking Seba.

A session Garmin scored nothing for is estimated from the median load per minute
of his own sessions of that type, carries `load_basis = 'estimated'`, and is
marked "est" in the table. The estimate is derived at read time, so it improves
as more sessions arrive.

`HR_MAX` in `.env` should be a measured peak taken from real hard sessions, not
220-minus-age, which was meaningfully wrong here and overstated every load
figure. It now feeds only the TRIMP figure kept for comparison, so it moves
nothing the dashboard shows.

## Missing data is recorded, never a silent NULL

Each ingestion run writes a row per day and metric into `data_quality`: ok,
missing, partial or error. A day the watch was not worn is a fact stored in
the database, not an absence.

This matters because a silent NULL behaves like a zero in a rolling average
and drags the baseline with it. `metrics.series()` skips missing days rather
than filling them, and the charts draw gaps rather than joining the line
across them.

A day counts as `missing` only when the required endpoints (stats, sleep, HRV)
all came back empty. Training readiness is optional: it exists on newer
watches and can arrive on a day nothing else did.

## Credentials

`scripts/login.py` asks for the password once, in his terminal, mints a token
into `~/.garmin_tokens/garmin_tokens.json` (mode 600, outside the repo) and
never stores the password anywhere.

Every later run loads that token and refuses to re-login with a password if it
stops working, because a silent re-login on every sync is how an account gets
flagged, and it would hide the fact that the token expired. The failure says
exactly which script to run.

Never write the password to `.env` on his behalf, never print a token, and
never commit `data/`.

## The dashboard is FastAPI plus React, not Streamlit

The PRD said Streamlit. It was dropped before any code was written because the
visual layer is going to Claude Design, and Streamlit renders its own widgets:
you get Streamlit's look with CSS hacks at best.

The stack is Vite + React + TypeScript + Recharts, matching his finance
dashboard, with a thin FastAPI read layer over SQLite. The API holds no logic
of its own; every number comes from `src/metrics.py`.

`web/src/styles.css` is placeholder styling and is labelled as such. The class
names and structure are the contract; the look is not designed yet.

## The look is a Notion-derived system, and it is tokenised

`web/src/styles.css` holds every value as a CSS custom property. Components
reference tokens, never raw hex. `web/src/tokens.ts` mirrors the handful of
colours that Recharts needs as real values rather than CSS variables. Change
the two together.

Warm paper canvas `#f6f5f4`, white cards, 1px `#e6e6e6` hairlines, 12px card
radius, elevation by many near-transparent layers rather than one hard shadow.
Type is Inter standing in for Notion's own cut, with the negative tracking set
explicitly at every heading size because Inter reads looser than NotionInter.

**One structural accent.** `#0075de` paints the Sync button, the measured
series in every chart, and the focus ring. Nothing else. The sticker palette
(pink, purple, sky, brown) never paints chrome and never appears in this app.

**Three hues carry meaning, and only three.** The blue above, plus a status
pair for "better than his normal" and "worse than his normal".

## Why "better" is teal and not green

The obvious choice was the sticker green against the sticker orange. It fails:
under protanopia those two collapse to a colour difference of 1.7, which is to
say they become the same colour. A red-blind reader could not tell a good day
from a bad one anywhere in this dashboard.

The status pair is therefore `#008b7d` (the sticker teal, deepened until it
clears both the chroma floor and 4:1 text contrast) against `#dd5b00`. That
pair separates by 12.1 under protanopia and passes all six palette checks.

Verify any change with the validator rather than by eye:

```bash
node scripts/validate_palette.js "#0075de,#008b7d,#dd5b00" --mode light --surface "#ffffff"
```

Colour never carries a verdict alone in any case: every metric card shows an
arrow and the words "better than normal" / "worse than normal" beside the
figure, and the deviation chart states which direction is good for that metric.

## Chart rules that are not negotiable

**No dual-axis charts.** The training load chart originally put load and the
acute:chronic ratio on twin y-axes, where the arbitrary alignment of two scales
invents a relationship that is not in the data. It was split into two charts
over a shared x-axis. That chart is gone now, but the rule is not.

**Grids are solid hairlines, never dashed.** Dashing reads as "threshold" or
"projection" when it is only a grid. Dashes are reserved for reference series
that are not measurements: the rolling baseline and the 28-day average.

**A legend whenever two or more series are drawn.** A single-series chart is
named by its heading and gets none.

**Every chart has a way to read the numbers.** The detail chart has a "Show
numbers" toggle that swaps it for a table. A tooltip is never the only route
to a value.

**A derived figure is withheld until it has the history it needs.** A baseline
needs 7 real readings in its window; the acute:chronic ratio, before it was
removed, needed 28 days behind it and 4 sessions inside them. Without those
guards the start of any backfill produces confident numbers computed over days
that do not exist. Apply the same rule to anything added later.

## Local only

The dashboard, the database and the v5 weekly summary all run on his hardware.
The only network call the project makes is to Garmin Connect itself.

The weekly summary will use Ollama, already installed, with the model set by
`OLLAMA_MODEL` so it can be swapped without touching code. If Ollama is not
running, that button must say so plainly. It never falls back to a cloud API,
which is the entire point of doing it locally.

## Where things stand

Verified against a real account on 20 Sep 2026: login, a full backfill, a live
forced pull, and a complete replay of the archive with no network calls.

**The parser is correct.** Every field name in `src/transform.py` was checked
against the live payloads key by key. No renames, no misses.

Still not built: life-event tagging in the UI (table and endpoints exist,
nothing writes to them), and the weekly Ollama summary (table exists).
Dropped for good: scheduled sync and alerting.

## What the live data changed

Four things that only surfaced once real data was in the database, kept here
because each one is a trap the next change could fall into.

**The activity types in the brief were not the ones in the account.** The PRD
named two sports; the account held three different ones. Check what is actually
there before writing anything that names an activity.

**Overnight metrics start later than daily ones.** Sleep and HRV only exist from
the point the watch was worn at night, which is months after the daily stats
begin. Those days are correctly flagged `missing` rather than parsed as zeroes,
but it means an early baseline can have nothing behind it. Trust
`baseline_n` over the date range.

**The heart rate ceiling was a guess and it was wrong.** `HR_MAX` defaulted to a
formula and the measured peak was well above it, overstating every load figure
by around 20%. Anything with a physiological constant in it should be checked
against the person's own data before it is trusted.

**A metric can be valid and still not fit.** The acute:chronic ratio is real
sports science and it was implemented correctly. It still had to come out,
because the training pattern it assumes is not the one in this account. Correct
is not the same as useful.

## Open questions, unanswered

- Which Ollama model for the weekly summary. `llama3.1:8b` is the default
  because the Kindle digest already uses it on this machine.
- His real `HR_MAX`, which every training load number depends on.
- How far back the backfill should go.
