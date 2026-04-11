// Integration and coverage-gap tests.
// Tests the full parsing pipeline, getPointColors, computeLegendHeight,
// and edge cases not covered by the unit test suites.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const {
  fixDecimalCommas,
  autoDetectSep,
  parseData,
  dataToColumns,
  computeStats,
  quartiles,
  computeGroupStats,
  getPointColors,
  isNumericValue,
  parseRaw,
  detectWideFormat,
  wideToLong,
} = require("./helpers/shared-loader");
const { computeLegendHeight } = require("./helpers/components-loader");

// ── getPointColors ──────────────────────────────────────────────────────────

suite("getPointColors");

test("returns the base colour for a single source", () => {
  const c = getPointColors("#648FFF", 1);
  eq(c, ["#648FFF"]);
});

test("returns n distinct colours for multiple sources", () => {
  const c = getPointColors("#648FFF", 3);
  eq(c.length, 3);
  // All should be valid hex colours
  c.forEach((hex) => assert(/^#[0-9a-f]{6}$/.test(hex), `invalid hex: ${hex}`));
  // All should be different
  assert(new Set(c).size === 3, "expected 3 distinct colours");
});

test("returns valid colours for large nSources without overflow", () => {
  const colors = getPointColors("#648FFF", 100);
  eq(colors.length, 100);
  colors.forEach((c) => assert(/^#[0-9a-f]{6}$/.test(c), `invalid hex: ${c}`));
});

test("first colour is darker and last is lighter than base", () => {
  // With factor range -0.4 to +0.3, first should be darker, last lighter
  const base = "#808080";
  const [first, , last] = getPointColors(base, 3);
  // Darker means lower RGB sum
  const sum = (hex) =>
    hex
      .match(/[0-9a-f]{2}/g)
      .map((h) => parseInt(h, 16))
      .reduce((a, b) => a + b);
  assert(sum(first) < sum(base), "first colour should be darker");
  assert(sum(last) > sum(base), "last colour should be lighter");
});

// ── computeLegendHeight ─────────────────────────────────────────────────────

suite("computeLegendHeight");

test("returns 0 for empty or null blocks", () => {
  eq(computeLegendHeight([], 400), 0);
  eq(computeLegendHeight(null, 400), 0);
});

test("computes height for a single block with items", () => {
  const blocks = [
    {
      items: [
        { label: "A", color: "#f00" },
        { label: "B", color: "#0f0" },
      ],
    },
  ];
  const h = computeLegendHeight(blocks, 400);
  assert(h > 0, "height should be positive");
  // 10 (initial padding) + 1 row * 18 (ITEM_H) + 6 (final padding) = 34
  // Items per row at IW=88: floor(400/88) = 4, so 2 items fit in 1 row
  eq(h, 10 + 18 + 6);
});

test("wraps items to multiple rows when needed", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ label: `Item ${i}`, color: "#f00" }));
  const blocks = [{ items }];
  const narrow = computeLegendHeight(blocks, 176); // floor(176/88) = 2 items/row → 5 rows
  const wide = computeLegendHeight(blocks, 880); // floor(880/88) = 10 items/row → 1 row
  assert(narrow > wide, "narrow usableW should produce taller legend");
});

test("accounts for title height", () => {
  const withTitle = [{ title: "Legend", items: [{ label: "A", color: "#f00" }] }];
  const noTitle = [{ items: [{ label: "A", color: "#f00" }] }];
  const diff = computeLegendHeight(withTitle, 400) - computeLegendHeight(noTitle, 400);
  eq(diff, 15); // TITLE_H = 15
});

test("accounts for gradient blocks", () => {
  const blocks = [{ gradient: { stops: ["#f00", "#00f"], min: "0", max: "100" } }];
  const h = computeLegendHeight(blocks, 400);
  // 10 + 30 (gradient) + 6 = 46
  eq(h, 10 + 30 + 6);
});

