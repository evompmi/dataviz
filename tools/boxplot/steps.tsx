// Step components for the boxplot tool (Upload, Configure, Filter, Output).
// Stateless presentational wrappers — all state lives in App via
// usePlotToolState or local hooks there. No sibling-module imports; shared UI
// (UploadPanel, DataPreview, ColumnRoleEditor, FilterCheckboxPanel,
// RenameReorderPanel, StatsTable, …) resolves through shared.bundle.js.

export function UploadStep({
  sepOverride,
  onSepChange,
  rawText,
  doParse,
  handleFileLoad,
  setStep,
  onLoadExample,
}) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={(v) => {
          onSepChange(v);
          if (rawText) {
            doParse(rawText, v);
            setStep("configure");
          }
        }}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        hint="CSV · TSV · TXT · DAT"
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
          {toolIcon("boxplot", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              Group Plot — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Long or wide data → auto-detect → box / violin / raincloud / bar charts
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
              Purpose
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.75, color: "var(--text-muted)", margin: 0 }}>
              An all-in-one group comparison tool that accepts{" "}
              <strong>both long and wide formats</strong>. Switch between box, violin, raincloud,
              and bar chart (mean ± SEM/SD) styles from the plot controls. Wide data is
              auto-detected and goes straight to plot. Long data gets the full pipeline: assign
              column roles, filter, rename, reorder, then plot.
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
              Long format
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              Each <strong>row</strong> = one observation. Columns mix categorical labels and
              numeric values.
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
              <tbody>
                {[
                  ["WT", "0.368", "M", "6wpi"],
                  ["WT", "0.204", "M", "6wpi"],
                  ["lyka-1", "0", "NM", "6wpi"],
                  ["lykb-1", "0.285", "M", "6wpi"],
                ].map((r, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "var(--surface-subtle)" : "var(--surface)" }}
                  >
                    {r.map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "3px 8px",
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
                color: "var(--accent-plot)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Wide format → auto-detected!
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              One <strong>column</strong> per condition. All values numeric. Headers = group names.{" "}
              <strong>Goes straight to plot.</strong>
            </p>
            <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
              <thead>
                <tr style={{ background: "var(--success-bg)" }}>
                  {["WT", "WT", "mutA", "mutB"].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "3px 8px",
                        border: "1px solid var(--success-border)",
                        color: "var(--success-text)",
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
                  [0.45, 0.52, 0.12, 0.31],
                  [0.48, 0.51, 0.08, 0.28],
                  [0.41, 0.49, 0.15, 0.35],
                ].map((r, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "var(--success-bg)" : "var(--surface)" }}
                  >
                    {r.map((v, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "3px 8px",
                          border: "1px solid var(--success-border)",
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
              Workflow
            </div>
            {[
              { icon: "📂", text: "Upload: drop or select your CSV / TSV / TXT / DAT file." },
              {
                icon: "⚙️",
                text: "Configure: assign roles — group (X axis), value (Y axis), filter, text, or ignore.",
              },
              {
                icon: "🔍",
                text: "Filter & Rename: tick values to keep, rename labels, drag to reorder groups.",
              },
              {
                icon: "📊",
                text: "Output: summary stats (n, mean, median, SD, SEM), long & wide CSV exports.",
              },
              { icon: "🎨", text: "Plot: color-by, facet-by, jitter controls, and SVG download." },
            ].map(({ icon, text }) => (
              <div
                key={icon}
                style={{ display: "flex", gap: 10, marginBottom: 7, alignItems: "flex-start" }}
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
                color: "var(--accent-warning)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              🥧 Composition Pies
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              When <strong>Color by</strong> is active, a <strong>Composition pies</strong> checkbox
              appears. Enable it to display a small pie chart beneath each boxplot group showing the
              proportion of each color-by category within that group.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { step: "1.", text: "Enable Points (the jitter overlay) in the plot controls." },
                { step: "2.", text: "Select a column in the Color by dropdown." },
                { step: "3.", text: "Tick the Composition pies checkbox that appears next to it." },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent-warning)",
                      flexShrink: 0,
                    }}
                  >
                    {step}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
                color: "#7c3aed",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              🎻 Plot Styles
            </div>
            <p
              style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.6 }}
            >
              Use the <strong>Plot style</strong> dropdown in the style controls to switch between
              three visualization modes:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                {
                  step: "Box",
                  text: "Classic box-and-whisker plot. Median line, IQR box, 1.5×IQR whiskers, outlier dots.",
                },
                {
                  step: "Violin",
                  text: "Symmetric kernel density (KDE) shape showing the full distribution, with a narrow box overlay for quartiles.",
                },
                {
                  step: "Raincloud",
                  text: "Half-violin on the left + narrow box in the center + jitter points on the right. Best for showing raw data alongside the distribution shape.",
                },
                {
                  step: "Bar",
                  text: "Mean ± SEM/SD error bars. Choose SEM or SD in the plot controls. Supports jittered points overlay.",
                },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#7c3aed",
                      flexShrink: 0,
                      width: 62,
                      display: "inline-block",
                    }}
                  >
                    {step}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
            <p
              style={{
                fontSize: 10,
                color: "var(--text-faint)",
                marginTop: 8,
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              All styles support color-by, facet-by, and outlier dots. The Y-axis auto-adjusts to
              fit the violin/raincloud density curves.
            </p>
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
              💡 Tip —{" "}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Wide-format files (all-numeric columns, headers = group names) are auto-detected and
              go straight to plot. For long-format, you can facet by one column while coloring
              points by another.
            </span>
          </div>
          <div style={{ gridColumn: "1/-1", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              "Separator explicitly selected (comma, semicolon, tab, space)",
              "Quoted values stripped automatically",
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
        </div>
      </div>
    </div>
  );
}

export function ConfigureStep({
  fileName,
  parsedHeaders,
  parsedRows,
  hasHeader,
  colRoles,
  colNames,
  valueColIdx,
  valueColIsNumeric,
  onRoleChange,
  onNameChange,
  setStep,
}) {
  return (
    <div>
      <div className="dv-panel">
        <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{fileName}</strong> — {parsedHeaders.length} cols
          × {parsedRows.length} rows{hasHeader ? "" : " (no header)"}
        </p>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
          Preview (first 8 rows):
        </p>
        <DataPreview headers={parsedHeaders} rows={parsedRows} maxRows={8} />
      </div>
      <ColumnRoleEditor
        headers={parsedHeaders}
        rows={parsedRows}
        colRoles={colRoles}
        colNames={colNames}
        onRoleChange={onRoleChange}
        onNameChange={onNameChange}
      />
      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div
          className="dv-panel"
          style={{
            background: "var(--danger-bg)",
            borderColor: "var(--danger-border)",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12, color: "var(--danger-text)" }}>
            ⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as{" "}
            <strong>value</strong> but appears to be non-numeric — the plot will be empty. Please
            assign a numeric column as value.
          </p>
        </div>
      )}
      {(colRoles.indexOf("group") < 0 || colRoles.indexOf("value") < 0) && (
        <div
          className="dv-panel"
          style={{
            background: "var(--warning-bg)",
            borderColor: "var(--warning-border)",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            Assign at least one <strong style={{ color: roleColors.group }}>group</strong> and one{" "}
            <strong style={{ color: roleColors.value }}>value</strong> column to continue.
          </p>
        </div>
      )}
      <button
        onClick={() => setStep("filter")}
        className="dv-btn dv-btn-primary"
        disabled={colRoles.indexOf("group") < 0 || colRoles.indexOf("value") < 0}
      >
        Filter & Rename →
      </button>
    </div>
  );
}

export function FilterStep({
  parsedHeaders,
  parsedRows,
  colRoles,
  colNames,
  filters,
  filteredRows,
  renamedRows,
  activeColIdxs,
  valueRenames,
  orderableCols,
  applyRename,
  toggleFilter,
  toggleAllFilter,
  setRenameVal,
  dragState,
  setDragState,
  canPlot,
  setStep,
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        <FilterCheckboxPanel
          headers={parsedHeaders}
          colNames={colNames}
          colRoles={colRoles}
          filters={filters}
          filteredCount={filteredRows.length}
          totalCount={parsedRows.length}
          onToggle={toggleFilter}
          onToggleAll={toggleAllFilter}
        />
        <RenameReorderPanel
          headers={parsedHeaders}
          colNames={colNames}
          colRoles={colRoles}
          filters={filters}
          valueRenames={valueRenames}
          orderableCols={orderableCols}
          applyRename={applyRename}
          onRenameVal={setRenameVal}
          dragState={dragState}
          onDragStart={setDragState}
          onDragEnd={() => setDragState(null)}
        />
      </div>
      <div
        style={{
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          border: "1px solid var(--success-border)",
          background: "var(--success-bg)",
        }}
      >
        <p
          style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--success-text)" }}
        >
          Preview ({renamedRows.length} rows):
        </p>
        <DataPreview
          headers={activeColIdxs.map((i) => colNames[i])}
          rows={renamedRows.map((r) => activeColIdxs.map((i) => r[i]))}
          maxRows={10}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setStep("output")} className="dv-btn dv-btn-primary">
          Output →
        </button>
        {canPlot && (
          <button onClick={() => setStep("plot")} className="dv-btn dv-btn-secondary">
            Plot →
          </button>
        )}
      </div>
    </div>
  );
}

export function OutputStep({
  colNames,
  groupColIdx,
  valueColIdx,
  valueColIsNumeric,
  stats,
  renamedRows,
  activeColIdxs,
  wideData,
  fileName,
  canPlot,
  setStep,
}) {
  return (
    <div>
      {groupColIdx >= 0 && valueColIdx >= 0 && stats.length > 0 && (
        <StatsTable stats={stats} groupLabel={colNames[groupColIdx]} />
      )}
      <div className="dv-panel">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
            Filtered data (long)
          </p>
          <button
            className="dv-btn dv-btn-dl"
            onClick={(e) => {
              downloadCsv(
                activeColIdxs.map((i) => colNames[i]),
                renamedRows.map((r) => activeColIdxs.map((i) => r[i])),
                `${fileBaseName(fileName, "data")}_sanitized_long.csv`
              );
              flashSaved(e.currentTarget);
            }}
          >
            ⬇ Long CSV
          </button>
        </div>
        <DataPreview
          headers={activeColIdxs.map((i) => colNames[i])}
          rows={renamedRows.map((r) => activeColIdxs.map((i) => r[i]))}
          maxRows={6}
        />
      </div>
      {wideData && (
        <div className="dv-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>
              Reshaped (wide)
            </p>
            <button
              className="dv-btn dv-btn-dl"
              onClick={(e) => {
                downloadCsv(
                  wideData.headers,
                  wideData.rows,
                  `${fileBaseName(fileName, "data")}_sanitized_wide.csv`
                );
                flashSaved(e.currentTarget);
              }}
            >
              ⬇ Wide CSV
            </button>
          </div>
          <DataPreview headers={wideData.headers} rows={wideData.rows} maxRows={8} />
        </div>
      )}
      {(groupColIdx < 0 || valueColIdx < 0) && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            ⚠ Assign <strong>group</strong> + <strong>value</strong> columns to enable reshaping &
            stats.
          </p>
        </div>
      )}
      {valueColIdx >= 0 && !valueColIsNumeric && (
        <div
          className="dv-panel"
          style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--danger-text)" }}>
            ⚠ Column <strong>"{colNames[valueColIdx]}"</strong> is assigned as{" "}
            <strong>value</strong> but appears to be non-numeric — the plot will be empty. Go back
            to Configure and assign a numeric column as value.
          </p>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => setStep("filter")} className="dv-btn dv-btn-secondary">
          ← Filter
        </button>
        {canPlot && (
          <button onClick={() => setStep("plot")} className="dv-btn dv-btn-primary">
            Plot →
          </button>
        )}
      </div>
    </div>
  );
}
