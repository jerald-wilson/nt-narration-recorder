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
  format: "section",
  debug: false,
  slide: null,          // "intro" | "outro" | null (a verse)
};
const slideOn = (kind) => (C.slides[state.format] || []).includes(kind);

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
    btn.textContent = `Resume last position: ${refStr(last.book, last.ch, last.v)} · ${last.format === "full" ? "Full video" : "Section"}`;
    btn.onclick = () => {
      state.format = last.format || "section";
      goTo(last.book, last.ch, last.v);
      btn.hidden = true;
    };
  }
  wireControls();
  // Links: ?ref=acts+17:11&format=full   Add &stage=only to show just the stage (for screenshots).
  const q = new URLSearchParams(location.search);
  if (q.get("format") === "full" || q.get("format") === "section") state.format = q.get("format");
  if (q.get("stage") === "only") document.body.classList.add("stage-only");
  const start = q.get("ref") && parseRef(q.get("ref"));
  if (start) goTo(start.b, start.c, start.v); else goTo("MAT", 1, 1);
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
  state.slide = null;
  render();
}

function step(dir) {
  // Slides sit before a chapter's first verse and after its last: intro, verses, outro, next intro.
  if ((state.slide === "intro" && dir > 0) || (state.slide === "outro" && dir < 0)) { state.slide = null; render(); return; }
  if (!state.slide && dir > 0 && state.i === chapter().length - 1 && slideOn("outro")) { state.slide = "outro"; render(); return; }
  if (!state.slide && dir < 0 && state.i === 0 && slideOn("intro")) { state.slide = "intro"; render(); return; }
  const list = chapter();
  const ni = state.i + dir;
  if (ni >= 0 && ni < list.length) { state.i = ni; render(); return; }
  // Move across chapter / book boundaries.
  const chs = chapterNums(state.book);
  const ci = chs.indexOf(state.ch) + dir;
  if (ci >= 0 && ci < chs.length) {
    state.ch = chs[ci];
    state.i = dir > 0 ? 0 : chapter().length - 1;
    state.slide = slideOn(dir > 0 ? "intro" : "outro") ? (dir > 0 ? "intro" : "outro") : null;
    render();
    return;
  }
  const bi = DB.order.indexOf(state.book) + dir;
  if (bi < 0 || bi >= DB.order.length) return; // start or end of the New Testament
  state.book = DB.order[bi];
  const bchs = chapterNums(state.book);
  state.ch = dir > 0 ? bchs[0] : bchs[bchs.length - 1];
  state.i = dir > 0 ? 0 : chapter().length - 1;
  state.slide = slideOn(dir > 0 ? "intro" : "outro") ? (dir > 0 ? "intro" : "outro") : null;
  render();
}

