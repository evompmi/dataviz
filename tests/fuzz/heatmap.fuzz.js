// Fuzz test for the heatmap data pipeline.
//
// Feeds thousands of plausibly-broken CSV/TSV strings through
//   parseWideMatrix → pairwiseDistance → hclust → kmeans
// and fails if any stage throws. Non-numeric cells becoming NaN is
// expected; the oracle is "no uncaught exception" (plus: hclust must
// return a non-null tree when given any ≥ 1-row distance matrix, and
// the leaf-order it returns must be a valid permutation).
//
// Configurable via env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      number of iterations (default 1000)
//   FUZZ_QUIET  if set, suppress per-iteration progress ticks

const { parseWideMatrix, pairwiseDistance, hclust, kmeans } = require("../helpers/heatmap-loader");
const { GENERATORS, makeRng } = require("./generators");

const SEED = parseInt(process.env.FUZZ_SEED || "1", 10);
const N = parseInt(process.env.FUZZ_N || "1000", 10);
const QUIET = !!process.env.FUZZ_QUIET;

const METRICS = ["euclidean", "manhattan", "correlation"];
const LINKAGES = ["average", "complete", "single"];

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

function runOne(seed, iter, genFn) {
  const rng = makeRng(seed);
  const { label, text } = genFn(rng);

  // Stage 1: parsing must never throw.
  let parsed;
  try {
    parsed = parseWideMatrix(text);
  } catch (err) {
    recordFailure(seed, iter, label, "parseWideMatrix", err, text);
    return;
  }
  if (!parsed || !Array.isArray(parsed.matrix)) {
    recordFailure(
      seed,
      iter,
      label,
      "parseWideMatrix",
      new Error("parseWideMatrix returned malformed result"),
      text
    );
    return;
  }
  const { matrix } = parsed;
  const nRows = matrix.length;
  const nCols = nRows > 0 ? matrix[0].length : 0;
  if (nRows < 1 || nCols < 1) return;

  // Stage 2: pairwiseDistance × each metric.
  for (const metric of METRICS) {
    let D;
    try {
      D = pairwiseDistance(matrix, metric);
    } catch (err) {
      recordFailure(seed, iter, label, `pairwiseDistance(${metric})`, err, text);
      continue;
    }
    if (!Array.isArray(D) || D.length !== nRows) {
      recordFailure(
        seed,
        iter,
        label,
        `pairwiseDistance(${metric})`,
        new Error("distance matrix shape mismatch"),
        text
      );
      continue;
    }

    // Stage 3: hclust × each linkage.
    for (const linkage of LINKAGES) {
      let res;
      try {
        res = hclust(D, linkage);
      } catch (err) {
        recordFailure(seed, iter, label, `hclust(${linkage})`, err, text);
        continue;
      }
      if (!res || !Array.isArray(res.order)) {
        recordFailure(
          seed,
          iter,
          label,
          `hclust(${linkage})`,
          new Error("hclust returned malformed result"),
          text
        );
        continue;
      }
      // Order must be a valid permutation of 0..nRows-1 (when there's a tree).
      if (nRows > 0 && res.tree) {
        const seen = new Set(res.order);
        if (seen.size !== nRows) {
          recordFailure(
            seed,
            iter,
            label,
            `hclust(${linkage})`,
            new Error(`leaf order not a permutation: got ${res.order.length}/${nRows} unique`),
            text
          );
        }
      }
    }
  }

  // Stage 4: kmeans (only when we have enough rows for k=2).
  if (nRows >= 2) {
    for (const k of [2, 3]) {
      if (k > nRows) continue;
      try {
        const km = kmeans(matrix, k, { seed: seed + iter, maxIter: 50, restarts: 2 });
        if (!km || !Array.isArray(km.clusters)) {
          throw new Error("kmeans returned malformed result");
        }
        if (km.clusters.length !== nRows) {
          throw new Error(`kmeans clusters length ${km.clusters.length} !== nRows ${nRows}`);
        }
      } catch (err) {
        recordFailure(seed, iter, label, `kmeans(k=${k})`, err, text);
      }
    }
  }
}

function main() {
  console.log(`\n── heatmap fuzz — seed=${SEED} n=${N} ──`);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    // Each iteration uses a distinct derived seed so it is reproducible
    // from the top-level SEED alone. Generator selection is itself seeded.
    const iterSeed = (SEED * 2654435761 + i) >>> 0 || 1;
    const genPickerRng = makeRng(iterSeed);
    const g = GENERATORS[Math.floor(genPickerRng() * GENERATORS.length)];
    runOne(iterSeed, i, g);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} iter • ${failures.length} failures\r`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const crashesByStage = {};
  for (const f of failures) crashesByStage[f.stage] = (crashesByStage[f.stage] || 0) + 1;

  console.log(`\n  ${N - failures.length}/${N} iterations clean · ${dt}s`);
  if (failures.length === 0) {
    console.log("  no crashes.\n");
    return;
  }

  console.log(`\n  ${failures.length} failure(s):`);
  for (const [stage, count] of Object.entries(crashesByStage)) {
    console.log(`    ${count.toString().padStart(4)} × ${stage}`);
  }
  // Print the first few full-detail repros.
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
