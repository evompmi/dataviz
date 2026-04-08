// Comprehensive power analysis tests.
// Validates distribution functions, power calculations for all 6 test types
// across multiple α, tails, effect sizes, sample sizes, and effect size helpers.
// Reference values from R pwr package and standard statistical tables.

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
  sec: {}, lbl: {}, inpN: {}, selStyle: {}, btnDownload: {}, btnPrimary: {},
  toolIcon: () => null, makeTicks: (min, max, n) => {
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
vm.runInContext(code + "\nthis.TESTS = TESTS; this.dFromMeans = dFromMeans; this.fFromGroupMeans = fFromGroupMeans; this.wFromProportions = wFromProportions;", ctx);

const { normcdf, norminv, gammaln, betai, tcdf, tinv, fcdf, chi2cdf, chi2inv,
        nctcdf, ncf_sf, ncchi2cdf, gammainc, bisect, TESTS,
        dFromMeans, fFromGroupMeans, wFromProportions } = ctx;

// ════════════════════════════════════════════════════════════════════════════
// DISTRIBUTION FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

suite("normcdf");

test("normcdf(0) = 0.5", () => approx(normcdf(0), 0.5));
test("normcdf(1) ≈ 0.8413", () => approx(normcdf(1), 0.8413, 0.001));
test("normcdf(-1) ≈ 0.1587", () => approx(normcdf(-1), 0.1587, 0.001));
test("normcdf(1.96) ≈ 0.975", () => approx(normcdf(1.96), 0.975, 0.001));
test("normcdf(-1.96) ≈ 0.025", () => approx(normcdf(-1.96), 0.025, 0.001));
test("normcdf(2.576) ≈ 0.995", () => approx(normcdf(2.576), 0.995, 0.001));
test("normcdf(3.291) ≈ 0.9995", () => approx(normcdf(3.291), 0.9995, 0.001));
test("normcdf(-3) ≈ 0.00135", () => approx(normcdf(-3), 0.00135, 0.0005));

suite("norminv");

test("norminv round-trips with normcdf", () => {
  [0.001, 0.01, 0.025, 0.05, 0.1, 0.5, 0.9, 0.95, 0.975, 0.99, 0.999].forEach(p => {
    approx(normcdf(norminv(p)), p, 0.0001);
  });
});
test("norminv(0.975) ≈ 1.96", () => approx(norminv(0.975), 1.96, 0.001));
test("norminv(0.995) ≈ 2.576", () => approx(norminv(0.995), 2.576, 0.001));
test("norminv(0.5) = 0", () => approx(norminv(0.5), 0, 0.0001));

suite("gammaln");

test("gammaln(1) = 0", () => approx(gammaln(1), 0, 0.0001));
test("gammaln(5) = ln(24)", () => approx(gammaln(5), Math.log(24), 0.0001));
test("gammaln(0.5) = ln(√π)", () => approx(gammaln(0.5), Math.log(Math.sqrt(Math.PI)), 0.0001));
test("gammaln(10) = ln(362880)", () => approx(gammaln(10), Math.log(362880), 0.0001));

suite("betai");

test("betai boundary values", () => {
  approx(betai(1, 1, 0), 0);
  approx(betai(1, 1, 1), 1);
  approx(betai(1, 1, 0.5), 0.5);
});
test("betai(2, 3, 0.5) = 0.6875", () => approx(betai(2, 3, 0.5), 0.6875, 0.001));
test("betai(5, 5, 0.5) = 0.5", () => approx(betai(5, 5, 0.5), 0.5, 0.001));

suite("tcdf");

test("tcdf(0, df) = 0.5 for various df", () => {
  [5, 10, 30, 100, 1000].forEach(df => approx(tcdf(0, df), 0.5));
});
test("tcdf converges to normcdf for large df", () => {
  approx(tcdf(1.96, 10000), normcdf(1.96), 0.001);
  approx(tcdf(-2.576, 10000), normcdf(-2.576), 0.001);
});
test("tcdf known critical values", () => {
  // t(10): P(T ≤ 2.228) ≈ 0.975
  approx(tcdf(2.228, 10), 0.975, 0.002);
  // t(30): P(T ≤ 2.042) ≈ 0.975
  approx(tcdf(2.042, 30), 0.975, 0.002);
  // t(5): P(T ≤ 2.571) ≈ 0.975
  approx(tcdf(2.571, 5), 0.975, 0.002);
  // t(120): P(T ≤ 1.980) ≈ 0.975
  approx(tcdf(1.980, 120), 0.975, 0.002);
});

suite("tinv");

test("tinv round-trips with tcdf", () => {
  [5, 10, 20, 50, 100].forEach(df => {
    [0.025, 0.05, 0.5, 0.95, 0.975].forEach(p => {
      approx(tcdf(tinv(p, df), df), p, 0.001);
    });
  });
});

suite("fcdf");

test("fcdf(0, d1, d2) = 0", () => {
  approx(fcdf(0, 3, 20), 0);
  approx(fcdf(0, 1, 50), 0);
});
test("fcdf known critical values", () => {
  // F(3, 20) at 0.95 → 3.098
  approx(fcdf(3.098, 3, 20), 0.95, 0.01);
  // F(1, 50) at 0.95 → 4.034
  approx(fcdf(4.034, 1, 50), 0.95, 0.01);
  // F(2, 100) at 0.95 → 3.087
  approx(fcdf(3.087, 2, 100), 0.95, 0.01);
});

suite("chi2cdf");

test("chi2cdf known critical values", () => {
  // χ²(1) at 0.95 → 3.841
  approx(chi2cdf(3.841, 1), 0.95, 0.01);
  // χ²(5) at 0.95 → 11.07
  approx(chi2cdf(11.07, 5), 0.95, 0.01);
  // χ²(10) at 0.95 → 18.307
  approx(chi2cdf(18.307, 10), 0.95, 0.01);
  // χ²(1) at 0.99 → 6.635
  approx(chi2cdf(6.635, 1), 0.99, 0.01);
  // χ²(2) at 0.95 → 5.991
  approx(chi2cdf(5.991, 2), 0.95, 0.01);
  // χ²(4) at 0.95 → 9.488
  approx(chi2cdf(9.488, 4), 0.95, 0.01);
});

test("chi2inv round-trips for various df", () => {
  [1, 2, 4, 5, 10, 20].forEach(k => {
    [0.90, 0.95, 0.99].forEach(p => {
      approx(chi2cdf(chi2inv(p, k), k), p, 0.001);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POWER: TWO-SAMPLE T-TEST (pwr.t.test, type="two.sample")
// ════════════════════════════════════════════════════════════════════════════

suite("Power — two-sample t-test, two-tailed");

// Reference: pwr.t.test(d, n, sig.level, type="two.sample", alternative="two.sided")
test("d=0.2, n=394, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(0.2, 394, 0.05, 2), 0.80, 0.03);
});
test("d=0.5, n=64, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(0.5, 64, 0.05, 2), 0.80, 0.03);
});
test("d=0.8, n=26, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(0.8, 26, 0.05, 2), 0.80, 0.04);
});
test("d=1.0, n=17, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(1.0, 17, 0.05, 2), 0.80, 0.05);
});
test("d=1.2, n=12, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(1.2, 12, 0.05, 2), 0.80, 0.06);
});

test("d=0.5, n=64, α=0.01 → power≈0.59", () => {
  approx(TESTS["t-ind"].power(0.5, 64, 0.01, 2), 0.59, 0.04);
});
test("d=0.5, n=64, α=0.10 → power≈0.88", () => {
  approx(TESTS["t-ind"].power(0.5, 64, 0.10, 2), 0.88, 0.03);
});
test("d=0.5, n=64, α=0.001 → power≈0.30", () => {
  approx(TESTS["t-ind"].power(0.5, 64, 0.001, 2), 0.30, 0.04);
});

test("d=0.5, n=100, α=0.05 → power≈0.94", () => {
  approx(TESTS["t-ind"].power(0.5, 100, 0.05, 2), 0.94, 0.03);
});
test("d=0.5, n=20, α=0.05 → power≈0.34", () => {
  approx(TESTS["t-ind"].power(0.5, 20, 0.05, 2), 0.34, 0.04);
});
test("d=0.3, n=100, α=0.05 → power≈0.58", () => {
  approx(TESTS["t-ind"].power(0.3, 100, 0.05, 2), 0.58, 0.04);
});

suite("Power — two-sample t-test, one-tailed");

// Reference: pwr.t.test(d, n, sig.level, type="two.sample", alternative="greater")
test("d=0.5, n=51, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(0.5, 51, 0.05, 1), 0.80, 0.03);
});
test("d=0.2, n=310, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(0.2, 310, 0.05, 1), 0.80, 0.03);
});
test("d=0.8, n=20, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-ind"].power(0.8, 20, 0.05, 1), 0.80, 0.05);
});
test("d=0.5, n=51, α=0.01 → power≈0.60", () => {
  approx(TESTS["t-ind"].power(0.5, 51, 0.01, 1), 0.60, 0.05);
});

