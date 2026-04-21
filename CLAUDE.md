# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-only data visualization toolbox for plant scientists. No server, no build step, no tracking. Deployed as static files via GitHub Pages. All data stays in the user's browser.

Tech stack: React 18 (vendored in `/vendor/`) + esbuild (build-time TSX compilation). Tools render SVG charts from pasted CSV/TSV data.

## Running Tests

```bash
npm test
# Runs every tests/*.test.js file in sequence. Current suite:
node tests/shared.test.js       # Utility function tests (color, ticks, seeded random)
node tests/parsing.test.js      # CSV/TSV parsing tests
node tests/integration.test.js  # Edge cases & integration tests
node tests/components.test.js   # Shared React component tests (StatsTile, etc.)
node tests/power.test.js        # Power analysis function tests
node tests/stats.test.js        # Statistical function tests (t-test, ANOVA, post-hocs, etc.)
node tests/prefs.test.js        # Auto-prefs load/save round-trip
node tests/r-export.test.js     # R reproducibility-script builders
node tests/upset.test.js        # UpSet intersection / sort / truncate helpers
```

No test framework — custom harness in `tests/harness.js` using `suite()`, `test()`, `assert()`, `eq()`, `approx()`, `throws()`, `summary()`. Exit code 1 on any failure.

### Fuzz harnesses

Every plot tool has a paired fuzz harness under `tests/fuzz/<tool>.fuzz.js`, wired to `npm run fuzz:<tool>`. These feed the shared pathological-input corpus (`tests/fuzz/generators.js`) through each tool's parse → compute → render pipeline and assert structural invariants, not exact outputs. Run with `FUZZ_SEED=<n>` / `FUZZ_N=<n>` / `FUZZ_QUIET=1` env vars to vary seeds / iteration counts / output. Default cadence is 2 × 1000 iterations; 10k sweeps across seeds 1 / 42 / 999 are expected to report zero crashes before a release.

### Test standards (mandatory for new work)

New features that add user-visible behaviour or data-pipeline logic must ship with tests in the same PR/commit as the feature. The bar varies by what you touched:

- **New shared function** in `shared.js` / `stats.js` / any `shared-*.js` → export from the matching loader in `tests/helpers/` and add unit tests to the appropriate `tests/*.test.js` file (or create a new one if the domain is new).
- **New plot tool** → ships with (a) at least one dedicated `tests/<tool>.test.js` for any non-trivial pure helpers (intersection / aggregation / layout math), and (b) a `tests/fuzz/<tool>.fuzz.js` harness wired into `package.json` as `fuzz:<tool>`. Pattern the fuzz harness after `tests/fuzz/upset.fuzz.js` — load the tool's helpers via a `tests/helpers/<tool>-loader.js` that slices the pure-JS region of the `.tsx` and strips ES `import` lines with a regex filter before `vm.runInContext`.
- **New pure helper inside a tool `.tsx`** → if it's non-trivial (any math, filtering, sorting, layout, label-disambiguation), expose it via the `tests/helpers/<tool>-loader.js` slice and add unit tests. If it's already covered by the tool's fuzz invariants, a fuzz-only addition is acceptable — note this in the PR/commit message.
- **New chart component** → add a render-smoke assertion in `tests/components.test.js` (or the tool-specific fuzz harness) that builds with realistic inputs and confirms it doesn't throw.
- **Bug fix that wasn't caught by existing tests** → add a regression test reproducing the original failure before committing the fix. If a fuzz harness could have caught it, extend the fuzz invariants too.

### Landing-page test counter

`index.html` line ~563 renders a `N internal tests` badge. **Whenever you change the total test count, update this number in the same commit.** The total is the sum of the `X/X passed` lines that `npm test` prints at the end of each suite — grep with `npm test 2>&1 | grep -E "^\s*[0-9]+/[0-9]+ passed"` and add them up. Fuzz iterations do not count (they are randomised); only the deterministic `tests/*.test.js` cases do. Log the bump in `CHANGELOG.md` under `### Added` or `### Changed` alongside whatever drove the new tests.

