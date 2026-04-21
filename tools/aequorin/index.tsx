// tools/aequorin/index.tsx — App orchestrator for the Aequorin Ca²⁺
// Calibration tool. This file is the esbuild entry point (bundles to
// tools/aequorin/index.js) and only holds state wiring — chart rendering,
// step panels, sidebar controls, stats-panel, reports, and pure helpers
// live in sibling modules under tools/aequorin/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import {
  DEFAULT_KR,
  DEFAULT_KTR,
  DEFAULT_KD,
  DEFAULT_HILL_N,
  FORMULA_DEFS,
  calibrate,
  calibrateHill,
  calibrateGeneralized,
  detectConditions,
} from "./helpers";
import { UploadStep, ConfigureStep } from "./steps";
import { PlotControls } from "./controls";
import { PlotPanel, SampleSelectionOverlay } from "./plot-area";

const { useState, useMemo, useCallback, useRef } = React;

const VIS_INIT_AEQUORIN = {
  xStart: 10,
  xEnd: 800,
  yMin: 0.1,
  yMax: 1.4,
  faceted: false,
  plotTitle: "",
  plotSubtitle: "",
  smoothWidth: 3,
  plotBg: "#ffffff",
  showGrid: false,
  lineWidth: 2,
  ribbonOpacity: 0.3,
  gridColor: "#e0e0e0",
  timeStep: 1,
  baseUnit: "s",
  displayUnit: "s",
  showInset: false,
  insetFillOpacity: 0.7,
  insetBarWidth: 70,
  insetBarGap: 0,
  insetYMinCustom: "",
  insetYMaxCustom: "",
  insetW: 400,
  insetH: 200,
  insetErrorType: "none",
  insetShowBarOutline: false,
  insetBarOutlineColor: "#333333",
  insetBarStrokeWidth: 1,
  insetShowGrid: false,
  insetGridColor: "#e0e0e0",
  insetErrorStrokeWidth: 0.8,
  insetXFontSize: 7,
  insetYFontSize: 7,
  insetXLabelAngle: -45,
  showColumnOverlay: false,
  insetShowPoints: false,
  insetPointSize: 3,
  insetPointColor: "#333333",
};

/* ── Main App (orchestrator) ───────────────────────────────────────────────── */

