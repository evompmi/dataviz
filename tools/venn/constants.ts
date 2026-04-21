// Proportional-layout magic numbers + the auto-prefs seed for the Venn tool.
// Separated from the geometry/layout code so the constants have an obvious
// home and `venn.tsx` can import VIS_INIT_VENN without pulling in the full
// layout module graph.

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
