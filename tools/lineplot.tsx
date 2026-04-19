/// <reference path="../types/globals.d.ts" />
// tools/lineplot.tsx — Line / profile plot.
//
// Long-format input (x, y, group). One line per group through mean ± error at
// each distinct x. Per-x statistical tests pick a routine (t / Welch / MWU for
// k=2; ANOVA / Welch-ANOVA / Kruskal-Wallis for k≥3) via `selectTest`, with
// BH-adjusted stars above significant x positions and a per-x StatsTile below
// the chart (auto-surfaces ↓ TXT decision trace and ↓ R script chips).
//
// v1 scope: linear axes, segmented lines (no smoothing), no curve fitting.

const { useState, useEffect, useRef, useReducer, useMemo, useCallback, forwardRef } = React;

// ── Constants ──────────────────────────────────────────────────────────────
const MARGIN = { top: 20, right: 20, bottom: 48, left: 62 };
const STAR_ROW_H = 18;

const ERROR_KINDS = [
  { value: "sem", label: "SEM" },
  { value: "sd", label: "SD" },
  { value: "ci95", label: "95% CI" },
];

// ── Small helpers ──────────────────────────────────────────────────────────

const round4 = (v) => Math.round(v * 10000) / 10000;
const round2 = (v) => Math.round(v * 100) / 100;

function buildLineD(pts) {
  const valid = pts.filter((p) => p.y != null);
  if (valid.length < 2) return "";
  return "M" + valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
}

function formatX(x) {
  if (x == null || !Number.isFinite(x)) return String(x);
  return Number.isInteger(x) ? String(x) : String(round4(x));
}

