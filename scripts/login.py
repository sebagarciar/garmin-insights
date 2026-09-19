#!/usr/bin/env python
"""One-time Garmin login. Run it yourself: it asks for your password.

The password is typed into this prompt, used once to mint a token, and never
written anywhere. What lands on disk is ~/.garmin_tokens/garmin_tokens.json,
which every later run uses instead. If you prefer, put GARMIN_EMAIL and
GARMIN_PASSWORD in .env and this script will read them rather than ask.

Usage:  ./.venv/bin/python scripts/login.py
"""

from __future__ import annotations

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from garminconnect import Garmin  # noqa: E402

from src import config  # noqa: E402


def ask_mfa() -> str:
    return input("Garmin sent a code. Enter it: ").strip()


def main() -> int:
    email = config.GARMIN_EMAIL or input("Garmin Connect email: ").strip()
    password = config.GARMIN_PASSWORD or getpass.getpass("Garmin Connect password (not stored): ")

    config.TOKENSTORE.mkdir(parents=True, exist_ok=True)
    config.TOKENSTORE.chmod(0o700)

    client = Garmin(email=email, password=password, prompt_mfa=ask_mfa)
    try:
        client.login(tokenstore=str(config.TOKENSTORE))
    except Exception as exc:  # noqa: BLE001
        print(f"\nLogin failed: {exc}")
        print("If you have two-factor on, the code prompt appears above; check spam for the email.")
        return 1

    tokenfile = config.TOKENSTORE / "garmin_tokens.json"
    tokenfile.chmod(0o600)
    print(f"\nLogged in as {client.get_full_name()}.")
    print(f"Token saved to {tokenfile}. You will not be asked for the password again.")
    print("Next: ./.venv/bin/python scripts/backfill.py --start 2026-01-01")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
