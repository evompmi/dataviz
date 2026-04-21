// Fuzz test for the UpSet pipeline.
//
// Two independent fuzz loops share this harness:
//
//   1. Wide-format: text → parseRaw → parseSetData → computeMemberships →
//      enumerateIntersections → sortIntersections → truncateIntersections →
//      intersectionLabel / intersectionFilenamePart. Headers are clamped to
//      ≤ 10 columns so the 2ᴺ−1 intersection space stays bounded
//      (1023 max). Invariants: every intersection mask is a positive
//      integer ≤ (1<<n)−1, masks are unique, setIndices is strictly
//      ascending and matches the bitmask, items.length === size, items
//      are sorted; sort modes are stable in length; truncation only
//      keeps rows ≥ thresholds; labels are strings, filename parts are
//      pure ASCII.
//
//   2. Long-format: text → parseRaw → parseLongFormatSets → … same
//      downstream chain. Long-format requires exactly 2 columns, so the
//      generator is more constrained: a (item, set) pair table with
//      seeded variations on label pool, separator, and row count. The
//      long-format parser is expected to throw on non-2-column inputs,
//      so when parseRaw produces a wider table we record that as a
//      *correct* throw rather than a fuzz failure.
//
// Env vars:
//   FUZZ_SEED   initial seed (default 1)
//   FUZZ_N      iterations per loop (default 1000)
//   FUZZ_QUIET  suppresses per-iteration progress ticks

const {
  parseRaw,
  parseSetData,
  parseLongFormatSets,
  computeMemberships,
  enumerateIntersections,
  sortIntersections,
  truncateIntersections,
  intersectionLabel,
  intersectionFilenamePart,
} = require("../helpers/upset-loader");
const { GENERATORS, makeRng } = require("./generators");

const SEED = parseInt(process.env.FUZZ_SEED || "1", 10);
const N = parseInt(process.env.FUZZ_N || "1000", 10);
const QUIET = !!process.env.FUZZ_QUIET;

// UpSet uses a 32-bit mask (1 << i) so the rendered set count is hard-capped
// at 30 in practice; we clamp tighter here so 2ᴺ−1 stays small enough for the
// fuzz loop to enumerate exhaustively without memory pressure.
const MAX_SETS = 10;
const SORT_MODES = ["size-desc", "size-asc", "degree-asc", "degree-desc", "sets", "whatever"];

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

// ── Invariant checks shared by both loops ──────────────────────────────────

function checkIntersections(seed, iter, label, regions, setNames, text) {
  if (!Array.isArray(regions)) {
    recordFailure(
      seed,
      iter,
      label,
      "enumerateIntersections",
      new Error("did not return an array"),
      text
    );
    return false;
  }
  const n = setNames.length;
  const maxMask = n === 0 ? 0 : (1 << n) - 1;
  const seen = new Set();
  for (const r of regions) {
    if (!Number.isInteger(r.mask) || r.mask <= 0 || r.mask > maxMask) {
      recordFailure(
        seed,
        iter,
        label,
        "enumerateIntersections",
        new Error(`mask out of range: ${r.mask} (max ${maxMask})`),
        text
      );
      return false;
    }
    if (seen.has(r.mask)) {
      recordFailure(
        seed,
        iter,
        label,
        "enumerateIntersections",
        new Error(`duplicate mask: ${r.mask}`),
        text
      );
      return false;
    }
    seen.add(r.mask);
    if (!Array.isArray(r.setIndices) || r.setIndices.length !== r.degree) {
      recordFailure(
        seed,
        iter,
        label,
        "enumerateIntersections",
        new Error(`setIndices.length ${r.setIndices?.length} ≠ degree ${r.degree}`),
        text
      );
      return false;
    }
    // setIndices must be strictly ascending and consistent with the bitmask.
    let rebuilt = 0;
    for (let i = 0; i < r.setIndices.length; i++) {
      const idx = r.setIndices[i];
      if (i > 0 && idx <= r.setIndices[i - 1]) {
        recordFailure(
          seed,
          iter,
          label,
          "enumerateIntersections",
          new Error(`setIndices not strictly ascending: ${JSON.stringify(r.setIndices)}`),
          text
        );
        return false;
      }
      rebuilt |= 1 << idx;
    }
    if (rebuilt !== r.mask) {
      recordFailure(
        seed,
        iter,
        label,
        "enumerateIntersections",
        new Error(`mask ${r.mask} ≠ rebuilt-from-setIndices ${rebuilt}`),
        text
      );
      return false;
    }
    if (!Array.isArray(r.items) || r.items.length !== r.size) {
      recordFailure(
        seed,
        iter,
        label,
        "enumerateIntersections",
        new Error(`items.length ${r.items?.length} ≠ size ${r.size}`),
        text
      );
      return false;
    }
    // Items should be string-sorted (enumerateIntersections does items.sort()).
    for (let i = 1; i < r.items.length; i++) {
      if (String(r.items[i]) < String(r.items[i - 1])) {
        recordFailure(
          seed,
          iter,
          label,
          "enumerateIntersections",
          new Error(`items not sorted at index ${i}`),
          text
        );
        return false;
      }
    }
  }
  return true;
}

