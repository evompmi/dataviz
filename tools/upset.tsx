// upset.tsx — editable source. Run `npm run build` to compile to upset.js
// Do NOT edit the .js file directly.
const { useState, useReducer, useMemo, useCallback, useRef, useEffect, forwardRef } = React;

// parseSetData and parseLongFormatSets live in tools/shared.js.

// ── Pure helpers ─────────────────────────────────────────────────────────────

// Build the item → bitmask map. Each bit i corresponds to setNames[i].
// Items that appear in none of the provided sets are skipped.
function computeMemberships(setNames, sets) {
  const membershipMap = new Map();
  setNames.forEach((name, i) => {
    const s = sets.get(name);
    if (!s) return;
    for (const item of s) {
      const prev = membershipMap.get(item) || 0;
      membershipMap.set(item, prev | (1 << i));
    }
  });
  return { membershipMap };
}

// Returns exclusive intersections (items in exactly these sets and no others).
// Excludes mask === 0 and empty intersections by construction.
function enumerateIntersections(membershipMap, setNames) {
  const groups = new Map();
  for (const [item, mask] of membershipMap) {
    if (mask === 0) continue;
    if (!groups.has(mask)) groups.set(mask, []);
    groups.get(mask).push(item);
  }
  const out = [];
  for (const [mask, items] of groups) {
    if (items.length === 0) continue;
    items.sort();
    const setIndices = [];
    for (let i = 0; i < setNames.length; i++) {
      if (mask & (1 << i)) setIndices.push(i);
    }
    out.push({ mask, setIndices, degree: setIndices.length, size: items.length, items });
  }
  return out;
}

// Five sort modes. Ties break on ascending mask for determinism.
function sortIntersections(list, mode) {
  const byMaskAsc = (a, b) => a.mask - b.mask;
  const copy = list.slice();
  switch (mode) {
    case "size-asc":
      return copy.sort((a, b) => a.size - b.size || byMaskAsc(a, b));
    case "degree-asc":
      return copy.sort((a, b) => a.degree - b.degree || b.size - a.size || byMaskAsc(a, b));
    case "degree-desc":
      return copy.sort((a, b) => b.degree - a.degree || b.size - a.size || byMaskAsc(a, b));
    case "sets":
      return copy.sort((a, b) => {
        const la = a.setIndices;
        const lb = b.setIndices;
        const n = Math.min(la.length, lb.length);
        for (let i = 0; i < n; i++) {
          if (la[i] !== lb[i]) return la[i] - lb[i];
        }
        if (la.length !== lb.length) return la.length - lb.length;
        return byMaskAsc(a, b);
      });
    case "size-desc":
    default:
      return copy.sort((a, b) => b.size - a.size || byMaskAsc(a, b));
  }
}

// Filter by minimum size and minimum degree, then cap at topN (in the order supplied).
function truncateIntersections(list, { minSize = 1, minDegree = 1, topN = 0 } = {}) {
  const filtered = list.filter((r) => r.size >= minSize && r.degree >= minDegree);
  if (topN > 0 && filtered.length > topN) return filtered.slice(0, topN);
  return filtered;
}

// Human-readable label: "A ∩ B ∩ C".
function intersectionLabel(setIndices, setNames) {
  return setIndices.map((i) => setNames[i]).join(" ∩ ");
}

// Filename-safe rendering — "A ∩ B" → "A_and_B".
function intersectionFilenamePart(label) {
  return label
    .replace(/∩/g, "and")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
}

// Stable id fragment for <g id="col-..."> built from the setIndices.
function intersectionIdKey(setIndices, setNames) {
  return setIndices.map((i) => svgSafeId(setNames[i])).join("-") || "empty";
}

// ── Layout constants ─────────────────────────────────────────────────────────

