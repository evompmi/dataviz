// Pure calibration, condition-detection, smoothing, and SVG-path helpers for
// the Aequorin tool. No React / DOM dependency — separately testable
// (tests/helpers/aequorin-loader.js loads this file directly). Keep chart
// components and step UI out; they belong in tools/aequorin.tsx.

// ── Calibration defaults ─────────────────────────────────────────────────────

export const DEFAULT_KR = 7;
export const DEFAULT_KTR = 118;
export const DEFAULT_KD = 7;
export const DEFAULT_HILL_N = 3;

// ── Time units ───────────────────────────────────────────────────────────────

export const TIME_UNITS = [
  { key: "ms", label: "milliseconds" },
  { key: "s", label: "seconds" },
  { key: "min", label: "minutes" },
  { key: "h", label: "hours" },
  { key: "d", label: "days" },
  { key: "w", label: "weeks" },
  { key: "mo", label: "months" },
  { key: "yr", label: "years" },
];

export const TO_SECONDS = {
  ms: 0.001,
  s: 1,
  min: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2629800,
  yr: 31557600,
};

export function convertTime(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  return (value * TO_SECONDS[fromUnit]) / TO_SECONDS[toUnit];
}

// ── Formula labels / equations ───────────────────────────────────────────────

export const FORMULA_DEFS = {
  none: {
    label: "No calibration",
    eq: "Raw luminescence values plotted as-is",
  },
  "allen-blinks": {
    label: "Allen & Blinks (1978)",
    eq: "[Ca²⁺] = ((1+Ktr)·f^⅓ − 1) / (Kr·(1−f^⅓))",
  },
  hill: {
    label: "Hill equilibrium",
    eq: "[Ca²⁺] = Kd · (f/(1−f))^⅓  where f = L/ΣL",
  },
  generalized: {
    label: "Generalised Allen & Blinks",
    eq: "[Ca²⁺] = ((1+Ktr)·f^(1/n) − 1) / (Kr·(1−f^(1/n)))",
  },
};

// ── Calibration ──────────────────────────────────────────────────────────────

export function calibrate(headers, data, Kr, Ktr) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal = [];
  for (let r = 0; r < nRows; r++) {
    const row = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const cbrt = Math.cbrt(v / totals[c]);
      const denom = Kr * (1 - cbrt);
      row.push(denom === 0 ? null : ((1 + Ktr) * cbrt - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

// Hill equilibrium: [Ca²⁺] = Kd · (f/(1−f))^(1/3)  where f = L/Ltotal
export function calibrateHill(headers, data, Kd) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal = [];
  for (let r = 0; r < nRows; r++) {
    const row = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const f = v / totals[c];
      if (f >= 1) {
        row.push(null);
        continue;
      }
      row.push(Kd * Math.cbrt(f / (1 - f)));
    }
    cal.push(row);
  }
  return cal;
}

// Generalised Allen & Blinks: adjustable Hill exponent n (standard uses n=3)
export function calibrateGeneralized(headers, data, Kr, Ktr, n) {
  const nCols = headers.length,
    nRows = data.length;
  const totals = new Array(nCols).fill(0);
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++) if (data[r][c] != null) totals[c] += data[r][c];
  const cal = [];
  for (let r = 0; r < nRows; r++) {
    const row = [];
    for (let c = 0; c < nCols; c++) {
      const v = data[r][c];
      if (v == null || v === 0 || totals[c] === 0) {
        row.push(null);
        continue;
      }
      const fn = Math.pow(v / totals[c], 1 / n);
      const denom = Kr * (1 - fn);
      row.push(denom === 0 ? null : ((1 + Ktr) * fn - 1) / denom);
    }
    cal.push(row);
  }
  return cal;
}

export function detectConditions(headers, poolReplicates = true, columnEnabled = null) {
  const nameOcc = {};
  const repNums = headers.map((h) => {
    nameOcc[h] = (nameOcc[h] || 0) + 1;
    return nameOcc[h];
  });
  if (poolReplicates) {
    const pm = {};
    headers.forEach((h, i) => {
      if (columnEnabled && columnEnabled[i] === false) return;
      if (!pm[h]) pm[h] = [];
      pm[h].push(i);
    });
    return Object.entries(pm).map(([name, colIndices], idx) => ({
      prefix: name,
      label: name,
      color: PALETTE[idx % PALETTE.length],
      colIndices,
    }));
  } else {
    return headers
      .map((h, i) => ({ h, i, rep: repNums[i] }))
      .filter(({ i }) => !columnEnabled || columnEnabled[i] !== false)
      .map(({ h, i, rep }, ci) => ({
        prefix: `${h}__col${i}`,
        label: `${h}_rep${rep}`,
        color: PALETTE[ci % PALETTE.length],
        colIndices: [i],
      }));
  }
}

export function smooth(arr, w) {
  if (w <= 0) return arr;
  return arr.map((_, i) => {
    let sum = 0,
      n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) {
      if (arr[j] != null) {
        sum += arr[j];
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

// ── SVG path builders ────────────────────────────────────────────────────────

export function buildAreaD(pts) {
  const valid = pts.filter((p) => p.yHi != null && p.yLo != null);
  if (valid.length < 2) return "";
  const fwd = valid.map((p) => `${p.x.toFixed(2)},${p.yHi.toFixed(2)}`);
  const rev = valid
    .slice()
    .reverse()
    .map((p) => `${p.x.toFixed(2)},${p.yLo.toFixed(2)}`);
  return "M" + fwd.join("L") + "L" + rev.join("L") + "Z";
}

export function buildLineD(pts) {
  const valid = pts.filter((p) => p.y != null);
  if (valid.length < 2) return "";
  return "M" + valid.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L");
}

// ── Chart layout constant ────────────────────────────────────────────────────

export const MARGIN = { top: 20, right: 20, bottom: 48, left: 62 };
