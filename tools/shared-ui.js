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

// Slider with label + value display on top, range input below.
//
// Wrapped in React.memo with a custom comparator that intentionally ignores
// the `onChange` prop. Without this, dragging one slider re-renders every
// other slider in the same sidebar (sliders all live under the same parent
// reducer), because each call site passes an inline `onChange={(v) => updVis(
// {...})}` that gets a fresh function reference every render.
//
// Ignoring onChange is safe HERE because every call site closes the inline
// arrow over a `useReducer` dispatch (or other stable setter) plus a literal
// patch object — no captured state that could go stale between renders. If a
// future caller ever needs onChange to capture mutable state, switch back to
// React's default shallow compare and useCallback at the call sites.
function _SliderControlImpl(props) {
  const label = props.label,
    value = props.value,
    displayValue = props.displayValue,
    min = props.min,
    max = props.max,
    step = props.step,
    onChange = props.onChange;
  var dv = displayValue != null ? displayValue : value;
  var pct = ((value - min) / (max - min)) * 100;
  var grad =
    "linear-gradient(to right, var(--accent-primary) " +
    pct +
    "%, var(--slider-track) " +
    pct +
    "%)";
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
      style: { width: "100%", background: grad },
    })
  );
}
// `var` (not `const`) so the binding lands on the script-tag global, the same
// way every other shared-*.js export does. Tools consume SliderControl as a
// global symbol; a top-level `const` would scope it to the script and break
// downstream tool .tsx files.
var SliderControl = React.memo(_SliderControlImpl, function (prev, next) {
  return (
    prev.value === next.value &&
    prev.min === next.min &&
    prev.max === next.max &&
    prev.step === next.step &&
    prev.label === next.label &&
    prev.displayValue === next.displayValue
  );
});

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
            background: currentStep === s ? "var(--step-active-bg)" : "var(--surface)",
            color:
              currentStep === s
                ? "var(--on-accent)"
                : enabled
                  ? "var(--text-faint)"
                  : "var(--border)",
            border:
              "1px solid " +
              (currentStep === s
                ? "var(--step-active-border)"
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
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        },
      },
      React.createElement(
        "div",
        { style: { flex: "1 1 auto", minWidth: 0 } },
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
      props.right
        ? React.createElement(
            "div",
            { style: { flex: "0 0 auto", display: "flex", alignItems: "center" } },
            props.right
          )
        : null
    )
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
//
// Every button gets a native `title` tooltip: SVG / PNG / Start-over carry
// fixed built-in strings (the output is the same across tools), and each
// `extraDownloads` entry may pass its own `title` to describe the file it
// emits (what's inside, how it's formatted) — that's where tool-specific
// context lives.
function ActionsPanel(props) {
  const downloads = [];
  if (props.onDownloadSvg) {
    downloads.push({
      label: "SVG",
      title: "Download the plot as SVG — vector graphics, editable in Inkscape or Illustrator",
      onClick: props.onDownloadSvg,
    });
  }
  if (props.onDownloadPng) {
    downloads.push({
      label: "PNG",
      title: "Download the plot as PNG — 2× raster at the plot's native resolution",
      onClick: props.onDownloadPng,
    });
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
        title: d.title || undefined,
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
        title: "Clear all data, controls, and current session — returns to the upload step",
        className: "dv-btn dv-btn-danger",
      },
      "\u21BA Start over"
    )
  );
}

// scrollIntoViewWithinAncestor — after a collapsible section expands, scroll
// just enough to bring `el`'s bottom (plus optional `extraBottom` px) into
// view, padded by `pad` px. Prefers the nearest scrollable ancestor (typically
// a sticky control-panel sidebar with its own overflow-y); falls back to
// scrolling the window when no such ancestor exists, so the helper works for
// tools like heatmap whose sidebar rides the page's own scroll.
//
// Deliberately does NOT use Element.scrollIntoView() — that bubbles up and
// scrolls every scrollable ancestor including the page even when the sidebar
// alone could satisfy the request. This helper picks ONE scroll container and
// only moves that one.
//
// Clamps the scroll so the panel's own top never moves out of view.
function scrollIntoViewWithinAncestor(el, pad, extraBottom) {
  if (!el) return;
  const padding = pad == null ? 8 : pad;
  const extra = extraBottom || 0;
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const ov = style.overflowY;
    if ((ov === "auto" || ov === "scroll") && parent.scrollHeight > parent.clientHeight) {
      const parentRect = parent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const revealBottom = elRect.bottom + extra;
      if (revealBottom > parentRect.bottom - padding) {
        const delta = revealBottom - parentRect.bottom + padding;
        const maxDelta = elRect.top - parentRect.top - padding;
        parent.scrollBy({ top: Math.min(delta, Math.max(0, maxDelta)), behavior: "smooth" });
      } else if (elRect.top < parentRect.top + padding) {
        parent.scrollBy({ top: elRect.top - parentRect.top - padding, behavior: "smooth" });
      }
      return;
    }
    parent = parent.parentElement;
  }
  // No scrollable ancestor — the page itself is what scrolls (heatmap case).
  const elRect = el.getBoundingClientRect();
  const viewportBottom = window.innerHeight;
  const revealBottom = elRect.bottom + extra;
  if (revealBottom > viewportBottom - padding) {
    const delta = revealBottom - viewportBottom + padding;
    const maxDelta = Math.max(0, elRect.top - padding);
    window.scrollBy({ top: Math.min(delta, maxDelta), behavior: "smooth" });
  } else if (elRect.top < padding) {
    window.scrollBy({ top: elRect.top - padding, behavior: "smooth" });
  }
}

// scrollDisclosureIntoView — the disclosure-specific wrapper around
// scrollIntoViewWithinAncestor. Measures where the next section's header
// actually sits relative to the expanded section (accounting for whatever
// gap / margin sits between sibling tiles — varies from 0 to 10px across
// tools), and reveals its bottom edge PLUS ~14 px of clearance below so the
// next header lands comfortably inside the viewport instead of flush at the
// bottom. This is the shared "norm" for every ControlSection across the
// toolbox — callers just pass their section's root element.
//
// The trailing clearance is sized so the next header lands inside the
// viewport's comfortable reading zone rather than flush at the bottom edge.
// Combined with the default 8 px `pad`, the next header's bottom sits
// 40 + 8 = 48 px above the viewport bottom — enough empty space below the
// title to unambiguously read as "there's another tile below, click its
// header to open it" rather than "header partially clipped".
const DISCLOSURE_TRAILING_CLEARANCE = 40;
function scrollDisclosureIntoView(el, pad) {
  if (!el) return;
  const next = el.nextElementSibling;
  const nextHeader = next && next.firstElementChild;
  let extra = 0;
  if (nextHeader) {
    const elRect = el.getBoundingClientRect();
    const nhRect = nextHeader.getBoundingClientRect();
    // Reveal through nextHeader's bottom + a trailing clearance. Covers the
    // inter-tile gap exactly (whatever it is) plus margin for legibility.
    extra = Math.max(0, nhRect.bottom + DISCLOSURE_TRAILING_CLEARANCE - elRect.bottom);
  }
  scrollIntoViewWithinAncestor(el, pad == null ? 8 : pad, extra);
}