const SVG_W = 960;
const TITLE_H_WITH = 40;
const TITLE_H_NONE = 16;
const SUBTITLE_H = 18;
const TOP_PANEL_H = 200;
const MATRIX_TOP_PAD = 8;
const BOTTOM_H = 30;
const LEFT_MARGIN = 12;
const LEFT_BAR_MAX = 110;
const LEFT_LABEL_AREA = 82;
const LEFT_GAP = 6;
const MATRIX_LEFT_X = LEFT_MARGIN + LEFT_BAR_MAX + LEFT_GAP + LEFT_LABEL_AREA;
const RIGHT_MARGIN = 20;
const TOP_AXIS_LABEL_W = 6;
const NEUTRAL_BAR = "#648FFF";
const NEUTRAL_DOT = "#333333";
const EMPTY_DOT = "#DDDDDD";
const ZEBRA_FILL = "#F4F4F4";
const GRID_STROKE = "#EFEFEF";
const TEXT_DARK = "#333333";
const TEXT_MUTED = "#555555";

// Row height is tuned so tall set lists stay legible without dominating the view.
function computeRowHeight(nSets) {
  return Math.max(22, Math.min(40, Math.round(140 / Math.max(1, nSets) + 14)));
}

// Column width scales with available space but has sensible bounds.
function computeColWidth(nCols) {
  if (nCols <= 0) return 24;
  const avail = SVG_W - MATRIX_LEFT_X - RIGHT_MARGIN;
  return Math.max(14, Math.min(36, avail / nCols));
}

// ── UpsetChart ──────────────────────────────────────────────────────────────

