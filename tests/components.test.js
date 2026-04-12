// Component render-smoke tests — verify every React component can be called
// with minimal valid props and returns a non-null element tree without throwing.

const { suite, test, assert, eq, summary } = require("./harness");
const { buildContext, loadTool, render, countElements } = require("./helpers/render-loader");

// ════════════════════════════════════════════════════════════════════════════
//  shared-components.js
// ════════════════════════════════════════════════════════════════════════════

const { ctx: sc, resetHooks: resetSC } = buildContext();
const noop = function () {};

suite("DataPreview");

test("renders table with headers and rows", function () {
  resetSC();
  var el = sc.DataPreview({
    headers: ["Name", "Value"],
    rows: [
      ["A", "1"],
      ["B", "2"],
      ["C", "3"],
    ],
  });
  assert(el, "should return an element");
  assert(el.type === "div", "root should be a div");
  assert(countElements(el) > 5, "should produce multiple elements");
});

test("renders with maxRows limiting output", function () {
  resetSC();
  var rows = [];
  for (var i = 0; i < 20; i++) rows.push(["r" + i, String(i)]);
  var el = sc.DataPreview({ headers: ["A", "B"], rows: rows, maxRows: 3 });
  assert(el, "should return an element");
});

suite("SliderControl");

test("renders slider with label and value", function () {
  resetSC();
  var el = sc.SliderControl({
    label: "Opacity",
    value: 50,
    min: 0,
    max: 100,
    step: 1,
    onChange: noop,
  });
  assert(el, "should return an element");
  assert(el.type === "div", "root should be a div");
});

suite("StepNavBar");

test("renders step buttons", function () {
  resetSC();
  var el = sc.StepNavBar({
    steps: ["Upload", "Configure", "Plot"],
    currentStep: "Upload",
    onStepChange: noop,
  });
  assert(el, "should return an element");
  assert(el.children.length === 3, "should have 3 step buttons");
});

suite("CommaFixBanner");

test("returns null when commaFixed is false", function () {
  resetSC();
  var el = sc.CommaFixBanner({ commaFixed: false, commaFixCount: 0 });
  eq(el, null);
});

test("renders banner when commaFixed is true", function () {
  resetSC();
  var el = sc.CommaFixBanner({ commaFixed: true, commaFixCount: 5 });
  assert(el, "should return an element");
});

suite("ParseErrorBanner");

test("returns null when no error", function () {
  resetSC();
  var el = sc.ParseErrorBanner({ error: null });
  eq(el, null);
});

test("renders banner with error message", function () {
  resetSC();
  var el = sc.ParseErrorBanner({ error: "Bad CSV" });
  assert(el, "should return an element");
});

suite("PageHeader");

test("renders header with title", function () {
  resetSC();
  var el = sc.PageHeader({ toolName: "boxplot", title: "Boxplot Tool" });
  assert(el, "should return an element");
});

test("renders header with subtitle", function () {
  resetSC();
  var el = sc.PageHeader({
    toolName: "scatter",
    title: "Scatter",
    subtitle: "XY plots",
  });
  assert(el, "should return an element");
  assert(countElements(el) > 3, "subtitle should add elements");
});

suite("UploadPanel");

test("renders with no separator selected (disabled state)", function () {
  resetSC();
  var el = sc.UploadPanel({
    sepOverride: "",
    onSepChange: noop,
    onFileLoad: noop,
  });
  assert(el, "should return an element");
});

test("renders with separator selected (enabled state)", function () {
  resetSC();
  var el = sc.UploadPanel({
    sepOverride: ",",
    onSepChange: noop,
    onFileLoad: noop,
  });
  assert(el, "should return an element");
});

suite("ActionsPanel");

test("renders with download and reset", function () {
  resetSC();
  var el = sc.ActionsPanel({ onDownloadSvg: noop, onReset: noop });
  assert(el, "should return an element");
});

