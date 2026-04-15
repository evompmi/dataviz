const { suite, test, assert, eq, summary } = require("./harness");
const {
  buildRScript,
  buildRScriptForPower,
  sanitizeRString,
  formatRNumber,
  formatRVector,
} = require("./helpers/r-export-loader");

// Build a minimal ctx for a two-group or three-group scenario. Shapes match
// what shared-stats-tile.js feeds into _buildStatsReport(ctx).
function ctxTwoGroups(chosenTest, opts) {
  opts = opts || {};
  return {
    names: opts.names || ["Control", "Treatment"],
    values: opts.values || [
      [1, 2, 3, 4, 5],
      [3, 5, 7, 9, 11],
    ],
    recommendation: {
      recommendation: { test: chosenTest, reason: "mock reason" },
    },
    chosenTest,
    postHocName: null,
    generatedAt: "2026-04-15T00:00:00Z",
    dataNote: opts.dataNote,
  };
}

function ctxThreeGroups(chosenTest, postHocName) {
  return {
    names: ["A", "B", "C"],
    values: [
      [1, 2, 3, 4],
      [2, 4, 6, 8],
      [3, 6, 9, 12],
    ],
    recommendation: {
      recommendation: { test: chosenTest, reason: "mock reason" },
    },
    chosenTest,
    postHocName,
    generatedAt: "2026-04-15T00:00:00Z",
  };
}

// ── sanitizeRString ────────────────────────────────────────────────────────
suite("shared-r-export.js — sanitizeRString");

test("escapes double quotes", () => {
  eq(sanitizeRString('a "quoted" word'), 'a \\"quoted\\" word');
});

test("escapes backslashes", () => {
  eq(sanitizeRString("path\\to\\file"), "path\\\\to\\\\file");
});

test("escapes backslashes before quotes (order matters)", () => {
  // Input: one backslash then one quote. After backslash-escape: "\\\""
  // If the replacements ran in the wrong order, the doubled \ would re-escape
  // an escaped quote and corrupt the literal.
  eq(sanitizeRString('\\"'), '\\\\\\"');
});

test("replaces newlines with spaces", () => {
  eq(sanitizeRString("line\nbreak"), "line break");
});

test("is idempotent on plain strings", () => {
  eq(sanitizeRString("Control"), "Control");
  eq(sanitizeRString("group with spaces"), "group with spaces");
});

// ── formatRNumber ──────────────────────────────────────────────────────────
suite("shared-r-export.js — formatRNumber");

test("finite numbers round-trip with period decimals", () => {
  eq(formatRNumber(1.5), "1.5");
  eq(formatRNumber(-3.14), "-3.14");
  eq(formatRNumber(0), "0");
});

test("NaN, Infinity, and null become NA", () => {
  eq(formatRNumber(NaN), "NA");
  eq(formatRNumber(Infinity), "NA");
  eq(formatRNumber(-Infinity), "NA");
  eq(formatRNumber(null), "NA");
  eq(formatRNumber(undefined), "NA");
});

// ── formatRVector ──────────────────────────────────────────────────────────
suite("shared-r-export.js — formatRVector");

test("wraps numbers in c(...)", () => {
  eq(formatRVector([1, 2, 3]), "c(1, 2, 3)");
});

test("empty array produces c()", () => {
  eq(formatRVector([]), "c()");
});

test("non-finite values become NA inside the vector", () => {
  eq(formatRVector([1, NaN, 3]), "c(1, NA, 3)");
});

// ── buildRScript ───────────────────────────────────────────────────────────
suite("shared-r-export.js — buildRScript test-name mapping");

test("Student's t-test maps to t.test(var.equal=TRUE)", () => {
  const out = buildRScript(ctxTwoGroups("studentT"));
  assert(
    out.includes("t.test(value ~ group, data = df, var.equal = TRUE)"),
    "missing student-t call"
  );
  assert(out.includes("# Toolbox picked: Student's t-test"));
});

test("Welch's t-test maps to t.test(var.equal=FALSE)", () => {
  const out = buildRScript(ctxTwoGroups("welchT"));
  assert(
    out.includes("t.test(value ~ group, data = df, var.equal = FALSE)"),
    "missing welch-t call"
  );
});

test("Mann-Whitney maps to wilcox.test(exact=FALSE)", () => {
  const out = buildRScript(ctxTwoGroups("mannWhitney"));
  assert(
    out.includes("wilcox.test(value ~ group, data = df, exact = FALSE)"),
    "missing wilcox call"
  );
});

