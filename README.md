# Dataviz — browser-only data-analysis toolbox for wet-lab scientists

Static web app for common plot-and-test workflows in wet-lab research. No server, no tracking, no data leaving the browser.

**Live:** [evompmi.github.io/dataviz](https://evompmi.github.io/dataviz) · **Source:** [github.com/evompmi/dataviz](https://github.com/evompmi/dataviz)

Originally built for the EVO team at LRSV (Toulouse), released publicly for anyone with similar needs.

## Design goals

- **Zero infrastructure.** Static HTML/CSS/JS. Runs from GitHub Pages, any static host, or directly off the filesystem.
- **Privacy by construction.** All parsing and computation happens in-browser. Works offline once loaded.
- **Paste-and-plot.** Each tool auto-detects separators (`,` / `\t`) and decimal convention (`,` / `.`), then walks through column roles → filter → plot → export.
- **Publication-ready output.** SVG (named `<g>` groups for Inkscape/Illustrator), PNG (2×), CSV of processed data.
- **Honest statistics.** Test picks follow a defensible rule tree (normality + variance → parametric vs. non-parametric); the full decision trace is shown, not hidden.

## Tools

| Tool               | Purpose                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Aequorin Ca²⁺**  | Luminescence time-course with Allen & Blinks / Hill calibration, baseline correction, per-replicate integrals and inline stats.       |
| **Group Plot**     | Box / violin / raincloud / bar with auto-selected test (t / Welch / Mann–Whitney / ANOVA / Welch-ANOVA / Kruskal–Wallis) + post-hocs. |
| **Line Plot**      | Mean ± SEM / SD / 95 % CI per group across a shared x, with per-x significance markers.                                               |
| **Scatter Plot**   | XY with colour / size / shape mapping, reference lines, and optional linear regression overlay.                                       |
| **Heatmap**        | Matrix heatmap with row / column clustering (hierarchical, k-means), dendrograms, and zoomed detail view.                             |
| **Venn Diagram**   | 2–3 set area-proportional Venn with click-to-extract region members.                                                                  |
| **UpSet Plot**     | 4+ set intersection plot — top bar chart, matrix of participation dots, per-set totals. Click a column to inspect its items.          |
| **Power Analysis** | A-priori and post-hoc power for t (indep / paired / one-sample), one-way ANOVA, χ², correlation.                                      |
| **Calculator**     | Molarity, dilution (C₁V₁ = C₂V₂), ligation ratio, batch prep sheets.                                                                  |

Each tool has an in-app **How to** panel.

## Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/aequorin.png?v=2" alt="Aequorin Ca²⁺ time-course">
      <br><sub><b>Aequorin Ca²⁺</b></sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/boxplot.png?v=2" alt="Group plot with significance brackets">
      <br><sub><b>Group Plot</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/lineplot.png?v=2" alt="Line plot">
      <br><sub><b>Line Plot</b></sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/screenshot.png?v=2" alt="Scatter plot">
      <br><sub><b>Scatter Plot</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/screenshots/venn.png?v=2" alt="Venn diagram">
      <br><sub><b>Venn Diagram</b></sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/power.png?v=2" alt="Power analysis">
      <br><sub><b>Power Analysis</b></sub>
    </td>
  </tr>
</table>

## Statistical validation

All numerics (`tools/stats.js`) are cross-validated against **R 4.5** on real built-in datasets (`iris`, `PlantGrowth`, `ToothGrowth`, `mtcars`, …). Current run: **293 comparisons, max |Δ| ≈ 8 × 10⁻⁷**, reproducible via `npm run benchmark`. Results render as a public page at `benchmark.html` — failing rows are shown in red, not hidden.

On top of that, **651 unit + integration tests** (CI-gated on every commit, alongside ESLint, Prettier, and `tsc --noEmit`) plus per-tool fuzz harnesses (`npm run fuzz:<tool>`) that run 2 × 1000 iterations of pathological-input corpus through each tool's pipeline.

Covers: Shapiro–Wilk, Brown–Forsythe Levene, Student / Welch t, Mann–Whitney U, one-way ANOVA, Welch ANOVA, Kruskal–Wallis, Tukey HSD (studentised range), Games–Howell, Dunn + Benjamini–Hochberg, Cohen's _d_, Hedges' _g_, η², ε², compact letter display.

## Scope and limitations

Deliberately narrow. Numerics are trustworthy, but the design covers a slice of real workflows.

**Fits best:** one-way group comparisons with a defensible test pick; quick exploratory plotting from pasted CSV/TSV; privacy-sensitive data; publication-ready SVG; a-priori power analysis; reproducibility via the one-click **⬇ R** script export (Group Plot / Aequorin / Power Analysis emit a runnable R script that embeds the data inline and reproduces the exact tests); niche Aequorin Ca²⁺ calibration not first-class anywhere else.

**You will outgrow it for:** repeated-measures / mixed models, factorial designs (no two-way ANOVA, no interactions, no ANCOVA), Dunnett's test, multiple / logistic / non-linear regression, survival / ROC / time-to-event, large datasets (browser-only, millions of rows won't work), headless batch processing. Per-group Shapiro–Wilk at α = 0.05 inflates family-wise FPR at large _k_ and biases the auto-pick toward Kruskal–Wallis — documented in-source, adjustable via `alphaNormality`.

Use as a supplement to R / Prism / SPSS, not a replacement.

## Installation

For casual use, visit [evompmi.github.io/dataviz](https://evompmi.github.io/dataviz).

To run offline or modify the source:

```bash
git clone https://github.com/evompmi/dataviz.git
cd dataviz
# Open index.html in any modern browser — no server required.
```

## Development

Node.js ≥ 20 for the tooling (not for running the app):

```bash
npm install
npm run build       # compile tools/*.tsx → tools/*.js
npm run watch       # recompile on save
npm test            # 651 tests across 9 suites
npm run fuzz:<tool> # fuzz one tool (boxplot, scatter, heatmap, …)
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run benchmark   # R + JS cross-validation (requires R 4.5)
```

Architecture, shared-code constraints, and conventions for adding tools are in [`CLAUDE.md`](CLAUDE.md).

## Technical stack

React 18 (vendored under `vendor/`, no CDN) + esbuild (TSX → JS, ~5 ms incremental) + custom SVG rendering (no charting library) + in-house stats cross-validated against R. Tests via a custom lightweight harness (no Jest/Mocha). Hosted on GitHub Pages.

No runtime dependencies from external CDNs — `vendor/` ships React + ReactDOM so a cloned copy works without network access.

## Citing

If you use Dataviz in published research, cite the repository. A Zenodo DOI will be minted on tagged releases. Suggested citation:

> Dataviz — a browser-only data-analysis toolbox for plant scientists. EVO team, LRSV Toulouse. <https://github.com/evompmi/dataviz>

## Acknowledgements

Implementation assisted by Anthropic's Claude via Claude Code, under human direction. Statistical outputs are cross-validated against R 4.5 to keep accountability checkable rather than nominal.
