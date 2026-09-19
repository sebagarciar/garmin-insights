#!/usr/bin/env bash
# Start the dashboard. One command, no arguments.
#
#   ./scripts/dashboard.sh
#
# Builds the front end if it has never been built, then serves both the UI and
# the API at http://localhost:8090. Stop it with ctrl-c. Nothing keeps running
# afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d web/dist ]; then
  echo "Building the front end (first run only)..."
  npm --prefix web install
  npm --prefix web run build
fi

echo "Dashboard on http://localhost:8090"
exec ./.venv/bin/uvicorn api.main:app --port 8090
