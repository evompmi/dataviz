# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Dark mode** — full light/dark theme with a sun/moon toggle on the landing page and every tool's top bar. First visits to a tool follow `prefers-color-scheme`; the landing page defaults to light regardless of system preference so the gallery reads as a neutral entry point. Choices persist in `localStorage` and sync across the landing page and all open tool iframes. Plot cards stay white in both themes so exported SVG/PNG always render on a white canvas.
- **Component CSS classes** — introduces `tools/components.css` with `dv-panel`, `dv-input`, `dv-label`, `dv-select`, `dv-btn-*`, and the `dv-num` stepper. Adds `:hover`, `:focus-visible`, `:active`, and `:disabled` states that inline styles couldn't express.
- **−/+ numeric steppers** — all `<input type="number">` fields across the tools now render as a compact stepper with `−`/`+` buttons (click or press-and-hold to repeat) replacing the native browser arrows.
- **Bar outline controls in Group Plot (bar style) and Aequorin inset barplot** — unified "Bar outline" checkbox + width slider + color picker across both tools.
- **Named SVG group ids for Inkscape** — every chart export wraps its elements in `<g id="…">` groups with human-readable ids (`background`, `grid`, `axis-x`, `axis-y`, `data-points`, `plot-frame`, `legend`, `cld-annotations`, `significance-brackets`, …) plus per-series ids. Inkscape surfaces these in its Objects panel so users can select and edit grouped elements by name. The shared SVG legend renderer now wraps the whole block in `<g id="legend">` and gives each sub-block its own id — scatter emits `legend-color` / `legend-size` / `legend-shape`, and boxplot/aequorin derive ids from block titles so the individual pieces can be selected independently in Inkscape. `stats-summary` is also now a named group in boxplot exports.

### Changed

