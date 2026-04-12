# Data Visualization Tool for the EVO Team Members (Toulouse Plant Science)

An entirely vibe-coded application with claude

## Accessible online at [evompmi.github.io/dataviz](https://evompmi.github.io/dataviz)

#### Alternatively, for a pure local use:

Clone the repo and open `index.html` directly in a browser — no server needed.

```bash
git clone https://github.com/evompmi/dataviz.git
cd dataviz
open index.html
```

## Aim and philosophy

- Speed-up your participation to friday drinks by reducing time spent on classical data analysis.
- Drop / click analyses.
- The entire app runs in the browser. There is no backend, no tracking, and no data ever leaves your machine.

## Tools

Each tool has a built-in **How to** panel — open a tool and click the help tab for input format examples and feature walkthroughs.

| Tool               | What it does                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aequorin Ca²⁺**  | Luminescence time-courses with optional Ca²⁺ calibration (Allen & Blinks, Hill). Baseline correction, integral barplot with automatic statistical testing and post-hoc analysis. |
| **Group Plot**     | Box, violin, raincloud, and bar chart styles from one tool. Automatic stats (t-test / ANOVA / non-parametric), post-hoc tables, significance brackets, and compact letters.      |
| **Scatter Plot**   | XY scatter with color / size / shape mapping, reference lines, row filters, and regression overlay.                                                                              |
| **Venn Diagram**   | 2–3 set diagrams (equal-size or area-proportional). Click a region to extract members; export as CSV.                                                                            |
| **Power Analysis** | Sample size & power for t-tests, ANOVA, χ², correlation.                                                                                                                         |
| **Calculator**     | Molarity, dilution (C₁V₁=C₂V₂), ligation ratios, batch prep sheets.                                                                                                              |

## Common Features

All tools share:

| Feature              | Details                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| **Input**            | CSV, TSV, TXT, DAT — comma or tab, auto-detected                            |
| **Data preview**     | First 15 rows with column type hints before plotting                        |
| **Decimal handling** | Auto-detects and fixes comma decimal separators                             |
| **Export**           | SVG (publication-ready vector) + PNG (2x resolution) + CSV (processed data) |
| **Column control**   | Rename columns, assign roles, filter by value                               |
| **Styling**          | Background color, grid toggle, axis labels, plot title                      |

## Stack

|                  |                                                                                |
| ---------------- | ------------------------------------------------------------------------------ |
| **UI**           | React 18 (vendored)                                                            |
| **Build**        | esbuild (JSX compilation, ~5 ms rebuilds)                                      |
| **Charts**       | Custom SVG rendering                                                           |
| **Dependencies** | Vendored locally (`vendor/`) — no CDN, works offline if you clone the repo     |
| **Hosting**      | GitHub Pages (static files)                                                    |
| **Tests**        | 485 tests across 6 suites (utilities, parsing, integration, components, power, stats) |
