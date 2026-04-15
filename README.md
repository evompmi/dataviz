# Dataviz — a browser-only data-analysis toolbox for plant scientists

A static web application that performs common plot-and-test workflows used in plant-physiology wet-lab research (aequorin Ca²⁺ time-courses, group comparisons, scatter plots with regression, Venn diagrams, molarity calculations, statistical power analysis) without a server, without tracking, and without data leaving the user's browser. All computation runs client-side in vanilla JavaScript.

**Live application:** [evompmi.github.io/dataviz](https://evompmi.github.io/dataviz)
**Source code:** [github.com/evompmi/dataviz](https://github.com/evompmi/dataviz)

Originally developed for members of the EVO team at the Plant Science Research Laboratory (LRSV, Toulouse, France) and released publicly for anyone with similar needs.

## Design goals

- **Zero infrastructure.** The entire application is a collection of static HTML, CSS, and JavaScript files. It can be served by GitHub Pages, any static host, or opened directly from a local filesystem — no backend, no database, no build step at runtime.
- **Privacy by construction.** Uploaded files are parsed in the browser; no data is ever transmitted. Works offline once the page is loaded.
- **Paste-and-plot ergonomics.** Each tool accepts pasted tabular data or dropped files, auto-detects separators and decimal conventions (comma/period), and walks the user through column assignment, filtering, plotting, and export in a fixed step sequence.
- **Publication-ready output.** Charts render as SVG and can be exported as SVG (vector, grouped and named for downstream editing in Inkscape/Illustrator), PNG (2× raster), or CSV of the processed data.
- **Statistically honest defaults.** Where a tool performs inferential statistics, test selection follows a defensible rule tree (normality + variance homogeneity → parametric vs. non-parametric; equal vs. unequal variance branches) and the full decision trace is reported, not hidden.

## Tools

Each tool ships with an in-app **How to** panel documenting input format, column roles, and features. The table below is a short index.

| Tool               | Purpose                                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aequorin Ca²⁺**  | Luminescence time-course visualisation with optional Ca²⁺ calibration (Allen & Blinks equation, Hill model). Supports baseline correction, per-replicate integral computation, and an inline statistical analysis of the integrals.                                                                   |
| **Group Plot**     | Box plots, violin plots, raincloud plots and bar charts from long- or wide-format data. Automatic selection of Student's t, Welch's t, Mann–Whitney U, one-way / Welch ANOVA, or Kruskal–Wallis, with Tukey HSD, Games–Howell, or Dunn post-hocs and compact-letter display or significance brackets. |
| **Scatter Plot**   | XY scatter with per-row colour, size and shape mapping, user-defined reference lines, row filtering, and optional linear regression overlay with slope / intercept / R² reporting.                                                                                                                    |
| **Venn Diagram**   | Two- and three-set Venn diagrams in either equal-size or area-proportional layout. Proportional layouts are refined by minimising region-area error against the observed intersection sizes. Click any region to extract the underlying members and export them as CSV.                               |
| **Power Analysis** | A-priori and post-hoc statistical power calculations for Student's t (independent, paired, one-sample), one-way ANOVA, χ² goodness-of-fit / independence, and correlation tests.                                                                                                                      |
| **Calculator**     | Molarity and dilution (C₁V₁ = C₂V₂) computations, ligation ratio helper, and batch preparation sheets for routine wet-lab work.                                                                                                                                                                       |

## Shared features

All tools expose the same input handling, data-preview, and export pipeline:

| Feature                | Details                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| **File formats**       | `.csv`, `.tsv`, `.txt`, `.dat` — comma or tab, auto-detected                                              |
| **Decimal convention** | European comma decimals are detected and converted with a banner so users can confirm or undo             |
| **Data preview**       | First 15 rows with column-type hints (numeric / text / mixed) before plotting                             |
| **Column control**     | Rename, reorder, assign roles, filter categorical values                                                  |
| **Export**             | SVG (named `<g>` groups for downstream editing), PNG (2× raster), CSV of the processed / long-format data |
| **Styling**            | Background colour, grid toggle, per-group colour editor, axis labels, plot title                          |

## Statistical validation

The statistical core lives in a single file (`tools/stats.js`, ~1 300 lines) and covers the distributions, tests, effect sizes and post-hoc procedures exercised by the tools:

- **Distributions.** `normcdf`, `norminv`, `tcdf`, `tinv`, `fcdf`, `chi2cdf`, `chi2inv`, non-central `nctcdf`, `ncf_sf`, `ncchi2cdf`.
- **Descriptive.** `sampleMean`, `sampleVariance`, `sampleSD`.
- **Tests.** Shapiro–Wilk, Brown–Forsythe Levene, Student / Welch t, Mann–Whitney U, one-way ANOVA, Welch ANOVA, Kruskal–Wallis.
- **Effect sizes.** Cohen's _d_, Hedges' _g_, rank-biserial _r_, η², ε².
- **Post-hoc.** Tukey HSD (via the studentised range distribution), Games–Howell, Dunn with Benjamini–Hochberg correction, compact letter display.

Every function in this file is cross-validated against **R 4.5** reference values on real built-in R datasets (`iris`, `PlantGrowth`, `ToothGrowth`, `mtcars`, `chickwts`, `InsectSprays`, `sleep`, `CO2`, `warpbreaks`, `faithful`, and others). The reference suite is the R script `benchmark/run-r.R`; the Node comparator is `benchmark/run.js`. Reproduce locally with:

```bash
npm run benchmark
```

The current run executes **285 comparisons, all within 5 × 10⁻³** of the R reference, with a maximum absolute deviation of ≈ 8 × 10⁻⁷. Results are rendered as a publicly visible page at `benchmark.html` — failing rows are shown in red, not hidden.

In addition, the JavaScript code is covered by **485 unit and integration tests** across six suites (shared utilities, CSV / TSV parsing, edge-case integration, React component behaviour, power analysis, statistical functions). All tests are CI-gated on every commit alongside ESLint, Prettier, and `tsc --noEmit` type-checking.

## Scope and limitations

This tool is deliberately narrow. The numerics it ships are cross-validated against R, so what it computes can be trusted — but it covers only a slice of what a research workflow will need!

**Where it fits best**

- **One-way group comparisons** with bar / box / violin / raincloud plots and a defensible test pick (Student / Welch / Mann-Whitney / one-way ANOVA / Welch ANOVA / Kruskal-Wallis), plus Tukey HSD, Games-Howell, or Dunn-BH post-hocs and compact-letter display.
- **Quick exploratory plotting** from pasted CSV/TSV — useful when the alternative is wrestling `ggplot2` margins or installing a 200 MB statistics package for a single bar chart.
- **Privacy-sensitive data** (clinical, unpublished, embargoed) where uploading to a hosted service is not an option and installing R is a hurdle.
- **Publication-ready SVG output** with named `<g>` groups for downstream touch-up in Inkscape or Illustrator.
- **A-priori power analysis** for t-tests, one-way ANOVA, χ², and correlation — like R's `pwr` package for the tests it covers, and easier to explore interactively.
- **Niche tool** Aequorin Ca²⁺ calibration that is not first-class anywhere else.

**Where you will outgrow it**

- **No repeated-measures or mixed models.** Time-course on the same plant, before/after on the same subject, longitudinal data — the tool offers paired t-tests but nothing beyond that. Use R's `lme4` / `nlme` or Prism's RM ANOVA for these designs.
- **One-way only.** No factorial ANOVA, no two-way with interaction, no ANCOVA. Genotype × treatment. If that is a daily need for you, this tool cannot run it.
- **No Dunnett's test** (control vs. many treatments).
- **No regression beyond simple linear.** Multiple regression, logistic regression, non-linear curve fitting (dose-response, Michaelis-Menten, Hill / Boltzmann), spline smoothing are not provided. The Hill model in the Aequorin calibration tool is a fixed-form solver, not a general non-linear fitter.
- **No survival, ROC, or time-to-event analysis.**
- **Partial reproducibility trail.** Group Plot, Aequorin, and Power Analysis ship a one-click `⬇ R` export that emits a runnable R script reproducing the statistical tests: embedded data plus the same `t.test` / `aov` / `oneway.test` / `kruskal.test` / `TukeyHSD` / `rstatix::games_howell_test` / `rstatix::dunn_test` / `pwr::*` calls the tile or result panel just ran. That script can be checked into version control or pasted into a methods section. It does **not** reproduce plots — ggplot code is deliberately out of scope — and it only covers the statistical side. For a full end-to-end methods-to-figures pipeline, an R or Python notebook is still structurally better.
- **Per-group Shapiro-Wilk at α = 0.05 inflates the family-wise false-positive rate** for normality screening at large _k_. This is documented in the source and biases the auto-pick toward Kruskal-Wallis at large _k_ — adjustable via the `alphaNormality` override but worth knowing about.
- **Browser-only** means no large datasets (millions of rows will not work) and no headless / scripted batch processing.

**Summary.** Use this tool as a supplement to R or commercial software (Prism, SPSS, JMP, Stata), not as a replacement. For an undergrad doing simple one-way comparisons and producing thesis figures, the friction savings over R are real and the output is genuinely publication-grade. For a graduate student running factorial designs or repeated measurements, the coverage wall arrives quickly and a real statistics environment is the right tool.

## Installation and local use

The application is a collection of static files. For casual use, visit the hosted version at [evompmi.github.io/dataviz](https://evompmi.github.io/dataviz) — no installation required.

To run entirely offline or to modify the source:

```bash
git clone https://github.com/evompmi/dataviz.git
cd dataviz
# Open index.html in any modern browser. No server is required.
```

Any modern evergreen browser (Chrome, Firefox, Safari, Edge) is sufficient. Internet Explorer is not supported.

## Development

Developers wishing to modify or extend the tools will need Node.js ≥ 20 for the build, test, and cross-validation tooling (not for running the application itself).

```bash
npm install
npm run build       # compile tools/*.tsx → tools/*.js
npm run watch       # recompile on save
npm test            # 485 tests across 6 suites
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format:check
npm run benchmark   # R + JavaScript cross-validation (requires R 4.5)
```

The architecture, shared-code constraints, and conventions for adding new tools are documented in [`CLAUDE.md`](CLAUDE.md).

## Technical stack

| Layer          | Technology                                                                   |
| -------------- | ---------------------------------------------------------------------------- |
| User interface | React 18 (vendored locally under `vendor/`, no CDN)                          |
| Build          | esbuild (TSX → JS, ~5 ms incremental rebuilds, minified + sourcemapped)      |
| Charts         | Custom SVG rendering — no charting library                                   |
| Statistics     | In-house JavaScript implementation, cross-validated against R 4.5            |
| Tests          | Custom lightweight harness (no Jest / Mocha), 485 assertions across 6 suites |
| Hosting        | GitHub Pages (static files)                                                  |

No runtime dependencies are fetched from external CDNs. The `vendor/` directory contains the React and ReactDOM production builds, so a cloned copy of the repository works without network access.

## Citing

If you use Dataviz in published research, please cite the repository. A Zenodo DOI will be minted upon tagged releases and displayed here. In the meantime, the suggested citation is:

> Dataviz — a browser-only data-analysis toolbox for plant scientists. EVO team, LRSV Toulouse. <https://github.com/evompmi/dataviz>

## Acknowledgements

Implementation assisted by Anthropic's Claude (Opus / Sonnet) via Claude Code, under human direction. The author remains responsible for scientific validity; statistical outputs are cross-validated against R 4.5 to keep this accountability checkable rather than nominal.
