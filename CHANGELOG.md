# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Source maps emitted alongside compiled `tools/*.js` for debuggable stack traces in browser devtools.
- `CHANGELOG.md` following the Keep a Changelog convention.

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

[Unreleased]: https://github.com/evompmi/dataviz/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/evompmi/dataviz/releases/tag/v1.0.0
