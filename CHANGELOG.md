# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **StatsTile disclosure toggle moved to the left of the header** — the "Statistics summary" row used `justifyContent: "space-between"`, pushing its `.dv-disclosure` glyph to the far right of the header while the other two collapsible sections in Aequorin's plot step (the time-course chart, the per-replicate table) had their disclosure icons on the left. Swapped the flex layout to `gap: 10` with the disclosure rendered _before_ the `<h3>`, so all three toggles on the Aequorin plot step now sit in a consistent left-hand column. Shared component lives in `tools/shared-stats-tile.js`, so the boxplot StatsTile inherits the same alignment.
- **Aequorin "Per replicate" table under the inset barplot is now collapsible (and collapsed by default)** — the plot step's `PlotPanel` always rendered a full per-replicate sum table below the inset barplot, which pushed the StatsTile off-screen on smaller viewports even though most sessions only need a quick glance at it. The header row now wraps the "Per replicate" label in a `.dv-disclosure` toggle that flips a local `replicateTableOpen` state inside `PlotPanel`; the `<table>` is only mounted when the row is expanded. The ⬇ CSV download button next to the header stays clickable in either state (with `e.stopPropagation()` so pressing it doesn't also toggle the disclosure). Starts closed on each mount so the plot step opens compact.
- **Prominent disclosure indicator on collapsible panels** — the old `▸`/`▾` unicode carets on the Statistics Summary tile, the Scatter Filters panel, and the Aequorin time-course collapse button were too subtle to read at a glance. A new shared `.dv-disclosure` class in `tools/components.css` renders a 22 px accent-primary filled circle with a bold `>` glyph inside (via `::before`), rotating 90° when the section is open. All three call sites now emit a bare `<span className="dv-disclosure">` (plus `dv-disclosure-open` when expanded) instead of typing a unicode character — future collapsible panels pick up the same visual for free.
- **NumberInput −/+ buttons repeat on hold** — the stepper's `−` and `+` buttons used to fire once per click, so coarse adjustments meant tapping dozens of times. They now press-and-hold: the first bump fires immediately on pointerdown, then after a 400 ms dwell the button starts repeating at ~80 ms per step for the first eight ticks before accelerating to ~40 ms. A window-level `pointerup` / `pointercancel` listener ends the hold even if the user drags the cursor off the button mid-gesture, so the release event is never missed. The active step is tracked in a `useRef` so the `setTimeout` chain survives React re-renders triggered by each fire, and the loop walks its own local counter rather than re-reading the React `value` prop (which would lag behind un-flushed state updates and effectively freeze on the first value). Reaching `min` or `max` auto-stops the repeat; unmount (via the `useEffect` cleanup) also stops it defensively.
- **Numeric inputs now use a −/+ stepper instead of stacked browser arrows** — every genuine `<input type="number">` across the tools (power: 9 sites including the previously un-classed sample-size / groups / df fields; aequorin: 9 sites covering the Allen/generalized/Hill constants, time step, and X/Y range inputs; scatter: the reference-line value) has been replaced with a new shared `NumberInput` component from `tools/shared-ui.js`. It renders a compact `<div class="dv-num">` wrapper containing a `−` button on the left, a borderless `<input type="number">` in the middle with the native WebKit/Firefox spin buttons hidden, and a `+` button on the right. Each button click clamps against `min`/`max` and rounds to the `step`'s decimal precision to avoid float noise. The component mimics the native input's change contract — it fires `onChange({ target: { value: "string" } })` — so existing `(e) => setX(e.target.value)` and `(e) => setX(Number(e.target.value))` handlers migrate unchanged. The `.dv-num-btn` hover state paints the button with `var(--accent-primary)` / `var(--on-accent)`, and a dark-mode rule swaps the resting background to `var(--surface-sunken)` for more contrast against the panel fill. Text inputs that were reusing `className="dv-input-num"` as a generic compact-input style (scatter's axis min/max + labels + title, aequorin's plot title/subtitle + inset auto min/max, power's ratio strings like "3:1" or "10, 12, 15") stay on that class — the class documentation block was updated to make the dual role explicit.
- **Power tool no longer rearranges its tiles on narrow viewports** — the top row (test type + solve-for) and main row (control panel + plot/result column) both had `flexWrap: "wrap"`, so the plot would drop below the controls once the viewport dropped under the combined min-width. The user's expectation is a stable layout with horizontal scroll when the window is truly too narrow. Dropped `flexWrap` from both top-level rows; the left control panel is fixed at 328px (`flexShrink: 0`) and the right plot column has `minWidth: 360`, so the main row's effective min-content width is 708px — when the iframe is narrower than that, the body scrolls horizontally instead of repositioning the plot. The inner solve-for chip row keeps its `flexWrap` since those are small labels.
- **Tool top bar redesigned as an icon strip** — the fixed bar above each tool iframe previously showed `← Back` + the tool's name + icon, even though the same name already appears in the tool's own header. That duplication is gone. The bar is now laid out left-to-right as `theme-toggle │ home │ <other tool icons>` so users can jump directly between tools without bouncing through the landing page; the current tool's icon is intentionally omitted so its absence acts as the "you are here" marker. The left-most button's left padding (27px) is tuned so its glyph center aligns vertically with the tool icon in the `PageHeader` directly beneath it — the bar and the tool now share a visible column. Internally the six per-view topbars are populated at init from a shared `buildTopbar()` function + `TOOL_META` config in `index.html`, so adding or reordering tools in the future means editing one object instead of six duplicated HTML blocks. All icons use `currentColor` so they tint with the button text color and re-accent on hover, and the theme toggle reuses the shared `.tb-icon-btn` class for visual consistency with the rest of the strip.

### Fixed

- **Benchmark page theme out of sync with the rest of the app** — `benchmark.html` had the no-FOUC snippet and linked `theme.css`, so it picked up the stored theme on initial load — but it never loaded `tools/theme.js`, which is where the cross-tab `storage` event listener lives. Opening benchmark in one tab and then toggling the theme on the landing page in another tab left benchmark stuck on its load-time theme; with OS dark mode on and no explicit choice yet, the page appeared "locked in dark." Three layered fixes, applied inside the `benchmark/run.js` template so they survive every regeneration: (1) added `<script src="tools/theme.js"></script>` so benchmark subscribes to the same `dataviz-theme` storage key and re-applies the attribute in-place as soon as the landing page writes it; (2) added a floating sun/moon toggle button in the top-right corner of the benchmark page itself — a plain HTML `<button data-theme-toggle>` paired with a small inline script that calls `setTheme`/`getTheme` from `theme.js`, giving users a direct override from benchmark without having to bounce back to the landing page; (3) replaced the hardcoded summary/badge/row status colors (`#2a7a2a`, `#b22222`, `#d4f0d4`, `#fbe8e8`, etc.) with the shared `--success-*` / `--danger-*` / `--warning-*` CSS variables so pass/fail indicators stay readable against both the light and dark page backgrounds. Also bolted `pageshow` and `visibilitychange` listeners into `tools/theme.js` — they cover the case where a page is restored from the browser's bfcache (back/forward navigation doesn't rerun scripts and silently drops `storage` events that fired while the page was frozen). Finally, `storage` events turned out to still be unreliable in practice (partitioned storage, private-mode windows, coalesced events), so both `tools/theme.js` and the landing page's inline theme script now publish and subscribe on a shared `BroadcastChannel("dataviz-theme")` — when both pages share an origin, every open tab fans theme changes to every other tab synchronously, with the `storage` listener kept only as a fallback for browsers that lack BroadcastChannel. That still leaves the `file://` case: Chrome partitions `localStorage` _per HTML file_ on `file://`, so a user double-clicking `index.html` and clicking the benchmark link lands on a document that literally cannot see the landing page's stored theme (and `BroadcastChannel` is similarly firewalled). The benchmark link on the landing page now appends `?theme=dark|light` at click time, and benchmark's no-FOUC snippet reads the query param first, applies it, writes it to its own partitioned `localStorage`, and then strips the param via `history.replaceState` so the URL stays clean on reload. This cross-origin push handles the file:// case without touching the same-origin BroadcastChannel path. Regenerated `benchmark.html` via `node benchmark/run.js` — the existing `benchmark/results-r.json` was reused, so no R rerun was necessary.
- **Power tool premature horizontal scrollbar** — `tools/power.html` inherited `body { min-width: 1100px }` from the plot-tool convention, but power's own content caps at `maxWidth: 960`, so the iframe would show a horizontal scrollbar whenever the viewport dropped below 1100px even though nothing was actually clipped. Removed the `min-width` for power only; the other plot tools (boxplot, scatter, aequorin, venn) keep it because their plot cards genuinely need that room.
- **Venn and Power tool horizontal offset** — venn's outer wrapper used `padding: "20px 40px"` with `maxWidth: 1200, margin: "0 auto"`, and power used `padding: "32px 24px"` with `maxWidth: 960, margin: "0 auto"`, while the other plot tools use `padding: "24px 32px"` flush-left. Both tools' `PageHeader` icons therefore sat at the wrong viewport x (or drifted further on wide monitors because of the auto-centering), so after the topbar alignment was tuned around the other tools, their icons no longer lined up with the topbar's first button. Normalised both wrappers to `padding: "24px 32px"` and dropped `margin: "0 auto"` so content left-anchors just like the other tools; the respective `maxWidth` caps (1200 / 960) are preserved to keep wide-monitor layouts sensible. Molarity is intentionally left alone — its calculator UI benefits from the narrower centered layout.
- **Duplicate theme toggle inside tools** — each tool was showing two sun/moon toggles: one in the landing page's top bar and a second one in the tool's own `PageHeader`. The `PageHeader` toggle has been removed so only the top-bar toggle remains, matching the landing page's single-toggle layout.
- **Top-bar theme toggle not reaching the iframe** — after removing the duplicate `PageHeader` toggle, clicking the remaining top-bar button only themed the parent document's top bar: the embedded tool iframe stayed in the previous theme. The parent's handler was relying on the cross-frame `storage` event to propagate into iframes, which does not fire in the window that initiated the write. The parent `setTheme` in `index.html` now `postMessage`s a `{ type: "dataviz-theme-set", theme }` payload to every tool iframe (and also tries a direct `contentDocument` write as a fast path); `tools/theme.js` gained a matching `message` listener that calls `_applyThemeAttr` so the whole tool (chrome + panels + stats tiles) re-themes in lockstep with the top bar. `postMessage` is used rather than direct DOM access alone because file:// origins can block cross-frame `contentDocument` reads.

