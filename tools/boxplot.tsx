// boxplot.jsx — editable source. Run `npm run build` to compile to boxplot.js
// Do NOT edit the .js file directly.
import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";
import {
  STATS_LINE_H,
  STATS_FONT,
  statsSummaryHeight,
  TEST_LABELS_BP,
  POSTHOC_LABELS_BP,
  TEST_OPTIONS_BP_2,
  TEST_OPTIONS_BP_K,
  ERROR_BAR_LABELS,
  runBpTest,
  runBpPostHoc,
  postHocForBpTest,
  formatBpStatShort,
  formatBpResultLine,
  computeBpAnnotationSpec,
  computeBpSummaryText,
  mergeSubgroupAnnotations,
} from "./boxplot/helpers";

const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef, memo } = React;

const VIS_INIT_BOXPLOT = {
  plotTitle: "",
  yLabel: "Value",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  boxFillOpacity: 0.15,
  boxWidth: 70,
  boxGap: 0,
  pointSize: 2.5,
  showPoints: true,
  jitterWidth: 0.6,
  pointOpacity: 0.6,
  xLabelAngle: 0,
  yMinCustom: "",
  yMaxCustom: "",
  yScale: "linear",
  showCompPie: false,
  plotStyle: "box",
  horizontal: false,
  errorType: "sem",
  errStrokeWidth: 1.2,
  showBarOutline: false,
  barOutlineWidth: 1.5,
  barOutlineColor: "#333333",
  barOpacity: 0.25,
};

// ── Stats summary SVG helpers ─────────────────────────────────────────────
// Pure pieces (STATS_LINE_H, STATS_FONT, statsSummaryHeight) live in
// tools/boxplot/helpers.ts. The JSX-bearing renderers stay here.
function statsTextLines(
  lines: string[],
  x: number,
  yStart: number,
  anchor: "start" | "middle" | "end" = "start",
  baseline?: "middle" | "central" | "hanging"
) {
  return lines.map((line, i) => (
    <text
      key={i}
      x={x}
      y={yStart + i * STATS_LINE_H}
      textAnchor={anchor}
      dominantBaseline={baseline}
      fontSize={STATS_FONT}
      fill="#aaa"
      fontFamily="monospace"
    >
      {line}
    </text>
  ));
}
function renderStatsSummary(summary: string | null, y: number, x: number) {
  if (!summary) return null;
  return <g id="stats-summary">{statsTextLines(summary.split("\n"), x, y + 10)}</g>;
}
function renderSubgroupSummaries({
  subgroups,
  summaries,
  hz,
  bx,
  bandW,
  separatorGap,
  M,
  w,
  summaryY,
}: any) {
  return subgroups.map((sg: any, sgIdx: number) => {
    const txt = summaries[sg.name];
    if (!txt) return null;
    const lines = txt.split("\n");
    const gid = `stats-summary-${svgSafeId(sg.name)}`;
    if (hz) {
      const firstPos = bx(sg.startIndex);
      const lastPos = bx(sg.startIndex + sg.count - 1);
      const centerPos = (firstPos + lastPos) / 2;
      const startY = centerPos - (lines.length * STATS_LINE_H) / 2;
      return (
        <g key={sg.name} id={gid}>
          {statsTextLines(lines, M.left + w + 12, startY, "start", "middle")}
        </g>
      );
    }
    // Anchor each block at the left edge of its subgroup band: the plot
    // frame for the first subgroup, the dashed separator line for the rest.
    const leftEdge = sgIdx === 0 ? M.left : bx(sg.startIndex) - bandW / 2 - separatorGap / 2;
    return (
      <g key={sg.name} id={gid}>
        {statsTextLines(lines, leftEdge + 4, summaryY + 10)}
      </g>
    );
  });
}

