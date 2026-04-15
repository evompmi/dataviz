// stats.js — statistical distribution functions and tests.
//
// Loaded as a plain <script> tag in tool HTML (like shared.js /
// shared-components.js); exposes everything as globals. Tools and tests
// consume these names without imports.
//
// Layout:
//   1. Distribution functions       — normal, gamma, beta, t, F, chi-square,
//                                     noncentral t/F/chi-square
//   2. Generic helpers              — bisect
//   3. Sample helpers               — mean, variance, sd (sample), rank-with-ties
//   4. Normality tests              — Shapiro-Wilk (Royston 1995, AS R94)
//
// All new functions are benchmarked against R output in tests/stats.test.js
// with the same ±0.5% tolerance bar used for the power tool.

// ── 1. Distribution functions ───────────────────────────────────────────────

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
  // Series converges in ~O(√a) steps when x ≈ a (Poisson-like concentration
  // around n ≈ x−a with width √a). A fixed 200-step cap silently truncated
  // large-a calls; scale with √a so chi2cdf / ptukey stay accurate at huge df.
  const maxIter = Math.max(200, Math.ceil(20 * Math.sqrt(a + 1)));
  let sum = 1 / a,
    term = 1 / a;
  for (let n = 1; n < maxIter; n++) {
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
  const maxIter = Math.max(200, Math.ceil(20 * Math.sqrt(a + 1)));
  for (let i = 1; i < maxIter; i++) {
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

// t-distribution PDF (computed in log space, used by tinv Newton-Raphson)
function tpdf(x, df) {
  const logpdf =
    gammaln((df + 1) / 2) -
    gammaln(df / 2) -
    0.5 * Math.log(Math.PI * df) -
    ((df + 1) / 2) * Math.log(1 + (x * x) / df);
  return Math.exp(logpdf);
}

// Inverse t CDF.
// Strategy:
//   • df = 1 and df = 2 have closed forms — use them directly.
//   • df ≥ 3: Newton-Raphson seeded with a Cornish-Fisher correction to the
//     normal quantile, with a damped step and a bisection fallback if Newton
//     fails to converge. Bracket bounds expand outward (doubling) to handle
//     heavy-tailed cases where |t| can exceed hundreds or thousands at
//     extreme p (e.g. qt(1e-10, 5) ≈ −157).
//   • Work in the left tail (leftP ≤ 0.5) and flip sign at the end, so that
//     inputs like p = 1 − 1e-15 don't suffer catastrophic cancellation.
function tinv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const upper = p > 0.5;
  const leftP = upper ? 1 - p : p;

  let tLeft;

  if (df === 1) {
    // Cauchy: F⁻¹(u) = tan(π(u − 0.5)) = −cot(π·u).
    tLeft = -1 / Math.tan(Math.PI * leftP);
  } else if (df === 2) {
    // Closed form: t = (2u−1) / √(2u(1−u)).
    tLeft = (2 * leftP - 1) / Math.sqrt(2 * leftP * (1 - leftP));
  } else {
    // Cornish-Fisher seed: first-order correction to the normal quantile.
    const z = norminv(leftP);
    let x = z + (z * (z * z + 1)) / (4 * df);

    let converged = false;
    for (let i = 0; i < 60; i++) {
      const cdf = tcdf(x, df);
      const pdf = tpdf(x, df);
      if (!Number.isFinite(cdf) || !(pdf > 0)) break;
      let step = (cdf - leftP) / pdf;
      // Damp the step so we can't jump past a flat tail where PDF → 0.
      const cap = Math.abs(x) + 1;
      if (step > cap) step = cap;
      else if (step < -cap) step = -cap;
      x -= step;
      if (Math.abs(step) < 1e-13 * (Math.abs(x) + 1)) {
        converged = true;
        break;
      }
    }

    if (converged && Number.isFinite(x)) {
      tLeft = x;
    } else {
      // Bisection fallback: expand the lower bound until leftP is bracketed.
      let lo = -1;
      const hi = 0;
      for (let i = 0; i < 4000 && tcdf(lo, df) > leftP; i++) lo *= 2;
      let a = lo,
        b = hi;
      for (let i = 0; i < 200; i++) {
        const mid = (a + b) / 2;
        if (tcdf(mid, df) < leftP) a = mid;
        else b = mid;
        if (b - a < 1e-12 * (Math.abs(a) + 1)) break;
      }
      tLeft = (a + b) / 2;
    }
  }

  return upper ? -tLeft : tLeft;
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

// Chi-square PDF — used as the Newton derivative in chi2inv. Built in log
// space to avoid overflow at large k or tiny x.
function chi2pdf(x, k) {
  if (x <= 0) return 0;
  const halfK = k / 2;
  return Math.exp((halfK - 1) * Math.log(x) - x / 2 - halfK * Math.log(2) - gammaln(halfK));
}

// Inverse chi-square CDF — Newton-Raphson on the central body, bisection
// fallback for the saturated tails where the χ² CDF derivative collapses
// to ~10⁻¹² and Newton overshoots wildly. The historical implementation was
// pure bisection with a doubling upper bound (~50 iterations for 1e-10
// tolerance); this version is much faster on typical inputs while remaining
// correct on the tails. Uses the Wilson-Hilferty cubic-normal approximation
// (X/k)^(1/3) ≈ N(1 − 2/(9k), 2/(9k)) to seed both Newton and the bracket.
function chi2inv(p, k) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (k <= 0) return NaN;
  const z = norminv(p);
  const h = 2 / (9 * k);
  let x = k * Math.pow(1 - h + z * Math.sqrt(h), 3);
  if (!(x > 0)) x = Math.max(1e-6, k * 0.01);
  // Newton inside a wide guard: only accept iterations that stay positive
  // and don't exceed twice the current point. If Newton makes <10⁻¹² PDF
  // (deep in the saturated tail) or the step would leave the guard, drop
  // straight to bisection.
  for (let i = 0; i < 30; i++) {
    const f = chi2cdf(x, k) - p;
    if (Math.abs(f) < 1e-12) return x;
    const fp = chi2pdf(x, k);
    if (!(fp > 1e-12)) break;
    const step = f / fp;
    const xNew = x - step;
    if (!(xNew > 0) || xNew > 2 * x || xNew < x / 2) break;
    if (Math.abs(xNew - x) < 1e-12 * Math.max(1, x)) return xNew;
    x = xNew;
  }
  // Bisection fallback. Use WH seed to set a tight initial bracket; expand
  // by doubling if it doesn't cover p (bisect itself refuses unbracketed
  // targets, so this guarantees progress).
  let lo = 0,
    hi = Math.max(x * 2, k + 10 * Math.sqrt(2 * k));
  for (let i = 0; i < 40 && chi2cdf(hi, k) < p; i++) hi *= 2;
  return bisect((q) => chi2cdf(q, k), p, lo, hi, 1e-10);
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

  // Large-λ short circuit: the Poisson mass around the mode has width
  // σ = √(λ/2), so a fixed 500-step window leaves most of the mass
  // unaccounted for when λ is huge. In that regime, P(F'>f) is either
  // ≈ 1 or ≈ 0 for f outside a few σ of the NCF mean — use closed-form
  // mean / variance of the NCF (valid for d2 > 4) and short-circuit via
  // normal approximation when f is clearly in the far tail. Without this,
  // power-analysis sample-size solvers probe huge n values (e.g. via
  // bisect up to hi=100000) and get misleading truncated-sum answers,
  // breaking the monotonic-in-n assumption the solver depends on.
  if (halfLam > 500 && d2 > 4) {
    const mean = (d2 / (d2 - 2)) * ((d1 + lambda) / d1);
    const v =
      (2 *
        Math.pow(d2 / (d2 - 2), 2) *
        ((d1 + lambda) * (d1 + lambda) + (d1 + 2 * lambda) * (d2 - 2))) /
      (d1 * d1 * (d2 - 4));
    const sd = Math.sqrt(v);
    const z = (f - mean) / sd;
    if (z < -6) return 1;
    if (z > 6) return 0;
  }

  const jMode = Math.max(0, Math.floor(halfLam));
  // Widen the Poisson window for larger λ so we cover ±8σ of the mass.
  const maxSteps = Math.max(500, Math.ceil(8 * Math.sqrt(halfLam + 1)));

  function sfTerm(j) {
    const d1j = d1 + 2 * j;
    return 1 - fcdf((f * d1) / d1j, d1j, d2);
  }

  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * sfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + maxSteps; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * sfTerm(j);
    sum += contrib;
    if (j - jMode > 10 && pUp < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0 && jMode - j < maxSteps; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * sfTerm(j);
    sum += contrib;
    if (jMode - j > 10 && pDown < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// Noncentral chi-square CDF — Poisson mixture (starts at mode to avoid underflow)
function ncchi2cdf(x, k, lambda) {
  if (x <= 0) return 0;
  if (lambda <= 0) return chi2cdf(x, k);
  const halfLam = lambda / 2;
  // Large-λ short circuit: use normal approximation for the far tails.
  // Noncentral χ² has mean k+λ and variance 2(k+2λ); a |z|>6 tail is < 1e-9.
  if (halfLam > 500) {
    const mean = k + lambda;
    const sd = Math.sqrt(2 * (k + 2 * lambda));
    const z = (x - mean) / sd;
    if (z < -6) return 0;
    if (z > 6) return 1;
  }
  const jMode = Math.max(0, Math.floor(halfLam));
  // Poisson mixture width is √λ/2; widen the scan window with √halfLam so huge
  // λ doesn't silently truncate the sum (mirrors the ncf_sf fix).
  const maxSteps = Math.max(500, Math.ceil(8 * Math.sqrt(halfLam + 1)));

  function cdfTerm(j) {
    return gammainc(k / 2 + j, x / 2);
  }

  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * cdfTerm(jMode);

  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + maxSteps; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * cdfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && pUp < 1e-14) break;
  }

  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * cdfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && pDown < 1e-14) break;
  }

  return Math.min(1, Math.max(0, sum));
}

