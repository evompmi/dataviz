// Fuzz test for the boxplot data pipeline.
//
// Feeds thousands of plausibly-broken CSV/TSV strings through
//   parseRaw → (group bucketing) → quartiles / computeStats / kde
//            → selectTest → (tTest|mannWhitneyU|oneWayANOVA|welchANOVA|kruskalWallis)
//            → (tukeyHSD|gamesHowell|dunnTest) → bhAdjust → assignBracketLevels
// and fails if any stage throws. The oracle is "no uncaught exception"
// plus a handful of shape invariants (quartiles q1 ≤ med ≤ q3, selectTest
// returns a recognised test name, bracket levels are non-negative).
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseRaw,
  isNumericValue,
  quartiles,
  computeStats,
  kde,
  selectTest,
  tTest,
  mannWhitneyU,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  tukeyHSD,
  gamesHowell,
  dunnTest,
  bhAdjust,
  assignBracketLevels,
} = require("../helpers/boxplot-loader");
const { GENERATORS, makeRng } = require("./generators");

const SEED = parseInt(process.env.FUZZ_SEED || "1", 10);
const N = parseInt(process.env.FUZZ_N || "1000", 10);
const QUIET = !!process.env.FUZZ_QUIET;

const KNOWN_TESTS = new Set([
  "studentT",
  "welchT",
  "mannWhitney",
  "oneWayANOVA",
  "welchANOVA",
  "kruskalWallis",
]);

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

// Bucket parsed rows into groups of numeric values using the given column
// indices. Cap at `maxGroups` to keep the downstream stats cheap — real
// boxplots max out around 6–10 groups in practice, and a runaway
// every-row-its-own-group input would O(k²) the pairwise tests.
function bucketGroups(rows, valueIdx, groupIdx, maxGroups = 8) {
  const map = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= Math.max(valueIdx, groupIdx)) continue;
    const rawVal = row[valueIdx];
    if (rawVal === "" || rawVal == null) continue;
    if (!isNumericValue(rawVal)) continue;
    const num = Number(rawVal);
    if (!Number.isFinite(num)) continue;
    const key = String(row[groupIdx] ?? "");
    if (!map.has(key)) {
      if (map.size >= maxGroups) continue;
      map.set(key, []);
    }
    map.get(key).push(num);
  }
  return [...map.values()].filter((g) => g.length >= 1);
}

function runOne(seed, iter, genFn) {
  const rng = makeRng(seed);
  const { label, text } = genFn(rng);

  // Stage 1: parseRaw must never throw.
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
  if (headers.length < 1 || rows.length < 1) return;

  // Pick a random (valueCol, groupCol) pair. Allow them to collide so the
  // fuzzer also exercises "every row is its own group (key = value)".
  const pickerRng = makeRng((seed ^ 0xabcdef) >>> 0 || 1);
  const valueIdx = Math.floor(pickerRng() * headers.length);
  const groupIdx = Math.floor(pickerRng() * headers.length);

  let groups;
  try {
    groups = bucketGroups(rows, valueIdx, groupIdx);
  } catch (err) {
    recordFailure(seed, iter, label, "bucketGroups", err, text);
    return;
  }
  if (groups.length === 0) return;

  // Stage 2: per-group descriptive stats must not throw.
  for (const g of groups) {
    try {
      const q = quartiles(g);
      if (q && !(q.q1 <= q.med && q.med <= q.q3)) {
        recordFailure(
          seed,
          iter,
          label,
          "quartiles",
          new Error(`invariant q1≤med≤q3 violated: ${q.q1},${q.med},${q.q3}`),
          text
        );
      }
    } catch (err) {
      recordFailure(seed, iter, label, "quartiles", err, text);
    }
    try {
      computeStats(g);
    } catch (err) {
      recordFailure(seed, iter, label, "computeStats", err, text);
    }
    try {
      const pts = kde(g);
      if (!Array.isArray(pts)) {
        recordFailure(seed, iter, label, "kde", new Error("kde did not return an array"), text);
      }
    } catch (err) {
      recordFailure(seed, iter, label, "kde", err, text);
    }
  }

  // Stage 3: selectTest + chosen test. Only groups with n ≥ 2 can be
  // tested by the parametric variants; keep them all for the rank tests.
  const testableGroups = groups.filter((g) => g.length >= 2);
  if (testableGroups.length < 2) return;

  let pick;
  try {
    pick = selectTest(testableGroups);
  } catch (err) {
    recordFailure(seed, iter, label, "selectTest", err, text);
    return;
  }
  if (!pick) {
    recordFailure(
      seed,
      iter,
      label,
      "selectTest",
      new Error("selectTest returned null/undefined"),
      text
    );
    return;
  }
  if (pick.error) return; // legitimate "≥2 groups required"; nothing to run.
  const rec = pick.recommendation || {};
  if (!KNOWN_TESTS.has(rec.test)) {
    recordFailure(
      seed,
      iter,
      label,
      "selectTest",
      new Error(`unknown test name "${rec.test}"`),
      text
    );
    return;
  }

  // Stage 4: the actual test.
  try {
    if (rec.test === "studentT" || rec.test === "welchT") {
      tTest(testableGroups[0], testableGroups[1], { equalVar: rec.test === "studentT" });
    } else if (rec.test === "mannWhitney") {
      mannWhitneyU(testableGroups[0], testableGroups[1]);
    } else if (rec.test === "oneWayANOVA") {
      oneWayANOVA(testableGroups);
    } else if (rec.test === "welchANOVA") {
      welchANOVA(testableGroups);
    } else if (rec.test === "kruskalWallis") {
      kruskalWallis(testableGroups);
    }
  } catch (err) {
    recordFailure(seed, iter, label, `test(${rec.test})`, err, text);
  }

  // Stage 5: post-hoc pairwise when >2 groups.
  if (testableGroups.length >= 3) {
    let pairs = [];
    try {
      if (rec.postHoc === "tukeyHSD") {
        pairs = tukeyHSD(testableGroups).pairs || [];
      } else if (rec.postHoc === "gamesHowell") {
        pairs = gamesHowell(testableGroups).pairs || [];
      } else if (rec.postHoc === "dunn") {
        pairs = dunnTest(testableGroups).pairs || [];
      }
    } catch (err) {
      recordFailure(seed, iter, label, `postHoc(${rec.postHoc})`, err, text);
    }

    // Stage 6: BH adjust + bracket layout.
    if (pairs.length > 0) {
      try {
        bhAdjust(pairs.map((p) => (Number.isFinite(p.p) ? p.p : 1)));
      } catch (err) {
        recordFailure(seed, iter, label, "bhAdjust", err, text);
      }
      try {
        const layout = assignBracketLevels(pairs.map((p) => ({ i: p.i, j: p.j })));
        if (layout.some((b) => !Number.isInteger(b._level) || b._level < 0)) {
          recordFailure(
            seed,
            iter,
            label,
            "assignBracketLevels",
            new Error("bracket level not a non-negative integer"),
            text
          );
        }
      } catch (err) {
        recordFailure(seed, iter, label, "assignBracketLevels", err, text);
      }
    }
  }
}

function main() {
  console.log(`\n── boxplot fuzz — seed=${SEED} n=${N} ──`);
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
