"""SQLite: schema, connection, upserts.

Two layers, as the PRD asks. This is the second one. Nothing here ever reads
the raw JSON archive; it only receives rows the transform layer produced, so
a bug in parsing can always be fixed and replayed from the archive without
another Garmin call.

Rolling metrics (baselines, deviation, acute:chronic load) are deliberately
NOT stored. They are derived in metrics.py at read time, because the answer
for any past day changes as more days arrive, and a stored copy would go
stale silently.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS daily (
    date                        TEXT PRIMARY KEY,
    resting_hr                  INTEGER,
    min_hr                      INTEGER,
    max_hr                      INTEGER,
    avg_hr_7d                   REAL,
    hrv_last_night              REAL,
    hrv_last_night_high         REAL,
    hrv_weekly_avg              REAL,
    hrv_status                  TEXT,
    hrv_baseline_low            REAL,
    hrv_baseline_balanced_low   REAL,
    hrv_baseline_balanced_high  REAL,
    sleep_score                 INTEGER,
    sleep_quality               TEXT,
    sleep_seconds               INTEGER,
    deep_seconds                INTEGER,
    light_seconds               INTEGER,
    rem_seconds                 INTEGER,
    awake_seconds               INTEGER,
    sleep_start_local           TEXT,
    sleep_end_local             TEXT,
    sleep_stress_avg            REAL,
    respiration_avg             REAL,
    spo2_avg                    REAL,
    stress_avg                  INTEGER,
    stress_max                  INTEGER,
    stress_rest_seconds         INTEGER,
    stress_low_seconds          INTEGER,
    stress_medium_seconds       INTEGER,
    stress_high_seconds         INTEGER,
    body_battery_high           INTEGER,
    body_battery_low            INTEGER,
    body_battery_charged        INTEGER,
    body_battery_drained        INTEGER,
    steps                       INTEGER,
    step_goal                   INTEGER,
    floors_climbed              INTEGER,
    distance_m                  REAL,
    calories_total              INTEGER,
    calories_active             INTEGER,
    intensity_moderate_min      INTEGER,
    intensity_vigorous_min      INTEGER,
    training_readiness          INTEGER,
    training_readiness_level    TEXT,
    updated_at                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
    activity_id         INTEGER PRIMARY KEY,
    date                TEXT NOT NULL,
    start_local         TEXT,
    type_key            TEXT,
    name                TEXT,
    duration_s          REAL,
    moving_duration_s   REAL,
    distance_m          REAL,
    calories            REAL,
    avg_hr              REAL,
    max_hr              REAL,
    garmin_load         REAL,
    computed_load       REAL,
    load_source         TEXT,
    aerobic_te          REAL,
    anaerobic_te        REAL,
    elevation_gain_m    REAL,
    steps               INTEGER,
    updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);

-- One row per (day, metric) saying whether the data actually arrived.
-- Missing days are recorded, never left as a silent NULL, because a silent
-- NULL drags a rolling average down as if the value were zero.
CREATE TABLE IF NOT EXISTS data_quality (
    date        TEXT NOT NULL,
    metric      TEXT NOT NULL,
    status      TEXT NOT NULL,          -- ok | missing | partial | error
    detail      TEXT,
    checked_at  TEXT NOT NULL,
    PRIMARY KEY (date, metric)
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at          TEXT NOT NULL,
    finished_at         TEXT,
    mode                TEXT,           -- sync | backfill | single
    start_date          TEXT,
    end_date            TEXT,
    days_ok             INTEGER DEFAULT 0,
    days_partial        INTEGER DEFAULT 0,
    days_failed         INTEGER DEFAULT 0,
    activities_written  INTEGER DEFAULT 0,
    status              TEXT,           -- running | ok | failed
    error               TEXT
);

-- v3. Schema now so tagging never needs a migration of existing data.
CREATE TABLE IF NOT EXISTS life_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,
    category    TEXT,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    note        TEXT,
    created_at  TEXT NOT NULL
);

-- v5. Same reason.
CREATE TABLE IF NOT EXISTS weekly_summaries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start  TEXT NOT NULL,
    week_end    TEXT NOT NULL,
    model       TEXT,
    digest_json TEXT,
    summary     TEXT,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key     TEXT PRIMARY KEY,
    value   TEXT
);
"""

