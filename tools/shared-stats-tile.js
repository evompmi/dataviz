// shared-stats-tile.js — plain JS, no JSX
// Requires React, shared.js (sec, selStyle, btnSecondary, downloadText, flashSaved,
// fFromGroupMeans, powerTwoSample, powerAnova), and stats.js (tTest, mannWhitneyU,
// oneWayANOVA, welchANOVA, kruskalWallis, tukeyHSD, gamesHowell, dunnTest,
// compactLetterDisplay, selectTest, pStars, formatP, sampleMean, sampleSD)
// to be loaded globally before this script.

// ── StatsTile ──────────────────────────────────────────────────────────────
//
// Collapsible tile that runs the assumption checks, picks a test from the
// decision tree (user can override), runs post-hocs for k ≥ 3, and emits an
// annotation spec to the parent via `onAnnotationsChange` so the chart can
// draw brackets / compact-letter labels above the bars.
//
// Props:
//   groups                [{ name, values: number[] }]
//   onAnnotationsChange?  (spec | null) => void
//                         spec is either
//                           { kind: "brackets", pairs: [{i,j,label,p}], groupNames }
//                           { kind: "cld",      labels: string[],       groupNames }
//
// Kept plain JS (React.createElement, no JSX) so it can live alongside the
// rest of the shared components without requiring a build step.

const STATS_LABELS = {
  studentT: "Student's t-test",
  welchT: "Welch's t-test",
  mannWhitney: "Mann-Whitney U",
  oneWayANOVA: "One-way ANOVA",
  welchANOVA: "Welch's ANOVA",
  kruskalWallis: "Kruskal-Wallis",
};
const POSTHOC_LABELS = {
  tukeyHSD: "Tukey HSD",
  gamesHowell: "Games-Howell",
  dunn: "Dunn (BH-adjusted)",
};

function _runTest(name, values) {
  if (name === "studentT") return tTest(values[0], values[1], { equalVar: true });
  if (name === "welchT") return tTest(values[0], values[1], { equalVar: false });
  if (name === "mannWhitney") return mannWhitneyU(values[0], values[1]);
  if (name === "oneWayANOVA") return oneWayANOVA(values);
  if (name === "welchANOVA") return welchANOVA(values);
  if (name === "kruskalWallis") return kruskalWallis(values);
  return null;
}

function _runPostHoc(name, values) {
  if (name === "tukeyHSD") return tukeyHSD(values);
  if (name === "gamesHowell") return gamesHowell(values);
  if (name === "dunn") return dunnTest(values);
  return null;
}

function _postHocFor(testName) {
  if (testName === "oneWayANOVA") return "tukeyHSD";
  if (testName === "welchANOVA") return "gamesHowell";
  if (testName === "kruskalWallis") return "dunn";
  return null;
}

// Format a test's primary result line. Each test returns slightly different
// fields (t/df/p for t-tests, F/df1/df2/p for ANOVA, U/z/p for MWU, etc.).
function _formatTestLine(name, res) {
  if (!res || res.error) return res && res.error ? "⚠ " + res.error : "—";
  if (name === "studentT" || name === "welchT")
    return `t(${res.df.toFixed(2)}) = ${res.t.toFixed(3)},  p = ${formatP(res.p)}`;
  if (name === "mannWhitney")
    return `U = ${res.U.toFixed(1)},  z = ${res.z.toFixed(3)},  p = ${formatP(res.p)}`;
  if (name === "oneWayANOVA" || name === "welchANOVA")
    return `F(${res.df1}, ${typeof res.df2 === "number" ? res.df2.toFixed(2) : res.df2}) = ${res.F.toFixed(3)},  p = ${formatP(res.p)}`;
  if (name === "kruskalWallis") return `H(${res.df}) = ${res.H.toFixed(3)},  p = ${formatP(res.p)}`;
  return "—";
}