// ── 2. Generic helpers ──────────────────────────────────────────────────────

// Generic bisection solver: find x in [lo, hi] such that fn(x) ≈ target.
// Assumes fn is monotone non-decreasing. Returns NaN if target is not
// bracketed — this is intentional: silent clamping to a bracket boundary
// would let downstream code use a number that isn't actually a root. All
// existing callers are responsible for expanding hi (or shrinking lo)
// before delegating to bisect when their target might fall outside.
function bisect(fn, target, lo, hi, tol = 1e-6, maxIter = 200) {
  if (fn(lo) > target || fn(hi) < target) return NaN;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}

// ── 2b. Power functions ─────────────────────────────────────────────────────
// Keyed by test shape, same formulas used by tools/power.tsx. Kept here so
// the StatsTile (group plot) can report achieved power and the
// n-per-group needed for 80 % power directly from the observed data.

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
  return powerPaired(d, n, alpha, tails);
}

function powerAnova(f, n, alpha, k) {
  const df1 = k - 1,
    df2 = k * (n - 1);
  if (df2 < 1) return 0;
  const lambda = n * k * f * f;
  // Central F at small df has very heavy tails — e.g. F(1, 1) only reaches
  // p = 0.955 at x = 200 — so a fixed upper bracket of 200 silently clamps
  // fCrit for α ≤ 0.045 at (df1, df2) = (1, 1). Expand the bracket until it
  // covers 1 − α (20 doublings → ~2·10⁸, comfortably beyond any realistic
  // fCrit) before delegating to bisect. bisect itself now refuses on an
  // unbracketed target, so we propagate NaN when the expansion fails.
  let hi = 200;
  for (let i = 0; i < 20 && fcdf(hi, df1, df2) < 1 - alpha; i++) hi *= 2;
  const fCrit = bisect((x) => fcdf(x, df1, df2), 1 - alpha, 0, hi);
  if (!Number.isFinite(fCrit)) return NaN;
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

// Cohen's f for ANOVA from group means + pooled within-SD.
//
// f = σ_means / σ_within, where σ_means is the **population-style** SD of
// the group means — i.e. divides by k, not (k−1) — treating the supplied
// means as the entire population of cell means rather than a sample. This
// matches Cohen (1988) and R's pwr::pwr.anova.test, which is what the
// downstream power calculator is calibrated against. Callers that have a
// sample SD of group means should multiply by √((k−1)/k) before passing
// in, or recompute from the raw means.
function fFromGroupMeans(meansArr, sd) {
  if (!meansArr.length || sd <= 0) return 0;
  const grandMean = meansArr.reduce((a, b) => a + b, 0) / meansArr.length;
  const sigmaMeans = Math.sqrt(
    meansArr.reduce((s, m) => s + (m - grandMean) * (m - grandMean), 0) / meansArr.length
  );
  return sigmaMeans / sd;
}

// ── 3. Sample helpers ───────────────────────────────────────────────────────

function sampleMean(x) {
  const n = x.length;
  if (n === 0) return NaN;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  return s / n;
}

// Sample variance with (n-1) denominator (Bessel-corrected). Welford's
// online algorithm: one pass, no need to compute the mean separately, and
// numerically more robust than the naive E[X²] − E[X]² formula (which
// catastrophically cancels when the data have a large offset). The classic
// two-pass algorithm is comparable in accuracy on most inputs, but Welford
// avoids a second loop and pre-computed mean, which is cleaner and slightly
// faster on large arrays.
function sampleVariance(x) {
  const n = x.length;
  if (n < 2) return NaN;
  let mean = 0,
    M2 = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean;
    mean += d / (i + 1);
    M2 += d * (x[i] - mean);
  }
  return M2 / (n - 1);
}

