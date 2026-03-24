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
        var shape = item.shape === "line"
          ? h("line", { key: "s", x1: 0, x2: 14, y1: 7, y2: 7, stroke: item.color, strokeWidth: "2.5" })
          : h("circle", { key: "s", cx: 6, cy: 7, r: 5, fill: item.color });
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
