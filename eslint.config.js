const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const prettier = require("eslint-config-prettier");

const compiledTools = [
  "tools/aequorin.js",
  "tools/bargraph.js",
  "tools/boxplot.js",
  "tools/molarity.js",
  "tools/power.js",
  "tools/scatter.js",
  "tools/venn.js",
];

// Names declared at top-level of tools/shared.js and tools/shared-components.js
// and consumed by the tool .jsx files via <script>-tag globals.
const sharedGlobals = {
  // shared.js
  hexToRgb: "readonly",
  rgbToHex: "readonly",
  shadeColor: "readonly",
  getPointColors: "readonly",
  PALETTE: "readonly",
  TOOL_ICONS: "readonly",
  toolIcon: "readonly",
  inp: "readonly",
  inpN: "readonly",
  sec: "readonly",
  lbl: "readonly",
  roleColors: "readonly",
  btnPrimary: "readonly",
  btnSecondary: "readonly",
  btnDanger: "readonly",
  btnDownload: "readonly",
  btnPlot: "readonly",
  selStyle: "readonly",
  sepSelect: "readonly",
  isNumericValue: "readonly",
  seededRandom: "readonly",
  makeTicks: "readonly",
  autoDetectSep: "readonly",
  fixDecimalCommas: "readonly",
  parseRaw: "readonly",
  guessColumnType: "readonly",
  detectWideFormat: "readonly",
  parseData: "readonly",
  dataToColumns: "readonly",
  wideToLong: "readonly",
  reshapeWide: "readonly",
  computeStats: "readonly",
  quartiles: "readonly",
  kde: "readonly",
  computeGroupStats: "readonly",
  flashSaved: "readonly",
  downloadSvg: "readonly",
  downloadPng: "readonly",
  downloadCsv: "readonly",
  // shared-components.js
  ColorInput: "readonly",
  FileDropZone: "readonly",
  DataPreview: "readonly",
  computeLegendHeight: "readonly",
  renderSvgLegend: "readonly",
  SliderControl: "readonly",
  StepNavBar: "readonly",
  CommaFixBanner: "readonly",
  ParseErrorBanner: "readonly",
  PageHeader: "readonly",
  UploadPanel: "readonly",
  ActionsPanel: "readonly",
  ColumnRoleEditor: "readonly",
  FilterCheckboxPanel: "readonly",
  RenameReorderPanel: "readonly",
  StatsTable: "readonly",
  GroupColorEditor: "readonly",
  BaseStyleControls: "readonly",
};

const browserPlus = {
  ...globals.browser,
  React: "readonly",
  ReactDOM: "readonly",
};

module.exports = [
  {
    ignores: ["node_modules/**", "vendor/**", ...compiledTools],
  },

  js.configs.recommended,

  // This config file itself (CommonJS, Node).
  {
    files: ["eslint.config.js", ".prettierrc.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // Tool JSX sources — consume shared globals.
  {
    files: ["tools/*.jsx"],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...browserPlus, ...sharedGlobals },
    },
    settings: { react: { version: "18" } },
    rules: {
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Hand-written shared plain JS. These files BOTH define and consume shared
  // globals (shared-components.js uses styles from shared.js), so we list the
  // shared globals, disable no-redeclare (self-declarations collide with the
  // global list), and disable no-unused-vars (names are consumed via globals).
  {
    files: ["tools/shared.js", "tools/shared-components.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserPlus, ...sharedGlobals },
    },
    rules: {
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Tests run in Node with a custom vm harness.
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  prettier,
];