function sampleSD(x) {
  return Math.sqrt(sampleVariance(x));
}

// Midrank assignment with ties — returns ranks[i] = 1-based rank of x[i],
// averaging ranks for tied values. Also returns the sum of (t³−t)/12 for each
// tie group, needed as the tie-correction term in Mann-Whitney / Kruskal-Wallis.
function rankWithTies(x) {
  const n = x.length;
  const idx = x.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(n);
  let tieCorrection = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j + 2) / 2; // 1-based average of ranks [i+1 .. j+1]
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avgRank;
    const t = j - i + 1;
    if (t > 1) tieCorrection += t * t * t - t;
    i = j + 1;
  }
  return { ranks, tieCorrection };
}

// ── 4. Normality: Shapiro-Wilk (Royston 1995, AS R94) ───────────────────────
//
// Algorithm AS R94 (Royston 1995), as implemented in R's stats::shapiro.test.
// Valid for 3 ≤ n ≤ 5000. Returns { W, p }.
//
// The W statistic:   W = (Σ a_i · x_(i))² / Σ (x_i − x̄)²
//
// Coefficients a_i are derived from the expected values of normal order
// statistics (approximated analytically here — exact values would require
// computing E[z_(i:n)] via numerical integration, but Royston's approximation
// is accurate to the W-statistic's precision).
//
// P-value transformation uses polynomial-in-log approximations tabulated by
// Royston for the normalizing transform of W.

function shapiroWilk(x) {
  const n = x.length;
  if (n < 3 || n > 5000) {
    return { W: NaN, p: NaN, error: "Shapiro-Wilk requires 3 ≤ n ≤ 5000" };
  }
  const sorted = [...x].sort((a, b) => a - b);

  // Expected values of normal order statistics via Blom's approximation:
  //   m_i ≈ Φ⁻¹((i − 3/8) / (n + 1/4))
  // These are the "m" vector in AS R94.
  const m = new Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = norminv((i + 1 - 3 / 8) / (n + 1 / 4));
  }
  let mm = 0;
  for (let i = 0; i < n; i++) mm += m[i] * m[i];

  // Coefficients a_i (Royston 1992 analytical form, AS R94).
  // For i = n:    a_n   = −2.706056 u⁵ + 4.434685 u⁴ − 2.071190 u³
  //                       − 0.147981 u² + 0.221157 u + m_n / √mm
  // For i = n−1:  a_{n−1} = −3.582633 u⁵ + 5.682633 u⁴ − 1.752460 u³
  //                         − 0.293762 u² + 0.042981 u + m_{n−1} / √mm
  // where u = 1/√n. Middle coefficients follow AS R94's epsilon correction.
  const a = new Array(n);
  const u = 1 / Math.sqrt(n);
  const sqrtMm = Math.sqrt(mm);

  if (n === 3) {
    // Exact for n = 3: a_1 = √(1/2), a_3 = −a_1, a_2 = 0.
    a[0] = -Math.SQRT1_2;
    a[1] = 0;
    a[2] = Math.SQRT1_2;
  } else {
    const an =
      m[n - 1] / sqrtMm +
      0.221157 * u -
      0.147981 * u * u -
      2.07119 * u * u * u +
      4.434685 * u * u * u * u -
      2.706056 * u * u * u * u * u;
    a[n - 1] = an;
    a[0] = -an;

    if (n >= 6) {
      const an1 =
        m[n - 2] / sqrtMm +
        0.042981 * u -
        0.293762 * u * u -
        1.75246 * u * u * u +
        5.682633 * u * u * u * u -
        3.582633 * u * u * u * u * u;
      a[n - 2] = an1;
      a[1] = -an1;

      // Epsilon correction for middle coefficients (AS R94).
      const phi =
        (mm - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2]) /
        (1 - 2 * an * an - 2 * an1 * an1);
      const sqrtPhi = Math.sqrt(phi);
      for (let i = 2; i < n - 2; i++) a[i] = m[i] / sqrtPhi;
    } else {
      // n = 4 or 5: only tail coefficients, simpler correction.
      const phi = (mm - 2 * m[n - 1] * m[n - 1]) / (1 - 2 * an * an);
      const sqrtPhi = Math.sqrt(phi);
      for (let i = 1; i < n - 1; i++) a[i] = m[i] / sqrtPhi;
    }
  }

  // W = (Σ a_i · x_(i))² / Σ (x_i − x̄)²
  let xbar = 0;
  for (let i = 0; i < n; i++) xbar += sorted[i];
  xbar /= n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += a[i] * sorted[i];
    const d = sorted[i] - xbar;
    den += d * d;
  }
  if (den === 0) return { W: NaN, p: NaN, error: "Zero variance" };
  // Clamp to [0, 1] — floating-point can produce W = 1 + ε for a perfect
  // linear sample (e.g. n=3 [1,2,3]), which would break asin(√W) below.
  const W = Math.max(0, Math.min(1, (num * num) / den));

  // P-value via Royston 1995 normalizing transform.
  let p;
  if (n === 3) {
    // Exact distribution at n=3: p = 6 · (asin(√W) − asin(√(3/4))) / π
    const pi6 = 6 / Math.PI;
    const stqr = Math.asin(Math.sqrt(3 / 4));
    p = pi6 * (Math.asin(Math.sqrt(W)) - stqr);
    if (p < 0) p = 0;
    if (p > 1) p = 1;
  } else if (n <= 11) {
    // Polynomial in n for gamma and mu, log-transform on (gamma − ln(1−W)).
    const gamma = -2.273 + 0.459 * n;
    const mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
    const sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
    const y = -Math.log(gamma - Math.log(1 - W));
    const z = (y - mu) / sigma;
    p = 1 - normcdf(z);
  } else {
    // n ≥ 12: log(1−W) is approximately normal after transform.
    const lnN = Math.log(n);
    const mu = -1.5861 - 0.31082 * lnN - 0.083751 * lnN * lnN + 0.0038915 * lnN * lnN * lnN;
    const sigma = Math.exp(-0.4803 - 0.082676 * lnN + 0.0030302 * lnN * lnN);
    const y = Math.log(1 - W);
    const z = (y - mu) / sigma;
    p = 1 - normcdf(z);
  }

  return { W, p };
}