test("renders with extra buttons", function () {
  resetSC();
  var el = sc.ActionsPanel({
    onDownloadSvg: noop,
    onReset: noop,
    extraButtons: [{ label: "Download CSV", onClick: noop }],
  });
  assert(el, "should return an element");
});

suite("ColumnRoleEditor");

test("renders column role dropdowns", function () {
  resetSC();
  var el = sc.ColumnRoleEditor({
    headers: ["Group", "Value", "Filter"],
    rows: [
      ["A", "1", "x"],
      ["B", "2", "y"],
    ],
    colRoles: ["group", "value", "filter"],
    colNames: ["Group", "Value", "Filter"],
    onRoleChange: noop,
    onNameChange: noop,
  });
  assert(el, "should return an element");
});

suite("FilterCheckboxPanel");

test("renders filter checkboxes", function () {
  resetSC();
  var el = sc.FilterCheckboxPanel({
    headers: ["Grp", "Val"],
    colNames: ["Grp", "Val"],
    colRoles: ["group", "value"],
    filters: {
      0: { unique: ["A", "B"], included: new Set(["A", "B"]) },
      1: { unique: ["1", "2"], included: new Set(["1", "2"]) },
    },
    filteredCount: 2,
    totalCount: 2,
    onToggle: noop,
    onToggleAll: noop,
  });
  assert(el, "should return an element");
});

suite("RenameReorderPanel");

test("renders rename inputs and drag handles", function () {
  resetSC();
  var el = sc.RenameReorderPanel({
    headers: ["Grp"],
    colNames: ["Group"],
    colRoles: ["group"],
    filters: { 0: { unique: ["A", "B"], included: new Set(["A", "B"]) } },
    valueRenames: {},
    groupColIdx: 0,
    effectiveOrder: ["A", "B"],
    applyRename: function (i, v) {
      return v;
    },
    onRenameVal: noop,
    onReorder: noop,
    dragIdx: null,
    onDragStart: noop,
    onDragEnd: noop,
  });
  assert(el, "should return an element");
});

suite("StatsTable");

test("returns null for empty stats", function () {
  resetSC();
  var el = sc.StatsTable({ stats: [], groupLabel: "Treatment" });
  eq(el, null);
});

test("renders table with stats rows", function () {
  resetSC();
  var el = sc.StatsTable({
    stats: [
      { name: "Control", n: 10, mean: 5.5, median: 5.0, sd: 1.2, sem: 0.38, min: 3, max: 8 },
      { name: "Treatment", n: 10, mean: 7.2, median: 7.0, sd: 1.5, sem: 0.47, min: 4, max: 10 },
    ],
    groupLabel: "Condition",
  });
  assert(el, "should return an element");
  assert(countElements(el) > 10, "table should have many elements");
});

suite("GroupColorEditor");

test("renders color pickers per group", function () {
  resetSC();
  var el = sc.GroupColorEditor({
    groups: [
      { name: "A", color: "#648FFF", stats: { n: 5 } },
      { name: "B", color: "#DC267F", stats: { n: 3 } },
    ],
    onColorChange: noop,
  });
  assert(el, "should return an element");
  assert(el.children.length === 2, "should have 2 group rows");
});

suite("BaseStyleControls");

test("renders background and grid controls", function () {
  resetSC();
  var el = sc.BaseStyleControls({
    plotBg: "#ffffff",
    onPlotBgChange: noop,
    showGrid: true,
    onShowGridChange: noop,
    gridColor: "#e0e0e0",
    onGridColorChange: noop,
  });
  assert(Array.isArray(el), "returns array of children");
  assert(el.length === 3, "bg + grid toggle + grid color");
});

test("hides grid color when grid is off", function () {
  resetSC();
  var el = sc.BaseStyleControls({
    plotBg: "#ffffff",
    onPlotBgChange: noop,
    showGrid: false,
    onShowGridChange: noop,
    gridColor: "#e0e0e0",
    onGridColorChange: noop,
  });
  assert(Array.isArray(el), "returns array");
  assert(el.length === 2, "only bg + grid toggle");
});

