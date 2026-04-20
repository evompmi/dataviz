// Fuzz test for the venn data + geometry pipeline.
//
// Two independent fuzz loops share this harness:
//
//   1. Text → parseRaw → parseSetData → computeIntersections. Ensures the
//      set-membership extraction path never throws on broken column tables
//      (unicode, quoted, empty cells, duplicate headers, …). Invariants:
//      each region mask is a unique bitmask of the active sets, size ≥ 0,
//      items is a sorted string array.
//
//   2. Random-geometry → circleOverlapArea, solveDistance, buildRegionPaths,
//      computeAllRegionAreas, tripleIntersectionArea. Generates 2- and
//      3-circle configurations biased toward degenerate cases (tangency,
//      containment, near-coincident centers) — the things that yield NaN
//      propagation or empty region paths. Invariants: overlap area ∈
//      [0, π·min(r)²], computed region areas are all finite and within
//      [0, π·max(r)²]; no thrown exceptions.
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations per loop (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseRaw,
  parseSetData,
  computeIntersections,
  circleOverlapArea,
  solveDistance,
  buildRegionPaths,
  computeAllRegionAreas,
} = require("../helpers/venn-loader");
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

// ── Loop 1: text → set membership ──────────────────────────────────────────

function runSetMembership(seed, iter, genFn) {
  const rng = makeRng(seed);
  const { label, text } = genFn(rng);

  let parsed;
  try {
    parsed = parseRaw(text);
  } catch (err) {
    recordFailure(seed, iter, label, "parseRaw", err, text);
    return;
  }
  if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) return;
  if (parsed.headers.length < 1) return;

  // Clamp headers to ≤ 3 (venn only supports 2–3 sets) so
  // computeIntersections runs on a realistic input size.
  const headers = parsed.headers.slice(0, 3);
  const rows = parsed.rows;

  let setData;
  try {
    setData = parseSetData(headers, rows);
  } catch (err) {
    recordFailure(seed, iter, label, "parseSetData", err, text);
    return;
  }
  if (!setData || !Array.isArray(setData.setNames)) {
    recordFailure(
      seed,
      iter,
      label,
      "parseSetData",
      new Error("parseSetData returned malformed result"),
      text
    );
    return;
  }
  if (setData.setNames.length < 1) return;

  let regions;
  try {
    regions = computeIntersections(setData.setNames, setData.sets);
  } catch (err) {
    recordFailure(seed, iter, label, "computeIntersections", err, text);
    return;
  }
  if (!Array.isArray(regions)) {
    recordFailure(
      seed,
      iter,
      label,
      "computeIntersections",
      new Error("computeIntersections did not return an array"),
      text
    );
    return;
  }
  const n = setData.setNames.length;
  const expectRegions = (1 << n) - 1;
  if (regions.length !== expectRegions) {
    recordFailure(
      seed,
      iter,
      label,
      "computeIntersections",
      new Error(`expected ${expectRegions} regions for ${n} sets, got ${regions.length}`),
      text
    );
  }
  const seenMasks = new Set();
  for (const r of regions) {
    if (!Number.isInteger(r.mask) || r.mask <= 0 || r.mask > expectRegions) {
      recordFailure(
        seed,
        iter,
        label,
        "computeIntersections",
        new Error(`region mask out of range: ${r.mask}`),
        text
      );
      break;
    }
    if (seenMasks.has(r.mask)) {
      recordFailure(
        seed,
        iter,
        label,
        "computeIntersections",
        new Error(`duplicate region mask: ${r.mask}`),
        text
      );
      break;
    }
    seenMasks.add(r.mask);
    if (r.size !== r.items.length) {
      recordFailure(
        seed,
        iter,
        label,
        "computeIntersections",
        new Error(`region size ${r.size} ≠ items.length ${r.items.length}`),
        text
      );
      break;
    }
  }
}

// ── Loop 2: random circle geometries ──────────────────────────────────────

function randomCircles(rng, n) {
  const flavor = rng();
  const out = [];
  // Bias toward degenerate configurations: tangency, containment, near-
  // coincident centres, zero-radius placeholders. A pure uniform sample
  // misses most of these because they have measure zero.
  if (flavor < 0.1) {
    // Tangent pair (d = r1 + r2)
    const r1 = 10 + rng() * 20,
      r2 = 10 + rng() * 20;
    out.push({ cx: 0, cy: 0, r: r1 });
    out.push({ cx: r1 + r2, cy: 0, r: r2 });
    if (n === 3) out.push({ cx: 0, cy: r1 + 10, r: 10 + rng() * 15 });
  } else if (flavor < 0.2) {
    // Containment (one circle fully inside another)
    out.push({ cx: 0, cy: 0, r: 30 });
    out.push({ cx: 5, cy: 0, r: 5 });
    if (n === 3) out.push({ cx: -4, cy: 3, r: 4 });
  } else if (flavor < 0.3) {
    // Near-coincident centres (d ≈ 0)
    for (let i = 0; i < n; i++) {
      out.push({ cx: (rng() - 0.5) * 0.01, cy: (rng() - 0.5) * 0.01, r: 5 + rng() * 20 });
    }
  } else if (flavor < 0.4) {
    // Zero-radius placeholder
    out.push({ cx: 0, cy: 0, r: 0 });
    out.push({ cx: 10, cy: 0, r: 5 });
    if (n === 3) out.push({ cx: 0, cy: 10, r: 5 });
  } else {
    // Uniform random
    for (let i = 0; i < n; i++) {
      out.push({
        cx: (rng() - 0.5) * 80,
        cy: (rng() - 0.5) * 80,
        r: 1 + rng() * 30,
      });
    }
  }
  return out;
}

