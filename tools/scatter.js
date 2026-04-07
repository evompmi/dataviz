const { useState, useReducer, useMemo, useCallback, useEffect, useRef, forwardRef } = React;
const COLOR_PALETTES = {
  viridis: ["#440154", "#3b528b", "#21908c", "#5dc963", "#fde725"],
  plasma: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
  rdbu: ["#b2182b", "#ef8a62", "#fddbc7", "#f7f7f7", "#d1e5f0", "#67a9cf", "#2166ac"],
  bwr: ["#0000ff", "#8888ff", "#ffffff", "#ff8888", "#ff0000"],
  reds: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  blues: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  greens: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  spectral: ["#9e0142", "#f46d43", "#fee08b", "#e6f598", "#66c2a5", "#3288bd", "#5e4fa2"]
};
function interpolateColor(stops, t) {
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length - 1];
  const seg = (stops.length - 1) * t;
  const i = Math.floor(seg), f = seg - i;
  const [r1, g1, b1] = hexToRgb(stops[i]);
  const [r2, g2, b2] = hexToRgb(stops[i + 1]);
  return rgbToHex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f);
}
function fmtTick(t) {
  if (t === 0) return "0";
  const abs = Math.abs(t);
  if (abs >= 1e4 || abs < 0.01 && abs > 0) return t.toExponential(1);
  if (abs >= 100) return t.toFixed(0);
  return parseFloat(t.toPrecision(3)).toString();
}
function PaletteStrip({ palette, width, height = 12 }) {
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const n = 48;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", width: width || "100%", height, borderRadius: 3, overflow: "hidden", border: "1px solid #ddd" } }, Array.from({ length: n }, (_, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, background: interpolateColor(stops, i / (n - 1)) } })));
}
const SHAPES = ["circle", "triangle", "cross", "square"];
function renderPoint(shape, cx, cy, r, props) {
  const { fill, fillOpacity, stroke, strokeWidth, key } = props;
  switch (shape) {
    case "triangle": {
      const bx = r * 0.866;
      const by = cy + r * 0.5;
      return /* @__PURE__ */ React.createElement(
        "polygon",
        {
          key,
          points: `${cx},${cy - r} ${cx - bx},${by} ${cx + bx},${by}`,
          fill,
          fillOpacity,
          stroke,
          strokeWidth
        }
      );
    }
    case "square": {
      const s = r * 1.4;
      return /* @__PURE__ */ React.createElement(
        "rect",
        {
          key,
          x: cx - s / 2,
          y: cy - s / 2,
          width: s,
          height: s,
          fill,
          fillOpacity,
          stroke,
          strokeWidth
        }
      );
    }
    case "cross": {
      const t = r * 0.35;
      return /* @__PURE__ */ React.createElement(
        "path",
        {
          key,
          d: `M${cx - r},${cy - t}H${cx - t}V${cy - r}H${cx + t}V${cy - t}H${cx + r}V${cy + t}H${cx + t}V${cy + r}H${cx - t}V${cy + t}H${cx - r}Z`,
          fill,
          fillOpacity,
          stroke,
          strokeWidth
        }
      );
    }
    default:
      return /* @__PURE__ */ React.createElement(
        "circle",
        {
          key,
          cx,
          cy,
          r,
          fill,
          fillOpacity,
          stroke,
          strokeWidth
        }
      );
  }
}
function ShapePreview({ shape, size = 16, color = "#666" }) {
  return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 16 16", style: { display: "block", flexShrink: 0 }, "aria-hidden": "true" }, renderPoint(shape, 8, 8, 6, { fill: color, fillOpacity: 1, stroke: "none", strokeWidth: 0 }));
}
const MARGIN = { top: 28, right: 28, bottom: 56, left: 70 };
const VBW = 800, VBH = 500;
const ScatterChart = forwardRef(function ScatterChart2({
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
  svgLegend
}, ref) {
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
  const sx = (v) => MARGIN.left + (v - xMin) / xRange * w;
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
          return sizeMapDiscrete[raw] !== void 0 ? sizeMapDiscrete[raw] : pointSize;
        }
      }
    }
    return pointSize;
  };
  const getShape = (rowIdx) => {
    if (shapeMapCol != null && rawData) {
      const raw = rawData[rowIdx] ? rawData[rowIdx][shapeMapCol] : null;
      if (raw != null && raw !== "" && shapeMapDiscrete[raw] !== void 0) {
        return shapeMapDiscrete[raw];
      }
    }
    return "circle";
  };
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${VBW} ${VBH + legendH}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": title || "Scatter plot"
    },
    /* @__PURE__ */ React.createElement("title", null, title || "Scatter plot"),
    /* @__PURE__ */ React.createElement("desc", null, `Scatter plot with ${data.length} data point${data.length !== 1 ? "s" : ""}${xLabel ? `, X: ${xLabel}` : ""}${yLabel ? `, Y: ${yLabel}` : ""}`),
    /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("clipPath", { id: "sc-clip" }, /* @__PURE__ */ React.createElement("rect", { x: MARGIN.left, y: MARGIN.top, width: w, height: h }))),
    /* @__PURE__ */ React.createElement("rect", { width: VBW, height: VBH, fill: plotBg || "#fff" }),
    /* @__PURE__ */ React.createElement("rect", { x: MARGIN.left, y: MARGIN.top, width: w, height: h, fill: plotBg || "#fff" }),
    showGrid && yTicks.map((t) => /* @__PURE__ */ React.createElement(
      "line",
      {
        key: t,
        x1: MARGIN.left,
        x2: MARGIN.left + w,
        y1: sy(t),
        y2: sy(t),
        stroke: gridColor || "#e0e0e0",
        strokeWidth: "0.5"
      }
    )),
    showGrid && xTicks.map((t) => /* @__PURE__ */ React.createElement(
      "line",
      {
        key: t,
        x1: sx(t),
        x2: sx(t),
        y1: MARGIN.top,
        y2: MARGIN.top + h,
        stroke: gridColor || "#e0e0e0",
        strokeWidth: "0.5"
      }
    )),
    /* @__PURE__ */ React.createElement("g", { clipPath: "url(#sc-clip)" }, refLines.map((rl) => {
      const isH = rl.dir === "h";
      const x1 = isH ? MARGIN.left : sx(rl.value);
      const x2 = isH ? MARGIN.left + w : sx(rl.value);
      const y1 = isH ? sy(rl.value) : MARGIN.top;
      const y2 = isH ? sy(rl.value) : MARGIN.top + h;
      if (isH && (rl.value < yMin || rl.value > yMax) || !isH && (rl.value < xMin || rl.value > xMax)) return null;
      return /* @__PURE__ */ React.createElement(
        "line",
        {
          key: rl.id,
          x1,
          y1,
          x2,
          y2,
          stroke: rl.color || "#444",
          strokeWidth: rl.strokeWidth || 1.5,
          strokeDasharray: rl.dashed ? rl.dashArray || "7,4" : "none"
        }
      );
    })),
    refLines.map((rl) => {
      if (!rl.label) return null;
      const isH = rl.dir === "h";
      if (isH) {
        if (rl.value < yMin || rl.value > yMax) return null;
        const lx = rl.labelSide === "left" ? MARGIN.left + 4 : MARGIN.left + w - 4;
        return /* @__PURE__ */ React.createElement(
          "text",
          {
            key: `lbl-${rl.id}`,
            x: lx,
            y: sy(rl.value) - 4,
            textAnchor: rl.labelSide === "left" ? "start" : "end",
            fontSize: "10",
            fill: rl.color || "#444",
            fontFamily: "sans-serif",
            fontStyle: "italic"
          },
          rl.label
        );
      } else {
        if (rl.value < xMin || rl.value > xMax) return null;
        const ly = rl.labelSide === "bottom" ? MARGIN.top + h - 4 : MARGIN.top + 12;
        return /* @__PURE__ */ React.createElement(
          "text",
          {
            key: `lbl-${rl.id}`,
            x: sx(rl.value) + 4,
            y: ly,
            textAnchor: "start",
            fontSize: "10",
            fill: rl.color || "#444",
            fontFamily: "sans-serif",
            fontStyle: "italic"
          },
          rl.label
        );
      }
    }),
    /* @__PURE__ */ React.createElement("g", { clipPath: "url(#sc-clip)", role: "group", "aria-label": `${data.length} data points` }, data.map((row, ri) => {
      const xVal = row[xCol], yVal = row[yCol];
      if (xVal == null || yVal == null) return null;
      return renderPoint(getShape(ri), sx(xVal), sy(yVal), getSize(ri), {
        key: ri,
        fill: getColor(xVal, yVal, ri),
        fillOpacity: pointOpacity,
        stroke: strokeColor || "none",
        strokeWidth: strokeWidth || 0
      });
    })),
    /* @__PURE__ */ React.createElement("rect", { x: MARGIN.left, y: MARGIN.top, width: w, height: h, fill: "none", stroke: "#333", strokeWidth: "1" }),
    xTicks.map((t) => /* @__PURE__ */ React.createElement("g", { key: t }, /* @__PURE__ */ React.createElement("line", { x1: sx(t), x2: sx(t), y1: MARGIN.top + h, y2: MARGIN.top + h + 5, stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: sx(t), y: MARGIN.top + h + 18, textAnchor: "middle", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, fmtTick(t)))),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("g", { key: t }, /* @__PURE__ */ React.createElement("line", { x1: MARGIN.left - 5, x2: MARGIN.left, y1: sy(t), y2: sy(t), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: MARGIN.left - 8, y: sy(t) + 4, textAnchor: "end", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, fmtTick(t)))),
    xLabel && /* @__PURE__ */ React.createElement("text", { x: MARGIN.left + w / 2, y: VBH - 6, textAnchor: "middle", fontSize: "13", fill: "#444", fontFamily: "sans-serif" }, xLabel),
    yLabel && /* @__PURE__ */ React.createElement("text", { transform: `translate(14,${MARGIN.top + h / 2}) rotate(-90)`, textAnchor: "middle", fontSize: "13", fill: "#444", fontFamily: "sans-serif" }, yLabel),
    title && /* @__PURE__ */ React.createElement("text", { x: VBW / 2, y: 16, textAnchor: "middle", fontSize: "15", fontWeight: "700", fill: "#222", fontFamily: "sans-serif" }, title),
    renderSvgLegend(svgLegend, VBH + 10, MARGIN.left, VBW - MARGIN.left - MARGIN.right, legendItemWidth)
  );
});
const scInp = { width: 80, background: "#fff", border: "1px solid #ccc", borderRadius: 4, color: "#333", padding: "4px 8px", fontSize: 13, textAlign: "center" };
const dlBtn = { padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#fff", border: "1px solid #ccc", color: "#555", fontFamily: "inherit" };
const selSt = { background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", color: "#333", cursor: "pointer" };
const aesTheme = {
  color: { bg: "#eef2ff", border: "#b0c4ff", header: "#4f6bff", label: "Color" },
  size: { bg: "#f0fdf4", border: "#86efac", header: "#16a34a", label: "Size" },
  shape: { bg: "#faf5ff", border: "#d8b4fe", header: "#9333ea", label: "Shape" }
};
function AesBox({ theme, children }) {
  const t = aesTheme[theme];
  return /* @__PURE__ */ React.createElement("div", { style: { borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg } }, /* @__PURE__ */ React.createElement("div", { style: { background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "#fff", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px" } }, t.label)), /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 14px", minHeight: 40 } }, children));
}
function UploadStep({ sepOverride, setSepOverride, rawText, doParse, handleFileLoad }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    UploadPanel,
    {
      sepOverride,
      onSepChange: (v) => {
        setSepOverride(v);
        if (rawText) doParse(rawText, v);
      },
      onFileLoad: handleFileLoad,
      hint: "CSV \xB7 TSV \xB7 TXT \u2014 one column per variable, one row per data point"
    }
  ), /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 12px", fontSize: 11, color: "#aaa", textAlign: "right" } }, "Max file size: 2 MB"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 24, borderRadius: 14, overflow: "hidden", border: "2px solid #648FFF", boxShadow: "0 4px 20px rgba(100,143,255,0.12)" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(135deg,#4a6cf7,#648FFF)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 } }, toolIcon("scatter", 24, { circle: true }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "#fff", fontWeight: 700, fontSize: 15 } }, "Scatter Plot \u2014 How to use"), /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 } }, "Upload \u2192 Pick X & Y \u2192 Map color, size, shape"))), /* @__PURE__ */ React.createElement("div", { style: { background: "#eef2ff", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Data layout"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, lineHeight: 1.75, color: "#444", margin: 0 } }, "One ", /* @__PURE__ */ React.createElement("strong", null, "row"), " = one data point. One ", /* @__PURE__ */ React.createElement("strong", null, "column"), " = one variable. Any number of columns, any mix of numeric and text.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "X & Y selection"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#444", margin: 0, lineHeight: 1.6 } }, "After upload, pick any ", /* @__PURE__ */ React.createElement("strong", null, "numeric"), " column for ", /* @__PURE__ */ React.createElement("strong", null, "X"), " and ", /* @__PURE__ */ React.createElement("strong", null, "Y"), " via dropdowns. The plot updates instantly.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "Aesthetics"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#444", margin: 0, lineHeight: 1.6 } }, "Map any column to ", /* @__PURE__ */ React.createElement("strong", null, "color"), ", ", /* @__PURE__ */ React.createElement("strong", null, "size"), ", or ", /* @__PURE__ */ React.createElement("strong", null, "shape"), ". Numeric columns get continuous scales; categorical columns get discrete legends.")), /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" } }, ["X/Y dropdown selection", "Color / size / shape mapping", "Row filtering", "8 gradient palettes", "100% browser-side"].map((t) => /* @__PURE__ */ React.createElement("span", { key: t, style: { fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "#fff", border: "1px solid #b0c4ff", color: "#555" } }, t))))));
}
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
  filterState,
  setFilterState,
  filterableCols,
  uniqueVals,
  mappableCols,
  resetAll,
  svgRef,
  svgLegend
}) {
  const hasColorMap = colorMapCol != null;
  const hasSizeMap = sizeMapCol != null;
  const hasShapeMap = shapeMapCol != null;
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 328, flexShrink: 0, position: "sticky", top: 24, maxHeight: "calc(100vh - 90px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#666", marginBottom: 4 } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, fileName), /* @__PURE__ */ React.createElement("span", { style: { color: "#999", marginLeft: 6 } }, parsed.data.length, " rows \xB7 ", parsed.headers.length, " cols"))), /* @__PURE__ */ React.createElement(
    ActionsPanel,
    {
      onDownloadSvg: () => downloadSvg(svgRef.current, `scatter_${fileName.replace(/\.[^.]+$/, "")}.svg`),
      onDownloadPng: () => downloadPng(svgRef.current, `scatter_${fileName.replace(/\.[^.]+$/, "")}.png`),
      onReset: resetAll,
      extraButtons: [
        {
          label: "Download CSV",
          onClick: (e) => {
            downloadCsv(activeColIdxs.map((i) => parsed.headers[i]), filteredRawRows.map((r) => activeColIdxs.map((i) => r[i])), `scatter_${fileName.replace(/\.[^.]+$/, "")}.csv`);
            flashSaved(e.currentTarget);
          },
          style: { padding: "8px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#dcfce7", border: "1px solid #86efac", color: "#166534", fontFamily: "inherit", width: "100%", fontWeight: 600 }
        }
      ]
    }
  ), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Variables"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X axis"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: xCol,
      onChange: (e) => setXCol(parseInt(e.target.value)),
      style: { ...selSt, width: "100%" }
    },
    numericCols.map((i) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, parsed.headers[i]))
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y axis"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: yCol,
      onChange: (e) => setYCol(parseInt(e.target.value)),
      style: { ...selSt, width: "100%" }
    },
    numericCols.map((i) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, parsed.headers[i]))
  )))), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Point style"), !hasColorMap && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#777" } }, "Color"), /* @__PURE__ */ React.createElement(ColorInput, { value: pointColor, onChange: setPointColor, size: 22 })), !hasSizeMap && /* @__PURE__ */ React.createElement(SliderControl, { label: "Size", value: pointSize, min: 1, max: 20, step: 0.5, onChange: setPointSize }), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Opacity",
      value: pointOpacity,
      displayValue: pointOpacity.toFixed(2),
      min: 0.05,
      max: 1,
      step: 0.05,
      onChange: setPointOpacity
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#777" } }, "Stroke"), /* @__PURE__ */ React.createElement(ColorInput, { value: strokeColor, onChange: setStrokeColor, size: 20 })), /* @__PURE__ */ React.createElement(SliderControl, { label: "Stroke width", value: strokeWidth, min: 0, max: 3, step: 0.25, onChange: setStrokeWidth })), /* @__PURE__ */ React.createElement(AesBox, { theme: "color" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: colorMapCol == null ? "" : colorMapCol,
      onChange: (e) => setColorMapCol(e.target.value === "" ? null : parseInt(e.target.value)),
      style: { ...selSt, width: "100%", marginBottom: hasColorMap ? 8 : 0 }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 None \u2014"),
    mappableCols.filter((i) => i !== sizeMapCol && i !== shapeMapCol).map(
      (i) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, parsed.headers[i])
    )
  ), hasColorMap && colorMapType && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", marginBottom: 6 } }, "Detected: ", /* @__PURE__ */ React.createElement("strong", { style: { color: colorMapType === "continuous" ? "#7c3aed" : "#0369a1" } }, colorMapType === "continuous" ? "numeric (continuous)" : `categorical (${colorMapCategories.length} groups)`)), colorMapType === "continuous" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("select", { value: colorMapPalette, onChange: (e) => setColorMapPalette(e.target.value), style: { ...selSt, width: "100%", fontSize: 11 } }, Object.keys(COLOR_PALETTES).map((p) => /* @__PURE__ */ React.createElement("option", { key: p, value: p }, p))), /* @__PURE__ */ React.createElement(PaletteStrip, { palette: colorMapPalette }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#aaa" } }, "range: ", fmtTick(colorMapRange[0]), " \u2192 ", fmtTick(colorMapRange[1]))), colorMapType === "discrete" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" } }, colorMapCategories.map((cat, ci) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    ColorInput,
    {
      value: colorMapDiscrete[cat] || PALETTE[ci % PALETTE.length],
      onChange: (v) => setColorMapDiscrete((prev) => ({ ...prev, [cat]: v })),
      size: 18
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#333" } }, cat)))))), /* @__PURE__ */ React.createElement(AesBox, { theme: "size" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: sizeMapCol == null ? "" : sizeMapCol,
      onChange: (e) => setSizeMapCol(e.target.value === "" ? null : parseInt(e.target.value)),
      style: { ...selSt, width: "100%", marginBottom: hasSizeMap ? 8 : 0 }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 None \u2014"),
    mappableCols.filter((i) => i !== colorMapCol && i !== shapeMapCol).map(
      (i) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, parsed.headers[i])
    )
  ), hasSizeMap && sizeMapType && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888", marginBottom: 6 } }, "Detected: ", /* @__PURE__ */ React.createElement("strong", { style: { color: sizeMapType === "continuous" ? "#7c3aed" : "#0369a1" } }, sizeMapType === "continuous" ? "numeric (continuous)" : `categorical (${sizeMapCategories.length} groups)`)), sizeMapType === "continuous" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement(SliderControl, { label: "Min size", value: sizeMapMin, min: 1, max: 20, step: 0.5, onChange: setSizeMapMin }), /* @__PURE__ */ React.createElement(SliderControl, { label: "Max size", value: sizeMapMax, min: 1, max: 30, step: 0.5, onChange: setSizeMapMax }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#aaa" } }, "range: ", fmtTick(sizeMapRange[0]), " \u2192 ", fmtTick(sizeMapRange[1]))), sizeMapType === "discrete" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" } }, sizeMapCategories.map((cat) => {
    const val = sizeMapDiscrete[cat] !== void 0 ? sizeMapDiscrete[cat] : 5;
    return /* @__PURE__ */ React.createElement(
      SliderControl,
      {
        key: cat,
        label: cat,
        value: val,
        min: 1,
        max: 20,
        step: 0.5,
        onChange: (v) => setSizeMapDiscrete((prev) => ({ ...prev, [cat]: v }))
      }
    );
  })))), /* @__PURE__ */ React.createElement(AesBox, { theme: "shape" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: shapeMapCol == null ? "" : shapeMapCol,
      onChange: (e) => setShapeMapCol(e.target.value === "" ? null : parseInt(e.target.value)),
      style: { ...selSt, width: "100%", marginBottom: hasShapeMap ? 8 : 0 }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 None \u2014"),
    mappableCols.filter((i) => i !== colorMapCol && i !== sizeMapCol).map(
      (i) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, parsed.headers[i])
    )
  ), hasShapeMap && /* @__PURE__ */ React.createElement(React.Fragment, null, shapeWarning && /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 10px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fca5a5", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#dc2626" } }, shapeWarning)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" } }, shapeMapCategories.map((cat, ci) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length],
      onChange: (e) => setShapeMapDiscrete((prev) => ({ ...prev, [cat]: e.target.value })),
      style: { ...selSt, fontSize: 11, width: 90 }
    },
    SHAPES.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))
  ), /* @__PURE__ */ React.createElement(ShapePreview, { shape: shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length], color: "#666" }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#333" } }, cat)))))), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Axes"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X min"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: vis.xMin != null ? vis.xMin : "", placeholder: "auto (" + fmtTick(autoAxis.xMin) + ")", onChange: (e) => {
    const v = e.target.value.trim();
    updVis({ xMin: v === "" ? null : Number(v) });
  }, style: { ...scInp, width: "100%" } })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X max"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: vis.xMax != null ? vis.xMax : "", placeholder: "auto (" + fmtTick(autoAxis.xMax) + ")", onChange: (e) => {
    const v = e.target.value.trim();
    updVis({ xMax: v === "" ? null : Number(v) });
  }, style: { ...scInp, width: "100%" } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y min"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: vis.yMin != null ? vis.yMin : "", placeholder: "auto (" + fmtTick(autoAxis.yMin) + ")", onChange: (e) => {
    const v = e.target.value.trim();
    updVis({ yMin: v === "" ? null : Number(v) });
  }, style: { ...scInp, width: "100%" } })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y max"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: vis.yMax != null ? vis.yMax : "", placeholder: "auto (" + fmtTick(autoAxis.yMax) + ")", onChange: (e) => {
    const v = e.target.value.trim();
    updVis({ yMax: v === "" ? null : Number(v) });
  }, style: { ...scInp, width: "100%" } }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X label"), /* @__PURE__ */ React.createElement("input", { value: vis.xLabel, onChange: (e) => updVis({ xLabel: e.target.value }), style: { ...scInp, width: "100%", textAlign: "left" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y label"), /* @__PURE__ */ React.createElement("input", { value: vis.yLabel, onChange: (e) => updVis({ yLabel: e.target.value }), style: { ...scInp, width: "100%", textAlign: "left" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Title"), /* @__PURE__ */ React.createElement("input", { value: vis.plotTitle, onChange: (e) => updVis({ plotTitle: e.target.value }), style: { ...scInp, width: "100%", textAlign: "left" } })))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Style"), /* @__PURE__ */ React.createElement(
    BaseStyleControls,
    {
      plotBg: vis.plotBg,
      onPlotBgChange: (v) => updVis({ plotBg: v }),
      showGrid: vis.showGrid,
      onShowGridChange: (v) => updVis({ showGrid: v }),
      gridColor: vis.gridColor,
      onGridColorChange: (v) => updVis({ gridColor: v })
    }
  )), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#555" } }, "Ref lines"), /* @__PURE__ */ React.createElement("button", { onClick: () => addRefLine("h"), style: { ...dlBtn, fontSize: 11, padding: "4px 10px" } }, "+ H"), /* @__PURE__ */ React.createElement("button", { onClick: () => addRefLine("v"), style: { ...dlBtn, fontSize: 11, padding: "4px 10px" } }, "+ V")), refLines.length === 0 && /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#aaa" } }, "No reference lines."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, refLines.map((rl) => /* @__PURE__ */ React.createElement("div", { key: rl.id, style: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 10px",
    background: "#fafafa",
    borderRadius: 8,
    border: "1px solid #ddd"
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: {
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 4,
    background: rl.dir === "h" ? "#dbeafe" : "#fce7f3",
    color: rl.dir === "h" ? "#1d4ed8" : "#9d174d"
  } }, rl.dir === "h" ? "Y =" : "X ="), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      value: rl.value,
      step: "any",
      onChange: (e) => updateRefLine(rl.id, "value", Number(e.target.value)),
      style: { ...scInp, flex: 1 }
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => removeRefLine(rl.id),
      style: {
        padding: "3px 9px",
        borderRadius: 5,
        fontSize: 12,
        cursor: "pointer",
        background: "#fff",
        border: "1px solid #fca5a5",
        color: "#dc2626",
        fontFamily: "inherit"
      }
    },
    "\u2715"
  )), /* @__PURE__ */ React.createElement(ColorInput, { value: rl.color, onChange: (v) => updateRefLine(rl.id, "color", v), size: 22 }), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Width",
      value: rl.strokeWidth,
      min: 0.5,
      max: 6,
      step: 0.25,
      onChange: (v) => updateRefLine(rl.id, "strokeWidth", v)
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#777" } }, "Dashed"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: rl.dashed,
      onChange: (e) => updateRefLine(rl.id, "dashed", e.target.checked),
      style: { accentColor: "#648FFF" }
    }
  )), rl.dashed && /* @__PURE__ */ React.createElement("select", { value: rl.dashArray, onChange: (e) => updateRefLine(rl.id, "dashArray", e.target.value), style: { ...selSt, fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("option", { value: "7,4" }, "\u2014 \u2014 \u2014"), /* @__PURE__ */ React.createElement("option", { value: "3,3" }, "\xB7 \xB7 \xB7 \xB7"), /* @__PURE__ */ React.createElement("option", { value: "12,4" }, "\u2014\u2014 \u2014\u2014"), /* @__PURE__ */ React.createElement("option", { value: "10,4,2,4" }, "\u2014 \xB7 \u2014 \xB7"), /* @__PURE__ */ React.createElement("option", { value: "2,2" }, "\xB7\xB7 \xB7\xB7")), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: rl.label,
      placeholder: "label",
      onChange: (e) => updateRefLine(rl.id, "label", e.target.value),
      style: { ...scInp, width: "100%", textAlign: "left" }
    }
  ), rl.label && /* @__PURE__ */ React.createElement("select", { value: rl.labelSide, onChange: (e) => updateRefLine(rl.id, "labelSide", e.target.value), style: { ...selSt, fontSize: 11, width: "100%" } }, rl.dir === "h" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("option", { value: "right" }, "right"), /* @__PURE__ */ React.createElement("option", { value: "left" }, "left")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("option", { value: "top" }, "top"), /* @__PURE__ */ React.createElement("option", { value: "bottom" }, "bottom"))))))), filterableCols.length > 0 && /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" },
      onClick: () => setFiltersOpen(!filtersOpen)
    },
    /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#555" } }, "Filters ", filtersOpen ? "\u25BE" : "\u25B8"),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#aaa" } }, filteredData.length, " of ", parsed.data.length, " rows")
  ), filtersOpen && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 10, maxHeight: 300, overflowY: "auto" } }, filterableCols.map((ci) => {
    const vals = uniqueVals(ci);
    if (vals.length === 0 || vals.length > 30) return null;
    const allowed = filterState[ci] || [];
    const allChecked = allowed.length === 0;
    return /* @__PURE__ */ React.createElement("div", { key: ci }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: "#555" } }, parsed.headers[ci]), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setFilterState((prev) => ({ ...prev, [ci]: [] })),
        style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, cursor: "pointer", border: "1px solid #ccc", background: "#f5f5f5", color: "#666", fontFamily: "inherit" }
      },
      "all"
    )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 } }, vals.map((v) => {
      const checked = allChecked || allowed.includes(v);
      return /* @__PURE__ */ React.createElement("label", { key: v, style: { display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: checked ? "#e0e7ff" : "#f8f8f8", border: `1px solid ${checked ? "#a5b4fc" : "#e5e5e5"}`, cursor: "pointer", color: checked ? "#3730a3" : "#999" } }, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          checked,
          onChange: (e) => handleFilterToggle(ci, v, vals, e.target.checked),
          style: { accentColor: "#648FFF", margin: 0 }
        }
      ), v);
    })));
  })))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 20, background: "#fff" } }, /* @__PURE__ */ React.createElement(
    ScatterChart,
    {
      ref: svgRef,
      data: filteredData,
      rawData: filteredRawRows,
      xCol,
      yCol,
      xMin: effAxis.xMin,
      xMax: effAxis.xMax,
      yMin: effAxis.yMin,
      yMax: effAxis.yMax,
      xLabel: vis.xLabel,
      yLabel: vis.yLabel,
      title: vis.plotTitle,
      plotBg: vis.plotBg,
      showGrid: vis.showGrid,
      gridColor: vis.gridColor,
      refLines,
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
      svgLegend
    }
  ))));
}
let refLineCounter = 0;
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
  const [pointColor, setPointColor] = useState("#648FFF");
  const [pointSize, setPointSize] = useState(5);
  const [pointOpacity, setPointOpacity] = useState(0.8);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [colorMapCol, setColorMapCol] = useState(null);
  const [colorMapPalette, setColorMapPalette] = useState("viridis");
  const [colorMapDiscrete, setColorMapDiscrete] = useState({});
  const [sizeMapCol, setSizeMapCol] = useState(null);
  const [sizeMapMin, setSizeMapMin] = useState(3);
  const [sizeMapMax, setSizeMapMax] = useState(15);
  const [sizeMapDiscrete, setSizeMapDiscrete] = useState({});
  const [shapeMapCol, setShapeMapCol] = useState(null);
  const [shapeMapDiscrete, setShapeMapDiscrete] = useState({});
  const [filterState, setFilterState] = useState({});
  const visInit = { xMin: null, xMax: null, yMin: null, yMax: null, xLabel: "", yLabel: "", plotTitle: "", plotBg: "#ffffff", showGrid: true, gridColor: "#e0e0e0" };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);
  const [refLines, setRefLines] = useState([]);
  const svgRef = useRef();
  const sepRef = useRef("");
  const parsed = useMemo(() => rawText ? parseData(rawText, sepRef.current) : null, [rawText]);
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
    return parsed.headers.reduce((acc, _, i) => colIsNumeric[i] ? [...acc, i] : acc, []);
  }, [parsed, colIsNumeric]);
  const activeColIdxs = useMemo(() => parsed ? parsed.headers.map((_, i) => i) : [], [parsed]);
  const mappableCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce((acc, _, i) => i !== xCol && i !== yCol ? [...acc, i] : acc, []);
  }, [parsed, xCol, yCol]);
  const filterableCols = useMemo(() => {
    if (!parsed) return [];
    return mappableCols.filter((i) => {
      const vals = [...new Set(parsed.rawData.map((r) => r[i]).filter((v) => v != null && v !== ""))];
      return vals.length > 0 && vals.length <= 30;
    });
  }, [parsed, mappableCols]);
  const filteredIndices = useMemo(() => {
    if (!parsed) return [];
    return parsed.rawData.reduce((acc, row, ri) => {
      for (const [ci, allowed] of Object.entries(filterState)) {
        if (allowed.length > 0 && !allowed.includes(row[parseInt(ci)])) return acc;
      }
      acc.push(ri);
      return acc;
    }, []);
  }, [parsed, filterState]);
  const filteredData = useMemo(() => filteredIndices.map((i) => parsed.data[i]), [parsed, filteredIndices]);
  const filteredRawRows = useMemo(() => filteredIndices.map((i) => parsed.rawData[i]), [parsed, filteredIndices]);
  const detectColType = useCallback((colIdx) => {
    if (colIdx == null || !parsed) return null;
    const vals = parsed.rawData.map((r) => r[colIdx]).filter((v) => v != null && v !== "");
    return vals.every((v) => isNumericValue(v)) ? "continuous" : "discrete";
  }, [parsed]);
  const colorMapType = useMemo(() => detectColType(colorMapCol), [colorMapCol, detectColType]);
  const sizeMapType = useMemo(() => detectColType(sizeMapCol), [sizeMapCol, detectColType]);
  const uniqueVals = useCallback((colIdx) => {
    if (colIdx == null || !parsed) return [];
    const vals = [...new Set(parsed.rawData.map((r) => r[colIdx]).filter((v) => v != null && v !== ""))];
    const allNum = vals.every((v) => isNumericValue(v));
    return allNum ? vals.sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", "."))) : vals.sort();
  }, [parsed]);
  const colorMapCategories = useMemo(() => colorMapType === "discrete" ? uniqueVals(colorMapCol) : [], [colorMapCol, colorMapType, uniqueVals]);
  const sizeMapCategories = useMemo(() => sizeMapType === "discrete" ? uniqueVals(sizeMapCol) : [], [sizeMapCol, sizeMapType, uniqueVals]);
  const shapeMapCategories = useMemo(() => shapeMapCol != null ? uniqueVals(shapeMapCol) : [], [shapeMapCol, uniqueVals]);
  const shapeWarning = useMemo(() => {
    if (shapeMapCategories.length > 4) {
      return `This column has ${shapeMapCategories.length} unique values \u2014 only 4 shapes are available. Categories beyond the 4th will cycle through the same shapes.`;
    }
    return null;
  }, [shapeMapCategories]);
  const numericRange = useCallback((colIdx) => {
    if (colIdx == null || !parsed) return [0, 1];
    const vals = parsed.rawData.map((r) => parseFloat((r[colIdx] || "").replace(",", "."))).filter((v) => !isNaN(v));
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }, [parsed]);
  const colorMapRange = useMemo(() => numericRange(colorMapCol), [colorMapCol, numericRange]);
  const sizeMapRange = useMemo(() => numericRange(sizeMapCol), [sizeMapCol, numericRange]);
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
  useEffect(() => {
    if (sizeMapCategories.length === 0) {
      setSizeMapDiscrete({});
      return;
    }
    setSizeMapDiscrete((prev) => {
      const next = {};
      sizeMapCategories.forEach((cat, i) => {
        next[cat] = prev[cat] !== void 0 ? prev[cat] : 3 + i * 3;
      });
      return next;
    });
  }, [sizeMapCategories]);
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
  useEffect(() => {
    if (!parsed || xCol == null || yCol == null) return;
    updVis({
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      xLabel: parsed.headers[xCol],
      yLabel: parsed.headers[yCol]
    });
  }, [xCol, yCol, parsed]);
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
      yMax: yVals.length ? Math.max(...yVals) + yPad : 1
    };
  }, [parsed, xCol, yCol]);
  const effAxis = {
    xMin: vis.xMin != null ? vis.xMin : autoAxis.xMin,
    xMax: vis.xMax != null ? vis.xMax : autoAxis.xMax,
    yMin: vis.yMin != null ? vis.yMin : autoAxis.yMin,
    yMax: vis.yMax != null ? vis.yMax : autoAxis.yMax
  };
  useEffect(() => {
    if (colorMapCol === xCol || colorMapCol === yCol) setColorMapCol(null);
    if (sizeMapCol === xCol || sizeMapCol === yCol) setSizeMapCol(null);
    if (shapeMapCol === xCol || shapeMapCol === yCol) setShapeMapCol(null);
  }, [xCol, yCol]);
  const svgLegend = useMemo(() => {
    const items = [];
    const hasColorMap = colorMapCol != null;
    const hasSizeMap = sizeMapCol != null;
    const hasShapeMap = shapeMapCol != null;
    if (hasColorMap && colorMapType === "continuous") {
      const stops = COLOR_PALETTES[colorMapPalette] || COLOR_PALETTES.viridis;
      items.push({ title: parsed.headers[colorMapCol], gradient: { stops, min: colorMapRange[0].toFixed(2), max: colorMapRange[1].toFixed(2) } });
    } else if (hasColorMap && colorMapType === "discrete") {
      items.push({ title: parsed.headers[colorMapCol], items: colorMapCategories.map((c) => ({ label: c, color: colorMapDiscrete[c] || "#999", shape: "dot" })) });
    }
    if (hasSizeMap && sizeMapType === "discrete") {
      items.push({ title: parsed.headers[sizeMapCol], sizeItems: sizeMapCategories.map((c) => ({ label: c, r: sizeMapDiscrete[c] || sizeMapMin })) });
    } else if (hasSizeMap && sizeMapType === "continuous") {
      const sizeItems = Array.from({ length: 4 }, (_, i) => {
        const t = i / 3;
        return { label: (sizeMapRange[0] + t * (sizeMapRange[1] - sizeMapRange[0])).toFixed(1), r: sizeMapMin + t * (sizeMapMax - sizeMapMin) };
      });
      items.push({ title: parsed.headers[sizeMapCol], sizeItems });
    }
    if (hasShapeMap) {
      items.push({ title: parsed.headers[shapeMapCol], items: shapeMapCategories.map((c) => ({
        label: c,
        color: "#666",
        shape: shapeMapDiscrete[c] || "circle"
      })) });
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
    shapeMapDiscrete
  ]);
  const doParse = useCallback((text, sep) => {
    sepRef.current = sep;
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    const fixedText = dc.text;
    const { headers, data, rawData } = parseData(fixedText, sep);
    if (headers.length < 2 || data.length === 0) {
      setParseError("The file appears to be empty or has no data rows. Please check your file and try again.");
      return;
    }
    setParseError(null);
    setRawText(fixedText);
    const isNum = (idx) => {
      const vals = rawData.map((r) => r[idx]).filter((v) => v !== "" && v != null);
      return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
    };
    const nums = headers.reduce((acc, _, i) => isNum(i) ? [...acc, i] : acc, []);
    setXCol(nums[0] !== void 0 ? nums[0] : 0);
    setYCol(nums[1] !== void 0 ? nums[1] : nums[0] !== void 0 ? nums[0] : 1);
    setColorMapCol(null);
    setColorMapDiscrete({});
    setSizeMapCol(null);
    setSizeMapDiscrete({});
    setShapeMapCol(null);
    setShapeMapDiscrete({});
    setFilterState({});
    setRefLines([]);
    setPointColor("#648FFF");
    setPointSize(5);
    setPointOpacity(0.8);
    setStrokeColor("#000000");
    setStrokeWidth(1);
    setStep("plot");
  }, []);
  const handleFileLoad = useCallback((text, name) => {
    setFileName(name);
    doParse(text, sepOverride);
  }, [sepOverride, doParse]);
  const resetAll = () => {
    setRawText(null);
    setFileName("");
    setStep("upload");
  };
  const addRefLine = (dir) => setRefLines((prev) => [...prev, {
    id: ++refLineCounter,
    dir,
    value: 0,
    color: "#e11d48",
    strokeWidth: 1.5,
    dashed: true,
    dashArray: "7,4",
    label: "",
    labelSide: dir === "h" ? "right" : "top"
  }]);
  const updateRefLine = (id, key, val) => setRefLines((prev) => prev.map((rl) => rl.id === id ? { ...rl, [key]: val } : rl));
  const removeRefLine = (id) => setRefLines((prev) => prev.filter((rl) => rl.id !== id));
  const canNavigate = (s) => {
    if (s === "upload") return true;
    if (s === "plot") return !!parsed;
    return false;
  };
  return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", color: "#333", fontFamily: "monospace", padding: "24px 32px" } }, /* @__PURE__ */ React.createElement(
    PageHeader,
    {
      toolName: "scatter",
      title: "Scatter Plot",
      subtitle: "XY scatter \u2014 one row per data point, one column per variable"
    }
  ), /* @__PURE__ */ React.createElement(
    StepNavBar,
    {
      steps: ["upload", "plot"],
      currentStep: step,
      onStepChange: setStep,
      canNavigate
    }
  ), /* @__PURE__ */ React.createElement(CommaFixBanner, { commaFixed, commaFixCount }), /* @__PURE__ */ React.createElement(ParseErrorBanner, { error: parseError }), step === "upload" && /* @__PURE__ */ React.createElement(
    UploadStep,
    {
      sepOverride,
      setSepOverride,
      rawText,
      doParse,
      handleFileLoad
    }
  ), step === "plot" && parsed && /* @__PURE__ */ React.createElement(
    PlotStep,
    {
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
      filterState,
      setFilterState,
      filterableCols,
      uniqueVals,
      mappableCols,
      resetAll,
      svgRef,
      svgLegend
    }
  ));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