// Run the test that `selectTest` chose. Returns `{p, error?}` in every case so
// downstream code doesn't have to branch on the test name.
function runChosenTest(testName, groupValues) {
  try {
    if (testName === "studentT") return tTest(groupValues[0], groupValues[1], { equalVar: true });
    if (testName === "welchT") return tTest(groupValues[0], groupValues[1], { equalVar: false });
    if (testName === "mannWhitney") return mannWhitneyU(groupValues[0], groupValues[1]);
    if (testName === "oneWayANOVA") return oneWayANOVA(groupValues);
    if (testName === "welchANOVA") return welchANOVA(groupValues);
    if (testName === "kruskalWallis") return kruskalWallis(groupValues);
    return { error: "unknown test" };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// ── Series + per-x stats ───────────────────────────────────────────────────

// Build per-group point summaries keyed on strict numeric x equality.
function computeSeries(data, rawData, xCol, yCol, groupCol, groupColors, palette) {
  // Preserve first-seen group order so legend ordering matches the CSV.
  const groupOrder = [];
  const perGroup = new Map<string, Map<number, number[]>>();

  for (let ri = 0; ri < data.length; ri++) {
    const x = data[ri][xCol];
    const y = data[ri][yCol];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const gName = groupCol == null ? "(all)" : String(rawData[ri][groupCol] ?? "");
    if (!perGroup.has(gName)) {
      perGroup.set(gName, new Map());
      groupOrder.push(gName);
    }
    const xMap = perGroup.get(gName);
    if (!xMap.has(x)) xMap.set(x, []);
    xMap.get(x).push(y);
  }

  return groupOrder.map((name, idx) => {
    const xMap = perGroup.get(name);
    const xs = [...xMap.keys()].sort((a, b) => a - b);
    const points = xs.map((x) => {
      const values = xMap.get(x);
      const n = values.length;
      const mean = sampleMean(values);
      const sd = n > 1 ? sampleSD(values) : 0;
      const sem = n > 1 ? sd / Math.sqrt(n) : 0;
      const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
      return { x, values, n, mean, sd, sem, ci95 };
    });
    return {
      name,
      color: groupColors[name] || palette[idx % palette.length],
      points,
    };
  });
}

// For each x shared by ≥2 groups (with n≥2 per group), run the routed test and
// BH-adjust across x. Returns one row per eligible x.
function computePerXStats(series) {
  const xSet = new Set<number>();
  for (const s of series) for (const p of s.points) xSet.add(p.x);
  const xs = [...xSet].sort((a, b) => a - b);

  const rows = [];
  for (const x of xs) {
    const groups = [];
    for (const s of series) {
      const p = s.points.find((q) => q.x === x);
      if (p && p.n >= 2) groups.push({ name: s.name, values: p.values });
    }
    if (groups.length < 2) continue;
    const values = groups.map((g) => g.values);
    const names = groups.map((g) => g.name);
    const rec = selectTest(values);
    const chosenTest =
      rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
    const result = chosenTest ? runChosenTest(chosenTest, values) : null;
    rows.push({ x, names, values, chosenTest, result });
  }

  // BH-adjust valid p-values across x-axis.
  const validIdx: number[] = [];
  const validPs: number[] = [];
  rows.forEach((r, i) => {
    if (r.result && !r.result.error && Number.isFinite(r.result.p)) {
      validIdx.push(i);
      validPs.push(r.result.p);
    }
  });
  const adjPs = validPs.length > 0 ? bhAdjust(validPs) : [];
  rows.forEach((r) => (r.pAdj = null));
  validIdx.forEach((origIdx, j) => (rows[origIdx].pAdj = adjPs[j]));

  return rows;
}

// ── Chart ──────────────────────────────────────────────────────────────────

const Chart = forwardRef<SVGSVGElement, any>(function Chart(
  {
    series,
    perXStats,
    xMin,
    xMax,
    yMin,
    yMax,
    vbW,
    vbH,
    xLabel,
    yLabel,
    plotTitle,
    plotSubtitle,
    plotBg,
    showGrid,
    gridColor,
    lineWidth,
    pointRadius,
    errorStrokeWidth,
    errorCapWidth,
    errorType,
    svgLegend,
    showStars,
  },
  ref
) {
  const itemW = (b) => {
    const maxLen = Math.max(0, ...(b.items || []).map((i) => (i.label || "").length));
    return Math.max(110, maxLen * 6 + 28);
  };
  const legendH = computeLegendHeight(svgLegend, vbW - MARGIN.left - MARGIN.right, itemW);
  const topPad = (plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0);
  const starRowH = showStars && perXStats.some((r) => r.pAdj != null) ? STAR_ROW_H : 0;

  const w = vbW - MARGIN.left - MARGIN.right;
  const h = vbH - MARGIN.top - MARGIN.bottom;
  const innerTop = MARGIN.top + starRowH;
  const innerH = h - starRowH;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v) => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = (v) => innerTop + (1 - (v - yMin) / yRange) * innerH;
  const clampY = (v) => Math.max(yMin, Math.min(yMax, v));

  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);

  const errOf = (p) => (errorType === "sd" ? p.sd : errorType === "ci95" ? p.ci95 : p.sem);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${vbW} ${vbH + legendH + topPad}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Line chart"}
    >
      <title>{plotTitle || "Line chart"}</title>
      <desc>{`Line chart with ${series.length} group${series.length === 1 ? "" : "s"}`}</desc>
      {plotTitle && (
        <g id="title">
          <text
            x={vbW / 2}
            y={17}
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="#222"
            fontFamily="sans-serif"
          >
            {plotTitle}
          </text>
        </g>
      )}
      {plotSubtitle && (
        <g id="subtitle">
          <text
            x={vbW / 2}
            y={plotTitle ? 34 : 17}
            textAnchor="middle"
            fontSize="12"
            fill="#888"
            fontFamily="sans-serif"
          >
            {plotSubtitle}
          </text>
        </g>
      )}
      <g id="chart" transform={`translate(0, ${topPad})`}>
        <rect
          id="plot-area-background"
          x={MARGIN.left}
          y={MARGIN.top}
          width={w}
          height={h}
          fill={plotBg || "#fff"}
        />
        {showGrid && (
          <g id="grid">
            {yTicks.map((t) => (
              <line
                key={`gy-${t}`}
                x1={MARGIN.left}
                x2={MARGIN.left + w}
                y1={sy(t)}
                y2={sy(t)}
                stroke={gridColor || "#e0e0e0"}
                strokeWidth="0.5"
              />
            ))}
            {xTicks.map((t) => (
              <line
                key={`gx-${t}`}
                x1={sx(t)}
                x2={sx(t)}
                y1={innerTop}
                y2={innerTop + innerH}
                stroke={gridColor || "#e0e0e0"}
                strokeWidth="0.5"
              />
            ))}
          </g>
        )}
        <g id="traces">
          {series.map((s) => {
            const linePts = s.points.map((p) => ({
              x: sx(p.x),
              y: p.mean != null ? sy(p.mean) : null,
            }));
            const d = buildLineD(linePts);
            if (!d) return null;
            return (
              <path
                key={`line-${s.name}`}
                id={`trace-${svgSafeId(s.name)}`}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={lineWidth}
              />
            );
          })}
        </g>
        <g id="error-bars">
          {series.map((s) => (
            <g key={`errs-${s.name}`} id={`errbars-${svgSafeId(s.name)}`}>
              {s.points.map((p, pi) => {
                if (p.n < 2 || p.mean == null) return null;
                const e = errOf(p);
                if (!e || !Number.isFinite(e)) return null;
                const cx = sx(p.x);
                const yHi = sy(clampY(p.mean + e));
                const yLo = sy(clampY(p.mean - e));
                const cap = errorCapWidth / 2;
                return (
                  <g key={`err-${pi}`}>
                    <line
                      x1={cx}
                      x2={cx}
                      y1={yHi}
                      y2={yLo}
                      stroke={s.color}
                      strokeWidth={errorStrokeWidth}
                    />
                    <line
                      x1={cx - cap}
                      x2={cx + cap}
                      y1={yHi}
                      y2={yHi}
                      stroke={s.color}
                      strokeWidth={errorStrokeWidth}
                    />
                    <line
                      x1={cx - cap}
                      x2={cx + cap}
                      y1={yLo}
                      y2={yLo}
                      stroke={s.color}
                      strokeWidth={errorStrokeWidth}
                    />
                  </g>
                );
              })}
            </g>
          ))}
        </g>
        <g id="data-points">
          {series.map((s) => (
            <g key={`pts-${s.name}`} id={`points-${svgSafeId(s.name)}`}>
              {s.points.map((p, pi) =>
                p.mean == null ? null : (
                  <circle
                    key={`pt-${pi}`}
                    cx={sx(p.x)}
                    cy={sy(p.mean)}
                    r={pointRadius}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth="0.5"
                  />
                )
              )}
            </g>
          ))}
        </g>
        {showStars && starRowH > 0 && (
          <g id="significance-stars">
            {perXStats.map((r, i) => {
              if (r.pAdj == null) return null;
              const s = pStars(r.pAdj);
              if (!s || s === "ns") return null;
              return (
                <text
                  key={`star-${i}`}
                  x={sx(r.x)}
                  y={MARGIN.top + 14}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill="#222"
                  fontFamily="sans-serif"
                >
                  {s}
                </text>
              );
            })}
          </g>
        )}
        <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
          <line x1={MARGIN.left} y1={innerTop} x2={MARGIN.left + w} y2={innerTop} />
          <line x1={MARGIN.left + w} y1={innerTop} x2={MARGIN.left + w} y2={innerTop + innerH} />
          <line
            x1={MARGIN.left}
            y1={innerTop + innerH}
            x2={MARGIN.left + w}
            y2={innerTop + innerH}
          />
          <line x1={MARGIN.left} y1={innerTop} x2={MARGIN.left} y2={innerTop + innerH} />
        </g>
        <g id="axis-x">
          {xTicks.map((t) => (
            <g key={t}>
              <line
                x1={sx(t)}
                x2={sx(t)}
                y1={innerTop + innerH}
                y2={innerTop + innerH + 5}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={sx(t)}
                y={innerTop + innerH + 18}
                textAnchor="middle"
                fontSize="11"
                fill="#555"
                fontFamily="sans-serif"
              >
                {t}
              </text>
            </g>
          ))}
        </g>
        <g id="axis-y">
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left - 5}
                x2={MARGIN.left}
                y1={sy(t)}
                y2={sy(t)}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 8}
                y={sy(t) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#555"
                fontFamily="sans-serif"
              >
                {t % 1 === 0 ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
        </g>
        {xLabel && (
          <g id="x-axis-label">
            <text
              x={MARGIN.left + w / 2}
              y={vbH - 4}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {xLabel}
            </text>
          </g>
        )}
        {yLabel && (
          <g id="y-axis-label">
            <text
              transform={`translate(14,${innerTop + innerH / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {yLabel}
            </text>
          </g>
        )}
        {renderSvgLegend(svgLegend, vbH + 10, MARGIN.left, vbW - MARGIN.left - MARGIN.right, itemW)}
      </g>
    </svg>
  );
});

// ── ControlSection (disclosure panel) ──────────────────────────────────────

function ControlSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="dv-panel" style={{ marginBottom: 0, padding: 0 }}>
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

// ── UploadStep ─────────────────────────────────────────────────────────────

function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  onLoadExample,
}) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          setSepOverride(v);
          if (rawText) doParse(rawText, v);
        }}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Bacterial growth curves (3 strains × 5 timepoints × 3 reps)"
        hint="CSV · TSV · TXT — one row per observation, columns for X, Y, and grouping variable"
      />
      <p
        style={{
          margin: "4px 0 12px",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "right",
        }}
      >
        Max file size: 2 MB
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
          {toolIcon("lineplot", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              Line Plot — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Upload → Preview &amp; pick X / Y / Group → Plot with per-x statistics
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
              Data layout
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 }}>
              <strong>Long format</strong> — one <strong>row</strong> per observation, with a
              numeric <strong>X</strong>, a numeric <strong>Y</strong>, and a categorical{" "}
              <strong>group</strong> column. Replicates share the same (X, group) pair. Replicates
              are averaged to build the line; their spread becomes the error bar.
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
              Error bars
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              Pick <strong>SEM</strong> (default), <strong>SD</strong>, or <strong>95% CI</strong>.
              CI uses the <em>t</em> quantile at <em>n−1</em> degrees of freedom. Error bars only
              render when a group has ≥ 2 replicates at that X.
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
              Per-x statistics
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              At every X shared by ≥ 2 groups, the right test is picked automatically (<em>t</em> /
              Welch / Mann-Whitney; ANOVA / Welch-ANOVA / Kruskal-Wallis). P-values are{" "}
              <strong>BH-adjusted</strong> across the X-axis; stars mark significant points.
            </p>
          </div>

          <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              "Long-format (x, y, group)",
              "SEM / SD / 95% CI",
              "Per-x test auto-routing",
              "BH-adjusted significance stars",
              "Decision trace & R export",
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

// ── ConfigureStep ──────────────────────────────────────────────────────────
// Preview the parsed table and confirm the column roles before plotting.

function ConfigureStep({
  parsed,
  fileName,
  xCol,
  setXCol,
  yCol,
  setYCol,
  groupCol,
  setGroupCol,
  numericCols,
  categoricalCols,
  setStep,
}) {
  const canPlot = xCol != null && yCol != null && numericCols.length >= 2;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="dv-panel" style={{ marginBottom: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            Loaded <strong style={{ color: "var(--text)" }}>{fileName || "pasted data"}</strong> —{" "}
            {parsed.rawData.length} rows × {parsed.headers.length} columns
          </p>
          <button
            type="button"
            className="dv-btn dv-btn-plot"
            disabled={!canPlot}
            onClick={() => setStep("plot")}
          >
            Plot →
          </button>
        </div>
        <DataPreview headers={parsed.headers} rows={parsed.rawData} maxRows={10} />
      </div>

      <div className="dv-panel" style={{ marginBottom: 0 }}>
        <p
          style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
        >
          Column roles
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div className="dv-label">X (numeric)</div>
            <select
              value={xCol ?? ""}
              onChange={(e) => setXCol(parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              {numericCols.map((i) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="dv-label">Y (numeric)</div>
            <select
              value={yCol ?? ""}
              onChange={(e) => setYCol(parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              {numericCols.map((i) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="dv-label">Group by</div>
            <select
              value={groupCol == null ? "" : groupCol}
              onChange={(e) => setGroupCol(e.target.value === "" ? null : parseInt(e.target.value))}
              className="dv-select"
              style={{ width: "100%" }}
            >
              <option value="">(single line)</option>
              {categoricalCols.map((i) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!canPlot && (
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--warning-text)" }}>
            Need at least two numeric columns to plot.
          </p>
        )}
      </div>
    </div>
  );
}

// ── PlotControls ───────────────────────────────────────────────────────────

function PlotControls({
  parsed,
  fileName,
  xCol,
  setXCol,
  yCol,
  setYCol,
  groupCol,
  setGroupCol,
  numericCols,
  categoricalCols,
  series,
  setGroupColor,
  vis,
  updVis,
  autoAxis,
  errorType,
  setErrorType,
  showStars,
  setShowStars,
  statsRows,
  svgRef,
  resetAll,
}) {
  const sv = (k) => (v) => updVis({ [k]: v });

  const downloadStatsCsv = () => {
    const headers = ["x", "test", "statistic", "p", "p_adj", "stars"];
    const rows = statsRows.map((r) => {
      const stat =
        r.result && !r.result.error
          ? r.result.t != null
            ? r.result.t
            : r.result.U != null
              ? r.result.U
              : r.result.F != null
                ? r.result.F
                : r.result.H != null
                  ? r.result.H
                  : ""
          : "";
      const p = r.result && !r.result.error ? r.result.p : "";
      const pAdj = r.pAdj != null ? r.pAdj : "";
      const stars = r.pAdj != null ? pStars(r.pAdj) : "";
      return [formatX(r.x), r.chosenTest || "", stat, p, pAdj, stars];
    });
    downloadCsv(headers, rows, `${fileBaseName(fileName, "lineplot")}_stats.csv`);
  };

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
        onDownloadSvg={() =>
          downloadSvg(svgRef.current, `${fileBaseName(fileName, "lineplot")}_lineplot.svg`)
        }
        onDownloadPng={() =>
          downloadPng(svgRef.current, `${fileBaseName(fileName, "lineplot")}_lineplot.png`)
        }
        onReset={resetAll}
        extraDownloads={
          statsRows.length > 0 ? [{ label: "Stats CSV", onClick: downloadStatsCsv }] : []
        }
      />

      <ControlSection title="Columns" defaultOpen>
        <label style={{ display: "block" }}>
          <span className="dv-label">X (numeric)</span>
          <select
            value={xCol}
            onChange={(e) => setXCol(parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {numericCols.map((i) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Y (numeric)</span>
          <select
            value={yCol}
            onChange={(e) => setYCol(parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            {numericCols.map((i) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Group by</span>
          <select
            value={groupCol == null ? "" : groupCol}
            onChange={(e) => setGroupCol(e.target.value === "" ? null : parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%" }}
          >
            <option value="">(single line)</option>
            {categoricalCols.map((i) => (
              <option key={i} value={i}>
                {parsed.headers[i]}
              </option>
            ))}
          </select>
        </label>
      </ControlSection>

      <ControlSection title="Groups" defaultOpen={series.length > 0 && series.length <= 6}>
        {series.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: "var(--text-faint)" }}>
            No groups yet — pick a grouping column.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {series.map((s) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorInput value={s.color} onChange={(c) => setGroupColor(s.name, c)} />
                <span style={{ fontSize: 12, color: "var(--text)" }}>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </ControlSection>

      <ControlSection title="Error bars" defaultOpen>
        <div className="dv-seg" role="group" aria-label="Error bar type">
          {ERROR_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className={"dv-seg-btn" + (errorType === k.value ? " dv-seg-btn-active" : "")}
              onClick={() => setErrorType(k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </ControlSection>

      <ControlSection title="Axes">
        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">X min</span>
            <NumberInput
              value={vis.xMin != null ? vis.xMin : autoAxis.xMin}
              onChange={(e) => updVis({ xMin: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">X max</span>
            <NumberInput
              value={vis.xMax != null ? vis.xMax : autoAxis.xMax}
              onChange={(e) => updVis({ xMax: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">Y min</span>
            <NumberInput
              value={vis.yMin != null ? vis.yMin : autoAxis.yMin}
              onChange={(e) => updVis({ yMin: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
          <label style={{ flex: 1, display: "block" }}>
            <span className="dv-label">Y max</span>
            <NumberInput
              value={vis.yMax != null ? vis.yMax : autoAxis.yMax}
              onChange={(e) => updVis({ yMax: round2(Number(e.target.value)) })}
              step="0.1"
              style={{ width: "100%" }}
            />
          </label>
        </div>
      </ControlSection>

      <ControlSection title="Labels">
        <label style={{ display: "block" }}>
          <span className="dv-label">Title</span>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Subtitle</span>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">X label</span>
          <input
            value={vis.xLabel}
            onChange={(e) => updVis({ xLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="dv-label">Y label</span>
          <input
            value={vis.yLabel}
            onChange={(e) => updVis({ yLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </label>
      </ControlSection>

      <ControlSection title="Style">
        <div>
          <span className="dv-label">Grid</span>
          <div className="dv-seg" role="group" aria-label="Grid">
            <button
              type="button"
              className={"dv-seg-btn" + (!vis.showGrid ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showGrid: false })}
            >
              Off
            </button>
            <button
              type="button"
              className={"dv-seg-btn" + (vis.showGrid ? " dv-seg-btn-active" : "")}
              onClick={() => updVis({ showGrid: true })}
            >
              On
            </button>
          </div>
        </div>
        <div>
          <span className="dv-label">Significance stars</span>
          <div className="dv-seg" role="group" aria-label="Significance stars">
            <button
              type="button"
              className={"dv-seg-btn" + (!showStars ? " dv-seg-btn-active" : "")}
              onClick={() => setShowStars(false)}
            >
              Off
            </button>
            <button
              type="button"
              className={"dv-seg-btn" + (showStars ? " dv-seg-btn-active" : "")}
              onClick={() => setShowStars(true)}
            >
              On
            </button>
          </div>
        </div>
        <SliderControl
          label="Line width"
          value={vis.lineWidth}
          min={0.5}
          max={5}
          step={0.5}
          onChange={sv("lineWidth")}
        />
        <SliderControl
          label="Point radius"
          value={vis.pointRadius}
          min={0}
          max={10}
          step={0.5}
          onChange={sv("pointRadius")}
        />
        <SliderControl
          label="Error cap width"
          value={vis.errorCapWidth}
          min={0}
          max={20}
          step={1}
          onChange={sv("errorCapWidth")}
        />
      </ControlSection>
    </div>
  );
}

// ── Per-x stats panel ──────────────────────────────────────────────────────
//
// One compact summary table: one row per eligible x. Click a row to expand
// the decision trace + post-hoc inline. Aggregate TXT / R downloads at the
// top reproduce every per-x test in a single file.

const TEST_LABELS_LP = {
  studentT: "Student's t",
  welchT: "Welch's t",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};
const POSTHOC_LABELS_LP = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

function postHocForTest(testName) {
  if (testName === "oneWayANOVA") return "tukeyHSD";
  if (testName === "welchANOVA") return "gamesHowell";
  if (testName === "kruskalWallis") return "dunn";
  return null;
}

function runPostHocByName(name, values) {
  if (name === "tukeyHSD") return tukeyHSD(values);
  if (name === "gamesHowell") return gamesHowell(values);
  if (name === "dunn") return dunnTest(values);
  return null;
}

function formatStat(testName, res) {
  if (!res || res.error) return "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${res.U.toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA") {
    const df2 = typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2;
    return `F(${res.df1}, ${df2}) = ${res.F.toFixed(3)}`;
  }
  if (testName === "kruskalWallis") return `H(${res.df}) = ${res.H.toFixed(3)}`;
  return "—";
}

function buildPerXTextBlock(row, xLabel) {
  const lines = [];
  const names = row.names;
  const values = row.values;
  const res = row.result || {};
  lines.push("=".repeat(60));
  lines.push(`${xLabel || "x"} = ${formatX(row.x)}`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push("Groups:");
  for (let i = 0; i < names.length; i++) {
    const vs = values[i];
    const n = vs.length;
    const mean = sampleMean(vs);
    const sd = n > 1 ? sampleSD(vs) : 0;
    const sem = n > 1 ? sd / Math.sqrt(n) : 0;
    const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
    const semStr = n > 1 ? sem.toFixed(3) : "—";
    const ciStr = n > 1 ? `±${ci95.toFixed(3)}` : "—";
    lines.push(
      `  ${names[i]}: n=${n}, mean=${mean.toFixed(3)}, SD=${sd.toFixed(3)}, SEM=${semStr}, 95% CI=${ciStr}`
    );
  }
  lines.push("");
  const rec = row.rec;
  const recTest =
    rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
  const reason = rec && rec.recommendation && rec.recommendation.reason;
  lines.push(`Test: ${TEST_LABELS_LP[row.chosenTest] || row.chosenTest || "—"}`);
  if (reason) lines.push(`Reason: ${reason}`);
  if (res.error) lines.push(`Result: ⚠ ${res.error}`);
  else {
    lines.push(`Result: ${formatStat(row.chosenTest, res)},  p = ${formatP(res.p)}`);
    if (row.pAdj != null) lines.push(`BH-adjusted p (across x-axis): ${formatP(row.pAdj)}`);
  }
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${TEST_LABELS_LP[recTest] || recTest})`);
  lines.push("");
  const norm = (rec && rec.normality) || [];
  if (norm.length > 0) {
    const parts = norm.map((r) => {
      const label = names[r.group] || `g${r.group}`;
      const verdict = r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
      return `${label}: ${verdict}`;
    });
    lines.push(`Shapiro-Wilk: ${parts.join("; ")}`);
  }
  const lev = (rec && rec.levene) || {};
  if (lev.F != null)
    lines.push(
      `Levene: F(${lev.df1},${lev.df2}) = ${lev.F.toFixed(3)}, p = ${formatP(lev.p)} → ${lev.equalVar ? "equal variance" : "unequal variance"}`
    );
  if (names.length >= 3 && row.postHocResult && !row.postHocResult.error) {
    lines.push("");
    lines.push(`Post-hoc — ${POSTHOC_LABELS_LP[row.postHocName] || row.postHocName}:`);
    for (const pr of row.postHocResult.pairs) {
      const p = pr.pAdj != null ? pr.pAdj : pr.p;
      const diff =
        pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? `z=${pr.z.toFixed(3)}` : "—";
      lines.push(`  ${names[pr.i]} vs ${names[pr.j]}: ${diff},  p = ${formatP(p)}  ${pStars(p)}`);
    }
  }
  if (row.powerResult) {
    lines.push("");
    lines.push(
      `Power (target 80%): ${row.powerResult.effectLabel} = ${row.powerResult.effect.toFixed(3)}`
    );
    for (const pr of row.powerResult.rows) {
      const nStr = pr.nForTarget != null ? `${pr.nForTarget} ${row.powerResult.nLabel}` : "> 5000";
      lines.push(`  α=${pr.alpha}: achieved ${(pr.achieved * 100).toFixed(1)}%, need n = ${nStr}`);
    }
    if (row.powerResult.approximate)
      lines.push("  (rank-based test — estimated from parametric analog)");
  }
  lines.push("");
  return lines.join("\n");
}

function buildAggregateReport(rows, xLabel) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const head = [
    "Line Plot — per-x statistical analysis",
    "Generated: " + now,
    `X axis: ${xLabel || "x"}`,
    `Eligible points: ${rows.length}`,
    "",
    "P-values are BH-adjusted across the x-axis. Stars use the adjusted p.",
    "",
  ];
  return head.join("\n") + rows.map((r) => buildPerXTextBlock(r, xLabel)).join("");
}

function buildAggregateRScript(rows, xLabel) {
  if (!rows.length || typeof buildRScript !== "function") return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Dataviz Toolbox — Line Plot R script export (combined per-x analysis)",
    "# Generated: " + now,
    `# X axis: ${xLabel || "x"} — ${rows.length} eligible points.`,
    "# Each section redefines `df` for one x value and runs its assumption checks,",
    "# chosen test, and post-hoc (if applicable).",
    "# -----------------------------------------------------------------------------",
    "",
  ].join("\n");
  const parts = [header];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const block = buildRScript({
      names: row.names,
      values: row.values,
      recommendation: row.rec,
      chosenTest: row.chosenTest,
      postHocName: row.postHocName,
      dataNote: `${xLabel || "x"} = ${formatX(row.x)}`,
    });
    const banner =
      "\n# ==============================================================\n# " +
      `${xLabel || "x"} = ${formatX(row.x)}` +
      "\n# ==============================================================\n";
    if (i === 0) {
      parts.push(banner + block);
    } else {
      const lines = block.split("\n");
      const dfIdx = lines.findIndex((l) => l.startsWith("df <- data.frame"));
      parts.push(banner + (dfIdx >= 0 ? lines.slice(dfIdx).join("\n") : block));
    }
  }
  return parts.join("\n");
}

