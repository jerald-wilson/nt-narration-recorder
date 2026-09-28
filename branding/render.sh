#!/bin/sh
# Renders branding/mark.html to PNGs with headless Chrome.
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
render() { # variant size output [extra query]
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --virtual-time-budget=3000 --allow-file-access-from-files \
    --window-size="$2,$2" --screenshot="$PWD/$3" "file://$PWD/mark.html?v=$1&size=$2$4" 2>/dev/null
}
for v in a b c d e f g; do
  render $v 150 "watermark-$v-150.png"
  render $v 800 "profile-$v-800.png" "&shape=circle"
done
ls -la *.png