const BoxplotChart = forwardRef<SVGSVGElement, any>(function BoxplotChart(
  {
    groups,
    yLabel,
    plotTitle,
    plotBg,
    showGrid,
    gridColor,
    boxWidth,
    boxFillOpacity,
    pointSize,
    showPoints,
    jitterWidth,
    pointOpacity,
    xLabelAngle,
    yMin: yMinP,
    yMax: yMaxP,
    categoryColors: catCols,
    colorByCol: cbc,
    boxGap,
    svgLegend,
    showCompPie,
    plotStyle = "box",
    annotations,
    statsSummary,
    barOpacity,
    errorType,
    errStrokeWidth,
    showBarOutline,
    barOutlineWidth,
    barOutlineColor,
    horizontal,
    subgroups,
    subgroupSummaries,
    yScale,
  },
  ref
) {
  const isBar = plotStyle === "bar";
  const hz = !!horizontal;
  const angle = hz ? 0 : xLabelAngle || 0;
  const absA = Math.abs(angle);
  const hasPie = cbc >= 0 && showCompPie;
  const pieSpace = hasPie ? 60 : 0;
  const botM = hz ? 50 : 60 + (absA > 0 ? absA * (isBar ? 0.9 : 0.8) : 0) + (hz ? 0 : pieSpace);
  const maxLabelLen = hz ? Math.max(...groups.map((g) => g.name.length), 4) : 0;
  const labelZone = maxLabelLen * 7 + 20;
  const leftM = hz ? Math.max(62, labelZone + (hasPie ? pieSpace : 0)) : 62;

  const _hasLabels = annotations && (annotations.kind === "cld" || annotations.kind === "both");
  const _hasPairs = annotations && (annotations.kind === "brackets" || annotations.kind === "both");
  const annotPairs = _hasPairs ? assignBracketLevels(annotations.pairs || []) : [];
  const annotMaxLevel = annotPairs.reduce((m, pr) => Math.max(m, pr._level || 0), 0);
  const subgroupLabelPad = subgroups && subgroups.length > 0 ? 18 : 0;
  const cldPad = _hasLabels ? 22 : 0;
  const bracketPad = annotPairs.length > 0 ? (annotMaxLevel + 1) * 20 + 6 : 0;
  const annotTopPadBase = Math.max(cldPad, bracketPad);
  const annotTopPad = annotTopPadBase + subgroupLabelPad;
  const M = { top: 24, right: 24, bottom: botM, left: leftM };

  const allV = groups.flatMap((g) => g.allValues);
  if (allV.length === 0) return null;

  // Cache kde() across renders, keyed on the underlying allValues array. The
  // chart wrapper rebuilds `groups` on every aesthetic tweak (sliders, colors)
  // but each group's `allValues` reference is preserved from the upstream
  // useMemo, so a WeakMap on that reference reuses the kde points until the
  // user actually changes the data. kde is the dominant render-time cost on
  // violin/raincloud plots (O(nPoints × n) Gaussian evaluations per group),
  // and it is invoked twice per group per render — once for axis bounds, once
  // for the path geometry — so this also dedupes within a single render.
  const kdeCacheRef = useRef<WeakMap<number[], Array<{ x: number; d: number }>>>(new WeakMap());
  const getKde = (allValues: number[]) => {
    let pts = kdeCacheRef.current.get(allValues);
    if (!pts) {
      pts = kde(allValues, 60);
      kdeCacheRef.current.set(allValues, pts);
    }
    return pts;
  };

  let dMin = Math.min(...allV);
  let dMax = Math.max(...allV);
  if (isBar) {
    dMin = 0;
    dMax = 0;
    for (const g of groups) {
      if (!g.stats) continue;
      const errVal =
        errorType === "none"
          ? 0
          : errorType === "sd"
            ? g.stats.sd
            : errorType === "ci95"
              ? g.stats.ci95
              : g.stats.sem;
      const top = g.stats.mean + errVal;
      if (top > dMax) dMax = top;
      if (g.stats.mean < dMin) dMin = g.stats.mean;
      if (g.stats.max > dMax) dMax = g.stats.max;
      if (g.stats.min < dMin) dMin = g.stats.min;
    }
  } else if (plotStyle === "violin" || plotStyle === "raincloud") {
    for (const g of groups) {
      if (g.allValues.length >= 2) {
        const pts = getKde(g.allValues);
        const kMin = pts[0].x,
          kMax = pts[pts.length - 1].x;
        if (kMin < dMin) dMin = kMin;
        if (kMax > dMax) dMax = kMax;
      }
    }
  }
  const pad = (dMax - dMin) * 0.08 || 1;
  let yMin = yMinP != null ? yMinP : isBar ? (dMin >= 0 ? 0 : dMin - pad) : dMin - pad;
  let yMax = yMaxP != null ? yMaxP : dMax + pad;

  const isLog = yScale && yScale !== "linear";
  const logFn =
    yScale === "log2"
      ? Math.log2
      : yScale === "log10"
        ? Math.log10
        : yScale === "ln"
          ? Math.log
          : null;
  const logBase = yScale === "log2" ? 2 : yScale === "log10" ? 10 : yScale === "ln" ? Math.E : 0;
  const safeLog = (v) => (logFn && v > 0 ? logFn(v) : logFn ? logFn(1e-10) : v);

  if (isLog) {
    const posVals = allV.filter((v) => v > 0);
    if (posVals.length > 0) {
      const smallestPos = Math.min(...posVals);
      if (yMin <= 0) yMin = smallestPos / 2;
    } else {
      yMin = logBase === 2 ? 0.5 : 0.1;
    }
    if (yMax <= yMin) yMax = yMin * 10;
  }

  const n = groups.length;
  const compact = (100 - (boxGap != null ? boxGap : 0)) / 100;
  const separatorGap = subgroups && subgroups.length > 1 ? 40 : 0;
  const totalGap = subgroups ? (subgroups.length - 1) * separatorGap : 0;
  const catSize = Math.max(200, n * 100 * compact) + totalGap;
  const valSize = (isBar ? 420 : 504) + (hz ? 0 : absA > 0 ? absA * (isBar ? 0.9 : 0.8) : 0);
  const _hasSgSummaries =
    subgroupSummaries && subgroups && Object.values(subgroupSummaries).some((v) => v);
  const _hzSgSummaryW =
    hz && _hasSgSummaries
      ? Math.max(
          ...Object.values(subgroupSummaries as Record<string, string | null>).map((txt) => {
            if (!txt) return 0;
            const maxLen = Math.max(...txt.split("\n").map((l) => l.length), 0);
            return maxLen * (STATS_FONT * 0.62) + 16;
          }),
          0
        )
      : 0;
  const _statsH =
    _hasSgSummaries && !hz
      ? Math.max(
          ...subgroups.map((sg) => statsSummaryHeight(subgroupSummaries[sg.name] || null)),
          0
        )
      : statsSummaryHeight(statsSummary);
  const vbW = (hz ? valSize : catSize) + M.left + M.right + _hzSgSummaryW;
  const vbH_base = (hz ? catSize : valSize) + M.top + M.bottom;
  const _legH = computeLegendHeight(svgLegend, vbW - M.left - M.right - _hzSgSummaryW, 88);
  const vbH_chart = vbH_base - _statsH;
  const vbH = vbH_base + _legH;
  const w = vbW - M.left - M.right - _hzSgSummaryW;
  const h = vbH_chart - M.top - M.bottom;

  const annotDim = hz ? w : h;
  if (annotTopPad > 0 && annotDim > annotTopPad + 10) {
    if (isLog) {
      const lMin = safeLog(yMin);
      const lMax = safeLog(yMax);
      const lRange = ((lMax - lMin) * annotDim) / (annotDim - annotTopPad);
      const candidate = Math.pow(logBase, lMin + lRange);
      if (isFinite(candidate) && candidate > yMin) yMax = candidate;
    } else {
      yMax = yMin + ((yMax - yMin) * annotDim) / (annotDim - annotTopPad);
    }
  }

  const bandW = ((hz ? h : w) - totalGap) / n;
  const _cumulGap = (() => {
    if (!subgroups || subgroups.length < 2) return null;
    const boundaries = new Set(subgroups.slice(1).map((sg) => sg.startIndex));
    const arr = new Array(n);
    let gap = 0;
    for (let i = 0; i < n; i++) {
      if (boundaries.has(i)) gap += separatorGap;
      arr[i] = gap;
    }
    return arr;
  })();
  const bx = (i) => {
    const base = (hz ? M.top : M.left) + i * bandW + bandW / 2;
    return _cumulGap ? base + _cumulGap[i] : base;
  };
  const sy = isLog
    ? (v) => {
        const lv = safeLog(Math.max(v, yMin));
        const lMin = safeLog(yMin);
        const lMax = safeLog(yMax);
        const frac = (lv - lMin) / (lMax - lMin || 1);
        return hz ? M.left + frac * w : M.top + (1 - frac) * h;
      }
    : (v) => {
        const frac = (v - yMin) / (yMax - yMin || 1);
        return hz ? M.left + frac * w : M.top + (1 - frac) * h;
      };
  const yTicks: Array<{ value: number; major: boolean }> = isLog
    ? makeLogTicks(yMin, yMax, logBase)
    : makeTicks(yMin, yMax, 8).map((v) => ({ value: v, major: true }));
  const fmtTick = (t: number) => {
    if (!isLog)
      return Math.abs(t) < 0.01 && t !== 0
        ? t.toExponential(1)
        : t % 1 === 0
          ? String(t)
          : t.toFixed(2);
    if (t >= 1 && t === Math.round(t)) return String(t);
    if (t >= 0.01) return t.toPrecision(2);
    return t.toExponential(1);
  };
  const _sgForIdx = (i) => {
    if (!subgroups) return null;
    for (const sg of subgroups) {
      if (i >= sg.startIndex && i < sg.startIndex + sg.count) return sg;
    }
    return null;
  };
  const _grpId = (prefix, gi, name) => {
    const sg = _sgForIdx(gi);
    return sg
      ? `${prefix}-${svgSafeId(sg.name)}-${svgSafeId(name)}`
      : `${prefix}-${svgSafeId(name)}`;
  };
  const halfBox = (boxWidth / 100) * bandW * 0.4;

  const pointColor = (g, src, si) => {
    if (cbc >= 0 && catCols && src.category)
      return catCols[src.category] || getPointColors(g.color, g.sources.length)[si] || g.color;
    return getPointColors(g.color, g.sources.length)[si] || g.color;
  };

  const renderCompPie = (g, px, py, gi = 0) => {
    if (cbc < 0 || !g.sources || !showCompPie) return null;
    const total = g.allValues.length;
    if (!total) return null;
    const r = 20;
    let cum = 0;

    const slices = g.sources.map((src, si) => {
      const pct = src.values.length / total;
      const a0 = cum * Math.PI * 2;
      const a1 = (cum + pct) * Math.PI * 2;
      cum += pct;
      const col = catCols && src.category ? catCols[src.category] || "#999" : "#999";
      if (pct >= 1)
        return <circle key={si} cx={px} cy={py} r={r} fill={col} stroke="#000" strokeWidth="0.5" />;
      const x0 = px + Math.sin(a0) * r;
      const y0 = py - Math.cos(a0) * r;
      const x1 = px + Math.sin(a1) * r;
      const y1 = py - Math.cos(a1) * r;
      const lg = pct > 0.5 ? 1 : 0;
      return (
        <path
          key={si}
          d={`M${px},${py}L${x0},${y0}A${r},${r},0,${lg},1,${x1},${y1}Z`}
          fill={col}
          stroke="#000"
          strokeWidth="0.5"
        />
      );
    });

    const labels = g.sources.map((src, si) => {
      const pct = src.values.length / total;
      if (pct < 0.08) return null;
      const cumPct = g.sources.slice(0, si).reduce((s, ss) => s + ss.values.length / total, 0);
      const midA = (cumPct + pct / 2) * Math.PI * 2;
      const lr = r + 8;
      return (
        <text
          key={`t${si}`}
          x={px + Math.sin(midA) * lr}
          y={py - Math.cos(midA) * lr + 3}
          textAnchor="middle"
          fontSize="7"
          fill="#888"
          fontFamily="sans-serif"
        >
          {Math.round(pct * 100)}%
        </text>
      );
    });

    return (
      <g key={`cb-${gi}-${g.name}`}>
        {slices}
        <circle cx={px} cy={py} r={r} fill="none" stroke="#000" strokeWidth="0.5" />
        {labels}
      </g>
    );
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${vbW} ${vbH}`}
      style={{ width: vbW, maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || (isBar ? "Bar chart" : "Box plot")}
    >
      <title>{plotTitle || (isBar ? "Bar chart" : "Box plot")}</title>
      <desc>{`${isBar ? "Bar chart" : "Box plot"} with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`}</desc>

      <rect id="plot-area-background" x={M.left} y={M.top} width={w} height={h} fill={plotBg} />

      {showGrid && (
        <g id="grid">
          {yTicks
            .filter((tk) => tk.major)
            .map((tk) =>
              hz ? (
                <line
                  key={tk.value}
                  x1={sy(tk.value)}
                  x2={sy(tk.value)}
                  y1={M.top}
                  y2={M.top + h}
                  stroke={gridColor}
                  strokeWidth="0.5"
                />
              ) : (
                <line
                  key={tk.value}
                  x1={M.left}
                  x2={M.left + w}
                  y1={sy(tk.value)}
                  y2={sy(tk.value)}
                  stroke={gridColor}
                  strokeWidth="0.5"
                />
              )
            )}
        </g>
      )}

      <g id={hz ? "axis-x" : "axis-y"}>
        {yTicks.map((tk) => {
          const v = tk.value;
          const tickLen = tk.major ? 5 : 3;
          return (
            <g key={v}>
              {hz ? (
                <>
                  <line
                    x1={sy(v)}
                    x2={sy(v)}
                    y1={M.top + h}
                    y2={M.top + h + tickLen}
                    stroke="#333"
                    strokeWidth={tk.major ? "1" : "0.5"}
                  />
                  {tk.major && (
                    <text
                      x={sy(v)}
                      y={M.top + h + 16}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#555"
                      fontFamily="sans-serif"
                    >
                      {fmtTick(v)}
                    </text>
                  )}
                </>
              ) : (
                <>
                  <line
                    x1={M.left - tickLen}
                    x2={M.left}
                    y1={sy(v)}
                    y2={sy(v)}
                    stroke="#333"
                    strokeWidth={tk.major ? "1" : "0.5"}
                  />
                  {tk.major && (
                    <text
                      x={M.left - 8}
                      y={sy(v) + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#555"
                      fontFamily="sans-serif"
                    >
                      {fmtTick(v)}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>

      <g id={isBar ? "bars" : "groups"}>
        {groups.map((g, gi) => {
          if (!g.stats) return null;
          const cx = bx(gi);

          if (isBar) {
            const { mean, sd, sem, ci95 } = g.stats;
            if (mean < yMin || mean > yMax) return null;
            const showErr = errorType !== "none";
            const errVal = !showErr
              ? 0
              : errorType === "sd"
                ? sd
                : errorType === "ci95"
                  ? ci95
                  : sem;
            const baselinePos = sy(isLog ? yMin : Math.max(0, yMin));
            const meanPos = sy(mean);
            const capSize = halfBox * 0.4;
            const hiVal = mean + errVal;
            const loVal = mean - errVal;
            const hiValC = Math.min(hiVal, yMax);
            const loValC = Math.max(loVal, yMin);
            const drawWhisker = showErr && hiValC > loValC;
            const drawHiCap = drawWhisker && hiVal <= yMax;
            const drawLoCap = drawWhisker && loVal >= yMin;
            const errHi = sy(hiValC);
            const errLo = sy(loValC);
            const barR = hz
              ? {
                  x: Math.min(baselinePos, meanPos),
                  y: cx - halfBox,
                  width: Math.abs(meanPos - baselinePos),
                  height: halfBox * 2,
                }
              : {
                  x: cx - halfBox,
                  y: mean >= 0 ? meanPos : baselinePos,
                  width: halfBox * 2,
                  height: Math.max(0, Math.abs(meanPos - baselinePos)),
                };
            return (
              <g
                key={`${gi}-${g.name}`}
                id={_grpId("bar", gi, g.name)}
                role="group"
                aria-label={`${g.name}: mean ${mean.toFixed(2)}${showErr ? `, ${errorType === "sd" ? "SD" : errorType === "ci95" ? "95% CI" : "SEM"} ${errVal.toFixed(2)}` : ""}, n=${g.stats.n}`}
              >
                <rect
                  {...barR}
                  fill={g.color}
                  fillOpacity={barOpacity}
                  stroke={showBarOutline ? barOutlineColor || g.color : "none"}
                  strokeWidth={showBarOutline ? barOutlineWidth || 1.5 : 0}
                  rx="1"
                />
                {drawWhisker && (
                  <>
                    <line
                      x1={hz ? errLo : cx}
                      x2={hz ? errHi : cx}
                      y1={hz ? cx : errHi}
                      y2={hz ? cx : errLo}
                      stroke="#333"
                      strokeWidth={errStrokeWidth || 1.2}
                    />
                    {drawHiCap && (
                      <line
                        x1={hz ? errHi : cx - capSize}
                        x2={hz ? errHi : cx + capSize}
                        y1={hz ? cx - capSize : errHi}
                        y2={hz ? cx + capSize : errHi}
                        stroke="#333"
                        strokeWidth={errStrokeWidth || 1.2}
                      />
                    )}
                    {drawLoCap && (
                      <line
                        x1={hz ? errLo : cx - capSize}
                        x2={hz ? errLo : cx + capSize}
                        y1={hz ? cx - capSize : errLo}
                        y2={hz ? cx + capSize : errLo}
                        stroke="#333"
                        strokeWidth={errStrokeWidth || 1.2}
                      />
                    )}
                  </>
                )}
                {showPoints &&
                  g.sources.map((src, si) => {
                    const rng = seededRandom(gi * 1000 + si * 100 + 42);
                    const ptColor = pointColor(g, src, si);
                    return src.values.map((v, vi) => {
                      const jitter = (rng() - 0.5) * jitterWidth * halfBox * 2;
                      return (
                        <circle
                          key={`${gi}-${si}-${vi}`}
                          cx={hz ? sy(v) : cx + jitter}
                          cy={hz ? cx + jitter : sy(v)}
                          r={pointSize}
                          fill={ptColor}
                          fillOpacity={pointOpacity || 0.6}
                          stroke={ptColor}
                          strokeOpacity={Math.min(1, (pointOpacity || 0.6) + 0.15)}
                          strokeWidth="0.3"
                        />
                      );
                    });
                  })}
              </g>
            );
          }

          const { q1, med, q3, wLo, wHi } = g.stats;
          const isRain = plotStyle === "raincloud";
          const isViolin = plotStyle === "violin" || isRain;

          /* ── Violin / raincloud KDE shape ── */
          let violinPath = null;
          if (isViolin && g.allValues.length >= 2) {
            const pts = getKde(g.allValues);
            const maxD = Math.max(...pts.map((p) => p.d));
            if (maxD > 0) {
              const sc = (d) => (d / maxD) * halfBox;
              if (isRain) {
                let d = hz ? `M ${sy(pts[0].x)},${cx}` : `M ${cx},${sy(pts[0].x)}`;
                for (const p of pts)
                  d += hz ? ` L ${sy(p.x)},${cx - sc(p.d)}` : ` L ${cx - sc(p.d)},${sy(p.x)}`;
                d += hz
                  ? ` L ${sy(pts[pts.length - 1].x)},${cx} Z`
                  : ` L ${cx},${sy(pts[pts.length - 1].x)} Z`;
                violinPath = (
                  <path
                    d={d}
                    fill={g.color}
                    fillOpacity={boxFillOpacity}
                    stroke={g.color}
                    strokeWidth="1"
                  />
                );
              } else {
                let d = hz
                  ? `M ${sy(pts[0].x)},${cx - sc(pts[0].d)}`
                  : `M ${cx - sc(pts[0].d)},${sy(pts[0].x)}`;
                for (const p of pts)
                  d += hz ? ` L ${sy(p.x)},${cx - sc(p.d)}` : ` L ${cx - sc(p.d)},${sy(p.x)}`;
                d += hz
                  ? ` L ${sy(pts[pts.length - 1].x)},${cx + sc(pts[pts.length - 1].d)}`
                  : ` L ${cx + sc(pts[pts.length - 1].d)},${sy(pts[pts.length - 1].x)}`;
                for (let i = pts.length - 1; i >= 0; i--)
                  d += hz
                    ? ` L ${sy(pts[i].x)},${cx + sc(pts[i].d)}`
                    : ` L ${cx + sc(pts[i].d)},${sy(pts[i].x)}`;
                d += " Z";
                violinPath = (
                  <path
                    d={d}
                    fill={g.color}
                    fillOpacity={boxFillOpacity}
                    stroke={g.color}
                    strokeWidth="1"
                  />
                );
              }
            }
          }

          /* ── Box elements ── */
          const boxHalf = isViolin ? halfBox * 0.35 : halfBox;
          const boxCx = isRain ? cx + halfBox * 0.15 : cx;
          const boxEls = hz ? (
            <>
              <line y1={boxCx} y2={boxCx} x1={sy(q3)} x2={sy(wHi)} stroke="#333" strokeWidth="1" />
              <line y1={boxCx} y2={boxCx} x1={sy(wLo)} x2={sy(q1)} stroke="#333" strokeWidth="1" />
              <line
                y1={boxCx - boxHalf * 0.5}
                y2={boxCx + boxHalf * 0.5}
                x1={sy(wHi)}
                x2={sy(wHi)}
                stroke="#333"
                strokeWidth="1"
              />
              <line
                y1={boxCx - boxHalf * 0.5}
                y2={boxCx + boxHalf * 0.5}
                x1={sy(wLo)}
                x2={sy(wLo)}
                stroke="#333"
                strokeWidth="1"
              />
              <rect
                x={sy(q1)}
                y={boxCx - boxHalf}
                width={sy(q3) - sy(q1)}
                height={boxHalf * 2}
                fill={isViolin ? "#fff" : g.color}
                fillOpacity={isViolin ? 0.7 : boxFillOpacity}
                stroke={g.color}
                strokeWidth="1.5"
                rx="2"
              />
              <line
                y1={boxCx - boxHalf}
                y2={boxCx + boxHalf}
                x1={sy(med)}
                x2={sy(med)}
                stroke={g.color}
                strokeWidth="2.5"
              />
            </>
          ) : (
            <>
              <line x1={boxCx} x2={boxCx} y1={sy(wHi)} y2={sy(q3)} stroke="#333" strokeWidth="1" />
              <line x1={boxCx} x2={boxCx} y1={sy(q1)} y2={sy(wLo)} stroke="#333" strokeWidth="1" />
              <line
                x1={boxCx - boxHalf * 0.5}
                x2={boxCx + boxHalf * 0.5}
                y1={sy(wHi)}
                y2={sy(wHi)}
                stroke="#333"
                strokeWidth="1"
              />
              <line
                x1={boxCx - boxHalf * 0.5}
                x2={boxCx + boxHalf * 0.5}
                y1={sy(wLo)}
                y2={sy(wLo)}
                stroke="#333"
                strokeWidth="1"
              />
              <rect
                x={boxCx - boxHalf}
                y={sy(q3)}
                width={boxHalf * 2}
                height={sy(q1) - sy(q3)}
                fill={isViolin ? "#fff" : g.color}
                fillOpacity={isViolin ? 0.7 : boxFillOpacity}
                stroke={g.color}
                strokeWidth="1.5"
                rx="2"
              />
              <line
                x1={boxCx - boxHalf}
                x2={boxCx + boxHalf}
                y1={sy(med)}
                y2={sy(med)}
                stroke={g.color}
                strokeWidth="2.5"
              />
            </>
          );

          /* ── Jitter points ── */
          const ptOffset = isRain ? halfBox * 0.55 : 0;
          const jitterEls =
            showPoints &&
            g.sources.map((src, si) => {
              const rng = seededRandom(gi * 1000 + si * 100 + 42);
              const ptColor = pointColor(g, src, si);
              return src.values.map((v, vi) => {
                const j = isRain
                  ? ptOffset + Math.abs(rng() - 0.5) * jitterWidth * halfBox
                  : (rng() - 0.5) * jitterWidth * halfBox * 2;
                return (
                  <circle
                    key={`${gi}-${si}-${vi}`}
                    cx={hz ? sy(v) : cx + j}
                    cy={hz ? cx + j : sy(v)}
                    r={pointSize}
                    fill={ptColor}
                    fillOpacity={pointOpacity || 0.6}
                    stroke={ptColor}
                    strokeOpacity={Math.min(1, (pointOpacity || 0.6) + 0.15)}
                    strokeWidth="0.3"
                  />
                );
              });
            });

          /* ── Outlier dots (always visible) ── */
          const outlierCx = isRain ? cx + ptOffset : cx;
          const outlierEls = g.sources.flatMap((src, si) =>
            src.values
              .filter((v) => v < wLo || v > wHi)
              .map((v, oi) => (
                <circle
                  key={`out-${gi}-${si}-${oi}`}
                  cx={hz ? sy(v) : outlierCx}
                  cy={hz ? outlierCx : sy(v)}
                  r={2.5}
                  fill="#000"
                  fillOpacity={0.8}
                  stroke="none"
                />
              ))
          );

          return (
            <g
              key={`${gi}-${g.name}`}
              id={_grpId("group", gi, g.name)}
              role="group"
              aria-label={`${g.name}: median ${med.toFixed(2)}, Q1 ${q1.toFixed(2)}, Q3 ${q3.toFixed(2)}, n=${g.stats.n}`}
            >
              {violinPath}
              {boxEls}
              {jitterEls}
              {outlierEls}
            </g>
          );
        })}
      </g>

      <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
        <line id="plot-frame-top" x1={M.left} y1={M.top} x2={M.left + w} y2={M.top} />
        <line id="plot-frame-right" x1={M.left + w} y1={M.top} x2={M.left + w} y2={M.top + h} />
        <line id="plot-frame-bottom" x1={M.left} y1={M.top + h} x2={M.left + w} y2={M.top + h} />
        <line id="plot-frame-left" x1={M.left} y1={M.top} x2={M.left} y2={M.top + h} />
      </g>

      {subgroups && subgroups.length > 1 && (
        <g id="subgroup-separators">
          {subgroups.slice(1).map((sg, idx) => {
            const sepPos = bx(sg.startIndex) - bandW / 2 - separatorGap / 2;
            return hz ? (
              <line
                key={`sep-${idx}`}
                x1={M.left}
                x2={M.left + w}
                y1={sepPos}
                y2={sepPos}
                stroke="#999"
                strokeWidth="1"
                strokeDasharray="5,4"
              />
            ) : (
              <line
                key={`sep-${idx}`}
                x1={sepPos}
                x2={sepPos}
                y1={M.top}
                y2={M.top + h}
                stroke="#999"
                strokeWidth="1"
                strokeDasharray="5,4"
              />
            );
          })}
        </g>
      )}

      {subgroups && subgroups.length > 0 && (
        <g id="subgroup-labels">
          {subgroups.map((sg) => {
            const firstX = bx(sg.startIndex);
            const lastX = bx(sg.startIndex + sg.count - 1);
            const midPos = (firstX + lastX) / 2;
            if (hz) {
              const lx = M.left + w - subgroupLabelPad / 2;
              return (
                <text
                  key={`sgl-${sg.name}`}
                  x={lx}
                  y={midPos}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#666"
                  fontFamily="sans-serif"
                  fontStyle="italic"
                  transform={`rotate(90,${lx},${midPos})`}
                >
                  {sg.name}
                </text>
              );
            }
            return (
              <text
                key={`sgl-${sg.name}`}
                x={midPos}
                y={M.top + subgroupLabelPad / 2 + 3}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="700"
                fill="#666"
                fontFamily="sans-serif"
                fontStyle="italic"
              >
                {sg.name}
              </text>
            );
          })}
        </g>
      )}

      <g id={hz ? "axis-y" : "axis-x"}>
        {groups.map((g, gi) => {
          const gp = bx(gi);
          if (hz) {
            const labelX = M.left - 8;
            const pieX = M.left - labelZone - pieSpace / 2;
            const hzPie = renderCompPie(g, pieX, gp, gi);
            return (
              <React.Fragment key={`xl-${gi}-${g.name}`}>
                <g>
                  <text
                    x={labelX}
                    y={gp}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {g.name}
                  </text>
                  <text
                    x={labelX}
                    y={gp + 12}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill="#999"
                    fontFamily="sans-serif"
                  >
                    n={g.stats?.n || 0}
                  </text>
                </g>
                {hzPie}
              </React.Fragment>
            );
          }
          const ly = M.top + h + 16;
          const compBar = renderCompPie(g, gp, vbH_chart - 20 - 12, gi);
          return (
            <React.Fragment key={`xl-${gi}-${g.name}`}>
              {angle === 0 ? (
                <g>
                  <text
                    x={gp}
                    y={ly}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {g.name}
                  </text>
                  <text
                    x={gp}
                    y={ly + 14}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#999"
                    fontFamily="sans-serif"
                  >
                    n={g.stats?.n || 0}
                  </text>
                </g>
              ) : (
                <g transform={`rotate(${angle},${gp},${ly})`}>
                  <text
                    x={gp}
                    y={ly}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {g.name}
                  </text>
                  <text
                    x={gp}
                    y={ly + 12}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize="9"
                    fill="#999"
                    fontFamily="sans-serif"
                  >
                    n={g.stats?.n || 0}
                  </text>
                </g>
              )}
              {compBar}
            </React.Fragment>
          );
        })}
      </g>

      {annotations &&
        _hasLabels &&
        (hz ? (
          <g id="cld-annotations">
            {(annotations.labels || []).map((lbl, gi) =>
              lbl != null ? (
                <text
                  key={`cld-${gi}`}
                  x={M.left + w - subgroupLabelPad - 10}
                  y={bx(gi)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill="#222"
                  fontFamily="sans-serif"
                >
                  {lbl}
                </text>
              ) : null
            )}
          </g>
        ) : (
          <g id="cld-annotations">
            {(annotations.labels || []).map((lbl, gi) =>
              lbl != null ? (
                <text
                  key={`cld-${gi}`}
                  x={bx(gi)}
                  y={M.top + subgroupLabelPad + 15}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill="#222"
                  fontFamily="sans-serif"
                >
                  {lbl}
                </text>
              ) : null
            )}
          </g>
        ))}

      {annotations &&
        _hasPairs &&
        (hz ? (
          <g id="significance-brackets">
            {annotPairs.map((pr, idx) => {
              const y1b = bx(pr.i);
              const y2b = bx(pr.j);
              const lvl = pr._level || 0;
              const xLine = M.left + w - annotTopPad + 6 + lvl * 20;
              const tick = 4;
              return (
                <g key={`br-${idx}`}>
                  <path
                    d={`M${xLine - tick},${y1b} L${xLine},${y1b} L${xLine},${y2b} L${xLine - tick},${y2b}`}
                    stroke="#333"
                    strokeWidth="1"
                    fill="none"
                  />
                  <text
                    x={xLine + 6}
                    y={(y1b + y2b) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill="#222"
                    fontFamily="sans-serif"
                    transform={`rotate(90,${xLine + 6},${(y1b + y2b) / 2})`}
                  >
                    {pr.label}
                  </text>
                </g>
              );
            })}
          </g>
        ) : (
          <g id="significance-brackets">
            {annotPairs.map((pr, idx) => {
              const x1 = bx(pr.i);
              const x2 = bx(pr.j);
              const lvl = pr._level || 0;
              const yLine = M.top + annotTopPad - 6 - lvl * 20;
              const tick = 4;
              return (
                <g key={`br-${idx}`}>
                  <path
                    d={`M${x1},${yLine + tick} L${x1},${yLine} L${x2},${yLine} L${x2},${yLine + tick}`}
                    stroke="#333"
                    strokeWidth="1"
                    fill="none"
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={yLine - 2}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill="#222"
                    fontFamily="sans-serif"
                  >
                    {pr.label}
                  </text>
                </g>
              );
            })}
          </g>
        ))}

      {yLabel && (
        <g id={hz ? "x-axis-label" : "y-axis-label"}>
          {hz ? (
            <text
              x={M.left + w / 2}
              y={M.top + h + 36}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {yLabel}
            </text>
          ) : (
            <text
              transform={`translate(14,${M.top + h / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {yLabel}
            </text>
          )}
        </g>
      )}

      {plotTitle && (
        <g id="title">
          <text
            x={M.left + w / 2}
            y={14}
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

      {renderSvgLegend(svgLegend, vbH_chart + 10, M.left, vbW - M.left - M.right, 88, 14)}
      {_hasSgSummaries
        ? renderSubgroupSummaries({
            subgroups,
            summaries: subgroupSummaries,
            hz,
            bx,
            bandW,
            separatorGap,
            M,
            w,
            summaryY: vbH_chart + _legH,
          })
        : renderStatsSummary(statsSummary, vbH_chart + _legH, M.left)}
    </svg>
  );
});

