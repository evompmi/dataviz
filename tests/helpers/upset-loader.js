// Loads the UpSet pure-helper slice (computeMemberships, enumerateIntersections,
// sortIntersections, truncateIntersections, intersectionLabel,
// intersectionFilenamePart) into a Node vm context for testing. Mirrors
// venn-loader.js: tools/upset.tsx mixes JSX with pure helpers, so we feed the
// pre-chart slice through esbuild's tsx transform.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const upsetSrc = fs.readFileSync(path.join(toolsDir, "upset.tsx"), "utf8");
// The layout-constants section starts the React-heavy part; cut just before it.
const LAYOUT_MARKER = "// ── Layout constants ──";
const cutIdx = upsetSrc.indexOf(LAYOUT_MARKER);
if (cutIdx === -1) {
  throw new Error("upset-loader: layout-constants marker not found — update the slice cutoff.");
}
const helpersSlice = upsetSrc.slice(0, cutIdx);
const helpersJs = esbuild.transformSync(helpersSlice, {
  loader: "tsx",
  jsx: "transform",
}).code;

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
  document: { createElement: () => ({}), body: { appendChild: () => {}, removeChild: () => {} } },
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
    createElement: () => null,
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(helpersJs, ctx);

module.exports = {
  parseRaw: ctx.parseRaw,
  parseSetData: ctx.parseSetData,
  parseLongFormatSets: ctx.parseLongFormatSets,
  computeMemberships: ctx.computeMemberships,
  enumerateIntersections: ctx.enumerateIntersections,
  sortIntersections: ctx.sortIntersections,
  truncateIntersections: ctx.truncateIntersections,
  intersectionLabel: ctx.intersectionLabel,
  intersectionFilenamePart: ctx.intersectionFilenamePart,
  buildBarTicks: ctx.buildBarTicks,
};
