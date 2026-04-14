// Loads shared component files (pure functions) into a Node vm context.
// React-dependent components (ColorInput, FileDropZone, etc.) are stubbed out.
// Loads shared.js first to provide globals that the component files depend on.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");

const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");

// Component files in load order (dependencies must come before dependents)
const componentFiles = [
  "theme.js",
  "shared-color-input.js",
  "shared-file-drop.js",
  "shared-svg-legend.js",
  "shared-core.js",
  "shared-ui.js",
  "shared-long-format.js",
  "shared-stats-tile.js",
];

const ctx = {
  Math,
  parseInt,
  parseFloat,
  isNaN,
  Number,
  String,
  Array,
  Object,
  console,
  // Stub out DOM APIs so shared.js loads without crashing
  setTimeout: () => {},
  document: {
    createElement: () => ({}),
    documentElement: {
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
    },
    body: { appendChild: () => {}, removeChild: () => {} },
  },
  window: {
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    dispatchEvent: () => {},
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  CustomEvent: function () {},
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
  // Minimal React stub — enough for the files to load without crashing
  React: {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    createElement: () => null,
    Component: class {
      constructor(props) {
        this.props = props;
        this.state = {};
      }
      setState() {}
    },
  },
};

vm.createContext(ctx);
vm.runInContext(sharedSrc, ctx);
for (const file of componentFiles) {
  vm.runInContext(fs.readFileSync(path.join(toolsDir, file), "utf8"), ctx);
}

module.exports = {
  computeLegendHeight: ctx.computeLegendHeight,
  renderSvgLegend: ctx.renderSvgLegend,
};
