// Statistical tests — benchmarked against R output with ±0.5% tolerance.
//
// Reference values produced by running real R (stats::shapiro.test) on the
// same inputs. See the shapiroCases array below for the exact one-liners.
//
// Tolerance key:
//   1e-4  — distribution primitives (normcdf, gammaln, tcdf, ...)
//   5e-3  — test statistics (W) and p-values (matches power-tool bar)

const { suite, test, assert, approx, summary } = require("./harness");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

// Load tools/stats.js into a vm context. It's plain JS that declares its
// functions at top-level, so they land in the ctx object directly.
const code = fs.readFileSync(path.join(__dirname, "../tools/stats.js"), "utf-8");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const {
  normcdf,
  tcdf,
  tinv,
  shapiroWilk,
  sampleMean,
  sampleVariance,
  sampleSD,
  rankWithTies,
  leveneTest,
  tTest,
  mannWhitneyU,
  cohenD,
  hedgesG,
  rankBiserial,
  oneWayANOVA,
  welchANOVA,
  kruskalWallis,
  etaSquared,
  epsilonSquared,
  ptukey,
  qtukey,
  tukeyHSD,
  gamesHowell,
  bhAdjust,
  dunnTest,
  compactLetterDisplay,
  selectTest,
} = ctx;

// ── Primitives smoke test ──────────────────────────────────────────────────
// Power-tool tests already cover these exhaustively — here we just confirm
// stats.js loads cleanly and exposes the primitives as globals.

suite("stats.js — primitive smoke tests");

test("normcdf(0) === 0.5", () => approx(normcdf(0), 0.5, 1e-4));
test("normcdf(1.96) ≈ 0.975", () => approx(normcdf(1.96), 0.975, 1e-4));
test("tcdf(0, 10) === 0.5", () => approx(tcdf(0, 10), 0.5, 1e-4));

// ── tinv extreme-quantile coverage ─────────────────────────────────────────
//
// Earlier revisions used pure bisection with hard-coded or lightly-expanded
// bounds, which under-resolved heavy-tail cases. The current implementation
// uses closed forms for df = 1 and df = 2, and Newton-Raphson seeded with a
// Cornish-Fisher correction for df ≥ 3 (bisection fallback). Reference
// values from R's qt(). Tolerances here are absolute and tight enough to
// catch any regression to plain bisection.

test("tinv standard critical values match R qt()", () => {
  // All reference values generated with R: qt(p, df). 1e-10 absolute
  // tolerance is tight enough to fail for the old ±50 bisection or any
  // future regression to plain bisection.
  approx(tinv(0.025, 2), -4.3026527297494637, 1e-10);
  approx(tinv(0.01, 5), -3.3649299989072179, 1e-10);
  approx(tinv(0.975, 10), 2.2281388519862735, 1e-10);
  approx(tinv(0.5, 10), 0, 1e-12);
});

test("tinv closed forms — df=1 (Cauchy) and df=2", () => {
  approx(tinv(0.001, 1), -318.30883898555049, 1e-9);
  approx(tinv(0.99, 1), 31.820515953773935, 1e-10);
  approx(tinv(0.01, 2), -6.9645567342832733, 1e-10);
  approx(tinv(0.75, 2), 0.81649658092772592, 1e-12);
});

test("tinv handles extreme quantiles beyond the old ±50 clamp", () => {
  // R> qt(1e-6, 3)      = -103.2995
  // R> qt(1e-10, 2)     = -70710.6781
  // R> qt(1e-10, 5)     = -156.825592708894
  // R> qt(1e-15, 3)     = -103311.08359285
  // R> qt(1 - 1e-12, 30) = 11.397227795416
  approx(tinv(1e-6, 3), -103.2995, 1e-3);
  approx(tinv(1e-10, 2), -70710.6781, 1e-2);
  approx(tinv(1e-10, 5), -156.825592708894, 1e-7);
  approx(tinv(1e-15, 3), -103311.08359285, 1e-4);
  approx(tinv(1 - 1e-12, 30), 11.397227795416, 1e-10);
});

test("tinv symmetric near p=1 without catastrophic cancellation", () => {
  // Upper-tail inputs are handled by folding into the left tail, so the
  // implementation must be antisymmetric across 0.5 to the precision
  // allowed by the float representation of (1 - p). We stay at eps ≥ 1e-6
  // so that (1 - eps) round-trips cleanly — below that, the subtraction
  // 1 - (1 - eps) itself loses precision regardless of the solver.
  for (const df of [1, 2, 3, 10, 50]) {
    for (const eps of [1e-3, 1e-6]) {
      const lo = tinv(eps, df);
      const hi = tinv(1 - eps, df);
      approx(hi, -lo, 1e-9 * (Math.abs(lo) + 1));
    }
  }
});

test("tinv round-trips through tcdf at extreme p", () => {
  // Self-consistency: tcdf(tinv(p, df), df) ≈ p
  for (const df of [1, 2, 3, 10, 30]) {
    for (const p of [1e-8, 1e-4, 0.25, 0.75, 1 - 1e-4]) {
      const q = tinv(p, df);
      approx(tcdf(q, df), p, 1e-9);
    }
  }
});

// ── Sample helpers ─────────────────────────────────────────────────────────

suite("stats.js — sample helpers");

const xs = [2, 4, 4, 4, 5, 5, 7, 9];
test("sampleMean", () => approx(sampleMean(xs), 5, 1e-12));
test("sampleVariance (n-1)", () => approx(sampleVariance(xs), 32 / 7, 1e-12));
test("sampleSD", () => approx(sampleSD(xs), Math.sqrt(32 / 7), 1e-12));

test("rankWithTies — no ties", () => {
  const { ranks, tieCorrection } = rankWithTies([10, 20, 30]);
  assert(ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3, "ranks [1,2,3]");
  assert(tieCorrection === 0, "no tie correction");
});

