// Re-exports parsing functions from shared-loader.
// These functions were moved from the tool HTML files into tools/shared.js
// during the deduplication refactor, so this file now simply forwards them.

const {
  detectHeader,
  parseRaw,
  guessColumnType,
  detectWideFormat,
  parseData,
  dataToColumns,
} = require("./shared-loader");
module.exports = {
  detectHeader,
  parseRaw,
  guessColumnType,
  detectWideFormat,
  parseData,
  dataToColumns,
};
