// Chart (main time-course forwardRef SVG), InsetBarplot (Σ barplot forwardRef
// SVG), and FacetChartItem (memoised per-condition chart wrapper for the
// faceted layout). Pure React/SVG — no tool state, no side effects; consumes
// MARGIN from ./helpers and otherwise relies on shared globals
// (computeLegendHeight, renderSvgLegend, makeTicks, svgSafeId,
// assignBracketLevels, seededRandom, tinv) resolved through shared.bundle.js.

import { MARGIN, buildAreaD, buildLineD } from "./helpers";

const { forwardRef, useRef, useEffect, memo } = React;

// ── Chart ────────────────────────────────────────────────────────────────────

export const Chart = forwardRef<SVGSVGElement, any>(function Chart(
  {
    series,
    xStart,
    xEnd,
    yMin,
    yMax,
    vbW,
    vbH,
    xLabel,
    yLabel,
    plotBg,
    showGrid,
    lineWidth,
    ribbonOpacity,
    gridColor,
    svgLegend,
    plotTitle,
    plotSubtitle,
  },
  ref
) {
  const aequorinItemW = (b) => {
    const maxLen = Math.max(0, ...(b.items || []).map((i) => (i.label || "").length));
    return Math.max(110, maxLen * 6 + 28);
  };
  const legendH = computeLegendHeight(svgLegend, vbW - MARGIN.left - MARGIN.right, aequorinItemW);
  const topPad = (plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0);
  const w = vbW - MARGIN.left - MARGIN.right;
  const h = vbH - MARGIN.top - MARGIN.bottom;
  const xRange = xEnd - xStart || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v) => MARGIN.left + ((v - xStart) / xRange) * w;
  const sy = (v) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
  const clamp = (v) => Math.max(yMin, Math.min(yMax, v));

  const xTicks = makeTicks(xStart, xEnd, 8);
  const yTicks = makeTicks(yMin, yMax, 6);

  const paths = series.map((s) => {
    const areaPts = s.rows.map((r) => ({
      x: sx(r.t),
      yHi: r.mean != null && r.sd != null ? sy(clamp(r.mean + r.sd)) : null,
      yLo: r.mean != null && r.sd != null ? sy(clamp(r.mean - r.sd)) : null,
    }));
    const linePts = s.rows.map((r) => ({
      x: sx(r.t),
      y: r.mean != null ? sy(r.mean) : null,
    }));
    return {
      prefix: s.prefix,
      color: s.color,
      areaD: buildAreaD(areaPts),
      lineD: buildLineD(linePts),
    };
  });

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${vbW} ${vbH + legendH + topPad}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Aequorin luminescence chart"}
    >
      <title>{plotTitle || "Aequorin luminescence chart"}</title>
      <desc>{`Time series chart with ${series.length} series${xLabel ? `, X: ${xLabel}` : ""}${yLabel ? `, Y: ${yLabel}` : ""}`}</desc>
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
                y1={MARGIN.top}
                y2={MARGIN.top + h}
                stroke={gridColor || "#e0e0e0"}
                strokeWidth="0.5"
              />
            ))}
          </g>
        )}
        <g id="ribbons">
          {paths.map((p) =>
            p.areaD ? (
              <path
                key={`area-${p.prefix}`}
                id={`ribbon-${svgSafeId(p.prefix)}`}
                d={p.areaD}
                fill={p.color}
                fillOpacity={ribbonOpacity}
                stroke={p.color}
                strokeOpacity={ribbonOpacity}
                strokeWidth="0.5"
              />
            ) : null
          )}
        </g>
        <g id="traces">
          {paths.map((p) =>
            p.lineD ? (
              <path
                key={`line-${p.prefix}`}
                id={`trace-${svgSafeId(p.prefix)}`}
                d={p.lineD}
                fill="none"
                stroke={p.color}
                strokeWidth={lineWidth}
              />
            ) : null
          )}
        </g>
        <g id="plot-frame" fill="none" stroke="#333" strokeWidth="1">
          <line
            id="plot-frame-top"
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left + w}
            y2={MARGIN.top}
          />
          <line
            id="plot-frame-right"
            x1={MARGIN.left + w}
            y1={MARGIN.top}
            x2={MARGIN.left + w}
            y2={MARGIN.top + h}
          />
          <line
            id="plot-frame-bottom"
            x1={MARGIN.left}
            y1={MARGIN.top + h}
            x2={MARGIN.left + w}
            y2={MARGIN.top + h}
          />
          <line
            id="plot-frame-left"
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + h}
          />
        </g>
        <g id="axis-x">
          {xTicks.map((t) => (
            <g key={t}>
              <line
                x1={sx(t)}
                x2={sx(t)}
                y1={MARGIN.top + h}
                y2={MARGIN.top + h + 5}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={sx(t)}
                y={MARGIN.top + h + 18}
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
              transform={`translate(14,${MARGIN.top + h / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize="13"
              fill="#444"
              fontFamily="sans-serif"
            >
              {yLabel}
            </text>
          </g>
        )}
        {renderSvgLegend(
          svgLegend,
          vbH + 10,
          MARGIN.left,
          vbW - MARGIN.left - MARGIN.right,
          aequorinItemW
        )}
      </g>
    </svg>
  );
});

// ── InsetBarplot ─────────────────────────────────────────────────────────────

export const InsetBarplot = forwardRef<SVGSVGElement, any>(function InsetBarplot(
  {
    series,
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
    plotBg,
    plotTitle,
    plotSubtitle,
    corrected,
    replicateSums,
    annotations,
    statsSummary,
    showPoints,
    pointSize,
    pointColor,
  },
  ref
) {
  const refIW = insetW || 400,
    iH = insetH || 200;
  const _compact = (100 - (insetBarGap != null ? insetBarGap : 0)) / 100;
  const topPad = (plotTitle ? 20 : 0) + (plotSubtitle ? 16 : 0);
  const xAngle = insetXLabelAngle || 0;
  const absAngle = Math.abs(xAngle);

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

  // Stats summary below chart
  const STATS_LINE_H = 11;
  const STATS_FONT = 8;
  const summaryLines = statsSummary ? statsSummary.split("\n") : [];
  const summaryH = summaryLines.length > 0 ? summaryLines.length * STATS_LINE_H + 14 : 0;

  const M = {
    top: 24,
    right: 24,
    bottom: 60 + (absAngle > 0 ? absAngle * 0.8 : 0),
    left: 62,
  };
  const iW = Math.max(
    M.left + M.right + 40,
    Math.round((refIW - M.left - M.right) * _compact) + M.left + M.right
  );
  const w = iW - M.left - M.right;
  const h = iH - M.top - M.bottom;
  const totalH = iH + summaryH;

  const bars = series.map((s) => {
    const repData = replicateSums ? replicateSums.find((r) => r.prefix === s.prefix) : null;
    const vals =
      repData && repData.repSums.length > 0
        ? repData.repSums.map((r) => (corrected ? r.corrSum : r.rawSum))
        : null;
    const n = vals ? vals.length : 0;
    const barMean = n > 0 ? vals.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? vals.reduce((a, v) => a + (v - barMean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    const sem = n > 1 ? sd / Math.sqrt(n) : 0;
    const ci95 = n > 1 && typeof tinv === "function" ? tinv(0.975, n - 1) * sem : 0;
    return {
      label: s.label,
      prefix: s.prefix,
      fillColor: s.color,
      barMean,
      sd,
      sem,
      ci95,
      n,
      vals,
    };
  });

  const errBars = bars.map((b) => {
    if (insetErrorType === "sd") return b.sd;
    if (insetErrorType === "sem") return b.sem;
    if (insetErrorType === "ci95") return b.ci95;
    return 0;
  });

  const dataMax = Math.max(...bars.map((b, i) => b.barMean + (errBars[i] || 0)), 0.001);
  const yMin2 = insetYMin != null ? insetYMin : 0;
  let yMax2 = insetYMax != null ? insetYMax : dataMax * 1.15;
  // Reserve headroom inside the plot frame for annotations (same approach as boxplot)
  if (annotTopPad > 0 && h > annotTopPad + 10) {
    yMax2 = yMin2 + ((yMax2 - yMin2) * h) / (h - annotTopPad);
  }
  const yRange = yMax2 - yMin2 || 1;

  const bandW = w / bars.length;
  const bx = (i) => M.left + i * bandW + bandW / 2;
  const sy = (v) => M.top + (1 - (v - yMin2) / yRange) * h;
  const yTicks = makeTicks(yMin2, yMax2, 8);
  const halfBar = (insetBarWidth != null ? insetBarWidth / 100 : 0.7) * bandW * 0.5;
  const fOp = insetFillOpacity != null ? insetFillOpacity : 0.7;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${iW} ${totalH + topPad}`}
      style={{ width: iW, maxWidth: "100%", height: "auto", display: "block", margin: "0 auto" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "Bar plot"}
    >
      <title>{plotTitle || "Inset bar plot"}</title>
      {plotTitle && (
        <g id="title">
          <text
            x={iW / 2}
            y={15}
            textAnchor="middle"
            fontSize="11"
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
            x={iW / 2}
            y={plotTitle ? 28 : 15}
            textAnchor="middle"
            fontSize="9"
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
          x={M.left}
          y={M.top}
          width={w}
          height={h}
          fill={plotBg || "#fff"}
        />
        {insetShowGrid && (
          <g id="grid">
            {yTicks.map((t) => (
              <line
                key={t}
                x1={M.left}
                x2={M.left + w}
                y1={sy(t)}
                y2={sy(t)}
                stroke={insetGridColor || "#e0e0e0"}
                strokeWidth="0.4"
              />
            ))}
          </g>
        )}
        <g id="axis-y">
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={M.left - 3}
                x2={M.left}
                y1={sy(t)}
                y2={sy(t)}
                stroke="#333"
                strokeWidth="0.5"
              />
              <text
                x={M.left - 5}
                y={sy(t) + 3}
                textAnchor="end"
                fontSize={insetYFontSize || 7}
                fill="#555"
                fontFamily="sans-serif"
              >
                {t % 1 === 0 ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
        </g>
        <g id="bars">
          {bars.map((b, i) => {
            const val = b.barMean;
            const barTop = sy(Math.min(val, yMax2));
            const baseline = sy(Math.max(0, yMin2));
            const errVal = errBars[i] || 0;
            const capW = halfBar * 0.4;
            const hiVal = val + errVal;
            const loVal = val - errVal;
            const hiValC = Math.min(hiVal, yMax2);
            const loValC = Math.max(loVal, yMin2);
            const drawErrBar = insetErrorType !== "none" && errVal > 0 && hiValC > loValC;
            const drawHiCap = drawErrBar && hiVal <= yMax2;
            const drawLoCap = drawErrBar && loVal >= yMin2;
            return (
              <g key={b.prefix} id={`bar-${svgSafeId(b.prefix)}`}>
                <rect
                  x={bx(i) - halfBar}
                  y={barTop}
                  width={Math.max(0, halfBar * 2)}
                  height={Math.max(0, baseline - barTop)}
                  fill={b.fillColor}
                  fillOpacity={fOp}
                  stroke={insetShowBarOutline ? insetBarOutlineColor || b.fillColor : "none"}
                  strokeWidth={insetShowBarOutline ? insetBarStrokeWidth || 1 : 0}
                  rx="1"
                />
                {drawErrBar && (
                  <>
                    <line
                      x1={bx(i)}
                      x2={bx(i)}
                      y1={sy(hiValC)}
                      y2={sy(loValC)}
                      stroke="#333"
                      strokeWidth={insetErrorStrokeWidth}
                    />
                    {drawHiCap && (
                      <line
                        x1={bx(i) - capW}
                        x2={bx(i) + capW}
                        y1={sy(hiValC)}
                        y2={sy(hiValC)}
                        stroke="#333"
                        strokeWidth={insetErrorStrokeWidth}
                      />
                    )}
                    {drawLoCap && (
                      <line
                        x1={bx(i) - capW}
                        x2={bx(i) + capW}
                        y1={sy(loValC)}
                        y2={sy(loValC)}
                        stroke="#333"
                        strokeWidth={insetErrorStrokeWidth}
                      />
                    )}
                  </>
                )}
                {showPoints &&
                  b.vals &&
                  b.vals.map((v, vi) => {
                    const rng = seededRandom(i * 1000 + vi + 42);
                    const jitter = (rng() - 0.5) * halfBar * 1.2;
                    return (
                      <circle
                        key={`pt-${i}-${vi}`}
                        cx={bx(i) + jitter}
                        cy={sy(v)}
                        r={pointSize || 3}
                        fill={pointColor || "#333"}
                        fillOpacity={0.6}
                        stroke={pointColor || "#333"}
                        strokeOpacity={0.75}
                        strokeWidth="0.3"
                      />
                    );
                  })}
                {absAngle === 0 ? (
                  <text
                    x={bx(i)}
                    y={M.top + h + 12}
                    textAnchor="middle"
                    fontSize={insetXFontSize || 7}
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {b.label}
                  </text>
                ) : (
                  <text
                    x={bx(i)}
                    y={M.top + h + 10}
                    transform={`rotate(${xAngle}, ${bx(i)}, ${M.top + h + 10})`}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={insetXFontSize || 7}
                    fill="#333"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g id="plot-frame" fill="none" stroke="#333" strokeWidth="0.5">
          <line id="plot-frame-top" x1={M.left} y1={M.top} x2={M.left + w} y2={M.top} />
          <line id="plot-frame-right" x1={M.left + w} y1={M.top} x2={M.left + w} y2={M.top + h} />
          <line id="plot-frame-bottom" x1={M.left} y1={M.top + h} x2={M.left + w} y2={M.top + h} />
          <line id="plot-frame-left" x1={M.left} y1={M.top} x2={M.left} y2={M.top + h} />
        </g>
        {annotations && annotations.kind === "cld" && annotations.labels && (
          <g id="cld-annotations">
            {annotations.labels.map((letter, i) => {
              if (i >= bars.length || letter == null) return null;
              return (
                <text
                  key={`cld-${i}`}
                  x={bx(i)}
                  y={M.top + 15}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#222"
                  fontFamily="sans-serif"
                >
                  {letter}
                </text>
              );
            })}
          </g>
        )}
        {annotations && annotations.kind === "brackets" && (
          <g id="significance-brackets">
            {annotPairs.map((pr, pi) => {
              const x1 = bx(pr.i);
              const x2 = bx(pr.j);
              const lvl = pr._level || 0;
              const yLine = M.top + annotTopPad - 6 - lvl * 20;
              const tick = 4;
              const p = pr.pAdj != null ? pr.pAdj : pr.p;
              const label =
                p >= 0.05 ? "ns" : p < 0.0001 ? "****" : p < 0.001 ? "***" : p < 0.01 ? "**" : "*";
              return (
                <g key={`br-${pi}`}>
                  <path
                    d={`M${x1},${yLine + tick} L${x1},${yLine} L${x2},${yLine} L${x2},${yLine + tick}`}
                    stroke="#222"
                    strokeWidth="1"
                    fill="none"
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={yLine - 2}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#222"
                    fontFamily="sans-serif"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        )}
        <g id="y-axis-label">
          <text
            transform={`translate(14,${M.top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={insetYFontSize || 12}
            fill="#444"
            fontFamily="sans-serif"
          >
            {corrected ? `\u03A3 (baseline-corrected)` : `\u03A3 (raw)`}
          </text>
        </g>
      </g>
      {summaryLines.length > 0 && (
        <g id="stats-summary">
          {summaryLines.map((line, i) => (
            <text
              key={`ss-${i}`}
              x={M.left}
              y={iH + topPad + 10 + i * STATS_LINE_H}
              fontSize={STATS_FONT}
              fill="#aaa"
              fontFamily="monospace"
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
});

// ── FacetChartItem ───────────────────────────────────────────────────────────

export const FacetChartItem = memo(function FacetChartItem({ s, facetRefs, chartProps }: any) {
  const localRef = useRef();
  useEffect(() => {
    facetRefs.current[s.prefix] = localRef.current;
    return () => {
      delete facetRefs.current[s.prefix];
    };
  }, [s.prefix, facetRefs]);
  return (
    <div
      className="dv-plot-card"
      style={{
        background: "var(--plot-card-bg)",
        borderRadius: 8,
        padding: 12,
        border: "1px solid var(--plot-card-border)",
      }}
    >
      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: s.color }}>
        {s.label}{" "}
        <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>
          number of repeats used = {s.n}
        </span>
      </p>
      <Chart ref={localRef} {...chartProps} />
    </div>
  );
});
