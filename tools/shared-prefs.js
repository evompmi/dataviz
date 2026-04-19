// shared-prefs.js — persist per-tool plot render settings across sessions.
// Plain ES2022 (no import/export); loaded as a global <script> alongside
// the other shared-*.js files. Exposes four globals:
//   loadAutoPrefs(toolName, visInit)        -> merged init object
//   saveAutoPrefs(toolName, vis)            -> debounced write to localStorage
//   exportPrefsFile(toolName, vis)          -> downloads a .json snapshot
//   importPrefsFile(toolName, visInit, cb)  -> opens a file picker, calls cb(merged, errMsg)

// Keys that are dataset-specific (plot/axis labels) are NOT auto-persisted to
// localStorage — auto-filling them with stale text across sessions is annoying.
// They ARE written to and read from the exported JSON file (explicit opt-in).
const PREFS_LABEL_KEY_RE = /(?:Title|Subtitle|AxisLabel)$/;
function isLabelKey(key) {
  return PREFS_LABEL_KEY_RE.test(key);
}

const PREFS_STORAGE_PREFIX = "dataviz-prefs-";
const PREFS_SCHEMA_VERSION = 1;

function prefsStorageKey(toolName) {
  return PREFS_STORAGE_PREFIX + toolName;
}

// Type-check a candidate value against the default in visInit. Accepts exact
// type matches; for null defaults (e.g. lineplot.xMin = null meaning "auto"),
// also accepts null or any finite number.
function isPrefValueCompatible(candidate, defaultVal) {
  if (defaultVal === null) {
    if (candidate === null) return true;
    return typeof candidate === "number" && Number.isFinite(candidate);
  }
  if (candidate === null || candidate === undefined) return false;
  const tDefault = typeof defaultVal;
  const tCand = typeof candidate;
  if (tDefault !== tCand) return false;
  if (tDefault === "number" && !Number.isFinite(candidate)) return false;
  return true;
}

// Merge a candidate settings object into a clone of visInit, keeping only
// whitelisted keys with compatible types. `opts.onlyStyle` drops label keys.
function mergePrefsSettings(visInit, candidate, opts) {
  const onlyStyle = !!(opts && opts.onlyStyle);
  const out = { ...visInit };
  if (!candidate || typeof candidate !== "object") return out;
  for (const key of Object.keys(visInit)) {
    if (!(key in candidate)) continue;
    if (onlyStyle && isLabelKey(key)) continue;
    const val = candidate[key];
    if (isPrefValueCompatible(val, visInit[key])) {
      out[key] = val;
    }
  }
  return out;
}

// Build the style-only subset of a full `vis` state (strips label keys).
function extractStylePrefs(vis) {
  const out = {};
  for (const key of Object.keys(vis)) {
    if (isLabelKey(key)) continue;
    out[key] = vis[key];
  }
  return out;
}

function loadAutoPrefs(toolName, visInit) {
  try {
    const raw = localStorage.getItem(prefsStorageKey(toolName));
    if (!raw) return { ...visInit };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...visInit };
    if (parsed.tool && parsed.tool !== toolName) return { ...visInit };
    const settings = parsed.settings || parsed;
    return mergePrefsSettings(visInit, settings, { onlyStyle: true });
  } catch (_e) {
    return { ...visInit };
  }
}

// Per-tool debounce so rapid slider drags don't thrash localStorage.
const prefsSaveTimers = {};
function saveAutoPrefs(toolName, vis) {
  if (prefsSaveTimers[toolName]) {
    clearTimeout(prefsSaveTimers[toolName]);
  }
  prefsSaveTimers[toolName] = setTimeout(() => {
    try {
      const payload = {
        tool: toolName,
        version: PREFS_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        settings: extractStylePrefs(vis),
      };
      localStorage.setItem(prefsStorageKey(toolName), JSON.stringify(payload));
    } catch (_e) {
      /* quota or private-mode — silent fallback */
    }
    prefsSaveTimers[toolName] = null;
  }, 300);
}

// Synchronous flush (used by tests and by clearAutoPrefs so storage state is
// deterministic). Not called from production code paths directly.
function flushAutoPrefs(toolName, vis) {
  if (prefsSaveTimers[toolName]) {
    clearTimeout(prefsSaveTimers[toolName]);
    prefsSaveTimers[toolName] = null;
  }
  try {
    const payload = {
      tool: toolName,
      version: PREFS_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      settings: extractStylePrefs(vis),
    };
    localStorage.setItem(prefsStorageKey(toolName), JSON.stringify(payload));
  } catch (_e) {
    /* silent */
  }
}

