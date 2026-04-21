// Text + R-script report builders for the aequorin stats panel. Pure
// string-builders — no React / DOM dependency — and therefore separately
// testable alongside tools/aequorin/helpers.ts.
//
// Also houses the small formatter helpers the stats panel consumes
// (formatAqStatShort / formatAqResultLine) and the aggregate builders
// (buildAqSetTextBlock / buildAqAggregateReport / buildAqAggregateRScript)
// that the TXT / R download buttons hand raw `enriched` rows to.
// Mirrors tools/boxplot/reports.ts.

export const TEST_LABELS_AQ = {
  studentT: "Student's t-test",
  welchT: "Welch's t-test",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};

export const POSTHOC_LABELS_AQ = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

export const TEST_OPTIONS_AQ_2 = ["studentT", "welchT", "mannWhitney"];
export const TEST_OPTIONS_AQ_K = ["oneWayANOVA", "welchANOVA", "kruskalWallis"];

export const AQ_ERROR_BAR_LABELS = { none: "None", sd: "SD", sem: "SEM", ci95: "95% CI" };

export function formatAqStatShort(testName, res) {
  if (!res || res.error) return "—";
  if (testName === "studentT" || testName === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)}`;
  if (testName === "mannWhitney") return `U = ${res.U.toFixed(1)}`;
  if (testName === "oneWayANOVA" || testName === "welchANOVA")
    return `F(${res.df1}, ${typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2}) = ${res.F.toFixed(3)}`;
  if (testName === "kruskalWallis") return `H(${res.df}) = ${res.H.toFixed(3)}`;
  return "—";
}

export function formatAqResultLine(testName, res) {
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

export function computeAqAnnotationSpec(row, displayMode, showNs) {
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

export function summariseAqNormality(norm) {
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

export function summariseAqEqualVariance(lev) {
  if (!lev || lev.F == null) return "—";
  return lev.equalVar ? "yes" : "no";
}

export function computeAqSummaryText(row, showSummary, errorBarLabel) {
  if (!showSummary || !row || row.skip) return null;
  const { chosenTest, testResult, k, postHocName, rec } = row;
  if (!chosenTest || !testResult || testResult.error) return null;
  const lines = [
    `Normality: ${summariseAqNormality(rec && rec.normality)}`,
    `Equal variance: ${summariseAqEqualVariance(rec && rec.levene)}`,
    `Test: ${TEST_LABELS_AQ[chosenTest] || chosenTest}`,
  ];
  if (k > 2 && postHocName) {
    lines.push(`Post-hoc: ${POSTHOC_LABELS_AQ[postHocName] || postHocName}`);
  }
  if (errorBarLabel) lines.push(`Error bars: ${errorBarLabel}`);
  return lines.join("\n");
}

export function buildAqSetTextBlock(row) {
  const lines = [];
  const names = row.names;
  const values = row.values;
  const res = row.testResult || {};
  lines.push("Groups:");
  for (let i = 0; i < names.length; i++) {
    const vs = values[i];
    const n = vs.length;
    const mean = sampleMean(vs);
    const sd = n > 1 ? sampleSD(vs) : 0;
    const sem = n > 1 ? sd / Math.sqrt(n) : 0;
    const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
    const semStr = n > 1 ? sem.toFixed(3) : "—";
    const ciStr = n > 1 ? `±${ci95.toFixed(3)}` : "—";
    lines.push(
      `  ${names[i]}: n=${n}, mean=${mean.toFixed(3)}, SD=${sd.toFixed(3)}, SEM=${semStr}, 95% CI=${ciStr}`
    );
  }
  lines.push("");
  const rec = row.rec;
  const recTest = rec && rec.recommendation && rec.recommendation.test;
  const reason = rec && rec.recommendation && rec.recommendation.reason;
  lines.push(`Test: ${TEST_LABELS_AQ[row.chosenTest] || row.chosenTest || "—"}`);
  if (reason) lines.push(`Reason: ${reason}`);
  if (res.error) lines.push(`Result: ⚠ ${res.error}`);
  else if (row.chosenTest) lines.push(`Result: ${formatAqResultLine(row.chosenTest, res)}`);
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${TEST_LABELS_AQ[recTest] || recTest})`);
  lines.push("");
  const norm = (rec && rec.normality) || [];
  if (norm.length > 0) {
    const parts = norm.map((r) => {
      const label = names[r.group] || `g${r.group}`;
      const verdict = r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
      return `${label}: ${verdict}`;
    });
    lines.push(`Shapiro-Wilk: ${parts.join("; ")}`);
  }
  const lev = (rec && rec.levene) || {};
  if (lev.F != null)
    lines.push(
      `Levene: F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(3)}, p = ${formatP(lev.p)} → ${lev.equalVar ? "equal variance" : "unequal variance"}`
    );
  if (names.length >= 3 && row.postHocResult && !row.postHocResult.error) {
    lines.push("");
    lines.push(`Post-hoc — ${POSTHOC_LABELS_AQ[row.postHocName] || row.postHocName}:`);
    for (const pr of row.postHocResult.pairs) {
      const p = pr.pAdj != null ? pr.pAdj : pr.p;
      const diff =
        pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? `z=${pr.z.toFixed(3)}` : "—";
      lines.push(`  ${names[pr.i]} vs ${names[pr.j]}: ${diff},  p = ${formatP(p)}  ${pStars(p)}`);
    }
  }
  if (row.powerResult) {
    lines.push("");
    lines.push(
      `Power (target 80%): ${row.powerResult.effectLabel} = ${row.powerResult.effect.toFixed(3)}`
    );
    for (const pr of row.powerResult.rows) {
      const nStr = pr.nForTarget != null ? `${pr.nForTarget} ${row.powerResult.nLabel}` : "> 5000";
      lines.push(`  α=${pr.alpha}: achieved ${(pr.achieved * 100).toFixed(1)}%, need n = ${nStr}`);
    }
    if (row.powerResult.approximate)
      lines.push("  (rank-based test — estimated from parametric analog)");
  }
  lines.push("");
  return lines.join("\n");
}

export function buildAqAggregateReport(rows) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const head = ["Aequorin — statistical analysis", "Generated: " + now, ""];
  return head.join("\n") + rows.map((r) => buildAqSetTextBlock(r)).join("");
}

export function buildAqAggregateRScript(rows) {
  if (!rows.length || typeof buildRScript !== "function") return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Dataviz Toolbox — Aequorin R script export",
    "# Generated: " + now,
    "# -----------------------------------------------------------------------------",
    "",
  ].join("\n");
  const parts = [header];
  for (const row of rows) {
    parts.push(
      buildRScript({
        names: row.names,
        values: row.values,
        recommendation: row.rec,
        chosenTest: row.chosenTest,
        postHocName: row.postHocName,
      })
    );
  }
  return parts.join("\n");
}
