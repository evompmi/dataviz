# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only data visualization toolbox for plant scientists. No server, no build step, no tracking. Deployed as static files via GitHub Pages. All data stays in the user's browser.

Tech stack: React 18 (vendored in `/vendor/`) + esbuild (build-time JSX compilation). Tools render SVG charts from pasted CSV/TSV data.

## Running Tests

```bash
node tests/shared.test.js      # Utility function tests
node tests/parsing.test.js     # CSV/TSV parsing tests
node tests/integration.test.js # Edge cases & integration tests
```

No test framework — custom harness in `tests/harness.js` using `suite()`, `test()`, `assert()`, `eq()`, `approx()`, `throws()`, `summary()`. Exit code 1 on any failure.

## Architecture

### Tool structure
- `index.html` — landing page with tool grid; loads tools in iframes; prefetches vendor scripts with progress bar
- `tools/aequorin.html` — Ca2+ luminescence calibration plots
- `tools/bargraph.html` — redirects to boxplot.html?style=bar (backward compat)
- `tools/boxplot.html` — group comparison plots (box, violin, raincloud, bar chart)
- `tools/scatter.html` — XY scatter with color/size mapping
- `tools/venn.html` — area-proportional Venn diagrams (2–3 sets) with data extraction

Each tool HTML loads vendored React/ReactDOM and shared scripts in `<head>`, then loads a compiled `.js` file. The editable source is in `tools/<tool>.jsx` — run `npm run build` to compile.

### Shared code
- `tools/shared.js` — plain JS globals: color helpers, numeric detection, seeded random, axis tick generation, separator detection, CSV parsing, statistics, download helpers, **shared style constants** (`sec`, `inp`, `lbl`, `btnPrimary`, `btnSecondary`, `btnDanger`, `btnDownload`, `btnPlot`, `selStyle`, `sepSelect`, `roleColors`)
- `tools/shared-components.js` — plain JS React components (`React.createElement`, NOT JSX):
  - **Inputs**: `ColorInput`, `FileDropZone`, `DataPreview`
  - **Layout**: `SliderControl`, `StepNavBar`, `PageHeader`, `UploadPanel`, `ActionsPanel`
  - **Banners**: `CommaFixBanner`, `ParseErrorBanner`
  - **Long-format pipeline** (boxplot / group plot): `ColumnRoleEditor`, `FilterCheckboxPanel`, `RenameReorderPanel`, `StatsTable`, `GroupColorEditor`
  - **Style helpers**: `BaseStyleControls`
  - **SVG legends**: `computeLegendHeight`, `renderSvgLegend`

### Shared code constraint
**`shared.js` and `shared-components.js` must remain plain JS** (`React.createElement`, not JSX). They are loaded as regular `<script>` tags in each tool HTML so their top-level declarations are available as globals to the compiled tool `.js` files. If they used JSX, they would need their own build step and careful scoping.

### Data flow
File upload/paste -> `autoDetectSep` + `fixDecimalCommas` + `parseRaw` -> `DataPreview` table -> user assigns column roles -> `computeStats`/`quartiles` -> React SVG rendering -> SVG/CSV export

### Per-tool palettes
`PALETTE` is defined in `shared.js` as the global default. Tools may override if needed.

### Tool-internal structure
Each tool's `.jsx` source file follows this pattern:
1. **Chart component** (e.g. `BoxplotChart`, `BarChart`, `ScatterChart`) — the SVG renderer, kept as `forwardRef`
2. **Step sub-components** — `UploadStep`, `ConfigureStep`, `FilterStep`, `OutputStep`, `PlotControls`, `PlotArea` (where applicable)
3. **App()** — orchestrator holding state and routing between steps

## Testing helpers

Test helpers in `tests/helpers/` load shared code into Node `vm` contexts with DOM stubs:
- `shared-loader.js` — loads `shared.js` globals
- `parsing-fns.js` — exports parsing functions
- `components-loader.js` — exports component helper functions

When adding new functions to `shared.js` or `shared-components.js`, export them in the corresponding loader for testability.

## Development workflow

```bash
npm run build          # compile tools/*.jsx → tools/*.js (one-shot)
npm run watch          # recompile on save (~5 ms)
```

Edit `.jsx` source files, run build (or use watch mode), reload in browser. The compiled `.js` files are checked into git for static deployment via GitHub Pages. Do **not** edit the `.js` files directly.