- **Plot-page control panels slimmed across every plotting tool to a shared 279 px** — Group Plot, Aequorin, Scatter and Power dropped from 328 px (−15%); Venn dropped from 300 px. Same sticky/scroll behaviour, more horizontal room for the plot area, and every plotting tool now shares the same left-panel width.
- **Dark mode plot cards dim on-screen via `filter: brightness(0.85)`** to stop the white chart canvas from glowing against the dark UI. Exports are unaffected — `filter` is rendering-only and isn't serialized into SVG.
- **Scatter Color/Size/Shape selectors dim in dark mode** — the three aesthetic boxes now read their backgrounds, borders, and header bands from themed CSS variables so the pastel tints are replaced with muted dark-surface equivalents instead of glowing against the dark UI.
- **Plot frame exported as four named lines** — `plot-frame` is now a group containing `plot-frame-top`, `-right`, `-bottom`, `-left` so individual sides can be selected and deleted in Inkscape.
- **Venn diagram refinement** — area-proportional 2- and 3-set layouts now iteratively refine circle positions to minimise region-area error. A "Readability" slider blends between strict proportionality and a visually balanced layout.
- **Tool top bar redesigned as an icon strip** (`theme-toggle │ home │ <other tools>`) so users can jump directly between tools; the current tool's icon is omitted as the "you are here" marker.
- **Unified download buttons** — every downloadable artefact across every tool now uses a single green `⬇ SVG / PNG / CSV / TXT` chip style with consistent hover/press behaviour. Per-tool ad-hoc download buttons have been retired.
- **Prominent disclosure indicator** — collapsible panels (Statistics Summary, Scatter Filters, time-course chart, Per replicate, inset barplot) now show an accent-coloured circular `>` toggle on the left of the header instead of thin unicode carets.
- **"Show ns" off by default** in on-plot statistics annotations so compact-letter displays and significance brackets only label the meaningful comparisons unless the user opts in.
- **Power tool layout** no longer rearranges its tiles on narrow viewports — the body scrolls horizontally when the window is truly too narrow instead of dropping the plot below the controls.
- **Aequorin inset barplot tile** now has a three-state model: hidden (sidebar "Show" unchecked, default), mounted-and-expanded, or mounted-and-minimised via a disclosure toggle in the tile header. Expand/collapse is cheap — the bar plot, stats, and StatsTile stay mounted across toggles. Toggling the sidebar "Show" checkbox back on always re-opens the tile expanded so users don't have to click twice. Also dropped its raw/corrected colour tint in favour of neutral chrome; the `Σ Raw` / `Σ Baseline-corrected` buttons still carry the mode signal.
- **Aequorin Combined/Faceted toggle** sits as a quiet segmented toggle (single bordered container, shared divider, active segment filled accent-blue) pinned to the top-right of the plot step's right column so on landing it shares a row with the sticky Sample-selection pill on the left — it was briefly folded into the sticky header so it followed scroll, but sticking a view-mode switch to the viewport edge while scrolling the plot felt wrong, so it's now an absolutely-positioned static anchor that scrolls away normally while Sample selection alone continues to stick.
- **Aequorin "Per replicate" table** now a dedicated tile with a disclosure toggle; collapsed by default to keep the plot step compact.
- **Scatter grid off by default** — new plots no longer draw grid lines unless the user enables them.
- **Group Plot rename panel — every group/filter column is reorderable up-front** — previously only the primary group column (x-axis) had drag handles in "Rename values & reorder groups"; the "Facet by" column was locked to alphabetical order and only became reorderable _after_ the user picked it in the plot step, which was too late. Now every column with `group` or `filter` role gets its own drag handle during the filter step, and boxplot stores per-column orderings in a single `columnOrders` map keyed by column index. The ordering a user sets on a column is automatically applied whenever that column later becomes the primary group (x-axis) or the "Facet by" column. The shared `RenameReorderPanel` was widened to take an `orderableCols` map with per-column `order` arrays and `onReorder` callbacks; drag state is scoped per column so dragging on one column no longer highlights a matching row in a neighbouring column.
- **Group Plot enforces a single `group` column at the configure step** — selecting `group` on a column now automatically demotes any previously assigned `group` column to `filter`, and the column-roles panel carries an explicit hint that exactly one column can be the x-axis grouping. Previously nothing stopped users from marking two or more columns as `group`, even though only the first one (`colRoles.indexOf("group")`) ever drove the plot — the extra assignments were silent dead ends.
- **Group Plot stats run per facet** — previously, when "Facet by" was on the significance test, CLD/bracket annotations, and the Statistics Summary tile were all disabled: the facet subplots carried no inferential information and the user was stuck. Now each facet gets its own `StatsTile` labelled with the facet category, and the CLD / bracket annotations are drawn on each facet's subplot from its own rows. The stats state is keyed by facet category in a `facetStatsAnnotations` / `facetStatsSummary` map; the non-facet path uses a `"_global"` key so the same maps drive both modes. Each tile still owns its own test override, on-plot toggle, and per-facet TXT download, so users can pick different tests per facet if the distributions call for it. In facet mode the layout is row-per-facet: plot tile and "Statistics display" controls stack in the left column, and the collapsible "Statistics summary" sits in a 320px column on the right — when expanded it fills the full row height and scrolls internally when content overflows, so bottoms always align. The plot tile uses `flex: 1 1 auto` to absorb any extra vertical space that a tall summary forces onto the row, with the SVG centred inside; this keeps the summary's natural expanded height as the anchor and lets short plots "grow" visually to match without deforming. `StatsTile` itself gained three props to support this: a `title` override for the header, a `compact` mode that reduces font sizes and tightens padding for the narrow right column, and a `renderLayout` render-prop that hands the display tile and summary panel to the caller as separate slots. Both `BoxplotChart` and `BarChart` were also adjusted so that toggling "Display on plot" (which embeds a short stats legend inside the SVG) no longer extends the viewBox vertically — `vbH` now stays constant and the inner chart area (`vbH_chart`) shrinks by `_statsH` to make room, so the plot tile's rendered height is identical whether the legend is drawn or not.
- **StatsTile downloaded report is named for its context** — previously every "⬇ TXT" click wrote to `stats_report.txt`, which in facet mode quietly overwrote the previous facet's file with no warning. `StatsTile` now takes an optional `fileStem` prop that drives the filename (sanitized via `svgSafeId`): Group Plot emits `groupplot_stats.txt` in non-facet mode and `groupplot_<category>_stats.txt` per facet, and Aequorin uses `<dataset-basename>_stats.txt`. Tools that don't pass the prop keep the old fallback name.
- **Aequorin plot-step heading** "Plot parameters" → "Time-course parameters" (the panel only controls the time-course chart, not the inset barplot).
- **StatsTile disclosure and report download** are now anchored to the header: the disclosure toggle sits on the left and the `⬇ TXT` button stays visible even when the summary is collapsed.
- **Landing-page theme toggle** aligned with the rightmost tile of the centred grid instead of floating at the page's right edge.
- **Aequorin plot step** no longer wraps its content in a redundant outer tile.
- **Shared `ActionsPanel` tile title** no longer rendered in all-caps — now matches the shared 13 / 600 heading style used by every other left-sidebar tile.

