// Shared state hook for every plot tool. Holds the boilerplate that was
// previously re-derived in seven App() functions: upload-step state (step,
// rawText/fileName, separator override, decimal-comma fix flags, parse error)
// plus the `vis` reducer with auto-prefs persistence.
//
// Tool-specific state (selectedMask, parsed rows, pendingSelection, etc.)
// stays outside this hook — the goal is to extract the common scaffold, not
// to become a kitchen sink.
//
// Ambient names consumed (from tools/shared.bundle.js globals):
//   - React (useState, useReducer, useEffect)
//   - loadAutoPrefs, saveAutoPrefs  (shared-prefs.js)

const { useState, useReducer, useEffect } = React;

export interface PlotToolState<TVis extends object> {
  step: string;
  setStep: (s: string) => void;
  fileName: string;
  setFileName: (n: string) => void;
  parseError: string | null;
  setParseError: (e: string | null) => void;
  sepOverride: string;
  setSepOverride: (s: string) => void;
  commaFixed: boolean;
  setCommaFixed: (b: boolean) => void;
  commaFixCount: number;
  setCommaFixCount: (n: number) => void;
  vis: TVis;
  updVis: (patch: Partial<TVis> | { _reset: true }) => void;
}

export function usePlotToolState<TVis extends object>(
  toolKey: string,
  initialVis: TVis
): PlotToolState<TVis> {
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);

  // The reducer captures `initialVis` by reference; React only invokes the
  // third argument (the initializer) once, so a new inline initialVis object
  // per render doesn't re-seed state. `_reset` resets to the initial shape
  // without touching persisted auto-prefs.
  const [vis, updVis] = useReducer(
    (s: TVis, a: Partial<TVis> | { _reset: true }) =>
      "_reset" in a && a._reset ? { ...initialVis } : { ...s, ...(a as Partial<TVis>) },
    initialVis,
    (init) => (loadAutoPrefs as (k: string, d: TVis) => TVis)(toolKey, init)
  );

  useEffect(() => {
    (saveAutoPrefs as (k: string, v: TVis) => void)(toolKey, vis);
  }, [toolKey, vis]);

  return {
    step,
    setStep,
    fileName,
    setFileName,
    parseError,
    setParseError,
    sepOverride,
    setSepOverride,
    commaFixed,
    setCommaFixed,
    commaFixCount,
    setCommaFixCount,
    vis,
    updVis,
  };
}