test("power increases with n (two-sample)", () => {
  const p1 = TESTS["t-ind"].power(0.5, 20, 0.05, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p3 = TESTS["t-ind"].power(0.5, 100, 0.05, 2);
  const p4 = TESTS["t-ind"].power(0.5, 200, 0.05, 2);
  assert(p1 < p2 && p2 < p3 && p3 < p4, "power must be monotonically increasing with n");
});

test("power increases with effect size (two-sample)", () => {
  const p1 = TESTS["t-ind"].power(0.2, 50, 0.05, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p3 = TESTS["t-ind"].power(0.8, 50, 0.05, 2);
  const p4 = TESTS["t-ind"].power(1.2, 50, 0.05, 2);
  assert(p1 < p2 && p2 < p3 && p3 < p4, "power must increase with effect size");
});

test("power increases with alpha (two-sample)", () => {
  const p1 = TESTS["t-ind"].power(0.5, 50, 0.001, 2);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.01, 2);
  const p3 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  const p4 = TESTS["t-ind"].power(0.5, 50, 0.10, 2);
  assert(p1 < p2 && p2 < p3 && p3 < p4, "power must increase with alpha");
});

test("one-tailed > two-tailed for same params", () => {
  const p1 = TESTS["t-ind"].power(0.5, 50, 0.05, 1);
  const p2 = TESTS["t-ind"].power(0.5, 50, 0.05, 2);
  assert(p1 > p2, "one-tailed should have more power than two-tailed");
});

// ════════════════════════════════════════════════════════════════════════════
// POWER: PAIRED T-TEST (pwr.t.test, type="paired")
// ════════════════════════════════════════════════════════════════════════════

suite("Power — paired t-test, two-tailed");

// Reference: pwr.t.test(d, n, sig.level, type="paired", alternative="two.sided")
test("d=0.2, n=199, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-paired"].power(0.2, 199, 0.05, 2), 0.80, 0.03);
});
test("d=0.5, n=34, α=0.05 → power≈0.81", () => {
  approx(TESTS["t-paired"].power(0.5, 34, 0.05, 2), 0.81, 0.04);
});
test("d=0.8, n=15, α=0.05 → power≈0.82", () => {
  approx(TESTS["t-paired"].power(0.8, 15, 0.05, 2), 0.82, 0.05);
});
test("d=1.0, n=10, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-paired"].power(1.0, 10, 0.05, 2), 0.80, 0.06);
});

