// Re-exports parsing functions from shared-loader.
// These functions were moved from bargraph.html / boxplot.html into tools/shared.js
// during the deduplication refactor, so this file now simply forwards them.

const { detectHeader, parseRaw, guessColumnType, detectWideFormat } = require("./shared-loader");
module.exports = { detectHeader, parseRaw, guessColumnType, detectWideFormat };