test("One-way ANOVA emits aov()+summary()", () => {
  const out = buildRScript(ctxThreeGroups("oneWayANOVA", "tukeyHSD"));
  assert(out.includes("fit <- aov(value ~ group, data = df)"), "missing aov fit");
  assert(out.includes("summary(fit)"), "missing summary(fit)");
});

test("Welch ANOVA maps to oneway.test(var.equal=FALSE)", () => {
  const out = buildRScript(ctxThreeGroups("welchANOVA", "gamesHowell"));
  assert(
    out.includes("oneway.test(value ~ group, data = df, var.equal = FALSE)"),
    "missing welch ANOVA call"
  );
});

test("Kruskal-Wallis maps to kruskal.test()", () => {
  const out = buildRScript(ctxThreeGroups("kruskalWallis", "dunn"));
  assert(out.includes("kruskal.test(value ~ group, data = df)"), "missing KW call");
});

test("unknown chosenTest falls through to a labeled placeholder", () => {
  const ctx = ctxTwoGroups(null);
  ctx.recommendation = { recommendation: { test: null, reason: null } };
  const out = buildRScript(ctx);
  assert(out.includes("# (no inferential test was run)"), "missing placeholder");
});

suite("shared-r-export.js — buildRScript post-hoc mapping");

test("k=2 omits the post-hoc section entirely", () => {
  const out = buildRScript(ctxTwoGroups("welchT"));
  assert(!out.includes("--- Post-hoc"), "post-hoc section should be absent for k=2");
});

test("Tukey HSD maps to TukeyHSD(aov(...))", () => {
  const out = buildRScript(ctxThreeGroups("oneWayANOVA", "tukeyHSD"));
  assert(out.includes("TukeyHSD(aov(value ~ group, data = df))"), "missing Tukey call");
  assert(out.includes("# --- Post-hoc"));
});

test("Games-Howell maps to rstatix::games_howell_test", () => {
  const out = buildRScript(ctxThreeGroups("welchANOVA", "gamesHowell"));
  assert(
    out.includes("rstatix::games_howell_test(df, value ~ group)"),
    "missing games-howell call"
  );
  // pulls in the rstatix library header
  assert(out.includes("library(rstatix)"), "missing library(rstatix)");
});

test("Dunn-BH maps to rstatix::dunn_test with BH adjust", () => {
  const out = buildRScript(ctxThreeGroups("kruskalWallis", "dunn"));
  assert(
    out.includes('rstatix::dunn_test(df, value ~ group, p.adjust.method = "BH")'),
    "missing dunn call"
  );
  assert(out.includes("library(rstatix)"), "missing library(rstatix)");
});

test("Tukey HSD does NOT pull in rstatix", () => {
  const out = buildRScript(ctxThreeGroups("oneWayANOVA", "tukeyHSD"));
  assert(!out.includes("library(rstatix)"), "tukey-only run should not load rstatix");
  assert(!out.includes('"rstatix"'), "tukey-only install.packages should not list rstatix");
});

suite("shared-r-export.js — buildRScript assumption checks");

test("Shapiro-Wilk and Levene are always emitted", () => {
  const out = buildRScript(ctxTwoGroups("welchT"));
  assert(out.includes("by(df$value, df$group, shapiro.test)"), "missing shapiro");
  assert(
    out.includes('car::leveneTest(value ~ group, data = df, center = "median")'),
    "missing levene"
  );
  assert(out.includes("library(car)"), "missing library(car)");
});

suite("shared-r-export.js — buildRScript data frame embedding");

test("long-format data frame has one row per observation", () => {
  const out = buildRScript(
    ctxTwoGroups("welchT", {
      names: ["Ctrl", "Trt"],
      values: [
        [1.1, 2.2],
        [3.3, 4.4, 5.5],
      ],
    })
  );
  // 2 + 3 = 5 observations → 5 entries in each vector
  assert(out.includes('"Ctrl", "Ctrl"'), "control labels wrong");
  assert(out.includes('"Trt", "Trt", "Trt"'), "treatment labels wrong");
  assert(out.includes("1.1, 2.2"), "ctrl values wrong");
  assert(out.includes("3.3, 4.4, 5.5"), "trt values wrong");
  // factor level order preserved
  assert(out.includes('factor(df$group, levels = c("Ctrl", "Trt"))'), "factor level order wrong");
});