function App() {
  const shell = usePlotToolState("aequorin", VIS_INIT_AEQUORIN);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    vis,
    updVis,
  } = shell;

  // Aequorin keeps parseError as local state (separate from shell.parseError)
  // because it renders a dual-variant banner: "⚠️"-prefixed strings show as a
  // yellow warning (e.g. partial-parse notices), anything else shows as a red
  // error. The shared ParseErrorBanner only renders the red variant, so we
  // bypass PlotToolShell's auto-banner and render our own below the shell's
  // CommaFixBanner.
  const [parseError, setParseError] = useState<string | null>(null);

  const [rawText, setRawText] = useState(null);
  const [formula, setFormula] = useState("none");
  const [Kr, setKr] = useState(DEFAULT_KR);
  const [Ktr, setKtr] = useState(DEFAULT_KTR);
  const [Kd, setKd] = useState(DEFAULT_KD);
  const [hillN, setHillN] = useState(DEFAULT_HILL_N);
  const [conditions, setConditions] = useState([]);
  const [poolReplicates, setPoolReplicates] = useState(true);
  const [columnEnabled, setColumnEnabled] = useState({});

  const parsed = useMemo(() => (rawText ? parseData(rawText) : null), [rawText]);
  const calData = useMemo(() => {
    if (!parsed) return null;
    if (formula === "none") return parsed.data;
    if (formula === "hill") return calibrateHill(parsed.headers, parsed.data, Kd);
    if (formula === "generalized")
      return calibrateGeneralized(parsed.headers, parsed.data, Kr, Ktr, hillN);
    return calibrate(parsed.headers, parsed.data, Kr, Ktr);
  }, [parsed, formula, Kr, Ktr, Kd, hillN]);
  // Signature of only the numerical inputs from `conditions` — i.e. which
  // column indices belong to each condition. Editing a condition's label,
  // color, or enabled flag doesn't change this string, so the heavy
  // per-timepoint and per-replicate loops below are cached across those
  // edits. Renames in particular become cheap: each keystroke on the label
  // input only re-runs the light metadata merge, not the numerics.
  const conditionsNumericKey = conditions
    .map((c) => `${c.prefix}:${(c.activeColIndices || c.colIndices).join(",")}`)
    .join("|");

  // Heavy pass: per-timepoint mean + sd per condition. Keyed on the numeric
  // signature so label/color edits skip it entirely.
  const numericStatsByPrefix = useMemo(() => {
    if (!calData || !parsed || conditions.length === 0) return {};
    const nRows = calData.length;
    const out = {};
    for (const cond of conditions) {
      const idxs = cond.activeColIndices || cond.colIndices;
      const means = [];
      const sds = [];
      for (let r = 0; r < nRows; r++) {
        const vals = idxs.map((i) => calData[r][i]).filter((v) => v != null);
        if (vals.length === 0) {
          means.push(null);
          sds.push(null);
          continue;
        }
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        means.push(m);
        sds.push(
          vals.length < 2
            ? 0
            : Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1))
        );
      }
      out[cond.prefix] = { means, sds };
    }
    return out;
    // `conditions` is intentionally read via the numeric-signature key so
    // label/color edits don't invalidate this cache.
  }, [calData, parsed, conditionsNumericKey]);

  // Cheap pass: merge the per-condition metadata (label, color, enabled, …)
  // with the cached numerics. Runs on every `conditions` change, but does
  // not touch `calData` rows.
  const stats = useMemo(
    () =>
      conditions.map((cond) => ({
        ...cond,
        ...(numericStatsByPrefix[cond.prefix] || { means: [], sds: [] }),
      })),
    [conditions, numericStatsByPrefix]
  );

  // Per-replicate sums for the inset barplot — computed from calData directly so SD/SEM
  // reflect variability across biological replicates, not across time points.
  // Split the same way as above: heavy loops are keyed on the numeric
  // signature + x-window, the cheap merge attaches the current label.
  const replicateSumsByPrefix = useMemo(() => {
    if (!calData || conditions.length === 0) return {};
    const r0 = Math.max(0, Math.floor(vis.xStart));
    const r1 = Math.min(calData.length - 1, Math.ceil(vis.xEnd));
    const out = {};
    for (const cond of conditions) {
      const repSums = (cond.activeColIndices || cond.colIndices).map((ci) => {
        const vals = [];
        for (let r = r0; r <= r1; r++) {
          const v = calData[r] ? calData[r][ci] : null;
          if (v != null) vals.push(v);
        }
        const rawSum = vals.reduce((a, b) => a + b, 0);
        const minVal = vals.length > 0 ? Math.min(...vals) : 0;
        const corrSum = rawSum - vals.length * minVal;
        return { rawSum, corrSum };
      });
      out[cond.prefix] = repSums;
    }
    return out;
  }, [calData, conditionsNumericKey, vis.xStart, vis.xEnd]);

  const replicateSums = useMemo(
    () =>
      stats.map((s) => ({
        prefix: s.prefix,
        label: s.label,
        repSums: replicateSumsByPrefix[s.prefix] || [],
      })),
    [stats, replicateSumsByPrefix]
  );

  // Auto-rescale y-axis whenever formula, data, or visible x window changes
  React.useEffect(() => {
    if (!calData || calData.length === 0) return;
    const r0 = Math.max(0, Math.floor(vis.xStart));
    const r1 = Math.min(calData.length - 1, Math.ceil(vis.xEnd));
    let lo = Infinity,
      hi = -Infinity;
    for (let r = r0; r <= r1; r++)
      calData[r].forEach((v) => {
        if (v != null) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      });
    if (isFinite(lo) && isFinite(hi)) {
      const round2 = (v) => Math.round(v * 100) / 100;
      updVis({ yMin: round2(Math.max(0, lo * 0.9)), yMax: round2(hi * 1.1) });
    }
  }, [formula, calData, vis.xStart, vis.xEnd]);

  const csvText = useMemo(() => {
    if (!calData || !parsed) return "";
    const enabledIdx = parsed.headers.map((_, i) => i).filter((i) => columnEnabled[i] !== false);
    const rows = [enabledIdx.map((i) => parsed.headers[i]).join(",")];
    calData.forEach((r) => rows.push(enabledIdx.map((i) => (r[i] != null ? r[i] : "")).join(",")));
    return rows.join("\n");
  }, [calData, parsed, columnEnabled]);

  // Per-column rep numbers and name counts (for the column grouping UI)
  const colInfo = useMemo(() => {
    if (!parsed) return [];
    const nameOcc = {},
      nameCount = {};
    parsed.headers.forEach((h) => {
      nameCount[h] = (nameCount[h] || 0) + 1;
    });
    return parsed.headers.map((h, i) => {
      nameOcc[h] = (nameOcc[h] || 0) + 1;
      return { h, i, rep: nameOcc[h], isDup: nameCount[h] > 1 };
    });
  }, [parsed]);

  const applyGrouping = (pool, ce, prevConds) => {
    const prevMap = Object.fromEntries(prevConds.map((c) => [c.prefix, c]));
    // Build conditions from ALL columns, then mark enabled based on columnEnabled
    const allConds = detectConditions(parsed.headers, pool, null).map((c) => {
      const activeCols = c.colIndices.filter((ci) => ce[ci] !== false);
      const prev = prevMap[c.prefix];
      // If the previous condition had no active columns, its `enabled=false` was
      // forced by the sample selector rather than a user toggle on the control
      // panel — so re-checking a replicate should bring the whole condition back.
      const prevWasForcedOff =
        prev && (prev.activeColIndices ? prev.activeColIndices.length === 0 : false);
      const enabled = activeCols.length > 0 && (prev && !prevWasForcedOff ? prev.enabled : true);
      return {
        ...c,
        activeColIndices: activeCols,
        enabled,
        label: prev?.label ?? c.label,
        color: prev?.color ?? c.color,
      };
    });
    setConditions(allConds);
  };

  const handlePoolChange = (pool) => {
    setPoolReplicates(pool);
    applyGrouping(pool, columnEnabled, conditions);
  };
  const handleColumnToggle = (i, val) => {
    const ce = { ...columnEnabled, [i]: val };
    setColumnEnabled(ce);
    applyGrouping(poolReplicates, ce, conditions);
  };
  const handleConditionsChange = (newConds) => {
    const ce = { ...columnEnabled };
    const updated = newConds.map((c, idx) => {
      const prev = conditions[idx];
      // Only sync columnEnabled for conditions whose enabled state actually changed
      if (prev && c.enabled !== prev.enabled) {
        c.colIndices.forEach((ci) => {
          ce[ci] = c.enabled;
        });
        return { ...c, activeColIndices: c.enabled ? c.colIndices : [] };
      }
      return c;
    });
    setConditions(updated);
    setColumnEnabled(ce);
  };

  const plotPanelRef = useRef();

  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    setRawText(dc.text);
    const { headers, data } = parseData(dc.text, sep);
    if (!headers.length || !data.length) {
      setParseError(
        "The file appears to be empty or has no data rows. Please check your file and try again."
      );
      return;
    }
    // Check for single-column files
    if (headers.length === 1) {
      setParseError(
        "Only one column detected — this tool expects wide-format data with one column per sample. Check your separator setting or file format."
      );
      return;
    }
    // Check how much of the data is numeric
    const totalCells = data.length * headers.length;
    const numericCells = data.reduce((n, row) => n + row.filter((v) => v != null).length, 0);
    const numericRatio = totalCells > 0 ? numericCells / totalCells : 0;
    if (numericRatio < 0.3) {
      setParseError(
        "Less than 30% of values are numeric. This tool expects a numeric matrix (one column per sample, one row per time-point). Your file may be in long format or contain mostly text."
      );
      return;
    }
    // Warn if the file looks like long format (few columns, one text + one numeric pattern)
    const colTypes = headers.map((_, ci) => {
      const nums = data.filter((r) => r[ci] != null).length;
      return nums / data.length > 0.8 ? "num" : "text";
    });
    const numCols = colTypes.filter((t) => t === "num").length;
    const textCols = colTypes.filter((t) => t === "text").length;
    const warnings = [];
    if (headers.length <= 3 && textCols >= 1 && numCols >= 1)
      warnings.push(
        "⚠️ This looks like it could be long-format data (few columns, mix of text and numbers). This tool expects wide format — one column per sample, one row per time-point."
      );
    // Detect ragged columns (different number of valid values per column)
    const colLengths = headers.map((_, ci) => data.filter((r) => r[ci] != null).length);
    const maxLen = Math.max(...colLengths);
    const minLen = Math.min(...colLengths);
    if (maxLen > 0 && minLen < maxLen) {
      warnings.push(
        `⚠️ Columns have different lengths (${minLen}–${maxLen} numeric values). Some samples may have missing time-points, which can affect mean/SD calculations.`
      );
    }
    setParseError(warnings.length > 0 ? warnings.join("\n") : null);
    const ce = {};
    headers.forEach((_, i) => {
      ce[i] = true;
    });
    setColumnEnabled(ce);
    setPoolReplicates(true);
    const detectedConds = detectConditions(headers, true, ce).map((c) => ({ ...c, enabled: true }));
    setConditions(detectedConds);
    updVis({ xStart: 0, xEnd: data.length, faceted: false });
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
    const text = (window as any).__AEQUORIN_EXAMPLE__;
    if (!text) {
      setParseError("Example dataset not loaded. Please try uploading a file instead.");
      return;
    }
    setSepOverride("\t");
    setFileName("aequorin_example.tsv");
    doParse(text, "\t");
  }, [doParse]);
  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setStep("upload");
  };

  const downloadCalibrated = () => {
    if (!csvText) return;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBaseName(fileName, "aequorin")}_calibrated.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const canNavigate = (s) => s === "upload" || (parsed && s !== "upload");

  return (
    <PlotToolShell
      state={shell}
      toolName="aequorin"
      title="Aequorin Ca²⁺ Calibration"
      visInit={VIS_INIT_AEQUORIN}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {parseError && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: parseError.startsWith("⚠️") ? "#fffbeb" : "#fef2f2",
            border: `1px solid ${parseError.startsWith("⚠️") ? "#fcd34d" : "#fca5a5"}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          {!parseError.startsWith("⚠️") && <span style={{ fontSize: 16 }}>🚫</span>}
          <span
            style={{
              fontSize: 12,
              color: parseError.startsWith("⚠️") ? "var(--warning-text)" : "var(--danger-text)",
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
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && parsed && (
        <ConfigureStep
          parsed={parsed}
          formula={formula}
          setFormula={setFormula}
          Kr={Kr}
          setKr={setKr}
          Ktr={Ktr}
          setKtr={setKtr}
          Kd={Kd}
          setKd={setKd}
          hillN={hillN}
          setHillN={setHillN}
          vis={vis}
          updVis={updVis}
          fileName={fileName}
          calData={calData}
          columnEnabled={columnEnabled}
          downloadCalibrated={downloadCalibrated}
        />
      )}

      {step === "plot" && parsed && calData && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            {/* LEFT: controls panel */}
            <PlotControls
              conditions={conditions}
              setConditions={handleConditionsChange}
              vis={vis}
              updVis={updVis}
              plotPanelRef={plotPanelRef}
              downloadCalibrated={downloadCalibrated}
              resetAll={resetAll}
            />

            {/* RIGHT: chart area */}
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {/* Non-sticky Series (Pool/Individual) + Layout (Combined/Faceted)
                  toggles — absolutely positioned at the top-right so on landing
                  they share a row with the sticky Sample-selection pill, but
                  scroll away normally while Sample selection alone continues
                  to stick. The two groups are separated by a gap and carry
                  tiny captions because they're orthogonal axes: Series is a
                  data-shape decision (how replicates are pooled), Layout is a
                  visual decision (one plot vs. one per condition). Both use
                  the shared --step-active-* slate accent to match the rest
                  of the app chrome — the caption + grouping carries the
                  distinction, not a bespoke hue. */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  zIndex: 19,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 18,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
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
                    Series
                  </span>
                  <div
                    role="group"
                    aria-label="Series definition"
                    style={{
                      display: "inline-flex",
                      border: "1px solid var(--step-active-border)",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "var(--surface)",
                    }}
                  >
                    <button
                      onClick={() => handlePoolChange(true)}
                      aria-pressed={poolReplicates}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        background: poolReplicates ? "var(--step-active-bg)" : "transparent",
                        color: poolReplicates ? "var(--on-accent)" : "var(--text-faint)",
                        border: "none",
                        borderRight: "1px solid var(--step-active-border)",
                      }}
                    >
                      Pool by name
                    </button>
                    <button
                      onClick={() => handlePoolChange(false)}
                      aria-pressed={!poolReplicates}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        background: !poolReplicates ? "var(--step-active-bg)" : "transparent",
                        color: !poolReplicates ? "var(--on-accent)" : "var(--text-faint)",
                        border: "none",
                      }}
                    >
                      Individual
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
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
                    Layout
                  </span>
                  <div
                    role="group"
                    aria-label="Plot layout"
                    style={{
                      display: "inline-flex",
                      border: "1px solid var(--step-active-border)",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "var(--surface)",
                    }}
                  >
                    <button
                      onClick={() => updVis({ faceted: false })}
                      aria-pressed={!vis.faceted}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        background: !vis.faceted ? "var(--step-active-bg)" : "transparent",
                        color: !vis.faceted ? "var(--on-accent)" : "var(--text-faint)",
                        border: "none",
                        borderRight: "1px solid var(--step-active-border)",
                      }}
                    >
                      Combined
                    </button>
                    <button
                      onClick={() => updVis({ faceted: true })}
                      aria-pressed={vis.faceted}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        background: vis.faceted ? "var(--step-active-bg)" : "transparent",
                        color: vis.faceted ? "var(--on-accent)" : "var(--text-faint)",
                        border: "none",
                      }}
                    >
                      Faceted
                    </button>
                  </div>
                </div>
              </div>
              {/* Sticky row: Sample selection. `width: fit-content` keeps
                  the wrapper from stretching across the column — otherwise
                  its empty right half (higher zIndex) sits on top of the
                  absolutely-positioned Combined/Faceted toggle and blocks
                  clicks. */}
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  width: "fit-content",
                }}
              >
                <SampleSelectionOverlay
                  showColumnOverlay={vis.showColumnOverlay}
                  setShowColumnOverlay={(v) => updVis({ showColumnOverlay: v })}
                  poolReplicates={poolReplicates}
                  colInfo={colInfo}
                  columnEnabled={columnEnabled}
                  handleColumnToggle={handleColumnToggle}
                  conditions={conditions}
                />
              </div>
              <PlotPanel
                ref={plotPanelRef}
                stats={stats}
                xStart={vis.xStart}
                xEnd={vis.xEnd}
                yMin={vis.yMin}
                yMax={vis.yMax}
                faceted={vis.faceted}
                title={vis.plotTitle}
                subtitle={vis.plotSubtitle}
                smoothWidth={vis.smoothWidth}
                formula={formula}
                replicateSums={replicateSums}
                fileName={fileName}
                plotBg={vis.plotBg}
                showGrid={vis.showGrid}
                lineWidth={vis.lineWidth}
                ribbonOpacity={vis.ribbonOpacity}
                gridColor={vis.gridColor}
                timeStep={vis.timeStep}
                baseUnit={vis.baseUnit}
                displayUnit={vis.displayUnit}
                showInset={vis.showInset}
                insetFillOpacity={vis.insetFillOpacity}
                insetBarWidth={vis.insetBarWidth}
                insetBarGap={vis.insetBarGap}
                insetYMin={vis.insetYMinCustom !== "" ? Number(vis.insetYMinCustom) : null}
                insetYMax={vis.insetYMaxCustom !== "" ? Number(vis.insetYMaxCustom) : null}
                insetW={vis.insetW}
                insetH={vis.insetH}
                insetErrorType={vis.insetErrorType}
                insetShowBarOutline={vis.insetShowBarOutline}
                insetBarOutlineColor={vis.insetBarOutlineColor}
                insetBarStrokeWidth={vis.insetBarStrokeWidth}
                insetShowGrid={vis.insetShowGrid}
                insetGridColor={vis.insetGridColor}
                insetErrorStrokeWidth={vis.insetErrorStrokeWidth}
                insetXFontSize={vis.insetXFontSize}
                insetYFontSize={vis.insetYFontSize}
                insetXLabelAngle={vis.insetXLabelAngle}
                insetShowPoints={vis.insetShowPoints}
                insetPointSize={vis.insetPointSize}
                insetPointColor={vis.insetPointColor}
              />
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Aequorin calibration">
    <App />
  </ErrorBoundary>
);
