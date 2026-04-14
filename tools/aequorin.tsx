// aequorin.jsx — editable source. Run `npm run build` to compile to aequorin.js
// Do NOT edit the .js file directly.
const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef, memo } = React;

const DEFAULT_KR = 7;
const DEFAULT_KTR = 118;
const DEFAULT_KD = 7;
const DEFAULT_HILL_N = 3;
const TIME_UNITS = [
  { key: "ms", label: "milliseconds" },
  { key: "s", label: "seconds" },
  { key: "min", label: "minutes" },
  { key: "h", label: "hours" },
  { key: "d", label: "days" },
  { key: "w", label: "weeks" },
  { key: "mo", label: "months" },
  { key: "yr", label: "years" },
];
const TO_SECONDS = {
  ms: 0.001,
  s: 1,
  min: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2629800,
  yr: 31557600,
};
function convertTime(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  return (value * TO_SECONDS[fromUnit]) / TO_SECONDS[toUnit];
}

const FORMULA_DEFS = {
  none: {
    label: "No calibration",
    eq: "Raw luminescence values plotted as-is",
  },
  "allen-blinks": {
    label: "Allen & Blinks (1978)",
    eq: "[Ca²⁺] = ((1+Ktr)·f^⅓ − 1) / (Kr·(1−f^⅓))",
  },
  hill: {
    label: "Hill equilibrium",
    eq: "[Ca²⁺] = Kd · (f/(1−f))^⅓  where f = L/ΣL",
  },
  generalized: {
    label: "Generalised Allen & Blinks",
    eq: "[Ca²⁺] = ((1+Ktr)·f^(1/n) − 1) / (Kr·(1−f^(1/n)))",
  },
};

// ── Calibration ──────────────────────────────────────────────────────────────

