// Loads the aequorin data pipeline into a Node vm context for fuzz / unit
// tests. The calibration + condition-detection helpers live at the top of
// tools/aequorin.tsx (lines 1–177 — pure JS, no JSX, no TypeScript). We
// slice those lines out and run them under a stubbed React, piggy-backing
// on shared.js for PALETTE + parseWideMatrix.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const aequorinSrc = fs.readFileSync(path.join(toolsDir, "aequorin.tsx"), "utf8");
// Lines 1–177 are pure JS: DEFAULT_* constants, calibrate, calibrateHill,
// calibrateGeneralized, detectConditions, smooth. The chart components
// (React) start at line 179+. Slice by index.
const aequorinHelpers = aequorinSrc.split("\n").slice(0, 177).join("\n");

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
  React: {
    useState: () => [null, () => {}],
    useReducer: () => [null, () => {}],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
    useEffect: () => {},
    forwardRef: (fn) => fn,
    memo: (c) => c,
    createElement: () => null,
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
vm.runInContext(aequorinHelpers, ctx);

module.exports = {
  parseWideMatrix: ctx.parseWideMatrix,
  calibrate: ctx.calibrate,
  calibrateHill: ctx.calibrateHill,
  calibrateGeneralized: ctx.calibrateGeneralized,
  detectConditions: ctx.detectConditions,
  smooth: ctx.smooth,
};
