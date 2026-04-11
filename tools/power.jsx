// power.jsx — editable source. Run `npm run build` to compile to power.js
// Do NOT edit the .js file directly.

const { useState, useMemo, useCallback, useRef, useEffect, forwardRef } = React;

// ── Statistical distribution functions ──────────────────────────────────────

// Normal CDF — Abramowitz & Stegun 26.2.17 (max error 7.5e-8)
function normcdf(x) {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327; // 1/sqrt(2*pi)
  const poly =
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * Math.exp(-0.5 * x * x) * poly;
  return x > 0 ? p : 1 - p;
}

// Inverse normal CDF — Peter Acklam's rational approximation (max error 1.15e-9)
function norminv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425,
    pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

// Log gamma — Lanczos approximation
function gammaln(x) {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized incomplete beta function I_x(a, b) via continued fraction
function betai(a, b, x) {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lnBeta = gammaln(a) + gammaln(b) - gammaln(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(a, b, x)) / a;
  }
  return 1 - (front * betacf(b, a, 1 - x)) / b;
}

// Continued fraction for incomplete beta (Lentz's method)
function betacf(a, b, x) {
  const maxIter = 200,
    eps = 3e-14;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

// Regularized incomplete gamma function P(a, x) — series expansion
function gammainc(a, x) {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x > a + 1) return 1 - gammainc_upper(a, x);
  let sum = 1 / a,
    term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 3e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

// Upper regularized incomplete gamma Q(a,x) = 1 - P(a,x) via continued fraction
function gammainc_upper(a, x) {
  let f = x + 1 - a,
    c = 1 / 1e-30,
    d = 1 / f,
    h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    const bn = x + 2 * i + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

// t-distribution CDF
function tcdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? 1 - p : p;
}

// Inverse t CDF (bisection)
function tinv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Start from normal approximation, then refine with bisection
  let lo = -50,
    hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tcdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

// F-distribution CDF
function fcdf(f, d1, d2) {
  if (f <= 0) return 0;
  return betai(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2));
}

// Chi-square CDF
function chi2cdf(x, k) {
  if (x <= 0) return 0;
  return gammainc(k / 2, x / 2);
}

// Inverse chi-square CDF (bisection)
function chi2inv(p, k) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0,
    hi = k + 10 * Math.sqrt(2 * k);
  while (chi2cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chi2cdf(mid, k) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

// Gauss-Legendre quadrature nodes and weights (computed once, cached)
let _glCache;
function _gaussLegendre(n) {
  if (_glCache && _glCache.n === n) return _glCache;
  const nodes = new Array(n),
    weights = new Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      let pm1 = 1,
        p = x;
      for (let j = 2; j <= n; j++) {
        const pp = ((2 * j - 1) * x * p - (j - 1) * pm1) / j;
        pm1 = p;
        p = pp;
      }
      const dp = (n * (x * p - pm1)) / (x * x - 1);
      const dx = p / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    let pm1 = 1,
      p = x;
    for (let j = 2; j <= n; j++) {
      const pp = ((2 * j - 1) * x * p - (j - 1) * pm1) / j;
      pm1 = p;
      p = pp;
    }
    const dp = (n * (x * p - pm1)) / (x * x - 1);
    const w = 2 / ((1 - x * x) * dp * dp);
    nodes[i] = -x;
    nodes[n - 1 - i] = x;
    weights[i] = w;
    weights[n - 1 - i] = w;
  }
  return (_glCache = { nodes, weights, n });
}

// Noncentral t CDF — Gauss-Legendre quadrature of chi-square mixture.
// P(T ≤ t | ν, δ) = ∫₀^∞ Φ(t√(s/ν) − δ) · f_χ²(s; ν) ds
// Substitution u = √s removes density singularity for small ν, giving:
// = ∫₀^∞ Φ(tu/√ν − δ) · 2u^{ν−1} e^{−u²/2} / (2^{ν/2} Γ(ν/2)) du
function nctcdf(t, df, delta) {
  if (Math.abs(delta) < 1e-14) return tcdf(t, df);
  const halfDf = df / 2;
  const logC = halfDf * Math.log(2) + gammaln(halfDf);
  const sqrtDf = Math.sqrt(df);
  const uLo = Math.max(0, sqrtDf - 8);
  const uHi = sqrtDf + 8;
  const gl = _gaussLegendre(48);
  const half = (uHi - uLo) / 2,
    mid = (uHi + uLo) / 2;
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    if (u <= 0) continue;
    const logH = Math.log(2) + (df - 1) * Math.log(u) - (u * u) / 2 - logC;
    sum += half * gl.weights[i] * normcdf((t * u) / sqrtDf - delta) * Math.exp(logH);
  }
  return Math.max(0, Math.min(1, sum));
}

