// Detail-view tile (zoomed heatmap of the current row / column selection)
// and the accompanying CSV preview card beneath it. Both are rendered next
// to the main HeatmapChart when the user has committed a brush / dendrogram
// / k-means-strip selection. Consumes HeatmapChart from ./chart and
// buildCsvExport from ./reports; pure helpers (pruneDendroTree) come from
// ./helpers.

import { HeatmapChart } from "./chart";
import { pruneDendroTree } from "./helpers";
import { buildCsvExport } from "./reports";

const { useMemo, useRef } = React;

export const DETAIL_DENDRO_STROKE_WIDTHS = { thin: 0.75, medium: 1.5, bold: 2.5 };

export function DetailView({
  rawMatrix,
  normalized,
  detailRowOrder,
  detailColOrder,
  mainRowCluster,
  mainColCluster,
  vis,
  cellBorder,
  detailChartRef,
  fileName,
  detailDendroStroke,
  setDetailDendroStroke,
  clusterId,
  clusterAxis,
}) {
  // Detail tile is now an independent sibling next to the main plot rather
  // than stacked beneath it, so it no longer mirrors the main's width,
  // column offsets, dendrogram band, or legend length. Row height is still
  // enlarged — that's the "zoom" semantic, giving each selected row enough
  // pixels for a readable label (floor 14 px, cap 28 px). Cell width is
  // left to HeatmapChart's default (based on detail's own column count).
  const detailRowCount = detailRowOrder.length;
  const baseCellH = Math.max(14, Math.min(28, Math.floor(720 / Math.max(1, detailRowCount))));
  const base = fileBaseName(fileName || "heatmap") || "heatmap";
  const mainRowIsKmeans = mainRowCluster && mainRowCluster.mode === "kmeans";
  const mainColIsKmeans = mainColCluster && mainColCluster.mode === "kmeans";
  const mainRowIsHier =
    mainRowCluster && mainRowCluster.mode === "hierarchical" && mainRowCluster.tree;
  const mainColIsHier =
    mainColCluster && mainColCluster.mode === "hierarchical" && mainColCluster.tree;
  // Build per-axis cluster objects to forward to the detail HeatmapChart.
  // For hierarchical mode: prune the main's tree down to just the selected
  // leaves, so the detail draws a proper subtree dendrogram at its own cell
  // width — merge heights preserved, elided sibling clades skipped. For
  // k-means: forward as-is (the strip + inter-cluster gap math both need
  // the original `clusters` array, which is indexed by original leaf idx).
  // Null when neither applies (so HeatmapChart reserves no dendro band).
  const detailRowCluster = useMemo(() => {
    if (mainRowIsKmeans) return mainRowCluster;
    if (mainRowIsHier) {
      const pruned = pruneDendroTree(mainRowCluster.tree, new Set(detailRowOrder));
      return pruned ? { mode: "hierarchical", tree: pruned } : null;
    }
    return null;
  }, [mainRowCluster, mainRowIsKmeans, mainRowIsHier, detailRowOrder]);
  const detailColCluster = useMemo(() => {
    if (mainColIsKmeans) return mainColCluster;
    if (mainColIsHier) {
      const pruned = pruneDendroTree(mainColCluster.tree, new Set(detailColOrder));
      return pruned ? { mode: "hierarchical", tree: pruned } : null;
    }
    return null;
  }, [mainColCluster, mainColIsKmeans, mainColIsHier, detailColOrder]);
  const detailShowDendrogram =
    (mainRowIsHier && detailRowCluster) || (mainColIsHier && detailColCluster);

  // When the selection came from a k-means cluster-strip click we tag the
  // downloaded filenames with the 1-based cluster id so a user can tell
  // cluster-1 and cluster-3 exports apart on disk without re-opening them.
  const clusterSuffix = clusterId != null ? `_cluster${clusterId + 1}` : "";
  const clusterTag =
    clusterId != null
      ? `Cluster n° ${clusterId + 1}${clusterAxis === "row" ? " (rows)" : clusterAxis === "col" ? " (cols)" : ""}`
      : null;

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
        padding: 20,
        background: "var(--plot-card-bg)",
        borderColor: "var(--plot-card-border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
        minWidth: 0,
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {detailShowDendrogram ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Dendrogram</span>
              <div className="dv-seg" role="group" aria-label="Dendrogram stroke width">
                {["thin", "medium", "bold"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={
                      "dv-seg-btn" + (detailDendroStroke === k ? " dv-seg-btn-active" : "")
                    }
                    onClick={() => setDetailDendroStroke(k)}
                    style={{ fontSize: 11, padding: "4px 10px" }}
                  >
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {clusterTag ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text)",
                background: "var(--surface-subtle)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 8px",
              }}
            >
              {clusterTag}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {downloadButton("SVG", () =>
            downloadSvg(detailChartRef.current, `${base}_heatmap${clusterSuffix}_detail.svg`)
          )}
          {downloadButton("PNG", () =>
            downloadPng(detailChartRef.current, `${base}_heatmap${clusterSuffix}_detail.png`, 2)
          )}
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
          rowCluster={detailRowCluster}
          colCluster={detailColCluster}
          showClusterStrip={detailShowDendrogram}
          showKmeansStrip={mainRowIsKmeans || mainColIsKmeans}
          dendrogramStrokeWidth={
            DETAIL_DENDRO_STROKE_WIDTHS[detailDendroStroke] || DETAIL_DENDRO_STROKE_WIDTHS.medium
          }
          vmin={vis.vmin}
          vmax={vis.vmax}
          palette={vis.palette}
          invertPalette={vis.invertPalette}
          cellBorder={cellBorder}
          plotTitle={vis.plotTitle ? `${vis.plotTitle} — detail` : undefined}
          plotSubtitle={vis.plotSubtitle}
          rowAxisLabel={vis.rowAxisLabel}
          colAxisLabel={vis.colAxisLabel}
          showRowLabels={vis.showRowLabels}
          showColLabels={vis.showColLabels}
          interactive={false}
          baseCellH={baseCellH}
        />
      </div>
    </div>
  );
}

export function DetailPreviewCard({
  rawMatrix,
  normalized,
  detailRowOrder,
  detailColOrder,
  fileName,
  clusterId,
}) {
  const base = fileBaseName(fileName || "heatmap") || "heatmap";
  const clusterSuffix = clusterId != null ? `_cluster${clusterId + 1}` : "";
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
  const detailMatrixRef = useRef(null);
  detailMatrixRef.current = {
    rowLabels: rawMatrix.rowLabels,
    colLabels: rawMatrix.colLabels,
    matrix: normalized,
    rowOrder: detailRowOrder,
    colOrder: detailColOrder,
  };

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
          Selection data — {nR} row{nR === 1 ? "" : "s"} × {nC} col{nC === 1 ? "" : "s"}
        </div>
        <button
          onClick={(e) => {
            if (!detailMatrixRef.current) return;
            const { headers, rows } = buildCsvExport(detailMatrixRef.current);
            downloadCsv(headers, rows, `${base}_heatmap${clusterSuffix}_detail.csv`);
            flashSaved(e.currentTarget);
          }}
          className="dv-btn dv-btn-dl"
          style={{ padding: "4px 10px", fontSize: 11 }}
        >
          ⬇ CSV
        </button>
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
