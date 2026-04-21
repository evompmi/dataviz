// Visual-centroid finder for Venn region labels. For each intersection
// region, samples the bounding box, keeps points whose membership bitmask
// matches the region, and returns the one whose minimum distance to any
// circle boundary is maximal (i.e., the most interior point). This is what
// the chart uses to place the region count text.

import { isInsideCircle } from "./geometry";

export function computeRegionCentroids(circles, regionPaths, intersections) {
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