### Added

- **Component CSS classes replace inline-style constants** — introduces `tools/components.css`, a stylesheet that mirrors the former inline-style constants from `tools/shared.js` (`sec`, `inp`, `inpN`, `lbl`, `selStyle`, `sepSelect`, `btnPrimary`, `btnPlot`, `btnDownload`, `btnSecondary`, `btnDanger`) as `dv-panel`, `dv-input`, `dv-input-num`, `dv-label`, `dv-select`, `dv-select-sep`, and the `dv-btn` family. Adds proper `:hover`, `:focus-visible`, `:active`, and `:disabled` states that inline styles cannot express — buttons lift with a colored box-shadow on hover and snap back on press, selects and inputs gain a keyboard focus ring. Wired into every HTML `<head>` alongside `theme.css`. All six tool `.tsx` files and every shared component file (`shared-ui.js`, `shared-core.js`, `shared-long-format.js`, `shared-stats-tile.js`) were migrated — former `style={sec}` / `style={{ ...inp, … }}` / `style={btnPrimary}` usages now read `className="dv-panel"` (plus a residual override-only `style={{}}` when a per-element tweak is needed). The legacy style constants have been deleted from `shared.js`; `roleColors` is the only chrome-related export that remains. `ActionsPanel.extraButtons` descriptors now accept a `className` field so callers can pass `dv-btn-*` classes directly.
- **Dark mode** — the toolbox now has a full light / dark theme. A sun/moon toggle sits on the landing page and in every tool's `PageHeader`; clicking it writes `dataviz-theme` to `localStorage` and the same-origin `storage` event keeps the landing page and every open tool iframe in sync automatically. On a first visit with no stored choice, `prefers-color-scheme` decides. A no-FOUC inline snippet in every HTML `<head>` reads `localStorage` synchronously before first paint, so there is no white flash when loading a dark page. Themes are driven by CSS custom properties declared in `tools/theme.css` (both `[data-theme="dark"]` and a `prefers-color-scheme` media query — duplicated so an explicit user choice always wins over OS preference). The **plot card wrapping each chart is hard-coded to white in both themes** (`--plot-card-bg: #ffffff`), so SVG/PNG exports always sit on a white canvas and chart color palettes — which were chosen against white — render identically regardless of the surrounding theme. Chrome (panels, buttons, inputs, tables, help cards, status banners, stats tiles) was swept across `tools/shared.js`, every `tools/shared-*.js` component, and all six tool `.tsx` files to use `var(--…)` so future UI work automatically themes in both modes. Any element inside `<svg>` (fill / stroke / text fill) was intentionally left as hex literals so export fidelity is preserved. Also: added a full-viewBox `<rect id="background">` to the Power chart and wrapped it in a plot card to match the other tools' SVG export layout.
- **Bar outline controls in Group Plot (bar style) and Aequorin inset barplot** — both tools now expose a "Bar outline" checkbox with an "Outline width" slider (0.2/0.5 – 4 px) and an "Outline color" picker that take effect when the toggle is on. Previously, Group Plot's bar style only had a fixed-group-color outline with a width slider, and the aequorin inset had dead state (`insetStrokeColors`, `insetStrokeOpacity`) that was never wired to any UI and rendered invisibly. The dead state was removed and replaced with the unified toggle/width/color trio so both tools share the same outline UX.

