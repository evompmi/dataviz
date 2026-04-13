# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only data visualization toolbox for plant scientists. No server, no build step, no tracking. Deployed as static files via GitHub Pages. All data stays in the user's browser.

Tech stack: React 18 (vendored in `/vendor/`) + esbuild (build-time TSX compilation). Tools render SVG charts from pasted CSV/TSV data.

## Running Tests

```bash
npm test
# Equivalent to running all six test files in sequence:
node tests/shared.test.js       # Utility function tests (color, ticks, seeded random)
node tests/parsing.test.js      # CSV/TSV parsing tests
node tests/integration.test.js  # Edge cases & integration tests
node tests/components.test.js   # Shared React component tests (StatsTile, etc.)
node tests/power.test.js        # Power analysis function tests
node tests/stats.test.js        # Statistical function tests (t-test, ANOVA, post-hocs, etc.)
```

No test framework — custom harness in `tests/harness.js` using `suite()`, `test()`, `assert()`, `eq()`, `approx()`, `throws()`, `summary()`. Exit code 1 on any failure.

## Architecture

### Tool structure
- `index.html` — landing page with tool grid; loads tools in iframes; prefetches vendor scripts with progress bar
- `tools/aequorin.html` — Ca2+ luminescence calibration plots with inset barplot
- `tools/boxplot.html` — group comparison plots (box, violin, raincloud, bar chart) with statistics
- `tools/molarity.html` — molarity/dilution calculator
- `tools/power.html` — statistical power analysis calculator
- `tools/scatter.html` — XY scatter with color/size mapping
- `tools/venn.html` — area-proportional Venn diagrams (2–3 sets) with data extraction
- `benchmark.html` — comparison between R and Toolbox statistical outputs

Each tool HTML loads vendored React/ReactDOM and shared scripts in `<head>`, then loads a compiled `.js` file. The editable source is in `tools/<tool>.tsx` — run `npm run build` to compile.

### Shared code
- `tools/shared.js` — plain JS globals: color helpers, numeric detection, seeded random, axis tick generation, separator detection, CSV parsing, statistics, download helpers, **shared style constants** (`sec`, `inp`, `lbl`, `btnPrimary`, `btnSecondary`, `btnDanger`, `btnDownload`, `btnPlot`, `selStyle`, `sepSelect`, `roleColors`)
- Shared UI split into focused plain-JS files (all `React.createElement`, NOT JSX). Load order matters — see HTML files for the correct `<script>` sequence:
  - `tools/shared-color-input.js` — `normalizeHexColor`, `ColorInput`
  - `tools/shared-file-drop.js` — `FileDropZone` (loaded by: all tools)
  - `tools/shared-svg-legend.js` — `computeLegendHeight`, `renderSvgLegend` (boxplot, aequorin, scatter)
  - `tools/shared-core.js` — `DataPreview`, `ErrorBoundary` (all tools)
  - `tools/shared-ui.js` — `SliderControl`, `StepNavBar`, `CommaFixBanner`, `ParseErrorBanner`, `PageHeader`, `UploadPanel`, `ActionsPanel` (all tools; depends on `shared-file-drop.js`)
  - `tools/shared-long-format.js` — `ColumnRoleEditor`, `FilterCheckboxPanel`, `RenameReorderPanel`, `StatsTable`, `GroupColorEditor`, `BaseStyleControls` (boxplot, aequorin, scatter; depends on `shared-color-input.js`)
  - `tools/shared-stats-tile.js` — `assignBracketLevels`, `StatsTile` (boxplot, aequorin only; depends on `stats.js`)
- `tools/stats.js` — plain JS statistical functions (loaded as `<script>` global):
  - **Distributions**: `normcdf`, `norminv`, `tcdf`, `tinv`, `fcdf`, `chi2cdf`, `chi2inv`, `nctcdf`, `ncf_sf`, `ncchi2cdf`
  - **Helpers**: `gammaln`, `betai`, `betacf`, `gammainc`, `gammainc_upper`, `bisect`
  - **Descriptive**: `sampleMean`, `sampleVariance`, `sampleSD`
  - **Tests**: `shapiroWilk`, `leveneTest`, `tTest`, `mannWhitneyU`, `oneWayANOVA`, `welchANOVA`, `kruskalWallis`
  - **Effect sizes**: `cohenD`, `hedgesG`, `rankBiserial`, `etaSquared`, `epsilonSquared`
  - **Post-hoc**: `ptukey`, `qtukey`, `tukeyHSD`, `gamesHowell`, `dunnTest`, `bhAdjust`, `compactLetterDisplay`
  - **Utilities**: `rankWithTies`, `selectTest`

### Shared code constraint
**All `tools/shared*.js` files and `stats.js` must remain plain JS** (`React.createElement`, not JSX). They are loaded as regular `<script>` tags in each tool HTML so their top-level declarations are available as globals to the compiled tool `.js` files. If they used JSX, they would need their own build step and careful scoping.

### Data flow
File upload/paste -> `autoDetectSep` + `fixDecimalCommas` + `parseRaw` -> `DataPreview` table -> user assigns column roles -> `computeStats`/`quartiles` -> React SVG rendering -> SVG/CSV export

### Per-tool palettes
`PALETTE` is defined in `shared.js` as the global default. Tools may override if needed.

