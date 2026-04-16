// Loads tools/shared.js into a Node vm context so its pure functions can be tested.
// Browser-only functions (flashSaved, downloadSvg, downloadCsv) are excluded from exports
// because they require DOM APIs — they are tested separately via integration tests.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../../tools/shared.js"), "utf8");

const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  Number,
  String,
  Array,
  Object,
  // Stub out DOM APIs so the file loads without crashing
  setTimeout: () => {},
  document: { createElement: () => ({}), body: { appendChild: () => {}, removeChild: () => {} } },
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
};

vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = {
  // Color helpers
  hexToRgb: ctx.hexToRgb,
  rgbToHex: ctx.rgbToHex,
  shadeColor: ctx.shadeColor,
  getPointColors: ctx.getPointColors,
  // Seeded random
  seededRandom: ctx.seededRandom,
  // Axis ticks
  niceStep: ctx.niceStep,
  makeTicks: ctx.makeTicks,
  // Separator / decimal
  autoDetectSep: ctx.autoDetectSep,
  fixDecimalCommas: ctx.fixDecimalCommas,
  // Numeric detection
  isNumericValue: ctx.isNumericValue,
  // Parsing helpers
  detectHeader: ctx.detectHeader,
  parseRaw: ctx.parseRaw,
  guessColumnType: ctx.guessColumnType,
  detectWideFormat: ctx.detectWideFormat,
  parseData: ctx.parseData,
  dataToColumns: ctx.dataToColumns,
  wideToLong: ctx.wideToLong,
  reshapeWide: ctx.reshapeWide,
  // Filename helpers
  fileBaseName: ctx.fileBaseName,
  // Statistics
  computeStats: ctx.computeStats,
  quartiles: ctx.quartiles,
  kde: ctx.kde,
  computeGroupStats: ctx.computeGroupStats,
};
