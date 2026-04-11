const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef } = React;
function parseSetData(headers, rows) {
  const sets = /* @__PURE__ */ new Map();
  for (let ci = 0; ci < headers.length; ci++) {
    const s = /* @__PURE__ */ new Set();
    for (const r of rows) {
      const v = (r[ci] || "").trim();
      if (v) s.add(v);
    }
    if (s.size > 0) sets.set(headers[ci], s);
  }
  const setNames = [...sets.keys()];
  return { setNames, sets };
}
function computeIntersections(setNames, sets) {
  const n = setNames.length;
  const membershipMap = /* @__PURE__ */ new Map();
  setNames.forEach((name, i) => {
    for (const item of sets.get(name)) {
      const prev = membershipMap.get(item) || 0;
      membershipMap.set(item, prev | 1 << i);
    }
  });
  const groups = /* @__PURE__ */ new Map();
  for (const [item, mask] of membershipMap) {
    if (!groups.has(mask)) groups.set(mask, []);
    groups.get(mask).push(item);
  }
  const result = [];
  const totalMasks = (1 << n) - 1;
  for (let mask = 1; mask <= totalMasks; mask++) {
    const items = groups.has(mask) ? groups.get(mask) : [];
    items.sort();
    const active = setNames.filter((_, i) => mask & 1 << i);
    result.push({ mask, setNames: active, degree: active.length, items, size: items.length });
  }
  return result.sort((a, b) => b.size - a.size);
}
function regionLabel(setNames, mask, allSetNames) {
  const active = allSetNames.filter((_, i) => mask & 1 << i);
  const inactive = allSetNames.filter((_, i) => !(mask & 1 << i));
  if (inactive.length === 0) return active.join(" \u2229 ");
  return active.join(" \u2229 ") + " only";
}
function circleOverlapArea(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  return r1 * r1 * Math.acos(Math.max(-1, Math.min(1, a / r1))) + r2 * r2 * Math.acos(Math.max(-1, Math.min(1, (d - a) / r2))) - d * h;
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
function normAngle(a) {
  let v = a % (2 * Math.PI);
  return v < 0 ? v + 2 * Math.PI : v;
}
function buildRegionPaths(circles) {
  const n = circles.length;
  const allPts = [];
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
  const arcs = [];
  for (let i = 0; i < n; i++) {
    const pts = allPts.filter((p) => p.ci === i || p.cj === i).map((p) => ({ ...p, angle: p.angles[i] })).sort((a, b) => a.angle - b.angle);
    if (pts.length === 0) {
      const mask = (function() {
        let m = 1 << i;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = circles[i].cx - circles[j].cx, dy = circles[i].cy - circles[j].cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist + circles[i].r <= circles[j].r + 1e-6) m |= 1 << j;
        }
        return m;
      })();
      arcs.push({
        circleIdx: i,
        angleFrom: 0,
        angleTo: 2 * Math.PI,
        insideMask: mask,
        full: true,
        fromPt: null,
        toPt: null
      });
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
        if (isInsideCircle(midX, midY, circles[j])) mask |= 1 << j;
      }
      arcs.push({
        circleIdx: i,
        angleFrom: a1,
        angleTo: a2,
        insideMask: mask,
        fromPt: p1,
        toPt: p2
      });
    }
  }
  const allMasks = /* @__PURE__ */ new Set();
  for (const arc of arcs) {
    allMasks.add(arc.insideMask);
    allMasks.add(arc.insideMask ^ 1 << arc.circleIdx);
  }
  const regions = {};
  for (const R of allMasks) {
    let emitArc2 = function(ba) {
      const c = circles[ba.circleIdx], r = c.r;
      const endX = c.cx + r * Math.cos(ba.angleTo);
      const endY = c.cy + r * Math.sin(ba.angleTo);
      let span = ba.angleTo - ba.angleFrom;
      while (span < 0) span += 2 * Math.PI;
      while (span > 2 * Math.PI) span -= 2 * Math.PI;
      if (ba.reversed) {
        const revSpan = 2 * Math.PI - span;
        const largeArc = revSpan > Math.PI ? 1 : 0;
        pathParts.push(
          `A${r.toFixed(2)},${r.toFixed(2)} 0 ${largeArc},0 ${endX.toFixed(2)},${endY.toFixed(2)}`
        );
      } else {
        const largeArc = span > Math.PI ? 1 : 0;
        pathParts.push(
          `A${r.toFixed(2)},${r.toFixed(2)} 0 ${largeArc},1 ${endX.toFixed(2)},${endY.toFixed(2)}`
        );
      }
    };
    var emitArc = emitArc2;
    if (R <= 0) continue;
    const fullCircleArcs = [];
    const partialArcs = [];
    for (const arc of arcs) {
      const outsideMask = arc.insideMask ^ 1 << arc.circleIdx;
      if (arc.insideMask === R) {
        if (arc.full) fullCircleArcs.push({ circleIdx: arc.circleIdx, reversed: false });
        else partialArcs.push({ ...arc, reversed: false });
      } else if (outsideMask === R) {
        if (arc.full) fullCircleArcs.push({ circleIdx: arc.circleIdx, reversed: true });
        else
          partialArcs.push({
            circleIdx: arc.circleIdx,
            angleFrom: arc.angleTo,
            angleTo: arc.angleFrom,
            fromPt: arc.toPt,
            toPt: arc.fromPt,
            full: false,
            reversed: true
          });
      }
    }
    if (fullCircleArcs.length === 0 && partialArcs.length === 0) continue;
    const chains = [];
    const used = /* @__PURE__ */ new Set();
    for (let start = 0; start < partialArcs.length; start++) {
      if (used.has(start)) continue;
      const chain = [partialArcs[start]];
      used.add(start);
      for (let safety = 0; safety < partialArcs.length; safety++) {
        const lastEnd = chain[chain.length - 1].toPt;
        if (!lastEnd) break;
        let bestIdx = -1, bestDist = Infinity;
        for (let i = 0; i < partialArcs.length; i++) {
          if (used.has(i)) continue;
          const s = partialArcs[i].fromPt;
          if (!s) continue;
          const d = (s.x - lastEnd.x) ** 2 + (s.y - lastEnd.y) ** 2;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        if (bestIdx === -1 || bestDist > 4) break;
        chain.push(partialArcs[bestIdx]);
        used.add(bestIdx);
      }
      chains.push(chain);
    }
    const pathParts = [];
    for (const chain of chains) {
      const first = chain[0], c0 = circles[first.circleIdx];
      const sx = c0.cx + c0.r * Math.cos(first.angleFrom);
      const sy = c0.cy + c0.r * Math.sin(first.angleFrom);
      pathParts.push(`M${sx.toFixed(2)},${sy.toFixed(2)}`);
      for (const ba of chain) emitArc2(ba);
      pathParts.push("Z");
    }
    for (const fc of fullCircleArcs) {
      const c = circles[fc.circleIdx], r = c.r;
      const x1 = c.cx - r, y1 = c.cy, x2 = c.cx + r, y2 = c.cy;
      const sw = fc.reversed ? 0 : 1;
      pathParts.push(`M${x1.toFixed(2)},${y1.toFixed(2)}`);
      pathParts.push(
        `A${r.toFixed(2)},${r.toFixed(2)} 0 1,${sw} ${x2.toFixed(2)},${y2.toFixed(2)}`
      );
      pathParts.push(
        `A${r.toFixed(2)},${r.toFixed(2)} 0 1,${sw} ${x1.toFixed(2)},${y1.toFixed(2)}`
      );
      pathParts.push("Z");
    }
    if (pathParts.length > 0) regions[R] = pathParts.join(" ");
  }
  return regions;
}
function detectSubsets(setNames, sets) {
  const n = setNames.length;
  const subsets = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const si = sets.get(setNames[i]), sj = sets.get(setNames[j]);
      let allIn = true;
      for (const item of si) {
        if (!sj.has(item)) {
          allIn = false;
          break;
        }
      }
      if (allIn) subsets.push({ sub: i, sup: j });
    }
  }
  return subsets;
}
function detectDisjoint(setNames, sets) {
  const n = setNames.length;
  const disjoint = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = sets.get(setNames[i]), sj = sets.get(setNames[j]);
      let hasOverlap = false;
      for (const item of si) {
        if (sj.has(item)) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) disjoint.push([i, j]);
    }
  }
  return disjoint;
}
function validateAndFixLayout(circles, setNames, sets, subsets, disjoint) {
  const warnings = [];
  const fixed = circles.map((c) => ({ ...c }));
  function enforceSubsets() {
    for (const { sub, sup } of subsets) {
      const dx = fixed[sub].cx - fixed[sup].cx;
      const dy = fixed[sub].cy - fixed[sup].cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = fixed[sup].r - fixed[sub].r - 3;
      if (maxDist <= 0) continue;
      if (dist > maxDist) {
        const target = maxDist * 0.8;
        const scale = target / Math.max(dist, 1e-9);
        fixed[sub].cx = fixed[sup].cx + dx * scale;
        fixed[sub].cy = fixed[sup].cy + dy * scale;
        return true;
      }
    }
    return false;
  }
  if (enforceSubsets()) {
    warnings.push(
      ...subsets.map(
        ({ sub, sup }) => `"${setNames[sub]}" is a subset of "${setNames[sup]}" \u2014 positions adjusted for containment`
      )
    );
  }
  for (const [i, j] of disjoint) {
    const dx = fixed[j].cx - fixed[i].cx;
    const dy = fixed[j].cy - fixed[i].cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = fixed[i].r + fixed[j].r + 2;
    if (dist < minDist) {
      const push = (minDist - dist) / 2 + 1;
      const ux = dx / Math.max(dist, 1e-9), uy = dy / Math.max(dist, 1e-9);
      fixed[i].cx -= ux * push;
      fixed[i].cy -= uy * push;
      fixed[j].cx += ux * push;
      fixed[j].cy += uy * push;
      warnings.push(`"${setNames[i]}" and "${setNames[j]}" are disjoint \u2014 separated`);
    }
  }
  const n = setNames.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (disjoint.some((d) => d[0] === i && d[1] === j || d[0] === j && d[1] === i)) continue;
      if (subsets.some((s) => s.sub === i && s.sup === j || s.sub === j && s.sup === i))
        continue;
      const si = sets.get(setNames[i]), sj = sets.get(setNames[j]);
      let hasOverlap = false;
      for (const item of si) {
        if (sj.has(item)) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) continue;
      const dx = fixed[j].cx - fixed[i].cx;
      const dy = fixed[j].cy - fixed[i].cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = fixed[i].r + fixed[j].r - 2;
      if (dist > maxDist) {
        const pull = (dist - maxDist) / 2 + 1;
        const ux = dx / Math.max(dist, 1e-9), uy = dy / Math.max(dist, 1e-9);
        fixed[i].cx += ux * pull;
        fixed[i].cy += uy * pull;
        fixed[j].cx -= ux * pull;
        fixed[j].cy -= uy * pull;
        warnings.push(`"${setNames[i]}" and "${setNames[j]}" share items \u2014 ensured overlap`);
      }
    }
  }
  for (let iter = 0; iter < 5; iter++) {
    if (!enforceSubsets()) break;
  }
  return { circles: fixed, warnings };
}
function fitCirclesToViewport(circles, viewW, viewH, margin = 15) {
  const minX = Math.min(...circles.map((c) => c.cx - c.r));
  const maxX = Math.max(...circles.map((c) => c.cx + c.r));
  const minY = Math.min(...circles.map((c) => c.cy - c.r));
  const maxY = Math.max(...circles.map((c) => c.cy + c.r));
  const bw = maxX - minX, bh = maxY - minY;
  const s = Math.min((viewW - 2 * margin) / bw, (viewH - 2 * margin) / bh, 1);
  const bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
  return circles.map((c) => ({
    cx: viewW / 2 + (c.cx - bcx) * s,
    cy: viewH / 2 + (c.cy - bcy) * s,
    r: c.r * s
  }));
}
const MIN_RADIUS_FRAC = 0.5;
const READABILITY_BLEND = 0.45;
function clampRadii(radii) {
  const maxR = Math.max(...radii);
  const minAllowed = maxR * MIN_RADIUS_FRAC;
  let adjusted = false;
  const clamped = radii.map((r) => {
    if (r < minAllowed) {
      adjusted = true;
      return minAllowed;
    }
    return r;
  });
  return { radii: clamped, adjusted };
}
function buildVenn2Layout(setNames, sets, intersections, viewW, viewH) {
  const s0 = sets.get(setNames[0]).size;
  const s1 = sets.get(setNames[1]).size;
  const inter = intersections.find((g) => g.mask === 3);
  const interSize = inter ? inter.size : 0;
  const maxR = Math.min(viewW, viewH) * 0.304;
  const scale = maxR / Math.sqrt(Math.max(s0, s1));
  let radii = [scale * Math.sqrt(s0), scale * Math.sqrt(s1)];
  const warnings = [];
  const rc = clampRadii(radii);
  if (rc.adjusted) warnings.push("Circle sizes adjusted for readability (small set enlarged)");
  radii = rc.radii;
  const [r0, r1] = radii;
  const targetOA = Math.PI * scale * scale * interSize;
  const d = solveDistance(r0, r1, targetOA);
  const cx = viewW / 2, cy = viewH / 2;
  const propCircles = [
    { cx: cx - d / 2, cy, r: r0 },
    { cx: cx + d / 2, cy, r: r1 }
  ];
  const classicR = Math.min(viewW, viewH) * 0.272;
  const classicD = classicR;
  const classicCircles = [
    { cx: cx - classicD / 2, cy, r: classicR },
    { cx: cx + classicD / 2, cy, r: classicR }
  ];
  const b = READABILITY_BLEND;
  const blended = propCircles.map((pc, i) => ({
    cx: pc.cx * (1 - b) + classicCircles[i].cx * b,
    cy: pc.cy * (1 - b) + classicCircles[i].cy * b,
    r: pc.r * (1 - b) + classicCircles[i].r * b
  }));
  if (b > 0) warnings.push("Layout adjusted for readability \u2014 areas are approximate");
  const subsets = detectSubsets(setNames, sets);
  const disjoint = detectDisjoint(setNames, sets);
  const { circles: fixed, warnings: fixWarnings } = validateAndFixLayout(
    blended,
    setNames,
    sets,
    subsets,
    disjoint
  );
  warnings.push(...fixWarnings);
  return {
    circles: fitCirclesToViewport(fixed, viewW, viewH),
    warnings,
    proportional: warnings.length === 0
  };
}
function buildVenn3Layout(setNames, sets, intersections, viewW, viewH) {
  const sizes = setNames.map((n) => sets.get(n).size);
  const maxR = Math.min(viewW, viewH) * 0.256;
  const scale = maxR / Math.sqrt(Math.max(...sizes));
  let radii = sizes.map((s) => scale * Math.sqrt(s));
  const warnings = [];
  const rc = clampRadii(radii);
  if (rc.adjusted) warnings.push("Circle sizes adjusted for readability (small set enlarged)");
  radii = rc.radii;
  const pairMasks = [
    [0, 1],
    [0, 2],
    [1, 2]
  ];
  const pairDists = [];
  for (const [i, j] of pairMasks) {
    let totalPairwise = 0;
    for (const g of intersections) {
      if (g.mask & 1 << i && g.mask & 1 << j) totalPairwise += g.size;
    }
    const targetOA = Math.PI * scale * scale * totalPairwise;
    pairDists.push(solveDistance(radii[i], radii[j], targetOA));
  }
  const subsets = detectSubsets(setNames, sets);
  const disjoint = detectDisjoint(setNames, sets);
  const hasSubsets = subsets.length > 0;
  const cx = viewW / 2, cy = viewH / 2;
  const d01 = pairDists[0], d02 = pairDists[1], d12 = pairDists[2];
  const ax = 0, ay = 0;
  const bx = d01, by = 0;
  let tcx = d01 > 1e-9 ? (d02 * d02 - d12 * d12 + d01 * d01) / (2 * d01) : 0;
  let tcySq = d02 * d02 - tcx * tcx;
  let tcy = tcySq > 0 ? -Math.sqrt(tcySq) : 0;
  const triPts = [
    { x: ax, y: ay },
    { x: bx, y: by },
    { x: tcx, y: tcy }
  ];
  const triCentX = (ax + bx + tcx) / 3, triCentY = (ay + by + tcy) / 3;
  const triCentered = triPts.map((p) => ({ x: p.x - triCentX, y: p.y - triCentY }));
  let pts;
  if (hasSubsets) {
    pts = triCentered;
  } else {
    const avgDist = (d01 + d02 + d12) / 3;
    const eqAngles = [-Math.PI / 6, -5 * Math.PI / 6, Math.PI / 2];
    const eqPts = eqAngles.map((a) => ({
      x: avgDist * 0.6 * Math.cos(a),
      y: avgDist * 0.6 * Math.sin(a)
    }));
    const blend = Math.abs(tcy) < avgDist * 0.15 ? 0.4 : 0.7;
    pts = triCentered.map((p, i) => ({
      x: p.x * blend + eqPts[i].x * (1 - blend),
      y: p.y * blend + eqPts[i].y * (1 - blend)
    }));
  }
  const centX = pts.reduce((s, p) => s + p.x, 0) / 3;
  const centY = pts.reduce((s, p) => s + p.y, 0) / 3;
  const propCircles = pts.map((p, i) => ({
    cx: cx + (p.x - centX),
    cy: cy + (p.y - centY),
    r: radii[i]
  }));
  const classicR = Math.min(viewW, viewH) * 0.3;
  const classicD = classicR * 0.65;
  const classicAngles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
  const classicCircles = classicAngles.map((a) => ({
    cx: cx + classicD * Math.cos(a),
    cy: cy + classicD * Math.sin(a),
    r: classicR
  }));
  const b = READABILITY_BLEND;
  const blended = propCircles.map((pc, i) => ({
    cx: pc.cx * (1 - b) + classicCircles[i].cx * b,
    cy: pc.cy * (1 - b) + classicCircles[i].cy * b,
    r: pc.r * (1 - b) + classicCircles[i].r * b
  }));
  if (b > 0) warnings.push("Layout adjusted for readability \u2014 areas are approximate");
  const { circles: fixed, warnings: fixWarnings } = validateAndFixLayout(
    blended,
    setNames,
    sets,
    subsets,
    disjoint
  );
  warnings.push(...fixWarnings);
  return {
    circles: fitCirclesToViewport(fixed, viewW, viewH),
    warnings,
    proportional: warnings.length === 0
  };
}
function buildVenn2LayoutClassic(setNames, sets, intersections, viewW, viewH) {
  const R = Math.min(viewW, viewH) * 0.272;
  const cx = viewW / 2, cy = viewH / 2;
  const d = R;
  const circles = [
    { cx: cx - d / 2, cy, r: R },
    { cx: cx + d / 2, cy, r: R }
  ];
  return {
    circles: fitCirclesToViewport(circles, viewW, viewH),
    warnings: [],
    proportional: false
  };
}
function buildVenn3LayoutClassic(setNames, sets, intersections, viewW, viewH) {
  const R = Math.min(viewW, viewH) * 0.24;
  const cx = viewW / 2, cy = viewH / 2;
  const d = R * 0.65;
  const angles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
  const circles = angles.map((a) => ({
    cx: cx + d * Math.cos(a),
    cy: cy + d * Math.sin(a),
    r: R
  }));
  return {
    circles: fitCirclesToViewport(circles, viewW, viewH),
    warnings: [],
    proportional: false
  };
}
function computeRegionCentroids(circles, regionPaths, intersections) {
  const centroids = {};
  const bbox = {
    x1: Math.min(...circles.map((c) => c.cx - c.r)) - 5,
    y1: Math.min(...circles.map((c) => c.cy - c.r)) - 5,
    x2: Math.max(...circles.map((c) => c.cx + c.r)) + 5,
    y2: Math.max(...circles.map((c) => c.cy + c.r)) + 5
  };
  const n = circles.length;
  const step = Math.max(bbox.x2 - bbox.x1, bbox.y2 - bbox.y1) / 150;
  for (const inter of intersections) {
    const mask = inter.mask;
    let bestX = 0, bestY = 0, bestDist = -1;
    for (let x = bbox.x1; x <= bbox.x2; x += step) {
      for (let y = bbox.y1; y <= bbox.y2; y += step) {
        let m = 0;
        for (let i = 0; i < n; i++) {
          if (isInsideCircle(x, y, circles[i])) m |= 1 << i;
        }
        if (m !== mask) continue;
        let minEdgeDist = Infinity;
        for (let i = 0; i < n; i++) {
          const dx = x - circles[i].cx, dy = y - circles[i].cy;
          const d = Math.abs(Math.sqrt(dx * dx + dy * dy) - circles[i].r);
          if (d < minEdgeDist) minEdgeDist = d;
        }
        if (minEdgeDist > bestDist) {
          bestDist = minEdgeDist;
          bestX = x;
          bestY = y;
        }
      }
    }
    if (bestDist >= 0) centroids[mask] = { x: bestX, y: bestY };
  }
  return centroids;
}
const VW = 600, VH = 500;
const VennChart = forwardRef(function VennChart2({
  setNames,
  sets,
  intersections,
  colors,
  selectedMask,
  onRegionClick,
  plotTitle,
  plotBg,
  fontSize,
  fillOpacity,
  onLayoutInfo,
  proportional
}, ref) {
  const n = setNames.length;
  const layout = useMemo(() => {
    if (proportional) {
      if (n === 2) return buildVenn2Layout(setNames, sets, intersections, VW, VH);
      return buildVenn3Layout(setNames, sets, intersections, VW, VH);
    }
    if (n === 2) return buildVenn2LayoutClassic(setNames, sets, intersections, VW, VH);
    return buildVenn3LayoutClassic(setNames, sets, intersections, VW, VH);
  }, [setNames, sets, intersections, n, proportional]);
  const circles = layout.circles;
  useEffect(() => {
    if (onLayoutInfo)
      onLayoutInfo({ warnings: layout.warnings, proportional: layout.proportional });
  }, [layout.warnings, layout.proportional]);
  const regionPaths = useMemo(() => buildRegionPaths(circles), [circles]);
  const centroids = useMemo(
    () => computeRegionCentroids(circles, regionPaths, intersections),
    [circles, regionPaths, intersections]
  );
  const fSize = fontSize || 14;
  const fOpacity = fillOpacity != null ? fillOpacity : 0.25;
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${VW} ${VH}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": plotTitle || "Venn diagram"
    },
    /* @__PURE__ */ React.createElement("title", null, plotTitle || "Venn diagram"),
    /* @__PURE__ */ React.createElement("desc", null, `Venn diagram with ${n} set${n !== 1 ? "s" : ""}: ${setNames.join(", ")}`),
    /* @__PURE__ */ React.createElement("rect", { width: VW, height: VH, fill: plotBg || "#fff", rx: "8" }),
    plotTitle && /* @__PURE__ */ React.createElement(
      "text",
      {
        x: VW / 2,
        y: 24,
        textAnchor: "middle",
        fontSize: "16",
        fontWeight: "700",
        fill: "#222",
        fontFamily: "sans-serif"
      },
      plotTitle
    ),
    circles.map((c, i) => /* @__PURE__ */ React.createElement(
      "circle",
      {
        key: `circle-${i}`,
        cx: c.cx,
        cy: c.cy,
        r: c.r,
        fill: colors[setNames[i]] || PALETTE[i],
        fillOpacity: fOpacity,
        stroke: colors[setNames[i]] || PALETTE[i],
        strokeWidth: "2",
        strokeOpacity: "0.6",
        "aria-label": `Set ${setNames[i]}: ${sets[setNames[i]] || 0} elements`
      }
    )),
    selectedMask != null && regionPaths[selectedMask] && /* @__PURE__ */ React.createElement(
      "path",
      {
        d: regionPaths[selectedMask],
        fill: "none",
        stroke: "#222",
        strokeWidth: "2.5",
        strokeDasharray: "6,3",
        style: { pointerEvents: "none" }
      }
    ),
    intersections.map((inter) => {
      const c = centroids[inter.mask];
      if (!c) return null;
      const isSelected = selectedMask === inter.mask;
      const hitR = Math.max(fSize * 1.5, 20);
      return /* @__PURE__ */ React.createElement(
        "g",
        {
          key: `label-${inter.mask}`,
          style: { cursor: "pointer" },
          onClick: () => onRegionClick && onRegionClick(isSelected ? null : inter.mask)
        },
        /* @__PURE__ */ React.createElement("circle", { cx: c.x, cy: c.y, r: hitR, fill: "transparent" }),
        /* @__PURE__ */ React.createElement(
          "text",
          {
            x: c.x,
            y: c.y,
            textAnchor: "middle",
            dominantBaseline: "central",
            fontSize: fSize,
            fontWeight: "700",
            fill: "#333",
            fontFamily: "sans-serif"
          },
          inter.size
        )
      );
    }),
    circles.map((c, i) => /* @__PURE__ */ React.createElement("g", { key: `setlabel-${i}` }, /* @__PURE__ */ React.createElement(
      "circle",
      {
        cx: 18,
        cy: VH - 20 - (circles.length - 1 - i) * 22,
        r: 6,
        fill: colors[setNames[i]] || PALETTE[i],
        fillOpacity: "0.5",
        stroke: colors[setNames[i]] || PALETTE[i],
        strokeWidth: "1.5"
      }
    ), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: 30,
        y: VH - 20 - (circles.length - 1 - i) * 22,
        textAnchor: "start",
        dominantBaseline: "central",
        fontSize: "13",
        fontWeight: "600",
        fill: colors[setNames[i]] || PALETTE[i],
        fontFamily: "sans-serif"
      },
      setNames[i],
      " (",
      sets.get(setNames[i]).size,
      ")"
    )))
  );
});
function UploadStep({ sepOverride, setSepOverride, handleFileLoad }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    UploadPanel,
    {
      sepOverride,
      onSepChange: setSepOverride,
      onFileLoad: handleFileLoad,
      hint: "CSV \xB7 TSV \xB7 TXT \u2014 one column per set (2\u20133), items listed in rows"
    }
  ), /* @__PURE__ */ React.createElement("p", { style: { margin: "4px 0 12px", fontSize: 11, color: "#aaa", textAlign: "right" } }, "\u26A0 Max file size: 2 MB"), /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        marginTop: 24,
        borderRadius: 14,
        overflow: "hidden",
        border: "2px solid #648FFF",
        boxShadow: "0 4px 20px rgba(100,143,255,0.12)"
      }
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          background: "linear-gradient(135deg,#4a6cf7,#648FFF)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12
        }
      },
      toolIcon("venn", 24, { circle: true }),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { color: "#fff", fontWeight: 700, fontSize: 15 } }, "Venn Diagram \u2014 How to use"), /* @__PURE__ */ React.createElement("div", { style: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 } }, "Upload wide-format data \u2192 review sets \u2192 plot"))
    ),
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          background: "#eef2ff",
          padding: "20px 24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14
        }
      },
      /* @__PURE__ */ React.createElement(
        "div",
        {
          style: {
            background: "#fff",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid #b0c4ff",
            gridColumn: "1/-1"
          }
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            style: {
              fontSize: 10,
              fontWeight: 700,
              color: "#648FFF",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "1px"
            }
          },
          "Data layout (wide format)"
        ),
        /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, lineHeight: 1.75, color: "#444", margin: "0 0 10px" } }, "Each ", /* @__PURE__ */ React.createElement("strong", null, "column"), " = one set (2 to 3 columns). Each ", /* @__PURE__ */ React.createElement("strong", null, "row"), " ", "lists one item per set. Columns can have different lengths \u2014 empty cells are ignored."),
        /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", fontSize: 11, width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { background: "#e8eeff" } }, ["Set A", "Set B", "Set C"].map((h) => /* @__PURE__ */ React.createElement(
          "th",
          {
            key: h,
            style: {
              padding: "4px 10px",
              textAlign: "left",
              color: "#648FFF",
              fontWeight: 700,
              borderBottom: "1.5px solid #b0c4ff"
            }
          },
          h
        )))), /* @__PURE__ */ React.createElement("tbody", null, [
          ["gene1", "gene2", "gene1"],
          ["gene3", "gene3", "gene4"],
          ["gene5", "gene1", "gene6"],
          ["gene7", "", ""]
        ].map((r, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { background: i % 2 === 0 ? "#f0f4ff" : "#fff" } }, r.map((v, j) => /* @__PURE__ */ React.createElement(
          "td",
          {
            key: j,
            style: {
              padding: "3px 10px",
              color: v ? "#333" : "#ccc",
              fontFamily: "monospace"
            }
          },
          v || "\u2014"
        ))))))
      ),
      /* @__PURE__ */ React.createElement(
        "div",
        {
          style: {
            background: "#fff",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid #b0c4ff"
          }
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            style: {
              fontSize: 10,
              fontWeight: 700,
              color: "#648FFF",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px"
            }
          },
          "Features"
        ),
        /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#444", margin: 0, lineHeight: 1.6 } }, "Equal-size circles by default, with optional area-proportional mode. Click any region count to highlight it and view its items. Rename sets, adjust colors and opacity from the plot controls.")
      ),
      /* @__PURE__ */ React.createElement(
        "div",
        {
          style: {
            background: "#fff",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid #b0c4ff"
          }
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            style: {
              fontSize: 10,
              fontWeight: 700,
              color: "#648FFF",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px"
            }
          },
          "Export"
        ),
        /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "#444", margin: 0, lineHeight: 1.6 } }, "Download the diagram as ", /* @__PURE__ */ React.createElement("strong", null, "SVG"), " or ", /* @__PURE__ */ React.createElement("strong", null, "PNG"), ". Export item lists per region or a full membership matrix as ", /* @__PURE__ */ React.createElement("strong", null, "CSV"), ".")
      ),
      /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" } }, [
        "2\u20133 sets",
        "Proportional toggle",
        "Subset detection",
        "Item extraction",
        "SVG / PNG / CSV export",
        "100% browser-side"
      ].map((t) => /* @__PURE__ */ React.createElement(
        "span",
        {
          key: t,
          style: {
            fontSize: 10,
            padding: "3px 10px",
            borderRadius: 20,
            background: "#fff",
            border: "1px solid #b0c4ff",
            color: "#555"
          }
        },
        t
      )))
    )
  ));
}
function ConfigureStep({ fileName, setStep, parsedHeaders, parsedRows }) {
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 4px", fontSize: 13, color: "#666" } }, /* @__PURE__ */ React.createElement("strong", { style: { color: "#333" } }, fileName), " \u2014 ", parsedHeaders.length, " cols \xD7", " ", parsedRows.length, " rows"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: "#999", marginBottom: 10 } }, "Preview (first 8 rows):"), /* @__PURE__ */ React.createElement(DataPreview, { headers: parsedHeaders, rows: parsedRows, maxRows: 8 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("plot"), style: btnPrimary }, "Plot \u2192"));
}
function IntersectionTable({ intersections, allSetNames, selectedMask, onSelect }) {
  return /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", fontSize: 12, width: "100%" } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: "2px solid #ddd" } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 700 } }, "Region"), /* @__PURE__ */ React.createElement(
    "th",
    {
      style: { padding: "6px 10px", textAlign: "center", color: "#555", fontWeight: 700 }
    },
    "Degree"
  ), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 10px", textAlign: "right", color: "#555", fontWeight: 700 } }, "Count"))), /* @__PURE__ */ React.createElement("tbody", null, intersections.map((inter) => /* @__PURE__ */ React.createElement(
    "tr",
    {
      key: inter.mask,
      onClick: () => onSelect(inter.mask),
      style: {
        borderBottom: "1px solid #eee",
        cursor: "pointer",
        background: selectedMask === inter.mask ? "#e8f0fe" : "transparent"
      }
    },
    /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", color: "#333", fontWeight: 500 } }, regionLabel(inter.setNames, inter.mask, allSetNames)),
    /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 10px", textAlign: "center", color: "#888" } }, inter.degree),
    /* @__PURE__ */ React.createElement(
      "td",
      {
        style: {
          padding: "6px 10px",
          textAlign: "right",
          color: "#648FFF",
          fontWeight: 700,
          fontFamily: "monospace"
        }
      },
      inter.size
    )
  )))));
}
function ItemListPanel({ intersection, allSetNames }) {
  if (!intersection)
    return /* @__PURE__ */ React.createElement("div", { style: { padding: "30px 20px", textAlign: "center", color: "#aaa", fontSize: 13 } }, "Click a region in the Venn diagram or a row in the table to view items.");
  const label = regionLabel(intersection.setNames, intersection.mask, allSetNames);
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8
      }
    },
    /* @__PURE__ */ React.createElement("p", { style: { margin: 0, fontSize: 13, fontWeight: 600, color: "#333" } }, label, " ", /* @__PURE__ */ React.createElement("span", { style: { color: "#888", fontWeight: 400 } }, "(", intersection.size, " items)")),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          downloadCsv(
            ["Item"],
            intersection.items.map((i) => [i]),
            `venn_${label.replace(/[^a-zA-Z0-9]/g, "_")}.csv`
          );
        },
        style: {
          ...btnSecondary,
          background: "#dcfce7",
          border: "1px solid #86efac",
          color: "#166534",
          fontWeight: 600,
          fontSize: 11
        }
      },
      "\u2B07 CSV"
    )
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        maxHeight: 240,
        overflowY: "auto",
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        background: "#fafafa"
      }
    },
    intersection.items.map((item, i) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: i,
        style: {
          padding: "3px 10px",
          fontSize: 12,
          color: "#333",
          borderBottom: "1px solid #f0f0f0",
          fontFamily: "monospace"
        }
      },
      item
    ))
  ));
}
function PlotControls({
  allSetNames,
  allSets,
  activeSetNames,
  activeSets,
  onToggleSet,
  setColors,
  onColorChange,
  onRename,
  vis,
  updVis,
  chartRef,
  resetAll,
  proportional,
  onProportionalChange
}) {
  const sv = (k) => (v) => updVis({ [k]: v });
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        width: 300,
        flexShrink: 0,
        position: "sticky",
        top: 24,
        maxHeight: "calc(100vh - 90px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10
      }
    },
    /* @__PURE__ */ React.createElement(
      ActionsPanel,
      {
        onDownloadSvg: () => downloadSvg(chartRef.current, "venn.svg"),
        onDownloadPng: () => downloadPng(chartRef.current, "venn.png", 2),
        onReset: resetAll,
        extraButtons: [
          {
            label: "\u2B07 All items CSV",
            onClick: (e) => {
              const allItems = /* @__PURE__ */ new Set();
              for (const n of activeSetNames) for (const item of allSets.get(n)) allItems.add(item);
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems].sort().map((item) => [
                item,
                ...activeSetNames.map((n) => allSets.get(n).has(item) ? "1" : "0")
              ]);
              downloadCsv(headers, rows, "venn_membership.csv");
              flashSaved(e.currentTarget);
            },
            style: {
              ...btnSecondary,
              background: "#dcfce7",
              border: "1px solid #86efac",
              color: "#166534",
              width: "100%",
              fontWeight: 600
            }
          }
        ]
      }
    ),
    /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Sets"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5 } }, allSetNames.map((name, i) => {
      const active = activeSets.has(name);
      const canUncheck = activeSets.size > 2;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: name,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderRadius: 6,
            fontSize: 12,
            background: active ? "#f0f0f5" : "#fafafa",
            border: active ? "1px solid #ccc" : "1px solid #e8e8e8",
            opacity: active ? 1 : 0.5
          }
        },
        /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "checkbox",
            checked: active,
            disabled: active && !canUncheck,
            onChange: () => onToggleSet(name),
            style: {
              accentColor: setColors[name] || PALETTE[i % PALETTE.length],
              flexShrink: 0
            }
          }
        ),
        /* @__PURE__ */ React.createElement(
          ColorInput,
          {
            value: setColors[name] || PALETTE[i % PALETTE.length],
            onChange: (v) => onColorChange(name, v),
            size: 20
          }
        ),
        /* @__PURE__ */ React.createElement(
          "input",
          {
            key: name,
            defaultValue: name,
            style: {
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              color: active ? "#333" : "#999",
              border: "1px solid #ccc",
              background: "#fff",
              fontFamily: "monospace",
              fontSize: 12,
              padding: "2px 6px",
              borderRadius: 3,
              outline: "none"
            },
            onFocus: (e) => {
              e.target.style.borderColor = "#648FFF";
              e.target.style.boxShadow = "0 0 0 2px rgba(100,143,255,0.2)";
            },
            onBlur: (e) => {
              e.target.style.borderColor = "#ccc";
              e.target.style.boxShadow = "none";
              const nv = e.target.value.trim();
              if (nv && nv !== name) {
                if (!onRename(name, nv)) e.target.value = name;
              } else if (!nv) e.target.value = name;
            },
            onKeyDown: (e) => {
              if (e.key === "Enter") e.target.blur();
            }
          }
        ),
        /* @__PURE__ */ React.createElement("span", { style: { color: "#999", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 } }, "(", allSets.get(name).size, ")")
      );
    }))),
    /* @__PURE__ */ React.createElement("div", { style: sec }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Display"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Proportional areas"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: proportional,
        onChange: (e) => onProportionalChange(e.target.checked),
        style: { accentColor: "#648FFF" }
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Title"), /* @__PURE__ */ React.createElement(
      "input",
      {
        value: vis.plotTitle,
        onChange: (e) => updVis({ plotTitle: e.target.value }),
        style: { ...inp, width: "100%" }
      }
    )), /* @__PURE__ */ React.createElement(
      SliderControl,
      {
        label: "Fill opacity",
        value: vis.fillOpacity,
        min: 0.05,
        max: 0.8,
        step: 0.05,
        onChange: sv("fillOpacity")
      }
    ), /* @__PURE__ */ React.createElement(
      SliderControl,
      {
        label: "Font size",
        value: vis.fontSize,
        min: 8,
        max: 24,
        step: 1,
        onChange: sv("fontSize")
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { style: lbl }, "Background"), /* @__PURE__ */ React.createElement(ColorInput, { value: vis.plotBg, onChange: sv("plotBg"), size: 24 }))))
  );
}
function App() {
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState(null);
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [setNames, setSetNames] = useState([]);
  const [sets, setSets] = useState(/* @__PURE__ */ new Map());
  const [setColors, setSetColors] = useState({});
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedMask, setSelectedMask] = useState(null);
  const [activeSets, setActiveSets] = useState(/* @__PURE__ */ new Set());
  const [proportional, setProportional] = useState(false);
  const visInit = { plotTitle: "", plotBg: "#ffffff", fontSize: 14, fillOpacity: 0.25 };
  const [vis, updVis] = useReducer((s, a) => a._reset ? { ...visInit } : { ...s, ...a }, visInit);
  const chartRef = useRef();
  const [layoutInfo, setLayoutInfo] = useState({ warnings: [], proportional: true });
  const activeSetNames = useMemo(
    () => setNames.filter((n) => activeSets.has(n)),
    [setNames, activeSets]
  );
  const activeSetsMap = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const n of activeSetNames) m.set(n, sets.get(n));
    return m;
  }, [activeSetNames, sets]);
  const intersections = useMemo(() => {
    if (activeSetNames.length < 2) return [];
    return computeIntersections(activeSetNames, activeSetsMap);
  }, [activeSetNames, activeSetsMap]);
  const canNavigate = useCallback(
    (target) => {
      if (target === "upload") return true;
      if (target === "configure") return setNames.length >= 2;
      if (target === "plot") return setNames.length >= 2;
      return false;
    },
    [setNames]
  );
  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    const { headers, rows } = parseRaw(dc.text, sep);
    if (!headers.length || !rows.length) {
      setParseError("The file appears to be empty or has no data rows.");
      return;
    }
    const { setNames: sn, sets: ss } = parseSetData(headers, rows);
    if (sn.length < 2) {
      setParseError("Need at least 2 sets \u2014 each column header becomes a set name.");
      return;
    }
    if (sn.length > 3) {
      setParseError(`Detected ${sn.length} sets (columns) \u2014 this tool supports 2\u20133 sets.`);
      return;
    }
    setParseError(null);
    setParsedHeaders(headers);
    setParsedRows(rows);
    setSetNames(sn);
    setSets(ss);
    setActiveSets(new Set(sn));
    const cols = {};
    sn.forEach((n, i) => {
      cols[n] = PALETTE[i % PALETTE.length];
    });
    setSetColors(cols);
    setSelectedMask(null);
    setStep("configure");
  }, []);
  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );
  const handleColorChange = (name, color) => {
    setSetColors((prev) => ({ ...prev, [name]: color }));
  };
  const handleRename = (oldName, newName) => {
    if (oldName === newName || setNames.includes(newName)) return false;
    setSetNames((prev) => prev.map((n) => n === oldName ? newName : n));
    setSets((prev) => {
      const m = /* @__PURE__ */ new Map();
      for (const [k, v] of prev) m.set(k === oldName ? newName : k, v);
      return m;
    });
    setSetColors((prev) => {
      const c = {};
      for (const [k, v] of Object.entries(prev)) c[k === oldName ? newName : k] = v;
      return c;
    });
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(oldName)) {
        s.delete(oldName);
        s.add(newName);
      }
      return s;
    });
    return true;
  };
  const handleToggleSet = (name) => {
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name);
      else s.add(name);
      return s;
    });
    setSelectedMask(null);
  };
  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(/* @__PURE__ */ new Map());
    setSetColors({});
    setActiveSets(/* @__PURE__ */ new Set());
    setParseError(null);
    setSelectedMask(null);
    setProportional(false);
    updVis({ _reset: true });
  };
  const selectedIntersection = intersections.find((g) => g.mask === selectedMask) || null;
  return /* @__PURE__ */ React.createElement("div", { style: { padding: "20px 40px", maxWidth: 1200, margin: "0 auto" } }, /* @__PURE__ */ React.createElement(
    PageHeader,
    {
      toolName: "venn",
      title: "Venn Diagram",
      subtitle: "Set overlaps with data extraction (2\u20133 sets)"
    }
  ), /* @__PURE__ */ React.createElement(
    StepNavBar,
    {
      steps: ["upload", "configure", "plot"],
      currentStep: step,
      onStepChange: setStep,
      canNavigate
    }
  ), /* @__PURE__ */ React.createElement(CommaFixBanner, { commaFixed, commaFixCount }), parseError && /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        display: "flex",
        alignItems: "flex-start",
        gap: 8
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 16 } }, "\u{1F6AB}"),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#dc2626", fontWeight: 600, whiteSpace: "pre-line" } }, parseError)
  ), step === "upload" && /* @__PURE__ */ React.createElement(
    UploadStep,
    {
      sepOverride,
      setSepOverride,
      handleFileLoad
    }
  ), step === "configure" && setNames.length >= 2 && /* @__PURE__ */ React.createElement(
    ConfigureStep,
    {
      fileName,
      setStep,
      parsedHeaders,
      parsedRows
    }
  ), step === "plot" && activeSetNames.length >= 2 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 16, alignItems: "center" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStep("configure"), style: btnSecondary }, "\u2190 Configure")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement(
    PlotControls,
    {
      allSetNames: setNames,
      allSets: sets,
      activeSetNames,
      activeSets,
      onToggleSet: handleToggleSet,
      setColors,
      onColorChange: handleColorChange,
      onRename: handleRename,
      vis,
      updVis,
      chartRef,
      resetAll,
      proportional,
      onProportionalChange: setProportional
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 20, background: "#fff" } }, /* @__PURE__ */ React.createElement(
    VennChart,
    {
      ref: chartRef,
      setNames: activeSetNames,
      sets: activeSetsMap,
      intersections,
      colors: setColors,
      selectedMask,
      onRegionClick: setSelectedMask,
      plotTitle: vis.plotTitle,
      plotBg: vis.plotBg,
      fontSize: vis.fontSize,
      fillOpacity: vis.fillOpacity,
      onLayoutInfo: setLayoutInfo,
      proportional
    }
  )), proportional && layoutInfo.proportional ? /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        margin: "8px 0 0",
        padding: "6px 12px",
        borderRadius: 6,
        background: "#f0fdf4",
        border: "1px solid #86efac",
        fontSize: 11,
        color: "#166534"
      }
    },
    "Areas are proportional to set sizes"
  ) : proportional && layoutInfo.warnings.length > 0 ? /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        margin: "8px 0 0",
        padding: "6px 12px",
        borderRadius: 6,
        background: "#fffbeb",
        border: "1px solid #fcd34d",
        fontSize: 11,
        color: "#92400e"
      }
    },
    layoutInfo.warnings.map((w, i) => /* @__PURE__ */ React.createElement("div", { key: i }, w)),
    /* @__PURE__ */ React.createElement("div", { style: { marginTop: 2, color: "#b45309", fontStyle: "italic" } }, "Area proportionality adjusted to preserve correctness")
  ) : null, /* @__PURE__ */ React.createElement("div", { style: { ...sec, marginTop: 16 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Intersections"), /* @__PURE__ */ React.createElement(
    IntersectionTable,
    {
      intersections,
      allSetNames: activeSetNames,
      selectedMask,
      onSelect: setSelectedMask
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { ...sec, marginTop: 16 } }, /* @__PURE__ */ React.createElement("p", { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } }, "Items"), /* @__PURE__ */ React.createElement(ItemListPanel, { intersection: selectedIntersection, allSetNames: activeSetNames }))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