### Changed

- **"Show ns" off by default in StatsTile** — the "Show ns" toggle in the Group Plot and Aequorin inset-barplot statistics tile now starts unchecked, so on-plot annotations (compact letter displays and significance brackets) hide non-significant comparisons unless the user opts in. Previously it defaulted to on, which cluttered plots with "ns" labels for every non-significant pair — the common case where users want to highlight only the meaningful differences.

### Fixed

- **Group Plot bar style — point colors under "Color by"** — when the bar chart style was selected with a color-by column, jittered points were shaded by source index (`getPointColors(groupColor)[si]`) instead of the category color. The per-point lookup read `src.categories?.[vi]` (plural, never set), so the `catColors[cat]` branch was dead code and points always fell through to the group-shade fallback. Changed to `src.category` to match the Box/Violin/Raincloud path and restore proper category coloring.

### Added

- **Named SVG group ids for Inkscape** — all chart SVG exports (venn, scatter, boxplot/bar, aequorin time-course + inset barplot, power) now wrap their elements in `<g id="...">` groups with human-readable ids: `background`, `grid`, `axis-x`, `axis-y`, `data-points` / `groups` / `bars` / `traces` / `ribbons`, `regression-line`, `regression-stats`, `reference-lines`, `reference-line-labels`, `selected-region`, `region-counts`, `cld-annotations`, `significance-brackets`, `plot-frame`, `legend`, `title`, `subtitle`, `x-axis-label`, `y-axis-label`, `stats-summary`, `marker`, `power-curve`, `reference-line`. Per-series/per-group elements also get individual ids (e.g. `set-<name>`, `group-<name>`, `bar-<prefix>`, `trace-<prefix>`, `ribbon-<prefix>`, `count-<names>`, `legend-<name>`) via a new `svgSafeId()` helper in `shared.js` that sanitizes arbitrary strings into valid SVG NCNames. Inkscape shows these ids in its Objects panel and XML editor, so opening an exported SVG lets users select and edit grouped elements by name without hunting through the DOM.

