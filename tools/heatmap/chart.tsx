// Heatmap chart component (forwardRef SVG) plus the small PaletteStrip
// preview tile the sidebar uses to show the active palette. Pure React/SVG
// — no tool-level state, no side effects beyond ephemeral hover/brush
// local state. Consumes pure geometry / colour helpers from ./helpers and
// otherwise relies on shared globals (COLOR_PALETTES, interpolateColor,
// svgSafeId) resolved through shared.bundle.js.

import {
  DENDRO_STROKE,
  DENDRO_HOVER_STROKE,
  NAN_FILL,
  SELECTION_STROKE,
  HIGHLIGHT_STROKE,
  buildDendroLayout,
  CLUSTER_PALETTE,
  fmtColorbarTick,
} from "./helpers";

const { useState, useMemo, useCallback, useRef, forwardRef } = React;

// ── Palette strip (same shape as scatter.tsx's local helper) ─────────────────

export function PaletteStrip({ palette, invert = false, height = 12 }) {
  const base = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const stops = invert ? [...base].reverse() : base;
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

// Pure helpers (normalizeMatrix, autoRange, buildDendroLayout, pruneDendroTree,
// fmtColorbarTick, constants DENDRO_STROKE / NAN_FILL / SELECTION_STROKE /
// HIGHLIGHT_STROKE / CLUSTER_PALETTE) live in tools/heatmap/helpers.ts.

// ── Heatmap chart ────────────────────────────────────────────────────────────

export const HeatmapChart = forwardRef<SVGSVGElement, any>(function HeatmapChart(
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
    invertPalette = false,
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
    // Independent gate for the k-means colour strip. Defaults to
    // `showClusterStrip` so main-view behaviour is unchanged, but the detail
    // view enables it on its own — dendrograms stay suppressed while the
    // k-means group colours carry over so each zoomed row/column still shows
    // which cluster it belongs to.
    showKmeansStrip = undefined,
    // Stroke width for dendrogram lines in the default (non-hovered) state.
    // The main plot uses the literal 1 that was previously hard-coded; the
    // detail view bumps this up so the pruned subtree reads at a smaller
    // tile. Hover stroke scales with it (hoverFactor * base) so the hover
    // highlight stays visually distinct.
    dendrogramStrokeWidth = 1,
  },
  ref
) {
  const nRows = rowOrder.length;
  const nCols = colOrder.length;
  const paletteBase = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const stops = invertPalette ? [...paletteBase].reverse() : paletteBase;

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
  // Memoize the per-axis gap arrays so the cells useMemo below sees stable
  // references when only hover/brush state changes — without this the cells
  // JSX would rebuild on every mousemove because `new Array(...)` is a fresh
  // reference each render.
  const colGapOffsets = useMemo(() => {
    const arr = new Array(nCols).fill(0);
    if (colIsKmeans) {
      for (let ci = 1; ci < nCols; ci++) {
        const prev = colCluster.clusters[colOrder[ci - 1]];
        const cur = colCluster.clusters[colOrder[ci]];
        arr[ci] = arr[ci - 1] + (cur !== prev ? K_GAP : 0);
      }
    }
    return arr;
  }, [nCols, colIsKmeans, colCluster, colOrder]);
  const rowGapOffsets = useMemo(() => {
    const arr = new Array(nRows).fill(0);
    if (rowIsKmeans) {
      for (let ri = 1; ri < nRows; ri++) {
        const prev = rowCluster.clusters[rowOrder[ri - 1]];
        const cur = rowCluster.clusters[rowOrder[ri]];
        arr[ri] = arr[ri - 1] + (cur !== prev ? K_GAP : 0);
      }
    }
    return arr;
  }, [nRows, rowIsKmeans, rowCluster, rowOrder]);
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
  // Extra reserved margin for rotated per-band "Cluster n° X" labels above the
  // col k-means strip / left of the row k-means strip. Sized to fit a ~12-char
  // label at fontSize 10 (≈ 60 px) plus 4 px padding between label tail and
  // strip edge. Zero when the relevant axis isn't k-means or when the strip
  // isn't drawn (hierarchical mode and the detail view when showKmeansStrip
  // is off both skip the strip — and therefore the label band too).
  const effShowKmeans = showKmeansStrip != null ? showKmeansStrip : showClusterStrip;
  const CLUSTER_LABEL_H = colIsKmeans && effShowKmeans ? 24 : 0;
  const CLUSTER_LABEL_W = rowIsKmeans && effShowKmeans ? 92 : 0;
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
    top:
      TITLE_H + 10 + AXIS_LABEL_TOP + CLUSTER_LABEL_H + COL_LABEL_H + LABEL_GAP + DENDRO_SIZE_TOP,
    left: AXIS_LABEL_LEFT + CLUSTER_LABEL_W + DENDRO_SIZE_LEFT + LABEL_GAP,
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
                strokeWidth={active ? 2.5 * dendrogramStrokeWidth : dendrogramStrokeWidth}
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
                  fill="none"
                  pointerEvents="all"
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
                strokeWidth={active ? 2.5 * dendrogramStrokeWidth : dendrogramStrokeWidth}
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
                  fill="none"
                  pointerEvents="all"
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
    // Contiguous runs along colOrder → one horizontal "Cluster n° X" label
    // per run, centered on the band and parked in the reserved
    // CLUSTER_LABEL_H band directly above the strip.
    const bands = [];
    for (let i = 0; i < colOrder.length; ) {
      const id = colCluster.clusters[colOrder[i]];
      let j = i + 1;
      while (j < colOrder.length && colCluster.clusters[colOrder[j]] === id) j++;
      bands.push({ id, start: i, end: j });
      i = j;
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
                      onAxisSelect &&
                        onAxisSelect("col", leavesByCluster.get(cid), {
                          clusterId: cid,
                        });
                    }
                  : undefined
              }
            />
          );
        })}
        {CLUSTER_LABEL_H > 0 &&
          bands.map((b) => {
            const x0 = MARGIN.left + cellX(b.start);
            const x1 = MARGIN.left + cellX(b.end - 1) + cellWPx(b.end - 1);
            const cx = (x0 + x1) / 2;
            const cy = y - CLUSTER_LABEL_H / 2 - 4;
            return (
              <text
                key={`lbl-${b.id}-${b.start}`}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="#111111"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
                style={{ pointerEvents: "none" }}
              >
                {`Cluster n° ${b.id + 1}`}
              </text>
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
    const bands = [];
    for (let i = 0; i < rowOrder.length; ) {
      const id = rowCluster.clusters[rowOrder[i]];
      let j = i + 1;
      while (j < rowOrder.length && rowCluster.clusters[rowOrder[j]] === id) j++;
      bands.push({ id, start: i, end: j });
      i = j;
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
                      onAxisSelect &&
                        onAxisSelect("row", leavesByCluster.get(cid), {
                          clusterId: cid,
                        });
                    }
                  : undefined
              }
            />
          );
        })}
        {CLUSTER_LABEL_W > 0 &&
          bands.map((b) => {
            const y0 = MARGIN.top + cellY(b.start);
            const y1 = MARGIN.top + cellY(b.end - 1) + cellHPx(b.end - 1);
            const cy = (y0 + y1) / 2;
            const cx = x - CLUSTER_LABEL_W / 2 - 4;
            return (
              <text
                key={`lbl-${b.id}-${b.start}`}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="#111111"
                stroke="#ffffff"
                strokeWidth={3}
                paintOrder="stroke"
                style={{ pointerEvents: "none" }}
              >
                {`Cluster n° ${b.id + 1}`}
              </text>
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

  // Memoize the cell rects — on a 100×100 heatmap that's 10k <rect> elements,
  // and the chart re-renders on every hover/brush mousemove. Cells depend only
  // on data + geometry + color scale, none of which change during interaction,
  // so the memoized JSX is reused until the user actually edits something.
  const cells = useMemo(
    () =>
      rowOrder.map((origRi, ri) =>
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
      ),
    [
      rowOrder,
      colOrder,
      matrix,
      rowLabels,
      colLabels,
      bordersOn,
      cellBorder,
      vmin,
      vmax,
      palette,
      invertPalette,
      cellW,
      cellH,
      cellOffsetCols,
      cellOffsetRows,
      colGapStartPx,
      rowGapStartPx,
      colGapOffsets,
      rowGapOffsets,
    ]
  );

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
        {(showKmeansStrip != null ? showKmeansStrip : showClusterStrip) && renderColClusterStrip()}
        {(showKmeansStrip != null ? showKmeansStrip : showClusterStrip) && renderRowClusterStrip()}

        <g id="chart" transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          <g id="plot-area-background">
            <rect x={0} y={0} width={plotW} height={plotH} fill="#ffffff" />
          </g>
          <g id="cells" shapeRendering={bordersOn ? "auto" : "crispEdges"}>
            {cells}
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

        {/* Interaction overlay — sits above cells for pointer capture + tooltip tracking.
            `fill="none"` + `pointer-events="all"` (not `fill="transparent"`) so that
            Inkscape, which mis-parses the CSS keyword `transparent` in the SVG `fill`
            attribute and falls back to the default (black), doesn't paint a giant
            opaque black rect over the exported plot. */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={plotW}
          height={plotH}
          fill="none"
          pointerEvents="all"
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