test("d=0.5, n=34, α=0.01 → power≈0.59", () => {
  approx(TESTS["t-paired"].power(0.5, 34, 0.01, 2), 0.59, 0.05);
});
test("d=0.5, n=34, α=0.10 → power≈0.88", () => {
  approx(TESTS["t-paired"].power(0.5, 34, 0.10, 2), 0.88, 0.04);
});

suite("Power — paired t-test, one-tailed");

test("d=0.5, n=27, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-paired"].power(0.5, 27, 0.05, 1), 0.80, 0.04);
});
test("d=0.8, n=12, α=0.05 → power≈0.80", () => {
  approx(TESTS["t-paired"].power(0.8, 12, 0.05, 1), 0.80, 0.06);
});

test("power increases with n (paired)", () => {
  const p1 = TESTS["t-paired"].power(0.5, 10, 0.05, 2);
  const p2 = TESTS["t-paired"].power(0.5, 30, 0.05, 2);
  const p3 = TESTS["t-paired"].power(0.5, 60, 0.05, 2);
  assert(p1 < p2 && p2 < p3, "power must increase with n");
});

// ════════════════════════════════════════════════════════════════════════════
// POWER: ONE-SAMPLE T-TEST (pwr.t.test, type="one.sample")
// ════════════════════════════════════════════════════════════════════════════

