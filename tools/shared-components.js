// shared-components.js — plain JS, no JSX
// Requires React to be loaded globally before this script.

function ColorInput({value, onChange, size=22}) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => { setText(value); }, [value]);
  const commit = (v) => { if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v); };
  return React.createElement('div', {style:{display:"flex",alignItems:"center",gap:4}},
    React.createElement('input', {
      type:"color", value:value, onChange:e=>onChange(e.target.value),
      style:{width:size,height:size,border:"1px solid #ccc",borderRadius:4,cursor:"pointer",padding:0,flexShrink:0}
    }),
    React.createElement('input', {
      type:"text", value:text,
      onChange:e=>{setText(e.target.value);commit(e.target.value);},
      onBlur:e=>{if(/^#[0-9a-fA-F]{6}$/.test(e.target.value))onChange(e.target.value);else setText(value);},
      maxLength:7, spellCheck:false,
      style:{width:64,fontFamily:"monospace",fontSize:11,border:"1px solid #ccc",borderRadius:4,padding:"2px 5px",color:"#333",background:"#fff"}
    })
  );
}

const FILE_LIMIT_BYTES   = 2 * 1024 * 1024; // 2 MB — hard reject
const FILE_WARN_BYTES    = 1 * 1024 * 1024; // 1 MB — show warning but allow

function FileDropZone({ onFileLoad, accept = ".csv,.tsv,.txt,.dat", hint = "CSV · TSV · TXT · DAT" }) {
  const [drag, setDrag] = React.useState(false);
  const [sizeError, setSizeError] = React.useState(null);
  const [sizeWarn, setSizeWarn] = React.useState(null);
  const inputRef = React.useRef();

  const handle = (file) => {
    setSizeError(null); setSizeWarn(null);
    if (file.size > FILE_LIMIT_BYTES) {
      setSizeError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.`);
      return;
    }
    if (file.size > FILE_WARN_BYTES) {
      setSizeWarn(`Large file (${(file.size / 1024 / 1024).toFixed(1)} MB) — parsing may take a moment.`);
    }
    const reader = new FileReader();
    reader.onload = e => onFileLoad(e.target.result, file.name);
    reader.readAsText(file);
  };

  return React.createElement('div', null,
    React.createElement('div', {
      onDragOver: e => { e.preventDefault(); setDrag(true); },
      onDragLeave: () => setDrag(false),
      onDrop: e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); },
      onClick: () => inputRef.current.click(),
      style: { border: `2px dashed ${drag ? "#648FFF" : sizeError ? "#ef4444" : "#aaa"}`, borderRadius: 12,
        padding: "48px 24px", textAlign: "center", cursor: "pointer",
        background: drag ? "rgba(100,143,255,0.06)" : sizeError ? "rgba(239,68,68,0.04)" : "transparent", transition: "all .2s" }
    },
      React.createElement('input', {ref:inputRef, type:"file", accept:accept, hidden:true,
        onChange:e=>{ if(e.target.files[0]) handle(e.target.files[0]); e.target.value=""; }}),
      React.createElement('div', {style:{fontSize:40,marginBottom:8}}, "📂"),
      React.createElement('p', {style:{margin:0,fontSize:15,color:"#666"}}, "Drop your data file here, or click to browse"),
      React.createElement('p', {style:{margin:"4px 0 0",fontSize:12,color:"#999"}}, hint)
    ),
    sizeError && React.createElement('div', {
      style:{marginTop:10,padding:"10px 14px",borderRadius:8,background:"#fef2f2",border:"1px solid #fca5a5",
             display:"flex",alignItems:"center",gap:8}},
      React.createElement('span', {style:{fontSize:16}}, "🚫"),
      React.createElement('span', {style:{fontSize:12,color:"#dc2626",fontWeight:600}}, sizeError)
    ),
    sizeWarn && React.createElement('div', {
      style:{marginTop:10,padding:"10px 14px",borderRadius:8,background:"#fffbeb",border:"1px solid #fbbf24",
             display:"flex",alignItems:"center",gap:8}},
      React.createElement('span', {style:{fontSize:16}}, "⚠️"),
      React.createElement('span', {style:{fontSize:12,color:"#92400e"}}, sizeWarn)
    )
  );
}

// ── SVG Legend helpers ────────────────────────────────────────────────────────

// itemWidth: number (fixed) or function(block) => number (dynamic per block)
function computeLegendHeight(blocks, usableW, itemWidth) {
  if (!blocks || !blocks.length) return 0;
  var IH = 18, TH = 15;
  var iw = itemWidth || 88;
  var t = 10;
  blocks.forEach(function(b, bi) {
    if (b.title) t += TH;
    if (b.items) {
      var bIW = typeof iw === "function" ? iw(b) : iw;
      t += Math.ceil(b.items.length / Math.max(1, Math.floor(usableW / bIW))) * IH;
    }
    if (b.gradient) t += 30;
    if (b.sizeItems && b.sizeItems.length) {
      var mr = Math.max.apply(null, b.sizeItems.map(function(i) { return i.r; }).concat([3]));
      t += mr * 2 + 4;
    }
    if (bi < blocks.length - 1) t += 8;
  });
  return t + 6;
}

// Renders SVG legend blocks. Returns array of <g> elements.
// startY: y offset for the first block, leftX: x offset, usableW: available width
// itemWidth: number or function(block) => number
// truncateLabel: optional max char length for labels (falsy = no truncation)
function renderSvgLegend(blocks, startY, leftX, usableW, itemWidth, truncateLabel) {
  if (!blocks || !blocks.length) return null;
  var h = React.createElement;
  var IH = 18, TH = 15;
  var iw = itemWidth || 88;

  return blocks.map(function(block, bi) {
    var bIW = typeof iw === "function" ? iw(block) : iw;
    var blockY = startY + (bi > 0 ? blocks.slice(0, bi).reduce(function(acc, b) {
      if (b.title) acc += TH;
      if (b.items) {
        var w = typeof iw === "function" ? iw(b) : iw;
        acc += Math.ceil(b.items.length / Math.max(1, Math.floor(usableW / w))) * IH;
      }
      if (b.gradient) acc += 30;
      if (b.sizeItems && b.sizeItems.length) {
        var mr = Math.max.apply(null, b.sizeItems.map(function(i) { return i.r; }).concat([3]));
        acc += mr * 2 + 4;
      }
      acc += 8;
      return acc;
    }, 0) : 0);
    var itemsPerRow = Math.max(1, Math.floor(usableW / bIW));
    var children = [];

    // Title
    if (block.title) {
      children.push(h("text", { key: "title", fontSize: "10", fill: "#666", fontFamily: "sans-serif", y: 10 }, block.title));
    }

    // Items (circles or lines)
    if (block.items) {
      block.items.forEach(function(item, ii) {
        var row = Math.floor(ii / itemsPerRow);
        var col = ii % itemsPerRow;
        var label = item.label || "";
        if (truncateLabel && label.length > truncateLabel) label = label.slice(0, truncateLabel - 2) + "\u2026";
        var shape;
        if (item.shape === "line") {
          shape = h("line", { key: "s", x1: 0, x2: 14, y1: 7, y2: 7, stroke: item.color, strokeWidth: "2.5" });
        } else if (item.shape === "triangle") {
          shape = h("polygon", { key: "s", points: "6,1 1,12 11,12", fill: item.color });
        } else if (item.shape === "square") {
          shape = h("rect", { key: "s", x: 1, y: 2, width: 10, height: 10, fill: item.color });
        } else if (item.shape === "cross") {
          shape = h("path", { key: "s", d: "M4,0 H8 V4 H12 V8 H8 V12 H4 V8 H0 V4 H4 Z", fill: item.color });
        } else {
          shape = h("circle", { key: "s", cx: 6, cy: 7, r: 5, fill: item.color });
        }
        var text = h("text", {
          key: "t", x: item.shape === "line" ? 18 : 14, y: 11,
          fontSize: "10", fill: "#444", fontFamily: "sans-serif"
        }, label);
        children.push(h("g", {
          key: "i" + ii,
          transform: "translate(" + (col * bIW) + ", " + ((block.title ? TH : 0) + row * IH) + ")"
        }, shape, text));
      });
    }

    // Gradient
    if (block.gradient) {
      var gw = Math.min(usableW * 0.6, 200), gh = 12;
      var th = block.title ? TH : 0;
      var gradId = "svggrad-" + bi;
      var stops = block.gradient.stops.map(function(c, si) {
        return h("stop", { key: si, offset: (si / (block.gradient.stops.length - 1) * 100) + "%", stopColor: c });
      });
      children.push(h("g", { key: "grad", transform: "translate(0, " + th + ")" },
        h("defs", null, h("linearGradient", { id: gradId, x1: "0%", y1: "0%", x2: "100%", y2: "0%" }, stops)),
        h("rect", { x: 0, y: 0, width: gw, height: gh, fill: "url(#" + gradId + ")", rx: "2" }),
        h("text", { x: 0, y: gh + 13, fontSize: "9", fill: "#555", fontFamily: "sans-serif", textAnchor: "start" }, block.gradient.min),
        h("text", { x: gw, y: gh + 13, fontSize: "9", fill: "#555", fontFamily: "sans-serif", textAnchor: "end" }, block.gradient.max)
      ));
    }

    // Size items (scatter)
    if (block.sizeItems && block.sizeItems.length) {
      var sth = block.title ? TH : 0;
      var maxR = Math.max.apply(null, block.sizeItems.map(function(i) { return i.r; }).concat([3]));
      var spacing = maxR * 2 + 30;
      var sizeChildren = block.sizeItems.map(function(item, ii) {
        return h("g", { key: ii, transform: "translate(" + (ii * spacing) + ", 0)" },
          h("circle", { cx: maxR, cy: 0, r: item.r, fill: "#888", fillOpacity: "0.35", stroke: "#888", strokeWidth: "0.8" }),
          h("text", { x: maxR * 2 + 4, y: 4, fontSize: "9", fill: "#444", fontFamily: "sans-serif" }, item.label)
        );
      });
      children.push(h("g", { key: "size", transform: "translate(0, " + (sth + maxR) + ")" }, sizeChildren));
    }

    return h("g", { key: bi, transform: "translate(" + leftX + ", " + blockY + ")" }, children);
  });
}

// ── Shared UI Components ─────────────────────────────────────────────────────

// Slider with label + value display on top, range input below
function SliderControl(props) {
  var label = props.label, value = props.value, displayValue = props.displayValue,
      min = props.min, max = props.max, step = props.step, onChange = props.onChange;
  var dv = displayValue != null ? displayValue : value;
  return React.createElement('div', null,
    React.createElement('div', {style:{display:"flex",justifyContent:"space-between",marginBottom:2}},
      React.createElement('span', {style:lbl}, label),
      React.createElement('span', {style:{fontSize:10,color:"#999"}}, dv)
    ),
    React.createElement('input', {
      type:"range", min:min, max:max, step:step, value:value,
      onChange:function(e){onChange(Number(e.target.value));},
      style:{width:"100%",accentColor:"#648FFF"}
    })
  );
}

// Step navigation bar
function StepNavBar(props) {
  var steps = props.steps, currentStep = props.currentStep, onStepChange = props.onStepChange,
      canNavigate = props.canNavigate;
  return React.createElement('div', {style:{display:"flex",gap:8,marginBottom:20}},
    steps.map(function(s, i) {
      var enabled = canNavigate ? canNavigate(s) : true;
      return React.createElement('button', {
        key:s, onClick:function(){if(enabled)onStepChange(s);},
        style:{padding:"6px 16px",borderRadius:6,fontSize:12,fontWeight:600,
          background:currentStep===s?"#648FFF":"#fff",
          color:currentStep===s?"#fff":(enabled?"#888":"#ccc"),
          border:"1px solid "+(currentStep===s?"#648FFF":(enabled?"#ccc":"#eee")),
          cursor:enabled?"pointer":"default",fontFamily:"inherit",
          textTransform:"uppercase",letterSpacing:1}
      }, (i+1)+". "+s);
    })
  );
}

// Decimal comma auto-fix banner
function CommaFixBanner(props) {
  if (!props.commaFixed) return null;
  return React.createElement('div', {
    style:Object.assign({},sec,{background:"#fffbeb",borderColor:"#fbbf24",
      display:"flex",alignItems:"center",gap:12,padding:"10px 16px"})
  },
    React.createElement('span', {style:{fontSize:18}}, "\uD83D\uDD04"),
    React.createElement('div', {style:{flex:1}},
      React.createElement('p', {style:{margin:0,fontSize:12,color:"#92400e",fontWeight:600}},
        "Decimal commas automatically converted to dots"),
      React.createElement('p', {style:{margin:"2px 0 0",fontSize:11,color:"#a16207"}},
        props.commaFixCount+" value"+(props.commaFixCount>1?"s":"")+" had commas as decimal separators (e.g. \"0,5\" \u2192 \"0.5\"). The data was corrected automatically.")
    )
  );
}

// Parse error banner
function ParseErrorBanner(props) {
  if (!props.error) return null;
  return React.createElement('div', {
    style:{marginBottom:16,padding:"10px 14px",borderRadius:8,background:"#fef2f2",
      border:"1px solid #fca5a5",display:"flex",alignItems:"center",gap:8}
  },
    React.createElement('span', {style:{fontSize:16}}, "\uD83D\uDEAB"),
    React.createElement('span', {style:{fontSize:12,color:"#dc2626",fontWeight:600}}, props.error)
  );
}

// Page header with tool icon
function PageHeader(props) {
  return React.createElement('div', {style:{marginBottom:28,borderBottom:"1px solid #ccc",paddingBottom:16}},
    React.createElement('h1', {style:{margin:0,fontSize:22,fontWeight:700,color:"#222"}},
      toolIcon(props.toolName), props.title),
    props.subtitle ? React.createElement('p', {style:{margin:"4px 0 0",fontSize:12,color:"#888"}}, props.subtitle) : null
  );
}

// Separator selector + FileDropZone combo for upload step
function UploadPanel(props) {
  var sepOverride = props.sepOverride, onSepChange = props.onSepChange,
      onFileLoad = props.onFileLoad, hint = props.hint;
  return React.createElement('div', {style:sec},
    React.createElement('div', {
      style:{marginBottom:12,padding:"12px 16px",background:"#eef2ff",borderRadius:8,
        border:"1.5px solid #b0c4ff",display:"flex",alignItems:"center",gap:10}
    },
      React.createElement('span', {style:{fontSize:13,fontWeight:600,color:"#648FFF"}},
        "1. Choose your column separator:"),
      React.createElement('select', {
        value:sepOverride,
        onChange:function(e){onSepChange(e.target.value);},
        style:sepSelect
      },
        React.createElement('option', {value:""}, "\u2014 Select \u2014"),
        React.createElement('option', {value:","}, "Comma (,)"),
        React.createElement('option', {value:";"}, "Semicolon (;)"),
        React.createElement('option', {value:"\t"}, "Tab (\\t)"),
        React.createElement('option', {value:" "}, "Space")
      ),
      !sepOverride ? React.createElement('span', {style:{fontSize:11,color:"#e11d48",fontWeight:600}},
        "\u26A0 Required before loading a file") : null
    ),
    !sepOverride
      ? React.createElement('div', {
          style:{border:"2px dashed #ccc",borderRadius:12,padding:"48px 24px",textAlign:"center",
            background:"#f5f5f5",opacity:0.5}
        },
          React.createElement('div', {style:{fontSize:40,marginBottom:8}}, "\uD83D\uDEAB"),
          React.createElement('p', {style:{margin:0,fontSize:15,color:"#999"}},
            "Select a column separator above to enable file loading")
        )
      : React.createElement(FileDropZone, {
          onFileLoad:onFileLoad,
          accept:".csv,.tsv,.txt,.dat,.tab",
          hint:hint||"CSV \u00B7 TSV \u00B7 TXT \u00B7 DAT"
        })
  );
}

// Actions tile for plot step
function ActionsPanel(props) {
  var children = [];
  if (props.onDownloadSvg) {
    children.push(React.createElement('button', {
      key:"dl", onClick:function(e){props.onDownloadSvg(e);flashSaved(e.currentTarget);},
      style:btnDownload
    }, "\u2B07 Download SVG"));
  }
  if (props.onDownloadPng) {
    children.push(React.createElement('button', {
      key:"dlpng", onClick:function(e){props.onDownloadPng(e);flashSaved(e.currentTarget);},
      style:Object.assign({}, btnDownload, {background:"#e0f2fe",borderColor:"#7dd3fc",color:"#0369a1"})
    }, "\u2B07 Download PNG"));
  }
  if (props.extraButtons) {
    props.extraButtons.forEach(function(b, i) {
      children.push(React.createElement('button', {
        key:"extra"+i, onClick:b.onClick, style:b.style||btnSecondary
      }, b.label));
    });
  }
  children.push(React.createElement('button', {
    key:"reset", onClick:props.onReset, style:btnDanger
  }, "\u21BA Start over"));
  return React.createElement('div', {style:sec},
    React.createElement('p', {style:{margin:"0 0 8px",fontSize:11,fontWeight:700,color:"#555",
      textTransform:"uppercase",letterSpacing:"0.8px"}}, "Actions"),
    React.createElement('div', {style:{display:"flex",flexDirection:"column",gap:6}}, children)
  );
}

// ── Long-format Pipeline Components ─────────────────────────────────────────

// Column role assignment editor (used in boxplot, bargraph long format)
function ColumnRoleEditor(props) {
  var headers = props.headers, rows = props.rows, colRoles = props.colRoles,
      colNames = props.colNames, onRoleChange = props.onRoleChange, onNameChange = props.onNameChange;
  return React.createElement('div', {style:sec},
    React.createElement('p', {style:{margin:"0 0 10px",fontSize:13,fontWeight:600,color:"#555"}}, "Column roles"),
    React.createElement('div', {style:{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}},
      Object.entries(roleColors).map(function(entry) {
        var r = entry[0], c = entry[1];
        return React.createElement('span', {key:r,
          style:{fontSize:10,padding:"2px 8px",borderRadius:4,background:c,
            color:r==="ignore"?"#666":"#fff",fontWeight:600}}, r);
      })
    ),
    React.createElement('div', {style:{display:"flex",flexDirection:"column",gap:8}},
      headers.map(function(h, i) {
        var u = [];
        var seen = {};
        rows.forEach(function(r) { var v = r[i]; if (!seen[v]) { seen[v] = true; u.push(v); } });
        var pv = u.slice(0,5).join(", ") + (u.length > 5 ? " \u2026 (" + u.length + ")" : "");
        return React.createElement('div', {key:"col-"+i,
          style:{display:"flex",gap:10,alignItems:"center",padding:"8px 12px",background:"#fff",
            borderRadius:6,border:"2px solid "+(roleColors[colRoles[i]]||"#ccc")}
        },
          React.createElement('span', {style:{fontWeight:700,color:"#333",minWidth:20,fontSize:12}}, "#"+(i+1)),
          React.createElement('input', {value:colNames[i],
            onChange:function(e){onNameChange(i,e.target.value);},
            style:Object.assign({},inp,{width:120,fontWeight:600})}),
          React.createElement('select', {value:colRoles[i],
            onChange:function(e){onRoleChange(i,e.target.value);},
            style:Object.assign({},inp,{cursor:"pointer",fontWeight:600,color:roleColors[colRoles[i]]})
          },
            React.createElement('option', {value:"group"}, "group"),
            React.createElement('option', {value:"value"}, "value"),
            React.createElement('option', {value:"filter"}, "filter"),
            React.createElement('option', {value:"text"}, "text"),
            React.createElement('option', {value:"ignore"}, "ignore")
          ),
          React.createElement('span', {style:{fontSize:10,color:"#999",flex:1,overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}}, pv)
        );
      })
    )
  );
}

// Filter panel with checkboxes for each column
function FilterCheckboxPanel(props) {
  var headers = props.headers, colNames = props.colNames, colRoles = props.colRoles,
      filters = props.filters, filteredCount = props.filteredCount, totalCount = props.totalCount,
      onToggle = props.onToggle, onToggleAll = props.onToggleAll;
  return React.createElement('div', {
    style:{flex:1,borderRadius:10,padding:16,border:"1px solid #bfdbfe",background:"#eff6ff",
      display:"flex",flexDirection:"column"}
  },
    React.createElement('p', {style:{margin:"0 0 10px",fontSize:13,fontWeight:600,color:"#1d4ed8"}},
      "Filter rows ("+filteredCount+"/"+totalCount+")"),
    React.createElement('div', {style:{display:"flex",gap:16,flexWrap:"wrap",alignItems:"stretch",flex:1}},
      headers.map(function(h, i) {
        if (colRoles[i] === "ignore") return null;
        var u = filters[i] ? filters[i].unique : [];
        var isNumCol = u.length > 0 && u.filter(function(v){return isNumericValue(v);}).length / u.length > 0.5;
        if (isNumCol) {
          return React.createElement('div', {key:"col-"+i,
            style:{minWidth:140,flex:1,background:"#fff",borderRadius:6,border:"1px solid #ddd",padding:10}
          },
            React.createElement('div', {style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
              React.createElement('p', {style:{fontSize:11,fontWeight:600,color:"#333",margin:0}}, colNames[i]),
              React.createElement('button', {onClick:function(){onToggleAll(i,true);},
                style:{fontSize:9,padding:"2px 6px",background:"#eee",border:"1px solid #ccc",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}, "All")
            ),
            React.createElement('p', {style:{fontSize:10,color:"#999",margin:"4px 0 0",fontStyle:"italic"}},
              "numeric \u2014 use axis range in plot")
          );
        }
        return React.createElement('div', {key:"col-"+i,
          style:{minWidth:140,flex:1,background:"#fff",borderRadius:6,border:"1px solid #ddd",padding:10}
        },
          React.createElement('p', {style:{fontSize:11,fontWeight:600,color:"#333",marginBottom:4}}, colNames[i]),
          React.createElement('div', {style:{display:"flex",gap:6,marginBottom:4}},
            React.createElement('button', {onClick:function(){onToggleAll(i,true);},
              style:{fontSize:9,padding:"2px 6px",background:"#eee",border:"1px solid #ccc",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}, "All"),
            React.createElement('button', {onClick:function(){onToggleAll(i,false);},
              style:{fontSize:9,padding:"2px 6px",background:"#eee",border:"1px solid #ccc",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}, "None")
          ),
          u.map(function(v) {
            var checked = filters[i] && filters[i].included ? filters[i].included.has(v) : false;
            return React.createElement('label', {key:v,
              style:{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#444",cursor:"pointer",marginBottom:2}
            },
              React.createElement('input', {type:"checkbox", checked:checked,
                onChange:function(){onToggle(i,v);}, style:{accentColor:"#648FFF"}}),
              v || React.createElement('em', {style:{color:"#bbb"}}, "(empty)")
            );
          })
        );
      })
    )
  );
}

// Rename values & reorder groups panel
function RenameReorderPanel(props) {
  var headers = props.headers, colNames = props.colNames, colRoles = props.colRoles,
      filters = props.filters, valueRenames = props.valueRenames, groupColIdx = props.groupColIdx,
      effectiveOrder = props.effectiveOrder, applyRename = props.applyRename,
      onRenameVal = props.onRenameVal, onReorder = props.onReorder,
      dragIdx = props.dragIdx, onDragStart = props.onDragStart, onDragEnd = props.onDragEnd;
  return React.createElement('div', {
    style:{flex:1,borderRadius:10,padding:16,border:"1px solid #ddd6fe",background:"#f5f3ff"}
  },
    React.createElement('p', {style:{margin:"0 0 10px",fontSize:13,fontWeight:600,color:"#6d28d9"}},
      "Rename values & reorder groups ",
      React.createElement('span', {style:{fontSize:10,color:"#a78bfa",fontWeight:400}},
        "(drag \u2630 to reorder groups on plot)")),
    React.createElement('div', {style:{display:"flex",gap:16,flexWrap:"wrap"}},
      headers.map(function(h, i) {
        if (colRoles[i] !== "group" && colRoles[i] !== "filter") return null;
        var u = (filters[i] ? filters[i].unique : []).filter(function(v) {
          return filters[i] && filters[i].included && filters[i].included.has(v);
        });
        var isGrp = (i === groupColIdx);
        var renamedU = u.map(function(v){return {orig:v, renamed:applyRename(i,v)};});
        var orderedU = isGrp && effectiveOrder
          ? effectiveOrder.map(function(g){return renamedU.find(function(x){return x.renamed===g;});}).filter(Boolean)
          : renamedU;
        var displayList = orderedU.length > 0 ? orderedU : renamedU;
        return React.createElement('div', {key:"col-"+i,
          style:{minWidth:200,background:"#fff",borderRadius:6,border:"1px solid #ddd",padding:10}
        },
          React.createElement('p', {style:{fontSize:11,fontWeight:600,color:"#333",marginBottom:6}}, colNames[i]),
          displayList.map(function(item, vi) {
            var v = item.orig;
            return React.createElement('div', {key:v,
              draggable:isGrp,
              onDragStart:function(){onDragStart(vi);},
              onDragOver:function(e){e.preventDefault();},
              onDrop:function(){
                if(!isGrp||dragIdx===null||dragIdx===vi){onDragEnd();return;}
                var cur=displayList.map(function(x){return x.renamed;});
                var moved=cur[dragIdx];cur.splice(dragIdx,1);cur.splice(vi,0,moved);
                onReorder(cur);onDragEnd();
              },
              onDragEnd:function(){onDragEnd();},
              style:{display:"flex",gap:4,alignItems:"center",marginBottom:3,padding:"3px 4px",
                borderRadius:4,background:isGrp&&dragIdx===vi?"#e0eaff":"transparent",
                cursor:isGrp?"grab":"default",
                borderLeft:isGrp?"3px solid #648FFF":"3px solid transparent"}
            },
              isGrp ? React.createElement('span', {style:{fontSize:11,color:"#bbb",cursor:"grab"}}, "\u2630") : null,
              React.createElement('span', {style:{fontSize:10,color:"#888",minWidth:55,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},
                v || "(empty)"),
              React.createElement('span', {style:{fontSize:10,color:"#bbb"}}, "\u2192"),
              React.createElement('input', {
                value:valueRenames[i] && valueRenames[i][v] != null ? valueRenames[i][v] : v,
                onChange:function(e){onRenameVal(i,v,e.target.value);},
                style:Object.assign({},inp,{width:100,fontSize:11})
              })
            );
          })
        );
      })
    )
  );
}

// Summary stats table (used in boxplot & bargraph output step)
function StatsTable(props) {
  var stats = props.stats, groupLabel = props.groupLabel;
  if (!stats || stats.length === 0) return null;
  var headers = ["Group","n","Mean","Median","SD","SEM","Min","Max"];
  return React.createElement('div', {style:sec},
    React.createElement('p', {style:{margin:"0 0 10px",fontSize:13,fontWeight:600,color:"#555"}},
      "Summary \u2014 grouped by \""+groupLabel+"\""),
    React.createElement('div', {style:{overflowX:"auto"}},
      React.createElement('table', {style:{borderCollapse:"collapse",fontSize:12,width:"100%"}},
        React.createElement('thead', null,
          React.createElement('tr', {style:{borderBottom:"2px solid #ccc"}},
            headers.map(function(h){return React.createElement('th', {key:h,
              style:{padding:"4px 10px",textAlign:"left",color:"#666",fontWeight:600}}, h);})
          )
        ),
        React.createElement('tbody', null,
          stats.map(function(s, i) {
            return React.createElement('tr', {key:s.name, style:{borderBottom:"1px solid #eee"}},
              React.createElement('td', {style:{padding:"4px 10px",fontWeight:600,color:PALETTE[i%PALETTE.length]}}, s.name),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.n),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.mean!=null?s.mean.toFixed(4):"\u2014"),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.median!=null?s.median.toFixed(4):"\u2014"),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.sd!=null?s.sd.toFixed(4):"\u2014"),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.sem!=null?s.sem.toFixed(4):"\u2014"),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.min!=null?s.min.toFixed(4):"\u2014"),
              React.createElement('td', {style:{padding:"4px 10px"}}, s.max!=null?s.max.toFixed(4):"\u2014")
            );
          })
        )
      )
    )
  );
}

// Condition/group color editor with ColorInput per group
function GroupColorEditor(props) {
  var groups = props.groups, onColorChange = props.onColorChange, onNameChange = props.onNameChange;
  var onToggle = props.onToggle;
  return React.createElement('div', {style:{display:"flex",flexDirection:"column",gap:4}},
    groups.map(function(g, i) {
      var enabled = g.enabled !== false;
      var children = [];
      if (onToggle) {
        children.push(React.createElement('input', {key:"cb", type:"checkbox", checked:enabled,
          onChange:function(){onToggle(i);},
          style:{accentColor:g.color, flexShrink:0, cursor:"pointer"}}));
      }
      children.push(React.createElement(ColorInput, {key:"clr", value:g.color,
        onChange:function(c){onColorChange(i,c);}, size:18}));
      children.push(React.createElement('input', {key:"nm",
        value:g.displayName || g.name,
        onChange:function(e){if(onNameChange)onNameChange(i,e.target.value);},
        style:{flex:1,minWidth:0,background:"#fff",border:"1px solid #ccc",borderRadius:4,
          color:"#333",padding:"2px 4px",fontSize:11,fontFamily:"inherit"}
      }));
      children.push(React.createElement('span', {key:"n", style:{color:"#999",fontSize:10,flexShrink:0}},
        "n="+(g.stats?g.stats.n:0)));
      return React.createElement('div', {key:g.name,
        style:{display:"flex",alignItems:"center",gap:6,padding:"3px 8px",borderRadius:6,
          fontSize:12,background:enabled?"#f0f0f5":"#fafafa",
          opacity:enabled?1:0.4,border:"1px solid #ccc"}
      }, children);
    })
  );
}

// Style controls section (background, grid, grid color)
function BaseStyleControls(props) {
  var plotBg = props.plotBg, onPlotBgChange = props.onPlotBgChange,
      showGrid = props.showGrid, onShowGridChange = props.onShowGridChange,
      gridColor = props.gridColor, onGridColorChange = props.onGridColorChange;
  var children = [
    React.createElement('div', {key:"bg",style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
      React.createElement('span', {style:lbl}, "Background"),
      React.createElement(ColorInput, {value:plotBg, onChange:onPlotBgChange, size:24})),
    React.createElement('div', {key:"grid",style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
      React.createElement('span', {style:lbl}, "Grid"),
      React.createElement('input', {type:"checkbox", checked:showGrid,
        onChange:function(e){onShowGridChange(e.target.checked);}, style:{accentColor:"#648FFF"}}))
  ];
  if (showGrid) {
    children.push(React.createElement('div', {key:"gc",style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
      React.createElement('span', {style:lbl}, "Grid color"),
      React.createElement(ColorInput, {value:gridColor, onChange:onGridColorChange, size:24})));
  }
  return children;
}

// ── Data Preview Table ──────────────────────────────────────────────────────

function DataPreview({headers, rows, maxRows}) {
  const limit = maxRows || 10;
  const d = rows.slice(0, limit);
  return React.createElement('div', {style:{overflowX:"auto",fontSize:11,border:"1px solid #ddd",borderRadius:6}},
    React.createElement('table', {style:{borderCollapse:"collapse",width:"100%",minWidth:400}},
      React.createElement('thead', null,
        React.createElement('tr', {style:{background:"#f0f0f5"}},
          React.createElement('th', {style:{padding:"5px 8px",border:"1px solid #ddd",color:"#999",fontSize:10}}, "#"),
          ...headers.map((h,i) => React.createElement('th', {key:i, style:{padding:"5px 8px",border:"1px solid #ddd",color:"#333",fontWeight:600}}, h))
        )
      ),
      React.createElement('tbody', null,
        ...d.map((r,ri) => React.createElement('tr', {key:ri},
          React.createElement('td', {style:{padding:"3px 8px",border:"1px solid #eee",color:"#bbb",fontSize:10}}, ri+1),
          ...r.map((v,ci) => React.createElement('td', {key:ci, style:{padding:"3px 8px",border:"1px solid #eee",color:"#444"}}, v))
        ))
      )
    ),
    rows.length > limit
      ? React.createElement('p', {style:{padding:6,fontSize:11,color:"#999",textAlign:"center"}},
          `… ${rows.length - limit} more (${rows.length} total)`)
      : null
  );
}
