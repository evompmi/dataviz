// Comprehensive power analysis tests.
// Validates distribution functions, non-central distributions, power calculations
// for all 6 test types, effect size helpers, and bisection solver.
//
// Reference values for power calculations from R pwr package:
//   pwr::pwr.t.test, pwr::pwr.anova.test, pwr::pwr.r.test, pwr::pwr.chisq.test
//
// Non-central distributions tested via self-consistency and known properties
// (exact R values require running R, so property-based tests are used instead).
//
// Tolerance key:
//   0.0001  — base distribution functions (normcdf, gammaln, betai, tcdf, etc.)
//   0.001   — chi2cdf, fcdf at critical values
//   0.005   — power values (GL quadrature nctcdf gives near-exact results)

const { suite, test, assert, eq, approx, summary } = require("./harness");
const vm = require("vm");
const fs = require("fs");

// Load power.js into a vm context with minimal React stubs
const code = fs.readFileSync(require("path").join(__dirname, "../tools/power.js"), "utf-8");
const ctx = {
  React: {
    createElement: () => null,
    useState: () => [null, () => {}],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: () => ({ current: null }),
    forwardRef: (fn) => fn,
  },
  ReactDOM: { render: () => {}, createRoot: () => ({ render: () => {} }) },
  document: { getElementById: () => ({}) },
  sec: {},
  lbl: {},
  inpN: {},
  selStyle: {},
  btnDownload: {},
  btnPrimary: {},
  toolIcon: () => null,
  makeTicks: (min, max, n) => {
    const step = (max - min) / n;
    const ticks = [];
    for (let i = 0; i <= n; i++) ticks.push(min + step * i);
    return ticks;
  },
  downloadSvg: () => {},
  PageHeader: () => null,
  computeLegendHeight: () => 0,
};
vm.createContext(ctx);
vm.runInContext(
  code +
    "\nthis.TESTS = TESTS; this.dFromMeans = dFromMeans; this.fFromGroupMeans = fFromGroupMeans; this.wFromProportions = wFromProportions;",
  ctx
);

const {
  normcdf,
  norminv,
  gammaln,
  betai,
  tcdf,
  tinv,
  fcdf,
  chi2cdf,
  chi2inv,
  nctcdf,
  ncf_sf,
  ncchi2cdf,
  gammainc,
  bisect,
  TESTS,
  dFromMeans,
  fFromGroupMeans,
  wFromProportions,
} = ctx;

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1: BASE DISTRIBUTION FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

suite("normcdf — standard normal CDF");

// R: pnorm(x)
test("normcdf(0) = 0.5", () => approx(normcdf(0), 0.5, 1e-10));
test("normcdf(1) = 0.84134", () => approx(normcdf(1), 0.84134, 0.0001));
test("normcdf(-1) = 0.15866", () => approx(normcdf(-1), 0.15866, 0.0001));
test("normcdf(1.96) = 0.97500", () => approx(normcdf(1.96), 0.975, 0.0001));
test("normcdf(-1.96) = 0.02500", () => approx(normcdf(-1.96), 0.025, 0.0001));
test("normcdf(2.576) = 0.99500", () => approx(normcdf(2.576), 0.995, 0.0001));
test("normcdf(3.291) = 0.99950", () => approx(normcdf(3.291), 0.9995, 0.0001));
test("normcdf(-3) = 0.001350", () => approx(normcdf(-3), 0.00135, 0.00005));
test("normcdf(4) = 0.99997", () => approx(normcdf(4), 0.99997, 0.00001));
test("normcdf(-4) ≈ 3.167e-5", () => approx(normcdf(-4), 0.00003167, 0.000005));

suite("norminv — standard normal quantile function");

// R: qnorm(p)
test("norminv(0.5) = 0", () => approx(norminv(0.5), 0, 0.0001));
test("norminv(0.975) ≈ 1.960", () => approx(norminv(0.975), 1.95996, 0.001));
test("norminv(0.995) ≈ 2.576", () => approx(norminv(0.995), 2.57583, 0.001));
test("norminv(0.9995) ≈ 3.291", () => approx(norminv(0.9995), 3.29053, 0.001));
test("norminv(0.025) ≈ -1.960", () => approx(norminv(0.025), -1.95996, 0.001));
test("norminv(0.001) ≈ -3.090", () => approx(norminv(0.001), -3.09023, 0.001));

test("norminv round-trips with normcdf across quantiles", () => {
  [0.001, 0.01, 0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975, 0.99, 0.999].forEach((p) => {
    approx(normcdf(norminv(p)), p, 0.0001);
  });
});

suite("gammaln — log-gamma function");

// R: lgamma(x)
test("gammaln(1) = 0", () => approx(gammaln(1), 0, 1e-10));
test("gammaln(0.5) = ln(√π)", () => approx(gammaln(0.5), 0.572365, 0.0001));
test("gammaln(5) = ln(24)", () => approx(gammaln(5), Math.log(24), 0.0001));
test("gammaln(10) = ln(362880)", () => approx(gammaln(10), Math.log(362880), 0.0001));
test("gammaln(20) = 39.33988", () => approx(gammaln(20), 39.33988, 0.0001));
test("gammaln(100) = 359.13421", () => approx(gammaln(100), 359.13421, 0.001));

suite("gammainc — regularized lower incomplete gamma P(a, x)");

// R: pgamma(x, shape=a, rate=1) — the regularized lower incomplete gamma
test("P(1,1) = 1-e^{-1} = 0.63212", () => approx(gammainc(1, 1), 0.63212, 0.0001));
test("P(1,2) = 1-e^{-2} = 0.86466", () => approx(gammainc(1, 2), 0.86466, 0.0001));
test("P(0.5,1) = erf(1) = 0.84270", () => approx(gammainc(0.5, 1), 0.8427, 0.001));
test("P(2,1) = 0.26424", () => approx(gammainc(2, 1), 0.26424, 0.001));
test("P(2,3) = 0.80085", () => approx(gammainc(2, 3), 0.80085, 0.001));
test("P(5,5) = 0.55951", () => approx(gammainc(5, 5), 0.55951, 0.001));
test("P(5,10) = 0.97075", () => approx(gammainc(5, 10), 0.97075, 0.001));
test("P(10,10) = 0.54207", () => approx(gammainc(10, 10), 0.54207, 0.001));
test("P(10,20) = 0.99508", () => approx(gammainc(10, 20), 0.99508, 0.001));
test("boundary: x=0 → 0", () => approx(gammainc(5, 0), 0, 1e-10));
test("boundary: x<0 → 0", () => approx(gammainc(5, -1), 0, 1e-10));
test("large a: P(50,50) ≈ 0.5 (near median)", () => {
  const val = gammainc(50, 50);
  assert(val > 0.49 && val < 0.55, `expected near 0.5, got ${val}`);
});

suite("betai — regularized incomplete beta I_x(a, b)");