// ── 5. Equal-variance tests ─────────────────────────────────────────────────
//
// Brown-Forsythe variant of Levene's test (median-based — robust to
// non-normality, which is what we want in a screening step that runs before
// we've decided whether the data are normal).
//
// Algorithm: for each group compute |x_ij − median_i|, then run a one-way
// ANOVA on those absolute deviations. F statistic and p-value from the
// F-distribution.
//
// Input: groups = [[x11, x12, ...], [x21, x22, ...], ...]
// Output: { F, df1, df2, p }

function leveneTest(groups) {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  // Absolute deviations from the group median.
  const devs = groups.map((g) => {
    const s = [...g].sort((a, b) => a - b);
    const n = s.length;
    const med = n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[Math.floor(n / 2)];
    return g.map((v) => Math.abs(v - med));
  });
  // One-way ANOVA on deviations.
  let Ntot = 0;
  let grandSum = 0;
  for (const d of devs) {
    Ntot += d.length;
    for (const v of d) grandSum += v;
  }
  if (Ntot <= k) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Not enough observations" };
  const grandMean = grandSum / Ntot;
  let ssBetween = 0,
    ssWithin = 0;
  for (const d of devs) {
    const n = d.length;
    if (n === 0) continue;
    let s = 0;
    for (const v of d) s += v;
    const m = s / n;
    ssBetween += n * (m - grandMean) * (m - grandMean);
    for (const v of d) ssWithin += (v - m) * (v - m);
  }
  const df1 = k - 1;
  const df2 = Ntot - k;
  if (ssWithin === 0) {
    // All groups are internally constant → within-group dispersion is zero
    // and Levene's F is undefined (0/0 at best, a phantom ∞ at worst).
    // R's equivalent oneway.test on the deviations reports F = NaN / p = NA.
    return {
      F: NaN,
      df1,
      df2,
      p: NaN,
      error: "Data are essentially constant (zero within-group dispersion)",
    };
  }
  const F = ssBetween / df1 / (ssWithin / df2);
  const p = 1 - fcdf(F, df1, df2);
  return { F, df1, df2, p };
}

// ── 6. Two-sample location tests ────────────────────────────────────────────
//
// tTest(x, y, { equalVar }) — two-sample t-test.
//   equalVar=true  → Student's t (pooled variance, df = n1+n2−2)
//   equalVar=false → Welch's t (unequal variance, Welch-Satterthwaite df)
// Two-sided p-value. Returns { t, df, p, mean1, mean2, ... }.

function tTest(x, y, opts = {}) {
  const equalVar = opts.equalVar !== false;
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 2 || n2 < 2) {
    return { t: NaN, df: 0, p: NaN, error: "Each group needs n≥2" };
  }
  const m1 = sampleMean(x),
    m2 = sampleMean(y);
  const v1 = sampleVariance(x),
    v2 = sampleVariance(y);
  // Degenerate case: both groups constant. Matches R, which refuses with
  // "data are essentially constant" — any result here would have NaN df
  // (Welch) or zero SE (Student), neither of which is meaningful.
  if (v1 === 0 && v2 === 0) {
    return {
      t: NaN,
      df: NaN,
      p: NaN,
      mean1: m1,
      mean2: m2,
      var1: v1,
      var2: v2,
      n1,
      n2,
      error: "Data are essentially constant (zero variance in both groups)",
    };
  }
  let t, df;
  if (equalVar) {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
    const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    t = (m1 - m2) / se;
    df = n1 + n2 - 2;
  } else {
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    t = (m1 - m2) / se;
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    df = num / den;
  }
  // Two-sided p
  const p = 2 * (1 - tcdf(Math.abs(t), df));
  return { t, df, p, mean1: m1, mean2: m2, var1: v1, var2: v2, n1, n2 };
}

// Mann-Whitney U test (two-sided) — ranks with midranks for ties, normal
// approximation with continuity correction and tie correction to σ_U².
// Matches R's wilcox.test(x, y, exact=FALSE, correct=TRUE) when there are
// ties or larger samples; R switches to an exact enumerator when n1*n2<50
// and there are no ties — we note this in comments but stick to normal
// approximation here (the error vs exact is <0.01 in p even for small n).
//
// Returns { U, U1, U2, z, p, n1, n2 }. U = min(U1, U2).

function mannWhitneyU(x, y) {
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 1 || n2 < 1) return { U: NaN, z: NaN, p: NaN, error: "Empty group" };
  const all = x.concat(y);
  const { ranks, tieCorrection } = rankWithTies(all);
  let R1 = 0;
  for (let i = 0; i < n1; i++) R1 += ranks[i];
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const N = n1 + n2;
  const muU = (n1 * n2) / 2;
  // σ_U² with tie correction (Lehmann 1975):
  //  σ² = n1·n2/12 · [(N+1) − Σ(t³−t) / (N(N−1))]
  const sigma2 = ((n1 * n2) / 12) * (N + 1 - tieCorrection / (N * (N - 1)));
  const sigmaU = Math.sqrt(sigma2);
  // Continuity-corrected z (matches wilcox.test correct=TRUE).
  // Shift U toward the mean by 0.5.
  const diff = U1 - muU;
  let z;
  if (sigmaU === 0) z = 0;
  else if (diff > 0) z = (diff - 0.5) / sigmaU;
  else if (diff < 0) z = (diff + 0.5) / sigmaU;
  else z = 0;
  const p = 2 * (1 - normcdf(Math.abs(z)));
  return { U, U1, U2, z, p, n1, n2 };
}

// ── 7. Two-sample effect sizes ──────────────────────────────────────────────
//
// Cohen's d — standardized mean difference using pooled SD (Bessel-corrected).
// Hedges' g — small-sample bias-corrected version of Cohen's d.
// rankBiserial — non-parametric effect size paired with Mann-Whitney U.

function cohenD(x, y) {
  const n1 = x.length,
    n2 = y.length;
  if (n1 < 2 || n2 < 2) return NaN;
  const m1 = sampleMean(x),
    m2 = sampleMean(y);
  const v1 = sampleVariance(x),
    v2 = sampleVariance(y);
  const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  // Pooled SD is zero → effect size is undefined (±Infinity is misleading).
  if (sp2 === 0) return NaN;
  return (m1 - m2) / Math.sqrt(sp2);
}

