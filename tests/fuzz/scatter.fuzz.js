// Fuzz test for the scatter data pipeline.
//
// Feeds thousands of plausibly-broken CSV/TSV strings through
//   parseRaw → (x,y) extraction → linearRegression → interpolateColor
// and fails if any stage throws. The regression helper below mirrors the
// `useMemo` block at tools/scatter.tsx:~2228 on purpose — we don't extract
// that closure into shared.js just for testability (would be a refactor for
// fuzz's sake). If scatter.tsx's regression math ever changes, update this
// helper to match.
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseRaw,
  isNumericValue,
  interpolateColor,
  COLOR_PALETTES,
} = require("../helpers/scatter-loader");
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

// Mirror of the regression useMemo in tools/scatter.tsx:~2228. Takes an
// array of [x, y] number pairs and returns the same shape the tool's
// render path reads. `valid: false` is the tool's own "no regression to
// draw" signal — not a fuzz failure.
function linearRegression(pairs) {
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (const [x, y] of pairs) {
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  if (n < 2) return { valid: false };
  const denomX = n * sxx - sx * sx;
  if (denomX === 0) return { valid: false };
  const slope = (n * sxy - sx * sy) / denomX;
  const intercept = (sy - slope * sx) / n;
  const denomY = n * syy - sy * sy;
  const r2 = denomY === 0 ? NaN : Math.pow(n * sxy - sx * sy, 2) / (denomX * denomY);
  return { valid: true, slope, intercept, r2, n };
}

function extractXYPairs(rows, xIdx, yIdx) {
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= Math.max(xIdx, yIdx)) continue;
    const xRaw = row[xIdx],
      yRaw = row[yIdx];
    if (!isNumericValue(xRaw) || !isNumericValue(yRaw)) continue;
    const x = Number(xRaw),
      y = Number(yRaw);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([x, y]);
  }
  return out;
}

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
  if (headers.length < 1 || rows.length < 1) return;

  // Pick (x, y) columns — allow collisions so "y = x" and "zero-variance
  // on both axes" cases get exercised.
  const pickerRng = makeRng((seed ^ 0x55aa55) >>> 0 || 1);
  const xIdx = Math.floor(pickerRng() * headers.length);
  const yIdx = Math.floor(pickerRng() * headers.length);

  let pairs;
  try {
    pairs = extractXYPairs(rows, xIdx, yIdx);
  } catch (err) {
    recordFailure(seed, iter, label, "extractXYPairs", err, text);
    return;
  }

  // Stage 2: regression.
  let reg;
  try {
    reg = linearRegression(pairs);
  } catch (err) {
    recordFailure(seed, iter, label, "linearRegression", err, text);
    return;
  }
  if (reg.valid) {
    if (!Number.isFinite(reg.slope) || !Number.isFinite(reg.intercept)) {
      recordFailure(
        seed,
        iter,
        label,
        "linearRegression",
        new Error(
          `valid regression has non-finite params: slope=${reg.slope} int=${reg.intercept}`
        ),
        text
      );
    }
    // r2 may legitimately be NaN (all-constant y, denomY=0); it should
    // otherwise be in [-eps, 1+eps]. Allow a tiny epsilon for FP noise.
    if (Number.isFinite(reg.r2) && (reg.r2 < -1e-9 || reg.r2 > 1 + 1e-9)) {
      recordFailure(
        seed,
        iter,
        label,
        "linearRegression",
        new Error(`r² out of [0,1]: ${reg.r2}`),
        text
      );
    }
  }

  // Stage 3: interpolateColor across every palette at random t values.
  // DIVERGING_PALETTES is a tag Set (names), not a palette map — all stop
  // arrays live in COLOR_PALETTES.
  const paletteNames = Object.keys(COLOR_PALETTES);
  for (let k = 0; k < 4; k++) {
    const name = paletteNames[Math.floor(pickerRng() * paletteNames.length)];
    const stops = COLOR_PALETTES[name];
    const t = pickerRng() * 2 - 0.5; // includes out-of-range t on purpose
    try {
      const c = interpolateColor(stops, t);
      if (typeof c !== "string") {
        recordFailure(
          seed,
          iter,
          label,
          "interpolateColor",
          new Error(`interpolateColor returned non-string: ${typeof c}`),
          text
        );
      }
    } catch (err) {
      recordFailure(seed, iter, label, "interpolateColor", err, text);
    }
  }
}

function main() {
  console.log(`\n── scatter fuzz — seed=${SEED} n=${N} ──`);
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
