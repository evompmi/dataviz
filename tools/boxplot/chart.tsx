// BoxplotChart (forwardRef SVG renderer) and its stats-summary SVG helpers.
// Split out of tools/boxplot.tsx as part of the folder-split refactor — pure
// React/SVG; no state, no side effects. Its only sibling-module dependency is
// the constants in ./helpers (STATS_LINE_H / STATS_FONT / statsSummaryHeight),
// which keep the font-size and line-height arithmetic testable.

import { STATS_LINE_H, STATS_FONT, statsSummaryHeight } from "./helpers";

const { forwardRef, useRef } = React;

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

export const BoxplotChart = forwardRef<SVGSVGElement, any>(function BoxplotChart(
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
