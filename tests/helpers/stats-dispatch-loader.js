// Loads tools/_shell/stats-dispatch.ts into a Node vm context with the
// stats.js globals available, for unit-testing the shared test / post-hoc
// dispatchers used by boxplot, lineplot, and aequorin.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");

const dispatchCjs = esbuild.buildSync({
  entryPoints: [path.join(toolsDir, "_shell/stats-dispatch.ts")],
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
vm.runInContext(dispatchCjs, ctx);

module.exports = {
  runTest: moduleObj.exports.runTest,
  runPostHoc: moduleObj.exports.runPostHoc,
  postHocForTest: moduleObj.exports.postHocForTest,
};
