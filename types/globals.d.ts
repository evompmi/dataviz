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
  function makeTicks(min: number, max: number, approxN: number): number[];

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
  function flashSaved(btn: HTMLElement | null): void;
  function downloadSvg(svgEl: SVGSVGElement | null, filename: string): void;
  function downloadPng(svgEl: SVGSVGElement | null, filename: string, scale?: number): void;
  function downloadCsv(
    headers: string[],
    rows: Array<Array<string | number>>,
    filename: string
  ): void;

  // ── Shared components (Phase 1: loose props; tighten per component later) ──
  const ColorInput: FC<any>;
  const FileDropZone: FC<any>;
  const DataPreview: FC<any>;
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
}

export {};
