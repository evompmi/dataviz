// shared-color-input.js — plain JS, no JSX
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
  // Only sync local text from parent `value` when the current text doesn't
  // already normalise to that value. Without this guard, typing `#abc` would
  // commit `#aabbcc` upstream, which round-trips back through this effect and
  // rewrites the text field to the 6-char form mid-keystroke — the cursor
  // jumps and the user's `#abc` shorthand gets auto-expanded against their
  // will. With the guard, external value changes (preset swap, palette reset)
  // still sync, but self-commits don't clobber what the user typed.
  React.useEffect(() => {
    if (normalizeHexColor(text) !== value) setText(value);
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
        border: "1px solid var(--border-strong)",
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
        border: "1px solid var(--border-strong)",
        borderRadius: 4,
        padding: "2px 5px",
        color: "var(--text)",
        background: "var(--surface)",
      },
    })
  );
}