/* ── Sub-components (JSX, inline) ──────────────────────────────────────────── */

function UploadStep({
  sepOverride,
  onSepChange,
  rawText,
  doParse,
  handleFileLoad,
  setStep,
  onLoadExample,
}) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          onSepChange(v);
          if (rawText) {
            doParse(rawText, v);
            setStep("configure");
          }
        }}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        hint="CSV · TSV · TXT · DAT"
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
          {toolIcon("boxplot", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              Group Plot — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Long or wide data → auto-detect → box / violin / raincloud / bar charts
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
              Purpose
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 }}>
              An all-in-one group comparison tool that accepts{" "}
              <strong>both long and wide formats</strong>. Switch between box, violin, raincloud,
              and bar chart (mean ± SEM/SD) styles from the plot controls. Wide data is
              auto-detected and goes straight to plot. Long data gets the full pipeline: assign
              column roles, filter, rename, reorder, then plot.
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
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Long format
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              Each <strong>row</strong> = one observation. Columns mix categorical labels and
              numeric values.
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
              <tbody>
                {[
                  ["WT", "0.368", "M", "6wpi"],
                  ["WT", "0.204", "M", "6wpi"],
                  ["lyka-1", "0", "NM", "6wpi"],
                  ["lykb-1", "0.285", "M", "6wpi"],
                ].map((r, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "var(--surface-subtle)" : "var(--surface)" }}
                  >
                    {r.map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "3px 8px",
                          border: "1px solid var(--info-border)",
                          color: "var(--text)",
                        }}
                      >
                        {v}
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
                color: "var(--accent-plot)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Wide format → auto-detected!
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              One <strong>column</strong> per condition. All values numeric. Headers = group names.{" "}
              <strong>Goes straight to plot.</strong>
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
              <thead>
                <tr style={{ background: "var(--success-bg)" }}>
                  {["WT", "WT", "mutA", "mutB"].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "3px 8px",
                        border: "1px solid var(--success-border)",
                        color: "var(--success-text)",
                        fontWeight: 700,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [0.45, 0.52, 0.12, 0.31],
                  [0.48, 0.51, 0.08, 0.28],
                  [0.41, 0.49, 0.15, 0.35],
                ].map((r, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "var(--success-bg)" : "var(--surface)" }}
                  >
                    {r.map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "3px 8px",
                          border: "1px solid var(--success-border)",
                          color: "var(--text)",
                        }}
                      >
                        {v}
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
              Workflow
            </div>
            {[
              { icon: "📂", text: "Upload: drop or select your CSV / TSV / TXT / DAT file." },
              {
                icon: "⚙️",
                text: "Configure: assign roles — group (X axis), value (Y axis), filter, text, or ignore.",
              },
              {
                icon: "🔍",
                text: "Filter & Rename: tick values to keep, rename labels, drag to reorder groups.",
              },
              {
                icon: "📊",
                text: "Output: summary stats (n, mean, median, SD, SEM), long & wide CSV exports.",
              },
              { icon: "🎨", text: "Plot: color-by, facet-by, jitter controls, and SVG download." },
            ].map(({ icon, text }) => (
              <div
                key={icon}
                style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
                  {text}
                </span>
              </div>
            ))}
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
                color: "var(--accent-warning)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              🥧 Composition Pies
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              When <strong>Color by</strong> is active, a <strong>Composition pies</strong> checkbox
              appears. Enable it to display a small pie chart beneath each boxplot group showing the
              proportion of each color-by category within that group.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { step: "1.", text: "Enable Points (the jitter overlay) in the plot controls." },
                { step: "2.", text: "Select a column in the Color by dropdown." },
                { step: "3.", text: "Tick the Composition pies checkbox that appears next to it." },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent-warning)",
                      flexShrink: 0,
                    }}
                  >
                    {step}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
                color: "#7c3aed",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              🎻 Plot Styles
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              Use the <strong>Plot style</strong> dropdown in the style controls to switch between
              three visualization modes:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                {
                  step: "Box",
                  text: "Classic box-and-whisker plot. Median line, IQR box, 1.5×IQR whiskers, outlier dots.",
                },
                {
                  step: "Violin",
                  text: "Symmetric kernel density (KDE) shape showing the full distribution, with a narrow box overlay for quartiles.",
                },
                {
                  step: "Raincloud",
                  text: "Half-violin on the left + narrow box in the center + jitter points on the right. Best for showing raw data alongside the distribution shape.",
                },
                {
                  step: "Bar",
                  text: "Mean ± SEM/SD error bars. Choose SEM or SD in the plot controls. Supports jittered points overlay.",
                },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#7c3aed",
                      flexShrink: 0,
                      width: 62,
                      display: "inline-block",
                    }}
                  >
                    {step}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
            <p
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                marginTop: 8,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              All styles support color-by, facet-by, and outlier dots. The Y-axis auto-adjusts to
              fit the violin/raincloud density curves.
            </p>
          </div>
          <div
            style={{
              borderLeft: "4px solid var(--accent-primary)",
              background: "var(--info-bg)",
              padding: "10px 14px",
              borderRadius: "0 8px 8px 0",
              gridColumn: "1/-1",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)" }}>
              💡 Tip —{" "}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Wide-format files (all-numeric columns, headers = group names) are auto-detected and
              go straight to plot. For long-format, you can facet by one column while coloring
              points by another.
            </span>
          </div>
          <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              "Separator explicitly selected (comma, semicolon, tab, space)",
              "Quoted values stripped automatically",
              "100% browser-side — nothing uploaded",
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

function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  hasHeader,
  colRoles,
  colNames,
  valueColIdx,
  valueColIsNumeric,
  onRoleChange,
  onNameChange,
  setStep,
}) {
  return (
    <div>
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows{hasHeader ? "" : " (no header)"}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>
      <ColumnRoleEditor
        headers={parsedHeaders}
        rows={parsedRows}
        colRoles={colRoles}
        colNames={colNames}
        onRoleChange={onRoleChange}
        onNameChange={onNameChange}
      />
      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div
          className="dv-panel"
          style={{
            background: "var(--danger-bg)",
            borderColor: "var(--danger-border)",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12, color: "var(--danger-text)" }}>
            ⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as{" "}
            <strong>value</strong> but appears to be non-numeric — the plot will be empty. Please
            assign a numeric column as value.
          </p>
        </div>
      )}
      {(colRoles.indexOf("group") < 0 || colRoles.indexOf("value") < 0) && (
        <div
          className="dv-panel"
          style={{
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            Assign at least one <strong style={{ color: roleColors.group }}>group</strong> and one{" "}
            <strong style={{ color: roleColors.value }}>value</strong> column to continue.
          </p>
        </div>
      )}
      <button
        onClick={() => setStep("filter")}
        className="dv-btn dv-btn-primary"
        disabled={colRoles.indexOf("group") < 0 || colRoles.indexOf("value") < 0}
      >
        Filter & Rename →
      </button>
    </div>
  );
}