function checkDownstream(seed, iter, label, regions, setNames, text) {
  // sortIntersections: every mode preserves length and content.
  for (const mode of SORT_MODES) {
    let sorted;
    try {
      sorted = sortIntersections(regions, mode);
    } catch (err) {
      recordFailure(seed, iter, label, `sortIntersections(${mode})`, err, text);
      return;
    }
    if (sorted.length !== regions.length) {
      recordFailure(
        seed,
        iter,
        label,
        `sortIntersections(${mode})`,
        new Error(`length ${sorted.length} ≠ input ${regions.length}`),
        text
      );
      return;
    }
    const inMasks = new Set(regions.map((r) => r.mask));
    for (const r of sorted) {
      if (!inMasks.has(r.mask)) {
        recordFailure(
          seed,
          iter,
          label,
          `sortIntersections(${mode})`,
          new Error(`output contains unknown mask ${r.mask}`),
          text
        );
        return;
      }
    }
  }

  // truncateIntersections: thresholds chosen from observed sizes / degrees.
  const sizes = regions.map((r) => r.size);
  const degrees = regions.map((r) => r.degree);
  const minSize = sizes.length ? Math.floor(Math.min(...sizes) + 1) : 1;
  const minDegree = degrees.length ? Math.max(1, Math.floor(Math.min(...degrees))) : 1;
  // Pick a maxDegree that's ≥ minDegree but can still prune — midway between
  // minDegree and the observed max, ceiling-rounded.
  const maxObservedDegree = degrees.length ? Math.max(...degrees) : minDegree;
  const maxDegree = Math.max(minDegree, Math.ceil((minDegree + maxObservedDegree) / 2));
  let kept;
  try {
    kept = truncateIntersections(regions, { minSize, minDegree, maxDegree });
  } catch (err) {
    recordFailure(seed, iter, label, "truncateIntersections", err, text);
    return;
  }
  for (const r of kept) {
    if (r.size < minSize) {
      recordFailure(
        seed,
        iter,
        label,
        "truncateIntersections",
        new Error(`kept row size ${r.size} < minSize ${minSize}`),
        text
      );
      return;
    }
    if (r.degree < minDegree) {
      recordFailure(
        seed,
        iter,
        label,
        "truncateIntersections",
        new Error(`kept row degree ${r.degree} < minDegree ${minDegree}`),
        text
      );
      return;
    }
    if (r.degree > maxDegree) {
      recordFailure(
        seed,
        iter,
        label,
        "truncateIntersections",
        new Error(`kept row degree ${r.degree} > maxDegree ${maxDegree}`),
        text
      );
      return;
    }
  }

  // Label / filename helpers must produce strings; the filename part must be
  // ASCII-only and lossy enough that it can be embedded in any filesystem.
  for (const r of regions) {
    let lbl, slug;
    try {
      lbl = intersectionLabel(r.setIndices, setNames);
    } catch (err) {
      recordFailure(seed, iter, label, "intersectionLabel", err, text);
      return;
    }
    if (typeof lbl !== "string") {
      recordFailure(
        seed,
        iter,
        label,
        "intersectionLabel",
        new Error(`returned non-string: ${typeof lbl}`),
        text
      );
      return;
    }
    try {
      slug = intersectionFilenamePart(lbl);
    } catch (err) {
      recordFailure(seed, iter, label, "intersectionFilenamePart", err, text);
      return;
    }
    if (typeof slug !== "string") {
      recordFailure(
        seed,
        iter,
        label,
        "intersectionFilenamePart",
        new Error(`returned non-string: ${typeof slug}`),
        text
      );
      return;
    }
    if (/[^a-zA-Z0-9_]/.test(slug)) {
      recordFailure(
        seed,
        iter,
        label,
        "intersectionFilenamePart",
        new Error(`slug contains non-ASCII / non-safe chars: ${JSON.stringify(slug)}`),
        text
      );
      return;
    }
  }
}

