// ── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r, g, b) {
  return "#" + [r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,"0")).join("");
}
function shadeColor(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  if (factor > 0) return rgbToHex(r+(255-r)*factor, g+(255-g)*factor, b+(255-b)*factor);
  return rgbToHex(r*(1+factor), g*(1+factor), b*(1+factor));
}
function getPointColors(baseColor, nSources) {
  if (nSources <= 1) return [baseColor];
  const colors = [];
  for (let i = 0; i < nSources; i++) {
    const t = nSources === 1 ? 0 : (i / (nSources - 1));
    colors.push(shadeColor(baseColor, -0.4 + t * 0.7));
  }
  return colors;
}

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = ["#648FFF","#785EF0","#DC267F","#FE6100","#FFB000","#2EC4B6","#E71D36","#011627","#8AC926","#6A4C93"];

// ── Tool icons (raw SVG strings) ─────────────────────────────────────────────

const TOOL_ICONS = {
  aequorin: '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 36 C8 36, 10 36, 12 34 C14 30, 15 8, 17 6 C19 4, 20 14, 22 22 C24 28, 25 32, 27 34 C29 36, 32 36, 40 36"/></svg>',
  boxplot: '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="4" x2="22" y2="12"/><rect x="14" y="12" width="16" height="18" rx="2"/><line x1="14" y1="22" x2="30" y2="22"/><line x1="22" y1="30" x2="22" y2="40"/></svg>',
  bargraph: '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="20" width="8" height="18" rx="1"/><rect x="18" y="10" width="8" height="28" rx="1"/><rect x="30" y="16" width="8" height="22" rx="1"/><line x1="10" y1="16" x2="10" y2="24"/><line x1="22" y1="6" x2="22" y2="14"/><line x1="34" y1="12" x2="34" y2="20"/></svg>',
  scatter: '<svg viewBox="0 0 44 44" fill="#648FFF" stroke="none"><circle cx="10" cy="30" r="3"/><circle cx="16" cy="22" r="2.5"/><circle cx="24" cy="26" r="3.5"/><circle cx="20" cy="14" r="2"/><circle cx="32" cy="18" r="3"/><circle cx="36" cy="10" r="2.5"/><circle cx="28" cy="32" r="2"/></svg>'
};

function toolIcon(name, size, opts) {
  size = size || 22;
  opts = opts || {};
  var svg = TOOL_ICONS[name].replace('<svg ', '<svg width="' + size + '" height="' + size + '" ');
  var pad = Math.round(size * 0.3);
  var outerSize = size + pad * 2;
  if (opts.circle) {
    return React.createElement('span', {
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: outerSize, height: outerSize, borderRadius: '50%', background: '#fff',
        flexShrink: 0, verticalAlign: 'middle', marginRight: 6, lineHeight: 0 }
    }, React.createElement('span', {
      dangerouslySetInnerHTML: { __html: svg },
      style: { display: 'inline-block', lineHeight: 0 }
    }));
  }
  return React.createElement('span', {
    dangerouslySetInnerHTML: { __html: svg },
    style: { display: 'inline-block', verticalAlign: 'middle', marginRight: 6, lineHeight: 0 }
  });
}

// ── UI style constants ────────────────────────────────────────────────────────

const inp       = {background:"#fff",border:"1px solid #ccc",borderRadius:4,color:"#333",padding:"4px 8px",fontSize:12};
const inpN      = {width:72,background:"#fff",border:"1px solid #ccc",borderRadius:4,color:"#333",padding:"4px 8px",fontSize:13,textAlign:"center"};
const sec       = {background:"#f8f8fa",borderRadius:10,padding:16,marginBottom:16,border:"1px solid #ddd"};
const lbl       = {fontSize:12,color:"#777",marginBottom:2};
const roleColors = {group:"#648FFF",value:"#2EC4B6",filter:"#FFB000",text:"#785EF0",ignore:"#ccc"};

