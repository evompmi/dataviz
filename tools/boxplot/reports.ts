// Text + R-script report builders for the boxplot stats panel. Pure
// string-builders — no React / DOM dependency — and therefore separately
// testable alongside tools/boxplot/helpers.ts.

import { TEST_LABELS_BP, POSTHOC_LABELS_BP, formatBpResultLine } from "./helpers";

export function buildBpSetTextBlock(row, setLabel) {
  const lines = [];
  const names = row.names;
  const values = row.values;
  const res = row.testResult || {};
  lines.push("=".repeat(60));
  lines.push(`${setLabel || "Set"}: ${row.name || "—"}`);
  lines.push("=".repeat(60));
  lines.push("");
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
  lines.push(`Test: ${TEST_LABELS_BP[row.chosenTest] || row.chosenTest || "—"}`);
  if (reason) lines.push(`Reason: ${reason}`);
  if (res.error) lines.push(`Result: ⚠ ${res.error}`);
  else if (row.chosenTest) lines.push(`Result: ${formatBpResultLine(row.chosenTest, res)}`);
  if (recTest && recTest !== row.chosenTest)
    lines.push(`  (Toolbox recommended ${TEST_LABELS_BP[recTest] || recTest})`);
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
    lines.push(`Post-hoc — ${POSTHOC_LABELS_BP[row.postHocName] || row.postHocName}:`);
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

export function buildBpAggregateReport(rows, setLabel) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const label = setLabel || "Set";
  const head = [
    "Group Plot — combined statistical analysis",
    "Generated: " + now,
    `${label}${rows.length === 1 ? "" : "s"}: ${rows.length}`,
    "",
  ];
  return head.join("\n") + rows.map((r) => buildBpSetTextBlock(r, label)).join("");
}

export function buildBpAggregateRScript(rows, setLabel) {
  if (!rows.length || typeof buildRScript !== "function") return "";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const label = setLabel || "Set";
  const header = [
    "# -----------------------------------------------------------------------------",
    "# Dataviz Toolbox — Group Plot R script export (combined analysis)",
    "# Generated: " + now,
    `# ${label}${rows.length === 1 ? "" : "s"}: ${rows.length}. Each section redefines df and runs its checks.`,
    "# -----------------------------------------------------------------------------",
    "",
  ].join("\n");
  const parts = [header];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const block = buildRScript({
      names: row.names,
      values: row.values,
      recommendation: row.rec,
      chosenTest: row.chosenTest,
      postHocName: row.postHocName,
      dataNote: `${label}: ${row.name || "—"}`,
    });
    const banner =
      "\n# ==============================================================\n# " +
      `${label}: ${row.name || "—"}` +
      "\n# ==============================================================\n";
    if (i === 0) {
      parts.push(banner + block);
    } else {
      const lines = block.split("\n");
      const dfIdx = lines.findIndex((l) => l.startsWith("df <- data.frame"));
      parts.push(banner + (dfIdx >= 0 ? lines.slice(dfIdx).join("\n") : block));
    }
  }
  return parts.join("\n");
}
