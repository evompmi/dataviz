// boxplot/index.tsx — App orchestrator for the Group Plot tool. This file is
// the esbuild entry point (bundles to tools/boxplot/index.js) and only holds state
// wiring — chart rendering, step panels, sidebar controls, and stats-panel
// live in sibling modules under tools/boxplot/.

import { usePlotToolState } from "../_shell/usePlotToolState";
import { PlotToolShell } from "../_shell/PlotToolShell";
import { ERROR_BAR_LABELS, mergeSubgroupAnnotations } from "./helpers";
import { UploadStep, ConfigureStep, FilterStep, OutputStep } from "./steps";
import { PlotControls } from "./controls";
import { PlotArea, FacetPlotList } from "./plot-area";
import { BoxplotStatsPanel, statsInit, statsReducer } from "./stats-panel";

const { useState, useReducer, useMemo, useCallback, useRef } = React;

const VIS_INIT_BOXPLOT = {
  plotTitle: "",
  yLabel: "Value",
  plotBg: "#ffffff",
  showGrid: false,
  gridColor: "#e0e0e0",
  boxFillOpacity: 0.15,
  boxWidth: 70,
  boxGap: 0,
  pointSize: 2.5,
  showPoints: true,
  jitterWidth: 0.6,
  pointOpacity: 0.6,
  xLabelAngle: 0,
  yMinCustom: "",
  yMaxCustom: "",
  yScale: "linear",
  showCompPie: false,
  plotStyle: "box",
  horizontal: false,
  errorType: "sem",
  errStrokeWidth: 1.2,
  showBarOutline: false,
  barOutlineWidth: 1.5,
  barOutlineColor: "#333333",
  barOpacity: 0.25,
};

/* ── Main App (orchestrator) ───────────────────────────────────────────────── */

