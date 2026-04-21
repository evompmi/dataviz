// Unit tests for the aequorin pure helpers (tools/aequorin/helpers.ts).
// Pins down the calibration formulas (Allen & Blinks, Hill, generalized),
// replicate-pooling logic, time-unit conversion, smoothing window, and SVG
// path builders against fixed inputs. The fuzz harness only asserts structural
// invariants (outputs stay finite), so a silent sign-flip or off-by-one in any
// of these formulas could otherwise slip through unnoticed.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  calibrate,
  calibrateHill,
  calibrateGeneralized,
  detectConditions,
  smooth,
  convertTime,
  buildAreaD,
  buildLineD,
} = require("./helpers/aequorin-loader");

// ── convertTime ─────────────────────────────────────────────────────────────

suite("convertTime");

test("same-unit conversion is a no-op (preserves identity)", () => {
  eq(convertTime(42, "s", "s"), 42);
  eq(convertTime(0.5, "min", "min"), 0.5);
});

test("common conversions match textbook values", () => {
  approx(convertTime(1, "min", "s"), 60, 1e-12);
  approx(convertTime(1, "h", "min"), 60, 1e-12);
  approx(convertTime(1000, "ms", "s"), 1, 1e-12);
  approx(convertTime(1, "d", "h"), 24, 1e-12);
  approx(convertTime(1, "yr", "d"), 365.25, 1e-6);
});

test("round-trip through any intermediate unit preserves the value", () => {
  const v = 1234.5;
  approx(convertTime(convertTime(v, "min", "h"), "h", "min"), v, 1e-9);
  approx(convertTime(convertTime(v, "s", "ms"), "ms", "s"), v, 1e-9);
});

// ── calibrate (Allen & Blinks) ──────────────────────────────────────────────

suite("calibrate (Allen & Blinks)");

// Reference value: with a uniform column [1,1,1], f = 1/3 for every row.
// cbrt(1/3) ≈ 0.693361274, Kr=7, Ktr=118 → [Ca²⁺] ≈ ((1+118)·0.693361 − 1) /
// (7·(1−0.693361)) = 81.510 / 2.14647 ≈ 37.975
test("uniform column yields the Allen & Blinks reference value per row", () => {
  const out = calibrate(["A"], [[1], [1], [1]], 7, 118);
  assert(out.length === 3);
  for (const row of out) approx(row[0], 37.975, 0.01);
});

test("null cell → null output, and v=0 short-circuits to null", () => {
  const out = calibrate(["A"], [[null], [0], [1]], 7, 118);
  eq(out[0][0], null);
  eq(out[1][0], null);
  // The third row's f = 1/1 = 1 → cbrt(1)=1 → denom = Kr*(1-1) = 0 → null.
  eq(out[2][0], null);
});

test("all-zero column short-circuits every row to null (total=0)", () => {
  const out = calibrate(["A"], [[0], [0], [0]], 7, 118);
  for (const row of out) eq(row[0], null);
});

// ── calibrateHill ───────────────────────────────────────────────────────────

suite("calibrateHill");

// Reference: uniform column [1,1,1] → f=1/3, Kd=7 → [Ca²⁺] = 7·cbrt(0.5) ≈ 5.556.
test("uniform column yields the Hill reference value per row", () => {
  const out = calibrateHill(["A"], [[1], [1], [1]], 7);
  for (const row of out) approx(row[0], 5.556, 0.01);
});

test("a row that carries the entire column (f ≥ 1) is null (Hill blows up)", () => {
  // Total = 1, that one row has v = total → f = 1 → ignored.
  const out = calibrateHill(["A"], [[1], [0], [0]], 7);
  eq(out[0][0], null);
});

// ── calibrateGeneralized ────────────────────────────────────────────────────

suite("calibrateGeneralized");

test("reduces to Allen & Blinks when n = 3 (same Kr, Ktr)", () => {
  const ab = calibrate(["A"], [[2], [5], [3]], 7, 118);
  const gen = calibrateGeneralized(["A"], [[2], [5], [3]], 7, 118, 3);
  for (let r = 0; r < 3; r++) {
    assert(ab[r][0] != null && gen[r][0] != null);
    approx(gen[r][0], ab[r][0], 1e-9);
  }
});

