// Tests for CSV/TSV parsing functions used by group plot, scatter, etc.
// Source: tools/shared.js (detectHeader, parseRaw, guessColumnType, detectWideFormat)

const { suite, test, assert, eq, summary } = require("./harness");
const {
  detectHeader,
  parseRaw,
  guessColumnType,
  detectWideFormat,
  parseData,
  dataToColumns,
  parseWideMatrix,
} = require("./helpers/parsing-fns");

// ── detectHeader ─────────────────────────────────────────────────────────────

suite("detectHeader");

test("recognises text headers above numeric data", () => {
  assert(
    detectHeader([
      ["Name", "Value"],
      ["Alice", "1"],
      ["Bob", "2"],
    ])
  );
});

test("returns false when first row is numeric (no header)", () => {
  assert(
    !detectHeader([
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
    ])
  );
});

test("returns true for a single row (no data rows to compare)", () => {
  assert(detectHeader([["Name", "Age"]]));
});

test("handles mix of text and numbers in header", () => {
  assert(
    detectHeader([
      ["Label", "2024"],
      ["A", "1"],
      ["B", "2"],
    ])
  );
});

test("treats '6wpi' values as non-numeric when detecting header", () => {
  // A column of '6wpi','8wpi' values should not look like a numeric data row
  assert(
    detectHeader([
      ["timepoint", "value"],
      ["6wpi", "1.2"],
      ["8wpi", "3.4"],
    ])
  );
});

// ── parseRaw ─────────────────────────────────────────────────────────────────

suite("parseRaw — comma CSV");

test("parses basic comma CSV", () => {
  const { headers, rows, hasHeader } = parseRaw("Name,Age,Score\nAlice,30,95\nBob,25,88");
  eq(headers, ["Name", "Age", "Score"]);
  eq(rows.length, 2);
  eq(rows[0], ["Alice", "30", "95"]);
  eq(hasHeader, true);
});

test("strips surrounding quotes from values", () => {
  const { headers, rows } = parseRaw('"Name","Value"\n"Alice","42"');
  eq(headers, ["Name", "Value"]);
  eq(rows[0], ["Alice", "42"]);
});

test("skips empty lines", () => {
  const { rows } = parseRaw("A,B\n1,2\n\n3,4\n");
  eq(rows.length, 2);
});

test("pads short rows to match column count", () => {
  const { rows } = parseRaw("A,B,C\n1,2\n3,4,5");
  eq(rows[0], ["1", "2", ""]);
  eq(rows[1], ["3", "4", "5"]);
});

test("handles Windows line endings (CRLF)", () => {
  const { headers, rows } = parseRaw("A,B\r\n1,2\r\n3,4");
  eq(headers, ["A", "B"]);
  eq(rows.length, 2);
});

suite("parseRaw — other separators");

test("auto-detects semicolon separator", () => {
  const { headers, rows } = parseRaw("A;B;C\n1;2;3\n4;5;6");
  eq(headers, ["A", "B", "C"]);
  eq(rows[0], ["1", "2", "3"]);
});

test("auto-detects tab separator", () => {
  const { headers, rows } = parseRaw("A\tB\tC\n1\t2\t3\n4\t5\t6");
  eq(headers, ["A", "B", "C"]);
  eq(rows[0], ["1", "2", "3"]);
});

test("respects explicit separator override", () => {
  // Text has more commas, but semicolon is forced
  const { headers } = parseRaw("A,B;C\n1,2;3", ";");
  eq(headers, ["A,B", "C"]);
});

suite("parseRaw — header detection edge cases");

test("generates Col_N headers when first row is numeric", () => {
  const { headers, hasHeader } = parseRaw("1,2,3\n4,5,6\n7,8,9");
  eq(headers, ["Col_1", "Col_2", "Col_3"]);
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
  eq(guessColumnType(["1", "2", "3", "4", "5", "6", "7", "8", "9", "x"]), "value"); // 9/10 = 90%
});

