#!/usr/bin/env node
/**
 * build.js — Toolbox build script
 *
 * Commands:
 *   node build.js extract   — One-time: extract tool HTML from monolithic file → tools/*.html
 *   node build.js           — Build: assemble index.html + tools/*.html → dist/index.html
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const TOOLS_DIR = path.join(ROOT, "tools");
const DIST_DIR = path.join(ROOT, "dist");
const SOURCE_FILE = path.join(ROOT, "base-to-refactor.html");
const SHELL_FILE = path.join(ROOT, "index.html");
const DIST_FILE = path.join(DIST_DIR, "index.html");

const TOOL_NAMES = ["boxplot", "aequorin", "bargraph", "scatter"];

// ---------------------------------------------------------------------------
// EXTRACT — parse SOURCES object from monolith, write each tool to tools/*.html
// ---------------------------------------------------------------------------
function extract() {
  console.log("Extracting tools from", SOURCE_FILE);
  const content = fs.readFileSync(SOURCE_FILE, "utf-8");

  // Grab the SOURCES object literal from the script block
  const match = content.match(/var SOURCES\s*=\s*(\{[\s\S]*?\n\s*\});/);
  if (!match) throw new Error("Could not locate SOURCES object in source file.");

  // Evaluate the object literal safely in a sandboxed context
  const SOURCES = vm.runInNewContext("(" + match[1] + ")");

  fs.mkdirSync(TOOLS_DIR, { recursive: true });

  for (const name of Object.keys(SOURCES)) {
    const dest = path.join(TOOLS_DIR, `${name}.html`);
    fs.writeFileSync(dest, SOURCES[name], "utf-8");
    const kb = (SOURCES[name].length / 1024).toFixed(1);
    console.log(`  ✓ tools/${name}.html  (${kb} KB)`);
  }

  console.log("\nDone. You can now delete base-to-refactor.html if you want.");
  console.log("Next: run  node build.js  to produce dist/index.html");
}

// ---------------------------------------------------------------------------
// BUILD — inline tools/*.html back into a single self-contained dist/index.html
// ---------------------------------------------------------------------------
function build() {
  console.log("Building dist/index.html …");

  const shell = fs.readFileSync(SHELL_FILE, "utf-8");

  // Read shared scripts to inline them (blob URLs have no base path for relative src=)
  const sharedJs = fs.readFileSync(path.join(TOOLS_DIR, "shared.js"), "utf-8");
  const sharedComponentsJs = fs.readFileSync(path.join(TOOLS_DIR, "shared-components.js"), "utf-8");

  // Read each tool file and JSON-encode it so it embeds safely as a JS string
  const sourceEntries = TOOL_NAMES.map((name) => {
    const toolPath = path.join(TOOLS_DIR, `${name}.html`);
    if (!fs.existsSync(toolPath)) {
      throw new Error(`Missing tool file: tools/${name}.html — run  node build.js extract  first.`);
    }
    let html = fs.readFileSync(toolPath, "utf-8");
    // Replace relative shared script tags with inlined versions
    html = html.replace(/<script src="shared\.js"><\/script>/, `<script>\n${sharedJs}\n</script>`);
    html = html.replace(/<script src="shared-components\.js"><\/script>/, `<script>\n${sharedComponentsJs}\n</script>`);
    // Escape </script> so the HTML parser doesn't close the outer <script> block early.
    // \/ is valid JSON and invisible to the browser's tag scanner.
    const safe = JSON.stringify(html).replace(/<\/script>/gi, "<\\/script>");
    return `  ${name}: ${safe}`;
  });

  const sourcesBlock = `var SOURCES = {\n${sourceEntries.join(",\n")}\n};`;

  // The shell index.html uses direct iframe src; we swap that for the blob approach
  // by injecting the SOURCES object and the blob-based openTool into the script tag.
  const distScript = `
<script>
${sourcesBlock}

var loaded = {};

function openTool(name) {
  if (!loaded[name]) {
    var blob = new Blob([SOURCES[name]], { type: "text/html" });
    document.getElementById("frame-" + name).src = URL.createObjectURL(blob);
    loaded[name] = true;
  }
  document.getElementById("landing").style.display = "none";
  document.querySelectorAll(".tool-view").forEach(function(v) { v.classList.remove("active"); });
  document.getElementById("view-" + name).classList.add("active");
}

function goBack() {
  document.querySelectorAll(".tool-view").forEach(function(v) { v.classList.remove("active"); });
  document.getElementById("landing").style.display = "";
}

document.querySelectorAll(".tile[data-tool]").forEach(function(btn) {
  btn.addEventListener("click", function() { openTool(btn.dataset.tool); });
});
document.querySelectorAll("[data-back]").forEach(function(btn) {
  btn.addEventListener("click", goBack);
});
</script>`;

  // Replace the shell's <script> block (which uses src= approach) with the blob approach
  let distHtml = shell.replace(/<script>[\s\S]*?<\/script>/, distScript);

  // Also strip the src attributes from iframes (not needed in dist, blobs are used instead)
  distHtml = distHtml.replace(/(<iframe[^>]*?) src="tools\/[^"]*"/g, "$1");

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(DIST_FILE, distHtml, "utf-8");

  const kb = (fs.statSync(DIST_FILE).size / 1024).toFixed(1);
  console.log(`  ✓ dist/index.html  (${kb} KB)`);
  console.log("\nDone. Open dist/index.html in any browser — no server needed.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const cmd = process.argv[2];
if (cmd === "extract") {
  extract();
} else {
  build();
}
