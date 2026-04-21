// tools/heatmap/index.tsx — App orchestrator for the Heatmap tool. This
// file is the esbuild entry point (bundles to tools/heatmap/index.js) and
// only holds state wiring — chart rendering, step panels, sidebar controls,
// detail view, reports, and pure helpers all live in sibling modules under
// tools/heatmap/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { normalizeMatrix, autoRange } from "./helpers";
import { HeatmapChart } from "./chart";
import { UploadStep } from "./steps";
import { PlotControls } from "./controls";
import { DetailView, DetailPreviewCard } from "./plot-area";

const { useState, useReducer, useMemo, useCallback, useRef } = React;

const VIS_INIT_HEATMAP = {
  palette: "viridis",
  invertPalette: false,
  vmin: 0,
  vmax: 1,
  plotTitle: "",
  plotSubtitle: "",
  colAxisLabel: "",
  rowAxisLabel: "",
  showRowLabels: false,
  showColLabels: true,
};

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
  const shell = usePlotToolState("heatmap", VIS_INIT_HEATMAP);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    vis,
    updVis,
  } = shell;

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

  const cellBorderInit = { on: false, color: "#ffffff", width: 0.5 };
  const [cellBorder, updCellBorder] = useReducer(
    (s, a) => (a._reset ? { ...cellBorderInit } : { ...s, ...a }),
    cellBorderInit
  );

  // Detail-only dendrogram stroke preset. Three fixed sizes so the zoom
  // tile's pruned dendrogram can be bumped up to read clearly at a smaller
  // plot size; the main plot keeps its default stroke width. Not persisted —
  // session-local.
  const [detailDendroStroke, setDetailDendroStroke] = useState("medium");

  const chartRef = useRef();
  const detailChartRef = useRef();
  const matrixRef = useRef(null);

  // Selection state: which rows / columns are highlighted for the detail view.
  // `null` on an axis means "all rows/cols". Indices are into the ORIGINAL
  // rawMatrix, not into rowOrder/colOrder — so clustering changes don't
  // invalidate them.
  const [selection, setSelection] = useState({
    rows: null,
    cols: null,
    clusterId: null,
    clusterAxis: null,
  });

  const selectBox = useCallback((rows, cols) => {
    setSelection({
      rows: rows && rows.length ? rows : null,
      cols: cols && cols.length ? cols : null,
      clusterId: null,
      clusterAxis: null,
    });
  }, []);
  // Axis-scoped selection (dendrogram branch / cluster strip click) REPLACES
  // any prior selection rather than layering onto it — otherwise clicking a
  // column subtree after a row brush would intersect the two, which doesn't
  // match the user's mental model of "show me this subtree".
  const selectAxis = useCallback((axis, indices, meta) => {
    const valid = indices && indices.length ? indices : null;
    setSelection({
      rows: axis === "row" ? valid : null,
      cols: axis === "col" ? valid : null,
      clusterId: meta && meta.clusterId != null ? meta.clusterId : null,
      clusterAxis: meta && meta.clusterId != null ? axis : null,
    });
  }, []);
  const clearSelection = useCallback(
    () => setSelection({ rows: null, cols: null, clusterId: null, clusterAxis: null }),
    []
  );

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
    rowClusterIds: rowCluster && rowCluster.mode === "kmeans" ? rowCluster.clusters : null,
    colClusterIds: colCluster && colCluster.mode === "kmeans" ? colCluster.clusters : null,
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
    <PlotToolShell
      state={shell}
      toolName="heatmap"
      title="Heatmap"
      subtitle="Matrix view with hierarchical clustering"
      visInit={VIS_INIT_HEATMAP}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
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
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
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
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      alignSelf: "stretch",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                    >
                      {hasSelection ? (
                        <button
                          onClick={clearSelection}
                          className="dv-btn dv-btn-secondary"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                        >
                          Clear
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontStyle: "italic",
                          }}
                        >
                          ↳ Drag on the heatmap or click a dendrogram / k-means band to open a
                          zoomed view
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        onClick={(e) => {
                          const bn = fileBaseName(fileName || "heatmap") || "heatmap";
                          downloadSvg(chartRef.current, `${bn}_heatmap.svg`);
                          flashSaved(e.currentTarget);
                        }}
                        className="dv-btn dv-btn-dl"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        ⬇ SVG
                      </button>
                      <button
                        onClick={(e) => {
                          const bn = fileBaseName(fileName || "heatmap") || "heatmap";
                          downloadPng(chartRef.current, `${bn}_heatmap.png`, 2);
                          flashSaved(e.currentTarget);
                        }}
                        className="dv-btn dv-btn-dl"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        ⬇ PNG
                      </button>
                    </div>
                  </div>
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
                    invertPalette={vis.invertPalette}
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
                    mainRowCluster={rowCluster}
                    mainColCluster={colCluster}
                    vis={vis}
                    cellBorder={cellBorder}
                    detailChartRef={detailChartRef}
                    fileName={fileName}
                    detailDendroStroke={detailDendroStroke}
                    setDetailDendroStroke={setDetailDendroStroke}
                    clusterId={selection.clusterId}
                    clusterAxis={selection.clusterAxis}
                  />
                )}
              </div>
              {hasSelection && (
                <DetailPreviewCard
                  rawMatrix={rawMatrix}
                  normalized={normalized}
                  detailRowOrder={detailRowOrder}
                  detailColOrder={detailColOrder}
                  fileName={fileName}
                  clusterId={selection.clusterId}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Heatmap">
    <App />
  </ErrorBoundary>
);