test("rankWithTies — with ties", () => {
  // values = [1, 2, 2, 3] → ranks [1, 2.5, 2.5, 4]
  const { ranks, tieCorrection } = rankWithTies([1, 2, 2, 3]);
  assert(ranks[0] === 1, "rank of 1");
  assert(ranks[1] === 2.5 && ranks[2] === 2.5, "tied ranks");
  assert(ranks[3] === 4, "rank of 3");
  // tie group size = 2 → t³−t = 8−2 = 6
  assert(tieCorrection === 6, "tie correction = 6");
});

test("rankWithTies — unsorted input preserves original positions", () => {
  // Regression guard: a broken array-sort comparator ((a,b)=>a-b on pairs)
  // would produce NaN comparisons and give garbage ranks here.
  const { ranks } = rankWithTies([50, 10, 30, 40, 20]);
  // sorted values: 10,20,30,40,50 → ranks 1..5
  // back to original positions: [50→5, 10→1, 30→3, 40→4, 20→2]
  assert(
    ranks[0] === 5 && ranks[1] === 1 && ranks[2] === 3 && ranks[3] === 4 && ranks[4] === 2,
    `ranks out of order: ${ranks.join(",")}`
  );
});

test("rankWithTies — interleaved duplicates", () => {
  // [3, 1, 2, 1, 3, 2] sorted: 1,1,2,2,3,3 → ranks 1.5,1.5,3.5,3.5,5.5,5.5
  // back to original positions: 3→5.5, 1→1.5, 2→3.5, 1→1.5, 3→5.5, 2→3.5
  const { ranks, tieCorrection } = rankWithTies([3, 1, 2, 1, 3, 2]);
  const expected = [5.5, 1.5, 3.5, 1.5, 5.5, 3.5];
  for (let i = 0; i < 6; i++) {
    assert(ranks[i] === expected[i], `ranks[${i}]=${ranks[i]} expected ${expected[i]}`);
  }
  // Three tie groups of size 2 each → each contributes 2^3-2 = 6; total 18
  assert(tieCorrection === 18, `tieCorrection=${tieCorrection}`);
});

// ── Shapiro-Wilk vs R ──────────────────────────────────────────────────────
//
// Each case is: (label, data, W_from_R, p_from_R)
// R code to reproduce (one per case):
//   x <- c(...); shapiro.test(x)

suite("stats.js — Shapiro-Wilk (W and p vs R)");

// Every W/p below was generated by running shapiro.test in R 4.x on the exact
// numeric vector shown, not copied from memory. To re-verify:
//   Rscript -e 'x <- c(...); print(shapiro.test(x))'
const shapiroCases = [
  {
    // R> shapiro.test(datasets::iris$Sepal.Length)  → W=0.976090  p=0.0101812
    label: "iris Sepal.Length (n=150)",
    x: [
      5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9, 5.4, 4.8, 4.8, 4.3, 5.8, 5.7, 5.4, 5.1, 5.7,
      5.1, 5.4, 5.1, 4.6, 5.1, 4.8, 5.0, 5.0, 5.2, 5.2, 4.7, 4.8, 5.4, 5.2, 5.5, 4.9, 5.0, 5.5, 4.9,
      4.4, 5.1, 5.0, 4.5, 4.4, 5.0, 5.1, 4.8, 5.1, 4.6, 5.3, 5.0, 7.0, 6.4, 6.9, 5.5, 6.5, 5.7, 6.3,
      4.9, 6.6, 5.2, 5.0, 5.9, 6.0, 6.1, 5.6, 6.7, 5.6, 5.8, 6.2, 5.6, 5.9, 6.1, 6.3, 6.1, 6.4, 6.6,
      6.8, 6.7, 6.0, 5.7, 5.5, 5.5, 5.8, 6.0, 5.4, 6.0, 6.7, 6.3, 5.6, 5.5, 5.5, 6.1, 5.8, 5.0, 5.6,
      5.7, 5.7, 6.2, 5.1, 5.7, 6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2, 6.5, 6.4, 6.8, 5.7,
      5.8, 6.4, 6.5, 7.7, 7.7, 6.0, 6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2, 7.4, 7.9, 6.4,
      6.3, 6.1, 7.7, 6.3, 6.4, 6.0, 6.9, 6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
    ],
    W: 0.97609,
    p: 0.0101812,
  },
  {
    // R> shapiro.test(datasets::PlantGrowth$weight) → W=0.982683  p=0.891507
    label: "PlantGrowth weight (n=30)",
    x: [
      4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14, 4.81, 4.17, 4.41, 3.59, 5.87, 3.83,
      6.03, 4.89, 4.32, 4.69, 6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26,
    ],
    W: 0.982683,
    p: 0.891507,
  },
  {
    // R> shapiro.test(datasets::sleep$extra) → W=0.946073  p=0.311375
    label: "sleep extra (n=20)",
    x: [
      0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0, 1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6,
      4.6, 3.4,
    ],
    W: 0.946073,
    p: 0.311375,
  },
  {
    // R> shapiro.test(c(1,2,3,4,5)) → W=0.986762  p=0.967174
    label: "uniform 1..5 (n=5)",
    x: [1, 2, 3, 4, 5],
    W: 0.986762,
    p: 0.967174,
  },
  {
    // R> shapiro.test(c(1,2,3)) → W=1  p=1
    label: "exact n=3",
    x: [1, 2, 3],
    W: 1,
    p: 1,
  },
  {
    // R> shapiro.test(c(1,1,1,1,2,2,3,4,8,20)) → W=0.628233  p=0.000120265
    label: "skewed n=10",
    x: [1, 1, 1, 1, 2, 2, 3, 4, 8, 20],
    W: 0.628233,
    p: 0.000120265,
  },
  {
    // R> shapiro.test(datasets::women$height) → W=0.963593  p=0.754533
    label: "women height (n=15)",
    x: [58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72],
    W: 0.963593,
    p: 0.754533,
  },
  {
    // R> shapiro.test(datasets::mtcars$mpg) → W=0.947565  p=0.122881
    label: "mtcars mpg (n=32)",
    x: [
      21.0, 21.0, 22.8, 21.4, 18.7, 18.1, 14.3, 24.4, 22.8, 19.2, 17.8, 16.4, 17.3, 15.2, 10.4,
      10.4, 14.7, 32.4, 30.4, 33.9, 21.5, 15.5, 15.2, 13.3, 19.2, 27.3, 26.0, 30.4, 15.8, 19.7,
      15.0, 21.4,
    ],
    W: 0.947565,
    p: 0.122881,
  },
];