// ---------- stage ----------
function labelHTML(r) {
  return `<span class="nm">${esc(C.names[r])}</span><span class="dot"> · </span><span class="ms">${esc(C.manuscripts[r])}</span>`;
}
function rowHTML(r, v, cls) {
  const t = v[r];
  return `<section class="row ${cls}"><div class="label">${labelHTML(r)}</div>` +
    (t ? `<p class="text">${redLetterHTML(t, C.redLetter.includes(r) && v.red?.[r])}</p>` : `<p class="text absent">Not in this translation</p>`) + `</section>`;
}
// Words of Jesus (character ranges from the data) wrapped in red.
function redLetterHTML(t, spans) {
  if (!spans) return esc(t);
  let out = "", at = 0;
  for (const [a, b] of spans) out += esc(t.slice(at, a)) + `<span class="jw">${esc(t.slice(a, b))}</span>`, at = b;
  return out + esc(t.slice(at));
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

// Next chapter (or book) after b c, or null at the end of the New Testament.
function nextChapter(b, c) {
  const chs = chapterNums(b), ci = chs.indexOf(c);
  if (ci + 1 < chs.length) return [b, chs[ci + 1]];
  const nb = DB.order[DB.order.indexOf(b) + 1];
  return nb ? [nb, chapterNums(nb)[0]] : null;
}
function translationsHTML() {
  const comps = C.rows.filter((r) => r !== C.readRow);
  return `<div class="slide-rows"><div>Read from the <b>${esc(C.names[C.readRow])}</b> · ${esc(C.manuscripts[C.readRow])}</div>` +
    `<div class="k">Compared with</div>` + comps.map((r) => `<div>${esc(C.names[r])} · ${esc(C.manuscripts[r])}</div>`).join("") + `</div>`;
}
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
const ordinal = (n) => n <= 20 ? ORDINALS[n - 1] : "twenty-" + ORDINALS[n - 21];
// Closing line in the manner of an old Bible: "Here ends the fourth chapter of the Gospel according to Matthew."
function colophon(b, c) {
  const t = C.bookTitles[b] || bookName(b);
  const chs = chapterNums(b);
  return chs.length === 1 || c === chs.at(-1) ? `Here ends ${t}.` : `Here ends the ${ordinal(c)} chapter of ${t}.`;
}
// Where chapter c of b falls among all New Testament chapters: [number, total].
function chapterPlace(b, c) {
  let n = 0, total = 0;
  for (const x of DB.order) for (const y of chapterNums(x)) { total++; if (x === b && y === c) n = total; }
  return [n, total];
}
// One segment per book, as wide as its chapter count, filled up to chapter c of b.
function journeyHTML(b, c) {
  const bi = DB.order.indexOf(b);
  return `<div class="journey">` + DB.order.map((x, i) => {
    const n = chapterNums(x).length;
    const fill = i < bi ? 100 : i > bi ? 0 : (chapterNums(x).indexOf(c) + 1) / n * 100;
    return `<i style="flex:${n};--p:${fill}%"></i>`;
  }).join("") + `</div>`;
}
// Full-video outro, laid out around YouTube's end screen: the recommended video sits bottom left
// (under "Up next") and the subscribe button bottom right (under the progress), so both stay clear.
function outroFullHTML(b, c) {
  const n = nextChapter(b, c);
  const [num, total] = chapterPlace(b, c);
  const next = n
    ? `<div class="eyebrow">Up next</div><div class="next-title"><span class="book">${esc(bookName(n[0]))}</span> ${n[1]}</div>` +
      `<div class="next-sub">${esc(sectionsTouching(n[0], n[1])[0].heading)}</div>`
    : `<div class="eyebrow">The New Testament</div><div class="next-title">Complete</div>`;
  return `<div class="colophon">${esc(colophon(b, c))}</div><div class="orn"><i></i></div>` +
    `<div class="outro-cols"><div class="outro-next">${next}</div>` +
    `<div class="outro-journey"><div class="count">${num} of ${total} chapters</div>${journeyHTML(b, c)}` +
    `<div class="follow">Subscribe to hear the whole New Testament</div></div></div>`;
}
function outroSectionHTML(b, s) {
  const n = SECTIONS[b][SECTIONS[b].indexOf(s) + 1];
  return `<div class="colophon">${esc(fullRef(b, s))}</div><div class="orn"><i></i></div>` +
    (n ? `<div class="eyebrow">Up next</div><div class="next-title">${esc(n.heading)}</div><div class="next-sub">${esc(bookName(b))} ${rangeStr(n)}</div>` : "");
}
// What to say while the outro is up, so the end screen isn't silent.
function outroLine(b, c) {
  const n = nextChapter(b, c);
  return n ? `That's ${bookName(b)} ${c}. Up next is ${bookName(n[0])} ${n[1]}, ${sectionsTouching(n[0], n[1])[0].heading.replace(/^The /, "the ")}.`
    : `That's ${bookName(b)} ${c}, and the end of the New Testament.`;
}

// Intro and outro slides.
function paintSlide(el, fmt, kind, b, c, v) {
  el.dataset.format = fmt;
  const s = sectionOf(b, c, v.v);
  let html;
  if (kind === "intro") {
    html = fmt === "full"
      ? `<div class="eyebrow">Full chapter reading</div><h1 class="slide-title"><span class="book">${esc(bookName(b))}</span> ${c}</h1>`
      : `<div class="eyebrow">${esc(bookName(b))} ${rangeStr(s)}</div><h1 class="slide-title">${esc(s.heading)}</h1>`;
    html += translationsHTML();
  } else {
    html = fmt === "full" ? outroFullHTML(b, c) : outroSectionHTML(b, s);
  }
  el.innerHTML = `<div class="area slide ${kind}">${html}</div><div class="debug"></div>`;
}

function render() {
  if (!DB) return;
  const v = verse();
  if (rec.recorder) state.debug = false; // never record the margin overlay
  stage.classList.toggle("show-debug", state.debug);
  $("#debug").checked = state.debug;

  if (state.slide && !slideOn(state.slide)) state.slide = null;
  const info = state.slide
    ? (paintSlide(stage, state.format, state.slide, state.book, state.ch, v), { main: "–", comp: "–", label: "–", fits: true })
    : paintStage(stage, state.format, state.book, state.ch, v);
  $("#fit-info").innerHTML = `Sizes: main ${info.main || "–"} · comparison ${info.comp} · labels ${info.label}px` +
    (info.fits ? "" : ` <b class="warn">— does not fit; report this verse</b>`);
  $("#fit-info").className = "hint" + (info.fits ? "" : " warn");

  renderPanel(v);
  checkCapture();
  markVerse();
  store.set("pos", { book: state.book, ch: state.ch, v: v.v, format: state.format });
}

// ---------- capture check: browser zoom, stage cut off, recorded size ----------
const TARGET = { section: [1080, 1920], full: [1920, 1080] };
function checkCapture() {
  const el = $("#capture");
  const problems = [];
  // Browser zoom scales devicePixelRatio. Macs are 1x or 2x (Retina), so anything else means zoom.
  const dpr = window.devicePixelRatio || 1;
  if (dpr !== 1 && dpr !== 2) problems.push(`Browser zoom is about ${Math.round((dpr / 2) * 100)}%. Press <b>Cmd+0</b> to reset it to 100% before recording.`);
  const r = stage.getBoundingClientRect();
  const cutBottom = Math.ceil(r.bottom - window.innerHeight), cutRight = Math.ceil(r.right - window.innerWidth);
  if (cutBottom > 0 || cutRight > 0) {
    const where = [cutBottom > 0 && `bottom by ${cutBottom}px`, cutRight > 0 && `right by ${cutRight}px`].filter(Boolean).join(" and ");
    problems.push(`The stage is cut off at the ${where}. Make the window bigger or go full screen (<b>Ctrl+Cmd+F</b>).`);
  }
  const w = Math.round(stage.offsetWidth * dpr), h = Math.round(stage.offsetHeight * dpr);
  const [tw, th] = TARGET[state.format];
  const sizeOk = w === tw && h === th;
  if (!sizeOk && !problems.length) problems.push(`The stage will record at ${w} × ${h}, not ${tw} × ${th}. Either the browser zoom is 50% (press <b>Cmd+0</b>) or this window is on a display that isn't Retina; move it to the iMac's built-in screen.`);
  el.className = "capture" + (problems.length ? " bad" : "");
  el.innerHTML = problems.length
    ? problems.map((p) => `<p>${p}</p>`).join("") + (sizeOk ? "" : `<p>Records at ${w} × ${h} right now (should be ${tw} × ${th}).</p>`)
    : `Ready to record: stage records at ${w} × ${h}.`;
}
window.addEventListener("resize", () => { if (DB) checkCapture(); });

// ---------- built-in recorder (Chrome): the stage only, plus the microphone ----------
// Enter connects once per session (Chrome asks to share this tab, and for the mic), then starts
// and stops takes. Chrome's Region Capture crops the tab to #stage, so no selection box.
// Each take downloads when it stops.
const rec = { video: null, mic: null, recorder: null, chunks: [], started: 0, tick: 0, takes: 0, ctx: null, meter: 0, outroAt: 0, discardArmed: 0 };
const REC_TYPES = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

function recStatus(html, warn) {
  const el = $("#rec-status");
  el.innerHTML = html;
  el.className = "rec-status" + (warn ? " warn" : "");
}
function recIdle() {
  const on = !!rec.video;
  $("#btn-rec").textContent = on ? "Start take (Enter)" : "Connect recorder (Enter)";
  // The mic hears the iMac's speakers, so alert sounds end up in the take unless macOS is silenced.
  recStatus(on ? `Connected. Press <b>Enter</b> to start a take.<br><small>Turn on Do Not Disturb (Control Center, top right) so alerts don't sound while you read.</small>` : `Press <b>Enter</b> to connect the recorder.`);
}

async function micStream() {
  const id = store.get("mic", "");
  // Raw voice: the browser's call-style processing makes narration sound thin and pumping.
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
  if (id) audio.deviceId = { exact: id };
  try { return await navigator.mediaDevices.getUserMedia({ audio }); }
  catch (e) { if (!id) throw e; store.set("mic", ""); delete audio.deviceId; return navigator.mediaDevices.getUserMedia({ audio }); }
}

async function listMics() {
  const pick = $("#mic-pick");
  const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId !== "default");
  const cur = rec.mic?.getAudioTracks()[0]?.getSettings().deviceId || store.get("mic", "");
  pick.innerHTML = "";
  for (const m of mics) pick.add(new Option(m.label || "Microphone", m.deviceId));
  if (!mics.length) pick.add(new Option("Default microphone", ""));
  pick.value = cur;
}