### Tool-internal structure
Each tool's `.tsx` source file follows this pattern:
1. **Chart component** (e.g. `BoxplotChart`, `BarChart`, `ScatterChart`) — the SVG renderer, kept as `forwardRef`
2. **Step sub-components** — `UploadStep`, `ConfigureStep`, `FilterStep`, `OutputStep`, `PlotControls`, `PlotArea` (where applicable)
3. **App()** — orchestrator holding state and routing between steps

### SVG export: named groups for Inkscape
Exported SVGs are routinely re-opened in Inkscape for touch-ups, so **every chart must wrap its elements in `<g id="...">` groups with human-readable ids**. When adding a new chart (or a new element to an existing chart), give the wrapping group a descriptive id so Inkscape users can select it by name from the Objects panel / XML editor.

Conventional ids already used across tools — reuse them for consistency:

- **Structure** — `background`, `plot-area-background`, `plot-frame`, `chart`
- **Axes** — `grid`, `axis-x`, `axis-y`, `x-axis-label`, `y-axis-label`
- **Data** — `data-points`, `groups`, `bars`, `traces`, `ribbons`, `set-circles`, `region-counts`, `power-curve`, `marker`
- **Overlays** — `regression-line`, `regression-stats`, `reference-line`, `reference-lines`, `reference-line-labels`, `selected-region`
- **Annotations** — `cld-annotations`, `significance-brackets`, `stats-summary`
- **Text** — `title`, `subtitle`, `legend`

For per-series / per-group elements, build individual ids with `svgSafeId(name)` (defined in `shared.js` and available as a global to all compiled tools): e.g. `set-${svgSafeId(setName)}`, `group-${svgSafeId(g.name)}`, `bar-${svgSafeId(prefix)}`, `trace-${svgSafeId(prefix)}`. `svgSafeId` sanitizes arbitrary strings into valid SVG NCNames (letters/digits/hyphens/underscores/periods, no leading digit), so it's safe to pass raw user-entered labels.

## Testing helpers

Test helpers in `tests/helpers/` load shared code into Node `vm` contexts with DOM stubs:
- `shared-loader.js` — loads `shared.js` globals
- `parsing-fns.js` — exports parsing functions
- `components-loader.js` — loads all seven `shared-*.js` files and exports component helper functions
- `render-loader.js` — functional React mock for render-smoke testing; loads all seven `shared-*.js` files

When adding new functions to `shared.js`, `stats.js`, or any `shared-*.js` file, export them in the corresponding loader for testability.

## Benchmark suite

```bash
npm run benchmark   # runs R reference suite then cross-validates against JS
```

`benchmark/run-r.R` — computes reference values in R 4.5 for distributions, tests, and post-hocs.
`benchmark/run.js` — Node script that loads `stats.js` and compares against the R output (`benchmark/results-r.json`). Any divergence > tolerance fails with a non-zero exit code.

## Code style & conventions

### JavaScript / TypeScript
- Use `const` / `let` — never `var`. The codebase is ES2022 throughout.
- Arrow functions preferred for callbacks; regular `function` declarations for named top-level functions.
- `tools/*.tsx` files use TypeScript with strict mode **off** (`noImplicitAny: false`) — light typing only. Add types where they add clarity; don't force them everywhere.
- Shared files (`shared.js`, `stats.js`, and all `shared-*.js`) are plain ES2022 script-scope JS. No `import`/`export` — names are globals by design.

### Formatting (Prettier, enforced in CI)
- Print width: 100 columns
- 2-space indentation
- Double quotes for strings
- Semicolons required
- Trailing commas in ES5 positions (arrays, objects, function params)
- Arrow function parentheses always (`(x) => …`)

### Linting (ESLint flat config, enforced in CI)
- `eslint.config.js` defines three environments:
  - **Node/CommonJS** — `eslint.config.js`, `scripts/**/*.js`, `benchmark/**/*.js`, `tests/**/*.js`
  - **Browser + shared globals** — `tools/*.tsx` (TypeScript parser, React plugin)
  - **Browser + shared globals** — `tools/*.js` (hand-written shared files; `no-unused-vars` and `no-redeclare` disabled because names are consumed as globals)
- Compiled outputs (`tools/boxplot.js`, etc.) are in the `ignores` list — never lint generated files.
- `@typescript-eslint/no-unused-vars` warns on unused vars/args in `.tsx` files; prefix with `_` to suppress.

### CI checks (GitHub Actions — `.github/workflows/test.yml`)
All of the following must pass before merging:
1. `npm run lint` — ESLint
2. `npm run format:check` — Prettier dry-run
3. `npm run typecheck` — `tsc --noEmit`
4. `npm test` — all six test files
5. `npm run build` — esbuild compilation

Run them locally in this order before committing to catch issues early.

## Development workflow

```bash
npm run build          # compile tools/*.tsx → tools/*.js (one-shot)
npm run watch          # recompile on save (~5 ms)
npm test               # run all six test files
npm run typecheck      # tsc --noEmit (TypeScript type checking, no emit)
npm run lint           # ESLint
npm run format:check   # Prettier dry-run (used in CI)
npm run format         # Prettier auto-fix
npm run benchmark      # R + JS cross-validation suite
```

Edit `.tsx` source files, run build (or use watch mode), reload in browser. The compiled `.js` files are checked into git for static deployment via GitHub Pages. Do **not** edit the `.js` files directly.
