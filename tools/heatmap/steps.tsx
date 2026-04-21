// UploadStep for the Heatmap tool — presents the UploadPanel, a max-size
// hint, and the "How to use" info card. No local state; pure presentational
// wrapper fed by App. Relies on shared globals (UploadPanel, toolIcon)
// resolved through shared.bundle.js.

export function UploadStep({ sepOverride, setSepOverride, handleFileLoad, onLoadExample }) {
  return (
    <div>
      <UploadPanel
        sepOverride={sepOverride}
        onSepChange={setSepOverride}
        onFileLoad={handleFileLoad}
        onLoadExample={onLoadExample}
        exampleLabel="Example gene-expression matrix (500 genes × 6 samples)"
        hint="CSV · TSV · TXT — first column = row labels, first row = column labels, rest numeric"
      />
      <p
        style={{
          margin: "4px 0 12px",
          fontSize: 11,
          color: "var(--text-faint)",
          textAlign: "right",
        }}
      >
        ⚠ Max file size: 2 MB
      </p>
      <div
        style={{
          marginTop: 24,
          borderRadius: 14,
          overflow: "hidden",
          border: "2px solid var(--howto-border)",
          boxShadow: "var(--howto-shadow)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,var(--howto-header-from),var(--howto-header-to))",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {toolIcon("heatmap", 24, { circle: true })}
          <div>
            <div style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 15 }}>
              Heatmap — How to use
            </div>
            <div style={{ color: "var(--on-accent-muted)", fontSize: 11, marginTop: 2 }}>
              Upload wide-format matrix → optional normalisation & clustering → plot
            </div>
          </div>
        </div>
        <div
          style={{
            background: "var(--info-bg)",
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--info-text)",
                marginBottom: 6,
              }}
            >
              1 · Shape your file
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <li>First column: row labels (genes, samples, time-points, …)</li>
              <li>First row: column labels (treatments, replicates, conditions)</li>
              <li>
                Everything else: numeric values (blanks / non-numeric render as grey "NaN" cells)
              </li>
            </ul>
          </div>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--info-text)",
                marginBottom: 6,
              }}
            >
              2 · Explore it
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 11,
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <li>Z-score by row to compare patterns across genes of different baseline</li>
              <li>Toggle row / column clustering (Euclidean + UPGMA by default)</li>
              <li>Switch to a diverging palette (RdBu / bwr) when values are centred on 0</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