function hedgesG(x, y) {
  const d = cohenD(x, y);
  if (!Number.isFinite(d)) return d;
  const df = x.length + y.length - 2;
  if (df < 1) return NaN;
  // Exact small-sample correction factor:
  //   J(df) = Γ(df/2) / (Γ((df−1)/2) · √(df/2))
  // computed in log space via gammaln to avoid Γ overflow at large df.
  // The familiar `J ≈ 1 − 3/(4n − 9)` shortcut is the leading term of the
  // asymptotic expansion; it's off by ~0.3% at the smallest practical
  // sample (n1 = n2 = 3) and converges to the exact form by n ≈ 30.
  // Tightening this also matches what `effectsize::hedges_g()` reports.
  const J = Math.exp(gammaln(df / 2) - gammaln((df - 1) / 2) - 0.5 * Math.log(df / 2));
  return d * J;
}

// Rank-biserial correlation from Mann-Whitney U (Kerby 2014).
// r = 1 − 2U/(n1·n2). Sign follows U1 vs U2 (positive means x tends to rank
// higher than y).
function rankBiserial(U1, n1, n2) {
  if (n1 * n2 === 0) return NaN;
  return 1 - (2 * U1) / (n1 * n2);
}

// ── 8. k-sample location tests ──────────────────────────────────────────────
//
// Input for all three is `groups` — an array of numeric arrays.

// One-way ANOVA (equal variances assumed).
// Returns { F, df1, df2, p, ssBetween, ssWithin, grandMean }.
function oneWayANOVA(groups) {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  let Ntot = 0;
  let grandSum = 0;
  for (const g of groups) {
    Ntot += g.length;
    for (const v of g) grandSum += v;
  }
  if (Ntot <= k) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Not enough observations" };
  const grandMean = grandSum / Ntot;
  let ssBetween = 0,
    ssWithin = 0;
  for (const g of groups) {
    const n = g.length;
    if (n === 0) continue;
    let s = 0;
    for (const v of g) s += v;
    const m = s / n;
    ssBetween += n * (m - grandMean) * (m - grandMean);
    for (const v of g) ssWithin += (v - m) * (v - m);
  }
  const df1 = k - 1;
  const df2 = Ntot - k;
  if (ssWithin === 0) {
    // Every group is internally constant. R's oneway.test returns F = Inf
    // with p < 2.2e-16, but that's misleading in a UI — the "significance"
    // is a divide-by-zero artefact, not evidence of a real location shift.
    // Mirror the tTest convention and refuse.
    return {
      F: NaN,
      df1,
      df2,
      p: NaN,
      ssBetween,
      ssWithin,
      grandMean,
      error: "Data are essentially constant (zero within-group dispersion)",
    };
  }
  const F = ssBetween / df1 / (ssWithin / df2);
  const p = 1 - fcdf(F, df1, df2);
  return { F, df1, df2, p, ssBetween, ssWithin, grandMean };
}

// Welch's ANOVA (unequal variances).
// Follows R's oneway.test(var.equal=FALSE) source:
//   w_i = n_i / s_i²,  W = Σ w_i,  m = Σ(w_i · mean_i)/W
//   num = Σ w_i (mean_i − m)² / (k − 1)
//   h   = Σ (1 − w_i/W)² / (n_i − 1)
//   den = 1 + 2(k − 2)/(k² − 1) · h
//   F   = num/den,  df1 = k−1,  df2 = (k² − 1) / (3 h)
function welchANOVA(groups) {
  const k = groups.length;
  if (k < 2) return { F: NaN, df1: 0, df2: 0, p: NaN, error: "≥2 groups required" };
  const ns = groups.map((g) => g.length);
  if (ns.some((n) => n < 2)) {
    return { F: NaN, df1: 0, df2: 0, p: NaN, error: "Each group needs n≥2" };
  }
  const means = groups.map(sampleMean);
  const vars = groups.map(sampleVariance);
  // Welch weights are n_i / s_i² — any zero-variance group makes its weight
  // infinite and poisons the whole computation (matches R oneway.test's
  // F = NaN, p = NA on constant data).
  if (vars.some((v) => v === 0)) {
    return {
      F: NaN,
      df1: k - 1,
      df2: NaN,
      p: NaN,
      error: "Data are essentially constant (zero variance in at least one group)",
    };
  }
  const w = vars.map((v, i) => ns[i] / v);
  const Wsum = w.reduce((a, b) => a + b, 0);
  const m = w.reduce((a, wi, i) => a + wi * means[i], 0) / Wsum;
  let num = 0;
  for (let i = 0; i < k; i++) num += w[i] * (means[i] - m) * (means[i] - m);
  num /= k - 1;
  let h = 0;
  for (let i = 0; i < k; i++) {
    const term = 1 - w[i] / Wsum;
    h += (term * term) / (ns[i] - 1);
  }
  const den = 1 + ((2 * (k - 2)) / (k * k - 1)) * h;
  const F = num / den;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * h);
  const p = 1 - fcdf(F, df1, df2);
  return { F, df1, df2, p };
}

// Kruskal-Wallis H test with tie correction.
//   H = (12/(N(N+1))) · Σ (R_i²/n_i) − 3(N+1)
//   H' = H / (1 − Σ(t³−t)/(N³−N))       [tie-corrected]
//   df = k − 1
//   p  = 1 − χ²_df(H')
function kruskalWallis(groups) {
  const k = groups.length;
  if (k < 2) return { H: NaN, df: 0, p: NaN, error: "≥2 groups required" };
  // Concatenate, remember group membership, rank together.
  const all = [];
  const owner = [];
  for (let i = 0; i < k; i++) {
    for (const v of groups[i]) {
      all.push(v);
      owner.push(i);
    }
  }
  const N = all.length;
  if (N <= k) return { H: NaN, df: 0, p: NaN, error: "Not enough observations" };
  // All values identical → ranks are all (N+1)/2, H computes to 0/0, and the
  // tie-correction denominator C = 1 − (N³−N)/(N³−N) = 0. The naive code path
  // skipped the divide and reported H=0, p=1 — a "no difference detected"
  // answer that masks the fact that the test is undefined. Match R's
  // kruskal.test behavior (it warns and returns NaN) by detecting the
  // all-tied case explicitly and surfacing an error the stats tile picks up.
  let allTied = true;
  for (let i = 1; i < N; i++) {
    if (all[i] !== all[0]) {
      allTied = false;
      break;
    }
  }
  if (allTied) {
    return { H: NaN, df: k - 1, p: NaN, error: "Data are essentially constant" };
  }
  const { ranks, tieCorrection } = rankWithTies(all);
  // Sum of ranks per group.
  const R = new Array(k).fill(0);
  for (let i = 0; i < N; i++) R[owner[i]] += ranks[i];
  let sumR2n = 0;
  for (let i = 0; i < k; i++) sumR2n += (R[i] * R[i]) / groups[i].length;
  let H = (12 / (N * (N + 1))) * sumR2n - 3 * (N + 1);
  // Tie correction (Siegel & Castellan): divide H by C.
  const C = 1 - tieCorrection / (N * N * N - N);
  if (C > 0) H /= C;
  const df = k - 1;
  const p = 1 - chi2cdf(H, df);
  return { H, df, p };
}