function App() {
  const shell = usePlotToolState("boxplot", VIS_INIT_BOXPLOT);
  const {
    step,
    setStep,
    fileName,
    setFileName,
    setParseError,
    sepOverride,
    setSepOverride,
    setCommaFixed,
    setCommaFixCount,
    vis,
    updVis,
  } = shell;

  // Upload & navigation
  const [rawText, setRawText] = useState(null);
  const [dataFormat, setDataFormat] = useState("long");

  // Parsing
  const [parsedHeaders, setParsedHeaders] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  // Column config & filtering
  const [colRoles, setColRoles] = useState<ColumnRole[]>([]);
  const [colNames, setColNames] = useState([]);
  const [filters, setFilters] = useState({});
  const [valueRenames, setValueRenames] = useState({});

  // Plot state
  const [boxplotColors, setBoxplotColors] = useState({});
  const [plotGroupRenames, setPlotGroupRenames] = useState({});
  const [disabledGroups, setDisabledGroups] = useState({});
  // Per-column ordering keyed by column index. Any column that can appear in
  // the rename panel (group/filter role) gets its own order array here, so the
  // user can reorder values during the filter step before ever picking a
  // "Facet by" or "Color by" column in the plot step.
  const [columnOrders, setColumnOrders] = useState({});
  const setOrderForCol = (i, newOrder) => setColumnOrders((prev) => ({ ...prev, [i]: newOrder }));
  const [colorByCol, setColorByCol] = useState(-1);
  const [categoryColors, setCategoryColors] = useState({});
  const [dragState, setDragState] = useState(null);
  const [facetByCol, _setFacetByCol] = useState(-1);
  const [subgroupByCol, _setSubgroupByCol] = useState(-1);
  // Facet and subgroup are mutually exclusive. Flipping one on turns the
  // other off.
  const handleSetFacetByCol = (v) => {
    _setFacetByCol(v);
    if (v >= 0) _setSubgroupByCol(-1);
  };
  const handleSetSubgroupByCol = (v) => {
    _setSubgroupByCol(v);
    if (v >= 0) _setFacetByCol(-1);
  };
  // Flat / facet / subgroup each own their own summary + annotation state so
  // nothing leaks across modes. Panel display prefs live in the same reducer
  // so their reset semantics (mode="none" clears annotations; showSummary=off
  // clears summaries) stay co-located with the state they drive.
  const [statsUi, dispatchStats] = useReducer(statsReducer, statsInit);
  const setFlatStatsSummary = (v) => dispatchStats({ type: "setFlatSummary", value: v });
  const setFlatStatsAnnotation = (v) => dispatchStats({ type: "setFlatAnnotation", value: v });
  const handleStatsShowSummaryChange = (v) => dispatchStats({ type: "setShowSummary", value: v });
  const handleStatsDisplayModeChange = (v) => dispatchStats({ type: "setDisplayMode", value: v });
  const setStatsShowNs = (v) => dispatchStats({ type: "setShowNs", value: v });
  // Stable references so `FacetTrio`'s shallow-compare memo can skip
  // re-rendering unaffected facets when one facet's map entry updates.
  const setAnnotationsFor = useCallback(
    (key, spec) => dispatchStats({ type: "setFacetAnnotation", key, value: spec }),
    []
  );
  const setSummaryFor = useCallback(
    (key, txt) => dispatchStats({ type: "setFacetSummary", key, value: txt }),
    []
  );

  const facetRefs = useRef({});
  const chartRef = useRef();

  const resetDerived = () => {
    setValueRenames({});
    setBoxplotColors({});
    setPlotGroupRenames({});
    setDisabledGroups({});
    setColumnOrders({});
    setColorByCol(-1);
    setCategoryColors({});
    _setFacetByCol(-1);
    _setSubgroupByCol(-1);
    dispatchStats({ type: "reset" });
    updVis({ yMinCustom: "", yMaxCustom: "" });
  };

  const buildFilters = (hdrs, rws) => {
    const f = {};
    hdrs.forEach((_, i) => {
      const u = [...new Set(rws.map((r) => r[i]))].sort();
      f[i] = { unique: u, included: new Set(u) };
    });
    return f;
  };

  const doParse = useCallback((text, sep) => {
    const dc = fixDecimalCommas(text, sep);
    const fixedText = dc.text;
    setCommaFixed(dc.commaFixed);
    setCommaFixCount(dc.count);
    setRawText(fixedText);

    const { headers, rows, hasHeader: hh } = parseRaw(fixedText, sep);
    if (!headers.length || !rows.length) {
      setParseError(
        "The file appears to be empty or has no data rows. Please check your file and try again."
      );
      return;
    }
    setParseError(null);

    const isWide = detectWideFormat(headers, rows);
    if (isWide) {
      const { headers: lh, rows: lr } = wideToLong(headers, rows);
      setParsedHeaders(lh);
      setParsedRows(lr);
      setHasHeader(true);
      setColRoles(["group", "value"]);
      setColNames([...lh]);
      setFilters(buildFilters(lh, lr));
      resetDerived();
      setDataFormat("wide");
      setStep("plot");
    } else {
      setParsedHeaders(headers);
      setParsedRows(rows);
      setHasHeader(hh);
      // guessColumnType is per-column, so it can hand back multiple "group"
      // or "value" roles (e.g. two low-cardinality categorical columns or two
      // numeric columns). Group Plot only uses one x-axis grouping column and
      // one numeric value column — keep the first guess of each and demote
      // any later ones to "filter" so the configure step never starts in a
      // state the user can't reach via the UI.
      {
        let seenGroup = false;
        let seenValue = false;
        setColRoles(
          headers.map((_, i) => {
            const r = guessColumnType(rows.map((row) => row[i] ?? ""));
            if (r === "group") {
              if (seenGroup) return "filter";
              seenGroup = true;
              return r;
            }
            if (r === "value") {
              if (seenValue) return "filter";
              seenValue = true;
              return r;
            }
            return r;
          })
        );
      }
      setColNames([...headers]);
      setFilters(buildFilters(headers, rows));
      resetDerived();
      setDataFormat("long");
      setStep("configure");
    }
  }, []);

  const handleFileLoad = useCallback(
    (text, name) => {
      setFileName(name);
      doParse(text, sepOverride);
    },
    [sepOverride, doParse]
  );
  const loadExample = useCallback(() => {
    const csv = makeExamplePlantCSV();
    setSepOverride(",");
    setFileName("example_plant_growth.csv");
    doParse(csv, ",");
  }, [doParse]);

  const resetAll = () => {
    setRawText(null);
    setParsedRows([]);
    setParsedHeaders([]);
    setFileName("");
    setStep("upload");
  };

  const applyRename = (ci, v) =>
    valueRenames[ci] && valueRenames[ci][v] != null ? valueRenames[ci][v] : v;

  const filteredRows = useMemo(
    () => parsedRows.filter((r) => r.every((v, ci) => !filters[ci] || filters[ci].included.has(v))),
    [parsedRows, filters]
  );

  const renamedRows = useMemo(
    () => filteredRows.map((r) => r.map((v, ci) => applyRename(ci, v))),
    [filteredRows, valueRenames]
  );

  const activeColIdxs = useMemo(
    () =>
      colRoles.reduce((acc, r, i) => {
        if (r !== "ignore") acc.push(i);
        return acc;
      }, []),
    [colRoles]
  );

  const groupColIdx = colRoles.indexOf("group");
  const valueColIdx = colRoles.indexOf("value");

  const groupedData = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return {};
    const g = {};
    renamedRows.forEach((r) => {
      const k = r[groupColIdx];
      if (!g[k]) g[k] = [];
      g[k].push(r[valueColIdx]);
    });
    return g;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const stats = useMemo(() => computeGroupStats(groupedData), [groupedData]);

  const wideData = useMemo(
    () =>
      groupColIdx < 0 || valueColIdx < 0
        ? null
        : reshapeWide(renamedRows, groupColIdx, valueColIdx),
    [renamedRows, groupColIdx, valueColIdx]
  );

  const naturalGroupOrder = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const seen = new Set(),
      order = [];
    renamedRows.forEach((r) => {
      const g = r[groupColIdx];
      if (!seen.has(g)) {
        seen.add(g);
        order.push(g);
      }
    });
    return order;
  }, [renamedRows, groupColIdx, valueColIdx]);

  const effectiveOrder = useMemo(() => {
    const stored = columnOrders[groupColIdx];
    if (stored && stored.length > 0) {
      const valid = stored.filter((g) => naturalGroupOrder.includes(g));
      const missing = naturalGroupOrder.filter((g) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalGroupOrder;
  }, [columnOrders, groupColIdx, naturalGroupOrder]);

  const colorByCandidates = useMemo(
    () =>
      parsedHeaders
        .map((_, i) => i)
        .filter(
          (i) =>
            i !== groupColIdx &&
            i !== valueColIdx &&
            (colRoles[i] === "filter" || colRoles[i] === "group" || colRoles[i] === "text")
        ),
    [parsedHeaders, groupColIdx, valueColIdx, colRoles]
  );

  const colorByCategories = useMemo(() => {
    if (colorByCol < 0) return [];
    return [...new Set(renamedRows.map((r) => r[colorByCol]))].sort();
  }, [colorByCol, renamedRows]);

  const boxplotGroups = useMemo(() => {
    if (groupColIdx < 0 || valueColIdx < 0) return [];
    const gm = {};
    renamedRows.forEach((r) => {
      if (groupColIdx >= r.length || valueColIdx >= r.length) return;
      const g = r[groupColIdx],
        v = Number(r[valueColIdx]);
      if (r[valueColIdx] === "" || isNaN(v)) return;
      if (!gm[g]) gm[g] = {};
      if (colorByCol >= 0) {
        const cat = (colorByCol < r.length ? r[colorByCol] : null) || "?";
        if (!gm[g][cat]) gm[g][cat] = [];
        gm[g][cat].push(v);
      } else {
        if (!gm[g]["_all"]) gm[g]["_all"] = [];
        gm[g]["_all"].push(v);
      }
    });
    const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
    return effectiveOrder
      .filter((name) => gm[name])
      .map((name, gi) => {
        const catMap = gm[name];
        const sources = cats
          .filter((c) => catMap[c])
          .map((cat, si) => ({
            colIndex: si,
            values: catMap[cat],
            category: cat,
          }));
        const allValues = sources.flatMap((s) => s.values);
        return {
          name,
          sources,
          allValues,
          stats: { ...quartiles(allValues), ...computeStats(allValues) },
          color: boxplotColors[name] || PALETTE[gi % PALETTE.length],
        };
      });
  }, [
    renamedRows,
    groupColIdx,
    valueColIdx,
    boxplotColors,
    effectiveOrder,
    colorByCol,
    colorByCategories,
  ]);

  const allDisplayGroups = useMemo(
    () =>
      boxplotGroups.map((g) => ({
        ...g,
        displayName: plotGroupRenames[g.name] ?? g.name,
        enabled: !disabledGroups[g.name],
      })),
    [boxplotGroups, plotGroupRenames, disabledGroups]
  );

  const displayBoxplotGroups = useMemo(
    () => allDisplayGroups.filter((g) => g.enabled).map((g) => ({ ...g, name: g.displayName })),
    [allDisplayGroups]
  );

  // Facet column candidates (same pool as colorBy). The natural order is the
  // first-seen order of unique values in the (renamed) data so it matches what
  // the user sees in the rename panel.
  const naturalFacetOrder = useMemo(() => {
    if (facetByCol < 0) return [];
    const seen = new Set();
    const order = [];
    renamedRows.forEach((r) => {
      const v = r[facetByCol];
      if (!seen.has(v)) {
        seen.add(v);
        order.push(v);
      }
    });
    return order;
  }, [facetByCol, renamedRows]);

  const effectiveFacetOrder = useMemo(() => {
    const stored = columnOrders[facetByCol];
    if (stored && stored.length > 0) {
      const valid = stored.filter((g) => naturalFacetOrder.includes(g));
      const missing = naturalFacetOrder.filter((g) => !stored.includes(g));
      return [...valid, ...missing];
    }
    return naturalFacetOrder;
  }, [columnOrders, facetByCol, naturalFacetOrder]);

  const facetByCategories = effectiveFacetOrder;

  // Every group/filter column (except the numeric value column) is
  // reorderable. Each column's natural order is first-seen in renamedRows,
  // any user-drag override is merged on top. Computed here so that reordering
  // works at the filter step — before the user has even chosen which column
  // feeds "Facet by" or "Color by" in the plot step.
  const orderableCols = useMemo(() => {
    const m = {};
    parsedHeaders.forEach((_, i) => {
      if (i === valueColIdx) return;
      if (colRoles[i] !== "group" && colRoles[i] !== "filter") return;
      const seen = new Set();
      const natural = [];
      renamedRows.forEach((r) => {
        const v = r[i];
        if (!seen.has(v)) {
          seen.add(v);
          natural.push(v);
        }
      });
      const stored = columnOrders[i];
      let order = natural;
      if (stored && stored.length > 0) {
        const valid = stored.filter((g) => natural.includes(g));
        const missing = natural.filter((g) => !stored.includes(g));
        order = [...valid, ...missing];
      }
      m[i] = { order, onReorder: (newOrder) => setOrderForCol(i, newOrder) };
    });
    return m;
  }, [parsedHeaders, colRoles, valueColIdx, renamedRows, columnOrders]);

  // Faceted groups: one boxplot per facet category
  const facetedData = useMemo(() => {
    if (facetByCol < 0) return [];
    const globalColorMap = {};
    boxplotGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    return facetByCategories.map((cat) => {
      const catRows = renamedRows.filter((r) => r[facetByCol] === cat);
      const gm = {};
      catRows.forEach((r) => {
        if (groupColIdx >= r.length || valueColIdx >= r.length) return;
        const g = r[groupColIdx],
          v = Number(r[valueColIdx]);
        if (r[valueColIdx] === "" || isNaN(v)) return;
        if (!gm[g]) gm[g] = {};
        if (colorByCol >= 0) {
          const cc = (colorByCol < r.length ? r[colorByCol] : null) || "?";
          if (!gm[g][cc]) gm[g][cc] = [];
          gm[g][cc].push(v);
        } else {
          if (!gm[g]["_all"]) gm[g]["_all"] = [];
          gm[g]["_all"].push(v);
        }
      });
      const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
      const groups = effectiveOrder
        .filter((name) => gm[name] && !disabledGroups[name])
        .map((name, gi) => {
          const catMap = gm[name];
          const sources = cats
            .filter((c) => catMap[c])
            .map((c, si) => ({
              colIndex: si,
              values: catMap[c],
              category: c,
            }));
          const allValues = sources.flatMap((s) => s.values);
          return {
            name,
            sources,
            allValues,
            stats: { ...quartiles(allValues), ...computeStats(allValues) },
            color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length],
          };
        });
      return { category: cat, groups };
    });
  }, [
    facetByCol,
    facetByCategories,
    colorByCol,
    colorByCategories,
    renamedRows,
    groupColIdx,
    valueColIdx,
    effectiveOrder,
    boxplotColors,
    boxplotGroups,
    disabledGroups,
  ]);

  // Subgrouped data: single plot with groups partitioned by subgroup column
  const subgroupedData = useMemo(() => {
    if (subgroupByCol < 0 || groupColIdx < 0 || valueColIdx < 0) return null;
    const sgOrder = orderableCols[subgroupByCol]?.order || [];
    if (sgOrder.length === 0) return null;
    const globalColorMap: Record<string, string> = {};
    boxplotGroups.forEach((g) => {
      globalColorMap[g.name] = g.color;
    });
    const cats = colorByCol >= 0 ? colorByCategories : ["_all"];
    const subgroups: Array<{ name: string; startIndex: number; count: number }> = [];
    const flatGroups: typeof boxplotGroups = [];
    let startIndex = 0;
    for (const sgCat of sgOrder) {
      const catRows = renamedRows.filter((r) => r[subgroupByCol] === sgCat);
      const gm: Record<string, Record<string, number[]>> = {};
      catRows.forEach((r) => {
        if (groupColIdx >= r.length || valueColIdx >= r.length) return;
        const g = r[groupColIdx],
          v = Number(r[valueColIdx]);
        if (r[valueColIdx] === "" || isNaN(v)) return;
        if (!gm[g]) gm[g] = {};
        if (colorByCol >= 0) {
          const cc = (colorByCol < r.length ? r[colorByCol] : null) || "?";
          if (!gm[g][cc]) gm[g][cc] = [];
          gm[g][cc].push(v);
        } else {
          if (!gm[g]["_all"]) gm[g]["_all"] = [];
          gm[g]["_all"].push(v);
        }
      });
      const groups = effectiveOrder
        .filter((name) => gm[name] && !disabledGroups[name])
        .map((name, gi) => {
          const catMap = gm[name];
          const sources = cats
            .filter((c) => catMap[c])
            .map((c, si) => ({
              colIndex: si,
              values: catMap[c],
              category: c,
            }));
          const allValues = sources.flatMap((s) => s.values);
          return {
            name,
            sources,
            allValues,
            stats: { ...quartiles(allValues), ...computeStats(allValues) },
            color: globalColorMap[name] || boxplotColors[name] || PALETTE[gi % PALETTE.length],
          };
        });
      if (groups.length > 0) {
        subgroups.push({ name: sgCat, startIndex, count: groups.length });
        flatGroups.push(...groups);
        startIndex += groups.length;
      }
    }
    if (subgroups.length === 0) return null;
    return { subgroups, flatGroups };
  }, [
    subgroupByCol,
    orderableCols,
    renamedRows,
    groupColIdx,
    valueColIdx,
    colorByCol,
    colorByCategories,
    effectiveOrder,
    disabledGroups,
    boxplotColors,
    boxplotGroups,
  ]);

  // Merge per-subgroup annotation specs from the stats panel into a single
  // spec with offset indices so the shared chart renders CLD letters /
  // brackets across the flat axis.
  const mergedSubgroupAnnot = useMemo(() => {
    if (!subgroupedData) return null;
    const renamedFlat = subgroupedData.flatGroups.map((g) => ({
      ...g,
      name: plotGroupRenames[g.name] ?? g.name,
    }));
    return mergeSubgroupAnnotations(
      subgroupedData.subgroups,
      renamedFlat,
      statsUi.subgroupAnnotSpecs
    );
  }, [subgroupedData, statsUi.subgroupAnnotSpecs, plotGroupRenames]);
  // The non-facet chart gets a single annotation spec and a single summary
  // line chosen by the active mode.
  const chartAnnotations =
    subgroupByCol >= 0 && subgroupedData ? mergedSubgroupAnnot : statsUi.flatAnnotation;
  const chartSummary = subgroupByCol >= 0 && subgroupedData ? null : statsUi.flatSummary;

  const toggleFilter = (ci, v) =>
    setFilters((p) => {
      const f = { ...p },
        s = new Set(f[ci].included);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      f[ci] = { ...f[ci], included: s };
      return f;
    });

  const toggleAllFilter = (ci, all) =>
    setFilters((p) => {
      const f = { ...p };
      f[ci] = { ...f[ci], included: all ? new Set(f[ci].unique) : new Set() };
      return f;
    });

  const setRenameVal = (ci, ov, nv) =>
    setValueRenames((p) => {
      const r = { ...p };
      if (!r[ci]) r[ci] = {};
      r[ci] = { ...r[ci], [ov]: nv };
      return r;
    });

  // Group Plot has exactly one x-axis grouping column and one numeric value
  // column, so "group" and "value" are exclusive roles. Picking either on a
  // new column demotes any previous column with the same role to "filter"
  // instead of silently ending up with two columns whose role select says
  // the same thing but only the first one actually drives the plot
  // (valueColIdx / groupColIdx are both `colRoles.indexOf(...)`).
  const updateRole = (i: number, role: ColumnRole) =>
    setColRoles((p) =>
      p.map((r, j) => {
        if (j === i) return role;
        if ((role === "group" || role === "value") && r === role) return "filter";
        return r;
      })
    );
  const updateColName = (i, nm) => setColNames((p) => p.map((n, j) => (j === i ? nm : n)));

  const yMinVal = vis.yMinCustom !== "" ? Number(vis.yMinCustom) : null;
  const yMaxVal = vis.yMaxCustom !== "" ? Number(vis.yMaxCustom) : null;

  const valueColIsNumeric = useMemo(() => {
    if (valueColIdx < 0 || !parsedRows.length) return false;
    const vals = parsedRows.map((r) => r[valueColIdx] ?? "").filter((v) => v !== "");
    return vals.length > 0 && vals.filter((v) => isNumericValue(v)).length / vals.length > 0.5;
  }, [parsedRows, valueColIdx]);

  const canPlot =
    groupColIdx >= 0 && valueColIdx >= 0 && valueColIsNumeric && boxplotGroups.length > 0;
  const handleToggleGroup = (i) => {
    const name = boxplotGroups[i].name;
    setDisabledGroups((p) => ({ ...p, [name]: !p[name] }));
  };

  const fileStem = `${fileBaseName(fileName, "groupplot")}_groupplot`;
  const handleDownloadSvg = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) =>
        downloadSvg(facetRefs.current[fd.category], `${fileStem}_${fd.category}.svg`)
      );
    } else {
      downloadSvg(chartRef.current, `${fileStem}.svg`);
    }
  }, [facetByCol, facetedData, fileStem]);

  const handleDownloadPng = useCallback(() => {
    if (facetByCol >= 0 && facetedData.length > 0) {
      facetedData.forEach((fd) =>
        downloadPng(facetRefs.current[fd.category], `${fileStem}_${fd.category}.png`)
      );
    } else {
      downloadPng(chartRef.current, `${fileStem}.png`);
    }
  }, [facetByCol, facetedData, fileStem]);

  return (
    <PlotToolShell
      state={shell}
      toolName="boxplot"
      title="Group Plot"
      visInit={VIS_INIT_BOXPLOT}
      steps={["upload", "configure", "filter", "output", "plot"]}
      canNavigate={(s) => s === "upload" || parsedRows.length > 0}
    >
      {step === "upload" && (
        <UploadStep
          sepOverride={sepOverride}
          onSepChange={setSepOverride}
          rawText={rawText}
          doParse={doParse}
          handleFileLoad={handleFileLoad}
          setStep={setStep}
          onLoadExample={loadExample}
        />
      )}

      {step === "configure" && parsedRows.length > 0 && (
        <ConfigureStep
          fileName={fileName}
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          hasHeader={hasHeader}
          colRoles={colRoles}
          colNames={colNames}
          valueColIdx={valueColIdx}
          valueColIsNumeric={valueColIsNumeric}
          onRoleChange={updateRole}
          onNameChange={updateColName}
        />
      )}

      {step === "filter" && parsedRows.length > 0 && (
        <FilterStep
          parsedHeaders={parsedHeaders}
          parsedRows={parsedRows}
          colRoles={colRoles}
          colNames={colNames}
          filters={filters}
          filteredRows={filteredRows}
          renamedRows={renamedRows}
          activeColIdxs={activeColIdxs}
          valueRenames={valueRenames}
          orderableCols={orderableCols}
          applyRename={applyRename}
          toggleFilter={toggleFilter}
          toggleAllFilter={toggleAllFilter}
          setRenameVal={setRenameVal}
          dragState={dragState}
          setDragState={setDragState}
        />
      )}

      {step === "output" && parsedRows.length > 0 && (
        <OutputStep
          colNames={colNames}
          groupColIdx={groupColIdx}
          valueColIdx={valueColIdx}
          valueColIsNumeric={valueColIsNumeric}
          stats={stats}
          renamedRows={renamedRows}
          activeColIdxs={activeColIdxs}
          wideData={wideData}
          fileName={fileName}
        />
      )}

      {step === "plot" && canPlot && (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <PlotControls
            dataFormat={dataFormat}
            setDataFormat={setDataFormat}
            setStep={setStep}
            resetAll={resetAll}
            allDisplayGroups={allDisplayGroups}
            boxplotGroups={boxplotGroups}
            renamedRows={renamedRows}
            setPlotGroupRenames={setPlotGroupRenames}
            setBoxplotColors={setBoxplotColors}
            onToggleGroup={handleToggleGroup}
            vis={vis}
            updVis={updVis}
            colorByCol={colorByCol}
            setColorByCol={setColorByCol}
            colorByCandidates={colorByCandidates}
            colNames={colNames}
            categoryColors={categoryColors}
            setCategoryColors={setCategoryColors}
            colorByCategories={colorByCategories}
            facetByCol={facetByCol}
            setFacetByCol={handleSetFacetByCol}
            subgroupByCol={subgroupByCol}
            setSubgroupByCol={handleSetSubgroupByCol}
            onDownloadSvg={handleDownloadSvg}
            onDownloadPng={handleDownloadPng}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {vis.yScale !== "linear" &&
              boxplotGroups.some((g) => g.allValues.some((v) => v <= 0)) && (
                <div
                  style={{
                    background: "var(--warning-bg)",
                    color: "var(--warning-text)",
                    border: "1px solid var(--warning-border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    marginBottom: 8,
                  }}
                >
                  Some values are &le; 0 and cannot be shown on a{" "}
                  {vis.yScale === "log10"
                    ? "log\u2081\u2080"
                    : vis.yScale === "log2"
                      ? "log\u2082"
                      : "ln"}{" "}
                  scale.
                </div>
              )}
            {facetByCol < 0 ? (
              <>
                <PlotArea
                  colorByCol={colorByCol}
                  colorByCategories={colorByCategories}
                  colNames={colNames}
                  categoryColors={categoryColors}
                  facetByCol={facetByCol}
                  facetedData={facetedData}
                  chartRef={chartRef}
                  displayBoxplotGroups={
                    subgroupByCol >= 0 && subgroupedData
                      ? subgroupedData.flatGroups.map((g) => ({
                          ...g,
                          name: plotGroupRenames[g.name] ?? g.name,
                          color: boxplotColors[g.name] ?? g.color,
                        }))
                      : displayBoxplotGroups
                  }
                  vis={vis}
                  yMinVal={yMinVal}
                  yMaxVal={yMaxVal}
                  chartAnnotations={chartAnnotations}
                  chartSummary={chartSummary}
                  subgroups={subgroupByCol >= 0 && subgroupedData ? subgroupedData.subgroups : null}
                  subgroupSummaries={subgroupByCol >= 0 ? statsUi.subgroupSummaries : null}
                />
                {subgroupByCol >= 0 && subgroupedData
                  ? (() => {
                      const sets = subgroupedData.subgroups
                        .map((sg) => {
                          const sgGroups = subgroupedData.flatGroups.slice(
                            sg.startIndex,
                            sg.startIndex + sg.count
                          );
                          return {
                            key: sg.name,
                            name: sg.name,
                            groups: sgGroups.map((g) => ({
                              name: plotGroupRenames[g.name] ?? g.name,
                              values: g.allValues,
                            })),
                          };
                        })
                        .filter((s) => s.groups.length >= 2);
                      if (sets.length === 0) return null;
                      return (
                        <BoxplotStatsPanel
                          key="stats-panel-subgroup"
                          sets={sets}
                          setLabel="Subgroup"
                          fileStem={fileStem}
                          onAnnotationForKey={(key, spec) =>
                            dispatchStats({ type: "setSubgroupAnnotSpec", key, value: spec })
                          }
                          onSummaryForKey={(key, txt) =>
                            dispatchStats({ type: "setSubgroupSummary", key, value: txt })
                          }
                          displayMode={statsUi.displayMode}
                          onDisplayModeChange={handleStatsDisplayModeChange}
                          showNs={statsUi.showNs}
                          onShowNsChange={setStatsShowNs}
                          showSummary={statsUi.showSummary}
                          onShowSummaryChange={handleStatsShowSummaryChange}
                          errorBarLabel={
                            vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null
                          }
                        />
                      );
                    })()
                  : displayBoxplotGroups.length >= 2 && (
                      <BoxplotStatsPanel
                        key="stats-panel-flat"
                        sets={[
                          {
                            key: "flat",
                            name: "",
                            groups: displayBoxplotGroups.map((g) => ({
                              name: g.name,
                              values: g.allValues,
                            })),
                          },
                        ]}
                        setLabel=""
                        fileStem={`${fileStem}_stats`}
                        singletonAutoExpand
                        onAnnotationForKey={(_key, spec) => setFlatStatsAnnotation(spec)}
                        onSummaryForKey={(_key, txt) => setFlatStatsSummary(txt)}
                        displayMode={statsUi.displayMode}
                        onDisplayModeChange={handleStatsDisplayModeChange}
                        showNs={statsUi.showNs}
                        onShowNsChange={setStatsShowNs}
                        showSummary={statsUi.showSummary}
                        onShowSummaryChange={handleStatsShowSummaryChange}
                        errorBarLabel={
                          vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null
                        }
                      />
                    )}
              </>
            ) : (
              <>
                <FacetPlotList
                  facetedData={facetedData}
                  facetRefs={facetRefs}
                  vis={vis}
                  yMinVal={yMinVal}
                  yMaxVal={yMaxVal}
                  plotGroupRenames={plotGroupRenames}
                  boxplotColors={boxplotColors}
                  categoryColors={categoryColors}
                  colorByCol={colorByCol}
                  colorByCategories={colorByCategories}
                  colNames={colNames}
                  facetStatsAnnotations={statsUi.facetAnnotations}
                  facetStatsSummary={statsUi.facetSummaries}
                />
                {facetedData && facetedData.length > 0 && (
                  <BoxplotStatsPanel
                    key="stats-panel-facet"
                    sets={facetedData
                      .filter((fd) => fd.groups.length >= 2)
                      .map((fd) => ({
                        key: fd.category,
                        name: fd.category,
                        groups: fd.groups.map((g) => ({
                          name: plotGroupRenames[g.name] ?? g.name,
                          values: g.allValues,
                        })),
                      }))}
                    setLabel="Facet"
                    fileStem={fileStem}
                    onAnnotationForKey={(key, spec) => setAnnotationsFor(key, spec)}
                    onSummaryForKey={(key, txt) => setSummaryFor(key, txt)}
                    displayMode={statsUi.displayMode}
                    onDisplayModeChange={handleStatsDisplayModeChange}
                    showNs={statsUi.showNs}
                    onShowNsChange={setStatsShowNs}
                    showSummary={statsUi.showSummary}
                    onShowSummaryChange={handleStatsShowSummaryChange}
                    errorBarLabel={vis.plotStyle === "bar" ? ERROR_BAR_LABELS[vis.errorType] : null}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {step === "plot" && !canPlot && (
        <div
          className="dv-panel"
          style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}
        >
          <p style={{ fontSize: 12, color: "var(--warning-text)" }}>
            ⚠ Assign <strong>group</strong> + <strong>value</strong> columns and ensure filters keep
            data.
          </p>
          <button
            onClick={() => setStep("configure")}
            className="dv-btn dv-btn-secondary"
            style={{ marginTop: 8 }}
          >
            ← Configure
          </button>
        </div>
      )}
    </PlotToolShell>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary toolName="Boxplot">
    <App />
  </ErrorBoundary>
);