test("accounts for sizeItems blocks", () => {
  const blocks = [
    {
      sizeItems: [
        { r: 8, label: "small" },
        { r: 16, label: "large" },
      ],
    },
  ];
  const h = computeLegendHeight(blocks, 400);
  // 10 + (maxR=16)*2+4 = 10 + 36 + 6 = 52
  eq(h, 10 + 36 + 6);
});

test("adds inter-block spacing for multiple blocks", () => {
  const one = [{ items: [{ label: "A", color: "#f00" }] }];
  const two = [
    { items: [{ label: "A", color: "#f00" }] },
    { items: [{ label: "B", color: "#0f0" }] },
  ];
  const diff = computeLegendHeight(two, 400) - computeLegendHeight(one, 400);
  // Second block adds: 8 (spacing) + 18 (1 row) = 26
  eq(diff, 8 + 18);
});

test("supports dynamic itemWidth function", () => {
  const blocks = [
    { items: Array.from({ length: 4 }, (_, i) => ({ label: `Long label ${i}`, color: "#f00" })) },
  ];
  // With fixed IW=88, at usableW=200: floor(200/88) = 2/row → 2 rows
  const fixed = computeLegendHeight(blocks, 200, 88);
  // With dynamic IW=150: floor(200/150) = 1/row → 4 rows
  const dynamic = computeLegendHeight(blocks, 200, () => 150);
  assert(dynamic > fixed, "wider items should need more rows");
});

// ── End-to-end pipeline: decimal comma CSV ──────────────────────────────────

suite("Pipeline — decimal comma CSV");

test("semicolon-separated file with decimal commas parses correctly", () => {
  const raw = "Groupe;Valeur;Mesure\nctrl;1,5;3,2\nctrl;2,1;4,7\ntraite;3,8;5,1";
  // Step 1: detect separator
  const sep = autoDetectSep(raw);
  eq(sep, ";");
  // Step 2: fix decimal commas
  const { text, commaFixed, count } = fixDecimalCommas(raw, sep);
  eq(commaFixed, true);
  eq(count, 6);
  // Step 3: parse into structured data
  const { headers, data, rawData } = parseData(text, sep);
  eq(headers, ["Groupe", "Valeur", "Mesure"]);
  eq(data.length, 3);
  // Numeric values should be correctly parsed after comma fix
  approx(data[0][1], 1.5);
  approx(data[0][2], 3.2);
  approx(data[2][1], 3.8);
  // Group column remains null (not numeric)
  eq(data[0][0], null);
  // Raw data preserves original strings (after comma fix)
  eq(rawData[0][0], "ctrl");
  eq(rawData[0][1], "1.5");
});

test("tab-separated file with decimal commas parses correctly", () => {
  const raw = "Sample\tWeight\tLength\nA\t12,4\t5,67\nB\t13,1\t6,02";
  const sep = autoDetectSep(raw);
  eq(sep, "\t");
  const { text } = fixDecimalCommas(raw, sep);
  const { data } = parseData(text, sep);
  approx(data[0][1], 12.4);
  approx(data[1][2], 6.02);
});

test("comma-separated file is NOT decimal-fixed (commas are separators)", () => {
  const raw = "Name,Score,Grade\nAlice,95,A\nBob,88,B";
  const sep = autoDetectSep(raw);
  eq(sep, ",");
  const { commaFixed } = fixDecimalCommas(raw, sep);
  eq(commaFixed, false);
  const { headers, data } = parseData(raw, sep);
  eq(headers, ["Name", "Score", "Grade"]);
  eq(data[0][1], 95);
});

// ── Pipeline: wide format detection and conversion ──────────────────────────

suite("Pipeline — wide format");

