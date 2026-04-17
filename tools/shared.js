// ── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
function shadeColor(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  if (factor > 0)
    return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
  return rgbToHex(r * (1 + factor), g * (1 + factor), b * (1 + factor));
}
function getPointColors(baseColor, nSources) {
  if (nSources <= 1) return [baseColor];
  const colors = [];
  for (let i = 0; i < nSources; i++) {
    const t = nSources === 1 ? 0 : Math.min(1, i / (nSources - 1));
    colors.push(shadeColor(baseColor, -0.4 + t * 0.7));
  }
  return colors;
}

// ── Color palette ─────────────────────────────────────────────────────────────

// Okabe-Ito colorblind-safe palette (Wong 2011, Nature Methods)
const PALETTE = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#000000",
  "#88CCEE",
  "#AA4499",
];

// ── Tool icons (raw SVG strings) ─────────────────────────────────────────────

const TOOL_ICONS = {
  aequorin:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 36 C8 36, 10 36, 12 34 C14 30, 15 8, 17 6 C19 4, 20 14, 22 22 C24 28, 25 32, 27 34 C29 36, 32 36, 40 36"/></svg>',
  boxplot:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="4" x2="22" y2="12"/><rect x="14" y="12" width="16" height="18" rx="2"/><line x1="14" y1="22" x2="30" y2="22"/><line x1="22" y1="30" x2="22" y2="40"/></svg>',
  scatter:
    '<svg viewBox="0 0 44 44" fill="#648FFF" stroke="none"><circle cx="10" cy="30" r="3"/><circle cx="16" cy="22" r="2.5"/><circle cx="24" cy="26" r="3.5"/><circle cx="20" cy="14" r="2"/><circle cx="32" cy="18" r="3"/><circle cx="36" cy="10" r="2.5"/><circle cx="28" cy="32" r="2"/></svg>',
  venn: '<svg viewBox="0 0 44 44" fill="none" stroke-width="1.5"><circle cx="16" cy="20" r="12" stroke="#648FFF" fill="rgba(100,143,255,0.12)"/><circle cx="28" cy="20" r="12" stroke="#785EF0" fill="rgba(120,94,240,0.12)"/></svg>',
  molarity:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2.5" stroke-linecap="round"><line x1="8" y1="10" x2="18" y2="10"/><line x1="13" y1="5" x2="13" y2="15"/><line x1="26" y1="10" x2="36" y2="10"/><line x1="8" y1="30" x2="18" y2="30"/><circle cx="13" cy="25" r="1.5" fill="#648FFF" stroke="none"/><circle cx="13" cy="35" r="1.5" fill="#648FFF" stroke="none"/><line x1="28" y1="27" x2="34" y2="33"/><line x1="34" y1="27" x2="28" y2="33"/></svg>',
  power:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="38" x2="6" y2="6"/><line x1="6" y1="38" x2="38" y2="38"/><path d="M8 34 C12 33, 16 28, 20 20 C24 12, 28 8, 36 7" stroke="#648FFF" stroke-width="2.5"/><line x1="6" y1="14" x2="38" y2="14" stroke-dasharray="3,3" stroke-width="1" opacity="0.5"/></svg>',
  lineplot:
    '<svg viewBox="0 0 44 44" fill="none" stroke="#648FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,34 16,24 26,28 36,12"/><circle cx="6" cy="34" r="2.5" fill="#648FFF"/><circle cx="16" cy="24" r="2.5" fill="#648FFF"/><circle cx="26" cy="28" r="2.5" fill="#648FFF"/><circle cx="36" cy="12" r="2.5" fill="#648FFF"/></svg>',
};