function watchMic() {
  cancelAnimationFrame(rec.meter);
  if (!rec.ctx) rec.ctx = new AudioContext();
  const an = rec.ctx.createAnalyser();
  an.fftSize = 1024;
  rec.ctx.createMediaStreamSource(rec.mic).connect(an);
  const buf = new Float32Array(an.fftSize);
  const bar = $("#mic-level");
  const draw = () => {
    an.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const x of buf) peak = Math.max(peak, Math.abs(x));
    const db = 20 * Math.log10(peak || 1e-6); // -60 dB .. 0 dB
    bar.style.width = `${Math.max(0, Math.min(100, (db + 60) / 60 * 100))}%`;
    bar.style.background = db > -3 ? "#b91c1c" : "#3a7a2a";
    rec.meter = requestAnimationFrame(draw);
  };
  draw();
}

async function connectRecorder() {
  if (!navigator.mediaDevices?.getDisplayMedia || !window.CropTarget || !window.MediaRecorder) {
    recStatus("The built-in recorder needs Google Chrome.", true);
    return;
  }
  recStatus("Chrome is asking to share this tab: choose <b>Allow</b> (or Share).");
  let video;
  try {
    video = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser", frameRate: { ideal: 30, max: 30 } },
      audio: false,
      preferCurrentTab: true, selfBrowserSurface: "include", surfaceSwitching: "exclude", monitorTypeSurfaces: "exclude",
    });
  } catch { recStatus("Sharing was cancelled. Press <b>Enter</b> to try again.", true); return; }
  const track = video.getVideoTracks()[0];
  try { await track.cropTo(await CropTarget.fromElement(stage)); }
  catch (e) {
    video.getTracks().forEach((t) => t.stop());
    recStatus(`Couldn't crop to the stage (${esc(e.message)}). Pick <b>this tab</b> when Chrome asks, then press <b>Enter</b> again.`, true);
    return;
  }
  try { rec.mic = await micStream(); }
  catch {
    video.getTracks().forEach((t) => t.stop());
    recStatus("No microphone: allow the microphone for this page (the icon at the right of the address bar), then press <b>Enter</b>.", true);
    return;
  }
  rec.video = video;
  // Clicking "Stop sharing" in Chrome's bar ends everything; save whatever was recording.
  track.onended = () => { if (rec.recorder) stopTake(); disconnectRecorder(); };
  await listMics();
  watchMic();
  recIdle();
}