suite("ColorInput");

test("renders color picker and text input", function () {
  resetSC();
  var el = sc.ColorInput({ value: "#648FFF", onChange: noop });
  assert(el, "should return an element");
  assert(el.children.length === 2, "color input + text input");
});

suite("FileDropZone");

test("renders drop zone", function () {
  resetSC();
  var el = sc.FileDropZone({ onFileLoad: noop });
  assert(el, "should return an element");
});

// ════════════════════════════════════════════════════════════════════════════
//  Chart components (compiled tool .js files)
// ════════════════════════════════════════════════════════════════════════════

// ── BoxplotChart ────────────────────────────────────────────────────────────

suite("BoxplotChart");

(function () {
  var tool = loadTool("boxplot");
  var BoxplotChart = tool.ctx.BoxplotChart;

  var sampleGroups = [
    {
      name: "Control",
      color: "#648FFF",
      allValues: [3, 5, 7, 9, 11],
      stats: { q1: 4, med: 7, q3: 10, wLo: 3, wHi: 11 },
      sources: [{ colIndex: 0, values: [3, 5, 7, 9, 11], category: null }],
    },
    {
      name: "Treatment",
      color: "#DC267F",
      allValues: [6, 8, 10, 12, 14],
      stats: { q1: 7, med: 10, q3: 13, wLo: 6, wHi: 14 },
      sources: [{ colIndex: 0, values: [6, 8, 10, 12, 14], category: null }],
    },
  ];

  test("renders SVG with valid groups", function () {
    tool.resetHooks();
    var el = render(BoxplotChart, {
      groups: sampleGroups,
      yLabel: "Value",
      plotTitle: "Test",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      boxWidth: 60,
      boxFillOpacity: 0.3,
      pointSize: 3,
      showPoints: true,
      jitterWidth: 0.4,
      pointOpacity: 0.6,
      xLabelAngle: 0,
      categoryColors: {},
      colorByCol: -1,
      boxGap: 0,
      svgLegend: [],
      showCompPie: false,
    });
    assert(el, "should return an element");
    assert(el.type === "svg", "root should be an SVG");
    assert(countElements(el) > 10, "should produce a complex element tree");
  });

  test("returns null for empty groups", function () {
    tool.resetHooks();
    var el = render(BoxplotChart, {
      groups: [{ name: "Empty", color: "#648FFF", allValues: [], stats: null, sources: [] }],
      yLabel: "Y",
      plotTitle: "",
      plotBg: "#fff",
      showGrid: false,
      gridColor: "#eee",
      boxWidth: 60,
      boxFillOpacity: 0.3,
      pointSize: 3,
      showPoints: false,
      jitterWidth: 0,
      pointOpacity: 0.6,
      xLabelAngle: 0,
      categoryColors: {},
      colorByCol: -1,
      boxGap: 0,
      svgLegend: [],
      showCompPie: false,
    });
    eq(el, null, "empty data should return null");
  });

  test("renders with points hidden", function () {
    tool.resetHooks();
    var el = render(BoxplotChart, {
      groups: sampleGroups,
      yLabel: "Value",
      plotTitle: "",
      plotBg: "#fff",
      showGrid: false,
      gridColor: "#eee",
      boxWidth: 80,
      boxFillOpacity: 0.5,
      pointSize: 3,
      showPoints: false,
      jitterWidth: 0,
      pointOpacity: 0.6,
      xLabelAngle: 45,
      categoryColors: {},
      colorByCol: -1,
      boxGap: 10,
      svgLegend: [],
      showCompPie: false,
    });
    assert(el, "should return an element");
    assert(el.type === "svg", "root should be an SVG");
  });
})();

// ── BarChart ────────────────────────────────────────────────────────────────

suite("BarChart");

