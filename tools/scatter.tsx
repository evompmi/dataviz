// scatter.jsx — editable source. Run `npm run build` to compile to scatter.js
// Do NOT edit the .js file directly.

import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";
import { PlotSidebar } from "./_shell/PlotSidebar";
import { fmtTick, SHAPES, MARGIN, VBW, VBH, computeLinearRegression } from "./scatter/helpers";

const { useState, useMemo, useCallback, useEffect, useRef, forwardRef } = React;

const VIS_INIT_SCATTER = {
  xMin: null,
  xMax: null,
  yMin: null,
  yMax: null,
  xLabel: "",
  yLabel: "",
  plotTitle: "",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
};

// COLOR_PALETTES and interpolateColor are now globals from shared.js so that
// heatmap and scatter share the exact same colour-scale definitions.
// Pure helpers (fmtTick, SHAPES, MARGIN, VBW, VBH, computeLinearRegression)
// live in tools/scatter/helpers.ts.

// Palette strip

function PaletteStrip({
  palette,
  width,
  height = 12,
}: {
  palette: any;
  width?: any;
  height?: number;
}) {
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const n = 48;
  return (
    <div
      style={{
        display: "flex",
        width: width || "100%",
        height,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ flex: 1, background: interpolateColor(stops, i / (n - 1)) }} />
      ))}
    </div>
  );
}

// ── Shapes ──────────────────────────────────────────────────────────────────