function PerXDetail({ row, onOverrideTest, isOverridden }) {
  const names = row.names;
  const values = row.values;
  const k = names.length;
  const res = row.result || {};
  const rec = row.rec || {};
  const recReason = rec.recommendation && rec.recommendation.reason;
  const recTest = rec.recommendation && rec.recommendation.test;
  const testOptions =
    k === 2
      ? ["studentT", "welchT", "mannWhitney"]
      : ["oneWayANOVA", "welchANOVA", "kruskalWallis"];

  const subhead: React.CSSProperties = {
    margin: "10px 0 6px",
    padding: "4px 10px",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "var(--subhead-text)",
    background: "var(--subhead-bg)",
    borderRadius: 4,
    display: "block",
  };
  const thS: React.CSSProperties = {
    textAlign: "left",
    padding: "3px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: 11,
  };
  const tdS: React.CSSProperties = {
    padding: "3px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 11,
  };
  const pillOk: React.CSSProperties = {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 8,
    fontSize: 9,
    fontWeight: 700,
    background: "var(--success-bg)",
    color: "var(--success-text)",
  };
  const pillBad: React.CSSProperties = {
    ...pillOk,
    background: "var(--danger-bg)",
    color: "var(--danger-text)",
  };
  const pillNeutral: React.CSSProperties = {
    ...pillOk,
    background: "var(--neutral-bg)",
    color: "var(--neutral-text)",
  };
  const norm = rec.normality || [];
  const lev = rec.levene || {};

  return (
    <div style={{ padding: "6px 16px 12px 16px", background: "var(--surface-subtle)" }}>
      <div style={subhead}>Groups</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>Group</th>
            <th style={thS}>n</th>
            <th style={thS}>Mean</th>
            <th style={thS}>SD</th>
            <th style={thS}>SEM</th>
            <th style={thS}>95% CI</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, i) => {
            const vs = values[i];
            const n = vs.length;
            const m = sampleMean(vs);
            const sd = n > 1 ? sampleSD(vs) : 0;
            const sem = n > 1 ? sd / Math.sqrt(n) : 0;
            const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
            return (
              <tr key={i}>
                <td style={tdS}>{name}</td>
                <td style={tdS}>{n}</td>
                <td style={tdS}>{m.toFixed(3)}</td>
                <td style={tdS}>{sd.toFixed(3)}</td>
                <td style={tdS}>{n > 1 ? sem.toFixed(3) : "—"}</td>
                <td style={tdS}>{n > 1 ? `±${ci95.toFixed(3)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={subhead}>Assumptions</div>
      {norm.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}
          >
            Shapiro-Wilk (normality)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {norm.map((r, i) => {
              const label = names[r.group] || `g${r.group}`;
              const pill = r.normal === true ? pillOk : r.normal === false ? pillBad : pillNeutral;
              const verdict =
                r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
              return (
                <span key={i} style={{ fontSize: 11, color: "var(--text)" }}>
                  {label}: <span style={pill}>{verdict}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {lev.F != null && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 600 }}>Levene</span> — F({lev.df1}, {lev.df2}) ={" "}
          {lev.F.toFixed(3)}, p = {formatP(lev.p)}{" "}
          <span style={lev.equalVar ? pillOk : pillBad}>
            {lev.equalVar ? "equal variance" : "unequal variance"}
          </span>
        </div>
      )}

      <div style={subhead}>Test</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <select
          value={row.chosenTest || ""}
          onChange={(e) =>
            onOverrideTest && onOverrideTest(e.target.value === recTest ? null : e.target.value)
          }
          className="dv-select"
          style={{ fontSize: 11, padding: "2px 6px", minWidth: 180 }}
          onClick={(e) => e.stopPropagation()}
        >
          {testOptions.map((t) => (
            <option key={t} value={t}>
              {TEST_LABELS_LP[t]}
              {t === recTest ? "  (recommended)" : ""}
            </option>
          ))}
        </select>
        {isOverridden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest && onOverrideTest(null);
            }}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 10 }}
          >
            Use recommendation
          </button>
        )}
      </div>
      {recReason && (
        <div
          style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 6 }}
        >
          {recReason}
        </div>
      )}
      <div
        style={{
          padding: "6px 10px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 11,
          color: "var(--text)",
        }}
      >
        {res.error
          ? `⚠ ${res.error}`
          : `${formatStat(row.chosenTest, res)},  p = ${formatP(res.p)}${
              row.pAdj != null ? ` · BH-adjusted p = ${formatP(row.pAdj)}` : ""
            }`}
      </div>

      {k >= 3 && row.postHocResult && !row.postHocResult.error && (
        <>
          <div style={subhead}>
            Post-hoc — {POSTHOC_LABELS_LP[row.postHocName] || row.postHocName}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Pair</th>
                <th style={thS}>{row.postHocName === "dunn" ? "Rank diff" : "Mean diff"}</th>
                <th style={thS}>p</th>
                <th style={thS}>Signif.</th>
              </tr>
            </thead>
            <tbody>
              {row.postHocResult.pairs.map((pr, i) => {
                const p = pr.pAdj != null ? pr.pAdj : pr.p;
                const diff =
                  pr.diff != null
                    ? pr.diff.toFixed(3)
                    : pr.z != null
                      ? `z = ${pr.z.toFixed(3)}`
                      : "—";
                return (
                  <tr key={i}>
                    <td style={tdS}>
                      {names[pr.i]} vs {names[pr.j]}
                    </td>
                    <td style={tdS}>{diff}</td>
                    <td style={tdS}>{formatP(p)}</td>
                    <td
                      style={{
                        ...tdS,
                        fontWeight: 700,
                        color: p < 0.05 ? "var(--success-text)" : "var(--text-faint)",
                      }}
                    >
                      {pStars(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {row.powerResult && (
        <>
          <div style={subhead}>Power analysis (target 80%)</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Effect size</th>
                <th style={thS}>α</th>
                <th style={thS}>Achieved power</th>
                <th style={thS}>n for 80% power</th>
              </tr>
            </thead>
            <tbody>
              {row.powerResult.rows.map((pr, i) => (
                <tr key={i}>
                  {i === 0 ? (
                    <td style={tdS} rowSpan={row.powerResult.rows.length}>
                      {row.powerResult.effectLabel} = {row.powerResult.effect.toFixed(3)}
                    </td>
                  ) : null}
                  <td style={tdS}>{String(pr.alpha)}</td>
                  <td
                    style={{
                      ...tdS,
                      fontWeight: 700,
                      color: pr.achieved >= 0.8 ? "var(--success-text)" : "var(--warning-text)",
                    }}
                  >
                    {(pr.achieved * 100).toFixed(1)}%
                  </td>
                  <td style={tdS}>
                    {pr.nForTarget != null
                      ? `${pr.nForTarget} ${row.powerResult.nLabel}`
                      : "> 5000"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {row.powerResult.approximate && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              Approximation — rank-based test power estimated from its parametric analog.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PerXStatsPanel({ rows, xLabel, fileName }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const stem = fileBaseName(fileName, "lineplot");
  const hasR = typeof buildRScript === "function";

  const enriched = useMemo(() => {
    const withChosen = rows.map((r) => {
      const key = formatX(r.x);
      const rec = selectTest(r.values);
      const recTest =
        rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
      const chosenTest = overrides[key] || recTest || r.chosenTest;
      const result = chosenTest ? runChosenTest(chosenTest, r.values) : null;
      const postHocName = postHocForTest(chosenTest);
      const postHocResult =
        r.names.length >= 3 && postHocName ? runPostHocByName(postHocName, r.values) : null;
      const powerResult = computePowerFromData(chosenTest, r.values);
      return { ...r, rec, chosenTest, result, postHocName, postHocResult, powerResult };
    });
    // Recompute BH-adjusted p-values across the x-axis using the (possibly
    // user-overridden) per-x test results.
    const validIdx: number[] = [];
    const validPs: number[] = [];
    withChosen.forEach((r, i) => {
      if (r.result && !r.result.error && Number.isFinite(r.result.p)) {
        validIdx.push(i);
        validPs.push(r.result.p);
      }
    });
    const adjPs = validPs.length > 0 ? bhAdjust(validPs) : [];
    withChosen.forEach((r) => (r.pAdj = null));
    validIdx.forEach((origIdx, j) => (withChosen[origIdx].pAdj = adjPs[j]));
    return withChosen;
  }, [rows, overrides]);

  const setOverride = (key, test) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (test == null) delete next[key];
      else next[key] = test;
      return next;
    });

  const xSlug = (row, i) => {
    const raw = formatX(row.x);
    const clean =
      typeof svgSafeId === "function"
        ? svgSafeId(String(raw)).replace(/^-+|-+$/g, "")
        : String(raw)
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return clean || `x-${i + 1}`;
  };
  const downloadReport = () => {
    if (enriched.length <= 1) {
      downloadText(buildAggregateReport(enriched, xLabel), `${stem}_stats.txt`);
      return;
    }
    enriched.forEach((row, i) => {
      const content = buildAggregateReport([row], xLabel);
      const name = `${stem}_${xSlug(row, i)}_stats.txt`;
      setTimeout(() => downloadText(content, name), i * 120);
    });
  };
  const downloadR = () => {
    if (enriched.length <= 1) {
      downloadText(buildAggregateRScript(enriched, xLabel), `${stem}_stats.R`);
      return;
    }
    enriched.forEach((row, i) => {
      const content = buildAggregateRScript([row], xLabel);
      const name = `${stem}_${xSlug(row, i)}_stats.R`;
      setTimeout(() => downloadText(content, name), i * 120);
    });
  };

  const thS: React.CSSProperties = {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    color: "var(--subhead-text)",
    fontWeight: 600,
    fontSize: 12,
    background: "var(--subhead-bg)",
  };
  const tdS: React.CSSProperties = {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 12,
  };

  return (
    <div className="dv-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "0.2px",
            }}
          >
            Statistics at each {xLabel || "x"}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Click a row to see the decision trace, assumptions, and post-hoc details. P-values are
            BH-adjusted across the x-axis.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={(e) => {
              downloadReport();
              flashSaved(e.currentTarget);
            }}
            title="Download a plain-text report covering every x"
          >
            ⬇ TXT
          </button>
          {hasR && (
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={(e) => {
                downloadR();
                flashSaved(e.currentTarget);
              }}
              title="Download a runnable R script reproducing every per-x test"
            >
              ⬇ R
            </button>
          )}
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>{xLabel || "x"}</th>
            <th style={thS}>Test</th>
            <th style={thS}>Statistic</th>
            <th style={thS}>p</th>
            <th style={thS}>p (BH)</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => {
            const key = formatX(r.x);
            const isOpen = !!expanded[key];
            const p = r.result && !r.result.error ? r.result.p : null;
            const stars = r.pAdj != null ? pStars(r.pAdj) : "";
            const sig = r.pAdj != null && r.pAdj < 0.05;
            return (
              <React.Fragment key={key}>
                <tr
                  onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                  style={{
                    cursor: "pointer",
                    background: isOpen
                      ? "var(--surface-subtle)"
                      : hovered === key
                        ? "var(--row-hover-bg)"
                        : undefined,
                    transition: "background 120ms ease",
                  }}
                >
                  <td style={{ ...tdS, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {formatX(r.x)}
                  </td>
                  <td style={tdS}>{TEST_LABELS_LP[r.chosenTest] || r.chosenTest || "—"}</td>
                  <td style={{ ...tdS, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {formatStat(r.chosenTest, r.result)}
                  </td>
                  <td style={{ ...tdS, fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {p != null ? formatP(p) : "—"}
                  </td>
                  <td
                    style={{
                      ...tdS,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontWeight: sig ? 700 : 400,
                      color: sig ? "var(--success-text)" : "var(--text)",
                    }}
                  >
                    {r.pAdj != null ? formatP(r.pAdj) : "—"}
                  </td>
                  <td
                    style={{
                      ...tdS,
                      textAlign: "right",
                      color: sig ? "var(--success-text)" : "var(--text-faint)",
                      fontWeight: 700,
                    }}
                  >
                    {stars && stars !== "ns" ? stars : ""}
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                      <PerXDetail
                        row={r}
                        isOverridden={!!overrides[key]}
                        onOverrideTest={(t) => setOverride(key, t)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── PlotStep ───────────────────────────────────────────────────────────────

function PlotStep(props) {
  const {
    parsed,
    fileName,
    series,
    statsRows,
    xCol,
    yCol,
    groupCol: _groupCol,
    vis,
    autoAxis: _autoAxis,
    effAxis,
    errorType,
    showStars,
    svgRef,
    svgLegend,
  } = props;

  const vbW = 700;
  const vbH = 440;
  const xLabelForStats = vis.xLabel || (parsed ? parsed.headers[xCol] : "x");

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* LEFT: controls */}
      <PlotControls {...props} />

      {/* RIGHT: chart + per-x stats */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          {series.length === 0 ? (
            <p
              style={{
                margin: 0,
                padding: "40px 0",
                textAlign: "center",
                color: "var(--text-faint)",
                fontSize: 13,
              }}
            >
              No data to plot. Check your column picks — X and Y must be numeric.
            </p>
          ) : (
            <Chart
              ref={svgRef}
              series={series}
              perXStats={statsRows}
              xMin={effAxis.xMin}
              xMax={effAxis.xMax}
              yMin={effAxis.yMin}
              yMax={effAxis.yMax}
              vbW={vbW}
              vbH={vbH}
              xLabel={vis.xLabel || parsed.headers[xCol]}
              yLabel={vis.yLabel || parsed.headers[yCol]}
              plotTitle={vis.plotTitle}
              plotSubtitle={vis.plotSubtitle}
              plotBg={vis.plotBg}
              showGrid={vis.showGrid}
              gridColor={vis.gridColor}
              lineWidth={vis.lineWidth}
              pointRadius={vis.pointRadius}
              errorStrokeWidth={vis.errorStrokeWidth}
              errorCapWidth={vis.errorCapWidth}
              errorType={errorType}
              svgLegend={svgLegend}
              showStars={showStars}
            />
          )}
        </div>

        {statsRows.length > 0 && (
          <PerXStatsPanel rows={statsRows} xLabel={xLabelForStats} fileName={fileName} />
        )}
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

function App() {
  const [rawText, setRawText] = useState(null);
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [sepOverride, setSepOverride] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState(null);
  const [step, setStep] = useState("upload");

  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState(1);
  const [groupCol, setGroupCol] = useState<number | null>(null);

  const [errorType, setErrorType] = useState("sem");
  const [showStars, setShowStars] = useState(true);
  const [groupColors, setGroupColors] = useState<Record<string, string>>({});

  const visInit = {
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    xLabel: "",
    yLabel: "",
    plotTitle: "",
    plotSubtitle: "",
    plotBg: "#ffffff",
    showGrid: true,
    gridColor: "#e0e0e0",
    lineWidth: 1.5,
    pointRadius: 3.5,
    errorStrokeWidth: 1,
    errorCapWidth: 6,
  };
  const [vis, updVis] = useReducer((s, a) => (a._reset ? { ...visInit } : { ...s, ...a }), visInit);

  const svgRef = useRef<SVGSVGElement>(null);
  const sepRef = useRef("");

  const parsed = useMemo(() => (rawText ? parseData(rawText, sepRef.current) : null), [rawText]);

  const colIsNumeric = useMemo(() => {
    if (!parsed) return {};
    return parsed.headers.reduce((acc, _, i) => {
      const vals = parsed.rawData.map((r) => r[i]).filter((v) => v !== "" && v != null);
      acc[i] = vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
      return acc;
    }, {});
  }, [parsed]);

  const numericCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce((acc, _, i) => (colIsNumeric[i] ? [...acc, i] : acc), []);
  }, [parsed, colIsNumeric]);

  const categoricalCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce((acc, _, i) => (colIsNumeric[i] ? acc : [...acc, i]), []);
  }, [parsed, colIsNumeric]);

  const series = useMemo(() => {
    if (!parsed || xCol == null || yCol == null) return [];
    return computeSeries(parsed.data, parsed.rawData, xCol, yCol, groupCol, groupColors, PALETTE);
  }, [parsed, xCol, yCol, groupCol, groupColors]);

  const setGroupColor = useCallback(
    (name, color) => setGroupColors((prev) => ({ ...prev, [name]: color })),
    []
  );

  const statsRows = useMemo(() => (series.length >= 2 ? computePerXStats(series) : []), [series]);

  const autoAxis = useMemo(() => {
    if (series.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    let xMin = Infinity,
      xMax = -Infinity,
      yLo = Infinity,
      yHi = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.mean == null) continue;
        const e = errorType === "sd" ? p.sd : errorType === "ci95" ? p.ci95 : p.sem;
        const hi = p.mean + (e || 0);
        const lo = p.mean - (e || 0);
        if (lo < yLo) yLo = lo;
        if (hi > yHi) yHi = hi;
      }
    }
    if (!Number.isFinite(xMin)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const xPad = xMin === xMax ? 0.5 : (xMax - xMin) * 0.05;
    const yPad = yLo === yHi ? 0.5 : (yHi - yLo) * 0.08;
    return {
      xMin: round2(xMin - xPad),
      xMax: round2(xMax + xPad),
      yMin: round2(yLo - yPad),
      yMax: round2(yHi + yPad),
    };
  }, [series, errorType]);

  const effAxis = {
    xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
    xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
    yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
    yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax,
  };

  const svgLegend = useMemo(() => {
    if (series.length === 0) return null;
    if (series.length === 1 && series[0].name === "(all)") return null;
    return [
      {
        id: "legend-group",
        title: groupCol != null && parsed ? parsed.headers[groupCol] : "",
        items: series.map((s) => ({ label: s.name, color: s.color, shape: "dot" })),
      },
    ];
  }, [series, groupCol, parsed]);

  // Seed labels when columns change.
  useEffect(() => {
    if (!parsed || xCol == null || yCol == null) return;
    updVis({
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      xLabel: parsed.headers[xCol],
      yLabel: parsed.headers[yCol],
    });
  }, [xCol, yCol, parsed]);

  const doParse = useCallback((text, sep) => {
    sepRef.current = sep;
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    const fixedText = dc.text;
    const { headers, data, rawData } = parseData(fixedText, sep);
    if (headers.length < 2 || data.length === 0) {
      setParseError(
        "The file appears to be empty or has no data rows. Please check your file and try again."
      );
      return;
    }
    setParseError(null);
    setRawText(fixedText);

    const isNum = (idx) => {
      const vals = rawData.map((r) => r[idx]).filter((v) => v !== "" && v != null);
      return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
    };
    const nums = headers.reduce((acc, _, i) => (isNum(i) ? [...acc, i] : acc), []);
    const cats = headers.reduce((acc, _, i) => (isNum(i) ? acc : [...acc, i]), []);
    setXCol(nums[0] !== undefined ? nums[0] : 0);
    setYCol(nums[1] !== undefined ? nums[1] : nums[0] !== undefined ? nums[0] : 1);
    setGroupCol(cats[0] !== undefined ? cats[0] : null);
    setGroupColors({});
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
    const text = (window as any).__LINEPLOT_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFileName("bacterial_growth.csv");
    doParse(text, ",");
  }, [doParse]);

  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setStep("upload");
  };

  const canNavigate = (s) => {
    if (s === "upload") return true;
    if (s === "configure") return !!parsed;
    if (s === "plot") return !!parsed && xCol != null && yCol != null;
    return false;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "var(--text)",
        fontFamily: "monospace",
        padding: "24px 32px",
      }}
    >
      <PageHeader
        toolName="lineplot"
        title="Line Plot"
        subtitle="Profile plot — mean ± error per group at each x, with per-x statistics"
      />

      <StepNavBar
        steps={["upload", "configure", "plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={canNavigate}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      <ParseErrorBanner error={parseError} />

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
          fileName={fileName}
          xCol={xCol}
          setXCol={setXCol}
          yCol={yCol}
          setYCol={setYCol}
          groupCol={groupCol}
          setGroupCol={setGroupCol}
          numericCols={numericCols}
          categoricalCols={categoricalCols}
          setStep={setStep}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed}
          fileName={fileName}
          series={series}
          statsRows={statsRows}
          xCol={xCol}
          setXCol={setXCol}
          yCol={yCol}
          setYCol={setYCol}
          groupCol={groupCol}
          setGroupCol={setGroupCol}
          numericCols={numericCols}
          categoricalCols={categoricalCols}
          setGroupColor={setGroupColor}
          vis={vis}
          updVis={updVis}
          autoAxis={autoAxis}
          effAxis={effAxis}
          errorType={errorType}
          setErrorType={setErrorType}
          showStars={showStars}
          setShowStars={setShowStars}
          svgRef={svgRef}
          svgLegend={svgLegend}
          resetAll={resetAll}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Line plot">
    <App />
  </ErrorBoundary>
);
