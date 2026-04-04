// venn.jsx — editable source. Run `npm run build` to compile to venn.js
// Do NOT edit the .js file directly.
const { useState, useReducer, useMemo, useCallback, useRef, forwardRef } = React;

// ── Set Parsing ──────────────────────────────────────────────────────────────

function detectSetFormat(headers, rows) {
  // Long format: exactly 2 columns, col2 has few unique values relative to col1
  if (headers.length === 2) {
    const col0 = new Set(rows.map(r => r[0]).filter(Boolean));
    const col1 = new Set(rows.map(r => r[1]).filter(Boolean));
    if (col1.size <= 20 && col1.size < col0.size * 0.3) return "long";
  }
  return "wide";
}

function parseSetData(headers, rows, format) {
  const sets = new Map();
  if (format === "long") {
    for (const r of rows) {
      const item = (r[0] || "").trim();
      const setName = (r[1] || "").trim();
      if (!item || !setName) continue;
      if (!sets.has(setName)) sets.set(setName, new Set());
      sets.get(setName).add(item);
    }
  } else {
    // Wide: each column is a set
    for (let ci = 0; ci < headers.length; ci++) {
      const s = new Set();
      for (const r of rows) {
        const v = (r[ci] || "").trim();
        if (v) s.add(v);
      }
      if (s.size > 0) sets.set(headers[ci], s);
    }
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}

// ── Set Computation ──────────────────────────────────────────────────────────

function computeIntersections(setNames, sets) {
  const n = setNames.length;
  const membershipMap = new Map(); // item -> bitmask
  setNames.forEach((name, i) => {
    for (const item of sets.get(name)) {
      const prev = membershipMap.get(item) || 0;
      membershipMap.set(item, prev | (1 << i));
    }
  });
  const groups = new Map(); // bitmask -> items[]
  for (const [item, mask] of membershipMap) {
    if (!groups.has(mask)) groups.set(mask, []);
    groups.get(mask).push(item);
  }
  const result = [];
  for (const [mask, items] of groups) {
    const active = setNames.filter((_, i) => mask & (1 << i));
    items.sort();
    result.push({ mask, setNames: active, degree: active.length, items, size: items.length });
  }
  return result.sort((a, b) => b.size - a.size);
}

function regionLabel(setNames, mask, allSetNames) {
  const active = allSetNames.filter((_, i) => mask & (1 << i));
  const inactive = allSetNames.filter((_, i) => !(mask & (1 << i)));
  if (inactive.length === 0) return active.join(" ∩ ");
  return active.join(" ∩ ") + " only";
}

// ── Venn Geometry ────────────────────────────────────────────────────────────

function circleOverlapArea(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  return r1 * r1 * Math.acos(Math.max(-1, Math.min(1, a / r1)))
       + r2 * r2 * Math.acos(Math.max(-1, Math.min(1, (d - a) / r2)))
       - d * h;
}

function solveDistance(r1, r2, targetArea) {
  const maxArea = Math.PI * Math.min(r1, r2) ** 2;
  if (targetArea <= 0) return r1 + r2 + 1;
  if (targetArea >= maxArea) return Math.abs(r1 - r2);
  let lo = Math.abs(r1 - r2), hi = r1 + r2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (circleOverlapArea(r1, r2, mid) > targetArea) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function circleIntersectionPoints(c1, c2) {
  const dx = c2.cx - c1.cx, dy = c2.cy - c1.cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > c1.r + c2.r + 1e-9 || d < Math.abs(c1.r - c2.r) - 1e-9 || d < 1e-9) return null;
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const hSq = Math.max(0, c1.r * c1.r - a * a);
  const h = Math.sqrt(hSq);
  const mx = c1.cx + a * dx / d, my = c1.cy + a * dy / d;
  return [
    { x: mx + h * dy / d, y: my - h * dx / d },
    { x: mx - h * dy / d, y: my + h * dx / d }
  ];
}

function isInsideCircle(px, py, c) {
  const dx = px - c.cx, dy = py - c.cy;
  return dx * dx + dy * dy < c.r * c.r + 1e-6;
}

// Build polyline arc points on a circle from angle a1 to a2 (CCW)
function arcPolyline(cx, cy, r, a1, a2, n) {
  let span = a2 - a1;
  while (span < 0) span += 2 * Math.PI;
  while (span > 2 * Math.PI) span -= 2 * Math.PI;
  const pts = [];
  const steps = n || Math.max(16, Math.round(span / (Math.PI / 32)));
  for (let i = 0; i <= steps; i++) {
    const a = a1 + span * (i / steps);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

// Normalize angle to [0, 2π)
function normAngle(a) { let v = a % (2 * Math.PI); return v < 0 ? v + 2 * Math.PI : v; }

// Build region paths for 2 or 3 circles
function buildRegionPaths(circles) {
  const n = circles.length;

  // 1. Compute all intersection points
  const allPts = []; // { x, y, ci, cj, angles }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pts = circleIntersectionPoints(circles[i], circles[j]);
      if (pts) {
        for (const p of pts) {
          const obj = { x: p.x, y: p.y, ci: i, cj: j, angles: {} };
          obj.angles[i] = normAngle(Math.atan2(p.y - circles[i].cy, p.x - circles[i].cx));
          obj.angles[j] = normAngle(Math.atan2(p.y - circles[j].cy, p.x - circles[j].cx));
          allPts.push(obj);
        }
      }
    }
  }

  // 2. For each circle, sort intersection points by angle and build arcs
  const arcs = []; // { circleIdx, from, to, angleFrom, angleTo, insideMask }
  for (let i = 0; i < n; i++) {
    const pts = allPts.filter(p => p.ci === i || p.cj === i)
      .map(p => ({ ...p, angle: p.angles[i] }))
      .sort((a, b) => a.angle - b.angle);

    if (pts.length === 0) {
      // No intersections — full circle is one region
      const mask = (function() {
        let m = 1 << i;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          if (isInsideCircle(circles[i].cx, circles[i].cy, circles[j])) m |= (1 << j);
        }
        return m;
      })();
      arcs.push({ circleIdx: i, angleFrom: 0, angleTo: 2 * Math.PI, insideMask: mask, full: true, fromPt: null, toPt: null });
      continue;
    }

    for (let k = 0; k < pts.length; k++) {
      const p1 = pts[k], p2 = pts[(k + 1) % pts.length];
      let a1 = p1.angle, a2 = p2.angle;
      if (a2 <= a1) a2 += 2 * Math.PI;
      const midA = (a1 + a2) / 2;
      const midX = circles[i].cx + circles[i].r * Math.cos(midA);
      const midY = circles[i].cy + circles[i].r * Math.sin(midA);
      let mask = 1 << i;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (isInsideCircle(midX, midY, circles[j])) mask |= (1 << j);
      }
      arcs.push({ circleIdx: i, angleFrom: a1, angleTo: a2, insideMask: mask, fromPt: p1, toPt: p2 });
    }
  }

  // 3. Group arcs by region mask
  const regionMap = {};
  for (const arc of arcs) {
    const key = arc.insideMask;
    if (!regionMap[key]) regionMap[key] = [];
    regionMap[key].push(arc);
  }

  // 4. Build SVG path strings for each region
  const regions = {};
  for (const [maskStr, regionArcs] of Object.entries(regionMap)) {
    const mask = Number(maskStr);
    const pathParts = [];
    // Order arcs to form a closed path: each arc's endpoint connects to the next arc's start
    const ordered = orderArcs(regionArcs, circles);
    for (let i = 0; i < ordered.length; i++) {
      const arc = ordered[i];
      const c = circles[arc.circleIdx];
      const pts = arc.full
        ? arcPolyline(c.cx, c.cy, c.r, 0, 2 * Math.PI, 64)
        : arcPolyline(c.cx, c.cy, c.r, arc.angleFrom, arc.angleTo);
      if (i === 0) pathParts.push(`M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`);
      const start = i === 0 ? 1 : 0;
      for (let j = start; j < pts.length; j++) {
        pathParts.push(`L${pts[j].x.toFixed(2)},${pts[j].y.toFixed(2)}`);
      }
    }
    pathParts.push("Z");
    regions[mask] = pathParts.join(" ");
  }

  return regions;
}

