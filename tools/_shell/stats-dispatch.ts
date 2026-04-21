// Shared test / post-hoc dispatchers for every plot tool that runs
// inferential stats (boxplot, lineplot, aequorin). Previously each tool kept
// its own near-identical copy of these three functions (runBpTest,
// runChosenTest, runAqTest; runBpPostHoc, runPostHocByName, runAqPostHoc;
// postHocForBpTest, postHocForTest, postHocForAqTest) — ~90 lines of
// triplicated dispatch code that had already started to drift (lineplot's
// post-hoc runner was missing the try/catch its siblings had).
//
// All three functions return `{ error }`-shaped values on failure so callers
// don't have to branch on the test name.
//
// Ambient names consumed (from tools/shared.bundle.js globals via stats.js):
//   - tTest, mannWhitneyU, oneWayANOVA, welchANOVA, kruskalWallis
//   - tukeyHSD, gamesHowell, dunnTest

type GroupValues = number[][];
type TestResult = { p?: number; error?: string; [key: string]: unknown };

export function runTest(name: RecommendedTest | string, values: GroupValues): TestResult {
  try {
    if (name === "studentT") return tTest(values[0], values[1], { equalVar: true });
    if (name === "welchT") return tTest(values[0], values[1], { equalVar: false });
    if (name === "mannWhitney") return mannWhitneyU(values[0], values[1]);
    if (name === "oneWayANOVA") return oneWayANOVA(values);
    if (name === "welchANOVA") return welchANOVA(values);
    if (name === "kruskalWallis") return kruskalWallis(values);
    return { error: "unknown test" };
  } catch (e) {
    return { error: String((e && (e as Error).message) || e) };
  }
}

export function runPostHoc(
  name: Exclude<RecommendedPostHoc, null> | string,
  values: GroupValues
): { pairs?: unknown[]; error?: string } | null {
  try {
    if (name === "tukeyHSD") return tukeyHSD(values);
    if (name === "gamesHowell") return gamesHowell(values);
    if (name === "dunn") return dunnTest(values);
    return null;
  } catch (e) {
    return { error: String((e && (e as Error).message) || e) };
  }
}

export function postHocForTest(
  testName: RecommendedTest | string | null | undefined
): Exclude<RecommendedPostHoc, null> | null {
  if (testName === "oneWayANOVA") return "tukeyHSD";
  if (testName === "welchANOVA") return "gamesHowell";
  if (testName === "kruskalWallis") return "dunn";
  return null;
}