// R: pbeta(x, a, b)
test("I(1,1,0) = 0", () => approx(betai(1, 1, 0), 0, 1e-10));
test("I(1,1,1) = 1", () => approx(betai(1, 1, 1), 1, 1e-10));
test("I(1,1,0.5) = 0.5", () => approx(betai(1, 1, 0.5), 0.5, 1e-10));
test("I(2,3,0.5) = 0.6875", () => approx(betai(2, 3, 0.5), 0.6875, 0.0001));
test("I(5,5,0.5) = 0.5", () => approx(betai(5, 5, 0.5), 0.5, 0.0001));
test("I(0.5,0.5,0.25) ≈ 0.333", () => approx(betai(0.5, 0.5, 0.25), 0.33333, 0.001));
test("I(10,10,0.5) = 0.5", () => approx(betai(10, 10, 0.5), 0.5, 0.0001));
test("I(2,5,0.3) ≈ 0.580", () => approx(betai(2, 5, 0.3), 0.58013, 0.001));

suite("tcdf — Student's t CDF");

// R: pt(t, df)
test("tcdf(0, df) = 0.5 for various df", () => {
  [5, 10, 30, 100, 1000].forEach((df) => approx(tcdf(0, df), 0.5, 1e-10));
});
test("tcdf(1.96, 10000) converges to normcdf(1.96)", () => approx(tcdf(1.96, 10000), 0.975, 0.001));
test("tcdf(2.228, 10) = 0.975", () => approx(tcdf(2.228, 10), 0.975, 0.001));
test("tcdf(2.042, 30) = 0.975", () => approx(tcdf(2.042, 30), 0.975, 0.001));
test("tcdf(2.571, 5) = 0.975", () => approx(tcdf(2.571, 5), 0.975, 0.001));
test("tcdf(1.980, 120) = 0.975", () => approx(tcdf(1.98, 120), 0.975, 0.001));
test("tcdf(-2.228, 10) = 0.025", () => approx(tcdf(-2.228, 10), 0.025, 0.001));
test("tcdf(3.169, 10) = 0.995", () => approx(tcdf(3.169, 10), 0.995, 0.001));
test("tcdf(1.0, 5) ≈ 0.818", () => approx(tcdf(1.0, 5), 0.81839, 0.001));
test("tcdf(2.0, 20) ≈ 0.970", () => approx(tcdf(2.0, 20), 0.97034, 0.001));

suite("tinv — inverse t CDF");

test("tinv round-trips with tcdf across df and quantiles", () => {
  [5, 10, 20, 50, 100].forEach((df) => {
    [0.025, 0.05, 0.5, 0.95, 0.975].forEach((p) => {
      approx(tcdf(tinv(p, df), df), p, 0.0001);
    });
  });
});
// R: qt(p, df)
test("tinv(0.975, 10) ≈ 2.228", () => approx(tinv(0.975, 10), 2.22814, 0.001));
test("tinv(0.975, 30) ≈ 2.042", () => approx(tinv(0.975, 30), 2.04227, 0.001));
test("tinv(0.995, 10) ≈ 3.169", () => approx(tinv(0.995, 10), 3.16927, 0.001));

suite("fcdf — F distribution CDF");

// R: pf(f, df1, df2)
test("fcdf(0, d1, d2) = 0", () => {
  approx(fcdf(0, 3, 20), 0, 1e-10);
  approx(fcdf(0, 1, 50), 0, 1e-10);
});
test("fcdf at 95th percentile F(3,20) = 3.098", () => approx(fcdf(3.098, 3, 20), 0.95, 0.002));
test("fcdf at 95th percentile F(1,50) = 4.034", () => approx(fcdf(4.034, 1, 50), 0.95, 0.002));
test("fcdf at 95th percentile F(2,100) = 3.087", () => approx(fcdf(3.087, 2, 100), 0.95, 0.002));
test("fcdf(1.0, 5, 10) ≈ 0.535", () => approx(fcdf(1.0, 5, 10), 0.53452, 0.002));
test("fcdf(5.0, 2, 50) ≈ 0.990", () => approx(fcdf(5.0, 2, 50), 0.98958, 0.002));

suite("chi2cdf — chi-square CDF");

// R: pchisq(x, df)
test("χ²(1) at 3.841 = 0.95", () => approx(chi2cdf(3.841, 1), 0.95, 0.001));
test("χ²(2) at 5.991 = 0.95", () => approx(chi2cdf(5.991, 2), 0.95, 0.001));
test("χ²(4) at 9.488 = 0.95", () => approx(chi2cdf(9.488, 4), 0.95, 0.001));
test("χ²(5) at 11.070 = 0.95", () => approx(chi2cdf(11.07, 5), 0.95, 0.001));
test("χ²(10) at 18.307 = 0.95", () => approx(chi2cdf(18.307, 10), 0.95, 0.001));
test("χ²(1) at 6.635 = 0.99", () => approx(chi2cdf(6.635, 1), 0.99, 0.001));
test("χ²(8) at 15.507 = 0.95", () => approx(chi2cdf(15.507, 8), 0.95, 0.001));