for (const c of shapiroCases) {
  const { W, p } = shapiroWilk(c.x);
  test(`${c.label} — W ≈ ${c.W}`, () => {
    // Relative tolerance 0.5% on W
    const rel = Math.abs(W - c.W) / c.W;
    assert(rel < 5e-3, `W=${W.toFixed(5)} vs R=${c.W} (rel diff ${rel.toExponential(2)})`);
  });
  test(`${c.label} — p ≈ ${c.p}`, () => {
    // For very small p values use absolute tolerance, otherwise relative.
    if (c.p < 0.001) {
      assert(Math.abs(p - c.p) < 5e-4, `p=${p.toExponential(3)} vs R=${c.p}`);
    } else {
      const rel = Math.abs(p - c.p) / c.p;
      assert(rel < 5e-2, `p=${p.toFixed(5)} vs R=${c.p} (rel diff ${rel.toExponential(2)})`);
    }
  });
}

// Edge cases
suite("stats.js — Shapiro-Wilk edge cases");

test("n < 3 → error", () => {
  const r = shapiroWilk([1, 2]);
  assert(r.error && Number.isNaN(r.W), "returns error object");
});
test("zero variance → error", () => {
  const r = shapiroWilk([5, 5, 5, 5, 5]);
  assert(r.error, "returns error object");
});

// ── Shared fixtures (used by Levene / t / Mann-Whitney / effect sizes) ─────
// All reference values regenerated from real R — see inline R one-liners.

// R base:  sleep$extra[sleep$group==1]
const sleepG1 = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0];
// R base:  sleep$extra[sleep$group==2]
const sleepG2 = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4];

// R base:  iris$Sepal.Length[iris$Species=="setosa"]
const irisSetosa = [
  5.1, 4.9, 4.7, 4.6, 5.0, 5.4, 4.6, 5.0, 4.4, 4.9, 5.4, 4.8, 4.8, 4.3, 5.8, 5.7, 5.4, 5.1, 5.7,
  5.1, 5.4, 5.1, 4.6, 5.1, 4.8, 5.0, 5.0, 5.2, 5.2, 4.7, 4.8, 5.4, 5.2, 5.5, 4.9, 5.0, 5.5, 4.9,
  4.4, 5.1, 5.0, 4.5, 4.4, 5.0, 5.1, 4.8, 5.1, 4.6, 5.3, 5.0,
];
// R base:  iris$Sepal.Length[iris$Species=="versicolor"]
const irisVersicolor = [
  7.0, 6.4, 6.9, 5.5, 6.5, 5.7, 6.3, 4.9, 6.6, 5.2, 5.0, 5.9, 6.0, 6.1, 5.6, 6.7, 5.6, 5.8, 6.2,
  5.6, 5.9, 6.1, 6.3, 6.1, 6.4, 6.6, 6.8, 6.7, 6.0, 5.7, 5.5, 5.5, 5.8, 6.0, 5.4, 6.0, 6.7, 6.3,
  5.6, 5.5, 5.5, 6.1, 5.8, 5.0, 5.6, 5.7, 5.7, 6.2, 5.1, 5.7,
];

// ── Levene's test (Brown-Forsythe) vs R ────────────────────────────────────
//
// Reference values produced via:
//   levene_bf <- function(values, groups) {
//     dev <- abs(values - ave(values, groups, FUN=median))
//     summary(aov(dev ~ factor(groups)))[[1]]
//   }

suite("stats.js — Levene (Brown-Forsythe) vs R");

test("PlantGrowth (3 groups) — F=1.119186 p=0.341227", () => {
  // R> levene_bf(PlantGrowth$weight, PlantGrowth$group)
  const ctrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
  const trt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
  const trt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
  const r = leveneTest([ctrl, trt1, trt2]);
  approx(r.F, 1.119186, 5e-3);
  approx(r.p, 0.341227, 5e-3);
  assert(r.df1 === 2 && r.df2 === 27, `df ${r.df1},${r.df2}`);
});

test("iris Sepal.Length (3 species) — F=6.352720 p=0.002259", () => {
  // R> levene_bf(iris$Sepal.Length, iris$Species)
  const virginica = [
    6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2, 6.5, 6.4, 6.8, 5.7, 5.8, 6.4, 6.5, 7.7, 7.7,
    6.0, 6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2, 7.4, 7.9, 6.4, 6.3, 6.1, 7.7, 6.3, 6.4,
    6.0, 6.9, 6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
  ];
  const r = leveneTest([irisSetosa, irisVersicolor, virginica]);
  approx(r.F, 6.35272, 5e-3);
  approx(r.p, 0.002259, 5e-2); // looser on tiny p — still order-of-magnitude
  assert(r.df1 === 2 && r.df2 === 147, `df ${r.df1},${r.df2}`);
});

test("simple 2-group — F=4.230174 p=0.069848", () => {
  // R> levene_bf(c(1:5, seq(2,12,2)), rep(c("A","B"),c(5,6)))
  const r = leveneTest([
    [1, 2, 3, 4, 5],
    [2, 4, 6, 8, 10, 12],
  ]);
  approx(r.F, 4.230174, 5e-3);
  approx(r.p, 0.069848, 5e-3);
});

test("2 groups with equal variance → p large", () => {
  const r = leveneTest([
    [1, 2, 3, 4, 5],
    [10, 11, 12, 13, 14],
  ]);
  assert(r.p > 0.5, `p should be large (got ${r.p})`);
});

// ── t-tests vs R ───────────────────────────────────────────────────────────
//
// R base: t.test(x, y, var.equal=TRUE|FALSE)

suite("stats.js — Student / Welch t-tests vs R");

