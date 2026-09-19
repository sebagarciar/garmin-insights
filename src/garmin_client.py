"""Logging in to Garmin Connect, once.

The password is used exactly one time, by scripts/login.py, to mint a token
pair that lands in ~/.garmin_tokens. Every run after that loads the token and
refreshes it. Nothing here writes a password anywhere.

python-garminconnect is unofficial. When Garmin changes something this is the
file that breaks first, which is why every failure below raises loudly with
the actual reason instead of returning an empty result that would look like
"no data that day".
"""

from __future__ import annotations

import logging

from garminconnect import Garmin

from . import config

log = logging.getLogger("garmin.client")


class NotAuthenticated(RuntimeError):
    """No usable token on disk. Run scripts/login.py."""


def from_tokens() -> Garmin:
    """Return a logged-in client using only the cached token.

    Deliberately does not fall back to email/password: a silent re-login on
    every sync is how you get flagged by Garmin, and it would hide the fact
    that the token stopped working.
    """
    tokenfile = config.TOKENSTORE / "garmin_tokens.json"
    if not tokenfile.exists():
        raise NotAuthenticated(
            f"No token at {tokenfile}. Run: ./.venv/bin/python scripts/login.py"
        )

    client = Garmin()
    try:
        client.login(tokenstore=str(config.TOKENSTORE))
    except Exception as exc:  # noqa: BLE001 - upstream raises many types
        raise NotAuthenticated(
            f"Token at {tokenfile} no longer works ({exc}). "
            "Run: ./.venv/bin/python scripts/login.py"
        ) from exc

    log.info("Authenticated as %s", client.get_full_name() or "unknown")
    return client
