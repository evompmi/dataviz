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
function downloadCsv(headers, rows, filename) {
  const lines = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
