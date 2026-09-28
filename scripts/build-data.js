#!/usr/bin/env node
// Builds data/nt.json from the files in data/raw/ and prints a report.
// Usage: node scripts/build-data.js
// Raw files come from scripts/fetch-sources.sh (or can be placed by hand).

const fs = require("fs");
const path = require("path");
const CONFIG = require("../config.js");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "data", "nt.json");
const REPORT = path.join(ROOT, "data", "build-report.txt");
const OVERRIDES = path.join(ROOT, "data", "heading-overrides.json");

// code, name used in the tab-separated text files, eBible file number
const BOOKS = [
  ["MAT", "Matthew", 70], ["MRK", "Mark", 71], ["LUK", "Luke", 72], ["JHN", "John", 73],
  ["ACT", "Acts", 74], ["ROM", "Romans", 75], ["1CO", "1 Corinthians", 76], ["2CO", "2 Corinthians", 77],
  ["GAL", "Galatians", 78], ["EPH", "Ephesians", 79], ["PHP", "Philippians", 80], ["COL", "Colossians", 81],
  ["1TH", "1 Thessalonians", 82], ["2TH", "2 Thessalonians", 83], ["1TI", "1 Timothy", 84], ["2TI", "2 Timothy", 85],
  ["TIT", "Titus", 86], ["PHM", "Philemon", 87], ["HEB", "Hebrews", 88], ["JAS", "James", 89],
  ["1PE", "1 Peter", 90], ["2PE", "2 Peter", 91], ["1JN", "1 John", 92], ["2JN", "2 John", 93],
  ["3JN", "3 John", 94], ["JUD", "Jude", 95], ["REV", "Revelation", 96],
];
const BOOK_BY_NAME = Object.fromEntries(BOOKS.map(([code, name]) => [name, code]));
const BOOK_NAME = Object.fromEntries(BOOKS.map(([code, name]) => [code, name]));

// Where each row comes from. First source found wins.
const SOURCES = {
  msb: [
    { type: "txt", file: "msb.txt", encoding: "windows-1252" }, // majoritybible.com
    { type: "usfm", dir: "engmsb", name: (n, c) => `${n}-${c}engmsb.usfm` }, // eBible
  ],
  kjv: [{ type: "usfm", dir: "eng-kjv2006", name: (n, c) => `${n}-${c}eng-kjv2006.usfm` }],
  blb: [{ type: "txt", file: "blb.txt", encoding: "utf-8" }], // literalbible.com
  bbe: [{ type: "usfm", dir: "engBBE", name: (n, c) => `${n}-${c}engBBE.usfm` }],
};
// Section headings: first source that has any headings wins.
const HEADING_SOURCES = [
  { label: "Majority Standard Bible (eBible)", dir: "engmsb", name: (n, c) => `${n}-${c}engmsb.usfm` },
  { label: "Berean Standard Bible", dir: "bsb/bsb_usfm", name: (n, c) => `${c}.usfm` },
];

const lines = [];
const log = (...a) => { const s = a.join(" "); lines.push(s); console.log(s); };
const logFile = (...a) => lines.push(a.join(" ")); // report file only (long lists)

// ---------- parsers ----------

function readText(file, encoding) {
  const buf = fs.readFileSync(file);
  return new TextDecoder(encoding).decode(buf).replace(/^﻿/, "").replace(/\r/g, "");
}

// "Book c:v<TAB>text" per line. Returns Map "CODE c:v" -> text
function parseTxt(file, encoding) {
  const out = new Map();
  for (const line of readText(file, encoding).split("\n")) {
    const m = line.match(/^(.+?) (\d+):(\d+)\t(.*)$/);
    if (!m) continue;
    const code = BOOK_BY_NAME[m[1]];
    if (!code) continue;
    out.set(`${code} ${m[2]}:${m[3]}`, m[4]);
  }
  return out;
}

