// PlotArea wrappers for the boxplot chart: the non-facet card, the memoised
// per-facet trio, and the faceted-list layout. Depend only on the chart
// component and a couple of React hooks — no tool-specific state lives here.

import { BoxplotChart } from "./chart";

const { memo, useMemo, useRef, useEffect } = React;

const FacetBoxplotItem = memo(function FacetBoxplotItem({
  fd,
  facetRefs,
  chartProps,
  categoryColors,
  fillHeight,
}: any) {
  const localRef = useRef();
  useEffect(() => {
    facetRefs.current[fd.category] = localRef.current;
    return () => {
      delete facetRefs.current[fd.category];
    };
  }, [fd.category, facetRefs]);
  return (
    <div
      className="dv-plot-card"
      style={{
        background: "var(--plot-card-bg)",
        borderRadius: 8,
        padding: 12,
        border: "1px solid var(--plot-card-border)",
        flex: fillHeight ? "1 1 auto" : "0 1 auto",
        minWidth: 180,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: categoryColors[fd.category] || "#999",
          }}
        />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          {fd.category}
        </p>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          ({fd.groups.reduce((a, g) => a + g.allValues.length, 0)} pts)
        </span>
      </div>
      <BoxplotChart ref={localRef} {...chartProps} />
    </div>
  );
});

export function PlotArea({
  colorByCol,
  colorByCategories,
  colNames,
  categoryColors,
  facetByCol,
  facetedData,
  chartRef,
  displayBoxplotGroups,
  vis,
  yMinVal,
  yMaxVal,
  chartAnnotations,
  chartSummary,
  subgroups,
  subgroupSummaries,
}) {
  if (displayBoxplotGroups.length === 0 && (facetByCol < 0 || facetedData.length === 0)) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="dv-panel dv-plot-card"
          style={{
            padding: 20,
            background: "var(--plot-card-bg)",
            borderColor: "var(--plot-card-border)",
          }}
        >
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "var(--text-faint)",
              fontSize: 14,
            }}
          >
            No conditions selected. Enable at least one to display the plot.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {colorByCol >= 0 && colorByCategories.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            background: "var(--surface-subtle)",
            borderRadius: 8,
            padding: "8px 14px",
            border: "1px solid var(--border)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Points colored by: {colNames[colorByCol]}
          </span>
          {colorByCategories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: categoryColors[cat] || "#999",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cat}</span>
            </div>
          ))}
        </div>
      )}
      {facetByCol < 0 && (
        <div
          className="dv-plot-card"
          style={{
            background: "var(--plot-card-bg)",
            borderRadius: 10,
            padding: 20,
            border: "1px solid var(--plot-card-border)",
          }}
        >
          <BoxplotChart
            ref={chartRef}
            groups={displayBoxplotGroups}
            yLabel={vis.yLabel}
            plotTitle={vis.plotTitle}
            plotBg={vis.plotBg}
            showGrid={vis.showGrid}
            gridColor={vis.gridColor}
            boxWidth={vis.boxWidth}
            boxFillOpacity={vis.boxFillOpacity}
            pointSize={vis.pointSize}
            showPoints={vis.showPoints}
            jitterWidth={vis.jitterWidth}
            pointOpacity={vis.pointOpacity}
            xLabelAngle={vis.xLabelAngle}
            yMin={yMinVal}
            yMax={yMaxVal}
            yScale={vis.yScale}
            categoryColors={categoryColors}
            colorByCol={colorByCol}
            boxGap={vis.boxGap}
            showCompPie={vis.showCompPie}
            plotStyle={vis.plotStyle}
            barOpacity={vis.barOpacity}
            errorType={vis.errorType}
            errStrokeWidth={vis.errStrokeWidth}
            showBarOutline={vis.showBarOutline}
            barOutlineWidth={vis.barOutlineWidth}
            barOutlineColor={vis.barOutlineColor}
            horizontal={vis.horizontal}
            subgroups={subgroups}
            subgroupSummaries={subgroupSummaries}
            annotations={chartAnnotations}
            statsSummary={chartSummary}
            svgLegend={
              colorByCol >= 0 && colorByCategories.length > 0
                ? [
                    {
                      id: "legend-color",
                      title: `Points colored by: ${colNames[colorByCol]}`,
                      items: colorByCategories.map((c) => ({
                        label: c,
                        color: categoryColors[c] || "#999",
                        shape: "dot",
                      })),
                    },
                  ]
                : null
            }
          />
        </div>
      )}
    </div>
  );
}

