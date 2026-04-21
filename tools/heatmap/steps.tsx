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
        hint="CSV · TSV · TXT — first column = row labels, first row = column labels, rest numeric · 2 MB max"
      />
      <HowToCard
        toolName="heatmap"
        title="Heatmap — How to use"
        subtitle="Upload wide-format matrix → optional normalisation & clustering → plot"
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
      </HowToCard>
    </div>
  );
}