// Noncentral F survival P(F' > f) — Poisson mixture
// F' = (χ²_{d1+2J}/d1) / (χ²_{d2}/d2), J~Poisson(λ/2)
// P(F'>f) = Σ_j P(J=j) × P(F(d1+2j, d2) > f × d1/(d1+2j))
// Starts at Poisson mode to avoid underflow for large λ.
function ncf_sf(f, d1, d2, lambda) {
  if (f <= 0) return 1;
  if (lambda <= 0) return 1 - fcdf(f, d1, d2);
  const halfLam = lambda / 2;
  const jMode = Math.max(0, Math.floor(halfLam));

  // Compute log-Poisson at the mode, then work in absolute terms from there
  function sfTerm(j) {
    const d1j = d1 + 2 * j;
    return 1 - fcdf((f * d1) / d1j, d1j, d2);
  }

  // Start at mode
  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * sfTerm(jMode);

  // Sum upward from mode
  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + 500; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * sfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && contrib < 1e-14) break;
  }

  // Sum downward from mode
  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * sfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && contrib < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// Noncentral chi-square CDF — Poisson mixture (starts at mode to avoid underflow)
function ncchi2cdf(x, k, lambda) {
  if (x <= 0) return 0;
  if (lambda <= 0) return chi2cdf(x, k);
  const halfLam = lambda / 2;
  const jMode = Math.max(0, Math.floor(halfLam));

  function cdfTerm(j) {
    return gammainc(k / 2 + j, x / 2);
  }

  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * cdfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + 500; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * cdfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && contrib < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * cdfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && contrib < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// ── Power computation functions ─────────────────────────────────────────────

// Generic bisection solver: find x in [lo, hi] such that fn(x) ≈ target
function bisect(fn, target, lo, hi, tol = 1e-6, maxIter = 200) {
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}

// ── Power functions (keyed by test type) ────────────────────────────────────

function powerTwoSample(d, n, alpha, tails) {
  const df = 2 * n - 2;
  const delta = d * Math.sqrt(n / 2);
  const tCrit = tinv(1 - alpha / tails, df);
  if (tails === 2) return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
  return 1 - nctcdf(tCrit, df, delta);
}

function powerPaired(d, n, alpha, tails) {
  const df = n - 1;
  const delta = d * Math.sqrt(n);
  const tCrit = tinv(1 - alpha / tails, df);
  if (tails === 2) return 1 - nctcdf(tCrit, df, delta) + nctcdf(-tCrit, df, delta);
  return 1 - nctcdf(tCrit, df, delta);
}

function powerOneSample(d, n, alpha, tails) {
  return powerPaired(d, n, alpha, tails); // same math
}

function powerAnova(f, n, alpha, k) {
  const df1 = k - 1,
    df2 = k * (n - 1);
  const lambda = n * k * f * f;
  const fCrit = bisect((x) => fcdf(x, df1, df2), 1 - alpha, 0, 200);
  return ncf_sf(fCrit, df1, df2, lambda);
}

function powerCorrelation(r, n, alpha, tails) {
  const zr = Math.atanh(r);
  const se = 1 / Math.sqrt(Math.max(1, n - 3));
  const zCrit = norminv(1 - alpha / tails);
  if (tails === 2) return normcdf(Math.abs(zr) / se - zCrit) + normcdf(-Math.abs(zr) / se - zCrit);
  return normcdf(zr / se - zCrit);
}

function powerChi2(w, n, alpha, df) {
  const lambda = n * w * w;
  const chiCrit = chi2inv(1 - alpha, df);
  return 1 - ncchi2cdf(chiCrit, df, lambda);
}

// ── Effect size helpers ─────────────────────────────────────────────────────

// Two-sample t: d from means + SD
function dFromMeans(m1, m2, sd) {
  return sd > 0 ? Math.abs(m1 - m2) / sd : 0;
}

// ANOVA f from group means + within-SD
function fFromGroupMeans(meansArr, sd) {
  if (!meansArr.length || sd <= 0) return 0;
  const grandMean = meansArr.reduce((a, b) => a + b, 0) / meansArr.length;
  const sigmaMeans = Math.sqrt(
    meansArr.reduce((s, m) => s + (m - grandMean) ** 2, 0) / meansArr.length
  );
  return sigmaMeans / sd;
}

// Chi-square w from expected proportions vs hypothesized
function wFromProportions(observed, expected) {
  if (!observed.length || observed.length !== expected.length) return 0;
  let sum = 0;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] <= 0) return 0;
    sum += (observed[i] - expected[i]) ** 2 / expected[i];
  }
  return Math.sqrt(sum);
}

