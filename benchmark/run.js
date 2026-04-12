// benchmark/run.js — read benchmark/results-r.json (produced by run-r.R),
// run the same tests through tools/stats.js on bit-identical inputs, and
// emit benchmark.html at the repo root with per-category comparison tables.
//
// Honest-by-design: rows where |Δ| exceeds the target tolerance are flagged
// as failures and rendered red. We don't pretend they passed.
//
// Run with: node benchmark/run.js (after Rscript benchmark/run-r.R)

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const TOL = 5e-3; // ±0.5 % — same bar as the in-repo stats tests

// ── Load tools/stats.js into a sandbox ─────────────────────────────────────
const code = fs.readFileSync(path.join(__dirname, "../tools/stats.js"), "utf-8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const {
  shapiroWilk,
  leveneTest,
  tTest,
  mannWhitneyU,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  tukeyHSD,
  gamesHowell,
  dunnTest,
} = ctx;

// ── Load R reference output ────────────────────────────────────────────────
const resultsPath = path.join(__dirname, "results-r.json");
if (!fs.existsSync(resultsPath)) {
  console.error("benchmark/results-r.json not found — run `Rscript benchmark/run-r.R` first.");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

// ── Helpers ────────────────────────────────────────────────────────────────

// Convert R's named groups object to a sorted array-of-arrays + key list.
// stats.js operates on plain arrays of arrays; group identity is by index.
function groupsToArrays(obj) {
  const keys = Object.keys(obj).sort();
  return { keys, arrays: keys.map((k) => obj[k]) };
}

// Compare two scalar values; returns { delta, pass }.
function cmp(jsVal, rVal) {
  // Treat both 0 ⇒ delta 0. Otherwise absolute delta.
  if (rVal === 0 && jsVal === 0) return { delta: 0, pass: true };
  const delta = Math.abs(jsVal - rVal);
  return { delta, pass: delta <= TOL };
}

// Pair lookup: find a JS pair whose (keys[i], keys[j]) equals R pair (i, j),
// in either order.
function findPair(jsPairs, keys, ri, rj) {
  for (const p of jsPairs) {
    const a = keys[p.i],
      b = keys[p.j];
    if ((a === ri && b === rj) || (a === rj && b === ri)) return p;
  }
  return null;
}

// ── Run all tests, collect rows ────────────────────────────────────────────

const rows = []; // { category, label, n, metric, r, js, delta, pass }

function pushRow(r) {
  rows.push(r);
}

for (const t of data.tests) {
  const cat = t.category;
  const lbl = t.label;
  const n = t.n;

  try {
    if (cat === "Shapiro-Wilk") {
      const j = shapiroWilk(t.inputs.x);
      pushRow({ category: cat, label: lbl, n, metric: "W", r: t.r.statistic, js: j.W, ...cmp(j.W, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "Levene (Brown-Forsythe)") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = leveneTest(arrays);
      pushRow({ category: cat, label: lbl, n, metric: "F", r: t.r.statistic, js: j.F, ...cmp(j.F, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "Student t" || cat === "Welch t") {
      const equalVar = cat === "Student t";
      const j = tTest(t.inputs.a, t.inputs.b, { equalVar });
      pushRow({ category: cat, label: lbl, n, metric: "t", r: t.r.statistic, js: j.t, ...cmp(j.t, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "Mann-Whitney U") {
      const j = mannWhitneyU(t.inputs.a, t.inputs.b);
      // R's wilcox.test reports W = U1 (sum of ranks - n1(n1+1)/2 of the 1st sample).
      pushRow({ category: cat, label: lbl, n, metric: "U", r: t.r.statistic, js: j.U1, ...cmp(j.U1, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "one-way ANOVA") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = oneWayANOVA(arrays);
      pushRow({ category: cat, label: lbl, n, metric: "F", r: t.r.statistic, js: j.F, ...cmp(j.F, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "Welch ANOVA") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = welchANOVA(arrays);
      pushRow({ category: cat, label: lbl, n, metric: "F", r: t.r.statistic, js: j.F, ...cmp(j.F, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "Kruskal-Wallis") {
      const { arrays } = groupsToArrays(t.inputs.groups);
      const j = kruskalWallis(arrays);
      pushRow({ category: cat, label: lbl, n, metric: "H", r: t.r.statistic, js: j.H, ...cmp(j.H, t.r.statistic) });
      pushRow({ category: cat, label: lbl, n, metric: "p", r: t.r.p, js: j.p, ...cmp(j.p, t.r.p) });
    } else if (cat === "Tukey HSD" || cat === "Games-Howell" || cat === "Dunn (BH)") {
      const { keys, arrays } = groupsToArrays(t.inputs.groups);
      const fn = cat === "Tukey HSD" ? tukeyHSD : cat === "Games-Howell" ? gamesHowell : dunnTest;
      const j = fn(arrays);
      for (const rp of t.r.pairs) {
        const jp = findPair(j.pairs, keys, rp.i, rp.j);
        const jsP = jp == null ? NaN : (cat === "Dunn (BH)" ? jp.pAdj : jp.p);
        pushRow({
          category: cat,
          label: `${lbl} [${rp.i} vs ${rp.j}]`,
          n,
          metric: "pAdj",
          r: rp.pAdj,
          js: jsP,
          ...cmp(jsP, rp.pAdj),
        });
      }
    } else {
      console.warn(`unknown category: ${cat}`);
    }
  } catch (err) {
    pushRow({
      category: cat,
      label: lbl,
      n,
      metric: "error",
      r: NaN,
      js: NaN,
      delta: NaN,
      pass: false,
      error: err.message,
    });
  }
}

// ── Aggregate ──────────────────────────────────────────────────────────────

const total = rows.length;
const passed = rows.filter((r) => r.pass).length;
const failed = total - passed;
const finiteDeltas = rows.map((r) => r.delta).filter((d) => Number.isFinite(d));
const maxDelta = finiteDeltas.length ? Math.max(...finiteDeltas) : 0;

// Group by category
const byCategory = {};
for (const r of rows) {
  if (!byCategory[r.category]) byCategory[r.category] = [];
  byCategory[r.category].push(r);
}

// ── HTML rendering ─────────────────────────────────────────────────────────

function fmt(v) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e6) return v.toPrecision(6).replace(/\.?0+$/, "");
  return v.toExponential(3);
}

function fmtDelta(d) {
  if (!Number.isFinite(d)) return "—";
  if (d === 0) return "0";
  return d.toExponential(2);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const cats = Object.keys(byCategory);

const tableHtml = cats
  .map((cat) => {
    const catRows = byCategory[cat];
    const catTotal = catRows.length;
    const catPassed = catRows.filter((r) => r.pass).length;
    const catFailed = catTotal - catPassed;
    const badge =
      catFailed === 0
        ? `<span class="badge badge-pass">${catPassed}/${catTotal} pass</span>`
        : `<span class="badge badge-fail">${catFailed}/${catTotal} FAIL</span>`;

    const trs = catRows
      .map(
        (r) => `
      <tr class="${r.pass ? "row-pass" : "row-fail"}">
        <td>${escapeHtml(r.label)}</td>
        <td class="num">${r.n}</td>
        <td>${escapeHtml(r.metric)}</td>
        <td class="num">${fmt(r.r)}</td>
        <td class="num">${fmt(r.js)}</td>
        <td class="num">${fmtDelta(r.delta)}</td>
        <td class="ok-cell ${r.pass ? "ok-pass" : "ok-fail"}">${r.pass ? "✓" : r.error ? `error: ${escapeHtml(r.error)}` : "✗"}</td>
      </tr>`
      )
      .join("");

    return `
    <section class="category">
      <h2>${escapeHtml(cat)} ${badge}</h2>
      <table>
        <colgroup>
          <col class="c-dataset" />
          <col class="c-n" />
          <col class="c-metric" />
          <col class="c-r" />
          <col class="c-js" />
          <col class="c-delta" />
          <col class="c-ok" />
        </colgroup>
        <thead>
          <tr>
            <th>dataset</th>
            <th class="num">n</th>
            <th>metric</th>
            <th class="num">R</th>
            <th class="num">Toolbox</th>
            <th class="num">|Δ|</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </section>`;
  })
  .join("\n");

const passPct = ((passed / total) * 100).toFixed(1);
const summaryClass = failed === 0 ? "summary-pass" : "summary-mixed";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>dataviz · statistical benchmark vs R</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: monospace;
    background: #f0f0f4;
    background-image: radial-gradient(circle, #d0d0d8 0.8px, transparent 0.8px);
    background-size: 20px 20px;
    color: #1a1a1a;
    padding: 2rem 1rem 4rem;
    line-height: 1.45;
  }
  .container { max-width: 1100px; margin: 0 auto; }
  header { margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
  .lede { color: #444; margin-bottom: 1rem; }
  .lede a { color: #0048a8; }
  .summary {
    padding: 1rem 1.25rem;
    border: 2px solid #1a1a1a;
    background: #fff;
    margin-bottom: 1.5rem;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }
  .summary-pass { border-color: #2a7a2a; }
  .summary-mixed { border-color: #c47a00; }
  .summary div { display: flex; flex-direction: column; }
  .summary .k { font-size: 0.75rem; text-transform: uppercase; color: #666; }
  .summary .v { font-size: 1.4rem; font-weight: bold; }
  .v-pass { color: #2a7a2a; }
  .v-fail { color: #b22222; }
  .category {
    margin-bottom: 1.5rem;
    background: #fff;
    border: 1px solid #c0c0c8;
    padding: 1rem 1.25rem;
  }
  .category h2 {
    font-size: 1rem;
    margin-bottom: 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .badge {
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: 3px;
    font-weight: normal;
  }
  .badge-pass { background: #d4f0d4; color: #1a5a1a; }
  .badge-fail { background: #f5d4d4; color: #8a1a1a; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
    table-layout: fixed;
  }
  col.c-dataset { width: auto; }
  col.c-n       { width: 60px; }
  col.c-metric  { width: 90px; }
  th:nth-child(3), td:nth-child(3) { padding-left: 1.25rem; }
  col.c-r       { width: 120px; }
  col.c-js      { width: 120px; }
  col.c-delta   { width: 110px; }
  col.c-ok      { width: 40px; }
  td.ok-cell { text-align: center; font-size: 1.2rem; line-height: 1; }
  td.ok-pass { color: #2a7a2a; font-weight: bold; }
  td.ok-fail { color: #b22222; font-weight: bold; }
  th, td {
    padding: 0.3rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid #e0e0e6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  th.num, td.num { text-align: right; }
  th { background: #f4f4f8; font-weight: normal; color: #555; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .row-pass td { background: #fff; }
  .row-fail td { background: #fbe8e8; color: #6a0a0a; }
  footer {
    margin-top: 2rem;
    color: #666;
    font-size: 0.75rem;
    text-align: center;
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>statistical cross-validation vs R ${escapeHtml(data.meta.r_version.replace(/^R version /, ""))}</h1>
    <p class="lede">
      Every test in <code>tools/stats.js</code> is rerun against the
      corresponding R reference function on real built-in datasets
      (iris, PlantGrowth, ToothGrowth, mtcars, chickwts, InsectSprays,
      sleep, women, trees, airquality, warpbreaks). Inputs are bit-identical
      between R and the tool. Target tolerance is |Δ| ≤ ${TOL} on test
      statistics and p-values. Failures are flagged in red and counted
      honestly — they mean we have work to do.
      Reproduce locally with <code>Rscript benchmark/run-r.R &amp;&amp; node benchmark/run.js</code>.
      <a href="../index.html">← back to tools</a>
    </p>
  </header>

  <div class="summary ${summaryClass}">
    <div><span class="k">comparisons</span><span class="v">${total}</span></div>
    <div><span class="k">passing</span><span class="v v-pass">${passed} (${passPct}%)</span></div>
    <div><span class="k">failing</span><span class="v ${failed === 0 ? "v-pass" : "v-fail"}">${failed}</span></div>
    <div><span class="k">max |Δ|</span><span class="v">${fmtDelta(maxDelta)}</span></div>
  </div>

  ${tableHtml}

  <footer>
    R reference generated ${escapeHtml(data.meta.generated)}.
    Tolerance ${TOL}. Tool source: <code>tools/stats.js</code>.
  </footer>
</div>
</body>
</html>
`;

const outPath = path.join(__dirname, "../benchmark.html");
fs.writeFileSync(outPath, html);

console.log(`wrote ${outPath}`);
console.log(`  ${total} comparisons across ${cats.length} categories`);
console.log(`  ${passed} pass, ${failed} fail, max |Δ| = ${fmtDelta(maxDelta)}`);
if (failed > 0) {
  console.log("  failing rows:");
  for (const r of rows.filter((r) => !r.pass)) {
    console.log(`    [${r.category}] ${r.label} (${r.metric}): R=${fmt(r.r)} JS=${fmt(r.js)} |Δ|=${fmtDelta(r.delta)}`);
  }
}