// Returns { verses: Map "c:v" -> text, headings: Map "c:v" -> heading }
function parseUsfm(file) {
  let text = readText(file, "utf-8");
  text = text
    .replace(/\\f\s[\s\S]*?\\f\*/g, "") // footnotes
    .replace(/\\fe\s[\s\S]*?\\fe\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "") // cross references
    .replace(/\\\+?w\s([^|\\]*?)(?:\|[^\\]*?)?\\\+?w\*/g, "$1"); // \w word|strong="..."\w*

  const verses = new Map();
  const headings = new Map();
  let ch = 0, cur = null, pendingHeading = null;
  const skip = /^\\(id|ide|h|toc\d|mt\d?|mte\d?|imt\d?|is\d?|ip|usfm|rem|r|d|sr|mr|cl|cp)\b/;
  const headingLine = /^\\(s\d?|ms\d?)\s+(.*)$/;

  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line) continue;
    const c = line.match(/^\\c\s+(\d+)/);
    if (c) { ch = +c[1]; cur = null; continue; }
    const h = line.match(headingLine);
    if (h) {
      if (ch) pendingHeading = cleanInline(h[2]);
      continue;
    }
    if (skip.test(line)) continue;
    // paragraph / poetry markers at line start (\p \m \q1 \pmo \li1 \b ...)
    if (!line.startsWith("\\v ")) line = line.replace(/^\\[a-z]+\d?\s*/, "");
    const parts = line.split(/\\v\s+(\d+)(?:-\d+)?\s*/);
    if (cur && parts[0]) verses.set(cur, verses.get(cur) + " " + parts[0]);
    for (let i = 1; i < parts.length; i += 2) {
      cur = `${ch}:${parts[i]}`;
      verses.set(cur, parts[i + 1] || "");
      if (pendingHeading) { headings.set(cur, pendingHeading); pendingHeading = null; }
    }
  }
  for (const [k, v] of verses) verses.set(k, cleanInline(v));
  return { verses, headings };
}

// Remove leftover character markers (\wj \add \nd \+wj ...), keep their words.
function cleanInline(s) {
  return s.replace(/\\\+?[a-z]+\d?\*?/g, "").replace(/\s+/g, " ").replace(/\s+([,.;:!?’”])/g, "$1").trim();
}

function loadRow(row) {
  for (const src of SOURCES[row]) {
    if (src.type === "txt") {
      const f = path.join(RAW, src.file);
      if (fs.existsSync(f)) return { label: src.file, map: parseTxt(f, src.encoding) };
    } else {
      const dir = path.join(RAW, src.dir);
      if (!fs.existsSync(dir)) continue;
      const map = new Map();
      for (const [code, , num] of BOOKS) {
        const f = path.join(dir, src.name(num, code));
        if (!fs.existsSync(f)) continue;
        for (const [k, v] of parseUsfm(f).verses) map.set(`${code} ${k}`, v);
      }
      if (map.size) return { label: src.dir, map };
    }
  }
  return null;
}

function loadHeadings() {
  for (const src of HEADING_SOURCES) {
    const dir = path.join(RAW, src.dir);
    if (!fs.existsSync(dir)) continue;
    const map = new Map();
    for (const [code, , num] of BOOKS) {
      const f = path.join(dir, src.name(num, code));
      if (!fs.existsSync(f)) continue;
      for (const [k, v] of parseUsfm(f).headings) map.set(`${code} ${k}`, v);
    }
    if (map.size) return { label: src.label, map };
  }
  return { label: "none", map: new Map() };
}

// ---------- text rules ----------

