// heatmap.tsx — editable source. Run `npm run build` to compile to heatmap.js.
// Do NOT edit the .js file directly.

const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef } = React;

// ── Palette strip (same shape as scatter.tsx's local helper) ─────────────────

function PaletteStrip({ palette, height = 12 }) {
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const n = 48;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ flex: 1, background: interpolateColor(stops, i / (n - 1)) }} />
      ))}
    </div>
  );
}

// ── Normalisation helpers ────────────────────────────────────────────────────

function finiteMean(arr) {
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

function finiteSD(arr, mean) {
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

function normalizeMatrix(matrix, mode) {
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

function autoRange(matrix, diverging) {
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

// ── Heatmap chart ────────────────────────────────────────────────────────────

const DENDRO_STROKE = "#555555";
const DENDRO_HOVER_STROKE = "#0072B2"; // Okabe-Ito blue — stands out against the grey default.
const NAN_FILL = "#e0e0e0";
const SELECTION_STROKE = "#111111";
const HIGHLIGHT_STROKE = "#111111";

// Walk an hclust tree producing BOTH the segment list for drawing AND the
// per-internal-node records for hit-testing. Each segment is tagged with the
// [xMin, xMax] leaf-order span of the internal node that emitted it, so we can
// cheaply decide later whether it belongs to a hovered subtree: segment.xMin ≥
// hoverNode.xMin && segment.xMax ≤ hoverNode.xMax. Kept local (not in stats.js)
// because only the heatmap view needs the hover metadata.
function buildDendroLayout(tree) {
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
// Okabe-Ito categorical palette for k-means cluster-id colour strips.
const CLUSTER_PALETTE = [
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

const HeatmapChart = forwardRef<SVGSVGElement, any>(function HeatmapChart(
  {
    rowLabels,
    colLabels,
    matrix,
    rowOrder,
    colOrder,
    rowCluster,
    colCluster,
    vmin,
    vmax,
    palette,
    cellBorder,
    plotTitle,
    plotSubtitle,
    rowAxisLabel,
    colAxisLabel,
    showRowLabels = true,
    showColLabels = true,
    // Interactivity — absent on the detail chart except tooltips.
    interactive = false,
    selection = null,
    onBrushEnd,
    onAxisSelect,
    onClearSelection,
    rawMatrix,
    // When rendering a detail view we want the cell size and colourbar height
    // to match the main plot exactly so the two heatmaps align cell-for-cell
    // and the legend gradient is the same length. Callers pass the main
    // plot's computed cellW/cellH/CB_H; if omitted they're computed locally.
    baseCellW,
    baseCellH,
    baseColorbarH,
    // Reserved dendrogram/column-label space from the main chart. Detail view
    // has no dendrograms, but mirroring the main's reserved space keeps
    // MARGIN.top/.left identical so the detail cell grid starts at the same
    // screen position as the main grid (i.e. they visually line up when
    // stacked vertically).
    baseDendroSizeLeft,
    baseDendroSizeTop,
    baseColLabelH,
    baseRowLabelW,
    // Horizontal / vertical shift in cells. Lets the detail plot place its
    // first visible column at the same x as the originating column in the
    // main plot (for contiguous selections the two grids align exactly).
    cellOffsetCols = 0,
    cellOffsetRows = 0,
    // Override for total plot-grid dimensions. Detail view sets these to the
    // main plot's plotW/plotH so its SVG spans the same horizontal/vertical
    // extent even though only a subset of cells is drawn — the detail plot
    // then visually stacks under the main plot cell-column-aligned. When
    // supplied these are AUTHORITATIVE (the caller has already accounted for
    // any k-means inter-cluster gap), so we don't add `totalColGap` again.
    basePlotW,
    basePlotH,
    // Pixel offset added to every cell's x / y position. Used by the detail
    // view to mirror the cumulative k-means gap that sits to the LEFT (or
    // ABOVE) the selection's first column / row in the main plot, so detail
    // cells land at the exact same x / y as their originating main cells.
    colGapStartPx = 0,
    rowGapStartPx = 0,
    // Detail view sets this to false so the dendrograms / cluster-id strips
    // are NOT redrawn over the detail (they belong to the main view), even
    // though the cluster objects are still passed through for gap math.
    showClusterStrip = true,
  },
  ref
) {
  const nRows = rowOrder.length;
  const nCols = colOrder.length;
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;

  // Longest label lengths drive the margin sizes. Labels render at 10 px.
  const longestRowLabel = Math.max(0, ...rowLabels.map((l) => (l || "").length));
  const longestColLabel = Math.max(0, ...colLabels.map((l) => (l || "").length));

  // Cell size: cap the per-cell pixels (28 px max), allow shrinking down to a
  // 2 px floor so very tall / wide matrices (hundreds of rows or cols) render
  // at a manageable total size. Below ~6 px the row/col labels can't be drawn
  // usefully — the caller is expected to hide them via showRowLabels /
  // showColLabels once the cells get too thin.
  const cellW =
    baseCellW != null ? baseCellW : Math.max(2, Math.min(28, Math.floor(720 / Math.max(1, nCols))));
  const cellH =
    baseCellH != null ? baseCellH : Math.max(2, Math.min(28, Math.floor(480 / Math.max(1, nRows))));

  const rowIsHier = rowCluster && rowCluster.mode === "hierarchical" && rowCluster.tree;
  const rowIsKmeans = rowCluster && rowCluster.mode === "kmeans";
  const colIsHier = colCluster && colCluster.mode === "hierarchical" && colCluster.tree;
  const colIsKmeans = colCluster && colCluster.mode === "kmeans";

  // When k-means is active we insert a visible gap whenever the cluster id
  // changes between adjacent cells in display order, so the k groups read as
  // discrete bands instead of one contiguous colour strip.
  const K_GAP = 10;
  const colGapOffsets = new Array(nCols).fill(0);
  if (colIsKmeans) {
    for (let ci = 1; ci < nCols; ci++) {
      const prev = colCluster.clusters[colOrder[ci - 1]];
      const cur = colCluster.clusters[colOrder[ci]];
      colGapOffsets[ci] = colGapOffsets[ci - 1] + (cur !== prev ? K_GAP : 0);
    }
  }
  const rowGapOffsets = new Array(nRows).fill(0);
  if (rowIsKmeans) {
    for (let ri = 1; ri < nRows; ri++) {
      const prev = rowCluster.clusters[rowOrder[ri - 1]];
      const cur = rowCluster.clusters[rowOrder[ri]];
      rowGapOffsets[ri] = rowGapOffsets[ri - 1] + (cur !== prev ? K_GAP : 0);
    }
  }
  const totalColGap = nCols > 0 ? colGapOffsets[nCols - 1] : 0;
  const totalRowGap = nRows > 0 ? rowGapOffsets[nRows - 1] : 0;

  // plotW/plotH include the inter-cluster gaps so background, colourbar, and
  // row-label x positions all sit past the gapped grid's right edge. When the
  // caller supplies `basePlotW` / `basePlotH` they are taken AS-IS (the
  // detail view already factors the main's totalColGap into its basePlotW so
  // the detail SVG matches the main's width).
  const plotW = basePlotW != null ? basePlotW : cellW * nCols + totalColGap;
  const plotH = basePlotH != null ? basePlotH : cellH * nRows + totalRowGap;

  const computedDendroTop = colIsHier ? 60 : colIsKmeans ? 14 : 0;
  const computedDendroLeft = rowIsHier ? 60 : rowIsKmeans ? 14 : 0;
  const DENDRO_SIZE_TOP = baseDendroSizeTop != null ? baseDendroSizeTop : computedDendroTop;
  const DENDRO_SIZE_LEFT = baseDendroSizeLeft != null ? baseDendroSizeLeft : computedDendroLeft;
  const LABEL_GAP = 6;
  const ROW_LABEL_W =
    baseRowLabelW != null
      ? baseRowLabelW
      : showRowLabels
        ? Math.min(160, longestRowLabel * 6 + 12)
        : 0;
  const COL_LABEL_H =
    baseColLabelH != null
      ? baseColLabelH
      : showColLabels
        ? Math.min(120, Math.round(longestColLabel * 5.5) + 16)
        : 0;

  const TITLE_H = plotTitle ? (plotSubtitle ? 42 : 26) : 0;
  const AXIS_LABEL_TOP = colAxisLabel ? 16 : 0;
  const AXIS_LABEL_LEFT = rowAxisLabel ? 16 : 0;

  // Vertical colourbar sits top-right, past the row labels. Widths:
  //   bar | gap | tick labels
  const CB_W = 12;
  const CB_OFFSET = 16; // gap between row labels and bar
  const CB_TICK_W = 44; // space reserved for numeric tick labels
  // Keep a floor (60) so the gradient is legible even on tiny detail slices.
  // When `baseColorbarH` is supplied (detail view) we mirror the main plot's
  // legend height so the two charts have matching colour bars.
  const CB_H =
    baseColorbarH != null ? baseColorbarH : Math.min(180, Math.max(60, Math.round(plotH * 0.6)));

  const MARGIN = {
    top: TITLE_H + 10 + AXIS_LABEL_TOP + COL_LABEL_H + LABEL_GAP + DENDRO_SIZE_TOP,
    left: AXIS_LABEL_LEFT + DENDRO_SIZE_LEFT + LABEL_GAP,
    right: ROW_LABEL_W + CB_OFFSET + CB_W + CB_TICK_W + 10,
    bottom: 12,
  };

  // vbH grows to fit WHICHEVER is taller — the plot grid or the colourbar.
  // The +14 on the colourbar branch leaves room for the bottom tick label's
  // descenders below the bar (the text uses the default alphabetic baseline).
  const vbW = MARGIN.left + plotW + MARGIN.right;
  const vbH = MARGIN.top + Math.max(plotH, CB_H + 14) + MARGIN.bottom;

  const bordersOn = cellBorder && cellBorder.on;

  // Cell geometry: when borders are OFF we snap to integer pixels so adjacent
  // rects share a boundary and don't open a sub-pixel seam on PNG export.
  // When borders are ON we use float geometry — strokes anti-alias cleanly.
  // Cells live at their OWN display index + an optional cell offset, so the
  // detail view can draw only the selected slice at the same pixel column
  // as the main plot's originating cells.
  const colIx = (ci) => ci + cellOffsetCols;
  const rowIx = (ri) => ri + cellOffsetRows;
  const colGap = (ci) => colGapOffsets[ci] || 0;
  const rowGap = (ri) => rowGapOffsets[ri] || 0;
  const cellX = (ci) =>
    (bordersOn ? colIx(ci) * cellW + colGap(ci) : Math.round(colIx(ci) * cellW) + colGap(ci)) +
    colGapStartPx;
  const cellY = (ri) =>
    (bordersOn ? rowIx(ri) * cellH + rowGap(ri) : Math.round(rowIx(ri) * cellH) + rowGap(ri)) +
    rowGapStartPx;
  const cellWPx = (ci) =>
    bordersOn ? cellW : Math.round((colIx(ci) + 1) * cellW) - Math.round(colIx(ci) * cellW);
  const cellHPx = (ri) =>
    bordersOn ? cellH : Math.round((rowIx(ri) + 1) * cellH) - Math.round(rowIx(ri) * cellH);

  const valueToColor = (v) => {
    if (!Number.isFinite(v)) return NAN_FILL;
    const t = (v - vmin) / (vmax - vmin || 1);
    return interpolateColor(stops, Math.max(0, Math.min(1, t)));
  };

  // ── Interaction state — tooltip + brush + branch hover ─────────────────────
  const [hover, setHover] = useState(null); // { ri, ci, clientX, clientY }
  const [brush, setBrush] = useState(null); // { anchorRi, anchorCi, curRi, curCi }
  const [axisHover, setAxisHover] = useState(null); // { axis, leaves: Set }
  const svgLocalRef = useRef(null);

  // The forwarded ref and our local ref both need to point at the SVG.
  const setRefs = useCallback(
    (node) => {
      svgLocalRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  // Convert a DOM pointer event to viewBox coordinates.
  function svgPoint(e) {
    const svg = svgLocalRef.current;
    if (!svg || !svg.createSVGPoint) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }

  // Given a viewBox point, return {ri, ci} if inside the cell grid; else null.
  function pointToCell(p) {
    if (!p) return null;
    const localX = p.x - MARGIN.left;
    const localY = p.y - MARGIN.top;
    if (localX < 0 || localY < 0 || localX > plotW || localY > plotH) return null;
    // Gaps break the linear indexing cellX = ci * cellW + offset, so scan
    // each axis in order. For typical matrices (up to a few hundred cells
    // per axis) a linear probe is fast enough on mousemove. A pointer that
    // lands in the empty band between two clusters reports no hit.
    let ci = -1;
    for (let c = 0; c < nCols; c++) {
      const x = cellX(c);
      if (localX >= x && localX < x + cellW) {
        ci = c;
        break;
      }
    }
    let ri = -1;
    for (let r = 0; r < nRows; r++) {
      const y = cellY(r);
      if (localY >= y && localY < y + cellH) {
        ri = r;
        break;
      }
    }
    if (ci < 0 || ri < 0) return null;
    return { ri, ci };
  }

  function handlePointerMove(e) {
    const p = svgPoint(e);
    const hit = pointToCell(p);
    if (hit) {
      setHover({ ri: hit.ri, ci: hit.ci, clientX: e.clientX, clientY: e.clientY });
    } else {
      setHover(null);
    }
    if (brush && hit) setBrush({ ...brush, curRi: hit.ri, curCi: hit.ci });
  }

  function handlePointerDown(e) {
    if (!interactive) return;
    const p = svgPoint(e);
    const hit = pointToCell(p);
    if (!hit) return;
    // Ignore right-click.
    if (e.button !== 0) return;
    setBrush({ anchorRi: hit.ri, anchorCi: hit.ci, curRi: hit.ri, curCi: hit.ci });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerUp(_e) {
    if (!interactive) {
      setBrush(null);
      return;
    }
    if (!brush) return;
    const riMin = Math.min(brush.anchorRi, brush.curRi);
    const riMax = Math.max(brush.anchorRi, brush.curRi);
    const ciMin = Math.min(brush.anchorCi, brush.curCi);
    const ciMax = Math.max(brush.anchorCi, brush.curCi);
    const isClick = riMin === riMax && ciMin === ciMax;
    if (isClick) {
      // Plain click on a cell clears selection — gives users a way back.
      onClearSelection && onClearSelection();
    } else {
      onBrushEnd && onBrushEnd({ riMin, riMax, ciMin, ciMax });
    }
    setBrush(null);
  }

  function handlePointerLeave() {
    setHover(null);
  }

  // ── Derived: selection in display space (for overlay rendering) ────────────
  const selRowsDisplay = useMemo(() => {
    if (!selection || !selection.rows) return null;
    const keep = new Set(selection.rows);
    const ris = [];
    for (let ri = 0; ri < rowOrder.length; ri++) if (keep.has(rowOrder[ri])) ris.push(ri);
    return ris;
  }, [selection, rowOrder]);
  const selColsDisplay = useMemo(() => {
    if (!selection || !selection.cols) return null;
    const keep = new Set(selection.cols);
    const cis = [];
    for (let ci = 0; ci < colOrder.length; ci++) if (keep.has(colOrder[ci])) cis.push(ci);
    return cis;
  }, [selection, colOrder]);

  // ── Derived: hover-highlight display indices from axisHover ────────────────
  const hoverRowsDisplay = useMemo(() => {
    if (!axisHover || axisHover.axis !== "row") return null;
    const keep = axisHover.leaves;
    const ris = [];
    for (let ri = 0; ri < rowOrder.length; ri++) if (keep.has(rowOrder[ri])) ris.push(ri);
    return ris;
  }, [axisHover, rowOrder]);
  const hoverColsDisplay = useMemo(() => {
    if (!axisHover || axisHover.axis !== "col") return null;
    const keep = axisHover.leaves;
    const cis = [];
    for (let ci = 0; ci < colOrder.length; ci++) if (keep.has(colOrder[ci])) cis.push(ci);
    return cis;
  }, [axisHover, colOrder]);

  // ── Colourbar — vertical, top-right, offset past the row labels.
  //    Placed at the right edge of the viewBox so long row labels have room
  //    to breathe in the reserved ROW_LABEL_W column. Stops render bottom→top
  //    with the first (low) stop at y=100% and the last (high) stop at y=0%.
  const cbX = MARGIN.left + plotW + ROW_LABEL_W + CB_OFFSET;
  const cbY = MARGIN.top;
  const cbGradId = "heatmap-colorbar-grad";
  const cbStops = stops.map((c, i) =>
    React.createElement("stop", {
      key: i,
      offset: ((i / (stops.length - 1)) * 100).toFixed(2) + "%",
      stopColor: c,
    })
  );

  // Dendrogram helpers — scale from data space into pixel space.
  // A segment belongs to the currently-hovered subtree iff its [xMin, xMax]
  // leaf span sits inside the hovered node's span — O(1) per segment.
  function segmentInHover(seg, axis) {
    if (!axisHover || axisHover.axis !== axis) return false;
    return seg.xMin >= axisHover.xMin && seg.xMax <= axisHover.xMax;
  }

  function renderColDendrogram() {
    if (!colIsHier) return null;
    const { segments, nodes, maxHeight } = buildDendroLayout(colCluster.tree);
    if (maxHeight === 0 || segments.length === 0) return null;
    const yBase = MARGIN.top - LABEL_GAP - COL_LABEL_H - LABEL_GAP;
    const yTop = yBase - DENDRO_SIZE_TOP + 4;
    const scaleY = (h) => yBase - (h / maxHeight) * (yBase - yTop);
    const scaleX = (x) => MARGIN.left + x * cellW + cellW / 2;
    return (
      <g id="col-dendrogram">
        <g fill="none" strokeLinecap="round">
          {segments.map((s, i) => {
            const active = segmentInHover(s, "col");
            return (
              <line
                key={i}
                x1={scaleX(s.x1)}
                y1={scaleY(s.y1)}
                x2={scaleX(s.x2)}
                y2={scaleY(s.y2)}
                stroke={active ? DENDRO_HOVER_STROKE : DENDRO_STROKE}
                strokeWidth={active ? 2.5 : 1}
              />
            );
          })}
        </g>
        {interactive && (
          // Move onMouseLeave up to the hits group so sliding between
          // adjacent hit bands doesn't briefly flash the hover state off.
          <g id="col-dendrogram-hits" onMouseLeave={() => setAxisHover(null)}>
            {nodes.map((n, i) => {
              const x = scaleX(n.xMin) - cellW / 2;
              const w = scaleX(n.xMax) - scaleX(n.xMin) + cellW;
              const y = scaleY(n.height) - 4;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={8}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() =>
                    setAxisHover({
                      axis: "col",
                      leaves: new Set(n.leaves),
                      xMin: n.xMin,
                      xMax: n.xMax,
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onAxisSelect && onAxisSelect("col", n.leaves);
                  }}
                />
              );
            })}
          </g>
        )}
      </g>
    );
  }

  function renderRowDendrogram() {
    if (!rowIsHier) return null;
    const { segments, nodes, maxHeight } = buildDendroLayout(rowCluster.tree);
    if (maxHeight === 0 || segments.length === 0) return null;
    const xRight = MARGIN.left - LABEL_GAP;
    const xLeft = xRight - DENDRO_SIZE_LEFT + 4;
    const scaleX = (h) => xRight - (h / maxHeight) * (xRight - xLeft);
    const scaleY = (x) => MARGIN.top + x * cellH + cellH / 2;
    // Row dendrogram lies on its side: x-axis is the merge height, y-axis is leaf position.
    return (
      <g id="row-dendrogram">
        <g fill="none" strokeLinecap="round">
          {segments.map((s, i) => {
            const active = segmentInHover(s, "row");
            return (
              <line
                key={i}
                x1={scaleX(s.y1)}
                y1={scaleY(s.x1)}
                x2={scaleX(s.y2)}
                y2={scaleY(s.x2)}
                stroke={active ? DENDRO_HOVER_STROKE : DENDRO_STROKE}
                strokeWidth={active ? 2.5 : 1}
              />
            );
          })}
        </g>
        {interactive && (
          <g id="row-dendrogram-hits" onMouseLeave={() => setAxisHover(null)}>
            {nodes.map((n, i) => {
              const y = scaleY(n.xMin) - cellH / 2;
              const h = scaleY(n.xMax) - scaleY(n.xMin) + cellH;
              const x = scaleX(n.height) - 4;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={8}
                  height={h}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() =>
                    setAxisHover({
                      axis: "row",
                      leaves: new Set(n.leaves),
                      xMin: n.xMin,
                      xMax: n.xMax,
                    })
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onAxisSelect && onAxisSelect("row", n.leaves);
                  }}
                />
              );
            })}
          </g>
        )}
      </g>
    );
  }

  function clusterColor(id) {
    return CLUSTER_PALETTE[
      ((id % CLUSTER_PALETTE.length) + CLUSTER_PALETTE.length) % CLUSTER_PALETTE.length
    ];
  }

  function renderColClusterStrip() {
    if (!colIsKmeans) return null;
    const y = MARGIN.top - LABEL_GAP - COL_LABEL_H - LABEL_GAP - DENDRO_SIZE_TOP + 2;
    const leavesByCluster = interactive ? new Map() : null;
    if (interactive) {
      for (let c = 0; c < colCluster.clusters.length; c++) {
        const id = colCluster.clusters[c];
        if (!leavesByCluster.has(id)) leavesByCluster.set(id, []);
        leavesByCluster.get(id).push(c);
      }
    }
    return (
      <g id="col-cluster-strip" onMouseLeave={interactive ? () => setAxisHover(null) : undefined}>
        {colOrder.map((origCi, ci) => {
          const cid = colCluster.clusters[origCi];
          return (
            <rect
              key={ci}
              x={MARGIN.left + cellX(ci)}
              y={y}
              width={cellWPx(ci)}
              height={DENDRO_SIZE_TOP - 4}
              fill={clusterColor(cid)}
              stroke="none"
              shapeRendering="crispEdges"
              style={interactive ? { cursor: "pointer" } : undefined}
              onMouseEnter={
                interactive
                  ? () => setAxisHover({ axis: "col", leaves: new Set(leavesByCluster.get(cid)) })
                  : undefined
              }
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      onAxisSelect && onAxisSelect("col", leavesByCluster.get(cid));
                    }
                  : undefined
              }
            />
          );
        })}
      </g>
    );
  }

  function renderRowClusterStrip() {
    if (!rowIsKmeans) return null;
    const x = MARGIN.left - LABEL_GAP - DENDRO_SIZE_LEFT + 2;
    const leavesByCluster = interactive ? new Map() : null;
    if (interactive) {
      for (let r = 0; r < rowCluster.clusters.length; r++) {
        const id = rowCluster.clusters[r];
        if (!leavesByCluster.has(id)) leavesByCluster.set(id, []);
        leavesByCluster.get(id).push(r);
      }
    }
    return (
      <g id="row-cluster-strip" onMouseLeave={interactive ? () => setAxisHover(null) : undefined}>
        {rowOrder.map((origRi, ri) => {
          const cid = rowCluster.clusters[origRi];
          return (
            <rect
              key={ri}
              x={x}
              y={MARGIN.top + cellY(ri)}
              width={DENDRO_SIZE_LEFT - 4}
              height={cellHPx(ri)}
              fill={clusterColor(cid)}
              stroke="none"
              shapeRendering="crispEdges"
              style={interactive ? { cursor: "pointer" } : undefined}
              onMouseEnter={
                interactive
                  ? () => setAxisHover({ axis: "row", leaves: new Set(leavesByCluster.get(cid)) })
                  : undefined
              }
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      onAxisSelect && onAxisSelect("row", leavesByCluster.get(cid));
                    }
                  : undefined
              }
            />
          );
        })}
      </g>
    );
  }

  // Resolve hover cell to raw value + labels for the tooltip.
  const hoverInfo =
    hover && rowOrder[hover.ri] != null && colOrder[hover.ci] != null
      ? (() => {
          const origRi = rowOrder[hover.ri];
          const origCi = colOrder[hover.ci];
          const vNorm = matrix[origRi] && matrix[origRi][origCi];
          const vRaw = rawMatrix && rawMatrix[origRi] && rawMatrix[origRi][origCi];
          return {
            rowLabel: rowLabels[origRi],
            colLabel: colLabels[origCi],
            vNorm,
            vRaw,
          };
        })()
      : null;

  // Brush rect in display space (during drag).
  const brushRect = brush
    ? (() => {
        const riMin = Math.min(brush.anchorRi, brush.curRi);
        const riMax = Math.max(brush.anchorRi, brush.curRi);
        const ciMin = Math.min(brush.anchorCi, brush.curCi);
        const ciMax = Math.max(brush.anchorCi, brush.curCi);
        return {
          x: MARGIN.left + cellX(ciMin),
          y: MARGIN.top + cellY(riMin),
          w: cellX(ciMax) + cellWPx(ciMax) - cellX(ciMin),
          h: cellY(riMax) + cellHPx(riMax) - cellY(riMin),
        };
      })()
    : null;

  function renderRowBands(ris, stroke, fillOpacity) {
    if (!ris || ris.length === 0) return null;
    return ris.map((ri) => (
      <rect
        key={`rb-${ri}`}
        x={MARGIN.left + cellX(0)}
        y={MARGIN.top + cellY(ri)}
        width={cellX(nCols - 1) + cellWPx(nCols - 1) - cellX(0)}
        height={cellHPx(ri)}
        fill={stroke}
        fillOpacity={fillOpacity}
        stroke="none"
        pointerEvents="none"
      />
    ));
  }
  function renderColBands(cis, stroke, fillOpacity) {
    if (!cis || cis.length === 0) return null;
    return cis.map((ci) => (
      <rect
        key={`cb-${ci}`}
        x={MARGIN.left + cellX(ci)}
        y={MARGIN.top + cellY(0)}
        width={cellWPx(ci)}
        height={cellY(nRows - 1) + cellHPx(nRows - 1) - cellY(0)}
        fill={stroke}
        fillOpacity={fillOpacity}
        stroke="none"
        pointerEvents="none"
      />
    ));
  }

  // Spotlight mask — fades every cell NOT in the committed selection to a
  // washed-out pale tint so the selected cluster pops. A light (white)
  // overlay keeps hue discrimination on the selected cells instead of
  // muddying them the way a dark overlay would.
  function renderSelectionMask(selRis, selCis) {
    if ((!selRis || selRis.length === 0) && (!selCis || selCis.length === 0)) return null;
    const rowSel = selRis && selRis.length ? new Set(selRis) : null;
    const colSel = selCis && selCis.length ? new Set(selCis) : null;
    const rects = [];
    const MASK_FILL = "#ffffff";
    const MASK_OPACITY = 0.6;
    const fullW = cellX(nCols - 1) + cellWPx(nCols - 1) - cellX(0);
    // Pass 1 — full-width bands over every row that isn't selected.
    if (rowSel) {
      for (let ri = 0; ri < nRows; ri++) {
        if (rowSel.has(ri)) continue;
        rects.push(
          <rect
            key={`mask-row-${ri}`}
            x={MARGIN.left + cellX(0)}
            y={MARGIN.top + cellY(ri)}
            width={fullW}
            height={cellHPx(ri)}
            fill={MASK_FILL}
            fillOpacity={MASK_OPACITY}
            stroke="none"
            pointerEvents="none"
          />
        );
      }
    }
    // Pass 2 — per-column bands over non-selected columns. When rows are
    // also constrained, limit the column mask to the selected rows so the
    // intersection cell (selected row × selected col) is the only unmasked
    // region. When only cols are selected, the band spans every row.
    if (colSel) {
      const rowsToCover = rowSel ? Array.from(rowSel) : null;
      for (let ci = 0; ci < nCols; ci++) {
        if (colSel.has(ci)) continue;
        if (rowsToCover) {
          for (const ri of rowsToCover) {
            rects.push(
              <rect
                key={`mask-col-${ri}-${ci}`}
                x={MARGIN.left + cellX(ci)}
                y={MARGIN.top + cellY(ri)}
                width={cellWPx(ci)}
                height={cellHPx(ri)}
                fill={MASK_FILL}
                fillOpacity={MASK_OPACITY}
                stroke="none"
                pointerEvents="none"
              />
            );
          }
        } else {
          const fullH = cellY(nRows - 1) + cellHPx(nRows - 1) - cellY(0);
          rects.push(
            <rect
              key={`mask-col-${ci}`}
              x={MARGIN.left + cellX(ci)}
              y={MARGIN.top + cellY(0)}
              width={cellWPx(ci)}
              height={fullH}
              fill={MASK_FILL}
              fillOpacity={MASK_OPACITY}
              stroke="none"
              pointerEvents="none"
            />
          );
        }
      }
    }
    return <g id="selection-mask">{rects}</g>;
  }

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={setRefs}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        width={vbW}
        height={vbH}
        style={{ maxWidth: "100%", height: "auto", display: "block" }}
      >
        <g id="background">
          <rect x={0} y={0} width={vbW} height={vbH} fill="#ffffff" />
        </g>

        {plotTitle && (
          <g id="title">
            <text
              x={vbW / 2}
              y={18}
              textAnchor="middle"
              fontFamily="sans-serif"
              fontSize="14"
              fontWeight="700"
              fill="#222222"
            >
              {plotTitle}
            </text>
          </g>
        )}
        {plotSubtitle && (
          <g id="subtitle">
            <text
              x={vbW / 2}
              y={plotTitle ? 34 : 18}
              textAnchor="middle"
              fontFamily="sans-serif"
              fontSize="11"
              fill="#555555"
            >
              {plotSubtitle}
            </text>
          </g>
        )}

        {colAxisLabel && (
          <g id="x-axis-label">
            <text
              x={MARGIN.left + plotW / 2}
              y={TITLE_H + 22}
              textAnchor="middle"
              fontFamily="sans-serif"
              fontSize="11"
              fontWeight="600"
              fill="#333333"
            >
              {colAxisLabel}
            </text>
          </g>
        )}

        {rowAxisLabel && (
          <g id="y-axis-label">
            <text
              transform={`rotate(-90) translate(${-(MARGIN.top + plotH / 2)}, 12)`}
              textAnchor="middle"
              fontFamily="sans-serif"
              fontSize="11"
              fontWeight="600"
              fill="#333333"
            >
              {rowAxisLabel}
            </text>
          </g>
        )}

        {showClusterStrip && renderColDendrogram()}
        {showClusterStrip && renderRowDendrogram()}
        {showClusterStrip && renderColClusterStrip()}
        {showClusterStrip && renderRowClusterStrip()}

        <g id="chart" transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          <g id="plot-area-background">
            <rect x={0} y={0} width={plotW} height={plotH} fill="#ffffff" />
          </g>
          <g id="cells" shapeRendering={bordersOn ? "auto" : "crispEdges"}>
            {rowOrder.map((origRi, ri) =>
              colOrder.map((origCi, ci) => {
                const v = matrix[origRi][origCi];
                const fill = valueToColor(v);
                return (
                  <rect
                    key={`${ri}-${ci}`}
                    id={`cell-${svgSafeId(rowLabels[origRi])}-${svgSafeId(colLabels[origCi])}`}
                    x={cellX(ci)}
                    y={cellY(ri)}
                    width={cellWPx(ci)}
                    height={cellHPx(ri)}
                    fill={fill}
                    stroke={bordersOn ? cellBorder.color : "none"}
                    strokeWidth={bordersOn ? cellBorder.width : 0}
                  />
                );
              })
            )}
          </g>
        </g>

        {/* Column labels */}
        {showColLabels && (
          <g id="col-labels">
            {colOrder.map((origCi, ci) => {
              const cx = MARGIN.left + cellX(ci) + cellW / 2;
              const cy = MARGIN.top - LABEL_GAP;
              return (
                <text
                  key={ci}
                  x={cx}
                  y={cy}
                  transform={`rotate(-45 ${cx} ${cy})`}
                  textAnchor="start"
                  fontFamily="sans-serif"
                  fontSize="10"
                  fill="#333333"
                >
                  {colLabels[origCi]}
                </text>
              );
            })}
          </g>
        )}

        {/* Row labels */}
        {showRowLabels && (
          <g id="row-labels">
            {rowOrder.map((origRi, ri) => (
              <text
                key={ri}
                x={MARGIN.left + plotW + LABEL_GAP}
                y={MARGIN.top + cellY(ri) + cellH / 2 + 3}
                textAnchor="start"
                fontFamily="sans-serif"
                fontSize="10"
                fill="#333333"
              >
                {rowLabels[origRi]}
              </text>
            ))}
          </g>
        )}

        {/* Colourbar — vertical, high values on top. */}
        <g id="colorbar">
          <defs>
            <linearGradient id={cbGradId} x1="0%" y1="100%" x2="0%" y2="0%">
              {cbStops}
            </linearGradient>
          </defs>
          <rect
            x={cbX}
            y={cbY}
            width={CB_W}
            height={CB_H}
            fill={`url(#${cbGradId})`}
            stroke="#888888"
            strokeWidth="0.5"
          />
          <text
            x={cbX + CB_W + 4}
            y={cbY + 4}
            fontFamily="sans-serif"
            fontSize="9"
            fill="#555555"
            textAnchor="start"
            dominantBaseline="hanging"
          >
            {fmtColorbarTick(vmax)}
          </text>
          <text
            x={cbX + CB_W + 4}
            y={cbY + CB_H / 2 + 3}
            fontFamily="sans-serif"
            fontSize="9"
            fill="#555555"
            textAnchor="start"
          >
            {fmtColorbarTick((vmin + vmax) / 2)}
          </text>
          <text
            x={cbX + CB_W + 4}
            y={cbY + CB_H}
            fontFamily="sans-serif"
            fontSize="9"
            fill="#555555"
            textAnchor="start"
          >
            {fmtColorbarTick(vmin)}
          </text>
        </g>

        {/* Selection mask — fades the unselected cells so the selected
            cluster pops. Nothing renders when there is no committed selection. */}
        {renderSelectionMask(selRowsDisplay, selColsDisplay)}

        {/* Axis-hover highlight — lighter, ephemeral (kept as a subtle tint on
            the hovered cluster's rows/cols so users see what a click would select). */}
        {hoverRowsDisplay && renderRowBands(hoverRowsDisplay, HIGHLIGHT_STROKE, 0.04)}
        {hoverColsDisplay && renderColBands(hoverColsDisplay, HIGHLIGHT_STROKE, 0.04)}

        {/* Brush rect (active drag) */}
        {brushRect && (
          <rect
            x={brushRect.x}
            y={brushRect.y}
            width={brushRect.w}
            height={brushRect.h}
            fill={SELECTION_STROKE}
            fillOpacity={0.12}
            stroke={SELECTION_STROKE}
            strokeWidth={1}
            strokeDasharray="3 2"
            pointerEvents="none"
          />
        )}

        {/* Interaction overlay — sits above cells for pointer capture + tooltip tracking. */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          style={{ cursor: interactive ? "crosshair" : "default" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
      </svg>

      {hoverInfo && (
        <div
          style={{
            position: "fixed",
            left: hover.clientX + 12,
            top: hover.clientY + 12,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            fontFamily: "sans-serif",
            pointerEvents: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {hoverInfo.rowLabel} · {hoverInfo.colLabel}
          </div>
          <div style={{ color: "var(--text-muted)" }}>
            value: {Number.isFinite(hoverInfo.vRaw) ? hoverInfo.vRaw : "NaN"}
            {Number.isFinite(hoverInfo.vNorm) && hoverInfo.vNorm !== hoverInfo.vRaw && (
              <> · plotted: {hoverInfo.vNorm.toFixed(3)}</>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function fmtColorbarTick(v) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toExponential(1);
  if (abs < 1) return v.toFixed(2);
  return v.toFixed(1);
}

// ── Upload step ──────────────────────────────────────────────────────────────

function UploadStep({ sepOverride, setSepOverride, handleFileLoad, onLoadExample }) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Example gene-expression matrix (500 genes × 6 samples)"
        hint="CSV · TSV · TXT — first column = row labels, first row = column labels, rest numeric"
      />
      <p
        style={{
          margin: "4px 0 12px",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "right",
        }}
      >
        ⚠ Max file size: 2 MB
      </p>
      <div
        style={{
          marginTop: 24,
          borderRadius: 14,
          overflow: "hidden",
          border: "2px solid var(--howto-border)",
          boxShadow: "var(--howto-shadow)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,var(--howto-header-from),var(--howto-header-to))",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {toolIcon("heatmap", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              Heatmap — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Upload wide-format matrix → optional normalisation & clustering → plot
            </div>
          </div>
        </div>
        <div
          style={{
            background: "var(--info-bg)",
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--info-text)",
                marginBottom: 6,
              }}
            >
              1 · Shape your file
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <li>First column: row labels (genes, samples, time-points, …)</li>
              <li>First row: column labels (treatments, replicates, conditions)</li>
              <li>
                Everything else: numeric values (blanks / non-numeric render as grey "NaN" cells)
              </li>
            </ul>
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--info-text)",
                marginBottom: 6,
              }}
            >
              2 · Explore it
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <li>Z-score by row to compare patterns across genes of different baseline</li>
              <li>Toggle row / column clustering (Euclidean + UPGMA by default)</li>
              <li>Switch to a diverging palette (RdBu / bwr) when values are centred on 0</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Plot controls ────────────────────────────────────────────────────────────

function ClusterModeControl({ label, mode, setMode, k, setK }) {
  const OPTIONS = [
    { k: "none", label: "None" },
    { k: "hierarchical", label: "Hier." },
    { k: "kmeans", label: "K-means" },
  ];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div className="dv-seg" role="group" aria-label={`${label} clustering mode`}>
        {OPTIONS.map((o) => (
          <button
            key={o.k}
            type="button"
            className={"dv-seg-btn" + (mode === o.k ? " dv-seg-btn-active" : "")}
            onClick={() => setMode(o.k)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === "kmeans" && (
        <div style={{ fontSize: 11, marginTop: 6 }}>
          <div style={{ marginBottom: 2 }}>k</div>
          <NumberInput
            value={k}
            step="1"
            min="2"
            max="10"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setK(Math.max(2, Math.min(10, Number.isFinite(v) ? v : 3)));
            }}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

// Collapsible section wrapper for sidebar tiles. Mirrors the ControlSection
// pattern in boxplot / lineplot / aequorin so expanding a section auto-scrolls
// (via scrollDisclosureIntoView) to reveal the content plus the next
// section's header. Heatmap's sidebar is NOT its own scroll container — the
// page scrolls — so the helper's window-scroll fallback does the work here.
function ControlSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ marginBottom: 0, padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase" as const,
          letterSpacing: 0.5,
          textAlign: "left",
        }}
      >
        <span
          className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
          aria-hidden="true"
        />
        {title}
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function PlotControls({
  vis,
  updVis,
  cellBorder,
  updCellBorder,
  chartRef,
  matrixRef,
  rawMatrix,
  resetAll,
  fileName,
  normalization,
  setNormalization,
  rowMode,
  setRowMode,
  colMode,
  setColMode,
  rowK,
  setRowK,
  colK,
  setColK,
  kmeansSeed,
  setKmeansSeed,
  distanceMetric,
  setDistanceMetric,
  linkageMethod,
  setLinkageMethod,
  autoVRange,
}) {
  const paletteKeys = Object.keys(COLOR_PALETTES);
  const anyHier = rowMode === "hierarchical" || colMode === "hierarchical";
  const anyKmeans = rowMode === "kmeans" || colMode === "kmeans";
  const baseName = fileBaseName(fileName, "heatmap");
  const NORM_OPTIONS = [
    { k: "none", label: "None" },
    { k: "zrow", label: "Z row" },
    { k: "zcol", label: "Z col" },
    { k: "log2", label: "log₂" },
  ];
  const DIST_OPTIONS = [
    { k: "euclidean", label: "Euclidean" },
    { k: "manhattan", label: "Manhattan" },
    { k: "correlation", label: "1 − r" },
  ];
  const LINK_OPTIONS = [
    { k: "average", label: "Average" },
    { k: "complete", label: "Complete" },
    { k: "single", label: "Single" },
  ];
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <ActionsPanel
        onDownloadSvg={() => downloadSvg(chartRef.current, `${baseName}_heatmap.svg`)}
        onDownloadPng={() => downloadPng(chartRef.current, `${baseName}_heatmap.png`, 2)}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "CSV",
            onClick: () => {
              if (!matrixRef.current) return;
              const { headers, rows } = buildCsvExport(matrixRef.current);
              downloadCsv(headers, rows, `${baseName}_heatmap.csv`);
            },
          },
          {
            label: "R script",
            onClick: () => {
              if (!rawMatrix || !rawMatrix.rowLabels.length) return;
              const script = buildHeatmapRScript({
                rawMatrix,
                normalization,
                rowMode,
                colMode,
                rowK,
                colK,
                kmeansSeed,
                distanceMetric,
                linkageMethod,
                palette: vis.palette,
                vmin: vis.vmin,
                vmax: vis.vmax,
                plotTitle: vis.plotTitle,
                cellBorder,
              });
              downloadText(script, `${baseName}_heatmap.R`);
            },
          },
        ]}
      />

      <ControlSection title="Normalisation" defaultOpen={true}>
        <div className="dv-seg" role="group" aria-label="Normalisation">
          {NORM_OPTIONS.map((o) => (
            <button
              key={o.k}
              type="button"
              className={"dv-seg-btn" + (normalization === o.k ? " dv-seg-btn-active" : "")}
              onClick={() => setNormalization(o.k)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </ControlSection>

      <ControlSection title="Clustering" defaultOpen={true}>
        <ClusterModeControl
          label="Rows"
          mode={rowMode}
          setMode={setRowMode}
          k={rowK}
          setK={setRowK}
        />
        <ClusterModeControl
          label="Columns"
          mode={colMode}
          setMode={setColMode}
          k={colK}
          setK={setColK}
        />
        {anyHier && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              Hierarchical · Distance
            </div>
            <div className="dv-seg" role="group" aria-label="Distance metric">
              {DIST_OPTIONS.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  className={"dv-seg-btn" + (distanceMetric === o.k ? " dv-seg-btn-active" : "")}
                  onClick={() => setDistanceMetric(o.k)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 4px" }}>
              Hierarchical · Linkage
            </div>
            <div className="dv-seg" role="group" aria-label="Linkage method">
              {LINK_OPTIONS.map((o) => (
                <button
                  key={o.k}
                  type="button"
                  className={"dv-seg-btn" + (linkageMethod === o.k ? " dv-seg-btn-active" : "")}
                  onClick={() => setLinkageMethod(o.k)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {anyKmeans && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, marginBottom: 2 }}>K-means · Seed</div>
            <NumberInput
              value={kmeansSeed}
              step="1"
              min="1"
              onChange={(e) => setKmeansSeed(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              Change the seed to try a different k-means++ initialisation.
            </div>
          </div>
        )}
      </ControlSection>

      <ControlSection title="Colour scale">
        <label style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
          Palette
          <select
            value={vis.palette}
            onChange={(e) => updVis({ palette: e.target.value })}
            style={{ width: "100%", fontSize: 11, margin: "2px 0 6px" }}
          >
            {paletteKeys.map((p) => (
              <option key={p} value={p}>
                {p}
                {DIVERGING_PALETTES.has(p) ? "  (diverging)" : ""}
              </option>
            ))}
          </select>
          <PaletteStrip palette={vis.palette} />
        </label>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginBottom: 6 }}>
          <label style={{ fontSize: 11, flex: 1, display: "block" }}>
            <span className="dv-label">Min</span>
            <NumberInput
              value={vis.vmin}
              step="0.1"
              onChange={(e) => updVis({ vmin: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ fontSize: 11, flex: 1, display: "block" }}>
            <span className="dv-label">Max</span>
            <NumberInput
              value={vis.vmax}
              step="0.1"
              onChange={(e) => updVis({ vmax: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <button onClick={autoVRange} className="dv-btn dv-btn-secondary" style={{ fontSize: 11 }}>
          Auto from data
        </button>
      </ControlSection>

      <ControlSection title="Cell borders">
        <div className="dv-seg" role="group" aria-label="Cell borders">
          <button
            type="button"
            className={"dv-seg-btn" + (!cellBorder.on ? " dv-seg-btn-active" : "")}
            onClick={() => updCellBorder({ on: false })}
          >
            Off
          </button>
          <button
            type="button"
            className={"dv-seg-btn" + (cellBorder.on ? " dv-seg-btn-active" : "")}
            onClick={() => updCellBorder({ on: true })}
          >
            On
          </button>
        </div>
        {cellBorder.on && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <ColorInput
              value={cellBorder.color}
              onChange={(c) => updCellBorder({ color: c })}
              size={18}
            />
            <label style={{ fontSize: 11, flex: 1 }}>
              Width
              <input
                type="number"
                value={cellBorder.width}
                min="0.25"
                step="0.25"
                max="2"
                onChange={(e) => updCellBorder({ width: parseFloat(e.target.value) || 0.5 })}
                style={{ width: "100%", fontSize: 11, marginTop: 2 }}
              />
            </label>
          </div>
        )}
      </ControlSection>

      <ControlSection title="Labels">
        <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
          Title
          <input
            type="text"
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            style={{ width: "100%", fontSize: 11, marginTop: 2 }}
          />
        </label>
        <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
          Subtitle
          <input
            type="text"
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            style={{ width: "100%", fontSize: 11, marginTop: 2 }}
          />
        </label>
        <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
          X-axis label
          <input
            type="text"
            value={vis.colAxisLabel}
            onChange={(e) => updVis({ colAxisLabel: e.target.value })}
            style={{ width: "100%", fontSize: 11, marginTop: 2 }}
          />
        </label>
        <label style={{ fontSize: 11, display: "block", marginBottom: 6 }}>
          Y-axis label
          <input
            type="text"
            value={vis.rowAxisLabel}
            onChange={(e) => updVis({ rowAxisLabel: e.target.value })}
            style={{ width: "100%", fontSize: 11, marginTop: 2 }}
          />
        </label>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Row names</div>
          <div className="dv-seg" role="group" aria-label="Show row names">
            <button
              type="button"
              className={"dv-seg-btn" + (!vis.showRowLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showRowLabels: false })}
            >
              Off
            </button>
            <button
              type="button"
              className={"dv-seg-btn" + (vis.showRowLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showRowLabels: true })}
            >
              On
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            Column names
          </div>
          <div className="dv-seg" role="group" aria-label="Show column names">
            <button
              type="button"
              className={"dv-seg-btn" + (!vis.showColLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showColLabels: false })}
            >
              Off
            </button>
            <button
              type="button"
              className={"dv-seg-btn" + (vis.showColLabels ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showColLabels: true })}
            >
              On
            </button>
          </div>
        </div>
      </ControlSection>
    </div>
  );
}

// ── R script export ──────────────────────────────────────────────────────────
// Emits a self-contained .R file that reproduces the currently plotted heatmap
// using pheatmap. The raw (pre-normalisation) matrix is embedded so the script
// runs without any external file.

function buildHeatmapRScript({
  rawMatrix,
  normalization,
  rowMode,
  colMode,
  rowK,
  colK,
  kmeansSeed,
  distanceMetric,
  linkageMethod,
  palette,
  vmin,
  vmax,
  plotTitle,
  cellBorder,
}) {
  const { rowLabels, colLabels, matrix } = rawMatrix;
  const rowNamesR = "c(" + rowLabels.map((l) => `"${sanitizeRString(l)}"`).join(", ") + ")";
  const colNamesR = "c(" + colLabels.map((l) => `"${sanitizeRString(l)}"`).join(", ") + ")";
  const flat = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) flat.push(matrix[r][c]);
  }
  const dataRows = [];
  const perLine = colLabels.length;
  for (let i = 0; i < flat.length; i += perLine) {
    dataRows.push(
      "    " +
        flat
          .slice(i, i + perLine)
          .map(formatRNumber)
          .join(", ")
    );
  }
  const dataLiteral = "c(\n" + dataRows.join(",\n") + "\n  )";
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const stopsR = "c(" + stops.map((c) => `"${c}"`).join(", ") + ")";

  // pheatmap speaks "correlation" directly; map our metric accordingly.
  const pheatmapDist =
    distanceMetric === "correlation" ? "correlation" : distanceMetric || "euclidean";

  const lines = [];
  lines.push("# Dataviz Toolbox — Heatmap R script export");
  lines.push("# Generated " + new Date().toISOString());
  lines.push("#");
  lines.push("# Reproduces the normalisation + hierarchical clustering");
  lines.push("# you saw in the browser tool, using the {pheatmap} package.");
  lines.push("# To swap in your own data, replace the matrix block below with:");
  lines.push('#   mat <- as.matrix(read.csv("your_file.csv", row.names = 1,');
  lines.push("#                             check.names = FALSE))");
  lines.push("");
  lines.push('if (!requireNamespace("pheatmap", quietly = TRUE))');
  lines.push('  install.packages("pheatmap")');
  lines.push("library(pheatmap)");
  lines.push("");
  lines.push("# ── Raw data ───────────────────────────────────────────────────────────────");
  lines.push("row_labels <- " + rowNamesR);
  lines.push("col_labels <- " + colNamesR);
  lines.push("mat <- matrix(");
  lines.push("  " + dataLiteral + ",");
  lines.push("  nrow = length(row_labels),");
  lines.push("  byrow = TRUE,");
  lines.push("  dimnames = list(row_labels, col_labels)");
  lines.push(")");
  lines.push("");
  lines.push("# ── Normalisation ──────────────────────────────────────────────────────────");
  lines.push('# Toolbox setting: "' + normalization + '"');
  if (normalization === "zrow") {
    lines.push("# Z-score by row: (x - rowMean) / rowSD");
    lines.push("mat <- t(scale(t(mat)))");
  } else if (normalization === "zcol") {
    lines.push("# Z-score by column: (x - colMean) / colSD");
    lines.push("mat <- scale(mat)");
  } else if (normalization === "log2") {
    lines.push("# log2(x + 1) — gentle compression for right-skewed data");
    lines.push("mat <- log2(mat + 1)");
  } else {
    lines.push("# No normalisation — plot raw values.");
  }
  lines.push("");
  lines.push("# ── Clustering ─────────────────────────────────────────────────────────────");
  const rowUsesK = rowMode === "kmeans";
  const colUsesK = colMode === "kmeans";
  lines.push("# Rows: " + rowMode + (rowUsesK ? ` (k = ${rowK})` : ""));
  lines.push("# Columns: " + colMode + (colUsesK ? ` (k = ${colK})` : ""));
  if (rowUsesK || colUsesK) {
    lines.push("# K-means reorders the matrix by cluster id before plotting; pheatmap then");
    lines.push("# renders the rows/columns as-is (cluster_rows = FALSE for the k-means axis).");
    lines.push("set.seed(" + (kmeansSeed || 1) + ")");
    if (rowUsesK) {
      lines.push(
        "row_km <- kmeans(mat, centers = " +
          rowK +
          ', nstart = 8, iter.max = 100, algorithm = "Hartigan-Wong")'
      );
      lines.push("row_order <- order(row_km$cluster)");
      lines.push("mat <- mat[row_order, , drop = FALSE]");
      lines.push("row_clusters <- row_km$cluster[row_order]");
    }
    if (colUsesK) {
      lines.push(
        "col_km <- kmeans(t(mat), centers = " +
          colK +
          ', nstart = 8, iter.max = 100, algorithm = "Hartigan-Wong")'
      );
      lines.push("col_order <- order(col_km$cluster)");
      lines.push("mat <- mat[, col_order, drop = FALSE]");
      lines.push("col_clusters <- col_km$cluster[col_order]");
    }
  }
  if (rowMode === "hierarchical" || colMode === "hierarchical") {
    lines.push(
      '# Hierarchical settings: distance = "' +
        (distanceMetric || "euclidean") +
        '", linkage = "' +
        (linkageMethod || "average") +
        '"'
    );
  }
  lines.push("");
  lines.push("# ── Colour scale ───────────────────────────────────────────────────────────");
  lines.push(
    "# Palette: " + palette + (DIVERGING_PALETTES.has(palette) ? " (diverging)" : " (sequential)")
  );
  lines.push("palette_stops <- " + stopsR);
  lines.push("heat_colors <- colorRampPalette(palette_stops)(100)");
  lines.push(
    "breaks <- seq(" + formatRNumber(vmin) + ", " + formatRNumber(vmax) + ", length.out = 101)"
  );
  lines.push("");
  lines.push("# ── Plot ───────────────────────────────────────────────────────────────────");
  lines.push("pheatmap(");
  lines.push("  mat,");
  // K-means already reordered the matrix — let pheatmap render that axis as-is.
  lines.push("  cluster_rows = " + (rowMode === "hierarchical" ? "TRUE" : "FALSE") + ",");
  lines.push("  cluster_cols = " + (colMode === "hierarchical" ? "TRUE" : "FALSE") + ",");
  if (rowMode === "hierarchical" || colMode === "hierarchical") {
    lines.push('  clustering_distance_rows = "' + pheatmapDist + '",');
    lines.push('  clustering_distance_cols = "' + pheatmapDist + '",');
    lines.push('  clustering_method = "' + (linkageMethod || "average") + '",');
  }
  lines.push("  color = heat_colors,");
  lines.push("  breaks = breaks,");
  const borderR = cellBorder && cellBorder.on ? `"${cellBorder.color}"` : "NA";
  lines.push("  border_color = " + borderR + ",");
  if (plotTitle) {
    lines.push('  main = "' + sanitizeRString(plotTitle) + '",');
  }
  if (rowUsesK) {
    lines.push("  annotation_row = data.frame(cluster = factor(row_clusters),");
    lines.push("                              row.names = rownames(mat)),");
  }
  if (colUsesK) {
    lines.push("  annotation_col = data.frame(cluster = factor(col_clusters),");
    lines.push("                              row.names = colnames(mat)),");
  }
  lines.push("  show_rownames = TRUE,");
  lines.push("  show_colnames = TRUE");
  lines.push(")");
  lines.push("");
  return lines.join("\n");
}

function buildCsvExport({ rowLabels, colLabels, matrix, rowOrder, colOrder }) {
  const headers = [""].concat(colOrder.map((i) => colLabels[i]));
  const rows = rowOrder.map((ri) => {
    const cells = colOrder.map((ci) => {
      const v = matrix[ri][ci];
      return Number.isFinite(v) ? String(v) : "";
    });
    return [rowLabels[ri]].concat(cells);
  });
  return { headers, rows };
}

// ── Embedded example dataset (500 genes × 6 samples) ────────────────────────
// Generated deterministically from a seeded RNG so the example is reproducible
// across reloads. Five latent response patterns with 100 genes each — stress
// induced (strong / moderate / mild), stress repressed, non-responsive —
// arranged so clustering (hierarchical or k=5 k-means) recovers meaningful
// structure and the zoom/detail view has a non-trivial matrix to slice.
const EXAMPLE_CSV = (() => {
  const rand = seededRandom(42);
  const header = "gene,Control1,Control2,Control3,Stress1,Stress2,Stress3";
  // Each pattern: [ctrlLo, ctrlHi] and [stressLo, stressHi] sampling ranges
  // for the per-gene base level, plus a per-replicate noise amplitude.
  const patterns = [
    { label: "up-strong", ctrl: [0.6, 1.4], stress: [3.8, 5.6], noise: 0.35 },
    { label: "up-moderate", ctrl: [0.8, 1.6], stress: [2.2, 3.4], noise: 0.3 },
    { label: "up-mild", ctrl: [0.7, 1.5], stress: [1.8, 2.6], noise: 0.25 },
    { label: "down", ctrl: [3.2, 4.8], stress: [0.6, 1.4], noise: 0.35 },
    { label: "flat", ctrl: [0.8, 2.4], stress: [0.8, 2.4], noise: 0.3 },
  ];
  const perPattern = 100;
  const lines = [header];
  let geneIdx = 0;
  for (const p of patterns) {
    for (let i = 0; i < perPattern; i++) {
      geneIdx++;
      const geneName = `gene${String(geneIdx).padStart(3, "0")}`;
      const ctrlBase = p.ctrl[0] + rand() * (p.ctrl[1] - p.ctrl[0]);
      const stressBase = p.stress[0] + rand() * (p.stress[1] - p.stress[0]);
      const cols = [];
      for (let j = 0; j < 3; j++) cols.push((ctrlBase + (rand() - 0.5) * 2 * p.noise).toFixed(2));
      for (let j = 0; j < 3; j++) cols.push((stressBase + (rand() - 0.5) * 2 * p.noise).toFixed(2));
      lines.push([geneName, ...cols].join(","));
    }
  }
  return lines.join("\n");
})();

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState(null);
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);

  const [rawMatrix, setRawMatrix] = useState({ rowLabels: [], colLabels: [], matrix: [] });
  const [warnings, setWarnings] = useState({ nonNumeric: 0 });

  const [normalization, setNormalization] = useState("none");
  const [rowMode, setRowMode] = useState("hierarchical");
  const [colMode, setColMode] = useState("hierarchical");
  const [rowK, setRowK] = useState(3);
  const [colK, setColK] = useState(3);
  const [kmeansSeed, setKmeansSeed] = useState(1);
  const [distanceMetric, setDistanceMetric] = useState("euclidean");
  const [linkageMethod, setLinkageMethod] = useState("average");

  const visInit = {
    palette: "viridis",
    vmin: 0,
    vmax: 1,
    plotTitle: "",
    plotSubtitle: "",
    colAxisLabel: "",
    rowAxisLabel: "",
    // Row labels default OFF — at hundreds-of-rows matrices the labels don't
    // fit next to 2–3 px-tall cells anyway, and showing them forces a wide
    // right margin. Users with short matrices can re-enable via PlotControls.
    showRowLabels: false,
    showColLabels: true,
  };
  const [vis, updVis] = useReducer(
    (s, a) => (a._reset ? { ...visInit } : { ...s, ...a }),
    visInit,
    (init) => loadAutoPrefs("heatmap", init)
  );
  useEffect(() => {
    saveAutoPrefs("heatmap", vis);
  }, [vis]);

  const cellBorderInit = { on: false, color: "#ffffff", width: 0.5 };
  const [cellBorder, updCellBorder] = useReducer(
    (s, a) => (a._reset ? { ...cellBorderInit } : { ...s, ...a }),
    cellBorderInit
  );

  const chartRef = useRef();
  const detailChartRef = useRef();
  const matrixRef = useRef(null);

  // Selection state: which rows / columns are highlighted for the detail view.
  // `null` on an axis means "all rows/cols". Indices are into the ORIGINAL
  // rawMatrix, not into rowOrder/colOrder — so clustering changes don't
  // invalidate them.
  const [selection, setSelection] = useState({ rows: null, cols: null });

  const selectBox = useCallback((rows, cols) => {
    setSelection({
      rows: rows && rows.length ? rows : null,
      cols: cols && cols.length ? cols : null,
    });
  }, []);
  // Axis-scoped selection (dendrogram branch / cluster strip click) REPLACES
  // any prior selection rather than layering onto it — otherwise clicking a
  // column subtree after a row brush would intersect the two, which doesn't
  // match the user's mental model of "show me this subtree".
  const selectAxis = useCallback((axis, indices) => {
    const valid = indices && indices.length ? indices : null;
    setSelection({
      rows: axis === "row" ? valid : null,
      cols: axis === "col" ? valid : null,
    });
  }, []);
  const clearSelection = useCallback(() => setSelection({ rows: null, cols: null }), []);

  // Normalised matrix (memoised on the raw matrix + mode).
  const normalized = useMemo(
    () => normalizeMatrix(rawMatrix.matrix, normalization),
    [rawMatrix, normalization]
  );

  // Clustering — expensive; only recompute when relevant inputs change.
  const rowCluster = useMemo(() => {
    if (rowMode === "hierarchical") {
      if (normalized.length < 2) return null;
      const D = pairwiseDistance(normalized, distanceMetric);
      const h = hclust(D, linkageMethod);
      return { mode: "hierarchical", tree: h.tree, order: h.order };
    }
    if (rowMode === "kmeans") {
      if (normalized.length < 2) return null;
      const k = Math.max(2, Math.min(rowK, normalized.length));
      const res = kmeans(normalized, k, { seed: kmeansSeed });
      return { mode: "kmeans", clusters: res.clusters, order: res.order, k };
    }
    return null;
  }, [rowMode, normalized, distanceMetric, linkageMethod, rowK, kmeansSeed]);

  const colCluster = useMemo(() => {
    if (normalized.length < 1 || normalized[0].length < 2) return null;
    // Transpose once — both hierarchical and k-means need column-as-observation.
    const nRows = normalized.length;
    const nCols = normalized[0].length;
    const T = Array.from({ length: nCols }, (_, c) => {
      const row = new Array(nRows);
      for (let r = 0; r < nRows; r++) row[r] = normalized[r][c];
      return row;
    });
    if (colMode === "hierarchical") {
      const D = pairwiseDistance(T, distanceMetric);
      const h = hclust(D, linkageMethod);
      return { mode: "hierarchical", tree: h.tree, order: h.order };
    }
    if (colMode === "kmeans") {
      const k = Math.max(2, Math.min(colK, nCols));
      const res = kmeans(T, k, { seed: kmeansSeed });
      return { mode: "kmeans", clusters: res.clusters, order: res.order, k };
    }
    return null;
  }, [colMode, normalized, distanceMetric, linkageMethod, colK, kmeansSeed]);

  const rowOrder = useMemo(() => {
    if (rowCluster) return rowCluster.order;
    return rawMatrix.rowLabels.map((_, i) => i);
  }, [rowCluster, rawMatrix.rowLabels]);

  const colOrder = useMemo(() => {
    if (colCluster) return colCluster.order;
    return rawMatrix.colLabels.map((_, i) => i);
  }, [colCluster, rawMatrix.colLabels]);

  // Detail slice — honours current rowOrder/colOrder for visual continuity
  // with the main plot, but filters to the selection (null = all on axis).
  const detailRowOrder = useMemo(() => {
    if (!selection.rows) return rowOrder;
    const keep = new Set(selection.rows);
    return rowOrder.filter((i) => keep.has(i));
  }, [rowOrder, selection.rows]);
  const detailColOrder = useMemo(() => {
    if (!selection.cols) return colOrder;
    const keep = new Set(selection.cols);
    return colOrder.filter((i) => keep.has(i));
  }, [colOrder, selection.cols]);
  const hasSelection = selection.rows !== null || selection.cols !== null;

  // A brush on the MAIN chart sends display-space (ri, ci) ranges; convert to
  // original indices via rowOrder/colOrder before storing in selection.
  const onBrushEnd = useCallback(
    ({ riMin, riMax, ciMin, ciMax }) => {
      const rows = [];
      for (let ri = riMin; ri <= riMax; ri++) if (rowOrder[ri] != null) rows.push(rowOrder[ri]);
      const cols = [];
      for (let ci = ciMin; ci <= ciMax; ci++) if (colOrder[ci] != null) cols.push(colOrder[ci]);
      selectBox(rows, cols);
    },
    [rowOrder, colOrder, selectBox]
  );

  // Any change in cluster structure invalidates the current selection —
  // the indices still point at real rows/cols but the user's mental map is
  // now wrong. Clear rather than silently mis-highlight.
  React.useEffect(() => {
    clearSelection();
  }, [
    rowMode,
    colMode,
    rowK,
    colK,
    kmeansSeed,
    distanceMetric,
    linkageMethod,
    normalization,
    clearSelection,
  ]);

  // Keep the CSV-export ref in sync with what's currently plotted.
  matrixRef.current = {
    rowLabels: rawMatrix.rowLabels,
    colLabels: rawMatrix.colLabels,
    matrix: normalized,
    rowOrder,
    colOrder,
  };

  const autoVRange = useCallback(() => {
    const diverging = DIVERGING_PALETTES.has(vis.palette) || normalization.startsWith("z");
    const [lo, hi] = autoRange(normalized, diverging);
    updVis({ vmin: Number(lo.toFixed(3)), vmax: Number(hi.toFixed(3)) });
  }, [normalized, vis.palette, normalization]);

  const canNavigate = useCallback(
    (target) => {
      if (target === "upload") return true;
      if (target === "configure") return rawMatrix.rowLabels.length > 0;
      if (target === "plot") return rawMatrix.rowLabels.length > 0;
      return false;
    },
    [rawMatrix]
  );

  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    const parsed = parseWideMatrix(dc.text, sep);
    if (!parsed.rowLabels.length || !parsed.colLabels.length) {
      setParseError(
        "The file needs at least one row label column and one data column with a header."
      );
      return;
    }
    setParseError(null);
    setRawMatrix({
      rowLabels: parsed.rowLabels,
      colLabels: parsed.colLabels,
      matrix: parsed.matrix,
    });
    setWarnings(parsed.warnings);

    // Auto-range the colour scale from the raw data on first load.
    const diverging = DIVERGING_PALETTES.has("viridis"); // false; just for signature parity
    const [lo, hi] = autoRange(parsed.matrix, diverging);
    updVis({
      vmin: Number(lo.toFixed(3)),
      vmax: Number(hi.toFixed(3)),
    });
    setStep("configure");
  }, []);

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );

  const loadExample = useCallback(() => {
    setSepOverride(",");
    setFileName("stress_response_genes.csv");
    doParse(EXAMPLE_CSV, ",");
  }, [doParse]);

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setRawMatrix({ rowLabels: [], colLabels: [], matrix: [] });
    setWarnings({ nonNumeric: 0 });
    setNormalization("none");
    setRowMode("hierarchical");
    setColMode("hierarchical");
    setRowK(3);
    setColK(3);
    setKmeansSeed(1);
    setDistanceMetric("euclidean");
    setLinkageMethod("average");
    setParseError(null);
    updVis({ _reset: true });
    updCellBorder({ _reset: true });
  };

  const nRows = rawMatrix.rowLabels.length;
  const nCols = rawMatrix.colLabels.length;
  const oversize = nRows > 500 || nCols > 500;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <PageHeader
        toolName="heatmap"
        title="Heatmap"
        subtitle="Matrix view with hierarchical clustering"
        right={<PrefsPanel tool="heatmap" vis={vis} visInit={visInit} updVis={updVis} />}
      />

      <StepNavBar
        steps={["upload", "configure", "plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={canNavigate}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      {parseError && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>🚫</span>
          <span
            style={{
              fontSize: 12,
              color: "var(--danger-text)",
              fontWeight: 600,
              whiteSpace: "pre-line",
            }}
          >
            {parseError}
          </span>
        </div>
      )}

      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          handleFileLoad={handleFileLoad}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && nRows > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <strong>{fileName || "Pasted data"}</strong> — parsed {nRows} rows × {nCols} columns
            {warnings.nonNumeric > 0 && (
              <>
                {" "}
                ·{" "}
                <span style={{ color: "var(--warning-text)" }}>
                  {warnings.nonNumeric} non-numeric cell{warnings.nonNumeric > 1 ? "s" : ""}{" "}
                  rendered as NaN
                </span>
              </>
            )}
            {oversize && (
              <>
                {" "}
                ·{" "}
                <span style={{ color: "var(--warning-text)" }}>
                  matrix is large — clustering may take a few seconds
                </span>
              </>
            )}
          </p>
          <DataPreview
            headers={[""].concat(rawMatrix.colLabels)}
            rows={rawMatrix.matrix.map((row, ri) =>
              [rawMatrix.rowLabels[ri]].concat(
                row.map((v) => (Number.isFinite(v) ? String(v) : ""))
              )
            )}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => setStep("upload")} className="dv-btn dv-btn-secondary">
              ← Upload
            </button>
            <button onClick={() => setStep("plot")} className="dv-btn dv-btn-primary">
              Continue to plot →
            </button>
          </div>
        </div>
      )}

      {step === "plot" && nRows > 0 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              vis={vis}
              updVis={updVis}
              cellBorder={cellBorder}
              updCellBorder={updCellBorder}
              chartRef={chartRef}
              matrixRef={matrixRef}
              rawMatrix={rawMatrix}
              resetAll={resetAll}
              fileName={fileName}
              normalization={normalization}
              setNormalization={setNormalization}
              rowMode={rowMode}
              setRowMode={setRowMode}
              colMode={colMode}
              setColMode={setColMode}
              rowK={rowK}
              setRowK={setRowK}
              colK={colK}
              setColK={setColK}
              kmeansSeed={kmeansSeed}
              setKmeansSeed={setKmeansSeed}
              distanceMetric={distanceMetric}
              setDistanceMetric={setDistanceMetric}
              linkageMethod={linkageMethod}
              setLinkageMethod={setLinkageMethod}
              autoVRange={autoVRange}
            />

            <div
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div
                className="dv-panel dv-plot-card"
                style={{
                  padding: 20,
                  background: "var(--plot-card-bg)",
                  borderColor: "var(--plot-card-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {hasSelection && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      alignSelf: "stretch",
                    }}
                  >
                    <button
                      onClick={clearSelection}
                      className="dv-btn dv-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                <HeatmapChart
                  ref={chartRef}
                  rowLabels={rawMatrix.rowLabels}
                  colLabels={rawMatrix.colLabels}
                  matrix={normalized}
                  rawMatrix={rawMatrix.matrix}
                  rowOrder={rowOrder}
                  colOrder={colOrder}
                  rowCluster={rowCluster}
                  colCluster={colCluster}
                  vmin={vis.vmin}
                  vmax={vis.vmax}
                  palette={vis.palette}
                  cellBorder={cellBorder}
                  plotTitle={vis.plotTitle}
                  plotSubtitle={vis.plotSubtitle}
                  rowAxisLabel={vis.rowAxisLabel}
                  colAxisLabel={vis.colAxisLabel}
                  showRowLabels={vis.showRowLabels}
                  showColLabels={vis.showColLabels}
                  interactive={true}
                  selection={selection}
                  onBrushEnd={onBrushEnd}
                  onAxisSelect={selectAxis}
                  onClearSelection={clearSelection}
                />
              </div>

              {hasSelection && (
                <DetailView
                  rawMatrix={rawMatrix}
                  normalized={normalized}
                  detailRowOrder={detailRowOrder}
                  detailColOrder={detailColOrder}
                  mainRowOrder={rowOrder}
                  mainColOrder={colOrder}
                  mainRowCluster={rowCluster}
                  mainColCluster={colCluster}
                  vis={vis}
                  cellBorder={cellBorder}
                  clearSelection={clearSelection}
                  detailChartRef={detailChartRef}
                  fileName={fileName}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailView({
  rawMatrix,
  normalized,
  detailRowOrder,
  detailColOrder,
  mainRowOrder,
  mainColOrder,
  mainRowCluster,
  mainColCluster,
  vis,
  cellBorder,
  clearSelection,
  detailChartRef,
  fileName,
}) {
  // Match the main chart's cell size and colourbar length so cells read at the
  // same visual scale and the legend gradients line up. Horizontally we align
  // cells to the main plot so the selection sits directly under its source
  // columns (column counts stay small, so gutters are harmless). Vertically we
  // stay compact — a tall main plot would otherwise leave a huge blank gutter
  // above a selection near the bottom.
  const mainRowCount = mainRowOrder.length;
  const mainColCount = mainColOrder.length;
  const detailRowCount = detailRowOrder.length;
  // Column width stays locked to the main's cellW so cells align vertically
  // between the two plots. Row height, on the other hand, is enlarged in the
  // detail view — that's the whole point of zooming: each selected row gets
  // more pixels, and the row labels (10 px text) stop colliding when the
  // names toggle is on. We floor at 14 px (enough for a clean label) and cap
  // at 28 px so a tiny selection doesn't blow up into a giant ribbon.
  const baseCellW = Math.max(2, Math.min(28, Math.floor(720 / Math.max(1, mainColCount))));
  const mainCellH = Math.max(2, Math.min(28, Math.floor(480 / Math.max(1, mainRowCount))));
  const baseCellH = Math.max(14, Math.min(28, Math.floor(720 / Math.max(1, detailRowCount))));
  // Colourbar length mirrors the MAIN plot's legend so the two gradients read
  // at the same scale, independent of the detail's enlarged row height.
  const baseColorbarH = Math.min(180, Math.max(60, Math.round(mainCellH * mainRowCount * 0.6)));
  // Column-only alignment: pad the detail's plot width to the main's, and
  // offset the detail columns so they render at the same x-positions as in the
  // main plot. Only applied when the selected columns are a contiguous run in
  // the main's display order (otherwise absolute positioning makes no sense).
  const mainColIndex = new Map(mainColOrder.map((c, i) => [c, i]));
  const detailColPositions = detailColOrder.map((c) => mainColIndex.get(c));
  let colsContiguous = detailColPositions.length > 0 && detailColPositions.every((p) => p != null);
  if (colsContiguous) {
    for (let i = 1; i < detailColPositions.length; i++) {
      if (detailColPositions[i] !== detailColPositions[i - 1] + 1) {
        colsContiguous = false;
        break;
      }
    }
  }
  const cellOffsetCols = colsContiguous ? detailColPositions[0] : 0;
  // Mirror the main's reserved dendrogram space so the detail's left margin
  // equals the main's — without this, detail (no dendrograms) would shift
  // left by DENDRO_SIZE_LEFT and its columns wouldn't line up with main's.
  const mainRowIsHier =
    mainRowCluster && mainRowCluster.mode === "hierarchical" && mainRowCluster.tree;
  const mainRowIsKmeans = mainRowCluster && mainRowCluster.mode === "kmeans";
  const mainColIsHier =
    mainColCluster && mainColCluster.mode === "hierarchical" && mainColCluster.tree;
  const mainColIsKmeans = mainColCluster && mainColCluster.mode === "kmeans";
  const baseDendroSizeLeft = mainRowIsHier ? 60 : mainRowIsKmeans ? 14 : 0;
  const baseDendroSizeTop = mainColIsHier ? 60 : mainColIsKmeans ? 14 : 0;
  // Replicate the main HeatmapChart's k-means gap math so the detail can
  // (1) include the main's totalColGap in its plot width — keeping the
  // detail SVG the same width as the main — and (2) push detail cells
  // right by the cumulative gap that sits to the LEFT of the selection's
  // first column in the main, so contiguous detail columns land at the
  // exact x positions of their originating main columns.
  const K_GAP = 10;
  let mainTotalColGap = 0;
  let mainColGapStartPx = 0;
  if (mainColIsKmeans) {
    let acc = 0;
    for (let ci = 1; ci < mainColOrder.length; ci++) {
      const prev = mainColCluster.clusters[mainColOrder[ci - 1]];
      const cur = mainColCluster.clusters[mainColOrder[ci]];
      if (cur !== prev) acc += K_GAP;
      if (ci === cellOffsetCols) mainColGapStartPx = acc;
    }
    mainTotalColGap = acc;
  }
  const basePlotW = baseCellW * mainColCount + mainTotalColGap;
  const base = fileBaseName(fileName || "heatmap") || "heatmap";
  const detailMatrixRef = useRef(null);
  detailMatrixRef.current = {
    rowLabels: rawMatrix.rowLabels,
    colLabels: rawMatrix.colLabels,
    matrix: normalized,
    rowOrder: detailRowOrder,
    colOrder: detailColOrder,
  };
  const nR = detailRowOrder.length;
  const nC = detailColOrder.length;
  const tableHeaders = [""].concat(detailColOrder.map((ci) => rawMatrix.colLabels[ci]));
  const tableRows = detailRowOrder.map((ri) => {
    const cells = detailColOrder.map((ci) => {
      const v = rawMatrix.matrix[ri][ci];
      return Number.isFinite(v) ? String(v) : "";
    });
    return [rawMatrix.rowLabels[ri]].concat(cells);
  });

  const downloadButton = (label, onClick) => (
    <button
      onClick={(e) => {
        onClick(e);
        flashSaved(e.currentTarget);
      }}
      className="dv-btn dv-btn-dl"
      style={{ padding: "4px 10px", fontSize: 11 }}
    >
      ⬇ {label}
    </button>
  );

  return (
    <div
      className="dv-panel dv-plot-card"
      style={{
        padding: 16,
        background: "var(--plot-card-bg)",
        borderColor: "var(--plot-card-border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
          Detail — {nR} row{nR === 1 ? "" : "s"} × {nC} col{nC === 1 ? "" : "s"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {downloadButton("SVG", () =>
            downloadSvg(detailChartRef.current, `${base}_heatmap_detail.svg`)
          )}
          {downloadButton("PNG", () =>
            downloadPng(detailChartRef.current, `${base}_heatmap_detail.png`, 2)
          )}
          {downloadButton("CSV", () => {
            if (!detailMatrixRef.current) return;
            const { headers, rows } = buildCsvExport(detailMatrixRef.current);
            downloadCsv(headers, rows, `${base}_heatmap_detail.csv`);
          })}
          <button
            onClick={clearSelection}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "4px 10px", fontSize: 11 }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
        <HeatmapChart
          ref={detailChartRef}
          rowLabels={rawMatrix.rowLabels}
          colLabels={rawMatrix.colLabels}
          matrix={normalized}
          rawMatrix={rawMatrix.matrix}
          rowOrder={detailRowOrder}
          colOrder={detailColOrder}
          // Forward main's cluster objects so the detail's gap math matches
          // (same K_GAP between cluster boundaries inside the selection); the
          // dendrograms / cluster strips themselves are suppressed via
          // `showClusterStrip={false}` because they belong to the main view.
          rowCluster={mainRowCluster}
          colCluster={mainColCluster}
          showClusterStrip={false}
          vmin={vis.vmin}
          vmax={vis.vmax}
          palette={vis.palette}
          cellBorder={cellBorder}
          plotTitle={vis.plotTitle ? `${vis.plotTitle} — detail` : "Detail"}
          plotSubtitle={vis.plotSubtitle}
          rowAxisLabel={vis.rowAxisLabel}
          colAxisLabel={vis.colAxisLabel}
          showRowLabels={vis.showRowLabels}
          showColLabels={vis.showColLabels}
          interactive={false}
          baseCellW={baseCellW}
          baseCellH={baseCellH}
          baseColorbarH={baseColorbarH}
          // basePlotW now includes the main's totalColGap so the detail SVG
          // matches the main's width; the leading cumulative gap before the
          // selection is forwarded as colGapStartPx so contiguous detail
          // columns land at the exact x positions of their originating cells.
          basePlotW={colsContiguous ? basePlotW : undefined}
          cellOffsetCols={colsContiguous ? cellOffsetCols : 0}
          colGapStartPx={colsContiguous ? mainColGapStartPx : 0}
          baseDendroSizeLeft={baseDendroSizeLeft}
          baseDendroSizeTop={baseDendroSizeTop}
        />
      </div>
      <DataPreview headers={tableHeaders} rows={tableRows} maxRows={50} />
      {nR > 50 && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
          Showing first 50 of {nR} rows. Download CSV for the full selection.
        </p>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Heatmap">
    <App />
  </ErrorBoundary>
);
