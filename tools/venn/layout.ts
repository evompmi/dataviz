// Layout assembly for 2- and 3-set Venns. Builds the proportional layout
// (radii from set sizes, pair distances from overlap areas, optional
// coordinate-descent refinement for 3 sets), blends towards a readable
// classic layout when requested, and runs the containment/separation
// validator that repairs subset / disjoint / overlap configurations.
// `buildVenn2LayoutClassic` / `buildVenn3LayoutClassic` are the hard-coded
// non-proportional fallbacks.

import { solveDistance } from "./geometry";
import { computeAllRegionAreas, computeLayoutError } from "./areas";
import { detectDisjoint, detectSubsets } from "./set-math";
import { VENN_CONFIG } from "./constants";

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

// ── Non-proportional fallbacks ──────────────────────────────────────────────

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
