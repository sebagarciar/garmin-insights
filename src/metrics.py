"""Derived numbers: baselines, deviation, training load, correlation.

Nothing in here is stored. Every figure is computed from the `daily` and
`activities` tables at read time, because the baseline for any past day keeps
changing as more days arrive, and a cached copy would quietly go stale.

The whole point of the dashboard is in this file: Garmin shows you 58ms, this
shows you "12% under your own normal".
"""

from __future__ import annotations

import math
import sqlite3
import statistics
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from . import config


@dataclass(frozen=True)
class MetricDef:
    key: str
    label: str
    unit: str
    better: str          # "higher" | "lower"
    precision: int = 0
    scale: float = 1.0   # divide the stored value by this for display


METRICS: dict[str, MetricDef] = {
    "hrv_last_night":     MetricDef("hrv_last_night", "HRV", "ms", "higher", 0),
    "resting_hr":         MetricDef("resting_hr", "Resting HR", "bpm", "lower", 0),
    "sleep_score":        MetricDef("sleep_score", "Sleep score", "", "higher", 0),
    "sleep_seconds":      MetricDef("sleep_seconds", "Sleep duration", "h", "higher", 1, 3600),
    "body_battery_high":  MetricDef("body_battery_high", "Body battery peak", "", "higher", 0),
    "stress_avg":         MetricDef("stress_avg", "Stress", "", "lower", 0),
    "training_readiness": MetricDef("training_readiness", "Training readiness", "", "higher", 0),
    "steps":              MetricDef("steps", "Steps", "", "higher", 0),
    "deep_seconds":       MetricDef("deep_seconds", "Deep sleep", "h", "higher", 1, 3600),
    "rem_seconds":        MetricDef("rem_seconds", "REM sleep", "h", "higher", 1, 3600),
}

# Minimum real observations inside the window before a baseline is shown at
# all. Comparing today against four scattered days is noise with a number on it.
MIN_BASELINE_DAYS = 7


def _mean(values: list[float]) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def fetch_daily(conn: sqlite3.Connection, start: date, end: date) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM daily WHERE date BETWEEN ? AND ? ORDER BY date",
        (start.isoformat(), end.isoformat()),
    ).fetchall()
    return [dict(r) for r in rows]


def series(
    conn: sqlite3.Connection,
    metric: str,
    start: date,
    end: date,
    window: int | None = None,
) -> list[dict[str, Any]]:
    """One metric per day, each point carrying its own trailing baseline.

    The baseline for a day is the mean of the previous `window` days, not
    including that day, so "deviation" means deviation from what came before
    rather than from a window the value itself helped set. Days with no data
    are skipped entirely rather than counted as zero.
    """
    if metric not in METRICS:
        raise KeyError(metric)
    window = window or config.BASELINE_WINDOW_DAYS

    # Reach back an extra window so the first requested day has a baseline.
    lookback = start - timedelta(days=window)
    rows = conn.execute(
        f"SELECT date, {metric} AS value FROM daily WHERE date BETWEEN ? AND ? ORDER BY date",
        (lookback.isoformat(), end.isoformat()),
    ).fetchall()

    by_date = {r["date"]: r["value"] for r in rows}
    out = []
    day = start
    while day <= end:
        iso = day.isoformat()
        history = []
        for back in range(1, window + 1):
            v = by_date.get((day - timedelta(days=back)).isoformat())
            if v is not None:
                history.append(float(v))
        base = _mean(history) if len(history) >= MIN_BASELINE_DAYS else None
        value = by_date.get(iso)
        value = float(value) if value is not None else None

        deviation = None
        if value is not None and base not in (None, 0):
            deviation = round((value - base) / base * 100, 1)

        out.append({
            "date": iso,
            "value": value,
            "baseline": round(base, 2) if base is not None else None,
            "baseline_n": len(history),
            "deviation_pct": deviation,
        })
        day += timedelta(days=1)
    return out


def latest_snapshot(
    conn: sqlite3.Connection, end: date, keys: list[str] | None = None, window: int | None = None
) -> list[dict[str, Any]]:
    """Most recent real reading per metric, with how far off baseline it sits."""
    keys = keys or list(METRICS)
    start = end - timedelta(days=13)  # a fortnight of context for the sparkline
    out = []
    for key in keys:
        points = series(conn, key, start, end, window)
        latest = next((p for p in reversed(points) if p["value"] is not None), None)
        d = METRICS[key]
        out.append({
            "key": key,
            "label": d.label,
            "unit": d.unit,
            "better": d.better,
            "precision": d.precision,
            "scale": d.scale,
            "latest": latest,
            "points": points,
        })
    return out


