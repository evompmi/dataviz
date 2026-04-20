// Fuzz test for the lineplot data pipeline.
//
// Feeds thousands of plausibly-broken CSV/TSV strings through
//   parseRaw → computeSeries → computePerXStats (→ selectTest → chosen test → bhAdjust)
// and fails if any stage throws. Oracle: "no uncaught exception" plus a
// handful of shape invariants (per-x groups array length, pAdj either null
// or in [0,1]).
//
// The two helpers mirror tools/lineplot.tsx:59 (computeSeries) and
// tools/lineplot.tsx:100 (computePerXStats). TypeScript type annotations in
// the originals prevent a direct vm-load; keep the mirrors in sync when
// lineplot's logic changes.
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseRaw,
  isNumericValue,
  sampleMean,
  sampleSD,
  tinv,
  bhAdjust,
  selectTest,
  tTest,
  mannWhitneyU,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
} = require("../helpers/lineplot-loader");
const { GENERATORS, makeRng } = require("./generators");

const SEED = parseInt(process.env.FUZZ_SEED || "1", 10);
const N = parseInt(process.env.FUZZ_N || "1000", 10);
const QUIET = !!process.env.FUZZ_QUIET;

const failures = [];

function truncate(text, max = 200) {
  if (text.length <= max) return text;
  return text.slice(0, max) + `… (${text.length - max} more chars)`;
}

function recordFailure(seed, iter, genLabel, stage, err, text) {
  failures.push({
    seed,
    iter,
    gen: genLabel,
    stage,
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n") : "",
    excerpt: truncate(text),
  });
}

// Build the `data` matrix lineplot feeds into computeSeries: a numeric
// matrix with null for non-numeric / missing cells. Mirror of what the
// tool does between parse and compute.
function coerceNumericMatrix(rows, nCols) {
  return rows.map((row) => {
    const out = new Array(nCols).fill(null);
    for (let c = 0; c < nCols && c < row.length; c++) {
      const v = row[c];
      if (v === "" || v == null) continue;
      if (!isNumericValue(v)) continue;
      const n = Number(v);
      if (Number.isFinite(n)) out[c] = n;
    }
    return out;
  });
}

// Mirror of tools/lineplot.tsx:59 (computeSeries), with TS generics
// stripped. Keep in sync if the tool's aggregation logic changes.
function computeSeries(data, rawData, xCol, yCol, groupCol, palette) {
  const groupOrder = [];
  const perGroup = new Map();
  for (let ri = 0; ri < data.length; ri++) {
    const x = data[ri][xCol];
    const y = data[ri][yCol];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const gName = groupCol == null ? "(all)" : String(rawData[ri][groupCol] ?? "");
    if (!perGroup.has(gName)) {
      perGroup.set(gName, new Map());
      groupOrder.push(gName);
    }
    const xMap = perGroup.get(gName);
    if (!xMap.has(x)) xMap.set(x, []);
    xMap.get(x).push(y);
  }
  return groupOrder.map((name, idx) => {
    const xMap = perGroup.get(name);
    const xs = [...xMap.keys()].sort((a, b) => a - b);
    const points = xs.map((x) => {
      const values = xMap.get(x);
      const n = values.length;
      const mean = sampleMean(values);
      const sd = n > 1 ? sampleSD(values) : 0;
      const sem = n > 1 ? sd / Math.sqrt(n) : 0;
      const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
      return { x, values, n, mean, sd, sem, ci95 };
    });
    return { name, color: palette[idx % palette.length], points };
  });
}

