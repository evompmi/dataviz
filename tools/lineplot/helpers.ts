// Pure series + per-x stats helpers for the Line / profile plot. These have
// no React / DOM dependency and are separately testable (tests/helpers/
// lineplot-loader.js loads this file directly). Keep render-layer code and
// UI-specific components out — they belong in tools/lineplot.tsx.

import { runTest } from "../_shell/stats-dispatch";

// ── Constants ──────────────────────────────────────────────────────────────
export const MARGIN = { top: 20, right: 20, bottom: 48, left: 62 };
export const STAR_ROW_H = 18;

export const ERROR_KINDS = [
  { value: "sem", label: "SEM" },
  { value: "sd", label: "SD" },
  { value: "ci95", label: "95% CI" },
];

// ── Small helpers ──────────────────────────────────────────────────────────

export const round4 = (v) => Math.round(v * 10000) / 10000;
export const round2 = (v) => Math.round(v * 100) / 100;

export function buildLineD(pts) {
  const valid = pts.filter((p) => p.y != null);
  if (valid.length < 2) return "";
  return "M" + valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
}

export function formatX(x) {
  if (x == null || !Number.isFinite(x)) return String(x);
  return Number.isInteger(x) ? String(x) : String(round4(x));
}

// Test / post-hoc dispatchers live in tools/_shell/stats-dispatch.ts
// (runTest, runPostHoc, postHocForTest) — shared across boxplot, lineplot,
// and aequorin.

// ── Series + per-x stats ───────────────────────────────────────────────────

// Build per-group point summaries keyed on strict numeric x equality.
export function computeSeries(data, rawData, xCol, yCol, groupCol, groupColors, palette) {
  // Preserve first-seen group order so legend ordering matches the CSV.
  const groupOrder = [];
  const perGroup = new Map<string, Map<number, number[]>>();

  for (let ri = 0; ri < data.length; ri++) {
    const x = data[ri][xCol];
    const y = data[ri][yCol];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const gName = groupCol == null ? "(all)" : String(rawData[ri][groupCol] ?? "");
    if (!perGroup.has(gName)) {
      perGroup.set(gName, new Map());
      groupOrder.push(gName);
    }
    const xMap = perGroup.get(gName);
    if (!xMap.has(x)) xMap.set(x, []);
    xMap.get(x).push(y);
  }

  return groupOrder.map((name, idx) => {
    const xMap = perGroup.get(name);
    const xs = [...xMap.keys()].sort((a, b) => a - b);
    const points = xs.map((x) => {
      const values = xMap.get(x);
      const n = values.length;
      const mean = sampleMean(values);
      const sd = n > 1 ? sampleSD(values) : 0;
      const sem = n > 1 ? sd / Math.sqrt(n) : 0;
      const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
      return { x, values, n, mean, sd, sem, ci95 };
    });
    return {
      name,
      color: groupColors[name] || palette[idx % palette.length],
      points,
    };
  });
}

// For each x shared by ≥2 groups (with n≥2 per group), run the routed test and
// BH-adjust across x. Returns one row per eligible x.
export function computePerXStats(series) {
  const xSet = new Set<number>();
  for (const s of series) for (const p of s.points) xSet.add(p.x);
  const xs = [...xSet].sort((a, b) => a - b);

  const rows = [];
  for (const x of xs) {
    const groups = [];
    for (const s of series) {
      const p = s.points.find((q) => q.x === x);
      if (p && p.n >= 2) groups.push({ name: s.name, values: p.values });
    }
    if (groups.length < 2) continue;
    const values = groups.map((g) => g.values);
    const names = groups.map((g) => g.name);
    const rec = selectTest(values);
    const chosenTest =
      rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
    const result = chosenTest ? runTest(chosenTest, values) : null;
    rows.push({ x, names, values, chosenTest, result });
  }

  // BH-adjust valid p-values across x-axis.
  const validIdx: number[] = [];
  const validPs: number[] = [];
  rows.forEach((r, i) => {
    if (r.result && !r.result.error && Number.isFinite(r.result.p)) {
      validIdx.push(i);
      validPs.push(r.result.p);
    }
  });
  const adjPs = validPs.length > 0 ? bhAdjust(validPs) : [];
  rows.forEach((r) => (r.pAdj = null));
  validIdx.forEach((origIdx, j) => (rows[origIdx].pAdj = adjPs[j]));

  return rows;
}
