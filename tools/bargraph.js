const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef, memo } = React;
function groupsFromLong(rows, groupColIdx, valueColIdx, categoryColIdx = -1) {
  const map = {};
  const order = [];
  rows.forEach((r) => {
    if (groupColIdx >= r.length || valueColIdx >= r.length) return;
    const name = r[groupColIdx] ?? "?";
    const raw = r[valueColIdx] ?? "";
    const v = Number(raw);
    if (raw === "" || isNaN(v)) return;
    if (!map[name]) {
      map[name] = { name, values: [], categories: [] };
      order.push(name);
    }
    map[name].values.push(v);
    if (categoryColIdx >= 0) map[name].categories.push(r[categoryColIdx]);
  });
  return order.map((name, gi) => {
    const g = map[name];
    const stats = computeStats(g.values);
    const src = { colIndex: 0, values: g.values };
    if (categoryColIdx >= 0) src.categories = g.categories;
    return { name, sources: [src], allValues: g.values, stats, color: PALETTE[gi % PALETTE.length] };
  });
}
function groupColumns(headers, columns) {
  const map = {};
  const order = [];
  headers.forEach((name, i) => {
    if (!map[name]) {
      map[name] = { name, sources: [] };
      order.push(name);
    }
    map[name].sources.push({ colIndex: i, values: columns[i] });
  });
  return order.map((name, gi) => {
    const g = map[name];
    const allValues = g.sources.flatMap((s) => s.values);
    const stats = computeStats(allValues);
    return {
      name: g.name,
      sources: g.sources,
      allValues,
      stats,
      color: PALETTE[gi % PALETTE.length]
    };
  });
}
const BarChart = forwardRef(function BarChart2({
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
  svgLegend
}, ref) {
  const angle = xLabelAngle || 0;
  const bottomMargin = 60 + Math.abs(angle) * 0.9;
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
  const yMax = yMaxProp != null ? yMaxProp : dataMax + pad;
  const n = groups.length;
  const vbW = Math.max(400, n * 100 + MChart.left + MChart.right);
  const vbH_chart = 420 + Math.abs(angle) * 0.9;
  const legendH = computeLegendHeight(svgLegend, vbW - MChart.left - MChart.right);
  const vbH = vbH_chart + legendH;
  const w = vbW - MChart.left - MChart.right;
  const h = vbH_chart - MChart.top - MChart.bottom;
  const bandW = w / n;
  const bx = (i) => MChart.left + i * bandW + bandW / 2;
  const sy = (v) => MChart.top + (1 - (v - yMin) / (yMax - yMin || 1)) * h;
  const yTicks = makeTicks(yMin, yMax, 8);
  const halfBar = barWidth / 100 * bandW * 0.4;
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${vbW} ${vbH}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": plotTitle || "Bar chart"
    },
    /* @__PURE__ */ React.createElement("title", null, plotTitle || "Bar chart"),
    /* @__PURE__ */ React.createElement("desc", null, `Bar chart with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`),
    /* @__PURE__ */ React.createElement("rect", { x: MChart.left, y: MChart.top, width: w, height: h, fill: plotBg }),
    showGrid && yTicks.map((t) => /* @__PURE__ */ React.createElement(
      "line",
      {
        key: t,
        x1: MChart.left,
        x2: MChart.left + w,
        y1: sy(t),
        y2: sy(t),
        stroke: gridColor,
        strokeWidth: "0.5"
      }
    )),
    yTicks.map((t) => /* @__PURE__ */ React.createElement("g", { key: t }, /* @__PURE__ */ React.createElement("line", { x1: MChart.left - 5, x2: MChart.left, y1: sy(t), y2: sy(t), stroke: "#333", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("text", { x: MChart.left - 8, y: sy(t) + 4, textAnchor: "end", fontSize: "11", fill: "#555", fontFamily: "sans-serif" }, Math.abs(t) < 0.01 && t !== 0 ? t.toExponential(1) : t % 1 === 0 ? t : t.toFixed(2)))),
    groups.map((g, gi) => {
      if (!g.stats) return null;
      const cx = bx(gi);
      const { mean, sd, sem } = g.stats;
      if (mean < yMin || mean > yMax) return null;
      const errVal = errorType === "sd" ? sd : sem;
      const baseline = sy(Math.max(0, yMin));
      const barTop = sy(mean);
      const yBar = mean >= 0 ? barTop : baseline;
      const barH = mean >= 0 ? baseline - barTop : sy(mean) - baseline;
      return /* @__PURE__ */ React.createElement("g", { key: g.name, role: "group", "aria-label": `${g.name}: mean ${mean.toFixed(2)}, ${errorType === "sd" ? "SD" : "SEM"} ${errVal.toFixed(2)}, n=${g.stats.n}` }, /* @__PURE__ */ React.createElement(
        "rect",
        {
          x: cx - halfBar,
          y: yBar,
          width: halfBar * 2,
          height: Math.max(0, barH),
          fill: g.color,
          fillOpacity: barOpacity,
          stroke: showBarOutline ? g.color : "none",
          strokeWidth: showBarOutline ? barOutlineWidth || 1.5 : 0,
          rx: "1"
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: cx,
          x2: cx,
          y1: sy(mean + errVal),
          y2: sy(mean - errVal),
          stroke: "#333",
          strokeWidth: errStrokeWidth || 1.2
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: cx - halfBar * 0.4,
          x2: cx + halfBar * 0.4,
          y1: sy(mean + errVal),
          y2: sy(mean + errVal),
          stroke: "#333",
          strokeWidth: errStrokeWidth || 1.2
        }
      ), /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: cx - halfBar * 0.4,
          x2: cx + halfBar * 0.4,
          y1: sy(mean - errVal),
          y2: sy(mean - errVal),
          stroke: "#333",
          strokeWidth: errStrokeWidth || 1.2
        }
      ), showPoints && g.sources.map((src, si) => {
        const rng = seededRandom(gi * 1e3 + si * 100 + 42);
        const ptColors = getPointColors(g.color, g.sources.length);
        return src.values.map((v, vi) => {
          const jitter = (rng() - 0.5) * jitterWidth * halfBar * 2;
          const cat = src.categories?.[vi];
          const ptColor = catColors && cat && catColors[cat] ? catColors[cat] : ptColors[si] || g.color;
          return /* @__PURE__ */ React.createElement(
            "circle",
            {
              key: `${g.name}-${si}-${vi}`,
              cx: cx + jitter,
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
      }));
    }),
    /* @__PURE__ */ React.createElement("rect", { x: MChart.left, y: MChart.top, width: w, height: h, fill: "none", stroke: "#333", strokeWidth: "1" }),
    groups.map((g, gi) => {
      const lx = bx(gi);
      const ly = MChart.top + h + 8;
      const angled = angle !== 0;
      const nLabel = `n=${g.stats?.n || 0}${g.sources.length > 1 ? ` (${g.sources.length} src)` : ""}`;
      return /* @__PURE__ */ React.createElement("g", { key: `xl-${g.name}`, transform: `translate(${lx},${ly}) rotate(${angle})` }, /* @__PURE__ */ React.createElement(
        "text",
        {
          x: 0,
          y: 0,
          textAnchor: angled ? "end" : "middle",
          dominantBaseline: angled ? "middle" : "hanging",
          fontSize: "11",
          fill: "#333",
          fontFamily: "sans-serif",
          fontWeight: "600"
        },
        g.name
      ), /* @__PURE__ */ React.createElement(
        "text",
        {
          x: 0,
          y: 14,
          textAnchor: angled ? "end" : "middle",
          dominantBaseline: angled ? "middle" : "hanging",
          fontSize: "9",
          fill: "#999",
          fontFamily: "sans-serif"
        },
        nLabel
      ));
    }),
    yLabel && /* @__PURE__ */ React.createElement(
      "text",
      {
        transform: `translate(14,${MChart.top + h / 2}) rotate(-90)`,
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
        x: MChart.left + w / 2,
        y: 14,
        textAnchor: "middle",
        fontSize: "15",
        fontWeight: "700",
        fill: "#222",
        fontFamily: "sans-serif"
      },
      plotTitle
    ),
    renderSvgLegend(svgLegend, vbH_chart + 10, MChart.left, vbW - MChart.left - MChart.right, 88, 14)
  );
});
function HowToSection() {
  return /* @__PURE__ */ React.createElement("div", { style: { marginTop: 24, borderRadius: 14, overflow: "hidden", border: "2px solid #648FFF", boxShadow: "0 4px 20px rgba(100,143,255,0.12)" } }, /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(135deg,#4a6cf7,#648FFF)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12 } }, toolIcon("bargraph", 24, { circle: true }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "#fff", fontWeight: 700, fontSize: 15 } }, "Bar Graph Viewer \u2014 How to use"), /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 } }, "Long or wide data \u2192 auto-detect \u2192 mean \xB1 SEM/SD bar charts"))), /* @__PURE__ */ React.createElement("div", { style: { background: "#eef2ff", padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Purpose"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, lineHeight: 1.75, color: "#444", margin: 0 } }, "Bar chart visualization with mean \xB1 SEM/SD error bars and optional jittered data points. Accepts ", /* @__PURE__ */ React.createElement("strong", null, "both long and wide formats"), ". Wide data goes straight to plot; long data gets the full configure \u2192 filter \u2192 output \u2192 plot pipeline.")), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#648FFF", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Long format"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#555", marginBottom: 8, lineHeight: 1.6 } }, "Each ", /* @__PURE__ */ React.createElement("strong", null, "row"), " = one observation. Mix of categorical and numeric columns."), /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("tbody", null, [["WT", "0.45"], ["WT", "0.52"], ["mutA", "0.12"], ["mutB", "0.31"]].map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#f0f4ff" : "#fff" } }, r.map((v, j) => /* @__PURE__ */ React.createElement("td", { key: j, style: { padding: "3px 8px", border: "1px solid #d0dbff", color: "#333" } }, v))))))), /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1.5px solid #b0c4ff" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: "#2EC4B6", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" } }, "Wide format \u2192 auto-detected!"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#555", marginBottom: 8, lineHeight: 1.6 } }, "One ", /* @__PURE__ */ React.createElement("strong", null, "column"), " per condition. All numeric. ", /* @__PURE__ */ React.createElement("strong", null, "Goes straight to plot.")), /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "#d1fae5" } }, ["WT", "mutA", "mutB"].map((h) => /* @__PURE__ */ React.createElement("th", { key: h, style: { padding: "3px 8px", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 700 } }, h)))), /* @__PURE__ */ React.createElement("tbody", null, [[0.45, 0.12, 0.31], [0.52, 0.08, 0.28], [0.48, 0.15, 0.35]].map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#f0fdf4" : "#fff" } }, r.map((v, j) => /* @__PURE__ */ React.createElement("td", { key: j, style: { padding: "3px 8px", border: "1px solid #bbf7d0", color: "#333" } }, v))))))), /* @__PURE__ */ React.createElement("div", { style: { borderLeft: "4px solid #648FFF", background: "#dbeafe", padding: "10px 14px", borderRadius: "0 8px 8px 0", gridColumn: "1/-1" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: "#3b6cf7" } }, "\u{1F4A1} Tip \u2014 "), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, "Duplicate column names in wide format are pooled as replicates. Points are colored by source column shade.")), /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" } }, ["Separator explicitly selected (comma, semicolon, tab, space)", "Quoted values stripped automatically", "100% browser-side \u2014 nothing uploaded"].map((t) => /* @__PURE__ */ React.createElement("span", { key: t, style: { fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "#fff", border: "1px solid #b0c4ff", color: "#555" } }, t)))));
}
function UploadStep({ sepOverride, setSepOverride, rawText, doParse, handleFileLoad }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    UploadPanel,
    {
      sepOverride,
      onSepChange: (v) => {
        setSepOverride(v);
        if (rawText) {
          doParse(rawText, v);
        }
      },
      onFileLoad: handleFileLoad,
      hint: "CSV \xB7 TSV \xB7 TXT \xB7 DAT \u2014 one column per condition, values in rows"
    }
  ), /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 12px", fontSize: 11, color: "#aaa", textAlign: "right" } }, "\u26A0 Max file size: 2 MB"), /* @__PURE__ */ React.createElement(HowToSection, null));
}
function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  hasHeader,
  colRoles,
  colNames,
  updateRole,
  updateColName,
  valueColIdx,
  valueColIsNumeric,
  setStep
}) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 4px", fontSize: 13, color: "#666" } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, fileName), " \u2014 ", parsedHeaders.length, " cols \xD7 ", parsedRows.length, " rows", hasHeader ? "" : " (no header)"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#999", marginBottom: 10 } }, "Preview (first 8 rows):"), /* @__PURE__ */ React.createElement(DataPreview, { headers: parsedHeaders, rows: parsedRows, maxRows: 8 })), /* @__PURE__ */ React.createElement(
    ColumnRoleEditor,
    {
      headers: parsedHeaders,
      rows: parsedRows,
      colRoles,
      colNames,
      onRoleChange: updateRole,
      onNameChange: updateColName
    }
  ), valueColIdx >= 0 && !valueColIsNumeric && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#fef2f2", borderColor: "#fca5a5", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#dc2626" } }, "\u26A0 Column ", /* @__PURE__ */ React.createElement("strong", null, '"', colNames[valueColIdx], '"'), " is assigned as ", /* @__PURE__ */ React.createElement("strong", null, "value"), " but appears to be non-numeric \u2014 the plot will be empty. Please assign a numeric column as value.")), /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("filter"), style: btnPrimary }, "Filter & Rename \u2192"));
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
}) {
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
function OutputStep({
  groupColIdx,
  valueColIdx,
  colNames,
  longStats,
  activeColIdxs,
  renamedRows,
  fileName,
  wideData,
  valueColIsNumeric,
  canPlot,
  setStep
}) {
  return /* @__PURE__ */ React.createElement("div", null, groupColIdx >= 0 && valueColIdx >= 0 && longStats.length > 0 && /* @__PURE__ */ React.createElement(StatsTable, { stats: longStats, groupLabel: colNames[groupColIdx] }), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#555" } }, "Filtered data (long)"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
    downloadCsv(
      activeColIdxs.map((i) => colNames[i]),
      renamedRows.map((r) => activeColIdxs.map((i) => r[i])),
      `sanitized_long_${fileName.replace(/\.[^.]+$/, "")}.csv`
    );
    flashSaved(e.currentTarget);
  }, style: btnDownload }, "\u2B07 Long CSV")), /* @__PURE__ */ React.createElement(DataPreview, { headers: activeColIdxs.map((i) => colNames[i]), rows: renamedRows.map((r) => activeColIdxs.map((i) => r[i])), maxRows: 6 })), wideData && /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#555" } }, "Reshaped (wide)"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
    downloadCsv(
      wideData.headers,
      wideData.rows,
      `sanitized_wide_${fileName.replace(/\.[^.]+$/, "")}.csv`
    );
    flashSaved(e.currentTarget);
  }, style: { padding: "8px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#dcfce7", border: "1px solid #86efac", color: "#166534", fontFamily: "inherit", fontWeight: 600 } }, "\u2B07 Wide CSV")), /* @__PURE__ */ React.createElement(DataPreview, { headers: wideData.headers, rows: wideData.rows, maxRows: 8 })), valueColIdx >= 0 && !valueColIsNumeric && /* @__PURE__ */ React.createElement("div", { style: { ...sec, background: "#fef2f2", borderColor: "#fca5a5" } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#dc2626" } }, "\u26A0 Column ", /* @__PURE__ */ React.createElement("strong", null, '"', colNames[valueColIdx], '"'), " is assigned as ", /* @__PURE__ */ React.createElement("strong", null, "value"), " but appears to be non-numeric \u2014 the plot will be empty. Go back to Configure and assign a numeric column as value.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("filter"), style: btnSecondary }, "\u2190 Filter"), canPlot && /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("plot"), style: btnPlot }, "Plot \u2192")));
}
function PlotControls({
  dataFormat,
  fileName,
  effectiveGroups,
  allDisplayGroups,
  displayGroups,
  handleColorChange,
  plotGroupRenames,
  setPlotGroupRenames,
  onToggleGroup,
  vis,
  updVis,
  colorByCol,
  setColorByCol,
  categoryColors,
  setCategoryColors,
  colorByCategories,
  renamedRows,
  colNames,
  facetByCandidates,
  facetByCol,
  setFacetByCol,
  resetAll,
  chartRef,
  facetRefs,
  facetedData
}) {
  const sv = (k) => (v) => updVis({ [k]: v });
  const handleGroupNameChange = (i, newName) => {
    const origName = effectiveGroups[i].name;
    setPlotGroupRenames((p) => ({ ...p, [origName]: newName }));
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
  const handleDownloadSvg = () => {
    if (facetByCol >= 0 && dataFormat === "long" && facetedData.length > 0) {
      facetedData.forEach((fd) => downloadSvg(facetRefs.current[fd.category], `bargraph_${fd.category}.svg`));
    } else {
      downloadSvg(chartRef.current, "bargraph.svg");
    }
  };
  const handleDownloadPng = () => {
    if (facetByCol >= 0 && dataFormat === "long" && facetedData.length > 0) {
      facetedData.forEach((fd) => downloadPng(facetRefs.current[fd.category], `bargraph_${fd.category}.png`));
    } else {
      downloadPng(chartRef.current, "bargraph.png");
    }
  };
  return /* @__PURE__ */ React.createElement("div", { style: { width: 328, flexShrink: 0, position: "sticky", top: 24, maxHeight: "calc(100vh - 90px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 } }, dataFormat === "wide" && /* @__PURE__ */ React.createElement("div", { style: { background: "#ecfdf5", borderRadius: 8, border: "1px solid #6ee7b7", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16 } }, "\u26A1"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 11, color: "#065f46", fontWeight: 600 } }, "Wide format auto-detected"), /* @__PURE__ */ React.createElement("p", { style: { margin: "2px 0 0", fontSize: 10, color: "#047857" } }, "Duplicate headers pooled as replicates."))), /* @__PURE__ */ React.createElement(
    ActionsPanel,
    {
      onDownloadSvg: handleDownloadSvg,
      onDownloadPng: handleDownloadPng,
      onReset: resetAll
    }
  ), /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Conditions"), /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 6px", fontSize: 11, color: "#888" } }, allDisplayGroups.filter((g) => g.enabled).length, " of ", allDisplayGroups.length, " selected \xB7 ", renamedRows.length, " obs"), /* @__PURE__ */ React.createElement(
    GroupColorEditor,
    {
      groups: allDisplayGroups,
      onColorChange: handleColorChange,
      onNameChange: handleGroupNameChange,
      onToggle: onToggleGroup
    }
  ), effectiveGroups.some((g) => g.sources.length > 1) && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: "8px 10px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 6, display: "flex", alignItems: "flex-start", gap: 7 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, flexShrink: 0 } }, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 11, fontWeight: 600, color: "#92400e" } }, "Duplicate column headers detected"), /* @__PURE__ */ React.createElement("p", { style: { margin: "2px 0 0", fontSize: 10, color: "#b45309" } }, "Values from duplicate columns have been pooled as replicates. Jitter points are shaded by source column.")))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React.createElement(
    BaseStyleControls,
    {
      plotBg: vis.plotBg,
      onPlotBgChange: sv("plotBg"),
      showGrid: vis.showGrid,
      onShowGridChange: sv("showGrid"),
      gridColor: vis.gridColor,
      onGridColorChange: sv("gridColor")
    }
  ), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Error bars"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: vis.errorType,
      onChange: (e) => updVis({ errorType: e.target.value }),
      style: {
        width: "100%",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: 4,
        padding: "4px 8px",
        fontSize: 12,
        fontFamily: "inherit",
        color: "#333",
        cursor: "pointer",
        marginTop: 2
      }
    },
    /* @__PURE__ */ React.createElement("option", { value: "sem" }, "SEM"),
    /* @__PURE__ */ React.createElement("option", { value: "sd" }, "SD")
  )), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Error bar stroke",
      value: vis.errStrokeWidth,
      displayValue: vis.errStrokeWidth.toFixed(1),
      min: 0.5,
      max: 4,
      step: 0.1,
      onChange: sv("errStrokeWidth")
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Bar outline"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: vis.showBarOutline,
      onChange: (e) => updVis({ showBarOutline: e.target.checked }),
      style: { accentColor: "#648FFF" }
    }
  )), vis.showBarOutline && /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Outline stroke",
      value: vis.barOutlineWidth,
      displayValue: vis.barOutlineWidth.toFixed(1),
      min: 0.5,
      max: 5,
      step: 0.5,
      onChange: sv("barOutlineWidth")
    }
  ), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Bar width",
      value: vis.barWidth,
      displayValue: `${vis.barWidth}%`,
      min: 20,
      max: 100,
      step: 5,
      onChange: sv("barWidth")
    }
  ), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Bar opacity",
      value: vis.barOpacity,
      displayValue: vis.barOpacity.toFixed(2),
      min: 0.05,
      max: 1,
      step: 0.05,
      onChange: sv("barOpacity")
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Points"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: vis.showPoints,
      onChange: (e) => updVis({ showPoints: e.target.checked }),
      style: { accentColor: "#648FFF" }
    }
  )), vis.showPoints && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Point size",
      value: vis.pointSize,
      displayValue: vis.pointSize,
      min: 1,
      max: 6,
      step: 0.5,
      onChange: sv("pointSize")
    }
  ), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Jitter",
      value: vis.jitterWidth,
      displayValue: vis.jitterWidth.toFixed(2),
      min: 0,
      max: 1,
      step: 0.05,
      onChange: sv("jitterWidth")
    }
  ), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "Point opacity",
      value: vis.pointOpacity,
      displayValue: vis.pointOpacity.toFixed(2),
      min: 0.1,
      max: 1,
      step: 0.05,
      onChange: sv("pointOpacity")
    }
  ), dataFormat === "long" && facetByCandidates.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Color by"), /* @__PURE__ */ React.createElement("select", { value: colorByCol, onChange: handleColorByChange, style: { width: "100%", ...inp, cursor: "pointer", fontSize: 11, marginTop: 2 } }, /* @__PURE__ */ React.createElement("option", { value: -1 }, "\u2014 none \u2014"), facetByCandidates.map((ci) => /* @__PURE__ */ React.createElement("option", { key: ci, value: ci }, colNames[ci])))), colorByCol >= 0 && colorByCategories.map((cat) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 } }, /* @__PURE__ */ React.createElement(ColorInput, { value: categoryColors[cat] || "#999999", onChange: (c) => setCategoryColors((p) => ({ ...p, [cat]: c })), size: 16 }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "#555" } }, cat))))), /* @__PURE__ */ React.createElement(
    SliderControl,
    {
      label: "X label angle",
      value: vis.xLabelAngle,
      displayValue: `${vis.xLabelAngle}\xB0`,
      min: -90,
      max: 0,
      step: 5,
      onChange: sv("xLabelAngle")
    }
  ), dataFormat === "long" && facetByCandidates.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Facet by"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: facetByCol,
      onChange: (e) => setFacetByCol(Number(e.target.value)),
      style: { width: "100%", ...inp, cursor: "pointer", fontSize: 11, marginTop: 2 }
    },
    /* @__PURE__ */ React.createElement("option", { value: -1 }, "\u2014 none \u2014"),
    facetByCandidates.map((ci) => /* @__PURE__ */ React.createElement("option", { key: ci, value: ci }, colNames[ci]))
  ))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Title"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: vis.plotTitle,
      onChange: (e) => updVis({ plotTitle: e.target.value }),
      style: { ...inp, width: "100%", marginTop: 2 }
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y label"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: vis.yLabel,
      onChange: (e) => updVis({ yLabel: e.target.value }),
      style: { ...inp, width: "100%", marginTop: 2 }
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y min (auto if empty)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: vis.yMinCustom,
      onChange: (e) => updVis({ yMinCustom: e.target.value }),
      style: { ...inp, width: "100%", marginTop: 2 },
      placeholder: "auto"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Y max (auto if empty)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      value: vis.yMaxCustom,
      onChange: (e) => updVis({ yMaxCustom: e.target.value }),
      style: { ...inp, width: "100%", marginTop: 2 },
      placeholder: "auto"
    }
  ))));
}
const FacetBarItem = memo(function FacetBarItem2({ fd, facetRefs, chartProps }) {
  const localRef = useRef();
  useEffect(() => {
    facetRefs.current[fd.category] = localRef.current;
    return () => {
      delete facetRefs.current[fd.category];
    };
  }, [fd.category, facetRefs]);
  return /* @__PURE__ */ React.createElement("div", { style: { background: "#fff", borderRadius: 8, padding: 12, border: "1px solid #ddd" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 10, height: 10, borderRadius: "50%", background: "#648FFF" } }), /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#333" } }, fd.category), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#999" } }, "(", fd.groups.reduce((a, g) => a + g.allValues.length, 0), " pts)")), /* @__PURE__ */ React.createElement(BarChart, { ref: localRef, ...chartProps }));
});
function ChartArea({
  dataFormat,
  facetByCol,
  facetedData,
  displayGroups,
  plotGroupRenames,
  plotGroupColors,
  colorByCol,
  colorByCategories,
  categoryColors,
  colNames,
  vis,
  yMinVal,
  yMaxVal,
  chartRef,
  facetRefs
}) {
  const svgLegend = colorByCol >= 0 && colorByCategories.length > 0 ? [{
    title: `Points colored by: ${colNames[colorByCol]}`,
    items: colorByCategories.map((c) => ({ label: c, color: categoryColors[c] || "#999", shape: "dot" }))
  }] : null;
  const vp = { ...vis, yMin: yMinVal, yMax: yMaxVal, catColors: colorByCol >= 0 ? categoryColors : null, svgLegend };
  if (displayGroups.length === 0 && (facetByCol < 0 || dataFormat !== "long" || facetedData.length === 0)) {
    return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 20, background: "#fff" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "60px 20px", textAlign: "center", color: "#999", fontSize: 14 } }, "No conditions selected. Enable at least one to display the plot.")));
  }
  return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, colorByCol >= 0 && colorByCategories.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12, background: "#f8f8fa", borderRadius: 8, padding: "8px 14px", border: "1px solid #ddd", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#777" } }, "Points colored by: ", colNames[colorByCol]), colorByCategories.map((cat) => /* @__PURE__ */ React.createElement("div", { key: cat, style: { display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 10, height: 10, borderRadius: "50%", background: categoryColors[cat] || "#999" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#444" } }, cat)))), (facetByCol < 0 || dataFormat !== "long") && /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 20, background: "#fff" } }, /* @__PURE__ */ React.createElement(
    BarChart,
    {
      ref: chartRef,
      groups: displayGroups,
      yLabel: vis.yLabel,
      plotTitle: vis.plotTitle,
      plotBg: vis.plotBg,
      showGrid: vis.showGrid,
      gridColor: vis.gridColor,
      barWidth: vis.barWidth,
      barOpacity: vis.barOpacity,
      pointSize: vis.pointSize,
      showPoints: vis.showPoints,
      jitterWidth: vis.jitterWidth,
      pointOpacity: vis.pointOpacity,
      xLabelAngle: vis.xLabelAngle,
      errorType: vis.errorType,
      yMin: yMinVal,
      yMax: yMaxVal,
      catColors: vp.catColors,
      errStrokeWidth: vis.errStrokeWidth,
      showBarOutline: vis.showBarOutline,
      barOutlineWidth: vis.barOutlineWidth,
      svgLegend
    }
  )), facetByCol >= 0 && dataFormat === "long" && facetedData.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 } }, facetedData.map((fd) => {
    const displayFdGroups = fd.groups.map((g) => ({ ...g, name: plotGroupRenames[g.name] ?? g.name, color: plotGroupColors[g.name] ?? g.color }));
    return /* @__PURE__ */ React.createElement(
      FacetBarItem,
      {
        key: fd.category,
        fd,
        facetRefs,
        chartProps: {
          groups: displayFdGroups,
          yLabel: vis.yLabel,
          plotTitle: [vis.plotTitle, fd.category].filter(Boolean).join(" \u2014 "),
          plotBg: vis.plotBg,
          showGrid: vis.showGrid,
          gridColor: vis.gridColor,
          barWidth: vis.barWidth,
          barOpacity: vis.barOpacity,
          pointSize: vis.pointSize,
          showPoints: vis.showPoints,
          jitterWidth: vis.jitterWidth,
          pointOpacity: vis.pointOpacity,
          xLabelAngle: vis.xLabelAngle,
          errorType: vis.errorType,
          yMin: yMinVal,
          yMax: yMaxVal,
          catColors: vp.catColors,
          errStrokeWidth: vis.errStrokeWidth,
          showBarOutline: vis.showBarOutline,
          barOutlineWidth: vis.barOutlineWidth,
          svgLegend
        }
      }
    );
  })));
}
function App() {
  const [rawText, setRawText] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState(null);
  const [dataFormat, setDataFormat] = useState("wide");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [sepOverride, setSepOverride] = useState("");
  const [groups, setGroups] = useState([]);
  const [plotGroupRenames, setPlotGroupRenames] = useState({});
  const [disabledGroups, setDisabledGroups] = useState({});
  const [plotGroupColors, setPlotGroupColors] = useState({});
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [colRoles, setColRoles] = useState([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});
  const [groupOrder, setGroupOrder] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const visInit = { plotTitle: "", yLabel: "Value", plotBg: "#ffffff", showGrid: true, gridColor: "#e0e0e0", barWidth: 70, barOpacity: 0.25, pointSize: 2.5, showPoints: true, jitterWidth: 0.6, pointOpacity: 0.6, xLabelAngle: 0, errorType: "sem", errStrokeWidth: 1.2, showBarOutline: false, barOutlineWidth: 1.5, yMinCustom: "", yMaxCustom: "" };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);
  const [colorByCol, setColorByCol] = useState(-1);
  const [categoryColors, setCategoryColors] = useState({});
  const [step, setStep] = useState("upload");
  const [facetByCol, setFacetByCol] = useState(-1);
  const chartRef = useRef();
  const facetRefs = useRef({});
  const applyRename = (ci, v) => valueRenames[ci] && valueRenames[ci][v] != null ? valueRenames[ci][v] : v;
  const filteredRows = useMemo(() => parsedRows.filter((r) => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))), [parsedRows, filters]);
  const renamedRows = useMemo(() => filteredRows.map((r) => r.map((v, ci) => applyRename(ci, v))), [filteredRows, valueRenames]);
  const activeColIdxs = useMemo(() => colRoles.reduce((acc, r, i) => {
    if (r !== "ignore") acc.push(i);
    return acc;
  }, []), [colRoles]);
  const groupColIdx = colRoles.indexOf("group"), valueColIdx = colRoles.indexOf("value");
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
  const longGroups = useMemo(() => {
    if (dataFormat !== "long" || groupColIdx < 0 || valueColIdx < 0) return [];
    const raw = groupsFromLong(renamedRows, groupColIdx, valueColIdx, colorByCol);
    return effectiveOrder.map((n) => raw.find((g) => g.name === n)).filter(Boolean);
  }, [dataFormat, renamedRows, groupColIdx, valueColIdx, effectiveOrder, colorByCol]);
  const effectiveGroups = dataFormat === "wide" ? groups : longGroups;
  const allDisplayGroups = useMemo(
    () => effectiveGroups.map((g) => ({
      ...g,
      displayName: plotGroupRenames[g.name] ?? g.name,
      color: plotGroupColors[g.name] ?? g.color,
      enabled: !disabledGroups[g.name]
    })),
    [effectiveGroups, plotGroupRenames, plotGroupColors, disabledGroups]
  );
  const displayGroups = useMemo(
    () => allDisplayGroups.filter((g) => g.enabled).map((g) => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );
  const longStats = useMemo(() => {
    if (dataFormat !== "long" || groupColIdx < 0 || valueColIdx < 0) return [];
    const gd = {};
    renamedRows.forEach((r) => {
      const k = r[groupColIdx];
      if (!gd[k]) gd[k] = [];
      gd[k].push(r[valueColIdx]);
    });
    return Object.entries(gd).map(([name, vals]) => {
      const nums = vals.filter((v) => isNumericValue(v)).map(Number);
      const stats = computeStats(nums);
      if (!stats) return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
      return { name, ...stats };
    });
  }, [dataFormat, renamedRows, groupColIdx, valueColIdx]);
  const facetByCandidates = useMemo(() => parsedHeaders.map((_, i) => i).filter(
    (i) => i !== groupColIdx && i !== valueColIdx && (colRoles[i] === "filter" || colRoles[i] === "group" || colRoles[i] === "text")
  ), [parsedHeaders, groupColIdx, valueColIdx, colRoles]);
  const facetByCategories = useMemo(() => {
    if (facetByCol < 0) return [];
    return [...new Set(renamedRows.map((r) => r[facetByCol]))].sort();
  }, [facetByCol, renamedRows]);
  const colorByCategories = useMemo(() => {
    if (colorByCol < 0) return [];
    return [...new Set(renamedRows.map((r) => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);
  const facetedData = useMemo(() => {
    if (facetByCol < 0 || groupColIdx < 0 || valueColIdx < 0) return [];
    const globalColorMap = {};
    longGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    return facetByCategories.map((cat) => {
      const catRows = renamedRows.filter((r) => r[facetByCol] === cat);
      const rawMap = {};
      groupsFromLong(catRows, groupColIdx, valueColIdx, colorByCol).forEach((g) => {
        rawMap[g.name] = { ...g, color: globalColorMap[g.name] || g.color };
      });
      const groups2 = effectiveOrder.filter((n) => rawMap[n] && !disabledGroups[n]).map((n) => rawMap[n]);
      return { category: cat, groups: groups2 };
    });
  }, [facetByCol, facetByCategories, renamedRows, groupColIdx, valueColIdx, effectiveOrder, colorByCol, longGroups, disabledGroups]);
  const wideData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return null;
    const g = {};
    renamedRows.forEach((r) => {
      const k = r[groupColIdx] || "?";
      if (!g[k]) g[k] = [];
      g[k].push(r[valueColIdx]);
    });
    const mx = Math.max(...Object.values(g).map((v) => v.length));
    const names = Object.keys(g);
    const w = [];
    for (let i = 0; i < mx; i++) w.push(names.map((n) => g[n][i] != null ? g[n][i] : ""));
    return { headers: names, rows: w };
  }, [renamedRows, groupColIdx, valueColIdx]);
  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    const fixedText = dc.text;
    setRawText(fixedText);
    const { headers, rows, hasHeader: hh } = parseRaw(fixedText, sep);
    if (!headers.length || !rows.length) {
      setParseError("The file appears to be empty or has no data rows. Please check your file and try again.");
      return;
    }
    setParseError(null);
    const isWide = detectWideFormat(headers, rows);
    if (isWide) {
      const pd = parseData(fixedText, sep);
      const columns = dataToColumns(pd.data, pd.headers.length);
      const wh = pd.headers;
      setGroups(groupColumns(wh, columns));
      setPlotGroupRenames({});
      setPlotGroupColors({});
      setDisabledGroups({});
      setDataFormat("wide");
      setFacetByCol(-1);
      setColorByCol(-1);
      setCategoryColors({});
      updVis({ yMinCustom: "", yMaxCustom: "" });
      setStep("plot");
    } else {
      setParsedHeaders(headers);
      setParsedRows(rows);
      setHasHeader(hh);
      setColRoles(headers.map((_, i) => guessColumnType(rows.map((r) => r[i] ?? ""))));
      setColNames([...headers]);
      const f = {};
      headers.forEach((_, i) => {
        const u = [...new Set(rows.map((r) => r[i]))].sort();
        f[i] = { unique: u, included: new Set(u) };
      });
      setFilters(f);
      setValueRenames({});
      setPlotGroupRenames({});
      setPlotGroupColors({});
      setDisabledGroups({});
      setGroupOrder([]);
      setFacetByCol(-1);
      setColorByCol(-1);
      setCategoryColors({});
      updVis({ yMinCustom: "", yMaxCustom: "" });
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
    setGroups([]);
    setParsedRows([]);
    setParsedHeaders([]);
    setFileName("");
    setStep("upload");
  };
  const handleColorChange = (i, color) => {
    if (dataFormat === "wide") {
      setGroups((prev) => prev.map((g, j) => j === i ? { ...g, color } : g));
    } else {
      const groupName = effectiveGroups[i]?.name;
      if (groupName) setPlotGroupColors((p) => ({ ...p, [groupName]: color }));
    }
  };
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
  const canPlot = effectiveGroups.length > 0;
  const handleToggleGroup = (i) => {
    const name = effectiveGroups[i].name;
    setDisabledGroups((p) => ({ ...p, [name]: !p[name] }));
  };
  const allSteps = dataFormat === "long" ? ["upload", "configure", "filter", "output", "plot"] : ["upload", "plot"];
  return /* @__PURE__ */ React.createElement("div", { style: {
    minHeight: "100vh",
    color: "#333",
    fontFamily: "monospace",
    padding: "24px 32px"
  } }, /* @__PURE__ */ React.createElement(
    PageHeader,
    {
      toolName: "bargraph",
      title: "Bar Graph Viewer",
      subtitle: "Load a data file \u2014 bars show mean \xB1 SEM/SD, with optional individual data points overlay"
    }
  ), /* @__PURE__ */ React.createElement(
    StepNavBar,
    {
      steps: allSteps,
      currentStep: step,
      onStepChange: setStep,
      canNavigate: (s) => s === "upload" || parsedRows.length > 0 || groups.length > 0
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
  ), step === "configure" && dataFormat === "long" && parsedRows.length > 0 && /* @__PURE__ */ React.createElement(
    ConfigureStep,
    {
      fileName,
      parsedHeaders,
      parsedRows,
      hasHeader,
      colRoles,
      colNames,
      updateRole,
      updateColName,
      valueColIdx,
      valueColIsNumeric,
      setStep
    }
  ), step === "filter" && dataFormat === "long" && parsedRows.length > 0 && /* @__PURE__ */ React.createElement(
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
  ), step === "output" && dataFormat === "long" && parsedRows.length > 0 && /* @__PURE__ */ React.createElement(
    OutputStep,
    {
      groupColIdx,
      valueColIdx,
      colNames,
      longStats,
      activeColIdxs,
      renamedRows,
      fileName,
      wideData,
      valueColIsNumeric,
      canPlot,
      setStep
    }
  ), step === "plot" && canPlot && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement(
    PlotControls,
    {
      dataFormat,
      fileName,
      effectiveGroups,
      allDisplayGroups,
      displayGroups,
      handleColorChange,
      plotGroupRenames,
      setPlotGroupRenames,
      onToggleGroup: handleToggleGroup,
      vis,
      updVis,
      colorByCol,
      setColorByCol,
      categoryColors,
      setCategoryColors,
      colorByCategories,
      renamedRows,
      colNames,
      facetByCandidates,
      facetByCol,
      setFacetByCol,
      resetAll,
      chartRef,
      facetRefs,
      facetedData
    }
  ), /* @__PURE__ */ React.createElement(
    ChartArea,
    {
      dataFormat,
      facetByCol,
      facetedData,
      displayGroups,
      plotGroupRenames,
      plotGroupColors,
      colorByCol,
      colorByCategories,
      categoryColors,
      colNames,
      vis,
      yMinVal,
      yMaxVal,
      chartRef,
      facetRefs
    }
  )));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
