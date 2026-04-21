// Tests for the UpSet pure helpers (parsing + intersection math).
// Source: tools/shared.js (parseSetData, parseLongFormatSets) and tools/upset.tsx.

const { suite, test, assert, eq, throws, summary } = require("./harness");
const {
  parseSetData,
  parseLongFormatSets,
  computeMemberships,
  enumerateIntersections,
  sortIntersections,
  truncateIntersections,
  intersectionLabel,
  intersectionFilenamePart,
  buildBarTicks,
  shouldRotateColumnIds,
} = require("./helpers/upset-loader");

// ── parseSetData ─────────────────────────────────────────────────────────────

suite("parseSetData");

test("trims whitespace and drops blank cells", () => {
  const { setNames, sets } = parseSetData(
    ["A", "B"],
    [
      [" a1 ", "b1"],
      ["a2", " "],
      ["", "b2"],
    ]
  );
  eq(setNames, ["A", "B"]);
  eq([...sets.get("A")].sort(), ["a1", "a2"]);
  eq([...sets.get("B")].sort(), ["b1", "b2"]);
});

test("preserves column order in setNames", () => {
  const { setNames } = parseSetData(
    ["Z", "A", "M"],
    [
      ["z1", "a1", "m1"],
      ["z2", "a2", "m2"],
    ]
  );
  eq(setNames, ["Z", "A", "M"]);
});

test("drops columns with zero non-empty cells", () => {
  const { setNames, sets } = parseSetData(
    ["A", "Empty", "B"],
    [
      ["a1", "", "b1"],
      ["a2", "", "b2"],
    ]
  );
  eq(setNames, ["A", "B"]);
  assert(!sets.has("Empty"));
});

test("handles ragged rows without throwing", () => {
  const { sets } = parseSetData(["A", "B", "C"], [["a1", "b1"], ["a2"], ["a3", "b2", "c1"]]);
  eq([...sets.get("A")].sort(), ["a1", "a2", "a3"]);
  eq([...sets.get("B")].sort(), ["b1", "b2"]);
  eq([...sets.get("C")], ["c1"]);
});

// ── parseLongFormatSets ─────────────────────────────────────────────────────

suite("parseLongFormatSets");

test("pivots a 2-column (item, set) table", () => {
  const { setNames, sets } = parseLongFormatSets(
    ["gene", "condition"],
    [
      ["g1", "drought"],
      ["g2", "drought"],
      ["g1", "heat"],
      ["g3", "heat"],
    ]
  );
  eq(setNames, ["drought", "heat"]);
  eq([...sets.get("drought")].sort(), ["g1", "g2"]);
  eq([...sets.get("heat")].sort(), ["g1", "g3"]);
});

test("deduplicates repeated (item, set) pairs", () => {
  const { sets } = parseLongFormatSets(
    ["gene", "condition"],
    [
      ["g1", "A"],
      ["g1", "A"],
      ["g1", "A"],
    ]
  );
  eq([...sets.get("A")], ["g1"]);
});

test("skips rows with blank item or blank set name", () => {
  const { setNames, sets } = parseLongFormatSets(
    ["gene", "condition"],
    [
      ["g1", "A"],
      ["", "A"],
      ["g2", ""],
      ["g3", "B"],
    ]
  );
  eq(setNames, ["A", "B"]);
  eq([...sets.get("A")], ["g1"]);
  eq([...sets.get("B")], ["g3"]);
});

test("rejects tables that are not exactly 2 columns", () => {
  throws(() => parseLongFormatSets(["only"], [["x"]]));
  throws(() => parseLongFormatSets(["a", "b", "c"], [["x", "y", "z"]]));
});

// ── computeMemberships ───────────────────────────────────────────────────────

suite("computeMemberships");

test("bit i of the mask corresponds to setNames[i]", () => {
  const setNames = ["A", "B", "C"];
  const sets = new Map([
    ["A", new Set(["x", "y"])],
    ["B", new Set(["y", "z"])],
    ["C", new Set(["z", "w"])],
  ]);
  const { membershipMap } = computeMemberships(setNames, sets);
  eq(membershipMap.get("x"), 0b001); // only A
  eq(membershipMap.get("y"), 0b011); // A and B
  eq(membershipMap.get("z"), 0b110); // B and C
  eq(membershipMap.get("w"), 0b100); // only C
});

