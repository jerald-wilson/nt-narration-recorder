#!/bin/sh
# Renders YouTube thumbnails (1280 × 720 PNG) from branding/thumbnail.html into thumbnails/.
#
#   branding/thumbnails.sh "MAT 5" "JHN 3"      chapters             -> thumbnails/MAT-5.png, JHN-3.png
#   branding/thumbnails.sh MAT                  a whole book
#   branding/thumbnails.sh                      all 260 chapters (a few minutes)
#   branding/thumbnails.sh --title "Missing verses" --kicker "Why some Bibles skip Acts 8:37"
#                                               an explainer video   -> thumbnails/missing-verses.png
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p thumbnails

shot() { # output query. Headless Chrome occasionally stalls, so each render gets 40 seconds and 3 tries.
  for try in 1 2 3; do
    if perl -e 'alarm 40; exec @ARGV' "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --allow-file-access-from-files --virtual-time-budget=5000 --window-size=1280,720 \
      --screenshot="$ROOT/thumbnails/$1" "file://$ROOT/branding/thumbnail.html?$2" 2>/dev/null; then
      echo "thumbnails/$1"; return 0
    fi
  done
  echo "FAILED: thumbnails/$1 (run it again on its own)"
}
enc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

if [ "$1" = "--title" ]; then
  TITLE="$2"; shift 2
  KICKER=""; GREEK=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --kicker) KICKER="$2"; shift 2 ;;
      --greek) GREEK="$2"; shift 2 ;;
      *) echo "Unknown option: $1"; exit 1 ;;
    esac
  done
  SLUG=$(printf %s "$TITLE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')
  shot "$SLUG.png" "title=$(enc "$TITLE")&kicker=$(enc "$KICKER")$( [ -n "$GREEK" ] && printf '&greek=%s' "$(enc "$GREEK")" )"
  exit
fi

# Expand the arguments ("MAT 5", "mat", nothing = everything) into BOOK CHAPTER lines.
node -e '
  const d = require("./data/nt.json");
  const args = process.argv.slice(1);
  const out = [];
  for (const a of args.length ? args : d.order) {
    const [b, c] = a.toUpperCase().split(/\s+/);
    if (!d.books[b]) { console.error("Unknown book: " + b + " (use codes like MAT, 1CO, REV)"); process.exit(1); }
    const chs = c ? [c] : Object.keys(d.books[b].chapters);
    for (const ch of chs) { if (!d.books[b].chapters[ch]) { console.error("No chapter " + b + " " + ch); process.exit(1); } out.push(b + " " + ch); }
  }
  console.log(out.join("\n"));
' "$@" | while read -r B C; do
  shot "$B-$C.png" "ref=$B+$C"
done
