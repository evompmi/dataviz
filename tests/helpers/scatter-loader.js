// Loads the scatter data pipeline into a Node vm context for fuzz / unit
// tests. Pure helpers live in tools/scatter/helpers.ts (fmtTick, SHAPES,
// MARGIN / VBW / VBH, computeLinearRegression) and are exposed via the
// esbuild CJS transform below. The rest of scatter.tsx is React-heavy
// (PaletteStrip, renderPoint, ShapePreview use JSX) and is not extracted.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const helpersSrc = fs.readFileSync(path.join(toolsDir, "scatter/helpers.ts"), "utf8");

const helpersCjs = esbuild.transformSync(helpersSrc, {
  loader: "ts",
  format: "cjs",
}).code;

const moduleObj = { exports: {} };
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
  module: moduleObj,
  exports: moduleObj.exports,
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
vm.runInContext(helpersCjs, ctx);

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
  // Scatter-specific pure helpers, now directly testable.
  fmtTick: moduleObj.exports.fmtTick,
  SHAPES: moduleObj.exports.SHAPES,
  computeLinearRegression: moduleObj.exports.computeLinearRegression,
};
