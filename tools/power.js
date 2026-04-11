const { useState, useMemo, useCallback, useRef, useEffect, forwardRef } = React;
function normcdf(x) {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * Math.exp(-0.5 * x * x) * poly;
  return x > 0 ? p : 1 - p;
}
function norminv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239
  ];
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572
  ];
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function gammaln(x) {
  const g = 7;
  const coef = [
    0.9999999999998099,
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9984369578019572e-21,
    15056327351493116e-23
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  x -= 1;
  let a = coef[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betai(a, b, x) {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lnBeta = gammaln(a) + gammaln(b) - gammaln(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return front * betacf(a, b, x) / a;
  }
  return 1 - front * betacf(b, a, 1 - x) / b;
}
function betacf(a, b, x) {
  const maxIter = 200, eps = 3e-14;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
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
function gammainc(a, x) {
  if (x < 0) return 0;
  if (x === 0) return 0;
  if (x > a + 1) return 1 - gammainc_upper(a, x);
  let sum = 1 / a, term = 1 / a;
  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 3e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}
function gammainc_upper(a, x) {
  let f = x + 1 - a, c = 1 / 1e-30, d = 1 / f, h = d;
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
function tcdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? 1 - p : p;
}
function tinv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -50, hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tcdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}
function fcdf(f, d1, d2) {
  if (f <= 0) return 0;
  return betai(d1 / 2, d2 / 2, d1 * f / (d1 * f + d2));
}
function chi2cdf(x, k) {
  if (x <= 0) return 0;
  return gammainc(k / 2, x / 2);
}
function chi2inv(p, k) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0, hi = k + 10 * Math.sqrt(2 * k);
  while (chi2cdf(hi, k) < p) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chi2cdf(mid, k) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}
let _glCache;
function _gaussLegendre(n) {
  if (_glCache && _glCache.n === n) return _glCache;
  const nodes = new Array(n), weights = new Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      let pm12 = 1, p2 = x;
      for (let j = 2; j <= n; j++) {
        const pp = ((2 * j - 1) * x * p2 - (j - 1) * pm12) / j;
        pm12 = p2;
        p2 = pp;
      }
      const dp2 = n * (x * p2 - pm12) / (x * x - 1);
      const dx = p2 / dp2;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    let pm1 = 1, p = x;
    for (let j = 2; j <= n; j++) {
      const pp = ((2 * j - 1) * x * p - (j - 1) * pm1) / j;
      pm1 = p;
      p = pp;
    }
    const dp = n * (x * p - pm1) / (x * x - 1);
    const w = 2 / ((1 - x * x) * dp * dp);
    nodes[i] = -x;
    nodes[n - 1 - i] = x;
    weights[i] = w;
    weights[n - 1 - i] = w;
  }
  return _glCache = { nodes, weights, n };
}
function nctcdf(t, df, delta) {
  if (Math.abs(delta) < 1e-14) return tcdf(t, df);
  const halfDf = df / 2;
  const logC = halfDf * Math.log(2) + gammaln(halfDf);
  const sqrtDf = Math.sqrt(df);
  const uLo = Math.max(0, sqrtDf - 8);
  const uHi = sqrtDf + 8;
  const gl = _gaussLegendre(48);
  const half = (uHi - uLo) / 2, mid = (uHi + uLo) / 2;
  let sum = 0;
  for (let i = 0; i < 48; i++) {
    const u = mid + half * gl.nodes[i];
    if (u <= 0) continue;
    const logH = Math.log(2) + (df - 1) * Math.log(u) - u * u / 2 - logC;
    sum += half * gl.weights[i] * normcdf(t * u / sqrtDf - delta) * Math.exp(logH);
  }
  return Math.max(0, Math.min(1, sum));
}
function ncf_sf(f, d1, d2, lambda) {
  if (f <= 0) return 1;
  if (lambda <= 0) return 1 - fcdf(f, d1, d2);
  const halfLam = lambda / 2;
  const jMode = Math.max(0, Math.floor(halfLam));
  function sfTerm(j) {
    const d1j = d1 + 2 * j;
    return 1 - fcdf(f * d1 / d1j, d1j, d2);
  }
  let logPMode = -halfLam + (jMode > 0 ? jMode * Math.log(halfLam) - gammaln(jMode + 1) : 0);
  let pTerm = Math.exp(logPMode);
  let sum = pTerm * sfTerm(jMode);
  let pUp = pTerm;
  for (let j = jMode + 1; j < jMode + 500; j++) {
    pUp *= halfLam / j;
    const contrib = pUp * sfTerm(j);
    sum += contrib;
    if (j > jMode + 5 && contrib < 1e-14) break;
  }
  let pDown = pTerm;
  for (let j = jMode - 1; j >= 0; j--) {
    pDown *= (j + 1) / halfLam;
    const contrib = pDown * sfTerm(j);
    sum += contrib;
    if (jMode - j > 5 && contrib < 1e-14) break;
  }
  return Math.min(1, Math.max(0, sum));
}
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
function bisect(fn, target, lo, hi, tol = 1e-6, maxIter = 200) {
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < target) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return (lo + hi) / 2;
}
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
  const df1 = k - 1, df2 = k * (n - 1);
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
function dFromMeans(m1, m2, sd) {
  return sd > 0 ? Math.abs(m1 - m2) / sd : 0;
}
function fFromGroupMeans(meansArr, sd) {
  if (!meansArr.length || sd <= 0) return 0;
  const grandMean = meansArr.reduce((a, b) => a + b, 0) / meansArr.length;
  const sigmaMeans = Math.sqrt(
    meansArr.reduce((s, m) => s + (m - grandMean) ** 2, 0) / meansArr.length
  );
  return sigmaMeans / sd;
}
function wFromProportions(observed, expected) {
  if (!observed.length || observed.length !== expected.length) return 0;
  let sum = 0;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] <= 0) return 0;
    sum += (observed[i] - expected[i]) ** 2 / expected[i];
  }
  return Math.sqrt(sum);
}
const TESTS = {
  "t-ind": {
    label: "Two-sample t-test",
    question: "How many subjects per group to detect a difference between two independent groups?",
    nLabel: "n per group",
    power: (es, n, alpha, tails) => powerTwoSample(es, n, alpha, tails),
    effectMax: 3,
    totalN: (n) => n * 2,
    totalLabel: (n) => `Total N = ${n * 2} (${n} per group \xD7 2)`
  },
  "t-paired": {
    label: "Paired t-test",
    question: "How many pairs to detect a difference between matched measurements?",
    nLabel: "n (pairs)",
    power: (es, n, alpha, tails) => powerPaired(es, n, alpha, tails),
    effectMax: 3
  },
  "t-one": {
    label: "One-sample t-test",
    question: "How many observations to detect a deviation from a known reference value?",
    nLabel: "n",
    power: (es, n, alpha, tails) => powerOneSample(es, n, alpha, tails),
    effectMax: 3
  },
  anova: {
    label: "One-way ANOVA",
    question: "How many subjects per group to detect differences among k group means?",
    nLabel: "n per group",
    hasGroups: true,
    power: (es, n, alpha, _tails, k) => powerAnova(es, n, alpha, k),
    effectMax: 2,
    totalN: (n, k) => n * k,
    totalLabel: (n, k) => `Total N = ${n * k} (${n} per group \xD7 ${k} groups)`
  },
  correlation: {
    label: "Correlation",
    question: "How many observations to detect a non-zero Pearson correlation?",
    nLabel: "n (total)",
    power: (es, n, alpha, tails) => powerCorrelation(es, n, alpha, tails),
    effectMax: 0.99,
    minN: 4
  },
  chi2: {
    label: "Chi-square test",
    question: "How many observations for a goodness-of-fit or independence test?",
    nLabel: "n (total)",
    hasDf: true,
    power: (es, n, alpha, _tails, _k, df) => powerChi2(es, n, alpha, df),
    effectMax: 1
  }
};
function EffectSizePanel({ testKey, effectSize, onEffectChange, disabled }) {
  const [mode, setMode] = useState("helper");
  const [mean1, setMean1] = useState("");
  const [mean2, setMean2] = useState("");
  const [sd, setSd] = useState("");
  const [diffMean, setDiffMean] = useState("");
  const [diffSd, setDiffSd] = useState("");
  const [groupMeansStr, setGroupMeansStr] = useState("");
  const [withinSd, setWithinSd] = useState("");
  const [expectedStr, setExpectedStr] = useState("");
  const [observedStr, setObservedStr] = useState("");
  const inputStyle = { ...inpN, width: "100%", textAlign: "left" };
  const smallLabel = { fontSize: 11, color: "#666", marginBottom: 2 };
  const note = { fontSize: 10, color: "#999", marginTop: 2 };
  function parseProportions(str) {
    if (!str.trim()) return [];
    let parts;
    if (str.includes(":")) {
      parts = str.split(":").map((s) => parseFloat(s.trim())).filter((v) => !isNaN(v) && v >= 0);
    } else {
      parts = str.split(",").map((s) => parseFloat(s.trim())).filter((v) => !isNaN(v) && v >= 0);
    }
    const sum = parts.reduce((a, b) => a + b, 0);
    return sum > 0 ? parts.map((p) => p / sum) : [];
  }
  const computeFromHelper = useCallback(() => {
    if (testKey === "t-ind") {
      const m1 = parseFloat(mean1), m2 = parseFloat(mean2), s = parseFloat(sd);
      if (!isNaN(m1) && !isNaN(m2) && !isNaN(s) && s > 0) {
        onEffectChange(dFromMeans(m1, m2, s).toFixed(4));
      }
    } else if (testKey === "t-paired" || testKey === "t-one") {
      const dm = parseFloat(diffMean), ds = parseFloat(diffSd);
      if (!isNaN(dm) && !isNaN(ds) && ds > 0) {
        onEffectChange((Math.abs(dm) / ds).toFixed(4));
      }
    } else if (testKey === "anova") {
      const means = groupMeansStr.split(",").map((s) => parseFloat(s.trim())).filter((v) => !isNaN(v));
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
    onEffectChange
  ]);
  const computedD = parseFloat(effectSize);
  const sizeLabel = testKey === "correlation" ? computedD < 0.1 ? "" : computedD < 0.3 ? "small" : computedD < 0.5 ? "medium" : "large" : testKey === "anova" ? computedD < 0.1 ? "" : computedD < 0.25 ? "small" : computedD < 0.4 ? "medium" : "large" : testKey === "chi2" ? computedD < 0.1 ? "" : computedD < 0.3 ? "small" : computedD < 0.5 ? "medium" : "large" : computedD < 0.2 ? "" : computedD < 0.5 ? "small" : computedD < 0.8 ? "medium" : "large";
  const sizeColor = sizeLabel === "small" ? "#009E73" : sizeLabel === "medium" ? "#E69F00" : sizeLabel === "large" ? "#D55E00" : "#999";
  if (testKey === "correlation") {
    return /* @__PURE__ */ React.createElement("div", { style: { opacity: disabled ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Expected correlation |r|"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0.01",
        max: "0.99",
        step: "0.05",
        value: effectSize,
        onChange: (e) => onEffectChange(e.target.value),
        disabled,
        style: inputStyle
      }
    ), sizeLabel && /* @__PURE__ */ React.createElement("div", { style: { ...note, color: sizeColor, fontWeight: 600 } }, sizeLabel, " effect"), /* @__PURE__ */ React.createElement("div", { style: note }, "How strong a linear relationship do you expect?"));
  }
  return /* @__PURE__ */ React.createElement("div", { style: { opacity: disabled ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 6 } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        padding: "5px 8px",
        borderRadius: 4,
        fontSize: 11,
        cursor: "pointer",
        background: mode === "helper" ? "#648FFF" : "#eee",
        color: mode === "helper" ? "#fff" : "#666",
        fontWeight: mode === "helper" ? 700 : 400,
        flex: 1,
        textAlign: "center",
        boxSizing: "border-box"
      },
      onClick: () => setMode("helper")
    },
    "From my data"
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        padding: "5px 8px",
        borderRadius: 4,
        fontSize: 11,
        cursor: "pointer",
        background: mode === "direct" ? "#648FFF" : "#eee",
        color: mode === "direct" ? "#fff" : "#666",
        fontWeight: mode === "direct" ? 700 : 400,
        flex: 1,
        textAlign: "center",
        boxSizing: "border-box"
      },
      onClick: () => setMode("direct")
    },
    "Direct value"
  )), mode === "helper" && testKey === "t-ind" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Expected mean \u2014 group 1"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: mean1,
      onChange: (e) => setMean1(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 15.2"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Expected mean \u2014 group 2"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: mean2,
      onChange: (e) => setMean2(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 12.8"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Common standard deviation"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      min: "0",
      value: sd,
      onChange: (e) => setSd(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 4.5"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: computeFromHelper,
      disabled,
      style: { ...btnPrimary, fontSize: 12, padding: "5px 10px" }
    },
    "Compute effect size"
  ), /* @__PURE__ */ React.createElement("div", { style: note }, "Use pilot data or literature values. The SD should be the pooled within-group SD.")), mode === "helper" && (testKey === "t-paired" || testKey === "t-one") && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, testKey === "t-paired" ? "Expected mean difference" : "Expected deviation from reference"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: diffMean,
      onChange: (e) => setDiffMean(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 2.5"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, testKey === "t-paired" ? "SD of paired differences" : "Standard deviation"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      min: "0",
      value: diffSd,
      onChange: (e) => setDiffSd(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 5.0"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: computeFromHelper,
      disabled,
      style: { ...btnPrimary, fontSize: 12, padding: "5px 10px" }
    },
    "Compute effect size"
  )), mode === "helper" && testKey === "anova" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Expected group means (comma-separated)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: groupMeansStr,
      onChange: (e) => setGroupMeansStr(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 10, 12, 15"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Within-group standard deviation"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      min: "0",
      value: withinSd,
      onChange: (e) => setWithinSd(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 4.0"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: computeFromHelper,
      disabled,
      style: { ...btnPrimary, fontSize: 12, padding: "5px 10px" }
    },
    "Compute effect size"
  ), /* @__PURE__ */ React.createElement("div", { style: note }, "Enter the means you expect for each treatment group, and the common within-group SD (from pilot data or literature).")), mode === "helper" && testKey === "chi2" && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Baseline proportions (what the theory predicts)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: expectedStr,
      onChange: (e) => setExpectedStr(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 3:1 or 0.75, 0.25"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, "Actual proportions (what you think is really happening)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: observedStr,
      onChange: (e) => setObservedStr(e.target.value),
      disabled,
      style: inputStyle,
      placeholder: "e.g. 2:1 or 0.67, 0.33"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: computeFromHelper,
      disabled,
      style: { ...btnPrimary, fontSize: 12, padding: "5px 10px" }
    },
    "Compute effect size"
  ), /* @__PURE__ */ React.createElement("div", { style: note }, "Use ratios (3:1) or proportions (0.75, 0.25). Common for Mendelian segregation tests.")), mode === "direct" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: smallLabel }, testKey === "anova" ? "Effect size (f)" : testKey === "chi2" ? "Effect size (w)" : "Effect size (d)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0.01",
      step: "0.1",
      value: effectSize,
      onChange: (e) => onEffectChange(e.target.value),
      disabled,
      style: inputStyle
    }
  ), /* @__PURE__ */ React.createElement("div", { style: note }, testKey === "anova" ? "f = SD of group means / within-group SD" : testKey === "chi2" ? "w = \u221A(\u03A3 (p_obs \u2212 p_exp)\xB2 / p_exp)" : "d = |difference in means| / pooled SD")), effectSize && parseFloat(effectSize) > 0 && /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        marginTop: 6,
        padding: "6px 10px",
        background: "#f0f7ff",
        borderRadius: 6,
        border: "1px solid #d0e0f0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#333" } }, "Effect size = ", /* @__PURE__ */ React.createElement("b", null, parseFloat(effectSize).toFixed(3))),
    sizeLabel && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 600, color: sizeColor } }, sizeLabel)
  ));
}
const PowerCurve = forwardRef(function PowerCurve2({ testKey, powerFn, params, solveFor, result }, ref) {
  const test = TESTS[testKey];
  if (!test) return null;
  const VBW = 520, VBH = 320;
  const M = { top: 30, right: 20, bottom: 50, left: 55 };
  const w = VBW - M.left - M.right;
  const h = VBH - M.top - M.bottom;
  const { es, n, alpha, tails, k, df } = params;
  const minN = test.minN || 2;
  const maxN = Math.max(200, result && solveFor === "n" ? result * 2.5 : 200);
  const xRange = [minN, Math.ceil(maxN)];
  const curvePoints = [];
  for (let i = 0; i <= 100; i++) {
    const xn = xRange[0] + (xRange[1] - xRange[0]) * i / 100;
    const ni = Math.max(minN, Math.round(xn));
    const pw = powerFn(es, ni, alpha, tails, k, df);
    curvePoints.push({ x: ni, y: Math.min(1, Math.max(0, pw)) });
  }
  const sx = (v) => M.left + (v - xRange[0]) / (xRange[1] - xRange[0]) * w;
  const sy = (v) => M.top + (1 - v) * h;
  const pathD = curvePoints.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const xTicks = makeTicks(xRange[0], xRange[1], 6);
  let marker = null;
  if (result != null && isFinite(result) && solveFor === "n") {
    const my = powerFn(es, Math.round(result), alpha, tails, k, df);
    marker = { x: sx(result), y: sy(Math.min(1, Math.max(0, my))) };
  } else if (result != null && isFinite(result) && solveFor === "power") {
    marker = { x: sx(n), y: sy(Math.min(1, Math.max(0, result))) };
  }
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      ref,
      viewBox: `0 0 ${VBW} ${VBH}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": "Power curve"
    },
    /* @__PURE__ */ React.createElement("title", null, "Power curve"),
    /* @__PURE__ */ React.createElement("desc", null, "Statistical power as a function of sample size"),
    /* @__PURE__ */ React.createElement("rect", { x: M.left, y: M.top, width: w, height: h, fill: "#fafafa" }),
    yTicks.map((t) => /* @__PURE__ */ React.createElement(
      "line",
      {
        key: `yg${t}`,
        x1: M.left,
        x2: M.left + w,
        y1: sy(t),
        y2: sy(t),
        stroke: "#e8e8e8",
        strokeWidth: "0.5"
      }
    )),
    /* @__PURE__ */ React.createElement(
      "line",
      {
        x1: M.left,
        x2: M.left + w,
        y1: sy(0.8),
        y2: sy(0.8),
        stroke: "#D55E00",
        strokeWidth: "1",
        strokeDasharray: "6,3",
        opacity: "0.6"
      }
    ),
    /* @__PURE__ */ React.createElement("text", { x: M.left + w + 3, y: sy(0.8) + 3, fontSize: "9", fill: "#D55E00", fontFamily: "sans-serif" }, "0.80"),
    /* @__PURE__ */ React.createElement("path", { d: pathD, fill: "none", stroke: "#0072B2", strokeWidth: "2.5", strokeLinejoin: "round" }),
    marker && /* @__PURE__ */ React.createElement("g", null, /* @__PURE__ */ React.createElement(
      "line",
      {
        x1: marker.x,
        x2: marker.x,
        y1: M.top,
        y2: M.top + h,
        stroke: "#E69F00",
        strokeWidth: "1",
        strokeDasharray: "4,2"
      }
    ), /* @__PURE__ */ React.createElement(
      "circle",
      {
        cx: marker.x,
        cy: marker.y,
        r: "5",
        fill: "#E69F00",
        stroke: "#fff",
        strokeWidth: "1.5"
      }
    )),
    /* @__PURE__ */ React.createElement("rect", { x: M.left, y: M.top, width: w, height: h, fill: "none", stroke: "#333", strokeWidth: "1" }),
    yTicks.map((t) => /* @__PURE__ */ React.createElement(
      "text",
      {
        key: `yl${t}`,
        x: M.left - 8,
        y: sy(t) + 4,
        textAnchor: "end",
        fontSize: "11",
        fill: "#555",
        fontFamily: "sans-serif"
      },
      t.toFixed(1)
    )),
    /* @__PURE__ */ React.createElement(
      "text",
      {
        x: 14,
        y: M.top + h / 2,
        textAnchor: "middle",
        fontSize: "12",
        fill: "#333",
        fontFamily: "sans-serif",
        transform: `rotate(-90,14,${M.top + h / 2})`
      },
      "Power (1 \u2212 \u03B2)"
    ),
    xTicks.map((t) => /* @__PURE__ */ React.createElement(
      "text",
      {
        key: `xl${t}`,
        x: sx(t),
        y: M.top + h + 18,
        textAnchor: "middle",
        fontSize: "11",
        fill: "#555",
        fontFamily: "sans-serif"
      },
      Math.round(t)
    )),
    /* @__PURE__ */ React.createElement(
      "text",
      {
        x: M.left + w / 2,
        y: VBH - 6,
        textAnchor: "middle",
        fontSize: "12",
        fill: "#333",
        fontFamily: "sans-serif"
      },
      test.nLabel
    )
  );
});
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
  const resultRef = useRef();
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
          bisect((ni) => pw(es, Math.max(minN, Math.round(ni))), power, minN, 1e5, 0.5)
        );
      }
      if (solveFor === "power") {
        if (es <= 0 || n < minN || alpha <= 0 || alpha >= 1) return null;
        return pw(es, n);
      }
    } catch (e) {
      return null;
    }
    return null;
  }, [testKey, solveFor, es, n, alpha, power, tails, k, df]);
  const resultText = useMemo(() => {
    if (result == null) return "\u2014";
    if (solveFor === "n") return `${result}`;
    if (solveFor === "power") return `${(result * 100).toFixed(1)}%`;
    return "\u2014";
  }, [result, solveFor]);
  const resultLabel = {
    n: `Required ${test.nLabel}`,
    power: "Statistical power"
  }[solveFor];
  useEffect(() => {
    if (prevResultRef.current !== void 0 && result !== prevResultRef.current && result != null) {
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
    boxSizing: "border-box"
  });
  return /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 960, margin: "0 auto", padding: "32px 24px" } }, /* @__PURE__ */ React.createElement(
    PageHeader,
    {
      title: "Power Analysis",
      icon: toolIcon("power"),
      subtitle: "Validated to within \xB10.5% of R pwr package output"
    }
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      style: { ...sec, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #0072B2" }
    },
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: "#333", lineHeight: 1.5 } }, test.question)
  ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, marginBottom: 6, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, flex: 1, minWidth: 200 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Statistical test"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: testKey,
      onChange: handleTestChange,
      style: { ...selStyle, width: "100%" }
    },
    Object.entries(TESTS).map(([key, t]) => /* @__PURE__ */ React.createElement("option", { key, value: key }, t.label))
  )), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, flex: 1, minWidth: 200 } }, /* @__PURE__ */ React.createElement("div", { style: { ...lbl, marginBottom: 6 } }, "What do you need to find?"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } }, [
    ["n", "Sample size"],
    ["power", "Power"]
  ].map(([key, label]) => /* @__PURE__ */ React.createElement("div", { key, style: chipStyle(solveFor === key), onClick: () => setSolveFor(key) }, label))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: { width: 328, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }
    },
    /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { ...lbl, marginBottom: 6 } }, "Expected effect size"), /* @__PURE__ */ React.createElement(
      EffectSizePanel,
      {
        testKey,
        effectSize,
        onEffectChange: setEffectSize,
        disabled: solveFor === "effect"
      }
    )),
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          ...sec,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flex: 1
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { opacity: solveFor === "n" ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, test.nLabel), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "number",
          min: "2",
          step: "1",
          value: nInput,
          onChange: (e) => setNInput(e.target.value),
          disabled: solveFor === "n",
          style: inputStyle
        }
      )),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Significance level (\u03B1)"), /* @__PURE__ */ React.createElement(
        "select",
        {
          value: alphaInput,
          onChange: (e) => setAlphaInput(e.target.value),
          style: { ...selStyle, width: "100%" }
        },
        /* @__PURE__ */ React.createElement("option", { value: "0.10" }, "0.10"),
        /* @__PURE__ */ React.createElement("option", { value: "0.05" }, "0.05"),
        /* @__PURE__ */ React.createElement("option", { value: "0.01" }, "0.01"),
        /* @__PURE__ */ React.createElement("option", { value: "0.001" }, "0.001")
      )),
      /* @__PURE__ */ React.createElement("div", { style: { opacity: solveFor === "power" ? 0.4 : 1 } }, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Desired power (1 \u2212 \u03B2)"), /* @__PURE__ */ React.createElement(
        "select",
        {
          value: powerInput,
          onChange: (e) => setPowerInput(e.target.value),
          disabled: solveFor === "power",
          style: { ...selStyle, width: "100%" }
        },
        /* @__PURE__ */ React.createElement("option", { value: "0.70" }, "0.70"),
        /* @__PURE__ */ React.createElement("option", { value: "0.80" }, "0.80 (standard)"),
        /* @__PURE__ */ React.createElement("option", { value: "0.90" }, "0.90"),
        /* @__PURE__ */ React.createElement("option", { value: "0.95" }, "0.95")
      )),
      testKey !== "anova" && testKey !== "chi2" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Direction of the test"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, [
        [2, "Two-sided"],
        [1, "One-sided"]
      ].map(([t, label]) => /* @__PURE__ */ React.createElement("div", { key: t, style: chipStyle(tails === t), onClick: () => setTails(t) }, label))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#999", marginTop: 4 } }, "Two-sided: the difference could go either way. One-sided: you expect a specific direction.")),
      test.hasGroups && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Number of groups"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "number",
          min: "2",
          max: "20",
          step: "1",
          value: kInput,
          onChange: (e) => setKInput(e.target.value),
          style: inputStyle
        }
      )),
      test.hasDf && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: lbl }, "Degrees of freedom"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "number",
          min: "1",
          max: "100",
          step: "1",
          value: dfInput,
          onChange: (e) => setDfInput(e.target.value),
          style: inputStyle
        }
      ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#999", marginTop: 2 } }, "Goodness-of-fit: categories \u2212 1.", /* @__PURE__ */ React.createElement("br", null), "Independence: (rows\u22121)(cols\u22121)."))
    )
  ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 360, display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, flex: 1 } }, /* @__PURE__ */ React.createElement(
    PowerCurve,
    {
      testKey,
      powerFn: test.power,
      params: { es, n, alpha, tails, k, df },
      solveFor,
      result
    }
  )), /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        ...sec,
        padding: 16,
        textAlign: "center",
        background: resultFlash ? "#d4edda" : sec.background || "#fff",
        transition: "background 0.3s ease"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#777", marginBottom: 4 } }, resultLabel),
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          fontSize: 36,
          fontWeight: 700,
          color: result != null ? "#0072B2" : "#ccc",
          fontFamily: "monospace"
        }
      },
      resultText
    ),
    solveFor === "n" && result != null && test.totalLabel && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#888", marginTop: 4 } }, test.totalLabel(result, k))
  ))), /* @__PURE__ */ React.createElement("div", { style: { ...sec, padding: 12, marginTop: 10 } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color: "#555",
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: "0.5px"
      }
    },
    "What do these numbers mean?"
  ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#555", lineHeight: 1.7 } }, /* @__PURE__ */ React.createElement("b", null, "Power"), " is the probability that you will correctly reject the null hypothesis (i.e. to claim a result is significant). A power of 0.80 (the dashed line) means an 80% chance of success \u2014 this is the standard minimum. Higher is better but costs more subjects.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("b", null, "Significance level (\u03B1)"), " is the risk of a false positive \u2014 concluding there is an effect when there is none. The standard \u03B1\xA0=\xA00.05 means you accept a 5% chance of a false alarm. Lowering \u03B1 (e.g. to 0.01) makes you more conservative but requires more subjects to keep power high.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("b", null, "Sample size (", test.nLabel, ")"), " is the number of observations you need to collect. More subjects give you more power to detect a given effect.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("b", null, "Effect size"), ' measures how large the real difference or relationship is, scaled by variability. Use the "From my data" tab to compute it from values you expect (e.g. group means and standard deviation from pilot data or published studies).', testKey === "t-ind" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For a ", /* @__PURE__ */ React.createElement("b", null, "two-sample t-test"), ", the effect size (Cohen's d) is the difference between the two group means divided by their common standard deviation. A d of 0.2 is small, 0.5 is medium, and 0.8 is large."), testKey === "t-paired" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For a ", /* @__PURE__ */ React.createElement("b", null, "paired t-test"), ", the effect size (Cohen's d) is the expected mean of the paired differences divided by the standard deviation of those differences."), testKey === "t-one" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For a ", /* @__PURE__ */ React.createElement("b", null, "one-sample t-test"), ", the effect size (Cohen's d) is how far the true mean deviates from the reference value, divided by the standard deviation."), testKey === "anova" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For ", /* @__PURE__ */ React.createElement("b", null, "ANOVA"), ", the effect size (Cohen's f) captures how spread out the group means are relative to within-group variability. An f of 0.10 is small, 0.25 is medium, and 0.40 is large."), testKey === "correlation" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For ", /* @__PURE__ */ React.createElement("b", null, "correlation"), ", the effect size is simply the expected Pearson r. An r of 0.1 is small, 0.3 is medium, and 0.5 is large."), testKey === "chi2" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "For a ", /* @__PURE__ */ React.createElement("b", null, "chi-square test"), ", the effect size (Cohen's w) measures how far the observed category proportions deviate from expected. A w of 0.1 is small, 0.3 is medium, and 0.5 is large.", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("br", null), "Degrees of freedom:", /* @__PURE__ */ React.createElement("br", null), "\u2022 Goodness-of-fit: ", /* @__PURE__ */ React.createElement("b", null, "df = categories \u2212 1"), /* @__PURE__ */ React.createElement("br", null), "\u2022 Independence: ", /* @__PURE__ */ React.createElement("b", null, "df = (rows \u2212 1) \xD7 (cols \u2212 1)")))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