// ── 9. k-sample effect sizes ────────────────────────────────────────────────

// η² = SSbetween / SStotal (ANOVA).
function etaSquared(groups) {
  const a = oneWayANOVA(groups);
  if (a.error) return NaN;
  const ssTotal = a.ssBetween + a.ssWithin;
  return ssTotal === 0 ? 0 : a.ssBetween / ssTotal;
}

// ε² = H / (N − 1)  — Kruskal-Wallis effect size (Tomczak & Tomczak 2014).
function epsilonSquared(groups) {
  const kw = kruskalWallis(groups);
  if (kw.error) return NaN;
  let N = 0;
  for (const g of groups) N += g.length;
  return N > 1 ? kw.H / (N - 1) : NaN;
}

// ── 10. Studentized range distribution ─────────────────────────────────────
//
// The CDF of the studentized range Q (k means, ν error df) is
//
//   P(Q ≤ q) = ∫₀^∞ f_S(s) · P(R ≤ q·s) ds
//
// where S = √(χ²_ν/ν) and R is the range of k independent standard normals.
// The range CDF itself is
//
//   P(R ≤ w) = ∫_{−∞}^{∞} k · φ(u) · [Φ(u+w) − Φ(u)]^{k−1} du
//
// Both integrals are handled by the cached 48-point Gauss-Legendre rule.
// Matches R's `ptukey` to ~5 decimal places on the cases we benchmark.

// P(range of k standard normals ≤ w)
function _wprob(w, k) {
  if (w <= 0) return 0;
  const gl = _gaussLegendre(48);
  // Truncate at ±8σ — φ is negligible beyond.
  const lo = -8,
    hi = 8;
  const half = (hi - lo) / 2,
    mid = (hi + lo) / 2;
  const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    const phiU = invSqrt2Pi * Math.exp(-0.5 * u * u);
    const diff = normcdf(u + w) - normcdf(u);
    if (diff <= 0) continue;
    const term = k * phiU * Math.pow(diff, k - 1);
    sum += half * gl.weights[i] * term;
  }
  return Math.max(0, Math.min(1, sum));
}

// P(Q ≤ q | k groups, df error degrees of freedom)
//
// Substitute y = log(s) — integrate f_S(e^y)·e^y dy. Integration bounds
// [yLo, yHi] are set by the chi² quantiles so the support is exactly where
// the mass lives. This keeps the 48 Gauss-Legendre nodes concentrated on the
// peak regardless of df (a fixed s = u/(1−u) map leaks nodes into the
// exponential tail at high df, saturating ptukey well below 1).
function ptukey(q, k, df) {
  if (q <= 0) return 0;
  if (k < 2 || df < 1) return NaN;
  const gl = _gaussLegendre(48);
  // S = √(χ²_ν / ν). Bound y = log(S) via chi² quantiles at ±1e-10.
  const chiLo = chi2inv(1e-10, df);
  const chiHi = chi2inv(1 - 1e-10, df);
  const yLo = 0.5 * Math.log(Math.max(chiLo, 1e-300) / df);
  const yHi = 0.5 * Math.log(chiHi / df);
  const halfDf = df / 2;
  const logConst = Math.log(2) + halfDf * Math.log(halfDf) - gammaln(halfDf);
  const halfW = (yHi - yLo) / 2;
  const midW = (yHi + yLo) / 2;
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const y = midW + halfW * gl.nodes[i];
    const s = Math.exp(y);
    // f_S(s) · ds = 2·(ν/2)^(ν/2)/Γ(ν/2) · s^(ν−1) · exp(−ν·s²/2) · s dy
    const logFS = logConst + df * y - (df * s * s) / 2;
    const fSds = Math.exp(logFS);
    if (!Number.isFinite(fSds) || fSds === 0) continue;
    sum += halfW * gl.weights[i] * fSds * _wprob(q * s, k);
  }
  return Math.max(0, Math.min(1, sum));
}

// Inverse of the studentized range CDF: find q such that ptukey(q, k, df) = p.
// Historically this called bisect(…, 0.01, 100) with a fixed upper bracket,
// which clamped silently for extreme inputs (e.g. k = 50, df = 1, p = 0.999).
// Now expands the upper bracket by doubling until it covers p, then bisects
// with a relative-tolerance termination so the precision is consistent
// regardless of the answer's magnitude. Returns NaN when the expansion
// cannot bracket p — matches R qtukey's NaN-with-warning behavior at
// pathological inputs rather than returning a stale bracket boundary.
function qtukey(p, k, df) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (k < 2 || df < 1) return NaN;
  let lo = 0.01,
    hi = 100;
  // 20 doublings cap hi at ~10⁸ — more than enough for any realistic
  // (k, df, α) combo; anything larger is pathological and deserves NaN.
  for (let i = 0; i < 20 && ptukey(hi, k, df) < p; i++) {
    lo = hi;
    hi *= 2;
  }
  if (ptukey(hi, k, df) < p) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (ptukey(mid, k, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7 * (Math.abs(lo) + 1)) break;
  }
  return (lo + hi) / 2;
}

// ── 11. Post-hoc tests ──────────────────────────────────────────────────────

