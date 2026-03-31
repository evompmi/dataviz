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
const MARGIN = { top: 28, right: 28, bottom: 56, left: 70 };
const VBW = 800, VBH = 500;
const ScatterChart = forwardRef(function ScatterChart2({
  data,
  rawData,
  xcol,
  seriesList,
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
  xDataMin,
  xDataMax,
  yDataMin,
  yDataMax,
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
  svgLegend
}, ref) {
  const w = VBW - MARGIN.left - MARGIN.right;
  const h = VBH - MARGIN.top - MARGIN.bottom;
  const legendH = computeLegendHeight(svgLegend, VBW - MARGIN.left - MARGIN.right);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const sx = (v) => MARGIN.left + (v - xMin) / xRange * w;
  const sy = (v) => MARGIN.top + (1 - (v - yMin) / yRange) * h;
  const xTicks = makeTicks(xMin, xMax, 8);
  const yTicks = makeTicks(yMin, yMax, 6);
  const getColor = (s, xVal, yVal, rowIdx) => {
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
          return colorMapDiscrete[raw] || s.color;
        }
      }
    }
    if (s.colorMode === "by_x") {
      const t = (xVal - xDataMin) / (xDataMax - xDataMin || 1);
      return interpolateColor(COLOR_PALETTES[s.palette] || COLOR_PALETTES.viridis, Math.max(0, Math.min(1, t)));
    }
    if (s.colorMode === "by_y") {
      const t = (yVal - yDataMin) / (yDataMax - yDataMin || 1);
      return interpolateColor(COLOR_PALETTES[s.palette] || COLOR_PALETTES.viridis, Math.max(0, Math.min(1, t)));
    }
    return s.color;
  };
  const getSize = (s, rowIdx) => {
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
          return sizeMapDiscrete[raw] !== void 0 ? sizeMapDiscrete[raw] : s.pointSize;
        }
      }
    }
    return s.pointSize;
  };
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${VBW} ${VBH + legendH}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg"
    },
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
    /* @__PURE__ */ React.createElement("g", { clipPath: "url(#sc-clip)" }, seriesList.map(
      (s) => data.map((row, ri) => {
        const xVal = row[xcol], yVal = row[s.colIdx];
        if (xVal == null || yVal == null) return null;
        return /* @__PURE__ */ React.createElement(
          "circle",
          {
            key: `${s.colIdx}-${ri}`,
            cx: sx(xVal),
            cy: sy(yVal),
            r: getSize(s, ri),
            fill: getColor(s, xVal, yVal, ri),
            fillOpacity: s.opacity,
            stroke: s.strokeColor || "none",
            strokeWidth: s.strokeWidth || 0
          }
        );
      })
    )),
    /* @__PURE__ */ React.createElement("rect", { x: MARGIN.left, y: MARGIN.top, width: w, height: h, fill: "none", stroke: "#333", strokeWidth: "1" }),
    xTicks.map((t) => /* @__PURE__ */ React.createElement("g", { key: t }, /* @__PURE__ */ React.createElement("line", { x1: sx(t), x2: sx(t), y1: MARGIN.top + h, y2: MARGIN.top + h + 5, stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: sx(t), y: MARGIN.top + h + 18, textAnchor: "middle", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, fmtTick(t)))),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("g", { key: t }, /* @__PURE__ */ React.createElement("line", { x1: MARGIN.left - 5, x2: MARGIN.left, y1: sy(t), y2: sy(t), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: MARGIN.left - 8, y: sy(t) + 4, textAnchor: "end", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, fmtTick(t)))),
    xLabel && /* @__PURE__ */ React.createElement("text", { x: MARGIN.left + w / 2, y: VBH - 6, textAnchor: "middle", fontSize: "13", fill: "#444", fontFamily: "sans-serif" }, xLabel),
    yLabel && /* @__PURE__ */ React.createElement("text", { transform: `translate(14,${MARGIN.top + h / 2}) rotate(-90)`, textAnchor: "middle", fontSize: "13", fill: "#444", fontFamily: "sans-serif" }, yLabel),
    title && /* @__PURE__ */ React.createElement("text", { x: VBW / 2, y: 16, textAnchor: "middle", fontSize: "15", fontWeight: "700", fill: "#222", fontFamily: "sans-serif" }, title),
    renderSvgLegend(svgLegend, VBH + 10, MARGIN.left, VBW - MARGIN.left - MARGIN.right)
  );
});
function ContinuousColorLegend({ palette, minVal, maxVal, label }) {
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const n = 80;
  const mid = (minVal + maxVal) / 2;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 160 } }, label && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#555", fontWeight: 600 } }, label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", width: 160, height: 14, borderRadius: 4, overflow: "hidden", border: "1px solid #ddd" } }, Array.from({ length: n }, (_, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, background: interpolateColor(stops, i / (n - 1)) } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", width: 160 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#777" } }, fmtTick(minVal)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#777" } }, fmtTick(mid)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#777" } }, fmtTick(maxVal))));
}
function DiscreteColorLegend({ categories, colorMap, label }) {
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, label && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#555", fontWeight: 600 } }, label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, categories.map((cat) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#444" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 11, height: 11, borderRadius: "50%", background: colorMap[cat] || "#ccc", border: "1px solid #ddd", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", null, cat)))));
}
function ContinuousSizeLegend({ minSize, maxSize, minVal, maxVal, label }) {
  const steps = 4;
  const items = Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const r = minSize + t * (maxSize - minSize);
    const v = minVal + t * (maxVal - minVal);
    return { r, v };
  });
  const maxR = maxSize;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, label && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#555", fontWeight: 600 } }, label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 14, alignItems: "flex-end" } }, items.map(({ r, v }, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { width: maxR * 2, height: maxR * 2, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { width: r * 2, height: r * 2, borderRadius: "50%", background: "#648FFF", opacity: 0.8, border: "1px solid #ddd" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#777" } }, fmtTick(v))))));
}
function DiscreteSizeLegend({ categories, sizeMap, label }) {
  const maxR = Math.max(...Object.values(sizeMap), 5);
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, label && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#555", fontWeight: 600 } }, label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" } }, categories.map((cat) => {
    const r = sizeMap[cat] !== void 0 ? sizeMap[cat] : 5;
    return /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { width: maxR * 2, height: maxR * 2, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { width: r * 2, height: r * 2, borderRadius: "50%", background: "#648FFF", opacity: 0.8, border: "1px solid #ddd" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#777" } }, cat));
  })));
}
const scInp = { width: 80, background: "#fff", border: "1px solid #ccc", borderRadius: 4, color: "#333", padding: "4px 8px", fontSize: 13, textAlign: "center" };
const dlBtn = { padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#fff", border: "1px solid #ccc", color: "#555", fontFamily: "inherit" };
const selSt = { background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", color: "#333", cursor: "pointer" };
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
  ), /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 12px", fontSize: 11, color: "#aaa", textAlign: "right" } }, "\u26A0 Max file size: 2 MB"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 24, borderRadius: 14, overflow: "hidden", border: "2px solid #648FFF", boxShadow: "0 4px 20px rgba(100,143,255,0.12)" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(135deg,#4a6cf7,#648FFF)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 } }, toolIcon("scatter", 24, { circle: true }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "#fff", fontWeight: 700, fontSize: 15 } }, "Scatter Plot \u2014 How to use"), /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 } }, "Upload \u2192 Configure columns \u2192 Plot \xB7 Color & size mappings \xB7 Reference lines"))), /* @__PURE__ */ React.createElement("div", { style: { background: "#eef2ff", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Data layout"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, lineHeight: 1.75, color: "#444", margin: 0 } }, "One ", /* @__PURE__ */ React.createElement("strong", null, "row"), " = one data point. One ", /* @__PURE__ */ React.createElement("strong", null, "column"), " = one variable. Any number of columns, any mix of numeric and text.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "Step 2 \u2014 Configure columns"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#444", margin: "0 0 8px", lineHeight: 1.6 } }, "After loading a file you land on the ", /* @__PURE__ */ React.createElement("strong", null, "Configure"), " step. Each column is listed with its auto-detected role. Change roles by clicking the controls on each row:"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, [
    { badge: "X", bg: "#dbeafe", bc: "#93c5fd", tc: "#1d4ed8", desc: "Radio button \u2014 select exactly one numeric column as the X axis. Only one column can be X at a time; selecting a new one automatically demotes the previous one." },
    { badge: "Y", bg: "#ede9fe", bc: "#c4b5fd", tc: "#6d28d9", desc: "Checkbox \u2014 select one or more numeric columns as Y series. Each Y column becomes an independently styled series on the plot." },
    { badge: "aes/filter", bg: "#f0fdf4", bc: "#86efac", tc: "#15803d", desc: "Default role for all other columns (numeric or text). Available as color-by / size-by mappings in the plot step, and as row filters in the Filter tile." },
    { badge: "ignore \u2715", bg: "#fee2e2", bc: "#fca5a5", tc: "#dc2626", desc: "Click the \u2715 button to exclude a column entirely \u2014 it will be hidden from the preview and omitted from CSV downloads. Click \u21A9 to restore it." }
  ].map(({ badge, bg, bc, tc, desc }) => /* @__PURE__ */ React.createElement("div", { key: badge, style: { display: "flex", alignItems: "flex-start", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { flexShrink: 0, fontSize: 10, padding: "2px 8px", borderRadius: 10, background: bg, border: `1px solid ${bc}`, color: tc, fontWeight: 700, marginTop: 2 } }, badge), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444", lineHeight: 1.55 } }, desc)))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#777", margin: "10px 0 0", lineHeight: 1.55 } }, "The ", /* @__PURE__ */ React.createElement("strong", null, "Filter rows"), " tile shows checkbox filters for all ", /* @__PURE__ */ React.createElement("em", null, "aes/filter"), " columns with \u2264 30 unique values. The ", /* @__PURE__ */ React.createElement("strong", null, "Preview"), " tile updates live. Click ", /* @__PURE__ */ React.createElement("strong", null, "\u2192 Plot"), " when ready \u2014 X and at least one Y must be assigned.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "Color by column"), [{ label: "Numeric", desc: "Continuous gradient palette (viridis, plasma\u2026). Gradient legend shown." }, { label: "Categorical", desc: "Distinct auto-assigned editable colors per value. Swatch legend shown." }].map(({ label, desc }) => /* @__PURE__ */ React.createElement("div", { key: label, style: { marginBottom: 7 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#648FFF" } }, label, " \u2014 "), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, desc))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#888", margin: "6px 0 0" } }, "Only ", /* @__PURE__ */ React.createElement("em", null, "aes/filter"), " columns appear in this dropdown.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "Size by column"), [{ label: "Numeric", desc: "Min/max radius mapping. Bubble-size legend shown." }, { label: "Categorical", desc: "Per-category size slider. Size legend shown." }].map(({ label, desc }) => /* @__PURE__ */ React.createElement("div", { key: label, style: { marginBottom: 7 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#648FFF" } }, label, " \u2014 "), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, desc))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#888", margin: "6px 0 0" } }, "Only ", /* @__PURE__ */ React.createElement("em", null, "aes/filter"), " columns appear in this dropdown.")), /* @__PURE__ */ React.createElement("div", { style: { borderLeft: "4px solid #648FFF", background: "#dbeafe", padding: "10px 14px", borderRadius: "0 8px 8px 0", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#3b6cf7" } }, "\u{1F4A1} Tip \u2014 "), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, "You can return to Configure at any time via the step buttons or the ", /* @__PURE__ */ React.createElement("em", null, "edit"), " link in the plot panel. Column roles and filters are preserved. Reference lines can be added in the plot step.")), /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" } }, ["X/Y/filter role assignment", "Row filtering", "Per-series style controls", "8 gradient palettes", "100% browser-side"].map((t) => /* @__PURE__ */ React.createElement("span", { key: t, style: { fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "#fff", border: "1px solid #b0c4ff", color: "#555" } }, t))))));
}
function ConfigureStep({
  parsed,
  colRoles,
  setColRoles,
  colIsNumeric,
  availableColIdxs,
  activeColIdxs,
  yColIdxs,
  filterState,
  setFilterState,
  uniqueVals,
  filteredData,
  goToPlot
}) {
  const hasX = colRoles.indexOf("x") >= 0;
  const hasY = yColIdxs.length > 0;
  return /* @__PURE__ */ React.createElement("div", null, !hasX && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 15 } }, "\u26A0"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#dc2626", fontWeight: 600 } }, "No X column selected \u2014 assign exactly one numeric column as X below.")), hasX && !hasY && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fca5a5", display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 15 } }, "\u26A0"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#dc2626", fontWeight: 600 } }, "No Y column selected \u2014 assign at least one numeric column as Y below.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16, alignItems: "stretch", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: "0 0 auto", minWidth: 280, borderRadius: 10, padding: 16, border: "1px solid #c7d2fe", background: "#eef2ff", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#4338ca", textTransform: "uppercase", letterSpacing: "0.8px" } }, "Column roles"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, flex: 1 } }, parsed.headers.map((h, i) => {
    const role = colRoles[i] || "available";
    const isNum = colIsNumeric[i];
    const setRole = (newRole) => {
      setColRoles((prev) => {
        const next = [...prev];
        if (newRole === "x") next.forEach((r, j) => {
          if (r === "x") next[j] = "y";
        });
        next[i] = newRole;
        return next;
      });
    };
    const roleColor = role === "x" ? { bg: "#dbeafe", border: "#93c5fd", text: "#1d4ed8" } : role === "y" ? { bg: "#ede9fe", border: "#c4b5fd", text: "#6d28d9" } : role === "ignore" ? { bg: "#fee2e2", border: "#fca5a5", text: "#dc2626" } : { bg: "#f0fdf4", border: "#86efac", text: "#15803d" };
    return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, background: "#fff", border: `1px solid ${roleColor.border}` } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: h }, h), /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: "#4338ca", flexShrink: 0, cursor: isNum ? "pointer" : "not-allowed", opacity: isNum ? 1 : 0.4 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "radio",
        name: "xrole",
        checked: role === "x",
        disabled: !isNum,
        onChange: () => setRole("x"),
        style: { accentColor: "#4338ca" }
      }
    ), "X"), /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: "#6d28d9", flexShrink: 0, cursor: isNum ? "pointer" : "not-allowed", opacity: isNum ? 1 : 0.4 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: role === "y",
        disabled: !isNum,
        onChange: (e) => setRole(e.target.checked ? "y" : "available"),
        style: { accentColor: "#6d28d9" }
      }
    ), "Y"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setRole(role === "ignore" ? "available" : "ignore"),
        style: { fontSize: 10, padding: "2px 6px", borderRadius: 4, cursor: "pointer", border: "1px solid #ddd6fe", background: role === "ignore" ? "#fee2e2" : "#f5f3ff", color: role === "ignore" ? "#dc2626" : "#6d28d9", fontFamily: "inherit" }
      },
      role === "ignore" ? "\u21A9" : "\u2715"
    ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: roleColor.bg, border: `1px solid ${roleColor.border}`, color: roleColor.text, fontWeight: 600, flexShrink: 0 } }, role === "available" ? "aes/filter" : role));
  }))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, borderRadius: 10, padding: 16, border: "1px solid #bfdbfe", background: "#eff6ff", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.8px" } }, "Filter rows"), availableColIdxs.length === 0 ? /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#93c5fd", fontStyle: "italic" } }, 'No filter columns. Assign columns the "aes/filter" role to enable filtering.') : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12, flex: 1, overflowY: "auto", maxHeight: 400 } }, availableColIdxs.map((ci) => {
    const vals = uniqueVals(ci);
    if (colIsNumeric[ci]) return /* @__PURE__ */ React.createElement("div", { key: ci, style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 11, fontWeight: 600, color: "#1d4ed8" } }, parsed.headers[ci]), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setFilterState((prev) => ({ ...prev, [ci]: [] })),
        style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, cursor: "pointer", border: "1px solid #93c5fd", background: "#dbeafe", color: "#1d4ed8", fontFamily: "inherit" }
      },
      "all"
    ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#93c5fd", fontStyle: "italic" } }, "numeric \u2014 use axis range in plot"));
    const allowed = filterState[ci] || [];
    const allChecked = allowed.length === 0;
    return /* @__PURE__ */ React.createElement("div", { key: ci }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 11, fontWeight: 600, color: "#1d4ed8" } }, parsed.headers[ci]), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setFilterState((prev) => ({ ...prev, [ci]: [] })),
        style: { fontSize: 10, padding: "1px 6px", borderRadius: 4, cursor: "pointer", border: "1px solid #93c5fd", background: "#dbeafe", color: "#1d4ed8", fontFamily: "inherit" }
      },
      "all"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setFilterState((prev) => ({ ...prev, [ci]: [] })),
        style: { display: "none" }
      }
    )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 } }, vals.map((v) => {
      const checked = allChecked || allowed.includes(v);
      return /* @__PURE__ */ React.createElement("label", { key: v, style: { display: "flex", alignItems: "center", gap: 3, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: checked ? "#dbeafe" : "#f0f9ff", border: `1px solid ${checked ? "#93c5fd" : "#e0f2fe"}`, cursor: "pointer", color: checked ? "#1e40af" : "#94a3b8" } }, /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          checked,
          onChange: (e) => {
            setFilterState((prev) => {
              const curr = prev[ci] || [];
              if (curr.length === 0) {
                return { ...prev, [ci]: vals.filter((x) => x !== v) };
              } else if (e.target.checked) {
                const next = [...curr, v];
                return { ...prev, [ci]: next.length === vals.length ? [] : next };
              } else {
                const next = curr.filter((x) => x !== v);
                return { ...prev, [ci]: next };
              }
            });
          },
          style: { accentColor: "#1d4ed8", margin: 0 }
        }
      ), v);
    })));
  })))), /* @__PURE__ */ React.createElement("div", { style: { borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #99f6e4", background: "#f0fdfa" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 12, fontWeight: 700, color: "#0f766e" } }, "Preview \u2014 ", filteredData.length, " of ", parsed.data.length, " rows \xB7 ", activeColIdxs.length, " columns"), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: goToPlot,
      disabled: !hasX || !hasY,
      style: {
        padding: "7px 20px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        cursor: hasX && hasY ? "pointer" : "not-allowed",
        background: hasX && hasY ? "#16a34a" : "#d1fae5",
        border: "none",
        color: hasX && hasY ? "#fff" : "#6ee7b7",
        fontFamily: "inherit"
      }
    },
    "\u2192 Plot"
  )), /* @__PURE__ */ React.createElement(
    DataPreview,
    {
      headers: activeColIdxs.map((i) => parsed.headers[i]),
      rows: filteredData.slice(0, 15).map((row) => activeColIdxs.map((i) => row[i] != null ? row[i] : "")),
      maxRows: 15
    }
  )));
}
function PlotStep({
  parsed,
  fileName,
  filteredData,
  filteredRawRows,
  filteredIndices,
  xcol,
  yColIdxs,
  colRoles,
  activeColIdxs,
  seriesConfig,
  updateSeries,
  seriesList,
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
  vis,
  updVis,
  refLines,
  addRefLine,
  updateRefLine,
  removeRefLine,
  xDataMin,
  xDataMax,
  yDataMin,
  yDataMax,
  mappableCols,
  setStep,
  resetAll,
  svgRef
}) {
  const hasColorMap = colorMapCol != null;
  const hasSizeMap = sizeMapCol != null;
  return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 328, flexShrink: 0, position: "sticky", top: 24, maxHeight: "calc(100vh - 90px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#666", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, fileName), /* @__PURE__ */ React.createElement("span", { style: { color: "#999", marginLeft: 6 } }, parsed.data.length, " rows \xB7 ", parsed.headers.length, " cols"))), /* @__PURE__ */ React.createElement(
    ActionsPanel,
    {
      onDownloadSvg: () => downloadSvg(svgRef.current, `scatter_${fileName.replace(/\.[^.]+$/, "")}.svg`),
      onReset: resetAll,
      extraButtons: [
        {
          label: "\u2B07 Download CSV",
          onClick: (e) => {
            downloadCsv(activeColIdxs.map((i) => parsed.headers[i]), filteredRawRows.map((r) => activeColIdxs.map((i) => r[i])), `scatter_${fileName.replace(/\.[^.]+$/, "")}.csv`);
            flashSaved(e.currentTarget);
          },
          style: { padding: "8px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#dcfce7", border: "1px solid #86efac", color: "#166534", fontFamily: "inherit", width: "100%", fontWeight: 600 }
        }
      ]
    }
  ), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Column mapping"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 10, fontSize: 11, color: "#888" } }, "X: ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, parsed.headers[xcol]), " \xB7 ", "Y: ", /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, yColIdxs.map((i) => parsed.headers[i]).join(", ")), " ", /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("configure"), style: { fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer", border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", fontFamily: "inherit" } }, "edit")), /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: 1 } }, "Y series"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 } }, Object.entries(seriesConfig).filter(([ci]) => {
    const idx = parseInt(ci);
    return idx !== xcol && idx !== colorMapCol && idx !== sizeMapCol;
  }).map(([ci, cfg]) => {
    const idx = parseInt(ci);
    return /* @__PURE__ */ React.createElement("div", { key: ci, style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: "8px 10px",
      background: cfg.enabled ? "#f0f0f5" : "#fafafa",
      opacity: cfg.enabled ? 1 : 0.45,
      borderRadius: 8,
      border: "1px solid #ccc"
    } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: cfg.enabled,
        onChange: (e) => updateSeries(idx, "enabled", e.target.checked),
        style: { accentColor: "#648FFF" }
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        value: cfg.label,
        onChange: (e) => updateSeries(idx, "label", e.target.value),
        style: { flex: 1, background: "#fff", border: "1px solid #ccc", borderRadius: 4, color: "#333", padding: "3px 7px", fontSize: 12 }
      }
    )), !hasColorMap && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("select", { value: cfg.colorMode, onChange: (e) => updateSeries(idx, "colorMode", e.target.value), style: { ...selSt, width: "100%" } }, /* @__PURE__ */ React.createElement("option", { value: "solid" }, "Solid color"), /* @__PURE__ */ React.createElement("option", { value: "by_x" }, "By X value"), /* @__PURE__ */ React.createElement("option", { value: "by_y" }, "By Y value")), cfg.colorMode === "solid" && /* @__PURE__ */ React.createElement(ColorInput, { value: cfg.color, onChange: (v) => updateSeries(idx, "color", v), size: 24 }), cfg.colorMode !== "solid" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("select", { value: cfg.palette, onChange: (e) => updateSeries(idx, "palette", e.target.value), style: { ...selSt, width: "100%" } }, Object.keys(COLOR_PALETTES).map((p) => /* @__PURE__ */ React.createElement("option", { key: p, value: p }, p))), /* @__PURE__ */ React.createElement(PaletteStrip, { palette: cfg.palette }))), !hasSizeMap && /* @__PURE__ */ React.createElement(
      SliderControl,
      {
        label: "Size",
        value: cfg.pointSize,
        min: 1,
        max: 20,
        step: 0.5,
        onChange: (v) => updateSeries(idx, "pointSize", v)
      }
    ), /* @__PURE__ */ React.createElement(
      SliderControl,
      {
        label: "Opacity",
        value: cfg.opacity,
        displayValue: cfg.opacity.toFixed(2),
        min: 0.05,
        max: 1,
        step: 0.05,
        onChange: (v) => updateSeries(idx, "opacity", v)
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#777" } }, "Stroke"), /* @__PURE__ */ React.createElement(
      ColorInput,
      {
        value: cfg.strokeColor === "none" ? "#ffffff" : cfg.strokeColor,
        onChange: (v) => updateSeries(idx, "strokeColor", v),
        size: 20
      }
    )), /* @__PURE__ */ React.createElement(
      SliderControl,
      {
        label: "Stroke width",
        value: cfg.strokeWidth,
        min: 0,
        max: 3,
        step: 0.25,
        onChange: (v) => updateSeries(idx, "strokeWidth", v)
      }
    ));
  })), /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#777", textTransform: "uppercase", letterSpacing: 1 } }, "Aesthetic mappings"), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 6 } }, "Color by column"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: colorMapCol == null ? "" : colorMapCol,
      onChange: (e) => {
        setColorMapCol(e.target.value === "" ? null : parseInt(e.target.value));
      },
      style: { ...selSt, width: "100%" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 None \u2014"),
    mappableCols.filter(({ i }) => i !== sizeMapCol).map(
      ({ i, h }) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, h)
    )
  ), hasColorMap && colorMapType && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888" } }, "Detected: ", /* @__PURE__ */ React.createElement("strong", { style: { color: colorMapType === "continuous" ? "#7c3aed" : "#0369a1" } }, colorMapType === "continuous" ? "numeric (continuous)" : `categorical (${colorMapCategories.length} groups)`)), colorMapType === "continuous" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("select", { value: colorMapPalette, onChange: (e) => setColorMapPalette(e.target.value), style: { ...selSt, width: "100%", fontSize: 11 } }, Object.keys(COLOR_PALETTES).map((p) => /* @__PURE__ */ React.createElement("option", { key: p, value: p }, p))), /* @__PURE__ */ React.createElement(PaletteStrip, { palette: colorMapPalette }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#aaa" } }, "range: ", fmtTick(colorMapRange[0]), " \u2192 ", fmtTick(colorMapRange[1]))), colorMapType === "discrete" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" } }, colorMapCategories.map((cat, ci) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
    ColorInput,
    {
      value: colorMapDiscrete[cat] || PALETTE[ci % PALETTE.length],
      onChange: (v) => setColorMapDiscrete((prev) => ({ ...prev, [cat]: v })),
      size: 18
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#333" } }, cat)))))), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", border: "1px solid #ccc", borderRadius: 8, padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 6 } }, "Size by column"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: sizeMapCol == null ? "" : sizeMapCol,
      onChange: (e) => {
        setSizeMapCol(e.target.value === "" ? null : parseInt(e.target.value));
      },
      style: { ...selSt, width: "100%" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u2014 None \u2014"),
    mappableCols.filter(({ i }) => i !== colorMapCol).map(
      ({ i, h }) => /* @__PURE__ */ React.createElement("option", { key: i, value: i }, h)
    )
  ), hasSizeMap && sizeMapType && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#888" } }, "Detected: ", /* @__PURE__ */ React.createElement("strong", { style: { color: sizeMapType === "continuous" ? "#7c3aed" : "#0369a1" } }, sizeMapType === "continuous" ? "numeric (continuous)" : `categorical (${sizeMapCategories.length} groups)`)), sizeMapType === "continuous" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Min size",
      value: sizeMapMin,
      min: 1,
      max: 20,
      step: 0.5,
      onChange: (v) => setSizeMapMin(v)
    }
  ), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Max size",
      value: sizeMapMax,
      min: 1,
      max: 30,
      step: 0.5,
      onChange: (v) => setSizeMapMax(v)
    }
  ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#aaa" } }, "range: ", fmtTick(sizeMapRange[0]), " \u2192 ", fmtTick(sizeMapRange[1]))), sizeMapType === "discrete" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" } }, sizeMapCategories.map((cat) => {
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
  }))))), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Axes"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X min"), /* @__PURE__ */ React.createElement("input", { type: "number", value: vis.xMin, step: "any", onChange: (e) => updVis({ xMin: Number(e.target.value) }), style: { ...scInp, width: "100%" } })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X max"), /* @__PURE__ */ React.createElement("input", { type: "number", value: vis.xMax, step: "any", onChange: (e) => updVis({ xMax: Number(e.target.value) }), style: { ...scInp, width: "100%" } }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y min"), /* @__PURE__ */ React.createElement("input", { type: "number", value: vis.yMin, step: "any", onChange: (e) => updVis({ yMin: Number(e.target.value) }), style: { ...scInp, width: "100%" } })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y max"), /* @__PURE__ */ React.createElement("input", { type: "number", value: vis.yMax, step: "any", onChange: (e) => updVis({ yMax: Number(e.target.value) }), style: { ...scInp, width: "100%" } }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "X label"), /* @__PURE__ */ React.createElement("input", { value: vis.xLabel, onChange: (e) => updVis({ xLabel: e.target.value }), style: { ...scInp, width: "100%", textAlign: "left" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y label"), /* @__PURE__ */ React.createElement("input", { value: vis.yLabel, onChange: (e) => updVis({ yLabel: e.target.value }), style: { ...scInp, width: "100%", textAlign: "left" } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Title"), /* @__PURE__ */ React.createElement("input", { value: vis.plotTitle, onChange: (e) => updVis({ plotTitle: e.target.value }), style: { ...scInp, width: "100%", textAlign: "left" } })))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Style"), /* @__PURE__ */ React.createElement(
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
  ), rl.label && /* @__PURE__ */ React.createElement("select", { value: rl.labelSide, onChange: (e) => updateRefLine(rl.id, "labelSide", e.target.value), style: { ...selSt, fontSize: 11, width: "100%" } }, rl.dir === "h" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("option", { value: "right" }, "right"), /* @__PURE__ */ React.createElement("option", { value: "left" }, "left")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("option", { value: "top" }, "top"), /* @__PURE__ */ React.createElement("option", { value: "bottom" }, "bottom")))))))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 20, background: "#fff" } }, /* @__PURE__ */ React.createElement(
    ScatterChart,
    {
      ref: svgRef,
      data: filteredData,
      rawData: filteredRawRows,
      xcol,
      seriesList,
      xMin: vis.xMin,
      xMax: vis.xMax,
      yMin: vis.yMin,
      yMax: vis.yMax,
      xLabel: vis.xLabel,
      yLabel: vis.yLabel,
      title: vis.plotTitle,
      plotBg: vis.plotBg,
      showGrid: vis.showGrid,
      gridColor: vis.gridColor,
      refLines,
      xDataMin,
      xDataMax,
      yDataMin,
      yDataMax,
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
      svgLegend: (() => {
        const items = [];
        if (!hasColorMap && seriesList.length > 1) {
          items.push({ title: null, items: seriesList.map((s) => ({ label: s.label, color: s.color, shape: "dot" })) });
        }
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
        return items.length > 0 ? items : null;
      })()
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
  const [colRoles, setColRoles] = useState([]);
  const [filterState, setFilterState] = useState({});
  const [seriesConfig, setSeriesConfig] = useState({});
  const [colorMapCol, setColorMapCol] = useState(null);
  const [colorMapPalette, setColorMapPalette] = useState("viridis");
  const [colorMapDiscrete, setColorMapDiscrete] = useState({});
  const [sizeMapCol, setSizeMapCol] = useState(null);
  const [sizeMapMin, setSizeMapMin] = useState(3);
  const [sizeMapMax, setSizeMapMax] = useState(15);
  const [sizeMapDiscrete, setSizeMapDiscrete] = useState({});
  const visInit = { xMin: 0, xMax: 1, yMin: 0, yMax: 1, xLabel: "", yLabel: "", plotTitle: "", plotBg: "#ffffff", showGrid: true, gridColor: "#e0e0e0" };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);
  const [refLines, setRefLines] = useState([]);
  const svgRef = useRef();
  const sepRef = useRef("");
  const parsed = useMemo(() => rawText ? parseData(rawText, sepRef.current) : null, [rawText]);
  const xcol = useMemo(() => {
    const i = colRoles.indexOf("x");
    return i >= 0 ? i : 0;
  }, [colRoles]);
  const yColIdxs = useMemo(() => colRoles.reduce((a, r, i) => r === "y" ? [...a, i] : a, []), [colRoles]);
  const availableColIdxs = useMemo(() => colRoles.reduce((a, r, i) => r === "available" ? [...a, i] : a, []), [colRoles]);
  const activeColIdxs = useMemo(() => colRoles.reduce((a, r, i) => r !== "ignore" ? [...a, i] : a, []), [colRoles]);
  const colIsNumeric = useMemo(() => {
    if (!parsed) return {};
    return parsed.headers.reduce((acc, _, i) => {
      const vals = parsed.rawData.map((r) => r[i]).filter((v) => v !== "" && v != null);
      acc[i] = vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
      return acc;
    }, {});
  }, [parsed]);
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
  const seriesList = useMemo(
    () => Object.entries(seriesConfig).filter(([ci, cfg]) => {
      const idx = parseInt(ci);
      return idx !== xcol && idx !== colorMapCol && idx !== sizeMapCol && cfg.enabled;
    }).map(([ci, cfg]) => ({ colIdx: parseInt(ci), ...cfg })),
    [seriesConfig, xcol, colorMapCol, sizeMapCol]
  );
  const { xDataMin, xDataMax, yDataMin, yDataMax } = useMemo(() => {
    if (!parsed || !filteredData.length) return { xDataMin: 0, xDataMax: 1, yDataMin: 0, yDataMax: 1 };
    const xVals = filteredData.map((r) => r[xcol]).filter((v) => v != null);
    const yVals = seriesList.flatMap((s) => filteredData.map((r) => r[s.colIdx]).filter((v) => v != null));
    return {
      xDataMin: xVals.length ? Math.min(...xVals) : 0,
      xDataMax: xVals.length ? Math.max(...xVals) : 1,
      yDataMin: yVals.length ? Math.min(...yVals) : 0,
      yDataMax: yVals.length ? Math.max(...yVals) : 1
    };
  }, [filteredData, xcol, seriesList]);
  const autoAssignRoles = (headers, rawData) => {
    const isNum = (idx) => {
      const vals = rawData.map((r) => r[idx]).filter((v) => v !== "" && v != null);
      return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
    };
    const roles = headers.map((_, i) => isNum(i) ? "y" : "available");
    const firstY = roles.indexOf("y");
    if (firstY >= 0) roles[firstY] = "x";
    return roles;
  };
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
    setColRoles(autoAssignRoles(headers, rawData));
    setFilterState({});
    setSeriesConfig({});
    setRefLines([]);
    setStep("configure");
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
  const updateSeries = (colIdx, key, val) => setSeriesConfig((prev) => ({ ...prev, [colIdx]: { ...prev[colIdx], [key]: val } }));
  const goToPlot = () => {
    if (!parsed || colRoles.indexOf("x") < 0 || yColIdxs.length === 0) return;
    let colorIdx = 0;
    const cfg = {};
    yColIdxs.forEach((ci) => {
      cfg[ci] = {
        enabled: true,
        label: parsed.headers[ci],
        color: PALETTE[colorIdx++ % PALETTE.length],
        colorMode: "solid",
        palette: "viridis",
        pointSize: 5,
        opacity: 0.8,
        strokeColor: "#000000",
        strokeWidth: 1
      };
    });
    setSeriesConfig(cfg);
    setColorMapCol(null);
    setColorMapDiscrete({});
    setSizeMapCol(null);
    setSizeMapDiscrete({});
    const upd = { xLabel: parsed.headers[colRoles.indexOf("x")], yLabel: "", plotTitle: "" };
    const xi = colRoles.indexOf("x");
    const xVals = filteredData.map((r) => r[xi]).filter((v) => v != null);
    const yVals = yColIdxs.flatMap((ci) => filteredData.map((r) => r[ci]).filter((v) => v != null));
    const xPad = xVals.length > 1 ? (Math.max(...xVals) - Math.min(...xVals)) * 0.05 : 0.5;
    const yPad = yVals.length > 1 ? (Math.max(...yVals) - Math.min(...yVals)) * 0.05 : 0.5;
    if (xVals.length) {
      upd.xMin = Math.min(...xVals) - xPad;
      upd.xMax = Math.max(...xVals) + xPad;
    }
    if (yVals.length) {
      upd.yMin = Math.min(...yVals) - yPad;
      upd.yMax = Math.max(...yVals) + yPad;
    }
    updVis(upd);
    setStep("plot");
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
  const mappableCols = parsed && colRoles.length > 0 ? availableColIdxs.map((i) => ({ i, h: parsed.headers[i] })) : [];
  const hasXY = !!parsed && colRoles.indexOf("x") >= 0 && yColIdxs.length > 0;
  const canNavigate = (s) => {
    if (s === "upload") return true;
    if (s === "configure") return !!parsed;
    if (s === "plot") return hasXY;
    return false;
  };
  const handleStepChange = (s) => {
    if (s === "plot" && hasXY && Object.keys(seriesConfig).length === 0) {
      goToPlot();
      return;
    }
    setStep(s);
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
      steps: ["upload", "configure", "plot"],
      currentStep: step,
      onStepChange: handleStepChange,
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
  ), step === "configure" && parsed && /* @__PURE__ */ React.createElement(
    ConfigureStep,
    {
      parsed,
      colRoles,
      setColRoles,
      colIsNumeric,
      availableColIdxs,
      activeColIdxs,
      yColIdxs,
      filterState,
      setFilterState,
      uniqueVals,
      filteredData,
      goToPlot
    }
  ), step === "plot" && parsed && /* @__PURE__ */ React.createElement(
    PlotStep,
    {
      parsed,
      fileName,
      filteredData,
      filteredRawRows,
      filteredIndices,
      xcol,
      yColIdxs,
      colRoles,
      activeColIdxs,
      seriesConfig,
      updateSeries,
      seriesList,
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
      vis,
      updVis,
      refLines,
      addRefLine,
      updateRefLine,
      removeRefLine,
      xDataMin,
      xDataMax,
      yDataMin,
      yDataMax,
      mappableCols,
      setStep,
      resetAll,
      svgRef
    }
  ));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
