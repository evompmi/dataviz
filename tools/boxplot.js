const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef, memo } = React;
const BoxplotChart = forwardRef(function BoxplotChart2({
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
  plotStyle = "box"
}, ref) {
  const angle = xLabelAngle || 0;
  const absA = Math.abs(angle);
  const pieSpace = cbc >= 0 && showCompPie ? 60 : 0;
  const botM = 60 + (absA > 0 ? absA * 0.8 : 0) + pieSpace;
  const M = { top: 24, right: 24, bottom: botM, left: 62 };
  const allV = groups.flatMap((g) => g.allValues);
  if (allV.length === 0) return null;
  let dMin = Math.min(...allV);
  let dMax = Math.max(...allV);
  if (plotStyle === "violin" || plotStyle === "raincloud") {
    for (const g of groups) {
      if (g.allValues.length >= 2) {
        const pts = kde(g.allValues, 60);
        const kMin = pts[0].x, kMax = pts[pts.length - 1].x;
        if (kMin < dMin) dMin = kMin;
        if (kMax > dMax) dMax = kMax;
      }
    }
  }
  const pad = (dMax - dMin) * 0.08 || 1;
  const yMin = yMinP != null ? yMinP : dMin - pad;
  const yMax = yMaxP != null ? yMaxP : dMax + pad;
  const n = groups.length;
  const compact = (100 - (boxGap != null ? boxGap : 0)) / 100;
  const vbW = Math.max(200, n * 100 * compact + M.left + M.right);
  const vbH_chart = 504 + (absA > 0 ? absA * 0.8 : 0);
  const _legH = computeLegendHeight(svgLegend, vbW - M.left - M.right);
  const vbH = vbH_chart + _legH;
  const w = vbW - M.left - M.right;
  const h = vbH_chart - M.top - M.bottom;
  const bandW = w / n;
  const bx = (i) => M.left + i * bandW + bandW / 2;
  const sy = (v) => M.top + (1 - (v - yMin) / (yMax - yMin || 1)) * h;
  const yTicks = makeTicks(yMin, yMax, 8);
  const halfBox = boxWidth / 100 * bandW * 0.4;
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
      if (pct >= 1) return /* @__PURE__ */ React.createElement("circle", { key: si, cx: lx, cy: cy2, r, fill: col });
      const x0 = lx + Math.sin(a0) * r;
      const y0 = cy2 - Math.cos(a0) * r;
      const x1 = lx + Math.sin(a1) * r;
      const y1 = cy2 - Math.cos(a1) * r;
      const lg = pct > 0.5 ? 1 : 0;
      return /* @__PURE__ */ React.createElement("path", { key: si, d: `M${lx},${cy2}L${x0},${y0}A${r},${r},0,${lg},1,${x1},${y1}Z`, fill: col });
    });
    const labels = g.sources.map((src, si) => {
      const pct = src.values.length / total;
      if (pct < 0.08) return null;
      const cumPct = g.sources.slice(0, si).reduce((s, ss) => s + ss.values.length / total, 0);
      const midA = (cumPct + pct / 2) * Math.PI * 2;
      const lr = r + 8;
      return /* @__PURE__ */ React.createElement(
        "text",
        {
          key: `t${si}`,
          x: lx + Math.sin(midA) * lr,
          y: cy2 - Math.cos(midA) * lr + 3,
          textAnchor: "middle",
          fontSize: "7",
          fill: "#888",
          fontFamily: "sans-serif"
        },
        Math.round(pct * 100),
        "%"
      );
    });
    return /* @__PURE__ */ React.createElement("g", { key: `cb-${g.name}` }, slices, /* @__PURE__ */ React.createElement("circle", { cx: lx, cy: cy2, r, fill: "none", stroke: "#ddd", strokeWidth: "0.5" }), labels);
  };
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${vbW} ${vbH}`,
      style: { width: vbW, maxWidth: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": plotTitle || "Box plot"
    },
    /* @__PURE__ */ React.createElement("title", null, plotTitle || "Box plot"),
    /* @__PURE__ */ React.createElement("desc", null, `Box plot with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`),
    /* @__PURE__ */ React.createElement("rect", { x: M.left, y: M.top, width: w, height: h, fill: plotBg }),
    showGrid && yTicks.map(
      (t) => /* @__PURE__ */ React.createElement(
        "line",
        {
          key: t,
          x1: M.left,
          x2: M.left + w,
          y1: sy(t),
          y2: sy(t),
          stroke: gridColor,
          strokeWidth: "0.5"
        }
      )
    ),
    yTicks.map(
      (t) => /* @__PURE__ */ React.createElement("g", { key: t }, /* @__PURE__ */ React.createElement("line", { x1: M.left - 5, x2: M.left, y1: sy(t), y2: sy(t), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: M.left - 8, y: sy(t) + 4, textAnchor: "end", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, Math.abs(t) < 0.01 && t !== 0 ? t.toExponential(1) : t % 1 === 0 ? t : t.toFixed(2)))
    ),
    groups.map((g, gi) => {
      if (!g.stats) return null;
      const cx = bx(gi);
      const { q1, med, q3, wLo, wHi } = g.stats;
      const isRain = plotStyle === "raincloud";
      const isViolin = plotStyle === "violin" || isRain;
      let violinPath = null;
      if (isViolin && g.allValues.length >= 2) {
        const pts = kde(g.allValues, 60);
        const maxD = Math.max(...pts.map((p) => p.d));
        if (maxD > 0) {
          const sc = (d) => d / maxD * halfBox;
          if (isRain) {
            let d = `M ${cx},${sy(pts[0].x)}`;
            for (const p of pts) d += ` L ${cx - sc(p.d)},${sy(p.x)}`;
            d += ` L ${cx},${sy(pts[pts.length - 1].x)} Z`;
            violinPath = /* @__PURE__ */ React.createElement("path", { d, fill: g.color, fillOpacity: boxFillOpacity, stroke: g.color, strokeWidth: "1" });
          } else {
            let d = `M ${cx - sc(pts[0].d)},${sy(pts[0].x)}`;
            for (const p of pts) d += ` L ${cx - sc(p.d)},${sy(p.x)}`;
            d += ` L ${cx + sc(pts[pts.length - 1].d)},${sy(pts[pts.length - 1].x)}`;
            for (let i = pts.length - 1; i >= 0; i--) d += ` L ${cx + sc(pts[i].d)},${sy(pts[i].x)}`;
            d += " Z";
            violinPath = /* @__PURE__ */ React.createElement("path", { d, fill: g.color, fillOpacity: boxFillOpacity, stroke: g.color, strokeWidth: "1" });
          }
        }
      }
      const boxHalf = isViolin ? halfBox * 0.35 : halfBox;
      const boxCx = isRain ? cx + halfBox * 0.15 : cx;
      const boxEls = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("line", { x1: boxCx, x2: boxCx, y1: sy(wHi), y2: sy(q3), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("line", { x1: boxCx, x2: boxCx, y1: sy(q1), y2: sy(wLo), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("line", { x1: boxCx - boxHalf * 0.5, x2: boxCx + boxHalf * 0.5, y1: sy(wHi), y2: sy(wHi), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("line", { x1: boxCx - boxHalf * 0.5, x2: boxCx + boxHalf * 0.5, y1: sy(wLo), y2: sy(wLo), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement(
        "rect",
        {
          x: boxCx - boxHalf,
          y: sy(q3),
          width: boxHalf * 2,
          height: sy(q1) - sy(q3),
          fill: isViolin ? "#fff" : g.color,
          fillOpacity: isViolin ? 0.7 : boxFillOpacity,
          stroke: g.color,
          strokeWidth: "1.5",
          rx: "2"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: boxCx - boxHalf,
          x2: boxCx + boxHalf,
          y1: sy(med),
          y2: sy(med),
          stroke: g.color,
          strokeWidth: "2.5"
        }
      ));
      const ptOffset = isRain ? halfBox * 0.55 : 0;
      const jitterEls = showPoints && g.sources.map((src, si) => {
        const rng = seededRandom(gi * 1e3 + si * 100 + 42);
        const ptColor = pointColor(g, src, si);
        return src.values.map((v, vi) => {
          const j = isRain ? ptOffset + Math.abs(rng() - 0.5) * jitterWidth * halfBox : (rng() - 0.5) * jitterWidth * halfBox * 2;
          return /* @__PURE__ */ React.createElement(
            "circle",
            {
              key: `${g.name}-${si}-${vi}`,
              cx: cx + j,
              cy: sy(v),
              r: pointSize,
              fill: ptColor,
              fillOpacity: pointOpacity || 0.6,
              stroke: ptColor,
              strokeOpacity: Math.min(1, (pointOpacity || 0.6) + 0.15),
              strokeWidth: "0.3"
            }
          );
        });
      });
      const outlierCx = isRain ? cx + ptOffset : cx;
      const outlierEls = g.sources.flatMap(
        (src, si) => src.values.filter((v) => v < wLo || v > wHi).map(
          (v, oi) => /* @__PURE__ */ React.createElement(
            "circle",
            {
              key: `out-${g.name}-${si}-${oi}`,
              cx: outlierCx,
              cy: sy(v),
              r: 2.5,
              fill: "#000",
              fillOpacity: 0.8,
              stroke: "none"
            }
          )
        )
      );
      return /* @__PURE__ */ React.createElement("g", { key: g.name, role: "group", "aria-label": `${g.name}: median ${med.toFixed(2)}, Q1 ${q1.toFixed(2)}, Q3 ${q3.toFixed(2)}, n=${g.stats.n}` }, violinPath, boxEls, jitterEls, outlierEls);
    }),
    /* @__PURE__ */ React.createElement("rect", { x: M.left, y: M.top, width: w, height: h, fill: "none", stroke: "#333", strokeWidth: "1" }),
    groups.map((g, gi) => {
      const lx = bx(gi);
      const ly = M.top + h + 16;
      const compBar = renderCompPie(g, lx);
      return /* @__PURE__ */ React.createElement(React.Fragment, { key: `xl-${g.name}` }, angle === 0 ? /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement(
        "text",
        {
          x: lx,
          y: ly,
          textAnchor: "middle",
          fontSize: "11",
          fill: "#333",
          fontFamily: "sans-serif",
          fontWeight: "600"
        },
        g.name
      ), /* @__PURE__ */ React.createElement(
        "text",
        {
          x: lx,
          y: ly + 14,
          textAnchor: "middle",
          fontSize: "9",
          fill: "#999",
          fontFamily: "sans-serif"
        },
        "n=",
        g.stats?.n || 0
      )) : /* @__PURE__ */ React.createElement("g", { transform: `rotate(${angle},${lx},${ly})` }, /* @__PURE__ */ React.createElement(
        "text",
        {
          x: lx,
          y: ly,
          textAnchor: "end",
          dominantBaseline: "middle",
          fontSize: "11",
          fill: "#333",
          fontFamily: "sans-serif",
          fontWeight: "600"
        },
        g.name
      ), /* @__PURE__ */ React.createElement(
        "text",
        {
          x: lx,
          y: ly + 12,
          textAnchor: "end",
          dominantBaseline: "middle",
          fontSize: "9",
          fill: "#999",
          fontFamily: "sans-serif"
        },
        "n=",
        g.stats?.n || 0
      )), compBar);
    }),
    yLabel && /* @__PURE__ */ React.createElement(
      "text",
      {
        transform: `translate(14,${M.top + h / 2}) rotate(-90)`,
        textAnchor: "middle",
        fontSize: "13",
        fill: "#444",
        fontFamily: "sans-serif"
      },
      yLabel
    ),
    plotTitle && /* @__PURE__ */ React.createElement(
      "text",
      {
        x: M.left + w / 2,
        y: 14,
        textAnchor: "middle",
        fontSize: "15",
        fontWeight: "700",
        fill: "#222",
        fontFamily: "sans-serif"
      },
      plotTitle
    ),
    renderSvgLegend(svgLegend, vbH_chart + 10, M.left, vbW - M.left - M.right, 88, 14)
  );
});
function UploadStep({ sepOverride, onSepChange, rawText, doParse, handleFileLoad, setStep }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    UploadPanel,
    {
      sepOverride,
      onSepChange: (v) => {
        onSepChange(v);
        if (rawText) {
          doParse(rawText, v);
          setStep("configure");
        }
      },
      onFileLoad: handleFileLoad,
      hint: "CSV \xB7 TSV \xB7 TXT \xB7 DAT"
    }
  ), /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 12px", fontSize: 11, color: "#aaa", textAlign: "right" } }, "\u26A0 Max file size: 2 MB"), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 24, borderRadius: 14, overflow: "hidden", border: "2px solid #648FFF", boxShadow: "0 4px 20px rgba(100,143,255,0.12)" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(135deg,#4a6cf7,#648FFF)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 } }, toolIcon("boxplot", 24, { circle: true }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "#fff", fontWeight: 700, fontSize: 15 } }, "Boxplot \u2014 How to use"), /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 } }, "Long or wide data \u2192 auto-detect \u2192 customizable boxplots"))), /* @__PURE__ */ React.createElement("div", { style: { background: "#eef2ff", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Purpose"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, lineHeight: 1.75, color: "#444", margin: 0 } }, "An all-in-one boxplot tool that accepts ", /* @__PURE__ */ React.createElement("strong", null, "both long and wide formats"), ". Wide data (all-numeric columns, headers = group names) is auto-detected and goes straight to plot. Long data gets the full pipeline: assign column roles, filter, rename, reorder, then plot \u2014 all without code.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Long format"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#555", marginBottom: 8, lineHeight: 1.6 } }, "Each ", /* @__PURE__ */ React.createElement("strong", null, "row"), " = one observation. Columns mix categorical labels and numeric values."), /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("tbody", null, [["WT", "0.368", "M", "6wpi"], ["WT", "0.204", "M", "6wpi"], ["lyka-1", "0", "NM", "6wpi"], ["lykb-1", "0.285", "M", "6wpi"]].map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#f0f4ff" : "#fff" } }, r.map((v, j) => /* @__PURE__ */ React.createElement("td", { key: j, style: { padding: "3px 8px", border: "1px solid #d0dbff", color: "#333" } }, v))))))), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#2EC4B6", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Wide format \u2192 auto-detected!"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#555", marginBottom: 8, lineHeight: 1.6 } }, "One ", /* @__PURE__ */ React.createElement("strong", null, "column"), " per condition. All values numeric. Headers = group names. ", /* @__PURE__ */ React.createElement("strong", null, "Goes straight to plot.")), /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "#d1fae5" } }, ["WT", "WT", "mutA", "mutB"].map((h, i) => /* @__PURE__ */ React.createElement("th", { key: i, style: { padding: "3px 8px", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 700 } }, h)))), /* @__PURE__ */ React.createElement("tbody", null, [[0.45, 0.52, 0.12, 0.31], [0.48, 0.51, 0.08, 0.28], [0.41, 0.49, 0.15, 0.35]].map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#f0fdf4" : "#fff" } }, r.map((v, j) => /* @__PURE__ */ React.createElement("td", { key: j, style: { padding: "3px 8px", border: "1px solid #bbf7d0", color: "#333" } }, v))))))), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "Workflow"), [
    { icon: "\u{1F4C2}", text: "Upload: drop or select your CSV / TSV / TXT / DAT file." },
    { icon: "\u2699\uFE0F", text: "Configure: assign roles \u2014 group (X axis), value (Y axis), filter, text, or ignore." },
    { icon: "\u{1F50D}", text: "Filter & Rename: tick values to keep, rename labels, drag to reorder groups." },
    { icon: "\u{1F4CA}", text: "Output: summary stats (n, mean, median, SD, SEM), long & wide CSV exports." },
    { icon: "\u{1F3A8}", text: "Plot: color-by, facet-by, jitter controls, and SVG download." }
  ].map(({ icon, text }) => /* @__PURE__ */ React.createElement("div", { key: icon, style: { display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, flexShrink: 0 } }, icon), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444", lineHeight: 1.55 } }, text)))), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#E07B39", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "\u{1F967} Composition Pies"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#555", marginBottom: 8, lineHeight: 1.6 } }, "When ", /* @__PURE__ */ React.createElement("strong", null, "Color by"), " is active, a ", /* @__PURE__ */ React.createElement("strong", null, "Composition pies"), " checkbox appears. Enable it to display a small pie chart beneath each boxplot group showing the proportion of each color-by category within that group."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } }, [
    { step: "1.", text: "Enable Points (the jitter overlay) in the plot controls." },
    { step: "2.", text: "Select a column in the Color by dropdown." },
    { step: "3.", text: "Tick the Composition pies checkbox that appears next to it." }
  ].map(({ step, text }) => /* @__PURE__ */ React.createElement("div", { key: step, style: { display: "flex", gap: 8, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#E07B39", flexShrink: 0 } }, step), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444", lineHeight: 1.55 } }, text))))), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#7c3aed", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" } }, "\u{1F3BB} Plot Styles"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#555", marginBottom: 8, lineHeight: 1.6 } }, "Use the ", /* @__PURE__ */ React.createElement("strong", null, "Plot style"), " dropdown in the style controls to switch between three visualization modes:"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } }, [
    { step: "Box", text: "Classic box-and-whisker plot. Median line, IQR box, 1.5\xD7IQR whiskers, outlier dots." },
    { step: "Violin", text: "Symmetric kernel density (KDE) shape showing the full distribution, with a narrow box overlay for quartiles." },
    { step: "Raincloud", text: "Half-violin on the left + narrow box in the center + jitter points on the right. Best for showing raw data alongside the distribution shape." }
  ].map(({ step, text }) => /* @__PURE__ */ React.createElement("div", { key: step, style: { display: "flex", gap: 8, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#7c3aed", flexShrink: 0, width: 62, display: "inline-block" } }, step), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444", lineHeight: 1.55 } }, text)))), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 10, color: "#888", marginTop: 8, marginBottom: 0, lineHeight: 1.5 } }, "All styles support color-by, facet-by, and outlier dots. The Y-axis auto-adjusts to fit the violin/raincloud density curves.")), /* @__PURE__ */ React.createElement("div", { style: { borderLeft: "4px solid #648FFF", background: "#dbeafe", padding: "10px 14px", borderRadius: "0 8px 8px 0", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#3b6cf7" } }, "\u{1F4A1} Tip \u2014 "), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, "Wide-format files (like the output of the Bar Graph or Aequorin tools) are auto-detected and go straight to plot. For long-format, you can facet by one column while coloring points by another.")), /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" } }, ["Separator explicitly selected (comma, semicolon, tab, space)", "Quoted values stripped automatically", "100% browser-side \u2014 nothing uploaded"].map((t) => /* @__PURE__ */ React.createElement("span", { key: t, style: { fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "#fff", border: "1px solid #b0c4ff", color: "#555" } }, t))))));
}
function ConfigureStep({ fileName, parsedHeaders, parsedRows, hasHeader, colRoles, colNames, valueColIdx, valueColIsNumeric, onRoleChange, onNameChange, setStep }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 4px", fontSize: 13, color: "#666" } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, fileName), " \u2014 ", parsedHeaders.length, " cols \xD7 ", parsedRows.length, " rows", hasHeader ? "" : " (no header)"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#999", marginBottom: 10 } }, "Preview (first 8 rows):"), /* @__PURE__ */ React.createElement(DataPreview, { headers: parsedHeaders, rows: parsedRows, maxRows: 8 })), /* @__PURE__ */ React.createElement(
    ColumnRoleEditor,
    {
      headers: parsedHeaders,
      rows: parsedRows,
      colRoles,
      colNames,
      onRoleChange,
      onNameChange
    }
  ), valueColIdx >= 0 && !valueColIsNumeric && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#fef2f2", borderColor: "#fca5a5", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#dc2626" } }, "\u26A0 Column ", /* @__PURE__ */ React.createElement("strong", null, '"', colNames[valueColIdx], '"'), " is assigned as ", /* @__PURE__ */ React.createElement("strong", null, "value"), " but appears to be non-numeric \u2014 the plot will be empty. Please assign a numeric column as value.")), /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("filter"), style: btnPrimary }, "Filter & Rename \u2192"));
}
function FilterStep({ parsedHeaders, parsedRows, colRoles, colNames, filters, filteredRows, renamedRows, activeColIdxs, valueRenames, groupColIdx, effectiveOrder, applyRename, toggleFilter, toggleAllFilter, setRenameVal, setGroupOrder, dragIdx, setDragIdx, canPlot, setStep }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16, alignItems: "stretch", marginBottom: 16 } }, /* @__PURE__ */ React.createElement(
    FilterCheckboxPanel,
    {
      headers: parsedHeaders,
      colNames,
      colRoles,
      filters,
      filteredCount: filteredRows.length,
      totalCount: parsedRows.length,
      onToggle: toggleFilter,
      onToggleAll: toggleAllFilter
    }
  ), /* @__PURE__ */ React.createElement(
    RenameReorderPanel,
    {
      headers: parsedHeaders,
      colNames,
      colRoles,
      filters,
      valueRenames,
      groupColIdx,
      effectiveOrder,
      applyRename,
      onRenameVal: setRenameVal,
      onReorder: setGroupOrder,
      dragIdx,
      onDragStart: setDragIdx,
      onDragEnd: () => setDragIdx(null)
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #99f6e4", background: "#f0fdfa" } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#0f766e" } }, "Preview (", renamedRows.length, " rows):"), /* @__PURE__ */ React.createElement(DataPreview, { headers: activeColIdxs.map((i) => colNames[i]), rows: renamedRows.map((r) => activeColIdxs.map((i) => r[i])), maxRows: 10 })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("output"), style: btnPrimary }, "Output \u2192"), canPlot && /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("plot"), style: btnPlot }, "Plot \u2192")));
}
function OutputStep({ parsedRows, parsedHeaders, colRoles, colNames, groupColIdx, valueColIdx, valueColIsNumeric, stats, renamedRows, activeColIdxs, wideData, fileName, canPlot, setStep }) {
  return /* @__PURE__ */ React.createElement("div", null, groupColIdx >= 0 && valueColIdx >= 0 && stats.length > 0 && /* @__PURE__ */ React.createElement(StatsTable, { stats, groupLabel: colNames[groupColIdx] }), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#555" } }, "Filtered data (long)"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
    downloadCsv(activeColIdxs.map((i) => colNames[i]), renamedRows.map((r) => activeColIdxs.map((i) => r[i])), `sanitized_long_${fileName.replace(/\.[^.]+$/, "")}.csv`);
    flashSaved(e.currentTarget);
  }, style: { padding: "8px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#dcfce7", border: "1px solid #86efac", color: "#166534", fontFamily: "inherit", fontWeight: 600 } }, "\u2B07 Long CSV")), /* @__PURE__ */ React.createElement(DataPreview, { headers: activeColIdxs.map((i) => colNames[i]), rows: renamedRows.map((r) => activeColIdxs.map((i) => r[i])), maxRows: 6 })), wideData && /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#555" } }, "Reshaped (wide)"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
    downloadCsv(wideData.headers, wideData.rows, `sanitized_wide_${fileName.replace(/\.[^.]+$/, "")}.csv`);
    flashSaved(e.currentTarget);
  }, style: { padding: "8px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#dcfce7", border: "1px solid #86efac", color: "#166534", fontFamily: "inherit", fontWeight: 600 } }, "\u2B07 Wide CSV")), /* @__PURE__ */ React.createElement(DataPreview, { headers: wideData.headers, rows: wideData.rows, maxRows: 8 })), (groupColIdx < 0 || valueColIdx < 0) && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#fff8e8", borderColor: "#f0d060" } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#886600" } }, "\u26A0 Assign ", /* @__PURE__ */ React.createElement("strong", null, "group"), " + ", /* @__PURE__ */ React.createElement("strong", null, "value"), " columns to enable reshaping & stats.")), valueColIdx >= 0 && !valueColIsNumeric && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#fef2f2", borderColor: "#fca5a5" } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#dc2626" } }, "\u26A0 Column ", /* @__PURE__ */ React.createElement("strong", null, '"', colNames[valueColIdx], '"'), " is assigned as ", /* @__PURE__ */ React.createElement("strong", null, "value"), " but appears to be non-numeric \u2014 the plot will be empty. Go back to Configure and assign a numeric column as value.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("filter"), style: btnSecondary }, "\u2190 Filter"), canPlot && /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("plot"), style: btnPlot }, "Plot \u2192")));
}
function PlotControls({ dataFormat, setDataFormat, setStep, resetAll, allDisplayGroups, boxplotGroups, renamedRows, plotGroupRenames, setPlotGroupRenames, boxplotColors, setBoxplotColors, onToggleGroup, vis, updVis, colorByCol, setColorByCol, colorByCandidates, colNames, categoryColors, setCategoryColors, colorByCategories, facetByCol, setFacetByCol, onDownloadSvg, onDownloadPng, chartRef, facetedData, facetRefs }) {
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
      const cats = [...new Set(renamedRows.map((r) => r[v]))].sort();
      const cc = {};
      cats.forEach((c, ci) => {
        cc[c] = PALETTE[(ci + 2) % PALETTE.length];
      });
      setCategoryColors(cc);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { style: { width: 328, flexShrink: 0, position: "sticky", top: 24, maxHeight: "calc(100vh - 90px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 } }, dataFormat === "wide" && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#ecfdf5", borderColor: "#6ee7b7", padding: "10px 12px", marginBottom: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 15 } }, "\u26A1"), /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 11, color: "#065f46", fontWeight: 600 } }, "Wide format auto-detected")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setDataFormat("long");
    setStep("configure");
  }, style: { fontSize: 10, cursor: "pointer", background: "#fff", border: "1px solid #6ee7b7", color: "#065f46", fontFamily: "inherit", fontWeight: 600, borderRadius: 4, padding: "3px 8px", width: "100%" } }, "Switch to long pipeline")), /* @__PURE__ */ React.createElement(
    ActionsPanel,
    {
      onDownloadSvg,
      onDownloadPng,
      extraButtons: [
        { label: "\u2190 Output", onClick: () => setStep("output"), style: { ...btnSecondary, width: "100%" } },
        { label: "\u2190 Filter", onClick: () => setStep("filter"), style: { ...btnSecondary, width: "100%" } }
      ],
      onReset: resetAll
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { ...sec, marginBottom: 0 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Conditions"), /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 6px", fontSize: 11, color: "#888" } }, allDisplayGroups.filter((g) => g.enabled).length, " of ", allDisplayGroups.length, " selected \xB7 ", renamedRows.length, " obs"), /* @__PURE__ */ React.createElement(
    GroupColorEditor,
    {
      groups: allDisplayGroups,
      onColorChange: handleColorChange,
      onNameChange: handleNameChange,
      onToggle: onToggleGroup
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, marginBottom: 0, display: "flex", flexDirection: "column", gap: 9 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Plot style"), /* @__PURE__ */ React.createElement("select", { value: vis.plotStyle, onChange: (e) => updVis({ plotStyle: e.target.value }), style: { ...inp, cursor: "pointer", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("option", { value: "box" }, "Box plot"), /* @__PURE__ */ React.createElement("option", { value: "violin" }, "Violin plot"), /* @__PURE__ */ React.createElement("option", { value: "raincloud" }, "Raincloud plot"))), /* @__PURE__ */ React.createElement(
    BaseStyleControls,
    {
      plotBg: vis.plotBg,
      onPlotBgChange: sv("plotBg"),
      showGrid: vis.showGrid,
      onShowGridChange: sv("showGrid"),
      gridColor: vis.gridColor,
      onGridColorChange: sv("gridColor")
    }
  ), /* @__PURE__ */ React.createElement(SliderControl, { label: vis.plotStyle === "box" ? "Box width" : "Width", value: vis.boxWidth, displayValue: vis.boxWidth + "%", min: 20, max: 100, step: 5, onChange: sv("boxWidth") }), /* @__PURE__ */ React.createElement(SliderControl, { label: vis.plotStyle === "box" ? "Box gap" : "Gap", value: vis.boxGap, displayValue: vis.boxGap + "%", min: 0, max: 80, step: 5, onChange: sv("boxGap") }), /* @__PURE__ */ React.createElement(SliderControl, { label: "Fill opacity", value: vis.boxFillOpacity, displayValue: vis.boxFillOpacity.toFixed(2), min: 0, max: 1, step: 0.05, onChange: sv("boxFillOpacity") }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Points"), /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: vis.showPoints, onChange: (e) => updVis({ showPoints: e.target.checked }), style: { accentColor: "#648FFF" } })), vis.showPoints && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Color by"), /* @__PURE__ */ React.createElement("select", { value: colorByCol, onChange: handleColorByChange, style: { ...inp, cursor: "pointer", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("option", { value: -1 }, "\u2014 none \u2014"), colorByCandidates.map((ci) => /* @__PURE__ */ React.createElement("option", { key: ci, value: ci }, colNames[ci])))), colorByCol >= 0 && /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 4, paddingLeft: 8, cursor: "pointer" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: vis.showCompPie, onChange: (e) => updVis({ showCompPie: e.target.checked }) }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#555" } }, "Composition pies")), colorByCol >= 0 && colorByCategories.map((cat) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 } }, /* @__PURE__ */ React.createElement(ColorInput, { value: categoryColors[cat] || "#999999", onChange: (c) => setCategoryColors((p) => ({ ...p, [cat]: c })), size: 16 }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#555" } }, cat))), /* @__PURE__ */ React.createElement(SliderControl, { label: "Size", value: vis.pointSize, displayValue: vis.pointSize, min: 1, max: 6, step: 0.5, onChange: sv("pointSize") }), /* @__PURE__ */ React.createElement(SliderControl, { label: "Jitter", value: vis.jitterWidth, displayValue: vis.jitterWidth.toFixed(2), min: 0, max: 1, step: 0.05, onChange: sv("jitterWidth") }), /* @__PURE__ */ React.createElement(SliderControl, { label: "Opacity", value: vis.pointOpacity, displayValue: vis.pointOpacity.toFixed(2), min: 0.1, max: 1, step: 0.05, onChange: sv("pointOpacity") })), /* @__PURE__ */ React.createElement(SliderControl, { label: "X angle", value: vis.xLabelAngle, displayValue: vis.xLabelAngle + "\xB0", min: -90, max: 0, step: 5, onChange: sv("xLabelAngle") }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Facet by"), /* @__PURE__ */ React.createElement("select", { value: facetByCol, onChange: (e) => setFacetByCol(Number(e.target.value)), style: { ...inp, cursor: "pointer", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("option", { value: -1 }, "\u2014 none \u2014"), colorByCandidates.map((ci) => /* @__PURE__ */ React.createElement("option", { key: ci, value: ci }, colNames[ci]))))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, marginBottom: 0, display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Title"), /* @__PURE__ */ React.createElement("input", { value: vis.plotTitle, onChange: (e) => updVis({ plotTitle: e.target.value }), style: { ...inp, width: "100%", fontSize: 11 } })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y label"), /* @__PURE__ */ React.createElement("input", { value: vis.yLabel, onChange: (e) => updVis({ yLabel: e.target.value }), style: { ...inp, width: "100%", fontSize: 11 } })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y min"), /* @__PURE__ */ React.createElement("input", { value: vis.yMinCustom, onChange: (e) => updVis({ yMinCustom: e.target.value }), style: { ...inp, width: "100%", fontSize: 11 }, placeholder: "auto" })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y max"), /* @__PURE__ */ React.createElement("input", { value: vis.yMaxCustom, onChange: (e) => updVis({ yMaxCustom: e.target.value }), style: { ...inp, width: "100%", fontSize: 11 }, placeholder: "auto" })))));
}
const FacetBoxplotItem = memo(function FacetBoxplotItem2({ fd, facetRefs, chartProps, categoryColors }) {
  const localRef = useRef();
  useEffect(() => {
    facetRefs.current[fd.category] = localRef.current;
    return () => {
      delete facetRefs.current[fd.category];
    };
  }, [fd.category, facetRefs]);
  return /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 8, padding: 12, border: "1px solid #ddd", flex: "0 1 auto", minWidth: 180 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 10, height: 10, borderRadius: "50%", background: categoryColors[fd.category] || "#999" } }), /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#333" } }, fd.category), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#999" } }, "(", fd.groups.reduce((a, g) => a + g.allValues.length, 0), " pts)")), /* @__PURE__ */ React.createElement(BoxplotChart, { ref: localRef, ...chartProps }));
});
function PlotArea({ colorByCol, colorByCategories, colNames, categoryColors, facetByCol, facetedData, facetRefs, chartRef, displayBoxplotGroups, vis, yMinVal, yMaxVal, plotGroupRenames, boxplotColors }) {
  if (displayBoxplotGroups.length === 0 && (facetByCol < 0 || facetedData.length === 0)) {
    return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 20, background: "#fff" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "60px 20px", textAlign: "center", color: "#999", fontSize: 14 } }, "No conditions selected. Enable at least one to display the plot.")));
  }
  return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, colorByCol >= 0 && colorByCategories.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12, background: "#f8f8fa", borderRadius: 8, padding: "8px 14px", border: "1px solid #ddd", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#777" } }, "Points colored by: ", colNames[colorByCol]), colorByCategories.map((cat) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 10, height: 10, borderRadius: "50%", background: categoryColors[cat] || "#999" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, cat)))), facetByCol < 0 && /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: 20, border: "1px solid #ddd" } }, /* @__PURE__ */ React.createElement(
    BoxplotChart,
    {
      ref: chartRef,
      groups: displayBoxplotGroups,
      yLabel: vis.yLabel,
      plotTitle: vis.plotTitle,
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
      svgLegend: colorByCol >= 0 && colorByCategories.length > 0 ? [{
        title: `Points colored by: ${colNames[colorByCol]}`,
        items: colorByCategories.map((c) => ({ label: c, color: categoryColors[c] || "#999", shape: "dot" }))
      }] : null
    }
  )), facetByCol >= 0 && facetedData.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } }, facetedData.map((fd) => {
    const displayFdGroups = fd.groups.map((g) => ({ ...g, name: plotGroupRenames[g.name] ?? g.name, color: boxplotColors[g.name] ?? g.color }));
    const chartProps = {
      groups: displayFdGroups,
      yLabel: vis.yLabel,
      plotTitle: [vis.plotTitle, fd.category].filter(Boolean).join(" \u2014 "),
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
      svgLegend: colorByCol >= 0 && colorByCategories.length > 0 ? [{
        title: `Points colored by: ${colNames[colorByCol]}`,
        items: colorByCategories.map((c) => ({ label: c, color: categoryColors[c] || "#999", shape: "dot" }))
      }] : null
    };
    return /* @__PURE__ */ React.createElement(FacetBoxplotItem, { key: fd.category, fd, facetRefs, chartProps, categoryColors });
  })));
}
function App() {
  const [rawText, setRawText] = useState(null);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState(null);
  const [dataFormat, setDataFormat] = useState("long");
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [colRoles, setColRoles] = useState([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});
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
    plotStyle: "box"
  };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);
  const [boxplotColors, setBoxplotColors] = useState({});
  const [plotGroupRenames, setPlotGroupRenames] = useState({});
  const [disabledGroups, setDisabledGroups] = useState({});
  const [groupOrder, setGroupOrder] = useState([]);
  const [colorByCol, setColorByCol] = useState(-1);
  const [categoryColors, setCategoryColors] = useState({});
  const [dragIdx, setDragIdx] = useState(null);
  const [facetByCol, setFacetByCol] = useState(-1);
  const facetRefs = useRef({});
  const chartRef = useRef();
  const resetDerived = () => {
    setValueRenames({});
    setBoxplotColors({});
    setPlotGroupRenames({});
    setDisabledGroups({});
    setGroupOrder([]);
    setColorByCol(-1);
    setCategoryColors({});
    setFacetByCol(-1);
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
      setParseError("The file appears to be empty or has no data rows. Please check your file and try again.");
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
      setColRoles(headers.map((_, i) => guessColumnType(rows.map((r) => r[i] ?? ""))));
      setColNames([...headers]);
      setFilters(buildFilters(headers, rows));
      resetDerived();
      setDataFormat("long");
      setStep("configure");
    }
  }, []);
  const handleFileLoad = useCallback((text, name) => {
    setFileName(name);
    doParse(text, sepOverride);
  }, [sepOverride, doParse]);
  const resetAll = () => {
    setRawText(null);
    setParsedRows([]);
    setParsedHeaders([]);
    setFileName("");
    setStep("upload");
  };
  const applyRename = (ci, v) => valueRenames[ci] && valueRenames[ci][v] != null ? valueRenames[ci][v] : v;
  const filteredRows = useMemo(
    () => parsedRows.filter((r) => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))),
    [parsedRows, filters]
  );
  const renamedRows = useMemo(
    () => filteredRows.map((r) => r.map((v, ci) => applyRename(ci, v))),
    [filteredRows, valueRenames]
  );
  const activeColIdxs = useMemo(
    () => colRoles.reduce((acc, r, i) => {
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
    () => groupColIdx < 0 || valueColIdx < 0 ? null : reshapeWide(renamedRows, groupColIdx, valueColIdx),
    [renamedRows, groupColIdx, valueColIdx]
  );
  const naturalGroupOrder = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const seen = /* @__PURE__ */ new Set(), order = [];
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
    if (groupOrder.length > 0) {
      const valid = groupOrder.filter((g) => naturalGroupOrder.includes(g));
      const missing = naturalGroupOrder.filter((g) => !groupOrder.includes(g));
      return [...valid, ...missing];
    }
    return naturalGroupOrder;
  }, [groupOrder, naturalGroupOrder]);
  const colorByCandidates = useMemo(
    () => parsedHeaders.map((_, i) => i).filter(
      (i) => i !== groupColIdx && i !== valueColIdx && (colRoles[i] === "filter" || colRoles[i] === "group" || colRoles[i] === "text")
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
      const g = r[groupColIdx], v = Number(r[valueColIdx]);
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
    return effectiveOrder.filter((name) => gm[name]).map((name, gi) => {
      const catMap = gm[name];
      const sources = cats.filter((c) => catMap[c]).map((cat, si) => ({
        colIndex: si,
        values: catMap[cat],
        category: cat
      }));
      const allValues = sources.flatMap((s) => s.values);
      return {
        name,
        sources,
        allValues,
        stats: quartiles(allValues),
        color: boxplotColors[name] || PALETTE[gi % PALETTE.length]
      };
    });
  }, [renamedRows, groupColIdx, valueColIdx, boxplotColors, effectiveOrder, colorByCol, colorByCategories]);
  const allDisplayGroups = useMemo(
    () => boxplotGroups.map((g) => ({
      ...g,
      displayName: plotGroupRenames[g.name] ?? g.name,
      enabled: !disabledGroups[g.name]
    })),
    [boxplotGroups, plotGroupRenames, disabledGroups]
  );
  const displayBoxplotGroups = useMemo(
    () => allDisplayGroups.filter((g) => g.enabled).map((g) => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );
  const facetByCategories = useMemo(() => {
    if (facetByCol < 0) return [];
    return [...new Set(renamedRows.map((r) => r[facetByCol]))].sort();
  }, [facetByCol, renamedRows]);
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
        const g = r[groupColIdx], v = Number(r[valueColIdx]);
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
      const groups = effectiveOrder.filter((name) => gm[name] && !disabledGroups[name]).map((name, gi) => {
        const catMap = gm[name];
        const sources = cats.filter((c) => catMap[c]).map((c, si) => ({
          colIndex: si,
          values: catMap[c],
          category: c
        }));
        const allValues = sources.flatMap((s) => s.values);
        return {
          name,
          sources,
          allValues,
          stats: quartiles(allValues),
          color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length]
        };
      });
      return { category: cat, groups };
    });
  }, [facetByCol, facetByCategories, colorByCol, colorByCategories, renamedRows, groupColIdx, valueColIdx, effectiveOrder, boxplotColors, boxplotGroups, disabledGroups]);
  const toggleFilter = (ci, v) => setFilters((p) => {
    const f = { ...p }, s = new Set(f[ci].included);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    f[ci] = { ...f[ci], included: s };
    return f;
  });
  const toggleAllFilter = (ci, all) => setFilters((p) => {
    const f = { ...p };
    f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : /* @__PURE__ */ new Set() };
    return f;
  });
  const setRenameVal = (ci, ov, nv) => setValueRenames((p) => {
    const r = { ...p };
    if (!r[ci]) r[ci] = {};
    r[ci] = { ...r[ci], [ov]: nv };
    return r;
  });
  const updateRole = (i, role) => setColRoles((p) => p.map((r, j) => j === i ? role : r));
  const updateColName = (i, nm) => setColNames((p) => p.map((n, j) => j === i ? nm : n));
  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;
  const valueColIsNumeric = useMemo(() => {
    if (valueColIdx < 0 || !parsedRows.length) return false;
    const vals = parsedRows.map((r) => r[valueColIdx] ?? "").filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
  }, [parsedRows, valueColIdx]);
  const canPlot = groupColIdx >= 0 && valueColIdx >= 0 && valueColIsNumeric && boxplotGroups.length > 0;
  const handleToggleGroup = (i) => {
    const name = boxplotGroups[i].name;
    setDisabledGroups((p) => ({ ...p, [name]: !p[name] }));
  };
  const handleDownloadSvg = useCallback((e) => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) => downloadSvg(facetRefs.current[fd.category], `boxplot_${fd.category}.svg`));
    } else {
      downloadSvg(chartRef.current, "boxplot.svg");
    }
  }, [facetByCol, facetedData]);
  const handleDownloadPng = useCallback((e) => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) => downloadPng(facetRefs.current[fd.category], `boxplot_${fd.category}.png`));
    } else {
      downloadPng(chartRef.current, "boxplot.png");
    }
  }, [facetByCol, facetedData]);
  return /* @__PURE__ */ React.createElement("div", { style: { minHeight: "100vh", color: "#333", fontFamily: "monospace", padding: "24px 32px" } }, /* @__PURE__ */ React.createElement(
    PageHeader,
    {
      toolName: "boxplot",
      title: "Boxplot",
      subtitle: `Load \u2192 label columns \u2192 filter \u2192 plot & export${dataFormat === "wide" ? " \xB7 Wide format auto-detected" : ""}`
    }
  ), /* @__PURE__ */ React.createElement(
    StepNavBar,
    {
      steps: ["upload", "configure", "filter", "output", "plot"],
      currentStep: step,
      onStepChange: setStep,
      canNavigate: (s) => s === "upload" || parsedRows.length > 0
    }
  ), /* @__PURE__ */ React.createElement(CommaFixBanner, { commaFixed, commaFixCount }), /* @__PURE__ */ React.createElement(ParseErrorBanner, { error: parseError }), step === "upload" && /* @__PURE__ */ React.createElement(
    UploadStep,
    {
      sepOverride,
      onSepChange: setSepOverride,
      rawText,
      doParse,
      handleFileLoad,
      setStep
    }
  ), step === "configure" && parsedRows.length > 0 && /* @__PURE__ */ React.createElement(
    ConfigureStep,
    {
      fileName,
      parsedHeaders,
      parsedRows,
      hasHeader,
      colRoles,
      colNames,
      valueColIdx,
      valueColIsNumeric,
      onRoleChange: updateRole,
      onNameChange: updateColName,
      setStep
    }
  ), step === "filter" && parsedRows.length > 0 && /* @__PURE__ */ React.createElement(
    FilterStep,
    {
      parsedHeaders,
      parsedRows,
      colRoles,
      colNames,
      filters,
      filteredRows,
      renamedRows,
      activeColIdxs,
      valueRenames,
      groupColIdx,
      effectiveOrder,
      applyRename,
      toggleFilter,
      toggleAllFilter,
      setRenameVal,
      setGroupOrder,
      dragIdx,
      setDragIdx,
      canPlot,
      setStep
    }
  ), step === "output" && parsedRows.length > 0 && /* @__PURE__ */ React.createElement(
    OutputStep,
    {
      parsedRows,
      parsedHeaders,
      colRoles,
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
      setStep
    }
  ), step === "plot" && canPlot && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement(
    PlotControls,
    {
      dataFormat,
      setDataFormat,
      setStep,
      resetAll,
      allDisplayGroups,
      boxplotGroups,
      renamedRows,
      plotGroupRenames,
      setPlotGroupRenames,
      boxplotColors,
      setBoxplotColors,
      onToggleGroup: handleToggleGroup,
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
      onDownloadSvg: handleDownloadSvg,
      onDownloadPng: handleDownloadPng,
      chartRef,
      facetedData,
      facetRefs
    }
  ), /* @__PURE__ */ React.createElement(
    PlotArea,
    {
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
      boxplotColors
    }
  )), step === "plot" && !canPlot && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#fff8e8", borderColor: "#f0d060" } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#886600" } }, "\u26A0 Assign ", /* @__PURE__ */ React.createElement("strong", null, "group"), " + ", /* @__PURE__ */ React.createElement("strong", null, "value"), " columns and ensure filters keep data."), /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("configure"), style: { marginTop: 8, ...btnSecondary } }, "\u2190 Configure")));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
