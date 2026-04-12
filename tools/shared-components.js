// shared-components.js — plain JS, no JSX
// Requires React to be loaded globally before this script.

// Accepts #rgb or #rrggbb (case-insensitive); returns lowercased #rrggbb
// or null if the string is not a valid hex color.
function normalizeHexColor(v) {
  if (typeof v !== "string") return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const s = v.toLowerCase();
    return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return null;
}

function ColorInput({ value, onChange, size = 22 }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => {
    setText(value);
  }, [value]);
  const commit = (v) => {
    const n = normalizeHexColor(v);
    if (n) onChange(n);
  };
  return React.createElement(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 4 } },
    React.createElement("input", {
      type: "color",
      value: value,
      onChange: (e) => onChange(e.target.value),
      style: {
        width: size,
        height: size,
        border: "1px solid #ccc",
        borderRadius: 4,
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      },
    }),
    React.createElement("input", {
      type: "text",
      value: text,
      onChange: (e) => {
        setText(e.target.value);
        commit(e.target.value);
      },
      onBlur: (e) => {
        const n = normalizeHexColor(e.target.value);
        if (n) onChange(n);
        else setText(value);
      },
      maxLength: 7,
      spellCheck: false,
      style: {
        width: 64,
        fontFamily: "monospace",
        fontSize: 11,
        border: "1px solid #ccc",
        borderRadius: 4,
        padding: "2px 5px",
        color: "#333",
        background: "#fff",
      },
    })
  );
}

const FILE_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MB — hard reject
const FILE_WARN_BYTES = 1 * 1024 * 1024; // 1 MB — show warning but allow

