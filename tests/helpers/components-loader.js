// Loads shared-components.js pure functions into a Node vm context.
// React-dependent components (ColorInput, FileDropZone, etc.) are stubbed out.

const fs  = require("fs");
const vm  = require("vm");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../../tools/shared-components.js"), "utf8");

const ctx = {
  Math, parseInt, parseFloat, isNaN, Number, String, Array, Object, console,
  // Minimal React stub — enough for the file to load without crashing
  React: {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    createElement: () => null,
  },
};

vm.createContext(ctx);
vm.runInContext(src, ctx);

module.exports = {
  computeLegendHeight: ctx.computeLegendHeight,
  renderSvgLegend:     ctx.renderSvgLegend,
};