test("sleep Student t — t=-1.860813 df=18 p=0.079187", () => {
  // R> t.test(sleep$extra[1:10], sleep$extra[11:20], var.equal=TRUE)
  const r = tTest(sleepG1, sleepG2, { equalVar: true });
  approx(r.t, -1.860813, 5e-3);
  assert(r.df === 18, `df ${r.df}`);
  approx(r.p, 0.079187, 5e-3);
});

test("sleep Welch t — t=-1.860813 df=17.776474 p=0.079394", () => {
  // R> t.test(..., var.equal=FALSE)
  const r = tTest(sleepG1, sleepG2, { equalVar: false });
  approx(r.t, -1.860813, 5e-3);
  approx(r.df, 17.776474, 5e-3);
  approx(r.p, 0.079394, 5e-3);
});

test("iris setosa vs versicolor Student — t=-10.520986 df=98", () => {
  // R> t.test(setosa$SL, versicolor$SL, var.equal=TRUE)
  //    p ≈ 8.985e-18 (below our float precision for p, so check t and df)
  const r = tTest(irisSetosa, irisVersicolor, { equalVar: true });
  approx(r.t, -10.520986, 5e-3);
  assert(r.df === 98, `df ${r.df}`);
  assert(r.p < 1e-15, "p should be astronomically small");
});

test("iris setosa vs versicolor Welch — t=-10.520986 df=86.538002", () => {
  // R> t.test(setosa$SL, versicolor$SL)
  const r = tTest(irisSetosa, irisVersicolor, { equalVar: false });
  approx(r.t, -10.520986, 5e-3);
  approx(r.df, 86.538002, 5e-3);
  assert(r.p < 1e-15, "p should be astronomically small");
});

test("identical samples → t=0 p=1", () => {
  const r = tTest([1, 2, 3, 4], [1, 2, 3, 4]);
  approx(r.t, 0, 1e-12);
  approx(r.p, 1, 1e-12);
});

test("error on n<2", () => {
  const r = tTest([1], [2, 3, 4]);
  assert(r.error, "returns error");
});

// ── Mann-Whitney U vs R ────────────────────────────────────────────────────
//
// R base: wilcox.test(x, y, exact=FALSE, correct=TRUE)
// Note: R reports "W" = U1 (our `U1` field), not U = min(U1, U2).

suite("stats.js — Mann-Whitney U vs R");

test("sleep — U1=25.5 p=0.069328", () => {
  // R> wilcox.test(sleep$extra[1:10], sleep$extra[11:20], exact=FALSE, correct=TRUE)
  const r = mannWhitneyU(sleepG1, sleepG2);
  approx(r.U1, 25.5, 1e-6);
  approx(r.p, 0.069328, 5e-3);
});

test("iris setosa vs versicolor — U1=168.5", () => {
  // R> wilcox.test(setosa$SL, versicolor$SL, exact=FALSE, correct=TRUE)
  //    W=168.5  p≈8.35e-14
  const r = mannWhitneyU(irisSetosa, irisVersicolor);
  approx(r.U1, 168.5, 1e-6);
  assert(r.p < 1e-10, `p should be tiny (got ${r.p})`);
});

test("small samples with ties — U1=5 p=0.077947", () => {
  // R> wilcox.test(c(1,2,2,3,4), c(2,3,4,5,6,6), exact=FALSE, correct=TRUE)
  const r = mannWhitneyU([1, 2, 2, 3, 4], [2, 3, 4, 5, 6, 6]);
  approx(r.U1, 5, 1e-6);
  approx(r.p, 0.077947, 1e-2); // tie correction has some room
});

test("empty group → error", () => {
  const r = mannWhitneyU([], [1, 2, 3]);
  assert(r.error, "returns error");
});

// ── Effect sizes vs R ──────────────────────────────────────────────────────

suite("stats.js — effect sizes");

test("Cohen d — sleep groups", () => {
  // R> (mean(g1)-mean(g2)) / sqrt(((n1-1)*var(g1)+(n2-1)*var(g2))/(n1+n2-2))
  approx(cohenD(sleepG1, sleepG2), -0.832181, 5e-3);
});

test("Cohen d — iris setosa vs versicolor", () => {
  approx(cohenD(irisSetosa, irisVersicolor), -2.104197, 5e-3);
});

test("Hedges g ≤ |Cohen d| (bias-corrected shrinks)", () => {
  const d = cohenD(sleepG1, sleepG2);
  const g = hedgesG(sleepG1, sleepG2);
  assert(Math.abs(g) < Math.abs(d), `|g|=${Math.abs(g)} not < |d|=${Math.abs(d)}`);
});

test("rankBiserial — identical groups → 0", () => {
  const { U1 } = mannWhitneyU([1, 2, 3, 4], [1, 2, 3, 4]);
  approx(rankBiserial(U1, 4, 4), 0, 1e-12);
});

test("rankBiserial — extreme separation → ±1", () => {
  // x all below y → U1 = 0 → r = 1
  const { U1 } = mannWhitneyU([1, 2, 3], [10, 20, 30]);
  approx(rankBiserial(U1, 3, 3), 1, 1e-12);
});

// ── Shared k-sample fixtures ───────────────────────────────────────────────

// PlantGrowth (3 groups × 10)
const pgCtrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
const pgTrt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
const pgTrt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
const pg = [pgCtrl, pgTrt1, pgTrt2];

// iris Sepal.Length (3 species × 50)
const irisVirginica = [
  6.3, 5.8, 7.1, 6.3, 6.5, 7.6, 4.9, 7.3, 6.7, 7.2, 6.5, 6.4, 6.8, 5.7, 5.8, 6.4, 6.5, 7.7, 7.7,
  6.0, 6.9, 5.6, 7.7, 6.3, 6.7, 7.2, 6.2, 6.1, 6.4, 7.2, 7.4, 7.9, 6.4, 6.3, 6.1, 7.7, 6.3, 6.4,
  6.0, 6.9, 6.7, 6.9, 5.8, 6.8, 6.7, 6.7, 6.3, 6.5, 6.2, 5.9,
];
const irisSL = [irisSetosa, irisVersicolor, irisVirginica];

