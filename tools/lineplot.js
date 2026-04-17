const { useState, useEffect, useRef, useReducer, useMemo, useCallback, forwardRef } = React,
  MARGIN = { top: 20, right: 20, bottom: 48, left: 62 },
  STAR_ROW_H = 18,
  ERROR_KINDS = [
    { value: "sem", label: "SEM" },
    { value: "sd", label: "SD" },
    { value: "ci95", label: "95% CI" },
  ],
  round4 = (n) => Math.round(n * 1e4) / 1e4;
function buildLineD(n) {
  const o = n.filter((d) => d.y != null);
  return o.length < 2 ? "" : "M" + o.map((d) => `${d.x.toFixed(2)},${d.y.toFixed(2)}`).join("L");
}
function formatX(n) {
  return n == null || !Number.isFinite(n) || Number.isInteger(n) ? String(n) : String(round4(n));
}
function runChosenTest(n, o) {
  try {
    return n === "studentT"
      ? tTest(o[0], o[1], { equalVar: !0 })
      : n === "welchT"
        ? tTest(o[0], o[1], { equalVar: !1 })
        : n === "mannWhitney"
          ? mannWhitneyU(o[0], o[1])
          : n === "oneWayANOVA"
            ? oneWayANOVA(o)
            : n === "welchANOVA"
              ? welchANOVA(o)
              : n === "kruskalWallis"
                ? kruskalWallis(o)
                : { error: "unknown test" };
  } catch (d) {
    return { error: String((d && d.message) || d) };
  }
}
function computeSeries(n, o, d, m, v, k, N) {
  const i = [],
    a = new Map();
  for (let g = 0; g < n.length; g++) {
    const f = n[g][d],
      u = n[g][m];
    if (f == null || u == null || !Number.isFinite(f) || !Number.isFinite(u)) continue;
    const t = v == null ? "(all)" : String(o[g][v] ?? "");
    a.has(t) || (a.set(t, new Map()), i.push(t));
    const p = a.get(t);
    (p.has(f) || p.set(f, []), p.get(f).push(u));
  }
  return i.map((g, f) => {
    const u = a.get(g),
      p = [...u.keys()]
        .sort((c, w) => c - w)
        .map((c) => {
          const w = u.get(c),
            y = w.length,
            E = sampleMean(w),
            b = y > 1 ? sampleSD(w) : 0,
            F = y > 1 ? b / Math.sqrt(y) : 0,
            W = y > 1 ? tinv(0.975, y - 1) * F : 0;
          return { x: c, values: w, n: y, mean: E, sd: b, sem: F, ci95: W };
        });
    return { name: g, color: k[g] || N[f % N.length], points: p };
  });
}
function computePerXStats(n) {
  const o = new Set();
  for (const i of n) for (const a of i.points) o.add(a.x);
  const d = [...o].sort((i, a) => i - a),
    m = [];
  for (const i of d) {
    const a = [];
    for (const c of n) {
      const w = c.points.find((y) => y.x === i);
      w && w.n >= 2 && a.push({ name: c.name, values: w.values });
    }
    if (a.length < 2) continue;
    const g = a.map((c) => c.values),
      f = a.map((c) => c.name),
      u = selectTest(g),
      t = u && u.recommendation && u.recommendation.test ? u.recommendation.test : null,
      p = t ? runChosenTest(t, g) : null;
    m.push({ x: i, names: f, values: g, chosenTest: t, result: p });
  }
  const v = [],
    k = [];
  m.forEach((i, a) => {
    i.result && !i.result.error && Number.isFinite(i.result.p) && (v.push(a), k.push(i.result.p));
  });
  const N = k.length > 0 ? bhAdjust(k) : [];
  return (m.forEach((i) => (i.pAdj = null)), v.forEach((i, a) => (m[i].pAdj = N[a])), m);
}
const Chart = forwardRef(function (
  {
    series: o,
    perXStats: d,
    xMin: m,
    xMax: v,
    yMin: k,
    yMax: N,
    vbW: i,
    vbH: a,
    xLabel: g,
    yLabel: f,
    plotTitle: u,
    plotSubtitle: t,
    plotBg: p,
    showGrid: c,
    gridColor: w,
    lineWidth: y,
    pointRadius: E,
    errorStrokeWidth: b,
    errorCapWidth: F,
    errorType: W,
    svgLegend: H,
    showStars: z,
  },
  K
) {
  const l = (e) => {
      const S = Math.max(0, ...(e.items || []).map((I) => (I.label || "").length));
      return Math.max(110, S * 6 + 28);
    },
    D = computeLegendHeight(H, i - MARGIN.left - MARGIN.right, l),
    x = (u ? 20 : 0) + (t ? 16 : 0),
    L = z && d.some((e) => e.pAdj != null) ? STAR_ROW_H : 0,
    P = i - MARGIN.left - MARGIN.right,
    U = a - MARGIN.top - MARGIN.bottom,
    M = MARGIN.top + L,
    s = U - L,
    q = v - m || 1,
    V = N - k || 1,
    O = (e) => MARGIN.left + ((e - m) / q) * P,
    C = (e) => M + (1 - (e - k) / V) * s,
    ee = (e) => Math.max(k, Math.min(N, e)),
    te = makeTicks(m, v, 8),
    X = makeTicks(k, N, 6),
    ne = (e) => (W === "sd" ? e.sd : W === "ci95" ? e.ci95 : e.sem);
  return React.createElement(
    "svg",
    {
      ref: K,
      viewBox: `0 0 ${i} ${a + D + x}`,
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
      { id: "chart", transform: `translate(0, ${x})` },
      React.createElement("rect", {
        id: "plot-area-background",
        x: MARGIN.left,
        y: MARGIN.top,
        width: P,
        height: U,
        fill: p || "#fff",
      }),
      c &&
        React.createElement(
          "g",
          { id: "grid" },
          X.map((e) =>
            React.createElement("line", {
              key: `gy-${e}`,
              x1: MARGIN.left,
              x2: MARGIN.left + P,
              y1: C(e),
              y2: C(e),
              stroke: w || "#e0e0e0",
              strokeWidth: "0.5",
            })
          ),
          te.map((e) =>
            React.createElement("line", {
              key: `gx-${e}`,
              x1: O(e),
              x2: O(e),
              y1: M,
              y2: M + s,
              stroke: w || "#e0e0e0",
              strokeWidth: "0.5",
            })
          )
        ),
      React.createElement(
        "g",
        { id: "traces" },
        o.map((e) => {
          const S = e.points.map((_) => ({ x: O(_.x), y: _.mean != null ? C(_.mean) : null })),
            I = buildLineD(S);
          return I
            ? React.createElement("path", {
                key: `line-${e.name}`,
                id: `trace-${svgSafeId(e.name)}`,
                d: I,
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
            e.points.map((S, I) => {
              if (S.n < 2 || S.mean == null) return null;
              const _ = ne(S);
              if (!_ || !Number.isFinite(_)) return null;
              const Y = O(S.x),
                J = C(ee(S.mean + _)),
                r = C(ee(S.mean - _)),
                h = F / 2;
              return React.createElement(
                "g",
                { key: `err-${I}` },
                React.createElement("line", {
                  x1: Y,
                  x2: Y,
                  y1: J,
                  y2: r,
                  stroke: e.color,
                  strokeWidth: b,
                }),
                React.createElement("line", {
                  x1: Y - h,
                  x2: Y + h,
                  y1: J,
                  y2: J,
                  stroke: e.color,
                  strokeWidth: b,
                }),
                React.createElement("line", {
                  x1: Y - h,
                  x2: Y + h,
                  y1: r,
                  y2: r,
                  stroke: e.color,
                  strokeWidth: b,
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
            e.points.map((S, I) =>
              S.mean == null
                ? null
                : React.createElement("circle", {
                    key: `pt-${I}`,
                    cx: O(S.x),
                    cy: C(S.mean),
                    r: E,
                    fill: e.color,
                    stroke: "#fff",
                    strokeWidth: "0.5",
                  })
            )
          )
        )
      ),
      z &&
        L > 0 &&
        React.createElement(
          "g",
          { id: "significance-stars" },
          d.map((e, S) => {
            if (e.pAdj == null) return null;
            const I = pStars(e.pAdj);
            return !I || I === "ns"
              ? null
              : React.createElement(
                  "text",
                  {
                    key: `star-${S}`,
                    x: O(e.x),
                    y: MARGIN.top + 14,
                    textAnchor: "middle",
                    fontSize: "13",
                    fontWeight: "700",
                    fill: "#222",
                    fontFamily: "sans-serif",
                  },
                  I
                );
          })
        ),
      React.createElement(
        "g",
        { id: "plot-frame", fill: "none", stroke: "#333", strokeWidth: "1" },
        React.createElement("line", { x1: MARGIN.left, y1: M, x2: MARGIN.left + P, y2: M }),
        React.createElement("line", { x1: MARGIN.left + P, y1: M, x2: MARGIN.left + P, y2: M + s }),
        React.createElement("line", { x1: MARGIN.left, y1: M + s, x2: MARGIN.left + P, y2: M + s }),
        React.createElement("line", { x1: MARGIN.left, y1: M, x2: MARGIN.left, y2: M + s })
      ),
      React.createElement(
        "g",
        { id: "axis-x" },
        te.map((e) =>
          React.createElement(
            "g",
            { key: e },
            React.createElement("line", {
              x1: O(e),
              x2: O(e),
              y1: M + s,
              y2: M + s + 5,
              stroke: "#333",
              strokeWidth: "1",
            }),
            React.createElement(
              "text",
              {
                x: O(e),
                y: M + s + 18,
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
        X.map((e) =>
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
      g &&
        React.createElement(
          "g",
          { id: "x-axis-label" },
          React.createElement(
            "text",
            {
              x: MARGIN.left + P / 2,
              y: a - 4,
              textAnchor: "middle",
              fontSize: "13",
              fill: "#444",
              fontFamily: "sans-serif",
            },
            g
          )
        ),
      f &&
        React.createElement(
          "g",
          { id: "y-axis-label" },
          React.createElement(
            "text",
            {
              transform: `translate(14,${M + s / 2}) rotate(-90)`,
              textAnchor: "middle",
              fontSize: "13",
              fill: "#444",
              fontFamily: "sans-serif",
            },
            f
          )
        ),
      renderSvgLegend(H, a + 10, MARGIN.left, i - MARGIN.left - MARGIN.right, l)
    )
  );
});
function ControlSection({ title: n, defaultOpen: o = !1, children: d }) {
  const [m, v] = useState(o);
  return React.createElement(
    "div",
    { className: "dv-panel", style: { marginBottom: 0, padding: 0 } },
    React.createElement(
      "button",
      {
        onClick: () => v(!m),
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
        className: "dv-disclosure" + (m ? " dv-disclosure-open" : ""),
        "aria-hidden": "true",
      }),
      n
    ),
    m &&
      React.createElement(
        "div",
        { style: { padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 8 } },
        d
      )
  );
}
function UploadStep({
  sepOverride: n,
  setSepOverride: o,
  rawText: d,
  doParse: m,
  handleFileLoad: v,
  onLoadExample: k,
}) {
  return React.createElement(UploadPanel, {
    sepOverride: n,
    setSepOverride: o,
    rawText: d,
    doParse: m,
    handleFileLoad: v,
    onLoadExample: k,
    tip: "Expects long-format data: one row per observation. You'll pick which columns are X, Y, and the grouping variable.",
  });
}
function ConfigureStep({
  parsed: n,
  fileName: o,
  xCol: d,
  setXCol: m,
  yCol: v,
  setYCol: k,
  groupCol: N,
  setGroupCol: i,
  numericCols: a,
  categoricalCols: g,
  setStep: f,
}) {
  const u = d != null && v != null && a.length >= 2;
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
          n.rawData.length,
          " rows \xD7 ",
          n.headers.length,
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
      React.createElement(DataPreview, { headers: n.headers, rows: n.rawData, maxRows: 10 })
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
              value: d ?? "",
              onChange: (t) => m(parseInt(t.target.value)),
              className: "dv-select",
              style: { width: "100%" },
            },
            a.map((t) => React.createElement("option", { key: t, value: t }, n.headers[t]))
          )
        ),
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "dv-label" }, "Y (numeric)"),
          React.createElement(
            "select",
            {
              value: v ?? "",
              onChange: (t) => k(parseInt(t.target.value)),
              className: "dv-select",
              style: { width: "100%" },
            },
            a.map((t) => React.createElement("option", { key: t, value: t }, n.headers[t]))
          )
        ),
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "dv-label" }, "Group by"),
          React.createElement(
            "select",
            {
              value: N ?? "",
              onChange: (t) => i(t.target.value === "" ? null : parseInt(t.target.value)),
              className: "dv-select",
              style: { width: "100%" },
            },
            React.createElement("option", { value: "" }, "(single line)"),
            g.map((t) => React.createElement("option", { key: t, value: t }, n.headers[t]))
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
  parsed: n,
  fileName: o,
  xCol: d,
  setXCol: m,
  yCol: v,
  setYCol: k,
  groupCol: N,
  setGroupCol: i,
  numericCols: a,
  categoricalCols: g,
  series: f,
  setGroupColor: u,
  vis: t,
  updVis: p,
  autoAxis: c,
  errorType: w,
  setErrorType: y,
  showStars: E,
  setShowStars: b,
  statsRows: F,
  svgRef: W,
  resetAll: H,
}) {
  const z = (l) => (D) => p({ [l]: D }),
    K = () => {
      const l = ["x", "test", "statistic", "p", "p_adj", "stars"],
        D = F.map((x) => {
          const L =
              x.result && !x.result.error
                ? x.result.t != null
                  ? x.result.t
                  : x.result.U != null
                    ? x.result.U
                    : x.result.F != null
                      ? x.result.F
                      : x.result.H != null
                        ? x.result.H
                        : ""
                : "",
            P = x.result && !x.result.error ? x.result.p : "",
            U = x.pAdj != null ? x.pAdj : "",
            M = x.pAdj != null ? pStars(x.pAdj) : "";
          return [formatX(x.x), x.chosenTest || "", L, P, U, M];
        });
      downloadCsv(l, D, `${fileBaseName(o, "lineplot")}_stats.csv`);
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
      onDownloadSvg: () => downloadSvg(W.current, `${fileBaseName(o, "lineplot")}_lineplot.svg`),
      onDownloadPng: () => downloadPng(W.current, `${fileBaseName(o, "lineplot")}_lineplot.png`),
      onReset: H,
      extraDownloads: F.length > 0 ? [{ label: "Stats CSV", onClick: K }] : [],
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
            value: d,
            onChange: (l) => m(parseInt(l.target.value)),
            className: "dv-select",
            style: { width: "100%" },
          },
          a.map((l) => React.createElement("option", { key: l, value: l }, n.headers[l]))
        )
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Y (numeric)"),
        React.createElement(
          "select",
          {
            value: v,
            onChange: (l) => k(parseInt(l.target.value)),
            className: "dv-select",
            style: { width: "100%" },
          },
          a.map((l) => React.createElement("option", { key: l, value: l }, n.headers[l]))
        )
      ),
      React.createElement(
        "label",
        { style: { display: "block" } },
        React.createElement("span", { className: "dv-label" }, "Group by"),
        React.createElement(
          "select",
          {
            value: N ?? "",
            onChange: (l) => i(l.target.value === "" ? null : parseInt(l.target.value)),
            className: "dv-select",
            style: { width: "100%" },
          },
          React.createElement("option", { value: "" }, "(single line)"),
          g.map((l) => React.createElement("option", { key: l, value: l }, n.headers[l]))
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
            f.map((l) =>
              React.createElement(
                "div",
                { key: l.name, style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement(ColorInput, { value: l.color, onChange: (D) => u(l.name, D) }),
                React.createElement(
                  "span",
                  { style: { fontSize: 12, color: "var(--text)" } },
                  l.name
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
        ERROR_KINDS.map((l) =>
          React.createElement(
            "button",
            {
              key: l.value,
              type: "button",
              className: "dv-seg-btn" + (w === l.value ? " dv-seg-btn-active" : ""),
              onClick: () => y(l.value),
            },
            l.label
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
            value: t.xMin != null ? t.xMin : c.xMin,
            onChange: (l) => p({ xMin: Number(l.target.value) }),
            step: "any",
            style: { width: "100%" },
          })
        ),
        React.createElement(
          "label",
          { style: { flex: 1, display: "block" } },
          React.createElement("span", { className: "dv-label" }, "X max"),
          React.createElement(NumberInput, {
            value: t.xMax != null ? t.xMax : c.xMax,
            onChange: (l) => p({ xMax: Number(l.target.value) }),
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
            value: t.yMin != null ? t.yMin : c.yMin,
            onChange: (l) => p({ yMin: Number(l.target.value) }),
            step: "any",
            style: { width: "100%" },
          })
        ),
        React.createElement(
          "label",
          { style: { flex: 1, display: "block" } },
          React.createElement("span", { className: "dv-label" }, "Y max"),
          React.createElement(NumberInput, {
            value: t.yMax != null ? t.yMax : c.yMax,
            onChange: (l) => p({ yMax: Number(l.target.value) }),
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
          onChange: (l) => p({ plotTitle: l.target.value }),
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
          onChange: (l) => p({ plotSubtitle: l.target.value }),
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
          onChange: (l) => p({ xLabel: l.target.value }),
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
          onChange: (l) => p({ yLabel: l.target.value }),
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
        onChange: z("lineWidth"),
      }),
      React.createElement(SliderControl, {
        label: "Point radius",
        value: t.pointRadius,
        min: 0,
        max: 10,
        step: 0.5,
        onChange: z("pointRadius"),
      }),
      React.createElement(SliderControl, {
        label: "Error cap width",
        value: t.errorCapWidth,
        min: 0,
        max: 20,
        step: 1,
        onChange: z("errorCapWidth"),
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
              className: "dv-seg-btn" + (E ? "" : " dv-seg-btn-active"),
              onClick: () => b(!1),
            },
            "Off"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dv-seg-btn" + (E ? " dv-seg-btn-active" : ""),
              onClick: () => b(!0),
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
function PlotStep(n) {
  const {
      parsed: o,
      fileName: d,
      series: m,
      statsRows: v,
      xCol: k,
      yCol: N,
      groupCol: i,
      vis: a,
      autoAxis: g,
      effAxis: f,
      errorType: u,
      showStars: t,
      svgRef: p,
      svgLegend: c,
    } = n,
    w = 700,
    y = 440,
    E = fileBaseName(d, "lineplot");
  return React.createElement(
    "div",
    { style: { display: "flex", gap: 20, alignItems: "flex-start" } },
    React.createElement(PlotControls, { ...n }),
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
        m.length === 0
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
              series: m,
              perXStats: v,
              xMin: f.xMin,
              xMax: f.xMax,
              yMin: f.yMin,
              yMax: f.yMax,
              vbW: w,
              vbH: y,
              xLabel: a.xLabel || o.headers[k],
              yLabel: a.yLabel || o.headers[N],
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
              svgLegend: c,
              showStars: t,
            })
      ),
      v.length > 0 &&
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
          v.map((b) =>
            React.createElement(StatsTile, {
              key: `stats-${b.x}`,
              title: `x = ${formatX(b.x)}`,
              defaultOpen: !1,
              compact: !0,
              groups: b.names.map((F, W) => ({ name: F, values: b.values[W] })),
              fileStem: `${E}_x${svgSafeId(formatX(b.x))}`,
            })
          )
        )
    )
  );
}
function App() {
  const [n, o] = useState(null),
    [d, m] = useState(!1),
    [v, k] = useState(0),
    [N, i] = useState(""),
    [a, g] = useState(""),
    [f, u] = useState(null),
    [t, p] = useState("upload"),
    [c, w] = useState(0),
    [y, E] = useState(1),
    [b, F] = useState(null),
    [W, H] = useState("sem"),
    [z, K] = useState(!0),
    [l, D] = useState({}),
    x = {
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
    [L, P] = useReducer((r, h) => (h._reset ? { ...x } : { ...r, ...h }), x),
    U = useRef(null),
    M = useRef(""),
    s = useMemo(() => (n ? parseData(n, M.current) : null), [n]),
    q = useMemo(
      () =>
        s
          ? s.headers.reduce((r, h, A) => {
              const $ = s.rawData.map((T) => T[A]).filter((T) => T !== "" && T != null);
              return (
                (r[A] = $.length > 0 && $.filter((T) => isNumericValue(T)).length / $.length > 0.5),
                r
              );
            }, {})
          : {},
      [s]
    ),
    V = useMemo(() => (s ? s.headers.reduce((r, h, A) => (q[A] ? [...r, A] : r), []) : []), [s, q]),
    O = useMemo(() => (s ? s.headers.reduce((r, h, A) => (q[A] ? r : [...r, A]), []) : []), [s, q]),
    C = useMemo(
      () =>
        !s || c == null || y == null ? [] : computeSeries(s.data, s.rawData, c, y, b, l, PALETTE),
      [s, c, y, b, l]
    ),
    ee = useCallback((r, h) => D((A) => ({ ...A, [r]: h })), []),
    te = useMemo(() => (C.length >= 2 ? computePerXStats(C) : []), [C]),
    X = useMemo(() => {
      if (C.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
      let r = 1 / 0,
        h = -1 / 0,
        A = 1 / 0,
        $ = -1 / 0;
      for (const ae of C)
        for (const R of ae.points) {
          if ((R.x < r && (r = R.x), R.x > h && (h = R.x), R.mean == null)) continue;
          const j = W === "sd" ? R.sd : W === "ci95" ? R.ci95 : R.sem,
            Q = R.mean + (j || 0),
            B = R.mean - (j || 0);
          (B < A && (A = B), Q > $ && ($ = Q));
        }
      if (!Number.isFinite(r)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
      const T = r === h ? 0.5 : (h - r) * 0.05,
        le = A === $ ? 0.5 : ($ - A) * 0.08;
      return {
        xMin: round4(r - T),
        xMax: round4(h + T),
        yMin: round4(A - le),
        yMax: round4($ + le),
      };
    }, [C, W]),
    ne = {
      xMin: L.xMin != null ? L.xMin : X.xMin,
      xMax: L.xMax != null ? L.xMax : X.xMax,
      yMin: L.yMin != null ? L.yMin : X.yMin,
      yMax: L.yMax != null ? L.yMax : X.yMax,
    },
    e = useMemo(
      () =>
        C.length === 0 || (C.length === 1 && C[0].name === "(all)")
          ? null
          : [
              {
                id: "legend-group",
                title: b != null && s ? s.headers[b] : "",
                items: C.map((r) => ({ label: r.name, color: r.color, shape: "dot" })),
              },
            ],
      [C, b, s]
    );
  useEffect(() => {
    !s ||
      c == null ||
      y == null ||
      P({
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null,
        xLabel: s.headers[c],
        yLabel: s.headers[y],
      });
  }, [c, y, s]);
  const S = useCallback((r, h) => {
      M.current = h;
      const A = fixDecimalCommas(r, h);
      (m(A.commaFixed), k(A.count));
      const $ = A.text,
        { headers: T, data: le, rawData: ae } = parseData($, h);
      if (T.length < 2 || le.length === 0) {
        u(
          "The file appears to be empty or has no data rows. Please check your file and try again."
        );
        return;
      }
      (u(null), o($));
      const R = (B) => {
          const Z = ae.map((G) => G[B]).filter((G) => G !== "" && G != null);
          return Z.length > 0 && Z.filter((G) => isNumericValue(G)).length / Z.length > 0.5;
        },
        j = T.reduce((B, Z, G) => (R(G) ? [...B, G] : B), []),
        Q = T.reduce((B, Z, G) => (R(G) ? B : [...B, G]), []);
      (w(j[0] !== void 0 ? j[0] : 0),
        E(j[1] !== void 0 ? j[1] : j[0] !== void 0 ? j[0] : 1),
        F(Q[0] !== void 0 ? Q[0] : null),
        D({}),
        p("configure"));
    }, []),
    I = useCallback(
      (r, h) => {
        (g(h), S(r, N));
      },
      [N, S]
    ),
    _ = useCallback(() => {
      const r = window.__LINEPLOT_EXAMPLE__;
      r && (i(","), g("bacterial_growth.csv"), S(r, ","));
    }, [S]),
    Y = () => {
      (o(null), g(""), p("upload"));
    },
    J = (r) =>
      r === "upload"
        ? !0
        : r === "configure"
          ? !!s
          : r === "plot"
            ? !!s && c != null && y != null
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
      canNavigate: J,
    }),
    React.createElement(CommaFixBanner, { commaFixed: d, commaFixCount: v }),
    React.createElement(ParseErrorBanner, { error: f }),
    t === "upload" &&
      React.createElement(UploadStep, {
        sepOverride: N,
        setSepOverride: i,
        rawText: n,
        doParse: S,
        handleFileLoad: I,
        onLoadExample: _,
      }),
    t === "configure" &&
      s &&
      React.createElement(ConfigureStep, {
        parsed: s,
        fileName: a,
        xCol: c,
        setXCol: w,
        yCol: y,
        setYCol: E,
        groupCol: b,
        setGroupCol: F,
        numericCols: V,
        categoricalCols: O,
        setStep: p,
      }),
    t === "plot" &&
      s &&
      React.createElement(PlotStep, {
        parsed: s,
        fileName: a,
        series: C,
        statsRows: te,
        xCol: c,
        setXCol: w,
        yCol: y,
        setYCol: E,
        groupCol: b,
        setGroupCol: F,
        numericCols: V,
        categoricalCols: O,
        setGroupColor: ee,
        vis: L,
        updVis: P,
        autoAxis: X,
        effAxis: ne,
        errorType: W,
        setErrorType: H,
        showStars: z,
        setShowStars: K,
        svgRef: U,
        svgLegend: e,
        resetAll: Y,
      })
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(ErrorBoundary, { toolName: "Line plot" }, React.createElement(App, null))
);
//# sourceMappingURL=lineplot.js.map
