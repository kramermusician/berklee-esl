#!/bin/bash
# Sentence Crane. Serves the folder on port 8777 and opens it in Google Chrome.
# Chrome on purpose: it has the most reliable Gamepad API. Idempotent.
cd "$(dirname "$0")" || exit 1
PORT=8777
if ! lsof -ti tcp:$PORT >/dev/null 2>&1; then
  python3 -m http.server "$PORT" >/dev/null 2>&1 &
  sleep 1
fi
URL="http://localhost:$PORT/index.html?v=$(date +%s)"
open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
