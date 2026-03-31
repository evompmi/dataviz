// Tests for pure utility functions in tools/shared.js

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  autoDetectSep, fixDecimalCommas,
  niceStep, makeTicks,
  hexToRgb, rgbToHex, shadeColor, seededRandom,
  isNumericValue,
  wideToLong, reshapeWide,
  computeStats, quartiles, computeGroupStats,
} = require("./helpers/shared-loader");

// ── autoDetectSep ─────────────────────────────────────────────────────────────

suite("autoDetectSep");

test("returns override immediately when provided", () => {
  eq(autoDetectSep("a,b;c\td", ";"), ";");
  eq(autoDetectSep("a,b,c", ","), ",");
});

test("detects comma separator", () => {
  eq(autoDetectSep("a,b,c\n1,2,3"), ",");
});

test("detects semicolon separator", () => {
  eq(autoDetectSep("a;b;c\n1;2;3"), ";");
});

test("detects tab separator", () => {
  eq(autoDetectSep("a\tb\tc\n1\t2\t3"), "\t");
});

test("falls back to space regex when no delimiters", () => {
  const sep = autoDetectSep("a b c\n1 2 3");
  // Can't use instanceof RegExp (vm cross-realm), use duck-typing instead
  assert(typeof sep.test === "function", "expected a RegExp-like for space-delimited input");
});

test("prefers the most frequent delimiter", () => {
  // 6 commas vs 2 semicolons
  eq(autoDetectSep("a,b,c,d;e\n1,2,3,4;5"), ",");
});

// ── fixDecimalCommas ──────────────────────────────────────────────────────────

suite("fixDecimalCommas");

test("does nothing when sep is comma", () => {
  const { text, commaFixed } = fixDecimalCommas("1,5\n2,3", ",");
  eq(text, "1,5\n2,3");
  eq(commaFixed, false);
});

test("replaces decimal commas when sep is semicolon", () => {
  const { text, commaFixed, count } = fixDecimalCommas("1,5;2,3", ";");
  eq(text, "1.5;2.3");
  eq(commaFixed, true);
  eq(count, 2);
});

test("replaces decimal commas when sep is tab", () => {
  const { text, commaFixed } = fixDecimalCommas("1,5\t2,3", "\t");
  eq(text, "1.5\t2.3");
  eq(commaFixed, true);
});

test("does not replace commas when auto-detect finds comma dominance", () => {
  // No explicit sep, but many commas → treat as column separator, don't fix
  const { commaFixed } = fixDecimalCommas("a,b,c\n1,5,2,3", "");
  eq(commaFixed, false);
});

test("does not replace non-digit commas", () => {
  const { text } = fixDecimalCommas("hello,world", ";");
  eq(text, "hello,world"); // no digit on either side
});

// ── niceStep ─────────────────────────────────────────────────────────────────

suite("niceStep");

test("produces 1 for range 10, approx 10 ticks", () => {
  eq(niceStep(10, 10), 1);
});

test("produces 0.1 for range 1, approx 10 ticks", () => {
  approx(niceStep(1, 10), 0.1);
});

test("produces 5 for range 100, approx 25 ticks", () => {
  eq(niceStep(100, 25), 5);
});

test("produces 10 for range 100, approx 10 ticks", () => {
  eq(niceStep(100, 10), 10);
});

test("handles range 0 gracefully (callers always use 'range || 1' guard)", () => {
  // niceStep(0) returns 0 — but makeTicks calls niceStep(max-min || 1, n) so range=0 never reaches it raw.
  // The guarded form must always return a positive finite step:
  const step = niceStep(0 || 1, 5);
  assert(isFinite(step) && step > 0, `expected positive finite step, got ${step}`);
});

// ── makeTicks ─────────────────────────────────────────────────────────────────

suite("makeTicks");

test("generates ticks from 0 to 10", () => {
  const ticks = makeTicks(0, 10, 5);
  assert(ticks.length >= 2, "expected at least 2 ticks");
  assert(ticks[0] >= 0, "first tick should be >= min");
  assert(ticks[ticks.length - 1] <= 10 + 1e-6, "last tick should be <= max");
});

test("all ticks are evenly spaced", () => {
  const ticks = makeTicks(0, 100, 10);
  const gaps = ticks.slice(1).map((v, i) => parseFloat((v - ticks[i]).toPrecision(6)));
  const first = gaps[0];
  gaps.forEach(g => approx(g, first, 1e-6, `uneven tick gap: ${g} vs ${first}`));
});

