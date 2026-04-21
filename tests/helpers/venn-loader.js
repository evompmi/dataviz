// Loads the venn pure helpers (tools/venn/helpers.ts and its cohesion-split
// siblings under tools/venn/*.ts) and their shared dependencies
// (tools/shared.js, tools/stats.js) into a Node vm context. helpers.ts is a
// thin barrel that re-exports from constants.ts / set-math.ts / geometry.ts /
// areas.ts / layout.ts / centroids.ts — we bundle it (inlining the sibling
// modules) to CommonJS with esbuild and evaluate it in a single vm context
// that already has the shared globals available.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");

const helpersCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "venn/helpers.ts")],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  write: false,
}).outputFiles[0].text;

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

module.exports = {
  parseRaw: ctx.parseRaw,
  parseSetData: ctx.parseSetData,
  computeIntersections: moduleObj.exports.computeIntersections,
  circleOverlapArea: moduleObj.exports.circleOverlapArea,
  solveDistance: moduleObj.exports.solveDistance,
  circleIntersectionPoints: moduleObj.exports.circleIntersectionPoints,
  buildRegionPaths: moduleObj.exports.buildRegionPaths,
  computeAllRegionAreas: moduleObj.exports.computeAllRegionAreas,
  tripleIntersectionArea: moduleObj.exports.tripleIntersectionArea,
};
