// scatter.jsx — editable source. Run `npm run build` to compile to scatter.js
// Do NOT edit the .js file directly.

const { useState, useReducer, useMemo, useCallback, useEffect, useRef, forwardRef } = React;

  const COLOR_PALETTES = {
  viridis: ["#440154","#3b528b","#21908c","#5dc963","#fde725"],
  plasma:  ["#0d0887","#7e03a8","#cc4778","#f89540","#f0f921"],
  rdbu:    ["#b2182b","#ef8a62","#fddbc7","#f7f7f7","#d1e5f0","#67a9cf","#2166ac"],
  bwr:     ["#0000ff","#8888ff","#ffffff","#ff8888","#ff0000"],
  reds:    ["#fff5f0","#fcbba1","#fb6a4a","#cb181d","#67000d"],
  blues:   ["#f7fbff","#c6dbef","#6baed6","#2171b5","#08306b"],
  greens:  ["#f7fcf5","#c7e9c0","#74c476","#238b45","#00441b"],
  spectral: ["#9e0142","#f46d43","#fee08b","#e6f598","#66c2a5","#3288bd","#5e4fa2"],
  };


  function interpolateColor(stops, t) {
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length-1];
  const seg = (stops.length - 1) * t;
  const i = Math.floor(seg), f = seg - i;
  const [r1,g1,b1] = hexToRgb(stops[i]);
  const [r2,g2,b2] = hexToRgb(stops[i+1]);
  return rgbToHex(r1+(r2-r1)*f, g1+(g2-g1)*f, b1+(b2-b1)*f);
  }


  function fmtTick(t) {
  if (t === 0) return "0";
  const abs = Math.abs(t);
  if (abs >= 10000 || (abs < 0.01 && abs > 0)) return t.toExponential(1);
  if (abs >= 100) return t.toFixed(0);
  return parseFloat(t.toPrecision(3)).toString();
  }


  // Palette strip

  function PaletteStrip({ palette, width, height = 12 }) {
  const stops = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const n = 48;
  return (
    <div style={{ display: "flex", width: width || "100%", height, borderRadius: 3, overflow: "hidden", border: "1px solid #ddd" }}>
      {Array.from({length: n}, (_, i) => (
        <div key={i} style={{ flex: 1, background: interpolateColor(stops, i / (n - 1)) }} />
      ))}
    </div>
  );
  }

  // ── Shapes ──────────────────────────────────────────────────────────────────

  const SHAPES = ['circle', 'triangle', 'cross', 'square'];

  function renderPoint(shape, cx, cy, r, props) {
    const { fill, fillOpacity, stroke, strokeWidth, key } = props;
    switch (shape) {
      case 'triangle': {
        const bx = r * 0.866;
        const by = cy + r * 0.5;
        return <polygon key={key} points={`${cx},${cy-r} ${cx-bx},${by} ${cx+bx},${by}`}
          fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />;
      }
      case 'square': {
        const s = r * 1.4;
        return <rect key={key} x={cx-s/2} y={cy-s/2} width={s} height={s}
          fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />;
      }
      case 'cross': {
        const t = r * 0.35;
        return <path key={key}
          d={`M${cx-r},${cy-t}H${cx-t}V${cy-r}H${cx+t}V${cy-t}H${cx+r}V${cy+t}H${cx+t}V${cy+r}H${cx-t}V${cy+t}H${cx-r}Z`}
          fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />;
      }
      default:
        return <circle key={key} cx={cx} cy={cy} r={r}
          fill={fill} fillOpacity={fillOpacity} stroke={stroke} strokeWidth={strokeWidth} />;
    }
  }

  // Shape preview for HTML UI
  function ShapePreview({ shape, size = 16, color = "#666" }) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ display: "block", flexShrink: 0 }}>
        {renderPoint(shape, 8, 8, 6, { fill: color, fillOpacity: 1, stroke: "none", strokeWidth: 0 })}
      </svg>
    );
  }


  const MARGIN = { top: 28, right: 28, bottom: 56, left: 70 };
  const VBW = 800, VBH = 500;

  const ScatterChart = forwardRef(function ScatterChart({
  data, rawData, xCol, yCol,
  xMin, xMax, yMin, yMax, xLabel, yLabel, title,
  plotBg, showGrid, gridColor,
  refLines,
  pointColor, pointSize, pointOpacity, strokeColor, strokeWidth,
  colorMapCol, colorMapType, colorMapPalette, colorMapDiscrete, colorMapRange,
  sizeMapCol, sizeMapType, sizeMapMin, sizeMapMax, sizeMapDiscrete, sizeMapRange,
  shapeMapCol, shapeMapDiscrete,
  svgLegend,
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
  const sx = v => MARGIN.left + ((v - xMin) / xRange) * w;
  const sy = v => MARGIN.top + (1 - (v - yMin) / yRange) * h;
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
            const t = Math.max(0, Math.min(1, (num - cMin) / ((cMax - cMin) || 1)));
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
            const t = Math.max(0, Math.min(1, (num - sMin) / ((sMax - sMin) || 1)));
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
    <svg ref={ref} viewBox={`0 0 ${VBW} ${VBH + legendH}`} style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="sc-clip">
          <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} />
        </clipPath>
      </defs>

      <rect width={VBW} height={VBH} fill={plotBg || "#fff"} />
      <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} fill={plotBg || "#fff"} />

      {showGrid && yTicks.map(t => (
        <line key={t} x1={MARGIN.left} x2={MARGIN.left + w} y1={sy(t)} y2={sy(t)}
          stroke={gridColor || "#e0e0e0"} strokeWidth="0.5" />
      ))}
      {showGrid && xTicks.map(t => (
        <line key={t} x1={sx(t)} x2={sx(t)} y1={MARGIN.top} y2={MARGIN.top + h}
          stroke={gridColor || "#e0e0e0"} strokeWidth="0.5" />
      ))}

      {/* Reference lines (clipped) */}
      <g clipPath="url(#sc-clip)">
        {refLines.map(rl => {
          const isH = rl.dir === "h";
          const x1 = isH ? MARGIN.left     : sx(rl.value);
          const x2 = isH ? MARGIN.left + w : sx(rl.value);
          const y1 = isH ? sy(rl.value)    : MARGIN.top;
          const y2 = isH ? sy(rl.value)    : MARGIN.top + h;
          if ((isH && (rl.value < yMin || rl.value > yMax)) ||
              (!isH && (rl.value < xMin || rl.value > xMax))) return null;
          return (
            <line key={rl.id} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={rl.color || "#444"} strokeWidth={rl.strokeWidth || 1.5}
              strokeDasharray={rl.dashed ? (rl.dashArray || "7,4") : "none"} />
          );
        })}
      </g>

      {/* Reference line labels */}
      {refLines.map(rl => {
        if (!rl.label) return null;
        const isH = rl.dir === "h";
        if (isH) {
          if (rl.value < yMin || rl.value > yMax) return null;
          const lx = rl.labelSide === "left" ? MARGIN.left + 4 : MARGIN.left + w - 4;
          return <text key={`lbl-${rl.id}`} x={lx} y={sy(rl.value) - 4}
            textAnchor={rl.labelSide === "left" ? "start" : "end"} fontSize="10"
            fill={rl.color || "#444"} fontFamily="sans-serif" fontStyle="italic">{rl.label}</text>;
        } else {
          if (rl.value < xMin || rl.value > xMax) return null;
          const ly = rl.labelSide === "bottom" ? MARGIN.top + h - 4 : MARGIN.top + 12;
          return <text key={`lbl-${rl.id}`} x={sx(rl.value) + 4} y={ly}
            textAnchor="start" fontSize="10" fill={rl.color || "#444"}
            fontFamily="sans-serif" fontStyle="italic">{rl.label}</text>;
        }
      })}

      {/* Data points */}
      <g clipPath="url(#sc-clip)">
        {data.map((row, ri) => {
          const xVal = row[xCol], yVal = row[yCol];
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

      <rect x={MARGIN.left} y={MARGIN.top} width={w} height={h} fill="none" stroke="#333" strokeWidth="1" />

      {xTicks.map(t => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={MARGIN.top + h} y2={MARGIN.top + h + 5} stroke="#333" strokeWidth="1" />
          <text x={sx(t)} y={MARGIN.top + h + 18} textAnchor="middle" fontSize="11" fill="#555" fontFamily="sans-serif">{fmtTick(t)}</text>
        </g>
      ))}
      {yTicks.map(t => (
        <g key={t}>
          <line x1={MARGIN.left - 5} x2={MARGIN.left} y1={sy(t)} y2={sy(t)} stroke="#333" strokeWidth="1" />
          <text x={MARGIN.left - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#555" fontFamily="sans-serif">{fmtTick(t)}</text>
        </g>
      ))}

      {xLabel && <text x={MARGIN.left + w/2} y={VBH - 6} textAnchor="middle" fontSize="13" fill="#444" fontFamily="sans-serif">{xLabel}</text>}
      {yLabel && <text transform={`translate(14,${MARGIN.top + h/2}) rotate(-90)`} textAnchor="middle" fontSize="13" fill="#444" fontFamily="sans-serif">{yLabel}</text>}
      {title && <text x={VBW/2} y={16} textAnchor="middle" fontSize="15" fontWeight="700" fill="#222" fontFamily="sans-serif">{title}</text>}
      {renderSvgLegend(svgLegend, VBH + 10, MARGIN.left, VBW - MARGIN.left - MARGIN.right, legendItemWidth)}
    </svg>
  );
  });

  // Style constants
  const scInp = { width: 80, background: "#fff", border: "1px solid #ccc", borderRadius: 4, color: "#333", padding: "4px 8px", fontSize: 13, textAlign: "center" };
  const dlBtn = { padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", background: "#fff", border: "1px solid #ccc", color: "#555", fontFamily: "inherit" };
  const selSt = { background: "#fff", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, fontFamily: "inherit", color: "#333", cursor: "pointer" };

  // Aesthetic box themes
  const aesTheme = {
    color: { bg: "#eef2ff", border: "#b0c4ff", header: "#4f6bff", label: "Color" },
    size:  { bg: "#f0fdf4", border: "#86efac", header: "#16a34a", label: "Size" },
    shape: { bg: "#faf5ff", border: "#d8b4fe", header: "#9333ea", label: "Shape" },
  };

  function AesBox({ theme, children }) {
    const t = aesTheme[theme];
    return (
      <div style={{ borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.bg }}>
        <div style={{ background: t.header, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px" }}>{t.label}</span>
        </div>
        <div style={{ padding: "12px 14px", minHeight: 40 }}>
          {children}
        </div>
      </div>
    );
  }


  // ── Upload Step ────────────────────────────────────────────────────────────

  function UploadStep({ sepOverride, setSepOverride, rawText, doParse, handleFileLoad }) {
    return (
      <div>
        <UploadPanel
          sepOverride={sepOverride}
          onSepChange={v => { setSepOverride(v); if (rawText) doParse(rawText, v); }}
          onFileLoad={handleFileLoad}
          hint="CSV · TSV · TXT — one column per variable, one row per data point"
        />
        <p style={{margin:"4px 0 12px",fontSize:11,color:"#aaa",textAlign:"right"}}>Max file size: 2 MB</p>
        <div style={{marginTop:24,borderRadius:14,overflow:"hidden",border:"2px solid #648FFF",boxShadow:"0 4px 20px rgba(100,143,255,0.12)"}}>
          <div style={{background:"linear-gradient(135deg,#4a6cf7,#648FFF)",padding:"14px 24px",display:"flex",alignItems:"center",gap:12}}>
            {toolIcon("scatter", 24, {circle:true})}
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>Scatter Plot — How to use</div>
              <div style={{color:"rgba(255,255,255,0.75)",fontSize:11,marginTop:2}}>Upload → Pick X & Y → Map color, size, shape</div>
            </div>
          </div>
          <div style={{background:"#eef2ff",padding:"20px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

            <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff",gridColumn:"1/-1"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Data layout</div>
              <p style={{fontSize:12,lineHeight:1.75,color:"#444",margin:0}}>One <strong>row</strong> = one data point. One <strong>column</strong> = one variable. Any number of columns, any mix of numeric and text.</p>
            </div>

            <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:10,textTransform:"uppercase",letterSpacing:"1px"}}>X & Y selection</div>
              <p style={{fontSize:12,color:"#444",margin:0,lineHeight:1.6}}>After upload, pick any <strong>numeric</strong> column for <strong>X</strong> and <strong>Y</strong> via dropdowns. The plot updates instantly.</p>
            </div>

            <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:10,textTransform:"uppercase",letterSpacing:"1px"}}>Aesthetics</div>
              <p style={{fontSize:12,color:"#444",margin:0,lineHeight:1.6}}>Map any column to <strong>color</strong>, <strong>size</strong>, or <strong>shape</strong>. Numeric columns get continuous scales; categorical columns get discrete legends.</p>
            </div>

            <div style={{gridColumn:"1/-1",display:"flex",gap:6,flexWrap:"wrap"}}>
              {["X/Y dropdown selection","Color / size / shape mapping","Row filtering","8 gradient palettes","100% browser-side"].map(t=>(<span key={t} style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:"#fff",border:"1px solid #b0c4ff",color:"#555"}}>{t}</span>))}
            </div>
          </div>
        </div>
      </div>
    );
  }


  // ── Plot Step ──────────────────────────────────────────────────────────────

  function PlotStep({
    parsed, fileName, filteredData, filteredRawRows, activeColIdxs,
    xCol, setXCol, yCol, setYCol, numericCols,
    pointColor, setPointColor, pointSize, setPointSize,
    pointOpacity, setPointOpacity, strokeColor, setStrokeColor, strokeWidth, setStrokeWidth,
    colorMapCol, setColorMapCol, colorMapType, colorMapPalette, setColorMapPalette,
    colorMapDiscrete, setColorMapDiscrete, colorMapCategories, colorMapRange,
    sizeMapCol, setSizeMapCol, sizeMapType, sizeMapMin, setSizeMapMin,
    sizeMapMax, setSizeMapMax, sizeMapDiscrete, setSizeMapDiscrete,
    sizeMapCategories, sizeMapRange,
    shapeMapCol, setShapeMapCol, shapeMapCategories, shapeMapDiscrete, setShapeMapDiscrete, shapeWarning,
    vis, updVis, autoAxis, effAxis,
    refLines, addRefLine, updateRefLine, removeRefLine,
    filterState, setFilterState, filterableCols, uniqueVals,
    mappableCols,
    resetAll, svgRef, svgLegend,
  }) {
    const hasColorMap = colorMapCol != null;
    const hasSizeMap  = sizeMapCol  != null;
    const hasShapeMap = shapeMapCol != null;
    const [filtersOpen, setFiltersOpen] = useState(false);

    return (
      <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>

        {/* LEFT: controls panel */}
        <div style={{width:328,flexShrink:0,position:"sticky",top:24,maxHeight:"calc(100vh - 90px)",overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>

          {/* File info */}
          <div style={{...sec,padding:"10px 12px"}}>
            <div style={{fontSize:12,color:"#666",marginBottom:4}}>
              <strong style={{color:"#333"}}>{fileName}</strong>
              <span style={{color:"#999",marginLeft:6}}>{parsed.data.length} rows · {parsed.headers.length} cols</span>
            </div>
          </div>

          {/* Actions */}
          <ActionsPanel
            onDownloadSvg={() => downloadSvg(svgRef.current, `scatter_${fileName.replace(/\.[^.]+$/, "")}.svg`)}
            onDownloadPng={() => downloadPng(svgRef.current, `scatter_${fileName.replace(/\.[^.]+$/, "")}.png`)}
            onReset={resetAll}
            extraButtons={[
              {
                label: "Download CSV",
                onClick: (e) => { downloadCsv(activeColIdxs.map(i=>parsed.headers[i]), filteredRawRows.map(r=>activeColIdxs.map(i=>r[i])), `scatter_${fileName.replace(/\.[^.]+$/, "")}.csv`); flashSaved(e.currentTarget); },
                style: {padding:"8px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#dcfce7",border:"1px solid #86efac",color:"#166534",fontFamily:"inherit",width:"100%",fontWeight:600}
              }
            ]}
          />

          {/* X / Y selection */}
          <div style={sec}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" }}>Variables</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={lbl}>X axis</div>
                <select value={xCol} onChange={e => setXCol(parseInt(e.target.value))}
                  style={{...selSt, width: "100%"}}>
                  {numericCols.map(i => <option key={i} value={i}>{parsed.headers[i]}</option>)}
                </select>
              </div>
              <div>
                <div style={lbl}>Y axis</div>
                <select value={yCol} onChange={e => setYCol(parseInt(e.target.value))}
                  style={{...selSt, width: "100%"}}>
                  {numericCols.map(i => <option key={i} value={i}>{parsed.headers[i]}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Point defaults */}
          <div style={sec}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" }}>Point style</p>
            {!hasColorMap && (
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:11,color:"#777"}}>Color</span>
                <ColorInput value={pointColor} onChange={setPointColor} size={22} />
              </div>
            )}
            {!hasSizeMap && (
              <SliderControl label="Size" value={pointSize} min={1} max={20} step={0.5} onChange={setPointSize} />
            )}
            <SliderControl label="Opacity" value={pointOpacity} displayValue={pointOpacity.toFixed(2)}
              min={0.05} max={1} step={0.05} onChange={setPointOpacity} />
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
              <span style={{fontSize:11,color:"#777"}}>Stroke</span>
              <ColorInput value={strokeColor} onChange={setStrokeColor} size={20} />
            </div>
            <SliderControl label="Stroke width" value={strokeWidth} min={0} max={3} step={0.25} onChange={setStrokeWidth} />
          </div>

          {/* ── Color aesthetic ── */}
          <AesBox theme="color">
            <select
              value={colorMapCol == null ? "" : colorMapCol}
              onChange={e => setColorMapCol(e.target.value === "" ? null : parseInt(e.target.value))}
              style={{...selSt, width: "100%", marginBottom: hasColorMap ? 8 : 0}}>
              <option value="">— None —</option>
              {mappableCols.filter(i => i !== sizeMapCol && i !== shapeMapCol).map(i =>
                <option key={i} value={i}>{parsed.headers[i]}</option>
              )}
            </select>

            {hasColorMap && colorMapType && (<>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                Detected: <strong style={{ color: colorMapType === "continuous" ? "#7c3aed" : "#0369a1" }}>
                  {colorMapType === "continuous" ? "numeric (continuous)" : `categorical (${colorMapCategories.length} groups)`}
                </strong>
              </div>

              {colorMapType === "continuous" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <select value={colorMapPalette} onChange={e => setColorMapPalette(e.target.value)} style={{...selSt,width:"100%",fontSize:11}}>
                    {Object.keys(COLOR_PALETTES).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <PaletteStrip palette={colorMapPalette} />
                  <span style={{ fontSize: 10, color: "#aaa" }}>
                    range: {fmtTick(colorMapRange[0])} → {fmtTick(colorMapRange[1])}
                  </span>
                </div>
              )}

              {colorMapType === "discrete" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                  {colorMapCategories.map((cat, ci) => (
                    <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <ColorInput value={colorMapDiscrete[cat] || PALETTE[ci % PALETTE.length]}
                        onChange={v => setColorMapDiscrete(prev => ({ ...prev, [cat]: v }))} size={18} />
                      <span style={{ fontSize: 12, color: "#333" }}>{cat}</span>
                    </div>
                  ))}
                </div>
              )}
            </>)}
          </AesBox>

          {/* ── Size aesthetic ── */}
          <AesBox theme="size">
            <select
              value={sizeMapCol == null ? "" : sizeMapCol}
              onChange={e => setSizeMapCol(e.target.value === "" ? null : parseInt(e.target.value))}
              style={{...selSt, width: "100%", marginBottom: hasSizeMap ? 8 : 0}}>
              <option value="">— None —</option>
              {mappableCols.filter(i => i !== colorMapCol && i !== shapeMapCol).map(i =>
                <option key={i} value={i}>{parsed.headers[i]}</option>
              )}
            </select>

            {hasSizeMap && sizeMapType && (<>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                Detected: <strong style={{ color: sizeMapType === "continuous" ? "#7c3aed" : "#0369a1" }}>
                  {sizeMapType === "continuous" ? "numeric (continuous)" : `categorical (${sizeMapCategories.length} groups)`}
                </strong>
              </div>

              {sizeMapType === "continuous" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <SliderControl label="Min size" value={sizeMapMin} min={1} max={20} step={0.5} onChange={setSizeMapMin} />
                  <SliderControl label="Max size" value={sizeMapMax} min={1} max={30} step={0.5} onChange={setSizeMapMax} />
                  <span style={{ fontSize: 10, color: "#aaa" }}>
                    range: {fmtTick(sizeMapRange[0])} → {fmtTick(sizeMapRange[1])}
                  </span>
                </div>
              )}

              {sizeMapType === "discrete" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                  {sizeMapCategories.map(cat => {
                    const val = sizeMapDiscrete[cat] !== undefined ? sizeMapDiscrete[cat] : 5;
                    return (
                      <SliderControl key={cat} label={cat} value={val}
                        min={1} max={20} step={0.5}
                        onChange={v => setSizeMapDiscrete(prev => ({ ...prev, [cat]: v }))} />
                    );
                  })}
                </div>
              )}
            </>)}
          </AesBox>

          {/* ── Shape aesthetic ── */}
          <AesBox theme="shape">
            <select
              value={shapeMapCol == null ? "" : shapeMapCol}
              onChange={e => setShapeMapCol(e.target.value === "" ? null : parseInt(e.target.value))}
              style={{...selSt, width: "100%", marginBottom: hasShapeMap ? 8 : 0}}>
              <option value="">— None —</option>
              {mappableCols.filter(i => i !== colorMapCol && i !== sizeMapCol).map(i =>
                <option key={i} value={i}>{parsed.headers[i]}</option>
              )}
            </select>

            {hasShapeMap && (<>
              {shapeWarning && (
                <div style={{ padding: "6px 10px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fca5a5", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#dc2626" }}>{shapeWarning}</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                {shapeMapCategories.map((cat, ci) => (
                  <div key={cat} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      value={shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length]}
                      onChange={e => setShapeMapDiscrete(prev => ({ ...prev, [cat]: e.target.value }))}
                      style={{...selSt, fontSize: 11, width: 90}}>
                      {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ShapePreview shape={shapeMapDiscrete[cat] || SHAPES[ci % SHAPES.length]} color="#666" />
                    <span style={{ fontSize: 12, color: "#333" }}>{cat}</span>
                  </div>
                ))}
              </div>
            </>)}
          </AesBox>

          {/* Axes */}
          <div style={sec}>
            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" }}>Axes</p>
            <div style={{ display: "flex", flexDirection:"column", gap: 6 }}>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><div style={lbl}>X min</div><input type="text" inputMode="decimal" value={vis.xMin != null ? vis.xMin : ""} placeholder={"auto (" + fmtTick(autoAxis.xMin) + ")"} onChange={e => { const v = e.target.value.trim(); updVis({xMin: v === "" ? null : Number(v)}); }} style={{...scInp,width:"100%"}} /></div>
                <div style={{flex:1}}><div style={lbl}>X max</div><input type="text" inputMode="decimal" value={vis.xMax != null ? vis.xMax : ""} placeholder={"auto (" + fmtTick(autoAxis.xMax) + ")"} onChange={e => { const v = e.target.value.trim(); updVis({xMax: v === "" ? null : Number(v)}); }} style={{...scInp,width:"100%"}} /></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><div style={lbl}>Y min</div><input type="text" inputMode="decimal" value={vis.yMin != null ? vis.yMin : ""} placeholder={"auto (" + fmtTick(autoAxis.yMin) + ")"} onChange={e => { const v = e.target.value.trim(); updVis({yMin: v === "" ? null : Number(v)}); }} style={{...scInp,width:"100%"}} /></div>
                <div style={{flex:1}}><div style={lbl}>Y max</div><input type="text" inputMode="decimal" value={vis.yMax != null ? vis.yMax : ""} placeholder={"auto (" + fmtTick(autoAxis.yMax) + ")"} onChange={e => { const v = e.target.value.trim(); updVis({yMax: v === "" ? null : Number(v)}); }} style={{...scInp,width:"100%"}} /></div>
              </div>
              <div><div style={lbl}>X label</div><input value={vis.xLabel} onChange={e => updVis({xLabel:e.target.value})} style={{ ...scInp, width:"100%", textAlign: "left" }} /></div>
              <div><div style={lbl}>Y label</div><input value={vis.yLabel} onChange={e => updVis({yLabel:e.target.value})} style={{ ...scInp, width:"100%", textAlign: "left" }} /></div>
              <div><div style={lbl}>Title</div><input value={vis.plotTitle} onChange={e => updVis({plotTitle:e.target.value})} style={{ ...scInp, width:"100%", textAlign: "left" }} /></div>
            </div>
          </div>

          {/* Style */}
          <div style={{...sec,padding:12,display:"flex",flexDirection:"column",gap:8}}>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#555" }}>Style</p>
            <BaseStyleControls
              plotBg={vis.plotBg} onPlotBgChange={v => updVis({plotBg:v})}
              showGrid={vis.showGrid} onShowGridChange={v => updVis({showGrid:v})}
              gridColor={vis.gridColor} onGridColorChange={v => updVis({gridColor:v})}
            />
          </div>

          {/* Reference lines */}
          <div style={sec}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap:"wrap" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#555" }}>Ref lines</p>
              <button onClick={() => addRefLine("h")} style={{ ...dlBtn, fontSize: 11, padding: "4px 10px" }}>+ H</button>
              <button onClick={() => addRefLine("v")} style={{ ...dlBtn, fontSize: 11, padding: "4px 10px" }}>+ V</button>
            </div>
            {refLines.length === 0 && <p style={{ fontSize: 12, color: "#aaa" }}>No reference lines.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {refLines.map(rl => (
                <div key={rl.id} style={{ display: "flex", flexDirection:"column", gap: 6,
                  padding: "8px 10px", background: "#fafafa", borderRadius: 8, border: "1px solid #ddd" }}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                      background: rl.dir === "h" ? "#dbeafe" : "#fce7f3",
                      color: rl.dir === "h" ? "#1d4ed8" : "#9d174d" }}>
                      {rl.dir === "h" ? "Y =" : "X ="}
                    </span>
                    <input type="number" value={rl.value} step="any" onChange={e => updateRefLine(rl.id, "value", Number(e.target.value))}
                      style={{ ...scInp, flex:1 }} />
                    <button onClick={() => removeRefLine(rl.id)}
                      style={{ padding: "3px 9px", borderRadius: 5, fontSize: 12, cursor: "pointer",
                        background: "#fff", border: "1px solid #fca5a5", color: "#dc2626", fontFamily: "inherit" }}>✕</button>
                  </div>
                  <ColorInput value={rl.color} onChange={v => updateRefLine(rl.id, "color", v)} size={22} />
                  <SliderControl label="Width" value={rl.strokeWidth}
                    min={0.5} max={6} step={0.25}
                    onChange={v => updateRefLine(rl.id, "strokeWidth", v)} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#777" }}>Dashed</span>
                    <input type="checkbox" checked={rl.dashed} onChange={e => updateRefLine(rl.id, "dashed", e.target.checked)}
                      style={{ accentColor: "#648FFF" }} />
                  </div>
                  {rl.dashed && (
                    <select value={rl.dashArray} onChange={e => updateRefLine(rl.id, "dashArray", e.target.value)} style={{ ...selSt, fontSize: 11, width:"100%" }}>
                      <option value="7,4">— — —</option>
                      <option value="3,3">· · · ·</option>
                      <option value="12,4">—— ——</option>
                      <option value="10,4,2,4">— · — ·</option>
                      <option value="2,2">·· ··</option>
                    </select>
                  )}
                  <input value={rl.label} placeholder="label" onChange={e => updateRefLine(rl.id, "label", e.target.value)}
                    style={{ ...scInp, width:"100%", textAlign: "left" }} />
                  {rl.label && (
                    <select value={rl.labelSide} onChange={e => updateRefLine(rl.id, "labelSide", e.target.value)} style={{ ...selSt, fontSize: 11, width:"100%" }}>
                      {rl.dir === "h"
                        ? <><option value="right">right</option><option value="left">left</option></>
                        : <><option value="top">top</option><option value="bottom">bottom</option></>}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Filters (collapsible) */}
          {filterableCols.length > 0 && (
            <div style={sec}>
              <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                onClick={() => setFiltersOpen(!filtersOpen)}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#555" }}>
                  Filters {filtersOpen ? "▾" : "▸"}
                </p>
                <span style={{fontSize:10,color:"#aaa"}}>{filteredData.length} of {parsed.data.length} rows</span>
              </div>
              {filtersOpen && (
                <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:10,maxHeight:300,overflowY:"auto"}}>
                  {filterableCols.map(ci => {
                    const vals = uniqueVals(ci);
                    if (vals.length === 0 || vals.length > 30) return null;
                    const allowed = filterState[ci] || [];
                    const allChecked = allowed.length === 0;
                    return (
                      <div key={ci}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <span style={{fontSize:11,fontWeight:600,color:"#555"}}>{parsed.headers[ci]}</span>
                          <button onClick={() => setFilterState(prev => ({...prev,[ci]:[]}))}
                            style={{fontSize:10,padding:"1px 6px",borderRadius:4,cursor:"pointer",border:"1px solid #ccc",background:"#f5f5f5",color:"#666",fontFamily:"inherit"}}>
                            all
                          </button>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                          {vals.map(v => {
                            const checked = allChecked || allowed.includes(v);
                            return (
                              <label key={v} style={{display:"flex",alignItems:"center",gap:3,fontSize:11,padding:"2px 6px",borderRadius:4,background:checked?"#e0e7ff":"#f8f8f8",border:`1px solid ${checked?"#a5b4fc":"#e5e5e5"}`,cursor:"pointer",color:checked?"#3730a3":"#999"}}>
                                <input type="checkbox" checked={checked}
                                  onChange={e => {
                                    setFilterState(prev => {
                                      const curr = prev[ci] || [];
                                      if (curr.length === 0) {
                                        return {...prev, [ci]: vals.filter(x => x !== v)};
                                      } else if (e.target.checked) {
                                        const next = [...curr, v];
                                        return {...prev, [ci]: next.length === vals.length ? [] : next};
                                      } else {
                                        const next = curr.filter(x => x !== v);
                                        return {...prev, [ci]: next};
                                      }
                                    });
                                  }}
                                  style={{accentColor:"#648FFF",margin:0}} />
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

        </div>

        {/* RIGHT: chart area */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{ ...sec, padding: 20, background: "#fff" }}>
            <ScatterChart ref={svgRef}
              data={filteredData} rawData={filteredRawRows} xCol={xCol} yCol={yCol}
              xMin={effAxis.xMin} xMax={effAxis.xMax} yMin={effAxis.yMin} yMax={effAxis.yMax}
              xLabel={vis.xLabel} yLabel={vis.yLabel} title={vis.plotTitle}
              plotBg={vis.plotBg} showGrid={vis.showGrid} gridColor={vis.gridColor}
              refLines={refLines}
              pointColor={pointColor} pointSize={pointSize} pointOpacity={pointOpacity}
              strokeColor={strokeColor} strokeWidth={strokeWidth}
              colorMapCol={colorMapCol} colorMapType={colorMapType}
              colorMapPalette={colorMapPalette} colorMapDiscrete={colorMapDiscrete}
              colorMapRange={colorMapRange}
              sizeMapCol={sizeMapCol} sizeMapType={sizeMapType}
              sizeMapMin={sizeMapMin} sizeMapMax={sizeMapMax}
              sizeMapDiscrete={sizeMapDiscrete} sizeMapRange={sizeMapRange}
              shapeMapCol={shapeMapCol} shapeMapDiscrete={shapeMapDiscrete}
              svgLegend={svgLegend} />
          </div>
        </div>

      </div>
    );
  }


  // ── App ────────────────────────────────────────────────────────────────────

  let refLineCounter = 0;

  function App() {
  const [rawText, setRawText]   = useState(null);
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [sepOverride, setSepOverride] = useState("");
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState(null);
  const [step, setStep]         = useState("upload");

  // Column selection
  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState(1);

  // Point defaults
  const [pointColor, setPointColor]     = useState("#648FFF");
  const [pointSize, setPointSize]       = useState(5);
  const [pointOpacity, setPointOpacity] = useState(0.8);
  const [strokeColor, setStrokeColor]   = useState("#000000");
  const [strokeWidth, setStrokeWidth]   = useState(1);

  // Aesthetic mappings
  const [colorMapCol, setColorMapCol]       = useState(null);
  const [colorMapPalette, setColorMapPalette] = useState("viridis");
  const [colorMapDiscrete, setColorMapDiscrete] = useState({});

  const [sizeMapCol, setSizeMapCol]   = useState(null);
  const [sizeMapMin, setSizeMapMin]   = useState(3);
  const [sizeMapMax, setSizeMapMax]   = useState(15);
  const [sizeMapDiscrete, setSizeMapDiscrete] = useState({});

  const [shapeMapCol, setShapeMapCol] = useState(null);
  const [shapeMapDiscrete, setShapeMapDiscrete] = useState({});

  // Filter state
  const [filterState, setFilterState] = useState({});

  // Visual state
  const visInit={xMin:null,xMax:null,yMin:null,yMax:null,xLabel:"",yLabel:"",plotTitle:"",plotBg:"#ffffff",showGrid:true,gridColor:"#e0e0e0"};
  const [vis, updVis] = useReducer((s,a)=>a._reset?{...visInit}:{...s,...a}, visInit);

  const [refLines, setRefLines] = useState([]);
  const svgRef = useRef();
  const sepRef = useRef("");

  const parsed = useMemo(() => rawText ? parseData(rawText, sepRef.current) : null, [rawText]);

  // Numeric column detection
  const colIsNumeric = useMemo(() => {
    if (!parsed) return {};
    return parsed.headers.reduce((acc, _, i) => {
      const vals = parsed.rawData.map(r => r[i]).filter(v => v !== "" && v != null);
      acc[i] = vals.length > 0 && vals.filter(v => isNumericValue(v)).length / vals.length > 0.5;
      return acc;
    }, {});
  }, [parsed]);

  const numericCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce((acc, _, i) => colIsNumeric[i] ? [...acc, i] : acc, []);
  }, [parsed, colIsNumeric]);

  // All column indices (active = not X or Y)
  const activeColIdxs = useMemo(() => parsed ? parsed.headers.map((_, i) => i) : [], [parsed]);

  // Columns available for aesthetic mapping (everything except X and Y)
  const mappableCols = useMemo(() => {
    if (!parsed) return [];
    return parsed.headers.reduce((acc, _, i) => (i !== xCol && i !== yCol) ? [...acc, i] : acc, []);
  }, [parsed, xCol, yCol]);

  // Columns available for filtering (non-X, non-Y, non-aesthetic, categorical with ≤30 values)
  const filterableCols = useMemo(() => {
    if (!parsed) return [];
    return mappableCols.filter(i => {
      const vals = [...new Set(parsed.rawData.map(r => r[i]).filter(v => v != null && v !== ""))];
      return vals.length > 0 && vals.length <= 30;
    });
  }, [parsed, mappableCols]);

  // Apply filterState to rows
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

  const filteredData    = useMemo(() => filteredIndices.map(i => parsed.data[i]),    [parsed, filteredIndices]);
  const filteredRawRows = useMemo(() => filteredIndices.map(i => parsed.rawData[i]), [parsed, filteredIndices]);

  // Detect column type (numeric vs discrete)
  const detectColType = useCallback((colIdx) => {
    if (colIdx == null || !parsed) return null;
    const vals = parsed.rawData.map(r => r[colIdx]).filter(v => v != null && v !== "");
    return vals.every(v => isNumericValue(v)) ? "continuous" : "discrete";
  }, [parsed]);

  const colorMapType = useMemo(() => detectColType(colorMapCol), [colorMapCol, detectColType]);
  const sizeMapType  = useMemo(() => detectColType(sizeMapCol),  [sizeMapCol,  detectColType]);

  // Unique values (sorted)
  const uniqueVals = useCallback((colIdx) => {
    if (colIdx == null || !parsed) return [];
    const vals = [...new Set(parsed.rawData.map(r => r[colIdx]).filter(v => v != null && v !== ""))];
    const allNum = vals.every(v => isNumericValue(v));
    return allNum
      ? vals.sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", ".")))
      : vals.sort();
  }, [parsed]);

  const colorMapCategories = useMemo(() => colorMapType === "discrete" ? uniqueVals(colorMapCol) : [], [colorMapCol, colorMapType, uniqueVals]);
  const sizeMapCategories  = useMemo(() => sizeMapType  === "discrete" ? uniqueVals(sizeMapCol)  : [], [sizeMapCol,  sizeMapType,  uniqueVals]);
  const shapeMapCategories = useMemo(() => shapeMapCol != null ? uniqueVals(shapeMapCol) : [], [shapeMapCol, uniqueVals]);

  const shapeWarning = useMemo(() => {
    if (shapeMapCategories.length > 4) {
      return `This column has ${shapeMapCategories.length} unique values — only 4 shapes are available. Categories beyond the 4th will cycle through the same shapes.`;
    }
    return null;
  }, [shapeMapCategories]);

  // Numeric ranges for continuous mappings
  const numericRange = useCallback((colIdx) => {
    if (colIdx == null || !parsed) return [0, 1];
    const vals = parsed.rawData.map(r => parseFloat((r[colIdx] || "").replace(",", "."))).filter(v => !isNaN(v));
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }, [parsed]);

  const colorMapRange = useMemo(() => numericRange(colorMapCol), [colorMapCol, numericRange]);
  const sizeMapRange  = useMemo(() => numericRange(sizeMapCol),  [sizeMapCol,  numericRange]);

  // Auto-assign discrete colors
  useEffect(() => {
    if (colorMapCategories.length === 0) { setColorMapDiscrete({}); return; }
    setColorMapDiscrete(prev => {
      const next = {};
      colorMapCategories.forEach((cat, i) => { next[cat] = prev[cat] || PALETTE[i % PALETTE.length]; });
      return next;
    });
  }, [colorMapCategories]);

  // Auto-assign discrete sizes
  useEffect(() => {
    if (sizeMapCategories.length === 0) { setSizeMapDiscrete({}); return; }
    setSizeMapDiscrete(prev => {
      const next = {};
      sizeMapCategories.forEach((cat, i) => { next[cat] = prev[cat] !== undefined ? prev[cat] : 3 + i * 3; });
      return next;
    });
  }, [sizeMapCategories]);

  // Auto-assign discrete shapes
  useEffect(() => {
    if (shapeMapCategories.length === 0) { setShapeMapDiscrete({}); return; }
    setShapeMapDiscrete(prev => {
      const next = {};
      shapeMapCategories.forEach((cat, i) => { next[cat] = prev[cat] || SHAPES[i % SHAPES.length]; });
      return next;
    });
  }, [shapeMapCategories]);

  // Reset axis overrides and labels when X/Y columns change
  useEffect(() => {
    if (!parsed || xCol == null || yCol == null) return;
    updVis({
      xMin: null, xMax: null, yMin: null, yMax: null,
      xLabel: parsed.headers[xCol],
      yLabel: parsed.headers[yCol],
    });
  }, [xCol, yCol, parsed]);

  // Auto-compute axis ranges from data (used as fallback when vis values are null)
  const autoAxis = useMemo(() => {
    if (!parsed || xCol == null || yCol == null) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const data = parsed.data;
    const xVals = data.map(r => r[xCol]).filter(v => v != null);
    const yVals = data.map(r => r[yCol]).filter(v => v != null);
    const xPad = xVals.length > 1 ? (Math.max(...xVals) - Math.min(...xVals)) * 0.05 : 0.5;
    const yPad = yVals.length > 1 ? (Math.max(...yVals) - Math.min(...yVals)) * 0.05 : 0.5;
    return {
      xMin: xVals.length ? Math.min(...xVals) - xPad : 0,
      xMax: xVals.length ? Math.max(...xVals) + xPad : 1,
      yMin: yVals.length ? Math.min(...yVals) - yPad : 0,
      yMax: yVals.length ? Math.max(...yVals) + yPad : 1,
    };
  }, [parsed, xCol, yCol]);

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
    const hasSizeMap  = sizeMapCol  != null;
    const hasShapeMap = shapeMapCol != null;

    if (hasColorMap && colorMapType === "continuous") {
      const stops = COLOR_PALETTES[colorMapPalette] || COLOR_PALETTES.viridis;
      items.push({ title: parsed.headers[colorMapCol], gradient: { stops, min: colorMapRange[0].toFixed(2), max: colorMapRange[1].toFixed(2) } });
    } else if (hasColorMap && colorMapType === "discrete") {
      items.push({ title: parsed.headers[colorMapCol], items: colorMapCategories.map(c => ({ label: c, color: colorMapDiscrete[c] || "#999", shape: "dot" })) });
    }

    if (hasSizeMap && sizeMapType === "discrete") {
      items.push({ title: parsed.headers[sizeMapCol], sizeItems: sizeMapCategories.map(c => ({ label: c, r: sizeMapDiscrete[c] || sizeMapMin })) });
    } else if (hasSizeMap && sizeMapType === "continuous") {
      const sizeItems = Array.from({length: 4}, (_, i) => {
        const t = i / 3;
        return { label: (sizeMapRange[0] + t * (sizeMapRange[1] - sizeMapRange[0])).toFixed(1), r: sizeMapMin + t * (sizeMapMax - sizeMapMin) };
      });
      items.push({ title: parsed.headers[sizeMapCol], sizeItems });
    }

    if (hasShapeMap) {
      items.push({ title: parsed.headers[shapeMapCol], items: shapeMapCategories.map(c => ({
        label: c, color: "#666", shape: shapeMapDiscrete[c] || "circle"
      })) });
    }

    return items.length > 0 ? items : null;
  }, [parsed, colorMapCol, colorMapType, colorMapPalette, colorMapDiscrete, colorMapCategories, colorMapRange,
      sizeMapCol, sizeMapType, sizeMapMin, sizeMapMax, sizeMapDiscrete, sizeMapCategories, sizeMapRange,
      shapeMapCol, shapeMapCategories, shapeMapDiscrete]);

  const doParse = useCallback((text, sep) => {
    sepRef.current = sep;
    const dc = fixDecimalCommas(text, sep); setCommaFixed(dc.commaFixed); setCommaFixCount(dc.count);
    const fixedText = dc.text;
    const { headers, data, rawData } = parseData(fixedText, sep);
    if (headers.length < 2 || data.length === 0) { setParseError("The file appears to be empty or has no data rows. Please check your file and try again."); return; }
    setParseError(null);
    setRawText(fixedText);

    // Auto-assign X and Y to first two numeric columns
    const isNum = idx => {
      const vals = rawData.map(r => r[idx]).filter(v => v !== "" && v != null);
      return vals.length > 0 && vals.filter(v => isNumericValue(v)).length / vals.length > 0.5;
    };
    const nums = headers.reduce((acc, _, i) => isNum(i) ? [...acc, i] : acc, []);
    setXCol(nums[0] !== undefined ? nums[0] : 0);
    setYCol(nums[1] !== undefined ? nums[1] : (nums[0] !== undefined ? nums[0] : 1));

    // Reset aesthetics
    setColorMapCol(null); setColorMapDiscrete({});
    setSizeMapCol(null);  setSizeMapDiscrete({});
    setShapeMapCol(null); setShapeMapDiscrete({});
    setFilterState({});
    setRefLines([]);
    setPointColor("#648FFF");
    setPointSize(5);
    setPointOpacity(0.8);
    setStrokeColor("#000000");
    setStrokeWidth(1);

    setStep("plot");
  }, []);

  const handleFileLoad = useCallback((text, name) => { setFileName(name); doParse(text, sepOverride); }, [sepOverride, doParse]);
  const resetAll = () => { setRawText(null); setFileName(""); setStep("upload"); };

  const addRefLine = dir =>
    setRefLines(prev => [...prev, {
      id: ++refLineCounter, dir, value: 0,
      color: "#e11d48", strokeWidth: 1.5, dashed: true, dashArray: "7,4",
      label: "", labelSide: dir === "h" ? "right" : "top",
    }]);
  const updateRefLine = (id, key, val) =>
    setRefLines(prev => prev.map(rl => rl.id === id ? { ...rl, [key]: val } : rl));
  const removeRefLine = id =>
    setRefLines(prev => prev.filter(rl => rl.id !== id));

  const canNavigate = s => {
    if (s === "upload") return true;
    if (s === "plot") return !!parsed;
    return false;
  };

  return (
    <div style={{ minHeight: "100vh", color: "#333", fontFamily: "monospace", padding: "24px 32px" }}>

      <PageHeader toolName="scatter" title="Scatter Plot"
        subtitle="XY scatter — one row per data point, one column per variable" />

      <StepNavBar
        steps={["upload","plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={canNavigate}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      <ParseErrorBanner error={parseError} />

      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride} setSepOverride={setSepOverride}
          rawText={rawText} doParse={doParse} handleFileLoad={handleFileLoad}
        />
      )}

      {step === "plot" && parsed && (
        <PlotStep
          parsed={parsed} fileName={fileName}
          filteredData={filteredData} filteredRawRows={filteredRawRows}
          activeColIdxs={activeColIdxs}
          xCol={xCol} setXCol={setXCol} yCol={yCol} setYCol={setYCol}
          numericCols={numericCols}
          pointColor={pointColor} setPointColor={setPointColor}
          pointSize={pointSize} setPointSize={setPointSize}
          pointOpacity={pointOpacity} setPointOpacity={setPointOpacity}
          strokeColor={strokeColor} setStrokeColor={setStrokeColor}
          strokeWidth={strokeWidth} setStrokeWidth={setStrokeWidth}
          colorMapCol={colorMapCol} setColorMapCol={setColorMapCol}
          colorMapType={colorMapType}
          colorMapPalette={colorMapPalette} setColorMapPalette={setColorMapPalette}
          colorMapDiscrete={colorMapDiscrete} setColorMapDiscrete={setColorMapDiscrete}
          colorMapCategories={colorMapCategories} colorMapRange={colorMapRange}
          sizeMapCol={sizeMapCol} setSizeMapCol={setSizeMapCol}
          sizeMapType={sizeMapType}
          sizeMapMin={sizeMapMin} setSizeMapMin={setSizeMapMin}
          sizeMapMax={sizeMapMax} setSizeMapMax={setSizeMapMax}
          sizeMapDiscrete={sizeMapDiscrete} setSizeMapDiscrete={setSizeMapDiscrete}
          sizeMapCategories={sizeMapCategories} sizeMapRange={sizeMapRange}
          shapeMapCol={shapeMapCol} setShapeMapCol={setShapeMapCol}
          shapeMapCategories={shapeMapCategories}
          shapeMapDiscrete={shapeMapDiscrete} setShapeMapDiscrete={setShapeMapDiscrete}
          shapeWarning={shapeWarning}
          vis={vis} updVis={updVis} autoAxis={autoAxis} effAxis={effAxis}
          refLines={refLines} addRefLine={addRefLine}
          updateRefLine={updateRefLine} removeRefLine={removeRefLine}
          filterState={filterState} setFilterState={setFilterState}
          filterableCols={filterableCols} uniqueVals={uniqueVals}
          mappableCols={mappableCols}
          resetAll={resetAll} svgRef={svgRef}
          svgLegend={svgLegend}
        />
      )}

    </div>
  );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(<App />);