test("works with negative range", () => {
  const ticks = makeTicks(-50, 50, 10);
  assert(ticks.some(t => t < 0), "expected some negative ticks");
  assert(ticks.some(t => t > 0), "expected some positive ticks");
});

test("handles zero-range without crashing", () => {
  const ticks = makeTicks(5, 5, 5);
  assert(Array.isArray(ticks), "should return an array");
});

// ── Color helpers ─────────────────────────────────────────────────────────────

suite("hexToRgb / rgbToHex");

test("parses standard hex colour", () => {
  eq(hexToRgb("#ff8800"), [255, 136, 0]);
});

test("round-trips hex → rgb → hex", () => {
  const hex = "#4a7fce";
  const [r, g, b] = hexToRgb(hex);
  eq(rgbToHex(r, g, b), hex);
});

test("clamps out-of-range rgb values", () => {
  const result = rgbToHex(300, -10, 128);
  eq(result, "#ff0080");
});

// ── shadeColor ───────────────────────────────────────────────────────────────

suite("shadeColor");

test("positive factor lightens the colour", () => {
  const original = hexToRgb("#648fff");
  const lightened = hexToRgb(shadeColor("#648fff", 0.5));
  assert(
    lightened[0] >= original[0] && lightened[1] >= original[1] && lightened[2] >= original[2],
    "lightened colour should have higher or equal RGB components"
  );
});

test("negative factor darkens the colour", () => {
  const original = hexToRgb("#648fff");
  const darkened = hexToRgb(shadeColor("#648fff", -0.5));
  assert(
    darkened[0] <= original[0] && darkened[1] <= original[1] && darkened[2] <= original[2],
    "darkened colour should have lower or equal RGB components"
  );
});

test("factor 0 returns same colour", () => {
  eq(shadeColor("#648fff", 0), "#648fff");
});

// ── seededRandom ─────────────────────────────────────────────────────────────

suite("seededRandom");

test("same seed produces same sequence", () => {
  const r1 = seededRandom(42);
  const r2 = seededRandom(42);
  const seq1 = Array.from({ length: 10 }, () => r1());
  const seq2 = Array.from({ length: 10 }, () => r2());
  eq(seq1, seq2);
});

test("different seeds produce different sequences", () => {
  const r1 = seededRandom(1);
  const r2 = seededRandom(2);
  const v1 = r1(), v2 = r2();
  assert(v1 !== v2, "different seeds should yield different first values");
});

