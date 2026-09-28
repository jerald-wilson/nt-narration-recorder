#!/bin/sh
# Makes the YouTube banner from a real screenshot of the app.
# Usage: branding/banner.sh "john 17:17"
set -e
cd "$(dirname "$0")"
REF="${1:-john 17:17}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8799
python3 -m http.server $PORT --directory .. >/dev/null 2>&1 & SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=5000 "$@" 2>/dev/null; }
Q=$(printf %s "$REF" | sed 's/ /+/g')
shot --force-device-scale-factor=2 --window-size=960,540 --screenshot="$PWD/stage.png" \
  "http://localhost:$PORT/index.html?ref=$Q&format=full&stage=only"
shot --force-device-scale-factor=1 --window-size=2560,1440 --screenshot="$PWD/banner-2560x1440.png" \
  "http://localhost:$PORT/branding/banner.html"
shot --force-device-scale-factor=1 --window-size=2560,1440 --screenshot="$PWD/banner-guides.png" \
  "http://localhost:$PORT/branding/banner.html?guides=1"
ls -la stage.png banner-*.png
