#!/bin/bash
# Arranca el editor (API + interfaz compilada) con la configuración de .env.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
HOST="${HOST:-127.0.0.1}"; PORT="${PORT:-8088}"
case "${STORAGE_PATH:-storage}" in /*) ;; *) export STORAGE_PATH="$ROOT/backend/${STORAGE_PATH:-storage}" ;; esac
mkdir -p "$STORAGE_PATH"
[ -d frontend/dist ] || echo "AVISO: no hay frontend/dist; corré ./install.sh (o cd frontend && npm run build)"
cd backend
exec "$ROOT/.venv/bin/uvicorn" main:app --host "$HOST" --port "$PORT" --workers 1
