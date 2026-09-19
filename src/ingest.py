"""Pull days from Garmin, archive them raw, write normalized rows.

Order matters: the raw file is written before anything is parsed. If the
transform below is wrong, the day can be replayed from disk without asking
Garmin again.

Nothing here runs on a schedule. It runs when Seba asks for it, from the
dashboard's Sync button or from the command line.
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import date, timedelta
from typing import Any, Callable

from garminconnect import (
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

from . import config, db, garmin_client, logging_setup, raw_archive, transform

log = logging.getLogger("garmin.ingest")

# endpoint name in the archive -> how to fetch it, and whether a missing
# result means something is wrong. Readiness only exists on newer watches and
# only after a night's wear, so it is optional by design.
DAILY_ENDPOINTS: dict[str, tuple[str, bool]] = {
    "stats": ("get_stats", True),
    "sleep": ("get_sleep_data", True),
    "hrv": ("get_hrv_data", True),
    "readiness": ("get_training_readiness", False),
}

PARSERS: dict[str, Callable[[Any], dict]] = {
    "stats": transform.from_stats,
    "sleep": transform.from_sleep,
    "hrv": transform.from_hrv,
    "readiness": transform.from_readiness,
}


def daterange(start: date, end: date):
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def _is_empty(payload: Any) -> bool:
    """Garmin answers a day with no data with null, {} or a stub dict.

    A stub is a dict whose only populated key is the date itself, which is
    what a day the watch was not worn looks like.
    """
    if payload is None:
        return True
    if isinstance(payload, (list, str)) and not payload:
        return True
    if isinstance(payload, dict):
        if not payload:
            return True
        meaningful = {
            k: v for k, v in payload.items()
            if v not in (None, [], {}, 0) and "calendarDate" not in k and k != "userProfileId"
        }
        return not meaningful
    return False


def fetch_day(client, day: str, force: bool = False) -> dict[str, Any]:
    """Fetch one day's endpoints and archive each response as it arrives."""
    payloads: dict[str, Any] = {}
    for endpoint, (method, _required) in DAILY_ENDPOINTS.items():
        if not force and raw_archive.has(day, endpoint):
            payloads[endpoint] = raw_archive.read(day, endpoint)
            continue
        try:
            payload = getattr(client, method)(day)
        except GarminConnectTooManyRequestsError:
            raise
        except GarminConnectAuthenticationError:
            raise
        except Exception as exc:  # noqa: BLE001 - unofficial API, many types
            log.warning("%s %s failed: %s", day, endpoint, exc)
            payloads[endpoint] = {"__error__": str(exc)}
            continue
        raw_archive.write(day, endpoint, payload)
        payloads[endpoint] = payload
        time.sleep(config.REQUEST_DELAY)
    return payloads


def write_day(conn, day: str, payloads: dict[str, Any]) -> str:
    """Normalize one day into the DB and flag what did not arrive.

    Returns 'ok', 'partial' or 'missing' for the run counters.
    """
    row: dict[str, Any] = {"date": day}
    statuses: dict[str, str] = {}

    for endpoint, (_method, required) in DAILY_ENDPOINTS.items():
        payload = payloads.get(endpoint)
        if isinstance(payload, dict) and "__error__" in payload:
            statuses[endpoint] = "error"
            db.record_quality(conn, day, endpoint, "error", payload["__error__"])
            continue
        if _is_empty(payload):
            statuses[endpoint] = "missing"
            db.record_quality(
                conn, day, endpoint, "missing",
                None if required else "optional metric, not always present",
            )
            continue
        parsed = PARSERS[endpoint](payload)
        if not parsed:
            statuses[endpoint] = "missing"
            db.record_quality(conn, day, endpoint, "missing", "response had no usable fields")
            continue
        # Sleep and stats both carry SpO2 and respiration. Sleep is measured
        # overnight and is the better source, so it is applied last and wins.
        row.update(parsed)
        statuses[endpoint] = "ok"
        db.record_quality(conn, day, endpoint, "ok", None)

    if len(row) > 1:
        db.upsert_daily(conn, row)

    # Only the required endpoints decide the verdict. Training readiness can
    # arrive on a day the watch was otherwise off the wrist, and that day is
    # still a gap, not a partial day.
    required = [statuses.get(e) for e, (_m, req) in DAILY_ENDPOINTS.items() if req]
    if all(s == "ok" for s in required):
        return "ok"
    if any(s == "ok" for s in required):
        return "partial"
    return "missing"


def fetch_activities(client, start: str, end: str) -> list[dict]:
    activities = client.get_activities_by_date(start, end)
    raw_archive.write(end, f"activities_{start}_to_{end}", activities)
    return activities or []


