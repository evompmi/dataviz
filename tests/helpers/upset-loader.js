// Loads the UpSet pure helpers (tools/upset/helpers.ts) and their shared
// dependencies (tools/shared.js) into a Node vm context. helpers.ts is a
// pure-TS ES module with no React/DOM use, so we transform it to CommonJS
// with esbuild and evaluate it in a vm context that already has the shared
// globals (svgSafeId, niceStep, parseSetData, parseLongFormatSets) available.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const helpersSrc = fs.readFileSync(path.join(toolsDir, "upset/helpers.ts"), "utf8");

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
vm.runInContext(helpersCjs, ctx);

module.exports = {
  parseRaw: ctx.parseRaw,
  parseSetData: ctx.parseSetData,
  parseLongFormatSets: ctx.parseLongFormatSets,
  computeMemberships: moduleObj.exports.computeMemberships,
  enumerateIntersections: moduleObj.exports.enumerateIntersections,
  sortIntersections: moduleObj.exports.sortIntersections,
  truncateIntersections: moduleObj.exports.truncateIntersections,
  intersectionLabel: moduleObj.exports.intersectionLabel,
  intersectionFilenamePart: moduleObj.exports.intersectionFilenamePart,
  buildBarTicks: moduleObj.exports.buildBarTicks,
};