### Changed

- **Venn diagram refinement** — area-proportional layouts for 2- and 3-set diagrams now iteratively refine circle positions to minimize region-area error against the computed intersection sizes. A "Readability" slider blends between strict proportionality and a visually balanced layout when the raw subset counts would collapse regions. Analytic area helpers (`triangleArea`, `chordSegmentArea`, `tripleIntersectionArea`, `computeAllRegionAreas`, `computeLayoutError`) drive the refinement and are cross-validated against Monte Carlo reference values.

## [2.1.1] - 2026-04-13

### Fixed

- **StatsTile test assertions** — three component tests checked `el.type === "div"` but `StatsTile` now returns a `React.Fragment`; updated to `"Fragment"` with a 2-child check.
- **Prettier formatting** — `benchmark.html`, `benchmark/results-r.json`, `benchmark/run.js`, `README.md`, and `tools/shared-components.js` were flagged by `format:check` in CI; reformatted with `--write`.

## [2.1.0] - 2026-04-13

### Added

- **Bar gap control in Group Plot bar style** — a "Bar gap" slider (0–80 %) is now shown when the bar chart style is selected, matching the Box/Violin/Raincloud gap control. Wired into `BarChart`'s SVG-width compact factor so increasing the gap genuinely narrows the chart.
- **Bar width + gap controls in Aequorin inset barplot** — "Bar width" (20–100 %, default 70) and "Bar gap" (0–80 %, default 0) sliders added to the Barplot section. Both affect `halfBar` multiplicatively, giving independent control of bar width and inter-bar spacing.
- **Show ns toggle for bracket annotations** — when "Display on plot" is enabled and brackets are selected in the StatsTile, a "Show ns" checkbox appears. Unchecking it hides non-significant brackets from the chart (for k=2 the annotation disappears entirely; for k>2, only significant pairs are drawn). The control is absent in CLD (compact letters) mode. Default: checked (all brackets shown).

