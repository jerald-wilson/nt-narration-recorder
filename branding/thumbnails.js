#!/usr/bin/env node
// Renders YouTube thumbnails (1280 × 720 PNG) from branding/thumbnail.html into thumbnails/{TRANSLATION}/.
// One headless Chrome for the whole batch (driven over the DevTools protocol, no extra installs).
//
//   node branding/thumbnails.js "MAT 5" "JHN 3"     chapters              -> thumbnails/MSB/MAT-5.png, JHN-3.png
//   node branding/thumbnails.js MAT                 a whole book
//   node branding/thumbnails.js                     all 260 chapters
//   node branding/thumbnails.js --books [MAT JHN]   playlist covers       -> thumbnails/MSB/book-MAT.png, …
//   node branding/thumbnails.js --title "Missing verses" --kicker "Why some Bibles skip Acts 8:37" [--greek ΒΙΒΛΟΣ]
//   node branding/thumbnails.js --everything        all chapters and covers, every translation
// Add --tr kjv (msb, blb, bbe, or all) for the read translation's color and badge; default msb.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, "data/nt.json"), "utf8"));
const TRS = ["msb", "kjv", "blb", "bbe"];

// ---------- what to render ----------
let args = process.argv.slice(2), trs = ["msb"], everything = false;
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const tr = take("--tr");
if (tr) trs = tr.toLowerCase() === "all" ? TRS : [tr.toLowerCase()];
if (args.includes("--everything")) { everything = true; trs = TRS; args = args.filter((a) => a !== "--everything"); }
for (const t of trs) if (!TRS.includes(t)) die(`Unknown translation: ${t} (use msb, kjv, blb, bbe, or all)`);

const chapters = (b) => Object.keys(DB.books[b].chapters).map(Number).sort((x, y) => x - y);
const book = (code) => { const b = code.toUpperCase(); if (!DB.books[b]) die(`Unknown book: ${code} (use codes like MAT, 1CO, REV)`); return b; };
let kicker = "", greek = null;
if (args[0] === "--title") { kicker = take("--kicker") || ""; greek = take("--greek"); }
const jobs = [];
for (const t of trs) {
  const T = t.toUpperCase();
  const add = (file, query) => jobs.push({ out: path.join(ROOT, "thumbnails", T, file), query: `${query}&tr=${t}` });
  if (everything) {
    for (const b of DB.order) { for (const c of chapters(b)) add(`${b}-${c}.png`, `ref=${b}+${c}`); add(`book-${b}.png`, `book=${b}`); }
  } else if (args[0] === "--title") {
    const title = args[1];
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    add(`${slug}.png`, `title=${encodeURIComponent(title)}&kicker=${encodeURIComponent(kicker)}` + (greek ? `&greek=${encodeURIComponent(greek)}` : ""));
  } else if (args[0] === "--books") {
    for (const b of (args.length > 1 ? args.slice(1).map(book) : DB.order)) add(`book-${b}.png`, `book=${b}`);
  } else {
    for (const a of (args.length ? args : DB.order)) {
      const [code, c] = a.trim().split(/\s+/), b = book(code);
      if (c && !DB.books[b].chapters[c]) die(`No chapter ${b} ${c}`);
      for (const ch of c ? [c] : chapters(b)) add(`${b}-${ch}.png`, `ref=${b}+${ch}`);
    }
  }
}

function die(msg) { console.error(msg); process.exit(1); }

// ---------- one Chrome, many pages ----------
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "thumbs-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], { stdio: "ignore" });
  const exited = new Promise((r) => chrome.once("exit", r));
  process.on("exit", () => { try { chrome.kill(); } catch { /* gone */ } });
  // Close Chrome, wait for it to let go of its temporary profile, then delete the profile.
  const cleanup = async () => {
    chrome.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the OS clears temp files */ }
  };
  try {
    const port = await waitFor(() => { try { return fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch { return null; } }, 15000, "Chrome didn't start");
    const page = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.type === "page"), 10000, "no Chrome page");
    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    const failed = [];
    let n = 0;
    for (const job of jobs) {
      fs.mkdirSync(path.dirname(job.out), { recursive: true });
      let ok = false;
      for (let tries = 0; tries < 3 && !ok; tries++) {
        try {
          await cdp("Page.navigate", { url: `file://${ROOT}/branding/thumbnail.html?${job.query}` });
          await waitFor(async () => (await cdp("Runtime.evaluate", { expression: 'document.body && document.body.dataset.ready === "1"', returnByValue: true })).result.value, 15000, "page never got ready");
          const shot = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 } });
          fs.writeFileSync(job.out, Buffer.from(shot.data, "base64"));
          ok = true;
        } catch { /* try again */ }
      }
      if (!ok) failed.push(path.relative(ROOT, job.out));
      if (++n % 50 === 0 || n === jobs.length) process.stdout.write(`${n} of ${jobs.length}\n`);
    }
    if (jobs.length <= 5) for (const j of jobs) console.log(path.relative(ROOT, j.out));
    if (failed.length) { console.log(`FAILED (run them again): ${failed.join(", ")}`); process.exitCode = 1; }
  } finally { await cleanup(); }
}

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* not yet */ }
    if (Date.now() > end) throw new Error(what);
    await new Promise((r) => setTimeout(r, 50));
  }
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), pending = new Map();
    let id = 0;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    };
    ws.onerror = () => reject(new Error("couldn't connect to Chrome"));
    ws.onopen = () => resolve((method, params = {}) => new Promise((res, rej) => {
      pending.set(++id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params }));
    }));
  });
}

main().catch((e) => die(e.message));
