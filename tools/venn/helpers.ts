// Pure geometry + set-math helpers for the Venn tool. These have no React /
// DOM dependency and are separately testable (tests/helpers/venn-loader.js
// loads this file directly). Keep render-layer code out — it belongs in
// tools/venn.tsx.

// ── Set Computation ──────────────────────────────────────────────────────────

export function computeIntersections(setNames, sets) {
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
  // Include all possible regions (even empty ones) so every zone gets a label
  const totalMasks = (1 << n) - 1;
  for (let mask = 1; mask <= totalMasks; mask++) {
    const items = groups.has(mask) ? groups.get(mask) : [];
    items.sort();
    const active = setNames.filter((_, i) => mask & (1 << i));
    result.push({ mask, setNames: active, degree: active.length, items, size: items.length });
  }
  return result.sort((a, b) => b.size - a.size);
}

export function regionLabel(setNames, mask, allSetNames) {
  const active = allSetNames.filter((_, i) => mask & (1 << i));
  const inactive = allSetNames.filter((_, i) => !(mask & (1 << i)));
  if (inactive.length === 0) return active.join(" ∩ ");
  return active.join(" ∩ ") + " only";
}

// Filename-safe rendering of a region label. "A ∩ B only" → "A_and_B_only".
export function regionFilenamePart(label) {
  return label
    .replace(/∩/g, "and")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

// ── Venn Geometry ────────────────────────────────────────────────────────────

export function circleOverlapArea(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  return (
    r1 * r1 * Math.acos(Math.max(-1, Math.min(1, a / r1))) +
    r2 * r2 * Math.acos(Math.max(-1, Math.min(1, (d - a) / r2))) -
    d * h
  );
}

export function solveDistance(r1, r2, targetArea) {
  const maxArea = Math.PI * Math.min(r1, r2) ** 2;
  if (targetArea <= 0) return r1 + r2 + 1;
  if (targetArea >= maxArea) return Math.abs(r1 - r2);
  let lo = Math.abs(r1 - r2),
    hi = r1 + r2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (circleOverlapArea(r1, r2, mid) > targetArea) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function circleIntersectionPoints(c1, c2) {
  const dx = c2.cx - c1.cx,
    dy = c2.cy - c1.cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > c1.r + c2.r + 1e-9 || d < Math.abs(c1.r - c2.r) - 1e-9 || d < 1e-9) return null;
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const hSq = Math.max(0, c1.r * c1.r - a * a);
  const h = Math.sqrt(hSq);
  const mx = c1.cx + (a * dx) / d,
    my = c1.cy + (a * dy) / d;
  return [
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
  ];
}

export function isInsideCircle(px, py, c) {
  const dx = px - c.cx,
    dy = py - c.cy;
  return dx * dx + dy * dy < c.r * c.r + 1e-6;
}

// Normalize angle to [0, 2π)
export function normAngle(a) {
  let v = a % (2 * Math.PI);
  return v < 0 ? v + 2 * Math.PI : v;
}

// Build region paths for 2 or 3 circles
export function buildRegionPaths(circles) {
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
    const pts = allPts
      .filter((p) => p.ci === i || p.cj === i)
      .map((p) => ({ ...p, angle: p.angles[i] }))
      .sort((a, b) => a.angle - b.angle);

    if (pts.length === 0) {
      // No intersections — full circle is one region.
      // Determine which other circles this circle's PERIMETER is inside of.
      // (Checking the center is wrong: a large circle's center can be inside a
      // small contained circle, but its perimeter is entirely outside it.)
      // Since there are no intersections, all perimeter points have the same
      // inside/outside status: circle i is inside circle j iff dist + ri ≤ rj.
      const mask = (function () {
        let m = 1 << i;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = circles[i].cx - circles[j].cx,
            dy = circles[i].cy - circles[j].cy;
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
        toPt: null,
      });
      continue;
    }

    for (let k = 0; k < pts.length; k++) {
      const p1 = pts[k],
        p2 = pts[(k + 1) % pts.length];
      let a1 = p1.angle,
        a2 = p2.angle;
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
        toPt: p2,
      });
    }
  }

  // 3. Collect all region masks
  const allMasks = new Set<number>();
  for (const arc of arcs) {
    allMasks.add(arc.insideMask);
    allMasks.add(arc.insideMask ^ (1 << arc.circleIdx)); // the "outside" region
  }

  // 4. For each region, gather boundary arcs from BOTH sides of every arc.
  //    An arc on circle i with insideMask M borders:
  //      inside region  = M            (forward traversal, SVG sweep=1)
  //      outside region = M^(1<<i)     (reverse traversal, SVG sweep=0)
  //    Full-circle arcs (no intersection points) are included for both sides.
  const regions: Record<number, string> = {};
  for (const R of allMasks) {
    if (R <= 0) continue;

    // Separate full-circle arcs from partial arcs
    const fullCircleArcs = [];
    const partialArcs = [];

    for (const arc of arcs) {
      const outsideMask = arc.insideMask ^ (1 << arc.circleIdx);
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
            reversed: true,
          });
      }
    }

    if (fullCircleArcs.length === 0 && partialArcs.length === 0) continue;

    // Group partial arcs into closed chains by endpoint matching
    const chains = [];
    const used = new Set();
    for (let start = 0; start < partialArcs.length; start++) {
      if (used.has(start)) continue;
      const chain = [partialArcs[start]];
      used.add(start);
      for (let safety = 0; safety < partialArcs.length; safety++) {
        const lastEnd = chain[chain.length - 1].toPt;
        if (!lastEnd) break;
        let bestIdx = -1,
          bestDist = Infinity;
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
        if (bestIdx === -1 || bestDist > 4) break; // no close match → chain is closed
        chain.push(partialArcs[bestIdx]);
        used.add(bestIdx);
      }
      chains.push(chain);
    }

    // Build SVG path: one sub-path per chain + one sub-path per full circle
    const pathParts = [];

    // Helper: emit one SVG arc command
    function emitArc(ba) {
      const c = circles[ba.circleIdx],
        r = c.r;
      const endX = c.cx + r * Math.cos(ba.angleTo);
      const endY = c.cy + r * Math.sin(ba.angleTo);
      // Angular span going forward (positive direction)
      let span = ba.angleTo - ba.angleFrom;
      while (span < 0) span += 2 * Math.PI;
      while (span > 2 * Math.PI) span -= 2 * Math.PI;
      if (ba.reversed) {
        // Traverse in the opposite direction around the circle
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
    }

    for (const chain of chains) {
      const first = chain[0],
        c0 = circles[first.circleIdx];
      const sx = c0.cx + c0.r * Math.cos(first.angleFrom);
      const sy = c0.cy + c0.r * Math.sin(first.angleFrom);
      pathParts.push(`M${sx.toFixed(2)},${sy.toFixed(2)}`);
      for (const ba of chain) emitArc(ba);
      pathParts.push("Z");
    }

    for (const fc of fullCircleArcs) {
      const c = circles[fc.circleIdx],
        r = c.r;
      const x1 = c.cx - r,
        y1 = c.cy,
        x2 = c.cx + r,
        y2 = c.cy;
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

// ── Proportional Layout ──────────────────────────────────────────────────────

// Detect all subset relationships between sets
export function detectSubsets(setNames, sets) {
  const n = setNames.length;
  const subsets = []; // { sub: i, sup: j } meaning set i ⊆ set j
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const si = sets.get(setNames[i]),
        sj = sets.get(setNames[j]);
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

// Detect disjoint pairs (no shared items)
export function detectDisjoint(setNames, sets) {
  const n = setNames.length;
  const disjoint = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = sets.get(setNames[i]),
        sj = sets.get(setNames[j]);
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

// Verify that final circle positions respect containment and separation constraints.
// Returns { circles, warnings } with adjusted circles and any warnings.
export function validateAndFixLayout(circles, setNames, sets, subsets, disjoint) {
  const warnings = [];
  const fixed = circles.map((c) => ({ ...c }));

  // 1. Enforce subsets: the sub circle must be clearly INSIDE the sup circle.
  //    A small clearance keeps circles non-tangent (tangency yields degenerate
  //    intersection points and broken region paths). The offset when we do
  //    need to re-seat a subset is proportional to the size ratio — a much
  //    smaller sub lands closer to the centre of its superset.
  function enforceSubsets() {
    for (const { sub, sup } of subsets) {
      const dx = fixed[sub].cx - fixed[sup].cx;
      const dy = fixed[sub].cy - fixed[sup].cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = fixed[sup].r - fixed[sub].r - VENN_CONFIG.SUBSET_CLEARANCE;
      if (maxDist <= 0) continue;
      if (dist > maxDist) {
        const subSize = sets.get(setNames[sub]).size;
        const supSize = sets.get(setNames[sup]).size;
        const ratio = supSize > 0 ? (supSize - subSize) / supSize : 0.5;
        const proportion = Math.min(0.9, Math.max(0.2, ratio));
        const target = maxDist * proportion;
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
        ({ sub, sup }) =>
          `"${setNames[sub]}" is a subset of "${setNames[sup]}" — positions adjusted for containment`
      )
    );
  }

  // 2. Enforce disjoint: circles must not overlap
  for (const [i, j] of disjoint) {
    const dx = fixed[j].cx - fixed[i].cx;
    const dy = fixed[j].cy - fixed[i].cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = fixed[i].r + fixed[j].r + VENN_CONFIG.DISJOINT_CLEARANCE;
    if (dist < minDist) {
      const push = (minDist - dist) / 2 + 1;
      const ux = dx / Math.max(dist, 1e-9),
        uy = dy / Math.max(dist, 1e-9);
      fixed[i].cx -= ux * push;
      fixed[i].cy -= uy * push;
      fixed[j].cx += ux * push;
      fixed[j].cy += uy * push;
      warnings.push(`"${setNames[i]}" and "${setNames[j]}" are disjoint — separated`);
    }
  }

  // 3. Enforce overlapping pairs: if sets share items, circles must overlap
  const n = setNames.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip if disjoint or subset
      if (disjoint.some((d) => (d[0] === i && d[1] === j) || (d[0] === j && d[1] === i))) continue;
      if (subsets.some((s) => (s.sub === i && s.sup === j) || (s.sub === j && s.sup === i)))
        continue;
      const si = sets.get(setNames[i]),
        sj = sets.get(setNames[j]);
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
      const maxDist = fixed[i].r + fixed[j].r - VENN_CONFIG.OVERLAP_CLEARANCE;
      if (dist > maxDist) {
        const pull = (dist - maxDist) / 2 + 1;
        const ux = dx / Math.max(dist, 1e-9),
          uy = dy / Math.max(dist, 1e-9);
        fixed[i].cx += ux * pull;
        fixed[i].cy += uy * pull;
        fixed[j].cx -= ux * pull;
        fixed[j].cy -= uy * pull;
        warnings.push(`"${setNames[i]}" and "${setNames[j]}" share items — ensured overlap`);
      }
    }
  }

  // Re-run subset enforcement after other fixes — iterate until stable
  for (let iter = 0; iter < 5; iter++) {
    if (!enforceSubsets()) break;
  }

  return { circles: fixed, warnings };
}

export function fitCirclesToViewport(circles, viewW, viewH, margin = 15) {
  const minX = Math.min(...circles.map((c) => c.cx - c.r));
  const maxX = Math.max(...circles.map((c) => c.cx + c.r));
  const minY = Math.min(...circles.map((c) => c.cy - c.r));
  const maxY = Math.max(...circles.map((c) => c.cy + c.r));
  const bw = maxX - minX,
    bh = maxY - minY;
  // Reserve vertical space for title (top) and stacked legend (bottom); legend
  // rows sit every 22px starting at viewH-20, so n rows need ≈ n*22+20 px.
  const marginTop = Math.max(margin, 40);
  const marginBottom = Math.max(margin, circles.length * 22 + 20);
  const availH = viewH - marginTop - marginBottom;
  const s = Math.min((viewW - 2 * margin) / bw, availH / bh, 1);
  const bcx = (minX + maxX) / 2,
    bcy = (minY + maxY) / 2;
  const centerY = marginTop + availH / 2;
  return circles.map((c) => ({
    cx: viewW / 2 + (c.cx - bcx) * s,
    cy: centerY + (c.cy - bcy) * s,
    r: c.r * s,
  }));
}

// Single source of truth for proportional-layout magic numbers.
export const VENN_CONFIG = {
  MIN_RADIUS_FRAC: 0.5, // smallest circle ≥ this fraction of the largest
  DEFAULT_READABILITY_BLEND: 0.45, // 0 = pure proportional, 1 = pure classic
  REFINEMENT_ITERATIONS: 40, // coordinate descent rounds for 3-set refinement
  SUBSET_CLEARANCE: 3, // px margin when a subset sits inside its superset
  DISJOINT_CLEARANCE: 2, // px gap between disjoint circles
  OVERLAP_CLEARANCE: 2, // px overlap enforced when sets must intersect
};

export const VIS_INIT_VENN = {
  plotTitle: "",
  plotBg: "#ffffff",
  fontSize: 14,
  fillOpacity: 0.25,
  readabilityBlend: VENN_CONFIG.DEFAULT_READABILITY_BLEND,
  showOutline: true,
};

export function clampRadii(radii) {
  const maxR = Math.max(...radii);
  const minR = Math.min(...radii);
  const actualRatio = maxR > 0 ? minR / maxR : 1;
  const minAllowed = maxR * VENN_CONFIG.MIN_RADIUS_FRAC;
  let adjusted = false;
  const clamped = radii.map((r) => {
    if (r < minAllowed) {
      adjusted = true;
      return minAllowed;
    }
    return r;
  });
  return { radii: clamped, adjusted, actualRatio };
}

// ── Analytic region areas ───────────────────────────────────────────────────

export function triangleArea(a, b, c) {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
}

// Minor circular segment cut by a chord of length L in a circle of radius r.
export function chordSegmentArea(r, chordLen) {
  const ratio = Math.max(-1, Math.min(1, chordLen / (2 * r)));
  const theta = 2 * Math.asin(ratio);
  return (r * r * (theta - Math.sin(theta))) / 2;
}

// Area of the region inside ALL three circles. Returns 0 when no triple
// intersection exists. Uses the classical triangle-plus-segments decomposition
// built from the three "inner" pairwise intersection points.
export function tripleIntersectionArea(circles) {
  function innerVertex(i, j, k) {
    const pts = circleIntersectionPoints(circles[i], circles[j]);
    if (!pts) return null;
    for (const p of pts) {
      if (isInsideCircle(p.x, p.y, circles[k])) return p;
    }
    return null;
  }
  const v01 = innerVertex(0, 1, 2);
  const v02 = innerVertex(0, 2, 1);
  const v12 = innerVertex(1, 2, 0);
  if (!v01 || !v02 || !v12) return 0;
  const tri = triangleArea(v01, v12, v02);
  const s0 = chordSegmentArea(circles[0].r, Math.hypot(v01.x - v02.x, v01.y - v02.y));
  const s1 = chordSegmentArea(circles[1].r, Math.hypot(v01.x - v12.x, v01.y - v12.y));
  const s2 = chordSegmentArea(circles[2].r, Math.hypot(v02.x - v12.x, v02.y - v12.y));
  return tri + s0 + s1 + s2;
}

// Returns a Map<mask, area> covering every non-empty Venn region for 2 or 3 circles.
export function computeAllRegionAreas(circles) {
  const areas = new Map();
  const n = circles.length;
  if (n === 2) {
    const [c0, c1] = circles;
    const A0 = Math.PI * c0.r * c0.r;
    const A1 = Math.PI * c1.r * c1.r;
    const d = Math.hypot(c1.cx - c0.cx, c1.cy - c0.cy);
    const P = circleOverlapArea(c0.r, c1.r, d);
    areas.set(0b01, Math.max(0, A0 - P));
    areas.set(0b10, Math.max(0, A1 - P));
    areas.set(0b11, P);
  } else if (n === 3) {
    const [c0, c1, c2] = circles;
    const A0 = Math.PI * c0.r * c0.r;
    const A1 = Math.PI * c1.r * c1.r;
    const A2 = Math.PI * c2.r * c2.r;
    const d01 = Math.hypot(c1.cx - c0.cx, c1.cy - c0.cy);
    const d02 = Math.hypot(c2.cx - c0.cx, c2.cy - c0.cy);
    const d12 = Math.hypot(c2.cx - c1.cx, c2.cy - c1.cy);
    const P01 = circleOverlapArea(c0.r, c1.r, d01);
    const P02 = circleOverlapArea(c0.r, c2.r, d02);
    const P12 = circleOverlapArea(c1.r, c2.r, d12);
    const T = Math.max(0, Math.min(P01, P02, P12, tripleIntersectionArea(circles)));
    areas.set(0b001, Math.max(0, A0 - P01 - P02 + T));
    areas.set(0b010, Math.max(0, A1 - P01 - P12 + T));
    areas.set(0b100, Math.max(0, A2 - P02 - P12 + T));
    areas.set(0b011, Math.max(0, P01 - T));
    areas.set(0b101, Math.max(0, P02 - T));
    areas.set(0b110, Math.max(0, P12 - T));
    areas.set(0b111, T);
  }
  return areas;
}

// Max/mean region-area error normalised against the total target area.
// Relative error is scale-invariant, so callers may pass pre- or post-fit layouts.
export function computeLayoutError(circles, intersections, targetScale) {
  if (circles.length < 2 || targetScale <= 0) return { maxError: 0, meanError: 0 };
  const areas = computeAllRegionAreas(circles);
  let totalTarget = 0;
  for (const g of intersections) totalTarget += g.size * targetScale;
  if (totalTarget < 1e-9) return { maxError: 0, meanError: 0 };
  let maxErr = 0,
    sumErr = 0,
    count = 0;
  for (const g of intersections) {
    const target = g.size * targetScale;
    const actual = areas.get(g.mask) || 0;
    const err = Math.abs(actual - target) / totalTarget;
    if (err > maxErr) maxErr = err;
    sumErr += err;
    count++;
  }
  return { maxError: maxErr, meanError: count > 0 ? sumErr / count : 0 };
}

// Coordinate descent on the 3 circle centers: shrinks the squared-area
// residual across all 7 regions. Radii are held fixed (they are already
// determined by absolute set sizes).
export function refine3SetLayout(initialCircles, intersections, targetScale) {
  let current = initialCircles.map((c) => ({ ...c }));
  const targets = new Map();
  for (const g of intersections) targets.set(g.mask, g.size * targetScale);

  function cost(cs) {
    const areas = computeAllRegionAreas(cs);
    let s = 0;
    for (const [mask, target] of targets) {
      const actual = areas.get(mask) || 0;
      const diff = actual - target;
      s += diff * diff;
    }
    return s;
  }

  let best = cost(current);
  const maxR = Math.max(...current.map((c) => c.r));
  let step = maxR * 0.2;
  const minStep = maxR * 0.005;
  const moves = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let iters = 0;
  const maxIters = VENN_CONFIG.REFINEMENT_ITERATIONS * 6;
  while (step > minStep && iters < maxIters) {
    iters++;
    let improved = false;
    for (let i = 0; i < 3; i++) {
      for (const [mx, my] of moves) {
        const dx = mx * step,
          dy = my * step;
        const trial = current.map((c, k) =>
          k === i ? { ...c, cx: c.cx + dx, cy: c.cy + dy } : { ...c }
        );
        const c = cost(trial);
        if (c < best - 1e-6) {
          current = trial;
          best = c;
          improved = true;
        }
      }
    }
    if (!improved) step *= 0.5;
  }
  return current;
}

export function buildVenn2Layout(setNames, sets, intersections, viewW, viewH, blend) {
  const s0 = sets.get(setNames[0]).size;
  const s1 = sets.get(setNames[1]).size;
  const inter = intersections.find((g) => g.mask === 3);
  const interSize = inter ? inter.size : 0;

  const maxR = Math.min(viewW, viewH) * 0.304;
  const scale = maxR / Math.sqrt(Math.max(s0, s1));
  let radii = [scale * Math.sqrt(s0), scale * Math.sqrt(s1)];
  const warnings = [];

  const rc = clampRadii(radii);
  if (rc.adjusted) {
    warnings.push(
      `Set sizes differ drastically (ratio ${rc.actualRatio.toFixed(2)}) — smaller set enlarged for visibility`
    );
  }
  radii = rc.radii;
  const [r0, r1] = radii;

  const targetScale = Math.PI * scale * scale;
  const targetOA = targetScale * interSize;
  const d = solveDistance(r0, r1, targetOA);
  const cx = viewW / 2,
    cy = viewH / 2;

  const propCircles = [
    { cx: cx - d / 2, cy, r: r0 },
    { cx: cx + d / 2, cy, r: r1 },
  ];

  let working = propCircles;
  if (blend > 0) {
    const classicR = Math.min(viewW, viewH) * 0.272;
    const classicD = classicR;
    const classicCircles = [
      { cx: cx - classicD / 2, cy, r: classicR },
      { cx: cx + classicD / 2, cy, r: classicR },
    ];
    working = propCircles.map((pc, i) => ({
      cx: pc.cx * (1 - blend) + classicCircles[i].cx * blend,
      cy: pc.cy * (1 - blend) + classicCircles[i].cy * blend,
      r: pc.r * (1 - blend) + classicCircles[i].r * blend,
    }));
  }

  const subsets = detectSubsets(setNames, sets);
  const disjoint = detectDisjoint(setNames, sets);
  const { circles: fixed, warnings: fixWarnings } = validateAndFixLayout(
    working,
    setNames,
    sets,
    subsets,
    disjoint
  );
  warnings.push(...fixWarnings);

  const errors = computeLayoutError(fixed, intersections, targetScale);
  return {
    circles: fitCirclesToViewport(fixed, viewW, viewH),
    warnings,
    proportional: warnings.length === 0,
    maxError: errors.maxError,
    meanError: errors.meanError,
  };
}

export function buildVenn3Layout(setNames, sets, intersections, viewW, viewH, blend) {
  const sizes = setNames.map((n) => sets.get(n).size);
  const maxR = Math.min(viewW, viewH) * 0.256;
  const scale = maxR / Math.sqrt(Math.max(...sizes));
  let radii = sizes.map((s) => scale * Math.sqrt(s));
  const warnings = [];

  const rc = clampRadii(radii);
  if (rc.adjusted) {
    warnings.push(
      `Set sizes differ drastically (ratio ${rc.actualRatio.toFixed(2)}) — smaller sets enlarged for visibility`
    );
  }
  radii = rc.radii;
  const targetScale = Math.PI * scale * scale;

  const pairMasks = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const pairDists = [];
  for (const [i, j] of pairMasks) {
    let totalPairwise = 0;
    for (const g of intersections) {
      if (g.mask & (1 << i) && g.mask & (1 << j)) totalPairwise += g.size;
    }
    const targetOA = targetScale * totalPairwise;
    pairDists.push(solveDistance(radii[i], radii[j], targetOA));
  }

  const subsets = detectSubsets(setNames, sets);
  const disjoint = detectDisjoint(setNames, sets);
  const hasSubsets = subsets.length > 0;

  const cx = viewW / 2,
    cy = viewH / 2;
  const d01 = pairDists[0],
    d02 = pairDists[1],
    d12 = pairDists[2];

  // Triangle inequality check — if the pairwise distances cannot form a
  // valid triangle, the layout will only approximate the requested overlaps.
  const feasible = d01 <= d02 + d12 + 1e-6 && d02 <= d01 + d12 + 1e-6 && d12 <= d01 + d02 + 1e-6;
  if (!feasible) {
    warnings.push(
      "Pairwise overlaps are geometrically inconsistent (triangle inequality violated) — layout approximated"
    );
  }

  const ax = 0,
    ay = 0;
  const bx = d01,
    by = 0;
  const tcx = d01 > 1e-9 ? (d02 * d02 - d12 * d12 + d01 * d01) / (2 * d01) : 0;
  const tcySq = d02 * d02 - tcx * tcx;
  const tcy = tcySq > 0 ? -Math.sqrt(tcySq) : 0;
  const triPts = [
    { x: ax, y: ay },
    { x: bx, y: by },
    { x: tcx, y: tcy },
  ];
  const triCentX = (ax + bx + tcx) / 3,
    triCentY = (ay + by + tcy) / 3;
  const triCentered = triPts.map((p) => ({ x: p.x - triCentX, y: p.y - triCentY }));

  let pts;
  if (hasSubsets) {
    pts = triCentered;
  } else {
    // Cosmetic regularization: if the triangulation gives a very flat triangle,
    // nudge towards equilateral so downstream refinement has a sensible start.
    const avgDist = (d01 + d02 + d12) / 3;
    const eqAngles = [-Math.PI / 6, (-5 * Math.PI) / 6, Math.PI / 2];
    const eqPts = eqAngles.map((a) => ({
      x: avgDist * 0.6 * Math.cos(a),
      y: avgDist * 0.6 * Math.sin(a),
    }));
    const mix = Math.abs(tcy) < avgDist * 0.15 ? 0.4 : 0.85;
    pts = triCentered.map((p, i) => ({
      x: p.x * mix + eqPts[i].x * (1 - mix),
      y: p.y * mix + eqPts[i].y * (1 - mix),
    }));
  }

  const centX = pts.reduce((s, p) => s + p.x, 0) / 3;
  const centY = pts.reduce((s, p) => s + p.y, 0) / 3;
  let propCircles = pts.map((p, i) => ({
    cx: cx + (p.x - centX),
    cy: cy + (p.y - centY),
    r: radii[i],
  }));

  // Refine the purely proportional layout before any readability blend.
  if (!hasSubsets) {
    propCircles = refine3SetLayout(propCircles, intersections, targetScale);
  }

  let working = propCircles;
  if (blend > 0) {
    const classicR = Math.min(viewW, viewH) * 0.3;
    const classicD = classicR * 0.65;
    const classicAngles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    const classicCircles = classicAngles.map((a) => ({
      cx: cx + classicD * Math.cos(a),
      cy: cy + classicD * Math.sin(a),
      r: classicR,
    }));
    working = propCircles.map((pc, i) => ({
      cx: pc.cx * (1 - blend) + classicCircles[i].cx * blend,
      cy: pc.cy * (1 - blend) + classicCircles[i].cy * blend,
      r: pc.r * (1 - blend) + classicCircles[i].r * blend,
    }));
  }

  const { circles: fixed, warnings: fixWarnings } = validateAndFixLayout(
    working,
    setNames,
    sets,
    subsets,
    disjoint
  );
  warnings.push(...fixWarnings);

  const errors = computeLayoutError(fixed, intersections, targetScale);
  return {
    circles: fitCirclesToViewport(fixed, viewW, viewH),
    warnings,
    proportional: warnings.length === 0,
    maxError: errors.maxError,
    meanError: errors.meanError,
  };
}

// ── Non-proportional Layouts ─────────────────────────────────────────────────

export function buildVenn2LayoutClassic(setNames, sets, intersections, viewW, viewH) {
  const R = Math.min(viewW, viewH) * 0.272;
  const cx = viewW / 2,
    cy = viewH / 2;
  // Overlap so all regions are visible — distance = R (moderate overlap)
  const d = R;
  const circles = [
    { cx: cx - d / 2, cy, r: R },
    { cx: cx + d / 2, cy, r: R },
  ];
  return {
    circles: fitCirclesToViewport(circles, viewW, viewH),
    warnings: [],
    proportional: false,
    maxError: 0,
    meanError: 0,
  };
}

export function buildVenn3LayoutClassic(setNames, sets, intersections, viewW, viewH) {
  const R = Math.min(viewW, viewH) * 0.24;
  const cx = viewW / 2,
    cy = viewH / 2;
  // Equilateral triangle, top vertex pointing up
  // d = 0.65R gives ~35% pairwise overlap — clear regions for all 7 zones
  const d = R * 0.65;
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  const circles = angles.map((a) => ({
    cx: cx + d * Math.cos(a),
    cy: cy + d * Math.sin(a),
    r: R,
  }));
  return {
    circles: fitCirclesToViewport(circles, viewW, viewH),
    warnings: [],
    proportional: false,
    maxError: 0,
    meanError: 0,
  };
}

// ── Region Centroids (for label placement) ───────────────────────────────────

export function computeRegionCentroids(circles, regionPaths, intersections) {
  // Place labels at the "visual center" of each exclusive region:
  // sample the bounding box, for points matching the region's bitmask compute
  // the minimum distance to any region boundary (circle edges), then pick
  // the point that is furthest from all boundaries (the most interior point).
  const centroids = {};
  const bbox = {
    x1: Math.min(...circles.map((c) => c.cx - c.r)) - 5,
    y1: Math.min(...circles.map((c) => c.cy - c.r)) - 5,
    x2: Math.max(...circles.map((c) => c.cx + c.r)) + 5,
    y2: Math.max(...circles.map((c) => c.cy + c.r)) + 5,
  };
  const n = circles.length;
  const step = Math.max(bbox.x2 - bbox.x1, bbox.y2 - bbox.y1) / 150;

  for (const inter of intersections) {
    const mask = inter.mask;
    let bestX = 0,
      bestY = 0,
      bestDist = -1;
    for (let x = bbox.x1; x <= bbox.x2; x += step) {
      for (let y = bbox.y1; y <= bbox.y2; y += step) {
        let m = 0;
        for (let i = 0; i < n; i++) {
          if (isInsideCircle(x, y, circles[i])) m |= 1 << i;
        }
        if (m !== mask) continue;
        // Minimum distance to any circle boundary
        let minEdgeDist = Infinity;
        for (let i = 0; i < n; i++) {
          const dx = x - circles[i].cx,
            dy = y - circles[i].cy;
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
