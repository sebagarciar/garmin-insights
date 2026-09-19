# Garmin Insights

My Garmin data, on my own laptop, turned into something Garmin Connect will
not tell me: how today compares to my own normal.

Garmin shows me an HRV reading. On its own that number means nothing: I have no
idea whether it is high or low for me. This shows it as a percentage away from
my own rolling baseline, and lets me ask whether last night's sleep is what
moved this morning's resting heart rate. Nothing leaves the machine except the
login to Garmin itself.

## Why

Garmin Connect has the data but no memory of what is normal for me, no way to
put two metrics side by side, and no idea that last week was exam week. Full
spec in [`garmin-insights-prd.md`](garmin-insights-prd.md).

## Setup, once

```bash
cd garmin
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python scripts/login.py
```

`login.py` asks for my Garmin password, uses it once, and saves a token to
`~/.garmin_tokens/`. The password is not written anywhere. I am not asked
again unless the token stops working.

Then pull the history:

```bash
./.venv/bin/python scripts/backfill.py --start 2026-01-01
```

It walks the range two weeks at a time with a pause between blocks, because
the Garmin API is unofficial and does not like being hammered. Interrupt it
and run it again: it skips what it already has.

## Using it

```bash
./scripts/dashboard.sh
```

Opens on http://localhost:8090. First run builds the front end, later runs
start immediately. Ctrl-c stops it and nothing keeps running afterwards.

Inside the dashboard, **Sync now** pulls the last few days. That is the only
button that writes anything. There is no scheduled sync and no alerting by
design: the data updates when I ask it to.

The command line equivalent, if the dashboard is not running:

```bash
./.venv/bin/python -m src.ingest --days 7
```

## What the numbers mean

**Deviation, not value.** Every card shows percent away from my own rolling
30-day average. Zero is an ordinary day for me. A baseline needs at least 7
real readings in the window or it shows nothing rather than guessing.

**Activity load** is Garmin's own training load figure, which weights intensity
rather than time on the clock: 35 minutes of intervals outranks a four hour
round of golf. I originally computed my own from duration and heart rate, and
my real data showed the two rank my activities in opposite orders. A session
recorded without heart rate has no Garmin score, so it is estimated from the
median load per minute of my own sessions of that type and marked "est".

There is no training load view. I built the acute:chronic workload ratio and
then took it out: it assumes you train several times a week, and it spends the
rest of the time correctly refusing to answer, which is not a view worth
keeping.

**Correlation is not cause.** Two readings from the same body on the same day
move together for plenty of reasons, and a thin sample shows patterns that a
month of extra data erases. The panel says how many paired days a figure rests
on, and refuses to show an r below 8 pairs.

**Missing days are shown as missing.** A day the watch was off is recorded as
a gap, never as a zero, because a zero would quietly drag the baseline down.
The data quality panel at the bottom lists every one. Overnight metrics only
exist from the point I started wearing it at night, so early baselines can have
nothing behind them and the charts say so.

## How it is built

```
Garmin Connect
      |  python-garminconnect, manual pull only
      v
 raw JSON archive  ->  SQLite  ->  FastAPI  ->  React dashboard
 data/raw/...          data/garmin.db           localhost:8000
```

Every response is archived untouched before it is parsed. If a parser turns
out to be wrong, the database is rebuilt from disk with no Garmin calls:

```bash
./.venv/bin/python -m src.ingest --start 2026-01-01 --replay
```

Baselines and ratios are never stored. They are recomputed on every read,
because the baseline for a day in July keeps changing as more days arrive.

## The look

A Notion-derived design system: warm paper canvas, Inter, and one blue that
paints the Sync button, the chart lines and nothing else. Colour carries meaning
in exactly two more places, "better than my normal" and "worse than my normal",
and both are backed up by an arrow and words so the dashboard still works in
greyscale or with colour blindness. `CLAUDE.md` explains why "better" is teal
rather than the obvious green.

## Status

Running on my own account since 20 September 2026, backfilled to the start of
the year. Every field name was checked against the live API key by key and the
parser is correct. A full replay rebuilds the database from disk in under a
second with no Garmin calls.

Two things the real data changed: the activity load now comes from Garmin rather
than the formula I had written, because the two ranked my sessions in opposite
orders, and the acute:chronic training load view came out altogether. Overnight data (sleep, HRV) only
starts in April, when I began wearing the watch at night.

Still to come: life-event tags (exam week, interviews, travel) as a filter on
any metric, and a weekly summary written by a local model through Ollama, on a
button press.

## If something breaks

`python-garminconnect` is unofficial. If Garmin changes something, ingestion
fails loudly rather than writing empty days. Check `logs/garmin.log` and the
data quality panel. The raw archive means no history is lost either way.