### Changed

- **StatsTile split into two tiles** — "Statistics display" (non-collapsible) holds the Display on plot / style / Show ns controls at all times. "Statistics summary" (collapsible) holds Assumptions, Test, Post-hoc, Power analysis and Download report. Display controls are now always visible without expanding the summary tile.
- **Inward whiskers fixed** — box/violin/raincloud plots no longer draw whiskers pointing into the box when the interpolated Q3 falls between two data points and the larger one is an outlier. `wLo` and `wHi` are now clamped to `[−∞, Q1]` and `[Q3, +∞]` respectively; affected groups show a zero-length whisker cap at the box edge with outlier dots still rendered.

### Fixed

- **ESLint CI** — `benchmark/run.js` (Node globals: `require`, `__dirname`, `console`, `process`) and `tools/aequorin_example.js` (browser global: `window`) were not covered by any ESLint environment block, causing 15 `no-undef` errors in CI. Both files now match the correct environment config.

### Added

- **Statistical benchmark vs R** — `benchmark/run-r.R` runs 11 statistical tests
  (Shapiro-Wilk, Brown-Forsythe Levene, Student/Welch t, Mann-Whitney U, one-way
  ANOVA, Welch ANOVA, Kruskal-Wallis, Tukey HSD, Games-Howell, Dunn (BH)) on real
  built-in R datasets (iris, PlantGrowth, ToothGrowth, mtcars, chickwts,
  InsectSprays, sleep, women, trees, airquality, warpbreaks, faithful, quakes,
  USArrests, swiss, morley, CO2, LakeHuron, attitude, precip, ChickWeight,
  OrchardSprays) and writes reference values + bit-identical inputs to
  `benchmark/results-r.json`. `benchmark/run.js` then loads `tools/stats.js`
  in a Node VM, reruns the same tests on the same inputs, and emits
  `benchmark.html` at the repo root with per-category tables. Failures
  (|Δ| > 5×10⁻³) render as red rows — no whitewashing. Reproduce with
  `npm run benchmark`. Current run: **285 comparisons, all passing, max
  |Δ| ≈ 8.2×10⁻⁷**.
- **Landing page benchmark link** — replaced the Mark Twain quote at the bottom
  of `index.html` with a one-liner advertising the test count and a link to
  `benchmark.html`. Humour doesn't translate; verifiable cross-validation does.

- **Aequorin example dataset** — "Load example dataset" link in the aequorin upload panel, wired to `tools/aequorin_example.tsv` (real CO7 elicitor time-course, mutant vs WT, with Ca²⁺ discharge calibration at the end). Fetched on click so it doesn't bloat the main bundle. New users can see a populated time-course, run Allen & Blinks calibration, and exercise the integral barplot + StatsTile in one click.
- **Aequorin StatsTile** — the aequorin tool now includes a full statistical analysis tile below the integral barplot, reusing the same StatsTile component as Group Plot. Supports Shapiro-Wilk, Levene, recommended test selection, post-hoc tables, compact letter display, and significance brackets — all driven by per-replicate integral sums.
- **Aequorin jitter points** — optional jittered data-point overlay on the integral barplot, with color picker and size slider in the control panel.

### Changed

- **Stats summary embedded in SVG** — when "Show on plot" is active in the StatsTile, a grey monospace text block (test name + result, post-hoc pairs, effect size, sample sizes) is rendered inside the chart SVG below the legend, so it is included in SVG and PNG downloads. Applies to both Group Plot and Aequorin integral barplot.
- **Aequorin plot page restructured** — time-course chart is now collapsible into its own tile. Below it, a single Integral tile with a Raw / Baseline-corrected toggle shows one full-size barplot (auto-sized by condition count), a per-replicate CSV table with download, and the StatsTile. Replaces the previous side-by-side dual-barplot layout.
- **Aequorin barplot controls decluttered** — removed Width, Height, X/Y label size, bar stroke opacity, and bar stroke width controls (overridden or unused). Bar stroke opacity defaults to 0. Condition color pickers simplified to fill-only.
- **Calculator tool mobile-friendly** — removed `min-width: 1100px` from the calculator page only; layouts (Molarity, Dilution, Ligation) stack vertically on screens narrower than 600 px; input fields and "Solve for" buttons reflow for touch use.
- **Merged bargraph into boxplot** — the tool is now called "Group Plot" and offers box, violin, raincloud, and bar chart (mean ± SEM/SD) as plot styles from a single dropdown. The separate bargraph tool is replaced by a redirect to `boxplot.html?style=bar`. Landing page updated with a combined icon and card.
- Power analysis table now shows achieved power and required n at three α levels (0.05, 0.01, 0.001) instead of only α = 0.05. Both the on-screen tile and the downloadable plain-text report are updated.
- Significance brackets now show all pairwise comparisons, including non-significant ones labeled "ns". Previously only significant pairs (p < 0.05) were drawn.
- Example dataset now produces a mix of significant and non-significant comparisons (WT vs abi4 genotype overlap, control vs salt treatment overlap) so users can see all possible statistical outputs including underpowered/NS results.

