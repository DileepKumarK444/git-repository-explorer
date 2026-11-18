#!/usr/bin/env bash
# Usage: ./dev.sh        -> backend on :8787 (or $PORT) serving the built frontend
#        ./dev.sh dev    -> backend on :8787 + Vite dev server on :5173 (hot reload)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8787}"
export GRX_PORT="$PORT"
[ -d backend/.venv ] || { python3 -m venv backend/.venv && backend/.venv/bin/pip install -q -r backend/requirements.txt; }
if [ "${1:-}" = "dev" ]; then
  (cd frontend && npm run dev) &
  trap 'kill $! 2>/dev/null' EXIT
else
  [ -d frontend/dist ] || (cd frontend && npm install && npm run build)
fi
cd backend && exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
