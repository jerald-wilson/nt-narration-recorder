"use strict";
// NT Narration Recorder. Plain JavaScript, no dependencies.
// Data: data/nt.json (built by scripts/build-data.js). Settings: config.js.

const C = CONFIG; // from config.js
const $ = (s) => document.querySelector(s);
const stage = $("#stage");

// ---------- storage (localStorage can be unavailable; the app still works) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("ntr." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ntr." + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------- state ----------
let DB = null;          // { order, books: { MAT: { name, chapters: { "1": [verse...] } } } }
let SECTIONS = {};      // book -> [{ heading, start:[c,v], end:[c,v], words }]
const state = {
  book: "MAT", ch: 1, i: 0,
  format: "section", mode: "practice",
  debug: false, loop: false, hardOnly: false,
};
const timer = { running: false, start: 0, acc: 0, id: 0 };

const chapter = () => DB.books[state.book].chapters[state.ch];
const verse = () => chapter()[state.i];
const bookName = (b) => DB.books[b].name;
const chapterNums = (b) => Object.keys(DB.books[b].chapters).map(Number).sort((a, b2) => a - b2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const countWords = (s) => (s.match(/[A-Za-z0-9’']+/g) || []).length;
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const joinNames = (a) => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + (a.length > 2 ? "," : "") + " and " + a[a.length - 1];
const refStr = (b, c, v) => `${bookName(b)} ${c}:${v}`;
const rangeStr = (s) => s.start[0] === s.end[0]
  ? `${s.start[0]}:${s.start[1]}–${s.end[1]}`
  : `${s.start[0]}:${s.start[1]}–${s.end[0]}:${s.end[1]}`;
const secSeconds = (s) => (s.words / C.wordsPerMinute) * 60;

// ---------- load ----------
fetch("data/nt.json")
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((data) => { DB = data; init(); })
  .catch((e) => { console.error(e); const el = $("#loading") || document.body.appendChild(document.createElement("div")); el.textContent = `Could not load data/nt.json (${e.message}). Serve this folder over http (e.g. python3 -m http.server) and run node scripts/build-data.js first.`; });

function init() {
  $("#loading").remove();
  buildSections();
  buildAliases();
  for (const b of DB.order) $("#book-pick").add(new Option(bookName(b), b));

  const last = store.get("pos", null);
  if (last && DB.books[last.book]) {
    const btn = $("#resume");
    btn.hidden = false;
    btn.textContent = `Resume last position: ${refStr(last.book, last.ch, last.v)} · ${last.format === "full" ? "Full video" : "Section"} · ${last.mode === "record" ? "Record" : "Practice"}`;
    btn.onclick = () => {
      state.format = last.format || "section";
      state.mode = last.mode || "practice";
      goTo(last.book, last.ch, last.v);
      btn.hidden = true;
    };
  }
  wireControls();
  goTo("MAT", 1, 1);
  // Fonts change text metrics: re-fit once they are ready.
  document.fonts.ready.then(() => render());
}

// Sections: from each heading to the verse before the next heading (never across books).
function buildSections() {
  for (const b of DB.order) {
    const list = [];
    let s = null;
    for (const c of chapterNums(b)) {
      for (const v of DB.books[b].chapters[c]) {
        if (v.heading || !s) { s = { heading: v.heading || bookName(b), start: [c, v.v], end: [c, v.v], words: 0 }; list.push(s); }
        s.end = [c, v.v];
        s.words += countWords(v[C.readRow] || "");
      }
    }
    SECTIONS[b] = list;
  }
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
function sectionOf(b, c, v) {
  return SECTIONS[b].find((s) => cmp(s.start, [c, v]) <= 0 && cmp([c, v], s.end) <= 0);
}

// ---------- navigation ----------
function goTo(b, c, v) {
  state.book = b;
  const chs = chapterNums(b);
  state.ch = chs.includes(+c) ? +c : chs[0];
  const list = chapter();
  const idx = list.findIndex((x) => x.v === +v);
  state.i = idx >= 0 ? idx : 0;
  render();
}

function step(dir) {
  if (state.loop && state.mode === "practice") { render(); return; }
  if (state.hardOnly && state.mode === "practice") {
    const hard = hardVerses();
    if (!hard.length) return;
    const curV = verse().v;
    const nextV = dir > 0 ? hard.find((v) => v > curV) ?? hard[0] : [...hard].reverse().find((v) => v < curV) ?? hard[hard.length - 1];
    goTo(state.book, state.ch, nextV);
    return;
  }
  const list = chapter();
  const ni = state.i + dir;
  if (ni >= 0 && ni < list.length) { state.i = ni; render(); return; }
  // Move across chapter / book boundaries.
  const chs = chapterNums(state.book);
  const ci = chs.indexOf(state.ch) + dir;
  if (ci >= 0 && ci < chs.length) {
    state.ch = chs[ci];
    state.i = dir > 0 ? 0 : chapter().length - 1;
    render();
    return;
  }
  const bi = DB.order.indexOf(state.book) + dir;
  if (bi < 0 || bi >= DB.order.length) return;
  state.book = DB.order[bi];
  const bchs = chapterNums(state.book);
  state.ch = dir > 0 ? bchs[0] : bchs[bchs.length - 1];
  state.i = dir > 0 ? 0 : chapter().length - 1;
  render();
}

// ---------- stage ----------
function labelHTML(r) {
  return `<span class="nm">${esc(C.names[r])}</span><span class="dot"> · </span><span class="ms">${esc(C.manuscripts[r])}</span>`;
}
function rowHTML(r, v, cls) {
  const t = v[r];
  return `<section class="row ${cls}"><div class="label">${labelHTML(r)}</div>` +
    (t ? `<p class="text">${esc(t)}</p>` : `<p class="text absent">Not in this translation</p>`) + `</section>`;
}
function stageParts(v) {
  const main = C.readRow;
  const comps = C.rows.filter((r) => r !== main);
  const same = comps.filter((r) => v.flags.includes("same-as-main:" + r));
  const shown = comps.filter((r) => !same.includes(r));
  const sameHTML = same.length
    ? `<section class="row same"><div class="label">Same in ${esc(joinNames(same.map((r) => C.names[r])))}</div></section>` : "";
  const tags = C.rows.filter((r) => v.flags.includes("bracketed:" + r)).map((r) => `Bracketed in ${C.names[r]}`);
  const tagHTML = tags.length ? `<div class="tags">${esc(tags.join(" · "))}</div>` : "";
  return {
    main: rowHTML(main, v, "main"),
    comps: sameHTML + shown.map((r) => rowHTML(r, v, "comp")).join(""),
    tags: tagHTML,
  };
}

// Size steps, largest first. Each is [main, comparison, label] in stage CSS px.
const SECTION_STEPS = (() => {
  const out = [];
  for (let m = 46; m >= 24; m--) { const c = Math.max(18, Math.round(m * 0.66)); out.push([m, c, Math.min(18, c)]); }
  for (let m = 23; m >= 10; m--) { const c = Math.max(8, Math.round(m * 0.75)); out.push([m, c, Math.max(12, Math.min(18, c))]); }
  return out;
})();
const FULL_MAIN_STEPS = [];
for (let m = 40; m >= 10; m--) FULL_MAIN_STEPS.push([m, 0, Math.max(12, Math.min(16, Math.round(m * 0.45)))]);
const FULL_COMP_STEPS = [];
for (let c = 24; c >= 8; c--) FULL_COMP_STEPS.push([0, c, Math.max(12, Math.min(16, Math.round(c * 0.75)))]);

// Largest step that fits (binary search; fit is monotonic in size). Returns { step, fits }.
function fit(steps, apply, fits) {
  apply(steps[0]);
  if (fits()) return { step: steps[0], idx: 0, fits: true };
  let lo = 1, hi = steps.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    apply(steps[mid]);
    if (fits()) { best = mid; hi = mid - 1; } else lo = mid + 1;
  }
  const idx = best >= 0 ? best : steps.length - 1;
  apply(steps[idx]);
  return { step: steps[idx], idx, fits: best >= 0 };
}
const setSizes = (el, [m, c, l]) => {
  if (m) el.style.setProperty("--m", m + "px");
  if (c) el.style.setProperty("--c", c + "px");
  el.style.setProperty("--l", l + "px");
};

// Renders verse v into the stage element `el` in format `fmt`. Returns fit info.
function paintStage(el, fmt, b, c, v) {
  el.dataset.format = fmt;
  const p = stageParts(v);
  if (fmt === "section") {
    el.innerHTML =
      `<div class="area"><div class="content">` +
      `<header class="head"><div class="book">${esc(bookName(b))}</div><div class="num">${c}:${v.v}</div></header>` +
      p.main + p.comps + p.tags +
      `</div></div><div class="debug"></div>`;
    const area = el.querySelector(".area"), content = el.querySelector(".content");
    const r = fit(SECTION_STEPS, (s) => setSizes(content, s), () => content.offsetHeight <= area.clientHeight);
    area.classList.toggle("center", r.idx === 0 && content.offsetHeight < area.clientHeight * 0.6);
    return { main: r.step[0], comp: r.step[1], label: r.step[2], fits: r.fits };
  }
  const last = DB.books[b].chapters[c].at(-1).v;
  el.innerHTML =
    `<div class="area"><div class="cols">` +
    `<div class="col left"><div class="content">` +
    `<header class="head-line"><span class="ref"><span class="book">${esc(bookName(b))}</span> ${c}:${v.v}</span><span class="count">Verse ${v.v} of ${last}</span></header>` +
    p.main + p.tags + `</div></div>` +
    `<div class="col right"><div class="content">${p.comps}</div></div>` +
    `</div></div><div class="debug"></div>`;
  const [left, right] = el.querySelectorAll(".col");
  const lc = left.querySelector(".content"), rc = right.querySelector(".content");
  const a = fit(FULL_MAIN_STEPS, (s) => setSizes(lc, s), () => lc.offsetHeight <= left.clientHeight);
  const z = fit(FULL_COMP_STEPS, (s) => setSizes(rc, s), () => rc.offsetHeight <= right.clientHeight);
  return { main: a.step[0], comp: z.step[1], label: z.step[2], fits: a.fits && z.fits };
}

function render() {
  if (!DB) return;
  const v = verse();
  document.body.classList.toggle("record", state.mode === "record");
  if (state.mode === "record") state.debug = false;
  stage.classList.toggle("show-debug", state.debug);
  $("#debug").checked = state.debug;

  const info = paintStage(stage, state.format, state.book, state.ch, v);
  $("#fit-info").innerHTML = `Sizes: main ${info.main || "–"} · comparison ${info.comp} · labels ${info.label}px` +
    (info.fits ? "" : ` <b class="warn">— does not fit; report this verse</b>`);
  $("#fit-info").className = "hint" + (info.fits ? "" : " warn");

  renderPanel(v);
  store.set("pos", { book: state.book, ch: state.ch, v: v.v, format: state.format, mode: state.mode });
}

// ---------- panel ----------
function renderPanel(v) {
  document.querySelectorAll("#format-seg button").forEach((b) => b.classList.toggle("on", b.dataset.format === state.format));
  document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));
  $("#book-pick").value = state.book;
  const cp = $("#chapter-pick");
  if (cp.dataset.book !== state.book) {
    cp.innerHTML = "";
    for (const c of chapterNums(state.book)) cp.add(new Option(`Chapter ${c}`, c));
    cp.dataset.book = state.book;
  }
  cp.value = state.ch;

  const list = chapter();
  $("#now-ref").textContent = `${refStr(state.book, state.ch, v.v)}  (verse ${state.i + 1} of ${list.length})`;

  // Section info
  const s = sectionOf(state.book, state.ch, v.v);
  const si = SECTIONS[state.book].indexOf(s);
  const next = SECTIONS[state.book][si + 1];
  const secs = secSeconds(s);
  const over = secs > C.shortMaxSeconds;
  let html = `<div class="h">${esc(s.heading)}</div><div>${esc(bookName(state.book))} ${rangeStr(s)} · about ${fmtTime(secs)}` +
    (over ? ` <span class="warn">— over ${fmtTime(C.shortMaxSeconds)}: publishes as a regular vertical video, not a Short</span>` : ` · Short`) + `</div>`;
  if (s.start[0] !== s.end[0]) html += `<div class="warn">Crosses a chapter break: record the Full video in two parts, split at the chapter break.</div>`;
  html += `<div>Next section: ${next ? `${esc(next.heading)} at ${next.start[0]}:${next.start[1]}` : "end of book"}</div>`;
  if (!v[C.readRow]) html += `<div class="warn">Nothing to read: this verse is not in the ${esc(C.names[C.readRow])}.</div>`;
  $("#section-info").innerHTML = html;

  // Next verse preview (read translation)
  const nv = list[state.i + 1];
  $("#next-preview").innerHTML = nv
    ? `<b>Next ${nv.v}:</b> ${esc(nv[C.readRow] || "(not in " + C.names[C.readRow] + ")")}`
    : `<b>End of chapter.</b>`;

  // Chapter estimate
  const words = list.reduce((n, x) => n + countWords(x[C.readRow] || ""), 0);
  $("#chapter-est").textContent = `chapter about ${fmtTime((words / C.wordsPerMinute) * 60)} at ${C.wordsPerMinute} words/min`;

  // Notes
  const notes = $("#notes");
  if (document.activeElement !== notes) notes.value = store.get(noteKey(), "");

  // Practice
  const hard = hardVerses();
  $("#btn-hard").classList.toggle("on", hard.includes(v.v));
  $("#btn-hard").textContent = hard.includes(v.v) ? "Hard ✓ (H)" : "Mark hard (H)";
  $("#btn-loop").classList.toggle("on", state.loop);
  $("#btn-loop").textContent = state.loop ? "Looping (L)" : "Loop verse (L)";
  $("#hard-only").checked = state.hardOnly;
  $("#hard-list").innerHTML = hard.length
    ? `Hard verses: ` + hard.map((n) => `<a data-v="${n}">${state.ch}:${n}</a>`).join("")
    : `<span class="hint">No hard verses marked in this chapter.</span>`;
  const hint = $("#practice-hint");
  hint.hidden = !hard.length;
  hint.textContent = `Practice first: ${hard.length} hard verse${hard.length > 1 ? "s" : ""} in this chapter.`;
  $("#attempts").textContent = store.get(attemptKey(s), 0);
}

const noteKey = () => `note.${state.book}.${state.ch}.${verse().v}`;
const hardKey = () => `hard.${state.book}.${state.ch}`;
const attemptKey = (s) => `attempts.${state.book}.${s.start[0]}.${s.start[1]}`;
const hardVerses = () => store.get(hardKey(), []);
function toggleHard() {
  const v = verse().v;
  const hard = hardVerses();
  const i = hard.indexOf(v);
  if (i >= 0) hard.splice(i, 1); else hard.push(v);
  store.set(hardKey(), hard.sort((a, b) => a - b));
  render();
}

// ---------- timer ----------
function toggleTimer() {
  if (timer.running) {
    timer.acc += Date.now() - timer.start;
    timer.running = false;
    clearInterval(timer.id);
  } else {
    timer.start = Date.now();
    timer.running = true;
    timer.id = setInterval(showTimer, 250);
  }
  showTimer();
}
function showTimer() {
  const ms = timer.acc + (timer.running ? Date.now() - timer.start : 0);
  $("#timer").textContent = fmtTime(ms / 1000);
  $("#btn-timer").textContent = timer.running ? "Stop (S)" : "Start (S)";
  $("#btn-timer").classList.toggle("on", timer.running);
}
function reset() {
  timer.running = false; timer.acc = 0; clearInterval(timer.id);
  showTimer();
  state.i = 0;
  render();
}

// ---------- search ----------
const ALIASES = new Map();
function buildAliases() {
  const extra = {
    MAT: ["mt", "matt", "mat"], MRK: ["mk", "mrk", "mar", "mr"], LUK: ["lk", "luk", "lu"], JHN: ["jn", "jhn", "joh", "jo"],
    ACT: ["ac", "act"], ROM: ["ro", "rom", "rm"], "1CO": ["1co", "1cor"], "2CO": ["2co", "2cor"], GAL: ["ga", "gal"],
    EPH: ["eph", "ephes"], PHP: ["php", "phil", "phl", "pp"], COL: ["col"], "1TH": ["1th", "1thes", "1thess"],
    "2TH": ["2th", "2thes", "2thess"], "1TI": ["1ti", "1tim", "1tm"], "2TI": ["2ti", "2tim", "2tm"], TIT: ["tit", "ti"],
    PHM: ["phm", "philem", "phlm", "pm"], HEB: ["heb", "he"], JAS: ["jas", "jam", "jm", "james"],
    "1PE": ["1pe", "1pet", "1pt", "1p"], "2PE": ["2pe", "2pet", "2pt", "2p"], "1JN": ["1jn", "1jo", "1jhn", "1joh"],
    "2JN": ["2jn", "2jo", "2jhn", "2joh"], "3JN": ["3jn", "3jo", "3jhn", "3joh"], JUD: ["jud", "jude", "jd"],
    REV: ["rev", "re", "rv", "revelations", "apocalypse"],
  };
  for (const b of DB.order) {
    ALIASES.set(bookName(b).toLowerCase().replace(/\s+/g, ""), b);
    ALIASES.set(b.toLowerCase(), b);
    for (const a of extra[b] || []) ALIASES.set(a, b);
  }
}
function findBook(s) {
  s = s.toLowerCase().replace(/[\s.]+/g, "").replace(/^(i{1,3})(?=[a-z])/, (m) => String(m.length)).replace(/^(first|second|third)/, (m) => ({ first: 1, second: 2, third: 3 }[m]));
  if (ALIASES.has(s)) return ALIASES.get(s);
  if (s.length < 2) return null;
  for (const b of DB.order) if (bookName(b).toLowerCase().replace(/\s+/g, "").startsWith(s)) return b;
  return null;
}
// "2co 6:12", "2 cor 6", "jn 3", "mark 1:14", "rev 22", "jude 5"
function parseRef(q) {
  const m = q.trim().match(/^((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z]+\.?)\s*(\d+)?\s*(?:[:.]\s*(\d+))?$/i);
  if (!m) return null;
  const b = findBook(m[1]);
  if (!b) return null;
  const chs = chapterNums(b);
  let c = m[2] ? +m[2] : 1, v = m[3] ? +m[3] : 1;
  if (chs.length === 1 && m[2] && !m[3]) { v = c; c = 1; } // single-chapter books: "jude 5"
  if (!chs.includes(c)) return null;
  return { b, c, v };
}

let results = [], sel = 0;
function runSearch() {
  const q = $("#search").value.trim();
  const box = $("#results");
  results = [];
  sel = 0;
  if (!q) { box.hidden = true; return; }
  const ref = parseRef(q);
  if (ref) {
    const vv = DB.books[ref.b].chapters[ref.c].find((x) => x.v === ref.v);
    results.push({ ...ref, html: `<b>Go to ${esc(refStr(ref.b, ref.c, ref.v))}</b> ${vv ? esc((vv[C.readRow] || "").slice(0, 90)) : ""}` });
  }
  if (q.length >= 2) {
    const rows = $("#search-all").checked ? C.rows : [C.readRow];
    const re = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
    const reAll = new RegExp(re.source, "gi");
    let total = 0;
    outer: for (const b of DB.order) for (const c of chapterNums(b)) for (const v of DB.books[b].chapters[c]) {
      for (const r of rows) {
        if (!v[r] || !re.test(v[r])) continue;
        total++;
        if (results.length < 200) {
          const hl = esc(v[r]).replace(new RegExp(reAll.source.replace(/\\s\+/g, "(?:\\s|&nbsp;)+"), "gi"), (m) => `<mark>${m}</mark>`);
          results.push({ b, c, v: v.v, html: `<b>${esc(refStr(b, c, v.v))}</b>${rows.length > 1 ? ` <small>${esc(C.names[r])}</small>` : ""} ${hl}` });
        }
        if (total > 2000) break outer;
        break;
      }
    }
    box.dataset.meta = total ? `${total > 2000 ? "2000+" : total} verse${total === 1 ? "" : "s"} match${total > 200 ? " (first 200 shown)" : ""}` : ref ? "" : "No matches";
  } else box.dataset.meta = "";
  drawResults();
}
function drawResults() {
  const box = $("#results");
  box.hidden = false;
  box.innerHTML = (box.dataset.meta ? `<div class="meta">${esc(box.dataset.meta)}</div>` : "") +
    results.map((r, i) => `<div class="r${i === sel ? " sel" : ""}" data-i="${i}">${r.html}</div>`).join("");
  box.querySelector(".r.sel")?.scrollIntoView({ block: "nearest" });
}
function pickResult(i) {
  const r = results[i];
  if (!r) return;
  goTo(r.b, r.c, r.v);
  leaveSearch();
}
function leaveSearch() {
  $("#results").hidden = true;
  $("#search").blur();
}

// ---------- exports ----------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? "");
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const fullRef = (b, s) => `${bookName(b)} ${rangeStr(s)}`;
const chapterTitle = (b, c) => fill(C.titles.chapter, { book: bookName(b), chapter: c });
// Every section belongs to the chapter it starts in.
const sectionsStartingIn = (b, c) => SECTIONS[b].filter((s) => s.start[0] === +c);
const sectionsTouching = (b, c) => SECTIONS[b].filter((s) => s.start[0] <= c && s.end[0] >= c);

function exportCsv() {
  const b = state.book, c = state.ch;
  const rows = [["Heading", "Verse range", "Estimated length", "Publishes as", "Title", "Description", "Chapter video"]];
  for (const s of sectionsStartingIn(b, c)) {
    const secs = secSeconds(s);
    const isShort = secs <= C.shortMaxSeconds;
    const ref = fullRef(b, s);
    const desc = [
      `${s.heading} — ${ref}`,
      `Read from the ${C.names[C.readRow]}, shown with the ${joinNames(C.rows.filter((r) => r !== C.readRow).map((r) => C.names[r]))} for comparison.`,
      isShort ? `Full chapter: ${bookName(b)} ${c} (linked as the Related video).` : `Full chapter: ${bookName(b)} ${c} — [add link to the chapter video].`,
      "",
      ...C.attribution,
    ].join("\n");
    rows.push([s.heading, ref, fmtTime(secs), isShort ? "Short" : "Vertical video (over 3:00)", fill(C.titles.section, { heading: s.heading, ref, book: bookName(b), chapter: c }), desc, chapterTitle(b, c)]);
  }
  download(`sections-${b}-${c}.csv`, "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", "text/csv;charset=utf-8");
}
function exportTxt() {
  const b = state.book, c = state.ch;
  const list = sectionsTouching(b, c);
  const lines = [
    chapterTitle(b, c),
    "",
    "Add start times after assembling the chapter video. YouTube chapters need: first timestamp 00:00, at least 3 timestamps in ascending order, each chapter at least 10 seconds long.",
    "",
  ];
  list.forEach((s, i) => {
    const from = s.start[0] < c ? [c, DB.books[b].chapters[c][0].v] : s.start;
    const to = s.end[0] > c ? [c, DB.books[b].chapters[c].at(-1).v] : s.end;
    lines.push(`${i === 0 ? "00:00" : "??:??"} ${s.heading} (${from[0]}:${from[1]}–${to[1]})`);
  });
  lines.push("", `Read from the ${C.names[C.readRow]}, shown with the ${joinNames(C.rows.filter((r) => r !== C.readRow).map((r) => C.names[r]))} for comparison.`, "", ...C.attribution);
  lines.push("", "Section videos from this chapter:");
  for (const s of sectionsStartingIn(b, c)) lines.push(`  ${s.heading} (${fullRef(b, s)}) — ${secSeconds(s) <= C.shortMaxSeconds ? "Short: set Related video to this chapter" : "Vertical video: link this chapter in its description"}`);
  download(`sections-${b}-${c}.txt`, lines.join("\n") + "\n", "text/plain;charset=utf-8");
}

// ---------- layout audit (exact sizes, current format) ----------
async function audit() {
  const out = $("#audit-out");
  const btn = $("#btn-audit");
  btn.disabled = true;
  const probe = document.createElement("div");
  probe.className = stage.className.replace("show-debug", "");
  probe.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden";
  document.body.appendChild(probe);
  const small = [], broken = [];
  let n = 0;
  const all = [];
  for (const b of DB.order) for (const c of chapterNums(b)) for (const v of DB.books[b].chapters[c]) all.push([b, c, v]);
  try {
    for (const [b, c, v] of all) {
      const r = paintStage(probe, state.format, b, c, v);
      if (!r.fits) broken.push([b, c, v.v]);
      if (state.format === "section" ? r.comp < C.smallTextPx : r.main < 18 || r.comp < 13) small.push([b, c, v.v, r]);
      if (++n % 200 === 0) { out.textContent = `Checking… ${n} of ${all.length}`; await new Promise((res) => setTimeout(res)); }
    }
  } finally {
    probe.remove();
    btn.disabled = false;
  }
  small.sort((x, y) => x[3].comp - y[3].comp || x[3].main - y[3].main);
  const floor = state.format === "section" ? `comparison text below ${C.smallTextPx}px` : "main below 18px or comparison below 13px";
  const lines = small.map(([b, c, v, r]) => `${refStr(b, c, v)}\tmain ${r.main}\tcomparison ${r.comp}\tlabels ${r.label}`);
  out.innerHTML = `<p><b>${all.length}</b> verses checked (${state.format === "full" ? "Full video" : "Section"}). ` +
    `<b>${broken.length}</b> do not fit. <b>${small.length}</b> have ${floor}. ` +
    `<a id="audit-dl">Download list</a></p>` +
    small.slice(0, 60).map(([b, c, v, r]) => `<div><a data-go="${b}|${c}|${v}">${esc(refStr(b, c, v))}</a> main ${r.main} · comparison ${r.comp}</div>`).join("") +
    (small.length > 60 ? `<div>… ${small.length - 60} more in the download</div>` : "");
  $("#audit-dl").onclick = () => download(`layout-audit-${state.format}.txt`, `Layout audit — ${state.format}\n${floor}\n\n` + lines.join("\n") + "\n", "text/plain");
}

// ---------- wiring ----------
function wireControls() {
  document.querySelectorAll("#format-seg button").forEach((b) => b.onclick = () => { state.format = b.dataset.format; render(); });
  document.querySelectorAll("#mode-seg button").forEach((b) => b.onclick = () => { state.mode = b.dataset.mode; if (state.mode === "record") { state.loop = false; state.hardOnly = false; } render(); });
  $("#book-pick").onchange = (e) => { goTo(e.target.value, chapterNums(e.target.value)[0], 1); e.target.blur(); };
  $("#chapter-pick").onchange = (e) => { goTo(state.book, +e.target.value, 1); e.target.blur(); };
  $("#btn-next").onclick = () => step(1);
  $("#btn-prev").onclick = () => step(-1);
  $("#btn-timer").onclick = toggleTimer;
  $("#btn-reset").onclick = reset;
  $("#btn-hard").onclick = toggleHard;
  $("#btn-loop").onclick = () => { state.loop = !state.loop; render(); };
  $("#hard-only").onchange = (e) => { state.hardOnly = e.target.checked; render(); };
  $("#hard-list").onclick = (e) => { const v = e.target.dataset.v; if (v) goTo(state.book, state.ch, +v); };
  $("#btn-attempt").onclick = () => { const s = sectionOf(state.book, state.ch, verse().v); store.set(attemptKey(s), store.get(attemptKey(s), 0) + 1); render(); };
  $("#btn-attempt-reset").onclick = () => { const s = sectionOf(state.book, state.ch, verse().v); store.set(attemptKey(s), 0); render(); };
  $("#debug").onchange = (e) => { state.debug = e.target.checked; render(); };
  $("#notes").oninput = (e) => store.set(noteKey(), e.target.value);
  $("#btn-csv").onclick = exportCsv;
  $("#btn-txt").onclick = exportTxt;
  $("#btn-audit").onclick = audit;
  $("#audit-out").onclick = (e) => { const g = e.target.dataset.go; if (g) { const [b, c, v] = g.split("|"); goTo(b, +c, +v); } };

  const search = $("#search");
  search.oninput = runSearch;
  search.onfocus = () => { if (search.value.trim()) runSearch(); };
  $("#search-all").onchange = () => { runSearch(); search.focus(); };
  $("#results").onmousedown = (e) => { const r = e.target.closest(".r"); if (r) { e.preventDefault(); pickResult(+r.dataset.i); } };
  search.onblur = () => setTimeout(() => { if (document.activeElement !== search) $("#results").hidden = true; }, 150);

  // Keys work regardless of focus (except while typing in search or notes).
  window.addEventListener("keydown", (e) => {
    if (!DB) return;
    const t = e.target;
    if (t === search) {
      if (e.key === "Escape") { e.preventDefault(); search.value = ""; leaveSearch(); }
      else if (e.key === "ArrowDown" && results.length) { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); drawResults(); }
      else if (e.key === "ArrowUp" && results.length) { e.preventDefault(); sel = Math.max(sel - 1, 0); drawResults(); }
      else if (e.key === "Enter") { e.preventDefault(); pickResult(sel); }
      return;
    }
    if (t.tagName === "TEXTAREA") { if (e.key === "Escape") t.blur(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const act = {
      " ": () => step(1), ArrowRight: () => step(1), PageDown: () => step(1),
      ArrowLeft: () => step(-1), PageUp: () => step(-1),
      s: toggleTimer, S: toggleTimer,
      r: reset, R: reset,
      "/": () => { search.focus(); search.select(); },
    };
    if (state.mode === "practice") Object.assign(act, {
      h: toggleHard, H: toggleHard,
      l: () => { state.loop = !state.loop; render(); }, L: () => { state.loop = !state.loop; render(); },
    });
    if (act[k]) {
      e.preventDefault();
      if (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "INPUT") t.blur();
      act[k]();
    }
  }, true);
}