# --------------------------------------------------------------------------
# activity load
#
# The acute:chronic workload ratio used to live here. Removed Sep 2026: it
# assumes training several times a week, and on a sparser pattern the 28-day
# average collapses towards zero so one ordinary session reads as a spike.
# Recover it from the first commit if the training pattern changes.
# --------------------------------------------------------------------------

def _load_per_minute_by_type(conn: sqlite3.Connection) -> dict[str, float]:
    """Median Garmin load per minute, per activity type, from his own history.

    Used only to fill in a session Garmin gave no load for, which happens when
    the session was recorded with no heart rate at all. Taking the median of
    his own sessions of that type is a far better guess than anything derived
    from duration alone.
    """
    rows = conn.execute(
        "SELECT type_key, garmin_load, duration_s FROM activities "
        "WHERE garmin_load IS NOT NULL AND duration_s > 0"
    ).fetchall()
    buckets: dict[str, list[float]] = {}
    for r in rows:
        buckets.setdefault(r["type_key"], []).append(
            float(r["garmin_load"]) / (float(r["duration_s"]) / 60)
        )
    return {k: statistics.median(v) for k, v in buckets.items() if v}


def effective_loads(
    conn: sqlite3.Connection, start: date, end: date
) -> list[dict[str, Any]]:
    """Every activity in range with the one load figure the dashboard uses.

    Garmin's own `activityTrainingLoad` is that figure. The TRIMP we compute is
    kept alongside it for comparison but drives nothing, because the two rank
    his activities in opposite orders: TRIMP is duration-weighted and calls a
    4 hour golf round harder than a 35 minute interval session, while Garmin's
    is EPOC-based and does not. His body agrees with Garmin.

    A session Garmin scored nothing for is estimated from the median load per
    minute of his own sessions of that type, and flagged so the estimate is
    never mistaken for a measurement.
    """
    per_minute = _load_per_minute_by_type(conn)
    rows = conn.execute(
        "SELECT * FROM activities WHERE date BETWEEN ? AND ? ORDER BY start_local DESC",
        (start.isoformat(), end.isoformat()),
    ).fetchall()

    out = []
    for r in rows:
        row = dict(r)
        if row["garmin_load"] is not None:
            row["load"] = round(float(row["garmin_load"]), 1)
            row["load_basis"] = "garmin"
        elif row["type_key"] in per_minute and row["duration_s"]:
            row["load"] = round(per_minute[row["type_key"]] * (row["duration_s"] / 60), 1)
            row["load_basis"] = "estimated"
        else:
            row["load"] = None
            row["load_basis"] = "unknown"
        out.append(row)
    return out


def daily_load(conn: sqlite3.Connection, start: date, end: date) -> dict[str, float]:
    """Total load per day. Days with no activity are a real zero."""
    totals: dict[str, float] = {}
    for a in effective_loads(conn, start, end):
        if a["load"] is None:
            continue
        totals[a["date"]] = totals.get(a["date"], 0.0) + a["load"]
    return totals


# --------------------------------------------------------------------------
# correlation
# --------------------------------------------------------------------------

def correlate(
    conn: sqlite3.Connection, x_metric: str, y_metric: str, start: date, end: date, lag: int = 0
) -> dict[str, Any]:
    """Pearson r between two daily metrics, y optionally shifted `lag` days later.

    lag=1 answers questions of the "does tonight's sleep move tomorrow's
    resting HR" shape. Only days where both values actually exist are paired.
    """
    def column(metric: str, frm: date, to: date) -> dict[str, float]:
        if metric == "load":
            # A rest day is a real zero, not a missing value, so every day we
            # actually have data for is filled in. Days never synced stay out:
            # inventing a zero for those would claim he rested when we simply
            # do not know.
            known = {
                r["date"] for r in conn.execute(
                    "SELECT date FROM daily WHERE date BETWEEN ? AND ?",
                    (frm.isoformat(), to.isoformat()),
                ).fetchall()
            }
            loads = daily_load(conn, frm, to)
            return {d: loads.get(d, 0.0) for d in known}
        if metric not in METRICS:
            raise KeyError(metric)
        rows = conn.execute(
            f"SELECT date, {metric} AS v FROM daily WHERE date BETWEEN ? AND ? AND {metric} IS NOT NULL",
            (frm.isoformat(), to.isoformat()),
        ).fetchall()
        return {r["date"]: float(r["v"]) for r in rows}

    xs_by_date = column(x_metric, start, end)
    ys_by_date = column(y_metric, start, end + timedelta(days=lag))

    pairs = []
    for iso, xv in sorted(xs_by_date.items()):
        target = (date.fromisoformat(iso) + timedelta(days=lag)).isoformat()
        if target in ys_by_date:
            pairs.append({"date": iso, "x": xv, "y": ys_by_date[target]})

    n = len(pairs)
    r = None
    if n >= 8:
        xs = [p["x"] for p in pairs]
        ys = [p["y"] for p in pairs]
        mx, my = sum(xs) / n, sum(ys) / n
        cov = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
        vx = math.sqrt(sum((a - mx) ** 2 for a in xs))
        vy = math.sqrt(sum((b - my) ** 2 for b in ys))
        if vx > 0 and vy > 0:
            r = round(cov / (vx * vy), 3)

    return {
        "x": x_metric, "y": y_metric, "lag": lag, "n": n, "r": r,
        "strength": _strength(r, n), "points": pairs,
    }