function stripBlb(s) {
  if (CONFIG.blbKeepMarkers) return s;
  return s.replace(/⁺/g, "").replace(/[\[\]]/g, "");
}
const norm = (s) => s.replace(/\s+/g, " ").trim();
const words = (s) => (s.match(/[A-Za-z0-9’']+/g) || []).length;
const isBracketed = (s) => /^[“‘"'(]*\[\[?[\s\S]*\]\]?[”’"'.)]*$/.test(s.trim());
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

// ---------- build ----------

const rows = CONFIG.rows;
const data = {};
const loaded = {};
log("NT Narration Recorder — data build", new Date().toISOString());
log("");
log("SOURCES");
for (const row of rows) {
  const r = loadRow(row);
  loaded[row] = r ? r.map : null;
  log(`  ${CONFIG.names[row].padEnd(24)} ${r ? `${r.label} (${r.map.size} verses incl. Old Testament)` : "MISSING — row will be empty"}`);
}
const headingSrc = loadHeadings();
log(`  ${"Section headings".padEnd(24)} ${headingSrc.label} (${headingSrc.map.size} headings)`);

// Heading overrides
let overrides = {};
if (fs.existsSync(OVERRIDES)) {
  overrides = JSON.parse(fs.readFileSync(OVERRIDES, "utf-8"));
  delete overrides._help;
}
const headings = new Map(headingSrc.map);
let overrideCount = 0;
for (const [key, val] of Object.entries(overrides)) {
  if (key.startsWith("_")) continue;
  overrideCount++;
  if (val === null) headings.delete(key);
  else headings.set(key, String(val));
}
log(`  ${"Heading overrides".padEnd(24)} ${overrideCount} from data/heading-overrides.json`);
log("");

let chapterCount = 0, verseCount = 0;
const flagCounts = {};
const flagged = {};
const addFlag = (verse, ref, f) => {
  verse.flags.push(f);
  const type = f.split(":")[0];
  flagCounts[f] = (flagCounts[f] || 0) + 1;
  (flagged[type] = flagged[type] || []).push(`${ref} (${f})`);
};

for (const [code, name] of BOOKS) {
  const chapters = {};
  // collect verse numbers from every row
  const keys = new Map(); // ch -> Set(v)
  for (const row of rows) {
    if (!loaded[row]) continue;
    for (const k of loaded[row].keys()) {
      if (!k.startsWith(code + " ")) continue;
      const [c, v] = k.slice(code.length + 1).split(":").map(Number);
      if (!keys.has(c)) keys.set(c, new Set());
      keys.get(c).add(v);
    }
  }
  const depth = Object.fromEntries(rows.map((r) => [r, 0])); // open [ ... ] spans per row
  for (const c of [...keys.keys()].sort((a, b) => a - b)) {
    chapterCount++;
    const list = [];
    for (const v of [...keys.get(c)].sort((a, b) => a - b)) {
      const ref = `${code} ${c}:${v}`;
      const verse = { v };
      for (const row of rows) {
        let t = loaded[row] ? norm(loaded[row].get(ref) || "") : "";
        if (/^\[\s*\]$/.test(t)) t = ""; // eBible placeholder for an omitted verse
        t = norm(t.replace(/¶/g, "")); // KJV paragraph marks (formatting, not wording)
        if (row === "blb") t = stripBlb(t);
        verse[row] = t;
      }
      const h = headings.get(ref);
      if (h) verse.heading = h;
      verse.flags = [];
      const main = verse[CONFIG.readRow];
      const anyText = rows.some((r) => verse[r]);
      for (const row of rows) {
        if (!verse[row] && anyText) addFlag(verse, ref, `missing:${row}`);
        const t = verse[row];
        const before = depth[row];
        depth[row] += (t.match(/\[/g) || []).length - (t.match(/\]/g) || []).length;
        if (t && (before > 0 || depth[row] > 0 || isBracketed(t))) addFlag(verse, ref, `bracketed:${row}`);
        if (row !== CONFIG.readRow && main && verse[row] && norm(verse[row]) === norm(main)) addFlag(verse, ref, `same-as-main:${row}`);
      }
      const total = rows.reduce((n, r) => n + verse[r].length, 0);
      if (total > CONFIG.longVerseChars) addFlag(verse, ref, "long");
      list.push(verse);
      verseCount++;
    }
    chapters[c] = list;
  }
  data[code] = { name, chapters };
}

// A book should start a section; add a placeholder if the source has none.
for (const [code] of BOOKS) {
  const first = data[code].chapters[1]?.[0];
  if (first && !first.heading) first.heading = `${BOOK_NAME[code]} ${1}`;
}

fs.writeFileSync(OUT, JSON.stringify({
  built: new Date().toISOString().slice(0, 10),
  order: BOOKS.map((b) => b[0]),
  books: data,
}));
log(`WROTE data/nt.json — ${BOOKS.length} books, ${chapterCount} chapters, ${verseCount} verses (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
if (chapterCount !== 260) log(`  WARNING: expected 260 chapters, got ${chapterCount}`);
log("");

// ---------- report ----------

const getVerse = (code, c, v) => data[code]?.chapters[c]?.find((x) => x.v === v);

log("FLAGS");
for (const [f, n] of Object.entries(flagCounts).sort()) log(`  ${f.padEnd(24)} ${n}`);
for (const type of ["missing", "bracketed", "long"]) {
  if (!flagged[type]) continue;
  log(`  ${type} verses:`);
  flagged[type].forEach((x, i) => (i < 40 ? log : logFile)(`    ${x}`));
  if (flagged[type].length > 40) log(`    ... ${flagged[type].length - 40} more in data/build-report.txt`);
}
log(`  same-as-main verses: ${flagged["same-as-main"]?.length || 0} (not listed; used to collapse rows)`);
log("");

log("TOP 20 VERSES BY COMBINED LENGTH (layout stress list)");
const all = [];
for (const code of Object.keys(data))
  for (const [c, list] of Object.entries(data[code].chapters))
    for (const v of list) all.push({ ref: `${BOOK_NAME[code]} ${c}:${v.v}`, code, c: +c, v, len: rows.reduce((n, r) => n + v[r].length, 0) });
all.sort((a, b) => b.len - a.len);
all.slice(0, 20).forEach((x, i) => log(`  ${String(i + 1).padStart(2)}. ${x.ref.padEnd(22)} ${x.len} chars`));
log("");

// Sections: from each heading to the verse before the next heading (within a book).
const sections = [];
for (const code of Object.keys(data)) {
  let s = null;
  for (const [c, list] of Object.entries(data[code].chapters)) {
    for (const v of list) {
      if (v.heading) {
        s = { code, heading: v.heading, start: [+c, v.v], end: [+c, v.v], words: 0 };
        sections.push(s);
      }
      s.end = [+c, v.v];
      s.words += words(v[CONFIG.readRow]);
    }
  }
}
const rangeStr = (s) => s.start[0] === s.end[0]
  ? `${BOOK_NAME[s.code]} ${s.start[0]}:${s.start[1]}–${s.end[1]}`
  : `${BOOK_NAME[s.code]} ${s.start[0]}:${s.start[1]}–${s.end[0]}:${s.end[1]}`;

log(`SECTIONS — ${sections.length} total`);
const crossing = sections.filter((s) => s.start[0] !== s.end[0]);
log(`  Sections that cross a chapter boundary: ${crossing.length}`);
for (const s of crossing) log(`    ${rangeStr(s).padEnd(30)} ${s.heading}`);
const over = sections.filter((s) => (s.words / CONFIG.wordsPerMinute) * 60 > CONFIG.shortMaxSeconds);
log(`  Sections over ${fmtTime(CONFIG.shortMaxSeconds)} at ${CONFIG.wordsPerMinute} words/min (publish as regular vertical videos, not Shorts): ${over.length} of ${sections.length}`);
for (const s of over) log(`    ${fmtTime((s.words / CONFIG.wordsPerMinute) * 60).padStart(5)}  ${rangeStr(s).padEnd(30)} ${s.heading}`);
const secs = sections.map((s) => (s.words / CONFIG.wordsPerMinute) * 60).sort((a, b) => a - b);
log(`  Section length: shortest ${fmtTime(secs[0])}, median ${fmtTime(secs[secs.length >> 1])}, longest ${fmtTime(secs[secs.length - 1])}`);
log("  (Every section's estimated length is in the app's control panel and in its CSV export.)");
log("");

// Rough estimate of the Section-format fit (the app's Layout audit gives exact numbers).
function sectionFit(v) {
  const W = 540 - 40 - 81, H = 960 - 96 - 240 - 76; // content box minus header
  const lh = 1.28, cw = 0.47; // line height, average char width in em (Source Serif 4)
  const main = v[CONFIG.readRow];
  const same = rows.filter((r) => r !== CONFIG.readRow && v.flags.includes(`same-as-main:${r}`));
  const comps = rows.filter((r) => r !== CONFIG.readRow && !same.includes(r));
  const h = (text, px) => Math.max(1, Math.ceil((text.length * px * cw) / W)) * px * lh;
  for (const [m, cp, lb] of sectionScale()) {
    let total = lb * 1.3 + 4 + h(main, m);
    for (const r of comps) total += 16 + lb * 1.3 + 2 + h(v[r] || "—", cp);
    if (same.length) total += 16 + lb * 1.3 * 2;
    if (total <= H) return cp;
  }
  return 0;
}
function sectionScale() {
  const out = [];
  for (let m = 46; m >= 24; m--) { const c = Math.max(18, Math.round(m * 0.66)); out.push([m, c, Math.min(18, c)]); }
  for (let m = 23; m >= 10; m--) { const c = Math.max(8, Math.round(m * 0.75)); out.push([m, c, Math.max(12, Math.min(18, c))]); }
  return out;
}
const small = all.map((x) => ({ ...x, px: sectionFit(x.v) })).filter((x) => x.px < CONFIG.smallTextPx).sort((a, b) => a.px - b.px);
log(`SMALL-TEXT VERSES (estimate): Section-format comparison text below ${CONFIG.smallTextPx}px — ${small.length}`);
small.forEach((x, i) => (i < 25 ? log : logFile)(`    ${x.ref.padEnd(22)} ~${x.px}px`));
if (small.length > 25) log(`    ... ${small.length - 25} more in data/build-report.txt`);
log("  Exact sizes: open the app, turn on Layout audit in the control panel.");
log("");

log("BIBLE IN BASIC ENGLISH MANUSCRIPT CHECK");
log("  Verses the Textus Receptus includes and critical texts omit or footnote:");
let bbeTr = 0;
for (const [code, c, v, trNote] of [["MAT", 17, 21], ["MAT", 18, 11], ["ACT", 8, 37], ["1JN", 5, 7]]) {
  const x = getVerse(code, c, v) || { bbe: "", blb: "", kjv: "" };
  log(`  ${BOOK_NAME[code]} ${c}:${v}`);
  for (const r of ["kjv", "blb", "bbe"]) log(`    ${CONFIG.names[r].padEnd(24)} ${x[r] || "(no text)"}`);
}
{
  const m1721 = getVerse("MAT", 17, 21)?.bbe, m1811 = getVerse("MAT", 18, 11)?.bbe, a837 = getVerse("ACT", 8, 37)?.bbe;
  const j57 = getVerse("1JN", 5, 7)?.bbe || "";
  if (m1721) bbeTr++;
  if (m1811) bbeTr++;
  if (a837) bbeTr++;
  if (/Father|Word/.test(j57)) bbeTr++;
  log(bbeTr === 0
    ? '  RESULT: Bible in Basic English leaves them out like the Berean Literal Bible. "Critical Text" label stands.'
    : `  RESULT: Bible in Basic English includes ${bbeTr} of 4 Textus Receptus readings. REVIEW the "Critical Text" label.`);
}
log("");

log("SPOT CHECKS (BibleHub, 2026)");
const checks = [
  ["2CO", 6, 12, "msb", "It is not our affection, but yours, that is restrained."],
  ["2CO", 6, 12, "kjv", "Ye are not straitened in us, but ye are straitened in your own bowels."],
  ["2CO", 6, 12, "blb", "You are not restrained by us, but you are restrained in your own inner parts."],
  ["2CO", 6, 12, "bbe", "It is not our feelings to you which are narrow, but yours to us."],
  ["JHN", 11, 35, "kjv", "Jesus wept."],
  ["JHN", 11, 35, "blb", "Jesus wept."],
  ["JHN", 11, 35, "bbe", "And Jesus himself was weeping."],
  ["JHN", 11, 35, "msb", "Jesus wept."],
];
for (const [code, c, v, row, want] of checks) {
  const got = getVerse(code, c, v)?.[row] || "";
  log(`  ${got === want ? "PASS" : "FAIL"}  ${BOOK_NAME[code]} ${c}:${v} ${CONFIG.names[row]}${got === want ? "" : `\n        expected: ${want}\n        got:      ${got}`}`);
}
{
  const want = "Then I saw the thrones, and those seated on them had been given authority to judge.";
  const got = getVerse("REV", 20, 4)?.msb || "";
  log(`  ${got.startsWith(want) ? "PASS" : "FAIL"}  Revelation 20:4 Majority Standard Bible begins "${want}"`);
}
log("");

log("TEXTUAL VARIANT PASSAGES — what the data shows");
const show = (code, c, from, to) => {
  for (let v = from; v <= to; v++) {
    const x = getVerse(code, c, v);
    log(`  ${BOOK_NAME[code]} ${c}:${v}${x?.heading ? `   [section: ${x.heading}]` : ""}`);
    for (const r of rows) log(`    ${CONFIG.names[r].padEnd(24)} ${x?.[r] || "(no text)"}`);
  }
};
show("ACT", 8, 37, 37);
show("MAT", 18, 11, 11);
show("1JN", 5, 7, 8);
log("  Mark 16:9–20 (first and last verse):");
show("MRK", 16, 9, 9); show("MRK", 16, 20, 20);
log("  John 7:53–8:11 (first and last verse):");
show("JHN", 7, 53, 53); show("JHN", 8, 11, 11);

fs.writeFileSync(REPORT, lines.join("\n") + "\n");
console.log("\n(Report also saved to data/build-report.txt)");
