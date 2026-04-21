// Loads the boxplot data pipeline — parser, per-group descriptive stats, the
// full `selectTest → test → post-hoc → bracket layout` stats chain, plus the
// boxplot-specific pure helpers (tools/boxplot/helpers.ts: test/post-hoc
// routers, result formatters, annotation spec, summary-text builders,
// sub-group annotation merge) — into a Node vm context for fuzzing /
// headless unit tests. Same pattern as the other loaders; React is stubbed
// (only StatsTile and BoxplotChart use it, and we don't invoke either — we
// only pull pure helpers out).

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const statsTileSrc = fs.readFileSync(path.join(toolsDir, "shared-stats-tile.js"), "utf8");
const helpersSrc = fs.readFileSync(path.join(toolsDir, "boxplot/helpers.ts"), "utf8");

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
  // Minimal React stub — shared-stats-tile.js references React at module
  // scope inside component bodies, not at top level, so the file loads
  // cleanly without ever calling these.
  React: {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useId: () => ":r0:",
    createElement: () => null,
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
vm.runInContext(statsTileSrc, ctx);
vm.runInContext(helpersCjs, ctx);

module.exports = {
  parseRaw: ctx.parseRaw,
  isNumericValue: ctx.isNumericValue,
  quartiles: ctx.quartiles,
  computeStats: ctx.computeStats,
  kde: ctx.kde,
  computeGroupStats: ctx.computeGroupStats,
  selectTest: ctx.selectTest,
  tTest: ctx.tTest,
  mannWhitneyU: ctx.mannWhitneyU,
  oneWayANOVA: ctx.oneWayANOVA,
  welchANOVA: ctx.welchANOVA,
  kruskalWallis: ctx.kruskalWallis,
  tukeyHSD: ctx.tukeyHSD,
  gamesHowell: ctx.gamesHowell,
  dunnTest: ctx.dunnTest,
  bhAdjust: ctx.bhAdjust,
  shapiroWilk: ctx.shapiroWilk,
  leveneTest: ctx.leveneTest,
  compactLetterDisplay: ctx.compactLetterDisplay,
  assignBracketLevels: ctx.assignBracketLevels,
  // Boxplot-specific pure helpers.
  formatBpStatShort: moduleObj.exports.formatBpStatShort,
  formatBpResultLine: moduleObj.exports.formatBpResultLine,
  computeBpAnnotationSpec: moduleObj.exports.computeBpAnnotationSpec,
  summariseNormality: moduleObj.exports.summariseNormality,
  summariseEqualVariance: moduleObj.exports.summariseEqualVariance,
  computeBpSummaryText: moduleObj.exports.computeBpSummaryText,
  mergeSubgroupAnnotations: moduleObj.exports.mergeSubgroupAnnotations,
  statsSummaryHeight: moduleObj.exports.statsSummaryHeight,
};
