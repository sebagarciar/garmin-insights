"""Paths, environment and the few knobs this project has.

Everything resolves relative to the project root, so a script started from
any directory (launchd starts them from /) writes to the same places.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.environ.get("GARMIN_DATA_DIR", ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
DB_PATH = Path(os.environ.get("GARMIN_DB_PATH", DATA_DIR / "garmin.db"))
LOG_DIR = Path(os.environ.get("GARMIN_LOG_DIR", ROOT / "logs"))

# Token cache lives outside the repo: it is a credential, the repo is not.
TOKENSTORE = Path(os.environ.get("GARMIN_TOKENSTORE", "~/.garmin_tokens")).expanduser()
GARMIN_EMAIL = os.environ.get("GARMIN_EMAIL")
GARMIN_PASSWORD = os.environ.get("GARMIN_PASSWORD")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

# Rolling window every "deviation from baseline" figure is measured against.
BASELINE_WINDOW_DAYS = int(os.environ.get("BASELINE_WINDOW_DAYS", "30"))
# Fallback bounds for the computed training load when Garmin gives us none.
HR_MAX = int(os.environ.get("HR_MAX", "190"))
HR_REST_FALLBACK = int(os.environ.get("HR_REST_FALLBACK", "55"))

# Sessions needed inside the 28-day chronic window before the acute:chronic
# ratio is reported at all. The metric was designed for athletes training
# several times a week; on sparse training the chronic average collapses
# towards zero and one ordinary session reads as a 4x spike.
MIN_CHRONIC_SESSIONS = int(os.environ.get("MIN_CHRONIC_SESSIONS", "4"))

# Politeness delay between Garmin calls, seconds. The API is unofficial and
# a backfill makes hundreds of requests; hammering it is how accounts get
# rate limited.
REQUEST_DELAY = float(os.environ.get("GARMIN_REQUEST_DELAY", "1.0"))

for _d in (DATA_DIR, RAW_DIR, LOG_DIR):
    _d.mkdir(parents=True, exist_ok=True)