test("ignores items in sets whose name is not in setNames", () => {
  const setNames = ["A"];
  const sets = new Map([
    ["A", new Set(["x"])],
    ["Ghost", new Set(["y"])],
  ]);
  const { membershipMap } = computeMemberships(setNames, sets);
  eq(membershipMap.size, 1);
  eq(membershipMap.get("x"), 1);
});

// ── enumerateIntersections ──────────────────────────────────────────────────

suite("enumerateIntersections");

test("4-set fixture — exclusive intersections match hand computation", () => {
  // Items:
  //   a — in {A}
  //   b — in {B}
  //   c — in {A, B}
  //   d — in {A, B, C}
  //   e — in {A, B, C, D}
  //   f — in {C, D}
  const setNames = ["A", "B", "C", "D"];
  const sets = new Map([
    ["A", new Set(["a", "c", "d", "e"])],
    ["B", new Set(["b", "c", "d", "e"])],
    ["C", new Set(["d", "e", "f"])],
    ["D", new Set(["e", "f"])],
  ]);
  const { membershipMap } = computeMemberships(setNames, sets);
  const out = enumerateIntersections(membershipMap, setNames);
  const byMask = new Map(out.map((r) => [r.mask, r]));
  // {A} only — bit 0 — mask 0b0001 = 1
  eq(byMask.get(1).items, ["a"]);
  // {B} only — mask 0b0010 = 2
  eq(byMask.get(2).items, ["b"]);
  // {A, B} — mask 0b0011 = 3
  eq(byMask.get(3).items, ["c"]);
  // {A, B, C} — mask 0b0111 = 7
  eq(byMask.get(7).items, ["d"]);
  // {A, B, C, D} — mask 0b1111 = 15
  eq(byMask.get(15).items, ["e"]);
  // {C, D} — mask 0b1100 = 12
  eq(byMask.get(12).items, ["f"]);
});

test("excludes mask === 0 and empty intersections", () => {
  const setNames = ["A", "B"];
  const sets = new Map([
    ["A", new Set(["x"])],
    ["B", new Set(["x"])],
  ]);
  const { membershipMap } = computeMemberships(setNames, sets);
  const out = enumerateIntersections(membershipMap, setNames);
  // Only {A, B} has an item; {A}-only and {B}-only are empty and excluded.
  eq(out.length, 1);
  eq(out[0].mask, 3);
  eq(out[0].items, ["x"]);
});

test("setIndices is sorted ascending and matches degree", () => {
  const setNames = ["A", "B", "C"];
  const sets = new Map([
    ["A", new Set(["x"])],
    ["B", new Set(["x"])],
    ["C", new Set(["x"])],
  ]);
  const { membershipMap } = computeMemberships(setNames, sets);
  const [inter] = enumerateIntersections(membershipMap, setNames);
  eq(inter.setIndices, [0, 1, 2]);
  eq(inter.degree, 3);
});

// ── sortIntersections ───────────────────────────────────────────────────────

suite("sortIntersections");

const fixture = [
  { mask: 0b001, setIndices: [0], degree: 1, size: 5, items: [] },
  { mask: 0b010, setIndices: [1], degree: 1, size: 2, items: [] },
  { mask: 0b100, setIndices: [2], degree: 1, size: 5, items: [] },
  { mask: 0b011, setIndices: [0, 1], degree: 2, size: 3, items: [] },
  { mask: 0b111, setIndices: [0, 1, 2], degree: 3, size: 1, items: [] },
];

test("size-desc sorts largest first; ties break on ascending mask", () => {
  const out = sortIntersections(fixture, "size-desc").map((r) => r.mask);
  // Two size=5 rows — tie broken by mask asc: 0b001 before 0b100.
  eq(out, [0b001, 0b100, 0b011, 0b010, 0b111]);
});

test("size-asc sorts smallest first", () => {
  const out = sortIntersections(fixture, "size-asc").map((r) => r.mask);
  eq(out, [0b111, 0b010, 0b011, 0b001, 0b100]);
});

test("degree-asc sorts lowest degree first; ties break on size desc then mask asc", () => {
  const out = sortIntersections(fixture, "degree-asc").map((r) => r.mask);
  eq(out, [0b001, 0b100, 0b010, 0b011, 0b111]);
});

