// heatmap.tsx — editable source. Run `npm run build` to compile to heatmap.js.
// Do NOT edit the .js file directly.

const { useState, useReducer, useMemo, useCallback, useRef, forwardRef } = React;

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
const NAN_FILL = "#e0e0e0";
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
  },
  ref
) {
  const nRows = rowOrder.length;
  const nCols = colOrder.length;
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;

  // Longest label lengths drive the margin sizes. Labels render at 10 px.
  const longestRowLabel = Math.max(0, ...rowLabels.map((l) => (l || "").length));
  const longestColLabel = Math.max(0, ...colLabels.map((l) => (l || "").length));

  // Cell size: aim for a readable minimum but cap the total chart size.
  const cellW = Math.max(8, Math.min(28, Math.floor(720 / Math.max(1, nCols))));
  const cellH = Math.max(8, Math.min(28, Math.floor(480 / Math.max(1, nRows))));

  const plotW = cellW * nCols;
  const plotH = cellH * nRows;

  const rowIsHier = rowCluster && rowCluster.mode === "hierarchical" && rowCluster.tree;
  const rowIsKmeans = rowCluster && rowCluster.mode === "kmeans";
  const colIsHier = colCluster && colCluster.mode === "hierarchical" && colCluster.tree;
  const colIsKmeans = colCluster && colCluster.mode === "kmeans";

  const DENDRO_SIZE_TOP = colIsHier ? 60 : colIsKmeans ? 14 : 0;
  const DENDRO_SIZE_LEFT = rowIsHier ? 60 : rowIsKmeans ? 14 : 0;
  const LABEL_GAP = 6;
  const ROW_LABEL_W = Math.min(160, longestRowLabel * 6 + 12);
  const COL_LABEL_H = Math.min(120, Math.round(longestColLabel * 5.5) + 16);

  const TITLE_H = plotTitle ? (plotSubtitle ? 42 : 26) : 0;
  const AXIS_LABEL_TOP = colAxisLabel ? 16 : 0;
  const AXIS_LABEL_LEFT = rowAxisLabel ? 16 : 0;

  const MARGIN = {
    top: TITLE_H + 10 + AXIS_LABEL_TOP + COL_LABEL_H + LABEL_GAP + DENDRO_SIZE_TOP,
    left: AXIS_LABEL_LEFT + DENDRO_SIZE_LEFT + LABEL_GAP,
    right: ROW_LABEL_W + 10,
    bottom: 60, // reserved for gradient colourbar
  };

  const vbW = MARGIN.left + plotW + MARGIN.right;
  const vbH = MARGIN.top + plotH + MARGIN.bottom;

  const bordersOn = cellBorder && cellBorder.on;

  // Cell geometry: when borders are OFF we snap to integer pixels so adjacent
  // rects share a boundary and don't open a sub-pixel seam on PNG export.
  // When borders are ON we use float geometry — strokes anti-alias cleanly.
  const cellX = (ci) => (bordersOn ? ci * cellW : Math.round(ci * cellW));
  const cellY = (ri) => (bordersOn ? ri * cellH : Math.round(ri * cellH));
  const cellWPx = (ci) =>
    bordersOn ? cellW : Math.round((ci + 1) * cellW) - Math.round(ci * cellW);
  const cellHPx = (ri) =>
    bordersOn ? cellH : Math.round((ri + 1) * cellH) - Math.round(ri * cellH);

  const valueToColor = (v) => {
    if (!Number.isFinite(v)) return NAN_FILL;
    const t = (v - vmin) / (vmax - vmin || 1);
    return interpolateColor(stops, Math.max(0, Math.min(1, t)));
  };

  // ── Colourbar (inlined rather than via shared renderSvgLegend: we want full
  //    control over tick placement and the diverging-midpoint hint).
  const cbW = Math.min(260, plotW);
  const cbH = 10;
  const cbX = MARGIN.left;
  const cbY = MARGIN.top + plotH + 28;
  const cbGradId = "heatmap-colorbar-grad";
  const cbStops = stops.map((c, i) =>
    React.createElement("stop", {
      key: i,
      offset: ((i / (stops.length - 1)) * 100).toFixed(2) + "%",
      stopColor: c,
    })
  );

  // Dendrogram helpers — scale from data space into pixel space.
  function renderColDendrogram() {
    if (!colIsHier) return null;
    const { segments, maxHeight } = dendrogramLayout(colCluster.tree);
    if (maxHeight === 0 || segments.length === 0) return null;
    const yBase = MARGIN.top - LABEL_GAP - COL_LABEL_H - LABEL_GAP;
    const yTop = yBase - DENDRO_SIZE_TOP + 4;
    const scaleY = (h) => yBase - (h / maxHeight) * (yBase - yTop);
    const scaleX = (x) => MARGIN.left + x * cellW + cellW / 2;
    return React.createElement(
      "g",
      { id: "col-dendrogram", stroke: DENDRO_STROKE, strokeWidth: 1, fill: "none" },
      segments.map((s, i) =>
        React.createElement("line", {
          key: i,
          x1: scaleX(s.x1),
          y1: scaleY(s.y1),
          x2: scaleX(s.x2),
          y2: scaleY(s.y2),
        })
      )
    );
  }

  function renderRowDendrogram() {
    if (!rowIsHier) return null;
    const { segments, maxHeight } = dendrogramLayout(rowCluster.tree);
    if (maxHeight === 0 || segments.length === 0) return null;
    const xRight = MARGIN.left - LABEL_GAP;
    const xLeft = xRight - DENDRO_SIZE_LEFT + 4;
    const scaleX = (h) => xRight - (h / maxHeight) * (xRight - xLeft);
    const scaleY = (x) => MARGIN.top + x * cellH + cellH / 2;
    // Row dendrogram lies on its side: x-axis is the merge height, y-axis is leaf position.
    return React.createElement(
      "g",
      { id: "row-dendrogram", stroke: DENDRO_STROKE, strokeWidth: 1, fill: "none" },
      segments.map((s, i) =>
        React.createElement("line", {
          key: i,
          x1: scaleX(s.y1),
          y1: scaleY(s.x1),
          x2: scaleX(s.y2),
          y2: scaleY(s.x2),
        })
      )
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
    return (
      <g id="col-cluster-strip">
        {colOrder.map((origCi, ci) => (
          <rect
            key={ci}
            x={MARGIN.left + cellX(ci)}
            y={y}
            width={cellWPx(ci)}
            height={DENDRO_SIZE_TOP - 4}
            fill={clusterColor(colCluster.clusters[origCi])}
            stroke="none"
            shapeRendering="crispEdges"
          />
        ))}
      </g>
    );
  }

  function renderRowClusterStrip() {
    if (!rowIsKmeans) return null;
    const x = MARGIN.left - LABEL_GAP - DENDRO_SIZE_LEFT + 2;
    return (
      <g id="row-cluster-strip">
        {rowOrder.map((origRi, ri) => (
          <rect
            key={ri}
            x={x}
            y={MARGIN.top + cellY(ri)}
            width={DENDRO_SIZE_LEFT - 4}
            height={cellHPx(ri)}
            fill={clusterColor(rowCluster.clusters[origRi])}
            stroke="none"
            shapeRendering="crispEdges"
          />
        ))}
      </g>
    );
  }

  return (
    <svg
      ref={ref}
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
          {plotSubtitle && (
            <text
              x={vbW / 2}
              y={34}
              textAnchor="middle"
              fontFamily="sans-serif"
              fontSize="11"
              fill="#555555"
            >
              {plotSubtitle}
            </text>
          )}
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

      {renderColDendrogram()}
      {renderRowDendrogram()}
      {renderColClusterStrip()}
      {renderRowClusterStrip()}

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

      {/* Row labels */}
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

      {/* Colourbar */}
      <g id="colorbar">
        <defs>
          <linearGradient id={cbGradId} x1="0%" y1="0%" x2="100%" y2="0%">
            {cbStops}
          </linearGradient>
        </defs>
        <rect
          x={cbX}
          y={cbY}
          width={cbW}
          height={cbH}
          fill={`url(#${cbGradId})`}
          stroke="#888888"
          strokeWidth="0.5"
        />
        <text
          x={cbX}
          y={cbY + cbH + 12}
          fontFamily="sans-serif"
          fontSize="9"
          fill="#555555"
          textAnchor="start"
        >
          {fmtColorbarTick(vmin)}
        </text>
        <text
          x={cbX + cbW / 2}
          y={cbY + cbH + 12}
          fontFamily="sans-serif"
          fontSize="9"
          fill="#555555"
          textAnchor="middle"
        >
          {fmtColorbarTick((vmin + vmax) / 2)}
        </text>
        <text
          x={cbX + cbW}
          y={cbY + cbH + 12}
          fontFamily="sans-serif"
          fontSize="9"
          fill="#555555"
          textAnchor="end"
        >
          {fmtColorbarTick(vmax)}
        </text>
      </g>
    </svg>
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
        exampleLabel="Example gene-expression matrix (12 genes × 6 samples)"
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
        <label style={{ fontSize: 11, display: "block", marginTop: 6 }}>
          k
          <input
            type="number"
            value={k}
            step="1"
            min="2"
            max="10"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setK(Math.max(2, Math.min(10, Number.isFinite(v) ? v : 3)));
            }}
            style={{ width: "100%", fontSize: 11, marginTop: 2 }}
          />
        </label>
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
  const sectionLabel = {
    margin: "0 0 8px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };
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

      <div className="dv-panel">
        <p style={sectionLabel}>Normalisation</p>
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
      </div>

      <div className="dv-panel">
        <p style={sectionLabel}>Clustering</p>
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
            <label style={{ fontSize: 11, display: "block" }}>
              K-means · Seed
              <input
                type="number"
                value={kmeansSeed}
                step="1"
                min="1"
                onChange={(e) => setKmeansSeed(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ width: "100%", fontSize: 11, marginTop: 2 }}
              />
            </label>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              Change the seed to try a different k-means++ initialisation.
            </div>
          </div>
        )}
      </div>

      <div className="dv-panel">
        <p style={sectionLabel}>Colour scale</p>
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
      </div>

      <div className="dv-panel">
        <p style={sectionLabel}>Cell borders</p>
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
      </div>

      <div className="dv-panel">
        <p style={sectionLabel}>Labels</p>
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
        <label style={{ fontSize: 11, display: "block" }}>
          Y-axis label
          <input
            type="text"
            value={vis.rowAxisLabel}
            onChange={(e) => updVis({ rowAxisLabel: e.target.value })}
            style={{ width: "100%", fontSize: 11, marginTop: 2 }}
          />
        </label>
      </div>
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

