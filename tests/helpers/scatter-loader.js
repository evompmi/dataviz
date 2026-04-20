// Loads the scatter data pipeline into a Node vm context for fuzz / unit
// tests. The tool's regression math lives inline in tools/scatter.tsx (a
// `useMemo` closure at line ~2228); we deliberately do NOT extract it just
// for testability — the fuzz harness mirrors the same formula in a small
// helper so the tool stays unchanged. What this loader provides is the
// shared primitives scatter layers on top of parseRaw.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");

const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  Number,
  String,
  Array,
  Object,
  Infinity,
  NaN,
  Set,
  Map,
  setTimeout: () => {},
  document: {
    createElement: () => ({}),
    body: { appendChild: () => {}, removeChild: () => {} },
  },
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);

// `const` bindings inside vm.runInContext stay script-scoped (they don't
// become properties of the context object), so ctx.COLOR_PALETTES is
// `undefined` even though the declaration succeeded. Re-evaluate to pull
// the values out. Function declarations are fine via ctx.* because they're
// hoisted to the global object.
const COLOR_PALETTES = vm.runInContext("COLOR_PALETTES", ctx);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  interpolateColor: ctx.interpolateColor,
  COLOR_PALETTES,
};
