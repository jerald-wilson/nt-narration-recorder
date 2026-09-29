#!/usr/bin/env node
// Writes video-descriptions.txt: a title and description for every chapter video and every section
// video in the New Testament. Uses the same wording as the app's "Export this chapter" buttons
// (exportCsv / exportTxt in app.js); change both together.
// Run: node scripts/build-descriptions.js   (after node scripts/build-data.js)
"use strict";
const fs = require("fs");
const path = require("path");
const C = require("../config.js");

const root = path.join(__dirname, "..");
const DB = JSON.parse(fs.readFileSync(path.join(root, "data/nt.json"), "utf8"));

const countWords = (s) => (s.match(/[A-Za-z0-9’']+/g) || []).length;
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const joinNames = (a) => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + (a.length > 2 ? "," : "") + " and " + a[a.length - 1];
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? "");
const bookName = (b) => DB.books[b].name;
const chapterNums = (b) => Object.keys(DB.books[b].chapters).map(Number).sort((x, y) => x - y);
const rangeStr = (s) => s.start[0] === s.end[0]
  ? `${s.start[0]}:${s.start[1]}–${s.end[1]}`
  : `${s.start[0]}:${s.start[1]}–${s.end[0]}:${s.end[1]}`;
const secSeconds = (s) => (s.words / C.wordsPerMinute) * 60;
const readLine = `Read from the ${C.names[C.readRow]}, shown with the ${joinNames(C.rows.filter((r) => r !== C.readRow).map((r) => C.names[r]))} for comparison.`;

// Sections: from each heading to the verse before the next heading (never across books), as in app.js.
function sectionsOf(b) {
  const list = [];
  let s = null;
  for (const c of chapterNums(b)) {
    for (const v of DB.books[b].chapters[c]) {
      if (v.heading || !s) { s = { heading: v.heading || bookName(b), start: [c, v.v], end: [c, v.v], words: 0 }; list.push(s); }
      s.end = [c, v.v];
      s.words += countWords(v[C.readRow] || "");
    }
  }
  return list;
}

const rule = "=".repeat(78);
const out = [
  "VIDEO TITLES AND DESCRIPTIONS — New Testament",
  "",
  "Every chapter video and every section video, in Bible order. Search with Cmd+F for a chapter,",
  'for example "MARK 4". Copy the Title and the lines under Description into YouTube.',
  "",
  "Chapter videos: replace each ??:?? with the time that section starts in the finished video.",
  "YouTube chapters need 00:00 first, at least 3 timestamps, and at least 10 seconds each.",
  "Section lengths are estimates at " + C.wordsPerMinute + " words per minute; over " + fmtTime(C.shortMaxSeconds) + " publishes as a regular vertical video, not a Short.",
  "",
  "Built by scripts/build-descriptions.js from data/nt.json and config.js. Rebuild after changing either.",
  "",
];
let nChapters = 0, nSections = 0;

for (const b of DB.order) {
  const sections = sectionsOf(b);
  for (const c of chapterNums(b)) {
    const verses = DB.books[b].chapters[c];
    const chTitle = fill(C.titles.chapter, { book: bookName(b), chapter: c });
    const chSecs = verses.reduce((n, v) => n + countWords(v[C.readRow] || ""), 0) / C.wordsPerMinute * 60;
    out.push(rule, `${bookName(b).toUpperCase()} ${c}`, rule, "");

    // Chapter video
    out.push(`CHAPTER VIDEO (about ${fmtTime(chSecs)})`, "", `Title: ${chTitle}`, "", "Description:");
    const touching = sections.filter((s) => s.start[0] <= c && s.end[0] >= c);
    touching.forEach((s, i) => {
      const from = s.start[0] < c ? [c, verses[0].v] : s.start;
      const to = s.end[0] > c ? [c, verses.at(-1).v] : s.end;
      out.push(`${i === 0 ? "00:00" : "??:??"} ${s.heading} (${from[0]}:${from[1]}–${to[1]})`);
    });
    out.push("", readLine, "", ...C.attribution, "");
    nChapters++;

    // Section videos that start in this chapter
    const starting = sections.filter((s) => s.start[0] === c);
    starting.forEach((s, i) => {
      const secs = secSeconds(s);
      const isShort = secs <= C.shortMaxSeconds;
      const ref = `${bookName(b)} ${rangeStr(s)}`;
      out.push(
        "-".repeat(78),
        `SECTION VIDEO ${i + 1} of ${starting.length}: ${s.heading} (${ref}) · about ${fmtTime(secs)} · ${isShort ? "Short: set Related video to the chapter video" : "Vertical video, over " + fmtTime(C.shortMaxSeconds)}`,
      );
      if (s.start[0] !== s.end[0]) out.push("Crosses a chapter break.");
      out.push(
        "",
        `Title: ${fill(C.titles.section, { heading: s.heading, ref, book: bookName(b), chapter: c })}`,
        "",
        "Description:",
        `${s.heading} — ${ref}`,
        readLine,
        isShort ? `Full chapter: ${bookName(b)} ${c} (linked as the Related video).` : `Full chapter: ${bookName(b)} ${c} — [add link to the chapter video].`,
        "",
        ...C.attribution,
        "",
      );
      nSections++;
    });
    out.push("");
  }
}

fs.writeFileSync(path.join(root, "video-descriptions.txt"), out.join("\n"));
console.log(`video-descriptions.txt: ${nChapters} chapter videos, ${nSections} section videos`);
