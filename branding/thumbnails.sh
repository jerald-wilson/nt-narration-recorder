#!/bin/sh
# Renders YouTube thumbnails (1280 × 720 PNG) from branding/thumbnail.html into thumbnails/{TRANSLATION}/.
# Start with --tr kjv (or msb, blb, bbe) for another read translation; the default is msb.
#
#   branding/thumbnails.sh "MAT 5" "JHN 3"      chapters             -> thumbnails/MSB/MAT-5.png, JHN-3.png
#   branding/thumbnails.sh --tr kjv MAT         a whole book, KJV    -> thumbnails/KJV/MAT-1.png, …
#   branding/thumbnails.sh MAT                  a whole book
#   branding/thumbnails.sh                      all 260 chapters (a few minutes)
#   branding/thumbnails.sh --books              a playlist cover per book -> thumbnails/book-MAT.png, ...
#   branding/thumbnails.sh --books MAT JHN      just those books
#   branding/thumbnails.sh --title "Missing verses" --kicker "Why some Bibles skip Acts 8:37"
#                                               an explainer video   -> thumbnails/MSB/missing-verses.png
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TR=msb
if [ "$1" = "--tr" ]; then TR=$(printf %s "$2" | tr '[:upper:]' '[:lower:]'); shift 2; fi
case "$TR" in msb|kjv|blb|bbe) ;; *) echo "Unknown translation: $TR (use msb, kjv, blb, or bbe)"; exit 1 ;; esac
OUT="thumbnails/$(printf %s "$TR" | tr '[:lower:]' '[:upper:]')"
mkdir -p "$OUT"

shot() { # output query. Headless Chrome occasionally stalls, so each render gets 40 seconds and 3 tries.
  for try in 1 2 3; do
    if perl -e 'alarm 40; exec @ARGV' "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      --allow-file-access-from-files --virtual-time-budget=5000 --window-size=1280,720 \
      --screenshot="$ROOT/$OUT/$1" "file://$ROOT/branding/thumbnail.html?$2&tr=$TR" 2>/dev/null; then
      echo "$OUT/$1"; return 0
    fi
  done
  echo "FAILED: $OUT/$1 (run it again on its own)"
}
enc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

if [ "$1" = "--books" ]; then
  shift
  for B in ${@:-$(node -e 'console.log(require("./data/nt.json").order.join(" "))')}; do
    B=$(printf %s "$B" | tr '[:lower:]' '[:upper:]')
    node -e 'if (!require("./data/nt.json").books[process.argv[1]]) { console.error("Unknown book: " + process.argv[1]); process.exit(1); }' "$B"
    shot "book-$B.png" "book=$B"
  done
  exit
fi

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
