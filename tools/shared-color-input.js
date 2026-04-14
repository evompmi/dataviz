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