function FilterStep({
  parsedHeaders,
  parsedRows,
  colRoles,
  colNames,
  filters,
  filteredRows,
  renamedRows,
  activeColIdxs,
  valueRenames,
  orderableCols,
  applyRename,
  toggleFilter,
  toggleAllFilter,
  setRenameVal,
  dragState,
  setDragState,
  canPlot,
  setStep,
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        <FilterCheckboxPanel
          headers={parsedHeaders}
          colNames={colNames}
          colRoles={colRoles}
          filters={filters}
          filteredCount={filteredRows.length}
          totalCount={parsedRows.length}
          onToggle={toggleFilter}
          onToggleAll={toggleAllFilter}
        />
        <RenameReorderPanel
          headers={parsedHeaders}
          colNames={colNames}
          colRoles={colRoles}
          filters={filters}
          valueRenames={valueRenames}
          orderableCols={orderableCols}
          applyRename={applyRename}
          onRenameVal={setRenameVal}
          dragState={dragState}
          onDragStart={setDragState}
          onDragEnd={() => setDragState(null)}
        />
      </div>
      <div
        style={{
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          border: "1px solid var(--success-border)",
          background: "var(--success-bg)",
        }}
      >
        <p
          style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--success-text)" }}
        >
          Preview ({renamedRows.length} rows):
        </p>
        <DataPreview
          headers={activeColIdxs.map((i) => colNames[i])}
          rows={renamedRows.map((r) => activeColIdxs.map((i) => r[i]))}
          maxRows={10}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("output")} className="dv-btn dv-btn-primary">
          Output →
        </button>
        {canPlot && (
          <button onClick={() => setStep("plot")} className="dv-btn dv-btn-secondary">
            Plot →
          </button>
        )}
      </div>
    </div>
  );
}

function OutputStep({
  colNames,
  groupColIdx,
  valueColIdx,
  valueColIsNumeric,
  stats,
  renamedRows,
  activeColIdxs,
  wideData,
  fileName,
  canPlot,
  setStep,
}) {
  return (
    <div>
      {groupColIdx >= 0 && valueColIdx >= 0 && stats.length > 0 && (
        <StatsTable stats={stats} groupLabel={colNames[groupColIdx]} />
      )}
      <div className="dv-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
            Filtered data (long)
          </p>
          <button
            className="dv-btn dv-btn-dl"
            onClick={(e) => {
              downloadCsv(
                activeColIdxs.map((i) => colNames[i]),
                renamedRows.map((r) => activeColIdxs.map((i) => r[i])),
                `${fileBaseName(fileName, "data")}_sanitized_long.csv`
              );
              flashSaved(e.currentTarget);
            }}
          >
            ⬇ Long CSV
          </button>
        </div>
        <DataPreview
          headers={activeColIdxs.map((i) => colNames[i])}
          rows={renamedRows.map((r) => activeColIdxs.map((i) => r[i]))}
          maxRows={6}
        />
      </div>
      {wideData && (
        <div className="dv-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              Reshaped (wide)
            </p>
            <button
              className="dv-btn dv-btn-dl"
              onClick={(e) => {
                downloadCsv(
                  wideData.headers,
                  wideData.rows,
                  `${fileBaseName(fileName, "data")}_sanitized_wide.csv`
                );
                flashSaved(e.currentTarget);
              }}
            >
              ⬇ Wide CSV
            </button>
          </div>
          <DataPreview headers={wideData.headers} rows={wideData.rows} maxRows={8} />
        </div>
      )}
      {(groupColIdx < 0 || valueColIdx < 0) && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            ⚠ Assign <strong>group</strong> + <strong>value</strong> columns to enable reshaping &
            stats.
          </p>
        </div>
      )}
      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div
          className="dv-panel"
          style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--danger-text)" }}>
            ⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as{" "}
            <strong>value</strong> but appears to be non-numeric — the plot will be empty. Go back
            to Configure and assign a numeric column as value.
          </p>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => setStep("filter")} className="dv-btn dv-btn-secondary">
          ← Filter
        </button>
        {canPlot && (
          <button onClick={() => setStep("plot")} className="dv-btn dv-btn-primary">
            Plot →
          </button>
        )}
      </div>
    </div>
  );
}