def write_activities(conn, activities: list[dict]) -> int:
    written = 0
    for activity in activities:
        day = str(activity.get("startTimeLocal") or "")[:10]
        rhr = None
        if day:
            got = conn.execute(
                "SELECT resting_hr FROM daily WHERE date=?", (day,)
            ).fetchone()
            rhr = got["resting_hr"] if got else None
        row = transform.activity_row(activity, rhr)
        if row["activity_id"] is None or not row["date"]:
            log.warning("skipping activity with no id or date: %s", activity.get("activityName"))
            continue
        db.upsert_activity(conn, row)
        written += 1
    return written


def ingest_range(
    start: date,
    end: date,
    mode: str = "sync",
    force: bool = False,
    client=None,
) -> dict[str, Any]:
    """Pull [start, end] inclusive. The one function every entry point calls."""
    conn = db.connect()
    db.init(conn)
    run_id = db.start_run(conn, mode, start.isoformat(), end.isoformat())
    counts = {"ok": 0, "partial": 0, "missing": 0}
    activities_written = 0

    try:
        client = client or garmin_client.from_tokens()
        for day in daterange(start, end):
            iso = day.isoformat()
            payloads = fetch_day(client, iso, force=force)
            status = write_day(conn, iso, payloads)
            counts[status] += 1
            conn.commit()
            log.info("%s %s", iso, status)

        activities = fetch_activities(client, start.isoformat(), end.isoformat())
        activities_written = write_activities(conn, activities)
        conn.commit()
        log.info("%d activities written", activities_written)

        db.set_meta(conn, "last_sync_date", end.isoformat())
        db.set_meta(conn, "last_sync_at", db.now_iso())
        conn.commit()
        db.finish_run(
            conn, run_id, status="ok", days_ok=counts["ok"],
            days_partial=counts["partial"], days_failed=counts["missing"],
            activities_written=activities_written,
        )
    except Exception as exc:  # noqa: BLE001
        # A failed run is recorded as failed. Silence here would look exactly
        # like a stretch of days the watch was not worn.
        db.finish_run(
            conn, run_id, status="failed", error=str(exc), days_ok=counts["ok"],
            days_partial=counts["partial"], days_failed=counts["missing"],
            activities_written=activities_written,
        )
        log.error("run %d failed: %s", run_id, exc)
        raise
    finally:
        conn.close()

    return {"run_id": run_id, "activities": activities_written, **counts}


def replay(start: date, end: date, activities: bool = True) -> dict[str, Any]:
    """Re-transform everything already on disk. No network, no Garmin call.

    This is the reason the raw layer exists: fix a parser or a constant, replay
    the history. Daily rows are rebuilt first so that activities can read each
    day's resting heart rate back out when they recompute training load.
    """
    conn = db.connect()
    db.init(conn)
    counts = {"ok": 0, "partial": 0, "missing": 0, "activities": 0}
    for day in daterange(start, end):
        iso = day.isoformat()
        payloads = {e: raw_archive.read(iso, e) for e in DAILY_ENDPOINTS}
        if all(p is None for p in payloads.values()):
            continue
        counts[write_day(conn, iso, payloads)] += 1
    conn.commit()

    if activities:
        seen: set[int] = set()
        for path in raw_archive.activity_archives():
            for activity in json.loads(path.read_text()):
                if activity.get("activityId") in seen:
                    continue
                seen.add(activity.get("activityId"))
                counts["activities"] += write_activities(conn, [activity])
        conn.commit()

    conn.close()
    return counts


def default_window(days: int) -> tuple[date, date]:
    """Last `days` days ending yesterday-or-today.

    Today is included because a manual sync at 22:00 should pick up today's
    activity, but today's sleep and HRV belong to a night that has not
    happened yet, so today usually lands as 'partial'. That is correct, not
    a gap.
    """
    end = date.today()
    return end - timedelta(days=days - 1), end


def main() -> None:
    logging_setup.setup()
    parser = argparse.ArgumentParser(description="Pull Garmin data into the local DB")
    parser.add_argument("--days", type=int, default=7, help="how many days back, ending today")
    parser.add_argument("--start", help="YYYY-MM-DD, overrides --days")
    parser.add_argument("--end", help="YYYY-MM-DD, defaults to today")
    parser.add_argument("--force", action="store_true", help="refetch days already archived")
    parser.add_argument("--replay", action="store_true", help="re-parse the archive, no network")
    args = parser.parse_args()

    if args.start:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end) if args.end else date.today()
    else:
        start, end = default_window(args.days)

    if args.replay:
        print(replay(start, end))
        return
    print(ingest_range(start, end, mode="sync", force=args.force))


if __name__ == "__main__":
    main()