function clearAutoPrefs(toolName) {
  if (prefsSaveTimers[toolName]) {
    clearTimeout(prefsSaveTimers[toolName]);
    prefsSaveTimers[toolName] = null;
  }
  try {
    localStorage.removeItem(prefsStorageKey(toolName));
  } catch (_e) {
    /* silent */
  }
}

// Build the JSON payload and trigger a browser download. Includes label keys
// because this is an explicit user action and the resulting file is portable.
function exportPrefsFile(toolName, vis) {
  const payload = {
    tool: toolName,
    version: PREFS_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    settings: { ...vis },
  };
  const text = JSON.stringify(payload, null, 2);
  // `downloadText` is a global from tools/shared.js
  downloadText(text, toolName + "-settings.json");
}

// Compact inline Save / Load / Reset buttons for plot render settings.
// Designed to sit on the right side of PageHeader (small footprint, no panel
// chrome). Style tweaks still auto-persist to localStorage in the background;
// these buttons cover the explicit save-to-file / load-from-file / reset flow.
// Props:
//   tool    : string — tool name, matches loadAutoPrefs key
//   vis     : object — current render state
//   visInit : object — defaults (used as whitelist for imported files)
//   updVis  : reducer dispatch — applies a settings patch; supports `_reset: true`
function PrefsPanel(props) {
  const tool = props.tool;
  const vis = props.vis;
  const visInit = props.visInit;
  const updVis = props.updVis;
  const [error, setError] = React.useState("");

  const handleSave = () => {
    exportPrefsFile(tool, vis);
    setError("");
  };
  const handleLoad = () => {
    importPrefsFile(tool, visInit, (merged, errMsg) => {
      if (errMsg) {
        setError(errMsg);
        return;
      }
      updVis(merged);
      setError("");
    });
  };
  const handleReset = () => {
    updVis({ _reset: true });
    clearAutoPrefs(tool);
    setError("");
  };

  const compactBtnStyle = {
    padding: "4px 10px",
    fontSize: 12,
    lineHeight: 1.2,
  };

  const row = React.createElement(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 6 } },
    React.createElement(
      "span",
      {
        style: {
          fontSize: 11,
          color: "var(--text-faint)",
          marginRight: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        },
      },
      "Settings"
    ),
    React.createElement(
      "button",
      {
        key: "save",
        onClick: handleSave,
        className: "dv-btn dv-btn-dl",
        style: compactBtnStyle,
        title: "Download current settings as a JSON file",
      },
      "Save"
    ),
    React.createElement(
      "button",
      {
        key: "load",
        onClick: handleLoad,
        className: "dv-btn dv-btn-dl",
        style: compactBtnStyle,
        title: "Apply settings from a previously saved JSON file",
      },
      "Load"
    ),
    React.createElement(
      "button",
      {
        key: "reset",
        onClick: handleReset,
        className: "dv-btn dv-btn-danger",
        style: compactBtnStyle,
        title: "Restore default settings and clear stored preferences",
      },
      "Reset"
    )
  );

  return React.createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 } },
    row,
    error
      ? React.createElement(
          "p",
          {
            style: {
              margin: 0,
              fontSize: 11,
              color: "var(--danger-text)",
              maxWidth: 320,
              textAlign: "right",
            },
          },
          error
        )
      : null
  );
}

// Open a file picker, read the selected file, validate, call cb with the
// merged settings or an error message. cb signature: (merged, errorMessage).
function importPrefsFile(toolName, visInit, cb) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.style.display = "none";
  const cleanup = () => {
    if (input.parentNode) input.parentNode.removeChild(input);
  };
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) {
      cleanup();
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      cleanup();
      let parsed;
      try {
        parsed = JSON.parse(ev.target.result);
      } catch (_e) {
        cb(null, "Not a valid JSON file.");
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        cb(null, "Not a valid settings file.");
        return;
      }
      if (parsed.tool && parsed.tool !== toolName) {
        cb(null, `This file is for the ${parsed.tool} tool, not ${toolName}.`);
        return;
      }
      const settings = parsed.settings || parsed;
      const merged = mergePrefsSettings(visInit, settings, { onlyStyle: false });
      cb(merged, null);
    };
    reader.onerror = () => {
      cleanup();
      cb(null, "Could not read the selected file.");
    };
    reader.readAsText(file);
  });
  // Some browsers need the input in the DOM for programmatic click to work.
  document.body.appendChild(input);
  input.click();
}
