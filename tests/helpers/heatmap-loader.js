// Loads the heatmap data pipeline (parseWideMatrix + clustering primitives
// from shared.js/stats.js) plus the tool-specific pure helpers
// (tools/heatmap/helpers.ts — normalizeMatrix, autoRange, buildDendroLayout,
// pruneDendroTree, fmtColorbarTick, finiteMean, finiteSD) into a Node vm
// context for fuzzing and unit tests. helpers.ts is a pure ES module with no
// React/DOM use, so we transform it to CommonJS with esbuild.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const helpersSrc = fs.readFileSync(path.join(toolsDir, "heatmap/helpers.ts"), "utf8");

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
  // Stub DOM APIs so the shared.js globals load without crashing
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
vm.runInContext(helpersCjs, ctx);

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  pairwiseDistance: ctx.pairwiseDistance,
  hclust: ctx.hclust,
  kmeans: ctx.kmeans,
  // Heatmap-specific pure helpers.
  finiteMean: moduleObj.exports.finiteMean,
  finiteSD: moduleObj.exports.finiteSD,
  normalizeMatrix: moduleObj.exports.normalizeMatrix,
  autoRange: moduleObj.exports.autoRange,
  buildDendroLayout: moduleObj.exports.buildDendroLayout,
  pruneDendroTree: moduleObj.exports.pruneDendroTree,
  fmtColorbarTick: moduleObj.exports.fmtColorbarTick,
};