test("detects wide format and converts to long correctly", () => {
  const raw = "Sample1,Sample2,Sample3\n1.2,3.4,5.6\n2.1,4.3,6.5\n0.5,1.1,2.2";
  const { headers, rows } = parseRaw(raw);
  assert(detectWideFormat(headers, rows), "should detect as wide format");
  const { headers: longH, rows: longR } = wideToLong(headers, rows);
  eq(longH, ["Group", "Value"]);
  eq(longR.length, 9); // 3 cols * 3 rows
  // Check a specific value
  assert(longR.some((r) => r[0] === "Sample1" && r[1] === "1.2"));
});

test("wide format with decimal commas works end to end", () => {
  const raw = "ctrl;traite;autre\n1,2;3,4;5,6\n2,1;4,3;6,5";
  const sep = autoDetectSep(raw);
  eq(sep, ";");
  const { text } = fixDecimalCommas(raw, sep);
  const { headers, rows } = parseRaw(text, sep);
  assert(detectWideFormat(headers, rows));
  // Values should now have decimal points
  eq(rows[0][0], "1.2");
});

// ── Pipeline: full parse → stats ────────────────────────────────────────────

suite("Pipeline — parse to statistics");

test("computes correct stats from parsed CSV data", () => {
  const raw = "Group,Value\nctrl,10\nctrl,20\nctrl,30\ntreat,40\ntreat,50\ntreat,60";
  const { data } = parseData(raw);
  // Extract groups from column 0, values from column 1
  const groups = {};
  data.forEach((row) => {
    // row[0] is null (text), use rawData for group names
    const key = row[0] === null ? "?" : String(row[0]);
    if (!groups[key]) groups[key] = [];
    if (row[1] != null) groups[key].push(row[1]);
  });
  // Since group names are text, they'll be null — let's use rawData
  const { rawData } = parseData(raw);
  const groups2 = {};
  rawData.forEach((row, i) => {
    const key = row[0];
    if (!groups2[key]) groups2[key] = [];
    if (data[i][1] != null) groups2[key].push(data[i][1]);
  });
  const ctrlStats = computeStats(groups2["ctrl"]);
  approx(ctrlStats.mean, 20);
  approx(ctrlStats.sd, 10);
  eq(ctrlStats.n, 3);
  const treatStats = computeStats(groups2["treat"]);
  approx(treatStats.mean, 50);
  eq(treatStats.n, 3);
});

test("computes quartiles from parsed wide-format data", () => {
  const raw = "A,B\n1,10\n2,20\n3,30\n4,40\n5,50";
  const { data } = parseData(raw);
  const colA = data.map((r) => r[0]).filter((v) => v != null);
  const q = quartiles(colA);
  eq(q.min, 1);
  eq(q.max, 5);
  eq(q.med, 3);
  eq(q.n, 5);
});

// ── Pipeline: parseData with dataToColumns for wide format ──────────────────

suite("Pipeline — parseData + dataToColumns");

test("wide format: parseData + dataToColumns matches old parseFile behavior", () => {
  const raw = "ctrl,treat,other\n1,4,7\n2,5,8\n3,6,9";
  const { headers, data } = parseData(raw);
  const columns = dataToColumns(data, headers.length);
  eq(headers, ["ctrl", "treat", "other"]);
  eq(columns[0], [1, 2, 3]);
  eq(columns[1], [4, 5, 6]);
  eq(columns[2], [7, 8, 9]);
});

test("wide format with missing values: nulls are filtered from columns", () => {
  const raw = "A,B\n1,2\n,3\n4,";
  const { data } = parseData(raw);
  const cols = dataToColumns(data, 2);
  eq(cols[0], [1, 4]);
  eq(cols[1], [2, 3]);
});

// ── Edge cases ──────────────────────────────────────────────────────────────

suite("Edge cases");

test("parseData handles Windows CRLF line endings", () => {
  const raw = "A,B\r\n1,2\r\n3,4";
  const { data } = parseData(raw);
  eq(data, [
    [1, 2],
    [3, 4],
  ]);
});