function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ marginBottom: 6, padding: 0 }}>
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
  dataFormat,
  setDataFormat,
  setStep,
  resetAll,
  allDisplayGroups,
  boxplotGroups,
  renamedRows,
  setPlotGroupRenames,
  setBoxplotColors,
  onToggleGroup,
  vis,
  updVis,
  colorByCol,
  setColorByCol,
  colorByCandidates,
  colNames,
  categoryColors,
  setCategoryColors,
  colorByCategories,
  facetByCol,
  setFacetByCol,
  subgroupByCol,
  setSubgroupByCol,
  onDownloadSvg,
  onDownloadPng,
}) {
  const sv = (k) => (v) => updVis({ [k]: v });
  const handleColorChange = (i, c) => {
    const name = boxplotGroups[i].name;
    setBoxplotColors((p) => ({ ...p, [name]: c }));
  };
  const handleNameChange = (i, v) => {
    const name = boxplotGroups[i].name;
    setPlotGroupRenames((p) => ({ ...p, [name]: v }));
  };
  const handleColorByChange = (e) => {
    const v = Number(e.target.value);
    setColorByCol(v);
    if (v >= 0) {
      const cats = [...new Set<string>(renamedRows.map((r) => r[v]))].sort();
      const cc: Record<string, string> = {};
      cats.forEach((c, ci) => {
        cc[c] = PALETTE[(ci + 2) % PALETTE.length];
      });
      setCategoryColors(cc);
    }
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
      {/* Wide format banner */}
      {dataFormat === "wide" && (
        <div
          className="dv-panel"
          style={{
            background: "var(--success-bg)",
            borderColor: "var(--success-border)",
            padding: "10px 12px",
            marginBottom: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <p style={{ margin: 0, fontSize: 11, color: "var(--success-text)", fontWeight: 600 }}>
              Wide format auto-detected
            </p>
          </div>
          <button
            onClick={() => {
              setDataFormat("long");
              setStep("configure");
            }}
            style={{
              fontSize: 10,
              cursor: "pointer",
              background: "var(--surface)",
              border: "1px solid var(--success-border)",
              color: "var(--success-text)",
              fontFamily: "inherit",
              fontWeight: 600,
              borderRadius: 4,
              padding: "3px 8px",
              width: "100%",
            }}
          >
            Switch to long pipeline
          </button>
        </div>
      )}

      {/* Actions tile */}
      <ActionsPanel
        onDownloadSvg={onDownloadSvg}
        onDownloadPng={onDownloadPng}
        onReset={resetAll}
      />

      {/* Conditions / group color editor */}
      <ControlSection
        title={`Conditions (${allDisplayGroups.filter((g) => g.enabled).length}/${allDisplayGroups.length})`}
        defaultOpen
      >
        <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--text-faint)" }}>
          {allDisplayGroups.filter((g) => g.enabled).length} of {allDisplayGroups.length} selected ·{" "}
          {renamedRows.length} obs
        </p>
        <GroupColorEditor
          groups={allDisplayGroups}
          onColorChange={handleColorChange}
          onNameChange={handleNameChange}
          onToggle={onToggleGroup}
        />
      </ControlSection>

      {/* Plot style — always visible */}
      <div
        className="dv-panel"
        style={{ padding: 12, marginBottom: 0, display: "flex", flexDirection: "column", gap: 9 }}
      >
        <div>
          <div className="dv-label">Plot style</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
            {(
              [
                {
                  key: "box",
                  label: "Box",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <line x1="11" y1="2" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
                      <rect
                        x="5"
                        y="6"
                        width="12"
                        height="10"
                        rx="1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <line
                        x1="5"
                        y1="11"
                        x2="17"
                        y2="11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="11"
                        y1="16"
                        x2="11"
                        y2="20"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  ),
                },
                {
                  key: "violin",
                  label: "Violin",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <path
                        d="M11 2 C7 6, 5 9, 5 11 C5 13, 7 16, 11 20 C15 16, 17 13, 17 11 C17 9, 15 6, 11 2Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <line
                        x1="7"
                        y1="11"
                        x2="15"
                        y2="11"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  ),
                },
                {
                  key: "raincloud",
                  label: "Rain",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <path
                        d="M11 2 C8 5, 6 8, 6 11 C6 14, 8 17, 11 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <circle cx="14" cy="7" r="1" fill="currentColor" />
                      <circle cx="16" cy="10" r="1" fill="currentColor" />
                      <circle cx="13" cy="13" r="1" fill="currentColor" />
                      <circle cx="15" cy="16" r="1" fill="currentColor" />
                      <circle cx="14" cy="19" r="1" fill="currentColor" />
                    </svg>
                  ),
                },
                {
                  key: "bar",
                  label: "Bar",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <rect
                        x="2"
                        y="10"
                        width="5"
                        height="10"
                        rx="0.5"
                        fill="currentColor"
                        opacity="0.7"
                      />
                      <rect
                        x="8.5"
                        y="4"
                        width="5"
                        height="16"
                        rx="0.5"
                        fill="currentColor"
                        opacity="0.7"
                      />
                      <rect
                        x="15"
                        y="7"
                        width="5"
                        height="13"
                        rx="0.5"
                        fill="currentColor"
                        opacity="0.7"
                      />
                      <line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="1.2" />
                      <line
                        x1="8.5"
                        y1="3"
                        x2="11.5"
                        y2="3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  ),
                },
              ] as const
            ).map(({ key, label, icon }) => {
              const active = vis.plotStyle === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => updVis({ plotStyle: key })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    padding: "6px 0 4px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: active
                      ? "1.5px solid var(--accent-primary)"
                      : "1px solid var(--border-strong)",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    fontFamily: "inherit",
                    fontSize: 9,
                    fontWeight: active ? 700 : 400,
                    transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
                  }}
                >
                  {icon}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="dv-label">Orientation</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["vertical", "horizontal"] as const).map((mode) => {
              const active = mode === "horizontal" ? vis.horizontal : !vis.horizontal;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ horizontal: mode === "horizontal" })}
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
                  {mode === "vertical" ? "Vertical" : "Horizontal"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Shape & fill */}
      <ControlSection title="Shape & fill" defaultOpen>
        <BaseStyleControls
          plotBg={vis.plotBg}
          onPlotBgChange={sv("plotBg")}
          showGrid={vis.showGrid}
          onShowGridChange={sv("showGrid")}
          gridColor={vis.gridColor}
          onGridColorChange={sv("gridColor")}
        />
        <SliderControl
          label={
            vis.plotStyle === "box" ? "Box width" : vis.plotStyle === "bar" ? "Bar width" : "Width"
          }
          value={vis.boxWidth}
          displayValue={vis.boxWidth + "%"}
          min={20}
          max={100}
          step={5}
          onChange={sv("boxWidth")}
        />
        <SliderControl
          label={vis.plotStyle === "box" ? "Box gap" : vis.plotStyle === "bar" ? "Bar gap" : "Gap"}
          value={vis.boxGap}
          displayValue={vis.boxGap + "%"}
          min={0}
          max={80}
          step={5}
          onChange={sv("boxGap")}
        />
        {vis.plotStyle === "bar" ? (
          <>
            <SliderControl
              label="Fill opacity"
              value={vis.barOpacity}
              displayValue={vis.barOpacity.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={sv("barOpacity")}
            />
            <div>
              <div className="dv-label">Error bars</div>
              <div
                style={{
                  display: "flex",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border-strong)",
                }}
              >
                {(["none", "sem", "sd", "ci95"] as const).map((mode) => {
                  const active = vis.errorType === mode;
                  const label =
                    mode === "none" ? "None" : mode === "ci95" ? "95% CI" : mode.toUpperCase();
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updVis({ errorType: mode })}
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
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {vis.errorType !== "none" && (
              <SliderControl
                label="Error bar stroke"
                value={vis.errStrokeWidth}
                displayValue={vis.errStrokeWidth.toFixed(1)}
                min={0.5}
                max={4}
                step={0.1}
                onChange={sv("errStrokeWidth")}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="dv-label">Bar outline</span>
              <input
                type="checkbox"
                checked={vis.showBarOutline}
                onChange={(e) => updVis({ showBarOutline: e.target.checked })}
                style={{ accentColor: "var(--cta-primary-bg)" }}
              />
            </div>
            {vis.showBarOutline && (
              <>
                <SliderControl
                  label="Outline width"
                  value={vis.barOutlineWidth}
                  displayValue={vis.barOutlineWidth.toFixed(1)}
                  min={0.5}
                  max={4}
                  step={0.1}
                  onChange={sv("barOutlineWidth")}
                />
                <div>
                  <div className="dv-label">Outline color</div>
                  <ColorInput
                    value={vis.barOutlineColor}
                    onChange={sv("barOutlineColor")}
                    size={24}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <SliderControl
            label="Fill opacity"
            value={vis.boxFillOpacity}
            displayValue={vis.boxFillOpacity.toFixed(2)}
            min={0}
            max={1}
            step={0.05}
            onChange={sv("boxFillOpacity")}
          />
        )}
      </ControlSection>

      {/* Data points */}
      <ControlSection title="Data points" defaultOpen>
        <div>
          <div className="dv-label">Show points</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["off", "on"] as const).map((mode) => {
              const active = mode === "on" ? vis.showPoints : !vis.showPoints;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showPoints: mode === "on" })}
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
        {vis.showPoints && (
          <>
            <div>
              <div className="dv-label">Color by</div>
              <select
                value={colorByCol}
                onChange={handleColorByChange}
                className="dv-input"
                style={{ cursor: "pointer", fontSize: 11, width: "100%" }}
              >
                <option value={-1}>— none —</option>
                {colorByCandidates.map((ci) => (
                  <option key={ci} value={ci}>
                    {colNames[ci]}
                  </option>
                ))}
              </select>
            </div>
            {colorByCol >= 0 && (
              <div>
                <div className="dv-label">Composition pies</div>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? vis.showCompPie : !vis.showCompPie;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updVis({ showCompPie: mode === "on" })}
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
            )}
            {colorByCol >= 0 &&
              colorByCategories.map((cat) => (
                <div
                  key={cat}
                  style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 }}
                >
                  <ColorInput
                    value={categoryColors[cat] || "#999999"}
                    onChange={(c) => setCategoryColors((p) => ({ ...p, [cat]: c }))}
                    size={16}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{cat}</span>
                </div>
              ))}
            <SliderControl
              label="Size"
              value={vis.pointSize}
              displayValue={vis.pointSize}
              min={1}
              max={6}
              step={0.5}
              onChange={sv("pointSize")}
            />
            <SliderControl
              label="Jitter"
              value={vis.jitterWidth}
              displayValue={vis.jitterWidth.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={sv("jitterWidth")}
            />
            <SliderControl
              label="Opacity"
              value={vis.pointOpacity}
              displayValue={vis.pointOpacity.toFixed(2)}
              min={0.1}
              max={1}
              step={0.05}
              onChange={sv("pointOpacity")}
            />
          </>
        )}
      </ControlSection>

      {/* Split by */}
      <ControlSection title="Split by" defaultOpen>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            marginBottom: facetByCol >= 0 || subgroupByCol >= 0 ? 6 : 0,
          }}
        >
          {(["none", "facet", "subgroup"] as const).map((mode) => {
            const active =
              mode === "facet"
                ? facetByCol >= 0
                : mode === "subgroup"
                  ? subgroupByCol >= 0
                  : facetByCol < 0 && subgroupByCol < 0;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === "none") {
                    setFacetByCol(-1);
                    setSubgroupByCol(-1);
                  } else if (mode === "facet") {
                    setSubgroupByCol(-1);
                    if (facetByCol < 0 && colorByCandidates.length > 0)
                      setFacetByCol(colorByCandidates[0]);
                  } else {
                    setFacetByCol(-1);
                    if (subgroupByCol < 0 && colorByCandidates.length > 0)
                      setSubgroupByCol(colorByCandidates[0]);
                  }
                }}
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
                {mode === "none" ? "None" : mode === "facet" ? "Facet" : "Subgroup"}
              </button>
            );
          })}
        </div>
        {(facetByCol >= 0 || subgroupByCol >= 0) && (
          <select
            value={facetByCol >= 0 ? facetByCol : subgroupByCol}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (facetByCol >= 0) setFacetByCol(v);
              else setSubgroupByCol(v);
            }}
            className="dv-input"
            style={{ cursor: "pointer", fontSize: 11, width: "100%" }}
          >
            {colorByCandidates.map((ci) => (
              <option key={ci} value={ci}>
                {colNames[ci]}
              </option>
            ))}
          </select>
        )}
      </ControlSection>

      {/* Axes & labels */}
      <ControlSection title="Axes & labels">
        <div>
          <div className="dv-label">Title</div>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%", fontSize: 11 }}
          />
        </div>
        <div>
          <div className="dv-label">Y label</div>
          <input
            value={vis.yLabel}
            onChange={(e) => updVis({ yLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%", fontSize: 11 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="dv-label">Y min</div>
            <input
              value={vis.yMinCustom}
              onChange={(e) => updVis({ yMinCustom: e.target.value })}
              className="dv-input"
              style={{ width: "100%", fontSize: 11 }}
              placeholder="auto"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div className="dv-label">Y max</div>
            <input
              value={vis.yMaxCustom}
              onChange={(e) => updVis({ yMaxCustom: e.target.value })}
              className="dv-input"
              style={{ width: "100%", fontSize: 11 }}
              placeholder="auto"
            />
          </div>
        </div>
        <div>
          <div className="dv-label">Y scale</div>
          <select
            value={vis.yScale}
            onChange={(e) => updVis({ yScale: e.target.value })}
            className="dv-select"
            style={{ width: "100%", fontSize: 11 }}
          >
            <option value="linear">Linear</option>
            <option value="log10">{" Log\u2081\u2080"}</option>
            <option value="log2">{" Log\u2082"}</option>
            <option value="ln">{" Ln (natural)"}</option>
          </select>
        </div>
        <SliderControl
          label="Group label angle"
          value={vis.xLabelAngle}
          displayValue={vis.xLabelAngle + "°"}
          min={-90}
          max={0}
          step={5}
          onChange={sv("xLabelAngle")}
        />
      </ControlSection>
    </div>
  );
}

const FacetBoxplotItem = memo(function FacetBoxplotItem({
  fd,
  facetRefs,
  chartProps,
  categoryColors,
  fillHeight,
}: any) {
  const localRef = useRef();
  useEffect(() => {
    facetRefs.current[fd.category] = localRef.current;
    return () => {
      delete facetRefs.current[fd.category];
    };
  }, [fd.category, facetRefs]);
  return (
    <div
      className="dv-plot-card"
      style={{
        background: "var(--plot-card-bg)",
        borderRadius: 8,
        padding: 12,
        border: "1px solid var(--plot-card-border)",
        flex: fillHeight ? "1 1 auto" : "0 1 auto",
        minWidth: 180,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: categoryColors[fd.category] || "#999",
          }}
        />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {fd.category}
        </p>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          ({fd.groups.reduce((a, g) => a + g.allValues.length, 0)} pts)
        </span>
      </div>
      <BoxplotChart ref={localRef} {...chartProps} />
    </div>
  );
});

function PlotArea({
  colorByCol,
  colorByCategories,
  colNames,
  categoryColors,
  facetByCol,
  facetedData,
  chartRef,
  displayBoxplotGroups,
  vis,
  yMinVal,
  yMaxVal,
  chartAnnotations,
  chartSummary,
  subgroups,
  subgroupSummaries,
}) {
  if (displayBoxplotGroups.length === 0 && (facetByCol < 0 || facetedData.length === 0)) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "var(--text-faint)",
              fontSize: 14,
            }}
          >
            No conditions selected. Enable at least one to display the plot.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {colorByCol >= 0 && colorByCategories.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            background: "var(--surface-subtle)",
            borderRadius: 8,
            padding: "8px 14px",
            border: "1px solid var(--border)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Points colored by: {colNames[colorByCol]}
          </span>
          {colorByCategories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: categoryColors[cat] || "#999",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cat}</span>
            </div>
          ))}
        </div>
      )}
      {facetByCol < 0 && (
        <div
          className="dv-plot-card"
          style={{
            background: "var(--plot-card-bg)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--plot-card-border)",
          }}
        >
          <BoxplotChart
            ref={chartRef}
            groups={displayBoxplotGroups}
            yLabel={vis.yLabel}
            plotTitle={vis.plotTitle}
            plotBg={vis.plotBg}
            showGrid={vis.showGrid}
            gridColor={vis.gridColor}
            boxWidth={vis.boxWidth}
            boxFillOpacity={vis.boxFillOpacity}
            pointSize={vis.pointSize}
            showPoints={vis.showPoints}
            jitterWidth={vis.jitterWidth}
            pointOpacity={vis.pointOpacity}
            xLabelAngle={vis.xLabelAngle}
            yMin={yMinVal}
            yMax={yMaxVal}
            yScale={vis.yScale}
            categoryColors={categoryColors}
            colorByCol={colorByCol}
            boxGap={vis.boxGap}
            showCompPie={vis.showCompPie}
            plotStyle={vis.plotStyle}
            barOpacity={vis.barOpacity}
            errorType={vis.errorType}
            errStrokeWidth={vis.errStrokeWidth}
            showBarOutline={vis.showBarOutline}
            barOutlineWidth={vis.barOutlineWidth}
            barOutlineColor={vis.barOutlineColor}
            horizontal={vis.horizontal}
            subgroups={subgroups}
            subgroupSummaries={subgroupSummaries}
            annotations={chartAnnotations}
            statsSummary={chartSummary}
            svgLegend={
              colorByCol >= 0 && colorByCategories.length > 0
                ? [
                    {
                      id: "legend-color",
                      title: `Points colored by: ${colNames[colorByCol]}`,
                      items: colorByCategories.map((c) => ({
                        label: c,
                        color: categoryColors[c] || "#999",
                        shape: "dot",
                      })),
                    },
                  ]
                : null
            }
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Unified stats panel
//
// Replaces the per-facet / per-subgroup stack of StatsTiles with a single
// scannable table: one row per "stat set" (facet, subgroup, or the whole
// plot in flat mode), aggregate TXT / R downloads, and click-row-to-expand
// detail with slate-banner sections (Groups / Assumptions / Test /
// Post-hoc / Power). Matches the Line Plot per-x panel vocabulary.
//
// Per-set test override lives in the expanded detail. Global display
// controls (show on plot, Letters vs Brackets, show ns, print summary
// below plot) live in the panel header and apply to every set in lockstep.
//
// The panel emits per-row annotation + summary via `onAnnotationForKey(key, …)`
// and `onSummaryForKey(key, …)`. App routes these into mode-specific stores:
//   - Facet mode:    `facetStats*` maps keyed on `fd.category`
//   - Subgroup mode: `subgroup*` maps keyed on `sg.name`, then merged
//                    (annotations only) into a single spec via
//                    `mergeSubgroupAnnotations` for the shared chart
//   - Flat mode:     scalar `flatStats*` state (the key is ignored)
// ─────────────────────────────────────────────────────────────────────────

// Pure stats-routing, formatting, annotation, and summary helpers live in
// tools/boxplot/helpers.ts (TEST_LABELS_BP / POSTHOC_LABELS_BP / TEST_OPTIONS_*
// / ERROR_BAR_LABELS / runBpTest / runBpPostHoc / postHocForBpTest /
// formatBpStatShort / formatBpResultLine / computeBpAnnotationSpec /
// summariseNormality / summariseEqualVariance / computeBpSummaryText).

function buildBpSetTextBlock(row, setLabel) {
  const lines = [];
  const names = row.names;
  const values = row.values;
  const res = row.testResult || {};
  lines.push("=".repeat(60));
  lines.push(`${setLabel || "Set"}: ${row.name || "—"}`);
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
  const recTest = rec && rec.recommendation && rec.recommendation.test;
  const reason = rec && rec.recommendation && rec.recommendation.reason;
  lines.push(`Test: ${TEST_LABELS_BP[row.chosenTest] || row.chosenTest || "—"}`);
  if (reason) lines.push(`Reason: ${reason}`);
  if (res.error) lines.push(`Result: ⚠ ${res.error}`);
  else if (row.chosenTest) lines.push(`Result: ${formatBpResultLine(row.chosenTest, res)}`);
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${TEST_LABELS_BP[recTest] || recTest})`);
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
      `Levene: F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(3)}, p = ${formatP(lev.p)} → ${lev.equalVar ? "equal variance" : "unequal variance"}`
    );
  if (names.length >= 3 && row.postHocResult && !row.postHocResult.error) {
    lines.push("");
    lines.push(`Post-hoc — ${POSTHOC_LABELS_BP[row.postHocName] || row.postHocName}:`);
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

function buildBpAggregateReport(rows, setLabel) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const label = setLabel || "Set";
  const head = [
    "Group Plot — combined statistical analysis",
    "Generated: " + now,
    `${label}${rows.length === 1 ? "" : "s"}: ${rows.length}`,
    "",
  ];
  return head.join("\n") + rows.map((r) => buildBpSetTextBlock(r, label)).join("");
}

function buildBpAggregateRScript(rows, setLabel) {
  if (!rows.length || typeof buildRScript !== "function") return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const label = setLabel || "Set";
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Dataviz Toolbox — Group Plot R script export (combined analysis)",
    "# Generated: " + now,
    `# ${label}${rows.length === 1 ? "" : "s"}: ${rows.length}. Each section redefines df and runs its checks.`,
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
      dataNote: `${label}: ${row.name || "—"}`,
    });
    const banner =
      "\n# ==============================================================\n# " +
      `${label}: ${row.name || "—"}` +
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