## Architecture

### Tool structure
- `index.html` — landing page with tool grid; loads tools in iframes; prefetches vendor scripts with progress bar
- `tools/aequorin.html` — Ca2+ luminescence calibration plots with inset barplot
- `tools/boxplot.html` — group comparison plots (box, violin, raincloud, bar chart) with statistics
- `tools/lineplot.html` — profile plot: mean ± error (SEM / SD / 95% CI) per group across shared x, with per-x stats
- `tools/molarity.html` — molarity/dilution calculator
- `tools/power.html` — statistical power analysis calculator
- `tools/scatter.html` — XY scatter with color/size mapping
- `tools/venn.html` — area-proportional Venn diagrams (2–3 sets) with data extraction
- `benchmark.html` — comparison between R and Toolbox statistical outputs

Each tool HTML loads vendored React/ReactDOM and shared scripts in `<head>`, then loads a compiled `.js` file. The editable source is in `tools/<tool>.tsx` — run `npm run build` to compile.

### Shared code
All shared browser globals are concatenated at build time into a single
`tools/shared.bundle.js` by `scripts/build-shared.js` (runs in `prebuild`,
`prewatch`, and `pretest`). Every HTML loads **one** `<script src="shared.bundle.js">`;
HTML files never list individual shared files. The canonical load order is the
`FILES` array at the top of `scripts/build-shared.js` — if you add a new shared
file, add it there, nowhere else.

Source files live side-by-side in `tools/` and stay the editable units:
- `tools/shared.js` — plain JS globals: color helpers, numeric detection, seeded random, axis tick generation, separator detection, CSV parsing, statistics, download helpers, `roleColors` (chrome styling lives in `tools/components.css` via `dv-*` classes; see the Theming section)
- Shared UI split into focused plain-JS files (all `React.createElement`, NOT JSX):
  - `tools/shared-color-input.js` — `normalizeHexColor`, `ColorInput`
  - `tools/shared-file-drop.js` — `FileDropZone`
  - `tools/shared-svg-legend.js` — `computeLegendHeight`, `renderSvgLegend`
  - `tools/shared-core.js` — `DataPreview`, `ErrorBoundary`
  - `tools/shared-ui.js` — `SliderControl`, `StepNavBar`, `CommaFixBanner`, `ParseErrorBanner`, `PageHeader`, `UploadPanel`, `ActionsPanel` (depends on `shared-file-drop.js`)
  - `tools/shared-prefs.js` — `loadAutoPrefs`, `saveAutoPrefs`, `exportPrefsFile`, `importPrefsFile`, `clearAutoPrefs`, `PrefsPanel` — persists per-tool plot render settings to `localStorage` and to a portable `.json` file (depends on `shared.js`)
  - `tools/shared-long-format.js` — `ColumnRoleEditor`, `FilterCheckboxPanel`, `RenameReorderPanel`, `StatsTable`, `GroupColorEditor`, `BaseStyleControls` (depends on `shared-color-input.js`)
  - `tools/shared-r-export.js` — R reproducibility-script builders used by the download tiles in each plot tool
  - `tools/shared-stats-tile.js` — `assignBracketLevels`, `StatsTile` (depends on `stats.js`)
  - `tools/theme.js` — theme toggle wiring + `ThemeToggle` React component (runs first so its `data-theme-toggle` listener is live before any tool mounts)
- `tools/stats.js` — plain JS statistical functions (loaded as `<script>` global):
  - **Distributions**: `normcdf`, `norminv`, `tcdf`, `tinv`, `fcdf`, `chi2cdf`, `chi2inv`, `nctcdf`, `ncf_sf`, `ncchi2cdf`
  - **Helpers**: `gammaln`, `betai`, `betacf`, `gammainc`, `gammainc_upper`, `bisect`
  - **Descriptive**: `sampleMean`, `sampleVariance`, `sampleSD`
  - **Tests**: `shapiroWilk`, `leveneTest`, `tTest`, `mannWhitneyU`, `oneWayANOVA`, `welchANOVA`, `kruskalWallis`
  - **Effect sizes**: `cohenD`, `hedgesG`, `rankBiserial`, `etaSquared`, `epsilonSquared`
  - **Post-hoc**: `ptukey`, `qtukey`, `tukeyHSD`, `gamesHowell`, `dunnTest`, `bhAdjust`, `compactLetterDisplay`
  - **Utilities**: `rankWithTies`, `selectTest`

