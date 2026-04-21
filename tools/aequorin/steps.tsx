// Step components for the aequorin tool (HowToSection, UploadStep,
// ConfigureStep). Stateless presentational wrappers — all state lives in
// App via usePlotToolState or local hooks there. No sibling-module
// imports; shared UI (UploadPanel, DataPreview, NumberInput, …) and
// globals (toolIcon, flashSaved, TIME_UNITS) resolve through
// shared.bundle.js and ./helpers respectively.

import { TIME_UNITS } from "./helpers";

export function HowToSection() {
  return (
    <HowToCard
      toolName="aequorin"
      title="Aequorin Ca²⁺ Calibration — How to use"
      subtitle="RLU → [Ca²⁺] • Raw or calibrated • Time-course plotting • Σ barplots"
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
          Purpose
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 }}>
          Plots aequorin luminescence time-courses — either as raw RLU values or converted to [Ca²⁺]
          using calibration formulas (Allen &amp; Blinks 1978, Hill, Generalised). Computes mean ±
          SD across replicates and generates Σ barplots (raw and baseline-corrected) for the
          selected time window.
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
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Data layout — wide format
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}>
          Each <strong>column</strong> = one sample/replicate. Each <strong>row</strong> = one
          time-point. First row = header names.
        </p>
        <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
          <thead>
            <tr style={{ background: "var(--info-bg)" }}>
              {["WT", "WT", "WT", "KO", "KO", "KO"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid var(--info-border)",
                    color: "var(--accent-primary)",
                    fontWeight: 700,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              [1200, 1180, 1250, 800, 790, 810],
              [1350, 1400, 1310, 850, 870, 840],
              [980, 1010, 990, 620, 600, 640],
            ].map((r, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? "var(--surface-subtle)" : "var(--surface)" }}
              >
                {r.map((v, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid var(--info-border)",
                      color: "var(--text)",
                    }}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
          Configure step
        </div>
        {[
          {
            icon: "🔬",
            text: "Column grouping: identical header names are pooled as replicates by default. Switch to Individual to treat each column separately. Uncheck any column to exclude it from the analysis and exports.",
          },
          {
            icon: "⏱️",
            text: "Time axis: set the time step per row and its base unit (ms, s, min, h…). The display unit can be changed independently on the plot page.",
          },
          {
            icon: "⚙️",
            text: "Calibration: defaults to None (raw RLU). Switch to Allen & Blinks (1978), Hill equilibrium, or Generalised Allen & Blinks — constants are adjustable.",
          },
        ].map(({ icon, text }) => (
          <div
            key={icon}
            style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
              {text}
            </span>
          </div>
        ))}
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
          Plot step
        </div>
        {[
          {
            icon: "📊",
            text: "Combined or faceted view. X/Y range, smoothing, title, and style controls in the left panel.",
          },
          {
            icon: "📈",
            text: "Σ barplots shown below the main chart: raw sums and baseline-corrected sums (Σv − n×min) per condition, with SD/SEM error bars computed across replicates.",
          },
          {
            icon: "⬇️",
            text: "Each barplot tile has a matching CSV table below it — download per-replicate sums directly from the plot page.",
          },
        ].map(({ icon, text }) => (
          <div
            key={icon}
            style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
              {text}
            </span>
          </div>
        ))}
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
          Sample selection (plot page)
        </div>
        {[
          {
            icon: "🔬",
            text: 'Click the sticky "Sample selection" button above the chart to open the column overlay.',
          },
          {
            icon: "✅",
            text: "Toggle individual replicates on or off — excluded columns are removed from the plot, barplots, and all exports.",
          },
          {
            icon: "🔀",
            text: "Switch between Pool (group by header name, mean ± SD) and Individual (each column plotted separately as name_rep1, name_rep2…).",
          },
          {
            icon: "⚡",
            text: "All changes apply instantly — no need to go back to the configure step.",
          },
        ].map(({ icon, text }) => (
          <div
            key={icon}
            style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
              {text}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          borderLeft: "4px solid var(--accent-primary)",
          background: "var(--info-bg)",
          padding: "10px 14px",
          borderRadius: "0 8px 8px 0",
          gridColumn: "1/-1",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)" }}>
          💡 Replicate grouping —{" "}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          In Pool mode, columns sharing the same header name are grouped: mean ± SD is computed
          across them at each time-point. In Individual mode, each column is its own condition
          (labelled name_rep1, name_rep2…) and plotted separately.
        </span>
      </div>
      <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[
          "Separator explicitly selected (comma, semicolon, tab, space)",
          "Quoted values stripped automatically",
          "Excluded columns omitted from all exports",
          "100% browser-side — nothing uploaded",
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
  );
}

export function UploadStep({
  sepOverride,
  setSepOverride,
  rawText,
  doParse,
  handleFileLoad,
  onLoadExample,
}) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          setSepOverride(v);
          if (rawText) doParse(rawText, v);
        }}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        hint="CSV · TSV · TXT · DAT — one column per sample, one row per time-point · 2 MB max"
      />
      <HowToSection />
    </div>
  );
}

