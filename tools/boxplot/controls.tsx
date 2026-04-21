// Sidebar plot controls: the collapsible ControlSection primitive and the
// full PlotControls panel (plot-style toggle, shape/fill sliders, color
// picker, facet/subgroup selector, axes & labels). Shared UI (ActionsPanel,
// SliderControl, ColorInput, BaseStyleControls, GroupColorEditor, PALETTE,
// scrollDisclosureIntoView) resolves through shared.bundle.js.

import { PlotSidebar } from "../_shell/PlotSidebar";

export function ControlSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => scrollDisclosureIntoView(rootRef.current));
  }, [open]);
  return (
    <div ref={rootRef} className="dv-panel" style={{ marginBottom: 6, padding: 0 }}>
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
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-muted)",
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

export function PlotControls({
  dataFormat,
  setDataFormat,
  setStep,
  resetAll,
  allDisplayGroups,
  boxplotGroups,
  renamedRows,
  setPlotGroupRenames,
  setBoxplotColors,
  onToggleGroup,
  vis,
  updVis,
  colorByCol,
  setColorByCol,
  colorByCandidates,
  colNames,
  categoryColors,
  setCategoryColors,
  colorByCategories,
  facetByCol,
  setFacetByCol,
  subgroupByCol,
  setSubgroupByCol,
  onDownloadSvg,
  onDownloadPng,
}) {
  const sv = (k) => (v) => updVis({ [k]: v });
  const handleColorChange = (i, c) => {
    const name = boxplotGroups[i].name;
    setBoxplotColors((p) => ({ ...p, [name]: c }));
  };
  const handleNameChange = (i, v) => {
    const name = boxplotGroups[i].name;
    setPlotGroupRenames((p) => ({ ...p, [name]: v }));
  };
  const handleColorByChange = (e) => {
    const v = Number(e.target.value);
    setColorByCol(v);
    if (v >= 0) {
      const cats = [...new Set<string>(renamedRows.map((r) => r[v]))].sort();
      const cc: Record<string, string> = {};
      cats.forEach((c, ci) => {
        cc[c] = PALETTE[(ci + 2) % PALETTE.length];
      });
      setCategoryColors(cc);
    }
  };
  return (
    <PlotSidebar>
      {/* Wide format banner */}
      {dataFormat === "wide" && (
        <div
          className="dv-panel"
          style={{
            background: "var(--success-bg)",
            borderColor: "var(--success-border)",
            padding: "10px 12px",
            marginBottom: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <p style={{ margin: 0, fontSize: 11, color: "var(--success-text)", fontWeight: 600 }}>
              Wide format auto-detected
            </p>
          </div>
          <button
            onClick={() => {
              setDataFormat("long");
              setStep("configure");
            }}
            style={{
              fontSize: 10,
              cursor: "pointer",
              background: "var(--surface)",
              border: "1px solid var(--success-border)",
              color: "var(--success-text)",
              fontFamily: "inherit",
              fontWeight: 600,
              borderRadius: 4,
              padding: "3px 8px",
              width: "100%",
            }}
          >
            Switch to long pipeline
          </button>
        </div>
      )}

      {/* Actions tile */}
      <ActionsPanel
        onDownloadSvg={onDownloadSvg}
        onDownloadPng={onDownloadPng}
        onReset={resetAll}
      />

      {/* Conditions / group color editor */}
      <ControlSection
        title={`Conditions (${allDisplayGroups.filter((g) => g.enabled).length}/${allDisplayGroups.length})`}
        defaultOpen
      >
        <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--text-faint)" }}>
          {allDisplayGroups.filter((g) => g.enabled).length} of {allDisplayGroups.length} selected ·{" "}
          {renamedRows.length} obs
        </p>
        <GroupColorEditor
          groups={allDisplayGroups}
          onColorChange={handleColorChange}
          onNameChange={handleNameChange}
          onToggle={onToggleGroup}
        />
      </ControlSection>

      {/* Plot style — always visible */}
      <div
        className="dv-panel"
        style={{ padding: 12, marginBottom: 0, display: "flex", flexDirection: "column", gap: 9 }}
      >
        <div>
          <div className="dv-label">Plot style</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
            {(
              [
                {
                  key: "box",
                  label: "Box",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <line x1="11" y1="2" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" />
                      <rect
                        x="5"
                        y="6"
                        width="12"
                        height="10"
                        rx="1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <line
                        x1="5"
                        y1="11"
                        x2="17"
                        y2="11"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <line
                        x1="11"
                        y1="16"
                        x2="11"
                        y2="20"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  ),
                },
                {
                  key: "violin",
                  label: "Violin",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <path
                        d="M11 2 C7 6, 5 9, 5 11 C5 13, 7 16, 11 20 C15 16, 17 13, 17 11 C17 9, 15 6, 11 2Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <line
                        x1="7"
                        y1="11"
                        x2="15"
                        y2="11"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  ),
                },
                {
                  key: "raincloud",
                  label: "Rain",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <path
                        d="M11 2 C8 5, 6 8, 6 11 C6 14, 8 17, 11 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                      <circle cx="14" cy="7" r="1" fill="currentColor" />
                      <circle cx="16" cy="10" r="1" fill="currentColor" />
                      <circle cx="13" cy="13" r="1" fill="currentColor" />
                      <circle cx="15" cy="16" r="1" fill="currentColor" />
                      <circle cx="14" cy="19" r="1" fill="currentColor" />
                    </svg>
                  ),
                },
                {
                  key: "bar",
                  label: "Bar",
                  icon: (
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <rect
                        x="2"
                        y="10"
                        width="5"
                        height="10"
                        rx="0.5"
                        fill="currentColor"
                        opacity="0.7"
                      />
                      <rect
                        x="8.5"
                        y="4"
                        width="5"
                        height="16"
                        rx="0.5"
                        fill="currentColor"
                        opacity="0.7"
                      />
                      <rect
                        x="15"
                        y="7"
                        width="5"
                        height="13"
                        rx="0.5"
                        fill="currentColor"
                        opacity="0.7"
                      />
                      <line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="1.2" />
                      <line
                        x1="8.5"
                        y1="3"
                        x2="11.5"
                        y2="3"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  ),
                },
              ] as const
            ).map(({ key, label, icon }) => {
              const active = vis.plotStyle === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => updVis({ plotStyle: key })}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    padding: "6px 0 4px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: active
                      ? "1.5px solid var(--accent-primary)"
                      : "1px solid var(--border-strong)",
                    background: active ? "var(--accent-primary)" : "var(--surface)",
                    color: active ? "var(--on-accent)" : "var(--text-muted)",
                    fontFamily: "inherit",
                    fontSize: 9,
                    fontWeight: active ? 700 : 400,
                    transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
                  }}
                >
                  {icon}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="dv-label">Orientation</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["vertical", "horizontal"] as const).map((mode) => {
              const active = mode === "horizontal" ? vis.horizontal : !vis.horizontal;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ horizontal: mode === "horizontal" })}
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
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {mode === "vertical" ? "Vertical" : "Horizontal"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Shape & fill */}
      <ControlSection title="Shape & fill" defaultOpen>
        <BaseStyleControls
          plotBg={vis.plotBg}
          onPlotBgChange={sv("plotBg")}
          showGrid={vis.showGrid}
          onShowGridChange={sv("showGrid")}
          gridColor={vis.gridColor}
          onGridColorChange={sv("gridColor")}
        />
        <SliderControl
          label={
            vis.plotStyle === "box" ? "Box width" : vis.plotStyle === "bar" ? "Bar width" : "Width"
          }
          value={vis.boxWidth}
          displayValue={vis.boxWidth + "%"}
          min={20}
          max={100}
          step={5}
          onChange={sv("boxWidth")}
        />
        <SliderControl
          label={vis.plotStyle === "box" ? "Box gap" : vis.plotStyle === "bar" ? "Bar gap" : "Gap"}
          value={vis.boxGap}
          displayValue={vis.boxGap + "%"}
          min={0}
          max={80}
          step={5}
          onChange={sv("boxGap")}
        />
        {vis.plotStyle === "bar" ? (
          <>
            <SliderControl
              label="Fill opacity"
              value={vis.barOpacity}
              displayValue={vis.barOpacity.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={sv("barOpacity")}
            />
            <div>
              <div className="dv-label">Error bars</div>
              <div
                style={{
                  display: "flex",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border-strong)",
                }}
              >
                {(["none", "sem", "sd", "ci95"] as const).map((mode) => {
                  const active = vis.errorType === mode;
                  const label =
                    mode === "none" ? "None" : mode === "ci95" ? "95% CI" : mode.toUpperCase();
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updVis({ errorType: mode })}
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
                        transition: "background 120ms ease, color 120ms ease",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {vis.errorType !== "none" && (
              <SliderControl
                label="Error bar stroke"
                value={vis.errStrokeWidth}
                displayValue={vis.errStrokeWidth.toFixed(1)}
                min={0.5}
                max={4}
                step={0.1}
                onChange={sv("errStrokeWidth")}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="dv-label">Bar outline</span>
              <input
                type="checkbox"
                checked={vis.showBarOutline}
                onChange={(e) => updVis({ showBarOutline: e.target.checked })}
                style={{ accentColor: "var(--cta-primary-bg)" }}
              />
            </div>
            {vis.showBarOutline && (
              <>
                <SliderControl
                  label="Outline width"
                  value={vis.barOutlineWidth}
                  displayValue={vis.barOutlineWidth.toFixed(1)}
                  min={0.5}
                  max={4}
                  step={0.1}
                  onChange={sv("barOutlineWidth")}
                />
                <div>
                  <div className="dv-label">Outline color</div>
                  <ColorInput
                    value={vis.barOutlineColor}
                    onChange={sv("barOutlineColor")}
                    size={24}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <SliderControl
            label="Fill opacity"
            value={vis.boxFillOpacity}
            displayValue={vis.boxFillOpacity.toFixed(2)}
            min={0}
            max={1}
            step={0.05}
            onChange={sv("boxFillOpacity")}
          />
        )}
      </ControlSection>

      {/* Data points */}
      <ControlSection title="Data points" defaultOpen>
        <div>
          <div className="dv-label">Show points</div>
          <div
            style={{
              display: "flex",
              borderRadius: 6,
              overflow: "hidden",
              border: "1px solid var(--border-strong)",
            }}
          >
            {(["off", "on"] as const).map((mode) => {
              const active = mode === "on" ? vis.showPoints : !vis.showPoints;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updVis({ showPoints: mode === "on" })}
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
                    transition: "background 120ms ease, color 120ms ease",
                  }}
                >
                  {mode === "off" ? "Off" : "On"}
                </button>
              );
            })}
          </div>
        </div>
        {vis.showPoints && (
          <>
            <div>
              <div className="dv-label">Color by</div>
              <select
                value={colorByCol}
                onChange={handleColorByChange}
                className="dv-input"
                style={{ cursor: "pointer", fontSize: 11, width: "100%" }}
              >
                <option value={-1}>— none —</option>
                {colorByCandidates.map((ci) => (
                  <option key={ci} value={ci}>
                    {colNames[ci]}
                  </option>
                ))}
              </select>
            </div>
            {colorByCol >= 0 && (
              <div>
                <div className="dv-label">Composition pies</div>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  {(["off", "on"] as const).map((mode) => {
                    const active = mode === "on" ? vis.showCompPie : !vis.showCompPie;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updVis({ showCompPie: mode === "on" })}
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
                          transition: "background 120ms ease, color 120ms ease",
                        }}
                      >
                        {mode === "off" ? "Off" : "On"}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {colorByCol >= 0 &&
              colorByCategories.map((cat) => (
                <div
                  key={cat}
                  style={{ display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 }}
                >
                  <ColorInput
                    value={categoryColors[cat] || "#999999"}
                    onChange={(c) => setCategoryColors((p) => ({ ...p, [cat]: c }))}
                    size={16}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{cat}</span>
                </div>
              ))}
            <SliderControl
              label="Size"
              value={vis.pointSize}
              displayValue={vis.pointSize}
              min={1}
              max={6}
              step={0.5}
              onChange={sv("pointSize")}
            />
            <SliderControl
              label="Jitter"
              value={vis.jitterWidth}
              displayValue={vis.jitterWidth.toFixed(2)}
              min={0}
              max={1}
              step={0.05}
              onChange={sv("jitterWidth")}
            />
            <SliderControl
              label="Opacity"
              value={vis.pointOpacity}
              displayValue={vis.pointOpacity.toFixed(2)}
              min={0.1}
              max={1}
              step={0.05}
              onChange={sv("pointOpacity")}
            />
          </>
        )}
      </ControlSection>

      {/* Split by */}
      <ControlSection title="Split by" defaultOpen>
        <div
          style={{
            display: "flex",
            borderRadius: 6,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            marginBottom: facetByCol >= 0 || subgroupByCol >= 0 ? 6 : 0,
          }}
        >
          {(["none", "facet", "subgroup"] as const).map((mode) => {
            const active =
              mode === "facet"
                ? facetByCol >= 0
                : mode === "subgroup"
                  ? subgroupByCol >= 0
                  : facetByCol < 0 && subgroupByCol < 0;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === "none") {
                    setFacetByCol(-1);
                    setSubgroupByCol(-1);
                  } else if (mode === "facet") {
                    setSubgroupByCol(-1);
                    if (facetByCol < 0 && colorByCandidates.length > 0)
                      setFacetByCol(colorByCandidates[0]);
                  } else {
                    setFacetByCol(-1);
                    if (subgroupByCol < 0 && colorByCandidates.length > 0)
                      setSubgroupByCol(colorByCandidates[0]);
                  }
                }}
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
                  transition: "background 120ms ease, color 120ms ease",
                }}
              >
                {mode === "none" ? "None" : mode === "facet" ? "Facet" : "Subgroup"}
              </button>
            );
          })}
        </div>
        {(facetByCol >= 0 || subgroupByCol >= 0) && (
          <select
            value={facetByCol >= 0 ? facetByCol : subgroupByCol}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (facetByCol >= 0) setFacetByCol(v);
              else setSubgroupByCol(v);
            }}
            className="dv-input"
            style={{ cursor: "pointer", fontSize: 11, width: "100%" }}
          >
            {colorByCandidates.map((ci) => (
              <option key={ci} value={ci}>
                {colNames[ci]}
              </option>
            ))}
          </select>
        )}
      </ControlSection>

      {/* Axes & labels */}
      <ControlSection title="Axes & labels">
        <div>
          <div className="dv-label">Title</div>
          <input
            value={vis.plotTitle}
            onChange={(e) => updVis({ plotTitle: e.target.value })}
            className="dv-input"
            style={{ width: "100%", fontSize: 11 }}
          />
        </div>
        <div>
          <div className="dv-label">Y label</div>
          <input
            value={vis.yLabel}
            onChange={(e) => updVis({ yLabel: e.target.value })}
            className="dv-input"
            style={{ width: "100%", fontSize: 11 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="dv-label">Y min</div>
            <input
              value={vis.yMinCustom}
              onChange={(e) => updVis({ yMinCustom: e.target.value })}
              className="dv-input"
              style={{ width: "100%", fontSize: 11 }}
              placeholder="auto"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div className="dv-label">Y max</div>
            <input
              value={vis.yMaxCustom}
              onChange={(e) => updVis({ yMaxCustom: e.target.value })}
              className="dv-input"
              style={{ width: "100%", fontSize: 11 }}
              placeholder="auto"
            />
          </div>
        </div>
        <div>
          <div className="dv-label">Y scale</div>
          <select
            value={vis.yScale}
            onChange={(e) => updVis({ yScale: e.target.value })}
            className="dv-select"
            style={{ width: "100%", fontSize: 11 }}
          >
            <option value="linear">Linear</option>
            <option value="log10">{" Log\u2081\u2080"}</option>
            <option value="log2">{" Log\u2082"}</option>
            <option value="ln">{" Ln (natural)"}</option>
          </select>
        </div>
        <SliderControl
          label="Group label angle"
          value={vis.xLabelAngle}
          displayValue={vis.xLabelAngle + "°"}
          min={-90}
          max={0}
          step={5}
          onChange={sv("xLabelAngle")}
        />
      </ControlSection>
    </PlotSidebar>
  );
}
