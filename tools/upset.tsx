// upset.tsx — editable source. Run `npm run build` to compile to upset.js
// Do NOT edit the .js file directly.
import { usePlotToolState } from "./_shell/usePlotToolState";
import { PlotToolShell } from "./_shell/PlotToolShell";
import { ScrollablePlotCard } from "./_shell/ScrollablePlotCard";
import { PlotSidebar } from "./_shell/PlotSidebar";
import {
  computeMemberships,
  enumerateIntersections,
  sortIntersections,
  truncateIntersections,
  intersectionLabel,
  intersectionFilenamePart,
  intersectionIdKey,
  buildBarTicks,
  shouldRotateColumnIds,
} from "./upset/helpers";

const { useState, useMemo, useCallback, useRef, useEffect, forwardRef } = React;

// parseSetData and parseLongFormatSets live in tools/shared.js.
// Pure set-math and label helpers live in tools/upset/helpers.ts.

// ── Layout constants ─────────────────────────────────────────────────────────

const PREFERRED_SVG_W = 960;
const MIN_COL_W = 18;
const MAX_COL_W = 36;
const TITLE_H_WITH = 40;
const TITLE_H_NONE = 16;
const SUBTITLE_H = 18;
const TOP_PANEL_H = 200;
const MATRIX_TOP_PAD = 8;
const BOTTOM_H = 62;
const LEFT_MARGIN = 44;
const LEFT_BAR_MAX = 110;
const LEFT_LABEL_AREA_MIN = 82;
const LEFT_GAP = 6;
const RIGHT_MARGIN = 20;
const BAR_FILL = "#000000";
const DOT_FILL = "#000000";
const EMPTY_DOT = "#DDDDDD";
const ZEBRA_FILL = "#F4F4F4";
const TEXT_DARK = "#333333";
const TEXT_MUTED = "#555555";

// Row height is tuned so tall set lists stay legible without dominating the view.
function computeRowHeight(nSets) {
  return Math.max(22, Math.min(40, Math.round(140 / Math.max(1, nSets) + 14)));
}

// Column width fits the preferred width when the column count allows it,
// otherwise clamps to MIN_COL_W so the SVG grows wider instead of shrinking
// columns below legibility. Callers use the returned colW to derive SVG_W.
function computeColWidth(nCols, matrixLeftX) {
  if (nCols <= 0) return 24;
  const avail = PREFERRED_SVG_W - matrixLeftX - RIGHT_MARGIN;
  return Math.max(MIN_COL_W, Math.min(MAX_COL_W, avail / nCols));
}

// ── UpsetChart ──────────────────────────────────────────────────────────────