const btnPrimary  = {padding:"10px 28px",borderRadius:8,fontSize:14,fontWeight:700,background:"#648FFF",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit"};
const btnSecondary = {padding:"6px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#fff",border:"1px solid #ccc",color:"#555",fontFamily:"inherit"};
const btnDanger   = {padding:"8px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#fef2f2",border:"1px solid #fca5a5",color:"#dc2626",fontFamily:"inherit",width:"100%"};
const btnDownload = {padding:"8px 14px",borderRadius:6,fontSize:12,cursor:"pointer",background:"#16a34a",border:"none",color:"#fff",fontFamily:"inherit",width:"100%",fontWeight:600};
const btnPlot     = {padding:"10px 28px",borderRadius:8,fontSize:14,fontWeight:700,background:"#2EC4B6",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit"};
const selStyle    = {background:"#fff",border:"1px solid #ccc",borderRadius:4,padding:"4px 8px",fontSize:12,fontFamily:"inherit",color:"#333",cursor:"pointer"};
const sepSelect   = {background:"#fff",border:"2px solid #648FFF",borderRadius:6,padding:"6px 12px",fontSize:13,fontFamily:"inherit",color:"#333",cursor:"pointer",fontWeight:600};

// ── Numeric detection ────────────────────────────────────────────────────────

// Returns true only for strings that are entirely a valid finite number.
// Rejects values like "6wpi", "Infinity", "0xFF" that Number() would
// accept or partially parse.
function isNumericValue(v) {
  return /^\s*-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v);
}

// ── Seeded random ────────────────────────────────────────────────────────────

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

// ── Axis ticks ───────────────────────────────────────────────────────────────

function niceStep(range, approxN) {
  const rough = range / approxN;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice = rough / mag;
  if (nice <= 1) return mag;
  if (nice <= 2) return 2 * mag;
  if (nice <= 5) return 5 * mag;
  return 10 * mag;
}
function makeTicks(min, max, approxN) {
  const step = niceStep(max - min || 1, approxN);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step)
    ticks.push(parseFloat(v.toPrecision(10)));
  return ticks;
}

// ── Separator detection ───────────────────────────────────────────────────────

function autoDetectSep(text, override = "") {
  if (override !== "") return override;
  const h = text.slice(0, 2000);
  const t = (h.match(/\t/g) || []).length,
        s = (h.match(/;/g)  || []).length,
        c = (h.match(/,/g)  || []).length;
  const b = Math.max(t, s, c);
  if (b === 0) return /\s+/;
  if (t === b) return "\t";
  if (s === b) return ";";
  return ",";
}

// ── Decimal comma fix ─────────────────────────────────────────────────────────

function fixDecimalCommas(text, sep) {
  // If the separator is a comma, commas in values are column delimiters — never decimal separators.
  // If sep is unknown, auto-detect: if commas dominate, treat them as column separators.
  const knownSep = sep || "";
  if (knownSep === ",") return { text, commaFixed: false, count: 0 };
  if (knownSep === "") {
    const h = text.slice(0, 2000);
    const t = (h.match(/\t/g) || []).length,
          s = (h.match(/;/g)  || []).length,
          c = (h.match(/,/g)  || []).length;
    if (c >= s && c >= t) return { text, commaFixed: false, count: 0 };
  }
  let count = 0;
  const fixed = text.replace(/(\d),(\d)/g, (_, a, b) => { count++; return `${a}.${b}`; });
  return { text: fixed, commaFixed: count > 0, count };
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function detectHeader(rows) {
  if (rows.length < 2) return true;
  const a = rows[0].filter(v => !isNumericValue(v) && v.trim() !== "").length;
  const b = rows[1].filter(v => !isNumericValue(v) && v.trim() !== "").length;
  if (a > b) return true;
  if (a === b && a > 0) {
    let reps = 0;
    for (let i = 1; i < Math.min(rows.length, 20); i++)
      for (let c = 0; c < rows[0].length; c++)
        if (rows[i][c] && rows[i][c].trim() === rows[0][c].trim()) reps++;
    return reps < rows[0].length;
  }
  return a > 0;
}

function parseRaw(text, sepOv = "") {
  const sep = autoDetectSep(text, sepOv);
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 1) return { headers: [], rows: [], hasHeader: false };
  const all = lines.map(l => l.split(sep).map(v => v.trim().replace(/^"|"$/g, "")));
  if (all.length === 0) return { headers: [], rows: [], hasHeader: false };
  const mx = Math.max(...all.map(r => r.length));
  const pad = all.map(r => { while (r.length < mx) r.push(""); return r; });
  const hh = detectHeader(pad);
  if (hh) return { headers: pad[0], rows: pad.slice(1), hasHeader: true };
  return { headers: pad[0].map((_, i) => `Col_${i+1}`), rows: pad, hasHeader: false };
}

function guessColumnType(vals) {
  const ne = vals.filter(v => v != null && v !== "");
  if (ne.length === 0) return "ignore";
  if (ne.filter(v => isNumericValue(v)).length / ne.length > 0.8) return "value";
  const u = new Set(ne);
  if (u.size <= 20 && u.size < ne.length * 0.5) return "group";
  return "text";
}