test("parseData handles quoted values", () => {
  const raw = '"Name","Value"\n"Alice","42"\n"Bob","99"';
  const { headers, data } = parseData(raw);
  eq(headers, ["Name", "Value"]);
  eq(data[0][1], 42);
  eq(data[1][1], 99);
});

test("parseData auto-detects tab separator", () => {
  const raw = "A\tB\tC\n1\t2\t3\n4\t5\t6";
  const { headers, data } = parseData(raw);
  eq(headers, ["A", "B", "C"]);
  eq(data[0], [1, 2, 3]);
});

test("parseData auto-detects semicolon separator", () => {
  const raw = "X;Y;Z\n10;20;30";
  const { headers, data } = parseData(raw);
  eq(headers, ["X", "Y", "Z"]);
  eq(data[0], [10, 20, 30]);
});

test("fixDecimalCommas with mixed digit and non-digit commas", () => {
  // "hello,world" should NOT be fixed, but "1,5" should
  const { text, count } = fixDecimalCommas("val;note\n1,5;hello,world", ";");
  assert(text.includes("1.5"), "numeric comma should be fixed");
  assert(text.includes("hello,world"), "non-numeric comma should stay");
  eq(count, 1);
});

test("fixDecimalCommas handles multiple decimal commas in one value", () => {
  // "1,234,567" — the regex matches digit,digit pairs
  const { text, count } = fixDecimalCommas("1,234,567", ";");
  // Both commas have digits on each side, so both get replaced
  eq(text, "1.234.567");
  eq(count, 2);
});

test("computeGroupStats with string values passed from parseRaw", () => {
  // This simulates how boxplot uses computeGroupStats with raw string values
  const groups = {
    ctrl: ["1.5", "2.3", "3.1", ""],
    treat: ["4.0", "5.2", "abc", "6.1"],
  };
  const stats = computeGroupStats(groups);
  const ctrl = stats.find((s) => s.name === "ctrl");
  eq(ctrl.n, 3);
  approx(ctrl.mean, (1.5 + 2.3 + 3.1) / 3);
  const treat = stats.find((s) => s.name === "treat");
  eq(treat.n, 3); // "abc" excluded
});

test("quartiles with identical values", () => {
  const q = quartiles([5, 5, 5, 5, 5]);
  eq(q.q1, 5);
  eq(q.med, 5);
  eq(q.q3, 5);
  eq(q.iqr, 0);
  eq(q.wLo, 5);
  eq(q.wHi, 5);
});

test("quartiles with two elements", () => {
  const q = quartiles([1, 10]);
  eq(q.min, 1);
  eq(q.max, 10);
  eq(q.n, 2);
});

test("computeStats with negative values", () => {
  const s = computeStats([-10, -5, 0, 5, 10]);
  approx(s.mean, 0);
  eq(s.min, -10);
  eq(s.max, 10);
  approx(s.median, 0);
});

test("quartiles with single element", () => {
  const q = quartiles([42]);
  eq(q.min, 42);
  eq(q.max, 42);
  eq(q.q1, 42);
  eq(q.med, 42);
  eq(q.q3, 42);
  eq(q.iqr, 0);
  eq(q.n, 1);
});

test("quartiles interpolation stays in bounds with large arrays", () => {
  const arr = Array.from({ length: 1000 }, (_, i) => i);
  const q = quartiles(arr);
  assert(q.q1 >= 0 && q.q1 <= 999, "q1 in bounds");
  assert(q.med >= 0 && q.med <= 999, "med in bounds");
  assert(q.q3 >= 0 && q.q3 <= 999, "q3 in bounds");
  approx(q.med, 499.5);
});

test("computeStats single element produces correct min/max/median", () => {
  const s = computeStats([7]);
  eq(s.min, 7);
  eq(s.max, 7);
  eq(s.median, 7);
  eq(s.mean, 7);
  eq(s.n, 1);
});

summary();
