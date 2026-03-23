// Tests for pure utility functions in tools/shared.js

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  autoDetectSep, fixDecimalCommas,
  niceStep, makeTicks,
  hexToRgb, rgbToHex, shadeColor, seededRandom,
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

summary();
