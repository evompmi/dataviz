// Loads tools/shared.js into a Node vm context so its pure functions can be tested.
// Browser-only functions (flashSaved, downloadSvg, downloadCsv) are excluded from exports
// because they require DOM APIs — they are tested separately via integration tests.

const fs  = require("fs");
const vm  = require("vm");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../../tools/shared.js"), "utf8");

const ctx = {
  Math, parseInt, parseFloat, isNaN, Number, String, Array, Object,
  // Stub out DOM APIs so the file loads without crashing
  setTimeout: () => {},
  document: { createElement: () => ({}), body: { appendChild: () => {}, removeChild: () => {} } },
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function() {},
  XMLSerializer: function() { this.serializeToString = () => ""; },
};

vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = {
  autoDetectSep:     ctx.autoDetectSep,
  fixDecimalCommas:  ctx.fixDecimalCommas,
  niceStep:          ctx.niceStep,
  makeTicks:         ctx.makeTicks,
  hexToRgb:          ctx.hexToRgb,
  rgbToHex:          ctx.rgbToHex,
  shadeColor:        ctx.shadeColor,
  seededRandom:      ctx.seededRandom,
};
