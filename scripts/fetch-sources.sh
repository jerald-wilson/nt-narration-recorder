#!/bin/sh
# Downloads the raw Bible sources into data/raw/, then run: node scripts/build-data.js
set -e
cd "$(dirname "$0")/../data/raw"
curl -fL -o msb.txt https://majoritybible.com/msb.txt              # Majority Standard Bible (majoritybible.com)
curl -fL -o blb.txt https://literalbible.com/blb.txt               # Berean Literal Bible (literalbible.com)
curl -fL -o bsb_usfm.zip https://bereanbible.com/bsb_usfm.zip      # Berean Standard Bible, for section headings
for id in eng-kjv2006 engBBE engmsb; do                            # King James, Basic English, MSB (eBible.org)
  curl -fL -o "${id}_usfm.zip" "https://ebible.org/Scriptures/${id}_usfm.zip"
done
rm -rf bsb eng-kjv2006 engBBE engmsb
mkdir -p bsb && unzip -qo bsb_usfm.zip -d bsb
for id in eng-kjv2006 engBBE engmsb; do mkdir -p "$id" && unzip -qo "${id}_usfm.zip" -d "$id"; done
echo "Done. Now run: node scripts/build-data.js"
