// Loads the boxplot data pipeline — parser, per-group descriptive stats,
// and the whole `selectTest → test → post-hoc → bracket layout` stats chain
// — into a Node vm context for fuzzing / headless unit tests. Same pattern
// as heatmap-loader.js; React is stubbed (only StatsTile uses it, and we
// don't invoke it — we only pull the pure `assignBracketLevels` helper out
// of shared-stats-tile.js).

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const statsTileSrc = fs.readFileSync(path.join(toolsDir, "shared-stats-tile.js"), "utf8");

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
};