function detectWideFormat(headers, rows) {
  if (headers.length < 2 || rows.length < 2) return false;
  const numericCols = headers.map((_, ci) => {
    const vals = rows.map(r => r[ci]).filter(v => v !== "");
    return vals.length > 0 && vals.filter(v => isNumericValue(v)).length / vals.length > 0.8;
  });
  return numericCols.every(Boolean);
}

// ── Unified data parsing ─────────────────────────────────────────────────────

function parseData(text, sepOv = "") {
  const sep = autoDetectSep(text, sepOv);
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return { headers: [], data: [], rawData: [] };
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
  const nCols = headers.length;
  const data = [], rawData = [];
  for (let i = 1; i < lines.length; i++) {
    const rawVals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
    while (rawVals.length < nCols) rawVals.push("");
    if (rawVals.every(v => v === "")) continue;
    data.push(rawVals.map(s => isNumericValue(s) ? Number(s) : null));
    rawData.push(rawVals);
  }
  return { headers, data, rawData };
}

function dataToColumns(data, nCols) {
  const columns = Array.from({ length: nCols }, () => []);
  for (const row of data) {
    for (let c = 0; c < nCols; c++) {
      if (row[c] != null) columns[c].push(row[c]);
    }
  }
  return columns;
}

// ── Wide / long format helpers ────────────────────────────────────────────────

function wideToLong(headers, rows) {
  const longRows = [];
  rows.forEach(r => {
    headers.forEach((h, ci) => {
      if (r[ci] !== "" && isNumericValue(r[ci])) longRows.push([h, r[ci]]);
    });
  });
  return { headers: ["Group", "Value"], rows: longRows };
}

function reshapeWide(rows, gi, vi) {
  const g = {};
  rows.forEach(r => { const k = r[gi] || "?"; if (!g[k]) g[k] = []; g[k].push(r[vi]); });
  const vals = Object.values(g);
  if (vals.length === 0) return { headers: [], rows: [] };
  const mx = Math.max(...vals.map(v => v.length));
  const names = Object.keys(g);
  const w = [];
  for (let i = 0; i < mx; i++) w.push(names.map(n => g[n][i] != null ? g[n][i] : ""));
  return { headers: names, rows: w };
}

// ── Statistics ────────────────────────────────────────────────────────────────

function computeStats(arr) {
  const n = arr.length;
  if (n === 0) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const sd = Math.sqrt(variance);
  const sem = n > 1 ? sd / Math.sqrt(n) : 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const median = n % 2 === 0 ? (sorted[n/2-1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
  return { mean, sd, sem, n, min, max, median };
}

function quartiles(arr) {
  const s = [...arr].sort((a, b) => a - b), n = s.length;
  if (n === 0) return null;
  const q = p => { const i = p*(n-1), lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo]*(hi-i)+s[hi]*(i-lo); };
  const q1 = q(.25), med = q(.5), q3 = q(.75), iqr = q3 - q1;
  return { min: s[0], max: s[n-1], q1, med, q3, iqr,
    wLo: s.find(v => v >= q1 - 1.5*iqr) ?? s[0],
    wHi: [...s].reverse().find(v => v <= q3 + 1.5*iqr) ?? s[n-1], n };
}

function computeGroupStats(groups) {
  return Object.entries(groups).map(([name, vals]) => {
    const nums = vals.filter(v => v !== "" && isNumericValue(v)).map(Number);
    const stats = computeStats(nums);
    if (!stats) return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
    return { name, ...stats };
  });
}

// ── Download helpers ──────────────────────────────────────────────────────────

function flashSaved(btn) {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = "✓ Saved";
  btn.disabled = true;
  setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
}

function downloadSvg(svgEl, filename) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadPng(svgEl, filename, scale) {
  if (!svgEl) return;
  scale = scale || 2;
  var serializer = new XMLSerializer();
  var svgStr = serializer.serializeToString(svgEl);
  var vb = svgEl.getAttribute("viewBox");
  var parts = vb ? vb.split(/[\s,]+/) : [];
  var w = parts.length >= 4 ? parseFloat(parts[2]) : svgEl.clientWidth || 800;
  var h = parts.length >= 4 ? parseFloat(parts[3]) : svgEl.clientHeight || 600;
  var canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  var img = new Image();
  var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  img.onload = function() {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function(pngBlob) {
      var pngUrl = URL.createObjectURL(pngBlob);
      var a = document.createElement("a");
      a.href = pngUrl; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(pngUrl); }, 1000);
    }, "image/png");
  };
  img.src = url;
}
function downloadCsv(headers, rows, filename) {
  const lines = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