const UpsetChart = forwardRef<SVGSVGElement, any>(function UpsetChart(
  {
    setNames,
    setSizes,
    intersections,
    selectedMask,
    onColumnClick,
    plotTitle,
    plotSubtitle,
    plotBg,
    fontSize,
    barOpacity,
    dotSize,
  },
  ref
) {
  const nSets = setNames.length;
  const nCols = intersections.length;
  const fSize = fontSize || 12;
  const barOp = barOpacity != null ? barOpacity : 1;
  const dotR = dotSize || 6;

  // Label lane grows with font size and longest set name so the bars never
  // collide with their labels at large font sizes. The 0.58 factor is a
  // conservative average-width estimate for sans-serif glyphs.
  const labelFontSize = Math.max(10, fSize - 1);
  const estLabelW = Math.max(0, ...setNames.map((n) => String(n).length * labelFontSize * 0.58));
  const leftLabelArea = Math.max(LEFT_LABEL_AREA_MIN, Math.ceil(estLabelW) + 6);
  const matrixLeftX = LEFT_MARGIN + LEFT_BAR_MAX + LEFT_GAP + leftLabelArea;

  const rowH = computeRowHeight(nSets);
  const colW = computeColWidth(nCols, matrixLeftX);
  const matrixH = nSets * rowH;
  const titleH = plotTitle ? TITLE_H_WITH : TITLE_H_NONE;
  const subH = plotSubtitle ? SUBTITLE_H : 0;
  const topPanelY = titleH + subH;
  const matrixY = topPanelY + TOP_PANEL_H + MATRIX_TOP_PAD;
  // Column ids ("I1", "I2", …) render horizontally by default, but flip to a
  // vertical (rotated -90°) orientation whenever the horizontal label would be
  // wider than the matrix column (plus a 2 px gap). 0.58 is the shared
  // average-glyph-width factor used above for set-name labels.
  const idFontSize = Math.max(8, Math.min(10, fSize - 4));
  const maxIdChars = 1 + String(Math.max(1, nCols)).length;
  const rotateColumnIds = shouldRotateColumnIds(nCols, colW, idFontSize);
  const idLabelSpan = rotateColumnIds ? Math.ceil(maxIdChars * idFontSize * 0.58) : idFontSize;
  const legendFS = Math.max(9, fSize - 3);
  const idLaneOffset = 10;
  const legendOffset = idLaneOffset + idLabelSpan + 8;
  const bottomNeeded = legendOffset + legendFS + 8;
  const VH = matrixY + matrixH + Math.max(BOTTOM_H, bottomNeeded);
  // Grow the SVG when columns would otherwise spill past the preferred width;
  // the style below keeps it <=100% of the container so narrow viewports just
  // scale proportionally instead of clipping.
  const SVG_W = Math.max(PREFERRED_SVG_W, matrixLeftX + Math.max(0, nCols) * colW + RIGHT_MARGIN);

  // Top (intersection-size) bar area. Ticks are evenly spaced pretty values;
  // the domain max (last tick) is strictly above the data max so the largest
  // bar stops just below the panel edge rather than touching it.
  const topPanelBottom = topPanelY + TOP_PANEL_H;
  const topAxisMax = Math.max(1, ...intersections.map((r) => r.size));
  const topTicks = buildBarTicks(topAxisMax, 4);
  const topDomainMax = topTicks[topTicks.length - 1];
  const topBarScale = (v) => (v / topDomainMax) * TOP_PANEL_H;

  // Left (set-size) bar area — same scaling strategy as the top panel.
  const setSizeMax = Math.max(1, ...setNames.map((n) => setSizes.get(n) || 0));
  const leftTicks = buildBarTicks(setSizeMax, 3);
  const leftDomainMax = leftTicks[leftTicks.length - 1];
  const leftBarScale = (v) => (v / leftDomainMax) * LEFT_BAR_MAX;

  const colX = (i) => matrixLeftX + colW * (i + 0.5);
  const rowY = (i) => matrixY + rowH * (i + 0.5);

  // Axis tick geometry for the top (intersection size) axis — rendered on the
  // *left* edge of the top panel so the numbers are readable even if there are
  // many bars. The numeric scale is reused for intersection-bar labels.
  const topAxisX = matrixLeftX - 4;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SVG_W} ${VH}`}
      width={SVG_W}
      height={VH}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={plotTitle || "UpSet plot"}
    >
      <title>{plotTitle || "UpSet plot"}</title>
      <desc>{`UpSet plot with ${nSets} sets and ${nCols} intersections`}</desc>

      <g id="background">
        <rect width={SVG_W} height={VH} fill={plotBg || "#ffffff"} rx="8" />
      </g>

      {plotTitle && (
        <g id="title">
          <text
            x={SVG_W / 2}
            y={24}
            textAnchor="middle"
            fontSize={Math.max(14, fSize + 4)}
            fontWeight="700"
            fill={TEXT_DARK}
            fontFamily="sans-serif"
          >
            {plotTitle}
          </text>
        </g>
      )}
      {plotSubtitle && (
        <g id="subtitle">
          <text
            x={SVG_W / 2}
            y={titleH + 12}
            textAnchor="middle"
            fontSize={Math.max(11, fSize)}
            fill={TEXT_MUTED}
            fontFamily="sans-serif"
          >
            {plotSubtitle}
          </text>
        </g>
      )}

      {/* Top axis — intersection size. */}
      <g id="axis-intersection-size">
        <line
          x1={topAxisX}
          x2={topAxisX}
          y1={topPanelY}
          y2={topPanelBottom}
          stroke={TEXT_DARK}
          strokeWidth="1"
        />
        {topTicks.map((t, i) => {
          const y = topPanelBottom - topBarScale(t);
          return (
            <g key={`ta-${i}`}>
              <line
                x1={topAxisX - 3}
                x2={topAxisX}
                y1={y}
                y2={y}
                stroke={TEXT_DARK}
                strokeWidth="1"
              />
              <text
                x={topAxisX - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={Math.max(9, fSize - 3)}
                fill={TEXT_MUTED}
                fontFamily="sans-serif"
              >
                {t}
              </text>
            </g>
          );
        })}
        {(() => {
          const tickFS = Math.max(9, fSize - 3);
          const labelFS = Math.max(10, fSize - 2);
          const maxTickChars = String(topDomainMax).length;
          const tickTextW = maxTickChars * tickFS * 0.6;
          const labelCx = topAxisX - 6 - tickTextW - labelFS / 2 - 6;
          const labelCy = topPanelY + TOP_PANEL_H / 2;
          return (
            <text
              x={labelCx}
              y={labelCy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={labelFS}
              fill={TEXT_MUTED}
              fontFamily="sans-serif"
              transform={`rotate(-90 ${labelCx} ${labelCy})`}
            >
              Intersection size
            </text>
          );
        })()}
      </g>

      {/* Intersection bars + their numeric labels. */}
      <g id="intersection-bars">
        {intersections.map((inter, i) => {
          const cx = colX(i);
          const barW = Math.max(6, colW * 0.7);
          const barX = cx - barW / 2;
          const h = topBarScale(inter.size);
          const isSelected = selectedMask === inter.mask;
          const idKey = intersectionIdKey(inter.setIndices, setNames);
          return (
            <g
              key={`tb-${inter.mask}`}
              id={`intersection-bar-${idKey}`}
              style={{ cursor: "pointer" }}
              onClick={() => onColumnClick && onColumnClick(isSelected ? null : inter.mask)}
            >
              <rect
                x={barX}
                y={topPanelBottom - h}
                width={barW}
                height={h}
                fill={BAR_FILL}
                fillOpacity={barOp}
                stroke={isSelected ? TEXT_DARK : "none"}
                strokeWidth={isSelected ? 1.5 : 0}
              />
            </g>
          );
        })}
      </g>

      <g id="intersection-bar-labels">
        {intersections.map((inter, i) => {
          const cx = colX(i);
          const h = topBarScale(inter.size);
          return (
            <text
              key={`tbl-${inter.mask}`}
              x={cx}
              y={topPanelBottom - h - 3}
              textAnchor="middle"
              fontSize={Math.max(9, fSize - 3)}
              fill={TEXT_DARK}
              fontFamily="sans-serif"
            >
              {inter.size}
            </text>
          );
        })}
      </g>

      {/* Matrix zebra stripes — every other row gets a faint band that
          spans only the populated column range so the bands shrink in step
          with the minimum-size / minimum-degree filters. */}
      <g id="matrix-background">
        {setNames.map((_, i) =>
          i % 2 === 0 ? (
            <rect
              key={`zb-${i}`}
              x={matrixLeftX}
              y={matrixY + i * rowH}
              width={Math.max(0, nCols) * colW}
              height={rowH}
              fill={ZEBRA_FILL}
              fillOpacity="0.5"
            />
          ) : null
        )}
      </g>

      {/* Set labels inside the left panel, right-aligned against the matrix. */}
      <g id="set-labels">
        {setNames.map((name, i) => (
          <text
            key={`sl-${i}`}
            x={matrixLeftX - LEFT_GAP - 2}
            y={rowY(i)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={labelFontSize}
            fontWeight="600"
            fill={TEXT_DARK}
            fontFamily="sans-serif"
          >
            {name}
          </text>
        ))}
      </g>

      {/* Set-size horizontal bars. */}
      <g id="set-size-bars">
        {setNames.map((name, i) => {
          const size = setSizes.get(name) || 0;
          const w = leftBarScale(size);
          const barRightX = matrixLeftX - LEFT_GAP - leftLabelArea;
          return (
            <rect
              key={`sb-${i}`}
              id={`set-size-${svgSafeId(name)}`}
              x={barRightX - w}
              y={rowY(i) - rowH * 0.3}
              width={w}
              height={rowH * 0.6}
              fill={BAR_FILL}
              fillOpacity={barOp}
            />
          );
        })}
      </g>

      <g id="set-size-bar-labels">
        {setNames.map((name, i) => {
          const size = setSizes.get(name) || 0;
          const w = leftBarScale(size);
          const barRightX = matrixLeftX - LEFT_GAP - leftLabelArea;
          return (
            <text
              key={`sbl-${i}`}
              x={barRightX - w - 4}
              y={rowY(i)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={Math.max(9, fSize - 3)}
              fill={TEXT_MUTED}
              fontFamily="sans-serif"
            >
              {size}
            </text>
          );
        })}
      </g>

      {/* Set-size axis: baseline + downward ticks + labels below the matrix. */}
      <g id="axis-set-size">
        {(() => {
          const barRightX = matrixLeftX - LEFT_GAP - leftLabelArea;
          const axisY = matrixY + matrixH + 4;
          const axisLeftX = barRightX - LEFT_BAR_MAX;
          return (
            <>
              <line
                x1={axisLeftX}
                x2={barRightX}
                y1={axisY}
                y2={axisY}
                stroke={TEXT_DARK}
                strokeWidth="1"
              />
              {leftTicks.map((t, i) => {
                const x = barRightX - leftBarScale(t);
                return (
                  <g key={`la-${i}`}>
                    <line
                      x1={x}
                      x2={x}
                      y1={axisY}
                      y2={axisY + 3}
                      stroke={TEXT_DARK}
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={axisY + 18}
                      textAnchor="middle"
                      fontSize={Math.max(9, fSize - 3)}
                      fill={TEXT_MUTED}
                      fontFamily="sans-serif"
                    >
                      {t}
                    </text>
                  </g>
                );
              })}
              <text
                x={axisLeftX + LEFT_BAR_MAX / 2}
                y={axisY + 44}
                textAnchor="middle"
                fontSize={Math.max(10, fSize - 2)}
                fill={TEXT_MUTED}
                fontFamily="sans-serif"
              >
                Set size
              </text>
            </>
          );
        })()}
      </g>

      {/* Per-column identifier labels ("I1", "I2", …) directly beneath the
          matrix. Ids are 1-based and derive from the render order, so they
          always match whatever intersections.length and sorting are in play.
          The same ids drive the "All regions" bulk-download filenames, so the
          labels on the plot equal the file names 1:1 for any given render. */}
      <g id="column-ids">
        {(() => {
          const idLaneY = matrixY + matrixH + idLaneOffset;
          return intersections.map((inter, i) => {
            const cx = colX(i);
            return (
              <text
                key={`cid-${inter.mask}`}
                id={`column-id-${i + 1}`}
                x={cx}
                y={idLaneY}
                textAnchor={rotateColumnIds ? "end" : "middle"}
                dominantBaseline={rotateColumnIds ? "middle" : "hanging"}
                fontSize={idFontSize}
                fontFamily="monospace"
                fill={TEXT_MUTED}
                transform={rotateColumnIds ? `rotate(-90 ${cx} ${idLaneY})` : undefined}
              >
                {`I${i + 1}`}
              </text>
            );
          });
        })()}
      </g>

      {/* One-line legend clarifying the "I#" notation. Anchored at matrixLeftX
          so it sits below the column-ids lane and right of the "Set size"
          caption (which lives in the left bar area). */}
      <g id="column-ids-legend">
        {(() => {
          const legendY = matrixY + matrixH + legendOffset;
          return (
            <text
              x={matrixLeftX}
              y={legendY}
              textAnchor="start"
              dominantBaseline="hanging"
              fontSize={legendFS}
              fontFamily="sans-serif"
              fontStyle="italic"
              fill={TEXT_MUTED}
            >
              I# = intersection id (used as bulk-download filename)
            </text>
          );
        })()}
      </g>

      {/* Matrix: per-column group with line + dots. */}
      <g id="matrix">
        <g id="matrix-columns">
          {intersections.map((inter, i) => {
            const cx = colX(i);
            const inSet = new Set(inter.setIndices);
            const isSelected = selectedMask === inter.mask;
            const idKey = intersectionIdKey(inter.setIndices, setNames);
            const activeRows = inter.setIndices;
            const minR = activeRows.length ? rowY(Math.min(...activeRows)) : 0;
            const maxR = activeRows.length ? rowY(Math.max(...activeRows)) : 0;
            return (
              <g
                key={`col-${inter.mask}`}
                id={`col-${idKey}`}
                style={{ cursor: "pointer" }}
                onClick={() => onColumnClick && onColumnClick(isSelected ? null : inter.mask)}
              >
                <rect
                  x={cx - colW / 2}
                  y={matrixY}
                  width={colW}
                  height={matrixH}
                  fill={isSelected ? "#648FFF" : "#ffffff"}
                  fillOpacity={isSelected ? 0.12 : 0}
                  pointerEvents="all"
                />
                {activeRows.length > 1 && (
                  <line
                    className="matrix-line"
                    x1={cx}
                    x2={cx}
                    y1={minR}
                    y2={maxR}
                    stroke={DOT_FILL}
                    strokeWidth={Math.max(1.5, dotR / 3)}
                  />
                )}
                {setNames.map((name, j) => (
                  <circle
                    key={`d-${j}`}
                    id={`dot-${idKey}-${svgSafeId(name)}`}
                    cx={cx}
                    cy={rowY(j)}
                    r={dotR}
                    fill={inSet.has(j) ? DOT_FILL : EMPTY_DOT}
                  />
                ))}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
});

// ── Upload step with explicit Wide/Long toggle ───────────────────────────────

function UploadStep({
  sepOverride,
  setSepOverride,
  format,
  setFormat,
  handleFileLoad,
  onLoadExample,
}) {
  return (
    <div>
      <div className="dv-panel" style={{ marginBottom: 12 }}>
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
          Data format
        </p>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            width: "fit-content",
          }}
        >
          {(["wide", "long"] as const).map((f) => {
            const active = format === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  padding: "6px 18px",
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: "none",
                  background: active ? "var(--accent-primary)" : "var(--surface)",
                  color: active ? "var(--on-accent)" : "var(--text-muted)",
                }}
              >
                {f === "wide" ? "Wide" : "Long"}
              </button>
            );
          })}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
          {format === "wide"
            ? "One column per set. Cells are item ids; empty cells are ignored."
            : "Two columns: item id, set name. Each row is one (item, set) pair."}
        </p>
      </div>

      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Arabidopsis abiotic stress genes (5-set DEG lists)"
        hint={
          format === "wide"
            ? "CSV · TSV · TXT — one column per set (2+), items in rows · 2 MB max"
            : "CSV · TSV · TXT — two columns (item, set), one per row · 2 MB max"
        }
      />

      <HowToCard
        toolName="upset"
        title="UpSet plot — How to use"
        subtitle="Upload set membership → review → plot intersections"
      >
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
            gridColumn: "1/-1",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            When to use UpSet
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.75,
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            Venn diagrams stop being readable past 3 sets. UpSet plots replace the overlapping
            circles with a matrix of dots: each column is one exclusive intersection (items in those
            sets and no others), with a bar chart on top showing its size. Left bars show per-set
            totals. Click any column to list the items.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Controls
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Sort by size or degree, filter with minimum intersection size and minimum degree.
          </p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            borderRadius: 10,
            padding: "14px 18px",
            border: "1.5px solid var(--info-border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Export
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            Download the plot as <strong>SVG</strong> or <strong>PNG</strong>, plus two CSVs: the
            full intersection table and the long membership matrix.
          </p>
        </div>

        <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            "4+ sets",
            "Exclusive intersections",
            "Sort / filter",
            "Wide or long input",
            "SVG / PNG / CSV export",
            "100% browser-side",
          ].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 20,
                background: "var(--surface)",
                border: "1px solid var(--info-border)",
                color: "var(--text-muted)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </HowToCard>
    </div>
  );
}

// ── Configure step (rename / color / include) ───────────────────────────────

function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  allColumnNames,
  allColumnSets,
  pendingSelection,
  setPendingSelection,
  minDegree,
  setMinDegree,
  maxDegree,
  setMaxDegree,
}) {
  const selectedCount = pendingSelection.length;
  const needsCutoff = selectedCount > 8;
  // Reset the cutoff window back to "all degrees" whenever the gate disappears
  // so it doesn't silently apply to a later 3-set selection. Also re-clamp to
  // the current selection when the gate is active.
  useEffect(() => {
    if (!needsCutoff) {
      setMinDegree(1);
      setMaxDegree(Infinity);
      return;
    }
    setMinDegree((d) => Math.max(1, Math.min(selectedCount, d)));
    setMaxDegree((d) =>
      Number.isFinite(d) ? Math.max(1, Math.min(selectedCount, d)) : selectedCount
    );
  }, [needsCutoff, selectedCount]);
  // Keep min ≤ max whenever either edge changes.
  useEffect(() => {
    if (Number.isFinite(maxDegree) && minDegree > maxDegree) setMinDegree(maxDegree);
  }, [minDegree, maxDegree]);

  const allPossible = selectedCount >= 2 ? Math.pow(2, selectedCount) - 1 : 0;
  const effectiveMaxDegree = Number.isFinite(maxDegree) ? maxDegree : selectedCount;
  const cutoffPreview = useMemo(() => {
    if (!needsCutoff) return null;
    const pendingSets = new Map();
    pendingSelection.forEach((n) => pendingSets.set(n, allColumnSets.get(n)));
    const { membershipMap } = computeMemberships(pendingSelection, pendingSets);
    const all = enumerateIntersections(membershipMap, pendingSelection);
    const kept = all.filter((r) => r.degree >= minDegree && r.degree <= effectiveMaxDegree).length;
    return { nonEmpty: all.length, kept };
  }, [needsCutoff, pendingSelection, allColumnSets, minDegree, effectiveMaxDegree]);

  const toggle = (name) => {
    setPendingSelection((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };
  let pickerStatusText = "Pick at least 2 sets to plot.";
  let pickerStatusColor = "var(--text-muted)";
  if (selectedCount === 1) {
    pickerStatusText = "1 selected — pick at least one more.";
    pickerStatusColor = "var(--warning-text)";
  } else if (selectedCount >= 2) {
    pickerStatusText = `${selectedCount} selected — ready to plot.`;
    pickerStatusColor = "var(--success-text)";
  }
  return (
    <div>
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Sets to include
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 11, color: pickerStatusColor }}>
          {pickerStatusText}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 6,
          }}
        >
          {allColumnNames.map((name) => {
            const checked = pendingSelection.includes(name);
            const size = allColumnSets.get(name)?.size ?? 0;
            return (
              <label
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border)"}`,
                  background: checked ? "var(--info-bg)" : "var(--surface-subtle)",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text)",
                }}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(name)} />
                <span
                  style={{
                    fontWeight: 600,
                    flex: "1 1 auto",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
                <span style={{ color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>
                  {size}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {needsCutoff && (
        <div className="dv-panel" style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Intersection cutoff
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-muted)" }}>
            With {selectedCount} sets, up to {allPossible.toLocaleString()} intersections are
            possible. Keep only intersections whose degree falls in this window:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Min</label>
            <input
              type="number"
              min={1}
              max={selectedCount}
              step={1}
              value={minDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(1, Math.min(selectedCount, v));
                setMinDegree(clamped);
                if (Number.isFinite(maxDegree) && clamped > maxDegree) setMaxDegree(clamped);
              }}
              className="dv-input"
              style={{ width: 72 }}
            />
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Max</label>
            <input
              type="number"
              min={1}
              max={selectedCount}
              step={1}
              value={effectiveMaxDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                const clamped = Math.max(1, Math.min(selectedCount, v));
                setMaxDegree(clamped);
                if (clamped < minDegree) setMinDegree(clamped);
              }}
              className="dv-input"
              style={{ width: 72 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {cutoffPreview
                ? `${cutoffPreview.kept.toLocaleString()} of ${cutoffPreview.nonEmpty.toLocaleString()} non-empty intersections kept.`
                : ""}
            </span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Degree 1 keeps singletons (items unique to one set); degree = {selectedCount} keeps the
            all-sets intersection. You can change this later in the plot controls.
          </p>
        </div>
      )}

      <div className="dv-panel" style={{ marginTop: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>
    </div>
  );
}

// ── Intersection table + item list (below the chart) ────────────────────────

function ItemListPanel({ intersection, setNames, fileName, columnId }) {
  const baseName = fileBaseName(fileName, "upset");
  if (!intersection)
    return (
      <div
        style={{
          padding: "30px 20px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 13,
        }}
      >
        Click an intersection bar or matrix column to view items.
      </div>
    );
  const label = intersectionLabel(intersection.setIndices, setNames);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {columnId != null && (
            <span
              style={{
                fontFamily: "monospace",
                color: "var(--text-muted)",
                marginRight: 6,
              }}
            >
              I{columnId}
            </span>
          )}
          {label}{" "}
          <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
            ({intersection.size} items)
          </span>
        </p>
        <button
          onClick={() =>
            downloadCsv(
              ["Item"],
              intersection.items.map((i) => [i]),
              columnId != null
                ? `${baseName}_upset_I${columnId}.csv`
                : `${baseName}_upset_${intersectionFilenamePart(label)}.csv`
            )
          }
          className="dv-btn dv-btn-secondary"
          style={{
            background: "var(--success-bg)",
            border: "1px solid var(--success-border)",
            color: "var(--success-text)",
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          ⬇ CSV
        </button>
      </div>
      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--surface-subtle)",
        }}
      >
        {intersection.items.map((item, i) => (
          <div
            key={i}
            style={{
              padding: "3px 10px",
              fontSize: 12,
              color: "var(--text)",
              borderBottom: "1px solid var(--border)",
              fontFamily: "monospace",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Plot controls sidebar ────────────────────────────────────────────────────

// Matches the collapsible sidebar tiles used by scatter / boxplot: header
// row with a disclosure arrow, and the content block only mounts when open.
function ControlSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
          fontFamily: "inherit",
        }}
      >
        <span
          className={"dv-disclosure" + (open ? " dv-disclosure-open" : "")}
          aria-hidden="true"
        />
        {title}
      </button>
      {open && (
        <div style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function PlotControls({
  activeSetNames,
  allSets,
  vis,
  updVis,
  chartRef,
  resetAll,
  fileName,
  intersections,
}) {
  const baseName = fileBaseName(fileName, "upset");
  const sv = (k) => (v) => updVis({ [k]: v });
  return (
    <PlotSidebar>
      <ActionsPanel
        onDownloadSvg={() => downloadSvg(chartRef.current, `${baseName}_upset.svg`)}
        onDownloadPng={() => downloadPng(chartRef.current, `${baseName}_upset.png`, 2)}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "Table",
            title:
              "Download the currently-plotted intersection table (Intersection, Degree, Size, + per-set flags). Matches the plot exactly — reflects sort, Top N, Minimum/Maximum degree, and Minimum size filters.",
            onClick: () => {
              const headers = ["Intersection", "Degree", "Size", ...activeSetNames];
              const rows = intersections.map((r) => {
                const label = intersectionLabel(r.setIndices, activeSetNames);
                const flags = activeSetNames.map((_, i) => (r.setIndices.includes(i) ? "1" : "0"));
                return [label, String(r.degree), String(r.size), ...flags];
              });
              downloadCsv(headers, rows, `${baseName}_upset_intersections.csv`);
            },
          },
          {
            label: "Matrix",
            title:
              "Download the membership matrix — one row per item, a 0/1 column for each active set",
            onClick: () => {
              const allItems = new Set();
              for (const n of activeSetNames) for (const item of allSets.get(n)) allItems.add(item);
              const headers = ["Item", ...activeSetNames];
              const rows = [...allItems]
                .sort()
                .map((item) => [
                  item,
                  ...activeSetNames.map((n) => (allSets.get(n).has(item) ? "1" : "0")),
                ]);
              downloadCsv(headers, rows, `${baseName}_upset_membership.csv`);
            },
          },
          {
            label: "All regions",
            title:
              "One CSV per currently-plotted intersection (named _I1, _I2, … matching the on-plot identifiers) plus an _index.csv mapping Id → Intersection, Degree, Size. Your browser may ask once to allow multiple downloads.",
            onClick: () => {
              if (!intersections.length) return;
              const indexHeaders = ["Id", "Intersection", "Degree", "Size"];
              const indexRows = intersections.map((inter, i) => [
                `I${i + 1}`,
                intersectionLabel(inter.setIndices, activeSetNames),
                String(inter.degree),
                String(inter.size),
              ]);
              // Staggered downloads — without the gap, browsers tend to silently
              // drop everything after the first file when a synchronous loop
              // fires multiple <a>.click() events in the same tick.
              downloadCsv(indexHeaders, indexRows, `${baseName}_upset_index.csv`);
              intersections.forEach((inter, i) => {
                setTimeout(
                  () => {
                    downloadCsv(
                      ["Item"],
                      inter.items.map((item) => [item]),
                      `${baseName}_upset_I${i + 1}.csv`
                    );
                  },
                  40 * (i + 1)
                );
              });
            },
          },
        ]}
      />

      <ControlSection title="Columns" defaultOpen>
        <div>
          <span className="dv-label">Sort by</span>
          <select
            value={vis.sortMode}
            onChange={(e) => updVis({ sortMode: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          >
            <option value="size-desc">Size (largest first)</option>
            <option value="size-asc">Size (smallest first)</option>
            <option value="degree-desc">Degree (highest first)</option>
            <option value="degree-asc">Degree (lowest first)</option>
            <option value="sets">Set order</option>
          </select>
        </div>
        <SliderControl
          label="Minimum intersection size"
          value={vis.minSize}
          min={0}
          max={20}
          step={1}
          onChange={sv("minSize")}
        />
        <SliderControl
          label="Minimum degree"
          value={vis.minDegree}
          min={1}
          max={Math.max(1, activeSetNames.length)}
          step={1}
          onChange={(v) => {
            const clamped = Math.max(1, Math.min(activeSetNames.length || 1, v));
            const patch: { minDegree: number; maxDegree?: number } = { minDegree: clamped };
            if (vis.maxDegree != null && clamped > vis.maxDegree) patch.maxDegree = clamped;
            updVis(patch);
          }}
        />
        <SliderControl
          label="Maximum degree"
          value={vis.maxDegree ?? Math.max(1, activeSetNames.length)}
          min={1}
          max={Math.max(1, activeSetNames.length)}
          step={1}
          onChange={(v) => {
            const clamped = Math.max(1, Math.min(activeSetNames.length || 1, v));
            const patch: { maxDegree: number; minDegree?: number } = { maxDegree: clamped };
            if (clamped < vis.minDegree) patch.minDegree = clamped;
            updVis(patch);
          }}
        />
      </ControlSection>

      <ControlSection title="Display">
        <div>
          <div className="dv-label">Title</div>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <div className="dv-label">Subtitle</div>
          <input
            value={vis.plotSubtitle}
            onChange={(e) => updVis({ plotSubtitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%" }}
          />
        </div>
        <SliderControl
          label="Bar opacity"
          value={vis.barOpacity}
          min={0.3}
          max={1}
          step={0.05}
          onChange={sv("barOpacity")}
        />
        <SliderControl
          label="Dot size"
          value={vis.dotSize}
          min={3}
          max={12}
          step={1}
          onChange={sv("dotSize")}
        />
        <SliderControl
          label="Font size"
          value={vis.fontSize}
          min={8}
          max={20}
          step={1}
          onChange={sv("fontSize")}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="dv-label">Background</span>
          <ColorInput value={vis.plotBg} onChange={sv("plotBg")} size={24} />
        </div>
      </ControlSection>
    </PlotSidebar>
  );
}

// Wraps the scrollable plot card with edge fade overlays + a hint pill so a
// user who doesn't notice the browser's scrollbar still sees the content is
// scrollable. Measures the inner element with a ResizeObserver + onScroll.
// ── App ──────────────────────────────────────────────────────────────────────

const VIS_INIT_UPSET = {
  plotTitle: "",
  plotSubtitle: "",
  plotBg: "#ffffff",
  fontSize: 12,
  barOpacity: 1,
  dotSize: 6,
  sortMode: "size-desc",
  minSize: 1,
  minDegree: 1,
  // `maxDegree: null` means "no upper bound" (keep every degree). Persists
  // through loadAutoPrefs as null; the chart renders against setNames.length
  // when null.
  maxDegree: null,
};

function App() {
  const shell = usePlotToolState("upset", VIS_INIT_UPSET);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    vis,
    updVis,
  } = shell;

  const [format, setFormat] = useState("wide");
  const [setNames, setSetNames] = useState([]);
  const [sets, setSets] = useState(new Map());
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedMask, setSelectedMask] = useState(null);
  const [allColumnNames, setAllColumnNames] = useState([]);
  const [allColumnSets, setAllColumnSets] = useState(new Map());
  const [pendingSelection, setPendingSelection] = useState([]);
  const [pendingMinDegree, setPendingMinDegree] = useState(1);
  const [pendingMaxDegree, setPendingMaxDegree] = useState<number>(Infinity);

  const chartRef = useRef();

  // Sets render size-descending; rename/reorder isn't supported since the
  // uploaded file is the source of truth.
  const displaySetNames = useMemo(() => {
    const copy = setNames.slice();
    copy.sort((a, b) => (sets.get(b)?.size || 0) - (sets.get(a)?.size || 0));
    return copy;
  }, [setNames, sets]);

  const allIntersections = useMemo(() => {
    if (displaySetNames.length < 2) return [];
    const { membershipMap } = computeMemberships(displaySetNames, sets);
    return enumerateIntersections(membershipMap, displaySetNames);
  }, [displaySetNames, sets]);

  const sortedIntersections = useMemo(
    () => sortIntersections(allIntersections, vis.sortMode),
    [allIntersections, vis.sortMode]
  );

  const truncatedIntersections = useMemo(
    () =>
      truncateIntersections(sortedIntersections, {
        minSize: vis.minSize,
        minDegree: vis.minDegree,
        maxDegree: vis.maxDegree ?? Infinity,
      }),
    [sortedIntersections, vis.minSize, vis.minDegree, vis.maxDegree]
  );

  const canNavigate = useCallback(
    (target) => {
      if (target === "upload") return true;
      if (target === "configure") return allColumnNames.length >= 2;
      if (target === "plot") {
        // When leaving configure, gate on the pending (pre-commit) selection
        // so the nav button tracks the checkboxes the user just edited.
        if (step === "configure") return pendingSelection.length >= 2;
        return displaySetNames.length >= 2;
      }
      return false;
    },
    [allColumnNames, displaySetNames, step, pendingSelection]
  );

  const commitSelection = useCallback((names, allSets) => {
    const chosen = new Map();
    names.forEach((n) => chosen.set(n, allSets.get(n)));
    setSetNames(names);
    setSets(chosen);
    setSelectedMask(null);
  }, []);

  // StepNavBar's top "Plot" tab routes via shell.setStep directly, so without
  // this intercept the user's configure-step edits (set selection + degree
  // cutoffs) would be lost. Commit the pending selection if it differs from
  // the current one and patch vis with the pending min/max degree before
  // navigating, matching what the old bottom "Plot →" button used to do.
  const navigateStep = useCallback(
    (target) => {
      if (target === "plot" && step === "configure" && pendingSelection.length >= 2) {
        const changed =
          pendingSelection.length !== setNames.length ||
          pendingSelection.some((n) => !setNames.includes(n));
        if (changed) commitSelection(pendingSelection, allColumnSets);
        updVis({
          minDegree: Math.max(1, pendingMinDegree || 1),
          maxDegree: Number.isFinite(pendingMaxDegree) ? pendingMaxDegree : null,
        });
      }
      setStep(target);
    },
    [
      step,
      pendingSelection,
      setNames,
      allColumnSets,
      commitSelection,
      setStep,
      pendingMinDegree,
      pendingMaxDegree,
      updVis,
    ]
  );

  const doParse = useCallback(
    (text, sep, fmt) => {
      const dc = fixDecimalCommas(text, sep);
      setCommaFixed(dc.commaFixed);
      setCommaFixCount(dc.count);
      const { headers, rows } = parseRaw(dc.text, sep);
      if (!headers.length || !rows.length) {
        setParseError("The file appears to be empty or has no data rows.");
        return;
      }
      let parsed;
      try {
        parsed = fmt === "long" ? parseLongFormatSets(headers, rows) : parseSetData(headers, rows);
      } catch (e) {
        setParseError(e.message || "Unable to parse set membership.");
        return;
      }
      const { setNames: sn, sets: ss } = parsed;
      if (sn.length < 2) {
        setParseError(
          fmt === "long"
            ? "Need at least 2 distinct set names in the second column."
            : "Need at least 2 non-empty set columns."
        );
        return;
      }
      setParseError(null);
      setParsedHeaders(headers);
      setParsedRows(rows);
      setAllColumnNames(sn);
      setAllColumnSets(ss);
      setPendingSelection(sn);
      commitSelection(sn, ss);
      setStep("configure");
    },
    [commitSelection]
  );

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride, format);
    },
    [sepOverride, format, doParse]
  );

  const loadExample = useCallback(() => {
    const text = (window as any).__UPSET_EXAMPLE__;
    if (!text) return;
    setSepOverride(",");
    setFormat("wide");
    setFileName("arabidopsis_stress_5set.csv");
    doParse(text, ",", "wide");
  }, [doParse]);

  // Hand-off from the Venn tool's "Open in UpSet" nudge: replaces whatever
  // file the user had previously loaded so the UpSet view shows the same
  // dataset they were just looking at in Venn. Two delivery channels:
  //   1. postMessage from the sibling Venn iframe (when both tools live
  //      under index.html — the common case).
  //   2. sessionStorage one-shot (when Venn was opened standalone and the
  //      "Open in UpSet" link navigates the same window to upset.html).
  // Both are consumed by the same handler so behaviour is identical either
  // way; the sessionStorage entry is removed immediately so a future page
  // load with no fresh hand-off doesn't re-load stale data.
  const handleHandoff = useCallback(
    (payload) => {
      if (!payload || typeof payload.text !== "string") return;
      const sep = typeof payload.sep === "string" ? payload.sep : "";
      const fmt = payload.format === "long" ? "long" : "wide";
      setFileName(typeof payload.fileName === "string" ? payload.fileName : "");
      setSepOverride(sep);
      setFormat(fmt);
      setSelectedMask(null);
      doParse(payload.text, sep, fmt);
    },
    [doParse]
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("dataviz-upset-handoff");
      if (raw) {
        sessionStorage.removeItem("dataviz-upset-handoff");
        handleHandoff(JSON.parse(raw));
      }
    } catch {
      /* storage disabled — handoff just won't fire */
    }
    const onMessage = (e) => {
      const d = e && e.data;
      if (!d || d.type !== "dataviz-handoff") return;
      handleHandoff(d);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleHandoff]);

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(new Map());
    setParseError(null);
    setSelectedMask(null);
    updVis({ _reset: true });
  };

  const setSizes = useMemo(() => {
    const m = new Map();
    for (const n of displaySetNames) m.set(n, (sets.get(n) || new Set()).size);
    return m;
  }, [displaySetNames, sets]);

  const selectedIntersectionIdx = truncatedIntersections.findIndex((g) => g.mask === selectedMask);
  const selectedIntersection =
    selectedIntersectionIdx >= 0 ? truncatedIntersections[selectedIntersectionIdx] : null;
  const selectedColumnId = selectedIntersectionIdx >= 0 ? selectedIntersectionIdx + 1 : null;
  const showColumnWarning = truncatedIntersections.length > 60;

  return (
    <PlotToolShell
      state={{ ...shell, setStep: navigateStep }}
      toolName="upset"
      title="UpSet plot"
      visInit={VIS_INIT_UPSET}
      steps={["upload", "configure", "plot"]}
      canNavigate={canNavigate}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          setSepOverride={setSepOverride}
          format={format}
          setFormat={setFormat}
          handleFileLoad={handleFileLoad}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && allColumnNames.length >= 2 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          allColumnNames={allColumnNames}
          allColumnSets={allColumnSets}
          pendingSelection={pendingSelection}
          setPendingSelection={setPendingSelection}
          minDegree={pendingMinDegree}
          setMinDegree={setPendingMinDegree}
          maxDegree={pendingMaxDegree}
          setMaxDegree={setPendingMaxDegree}
        />
      )}

      {step === "plot" && displaySetNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              activeSetNames={displaySetNames}
              allSets={sets}
              vis={vis}
              updVis={updVis}
              chartRef={chartRef}
              resetAll={resetAll}
              fileName={fileName}
              intersections={truncatedIntersections}
            />

            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {selectedMask != null && (
                <button
                  type="button"
                  onClick={() => setSelectedMask(null)}
                  className="dv-btn dv-btn-secondary"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 14,
                    zIndex: 2,
                    padding: "4px 10px",
                    fontSize: 11,
                  }}
                >
                  Clear selection
                </button>
              )}
              <ScrollablePlotCard>
                <UpsetChart
                  ref={chartRef}
                  setNames={displaySetNames}
                  setSizes={setSizes}
                  intersections={truncatedIntersections}
                  selectedMask={selectedMask}
                  onColumnClick={setSelectedMask}
                  plotTitle={vis.plotTitle}
                  plotSubtitle={vis.plotSubtitle}
                  plotBg={vis.plotBg}
                  fontSize={vis.fontSize}
                  barOpacity={vis.barOpacity}
                  dotSize={vis.dotSize}
                />
              </ScrollablePlotCard>

              {showColumnWarning && (
                <div
                  style={{
                    margin: "8px 0 0",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    fontSize: 11,
                    color: "var(--warning-text)",
                  }}
                >
                  {truncatedIntersections.length} columns — dots may overlap. Raise Minimum
                  intersection size, raise Minimum degree, or lower Maximum degree to reduce.
                </div>
              )}

              {truncatedIntersections.length === 0 && (
                <div
                  style={{
                    margin: "8px 0 0",
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "var(--info-bg)",
                    border: "1px solid var(--info-border)",
                    fontSize: 11,
                    color: "var(--info-text)",
                  }}
                >
                  No intersections to show. Lower Minimum intersection size, lower Minimum degree,
                  or raise Maximum degree.
                </div>
              )}

              <div className="dv-panel" style={{ marginTop: 16 }}>
                <p
                  style={{
                    margin: "0 0 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Items
                </p>
                <ItemListPanel
                  intersection={selectedIntersection}
                  setNames={displaySetNames}
                  fileName={fileName}
                  columnId={selectedColumnId}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </PlotToolShell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="UpSet plot">
    <App />
  </ErrorBoundary>
);
