// molarity.jsx — editable source. Run `npm run build` to compile to molarity.js
// Do NOT edit the .js file directly.

const { useState, useMemo, useCallback, useRef } = React;

// ── Unit definitions & conversions ──────────────────────────────────────────

const CONC_UNITS = [
  { label: "M", factor: 1 },
  { label: "mM", factor: 1e-3 },
  { label: "µM", factor: 1e-6 },
  { label: "nM", factor: 1e-9 },
];

const VOL_UNITS = [
  { label: "L", factor: 1 },
  { label: "mL", factor: 1e-3 },
  { label: "µL", factor: 1e-6 },
];

const MASS_UNITS = [
  { label: "g", factor: 1 },
  { label: "mg", factor: 1e-3 },
  { label: "µg", factor: 1e-6 },
];

function toBase(value, unit, units) {
  const u = units.find((u) => u.label === unit);
  return value * (u ? u.factor : 1);
}

function fromBase(value, unit, units) {
  const u = units.find((u) => u.label === unit);
  return value / (u ? u.factor : 1);
}

function formatResult(val) {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return "—";
  if (val === 0) return "0";
  const abs = Math.abs(val);
  if (abs >= 1e6 || abs < 0.001) return val.toExponential(4);
  if (abs >= 100) return val.toFixed(2);
  if (abs >= 1) return val.toFixed(4);
  return val.toPrecision(4);
}

// ── Numeric input with unit selector ────────────────────────────────────────