// ── Small embedded example dataset ──────────────────────────────────────────

const EXAMPLE_CSV = `gene,Control1,Control2,Control3,Stress1,Stress2,Stress3
DREB2A,0.8,1.1,0.9,4.2,3.8,4.5
RD29A,1.0,0.9,1.1,5.8,6.1,5.5
RD29B,0.5,0.7,0.6,3.1,3.4,2.9
COR15A,1.2,1.0,1.3,4.9,5.2,4.6
LEA14,0.9,1.1,1.0,2.8,3.1,2.7
HSP70,2.1,2.3,1.9,5.4,5.7,5.1
HSP101,1.5,1.3,1.7,4.2,4.5,3.9
GOLS2,0.7,0.8,0.6,3.3,3.6,3.0
NAC019,1.1,0.9,1.2,2.4,2.7,2.2
MYB2,1.3,1.5,1.2,1.8,1.6,1.9
PAL1,2.2,2.4,2.1,2.3,2.5,2.0
UBQ10,3.1,3.0,3.2,3.0,3.1,2.9`;

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
  };
  const [vis, updVis] = useReducer((s, a) => (a._reset ? { ...visInit } : { ...s, ...a }), visInit);

  const cellBorderInit = { on: false, color: "#ffffff", width: 0.5 };
  const [cellBorder, updCellBorder] = useReducer(
    (s, a) => (a._reset ? { ...cellBorderInit } : { ...s, ...a }),
    cellBorderInit
  );

  const chartRef = useRef();
  const matrixRef = useRef(null);

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

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="dv-panel dv-plot-card"
                style={{
                  padding: 20,
                  background: "var(--plot-card-bg)",
                  borderColor: "var(--plot-card-border)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-start",
                }}
              >
                <HeatmapChart
                  ref={chartRef}
                  rowLabels={rawMatrix.rowLabels}
                  colLabels={rawMatrix.colLabels}
                  matrix={normalized}
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
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Heatmap">
    <App />
  </ErrorBoundary>
);