def _strength(r: float | None, n: int) -> str:
    """Plain words, and an honest 'not enough data' instead of a fake number.

    Eight pairs is already thin. The label never claims causation; two metrics
    from the same body on the same day move together for many reasons.
    """
    if r is None:
        return "not enough overlapping days yet"
    a = abs(r)
    base = "no real relationship" if a < 0.2 else \
           "weak" if a < 0.4 else \
           "moderate" if a < 0.6 else "strong"
    if base == "no real relationship":
        return base
    direction = "positive" if r > 0 else "negative"
    caveat = " (thin sample)" if n < 20 else ""
    return f"{base} {direction}{caveat}"


# --------------------------------------------------------------------------
# data quality
# --------------------------------------------------------------------------

def quality(conn: sqlite3.Connection, start: date, end: date) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT date, metric, status, detail FROM data_quality "
        "WHERE date BETWEEN ? AND ? ORDER BY date",
        (start.isoformat(), end.isoformat()),
    ).fetchall()
    flags = [dict(r) for r in rows]

    total_days = (end - start).days + 1
    checked = {r["date"] for r in rows}
    never_pulled = []
    day = start
    while day <= end:
        if day.isoformat() not in checked:
            never_pulled.append(day.isoformat())
        day += timedelta(days=1)

    by_metric: dict[str, dict[str, int]] = {}
    for f in flags:
        by_metric.setdefault(f["metric"], {}).setdefault(f["status"], 0)
        by_metric[f["metric"]][f["status"]] += 1

    return {
        "start": start.isoformat(), "end": end.isoformat(), "days": total_days,
        "never_pulled": never_pulled,
        "by_metric": by_metric,
        "problems": [f for f in flags if f["status"] != "ok"],
    }


# --------------------------------------------------------------------------
# sleep timing
#
# Two findings from the first full read of the archive, September 2026, both
# of which needed a view of their own because no per-day card shows them.
#
# 1. Bedtime works through two separate channels, and lumping them together
#    hides both. Sleep duration falls linearly from midnight onwards: he wakes
#    only 32 minutes later for every hour later he falls asleep, so the rest is
#    sleep he does not get back. The overnight physiology, by contrast, does
#    not move at all between 22:00 and 02:00 and then steps down sharply after
#    02:00. That is why the table reports both, and why it can exclude rough
#    nights: with them in, the step looks like it starts at 01:00, which is an
#    artefact of where the rough nights happen to fall.
#
# 2. About one night in ten looks nothing like a short night. Duration is
#    normal, bedtime is normal, deep sleep is normal, and REM collapses while
#    heart rate climbs. Those nights cost more than anything else in the data.
# --------------------------------------------------------------------------

# A sleep record starting inside the day is a nap or a flight, not a night.
# Onset is read as hours from midnight, so 01:00 is 25.0 and 23:30 is 23.5.
NAP_ONSET_START = 6.0
NAP_ONSET_END = 20.0

# Same reasoning as MIN_BASELINE_DAYS: a mean over four nights is noise with a
# number on it, so a bucket under this many nights reports nothing at all.
MIN_BUCKET_NIGHTS = 7

# A night is rough when overnight stress is this far above his own trailing
# normal AND REM falls to this share of it. Both thresholds are deliberately
# on sleep *inputs*: flagging on heart rate and then reporting that flagged
# nights have a bad heart rate would only restate the definition.
ROUGH_STRESS_SDS = 1.0
ROUGH_REM_SHARE = 0.7