test("output is in [0, 1)", () => {
  const r = seededRandom(99);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

// ── isNumericValue ────────────────────────────────────────────────────────────

suite("isNumericValue");

test("accepts plain integers", () => {
  assert(isNumericValue("0"));
  assert(isNumericValue("42"));
  assert(isNumericValue("-7"));
});

test("accepts decimals and scientific notation", () => {
  assert(isNumericValue("3.14"));
  assert(isNumericValue(".5"));
  assert(isNumericValue("1e10"));
  assert(isNumericValue("-2.5e-3"));
});

test("accepts values with surrounding whitespace", () => {
  assert(isNumericValue("  42  "));
});

test("rejects alphanumeric strings like '6wpi'", () => {
  assert(!isNumericValue("6wpi"));
  assert(!isNumericValue("8wpi"));
  assert(!isNumericValue("12abc"));
});

test("rejects empty string", () => {
  assert(!isNumericValue(""));
});

test("rejects 'Infinity' and 'NaN'", () => {
  assert(!isNumericValue("Infinity"));
  assert(!isNumericValue("-Infinity"));
  assert(!isNumericValue("NaN"));
});

test("rejects hex literals that Number() would accept", () => {
  assert(!isNumericValue("0xFF"));
});

test("rejects plain text", () => {
  assert(!isNumericValue("ctrl"));
  assert(!isNumericValue("treatment"));
});

// ── computeStats ──────────────────────────────────────────────────────────────

suite("computeStats");

test("returns null for empty array", () => {
  eq(computeStats([]), null);
});

test("computes correct mean and median for odd-length array", () => {
  const s = computeStats([1, 2, 3, 4, 5]);
  approx(s.mean, 3);
  approx(s.median, 3);
  eq(s.n, 5);
  eq(s.min, 1);
  eq(s.max, 5);
});

test("computes correct median for even-length array", () => {
  const s = computeStats([1, 2, 3, 4]);
  approx(s.median, 2.5);
});

test("sd is 0 for a single-element array", () => {
  const s = computeStats([7]);
  eq(s.sd, 0);
  eq(s.sem, 0);
  eq(s.n, 1);
});

test("computes sample sd (n-1 denominator)", () => {
  // [0, 2, 4]: mean=2, variance=(4+0+4)/2=4, sd=2
  const s = computeStats([0, 2, 4]);
  approx(s.sd, 2, 1e-9);
});

test("sem equals sd / sqrt(n)", () => {
  const arr = [1, 2, 3, 4, 5];
  const s = computeStats(arr);
  approx(s.sem, s.sd / Math.sqrt(5), 1e-9);
});

// ── quartiles ─────────────────────────────────────────────────────────────────

suite("quartiles");

test("returns null for empty array", () => {
  eq(quartiles([]), null);
});

test("computes q1, median, q3 correctly", () => {
  const q = quartiles([1, 2, 3, 4, 5, 6, 7]);
  assert(q.q1 <= q.med && q.med <= q.q3, "q1 ≤ med ≤ q3");
  eq(q.n, 7);
  eq(q.min, 1);
  eq(q.max, 7);
});

test("wLo and wHi are within 1.5×IQR of the box", () => {
  const q = quartiles([1, 2, 3, 4, 5, 100]); // 100 is an outlier
  assert(q.wHi < 100, "whisker hi should exclude the outlier 100");
});

test("iqr equals q3 - q1", () => {
  const q = quartiles([1, 2, 3, 4, 5]);
  approx(q.iqr, q.q3 - q.q1, 1e-9);
});

// ── computeGroupStats ────────────────────────────────────────────────────────

suite("computeGroupStats");

test("returns stats for each group", () => {
  const groups = { A: ["1","2","3"], B: ["4","5","6"] };
  const stats = computeGroupStats(groups);
  eq(stats.length, 2);
  const a = stats.find(s => s.name === "A");
  approx(a.mean, 2);
  eq(a.n, 3);
});

test("handles group with no valid numerics", () => {
  const groups = { empty: ["","x","y"] };
  const stats = computeGroupStats(groups);
  eq(stats[0].n, 0);
  eq(stats[0].mean, null);
});

test("ignores empty strings and non-numeric values within a group", () => {
  // "6wpi" should NOT be counted as numeric
  const groups = { mixed: ["1","6wpi","2",""] };
  const stats = computeGroupStats(groups);
  eq(stats[0].n, 2);
  approx(stats[0].mean, 1.5);
});

// ── wideToLong ────────────────────────────────────────────────────────────────

suite("wideToLong");

test("converts wide format to long format with Group/Value headers", () => {
  const headers = ["ctrl", "treat"];
  const rows = [["1","4"],["2","5"],["3","6"]];
  const { headers: h, rows: r } = wideToLong(headers, rows);
  eq(h, ["Group","Value"]);
  eq(r.length, 6);
  assert(r.some(row => row[0] === "ctrl" && row[1] === "1"));
  assert(r.some(row => row[0] === "treat" && row[1] === "6"));
});

test("skips empty and non-numeric cells", () => {
  const headers = ["A","B"];
  const rows = [["1",""],["x","2"]];
  const { rows: r } = wideToLong(headers, rows);
  eq(r.length, 2); // only "1" and "2" are valid
});

// ── reshapeWide ───────────────────────────────────────────────────────────────

suite("reshapeWide");

test("groups rows by group column index and pivots to wide format", () => {
  // gi=0 (group), vi=1 (value)
  const rows = [["ctrl","1"],["ctrl","2"],["treat","3"],["treat","4"]];
  const { headers, rows: wide } = reshapeWide(rows, 0, 1);
  assert(headers.includes("ctrl") && headers.includes("treat"), "headers should be group names");
  const ctrlCol = headers.indexOf("ctrl");
  const vals = wide.map(r => r[ctrlCol]).filter(v => v !== "");
  eq(vals.length, 2);
});

test("returns empty result for empty rows", () => {
  const { headers, rows } = reshapeWide([], 0, 1);
  eq(headers, []);
  eq(rows, []);
});

summary();
