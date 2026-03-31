// Minimal test harness — no dependencies, Node 14+
// Usage: require('./harness') then call test(), assert(), eq(), approx()

let _passed = 0, _failed = 0, _currentSuite = "";

function suite(name) {
  _currentSuite = name;
  console.log(`\n── ${name} ──`);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    _passed++;
  } catch (e) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${e.message}`);
    _failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `Expected ${b}\n       Got     ${a}`);
}

function approx(actual, expected, tol = 1e-9, msg) {
  if (Math.abs(actual - expected) > tol)
    throw new Error(msg || `Expected ≈${expected}, got ${actual}`);
}

function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg || "Expected function to throw");
}

function summary() {
  const total = _passed + _failed;
  console.log(`\n${"─".repeat(40)}`);
  console.log(`  ${_passed}/${total} passed${_failed > 0 ? `  (${_failed} FAILED)` : ""}`);
  if (_failed > 0) process.exit(1);
}

module.exports = { suite, test, assert, eq, approx, throws, summary };