function toolIcon(name, size, opts) {
  size = size || 22;
  opts = opts || {};
  if (!TOOL_ICONS[name]) return null;
  const svg = TOOL_ICONS[name].replace("<svg ", '<svg width="' + size + '" height="' + size + '" ');
  const pad = Math.round(size * 0.3);
  const outerSize = size + pad * 2;
  if (opts.circle) {
    return React.createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: outerSize,
          height: outerSize,
          borderRadius: "50%",
          background: "#fff",
          flexShrink: 0,
          verticalAlign: "middle",
          marginRight: 6,
          lineHeight: 0,
        },
      },
      React.createElement("span", {
        dangerouslySetInnerHTML: { __html: svg },
        style: { display: "inline-block", lineHeight: 0 },
      })
    );
  }
  return React.createElement("span", {
    dangerouslySetInnerHTML: { __html: svg },
    style: { display: "inline-block", verticalAlign: "middle", marginRight: 6, lineHeight: 0 },
  });
}

// ── Role colours ────────────────────────────────────────────────────────────
// The old inline-style constants (sec/inp/inpN/lbl/btn*/selStyle/sepSelect)
// have been retired — chrome elements use the `dv-*` classes declared in
// `components.css` instead (see CLAUDE.md Theming section).
//
// Okabe-Ito hues: saturated enough to work on both light and dark chrome.
// Only `ignore` becomes theme-aware since it was a neutral gray.
const roleColors = {
  group: "#0072B2",
  value: "#009E73",
  filter: "#E69F00",
  text: "#CC79A7",
  ignore: "var(--border-strong)",
};

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
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ── Example dataset (long format, used by group plot "Load example") ──
// Arabidopsis biomass × 3 genotypes × 3 treatments × 8 replicates = 72 rows.
// Effects are tuned so k=3 ANOVA + Tukey is meaningful, facet-by-Treatment works,
// and group colors / filters / renames all have something interesting to show.
function makeExamplePlantCSV() {
  const rng = seededRandom(42);
  // Box–Muller standard normal from the seeded uniform RNG.
  const norm = () => {
    const u = Math.max(rng(), 1e-9);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const genotypes = [
    { name: "WT", base: 100 },
    { name: "abi4", base: 96 },
    { name: "oxSOS1", base: 128 },
  ];
  const treatments = [
    { name: "control", delta: 0, sd: 8 },
    { name: "drought", delta: -24, sd: 10 },
    { name: "salt", delta: -5, sd: 9 },
  ];
  const lines = ["Genotype,Treatment,Replicate,Biomass_mg"];
  for (const g of genotypes) {
    for (const t of treatments) {
      for (let r = 1; r <= 8; r++) {
        const v = g.base + t.delta + norm() * t.sd;
        lines.push(`${g.name},${t.name},${r},${v.toFixed(1)}`);
      }
    }
  }
  return lines.join("\n");
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
  for (let v = start; v <= max + step * 0.001; v += step) {
    const tick = parseFloat(v.toPrecision(10));
    if (tick <= max + step * 1e-9) ticks.push(tick);
  }
  return ticks;
}
function makeLogTicks(dataMin, dataMax, base) {
  if (!isFinite(dataMin) || dataMin <= 0) dataMin = base === 2 ? 0.5 : 0.1;
  if (!isFinite(dataMax) || dataMax <= dataMin) dataMax = dataMin * 1000;
  const logFn = base === 2 ? Math.log2 : base === 10 ? Math.log10 : Math.log;
  const logMin = Math.floor(logFn(dataMin));
  const logMax = Math.ceil(logFn(dataMax));
  const decades = logMax - logMin;
  const ticks = [];
  for (let exp = logMin; exp <= logMax; exp++) {
    const v = Math.pow(base, exp);
    if (v >= dataMin * 0.99 && v <= dataMax * 1.01) ticks.push({ value: v, major: true });
    if (base === 10) {
      const muls = [2, 3, 4, 5, 6, 7, 8, 9];
      for (const mul of muls) {
        const sv = mul * Math.pow(base, exp);
        if (sv >= dataMin * 0.99 && sv <= dataMax * 1.01) ticks.push({ value: sv, major: false });
      }
    } else if (base === 2 && decades <= 8) {
      const mid = Math.pow(base, exp) * 1.5;
      if (mid >= dataMin * 0.99 && mid <= dataMax * 1.01) ticks.push({ value: mid, major: false });
    }
  }
  ticks.sort((a, b) => a.value - b.value);
  return ticks;
}

// ── Separator detection ───────────────────────────────────────────────────────

function autoDetectSep(text, override = "") {
  if (override !== "") return override;
  const h = text.slice(0, 2000);
  const t = (h.match(/\t/g) || []).length,
    s = (h.match(/;/g) || []).length,
    c = (h.match(/,/g) || []).length;
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
      s = (h.match(/;/g) || []).length,
      c = (h.match(/,/g) || []).length;
    if (c >= s && c >= t) return { text, commaFixed: false, count: 0 };
  }
  let count = 0;
  const fixed = text.replace(/(\d),(\d)/g, (_, a, b) => {
    count++;
    return `${a}.${b}`;
  });
  return { text: fixed, commaFixed: count > 0, count };
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function detectHeader(rows) {
  if (rows.length < 2) return true;
  const a = rows[0].filter((v) => !isNumericValue(v) && v.trim() !== "").length;
  const b = rows[1].filter((v) => !isNumericValue(v) && v.trim() !== "").length;
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
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 1) return { headers: [], rows: [], hasHeader: false };
  const all = lines.map((l) => l.split(sep).map((v) => v.trim().replace(/^"|"$/g, "")));
  if (all.length === 0) return { headers: [], rows: [], hasHeader: false };
  const mx = Math.max(...all.map((r) => r.length));
  const pad = all.map((r) => {
    while (r.length < mx) r.push("");
    return r;
  });
  const hh = detectHeader(pad);
  if (hh) return { headers: pad[0], rows: pad.slice(1), hasHeader: true };
  return { headers: pad[0].map((_, i) => `Col_${i + 1}`), rows: pad, hasHeader: false };
}

