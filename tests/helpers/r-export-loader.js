// Loads tools/shared-r-export.js into a Node vm context and re-exports its
// globals for the test suite. The module is pure string-building (no React,
// no DOM), so the sandbox is minimal — just enough builtins to evaluate the
// file top-to-bottom.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");
const src = fs.readFileSync(path.join(toolsDir, "shared-r-export.js"), "utf8");

const ctx = {
  Math,
  Number,
  String,
  Array,
  Object,
  JSON,
  Date,
  console,
};

vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = {
  buildRScript: ctx.buildRScript,
  buildRScriptForPower: ctx.buildRScriptForPower,
  sanitizeRString: ctx.sanitizeRString,
  formatRNumber: ctx.formatRNumber,
  formatRVector: ctx.formatRVector,
};
