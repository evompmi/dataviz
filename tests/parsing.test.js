// Tests for CSV/TSV parsing functions used by bargraph, boxplot, and scatter.
// Source: tools/bargraph.html (detectHeader, parseRaw, guessColumnType, detectWideFormat)

const { suite, test, assert, eq, summary } = require("./harness");
const { detectHeader, parseRaw, guessColumnType, detectWideFormat } = require("./helpers/parsing-fns");

// ── detectHeader ─────────────────────────────────────────────────────────────

suite("detectHeader");

test("recognises text headers above numeric data", () => {
  assert(detectHeader([["Name","Value"],["Alice","1"],["Bob","2"]]));
});

test("returns false when first row is numeric (no header)", () => {
  assert(!detectHeader([["1","2","3"],["4","5","6"],["7","8","9"]]));
});

test("returns true for a single row (no data rows to compare)", () => {
  assert(detectHeader([["Name","Age"]]));
});

test("handles mix of text and numbers in header", () => {
  assert(detectHeader([["Label","2024"],["A","1"],["B","2"]]));
});

// ── parseRaw ─────────────────────────────────────────────────────────────────

suite("parseRaw — comma CSV");

test("parses basic comma CSV", () => {
  const { headers, rows, hasHeader } = parseRaw("Name,Age,Score\nAlice,30,95\nBob,25,88");
  eq(headers, ["Name","Age","Score"]);
  eq(rows.length, 2);
  eq(rows[0], ["Alice","30","95"]);
  eq(hasHeader, true);
});

test("strips surrounding quotes from values", () => {
  const { headers, rows } = parseRaw('"Name","Value"\n"Alice","42"');
  eq(headers, ["Name","Value"]);
  eq(rows[0], ["Alice","42"]);
});

test("skips empty lines", () => {
  const { rows } = parseRaw("A,B\n1,2\n\n3,4\n");
  eq(rows.length, 2);
});

test("pads short rows to match column count", () => {
  const { rows } = parseRaw("A,B,C\n1,2\n3,4,5");
  eq(rows[0], ["1","2",""]);
  eq(rows[1], ["3","4","5"]);
});

test("handles Windows line endings (CRLF)", () => {
  const { headers, rows } = parseRaw("A,B\r\n1,2\r\n3,4");
  eq(headers, ["A","B"]);
  eq(rows.length, 2);
});

suite("parseRaw — other separators");

test("auto-detects semicolon separator", () => {
  const { headers, rows } = parseRaw("A;B;C\n1;2;3\n4;5;6");
  eq(headers, ["A","B","C"]);
  eq(rows[0], ["1","2","3"]);
});

test("auto-detects tab separator", () => {
  const { headers, rows } = parseRaw("A\tB\tC\n1\t2\t3\n4\t5\t6");
  eq(headers, ["A","B","C"]);
  eq(rows[0], ["1","2","3"]);
});

test("respects explicit separator override", () => {
  // Text has more commas, but semicolon is forced
  const { headers } = parseRaw("A,B;C\n1,2;3", ";");
  eq(headers, ["A,B","C"]);
});

suite("parseRaw — header detection edge cases");

test("generates Col_N headers when first row is numeric", () => {
  const { headers, hasHeader } = parseRaw("1,2,3\n4,5,6\n7,8,9");
  eq(headers, ["Col_1","Col_2","Col_3"]);
  eq(hasHeader, false);
});

test("treats file with only one row as having a header", () => {
  const { hasHeader, rows } = parseRaw("Name,Age");
  eq(hasHeader, true);
  eq(rows.length, 0);
});

test("returns empty result for empty input", () => {
  const { headers, rows } = parseRaw("   \n  \n");
  eq(headers, []);
  eq(rows, []);
});

test("handles a single column", () => {
  const { headers, rows } = parseRaw("Value\n1\n2\n3");
  eq(headers, ["Value"]);
  eq(rows.length, 3);
  eq(rows[0], ["1"]);
});

// ── guessColumnType ──────────────────────────────────────────────────────────

suite("guessColumnType");

test("returns 'value' for a mostly-numeric column", () => {
  // threshold is strictly > 80%, so need at least 9/10 numeric
  eq(guessColumnType(["1","2","3","4","5","6","7","8","9","x"]), "value"); // 9/10 = 90%
});

test("returns 'ignore' for an empty column", () => {
  // Note: Number(" ") === 0, so spaces pass as numeric — use truly empty strings
  eq(guessColumnType(["","",""]), "ignore");
});

test("threshold is strictly >80% — exactly 80% (4/5) is NOT 'value'", () => {
  // 4 numeric + 1 text = 80%, which is not > 0.8, so falls to group/text check
  const result = guessColumnType(["1.2","3.4","5.6","7.8","abc"]);
  assert(result !== "value", `expected group or text but got ${result}`);
});

test("returns 'group' for a low-cardinality categorical column", () => {
  const vals = Array.from({length: 30}, (_, i) => ["ctrl","treat","other"][i % 3]);
  eq(guessColumnType(vals), "group");
});

test("returns 'text' for a high-cardinality string column (IDs, names)", () => {
  // 25 unique values in 30 rows → u.size > 20 → text
  const vals = Array.from({length: 30}, (_, i) => `id_${i}`);
  eq(guessColumnType(vals), "text");
});

test("ignores empty strings when determining numeric ratio", () => {
  // 3 numbers, 2 empties → 3/3 = 100% numeric → value
  eq(guessColumnType(["1","","2","","3"]), "value");
});

// ── detectWideFormat ─────────────────────────────────────────────────────────

suite("detectWideFormat");

test("identifies wide format when ALL columns are numeric", () => {
  // Wide format = every column is numeric (pure value matrix, no label column)
  const headers = ["Sample1","Sample2","Sample3"];
  const rows = [
    ["1.2","3.4","5.6"],
    ["2.1","4.3","6.5"],
    ["0.5","1.1","2.2"],
  ];
  assert(detectWideFormat(headers, rows));
});

test("rejects when a column has text values", () => {
  const headers = ["Group","Val1","Val2"];
  const rows = [
    ["ctrl","1","2"],
    ["treat","3","4"],
  ];
  assert(!detectWideFormat(headers, rows));
});

test("rejects with fewer than 2 columns", () => {
  assert(!detectWideFormat(["A"], [["1"],["2"]]));
});

test("rejects with fewer than 2 rows", () => {
  assert(!detectWideFormat(["A","B"], [["1","2"]]));
});

test("tolerates up to 20% non-numeric values per column", () => {
  // threshold is strictly >80%, so need at least 5/6 numeric (83%) per column
  const headers = ["A","B"];
  const rows = [["1","2"],["3","4"],["5","6"],["7","8"],["9","10"],["x","11"]];
  assert(detectWideFormat(headers, rows));
});

test("rejects when more than 20% non-numeric", () => {
  // 3 numeric, 2 non-numeric → 60% → not wide
  const headers = ["A","B"];
  const rows = [["1","2"],["x","y"],["3","4"],["a","b"],["5","6"]];
  assert(!detectWideFormat(headers, rows));
});

summary();