function guessColumnType(vals) {
  const ne = vals.filter((v) => v != null && v !== "");
  if (ne.length === 0) return "ignore";
  if (ne.filter((v) => isNumericValue(v)).length / ne.length > 0.8) return "value";
  const u = new Set(ne);
  if (u.size <= 20 && u.size < ne.length * 0.5) return "group";
  return "text";
}

function detectWideFormat(headers, rows) {
  if (headers.length < 2 || rows.length < 2) return false;
  const numericCols = headers.map((_, ci) => {
    const vals = rows.map((r) => r[ci]).filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.8;
  });
  return numericCols.every(Boolean);
}

// ── Unified data parsing ─────────────────────────────────────────────────────

function parseData(text, sepOv = "") {
  const sep = autoDetectSep(text, sepOv);
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) return { headers: [], data: [], rawData: [] };
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const nCols = headers.length;
  const data = [],
    rawData = [];
  for (let i = 1; i < lines.length; i++) {
    const rawVals = lines[i].split(sep).map((v) => v.trim().replace(/^"|"$/g, ""));
    while (rawVals.length < nCols) rawVals.push("");
    if (rawVals.every((v) => v === "")) continue;
    data.push(rawVals.map((s) => (isNumericValue(s) ? Number(s) : null)));
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
  rows.forEach((r) => {
    headers.forEach((h, ci) => {
      if (r[ci] !== "" && isNumericValue(r[ci])) longRows.push([h, r[ci]]);
    });
  });
  return { headers: ["Group", "Value"], rows: longRows };
}

function reshapeWide(rows, gi, vi) {
  const g = {};
  rows.forEach((r) => {
    const k = r[gi] || "?";
    if (!g[k]) g[k] = [];
    g[k].push(r[vi]);
  });
  const vals = Object.values(g);
  if (vals.length === 0) return { headers: [], rows: [] };
  const mx = Math.max(...vals.map((v) => v.length));
  const names = Object.keys(g);
  const w = [];
  for (let i = 0; i < mx; i++) w.push(names.map((n) => (g[n][i] != null ? g[n][i] : "")));
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
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  return { mean, sd, sem, n, min, max, median };
}