### Shared code constraint
**All `tools/shared*.js` files, `theme.js`, and `stats.js` must remain plain JS** (`React.createElement`, not JSX). They are concatenated into `tools/shared.bundle.js` with no transform, so their top-level declarations are available as globals to the compiled tool `.js` files. If they used JSX, they would need their own build step and careful scoping.

**If you add a new shared file:** create it under `tools/`, add its filename to the `FILES` array in `scripts/build-shared.js` (in the correct load order), and run `npm run build:shared` (or any `npm run build` / `npm test` — both regenerate the bundle first). HTML files stay unchanged.

**If you edit an existing shared file:** run `npm run build:shared` (or leave `node scripts/build-shared.js --watch` running in a second terminal alongside `npm run watch`). `npm run build` / `npm test` regenerate it automatically via their `pre*` hooks.

The bundle is checked into git (same convention as the compiled tool `.js` files) so the static GitHub Pages deploy keeps working without a server-side build.

### Theming (light / dark)
Theme switching is driven by CSS custom properties on `:root`, toggled via a `data-theme="dark"` attribute on `<html>`. The full palette lives in `tools/theme.css` (source of truth for every variable). Theme state is persisted in `localStorage` under `dataviz-theme`; a no-FOUC inline `<script>` in every HTML `<head>` reads it synchronously before first paint. On the very first visit with no stored choice, the `prefers-color-scheme` media query decides. A `ThemeToggle` button lives in `PageHeader` (all tools) and on the landing page; `storage` events sync toggles across all open same-origin iframes for free.

**Rule for contributors: chrome colors use `var(--name)`, SVG colors stay as literals.** Every inline `style={{ … }}` on a React element that is *not* inside a chart component (`<svg>`, `<rect>`, `<path>`, `<text>`, etc.) must reference CSS variables so it themes correctly. Element fills, strokes, and text fills *inside* SVG must stay as hex literals so exported SVG/PNG charts render the same way on any reader — the plot card wrapping each chart is hard-coded to `var(--plot-card-bg)` which resolves to white in both themes, so charts always sit on a white canvas.

Common variables: `--page-bg`, `--surface`, `--surface-subtle`, `--surface-sunken`, `--text`, `--text-muted`, `--text-faint`, `--border`, `--border-strong`, `--accent-primary`, `--accent-plot`, `--accent-download`, `--accent-dna`, `--on-accent`, `--plot-card-bg`, `--plot-card-border`, `--info-bg`/`--info-text`/`--info-border`, `--success-bg`/`--success-text`/`--success-border`, `--warning-bg`/`--warning-text`/`--warning-border`, `--danger-bg`/`--danger-text`/`--danger-border`, `--neutral-bg`/`--neutral-text`, `--subhead-bg`/`--subhead-text`. See `tools/theme.css` for the full list and the dark overrides.

### Data flow
File upload/paste -> `autoDetectSep` + `fixDecimalCommas` + `parseRaw` -> `DataPreview` table -> user assigns column roles -> `computeStats`/`quartiles` -> React SVG rendering -> SVG/CSV export

### Per-tool palettes
`PALETTE` is defined in `shared.js` as the global default. Tools may override if needed.

### Tool-internal structure
Each tool's `.tsx` source file follows this pattern:
1. **Chart component** (e.g. `BoxplotChart`, `BarChart`, `ScatterChart`) — the SVG renderer, kept as `forwardRef`
2. **Step sub-components** — `UploadStep`, `ConfigureStep`, `FilterStep`, `OutputStep`, `PlotControls`, `PlotArea` (where applicable)
3. **App()** — orchestrator holding state and routing between steps