suite("Power — one-sample t-test");

// One-sample uses same math as paired
test("d=0.5, n=34, α=0.05, two-tailed → power≈0.81", () => {
  approx(TESTS["t-one"].power(0.5, 34, 0.05, 2), 0.81, 0.04);
});
test("d=0.2, n=199, α=0.05, two-tailed → power≈0.80", () => {
  approx(TESTS["t-one"].power(0.2, 199, 0.05, 2), 0.80, 0.03);
});
test("d=0.8, n=15, α=0.05, two-tailed → power≈0.82", () => {
  approx(TESTS["t-one"].power(0.8, 15, 0.05, 2), 0.82, 0.05);
});
test("d=0.5, n=27, α=0.05, one-tailed → power≈0.80", () => {
  approx(TESTS["t-one"].power(0.5, 27, 0.05, 1), 0.80, 0.04);
});

test("one-sample matches paired (identical math)", () => {
  [0.2, 0.5, 0.8].forEach(d => {
    [20, 50, 100].forEach(n => {
      const pOne = TESTS["t-one"].power(d, n, 0.05, 2);
      const pPaired = TESTS["t-paired"].power(d, n, 0.05, 2);
      approx(pOne, pPaired, 1e-10, `d=${d}, n=${n}: one-sample should equal paired`);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// POWER: ONE-WAY ANOVA (pwr.anova.test)
// ════════════════════════════════════════════════════════════════════════════

suite("Power — one-way ANOVA, k=2 groups");

// k=2 ANOVA is related to t-test: f=d/2, so f=0.25 ↔ d=0.5
test("f=0.25, k=2, n=64, α=0.05 → power≈0.80", () => {
  approx(TESTS["anova"].power(0.25, 64, 0.05, 2, 2), 0.80, 0.04);
});
test("f=0.40, k=2, n=26, α=0.05 → power≈0.80", () => {
  approx(TESTS["anova"].power(0.40, 26, 0.05, 2, 2), 0.80, 0.05);
});

suite("Power — one-way ANOVA, k=3 groups");

// Reference: pwr.anova.test(k=3, f, sig.level, n)
test("f=0.10, k=3, n=323, α=0.05 → power≈0.80", () => {
  approx(TESTS["anova"].power(0.10, 323, 0.05, 2, 3), 0.80, 0.04);
});
test("f=0.25, k=3, n=53, α=0.05 → power≈0.80", () => {
  approx(TESTS["anova"].power(0.25, 53, 0.05, 2, 3), 0.80, 0.05);
});
test("f=0.40, k=3, n=22, α=0.05 → power≈0.80", () => {
  approx(TESTS["anova"].power(0.40, 22, 0.05, 2, 3), 0.80, 0.05);
});

test("f=0.25, k=3, n=53, α=0.01 → power≈0.59", () => {
  approx(TESTS["anova"].power(0.25, 53, 0.01, 2, 3), 0.59, 0.05);
});
test("f=0.25, k=3, n=53, α=0.10 → power≈0.88", () => {
  approx(TESTS["anova"].power(0.25, 53, 0.10, 2, 3), 0.88, 0.04);
});

suite("Power — one-way ANOVA, k=4 groups");

test("f=0.25, k=4, n=45, α=0.05 → power≈0.80", () => {
  approx(TESTS["anova"].power(0.25, 45, 0.05, 2, 4), 0.80, 0.05);
});
test("f=0.40, k=4, n=18, α=0.05 → power≈0.79", () => {
  approx(TESTS["anova"].power(0.40, 18, 0.05, 2, 4), 0.79, 0.05);
});

suite("Power — one-way ANOVA, k=5 groups");

test("f=0.25, k=5, n=39, α=0.05 → power≈0.78", () => {
  approx(TESTS["anova"].power(0.25, 39, 0.05, 2, 5), 0.78, 0.05);
});
test("f=0.40, k=5, n=16, α=0.05 → power≈0.79", () => {
  approx(TESTS["anova"].power(0.40, 16, 0.05, 2, 5), 0.79, 0.06);
});

test("power increases with n (ANOVA)", () => {
  const p1 = TESTS["anova"].power(0.25, 20, 0.05, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 40, 0.05, 2, 3);
  const p3 = TESTS["anova"].power(0.25, 80, 0.05, 2, 3);
  assert(p1 < p2 && p2 < p3, "ANOVA power must increase with n");
});

test("power increases with f (ANOVA)", () => {
  const p1 = TESTS["anova"].power(0.10, 50, 0.05, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 50, 0.05, 2, 3);
  const p3 = TESTS["anova"].power(0.40, 50, 0.05, 2, 3);
  assert(p1 < p2 && p2 < p3, "ANOVA power must increase with f");
});

test("power increases with alpha (ANOVA)", () => {
  const p1 = TESTS["anova"].power(0.25, 50, 0.001, 2, 3);
  const p2 = TESTS["anova"].power(0.25, 50, 0.01, 2, 3);
  const p3 = TESTS["anova"].power(0.25, 50, 0.05, 2, 3);
  assert(p1 < p2 && p2 < p3, "ANOVA power must increase with alpha");
});

// ════════════════════════════════════════════════════════════════════════════
// POWER: CORRELATION (pwr.r.test)
// ════════════════════════════════════════════════════════════════════════════

suite("Power — correlation, two-tailed");

// Reference: pwr.r.test(r, n, sig.level, alternative="two.sided")
test("r=0.1, n=782, α=0.05 → power≈0.80", () => {
  approx(TESTS["correlation"].power(0.1, 782, 0.05, 2), 0.80, 0.03);
});
test("r=0.3, n=85, α=0.05 → power≈0.80", () => {
  approx(TESTS["correlation"].power(0.3, 85, 0.05, 2), 0.80, 0.03);
});
test("r=0.5, n=29, α=0.05 → power≈0.79", () => {
  approx(TESTS["correlation"].power(0.5, 29, 0.05, 2), 0.79, 0.04);
});

test("r=0.3, n=85, α=0.01 → power≈0.57", () => {
  approx(TESTS["correlation"].power(0.3, 85, 0.01, 2), 0.57, 0.04);
});
test("r=0.3, n=85, α=0.10 → power≈0.87", () => {
  approx(TESTS["correlation"].power(0.3, 85, 0.10, 2), 0.87, 0.03);
});
test("r=0.3, n=85, α=0.001 → power≈0.33", () => {
  approx(TESTS["correlation"].power(0.3, 85, 0.001, 2), 0.33, 0.05);
});

test("r=0.3, n=200, α=0.05 → power≈0.99", () => {
  const pw = TESTS["correlation"].power(0.3, 200, 0.05, 2);
  assert(pw > 0.96, `expected >0.96, got ${pw}`);
});
test("r=0.3, n=20, α=0.05 → power≈0.25", () => {
  approx(TESTS["correlation"].power(0.3, 20, 0.05, 2), 0.25, 0.05);
});

suite("Power — correlation, one-tailed");

test("r=0.3, n=68, α=0.05 → power≈0.80", () => {
  approx(TESTS["correlation"].power(0.3, 68, 0.05, 1), 0.80, 0.04);
});
test("r=0.5, n=22, α=0.05 → power≈0.79", () => {
  approx(TESTS["correlation"].power(0.5, 22, 0.05, 1), 0.79, 0.05);
});

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
// POWER: CHI-SQUARE (pwr.chisq.test)
// ════════════════════════════════════════════════════════════════════════════

suite("Power — chi-square, df=1");

// Reference: pwr.chisq.test(w, N, df, sig.level)
test("w=0.1, df=1, N=785, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.1, 785, 0.05, 2, 0, 1), 0.80, 0.03);
});
test("w=0.3, df=1, N=88, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.3, 88, 0.05, 2, 0, 1), 0.80, 0.05);
});
test("w=0.5, df=1, N=32, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.5, 32, 0.05, 2, 0, 1), 0.80, 0.05);
});

test("w=0.3, df=1, N=88, α=0.01 → power≈0.56", () => {
  approx(TESTS["chi2"].power(0.3, 88, 0.01, 2, 0, 1), 0.56, 0.05);
});
test("w=0.3, df=1, N=88, α=0.10 → power≈0.87", () => {
  approx(TESTS["chi2"].power(0.3, 88, 0.10, 2, 0, 1), 0.87, 0.04);
});
test("w=0.3, df=1, N=88, α=0.001 → power≈0.31", () => {
  approx(TESTS["chi2"].power(0.3, 88, 0.001, 2, 0, 1), 0.31, 0.06);
});

suite("Power — chi-square, df=2");

test("w=0.3, df=2, N=108, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.3, 108, 0.05, 2, 0, 2), 0.80, 0.05);
});
test("w=0.5, df=2, N=39, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.5, 39, 0.05, 2, 0, 2), 0.80, 0.05);
});

suite("Power — chi-square, df=4");

test("w=0.3, df=4, N=133, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.3, 133, 0.05, 2, 0, 4), 0.80, 0.05);
});
test("w=0.5, df=4, N=48, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.5, 48, 0.05, 2, 0, 4), 0.80, 0.06);
});

