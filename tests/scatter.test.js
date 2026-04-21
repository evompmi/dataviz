// Unit tests for the scatter pure helpers (tools/scatter/helpers.ts).
// Covers fmtTick formatting rules, the SHAPES catalogue, and the linear
// regression math that the fuzz harness only exercises structurally.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const { fmtTick, SHAPES, computeLinearRegression } = require("./helpers/scatter-loader");

// ── fmtTick ─────────────────────────────────────────────────────────────────

suite("fmtTick");

test("zero renders as plain '0'", () => {
  eq(fmtTick(0), "0");
});

test("values ≥ 10000 switch to exponential notation", () => {
  eq(fmtTick(10000), "1.0e+4");
  eq(fmtTick(123456), "1.2e+5");
});

test("very small non-zero values switch to exponential", () => {
  eq(fmtTick(0.001), "1.0e-3");
  eq(fmtTick(-0.00005), "-5.0e-5");
});

test("values between 100 and 10000 render as integers", () => {
  eq(fmtTick(100), "100");
  eq(fmtTick(1234.56), "1235");
});

test("mid-range values use toPrecision(3) with trailing zeros stripped", () => {
  eq(fmtTick(1), "1");
  eq(fmtTick(1.5), "1.5");
  eq(fmtTick(0.5), "0.5");
  eq(fmtTick(0.123456), "0.123");
});

// ── SHAPES ──────────────────────────────────────────────────────────────────

suite("SHAPES");

test("exposes the four point-marker shapes in stable order", () => {
  eq(SHAPES, ["circle", "triangle", "cross", "square"]);
});

// ── computeLinearRegression ─────────────────────────────────────────────────

suite("computeLinearRegression");

test("recovers a perfect y = 2x + 1 relationship (r² = 1)", () => {
  const rows = [0, 1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1 }));
  const r = computeLinearRegression(rows, "x", "y");
  assert(r.valid, "regression should be valid");
  approx(r.slope, 2, 1e-10);
  approx(r.intercept, 1, 1e-10);
  approx(r.r2, 1, 1e-10);
  eq(r.n, 5);
});

test("recovers a negative slope", () => {
  const rows = [0, 1, 2, 3].map((x) => ({ x, y: -3 * x + 10 }));
  const r = computeLinearRegression(rows, "x", "y");
  approx(r.slope, -3, 1e-10);
  approx(r.intercept, 10, 1e-10);
  approx(r.r2, 1, 1e-10);
});

test("returns {valid:false} for fewer than 2 points", () => {
  eq(computeLinearRegression([], "x", "y"), { valid: false });
  eq(computeLinearRegression([{ x: 1, y: 2 }], "x", "y"), { valid: false });
  eq(computeLinearRegression(null, "x", "y"), { valid: false });
});

test("returns {valid:false} when all x values are identical (zero x variance)", () => {
  const rows = [
    { x: 5, y: 1 },
    { x: 5, y: 2 },
    { x: 5, y: 3 },
  ];
  eq(computeLinearRegression(rows, "x", "y"), { valid: false });
});

test("skips rows with null / NaN in either column", () => {
  const rows = [
    { x: 0, y: 1 },
    { x: 1, y: null },
    { x: 2, y: 5 },
    { x: NaN, y: 7 },
    { x: 4, y: 9 },
  ];
  const r = computeLinearRegression(rows, "x", "y");
  assert(r.valid);
  eq(r.n, 3);
  // Fit on (0,1), (2,5), (4,9): perfect slope 2, intercept 1.
  approx(r.slope, 2, 1e-10);
  approx(r.intercept, 1, 1e-10);
  approx(r.r2, 1, 1e-10);
});

test("r² is NaN when y is degenerate but x is not", () => {
  const rows = [0, 1, 2, 3].map((x) => ({ x, y: 7 }));
  const r = computeLinearRegression(rows, "x", "y");
  assert(r.valid, "zero y-variance should still produce a fit (slope 0)");
  approx(r.slope, 0, 1e-10);
  approx(r.intercept, 7, 1e-10);
  assert(Number.isNaN(r.r2), "r² is NaN for zero y-variance");
});

test("r² for noisy data falls strictly below 1 and above 0", () => {
  const rows = [
    { x: 1, y: 2.1 },
    { x: 2, y: 3.9 },
    { x: 3, y: 6.2 },
    { x: 4, y: 7.8 },
    { x: 5, y: 10.1 },
  ];
  const r = computeLinearRegression(rows, "x", "y");
  assert(r.valid);
  assert(r.r2 > 0.99, `r² should be very high (${r.r2})`);
  assert(r.r2 < 1, `but not exactly 1 (${r.r2})`);
});

summary();
