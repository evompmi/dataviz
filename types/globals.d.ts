// Ambient globals for tools/shared.js and tools/shared-components.js.
// Those files are loaded as plain <script> tags in each tool HTML and expose
// their top-level names globally. Tool .tsx files consume them without imports.
//
// Types here are the public surface only. For Phase 1, component props are
// deliberately loose (`any`) — tighten per component as needed.

import type { CSSProperties, FC, ReactElement, ReactNode } from "react";
import * as ReactNs from "react";

declare global {
  // ── Vendored React (loaded via <script> tag) ───────────────────────────────
  const React: typeof ReactNs;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React {
    export type CSSProperties = ReactNs.CSSProperties;
    export type FC<P = object> = ReactNs.FC<P>;
    export type ReactElement = ReactNs.ReactElement;
    export type ReactNode = ReactNs.ReactNode;
    export type RefObject<T> = ReactNs.RefObject<T>;
    export type MutableRefObject<T> = ReactNs.MutableRefObject<T>;
    export type ChangeEvent<T = Element> = ReactNs.ChangeEvent<T>;
    export type MouseEvent<T = Element> = ReactNs.MouseEvent<T>;
    export type KeyboardEvent<T = Element> = ReactNs.KeyboardEvent<T>;
    export type FormEvent<T = Element> = ReactNs.FormEvent<T>;
  }
  const ReactDOM: typeof import("react-dom/client");

  // ── Color helpers ──────────────────────────────────────────────────────────
  function hexToRgb(hex: string): [number, number, number];
  function rgbToHex(r: number, g: number, b: number): string;
  function shadeColor(hex: string, factor: number): string;
  function getPointColors(baseColor: string, nSources: number): string[];

  // ── Palette & icons ────────────────────────────────────────────────────────
  const PALETTE: readonly string[];
  const TOOL_ICONS: Record<string, string>;
  function toolIcon(name: string, size?: number, opts?: { circle?: boolean }): ReactElement | null;

  // ── Style constants ────────────────────────────────────────────────────────
  const inp: CSSProperties;
  const inpN: CSSProperties;
  const sec: CSSProperties;
  const lbl: CSSProperties;
  const btnPrimary: CSSProperties;
  const btnSecondary: CSSProperties;
  const btnDanger: CSSProperties;
  const btnDownload: CSSProperties;
  const btnPlot: CSSProperties;
  const selStyle: CSSProperties;
  const sepSelect: CSSProperties;
  const roleColors: Record<string, string>;

  // ── Numeric detection & seeded RNG ─────────────────────────────────────────
  function isNumericValue(v: unknown): boolean;
  function seededRandom(seed: number): () => number;
  function makeExamplePlantCSV(): string;
  function downloadText(text: string, filename: string): void;
  function powerTwoSample(d: number, n: number, alpha: number, tails: number): number;
  function powerPaired(d: number, n: number, alpha: number, tails: number): number;
  function powerOneSample(d: number, n: number, alpha: number, tails: number): number;
  function powerAnova(f: number, n: number, alpha: number, k: number): number;
  function powerCorrelation(r: number, n: number, alpha: number, tails: number): number;
  function powerChi2(w: number, n: number, alpha: number, df: number): number;
  function fFromGroupMeans(means: number[], sd: number): number;
  function makeTicks(min: number, max: number, approxN: number): number[];
  interface LogTick {
    value: number;
    major: boolean;
  }
  function makeLogTicks(dataMin: number, dataMax: number, base: number): LogTick[];

  // ── Separator detection & decimal comma fix ────────────────────────────────
  function autoDetectSep(text: string, override?: string): string | RegExp;
  function fixDecimalCommas(
    text: string,
    sep: string | RegExp
  ): { text: string; commaFixed: boolean; count: number };

  // ── CSV / TSV parsing ──────────────────────────────────────────────────────
  interface ParseRawResult {
    headers: string[];
    rows: string[][];
    hasHeader: boolean;
  }
  function parseRaw(text: string, sepOv?: string): ParseRawResult;

  function guessColumnType(vals: string[]): "ignore" | "value" | "group" | "text";
  function detectWideFormat(headers: string[], rows: string[][]): boolean;

  interface ParseDataResult {
    headers: string[];
    data: Array<Array<number | null>>;
    rawData: string[][];
  }
  function parseData(text: string, sepOv?: string): ParseDataResult;

  function dataToColumns<T>(data: T[][], nCols: number): T[][];

  function wideToLong(
    headers: string[],
    rows: string[][]
  ): { headers: [string, string]; rows: string[][] };
  function reshapeWide(
    rows: string[][],
    gi: number,
    vi: number
  ): { headers: string[]; rows: string[][] };

  // ── Statistics ─────────────────────────────────────────────────────────────
  interface Stats {
    mean: number;
    sd: number;
    sem: number;
    n: number;
    min: number;
    max: number;
    median: number;
  }
  function computeStats(arr: number[]): Stats | null;

  interface QuartileStats {
    min: number;
    max: number;
    q1: number;
    med: number;
    q3: number;
    iqr: number;
    wLo: number;
    wHi: number;
    n: number;
  }
  function quartiles(arr: number[]): QuartileStats | null;

  function kde(values: number[], nPoints?: number): Array<{ x: number; d: number }>;

  interface GroupStats {
    name: string;
    n: number;
    mean: number | null;
    sd: number | null;
    sem: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
  }
  function computeGroupStats(groups: Record<string, string[]>): GroupStats[];

  // ── Download helpers ───────────────────────────────────────────────────────
  function svgSafeId(s: unknown): string;
  function fileBaseName(fileName: string | null | undefined, fallback?: string): string;
  function flashSaved(btn: HTMLElement | null): void;
  function downloadSvg(svgEl: SVGSVGElement | null, filename: string): void;
  function downloadPng(svgEl: SVGSVGElement | null, filename: string, scale?: number): void;
  function downloadCsv(
    headers: string[],
    rows: Array<Array<string | number>>,
    filename: string
  ): void;

  // ── R-script export (shared-r-export.js) ──────────────────────────────────
  function buildRScript(ctx: any): string;
  function buildRScriptForPower(state: any): string;
  function sanitizeRString(s: unknown): string;
  function formatRNumber(n: number | null | undefined): string;
  function formatRVector(arr: Array<number | null | undefined>): string;

  // ── Shared components (Phase 1: loose props; tighten per component later) ──
  const ColorInput: FC<any>;
  const FileDropZone: FC<any>;
  const DataPreview: FC<any>;
  const NumberInput: FC<any>;
  const SliderControl: FC<any>;
  const StepNavBar: FC<any>;
  const PageHeader: FC<any>;
  const UploadPanel: FC<any>;
  const ActionsPanel: FC<any>;
  const CommaFixBanner: FC<any>;
  const ParseErrorBanner: FC<any>;
  const ColumnRoleEditor: FC<any>;
  const FilterCheckboxPanel: FC<any>;
  const RenameReorderPanel: FC<any>;
  const StatsTable: FC<any>;
  const GroupColorEditor: FC<any>;
  const BaseStyleControls: FC<any>;
  const ErrorBoundary: FC<{ toolName?: string; children?: ReactNode }>;
  const StatsTile: FC<any>;
  interface SubgroupMeta {
    name: string;
    startIndex: number;
    count: number;
  }

  interface BracketPair {
    i: number;
    j: number;
    p?: number;
    pAdj?: number;
    label?: string;
    _level?: number;
  }
  function assignBracketLevels(pairs: BracketPair[]): BracketPair[];

  // ── Legend SVG helpers from shared-components.js ───────────────────────────
  interface LegendBlock {
    items: Array<{ label: string; color: string }>;
    [k: string]: any;
  }
  type LegendItemWidth = number | ((block: LegendBlock) => number);
  function computeLegendHeight(
    blocks: LegendBlock[],
    usableW: number,
    itemWidth: LegendItemWidth
  ): number;
  function renderSvgLegend(
    blocks: LegendBlock[],
    startY: number,
    leftX: number,
    usableW: number,
    itemWidth: LegendItemWidth,
    truncateLabel?: number
  ): ReactNode;

  // ── tools/stats.js ─────────────────────────────────────────────────────────
  function normcdf(x: number): number;
  function norminv(p: number): number;
  function gammaln(x: number): number;
  function betai(a: number, b: number, x: number): number;
  function betacf(a: number, b: number, x: number): number;
  function gammainc(a: number, x: number): number;
  function gammainc_upper(a: number, x: number): number;
  function tcdf(t: number, df: number): number;
  function tinv(p: number, df: number): number;
  function fcdf(f: number, d1: number, d2: number): number;
  function chi2cdf(x: number, k: number): number;
  function chi2inv(p: number, k: number): number;
  function nctcdf(t: number, df: number, delta: number): number;
  function ncf_sf(f: number, d1: number, d2: number, lambda: number): number;
  function ncchi2cdf(x: number, k: number, lambda: number): number;
  function bisect(
    fn: (x: number) => number,
    target: number,
    lo: number,
    hi: number,
    tol?: number,
    maxIter?: number
  ): number;
  function sampleMean(x: number[]): number;
  function sampleVariance(x: number[]): number;
  function sampleSD(x: number[]): number;
  function rankWithTies(x: number[]): { ranks: number[]; tieCorrection: number };
  function shapiroWilk(x: number[]): { W: number; p: number; error?: string };
  function leveneTest(groups: number[][]): {
    F: number;
    df1: number;
    df2: number;
    p: number;
    error?: string;
  };
  function tTest(
    x: number[],
    y: number[],
    opts?: { equalVar?: boolean }
  ): {
    t: number;
    df: number;
    p: number;
    mean1?: number;
    mean2?: number;
    var1?: number;
    var2?: number;
    n1?: number;
    n2?: number;
    error?: string;
  };
  function mannWhitneyU(
    x: number[],
    y: number[]
  ): {
    U: number;
    U1: number;
    U2: number;
    z: number;
    p: number;
    n1: number;
    n2: number;
    error?: string;
  };
  function cohenD(x: number[], y: number[]): number;
  function hedgesG(x: number[], y: number[]): number;
  function rankBiserial(U1: number, n1: number, n2: number): number;
  function oneWayANOVA(groups: number[][]): {
    F: number;
    df1: number;
    df2: number;
    p: number;
    ssBetween?: number;
    ssWithin?: number;
    grandMean?: number;
    error?: string;
  };
  function welchANOVA(groups: number[][]): {
    F: number;
    df1: number;
    df2: number;
    p: number;
    error?: string;
  };
  function kruskalWallis(groups: number[][]): {
    H: number;
    df: number;
    p: number;
    error?: string;
  };
  function etaSquared(groups: number[][]): number;
  function epsilonSquared(groups: number[][]): number;
  function ptukey(q: number, k: number, df: number): number;
  function qtukey(p: number, k: number, df: number): number;
  interface TukeyPair {
    i: number;
    j: number;
    diff: number;
    se: number;
    q: number;
    p: number;
    lwr: number;
    upr: number;
  }
  function tukeyHSD(
    groups: number[][],
    opts?: { alpha?: number }
  ): { pairs: TukeyPair[]; k?: number; df?: number; mse?: number; error?: string };
  interface GamesHowellPair {
    i: number;
    j: number;
    diff: number;
    se: number;
    q: number;
    df: number;
    p: number;
  }
  function gamesHowell(groups: number[][]): {
    pairs: GamesHowellPair[];
    k?: number;
    error?: string;
  };
  function bhAdjust(ps: number[]): number[];
  interface DunnPair {
    i: number;
    j: number;
    z: number;
    p: number;
    pAdj?: number;
  }
  function dunnTest(groups: number[][]): { pairs: DunnPair[]; method?: string; error?: string };
  function compactLetterDisplay(
    pairs: Array<{ i: number; j: number; p: number; pAdj?: number }>,
    k: number,
    alpha?: number
  ): string[];
  interface NormalityResult {
    group: number;
    n: number;
    W: number | null;
    p: number | null;
    normal: boolean | null;
    note?: string;
  }
  type RecommendedTest =
    | "studentT"
    | "welchT"
    | "mannWhitney"
    | "oneWayANOVA"
    | "welchANOVA"
    | "kruskalWallis";
  type RecommendedPostHoc = "tukeyHSD" | "gamesHowell" | "dunn" | null;
  function selectTest(
    groups: number[][],
    opts?: { alphaNormality?: number; alphaVariance?: number }
  ): {
    k: number;
    normality?: NormalityResult[];
    allNormal?: boolean;
    levene?: {
      F?: number;
      df1?: number;
      df2?: number;
      p?: number;
      equalVar?: boolean | null;
      error?: string;
    };
    recommendation?: {
      test: RecommendedTest;
      postHoc: RecommendedPostHoc;
      reason: string;
    };
    error?: string;
  };
  function pStars(p: number): string;
  function formatP(p: number | null | undefined): string;
}

export {};