// ── Test definitions ────────────────────────────────────────────────────────

const TESTS = {
  "t-ind": {
    label: "Two-sample t-test",
    question: "How many subjects per group to detect a difference between two independent groups?",
    nLabel: "n per group",
    power: (es, n, alpha, tails) => powerTwoSample(es, n, alpha, tails),
    effectMax: 3,
    totalN: (n) => n * 2,
    totalLabel: (n) => `Total N = ${n * 2} (${n} per group \u00d7 2)`,
  },
  "t-paired": {
    label: "Paired t-test",
    question: "How many pairs to detect a difference between matched measurements?",
    nLabel: "n (pairs)",
    power: (es, n, alpha, tails) => powerPaired(es, n, alpha, tails),
    effectMax: 3,
  },
  "t-one": {
    label: "One-sample t-test",
    question: "How many observations to detect a deviation from a known reference value?",
    nLabel: "n",
    power: (es, n, alpha, tails) => powerOneSample(es, n, alpha, tails),
    effectMax: 3,
  },
  anova: {
    label: "One-way ANOVA",
    question: "How many subjects per group to detect differences among k group means?",
    nLabel: "n per group",
    hasGroups: true,
    power: (es, n, alpha, _tails, k) => powerAnova(es, n, alpha, k),
    effectMax: 2,
    totalN: (n, k) => n * k,
    totalLabel: (n, k) => `Total N = ${n * k} (${n} per group \u00d7 ${k} groups)`,
  },
  correlation: {
    label: "Correlation",
    question: "How many observations to detect a non-zero Pearson correlation?",
    nLabel: "n (total)",
    power: (es, n, alpha, tails) => powerCorrelation(es, n, alpha, tails),
    effectMax: 0.99,
    minN: 4,
  },
  chi2: {
    label: "Chi-square test",
    question: "How many observations for a goodness-of-fit or independence test?",
    nLabel: "n (total)",
    hasDf: true,
    power: (es, n, alpha, _tails, _k, df) => powerChi2(es, n, alpha, df),
    effectMax: 1,
  },
};

// ── Effect size input component (the key UX piece) ──────────────────────────

