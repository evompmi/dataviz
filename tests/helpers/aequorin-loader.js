// Loads the aequorin pure helpers (tools/aequorin/helpers.ts) plus shared.js /
// stats.js into a Node vm context for fuzz / unit tests. helpers.ts is a pure
// ES module (calibration, condition detection, smoothing, time conversion,
// SVG path builders) with no React/DOM dependency, so we transform it to
// CommonJS with esbuild and evaluate it in a vm context that already has the
// shared globals (PALETTE, parseWideMatrix, …) available.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const helpersSrc = fs.readFileSync(path.join(toolsDir, "aequorin/helpers.ts"), "utf8");

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

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  calibrate: moduleObj.exports.calibrate,
  calibrateHill: moduleObj.exports.calibrateHill,
  calibrateGeneralized: moduleObj.exports.calibrateGeneralized,
  detectConditions: moduleObj.exports.detectConditions,
  smooth: moduleObj.exports.smooth,
  convertTime: moduleObj.exports.convertTime,
  buildAreaD: moduleObj.exports.buildAreaD,
  buildLineD: moduleObj.exports.buildLineD,
};