function renderPoint(shape, cx, cy, r, props) {
  const { fill, fillOpacity, stroke, strokeWidth, key } = props;
  switch (shape) {
    case "triangle": {
      const bx = r * 0.866;
      const by = cy + r * 0.5;
      return (
        <polygon
          key={key}
          points={`${cx},${cy - r} ${cx - bx},${by} ${cx + bx},${by}`}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    case "square": {
      const s = r * 1.4;
      return (
        <rect
          key={key}
          x={cx - s / 2}
          y={cy - s / 2}
          width={s}
          height={s}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    case "cross": {
      const t = r * 0.35;
      return (
        <path
          key={key}
          d={`M${cx - r},${cy - t}H${cx - t}V${cy - r}H${cx + t}V${cy - t}H${cx + r}V${cy + t}H${cx + t}V${cy + r}H${cx - t}V${cy + t}H${cx - r}Z`}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
    default:
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
  }
}

// Shape preview for HTML UI
function ShapePreview({ shape, size = 16, color = "#666" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {renderPoint(shape, 8, 8, 6, { fill: color, fillOpacity: 1, stroke: "none", strokeWidth: 0 })}
    </svg>
  );
}

const ScatterChart = forwardRef<SVGSVGElement, any>(function ScatterChart(
  {
    data,
    rawData,
    xCol,
    yCol,
    xMin,
    xMax,
    yMin,
    yMax,
    xLabel,
    yLabel,
    title,
    plotBg,
    showGrid,
    gridColor,
    refLines,
    regression,
    regressionStats,
    pointColor,
    pointSize,
    pointOpacity,
    strokeColor,
    strokeWidth,
    colorMapCol,
    colorMapType,
    colorMapPalette,
    colorMapDiscrete,
    colorMapRange,
    sizeMapCol,
    sizeMapType,
    sizeMapMin,
    sizeMapMax,
    sizeMapDiscrete,
    sizeMapRange,
    shapeMapCol,
    shapeMapDiscrete,
    svgLegend,
  },
  ref
) {
  const w = VBW - MARGIN.left - MARGIN.right;
  const h = VBH - MARGIN.top - MARGIN.bottom;
  const legendItemWidth = (block) => {
    if (!block.items) return 88;
    const maxLen = block.items.reduce((m, it) => Math.max(m, (it.label || "").length), 0);
    return Math.max(88, Math.min(260, maxLen * 6.2 + 22));
  };
  const legendH = computeLegendHeight(svgLegend, VBW - MARGIN.left - MARGIN.right, legendItemWidth);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v) => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = (v) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);

  const getColor = (xVal, yVal, rowIdx) => {
    if (colorMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][colorMapCol] : null;
      if (raw != null && raw !== "") {
        if (colorMapType === "continuous") {
          const num = parseFloat(raw.replace(",", "."));
          if (!isNaN(num)) {
            const [cMin, cMax] = colorMapRange;
            const t = Math.max(0, Math.min(1, (num - cMin) / (cMax - cMin || 1)));
            return interpolateColor(COLOR_PALETTES[colorMapPalette] || COLOR_PALETTES.viridis, t);
          }
        } else {
          return colorMapDiscrete[raw] || pointColor;
        }
      }
    }
    return pointColor;
  };

  const getSize = (rowIdx) => {
    if (sizeMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][sizeMapCol] : null;
      if (raw != null && raw !== "") {
        if (sizeMapType === "continuous") {
          const num = parseFloat(raw.replace(",", "."));
          if (!isNaN(num)) {
            const [sMin, sMax] = sizeMapRange;
            const t = Math.max(0, Math.min(1, (num - sMin) / (sMax - sMin || 1)));
            return sizeMapMin + t * (sizeMapMax - sizeMapMin);
          }
        } else {
          return sizeMapDiscrete[raw] !== undefined ? sizeMapDiscrete[raw] : pointSize;
        }
      }
    }
    return pointSize;
  };

  const getShape = (rowIdx) => {
    if (shapeMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][shapeMapCol] : null;
      if (raw != null && raw !== "" && shapeMapDiscrete[raw] !== undefined) {
        return shapeMapDiscrete[raw];
      }
    }
    return "circle";
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VBW} ${VBH + legendH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title || "Scatter plot"}
    >
      <title>{title || "Scatter plot"}</title>
      <desc>{`Scatter plot with ${data.length} data point${data.length !== 1 ? "s" : ""}${xLabel ? `, X: ${xLabel}` : ""}${yLabel ? `, Y: ${yLabel}` : ""}`}</desc>
      <defs>
        <clipPath id="sc-clip">
          <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} />
        </clipPath>
      </defs>

      <g id="background">
        <rect x={0} y={0} width={VBW} height={VBH} fill={plotBg || "#fff"} />
      </g>
      <g id="plot-area-background">
        <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} fill={plotBg || "#fff"} />
      </g>

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

      <g id="reference-lines" clipPath="url(#sc-clip)">
        {refLines.map((rl) => {
          const isH = rl.dir === "h";
          const x1 = isH ? MARGIN.left : sx(rl.value);
          const x2 = isH ? MARGIN.left + w : sx(rl.value);
          const y1 = isH ? sy(rl.value) : MARGIN.top;
          const y2 = isH ? sy(rl.value) : MARGIN.top + h;
          if (
            (isH && (rl.value < yMin || rl.value > yMax)) ||
            (!isH && (rl.value < xMin || rl.value > xMax))
          )
            return null;
          return (
            <line
              key={rl.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={rl.color || "#444"}
              strokeWidth={rl.strokeWidth || 1.5}
              strokeDasharray={rl.dashed ? rl.dashArray || "7,4" : "none"}
            />
          );
        })}
      </g>

      <g id="reference-line-labels">
        {refLines.map((rl) => {
          if (!rl.label) return null;
          const isH = rl.dir === "h";
          if (isH) {
            if (rl.value < yMin || rl.value > yMax) return null;
            const lx = rl.labelSide === "left" ? MARGIN.left + 4 : MARGIN.left + w - 4;
            return (
              <text
                key={`lbl-${rl.id}`}
                x={lx}
                y={sy(rl.value) - 4}
                textAnchor={rl.labelSide === "left" ? "start" : "end"}
                fontSize="10"
                fill={rl.color || "#444"}
                fontFamily="sans-serif"
                fontStyle="italic"
              >
                {rl.label}
              </text>
            );
          } else {
            if (rl.value < xMin || rl.value > xMax) return null;
            const ly = rl.labelSide === "bottom" ? MARGIN.top + h - 4 : MARGIN.top + 12;
            return (
              <text
                key={`lbl-${rl.id}`}
                x={sx(rl.value) + 4}
                y={ly}
                textAnchor="start"
                fontSize="10"
                fill={rl.color || "#444"}
                fontFamily="sans-serif"
                fontStyle="italic"
              >
                {rl.label}
              </text>
            );
          }
        })}
      </g>

      <g
        id="data-points"
        clipPath="url(#sc-clip)"
        role="group"
        aria-label={`${data.length} data points`}
      >
        {data.map((row, ri) => {
          const xVal = row[xCol],
            yVal = row[yCol];
          if (xVal == null || yVal == null) return null;
          return renderPoint(getShape(ri), sx(xVal), sy(yVal), getSize(ri), {
            key: ri,
            fill: getColor(xVal, yVal, ri),
            fillOpacity: pointOpacity,
            stroke: strokeColor || "none",
            strokeWidth: strokeWidth || 0,
          });
        })}
      </g>

      {regression && regression.on && regressionStats && regressionStats.valid && (
        <g id="regression-line" clipPath="url(#sc-clip)">
          <line
            x1={sx(xMin)}
            y1={sy(regressionStats.slope * xMin + regressionStats.intercept)}
            x2={sx(xMax)}
            y2={sy(regressionStats.slope * xMax + regressionStats.intercept)}
            stroke={regression.color || "#dc2626"}
            strokeWidth={regression.strokeWidth || 1.5}
            strokeDasharray={regression.dashed ? "7,4" : "none"}
          />
        </g>
      )}

      {/* Regression stats label */}
      {regression &&
        regression.on &&
        regression.showStats &&
        regressionStats &&
        regressionStats.valid &&
        (() => {
          const pad = 8;
          const pos = regression.position || "tl";
          const tx = pos.endsWith("r") ? MARGIN.left + w - pad : MARGIN.left + pad;
          const ty = pos.startsWith("b") ? MARGIN.top + h - pad - 38 : MARGIN.top + pad;
          const anchor = pos.endsWith("r") ? "end" : "start";
          const s = regressionStats.slope;
          const b = regressionStats.intercept;
          const eq = `y = ${fmtTick(s)}·x ${b >= 0 ? "+" : "−"} ${fmtTick(Math.abs(b))}`;
          const r2 = `R² = ${Number.isFinite(regressionStats.r2) ? regressionStats.r2.toFixed(4) : "undefined"}`;
          const nTxt = `n = ${regressionStats.n}`;
          return (
            <g
              id="regression-stats"
              fontFamily="sans-serif"
              fontSize="11"
              fill={regression.color || "#dc2626"}
            >
              <text x={tx} y={ty + 10} textAnchor={anchor}>
                {eq}
              </text>
              <text x={tx} y={ty + 24} textAnchor={anchor}>
                {r2}
              </text>
              <text x={tx} y={ty + 38} textAnchor={anchor} fill="#888">
                {nTxt}
              </text>
            </g>
          );
        })()}

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
              {fmtTick(t)}
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
              {fmtTick(t)}
            </text>
          </g>
        ))}
      </g>

      {xLabel && (
        <g id="x-axis-label">
          <text
            x={MARGIN.left + w / 2}
            y={VBH - 6}
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
      {title && (
        <g id="title">
          <text
            x={VBW / 2}
            y={16}
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="#222"
            fontFamily="sans-serif"
          >
            {title}
          </text>
        </g>
      )}
      {renderSvgLegend(
        svgLegend,
        VBH + 10,
        MARGIN.left,
        VBW - MARGIN.left - MARGIN.right,
        legendItemWidth
      )}
    </svg>
  );
});

// Local style constants retired — chrome elements now use the dv-* CSS
// classes (dv-input-num, dv-btn-secondary, dv-select) from components.css.

// Aesthetic box themes
const aesTheme = {
  color: {
    bg: "var(--aes-color-bg)",
    border: "var(--aes-color-border)",
    header: "var(--aes-color-header)",
    label: "Color",
  },
  size: {
    bg: "var(--aes-size-bg)",
    border: "var(--aes-size-border)",
    header: "var(--aes-size-header)",
    label: "Size",
  },
  shape: {
    bg: "var(--aes-shape-bg)",
    border: "var(--aes-shape-border)",
    header: "var(--aes-shape-header)",
    label: "Shape",
  },
};

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
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
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
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
          fontFamily: "inherit",
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

function AesBox({ theme, children }) {
  const t = aesTheme[theme];
  return (
    <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
      <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
          }}
        >
          {t.label}
        </span>
      </div>
      <div style={{ padding: "12px 14px", minHeight: 40 }}>{children}</div>
    </div>
  );
}

