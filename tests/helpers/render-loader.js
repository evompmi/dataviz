// Loads shared-components.js and compiled tool JS files into a Node vm context
// with a functional React mock that returns element trees (not null).
// This enables render-smoke tests: call a component, assert it returns elements.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const toolsDir = path.join(__dirname, "../../tools");

// ── Functional React mock ───────────────────────────────────────────────────
// createElement returns {type, props, children} objects just like real React,
// hooks return usable defaults so component functions can execute to completion.

function createReactMock() {
  let stateIdx = 0;
  const states = [];

  function resetHooks() {
    stateIdx = 0;
  }

  const React = {
    createElement(type, props) {
      const children = Array.prototype.slice
        .call(arguments, 2)
        .flat(Infinity)
        .filter(function (c) {
          return c != null && c !== false;
        });
      return { type: type, props: props || {}, children: children };
    },
    useState(init) {
      const idx = stateIdx++;
      if (states[idx] === undefined) states[idx] = typeof init === "function" ? init() : init;
      const i = idx;
      return [
        states[i],
        function (v) {
          states[i] = typeof v === "function" ? v(states[i]) : v;
        },
      ];
    },
    useReducer(reducer, init) {
      const idx = stateIdx++;
      if (states[idx] === undefined) states[idx] = init;
      const i = idx;
      return [
        states[i],
        function (action) {
          states[i] = reducer(states[i], action);
        },
      ];
    },
    useMemo(fn) {
      return fn();
    },
    useCallback(fn) {
      return fn;
    },
    useRef(init) {
      return { current: init !== undefined ? init : null };
    },
    useEffect() {},
    memo(fn) {
      return fn;
    },
    forwardRef(fn) {
      var comp = function (props) {
        return fn(props, (props && props.ref) || { current: null });
      };
      comp._isForwardRef = true;
      comp._render = fn;
      return comp;
    },
    Fragment: "Fragment",
    Component: class {
      constructor(props) {
        this.props = props;
        this.state = {};
      }
      setState(patch) {
        this.state = Object.assign(
          {},
          this.state,
          typeof patch === "function" ? patch(this.state) : patch
        );
      }
    },
  };

  return { React: React, resetHooks: resetHooks };
}

// ── Build a vm context with all the globals tools expect ────────────────────

function buildContext() {
  const { React, resetHooks } = createReactMock();

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
    JSON,
    RegExp,
    Date,
    Map,
    Set,
    Error,
    console,
    Infinity,
    NaN,
    undefined,
    Boolean,
    Symbol,
    Promise,
    // DOM stubs
    setTimeout: function (fn) {
      if (typeof fn === "function") fn();
    },
    clearTimeout: function () {},
    document: {
      createElement: function () {
        return {
          style: {},
          setAttribute: function () {},
          click: function () {},
          appendChild: function () {},
          removeChild: function () {},
        };
      },
      getElementById: function () {
        return { style: {} };
      },
      body: { appendChild: function () {}, removeChild: function () {} },
    },
    URL: {
      createObjectURL: function () {
        return "";
      },
      revokeObjectURL: function () {},
    },
    Blob: function () {},
    XMLSerializer: function () {
      this.serializeToString = function () {
        return "";
      };
    },
    FileReader: function () {
      this.readAsText = function () {};
      this.onload = null;
    },
    window: {},
    React: React,
    ReactDOM: {
      createRoot: function () {
        return { render: function () {} };
      },
    },
  };

  vm.createContext(ctx);

  // Load shared.js first (provides PALETTE, makeTicks, seededRandom, etc.)
  const sharedSrc = fs.readFileSync(path.join(toolsDir, "shared.js"), "utf8");
  vm.runInContext(sharedSrc, ctx);

  // Load shared-components.js
  const compSrc = fs.readFileSync(path.join(toolsDir, "shared-components.js"), "utf8");
  vm.runInContext(compSrc, ctx);

  return { ctx: ctx, resetHooks: resetHooks };
}

// ── Load a compiled tool .js file into its own context ──────────────────────
// Each tool gets a fresh context since they define conflicting top-level names.

function loadTool(toolName) {
  const { ctx, resetHooks } = buildContext();
  const toolSrc = fs.readFileSync(path.join(toolsDir, toolName + ".js"), "utf8");
  // Wrap in a function so const/let declarations are captured via _exports.
  // The tool source ends with ReactDOM.createRoot(...).render(...) which we
  // replace with an export of all const-declared names we care about.
  const wrapped =
    "(function() {\n" +
    toolSrc +
    "\nreturn {" +
    "BoxplotChart: typeof BoxplotChart !== 'undefined' ? BoxplotChart : undefined," +
    "BarChart: typeof BarChart !== 'undefined' ? BarChart : undefined," +
    "ScatterChart: typeof ScatterChart !== 'undefined' ? ScatterChart : undefined," +
    "Chart: typeof Chart !== 'undefined' ? Chart : undefined," +
    "InsetBarplot: typeof InsetBarplot !== 'undefined' ? InsetBarplot : undefined," +
    "PlotPanel: typeof PlotPanel !== 'undefined' ? PlotPanel : undefined," +
    "};\n})()";
  const exports = vm.runInContext(wrapped, ctx);
  // Merge exported names into context for easy access
  Object.keys(exports).forEach(function (k) {
    if (exports[k] !== undefined) ctx[k] = exports[k];
  });
  return { ctx: ctx, resetHooks: resetHooks };
}

// ── Helper: render a component (call the function) and return the element ───

function render(component, props, resetHooks) {
  if (resetHooks) resetHooks();
  return component(props);
}

// ── Helper: count elements in a tree recursively ────────────────────────────

function countElements(tree) {
  if (!tree || typeof tree !== "object") return 0;
  if (Array.isArray(tree)) {
    return tree.reduce(function (sum, el) {
      return sum + countElements(el);
    }, 0);
  }
  var count = 1; // this node
  if (tree.children) {
    count += tree.children.reduce(function (sum, el) {
      return sum + countElements(el);
    }, 0);
  }
  return count;
}

module.exports = {
  buildContext: buildContext,
  loadTool: loadTool,
  render: render,
  countElements: countElements,
};
