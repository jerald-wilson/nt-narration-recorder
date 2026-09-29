#!/usr/bin/env node
// Sets the app's password: asks for it (hidden), then writes its hash into config.js (passwordHash).
// Run: node scripts/set-password.js   Then commit and push config.js.
// An empty password removes the gate. Salted like passwordHash() in app.js; change both together.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let pw = "";
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(pw);
      } else if (ch === "\u0003") { process.stdout.write("\n"); process.exit(1); }
      else if (ch === "\u007f") pw = pw.slice(0, -1);
      else pw += ch;
    };
    stdin.on("data", onData);
  });
}

(async () => {
  const pw = await ask("New password (empty to remove): ");
  if (pw && pw !== await ask("Again: ")) { console.log("They don't match. Nothing changed."); process.exit(1); }
  const hash = pw ? crypto.createHash("sha256").update("side-by-side:" + pw).digest("hex") : "";
  const file = path.join(__dirname, "..", "config.js");
  const src = fs.readFileSync(file, "utf8");
  if (!/passwordHash: "[0-9a-f]*",/.test(src)) { console.log("Couldn't find passwordHash in config.js."); process.exit(1); }
  fs.writeFileSync(file, src.replace(/passwordHash: "[0-9a-f]*",/, `passwordHash: "${hash}",`));
  console.log(pw ? "Password set in config.js. Commit and push it to update the site." : "Password removed from config.js.");
})();