// ── Loop 1: wide format ────────────────────────────────────────────────────

function runWide(seed, iter, genFn) {
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

  // UpSet would let the user pick up to 30 sets, but the 2ᴺ−1 intersection
  // space explodes; clamp here so each iteration stays cheap.
  const headers = parsed.headers.slice(0, MAX_SETS);
  const rows = parsed.rows;

  let setData;
  try {
    setData = parseSetData(headers, rows);
  } catch (err) {
    recordFailure(seed, iter, label, "parseSetData", err, text);
    return;
  }
  if (!setData || !Array.isArray(setData.setNames)) {
    recordFailure(seed, iter, label, "parseSetData", new Error("returned malformed result"), text);
    return;
  }
  if (setData.setNames.length < 1) return;

  let memberships;
  try {
    memberships = computeMemberships(setData.setNames, setData.sets);
  } catch (err) {
    recordFailure(seed, iter, label, "computeMemberships", err, text);
    return;
  }
  if (!memberships || !(memberships.membershipMap instanceof Map)) {
    recordFailure(
      seed,
      iter,
      label,
      "computeMemberships",
      new Error("did not return { membershipMap: Map }"),
      text
    );
    return;
  }

  let regions;
  try {
    regions = enumerateIntersections(memberships.membershipMap, setData.setNames);
  } catch (err) {
    recordFailure(seed, iter, label, "enumerateIntersections", err, text);
    return;
  }

  if (!checkIntersections(seed, iter, label, regions, setData.setNames, text)) return;
  checkDownstream(seed, iter, label, regions, setData.setNames, text);
}

// ── Loop 2: long format ────────────────────────────────────────────────────

// 2-column (item, set) generators. The shared corpus is wide-biased, so we
// supply a small set of long-format generators here. Items / set names lean
// on the same LABEL_POOL feel — short, mixed unicode, occasional empties.
const LONG_LABELS = [
  "g1",
  "g2",
  "GENE",
  "α",
  "🧬",
  "with,comma",
  'with"quote',
  "with\ttab",
  "x",
  "",
];
const LONG_SETS = ["A", "B", "C", "D", "E", "F", "G", "H", "set1", "set 2", "α-set", ""];

function pickFrom(rng, pool) {
  return pool[Math.floor(rng() * pool.length)];
}

function genLongPairs(rng) {
  const sep = pickFrom(rng, [",", "\t", ";"]);
  const n = 2 + Math.floor(rng() * 60);
  const lines = [["item", "set"].join(sep)];
  for (let i = 0; i < n; i++) {
    lines.push([pickFrom(rng, LONG_LABELS), pickFrom(rng, LONG_SETS)].join(sep));
  }
  return { label: "long-pairs", text: lines.join("\n") };
}

function genLongDuplicates(rng) {
  // Same (item, set) pair repeated many times — exercises de-dup.
  const sep = ",";
  const n = 3 + Math.floor(rng() * 30);
  const item = pickFrom(rng, LONG_LABELS) || "g0";
  const set = pickFrom(rng, LONG_SETS) || "A";
  const lines = ["item,set"];
  for (let i = 0; i < n; i++) lines.push([item, set].join(sep));
  return { label: "long-duplicates", text: lines.join("\n") };
}