test("group names with spaces and quotes survive sanitization", () => {
  const out = buildRScript(
    ctxTwoGroups("welchT", {
      names: ['WT "ref"', "mutant line"],
      values: [
        [1, 2],
        [3, 4],
      ],
    })
  );
  assert(out.includes('"WT \\"ref\\""'), "quoted name not escaped");
  assert(out.includes('"mutant line"'), "spaced name missing");
});

test("long data vectors wrap across multiple lines", () => {
  // 20 observations per group → vector should wrap (perLine = 8 in the
  // builder). This is a readability check, not a correctness check.
  const n = 20;
  const vs = Array.from({ length: n }, (_, i) => i);
  const out = buildRScript(
    ctxTwoGroups("welchT", {
      names: ["A", "B"],
      values: [vs, vs],
    })
  );
  assert(out.includes("c(\n"), "long vector did not wrap");
});

suite("shared-r-export.js — buildRScript header");

test("includes generated timestamp", () => {
  const out = buildRScript(ctxTwoGroups("welchT"));
  assert(out.includes("Generated: 2026-04-15T00:00:00Z"), "missing generated timestamp");
});

test("dataNote appears in the header block", () => {
  const out = buildRScript(
    ctxTwoGroups("welchT", {
      dataNote: "Values are per-replicate trapezoidal integrals.",
    })
  );
  assert(
    out.includes("# Values are per-replicate trapezoidal integrals."),
    "dataNote did not land in header"
  );
});

test("decision-tree reason is appended as a trailing comment", () => {
  const out = buildRScript(ctxTwoGroups("welchT"));
  assert(out.includes("# Decision-tree rationale"), "missing rationale section");
  assert(out.includes("#   mock reason"), "rationale body missing");
});

// ── buildRScriptForPower ───────────────────────────────────────────────────
//
// The power builder takes the App state from tools/power.tsx. We build a
// canonical state for each testKey and exercise both solveFor branches +
// tails variants. Exact pwr numeric output isn't asserted — that's the job
// of the benchmark suite; here we only verify the right R call is emitted
// with the right argument list.

function powerState(overrides) {
  return Object.assign(
    {
      testKey: "t-ind",
      solveFor: "n",
      es: 0.5,
      n: 30,
      alpha: 0.05,
      power: 0.8,
      tails: 2,
      k: 3,
      df: 1,
      result: 64,
      generatedAt: "2026-04-15T00:00:00Z",
    },
    overrides
  );
}

suite("shared-r-export.js — buildRScriptForPower header & packages");

test("header includes test label, solve-for line, and library(pwr)", () => {
  const out = buildRScriptForPower(powerState());
  assert(out.includes("# Test:        Two-sample t-test (independent)"), "missing test label");
  assert(out.includes("# Solving for: sample size (n)"), "missing solve-for line");
  assert(out.includes('install.packages("pwr")'), "missing install.packages");
  assert(out.includes("library(pwr)"), "missing library(pwr)");
  assert(out.includes("Generated: 2026-04-15T00:00:00Z"), "missing timestamp");
});

test("solveFor=power flips the header label", () => {
  const out = buildRScriptForPower(powerState({ solveFor: "power" }));
  assert(out.includes("# Solving for: power"), "missing power solve-for line");
});

suite("shared-r-export.js — buildRScriptForPower t-tests");

test("t-ind with solveFor=n emits n=NULL and type=two.sample", () => {
  const out = buildRScriptForPower(powerState({ testKey: "t-ind", solveFor: "n" }));
  assert(out.includes("pwr::pwr.t.test("), "wrong pwr call");
  assert(out.includes("n = NULL,  # <- solve for this"), "n should be NULL for solve-for-n");
  assert(out.includes("d = 0.5,"), "missing d");
  assert(out.includes("sig.level = 0.05,"), "missing sig.level");
  assert(out.includes("power = 0.8,"), "missing power value");
  assert(out.includes('type = "two.sample",'), "missing type");
  assert(out.includes('alternative = "two.sided"'), "missing alternative");
});

test("t-ind with solveFor=power emits power=NULL", () => {
  const out = buildRScriptForPower(powerState({ testKey: "t-ind", solveFor: "power" }));
  assert(out.includes("n = 30,"), "n should be numeric");
  assert(out.includes("power = NULL"), "power should be NULL");
  assert(out.includes("# <- solve for this"), "missing solve-for marker");
});