suite("Power — chi-square, large df");

test("w=0.3, df=8, N=176, α=0.05 → power≈0.80", () => {
  approx(TESTS["chi2"].power(0.3, 176, 0.05, 2, 0, 8), 0.80, 0.05);
});

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

// ════════════════════════════════════════════════════════════════════════════
// EFFECT SIZE HELPERS
// ════════════════════════════════════════════════════════════════════════════

suite("dFromMeans — Cohen's d from two means + pooled SD");

test("d = |m1-m2|/sd basic", () => {
  approx(dFromMeans(10, 8, 4), 0.5);
  approx(dFromMeans(8, 10, 4), 0.5); // order doesn't matter (abs)
});
test("d = 0 when means are equal", () => {
  approx(dFromMeans(5, 5, 2), 0);
});
test("d = 0 when sd ≤ 0", () => {
  approx(dFromMeans(10, 5, 0), 0);
  approx(dFromMeans(10, 5, -1), 0);
});
test("large effect: d=2.0", () => {
  approx(dFromMeans(100, 80, 10), 2.0);
});
test("small effect: d=0.2", () => {
  approx(dFromMeans(50, 49, 5), 0.2);
});

suite("fFromGroupMeans — Cohen's f from group means + within-SD");

test("f from 3 group means", () => {
  // means [10, 12, 14], sd=4 → grand=12, σ_m = √((4+0+4)/3) = √(8/3) ≈ 1.633
  // f = 1.633/4 ≈ 0.4082
  approx(fFromGroupMeans([10, 12, 14], 4), 0.4082, 0.001);
});
test("f = 0 when all means equal", () => {
  approx(fFromGroupMeans([5, 5, 5], 2), 0);
});
test("f = 0 when sd ≤ 0", () => {
  approx(fFromGroupMeans([10, 12, 14], 0), 0);
});
test("f from 2 group means equals d/2", () => {
  // With k=2: f = d/2. means [8,12], sd=4 → d=1.0, f=0.5
  const f = fFromGroupMeans([8, 12], 4);
  const d = dFromMeans(8, 12, 4);
  approx(f, d / 2, 0.001);
});
test("f from 4 group means", () => {
  // means [10,11,12,13], sd=5 → grand=11.5
  // σ_m = √((2.25+0.25+0.25+2.25)/4) = √(5/4) = √1.25 ≈ 1.118
  // f ≈ 1.118/5 ≈ 0.2236
  approx(fFromGroupMeans([10, 11, 12, 13], 5), 0.2236, 0.001);
});
test("empty array returns 0", () => {
  approx(fFromGroupMeans([], 5), 0);
});

