// AequorinStatsDetail (row expander) + AequorinStatsPanel (unified stats
// panel). Aequorin only ever has a single "set" (one bar per condition), so
// the panel runs in singleton-auto-expand mode: one row, already expanded.
// Panel-level controls (Display on plot: Off / Letters / Brackets, Show ns,
// Print summary below plot) drive the inset barplot's annotations and
// summary text via the onAnnotationChange / onSummaryChange callbacks that
// PlotPanel threads into the InsetBarplot chart.
//
// Pure helpers (formatters, annotation-spec builder, summary-text builder,
// aggregate text / R-script builders) live in ./reports so they stay
// unit-testable without React.

import {
  TEST_LABELS_AQ,
  POSTHOC_LABELS_AQ,
  TEST_OPTIONS_AQ_2,
  TEST_OPTIONS_AQ_K,
  formatAqStatShort,
  formatAqResultLine,
  computeAqAnnotationSpec,
  computeAqSummaryText,
  buildAqAggregateReport,
  buildAqAggregateRScript,
} from "./reports";
import { runTest, runPostHoc, postHocForTest } from "../_shell/stats-dispatch";

const { useState, useMemo, useEffect, useRef } = React;

export function AequorinStatsDetail({ row, onOverrideTest, isOverridden }) {
  const names = row.names;
  const values = row.values;
  const k = names.length;
  const res = row.testResult || {};
  const rec = row.rec || {};
  const recReason = rec.recommendation && rec.recommendation.reason;
  const recTest = rec.recommendation && rec.recommendation.test;
  const testOptions = k === 2 ? TEST_OPTIONS_AQ_2 : TEST_OPTIONS_AQ_K;

  const subhead: React.CSSProperties = {
    margin: "10px 0 6px",
    padding: "4px 10px",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "var(--subhead-text)",
    background: "var(--subhead-bg)",
    borderRadius: 4,
    display: "block",
  };
  const thS: React.CSSProperties = {
    textAlign: "left",
    padding: "3px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontWeight: 600,
    fontSize: 11,
  };
  const tdS: React.CSSProperties = {
    padding: "3px 6px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 11,
  };
  const pillOk: React.CSSProperties = {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 8,
    fontSize: 9,
    fontWeight: 700,
    background: "var(--step-ready-bg)",
    color: "var(--step-ready)",
  };
  const pillBad: React.CSSProperties = {
    ...pillOk,
    background: "var(--danger-bg)",
    color: "var(--danger-text)",
  };
  const pillNeutral: React.CSSProperties = {
    ...pillOk,
    background: "var(--neutral-bg)",
    color: "var(--neutral-text)",
  };
  const norm = rec.normality || [];
  const lev = rec.levene || {};

  return (
    <div style={{ padding: "6px 16px 12px 16px", background: "var(--surface-subtle)" }}>
      <div style={subhead}>Groups</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>Group</th>
            <th style={thS}>n</th>
            <th style={thS}>Mean</th>
            <th style={thS}>SD</th>
            <th style={thS}>SEM</th>
            <th style={thS}>95% CI</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, i) => {
            const vs = values[i];
            const n = vs.length;
            const m = sampleMean(vs);
            const sd = n > 1 ? sampleSD(vs) : 0;
            const sem = n > 1 ? sd / Math.sqrt(n) : 0;
            const ci95 = n > 1 ? tinv(0.975, n - 1) * sem : 0;
            return (
              <tr key={i}>
                <td style={tdS}>{name}</td>
                <td style={tdS}>{n}</td>
                <td style={tdS}>{m.toFixed(3)}</td>
                <td style={tdS}>{sd.toFixed(3)}</td>
                <td style={tdS}>{n > 1 ? sem.toFixed(3) : "—"}</td>
                <td style={tdS}>{n > 1 ? `±${ci95.toFixed(3)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={subhead}>Assumptions</div>
      {norm.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}
          >
            Shapiro-Wilk (normality)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {norm.map((r, i) => {
              const label = names[r.group] || `g${r.group}`;
              const pill = r.normal === true ? pillOk : r.normal === false ? pillBad : pillNeutral;
              const verdict =
                r.normal === true ? "normal" : r.normal === false ? "not normal" : "—";
              return (
                <span key={i} style={{ fontSize: 11, color: "var(--text)" }}>
                  {label}: <span style={pill}>{verdict}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
      {lev.F != null && (
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 600 }}>Levene</span> — F({lev.df1}, {lev.df2}) ={" "}
          {lev.F.toFixed(3)}, p = {formatP(lev.p)}{" "}
          <span style={lev.equalVar ? pillOk : pillBad}>
            {lev.equalVar ? "equal variance" : "unequal variance"}
          </span>
        </div>
      )}

      <div style={subhead}>Test</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <select
          value={row.chosenTest || ""}
          onChange={(e) =>
            onOverrideTest && onOverrideTest(e.target.value === recTest ? null : e.target.value)
          }
          className="dv-select"
          style={{ fontSize: 11, padding: "2px 6px", minWidth: 180 }}
          onClick={(e) => e.stopPropagation()}
        >
          {testOptions.map((t) => (
            <option key={t} value={t}>
              {TEST_LABELS_AQ[t]}
              {t === recTest ? "  (recommended)" : ""}
            </option>
          ))}
        </select>
        {isOverridden && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOverrideTest && onOverrideTest(null);
            }}
            className="dv-btn dv-btn-secondary"
            style={{ padding: "2px 8px", fontSize: 10 }}
          >
            Use recommendation
          </button>
        )}
      </div>
      {recReason && (
        <div
          style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 6 }}
        >
          {recReason}
        </div>
      )}
      <div
        style={{
          padding: "6px 10px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 11,
          color: "var(--text)",
        }}
      >
        {res.error
          ? `⚠ ${res.error}`
          : row.chosenTest
            ? formatAqResultLine(row.chosenTest, res)
            : "—"}
      </div>

      {k >= 3 && row.postHocResult && !row.postHocResult.error && (
        <>
          <div style={subhead}>
            Post-hoc — {POSTHOC_LABELS_AQ[row.postHocName] || row.postHocName}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Pair</th>
                <th style={thS}>{row.postHocName === "dunn" ? "Rank diff" : "Mean diff"}</th>
                <th style={thS}>p</th>
                <th style={thS}>Signif.</th>
              </tr>
            </thead>
            <tbody>
              {row.postHocResult.pairs.map((pr, i) => {
                const p = pr.pAdj != null ? pr.pAdj : pr.p;
                const diff =
                  pr.diff != null
                    ? pr.diff.toFixed(3)
                    : pr.z != null
                      ? `z = ${pr.z.toFixed(3)}`
                      : "—";
                return (
                  <tr key={i}>
                    <td style={tdS}>
                      {names[pr.i]} vs {names[pr.j]}
                    </td>
                    <td style={tdS}>{diff}</td>
                    <td style={tdS}>{formatP(p)}</td>
                    <td
                      style={{
                        ...tdS,
                        fontWeight: 700,
                        color: p < 0.05 ? "var(--step-ready)" : "var(--text-faint)",
                      }}
                    >
                      {pStars(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {row.powerResult && (
        <>
          <div style={subhead}>Power analysis (target 80%)</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Effect size</th>
                <th style={thS}>α</th>
                <th style={thS}>Achieved power</th>
                <th style={thS}>n for 80% power</th>
              </tr>
            </thead>
            <tbody>
              {row.powerResult.rows.map((pr, i) => (
                <tr key={i}>
                  {i === 0 ? (
                    <td style={tdS} rowSpan={row.powerResult.rows.length}>
                      {row.powerResult.effectLabel} = {row.powerResult.effect.toFixed(3)}
                    </td>
                  ) : null}
                  <td style={tdS}>{String(pr.alpha)}</td>
                  <td
                    style={{
                      ...tdS,
                      fontWeight: 700,
                      color: pr.achieved >= 0.8 ? "var(--step-ready)" : "var(--warning-text)",
                    }}
                  >
                    {(pr.achieved * 100).toFixed(1)}%
                  </td>
                  <td style={tdS}>
                    {pr.nForTarget != null
                      ? `${pr.nForTarget} ${row.powerResult.nLabel}`
                      : "> 5000"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {row.powerResult.approximate && (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              Approximation — rank-based test power estimated from its parametric analog.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AequorinStatsPanel({
  groups,
  fileStem,
  onAnnotationChange,
  onSummaryChange,
  errorBarLabel,
}: any) {
  const singleKey = "_global";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [singleKey]: true });
  const [hovered, setHovered] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"none" | "cld" | "brackets">("none");
  const [showNs, setShowNs] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const enriched = useMemo(() => {
    const validGroups = (groups || []).filter(
      (g: any) => g && Array.isArray(g.values) && g.values.length >= 2
    );
    const names = validGroups.map((g: any) => g.name);
    const values = validGroups.map((g: any) => g.values.slice());
    const k = names.length;
    if (k < 2) return { key: singleKey, name: "", names, values, k, skip: true };
    const rec = selectTest(values);
    const recTest =
      rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
    const chosenTest = override || recTest || null;
    const testResult = chosenTest ? runTest(chosenTest, values) : null;
    const postHocName = postHocForTest(chosenTest);
    const postHocResult = k > 2 && postHocName ? runPostHoc(postHocName, values) : null;
    const powerResult = computePowerFromData(chosenTest, values);
    return {
      key: singleKey,
      name: "",
      names,
      values,
      k,
      rec,
      recTest,
      chosenTest,
      testResult,
      postHocName,
      postHocResult,
      powerResult,
    };
  }, [groups, override]);

  const annotSpec = useMemo(
    () => (enriched.skip ? null : computeAqAnnotationSpec(enriched, displayMode, showNs)),
    [enriched, displayMode, showNs]
  );
  const annotKey = JSON.stringify(annotSpec);
  const onAnnotRef = useRef(onAnnotationChange);
  onAnnotRef.current = onAnnotationChange;
  useEffect(() => {
    if (typeof onAnnotRef.current === "function") onAnnotRef.current(annotSpec);
  }, [annotKey]);

  const summaryText = useMemo(
    () => (enriched.skip ? null : computeAqSummaryText(enriched, showSummary, errorBarLabel)),
    [enriched, showSummary, errorBarLabel]
  );
  const onSummaryRef = useRef(onSummaryChange);
  onSummaryRef.current = onSummaryChange;
  useEffect(() => {
    if (typeof onSummaryRef.current === "function") onSummaryRef.current(summaryText);
  }, [summaryText]);

  if (enriched.skip) return null;

  const hasR = typeof buildRScript === "function";
  const stem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "aequorin_stats";
  const downloadReport = (e: any) => {
    downloadText(buildAqAggregateReport([enriched]), `${stem}.txt`);
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: any) => {
    downloadText(buildAqAggregateRScript([enriched]), `${stem}.R`);
    flashSaved(e.currentTarget);
  };

  const isOpen = !!expanded[singleKey];
  const p =
    enriched.testResult && !enriched.testResult.error ? (enriched.testResult as any).p : null;
  const sig = p != null && p < 0.05;
  const stars = p != null ? pStars(p) : "";

  const thS: React.CSSProperties = {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    color: "var(--subhead-text)",
    fontWeight: 600,
    fontSize: 12,
    background: "var(--subhead-bg)",
  };
  const tdS: React.CSSProperties = {
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 12,
  };
  const mono: React.CSSProperties = { fontFamily: "ui-monospace, Menlo, monospace" };

  const segBtn = (value: "none" | "cld" | "brackets", label: string) => {
    const active = displayMode === value;
    return (
      <button
        key={value}
        type="button"
        onClick={() => setDisplayMode(value)}
        style={{
          flex: "0 0 auto",
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: active ? 700 : 400,
          fontFamily: "inherit",
          cursor: "pointer",
          border: "none",
          background: active ? "var(--accent-primary)" : "var(--surface)",
          color: active ? "var(--on-accent)" : "var(--text-muted)",
          transition: "background 120ms ease, color 120ms ease",
        }}
      >
        {label}
      </button>
    );
  };
  const anyMulti = enriched.k > 2;
  const nsDisabled = displayMode === "none" || (anyMulti && displayMode === "cld");

  return (
    <div className="dv-panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "0.2px",
            }}
          >
            Statistics
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Click the row to inspect decision trace, assumptions, post-hoc and power.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={downloadReport}
            title="Download a plain-text stats report"
          >
            ⬇ TXT
          </button>
          {hasR && (
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={downloadR}
              title="Download a runnable R script reproducing this test"
            >
              ⬇ R
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-subtle)",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
          Display on plot
        </span>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
          }}
        >
          {segBtn("none", "Off")}
          {anyMulti && segBtn("cld", "Letters")}
          {segBtn("brackets", "Brackets")}
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: nsDisabled ? "var(--text-faint)" : "var(--text)",
            cursor: nsDisabled ? "not-allowed" : "pointer",
            opacity: nsDisabled ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={!nsDisabled && showNs}
            disabled={nsDisabled}
            onChange={(e) => setShowNs(e.target.checked)}
            style={{ accentColor: "var(--cta-primary-bg)" }}
          />
          Show ns
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showSummary}
            onChange={(e) => setShowSummary(e.target.checked)}
            style={{ accentColor: "var(--cta-primary-bg)" }}
          />
          Print summary below plot
        </label>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thS}>Groups</th>
            <th style={thS}>Test</th>
            <th style={thS}>Statistic</th>
            <th style={thS}>p</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          <tr
            onClick={() => setExpanded((prev) => ({ ...prev, [singleKey]: !isOpen }))}
            onMouseEnter={() => setHovered(singleKey)}
            onMouseLeave={() => setHovered((h) => (h === singleKey ? null : h))}
            style={{
              cursor: "pointer",
              background: isOpen
                ? "var(--surface-subtle)"
                : hovered === singleKey
                  ? "var(--row-hover-bg)"
                  : undefined,
              transition: "background 120ms ease",
            }}
          >
            <td style={tdS}>{enriched.k}</td>
            <td style={tdS}>{TEST_LABELS_AQ[enriched.chosenTest] || enriched.chosenTest || "—"}</td>
            <td style={{ ...tdS, ...mono }}>
              {formatAqStatShort(enriched.chosenTest, enriched.testResult)}
            </td>
            <td
              style={{
                ...tdS,
                ...mono,
                fontWeight: sig ? 700 : 400,
                color: sig ? "var(--step-ready)" : "var(--text)",
              }}
            >
              {p != null ? formatP(p) : "—"}
            </td>
            <td
              style={{
                ...tdS,
                textAlign: "right",
                color: sig ? "var(--step-ready)" : "var(--text-faint)",
                fontWeight: 700,
              }}
            >
              {stars && stars !== "ns" ? stars : ""}
            </td>
          </tr>
          {isOpen && (
            <tr>
              <td colSpan={5} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                <AequorinStatsDetail
                  row={enriched}
                  isOverridden={!!override}
                  onOverrideTest={(t: string | null) => setOverride(t)}
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
