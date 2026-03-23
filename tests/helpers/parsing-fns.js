// Pure parsing functions extracted from bargraph.html / boxplot.html.
// These must stay in sync with the source files — they are intentionally
// kept here as plain CJS so they can be unit-tested without a browser/Babel.
//
// SOURCE: tools/bargraph.html, lines 29-32 (inside <script type="text/babel">)

const { autoDetectSep } = require("./shared-loader");

function detectHeader(rows) {
  if (rows.length < 2) return true;
  const a = rows[0].filter(v => isNaN(Number(v)) && v.trim() !== "").length;
  const b = rows[1].filter(v => isNaN(Number(v)) && v.trim() !== "").length;
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
  const mx = Math.max(...all.map(r => r.length));
  const pad = all.map(r => { while (r.length < mx) r.push(""); return r; });
  const hh = detectHeader(pad);
  if (hh) return { headers: pad[0], rows: pad.slice(1), hasHeader: true };
  return { headers: pad[0].map((_, i) => `Col_${i + 1}`), rows: pad, hasHeader: false };
}

function guessColumnType(vals) {
  const ne = vals.filter(v => v !== "");
  if (ne.length === 0) return "ignore";
  if (ne.filter(v => !isNaN(Number(v))).length / ne.length > 0.8) return "value";
  const u = new Set(ne);
  if (u.size <= 20 && u.size < ne.length * 0.5) return "group";
  return "text";
}

function detectWideFormat(headers, rows) {
  if (headers.length < 2 || rows.length < 2) return false;
  const numericCols = headers.map((_, ci) => {
    const vals = rows.map(r => r[ci]).filter(v => v !== "");
    return vals.length > 0 && vals.filter(v => !isNaN(Number(v))).length / vals.length > 0.8;
  });
  return numericCols.every(Boolean);
}

module.exports = { detectHeader, parseRaw, guessColumnType, detectWideFormat };
