// boxplot.jsx — editable source. Run `npm run build` to compile to boxplot.js
// Do NOT edit the .js file directly.
const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef, memo } = React;

// ── Stats summary SVG helper ──────────────────────────────────────────────
const STATS_LINE_H = 11;
const STATS_FONT = 8;
function statsSummaryHeight(summary: string | null): number {
  if (!summary) return 0;
  return summary.split("\n").length * STATS_LINE_H + 14; // 14 = top/bottom padding
}
function renderStatsSummary(summary: string | null, y: number, x: number) {
  if (!summary) return null;
  const lines = summary.split("\n");
  return (
    <g id="stats-summary">
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={y + 10 + i * STATS_LINE_H}
          fontSize={STATS_FONT}
          fill="#aaa"
          fontFamily="monospace"
        >
          {line}
        </text>
      ))}
    </g>
  );
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
  },
  ref
) {
  const angle = xLabelAngle || 0;
  const absA = Math.abs(angle);
  const pieSpace = cbc >= 0 && showCompPie ? 60 : 0;
  const botM = 60 + (absA > 0 ? absA * 0.8 : 0) + pieSpace;

  // Precompute annotation layout. We reserve headroom *inside* the plot
  // frame — the frame position is fixed; instead we extend yMax so that data
  // doesn't reach the top of the inner area, and draw annotations in that
  // headroom.
  const annotPairs =
    annotations && annotations.kind === "brackets"
      ? assignBracketLevels(annotations.pairs || [])
      : [];
  const annotMaxLevel = annotPairs.reduce((m, pr) => Math.max(m, pr._level || 0), 0);
  const annotTopPad =
    annotations && annotations.kind === "cld"
      ? 22
      : annotations && annotations.kind === "brackets" && annotPairs.length > 0
        ? (annotMaxLevel + 1) * 20 + 6
        : 0;
  const M = { top: 24, right: 24, bottom: botM, left: 62 };

  const allV = groups.flatMap((g) => g.allValues);
  if (allV.length === 0) return null;

  let dMin = Math.min(...allV);
  let dMax = Math.max(...allV);
  if (plotStyle === "violin" || plotStyle === "raincloud") {
    for (const g of groups) {
      if (g.allValues.length >= 2) {
        const pts = kde(g.allValues, 60);
        const kMin = pts[0].x,
          kMax = pts[pts.length - 1].x;
        if (kMin < dMin) dMin = kMin;
        if (kMax > dMax) dMax = kMax;
      }
    }
  }
  const pad = (dMax - dMin) * 0.08 || 1;
  const yMin = yMinP != null ? yMinP : dMin - pad;
  let yMax = yMaxP != null ? yMaxP : dMax + pad;

  const n = groups.length;
  const compact = (100 - (boxGap != null ? boxGap : 0)) / 100;
  const vbW = Math.max(200, n * 100 * compact + M.left + M.right);
  const vbH_base = 504 + (absA > 0 ? absA * 0.8 : 0);
  const _legH = computeLegendHeight(svgLegend, vbW - M.left - M.right, 88);
  const _statsH = statsSummaryHeight(statsSummary);
  // Keep the overall viewBox height independent of the stats summary —
  // shrink the chart area to make room instead, so the plot tile stays
  // the same size when the summary is toggled on.
  const vbH_chart = vbH_base - _statsH;
  const vbH = vbH_base + _legH;
  const w = vbW - M.left - M.right;
  const h = vbH_chart - M.top - M.bottom;

  // Extend yMax upward so annotations fit inside the frame without overlapping data.
  if (annotTopPad > 0 && h > annotTopPad + 10) {
    yMax = yMin + ((yMax - yMin) * h) / (h - annotTopPad);
  }

  const bandW = w / n;
  const bx = (i) => M.left + i * bandW + bandW / 2;
  const sy = (v) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * h;
  const yTicks = makeTicks(yMin, yMax, 8);
  const halfBox = (boxWidth / 100) * bandW * 0.4;

  const pointColor = (g, src, si) => {
    if (cbc >= 0 && catCols && src.category)
      return catCols[src.category] || getPointColors(g.color, g.sources.length)[si] || g.color;
    return getPointColors(g.color, g.sources.length)[si] || g.color;
  };

  const renderCompPie = (g, lx) => {
    if (cbc < 0 || !g.sources || !showCompPie) return null;
    const total = g.allValues.length;
    if (!total) return null;
    const r = 20;
    const cy2 = vbH_chart - r - 12;
    let cum = 0;

    const slices = g.sources.map((src, si) => {
      const pct = src.values.length / total;
      const a0 = cum * Math.PI * 2;
      const a1 = (cum + pct) * Math.PI * 2;
      cum += pct;
      const col = catCols && src.category ? catCols[src.category] || "#999" : "#999";
      if (pct >= 1)
        return (
          <circle key={si} cx={lx} cy={cy2} r={r} fill={col} stroke="#000" strokeWidth="0.5" />
        );
      const x0 = lx + Math.sin(a0) * r;
      const y0 = cy2 - Math.cos(a0) * r;
      const x1 = lx + Math.sin(a1) * r;
      const y1 = cy2 - Math.cos(a1) * r;
      const lg = pct > 0.5 ? 1 : 0;
      return (
        <path
          key={si}
          d={`M${lx},${cy2}L${x0},${y0}A${r},${r},0,${lg},1,${x1},${y1}Z`}
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
          x={lx + Math.sin(midA) * lr}
          y={cy2 - Math.cos(midA) * lr + 3}
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
      <g key={`cb-${g.name}`}>
        {slices}
        <circle cx={lx} cy={cy2} r={r} fill="none" stroke="#000" strokeWidth="0.5" />
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
      aria-label={plotTitle || "Box plot"}
    >
      <title>{plotTitle || "Box plot"}</title>
      <desc>{`Box plot with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`}</desc>

      <rect id="plot-area-background" x={M.left} y={M.top} width={w} height={h} fill={plotBg} />

      {showGrid && (
        <g id="grid">
          {yTicks.map((t) => (
            <line
              key={t}
              x1={M.left}
              x2={M.left + w}
              y1={sy(t)}
              y2={sy(t)}
              stroke={gridColor}
              strokeWidth="0.5"
            />
          ))}
        </g>
      )}

      <g id="axis-y">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left - 5} x2={M.left} y1={sy(t)} y2={sy(t)} stroke="#333" strokeWidth="1" />
            <text
              x={M.left - 8}
              y={sy(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#555"
              fontFamily="sans-serif"
            >
              {Math.abs(t) < 0.01 && t !== 0 ? t.toExponential(1) : t % 1 === 0 ? t : t.toFixed(2)}
            </text>
          </g>
        ))}
      </g>

      <g id="groups">
        {groups.map((g, gi) => {
          if (!g.stats) return null;
          const cx = bx(gi);
          const { q1, med, q3, wLo, wHi } = g.stats;
          const isRain = plotStyle === "raincloud";
          const isViolin = plotStyle === "violin" || isRain;

          /* ── Violin / raincloud KDE shape ── */
          let violinPath = null;
          if (isViolin && g.allValues.length >= 2) {
            const pts = kde(g.allValues, 60);
            const maxD = Math.max(...pts.map((p) => p.d));
            if (maxD > 0) {
              const sc = (d) => (d / maxD) * halfBox;
              if (isRain) {
                // Half-violin on the left side only
                let d = `M ${cx},${sy(pts[0].x)}`;
                for (const p of pts) d += ` L ${cx - sc(p.d)},${sy(p.x)}`;
                d += ` L ${cx},${sy(pts[pts.length - 1].x)} Z`;
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
                // Full symmetric violin
                let d = `M ${cx - sc(pts[0].d)},${sy(pts[0].x)}`;
                for (const p of pts) d += ` L ${cx - sc(p.d)},${sy(p.x)}`;
                d += ` L ${cx + sc(pts[pts.length - 1].d)},${sy(pts[pts.length - 1].x)}`;
                for (let i = pts.length - 1; i >= 0; i--)
                  d += ` L ${cx + sc(pts[i].d)},${sy(pts[i].x)}`;
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
          const boxEls = (
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
                    key={`${g.name}-${si}-${vi}`}
                    cx={cx + j}
                    cy={sy(v)}
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
                  key={`out-${g.name}-${si}-${oi}`}
                  cx={outlierCx}
                  cy={sy(v)}
                  r={2.5}
                  fill="#000"
                  fillOpacity={0.8}
                  stroke="none"
                />
              ))
          );

          return (
            <g
              key={g.name}
              id={`group-${svgSafeId(g.name)}`}
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

      <g id="axis-x">
        {groups.map((g, gi) => {
          const lx = bx(gi);
          const ly = M.top + h + 16;
          const compBar = renderCompPie(g, lx);
          return (
            <React.Fragment key={`xl-${g.name}`}>
              {angle === 0 ? (
                <g>
                  <text
                    x={lx}
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
                    x={lx}
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
                <g transform={`rotate(${angle},${lx},${ly})`}>
                  <text
                    x={lx}
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
                    x={lx}
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

      {annotations && annotations.kind === "cld" && (
        <g id="cld-annotations">
          {(annotations.labels || []).map((lbl, gi) => (
            <text
              key={`cld-${gi}`}
              x={bx(gi)}
              y={M.top + 15}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#222"
              fontFamily="sans-serif"
            >
              {lbl}
            </text>
          ))}
        </g>
      )}

      {annotations && annotations.kind === "brackets" && (
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
      )}

      {yLabel && (
        <g id="y-axis-label">
          <text
            transform={`translate(14,${M.top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="13"
            fill="#444"
            fontFamily="sans-serif"
          >
            {yLabel}
          </text>
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
      {renderStatsSummary(statsSummary, vbH_chart + _legH, M.left)}
    </svg>
  );
});

// ── Bar Chart ──────────────────────────────────────────────────────────────

const BarChart = forwardRef<SVGSVGElement, any>(function BarChart(
  {
    groups,
    yLabel,
    plotTitle,
    plotBg,
    showGrid,
    gridColor,
    barWidth,
    pointSize,
    showPoints,
    jitterWidth,
    pointOpacity,
    xLabelAngle,
    errorType,
    barOpacity,
    yMin: yMinProp,
    yMax: yMaxProp,
    catColors,
    errStrokeWidth,
    showBarOutline,
    barOutlineWidth,
    barOutlineColor,
    boxGap,
    svgLegend,
    annotations,
    statsSummary,
  },
  ref
) {
  const angle = xLabelAngle || 0;
  const bottomMargin = 60 + Math.abs(angle) * 0.9;

  const annotPairs =
    annotations && annotations.kind === "brackets"
      ? assignBracketLevels(annotations.pairs || [])
      : [];
  const annotMaxLevel = annotPairs.reduce((m, pr) => Math.max(m, pr._level || 0), 0);
  const annotTopPad =
    annotations && annotations.kind === "cld"
      ? 22
      : annotations && annotations.kind === "brackets" && annotPairs.length > 0
        ? (annotMaxLevel + 1) * 20 + 6
        : 0;
  const MChart = { top: 24, right: 24, bottom: bottomMargin, left: 62 };

  const allVals = groups.flatMap((g) => g.allValues);
  if (allVals.length === 0) return null;

  let dataMax = 0;
  let dataMin = 0;
  groups.forEach((g) => {
    if (!g.stats) return;
    const errVal = errorType === "sd" ? g.stats.sd : g.stats.sem;
    const top = g.stats.mean + errVal;
    const bot = g.stats.mean - errVal;
    if (top > dataMax) dataMax = top;
    if (bot < dataMin) dataMin = bot;
    if (g.stats.max > dataMax) dataMax = g.stats.max;
    if (g.stats.min < dataMin) dataMin = g.stats.min;
  });

  const pad = (dataMax - dataMin) * 0.08 || 1;
  const yMin = yMinProp != null ? yMinProp : dataMin >= 0 ? 0 : dataMin - pad;
  let yMax = yMaxProp != null ? yMaxProp : dataMax + pad;

  const n = groups.length;
  const compact = (100 - (boxGap != null ? boxGap : 0)) / 100;
  const vbW = Math.max(200, n * 100 * compact + MChart.left + MChart.right);
  const vbH_base = 420 + Math.abs(angle) * 0.9;
  const legendH = computeLegendHeight(svgLegend, vbW - MChart.left - MChart.right, 88);
  const _statsH = statsSummaryHeight(statsSummary);
  // Keep the overall viewBox height independent of the stats summary —
  // shrink the chart area to make room instead.
  const vbH_chart = vbH_base - _statsH;
  const vbH = vbH_base + legendH;
  const w = vbW - MChart.left - MChart.right;
  const h = vbH_chart - MChart.top - MChart.bottom;

  if (annotTopPad > 0 && h > annotTopPad + 10) {
    yMax = yMin + ((yMax - yMin) * h) / (h - annotTopPad);
  }

  const bandW = w / n;
  const bx = (i) => MChart.left + i * bandW + bandW / 2;
  const sy = (v) => MChart.top + (1 - (v - yMin) / (yMax - yMin || 1)) * h;

  const yTicks = makeTicks(yMin, yMax, 8);
  const halfBar = (barWidth / 100) * bandW * 0.4;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${vbW} ${vbH}`}
      style={{ width: vbW, maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Bar chart"}
    >
      <title>{plotTitle || "Bar chart"}</title>
      <desc>{`Bar chart with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`}</desc>
      <rect
        id="plot-area-background"
        x={MChart.left}
        y={MChart.top}
        width={w}
        height={h}
        fill={plotBg}
      />

      {showGrid && (
        <g id="grid">
          {yTicks.map((t) => (
            <line
              key={t}
              x1={MChart.left}
              x2={MChart.left + w}
              y1={sy(t)}
              y2={sy(t)}
              stroke={gridColor}
              strokeWidth="0.5"
            />
          ))}
        </g>
      )}

      <g id="axis-y">
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={MChart.left - 5}
              x2={MChart.left}
              y1={sy(t)}
              y2={sy(t)}
              stroke="#333"
              strokeWidth="1"
            />
            <text
              x={MChart.left - 8}
              y={sy(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#555"
              fontFamily="sans-serif"
            >
              {Math.abs(t) < 0.01 && t !== 0 ? t.toExponential(1) : t % 1 === 0 ? t : t.toFixed(2)}
            </text>
          </g>
        ))}
      </g>

      <g id="bars">
        {groups.map((g, gi) => {
          if (!g.stats) return null;
          const cx = bx(gi);
          const { mean, sd, sem } = g.stats;
          if (mean < yMin || mean > yMax) return null;
          const errVal = errorType === "sd" ? sd : sem;
          const baseline = sy(Math.max(0, yMin));
          const barTop = sy(mean);
          const yBar = mean >= 0 ? barTop : baseline;
          const barH = mean >= 0 ? baseline - barTop : sy(mean) - baseline;

          return (
            <g
              key={g.name}
              id={`bar-${svgSafeId(g.name)}`}
              role="group"
              aria-label={`${g.name}: mean ${mean.toFixed(2)}, ${errorType === "sd" ? "SD" : "SEM"} ${errVal.toFixed(2)}, n=${g.stats.n}`}
            >
              <rect
                x={cx - halfBar}
                y={yBar}
                width={halfBar * 2}
                height={Math.max(0, barH)}
                fill={g.color}
                fillOpacity={barOpacity}
                stroke={showBarOutline ? barOutlineColor || g.color : "none"}
                strokeWidth={showBarOutline ? barOutlineWidth || 1.5 : 0}
                rx="1"
              />
              <line
                x1={cx}
                x2={cx}
                y1={sy(mean + errVal)}
                y2={sy(mean - errVal)}
                stroke="#333"
                strokeWidth={errStrokeWidth || 1.2}
              />
              <line
                x1={cx - halfBar * 0.4}
                x2={cx + halfBar * 0.4}
                y1={sy(mean + errVal)}
                y2={sy(mean + errVal)}
                stroke="#333"
                strokeWidth={errStrokeWidth || 1.2}
              />
              <line
                x1={cx - halfBar * 0.4}
                x2={cx + halfBar * 0.4}
                y1={sy(mean - errVal)}
                y2={sy(mean - errVal)}
                stroke="#333"
                strokeWidth={errStrokeWidth || 1.2}
              />

              {showPoints &&
                g.sources.map((src, si) => {
                  const rng = seededRandom(gi * 1000 + si * 100 + 42);
                  const ptColors = getPointColors(g.color, g.sources.length);
                  const cat = src.category;
                  const ptColor =
                    catColors && cat && catColors[cat] ? catColors[cat] : ptColors[si] || g.color;
                  return src.values.map((v, vi) => {
                    const jitter = (rng() - 0.5) * jitterWidth * halfBar * 2;
                    return (
                      <circle
                        key={`${g.name}-${si}-${vi}`}
                        cx={cx + jitter}
                        cy={sy(v)}
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
        })}
      </g>

      <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
        <line
          id="plot-frame-top"
          x1={MChart.left}
          y1={MChart.top}
          x2={MChart.left + w}
          y2={MChart.top}
        />
        <line
          id="plot-frame-right"
          x1={MChart.left + w}
          y1={MChart.top}
          x2={MChart.left + w}
          y2={MChart.top + h}
        />
        <line
          id="plot-frame-bottom"
          x1={MChart.left}
          y1={MChart.top + h}
          x2={MChart.left + w}
          y2={MChart.top + h}
        />
        <line
          id="plot-frame-left"
          x1={MChart.left}
          y1={MChart.top}
          x2={MChart.left}
          y2={MChart.top + h}
        />
      </g>

      {annotations && annotations.kind === "cld" && (
        <g id="cld-annotations">
          {(annotations.labels || []).map((lbl, gi) => (
            <text
              key={`cld-${gi}`}
              x={bx(gi)}
              y={MChart.top + 15}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#222"
              fontFamily="sans-serif"
            >
              {lbl}
            </text>
          ))}
        </g>
      )}

      {annotations && annotations.kind === "brackets" && (
        <g id="significance-brackets">
          {annotPairs.map((pr, idx) => {
            const x1 = bx(pr.i);
            const x2 = bx(pr.j);
            const lvl = pr._level || 0;
            const yLine = MChart.top + annotTopPad - 6 - lvl * 20;
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
      )}

      <g id="axis-x">
        {groups.map((g, gi) => {
          const lx = bx(gi);
          const ly = MChart.top + h + 8;
          const angled = angle !== 0;
          return (
            <g
              key={`xl-${g.name}`}
              id={`xlabel-${svgSafeId(g.name)}`}
              transform={`translate(${lx},${ly}) rotate(${angle})`}
            >
              <text
                x={0}
                y={0}
                textAnchor={angled ? "end" : "middle"}
                dominantBaseline={angled ? "middle" : "hanging"}
                fontSize="11"
                fill="#333"
                fontFamily="sans-serif"
                fontWeight="600"
              >
                {g.name}
              </text>
              <text
                x={0}
                y={14}
                textAnchor={angled ? "end" : "middle"}
                dominantBaseline={angled ? "middle" : "hanging"}
                fontSize="9"
                fill="#999"
                fontFamily="sans-serif"
              >{`n=${g.stats?.n || 0}`}</text>
            </g>
          );
        })}
      </g>

      {yLabel && (
        <g id="y-axis-label">
          <text
            transform={`translate(14,${MChart.top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="13"
            fill="#444"
            fontFamily="sans-serif"
          >
            {yLabel}
          </text>
        </g>
      )}

      {plotTitle && (
        <g id="title">
          <text
            x={MChart.left + w / 2}
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
      {renderSvgLegend(
        svgLegend,
        vbH_chart + 10,
        MChart.left,
        vbW - MChart.left - MChart.right,
        88,
        14
      )}
      {renderStatsSummary(statsSummary, vbH_chart + legendH, MChart.left)}
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
          border: "2px solid #648FFF",
          boxShadow: "0 4px 20px rgba(100,143,255,0.12)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,#4a6cf7,#648FFF)",
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
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>
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
                color: "#2EC4B6",
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
                color: "#E07B39",
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#E07B39", flexShrink: 0 }}>
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
      <button onClick={() => setStep("filter")} className="dv-btn dv-btn-primary">
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
          <button onClick={() => setStep("plot")} className="dv-btn dv-btn-plot">
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
            onClick={(e) => {
              downloadCsv(
                activeColIdxs.map((i) => colNames[i]),
                renamedRows.map((r) => activeColIdxs.map((i) => r[i])),
                `sanitized_long_${fileName.replace(/\.[^.]+$/, "")}.csv`
              );
              flashSaved(e.currentTarget);
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 12,
              cursor: "pointer",
              background: "var(--success-bg)",
              border: "1px solid #86efac",
              color: "var(--success-text)",
              fontFamily: "inherit",
              fontWeight: 600,
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
              onClick={(e) => {
                downloadCsv(
                  wideData.headers,
                  wideData.rows,
                  `sanitized_wide_${fileName.replace(/\.[^.]+$/, "")}.csv`
                );
                flashSaved(e.currentTarget);
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                background: "var(--success-bg)",
                border: "1px solid #86efac",
                color: "var(--success-text)",
                fontFamily: "inherit",
                fontWeight: 600,
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
          <button onClick={() => setStep("plot")} className="dv-btn dv-btn-plot">
            Plot →
          </button>
        )}
      </div>
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
        width: 328,
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
      <div className="dv-panel" style={{ marginBottom: 0 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Conditions
        </p>
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
      </div>

      {/* Style controls */}
      <div
        className="dv-panel"
        style={{
          padding: 12,
          marginBottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 9,
        }}
      >
        <div>
          <div className="dv-label">Plot style</div>
          <select
            value={vis.plotStyle}
            onChange={(e) => updVis({ plotStyle: e.target.value })}
            className="dv-input"
            style={{ cursor: "pointer", fontSize: 11, width: "100%" }}
          >
            <option value="box">Box plot</option>
            <option value="violin">Violin plot</option>
            <option value="raincloud">Raincloud plot</option>
            <option value="bar">Bar chart (mean ± error)</option>
          </select>
        </div>
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
              <span className="dv-label">Error bars</span>
              <select
                value={vis.errorType}
                onChange={(e) => updVis({ errorType: e.target.value })}
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontFamily: "inherit",
                  color: "var(--text)",
                  cursor: "pointer",
                  marginTop: 2,
                }}
              >
                <option value="sem">SEM</option>
                <option value="sd">SD</option>
              </select>
            </div>
            <SliderControl
              label="Error bar stroke"
              value={vis.errStrokeWidth}
              displayValue={vis.errStrokeWidth.toFixed(1)}
              min={0.5}
              max={4}
              step={0.1}
              onChange={sv("errStrokeWidth")}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="dv-label">Bar outline</span>
              <input
                type="checkbox"
                checked={vis.showBarOutline}
                onChange={(e) => updVis({ showBarOutline: e.target.checked })}
                style={{ accentColor: "var(--accent-primary)" }}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="dv-label">Points</span>
          <input
            type="checkbox"
            checked={vis.showPoints}
            onChange={(e) => updVis({ showPoints: e.target.checked })}
            style={{ accentColor: "var(--accent-primary)" }}
          />
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
            {colorByCol >= 0 && vis.plotStyle !== "bar" && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  paddingLeft: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={vis.showCompPie}
                  onChange={(e) => updVis({ showCompPie: e.target.checked })}
                />
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Composition pies</span>
              </label>
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
        <SliderControl
          label="X angle"
          value={vis.xLabelAngle}
          displayValue={vis.xLabelAngle + "°"}
          min={-90}
          max={0}
          step={5}
          onChange={sv("xLabelAngle")}
        />
        <div>
          <div className="dv-label">Facet by</div>
          <select
            value={facetByCol}
            onChange={(e) => setFacetByCol(Number(e.target.value))}
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
      </div>

      {/* Plot params */}
      <div
        className="dv-panel"
        style={{
          padding: 12,
          marginBottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
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
      </div>
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
      {chartProps.plotStyle === "bar" ? (
        <BarChart
          ref={localRef}
          {...chartProps}
          barWidth={chartProps.boxWidth}
          catColors={chartProps.categoryColors}
        />
      ) : (
        <BoxplotChart ref={localRef} {...chartProps} />
      )}
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
  facetRefs,
  chartRef,
  displayBoxplotGroups,
  vis,
  yMinVal,
  yMaxVal,
  plotGroupRenames,
  boxplotColors,
  facetStatsAnnotations,
  facetStatsSummary,
}) {
  const globalAnnotations = facetStatsAnnotations["_global"] || null;
  const globalSummary = facetStatsSummary["_global"] || null;
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
          {vis.plotStyle === "bar" ? (
            <BarChart
              ref={chartRef}
              groups={displayBoxplotGroups}
              yLabel={vis.yLabel}
              plotTitle={vis.plotTitle}
              plotBg={vis.plotBg}
              showGrid={vis.showGrid}
              gridColor={vis.gridColor}
              barWidth={vis.boxWidth}
              barOpacity={vis.barOpacity}
              pointSize={vis.pointSize}
              showPoints={vis.showPoints}
              jitterWidth={vis.jitterWidth}
              pointOpacity={vis.pointOpacity}
              xLabelAngle={vis.xLabelAngle}
              errorType={vis.errorType}
              errStrokeWidth={vis.errStrokeWidth}
              showBarOutline={vis.showBarOutline}
              barOutlineWidth={vis.barOutlineWidth}
              barOutlineColor={vis.barOutlineColor}
              boxGap={vis.boxGap}
              yMin={yMinVal}
              yMax={yMaxVal}
              catColors={categoryColors}
              annotations={globalAnnotations}
              statsSummary={globalSummary}
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
          ) : (
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
              categoryColors={categoryColors}
              colorByCol={colorByCol}
              boxGap={vis.boxGap}
              showCompPie={vis.showCompPie}
              plotStyle={vis.plotStyle}
              annotations={globalAnnotations}
              statsSummary={globalSummary}
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
          )}
        </div>
      )}
      {facetByCol >= 0 && facetedData.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {facetedData.map((fd) => {
            const displayFdGroups = fd.groups.map((g) => ({
              ...g,
              name: plotGroupRenames[g.name] ?? g.name,
              color: boxplotColors[g.name] ?? g.color,
            }));
            const chartProps = {
              groups: displayFdGroups,
              annotations: facetStatsAnnotations[fd.category] || null,
              statsSummary: facetStatsSummary[fd.category] || null,
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
              svgLegend:
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
            };
            return (
              <FacetBoxplotItem
                key={fd.category}
                fd={fd}
                facetRefs={facetRefs}
                chartProps={chartProps}
                categoryColors={categoryColors}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Per-facet wrapper tile. Each facet gets its own outer container holding
// the plot tile, the "Statistics display" tile and the collapsible
// "Statistics summary" tile. Because every facet is enclosed in its own
// frame, any height mismatch between the left stack (plot + display) and
// the right column (summary) stays local to that facet and doesn't
// visually misalign across the row of facets. Outer padding and inner gap
// are both `FACET_WRAPPER_PAD` so the distance between any inner tile and
// the wrapper edge matches the distance between two sibling inner tiles.
const FACET_WRAPPER_PAD = 16;
function FacetStatsRow({ fd, leftPlot, setAnnotationsFor, setSummaryFor, fileStem }: any) {
  return (
    <div
      style={{
        background: "var(--surface-sunken)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: FACET_WRAPPER_PAD,
      }}
    >
      <StatsTile
        title={`Statistics — ${fd.category}`}
        compact
        defaultOpen={false}
        groups={fd.groups.map((g) => ({ name: g.name, values: g.allValues }))}
        fileStem={`${fileStem}_${fd.category}_stats`}
        onAnnotationsChange={(a) => setAnnotationsFor(fd.category, a)}
        onStatsSummaryChange={(s) => setSummaryFor(fd.category, s)}
        renderLayout={({ displayEl, summaryEl }) => (
          // `alignItems: stretch` pulls the left column up to the row's tallest
          // child (usually the Statistics summary). Inside the left column,
          // `justifyContent: space-between` pins the plot to the top and the
          // "Statistics display" tile to the bottom, so the display tile keeps
          // a fixed `FACET_WRAPPER_PAD` gap to the wrapper's inner bottom edge
          // while the extra vertical slack is absorbed above the display tile,
          // not below it.
          <div style={{ display: "flex", gap: FACET_WRAPPER_PAD, alignItems: "stretch" }}>
            <div
              style={{
                flex: "1 1 0",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: FACET_WRAPPER_PAD,
                justifyContent: "space-between",
              }}
            >
              {leftPlot}
              {displayEl}
            </div>
            <div style={{ width: 320, flexShrink: 0 }}>{summaryEl}</div>
          </div>
        )}
      />
    </div>
  );
}

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
  setAnnotationsFor,
  setSummaryFor,
  fileStem,
}: any) {
  if (!facetedData || facetedData.length === 0) return null;
  const svgLegend =
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
      : null;
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
      {facetedData.map((fd) => {
        const displayFdGroups = fd.groups.map((g) => ({
          ...g,
          name: plotGroupRenames[g.name] ?? g.name,
          color: boxplotColors[g.name] ?? g.color,
        }));
        const chartProps = {
          groups: displayFdGroups,
          annotations: facetStatsAnnotations[fd.category] || null,
          statsSummary: facetStatsSummary[fd.category] || null,
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
          svgLegend,
        };
        // No `fillHeight`: the facet wrapper uses `justifyContent:
        // space-between` on the left column to push the display tile to the
        // bottom, so the plot tile must stay at its natural size instead of
        // absorbing the extra slack via `flex: 1 1 auto`.
        const leftPlot = (
          <FacetBoxplotItem
            fd={fd}
            facetRefs={facetRefs}
            chartProps={chartProps}
            categoryColors={categoryColors}
          />
        );
        if (fd.groups.length < 2) {
          return (
            <div key={fd.category} style={{ maxWidth: 720 }}>
              {leftPlot}
            </div>
          );
        }
        return (
          <FacetStatsRow
            key={fd.category}
            fd={fd}
            leftPlot={leftPlot}
            setAnnotationsFor={setAnnotationsFor}
            setSummaryFor={setSummaryFor}
            fileStem={fileStem}
          />
        );
      })}
    </div>
  );
}

/* ── Main App (orchestrator) ───────────────────────────────────────────────── */

function App() {
  // Upload & navigation
  const [rawText, setRawText] = useState(null);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState(null);
  const [dataFormat, setDataFormat] = useState("long");
  const [sepOverride, setSepOverride] = useState("");

  // Parsing
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  // Column config & filtering
  const [colRoles, setColRoles] = useState([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});

  // Visual settings
  const visInit = {
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
    showCompPie: false,
    plotStyle: "box",
    // bar-specific
    errorType: "sem",
    errStrokeWidth: 1.2,
    showBarOutline: false,
    barOutlineWidth: 1.5,
    barOutlineColor: "#333333",
    barOpacity: 0.25,
  };
  const [vis, updVis] = useReducer((s, a) => (a._reset ? { ...visInit } : { ...s, ...a }), visInit);

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
  const [facetByCol, setFacetByCol] = useState(-1);
  // Stats annotations + summary are keyed by facet category so each facet
  // subplot gets its own on-plot CLD/brackets and its own summary text.
  // The non-facet path uses the literal key "_global" so the same maps drive
  // both modes.
  const [facetStatsAnnotations, setFacetStatsAnnotations] = useState<Record<string, any>>({});
  const [facetStatsSummary, setFacetStatsSummary] = useState<Record<string, string | null>>({});
  const setAnnotationsFor = (key, spec) =>
    setFacetStatsAnnotations((prev) => {
      if (prev[key] === spec) return prev;
      return { ...prev, [key]: spec };
    });
  const setSummaryFor = (key, txt) =>
    setFacetStatsSummary((prev) => {
      if (prev[key] === txt) return prev;
      return { ...prev, [key]: txt };
    });

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
    setFacetByCol(-1);
    setFacetStatsAnnotations({});
    setFacetStatsSummary({});
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
      // roles (e.g. two low-cardinality categorical columns). Group Plot only
      // uses one x-axis grouping column — keep the first "group" guess and
      // demote any later ones to "filter" so the configure step never starts
      // in a state the user can't reach via the UI.
      {
        let seenGroup = false;
        setColRoles(
          headers.map((_, i) => {
            const r = guessColumnType(rows.map((row) => row[i] ?? ""));
            if (r !== "group") return r;
            if (seenGroup) return "filter";
            seenGroup = true;
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

  // Group Plot has exactly one x-axis grouping column, so "group" is an
  // exclusive role. Picking "group" on a new column demotes any previous
  // group to "filter" instead of silently ending up with two columns whose
  // role select says "group" but only the first one actually drives the plot.
  const updateRole = (i, role) =>
    setColRoles((p) =>
      p.map((r, j) => {
        if (j === i) return role;
        if (role === "group" && r === "group") return "filter";
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

  const fileStem = "groupplot";
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
    <div
      style={{
        minHeight: "100vh",
        color: "var(--text)",
        fontFamily: "monospace",
        padding: "24px 32px",
      }}
    >
      <PageHeader
        toolName="boxplot"
        title="Group Plot"
        subtitle={`Load → label columns → filter → plot & export${dataFormat === "wide" ? " · Wide format auto-detected" : ""}`}
      />
      <StepNavBar
        steps={["upload", "configure", "filter", "output", "plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={(s) => s === "upload" || parsedRows.length > 0}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      <ParseErrorBanner error={parseError} />

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
            setFacetByCol={setFacetByCol}
            onDownloadSvg={handleDownloadSvg}
            onDownloadPng={handleDownloadPng}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {facetByCol < 0 ? (
              <>
                <PlotArea
                  colorByCol={colorByCol}
                  colorByCategories={colorByCategories}
                  colNames={colNames}
                  categoryColors={categoryColors}
                  facetByCol={facetByCol}
                  facetedData={facetedData}
                  facetRefs={facetRefs}
                  chartRef={chartRef}
                  displayBoxplotGroups={displayBoxplotGroups}
                  vis={vis}
                  yMinVal={yMinVal}
                  yMaxVal={yMaxVal}
                  plotGroupRenames={plotGroupRenames}
                  boxplotColors={boxplotColors}
                  facetStatsAnnotations={facetStatsAnnotations}
                  facetStatsSummary={facetStatsSummary}
                />
                {displayBoxplotGroups.length >= 2 && (
                  <StatsTile
                    groups={displayBoxplotGroups.map((g) => ({
                      name: g.name,
                      values: g.allValues,
                    }))}
                    fileStem={`${fileStem}_stats`}
                    onAnnotationsChange={(a) => setAnnotationsFor("_global", a)}
                    onStatsSummaryChange={(s) => setSummaryFor("_global", s)}
                  />
                )}
              </>
            ) : (
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
                facetStatsAnnotations={facetStatsAnnotations}
                facetStatsSummary={facetStatsSummary}
                setAnnotationsFor={setAnnotationsFor}
                setSummaryFor={setSummaryFor}
                fileStem={fileStem}
              />
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
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Boxplot">
    <App />
  </ErrorBoundary>
);
