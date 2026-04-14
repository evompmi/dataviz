// shared-ui.js — plain JS, no JSX
// Requires React, shared.js (btnSecondary fallback for ActionsPanel, toolIcon,
// flashSaved), components.css (dv-* classes), and shared-file-drop.js
// (FileDropZone) to be loaded globally before this script.

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
      React.createElement("span", { className: "dv-label" }, label),
      React.createElement("span", { style: { fontSize: 10, color: "var(--text-faint)" } }, dv)
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
      style: { width: "100%", accentColor: "var(--accent-primary)" },
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
            background: currentStep === s ? "var(--accent-primary)" : "var(--surface)",
            color:
              currentStep === s
                ? "var(--on-accent)"
                : enabled
                  ? "var(--text-faint)"
                  : "var(--border)",
            border:
              "1px solid " +
              (currentStep === s
                ? "var(--accent-primary)"
                : enabled
                  ? "var(--border-strong)"
                  : "var(--border)"),
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
      className: "dv-panel",
      style: {
        background: "var(--warning-bg)",
        borderColor: "var(--warning-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
      },
    },
    React.createElement("span", { style: { fontSize: 18 } }, "\uD83D\uDD04"),
    React.createElement(
      "div",
      { style: { flex: 1 } },
      React.createElement(
        "p",
        { style: { margin: 0, fontSize: 12, color: "var(--warning-text)", fontWeight: 600 } },
        "Decimal commas automatically converted to dots"
      ),
      React.createElement(
        "p",
        { style: { margin: "2px 0 0", fontSize: 11, color: "var(--warning-text)", opacity: 0.85 } },
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
        background: "var(--danger-bg)",
        border: "1px solid var(--danger-border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      },
    },
    React.createElement("span", { style: { fontSize: 16 } }, "\uD83D\uDEAB"),
    React.createElement(
      "span",
      { style: { fontSize: 12, color: "var(--danger-text)", fontWeight: 600 } },
      props.error
    )
  );
}

// Page header with tool icon and a theme toggle in the top-right.
function PageHeader(props) {
  return React.createElement(
    "div",
    {
      style: {
        marginBottom: 28,
        borderBottom: "1px solid var(--border-strong)",
        paddingBottom: 16,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      },
    },
    React.createElement(
      "div",
      { style: { flex: 1, minWidth: 0 } },
      React.createElement(
        "h1",
        { style: { margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" } },
        toolIcon(props.toolName),
        props.title
      ),
      props.subtitle
        ? React.createElement(
            "p",
            { style: { margin: "4px 0 0", fontSize: 10, color: "var(--text-faint)" } },
            props.subtitle
          )
        : null
    ),
    React.createElement(ThemeToggle, null)
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
    { className: "dv-panel" },
    React.createElement(
      "div",
      {
        style: {
          marginBottom: 12,
          padding: "12px 16px",
          background: "var(--info-bg)",
          borderRadius: 8,
          border: "1.5px solid var(--info-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        },
      },
      React.createElement(
        "span",
        { style: { fontSize: 13, fontWeight: 600, color: "var(--accent-primary)" } },
        "1. Choose your column separator:"
      ),
      React.createElement(
        "select",
        {
          value: sepOverride,
          onChange: function (e) {
            onSepChange(e.target.value);
          },
          className: "dv-select-sep",
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
            { style: { fontSize: 11, color: "var(--danger-text)", fontWeight: 600 } },
            "\u26A0 Required before loading a file"
          )
        : null
    ),
    !sepOverride
      ? React.createElement(
          "div",
          {
            style: {
              border: "2px dashed var(--border-strong)",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--surface-sunken)",
              opacity: 0.5,
            },
          },
          React.createElement("div", { style: { fontSize: 40, marginBottom: 8 } }, "\uD83D\uDEAB"),
          React.createElement(
            "p",
            { style: { margin: 0, fontSize: 15, color: "var(--text-faint)" } },
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
              color: "var(--text-muted)",
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
                color: "var(--accent-primary)",
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
          className: "dv-btn dv-btn-download",
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
          className: "dv-btn dv-btn-download",
          style: {
            background: "var(--info-bg)",
            borderColor: "var(--info-border)",
            color: "var(--info-text)",
          },
        },
        "\u2B07 Download PNG"
      )
    );
  }
  if (props.extraButtons) {
    props.extraButtons.forEach(function (b, i) {
      const btnProps = {
        key: "extra" + i,
        onClick: b.onClick,
      };
      if (b.className) btnProps.className = b.className;
      if (b.style) btnProps.style = b.style;
      if (!b.className && !b.style) btnProps.style = btnSecondary;
      children.push(React.createElement("button", btnProps, b.label));
    });
  }
  children.push(
    React.createElement(
      "button",
      {
        key: "reset",
        onClick: props.onReset,
        className: "dv-btn dv-btn-danger",
      },
      "\u21BA Start over"
    )
  );
  return React.createElement(
    "div",
    { className: "dv-panel" },
    React.createElement(
      "p",
      {
        style: {
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
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
