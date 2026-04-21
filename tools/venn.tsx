// venn.jsx — editable source. Run `npm run build` to compile to venn.js
// Do NOT edit the .js file directly.
import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";
import {
  computeIntersections,
  regionLabel,
  regionFilenamePart,
  buildRegionPaths,
  buildVenn2Layout,
  buildVenn3Layout,
  buildVenn2LayoutClassic,
  buildVenn3LayoutClassic,
  computeRegionCentroids,
  VENN_CONFIG,
  VIS_INIT_VENN,
} from "./venn/helpers";

const { useState, useMemo, useCallback, useRef, useEffect, forwardRef } = React;

// parseSetData lives in tools/shared.js (shared with the UpSet tool).
// Pure helpers (geometry, set math, region paths) live in tools/venn/helpers.ts.

// ── VennChart SVG ────────────────────────────────────────────────────────────

const VW = 600,
  VH = 500;

const VennChart = forwardRef<SVGSVGElement, any>(function VennChart(
  {
    setNames,
    sets,
    intersections,
    colors,
    selectedMask,
    onRegionClick,
    plotTitle,
    plotBg,
    fontSize,
    fillOpacity,
    onLayoutInfo,
    proportional,
    readabilityBlend,
    showOutline,
  },
  ref
) {
  const n = setNames.length;
  const blend = readabilityBlend != null ? readabilityBlend : VENN_CONFIG.DEFAULT_READABILITY_BLEND;

  const layout = useMemo(() => {
    if (proportional) {
      if (n === 2) return buildVenn2Layout(setNames, sets, intersections, VW, VH, blend);
      return buildVenn3Layout(setNames, sets, intersections, VW, VH, blend);
    }
    if (n === 2) return buildVenn2LayoutClassic(setNames, sets, intersections, VW, VH);
    return buildVenn3LayoutClassic(setNames, sets, intersections, VW, VH);
  }, [setNames, sets, intersections, n, proportional, blend]);

  const circles = layout.circles;

  // Notify parent of layout warnings/proportionality/error metrics
  useEffect(() => {
    if (onLayoutInfo)
      onLayoutInfo({
        warnings: layout.warnings,
        proportional: layout.proportional,
        maxError: layout.maxError || 0,
        meanError: layout.meanError || 0,
      });
  }, [layout.warnings, layout.proportional, layout.maxError, layout.meanError]);

  const regionPaths = useMemo(() => buildRegionPaths(circles), [circles]);
  const centroids = useMemo(
    () => computeRegionCentroids(circles, regionPaths, intersections),
    [circles, regionPaths, intersections]
  );

  const fSize = fontSize || 14;
  const fOpacity = fillOpacity != null ? fillOpacity : 0.25;
  const outlineOn = showOutline !== false;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Venn diagram"}
    >
      <title>{plotTitle || "Venn diagram"}</title>
      <desc>{`Venn diagram with ${n} set${n !== 1 ? "s" : ""}: ${setNames.join(", ")}`}</desc>
      <rect id="background" width={VW} height={VH} fill={plotBg || "#fff"} rx="8" />
      {plotTitle && (
        <g id="title">
          <text
            x={VW / 2}
            y={24}
            textAnchor="middle"
            fontSize="16"
            fontWeight="700"
            fill="#222"
            fontFamily="sans-serif"
          >
            {plotTitle}
          </text>
        </g>
      )}

      <g id="set-circles">
        {circles.map((c, i) => (
          <circle
            key={`circle-${i}`}
            id={`set-${svgSafeId(setNames[i])}`}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill={colors[setNames[i]] || PALETTE[i]}
            fillOpacity={fOpacity}
            stroke={outlineOn ? colors[setNames[i]] || PALETTE[i] : "none"}
            strokeWidth={outlineOn ? 2 : 0}
            strokeOpacity={outlineOn ? 0.6 : 0}
            aria-label={`Set ${setNames[i]}: ${sets[setNames[i]] || 0} elements`}
          />
        ))}
      </g>

      {selectedMask != null && regionPaths[selectedMask] && (
        <g id="selected-region">
          <path
            d={regionPaths[selectedMask]}
            fill="none"
            stroke="#222"
            strokeWidth="2.5"
            strokeDasharray="6,3"
            style={{ pointerEvents: "none" }}
          />
        </g>
      )}

      <g id="region-counts">
        {intersections.map((inter) => {
          const c = centroids[inter.mask];
          if (!c) return null;
          const isSelected = selectedMask === inter.mask;
          const regionPath = regionPaths[inter.mask];
          const labelId = inter.setNames.map((n) => svgSafeId(n)).join("-") || `mask-${inter.mask}`;
          return (
            <g
              key={`label-${inter.mask}`}
              id={`count-${labelId}`}
              style={{ cursor: "pointer" }}
              onClick={() => onRegionClick && onRegionClick(isSelected ? null : inter.mask)}
            >
              {regionPath ? (
                <path d={regionPath} fill="none" pointerEvents="all" />
              ) : (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={Math.max(fSize * 1.5, 20)}
                  fill="transparent"
                  pointerEvents="all"
                />
              )}
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fSize}
                fontWeight="700"
                fill="#333"
                fontFamily="sans-serif"
                pointerEvents="none"
              >
                {inter.size}
              </text>
            </g>
          );
        })}
      </g>

      <g id="legend">
        {circles.map((c, i) => (
          <g key={`setlabel-${i}`} id={`legend-${svgSafeId(setNames[i])}`}>
            <circle
              cx={18}
              cy={VH - 20 - (circles.length - 1 - i) * 22}
              r={6}
              fill={colors[setNames[i]] || PALETTE[i]}
              fillOpacity="0.5"
              stroke={colors[setNames[i]] || PALETTE[i]}
              strokeWidth="1.5"
            />
            <text
              x={30}
              y={VH - 20 - (circles.length - 1 - i) * 22}
              textAnchor="start"
              dominantBaseline="central"
              fontSize="13"
              fontWeight="600"
              fill={colors[setNames[i]] || PALETTE[i]}
              fontFamily="sans-serif"
            >
              {setNames[i]} ({sets.get(setNames[i]).size})
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});

// ── UI Components ────────────────────────────────────────────────────────────

function UploadStep({ sepOverride, setSepOverride, handleFileLoad, onLoadExample }) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Arabidopsis abiotic stress genes (Drought / Heat / Salt)"
        hint="CSV · TSV · TXT — one column per set (2–3), items listed in rows"
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
          {toolIcon("venn", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              Venn Diagram — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Upload wide-format data → review sets → plot
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
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1.5px solid var(--info-border)",
              gridColumn: "1/-1",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Data layout (wide format)
            </div>
            <p
              style={{
                fontSize: 12,
                lineHeight: 1.75,
                color: "var(--text-muted)",
                margin: "0 0 10px",
              }}
            >
              Each <strong>column</strong> = one set (2 to 3 columns). Each <strong>row</strong>{" "}
              lists one item per set. Columns can have different lengths — empty cells are ignored.
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
              <thead>
                <tr style={{ background: "var(--info-bg)" }}>
                  {["Set A", "Set B", "Set C"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "4px 10px",
                        textAlign: "left",
                        color: "var(--accent-primary)",
                        fontWeight: 700,
                        borderBottom: "1.5px solid var(--info-border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["gene1", "gene2", "gene1"],
                  ["gene3", "gene3", "gene4"],
                  ["gene5", "gene1", "gene6"],
                  ["gene7", "", ""],
                ].map((r, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "var(--surface-subtle)" : "var(--surface)" }}
                  >
                    {r.map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "3px 10px",
                          color: v ? "var(--text)" : "var(--border-strong)",
                          fontFamily: "monospace",
                        }}
                      >
                        {v || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              background: "var(--surface)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1.5px solid var(--info-border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Features
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              Equal-size circles by default, with optional area-proportional mode. Click any region
              count to highlight it and view its items. Rename sets, adjust colors and opacity from
              the plot controls.
            </p>
          </div>

          <div
            style={{
              background: "var(--surface)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1.5px solid var(--info-border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Export
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              Download the diagram as <strong>SVG</strong> or <strong>PNG</strong>. Export item
              lists per region or a full membership matrix as <strong>CSV</strong>.
            </p>
          </div>

          <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              "2–3 sets",
              "Proportional toggle",
              "Subset detection",
              "Item extraction",
              "SVG / PNG / CSV export",
              "100% browser-side",
            ].map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "var(--surface)",
                  border: "1px solid var(--info-border)",
                  color: "var(--text-muted)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const UPSET_NUDGE_KEY = "venn-upset-nudge-dismissed";

function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  allColumnNames,
  allColumnSets,
  pendingSelection,
  setPendingSelection,
  onCommit,
}) {
  const needsPicker = allColumnNames.length > 3;
  const selectedCount = pendingSelection.length;
  const canPlot = selectedCount === 2 || selectedCount === 3;

  // Non-blocking nudge to the UpSet tool when the dataset has 4+ sets.
  // Venn still renders 2–3 of them; the banner is dismissible and remembers
  // that choice in localStorage so it never nags the same user twice.
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return localStorage.getItem(UPSET_NUDGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const dismissNudge = () => {
    setNudgeDismissed(true);
    try {
      localStorage.setItem(UPSET_NUDGE_KEY, "1");
    } catch {
      /* storage disabled — dismissal only lasts this session */
    }
  };
  const openUpset = (e) => {
    e.preventDefault();
    // Hand the currently-loaded dataset off to the UpSet tool so it doesn't
    // open showing whatever stale file the user had loaded there before.
    // We rebuild a TSV from the already-parsed headers/rows (rather than
    // keeping a copy of the raw bytes around) and let UpSet re-parse it.
    // Tabs/newlines inside cells are flattened to spaces — set-membership
    // values are typically alphanumeric IDs so this is effectively a no-op
    // for real data and just hardens against the rare odd cell.
    const escape = (c) => String(c == null ? "" : c).replace(/[\t\n\r]/g, " ");
    const tsv = [
      parsedHeaders.map(escape).join("\t"),
      ...parsedRows.map((r) => r.map(escape).join("\t")),
    ].join("\n");
    const payload = {
      type: "dataviz-handoff",
      text: tsv,
      fileName: fileName || "",
      sep: "\t",
      format: "wide",
    };
    // In-iframe path: post directly into the sibling UpSet iframe (same
    // origin, so we can reach it via parent.document) before asking the
    // landing page to switch views. postMessage delivery is synchronous so
    // the data arrives before the user sees the UpSet view.
    if (window.parent && window.parent !== window) {
      try {
        const frame = window.parent.document.getElementById("frame-upset") as HTMLIFrameElement;
        if (frame && frame.contentWindow) frame.contentWindow.postMessage(payload, "*");
      } catch {
        /* cross-origin or detached — fall through to the openTool ask */
      }
      window.parent.postMessage({ type: "openTool", tool: "upset" }, "*");
    } else {
      // Standalone path: stash in sessionStorage and full-page navigate.
      // UpSet's mount-time effect consumes the entry and clears it.
      try {
        sessionStorage.setItem("dataviz-upset-handoff", JSON.stringify(payload));
      } catch {
        /* storage disabled — fall back to opening UpSet without the data */
      }
      window.location.href = "upset.html";
    }
  };
  const showNudge = allColumnNames.length >= 4 && !nudgeDismissed;

  const toggle = (name) => {
    setPendingSelection((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  let pickerStatusText = "Pick 2 or 3 sets to overlap.";
  let pickerStatusColor = "var(--text-muted)";
  if (selectedCount === 1) {
    pickerStatusText = "1 selected — pick at least one more.";
    pickerStatusColor = "var(--warning-text)";
  } else if (selectedCount === 2 || selectedCount === 3) {
    pickerStatusText = `${selectedCount} selected — ready to plot.`;
    pickerStatusColor = "var(--success-text)";
  }

  return (
    <div>
      {showNudge && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--info-bg)",
            border: "1px solid var(--info-border)",
            color: "var(--info-text)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
          }}
        >
          <span style={{ fontSize: 16 }}>💡</span>
          <span style={{ flex: 1 }}>
            <strong>{allColumnNames.length} sets detected</strong> — UpSet plots read better than
            Venn diagrams above 3 sets.{" "}
            <a
              href="upset.html"
              onClick={openUpset}
              style={{ color: "var(--accent-primary)", fontWeight: 700 }}
            >
              Open in UpSet tool →
            </a>
          </span>
          <button
            type="button"
            onClick={dismissNudge}
            aria-label="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>

      {needsPicker && (
        <div className="dv-panel" style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Choose sets to overlap
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: pickerStatusColor }}>
            {pickerStatusText}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 6,
            }}
          >
            {allColumnNames.map((name) => {
              const checked = pendingSelection.includes(name);
              const atCap = !checked && pendingSelection.length >= 3;
              const size = allColumnSets.get(name)?.size ?? 0;
              return (
                <label
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border)"}`,
                    background: checked ? "var(--info-bg)" : "var(--surface-subtle)",
                    cursor: atCap ? "not-allowed" : "pointer",
                    opacity: atCap ? 0.5 : 1,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={atCap}
                    onChange={() => toggle(name)}
                  />
                  <span
                    style={{
                      fontWeight: 600,
                      flex: "1 1 auto",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}
                  >
                    {size}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => canPlot && onCommit(pendingSelection)}
        disabled={!canPlot}
        className="dv-btn dv-btn-primary"
        style={{
          marginTop: 16,
          opacity: canPlot ? 1 : 0.5,
          cursor: canPlot ? "pointer" : "not-allowed",
        }}
      >
        Plot →
      </button>
    </div>
  );
}

function IntersectionTable({ intersections, allSetNames, selectedMask, onSelect }) {
  const [hoveredMask, setHoveredMask] = useState(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd" }}>
            <th
              style={{
                padding: "6px 10px",
                textAlign: "left",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Region
            </th>
            <th
              style={{
                padding: "6px 10px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Degree
            </th>
            <th
              style={{
                padding: "6px 10px",
                textAlign: "right",
                color: "var(--text-muted)",
                fontWeight: 700,
              }}
            >
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {intersections.map((inter) => (
            <tr
              key={inter.mask}
              onClick={() => onSelect(inter.mask)}
              onMouseEnter={() => setHoveredMask(inter.mask)}
              onMouseLeave={() => setHoveredMask((m) => (m === inter.mask ? null : m))}
              style={{
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                background:
                  selectedMask === inter.mask
                    ? "var(--row-hover-bg)"
                    : hoveredMask === inter.mask
                      ? "var(--surface-subtle)"
                      : "transparent",
                transition: "background 120ms ease",
              }}
            >
              <td style={{ padding: "6px 10px", color: "var(--text)", fontWeight: 500 }}>
                {regionLabel(inter.setNames, inter.mask, allSetNames)}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-faint)" }}>
                {inter.degree}
              </td>
              <td
                style={{
                  padding: "6px 10px",
                  textAlign: "right",
                  color: "var(--accent-primary)",
                  fontWeight: 700,
                  fontFamily: "monospace",
                }}
              >
                {inter.size}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemListPanel({ intersection, allSetNames, fileName }) {
  const baseName = fileBaseName(fileName, "venn");
  if (!intersection)
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        Click a region in the Venn diagram or a row in the table to view items.
      </div>
    );
  const label = regionLabel(intersection.setNames, intersection.mask, allSetNames);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {label}{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            ({intersection.size} items)
          </span>
        </p>
        <button
          onClick={() => {
            downloadCsv(
              ["Item"],
              intersection.items.map((i) => [i]),
              `${baseName}_venn_${regionFilenamePart(label)}.csv`
            );
          }}
          className="dv-btn dv-btn-secondary"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success-text)",
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          ⬇ CSV
        </button>
      </div>
      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--surface-subtle)",
        }}
      >
        {intersection.items.map((item, i) => (
          <div
            key={i}
            style={{
              padding: "3px 10px",
              fontSize: 12,
              color: "var(--text)",
              borderBottom: "1px solid var(--border)",
              fontFamily: "monospace",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlotControls({
  allSetNames,
  allSets,
  activeSetNames,
  activeSets,
  intersections,
  onToggleSet,
  setColors,
  onColorChange,
  onRename,
  vis,
  updVis,
  chartRef,
  resetAll,
  proportional,
  onProportionalChange,
  fileName,
}) {
  const baseName = fileBaseName(fileName, "venn");
  const sv = (k) => (v) => updVis({ [k]: v });
  return (
    <div
      style={{
        width: 279,
        flexShrink: 0,
        position: "sticky",
        top: 24,
        maxHeight: "calc(100vh - 90px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <ActionsPanel
        onDownloadSvg={() => downloadSvg(chartRef.current, `${baseName}_venn.svg`)}
        onDownloadPng={() => downloadPng(chartRef.current, `${baseName}_venn.png`, 2)}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "CSV",
            title:
              "Download the membership matrix — one row per item, a 0/1 column for each active set (long/tidy format)",
            onClick: () => {
              const allItems = new Set();
              for (const n of activeSetNames) for (const item of allSets.get(n)) allItems.add(item);
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n) => (allSets.get(n).has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_venn_membership.csv`);
            },
          },
          {
            // One CSV per non-empty region. Browsers may prompt once to
            // allow multiple downloads from a single user gesture — accepting
            // is expected. Empty regions are skipped (an empty CSV is noise,
            // not a useful record).
            label: "Regions",
            title:
              "Download one CSV per non-empty region (fires multiple saves — your browser may ask once to allow them)",
            onClick: () => {
              const nonEmpty = intersections.filter((r) => r.size > 0);
              nonEmpty.forEach((r, i) => {
                const label = regionLabel(r.setNames, r.mask, activeSetNames);
                const name = `${baseName}_venn_${regionFilenamePart(label)}.csv`;
                // Stagger slightly so the browser reliably handles each as
                // its own download (a single synchronous loop of <a>.click()
                // can race inside some engines).
                setTimeout(
                  () =>
                    downloadCsv(
                      ["Item"],
                      r.items.map((it) => [it]),
                      name
                    ),
                  i * 40
                );
              });
            },
          },
        ]}
      />

      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Sets
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {allSetNames.map((name, i) => {
            const active = activeSets.has(name);
            const canUncheck = activeSets.size > 2;
            return (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: active ? "var(--surface-sunken)" : "var(--surface-subtle)",
                  border: active ? "1px solid var(--border-strong)" : "1px solid var(--border)",
                  opacity: active ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={active && !canUncheck}
                  onChange={() => onToggleSet(name)}
                  style={{
                    accentColor: setColors[name] || PALETTE[i % PALETTE.length],
                    flexShrink: 0,
                  }}
                />
                <ColorInput
                  value={setColors[name] || PALETTE[i % PALETTE.length]}
                  onChange={(v) => onColorChange(name, v)}
                  size={20}
                />
                <input
                  key={name}
                  defaultValue={name}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: 600,
                    color: active ? "var(--text)" : "var(--text-faint)",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 3,
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--accent-primary)";
                    e.target.style.boxShadow = "0 0 0 2px rgba(100,143,255,0.2)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border-strong)";
                    e.target.style.boxShadow = "none";
                    const nv = e.target.value.trim();
                    if (nv && nv !== name) {
                      if (!onRename(name, nv)) e.target.value = name;
                    } else if (!nv) e.target.value = name;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                <span
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({allSets.get(name).size})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Display
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <span className="dv-label">Proportional areas</span>
            <div
              style={{
                display: "flex",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-strong)",
              }}
            >
              {(["off", "on"] as const).map((mode) => {
                const active = mode === "on" ? proportional : !proportional;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onProportionalChange(mode === "on")}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      fontSize: 11,
                      fontWeight: active ? 700 : 400,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      border: "none",
                      background: active ? "var(--accent-primary)" : "var(--surface)",
                      color: active ? "var(--on-accent)" : "var(--text-muted)",
                      transition: "background 120ms ease, color 120ms ease",
                    }}
                  >
                    {mode === "off" ? "Off" : "On"}
                  </button>
                );
              })}
            </div>
          </div>
          {proportional && (
            <SliderControl
              label="Proportional ↔ Readable"
              value={vis.readabilityBlend}
              min={0}
              max={1}
              step={0.05}
              displayValue={`${Math.round(vis.readabilityBlend * 100)}%`}
              onChange={sv("readabilityBlend")}
            />
          )}
          <div>
            <div className="dv-label">Title</div>
            <input
              value={vis.plotTitle}
              onChange={(e) => updVis({ plotTitle: e.target.value })}
              className="dv-input"
              style={{ width: "100%" }}
            />
          </div>
          <SliderControl
            label="Fill opacity"
            value={vis.fillOpacity}
            min={0.05}
            max={0.8}
            step={0.05}
            onChange={sv("fillOpacity")}
          />
          <div>
            <span className="dv-label">Circle outline</span>
            <div
              style={{
                display: "flex",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-strong)",
              }}
            >
              {(["off", "on"] as const).map((mode) => {
                const active = mode === "on" ? vis.showOutline : !vis.showOutline;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updVis({ showOutline: mode === "on" })}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      fontSize: 11,
                      fontWeight: active ? 700 : 400,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      border: "none",
                      background: active ? "var(--accent-primary)" : "var(--surface)",
                      color: active ? "var(--on-accent)" : "var(--text-muted)",
                      transition: "background 120ms ease, color 120ms ease",
                    }}
                  >
                    {mode === "off" ? "Off" : "On"}
                  </button>
                );
              })}
            </div>
          </div>
          <SliderControl
            label="Font size"
            value={vis.fontSize}
            min={8}
            max={24}
            step={1}
            onChange={sv("fontSize")}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="dv-label">Background</span>
            <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const shell = usePlotToolState("venn", VIS_INIT_VENN);
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

  const [setNames, setSetNames] = useState([]);
  const [sets, setSets] = useState(new Map());
  const [setColors, setSetColors] = useState({});
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedMask, setSelectedMask] = useState(null);
  const [activeSets, setActiveSets] = useState(new Set());
  const [allColumnNames, setAllColumnNames] = useState([]);
  const [allColumnSets, setAllColumnSets] = useState(new Map());
  const [pendingSelection, setPendingSelection] = useState([]);

  const [proportional, setProportional] = useState(false);

  const chartRef = useRef();
  const [layoutInfo, setLayoutInfo] = useState({
    warnings: [],
    proportional: true,
    maxError: 0,
    meanError: 0,
  });

  const activeSetNames = useMemo(
    () => setNames.filter((n) => activeSets.has(n)),
    [setNames, activeSets]
  );
  const activeSetsMap = useMemo(() => {
    const m = new Map();
    for (const n of activeSetNames) m.set(n, sets.get(n));
    return m;
  }, [activeSetNames, sets]);

  const intersections = useMemo(() => {
    if (activeSetNames.length < 2) return [];
    return computeIntersections(activeSetNames, activeSetsMap);
  }, [activeSetNames, activeSetsMap]);

  const canNavigate = useCallback(
    (target) => {
      if (target === "upload") return true;
      if (target === "configure") return allColumnNames.length >= 2;
      if (target === "plot") {
        // When leaving configure, gate on the pending (pre-commit) selection
        // so the nav button tracks the checkboxes the user just edited.
        if (step === "configure")
          return pendingSelection.length >= 2 && pendingSelection.length <= 3;
        return setNames.length >= 2;
      }
      return false;
    },
    [allColumnNames, setNames, step, pendingSelection]
  );

  const commitSelection = useCallback((names, allSets) => {
    const chosen = new Map();
    names.forEach((n) => chosen.set(n, allSets.get(n)));
    setSetNames(names);
    setSets(chosen);
    setActiveSets(new Set(names));
    const cols = {};
    names.forEach((n, i) => {
      cols[n] = PALETTE[i % PALETTE.length];
    });
    setSetColors(cols);
    setSelectedMask(null);
  }, []);

  // StepNavBar's top "Plot" tab routes via shell.setStep directly, so without
  // this intercept the user's configure-step checkbox edits would be lost
  // (only the bottom "Plot →" button ran commitSelection). Commit the
  // pending selection if it differs from the current one before navigating.
  const navigateStep = useCallback(
    (target) => {
      if (
        target === "plot" &&
        step === "configure" &&
        pendingSelection.length >= 2 &&
        pendingSelection.length <= 3
      ) {
        const changed =
          pendingSelection.length !== setNames.length ||
          pendingSelection.some((n) => !setNames.includes(n));
        if (changed) commitSelection(pendingSelection, allColumnSets);
      }
      setStep(target);
    },
    [step, pendingSelection, setNames, allColumnSets, commitSelection, setStep]
  );

  const doParse = useCallback(
    (text, sep) => {
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const { headers, rows } = parseRaw(dc.text, sep);
      if (!headers.length || !rows.length) {
        setParseError("The file appears to be empty or has no data rows.");
        return;
      }

      const { setNames: sn, sets: ss } = parseSetData(headers, rows);

      if (sn.length < 2) {
        setParseError("Need at least 2 sets — each column header becomes a set name.");
        return;
      }

      setParseError(null);
      setParsedHeaders(headers);
      setParsedRows(rows);
      setAllColumnNames(sn);
      setAllColumnSets(ss);

      if (sn.length <= 3) {
        setPendingSelection(sn);
        commitSelection(sn, ss);
        setStep("plot");
      } else {
        setPendingSelection([]);
        setSetNames([]);
        setSets(new Map());
        setActiveSets(new Set());
        setSetColors({});
        setSelectedMask(null);
        setStep("configure");
      }
    },
    [commitSelection]
  );

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__VENN_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFileName("arabidopsis_stress.csv");
    doParse(text, ",");
  }, [doParse]);

  const handleColorChange = (name, color) => {
    setSetColors((prev) => ({ ...prev, [name]: color }));
  };

  const handleRename = (oldName, newName) => {
    if (oldName === newName || setNames.includes(newName)) return false;
    setSetNames((prev) => prev.map((n) => (n === oldName ? newName : n)));
    setSets((prev) => {
      const m = new Map();
      for (const [k, v] of prev) m.set(k === oldName ? newName : k, v);
      return m;
    });
    setSetColors((prev) => {
      const c = {};
      for (const [k, v] of Object.entries(prev)) c[k === oldName ? newName : k] = v;
      return c;
    });
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(oldName)) {
        s.delete(oldName);
        s.add(newName);
      }
      return s;
    });
    return true;
  };

  const handleToggleSet = (name) => {
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name);
      else s.add(name);
      return s;
    });
    setSelectedMask(null);
  };

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(new Map());
    setSetColors({});
    setActiveSets(new Set());
    setParseError(null);
    setSelectedMask(null);
    setProportional(false);
    updVis({ _reset: true });
  };

  const selectedIntersection = intersections.find((g) => g.mask === selectedMask) || null;

  return (
    <PlotToolShell
      state={{ ...shell, setStep: navigateStep }}
      toolName="venn"
      title="Venn Diagram"
      subtitle="Set overlaps with data extraction (2–3 sets)"
      visInit={VIS_INIT_VENN}
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

      {step === "configure" && allColumnNames.length >= 2 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          allColumnNames={allColumnNames}
          allColumnSets={allColumnSets}
          pendingSelection={pendingSelection}
          setPendingSelection={setPendingSelection}
          onCommit={(names) => {
            commitSelection(names, allColumnSets);
            setStep("plot");
          }}
        />
      )}

      {step === "plot" && activeSetNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              allSetNames={setNames}
              allSets={sets}
              activeSetNames={activeSetNames}
              activeSets={activeSets}
              intersections={intersections}
              onToggleSet={handleToggleSet}
              setColors={setColors}
              onColorChange={handleColorChange}
              onRename={handleRename}
              vis={vis}
              updVis={updVis}
              chartRef={chartRef}
              resetAll={resetAll}
              proportional={proportional}
              onProportionalChange={setProportional}
              fileName={fileName}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="dv-panel dv-plot-card"
                style={{
                  padding: 20,
                  background: "var(--plot-card-bg)",
                  borderColor: "var(--plot-card-border)",
                }}
              >
                <VennChart
                  ref={chartRef}
                  setNames={activeSetNames}
                  sets={activeSetsMap}
                  intersections={intersections}
                  colors={setColors}
                  selectedMask={selectedMask}
                  onRegionClick={setSelectedMask}
                  plotTitle={vis.plotTitle}
                  plotBg={vis.plotBg}
                  fontSize={vis.fontSize}
                  fillOpacity={vis.fillOpacity}
                  readabilityBlend={vis.readabilityBlend}
                  showOutline={vis.showOutline}
                  onLayoutInfo={setLayoutInfo}
                  proportional={proportional}
                />
              </div>
              {/* Layout info banner — shows proportionality accuracy */}
              {(() => {
                if (!proportional) return null;
                const pctMax = (layoutInfo.maxError * 100).toFixed(1);
                const pctMean = (layoutInfo.meanError * 100).toFixed(1);
                const exact = layoutInfo.warnings.length === 0 && layoutInfo.maxError < 0.005;
                const hasWarnings = layoutInfo.warnings.length > 0;
                const bg = exact
                  ? "var(--success-bg)"
                  : hasWarnings
                    ? "var(--warning-bg)"
                    : "var(--info-bg)";
                const border = exact
                  ? "var(--success-border)"
                  : hasWarnings
                    ? "var(--warning-border)"
                    : "var(--info-border)";
                const color = exact
                  ? "var(--success-text)"
                  : hasWarnings
                    ? "var(--warning-text)"
                    : "var(--info-text)";
                return (
                  <div
                    style={{
                      margin: "8px 0 0",
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: bg,
                      border: `1px solid ${border}`,
                      fontSize: 11,
                      color,
                    }}
                  >
                    {exact ? (
                      <div>Areas are proportional to set sizes (max region error &lt; 0.5%)</div>
                    ) : (
                      <div>
                        Max region error: <strong>{pctMax}%</strong> · mean {pctMean}%
                      </div>
                    )}
                    {hasWarnings &&
                      layoutInfo.warnings.map((w, i) => (
                        <div key={i} style={{ marginTop: 2 }}>
                          {w}
                        </div>
                      ))}
                  </div>
                );
              })()}

              {/* Data extraction panel */}
              <div className="dv-panel" style={{ marginTop: 16 }}>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Intersections
                </p>
                <IntersectionTable
                  intersections={intersections}
                  allSetNames={activeSetNames}
                  selectedMask={selectedMask}
                  onSelect={setSelectedMask}
                />
              </div>
              <div className="dv-panel" style={{ marginTop: 16 }}>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Items
                </p>
                <ItemListPanel
                  intersection={selectedIntersection}
                  allSetNames={activeSetNames}
                  fileName={fileName}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Venn diagram">
    <App />
  </ErrorBoundary>
);
