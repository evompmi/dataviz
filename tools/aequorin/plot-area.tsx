// PlotPanel (the main plot orchestrator — renders the collapsible time-course
// chart tile, the collapsible Σ barplot tile with its per-replicate CSV
// table, and embeds the stats panel), plus the smaller right-column UI
// affordances SampleSelectionOverlay (the sticky "Sample selection" pill
// with its popover grid) and ConditionEditor (the sidebar "Conditions" tile
// editor). Depends on the sibling chart + stats-panel modules; shared UI
// (ColorInput, AequorinStatsPanel consumers) resolves through shared.bundle.js
// and the co-located imports below.

import { Chart, InsetBarplot, FacetChartItem } from "./chart";
import { AequorinStatsPanel } from "./stats-panel";
import { AQ_ERROR_BAR_LABELS } from "./reports";
import { convertTime, smooth } from "./helpers";

const { useState, useMemo, useRef, useEffect } = React;

// ── PlotPanel ────────────────────────────────────────────────────────────────

export const PlotPanel = React.forwardRef<any, any>(function PlotPanel(
  {
    stats,
    xStart,
    xEnd,
    yMin,
    yMax,
    faceted,
    title,
    subtitle,
    smoothWidth,
    plotBg,
    showGrid,
    lineWidth,
    ribbonOpacity,
    gridColor,
    timeStep,
    baseUnit,
    displayUnit,
    showInset,
    insetFillOpacity,
    insetBarWidth,
    insetBarGap,
    insetYMin,
    insetYMax,
    insetW,
    insetH,
    insetErrorType,
    insetShowBarOutline,
    insetBarOutlineColor,
    insetBarStrokeWidth,
    insetShowGrid,
    insetGridColor,
    insetErrorStrokeWidth,
    insetXFontSize,
    insetYFontSize,
    insetXLabelAngle,
    insetShowPoints,
    insetPointSize,
    insetPointColor,
    formula,
    replicateSums,
    fileName,
  },
  ref
) {
  const activeStats = stats.filter((s) => s.enabled);
  const combinedRef = useRef();
  const facetRefs = useRef({});
  const [statsDataMode, setStatsDataMode] = useState<"raw" | "corrected">("corrected");
  const [statsAnnotations, setStatsAnnotations] = useState(null);
  const [statsSummary, setStatsSummary] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(true);
  const [replicateTableOpen, setReplicateTableOpen] = useState(false);
  const [insetOpen, setInsetOpen] = useState(true);
  useEffect(() => {
    if (showInset) setInsetOpen(true);
  }, [showInset]);
  const barRef = useRef();

  const statsGroups = useMemo(() => {
    if (!showInset || !replicateSums || replicateSums.length < 2) return null;
    // Only include conditions that are enabled (match activeStats)
    const activeLabels = new Set(activeStats.map((s) => s.prefix));
    const filtered = replicateSums.filter((rs) => activeLabels.has(rs.prefix));
    if (filtered.length < 2) return null;
    return filtered.map((rs) => ({
      name: rs.label,
      values: rs.repSums.map((rep) => (statsDataMode === "raw" ? rep.rawSum : rep.corrSum)),
    }));
  }, [showInset, replicateSums, activeStats, statsDataMode]);

  const series = useMemo(() => {
    if (activeStats.length === 0) return [];
    return activeStats.map((cond) => {
      const sm = smooth(cond.means, smoothWidth);
      const ssd = smooth(cond.sds, smoothWidth);
      const rows = [];
      for (let r = xStart; r <= xEnd && r < cond.means.length; r++) {
        rows.push({ t: r, mean: sm[r], sd: ssd[r] });
      }
      return {
        prefix: cond.prefix,
        label: cond.label,
        color: cond.color,
        n: (cond.activeColIndices || cond.colIndices).length,
        rows,
      };
    });
  }, [
    activeStats.length,
    activeStats
      .map(
        (s) =>
          s.prefix +
          "|" +
          s.label +
          "|" +
          s.color +
          "|" +
          s.enabled +
          ":" +
          (s.activeColIndices || s.colIndices).join(":")
      )
      .join(","),
    xStart,
    xEnd,
    smoothWidth,
  ]);

  const ts = timeStep || 1;
  const bUnit = baseUnit || "s";
  const dUnit = displayUnit || bUnit;
  const convFactor = convertTime(1, bUnit, dUnit);
  const xLabelText = `Time (${dUnit})`;
  const displayXStart = xStart * ts * convFactor;
  const displayXEnd = xEnd * ts * convFactor;

  const displaySeries = useMemo(() => {
    return series.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({ ...r, t: r.t * ts * convFactor })),
    }));
  }, [series, ts, convFactor]);

  const baseName = fileBaseName(fileName, "aequorin");

  React.useImperativeHandle(
    ref,
    () => ({
      downloadMain: () => {
        if (faceted) {
          displaySeries.forEach((s) =>
            downloadSvg(facetRefs.current[s.prefix], `${baseName}_${s.label}.svg`)
          );
        } else {
          downloadSvg(combinedRef.current, `${baseName}_combined.svg`);
        }
        if (showInset && barRef.current) {
          const suffix = statsDataMode === "raw" ? "raw" : "corrected";
          downloadSvg(barRef.current, `${baseName}_barplot_${suffix}.svg`);
        }
      },
      downloadMainPng: () => {
        if (faceted) {
          displaySeries.forEach((s) =>
            downloadPng(facetRefs.current[s.prefix], `${baseName}_${s.label}.png`)
          );
        } else {
          downloadPng(combinedRef.current, `${baseName}_combined.png`);
        }
        if (showInset && barRef.current) {
          const suffix = statsDataMode === "raw" ? "raw" : "corrected";
          downloadPng(barRef.current, `${baseName}_barplot_${suffix}.png`);
        }
      },
    }),
    [faceted, displaySeries, showInset, statsDataMode, baseName]
  );

  if (activeStats.length === 0)
    return (
      <div
        style={{
          padding: "60px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 14,
        }}
      >
        No conditions or samples selected. Enable at least one to display the plot.
      </div>
    );

  const insetBarProps = {
    series,
    insetFillOpacity,
    insetBarWidth,
    insetBarGap,
    insetW,
    insetH,
    insetErrorType,
    insetShowBarOutline,
    insetBarOutlineColor,
    insetBarStrokeWidth,
    insetShowGrid,
    insetGridColor,
    insetErrorStrokeWidth,
    insetXFontSize,
    insetYFontSize,
    insetXLabelAngle,
    plotBg,
    plotTitle: title || null,
    plotSubtitle: subtitle || null,
    replicateSums,
  };

  const isCorrected = statsDataMode === "corrected";
  const sumKey = isCorrected ? "corrSum" : "rawSum";
  const sumLabel = isCorrected ? "Corrected Sum" : "Raw Sum";
  const csvFileName = isCorrected ? `${baseName}_corrected_sums.csv` : `${baseName}_raw_sums.csv`;

  const IntegralTile = showInset ? (
    <div
      style={{
        marginTop: 16,
        borderRadius: 10,
        border: "1px solid var(--border-strong)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setInsetOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted)",
          }}
        >
          <span
            className={"dv-disclosure" + (insetOpen ? " dv-disclosure-open" : "")}
            aria-hidden="true"
          />
          Barplot (Σ of plotted values)
        </span>
      </button>
      {insetOpen && (
        <div style={{ padding: "0 16px 16px" }}>
          {/* Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              Integral:
            </span>
            <button
              onClick={() => setStatsDataMode("raw")}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: statsDataMode === "raw" ? "var(--cta-primary-bg)" : "var(--surface)",
                color: statsDataMode === "raw" ? "var(--on-accent)" : "var(--text-faint)",
                border: `1px solid ${statsDataMode === "raw" ? "var(--cta-primary-bg)" : "var(--border-strong)"}`,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Σ Raw
            </button>
            <button
              onClick={() => setStatsDataMode("corrected")}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background:
                  statsDataMode === "corrected" ? "var(--cta-primary-bg)" : "var(--surface)",
                color: statsDataMode === "corrected" ? "var(--on-accent)" : "var(--text-faint)",
                border: `1px solid ${statsDataMode === "corrected" ? "var(--cta-primary-bg)" : "var(--border-strong)"}`,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Σ Baseline-corrected
            </button>
          </div>

          {/* The inner .dv-plot-card is the actual plot canvas (stays white
              for export consistency + dimmed via filter in dark mode); the
              outer IntegralTile uses themed surface colors so its chrome
              follows dark mode. */}
          <div
            className="dv-plot-card"
            style={{
              background: "var(--plot-card-bg)",
              borderRadius: 8,
              padding: 12,
              border: "1px solid var(--plot-card-border)",
            }}
          >
            <InsetBarplot
              ref={barRef}
              {...insetBarProps}
              insetW={Math.max(200, series.length * 100 + 86)}
              insetH={420}
              insetYMin={insetYMin}
              insetYMax={insetYMax}
              corrected={isCorrected}
              annotations={statsAnnotations}
              statsSummary={statsSummary}
              insetXFontSize={12}
              insetYFontSize={11}
              showPoints={insetShowPoints}
              pointSize={insetPointSize}
              pointColor={insetPointColor}
            />
          </div>

          {/* CSV table */}
          {replicateSums && replicateSums.length > 0 && (
            <div
              className="dv-panel"
              style={{ marginTop: 12, background: "var(--surface-subtle)", marginBottom: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  onClick={() => setReplicateTableOpen((o) => !o)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    userSelect: "none",
                    flex: 1,
                  }}
                >
                  <span
                    className={"dv-disclosure" + (replicateTableOpen ? " dv-disclosure-open" : "")}
                    aria-hidden="true"
                  />
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "var(--text)",
                      letterSpacing: "0.2px",
                    }}
                  >
                    Per replicate
                  </h3>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rows = replicateSums.flatMap((rs) =>
                      rs.repSums.map((rep, ri) => [
                        rs.prefix,
                        `Rep ${ri + 1}`,
                        rep[sumKey] != null ? rep[sumKey].toFixed(6) : "",
                      ])
                    );
                    downloadCsv(["Condition", "Replicate", sumLabel], rows, csvFileName);
                    flashSaved(e.currentTarget);
                  }}
                  className="dv-btn dv-btn-dl"
                >
                  ⬇ CSV
                </button>
              </div>
              {replicateTableOpen && (
                <table
                  style={{ borderCollapse: "collapse", fontSize: 11, width: "100%", marginTop: 10 }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-strong)" }}>
                      {["Condition", "Replicate", sumLabel].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "3px 8px",
                            textAlign: "left",
                            color: "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {replicateSums.map((rs) =>
                      rs.repSums.map((rep, ri) => (
                        <tr
                          key={`${rs.prefix}-${ri}`}
                          style={{ borderBottom: "1px solid var(--border)" }}
                        >
                          <td style={{ padding: "3px 8px", color: "var(--text)", fontWeight: 600 }}>
                            {rs.label}
                          </td>
                          <td style={{ padding: "3px 8px", color: "var(--text-muted)" }}>
                            Rep {ri + 1}
                          </td>
                          <td
                            style={{
                              padding: "3px 8px",
                              color: "var(--text)",
                              fontFamily: "monospace",
                            }}
                          >
                            {rep[sumKey] != null ? rep[sumKey].toFixed(4) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Stats panel */}
          {statsGroups && (
            <div style={{ marginTop: 12 }}>
              <AequorinStatsPanel
                groups={statsGroups}
                fileStem={`${baseName}_stats`}
                onAnnotationChange={setStatsAnnotations}
                onSummaryChange={setStatsSummary}
                errorBarLabel={AQ_ERROR_BAR_LABELS[insetErrorType]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  // ── Collapsible time-course chart tile ──
  // Same two-level theming as IntegralTile: outer is themed chrome (goes
  // dark in dark mode), inner wraps the chart SVG in a .dv-plot-card so
  // the plot canvas stays white-and-dimmed for export consistency.
  const ChartTile = (chartContent) => (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--border-strong)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setChartOpen(!chartOpen)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-muted)",
          }}
        >
          <span
            className={"dv-disclosure" + (chartOpen ? " dv-disclosure-open" : "")}
            aria-hidden="true"
          />
          Time-course plot
        </span>
      </button>
      {chartOpen && (
        <div style={{ padding: "0 12px 12px" }}>
          <div
            className="dv-plot-card"
            style={{
              background: "var(--plot-card-bg)",
              borderRadius: 8,
              border: "1px solid var(--plot-card-border)",
              padding: 12,
            }}
          >
            {chartContent}
          </div>
        </div>
      )}
    </div>
  );

  if (faceted) {
    const nCols = Math.min(displaySeries.length, 3);
    return (
      <div>
        {ChartTile(
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${nCols}, 1fr)`,
              gap: 16,
              alignItems: "stretch",
            }}
          >
            {displaySeries.map((s) => {
              const chartProps = {
                series: [s],
                xStart: displayXStart,
                xEnd: displayXEnd,
                yMin,
                yMax,
                vbW: 400,
                vbH: 260,
                xLabel: xLabelText,
                yLabel: formula === "none" ? "RLU (raw)" : "[Ca²⁺] (µM)",
                plotBg,
                showGrid,
                lineWidth,
                ribbonOpacity,
                gridColor,
                plotTitle: s.label,
                svgLegend: null,
              };
              return (
                <FacetChartItem
                  key={s.prefix}
                  s={s}
                  facetRefs={facetRefs}
                  chartProps={chartProps}
                />
              );
            })}
          </div>
        )}
        {IntegralTile}
      </div>
    );
  }

  return (
    <div>
      {ChartTile(
        <>
          <Chart
            ref={combinedRef}
            series={displaySeries}
            xStart={displayXStart}
            xEnd={displayXEnd}
            yMin={yMin}
            yMax={yMax}
            vbW={800}
            vbH={420}
            xLabel={xLabelText}
            yLabel={formula === "none" ? "RLU (raw)" : "[Ca²⁺] (µM)"}
            plotBg={plotBg}
            showGrid={showGrid}
            lineWidth={lineWidth}
            ribbonOpacity={ribbonOpacity}
            gridColor={gridColor}
            plotTitle={title || null}
            plotSubtitle={subtitle || null}
            svgLegend={[
              {
                id: "legend-samples",
                title: null,
                items: displaySeries.map((s) => ({
                  label: `${s.label} (n=${s.n})`,
                  color: s.color,
                  shape: "line",
                })),
              },
            ]}
          />
        </>
      )}
      {IntegralTile}
    </div>
  );
});

// ── ConditionEditor ──────────────────────────────────────────────────────────
// Sidebar "Conditions" tile editor — toggle per-condition enable, edit
// label/color. Rendered inside PlotControls' ControlSection.

export function ConditionEditor({ conditions, onChange }) {
  const update = (i, key, val) =>
    onChange(conditions.map((c, j) => (j === i ? { ...c, [key]: val } : c)));
  const toggle = (i) =>
    onChange(conditions.map((c, j) => (j === i ? { ...c, enabled: !c.enabled } : c)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {conditions.map((c, i) => (
        <div
          key={c.prefix}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 12,
            background: c.enabled ? "var(--surface-sunken)" : "var(--surface-subtle)",
            opacity: c.enabled ? 1 : 0.4,
            border: "1px solid var(--border-strong)",
          }}
        >
          <input
            type="checkbox"
            checked={c.enabled}
            onChange={() => toggle(i)}
            style={{ accentColor: c.color, flexShrink: 0 }}
          />
          <ColorInput value={c.color} onChange={(v) => update(i, "color", v)} size={20} />
          <input
            value={c.label}
            onChange={(e) => update(i, "label", e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 4,
              color: "var(--text)",
              padding: "2px 5px",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          />
          <span style={{ color: "var(--text-faint)", fontSize: 10, flexShrink: 0 }}>
            ({c.colIndices.length})
          </span>
        </div>
      ))}
    </div>
  );
}

// ── SampleSelectionOverlay ───────────────────────────────────────────────────
// Sticky "Sample selection" pill + popover grid. Lets the user toggle
// individual replicates on/off without leaving the plot step.

export function SampleSelectionOverlay({
  showColumnOverlay,
  setShowColumnOverlay,
  poolReplicates,
  colInfo,
  columnEnabled,
  handleColumnToggle,
  conditions,
}) {
  const labelByPrefix = {};
  (conditions || []).forEach((c) => {
    if (c && c.prefix != null) labelByPrefix[c.prefix] = c.label ?? c.prefix;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginBottom: 2,
        }}
      >
        Samples
      </span>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          onClick={() => setShowColumnOverlay(!showColumnOverlay)}
          aria-pressed={showColumnOverlay}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            background: showColumnOverlay ? "var(--warning-bg)" : "var(--surface)",
            color: "var(--warning-text)",
            border: `1px solid ${showColumnOverlay ? "var(--warning-text)" : "var(--warning-border)"}`,
          }}
        >
          {showColumnOverlay ? "✕ Close" : "🔬 Sample selection"}
        </button>
        {showColumnOverlay && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 6,
              width: 420,
              background: "var(--surface)",
              borderRadius: 10,
              border: "1px solid var(--warning-border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              padding: "12px 14px",
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                maxHeight: 260,
                overflowY: "auto",
                padding: 2,
              }}
            >
              {(() => {
                const groups = [];
                const seen = {};
                colInfo.forEach((c) => {
                  if (!seen[c.h]) {
                    seen[c.h] = { name: c.h, cols: [] };
                    groups.push(seen[c.h]);
                  }
                  seen[c.h].cols.push(c);
                });
                return groups.map((g) => {
                  const headerLabel = poolReplicates ? (labelByPrefix[g.name] ?? g.name) : g.name;
                  return (
                    <div
                      key={g.name}
                      style={{
                        background: "var(--surface-subtle)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        padding: "5px 7px",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          marginBottom: 3,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {headerLabel}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {g.cols.map(({ h, i, rep }) => {
                          const enabled = columnEnabled[i] !== false;
                          const showRep = g.cols.length > 1 || !poolReplicates;
                          return (
                            <label
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                padding: "2px 6px",
                                background: enabled ? "var(--surface)" : "var(--surface-subtle)",
                                borderRadius: 4,
                                border: `1px solid ${enabled ? "var(--border-strong)" : "var(--border)"}`,
                                opacity: enabled ? 1 : 0.45,
                                fontSize: 10,
                                cursor: "pointer",
                                userSelect: "none",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) => handleColumnToggle(i, e.target.checked)}
                                style={{
                                  accentColor: "var(--warning-text)",
                                  width: 12,
                                  height: 12,
                                }}
                              />
                              {showRep ? `rep${rep}` : h}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
