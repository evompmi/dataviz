// Barrel re-export for the Venn tool's pure helpers. Consumers (venn.tsx,
// tests/helpers/venn-loader.js) import from here; the actual code lives in
// cohesion-keyed sibling modules:
//
//   constants.ts — VENN_CONFIG, VIS_INIT_VENN
//   set-math.ts  — intersection enumeration, region labels, subset/disjoint detection
//   geometry.ts  — circle overlap, intersection points, region-path assembly
//   areas.ts     — closed-form region areas + layout-error metric
//   layout.ts    — proportional + classic layout builders, validator, refinement loop
//   centroids.ts — visual-centroid finder for region labels
//
// The split replaces a single 965-line `helpers.ts` grab-bag with six files
// keyed on what the code *does*, so navigation no longer depends on
// remembering which section marker a symbol lives under.

export { VENN_CONFIG, VIS_INIT_VENN } from "./constants";
export {
  computeIntersections,
  regionLabel,
  regionFilenamePart,
  detectSubsets,
  detectDisjoint,
} from "./set-math";
export {
  circleOverlapArea,
  solveDistance,
  circleIntersectionPoints,
  isInsideCircle,
  normAngle,
  buildRegionPaths,
} from "./geometry";
export {
  triangleArea,
  chordSegmentArea,
  tripleIntersectionArea,
  computeAllRegionAreas,
  computeLayoutError,
} from "./areas";
export {
  validateAndFixLayout,
  fitCirclesToViewport,
  clampRadii,
  refine3SetLayout,
  buildVenn2Layout,
  buildVenn3Layout,
  buildVenn2LayoutClassic,
  buildVenn3LayoutClassic,
} from "./layout";
export { computeRegionCentroids } from "./centroids";
