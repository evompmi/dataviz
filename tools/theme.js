// ── Theme ────────────────────────────────────────────────────────────────────
// Plain-JS (script-scope globals), same pattern as the other shared-*.js files.
// Reads/writes `dataviz-theme` in localStorage, syncs across same-origin iframes
// via the `storage` event, and exposes a small ThemeToggle React component.
//
// First visit with no saved choice: OS preference applies via the
// prefers-color-scheme media query in theme.css.
// After the user toggles: the explicit [data-theme=...] attribute wins.

const THEME_STORAGE_KEY = "dataviz-theme";

// BroadcastChannel is a same-origin cross-tab pub/sub channel. We use it in
// parallel with the `storage` event because the latter is unreliable in
// several common situations: some browsers partition storage per top-level
// site, private-mode windows silently drop events, and events queued while a
// page is in bfcache are never delivered. BroadcastChannel, when available,
// fans theme changes out to every open tab synchronously and reliably.
let _themeChannel = null;
try {
  if (typeof BroadcastChannel === "function") {
    _themeChannel = new BroadcastChannel("dataviz-theme");
  }
} catch (e) {
  _themeChannel = null;
}

function _applyThemeAttr(mode) {
  const root = document.documentElement;
  if (mode === "dark" || mode === "light") {
    root.setAttribute("data-theme", mode);
  } else {
    root.removeAttribute("data-theme");
  }
}

function _readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch (e) {
    return null;
  }
}

// Resolves the currently effective theme, taking both the explicit attribute
// and the OS preference into account. Useful for rendering the toggle icon.
function getTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function setTheme(mode) {
  try {
    if (mode === "dark" || mode === "light") {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } else {
      localStorage.removeItem(THEME_STORAGE_KEY);
    }
  } catch (e) {
    // localStorage may be blocked (private mode, iframe sandbox). Still apply
    // the attribute so the current page reflects the change.
  }
  _applyThemeAttr(mode);
  // Fan out to every other tab via BroadcastChannel — this is the reliable
  // path. The `storage` event is kept as a fallback but not all browsers
  // deliver it in all contexts.
  try {
    if (_themeChannel) _themeChannel.postMessage({ type: "theme", theme: mode });
  } catch (e) {
    // Ignore — local document will still be correct via _applyThemeAttr above.
  }
  // Notify same-document listeners (storage events only fire cross-document).
  try {
    window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: mode } }));
  } catch (e) {
    // Old browsers without CustomEvent constructor — safe to ignore.
  }
}

function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

// Apply any stored theme immediately. The no-FOUC inline snippet in each HTML
// <head> already does this before first paint; re-running here is idempotent
// and covers the case where theme.js is loaded without the inline snippet.
_applyThemeAttr(_readStoredTheme());

// BroadcastChannel is the primary cross-tab delivery mechanism — when any
// other tab calls setTheme, we receive the message here and re-apply.
if (_themeChannel) {
  _themeChannel.addEventListener("message", (e) => {
    const data = e && e.data;
    if (!data || data.type !== "theme") return;
    const v = data.theme === "dark" || data.theme === "light" ? data.theme : null;
    _applyThemeAttr(v);
    try {
      window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: v } }));
    } catch (err) {
      // ignore
    }
  });
}

// Cross-iframe sync: when another same-origin frame writes the localStorage key,
// re-apply locally so every open tool updates together. Kept as a fallback
// layer behind BroadcastChannel — older browsers or storage partitioning may
// still deliver storage events even when BroadcastChannel is missing.
window.addEventListener("storage", (e) => {
  if (e.key !== THEME_STORAGE_KEY) return;
  const v = e.newValue === "dark" || e.newValue === "light" ? e.newValue : null;
  _applyThemeAttr(v);
  try {
    window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: v } }));
  } catch (err) {
    // ignore
  }
});

// Re-read the stored theme whenever the page becomes visible again. Covers
// two cases the `storage` event misses:
//   1. bfcache restore — back/forward navigation resurrects the page without
//      rerunning scripts, and storage events that fired while the page was
//      frozen are not delivered.
//   2. Tab regained focus after a toggle in another tab where the browser
//      coalesced or dropped the storage event.
// Cheap and idempotent: just re-applies whatever localStorage currently says.
window.addEventListener("pageshow", () => {
  _applyThemeAttr(_readStoredTheme());
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    _applyThemeAttr(_readStoredTheme());
  }
});

// Parent-to-iframe sync: the landing page's top-bar toggle posts a message to
// every tool iframe because the `storage` event doesn't fire in the window
// that wrote the key, and file:// origins can block direct contentDocument
// access from the parent. Accept only our own message shape.
window.addEventListener("message", (e) => {
  const data = e && e.data;
  if (!data || data.type !== "dataviz-theme-set") return;
  const v = data.theme === "dark" || data.theme === "light" ? data.theme : null;
  _applyThemeAttr(v);
  try {
    window.dispatchEvent(new CustomEvent("dataviz-theme-change", { detail: { theme: v } }));
  } catch (err) {
    // ignore
  }
});

// React hook-style helper: components call this to re-render on theme change.
function useThemeMode() {
  const [mode, setMode] = React.useState(() => getTheme());
  React.useEffect(() => {
    const onChange = () => setMode(getTheme());
    window.addEventListener("dataviz-theme-change", onChange);
    window.addEventListener("storage", onChange);
    // Also react to OS-preference changes when no explicit choice is set.
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq && mq.addListener) mq.addListener(onChange);
    return () => {
      window.removeEventListener("dataviz-theme-change", onChange);
      window.removeEventListener("storage", onChange);
      if (mq && mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq && mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  return mode;
}

// Sun and moon glyphs as raw SVG strings. Drawn with currentColor so they
// inherit the button text color and recolor automatically under dark theme.
const _SUN_SVG =
  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.2"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>';
const _MOON_SVG =
  '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none" width="16" height="16" aria-hidden="true"><path d="M16.5 12.8A6.5 6.5 0 0 1 7.2 3.5a.6.6 0 0 0-.8-.78 8 8 0 1 0 10.86 10.86.6.6 0 0 0-.78-.78z"/></svg>';

function ThemeToggle(props) {
  props = props || {};
  const mode = useThemeMode();
  const isDark = mode === "dark";
  const title = isDark ? "Switch to light mode" : "Switch to dark mode";
  const style = Object.assign(
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      padding: 0,
      border: "1px solid var(--border)",
      borderRadius: 8,
      background: "var(--surface)",
      color: "var(--text)",
      cursor: "pointer",
      lineHeight: 0,
    },
    props.style || {}
  );
  return React.createElement(
    "button",
    {
      type: "button",
      onClick: toggleTheme,
      title,
      "aria-label": title,
      style,
    },
    React.createElement("span", {
      dangerouslySetInnerHTML: { __html: isDark ? _SUN_SVG : _MOON_SVG },
      style: { display: "inline-block", lineHeight: 0 },
    })
  );
}