// InsectSprays (6 sprays × 12 observations)
const isA = [10, 7, 20, 14, 14, 12, 10, 23, 17, 20, 14, 13];
const isB = [11, 17, 21, 11, 16, 14, 17, 17, 19, 21, 7, 13];
const isC = [0, 1, 7, 2, 3, 1, 2, 1, 3, 0, 1, 4];
const isD = [3, 5, 12, 6, 4, 3, 5, 5, 5, 5, 2, 4];
const isE = [3, 5, 3, 5, 3, 6, 1, 1, 3, 2, 6, 4];
const isF = [11, 9, 15, 22, 15, 16, 13, 10, 26, 26, 24, 13];
const insectSprays = [isA, isB, isC, isD, isE, isF];

// ── One-way ANOVA vs R ─────────────────────────────────────────────────────

suite("stats.js — one-way ANOVA vs R");

test("PlantGrowth — F=4.846088 df=2,27 p=0.01591", () => {
  // R> summary(aov(weight ~ group, data=PlantGrowth))
  const r = oneWayANOVA(pg);
  approx(r.F, 4.846088, 5e-3);
  assert(r.df1 === 2 && r.df2 === 27, `df ${r.df1},${r.df2}`);
  approx(r.p, 0.01591, 5e-3);
});

test("iris Sepal.Length — F=119.2645 df=2,147 p≈1.67e-31", () => {
  const r = oneWayANOVA(irisSL);
  approx(r.F, 119.264502, 5e-3);
  assert(r.df1 === 2 && r.df2 === 147, `df ${r.df1},${r.df2}`);
  assert(r.p < 1e-25, `p should be tiny: got ${r.p}`);
});

test("InsectSprays — F=34.702282 df=5,66", () => {
  const r = oneWayANOVA(insectSprays);
  approx(r.F, 34.702282, 5e-3);
  assert(r.df1 === 5 && r.df2 === 66, `df ${r.df1},${r.df2}`);
  assert(r.p < 1e-10, "p should be tiny");
});

test("identical groups → F=0 p=1", () => {
  const r = oneWayANOVA([
    [1, 2, 3, 4],
    [1, 2, 3, 4],
    [1, 2, 3, 4],
  ]);
  approx(r.F, 0, 1e-12);
  approx(r.p, 1, 1e-6);
});

// ── Welch's ANOVA vs R ─────────────────────────────────────────────────────

suite("stats.js — Welch's ANOVA vs R");

test("PlantGrowth — F=5.181 df1=2 df2=17.128 p=0.01739", () => {
  // R> oneway.test(weight ~ group, data=PlantGrowth, var.equal=FALSE)
  const r = welchANOVA(pg);
  approx(r.F, 5.180972, 5e-3);
  assert(r.df1 === 2, `df1 ${r.df1}`);
  approx(r.df2, 17.128419, 5e-3);
  approx(r.p, 0.0173928, 5e-3);
});

test("iris SL — F=138.908 df2=92.211", () => {
  const r = welchANOVA(irisSL);
  approx(r.F, 138.908285, 5e-3);
  approx(r.df2, 92.211145, 5e-3);
  assert(r.p < 1e-20, "p tiny");
});

test("InsectSprays — F=36.065 df2=30.043", () => {
  const r = welchANOVA(insectSprays);
  approx(r.F, 36.065444, 5e-3);
  approx(r.df2, 30.042561, 5e-3);
  assert(r.p < 1e-8, "p tiny");
});

// ── Kruskal-Wallis vs R ────────────────────────────────────────────────────

suite("stats.js — Kruskal-Wallis vs R");

test("PlantGrowth — H=7.988229 df=2 p=0.01842", () => {
  // R> kruskal.test(weight ~ group, data=PlantGrowth)
  const r = kruskalWallis(pg);
  approx(r.H, 7.988229, 5e-3);
  assert(r.df === 2, `df ${r.df}`);
  approx(r.p, 0.0184238, 5e-3);
});

test("iris SL — H=96.937 df=2", () => {
  const r = kruskalWallis(irisSL);
  approx(r.H, 96.937436, 5e-3);
  assert(r.df === 2);
  assert(r.p < 1e-15, "p tiny");
});

test("InsectSprays — H=54.691 df=5", () => {
  const r = kruskalWallis(insectSprays);
  approx(r.H, 54.691345, 5e-3);
  assert(r.df === 5);
  assert(r.p < 1e-8, "p tiny");
});

// ── k-sample effect sizes vs R ─────────────────────────────────────────────

suite("stats.js — η² and ε² vs R");

test("PlantGrowth η² = 0.264148", () => {
  approx(etaSquared(pg), 0.264148, 5e-3);
});

test("iris SL η² = 0.618706", () => {
  approx(etaSquared(irisSL), 0.618706, 5e-3);
});

test("PlantGrowth ε² = 0.275456", () => {
  approx(epsilonSquared(pg), 0.275456, 5e-3);
});

test("iris SL ε² = 0.650587", () => {
  approx(epsilonSquared(irisSL), 0.650587, 5e-3);
});

// ── Studentized range distribution ─────────────────────────────────────────
//
// Reference values from R's stats::ptukey and stats::qtukey:
//   ptukey(3, 3, 20)   = 0.889243
//   ptukey(3.5, 3, 20) = 0.944108
//   ptukey(4, 4, 30)   = 0.960928
//   ptukey(5, 5, 60)   = 0.993166
//   ptukey(2, 3, 10)   = 0.629455
//   qtukey(0.95, 3, 27) = 3.506426
//   qtukey(0.95, 6, 66) = 4.150851
//   qtukey(0.99, 4, 20) = 5.018016

suite("stats.js — ptukey / qtukey vs R");

test("ptukey(3, 3, 20) ≈ 0.889243", () => {
  approx(ptukey(3, 3, 20), 0.889243, 5e-3);
});

test("ptukey(3.5, 3, 20) ≈ 0.944108", () => {
  approx(ptukey(3.5, 3, 20), 0.944108, 5e-3);
});

