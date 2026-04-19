// Loads tools/shared-prefs.js into a Node vm context so its pure validation
// logic can be unit-tested without a browser. Stubs localStorage, document,
// and FileReader with in-memory equivalents.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

function freshContext() {
  const store = {};
  const localStorage = {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
    clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };

  const downloadCalls = [];
  function downloadText(text, filename) {
    downloadCalls.push({ text, filename });
  }

  const ctx = {
    console,
    Math,
    JSON,
    Date,
    Number,
    String,
    Array,
    Object,
    Boolean,
    Error,
    RegExp,
    setTimeout: (fn, _ms) => {
      // Execute immediately so tests don't need to await a debounce window.
      fn();
      return 0;
    },
    clearTimeout: () => {},
    localStorage,
    downloadText,
    document: {
      createElement: () => ({
        addEventListener: () => {},
        appendChild: () => {},
        click: () => {},
        style: {},
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
    },
    FileReader: function () {
      this.readAsText = () => {};
    },
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, "../../tools/shared-prefs.js"), "utf8");
  vm.runInContext(src, ctx);
  return {
    store,
    localStorage,
    downloadCalls,
    loadAutoPrefs: ctx.loadAutoPrefs,
    saveAutoPrefs: ctx.saveAutoPrefs,
    flushAutoPrefs: ctx.flushAutoPrefs,
    clearAutoPrefs: ctx.clearAutoPrefs,
    exportPrefsFile: ctx.exportPrefsFile,
    mergePrefsSettings: ctx.mergePrefsSettings,
    extractStylePrefs: ctx.extractStylePrefs,
    isLabelKey: ctx.isLabelKey,
  };
}

module.exports = { freshContext };