function _padR(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// Plain-text statistics report, rendered as fixed-width columns so it
// reads cleanly in any editor. Mirrors what the StatsTile shows on screen:
// per-group descriptives, Shapiro-Wilk, Levene, chosen test result, and
// the post-hoc pairs when k ≥ 3.
function _buildStatsReport(ctx) {
  const {
    names,
    values,
    recommendation,
    chosenTest,
    testResult,
    postHocName,
    postHocResult,
    powerResult,
  } = ctx;
  const lines = [];
  const sep = "=".repeat(64);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nameW = Math.max(8, ...names.map((n) => n.length));

  lines.push("Statistical analysis report");
  lines.push("Generated: " + now);
  lines.push("");

  lines.push(sep);
  lines.push("GROUPS");
  lines.push(sep);
  for (let i = 0; i < names.length; i++) {
    const vs = values[i];
    const n = vs.length;
    const m = vs.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(vs.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1)) : 0;
    lines.push(
      "  " +
        _padR(names[i], nameW) +
        "  n = " +
        _padR(String(n), 4) +
        "  mean = " +
        _padR(m.toFixed(3), 10) +
        "  SD = " +
        sd.toFixed(3)
    );
  }
  lines.push("");

  lines.push(sep);
  lines.push("ASSUMPTIONS");
  lines.push(sep);
  lines.push("");
  lines.push("Shapiro-Wilk test for normality");
  const norm = (recommendation && recommendation.normality) || [];
  lines.push(
    "  " +
      _padR("Group", nameW) +
      "  " +
      _padR("n", 4) +
      "  " +
      _padR("W", 8) +
      "  " +
      _padR("p", 10) +
      "Assessment"
  );
  lines.push("  " + "-".repeat(nameW + 2 + 4 + 2 + 8 + 2 + 10 + 10));
  for (const r of norm) {
    const gname = names[r.group];
    const assessment =
      r.normal === true ? "normal" : r.normal === false ? "not normal" : r.note || "unknown";
    lines.push(
      "  " +
        _padR(gname, nameW) +
        "  " +
        _padR(String(r.n), 4) +
        "  " +
        _padR(r.W != null ? r.W.toFixed(3) : "—", 8) +
        "  " +
        _padR(r.p != null ? formatP(r.p) : r.note || "—", 10) +
        assessment
    );
  }
  lines.push("");

  const lev = (recommendation && recommendation.levene) || {};
  lines.push("Levene (Brown-Forsythe) test for equal variance");
  if (lev.error) {
    lines.push("  error: " + lev.error);
  } else if (lev.F != null) {
    lines.push(
      "  F(" +
        lev.df1 +
        ", " +
        lev.df2 +
        ") = " +
        lev.F.toFixed(3) +
        ",  p = " +
        formatP(lev.p) +
        "   -> " +
        (lev.equalVar ? "equal variance" : "unequal variance")
    );
  } else {
    lines.push("  —");
  }
  lines.push("");

  lines.push(sep);
  lines.push("TEST");
  lines.push(sep);
  lines.push("");
  const recTest =
    recommendation && recommendation.recommendation && recommendation.recommendation.test;
  const recReason =
    recommendation && recommendation.recommendation && recommendation.recommendation.reason;
  lines.push("Recommended: " + (recTest ? STATS_LABELS[recTest] : "—"));
  if (recReason) lines.push("Reason:      " + recReason);
  lines.push("Chosen:      " + (chosenTest ? STATS_LABELS[chosenTest] : "—"));
  lines.push("");
  lines.push("Result: " + _formatTestLine(chosenTest, testResult));
  lines.push("");

  if (powerResult) {
    lines.push(sep);
    lines.push("POWER ANALYSIS (target = 80%)");
    lines.push(sep);
    lines.push("");
    lines.push(
      "Effect size:       " + powerResult.effectLabel + " = " + powerResult.effect.toFixed(3)
    );
    lines.push("");
    const aW = 8;
    const pW = 16;
    const nW = 16;
    lines.push(_padR("alpha", aW) + _padR("Achieved power", pW) + "n for 80% power");
    lines.push("-".repeat(aW + pW + nW));
    for (let ri = 0; ri < powerResult.rows.length; ri++) {
      const row = powerResult.rows[ri];
      const aStr = String(row.alpha);
      const pStr = (row.achieved * 100).toFixed(1) + "%";
      const nStr = row.nForTarget != null ? row.nForTarget + " " + powerResult.nLabel : "> 5000";
      lines.push(_padR(aStr, aW) + _padR(pStr, pW) + nStr);
    }
    if (powerResult.approximate) {
      lines.push("");
      lines.push("  Note: rank-based test — power estimated from its parametric analog.");
    }
    lines.push("");
  }

  if (postHocResult && !postHocResult.error && postHocName) {
    lines.push(sep);
    lines.push("POST-HOC — " + POSTHOC_LABELS[postHocName]);
    lines.push(sep);
    lines.push("");
    const pairW = Math.max(
      10,
      ...postHocResult.pairs.map((pr) => (names[pr.i] + " vs " + names[pr.j]).length)
    );
    const diffLabel = postHocName === "dunn" ? "Rank diff" : "Mean diff";
    lines.push(
      "  " + _padR("Pair", pairW) + "  " + _padR(diffLabel, 12) + "  " + _padR("p", 10) + "Signif."
    );
    lines.push("  " + "-".repeat(pairW + 2 + 12 + 2 + 10 + 8));
    for (const pr of postHocResult.pairs) {
      const pVal = pr.pAdj != null ? pr.pAdj : pr.p;
      const diff =
        pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? "z = " + pr.z.toFixed(3) : "—";
      lines.push(
        "  " +
          _padR(names[pr.i] + " vs " + names[pr.j], pairW) +
          "  " +
          _padR(diff, 12) +
          "  " +
          _padR(formatP(pVal), 10) +
          pStars(pVal)
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// Compute achieved power + n-needed-for-80%-power from the observed data,
// dispatched by the test family chosen in the StatsTile. For non-parametric
// tests (Mann-Whitney / Kruskal-Wallis) we report the parametric analog as
// an approximation — noted in the returned `approximate` flag and in the
// on-screen label. Computed at α = 0.05, 0.01, 0.001; target power = 0.80.
function _computePower(chosenTest, values) {
  if (!chosenTest || !values || values.length < 2) return null;
  const alphas = [0.05, 0.01, 0.001];
  const target = 0.8;

  if (chosenTest === "studentT" || chosenTest === "welchT" || chosenTest === "mannWhitney") {
    const x = values[0],
      y = values[1];
    const n1 = x.length,
      n2 = y.length;
    if (n1 < 2 || n2 < 2) return null;
    const m1 = sampleMean(x),
      m2 = sampleMean(y);
    const s1 = sampleSD(x),
      s2 = sampleSD(y);
    const sp = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
    const d = sp > 0 ? Math.abs(m1 - m2) / sp : 0;
    const nh = 2 / (1 / n1 + 1 / n2);
    const nEff = Math.max(2, Math.round(nh));
    const rows = alphas.map(function (alpha) {
      const achieved = powerTwoSample(d, nEff, alpha, 2);
      let needed = null;
      if (d > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerTwoSample(d, n, alpha, 2) >= target) {
            needed = n;
            break;
          }
        }
      }
      return { alpha: alpha, achieved: achieved, nForTarget: needed };
    });
    return {
      effectLabel: "Cohen's d",
      effect: d,
      rows: rows,
      targetPower: target,
      nLabel: "per group",
      approximate: chosenTest === "mannWhitney",
    };
  }

  if (
    chosenTest === "oneWayANOVA" ||
    chosenTest === "welchANOVA" ||
    chosenTest === "kruskalWallis"
  ) {
    const kk = values.length;
    if (kk < 2) return null;
    const means = values.map(sampleMean);
    const ns = values.map(function (v) {
      return v.length;
    });
    if (
      ns.some(function (n) {
        return n < 2;
      })
    )
      return null;
    let ssW = 0,
      dfW = 0;
    for (let i = 0; i < kk; i++) {
      const m = means[i];
      for (let j = 0; j < values[i].length; j++) ssW += (values[i][j] - m) * (values[i][j] - m);
      dfW += values[i].length - 1;
    }
    const sp = dfW > 0 ? Math.sqrt(ssW / dfW) : 0;
    const f = fFromGroupMeans(means, sp);
    const nh =
      kk /
      ns.reduce(function (a, b) {
        return a + 1 / b;
      }, 0);
    const nEff = Math.max(2, Math.round(nh));
    const rows = alphas.map(function (alpha) {
      const achieved = powerAnova(f, nEff, alpha, kk);
      let needed = null;
      if (f > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerAnova(f, n, alpha, kk) >= target) {
            needed = n;
            break;
          }
        }
      }
      return { alpha: alpha, achieved: achieved, nForTarget: needed };
    });
    return {
      effectLabel: "Cohen's f",
      effect: f,
      rows: rows,
      targetPower: target,
      nLabel: "per group",
      approximate: chosenTest === "kruskalWallis",
    };
  }

  return null;
}

