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
3. Press **Enter** to connect the built-in recorder (Chrome). Chrome asks once per session to share
   this tab and to use the microphone; allow both. Pick your mic in the panel and check its level meter.
   Turn on Do Not Disturb first: the recorder takes no computer audio, but the mic hears the speakers.
4. Press **R** for the chapter's intro slide, then **Enter** to start a take. Read, pressing Space for
   each verse. Space after the last verse shows the outro slide, which leaves room for YouTube's end
   screen (subscribe button and a recommended video); the take stops itself 10 seconds later, or press
   **Enter** to stop sooner. Full videos have both slides; set `slides` and `outroSeconds` in `config.js`.
   The video is cropped to the stage and saves to Downloads (`MRK-4-1-section-take1.mp4`; WebM on
   older Chrome), with a matching `.txt` holding its title and description. For a Full video the
   description's chapter times come from when you pressed Space, so there's nothing to fill in.
   Full screen is fine. The recorder needs Chrome.
5. Flubs: pause, re-read the sentence, keep going, and cut it later in the editor. To start over
   instead, press **Backspace twice**: the take is thrown away unsaved and you're back at the intro.

| Key | Action |
|---|---|
| Space, →, PageDown | next verse (works with a USB presenter clicker) |
| ←, PageUp | previous verse |
| Enter | connect the recorder, then start / stop a take |
| Backspace twice | throw the take away and go back to the intro |
| R | back to chapter start (the intro slide) |
| / and Esc | search / leave search |

**Exports** (under Exports and layout tools in the panel): `sections-BOOK-CH.csv` (titles, descriptions, lengths for each section
video) and `sections-BOOK-CH.txt` (the chapter's section list, ready for YouTube chapter times).

**All descriptions at once:** [`video-descriptions.txt`](video-descriptions.txt) has the title and
description for every chapter video and every section video in the New Testament. Search it for a
chapter (`MARK 4`). Rebuild it with `node scripts/build-descriptions.js` after changing `config.js` or
the data.

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
