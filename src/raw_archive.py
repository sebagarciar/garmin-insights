"""The raw layer: every Garmin response, on disk, untouched.

data/raw/<YYYY>/<MM>/<DD>/<endpoint>.json

This exists so that a wrong assumption in transform.py costs a replay and not
a year of history. Nothing downstream reads these files during normal
operation; ingest.py replays them only when explicitly asked to.
"""

from __future__ import annotations

import json
from datetime import date as date_cls
from pathlib import Path
from typing import Any

from . import config


def path_for(day: str, endpoint: str) -> Path:
    y, m, d = day.split("-")
    return config.RAW_DIR / y / m / d / f"{endpoint}.json"


def write(day: str, endpoint: str, payload: Any) -> Path:
    p = path_for(day, endpoint)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    return p


def read(day: str, endpoint: str) -> Any | None:
    p = path_for(day, endpoint)
    if not p.exists():
        return None
    return json.loads(p.read_text())


def has(day: str, endpoint: str) -> bool:
    return path_for(day, endpoint).exists()


def activity_archives() -> list[Path]:
    """Every archived activity pull, oldest file first.

    Activity responses cover a date range rather than a single day, so they are
    filed under their range's end date with the range in the name. Ranges
    overlap when a block is re-pulled; the upsert on activity_id sorts that out.
    """
    return sorted(config.RAW_DIR.glob("*/*/*/activities_*.json"))


def archived_days() -> list[str]:
    """Every day that has at least one archived payload, ascending."""
    days = set()
    for p in config.RAW_DIR.glob("*/*/*/*.json"):
        d, m, y = p.parent.name, p.parent.parent.name, p.parent.parent.parent.name
        try:
            date_cls.fromisoformat(f"{y}-{m}-{d}")
        except ValueError:
            continue
        days.add(f"{y}-{m}-{d}")
    return sorted(days)
