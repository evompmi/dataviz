// Pure stats-routing, formatting, annotation, and summary helpers for the
// boxplot tool. No React / DOM dependency — separately testable
// (tests/helpers/boxplot-loader.js loads this file directly). JSX-bearing
// helpers (stats-summary SVG renderers, BoxplotChart, step components) and
// the big text-block builders (buildBpSetTextBlock / buildBpAggregateReport /
// buildBpAggregateRScript) stay in tools/boxplot.tsx.

// ── Stats summary SVG layout constants ──────────────────────────────────────

export const STATS_LINE_H = 11;
export const STATS_FONT = 8;

export function statsSummaryHeight(summary: string | null): number {
  if (!summary) return 0;
  return summary.split("\n").length * STATS_LINE_H + 14; // 14 = top/bottom padding
}

// ── Test / post-hoc metadata ────────────────────────────────────────────────

export const TEST_LABELS_BP = {
  studentT: "Student's t-test",
  welchT: "Welch's t-test",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};

export const POSTHOC_LABELS_BP = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

export const TEST_OPTIONS_BP_2 = ["studentT", "welchT", "mannWhitney"];
export const TEST_OPTIONS_BP_K = ["oneWayANOVA", "welchANOVA", "kruskalWallis"];

export const ERROR_BAR_LABELS = { none: "None", sd: "SD", sem: "SEM", ci95: "95% CI" };

// ── Run a selected test / post-hoc by name ──────────────────────────────────

export function runBpTest(name, values) {
  try {
    if (name === "studentT") return tTest(values[0], values[1], { equalVar: true });
    if (name === "welchT") return tTest(values[0], values[1], { equalVar: false });
    if (name === "mannWhitney") return mannWhitneyU(values[0], values[1]);
    if (name === "oneWayANOVA") return oneWayANOVA(values);
    if (name === "welchANOVA") return welchANOVA(values);
    if (name === "kruskalWallis") return kruskalWallis(values);
    return { error: "unknown test" };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

export function runBpPostHoc(name, values) {
  try {
    if (name === "tukeyHSD") return tukeyHSD(values);
    if (name === "gamesHowell") return gamesHowell(values);
    if (name === "dunn") return dunnTest(values);
    return null;
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

export function postHocForBpTest(testName) {
  if (testName === "oneWayANOVA") return "tukeyHSD";
  if (testName === "welchANOVA") return "gamesHowell";
  if (testName === "kruskalWallis") return "dunn";
  return null;
}

// ── Result formatting ───────────────────────────────────────────────────────

export function formatBpStatShort(testName, res) {
  if (!res || res.error) return "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${res.U.toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA")
    return `F(${res.df1}, ${typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2}) = ${res.F.toFixed(3)}`;
  if (testName === "kruskalWallis") return `H(${res.df}) = ${res.H.toFixed(3)}`;
  return "—";
}

export function formatBpResultLine(testName, res) {
  if (!res || res.error) return res && res.error ? "⚠ " + res.error : "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "mannWhitney")
    return `U = ${res.U.toFixed(1)},  z = ${res.z.toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA")
    return `F(${res.df1}, ${typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2}) = ${res.F.toFixed(3)},  p = ${formatP(res.p)}`;
  if (testName === "kruskalWallis")
    return `H(${res.df}) = ${res.H.toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

// ── Annotation spec ─────────────────────────────────────────────────────────

// Build the annotation spec the chart consumes, from a row's test / post-hoc
// result. Mirrors StatsTile's logic but driven by panel-level display
// controls rather than per-row toggles.
export function computeBpAnnotationSpec(row, displayMode, showNs) {
  if (displayMode === "none" || !row || row.skip) return null;
  const { k, names, testResult, postHocResult } = row;
  if (k < 2) return null;
  if (k === 2) {
    const p = testResult && !testResult.error ? testResult.p : null;
    if (p == null) return null;
    if (!showNs && p >= 0.05) return null;
    return {
      kind: "brackets",
      pairs: [{ i: 0, j: 1, p, label: pStars(p) }],
      groupNames: names,
    };
  }
  if (!postHocResult || postHocResult.error) return null;
  if (displayMode === "cld") {
    const labels = compactLetterDisplay(postHocResult.pairs, k);
    return { kind: "cld", labels, groupNames: names };
  }
  const pairs = postHocResult.pairs
    .map((pr) => ({ i: pr.i, j: pr.j, p: pr.pAdj != null ? pr.pAdj : pr.p }))
    .map((pr) => ({ ...pr, label: pStars(pr.p) }))
    .filter((pr) => showNs || pr.p < 0.05);
  if (pairs.length === 0) return null;
  return { kind: "brackets", pairs, groupNames: names };
}

// ── Plain-text summaries ────────────────────────────────────────────────────

// Plain-text "print summary below plot" string — a lean four-line recap
// (normality / equal variance / test / post-hoc). Detailed per-pair stats
// live in the TXT / R downloads.
export function summariseNormality(norm) {
  if (!Array.isArray(norm) || norm.length === 0) return "—";
  let hasTrue = false;
  let hasFalse = false;
  for (const r of norm) {
    if (r.normal === true) hasTrue = true;
    else if (r.normal === false) hasFalse = true;
  }
  if (hasFalse) return "no";
  if (hasTrue) return "yes";
  return "—";
}

export function summariseEqualVariance(lev) {
  if (!lev || lev.F == null) return "—";
  return lev.equalVar ? "yes" : "no";
}

export function computeBpSummaryText(row, showSummary, errorBarLabel) {
  if (!showSummary || !row || row.skip) return null;
  const { chosenTest, testResult, k, postHocName, rec } = row;
  if (!chosenTest || !testResult || testResult.error) return null;
  const lines = [
    `Normality: ${summariseNormality(rec && rec.normality)}`,
    `Equal variance: ${summariseEqualVariance(rec && rec.levene)}`,
    `Test: ${TEST_LABELS_BP[chosenTest] || chosenTest}`,
  ];
  if (k > 2 && postHocName) {
    lines.push(`Post-hoc: ${POSTHOC_LABELS_BP[postHocName] || postHocName}`);
  }
  if (errorBarLabel) lines.push(`Error bars: ${errorBarLabel}`);
  return lines.join("\n");
}

// ── Sub-group annotation merge ──────────────────────────────────────────────

export function mergeSubgroupAnnotations(subgroups, flatGroups, perKeySpecs) {
  const total = flatGroups.length;
  const names = flatGroups.map((g) => g.name);
  const cldLabels: Array<string | null> = new Array(total).fill(null);
  const allPairs: any[] = [];
  let hasCld = false;
  let hasBrackets = false;
  for (const sg of subgroups) {
    const spec = perKeySpecs[sg.name];
    if (!spec) continue;
    if (spec.kind === "cld" && spec.labels) {
      hasCld = true;
      spec.labels.forEach((lbl: string, i: number) => {
        cldLabels[sg.startIndex + i] = lbl;
      });
    } else if (spec.kind === "brackets" && spec.pairs) {
      hasBrackets = true;
      for (const pr of spec.pairs) {
        allPairs.push({ ...pr, i: pr.i + sg.startIndex, j: pr.j + sg.startIndex });
      }
    }
  }
  if (!hasCld && !hasBrackets) return null;
  if (hasBrackets && hasCld)
    return { kind: "both", labels: cldLabels, pairs: allPairs, groupNames: names };
  if (hasBrackets) return { kind: "brackets", pairs: allPairs, groupNames: names };
  return { kind: "cld", labels: cldLabels, groupNames: names };
}