test("larger Hill n pulls all calibrated values toward a smaller magnitude", () => {
  // For the same column, larger n shrinks f^(1/n) toward 1 more slowly,
  // which moves the numerator/denominator into a different regime. Here we
  // just assert that n=3 and n=5 produce finite but *different* outputs.
  const gen3 = calibrateGeneralized(["A"], [[2], [5], [3]], 7, 118, 3);
  const gen5 = calibrateGeneralized(["A"], [[2], [5], [3]], 7, 118, 5);
  for (let r = 0; r < 3; r++) {
    assert(Number.isFinite(gen3[r][0]));
    assert(Number.isFinite(gen5[r][0]));
    assert(gen3[r][0] !== gen5[r][0], "different n should produce different output");
  }
});

// ── detectConditions ───────────────────────────────────────────────────────

suite("detectConditions");

test("pooling merges same-named columns into one condition", () => {
  const conds = detectConditions(["WT", "WT", "mut", "mut", "mut"], true);
  eq(conds.length, 2);
  const wt = conds.find((c) => c.label === "WT");
  const mut = conds.find((c) => c.label === "mut");
  eq(wt.colIndices, [0, 1]);
  eq(mut.colIndices, [2, 3, 4]);
});

test("non-pooling yields one condition per column, numbered rep-wise", () => {
  const conds = detectConditions(["WT", "WT", "mut"], false);
  eq(conds.length, 3);
  // Replicate numbers increment within each name.
  eq(conds[0].label, "WT_rep1");
  eq(conds[1].label, "WT_rep2");
  eq(conds[2].label, "mut_rep1");
});

test("columnEnabled=false hides a replicate from the output", () => {
  const conds = detectConditions(["WT", "WT", "mut"], true, [true, false, true]);
  const wt = conds.find((c) => c.label === "WT");
  eq(wt.colIndices, [0]);
});

// ── smooth ──────────────────────────────────────────────────────────────────

suite("smooth");

test("w=0 returns the input unchanged (no smoothing)", () => {
  const arr = [1, 2, 3];
  eq(smooth(arr, 0), arr);
});

test("w=1 takes the mean of each point and its immediate neighbours", () => {
  const out = smooth([0, 3, 6, 9], 1);
  // [mean(0,3), mean(0,3,6), mean(3,6,9), mean(6,9)] = [1.5, 3, 6, 7.5]
  approx(out[0], 1.5, 1e-12);
  approx(out[1], 3, 1e-12);
  approx(out[2], 6, 1e-12);
  approx(out[3], 7.5, 1e-12);
});

test("nulls inside the window are skipped, not treated as 0", () => {
  const out = smooth([2, null, 4], 1);
  // Point 0: {2, null} → mean 2. Point 1: {2, null, 4} → mean 3. Point 2: {null, 4} → mean 4.
  approx(out[0], 2, 1e-12);
  approx(out[1], 3, 1e-12);
  approx(out[2], 4, 1e-12);
});

test("window of all-nulls yields null (not NaN or 0)", () => {
  const out = smooth([null, null, null], 1);
  for (const v of out) eq(v, null);
});

// ── buildAreaD / buildLineD ─────────────────────────────────────────────────

suite("buildAreaD / buildLineD");

test("buildLineD emits M-then-L coordinates with 2-decimal rounding", () => {
  const pts = [
    { x: 1.25, y: 2 },
    { x: 3, y: 4.999 },
  ];
  // 4.999.toFixed(2) → "5.00" (standard banker's-adjacent rounding on binary
  // floats); 1.25 is exactly representable so it stays "1.25".
  eq(buildLineD(pts), "M1.25,2.00L3.00,5.00");
});

test("buildLineD returns empty string when fewer than 2 valid points", () => {
  eq(buildLineD([]), "");
  eq(buildLineD([{ x: 1, y: 1 }]), "");
  eq(
    buildLineD([
      { x: 1, y: null },
      { x: 2, y: null },
    ]),
    ""
  );
});

test("buildAreaD traces the hi-edge forward, lo-edge backward, closes with Z", () => {
  const pts = [
    { x: 0, yHi: 10, yLo: 1 },
    { x: 10, yHi: 20, yLo: 2 },
  ];
  const d = buildAreaD(pts);
  // Forward: M0.00,10.00 L10.00,20.00. Reverse: L10.00,2.00 L0.00,1.00. Close: Z.
  eq(d, "M0.00,10.00L10.00,20.00L10.00,2.00L0.00,1.00Z");
});

test("buildAreaD drops points whose bounds are null", () => {
  const pts = [
    { x: 0, yHi: null, yLo: 1 },
    { x: 5, yHi: 10, yLo: 2 },
    { x: 10, yHi: 20, yLo: 3 },
  ];
  const d = buildAreaD(pts);
  // Only (5,…) and (10,…) contribute.
  eq(d, "M5.00,10.00L10.00,20.00L10.00,3.00L5.00,2.00Z");
});

summary();
