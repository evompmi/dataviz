// Sidebar controls for the Heatmap tool — ActionsPanel (reset + CSV + R
// script downloads) followed by the Normalisation / Clustering / Colour
// scale / Cell borders / Labels collapsible sections. Everything is dumb
// UI: callbacks are handed down from App. The PaletteStrip preview is
// imported from ./chart so the sidebar's palette picker and the
// heatmap's colourbar stay visually in sync.

import { PlotSidebar } from "../_shell/PlotSidebar";
import { PaletteStrip } from "./chart";
import { buildHeatmapRScript, buildCsvExport } from "./reports";

const { useState, useRef, useEffect } = React;

export function ClusterModeControl({ label, mode, setMode, k, setK }) {
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
            max="20"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setK(Math.max(2, Math.min(20, Number.isFinite(v) ? v : 3)));
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
export function ControlSection({ title, defaultOpen = false, children }) {
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

export function PlotControls({
  vis,
  updVis,
  cellBorder,
  updCellBorder,
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
    <PlotSidebar sticky={false} width={280}>
      <ActionsPanel
        onReset={resetAll}
        extraDownloads={[
          {
            label: "CSV",
            title:
              "Download the plotted matrix as CSV — normalisation and row / column reordering applied",
            onClick: () => {
              if (!matrixRef.current) return;
              const { headers, rows } = buildCsvExport(matrixRef.current);
              downloadCsv(headers, rows, `${baseName}_heatmap.csv`);
            },
          },
          {
            label: "R script",
            title:
              "Download a runnable R script that reproduces this plot with pheatmap (includes the raw matrix, clustering, normalisation, palette)",
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
                invertPalette: vis.invertPalette,
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
          <PaletteStrip palette={vis.palette} invert={vis.invertPalette} />
        </label>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span className="dv-label" style={{ fontSize: 11, flexShrink: 0 }}>
            Direction
          </span>
          <div className="dv-seg" role="group" aria-label="Palette direction">
            <button
              type="button"
              className={"dv-seg-btn" + (!vis.invertPalette ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ invertPalette: false })}
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              Normal
            </button>
            <button
              type="button"
              className={"dv-seg-btn" + (vis.invertPalette ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ invertPalette: true })}
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              Inverted
            </button>
          </div>
        </div>
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
    </PlotSidebar>
  );
}