function EffectSizePanel({ testKey, effectSize, onEffectChange, disabled }) {
  const [mode, setMode] = useState("helper"); // "helper" or "direct"
  // t-test helper state
  const [mean1, setMean1] = useState("");
  const [mean2, setMean2] = useState("");
  const [sd, setSd] = useState("");
  // paired helper
  const [diffMean, setDiffMean] = useState("");
  const [diffSd, setDiffSd] = useState("");
  // ANOVA helper
  const [groupMeansStr, setGroupMeansStr] = useState("");
  const [withinSd, setWithinSd] = useState("");
  // chi-square helper
  const [expectedStr, setExpectedStr] = useState(""); // e.g. "3:1" or "0.75,0.25"
  const [observedStr, setObservedStr] = useState("");
  // correlation — no helper needed, r is intuitive

  const inputStyle = { ...inpN, width: "100%", textAlign: "left" };
  const smallLabel = { fontSize: 11, color: "#666", marginBottom: 2 };
  const note = { fontSize: 10, color: "#999", marginTop: 2 };

  // Parse ratio string like "3:1" or "0.75,0.25" into normalized proportions
  function parseProportions(str) {
    if (!str.trim()) return [];
    let parts;
    if (str.includes(":")) {
      parts = str
        .split(":")
        .map((s) => parseFloat(s.trim()))
        .filter((v) => !isNaN(v) && v >= 0);
    } else {
      parts = str
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((v) => !isNaN(v) && v >= 0);
    }
    const sum = parts.reduce((a, b) => a + b, 0);
    return sum > 0 ? parts.map((p) => p / sum) : [];
  }

  // Auto-compute effect size from helper inputs
  const computeFromHelper = useCallback(() => {
    if (testKey === "t-ind") {
      const m1 = parseFloat(mean1),
        m2 = parseFloat(mean2),
        s = parseFloat(sd);
      if (!isNaN(m1) && !isNaN(m2) && !isNaN(s) && s > 0) {
        onEffectChange(dFromMeans(m1, m2, s).toFixed(4));
      }
    } else if (testKey === "t-paired" || testKey === "t-one") {
      const dm = parseFloat(diffMean),
        ds = parseFloat(diffSd);
      if (!isNaN(dm) && !isNaN(ds) && ds > 0) {
        onEffectChange((Math.abs(dm) / ds).toFixed(4));
      }
    } else if (testKey === "anova") {
      const means = groupMeansStr
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((v) => !isNaN(v));
      const wsd = parseFloat(withinSd);
      if (means.length >= 2 && !isNaN(wsd) && wsd > 0) {
        onEffectChange(fFromGroupMeans(means, wsd).toFixed(4));
      }
    } else if (testKey === "chi2") {
      const exp = parseProportions(expectedStr);
      const obs = parseProportions(observedStr);
      if (exp.length >= 2 && obs.length === exp.length) {
        onEffectChange(wFromProportions(obs, exp).toFixed(4));
      }
    }
  }, [
    testKey,
    mean1,
    mean2,
    sd,
    diffMean,
    diffSd,
    groupMeansStr,
    withinSd,
    expectedStr,
    observedStr,
    onEffectChange,
  ]);

  const computedD = parseFloat(effectSize);
  const sizeLabel =
    testKey === "correlation"
      ? computedD < 0.1
        ? ""
        : computedD < 0.3
          ? "small"
          : computedD < 0.5
            ? "medium"
            : "large"
      : testKey === "anova"
        ? computedD < 0.1
          ? ""
          : computedD < 0.25
            ? "small"
            : computedD < 0.4
              ? "medium"
              : "large"
        : testKey === "chi2"
          ? computedD < 0.1
            ? ""
            : computedD < 0.3
              ? "small"
              : computedD < 0.5
                ? "medium"
                : "large"
          : computedD < 0.2
            ? ""
            : computedD < 0.5
              ? "small"
              : computedD < 0.8
                ? "medium"
                : "large";

  const sizeColor =
    sizeLabel === "small"
      ? "#009E73"
      : sizeLabel === "medium"
        ? "#E69F00"
        : sizeLabel === "large"
          ? "#D55E00"
          : "#999";

  // Correlation uses direct input only (r is intuitive)
  if (testKey === "correlation") {
    return (
      <div style={{ opacity: disabled ? 0.4 : 1 }}>
        <div style={smallLabel}>Expected correlation |r|</div>
        <input
          type="number"
          min="0.01"
          max="0.99"
          step="0.05"
          value={effectSize}
          onChange={(e) => onEffectChange(e.target.value)}
          disabled={disabled}
          style={inputStyle}
        />
        {sizeLabel && (
          <div style={{ ...note, color: sizeColor, fontWeight: 600 }}>{sizeLabel} effect</div>
        )}
        <div style={note}>How strong a linear relationship do you expect?</div>
      </div>
    );
  }

  return (
    <div style={{ opacity: disabled ? 0.4 : 1 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <div
          style={{
            padding: "5px 8px",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
            background: mode === "helper" ? "#648FFF" : "#eee",
            color: mode === "helper" ? "#fff" : "#666",
            fontWeight: mode === "helper" ? 700 : 400,
            flex: 1,
            textAlign: "center",
            boxSizing: "border-box",
          }}
          onClick={() => setMode("helper")}
        >
          From my data
        </div>
        <div
          style={{
            padding: "5px 8px",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
            background: mode === "direct" ? "#648FFF" : "#eee",
            color: mode === "direct" ? "#fff" : "#666",
            fontWeight: mode === "direct" ? 700 : 400,
            flex: 1,
            textAlign: "center",
            boxSizing: "border-box",
          }}
          onClick={() => setMode("direct")}
        >
          Direct value
        </div>
      </div>

      {mode === "helper" && testKey === "t-ind" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <div style={smallLabel}>Expected mean — group 1</div>
            <input
              type="number"
              step="any"
              value={mean1}
              onChange={(e) => setMean1(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 15.2"
            />
          </div>
          <div>
            <div style={smallLabel}>Expected mean — group 2</div>
            <input
              type="number"
              step="any"
              value={mean2}
              onChange={(e) => setMean2(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 12.8"
            />
          </div>
          <div>
            <div style={smallLabel}>Common standard deviation</div>
            <input
              type="number"
              step="any"
              min="0"
              value={sd}
              onChange={(e) => setSd(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 4.5"
            />
          </div>
          <button
            onClick={computeFromHelper}
            disabled={disabled}
            style={{ ...btnPrimary, fontSize: 12, padding: "5px 10px" }}
          >
            Compute effect size
          </button>
          <div style={note}>
            Use pilot data or literature values. The SD should be the pooled within-group SD.
          </div>
        </div>
      )}

      {mode === "helper" && (testKey === "t-paired" || testKey === "t-one") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <div style={smallLabel}>
              {testKey === "t-paired"
                ? "Expected mean difference"
                : "Expected deviation from reference"}
            </div>
            <input
              type="number"
              step="any"
              value={diffMean}
              onChange={(e) => setDiffMean(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 2.5"
            />
          </div>
          <div>
            <div style={smallLabel}>
              {testKey === "t-paired" ? "SD of paired differences" : "Standard deviation"}
            </div>
            <input
              type="number"
              step="any"
              min="0"
              value={diffSd}
              onChange={(e) => setDiffSd(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 5.0"
            />
          </div>
          <button
            onClick={computeFromHelper}
            disabled={disabled}
            style={{ ...btnPrimary, fontSize: 12, padding: "5px 10px" }}
          >
            Compute effect size
          </button>
        </div>
      )}

      {mode === "helper" && testKey === "anova" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <div style={smallLabel}>Expected group means (comma-separated)</div>
            <input
              type="text"
              value={groupMeansStr}
              onChange={(e) => setGroupMeansStr(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 10, 12, 15"
            />
          </div>
          <div>
            <div style={smallLabel}>Within-group standard deviation</div>
            <input
              type="number"
              step="any"
              min="0"
              value={withinSd}
              onChange={(e) => setWithinSd(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 4.0"
            />
          </div>
          <button
            onClick={computeFromHelper}
            disabled={disabled}
            style={{ ...btnPrimary, fontSize: 12, padding: "5px 10px" }}
          >
            Compute effect size
          </button>
          <div style={note}>
            Enter the means you expect for each treatment group, and the common within-group SD
            (from pilot data or literature).
          </div>
        </div>
      )}

      {mode === "helper" && testKey === "chi2" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <div style={smallLabel}>Baseline proportions (what the theory predicts)</div>
            <input
              type="text"
              value={expectedStr}
              onChange={(e) => setExpectedStr(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 3:1 or 0.75, 0.25"
            />
          </div>
          <div>
            <div style={smallLabel}>Actual proportions (what you think is really happening)</div>
            <input
              type="text"
              value={observedStr}
              onChange={(e) => setObservedStr(e.target.value)}
              disabled={disabled}
              style={inputStyle}
              placeholder="e.g. 2:1 or 0.67, 0.33"
            />
          </div>
          <button
            onClick={computeFromHelper}
            disabled={disabled}
            style={{ ...btnPrimary, fontSize: 12, padding: "5px 10px" }}
          >
            Compute effect size
          </button>
          <div style={note}>
            Use ratios (3:1) or proportions (0.75, 0.25). Common for Mendelian segregation tests.
          </div>
        </div>
      )}

      {mode === "direct" && (
        <div>
          <div style={smallLabel}>
            {testKey === "anova"
              ? "Effect size (f)"
              : testKey === "chi2"
                ? "Effect size (w)"
                : "Effect size (d)"}
          </div>
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={effectSize}
            onChange={(e) => onEffectChange(e.target.value)}
            disabled={disabled}
            style={inputStyle}
          />
          <div style={note}>
            {testKey === "anova"
              ? "f = SD of group means / within-group SD"
              : testKey === "chi2"
                ? "w = \u221A(\u03A3 (p_obs \u2212 p_exp)\u00B2 / p_exp)"
                : "d = |difference in means| / pooled SD"}
          </div>
        </div>
      )}

      {/* Computed effect size display */}
      {effectSize && parseFloat(effectSize) > 0 && (
        <div
          style={{
            marginTop: 6,
            padding: "6px 10px",
            background: "#f0f7ff",
            borderRadius: 6,
            border: "1px solid #d0e0f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#333" }}>
            Effect size = <b>{parseFloat(effectSize).toFixed(3)}</b>
          </span>
          {sizeLabel && (
            <span style={{ fontSize: 11, fontWeight: 600, color: sizeColor }}>{sizeLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Power curve SVG ─────────────────────────────────────────────────────────

const PowerCurve = forwardRef(function PowerCurve(
  { testKey, powerFn, params, solveFor, result },
  ref
) {
  const test = TESTS[testKey];
  if (!test) return null;

  const VBW = 520,
    VBH = 320;
  const M = { top: 30, right: 20, bottom: 50, left: 55 };
  const w = VBW - M.left - M.right;
  const h = VBH - M.top - M.bottom;

  const { es, n, alpha, tails, k, df } = params;
  const minN = test.minN || 2;

  // Always plot power vs n
  const maxN = Math.max(200, result && solveFor === "n" ? result * 2.5 : 200);
  const xRange = [minN, Math.ceil(maxN)];
  const curvePoints = [];
  for (let i = 0; i <= 100; i++) {
    const xn = xRange[0] + ((xRange[1] - xRange[0]) * i) / 100;
    const ni = Math.max(minN, Math.round(xn));
    const pw = powerFn(es, ni, alpha, tails, k, df);
    curvePoints.push({ x: ni, y: Math.min(1, Math.max(0, pw)) });
  }

  const sx = (v) => M.left + ((v - xRange[0]) / (xRange[1] - xRange[0])) * w;
  const sy = (v) => M.top + (1 - v) * h;

  const pathD = curvePoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`)
    .join(" ");

  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const xTicks = makeTicks(xRange[0], xRange[1], 6);

  let marker = null;
  if (result != null && isFinite(result) && solveFor === "n") {
    const my = powerFn(es, Math.round(result), alpha, tails, k, df);
    marker = { x: sx(result), y: sy(Math.min(1, Math.max(0, my))) };
  } else if (result != null && isFinite(result) && solveFor === "power") {
    marker = { x: sx(n), y: sy(Math.min(1, Math.max(0, result))) };
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VBW} ${VBH}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Power curve"
    >
      <title>Power curve</title>
      <desc>Statistical power as a function of sample size</desc>
      <rect x={M.left} y={M.top} width={w} height={h} fill="#fafafa" />
      {yTicks.map((t) => (
        <line
          key={`yg${t}`}
          x1={M.left}
          x2={M.left + w}
          y1={sy(t)}
          y2={sy(t)}
          stroke="#e8e8e8"
          strokeWidth="0.5"
        />
      ))}
      <line
        x1={M.left}
        x2={M.left + w}
        y1={sy(0.8)}
        y2={sy(0.8)}
        stroke="#D55E00"
        strokeWidth="1"
        strokeDasharray="6,3"
        opacity="0.6"
      />
      <text x={M.left + w + 3} y={sy(0.8) + 3} fontSize="9" fill="#D55E00" fontFamily="sans-serif">
        0.80
      </text>
      <path d={pathD} fill="none" stroke="#0072B2" strokeWidth="2.5" strokeLinejoin="round" />
      {marker && (
        <g>
          <line
            x1={marker.x}
            x2={marker.x}
            y1={M.top}
            y2={M.top + h}
            stroke="#E69F00"
            strokeWidth="1"
            strokeDasharray="4,2"
          />
          <circle
            cx={marker.x}
            cy={marker.y}
            r="5"
            fill="#E69F00"
            stroke="#fff"
            strokeWidth="1.5"
          />
        </g>
      )}
      <rect x={M.left} y={M.top} width={w} height={h} fill="none" stroke="#333" strokeWidth="1" />
      {yTicks.map((t) => (
        <text
          key={`yl${t}`}
          x={M.left - 8}
          y={sy(t) + 4}
          textAnchor="end"
          fontSize="11"
          fill="#555"
          fontFamily="sans-serif"
        >
          {t.toFixed(1)}
        </text>
      ))}
      <text
        x={14}
        y={M.top + h / 2}
        textAnchor="middle"
        fontSize="12"
        fill="#333"
        fontFamily="sans-serif"
        transform={`rotate(-90,14,${M.top + h / 2})`}
      >
        Power (1 − β)
      </text>
      {xTicks.map((t) => (
        <text
          key={`xl${t}`}
          x={sx(t)}
          y={M.top + h + 18}
          textAnchor="middle"
          fontSize="11"
          fill="#555"
          fontFamily="sans-serif"
        >
          {Math.round(t)}
        </text>
      ))}
      <text
        x={M.left + w / 2}
        y={VBH - 6}
        textAnchor="middle"
        fontSize="12"
        fill="#333"
        fontFamily="sans-serif"
      >
        {test.nLabel}
      </text>
    </svg>
  );
});

// ── Main App ────────────────────────────────────────────────────────────────

function App() {
  const [testKey, setTestKey] = useState("t-ind");
  const [solveFor, setSolveFor] = useState("n");
  const [effectSize, setEffectSize] = useState("0.5");
  const [nInput, setNInput] = useState("30");
  const [alphaInput, setAlphaInput] = useState("0.05");
  const [powerInput, setPowerInput] = useState("0.80");
  const [tails, setTails] = useState(2);
  const [kInput, setKInput] = useState("3");
  const [dfInput, setDfInput] = useState("1");
  const prevResultRef = useRef();
  const [resultFlash, setResultFlash] = useState(false);

  const test = TESTS[testKey];

  const es = parseFloat(effectSize) || 0;
  const n = parseInt(nInput) || 2;
  const alpha = parseFloat(alphaInput) || 0.05;
  const power = parseFloat(powerInput) || 0.8;
  const k = parseInt(kInput) || 3;
  const df = parseInt(dfInput) || 1;

  const result = useMemo(() => {
    try {
      const minN = test.minN || 2;
      const pw = (e, ni) => test.power(e, ni, alpha, tails, k, df);
      if (solveFor === "n") {
        if (es <= 0 || alpha <= 0 || alpha >= 1 || power <= 0 || power >= 1) return null;
        return Math.ceil(
          bisect((ni) => pw(es, Math.max(minN, Math.round(ni))), power, minN, 100000, 0.5)
        );
      }
      if (solveFor === "power") {
        if (es <= 0 || n < minN || alpha <= 0 || alpha >= 1) return null;
        return pw(es, n);
      }
    } catch {
      return null;
    }
    return null;
  }, [testKey, solveFor, es, n, alpha, power, tails, k, df]);

  const resultText = useMemo(() => {
    if (result == null) return "—";
    if (solveFor === "n") return `${result}`;
    if (solveFor === "power") return `${(result * 100).toFixed(1)}%`;
    return "—";
  }, [result, solveFor]);

  const resultLabel = {
    n: `Required ${test.nLabel}`,
    power: "Statistical power",
  }[solveFor];

  useEffect(() => {
    if (prevResultRef.current !== undefined && result !== prevResultRef.current && result != null) {
      setResultFlash(true);
      const id = setTimeout(() => setResultFlash(false), 300);
      return () => clearTimeout(id);
    }
    prevResultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (resultFlash) prevResultRef.current = result;
  }, [resultFlash]);

  const handleTestChange = useCallback((e) => {
    const key = e.target.value;
    setTestKey(key);
    setSolveFor("n");
    if (key === "anova" || key === "chi2") setTails(2);
  }, []);

  const inputStyle = { ...inpN, width: "100%" };
  const chipStyle = (active) => ({
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    border: active ? "1px solid #648FFF" : "1px solid #ccc",
    background: active ? "#648FFF" : "#fff",
    fontWeight: active ? 600 : 400,
    color: active ? "#fff" : "#333",
    fontFamily: "inherit",
    flex: 1,
    textAlign: "center",
    boxSizing: "border-box",
  });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <PageHeader
        title="Power Analysis"
        icon={toolIcon("power")}
        subtitle="Validated to within ±0.5% of R pwr package output"
      />

      {/* Question banner */}
      <div
        style={{ ...sec, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #0072B2" }}
      >
        <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>{test.question}</div>
      </div>

      {/* ── Top row: test type + solve for ── */}
      <div style={{ display: "flex", gap: 20, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ ...sec, padding: 12, flex: 1, minWidth: 200 }}>
          <div style={lbl}>Statistical test</div>
          <select
            value={testKey}
            onChange={handleTestChange}
            style={{ ...selStyle, width: "100%" }}
          >
            {Object.entries(TESTS).map(([key, t]) => (
              <option key={key} value={key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...sec, padding: 12, flex: 1, minWidth: 200 }}>
          <div style={{ ...lbl, marginBottom: 6 }}>What do you need to find?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              ["n", "Sample size"],
              ["power", "Power"],
            ].map(([key, label]) => (
              <div key={key} style={chipStyle(solveFor === key)} onClick={() => setSolveFor(key)}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main row: controls (left) + plot/result (right) ── */}
      <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* ── Left panel ── */}
        <div
          style={{ width: 328, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}
        >
          {/* Effect size */}
          <div style={{ ...sec, padding: 12 }}>
            <div style={{ ...lbl, marginBottom: 6 }}>Expected effect size</div>
            <EffectSizePanel
              testKey={testKey}
              effectSize={effectSize}
              onEffectChange={setEffectSize}
              disabled={solveFor === "effect"}
            />
          </div>

          {/* Other parameters */}
          <div
            style={{
              ...sec,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flex: 1,
            }}
          >
            {/* Sample size */}
            <div style={{ opacity: solveFor === "n" ? 0.4 : 1 }}>
              <div style={lbl}>{test.nLabel}</div>
              <input
                type="number"
                min="2"
                step="1"
                value={nInput}
                onChange={(e) => setNInput(e.target.value)}
                disabled={solveFor === "n"}
                style={inputStyle}
              />
            </div>

            {/* Significance */}
            <div>
              <div style={lbl}>Significance level (α)</div>
              <select
                value={alphaInput}
                onChange={(e) => setAlphaInput(e.target.value)}
                style={{ ...selStyle, width: "100%" }}
              >
                <option value="0.10">0.10</option>
                <option value="0.05">0.05</option>
                <option value="0.01">0.01</option>
                <option value="0.001">0.001</option>
              </select>
            </div>

            {/* Power */}
            <div style={{ opacity: solveFor === "power" ? 0.4 : 1 }}>
              <div style={lbl}>Desired power (1 − β)</div>
              <select
                value={powerInput}
                onChange={(e) => setPowerInput(e.target.value)}
                disabled={solveFor === "power"}
                style={{ ...selStyle, width: "100%" }}
              >
                <option value="0.70">0.70</option>
                <option value="0.80">0.80 (standard)</option>
                <option value="0.90">0.90</option>
                <option value="0.95">0.95</option>
              </select>
            </div>

            {/* Tails */}
            {testKey !== "anova" && testKey !== "chi2" && (
              <div>
                <div style={lbl}>Direction of the test</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    [2, "Two-sided"],
                    [1, "One-sided"],
                  ].map(([t, label]) => (
                    <div key={t} style={chipStyle(tails === t)} onClick={() => setTails(t)}>
                      {label}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>
                  Two-sided: the difference could go either way. One-sided: you expect a specific
                  direction.
                </div>
              </div>
            )}

            {/* ANOVA groups */}
            {test.hasGroups && (
              <div>
                <div style={lbl}>Number of groups</div>
                <input
                  type="number"
                  min="2"
                  max="20"
                  step="1"
                  value={kInput}
                  onChange={(e) => setKInput(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {/* Chi-square df */}
            {test.hasDf && (
              <div>
                <div style={lbl}>Degrees of freedom</div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={dfInput}
                  onChange={(e) => setDfInput(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                  Goodness-of-fit: categories − 1.
                  <br />
                  Independence: (rows−1)(cols−1).
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, minWidth: 360, display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Power curve */}
          <div style={{ ...sec, padding: 12, flex: 1 }}>
            <PowerCurve
              testKey={testKey}
              powerFn={test.power}
              params={{ es, n, alpha, tails, k, df }}
              solveFor={solveFor}
              result={result}
            />
          </div>

          {/* Result */}
          <div
            style={{
              ...sec,
              padding: 16,
              textAlign: "center",
              background: resultFlash ? "#d4edda" : sec.background || "#fff",
              transition: "background 0.3s ease",
            }}
          >
            <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>{resultLabel}</div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: result != null ? "#0072B2" : "#ccc",
                fontFamily: "monospace",
              }}
            >
              {resultText}
            </div>
            {solveFor === "n" && result != null && test.totalLabel && (
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                {test.totalLabel(result, k)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Explainer — full width */}
      <div style={{ ...sec, padding: 12, marginTop: 10 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#555",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          What do these numbers mean?
        </div>
        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.7 }}>
          <b>Power</b> is the probability that you will correctly reject the null hypothesis (i.e.
          to claim a result is significant). A power of 0.80 (the dashed line) means an 80% chance
          of success — this is the standard minimum. Higher is better but costs more subjects.
          <br />
          <br />
          <b>Significance level (α)</b> is the risk of a false positive — concluding there is an
          effect when there is none. The standard α&nbsp;=&nbsp;0.05 means you accept a 5% chance of
          a false alarm. Lowering α (e.g. to 0.01) makes you more conservative but requires more
          subjects to keep power high.
          <br />
          <br />
          <b>Sample size ({test.nLabel})</b> is the number of observations you need to collect. More
          subjects give you more power to detect a given effect.
          <br />
          <br />
          <b>Effect size</b> measures how large the real difference or relationship is, scaled by
          variability. Use the "From my data" tab to compute it from values you expect (e.g. group
          means and standard deviation from pilot data or published studies).
          {testKey === "t-ind" && (
            <>
              <br />
              <br />
              For a <b>two-sample t-test</b>, the effect size (Cohen's d) is the difference between
              the two group means divided by their common standard deviation. A d of 0.2 is small,
              0.5 is medium, and 0.8 is large.
            </>
          )}
          {testKey === "t-paired" && (
            <>
              <br />
              <br />
              For a <b>paired t-test</b>, the effect size (Cohen's d) is the expected mean of the
              paired differences divided by the standard deviation of those differences.
            </>
          )}
          {testKey === "t-one" && (
            <>
              <br />
              <br />
              For a <b>one-sample t-test</b>, the effect size (Cohen's d) is how far the true mean
              deviates from the reference value, divided by the standard deviation.
            </>
          )}
          {testKey === "anova" && (
            <>
              <br />
              <br />
              For <b>ANOVA</b>, the effect size (Cohen's f) captures how spread out the group means
              are relative to within-group variability. An f of 0.10 is small, 0.25 is medium, and
              0.40 is large.
            </>
          )}
          {testKey === "correlation" && (
            <>
              <br />
              <br />
              For <b>correlation</b>, the effect size is simply the expected Pearson r. An r of 0.1
              is small, 0.3 is medium, and 0.5 is large.
            </>
          )}
          {testKey === "chi2" && (
            <>
              <br />
              <br />
              For a <b>chi-square test</b>, the effect size (Cohen's w) measures how far the
              observed category proportions deviate from expected. A w of 0.1 is small, 0.3 is
              medium, and 0.5 is large.
              <br />
              <br />
              Degrees of freedom:
              <br />
              &bull; Goodness-of-fit: <b>df = categories − 1</b>
              <br />
              &bull; Independence: <b>df = (rows − 1) × (cols − 1)</b>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
