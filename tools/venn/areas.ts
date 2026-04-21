// Closed-form region-area math for 2 and 3 proportional circles:
// triangle / chord-segment primitives, the triple-intersection decomposition,
// the per-region area map keyed by bitmask, and a relative-error metric the
// refinement loop uses to decide whether a candidate layout is better than
// the incumbent.

import { circleIntersectionPoints, circleOverlapArea, isInsideCircle } from "./geometry";

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
