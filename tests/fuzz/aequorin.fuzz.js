// Fuzz test for the aequorin data pipeline.
//
// Feeds thousands of plausibly-broken CSV/TSV strings through
//   parseWideMatrix → detectConditions →
//     (calibrate | calibrateHill | calibrateGeneralized) → smooth
// and fails if any stage throws. The oracle is "no uncaught exception"
// plus a handful of shape invariants (calibrated result matches raw data's
// shape; detectConditions returns well-formed condition objects).
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseWideMatrix,
  calibrate,
  calibrateHill,
  calibrateGeneralized,
  detectConditions,
  smooth,
} = require("../helpers/aequorin-loader");
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

// The matrix parseWideMatrix returns stores numeric cells as numbers and
// non-numeric cells as NaN. Aequorin's calibrate* helpers treat
// `v == null` as "missing"; they were written assuming nulls, not NaN.
// The tool's real data path replaces NaN with null via its own pipeline
// (see `rawNumbers` in aequorin.tsx) — mirror that here to exercise the
// same shape.
function nullifyNaN(matrix) {
  return matrix.map((row) => row.map((v) => (Number.isFinite(v) ? v : null)));
}

// Pick random but plausible calibration parameters. Negative / zero /
// tiny values are on purpose — calibration should return nulls for
// degenerate cases, not throw.
function randomParams(rng) {
  const pick = rng();
  if (pick < 0.05) return { Kr: 0, Ktr: 0, Kd: 0, n: 3 };
  if (pick < 0.1) return { Kr: -1, Ktr: -1, Kd: -1, n: 3 };
  if (pick < 0.15) return { Kr: 7, Ktr: 118, Kd: 7, n: 0.01 }; // near-zero exponent
  if (pick < 0.2) return { Kr: 7, Ktr: 118, Kd: 7, n: 100 }; // huge exponent
  return {
    Kr: rng() * 20,
    Ktr: rng() * 200,
    Kd: rng() * 20,
    n: 0.5 + rng() * 5,
  };
}

function runOne(seed, iter, genFn) {
  const rng = makeRng(seed);
  const { label, text } = genFn(rng);

  // Stage 1: parseWideMatrix (aequorin shares the heatmap parser).
  let parsed;
  try {
    parsed = parseWideMatrix(text);
  } catch (err) {
    recordFailure(seed, iter, label, "parseWideMatrix", err, text);
    return;
  }
  if (!parsed || !Array.isArray(parsed.matrix) || !Array.isArray(parsed.colLabels)) {
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
  const headers = parsed.colLabels;
  const data = nullifyNaN(parsed.matrix);
  const nRows = data.length;
  const nCols = headers.length;
  if (nRows < 1 || nCols < 1) return;

  // Stage 2: detectConditions under both pooling modes.
  for (const pool of [true, false]) {
    try {
      const conds = detectConditions(headers, pool);
      if (!Array.isArray(conds)) {
        recordFailure(
          seed,
          iter,
          label,
          `detectConditions(pool=${pool})`,
          new Error("detectConditions did not return an array"),
          text
        );
        continue;
      }
      for (const c of conds) {
        if (!c || !Array.isArray(c.colIndices)) {
          recordFailure(
            seed,
            iter,
            label,
            `detectConditions(pool=${pool})`,
            new Error("condition missing colIndices"),
            text
          );
          break;
        }
        if (c.colIndices.some((i) => i < 0 || i >= nCols)) {
          recordFailure(
            seed,
            iter,
            label,
            `detectConditions(pool=${pool})`,
            new Error(`colIndex out of range: ${c.colIndices.join(",")}`),
            text
          );
          break;
        }
      }
    } catch (err) {
      recordFailure(seed, iter, label, `detectConditions(pool=${pool})`, err, text);
    }
  }

  // Stage 3: calibration variants with randomised params. Each must
  // return a matrix of the same shape (rows × cols) where cells are
  // either a finite number or null (never undefined / NaN / Infinity —
  // the render path treats `null` as "missing point" and would crash on
  // a NaN leaking through).
  const params = randomParams(rng);
  const variants = [
    { name: "calibrate", fn: () => calibrate(headers, data, params.Kr, params.Ktr) },
    { name: "calibrateHill", fn: () => calibrateHill(headers, data, params.Kd) },
    {
      name: "calibrateGeneralized",
      fn: () => calibrateGeneralized(headers, data, params.Kr, params.Ktr, params.n),
    },
  ];

  for (const v of variants) {
    let out;
    try {
      out = v.fn();
    } catch (err) {
      recordFailure(seed, iter, label, v.name, err, text);
      continue;
    }
    if (!Array.isArray(out) || out.length !== nRows) {
      recordFailure(
        seed,
        iter,
        label,
        v.name,
        new Error(`${v.name} returned wrong row count: ${out ? out.length : "?"} vs ${nRows}`),
        text
      );
      continue;
    }
    outer: for (let r = 0; r < out.length; r++) {
      const row = out[r];
      if (!Array.isArray(row) || row.length !== nCols) {
        recordFailure(
          seed,
          iter,
          label,
          v.name,
          new Error(`${v.name} row ${r} wrong col count`),
          text
        );
        break;
      }
      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        if (val === null) continue;
        if (typeof val !== "number" || !Number.isFinite(val)) {
          recordFailure(
            seed,
            iter,
            label,
            v.name,
            new Error(`${v.name}[${r}][${c}] = ${val} (should be null or finite)`),
            text
          );
          break outer;
        }
      }
    }

    // Stage 4: smooth every column of the calibrated matrix at a random
    // window width. Smoothing should never throw and should preserve
    // array length.
    const w = Math.floor(rng() * 5);
    for (let c = 0; c < Math.min(nCols, 3); c++) {
      const col = out.map((row) => row[c]);
      try {
        const sm = smooth(col, w);
        if (!Array.isArray(sm) || sm.length !== col.length) {
          recordFailure(
            seed,
            iter,
            label,
            "smooth",
            new Error(`smooth length mismatch: ${sm ? sm.length : "?"} vs ${col.length}`),
            text
          );
        }
      } catch (err) {
        recordFailure(seed, iter, label, "smooth", err, text);
      }
    }
  }
}

function main() {
  console.log(`\n── aequorin fuzz — seed=${SEED} n=${N} ──`);
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
