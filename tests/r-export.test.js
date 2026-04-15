const { suite, test, assert, eq, summary } = require("./harness");
const {
  buildRScript,
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

summary();