test("degree-desc sorts highest degree first", () => {
  const out = sortIntersections(fixture, "degree-desc").map((r) => r.mask);
  eq(out, [0b111, 0b011, 0b001, 0b100, 0b010]);
});

test("sets mode sorts by setIndices lexicographically", () => {
  const out = sortIntersections(fixture, "sets").map((r) => r.mask);
  // [0] < [0,1] < [0,1,2] < [1] < [2]
  eq(out, [0b001, 0b011, 0b111, 0b010, 0b100]);
});

test("unknown mode falls back to size-desc", () => {
  const out = sortIntersections(fixture, "whatever").map((r) => r.mask);
  eq(out, [0b001, 0b100, 0b011, 0b010, 0b111]);
});

// ── truncateIntersections ───────────────────────────────────────────────────

suite("truncateIntersections");

const sizedFixture = [
  { mask: 1, size: 10, setIndices: [0], degree: 1, items: [] },
  { mask: 2, size: 7, setIndices: [1], degree: 1, items: [] },
  { mask: 3, size: 3, setIndices: [0, 1], degree: 2, items: [] },
  { mask: 4, size: 1, setIndices: [2], degree: 1, items: [] },
  { mask: 5, size: 0, setIndices: [0, 2], degree: 2, items: [] },
];

test("minSize filters out smaller rows", () => {
  eq(
    truncateIntersections(sizedFixture, { minSize: 3 }).map((r) => r.mask),
    [1, 2, 3]
  );
});

test("minDegree filters out lower-degree rows", () => {
  // Drop the default minSize=1 floor so this test isolates the degree cut:
  // rows with degree ≥ 2 are masks 3 (degree 2, size 3) and 5 (degree 2,
  // size 0). The default minSize=1 would exclude mask 5; we pass
  // minSize=0 here to verify the minDegree branch in isolation.
  eq(
    truncateIntersections(sizedFixture, { minDegree: 2, minSize: 0 }).map((r) => r.mask),
    [3, 5]
  );
});

test("combined minSize + minDegree filters on both conditions", () => {
  // degree ≥ 2 AND size ≥ 2 → only mask 3 (degree 2, size 3). mask 5 has
  // size 0 which fails minSize.
  eq(
    truncateIntersections(sizedFixture, { minSize: 2, minDegree: 2 }).map((r) => r.mask),
    [3]
  );
});

test("default thresholds pass every row with size ≥ 1 and degree ≥ 1", () => {
  // mask 5 has size 0, which is the only reason it gets dropped by default.
  eq(
    truncateIntersections(sizedFixture).map((r) => r.mask),
    [1, 2, 3, 4]
  );
});

test("maxDegree caps degree from above", () => {
  // maxDegree=1 keeps only singletons (degree 1): masks 1, 2, 4. minSize=0 so
  // size-0 rows aren't incidentally dropped.
  eq(
    truncateIntersections(sizedFixture, { maxDegree: 1, minSize: 0 }).map((r) => r.mask),
    [1, 2, 4]
  );
});

test("minDegree + maxDegree define a closed window", () => {
  // degree window [2, 2] keeps masks 3 and 5 (both degree 2), regardless of size.
  eq(
    truncateIntersections(sizedFixture, { minDegree: 2, maxDegree: 2, minSize: 0 }).map(
      (r) => r.mask
    ),
    [3, 5]
  );
});

// ── buildBarTicks ───────────────────────────────────────────────────────────

suite("buildBarTicks");

test("returns [0, 1] when max ≤ 0 so the axis doesn't divide by zero", () => {
  eq(buildBarTicks(0, 4), [0, 1]);
  eq(buildBarTicks(-5, 4), [0, 1]);
});

test("first tick is always 0", () => {
  for (const max of [3, 28, 100, 237]) {
    const ticks = buildBarTicks(max, 4);
    eq(ticks[0], 0);
  }
});

test("last tick is strictly greater than the data max", () => {
  for (const max of [1, 3, 7, 28, 100, 237]) {
    const ticks = buildBarTicks(max, 4);
    assert(
      ticks[ticks.length - 1] > max,
      `expected last tick > ${max}, got ${ticks[ticks.length - 1]}`
    );
  }
});

