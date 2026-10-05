# NT Narration Recorder

A small local web app for recording New Testament readings. It shows the verse being read in the
**Majority Standard Bible** with the **King James Version**, **Berean Literal Bible**, and
**Bible in Basic English** for comparison, one verse per screen, in two formats:

- **Section** (portrait 9:16, 540 × 960): one video per section, for Shorts, TikTok, and Reels.
- **Full video** (landscape 16:9, 960 × 540): one video per chapter, assembled from section clips.

Plain HTML, CSS, and JavaScript. No framework, no build tools, no network calls at runtime.

## Run it

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome or Safari. (It must be served over http; opening
`index.html` as a file won't load the data.)

## Record

1. Pick **Section** or **Full video**.
2. Press `/`, type a reference (`mark 4:1`, `2co 6`, `jn 3`) and press Enter.
3. Press **Enter** to choose the folder takes are saved in (once; Chrome remembers it, and may ask
   to allow it again on a later visit). Press **Enter** again to connect the recorder: Chrome asks to
   share this tab and to use the microphone; allow both. Pick your mic and check its level meter.
   Turn on Do Not Disturb first: the recorder takes no computer audio, but the mic hears the speakers.
4. Press **R** for the chapter's intro slide, then **Enter** to start a take. Read, pressing Space for
   each verse. Space after the last verse shows the outro slide, which leaves room for YouTube's end
   screen; the take stops itself 10 seconds later, or press **Enter** to stop sooner.
5. Each take is written into the folder with a `.txt` of its title and description
   (`MAT-5-1-full-take1.mp4`; the take number is the first one free in the folder, so nothing is
   overwritten). The panel lists the session's takes: **✓ Saved** only once the files are checked on
   disk; a failed save stays in memory with **Save again**. **Discard** (click twice) deletes a take.
6. Flubs: pause, re-read the sentence, keep going, and cut it later in the editor. To start over,
   press **Backspace twice**: during a take it's thrown away unsaved; between takes it deletes the
   one just finished. Either way you're back at the intro.

| Key | Action |
|---|---|
| Space, →, PageDown | next verse (works with a USB presenter clicker) |
| ←, PageUp | previous verse |
| Enter | connect the recorder, then start / stop a take |
| Backspace twice | throw away the take in progress, or delete the one just finished |
| R | back to chapter start (the intro slide) |
| / and Esc | search / leave search |

**Exports** (under Exports and layout tools in the panel): `sections-BOOK-CH.csv` (titles, descriptions, lengths for each section
video) and `sections-BOOK-CH.txt` (the chapter's section list, ready for YouTube chapter times).

**Reading other translations:** the **Reading** menu picks the translation you read (MSB, KJV, BLB,
BBE). It becomes the main row; titles, descriptions and time estimates follow it, and takes are saved
in a subfolder per translation (`KJV/MAT-5-1-full-kjv-take1.mp4`).

**All descriptions at once:** [`video-descriptions/`](video-descriptions) has a file per read translation
(`MSB.txt`, `KJV.txt`, …) with the title and description for every chapter and section video. Search
one for a chapter (`MARK 4`). Rebuild with `node scripts/build-descriptions.js` after changing
`config.js` or the data.

## Thumbnails

`branding/thumbnails.sh` renders 1280 × 720 YouTube thumbnails into `thumbnails/MSB/` (not committed);
start with `--tr kjv` (or `blb`, `bbe`) for another translation's color and badge, into `thumbnails/KJV/`:
`branding/thumbnails.sh "MAT 5"` for a chapter, `MAT` for a book, nothing for all 260, `--books` for
a playlist cover per book (`book-MAT.png`; `--books MAT JHN` for some), or
`--title "Missing verses" --kicker "Why some Bibles skip Acts 8:37"` for an explainer. The design is
`branding/thumbnail.html`: the chapter, its first section heading, and the book's Greek title behind.

## Password

The hosted page asks for a password (a nuisance filter, not security: the source is readable). Set or
change it with `node scripts/set-password.js`, then commit and push `config.js`. An empty password
removes the gate. It's never asked on localhost; add `?gate=1` to try it there.

## Settings

Everything is in [`config.js`](config.js): translation order, manuscript labels, words per minute,
the Shorts length limit, title templates, attribution lines. Stage colors and safe-zone margins are
CSS variables at the top of [`style.css`](style.css).

## Section headings

Headings come from the Berean Standard Bible, which the Majority Standard Bible shares (the Majority
Standard Bible downloads don't include headings). To rename, add, or remove one, edit
[`data/heading-overrides.json`](data/heading-overrides.json) and rebuild.

## Rebuild the data

```sh
scripts/fetch-sources.sh      # downloads raw sources into data/raw/
node scripts/build-data.js    # writes data/nt.json and prints the report
node scripts/build-descriptions.js  # writes video-descriptions.txt
```

The report (also saved to `data/build-report.txt`) lists flagged verses, the longest verses, section
lengths, verses with small text, the Bible in Basic English manuscript check, and spot checks.

## Sources

All four translations are in the public domain.

- Majority Standard Bible: majoritybible.com (`msb.txt`)
- Berean Literal Bible: literalbible.com (`blb.txt`). Plural-you `⁺` and `[added words]` brackets
  are stripped by default; set `blbKeepMarkers: true` in `config.js` to keep them.
- King James Version and Bible in Basic English: eBible.org USFM.
- Section headings: Berean Standard Bible USFM, bereanbible.com.
- Fonts: Source Serif 4 and IBM Plex Sans, SIL Open Font License (see `fonts/`).