// ── Upload Step ────────────────────────────────────────────────────────────

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
        exampleLabel="Fisher's Iris dataset (150 rows, 3 species)"
        hint="CSV · TSV · TXT — one column per variable, one row per point · 2 MB max"
      />
      <HowToCard
        toolName="scatter"
        title="Scatter Plot — How to use"
        subtitle="Upload → Pick X & Y → Map color, size, shape"
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
            One <strong>row</strong> = one data point. One <strong>column</strong> = one variable.
            Any number of columns, any mix of numeric and text.
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
            X & Y selection
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            After upload, pick any <strong>numeric</strong> column for <strong>X</strong> and{" "}
            <strong>Y</strong> via dropdowns. The plot updates instantly.
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
            Aesthetics
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Map any column to <strong>color</strong>, <strong>size</strong>, or{" "}
            <strong>shape</strong>. Numeric columns get continuous scales; categorical columns get
            discrete legends.
          </p>
        </div>

        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "X/Y dropdown selection",
            "Color / size / shape mapping",
            "Row filtering",
            "8 gradient palettes",
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
      </HowToCard>
    </div>
  );
}

// ── Plot Step ──────────────────────────────────────────────────────────────

function PlotStep({
  parsed,
  fileName,
  filteredData,
  filteredRawRows,
  activeColIdxs,
  xCol,
  setXCol,
  yCol,
  setYCol,
  numericCols,
  pointColor,
  setPointColor,
  pointSize,
  setPointSize,
  pointOpacity,
  setPointOpacity,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  colorMapCol,
  setColorMapCol,
  colorMapType,
  colorMapPalette,
  setColorMapPalette,
  colorMapDiscrete,
  setColorMapDiscrete,
  colorMapCategories,
  colorMapRange,
  sizeMapCol,
  setSizeMapCol,
  sizeMapType,
  sizeMapMin,
  setSizeMapMin,
  sizeMapMax,
  setSizeMapMax,
  sizeMapDiscrete,
  setSizeMapDiscrete,
  sizeMapCategories,
  sizeMapRange,
  shapeMapCol,
  setShapeMapCol,
  shapeMapCategories,
  shapeMapDiscrete,
  setShapeMapDiscrete,
  shapeWarning,
  vis,
  updVis,
  autoAxis,
  effAxis,
  refLines,
  addRefLine,
  updateRefLine,
  removeRefLine,
  regression,
  updRegression,
  regressionStats,
  filterState,
  setFilterState,
  filterableCols,
  uniqueVals,
  mappableCols,
  resetAll,
  svgRef,
  svgLegend,
}) {
  const hasColorMap = colorMapCol != null;
  const hasSizeMap = sizeMapCol != null;
  const hasShapeMap = shapeMapCol != null;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersPanelRef = useRef(null);
  useEffect(() => {
    if (!filtersOpen) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(filtersPanelRef.current));
  }, [filtersOpen]);
  const handleFilterToggle = (ci, v, vals, checked) => {
    setFilterState((prev) => {
      const curr = prev[ci] || [];
      if (curr.length === 0) {
        return { ...prev, [ci]: vals.filter((x) => x !== v) };
      } else if (checked) {
        const next = [...curr, v];
        return { ...prev, [ci]: next.length === vals.length ? [] : next };
      } else {
        return { ...prev, [ci]: curr.filter((x) => x !== v) };
      }
    });
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* LEFT: controls panel */}
      <PlotSidebar>
        {/* Actions */}
        <ActionsPanel
          onDownloadSvg={() =>
            downloadSvg(svgRef.current, `${fileBaseName(fileName, "scatter")}_scatter.svg`)
          }
          onDownloadPng={() =>
            downloadPng(svgRef.current, `${fileBaseName(fileName, "scatter")}_scatter.png`)
          }
          onReset={resetAll}
          extraDownloads={[
            {
              label: "CSV",
              title:
                "Download the filtered data table — only the columns and rows currently drawn on the plot",
              onClick: () =>
                downloadCsv(
                  activeColIdxs.map((i) => parsed.headers[i]),
                  filteredRawRows.map((r) => activeColIdxs.map((i) => r[i])),
                  `${fileBaseName(fileName, "scatter")}_scatter.csv`
                ),
            },
          ]}
        />

        {/* X / Y selection */}
        <div className="dv-panel">
          <p
            style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
          >
            Variables
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div className="dv-label">X axis</div>
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
            </div>
            <div>
              <div className="dv-label">Y axis</div>
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
            </div>
          </div>
        </div>

        {/* Point defaults */}
        <ControlSection title="Point style" defaultOpen>
          {!hasColorMap && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Color</span>
              <ColorInput value={pointColor} onChange={setPointColor} size={22} />
            </div>
          )}
          {!hasSizeMap && (
            <SliderControl
              label="Size"
              value={pointSize}
              min={1}
              max={20}
              step={0.5}
              onChange={setPointSize}
            />
          )}
          <SliderControl
            label="Opacity"
            value={pointOpacity}
            displayValue={pointOpacity.toFixed(2)}
            min={0.05}
            max={1}
            step={0.05}
            onChange={setPointOpacity}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Stroke</span>
            <ColorInput value={strokeColor} onChange={setStrokeColor} size={20} />
          </div>
          <SliderControl
            label="Stroke width"
            value={strokeWidth}
            min={0}
            max={3}
            step={0.25}
            onChange={setStrokeWidth}
          />
        </ControlSection>

        {/* Regression / trend line */}
        <div className="dv-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: regression.on ? 10 : 0,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              Regression line
            </p>
            <div
              style={{
                display: "flex",
                borderRadius: 6,
                overflow: "hidden",
                border: "1px solid var(--border-strong)",
                flexShrink: 0,
              }}
            >
              {(["off", "on"] as const).map((mode) => {
                const active = mode === "on" ? regression.on : !regression.on;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updRegression({ on: mode === "on" })}
                    style={{
                      padding: "4px 12px",
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
          {regression.on && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {!regressionStats.valid && (
                <div style={{ fontSize: 11, color: "var(--danger-text)" }}>
                  Need ≥ 2 points with variation in X.
                </div>
              )}
              {regressionStats.valid && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                    padding: "6px 8px",
                    background: "var(--surface-subtle)",
                    borderRadius: 4,
                    border: "1px solid #eee",
                  }}
                >
                  <div>
                    slope: <strong>{fmtTick(regressionStats.slope)}</strong>
                  </div>
                  <div>
                    intercept: <strong>{fmtTick(regressionStats.intercept)}</strong>
                  </div>
                  <div>
                    R²:{" "}
                    <strong>
                      {Number.isFinite(regressionStats.r2)
                        ? regressionStats.r2.toFixed(4)
                        : "undefined"}
                    </strong>{" "}
                    &nbsp; n = {regressionStats.n}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Color</span>
                <ColorInput
                  value={regression.color}
                  onChange={(v) => updRegression({ color: v })}
                  size={22}
                />
              </div>
              <SliderControl
                label="Width"
                value={regression.strokeWidth}
                min={0.5}
                max={6}
                step={0.25}
                onChange={(v) => updRegression({ strokeWidth: v })}
              />
              <div>
                <span className="dv-label">Dashed</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? regression.dashed : !regression.dashed;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updRegression({ dashed: mode === "on" })}
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
              <div>
                <span className="dv-label">Show equation &amp; R² on plot</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? regression.showStats : !regression.showStats;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updRegression({ showStats: mode === "on" })}
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
              {regression.showStats && (
                <div>
                  <div className="dv-label">Label position</div>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 6,
                      overflow: "hidden",
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    {(["tl", "tr", "bl", "br"] as const).map((pos) => {
                      const active = regression.position === pos;
                      const cx = pos === "tl" || pos === "bl" ? 6 : 18;
                      const cy = pos === "tl" || pos === "tr" ? 5 : 13;
                      const fg = active ? "var(--on-accent)" : "var(--text-muted)";
                      return (
                        <button
                          key={pos}
                          type="button"
                          title={
                            pos === "tl"
                              ? "top-left"
                              : pos === "tr"
                                ? "top-right"
                                : pos === "bl"
                                  ? "bottom-left"
                                  : "bottom-right"
                          }
                          onClick={() => updRegression({ position: pos })}
                          style={{
                            flex: 1,
                            padding: "5px 0 3px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            border: "none",
                            background: active ? "var(--accent-primary)" : "var(--surface)",
                            transition: "background 120ms ease, color 120ms ease",
                          }}
                        >
                          <svg width={24} height={18} viewBox="0 0 24 18" aria-hidden="true">
                            <rect
                              x={1}
                              y={1}
                              width={22}
                              height={16}
                              fill="none"
                              stroke={fg}
                              strokeWidth={1.2}
                              rx={1.5}
                            />
                            <circle cx={cx} cy={cy} r={2.2} fill={fg} />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reference lines */}
        <ControlSection title="Reference line">
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => addRefLine("h")}
              className="dv-btn dv-btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              + H
            </button>
            <button
              onClick={() => addRefLine("v")}
              className="dv-btn dv-btn-secondary"
              style={{ fontSize: 11, padding: "4px 10px" }}
            >
              + V
            </button>
          </div>
          {refLines.length === 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-faint)" }}>
              No reference lines.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {refLines.map((rl) => (
              <div
                key={rl.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "8px 10px",
                  background: "var(--surface-subtle)",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: "var(--info-bg)",
                      color: "var(--info-text)",
                    }}
                  >
                    {rl.dir === "h" ? "Y =" : "X ="}
                  </span>
                  <NumberInput
                    value={rl.value}
                    step="any"
                    onChange={(e) => updateRefLine(rl.id, "value", Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => removeRefLine(rl.id)}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 5,
                      fontSize: 12,
                      cursor: "pointer",
                      background: "var(--surface)",
                      border: "1px solid var(--danger-border)",
                      color: "var(--danger-text)",
                      fontFamily: "inherit",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <ColorInput
                  value={rl.color}
                  onChange={(v) => updateRefLine(rl.id, "color", v)}
                  size={22}
                />
                <SliderControl
                  label="Width"
                  value={rl.strokeWidth}
                  min={0.5}
                  max={6}
                  step={0.25}
                  onChange={(v) => updateRefLine(rl.id, "strokeWidth", v)}
                />
                <div>
                  <span className="dv-label">Dashed</span>
                  <div
                    style={{
                      display: "flex",
                      borderRadius: 6,
                      overflow: "hidden",
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    {(["off", "on"] as const).map((mode) => {
                      const active = mode === "on" ? rl.dashed : !rl.dashed;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => updateRefLine(rl.id, "dashed", mode === "on")}
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
                {rl.dashed && (
                  <select
                    value={rl.dashArray}
                    onChange={(e) => updateRefLine(rl.id, "dashArray", e.target.value)}
                    className="dv-select"
                    style={{ fontSize: 11, width: "100%" }}
                  >
                    <option value="7,4">— — —</option>
                    <option value="3,3">· · · ·</option>
                    <option value="12,4">—— ——</option>
                    <option value="10,4,2,4">— · — ·</option>
                    <option value="2,2">·· ··</option>
                  </select>
                )}
                <input
                  value={rl.label}
                  placeholder="label"
                  onChange={(e) => updateRefLine(rl.id, "label", e.target.value)}
                  className="dv-input-num"
                  style={{ width: "100%", textAlign: "left" }}
                />
                {rl.label && (
                  <select
                    value={rl.labelSide}
                    onChange={(e) => updateRefLine(rl.id, "labelSide", e.target.value)}
                    className="dv-select"
                    style={{ fontSize: 11, width: "100%" }}
                  >
                    {rl.dir === "h" ? (
                      <>
                        <option value="right">right</option>
                        <option value="left">left</option>
                      </>
                    ) : (
                      <>
                        <option value="top">top</option>
                        <option value="bottom">bottom</option>
                      </>
                    )}
                  </select>
                )}
              </div>
            ))}
          </div>
        </ControlSection>

        {/* ── Color aesthetic ── */}
        <AesBox theme="color">
          <select
            value={colorMapCol == null ? "" : colorMapCol}
            onChange={(e) =>
              setColorMapCol(e.target.value === "" ? null : parseInt(e.target.value))
            }
            className="dv-select"
            style={{ width: "100%", marginBottom: hasColorMap ? 8 : 0 }}
          >
            <option value="">— None —</option>
            {mappableCols
              .filter((i) => i !== sizeMapCol && i !== shapeMapCol)
              .map((i) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
          </select>

          {hasColorMap && colorMapType && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Detected:{" "}
                <strong style={{ color: colorMapType === "continuous" ? "#7c3aed" : "#0369a1" }}>
                  {colorMapType === "continuous"
                    ? "numeric (continuous)"
                    : `categorical (${colorMapCategories.length} groups)`}
                </strong>
              </div>

              {colorMapType === "continuous" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <select
                    value={colorMapPalette}
                    onChange={(e) => setColorMapPalette(e.target.value)}
                    className="dv-select"
                    style={{ width: "100%", fontSize: 11 }}
                  >
                    {Object.keys(COLOR_PALETTES).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <PaletteStrip palette={colorMapPalette} />
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    range: {fmtTick(colorMapRange[0])} → {fmtTick(colorMapRange[1])}
                  </span>
                </div>
              )}

              {colorMapType === "discrete" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  {colorMapCategories.map((cat, ci) => (
                    <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <ColorInput
                        value={colorMapDiscrete[cat] || PALETTE[ci % PALETTE.length]}
                        onChange={(v) => setColorMapDiscrete((prev) => ({ ...prev, [cat]: v }))}
                        size={18}
                      />
                      <span style={{ fontSize: 12, color: "var(--text)" }}>{cat}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </AesBox>

        {/* ── Size aesthetic ── */}
        <AesBox theme="size">
          <select
            value={sizeMapCol == null ? "" : sizeMapCol}
            onChange={(e) => setSizeMapCol(e.target.value === "" ? null : parseInt(e.target.value))}
            className="dv-select"
            style={{ width: "100%", marginBottom: hasSizeMap ? 8 : 0 }}
          >
            <option value="">— None —</option>
            {mappableCols
              .filter((i) => i !== colorMapCol && i !== shapeMapCol)
              .map((i) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
          </select>

          {hasSizeMap && sizeMapType && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Detected:{" "}
                <strong style={{ color: sizeMapType === "continuous" ? "#7c3aed" : "#0369a1" }}>
                  {sizeMapType === "continuous"
                    ? "numeric (continuous)"
                    : `categorical (${sizeMapCategories.length} groups)`}
                </strong>
              </div>

              {sizeMapType === "continuous" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <SliderControl
                    label="Min size"
                    value={sizeMapMin}
                    min={1}
                    max={20}
                    step={0.5}
                    onChange={setSizeMapMin}
                  />
                  <SliderControl
                    label="Max size"
                    value={sizeMapMax}
                    min={1}
                    max={30}
                    step={0.5}
                    onChange={setSizeMapMax}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                    range: {fmtTick(sizeMapRange[0])} → {fmtTick(sizeMapRange[1])}
                  </span>
                </div>
              )}

              {sizeMapType === "discrete" && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: 160,
                    overflowY: "auto",
                  }}
                >
                  {sizeMapCategories.map((cat) => {
                    const val = sizeMapDiscrete[cat] !== undefined ? sizeMapDiscrete[cat] : 5;
                    return (
                      <SliderControl
                        key={cat}
                        label={cat}
                        value={val}
                        min={1}
                        max={20}
                        step={0.5}
                        onChange={(v) => setSizeMapDiscrete((prev) => ({ ...prev, [cat]: v }))}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </AesBox>

        {/* ── Shape aesthetic ── */}
        <AesBox theme="shape">
          <select
            value={shapeMapCol == null ? "" : shapeMapCol}
            onChange={(e) =>
              setShapeMapCol(e.target.value === "" ? null : parseInt(e.target.value))
            }
            className="dv-select"
            style={{ width: "100%", marginBottom: hasShapeMap ? 8 : 0 }}
          >
            <option value="">— None —</option>
            {mappableCols
              .filter((i) => i !== colorMapCol && i !== sizeMapCol)
              .map((i) => (
                <option key={i} value={i}>
                  {parsed.headers[i]}
                </option>
              ))}
          </select>

          {hasShapeMap && (
            <>
              {shapeWarning && (
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: "var(--danger-bg)",
                    border: "1px solid #fca5a5",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--danger-text)" }}>{shapeWarning}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                {shapeMapCategories.map((cat, ci) => (
                  <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length]}
                      onChange={(e) =>
                        setShapeMapDiscrete((prev) => ({ ...prev, [cat]: e.target.value }))
                      }
                      className="dv-select"
                      style={{ fontSize: 11, width: 90 }}
                    >
                      {SHAPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ShapePreview
                      shape={shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length]}
                      color="#666"
                    />
                    <span style={{ fontSize: 12, color: "var(--text)" }}>{cat}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </AesBox>

        {/* Axes */}
        <ControlSection title="Axes">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="dv-label">X min</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.xMin != null ? vis.xMin : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.xMin) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ xMin: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="dv-label">X max</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.xMax != null ? vis.xMax : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.xMax) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ xMax: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="dv-label">Y min</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.yMin != null ? vis.yMin : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.yMin) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ yMin: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="dv-label">Y max</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={vis.yMax != null ? vis.yMax : ""}
                  placeholder={"auto (" + fmtTick(autoAxis.yMax) + ")"}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    updVis({ yMax: v === "" ? null : Number(v) });
                  }}
                  className="dv-input-num"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div>
              <div className="dv-label">X label</div>
              <input
                value={vis.xLabel}
                onChange={(e) => updVis({ xLabel: e.target.value })}
                className="dv-input-num"
                style={{ width: "100%", textAlign: "left" }}
              />
            </div>
            <div>
              <div className="dv-label">Y label</div>
              <input
                value={vis.yLabel}
                onChange={(e) => updVis({ yLabel: e.target.value })}
                className="dv-input-num"
                style={{ width: "100%", textAlign: "left" }}
              />
            </div>
            <div>
              <div className="dv-label">Title</div>
              <input
                value={vis.plotTitle}
                onChange={(e) => updVis({ plotTitle: e.target.value })}
                className="dv-input-num"
                style={{ width: "100%", textAlign: "left" }}
              />
            </div>
          </div>
        </ControlSection>

        {/* Style */}
        <ControlSection title="Style" defaultOpen>
          <BaseStyleControls
            plotBg={vis.plotBg}
            onPlotBgChange={(v) => updVis({ plotBg: v })}
            showGrid={vis.showGrid}
            onShowGridChange={(v) => updVis({ showGrid: v })}
            gridColor={vis.gridColor}
            onGridColorChange={(v) => updVis({ gridColor: v })}
          />
        </ControlSection>

        {/* Filters (collapsible) */}
        {filterableCols.length > 0 && (
          <div ref={filtersPanelRef} className="dv-panel">
            <div
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <span
                className={"dv-disclosure" + (filtersOpen ? " dv-disclosure-open" : "")}
                aria-hidden="true"
              />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
                Filters
              </p>
              <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                {filteredData.length} of {parsed.data.length} rows
              </span>
            </div>
            {filtersOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  marginTop: 10,
                  maxHeight: 300,
                  overflowY: "auto",
                }}
              >
                {filterableCols.map((ci) => {
                  const vals = uniqueVals(ci);
                  if (vals.length === 0 || vals.length > 30) return null;
                  const allowed = filterState[ci] || [];
                  const allChecked = allowed.length === 0;
                  return (
                    <div key={ci}>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
                          {parsed.headers[ci]}
                        </span>
                        <button
                          onClick={() => setFilterState((prev) => ({ ...prev, [ci]: [] }))}
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 4,
                            cursor: "pointer",
                            border: "1px solid #ccc",
                            background: "var(--surface-sunken)",
                            color: "var(--text-muted)",
                            fontFamily: "inherit",
                          }}
                        >
                          all
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {vals.map((v) => {
                          const checked = allChecked || allowed.includes(v);
                          return (
                            <label
                              key={v}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: checked ? "var(--info-bg)" : "var(--surface-subtle)",
                                border: `1px solid ${checked ? "var(--info-border)" : "var(--border)"}`,
                                cursor: "pointer",
                                color: checked ? "var(--info-text)" : "var(--text-faint)",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => handleFilterToggle(ci, v, vals, e.target.checked)}
                                style={{ accentColor: "var(--cta-primary-bg)", margin: 0 }}
                              />
                              {v}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </PlotSidebar>

      {/* RIGHT: chart area */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          <ScatterChart
            ref={svgRef}
            data={filteredData}
            rawData={filteredRawRows}
            xCol={xCol}
            yCol={yCol}
            xMin={effAxis.xMin}
            xMax={effAxis.xMax}
            yMin={effAxis.yMin}
            yMax={effAxis.yMax}
            xLabel={vis.xLabel}
            yLabel={vis.yLabel}
            title={vis.plotTitle}
            plotBg={vis.plotBg}
            showGrid={vis.showGrid}
            gridColor={vis.gridColor}
            refLines={refLines}
            regression={regression}
            regressionStats={regressionStats}
            pointColor={pointColor}
            pointSize={pointSize}
            pointOpacity={pointOpacity}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            colorMapCol={colorMapCol}
            colorMapType={colorMapType}
            colorMapPalette={colorMapPalette}
            colorMapDiscrete={colorMapDiscrete}
            colorMapRange={colorMapRange}
            sizeMapCol={sizeMapCol}
            sizeMapType={sizeMapType}
            sizeMapMin={sizeMapMin}
            sizeMapMax={sizeMapMax}
            sizeMapDiscrete={sizeMapDiscrete}
            sizeMapRange={sizeMapRange}
            shapeMapCol={shapeMapCol}
            shapeMapDiscrete={shapeMapDiscrete}
            svgLegend={svgLegend}
          />
        </div>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

let refLineCounter = 0;

function App() {
  const shell = usePlotToolState("scatter", VIS_INIT_SCATTER);
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

  const [rawText, setRawText] = useState(null);

  // Column selection
  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState(1);

  // Point defaults
  const [pointColor, setPointColor] = useState("#648FFF");
  const [pointSize, setPointSize] = useState(5);
  const [pointOpacity, setPointOpacity] = useState(0.8);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(1);

  // Aesthetic mappings
  const [colorMapCol, setColorMapCol] = useState(null);
  const [colorMapPalette, setColorMapPalette] = useState("viridis");
  const [colorMapDiscrete, setColorMapDiscrete] = useState({});

  const [sizeMapCol, setSizeMapCol] = useState(null);
  const [sizeMapMin, setSizeMapMin] = useState(3);
  const [sizeMapMax, setSizeMapMax] = useState(15);
  const [sizeMapDiscrete, setSizeMapDiscrete] = useState({});

  const [shapeMapCol, setShapeMapCol] = useState(null);
  const [shapeMapDiscrete, setShapeMapDiscrete] = useState({});

  // Filter state
  const [filterState, setFilterState] = useState<Record<string, string[]>>({});

  const [refLines, setRefLines] = useState([]);

  // Regression line
  const [regression, setRegression] = useState({
    on: false,
    color: "#dc2626",
    strokeWidth: 1.5,
    dashed: false,
    showStats: true,
    position: "tl",
  });
  const updRegression = (patch) => setRegression((prev) => ({ ...prev, ...patch }));
  const svgRef = useRef();
  const sepRef = useRef("");

  const parsed = useMemo(() => (rawText ? parseData(rawText, sepRef.current) : null), [rawText]);

  // Numeric column detection
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

  // All column indices (active = not X or Y)
  const activeColIdxs = useMemo(() => (parsed ? parsed.headers.map((_, i) => i) : []), [parsed]);

  // Columns available for aesthetic mapping (everything except X and Y)
  const mappableCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce((acc, _, i) => (i !== xCol && i !== yCol ? [...acc, i] : acc), []);
  }, [parsed, xCol, yCol]);

  // Columns available for filtering (non-X, non-Y, non-aesthetic, categorical with ≤30 values)
  const filterableCols = useMemo(() => {
    if (!parsed) return [];
    return mappableCols.filter((i) => {
      const vals = [
        ...new Set(parsed.rawData.map((r) => r[i]).filter((v) => v != null && v !== "")),
      ];
      return vals.length > 0 && vals.length <= 30;
    });
  }, [parsed, mappableCols]);

  // Apply filterState to rows
  const filteredIndices = useMemo(() => {
    if (!parsed) return [];
    return parsed.rawData.reduce<number[]>((acc, row, ri) => {
      for (const [ci, allowed] of Object.entries(filterState)) {
        if (allowed.length > 0 && !allowed.includes(row[parseInt(ci)])) return acc;
      }
      acc.push(ri);
      return acc;
    }, []);
  }, [parsed, filterState]);

  const filteredData = useMemo(
    () => filteredIndices.map((i) => parsed.data[i]),
    [parsed, filteredIndices]
  );
  const filteredRawRows = useMemo(
    () => filteredIndices.map((i) => parsed.rawData[i]),
    [parsed, filteredIndices]
  );

  // Detect column type (numeric vs discrete)
  const detectColType = useCallback(
    (colIdx) => {
      if (colIdx == null || !parsed) return null;
      const vals = parsed.rawData.map((r) => r[colIdx]).filter((v) => v != null && v !== "");
      return vals.every((v) => isNumericValue(v)) ? "continuous" : "discrete";
    },
    [parsed]
  );

  const colorMapType = useMemo(() => detectColType(colorMapCol), [colorMapCol, detectColType]);
  const sizeMapType = useMemo(() => detectColType(sizeMapCol), [sizeMapCol, detectColType]);

  // Unique values (sorted)
  const uniqueVals = useCallback(
    (colIdx) => {
      if (colIdx == null || !parsed) return [];
      const vals = [
        ...new Set(parsed.rawData.map((r) => r[colIdx]).filter((v) => v != null && v !== "")),
      ];
      const allNum = vals.every((v) => isNumericValue(v));
      return allNum
        ? vals.sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", ".")))
        : vals.sort();
    },
    [parsed]
  );

  const colorMapCategories = useMemo(
    () => (colorMapType === "discrete" ? uniqueVals(colorMapCol) : []),
    [colorMapCol, colorMapType, uniqueVals]
  );
  const sizeMapCategories = useMemo(
    () => (sizeMapType === "discrete" ? uniqueVals(sizeMapCol) : []),
    [sizeMapCol, sizeMapType, uniqueVals]
  );
  const shapeMapCategories = useMemo(
    () => (shapeMapCol != null ? uniqueVals(shapeMapCol) : []),
    [shapeMapCol, uniqueVals]
  );

  const shapeWarning = useMemo(() => {
    if (shapeMapCategories.length > 4) {
      return `This column has ${shapeMapCategories.length} unique values — only 4 shapes are available. Categories beyond the 4th will cycle through the same shapes.`;
    }
    return null;
  }, [shapeMapCategories]);

  // Numeric ranges for continuous mappings
  const numericRange = useCallback(
    (colIdx) => {
      if (colIdx == null || !parsed) return [0, 1];
      const vals = parsed.rawData
        .map((r) => parseFloat((r[colIdx] || "").replace(",", ".")))
        .filter((v) => !isNaN(v));
      return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
    },
    [parsed]
  );

  const colorMapRange = useMemo(() => numericRange(colorMapCol), [colorMapCol, numericRange]);
  const sizeMapRange = useMemo(() => numericRange(sizeMapCol), [sizeMapCol, numericRange]);

  // Auto-assign discrete colors
  useEffect(() => {
    if (colorMapCategories.length === 0) {
      setColorMapDiscrete({});
      return;
    }
    setColorMapDiscrete((prev) => {
      const next = {};
      colorMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] || PALETTE[i % PALETTE.length];
      });
      return next;
    });
  }, [colorMapCategories]);

  // Auto-assign discrete sizes
  useEffect(() => {
    if (sizeMapCategories.length === 0) {
      setSizeMapDiscrete({});
      return;
    }
    setSizeMapDiscrete((prev) => {
      const next = {};
      sizeMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] !== undefined ? prev[cat] : 3 + i * 3;
      });
      return next;
    });
  }, [sizeMapCategories]);

  // Auto-assign discrete shapes
  useEffect(() => {
    if (shapeMapCategories.length === 0) {
      setShapeMapDiscrete({});
      return;
    }
    setShapeMapDiscrete((prev) => {
      const next = {};
      shapeMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] || SHAPES[i % SHAPES.length];
      });
      return next;
    });
  }, [shapeMapCategories]);

  // Reset axis overrides and labels when X/Y columns change
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

  // Auto-compute axis ranges from data (used as fallback when vis values are null)
  const autoAxis = useMemo(() => {
    if (!parsed || xCol == null || yCol == null) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const data = parsed.data;
    const xVals = data.map((r) => r[xCol]).filter((v) => v != null);
    const yVals = data.map((r) => r[yCol]).filter((v) => v != null);
    const xPad = xVals.length > 1 ? (Math.max(...xVals) - Math.min(...xVals)) * 0.05 : 0.5;
    const yPad = yVals.length > 1 ? (Math.max(...yVals) - Math.min(...yVals)) * 0.05 : 0.5;
    return {
      xMin: xVals.length ? Math.min(...xVals) - xPad : 0,
      xMax: xVals.length ? Math.max(...xVals) + xPad : 1,
      yMin: yVals.length ? Math.min(...yVals) - yPad : 0,
      yMax: yVals.length ? Math.max(...yVals) + yPad : 1,
    };
  }, [parsed, xCol, yCol]);

  // Linear regression over filtered data (simple y ~ x)
  const regressionStats = useMemo(
    () => computeLinearRegression(filteredData, xCol, yCol),
    [filteredData, xCol, yCol]
  );

  // Effective axis values: user override or auto
  const effAxis = {
    xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
    xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
    yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
    yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax,
  };

  // Clear aesthetic that refers to X or Y column
  useEffect(() => {
    if (colorMapCol === xCol || colorMapCol === yCol) setColorMapCol(null);
    if (sizeMapCol === xCol || sizeMapCol === yCol) setSizeMapCol(null);
    if (shapeMapCol === xCol || shapeMapCol === yCol) setShapeMapCol(null);
  }, [xCol, yCol]);

  // Build SVG legend
  const svgLegend = useMemo(() => {
    const items = [];
    const hasColorMap = colorMapCol != null;
    const hasSizeMap = sizeMapCol != null;
    const hasShapeMap = shapeMapCol != null;

    if (hasColorMap && colorMapType === "continuous") {
      const stops = COLOR_PALETTES[colorMapPalette] || COLOR_PALETTES.viridis;
      items.push({
        id: "legend-color",
        title: parsed.headers[colorMapCol],
        gradient: { stops, min: colorMapRange[0].toFixed(2), max: colorMapRange[1].toFixed(2) },
      });
    } else if (hasColorMap && colorMapType === "discrete") {
      items.push({
        id: "legend-color",
        title: parsed.headers[colorMapCol],
        items: colorMapCategories.map((c) => ({
          label: c,
          color: colorMapDiscrete[c] || "#999",
          shape: "dot",
        })),
      });
    }

    if (hasSizeMap && sizeMapType === "discrete") {
      items.push({
        id: "legend-size",
        title: parsed.headers[sizeMapCol],
        sizeItems: sizeMapCategories.map((c) => ({
          label: c,
          r: sizeMapDiscrete[c] || sizeMapMin,
        })),
      });
    } else if (hasSizeMap && sizeMapType === "continuous") {
      const sizeItems = Array.from({ length: 4 }, (_, i) => {
        const t = i / 3;
        return {
          label: (sizeMapRange[0] + t * (sizeMapRange[1] - sizeMapRange[0])).toFixed(1),
          r: sizeMapMin + t * (sizeMapMax - sizeMapMin),
        };
      });
      items.push({ id: "legend-size", title: parsed.headers[sizeMapCol], sizeItems });
    }

    if (hasShapeMap) {
      items.push({
        id: "legend-shape",
        title: parsed.headers[shapeMapCol],
        items: shapeMapCategories.map((c) => ({
          label: c,
          color: "var(--text-muted)",
          shape: shapeMapDiscrete[c] || "circle",
        })),
      });
    }

    return items.length > 0 ? items : null;
  }, [
    parsed,
    colorMapCol,
    colorMapType,
    colorMapPalette,
    colorMapDiscrete,
    colorMapCategories,
    colorMapRange,
    sizeMapCol,
    sizeMapType,
    sizeMapMin,
    sizeMapMax,
    sizeMapDiscrete,
    sizeMapCategories,
    sizeMapRange,
    shapeMapCol,
    shapeMapCategories,
    shapeMapDiscrete,
  ]);

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

    // Auto-assign X and Y to first two numeric columns
    const isNum = (idx) => {
      const vals = rawData.map((r) => r[idx]).filter((v) => v !== "" && v != null);
      return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
    };
    const nums = headers.reduce((acc, _, i) => (isNum(i) ? [...acc, i] : acc), []);
    setXCol(nums[0] !== undefined ? nums[0] : 0);
    setYCol(nums[1] !== undefined ? nums[1] : nums[0] !== undefined ? nums[0] : 1);

    // Reset aesthetics
    setColorMapCol(null);
    setColorMapDiscrete({});
    setSizeMapCol(null);
    setSizeMapDiscrete({});
    setShapeMapCol(null);
    setShapeMapDiscrete({});
    setFilterState({});
    setRefLines([]);
    setRegression({
      on: false,
      color: "#dc2626",
      strokeWidth: 1.5,
      dashed: false,
      showStats: true,
      position: "tl",
    });
    setPointColor("#648FFF");
    setPointSize(5);
    setPointOpacity(0.8);
    setStrokeColor("#000000");
    setStrokeWidth(1);

    setStep("plot");
  }, []);

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__SCATTER_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFileName("iris.csv");
    doParse(text, ",");
  }, [doParse]);

  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setStep("upload");
  };

  const addRefLine = (dir) =>
    setRefLines((prev) => [
      ...prev,
      {
        id: ++refLineCounter,
        dir,
        value: 0,
        color: "#dc2626",
        strokeWidth: 1.5,
        dashed: true,
        dashArray: "7,4",
        label: "",
        labelSide: dir === "h" ? "right" : "top",
      },
    ]);
  const updateRefLine = (id, key, val) =>
    setRefLines((prev) => prev.map((rl) => (rl.id === id ? { ...rl, [key]: val } : rl)));
  const removeRefLine = (id) => setRefLines((prev) => prev.filter((rl) => rl.id !== id));

  const canNavigate = (s) => {
    if (s === "upload") return true;
    if (s === "plot") return !!parsed;
    return false;
  };

  return (
    <PlotToolShell
      state={shell}
      toolName="scatter"
      title="Scatter Plot"
      subtitle="XY scatter — one row per data point, one column per variable"
      visInit={VIS_INIT_SCATTER}
      steps={["upload", "plot"]}
      canNavigate={canNavigate}
    >
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

      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed}
          fileName={fileName}
          filteredData={filteredData}
          filteredRawRows={filteredRawRows}
          activeColIdxs={activeColIdxs}
          xCol={xCol}
          setXCol={setXCol}
          yCol={yCol}
          setYCol={setYCol}
          numericCols={numericCols}
          pointColor={pointColor}
          setPointColor={setPointColor}
          pointSize={pointSize}
          setPointSize={setPointSize}
          pointOpacity={pointOpacity}
          setPointOpacity={setPointOpacity}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          colorMapCol={colorMapCol}
          setColorMapCol={setColorMapCol}
          colorMapType={colorMapType}
          colorMapPalette={colorMapPalette}
          setColorMapPalette={setColorMapPalette}
          colorMapDiscrete={colorMapDiscrete}
          setColorMapDiscrete={setColorMapDiscrete}
          colorMapCategories={colorMapCategories}
          colorMapRange={colorMapRange}
          sizeMapCol={sizeMapCol}
          setSizeMapCol={setSizeMapCol}
          sizeMapType={sizeMapType}
          sizeMapMin={sizeMapMin}
          setSizeMapMin={setSizeMapMin}
          sizeMapMax={sizeMapMax}
          setSizeMapMax={setSizeMapMax}
          sizeMapDiscrete={sizeMapDiscrete}
          setSizeMapDiscrete={setSizeMapDiscrete}
          sizeMapCategories={sizeMapCategories}
          sizeMapRange={sizeMapRange}
          shapeMapCol={shapeMapCol}
          setShapeMapCol={setShapeMapCol}
          shapeMapCategories={shapeMapCategories}
          shapeMapDiscrete={shapeMapDiscrete}
          setShapeMapDiscrete={setShapeMapDiscrete}
          shapeWarning={shapeWarning}
          vis={vis}
          updVis={updVis}
          autoAxis={autoAxis}
          effAxis={effAxis}
          refLines={refLines}
          addRefLine={addRefLine}
          updateRefLine={updateRefLine}
          removeRefLine={removeRefLine}
          regression={regression}
          updRegression={updRegression}
          regressionStats={regressionStats}
          filterState={filterState}
          setFilterState={setFilterState}
          filterableCols={filterableCols}
          uniqueVals={uniqueVals}
          mappableCols={mappableCols}
          resetAll={resetAll}
          svgRef={svgRef}
          svgLegend={svgLegend}
        />
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Scatter plot">
    <App />
  </ErrorBoundary>
);
