#!/usr/bin/env node
// Points git at scripts/hooks/ so the versioned pre-commit hook activates.
// Runs automatically on `npm install` via the "prepare" npm script.
//
// We don't use husky because (a) this repo already avoids optional deps that
// can be expressed with ~20 lines of Node, and (b) the hook itself is a
// single shell script — no orchestration layer needed.

const { execSync } = require("child_process");
const { chmodSync, existsSync } = require("fs");
const path = require("path");

function run(cmd) {
  return execSync(cmd, { stdio: "pipe" }).toString().trim();
}

try {
  // If we're not inside a git working tree (e.g. published tarball, Docker
  // layer, CI cache restore before git is available), silently skip.
  run("git rev-parse --is-inside-work-tree");
} catch {
  process.exit(0);
}

try {
  const current = (() => {
    try {
      return run("git config --get core.hooksPath");
    } catch {
      return "";
    }
  })();

  const target = "scripts/hooks";
  if (current !== target) {
    execSync(`git config core.hooksPath ${target}`, { stdio: "inherit" });
    console.log(`[hooks] core.hooksPath → ${target}`);
  }

  const hook = path.join(target, "pre-commit");
  if (existsSync(hook)) chmodSync(hook, 0o755);
} catch (err) {
  console.error("[hooks] install skipped:", err.message);
}