(function () {
  var tool = loadTool("boxplot");
  var BarChart = tool.ctx.BarChart;

  var sampleGroups = [
    {
      name: "Control",
      color: "#648FFF",
      displayName: "Control",
      stats: { n: 5, mean: 5.4, sd: 1.14, sem: 0.51 },
      sources: [{ colIndex: 0, values: [4, 5, 5, 6, 7] }],
    },
    {
      name: "Treatment",
      color: "#DC267F",
      displayName: "Treatment",
      stats: { n: 5, mean: 8.2, sd: 1.3, sem: 0.58 },
      sources: [{ colIndex: 0, values: [7, 8, 8, 9, 9] }],
    },
  ];

  test("renders SVG bar chart", function () {
    tool.resetHooks();
    var el = render(BarChart, {
      groups: sampleGroups,
      yLabel: "Value",
      plotTitle: "Bar Test",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      barWidth: 60,
      pointSize: 3,
      showPoints: true,
      jitterWidth: 0.3,
      pointOpacity: 0.6,
      xLabelAngle: 0,
      errorType: "sem",
      barOpacity: 0.8,
      catColors: {},
      errStrokeWidth: 1.5,
      showBarOutline: false,
      barOutlineWidth: 1,
      svgLegend: [],
    });
    assert(el, "should return an element");
    assert(el.type === "svg", "root should be an SVG");
    assert(countElements(el) > 10, "should produce many elements");
  });

  test("renders with no points and SD error bars", function () {
    tool.resetHooks();
    var el = render(BarChart, {
      groups: sampleGroups,
      yLabel: "Value",
      plotTitle: "",
      plotBg: "#f8f8fa",
      showGrid: false,
      gridColor: "#ccc",
      barWidth: 80,
      pointSize: 3,
      showPoints: false,
      jitterWidth: 0,
      pointOpacity: 0.6,
      xLabelAngle: 30,
      errorType: "sd",
      barOpacity: 1,
      catColors: {},
      errStrokeWidth: 2,
      showBarOutline: true,
      barOutlineWidth: 1.5,
      svgLegend: [],
    });
    assert(el, "should return an element");
  });
})();

// ── ScatterChart ────────────────────────────────────────────────────────────

suite("ScatterChart");

(function () {
  var tool = loadTool("scatter");
  var ScatterChart = tool.ctx.ScatterChart;

  var sampleData = [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
    { x: 5, y: 6 },
    { x: 7, y: 8 },
  ];
  var rawData = [
    ["1", "2", "A"],
    ["3", "4", "B"],
    ["5", "6", "A"],
    ["7", "8", "B"],
  ];

  test("renders SVG scatter plot", function () {
    tool.resetHooks();
    var el = render(ScatterChart, {
      data: sampleData,
      rawData: rawData,
      xCol: 0,
      yCol: 1,
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xLabel: "X",
      yLabel: "Y",
      title: "Scatter Test",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      refLines: [],
      pointColor: "#648FFF",
      pointSize: 4,
      pointOpacity: 0.7,
      strokeColor: "#333",
      strokeWidth: 0.5,
      colorMapCol: -1,
      colorMapType: "discrete",
      colorMapPalette: "viridis",
      colorMapDiscrete: {},
      colorMapRange: [0, 1],
      sizeMapCol: -1,
      sizeMapType: "discrete",
      sizeMapMin: 3,
      sizeMapMax: 10,
      sizeMapDiscrete: {},
      sizeMapRange: [0, 1],
      shapeMapCol: -1,
      shapeMapDiscrete: {},
      svgLegend: [],
    });
    assert(el, "should return an element");
    assert(el.type === "svg", "root should be an SVG");
    assert(countElements(el) > 5, "should have points and axes");
  });

  test("renders with color mapping", function () {
    tool.resetHooks();
    var el = render(ScatterChart, {
      data: sampleData,
      rawData: rawData,
      xCol: 0,
      yCol: 1,
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xLabel: "X",
      yLabel: "Y",
      title: "",
      plotBg: "#fff",
      showGrid: false,
      gridColor: "#eee",
      refLines: [],
      pointColor: "#648FFF",
      pointSize: 5,
      pointOpacity: 0.8,
      strokeColor: "none",
      strokeWidth: 0,
      colorMapCol: 2,
      colorMapType: "discrete",
      colorMapPalette: "viridis",
      colorMapDiscrete: { A: "#648FFF", B: "#DC267F" },
      colorMapRange: [0, 1],
      sizeMapCol: -1,
      sizeMapType: "discrete",
      sizeMapMin: 3,
      sizeMapMax: 10,
      sizeMapDiscrete: {},
      sizeMapRange: [0, 1],
      shapeMapCol: -1,
      shapeMapDiscrete: {},
      svgLegend: [],
    });
    assert(el, "should return an element");
  });

  test("renders empty data without crashing", function () {
    tool.resetHooks();
    var el = render(ScatterChart, {
      data: [],
      rawData: [],
      xCol: 0,
      yCol: 1,
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xLabel: "X",
      yLabel: "Y",
      title: "",
      plotBg: "#fff",
      showGrid: true,
      gridColor: "#eee",
      refLines: [],
      pointColor: "#648FFF",
      pointSize: 4,
      pointOpacity: 0.7,
      strokeColor: "#333",
      strokeWidth: 0.5,
      colorMapCol: -1,
      colorMapType: "discrete",
      colorMapPalette: "viridis",
      colorMapDiscrete: {},
      colorMapRange: [0, 1],
      sizeMapCol: -1,
      sizeMapType: "discrete",
      sizeMapMin: 3,
      sizeMapMax: 10,
      sizeMapDiscrete: {},
      sizeMapRange: [0, 1],
      shapeMapCol: -1,
      shapeMapDiscrete: {},
      svgLegend: [],
    });
    assert(el, "should return an element even with no data");
  });
})();