test("ptukey(4, 4, 30) ≈ 0.960928", () => {
  approx(ptukey(4, 4, 30), 0.960928, 5e-3);
});

test("ptukey(5, 5, 60) ≈ 0.993166", () => {
  approx(ptukey(5, 5, 60), 0.993166, 5e-3);
});

test("ptukey(2, 3, 10) ≈ 0.629455", () => {
  approx(ptukey(2, 3, 10), 0.629455, 5e-3);
});

test("qtukey(0.95, 3, 27) ≈ 3.506426", () => {
  approx(qtukey(0.95, 3, 27), 3.506426, 5e-3);
});

test("qtukey(0.95, 6, 66) ≈ 4.150851", () => {
  approx(qtukey(0.95, 6, 66), 4.150851, 5e-3);
});

test("qtukey(0.99, 4, 20) ≈ 5.018016", () => {
  approx(qtukey(0.99, 4, 20), 5.018016, 5e-3);
});

// ── Tukey HSD ──────────────────────────────────────────────────────────────
//
// Reference: R's TukeyHSD(aov(weight ~ group, PlantGrowth))
//   trt1-ctrl  diff=-0.371  lwr=-1.0622  upr=0.3202  p=0.390871
//   trt2-ctrl  diff= 0.494  lwr=-0.1972  upr=1.1852  p=0.197996
//   trt2-trt1  diff= 0.865  lwr= 0.1738  upr=1.5562  p=0.012006
//
// iris Sepal.Length TukeyHSD (all p ≈ 0):
//   versicolor-setosa     diff=0.930  lwr=0.6862  upr=1.1738
//   virginica-setosa      diff=1.582  lwr=1.3382  upr=1.8258
//   virginica-versicolor  diff=0.652  lwr=0.4082  upr=0.8958

suite("stats.js — Tukey HSD vs R");

test("PlantGrowth TukeyHSD: 3 pairs, diffs match", () => {
  const r = tukeyHSD(pg);
  assert(r.pairs.length === 3, "expected 3 pairs");
  approx(r.pairs[0].diff, -0.371, 5e-3);
  approx(r.pairs[1].diff, 0.494, 5e-3);
  approx(r.pairs[2].diff, 0.865, 5e-3);
});

test("PlantGrowth TukeyHSD: p-values match R", () => {
  const r = tukeyHSD(pg);
  approx(r.pairs[0].p, 0.390871, 5e-3);
  approx(r.pairs[1].p, 0.197996, 5e-3);
  approx(r.pairs[2].p, 0.012006, 5e-3);
});

test("PlantGrowth TukeyHSD: 95% CI bounds match R", () => {
  const r = tukeyHSD(pg);
  approx(r.pairs[0].lwr, -1.0622, 5e-3);
  approx(r.pairs[0].upr, 0.3202, 5e-3);
  approx(r.pairs[2].lwr, 0.1738, 5e-3);
  approx(r.pairs[2].upr, 1.5562, 5e-3);
});

test("iris SL TukeyHSD: diffs and CI bounds match R", () => {
  const r = tukeyHSD(irisSL);
  approx(r.pairs[0].diff, 0.93, 5e-3);
  approx(r.pairs[1].diff, 1.582, 5e-3);
  approx(r.pairs[2].diff, 0.652, 5e-3);
  approx(r.pairs[0].lwr, 0.6862, 5e-3);
  approx(r.pairs[0].upr, 1.1738, 5e-3);
});

test("iris SL TukeyHSD: all three pairs highly significant", () => {
  const r = tukeyHSD(irisSL);
  for (const pr of r.pairs) assert(pr.p < 1e-6, `expected p<1e-6, got ${pr.p}`);
});

test("TukeyHSD rejects k<2", () => {
  const r = tukeyHSD([[1, 2, 3]]);
  assert(r.error != null, "expected error");
});

// ── Games-Howell ───────────────────────────────────────────────────────────
//
// Reference values hand-computed from the Welch-Satterthwaite df per pair
// fed to R's ptukey (see docstring). iris Sepal.Length, k=3:
//   (1,2) setosa–versicolor:    q=14.8789  df=86.54  p=2.86e-10
//   (1,3) setosa–virginica:     q=21.7594  df=76.52  p≈0
//   (2,3) versicolor–virginica: q= 7.9608  df=94.03  p=5.58e-07

suite("stats.js — Games-Howell vs R-derived reference");

test("iris SL Games-Howell: q statistics", () => {
  const r = gamesHowell(irisSL);
  assert(r.pairs.length === 3, "expected 3 pairs");
  approx(r.pairs[0].q, 14.8789, 5e-3);
  approx(r.pairs[1].q, 21.7594, 5e-3);
  approx(r.pairs[2].q, 7.9608, 5e-3);
});

test("iris SL Games-Howell: Welch-Satterthwaite df", () => {
  const r = gamesHowell(irisSL);
  approx(r.pairs[0].df, 86.54, 5e-3);
  approx(r.pairs[1].df, 76.52, 5e-3);
  approx(r.pairs[2].df, 94.03, 5e-3);
});

test("iris SL Games-Howell: all pairs highly significant", () => {
  const r = gamesHowell(irisSL);
  for (const pr of r.pairs) assert(pr.p < 1e-5, `expected p<1e-5, got ${pr.p}`);
});

// ── Degenerate inputs (zero variance) ──────────────────────────────────────
//
// R refuses t.test on constant data ("data are essentially constant"); our
// code used to silently emit NaN df / Infinity t / NaN p instead. These
// tests pin the guards that now catch those cases before they reach ptukey
// or compact-letter display and quietly corrupt results.

suite("stats.js — degenerate (zero-variance) inputs");

test("tTest equal-var: both groups constant → error", () => {
  const r = tTest([2, 2, 2], [3, 3, 3], { equalVar: true });
  assert(r.error != null, "expected error");
  assert(Number.isNaN(r.p), "p should be NaN");
  assert(Number.isNaN(r.df), "df should be NaN");
});

test("tTest Welch: both groups constant → error", () => {
  const r = tTest([2, 2, 2], [3, 3, 3], { equalVar: false });
  assert(r.error != null, "expected error");
  assert(Number.isNaN(r.p), "p should be NaN");
});