function runChosenTest(name, values) {
  try {
    if (name === "studentT") return tTest(values[0], values[1], { equalVar: true });
    if (name === "welchT") return tTest(values[0], values[1], { equalVar: false });
    if (name === "mannWhitney") return mannWhitneyU(values[0], values[1]);
    if (name === "oneWayANOVA") return oneWayANOVA(values);
    if (name === "welchANOVA") return welchANOVA(values);
    if (name === "kruskalWallis") return kruskalWallis(values);
    return { error: "unknown test" };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// Mirror of tools/lineplot.tsx:100 (computePerXStats).
function computePerXStats(series) {
  const xSet = new Set();
  for (const s of series) for (const p of s.points) xSet.add(p.x);
  const xs = [...xSet].sort((a, b) => a - b);
  const rows = [];
  for (const x of xs) {
    const groups = [];
    for (const s of series) {
      const p = s.points.find((q) => q.x === x);
      if (p && p.n >= 2) groups.push({ name: s.name, values: p.values });
    }
    if (groups.length < 2) continue;
    const values = groups.map((g) => g.values);
    const names = groups.map((g) => g.name);
    const rec = selectTest(values);
    const chosenTest =
      rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
    const result = chosenTest ? runChosenTest(chosenTest, values) : null;
    rows.push({ x, names, values, chosenTest, result });
  }
  const validIdx = [];
  const validPs = [];
  rows.forEach((r, i) => {
    if (r.result && !r.result.error && Number.isFinite(r.result.p)) {
      validIdx.push(i);
      validPs.push(r.result.p);
    }
  });
  const adjPs = validPs.length > 0 ? bhAdjust(validPs) : [];
  rows.forEach((r) => (r.pAdj = null));
  validIdx.forEach((origIdx, j) => (rows[origIdx].pAdj = adjPs[j]));
  return rows;
}

const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"];

function runOne(seed, iter, genFn) {
  const rng = makeRng(seed);
  const { label, text } = genFn(rng);

  // Stage 1: parser.
  let parsed;
  try {
    parsed = parseRaw(text);
  } catch (err) {
    recordFailure(seed, iter, label, "parseRaw", err, text);
    return;
  }
  if (!parsed || !Array.isArray(parsed.rows) || !Array.isArray(parsed.headers)) {
    recordFailure(
      seed,
      iter,
      label,
      "parseRaw",
      new Error("parseRaw returned malformed result"),
      text
    );
    return;
  }
  const { headers, rows } = parsed;
  const nCols = headers.length;
  if (nCols < 2 || rows.length < 1) return;

  const pickerRng = makeRng((seed ^ 0x7331) >>> 0 || 1);
  const xCol = Math.floor(pickerRng() * nCols);
  const yCol = Math.floor(pickerRng() * nCols);
  // Coin-flip: either a real group column or null (single "all" group).
  const groupCol = pickerRng() < 0.5 ? null : Math.floor(pickerRng() * nCols);

  // Stage 2: coerce + computeSeries.
  const data = coerceNumericMatrix(rows, nCols);
  let series;
  try {
    series = computeSeries(data, rows, xCol, yCol, groupCol, PALETTE);
  } catch (err) {
    recordFailure(seed, iter, label, "computeSeries", err, text);
    return;
  }
  if (!Array.isArray(series)) {
    recordFailure(
      seed,
      iter,
      label,
      "computeSeries",
      new Error("computeSeries did not return an array"),
      text
    );
    return;
  }
  for (const s of series) {
    for (const p of s.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.mean)) {
        recordFailure(
          seed,
          iter,
          label,
          "computeSeries",
          new Error(`series point has non-finite x/mean: x=${p.x} mean=${p.mean}`),
          text
        );
        break;
      }
    }
  }

  // Stage 3: per-x stats.
  let perX;
  try {
    perX = computePerXStats(series);
  } catch (err) {
    recordFailure(seed, iter, label, "computePerXStats", err, text);
    return;
  }
  if (!Array.isArray(perX)) {
    recordFailure(
      seed,
      iter,
      label,
      "computePerXStats",
      new Error("computePerXStats did not return an array"),
      text
    );
    return;
  }
  for (const r of perX) {
    if (r.pAdj != null && !(Number.isFinite(r.pAdj) && r.pAdj >= 0 && r.pAdj <= 1 + 1e-9)) {
      recordFailure(
        seed,
        iter,
        label,
        "computePerXStats",
        new Error(`pAdj out of [0,1]: ${r.pAdj}`),
        text
      );
      break;
    }
  }
}

function main() {
  console.log(`\n── lineplot fuzz — seed=${SEED} n=${N} ──`);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const iterSeed = (SEED * 2654435761 + i) >>> 0 || 1;
    const genPickerRng = makeRng(iterSeed);
    const g = GENERATORS[Math.floor(genPickerRng() * GENERATORS.length)];
    runOne(iterSeed, i, g);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} iter • ${failures.length} failures\r`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const byStage = {};
  for (const f of failures) byStage[f.stage] = (byStage[f.stage] || 0) + 1;

  console.log(`\n  ${N - failures.length}/${N} iterations clean · ${dt}s`);
  if (failures.length === 0) {
    console.log("  no crashes.\n");
    return;
  }

  console.log(`\n  ${failures.length} failure(s):`);
  for (const [stage, count] of Object.entries(byStage)) {
    console.log(`    ${count.toString().padStart(4)} × ${stage}`);
  }
  const maxDetail = Math.min(failures.length, 5);
  console.log(`\n  first ${maxDetail} repro(s):`);
  for (let i = 0; i < maxDetail; i++) {
    const f = failures[i];
    console.log(`\n  [${i + 1}] seed=${f.seed} iter=${f.iter} gen=${f.gen} stage=${f.stage}`);
    console.log(`      ${f.message}`);
    if (f.stack) {
      console.log(
        f.stack
          .split("\n")
          .map((l) => "      " + l)
          .join("\n")
      );
    }
    console.log(`      input: ${JSON.stringify(f.excerpt)}`);
  }
  console.log();
  process.exit(1);
}

main();