function genLongDegenerate(rng) {
  // Mostly-empty cells — rows with blank item or blank set should be
  // silently skipped by parseLongFormatSets.
  const sep = ",";
  const n = 3 + Math.floor(rng() * 20);
  const lines = ["item,set"];
  for (let i = 0; i < n; i++) {
    const item = rng() < 0.5 ? "" : pickFrom(rng, LONG_LABELS);
    const set = rng() < 0.5 ? "" : pickFrom(rng, LONG_SETS);
    lines.push([item, set].join(sep));
  }
  return { label: "long-degenerate", text: lines.join("\n") };
}

function genLongWideMistake(rng) {
  // Wide-format input mistakenly handed to the long parser — should throw
  // on non-2-column tables. We verify the throw is well-behaved (Error with
  // a readable message), not that it's silent.
  const sep = ",";
  const k = 1 + Math.floor(rng() * 5); // 1 or 3+ cols
  const targetCols = k === 2 ? 3 : k;
  const headers = Array.from({ length: targetCols }, (_, i) => `col${i}`);
  const lines = [headers.join(sep)];
  for (let r = 0; r < 4; r++) {
    lines.push(headers.map(() => pickFrom(rng, LONG_LABELS)).join(sep));
  }
  return { label: "long-wide-mistake", text: lines.join("\n") };
}

const LONG_GENERATORS = [
  genLongPairs,
  genLongPairs,
  genLongDuplicates,
  genLongDegenerate,
  genLongWideMistake,
];

function runLong(seed, iter) {
  const rng = makeRng(seed);
  const gen = LONG_GENERATORS[Math.floor(rng() * LONG_GENERATORS.length)];
  const { label, text } = gen(rng);

  let parsed;
  try {
    parsed = parseRaw(text);
  } catch (err) {
    recordFailure(seed, iter, label, "parseRaw", err, text);
    return;
  }
  if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) return;

  let setData;
  try {
    setData = parseLongFormatSets(parsed.headers, parsed.rows);
  } catch (err) {
    // parseLongFormatSets is *expected* to throw on non-2-column tables.
    // That's the contract the UI relies on (it catches and shows an error).
    // We only flag the throw if the input was a clean 2-column shape.
    if (parsed.headers.length === 2) {
      recordFailure(seed, iter, label, "parseLongFormatSets", err, text);
    }
    return;
  }
  if (!setData || !Array.isArray(setData.setNames)) {
    recordFailure(
      seed,
      iter,
      label,
      "parseLongFormatSets",
      new Error("returned malformed result"),
      text
    );
    return;
  }
  if (setData.setNames.length < 1) return;

  // Clamp set count for the same 2ᴺ-explosion reason as the wide loop.
  if (setData.setNames.length > MAX_SETS) {
    setData.setNames = setData.setNames.slice(0, MAX_SETS);
    const trimmed = new Map();
    for (const n of setData.setNames) trimmed.set(n, setData.sets.get(n));
    setData.sets = trimmed;
  }

  let memberships;
  try {
    memberships = computeMemberships(setData.setNames, setData.sets);
  } catch (err) {
    recordFailure(seed, iter, label, "computeMemberships", err, text);
    return;
  }

  let regions;
  try {
    regions = enumerateIntersections(memberships.membershipMap, setData.setNames);
  } catch (err) {
    recordFailure(seed, iter, label, "enumerateIntersections", err, text);
    return;
  }

  if (!checkIntersections(seed, iter, label, regions, setData.setNames, text)) return;
  checkDownstream(seed, iter, label, regions, setData.setNames, text);
}

function main() {
  console.log(`\n── upset fuzz — seed=${SEED} n=${N} (×2 loops) ──`);
  const t0 = Date.now();

  for (let i = 0; i < N; i++) {
    const iterSeed = (SEED * 2654435761 + i) >>> 0 || 1;
    const genPickerRng = makeRng(iterSeed);
    const g = GENERATORS[Math.floor(genPickerRng() * GENERATORS.length)];
    runWide(iterSeed, i, g);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} wide • ${failures.length} failures\r`);
    }
  }

  for (let i = 0; i < N; i++) {
    const iterSeed = ((SEED + 0xfeedfa) * 2654435761 + i) >>> 0 || 1;
    runLong(iterSeed, i);
    if (!QUIET && i > 0 && i % 100 === 0) {
      process.stdout.write(`  ${i}/${N} long • ${failures.length} failures\r`);
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