test("ticks are equally spaced (±1e-9)", () => {
  for (const max of [3, 7, 28, 100, 237]) {
    const ticks = buildBarTicks(max, 4);
    if (ticks.length < 3) continue;
    const step = ticks[1] - ticks[0];
    for (let i = 2; i < ticks.length; i++) {
      const gap = ticks[i] - ticks[i - 1];
      assert(Math.abs(gap - step) < 1e-9, `step drift at index ${i}: expected ${step}, got ${gap}`);
    }
  }
});

// ── intersectionLabel / intersectionFilenamePart ────────────────────────────

suite("intersectionLabel / intersectionFilenamePart");

test("label joins with ∩ in setName order", () => {
  eq(intersectionLabel([0, 2], ["Drought", "Heat", "Salt"]), "Drought ∩ Salt");
});

test("filename part converts ∩ to _and_ and strips non-ASCII", () => {
  const label = intersectionLabel([0, 1], ["α-set", "β-set"]);
  const slug = intersectionFilenamePart(label);
  // Greek letters are stripped; the intersection marker becomes "and".
  assert(!/[α-ωΑ-Ω]/.test(slug), "non-ASCII should be stripped");
  assert(/and/.test(slug), "∩ should be replaced with 'and'");
});

test("distinct intersections produce distinct filename parts (no collision)", () => {
  const a = intersectionFilenamePart(intersectionLabel([0, 1], ["Drought", "Heat", "Salt"]));
  const b = intersectionFilenamePart(intersectionLabel([0, 2], ["Drought", "Heat", "Salt"]));
  const c = intersectionFilenamePart(intersectionLabel([1, 2], ["Drought", "Heat", "Salt"]));
  assert(a !== b && b !== c && a !== c, "labels must not collide");
});

test("handles spaces in set names", () => {
  const label = intersectionLabel([0, 1], ["Set A", "Set B"]);
  eq(label, "Set A ∩ Set B");
  eq(intersectionFilenamePart(label), "Set_A_and_Set_B");
});

// ── shouldRotateColumnIds ────────────────────────────────────────────────────
// Regression tests for the rotation heuristic that keeps "I#" labels readable
// past the collision threshold. Previously used a magic `nCols > 10` cutoff;
// now compares the horizontal label width against the column width so it
// adapts to font size and any future colW change.

suite("shouldRotateColumnIds");

test("does not rotate when horizontal label fits inside the column", () => {
  // 5 columns → "I5" is 2 chars, width ≈ 2 * 10 * 0.58 = 11.6 px. colW at the
  // MAX_COL_W cap is 36 px → plenty of room, no rotation needed.
  assert(!shouldRotateColumnIds(5, 36, 10), "5 cols in 36 px columns should not rotate");
});

test("rotates when horizontal label would overflow the column", () => {
  // At the MIN_COL_W floor (18 px) and default idFontSize (10), any nCols ≥ 4
  // produces a label ("I4" onward) wide enough to crowd or overflow — the
  // original complaint was ≥10 columns, which always hits this branch.
  assert(shouldRotateColumnIds(20, 18, 10), "20 cols at 18 px should rotate");
  assert(shouldRotateColumnIds(100, 18, 10), "100 cols at 18 px should rotate");
});

test("threshold is colW-aware, not a fixed nCols cutoff", () => {
  // Identical nCols but different colW must reach opposite decisions —
  // this is the property the old `nCols > 10` check lacked.
  const sameN = 12;
  assert(!shouldRotateColumnIds(sameN, 36, 10), "12 cols in 36 px columns stays horizontal");
  assert(shouldRotateColumnIds(sameN, 18, 10), "12 cols in 18 px columns rotates");
});

test("threshold scales with idFontSize", () => {
  // Larger font widens the horizontal label, so the same layout that was OK at
  // fontSize 8 can tip into rotation at fontSize 10. At nCols=99 the label is
  // 3 chars ("I99") → widths are 3*8*0.58 = 13.92 vs 3*10*0.58 = 17.4, which
  // straddle a colW of 18.
  const nCols = 99;
  const colW = 18;
  assert(!shouldRotateColumnIds(nCols, colW, 8), "8 px font keeps labels horizontal");
  assert(shouldRotateColumnIds(nCols, colW, 10), "10 px font forces rotation");
});

test("guards against empty input (nCols = 0)", () => {
  // Shouldn't throw on String(0).length — the clamp to max(1, nCols) handles it
  // and a single-digit "I#" comfortably fits any reasonable colW.
  assert(!shouldRotateColumnIds(0, 36, 10), "0 cols should not rotate");
});

summary();