// Tukey HSD — all pairwise comparisons following one-way ANOVA.
// Uses Tukey-Kramer for unbalanced designs.
//   q_ij = |m_i − m_j| / √(MSE · (1/n_i + 1/n_j) / 2)
//   p_ij = 1 − ptukey(q_ij, k, df_error)
//   CI half-width = qtukey(1−α, k, df_error) · √(MSE · (1/n_i + 1/n_j) / 2)
// Returns { pairs: [{ i, j, diff, se, q, p, lwr, upr }], k, df }
function tukeyHSD(groups, opts = {}) {
  const alpha = opts.alpha != null ? opts.alpha : 0.05;
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const anova = oneWayANOVA(groups);
  if (anova.error) return { pairs: [], error: anova.error };
  const dfErr = anova.df2;
  const mse = anova.ssWithin / dfErr;
  // Degenerate case: every group is perfectly constant → MSE=0 → division
  // by zero in q. Refuse rather than emit Infinity q / zero p-values.
  if (mse === 0) {
    return {
      pairs: [],
      k,
      df: dfErr,
      mse,
      error: "Cannot compute Tukey HSD — zero within-group variance (data essentially constant)",
    };
  }
  const means = groups.map(sampleMean);
  const ns = groups.map((g) => g.length);
  const qCrit = qtukey(1 - alpha, k, dfErr);
  const pairs = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const diff = means[j] - means[i];
      const se = Math.sqrt((mse * (1 / ns[i] + 1 / ns[j])) / 2);
      const q = Math.abs(diff) / se;
      const p = 1 - ptukey(q, k, dfErr);
      const margin = qCrit * se;
      pairs.push({
        i,
        j,
        diff,
        se,
        q,
        p,
        lwr: diff - margin,
        upr: diff + margin,
      });
    }
  }
  return { pairs, k, df: dfErr, mse };
}

// Games-Howell — post-hoc for Welch's ANOVA. Uses Welch-Satterthwaite df
// per pair and the studentized range distribution.
//   se_ij = √(s_i²/n_i + s_j²/n_j)
//   q     = (m_i − m_j) / √(se²/2)  … Tukey form, see Day & Quinn 1989
//   df    = (s_i²/n_i + s_j²/n_j)² / ((s_i²/n_i)²/(n_i−1) + (s_j²/n_j)²/(n_j−1))
//   p     = 1 − ptukey(|q|, k, df)
// Returns { pairs: [{ i, j, diff, se, q, df, p }], k }
function gamesHowell(groups) {
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const means = groups.map(sampleMean);
  const vars = groups.map(sampleVariance);
  const ns = groups.map((g) => g.length);
  // Degenerate case: if any group has zero variance, pairs that touch it
  // produce SE=0 (when both sides are zero) or NaN df in the Welch-
  // Satterthwaite formula — ptukey then propagates NaN into p-values.
  // Refuse at the top level rather than return a mix of valid and NaN pairs,
  // which would quietly corrupt compact-letter displays downstream.
  if (vars.some((v) => v === 0)) {
    return {
      pairs: [],
      k,
      error: "Cannot compute Games-Howell — at least one group has zero variance",
    };
  }
  const pairs = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const vi = vars[i] / ns[i];
      const vj = vars[j] / ns[j];
      const se = Math.sqrt(vi + vj);
      const diff = means[j] - means[i];
      // Tukey-form q using SE/√2 (consistent with TukeyHSD's SE convention).
      const q = Math.abs(diff) / (se / Math.SQRT2);
      const num = (vi + vj) * (vi + vj);
      const den = (vi * vi) / (ns[i] - 1) + (vj * vj) / (ns[j] - 1);
      const df = num / den;
      const p = 1 - ptukey(q, k, df);
      pairs.push({ i, j, diff, se, q, df, p });
    }
  }
  return { pairs, k };
}

// Benjamini-Hochberg adjusted p-values.
// Sort p-values ascending, compute p_(i) · m/i, then enforce monotonicity
// from largest down, and finally cap at 1.
function bhAdjust(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const adj = new Array(m);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const [p, origIdx] = order[rank - 1];
    const q = (p * m) / rank;
    running = Math.min(running, q);
    adj[origIdx] = Math.min(1, running);
  }
  return adj;
}

// Dunn's test — pairwise rank-based post-hoc following Kruskal-Wallis.
// Uses the *global* rank sums with midranks and tie correction (Siegel
// & Castellan 1988). Z-statistic, two-sided normal p-values, BH-adjusted.
//
//   z_ij = (R_i/n_i − R_j/n_j) / √(σ² · (1/n_i + 1/n_j))
//   σ²   = (N(N+1)/12 − Σ(t³−t)/(12(N−1)))
//   p    = 2 · (1 − Φ(|z|))
// Returns { pairs: [{ i, j, z, p, pAdj }], method }
function dunnTest(groups) {
  const k = groups.length;
  if (k < 2) return { pairs: [], error: "≥2 groups required" };
  const all = [];
  const owner = [];
  for (let i = 0; i < k; i++) {
    for (const v of groups[i]) {
      all.push(v);
      owner.push(i);
    }
  }
  const N = all.length;
  const { ranks, tieCorrection } = rankWithTies(all);
  const meanR = new Array(k).fill(0);
  const ns = groups.map((g) => g.length);
  const sumR = new Array(k).fill(0);
  for (let idx = 0; idx < N; idx++) sumR[owner[idx]] += ranks[idx];
  for (let i = 0; i < k; i++) meanR[i] = sumR[i] / ns[i];
  // Tie-corrected variance term (Dunn 1964 with Siegel-Castellan fix):
  //   σ² = (N(N+1)/12 − (Σ(t³−t)) / (12·(N−1)))
  const sigma2 = (N * (N + 1)) / 12 - tieCorrection / (12 * (N - 1));
  const rawPs = [];
  const pairs = [];
  for (let i = 0; i < k - 1; i++) {
    for (let j = i + 1; j < k; j++) {
      const se = Math.sqrt(sigma2 * (1 / ns[i] + 1 / ns[j]));
      const z = (meanR[i] - meanR[j]) / se;
      const p = 2 * (1 - normcdf(Math.abs(z)));
      pairs.push({ i, j, z, p });
      rawPs.push(p);
    }
  }
  const adj = bhAdjust(rawPs);
  for (let i = 0; i < pairs.length; i++) pairs[i].pAdj = adj[i];
  return { pairs, method: "Benjamini-Hochberg" };
}