### Shared plot-tool scaffold (`tools/_shell/`)
All seven plot tools (UpSet, Venn, Lineplot, Scatter, Heatmap, Aequorin, Boxplot) use the shared scaffold under `tools/_shell/`. Unlike the plain-JS `shared-*.js` globals, these are TypeScript modules imported via `import { … } from "./_shell/…"` and resolved by esbuild when bundling each tool.

- `tools/_shell/usePlotToolState.ts` — `usePlotToolState<TVis>(toolKey, initialVis)` typed hook. Owns step state, upload fields (`fileName`, `parseError`, `sepOverride`, `commaFixed`, `commaFixCount`), and the `vis` reducer with auto-prefs persistence (`loadAutoPrefs` on init, `saveAutoPrefs` on change, `_reset` sentinel for reset-to-defaults).
- `tools/_shell/PlotToolShell.tsx` — outer page frame. Renders `PageHeader` (with `PrefsPanel` in the right slot), `StepNavBar`, `CommaFixBanner`, `ParseErrorBanner`, then delegates to `children`. Takes the hook's return as a `state` prop.
- `tools/_shell/ScrollablePlotCard.tsx` — horizontal-scroll affordances (edge fades + "Scroll for more →" pill driven by `ResizeObserver`). Used by UpSet today; `venn.tsx` and `heatmap.tsx` still ship local copies that will migrate in a follow-up pass.

**Standard wiring pattern** (every migrated tool follows this shape — start from `tools/upset.tsx` as the canonical reference):

```tsx
import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";

const { useState /* , useReducer, useMemo, ... */ } = React;

const VIS_INIT_<TOOL> = { /* persisted vis props */ };

function App() {
  const shell = usePlotToolState("<toolkey>", VIS_INIT_<TOOL>);
  const { step, setStep, fileName, setFileName, setParseError,
          sepOverride, setSepOverride, setCommaFixed, setCommaFixCount,
          vis, updVis } = shell;
  // tool-specific state (parsedRows, colRoles, filters, selection, …) stays local
  return (
    <PlotToolShell state={shell} toolName="…" title="…" subtitle="…"
                   visInit={VIS_INIT_<TOOL>} steps={[…]} canNavigate={…}>
      {/* step content */}
    </PlotToolShell>
  );
}
```

Key conventions:

