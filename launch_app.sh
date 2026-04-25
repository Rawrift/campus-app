#!/usr/bin/env bash
set -euo pipefail

URL="http://127.0.0.1:8000"
LOG_FILE="/tmp/campus_app.log"

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ No encontré python3 en este sistema."
  exit 1
fi

echo "🚀 Iniciando Campus App en $URL"
python3 run_app.py >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# Espera activa (hasta 10s) para evitar fallas por arranque lento
ready=false
for _ in {1..20}; do
  if curl -fsS "$URL/health" >/dev/null 2>&1; then
    ready=true
    break
  fi

  # Si el proceso ya murió, cortar antes y mostrar log
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    break
  fi

  sleep 0.5
done

if [[ "$ready" != "true" ]]; then
  echo "❌ La app no respondió en $URL. Revisá $LOG_FILE"
  if [[ -s "$LOG_FILE" ]]; then
    echo "--- Log ---"
    cat "$LOG_FILE"
    echo "-----------"
  fi
  exit 1
fi

echo "✅ App levantada."

# Intenta abrir navegador automáticamente (si está disponible)
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
fi

echo "👉 Ya podés entrar a: $URL"
echo "(Dejá esta terminal abierta. Para cerrar la app, presioná Ctrl+C)"

wait "$SERVER_PID"
