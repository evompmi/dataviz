const js = require("@eslint/js");
const globals = require("globals");
const react = require("eslint-plugin-react");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-config-prettier");

const compiledTools = [
  "tools/aequorin/index.js",
  "tools/boxplot/index.js",
  "tools/heatmap.js",
  "tools/lineplot.js",
  "tools/molarity.js",
  "tools/power.js",
  "tools/scatter.js",
  "tools/venn.js",
  "tools/upset.js",
  "tools/version.js",
];

// Names declared at top-level of tools/shared.js, tools/stats.js, and the
// tools/shared-*.js component files, consumed by tool .tsx files via <script>-tag globals.
const sharedGlobals = {
  // shared.js
  hexToRgb: "readonly",
  rgbToHex: "readonly",
  shadeColor: "readonly",
  getPointColors: "readonly",
  PALETTE: "readonly",
  TOOL_ICONS: "readonly",
  toolIcon: "readonly",
  roleColors: "readonly",
  isNumericValue: "readonly",
  seededRandom: "readonly",
  makeExamplePlantCSV: "readonly",
  makeTicks: "readonly",
  makeLogTicks: "readonly",
  autoDetectSep: "readonly",
  fixDecimalCommas: "readonly",
  parseRaw: "readonly",
  guessColumnType: "readonly",
  detectWideFormat: "readonly",
  parseData: "readonly",
  dataToColumns: "readonly",
  wideToLong: "readonly",
  reshapeWide: "readonly",
  parseWideMatrix: "readonly",
  parseSetData: "readonly",
  parseLongFormatSets: "readonly",
  COLOR_PALETTES: "readonly",
  DIVERGING_PALETTES: "readonly",
  interpolateColor: "readonly",
  computeStats: "readonly",
  quartiles: "readonly",
  kde: "readonly",
  computeGroupStats: "readonly",
  fileBaseName: "readonly",
  flashSaved: "readonly",
  svgSafeId: "readonly",
  downloadSvg: "readonly",
  downloadPng: "readonly",
  downloadCsv: "readonly",
  downloadText: "readonly",
  powerTwoSample: "readonly",
  powerPaired: "readonly",
  powerOneSample: "readonly",
  powerAnova: "readonly",
  powerCorrelation: "readonly",
  powerChi2: "readonly",
  fFromGroupMeans: "readonly",
  // shared-color-input.js
  normalizeHexColor: "readonly",
  ColorInput: "readonly",
  FileDropZone: "readonly",
  DataPreview: "readonly",
  computeLegendHeight: "readonly",
  renderSvgLegend: "readonly",
  NumberInput: "readonly",
  SliderControl: "readonly",
  StepNavBar: "readonly",
  CommaFixBanner: "readonly",
  ParseErrorBanner: "readonly",
  PageHeader: "readonly",
  UploadPanel: "readonly",
  ActionsPanel: "readonly",
  scrollIntoViewWithinAncestor: "readonly",
  scrollDisclosureIntoView: "readonly",
  ColumnRoleEditor: "readonly",
  FilterCheckboxPanel: "readonly",
  RenameReorderPanel: "readonly",
  StatsTable: "readonly",
  GroupColorEditor: "readonly",
  BaseStyleControls: "readonly",
  ErrorBoundary: "readonly",
  // shared-prefs.js
  loadAutoPrefs: "readonly",
  saveAutoPrefs: "readonly",
  flushAutoPrefs: "readonly",
  clearAutoPrefs: "readonly",
  exportPrefsFile: "readonly",
  importPrefsFile: "readonly",
  mergePrefsSettings: "readonly",
  extractStylePrefs: "readonly",
  isLabelKey: "readonly",
  PrefsPanel: "readonly",
  // stats.js
  normcdf: "readonly",
  norminv: "readonly",
  gammaln: "readonly",
  betai: "readonly",
  betacf: "readonly",
  gammainc: "readonly",
  gammainc_upper: "readonly",
  tcdf: "readonly",
  tpdf: "readonly",
  tinv: "readonly",
  fcdf: "readonly",
  chi2cdf: "readonly",
  chi2inv: "readonly",
  nctcdf: "readonly",
  ncf_sf: "readonly",
  ncchi2cdf: "readonly",
  bisect: "readonly",
  sampleMean: "readonly",
  sampleVariance: "readonly",
  sampleSD: "readonly",
  rankWithTies: "readonly",
  shapiroWilk: "readonly",
  leveneTest: "readonly",
  tTest: "readonly",
  mannWhitneyU: "readonly",
  cohenD: "readonly",
  hedgesG: "readonly",
  rankBiserial: "readonly",
  oneWayANOVA: "readonly",
  welchANOVA: "readonly",
  kruskalWallis: "readonly",
  etaSquared: "readonly",
  epsilonSquared: "readonly",
  ptukey: "readonly",
  qtukey: "readonly",
  tukeyHSD: "readonly",
  gamesHowell: "readonly",
  bhAdjust: "readonly",
  dunnTest: "readonly",
  compactLetterDisplay: "readonly",
  selectTest: "readonly",
  pStars: "readonly",
  formatP: "readonly",
  StatsTile: "readonly",
  assignBracketLevels: "readonly",
  computePowerFromData: "readonly",
  pairwiseDistance: "readonly",
  hclust: "readonly",
  dendrogramLayout: "readonly",
  kmeans: "readonly",
  // shared-r-export.js
  buildRScript: "readonly",
  buildRScriptForPower: "readonly",
  sanitizeRString: "readonly",
  formatRNumber: "readonly",
  formatRVector: "readonly",
  // theme.js
  ThemeToggle: "readonly",
  useThemeMode: "readonly",
  setTheme: "readonly",
  getTheme: "readonly",
  toggleTheme: "readonly",
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

  // This config file itself + build scripts + benchmark runner (CommonJS, Node).
  {
    files: ["eslint.config.js", ".prettierrc.js", "scripts/**/*.js", "benchmark/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // Tool TSX sources — consume shared globals. Uses the TypeScript parser so
  // ESLint can understand type annotations; actual type-checking is handled
  // separately by `tsc --noEmit`.
  {
    files: ["tools/*.tsx"],
    plugins: { react, "@typescript-eslint": tsPlugin },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "script",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...browserPlus, ...sharedGlobals },
    },
    settings: { react: { version: "18" } },
    rules: {
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "no-unused-vars": "off",
      // TypeScript handles undefined-identifier checks (and understands type-only
      // references like `ColumnRole` from globals.d.ts that ESLint cannot see).
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Hand-written shared plain JS and browser-only helper scripts. These files
  // BOTH define and consume shared globals (the shared-*.js files use styles
  // from shared.js), so we list the shared globals, disable no-redeclare
  // (self-declarations collide with the global list), and disable
  // no-unused-vars (names are consumed via globals).
  {
    files: ["tools/shared.js", "tools/stats.js", "tools/*.js"],
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