- Hoist `VIS_INIT_<TOOL>` to **module scope** (not inside `App()`) so `usePlotToolState` can use it as both the reducer initial state and the `_reset` target.
- Tool-specific state (parsed rows, selection, tool-only reducers like boxplot's `statsUi` or heatmap's `cellBorder`) stays inline in `App()` — the scaffold intentionally does not become a kitchen sink.
- If a tool needs a dual-variant parse banner (e.g. aequorin's yellow "⚠️" warning vs. red error), keep `parseError` as **local** state and render the custom banner as `PlotToolShell` children; the shared `ParseErrorBanner` only renders the red error variant.

**esbuild flags matter.** The build command in `package.json` uses `--bundle --format=esm --minify-syntax --minify-whitespace --sourcemap`. `--bundle` inlines `_shell/*` imports so the tool loads from a classic `<script>` tag; `--format=esm` avoids IIFE wrapping (which would hide chart consts like `BoxplotChart` from render-smoke tests); `--minify-syntax --minify-whitespace` (not `--minify`) preserves top-level identifier names so the render harness can find them. Do not change these without also updating the render-smoke test harness.

**Test-loader gotcha.** Several fuzz helpers (`tests/helpers/<tool>-loader.js`) slice the top of a tool's `.tsx` and run it under `vm.runInContext` in script mode. Script mode can't parse ES `import` statements. After migration, these loaders strip `import` lines with a regex filter (`.filter((line) => !/^\s*import\s/.test(line))`) before `runInContext`. When editing a migrated tool's header region, check that the slice cutoff still covers the helper region the loader needs.

**If you add a new plot tool**, start by copying `tools/upset.tsx` and adapting the chart + step content. Do not re-derive the scaffold.

### SVG export: named groups for Inkscape
Exported SVGs are routinely re-opened in Inkscape for touch-ups, so **every chart must wrap its elements in `<g id="...">` groups with human-readable ids**. When adding a new chart (or a new element to an existing chart), give the wrapping group a descriptive id so Inkscape users can select it by name from the Objects panel / XML editor.

Conventional ids already used across tools — reuse them for consistency:

- **Structure** — `background` (full SVG canvas rect, wrapped in a group), `plot-area-background` (inner rect inside the chart margins), `plot-frame` (border around the data area), `chart` (transformed wrapper holding the data + axes)
- **Axes** — `grid`, `axis-x`, `axis-y`, `x-axis-label`, `y-axis-label`
- **Data** — `data-points`, `groups`, `bars`, `traces`, `ribbons`, `set-circles`, `region-counts`, `power-curve`, `marker`, `error-bars`, `cells` (heatmap)
- **Overlays** — `regression-line`, `regression-stats`, `reference-line`, `reference-lines`, `reference-line-labels`, `selected-region`, `selection-mask` (heatmap)
- **Annotations** — `cld-annotations`, `significance-brackets`, `significance-stars`, `stats-summary`, `subgroup-separators`, `subgroup-labels`
- **Text** — `title`, `subtitle`, `legend`, `row-labels` (heatmap), `col-labels` (heatmap)
- **Heatmap-specific** — `col-dendrogram`, `row-dendrogram`, `col-cluster-strip`, `row-cluster-strip`, `colorbar`

For per-series / per-group elements, build individual ids with `svgSafeId(name)` (defined in `shared.js` and available as a global to all compiled tools): e.g. `set-${svgSafeId(setName)}`, `group-${svgSafeId(g.name)}`, `bar-${svgSafeId(prefix)}`, `trace-${svgSafeId(prefix)}`, `ribbon-${svgSafeId(prefix)}`, `points-${svgSafeId(name)}`, `errbars-${svgSafeId(name)}`, `cell-${svgSafeId(rowLabel)}-${svgSafeId(colLabel)}`. `svgSafeId` sanitizes arbitrary strings into valid SVG NCNames (letters/digits/hyphens/underscores/periods, no leading digit), so it's safe to pass raw user-entered labels.

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

### Pre-commit hook

A native git hook at `scripts/hooks/pre-commit` rebuilds and re-stages any drifted compiled outputs (`tools/*.js`, `tools/*.js.map`, `tools/shared.bundle.js`, `tools/version.js`) whenever staged changes touch source that affects the build: `tools/*.tsx`, `tools/<tool>/helpers.ts`, `tools/_shell/*`, `tools/shared*.js`, `tools/stats.js`, `tools/theme.js`, or the `scripts/build-*.js` themselves. This catches sourcemap drift at commit time instead of at CI/merge time (a real issue: `_shell/*` content is inlined into every tool's `.js.map` via `sourcesContent`, so a `_shell/*` edit invalidates all seven tool maps).

The hook installs automatically via `npm install` (`prepare` script runs `scripts/hooks/install.js`, which points `git config core.hooksPath` at `scripts/hooks/`). Bypass with `git commit --no-verify` if you genuinely need to commit without rebuilding.

## CHANGELOG.md

**Any user-visible change must be logged in `CHANGELOG.md` under `## [Unreleased]`** before the commit that ships it, using the Keep a Changelog sections (`Added` / `Changed` / `Fixed` / `Removed`). This applies to bug fixes, new features, UI tweaks, and behavior changes — not to internal refactors or test-only edits. Entries should be one paragraph, lead with a bold title, and explain both *what* changed and *why* / *how* so a future reader can reconstruct the fix without reading the diff. Don't wait to be asked — update the changelog in the same commit as the code change.