// ── Aequorin Chart ──────────────────────────────────────────────────────────

suite("AequorinChart");

(function () {
  var tool = loadTool("aequorin");
  var Chart = tool.ctx.Chart;

  var sampleSeries = [
    {
      name: "WT",
      color: "#648FFF",
      rows: [
        { t: 0, mean: 100, sd: 10 },
        { t: 1, mean: 200, sd: 20 },
        { t: 2, mean: 150, sd: 15 },
      ],
    },
    {
      name: "Mutant",
      color: "#DC267F",
      rows: [
        { t: 0, mean: 80, sd: 10 },
        { t: 1, mean: 120, sd: 20 },
        { t: 2, mean: 90, sd: 15 },
      ],
    },
  ];

  test("renders SVG line chart", function () {
    tool.resetHooks();
    var el = render(Chart, {
      series: sampleSeries,
      xStart: 0,
      xEnd: 2,
      yMin: 0,
      yMax: 250,
      vbW: 700,
      vbH: 450,
      xLabel: "Time (s)",
      yLabel: "Luminescence (RLU)",
      plotBg: "#fff",
      showGrid: true,
      lineWidth: 2,
      ribbonOpacity: 0.2,
      gridColor: "#eee",
      svgLegend: [],
      plotTitle: "Ca2+ Response",
      plotSubtitle: "",
    });
    assert(el, "should return an element");
    assert(el.type === "svg", "root should be an SVG");
    assert(countElements(el) > 10, "should produce a complex tree");
  });

  test("renders with empty series", function () {
    tool.resetHooks();
    var el = render(Chart, {
      series: [],
      xStart: 0,
      xEnd: 10,
      yMin: 0,
      yMax: 100,
      vbW: 700,
      vbH: 450,
      xLabel: "X",
      yLabel: "Y",
      plotBg: "#fff",
      showGrid: false,
      lineWidth: 2,
      ribbonOpacity: 0.2,
      gridColor: "#eee",
      svgLegend: [],
      plotTitle: "",
      plotSubtitle: "",
    });
    assert(el, "should return an element");
    assert(el.type === "svg", "root should be an SVG");
  });
})();

// ════════════════════════════════════════════════════════════════════════════
//  StatsTile
// ════════════════════════════════════════════════════════════════════════════

suite("StatsTile");