BEDTIME_BUCKETS: list[tuple[str, float | None, float | None]] = [
    ("before 00:00", None, 24.0),
    ("00:00 to 01:00", 24.0, 25.0),
    ("01:00 to 02:00", 25.0, 26.0),
    ("after 02:00", 26.0, None),
]

# What each bucket reports. Sleep score is deliberately absent: Garmin derives
# it from the same stages and stress this table already shows, so it would add
# a column without adding a fact.
BUCKET_METRICS = ["sleep_seconds", "rem_seconds", "resting_hr", "hrv_last_night"]


def bedtime_hours(sleep_start_local: str | None) -> float | None:
    """Sleep onset as hours past midnight, or None if it was not a night.

    01:46 comes back as 25.77 and 23:30 as 23.5, so that "later" is always a
    larger number and a night spanning midnight does not wrap around.
    """
    if not sleep_start_local:
        return None
    try:
        clock = sleep_start_local[11:16]
        hour, minute = int(clock[:2]), int(clock[3:5])
    except (ValueError, IndexError):
        return None
    hours = hour + minute / 60
    if NAP_ONSET_START <= hours < NAP_ONSET_END:
        return None  # a daytime record: nap, flight, or sleeping off a night
    return hours + 24 if hours < NAP_ONSET_START else hours


def _trailing(
    by_date: dict[str, float | None], day: date, window: int, minn: int
) -> tuple[float | None, float | None]:
    """Mean and standard deviation of the `window` days before `day`.

    Excludes the day itself for the same reason `series()` does: a night
    judged partly against itself is judged against a softer target.
    """
    history = [
        v for back in range(1, window + 1)
        if (v := by_date.get((day - timedelta(days=back)).isoformat())) is not None
    ]
    if len(history) < minn:
        return None, None
    mean = sum(history) / len(history)
    sd = statistics.stdev(history) if len(history) > 1 else 0.0
    return mean, sd


def rough_nights(
    conn: sqlite3.Connection, start: date, end: date, window: int | None = None
) -> dict[str, Any]:
    """Nights where REM collapsed while overnight stress climbed.

    Every threshold is against his own trailing baseline rather than a
    whole-history average, because a whole-history average is a stored
    baseline in disguise: it changes as data arrives and it includes the night
    being judged.

    The heart rate figures in the result are a *finding*, not part of the
    test. They are reported as distance from that night's own baseline.
    """
    window = window or config.BASELINE_WINDOW_DAYS
    lookback = start - timedelta(days=window)
    rows = conn.execute(
        "SELECT date, sleep_stress_avg, rem_seconds, sleep_seconds, deep_seconds, "
        "       resting_hr, hrv_last_night, respiration_avg, sleep_start_local "
        "FROM daily WHERE date BETWEEN ? AND ? ORDER BY date",
        (lookback.isoformat(), end.isoformat()),
    ).fetchall()

    cols = {c: {r["date"]: r[c] for r in rows} for c in
            ("sleep_stress_avg", "rem_seconds", "resting_hr", "hrv_last_night")}

    flagged: list[dict[str, Any]] = []
    eligible = 0
    for r in rows:
        day = date.fromisoformat(r["date"])
        if day < start or r["sleep_stress_avg"] is None or r["rem_seconds"] is None:
            continue
        stress_base, stress_sd = _trailing(cols["sleep_stress_avg"], day, window, MIN_BASELINE_DAYS)
        rem_base, _ = _trailing(cols["rem_seconds"], day, window, MIN_BASELINE_DAYS)
        if stress_base is None or rem_base is None:
            continue  # no baseline yet: the night is not judged, not passed
        eligible += 1

        stressed = r["sleep_stress_avg"] >= stress_base + ROUGH_STRESS_SDS * (stress_sd or 0)
        rem_down = r["rem_seconds"] <= ROUGH_REM_SHARE * rem_base
        if not (stressed and rem_down):
            continue

        hr_base, _ = _trailing(cols["resting_hr"], day, window, MIN_BASELINE_DAYS)
        hrv_base, _ = _trailing(cols["hrv_last_night"], day, window, MIN_BASELINE_DAYS)
        flagged.append({
            "date": r["date"],
            "sleep_seconds": r["sleep_seconds"],
            "deep_seconds": r["deep_seconds"],
            "rem_seconds": r["rem_seconds"],
            "rem_baseline": round(rem_base, 1),
            "sleep_stress_avg": r["sleep_stress_avg"],
            "sleep_stress_baseline": round(stress_base, 1),
            "bedtime_hours": bedtime_hours(r["sleep_start_local"]),
            "respiration_avg": r["respiration_avg"],
            "resting_hr": r["resting_hr"],
            "resting_hr_delta": _delta(r["resting_hr"], hr_base),
            "hrv_last_night": r["hrv_last_night"],
            "hrv_delta": _delta(r["hrv_last_night"], hrv_base),
        })

    return {
        "nights": flagged,
        "count": len(flagged),
        "eligible": eligible,
        "rate_pct": round(len(flagged) / eligible * 100, 1) if eligible else None,
        "cost": {
            "resting_hr": _round(_mean([f["resting_hr_delta"] for f in flagged])),
            "hrv_last_night": _round(_mean([f["hrv_delta"] for f in flagged])),
        },
    }