// Combine per-subgroup annotation specs into a single spec with offset
// indices so the main chart can draw all of them at once. Replaces the
// inline merge loop from the old SubgroupedStatsTile.
function BoxplotStatsDetail({ row, onOverrideTest, isOverridden }) {
  const names = row.names;
  const values = row.values;
  const k = names.length;
  const res = row.testResult || {};
  const rec = row.rec || {};
  const recReason = rec.recommendation && rec.recommendation.reason;
  const recTest = rec.recommendation && rec.recommendation.test;
  const testOptions = k === 2 ? TEST_OPTIONS_BP_2 : TEST_OPTIONS_BP_K;

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
              {TEST_LABELS_BP[t]}
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
          : row.chosenTest
            ? formatBpResultLine(row.chosenTest, res)
            : "—"}
      </div>

      {k >= 3 && row.postHocResult && !row.postHocResult.error && (
        <>
          <div style={subhead}>
            Post-hoc — {POSTHOC_LABELS_BP[row.postHocName] || row.postHocName}
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

function BoxplotStatsPanel({
  sets,
  setLabel,
  fileStem,
  onAnnotationForKey,
  onSummaryForKey,
  singletonAutoExpand = false,
  displayMode,
  onDisplayModeChange,
  showNs,
  onShowNsChange,
  showSummary,
  onShowSummaryChange,
  errorBarLabel,
}: any) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    singletonAutoExpand && sets.length === 1 ? { [sets[0].key]: true } : {}
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const setDisplayMode = onDisplayModeChange;
  const setShowNs = onShowNsChange;
  const setShowSummary = onShowSummaryChange;

  const enriched = useMemo(
    () =>
      sets.map((s: any) => {
        const validGroups = (s.groups || []).filter(
          (g: any) => g && Array.isArray(g.values) && g.values.length >= 2
        );
        const names = validGroups.map((g: any) => g.name);
        const values = validGroups.map((g: any) => g.values.slice());
        const k = names.length;
        if (k < 2) return { ...s, names, values, k, skip: true };
        const rec = selectTest(values);
        const recTest =
          rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
        const chosenTest = overrides[s.key] || recTest || null;
        const testResult = chosenTest ? runBpTest(chosenTest, values) : null;
        const postHocName = postHocForBpTest(chosenTest);
        const postHocResult = k > 2 && postHocName ? runBpPostHoc(postHocName, values) : null;
        const powerResult = computePowerFromData(chosenTest, values);
        return {
          ...s,
          names,
          values,
          k,
          rec,
          recTest,
          chosenTest,
          testResult,
          postHocName,
          postHocResult,
          powerResult,
        };
      }),
    [sets, overrides]
  );

  const annotByKey = useMemo(() => {
    const out: Record<string, any> = {};
    for (const r of enriched) {
      out[r.key] = r.skip ? null : computeBpAnnotationSpec(r, displayMode, showNs);
    }
    return out;
  }, [enriched, displayMode, showNs]);
  const annotKey = JSON.stringify(annotByKey);
  const onAnnotationForKeyRef = useRef(onAnnotationForKey);
  onAnnotationForKeyRef.current = onAnnotationForKey;
  useEffect(() => {
    if (typeof onAnnotationForKeyRef.current !== "function") return;
    for (const r of sets) {
      onAnnotationForKeyRef.current(r.key, annotByKey[r.key] || null);
    }
  }, [annotKey]);

  const summaryByKey = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const r of enriched) {
      out[r.key] = r.skip ? null : computeBpSummaryText(r, showSummary, errorBarLabel);
    }
    return out;
  }, [enriched, showSummary, errorBarLabel]);
  const summaryKey = JSON.stringify(summaryByKey);
  const onSummaryForKeyRef = useRef(onSummaryForKey);
  onSummaryForKeyRef.current = onSummaryForKey;
  useEffect(() => {
    if (typeof onSummaryForKeyRef.current !== "function") return;
    for (const r of sets) {
      onSummaryForKeyRef.current(r.key, summaryByKey[r.key] || null);
    }
  }, [summaryKey]);

  const setOverride = (key: string, test: string | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (test == null) delete next[key];
      else next[key] = test;
      return next;
    });

  const eligible = enriched.filter((r: any) => !r.skip);
  if (eligible.length === 0) return null;

  const hasR = typeof buildRScript === "function";
  const stem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "stats_report";
  const rowSlug = (row: any, i: number) => {
    const raw = row.name || `set-${i + 1}`;
    const clean =
      typeof svgSafeId === "function"
        ? svgSafeId(String(raw)).replace(/^-+|-+$/g, "")
        : String(raw)
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return clean || `set-${i + 1}`;
  };
  const downloadReport = (e: any) => {
    if (eligible.length === 1) {
      downloadText(buildBpAggregateReport(eligible, setLabel), `${stem}_stats.txt`);
    } else {
      eligible.forEach((row: any, i: number) => {
        const content = buildBpAggregateReport([row], setLabel);
        const name = `${stem}_${rowSlug(row, i)}_stats.txt`;
        setTimeout(() => downloadText(content, name), i * 120);
      });
    }
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: any) => {
    if (eligible.length === 1) {
      downloadText(buildBpAggregateRScript(eligible, setLabel), `${stem}_stats.R`);
    } else {
      eligible.forEach((row: any, i: number) => {
        const content = buildBpAggregateRScript([row], setLabel);
        const name = `${stem}_${rowSlug(row, i)}_stats.R`;
        setTimeout(() => downloadText(content, name), i * 120);
      });
    }
    flashSaved(e.currentTarget);
  };

  const anyMulti = eligible.some((r: any) => r.k > 2);
  const singleSet = sets.length === 1;
  const headingLabel =
    setLabel && !singleSet ? `Statistics at each ${setLabel.toLowerCase()}` : "Statistics";

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
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace" };

  const segBtn = (value: "none" | "cld" | "brackets", label: string) => {
    const active = displayMode === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setDisplayMode(value)}
        style={{
          flex: "0 0 auto",
          padding: "4px 10px",
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
        {label}
      </button>
    );
  };
  const nsDisabled = displayMode === "none" || (anyMulti && displayMode === "cld");

  return (
    <div className="dv-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
          flexWrap: "wrap",
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
            {headingLabel}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Click a row to inspect decision trace, assumptions, post-hoc and power.
            {singleSet
              ? ""
              : " Tests are independent per " + (setLabel || "set").toLowerCase() + "."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={downloadReport}
            title={
              singleSet
                ? "Download a plain-text stats report"
                : `Download a plain-text report covering every ${(setLabel || "set").toLowerCase()}`
            }
          >
            ⬇ TXT
          </button>
          {hasR && (
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={downloadR}
              title={
                singleSet
                  ? "Download a runnable R script reproducing these tests"
                  : `Download a runnable R script reproducing every ${(setLabel || "set").toLowerCase()} test`
              }
            >
              ⬇ R
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-subtle)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
          Display on plot
        </span>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
          }}
        >
          {segBtn("none", "Off")}
          {anyMulti && segBtn("cld", "Letters")}
          {segBtn("brackets", "Brackets")}
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: nsDisabled ? "var(--text-faint)" : "var(--text)",
            cursor: nsDisabled ? "not-allowed" : "pointer",
            opacity: nsDisabled ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={!nsDisabled && showNs}
            disabled={nsDisabled}
            onChange={(e) => setShowNs(e.target.checked)}
            style={{ accentColor: "var(--cta-primary-bg)" }}
          />
          Show ns
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showSummary}
            onChange={(e) => setShowSummary(e.target.checked)}
            style={{ accentColor: "var(--cta-primary-bg)" }}
          />
          Print summary below plot
        </label>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>{setLabel || "Set"}</th>
            <th style={thS}>Groups</th>
            <th style={thS}>Test</th>
            <th style={thS}>Statistic</th>
            <th style={thS}>p</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r: any) => {
            const key = r.key;
            const isOpen = !!expanded[key];
            if (r.skip) {
              return (
                <tr key={key}>
                  <td style={tdS}>{r.name || "—"}</td>
                  <td style={tdS} colSpan={5}>
                    <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                      Needs ≥ 2 groups with n ≥ 2 to run a test.
                    </span>
                  </td>
                </tr>
              );
            }
            const p = r.testResult && !r.testResult.error ? r.testResult.p : null;
            const sig = p != null && p < 0.05;
            const stars = p != null ? pStars(p) : "";
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
                  <td style={tdS}>{r.name || "—"}</td>
                  <td style={tdS}>{r.k}</td>
                  <td style={tdS}>{TEST_LABELS_BP[r.chosenTest] || r.chosenTest || "—"}</td>
                  <td style={{ ...tdS, ...mono }}>
                    {formatBpStatShort(r.chosenTest, r.testResult)}
                  </td>
                  <td
                    style={{
                      ...tdS,
                      ...mono,
                      fontWeight: sig ? 700 : 400,
                      color: sig ? "var(--success-text)" : "var(--text)",
                    }}
                  >
                    {p != null ? formatP(p) : "—"}
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
                      <BoxplotStatsDetail
                        row={r}
                        isOverridden={!!overrides[key]}
                        onOverrideTest={(t: string | null) => setOverride(key, t)}
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

// Per-facet memoised wrapper. Memoising here is the key perf win for facet
// mode: toggling a panel-level control updates the parent's
// `facetStatsAnnotations` / `facetStatsSummary` maps, which rebuilds the
// entire `facetedData.map` in `FacetPlotList`. Before this wrapper, the
// inline `chartProps` object was re-created for every facet on every App
// render, so `FacetBoxplotItem`'s `React.memo` shallow-compare always
// failed and every chart re-rendered — even unaffected siblings.
const FacetTrio = memo(function FacetTrio({
  fd,
  annotations,
  statsSummary,
  vis,
  yMinVal,
  yMaxVal,
  plotGroupRenames,
  boxplotColors,
  categoryColors,
  colorByCol,
  svgLegend,
  facetRefs,
}: any) {
  const chartProps = useMemo(
    () => ({
      groups: fd.groups.map((g) => ({
        ...g,
        name: plotGroupRenames[g.name] ?? g.name,
        color: boxplotColors[g.name] ?? g.color,
      })),
      annotations,
      statsSummary,
      yLabel: vis.yLabel,
      plotTitle: [vis.plotTitle, fd.category].filter(Boolean).join(" — "),
      plotBg: vis.plotBg,
      showGrid: vis.showGrid,
      gridColor: vis.gridColor,
      boxWidth: vis.boxWidth,
      boxFillOpacity: vis.boxFillOpacity,
      pointSize: vis.pointSize,
      showPoints: vis.showPoints,
      jitterWidth: vis.jitterWidth,
      pointOpacity: vis.pointOpacity,
      xLabelAngle: vis.xLabelAngle,
      yMin: yMinVal,
      yMax: yMaxVal,
      yScale: vis.yScale,
      categoryColors,
      colorByCol,
      boxGap: vis.boxGap,
      showCompPie: vis.showCompPie,
      plotStyle: vis.plotStyle,
      barOpacity: vis.barOpacity,
      errorType: vis.errorType,
      errStrokeWidth: vis.errStrokeWidth,
      showBarOutline: vis.showBarOutline,
      barOutlineWidth: vis.barOutlineWidth,
      barOutlineColor: vis.barOutlineColor,
      horizontal: vis.horizontal,
      subgroups: null,
      svgLegend,
    }),
    [
      fd,
      annotations,
      statsSummary,
      vis,
      yMinVal,
      yMaxVal,
      plotGroupRenames,
      boxplotColors,
      categoryColors,
      colorByCol,
      svgLegend,
    ]
  );
  return (
    <div style={{ maxWidth: 720 }}>
      <FacetBoxplotItem
        fd={fd}
        facetRefs={facetRefs}
        chartProps={chartProps}
        categoryColors={categoryColors}
      />
    </div>
  );
});

function FacetPlotList({
  facetedData,
  facetRefs,
  vis,
  yMinVal,
  yMaxVal,
  plotGroupRenames,
  boxplotColors,
  categoryColors,
  colorByCol,
  colorByCategories,
  colNames,
  facetStatsAnnotations,
  facetStatsSummary,
}: any) {
  // Stabilise svgLegend so FacetTrio's shallow-compare can hold across
  // unrelated re-renders. Without this, it would be a fresh array literal
  // on every render and every memoised trio would re-render.
  const svgLegend = useMemo(
    () =>
      colorByCol >= 0 && colorByCategories.length > 0
        ? [
            {
              id: "legend-color",
              title: `Points colored by: ${colNames[colorByCol]}`,
              items: colorByCategories.map((c) => ({
                label: c,
                color: categoryColors[c] || "#999",
                shape: "dot",
              })),
            },
          ]
        : null,
    [colorByCol, colorByCategories, colNames, categoryColors]
  );
  if (!facetedData || facetedData.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {colorByCol >= 0 && colorByCategories.length > 0 && (
        <div
          style={{
            background: "var(--surface-subtle)",
            borderRadius: 8,
            padding: "8px 14px",
            border: "1px solid var(--border)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Points colored by: {colNames[colorByCol]}
          </span>
          {colorByCategories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: categoryColors[cat] || "#999",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cat}</span>
            </div>
          ))}
        </div>
      )}
      {facetedData.map((fd) => (
        <FacetTrio
          key={fd.category}
          fd={fd}
          annotations={facetStatsAnnotations[fd.category] || null}
          statsSummary={facetStatsSummary[fd.category] || null}
          vis={vis}
          yMinVal={yMinVal}
          yMaxVal={yMaxVal}
          plotGroupRenames={plotGroupRenames}
          boxplotColors={boxplotColors}
          categoryColors={categoryColors}
          colorByCol={colorByCol}
          svgLegend={svgLegend}
          facetRefs={facetRefs}
        />
      ))}
    </div>
  );
}

/* ── Stats state reducer ───────────────────────────────────────────────────── */

const statsInit = {
  displayMode: "none" as "none" | "cld" | "brackets",
  showNs: false,
  showSummary: false,
  flatSummary: null as string | null,
  flatAnnotation: null as any,
  facetAnnotations: {} as Record<string, any>,
  facetSummaries: {} as Record<string, string | null>,
  subgroupSummaries: {} as Record<string, string | null>,
  subgroupAnnotSpecs: {} as Record<string, any>,
};
function statsReducer(state: typeof statsInit, a: any): typeof statsInit {
  switch (a.type) {
    case "reset":
      return statsInit;
    case "setDisplayMode":
      if (a.value === "none") {
        return {
          ...state,
          displayMode: "none",
          flatAnnotation: null,
          facetAnnotations: {},
          subgroupAnnotSpecs: {},
        };
      }
      return { ...state, displayMode: a.value };
    case "setShowNs":
      return { ...state, showNs: a.value };
    case "setShowSummary":
      if (!a.value) {
        return {
          ...state,
          showSummary: false,
          flatSummary: null,
          facetSummaries: {},
          subgroupSummaries: {},
        };
      }
      return { ...state, showSummary: true };
    case "setFlatSummary":
      return { ...state, flatSummary: a.value };
    case "setFlatAnnotation":
      return { ...state, flatAnnotation: a.value };
    case "setFacetAnnotation":
      if (state.facetAnnotations[a.key] === a.value) return state;
      return { ...state, facetAnnotations: { ...state.facetAnnotations, [a.key]: a.value } };
    case "setFacetSummary":
      if (state.facetSummaries[a.key] === a.value) return state;
      return { ...state, facetSummaries: { ...state.facetSummaries, [a.key]: a.value } };
    case "setSubgroupAnnotSpec":
      if (state.subgroupAnnotSpecs[a.key] === a.value) return state;
      return { ...state, subgroupAnnotSpecs: { ...state.subgroupAnnotSpecs, [a.key]: a.value } };
    case "setSubgroupSummary":
      if (state.subgroupSummaries[a.key] === a.value) return state;
      return { ...state, subgroupSummaries: { ...state.subgroupSummaries, [a.key]: a.value } };
    default:
      return state;
  }
}

/* ── Main App (orchestrator) ───────────────────────────────────────────────── */