test("renders null when fewer than 2 valid groups", function () {
  resetSC();
  var el = sc.StatsTile({
    groups: [{ name: "only", values: [1, 2, 3, 4, 5] }],
    onAnnotationsChange: noop,
  });
  assert(el === null, "k<2 should return null");
});

test("collapsed header-only render when defaultOpen is false", function () {
  resetSC();
  var el = sc.StatsTile({
    groups: [
      { name: "A", values: [1, 2, 3, 4, 5, 6, 7, 8] },
      { name: "B", values: [2, 3, 4, 5, 6, 7, 8, 9] },
    ],
    onAnnotationsChange: noop,
  });
  assert(el && el.type === "div", "should return root div");
  // Header-only render has exactly one child (the header row).
  assert(el.children.length === 1, "collapsed should have only the header");
});

test("open render on k=2 shows assumption + test sections", function () {
  resetSC();
  var el = sc.StatsTile({
    groups: [
      { name: "A", values: [4.9, 5.1, 5.0, 5.2, 4.8, 5.1, 4.9, 5.0, 5.2, 4.9] },
      { name: "B", values: [5.9, 6.1, 6.0, 6.2, 5.8, 6.1, 5.9, 6.0, 6.2, 5.9] },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(el && el.type === "div", "should return root div");
  assert(countElements(el) > 30, "open tile should produce many elements");
});

test("open render on k=3 shows post-hoc table", function () {
  resetSC();
  var pgCtrl = [4.17, 5.58, 5.18, 6.11, 4.5, 4.61, 5.17, 4.53, 5.33, 5.14];
  var pgTrt1 = [4.81, 4.17, 4.41, 3.59, 5.87, 3.83, 6.03, 4.89, 4.32, 4.69];
  var pgTrt2 = [6.31, 5.12, 5.54, 5.5, 5.37, 5.29, 4.92, 6.15, 5.8, 5.26];
  var el = sc.StatsTile({
    groups: [
      { name: "ctrl", values: pgCtrl },
      { name: "trt1", values: pgTrt1 },
      { name: "trt2", values: pgTrt2 },
    ],
    onAnnotationsChange: noop,
    defaultOpen: true,
  });
  assert(el && el.type === "div", "should return root div");
  // PlantGrowth → k=3, so rendered tree should contain 3 post-hoc rows.
  var str = JSON.stringify(el);
  assert(str.indexOf("Post-hoc") >= 0, "should include Post-hoc heading");
  assert(str.indexOf("ctrl vs trt1") >= 0, "should list ctrl vs trt1 pair");
  assert(str.indexOf("ctrl vs trt2") >= 0, "should list ctrl vs trt2 pair");
  assert(str.indexOf("trt1 vs trt2") >= 0, "should list trt1 vs trt2 pair");
});

// ════════════════════════════════════════════════════════════════════════════
//  assignBracketLevels — stacking layout for overlapping significance pairs
// ════════════════════════════════════════════════════════════════════════════

suite("assignBracketLevels");

test("non-overlapping pairs share level 0", function () {
  var out = sc.assignBracketLevels([
    { i: 0, j: 1 },
    { i: 2, j: 3 },
  ]);
  eq(out[0]._level, 0);
  eq(out[1]._level, 0);
});

test("overlapping pairs stack to higher levels", function () {
  var out = sc.assignBracketLevels([
    { i: 0, j: 2 },
    { i: 1, j: 3 },
  ]);
  // Both span across the middle so one must sit above the other.
  var levels = [out[0]._level, out[1]._level].sort();
  eq(levels[0], 0);
  eq(levels[1], 1);
});

test("preserves original pair order", function () {
  var out = sc.assignBracketLevels([
    { i: 0, j: 1, label: "a" },
    { i: 2, j: 3, label: "b" },
    { i: 0, j: 3, label: "c" },
  ]);
  eq(out[0].label, "a");
  eq(out[1].label, "b");
  eq(out[2].label, "c");
});

// ════════════════════════════════════════════════════════════════════════════

summary();