function disconnectRecorder() {
  rec.video?.getTracks().forEach((t) => t.stop());
  rec.mic?.getTracks().forEach((t) => t.stop());
  cancelAnimationFrame(rec.meter);
  $("#mic-level").style.width = "0";
  rec.video = rec.mic = null;
  recIdle();
}

async function switchMic(id) {
  store.set("mic", id);
  if (!rec.mic || rec.recorder) return;
  rec.mic.getTracks().forEach((t) => t.stop());
  try { rec.mic = await micStream(); watchMic(); await listMics(); }
  catch { rec.mic = null; recStatus("That microphone didn't open. Pick another one.", true); }
}

async function startTake() {
  const track = rec.video.getVideoTracks()[0];
  const [tw, th] = TARGET[state.format];
  // Record at the delivery size. Chrome only scales down, so a smaller stage stays smaller (see the size check).
  await track.applyConstraints({ width: { max: tw }, height: { max: th }, frameRate: { ideal: 30, max: 30 } }).catch(() => {});
  const type = REC_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const r = new MediaRecorder(new MediaStream([track, ...rec.mic.getAudioTracks()]),
    { mimeType: type, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
  const v = verse();
  const started = Date.now();
  const name = `${state.book}-${state.ch}-${v.v}-${state.format}-take${++rec.takes}.${type.startsWith("video/mp4") ? "mp4" : "webm"}`;
  rec.chunks = [];
  r.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
  const format = state.format;
  const marks = rec.marks = [];
  r.onstop = () => {
    if (r.discarded) return;
    const blob = new Blob(rec.chunks, { type: r.mimeType });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    const secs = (Date.now() - started) / 1000;
    const txt = name.replace(/\.\w+$/, ".txt");
    download(txt, takeDescription(format, marks, secs), "text/plain;charset=utf-8");
    $("#rec-takes").innerHTML = `Saved <b>${esc(name)}</b> (${fmtTime(secs)}, ${(blob.size / 1e6).toFixed(0)} MB) and <b>${esc(txt)}</b> to Downloads.<br>` + $("#rec-takes").innerHTML;
  };
  r.start(1000); // a chunk per second, so a crash loses little
  rec.recorder = r;
  rec.started = started;
  markVerse();
  document.body.classList.add("recording");
  $("#mic-pick").disabled = true;
  $("#btn-rec").textContent = "Stop take (Enter)";
  const { width, height } = track.getSettings();
  const size = width && height ? ` · ${width} × ${height}` : "";
  const show = () => {
    const outro = rec.outroAt ? (Date.now() - rec.outroAt) / 1000 : -1;
    // The outro holds for C.outroSeconds, then the take stops itself.
    if (outro >= 0 && C.outroSeconds && outro >= C.outroSeconds) { stopTake(); return; }
    const armed = Date.now() - rec.discardArmed < 3000;
    recStatus(`<span class="dot">●</span> Recording ${fmtTime((Date.now() - rec.started) / 1000)}${size} · <b>Enter</b> stops` +
      (armed ? `<br><b>Press Backspace again to throw this take away.</b>` : "") +
      (outro >= 0 ? `<br>Outro ${Math.floor(outro)}s${C.outroSeconds ? ` · stops by itself at ${C.outroSeconds}s` : " · YouTube end screens need at least 5s"}` : ""));
  };
  show();
  rec.tick = setInterval(show, 500);
}

function stopTake() {
  clearInterval(rec.tick);
  if (rec.recorder.state !== "inactive") rec.recorder.stop();
  rec.recorder = null;
  document.body.classList.remove("recording");
  $("#mic-pick").disabled = false;
  recIdle();
}

// Each verse shown during a take, with seconds from the start of the take.
function markVerse() {
  if (!rec.recorder) return;
  const v = state.slide || verse().v, last = rec.marks.at(-1);
  if (last && last.b === state.book && last.c === state.ch && last.v === v) return;
  rec.marks.push({ t: (Date.now() - rec.started) / 1000, b: state.book, c: state.ch, v });
  rec.outroAt = v === "outro" ? Date.now() : 0;
}

// Title and description for a finished take, with YouTube chapter times from the verse marks.
function takeDescription(format, marks, seconds) {
  const { b, c, v } = marks.find((m) => typeof m.v === "number") || { ...marks[0], v: DB.books[marks[0].b].chapters[marks[0].c][0].v };
  if (format === "section") {
    const s = sectionOf(b, c, v);
    const isShort = seconds <= C.shortMaxSeconds;
    return `Title:\n${sectionTitle(b, s)}\n\nDescription:\n${sectionDescription(b, s, isShort)}\n\n` +
      `(${fmtTime(seconds)} long: ${isShort ? "publishes as a Short. Set its Related video to the chapter video." : `over ${fmtTime(C.shortMaxSeconds)}, so it publishes as a regular vertical video, not a Short.`})\n`;
  }
  // First time each section's opening verse was on screen. A section never shown keeps ??:??.
  const stamps = chapterTimestamps(b, c, (s, from) => marks.find((m) => m.b === b && m.c === from[0] && m.v === from[1])?.t ?? null);
  const notes = [];
  if (stamps.some((x) => x.t == null)) notes.push("Some sections weren't reached in this take: their times are ??:??.");
  if (stamps.length < 3) notes.push("YouTube shows chapter markers only with 3 or more timestamps; this chapter has " + stamps.length + ". The times still work as links in the description.");
  const known = [...stamps.map((x) => x.t).filter((t) => t != null), seconds];
  if (known.some((t, i) => i && t - known[i - 1] < 10)) notes.push("A section is under 10 seconds, so YouTube won't show chapter markers.");
  const outro = marks.findLast((m) => m.v === "outro");
  if (outro) notes.push(`End screen: the outro starts at ${fmtTime(outro.t)} and runs ${Math.floor(seconds - outro.t)} seconds` +
    (seconds - outro.t < 5 ? ", too short: YouTube end screens need at least 5." : "."));
  else if (slideOn("outro")) notes.push("No outro in this take, so the end screen will cover the last verse.");
  return `Title:\n${chapterTitle(b, c)}\n\nDescription:\n${chapterDescription(stamps)}\n` + (notes.length ? `\n(${notes.join(" ")})\n` : "");
}

// Backspace twice (within 3 seconds) throws the take away unsaved and goes back to the intro.
function discardTake() {
  if (!rec.recorder) return;
  if (Date.now() - rec.discardArmed >= 3000) { rec.discardArmed = Date.now(); return; }
  rec.discardArmed = 0;
  rec.recorder.discarded = true;
  stopTake();
  rec.takes--;
  reset();
  recStatus(`Take thrown away. Press <b>Enter</b> to start again.`);
}

let recBusy = false;
async function toggleTake() {
  if (recBusy) return;
  recBusy = true;
  try {
    if (rec.recorder) stopTake();
    else if (!rec.video) await connectRecorder();
    else await startTake();
  } finally { recBusy = false; }
}
window.addEventListener("beforeunload", (e) => { if (rec.recorder) e.preventDefault(); });

// ---------- panel ----------
function renderPanel(v) {
  document.querySelectorAll("#format-seg button").forEach((b) => b.classList.toggle("on", b.dataset.format === state.format));
  $("#book-pick").value = state.book;
  const cp = $("#chapter-pick");
  if (cp.dataset.book !== state.book) {
    cp.innerHTML = "";
    for (const c of chapterNums(state.book)) cp.add(new Option(`Chapter ${c}`, c));
    cp.dataset.book = state.book;
  }
  cp.value = state.ch;

  const list = chapter();
  $("#now-ref").textContent = state.slide
    ? `${bookName(state.book)} ${state.ch}  (${state.slide === "intro" ? "intro slide" : "outro slide"})`
    : `${refStr(state.book, state.ch, v.v)}  (verse ${state.i + 1} of ${list.length})`;

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
  const nv = state.slide === "outro" ? null : list[state.i + (state.slide === "intro" ? 0 : 1)];
  if (state.slide === "outro" && state.format === "full") {
    $("#next-preview").innerHTML = `<b>Say:</b> “${esc(outroLine(state.book, state.ch))}”`;
  } else
  $("#next-preview").innerHTML = nv
    ? `<b>Next ${nv.v}:</b> ${esc(nv[C.readRow] || "(not in " + C.names[C.readRow] + ")")}`
    : `<b>End of chapter.</b>`;

  // Chapter estimate
  const words = list.reduce((n, x) => n + countWords(x[C.readRow] || ""), 0);
  $("#chapter-est").textContent = `Chapter about ${fmtTime((words / C.wordsPerMinute) * 60)} at ${C.wordsPerMinute} words/min`;

}

// ---------- navigation helpers ----------
function reset() {
  state.i = 0;
  state.slide = slideOn("intro") ? "intro" : null;
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
// First template that fits in a YouTube title; the last one is used even if it is too long.
const title = (list, o) => list.map((t) => fill(t, o)).find((t) => t.length <= C.titleMax) ?? fill(list.at(-1), o);
const csvCell = (s) => `"${String(s).replace(/"/g, '""')}"`;
const fullRef = (b, s) => `${bookName(b)} ${rangeStr(s)}`;
const chapterTitle = (b, c) => title(C.titles.chapter, { book: bookName(b), chapter: c });
// Every section belongs to the chapter it starts in.
const sectionsStartingIn = (b, c) => SECTIONS[b].filter((s) => s.start[0] === +c);
const sectionsTouching = (b, c) => SECTIONS[b].filter((s) => s.start[0] <= c && s.end[0] >= c);

const readLine = () => `Read from the ${C.names[C.readRow]}, shown with the ${joinNames(C.rows.filter((r) => r !== C.readRow).map((r) => C.names[r]))} for comparison.`;
const sectionTitle = (b, s) => title(C.titles.section, { heading: s.heading, ref: fullRef(b, s), book: bookName(b), chapter: s.start[0] });
function sectionDescription(b, s, isShort) {
  const c = s.start[0];
  return [
    `${s.heading} — ${fullRef(b, s)}`,
    readLine(),
    isShort ? `Full chapter: ${bookName(b)} ${c} (linked as the Related video).` : `Full chapter: ${bookName(b)} ${c} — [add link to the chapter video].`,
    "",
    ...C.attribution,
  ].join("\n");
}
// Chapter list for a chapter video. startAt(s) gives a section's start in seconds, or null if unknown.
function chapterTimestamps(b, c, startAt = () => null) {
  const verses = DB.books[b].chapters[c];
  return sectionsTouching(b, c).map((s, i) => {
    const from = s.start[0] < c ? [c, verses[0].v] : s.start;
    const to = s.end[0] > c ? [c, verses.at(-1).v] : s.end;
    const t = i === 0 ? 0 : startAt(s, from);
    const stamp = t == null ? "??:??" : `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    return { t, line: `${stamp} ${s.heading} (${from[0]}:${from[1]}–${to[1]})` };
  });
}
const chapterDescription = (stamps) => [...stamps.map((x) => x.line), "", readLine(), "", ...C.attribution].join("\n");

function exportCsv() {
  const b = state.book, c = state.ch;
  const rows = [["Heading", "Verse range", "Estimated length", "Publishes as", "Title", "Description", "Chapter video"]];
  for (const s of sectionsStartingIn(b, c)) {
    const secs = secSeconds(s);
    const isShort = secs <= C.shortMaxSeconds;
    rows.push([s.heading, fullRef(b, s), fmtTime(secs), isShort ? "Short" : "Vertical video (over 3:00)", sectionTitle(b, s), sectionDescription(b, s, isShort), chapterTitle(b, c)]);
  }
  download(`sections-${b}-${c}.csv`, "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n", "text/csv;charset=utf-8");
}
function exportTxt() {
  const b = state.book, c = state.ch;
  const lines = [
    chapterTitle(b, c),
    "",
    "Add start times after assembling the chapter video. YouTube chapters need: first timestamp 00:00, at least 3 timestamps in ascending order, each chapter at least 10 seconds long.",
    "",
  ];
  lines.push(chapterDescription(chapterTimestamps(b, c)));
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
  // The stage changes size with the format, so the format is locked during a take.
  document.querySelectorAll("#format-seg button").forEach((b) => b.onclick = () => { if (rec.recorder) return; state.format = b.dataset.format; render(); });
  $("#book-pick").onchange = (e) => { goTo(e.target.value, chapterNums(e.target.value)[0], 1); e.target.blur(); };
  $("#chapter-pick").onchange = (e) => { goTo(state.book, +e.target.value, 1); e.target.blur(); };
  $("#btn-next").onclick = () => step(1);
  $("#btn-prev").onclick = () => step(-1);
  $("#btn-reset").onclick = reset;
  $("#debug").onchange = (e) => { state.debug = e.target.checked; render(); };
  $("#btn-rec").onclick = toggleTake;
  $("#mic-pick").onchange = (e) => { switchMic(e.target.value); e.target.blur(); };
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

  // Keys work regardless of focus (except while typing in search).
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const act = {
      " ": () => step(1), ArrowRight: () => step(1), PageDown: () => step(1),
      ArrowLeft: () => step(-1), PageUp: () => step(-1),
      r: reset, R: reset,
      "/": () => { search.focus(); search.select(); },
      Enter: toggleTake,
      Backspace: discardTake,
    };
    if (act[k]) {
      e.preventDefault();
      if (t.tagName === "SELECT" || t.tagName === "BUTTON" || t.tagName === "INPUT") t.blur();
      act[k]();
    }
  }, true);
}