### Removed

- **Bargraph remnants** — deleted `bargraph.tsx` (1,984-line dead source), `bargraph.html` (redirect shim), the unused `bargraph` icon from `TOOL_ICONS`, and the `?style=bar` URL parameter handling in boxplot. The merge into Group Plot is now complete.

### Fixed

- **TypeScript: `BracketPair` missing `pAdj`** — added the `pAdj` field to the `BracketPair` interface in `types/globals.d.ts`, fixing a `TS2339` error for code that reads adjusted p-values on bracket pairs.
- **Unused `maxW` parameter** in `renderStatsSummary` (boxplot) — removed from signature and call sites.
- **Unused props in aequorin `PlotControls`** — `insetStrokeColors` and `setInsetStrokeColors` were passed but never read; removed from the component and its call site.
- Filter panel now shows checkboxes for numeric columns when the user explicitly assigns them a "filter" or "text" role (e.g. repetition numbers). Previously these columns were hidden with a "numeric — use axis range in plot" message regardless of the assigned role.
- **Calculator tool mobile scrolling** — added `overflow-y: auto` and `-webkit-overflow-scrolling: touch` to the calculator page body, plus bottom padding on mobile, so the last result tile is always reachable by scrolling.

## [2.0.0] - 2026-04-12

### Added

- "Load example dataset" link in the upload panel of **bargraph** and **boxplot**. Drops in a seeded Arabidopsis biomass dataset (72 rows: 3 genotypes × 3 treatments × 8 replicates, long format) so new users can see a populated tool in one click and exercise every downstream feature — column-role editor, filters, rename/reorder, group colors, faceting by Treatment, k=3 ANOVA + Tukey in the stats tile. The generator (`makeExamplePlantCSV` in `tools/shared.js`) uses the existing `seededRandom` so the dataset is reproducible across sessions. Wired via a new optional `onLoadExample` prop on the shared `UploadPanel` component.
- `tools/stats.js` — new plain-JS module loaded via `<script>` tag alongside `shared.js`. Houses the statistical distribution functions (normal / gamma / beta / t / F / chi-square, plus noncentral t/F/chi-square), the generic `bisect` solver, sample helpers (`sampleMean`, `sampleVariance`, `sampleSD`, `rankWithTies`), and the statistical tests needed for the forthcoming analysis tile on bargraph / boxplot, all benchmarked against real R output at ±5×10⁻³ tolerance:
  - **Normality & equal-variance**: Shapiro-Wilk (Royston 1995 AS R94), Brown-Forsythe Levene test
  - **Two-sample**: Student t, Welch t, Mann-Whitney U (normal approx with continuity correction), Cohen's d, Hedges' g, rank-biserial
  - **k-sample**: one-way ANOVA, Welch ANOVA, Kruskal-Wallis, η², ε²
  - **Post-hocs**: Tukey HSD (Tukey-Kramer for unbalanced), Games-Howell, Dunn (BH-corrected), plus `ptukey` / `qtukey` via double Gauss-Legendre quadrature in log-s space, and a generic `bhAdjust`
  - **Compact letter display**: Piepho 2004 insert-and-absorb algorithm for rendering group groupings (e.g. `["a", "ab", "b"]`) following any pairwise post-hoc
  - **`selectTest`**: walks the assumption-check decision tree (Shapiro-Wilk per group, Brown-Forsythe Levene, default α=0.05 on both) and returns the recommended primary test + post-hoc that the UI will offer as the default pick — `{ studentT | welchT | mannWhitney }` for k=2, `{ oneWayANOVA+tukeyHSD | welchANOVA+gamesHowell | kruskalWallis+dunn }` for k≥3. Tiny groups (n<3) fall back to the rank-based option.
  - `tests/stats.test.js` — 99 tests covering primitives, sample helpers, Shapiro-Wilk on 8 datasets (iris, PlantGrowth, sleep, women, mtcars, …), Levene, t-tests, Mann-Whitney, effect sizes, ANOVAs, Kruskal-Wallis, Tukey HSD on PlantGrowth + iris, `ptukey`/`qtukey` scan, Games-Howell, Dunn, BH adjustment, and CLD edge cases.
