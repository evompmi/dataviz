// Pure set-theoretic helpers for Venn: enumerate intersection regions from
// raw item membership, build human-readable and filename-safe region labels,
// and detect the two degenerate configurations (subsets, disjoint pairs) that
// the layout validator has to repair.

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

// Detect all subset relationships between sets.
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

// Detect disjoint pairs (no shared items).
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
