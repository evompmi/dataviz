// shared-file-drop.js — plain JS, no JSX
// Requires React to be loaded globally before this script.

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
          border: `2px dashed ${drag ? "var(--accent-primary)" : sizeError ? "var(--danger-text)" : "var(--text-faint)"}`,
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
        { style: { margin: 0, fontSize: 15, color: "var(--text-muted)" } },
        "Drop your data file here, or click to browse"
      ),
      React.createElement(
        "p",
        { style: { margin: "4px 0 0", fontSize: 12, color: "var(--text-faint)" } },
        hint
      )
    ),
    sizeError &&
      React.createElement(
        "div",
        {
          style: {
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          },
        },
        React.createElement("span", { style: { fontSize: 16 } }, "🚫"),
        React.createElement(
          "span",
          { style: { fontSize: 12, color: "var(--danger-text)", fontWeight: 600 } },
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
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          },
        },
        React.createElement("span", { style: { fontSize: 16 } }, "⚠️"),
        React.createElement(
          "span",
          { style: { fontSize: 12, color: "var(--warning-text)" } },
          sizeWarn
        )
      )
  );
}