suite("wFromProportions — Cohen's w from observed vs expected proportions");

test("w for 2-cell equal vs unequal", () => {
  // Expected [0.5, 0.5], observed [0.6, 0.4]
  // w = √((0.1²/0.5) + (0.1²/0.5)) = √(0.02+0.02) = √0.04 = 0.2
  approx(wFromProportions([0.6, 0.4], [0.5, 0.5]), 0.2, 0.001);
});
test("w = 0 when proportions match", () => {
  approx(wFromProportions([0.25, 0.75], [0.25, 0.75]), 0, 0.001);
});
test("w for 3:1 ratio vs equal", () => {
  // Expected [0.5, 0.5], observed [0.75, 0.25]
  // w = √((0.25²/0.5) + (0.25²/0.5)) = √(0.125+0.125) = √0.25 = 0.5
  approx(wFromProportions([0.75, 0.25], [0.5, 0.5]), 0.5, 0.001);
});
test("w for 4-cell table", () => {
  // observed [0.1, 0.2, 0.3, 0.4], expected [0.25, 0.25, 0.25, 0.25]
  const obs = [0.1, 0.2, 0.3, 0.4];
  const exp = [0.25, 0.25, 0.25, 0.25];
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += (obs[i] - exp[i]) ** 2 / exp[i];
  approx(wFromProportions(obs, exp), Math.sqrt(sum), 0.001);
});
test("mismatched lengths return 0", () => {
  approx(wFromProportions([0.5, 0.5], [0.3, 0.3, 0.4]), 0);
});
test("zero expected returns 0", () => {
  approx(wFromProportions([0.5, 0.5], [0, 1]), 0);
});

