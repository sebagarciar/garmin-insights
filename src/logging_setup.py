"""One logging setup, used by every entry point.

Logs go to both the console and logs/garmin.log, because a launchd run has
no console and a manual run wants one.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from . import config

_CONFIGURED = False


def setup(level: int = logging.INFO) -> logging.Logger:
    global _CONFIGURED
    root = logging.getLogger("garmin")
    if _CONFIGURED:
        return root

    root.setLevel(level)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    root.addHandler(console)

    logfile = RotatingFileHandler(
        config.LOG_DIR / "garmin.log", maxBytes=2_000_000, backupCount=3
    )
    logfile.setFormatter(fmt)
    root.addHandler(logfile)

    _CONFIGURED = True
    return root