function calibrate(headers, data, Kr, Ktr) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal = [];
  for (let r = 0; r < nRows; r++) {
    const row = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const cbrt = Math.cbrt(v / totals[c]);
      const denom = Kr * (1 - cbrt);
      row.push(denom === 0 ? null : ((1 + Ktr) * cbrt - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

// Hill equilibrium: [Ca²⁺] = Kd · (f/(1−f))^(1/3)  where f = L/Ltotal
function calibrateHill(headers, data, Kd) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal = [];
  for (let r = 0; r < nRows; r++) {
    const row = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const f = v / totals[c];
      if (f >= 1) {
        row.push(null);
        continue;
      }
      row.push(Kd * Math.cbrt(f / (1 - f)));
    }
    cal.push(row);
  }
  return cal;
}

// Generalised Allen & Blinks: adjustable Hill exponent n (standard uses n=3)
function calibrateGeneralized(headers, data, Kr, Ktr, n) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal = [];
  for (let r = 0; r < nRows; r++) {
    const row = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const fn = Math.pow(v / totals[c], 1 / n);
      const denom = Kr * (1 - fn);
      row.push(denom === 0 ? null : ((1 + Ktr) * fn - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

function detectConditions(headers, poolReplicates = true, columnEnabled = null) {
  const nameOcc = {};
  const repNums = headers.map((h) => {
    nameOcc[h] = (nameOcc[h] || 0) + 1;
    return nameOcc[h];
  });
  if (poolReplicates) {
    const pm = {};
    headers.forEach((h, i) => {
      if (columnEnabled && columnEnabled[i] === false) return;
      if (!pm[h]) pm[h] = [];
      pm[h].push(i);
    });
    return Object.entries(pm).map(([name, colIndices], idx) => ({
      prefix: name,
      label: name,
      color: PALETTE[idx % PALETTE.length],
      colIndices,
    }));
  } else {
    return headers
      .map((h, i) => ({ h, i, rep: repNums[i] }))
      .filter(({ i }) => !columnEnabled || columnEnabled[i] !== false)
      .map(({ h, i, rep }, ci) => ({
        prefix: `${h}__col${i}`,
        label: `${h}_rep${rep}`,
        color: PALETTE[ci % PALETTE.length],
        colIndices: [i],
      }));
  }
}

function computeCalStats(calData, headers, conditions) {
  const nRows = calData.length;
  return conditions.map((cond) => {
    const idxs = cond.activeColIndices || cond.colIndices;
    const means = [],
      sds = [];
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
    return { ...cond, means, sds };
  });
}

function smooth(arr, w) {
  if (w <= 0) return arr;
  return arr.map((_, i) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) {
      if (arr[j] != null) {
        sum += arr[j];
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

// ── SVG path builders ────────────────────────────────────────────────────────

function buildAreaD(pts) {
  const valid = pts.filter((p) => p.yHi != null && p.yLo != null);
  if (valid.length < 2) return "";
  const fwd = valid.map((p) => `${p.x.toFixed(2)},${p.yHi.toFixed(2)}`);
  const rev = valid
    .slice()
    .reverse()
    .map((p) => `${p.x.toFixed(2)},${p.yLo.toFixed(2)}`);
  return "M" + fwd.join("L") + "L" + rev.join("L") + "Z";
}

function buildLineD(pts) {
  const valid = pts.filter((p) => p.y != null);
  if (valid.length < 2) return "";
  return "M" + valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
}

// ── Chart ────────────────────────────────────────────────────────────────────

const MARGIN = { top: 20, right: 20, bottom: 48, left: 62 };

const Chart = forwardRef<SVGSVGElement, any>(function Chart(
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

// ── PlotPanel ────────────────────────────────────────────────────────────────

const InsetBarplot = forwardRef<SVGSVGElement, any>(function InsetBarplot(
  {
    series,
    insetColors,
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
    return {
      label: s.label,
      prefix: s.prefix,
      fillColor: insetColors[s.prefix] || s.color,
      barMean,
      sd,
      sem,
      n,
      vals,
    };
  });

  const errBars = bars.map((b) => {
    if (insetErrorType === "sd") return b.sd;
    if (insetErrorType === "sem") return b.sem;
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
                {insetErrorType !== "none" && errVal > 0 && (
                  <>
                    <line
                      x1={bx(i)}
                      x2={bx(i)}
                      y1={sy(val + errVal)}
                      y2={sy(val - errVal)}
                      stroke="#333"
                      strokeWidth={insetErrorStrokeWidth}
                    />
                    <line
                      x1={bx(i) - capW}
                      x2={bx(i) + capW}
                      y1={sy(val + errVal)}
                      y2={sy(val + errVal)}
                      stroke="#333"
                      strokeWidth={insetErrorStrokeWidth}
                    />
                    <line
                      x1={bx(i) - capW}
                      x2={bx(i) + capW}
                      y1={sy(val - errVal)}
                      y2={sy(val - errVal)}
                      stroke="#333"
                      strokeWidth={insetErrorStrokeWidth}
                    />
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
        {annotations && annotations.kind === "cld" && annotations.letters && (
          <g id="cld-annotations">
            {annotations.letters.map((letter, i) => {
              if (i >= bars.length) return null;
              const top = sy(bars[i].barMean + (errBars[i] || 0));
              return (
                <text
                  key={`cld-${i}`}
                  x={bx(i)}
                  y={top - 6}
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

const FacetChartItem = memo(function FacetChartItem({ s, facetRefs, chartProps }: any) {
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

const PlotPanel = React.forwardRef<any, any>(function PlotPanel(
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
    insetColors,
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
        (s) => s.prefix + s.color + s.enabled + ":" + (s.activeColIndices || s.colIndices).join(":")
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

  React.useImperativeHandle(
    ref,
    () => ({
      downloadMain: () => {
        if (faceted) {
          displaySeries.forEach((s) => downloadSvg(facetRefs.current[s.prefix], `${s.label}.svg`));
        } else {
          downloadSvg(combinedRef.current, "combined_plot.svg");
        }
        if (showInset && barRef.current) {
          const suffix = statsDataMode === "raw" ? "raw" : "corrected";
          downloadSvg(barRef.current, `barplot_sum_${suffix}.svg`);
        }
      },
      downloadMainPng: () => {
        if (faceted) {
          displaySeries.forEach((s) => downloadPng(facetRefs.current[s.prefix], `${s.label}.png`));
        } else {
          downloadPng(combinedRef.current, "combined_plot.png");
        }
        if (showInset && barRef.current) {
          const suffix = statsDataMode === "raw" ? "raw" : "corrected";
          downloadPng(barRef.current, `barplot_sum_${suffix}.png`);
        }
      },
    }),
    [faceted, displaySeries, showInset, statsDataMode]
  );

  const baseName = fileName ? fileName.replace(/\.[^.]+$/, "") : "data";

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
    insetColors,
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
  const csvFileName = isCorrected ? `corrected_sums_${baseName}.csv` : `raw_sums_${baseName}.csv`;

  const IntegralTile = showInset ? (
    <div
      className="dv-plot-card"
      style={{
        marginTop: 16,
        borderRadius: 10,
        border: "1px solid var(--plot-card-border)",
        background: "var(--plot-card-bg)",
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
                background: statsDataMode === "raw" ? "#1d4ed8" : "var(--surface)",
                color: statsDataMode === "raw" ? "#fff" : "var(--text-faint)",
                border: `1px solid ${statsDataMode === "raw" ? "#1d4ed8" : "var(--border-strong)"}`,
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
                background: statsDataMode === "corrected" ? "#0f766e" : "var(--surface)",
                color: statsDataMode === "corrected" ? "#fff" : "var(--text-faint)",
                border: `1px solid ${statsDataMode === "corrected" ? "#0f766e" : "var(--border-strong)"}`,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Σ Baseline-corrected
            </button>
          </div>

          {/* Bar plot */}
          <div
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

          {/* StatsTile */}
          {statsGroups && (
            <div style={{ marginTop: 12 }}>
              <StatsTile
                groups={statsGroups}
                fileStem={`${baseName}_stats`}
                onAnnotationsChange={setStatsAnnotations}
                onStatsSummaryChange={setStatsSummary}
              />
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  // ── Collapsible time-course chart tile ──
  const ChartTile = (chartContent) => (
    <div
      className="dv-plot-card"
      style={{
        borderRadius: 10,
        border: "1px solid var(--plot-card-border)",
        background: "var(--plot-card-bg)",
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
      {chartOpen && <div style={{ padding: "0 12px 12px" }}>{chartContent}</div>}
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
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              justifyContent: "center",
              marginTop: 8,
              alignItems: "center",
            }}
          >
            {displaySeries.map((s) => (
              <div
                key={s.prefix}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                <div style={{ width: 16, height: 4, background: s.color, borderRadius: 2 }} />
                {s.label}{" "}
                <span style={{ color: "var(--text-faint)" }}>number of repeats used = {s.n}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {IntegralTile}
    </div>
  );
});

// ── UI components ────────────────────────────────────────────────────────────

function ConditionEditor({ conditions, onChange }) {
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

// ── Sub-components for App ──────────────────────────────────────────────────

function HowToSection() {
  return (
    <div
      style={{
        marginTop: 24,
        borderRadius: 14,
        overflow: "hidden",
        border: "2px solid var(--accent-primary)",
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
        {toolIcon("aequorin", 24, { circle: true })}
        <div>
          <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
            Aequorin Ca²⁺ Calibration — How to use
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>
            RLU → [Ca²⁺] • Raw or calibrated • Time-course plotting • Σ barplots
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
            Plots aequorin luminescence time-courses — either as raw RLU values or converted to
            [Ca²⁺] using calibration formulas (Allen &amp; Blinks 1978, Hill, Generalised). Computes
            mean ± SD across replicates and generates Σ barplots (raw and baseline-corrected) for
            the selected time window.
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
            Data layout — wide format
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}>
            Each <strong>column</strong> = one sample/replicate. Each <strong>row</strong> = one
            time-point. First row = header names.
          </p>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead>
              <tr style={{ background: "var(--info-bg)" }}>
                {["WT", "WT", "WT", "KO", "KO", "KO"].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid var(--info-border)",
                      color: "var(--accent-primary)",
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
                [1200, 1180, 1250, 800, 790, 810],
                [1350, 1400, 1310, 850, 870, 840],
                [980, 1010, 990, 620, 600, 640],
              ].map((r, i) => (
                <tr
                  key={i}
                  style={{ background: i % 2 === 0 ? "var(--surface-subtle)" : "var(--surface)" }}
                >
                  {r.map((v, j) => (
                    <td
                      key={j}
                      style={{
                        padding: "4px 8px",
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
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Configure step
          </div>
          {[
            {
              icon: "🔬",
              text: "Column grouping: identical header names are pooled as replicates by default. Switch to Individual to treat each column separately. Uncheck any column to exclude it from the analysis and exports.",
            },
            {
              icon: "⏱️",
              text: "Time axis: set the time step per row and its base unit (ms, s, min, h…). The display unit can be changed independently on the plot page.",
            },
            {
              icon: "⚙️",
              text: "Calibration: defaults to None (raw RLU). Switch to Allen & Blinks (1978), Hill equilibrium, or Generalised Allen & Blinks — constants are adjustable.",
            },
          ].map(({ icon, text }) => (
            <div
              key={icon}
              style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}
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
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Plot step
          </div>
          {[
            {
              icon: "📊",
              text: "Combined or faceted view. X/Y range, smoothing, title, and style controls in the left panel.",
            },
            {
              icon: "📈",
              text: "Σ barplots shown below the main chart: raw sums and baseline-corrected sums (Σv − n×min) per condition, with SD/SEM error bars computed across replicates.",
            },
            {
              icon: "⬇️",
              text: "Each barplot tile has a matching CSV table below it — download per-replicate sums directly from the plot page.",
            },
          ].map(({ icon, text }) => (
            <div
              key={icon}
              style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}
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
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Sample selection (plot page)
          </div>
          {[
            {
              icon: "🔬",
              text: 'Click the sticky "Sample selection" button above the chart to open the column overlay.',
            },
            {
              icon: "✅",
              text: "Toggle individual replicates on or off — excluded columns are removed from the plot, barplots, and all exports.",
            },
            {
              icon: "🔀",
              text: "Switch between Pool (group by header name, mean ± SD) and Individual (each column plotted separately as name_rep1, name_rep2…).",
            },
            {
              icon: "⚡",
              text: "All changes apply instantly — no need to go back to the configure step.",
            },
          ].map(({ icon, text }) => (
            <div
              key={icon}
              style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}
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
            borderLeft: "4px solid var(--accent-primary)",
            background: "var(--info-bg)",
            padding: "10px 14px",
            borderRadius: "0 8px 8px 0",
            gridColumn: "1/-1",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)" }}>
            💡 Replicate grouping —{" "}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            In Pool mode, columns sharing the same header name are grouped: mean ± SD is computed
            across them at each time-point. In Individual mode, each column is its own condition
            (labelled name_rep1, name_rep2…) and plotted separately.
          </span>
        </div>
        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "Separator explicitly selected (comma, semicolon, tab, space)",
            "Quoted values stripped automatically",
            "Excluded columns omitted from all exports",
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
  );
}

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
        hint="CSV · TSV · TXT · DAT — one column per sample, one row per time-point"
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
      <HowToSection />
    </div>
  );
}

function ConfigureStep({
  parsed,
  formula,
  setFormula,
  Kr,
  setKr,
  Ktr,
  setKtr,
  Kd,
  setKd,
  hillN,
  setHillN,
  vis,
  updVis,
  fileName,
  calData,
  columnEnabled,
  downloadCalibrated,
  setStep,
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <div className="dv-panel" style={{ flex: "1 1 0", marginBottom: 0 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
          >
            Calibration formula
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div className="dv-label">Formula</div>
              <select
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                className="dv-select"
              >
                <option value="none">None (raw data)</option>
                <option value="allen-blinks">Allen &amp; Blinks (1978)</option>
                <option value="hill">Hill equilibrium</option>
                <option value="generalized">Generalised Allen &amp; Blinks</option>
              </select>
            </div>
            {(formula === "allen-blinks" || formula === "generalized") && (
              <div>
                <div className="dv-label">Kr</div>
                <NumberInput
                  value={Kr}
                  onChange={(e) => setKr(Number(e.target.value))}
                  step="0.1"
                />
              </div>
            )}
            {(formula === "allen-blinks" || formula === "generalized") && (
              <div>
                <div className="dv-label">Ktr</div>
                <NumberInput
                  value={Ktr}
                  onChange={(e) => setKtr(Number(e.target.value))}
                  step="1"
                />
              </div>
            )}
            {formula === "hill" && (
              <div>
                <div className="dv-label">Kd (µM)</div>
                <NumberInput
                  value={Kd}
                  onChange={(e) => setKd(Number(e.target.value))}
                  step="0.5"
                  min="0.1"
                />
              </div>
            )}
            {formula === "generalized" && (
              <div>
                <div className="dv-label">n (Hill exp.)</div>
                <NumberInput
                  value={hillN}
                  onChange={(e) => setHillN(Number(e.target.value))}
                  step="0.5"
                  min="1"
                />
              </div>
            )}
          </div>
        </div>
        <div className="dv-panel" style={{ flex: "1 1 0", marginBottom: 0 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
          >
            Time axis
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div>
              <div className="dv-label">Time step (per row)</div>
              <NumberInput
                value={vis.timeStep}
                onChange={(e) => updVis({ timeStep: Number(e.target.value) || 1 })}
                style={{ width: 132 }}
                min="0.001"
                step="any"
              />
            </div>
            <div>
              <div className="dv-label">Base unit</div>
              <select
                value={vis.baseUnit}
                onChange={(e) => updVis({ baseUnit: e.target.value })}
                className="dv-select"
              >
                {TIME_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            {parsed && (
              <div style={{ fontSize: 12, color: "var(--text-faint)", paddingBottom: 4 }}>
                Range: 0 – {(parsed.data.length * vis.timeStep).toFixed(3)} {vis.baseUnit}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="dv-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            Loaded <strong style={{ color: "var(--text)" }}>{fileName}</strong> —{" "}
            {parsed.headers.length} samples × {parsed.data.length} time-points
          </p>
          <button
            onClick={(e) => {
              downloadCalibrated();
              flashSaved(e.currentTarget);
            }}
            className="dv-btn dv-btn-dl"
          >
            ⬇ CSV
          </button>
        </div>
        {calData &&
          parsed &&
          (() => {
            const ei = parsed.headers.map((_, i) => i).filter((i) => columnEnabled[i] !== false);
            return (
              <div style={{ marginTop: 8 }}>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Preview — {formula === "none" ? "raw data" : "calibrated data"} · {ei.length} of{" "}
                  {parsed.headers.length} columns (first 15 rows):
                </p>
                <DataPreview
                  headers={ei.map((i) => parsed.headers[i])}
                  rows={calData.slice(0, 15).map((r) => ei.map((i) => (r[i] != null ? r[i] : "")))}
                  maxRows={15}
                />
              </div>
            );
          })()}
      </div>
      <button onClick={() => setStep("plot")} className="dv-btn dv-btn-primary">
        Plot →
      </button>
    </div>
  );
}

function PlotControls({
  stats,
  conditions,
  setConditions,
  vis,
  updVis,
  plotPanelRef,
  downloadCalibrated,
  resetAll,
  insetColors,
  setInsetColors,
}) {
  const sv = (k) => (v) => updVis({ [k]: v });
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
      {/* Actions tile */}
      <ActionsPanel
        onDownloadSvg={() => {
          plotPanelRef.current?.downloadMain();
        }}
        onDownloadPng={() => {
          plotPanelRef.current?.downloadMainPng();
        }}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "CSV",
            onClick: () => downloadCalibrated(),
          },
        ]}
      />

      {/* Conditions */}
      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Conditions
        </p>
        <ConditionEditor conditions={conditions} onChange={setConditions} />
        <details style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)" }}>
          <summary style={{ cursor: "pointer" }}>Debug: column grouping</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              marginTop: 4,
              fontSize: 10,
              background: "var(--surface-sunken)",
              padding: 8,
              borderRadius: 4,
            }}
          >
            {stats
              .map(
                (c) =>
                  `"${c.prefix}" → ${c.colIndices.length} replicate(s) (col indices: ${c.colIndices.join(", ")})`
              )
              .join("\n")}
          </pre>
        </details>
      </div>

      {/* Time-course parameters */}
      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Time-course parameters
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div className="dv-label">X start</div>
            <NumberInput
              value={vis.xStart}
              onChange={(e) => updVis({ xStart: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <div className="dv-label">X end</div>
            <NumberInput
              value={vis.xEnd}
              onChange={(e) => updVis({ xEnd: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <div className="dv-label">Y min</div>
            <NumberInput
              value={vis.yMin}
              onChange={(e) => updVis({ yMin: Number(e.target.value) })}
              style={{ width: "100%" }}
              step="0.1"
            />
          </div>
          <div>
            <div className="dv-label">Y max</div>
            <NumberInput
              value={vis.yMax}
              onChange={(e) => updVis({ yMax: Number(e.target.value) })}
              style={{ width: "100%" }}
              step="0.1"
            />
          </div>
          <SliderControl
            label="Smooth (±pts)"
            value={vis.smoothWidth}
            min={0}
            max={20}
            step={1}
            onChange={sv("smoothWidth")}
          />
          <div>
            <div className="dv-label">Title</div>
            <input
              value={vis.plotTitle}
              onChange={(e) => updVis({ plotTitle: e.target.value })}
              className="dv-input-num"
              style={{ width: "100%", textAlign: "left" }}
            />
          </div>
          <div>
            <div className="dv-label">Subtitle</div>
            <input
              value={vis.plotSubtitle}
              onChange={(e) => updVis({ plotSubtitle: e.target.value })}
              className="dv-input-num"
              style={{ width: "100%", textAlign: "left" }}
            />
          </div>
        </div>
      </div>

      {/* Style controls */}
      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Style
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <BaseStyleControls
            plotBg={vis.plotBg}
            onPlotBgChange={sv("plotBg")}
            showGrid={vis.showGrid}
            onShowGridChange={sv("showGrid")}
            gridColor={vis.gridColor}
            onGridColorChange={sv("gridColor")}
          />
          <SliderControl
            label="Line width"
            value={vis.lineWidth}
            min={0.5}
            max={5}
            step={0.5}
            onChange={sv("lineWidth")}
          />
          <SliderControl
            label="SD opacity"
            value={vis.ribbonOpacity}
            displayValue={vis.ribbonOpacity.toFixed(2)}
            min={0}
            max={1}
            step={0.05}
            onChange={sv("ribbonOpacity")}
          />
          <div>
            <div className="dv-label">Display unit</div>
            <select
              value={vis.displayUnit}
              onChange={(e) => updVis({ displayUnit: e.target.value })}
              className="dv-select"
              style={{ width: "100%" }}
            >
              {TIME_UNITS.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Barplot controls */}
      <div className="dv-panel">
        <p
          style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
        >
          Barplot (Σ of plotted values)
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span className="dv-label">Show</span>
          <input
            type="checkbox"
            checked={vis.showInset}
            onChange={(e) => updVis({ showInset: e.target.checked })}
            style={{ accentColor: "var(--accent-primary)" }}
          />
        </div>

        {vis.showInset && (
          <>
            {/* Layout */}
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Layout
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <div>
                <div className="dv-label">Y min (auto)</div>
                <input
                  value={vis.insetYMinCustom}
                  onChange={(e) => updVis({ insetYMinCustom: e.target.value })}
                  className="dv-input-num"
                  style={{ width: "100%", textAlign: "left" }}
                  placeholder="auto"
                />
              </div>
              <div>
                <div className="dv-label">Y max (auto)</div>
                <input
                  value={vis.insetYMaxCustom}
                  onChange={(e) => updVis({ insetYMaxCustom: e.target.value })}
                  className="dv-input-num"
                  style={{ width: "100%", textAlign: "left" }}
                  placeholder="auto"
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="dv-label">Grid</span>
                <input
                  type="checkbox"
                  checked={vis.insetShowGrid}
                  onChange={(e) => updVis({ insetShowGrid: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary)" }}
                />
              </div>
              {vis.insetShowGrid && (
                <div>
                  <div className="dv-label">Grid color</div>
                  <ColorInput
                    value={vis.insetGridColor}
                    onChange={sv("insetGridColor")}
                    size={24}
                  />
                </div>
              )}
              <SliderControl
                label="X label angle"
                value={vis.insetXLabelAngle}
                displayValue={`${vis.insetXLabelAngle}°`}
                min={-90}
                max={0}
                step={5}
                onChange={sv("insetXLabelAngle")}
              />
            </div>

            <SliderControl
              label="Bar width"
              value={vis.insetBarWidth}
              displayValue={`${vis.insetBarWidth}%`}
              min={20}
              max={100}
              step={5}
              onChange={sv("insetBarWidth")}
            />
            <SliderControl
              label="Bar gap"
              value={vis.insetBarGap}
              displayValue={`${vis.insetBarGap}%`}
              min={0}
              max={80}
              step={5}
              onChange={sv("insetBarGap")}
            />
            <SliderControl
              label="Bar fill opacity"
              value={vis.insetFillOpacity}
              displayValue={vis.insetFillOpacity.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={sv("insetFillOpacity")}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="dv-label">Bar outline</span>
              <input
                type="checkbox"
                checked={vis.insetShowBarOutline}
                onChange={(e) => updVis({ insetShowBarOutline: e.target.checked })}
                style={{ accentColor: "var(--accent-primary)" }}
              />
            </div>
            {vis.insetShowBarOutline && (
              <>
                <SliderControl
                  label="Outline width"
                  value={vis.insetBarStrokeWidth}
                  displayValue={vis.insetBarStrokeWidth.toFixed(1)}
                  min={0.2}
                  max={4}
                  step={0.1}
                  onChange={sv("insetBarStrokeWidth")}
                />
                <div>
                  <div className="dv-label">Outline color</div>
                  <ColorInput
                    value={vis.insetBarOutlineColor}
                    onChange={sv("insetBarOutlineColor")}
                    size={24}
                  />
                </div>
              </>
            )}

            {/* Error bars */}
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Error bars
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <div>
                <div className="dv-label">Type</div>
                <select
                  value={vis.insetErrorType}
                  onChange={(e) => updVis({ insetErrorType: e.target.value })}
                  className="dv-select"
                  style={{ width: "100%" }}
                >
                  <option value="none">None</option>
                  <option value="sem">SEM</option>
                  <option value="sd">SD</option>
                </select>
              </div>
              {vis.insetErrorType !== "none" && (
                <SliderControl
                  label="Error stroke width"
                  value={vis.insetErrorStrokeWidth}
                  min={0.2}
                  max={3}
                  step={0.1}
                  onChange={sv("insetErrorStrokeWidth")}
                />
              )}
            </div>

            {/* Points */}
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Points
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="dv-label">Show</span>
                <input
                  type="checkbox"
                  checked={vis.insetShowPoints}
                  onChange={(e) => updVis({ insetShowPoints: e.target.checked })}
                  style={{ accentColor: "var(--accent-primary)" }}
                />
              </div>
              {vis.insetShowPoints && (
                <>
                  <div>
                    <div className="dv-label">Color</div>
                    <ColorInput
                      value={vis.insetPointColor}
                      onChange={sv("insetPointColor")}
                      size={24}
                    />
                  </div>
                  <SliderControl
                    label="Size"
                    value={vis.insetPointSize}
                    displayValue={vis.insetPointSize}
                    min={1}
                    max={6}
                    step={0.5}
                    onChange={sv("insetPointSize")}
                  />
                </>
              )}
            </div>

            {/* Per-condition colors */}
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Condition colors
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stats
                .filter((s) => s.enabled)
                .map((s) => (
                  <div
                    key={s.prefix}
                    style={{
                      padding: "6px 8px",
                      background: "var(--surface-sunken)",
                      borderRadius: 5,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {s.label}
                    </div>
                    <ColorInput
                      value={insetColors[s.prefix] || s.color}
                      onChange={(v) => setInsetColors((prev) => ({ ...prev, [s.prefix]: v }))}
                      size={18}
                    />
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SampleSelectionOverlay({
  showColumnOverlay,
  setShowColumnOverlay,
  poolReplicates,
  handlePoolChange,
  colInfo,
  columnEnabled,
  handleColumnToggle,
}) {
  return (
    <div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          onClick={() => setShowColumnOverlay(!showColumnOverlay)}
          style={{
            padding: "7px 16px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
            background: showColumnOverlay ? "#f59e0b" : "var(--warning-bg)",
            color: showColumnOverlay ? "#fff" : "var(--warning-text)",
            border: "2px solid #f59e0b",
            boxShadow: "0 2px 10px rgba(245,158,11,0.3)",
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
              border: "2px solid #f59e0b",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              padding: "12px 14px",
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                Column grouping
              </p>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { val: true, label: "Pool by name" },
                  { val: false, label: "Individual" },
                ].map(({ val, label }) => (
                  <button
                    key={label}
                    onClick={() => handlePoolChange(val)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 5,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: poolReplicates === val ? "#f59e0b" : "var(--surface)",
                      color: poolReplicates === val ? "#fff" : "var(--text-faint)",
                      border: `1px solid ${poolReplicates === val ? "#f59e0b" : "var(--border-strong)"}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
                return groups.map((g) => (
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
                      {g.name}
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
                              style={{ accentColor: "#f59e0b", width: 12, height: 12 }}
                            />
                            {showRep ? `rep${rep}` : h}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [rawText, setRawText] = useState(null);
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [sepOverride, setSepOverride] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState(null);
  const [formula, setFormula] = useState("none");
  const [Kr, setKr] = useState(DEFAULT_KR);
  const [Ktr, setKtr] = useState(DEFAULT_KTR);
  const [Kd, setKd] = useState(DEFAULT_KD);
  const [hillN, setHillN] = useState(DEFAULT_HILL_N);
  const [conditions, setConditions] = useState([]);
  const [poolReplicates, setPoolReplicates] = useState(true);
  const [columnEnabled, setColumnEnabled] = useState({});
  const visInit = {
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
  const [vis, updVis] = useReducer((s, a) => (a._reset ? { ...visInit } : { ...s, ...a }), visInit);
  const [step, setStep] = useState("upload");
  const [insetColors, setInsetColors] = useState({});

  const parsed = useMemo(() => (rawText ? parseData(rawText) : null), [rawText]);
  const calData = useMemo(() => {
    if (!parsed) return null;
    if (formula === "none") return parsed.data;
    if (formula === "hill") return calibrateHill(parsed.headers, parsed.data, Kd);
    if (formula === "generalized")
      return calibrateGeneralized(parsed.headers, parsed.data, Kr, Ktr, hillN);
    return calibrate(parsed.headers, parsed.data, Kr, Ktr);
  }, [parsed, formula, Kr, Ktr, Kd, hillN]);
  const stats = useMemo(
    () =>
      calData && parsed && conditions.length > 0
        ? computeCalStats(calData, parsed.headers, conditions)
        : [],
    [calData, parsed, conditions]
  );

  // Per-replicate sums for the inset barplot — computed from calData directly so SD/SEM
  // reflect variability across biological replicates, not across time points.
  const replicateSums = useMemo(() => {
    if (!calData || !stats.length) return [];
    const r0 = Math.max(0, Math.floor(vis.xStart));
    const r1 = Math.min(calData.length - 1, Math.ceil(vis.xEnd));
    return stats.map((s) => {
      const repSums = (s.activeColIndices || s.colIndices).map((ci) => {
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
      return { prefix: s.prefix, label: s.label, repSums };
    });
  }, [calData, stats, vis.xStart, vis.xEnd]);

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
      updVis({ yMin: Math.max(0, lo * 0.9), yMax: hi * 1.1 });
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
    const ic = { ...insetColors };
    allConds.forEach((c) => {
      if (!ic[c.prefix]) ic[c.prefix] = c.color;
    });
    setInsetColors(ic);
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
    const ic = {};
    detectedConds.forEach((c) => {
      ic[c.prefix] = c.color;
    });
    setInsetColors(ic);
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
    a.download = `calibrated_${fileName.replace(/\.[^.]+$/, "")}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const canNavigate = (s) => s === "upload" || (parsed && s !== "upload");

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
        toolName="aequorin"
        title="Aequorin Ca²⁺ Calibration"
        subtitle={`${FORMULA_DEFS[formula].label} — ${FORMULA_DEFS[formula].eq}`}
      />

      <StepNavBar
        steps={["upload", "configure", "plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={canNavigate}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
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
              color: parseError.startsWith("⚠️") ? "#92400e" : "#dc2626",
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
          setStep={setStep}
        />
      )}

      {step === "plot" && parsed && calData && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            {/* LEFT: controls panel */}
            <PlotControls
              stats={stats}
              conditions={conditions}
              setConditions={handleConditionsChange}
              vis={vis}
              updVis={updVis}
              plotPanelRef={plotPanelRef}
              downloadCalibrated={downloadCalibrated}
              resetAll={resetAll}
              insetColors={insetColors}
              setInsetColors={setInsetColors}
            />

            {/* RIGHT: chart area */}
            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {/* Non-sticky Combined / Faceted toggle — absolutely positioned
                  at the top-right so on landing it shares a row with the
                  sticky Sample-selection pill, but scrolls away normally
                  while Sample selection alone continues to stick. */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  zIndex: 19,
                }}
              >
                <div
                  role="group"
                  aria-label="Plot view"
                  style={{
                    display: "inline-flex",
                    border: "1px solid var(--accent-primary)",
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
                      background: !vis.faceted ? "var(--accent-primary)" : "transparent",
                      color: !vis.faceted ? "var(--on-accent)" : "var(--accent-primary)",
                      border: "none",
                      borderRight: "1px solid var(--accent-primary)",
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
                      background: vis.faceted ? "var(--accent-primary)" : "transparent",
                      color: vis.faceted ? "var(--on-accent)" : "var(--accent-primary)",
                      border: "none",
                    }}
                  >
                    Faceted
                  </button>
                </div>
              </div>
              {/* Sticky row: Sample selection */}
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <SampleSelectionOverlay
                  showColumnOverlay={vis.showColumnOverlay}
                  setShowColumnOverlay={(v) => updVis({ showColumnOverlay: v })}
                  poolReplicates={poolReplicates}
                  handlePoolChange={handlePoolChange}
                  colInfo={colInfo}
                  columnEnabled={columnEnabled}
                  handleColumnToggle={handleColumnToggle}
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
                insetColors={insetColors}
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Aequorin calibration">
    <App />
  </ErrorBoundary>
);