function App() {
  const shell = usePlotToolState("boxplot", VIS_INIT_BOXPLOT);
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

  // Upload & navigation
  const [rawText, setRawText] = useState(null);
  const [dataFormat, setDataFormat] = useState("long");

  // Parsing
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  // Column config & filtering
  const [colRoles, setColRoles] = useState<ColumnRole[]>([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});

  // Plot state
  const [boxplotColors, setBoxplotColors] = useState({});
  const [plotGroupRenames, setPlotGroupRenames] = useState({});
  const [disabledGroups, setDisabledGroups] = useState({});
  // Per-column ordering keyed by column index. Any column that can appear in
  // the rename panel (group/filter role) gets its own order array here, so the
  // user can reorder values during the filter step before ever picking a
  // "Facet by" or "Color by" column in the plot step.
  const [columnOrders, setColumnOrders] = useState({});
  const setOrderForCol = (i, newOrder) => setColumnOrders((prev) => ({ ...prev, [i]: newOrder }));
  const [colorByCol, setColorByCol] = useState(-1);
  const [categoryColors, setCategoryColors] = useState({});
  const [dragState, setDragState] = useState(null);
  const [facetByCol, _setFacetByCol] = useState(-1);
  const [subgroupByCol, _setSubgroupByCol] = useState(-1);
  // Facet and subgroup are mutually exclusive. Flipping one on turns the
  // other off.
  const handleSetFacetByCol = (v) => {
    _setFacetByCol(v);
    if (v >= 0) _setSubgroupByCol(-1);
  };
  const handleSetSubgroupByCol = (v) => {
    _setSubgroupByCol(v);
    if (v >= 0) _setFacetByCol(-1);
  };
  // Flat / facet / subgroup each own their own summary + annotation state so
  // nothing leaks across modes. Panel display prefs live in the same reducer
  // so their reset semantics (mode="none" clears annotations; showSummary=off
  // clears summaries) stay co-located with the state they drive.
  const [statsUi, dispatchStats] = useReducer(statsReducer, statsInit);
  const setFlatStatsSummary = (v) => dispatchStats({ type: "setFlatSummary", value: v });
  const setFlatStatsAnnotation = (v) => dispatchStats({ type: "setFlatAnnotation", value: v });
  const handleStatsShowSummaryChange = (v) => dispatchStats({ type: "setShowSummary", value: v });
  const handleStatsDisplayModeChange = (v) => dispatchStats({ type: "setDisplayMode", value: v });
  const setStatsShowNs = (v) => dispatchStats({ type: "setShowNs", value: v });
  // Stable references so `FacetTrio`'s shallow-compare memo can skip
  // re-rendering unaffected facets when one facet's map entry updates.
  const setAnnotationsFor = useCallback(
    (key, spec) => dispatchStats({ type: "setFacetAnnotation", key, value: spec }),
    []
  );
  const setSummaryFor = useCallback(
    (key, txt) => dispatchStats({ type: "setFacetSummary", key, value: txt }),
    []
  );

  const facetRefs = useRef({});
  const chartRef = useRef();

  const resetDerived = () => {
    setValueRenames({});
    setBoxplotColors({});
    setPlotGroupRenames({});
    setDisabledGroups({});
    setColumnOrders({});
    setColorByCol(-1);
    setCategoryColors({});
    _setFacetByCol(-1);
    _setSubgroupByCol(-1);
    dispatchStats({ type: "reset" });
    updVis({ yMinCustom: "", yMaxCustom: "" });
  };

  const buildFilters = (hdrs, rws) => {
    const f = {};
    hdrs.forEach((_, i) => {
      const u = [...new Set(rws.map((r) => r[i]))].sort();
      f[i] = { unique: u, included: new Set(u) };
    });
    return f;
  };

  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    const fixedText = dc.text;
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    setRawText(fixedText);

    const { headers, rows, hasHeader: hh } = parseRaw(fixedText, sep);
    if (!headers.length || !rows.length) {
      setParseError(
        "The file appears to be empty or has no data rows. Please check your file and try again."
      );
      return;
    }
    setParseError(null);

    const isWide = detectWideFormat(headers, rows);
    if (isWide) {
      const { headers: lh, rows: lr } = wideToLong(headers, rows);
      setParsedHeaders(lh);
      setParsedRows(lr);
      setHasHeader(true);
      setColRoles(["group", "value"]);
      setColNames([...lh]);
      setFilters(buildFilters(lh, lr));
      resetDerived();
      setDataFormat("wide");
      setStep("plot");
    } else {
      setParsedHeaders(headers);
      setParsedRows(rows);
      setHasHeader(hh);
      // guessColumnType is per-column, so it can hand back multiple "group"
      // or "value" roles (e.g. two low-cardinality categorical columns or two
      // numeric columns). Group Plot only uses one x-axis grouping column and
      // one numeric value column — keep the first guess of each and demote
      // any later ones to "filter" so the configure step never starts in a
      // state the user can't reach via the UI.
      {
        let seenGroup = false;
        let seenValue = false;
        setColRoles(
          headers.map((_, i) => {
            const r = guessColumnType(rows.map((row) => row[i] ?? ""));
            if (r === "group") {
              if (seenGroup) return "filter";
              seenGroup = true;
              return r;
            }
            if (r === "value") {
              if (seenValue) return "filter";
              seenValue = true;
              return r;
            }
            return r;
          })
        );
      }
      setColNames([...headers]);
      setFilters(buildFilters(headers, rows));
      resetDerived();
      setDataFormat("long");
      setStep("configure");
    }
  }, []);

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );
  const loadExample = useCallback(() => {
    const csv = makeExamplePlantCSV();
    setSepOverride(",");
    setFileName("example_plant_growth.csv");
    doParse(csv, ",");
  }, [doParse]);

  const resetAll = () => {
    setRawText(null);
    setParsedRows([]);
    setParsedHeaders([]);
    setFileName("");
    setStep("upload");
  };

  const applyRename = (ci, v) =>
    valueRenames[ci] && valueRenames[ci][v] != null ? valueRenames[ci][v] : v;

  const filteredRows = useMemo(
    () => parsedRows.filter((r) => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))),
    [parsedRows, filters]
  );

  const renamedRows = useMemo(
    () => filteredRows.map((r) => r.map((v, ci) => applyRename(ci, v))),
    [filteredRows, valueRenames]
  );

  const activeColIdxs = useMemo(
    () =>
      colRoles.reduce((acc, r, i) => {
        if (r !== "ignore") acc.push(i);
        return acc;
      }, []),
    [colRoles]
  );

  const groupColIdx = colRoles.indexOf("group");
  const valueColIdx = colRoles.indexOf("value");

  const groupedData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return {};
    const g = {};
    renamedRows.forEach((r) => {
      const k = r[groupColIdx];
      if (!g[k]) g[k] = [];
      g[k].push(r[valueColIdx]);
    });
    return g;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const stats = useMemo(() => computeGroupStats(groupedData), [groupedData]);

  const wideData = useMemo(
    () =>
      groupColIdx < 0 || valueColIdx < 0
        ? null
        : reshapeWide(renamedRows, groupColIdx, valueColIdx),
    [renamedRows, groupColIdx, valueColIdx]
  );

  const naturalGroupOrder = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const seen = new Set(),
      order = [];
    renamedRows.forEach((r) => {
      const g = r[groupColIdx];
      if (!seen.has(g)) {
        seen.add(g);
        order.push(g);
      }
    });
    return order;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const effectiveOrder = useMemo(() => {
    const stored = columnOrders[groupColIdx];
    if (stored && stored.length > 0) {
      const valid = stored.filter((g) => naturalGroupOrder.includes(g));
      const missing = naturalGroupOrder.filter((g) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalGroupOrder;
  }, [columnOrders, groupColIdx, naturalGroupOrder]);

  const colorByCandidates = useMemo(
    () =>
      parsedHeaders
        .map((_, i) => i)
        .filter(
          (i) =>
            i !== groupColIdx &&
            i !== valueColIdx &&
            (colRoles[i] === "filter" || colRoles[i] === "group" || colRoles[i] === "text")
        ),
    [parsedHeaders, groupColIdx, valueColIdx, colRoles]
  );

  const colorByCategories = useMemo(() => {
    if (colorByCol < 0) return [];
    return [...new Set(renamedRows.map((r) => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);

  const boxplotGroups = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const gm = {};
    renamedRows.forEach((r) => {
      if (groupColIdx >= r.length || valueColIdx >= r.length) return;
      const g = r[groupColIdx],
        v = Number(r[valueColIdx]);
      if (r[valueColIdx] === "" || isNaN(v)) return;
      if (!gm[g]) gm[g] = {};
      if (colorByCol >= 0) {
        const cat = (colorByCol < r.length ? r[colorByCol] : null) || "?";
        if (!gm[g][cat]) gm[g][cat] = [];
        gm[g][cat].push(v);
      } else {
        if (!gm[g]["_all"]) gm[g]["_all"] = [];
        gm[g]["_all"].push(v);
      }
    });
    const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
    return effectiveOrder
      .filter((name) => gm[name])
      .map((name, gi) => {
        const catMap = gm[name];
        const sources = cats
          .filter((c) => catMap[c])
          .map((cat, si) => ({
            colIndex: si,
            values: catMap[cat],
            category: cat,
          }));
        const allValues = sources.flatMap((s) => s.values);
        return {
          name,
          sources,
          allValues,
          stats: { ...quartiles(allValues), ...computeStats(allValues) },
          color: boxplotColors[name] || PALETTE[gi % PALETTE.length],
        };
      });
  }, [
    renamedRows,
    groupColIdx,
    valueColIdx,
    boxplotColors,
    effectiveOrder,
    colorByCol,
    colorByCategories,
  ]);

  const allDisplayGroups = useMemo(
    () =>
      boxplotGroups.map((g) => ({
        ...g,
        displayName: plotGroupRenames[g.name] ?? g.name,
        enabled: !disabledGroups[g.name],
      })),
    [boxplotGroups, plotGroupRenames, disabledGroups]
  );

  const displayBoxplotGroups = useMemo(
    () => allDisplayGroups.filter((g) => g.enabled).map((g) => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );

  // Facet column candidates (same pool as colorBy). The natural order is the
  // first-seen order of unique values in the (renamed) data so it matches what
  // the user sees in the rename panel.
  const naturalFacetOrder = useMemo(() => {
    if (facetByCol < 0) return [];
    const seen = new Set();
    const order = [];
    renamedRows.forEach((r) => {
      const v = r[facetByCol];
      if (!seen.has(v)) {
        seen.add(v);
        order.push(v);
      }
    });
    return order;
  }, [facetByCol, renamedRows]);

  const effectiveFacetOrder = useMemo(() => {
    const stored = columnOrders[facetByCol];
    if (stored && stored.length > 0) {
      const valid = stored.filter((g) => naturalFacetOrder.includes(g));
      const missing = naturalFacetOrder.filter((g) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalFacetOrder;
  }, [columnOrders, facetByCol, naturalFacetOrder]);

  const facetByCategories = effectiveFacetOrder;

  // Every group/filter column (except the numeric value column) is
  // reorderable. Each column's natural order is first-seen in renamedRows,
  // any user-drag override is merged on top. Computed here so that reordering
  // works at the filter step — before the user has even chosen which column
  // feeds "Facet by" or "Color by" in the plot step.
  const orderableCols = useMemo(() => {
    const m = {};
    parsedHeaders.forEach((_, i) => {
      if (i === valueColIdx) return;
      if (colRoles[i] !== "group" && colRoles[i] !== "filter") return;
      const seen = new Set();
      const natural = [];
      renamedRows.forEach((r) => {
        const v = r[i];
        if (!seen.has(v)) {
          seen.add(v);
          natural.push(v);
        }
      });
      const stored = columnOrders[i];
      let order = natural;
      if (stored && stored.length > 0) {
        const valid = stored.filter((g) => natural.includes(g));
        const missing = natural.filter((g) => !stored.includes(g));
        order = [...valid, ...missing];
      }
      m[i] = { order, onReorder: (newOrder) => setOrderForCol(i, newOrder) };
    });
    return m;
  }, [parsedHeaders, colRoles, valueColIdx, renamedRows, columnOrders]);

  // Faceted groups: one boxplot per facet category
  const facetedData = useMemo(() => {
    if (facetByCol < 0) return [];
    const globalColorMap = {};
    boxplotGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    return facetByCategories.map((cat) => {
      const catRows = renamedRows.filter((r) => r[facetByCol] === cat);
      const gm = {};
      catRows.forEach((r) => {
        if (groupColIdx >= r.length || valueColIdx >= r.length) return;
        const g = r[groupColIdx],
          v = Number(r[valueColIdx]);
        if (r[valueColIdx] === "" || isNaN(v)) return;
        if (!gm[g]) gm[g] = {};
        if (colorByCol >= 0) {
          const cc = (colorByCol < r.length ? r[colorByCol] : null) || "?";
          if (!gm[g][cc]) gm[g][cc] = [];
          gm[g][cc].push(v);
        } else {
          if (!gm[g]["_all"]) gm[g]["_all"] = [];
          gm[g]["_all"].push(v);
        }
      });
      const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
      const groups = effectiveOrder
        .filter((name) => gm[name] && !disabledGroups[name])
        .map((name, gi) => {
          const catMap = gm[name];
          const sources = cats
            .filter((c) => catMap[c])
            .map((c, si) => ({
              colIndex: si,
              values: catMap[c],
              category: c,
            }));
          const allValues = sources.flatMap((s) => s.values);
          return {
            name,
            sources,
            allValues,
            stats: { ...quartiles(allValues), ...computeStats(allValues) },
            color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length],
          };
        });
      return { category: cat, groups };
    });
  }, [
    facetByCol,
    facetByCategories,
    colorByCol,
    colorByCategories,
    renamedRows,
    groupColIdx,
    valueColIdx,
    effectiveOrder,
    boxplotColors,
    boxplotGroups,
    disabledGroups,
  ]);

  // Subgrouped data: single plot with groups partitioned by subgroup column
  const subgroupedData = useMemo(() => {
    if (subgroupByCol < 0 || groupColIdx < 0 || valueColIdx < 0) return null;
    const sgOrder = orderableCols[subgroupByCol]?.order || [];
    if (sgOrder.length === 0) return null;
    const globalColorMap: Record<string, string> = {};
    boxplotGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
    const subgroups: Array<{ name: string; startIndex: number; count: number }> = [];
    const flatGroups: typeof boxplotGroups = [];
    let startIndex = 0;
    for (const sgCat of sgOrder) {
      const catRows = renamedRows.filter((r) => r[subgroupByCol] === sgCat);
      const gm: Record<string, Record<string, number[]>> = {};
      catRows.forEach((r) => {
        if (groupColIdx >= r.length || valueColIdx >= r.length) return;
        const g = r[groupColIdx],
          v = Number(r[valueColIdx]);
        if (r[valueColIdx] === "" || isNaN(v)) return;
        if (!gm[g]) gm[g] = {};
        if (colorByCol >= 0) {
          const cc = (colorByCol < r.length ? r[colorByCol] : null) || "?";
          if (!gm[g][cc]) gm[g][cc] = [];
          gm[g][cc].push(v);
        } else {
          if (!gm[g]["_all"]) gm[g]["_all"] = [];
          gm[g]["_all"].push(v);
        }
      });
      const groups = effectiveOrder
        .filter((name) => gm[name] && !disabledGroups[name])
        .map((name, gi) => {
          const catMap = gm[name];
          const sources = cats
            .filter((c) => catMap[c])
            .map((c, si) => ({
              colIndex: si,
              values: catMap[c],
              category: c,
            }));
          const allValues = sources.flatMap((s) => s.values);
          return {
            name,
            sources,
            allValues,
            stats: { ...quartiles(allValues), ...computeStats(allValues) },
            color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length],
          };
        });
      if (groups.length > 0) {
        subgroups.push({ name: sgCat, startIndex, count: groups.length });
        flatGroups.push(...groups);
        startIndex += groups.length;
      }
    }
    if (subgroups.length === 0) return null;
    return { subgroups, flatGroups };
  }, [
    subgroupByCol,
    orderableCols,
    renamedRows,
    groupColIdx,
    valueColIdx,
    colorByCol,
    colorByCategories,
    effectiveOrder,
    disabledGroups,
    boxplotColors,
    boxplotGroups,
  ]);

  // Merge per-subgroup annotation specs from the stats panel into a single
  // spec with offset indices so the shared chart renders CLD letters /
  // brackets across the flat axis.
  const mergedSubgroupAnnot = useMemo(() => {
    if (!subgroupedData) return null;
    const renamedFlat = subgroupedData.flatGroups.map((g) => ({
      ...g,
      name: plotGroupRenames[g.name] ?? g.name,
    }));
    return mergeSubgroupAnnotations(
      subgroupedData.subgroups,
      renamedFlat,
      statsUi.subgroupAnnotSpecs
    );
  }, [subgroupedData, statsUi.subgroupAnnotSpecs, plotGroupRenames]);
  // The non-facet chart gets a single annotation spec and a single summary
  // line chosen by the active mode.
  const chartAnnotations =
    subgroupByCol >= 0 && subgroupedData ? mergedSubgroupAnnot : statsUi.flatAnnotation;
  const chartSummary = subgroupByCol >= 0 && subgroupedData ? null : statsUi.flatSummary;

  const toggleFilter = (ci, v) =>
    setFilters((p) => {
      const f = { ...p },
        s = new Set(f[ci].included);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      f[ci] = { ...f[ci], included: s };
      return f;
    });

  const toggleAllFilter = (ci, all) =>
    setFilters((p) => {
      const f = { ...p };
      f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : new Set() };
      return f;
    });

  const setRenameVal = (ci, ov, nv) =>
    setValueRenames((p) => {
      const r = { ...p };
      if (!r[ci]) r[ci] = {};
      r[ci] = { ...r[ci], [ov]: nv };
      return r;
    });

  // Group Plot has exactly one x-axis grouping column and one numeric value
  // column, so "group" and "value" are exclusive roles. Picking either on a
  // new column demotes any previous column with the same role to "filter"
  // instead of silently ending up with two columns whose role select says
  // the same thing but only the first one actually drives the plot
  // (valueColIdx / groupColIdx are both `colRoles.indexOf(...)`).
  const updateRole = (i: number, role: ColumnRole) =>
    setColRoles((p) =>
      p.map((r, j) => {
        if (j === i) return role;
        if ((role === "group" || role === "value") && r === role) return "filter";
        return r;
      })
    );
  const updateColName = (i, nm) => setColNames((p) => p.map((n, j) => (j === i ? nm : n)));

  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;

  const valueColIsNumeric = useMemo(() => {
    if (valueColIdx < 0 || !parsedRows.length) return false;
    const vals = parsedRows.map((r) => r[valueColIdx] ?? "").filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
  }, [parsedRows, valueColIdx]);

  const canPlot =
    groupColIdx >= 0 && valueColIdx >= 0 && valueColIsNumeric && boxplotGroups.length > 0;
  const handleToggleGroup = (i) => {
    const name = boxplotGroups[i].name;
    setDisabledGroups((p) => ({ ...p, [name]: !p[name] }));
  };

  const fileStem = `${fileBaseName(fileName, "groupplot")}_groupplot`;
  const handleDownloadSvg = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) =>
        downloadSvg(facetRefs.current[fd.category], `${fileStem}_${fd.category}.svg`)
      );
    } else {
      downloadSvg(chartRef.current, `${fileStem}.svg`);
    }
  }, [facetByCol, facetedData, fileStem]);

  const handleDownloadPng = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) =>
        downloadPng(facetRefs.current[fd.category], `${fileStem}_${fd.category}.png`)
      );
    } else {
      downloadPng(chartRef.current, `${fileStem}.png`);
    }
  }, [facetByCol, facetedData, fileStem]);

  return (
    <PlotToolShell
      state={shell}
      toolName="boxplot"
      title="Group Plot"
      subtitle={`Load → label columns → filter → plot & export${dataFormat === "wide" ? " · Wide format auto-detected" : ""}`}
      visInit={VIS_INIT_BOXPLOT}
      steps={["upload", "configure", "filter", "output", "plot"]}
      canNavigate={(s) => s === "upload" || parsedRows.length > 0}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          onSepChange={setSepOverride}
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          setStep={setStep}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && parsedRows.length > 0 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          hasHeader={hasHeader}
          colRoles={colRoles}
          colNames={colNames}
          valueColIdx={valueColIdx}
          valueColIsNumeric={valueColIsNumeric}
          onRoleChange={updateRole}
          onNameChange={updateColName}
          setStep={setStep}
        />
      )}

      {step === "filter" && parsedRows.length > 0 && (
        <FilterStep
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          colRoles={colRoles}
          colNames={colNames}
          filters={filters}
          filteredRows={filteredRows}
          renamedRows={renamedRows}
          activeColIdxs={activeColIdxs}
          valueRenames={valueRenames}
          orderableCols={orderableCols}
          applyRename={applyRename}
          toggleFilter={toggleFilter}
          toggleAllFilter={toggleAllFilter}
          setRenameVal={setRenameVal}
          dragState={dragState}
          setDragState={setDragState}
          canPlot={canPlot}
          setStep={setStep}
        />
      )}

      {step === "output" && parsedRows.length > 0 && (
        <OutputStep
          colNames={colNames}
          groupColIdx={groupColIdx}
          valueColIdx={valueColIdx}
          valueColIsNumeric={valueColIsNumeric}
          stats={stats}
          renamedRows={renamedRows}
          activeColIdxs={activeColIdxs}
          wideData={wideData}
          fileName={fileName}
          canPlot={canPlot}
          setStep={setStep}
        />
      )}

      {step === "plot" && canPlot && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <PlotControls
            dataFormat={dataFormat}
            setDataFormat={setDataFormat}
            setStep={setStep}
            resetAll={resetAll}
            allDisplayGroups={allDisplayGroups}
            boxplotGroups={boxplotGroups}
            renamedRows={renamedRows}
            setPlotGroupRenames={setPlotGroupRenames}
            setBoxplotColors={setBoxplotColors}
            onToggleGroup={handleToggleGroup}
            vis={vis}
            updVis={updVis}
            colorByCol={colorByCol}
            setColorByCol={setColorByCol}
            colorByCandidates={colorByCandidates}
            colNames={colNames}
            categoryColors={categoryColors}
            setCategoryColors={setCategoryColors}
            colorByCategories={colorByCategories}
            facetByCol={facetByCol}
            setFacetByCol={handleSetFacetByCol}
            subgroupByCol={subgroupByCol}
            setSubgroupByCol={handleSetSubgroupByCol}
            onDownloadSvg={handleDownloadSvg}
            onDownloadPng={handleDownloadPng}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {vis.yScale !== "linear" &&
              boxplotGroups.some((g) => g.allValues.some((v) => v <= 0)) && (
                <div
                  style={{
                    background: "var(--warning-bg)",
                    color: "var(--warning-text)",
                    border: "1px solid var(--warning-border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  Some values are &le; 0 and cannot be shown on a{" "}
                  {vis.yScale === "log10"
                    ? "log\u2081\u2080"
                    : vis.yScale === "log2"
                      ? "log\u2082"
                      : "ln"}{" "}
                  scale.
                </div>
              )}
            {facetByCol < 0 ? (
              <>
                <PlotArea
                  colorByCol={colorByCol}
                  colorByCategories={colorByCategories}
                  colNames={colNames}
                  categoryColors={categoryColors}
                  facetByCol={facetByCol}
                  facetedData={facetedData}
                  chartRef={chartRef}
                  displayBoxplotGroups={
                    subgroupByCol >= 0 && subgroupedData
                      ? subgroupedData.flatGroups.map((g) => ({
                          ...g,
                          name: plotGroupRenames[g.name] ?? g.name,
                          color: boxplotColors[g.name] ?? g.color,
                        }))
                      : displayBoxplotGroups
                  }
                  vis={vis}
                  yMinVal={yMinVal}
                  yMaxVal={yMaxVal}
                  chartAnnotations={chartAnnotations}
                  chartSummary={chartSummary}
                  subgroups={subgroupByCol >= 0 && subgroupedData ? subgroupedData.subgroups : null}
                  subgroupSummaries={subgroupByCol >= 0 ? statsUi.subgroupSummaries : null}
                />
                {subgroupByCol >= 0 && subgroupedData
                  ? (() => {
                      const sets = subgroupedData.subgroups
                        .map((sg) => {
                          const sgGroups = subgroupedData.flatGroups.slice(
                            sg.startIndex,
                            sg.startIndex + sg.count
                          );
                          return {
                            key: sg.name,
                            name: sg.name,
                            groups: sgGroups.map((g) => ({
                              name: plotGroupRenames[g.name] ?? g.name,
                              values: g.allValues,
                            })),
                          };
                        })
                        .filter((s) => s.groups.length >= 2);
                      if (sets.length === 0) return null;
                      return (
                        <BoxplotStatsPanel
                          key="stats-panel-subgroup"
                          sets={sets}
                          setLabel="Subgroup"
                          fileStem={fileStem}
                          onAnnotationForKey={(key, spec) =>
                            dispatchStats({ type: "setSubgroupAnnotSpec", key, value: spec })
                          }
                          onSummaryForKey={(key, txt) =>
                            dispatchStats({ type: "setSubgroupSummary", key, value: txt })
                          }
                          displayMode={statsUi.displayMode}
                          onDisplayModeChange={handleStatsDisplayModeChange}
                          showNs={statsUi.showNs}
                          onShowNsChange={setStatsShowNs}
                          showSummary={statsUi.showSummary}
                          onShowSummaryChange={handleStatsShowSummaryChange}
                          errorBarLabel={
                            vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null
                          }
                        />
                      );
                    })()
                  : displayBoxplotGroups.length >= 2 && (
                      <BoxplotStatsPanel
                        key="stats-panel-flat"
                        sets={[
                          {
                            key: "flat",
                            name: "",
                            groups: displayBoxplotGroups.map((g) => ({
                              name: g.name,
                              values: g.allValues,
                            })),
                          },
                        ]}
                        setLabel=""
                        fileStem={`${fileStem}_stats`}
                        singletonAutoExpand
                        onAnnotationForKey={(_key, spec) => setFlatStatsAnnotation(spec)}
                        onSummaryForKey={(_key, txt) => setFlatStatsSummary(txt)}
                        displayMode={statsUi.displayMode}
                        onDisplayModeChange={handleStatsDisplayModeChange}
                        showNs={statsUi.showNs}
                        onShowNsChange={setStatsShowNs}
                        showSummary={statsUi.showSummary}
                        onShowSummaryChange={handleStatsShowSummaryChange}
                        errorBarLabel={
                          vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null
                        }
                      />
                    )}
              </>
            ) : (
              <>
                <FacetPlotList
                  facetedData={facetedData}
                  facetRefs={facetRefs}
                  vis={vis}
                  yMinVal={yMinVal}
                  yMaxVal={yMaxVal}
                  plotGroupRenames={plotGroupRenames}
                  boxplotColors={boxplotColors}
                  categoryColors={categoryColors}
                  colorByCol={colorByCol}
                  colorByCategories={colorByCategories}
                  colNames={colNames}
                  facetStatsAnnotations={statsUi.facetAnnotations}
                  facetStatsSummary={statsUi.facetSummaries}
                />
                {facetedData && facetedData.length > 0 && (
                  <BoxplotStatsPanel
                    key="stats-panel-facet"
                    sets={facetedData
                      .filter((fd) => fd.groups.length >= 2)
                      .map((fd) => ({
                        key: fd.category,
                        name: fd.category,
                        groups: fd.groups.map((g) => ({
                          name: plotGroupRenames[g.name] ?? g.name,
                          values: g.allValues,
                        })),
                      }))}
                    setLabel="Facet"
                    fileStem={fileStem}
                    onAnnotationForKey={(key, spec) => setAnnotationsFor(key, spec)}
                    onSummaryForKey={(key, txt) => setSummaryFor(key, txt)}
                    displayMode={statsUi.displayMode}
                    onDisplayModeChange={handleStatsDisplayModeChange}
                    showNs={statsUi.showNs}
                    onShowNsChange={setStatsShowNs}
                    showSummary={statsUi.showSummary}
                    onShowSummaryChange={handleStatsShowSummaryChange}
                    errorBarLabel={vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {step === "plot" && !canPlot && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            ⚠ Assign <strong>group</strong> + <strong>value</strong> columns and ensure filters keep
            data.
          </p>
          <button
            onClick={() => setStep("configure")}
            className="dv-btn dv-btn-secondary"
            style={{ marginTop: 8 }}
          >
            ← Configure
          </button>
        </div>
      )}
    </PlotToolShell>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Boxplot">
    <App />
  </ErrorBoundary>
);