test("t-paired emits type=paired", () => {
  const out = buildRScriptForPower(powerState({ testKey: "t-paired" }));
  assert(out.includes("pwr::pwr.t.test("), "wrong pwr call");
  assert(out.includes('type = "paired"'), "missing type=paired");
});

test("t-one emits type=one.sample", () => {
  const out = buildRScriptForPower(powerState({ testKey: "t-one" }));
  assert(out.includes("pwr::pwr.t.test("), "wrong pwr call");
  assert(out.includes('type = "one.sample"'), "missing type=one.sample");
});

test("tails=1 emits alternative=one.sided", () => {
  const out = buildRScriptForPower(powerState({ testKey: "t-ind", tails: 1 }));
  assert(out.includes('alternative = "one.sided"'), "missing one.sided alternative");
});

suite("shared-r-export.js — buildRScriptForPower anova / chi2 / correlation");

test("anova emits pwr.anova.test with k, n, f", () => {
  const out = buildRScriptForPower(powerState({ testKey: "anova", k: 4, es: 0.25 }));
  assert(out.includes("pwr::pwr.anova.test("), "wrong pwr call");
  assert(out.includes("k = 4,"), "missing k");
  assert(out.includes("f = 0.25,"), "missing f");
  assert(!out.includes("alternative ="), "anova should not have alternative");
  assert(!out.includes("type ="), "anova should not have type");
});

test("chi2 emits pwr.chisq.test with UPPERCASE N and df", () => {
  const out = buildRScriptForPower(powerState({ testKey: "chi2", df: 2, solveFor: "power" }));
  assert(out.includes("pwr::pwr.chisq.test("), "wrong pwr call");
  assert(out.includes("w = 0.5,"), "missing w");
  assert(out.includes("N = 30,"), "missing uppercase N");
  assert(out.includes("df = 2,"), "missing df");
});

test("chi2 with solveFor=n sets N=NULL", () => {
  const out = buildRScriptForPower(powerState({ testKey: "chi2", df: 2, solveFor: "n" }));
  assert(out.includes("N = NULL"), "N should be NULL for solve-for-n in chi2");
});

test("correlation emits pwr.r.test with r and alternative", () => {
  const out = buildRScriptForPower(powerState({ testKey: "correlation", tails: 1, es: 0.3 }));
  assert(out.includes("pwr::pwr.r.test("), "wrong pwr call");
  assert(out.includes("r = 0.3,"), "missing r");
  assert(out.includes('alternative = "one.sided"'), "missing one.sided alternative");
});

suite("shared-r-export.js — buildRScriptForPower result sanity comment");

test("solveFor=n trailing comment shows integer n", () => {
  const out = buildRScriptForPower(powerState({ solveFor: "n", result: 64 }));
  assert(out.includes("# Toolbox reported: n = 64"), "missing toolbox-reported n");
});

test("solveFor=power trailing comment shows percent to one decimal", () => {
  const out = buildRScriptForPower(powerState({ solveFor: "power", result: 0.7123 }));
  assert(out.includes("# Toolbox reported: power = 71.2%"), "missing toolbox-reported power");
});

test("null result suppresses the sanity comment", () => {
  const out = buildRScriptForPower(powerState({ result: null }));
  assert(!out.includes("Toolbox reported"), "sanity comment should be absent");
});

test("unknown testKey emits a labeled placeholder instead of pwr call", () => {
  const out = buildRScriptForPower(powerState({ testKey: "bogus" }));
  assert(out.includes("unknown test id"), "missing placeholder for unknown test");
  assert(!out.includes("pwr::"), "should not emit any pwr call");
});

suite("shared-r-export.js — buildRScriptForPower trailing-comma cleanup");

test("the final non-comment argument has no trailing comma", () => {
  const out = buildRScriptForPower(powerState({ testKey: "anova" }));
  // Find the ')' closing the pwr call and scan upward for the last arg line.
  const lines = out.split("\n");
  const closeIdx = lines.findIndex((l) => l.trim() === ")");
  assert(closeIdx > 0, "missing closing paren");
  const lastArg = lines[closeIdx - 1];
  // Strip inline comment if present.
  const beforeComment =
    lastArg.indexOf("#") >= 0 ? lastArg.slice(0, lastArg.indexOf("#")) : lastArg;
  assert(!/,\s*$/.test(beforeComment), "last argument still has a trailing comma: " + lastArg);
});

summary();
