const { useState, useEffect, useRef, useReducer, useMemo, useCallback, forwardRef } = React,
  MARGIN = { top: 20, right: 20, bottom: 48, left: 62 },
  STAR_ROW_H = 18,
  ERROR_KINDS = [
    { value: "sem", label: "SEM" },
    { value: "sd", label: "SD" },
    { value: "ci95", label: "95% CI" },
  ],
  round4 = (l) => Math.round(l * 1e4) / 1e4;
function buildLineD(l) {
  const o = l.filter((c) => c.y != null);
  return o.length < 2 ? "" : "M" + o.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join("L");
}
function formatX(l) {
  return l == null || !Number.isFinite(l) || Number.isInteger(l) ? String(l) : String(round4(l));
}
function runChosenTest(l, o) {
  try {
    return l === "studentT"
      ? tTest(o[0], o[1], { equalVar: !0 })
      : l === "welchT"
        ? tTest(o[0], o[1], { equalVar: !1 })
        : l === "mannWhitney"
          ? mannWhitneyU(o[0], o[1])
          : l === "oneWayANOVA"
            ? oneWayANOVA(o)
            : l === "welchANOVA"
              ? welchANOVA(o)
              : l === "kruskalWallis"
                ? kruskalWallis(o)
                : { error: "unknown test" };
  } catch (c) {
    return { error: String((c && c.message) || c) };
  }
}
function computeSeries(l, o, c, g, b, N, m) {
  const i = [],
    a = new Map();
  for (let x = 0; x < l.length; x++) {
    const f = l[x][c],
      u = l[x][g];
    if (f == null || u == null || !Number.isFinite(f) || !Number.isFinite(u)) continue;
    const t = b == null ? "(all)" : String(o[x][b] ?? "");
    a.has(t) || (a.set(t, new Map()), i.push(t));
    const p = a.get(t);
    (p.has(f) || p.set(f, []), p.get(f).push(u));
  }
  return i.map((x, f) => {
    const u = a.get(x),
      p = [...u.keys()]
        .sort((d, k) => d - k)
        .map((d) => {
          const k = u.get(d),
            y = k.length,
            F = sampleMean(k),
            S = y > 1 ? sampleSD(k) : 0,
            T = y > 1 ? S / Math.sqrt(y) : 0,
            L = y > 1 ? tinv(0.975, y - 1) * T : 0;
          return { x: d, values: k, n: y, mean: F, sd: S, sem: T, ci95: L };
        });
    return { name: x, color: N[x] || m[f % m.length], points: p };
  });
}
function computePerXStats(l) {
  const o = new Set();
  for (const i of l) for (const a of i.points) o.add(a.x);
  const c = [...o].sort((i, a) => i - a),
    g = [];
  for (const i of c) {
    const a = [];
    for (const d of l) {
      const k = d.points.find((y) => y.x === i);
      k && k.n >= 2 && a.push({ name: d.name, values: k.values });
    }
    if (a.length < 2) continue;
    const x = a.map((d) => d.values),
      f = a.map((d) => d.name),
      u = selectTest(x),
      t = u && u.recommendation && u.recommendation.test ? u.recommendation.test : null,
      p = t ? runChosenTest(t, x) : null;
    g.push({ x: i, names: f, values: x, chosenTest: t, result: p });
  }
  const b = [],
    N = [];
  g.forEach((i, a) => {
    i.result && !i.result.error && Number.isFinite(i.result.p) && (b.push(a), N.push(i.result.p));
  });
  const m = N.length > 0 ? bhAdjust(N) : [];
  return (g.forEach((i) => (i.pAdj = null)), b.forEach((i, a) => (g[i].pAdj = m[a])), g);
}
const Chart = forwardRef(function (
  {
    series: o,
    perXStats: c,
    xMin: g,
    xMax: b,
    yMin: N,
    yMax: m,
    vbW: i,
    vbH: a,
    xLabel: x,
    yLabel: f,
    plotTitle: u,
    plotSubtitle: t,
    plotBg: p,
    showGrid: d,
    gridColor: k,
    lineWidth: y,
    pointRadius: F,
    errorStrokeWidth: S,
    errorCapWidth: T,
    errorType: L,
    svgLegend: Y,
    showStars: X,
  },
  K
) {
  const n = (e) => {
      const w = Math.max(0, ...(e.items || []).map((R) => (R.label || "").length));
      return Math.max(110, w * 6 + 28);
    },
    B = computeLegendHeight(Y, i - MARGIN.left - MARGIN.right, n),
    v = (u ? 20 : 0) + (t ? 16 : 0),
    W = X && c.some((e) => e.pAdj != null) ? STAR_ROW_H : 0,
    I = i - MARGIN.left - MARGIN.right,
    U = a - MARGIN.top - MARGIN.bottom,
    M = MARGIN.top + W,
    r = U - W,
    q = b - g || 1,
    Z = m - N || 1,
    z = (e) => MARGIN.left + ((e - g) / q) * I,
    C = (e) => M + (1 - (e - N) / Z) * r,
    ee = (e) => Math.max(N, Math.min(m, e)),
    te = makeTicks(g, b, 8),
    j = makeTicks(N, m, 6),
    le = (e) => (L === "sd" ? e.sd : L === "ci95" ? e.ci95 : e.sem);
  return React.createElement(
    "svg",
    {
      ref: K,
      viewBox: `0 0 ${i} ${a + B + v}`,
      style: { width: "100%", height: "auto", display: "block" },
      xmlns: "http://www.w3.org/2000/svg",
      role: "img",
      "aria-label": u || "Line chart",
    },
    React.createElement("title", null, u || "Line chart"),
    React.createElement(
      "desc",
      null,
      `Line chart with ${o.length} group${o.length === 1 ? "" : "s"}`
    ),
    u &&
      React.createElement(
        "g",
        { id: "title" },
        React.createElement(
          "text",
          {
            x: i / 2,
            y: 17,
            textAnchor: "middle",
            fontSize: "15",
            fontWeight: "700",
            fill: "#222",
            fontFamily: "sans-serif",
          },
          u
        )
      ),
    t &&
      React.createElement(
        "g",
        { id: "subtitle" },
        React.createElement(
          "text",
          {
            x: i / 2,
            y: u ? 34 : 17,
            textAnchor: "middle",
            fontSize: "12",
            fill: "#888",
            fontFamily: "sans-serif",
          },
          t
        )
      ),
    React.createElement(
      "g",
      { id: "chart", transform: `translate(0, ${v})` },
      React.createElement("rect", {
        id: "plot-area-background",
        x: MARGIN.left,
        y: MARGIN.top,
        width: I,
        height: U,
        fill: p || "#fff",
      }),
      d &&
        React.createElement(
          "g",
          { id: "grid" },
          j.map((e) =>
            React.createElement("line", {
              key: `gy-${e}`,
              x1: MARGIN.left,
              x2: MARGIN.left + I,
              y1: C(e),
              y2: C(e),
              stroke: k || "#e0e0e0",
              strokeWidth: "0.5",
            })
          ),
          te.map((e) =>
            React.createElement("line", {
              key: `gx-${e}`,
              x1: z(e),
              x2: z(e),
              y1: M,
              y2: M + r,
              stroke: k || "#e0e0e0",
              strokeWidth: "0.5",
            })
          )
        ),
      React.createElement(
        "g",
        { id: "traces" },
        o.map((e) => {
          const w = e.points.map(($) => ({ x: z($.x), y: $.mean != null ? C($.mean) : null })),
            R = buildLineD(w);
          return R
            ? React.createElement("path", {
                key: `line-${e.name}`,
                id: `trace-${svgSafeId(e.name)}`,
                d: R,
                fill: "none",
                stroke: e.color,
                strokeWidth: y,
              })
            : null;
        })
      ),
      React.createElement(
        "g",
        { id: "error-bars" },
        o.map((e) =>
          React.createElement(
            "g",
            { key: `errs-${e.name}`, id: `errbars-${svgSafeId(e.name)}` },
            e.points.map((w, R) => {
              if (w.n < 2 || w.mean == null) return null;
              const $ = le(w);
              if (!$ || !Number.isFinite($)) return null;
              const H = z(w.x),
                V = C(ee(w.mean + $)),
                s = C(ee(w.mean - $)),
                h = T / 2;
              return React.createElement(
                "g",
                { key: `err-${R}` },
                React.createElement("line", {
                  x1: H,
                  x2: H,
                  y1: V,
                  y2: s,
                  stroke: e.color,
                  strokeWidth: S,
                }),
                React.createElement("line", {
                  x1: H - h,
                  x2: H + h,
                  y1: V,
                  y2: V,
                  stroke: e.color,
                  strokeWidth: S,
                }),
                React.createElement("line", {
                  x1: H - h,
                  x2: H + h,
                  y1: s,
                  y2: s,
                  stroke: e.color,
                  strokeWidth: S,
                })
              );
            })
          )
        )
      ),
      React.createElement(
        "g",
        { id: "data-points" },
        o.map((e) =>
          React.createElement(
            "g",
            { key: `pts-${e.name}`, id: `points-${svgSafeId(e.name)}` },
            e.points.map((w, R) =>
              w.mean == null
                ? null
                : React.createElement("circle", {
                    key: `pt-${R}`,
                    cx: z(w.x),
                    cy: C(w.mean),
                    r: F,
                    fill: e.color,
                    stroke: "#fff",
                    strokeWidth: "0.5",
                  })
            )
          )
        )
      ),
      X &&
        W > 0 &&
        React.createElement(
          "g",
          { id: "significance-stars" },
          c.map((e, w) => {
            if (e.pAdj == null) return null;
            const R = pStars(e.pAdj);
            return !R || R === "ns"
              ? null
              : React.createElement(
                  "text",
                  {
                    key: `star-${w}`,
                    x: z(e.x),
                    y: MARGIN.top + 14,
                    textAnchor: "middle",
                    fontSize: "13",
                    fontWeight: "700",
                    fill: "#222",
                    fontFamily: "sans-serif",
                  },
                  R
                );
          })
        ),
      React.createElement(
        "g",
        { id: "plot-frame", fill: "none", stroke: "#333", strokeWidth: "1" },
        React.createElement("line", { x1: MARGIN.left, y1: M, x2: MARGIN.left + I, y2: M }),
        React.createElement("line", { x1: MARGIN.left + I, y1: M, x2: MARGIN.left + I, y2: M + r }),
        React.createElement("line", { x1: MARGIN.left, y1: M + r, x2: MARGIN.left + I, y2: M + r }),
        React.createElement("line", { x1: MARGIN.left, y1: M, x2: MARGIN.left, y2: M + r })
      ),
      React.createElement(
        "g",
        { id: "axis-x" },
        te.map((e) =>
          React.createElement(
            "g",
            { key: e },
            React.createElement("line", {
              x1: z(e),
              x2: z(e),
              y1: M + r,
              y2: M + r + 5,
              stroke: "#333",
              strokeWidth: "1",
            }),
            React.createElement(
              "text",
              {
                x: z(e),
                y: M + r + 18,
                textAnchor: "middle",
                fontSize: "11",
                fill: "#555",
                fontFamily: "sans-serif",
              },
              e
            )
          )
        )
      ),
      React.createElement(
        "g",
        { id: "axis-y" },
        j.map((e) =>
          React.createElement(
            "g",
            { key: e },
            React.createElement("line", {
              x1: MARGIN.left - 5,
              x2: MARGIN.left,
              y1: C(e),
              y2: C(e),
              stroke: "#333",
              strokeWidth: "1",
            }),
            React.createElement(
              "text",
              {
                x: MARGIN.left - 8,
                y: C(e) + 4,
                textAnchor: "end",
                fontSize: "11",
                fill: "#555",
                fontFamily: "sans-serif",
              },
              e % 1 === 0 ? e : e.toFixed(1)
            )
          )
        )
      ),
      x &&
        React.createElement(
          "g",
          { id: "x-axis-label" },
          React.createElement(
            "text",
            {
              x: MARGIN.left + I / 2,
              y: a - 4,
              textAnchor: "middle",
              fontSize: "13",
              fill: "#444",
              fontFamily: "sans-serif",
            },
            x
          )
        ),
      f &&
        React.createElement(
          "g",
          { id: "y-axis-label" },
          React.createElement(
            "text",
            {
              transform: `translate(14,${M + r / 2}) rotate(-90)`,
              textAnchor: "middle",
              fontSize: "13",
              fill: "#444",
              fontFamily: "sans-serif",
            },
            f
          )
        ),
      renderSvgLegend(Y, a + 10, MARGIN.left, i - MARGIN.left - MARGIN.right, n)
    )
  );
});
function ControlSection({ title: l, defaultOpen: o = !1, children: c }) {
  const [g, b] = useState(o);
  return React.createElement(
    "div",
    { className: "dv-panel", style: { marginBottom: 0, padding: 0 } },
    React.createElement(
      "button",
      {
        onClick: () => b(!g),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "7px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
          textAlign: "left",
        },
      },
      React.createElement("span", {
        className: "dv-disclosure" + (g ? " dv-disclosure-open" : ""),
        "aria-hidden": "true",
      }),
      l
    ),
    g &&
      React.createElement(
        "div",
        { style: { padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 } },
        c
      )
  );
}
function UploadStep({
  sepOverride: l,
  setSepOverride: o,
  rawText: c,
  doParse: g,
  handleFileLoad: b,
  onLoadExample: N,
}) {
  return React.createElement(
    "div",
    null,
    React.createElement(UploadPanel, {
      sepOverride: l,
      onSepChange: (m) => {
        (o(m), c && g(c, m));
      },
      onFileLoad: b,
      onLoadExample: N,
      exampleLabel: "Bacterial growth curves (3 strains \xD7 5 timepoints \xD7 3 reps)",
      hint: "CSV \xB7 TSV \xB7 TXT \u2014 one row per observation, columns for X, Y, and grouping variable",
    }),
    React.createElement(
      "p",
      {
        style: {
          margin: "4px 0 12px",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "right",
        },
      },
      "Max file size: 2 MB"
    ),
    React.createElement(
      "div",
      {
        style: {
          marginTop: 24,
          borderRadius: 14,
          overflow: "hidden",
          border: "2px solid var(--howto-border)",
          boxShadow: "var(--howto-shadow)",
        },
      },
      React.createElement(
        "div",
        {
          style: {
            background: "linear-gradient(135deg,var(--howto-header-from),var(--howto-header-to))",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          },
        },
        toolIcon("lineplot", 24, { circle: !0 }),
        React.createElement(
          "div",
          null,
          React.createElement(
            "div",
            { style: { color: "#fff", fontWeight: 700, fontSize: 15 } },
            "Line Plot \u2014 How to use"
          ),
          React.createElement(
            "div",
            { style: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 } },
            "Upload \u2192 Preview & pick X / Y / Group \u2192 Plot with per-x statistics"
          )
        )
      ),
      React.createElement(
        "div",
        {
          style: {
            background: "var(--info-bg)",
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          },
        },
        React.createElement(
          "div",
          {
            style: {
              background: "var(--surface)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1.5px solid var(--info-border)",
              gridColumn: "1/-1",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "1px",
              },
            },
            "Data layout"
          ),
          React.createElement(
            "p",
            { style: { fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 } },
            React.createElement("strong", null, "Long format"),
            " \u2014 one ",
            React.createElement("strong", null, "row"),
            " per observation, with a numeric",
            " ",
            React.createElement("strong", null, "X"),
            ", a numeric ",
            React.createElement("strong", null, "Y"),
            ", and a categorical",
            " ",
            React.createElement("strong", null, "group"),
            " column. Replicates share the same (X, group) pair. Replicates are averaged to build the line; their spread becomes the error bar."
          )
        ),
        React.createElement(
          "div",
          {
            style: {
              background: "var(--surface)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1.5px solid var(--info-border)",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              },
            },
            "Error bars"
          ),
          React.createElement(
            "p",
            { style: { fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 } },
            "Pick ",
            React.createElement("strong", null, "SEM"),
            " (default), ",
            React.createElement("strong", null, "SD"),
            ", or",
            " ",
            React.createElement("strong", null, "95% CI"),
            ". CI uses the ",
            React.createElement("em", null, "t"),
            " quantile at ",
            React.createElement("em", null, "n\u22121"),
            " degrees of freedom. Error bars only render when a group has \u2265 2 replicates at that X."
          )
        ),
        React.createElement(
          "div",
          {
            style: {
              background: "var(--surface)",
              borderRadius: 10,
              padding: "14px 18px",
              border: "1.5px solid var(--info-border)",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                fontSize: 10,
                fontWeight: 700,
                color: "var(--accent-primary)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              },
            },
            "Per-x statistics"
          ),
          React.createElement(
            "p",
            { style: { fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 } },
            "At every X shared by \u2265 2 groups, the right test is picked automatically (",
            React.createElement("em", null, "t"),
            " / Welch / Mann-Whitney; ANOVA / Welch-ANOVA / Kruskal-Wallis). P-values are",
            " ",
            React.createElement("strong", null, "BH-adjusted"),
            " across the X-axis; stars mark significant points."
          )
        ),
        React.createElement(
          "div",
          { style: { gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" } },
          [
            "Long-format (x, y, group)",
            "SEM / SD / 95% CI",
            "Per-x test auto-routing",
            "BH-adjusted significance stars",
            "Decision trace & R export",
            "100% browser-side",
          ].map((m) =>
            React.createElement(
              "span",
              {
                key: m,
                style: {
                  fontSize: 10,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: "var(--surface)",
                  border: "1px solid var(--info-border)",
                  color: "var(--text-muted)",
                },
              },
              m
            )
          )
        )
      )
    )
  );
}
function ConfigureStep({
  parsed: l,
  fileName: o,
  xCol: c,
  setXCol: g,
  yCol: b,
  setYCol: N,
  groupCol: m,
  setGroupCol: i,
  numericCols: a,
  categoricalCols: x,
  setStep: f,
}) {
  const u = c != null && b != null && a.length >= 2;
  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 16 } },
    React.createElement(
      "div",
      { className: "dv-panel", style: { marginBottom: 0 } },
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 8,
          },
        },
        React.createElement(
          "p",
          { style: { margin: 0, fontSize: 13, color: "var(--text-muted)" } },
          "Loaded ",
          React.createElement("strong", { style: { color: "var(--text)" } }, o || "pasted data"),
          " \u2014",
          " ",
          l.rawData.length,
          " rows \xD7 ",
          l.headers.length,
          " columns"
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "dv-btn dv-btn-plot",
            disabled: !u,
            onClick: () => f("plot"),
          },
          "Plot \u2192"
        )
      ),
      React.createElement(DataPreview, { headers: l.headers, rows: l.rawData, maxRows: 10 })
    ),
    React.createElement(
      "div",
      { className: "dv-panel", style: { marginBottom: 0 } },
      React.createElement(
        "p",
        {
          style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" },
        },
        "Column roles"
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          },
        },
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "dv-label" }, "X (numeric)"),
          React.createElement(
            "select",
            {
              value: c ?? "",
              onChange: (t) => g(parseInt(t.target.value)),
              className: "dv-select",
              style: { width: "100%" },
            },
            a.map((t) => React.createElement("option", { key: t, value: t }, l.headers[t]))
          )
        ),
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "dv-label" }, "Y (numeric)"),
          React.createElement(
            "select",
            {
              value: b ?? "",
              onChange: (t) => N(parseInt(t.target.value)),
              className: "dv-select",
              style: { width: "100%" },
            },
            a.map((t) => React.createElement("option", { key: t, value: t }, l.headers[t]))
          )
        ),
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "dv-label" }, "Group by"),
          React.createElement(
            "select",
            {
              value: m ?? "",
              onChange: (t) => i(t.target.value === "" ? null : parseInt(t.target.value)),
              className: "dv-select",
              style: { width: "100%" },
            },
            React.createElement("option", { value: "" }, "(single line)"),
            x.map((t) => React.createElement("option", { key: t, value: t }, l.headers[t]))
          )
        )
      ),
      !u &&
        React.createElement(
          "p",
          { style: { margin: "10px 0 0", fontSize: 11, color: "var(--warning-text)" } },
          "Need at least two numeric columns to plot."
        )
    )
  );
}
function PlotControls({
  parsed: l,
  fileName: o,
  xCol: c,
  setXCol: g,
  yCol: b,
  setYCol: N,
  groupCol: m,
  setGroupCol: i,
  numericCols: a,
  categoricalCols: x,
  series: f,
  setGroupColor: u,
  vis: t,
  updVis: p,
  autoAxis: d,
  errorType: k,
  setErrorType: y,
  showStars: F,
  setShowStars: S,
  statsRows: T,
  svgRef: L,
  resetAll: Y,
}) {
  const X = (n) => (B) => p({ [n]: B }),
    K = () => {
      const n = ["x", "test", "statistic", "p", "p_adj", "stars"],
        B = T.map((v) => {
          const W =
              v.result && !v.result.error
                ? v.result.t != null
                  ? v.result.t
                  : v.result.U != null
                    ? v.result.U
                    : v.result.F != null
                      ? v.result.F
                      : v.result.H != null
                        ? v.result.H
                        : ""
                : "",
            I = v.result && !v.result.error ? v.result.p : "",
            U = v.pAdj != null ? v.pAdj : "",
            M = v.pAdj != null ? pStars(v.pAdj) : "";
          return [formatX(v.x), v.chosenTest || "", W, I, U, M];
        });
      downloadCsv(n, B, `${fileBaseName(o, "lineplot")}_stats.csv`);
    };
  return React.createElement(
    "div",
    {
      style: {
        width: 279,
        flexShrink: 0,
        position: "sticky",
        top: 24,
        maxHeight: "calc(100vh - 90px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      },
    },
    React.createElement(ActionsPanel, {
      onDownloadSvg: () => downloadSvg(L.current, `${fileBaseName(o, "lineplot")}_lineplot.svg`),
      onDownloadPng: () => downloadPng(L.current, `${fileBaseName(o, "lineplot")}_lineplot.png`),
      onReset: Y,
      extraDownloads: T.length > 0 ? [{ label: "Stats CSV", onClick: K }] : [],
    }),
    React.createElement(
      ControlSection,
      { title: "Columns", defaultOpen: !0 },
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "X (numeric)"),
        React.createElement(
          "select",
          {
            value: c,
            onChange: (n) => g(parseInt(n.target.value)),
            className: "dv-select",
            style: { width: "100%" },
          },
          a.map((n) => React.createElement("option", { key: n, value: n }, l.headers[n]))
        )
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Y (numeric)"),
        React.createElement(
          "select",
          {
            value: b,
            onChange: (n) => N(parseInt(n.target.value)),
            className: "dv-select",
            style: { width: "100%" },
          },
          a.map((n) => React.createElement("option", { key: n, value: n }, l.headers[n]))
        )
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Group by"),
        React.createElement(
          "select",
          {
            value: m ?? "",
            onChange: (n) => i(n.target.value === "" ? null : parseInt(n.target.value)),
            className: "dv-select",
            style: { width: "100%" },
          },
          React.createElement("option", { value: "" }, "(single line)"),
          x.map((n) => React.createElement("option", { key: n, value: n }, l.headers[n]))
        )
      )
    ),
    React.createElement(
      ControlSection,
      { title: "Groups", defaultOpen: f.length > 0 && f.length <= 6 },
      f.length === 0
        ? React.createElement(
            "p",
            { style: { margin: 0, fontSize: 11, color: "var(--text-faint)" } },
            "No groups yet \u2014 pick a grouping column."
          )
        : React.createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 6 } },
            f.map((n) =>
              React.createElement(
                "div",
                { key: n.name, style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement(ColorInput, { value: n.color, onChange: (B) => u(n.name, B) }),
                React.createElement(
                  "span",
                  { style: { fontSize: 12, color: "var(--text)" } },
                  n.name
                )
              )
            )
          )
    ),
    React.createElement(
      ControlSection,
      { title: "Error bars", defaultOpen: !0 },
      React.createElement(
        "div",
        { className: "dv-seg", role: "group", "aria-label": "Error bar type" },
        ERROR_KINDS.map((n) =>
          React.createElement(
            "button",
            {
              key: n.value,
              type: "button",
              className: "dv-seg-btn" + (k === n.value ? " dv-seg-btn-active" : ""),
              onClick: () => y(n.value),
            },
            n.label
          )
        )
      )
    ),
    React.createElement(
      ControlSection,
      { title: "Axes" },
      React.createElement(
        "div",
        { style: { display: "flex", gap: 6 } },
        React.createElement(
          "label",
          { style: { flex: 1, display: "block" } },
          React.createElement("span", { className: "dv-label" }, "X min"),
          React.createElement(NumberInput, {
            value: t.xMin != null ? t.xMin : d.xMin,
            onChange: (n) => p({ xMin: Number(n.target.value) }),
            step: "any",
            style: { width: "100%" },
          })
        ),
        React.createElement(
          "label",
          { style: { flex: 1, display: "block" } },
          React.createElement("span", { className: "dv-label" }, "X max"),
          React.createElement(NumberInput, {
            value: t.xMax != null ? t.xMax : d.xMax,
            onChange: (n) => p({ xMax: Number(n.target.value) }),
            step: "any",
            style: { width: "100%" },
          })
        )
      ),
      React.createElement(
        "div",
        { style: { display: "flex", gap: 6 } },
        React.createElement(
          "label",
          { style: { flex: 1, display: "block" } },
          React.createElement("span", { className: "dv-label" }, "Y min"),
          React.createElement(NumberInput, {
            value: t.yMin != null ? t.yMin : d.yMin,
            onChange: (n) => p({ yMin: Number(n.target.value) }),
            step: "any",
            style: { width: "100%" },
          })
        ),
        React.createElement(
          "label",
          { style: { flex: 1, display: "block" } },
          React.createElement("span", { className: "dv-label" }, "Y max"),
          React.createElement(NumberInput, {
            value: t.yMax != null ? t.yMax : d.yMax,
            onChange: (n) => p({ yMax: Number(n.target.value) }),
            step: "any",
            style: { width: "100%" },
          })
        )
      )
    ),
    React.createElement(
      ControlSection,
      { title: "Labels" },
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Title"),
        React.createElement("input", {
          value: t.plotTitle,
          onChange: (n) => p({ plotTitle: n.target.value }),
          className: "dv-input",
          style: { width: "100%" },
        })
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Subtitle"),
        React.createElement("input", {
          value: t.plotSubtitle,
          onChange: (n) => p({ plotSubtitle: n.target.value }),
          className: "dv-input",
          style: { width: "100%" },
        })
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "X label"),
        React.createElement("input", {
          value: t.xLabel,
          onChange: (n) => p({ xLabel: n.target.value }),
          className: "dv-input",
          style: { width: "100%" },
        })
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Y label"),
        React.createElement("input", {
          value: t.yLabel,
          onChange: (n) => p({ yLabel: n.target.value }),
          className: "dv-input",
          style: { width: "100%" },
        })
      )
    ),
    React.createElement(
      ControlSection,
      { title: "Style" },
      React.createElement(
        "div",
        null,
        React.createElement("span", { className: "dv-label" }, "Grid"),
        React.createElement(
          "div",
          { className: "dv-seg", role: "group", "aria-label": "Grid" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "dv-seg-btn" + (t.showGrid ? "" : " dv-seg-btn-active"),
              onClick: () => p({ showGrid: !1 }),
            },
            "Off"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dv-seg-btn" + (t.showGrid ? " dv-seg-btn-active" : ""),
              onClick: () => p({ showGrid: !0 }),
            },
            "On"
          )
        )
      ),
      React.createElement(SliderControl, {
        label: "Line width",
        value: t.lineWidth,
        min: 0.5,
        max: 5,
        step: 0.5,
        onChange: X("lineWidth"),
      }),
      React.createElement(SliderControl, {
        label: "Point radius",
        value: t.pointRadius,
        min: 0,
        max: 10,
        step: 0.5,
        onChange: X("pointRadius"),
      }),
      React.createElement(SliderControl, {
        label: "Error cap width",
        value: t.errorCapWidth,
        min: 0,
        max: 20,
        step: 1,
        onChange: X("errorCapWidth"),
      })
    ),
    React.createElement(
      ControlSection,
      { title: "Statistics", defaultOpen: !0 },
      React.createElement(
        "div",
        null,
        React.createElement("span", { className: "dv-label" }, "Stars on plot"),
        React.createElement(
          "div",
          { className: "dv-seg", role: "group", "aria-label": "Significance stars" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "dv-seg-btn" + (F ? "" : " dv-seg-btn-active"),
              onClick: () => S(!1),
            },
            "Off"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dv-seg-btn" + (F ? " dv-seg-btn-active" : ""),
              onClick: () => S(!0),
            },
            "On"
          )
        )
      ),
      React.createElement(
        "p",
        { style: { margin: 0, fontSize: 11, color: "var(--text-faint)" } },
        "BH-adjusted across x. Per-x details (decision trace, R script) are below the chart."
      )
    )
  );
}
function PlotStep(l) {
  const {
      parsed: o,
      fileName: c,
      series: g,
      statsRows: b,
      xCol: N,
      yCol: m,
      groupCol: i,
      vis: a,
      autoAxis: x,
      effAxis: f,
      errorType: u,
      showStars: t,
      svgRef: p,
      svgLegend: d,
    } = l,
    k = 700,
    y = 440,
    F = fileBaseName(c, "lineplot");
  return React.createElement(
    "div",
    { style: { display: "flex", gap: 20, alignItems: "flex-start" } },
    React.createElement(PlotControls, { ...l }),
    React.createElement(
      "div",
      { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 } },
      React.createElement(
        "div",
        {
          className: "dv-panel dv-plot-card",
          style: {
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          },
        },
        g.length === 0
          ? React.createElement(
              "p",
              {
                style: {
                  margin: 0,
                  padding: "40px 0",
                  textAlign: "center",
                  color: "var(--text-faint)",
                  fontSize: 13,
                },
              },
              "No data to plot. Check your column picks \u2014 X and Y must be numeric."
            )
          : React.createElement(Chart, {
              ref: p,
              series: g,
              perXStats: b,
              xMin: f.xMin,
              xMax: f.xMax,
              yMin: f.yMin,
              yMax: f.yMax,
              vbW: k,
              vbH: y,
              xLabel: a.xLabel || o.headers[N],
              yLabel: a.yLabel || o.headers[m],
              plotTitle: a.plotTitle,
              plotSubtitle: a.plotSubtitle,
              plotBg: a.plotBg,
              showGrid: a.showGrid,
              gridColor: a.gridColor,
              lineWidth: a.lineWidth,
              pointRadius: a.pointRadius,
              errorStrokeWidth: a.errorStrokeWidth,
              errorCapWidth: a.errorCapWidth,
              errorType: u,
              svgLegend: d,
              showStars: t,
            })
      ),
      b.length > 0 &&
        React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 10 } },
          React.createElement(
            "h3",
            {
              style: {
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: "var(--text)",
                letterSpacing: "0.2px",
              },
            },
            "Per-x statistics"
          ),
          b.map((S) =>
            React.createElement(StatsTile, {
              key: `stats-${S.x}`,
              title: `x = ${formatX(S.x)}`,
              defaultOpen: !1,
              compact: !0,
              groups: S.names.map((T, L) => ({ name: T, values: S.values[L] })),
              fileStem: `${F}_x${svgSafeId(formatX(S.x))}`,
            })
          )
        )
    )
  );
}
function App() {
  const [l, o] = useState(null),
    [c, g] = useState(!1),
    [b, N] = useState(0),
    [m, i] = useState(""),
    [a, x] = useState(""),
    [f, u] = useState(null),
    [t, p] = useState("upload"),
    [d, k] = useState(0),
    [y, F] = useState(1),
    [S, T] = useState(null),
    [L, Y] = useState("sem"),
    [X, K] = useState(!0),
    [n, B] = useState({}),
    v = {
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
      xLabel: "",
      yLabel: "",
      plotTitle: "",
      plotSubtitle: "",
      plotBg: "#ffffff",
      showGrid: !0,
      gridColor: "#e0e0e0",
      lineWidth: 1.5,
      pointRadius: 3.5,
      errorStrokeWidth: 1,
      errorCapWidth: 6,
    },
    [W, I] = useReducer((s, h) => (h._reset ? { ...v } : { ...s, ...h }), v),
    U = useRef(null),
    M = useRef(""),
    r = useMemo(() => (l ? parseData(l, M.current) : null), [l]),
    q = useMemo(
      () =>
        r
          ? r.headers.reduce((s, h, A) => {
              const D = r.rawData.map((P) => P[A]).filter((P) => P !== "" && P != null);
              return (
                (s[A] = D.length > 0 && D.filter((P) => isNumericValue(P)).length / D.length > 0.5),
                s
              );
            }, {})
          : {},
      [r]
    ),
    Z = useMemo(() => (r ? r.headers.reduce((s, h, A) => (q[A] ? [...s, A] : s), []) : []), [r, q]),
    z = useMemo(() => (r ? r.headers.reduce((s, h, A) => (q[A] ? s : [...s, A]), []) : []), [r, q]),
    C = useMemo(
      () =>
        !r || d == null || y == null ? [] : computeSeries(r.data, r.rawData, d, y, S, n, PALETTE),
      [r, d, y, S, n]
    ),
    ee = useCallback((s, h) => B((A) => ({ ...A, [s]: h })), []),
    te = useMemo(() => (C.length >= 2 ? computePerXStats(C) : []), [C]),
    j = useMemo(() => {
      if (C.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
      let s = 1 / 0,
        h = -1 / 0,
        A = 1 / 0,
        D = -1 / 0;
      for (const ae of C)
        for (const E of ae.points) {
          if ((E.x < s && (s = E.x), E.x > h && (h = E.x), E.mean == null)) continue;
          const _ = L === "sd" ? E.sd : L === "ci95" ? E.ci95 : E.sem,
            J = E.mean + (_ || 0),
            G = E.mean - (_ || 0);
          (G < A && (A = G), J > D && (D = J));
        }
      if (!Number.isFinite(s)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
      const P = s === h ? 0.5 : (h - s) * 0.05,
        ne = A === D ? 0.5 : (D - A) * 0.08;
      return {
        xMin: round4(s - P),
        xMax: round4(h + P),
        yMin: round4(A - ne),
        yMax: round4(D + ne),
      };
    }, [C, L]),
    le = {
      xMin: W.xMin != null ? W.xMin : j.xMin,
      xMax: W.xMax != null ? W.xMax : j.xMax,
      yMin: W.yMin != null ? W.yMin : j.yMin,
      yMax: W.yMax != null ? W.yMax : j.yMax,
    },
    e = useMemo(
      () =>
        C.length === 0 || (C.length === 1 && C[0].name === "(all)")
          ? null
          : [
              {
                id: "legend-group",
                title: S != null && r ? r.headers[S] : "",
                items: C.map((s) => ({ label: s.name, color: s.color, shape: "dot" })),
              },
            ],
      [C, S, r]
    );
  useEffect(() => {
    !r ||
      d == null ||
      y == null ||
      I({
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null,
        xLabel: r.headers[d],
        yLabel: r.headers[y],
      });
  }, [d, y, r]);
  const w = useCallback((s, h) => {
      M.current = h;
      const A = fixDecimalCommas(s, h);
      (g(A.commaFixed), N(A.count));
      const D = A.text,
        { headers: P, data: ne, rawData: ae } = parseData(D, h);
      if (P.length < 2 || ne.length === 0) {
        u(
          "The file appears to be empty or has no data rows. Please check your file and try again."
        );
        return;
      }
      (u(null), o(D));
      const E = (G) => {
          const Q = ae.map((O) => O[G]).filter((O) => O !== "" && O != null);
          return Q.length > 0 && Q.filter((O) => isNumericValue(O)).length / Q.length > 0.5;
        },
        _ = P.reduce((G, Q, O) => (E(O) ? [...G, O] : G), []),
        J = P.reduce((G, Q, O) => (E(O) ? G : [...G, O]), []);
      (k(_[0] !== void 0 ? _[0] : 0),
        F(_[1] !== void 0 ? _[1] : _[0] !== void 0 ? _[0] : 1),
        T(J[0] !== void 0 ? J[0] : null),
        B({}),
        p("configure"));
    }, []),
    R = useCallback(
      (s, h) => {
        (x(h), w(s, m));
      },
      [m, w]
    ),
    $ = useCallback(() => {
      const s = window.__LINEPLOT_EXAMPLE__;
      s && (i(","), x("bacterial_growth.csv"), w(s, ","));
    }, [w]),
    H = () => {
      (o(null), x(""), p("upload"));
    },
    V = (s) =>
      s === "upload"
        ? !0
        : s === "configure"
          ? !!r
          : s === "plot"
            ? !!r && d != null && y != null
            : !1;
  return React.createElement(
    "div",
    {
      style: {
        minHeight: "100vh",
        color: "var(--text)",
        fontFamily: "monospace",
        padding: "24px 32px",
      },
    },
    React.createElement(PageHeader, {
      toolName: "lineplot",
      title: "Line Plot",
      subtitle: "Profile plot \u2014 mean \xB1 error per group at each x, with per-x statistics",
    }),
    React.createElement(StepNavBar, {
      steps: ["upload", "configure", "plot"],
      currentStep: t,
      onStepChange: p,
      canNavigate: V,
    }),
    React.createElement(CommaFixBanner, { commaFixed: c, commaFixCount: b }),
    React.createElement(ParseErrorBanner, { error: f }),
    t === "upload" &&
      React.createElement(UploadStep, {
        sepOverride: m,
        setSepOverride: i,
        rawText: l,
        doParse: w,
        handleFileLoad: R,
        onLoadExample: $,
      }),
    t === "configure" &&
      r &&
      React.createElement(ConfigureStep, {
        parsed: r,
        fileName: a,
        xCol: d,
        setXCol: k,
        yCol: y,
        setYCol: F,
        groupCol: S,
        setGroupCol: T,
        numericCols: Z,
        categoricalCols: z,
        setStep: p,
      }),
    t === "plot" &&
      r &&
      React.createElement(PlotStep, {
        parsed: r,
        fileName: a,
        series: C,
        statsRows: te,
        xCol: d,
        setXCol: k,
        yCol: y,
        setYCol: F,
        groupCol: S,
        setGroupCol: T,
        numericCols: Z,
        categoricalCols: z,
        setGroupColor: ee,
        vis: W,
        updVis: I,
        autoAxis: j,
        effAxis: le,
        errorType: L,
        setErrorType: Y,
        showStars: X,
        setShowStars: K,
        svgRef: U,
        svgLegend: e,
        resetAll: H,
      })
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(ErrorBoundary, { toolName: "Line plot" }, React.createElement(App, null))
);
//# sourceMappingURL=lineplot.js.map