DAILY_COLUMNS = [
    "date", "resting_hr", "min_hr", "max_hr", "avg_hr_7d",
    "hrv_last_night", "hrv_last_night_high", "hrv_weekly_avg", "hrv_status",
    "hrv_baseline_low", "hrv_baseline_balanced_low", "hrv_baseline_balanced_high",
    "sleep_score", "sleep_quality", "sleep_seconds", "deep_seconds",
    "light_seconds", "rem_seconds", "awake_seconds", "sleep_start_local",
    "sleep_end_local", "sleep_stress_avg", "respiration_avg", "spo2_avg",
    "stress_avg", "stress_max", "stress_rest_seconds", "stress_low_seconds",
    "stress_medium_seconds", "stress_high_seconds",
    "body_battery_high", "body_battery_low", "body_battery_charged",
    "body_battery_drained", "steps", "step_goal", "floors_climbed",
    "distance_m", "calories_total", "calories_active",
    "intensity_moderate_min", "intensity_vigorous_min",
    "training_readiness", "training_readiness_level",
]

ACTIVITY_COLUMNS = [
    "activity_id", "date", "start_local", "type_key", "name", "duration_s",
    "moving_duration_s", "distance_m", "calories", "avg_hr", "max_hr",
    "garmin_load", "computed_load", "load_source", "aerobic_te",
    "anaerobic_te", "elevation_gain_m", "steps",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _upsert(conn, table: str, columns: list[str], key: str, row: dict[str, Any]) -> None:
    """Insert or update one row, touching only the columns we actually have.

    A partial day (sleep arrived, HRV did not) must not blank out fields a
    previous run already wrote, so the update list is built from the keys
    present in `row`, not from the full column list.
    """
    present = [c for c in columns if c in row]
    if key not in present:
        raise ValueError(f"{key} missing from row")
    placeholders = ", ".join("?" for _ in present) + ", ?"
    updates = ", ".join(f"{c}=excluded.{c}" for c in present if c != key)
    sql = (
        f"INSERT INTO {table} ({', '.join(present)}, updated_at) "
        f"VALUES ({placeholders}) "
        f"ON CONFLICT({key}) DO UPDATE SET {updates}, updated_at=excluded.updated_at"
    )
    conn.execute(sql, [row[c] for c in present] + [now_iso()])


def upsert_daily(conn, row: dict[str, Any]) -> None:
    _upsert(conn, "daily", DAILY_COLUMNS, "date", row)


def upsert_activity(conn, row: dict[str, Any]) -> None:
    _upsert(conn, "activities", ACTIVITY_COLUMNS, "activity_id", row)


def record_quality(conn, date: str, metric: str, status: str, detail: str | None = None) -> None:
    conn.execute(
        "INSERT INTO data_quality (date, metric, status, detail, checked_at) "
        "VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(date, metric) DO UPDATE SET "
        "status=excluded.status, detail=excluded.detail, checked_at=excluded.checked_at",
        (date, metric, status, detail, now_iso()),
    )


def start_run(conn, mode: str, start_date: str, end_date: str) -> int:
    cur = conn.execute(
        "INSERT INTO sync_runs (started_at, mode, start_date, end_date, status) "
        "VALUES (?, ?, ?, ?, 'running')",
        (now_iso(), mode, start_date, end_date),
    )
    conn.commit()
    return int(cur.lastrowid)


def finish_run(conn, run_id: int, **fields: Any) -> None:
    fields["finished_at"] = now_iso()
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE sync_runs SET {sets} WHERE id=?", [*fields.values(), run_id])
    conn.commit()


def get_meta(conn, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_meta(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]
