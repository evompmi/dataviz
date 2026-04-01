// boxplot.jsx — editable source. Run `npm run build` to compile to boxplot.js
// Do NOT edit the .js file directly.
const { useState, useReducer, useMemo, useCallback, useRef, forwardRef } = React;

const BoxplotChart = forwardRef(function BoxplotChart({
  groups, yLabel, plotTitle, plotBg, showGrid, gridColor,
  boxWidth, boxFillOpacity, pointSize, showPoints, jitterWidth,
  pointOpacity, xLabelAngle, yMin: yMinP, yMax: yMaxP,
  categoryColors: catCols, colorByCol: cbc, boxGap,
  svgLegend, showCompPie
}, ref) {
  const angle = xLabelAngle || 0;
  const absA = Math.abs(angle);
  const pieSpace = (cbc >= 0 && showCompPie ? 60 : 0);
  const botM = 60 + (absA > 0 ? absA * 0.8 : 0) + pieSpace;
  const M = { top: 24, right: 24, bottom: botM, left: 62 };

  const allV = groups.flatMap(g => g.allValues);
  if (allV.length === 0) return null;

  const dMin = Math.min(...allV);
  const dMax = Math.max(...allV);
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
  const bx = i => M.left + i * bandW + bandW / 2;
  const sy = v => M.top + (1 - (v - yMin) / ((yMax - yMin) || 1)) * h;
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
      const col = (catCols && src.category) ? catCols[src.category] || "#999" : "#999";
      if (pct >= 1) return <circle key={si} cx={lx} cy={cy2} r={r} fill={col} />;
      const x0 = lx + Math.sin(a0) * r;
      const y0 = cy2 - Math.cos(a0) * r;
      const x1 = lx + Math.sin(a1) * r;
      const y1 = cy2 - Math.cos(a1) * r;
      const lg = pct > 0.5 ? 1 : 0;
      return <path key={si} d={`M${lx},${cy2}L${x0},${y0}A${r},${r},0,${lg},1,${x1},${y1}Z`} fill={col} />;
    });

    const labels = g.sources.map((src, si) => {
      const pct = src.values.length / total;
      if (pct < 0.08) return null;
      const cumPct = g.sources.slice(0, si).reduce((s, ss) => s + ss.values.length / total, 0);
      const midA = (cumPct + pct / 2) * Math.PI * 2;
      const lr = r + 8;
      return (
        <text key={`t${si}`} x={lx + Math.sin(midA) * lr} y={cy2 - Math.cos(midA) * lr + 3}
          textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif">
          {Math.round(pct * 100)}%
        </text>
      );
    });

    return (
      <g key={`cb-${g.name}`}>
        {slices}
        <circle cx={lx} cy={cy2} r={r} fill="none" stroke="#ddd" strokeWidth="0.5" />
        {labels}
      </g>
    );
  };

  return (
    <svg ref={ref} viewBox={`0 0 ${vbW} ${vbH}`}
      style={{ width: vbW, maxWidth: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg">

      <rect x={M.left} y={M.top} width={w} height={h} fill={plotBg} />

      {showGrid && yTicks.map(t =>
        <line key={t} x1={M.left} x2={M.left + w} y1={sy(t)} y2={sy(t)}
          stroke={gridColor} strokeWidth="0.5" />
      )}

      {yTicks.map(t =>
        <g key={t}>
          <line x1={M.left - 5} x2={M.left} y1={sy(t)} y2={sy(t)} stroke="#333" strokeWidth="1" />
          <text x={M.left - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#555" fontFamily="sans-serif">
            {Math.abs(t) < .01 && t !== 0 ? t.toExponential(1) : (t % 1 === 0 ? t : t.toFixed(2))}
          </text>
        </g>
      )}

      {groups.map((g, gi) => {
        if (!g.stats) return null;
        const cx = bx(gi);
        const { q1, med, q3, wLo, wHi } = g.stats;
        return (
          <g key={g.name}>
            <line x1={cx} x2={cx} y1={sy(wHi)} y2={sy(q3)} stroke="#333" strokeWidth="1" />
            <line x1={cx} x2={cx} y1={sy(q1)} y2={sy(wLo)} stroke="#333" strokeWidth="1" />
            <line x1={cx - halfBox * .5} x2={cx + halfBox * .5} y1={sy(wHi)} y2={sy(wHi)} stroke="#333" strokeWidth="1" />
            <line x1={cx - halfBox * .5} x2={cx + halfBox * .5} y1={sy(wLo)} y2={sy(wLo)} stroke="#333" strokeWidth="1" />
            <rect x={cx - halfBox} y={sy(q3)} width={halfBox * 2} height={sy(q1) - sy(q3)}
              fill={g.color} fillOpacity={boxFillOpacity} stroke={g.color} strokeWidth="1.5" rx="2" />
            <line x1={cx - halfBox} x2={cx + halfBox} y1={sy(med)} y2={sy(med)}
              stroke={g.color} strokeWidth="2.5" />
            {showPoints && g.sources.map((src, si) => {
              const rng = seededRandom(gi * 1000 + si * 100 + 42);
              const ptColor = pointColor(g, src, si);
              return src.values.map((v, vi) => {
                const j = (rng() - .5) * jitterWidth * halfBox * 2;
                return (
                  <circle key={`${g.name}-${si}-${vi}`} cx={cx + j} cy={sy(v)} r={pointSize}
                    fill={ptColor} fillOpacity={pointOpacity || .6}
                    stroke={ptColor} strokeOpacity={Math.min(1, (pointOpacity || .6) + .15)}
                    strokeWidth="0.3" />
                );
              });
            })}
          </g>
        );
      })}

      <rect x={M.left} y={M.top} width={w} height={h} fill="none" stroke="#333" strokeWidth="1" />

      {groups.map((g, gi) => {
        const lx = bx(gi);
        const ly = M.top + h + 16;
        const compBar = renderCompPie(g, lx);
        return (
          <React.Fragment key={`xl-${g.name}`}>
            {angle === 0 ? (
              <g>
                <text x={lx} y={ly} textAnchor="middle" fontSize="11" fill="#333"
                  fontFamily="sans-serif" fontWeight="600">{g.name}</text>
                <text x={lx} y={ly + 14} textAnchor="middle" fontSize="9" fill="#999"
                  fontFamily="sans-serif">n={g.stats?.n || 0}</text>
              </g>
            ) : (
              <g transform={`rotate(${angle},${lx},${ly})`}>
                <text x={lx} y={ly} textAnchor="end" dominantBaseline="middle" fontSize="11"
                  fill="#333" fontFamily="sans-serif" fontWeight="600">{g.name}</text>
                <text x={lx} y={ly + 12} textAnchor="end" dominantBaseline="middle" fontSize="9"
                  fill="#999" fontFamily="sans-serif">n={g.stats?.n || 0}</text>
              </g>
            )}
            {compBar}
          </React.Fragment>
        );
      })}

      {yLabel && <text transform={`translate(14,${M.top + h / 2}) rotate(-90)`}
        textAnchor="middle" fontSize="13" fill="#444" fontFamily="sans-serif">{yLabel}</text>}

      {plotTitle && <text x={M.left + w / 2} y={14} textAnchor="middle" fontSize="15"
        fontWeight="700" fill="#222" fontFamily="sans-serif">{plotTitle}</text>}

      {renderSvgLegend(svgLegend, vbH_chart + 10, M.left, vbW - M.left - M.right, 88, 14)}
    </svg>
  );
});

/* ── Sub-components (JSX, inline) ──────────────────────────────────────────── */

function UploadStep({sepOverride, onSepChange, rawText, doParse, handleFileLoad, setStep}) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={v=>{onSepChange(v);if(rawText){doParse(rawText,v);setStep("configure");}}}
        onFileLoad={handleFileLoad}
        hint="CSV · TSV · TXT · DAT"
      />
      <p style={{margin:"4px 0 12px",fontSize:11,color:"#aaa",textAlign:"right"}}>⚠ Max file size: 2 MB</p>
      <div style={{marginTop:24,borderRadius:14,overflow:"hidden",border:"2px solid #648FFF",boxShadow:"0 4px 20px rgba(100,143,255,0.12)"}}>
        <div style={{background:"linear-gradient(135deg,#4a6cf7,#648FFF)",padding:"14px 24px",display:"flex",alignItems:"center",gap:12}}>
          {toolIcon("boxplot", 24, {circle:true})}
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:15}}>Boxplot — How to use</div>
            <div style={{color:"rgba(255,255,255,0.75)",fontSize:11,marginTop:2}}>Long or wide data → auto-detect → customizable boxplots</div>
          </div>
        </div>
        <div style={{background:"#eef2ff",padding:"20px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff",gridColumn:"1/-1"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Purpose</div>
            <p style={{fontSize:12,lineHeight:1.75,color:"#444",margin:0}}>An all-in-one boxplot tool that accepts <strong>both long and wide formats</strong>. Wide data (all-numeric columns, headers = group names) is auto-detected and goes straight to plot. Long data gets the full pipeline: assign column roles, filter, rename, reorder, then plot — all without code.</p>
          </div>
          <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Long format</div>
            <p style={{fontSize:11,color:"#555",marginBottom:8,lineHeight:1.6}}>Each <strong>row</strong> = one observation. Columns mix categorical labels and numeric values.</p>
            <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
              <tbody>
                {[["WT","0.368","M","6wpi"],["WT","0.204","M","6wpi"],["lyka-1","0","NM","6wpi"],["lykb-1","0.285","M","6wpi"]].map((r,i)=>(
                  <tr key={i} style={{background:i%2===0?"#f0f4ff":"#fff"}}>
                    {r.map((v,j)=><td key={j} style={{padding:"3px 8px",border:"1px solid #d0dbff",color:"#333"}}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#2EC4B6",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Wide format → auto-detected!</div>
            <p style={{fontSize:11,color:"#555",marginBottom:8,lineHeight:1.6}}>One <strong>column</strong> per condition. All values numeric. Headers = group names. <strong>Goes straight to plot.</strong></p>
            <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
              <thead><tr style={{background:"#d1fae5"}}>{["WT","WT","mutA","mutB"].map((h,i)=><th key={i} style={{padding:"3px 8px",border:"1px solid #a7f3d0",color:"#065f46",fontWeight:700}}>{h}</th>)}</tr></thead>
              <tbody>
                {[[0.45,0.52,0.12,0.31],[0.48,0.51,0.08,0.28],[0.41,0.49,0.15,0.35]].map((r,i)=>(
                  <tr key={i} style={{background:i%2===0?"#f0fdf4":"#fff"}}>
                    {r.map((v,j)=><td key={j} style={{padding:"3px 8px",border:"1px solid #bbf7d0",color:"#333"}}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:10,textTransform:"uppercase",letterSpacing:"1px"}}>Workflow</div>
            {[
              {icon:"📂",text:"Upload: drop or select your CSV / TSV / TXT / DAT file."},
              {icon:"⚙️",text:"Configure: assign roles — group (X axis), value (Y axis), filter, text, or ignore."},
              {icon:"🔍",text:"Filter & Rename: tick values to keep, rename labels, drag to reorder groups."},
              {icon:"📊",text:"Output: summary stats (n, mean, median, SD, SEM), long & wide CSV exports."},
              {icon:"🎨",text:"Plot: boxplots with color-by, facet-by, jitter controls, and SVG download."}
            ].map(({icon,text})=>(
              <div key={icon} style={{display:"flex",gap:10,marginBottom:7,alignItems:"flex-start"}}>
                <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                <span style={{fontSize:11,color:"#444",lineHeight:1.55}}>{text}</span>
              </div>
            ))}
          </div>
          <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#E07B39",marginBottom:10,textTransform:"uppercase",letterSpacing:"1px"}}>🥧 Composition Pies</div>
            <p style={{fontSize:11,color:"#555",marginBottom:8,lineHeight:1.6}}>When <strong>Color by</strong> is active, a <strong>Composition pies</strong> checkbox appears. Enable it to display a small pie chart beneath each boxplot group showing the proportion of each color-by category within that group.</p>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {[
                {step:"1.",text:"Enable Points (the jitter overlay) in the plot controls."},
                {step:"2.",text:"Select a column in the Color by dropdown."},
                {step:"3.",text:"Tick the Composition pies checkbox that appears next to it."}
              ].map(({step,text})=>(
                <div key={step} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#E07B39",flexShrink:0}}>{step}</span>
                  <span style={{fontSize:11,color:"#444",lineHeight:1.55}}>{text}</span>
                </div>
              ))}
            </div>
            <p style={{fontSize:10,color:"#888",marginTop:8,marginBottom:0,lineHeight:1.5}}>Each slice is colored to match the jitter points. Percentage labels are shown for categories ≥ 8 % of the pie. Useful for quickly spotting unbalanced group compositions (e.g. sex ratio across genotypes).</p>
          </div>
          <div style={{borderLeft:"4px solid #648FFF",background:"#dbeafe",padding:"10px 14px",borderRadius:"0 8px 8px 0",gridColumn:"1/-1"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#3b6cf7"}}>💡 Tip — </span>
            <span style={{fontSize:11,color:"#444"}}>Wide-format files (like the output of the Bar Graph or Aequorin tools) are auto-detected and go straight to plot. For long-format, you can facet by one column while coloring points by another.</span>
          </div>
          <div style={{gridColumn:"1/-1",display:"flex",gap:6,flexWrap:"wrap"}}>
            {["Separator explicitly selected (comma, semicolon, tab, space)","Quoted values stripped automatically","100% browser-side — nothing uploaded"].map(t=>(
              <span key={t} style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:"#fff",border:"1px solid #b0c4ff",color:"#555"}}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigureStep({fileName, parsedHeaders, parsedRows, hasHeader, colRoles, colNames, valueColIdx, valueColIsNumeric, onRoleChange, onNameChange, setStep}) {
  return (
    <div>
      <div style={sec}>
        <p style={{margin:"0 0 4px",fontSize:13,color:"#666"}}><strong style={{color:"#333"}}>{fileName}</strong> — {parsedHeaders.length} cols × {parsedRows.length} rows{hasHeader?"":" (no header)"}</p>
        <p style={{fontSize:11,color:"#999",marginBottom:10}}>Preview (first 8 rows):</p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8}/>
      </div>
      <ColumnRoleEditor
        headers={parsedHeaders}
        rows={parsedRows}
        colRoles={colRoles}
        colNames={colNames}
        onRoleChange={onRoleChange}
        onNameChange={onNameChange}
      />
      {valueColIdx>=0&&!valueColIsNumeric&&(
        <div style={{...sec,background:"#fef2f2",borderColor:"#fca5a5",marginBottom:12}}>
          <p style={{fontSize:12,color:"#dc2626"}}>⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as <strong>value</strong> but appears to be non-numeric — the plot will be empty. Please assign a numeric column as value.</p>
        </div>
      )}
      <button onClick={()=>setStep("filter")} style={btnPrimary}>Filter & Rename →</button>
    </div>
  );
}

function FilterStep({parsedHeaders, parsedRows, colRoles, colNames, filters, filteredRows, renamedRows, activeColIdxs, valueRenames, groupColIdx, effectiveOrder, applyRename, toggleFilter, toggleAllFilter, setRenameVal, setGroupOrder, dragIdx, setDragIdx, canPlot, setStep}) {
  return (
    <div>
      <div style={{display:"flex",gap:16,alignItems:"stretch",marginBottom:16}}>
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
          groupColIdx={groupColIdx}
          effectiveOrder={effectiveOrder}
          applyRename={applyRename}
          onRenameVal={setRenameVal}
          onReorder={setGroupOrder}
          dragIdx={dragIdx}
          onDragStart={setDragIdx}
          onDragEnd={()=>setDragIdx(null)}
        />
      </div>
      <div style={{borderRadius:10,padding:16,marginBottom:16,border:"1px solid #99f6e4",background:"#f0fdfa"}}>
        <p style={{margin:"0 0 6px",fontSize:13,fontWeight:600,color:"#0f766e"}}>Preview ({renamedRows.length} rows):</p>
        <DataPreview headers={activeColIdxs.map(i=>colNames[i])} rows={renamedRows.map(r=>activeColIdxs.map(i=>r[i]))} maxRows={10}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setStep("output")} style={btnPrimary}>Output →</button>
        {canPlot&&<button onClick={()=>setStep("plot")} style={btnPlot}>Plot →</button>}
      </div>
    </div>
  );
}

function OutputStep({parsedRows, parsedHeaders, colRoles, colNames, groupColIdx, valueColIdx, valueColIsNumeric, stats, renamedRows, activeColIdxs, wideData, fileName, canPlot, setStep}) {
  return (
    <div>
      {groupColIdx>=0&&valueColIdx>=0&&stats.length>0&&(
        <StatsTable stats={stats} groupLabel={colNames[groupColIdx]}/>
      )}
      <div style={sec}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:"#555"}}>Filtered data (long)</p>
          <button onClick={(e)=>{downloadCsv(activeColIdxs.map(i=>colNames[i]),renamedRows.map(r=>activeColIdxs.map(i=>r[i])),`sanitized_long_${fileName.replace(/\.[^.]+$/,"")}.csv`);flashSaved(e.currentTarget);}} style={{padding:"8px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#dcfce7",border:"1px solid #86efac",color:"#166534",fontFamily:"inherit",fontWeight:600}}>⬇ Long CSV</button>
        </div>
        <DataPreview headers={activeColIdxs.map(i=>colNames[i])} rows={renamedRows.map(r=>activeColIdxs.map(i=>r[i]))} maxRows={6}/>
      </div>
      {wideData&&(
        <div style={sec}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <p style={{margin:0,fontSize:13,fontWeight:600,color:"#555"}}>Reshaped (wide)</p>
            <button onClick={(e)=>{downloadCsv(wideData.headers,wideData.rows,`sanitized_wide_${fileName.replace(/\.[^.]+$/,"")}.csv`);flashSaved(e.currentTarget);}} style={{padding:"8px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#dcfce7",border:"1px solid #86efac",color:"#166534",fontFamily:"inherit",fontWeight:600}}>⬇ Wide CSV</button>
          </div>
          <DataPreview headers={wideData.headers} rows={wideData.rows} maxRows={8}/>
        </div>
      )}
      {(groupColIdx<0||valueColIdx<0)&&<div style={{...sec,background:"#fff8e8",borderColor:"#f0d060"}}><p style={{fontSize:12,color:"#886600"}}>⚠ Assign <strong>group</strong> + <strong>value</strong> columns to enable reshaping & stats.</p></div>}
      {valueColIdx>=0&&!valueColIsNumeric&&<div style={{...sec,background:"#fef2f2",borderColor:"#fca5a5"}}><p style={{fontSize:12,color:"#dc2626"}}>⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as <strong>value</strong> but appears to be non-numeric — the plot will be empty. Go back to Configure and assign a numeric column as value.</p></div>}
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={()=>setStep("filter")} style={btnSecondary}>← Filter</button>
        {canPlot&&<button onClick={()=>setStep("plot")} style={btnPlot}>Plot →</button>}
      </div>
    </div>
  );
}

function PlotControls({dataFormat, setDataFormat, setStep, resetAll, boxplotGroups, renamedRows, plotGroupRenames, setPlotGroupRenames, boxplotColors, setBoxplotColors, vis, updVis, colorByCol, setColorByCol, colorByCandidates, colNames, categoryColors, setCategoryColors, colorByCategories, facetByCol, setFacetByCol, onDownloadSvg, onDownloadPng, chartRef, facetedData, facetRefs}) {
  const sv=k=>v=>updVis({[k]:v});
  return (
    <div style={{width:328,flexShrink:0,position:"sticky",top:24,maxHeight:"calc(100vh - 90px)",overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>

      {/* Wide format banner */}
      {dataFormat==="wide"&&(
        <div style={{...sec,background:"#ecfdf5",borderColor:"#6ee7b7",padding:"10px 12px",marginBottom:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><span style={{fontSize:15}}>⚡</span><p style={{margin:0,fontSize:11,color:"#065f46",fontWeight:600}}>Wide format auto-detected</p></div>
          <button onClick={()=>{setDataFormat("long");setStep("configure");}} style={{fontSize:10,cursor:"pointer",background:"#fff",border:"1px solid #6ee7b7",color:"#065f46",fontFamily:"inherit",fontWeight:600,borderRadius:4,padding:"3px 8px",width:"100%"}}>Switch to long pipeline</button>
        </div>
      )}

      {/* Actions tile */}
      <ActionsPanel
        onDownloadSvg={onDownloadSvg}
        onDownloadPng={onDownloadPng}
        extraButtons={[
          {label:"← Output", onClick:()=>setStep("output"), style:{...btnSecondary,width:"100%"}},
          {label:"← Filter", onClick:()=>setStep("filter"), style:{...btnSecondary,width:"100%"}}
        ]}
        onReset={resetAll}
      />

      {/* Conditions / group color editor */}
      <div style={{...sec,marginBottom:0}}>
        <p style={{margin:"0 0 6px",fontSize:11,color:"#666"}}>{boxplotGroups.length} condition{boxplotGroups.length>1?"s":""} · {renamedRows.length} obs</p>
        <GroupColorEditor
          groups={boxplotGroups.map(g=>({...g, displayName: plotGroupRenames[g.name]??g.name}))}
          onColorChange={(i,c)=>{const name=boxplotGroups[i].name;setBoxplotColors(p=>({...p,[name]:c}));}}
          onNameChange={(i,v)=>{const name=boxplotGroups[i].name;setPlotGroupRenames(p=>({...p,[name]:v}));}}
        />
      </div>

      {/* Style controls */}
      <div style={{...sec,padding:12,marginBottom:0,display:"flex",flexDirection:"column",gap:9}}>
        <BaseStyleControls
          plotBg={vis.plotBg} onPlotBgChange={sv("plotBg")}
          showGrid={vis.showGrid} onShowGridChange={sv("showGrid")}
          gridColor={vis.gridColor} onGridColorChange={sv("gridColor")}
        />
        <SliderControl label="Box width" value={vis.boxWidth} displayValue={vis.boxWidth+"%"} min={20} max={100} step={5} onChange={sv("boxWidth")}/>
        <SliderControl label="Box gap" value={vis.boxGap} displayValue={vis.boxGap+"%"} min={0} max={80} step={5} onChange={sv("boxGap")}/>
        <SliderControl label="Box opacity" value={vis.boxFillOpacity} displayValue={vis.boxFillOpacity.toFixed(2)} min={0} max={1} step={0.05} onChange={sv("boxFillOpacity")}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={lbl}>Points</span><input type="checkbox" checked={vis.showPoints} onChange={e=>updVis({showPoints:e.target.checked})} style={{accentColor:"#648FFF"}}/></div>
        {vis.showPoints&&(<>
          <div>
            <div style={lbl}>Color by</div>
            <select value={colorByCol} onChange={e=>{const v=Number(e.target.value);setColorByCol(v);if(v>=0){const cats=[...new Set(renamedRows.map(r=>r[v]))].sort();const cc={};cats.forEach((c,ci)=>{cc[c]=PALETTE[(ci+2)%PALETTE.length];});setCategoryColors(cc);}}} style={{...inp,cursor:"pointer",fontSize:11,width:"100%"}}>
              <option value={-1}>— none —</option>
              {colorByCandidates.map(ci=><option key={ci} value={ci}>{colNames[ci]}</option>)}
            </select>
          </div>
          {colorByCol>=0&&<label style={{display:"flex",alignItems:"center",gap:4,paddingLeft:8,cursor:"pointer"}}><input type="checkbox" checked={vis.showCompPie} onChange={e=>updVis({showCompPie:e.target.checked})}/><span style={{fontSize:10,color:"#555"}}>Composition pies</span></label>}
          {colorByCol>=0&&colorByCategories.map(cat=>(
            <div key={cat} style={{display:"flex",alignItems:"center",gap:4,paddingLeft:8}}>
              <ColorInput value={categoryColors[cat]||"#999999"} onChange={c=>setCategoryColors(p=>({...p,[cat]:c}))} size={16}/>
              <span style={{fontSize:10,color:"#555"}}>{cat}</span>
            </div>
          ))}
          <SliderControl label="Size" value={vis.pointSize} displayValue={vis.pointSize} min={1} max={6} step={0.5} onChange={sv("pointSize")}/>
          <SliderControl label="Jitter" value={vis.jitterWidth} displayValue={vis.jitterWidth.toFixed(2)} min={0} max={1} step={0.05} onChange={sv("jitterWidth")}/>
          <SliderControl label="Opacity" value={vis.pointOpacity} displayValue={vis.pointOpacity.toFixed(2)} min={0.1} max={1} step={0.05} onChange={sv("pointOpacity")}/>
        </>)}
        <SliderControl label="X angle" value={vis.xLabelAngle} displayValue={vis.xLabelAngle+"°"} min={-90} max={0} step={5} onChange={sv("xLabelAngle")}/>
        <div>
          <div style={lbl}>Facet by</div>
          <select value={facetByCol} onChange={e=>setFacetByCol(Number(e.target.value))} style={{...inp,cursor:"pointer",fontSize:11,width:"100%"}}>
            <option value={-1}>— none —</option>
            {colorByCandidates.map(ci=><option key={ci} value={ci}>{colNames[ci]}</option>)}
          </select>
        </div>
      </div>

      {/* Plot params */}
      <div style={{...sec,padding:12,marginBottom:0,display:"flex",flexDirection:"column",gap:8}}>
        <div><div style={lbl}>Title</div><input value={vis.plotTitle} onChange={e=>updVis({plotTitle:e.target.value})} style={{...inp,width:"100%",fontSize:11}}/></div>
        <div><div style={lbl}>Y label</div><input value={vis.yLabel} onChange={e=>updVis({yLabel:e.target.value})} style={{...inp,width:"100%",fontSize:11}}/></div>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}><div style={lbl}>Y min</div><input value={vis.yMinCustom} onChange={e=>updVis({yMinCustom:e.target.value})} style={{...inp,width:"100%",fontSize:11}} placeholder="auto"/></div>
          <div style={{flex:1}}><div style={lbl}>Y max</div><input value={vis.yMaxCustom} onChange={e=>updVis({yMaxCustom:e.target.value})} style={{...inp,width:"100%",fontSize:11}} placeholder="auto"/></div>
        </div>
      </div>

    </div>
  );
}

function PlotArea({colorByCol, colorByCategories, colNames, categoryColors, facetByCol, facetedData, facetRefs, chartRef, displayBoxplotGroups, vis, yMinVal, yMaxVal, plotGroupRenames, boxplotColors}) {
  return (
    <div style={{flex:1,minWidth:0}}>
      {colorByCol>=0&&colorByCategories.length>0&&(
        <div style={{marginBottom:12,background:"#f8f8fa",borderRadius:8,padding:"8px 14px",border:"1px solid #ddd",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#777"}}>Points colored by: {colNames[colorByCol]}</span>
          {colorByCategories.map(cat=>(
            <div key={cat} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:categoryColors[cat]||"#999"}}/>
              <span style={{fontSize:11,color:"#444"}}>{cat}</span>
            </div>
          ))}
        </div>
      )}
      {(facetByCol<0)&&(
        <div style={{background:"#fff",borderRadius:10,padding:20,border:"1px solid #ddd"}}>
          <BoxplotChart ref={chartRef} groups={displayBoxplotGroups} yLabel={vis.yLabel} plotTitle={vis.plotTitle} plotBg={vis.plotBg} showGrid={vis.showGrid} gridColor={vis.gridColor} boxWidth={vis.boxWidth} boxFillOpacity={vis.boxFillOpacity} pointSize={vis.pointSize} showPoints={vis.showPoints} jitterWidth={vis.jitterWidth} pointOpacity={vis.pointOpacity} xLabelAngle={vis.xLabelAngle} yMin={yMinVal} yMax={yMaxVal} categoryColors={categoryColors} colorByCol={colorByCol} boxGap={vis.boxGap} showCompPie={vis.showCompPie}
            svgLegend={colorByCol >= 0 && colorByCategories.length > 0 ? [{
              title: `Points colored by: ${colNames[colorByCol]}`,
              items: colorByCategories.map(c => ({ label: c, color: categoryColors[c] || "#999", shape: "dot" }))
            }] : null}/>
        </div>
      )}
      {facetByCol>=0&&facetedData.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:16}}>
          {facetedData.map(fd=>{
            const displayFdGroups = fd.groups.map(g => ({...g, name: plotGroupRenames[g.name]??g.name, color: boxplotColors[g.name]??g.color}));
            return (
            <div key={fd.category} style={{background:"#fff",borderRadius:8,padding:12,border:"1px solid #ddd",flex:"0 1 auto",minWidth:180}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:categoryColors[fd.category]||"#999"}}/>
                <p style={{margin:0,fontSize:13,fontWeight:600,color:"#333"}}>{fd.category}</p>
                <span style={{fontSize:11,color:"#999"}}>({fd.groups.reduce((a,g)=>a+g.allValues.length,0)} pts)</span>
              </div>
              <BoxplotChart ref={el=>{facetRefs.current[fd.category]=el;}} groups={displayFdGroups} yLabel={vis.yLabel} plotTitle={[vis.plotTitle, fd.category].filter(Boolean).join(" — ")} plotBg={vis.plotBg} showGrid={vis.showGrid} gridColor={vis.gridColor} boxWidth={vis.boxWidth} boxFillOpacity={vis.boxFillOpacity} pointSize={vis.pointSize} showPoints={vis.showPoints} jitterWidth={vis.jitterWidth} pointOpacity={vis.pointOpacity} xLabelAngle={vis.xLabelAngle} yMin={yMinVal} yMax={yMaxVal} categoryColors={categoryColors} colorByCol={colorByCol} boxGap={vis.boxGap} showCompPie={vis.showCompPie}
                svgLegend={colorByCol >= 0 && colorByCategories.length > 0 ? [{
                  title: `Points colored by: ${colNames[colorByCol]}`,
                  items: colorByCategories.map(c => ({ label: c, color: categoryColors[c] || "#999", shape: "dot" }))
                }] : null}/>
            </div>
            );
          })}
        </div>
      )}
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
    plotTitle: "", yLabel: "Value", plotBg: "#ffffff",
    showGrid: true, gridColor: "#e0e0e0",
    boxFillOpacity: 0.15, boxWidth: 70, boxGap: 0,
    pointSize: 2.5, showPoints: true, jitterWidth: 0.6, pointOpacity: 0.6,
    xLabelAngle: 0, yMinCustom: "", yMaxCustom: "", showCompPie: false
  };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);

  // Plot state
  const [boxplotColors, setBoxplotColors] = useState({});
  const [plotGroupRenames, setPlotGroupRenames] = useState({});
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
    setGroupOrder([]);
    setColorByCol(-1);
    setCategoryColors({});
    setFacetByCol(-1);
    updVis({ yMinCustom: "", yMaxCustom: "" });
  };

  const buildFilters = (hdrs, rws) => {
    const f = {};
    hdrs.forEach((_, i) => {
      const u = [...new Set(rws.map(r => r[i]))].sort();
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
      setColRoles(headers.map((_, i) => guessColumnType(rows.map(r => r[i] ?? ""))));
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

  const applyRename = (ci, v) =>
    (valueRenames[ci] && valueRenames[ci][v] != null) ? valueRenames[ci][v] : v;

  const filteredRows = useMemo(() =>
    parsedRows.filter(r => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))),
    [parsedRows, filters]
  );

  const renamedRows = useMemo(() =>
    filteredRows.map(r => r.map((v, ci) => applyRename(ci, v))),
    [filteredRows, valueRenames]
  );

  const activeColIdxs = useMemo(() =>
    colRoles.reduce((acc, r, i) => { if (r !== "ignore") acc.push(i); return acc; }, []),
    [colRoles]
  );

  const groupColIdx = colRoles.indexOf("group");
  const valueColIdx = colRoles.indexOf("value");

  const groupedData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return {};
    const g = {};
    renamedRows.forEach(r => {
      const k = r[groupColIdx];
      if (!g[k]) g[k] = [];
      g[k].push(r[valueColIdx]);
    });
    return g;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const stats = useMemo(() => computeGroupStats(groupedData), [groupedData]);

  const wideData = useMemo(() =>
    (groupColIdx < 0 || valueColIdx < 0) ? null : reshapeWide(renamedRows, groupColIdx, valueColIdx),
    [renamedRows, groupColIdx, valueColIdx]
  );

  const naturalGroupOrder = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const seen = new Set(), order = [];
    renamedRows.forEach(r => {
      const g = r[groupColIdx];
      if (!seen.has(g)) { seen.add(g); order.push(g); }
    });
    return order;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const effectiveOrder = useMemo(() => {
    if (groupOrder.length > 0) {
      const valid = groupOrder.filter(g => naturalGroupOrder.includes(g));
      const missing = naturalGroupOrder.filter(g => !groupOrder.includes(g));
      return [...valid, ...missing];
    }
    return naturalGroupOrder;
  }, [groupOrder, naturalGroupOrder]);

  const colorByCandidates = useMemo(() =>
    parsedHeaders.map((_, i) => i).filter(i =>
      i !== groupColIdx && i !== valueColIdx &&
      (colRoles[i] === "filter" || colRoles[i] === "group" || colRoles[i] === "text")
    ),
    [parsedHeaders, groupColIdx, valueColIdx, colRoles]
  );

  const colorByCategories = useMemo(() => {
    if (colorByCol < 0) return [];
    return [...new Set(renamedRows.map(r => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);

  const boxplotGroups = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const gm = {};
    renamedRows.forEach(r => {
      const g = r[groupColIdx], v = Number(r[valueColIdx]);
      if (r[valueColIdx] === "" || isNaN(v)) return;
      if (!gm[g]) gm[g] = {};
      if (colorByCol >= 0) {
        const cat = r[colorByCol] || "?";
        if (!gm[g][cat]) gm[g][cat] = [];
        gm[g][cat].push(v);
      } else {
        if (!gm[g]["_all"]) gm[g]["_all"] = [];
        gm[g]["_all"].push(v);
      }
    });
    const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
    return effectiveOrder.filter(name => gm[name]).map((name, gi) => {
      const catMap = gm[name];
      const sources = cats.filter(c => catMap[c]).map((cat, si) => ({
        colIndex: si, values: catMap[cat], category: cat
      }));
      const allValues = sources.flatMap(s => s.values);
      return {
        name, sources, allValues,
        stats: quartiles(allValues),
        color: boxplotColors[name] || PALETTE[gi % PALETTE.length]
      };
    });
  }, [renamedRows, groupColIdx, valueColIdx, boxplotColors, effectiveOrder, colorByCol, colorByCategories]);

  const displayBoxplotGroups = useMemo(() =>
    boxplotGroups.map(g => ({ ...g, name: plotGroupRenames[g.name] ?? g.name })),
    [boxplotGroups, plotGroupRenames]
  );

  // Facet column candidates (same pool as colorBy)
  const facetByCategories = useMemo(() => {
    if (facetByCol < 0) return [];
    return [...new Set(renamedRows.map(r => r[facetByCol]))].sort();
  }, [facetByCol, renamedRows]);

  // Faceted groups: one boxplot per facet category
  const facetedData = useMemo(() => {
    if (facetByCol < 0) return [];
    const globalColorMap = {};
    boxplotGroups.forEach(g => { globalColorMap[g.name] = g.color; });
    return facetByCategories.map(cat => {
      const catRows = renamedRows.filter(r => r[facetByCol] === cat);
      const gm = {};
      catRows.forEach(r => {
        const g = r[groupColIdx], v = Number(r[valueColIdx]);
        if (r[valueColIdx] === "" || isNaN(v)) return;
        if (!gm[g]) gm[g] = {};
        if (colorByCol >= 0) {
          const cc = r[colorByCol] || "?";
          if (!gm[g][cc]) gm[g][cc] = [];
          gm[g][cc].push(v);
        } else {
          if (!gm[g]["_all"]) gm[g]["_all"] = [];
          gm[g]["_all"].push(v);
        }
      });
      const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
      const groups = effectiveOrder.filter(name => gm[name]).map((name, gi) => {
        const catMap = gm[name];
        const sources = cats.filter(c => catMap[c]).map((c, si) => ({
          colIndex: si, values: catMap[c], category: c
        }));
        const allValues = sources.flatMap(s => s.values);
        return {
          name, sources, allValues,
          stats: quartiles(allValues),
          color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length]
        };
      });
      return { category: cat, groups };
    });
  }, [facetByCol, facetByCategories, colorByCol, colorByCategories, renamedRows, groupColIdx, valueColIdx, effectiveOrder, boxplotColors, boxplotGroups]);

  const toggleFilter = (ci, v) => setFilters(p => {
    const f = { ...p }, s = new Set(f[ci].included);
    if (s.has(v)) s.delete(v); else s.add(v);
    f[ci] = { ...f[ci], included: s };
    return f;
  });

  const toggleAllFilter = (ci, all) => setFilters(p => {
    const f = { ...p };
    f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : new Set() };
    return f;
  });

  const setRenameVal = (ci, ov, nv) => setValueRenames(p => {
    const r = { ...p };
    if (!r[ci]) r[ci] = {};
    r[ci] = { ...r[ci], [ov]: nv };
    return r;
  });

  const updateRole = (i, role) => setColRoles(p => p.map((r, j) => j === i ? role : r));
  const updateColName = (i, nm) => setColNames(p => p.map((n, j) => j === i ? nm : n));

  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;

  const valueColIsNumeric = useMemo(() => {
    if (valueColIdx < 0 || !parsedRows.length) return false;
    const vals = parsedRows.map(r => r[valueColIdx] ?? "").filter(v => v !== "");
    return vals.length > 0 && vals.filter(v => isNumericValue(v)).length / vals.length > 0.5;
  }, [parsedRows, valueColIdx]);

  const canPlot = groupColIdx >= 0 && valueColIdx >= 0 && valueColIsNumeric && boxplotGroups.length > 0;

  const handleDownloadSvg = useCallback((e) => {
    if(facetByCol>=0&&facetedData.length>0){
      facetedData.forEach(fd=>downloadSvg(facetRefs.current[fd.category],`boxplot_${fd.category}.svg`));
    }else{
      downloadSvg(chartRef.current,"boxplot.svg");
    }
  }, [facetByCol, facetedData]);

  const handleDownloadPng = useCallback((e) => {
    if(facetByCol>=0&&facetedData.length>0){
      facetedData.forEach(fd=>downloadPng(facetRefs.current[fd.category],`boxplot_${fd.category}.png`));
    }else{
      downloadPng(chartRef.current,"boxplot.png");
    }
  }, [facetByCol, facetedData]);

  return(
    <div style={{minHeight:"100vh",color:"#333",fontFamily:"monospace",padding:"24px 32px"}}>
      <PageHeader
        toolName="boxplot"
        title="Boxplot"
        subtitle={`Load → label columns → filter → plot & export${dataFormat==="wide"?" · Wide format auto-detected":""}`}
      />
      <StepNavBar
        steps={["upload","configure","filter","output","plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={s=>s==="upload"||parsedRows.length>0}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount}/>
      <ParseErrorBanner error={parseError}/>

      {step==="upload"&&(
        <UploadStep
          sepOverride={sepOverride}
          onSepChange={setSepOverride}
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          setStep={setStep}
        />
      )}

      {step==="configure"&&parsedRows.length>0&&(
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

      {step==="filter"&&parsedRows.length>0&&(
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
          groupColIdx={groupColIdx}
          effectiveOrder={effectiveOrder}
          applyRename={applyRename}
          toggleFilter={toggleFilter}
          toggleAllFilter={toggleAllFilter}
          setRenameVal={setRenameVal}
          setGroupOrder={setGroupOrder}
          dragIdx={dragIdx}
          setDragIdx={setDragIdx}
          canPlot={canPlot}
          setStep={setStep}
        />
      )}

      {step==="output"&&parsedRows.length>0&&(
        <OutputStep
          parsedRows={parsedRows}
          parsedHeaders={parsedHeaders}
          colRoles={colRoles}
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

      {step==="plot"&&canPlot&&(
        <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
          <PlotControls
            dataFormat={dataFormat} setDataFormat={setDataFormat}
            setStep={setStep} resetAll={resetAll}
            boxplotGroups={boxplotGroups} renamedRows={renamedRows}
            plotGroupRenames={plotGroupRenames} setPlotGroupRenames={setPlotGroupRenames}
            boxplotColors={boxplotColors} setBoxplotColors={setBoxplotColors}
            vis={vis} updVis={updVis}
            colorByCol={colorByCol} setColorByCol={setColorByCol}
            colorByCandidates={colorByCandidates} colNames={colNames}
            categoryColors={categoryColors} setCategoryColors={setCategoryColors}
            colorByCategories={colorByCategories}
            facetByCol={facetByCol} setFacetByCol={setFacetByCol}
            onDownloadSvg={handleDownloadSvg}
            onDownloadPng={handleDownloadPng}
            chartRef={chartRef}
            facetedData={facetedData} facetRefs={facetRefs}
          />
          <PlotArea
            colorByCol={colorByCol} colorByCategories={colorByCategories}
            colNames={colNames} categoryColors={categoryColors}
            facetByCol={facetByCol} facetedData={facetedData}
            facetRefs={facetRefs} chartRef={chartRef}
            displayBoxplotGroups={displayBoxplotGroups}
            vis={vis} yMinVal={yMinVal} yMaxVal={yMaxVal}
            plotGroupRenames={plotGroupRenames} boxplotColors={boxplotColors}
          />
        </div>
      )}

      {step==="plot"&&!canPlot&&(
        <div style={{...sec,background:"#fff8e8",borderColor:"#f0d060"}}>
          <p style={{fontSize:12,color:"#886600"}}>⚠ Assign <strong>group</strong> + <strong>value</strong> columns and ensure filters keep data.</p>
          <button onClick={()=>setStep("configure")} style={{marginTop:8,...btnSecondary}}>← Configure</button>
        </div>
      )}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
