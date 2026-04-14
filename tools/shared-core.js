// shared-core.js — plain JS, no JSX
// Requires React and shared.js (btnPrimary, btnSecondary) to be loaded
// globally before this script.

// ── Data Preview Table ──────────────────────────────────────────────────────

function DataPreview({ headers, rows, maxRows }) {
  const limit = maxRows || 10;
  const d = rows.slice(0, limit);
  return React.createElement(
    "div",
    {
      style: {
        overflowX: "auto",
        fontSize: 11,
        border: "1px solid var(--border)",
        borderRadius: 6,
      },
    },
    React.createElement(
      "table",
      { style: { borderCollapse: "collapse", width: "100%", minWidth: 400 } },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          { style: { background: "var(--surface-sunken)" } },
          React.createElement(
            "th",
            {
              style: {
                padding: "5px 8px",
                border: "1px solid var(--border)",
                color: "var(--text-faint)",
                fontSize: 10,
              },
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
                  border: "1px solid var(--border)",
                  color: "var(--text)",
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
                  border: "1px solid var(--border)",
                  color: "var(--text-faint)",
                  fontSize: 10,
                },
              },
              ri + 1
            ),
            ...r.map((v, ci) =>
              React.createElement(
                "td",
                {
                  key: ci,
                  style: {
                    padding: "3px 8px",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                  },
                },
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
          {
            style: {
              padding: 6,
              fontSize: 11,
              color: "var(--text-faint)",
              textAlign: "center",
            },
          },
          `… ${rows.length - limit} more (${rows.length} total)`
        )
      : null
  );
}

// ── Error Boundary ──────────────────────────────────────────────────────────

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
          color: "var(--text)",
        },
      },
      React.createElement(
        "h2",
        { style: { marginTop: 0, color: "var(--danger-text)", fontSize: 20 } },
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
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            color: "var(--danger-text)",
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
          { style: { cursor: "pointer", fontSize: 13, color: "var(--text-muted)" } },
          "Technical details"
        ),
        React.createElement(
          "pre",
          {
            style: {
              background: "var(--surface-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 12,
              fontSize: 11,
              color: "var(--text-muted)",
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
