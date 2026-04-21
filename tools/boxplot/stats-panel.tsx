// Unified stats panel for the boxplot tool + its detail expander + the stats
// state reducer used by App.
//
// Replaces the per-facet / per-subgroup stack of StatsTiles with a single
// scannable table: one row per "stat set" (facet, subgroup, or the whole
// plot in flat mode), aggregate TXT / R downloads, and click-row-to-expand
// detail with slate-banner sections (Groups / Assumptions / Test /
// Post-hoc / Power). Matches the Line Plot per-x panel vocabulary.
//
// Per-set test override lives in the expanded detail. Global display
// controls (show on plot, Letters vs Brackets, show ns, print summary
// below plot) live in the panel header and apply to every set in lockstep.
//
// The panel emits per-row annotation + summary via `onAnnotationForKey(key, …)`
// and `onSummaryForKey(key, …)`. App routes these into mode-specific stores:
//   - Facet mode:    `facetStats*` maps keyed on `fd.category`
//   - Subgroup mode: `subgroup*` maps keyed on `sg.name`, then merged
//                    (annotations only) into a single spec via
//                    `mergeSubgroupAnnotations` for the shared chart
//   - Flat mode:     scalar `flatStats*` state (the key is ignored)
//
// Pure formatting, annotation, and summary helpers live in
// tools/boxplot/helpers.ts. Text + R-script report builders live in
// tools/boxplot/reports.ts. Test / post-hoc dispatchers live in
// tools/_shell/stats-dispatch.ts.

import { runTest, runPostHoc, postHocForTest } from "../_shell/stats-dispatch";
import {
  TEST_LABELS_BP,
  POSTHOC_LABELS_BP,
  TEST_OPTIONS_BP_2,
  TEST_OPTIONS_BP_K,
  formatBpStatShort,
  formatBpResultLine,
  computeBpAnnotationSpec,
  computeBpSummaryText,
} from "./helpers";
import { buildBpAggregateReport, buildBpAggregateRScript } from "./reports";

const { useState, useMemo, useRef, useEffect } = React;

