#!/usr/bin/env bash
# AIRDOM v3.1 — اجرای نسخه مرورگر روی لینوکس/مک
cd "$(dirname "$0")"
PORT=8123
if command -v node >/dev/null 2>&1; then
  echo "[OK] starting node dev server on :$PORT"
  node server/dev-server.js "$PORT" &
  SRV=$!
else
  echo "[OK] starting python http server on :$PORT"
  python3 -m http.server "$PORT" &
  SRV=$!
fi
sleep 2
URL="http://localhost:$PORT"
echo "→ opening $URL"
( xdg-open "$URL" >/dev/null 2>&1 || open "$URL" >/dev/null 2>&1 ) || echo "open $URL in your browser"
echo "Ctrl+C to stop"
wait $SRV