const UpsetChart = forwardRef<SVGSVGElement, any>(function UpsetChart(
  {
    setNames,
    setSizes,
    setColors,
    intersections,
    selectedMask,
    onColumnClick,
    plotTitle,
    plotSubtitle,
    plotBg,
    fontSize,
    barColor,
    barOpacity,
    dotSize,
  },
  ref
) {
  const nSets = setNames.length;
  const nCols = intersections.length;
  const fSize = fontSize || 12;
  const barFill = barColor || NEUTRAL_BAR;
  const barOp = barOpacity != null ? barOpacity : 1;
  const dotR = dotSize || 6;

  const rowH = computeRowHeight(nSets);
  const colW = computeColWidth(nCols);
  const matrixH = nSets * rowH;
  const titleH = plotTitle ? TITLE_H_WITH : TITLE_H_NONE;
  const subH = plotSubtitle ? SUBTITLE_H : 0;
  const topPanelY = titleH + subH;
  const matrixY = topPanelY + TOP_PANEL_H + MATRIX_TOP_PAD;
  const VH = matrixY + matrixH + BOTTOM_H;

  // Top (intersection-size) bar area.
  const topPanelBottom = topPanelY + TOP_PANEL_H;
  const topAxisMax = Math.max(1, ...intersections.map((r) => r.size));
  const topTicks = makeTicks(0, topAxisMax, 4);
  const topAxisDomainMax = topTicks[topTicks.length - 1];
  const topBarScale = (v) => (v / topAxisDomainMax) * TOP_PANEL_H;

  // Left (set-size) bar area.
  const setSizeMax = Math.max(1, ...setNames.map((n) => setSizes.get(n) || 0));
  const leftTicks = makeTicks(0, setSizeMax, 3);
  const leftAxisDomainMax = leftTicks[leftTicks.length - 1];
  const leftBarScale = (v) => (v / leftAxisDomainMax) * LEFT_BAR_MAX;

  const colX = (i) => MATRIX_LEFT_X + colW * (i + 0.5);
  const rowY = (i) => matrixY + rowH * (i + 0.5);

  // Per-column tint: when an intersection has exactly one set, use that set's
  // colour for the top bar, matrix line, and filled dots; otherwise neutral.
  const columnTint = (inter) => {
    if (inter.degree !== 1) return null;
    return setColors[setNames[inter.setIndices[0]]] || null;
  };

  // Axis tick geometry for the top (intersection size) axis — rendered on the
  // *left* edge of the top panel so the numbers are readable even if there are
  // many bars. The numeric scale is reused for intersection-bar labels.
  const topAxisX = MATRIX_LEFT_X - 4;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SVG_W} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "auto", display: "block" }}
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

      {/* Gridlines in the top-bar panel help readers compare bar heights. */}
      <g id="grid">
        {topTicks.map((t, i) => {
          if (i === 0) return null;
          const y = topPanelBottom - topBarScale(t);
          return (
            <line
              key={`gh-${i}`}
              x1={MATRIX_LEFT_X}
              x2={SVG_W - RIGHT_MARGIN}
              y1={y}
              y2={y}
              stroke={GRID_STROKE}
              strokeWidth="1"
            />
          );
        })}
      </g>

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
        <text
          x={topAxisX - TOP_AXIS_LABEL_W - 28}
          y={topPanelY + TOP_PANEL_H / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(10, fSize - 2)}
          fill={TEXT_MUTED}
          fontFamily="sans-serif"
          transform={`rotate(-90 ${topAxisX - TOP_AXIS_LABEL_W - 28} ${topPanelY + TOP_PANEL_H / 2})`}
        >
          Intersection size
        </text>
      </g>

      {/* Intersection bars + their numeric labels. */}
      <g id="intersection-bars">
        {intersections.map((inter, i) => {
          const cx = colX(i);
          const barW = Math.max(6, colW * 0.7);
          const barX = cx - barW / 2;
          const h = topBarScale(inter.size);
          const tint = columnTint(inter);
          const fill = tint || barFill;
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
                fill={fill}
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

      {/* Matrix zebra stripes — every other row gets a faint band. */}
      <g id="matrix-background">
        {setNames.map((_, i) =>
          i % 2 === 0 ? (
            <rect
              key={`zb-${i}`}
              x={MATRIX_LEFT_X}
              y={matrixY + i * rowH}
              width={SVG_W - RIGHT_MARGIN - MATRIX_LEFT_X}
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
            x={MATRIX_LEFT_X - LEFT_GAP - 2}
            y={rowY(i)}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={Math.max(10, fSize - 1)}
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
          const barRightX = MATRIX_LEFT_X - LEFT_GAP - LEFT_LABEL_AREA;
          return (
            <rect
              key={`sb-${i}`}
              id={`set-size-${svgSafeId(name)}`}
              x={barRightX - w}
              y={rowY(i) - rowH * 0.3}
              width={w}
              height={rowH * 0.6}
              fill={setColors[name] || barFill}
              fillOpacity={barOp}
            />
          );
        })}
      </g>

      <g id="set-size-bar-labels">
        {setNames.map((name, i) => {
          const size = setSizes.get(name) || 0;
          const w = leftBarScale(size);
          const barRightX = MATRIX_LEFT_X - LEFT_GAP - LEFT_LABEL_AREA;
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

      {/* Set-size axis (tick labels below the matrix). */}
      <g id="axis-set-size">
        {leftTicks.map((t, i) => {
          const barRightX = MATRIX_LEFT_X - LEFT_GAP - LEFT_LABEL_AREA;
          const x = barRightX - leftBarScale(t);
          return (
            <text
              key={`la-${i}`}
              x={x}
              y={matrixY + matrixH + 14}
              textAnchor="middle"
              fontSize={Math.max(9, fSize - 3)}
              fill={TEXT_MUTED}
              fontFamily="sans-serif"
            >
              {t}
            </text>
          );
        })}
        <text
          x={MATRIX_LEFT_X - LEFT_GAP - LEFT_LABEL_AREA - LEFT_BAR_MAX / 2}
          y={matrixY + matrixH + 26}
          textAnchor="middle"
          fontSize={Math.max(9, fSize - 3)}
          fill={TEXT_MUTED}
          fontFamily="sans-serif"
        >
          Set size
        </text>
      </g>

      {/* Matrix: per-column group with line + dots. */}
      <g id="matrix">
        <g id="matrix-columns">
          {intersections.map((inter, i) => {
            const cx = colX(i);
            const inSet = new Set(inter.setIndices);
            const tint = columnTint(inter);
            const lineColor = tint || NEUTRAL_DOT;
            const dotFill = tint || NEUTRAL_DOT;
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
                  fill={isSelected ? "rgba(100,143,255,0.12)" : "transparent"}
                  pointerEvents="all"
                />
                {activeRows.length > 1 && (
                  <line
                    className="matrix-line"
                    x1={cx}
                    x2={cx}
                    y1={minR}
                    y2={maxR}
                    stroke={lineColor}
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
                    fill={inSet.has(j) ? dotFill : EMPTY_DOT}
                  />
                ))}
              </g>
            );
          })}
        </g>
      </g>

      <g id="plot-frame">
        <rect
          x={MATRIX_LEFT_X}
          y={topPanelY}
          width={SVG_W - RIGHT_MARGIN - MATRIX_LEFT_X}
          height={TOP_PANEL_H}
          fill="none"
          stroke={TEXT_DARK}
          strokeWidth="0.5"
          strokeOpacity="0.2"
        />
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
            ? "CSV · TSV · TXT — one column per set (2+), items listed in rows"
            : "CSV · TSV · TXT — two columns (item, set), one membership per row"
        }
      />
      <p
        style={{
          margin: "4px 0 12px",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "right",
        }}
      >
        ⚠ Max file size: 2 MB
      </p>

      <div
        style={{
          marginTop: 24,
          borderRadius: 14,
          overflow: "hidden",
          border: "2px solid var(--howto-border)",
          boxShadow: "var(--howto-shadow)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,var(--howto-header-from),var(--howto-header-to))",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {toolIcon("upset", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              UpSet plot — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Upload set membership → review → plot intersections
            </div>
          </div>
        </div>
        <div
          style={{
            background: "var(--info-bg)",
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
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
              circles with a matrix of dots: each column is one exclusive intersection (items in
              those sets and no others), with a bar chart on top showing its size. Left bars show
              per-set totals. Click any column to list the items.
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
              Sort by size or degree, filter with Top N + minimum size, rename / recolor sets, and
              toggle the empty-intersection view.
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
        </div>
      </div>
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
  onCommit,
}) {
  const selectedCount = pendingSelection.length;
  const canPlot = selectedCount >= 2;
  const needsCutoff = selectedCount > 8;
  const [minDegree, setMinDegree] = useState(1);
  // Reset cutoff back to 1 whenever the gate disappears so it doesn't
  // silently apply to a later 3-set selection.
  useEffect(() => {
    if (!needsCutoff) setMinDegree(1);
    else setMinDegree((d) => Math.min(d, selectedCount));
  }, [needsCutoff, selectedCount]);

  const allPossible = selectedCount >= 2 ? Math.pow(2, selectedCount) - 1 : 0;
  const cutoffPreview = useMemo(() => {
    if (!needsCutoff) return null;
    const pendingSets = new Map();
    pendingSelection.forEach((n) => pendingSets.set(n, allColumnSets.get(n)));
    const { membershipMap } = computeMemberships(pendingSelection, pendingSets);
    const all = enumerateIntersections(membershipMap, pendingSelection);
    const kept = all.filter((r) => r.degree >= minDegree).length;
    return { nonEmpty: all.length, kept };
  }, [needsCutoff, pendingSelection, allColumnSets, minDegree]);

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
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>

      <div className="dv-panel" style={{ marginTop: 16 }}>
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
            possible. Keep only intersections involving at least this many sets:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              min={1}
              max={selectedCount}
              step={1}
              value={minDegree}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isFinite(v)) return;
                setMinDegree(Math.max(1, Math.min(selectedCount, v)));
              }}
              className="dv-input"
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {cutoffPreview
                ? `${cutoffPreview.kept.toLocaleString()} of ${cutoffPreview.nonEmpty.toLocaleString()} non-empty intersections kept.`
                : ""}
            </span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Degree 1 keeps singletons (items unique to one set). You can change this later in the
            plot controls.
          </p>
        </div>
      )}

      <button
        onClick={() => canPlot && onCommit(pendingSelection, { minDegree })}
        disabled={!canPlot}
        className="dv-btn dv-btn-primary"
        style={{
          marginTop: 16,
          opacity: canPlot ? 1 : 0.5,
          cursor: canPlot ? "pointer" : "not-allowed",
        }}
      >
        Plot →
      </button>
    </div>
  );
}

// ── Intersection table + item list (below the chart) ────────────────────────

function ItemListPanel({ intersection, setNames, fileName }) {
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
              `${baseName}_upset_${intersectionFilenamePart(label)}.csv`
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

function PlotControls({
  allSetNames,
  allSets,
  activeSetNames,
  activeSets,
  setColors,
  onToggleSet,
  onColorChange,
  onRename,
  vis,
  updVis,
  chartRef,
  resetAll,
  fileName,
  intersections,
  setOrderMode,
  onSetOrderChange,
}) {
  const baseName = fileBaseName(fileName, "upset");
  const sv = (k) => (v) => updVis({ [k]: v });
  return (
    <div
      style={{
        width: 279,
        flexShrink: 0,
        position: "sticky",
        top: 24,
        maxHeight: "calc(100vh - 90px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <ActionsPanel
        onDownloadSvg={() => downloadSvg(chartRef.current, `${baseName}_upset.svg`)}
        onDownloadPng={() => downloadPng(chartRef.current, `${baseName}_upset.png`, 2)}
        onReset={resetAll}
        extraDownloads={[
          {
            label: "Table",
            title:
              "Download the full intersection table (Intersection, Degree, Size, + per-set flags)",
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
        ]}
      />

      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Sets
        </p>
        <div style={{ marginBottom: 8 }}>
          <span className="dv-label">Row order</span>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["size-desc", "as-entered"] as const).map((mode) => {
              const active = mode === setOrderMode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSetOrderChange(mode)}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                  }}
                >
                  {mode === "size-desc" ? "Size ↓" : "As entered"}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {allSetNames.map((name, i) => {
            const active = activeSets.has(name);
            const canUncheck = activeSets.size > 2;
            return (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: active ? "var(--surface-sunken)" : "var(--surface-subtle)",
                  border: active ? "1px solid var(--border-strong)" : "1px solid var(--border)",
                  opacity: active ? 1 : 0.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={active && !canUncheck}
                  onChange={() => onToggleSet(name)}
                  style={{
                    accentColor: setColors[name] || PALETTE[i % PALETTE.length],
                    flexShrink: 0,
                  }}
                />
                <ColorInput
                  value={setColors[name] || PALETTE[i % PALETTE.length]}
                  onChange={(v) => onColorChange(name, v)}
                  size={20}
                />
                <input
                  key={name}
                  defaultValue={name}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: 600,
                    color: active ? "var(--text)" : "var(--text-faint)",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface)",
                    fontFamily: "monospace",
                    fontSize: 12,
                    padding: "2px 6px",
                    borderRadius: 3,
                    outline: "none",
                  }}
                  onBlur={(e) => {
                    const nv = e.target.value.trim();
                    if (nv && nv !== name) {
                      if (!onRename(name, nv)) e.target.value = name;
                    } else if (!nv) e.target.value = name;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                <span
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 11,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({allSets.get(name).size})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Columns
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            label="Top N"
            value={vis.topN}
            min={0}
            max={60}
            step={1}
            displayValue={vis.topN === 0 ? "All" : String(vis.topN)}
            onChange={sv("topN")}
          />
          <SliderControl
            label="Min size"
            value={vis.minSize}
            min={0}
            max={20}
            step={1}
            onChange={sv("minSize")}
          />
          <SliderControl
            label="Min degree"
            value={vis.minDegree}
            min={1}
            max={Math.max(1, activeSetNames.length)}
            step={1}
            onChange={sv("minDegree")}
          />
        </div>
      </div>

      <div className="dv-panel">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
          Display
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="dv-label">Bar colour</span>
            <ColorInput value={vis.barColor} onChange={sv("barColor")} size={24} />
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
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState("upload");
  const [parseError, setParseError] = useState(null);
  const [sepOverride, setSepOverride] = useState("");
  const [commaFixed, setCommaFixed] = useState(false);
  const [commaFixCount, setCommaFixCount] = useState(0);
  const [format, setFormat] = useState("wide");
  const [setNames, setSetNames] = useState([]);
  const [sets, setSets] = useState(new Map());
  const [setColors, setSetColors] = useState({});
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [selectedMask, setSelectedMask] = useState(null);
  const [activeSets, setActiveSets] = useState(new Set());
  const [allColumnNames, setAllColumnNames] = useState([]);
  const [allColumnSets, setAllColumnSets] = useState(new Map());
  const [pendingSelection, setPendingSelection] = useState([]);
  const [setOrderMode, setSetOrderMode] = useState("size-desc");

  const visInit = {
    plotTitle: "",
    plotSubtitle: "",
    plotBg: "#ffffff",
    fontSize: 12,
    barColor: "#648FFF",
    barOpacity: 1,
    dotSize: 6,
    sortMode: "size-desc",
    topN: 20,
    minSize: 1,
    minDegree: 1,
  };
  const [vis, updVis] = useReducer(
    (s, a) => (a._reset ? { ...visInit } : { ...s, ...a }),
    visInit,
    (init) => loadAutoPrefs("upset", init)
  );
  useEffect(() => {
    saveAutoPrefs("upset", vis);
  }, [vis]);

  const chartRef = useRef();

  const activeSetNames = useMemo(
    () => setNames.filter((n) => activeSets.has(n)),
    [setNames, activeSets]
  );

  // Row order: size descending by default, with toggle to as-entered. The
  // row order affects bit assignment, so memberships re-index accordingly.
  const displaySetNames = useMemo(() => {
    if (setOrderMode === "as-entered") return activeSetNames;
    const copy = activeSetNames.slice();
    copy.sort((a, b) => (sets.get(b)?.size || 0) - (sets.get(a)?.size || 0));
    return copy;
  }, [activeSetNames, setOrderMode, sets]);

  const displaySets = useMemo(() => {
    const m = new Map();
    for (const n of displaySetNames) m.set(n, sets.get(n));
    return m;
  }, [displaySetNames, sets]);

  const allIntersections = useMemo(() => {
    if (displaySetNames.length < 2) return [];
    const { membershipMap } = computeMemberships(displaySetNames, displaySets);
    return enumerateIntersections(membershipMap, displaySetNames);
  }, [displaySetNames, displaySets]);

  const sortedIntersections = useMemo(
    () => sortIntersections(allIntersections, vis.sortMode),
    [allIntersections, vis.sortMode]
  );

  const truncatedIntersections = useMemo(
    () =>
      truncateIntersections(sortedIntersections, {
        minSize: vis.minSize,
        minDegree: vis.minDegree,
        topN: vis.topN,
      }),
    [sortedIntersections, vis.minSize, vis.minDegree, vis.topN]
  );

  const canNavigate = useCallback(
    (target) => {
      if (target === "upload") return true;
      if (target === "configure") return allColumnNames.length >= 2;
      if (target === "plot") return activeSetNames.length >= 2;
      return false;
    },
    [allColumnNames, activeSetNames]
  );

  const commitSelection = useCallback((names, allSets) => {
    const chosen = new Map();
    names.forEach((n) => chosen.set(n, allSets.get(n)));
    setSetNames(names);
    setSets(chosen);
    setActiveSets(new Set(names));
    const cols = {};
    names.forEach((n, i) => {
      cols[n] = PALETTE[i % PALETTE.length];
    });
    setSetColors(cols);
    setSelectedMask(null);
  }, []);

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

  const handleColorChange = (name, color) => {
    setSetColors((prev) => ({ ...prev, [name]: color }));
  };

  const handleRename = (oldName, newName) => {
    if (oldName === newName || setNames.includes(newName)) return false;
    setSetNames((prev) => prev.map((n) => (n === oldName ? newName : n)));
    setSets((prev) => {
      const m = new Map();
      for (const [k, v] of prev) m.set(k === oldName ? newName : k, v);
      return m;
    });
    setSetColors((prev) => {
      const c = {};
      for (const [k, v] of Object.entries(prev)) c[k === oldName ? newName : k] = v;
      return c;
    });
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(oldName)) {
        s.delete(oldName);
        s.add(newName);
      }
      return s;
    });
    return true;
  };

  const handleToggleSet = (name) => {
    setActiveSets((prev) => {
      const s = new Set(prev);
      if (s.has(name)) s.delete(name);
      else s.add(name);
      return s;
    });
    setSelectedMask(null);
  };

  const resetAll = () => {
    setStep("upload");
    setFileName("");
    setSetNames([]);
    setSets(new Map());
    setSetColors({});
    setActiveSets(new Set());
    setParseError(null);
    setSelectedMask(null);
    setSetOrderMode("size-desc");
    updVis({ _reset: true });
  };

  const setSizes = useMemo(() => {
    const m = new Map();
    for (const n of displaySetNames) m.set(n, (sets.get(n) || new Set()).size);
    return m;
  }, [displaySetNames, sets]);

  const selectedIntersection = truncatedIntersections.find((g) => g.mask === selectedMask) || null;
  const showColumnWarning = truncatedIntersections.length > 60;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <PageHeader
        toolName="upset"
        title="UpSet plot"
        subtitle="Intersection sizes across many sets (4+ sets)"
        right={<PrefsPanel tool="upset" vis={vis} visInit={visInit} updVis={updVis} />}
      />

      <StepNavBar
        steps={["upload", "configure", "plot"]}
        currentStep={step}
        onStepChange={setStep}
        canNavigate={canNavigate}
      />

      <CommaFixBanner commaFixed={commaFixed} commaFixCount={commaFixCount} />
      {parseError && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>🚫</span>
          <span
            style={{
              fontSize: 12,
              color: "var(--danger-text)",
              fontWeight: 600,
              whiteSpace: "pre-line",
            }}
          >
            {parseError}
          </span>
        </div>
      )}

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
          onCommit={(names, { minDegree } = { minDegree: 1 }) => {
            commitSelection(names, allColumnSets);
            updVis({ minDegree: Math.max(1, minDegree || 1) });
            setStep("plot");
          }}
        />
      )}

      {step === "plot" && activeSetNames.length >= 2 && (
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
            <PlotControls
              allSetNames={setNames}
              allSets={sets}
              activeSetNames={activeSetNames}
              activeSets={activeSets}
              setColors={setColors}
              onToggleSet={handleToggleSet}
              onColorChange={handleColorChange}
              onRename={handleRename}
              vis={vis}
              updVis={updVis}
              chartRef={chartRef}
              resetAll={resetAll}
              fileName={fileName}
              intersections={sortedIntersections}
              setOrderMode={setOrderMode}
              onSetOrderChange={setSetOrderMode}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="dv-panel dv-plot-card"
                style={{
                  padding: 20,
                  background: "var(--plot-card-bg)",
                  borderColor: "var(--plot-card-border)",
                }}
              >
                <UpsetChart
                  ref={chartRef}
                  setNames={displaySetNames}
                  setSizes={setSizes}
                  setColors={setColors}
                  intersections={truncatedIntersections}
                  selectedMask={selectedMask}
                  onColumnClick={setSelectedMask}
                  plotTitle={vis.plotTitle}
                  plotSubtitle={vis.plotSubtitle}
                  plotBg={vis.plotBg}
                  fontSize={vis.fontSize}
                  barColor={vis.barColor}
                  barOpacity={vis.barOpacity}
                  dotSize={vis.dotSize}
                />
              </div>

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
                  {truncatedIntersections.length} columns — dots may overlap. Reduce with Top N or
                  raise Min size.
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
                  No intersections to show. Lower the minimum size, or raise Top N.
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
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="UpSet plot">
    <App />
  </ErrorBoundary>
);
