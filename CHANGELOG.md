# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Horizontal orientation for Group Plot** — checkbox flips all four plot styles to groups-on-y (ggplot2 `coord_flip()`); annotations, grids, and pies rotate to match. Works in combined and faceted views.
- **Subgroup-by for Group Plot** — dropdown partitions groups into subgroups separated by dashed dividers, with stats computed independently per subgroup. Mutually exclusive with faceting.
- **Group Plot configure step requires group + value columns** — the Filter & Rename button is disabled with a warning banner when either role is missing.
- **R-script export from the Statistics tile** — new `⬇ R` chip in Group Plot and Aequorin emits a runnable `.R` reproducing every test the tile ran (Shapiro, Levene, main test, post-hoc) against the current groups. Per-facet in faceted mode. Closes the no-reproducibility-trail gap called out in the README.
- **R-script export from the Power Analysis result card** — same `⬇ R` chip on the computed-result panel emits a `pwr::*` script mirroring the current config, with the solved-for parameter passed as `NULL`.
- **Dark mode** — sun/moon toggle on the landing page and every tool. Follows `prefers-color-scheme` on first visit to a tool (landing defaults to light), persists in `localStorage`, syncs across iframes. Plot cards stay white so exports render identically in any reader.
- **Component CSS classes** — `tools/components.css` adds `dv-panel`, `dv-input`, `dv-label`, `dv-select`, `dv-btn-*`, `dv-num` with proper `:hover` / `:focus-visible` / `:disabled` states.
- **−/+ numeric steppers** — all `<input type="number">` fields now use a compact stepper with press-and-hold repeat, replacing the native browser arrows.
- **Bar outline controls** — unified outline checkbox + width + color across Group Plot (bar style) and Aequorin inset barplot.
- **Named SVG group ids for Inkscape** — chart exports wrap elements in `<g id="...">` groups (`background`, `grid`, `axis-x`, `data-points`, `legend`, `cld-annotations`, …) so Inkscape users can select by name.
- **Logarithmic value axis for Group Plot** — Y scale dropdown (Linear / Log₁₀ / Log₂ / Ln). Visual-only; stats run on raw data. Zero/negative values clamped with a warning. Works with every style, orientation, facet, and subgroup.
- **Export filenames carry the uploaded file's name** — dropping `analysis1.csv` yields `analysis1_groupplot.svg`, `analysis1_venn_membership.csv`, etc. Faceted exports append the facet category.

### Changed

- **Aequorin plot-page control panel restructured** — sections regrouped (Axes / Labels / Style / Summary barplot), X/Y inputs paired side-by-side, Labels + Style + barplot collapse by default, barplot Show toggle moved to the section header, a11y sweep for real `<label>` elements, Smooth slider gains a `pts` unit, debug column-grouping block removed. Bars now read colour directly from the main conditions — per-condition override dropped.
- **Aequorin control panels are collapsible** — four `PlotControls` sections wrapped in the same disclosure helper boxplot uses, so long condition lists don't overflow the sticky column. Other tools left as-is (fixed control counts).
- **Scatter regression Label position uses mini plot-frame icons** — each corner pill renders a tiny frame with a dot in the matching corner, replacing ↖↗↙↘ arrows.
- **Scatter regression and reference-line checkboxes → Off/On segmented toggles** — consistency pass covering Regression show, Dashed, Show equation, and per-reference-line Dashed.
- **Venn and Aequorin boolean checkboxes → Off/On segmented toggles** — Venn proportional-areas and Aequorin's four inset-barplot booleans now match the boxplot grid toggle.
- **Exclusive selectors across Aequorin / Scatter / Power / Molarity → segmented pills** — consistency pass extending boxplot's pattern. Dropdowns with 5+ options, true booleans, and Molarity's Solve-for column left alone.
- **Bar chart merged into `BoxplotChart`** — the standalone `BarChart` (~400 lines) is now a `plotStyle === "bar"` branch sharing legend, annotation, and facet pipelines. Zero stat regressions.

### Fixed