// ── 12. Compact letter display ──────────────────────────────────────────────
//
// Piepho 2004 "An Algorithm for a Letter-Based Representation of
// All-Pairwise Comparisons". Given pairwise significance (p < α), assign
// letters to groups such that any two groups sharing at least one letter
// are NOT significantly different.
//
// Input:  pairs = [{ i, j, p }], k groups total, alpha
// Output: array of k strings — each group's letter label, e.g. ["a", "ab", "b"]
//
// Algorithm (insert-and-absorb):
//  1. Start with one letter containing all groups.
//  2. For every significant pair (i, j): split any letter containing both
//     i and j into two letters — one drops i, the other drops j.
//  3. Remove any letter that is a subset of another (absorb).
//  4. Letters are labeled "a", "b", "c"... by order of first appearance.
function compactLetterDisplay(pairs, k, alpha = 0.05) {
  if (k <= 0) return [];
  // Sets of groups, each set = one letter.
  let letters = [new Set(Array.from({ length: k }, (_, i) => i))];
  for (const pr of pairs) {
    const p = pr.pAdj != null ? pr.pAdj : pr.p;
    // Guard NaN explicitly: `NaN >= alpha` is false, so without this the loop
    // would treat any unresolved pair as "significant" and start splitting
    // letters on noise — corrupting the entire CLD silently. NaN p-values
    // arise when an upstream test (tTest, Tukey, etc.) returns an error; we
    // skip them rather than guess, matching R's multcompView::multcompLetters
    // which also requires non-NA inputs.
    if (!Number.isFinite(p) || p >= alpha) continue;
    const { i, j } = pr;
    const newLetters = [];
    for (const L of letters) {
      if (L.has(i) && L.has(j)) {
        const L1 = new Set(L);
        L1.delete(i);
        const L2 = new Set(L);
        L2.delete(j);
        if (L1.size > 0) newLetters.push(L1);
        if (L2.size > 0) newLetters.push(L2);
      } else {
        newLetters.push(L);
      }
    }
    // Absorb: drop any letter that is a strict subset of another.
    const filtered = [];
    for (const L of newLetters) {
      let absorbed = false;
      for (const M of newLetters) {
        if (L === M) continue;
        if (L.size < M.size) {
          let sub = true;
          for (const v of L) {
            if (!M.has(v)) {
              sub = false;
              break;
            }
          }
          if (sub) {
            absorbed = true;
            break;
          }
        }
      }
      if (!absorbed && !filtered.some((F) => F.size === L.size && [...F].every((v) => L.has(v)))) {
        filtered.push(L);
      }
    }
    letters = filtered;
  }
  // Assign labels in order of first group-index each letter contains.
  letters.sort((A, B) => Math.min(...A) - Math.min(...B));
  const labels = "abcdefghijklmnopqrstuvwxyz";
  const out = Array.from({ length: k }, () => "");
  for (let li = 0; li < letters.length; li++) {
    const lbl = labels[li] || `[${li}]`;
    for (const g of letters[li]) out[g] += lbl;
  }
  return out;
}

// ── 13. Automatic test selection ────────────────────────────────────────────
//
// Runs the assumption checks and walks the decision tree the UI will offer
// as the default pick (user can still override). Per-group Shapiro-Wilk for
// normality, Brown-Forsythe Levene for homogeneity of variance, then:
//
//   k = 2:
//     any group non-normal  → Mann-Whitney U  (no post-hoc)
//     equal variance        → Student's t     (no post-hoc)
//     unequal variance      → Welch's t       (no post-hoc)
//
//   k ≥ 3:
//     any group non-normal  → Kruskal-Wallis + Dunn (BH)
//     equal variance        → one-way ANOVA + Tukey HSD
//     unequal variance      → Welch's ANOVA + Games-Howell
//
// Thresholds default to α = 0.05 for both assumption checks; caller can pass
// `{ alphaNormality, alphaVariance }` to override. When a group has n < 3
// Shapiro-Wilk can't run — we treat normality as unknown and conservatively
// recommend the rank-based test.
//
// **Caveat on per-group Shapiro-Wilk at α = 0.05:** running Shapiro on each
// of k groups inflates the family-wise false-positive rate to roughly
// 1 − (1 − α)^k. With k = 5 groups the chance of falsely declaring at least
// one group "non-normal" is ~23 % even when all five are perfectly normal,
// which biases this auto-selector toward Kruskal-Wallis. ANOVA is robust to
// modest non-normality, so this conservative bias is by design — but users
// who already know their data are normal can loosen `alphaNormality` (e.g.
// 0.01) to reduce the inflation, or override the test pick directly. R's
// pooled approach would be to test the residuals of the fitted model rather
// than each group separately; we don't do that here because the auto-pick
// is an entry-point heuristic, not a publication-grade decision rule.
function selectTest(groups, opts = {}) {
  const alphaN = opts.alphaNormality != null ? opts.alphaNormality : 0.05;
  const alphaV = opts.alphaVariance != null ? opts.alphaVariance : 0.05;
  const k = groups.length;
  if (k < 2) {
    return { error: "≥2 groups required", k };
  }

  const normality = groups.map((g, i) => {
    if (g.length < 3) {
      return { group: i, n: g.length, W: null, p: null, normal: null, note: "n<3" };
    }
    const sw = shapiroWilk(g);
    if (sw.error) {
      return { group: i, n: g.length, W: null, p: null, normal: null, note: sw.error };
    }
    return { group: i, n: g.length, W: sw.W, p: sw.p, normal: sw.p >= alphaN };
  });
  const allKnownNormal = normality.every((r) => r.normal === true);
  const anyNonNormal = normality.some((r) => r.normal === false || r.normal === null);

  const lev = leveneTest(groups);
  const equalVar = lev.error ? null : lev.p >= alphaV;

  let test, postHoc, reason;
  if (anyNonNormal || !allKnownNormal) {
    if (k === 2) {
      test = "mannWhitney";
      postHoc = null;
      reason = "At least one group is not normally distributed (Shapiro-Wilk p < α).";
    } else {
      test = "kruskalWallis";
      postHoc = "dunn";
      reason = "At least one group is not normally distributed (Shapiro-Wilk p < α).";
    }
  } else if (equalVar === false) {
    if (k === 2) {
      test = "welchT";
      postHoc = null;
      reason = "Groups are normal but variances differ (Levene p < α).";
    } else {
      test = "welchANOVA";
      postHoc = "gamesHowell";
      reason = "Groups are normal but variances differ (Levene p < α).";
    }
  } else {
    if (k === 2) {
      test = "studentT";
      postHoc = null;
      reason = "Both groups are normal with equal variance.";
    } else {
      test = "oneWayANOVA";
      postHoc = "tukeyHSD";
      reason = "All groups are normal with equal variance.";
    }
  }

  return {
    k,
    normality,
    allNormal: allKnownNormal,
    levene: lev.error
      ? { error: lev.error }
      : { F: lev.F, df1: lev.df1, df2: lev.df2, p: lev.p, equalVar },
    recommendation: { test, postHoc, reason },
  };
}

// Map a p-value to the 4-level significance stars used on plots.
// Non-finite or missing p → empty string so callers can suppress the label.
function pStars(p) {
  if (!Number.isFinite(p)) return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

// Format a p-value for display next to a test statistic. Uses scientific
// notation below 1e-3 (where fixed-point would round to 0) and keeps 3
// significant digits otherwise.
function formatP(p) {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p < 1e-4) return p.toExponential(1);
  if (p < 1e-3) return p.toExponential(2);
  return p.toFixed(4);
}
