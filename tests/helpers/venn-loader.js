// Loads the venn geometry + set-membership helpers into a Node vm context.
// tools/venn.tsx contains TS generics and JSX intermixed with ~950 lines of
// pure-math helpers, so unlike the boxplot/heatmap/aequorin loaders we
// transform the slice through esbuild first (esbuild is already a
// devDependency — no new install). The slice stops just before
// `VennChart = forwardRef<...>` starts the React-heavy render layer.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const esbuild = require("esbuild");

const toolsDir = path.join(__dirname, "../../tools");
const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
const statsSrc = fs.readFileSync(path.join(toolsDir, "stats.js"), "utf8");
const vennSrc = fs.readFileSync(path.join(toolsDir, "venn.tsx"), "utf8");
const vennHelpersSlice = vennSrc.split("\n").slice(0, 963).join("\n");
const vennHelpers = esbuild.transformSync(vennHelpersSlice, {
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
    createElement: () => null,
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
vm.runInContext(statsSrc, ctx);
vm.runInContext(vennHelpers, ctx);

module.exports = {
  parseRaw: ctx.parseRaw,
  parseSetData: ctx.parseSetData,
  computeIntersections: ctx.computeIntersections,
  circleOverlapArea: ctx.circleOverlapArea,
  solveDistance: ctx.solveDistance,
  circleIntersectionPoints: ctx.circleIntersectionPoints,
  buildRegionPaths: ctx.buildRegionPaths,
  computeAllRegionAreas: ctx.computeAllRegionAreas,
  tripleIntersectionArea: ctx.tripleIntersectionArea,
};
