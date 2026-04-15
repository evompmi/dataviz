// shared-r-export.js — plain JS, no JSX
//
// Generates a runnable R script from the StatsTile decision trace so the
// user can paste it into RStudio and reproduce the exact same tests in a
// "real" statistics environment. Closes the "no reproducibility trail"
// gap called out in the README's Scope & limitations section.
//
// Public globals exposed by this file:
//   buildRScript(ctx)             — for data-driven stats (boxplot, aequorin)
//   buildRScriptForPower(state)   — for the power-analysis tool
//   sanitizeRString(s)            — escape " and \ for safe R string inlining
//   formatRNumber(n)              — Number → R literal (uses period decimals,
//                                   NA for non-finite)
//   formatRVector(arr)            — [n] → "c(n1, n2, ...)"
//
// The ctx shape matches _buildStatsReport(ctx) in shared-stats-tile.js so the
// R-script chip can reuse the exact same context object without threading new
// props. Loaded as a regular <script> tag in boxplot.html / aequorin.html /
// power.html so its globals are visible to the compiled tool bundles.

const _R_TEST_LABELS = {
  studentT: "Student's t-test",
  welchT: "Welch's t-test",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};

const _R_POSTHOC_LABELS = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

function sanitizeRString(s) {
  // Escape backslashes first, then double-quotes. Newlines are replaced with
  // a literal space because multi-line factor levels are almost certainly a
  // paste accident and would break the one-line data.frame layout.
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function formatRNumber(n) {
  // JS number → R literal. Period decimals (R expects that); NA for non-finite.
  if (n == null || !Number.isFinite(n)) return "NA";
  return String(n);
}

function formatRVector(arr) {
  return "c(" + arr.map(formatRNumber).join(", ") + ")";
}

// Wrap a long c(...) literal across multiple indented lines so the generated
// script stays readable when group sizes get into the dozens. For short
// vectors (<=perLine entries) we still emit a single line.
function _wrapC(items, perLine) {
  const P = perLine || 8;
  if (items.length <= P) return "c(" + items.join(", ") + ")";
  const lines = [];
  for (let i = 0; i < items.length; i += P) {
    lines.push("    " + items.slice(i, i + P).join(", "));
  }
  return "c(\n" + lines.join(",\n") + "\n  )";
}

// Build a long-format data.frame literal: one row per observation, columns
// `group` (character, re-factored with the tile's display order) and `value`.
function _longFormatDataFrame(names, values, varName) {
  const vn = varName || "df";
  const groupEntries = [];
  const valueEntries = [];
  for (let i = 0; i < names.length; i++) {
    const quoted = '"' + sanitizeRString(names[i]) + '"';
    const vs = values[i] || [];
    for (let j = 0; j < vs.length; j++) {
      groupEntries.push(quoted);
      valueEntries.push(formatRNumber(vs[j]));
    }
  }
  const levels = names.map((n) => '"' + sanitizeRString(n) + '"').join(", ");
  return [
    vn + " <- data.frame(",
    "  group = " + _wrapC(groupEntries) + ",",
    "  value = " + _wrapC(valueEntries) + ",",
    "  stringsAsFactors = FALSE",
    ")",
    vn + "$group <- factor(" + vn + "$group, levels = c(" + levels + "))",
  ].join("\n");
}

// Which R packages does the script require, given the chosen test + post-hoc?
// Levene (car) is always required because the toolbox always runs it as part
// of the assumption check. rstatix is only pulled in when the post-hoc needs
// it. Kept as an array so the header comment can show a single
// install.packages(c(...)) line and a matching library() block.
function _rPackagesFor(postHocName) {
  const pkgs = ["car"];
  if (postHocName === "gamesHowell" || postHocName === "dunn") pkgs.push("rstatix");
  return pkgs;
}

function _headerComment(generated, dataNote) {
  const lines = [
    "# -----------------------------------------------------------------------------",
    "# Dataviz Toolbox — R script export",
    "# Generated: " + generated,
    "#",
    "# This script reproduces the statistical tests run in the browser toolbox.",
    "# Plots are intentionally omitted — regenerate them in ggplot2 from `df` below.",
  ];
  if (dataNote) {
    lines.push("#");
    const noteLines = String(dataNote).split("\n");
    for (let i = 0; i < noteLines.length; i++) lines.push("# " + noteLines[i]);
  }
  lines.push("# -----------------------------------------------------------------------------");
  return lines.join("\n");
}

function _mainTestBlock(chosenTest) {
  const header = "# --- Main test ---------------------------------------------------------------";
  const label = _R_TEST_LABELS[chosenTest] || chosenTest || "—";
  const pickComment = "# Toolbox picked: " + label;
  let call;
  if (chosenTest === "studentT") {
    call = "t.test(value ~ group, data = df, var.equal = TRUE)";
  } else if (chosenTest === "welchT") {
    call = "t.test(value ~ group, data = df, var.equal = FALSE)";
  } else if (chosenTest === "mannWhitney") {
    call = "wilcox.test(value ~ group, data = df, exact = FALSE)";
  } else if (chosenTest === "oneWayANOVA") {
    call = "fit <- aov(value ~ group, data = df)\nsummary(fit)";
  } else if (chosenTest === "welchANOVA") {
    call = "oneway.test(value ~ group, data = df, var.equal = FALSE)";
  } else if (chosenTest === "kruskalWallis") {
    call = "kruskal.test(value ~ group, data = df)";
  } else {
    call = "# (no inferential test was run)";
  }
  return [header, pickComment, call].join("\n");
}

function _postHocBlock(postHocName, k) {
  if (!postHocName || k < 3) return "";
  const header = "# --- Post-hoc ----------------------------------------------------------------";
  const label = _R_POSTHOC_LABELS[postHocName] || postHocName;
  const pickComment = "# Toolbox picked: " + label;
  let call;
  if (postHocName === "tukeyHSD") {
    call = "TukeyHSD(aov(value ~ group, data = df))";
  } else if (postHocName === "gamesHowell") {
    call = "rstatix::games_howell_test(df, value ~ group)";
  } else if (postHocName === "dunn") {
    call = 'rstatix::dunn_test(df, value ~ group, p.adjust.method = "BH")';
  } else {
    call = "# (unknown post-hoc)";
  }
  return [header, pickComment, call].join("\n");
}

function buildRScript(ctx) {
  const names = (ctx && ctx.names) || [];
  const values = (ctx && ctx.values) || [];
  const recommendation = ctx && ctx.recommendation;
  const chosenTest = ctx && ctx.chosenTest;
  const postHocName = ctx && ctx.postHocName;
  const dataNote = ctx && ctx.dataNote;
  const generated = (ctx && ctx.generatedAt) || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const k = names.length;
  const pkgs = _rPackagesFor(postHocName);

  const parts = [];
  parts.push(_headerComment(generated, dataNote));
  parts.push("");
  parts.push("# install.packages(c(" + pkgs.map((p) => '"' + p + '"').join(", ") + "))");
  for (let i = 0; i < pkgs.length; i++) parts.push("library(" + pkgs[i] + ")");
  parts.push("");

  // Data frame. Safe even when k < 2 — the script will still run and the user
  // can inspect/plot the data, it just won't call any inferential test.
  parts.push(_longFormatDataFrame(names, values, "df"));
  parts.push("");

  // Assumption checks mirror what the StatsTile reports: per-group Shapiro-Wilk
  // for normality, then Brown-Forsythe Levene for variance homogeneity.
  parts.push("# --- Assumptions -------------------------------------------------------------");
  parts.push("by(df$value, df$group, shapiro.test)");
  parts.push('car::leveneTest(value ~ group, data = df, center = "median")');
  parts.push("");

  // Main test. If the tile couldn't pick one (k<2 or degenerate data) this
  // still emits a labeled placeholder so the script structure stays consistent.
  parts.push(_mainTestBlock(chosenTest));

  // Post-hoc only when k>=3 AND the chosen test implies one.
  const ph = _postHocBlock(postHocName, k);
  if (ph) {
    parts.push("");
    parts.push(ph);
  }

  // Append the decision-tree rationale as a trailing comment so the reader
  // can see *why* the tile recommended this particular test, not just what
  // ended up running.
  const reason =
    recommendation && recommendation.recommendation && recommendation.recommendation.reason;
  if (reason) {
    parts.push("");
    parts.push("# Decision-tree rationale (from the toolbox):");
    const rLines = String(reason).split("\n");
    for (let i = 0; i < rLines.length; i++) parts.push("#   " + rLines[i]);
  }

  return parts.join("\n") + "\n";
}

// ── Power analysis ─────────────────────────────────────────────────────────
//
// R's pwr package solves for whichever parameter you leave as NULL. The
// Dataviz power tool lets the user pick `solveFor ∈ {"n", "power"}` and then
// computes the missing value — so the generated script sets every *known*
// parameter to its numeric value and omits the one being solved for, which
// causes pwr to solve for it automatically.
//
// The ctx shape mirrors tools/power.tsx's App() state:
//   { testKey, solveFor, es, n, alpha, power, tails, k, df, result }
// where testKey ∈ {"t-ind","t-paired","t-one","anova","chi2","correlation"}
// and solveFor ∈ {"n","power"}. `result` (optional) is the value the JS
// solver produced — embedded as a trailing comment so the R run can be
// cross-checked.

const _R_POWER_TEST_LABELS = {
  "t-ind": "Two-sample t-test (independent)",
  "t-paired": "Paired t-test",
  "t-one": "One-sample t-test",
  anova: "One-way ANOVA",
  chi2: "Chi-square test",
  correlation: "Correlation test",
};

function _tTypeForTestKey(testKey) {
  if (testKey === "t-ind") return "two.sample";
  if (testKey === "t-paired") return "paired";
  if (testKey === "t-one") return "one.sample";
  return null;
}

function _alternativeForTails(tails) {
  return tails === 1 ? "one.sided" : "two.sided";
}

// Emit one argument line like `  n = 30,` or `  n = NULL,  # solve for this`.
// When `solveFor` matches `arg`, the value is replaced with NULL so pwr knows
// this is the unknown — mirrors the R idiom exactly.
function _pwrArg(arg, value, solveFor, annotation) {
  const isSolveTarget =
    (arg === "n" && solveFor === "n") || (arg === "power" && solveFor === "power");
  const rhs = isSolveTarget ? "NULL" : formatRNumber(value);
  const suffix = isSolveTarget ? "  # <- solve for this" : annotation ? "  # " + annotation : "";
  return "  " + arg + " = " + rhs + "," + suffix;
}

function _pwrArgString(arg, value) {
  return "  " + arg + ' = "' + value + '",';
}

function _pwrCallBody(testKey, state) {
  const solveFor = state.solveFor;
  const tTypeArg = _tTypeForTestKey(testKey);
  const lines = [];
  if (testKey === "t-ind" || testKey === "t-paired" || testKey === "t-one") {
    lines.push(_pwrArg("n", state.n, solveFor));
    lines.push(_pwrArg("d", state.es, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
    lines.push(_pwrArgString("type", tTypeArg));
    lines.push(_pwrArgString("alternative", _alternativeForTails(state.tails)));
  } else if (testKey === "anova") {
    lines.push(_pwrArg("k", state.k, solveFor));
    lines.push(_pwrArg("n", state.n, solveFor));
    lines.push(_pwrArg("f", state.es, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
  } else if (testKey === "chi2") {
    lines.push(_pwrArg("w", state.es, solveFor));
    // pwr::pwr.chisq.test uses N (not n) for the total sample size.
    const Ntag = solveFor === "n" ? "NULL" : formatRNumber(state.n);
    const Nsuffix = solveFor === "n" ? "  # <- solve for this" : "";
    lines.push("  N = " + Ntag + "," + Nsuffix);
    lines.push(_pwrArg("df", state.df, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
  } else if (testKey === "correlation") {
    lines.push(_pwrArg("n", state.n, solveFor));
    lines.push(_pwrArg("r", state.es, solveFor));
    lines.push(_pwrArg("sig.level", state.alpha, solveFor));
    lines.push(_pwrArg("power", state.power, solveFor));
    lines.push(_pwrArgString("alternative", _alternativeForTails(state.tails)));
  }
  // Drop the trailing comma from whatever the last non-comment line is so the
  // R call parses cleanly even if we added an inline comment.
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    const commentIdx = ln.indexOf("#");
    const beforeComment = commentIdx >= 0 ? ln.slice(0, commentIdx) : ln;
    // Strip the last comma in the non-comment portion.
    const trimmed = beforeComment.replace(/,\s*$/, " ");
    lines[i] = commentIdx >= 0 ? trimmed + ln.slice(commentIdx) : trimmed.replace(/\s+$/, "");
    break;
  }
  return lines;
}

function _pwrCallName(testKey) {
  if (testKey === "t-ind" || testKey === "t-paired" || testKey === "t-one") {
    return "pwr::pwr.t.test";
  }
  if (testKey === "anova") return "pwr::pwr.anova.test";
  if (testKey === "chi2") return "pwr::pwr.chisq.test";
  if (testKey === "correlation") return "pwr::pwr.r.test";
  return null;
}

function buildRScriptForPower(state) {
  const s = state || {};
  const testKey = s.testKey;
  const call = _pwrCallName(testKey);
  const generated = s.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const lines = [];
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("# Dataviz Toolbox — Power analysis R export");
  lines.push("# Generated: " + generated);
  lines.push("#");
  lines.push("# Test:        " + (_R_POWER_TEST_LABELS[testKey] || testKey || "(unknown)"));
  lines.push(
    "# Solving for: " +
      (s.solveFor === "n"
        ? "sample size (n)"
        : s.solveFor === "power"
          ? "power"
          : s.solveFor || "(unknown)")
  );
  lines.push("#");
  lines.push("# Required package:");
  lines.push('#   install.packages("pwr")');
  lines.push("# -----------------------------------------------------------------------------");
  lines.push("");
  lines.push("library(pwr)");
  lines.push("");

  if (!call) {
    lines.push("# (unknown test id — no pwr call emitted)");
    return lines.join("\n") + "\n";
  }

  lines.push(call + "(");
  const body = _pwrCallBody(testKey, s);
  for (let i = 0; i < body.length; i++) lines.push(body[i]);
  lines.push(")");

  // Trailing sanity-check comment: what did the toolbox report for this
  // configuration? Lets the user eyeball the R output against the JS one.
  if (s.result != null && Number.isFinite(s.result)) {
    lines.push("");
    if (s.solveFor === "n") {
      lines.push("# Toolbox reported: n = " + s.result);
    } else if (s.solveFor === "power") {
      lines.push("# Toolbox reported: power = " + (s.result * 100).toFixed(1) + "%");
    }
  }

  return lines.join("\n") + "\n";
}

// Expose globals for browser consumption. In Node (tests) these live on the
// module scope and the loader helper reads them off the vm context.
if (typeof window !== "undefined") {
  window.buildRScript = buildRScript;
  window.buildRScriptForPower = buildRScriptForPower;
  window.sanitizeRString = sanitizeRString;
  window.formatRNumber = formatRNumber;
  window.formatRVector = formatRVector;
}