// Given a list of {i, j} pairs, assign a vertical level (0 = lowest) to each
// so brackets at overlapping spans stack instead of colliding. Greedy by
// ascending span width. Exposed as a global so chart renderers can reuse
// the layout.
function assignBracketLevels(pairs) {
  const enriched = pairs.map((pr, idx) => ({ ...pr, _span: Math.abs(pr.j - pr.i), _orig: idx }));
  enriched.sort((a, b) => a._span - b._span);
  const placed = [];
  for (const pr of enriched) {
    let lvl = 0;
    while (
      placed.some(
        (q) =>
          q._level === lvl &&
          Math.max(Math.min(q.i, q.j), Math.min(pr.i, pr.j)) <=
            Math.min(Math.max(q.i, q.j), Math.max(pr.i, pr.j))
      )
    ) {
      lvl++;
    }
    pr._level = lvl;
    placed.push(pr);
  }
  // Restore original input order so the parent can match up labels.
  placed.sort((a, b) => a._orig - b._orig);
  return placed.map(({ _orig: _o, _span: _s, ...rest }) => rest);
}

function StatsTile({ groups, onAnnotationsChange, onStatsSummaryChange, defaultOpen }) {
  const validGroups = (groups || []).filter(
    (g) => g && Array.isArray(g.values) && g.values.length >= 2
  );
  const k = validGroups.length;

  const [open, setOpen] = React.useState(!!defaultOpen);
  const [overrideTest, setOverrideTest] = React.useState(null);
  const [showOnPlot, setShowOnPlot] = React.useState(false);
  const [annotKind, setAnnotKind] = React.useState("cld"); // only used when k>2
  const [showNs, setShowNs] = React.useState(true);

  const values = React.useMemo(() => validGroups.map((g) => g.values.slice()), [validGroups]);
  const names = React.useMemo(() => validGroups.map((g) => g.name), [validGroups]);

  const recommendation = React.useMemo(() => {
    if (k < 2) return null;
    return selectTest(values);
  }, [values, k]);

  const chosenTest =
    overrideTest ||
    (recommendation && recommendation.recommendation && recommendation.recommendation.test) ||
    null;

  const testResult = React.useMemo(
    () => (chosenTest ? _runTest(chosenTest, values) : null),
    [chosenTest, values]
  );

  const postHocName = _postHocFor(chosenTest);
  const postHocResult = React.useMemo(
    () => (k > 2 && postHocName ? _runPostHoc(postHocName, values) : null),
    [postHocName, values, k]
  );
  const powerResult = React.useMemo(() => _computePower(chosenTest, values), [chosenTest, values]);

  // Build annotation spec for the chart.
  const annotationSpec = React.useMemo(() => {
    if (!showOnPlot || k < 2) return null;
    if (k === 2) {
      const p = testResult && !testResult.error ? testResult.p : null;
      if (p == null) return null;
      if (!showNs && p >= 0.05) return null;
      return {
        kind: "brackets",
        pairs: [{ i: 0, j: 1, p, label: pStars(p) }],
        groupNames: names,
      };
    }
    if (!postHocResult || postHocResult.error) return null;
    if (annotKind === "cld") {
      const labels = compactLetterDisplay(postHocResult.pairs, k);
      return { kind: "cld", labels, groupNames: names };
    }
    // Brackets: draw all pairs, prefer pAdj if present.
    const all = postHocResult.pairs
      .map((pr) => ({
        i: pr.i,
        j: pr.j,
        p: pr.pAdj != null ? pr.pAdj : pr.p,
      }))
      .map((pr) => ({ ...pr, label: pStars(pr.p) }))
      .filter((pr) => showNs || pr.p < 0.05);
    if (all.length === 0) return null;
    return { kind: "brackets", pairs: all, groupNames: names };
  }, [showOnPlot, annotKind, showNs, k, testResult, postHocResult, names]);

  // Build a plain-text stats summary for display below the plot.
  const statsSummary = React.useMemo(
    function () {
      if (!showOnPlot || !chosenTest || !testResult || testResult.error) return null;
      const parts = [];
      parts.push(
        (STATS_LABELS[chosenTest] || chosenTest) + ": " + _formatTestLine(chosenTest, testResult)
      );
      if (k > 2 && postHocResult && !postHocResult.error) {
        const phLabel = POSTHOC_LABELS[postHocName] || postHocName;
        parts.push("Post-hoc: " + phLabel);
        postHocResult.pairs.forEach(function (pr) {
          const p = pr.pAdj != null ? pr.pAdj : pr.p;
          parts.push(
            "  " + names[pr.i] + " vs " + names[pr.j] + ": p = " + formatP(p) + " " + pStars(p)
          );
        });
      }
      if (powerResult) {
        parts.push(
          "Effect size: " + powerResult.effectLabel + " = " + powerResult.effect.toFixed(3)
        );
      }
      parts.push(
        "n per group: " +
          names
            .map(function (n, i) {
              return n + "=" + values[i].length;
            })
            .join(", ")
      );
      return parts.join("\n");
    },
    [showOnPlot, chosenTest, testResult, k, postHocResult, postHocName, names, powerResult, values]
  );

  // Emit annotations to the parent. We hold the latest spec in a ref and
  // fire the effect only when its serialized form changes, so unrelated
  // re-renders don't trigger a parent state update.
  const specKey = annotationSpec ? JSON.stringify(annotationSpec) : "";
  const latestSpec = React.useRef(annotationSpec);
  latestSpec.current = annotationSpec;
  const onChangeRef = React.useRef(onAnnotationsChange);
  onChangeRef.current = onAnnotationsChange;
  React.useEffect(() => {
    if (typeof onChangeRef.current === "function") onChangeRef.current(latestSpec.current);
  }, [specKey]);

  // Emit stats summary to the parent.
  const summaryKey = statsSummary || "";
  const latestSummary = React.useRef(statsSummary);
  latestSummary.current = statsSummary;
  const onSummaryRef = React.useRef(onStatsSummaryChange);
  onSummaryRef.current = onStatsSummaryChange;
  React.useEffect(
    function () {
      if (typeof onSummaryRef.current === "function") onSummaryRef.current(latestSummary.current);
    },
    [summaryKey]
  );

  // Nothing to show.
  if (k < 2) return null;

  // ── Styles ────────────────────────────────────────────────────────────────
  const wrap = {
    ...sec,
    marginTop: 12,
    background: "#f8f8fa",
  };
  const header = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
  };
  const h3 = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#333",
    letterSpacing: "0.2px",
  };
  const subhead = {
    margin: "14px 0 8px",
    padding: "5px 12px",
    fontSize: 11,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#fff",
    background: "#475569",
    borderRadius: 4,
    display: "block",
  };
  const row = { display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#444" };
  const pillOk = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 700,
    background: "#dcfce7",
    color: "#166534",
  };
  const pillBad = { ...pillOk, background: "#fee2e2", color: "#991b1b" };
  const pillNeutral = { ...pillOk, background: "#e5e7eb", color: "#374151" };
  const table = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
    marginTop: 4,
  };
  const th = {
    textAlign: "left",
    padding: "4px 6px",
    borderBottom: "1px solid #ddd",
    color: "#555",
    fontWeight: 600,
  };
  const td = { padding: "4px 6px", borderBottom: "1px solid #eee", color: "#333" };

  // ── Header rows ───────────────────────────────────────────────────────────
  const displayTileHeader = React.createElement("h3", { style: h3 }, "Statistics display");
  const summaryHeaderEl = React.createElement(
    "div",
    { style: header, onClick: () => setOpen((o) => !o) },
    React.createElement("h3", { style: h3 }, "Statistics summary"),
    React.createElement("span", { style: { fontSize: 12, color: "#888" } }, open ? "▾" : "▸")
  );

  // ── Display-on-plot controls ──────────────────────────────────────────────
  const displayControls = React.createElement(
    "div",
    {
      style: {
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      },
    },
    React.createElement(
      "label",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "#333",
          cursor: "pointer",
        },
      },
      React.createElement("input", {
        type: "checkbox",
        checked: showOnPlot,
        onChange: (e) => setShowOnPlot(e.target.checked),
      }),
      "Display on plot"
    ),
    k > 2
      ? React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 10, fontSize: 12 } },
          React.createElement("span", { style: { color: "#666" } }, "Style:"),
          React.createElement(
            "label",
            { style: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer" } },
            React.createElement("input", {
              type: "radio",
              name: "stats-annot-kind",
              checked: annotKind === "cld",
              onChange: () => setAnnotKind("cld"),
            }),
            "letters (a/ab/b)"
          ),
          React.createElement(
            "label",
            { style: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer" } },
            React.createElement("input", {
              type: "radio",
              name: "stats-annot-kind",
              checked: annotKind === "brackets",
              onChange: () => setAnnotKind("brackets"),
            }),
            "brackets"
          )
        )
      : null,
    showOnPlot && (k === 2 || annotKind === "brackets")
      ? React.createElement(
          "label",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              cursor: "pointer",
            },
          },
          React.createElement("input", {
            type: "checkbox",
            checked: showNs,
            onChange: (e) => setShowNs(e.target.checked),
          }),
          "Show ns"
        )
      : null
  );

  const displayTile = React.createElement(
    "div",
    { style: wrap },
    displayTileHeader,
    displayControls
  );

  if (!open)
    return React.createElement(
      React.Fragment,
      null,
      displayTile,
      React.createElement("div", { style: wrap }, summaryHeaderEl)
    );

  // ── Assumptions section ───────────────────────────────────────────────────
  const norm = (recommendation && recommendation.normality) || [];
  const lev = (recommendation && recommendation.levene) || {};
  const normalityRows = norm.map((r) =>
    React.createElement(
      "tr",
      { key: r.group },
      React.createElement("td", { style: td }, names[r.group]),
      React.createElement("td", { style: td }, r.n),
      React.createElement("td", { style: td }, r.W != null ? r.W.toFixed(3) : "—"),
      React.createElement("td", { style: td }, r.p != null ? formatP(r.p) : r.note || "—"),
      React.createElement(
        "td",
        { style: td },
        r.normal === true
          ? React.createElement("span", { style: pillOk }, "normal")
          : r.normal === false
            ? React.createElement("span", { style: pillBad }, "not normal")
            : React.createElement("span", { style: pillNeutral }, "unknown")
      )
    )
  );
  const normalityCaption = React.createElement(
    "div",
    {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: "#555",
        marginTop: 4,
      },
    },
    "Shapiro-Wilk test for normality"
  );
  const normalityTable = React.createElement(
    "table",
    { style: table },
    React.createElement(
      "thead",
      null,
      React.createElement(
        "tr",
        null,
        React.createElement("th", { style: th }, "Group"),
        React.createElement("th", { style: th }, "n"),
        React.createElement("th", { style: th }, "W"),
        React.createElement("th", { style: th }, "p"),
        React.createElement("th", { style: th }, "Assessment")
      )
    ),
    React.createElement("tbody", null, normalityRows)
  );

  const leveneCaption = React.createElement(
    "div",
    {
      style: {
        fontSize: 11,
        fontWeight: 600,
        color: "#555",
        marginTop: 12,
        marginBottom: 2,
      },
    },
    "Levene (Brown-Forsythe) test for equal variance"
  );
  const leveneLine = React.createElement(
    "div",
    { style: row },
    lev.error
      ? React.createElement("span", { style: { color: "#b91c1c" } }, lev.error)
      : React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "span",
            null,
            "F(" + lev.df1 + ", " + lev.df2 + ") = " + lev.F.toFixed(3) + ",  p = " + formatP(lev.p)
          ),
          React.createElement(
            "span",
            { style: lev.equalVar ? pillOk : pillBad },
            lev.equalVar ? "equal variance" : "unequal variance"
          )
        )
  );

  // ── Test picker ───────────────────────────────────────────────────────────
  const testOptions =
    k === 2
      ? ["studentT", "welchT", "mannWhitney"]
      : ["oneWayANOVA", "welchANOVA", "kruskalWallis"];
  const recTest =
    recommendation && recommendation.recommendation && recommendation.recommendation.test;
  const recReason =
    recommendation && recommendation.recommendation && recommendation.recommendation.reason;
  const testPicker = React.createElement(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
    React.createElement(
      "select",
      {
        value: chosenTest || "",
        onChange: (e) => setOverrideTest(e.target.value === recTest ? null : e.target.value),
        style: { ...selStyle, minWidth: 180 },
      },
      testOptions.map((t) =>
        React.createElement(
          "option",
          { key: t, value: t },
          STATS_LABELS[t] + (t === recTest ? "  (recommended)" : "")
        )
      )
    ),
    overrideTest
      ? React.createElement(
          "button",
          {
            onClick: () => setOverrideTest(null),
            style: {
              ...btnSecondary,
              padding: "4px 10px",
              fontSize: 11,
            },
          },
          "Use recommendation"
        )
      : null
  );

  const reasonLine = recReason
    ? React.createElement(
        "div",
        { style: { fontSize: 11, color: "#666", marginTop: 4, fontStyle: "italic" } },
        recReason
      )
    : null;

  const resultLine = React.createElement(
    "div",
    {
      style: {
        marginTop: 8,
        padding: "8px 10px",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 6,
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 12,
        color: "#111",
      },
    },
    _formatTestLine(chosenTest, testResult)
  );

  // ── Post-hoc table (k ≥ 3) ────────────────────────────────────────────────
  let postHocBlock = null;
  if (k > 2 && postHocResult && !postHocResult.error) {
    const rows = postHocResult.pairs.map((pr, idx) => {
      const pVal = pr.pAdj != null ? pr.pAdj : pr.p;
      return React.createElement(
        "tr",
        { key: idx },
        React.createElement("td", { style: td }, names[pr.i] + " vs " + names[pr.j]),
        React.createElement(
          "td",
          { style: td },
          pr.diff != null ? pr.diff.toFixed(3) : pr.z != null ? "z = " + pr.z.toFixed(3) : "—"
        ),
        React.createElement("td", { style: td }, formatP(pVal)),
        React.createElement(
          "td",
          { style: { ...td, fontWeight: 700, color: pVal < 0.05 ? "#166534" : "#777" } },
          pStars(pVal)
        )
      );
    });
    postHocBlock = React.createElement(
      "div",
      null,
      React.createElement("div", { style: subhead }, "Post-hoc — " + POSTHOC_LABELS[postHocName]),
      React.createElement(
        "table",
        { style: table },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement("th", { style: th }, "Pair"),
            React.createElement(
              "th",
              { style: th },
              postHocName === "dunn" ? "Rank diff" : "Mean diff"
            ),
            React.createElement("th", { style: th }, "p"),
            React.createElement("th", { style: th }, "Signif.")
          )
        ),
        React.createElement("tbody", null, rows)
      )
    );
  }

  // ── Power analysis ────────────────────────────────────────────────────────
  let powerBlock = null;
  if (powerResult) {
    const fmtPct = (p) => (p * 100).toFixed(1) + "%";
    const fmtAlpha = (a) => String(a);
    const nNeededText = (row) =>
      row.nForTarget != null ? row.nForTarget + " " + powerResult.nLabel : "> 5000";
    powerBlock = React.createElement(
      "div",
      null,
      React.createElement("div", { style: subhead }, "Power analysis (target 80%)"),
      React.createElement(
        "table",
        { style: table },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement("th", { style: th }, "Effect size"),
            React.createElement("th", { style: th }, "\u03B1"),
            React.createElement("th", { style: th }, "Achieved power"),
            React.createElement("th", { style: th }, "n for 80% power")
          )
        ),
        React.createElement(
          "tbody",
          null,
          powerResult.rows.map((row, ri) =>
            React.createElement(
              "tr",
              { key: ri },
              ri === 0
                ? React.createElement(
                    "td",
                    { style: td, rowSpan: powerResult.rows.length },
                    powerResult.effectLabel + " = " + powerResult.effect.toFixed(3)
                  )
                : null,
              React.createElement("td", { style: td }, fmtAlpha(row.alpha)),
              React.createElement(
                "td",
                {
                  style: {
                    ...td,
                    fontWeight: 700,
                    color: row.achieved >= 0.8 ? "#166534" : "#b45309",
                  },
                },
                fmtPct(row.achieved)
              ),
              React.createElement("td", { style: td }, nNeededText(row))
            )
          )
        )
      ),
      powerResult.approximate
        ? React.createElement(
            "div",
            { style: { fontSize: 11, color: "#888", fontStyle: "italic", marginTop: 4 } },
            "Approximation — rank-based test power estimated from its parametric analog."
          )
        : null
    );
  }

  // ── Download report ───────────────────────────────────────────────────────
  const downloadReportBtn = React.createElement(
    "div",
    { style: { marginTop: 12, display: "flex", justifyContent: "flex-end" } },
    React.createElement(
      "button",
      {
        onClick: (e) => {
          const txt = _buildStatsReport({
            names,
            values,
            recommendation,
            chosenTest,
            testResult,
            postHocName,
            postHocResult,
            powerResult,
          });
          downloadText(txt, "stats_report.txt");
          flashSaved(e.currentTarget);
        },
        style: {
          padding: "8px 14px",
          borderRadius: 6,
          fontSize: 12,
          cursor: "pointer",
          background: "#dcfce7",
          border: "1px solid #86efac",
          color: "#166534",
          fontFamily: "inherit",
          fontWeight: 600,
        },
      },
      "\u2B07 Download report (.txt)"
    )
  );

  return React.createElement(
    React.Fragment,
    null,
    displayTile,
    React.createElement(
      "div",
      { style: wrap },
      summaryHeaderEl,
      React.createElement(
        "div",
        { style: { marginTop: 10 } },
        React.createElement("div", { style: subhead }, "Assumptions"),
        normalityCaption,
        normalityTable,
        leveneCaption,
        leveneLine,
        React.createElement("div", { style: subhead }, "Test"),
        testPicker,
        reasonLine,
        resultLine,
        postHocBlock,
        powerBlock,
        downloadReportBtn
      )
    )
  );
}