function quartiles(arr) {
  const s = [...arr].sort((a, b) => a - b),
    n = s.length;
  if (n === 0) return null;
  const q = (p) => {
    const i = p * (n - 1),
      lo = Math.floor(i),
      hi = Math.min(Math.ceil(i), n - 1);
    return lo === hi ? s[lo] : s[lo] * (hi - i) + s[hi] * (i - lo);
  };
  const q1 = q(0.25),
    med = q(0.5),
    q3 = q(0.75),
    iqr = q3 - q1;
  return {
    min: s[0],
    max: s[n - 1],
    q1,
    med,
    q3,
    iqr,
    wLo: Math.min(s.find((v) => v >= q1 - 1.5 * iqr) ?? s[0], q1),
    wHi: Math.max([...s].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? s[n - 1], q3),
    n,
  };
}

function kde(values, nPoints = 50) {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0],
    max = sorted[n - 1];
  const iqr = n >= 4 ? sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)] : max - min;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const bw = 1.06 * Math.min(std, (iqr || 1) / 1.34) * n ** -0.2 || 1;
  const pad = bw * 2;
  const lo = min - pad,
    hi = max + pad;
  const step = (hi - lo) / (nPoints - 1);
  const pts = [];
  for (let i = 0; i < nPoints; i++) {
    const x = lo + i * step;
    let density = 0;
    for (let j = 0; j < n; j++) {
      const z = (x - values[j]) / bw;
      density += Math.exp(-0.5 * z * z);
    }
    density /= n * bw * Math.sqrt(2 * Math.PI);
    pts.push({ x, d: density });
  }
  return pts;
}

function computeGroupStats(groups) {
  return Object.entries(groups).map(([name, vals]) => {
    const nums = vals.filter((v) => v !== "" && isNumericValue(v)).map(Number);
    const stats = computeStats(nums);
    if (!stats)
      return { name, n: 0, mean: null, sd: null, sem: null, min: null, max: null, median: null };
    return { name, ...stats };
  });
}

// ── Download helpers ──────────────────────────────────────────────────────────

// Sanitize an arbitrary string into an SVG-safe id fragment so exported
// <g id="..."> values are valid NCNames and show up as readable group names
// in Inkscape's Objects panel / XML editor. Non-alphanumerics become hyphens,
// runs are collapsed, edges trimmed, and a leading digit is prefixed with "_".
function svgSafeId(s) {
  if (s == null) return "unnamed";
  const cleaned = String(s)
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) return "unnamed";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : "_" + cleaned;
}

function fileBaseName(fileName, fallback) {
  if (typeof fileName === "string" && fileName.trim()) return fileName.replace(/\.[^.]+$/, "");
  return fallback || "data";
}

function flashSaved(btn) {
  if (!btn) return;
  const original = btn.innerHTML;
  btn.innerHTML = "✓ Saved";
  btn.disabled = true;
  setTimeout(() => {
    btn.innerHTML = original;
    btn.disabled = false;
  }, 1500);
}

function downloadSvg(svgEl, filename) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadPng(svgEl, filename, scale) {
  if (!svgEl) return;
  scale = scale || 2;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const vb = svgEl.getAttribute("viewBox");
  const parts = vb ? vb.split(/[\s,]+/) : [];
  const w = parts.length >= 4 ? parseFloat(parts[2]) : svgEl.clientWidth || 800;
  const h = parts.length >= 4 ? parseFloat(parts[3]) : svgEl.clientHeight || 600;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  img.onload = function () {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(function (pngBlob) {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () {
        URL.revokeObjectURL(pngUrl);
      }, 1000);
    }, "image/png");
  };
  img.src = url;
}
function downloadText(text, filename) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv(headers, rows, filename) {
  const lines = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