// Per-facet memoised wrapper. Memoising here is the key perf win for facet
// mode: toggling a panel-level control updates the parent's
// `facetStatsAnnotations` / `facetStatsSummary` maps, which rebuilds the
// entire `facetedData.map` in `FacetPlotList`. Before this wrapper, the
// inline `chartProps` object was re-created for every facet on every App
// render, so `FacetBoxplotItem`'s `React.memo` shallow-compare always
// failed and every chart re-rendered — even unaffected siblings.
const FacetTrio = memo(function FacetTrio({
  fd,
  annotations,
  statsSummary,
  vis,
  yMinVal,
  yMaxVal,
  plotGroupRenames,
  boxplotColors,
  categoryColors,
  colorByCol,
  svgLegend,
  facetRefs,
}: any) {
  const chartProps = useMemo(
    () => ({
      groups: fd.groups.map((g) => ({
        ...g,
        name: plotGroupRenames[g.name] ?? g.name,
        color: boxplotColors[g.name] ?? g.color,
      })),
      annotations,
      statsSummary,
      yLabel: vis.yLabel,
      plotTitle: [vis.plotTitle, fd.category].filter(Boolean).join(" — "),
      plotBg: vis.plotBg,
      showGrid: vis.showGrid,
      gridColor: vis.gridColor,
      boxWidth: vis.boxWidth,
      boxFillOpacity: vis.boxFillOpacity,
      pointSize: vis.pointSize,
      showPoints: vis.showPoints,
      jitterWidth: vis.jitterWidth,
      pointOpacity: vis.pointOpacity,
      xLabelAngle: vis.xLabelAngle,
      yMin: yMinVal,
      yMax: yMaxVal,
      yScale: vis.yScale,
      categoryColors,
      colorByCol,
      boxGap: vis.boxGap,
      showCompPie: vis.showCompPie,
      plotStyle: vis.plotStyle,
      barOpacity: vis.barOpacity,
      errorType: vis.errorType,
      errStrokeWidth: vis.errStrokeWidth,
      showBarOutline: vis.showBarOutline,
      barOutlineWidth: vis.barOutlineWidth,
      barOutlineColor: vis.barOutlineColor,
      horizontal: vis.horizontal,
      subgroups: null,
      svgLegend,
    }),
    [
      fd,
      annotations,
      statsSummary,
      vis,
      yMinVal,
      yMaxVal,
      plotGroupRenames,
      boxplotColors,
      categoryColors,
      colorByCol,
      svgLegend,
    ]
  );
  return (
    <div style={{ maxWidth: 720 }}>
      <FacetBoxplotItem
        fd={fd}
        facetRefs={facetRefs}
        chartProps={chartProps}
        categoryColors={categoryColors}
      />
    </div>
  );
});

export function FacetPlotList({
  facetedData,
  facetRefs,
  vis,
  yMinVal,
  yMaxVal,
  plotGroupRenames,
  boxplotColors,
  categoryColors,
  colorByCol,
  colorByCategories,
  colNames,
  facetStatsAnnotations,
  facetStatsSummary,
}: any) {
  // Stabilise svgLegend so FacetTrio's shallow-compare can hold across
  // unrelated re-renders. Without this, it would be a fresh array literal
  // on every render and every memoised trio would re-render.
  const svgLegend = useMemo(
    () =>
      colorByCol >= 0 && colorByCategories.length > 0
        ? [
            {
              id: "legend-color",
              title: `Points colored by: ${colNames[colorByCol]}`,
              items: colorByCategories.map((c) => ({
                label: c,
                color: categoryColors[c] || "#999",
                shape: "dot",
              })),
            },
          ]
        : null,
    [colorByCol, colorByCategories, colNames, categoryColors]
  );
  if (!facetedData || facetedData.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {colorByCol >= 0 && colorByCategories.length > 0 && (
        <div
          style={{
            background: "var(--surface-subtle)",
            borderRadius: 8,
            padding: "8px 14px",
            border: "1px solid var(--border)",
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Points colored by: {colNames[colorByCol]}
          </span>
          {colorByCategories.map((cat) => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: categoryColors[cat] || "#999",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{cat}</span>
            </div>
          ))}
        </div>
      )}
      {facetedData.map((fd) => (
        <FacetTrio
          key={fd.category}
          fd={fd}
          annotations={facetStatsAnnotations[fd.category] || null}
          statsSummary={facetStatsSummary[fd.category] || null}
          vis={vis}
          yMinVal={yMinVal}
          yMaxVal={yMaxVal}
          plotGroupRenames={plotGroupRenames}
          boxplotColors={boxplotColors}
          categoryColors={categoryColors}
          colorByCol={colorByCol}
          svgLegend={svgLegend}
          facetRefs={facetRefs}
        />
      ))}
    </div>
  );
}