### Removed

- **"← Calibration" back button** above the aequorin plot area (redundant with the top step navigation).
- **Duplicate theme toggle** inside tool `PageHeader`s — the top-bar toggle is now the single source of truth.

### Fixed

- **Aequorin "🔬 Sample selection" overlay showed stale condition names** — the popup's per-group headers were sourced from `colInfo`, which only carries the original CSV headers, so user-edited condition labels from the Condition editor never reached the overlay. The overlay now takes `conditions` as a prop and builds a `prefix → label` map on each render; in pooled mode the group header now shows the edited label (falling back to the prefix if a condition has no override).
- **Aequorin condition rename no longer lags, and commits on every keystroke** — renaming a condition on the Plot step used to stall for a noticeable beat per character, and the chart would only refresh after another toggle was clicked. Root cause #1: the `stats` and `replicateSums` memos listed `conditions` as a dep, so every label edit re-ran the full per-timepoint mean/SD loops over the raw data even though only a label string had changed. Split into a heavy numeric layer (`numericStatsByPrefix`, `replicateSumsByPrefix`) keyed on a `conditionsNumericKey` signature of just the column indices, plus a cheap metadata-merge layer that folds the latest `conditions` back in. Label edits now skip the heavy loops entirely. Root cause #2: the `series` memo's dep signature didn't include `s.label`, so typing in a name field produced a fresh `conditions` array but the memo still returned the old series, which only reconciled when an unrelated state change (e.g. toggling a checkbox) forced re-evaluation. Added `s.label` to the signature so each keystroke immediately re-renders the chart with the new legend label.
- **Group Plot facet mode no longer re-renders every subplot on unrelated stats toggles** — toggling a stats control in one facet used to repaint every other facet's SVG, which was cheap per facet but added up to visible lag when more than a few were on screen. The `FacetBoxplotItem` memo was being defeated because `chartProps` was rebuilt inline on every parent render, so referential equality never held. Extracted a memoised `FacetTrio` component that owns its `chartProps` via `useMemo` keyed only on that facet's own inputs; `svgLegend` is now `useMemo`'d at the list level, and `setAnnotationsFor` / `setSummaryFor` are `useCallback`'d at the app level so their identities don't churn. A facet now only re-renders when its own data or stats state changes.
- **Group Plot facet rows — each facet is now its own self-contained wrapper tile** — in facet mode the plot, "Statistics display" and "Statistics summary" used to sit in a bare two-column flex row per facet. Depending on which stats test each facet ran, the summary column's height varied (Welch ANOVA + post-hoc table + power block is much taller than a t-test result), and because the row used `alignItems: "stretch"` with the plot tile flexing to fill, the SVG drifted inside its card and the display panel lost its bottom-flush alignment — offsets that varied per facet because each facet ran a different test. Wrapped every facet trio in its own outer container (`--surface-sunken` background, bordered, `border-radius: 12`, `padding: 16`) so each facet is visually a single unit and mismatches stay contained inside its own frame instead of propagating across the row. Inside the wrapper the left column uses `flexDirection: "column"` + `justifyContent: "space-between"` with a 16 px gap, so the plot tile sits pinned to the top and the "Statistics display" tile sits pinned to the bottom (matching the wrapper's fixed 16 px inner padding); any extra vertical slack opens as a gap above the display tile rather than floating it off the wrapper bottom. Also dropped `fillHeight` on the facet plot tile so `flex: 1 1 auto` doesn't swallow that slack before `space-between` can distribute it.
- **Aequorin sample selector — unchecking every replicate of a group left it stuck off** — the Plot-step "🔬 Sample selection" panel lets users toggle individual replicate columns. When a user un-checked every replicate of a group (both in the time-course view and in the inset barplot), `applyGrouping` correctly forced that condition's `enabled=false`. But re-checking a replicate afterwards still left the condition disabled: the re-run of `applyGrouping` preserved the previous `enabled=false`, because the code couldn't distinguish "user manually disabled this group in the control panel" from "the sample selector forced it off because every rep was unchecked". Users had to click the condition row in the Condition editor to wake the group back up. Fixed by detecting the forced-off state via `prev.activeColIndices.length === 0`: when a condition had no active columns last time and now has at least one, it's re-enabled automatically rather than inheriting the stale `false`. Manual toggles in the Condition editor are still respected because `activeColIndices` remains populated when a user disables the row by hand.
- **Group Plot faceted stats — radio buttons and "Show ns" flicker across facets** — in facet mode the per-facet `StatsTile`s each rendered their "letters (a/ab/b)" vs. "brackets" radios with a hardcoded `name="stats-annot-kind"`. Because HTML treats all radios sharing a `name` as a single group, clicking a radio in one facet natively un-checked the matching radios in every other facet's tile; React would then restore them on the next render. The symptom: clicking "Show ns" (or any state change that forced a re-render) made the letters/brackets buttons visibly jump between selections, and arrow-key navigation walked across facets. Fixed by generating a unique radio-group name per `StatsTile` instance with `React.useId()`, so each facet's display tile owns an isolated group. Test helpers (`render-loader.js`, `components-loader.js`) grew a `useId` stub so the existing `StatsTile` smoke tests keep running.
- **Venn region click target matches the contoured region** — clicking anywhere inside a region's outline now selects it. Previously the hit zone was a small ~20px circle around the count label, forcing pixel-accurate clicks on the number. The click target is now the full region `<path>` (the same path used to draw the dashed selection contour), with `fill="none" pointer-events="all"` so it stays invisible in SVG exports and in Inkscape.
- **Aequorin on-plot annotation ink** — CLD letters, significance-bracket strokes, and "ns" labels now match boxplot's `#222` so both tools render identical on-plot statistics.
- **Group Plot bar style — point colours under "Color by"** — jittered points on the bar chart now pick up the correct category colour instead of falling through to the group shade.
- **Benchmark page theme** now stays in sync with the rest of the app across tabs, `file://` origins, and bfcache restores.
- **Power tool premature horizontal scrollbar** — removed the inherited `min-width: 1100px` that Power's narrower layout didn't need.
- **Venn and Power horizontal offset** — both tools' content wrappers normalised to match the other plot tools so `PageHeader` icons line up with the top-bar strip.
- **Top-bar theme toggle not reaching the iframe** — toggle now `postMessage`s the theme into every tool iframe instead of relying on the unreliable same-window `storage` event.
- **Venn exports rendered as black blobs in Inkscape** — the per-region click-hit circles used `fill="transparent"`, which is HTML/CSS-only and not a valid SVG 1.1 paint. Inkscape fell back to the default black fill, covering the diagram. Swapped to `fill="none" pointer-events="all"` so the regions stay clickable in the browser and invisible in Inkscape and other SVG readers.
- **Aequorin faceted time-course over-dimmed in dark mode** — each facet is wrapped in a `dv-plot-card` nested inside the outer chart-tile `dv-plot-card`, so the `filter: brightness(0.85)` rule compounded (≈0.72) and made the faceted plots noticeably darker than the combined view. Added a `.dv-plot-card .dv-plot-card { filter: none }` override so the dim applies only to the outermost plot card.

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
