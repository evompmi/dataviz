// Pure 2D circle geometry: overlap area, distance ↔ overlap inversion,
// intersection points, inside-circle test, angle normalisation, and the
// region-path assembler that turns a list of circles into SVG path strings
// keyed by region bitmask. Consumed by areas.ts, centroids.ts, and layout.ts.

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
