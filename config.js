// Shared settings for the app (browser) and the build script (Node).
// Edit here; everything else reads from this one object.
const CONFIG = {
  // The translation read aloud. Emphasis, next-verse preview, time estimates,
  // and default search follow it.
  readRow: "msb",

  // Display order.
  rows: ["msb", "kjv", "blb", "bbe"],

  // Full names, always shown in full on screen.
  names: {
    msb: "Majority Standard Bible",
    kjv: "King James Version",
    blb: "Berean Literal Bible",
    bbe: "Bible in Basic English",
  },

  // Greek manuscript tradition shown after each name.
  // bbe is checked by the build report (see "Bible in Basic English manuscript check").
  manuscripts: {
    msb: "Majority Text",
    kjv: "Textus Receptus",
    blb: "Critical Text",
    bbe: "Critical Text",
  },

  // Red letter: words of Jesus in red, for these rows. Only the Majority Standard Bible and the
  // King James Version have the data; the other two sources don't mark who is speaking.
  redLetter: ["msb", "kjv"],

  // Berean Literal Bible marks plural "you" with ⁺ and added words with [brackets].
  // false = strip both (default); true = keep the original markers. Rebuild after changing.
  blbKeepMarkers: false,

  // Reading-time estimate for the read translation.
  wordsPerMinute: 140,

  // Sections at or under this many seconds publish as Shorts.
  shortMaxSeconds: 180,

  // A verse is flagged "long" when all rows together exceed this many characters.
  longVerseChars: 900,

  // Section-format comparison text below this size is listed as "small text".
  smallTextPx: 18,

  // Password gate for the hosted page: a nuisance filter, not security (anyone can read the source).
  // Set it with: node scripts/set-password.js   Empty = no password. Never asked on localhost.
  passwordHash: "afb10608fb99bd3729a9a78d0753a91574816eb8bb9d89cbd263cbd553ac8323",

  // Title slides. The intro names the chapter (or section) and the translations; the outro leaves the
  // frame below its text empty for YouTube's end screen (subscribe button, recommended video).
  // YouTube Shorts can't have end screens, so Section videos have no slides unless added here.
  slides: { full: ["intro", "outro"], section: [] },
  // Seconds the outro stays up before the take stops itself. YouTube end screens run 5–20 seconds.
  // 0 = don't stop; press Enter.
  outroSeconds: 10,

  // Focal-point read panel: faded lines of the previous and next verse around the one being read,
  // only in space the verse doesn't need. Opacity of those lines, and how long the scroll takes.
  focus: { contextLines: 2, opacity: 0.38, scrollMs: 350 },

  // Thumbnail background per read translation (cream text sits on these; keep them dark).
  thumbColors: { msb: "#6E2419", kjv: "#1E2F4F", blb: "#24452D", bbe: "#7E5313" },

  // Metadata templates. {heading} {ref} {book} {chapter} {translation} (full name) {short} (MSB, KJV, …)
  // YouTube titles are at most titleMax characters. Each title uses the first template in its list
  // that fits, so a long section heading drops the channel name instead of being cut off.
  // To give one translation its own wording, add e.g.  kjv: { chapter: ["…"] }  inside titles.
  titleMax: 100,
  titles: {
    section: ["{heading} | {ref} ({short}) | Side by Side Scripture", "{heading} | {ref} ({short})"],
    chapter: ["{book} {chapter} ({short}) | Side by Side Scripture"],
  },

  // Attribution lines added to every description. All four are public domain.
  attribution: [
    "Majority Standard Bible — public domain, MajorityBible.com",
    "King James Version — public domain",
    "Berean Literal Bible — public domain, LiteralBible.com",
    "Bible in Basic English — public domain in the United States",
  ],
};

if (typeof module !== "undefined") module.exports = CONFIG;