function BoxplotStatsDetail({ row, onOverrideTest, isOverridden }) {
  const names = row.names;
  const values = row.values;
  const k = names.length;
  const res = row.testResult || {};
  const rec = row.rec || {};
  const recReason = rec.recommendation && rec.recommendation.reason;
  const recTest = rec.recommendation && rec.recommendation.test;
  const testOptions = k === 2 ? TEST_OPTIONS_BP_2 : TEST_OPTIONS_BP_K;

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
              {TEST_LABELS_BP[t]}
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
            ? formatBpResultLine(row.chosenTest, res)
            : "—"}
      </div>

      {k >= 3 && row.postHocResult && !row.postHocResult.error && (
        <>
          <div style={subhead}>
            Post-hoc — {POSTHOC_LABELS_BP[row.postHocName] || row.postHocName}
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

export function BoxplotStatsPanel({
  sets,
  setLabel,
  fileStem,
  onAnnotationForKey,
  onSummaryForKey,
  singletonAutoExpand = false,
  displayMode,
  onDisplayModeChange,
  showNs,
  onShowNsChange,
  showSummary,
  onShowSummaryChange,
  errorBarLabel,
}: any) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    singletonAutoExpand && sets.length === 1 ? { [sets[0].key]: true } : {}
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const setDisplayMode = onDisplayModeChange;
  const setShowNs = onShowNsChange;
  const setShowSummary = onShowSummaryChange;

  const enriched = useMemo(
    () =>
      sets.map((s: any) => {
        const validGroups = (s.groups || []).filter(
          (g: any) => g && Array.isArray(g.values) && g.values.length >= 2
        );
        const names = validGroups.map((g: any) => g.name);
        const values = validGroups.map((g: any) => g.values.slice());
        const k = names.length;
        if (k < 2) return { ...s, names, values, k, skip: true };
        const rec = selectTest(values);
        const recTest =
          rec && rec.recommendation && rec.recommendation.test ? rec.recommendation.test : null;
        const chosenTest = overrides[s.key] || recTest || null;
        const testResult = chosenTest ? runTest(chosenTest, values) : null;
        const postHocName = postHocForTest(chosenTest);
        const postHocResult = k > 2 && postHocName ? runPostHoc(postHocName, values) : null;
        const powerResult = computePowerFromData(chosenTest, values);
        return {
          ...s,
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
      }),
    [sets, overrides]
  );

  const annotByKey = useMemo(() => {
    const out: Record<string, any> = {};
    for (const r of enriched) {
      out[r.key] = r.skip ? null : computeBpAnnotationSpec(r, displayMode, showNs);
    }
    return out;
  }, [enriched, displayMode, showNs]);
  const annotKey = JSON.stringify(annotByKey);
  const onAnnotationForKeyRef = useRef(onAnnotationForKey);
  onAnnotationForKeyRef.current = onAnnotationForKey;
  useEffect(() => {
    if (typeof onAnnotationForKeyRef.current !== "function") return;
    for (const r of sets) {
      onAnnotationForKeyRef.current(r.key, annotByKey[r.key] || null);
    }
  }, [annotKey]);

  const summaryByKey = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const r of enriched) {
      out[r.key] = r.skip ? null : computeBpSummaryText(r, showSummary, errorBarLabel);
    }
    return out;
  }, [enriched, showSummary, errorBarLabel]);
  const summaryKey = JSON.stringify(summaryByKey);
  const onSummaryForKeyRef = useRef(onSummaryForKey);
  onSummaryForKeyRef.current = onSummaryForKey;
  useEffect(() => {
    if (typeof onSummaryForKeyRef.current !== "function") return;
    for (const r of sets) {
      onSummaryForKeyRef.current(r.key, summaryByKey[r.key] || null);
    }
  }, [summaryKey]);

  const setOverride = (key: string, test: string | null) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (test == null) delete next[key];
      else next[key] = test;
      return next;
    });

  const eligible = enriched.filter((r: any) => !r.skip);
  if (eligible.length === 0) return null;

  const hasR = typeof buildRScript === "function";
  const stem =
    typeof fileStem === "string" && fileStem.trim()
      ? (typeof svgSafeId === "function" ? svgSafeId(fileStem) : fileStem).replace(/^-+|-+$/g, "")
      : "stats_report";
  const rowSlug = (row: any, i: number) => {
    const raw = row.name || `set-${i + 1}`;
    const clean =
      typeof svgSafeId === "function"
        ? svgSafeId(String(raw)).replace(/^-+|-+$/g, "")
        : String(raw)
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    return clean || `set-${i + 1}`;
  };
  const downloadReport = (e: any) => {
    if (eligible.length === 1) {
      downloadText(buildBpAggregateReport(eligible, setLabel), `${stem}_stats.txt`);
    } else {
      eligible.forEach((row: any, i: number) => {
        const content = buildBpAggregateReport([row], setLabel);
        const name = `${stem}_${rowSlug(row, i)}_stats.txt`;
        setTimeout(() => downloadText(content, name), i * 120);
      });
    }
    flashSaved(e.currentTarget);
  };
  const downloadR = (e: any) => {
    if (eligible.length === 1) {
      downloadText(buildBpAggregateRScript(eligible, setLabel), `${stem}_stats.R`);
    } else {
      eligible.forEach((row: any, i: number) => {
        const content = buildBpAggregateRScript([row], setLabel);
        const name = `${stem}_${rowSlug(row, i)}_stats.R`;
        setTimeout(() => downloadText(content, name), i * 120);
      });
    }
    flashSaved(e.currentTarget);
  };

  const anyMulti = eligible.some((r: any) => r.k > 2);
  const singleSet = sets.length === 1;
  const headingLabel =
    setLabel && !singleSet ? `Statistics at each ${setLabel.toLowerCase()}` : "Statistics";

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
            {headingLabel}
          </h3>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--text-faint)" }}>
            Click a row to inspect decision trace, assumptions, post-hoc and power.
            {singleSet
              ? ""
              : " Tests are independent per " + (setLabel || "set").toLowerCase() + "."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="dv-btn dv-btn-dl"
            onClick={downloadReport}
            title={
              singleSet
                ? "Download a plain-text stats report"
                : `Download a plain-text report covering every ${(setLabel || "set").toLowerCase()}`
            }
          >
            ⬇ TXT
          </button>
          {hasR && (
            <button
              type="button"
              className="dv-btn dv-btn-dl"
              onClick={downloadR}
              title={
                singleSet
                  ? "Download a runnable R script reproducing these tests"
                  : `Download a runnable R script reproducing every ${(setLabel || "set").toLowerCase()} test`
              }
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
            <th style={thS}>{setLabel || "Set"}</th>
            <th style={thS}>Groups</th>
            <th style={thS}>Test</th>
            <th style={thS}>Statistic</th>
            <th style={thS}>p</th>
            <th style={{ ...thS, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r: any) => {
            const key = r.key;
            const isOpen = !!expanded[key];
            if (r.skip) {
              return (
                <tr key={key}>
                  <td style={tdS}>{r.name || "—"}</td>
                  <td style={tdS} colSpan={5}>
                    <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                      Needs ≥ 2 groups with n ≥ 2 to run a test.
                    </span>
                  </td>
                </tr>
              );
            }
            const p = r.testResult && !r.testResult.error ? r.testResult.p : null;
            const sig = p != null && p < 0.05;
            const stars = p != null ? pStars(p) : "";
            return (
              <React.Fragment key={key}>
                <tr
                  onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                  style={{
                    cursor: "pointer",
                    background: isOpen
                      ? "var(--surface-subtle)"
                      : hovered === key
                        ? "var(--row-hover-bg)"
                        : undefined,
                    transition: "background 120ms ease",
                  }}
                >
                  <td style={tdS}>{r.name || "—"}</td>
                  <td style={tdS}>{r.k}</td>
                  <td style={tdS}>{TEST_LABELS_BP[r.chosenTest] || r.chosenTest || "—"}</td>
                  <td style={{ ...tdS, ...mono }}>
                    {formatBpStatShort(r.chosenTest, r.testResult)}
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
                    <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                      <BoxplotStatsDetail
                        row={r}
                        isOverridden={!!overrides[key]}
                        onOverrideTest={(t: string | null) => setOverride(key, t)}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Stats state reducer ───────────────────────────────────────────────────── */

export const statsInit = {
  displayMode: "none" as "none" | "cld" | "brackets",
  showNs: false,
  showSummary: false,
  flatSummary: null as string | null,
  flatAnnotation: null as any,
  facetAnnotations: {} as Record<string, any>,
  facetSummaries: {} as Record<string, string | null>,
  subgroupSummaries: {} as Record<string, string | null>,
  subgroupAnnotSpecs: {} as Record<string, any>,
};
export function statsReducer(state: typeof statsInit, a: any): typeof statsInit {
  switch (a.type) {
    case "reset":
      return statsInit;
    case "setDisplayMode":
      if (a.value === "none") {
        return {
          ...state,
          displayMode: "none",
          flatAnnotation: null,
          facetAnnotations: {},
          subgroupAnnotSpecs: {},
        };
      }
      return { ...state, displayMode: a.value };
    case "setShowNs":
      return { ...state, showNs: a.value };
    case "setShowSummary":
      if (!a.value) {
        return {
          ...state,
          showSummary: false,
          flatSummary: null,
          facetSummaries: {},
          subgroupSummaries: {},
        };
      }
      return { ...state, showSummary: true };
    case "setFlatSummary":
      return { ...state, flatSummary: a.value };
    case "setFlatAnnotation":
      return { ...state, flatAnnotation: a.value };
    case "setFacetAnnotation":
      if (state.facetAnnotations[a.key] === a.value) return state;
      return { ...state, facetAnnotations: { ...state.facetAnnotations, [a.key]: a.value } };
    case "setFacetSummary":
      if (state.facetSummaries[a.key] === a.value) return state;
      return { ...state, facetSummaries: { ...state.facetSummaries, [a.key]: a.value } };
    case "setSubgroupAnnotSpec":
      if (state.subgroupAnnotSpecs[a.key] === a.value) return state;
      return { ...state, subgroupAnnotSpecs: { ...state.subgroupAnnotSpecs, [a.key]: a.value } };
    case "setSubgroupSummary":
      if (state.subgroupSummaries[a.key] === a.value) return state;
      return { ...state, subgroupSummaries: { ...state.subgroupSummaries, [a.key]: a.value } };
    default:
      return state;
  }
}
