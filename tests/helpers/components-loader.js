// Loads shared-components.js pure functions into a Node vm context.
// React-dependent components (ColorInput, FileDropZone, etc.) are stubbed out.
// Loads shared.js first to provide globals that shared-components.js depends on.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const sharedSrc = fs.readFileSync(path.join(__dirname, "../../tools/shared.js"), "utf8");
const compSrc = fs.readFileSync(path.join(__dirname, "../../tools/shared-components.js"), "utf8");

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
  document: { createElement: () => ({}), body: { appendChild: () => {}, removeChild: () => {} } },
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  Blob: function () {},
  XMLSerializer: function () {
    this.serializeToString = () => "";
  },
  // Minimal React stub — enough for the file to load without crashing
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
vm.runInContext(compSrc, ctx);

module.exports = {
  computeLegendHeight: ctx.computeLegendHeight,
  renderSvgLegend: ctx.renderSvgLegend,
};