- `StatsTile` in `tools/shared-components.js` — a collapsible analysis tile wired into the **bargraph** and **boxplot** tools. It runs Shapiro-Wilk + Brown-Forsythe Levene on the plot groups, recommends a primary test via `selectTest` (overrideable from a dropdown), shows the result and a post-hoc table for k≥3, and can push significance annotations back to the chart — compact letter display (default for k≥3) or significance brackets with stacked levels for overlapping spans. Four levels: `* p<0.05`, `** p<0.01`, `*** p<0.001`, `**** p<0.0001`. Brackets use `assignBracketLevels` (greedy by span width) so they stack without colliding, and both charts reserve annotation headroom _inside_ the plot frame by extending `yMax` upward, so brackets / letters sit above the data but still within the black frame. Hidden when fewer than 2 groups or when faceting is active (out of scope for v1). Paired data also out of scope.
  - `tests/components.test.js` — render-smoke tests for `StatsTile` (collapsed/open, k=2, k=3 with post-hoc) and `assignBracketLevels` (non-overlap, overlap stacking, order preservation).

### Changed

- `StatsTile` gains a **Power analysis** section: computes the observed effect size (Cohen's `d` for k=2, Cohen's `f` for k≥3) from the actual data, reports achieved power at α = 0.05 (green ≥ 80%, amber below), and the per-group sample size that would be needed to reach 80% power against the same effect size. Rank-based tests (Mann-Whitney, Kruskal-Wallis) are estimated from their parametric analogs and flagged as approximations. The numbers are also appended to the downloadable text report. Backed by the existing `powerTwoSample` / `powerAnova` / `fFromGroupMeans` primitives — moved out of `tools/power.tsx` into `tools/stats.js` so the StatsTile can share them (217 existing power tests still pass unchanged).
- `StatsTile` gains a "Download report (.txt)" button that exports a plain-text report of the full analysis — group descriptives (n, mean, SD), Shapiro-Wilk per group, Levene, recommended/chosen test + result, and the post-hoc pairs table when k≥3. Fixed-width columns so it reads cleanly in any editor. Backed by a new `downloadText()` helper in `tools/shared.js`.

- StatsTile assumptions section now has clearer captions ("Shapiro-Wilk test for normality" and "Levene (Brown-Forsythe) test for equal variance") above each check, and the normality table's data cells no longer repeat the column headers — cells show bare values (`12`, `0.945`, `0.512`) instead of `n = 12`, `W = 0.945`, `p = 0.512`, matching the post-hoc table's cleaner style.
- Bargraph output panel's "Long CSV" download button now matches the "Wide CSV" button's compact green style instead of the oversized `btnDownload` shared style — the two sibling download buttons are visually consistent.
- Bargraph chart SVG no longer stretches to fill the plot tile. It now uses its natural width (`vbW`, ~100 px per bar + margins) capped at `maxWidth: 100%` and centered via `margin: 0 auto`, matching the boxplot behavior — small datasets render at a sensible size instead of being stretched edge-to-edge.
- Tool pages (`tools/*.html`, all 7) now have `min-width: 1100px` on `body` so narrow viewports get a horizontal scrollbar instead of wrapping/overflowing content — keeps the stats tile, PlotControls sidebar, and chart legible on small windows.
- Power tool's distribution primitives (`normcdf`, `tcdf`, `nctcdf`, `bisect`, …) moved out of `tools/power.tsx` into `tools/stats.js` — single home for all numeric code, no duplication. Power tool consumes them as script-tag globals. All 217 existing power tests still pass unchanged.

### Fixed

