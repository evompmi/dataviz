// Pure string-builders for the Heatmap tool — no React / DOM dependency.
// `buildHeatmapRScript` emits a self-contained .R file that reproduces the
// currently plotted heatmap with pheatmap (matrix literal + normalisation +
// clustering + palette all inlined). `buildCsvExport` turns the currently
// plotted (post-normalisation, post-reordering) matrix into the headers +
// rows arrays expected by `downloadCsv`.
//
// Consumes global helpers (COLOR_PALETTES, DIVERGING_PALETTES,
// sanitizeRString, formatRNumber) from shared.bundle.js — same way every
// other reports.ts does.

declare const COLOR_PALETTES: Record<string, string[]>;
declare const DIVERGING_PALETTES: Set<string>;
declare const sanitizeRString: (s: string) => string;
declare const formatRNumber: (v: number) => string;

export function buildHeatmapRScript({
  rawMatrix,
  normalization,
  rowMode,
  colMode,
  rowK,
  colK,
  kmeansSeed,
  distanceMetric,
  linkageMethod,
  palette,
  invertPalette,
  vmin,
  vmax,
  plotTitle,
  cellBorder,
}) {
  const { rowLabels, colLabels, matrix } = rawMatrix;
  const rowNamesR = "c(" + rowLabels.map((l) => `"${sanitizeRString(l)}"`).join(", ") + ")";
  const colNamesR = "c(" + colLabels.map((l) => `"${sanitizeRString(l)}"`).join(", ") + ")";
  const flat = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) flat.push(matrix[r][c]);
  }
  const dataRows = [];
  const perLine = colLabels.length;
  for (let i = 0; i < flat.length; i += perLine) {
    dataRows.push(
      "    " +
        flat
          .slice(i, i + perLine)
          .map(formatRNumber)
          .join(", ")
    );
  }
  const dataLiteral = "c(\n" + dataRows.join(",\n") + "\n  )";
  const paletteBase = COLOR_PALETTES[palette] || COLOR_PALETTES.viridis;
  const stops = invertPalette ? [...paletteBase].reverse() : paletteBase;
  const stopsR = "c(" + stops.map((c) => `"${c}"`).join(", ") + ")";

  // pheatmap speaks "correlation" directly; map our metric accordingly.
  const pheatmapDist =
    distanceMetric === "correlation" ? "correlation" : distanceMetric || "euclidean";

  const lines = [];
  lines.push("# Dataviz Toolbox — Heatmap R script export");
  lines.push("# Generated " + new Date().toISOString());
  lines.push("#");
  lines.push("# Reproduces the normalisation + hierarchical clustering");
  lines.push("# you saw in the browser tool, using the {pheatmap} package.");
  lines.push("# To swap in your own data, replace the matrix block below with:");
  lines.push('#   mat <- as.matrix(read.csv("your_file.csv", row.names = 1,');
  lines.push("#                             check.names = FALSE))");
  lines.push("");
  lines.push('if (!requireNamespace("pheatmap", quietly = TRUE))');
  lines.push('  install.packages("pheatmap")');
  lines.push("library(pheatmap)");
  lines.push("");
  lines.push("# ── Raw data ───────────────────────────────────────────────────────────────");
  lines.push("row_labels <- " + rowNamesR);
  lines.push("col_labels <- " + colNamesR);
  lines.push("mat <- matrix(");
  lines.push("  " + dataLiteral + ",");
  lines.push("  nrow = length(row_labels),");
  lines.push("  byrow = TRUE,");
  lines.push("  dimnames = list(row_labels, col_labels)");
  lines.push(")");
  lines.push("");
  lines.push("# ── Normalisation ──────────────────────────────────────────────────────────");
  lines.push('# Toolbox setting: "' + normalization + '"');
  if (normalization === "zrow") {
    lines.push("# Z-score by row: (x - rowMean) / rowSD");
    lines.push("mat <- t(scale(t(mat)))");
  } else if (normalization === "zcol") {
    lines.push("# Z-score by column: (x - colMean) / colSD");
    lines.push("mat <- scale(mat)");
  } else if (normalization === "log2") {
    lines.push("# log2(x + 1) — gentle compression for right-skewed data");
    lines.push("mat <- log2(mat + 1)");
  } else {
    lines.push("# No normalisation — plot raw values.");
  }
  lines.push("");
  lines.push("# ── Clustering ─────────────────────────────────────────────────────────────");
  const rowUsesK = rowMode === "kmeans";
  const colUsesK = colMode === "kmeans";
  lines.push("# Rows: " + rowMode + (rowUsesK ? ` (k = ${rowK})` : ""));
  lines.push("# Columns: " + colMode + (colUsesK ? ` (k = ${colK})` : ""));
  if (rowUsesK || colUsesK) {
    lines.push("# K-means reorders the matrix by cluster id before plotting; pheatmap then");
    lines.push("# renders the rows/columns as-is (cluster_rows = FALSE for the k-means axis).");
    lines.push("set.seed(" + (kmeansSeed || 1) + ")");
    if (rowUsesK) {
      lines.push(
        "row_km <- kmeans(mat, centers = " +
          rowK +
          ', nstart = 8, iter.max = 100, algorithm = "Hartigan-Wong")'
      );
      lines.push("row_order <- order(row_km$cluster)");
      lines.push("mat <- mat[row_order, , drop = FALSE]");
      lines.push("row_clusters <- row_km$cluster[row_order]");
    }
    if (colUsesK) {
      lines.push(
        "col_km <- kmeans(t(mat), centers = " +
          colK +
          ', nstart = 8, iter.max = 100, algorithm = "Hartigan-Wong")'
      );
      lines.push("col_order <- order(col_km$cluster)");
      lines.push("mat <- mat[, col_order, drop = FALSE]");
      lines.push("col_clusters <- col_km$cluster[col_order]");
    }
  }
  if (rowMode === "hierarchical" || colMode === "hierarchical") {
    lines.push(
      '# Hierarchical settings: distance = "' +
        (distanceMetric || "euclidean") +
        '", linkage = "' +
        (linkageMethod || "average") +
        '"'
    );
  }
  lines.push("");
  lines.push("# ── Colour scale ───────────────────────────────────────────────────────────");
  lines.push(
    "# Palette: " +
      palette +
      (DIVERGING_PALETTES.has(palette) ? " (diverging)" : " (sequential)") +
      (invertPalette ? " — inverted" : "")
  );
  lines.push("palette_stops <- " + stopsR);
  lines.push("heat_colors <- colorRampPalette(palette_stops)(100)");
  lines.push(
    "breaks <- seq(" + formatRNumber(vmin) + ", " + formatRNumber(vmax) + ", length.out = 101)"
  );
  lines.push("");
  lines.push("# ── Plot ───────────────────────────────────────────────────────────────────");
  lines.push("pheatmap(");
  lines.push("  mat,");
  // K-means already reordered the matrix — let pheatmap render that axis as-is.
  lines.push("  cluster_rows = " + (rowMode === "hierarchical" ? "TRUE" : "FALSE") + ",");
  lines.push("  cluster_cols = " + (colMode === "hierarchical" ? "TRUE" : "FALSE") + ",");
  if (rowMode === "hierarchical" || colMode === "hierarchical") {
    lines.push('  clustering_distance_rows = "' + pheatmapDist + '",');
    lines.push('  clustering_distance_cols = "' + pheatmapDist + '",');
    lines.push('  clustering_method = "' + (linkageMethod || "average") + '",');
  }
  lines.push("  color = heat_colors,");
  lines.push("  breaks = breaks,");
  const borderR = cellBorder && cellBorder.on ? `"${cellBorder.color}"` : "NA";
  lines.push("  border_color = " + borderR + ",");
  if (plotTitle) {
    lines.push('  main = "' + sanitizeRString(plotTitle) + '",');
  }
  if (rowUsesK) {
    lines.push("  annotation_row = data.frame(cluster = factor(row_clusters),");
    lines.push("                              row.names = rownames(mat)),");
  }
  if (colUsesK) {
    lines.push("  annotation_col = data.frame(cluster = factor(col_clusters),");
    lines.push("                              row.names = colnames(mat)),");
  }
  lines.push("  show_rownames = TRUE,");
  lines.push("  show_colnames = TRUE");
  lines.push(")");
  lines.push("");
  return lines.join("\n");
}

export function buildCsvExport({
  rowLabels,
  colLabels,
  matrix,
  rowOrder,
  colOrder,
  rowClusterIds,
  colClusterIds,
}) {
  const hasRowClusters = Array.isArray(rowClusterIds);
  const hasColClusters = Array.isArray(colClusterIds);
  const headers = [""]
    .concat(colOrder.map((i) => colLabels[i]))
    .concat(hasRowClusters ? ["cluster"] : []);
  const rows = rowOrder.map((ri) => {
    const cells = colOrder.map((ci) => {
      const v = matrix[ri][ci];
      return Number.isFinite(v) ? String(v) : "";
    });
    const base = [rowLabels[ri]].concat(cells);
    if (hasRowClusters) {
      const cid = rowClusterIds[ri];
      base.push(cid != null ? String(cid + 1) : "");
    }
    return base;
  });
  if (hasColClusters) {
    const clusterRow = ["cluster"]
      .concat(
        colOrder.map((ci) => (colClusterIds[ci] != null ? String(colClusterIds[ci] + 1) : ""))
      )
      .concat(hasRowClusters ? [""] : []);
    rows.unshift(clusterRow);
  }
  return { headers, rows };
}