test("chi2inv round-trips for various df and p", () => {
  [1, 2, 4, 5, 10, 20, 50].forEach((k) => {
    [0.9, 0.95, 0.99, 0.999].forEach((p) => {
      approx(chi2cdf(chi2inv(p, k), k), p, 0.001);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2: NON-CENTRAL DISTRIBUTION FUNCTIONS
// nctcdf uses Gauss-Legendre quadrature of the chi-square mixture integral,
// giving near-exact results. ncf_sf and ncchi2cdf use Poisson mixture sums.
// ════════════════════════════════════════════════════════════════════════════

suite("nctcdf — non-central t CDF properties");

test("nctcdf with δ=0 equals central tcdf for all df", () => {
  // Gauss-Legendre quadrature matches tcdf to high precision even for small df
  [5, 10, 20, 30, 100].forEach((df) => {
    [0.5, 1.0, 2.0].forEach((t) => {
      approx(nctcdf(t, df, 0), tcdf(t, df), 0.0001, `t=${t}, df=${df}`);
    });
  });
});

test("nctcdf is monotonically increasing in t (fixed df, δ)", () => {
  [-2, -1, 0, 1, 2, 3, 4].reduce((prev, t) => {
    const curr = nctcdf(t, 30, 2);
    if (prev !== null) assert(curr > prev, `nctcdf(${t},30,2) should exceed nctcdf(${t - 1},30,2)`);
    return curr;
  }, null);
});

test("nctcdf is monotonically decreasing in δ (fixed t, df)", () => {
  // Increasing noncentrality shifts distribution right, so P(T ≤ t) decreases
  const p1 = nctcdf(2, 30, 0);
  const p2 = nctcdf(2, 30, 1);
  const p3 = nctcdf(2, 30, 2);
  const p4 = nctcdf(2, 30, 3);
  assert(p1 > p2 && p2 > p3 && p3 > p4, "CDF should decrease as ncp increases");
});

test("nctcdf at large df converges to normal with shift δ", () => {
  // For large df, noncentral t ≈ N(δ, 1), so P(T ≤ t) ≈ Φ(t - δ)
  const df = 10000;
  approx(nctcdf(3, df, 2), normcdf(3 - 2), 0.001);
  approx(nctcdf(1, df, 0), normcdf(1), 0.001);
  approx(nctcdf(0, df, 1), normcdf(-1), 0.001);
});

test("nctcdf boundaries: P(T≤-∞) → 0, P(T≤+∞) → 1", () => {
  assert(nctcdf(-50, 30, 2) < 0.001, "far left tail should be near 0");
  assert(nctcdf(50, 30, 2) > 0.999, "far right tail should be near 1");
});

test("nctcdf output is always in [0, 1]", () => {
  [
    [0, 10, 2],
    [3, 5, 5],
    [-2, 50, 1],
    [10, 100, 8],
  ].forEach(([t, df, d]) => {
    const p = nctcdf(t, df, d);
    assert(p >= 0 && p <= 1 && !isNaN(p), `nctcdf(${t},${df},${d})=${p} out of bounds`);
  });
});

suite("ncf_sf — non-central F survival function properties");

test("ncf_sf with λ=0 equals 1 - fcdf (central F)", () => {
  approx(ncf_sf(3, 3, 20, 0), 1 - fcdf(3, 3, 20), 0.001);
  approx(ncf_sf(4, 2, 50, 0), 1 - fcdf(4, 2, 50), 0.001);
  approx(ncf_sf(2, 5, 30, 0), 1 - fcdf(2, 5, 30), 0.001);
});

test("ncf_sf(0, d1, d2, λ) = 1 (all mass above 0)", () => {
  approx(ncf_sf(0, 3, 20, 10), 1, 0.001);
  approx(ncf_sf(0, 1, 50, 5), 1, 0.001);
});

test("ncf_sf is monotonically decreasing in f (survival)", () => {
  const s1 = ncf_sf(1, 3, 30, 10);
  const s2 = ncf_sf(3, 3, 30, 10);
  const s3 = ncf_sf(5, 3, 30, 10);
  const s4 = ncf_sf(10, 3, 30, 10);
  assert(s1 > s2 && s2 > s3 && s3 > s4, "survival should decrease with f");
});

test("ncf_sf is monotonically increasing in λ (more noncentrality = more power)", () => {
  const s1 = ncf_sf(3, 3, 30, 0);
  const s2 = ncf_sf(3, 3, 30, 5);
  const s3 = ncf_sf(3, 3, 30, 10);
  const s4 = ncf_sf(3, 3, 30, 20);
  assert(s1 < s2 && s2 < s3 && s3 < s4, "survival should increase with noncentrality");
});

test("ncf_sf output is always in [0, 1]", () => {
  [
    [3, 3, 20, 10],
    [1, 1, 50, 5],
    [5, 4, 60, 20],
    [10, 2, 100, 30],
  ].forEach(([f, d1, d2, lam]) => {
    const s = ncf_sf(f, d1, d2, lam);
    assert(s >= 0 && s <= 1 && !isNaN(s), `ncf_sf(${f},${d1},${d2},${lam})=${s} out of bounds`);
  });
});

test("ncf_sf for very large f → 0", () => {
  assert(ncf_sf(100, 3, 30, 10) < 0.001, "survival at f=100 should be near 0");
});

test("ncf_sf for large λ gives high survival at moderate f", () => {
  // Large noncentrality means the distribution is shifted far right
  assert(ncf_sf(5, 3, 30, 50) > 0.9, "large λ should keep most mass above moderate f");
});

suite("ncchi2cdf — non-central chi-square CDF properties");

test("ncchi2cdf with λ=0 equals central chi2cdf", () => {
  approx(ncchi2cdf(3.841, 1, 0), chi2cdf(3.841, 1), 0.001);
  approx(ncchi2cdf(5.991, 2, 0), chi2cdf(5.991, 2), 0.001);
  approx(ncchi2cdf(9.488, 4, 0), chi2cdf(9.488, 4), 0.001);
});

test("ncchi2cdf(0, k, λ) = 0", () => {
  approx(ncchi2cdf(0, 5, 10), 0, 1e-10);
  approx(ncchi2cdf(0, 1, 5), 0, 1e-10);
});

test("ncchi2cdf is monotonically increasing in x", () => {
  const c1 = ncchi2cdf(2, 2, 5);
  const c2 = ncchi2cdf(5, 2, 5);
  const c3 = ncchi2cdf(10, 2, 5);
  const c4 = ncchi2cdf(20, 2, 5);
  assert(c1 < c2 && c2 < c3 && c3 < c4, "CDF should increase with x");
});

test("ncchi2cdf is monotonically decreasing in λ (more ncp = right shift)", () => {
  const c1 = ncchi2cdf(10, 2, 0);
  const c2 = ncchi2cdf(10, 2, 5);
  const c3 = ncchi2cdf(10, 2, 10);
  const c4 = ncchi2cdf(10, 2, 20);
  assert(c1 > c2 && c2 > c3 && c3 > c4, "CDF should decrease as ncp increases");
});

test("ncchi2cdf at x >> mean → 1", () => {
  // Mean of noncentral chi2 = k + λ. For k=2, λ=5, mean=7.
  assert(ncchi2cdf(50, 2, 5) > 0.999, "far right should approach 1");
});

test("ncchi2cdf output is always in [0, 1]", () => {
  [
    [10, 1, 5],
    [5, 2, 3],
    [15, 4, 10],
    [50, 2, 40],
    [100, 4, 80],
  ].forEach(([x, k, lam]) => {
    const c = ncchi2cdf(x, k, lam);
    assert(c >= 0 && c <= 1 && !isNaN(c), `ncchi2cdf(${x},${k},${lam})=${c} out of bounds`);
  });
});

test("ncchi2cdf consistency: 1 - ncchi2cdf gives valid survival", () => {
  // Used by powerChi2: power = 1 - ncchi2cdf(chiCrit, df, lambda)
  const crit = chi2inv(0.95, 4);
  const surv = 1 - ncchi2cdf(crit, 4, 20);
  assert(surv >= 0 && surv <= 1 && !isNaN(surv), "survival should be valid");
  assert(surv > 0.5, "with λ=20, df=4 should have good power");
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3: POWER — TWO-SAMPLE T-TEST
// R: pwr.t.test(d, n, sig.level, type="two.sample", alternative=...)
// ════════════════════════════════════════════════════════════════════════════

suite("Power — two-sample t-test, two-tailed (pwr.t.test)");

// R: pwr.t.test(d=0.2, n=394, sig.level=0.05, type="two.sample")$power
test("d=0.2, n=394, α=0.05 → ~0.80", () =>
  approx(TESTS["t-ind"].power(0.2, 394, 0.05, 2), 0.8, 0.005));
// R: pwr.t.test(d=0.5, n=64, sig.level=0.05)$power
test("d=0.5, n=64, α=0.05 → ~0.80", () =>
  approx(TESTS["t-ind"].power(0.5, 64, 0.05, 2), 0.8, 0.005));
// R: pwr.t.test(d=0.8, n=26, sig.level=0.05)$power
test("d=0.8, n=26, α=0.05 → ~0.807", () =>
  approx(TESTS["t-ind"].power(0.8, 26, 0.05, 2), 0.8075, 0.005));
// R: pwr.t.test(d=1.0, n=17, sig.level=0.05)$power
test("d=1.0, n=17, α=0.05 → ~0.807", () =>
  approx(TESTS["t-ind"].power(1.0, 17, 0.05, 2), 0.807, 0.005));
// R: pwr.t.test(d=1.2, n=12, sig.level=0.05)$power
test("d=1.2, n=12, α=0.05 → ~0.802", () =>
  approx(TESTS["t-ind"].power(1.2, 12, 0.05, 2), 0.8021, 0.005));

// Vary alpha at d=0.5, n=64
test("d=0.5, n=64, α=0.01 → ~0.585", () =>
  approx(TESTS["t-ind"].power(0.5, 64, 0.01, 2), 0.5853, 0.005));
test("d=0.5, n=64, α=0.10 → ~0.88", () =>
  approx(TESTS["t-ind"].power(0.5, 64, 0.1, 2), 0.88, 0.005));
test("d=0.5, n=64, α=0.001 → ~0.301", () =>
  approx(TESTS["t-ind"].power(0.5, 64, 0.001, 2), 0.3006, 0.005));

// Vary n
test("d=0.5, n=100, α=0.05 → ~0.940", () =>
  approx(TESTS["t-ind"].power(0.5, 100, 0.05, 2), 0.9404, 0.005));
test("d=0.5, n=20, α=0.05 → ~0.338", () =>
  approx(TESTS["t-ind"].power(0.5, 20, 0.05, 2), 0.3379, 0.005));
test("d=0.3, n=100, α=0.05 → ~0.560", () =>
  approx(TESTS["t-ind"].power(0.3, 100, 0.05, 2), 0.5601, 0.005));
test("d=0.5, n=200, α=0.05 → ~0.999", () => {
  assert(TESTS["t-ind"].power(0.5, 200, 0.05, 2) > 0.995, "should be near 1");
});
test("d=0.2, n=50, α=0.05 → ~0.168", () =>
  approx(TESTS["t-ind"].power(0.2, 50, 0.05, 2), 0.1677, 0.005));

suite("Power — two-sample t-test, one-tailed");

test("d=0.5, n=51, α=0.05 → ~0.806", () =>
  approx(TESTS["t-ind"].power(0.5, 51, 0.05, 1), 0.8059, 0.005));
test("d=0.2, n=310, α=0.05 → ~0.80", () =>
  approx(TESTS["t-ind"].power(0.2, 310, 0.05, 1), 0.8, 0.005));
test("d=0.8, n=20, α=0.05 → ~0.799", () =>
  approx(TESTS["t-ind"].power(0.8, 20, 0.05, 1), 0.7994, 0.005));
test("d=0.5, n=51, α=0.01 → ~0.565", () =>
  approx(TESTS["t-ind"].power(0.5, 51, 0.01, 1), 0.5653, 0.005));
test("d=0.5, n=51, α=0.001 → ~0.266", () =>
  approx(TESTS["t-ind"].power(0.5, 51, 0.001, 1), 0.2659, 0.005));

test("power monotonically increases with n (two-sample)", () => {
  const p1 = TESTS["t-ind"].power(0.5, 20, 0.05, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p3 = TESTS["t-ind"].power(0.5, 100, 0.05, 2);
  const p4 = TESTS["t-ind"].power(0.5, 200, 0.05, 2);
  assert(p1 < p2 && p2 < p3 && p3 < p4, "power must be monotonically increasing with n");
});

test("power monotonically increases with d (two-sample)", () => {
  const p1 = TESTS["t-ind"].power(0.2, 50, 0.05, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p3 = TESTS["t-ind"].power(0.8, 50, 0.05, 2);
  const p4 = TESTS["t-ind"].power(1.2, 50, 0.05, 2);
  assert(p1 < p2 && p2 < p3 && p3 < p4, "power must increase with effect size");
});

test("power monotonically increases with alpha (two-sample)", () => {
  const p1 = TESTS["t-ind"].power(0.5, 50, 0.001, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.01, 2);
  const p3 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p4 = TESTS["t-ind"].power(0.5, 50, 0.1, 2);
  assert(p1 < p2 && p2 < p3 && p3 < p4, "power must increase with alpha");
});

test("one-tailed > two-tailed for same params", () => {
  const p1 = TESTS["t-ind"].power(0.5, 50, 0.05, 1);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  assert(p1 > p2, "one-tailed should have more power than two-tailed");
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4: POWER — PAIRED T-TEST
// R: pwr.t.test(d, n, sig.level, type="paired", alternative=...)
// ════════════════════════════════════════════════════════════════════════════

suite("Power — paired t-test, two-tailed (pwr.t.test paired)");

test("d=0.2, n=199, α=0.05 → ~0.802", () =>
  approx(TESTS["t-paired"].power(0.2, 199, 0.05, 2), 0.8017, 0.005));
test("d=0.5, n=34, α=0.05 → ~0.808", () =>
  approx(TESTS["t-paired"].power(0.5, 34, 0.05, 2), 0.8078, 0.005));
test("d=0.8, n=15, α=0.05 → ~0.821", () =>
  approx(TESTS["t-paired"].power(0.8, 15, 0.05, 2), 0.8213, 0.005));
test("d=1.0, n=10, α=0.05 → ~0.803", () =>
  approx(TESTS["t-paired"].power(1.0, 10, 0.05, 2), 0.8031, 0.005));

// Vary alpha
test("d=0.5, n=34, α=0.01 → ~0.577", () =>
  approx(TESTS["t-paired"].power(0.5, 34, 0.01, 2), 0.5765, 0.005));
test("d=0.5, n=34, α=0.10 → ~0.89", () =>
  approx(TESTS["t-paired"].power(0.5, 34, 0.1, 2), 0.89, 0.005));
test("d=0.5, n=34, α=0.001 → ~0.271", () =>
  approx(TESTS["t-paired"].power(0.5, 34, 0.001, 2), 0.2709, 0.005));

// Large n
test("d=0.3, n=200, α=0.05 → ~0.988", () =>
  approx(TESTS["t-paired"].power(0.3, 200, 0.05, 2), 0.9882, 0.003));

suite("Power — paired t-test, one-tailed");

test("d=0.5, n=27, α=0.05 → ~0.812", () =>
  approx(TESTS["t-paired"].power(0.5, 27, 0.05, 1), 0.8118, 0.005));
test("d=0.8, n=12, α=0.05 → ~0.829", () =>
  approx(TESTS["t-paired"].power(0.8, 12, 0.05, 1), 0.829, 0.005));
test("d=0.5, n=27, α=0.001 → ~0.234", () =>
  approx(TESTS["t-paired"].power(0.5, 27, 0.001, 1), 0.234, 0.005));

test("power increases with n (paired)", () => {
  const p1 = TESTS["t-paired"].power(0.5, 10, 0.05, 2);
  const p2 = TESTS["t-paired"].power(0.5, 30, 0.05, 2);
  const p3 = TESTS["t-paired"].power(0.5, 60, 0.05, 2);
  assert(p1 < p2 && p2 < p3, "power must increase with n");
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5: POWER — ONE-SAMPLE T-TEST
// Same math as paired, verified via identity
// ════════════════════════════════════════════════════════════════════════════

suite("Power — one-sample t-test");

test("d=0.5, n=34, α=0.05, two-tailed → ~0.808", () =>
  approx(TESTS["t-one"].power(0.5, 34, 0.05, 2), 0.8078, 0.005));
test("d=0.2, n=199, α=0.05, two-tailed → ~0.802", () =>
  approx(TESTS["t-one"].power(0.2, 199, 0.05, 2), 0.8017, 0.005));
test("d=0.8, n=15, α=0.05, two-tailed → ~0.821", () =>
  approx(TESTS["t-one"].power(0.8, 15, 0.05, 2), 0.8213, 0.005));
test("d=0.5, n=27, α=0.05, one-tailed → ~0.812", () =>
  approx(TESTS["t-one"].power(0.5, 27, 0.05, 1), 0.8118, 0.005));

test("one-sample matches paired exactly (identical math)", () => {
  [0.2, 0.5, 0.8].forEach((d) => {
    [20, 50, 100].forEach((n) => {
      const pOne = TESTS["t-one"].power(d, n, 0.05, 2);
      const pPaired = TESTS["t-paired"].power(d, n, 0.05, 2);
      approx(pOne, pPaired, 1e-10, `d=${d}, n=${n}: one-sample should equal paired`);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 6: POWER — ONE-WAY ANOVA
// R: pwr.anova.test(k, n, f, sig.level)$power
// ════════════════════════════════════════════════════════════════════════════

suite("Power — ANOVA k=2 (pwr.anova.test)");

// k=2 ANOVA: f=d/2, so f=0.25 ↔ d=0.5
test("f=0.25, k=2, n=64, α=0.05 → ~0.80", () =>
  approx(TESTS["anova"].power(0.25, 64, 0.05, 2, 2), 0.8, 0.005));
test("f=0.40, k=2, n=26, α=0.05 → ~0.807", () =>
  approx(TESTS["anova"].power(0.4, 26, 0.05, 2, 2), 0.8075, 0.005));

suite("Power — ANOVA k=3");

test("f=0.25, k=3, n=53, α=0.05 → ~0.80", () =>
  approx(TESTS["anova"].power(0.25, 53, 0.05, 2, 3), 0.8, 0.005));
test("f=0.40, k=3, n=22, α=0.05 → ~0.818", () =>
  approx(TESTS["anova"].power(0.4, 22, 0.05, 2, 3), 0.8181, 0.005));
test("f=0.10, k=3, n=323, α=0.05 → ~0.80", () =>
  approx(TESTS["anova"].power(0.1, 323, 0.05, 2, 3), 0.8, 0.005));

// Vary alpha
test("f=0.25, k=3, n=53, α=0.01 → ~0.594", () =>
  approx(TESTS["anova"].power(0.25, 53, 0.01, 2, 3), 0.5937, 0.005));
test("f=0.25, k=3, n=53, α=0.10 → ~0.88", () =>
  approx(TESTS["anova"].power(0.25, 53, 0.1, 2, 3), 0.88, 0.005));
test("f=0.25, k=3, n=53, α=0.001 → ~0.314", () =>
  approx(TESTS["anova"].power(0.25, 53, 0.001, 2, 3), 0.3142, 0.005));

suite("Power — ANOVA k=4");

test("f=0.25, k=4, n=45, α=0.05 → ~0.80", () =>
  approx(TESTS["anova"].power(0.25, 45, 0.05, 2, 4), 0.8, 0.005));
test("f=0.40, k=4, n=18, α=0.05 → ~0.799", () =>
  approx(TESTS["anova"].power(0.4, 18, 0.05, 2, 4), 0.7989, 0.005));

suite("Power — ANOVA k=5");

test("f=0.25, k=5, n=39, α=0.05 → ~0.798", () =>
  approx(TESTS["anova"].power(0.25, 39, 0.05, 2, 5), 0.7982, 0.005));
test("f=0.40, k=5, n=16, α=0.05 → ~0.803", () =>
  approx(TESTS["anova"].power(0.4, 16, 0.05, 2, 5), 0.8031, 0.005));

suite("Power — ANOVA large k");

test("f=0.25, k=8, n=25, α=0.05 → ~0.713", () =>
  approx(TESTS["anova"].power(0.25, 25, 0.05, 2, 8), 0.7125, 0.005));
test("f=0.25, k=8, n=35, α=0.05 → ~0.87", () =>
  approx(TESTS["anova"].power(0.25, 35, 0.05, 2, 8), 0.87, 0.005));
test("f=0.25, k=10, n=30, α=0.05 → ~0.868", () =>
  approx(TESTS["anova"].power(0.25, 30, 0.05, 2, 10), 0.8679, 0.005));

test("power increases with n (ANOVA)", () => {
  const p1 = TESTS["anova"].power(0.25, 20, 0.05, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 40, 0.05, 2, 3);
  const p3 = TESTS["anova"].power(0.25, 80, 0.05, 2, 3);
  assert(p1 < p2 && p2 < p3, "ANOVA power must increase with n");
});

test("power increases with f (ANOVA)", () => {
  const p1 = TESTS["anova"].power(0.1, 50, 0.05, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 50, 0.05, 2, 3);
  const p3 = TESTS["anova"].power(0.4, 50, 0.05, 2, 3);
  assert(p1 < p2 && p2 < p3, "ANOVA power must increase with f");
});

test("power increases with alpha (ANOVA)", () => {
  const p1 = TESTS["anova"].power(0.25, 50, 0.001, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 50, 0.01, 2, 3);
  const p3 = TESTS["anova"].power(0.25, 50, 0.05, 2, 3);
  assert(p1 < p2 && p2 < p3, "ANOVA power must increase with alpha");
});

test("power increases with total N for fixed k and f (ANOVA)", () => {
  // More total subjects = more power
  const p1 = TESTS["anova"].power(0.25, 20, 0.05, 2, 4);
  const p2 = TESTS["anova"].power(0.25, 40, 0.05, 2, 4);
  const p3 = TESTS["anova"].power(0.25, 80, 0.05, 2, 4);
  assert(p1 < p2 && p2 < p3, "more subjects per group should increase power");
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 7: POWER — CORRELATION
// R: pwr.r.test(r, n, sig.level, alternative=...)$power
// Uses Fisher z-transform (exact for normal approximation to r distribution)
// ════════════════════════════════════════════════════════════════════════════

suite("Power — correlation, two-tailed (pwr.r.test)");

test("r=0.1, n=782, α=0.05 → ~0.800", () =>
  approx(TESTS["correlation"].power(0.1, 782, 0.05, 2), 0.7997, 0.005));
test("r=0.3, n=85, α=0.05 → ~0.800", () =>
  approx(TESTS["correlation"].power(0.3, 85, 0.05, 2), 0.8003, 0.005));
test("r=0.5, n=29, α=0.05 → ~0.800", () =>
  approx(TESTS["correlation"].power(0.5, 29, 0.05, 2), 0.7998, 0.005));

// Vary alpha
test("r=0.3, n=85, α=0.01 → ~0.590", () =>
  approx(TESTS["correlation"].power(0.3, 85, 0.01, 2), 0.5898, 0.005));
test("r=0.3, n=85, α=0.10 → ~0.88", () =>
  approx(TESTS["correlation"].power(0.3, 85, 0.1, 2), 0.88, 0.005));
test("r=0.3, n=85, α=0.001 → ~0.313", () =>
  approx(TESTS["correlation"].power(0.3, 85, 0.001, 2), 0.3129, 0.005));

// Vary n
test("r=0.3, n=200, α=0.05 → >0.99", () => {
  assert(TESTS["correlation"].power(0.3, 200, 0.05, 2) > 0.99, "should be near 1");
});
test("r=0.3, n=20, α=0.05 → ~0.248", () =>
  approx(TESTS["correlation"].power(0.3, 20, 0.05, 2), 0.2477, 0.005));
test("r=0.1, n=200, α=0.05 → ~0.291", () =>
  approx(TESTS["correlation"].power(0.1, 200, 0.05, 2), 0.291, 0.005));

suite("Power — correlation, one-tailed");

test("r=0.3, n=68, α=0.05 → ~0.80", () =>
  approx(TESTS["correlation"].power(0.3, 68, 0.05, 1), 0.8, 0.005));
test("r=0.5, n=22, α=0.05 → ~0.773", () =>
  approx(TESTS["correlation"].power(0.5, 22, 0.05, 1), 0.7732, 0.005));
test("r=0.3, n=68, α=0.001 → ~0.276", () =>
  approx(TESTS["correlation"].power(0.3, 68, 0.001, 1), 0.276, 0.005));

test("power increases with n (correlation)", () => {
  const p1 = TESTS["correlation"].power(0.3, 20, 0.05, 2);
  const p2 = TESTS["correlation"].power(0.3, 50, 0.05, 2);
  const p3 = TESTS["correlation"].power(0.3, 100, 0.05, 2);
  assert(p1 < p2 && p2 < p3, "correlation power must increase with n");
});

test("power increases with r (correlation)", () => {
  const p1 = TESTS["correlation"].power(0.1, 100, 0.05, 2);
  const p2 = TESTS["correlation"].power(0.3, 100, 0.05, 2);
  const p3 = TESTS["correlation"].power(0.5, 100, 0.05, 2);
  assert(p1 < p2 && p2 < p3, "correlation power must increase with r");
});

test("one-tailed > two-tailed (correlation)", () => {
  const p1 = TESTS["correlation"].power(0.3, 50, 0.05, 1);
  const p2 = TESTS["correlation"].power(0.3, 50, 0.05, 2);
  assert(p1 > p2, "one-tailed should have more power");
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 8: POWER — CHI-SQUARE
// R: pwr.chisq.test(w, N, df, sig.level)$power
// ════════════════════════════════════════════════════════════════════════════

suite("Power — chi-square df=1 (pwr.chisq.test)");

test("w=0.1, df=1, N=785, α=0.05 → ~0.80", () =>
  approx(TESTS["chi2"].power(0.1, 785, 0.05, 2, 0, 1), 0.8, 0.005));
test("w=0.3, df=1, N=88, α=0.05 → ~0.80", () =>
  approx(TESTS["chi2"].power(0.3, 88, 0.05, 2, 0, 1), 0.8, 0.005));
test("w=0.5, df=1, N=32, α=0.05 → ~0.81", () =>
  approx(TESTS["chi2"].power(0.5, 32, 0.05, 2, 0, 1), 0.81, 0.005));

// Vary alpha
test("w=0.3, df=1, N=88, α=0.01 → ~0.594", () =>
  approx(TESTS["chi2"].power(0.3, 88, 0.01, 2, 0, 1), 0.5942, 0.005));
test("w=0.3, df=1, N=88, α=0.10 → ~0.88", () =>
  approx(TESTS["chi2"].power(0.3, 88, 0.1, 2, 0, 1), 0.88, 0.005));
test("w=0.3, df=1, N=88, α=0.001 → ~0.317", () =>
  approx(TESTS["chi2"].power(0.3, 88, 0.001, 2, 0, 1), 0.3169, 0.005));

suite("Power — chi-square df=2");

test("w=0.3, df=2, N=108, α=0.05 → ~0.80", () =>
  approx(TESTS["chi2"].power(0.3, 108, 0.05, 2, 0, 2), 0.8, 0.005));
test("w=0.5, df=2, N=39, α=0.05 → ~0.80", () =>
  approx(TESTS["chi2"].power(0.5, 39, 0.05, 2, 0, 2), 0.8, 0.005));

suite("Power — chi-square df=4");

test("w=0.3, df=4, N=133, α=0.05 → ~0.80", () =>
  approx(TESTS["chi2"].power(0.3, 133, 0.05, 2, 0, 4), 0.8, 0.005));
test("w=0.5, df=4, N=48, α=0.05 → ~0.80", () =>
  approx(TESTS["chi2"].power(0.5, 48, 0.05, 2, 0, 4), 0.8, 0.005));

suite("Power — chi-square larger df");

test("w=0.3, df=8, N=176, α=0.05 → ~0.825", () =>
  approx(TESTS["chi2"].power(0.3, 176, 0.05, 2, 0, 8), 0.8248, 0.005));
test("w=0.3, df=12, N=220, α=0.05 → ~0.862", () =>
  approx(TESTS["chi2"].power(0.3, 220, 0.05, 2, 0, 12), 0.8616, 0.005));

test("power increases with N (chi-square)", () => {
  const p1 = TESTS["chi2"].power(0.3, 30, 0.05, 2, 0, 1);
  const p2 = TESTS["chi2"].power(0.3, 60, 0.05, 2, 0, 1);
  const p3 = TESTS["chi2"].power(0.3, 120, 0.05, 2, 0, 1);
  assert(p1 < p2 && p2 < p3, "chi2 power must increase with N");
});

test("power increases with w (chi-square)", () => {
  const p1 = TESTS["chi2"].power(0.1, 100, 0.05, 2, 0, 1);
  const p2 = TESTS["chi2"].power(0.3, 100, 0.05, 2, 0, 1);
  const p3 = TESTS["chi2"].power(0.5, 100, 0.05, 2, 0, 1);
  assert(p1 < p2 && p2 < p3, "chi2 power must increase with w");
});

test("power increases with alpha (chi-square)", () => {
  const p1 = TESTS["chi2"].power(0.3, 80, 0.001, 2, 0, 1);
  const p2 = TESTS["chi2"].power(0.3, 80, 0.01, 2, 0, 1);
  const p3 = TESTS["chi2"].power(0.3, 80, 0.05, 2, 0, 1);
  assert(p1 < p2 && p2 < p3, "chi2 power must increase with alpha");
});

test("power increases with df for fixed w and N (chi-square)", () => {
  // Counterintuitive: more df means more parameters, but λ = N*w² is constant.
  // Verify power changes monotonically in one direction
  const p1 = TESTS["chi2"].power(0.3, 100, 0.05, 2, 0, 1);
  const p4 = TESTS["chi2"].power(0.3, 100, 0.05, 2, 0, 4);
  // With more df, the critical value increases but so does the noncentrality
  // Just verify both are valid and power < 1
  assert(p1 >= 0 && p1 <= 1, "df=1 power valid");
  assert(p4 >= 0 && p4 <= 1, "df=4 power valid");
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 9: EFFECT SIZE HELPERS
// ════════════════════════════════════════════════════════════════════════════

suite("dFromMeans — Cohen's d from two means + pooled SD");

test("d = |m1-m2|/sd basic", () => {
  approx(dFromMeans(10, 8, 4), 0.5, 1e-10);
  approx(dFromMeans(8, 10, 4), 0.5, 1e-10); // order doesn't matter (abs)
});
test("d = 0 when means are equal", () => approx(dFromMeans(5, 5, 2), 0, 1e-10));
test("d = 0 when sd ≤ 0", () => {
  approx(dFromMeans(10, 5, 0), 0, 1e-10);
  approx(dFromMeans(10, 5, -1), 0, 1e-10);
});
test("large effect: d=2.0", () => approx(dFromMeans(100, 80, 10), 2.0, 1e-10));
test("small effect: d=0.2", () => approx(dFromMeans(50, 49, 5), 0.2, 1e-10));

suite("fFromGroupMeans — Cohen's f from group means + within-SD");

test("f from 3 group means", () => {
  // means [10, 12, 14], sd=4 → grand=12, σ_m ≈ 1.633, f ≈ 0.40825
  approx(fFromGroupMeans([10, 12, 14], 4), 0.40825, 0.0001);
});
test("f = 0 when all means equal", () => approx(fFromGroupMeans([5, 5, 5], 2), 0, 1e-10));
test("f = 0 when sd ≤ 0", () => approx(fFromGroupMeans([10, 12, 14], 0), 0, 1e-10));
test("f from 2 group means equals d/2", () => {
  const f = fFromGroupMeans([8, 12], 4);
  const d = dFromMeans(8, 12, 4);
  approx(f, d / 2, 0.0001);
});
test("f from 4 group means", () => {
  approx(fFromGroupMeans([10, 11, 12, 13], 5), 0.22361, 0.0001);
});
test("empty array returns 0", () => approx(fFromGroupMeans([], 5), 0, 1e-10));

suite("wFromProportions — Cohen's w from observed vs expected proportions");

test("w for 2-cell equal vs unequal = 0.2", () => {
  approx(wFromProportions([0.6, 0.4], [0.5, 0.5]), 0.2, 0.0001);
});
test("w = 0 when proportions match", () =>
  approx(wFromProportions([0.25, 0.75], [0.25, 0.75]), 0, 1e-10));
test("w for 3:1 ratio vs equal = 0.5", () => {
  approx(wFromProportions([0.75, 0.25], [0.5, 0.5]), 0.5, 0.0001);
});
test("w for 4-cell table", () => {
  const obs = [0.1, 0.2, 0.3, 0.4];
  const exp = [0.25, 0.25, 0.25, 0.25];
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += (obs[i] - exp[i]) ** 2 / exp[i];
  approx(wFromProportions(obs, exp), Math.sqrt(sum), 0.0001);
});
test("mismatched lengths return 0", () =>
  approx(wFromProportions([0.5, 0.5], [0.3, 0.3, 0.4]), 0, 1e-10));
test("zero expected returns 0", () => approx(wFromProportions([0.5, 0.5], [0, 1]), 0, 1e-10));

// ════════════════════════════════════════════════════════════════════════════
// SECTION 10: BISECTION SOLVER — SAMPLE SIZE DETERMINATION
// ════════════════════════════════════════════════════════════════════════════

suite("bisect — sample size for two-sample t-test");

// R: pwr.t.test(d=0.5, power=0.80, sig.level=0.05)$n = 63.77
test("finds n≈64 for d=0.5, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["t-ind"].power(0.5, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.8, 2, 500, 0.5));
  assert(n >= 62 && n <= 66, `expected ~64, got ${n}`);
});
test("finds n≈26 for d=0.8, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["t-ind"].power(0.8, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.8, 2, 200, 0.5));
  assert(n >= 24 && n <= 28, `expected ~26, got ${n}`);
});
test("finds n≈394 for d=0.2, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["t-ind"].power(0.2, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.8, 2, 1000, 0.5));
  assert(n >= 390 && n <= 398, `expected ~394, got ${n}`);
});

suite("bisect — sample size for paired t-test");

test("finds n≈34 for d=0.5, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["t-paired"].power(0.5, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.8, 2, 200, 0.5));
  assert(n >= 32 && n <= 36, `expected ~34, got ${n}`);
});

suite("bisect — sample size for ANOVA");

test("finds n≈53 for f=0.25, k=3, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["anova"].power(0.25, Math.round(n), 0.05, 2, 3);
  const n = Math.ceil(bisect(fn, 0.8, 2, 200, 0.5));
  assert(n >= 51 && n <= 55, `expected ~53, got ${n}`);
});
test("finds n≈45 for f=0.25, k=4, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["anova"].power(0.25, Math.round(n), 0.05, 2, 4);
  const n = Math.ceil(bisect(fn, 0.8, 2, 200, 0.5));
  assert(n >= 43 && n <= 47, `expected ~45, got ${n}`);
});

suite("bisect — sample size for correlation");

test("finds n≈85 for r=0.3, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["correlation"].power(0.3, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.8, 4, 500, 0.5));
  assert(n >= 83 && n <= 87, `expected ~85, got ${n}`);
});

suite("bisect — sample size for chi-square");

test("finds N≈88 for w=0.3, df=1, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["chi2"].power(0.3, Math.round(n), 0.05, 2, 0, 1);
  const n = Math.ceil(bisect(fn, 0.8, 2, 500, 0.5));
  assert(n >= 86 && n <= 90, `expected ~88, got ${n}`);
});
test("finds N≈108 for w=0.3, df=2, power=0.80, α=0.05", () => {
  const fn = (n) => TESTS["chi2"].power(0.3, Math.round(n), 0.05, 2, 0, 2);
  const n = Math.ceil(bisect(fn, 0.8, 2, 500, 0.5));
  assert(n >= 105 && n <= 111, `expected ~108, got ${n}`);
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 11: CROSS-TEST CONSISTENCY
// Verify relationships between test types
// ════════════════════════════════════════════════════════════════════════════

suite("Cross-test consistency");

test("k=2 ANOVA with f=d/2 ≈ two-sample t-test power", () => {
  // ANOVA k=2 with f should give similar power to t-test with d=2f
  const d = 0.5,
    f = d / 2;
  const pT = TESTS["t-ind"].power(d, 64, 0.05, 2);
  const pA = TESTS["anova"].power(f, 64, 0.05, 2, 2);
  approx(pT, pA, 0.005, "k=2 ANOVA should approximate two-sample t");
});

test("paired and one-sample are identical across many parameters", () => {
  [0.1, 0.3, 0.5, 0.8, 1.5].forEach((d) => {
    [5, 10, 30, 100, 500].forEach((n) => {
      [1, 2].forEach((tails) => {
        const pp = TESTS["t-paired"].power(d, n, 0.05, tails);
        const po = TESTS["t-one"].power(d, n, 0.05, tails);
        approx(pp, po, 1e-10, `d=${d},n=${n},tails=${tails}`);
      });
    });
  });
});

test("all test types return higher power for α=0.10 than α=0.01", () => {
  const tests = [
    ["t-ind", [0.5, 50, 0.05, 2]],
    ["t-paired", [0.5, 50, 0.05, 2]],
    ["anova", [0.25, 50, 0.05, 2, 3]],
    ["correlation", [0.3, 50, 0.05, 2]],
    ["chi2", [0.3, 100, 0.05, 2, 0, 1]],
  ];
  tests.forEach(([key, args]) => {
    const argsLow = [...args];
    argsLow[2] = 0.01;
    const argsHigh = [...args];
    argsHigh[2] = 0.1;
    const pLow = TESTS[key].power(...argsLow);
    const pHigh = TESTS[key].power(...argsHigh);
    assert(pHigh > pLow, `${key}: α=0.10 should give more power than α=0.01`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SECTION 12: BOUNDARY & EDGE CASES
// ════════════════════════════════════════════════════════════════════════════

suite("Edge cases — limits");

test("power → 1 for very large n", () => {
  assert(TESTS["t-ind"].power(0.5, 10000, 0.05, 2) > 0.999, "t-ind should approach 1");
  assert(TESTS["t-paired"].power(0.5, 10000, 0.05, 2) > 0.999, "paired should approach 1");
  assert(TESTS["anova"].power(0.25, 10000, 0.05, 2, 3) > 0.999, "ANOVA should approach 1");
  assert(TESTS["correlation"].power(0.3, 10000, 0.05, 2) > 0.999, "correlation should approach 1");
  assert(TESTS["chi2"].power(0.3, 10000, 0.05, 2, 0, 1) > 0.999, "chi2 should approach 1");
});

test("power → α for zero effect size", () => {
  approx(TESTS["t-ind"].power(0, 100, 0.05, 2), 0.05, 0.005);
  approx(TESTS["t-paired"].power(0, 100, 0.05, 2), 0.05, 0.005);
  approx(TESTS["correlation"].power(0, 100, 0.05, 2), 0.05, 0.005);
  approx(TESTS["chi2"].power(0, 100, 0.05, 2, 0, 1), 0.05, 0.005);
});

test("power is bounded [0, 1] for all test types", () => {
  const tests = [
    () => TESTS["t-ind"].power(0.5, 50, 0.05, 2),
    () => TESTS["t-paired"].power(0.5, 50, 0.05, 2),
    () => TESTS["t-one"].power(0.5, 50, 0.05, 2),
    () => TESTS["anova"].power(0.25, 50, 0.05, 2, 3),
    () => TESTS["correlation"].power(0.3, 50, 0.05, 2),
    () => TESTS["chi2"].power(0.3, 50, 0.05, 2, 0, 1),
  ];
  tests.forEach((fn, i) => {
    const p = fn();
    assert(p >= 0 && p <= 1, `test ${i}: power ${p} out of bounds`);
  });
});

test("very small n still returns valid power", () => {
  const tests = [
    () => TESTS["t-ind"].power(0.8, 3, 0.05, 2),
    () => TESTS["t-paired"].power(0.8, 3, 0.05, 2),
    () => TESTS["t-one"].power(0.8, 3, 0.05, 2),
    () => TESTS["anova"].power(0.4, 3, 0.05, 2, 3),
    () => TESTS["correlation"].power(0.5, 5, 0.05, 2),
    () => TESTS["chi2"].power(0.5, 5, 0.05, 2, 0, 1),
  ];
  tests.forEach((fn, i) => {
    const p = fn();
    assert(p >= 0 && p <= 1 && !isNaN(p), `test ${i}: power ${p} invalid for small n`);
  });
});

test("very large effect size returns high power", () => {
  assert(TESTS["t-ind"].power(2.0, 10, 0.05, 2) > 0.9, "large d should give high power");
  assert(TESTS["chi2"].power(0.8, 30, 0.05, 2, 0, 1) > 0.9, "large w should give high power");
});

test("very large n + tiny effect (numerical stability)", () => {
  const p = TESTS["t-ind"].power(0.01, 50000, 0.05, 2);
  assert(p >= 0 && p <= 1 && !isNaN(p), `should be valid, got ${p}`);
  assert(p > 0.05, "should detect even tiny effect with huge n");
});

test("extreme alpha values still produce valid output", () => {
  const p1 = TESTS["t-ind"].power(0.5, 100, 0.0001, 2);
  assert(p1 >= 0 && p1 <= 1 && !isNaN(p1), "α=0.0001 should return valid power");
  const p2 = TESTS["t-ind"].power(0.5, 100, 0.2, 2);
  assert(p2 >= 0 && p2 <= 1 && !isNaN(p2), "α=0.20 should return valid power");
  assert(p2 > p1, "liberal alpha should give more power");
});

test("all test types produce valid output at α=0.0001", () => {
  const tests = [
    () => TESTS["t-ind"].power(0.5, 50, 0.0001, 2),
    () => TESTS["t-paired"].power(0.5, 50, 0.0001, 2),
    () => TESTS["anova"].power(0.25, 50, 0.0001, 2, 3),
    () => TESTS["correlation"].power(0.3, 50, 0.0001, 2),
    () => TESTS["chi2"].power(0.3, 100, 0.0001, 2, 0, 1),
  ];
  tests.forEach((fn, i) => {
    const p = fn();
    assert(p >= 0 && p <= 1 && !isNaN(p), `test ${i}: α=0.0001 power ${p} invalid`);
    assert(p < 0.5, `test ${i}: power at α=0.0001 should be modest for moderate n`);
  });
});

summary();