// ════════════════════════════════════════════════════════════════════════════
// BISECTION SOLVER — SAMPLE SIZE DETERMINATION
// ════════════════════════════════════════════════════════════════════════════

suite("bisect — sample size for two-sample t-test");

test("finds n≈64 for d=0.5, power=0.80, α=0.05", () => {
  const fn = n => TESTS["t-ind"].power(0.5, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.80, 2, 500, 0.5));
  assert(n >= 60 && n <= 68, `expected ~64, got ${n}`);
});
test("finds n≈26 for d=0.8, power=0.80, α=0.05", () => {
  const fn = n => TESTS["t-ind"].power(0.8, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.80, 2, 200, 0.5));
  assert(n >= 23 && n <= 29, `expected ~26, got ${n}`);
});
test("finds n≈394 for d=0.2, power=0.80, α=0.05", () => {
  const fn = n => TESTS["t-ind"].power(0.2, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.80, 2, 1000, 0.5));
  assert(n >= 385 && n <= 400, `expected ~394, got ${n}`);
});

suite("bisect — sample size for paired t-test");

test("finds n≈34 for d=0.5, power=0.80, α=0.05", () => {
  const fn = n => TESTS["t-paired"].power(0.5, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.80, 2, 200, 0.5));
  assert(n >= 31 && n <= 37, `expected ~34, got ${n}`);
});

