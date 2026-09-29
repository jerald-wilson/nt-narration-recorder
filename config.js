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

  // Title slides. The intro names the chapter (or section) and the translations; the outro leaves the
  // frame below its text empty for YouTube's end screen (subscribe button, recommended video).
  // YouTube Shorts can't have end screens, so Section videos have no slides unless added here.
  slides: { full: ["intro", "outro"], section: [] },
  // Seconds the outro stays up before the take stops itself. YouTube end screens run 5–20 seconds.
  // 0 = don't stop; press Enter.
  outroSeconds: 10,

  // Metadata templates. {heading} {ref} {book} {chapter}
  // YouTube titles are at most titleMax characters. Each title uses the first template in its list
  // that fits, so a long section heading drops the translation names instead of being cut off.
  titleMax: 100,
  titles: {
    section: ["{heading} | {ref} | MSB with KJV, BLB & BBE", "{heading} | {ref}"],
    chapter: ["{book} {chapter} | Full chapter reading | Majority Standard Bible compared with three translations",
      "{book} {chapter} | Full chapter reading | MSB with KJV, BLB & BBE"],
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