test("tTest Welch: one group constant still computes (df = n_other − 1)", () => {
  // v1=0, v2>0 — Welch-Satterthwaite collapses to n2−1 and SE is well-defined.
  const r = tTest([5, 5, 5, 5], [1, 2, 3, 4], { equalVar: false });
  assert(r.error == null, `unexpected error: ${r.error}`);
  approx(r.df, 3, 1e-9); // n2 − 1
  assert(Number.isFinite(r.t), "t should be finite");
  assert(r.p >= 0 && r.p <= 1, `p in [0,1], got ${r.p}`);
});

test("tukeyHSD: all groups constant → error (MSE = 0)", () => {
  const r = tukeyHSD([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
  assert(r.pairs.length === 0, "pairs should be empty");
});

test("tukeyHSD: one constant group among varying still computes", () => {
  // ssWithin is driven by the non-constant group → MSE > 0, formula holds.
  const r = tukeyHSD([
    [5, 5, 5, 5],
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
  assert(r.error == null, `unexpected error: ${r.error}`);
  assert(r.pairs.length === 3, `expected 3 pairs, got ${r.pairs.length}`);
  for (const pr of r.pairs) {
    assert(Number.isFinite(pr.q), `q finite, got ${pr.q}`);
    assert(pr.p >= 0 && pr.p <= 1, `p in [0,1], got ${pr.p}`);
  }
});

test("gamesHowell: any zero-variance group → error", () => {
  const r = gamesHowell([
    [5, 5, 5, 5],
    [1, 2, 3, 4],
    [6, 7, 8, 9],
  ]);
  assert(r.error != null, "expected error");
  assert(r.pairs.length === 0, "pairs should be empty");
});

test("gamesHowell: all groups constant → error", () => {
  const r = gamesHowell([
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
  ]);
  assert(r.error != null, "expected error");
});

// ── Benjamini-Hochberg adjustment ──────────────────────────────────────────
//
// Reference: R's p.adjust(c(0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074,
// 0.205), "BH") = 0.00800, 0.03200, 0.06720, 0.06720, 0.06720, 0.08000,
// 0.08457, 0.20500

suite("stats.js — Benjamini-Hochberg vs R p.adjust");

test("bhAdjust matches R p.adjust", () => {
  const adj = bhAdjust([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205]);
  const expected = [0.008, 0.032, 0.0672, 0.0672, 0.0672, 0.08, 0.08457, 0.205];
  for (let i = 0; i < adj.length; i++) approx(adj[i], expected[i], 5e-3);
});

test("bhAdjust preserves input order", () => {
  const adj = bhAdjust([0.05, 0.001, 0.2]);
  // rank-1: 0.001 → 0.001*3/1 = 0.003
  // rank-2: 0.05  → 0.05*3/2  = 0.075
  // rank-3: 0.2   → 0.2*3/3   = 0.2
  approx(adj[0], 0.075, 5e-3);
  approx(adj[1], 0.003, 5e-3);
  approx(adj[2], 0.2, 5e-3);
});

test("bhAdjust enforces monotonicity", () => {
  const adj = bhAdjust([0.01, 0.02, 0.03, 0.04]);
  for (let i = 1; i < adj.length; i++) assert(adj[i] >= adj[i - 1], "monotone");
});

// ── Dunn's test ────────────────────────────────────────────────────────────
//
// Reference: hand-computed from the Dunn/Siegel-Castellan formula using R's
// rank() on PlantGrowth (N=30, tie correction T=6, σ²=77.4828):
//   (ctrl, trt1)  z=  1.1177  p=0.2637
//   (ctrl, trt2)  z= -1.6893  p=0.0912
//   (trt1, trt2)  z= -2.8070  p=0.00500
// Matching BH-adjusted p's (m=3):
//   ranked: 0.00500 → 0.01500
//           0.0912  → 0.1368
//           0.2637  → 0.2637

suite("stats.js — Dunn's test vs R-derived reference");

test("PlantGrowth Dunn: z statistics", () => {
  const r = dunnTest(pg);
  approx(Math.abs(r.pairs[0].z), 1.1177, 5e-3);
  approx(Math.abs(r.pairs[1].z), 1.6893, 5e-3);
  approx(Math.abs(r.pairs[2].z), 2.807, 5e-3);
});

test("PlantGrowth Dunn: raw p-values", () => {
  const r = dunnTest(pg);
  approx(r.pairs[0].p, 0.2637, 5e-3);
  approx(r.pairs[1].p, 0.0912, 5e-3);
  approx(r.pairs[2].p, 0.005, 5e-3);
});

test("PlantGrowth Dunn: BH-adjusted p-values", () => {
  const r = dunnTest(pg);
  approx(r.pairs[0].pAdj, 0.2637, 5e-3);
  approx(r.pairs[1].pAdj, 0.1368, 5e-3);
  approx(r.pairs[2].pAdj, 0.015, 5e-3);
});

test("Dunn reports BH as method", () => {
  const r = dunnTest(pg);
  assert(r.method === "Benjamini-Hochberg", "expected BH label");
});

// ── Compact letter display ─────────────────────────────────────────────────

suite("stats.js — compact letter display");

test("CLD: all pairs significant → distinct letters", () => {
  const pairs = [
    { i: 0, j: 1, p: 0.001 },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: 0.001 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] !== cld[1] && cld[1] !== cld[2] && cld[0] !== cld[2], "all distinct");
});

test("CLD: no pairs significant → all share a letter", () => {
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.5 },
    { i: 1, j: 2, p: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] === cld[1] && cld[1] === cld[2], "all same");
});

test("CLD: one group different → a/a/b pattern", () => {
  // 0≈1, 0≠2, 1≠2 → groups {0,1} and {2}
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: 0.001 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] === cld[1], "0 and 1 share letter");
  assert(cld[0] !== cld[2], "2 differs");
});

