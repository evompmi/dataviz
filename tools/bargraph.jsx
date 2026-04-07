// bargraph.jsx — editable source. Run `npm run build` to compile to bargraph.js
// Do NOT edit the .js file directly.
const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef, memo } = React;

// Helper: build groups structure from long-format data (group col + value col)
function groupsFromLong(rows, groupColIdx, valueColIdx, categoryColIdx = -1) {
  const map = {};
  const order = [];
  rows.forEach(r => {
    if (groupColIdx >= r.length || valueColIdx >= r.length) return;
    const name = r[groupColIdx] ?? "?";
    const raw = r[valueColIdx] ?? "";
    const v = Number(raw);
    if (raw === "" || isNaN(v)) return;
    if (!map[name]) { map[name] = { name, values: [], categories: [] }; order.push(name); }
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
    if (!map[name]) { map[name] = { name, sources: [] }; order.push(name); }
    map[name].sources.push({ colIndex: i, values: columns[i] });
  });
  return order.map((name, gi) => {
    const g = map[name];
    const allValues = g.sources.flatMap(s => s.values);
    const stats = computeStats(allValues);
    return {
      name: g.name,
      sources: g.sources,
      allValues,
      stats,
      color: PALETTE[gi % PALETTE.length],
    };
  });
}

// ── Chart ───────────────────────────────────────────────────────────────────

