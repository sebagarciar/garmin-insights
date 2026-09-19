"""The read API for the dashboard, plus the one write it has: Sync.

Deliberately small. It holds no logic of its own: every number comes from
src/metrics.py, and the Sync button calls the same src/ingest.py a terminal
would. Nothing runs unless a request asks for it.
"""

from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src import config, db, garmin_client, ingest, logging_setup, metrics

logging_setup.setup()

app = FastAPI(title="Garmin Insights", version="0.2.0")

# The Vite dev server runs on another port during development. In normal use
# the built front end is served by this same app and no origin is crossed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def conn() -> sqlite3.Connection:
    c = db.connect()
    db.init(c)
    return c


def window(days: int) -> tuple[date, date]:
    end = date.today()
    return end - timedelta(days=days - 1), end


@app.get("/api/status")
def status() -> dict[str, Any]:
    c = conn()
    try:
        counts = {
            "days": c.execute("SELECT COUNT(*) n FROM daily").fetchone()["n"],
            "activities": c.execute("SELECT COUNT(*) n FROM activities").fetchone()["n"],
        }
        first = c.execute("SELECT MIN(date) d FROM daily").fetchone()["d"]
        last = c.execute("SELECT MAX(date) d FROM daily").fetchone()["d"]
        runs = db.rows_to_dicts(
            c.execute("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 5").fetchall()
        )
        token = (config.TOKENSTORE / "garmin_tokens.json").exists()
        return {
            "counts": counts,
            "first_day": first,
            "last_day": last,
            "last_sync_at": db.get_meta(c, "last_sync_at"),
            "authenticated": token,
            "baseline_window_days": config.BASELINE_WINDOW_DAYS,
            "recent_runs": runs,
        }
    finally:
        c.close()


@app.get("/api/metrics")
def metric_catalogue() -> list[dict[str, Any]]:
    """What the front end is allowed to ask for, so it never hardcodes a column."""
    return [
        {"key": m.key, "label": m.label, "unit": m.unit, "better": m.better,
         "precision": m.precision, "scale": m.scale}
        for m in metrics.METRICS.values()
    ]


@app.get("/api/overview")
def overview(days: int = Query(30, ge=7, le=365)) -> dict[str, Any]:
    """Everything the landing view needs, in one request."""
    start, end = window(days)
    c = conn()
    try:
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "metrics": metrics.latest_snapshot(c, end),
            "quality": metrics.quality(c, start, end),
        }
    finally:
        c.close()


@app.get("/api/series")
def metric_series(
    metric: str,
    days: int = Query(90, ge=7, le=730),
) -> dict[str, Any]:
    start, end = window(days)
    c = conn()
    try:
        return {
            "metric": metric,
            "definition": metric_definition(metric),
            "points": metrics.series(c, metric, start, end),
        }
    except KeyError:
        raise HTTPException(404, f"unknown metric: {metric}")
    finally:
        c.close()


def metric_definition(key: str) -> dict[str, Any]:
    m = metrics.METRICS[key]
    return {"key": m.key, "label": m.label, "unit": m.unit, "better": m.better,
            "precision": m.precision, "scale": m.scale}


@app.get("/api/correlation")
def correlation(
    x: str,
    y: str,
    lag: int = Query(0, ge=0, le=7),
    days: int = Query(90, ge=14, le=730),
) -> dict[str, Any]:
    start, end = window(days)
    c = conn()
    try:
        return metrics.correlate(c, x, y, start, end, lag)
    except KeyError as exc:
        raise HTTPException(404, f"unknown metric: {exc}")
    finally:
        c.close()


@app.get("/api/activities")
def activities(days: int = Query(30, ge=1, le=730)) -> list[dict[str, Any]]:
    start, end = window(days)
    c = conn()
    try:
        # metrics decides which load figure is authoritative; the endpoint does
        # not get its own opinion about that.
        return metrics.effective_loads(c, start, end)
    finally:
        c.close()


@app.get("/api/quality")
def quality(days: int = Query(30, ge=1, le=730)) -> dict[str, Any]:
    start, end = window(days)
    c = conn()
    try:
        return metrics.quality(c, start, end)
    finally:
        c.close()


# Life-event tags. Schema and endpoints exist from v1 so that tagging, when
# it lands in v3, never needs a migration of data already collected.
@app.get("/api/events")
def list_events() -> list[dict[str, Any]]:
    c = conn()
    try:
        return db.rows_to_dicts(
            c.execute("SELECT * FROM life_events ORDER BY start_date DESC").fetchall()
        )
    finally:
        c.close()


@app.post("/api/events")
def create_event(event: dict = Body(...)) -> dict[str, Any]:
    required = ("label", "start_date", "end_date")
    if not all(event.get(k) for k in required):
        raise HTTPException(422, f"label, start_date and end_date are required")
    c = conn()
    try:
        cur = c.execute(
            "INSERT INTO life_events (label, category, start_date, end_date, note, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (event["label"], event.get("category"), event["start_date"],
             event["end_date"], event.get("note"), db.now_iso()),
        )
        c.commit()
        return {"id": cur.lastrowid}
    finally:
        c.close()


@app.delete("/api/events/{event_id}")
def delete_event(event_id: int) -> dict[str, Any]:
    c = conn()
    try:
        c.execute("DELETE FROM life_events WHERE id=?", (event_id,))
        c.commit()
        return {"deleted": event_id}
    finally:
        c.close()


@app.post("/api/sync")
def sync(payload: dict = Body(default={})) -> dict[str, Any]:
    """Pull recent days from Garmin. Runs only when this is called.

    Defined with `def`, not `async def`, so FastAPI runs it on a worker thread
    and the rest of the dashboard stays responsive while Garmin is slow.
    """
    days = int(payload.get("days", 7))
    days = max(1, min(days, 60))
    force = bool(payload.get("force", False))
    start, end = window(days)
    try:
        return ingest.ingest_range(start, end, mode="sync", force=force)
    except garmin_client.NotAuthenticated as exc:
        raise HTTPException(401, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Garmin sync failed: {exc}")


# Serve the built front end, when there is one. Until `npm run build` has been
# run, the API simply answers on its own and the dev server handles the UI.
DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        # The front end is a single page, so any other path returns it and the
        # router sorts it out. An unknown /api path is a different matter: it
        # is a mistake, and answering it with HTML would hide that.
        if full_path.startswith("api/"):
            raise HTTPException(404, f"no such endpoint: /{full_path}")
        return FileResponse(DIST / "index.html")