export function ConfigureStep({
  parsed,
  formula,
  setFormula,
  Kr,
  setKr,
  Ktr,
  setKtr,
  Kd,
  setKd,
  hillN,
  setHillN,
  vis,
  updVis,
  fileName,
  calData,
  columnEnabled,
  downloadCalibrated,
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <div className="dv-panel" style={{ flex: "1 1 0", marginBottom: 0 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
          >
            Calibration formula
          </p>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div className="dv-label">Formula</div>
              <select
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                className="dv-select"
              >
                <option value="none">None (raw data)</option>
                <option value="allen-blinks">Allen &amp; Blinks (1978)</option>
                <option value="hill">Hill equilibrium</option>
                <option value="generalized">Generalised Allen &amp; Blinks</option>
              </select>
            </div>
            {(formula === "allen-blinks" || formula === "generalized") && (
              <div>
                <div className="dv-label">Kr</div>
                <NumberInput
                  value={Kr}
                  onChange={(e) => setKr(Number(e.target.value))}
                  step="0.1"
                />
              </div>
            )}
            {(formula === "allen-blinks" || formula === "generalized") && (
              <div>
                <div className="dv-label">Ktr</div>
                <NumberInput
                  value={Ktr}
                  onChange={(e) => setKtr(Number(e.target.value))}
                  step="1"
                />
              </div>
            )}
            {formula === "hill" && (
              <div>
                <div className="dv-label">Kd (µM)</div>
                <NumberInput
                  value={Kd}
                  onChange={(e) => setKd(Number(e.target.value))}
                  step="0.5"
                  min="0.1"
                />
              </div>
            )}
            {formula === "generalized" && (
              <div>
                <div className="dv-label">n (Hill exp.)</div>
                <NumberInput
                  value={hillN}
                  onChange={(e) => setHillN(Number(e.target.value))}
                  step="0.5"
                  min="1"
                />
              </div>
            )}
          </div>
        </div>
        <div className="dv-panel" style={{ flex: "1 1 0", marginBottom: 0 }}>
          <p
            style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}
          >
            Time axis
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div>
              <div className="dv-label">Time step (per row)</div>
              <NumberInput
                value={vis.timeStep}
                onChange={(e) => updVis({ timeStep: Number(e.target.value) || 1 })}
                style={{ width: 132 }}
                min="0.001"
                step="any"
              />
            </div>
            <div>
              <div className="dv-label">Base unit</div>
              <select
                value={vis.baseUnit}
                onChange={(e) => updVis({ baseUnit: e.target.value })}
                className="dv-select"
              >
                {TIME_UNITS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            {parsed && (
              <div style={{ fontSize: 12, color: "var(--text-faint)", paddingBottom: 4 }}>
                Range: 0 – {(parsed.data.length * vis.timeStep).toFixed(3)} {vis.baseUnit}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="dv-panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
            Loaded <strong style={{ color: "var(--text)" }}>{fileName}</strong> —{" "}
            {parsed.headers.length} samples × {parsed.data.length} time-points
          </p>
          <button
            onClick={(e) => {
              downloadCalibrated();
              flashSaved(e.currentTarget);
            }}
            className="dv-btn dv-btn-dl"
          >
            ⬇ CSV
          </button>
        </div>
        {calData &&
          parsed &&
          (() => {
            const ei = parsed.headers.map((_, i) => i).filter((i) => columnEnabled[i] !== false);
            return (
              <div style={{ marginTop: 8 }}>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                  }}
                >
                  Preview — {formula === "none" ? "raw data" : "calibrated data"} · {ei.length} of{" "}
                  {parsed.headers.length} columns (first 15 rows):
                </p>
                <DataPreview
                  headers={ei.map((i) => parsed.headers[i])}
                  rows={calData.slice(0, 15).map((r) => ei.map((i) => (r[i] != null ? r[i] : "")))}
                  maxRows={15}
                />
              </div>
            );
          })()}
      </div>
    </div>
  );
}
