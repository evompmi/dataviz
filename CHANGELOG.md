# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `tools/stats.js` — new plain-JS module loaded via `<script>` tag alongside `shared.js`. Houses the statistical distribution functions (normal / gamma / beta / t / F / chi-square, plus noncentral t/F/chi-square), the generic `bisect` solver, sample helpers (`sampleMean`, `sampleVariance`, `sampleSD`, `rankWithTies`), and the statistical tests needed for the forthcoming analysis tile on bargraph / boxplot, all benchmarked against real R output at ±5×10⁻³ tolerance:
  - **Normality & equal-variance**: Shapiro-Wilk (Royston 1995 AS R94), Brown-Forsythe Levene test
  - **Two-sample**: Student t, Welch t, Mann-Whitney U (normal approx with continuity correction), Cohen's d, Hedges' g, rank-biserial
  - **k-sample**: one-way ANOVA, Welch ANOVA, Kruskal-Wallis, η², ε²
  - **Post-hocs**: Tukey HSD (Tukey-Kramer for unbalanced), Games-Howell, Dunn (BH-corrected), plus `ptukey` / `qtukey` via double Gauss-Legendre quadrature in log-s space, and a generic `bhAdjust`
  - **Compact letter display**: Piepho 2004 insert-and-absorb algorithm for rendering group groupings (e.g. `["a", "ab", "b"]`) following any pairwise post-hoc
  - `tests/stats.test.js` — 90 tests covering primitives, sample helpers, Shapiro-Wilk on 8 datasets (iris, PlantGrowth, sleep, women, mtcars, …), Levene, t-tests, Mann-Whitney, effect sizes, ANOVAs, Kruskal-Wallis, Tukey HSD on PlantGrowth + iris, `ptukey`/`qtukey` scan, Games-Howell, Dunn, BH adjustment, and CLD edge cases.

### Changed

- Power tool's distribution primitives (`normcdf`, `tcdf`, `nctcdf`, `bisect`, …) moved out of `tools/power.tsx` into `tools/stats.js` — single home for all numeric code, no duplication. Power tool consumes them as script-tag globals. All 217 existing power tests still pass unchanged.

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
- Custom test harness with 217 tests across shared utilities, parsing, components, and power calculators.

[Unreleased]: https://github.com/evompmi/dataviz/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/evompmi/dataviz/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/evompmi/dataviz/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/evompmi/dataviz/releases/tag/v1.0.0
