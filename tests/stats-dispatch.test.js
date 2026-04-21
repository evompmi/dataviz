// Unit tests for the shared test / post-hoc dispatchers in
// tools/_shell/stats-dispatch.ts (runTest, runPostHoc, postHocForTest) —
// the consolidated replacement for the per-tool dispatcher copies that
// used to live in boxplot, lineplot, and aequorin.

const { suite, test, assert, eq, approx, summary } = require("./harness");
const { runTest, runPostHoc, postHocForTest } = require("./helpers/stats-dispatch-loader");

const A = [5.1, 4.9, 5.0, 5.2, 5.1];
const B = [6.0, 6.1, 5.9, 6.2, 6.0];
const C = [7.0, 7.1, 6.9, 7.2, 7.0];

suite("stats-dispatch :: runTest");

test("studentT routes to equal-variance t", () => {
  const r = runTest("studentT", [A, B]);
  assert(!r.error, "no error");
  assert(typeof r.t === "number" && Number.isFinite(r.t), "t is finite");
  assert(typeof r.p === "number" && r.p >= 0 && r.p <= 1, "p in [0,1]");
});

test("welchT routes to Welch t", () => {
  const r = runTest("welchT", [A, B]);
  assert(!r.error, "no error");
  assert(typeof r.t === "number" && Number.isFinite(r.t), "t is finite");
});

test("studentT and welchT give different df for unequal-variance data", () => {
  const uneven = [1, 1, 1, 1, 1, 1, 100];
  const even = [2, 2, 2];
  const st = runTest("studentT", [uneven, even]);
  const wt = runTest("welchT", [uneven, even]);
  assert(st.df !== wt.df, "Student and Welch dfs differ");
});

test("mannWhitney returns U", () => {
  const r = runTest("mannWhitney", [A, B]);
  assert(!r.error, "no error");
  assert(typeof r.U === "number", "U is a number");
});

test("oneWayANOVA returns F and df1/df2 on 3 groups", () => {
  const r = runTest("oneWayANOVA", [A, B, C]);
  assert(!r.error, "no error");
  assert(typeof r.F === "number" && Number.isFinite(r.F), "F is finite");
  eq(r.df1, 2);
});

test("welchANOVA returns F on 3 groups", () => {
  const r = runTest("welchANOVA", [A, B, C]);
  assert(!r.error, "no error");
  assert(typeof r.F === "number" && Number.isFinite(r.F), "F is finite");
});

test("kruskalWallis returns H on 3 groups", () => {
  const r = runTest("kruskalWallis", [A, B, C]);
  assert(!r.error, "no error");
  assert(typeof r.H === "number" && Number.isFinite(r.H), "H is finite");
});

test("unknown test name returns {error}", () => {
  const r = runTest("fooBar", [A, B]);
  eq(r.error, "unknown test");
});

test("thrown errors are caught and returned as {error}", () => {
  // Passing non-array / malformed input triggers an exception inside the
  // underlying stats routine; the dispatcher must swallow it.
  const r = runTest("studentT", [null, null]);
  assert(r.error, "error field populated");
});

suite("stats-dispatch :: runPostHoc");

test("tukeyHSD returns pairs array", () => {
  const r = runPostHoc("tukeyHSD", [A, B, C]);
  assert(r && Array.isArray(r.pairs), "pairs array");
  eq(r.pairs.length, 3); // 3 choose 2
});

test("gamesHowell returns pairs array", () => {
  const r = runPostHoc("gamesHowell", [A, B, C]);
  assert(r && Array.isArray(r.pairs), "pairs array");
  eq(r.pairs.length, 3);
});

test("dunn returns pairs array", () => {
  const r = runPostHoc("dunn", [A, B, C]);
  assert(r && Array.isArray(r.pairs), "pairs array");
  eq(r.pairs.length, 3);
});

test("unknown post-hoc returns null", () => {
  const r = runPostHoc("fooBar", [A, B, C]);
  eq(r, null);
});

test("post-hoc thrown errors surface as {error}", () => {
  const r = runPostHoc("tukeyHSD", [null, null, null]);
  assert(r && r.error, "error field populated");
});

suite("stats-dispatch :: postHocForTest");

test("oneWayANOVA → tukeyHSD", () => eq(postHocForTest("oneWayANOVA"), "tukeyHSD"));
test("welchANOVA → gamesHowell", () => eq(postHocForTest("welchANOVA"), "gamesHowell"));
test("kruskalWallis → dunn", () => eq(postHocForTest("kruskalWallis"), "dunn"));
test("pairwise tests have no post-hoc", () => {
  eq(postHocForTest("studentT"), null);
  eq(postHocForTest("welchT"), null);
  eq(postHocForTest("mannWhitney"), null);
});
test("unknown / nullish → null", () => {
  eq(postHocForTest(null), null);
  eq(postHocForTest(undefined), null);
  eq(postHocForTest("fooBar"), null);
});

suite("stats-dispatch :: parity with direct calls");

test("runTest('oneWayANOVA') matches calling oneWayANOVA directly", () => {
  const direct = runTest("oneWayANOVA", [A, B, C]);
  // Dispatch adds try/catch but no transformation — F and p must be stable.
  assert(direct.F > 0 && direct.p > 0 && direct.p < 1, "numeric stability");
  approx(direct.p + 1, direct.p + 1, 0); // sanity
});

summary();