def _round(value: float | None, places: int = 1) -> float | None:
    return round(value, places) if value is not None else None


def _delta(value: float | None, base: float | None) -> float | None:
    return round(float(value) - base, 1) if value is not None and base is not None else None


def bedtime_table(
    conn: sqlite3.Connection, start: date, end: date, window: int | None = None
) -> dict[str, Any]:
    """Every night in range bucketed by when he fell asleep.

    Each bucket is reported twice, once over every night and once with the
    rough nights taken out, because the two answer different questions. With
    them in, the table shows what a late bedtime actually costs him. With them
    out, it shows what the clock alone costs, and the two are not the same
    shape: the rough nights bunch in the 01:00 to 02:00 hour.
    """
    window = window or config.BASELINE_WINDOW_DAYS
    rough = rough_nights(conn, start, end, window)
    rough_dates = {n["date"] for n in rough["nights"]}

    rows = conn.execute(
        "SELECT date, sleep_start_local, sleep_end_local, sleep_seconds, rem_seconds, "
        "       resting_hr, hrv_last_night FROM daily "
        "WHERE date BETWEEN ? AND ? AND sleep_start_local IS NOT NULL ORDER BY date",
        (start.isoformat(), end.isoformat()),
    ).fetchall()

    nights = []
    for r in rows:
        onset = bedtime_hours(r["sleep_start_local"])
        if onset is None:
            continue
        night = dict(r)
        night["bedtime_hours"] = onset
        night["rough"] = r["date"] in rough_dates
        nights.append(night)

    def summarise(group: list[dict[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {"nights": len(group)}
        enough = len(group) >= MIN_BUCKET_NIGHTS
        for key in BUCKET_METRICS:
            vals = [n[key] for n in group if n[key] is not None]
            out[key] = round(sum(vals) / len(vals), 1) if (enough and vals) else None
        # _clock, never bedtime_hours: onset is wrapped so that later is a
        # larger number, which would turn a 05:30 wake into 29.5 and drag the
        # average of the bucket by a full day.
        wake = [_clock(n["sleep_end_local"]) for n in group]
        wake = [w for w in wake if w is not None]
        out["wake_hours"] = round(sum(wake) / len(wake), 2) if (enough and wake) else None
        out["bedtime_hours"] = (
            round(sum(n["bedtime_hours"] for n in group) / len(group), 2) if enough and group else None
        )
        out["enough"] = enough
        return out

    buckets = []
    for label, lo, hi in BEDTIME_BUCKETS:
        group = [n for n in nights
                 if (lo is None or n["bedtime_hours"] >= lo)
                 and (hi is None or n["bedtime_hours"] < hi)]
        clean = [n for n in group if not n["rough"]]
        buckets.append({
            "label": label,
            "from_hours": lo,
            "to_hours": hi,
            "rough_nights": len(group) - len(clean),
            "rough_rate_pct": round((len(group) - len(clean)) / len(group) * 100)
                              if group else None,
            "all": summarise(group),
            "clean": summarise(clean),
        })

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "nights": len(nights),
        "skipped_daytime": len(rows) - len(nights),
        "min_bucket_nights": MIN_BUCKET_NIGHTS,
        "buckets": buckets,
        "rough": rough,
    }


def _clock(stamp: str | None) -> float | None:
    """Wake time as hours past midnight. Unlike onset it never wraps: he has
    not once woken before 06:00 in this archive, and if he ever does, the hour
    is still the honest number to show."""
    if not stamp:
        return None
    try:
        return int(stamp[11:13]) + int(stamp[14:16]) / 60
    except (ValueError, IndexError):
        return None
