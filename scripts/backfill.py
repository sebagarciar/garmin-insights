#!/usr/bin/env python
"""Pull history once, in chunks, resumable.

Garmin is queried one day at a time and the unofficial API does not love
being hammered, so this walks the range in blocks with a pause between them
and skips days already settled in the raw archive. Interrupt it and run it again: it
picks up where it stopped.

Usage:
  ./.venv/bin/python scripts/backfill.py --start 2026-01-01
  ./.venv/bin/python scripts/backfill.py --start 2025-09-01 --end 2026-01-01
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import garmin_client, ingest, logging_setup  # noqa: E402


def main() -> int:
    log = logging_setup.setup()
    parser = argparse.ArgumentParser(description="Backfill Garmin history")
    parser.add_argument("--start", required=True, help="YYYY-MM-DD, first day to pull")
    parser.add_argument("--end", help="YYYY-MM-DD, defaults to today")
    parser.add_argument("--chunk", type=int, default=14, help="days per block")
    parser.add_argument("--pause", type=float, default=5.0, help="seconds between blocks")
    parser.add_argument("--force", action="store_true", help="refetch days already archived")
    args = parser.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end) if args.end else date.today()
    if start > end:
        print("start is after end")
        return 1

    try:
        client = garmin_client.from_tokens()
    except garmin_client.NotAuthenticated as exc:
        print(exc)
        return 1

    totals = {"ok": 0, "partial": 0, "missing": 0, "activities": 0}
    block_start = start
    while block_start <= end:
        block_end = min(block_start + timedelta(days=args.chunk - 1), end)
        log.info("block %s .. %s", block_start, block_end)
        result = ingest.ingest_range(
            block_start, block_end, mode="backfill", force=args.force, client=client
        )
        for k in ("ok", "partial", "missing"):
            totals[k] += result[k]
        totals["activities"] += result["activities"]
        block_start = block_end + timedelta(days=1)
        if block_start <= end:
            time.sleep(args.pause)

    log.info(
        "backfill done: %d complete days, %d partial, %d with no data, %d activities",
        totals["ok"], totals["partial"], totals["missing"], totals["activities"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