function UnitInput({
  label,
  value,
  onValueChange,
  unit,
  onUnitChange,
  units,
  disabled,
  highlight,
  placeholder,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <label style={{ ...lbl, width: 150, flexShrink: 0, marginBottom: 0, fontWeight: 600 }}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder || ""}
        style={{
          ...inp,
          width: 130,
          fontSize: 13,
          textAlign: "left",
          background: disabled ? "#f0fdf4" : "#fff",
          fontWeight: 400,
          color: "#333",
          border: "1px solid #ccc",
        }}
      />
      <select
        value={unit}
        onChange={(e) => onUnitChange(e.target.value)}
        style={{ ...selStyle, minWidth: 60 }}
      >
        {units.map((u) => (
          <option key={u.label} value={u.label}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Molarity Mode ───────────────────────────────────────────────────────────

function MolarityMode() {
  const [mw, setMw] = useState("");
  const [mass, setMass] = useState("");
  const [massUnit, setMassUnit] = useState("g");
  const [vol, setVol] = useState("");
  const [volUnit, setVolUnit] = useState("mL");
  const [conc, setConc] = useState("");
  const [concUnit, setConcUnit] = useState("mM");
  const [solveFor, setSolveFor] = useState("conc");

  const result = useMemo(() => {
    const mwVal = parseFloat(mw);
    const massVal = parseFloat(mass);
    const volVal = parseFloat(vol);
    const concVal = parseFloat(conc);

    if (solveFor === "conc") {
      if (!isFinite(mwVal) || !isFinite(massVal) || !isFinite(volVal) || mwVal <= 0 || volVal <= 0)
        return null;
      const massG = toBase(massVal, massUnit, MASS_UNITS);
      const volL = toBase(volVal, volUnit, VOL_UNITS);
      const moles = massG / mwVal;
      const concM = moles / volL;
      return { value: fromBase(concM, concUnit, CONC_UNITS), label: concUnit };
    }
    if (solveFor === "mass") {
      if (!isFinite(mwVal) || !isFinite(concVal) || !isFinite(volVal) || mwVal <= 0 || volVal <= 0)
        return null;
      const concM = toBase(concVal, concUnit, CONC_UNITS);
      const volL = toBase(volVal, volUnit, VOL_UNITS);
      const moles = concM * volL;
      const massG = moles * mwVal;
      return { value: fromBase(massG, massUnit, MASS_UNITS), label: massUnit };
    }
    if (solveFor === "volume") {
      if (
        !isFinite(mwVal) ||
        !isFinite(concVal) ||
        !isFinite(massVal) ||
        mwVal <= 0 ||
        concVal <= 0
      )
        return null;
      const concM = toBase(concVal, concUnit, CONC_UNITS);
      const massG = toBase(massVal, massUnit, MASS_UNITS);
      const moles = massG / mwVal;
      const volL = moles / concM;
      return { value: fromBase(volL, volUnit, VOL_UNITS), label: volUnit };
    }
    if (solveFor === "mw") {
      if (
        !isFinite(massVal) ||
        !isFinite(concVal) ||
        !isFinite(volVal) ||
        concVal <= 0 ||
        volVal <= 0
      )
        return null;
      const concM = toBase(concVal, concUnit, CONC_UNITS);
      const volL = toBase(volVal, volUnit, VOL_UNITS);
      const massG = toBase(massVal, massUnit, MASS_UNITS);
      const moles = concM * volL;
      const mwCalc = massG / moles;
      return { value: mwCalc, label: "g/mol" };
    }
    return null;
  }, [mw, mass, massUnit, vol, volUnit, conc, concUnit, solveFor]);

  const fields = [
    { key: "mw", label: "Mol. weight (g/mol)" },
    { key: "mass", label: "Mass" },
    { key: "volume", label: "Volume" },
    { key: "conc", label: "Concentration" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "stretch" }}>
        <div
          style={{
            ...sec,
            flex: "0 0 calc((100% - 20px) / 3)",
            marginBottom: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" }}>
            Solve for:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fields.map((f) => (
              <button
                key={f.key}
                onClick={() => setSolveFor(f.key)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: solveFor === f.key ? "#648FFF" : "#fff",
                  color: solveFor === f.key ? "#fff" : "#888",
                  border: "1px solid " + (solveFor === f.key ? "#648FFF" : "#ccc"),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...sec, flex: 1, marginBottom: 0 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" }}>
            Inputs:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <label style={{ ...lbl, width: 150, flexShrink: 0, marginBottom: 0, fontWeight: 600 }}>
              MW (g/mol)
            </label>
            <input
              type="number"
              value={solveFor === "mw" ? "" : mw}
              onChange={(e) => setMw(e.target.value)}
              disabled={solveFor === "mw"}
              placeholder={solveFor === "mw" ? "calculated" : ""}
              style={{
                ...inp,
                width: 130,
                fontSize: 13,
                textAlign: "left",
                background: solveFor === "mw" ? "#f0fdf4" : "#fff",
                fontWeight: 400,
              }}
            />
            <span style={{ fontSize: 12, color: "#999" }}>g/mol</span>
          </div>

          <UnitInput
            label="Mass"
            value={solveFor === "mass" ? "" : mass}
            onValueChange={setMass}
            unit={massUnit}
            onUnitChange={setMassUnit}
            units={MASS_UNITS}
            disabled={solveFor === "mass"}
            highlight={false}
            placeholder={solveFor === "mass" ? "calculated" : ""}
          />
          <UnitInput
            label="Volume"
            value={solveFor === "volume" ? "" : vol}
            onValueChange={setVol}
            unit={volUnit}
            onUnitChange={setVolUnit}
            units={VOL_UNITS}
            disabled={solveFor === "volume"}
            highlight={false}
            placeholder={solveFor === "volume" ? "calculated" : ""}
          />
          <UnitInput
            label="Concentration"
            value={solveFor === "conc" ? "" : conc}
            onValueChange={setConc}
            unit={concUnit}
            onUnitChange={setConcUnit}
            units={CONC_UNITS}
            disabled={solveFor === "conc"}
            highlight={false}
            placeholder={solveFor === "conc" ? "calculated" : ""}
          />

          {result && (
            <div
              style={{
                background: "#f0fdf4",
                borderRadius: 8,
                border: "1px solid #86efac",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                marginTop: 10,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
                {formatResult(result.value)}
              </span>
              <span style={{ fontSize: 14, color: "#16a34a", fontWeight: 600 }}>
                {result.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dilution Mode ───────────────────────────────────────────────────────────

function DilutionMode() {
  const [c1, setC1] = useState("");
  const [c1Unit, setC1Unit] = useState("mM");
  const [v1, setV1] = useState("");
  const [v1Unit, setV1Unit] = useState("µL");
  const [c2, setC2] = useState("");
  const [c2Unit, setC2Unit] = useState("µM");
  const [v2, setV2] = useState("");
  const [v2Unit, setV2Unit] = useState("mL");
  const [solveFor, setSolveFor] = useState("v1");

  const result = useMemo(() => {
    const c1Val = parseFloat(c1);
    const v1Val = parseFloat(v1);
    const c2Val = parseFloat(c2);
    const v2Val = parseFloat(v2);

    // C1*V1 = C2*V2, all converted to base units (M, L)
    if (solveFor === "c1") {
      if (!isFinite(v1Val) || !isFinite(c2Val) || !isFinite(v2Val) || v1Val <= 0) return null;
      const base =
        (toBase(c2Val, c2Unit, CONC_UNITS) * toBase(v2Val, v2Unit, VOL_UNITS)) /
        toBase(v1Val, v1Unit, VOL_UNITS);
      return { value: fromBase(base, c1Unit, CONC_UNITS), label: c1Unit };
    }
    if (solveFor === "v1") {
      if (!isFinite(c1Val) || !isFinite(c2Val) || !isFinite(v2Val) || c1Val <= 0) return null;
      const base =
        (toBase(c2Val, c2Unit, CONC_UNITS) * toBase(v2Val, v2Unit, VOL_UNITS)) /
        toBase(c1Val, c1Unit, CONC_UNITS);
      return { value: fromBase(base, v1Unit, VOL_UNITS), label: v1Unit };
    }
    if (solveFor === "c2") {
      if (!isFinite(c1Val) || !isFinite(v1Val) || !isFinite(v2Val) || v2Val <= 0) return null;
      const base =
        (toBase(c1Val, c1Unit, CONC_UNITS) * toBase(v1Val, v1Unit, VOL_UNITS)) /
        toBase(v2Val, v2Unit, VOL_UNITS);
      return { value: fromBase(base, c2Unit, CONC_UNITS), label: c2Unit };
    }
    if (solveFor === "v2") {
      if (!isFinite(c1Val) || !isFinite(v1Val) || !isFinite(c2Val) || c2Val <= 0) return null;
      const base =
        (toBase(c1Val, c1Unit, CONC_UNITS) * toBase(v1Val, v1Unit, VOL_UNITS)) /
        toBase(c2Val, c2Unit, CONC_UNITS);
      return { value: fromBase(base, v2Unit, VOL_UNITS), label: v2Unit };
    }
    return null;
  }, [c1, c1Unit, v1, v1Unit, c2, c2Unit, v2, v2Unit, solveFor]);

  const fields = [
    { key: "c1", label: "C1 (stock conc.)" },
    { key: "v1", label: "V1 (stock vol.)" },
    { key: "c2", label: "C2 (final conc.)" },
    { key: "v2", label: "V2 (final vol.)" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "stretch" }}>
        <div
          style={{
            ...sec,
            flex: "0 0 calc((100% - 20px) / 3)",
            marginBottom: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#555" }}>
            C1 × V1 = C2 × V2
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "#999" }}>Solve for:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fields.map((f) => (
              <button
                key={f.key}
                onClick={() => setSolveFor(f.key)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: solveFor === f.key ? "#648FFF" : "#fff",
                  color: solveFor === f.key ? "#fff" : "#888",
                  border: "1px solid " + (solveFor === f.key ? "#648FFF" : "#ccc"),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...sec, flex: 1, marginBottom: 0 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#555" }}>
            Inputs:
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 600, color: "#648FFF" }}>
            Stock solution
          </p>
          <UnitInput
            label="C1 (concentration)"
            value={solveFor === "c1" ? "" : c1}
            onValueChange={setC1}
            unit={c1Unit}
            onUnitChange={setC1Unit}
            units={CONC_UNITS}
            disabled={solveFor === "c1"}
            placeholder={solveFor === "c1" ? "calculated" : ""}
          />
          <UnitInput
            label="V1 (volume)"
            value={solveFor === "v1" ? "" : v1}
            onValueChange={setV1}
            unit={v1Unit}
            onUnitChange={setV1Unit}
            units={VOL_UNITS}
            disabled={solveFor === "v1"}
            placeholder={solveFor === "v1" ? "calculated" : ""}
          />
          <p style={{ margin: "12px 0 12px", fontSize: 12, fontWeight: 600, color: "#648FFF" }}>
            Final solution
          </p>
          <UnitInput
            label="C2 (concentration)"
            value={solveFor === "c2" ? "" : c2}
            onValueChange={setC2}
            unit={c2Unit}
            onUnitChange={setC2Unit}
            units={CONC_UNITS}
            disabled={solveFor === "c2"}
            placeholder={solveFor === "c2" ? "calculated" : ""}
          />
          <UnitInput
            label="V2 (volume)"
            value={solveFor === "v2" ? "" : v2}
            onValueChange={setV2}
            unit={v2Unit}
            onUnitChange={setV2Unit}
            units={VOL_UNITS}
            disabled={solveFor === "v2"}
            placeholder={solveFor === "v2" ? "calculated" : ""}
          />

          {result && (
            <div
              style={{
                background: "#f0fdf4",
                borderRadius: 8,
                border: "1px solid #86efac",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                marginTop: 10,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
                {formatResult(result.value)}
              </span>
              <span style={{ fontSize: 14, color: "#16a34a", fontWeight: 600 }}>
                {result.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Batch Mode ──────────────────────────────────────────────────────────────

const BATCH_EXAMPLE = `Name\tMW\tConcentration\tVolume
NaCl\t58.44\t150 mM\t500 mL
Sucrose\t342.3\t0.5 M\t1 L
Kanamycin\t484.5\t50 mg/mL\t100 mL`;

// Parse a value+unit string like "150 mM", "0.5 M", "500 mL", "50 mg/mL"
function parseValueUnit(str, defaultUnit, unitList) {
  str = str.trim();
  // Try matching number + optional space + unit
  const m = str.match(/^([\d.eE+-]+)\s*(.+)?$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!isFinite(val)) return null;
  const unitStr = (m[2] || defaultUnit).trim();
  const found = unitList.find((u) => u.label === unitStr);
  if (found) return { value: val, unit: unitStr };
  return null;
}

// Special: also handle mg/mL, µg/µL etc (mass/vol concentration)
function parseMassVolConc(str) {
  str = str.trim();
  const m = str.match(/^([\d.eE+-]+)\s*(mg\/mL|µg\/µL|g\/L|µg\/mL|mg\/L|g\/mL)$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!isFinite(val)) return null;
  // Convert mass/vol to g/L
  const unit = m[2].toLowerCase();
  const conversions = {
    "g/l": 1,
    "mg/ml": 1,
    "µg/µl": 1,
    "µg/ml": 1e-3,
    "mg/l": 1e-3,
    "g/ml": 1e3,
  };
  const gPerL = val * (conversions[unit] || 1);
  return { gPerL, originalUnit: m[2], originalValue: val };
}

function BatchMode() {
  const [raw, setRaw] = useState("");
  const [sepOverride, setSepOverride] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const compute = useCallback(() => {
    setError(null);
    setResults(null);
    if (!raw.trim()) {
      setError("Paste your data above.");
      return;
    }

    const { headers, rows, hasHeader } = parseRaw(raw, sepOverride);
    if (rows.length === 0) {
      setError("No data rows found.");
      return;
    }
    if (headers.length < 4) {
      setError("Need at least 4 columns: Name, MW, Concentration, Volume.");
      return;
    }

    const output = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = r[0] || "Row " + (i + 1);
      const mwVal = parseFloat(r[1]);
      if (!isFinite(mwVal) || mwVal <= 0) {
        output.push({ name, error: "Invalid MW: " + r[1] });
        continue;
      }

      // Parse concentration — could be molar or mass/vol
      const concStr = r[2];
      const volStr = r[3];

      const volParsed = parseValueUnit(volStr, "mL", VOL_UNITS);
      if (!volParsed) {
        output.push({ name, error: "Invalid volume: " + volStr });
        continue;
      }
      const volL = toBase(volParsed.value, volParsed.unit, VOL_UNITS);

      // Try molar concentration first
      const concParsed = parseValueUnit(concStr, "mM", CONC_UNITS);
      if (concParsed) {
        const concM = toBase(concParsed.value, concParsed.unit, CONC_UNITS);
        const moles = concM * volL;
        const massG = moles * mwVal;
        output.push({
          name,
          mw: mwVal,
          conc: concParsed.value + " " + concParsed.unit,
          vol: volParsed.value + " " + volParsed.unit,
          massG,
          massDisplay: formatMass(massG),
        });
        continue;
      }

      // Try mass/vol concentration
      const massVolParsed = parseMassVolConc(concStr);
      if (massVolParsed) {
        const massG = massVolParsed.gPerL * volL;
        output.push({
          name,
          mw: mwVal,
          conc: massVolParsed.originalValue + " " + massVolParsed.originalUnit,
          vol: volParsed.value + " " + volParsed.unit,
          massG,
          massDisplay: formatMass(massG),
        });
        continue;
      }

      output.push({ name, error: "Cannot parse concentration: " + concStr });
    }

    setResults(output);
  }, [raw, sepOverride]);

  const csvExport = useCallback(() => {
    if (!results) return;
    const hdrs = ["Name", "MW (g/mol)", "Target concentration", "Target volume", "Mass to weigh"];
    const csvRows = results.map((r) =>
      r.error
        ? [r.name, "", "", "", "ERROR: " + r.error]
        : [r.name, r.mw, r.conc, r.vol, r.massDisplay]
    );
    downloadCsv(hdrs, csvRows, "prep-sheet.csv");
  }, [results]);

  return (
    <div>
      <div style={sec}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#555" }}>
          Paste a table: Name, MW (g/mol), Concentration (with unit), Volume (with unit)
        </p>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "#999" }}>
          Units can be inline (e.g. "150 mM", "500 mL", "50 mg/mL"). Supported: M, mM, µM, nM, g/L,
          mg/mL, µg/µL, L, mL, µL.
        </p>
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#648FFF" }}>Separator:</span>
          <select
            value={sepOverride}
            onChange={(e) => setSepOverride(e.target.value)}
            style={sepSelect}
          >
            <option value="">Auto-detect</option>
            <option value=",">Comma (,)</option>
            <option value=";">Semicolon (;)</option>
            <option value={"\t"}>Tab (\t)</option>
          </select>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={BATCH_EXAMPLE}
          rows={8}
          style={{
            width: "100%",
            fontFamily: "monospace",
            fontSize: 12,
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
            resize: "vertical",
            background: "#fff",
            color: "#333",
          }}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <button onClick={compute} style={btnPrimary}>
            Calculate
          </button>
          <button onClick={() => setRaw(BATCH_EXAMPLE)} style={btnSecondary}>
            Load example
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{error}</span>
        </div>
      )}

      {results && results.length > 0 && (
        <div style={sec}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#555" }}>Prep Sheet</p>
            <button onClick={csvExport} style={btnDownload}>
              Download CSV
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ccc" }}>
                  {["Name", "MW", "Concentration", "Volume", "Mass to weigh"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 10px",
                        textAlign: "left",
                        color: "#666",
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 600, color: "#333" }}>
                      {r.name}
                    </td>
                    {r.error ? (
                      <td
                        colSpan={4}
                        style={{ padding: "6px 10px", color: "#dc2626", fontStyle: "italic" }}
                      >
                        {r.error}
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: "6px 10px" }}>{r.mw} g/mol</td>
                        <td style={{ padding: "6px 10px" }}>{r.conc}</td>
                        <td style={{ padding: "6px 10px" }}>{r.vol}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: "#16a34a" }}>
                          {r.massDisplay}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMass(grams) {
  if (grams >= 1) return grams.toFixed(4) + " g";
  if (grams >= 1e-3) return (grams * 1e3).toFixed(4) + " mg";
  return (grams * 1e6).toFixed(4) + " µg";
}

// ── Ligation Mode ───────────────────────────────────────────────────────────

function LigationMode() {
  const [vectorBp, setVectorBp] = useState("");
  const [vectorNg, setVectorNg] = useState("");
  const [insertBp, setInsertBp] = useState("");
  const [ratioVector, setRatioVector] = useState("1");
  const [ratioInsert, setRatioInsert] = useState("3");

  const result = useMemo(() => {
    const vBp = parseFloat(vectorBp);
    const vNg = parseFloat(vectorNg);
    const iBp = parseFloat(insertBp);
    const rV = parseFloat(ratioVector);
    const rI = parseFloat(ratioInsert);
    if (!isFinite(vBp) || !isFinite(vNg) || !isFinite(iBp) || !isFinite(rV) || !isFinite(rI))
      return null;
    if (vBp <= 0 || vNg <= 0 || iBp <= 0 || rV <= 0 || rI <= 0) return null;
    // insert ng = (insert bp / vector bp) × vector ng × (insert ratio / vector ratio)
    const insertNg = (iBp / vBp) * vNg * (rI / rV);
    return insertNg;
  }, [vectorBp, vectorNg, insertBp, ratioVector, ratioInsert]);

  const fieldStyle = {
    ...inp,
    width: 130,
    fontSize: 13,
    textAlign: "right",
  };

  return (
    <div>
      <div style={{ ...sec, marginBottom: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#555" }}>
          Ligation insert calculator
        </p>
        <p style={{ margin: "0 0 0", fontSize: 11, color: "#999" }}>
          insert (ng) = (insert bp / vector bp) × vector ng × (insert:vector ratio)
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ ...sec, flex: 1, marginBottom: 0, padding: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#785EF0" }}>
            Vector
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <label style={{ ...lbl, marginBottom: 0, fontWeight: 600, fontSize: 11 }}>Length</label>
            <input
              type="number"
              value={vectorBp}
              onChange={(e) => setVectorBp(e.target.value)}
              style={{ ...fieldStyle, width: 90, fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "#999" }}>bp</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ ...lbl, marginBottom: 0, fontWeight: 600, fontSize: 11 }}>Amount</label>
            <input
              type="number"
              value={vectorNg}
              onChange={(e) => setVectorNg(e.target.value)}
              style={{ ...fieldStyle, width: 90, fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "#999" }}>ng</span>
          </div>
        </div>

        <div style={{ ...sec, flex: 1, marginBottom: 0, padding: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#785EF0" }}>
            Insert
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ ...lbl, marginBottom: 0, fontWeight: 600, fontSize: 11 }}>Length</label>
            <input
              type="number"
              value={insertBp}
              onChange={(e) => setInsertBp(e.target.value)}
              style={{ ...fieldStyle, width: 90, fontSize: 12 }}
            />
            <span style={{ fontSize: 11, color: "#999" }}>bp</span>
          </div>
        </div>

        <div style={{ ...sec, flex: 1, marginBottom: 0, padding: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "#785EF0" }}>
            Molar ratio
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <label
              style={{ ...lbl, marginBottom: 0, fontWeight: 600, fontSize: 11, color: "#555" }}
            >
              Vector
            </label>
            <input
              type="number"
              value={ratioVector}
              onChange={(e) => setRatioVector(e.target.value)}
              min="1"
              style={{ ...fieldStyle, width: 60, fontSize: 12 }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label
              style={{ ...lbl, marginBottom: 0, fontWeight: 600, fontSize: 11, color: "#555" }}
            >
              Insert
            </label>
            <input
              type="number"
              value={ratioInsert}
              onChange={(e) => setRatioInsert(e.target.value)}
              min="1"
              style={{ ...fieldStyle, width: 60, fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {result !== null && (
        <div
          style={{
            ...sec,
            background: "#f0fdf4",
            borderColor: "#86efac",
            padding: "16px 20px",
          }}
        >
          <p style={{ margin: "0 0 4px", fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
            Insert amount needed:
          </p>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
            {formatResult(result)}
          </span>
          <span style={{ fontSize: 14, color: "#16a34a", fontWeight: 600, marginLeft: 8 }}>ng</span>
        </div>
      )}
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────

function ModeButton({
  modeKey,
  label,
  desc,
  active,
  accentColor,
  activeBg,
  onClick,
  style: extraStyle,
}) {
  const [hovered, setHovered] = useState(false);
  const isActive = active;
  const showAccent = isActive || hovered;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "12px 8px",
        borderRadius: 10,
        border: showAccent ? `2px solid ${accentColor}` : "1px solid #ddd",
        background: isActive ? activeBg : "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "center",
        transition: "all 0.2s ease",
        transform: hovered && !isActive ? "translateY(-4px)" : "none",
        boxShadow: hovered && !isActive ? `0 6px 16px ${accentColor}26` : "none",
        ...extraStyle,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: showAccent ? accentColor : "#555",
          transition: "color 0.2s ease",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{desc}</div>
    </button>
  );
}

function App() {
  const [mode, setMode] = useState("molarity");

  const chemModes = [
    { key: "molarity", label: "Molarity", desc: "MW / mass / volume / concentration" },
    { key: "dilution", label: "Dilution", desc: "C1×V1 = C2×V2" },
    { key: "batch", label: "Batch", desc: "Paste a table, get a prep sheet" },
  ];

  const dnaModes = [
    { key: "ligation", label: "Ligation", desc: "Insert mass from vector:insert ratio" },
  ];

  const chemColor = "#648FFF";
  const dnaColor = "#785EF0";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <PageHeader
        toolName="molarity"
        title="Calculator"
        subtitle="Molarity, dilution, batch preparation, and ligation"
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: chemColor,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Solutions
        </span>
        <span style={{ flex: 1, height: 1, background: chemColor, opacity: 0.3 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {chemModes.map((m) => (
          <ModeButton
            key={m.key}
            modeKey={m.key}
            label={m.label}
            desc={m.desc}
            active={mode === m.key}
            accentColor={chemColor}
            activeBg="#eef2ff"
            onClick={() => setMode(m.key)}
            style={{ flex: 1 }}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: dnaColor,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          DNA
        </span>
        <span style={{ flex: 1, height: 1, background: dnaColor, opacity: 0.3 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {dnaModes.map((m) => (
          <ModeButton
            key={m.key}
            modeKey={m.key}
            label={m.label}
            desc={m.desc}
            active={mode === m.key}
            accentColor={dnaColor}
            activeBg="#f5f3ff"
            onClick={() => setMode(m.key)}
            style={{
              flex: "0 1 auto",
              width: `calc(${100 / chemModes.length}% - ${(10 * (chemModes.length - 1)) / chemModes.length}px)`,
            }}
          />
        ))}
      </div>

      {mode === "molarity" && <MolarityMode />}
      {mode === "dilution" && <DilutionMode />}
      {mode === "batch" && <BatchMode />}
      {mode === "ligation" && <LigationMode />}
    </div>
  );
}

ReactDOM.render(React.createElement(App), document.getElementById("root"));