suite("bisect — sample size for ANOVA");

test("finds n≈53 for f=0.25, k=3, power=0.80, α=0.05", () => {
  const fn = n => TESTS["anova"].power(0.25, Math.round(n), 0.05, 2, 3);
  const n = Math.ceil(bisect(fn, 0.80, 2, 200, 0.5));
  assert(n >= 49 && n <= 57, `expected ~53, got ${n}`);
});
test("finds n≈45 for f=0.25, k=4, power=0.80, α=0.05", () => {
  const fn = n => TESTS["anova"].power(0.25, Math.round(n), 0.05, 2, 4);
  const n = Math.ceil(bisect(fn, 0.80, 2, 200, 0.5));
  assert(n >= 41 && n <= 49, `expected ~45, got ${n}`);
});

suite("bisect — sample size for correlation");

test("finds n≈85 for r=0.3, power=0.80, α=0.05", () => {
  const fn = n => TESTS["correlation"].power(0.3, Math.round(n), 0.05, 2);
  const n = Math.ceil(bisect(fn, 0.80, 4, 500, 0.5));
  assert(n >= 80 && n <= 90, `expected ~85, got ${n}`);
});

suite("bisect — sample size for chi-square");

test("finds N≈88 for w=0.3, df=1, power=0.80, α=0.05", () => {
  const fn = n => TESTS["chi2"].power(0.3, Math.round(n), 0.05, 2, 0, 1);
  const n = Math.ceil(bisect(fn, 0.80, 2, 500, 0.5));
  assert(n >= 83 && n <= 93, `expected ~88, got ${n}`);
});
test("finds N≈108 for w=0.3, df=2, power=0.80, α=0.05", () => {
  const fn = n => TESTS["chi2"].power(0.3, Math.round(n), 0.05, 2, 0, 2);
  const n = Math.ceil(bisect(fn, 0.80, 2, 500, 0.5));
  assert(n >= 103 && n <= 115, `expected ~108, got ${n}`);
});

// ════════════════════════════════════════════════════════════════════════════
// BOUNDARY & EDGE CASES
// ════════════════════════════════════════════════════════════════════════════

suite("Edge cases");

test("power → 1 for very large n", () => {
  assert(TESTS["t-ind"].power(0.5, 10000, 0.05, 2) > 0.999, "should approach 1");
  assert(TESTS["t-paired"].power(0.5, 10000, 0.05, 2) > 0.999, "should approach 1");
  assert(TESTS["anova"].power(0.25, 10000, 0.05, 2, 3) > 0.999, "should approach 1");
  assert(TESTS["correlation"].power(0.3, 10000, 0.05, 2) > 0.999, "should approach 1");
  assert(TESTS["chi2"].power(0.3, 10000, 0.05, 2, 0, 1) > 0.999, "should approach 1");
});

test("power → α for d/f/r/w = 0 (no effect)", () => {
  // When effect = 0, power should equal the Type I error rate
  approx(TESTS["t-ind"].power(0, 100, 0.05, 2), 0.05, 0.02);
  approx(TESTS["t-paired"].power(0, 100, 0.05, 2), 0.05, 0.02);
  approx(TESTS["correlation"].power(0, 100, 0.05, 2), 0.05, 0.02);
  approx(TESTS["chi2"].power(0, 100, 0.05, 2, 0, 1), 0.05, 0.02);
});

test("power is bounded between 0 and 1", () => {
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
  assert(TESTS["t-ind"].power(2.0, 10, 0.05, 2) > 0.90, "large d should give high power");
  assert(TESTS["chi2"].power(0.8, 30, 0.05, 2, 0, 1) > 0.90, "large w should give high power");
});

summary();