- **Aequorin Y-axis auto-rescale rounds to 2 decimals** — when adjusting the X window, the recomputed `yMin`/`yMax` were writing 10+ decimal floats into the number inputs. Values are now rounded to `X.XX` so the controls stay legible.
- **Scatter regression default colour is a hex literal** — was leaking `var(--danger-text)` into SVG exports (CSS vars don't belong inside charts per CLAUDE.md).
- **Aequorin inset barplot CLD letters now display (#1)** — `InsetBarplot` was reading `annotations.letters`; `StatsTile` emits `labels`. Letters also moved to a fixed row under the plot frame, matching boxplot.
- **Group Plot enforces one `value` column** — configure step was letting users assign `value` to multiple columns; only the first drove the plot. Now demotes prior assignments to `filter`, matching the existing `group` rule.
- **Dark-mode dim fixes across chrome** — Molarity pills + mode cards, `.dv-disclosure` marker, Aequorin Σ Raw/Corrected pills, `.dv-btn-primary` CTA, Power `From my data`/chip toggles, Aequorin Combined/Faceted toggle, and misc. hardcoded hex leaks. All now use themed `--cta-*` / `--step-active-*` / `--accent-warning` variables that dim in dark mode.
- **`tinv` rewritten** — closed forms for df ≤ 2 and Newton-Raphson with Cornish-Fisher seeding for df ≥ 3. Matches R's `qt()` to machine precision even at extreme quantiles where the old pure-bisection `[-50, 50]` bracket silently clamped.
- **Zero-variance guards across stats** — `tTest`, `tukeyHSD`, `gamesHowell`, `oneWayANOVA`, `welchANOVA`, `leveneTest`, `cohenD`, `hedgesG` now return a populated `error` field instead of silently emitting NaN/Infinity on constant input; `shared-stats-tile.js` already surfaces it.
- **`hedgesG` exact gamma-ratio bias correction** — replaces the asymptotic shortcut. Matches R's `effectsize::hedges_g()` at small-n. Docs clarified on `fFromGroupMeans` (uses population-style SD) and `selectTest` (family-wise α inflation).
- **`sampleVariance` → Welford one-pass; `chi2inv` → Newton-Raphson** — Welford is stable under large offsets; `chi2inv` uses Wilson-Hilferty seeding with bisection fallback, matching R's `qchisq()`.
- **`compactLetterDisplay` and `kruskalWallis` degenerate-input guards** — CLD now skips NaN pairs instead of treating them as significant; Kruskal-Wallis all-tied case returns `NaN` + error instead of the misleading `H = 0, p = 1`.
- **Root-finder bracket expansion in `bisect`, `qtukey`, `powerAnova`** — fixed brackets were silently clamping to stale endpoints. All three now expand as needed; `bisect` refuses unbracketed targets.

## [2.1.1] - 2026-04-13

### Fixed

- **StatsTile test assertions** — updated from `el.type === "div"` to `"Fragment"` after the component switched to returning a fragment.
- **Prettier formatting** — reformatted files flagged by `format:check` in CI.

## [2.1.0] - 2026-04-13

### Added

- **Bar gap control in Group Plot bar style** — 0–80 % slider matching the Box/Violin/Raincloud gap control.
- **Bar width + gap controls in Aequorin inset barplot** — independent sliders for bar width and inter-bar spacing.
- **Show ns toggle for bracket annotations** — when brackets are selected on plot, unchecking Show ns hides non-significant brackets. Absent in CLD mode.

### Changed

- **StatsTile split into two tiles** — "Statistics display" (non-collapsible) holds Display-on-plot / style / Show ns; "Statistics summary" (collapsible) holds Assumptions, Test, Post-hoc, Power, and Download report.
- **Stats-summary SVG print now opt-in** — separate "Print summary below plot" checkbox, unchecked by default, so post-hoc tables don't eat plot space.
- **Plot-page control panels → shared 279 px width** — Group Plot, Aequorin, Scatter, Power (from 328 px); Venn (from 300 px).
- **Dark-mode plot cards dimmed via `filter: brightness(0.85)`** — rendering-only, not serialized into exports.
- **Scatter Color/Size/Shape selectors** dim in dark mode via themed CSS variables.
- **"How to use" tiles** dim in dark mode via four new `--howto-*` variables.
- **Step-nav active pill** dims in dark mode via `--step-active-bg` / `--step-active-border`.
- **Plot frame exported as four named lines** — `plot-frame-top` / `-right` / `-bottom` / `-left` sub-groups so sides can be deleted individually in Inkscape.
- **Venn layout refinement** — iterative circle-position refinement minimising region-area error; a Readability slider blends strict proportionality and balanced layout.
- **Tool top bar redesigned as an icon strip** (`theme-toggle │ home │ <other tools>`) — current tool's icon omitted as the you-are-here marker.
- **Unified download buttons** — single green `⬇ SVG / PNG / CSV / TXT` chip style across all tools.
- **Prominent disclosure indicator** — accent-coloured `>` toggle on collapsible panels, replacing thin unicode carets.
- **"Show ns" off by default** for on-plot significance annotations.
- **Power tool layout** no longer rearranges on narrow viewports — horizontal scroll instead of wrapping.
- **Aequorin inset barplot tile** has a three-state model (hidden / expanded / minimised) with a disclosure toggle; bar, stats, and tile stay mounted across toggles.
- **Aequorin Combined/Faceted toggle** sits as a quiet segmented toggle at the top-right of the plot step.
- **Aequorin "Per replicate" table** is a dedicated tile with a disclosure toggle, collapsed by default.
- **Scatter grid off by default** on new plots.
- **Group Plot rename panel — every group/filter column is reorderable** — drag handles appear on every `group` or `filter` column during the filter step, and per-column orderings are preserved when the column later becomes the primary group or facet.
- **Group Plot enforces a single `group` column** — selecting `group` on a column demotes the previous one to `filter`; previously two `group` assignments were silently allowed.
- **Group Plot stats run per facet** — each facet gets its own `StatsTile`, annotations, and per-facet TXT download. Layout keeps the plot aligned with the summary across facets.
- **StatsTile TXT report named for its context** — `groupplot_stats.txt` / `groupplot_<category>_stats.txt` / `<dataset>_stats.txt`, instead of all writing to `stats_report.txt`.
- **Aequorin plot-step heading** "Plot parameters" → "Time-course parameters".
- **StatsTile disclosure and download** anchored to the header so `⬇ TXT` stays visible when the summary collapses.
- **Landing-page theme toggle** aligned with the rightmost tile of the grid.
- **Aequorin plot step** no longer wraps content in a redundant outer tile.
- **`ActionsPanel` tile title** matches the shared 13 / 600 sidebar heading style.
- **Inward whiskers fixed** — box/violin/raincloud no longer draw whiskers into the box when the interpolated Q3 falls between two points and the larger is an outlier.

### Removed

- **"← Calibration" back button** above Aequorin's plot area (redundant with step navigation).
- **Duplicate theme toggle** inside tool `PageHeader`s — top-bar toggle is the single source of truth.

### Fixed

- **Aequorin plot tiles stayed bright white in dark mode** — outer `ChartTile` / `IntegralTile` now use themed `--surface` / `--border-strong`; the `.dv-plot-card` class moved onto the inner SVG wrappers only.
- **Aequorin Combined/Faceted toggle not responding to clicks** — sticky Sample-selection row was eating clicks; added `width: fit-content` to the sticky wrapper.
- **Aequorin "🔬 Sample selection" overlay showed stale condition names** — now reads edited labels from `conditions` instead of the original CSV headers.
- **Aequorin condition rename lag + stale chart** — split heavy numeric memos from label merges so edits skip the full recompute; added `label` to the `series` memo dep signature so every keystroke updates the legend.
- **Group Plot facet re-render storm** — facet tiles were rebuilding `chartProps` on every parent render. Extracted a memoised `FacetTrio` so each facet only re-renders on its own input changes.
- **Group Plot facet row alignment** — each facet is now its own self-contained wrapper (`--surface-sunken` card). Plot pins to the top, stats display to the bottom; mismatched summary heights stay contained per facet.
- **Aequorin sample selector — unchecking every replicate left the group stuck off** — detecting the forced-off state via `activeColIndices.length === 0` so re-checking a replicate wakes the condition back up.
- **Group Plot facet radio buttons flickered across facets** — per-facet `StatsTile`s shared a hardcoded `name="stats-annot-kind"`, so HTML grouped them as one radio set. Now generated via `React.useId()` per tile instance.
- **Venn region click target** now matches the contoured region — full path, not a ~20 px label circle.
- **Aequorin on-plot annotation ink** matches boxplot's `#222`.
- **Group Plot bar style — "Color by" point colours** — jittered points now pick up the category colour instead of the group shade.
- **Benchmark page theme** stays in sync across tabs, `file://` origins, and bfcache restores.
- **Power tool premature horizontal scrollbar** — removed inherited `min-width: 1100px`.
- **Venn and Power horizontal offset** normalised so `PageHeader` icons align with the top-bar strip.
- **Top-bar theme toggle** now `postMessage`s into iframes instead of relying on the unreliable same-window `storage` event.
- **Venn exports rendered as black blobs in Inkscape** — click-hit circles used `fill="transparent"` (HTML/CSS-only). Swapped to `fill="none" pointer-events="all"`.
- **Aequorin faceted time-course over-dimmed in dark mode** — nested `.dv-plot-card` compounded `filter: brightness()`. Added a `.dv-plot-card .dv-plot-card { filter: none }` override.

## [2.0.0] - 2026-04-12

### Added

- **Load example dataset link** — in bargraph and boxplot upload panels. Drops in a seeded Arabidopsis dataset (72 rows: 3 × 3 × 8 long format) so new users exercise column roles, filters, facets, and ANOVA + Tukey in one click.
- **`tools/stats.js`** — new plain-JS module hosting distribution functions, `bisect`, sample helpers, normality / equal-variance tests (Shapiro-Wilk, Brown-Forsythe Levene), two-sample and k-sample tests (Student/Welch t, Mann-Whitney U, one-way + Welch ANOVA, Kruskal-Wallis), effect sizes (Cohen's d, Hedges' g, η², ε², rank-biserial), post-hocs (Tukey HSD, Games-Howell, Dunn-BH), compact letter display (Piepho 2004), and `selectTest` for the UI's auto-pick. All benchmarked against R at ±5×10⁻³.
- **`StatsTile`** in bargraph and boxplot — collapsible tile running assumption checks, recommending a primary test via `selectTest`, showing post-hoc tables for k ≥ 3, and pushing on-plot annotations (CLD or significance brackets with stacked levels). Hidden for k < 2 or faceted views.
- **Aequorin example dataset** — "Load example dataset" link wired to a real CO7 elicitor time-course (mutant vs WT, calibration at the end). Fetched on click.
- **Aequorin StatsTile** — full analysis tile below the integral barplot, reusing the shared `StatsTile`.
- **Aequorin jitter points** — optional jittered overlay on the integral barplot with color + size controls.
- **Statistical benchmark vs R** — `benchmark/run-r.R` runs 11 tests against built-in R datasets; `benchmark/run.js` reruns them through `stats.js` in a Node VM and emits `benchmark.html` with per-category tables. Failures > 5×10⁻³ render as red rows. Current: 285 comparisons, max |Δ| ≈ 8.2×10⁻⁷.
- **Landing page benchmark link** — replaces the Twain quote with a live test count.

### Changed

- **StatsTile gains a Power analysis section** — observed Cohen's `d` / `f` from the data, achieved power at α = 0.05 (green ≥ 80 %), required n to reach 80 %. Rank tests estimated from parametric analogs, flagged as approximations. Appended to the TXT report.
- **StatsTile gains a "Download report" button** — plain-text export of descriptives, assumptions, chosen test, post-hoc pairs.
- **StatsTile assumptions captions clarified** — "Shapiro-Wilk test for normality" / "Levene (Brown-Forsythe) test for equal variance"; cells show bare values instead of duplicated headers.
- **Bargraph Long/Wide CSV buttons** use the same compact green style.
- **Bargraph chart SVG** uses natural width capped at `100%` instead of stretching edge-to-edge on small datasets.
- **Tool pages** have `min-width: 1100px` so narrow viewports get a horizontal scrollbar instead of breaking layout.
- **Stats summary embedded in SVG** — when Show-on-plot is active, a grey monospace block (test, post-hoc pairs, effect size, n) renders below the legend and is included in SVG/PNG exports.
- **Aequorin plot page restructured** — collapsible time-course tile + single Integral tile with a Raw / Baseline-corrected toggle, per-replicate CSV, and StatsTile. Replaces the dual-barplot layout.
- **Aequorin barplot controls decluttered** — removed Width, Height, X/Y label size, stroke opacity, stroke width; color pickers simplified to fill-only.
- **Calculator tool mobile-friendly** — removes the 1100 px min-width and stacks vertically below 600 px.
- **Merged bargraph into Group Plot** — box/violin/raincloud/bar picked from one dropdown. `bargraph.html` becomes a redirect shim.
- **Power table shows α = 0.05, 0.01, 0.001** — on-screen and in the TXT report.
- **Significance brackets show all pairs** with non-significant labelled "ns".
- **Example dataset balanced** for a mix of significant / non-significant comparisons.
- **Power primitives moved into `stats.js`** — single home for all numeric code. All 217 power tests still pass.

### Removed

- **Bargraph remnants** — `bargraph.tsx`, `bargraph.html`, the `bargraph` icon, `?style=bar` URL handling. Merge into Group Plot complete.

### Fixed

- **Power tool ANOVA n-solver jumped to 100000** for large effect sizes at k ≥ 6 — root cause was `ncf_sf` truncating its Poisson mixture at a fixed ±500-step window. Now widens to ±8σ with a `pUp < 1e-14` early exit and a normal-approx short-circuit for λ > 1000.
- **`gammainc` silently wrong at large `a`** — series loop had a fixed 200-iter cap; at a ≈ 10000 it needs ~780. Scaled the cap with √a. Propagated into `chi2cdf` and large-df F-tails.
- **`ncchi2cdf` truncated Poisson mixture** — same fix as `ncf_sf`: √(halfLam) window + early exit + normal-approx far tail.
- **`BracketPair` missing `pAdj`** in `types/globals.d.ts`.
- **Unused `maxW` parameter** in `renderStatsSummary`.
- **Unused aequorin `insetStrokeColors` props**.
- **Filter panel missing checkboxes** for numeric columns when the user explicitly assigned them a `filter` or `text` role.
- **Calculator tool mobile scrolling** — added `overflow-y: auto` + touch scroll on body; last result tile reachable.

## [1.1.1] - 2026-04-11

### Added

- **Landing page shows real git version** — derived from `git describe --tags` via a build-time script writing `tools/version.js`. Between-tag commits show as `v1.1.0-3-gabcdef`.

### Fixed

- **`kde()` mean-in-reduce bug** — precompute the mean before the variance reduce; bandwidth selection was O(n²) and violin/raincloud on ~10k points hung for seconds. Output unchanged.

## [1.1.0] - 2026-04-11

### Added

- **Source maps** alongside compiled `tools/*.js` for debuggable stack traces.
- **`CHANGELOG.md`** following Keep a Changelog.
- **Error boundary around every tool's root `<App />`** — readable fallback with copyable technical details and reload button, replacing the previous blank-screen crash mode.

### Changed

- **CI and deploy run on Node.js 22** with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` opt-in ahead of GitHub's June 2026 Node 20 deprecation.
- **`ColorInput` accepts 3-digit hex** (`#abc` → `#aabbcc`) and normalises to lowercase 6-digit.
- **README trimmed** to a single overview table; per-tool walkthroughs now live in each tool's How-to panel.

## [1.0.0] - 2026-04-11

First tracked release. Baseline of features shipped to GitHub Pages prior to the introduction of this changelog.

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