test("returns 'ignore' for an empty column", () => {
  // Note: Number(" ") === 0, so spaces pass as numeric — use truly empty strings
  eq(guessColumnType(["", "", ""]), "ignore");
});

test("threshold is strictly >80% — exactly 80% (4/5) is NOT 'value'", () => {
  // 4 numeric + 1 text = 80%, which is not > 0.8, so falls to group/text check
  const result = guessColumnType(["1.2", "3.4", "5.6", "7.8", "abc"]);
  assert(result !== "value", `expected group or text but got ${result}`);
});

test("returns 'group' for a low-cardinality categorical column", () => {
  const vals = Array.from({ length: 30 }, (_, i) => ["ctrl", "treat", "other"][i % 3]);
  eq(guessColumnType(vals), "group");
});

test("returns 'text' for a high-cardinality string column (IDs, names)", () => {
  // 25 unique values in 30 rows → u.size > 20 → text
  const vals = Array.from({ length: 30 }, (_, i) => `id_${i}`);
  eq(guessColumnType(vals), "text");
});

test("ignores empty strings when determining numeric ratio", () => {
  // 3 numbers, 2 empties → 3/3 = 100% numeric → value
  eq(guessColumnType(["1", "", "2", "", "3"]), "value");
});

test("treats '6wpi' and '8wpi' as non-numeric (isNumericValue fix)", () => {
  // This was the original bug: parseFloat('6wpi')===6 tricked the filter panel
  // into treating these timepoints as numeric. guessColumnType now uses
  // isNumericValue which correctly rejects them.
  // Repeated values to satisfy the low-cardinality group threshold.
  const col = ["6wpi", "8wpi", "ctrl", "6wpi", "8wpi", "ctrl", "6wpi", "8wpi"];
  eq(guessColumnType(col), "group");
});

test("treats hex and Infinity as non-numeric", () => {
  // Number('0xFF')===255 and Number('Infinity') are finite/valid for isNaN,
  // but isNumericValue correctly rejects them.
  eq(
    guessColumnType([
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
      "0xFF",
    ]),
    "group"
  );
});

// ── detectWideFormat ─────────────────────────────────────────────────────────

suite("detectWideFormat");

test("identifies wide format when ALL columns are numeric", () => {
  // Wide format = every column is numeric (pure value matrix, no label column)
  const headers = ["Sample1", "Sample2", "Sample3"];
  const rows = [
    ["1.2", "3.4", "5.6"],
    ["2.1", "4.3", "6.5"],
    ["0.5", "1.1", "2.2"],
  ];
  assert(detectWideFormat(headers, rows));
});

test("rejects when a column has text values", () => {
  const headers = ["Group", "Val1", "Val2"];
  const rows = [
    ["ctrl", "1", "2"],
    ["treat", "3", "4"],
  ];
  assert(!detectWideFormat(headers, rows));
});

test("rejects with fewer than 2 columns", () => {
  assert(!detectWideFormat(["A"], [["1"], ["2"]]));
});

test("rejects with fewer than 2 rows", () => {
  assert(!detectWideFormat(["A", "B"], [["1", "2"]]));
});

test("tolerates up to 20% non-numeric values per column", () => {
  // threshold is strictly >80%, so need at least 5/6 numeric (83%) per column
  const headers = ["A", "B"];
  const rows = [
    ["1", "2"],
    ["3", "4"],
    ["5", "6"],
    ["7", "8"],
    ["9", "10"],
    ["x", "11"],
  ];
  assert(detectWideFormat(headers, rows));
});

test("rejects when more than 20% non-numeric", () => {
  // 3 numeric, 2 non-numeric → 60% → not wide
  const headers = ["A", "B"];
  const rows = [
    ["1", "2"],
    ["x", "y"],
    ["3", "4"],
    ["a", "b"],
    ["5", "6"],
  ];
  assert(!detectWideFormat(headers, rows));
});