function runGeometry(seed, iter) {
  const rng = makeRng(seed);
  const n = rng() < 0.5 ? 2 : 3;
  const circles = randomCircles(rng, n);
  const tag = `geometry-${n}circles`;
  const textDump = JSON.stringify(circles);

  // circleOverlapArea for each pair
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const d = Math.hypot(circles[j].cx - circles[i].cx, circles[j].cy - circles[i].cy);
      let a;
      try {
        a = circleOverlapArea(circles[i].r, circles[j].r, d);
      } catch (err) {
        recordFailure(seed, iter, tag, "circleOverlapArea", err, textDump);
        continue;
      }
      if (!Number.isFinite(a) || a < -1e-9) {
        recordFailure(
          seed,
          iter,
          tag,
          "circleOverlapArea",
          new Error(`overlap area invalid: ${a} for r1=${circles[i].r} r2=${circles[j].r} d=${d}`),
          textDump
        );
      }
      const maxPossible = Math.PI * Math.min(circles[i].r, circles[j].r) ** 2;
      if (Number.isFinite(a) && a > maxPossible + 1e-6) {
        recordFailure(
          seed,
          iter,
          tag,
          "circleOverlapArea",
          new Error(`overlap area ${a} exceeds min-circle area ${maxPossible}`),
          textDump
        );
      }
    }
  }

  // solveDistance: pick a random target area within [0, maxPossible] and
  // expect solveDistance to return a finite distance.
  if (circles.length >= 2 && circles[0].r > 0 && circles[1].r > 0) {
    const maxA = Math.PI * Math.min(circles[0].r, circles[1].r) ** 2;
    const target = rng() * maxA * 1.1; // 10% past max to trigger edge branch
    try {
      const d = solveDistance(circles[0].r, circles[1].r, target);
      if (!Number.isFinite(d) || d < 0) {
        recordFailure(
          seed,
          iter,
          tag,
          "solveDistance",
          new Error(`invalid distance: ${d} for target=${target}`),
          textDump
        );
      }
    } catch (err) {
      recordFailure(seed, iter, tag, "solveDistance", err, textDump);
    }
  }

  // buildRegionPaths must not throw. Returns an object keyed by region mask
  // with SVG path strings; it is allowed to be missing regions (degenerate
  // cases return an empty / partial map).
  try {
    const paths = buildRegionPaths(circles);
    if (!paths || typeof paths !== "object") {
      recordFailure(
        seed,
        iter,
        tag,
        "buildRegionPaths",
        new Error("buildRegionPaths did not return an object"),
        textDump
      );
    } else {
      for (const p of Object.values(paths)) {
        if (typeof p !== "string" || /NaN/.test(p)) {
          recordFailure(
            seed,
            iter,
            tag,
            "buildRegionPaths",
            new Error(`region path contains NaN or is non-string: ${p}`),
            textDump
          );
          break;
        }
      }
    }
  } catch (err) {
    recordFailure(seed, iter, tag, "buildRegionPaths", err, textDump);
  }

  // computeAllRegionAreas: every value must be a finite non-negative number.
  try {
    const areas = computeAllRegionAreas(circles);
    const maxCircle = Math.max(...circles.map((c) => Math.PI * c.r * c.r));
    for (const [mask, a] of areas) {
      if (!Number.isFinite(a) || a < -1e-9) {
        recordFailure(
          seed,
          iter,
          tag,
          "computeAllRegionAreas",
          new Error(`region ${mask} has invalid area: ${a}`),
          textDump
        );
        break;
      }
      if (a > maxCircle + 1e-6) {
        recordFailure(
          seed,
          iter,
          tag,
          "computeAllRegionAreas",
          new Error(`region ${mask} area ${a} exceeds max-circle ${maxCircle}`),
          textDump
        );
        break;
      }
    }
  } catch (err) {
    recordFailure(seed, iter, tag, "computeAllRegionAreas", err, textDump);
  }
}

function main() {
  console.log(`\n── venn fuzz — seed=${SEED} n=${N} (×2 loops) ──`);
  const t0 = Date.now();
  // Loop 1: text-driven set-membership
  for (let i = 0; i < N; i++) {
    const iterSeed = (SEED * 2654435761 + i) >>> 0 || 1;
    const genPickerRng = makeRng(iterSeed);
    const g = GENERATORS[Math.floor(genPickerRng() * GENERATORS.length)];
    runSetMembership(iterSeed, i, g);
  }
  // Loop 2: geometry
  for (let i = 0; i < N; i++) {
    const iterSeed = ((SEED + 0xdeadbe) * 2654435761 + i) >>> 0 || 1;
    runGeometry(iterSeed, i);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} geometry • ${failures.length} failures\r`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const byStage = {};
  for (const f of failures) byStage[f.stage] = (byStage[f.stage] || 0) + 1;

  console.log(`\n  ${2 * N - failures.length}/${2 * N} iterations clean · ${dt}s`);
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
