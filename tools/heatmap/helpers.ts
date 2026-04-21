// Pure helpers for the heatmap tool — normalisation, dendrogram layout/prune,
// colorbar tick formatting, and dendrogram/selection colour constants. These
// have no React / DOM dependency and are separately testable (tests/helpers/
// heatmap-loader.js loads this file directly). JSX-bearing helpers
// (PaletteStrip, HeatmapChart, …) stay in tools/heatmap.tsx.

// ── Normalisation helpers ────────────────────────────────────────────────────

export function finiteMean(arr) {
  let s = 0,
    n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      s += arr[i];
      n++;
    }
  }
  return n ? s / n : NaN;
}

export function finiteSD(arr, mean) {
  let s = 0,
    n = 0;
  for (let i = 0; i < arr.length; i++) {
    if (Number.isFinite(arr[i])) {
      const d = arr[i] - mean;
      s += d * d;
      n++;
    }
  }
  return n > 1 ? Math.sqrt(s / (n - 1)) : 0;
}

export function normalizeMatrix(matrix, mode) {
  const nRows = matrix.length;
  if (nRows === 0) return matrix;
  const nCols = matrix[0].length;

  if (mode === "zrow") {
    return matrix.map((row) => {
      const m = finiteMean(row);
      const sd = finiteSD(row, m);
      if (!Number.isFinite(m) || sd === 0) return row.slice();
      return row.map((v) => (Number.isFinite(v) ? (v - m) / sd : NaN));
    });
  }
  if (mode === "zcol") {
    const out = matrix.map((r) => r.slice());
    for (let ci = 0; ci < nCols; ci++) {
      const col = new Array(nRows);
      for (let ri = 0; ri < nRows; ri++) col[ri] = matrix[ri][ci];
      const m = finiteMean(col);
      const sd = finiteSD(col, m);
      if (!Number.isFinite(m) || sd === 0) continue;
      for (let ri = 0; ri < nRows; ri++) {
        out[ri][ci] = Number.isFinite(matrix[ri][ci]) ? (matrix[ri][ci] - m) / sd : NaN;
      }
    }
    return out;
  }
  if (mode === "log2") {
    return matrix.map((row) =>
      row.map((v) => (Number.isFinite(v) && v > -1 ? Math.log2(v + 1) : NaN))
    );
  }
  return matrix;
}

export function autoRange(matrix, diverging) {
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const v = matrix[i][j];
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (diverging) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m || 0, m || 1];
  }
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

// ── Dendrogram constants & layout ────────────────────────────────────────────

export const DENDRO_STROKE = "#555555";
export const DENDRO_HOVER_STROKE = "#0072B2"; // Okabe-Ito blue — stands out against the grey default.
export const NAN_FILL = "#e0e0e0";
export const SELECTION_STROKE = "#111111";
export const HIGHLIGHT_STROKE = "#111111";

// Walk an hclust tree producing BOTH the segment list for drawing AND the
// per-internal-node records for hit-testing. Each segment is tagged with the
// [xMin, xMax] leaf-order span of the internal node that emitted it, so we can
// cheaply decide later whether it belongs to a hovered subtree: segment.xMin ≥
// hoverNode.xMin && segment.xMax ≤ hoverNode.xMax. Kept local (not in stats.js)
// because only the heatmap view needs the hover metadata.
export function buildDendroLayout(tree) {
  if (!tree) return { segments: [], nodes: [], maxHeight: 0 };
  const segments = [];
  const nodes = [];
  let leafIdx = 0;
  let maxHeight = 0;
  function walk(node) {
    if (node.left === null && node.right === null) {
      const pos = leafIdx++;
      return { x: pos, h: 0, leaves: [node.index], xMin: pos, xMax: pos };
    }
    const L = walk(node.left);
    const R = walk(node.right);
    const h = node.height;
    if (h > maxHeight) maxHeight = h;
    const leaves = L.leaves.concat(R.leaves);
    const xMin = Math.min(L.xMin, R.xMin);
    const xMax = Math.max(L.xMax, R.xMax);
    segments.push({ x1: L.x, y1: L.h, x2: L.x, y2: h, xMin, xMax });
    segments.push({ x1: R.x, y1: R.h, x2: R.x, y2: h, xMin, xMax });
    segments.push({ x1: L.x, y1: h, x2: R.x, y2: h, xMin, xMax });
    nodes.push({ height: h, leaves, xMin, xMax });
    return { x: (L.x + R.x) / 2, h, leaves, xMin, xMax };
  }
  walk(tree);
  return { segments, nodes, maxHeight };
}

// Prune an hclust tree down to the leaves whose original indices are in
// `keepSet`. Returns the pruned subtree, or `null` if pruning leaves fewer
// than two leaves (a single-leaf "tree" has no internal merges, so there's
// no dendrogram to draw). Internal nodes that retain only one child are
// collapsed to that child, so the returned tree has no unary internals;
// original merge heights are preserved, giving a true subtree dendrogram
// of the selection — edges skip over elided sibling clades but the
// heights still reflect the original clustering distances.
export function pruneDendroTree(tree, keepSet) {
  function rec(node) {
    if (!node) return null;
    if (node.left === null && node.right === null) {
      return keepSet.has(node.index) ? node : null;
    }
    const L = rec(node.left);
    const R = rec(node.right);
    if (!L && !R) return null;
    if (!L) return R;
    if (!R) return L;
    return {
      index: -1,
      left: L,
      right: R,
      height: node.height,
      size: (L.size || 1) + (R.size || 1),
    };
  }
  const pruned = rec(tree);
  if (!pruned || (pruned.left === null && pruned.right === null)) return null;
  return pruned;
}

// Okabe-Ito categorical palette for k-means cluster-id colour strips.
export const CLUSTER_PALETTE = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#999999",
  "#88CCEE",
  "#AA4499",
];

// ── Colorbar tick formatting ─────────────────────────────────────────────────

export function fmtColorbarTick(v) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toExponential(1);
  if (abs < 1) return v.toFixed(2);
  return v.toFixed(1);
}