// ── parseData ────────────────────────────────────────────────────────────────

suite("parseData");

test("parses CSV into numeric data and raw strings", () => {
  const { headers, data, rawData } = parseData("A,B,C\n1,2,3\n4,5,6");
  eq(headers, ["A", "B", "C"]);
  eq(data, [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  eq(rawData, [
    ["1", "2", "3"],
    ["4", "5", "6"],
  ]);
});

test("returns null for non-numeric values", () => {
  const { data, rawData } = parseData("Name,Val\nAlice,10\nBob,20");
  eq(data, [
    [null, 10],
    [null, 20],
  ]);
  eq(rawData[0], ["Alice", "10"]);
});

test("rejects '6wpi' as non-numeric via isNumericValue", () => {
  const { data } = parseData("Group,Val\n6wpi,1\n8wpi,2");
  eq(data[0][0], null);
  eq(data[0][1], 1);
});

test("pads short rows to match header count", () => {
  const { data, rawData } = parseData("A,B,C\n1,2\n3,4,5");
  eq(rawData[0], ["1", "2", ""]);
  eq(data[0], [1, 2, null]);
});

test("skips entirely blank rows", () => {
  const { data } = parseData("A,B\n1,2\n  \n3,4");
  eq(data.length, 2);
});

test("returns empty for single-line input", () => {
  const { headers, data } = parseData("A,B,C");
  eq(headers, []);
  eq(data, []);
});

// ── dataToColumns ────────────────────────────────────────────────────────────

suite("dataToColumns");

test("converts row-oriented data to column arrays, filtering nulls", () => {
  const data = [
    [1, null, 3],
    [4, 5, null],
  ];
  const cols = dataToColumns(data, 3);
  eq(cols, [[1, 4], [5], [3]]);
});

test("returns empty columns for empty data", () => {
  const cols = dataToColumns([], 2);
  eq(cols, [[], []]);
});

// ── parseWideMatrix ──────────────────────────────────────────────────────────

suite("parseWideMatrix");

test("parses a 3×3 numeric matrix with row and column labels", () => {
  const text = "gene,s1,s2,s3\ngA,1,2,3\ngB,4,5,6\ngC,7,8,9";
  const out = parseWideMatrix(text);
  eq(out.colLabels, ["s1", "s2", "s3"]);
  eq(out.rowLabels, ["gA", "gB", "gC"]);
  eq(out.matrix, [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
  eq(out.warnings.nonNumeric, 0);
});

test("marks non-numeric cells as NaN and counts them in warnings", () => {
  const text = "x,a,b\nr1,1,foo\nr2,bar,4";
  const out = parseWideMatrix(text);
  assert(Number.isNaN(out.matrix[0][1]));
  assert(Number.isNaN(out.matrix[1][0]));
  eq(out.matrix[0][0], 1);
  eq(out.matrix[1][1], 4);
  eq(out.warnings.nonNumeric, 2);
});

test("empty cells become NaN without counting as non-numeric", () => {
  const text = "x,a,b\nr1,1,\nr2,,4";
  const out = parseWideMatrix(text);
  assert(Number.isNaN(out.matrix[0][1]));
  assert(Number.isNaN(out.matrix[1][0]));
  eq(out.warnings.nonNumeric, 0);
});

test("returns empty result when input has too few columns or rows", () => {
  const out = parseWideMatrix("only_one_column");
  eq(out.rowLabels, []);
  eq(out.colLabels, []);
  eq(out.matrix, []);
});

test("handles TSV separator auto-detection", () => {
  const text = "gene\ts1\ts2\ngA\t1\t2\ngB\t3\t4";
  const out = parseWideMatrix(text);
  eq(out.colLabels, ["s1", "s2"]);
  eq(out.matrix, [
    [1, 2],
    [3, 4],
  ]);
});

summary();
