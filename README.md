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
- Drop / click analyses
- The entire app runs in the browser. There is no backend, no tracking, and no data ever leaves your machine.

## Tools collection

### Aequorin Ca²⁺ Calibration (simple linegraph when no calibration is used)
Luminescence time-course plots with optional Ca²⁺ concentration calibration.

- Calibration formulas:
  - **None** — raw RLU values
  - **Allen & Blinks (1978)** — `[Ca²⁺] = ((1+Ktr)·f^(1/n) − 1) / (Kr·(1−f^(1/n)))`
  - **Hill equilibrium** — `[Ca²⁺] = Kd · (f/(1−f))^(1/n)`
  - **Generalised Allen & Blinks** — variable Hill exponent
- Adjustable calibration constants (Kr, Ktr, Kd, n)
- Baseline correction, per-replicate summation
- Inset bar plot of summed/calibrated values
- **Condition toggle**: enable/disable conditions from the plot panel, synced with sample selector
- **Sample selector**: per-column enable/disable with pool/individual modes

---

### Boxplot
Distribution plots with median, IQR, and whiskers.

- Accepts wide and long CSV/TSV
- Color individual points by a secondary categorical column
- Facet into separate charts by a category column
- Show/hide jittered data points
- Per-group color picker, box width/opacity, y-axis range control
- **Condition toggle**: check/uncheck groups to include or exclude from the plot
- Composition pie charts beneath each group (when color-by is active)
- Summary stats output: n, median, Q1/Q3, IQR, whiskers

---

### Bar Graph
Mean ± error bar plots with optional jittered point overlays.

- Accepts **wide** (columns = groups) and **long** (group + value columns) CSV/TSV
- Error bars: SEM or SD
- Overlay individual data points with configurable jitter
- Color individual points by a secondary categorical column
- Facet into separate charts by a category column
- Per-group color picker, x-axis label rotation, bar width/opacity controls
- **Condition toggle**: check/uncheck groups to include or exclude from the plot

---

### Scatter Plot
XY scatter plots with continuous and categorical aesthetic mappings.

- **Streamlined interface**: X and Y column dropdowns directly on the plot page (no separate configure step)
- **Color mapping**: 8 continuous palettes (viridis, plasma, RdBu, etc.) or discrete per-category
- **Size mapping**: continuous radius scaling or discrete per-category
- **Shape mapping**: discrete shapes (circle, square, triangle, cross) by category
- Auto-fill axis ranges when scale inputs are cleared
- Reference lines (horizontal or vertical, labeled)
- Row filtering by any column value
- Gradient, discrete color, and shape legends

---

## Common Features

All tools share:

| Feature | Details |
|---|---|
| **How to** | Built-in help panel to get you started |
| **Input** | CSV, TSV, TXT, DAT — comma or tab, auto-detected |
| **Data preview** | First 15 rows with column type hints before plotting |
| **Decimal handling** | Auto-detects and fixes comma decimal separators |
| **Export** | SVG (publication-ready vector) + PNG (2x resolution) + CSV (processed data) |
| **Column control** | Rename columns, assign roles, filter by value |
| **Styling** | Background color, grid toggle, axis labels, plot title |

---

## Stack

| | |
|---|---|
| **UI** | React 18 (vendored) |
| **Build** | esbuild (JSX compilation, ~5 ms rebuilds) |
| **Charts** | Custom SVG rendering |
| **Dependencies** | Vendored locally (`vendor/`) — no CDN, works offline if you clone the repo |
| **Hosting** | GitHub Pages (static files) |
| **Tests** | 157 tests across 4 suites (utilities, parsing, integration, component smoke tests) |

