// shared-ui.js — plain JS, no JSX
// Requires React, shared.js (toolIcon, flashSaved), components.css (dv-*
// classes), and shared-file-drop.js (FileDropZone) to be loaded globally
// before this script.

// ── Shared UI Components ─────────────────────────────────────────────────────

// NumberInput — compact numeric entry with −/+ buttons on either side
// replacing the native stacked spinner. Mimics the native <input type=
// "number"> API: `value`, `onChange(e)` where `e.target.value` is a string,
// plus `min`, `max`, `step`, `disabled`, `placeholder`, `className`, `style`,
// `inputStyle`. The −/+ buttons fire a synthetic event with the next value
// as a string so existing `(e) => setX(e.target.value)` handlers keep working.
//
// Press-and-hold: the button repeats at an accelerating cadence for as long
// as the pointer is held (first bump immediate, 400 ms before repeat kicks
// in, then 80 ms for a handful of ticks, then 40 ms). Release anywhere on
// the page stops the hold via a window-level pointerup listener, so the user
// can drag off the button mid-hold without breaking the gesture.
function NumberInput(props) {
  const value = props.value != null ? props.value : "";
  const onChange = props.onChange;
  const min = props.min != null ? Number(props.min) : null;
  const max = props.max != null ? Number(props.max) : null;
  const rawStep = props.step != null && props.step !== "any" ? Number(props.step) : 1;
  const step = isNaN(rawStep) || rawStep <= 0 ? 1 : rawStep;
  const disabled = !!props.disabled;
  const placeholder = props.placeholder;
  const className = "dv-num" + (disabled ? " dv-num-disabled" : "");

  // Hold state lives in a ref so setTimeout chains survive React re-renders
  // triggered by each fireChange. `holdRef.current` is an object per gesture:
  // { dir, next, timerId, onUp } — comparing identity in the tick lets us
  // bail out if a new hold has replaced the old one, or if stopRepeat cleared
  // it.
  const holdRef = React.useRef(null);

  const fireChange = function (newValueStr) {
    if (!onChange) return;
    onChange({ target: { value: newValueStr } });
  };

  const clamp = function (n) {
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    // Round to the step's decimal precision to avoid 0.1+0.2 float noise.
    const decimals = (String(step).split(".")[1] || "").length;
    return decimals ? Number(n.toFixed(decimals)) : n;
  };

  const numericValue = Number(value);
  const minusDisabled = disabled || (min != null && !isNaN(numericValue) && numericValue <= min);
  const plusDisabled = disabled || (max != null && !isNaN(numericValue) && numericValue >= max);

  const stopRepeat = function () {
    const state = holdRef.current;
    if (!state) return;
    if (state.timerId) clearTimeout(state.timerId);
    if (state.onUp && typeof window !== "undefined") {
      window.removeEventListener("pointerup", state.onUp);
      window.removeEventListener("pointercancel", state.onUp);
    }
    holdRef.current = null;
  };

  const startRepeat = function (dir) {
    if ((dir < 0 && minusDisabled) || (dir > 0 && plusDisabled)) return;
    // Seed from the current prop value; every subsequent tick walks our own
    // ref so we stay correct even if React hasn't flushed the re-render yet.
    const seed = isNaN(Number(value)) ? (min != null ? min : 0) : Number(value);
    const state = { dir: dir, next: seed, timerId: null, onUp: null };
    holdRef.current = state;

    const doStep = function () {
      if (holdRef.current !== state) return;
      const n = clamp(state.next + dir * step);
      state.next = n;
      fireChange(String(n));
      if ((dir < 0 && min != null && n <= min) || (dir > 0 && max != null && n >= max)) {
        stopRepeat();
      }
    };

    // First step fires immediately so a quick click still bumps once.
    doStep();
    if (holdRef.current !== state) return;

    let ticks = 0;
    const tick = function () {
      if (holdRef.current !== state) return;
      doStep();
      if (holdRef.current !== state) return;
      ticks += 1;
      const delay = ticks > 8 ? 40 : 80;
      state.timerId = setTimeout(tick, delay);
    };
    // 400 ms dwell before the repeat kicks in (standard stepper feel).
    state.timerId = setTimeout(tick, 400);

    // Release anywhere on the page ends the hold — survives the user
    // dragging off the button mid-gesture.
    state.onUp = function () {
      stopRepeat();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("pointerup", state.onUp);
      window.addEventListener("pointercancel", state.onUp);
    }
  };

  // Clean up if the component unmounts during a hold.
  React.useEffect(function () {
    return function () {
      stopRepeat();
    };
  }, []);

  const onMinusDown = function (e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    startRepeat(-1);
  };
  const onPlusDown = function (e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    startRepeat(1);
  };

  return React.createElement(
    "div",
    { className: className, style: props.style },
    React.createElement(
      "button",
      {
        type: "button",
        className: "dv-num-btn dv-num-btn-minus",
        onPointerDown: onMinusDown,
        disabled: minusDisabled,
        tabIndex: -1,
        "aria-label": "Decrement",
      },
      "\u2212"
    ),
    React.createElement("input", {
      type: "number",
      className: "dv-num-input",
      value: value,
      min: props.min,
      max: props.max,
      step: props.step != null ? props.step : 1,
      disabled: disabled,
      placeholder: placeholder,
      onChange: function (e) {
        fireChange(e.target.value);
      },
      style: props.inputStyle,
    }),
    React.createElement(
      "button",
      {
        type: "button",
        className: "dv-num-btn dv-num-btn-plus",
        onPointerDown: onPlusDown,
        disabled: plusDisabled,
        tabIndex: -1,
        "aria-label": "Increment",
      },
      "+"
    )
  );
}

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

// Page header with tool icon. The landing page owns the theme toggle in
// its top bar — we don't render a second one here.
function PageHeader(props) {
  return React.createElement(
    "div",
    {
      style: {
        marginBottom: 28,
        borderBottom: "1px solid var(--border-strong)",
        paddingBottom: 16,
      },
    },
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

// Actions tile for plot step. Renders a wrapping row of unified download chips
// (SVG / PNG / + any `extraDownloads` like CSV/TXT) followed by a full-width
// Start-over button. Each chip flex-grows so 1/2/3 fit evenly; a 4th wraps.
function ActionsPanel(props) {
  const downloads = [];
  if (props.onDownloadSvg) {
    downloads.push({ label: "SVG", onClick: props.onDownloadSvg });
  }
  if (props.onDownloadPng) {
    downloads.push({ label: "PNG", onClick: props.onDownloadPng });
  }
  if (props.extraDownloads) {
    props.extraDownloads.forEach(function (d) {
      downloads.push(d);
    });
  }
  const dlButtons = downloads.map(function (d, i) {
    return React.createElement(
      "button",
      {
        key: "dl" + i,
        onClick: function (e) {
          d.onClick(e);
          flashSaved(e.currentTarget);
        },
        className: "dv-btn dv-btn-dl",
        style: { flex: "1 1 0" },
      },
      "\u2B07 " + d.label
    );
  });
  return React.createElement(
    "div",
    { className: "dv-panel" },
    React.createElement(
      "p",
      {
        style: {
          margin: "0 0 8px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
        },
      },
      "Actions"
    ),
    dlButtons.length > 0
      ? React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 8,
            },
          },
          dlButtons
        )
      : null,
    React.createElement(
      "button",
      {
        onClick: props.onReset,
        className: "dv-btn dv-btn-danger",
      },
      "\u21BA Start over"
    )
  );
}