function orderArcs(arcs, circles) {
  if (arcs.length <= 1) return arcs;
  const ordered = [arcs[0]];
  const remaining = arcs.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastEnd = last.toPt;
    if (!lastEnd) break;
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const start = remaining[i].fromPt;
      if (!start) continue;
      const d = (start.x - lastEnd.x) ** 2 + (start.y - lastEnd.y) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

// ── Proportional Layout ──────────────────────────────────────────────────────

function buildVenn2Layout(setNames, sets, intersections, viewW, viewH) {
  const s0 = sets.get(setNames[0]).size;
  const s1 = sets.get(setNames[1]).size;
  const inter = intersections.find(g => g.mask === 3);
  const interSize = inter ? inter.size : 0;

  // Scale radii: area proportional to set size
  const maxR = Math.min(viewW, viewH) * 0.38;
  const scale = maxR / Math.sqrt(Math.max(s0, s1));
  const r0 = scale * Math.sqrt(s0);
  const r1 = scale * Math.sqrt(s1);

  // Target overlap area proportional to intersection size (area = π·scale²·size)
  const targetOA = Math.PI * scale * scale * interSize;
  const d = solveDistance(r0, r1, targetOA);

  const cx = viewW / 2, cy = viewH / 2;
  const circles = [
    { cx: cx - d / 2, cy: cy, r: r0 },
    { cx: cx + d / 2, cy: cy, r: r1 }
  ];
  return circles;
}

function buildVenn3Layout(setNames, sets, intersections, viewW, viewH) {
  const sizes = setNames.map(n => sets.get(n).size);
  const maxR = Math.min(viewW, viewH) * 0.32;
  const scale = maxR / Math.sqrt(Math.max(...sizes));
  const radii = sizes.map(s => scale * Math.sqrt(s));

  // Compute pairwise distances
  const pairMasks = [[0, 1, 3], [0, 2, 5], [1, 2, 6]]; // [i, j, mask for both]
  const pairDists = [];
  for (const [i, j, mask] of pairMasks) {
    const inter = intersections.find(g => (g.mask & mask) === mask);
    const interSize = inter ? inter.items.filter(item => {
      // Only count items in BOTH i and j (regardless of third)
      return sets.get(setNames[i]).has(item) && sets.get(setNames[j]).has(item);
    }).length : 0;
    // Actually, we want the TOTAL pairwise overlap (including triple)
    let totalPairwise = 0;
    for (const g of intersections) {
      if ((g.mask & (1 << i)) && (g.mask & (1 << j))) totalPairwise += g.size;
    }
    const targetOA = Math.PI * scale * scale * totalPairwise;
    pairDists.push(solveDistance(radii[i], radii[j], targetOA));
  }

  // Place circles by triangulation
  const cx = viewW / 2, cy = viewH / 2;
  const d01 = pairDists[0], d02 = pairDists[1], d12 = pairDists[2];

  // A at origin, B along x-axis
  const ax = 0, ay = 0;
  const bx = d01, by = 0;
  // C by triangulation from A and B
  let ccx = (d02 * d02 - d12 * d12 + d01 * d01) / (2 * d01);
  let ccySq = d02 * d02 - ccx * ccx;
  let ccy = ccySq > 0 ? Math.sqrt(ccySq) : 0;

  // Center the arrangement
  const pts = [{ x: ax, y: ay }, { x: bx, y: by }, { x: ccx, y: ccy }];
  const centX = (ax + bx + ccx) / 3, centY = (ay + by + ccy) / 3;
  const circles = pts.map((p, i) => ({
    cx: cx + (p.x - centX),
    cy: cy + (p.y - centY),
    r: radii[i]
  }));

  return circles;
}

// ── Region Centroids (for label placement) ───────────────────────────────────

function computeRegionCentroids(circles, regionPaths, intersections) {
  // Sample points inside each region to find a good label position
  const centroids = {};
  const bbox = {
    x1: Math.min(...circles.map(c => c.cx - c.r)) - 5,
    y1: Math.min(...circles.map(c => c.cy - c.r)) - 5,
    x2: Math.max(...circles.map(c => c.cx + c.r)) + 5,
    y2: Math.max(...circles.map(c => c.cy + c.r)) + 5,
  };
  const n = circles.length;
  const step = Math.max((bbox.x2 - bbox.x1), (bbox.y2 - bbox.y1)) / 80;

  for (const inter of intersections) {
    const mask = inter.mask;
    let sx = 0, sy = 0, count = 0;
    for (let x = bbox.x1; x <= bbox.x2; x += step) {
      for (let y = bbox.y1; y <= bbox.y2; y += step) {
        let m = 0;
        for (let i = 0; i < n; i++) {
          if (isInsideCircle(x, y, circles[i])) m |= (1 << i);
        }
        if (m === mask) { sx += x; sy += y; count++; }
      }
    }
    if (count > 0) centroids[mask] = { x: sx / count, y: sy / count };
  }
  return centroids;
}

// ── VennChart SVG ────────────────────────────────────────────────────────────

const VW = 600, VH = 500;

const VennChart = forwardRef(function VennChart({
  setNames, sets, intersections, colors, selectedMask, onRegionClick,
  showCounts, plotTitle, plotBg, fontSize
}, ref) {
  const n = setNames.length;

  const circles = useMemo(() => {
    if (n === 2) return buildVenn2Layout(setNames, sets, intersections, VW, VH);
    return buildVenn3Layout(setNames, sets, intersections, VW, VH);
  }, [setNames, sets, intersections, n]);

  const regionPaths = useMemo(() => buildRegionPaths(circles), [circles]);
  const centroids = useMemo(() => computeRegionCentroids(circles, regionPaths, intersections), [circles, regionPaths, intersections]);

  const interMap = useMemo(() => {
    const m = {};
    for (const g of intersections) m[g.mask] = g;
    return m;
  }, [intersections]);

  // Region colors: blend set colors for intersections
  const regionColors = useMemo(() => {
    const rc = {};
    for (const inter of intersections) {
      const rgbs = inter.setNames.map(name => hexToRgb(colors[name] || PALETTE[setNames.indexOf(name) % PALETTE.length]));
      const avg = { r: 0, g: 0, b: 0 };
      rgbs.forEach(c => { avg.r += c.r; avg.g += c.g; avg.b += c.b; });
      avg.r = Math.round(avg.r / rgbs.length);
      avg.g = Math.round(avg.g / rgbs.length);
      avg.b = Math.round(avg.b / rgbs.length);
      rc[inter.mask] = rgbToHex(avg.r, avg.g, avg.b);
    }
    return rc;
  }, [intersections, colors, setNames]);

  const fSize = fontSize || 14;

  return (
    <svg ref={ref} viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg">
      <rect width={VW} height={VH} fill={plotBg || "#fff"} rx="8" />
      {plotTitle && <text x={VW / 2} y={24} textAnchor="middle" fontSize="16" fontWeight="700" fill="#222" fontFamily="sans-serif">{plotTitle}</text>}

      {/* Circle outlines */}
      {circles.map((c, i) => (
        <circle key={`outline-${i}`} cx={c.cx} cy={c.cy} r={c.r}
          fill="none" stroke={colors[setNames[i]] || PALETTE[i]} strokeWidth="2" strokeOpacity="0.6" />
      ))}

      {/* Region fills */}
      {intersections.map(inter => {
        const path = regionPaths[inter.mask];
        if (!path) return null;
        const isSelected = selectedMask === inter.mask;
        return (
          <path key={`region-${inter.mask}`} d={path}
            fill={regionColors[inter.mask] || "#ccc"}
            fillOpacity={isSelected ? 0.55 : 0.25}
            stroke={isSelected ? "#333" : "none"}
            strokeWidth={isSelected ? 2 : 0}
            style={{ cursor: "pointer" }}
            onClick={() => onRegionClick && onRegionClick(inter.mask)}
            onMouseEnter={e => { e.currentTarget.setAttribute("fill-opacity", "0.45"); }}
            onMouseLeave={e => { e.currentTarget.setAttribute("fill-opacity", isSelected ? "0.55" : "0.25"); }}
          />
        );
      })}

      {/* Count labels */}
      {showCounts && intersections.map(inter => {
        const c = centroids[inter.mask];
        if (!c) return null;
        return (
          <text key={`label-${inter.mask}`} x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central"
            fontSize={fSize} fontWeight="700" fill="#333" fontFamily="sans-serif"
            style={{ pointerEvents: "none" }}>
            {inter.size}
          </text>
        );
      })}

      {/* Set name labels */}
      {circles.map((c, i) => {
        // Position label outside the circle, away from center
        const allCx = circles.reduce((s, cc) => s + cc.cx, 0) / circles.length;
        const allCy = circles.reduce((s, cc) => s + cc.cy, 0) / circles.length;
        const dx = c.cx - allCx, dy = c.cy - allCy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const lx = c.cx + (dx / dist) * (c.r + 18);
        const ly = c.cy + (dy / dist) * (c.r + 18);
        return (
          <text key={`setlabel-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
            fontSize="14" fontWeight="600" fill={colors[setNames[i]] || PALETTE[i]} fontFamily="sans-serif">
            {setNames[i]} ({sets.get(setNames[i]).size})
          </text>
        );
      })}
    </svg>
  );
});

// ── UI Components ────────────────────────────────────────────────────────────

function UploadStep({ sepOverride, setSepOverride, rawText, doParse, handleFileLoad }) {
  return (
    <div>
      <UploadPanel sepOverride={sepOverride} onSepChange={setSepOverride} onFileLoad={handleFileLoad}
        hint="CSV · TSV · TXT — one column per set (wide) or item+set columns (long)" />
      {rawText && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => doParse(rawText, sepOverride)} style={btnPrimary}>Re-parse with new separator</button>
        </div>
      )}
    </div>
  );
}

function ConfigureStep({ fileName, setNames, sets, intersections, setColors, onColorChange, formatOverride, setFormatOverride, setStep, rawText, doParse, sepOverride }) {
  const totalUnion = useMemo(() => {
    const all = new Set();
    for (const s of sets.values()) for (const item of s) all.add(item);
    return all.size;
  }, [sets]);

  return (
    <div>
      <div style={sec}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" }}>
          Loaded <strong style={{ color: "#333" }}>{fileName}</strong> — {setNames.length} sets, {totalUnion} unique items
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {setNames.map((name, i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
              background: "#f0f0f5", borderRadius: 6, border: "1px solid #ddd" }}>
              <ColorInput value={setColors[name] || PALETTE[i % PALETTE.length]}
                onChange={v => onColorChange(name, v)} size={22} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#333", flex: 1 }}>{name}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{sets.get(name).size} items</span>
            </div>
          ))}
        </div>
      </div>

      <div style={sec}>
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#555" }}>Format detection</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={formatOverride} onChange={e => {
            setFormatOverride(e.target.value);
            if (rawText) doParse(rawText, sepOverride, e.target.value);
          }} style={selStyle}>
            <option value="">Auto-detect</option>
            <option value="wide">Wide (columns = sets)</option>
            <option value="long">Long (item + set columns)</option>
          </select>
        </div>
      </div>

      <button onClick={() => setStep("plot")} style={btnPrimary}>Plot →</button>
    </div>
  );
}

function IntersectionTable({ intersections, allSetNames, selectedMask, onSelect }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 700 }}>Region</th>
            <th style={{ padding: "6px 10px", textAlign: "center", color: "#555", fontWeight: 700 }}>Degree</th>
            <th style={{ padding: "6px 10px", textAlign: "right", color: "#555", fontWeight: 700 }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {intersections.map(inter => (
            <tr key={inter.mask} onClick={() => onSelect(inter.mask)}
              style={{ borderBottom: "1px solid #eee", cursor: "pointer",
                background: selectedMask === inter.mask ? "#e8f0fe" : "transparent" }}>
              <td style={{ padding: "6px 10px", color: "#333", fontWeight: 500 }}>
                {regionLabel(inter.setNames, inter.mask, allSetNames)}
              </td>
              <td style={{ padding: "6px 10px", textAlign: "center", color: "#888" }}>{inter.degree}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", color: "#648FFF", fontWeight: 700, fontFamily: "monospace" }}>{inter.size}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemListPanel({ intersection, allSetNames, setColors }) {
  if (!intersection) return (
    <div style={{ padding: "30px 20px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
      Click a region in the Venn diagram or a row in the table to view items.
    </div>
  );
  const label = regionLabel(intersection.setNames, intersection.mask, allSetNames);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#333" }}>
          {label} <span style={{ color: "#888", fontWeight: 400 }}>({intersection.size} items)</span>
        </p>
        <button onClick={() => {
          downloadCsv(["Item"], intersection.items.map(i => [i]), `venn_${label.replace(/[^a-zA-Z0-9]/g, "_")}.csv`);
        }} style={{ ...btnSecondary, background: "#dcfce7", border: "1px solid #86efac", color: "#166534", fontWeight: 600, fontSize: 11 }}>
          ⬇ CSV
        </button>
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: 6, background: "#fafafa" }}>
        {intersection.items.map((item, i) => (
          <div key={i} style={{ padding: "3px 10px", fontSize: 12, color: "#333", borderBottom: "1px solid #f0f0f0",
            fontFamily: "monospace" }}>{item}</div>
        ))}
      </div>
    </div>
  );
}

function PlotControls({ setNames, sets, setColors, onColorChange, vis, updVis, chartRef, resetAll, intersections }) {
  const sv = k => v => updVis({ [k]: v });
  return (
    <div style={{ width: 300, flexShrink: 0, position: "sticky", top: 24, maxHeight: "calc(100vh - 90px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <ActionsPanel
        onDownloadSvg={() => downloadSvg(chartRef.current, "venn.svg")}
        onDownloadPng={() => downloadPng(chartRef.current, "venn.png", 2)}
        onReset={resetAll}
        extraButtons={[
          { label: "⬇ All items CSV", onClick: (e) => {
            const allItems = new Set();
            for (const s of sets.values()) for (const item of s) allItems.add(item);
            const headers = ["Item", ...setNames];
            const rows = [...allItems].sort().map(item => [item, ...setNames.map(n => sets.get(n).has(item) ? "1" : "0")]);
            downloadCsv(headers, rows, "venn_membership.csv");
            flashSaved(e.currentTarget);
          }, style: { ...btnSecondary, background: "#dcfce7", border: "1px solid #86efac", color: "#166534", width: "100%", fontWeight: 600 } }
        ]}
      />

      <div style={sec}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" }}>Sets</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {setNames.map((name, i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
              borderRadius: 6, fontSize: 12, background: "#f0f0f5", border: "1px solid #ccc" }}>
              <ColorInput value={setColors[name] || PALETTE[i % PALETTE.length]}
                onChange={v => onColorChange(name, v)} size={20} />
              <span style={{ flex: 1, fontWeight: 600, color: "#333" }}>{name}</span>
              <span style={{ color: "#999", fontSize: 11 }}>({sets.get(name).size})</span>
            </div>
          ))}
        </div>
      </div>

      <div style={sec}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" }}>Display</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>Show counts</span>
            <input type="checkbox" checked={vis.showCounts} onChange={e => updVis({ showCounts: e.target.checked })} style={{ accentColor: "#648FFF" }} />
          </div>
          <div><div style={lbl}>Title</div><input value={vis.plotTitle} onChange={e => updVis({ plotTitle: e.target.value })} style={{ ...inp, width: "100%" }} /></div>
          <SliderControl label="Font size" value={vis.fontSize} min={8} max={24} step={1} onChange={sv("fontSize")} />
          <BaseStyleControls plotBg={vis.plotBg} onPlotBgChange={sv("plotBg")} showGrid={false} onShowGridChange={() => {}} gridColor="#e0e0e0" onGridColorChange={() => {}} />
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [rawText, setRawText] = useState(null);
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState(null);
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [formatOverride, setFormatOverride] = useState("");

  const [setNames, setSetNames] = useState([]);
  const [sets, setSets] = useState(new Map());
  const [setColors, setSetColors] = useState({});
  const [selectedMask, setSelectedMask] = useState(null);

  const visInit = { plotTitle: "", plotBg: "#ffffff", showCounts: true, fontSize: 14 };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);

  const chartRef = useRef();

  const intersections = useMemo(() => {
    if (setNames.length < 2) return [];
    return computeIntersections(setNames, sets);
  }, [setNames, sets]);

  const canNavigate = useCallback(target => {
    if (target === "upload") return true;
    if (target === "configure") return setNames.length >= 2;
    if (target === "plot") return setNames.length >= 2;
    return false;
  }, [setNames]);

  const doParse = useCallback((text, sep, fmtOverride) => {
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed); setCommaFixCount(dc.count);
    setRawText(dc.text);
    const { headers, rows } = parseRaw(dc.text, sep);
    if (!headers.length || !rows.length) { setParseError("The file appears to be empty or has no data rows."); return; }

    const fmt = fmtOverride || detectSetFormat(headers, rows);
    const { setNames: sn, sets: ss } = parseSetData(headers, rows, fmt);

    if (sn.length < 2) { setParseError("Need at least 2 sets. Check your data format."); return; }
    if (sn.length > 3) { setParseError(`Detected ${sn.length} sets — this tool supports 2–3 sets. For more sets, UpSet plot support is coming soon.`); return; }

    setParseError(null);
    setSetNames(sn);
    setSets(ss);
    // Initialize colors
    const cols = {};
    sn.forEach((n, i) => { cols[n] = PALETTE[i % PALETTE.length]; });
    setSetColors(cols);
    setSelectedMask(null);
    setStep("configure");
  }, []);

  const handleFileLoad = useCallback((text, name) => {
    setFileName(name);
    doParse(text, sepOverride, formatOverride || undefined);
  }, [sepOverride, formatOverride, doParse]);

  const handleColorChange = (name, color) => {
    setSetColors(prev => ({ ...prev, [name]: color }));
  };

  const resetAll = () => {
    setStep("upload"); setRawText(null); setFileName(""); setSetNames([]); setSets(new Map());
    setSetColors({}); setParseError(null); setSelectedMask(null); updVis({ _reset: true });
  };

  const selectedIntersection = intersections.find(g => g.mask === selectedMask) || null;

  return (
    <div style={{ padding: "20px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader toolName="venn" title="Venn Diagram"
        subtitle="Area-proportional set overlaps with data extraction" />

      <StepNavBar steps={["upload", "configure", "plot"]} currentStep={step}
        onStepChange={setStep} canNavigate={canNavigate} />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      {parseError && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8,
          background: "#fef2f2", border: "1px solid #fca5a5",
          display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🚫</span>
          <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, whiteSpace: "pre-line" }}>{parseError}</span>
        </div>
      )}

      {step === "upload" && (
        <UploadStep sepOverride={sepOverride} setSepOverride={setSepOverride}
          rawText={rawText} doParse={doParse} handleFileLoad={handleFileLoad} />
      )}

      {step === "configure" && setNames.length >= 2 && (
        <ConfigureStep fileName={fileName} setNames={setNames} sets={sets}
          intersections={intersections} setColors={setColors} onColorChange={handleColorChange}
          formatOverride={formatOverride} setFormatOverride={setFormatOverride}
          setStep={setStep} rawText={rawText} doParse={doParse} sepOverride={sepOverride} />
      )}

      {step === "plot" && setNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <button onClick={() => setStep("configure")} style={btnSecondary}>← Configure</button>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls setNames={setNames} sets={sets} setColors={setColors}
              onColorChange={handleColorChange} vis={vis} updVis={updVis}
              chartRef={chartRef} resetAll={resetAll} intersections={intersections} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...sec, padding: 20, background: "#fff" }}>
                <VennChart ref={chartRef} setNames={setNames} sets={sets}
                  intersections={intersections} colors={setColors}
                  selectedMask={selectedMask} onRegionClick={setSelectedMask}
                  showCounts={vis.showCounts} plotTitle={vis.plotTitle}
                  plotBg={vis.plotBg} fontSize={vis.fontSize} />
              </div>

              {/* Data extraction panel */}
              <div style={{ ...sec, marginTop: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" }}>Intersections</p>
                <IntersectionTable intersections={intersections} allSetNames={setNames}
                  selectedMask={selectedMask} onSelect={setSelectedMask} />
              </div>
              <div style={{ ...sec, marginTop: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" }}>Items</p>
                <ItemListPanel intersection={selectedIntersection} allSetNames={setNames} setColors={setColors} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