function FileDropZone({
  onFileLoad,
  accept = ".csv,.tsv,.txt,.dat",
  hint = "CSV · TSV · TXT · DAT",
}) {
  const [drag, setDrag] = React.useState(false);
  const [sizeError, setSizeError] = React.useState(null);
  const [sizeWarn, setSizeWarn] = React.useState(null);
  const inputRef = React.useRef();

  const handle = (file) => {
    setSizeError(null);
    setSizeWarn(null);
    if (file.size > FILE_LIMIT_BYTES) {
      setSizeError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 2 MB.`);
      return;
    }
    if (file.size > FILE_WARN_BYTES) {
      setSizeWarn(
        `Large file (${(file.size / 1024 / 1024).toFixed(1)} MB) — parsing may take a moment.`
      );
    }
    const reader = new FileReader();
    reader.onload = (e) => onFileLoad(e.target.result, file.name);
    reader.readAsText(file);
  };

  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      {
        onDragOver: (e) => {
          e.preventDefault();
          setDrag(true);
        },
        onDragLeave: () => setDrag(false),
        onDrop: (e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
        },
        onClick: () => inputRef.current.click(),
        style: {
          border: `2px dashed ${drag ? "#648FFF" : sizeError ? "#ef4444" : "#aaa"}`,
          borderRadius: 12,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: drag
            ? "rgba(100,143,255,0.06)"
            : sizeError
              ? "rgba(239,68,68,0.04)"
              : "transparent",
          transition: "all .2s",
        },
      },
      React.createElement("input", {
        ref: inputRef,
        type: "file",
        accept: accept,
        hidden: true,
        onChange: (e) => {
          if (e.target.files[0]) handle(e.target.files[0]);
          e.target.value = "";
        },
      }),
      React.createElement("div", { style: { fontSize: 40, marginBottom: 8 } }, "📂"),
      React.createElement(
        "p",
        { style: { margin: 0, fontSize: 15, color: "#666" } },
        "Drop your data file here, or click to browse"
      ),
      React.createElement("p", { style: { margin: "4px 0 0", fontSize: 12, color: "#999" } }, hint)
    ),
    sizeError &&
      React.createElement(
        "div",
        {
          style: {
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            display: "flex",
            alignItems: "center",
            gap: 8,
          },
        },
        React.createElement("span", { style: { fontSize: 16 } }, "🚫"),
        React.createElement(
          "span",
          { style: { fontSize: 12, color: "#dc2626", fontWeight: 600 } },
          sizeError
        )
      ),
    sizeWarn &&
      React.createElement(
        "div",
        {
          style: {
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fffbeb",
            border: "1px solid #fbbf24",
            display: "flex",
            alignItems: "center",
            gap: 8,
          },
        },
        React.createElement("span", { style: { fontSize: 16 } }, "⚠️"),
        React.createElement("span", { style: { fontSize: 12, color: "#92400e" } }, sizeWarn)
      )
  );
}

// ── SVG Legend helpers ────────────────────────────────────────────────────────

// itemWidth: number (fixed) or function(block) => number (dynamic per block)
function computeLegendHeight(blocks, usableW, itemWidth) {
  if (!blocks || !blocks.length) return 0;
  const IH = 18,
    TH = 15;
  const iw = itemWidth || 88;
  let t = 10;
  blocks.forEach(function (b, bi) {
    if (b.title) t += TH;
    if (b.items) {
      const bIW = typeof iw === "function" ? iw(b) : iw;
      t += Math.ceil(b.items.length / Math.max(1, Math.floor(usableW / bIW))) * IH;
    }
    if (b.gradient) t += 30;
    if (b.sizeItems && b.sizeItems.length) {
      const mr = Math.max(
        ...b.sizeItems.map(function (i) {
          return i.r;
        }),
        3
      );
      const rowH = mr * 2 + 4;
      // Compute per-item widths and wrap into rows
      let cx = 0,
        rows = 1;
      b.sizeItems.forEach(function (item, ii) {
        const labelW = (item.label || "").length * 5.6 + 6;
        const itemW = mr * 2 + 4 + labelW + 12;
        if (ii > 0 && cx + itemW > usableW) {
          rows++;
          cx = 0;
        }
        cx += itemW;
      });
      t += rows * rowH;
    }
    if (bi < blocks.length - 1) t += 8;
  });
  return t + 6;
}

// Renders SVG legend blocks. Returns array of <g> elements.
// startY: y offset for the first block, leftX: x offset, usableW: available width
// itemWidth: number or function(block) => number
// truncateLabel: optional max char length for labels (falsy = no truncation)
function renderSvgLegend(blocks, startY, leftX, usableW, itemWidth, truncateLabel) {
  if (!blocks || !blocks.length) return null;
  const h = React.createElement;
  const IH = 18,
    TH = 15;
  const iw = itemWidth || 88;

  // Pre-compute block Y offsets in a single pass (avoids O(n²) slice+reduce)
  const blockOffsets = [0];
  for (let bi = 0; bi < blocks.length - 1; bi++) {
    const b = blocks[bi];
    let off = blockOffsets[bi];
    if (b.title) off += TH;
    if (b.items) {
      const w = typeof iw === "function" ? iw(b) : iw;
      off += Math.ceil(b.items.length / Math.max(1, Math.floor(usableW / w))) * IH;
    }
    if (b.gradient) off += 30;
    if (b.sizeItems && b.sizeItems.length) {
      const mr = Math.max(
        ...b.sizeItems
          .map(function (i) {
            return i.r;
          })
          .concat([3])
      );
      off += mr * 2 + 4;
    }
    off += 8;
    blockOffsets.push(off);
  }

  return blocks.map(function (block, bi) {
    const bIW = typeof iw === "function" ? iw(block) : iw;
    const blockY = startY + blockOffsets[bi];
    const itemsPerRow = Math.max(1, Math.floor(usableW / bIW));
    const children = [];

    // Title
    if (block.title) {
      children.push(
        h(
          "text",
          { key: "title", fontSize: "10", fill: "#666", fontFamily: "sans-serif", y: 10 },
          block.title
        )
      );
    }

    // Items (circles or lines)
    if (block.items) {
      block.items.forEach(function (item, ii) {
        const row = Math.floor(ii / itemsPerRow);
        const col = ii % itemsPerRow;
        let label = item.label || "";
        if (truncateLabel && label.length > truncateLabel)
          label = label.slice(0, truncateLabel - 2) + "\u2026";
        let shape;
        if (item.shape === "line") {
          shape = h("line", {
            key: "s",
            x1: 0,
            x2: 14,
            y1: 7,
            y2: 7,
            stroke: item.color,
            strokeWidth: "2.5",
          });
        } else if (item.shape === "triangle") {
          shape = h("polygon", { key: "s", points: "6,1 1,12 11,12", fill: item.color });
        } else if (item.shape === "square") {
          shape = h("rect", { key: "s", x: 1, y: 2, width: 10, height: 10, fill: item.color });
        } else if (item.shape === "cross") {
          shape = h("path", {
            key: "s",
            d: "M4,0 H8 V4 H12 V8 H8 V12 H4 V8 H0 V4 H4 Z",
            fill: item.color,
          });
        } else {
          shape = h("circle", { key: "s", cx: 6, cy: 7, r: 5, fill: item.color });
        }
        const text = h(
          "text",
          {
            key: "t",
            x: item.shape === "line" ? 18 : 14,
            y: 11,
            fontSize: "10",
            fill: "#444",
            fontFamily: "sans-serif",
          },
          label
        );
        children.push(
          h(
            "g",
            {
              key: "i" + ii,
              transform:
                "translate(" + col * bIW + ", " + ((block.title ? TH : 0) + row * IH) + ")",
            },
            shape,
            text
          )
        );
      });
    }

    // Gradient
    if (block.gradient) {
      const gw = Math.min(usableW * 0.6, 200),
        gh = 12;
      const th = block.title ? TH : 0;
      const gradId = "svggrad-" + bi;
      const stops = block.gradient.stops.map(function (c, si) {
        return h("stop", {
          key: si,
          offset: (si / (block.gradient.stops.length - 1)) * 100 + "%",
          stopColor: c,
        });
      });
      children.push(
        h(
          "g",
          { key: "grad", transform: "translate(0, " + th + ")" },
          h(
            "defs",
            null,
            h("linearGradient", { id: gradId, x1: "0%", y1: "0%", x2: "100%", y2: "0%" }, stops)
          ),
          h("rect", { x: 0, y: 0, width: gw, height: gh, fill: "url(#" + gradId + ")", rx: "2" }),
          h(
            "text",
            {
              x: 0,
              y: gh + 13,
              fontSize: "9",
              fill: "#555",
              fontFamily: "sans-serif",
              textAnchor: "start",
            },
            block.gradient.min
          ),
          h(
            "text",
            {
              x: gw,
              y: gh + 13,
              fontSize: "9",
              fill: "#555",
              fontFamily: "sans-serif",
              textAnchor: "end",
            },
            block.gradient.max
          )
        )
      );
    }

    // Size items (scatter) — label-aware spacing with row wrapping
    if (block.sizeItems && block.sizeItems.length) {
      const sth = block.title ? TH : 0;
      const maxR = Math.max(
        ...block.sizeItems.map(function (i) {
          return i.r;
        }),
        3
      );
      const rowH = maxR * 2 + 4;
      let cx = 0,
        row = 0;
      const sizeChildren = block.sizeItems.map(function (item, ii) {
        const labelW = (item.label || "").length * 5.6 + 6;
        const itemW = maxR * 2 + 4 + labelW + 12;
        if (ii > 0 && cx + itemW > usableW) {
          row++;
          cx = 0;
        }
        const tx = cx;
        cx += itemW;
        return h(
          "g",
          { key: ii, transform: "translate(" + tx + ", " + row * rowH + ")" },
          h("circle", {
            cx: maxR,
            cy: 0,
            r: item.r,
            fill: "#888",
            fillOpacity: "0.35",
            stroke: "#888",
            strokeWidth: "0.8",
          }),
          h(
            "text",
            { x: maxR * 2 + 4, y: 4, fontSize: "9", fill: "#444", fontFamily: "sans-serif" },
            item.label
          )
        );
      });
      children.push(
        h("g", { key: "size", transform: "translate(0, " + (sth + maxR) + ")" }, sizeChildren)
      );
    }

    return h("g", { key: bi, transform: "translate(" + leftX + ", " + blockY + ")" }, children);
  });
}

// ── Shared UI Components ─────────────────────────────────────────────────────

// Slider with label + value display on top, range input below
function SliderControl(props) {
  const label = props.label,
    value = props.value,
    displayValue = props.displayValue,
    min = props.min,
    max = props.max,
    step = props.step,
    onChange = props.onChange;
  const dv = displayValue != null ? displayValue : value;
  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { style: { display: "flex", justifyContent: "space-between", marginBottom: 2 } },
      React.createElement("span", { style: lbl }, label),
      React.createElement("span", { style: { fontSize: 10, color: "#999" } }, dv)
    ),
    React.createElement("input", {
      type: "range",
      min: min,
      max: max,
      step: step,
      value: value,
      onChange: function (e) {
        onChange(Number(e.target.value));
      },
      style: { width: "100%", accentColor: "#648FFF" },
    })
  );
}

// Step navigation bar
function StepNavBar(props) {
  const steps = props.steps,
    currentStep = props.currentStep,
    onStepChange = props.onStepChange,
    canNavigate = props.canNavigate;
  return React.createElement(
    "div",
    { style: { display: "flex", gap: 8, marginBottom: 20 } },
    steps.map(function (s, i) {
      const enabled = canNavigate ? canNavigate(s) : true;
      return React.createElement(
        "button",
        {
          key: s,
          onClick: function () {
            if (enabled) onStepChange(s);
          },
          style: {
            padding: "6px 16px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: currentStep === s ? "#648FFF" : "#fff",
            color: currentStep === s ? "#fff" : enabled ? "#888" : "#ccc",
            border: "1px solid " + (currentStep === s ? "#648FFF" : enabled ? "#ccc" : "#eee"),
            cursor: enabled ? "pointer" : "default",
            fontFamily: "inherit",
            textTransform: "uppercase",
            letterSpacing: 1,
          },
        },
        i + 1 + ". " + s
      );
    })
  );
}

// Decimal comma auto-fix banner
function CommaFixBanner(props) {
  if (!props.commaFixed) return null;
  return React.createElement(
    "div",
    {
      style: Object.assign({}, sec, {
        background: "#fffbeb",
        borderColor: "#fbbf24",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
      }),
    },
    React.createElement("span", { style: { fontSize: 18 } }, "\uD83D\uDD04"),
    React.createElement(
      "div",
      { style: { flex: 1 } },
      React.createElement(
        "p",
        { style: { margin: 0, fontSize: 12, color: "#92400e", fontWeight: 600 } },
        "Decimal commas automatically converted to dots"
      ),
      React.createElement(
        "p",
        { style: { margin: "2px 0 0", fontSize: 11, color: "#a16207" } },
        props.commaFixCount +
          " value" +
          (props.commaFixCount > 1 ? "s" : "") +
          ' had commas as decimal separators (e.g. "0,5" \u2192 "0.5"). The data was corrected automatically.'
      )
    )
  );
}

// Parse error banner
function ParseErrorBanner(props) {
  if (!props.error) return null;
  return React.createElement(
    "div",
    {
      style: {
        marginBottom: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        display: "flex",
        alignItems: "center",
        gap: 8,
      },
    },
    React.createElement("span", { style: { fontSize: 16 } }, "\uD83D\uDEAB"),
    React.createElement(
      "span",
      { style: { fontSize: 12, color: "#dc2626", fontWeight: 600 } },
      props.error
    )
  );
}

// Page header with tool icon
function PageHeader(props) {
  return React.createElement(
    "div",
    { style: { marginBottom: 28, borderBottom: "1px solid #ccc", paddingBottom: 16 } },
    React.createElement(
      "h1",
      { style: { margin: 0, fontSize: 22, fontWeight: 700, color: "#222" } },
      toolIcon(props.toolName),
      props.title
    ),
    props.subtitle
      ? React.createElement(
          "p",
          { style: { margin: "4px 0 0", fontSize: 10, color: "#aaa" } },
          props.subtitle
        )
      : null
  );
}

// Separator selector + FileDropZone combo for upload step
function UploadPanel(props) {
  const sepOverride = props.sepOverride,
    onSepChange = props.onSepChange,
    onFileLoad = props.onFileLoad,
    onLoadExample = props.onLoadExample,
    exampleLabel = props.exampleLabel,
    hint = props.hint;
  return React.createElement(
    "div",
    { style: sec },
    React.createElement(
      "div",
      {
        style: {
          marginBottom: 12,
          padding: "12px 16px",
          background: "#eef2ff",
          borderRadius: 8,
          border: "1.5px solid #b0c4ff",
          display: "flex",
          alignItems: "center",
          gap: 10,
        },
      },
      React.createElement(
        "span",
        { style: { fontSize: 13, fontWeight: 600, color: "#648FFF" } },
        "1. Choose your column separator:"
      ),
      React.createElement(
        "select",
        {
          value: sepOverride,
          onChange: function (e) {
            onSepChange(e.target.value);
          },
          style: sepSelect,
        },
        React.createElement("option", { value: "" }, "\u2014 Select \u2014"),
        React.createElement("option", { value: "," }, "Comma (,)"),
        React.createElement("option", { value: ";" }, "Semicolon (;)"),
        React.createElement("option", { value: "\t" }, "Tab (\\t)"),
        React.createElement("option", { value: " " }, "Space")
      ),
      !sepOverride
        ? React.createElement(
            "span",
            { style: { fontSize: 11, color: "#e11d48", fontWeight: 600 } },
            "\u26A0 Required before loading a file"
          )
        : null
    ),
    !sepOverride
      ? React.createElement(
          "div",
          {
            style: {
              border: "2px dashed #ccc",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              background: "#f5f5f5",
              opacity: 0.5,
            },
          },
          React.createElement("div", { style: { fontSize: 40, marginBottom: 8 } }, "\uD83D\uDEAB"),
          React.createElement(
            "p",
            { style: { margin: 0, fontSize: 15, color: "#999" } },
            "Select a column separator above to enable file loading"
          )
        )
      : React.createElement(FileDropZone, {
          onFileLoad: onFileLoad,
          accept: ".csv,.tsv,.txt,.dat,.tab",
          hint: hint || "CSV \u00B7 TSV \u00B7 TXT \u00B7 DAT",
        }),
    onLoadExample
      ? React.createElement(
          "div",
          {
            style: {
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontSize: 12,
              color: "#666",
            },
          },
          React.createElement("span", null, "No data handy?"),
          React.createElement(
            "button",
            {
              onClick: onLoadExample,
              style: {
                background: "none",
                border: "none",
                padding: 0,
                color: "#648FFF",
                fontWeight: 700,
                fontSize: 12,
                fontFamily: "monospace",
                textDecoration: "underline",
                cursor: "pointer",
              },
            },
            exampleLabel || "Load example dataset \u2192"
          )
        )
      : null
  );
}

// Actions tile for plot step
function ActionsPanel(props) {
  const children = [];
  if (props.onDownloadSvg) {
    children.push(
      React.createElement(
        "button",
        {
          key: "dl",
          onClick: function (e) {
            props.onDownloadSvg(e);
            flashSaved(e.currentTarget);
          },
          style: btnDownload,
        },
        "\u2B07 Download SVG"
      )
    );
  }
  if (props.onDownloadPng) {
    children.push(
      React.createElement(
        "button",
        {
          key: "dlpng",
          onClick: function (e) {
            props.onDownloadPng(e);
            flashSaved(e.currentTarget);
          },
          style: Object.assign({}, btnDownload, {
            background: "#e0f2fe",
            borderColor: "#7dd3fc",
            color: "#0369a1",
          }),
        },
        "\u2B07 Download PNG"
      )
    );
  }
  if (props.extraButtons) {
    props.extraButtons.forEach(function (b, i) {
      children.push(
        React.createElement(
          "button",
          {
            key: "extra" + i,
            onClick: b.onClick,
            style: b.style || btnSecondary,
          },
          b.label
        )
      );
    });
  }
  children.push(
    React.createElement(
      "button",
      {
        key: "reset",
        onClick: props.onReset,
        style: btnDanger,
      },
      "\u21BA Start over"
    )
  );
  return React.createElement(
    "div",
    { style: sec },
    React.createElement(
      "p",
      {
        style: {
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          color: "#555",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        },
      },
      "Actions"
    ),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 6 } },
      children
    )
  );
}

// ── Long-format Pipeline Components ─────────────────────────────────────────

// Column role assignment editor (used in group plot long format)
function ColumnRoleEditor(props) {
  const headers = props.headers,
    rows = props.rows,
    colRoles = props.colRoles,
    colNames = props.colNames,
    onRoleChange = props.onRoleChange,
    onNameChange = props.onNameChange;
  return React.createElement(
    "div",
    { style: sec },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } },
      "Column roles"
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" } },
      Object.entries(roleColors).map(function (entry) {
        const r = entry[0],
          c = entry[1];
        return React.createElement(
          "span",
          {
            key: r,
            style: {
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              background: c,
              color: r === "ignore" ? "#666" : "#fff",
              fontWeight: 600,
            },
          },
          r
        );
      })
    ),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 8 } },
      headers.map(function (h, i) {
        const u = [];
        const seen = {};
        rows.forEach(function (r) {
          const v = r[i];
          if (!seen[v]) {
            seen[v] = true;
            u.push(v);
          }
        });
        const pv = u.slice(0, 5).join(", ") + (u.length > 5 ? " \u2026 (" + u.length + ")" : "");
        return React.createElement(
          "div",
          {
            key: "col-" + i,
            style: {
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "8px 12px",
              background: "#fff",
              borderRadius: 6,
              border: "2px solid " + (roleColors[colRoles[i]] || "#ccc"),
            },
          },
          React.createElement(
            "span",
            { style: { fontWeight: 700, color: "#333", minWidth: 20, fontSize: 12 } },
            "#" + (i + 1)
          ),
          React.createElement("input", {
            value: colNames[i],
            onChange: function (e) {
              onNameChange(i, e.target.value);
            },
            style: Object.assign({}, inp, { width: 120, fontWeight: 600 }),
          }),
          React.createElement(
            "select",
            {
              value: colRoles[i],
              onChange: function (e) {
                onRoleChange(i, e.target.value);
              },
              style: Object.assign({}, inp, {
                cursor: "pointer",
                fontWeight: 600,
                color: roleColors[colRoles[i]],
              }),
            },
            React.createElement("option", { value: "group" }, "group"),
            React.createElement("option", { value: "value" }, "value"),
            React.createElement("option", { value: "filter" }, "filter"),
            React.createElement("option", { value: "text" }, "text"),
            React.createElement("option", { value: "ignore" }, "ignore")
          ),
          React.createElement(
            "span",
            {
              style: {
                fontSize: 10,
                color: "#999",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            pv
          )
        );
      })
    )
  );
}

// Filter panel with checkboxes for each column
function FilterCheckboxPanel(props) {
  const headers = props.headers,
    colNames = props.colNames,
    colRoles = props.colRoles,
    filters = props.filters,
    filteredCount = props.filteredCount,
    totalCount = props.totalCount,
    onToggle = props.onToggle,
    onToggleAll = props.onToggleAll;
  return React.createElement(
    "div",
    {
      style: {
        flex: 1,
        borderRadius: 10,
        padding: 16,
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        display: "flex",
        flexDirection: "column",
      },
    },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#1d4ed8" } },
      "Filter rows (" + filteredCount + "/" + totalCount + ")"
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch", flex: 1 } },
      headers.map(function (h, i) {
        if (colRoles[i] === "ignore") return null;
        const u = filters[i] ? filters[i].unique : [];
        const isNumCol =
          u.length > 0 &&
          u.filter(function (v) {
            return isNumericValue(v);
          }).length /
            u.length >
            0.5;
        if (isNumCol && colRoles[i] !== "filter" && colRoles[i] !== "text") {
          return React.createElement(
            "div",
            {
              key: "col-" + i,
              style: {
                minWidth: 140,
                flex: 1,
                background: "#fff",
                borderRadius: 6,
                border: "1px solid #ddd",
                padding: 10,
              },
            },
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
              React.createElement(
                "p",
                { style: { fontSize: 11, fontWeight: 600, color: "#333", margin: 0 } },
                colNames[i]
              ),
              React.createElement(
                "button",
                {
                  onClick: function () {
                    onToggleAll(i, true);
                  },
                  style: {
                    fontSize: 9,
                    padding: "2px 6px",
                    background: "#eee",
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  },
                },
                "All"
              )
            ),
            React.createElement(
              "p",
              { style: { fontSize: 10, color: "#999", margin: "4px 0 0", fontStyle: "italic" } },
              "numeric \u2014 use axis range in plot"
            )
          );
        }
        return React.createElement(
          "div",
          {
            key: "col-" + i,
            style: {
              minWidth: 140,
              flex: 1,
              background: "#fff",
              borderRadius: 6,
              border: "1px solid #ddd",
              padding: 10,
            },
          },
          React.createElement(
            "p",
            { style: { fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 4 } },
            colNames[i]
          ),
          React.createElement(
            "div",
            { style: { display: "flex", gap: 6, marginBottom: 4 } },
            React.createElement(
              "button",
              {
                onClick: function () {
                  onToggleAll(i, true);
                },
                style: {
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "#eee",
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                },
              },
              "All"
            ),
            React.createElement(
              "button",
              {
                onClick: function () {
                  onToggleAll(i, false);
                },
                style: {
                  fontSize: 9,
                  padding: "2px 6px",
                  background: "#eee",
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "inherit",
                },
              },
              "None"
            )
          ),
          u.map(function (v) {
            const checked = filters[i] && filters[i].included ? filters[i].included.has(v) : false;
            return React.createElement(
              "label",
              {
                key: v,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  color: "#444",
                  cursor: "pointer",
                  marginBottom: 2,
                },
              },
              React.createElement("input", {
                type: "checkbox",
                checked: checked,
                onChange: function () {
                  onToggle(i, v);
                },
                style: { accentColor: "#648FFF" },
              }),
              v || React.createElement("em", { style: { color: "#bbb" } }, "(empty)")
            );
          })
        );
      })
    )
  );
}

// Rename values & reorder groups panel
function RenameReorderPanel(props) {
  const headers = props.headers,
    colNames = props.colNames,
    colRoles = props.colRoles,
    filters = props.filters,
    valueRenames = props.valueRenames,
    groupColIdx = props.groupColIdx,
    effectiveOrder = props.effectiveOrder,
    applyRename = props.applyRename,
    onRenameVal = props.onRenameVal,
    onReorder = props.onReorder,
    dragIdx = props.dragIdx,
    onDragStart = props.onDragStart,
    onDragEnd = props.onDragEnd;
  return React.createElement(
    "div",
    {
      style: {
        flex: 1,
        borderRadius: 10,
        padding: 16,
        border: "1px solid #ddd6fe",
        background: "#f5f3ff",
      },
    },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#6d28d9" } },
      "Rename values & reorder groups ",
      React.createElement(
        "span",
        { style: { fontSize: 10, color: "#a78bfa", fontWeight: 400 } },
        "(drag \u2630 to reorder groups on plot)"
      )
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: 16, flexWrap: "wrap" } },
      headers.map(function (h, i) {
        if (colRoles[i] !== "group" && colRoles[i] !== "filter") return null;
        const u = (filters[i] ? filters[i].unique : []).filter(function (v) {
          return filters[i] && filters[i].included && filters[i].included.has(v);
        });
        const isGrp = i === groupColIdx;
        const renamedU = u.map(function (v) {
          return { orig: v, renamed: applyRename(i, v) };
        });
        const orderedU =
          isGrp && effectiveOrder
            ? effectiveOrder
                .map(function (g) {
                  return renamedU.find(function (x) {
                    return x.renamed === g;
                  });
                })
                .filter(Boolean)
            : renamedU;
        const displayList = orderedU.length > 0 ? orderedU : renamedU;
        return React.createElement(
          "div",
          {
            key: "col-" + i,
            style: {
              minWidth: 200,
              background: "#fff",
              borderRadius: 6,
              border: "1px solid #ddd",
              padding: 10,
            },
          },
          React.createElement(
            "p",
            { style: { fontSize: 11, fontWeight: 600, color: "#333", marginBottom: 6 } },
            colNames[i]
          ),
          displayList.map(function (item, vi) {
            const v = item.orig;
            return React.createElement(
              "div",
              {
                key: v,
                draggable: isGrp,
                onDragStart: function () {
                  onDragStart(vi);
                },
                onDragOver: function (e) {
                  e.preventDefault();
                },
                onDrop: function () {
                  if (!isGrp || dragIdx === null || dragIdx === vi) {
                    onDragEnd();
                    return;
                  }
                  const cur = displayList.map(function (x) {
                    return x.renamed;
                  });
                  const moved = cur[dragIdx];
                  cur.splice(dragIdx, 1);
                  cur.splice(vi, 0, moved);
                  onReorder(cur);
                  onDragEnd();
                },
                onDragEnd: function () {
                  onDragEnd();
                },
                style: {
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  marginBottom: 3,
                  padding: "3px 4px",
                  borderRadius: 4,
                  background: isGrp && dragIdx === vi ? "#e0eaff" : "transparent",
                  cursor: isGrp ? "grab" : "default",
                  borderLeft: isGrp ? "3px solid #648FFF" : "3px solid transparent",
                },
              },
              isGrp
                ? React.createElement(
                    "span",
                    { style: { fontSize: 11, color: "#bbb", cursor: "grab" } },
                    "\u2630"
                  )
                : null,
              React.createElement(
                "span",
                {
                  style: {
                    fontSize: 10,
                    color: "#888",
                    minWidth: 55,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                v || "(empty)"
              ),
              React.createElement("span", { style: { fontSize: 10, color: "#bbb" } }, "\u2192"),
              React.createElement("input", {
                value: valueRenames[i] && valueRenames[i][v] != null ? valueRenames[i][v] : v,
                onChange: function (e) {
                  onRenameVal(i, v, e.target.value);
                },
                style: Object.assign({}, inp, { width: 100, fontSize: 11 }),
              })
            );
          })
        );
      })
    )
  );
}

// Summary stats table (used in group plot output step)
function StatsTable(props) {
  const stats = props.stats,
    groupLabel = props.groupLabel;
  if (!stats || stats.length === 0) return null;
  const headers = ["Group", "n", "Mean", "Median", "SD", "SEM", "Min", "Max"];
  return React.createElement(
    "div",
    { style: sec },
    React.createElement(
      "p",
      { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" } },
      'Summary \u2014 grouped by "' + groupLabel + '"'
    ),
    React.createElement(
      "div",
      { style: { overflowX: "auto" } },
      React.createElement(
        "table",
        { style: { borderCollapse: "collapse", fontSize: 12, width: "100%" } },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            { style: { borderBottom: "2px solid #ccc" } },
            headers.map(function (h) {
              return React.createElement(
                "th",
                {
                  key: h,
                  style: { padding: "4px 10px", textAlign: "left", color: "#666", fontWeight: 600 },
                },
                h
              );
            })
          )
        ),
        React.createElement(
          "tbody",
          null,
          stats.map(function (s, i) {
            return React.createElement(
              "tr",
              { key: s.name, style: { borderBottom: "1px solid #eee" } },
              React.createElement(
                "td",
                {
                  style: {
                    padding: "4px 10px",
                    fontWeight: 600,
                    color: PALETTE[i % PALETTE.length],
                  },
                },
                s.name
              ),
              React.createElement("td", { style: { padding: "4px 10px" } }, s.n),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.mean != null ? s.mean.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.median != null ? s.median.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.sd != null ? s.sd.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.sem != null ? s.sem.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.min != null ? s.min.toFixed(4) : "\u2014"
              ),
              React.createElement(
                "td",
                { style: { padding: "4px 10px" } },
                s.max != null ? s.max.toFixed(4) : "\u2014"
              )
            );
          })
        )
      )
    )
  );
}

// Condition/group color editor with ColorInput per group
function GroupColorEditor(props) {
  const groups = props.groups,
    onColorChange = props.onColorChange,
    onNameChange = props.onNameChange;
  const onToggle = props.onToggle;
  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 4 } },
    groups.map(function (g, i) {
      const enabled = g.enabled !== false;
      const children = [];
      if (onToggle) {
        children.push(
          React.createElement("input", {
            key: "cb",
            type: "checkbox",
            checked: enabled,
            onChange: function () {
              onToggle(i);
            },
            style: { accentColor: g.color, flexShrink: 0, cursor: "pointer" },
          })
        );
      }
      children.push(
        React.createElement(ColorInput, {
          key: "clr",
          value: g.color,
          onChange: function (c) {
            onColorChange(i, c);
          },
          size: 18,
        })
      );
      children.push(
        React.createElement("input", {
          key: "nm",
          value: g.displayName || g.name,
          onChange: function (e) {
            if (onNameChange) onNameChange(i, e.target.value);
          },
          style: {
            flex: 1,
            minWidth: 0,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            color: "#333",
            padding: "2px 4px",
            fontSize: 11,
            fontFamily: "inherit",
          },
        })
      );
      children.push(
        React.createElement(
          "span",
          { key: "n", style: { color: "#999", fontSize: 10, flexShrink: 0 } },
          "n=" + (g.stats ? g.stats.n : 0)
        )
      );
      return React.createElement(
        "div",
        {
          key: g.name,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 12,
            background: enabled ? "#f0f0f5" : "#fafafa",
            opacity: enabled ? 1 : 0.4,
            border: "1px solid #ccc",
          },
        },
        children
      );
    })
  );
}

// Style controls section (background, grid, grid color)
function BaseStyleControls(props) {
  const plotBg = props.plotBg,
    onPlotBgChange = props.onPlotBgChange,
    showGrid = props.showGrid,
    onShowGridChange = props.onShowGridChange,
    gridColor = props.gridColor,
    onGridColorChange = props.onGridColorChange;
  const children = [
    React.createElement(
      "div",
      {
        key: "bg",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
      React.createElement("span", { style: lbl }, "Background"),
      React.createElement(ColorInput, { value: plotBg, onChange: onPlotBgChange, size: 24 })
    ),
    React.createElement(
      "div",
      {
        key: "grid",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
      React.createElement("span", { style: lbl }, "Grid"),
      React.createElement("input", {
        type: "checkbox",
        checked: showGrid,
        onChange: function (e) {
          onShowGridChange(e.target.checked);
        },
        style: { accentColor: "#648FFF" },
      })
    ),
  ];
  if (showGrid) {
    children.push(
      React.createElement(
        "div",
        {
          key: "gc",
          style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
        },
        React.createElement("span", { style: lbl }, "Grid color"),
        React.createElement(ColorInput, { value: gridColor, onChange: onGridColorChange, size: 24 })
      )
    );
  }
  return children;
}

// ── Data Preview Table ──────────────────────────────────────────────────────

function DataPreview({ headers, rows, maxRows }) {
  const limit = maxRows || 10;
  const d = rows.slice(0, limit);
  return React.createElement(
    "div",
    { style: { overflowX: "auto", fontSize: 11, border: "1px solid #ddd", borderRadius: 6 } },
    React.createElement(
      "table",
      { style: { borderCollapse: "collapse", width: "100%", minWidth: 400 } },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          { style: { background: "#f0f0f5" } },
          React.createElement(
            "th",
            {
              style: { padding: "5px 8px", border: "1px solid #ddd", color: "#999", fontSize: 10 },
            },
            "#"
          ),
          ...headers.map((h, i) =>
            React.createElement(
              "th",
              {
                key: i,
                style: {
                  padding: "5px 8px",
                  border: "1px solid #ddd",
                  color: "#333",
                  fontWeight: 600,
                },
              },
              h
            )
          )
        )
      ),
      React.createElement(
        "tbody",
        null,
        ...d.map((r, ri) =>
          React.createElement(
            "tr",
            { key: ri },
            React.createElement(
              "td",
              {
                style: {
                  padding: "3px 8px",
                  border: "1px solid #eee",
                  color: "#bbb",
                  fontSize: 10,
                },
              },
              ri + 1
            ),
            ...r.map((v, ci) =>
              React.createElement(
                "td",
                { key: ci, style: { padding: "3px 8px", border: "1px solid #eee", color: "#444" } },
                v
              )
            )
          )
        )
      )
    ),
    rows.length > limit
      ? React.createElement(
          "p",
          { style: { padding: 6, fontSize: 11, color: "#999", textAlign: "center" } },
          `… ${rows.length - limit} more (${rows.length} total)`
        )
      : null
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error: error };
  }
  componentDidCatch(error, info) {
    this.setState({ info: info });
    if (typeof console !== "undefined" && console.error) {
      console.error("Tool crashed:", error, info);
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    const info = this.state.info;
    const msg = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : msg;
    const compStack = info && info.componentStack ? info.componentStack : "";
    const details = stack + (compStack ? "\n\nComponent stack:" + compStack : "");
    const reload = () => {
      if (typeof window !== "undefined" && window.location) window.location.reload();
    };
    const copy = () => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(details).catch(() => {});
      }
    };
    const toolName = this.props.toolName || "This tool";
    return React.createElement(
      "div",
      {
        role: "alert",
        style: {
          maxWidth: 720,
          margin: "40px auto",
          padding: 24,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#333",
        },
      },
      React.createElement(
        "h2",
        { style: { marginTop: 0, color: "#b00020", fontSize: 20 } },
        "Something went wrong"
      ),
      React.createElement(
        "p",
        { style: { fontSize: 14, lineHeight: 1.5 } },
        toolName +
          " hit an unexpected error and can't continue. Your data is still on your machine — nothing was sent anywhere. Try reloading; if it keeps crashing, use \u201cCopy error details\u201d and open an issue."
      ),
      React.createElement(
        "pre",
        {
          style: {
            background: "#fff4f4",
            border: "1px solid #f3c7c7",
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            color: "#7a0016",
            overflow: "auto",
            maxHeight: 200,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          },
        },
        msg
      ),
      React.createElement(
        "details",
        { style: { marginBottom: 16 } },
        React.createElement(
          "summary",
          { style: { cursor: "pointer", fontSize: 13, color: "#666" } },
          "Technical details"
        ),
        React.createElement(
          "pre",
          {
            style: {
              background: "#f7f7f7",
              border: "1px solid #eee",
              borderRadius: 6,
              padding: 12,
              fontSize: 11,
              color: "#555",
              overflow: "auto",
              maxHeight: 300,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              marginTop: 8,
            },
          },
          details
        )
      ),
      React.createElement(
        "div",
        { style: { display: "flex", gap: 10, flexWrap: "wrap" } },
        React.createElement(
          "button",
          { type: "button", onClick: reload, style: btnPrimary },
          "Reload tool"
        ),
        React.createElement(
          "button",
          { type: "button", onClick: copy, style: btnSecondary },
          "Copy error details"
        )
      )
    );
  }
}

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
// Kept plain JS (React.createElement, no JSX) so it can live in
// shared-components.js alongside the rest of the shared components.

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

// Given a list of {i, j} pairs, assign a vertical level (0 = lowest) to each
// so brackets at overlapping spans stack instead of colliding. Greedy by
// ascending span width. Exposed as a global so chart renderers can reuse
// the layout.
// Plain-text statistics report, rendered as fixed-width columns so it
// reads cleanly in any editor. Mirrors what the StatsTile shows on screen:
// per-group descriptives, Shapiro-Wilk, Levene, chosen test result, and
// the post-hoc pairs when k ≥ 3.
function _padR(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
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
          if (powerTwoSample(d, n, alpha, 2) >= target) { needed = n; break; }
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
    const ns = values.map(function (v) { return v.length; });
    if (ns.some(function (n) { return n < 2; })) return null;
    let ssW = 0,
      dfW = 0;
    for (let i = 0; i < kk; i++) {
      const m = means[i];
      for (let j = 0; j < values[i].length; j++) ssW += (values[i][j] - m) * (values[i][j] - m);
      dfW += values[i].length - 1;
    }
    const sp = dfW > 0 ? Math.sqrt(ssW / dfW) : 0;
    const f = fFromGroupMeans(means, sp);
    const nh = kk / ns.reduce(function (a, b) { return a + 1 / b; }, 0);
    const nEff = Math.max(2, Math.round(nh));
    const rows = alphas.map(function (alpha) {
      const achieved = powerAnova(f, nEff, alpha, kk);
      let needed = null;
      if (f > 0) {
        for (let n = 2; n <= 5000; n++) {
          if (powerAnova(f, n, alpha, kk) >= target) { needed = n; break; }
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
      .map((pr) => ({ ...pr, label: pStars(pr.p) }));
    return { kind: "brackets", pairs: all, groupNames: names };
  }, [showOnPlot, annotKind, k, testResult, postHocResult, names]);

  // Build a plain-text stats summary for display below the plot.
  const statsSummary = React.useMemo(function () {
    if (!showOnPlot || !chosenTest || !testResult || testResult.error) return null;
    const parts = [];
    parts.push((STATS_LABELS[chosenTest] || chosenTest) + ": " + _formatTestLine(chosenTest, testResult));
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
      parts.push("Effect size: " + powerResult.effectLabel + " = " + powerResult.effect.toFixed(3));
    }
    parts.push("n per group: " + names.map(function (n, i) { return n + "=" + values[i].length; }).join(", "));
    return parts.join("\n");
  }, [showOnPlot, chosenTest, testResult, k, postHocResult, postHocName, names, powerResult, values]);

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
  React.useEffect(function () {
    if (typeof onSummaryRef.current === "function") onSummaryRef.current(latestSummary.current);
  }, [summaryKey]);

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

  // ── Header row ────────────────────────────────────────────────────────────
  const headerEl = React.createElement(
    "div",
    { style: header, onClick: () => setOpen((o) => !o) },
    React.createElement("h3", { style: h3 }, "Statistical analysis"),
    React.createElement("span", { style: { fontSize: 12, color: "#888" } }, open ? "▾" : "▸")
  );

  if (!open) return React.createElement("div", { style: wrap }, headerEl);

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

  // ── Display-on-plot controls ──────────────────────────────────────────────
  const displayControls = React.createElement(
    "div",
    {
      style: {
        marginTop: 12,
        paddingTop: 10,
        borderTop: "1px dashed #ddd",
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
      : null
  );

  return React.createElement(
    "div",
    { style: wrap },
    headerEl,
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
      downloadReportBtn,
      displayControls
    )
  );
}