- Power tool: one-way ANOVA sample-size solver no longer jumps to 100000 for large effect sizes at k ≥ 6. Root cause was `ncf_sf` in `tools/stats.js` truncating the Poisson mixture at a fixed ±500-step window, which is narrower than σ = √(λ/2) once λ gets large (tens of thousands). Truncated sums returned bogus values around 0.7–0.8 at huge n, violating the monotone-in-n assumption `bisect` depends on and driving it toward `hi = 100000`. Fix widens the Poisson window to ±8σ with a `pUp < 1e-14` early-exit, and adds a normal-approximation short-circuit for the far tails (|z| > 6) when λ > 1000 and d₂ > 4, using the closed-form NCF mean / variance. All 217 existing power tests still pass unchanged.
- `gammainc` (regularized lower incomplete gamma P(a,x)) was silently returning wrong answers for large `a`. The series branch (taken when x ≤ a+1) has a fixed 200-iteration cap, but when x ≈ a the series terms form a Poisson-like bump of effective width √a — at a = 10000 it needs ~780 iterations to converge, so the loop was exiting mid-bump. Observable symptom: `gammainc(10000, 10000) = 0.478` (correct value ≈ 0.501), propagating to `chi2cdf(50000, 50000) = 0.397` (should be 0.5) and every large-df χ² / F tail computation that routes through it. Fix scales the iteration cap with √a on both the series and continued-fraction branches. Found by an audit sweep of stats primitives at extreme parameters after the `ncf_sf` bug.
- `ncchi2cdf` (noncentral χ² CDF) had the same truncated-Poisson-mixture pathology as `ncf_sf`: a fixed ±500-step window around the mode of the Poisson mixture, which is narrower than √(λ/2) once λ gets large. At λ = 100000 the CDF at 3× the mean returned 0.987 instead of 1. Fix widens the Poisson window with √(halfLam), adds a `pUp < 1e-14` early exit, and short-circuits far tails (|z| > 6) via normal approximation using the closed-form noncentral χ² mean (k+λ) and variance (2(k+2λ)).

## [1.1.1] - 2026-04-11

### Added

- Landing page now displays the real git version (derived from `git describe --tags`) instead of a hardcoded string. A build-time script writes `tools/version.js`, which the page loads to set the header badge — so between-tag commits show up as `v1.1.0-3-gabcdef`.

### Fixed

- `kde()` in `tools/shared.js` precomputes the mean before the variance reduce. The previous implementation recomputed the mean inside the outer reduce callback, making bandwidth selection O(n²) — violin / raincloud plots on ~10k+ points would hang for seconds. Behavior-preserving, no change to output.

## [1.1.0] - 2026-04-11

### Added

- Source maps emitted alongside compiled `tools/*.js` for debuggable stack traces in browser devtools.
- `CHANGELOG.md` following the Keep a Changelog convention.
- Error boundary around every tool's root `<App />`. If rendering crashes, the iframe now shows a readable fallback with the error message, a collapsible technical-details panel, a "Reload tool" button, and a "Copy error details" button — replacing the previous blank-screen failure mode.

### Changed

- CI and deploy workflows run on Node.js 22 (current LTS) and opt into the Node 24 action runtime via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` ahead of GitHub's June 2026 deprecation of Node 20 actions.
- `ColorInput` now accepts 3-digit hex (`#abc` → `#aabbcc`) and normalizes any valid hex to lowercase 6-digit form.
- README trimmed: per-tool sections condensed to a single overview table (full feature walkthroughs live in each tool's built-in How-to panel).

## [1.0.0] - 2026-04-11

First tracked release. Baseline of features shipped to GitHub Pages prior to
the introduction of this changelog.

### Added

- Six browser-only tools: Aequorin, Boxplot, Bargraph, Scatter, Venn, Calculators (Molarity, Power).
- Landing page with iframe-loaded tools and vendor prefetch progress bar.
- Shared utilities (`tools/shared.js`) and plain-JS React components (`tools/shared-components.js`).
- CSV/TSV parsing with auto-separator detection and decimal-comma fix.
- SVG / PNG / CSV export from every chart tool.
- Boxplot violin and raincloud plot styles.
- Scatter regression line with stats overlay.
- TypeScript compile-time checking across tool sources (`npm run typecheck`).
- ESLint + Prettier configuration and GitHub Actions CI workflow.
- Minified esbuild output for production bundles.
- Custom test harness with tests across shared utilities, parsing, components, and power calculators.

[Unreleased]: https://github.com/evompmi/dataviz/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/evompmi/dataviz/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/evompmi/dataviz/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/evompmi/dataviz/compare/v1.1.1...v2.0.0
[1.1.1]: https://github.com/evompmi/dataviz/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/evompmi/dataviz/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/evompmi/dataviz/releases/tag/v1.0.0
