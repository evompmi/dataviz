// Pure helpers for the scatter tool. These have no React / DOM dependency and
// are separately testable (tests/helpers/scatter-loader.js loads this file
// directly). Keep JSX-bearing helpers (PaletteStrip, renderPoint, ShapePreview)
// out — they belong in tools/scatter.tsx.

// ── Tick formatting ────────────────────────────────────────────────────────

export function fmtTick(t) {
  if (t === 0) return "0";
  const abs = Math.abs(t);
  if (abs >= 10000 || (abs < 0.01 && abs > 0)) return t.toExponential(1);
  if (abs >= 100) return t.toFixed(0);
  return parseFloat(t.toPrecision(3)).toString();
}

// ── Shapes ────────────────────────────────────────────────────────────────

export const SHAPES = ["circle", "triangle", "cross", "square"];

// ── Layout constants ──────────────────────────────────────────────────────

export const MARGIN = { top: 28, right: 28, bottom: 56, left: 70 };
export const VBW = 800;
export const VBH = 500;

// ── Simple linear regression (y ~ x) ──────────────────────────────────────

// Runs over the supplied rows. Skips any row where either column is null or
// NaN. Returns `{valid: false}` for fewer than 2 usable points or when either
// axis is degenerate (zero variance). Otherwise `{valid, slope, intercept,
// r2, n}` with `r2` possibly `NaN` if y is degenerate but x is not.
export function computeLinearRegression(rows, xCol, yCol) {
  if (!rows || rows.length < 2) return { valid: false };
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (const row of rows) {
    const x = row[xCol],
      y = row[yCol];
    if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  if (n < 2) return { valid: false };
  const denomX = n * sxx - sx * sx;
  if (denomX === 0) return { valid: false };
  const slope = (n * sxy - sx * sy) / denomX;
  const intercept = (sy - slope * sx) / n;
  const denomY = n * syy - sy * sy;
  const r2 = denomY === 0 ? NaN : Math.pow(n * sxy - sx * sy, 2) / (denomX * denomY);
  return { valid: true, slope, intercept, r2, n };
}
