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

  // Metadata templates. {heading} {ref} {book} {chapter}
  titles: {
    section: "{heading} | {ref} | Majority Standard Bible with three translations",
    chapter: "{book} {chapter} | Full chapter reading, Majority Standard Bible with three translations",
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