const BarChart = forwardRef(function BarChart({ groups, yLabel, plotTitle, plotBg, showGrid,
  gridColor, barWidth, pointSize, showPoints, jitterWidth, pointOpacity, xLabelAngle,
  errorType, barOpacity, yMin: yMinProp, yMax: yMaxProp, catColors,
  errStrokeWidth, showBarOutline, barOutlineWidth, svgLegend }, ref) {

  const angle = xLabelAngle || 0;
  const bottomMargin = 60 + Math.abs(angle) * 0.9;
  const MChart = { top: 24, right: 24, bottom: bottomMargin, left: 62 };

  const allVals = groups.flatMap(g => g.allValues);
  if (allVals.length === 0) return null;

  // Compute y range based on bars + error bars + individual points
  let dataMax = 0;
  let dataMin = 0;
  groups.forEach(g => {
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
  // Default: start at 0 if all values >= 0, else extend below
  const yMin = yMinProp != null ? yMinProp : (dataMin >= 0 ? 0 : dataMin - pad);
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
  const sy = (v) => MChart.top + (1 - (v - yMin) / ((yMax - yMin) || 1)) * h;

  const yTicks = makeTicks(yMin, yMax, 8);
  const halfBar = (barWidth / 100) * bandW * 0.4;

  return (
    <svg ref={ref} viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label={plotTitle || "Bar chart"}>
      <title>{plotTitle || "Bar chart"}</title>
      <desc>{`Bar chart with ${groups.length} group${groups.length !== 1 ? "s" : ""}${yLabel ? `, Y axis: ${yLabel}` : ""}`}</desc>
      <rect x={MChart.left} y={MChart.top} width={w} height={h} fill={plotBg} />

      {showGrid && yTicks.map(t => (
        <line key={t} x1={MChart.left} x2={MChart.left + w} y1={sy(t)} y2={sy(t)}
          stroke={gridColor} strokeWidth="0.5" />
      ))}

      {/* Y axis ticks */}
      {yTicks.map(t => (
        <g key={t}>
          <line x1={MChart.left - 5} x2={MChart.left} y1={sy(t)} y2={sy(t)} stroke="#333" strokeWidth="1" />
          <text x={MChart.left - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="#555" fontFamily="sans-serif">
            {Math.abs(t) < 0.01 && t !== 0 ? t.toExponential(1) : (t % 1 === 0 ? t : t.toFixed(2))}
          </text>
        </g>
      ))}

      {/* Bars */}
      {groups.map((g, gi) => {
        if (!g.stats) return null;
        const cx = bx(gi);
        const { mean, sd, sem } = g.stats;
        if (mean < yMin || mean > yMax) return null;
        const errVal = errorType === "sd" ? sd : sem;
        const baseline = sy(Math.max(0, yMin));
        const barTop = sy(mean);
        const yBar = mean >= 0 ? barTop : baseline;
        const barH = mean >= 0 ? (baseline - barTop) : (sy(mean) - baseline);

        return (
          <g key={g.name} role="group" aria-label={`${g.name}: mean ${mean.toFixed(2)}, ${errorType === "sd" ? "SD" : "SEM"} ${errVal.toFixed(2)}, n=${g.stats.n}`}>
            {/* Bar rectangle */}
            <rect x={cx - halfBar} y={yBar} width={halfBar * 2} height={Math.max(0, barH)}
              fill={g.color} fillOpacity={barOpacity}
              stroke={showBarOutline ? g.color : "none"}
              strokeWidth={showBarOutline ? (barOutlineWidth || 1.5) : 0} rx="1" />

            {/* Error bar */}
            <line x1={cx} x2={cx} y1={sy(mean + errVal)} y2={sy(mean - errVal)}
              stroke="#333" strokeWidth={errStrokeWidth || 1.2} />
            {/* Error bar caps */}
            <line x1={cx - halfBar * 0.4} x2={cx + halfBar * 0.4} y1={sy(mean + errVal)} y2={sy(mean + errVal)}
              stroke="#333" strokeWidth={errStrokeWidth || 1.2} />
            <line x1={cx - halfBar * 0.4} x2={cx + halfBar * 0.4} y1={sy(mean - errVal)} y2={sy(mean - errVal)}
              stroke="#333" strokeWidth={errStrokeWidth || 1.2} />

            {/* Jittered points */}
            {showPoints && g.sources.map((src, si) => {
              const rng = seededRandom(gi * 1000 + si * 100 + 42);
              const ptColors = getPointColors(g.color, g.sources.length);
              return src.values.map((v, vi) => {
                const jitter = (rng() - 0.5) * jitterWidth * halfBar * 2;
                const cat = src.categories?.[vi];
                const ptColor = (catColors && cat && catColors[cat]) ? catColors[cat] : (ptColors[si] || g.color);
                return (
                  <circle key={`${g.name}-${si}-${vi}`} cx={cx + jitter} cy={sy(v)}
                    r={pointSize} fill={ptColor} fillOpacity={pointOpacity || 0.6}
                    stroke={ptColor} strokeOpacity={Math.min(1, (pointOpacity || 0.6) + 0.15)} strokeWidth="0.3" />
                );
              });
            })}
          </g>
        );
      })}

      {/* Axes border */}
      <rect x={MChart.left} y={MChart.top} width={w} height={h} fill="none" stroke="#333" strokeWidth="1" />

      {/* X labels (name + n= as a single rotatable block) */}
      {groups.map((g, gi) => {
        const lx = bx(gi);
        const ly = MChart.top + h + 8;
        const angled = angle !== 0;
        const nLabel = `n=${g.stats?.n || 0}${g.sources.length > 1 ? ` (${g.sources.length} src)` : ""}`;
        return (
          <g key={`xl-${g.name}`} transform={`translate(${lx},${ly}) rotate(${angle})`}>
            <text x={0} y={0}
              textAnchor={angled ? "end" : "middle"}
              dominantBaseline={angled ? "middle" : "hanging"}
              fontSize="11" fill="#333" fontFamily="sans-serif" fontWeight="600">
              {g.name}
            </text>
            <text x={0} y={14}
              textAnchor={angled ? "end" : "middle"}
              dominantBaseline={angled ? "middle" : "hanging"}
              fontSize="9" fill="#999" fontFamily="sans-serif">
              {nLabel}
            </text>
          </g>
        );
      })}

      {/* Y label */}
      {yLabel && (
        <text transform={`translate(14,${MChart.top + h / 2}) rotate(-90)`}
          textAnchor="middle" fontSize="13" fill="#444" fontFamily="sans-serif">{yLabel}</text>
      )}

      {/* Title */}
      {plotTitle && (
        <text x={MChart.left + w / 2} y={14} textAnchor="middle" fontSize="15" fontWeight="700"
          fill="#222" fontFamily="sans-serif">{plotTitle}</text>
      )}
      {renderSvgLegend(svgLegend, vbH_chart + 10, MChart.left, vbW - MChart.left - MChart.right, 88, 14)}
    </svg>
  );
});

// ── Sub-components ─────────────────────────────────────────────────────────

function HowToSection() {
  return (
    <div style={{marginTop:24,borderRadius:14,overflow:"hidden",border:"2px solid #648FFF",boxShadow:"0 4px 20px rgba(100,143,255,0.12)"}}>
      <div style={{background:"linear-gradient(135deg,#4a6cf7,#648FFF)",padding:"14px 24px",display:"flex",alignItems:"center",gap:12}}>
        {toolIcon("bargraph", 24, {circle:true})}
        <div>
          <div style={{color:"#fff",fontWeight:700,fontSize:15}}>Bar Graph Viewer — How to use</div>
          <div style={{color:"rgba(255,255,255,0.75)",fontSize:11,marginTop:2}}>Long or wide data → auto-detect → mean ± SEM/SD bar charts</div>
        </div>
      </div>
      <div style={{background:"#eef2ff",padding:"20px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff",gridColumn:"1/-1"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Purpose</div>
          <p style={{fontSize:12,lineHeight:1.75,color:"#444",margin:0}}>Bar chart visualization with mean ± SEM/SD error bars and optional jittered data points. Accepts <strong>both long and wide formats</strong>. Wide data goes straight to plot; long data gets the full configure → filter → output → plot pipeline.</p>
        </div>
        <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#648FFF",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Long format</div>
          <p style={{fontSize:11,color:"#555",marginBottom:8,lineHeight:1.6}}>Each <strong>row</strong> = one observation. Mix of categorical and numeric columns.</p>
          <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
            <tbody>
              {[["WT","0.45"],["WT","0.52"],["mutA","0.12"],["mutB","0.31"]].map((r,i)=>(
                <tr key={i} style={{background:i%2===0?"#f0f4ff":"#fff"}}>
                  {r.map((v,j)=><td key={j} style={{padding:"3px 8px",border:"1px solid #d0dbff",color:"#333"}}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{background:"#fff",borderRadius:10,padding:"14px 18px",border:"1.5px solid #b0c4ff"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#2EC4B6",marginBottom:8,textTransform:"uppercase",letterSpacing:"1px"}}>Wide format → auto-detected!</div>
          <p style={{fontSize:11,color:"#555",marginBottom:8,lineHeight:1.6}}>One <strong>column</strong> per condition. All numeric. <strong>Goes straight to plot.</strong></p>
          <table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
            <thead><tr style={{background:"#d1fae5"}}>{["WT","mutA","mutB"].map(h=><th key={h} style={{padding:"3px 8px",border:"1px solid #a7f3d0",color:"#065f46",fontWeight:700}}>{h}</th>)}</tr></thead>
            <tbody>
              {[[0.45,0.12,0.31],[0.52,0.08,0.28],[0.48,0.15,0.35]].map((r,i)=>(
                <tr key={i} style={{background:i%2===0?"#f0fdf4":"#fff"}}>
                  {r.map((v,j)=><td key={j} style={{padding:"3px 8px",border:"1px solid #bbf7d0",color:"#333"}}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{borderLeft:"4px solid #648FFF",background:"#dbeafe",padding:"10px 14px",borderRadius:"0 8px 8px 0",gridColumn:"1/-1"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#3b6cf7"}}>💡 Tip — </span>
          <span style={{fontSize:11,color:"#444"}}>Duplicate column names in wide format are pooled as replicates. Points are colored by source column shade.</span>
        </div>
        <div style={{gridColumn:"1/-1",display:"flex",gap:6,flexWrap:"wrap"}}>
          {["Separator explicitly selected (comma, semicolon, tab, space)","Quoted values stripped automatically","100% browser-side — nothing uploaded"].map(t=>(
            <span key={t} style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:"#fff",border:"1px solid #b0c4ff",color:"#555"}}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadStep({ sepOverride, setSepOverride, rawText, doParse, handleFileLoad }) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={v => { setSepOverride(v); if (rawText) { doParse(rawText, v); } }}
        onFileLoad={handleFileLoad}
        hint="CSV · TSV · TXT · DAT — one column per condition, values in rows"
      />
      <p style={{margin:"4px 0 12px",fontSize:11,color:"#aaa",textAlign:"right"}}>⚠ Max file size: 2 MB</p>
      <HowToSection />
    </div>
  );
}

function ConfigureStep({ fileName, parsedHeaders, parsedRows, hasHeader, colRoles, colNames,
  updateRole, updateColName, valueColIdx, valueColIsNumeric, setStep }) {
  return (
    <div>
      <div style={sec}>
        <p style={{margin:"0 0 4px",fontSize:13,color:"#666"}}>
          <strong style={{color:"#333"}}>{fileName}</strong> — {parsedHeaders.length} cols × {parsedRows.length} rows{hasHeader ? "" : " (no header)"}
        </p>
        <p style={{fontSize:11,color:"#999",marginBottom:10}}>Preview (first 8 rows):</p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8}/>
      </div>

      <ColumnRoleEditor
        headers={parsedHeaders}
        rows={parsedRows}
        colRoles={colRoles}
        colNames={colNames}
        onRoleChange={updateRole}
        onNameChange={updateColName}
      />

      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div style={{...sec,background:"#fef2f2",borderColor:"#fca5a5",marginBottom:12}}>
          <p style={{fontSize:12,color:"#dc2626"}}>⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as <strong>value</strong> but appears to be non-numeric — the plot will be empty. Please assign a numeric column as value.</p>
        </div>
      )}

      <button onClick={() => setStep("filter")} style={btnPrimary}>Filter & Rename →</button>
    </div>
  );
}

function FilterStep({ parsedHeaders, parsedRows, colRoles, colNames, filters, filteredRows,
  renamedRows, activeColIdxs, valueRenames, groupColIdx, effectiveOrder, applyRename,
  toggleFilter, toggleAllFilter, setRenameVal, setGroupOrder, dragIdx, setDragIdx,
  canPlot, setStep }) {
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
          onDragEnd={() => setDragIdx(null)}
        />
      </div>

      <div style={{borderRadius:10,padding:16,marginBottom:16,border:"1px solid #99f6e4",background:"#f0fdfa"}}>
        <p style={{margin:"0 0 6px",fontSize:13,fontWeight:600,color:"#0f766e"}}>Preview ({renamedRows.length} rows):</p>
        <DataPreview headers={activeColIdxs.map(i => colNames[i])} rows={renamedRows.map(r => activeColIdxs.map(i => r[i]))} maxRows={10}/>
      </div>

      <div style={{display:"flex",gap:8}}>
        <button onClick={() => setStep("output")} style={btnPrimary}>Output →</button>
        {canPlot && <button onClick={() => setStep("plot")} style={btnPlot}>Plot →</button>}
      </div>
    </div>
  );
}

function OutputStep({ groupColIdx, valueColIdx, colNames, longStats, activeColIdxs, renamedRows,
  fileName, wideData, valueColIsNumeric, canPlot, setStep }) {
  return (
    <div>
      {groupColIdx >= 0 && valueColIdx >= 0 && longStats.length > 0 && (
        <StatsTable stats={longStats} groupLabel={colNames[groupColIdx]} />
      )}

      <div style={sec}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:"#555"}}>Filtered data (long)</p>
          <button onClick={(e) => {
            downloadCsv(activeColIdxs.map(i => colNames[i]), renamedRows.map(r => activeColIdxs.map(i => r[i])),
              `sanitized_long_${fileName.replace(/\.[^.]+$/, "")}.csv`);
            flashSaved(e.currentTarget);
          }} style={btnDownload}>⬇ Long CSV</button>
        </div>
        <DataPreview headers={activeColIdxs.map(i => colNames[i])} rows={renamedRows.map(r => activeColIdxs.map(i => r[i]))} maxRows={6}/>
      </div>

      {wideData && (
        <div style={sec}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <p style={{margin:0,fontSize:13,fontWeight:600,color:"#555"}}>Reshaped (wide)</p>
            <button onClick={(e) => {
              downloadCsv(wideData.headers, wideData.rows,
                `sanitized_wide_${fileName.replace(/\.[^.]+$/, "")}.csv`);
              flashSaved(e.currentTarget);
            }} style={{padding:"8px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#dcfce7",border:"1px solid #86efac",color:"#166534",fontFamily:"inherit",fontWeight:600}}>⬇ Wide CSV</button>
          </div>
          <DataPreview headers={wideData.headers} rows={wideData.rows} maxRows={8}/>
        </div>
      )}

      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div style={{...sec,background:"#fef2f2",borderColor:"#fca5a5"}}>
          <p style={{fontSize:12,color:"#dc2626"}}>⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as <strong>value</strong> but appears to be non-numeric — the plot will be empty. Go back to Configure and assign a numeric column as value.</p>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={() => setStep("filter")} style={btnSecondary}>← Filter</button>
        {canPlot && <button onClick={() => setStep("plot")} style={btnPlot}>Plot →</button>}
      </div>
    </div>
  );
}

function PlotControls({ dataFormat, fileName, effectiveGroups, allDisplayGroups, displayGroups, handleColorChange,
  plotGroupRenames, setPlotGroupRenames, onToggleGroup, vis, updVis,
  colorByCol, setColorByCol, categoryColors, setCategoryColors, colorByCategories, renamedRows, colNames,
  facetByCandidates, facetByCol, setFacetByCol,
  resetAll, chartRef, facetRefs, facetedData }) {

  const sv = k => v => updVis({[k]: v});
  const handleGroupNameChange = (i, newName) => {
    const origName = effectiveGroups[i].name;
    setPlotGroupRenames(p => ({ ...p, [origName]: newName }));
  };
  const handleColorByChange = (e) => {
    const v = Number(e.target.value);
    setColorByCol(v);
    if (v >= 0) {
      const cats = [...new Set(renamedRows.map(r => r[v]))].sort();
      const cc = {};
      cats.forEach((c, ci) => { cc[c] = PALETTE[(ci + 2) % PALETTE.length]; });
      setCategoryColors(cc);
    }
  };
  const handleDownloadSvg = () => {
    if (facetByCol >= 0 && dataFormat === "long" && facetedData.length > 0) {
      facetedData.forEach(fd => downloadSvg(facetRefs.current[fd.category], `bargraph_${fd.category}.svg`));
    } else {
      downloadSvg(chartRef.current, "bargraph.svg");
    }
  };
  const handleDownloadPng = () => {
    if (facetByCol >= 0 && dataFormat === "long" && facetedData.length > 0) {
      facetedData.forEach(fd => downloadPng(facetRefs.current[fd.category], `bargraph_${fd.category}.png`));
    } else {
      downloadPng(chartRef.current, "bargraph.png");
    }
  };

  return (
    <div style={{width:328,flexShrink:0,position:"sticky",top:24,maxHeight:"calc(100vh - 90px)",overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>

      {/* Wide format banner */}
      {dataFormat === "wide" && (
        <div style={{background:"#ecfdf5",borderRadius:8,border:"1px solid #6ee7b7",display:"flex",alignItems:"center",gap:8,padding:"8px 12px"}}>
          <span style={{fontSize:16}}>⚡</span>
          <div style={{flex:1}}>
            <p style={{margin:0,fontSize:11,color:"#065f46",fontWeight:600}}>Wide format auto-detected</p>
            <p style={{margin:"2px 0 0",fontSize:10,color:"#047857"}}>Duplicate headers pooled as replicates.</p>
          </div>
        </div>
      )}

      {/* Actions tile */}
      <ActionsPanel
        onDownloadSvg={handleDownloadSvg}
        onDownloadPng={handleDownloadPng}
        onReset={resetAll}
      />

      {/* Conditions / group colors */}
      <div style={sec}>
        <p style={{margin:"0 0 8px",fontSize:13,fontWeight:600,color:"#555"}}>Conditions</p>
        <p style={{margin:"0 0 6px",fontSize:11,color:"#888"}}>{allDisplayGroups.filter(g=>g.enabled).length} of {allDisplayGroups.length} selected · {renamedRows.length} obs</p>
        <GroupColorEditor
          groups={allDisplayGroups}
          onColorChange={handleColorChange}
          onNameChange={handleGroupNameChange}
          onToggle={onToggleGroup}
        />
        {effectiveGroups.some(g => g.sources.length > 1) && (
          <div style={{marginTop:8,padding:"8px 10px",background:"#fff7ed",border:"1px solid #fdba74",borderRadius:6,display:"flex",alignItems:"flex-start",gap:7}}>
            <span style={{fontSize:14,flexShrink:0}}>⚠️</span>
            <div>
              <p style={{margin:0,fontSize:11,fontWeight:600,color:"#92400e"}}>Duplicate column headers detected</p>
              <p style={{margin:"2px 0 0",fontSize:10,color:"#b45309"}}>Values from duplicate columns have been pooled as replicates. Jitter points are shaded by source column.</p>
            </div>
          </div>
        )}
      </div>

      {/* Style controls */}
      <div style={{...sec,padding:12,display:"flex",flexDirection:"column",gap:10}}>
        <BaseStyleControls
          plotBg={vis.plotBg} onPlotBgChange={sv("plotBg")}
          showGrid={vis.showGrid} onShowGridChange={sv("showGrid")}
          gridColor={vis.gridColor} onGridColorChange={sv("gridColor")}
        />
        <div>
          <span style={lbl}>Error bars</span>
          <select value={vis.errorType} onChange={e => updVis({errorType:e.target.value})}
            style={{width:"100%",background:"#fff",border:"1px solid #ccc",borderRadius:4,padding:"4px 8px",
              fontSize:12,fontFamily:"inherit",color:"#333",cursor:"pointer",marginTop:2}}>
            <option value="sem">SEM</option>
            <option value="sd">SD</option>
          </select>
        </div>
        <SliderControl label="Error bar stroke" value={vis.errStrokeWidth} displayValue={vis.errStrokeWidth.toFixed(1)}
          min={0.5} max={4} step={0.1} onChange={sv("errStrokeWidth")} />
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={lbl}>Bar outline</span>
          <input type="checkbox" checked={vis.showBarOutline} onChange={e => updVis({showBarOutline:e.target.checked})}
            style={{accentColor:"#648FFF"}} />
        </div>
        {vis.showBarOutline && (
          <SliderControl label="Outline stroke" value={vis.barOutlineWidth} displayValue={vis.barOutlineWidth.toFixed(1)}
            min={0.5} max={5} step={0.5} onChange={sv("barOutlineWidth")} />
        )}
        <SliderControl label="Bar width" value={vis.barWidth} displayValue={`${vis.barWidth}%`}
          min={20} max={100} step={5} onChange={sv("barWidth")} />
        <SliderControl label="Bar opacity" value={vis.barOpacity} displayValue={vis.barOpacity.toFixed(2)}
          min={0.05} max={1} step={0.05} onChange={sv("barOpacity")} />
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={lbl}>Points</span>
          <input type="checkbox" checked={vis.showPoints} onChange={e => updVis({showPoints:e.target.checked})}
            style={{accentColor:"#648FFF"}} />
        </div>
        {vis.showPoints && (
          <>
            <SliderControl label="Point size" value={vis.pointSize} displayValue={vis.pointSize}
              min={1} max={6} step={0.5} onChange={sv("pointSize")} />
            <SliderControl label="Jitter" value={vis.jitterWidth} displayValue={vis.jitterWidth.toFixed(2)}
              min={0} max={1} step={0.05} onChange={sv("jitterWidth")} />
            <SliderControl label="Point opacity" value={vis.pointOpacity} displayValue={vis.pointOpacity.toFixed(2)}
              min={0.1} max={1} step={0.05} onChange={sv("pointOpacity")} />
            {dataFormat === "long" && facetByCandidates.length > 0 && (
              <>
                <div>
                  <div style={lbl}>Color by</div>
                  <select value={colorByCol} onChange={handleColorByChange} style={{width:"100%",...inp,cursor:"pointer",fontSize:11,marginTop:2}}>
                    <option value={-1}>— none —</option>
                    {facetByCandidates.map(ci => <option key={ci} value={ci}>{colNames[ci]}</option>)}
                  </select>
                </div>
                {colorByCol >= 0 && colorByCategories.map(cat => (
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:4,paddingLeft:8}}>
                    <ColorInput value={categoryColors[cat] || "#999999"} onChange={c => setCategoryColors(p => ({...p,[cat]:c}))} size={16} />
                    <span style={{fontSize:10,color:"#555"}}>{cat}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
        <SliderControl label="X label angle" value={vis.xLabelAngle} displayValue={`${vis.xLabelAngle}°`}
          min={-90} max={0} step={5} onChange={sv("xLabelAngle")} />
        {dataFormat === "long" && facetByCandidates.length > 0 && (
          <div>
            <span style={lbl}>Facet by</span>
            <select value={facetByCol} onChange={e => setFacetByCol(Number(e.target.value))}
              style={{width:"100%",...inp,cursor:"pointer",fontSize:11,marginTop:2}}>
              <option value={-1}>— none —</option>
              {facetByCandidates.map(ci => <option key={ci} value={ci}>{colNames[ci]}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Plot params */}
      <div style={{...sec,padding:12,display:"flex",flexDirection:"column",gap:8}}>
        <div>
          <div style={lbl}>Title</div>
          <input value={vis.plotTitle} onChange={e => updVis({plotTitle:e.target.value})}
            style={{...inp,width:"100%",marginTop:2}} />
        </div>
        <div>
          <div style={lbl}>Y label</div>
          <input value={vis.yLabel} onChange={e => updVis({yLabel:e.target.value})}
            style={{...inp,width:"100%",marginTop:2}} />
        </div>
        <div>
          <div style={lbl}>Y min (auto if empty)</div>
          <input value={vis.yMinCustom} onChange={e => updVis({yMinCustom:e.target.value})}
            style={{...inp,width:"100%",marginTop:2}} placeholder="auto" />
        </div>
        <div>
          <div style={lbl}>Y max (auto if empty)</div>
          <input value={vis.yMaxCustom} onChange={e => updVis({yMaxCustom:e.target.value})}
            style={{...inp,width:"100%",marginTop:2}} placeholder="auto" />
        </div>
      </div>

    </div>
  );
}

const FacetBarItem = memo(function FacetBarItem({ fd, facetRefs, chartProps }) {
  const localRef = useRef();
  useEffect(() => {
    facetRefs.current[fd.category] = localRef.current;
    return () => { delete facetRefs.current[fd.category]; };
  }, [fd.category, facetRefs]);
  return (
    <div style={{background:"#fff",borderRadius:8,padding:12,border:"1px solid #ddd"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:"#648FFF"}} />
        <p style={{margin:0,fontSize:13,fontWeight:600,color:"#333"}}>{fd.category}</p>
        <span style={{fontSize:11,color:"#999"}}>({fd.groups.reduce((a, g) => a + g.allValues.length, 0)} pts)</span>
      </div>
      <BarChart ref={localRef} {...chartProps} />
    </div>
  );
});

function ChartArea({ dataFormat, facetByCol, facetedData, displayGroups, plotGroupRenames,
  plotGroupColors, colorByCol, colorByCategories, categoryColors, colNames,
  vis, yMinVal, yMaxVal, chartRef, facetRefs }) {

  const svgLegend = colorByCol >= 0 && colorByCategories.length > 0 ? [{
    title: `Points colored by: ${colNames[colorByCol]}`,
    items: colorByCategories.map(c => ({ label: c, color: categoryColors[c] || "#999", shape: "dot" }))
  }] : null;
  const vp = {...vis, yMin: yMinVal, yMax: yMaxVal, catColors: colorByCol >= 0 ? categoryColors : null, svgLegend};

  if (displayGroups.length === 0 && (facetByCol < 0 || dataFormat !== "long" || facetedData.length === 0)) {
    return (
      <div style={{flex:1,minWidth:0}}>
        <div style={{...sec,padding:20,background:"#fff"}}>
          <div style={{ padding: "60px 20px", textAlign: "center", color: "#999", fontSize: 14 }}>
            No conditions selected. Enable at least one to display the plot.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{flex:1,minWidth:0}}>
      {colorByCol >= 0 && colorByCategories.length > 0 && (
        <div style={{marginBottom:12,background:"#f8f8fa",borderRadius:8,padding:"8px 14px",border:"1px solid #ddd",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#777"}}>Points colored by: {colNames[colorByCol]}</span>
          {colorByCategories.map(cat => (
            <div key={cat} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:categoryColors[cat]||"#999"}} />
              <span style={{fontSize:11,color:"#444"}}>{cat}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {(facetByCol < 0 || dataFormat !== "long") && (
        <div style={{...sec,padding:20,background:"#fff"}}>
          <BarChart ref={chartRef} groups={displayGroups} yLabel={vis.yLabel} plotTitle={vis.plotTitle}
            plotBg={vis.plotBg} showGrid={vis.showGrid} gridColor={vis.gridColor}
            barWidth={vis.barWidth} barOpacity={vis.barOpacity} pointSize={vis.pointSize} showPoints={vis.showPoints}
            jitterWidth={vis.jitterWidth} pointOpacity={vis.pointOpacity} xLabelAngle={vis.xLabelAngle}
            errorType={vis.errorType} yMin={yMinVal} yMax={yMaxVal}
            catColors={vp.catColors}
            errStrokeWidth={vis.errStrokeWidth} showBarOutline={vis.showBarOutline} barOutlineWidth={vis.barOutlineWidth}
            svgLegend={svgLegend} />
        </div>
      )}
      {facetByCol >= 0 && dataFormat === "long" && facetedData.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:16}}>
          {facetedData.map(fd => {
            const displayFdGroups = fd.groups.map(g => ({ ...g, name: plotGroupRenames[g.name] ?? g.name, color: plotGroupColors[g.name] ?? g.color }));
            return (
              <FacetBarItem key={fd.category} fd={fd} facetRefs={facetRefs}
                chartProps={{
                  groups: displayFdGroups, yLabel: vis.yLabel,
                  plotTitle: [vis.plotTitle, fd.category].filter(Boolean).join(" — "),
                  plotBg: vis.plotBg, showGrid: vis.showGrid, gridColor: vis.gridColor,
                  barWidth: vis.barWidth, barOpacity: vis.barOpacity, pointSize: vis.pointSize,
                  showPoints: vis.showPoints, jitterWidth: vis.jitterWidth, pointOpacity: vis.pointOpacity,
                  xLabelAngle: vis.xLabelAngle, errorType: vis.errorType, yMin: yMinVal, yMax: yMaxVal,
                  catColors: vp.catColors, errStrokeWidth: vis.errStrokeWidth,
                  showBarOutline: vis.showBarOutline, barOutlineWidth: vis.barOutlineWidth,
                  svgLegend: svgLegend
                }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

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
  // Long-format state
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [colRoles, setColRoles] = useState([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});
  const [groupOrder, setGroupOrder] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  // Plot visual state (grouped)
  const visInit={plotTitle:"",yLabel:"Value",plotBg:"#ffffff",showGrid:true,gridColor:"#e0e0e0",barWidth:70,barOpacity:0.25,pointSize:2.5,showPoints:true,jitterWidth:0.6,pointOpacity:0.6,xLabelAngle:0,errorType:"sem",errStrokeWidth:1.2,showBarOutline:false,barOutlineWidth:1.5,yMinCustom:"",yMaxCustom:""};
  const [vis, updVis] = useReducer((s,a)=>a._reset?{...visInit}:{...s,...a}, visInit);
  const [colorByCol, setColorByCol] = useState(-1);
  const [categoryColors, setCategoryColors] = useState({});
  const [step, setStep] = useState("upload");
  const [facetByCol, setFacetByCol] = useState(-1);
  const chartRef = useRef();
  const facetRefs = useRef({});

  // Long-format helpers
  const applyRename = (ci, v) => (valueRenames[ci] && valueRenames[ci][v] != null) ? valueRenames[ci][v] : v;
  const filteredRows = useMemo(() => parsedRows.filter(r => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))), [parsedRows, filters]);
  const renamedRows = useMemo(() => filteredRows.map(r => r.map((v, ci) => applyRename(ci, v))), [filteredRows, valueRenames]);
  const activeColIdxs = useMemo(() => colRoles.reduce((acc, r, i) => { if (r !== "ignore") acc.push(i); return acc; }, []), [colRoles]);
  const groupColIdx = colRoles.indexOf("group"), valueColIdx = colRoles.indexOf("value");

  // Global group ordering (same pattern as boxplot)
  const naturalGroupOrder = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const seen = new Set(), order = [];
    renamedRows.forEach(r => { const g = r[groupColIdx]; if (!seen.has(g)) { seen.add(g); order.push(g); } });
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

  // Build groups from long-format data
  const longGroups = useMemo(() => {
    if (dataFormat !== "long" || groupColIdx < 0 || valueColIdx < 0) return [];
    const raw = groupsFromLong(renamedRows, groupColIdx, valueColIdx, colorByCol);
    return effectiveOrder.map(n => raw.find(g => g.name === n)).filter(Boolean);
  }, [dataFormat, renamedRows, groupColIdx, valueColIdx, effectiveOrder, colorByCol]);

  // Effective groups for plotting
  const effectiveGroups = dataFormat === "wide" ? groups : longGroups;

  const allDisplayGroups = useMemo(() =>
    effectiveGroups.map(g => ({
      ...g,
      displayName: plotGroupRenames[g.name] ?? g.name,
      color: plotGroupColors[g.name] ?? g.color,
      enabled: !disabledGroups[g.name],
    })),
    [effectiveGroups, plotGroupRenames, plotGroupColors, disabledGroups]
  );

  const displayGroups = useMemo(() =>
    allDisplayGroups.filter(g => g.enabled).map(g => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );

  // Long-format stats for output
  const longStats = useMemo(() => {
    if (dataFormat !== "long" || groupColIdx < 0 || valueColIdx < 0) return [];
    const gd = {};
    renamedRows.forEach(r => { const k = r[groupColIdx]; if (!gd[k]) gd[k] = []; gd[k].push(r[valueColIdx]); });
    return Object.entries(gd).map(([name, vals]) => {
      const nums = vals.filter(v => isNumericValue(v)).map(Number);
      const stats = computeStats(nums);
      if (!stats) return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
      return { name, ...stats };
    });
  }, [dataFormat, renamedRows, groupColIdx, valueColIdx]);

  const facetByCandidates = useMemo(() =>
    parsedHeaders.map((_, i) => i).filter(i =>
      i !== groupColIdx && i !== valueColIdx &&
      (colRoles[i] === "filter" || colRoles[i] === "group" || colRoles[i] === "text")
    ), [parsedHeaders, groupColIdx, valueColIdx, colRoles]);

  const facetByCategories = useMemo(() => {
    if (facetByCol < 0) return [];
    return [...new Set(renamedRows.map(r => r[facetByCol]))].sort();
  }, [facetByCol, renamedRows]);

  const colorByCategories = useMemo(() => {
    if (colorByCol < 0) return [];
    return [...new Set(renamedRows.map(r => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);

  const facetedData = useMemo(() => {
    if (facetByCol < 0 || groupColIdx < 0 || valueColIdx < 0) return [];
    // Build global color map from longGroups for consistent colors across facets
    const globalColorMap = {};
    longGroups.forEach(g => { globalColorMap[g.name] = g.color; });
    return facetByCategories.map(cat => {
      const catRows = renamedRows.filter(r => r[facetByCol] === cat);
      const rawMap = {};
      groupsFromLong(catRows, groupColIdx, valueColIdx, colorByCol)
        .forEach(g => { rawMap[g.name] = { ...g, color: globalColorMap[g.name] || g.color }; });
      const groups = effectiveOrder.filter(n => rawMap[n] && !disabledGroups[n]).map(n => rawMap[n]);
      return { category: cat, groups };
    });
  }, [facetByCol, facetByCategories, renamedRows, groupColIdx, valueColIdx, effectiveOrder, colorByCol, longGroups, disabledGroups]);

  // Wide data reshape from long
  const wideData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return null;
    const g = {};
    renamedRows.forEach(r => { const k = r[groupColIdx] || "?"; if (!g[k]) g[k] = []; g[k].push(r[valueColIdx]); });
    const mx = Math.max(...Object.values(g).map(v => v.length));
    const names = Object.keys(g);
    const w = [];
    for (let i = 0; i < mx; i++) w.push(names.map(n => g[n][i] != null ? g[n][i] : ""));
    return { headers: names, rows: w };
  }, [renamedRows, groupColIdx, valueColIdx]);

  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep); setCommaFixed(dc.commaFixed); setCommaFixCount(dc.count);
    const fixedText = dc.text;
    setRawText(fixedText);
    const { headers, rows, hasHeader: hh } = parseRaw(fixedText, sep);
    if (!headers.length || !rows.length) { setParseError("The file appears to be empty or has no data rows. Please check your file and try again."); return; }
    setParseError(null);
    const isWide = detectWideFormat(headers, rows);
    if (isWide) {
      const pd = parseData(fixedText, sep);
      const columns = dataToColumns(pd.data, pd.headers.length);
      const wh = pd.headers;
      setGroups(groupColumns(wh, columns));
      setPlotGroupRenames({}); setPlotGroupColors({}); setDisabledGroups({});
      setDataFormat("wide");
      setFacetByCol(-1);
      setColorByCol(-1); setCategoryColors({});
      updVis({yMinCustom:"", yMaxCustom:""});
      setStep("plot");
    } else {
      setParsedHeaders(headers); setParsedRows(rows); setHasHeader(hh);
      setColRoles(headers.map((_, i) => guessColumnType(rows.map(r => r[i] ?? ""))));
      setColNames([...headers]);
      const f = {};
      headers.forEach((_, i) => { const u = [...new Set(rows.map(r => r[i]))].sort(); f[i] = { unique: u, included: new Set(u) }; });
      setFilters(f); setValueRenames({}); setPlotGroupRenames({}); setPlotGroupColors({}); setDisabledGroups({}); setGroupOrder([]); setFacetByCol(-1); setColorByCol(-1); setCategoryColors({}); updVis({yMinCustom:"", yMaxCustom:""}); setDataFormat("long"); setStep("configure");
    }
  }, []);
  const handleFileLoad = useCallback((text, name) => { setFileName(name); doParse(text, sepOverride); }, [sepOverride, doParse]);
  const resetAll = () => { setRawText(null); setGroups([]); setParsedRows([]); setParsedHeaders([]); setFileName(""); setStep("upload"); };

  const handleColorChange = (i, color) => {
    if (dataFormat === "wide") {
      setGroups(prev => prev.map((g, j) => j === i ? { ...g, color } : g));
    } else {
      const groupName = effectiveGroups[i]?.name;
      if (groupName) setPlotGroupColors(p => ({ ...p, [groupName]: color }));
    }
  };

  const toggleFilter = (ci, v) => setFilters(p => { const f = { ...p }, s = new Set(f[ci].included); if (s.has(v)) s.delete(v); else s.add(v); f[ci] = { ...f[ci], included: s }; return f; });
  const toggleAllFilter = (ci, all) => setFilters(p => { const f = { ...p }; f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : new Set() }; return f; });
  const setRenameVal = (ci, ov, nv) => setValueRenames(p => { const r = { ...p }; if (!r[ci]) r[ci] = {}; r[ci] = { ...r[ci], [ov]: nv }; return r; });
  const updateRole = (i, role) => setColRoles(p => p.map((r, j) => j === i ? role : r));
  const updateColName = (i, nm) => setColNames(p => p.map((n, j) => j === i ? nm : n));

  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;
  const valueColIsNumeric = useMemo(() => { if (valueColIdx < 0 || !parsedRows.length) return false; const vals = parsedRows.map(r => r[valueColIdx] ?? "").filter(v => v !== ""); return vals.length > 0 && vals.filter(v => isNumericValue(v)).length / vals.length > 0.5; }, [parsedRows, valueColIdx]);
  const canPlot = effectiveGroups.length > 0;
  const handleToggleGroup = (i) => {
    const name = effectiveGroups[i].name;
    setDisabledGroups(p => ({...p, [name]: !p[name]}));
  };

  const allSteps = dataFormat === "long" ? ["upload", "configure", "filter", "output", "plot"] : ["upload", "plot"];


  return (
    <div style={{ minHeight: "100vh", color: "#333",
      fontFamily: "monospace", padding: "24px 32px" }}>

      <PageHeader toolName="bargraph" title="Bar Graph Viewer"
        subtitle="Load a data file — bars show mean ± SEM/SD, with optional individual data points overlay" />

      <StepNavBar
        steps={allSteps}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={s => s === "upload" || parsedRows.length > 0 || groups.length > 0}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      <ParseErrorBanner error={parseError} />

      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride} setSepOverride={setSepOverride}
          rawText={rawText} doParse={doParse} handleFileLoad={handleFileLoad}
        />
      )}

      {/* ── LONG FORMAT: Configure ── */}
      {step === "configure" && dataFormat === "long" && parsedRows.length > 0 && (
        <ConfigureStep
          fileName={fileName} parsedHeaders={parsedHeaders} parsedRows={parsedRows}
          hasHeader={hasHeader} colRoles={colRoles} colNames={colNames}
          updateRole={updateRole} updateColName={updateColName}
          valueColIdx={valueColIdx} valueColIsNumeric={valueColIsNumeric} setStep={setStep}
        />
      )}

      {/* ── LONG FORMAT: Filter ── */}
      {step === "filter" && dataFormat === "long" && parsedRows.length > 0 && (
        <FilterStep
          parsedHeaders={parsedHeaders} parsedRows={parsedRows} colRoles={colRoles}
          colNames={colNames} filters={filters} filteredRows={filteredRows}
          renamedRows={renamedRows} activeColIdxs={activeColIdxs}
          valueRenames={valueRenames} groupColIdx={groupColIdx}
          effectiveOrder={effectiveOrder} applyRename={applyRename}
          toggleFilter={toggleFilter} toggleAllFilter={toggleAllFilter}
          setRenameVal={setRenameVal} setGroupOrder={setGroupOrder}
          dragIdx={dragIdx} setDragIdx={setDragIdx}
          canPlot={canPlot} setStep={setStep}
        />
      )}

      {/* ── LONG FORMAT: Output ── */}
      {step === "output" && dataFormat === "long" && parsedRows.length > 0 && (
        <OutputStep
          groupColIdx={groupColIdx} valueColIdx={valueColIdx} colNames={colNames}
          longStats={longStats} activeColIdxs={activeColIdxs} renamedRows={renamedRows}
          fileName={fileName} wideData={wideData} valueColIsNumeric={valueColIsNumeric}
          canPlot={canPlot} setStep={setStep}
        />
      )}

      {/* ── PLOT (both formats) ── */}
      {step === "plot" && canPlot && (
        <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
          <PlotControls
            dataFormat={dataFormat} fileName={fileName}
            effectiveGroups={effectiveGroups} allDisplayGroups={allDisplayGroups}
            displayGroups={displayGroups}
            handleColorChange={handleColorChange}
            plotGroupRenames={plotGroupRenames} setPlotGroupRenames={setPlotGroupRenames}
            onToggleGroup={handleToggleGroup}
            vis={vis} updVis={updVis}
            colorByCol={colorByCol} setColorByCol={setColorByCol}
            categoryColors={categoryColors} setCategoryColors={setCategoryColors}
            colorByCategories={colorByCategories} renamedRows={renamedRows}
            colNames={colNames} facetByCandidates={facetByCandidates}
            facetByCol={facetByCol} setFacetByCol={setFacetByCol}
            resetAll={resetAll} chartRef={chartRef} facetRefs={facetRefs}
            facetedData={facetedData}
          />
          <ChartArea
            dataFormat={dataFormat} facetByCol={facetByCol} facetedData={facetedData}
            displayGroups={displayGroups} plotGroupRenames={plotGroupRenames}
            plotGroupColors={plotGroupColors} colorByCol={colorByCol}
            colorByCategories={colorByCategories} categoryColors={categoryColors}
            colNames={colNames} vis={vis}
            yMinVal={yMinVal} yMaxVal={yMaxVal}
            chartRef={chartRef} facetRefs={facetRefs}
          />
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
