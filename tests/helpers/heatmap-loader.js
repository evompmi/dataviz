// Loads the heatmap data pipeline (parseWideMatrix + clustering primitives)
// into a Node vm context so it can be exercised headlessly for fuzzing and
// unit tests. Mirrors the pattern of the other tests/helpers/*-loader.js
// files; DOM APIs are stubbed because the pipeline itself is pure JS.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const sharedSrc = fs.readFileSync(path.join(__dirname, "../../tools/shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(__dirname, "../../tools/stats.js"), "utf8");

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

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  pairwiseDistance: ctx.pairwiseDistance,
  hclust: ctx.hclust,
  kmeans: ctx.kmeans,
};