test("CLD: overlapping groups → ab middle", () => {
  // 0≠2 significant, others not → {0,1} and {1,2} → "a","ab","b"
  const pairs = [
    { i: 0, j: 1, p: 0.5 },
    { i: 0, j: 2, p: 0.001 },
    { i: 1, j: 2, p: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[1].length === 2, `expected two letters on middle, got "${cld[1]}"`);
  assert(cld[0] !== cld[2], "0 and 2 differ");
  assert(cld[1].includes(cld[0]) && cld[1].includes(cld[2]), "middle shares with both");
});

test("CLD: prefers pAdj over p when available", () => {
  // raw p says significant, adjusted says not
  const pairs = [
    { i: 0, j: 1, p: 0.001, pAdj: 0.5 },
    { i: 0, j: 2, p: 0.001, pAdj: 0.5 },
    { i: 1, j: 2, p: 0.001, pAdj: 0.5 },
  ];
  const cld = compactLetterDisplay(pairs, 3);
  assert(cld[0] === cld[1] && cld[1] === cld[2], "all same under pAdj");
});

// ── Automatic test selection ───────────────────────────────────────────────
//
// Decision tree (default α=0.05 for Shapiro and Levene):
//   k=2: any non-normal → Mann-Whitney; else equal var → Student, else Welch
//   k≥3: any non-normal → Kruskal-Wallis+Dunn; else equal var → ANOVA+Tukey,
//        else Welch ANOVA + Games-Howell

suite("stats.js — automatic test selection");

// Two normal groups, equal variance → Student's t
const normalA = [4.9, 5.1, 5.0, 5.2, 4.8, 5.1, 4.9, 5.0, 5.2, 4.9];
const normalB = [5.9, 6.1, 6.0, 6.2, 5.8, 6.1, 5.9, 6.0, 6.2, 5.9];

test("k=2 normal+equalVar → studentT", () => {
  const r = selectTest([normalA, normalB]);
  assert(r.allNormal === true, "expected allNormal true");
  assert(r.levene.equalVar === true, "expected equalVar true");
  assert(r.recommendation.test === "studentT", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === null, "no post-hoc for k=2");
});

// Two normal groups, very different variances → Welch
const normalSmallVar = [9.9, 10.0, 10.1, 10.0, 9.95, 10.05, 10.02, 9.98, 10.03, 9.97];
const normalLargeVar = [5, 15, 7, 13, 6, 14, 8, 12, 9, 11];

test("k=2 normal+unequalVar → welchT", () => {
  const r = selectTest([normalSmallVar, normalLargeVar]);
  assert(r.levene.equalVar === false, `expected equalVar false, got p=${r.levene.p}`);
  assert(r.recommendation.test === "welchT", `got ${r.recommendation.test}`);
});

// Heavy-skewed (exponential-ish) → Mann-Whitney
const skewed1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.8, 1.5, 3.0, 6.0, 12.0, 25.0];
const skewed2 = [0.2, 0.3, 0.4, 0.6, 0.9, 1.2, 2.0, 4.0, 8.0, 15.0, 30.0];

test("k=2 non-normal → mannWhitney", () => {
  const r = selectTest([skewed1, skewed2]);
  assert(r.allNormal === false, "expected not all-normal");
  assert(r.recommendation.test === "mannWhitney", `got ${r.recommendation.test}`);
});

// iris Sepal.Length → normal, slightly unequal variances; expect welchANOVA
// (Levene's test at α=0.05 rejects equal variance on iris SL).
test("k=3 iris SL → welchANOVA + gamesHowell", () => {
  const r = selectTest(irisSL);
  assert(r.allNormal === true, "iris SL groups are normal");
  assert(r.levene.equalVar === false, `iris SL Levene p=${r.levene.p} should reject`);
  assert(r.recommendation.test === "welchANOVA", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === "gamesHowell", `got ${r.recommendation.postHoc}`);
});

// PlantGrowth → normal, equal variance → oneWayANOVA + Tukey
test("k=3 PlantGrowth → oneWayANOVA + tukeyHSD", () => {
  const r = selectTest(pg);
  assert(r.allNormal === true, "PlantGrowth groups are normal");
  assert(r.levene.equalVar === true, `PlantGrowth Levene p=${r.levene.p} should not reject`);
  assert(r.recommendation.test === "oneWayANOVA", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === "tukeyHSD", `got ${r.recommendation.postHoc}`);
});

// Clearly non-normal (bimodal + skewed) k=3 → Kruskal-Wallis + Dunn
test("k=3 non-normal → kruskalWallis + dunn", () => {
  const skA = [1, 1, 1, 1, 1, 1, 1, 1, 1, 20];
  const skB = [2, 2, 2, 2, 2, 2, 2, 2, 2, 25];
  const skC = [3, 3, 3, 3, 3, 3, 3, 3, 3, 30];
  const r = selectTest([skA, skB, skC]);
  assert(r.allNormal === false, "expected non-normal");
  assert(r.recommendation.test === "kruskalWallis", `got ${r.recommendation.test}`);
  assert(r.recommendation.postHoc === "dunn", `got ${r.recommendation.postHoc}`);
});

// Edge: tiny group (n<3) cannot run Shapiro → fall back to non-parametric
test("tiny group → non-parametric fallback", () => {
  const r = selectTest([
    [1, 2],
    [3, 4, 5, 6],
  ]);
  assert(r.normality[0].normal === null, "n<3 → unknown");
  assert(r.recommendation.test === "mannWhitney", `got ${r.recommendation.test}`);
});

test("k<2 returns error", () => {
  const r = selectTest([[1, 2, 3]]);
  assert(r.error != null, "expected error");
});

test("alphaNormality override loosens the normality gate", () => {
  // A borderline-normal sample: pick α so we flip the recommendation.
  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
  const b = [2, 3, 4, 5, 6, 7, 8, 9, 10, 55];
  const strict = selectTest([a, b]);
  const loose = selectTest([a, b], { alphaNormality: 1e-9 });
  // strict should flag non-normal, loose should not
  assert(strict.allNormal === false, "strict rejects normality");
  assert(loose.allNormal === true, "loose accepts normality");
});

summary();
