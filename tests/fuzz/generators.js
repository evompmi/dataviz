// Deterministic, seeded input generators for fuzz-testing the toolbox.
// Each generator takes a PRNG (function () → [0,1)) and returns
// `{ label, text }` where `label` is a short tag for failure reports
// and `text` is the raw CSV/TSV/… string that will be fed to a parser.
//
// Generators deliberately produce plausibly-broken inputs — things a
// careless user might paste: mixed delimiters, stray quotes, decimal
// commas, extreme sizes, unicode, NaN/Inf, ragged rows, BOM, etc.

const SEPARATORS = [",", "\t", ";", " "];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng, lo, hi) {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function randFloat(rng, lo, hi) {
  return rng() * (hi - lo) + lo;
}

// Short mock-biology labels — keeps inputs readable in failure logs
// while still exercising varying lengths and characters.
const LABEL_POOL = [
  "gene_a",
  "GENE_B",
  "Col1",
  "sample-1",
  "sample 2",
  "x",
  "",
  "αβγ",
  "with,comma",
  'with"quote',
  "with\ttab",
  "长",
  "🧬",
  "ctrl",
  "treat",
];

function randomLabel(rng) {
  return pick(rng, LABEL_POOL);
}

function randomNumericToken(rng) {
  const choice = rng();
  if (choice < 0.02) return "NaN";
  if (choice < 0.04) return "Inf";
  if (choice < 0.06) return "-Inf";
  if (choice < 0.08) return "";
  if (choice < 0.12) return String(randInt(rng, -5, 5));
  if (choice < 0.16) return String(randFloat(rng, -1e6, 1e6).toExponential(3));
  return randFloat(rng, -100, 100).toFixed(randInt(rng, 0, 4));
}

// ── Generators ─────────────────────────────────────────────────────────────

function genEmpty() {
  return { label: "empty", text: "" };
}
function genWhitespaceOnly(rng) {
  const n = randInt(rng, 1, 20);
  return { label: "whitespace-only", text: " \n".repeat(n) };
}
function genHeaderOnly(rng) {
  const sep = pick(rng, SEPARATORS);
  const n = randInt(rng, 2, 8);
  const headers = Array.from({ length: n }, () => randomLabel(rng));
  return { label: "header-only", text: headers.join(sep) };
}
function genSingleCell(rng) {
  return { label: "single-cell", text: randomNumericToken(rng) };
}
function genWellFormed(rng) {
  // Baseline: a clean numeric matrix with labelled rows/cols. Included
  // so the fuzzer spends ~20 % of its budget confirming the happy path
  // still works under varying sizes.
  const sep = pick(rng, [",", "\t"]);
  const nRows = randInt(rng, 2, 30);
  const nCols = randInt(rng, 2, 20);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) line.push(randFloat(rng, -10, 10).toFixed(2));
    rows.push(line.join(sep));
  }
  return { label: "well-formed", text: [header, ...rows].join("\n") };
}
function genRaggedRows(rng) {
  const sep = pick(rng, [",", "\t"]);
  const nCols = randInt(rng, 3, 8);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  const nRows = randInt(rng, 2, 10);
  for (let r = 0; r < nRows; r++) {
    const k = randInt(rng, 1, nCols + 3);
    const line = [`r${r}`];
    for (let c = 0; c < k; c++) line.push(randomNumericToken(rng));
    rows.push(line.join(sep));
  }
  return { label: "ragged-rows", text: [header, ...rows].join("\n") };
}
function genMixedDelimiters(rng) {
  const n = randInt(rng, 2, 6);
  const lines = [];
  for (let r = 0; r <= n; r++) {
    const sep = pick(rng, SEPARATORS);
    const k = randInt(rng, 2, 5);
    const parts = [];
    for (let c = 0; c < k; c++) parts.push(r === 0 ? `c${c}` : randomNumericToken(rng));
    lines.push(parts.join(sep));
  }
  return { label: "mixed-delimiters", text: lines.join("\n") };
}
function genDecimalCommas(rng) {
  // European-style: "1,5" for 1.5 with ; as the column separator
  const sep = ";";
  const nCols = randInt(rng, 2, 5);
  const nRows = randInt(rng, 2, 8);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) {
      const n = randFloat(rng, -50, 50).toFixed(randInt(rng, 1, 3));
      line.push(n.replace(".", ","));
    }
    rows.push(line.join(sep));
  }
  return { label: "decimal-commas", text: [header, ...rows].join("\n") };
}
function genBOM(rng) {
  const inner = genWellFormed(rng);
  return { label: "bom", text: "\uFEFF" + inner.text };
}
function genCRLF(rng) {
  const inner = genWellFormed(rng);
  return { label: "crlf", text: inner.text.replace(/\n/g, "\r\n") };
}
function genUnicodeLabels(rng) {
  const sep = pick(rng, [",", "\t"]);
  const nCols = randInt(rng, 2, 5);
  const nRows = randInt(rng, 2, 8);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `α${i}🧬`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`行${r}`];
    for (let c = 0; c < nCols; c++) line.push(randFloat(rng, -1, 1).toFixed(3));
    rows.push(line.join(sep));
  }
  return { label: "unicode-labels", text: [header, ...rows].join("\n") };
}
function genNonNumericCells(rng) {
  // Matrix with numeric cells randomly replaced by text/empty tokens.
  const sep = pick(rng, [",", "\t"]);
  const nCols = randInt(rng, 2, 5);
  const nRows = randInt(rng, 2, 8);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) {
      const v = rng() < 0.3 ? pick(rng, ["foo", "NA", "", "?", "-"]) : randomNumericToken(rng);
      line.push(v);
    }
    rows.push(line.join(sep));
  }
  return { label: "non-numeric-cells", text: [header, ...rows].join("\n") };
}
function genQuotedFields(rng) {
  const sep = ",";
  const nCols = randInt(rng, 2, 4);
  const nRows = randInt(rng, 2, 6);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `"col ${i}"`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`"row ${r}"`];
    for (let c = 0; c < nCols; c++) line.push(`"${randomNumericToken(rng)}"`);
    rows.push(line.join(sep));
  }
  return { label: "quoted-fields", text: [header, ...rows].join("\n") };
}
function genMalformedQuotes() {
  // One quote, unclosed.
  return {
    label: "malformed-quotes",
    text: `,"a,b\n"row,1,2`,
  };
}
function genDuplicateHeaders(rng) {
  return {
    label: "duplicate-headers",
    text: `,a,a,a\nr1,${randomNumericToken(rng)},${randomNumericToken(rng)},${randomNumericToken(rng)}`,
  };
}
function genDuplicateRowLabels() {
  return {
    label: "duplicate-row-labels",
    text: `,c1,c2\nr1,1,2\nr1,3,4\nr1,5,6`,
  };
}
function genEmptyRows(rng) {
  const inner = genWellFormed(rng);
  const lines = inner.text.split("\n");
  // Splice blank lines at random positions.
  const k = randInt(rng, 1, 4);
  for (let i = 0; i < k; i++) {
    const pos = randInt(rng, 0, lines.length);
    lines.splice(pos, 0, "");
  }
  return { label: "empty-rows", text: lines.join("\n") };
}
function genTrailingCommas(rng) {
  const inner = genWellFormed(rng);
  const lines = inner.text.split("\n").map((l) => l + ",,,");
  return { label: "trailing-commas", text: lines.join("\n") };
}
function genExtremeNumbers() {
  const rows = [
    ",c1,c2,c3",
    `r1,1e308,-1e308,1e-308`,
    `r2,${Number.MAX_SAFE_INTEGER},-${Number.MAX_SAFE_INTEGER},0`,
    `r3,Infinity,-Infinity,NaN`,
  ];
  return { label: "extreme-numbers", text: rows.join("\n") };
}
function genNanInfTokens(rng) {
  const sep = ",";
  const nCols = randInt(rng, 2, 4);
  const nRows = randInt(rng, 2, 6);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) {
      line.push(pick(rng, ["NaN", "Inf", "-Inf", "nan", "inf", "INF", "1", "0"]));
    }
    rows.push(line.join(sep));
  }
  return { label: "nan-inf-tokens", text: [header, ...rows].join("\n") };
}
function genAllNonNumeric(rng) {
  const sep = ",";
  const nCols = randInt(rng, 2, 4);
  const nRows = randInt(rng, 2, 6);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) line.push(pick(rng, ["foo", "bar", "baz", "NA", "?"]));
    rows.push(line.join(sep));
  }
  return { label: "all-non-numeric", text: [header, ...rows].join("\n") };
}
function genSingleRow(rng) {
  const nCols = randInt(rng, 2, 8);
  const sep = ",";
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const row = ["r0"].concat(Array.from({ length: nCols }, () => randomNumericToken(rng))).join(sep);
  return { label: "single-row", text: header + "\n" + row };
}
function genSingleColumn(rng) {
  const nRows = randInt(rng, 1, 8);
  const sep = ",";
  const lines = [",c1"];
  for (let r = 0; r < nRows; r++) lines.push(`r${r}${sep}${randomNumericToken(rng)}`);
  return { label: "single-column", text: lines.join("\n") };
}
function genHugeMatrix(rng) {
  const nRows = randInt(rng, 100, 200);
  const nCols = randInt(rng, 15, 25);
  const sep = ",";
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) line.push(randFloat(rng, -5, 5).toFixed(2));
    rows.push(line.join(sep));
  }
  return { label: "huge-matrix", text: [header, ...rows].join("\n") };
}
function genVeryLongLabels(rng) {
  const sep = ",";
  const big = "x".repeat(randInt(rng, 100, 500));
  const header = [""].concat(Array.from({ length: 3 }, (_, i) => big + i)).join(sep);
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const line = [big + "_r" + r];
    for (let c = 0; c < 3; c++) line.push(randFloat(rng, -1, 1).toFixed(3));
    rows.push(line.join(sep));
  }
  return { label: "very-long-labels", text: [header, ...rows].join("\n") };
}
function genMostlyEmpty(rng) {
  const sep = ",";
  const nCols = randInt(rng, 2, 5);
  const nRows = randInt(rng, 2, 8);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) line.push(rng() < 0.8 ? "" : randomNumericToken(rng));
    rows.push(line.join(sep));
  }
  return { label: "mostly-empty", text: [header, ...rows].join("\n") };
}
function genNullByte(rng) {
  const inner = genWellFormed(rng);
  const pos = randInt(rng, 0, inner.text.length);
  return {
    label: "null-byte",
    text: inner.text.slice(0, pos) + "\0" + inner.text.slice(pos),
  };
}
function genControlChars(rng) {
  const inner = genWellFormed(rng);
  return { label: "control-chars", text: inner.text.replace(/\n/g, "\f\n\v") };
}
function genScientificNotation(rng) {
  const sep = ",";
  const nCols = randInt(rng, 2, 4);
  const nRows = randInt(rng, 2, 6);
  const header = [""].concat(Array.from({ length: nCols }, (_, i) => `c${i}`)).join(sep);
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const line = [`r${r}`];
    for (let c = 0; c < nCols; c++) {
      line.push(randFloat(rng, -1e10, 1e10).toExponential(randInt(rng, 0, 8)));
    }
    rows.push(line.join(sep));
  }
  return { label: "scientific-notation", text: [header, ...rows].join("\n") };
}

const GENERATORS = [
  genEmpty,
  genWhitespaceOnly,
  genHeaderOnly,
  genSingleCell,
  genWellFormed,
  genWellFormed, // doubled — want well-formed to exercise ~10–15 % of budget
  genRaggedRows,
  genMixedDelimiters,
  genDecimalCommas,
  genBOM,
  genCRLF,
  genUnicodeLabels,
  genNonNumericCells,
  genQuotedFields,
  genMalformedQuotes,
  genDuplicateHeaders,
  genDuplicateRowLabels,
  genEmptyRows,
  genTrailingCommas,
  genExtremeNumbers,
  genNanInfTokens,
  genAllNonNumeric,
  genSingleRow,
  genSingleColumn,
  genHugeMatrix,
  genVeryLongLabels,
  genMostlyEmpty,
  genNullByte,
  genControlChars,
  genScientificNotation,
];

function pickGenerator(rng) {
  return pick(rng, GENERATORS);
}

// Park–Miller PRNG, matches the one in tools/shared.js. A tiny wrapper
// so generator files can be Node-run without vm-loading the whole
// shared.js bundle.
function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

module.exports = {
  GENERATORS,
  pickGenerator,
  makeRng,
};
