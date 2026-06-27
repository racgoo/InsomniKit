#!/usr/bin/env node
/**
 * tsc compiles the renderer/preload TypeScript to dist/, but it leaves
 * the static renderer assets (HTML, CSS) behind. Copy them into the
 * matching dist/ paths so `loadFile()` and the <link>/<script> tags
 * resolve at runtime (and so electron-builder bundles them via its
 * dist glob in package.json `build.files`).
 *
 * Plain Node, no dependencies — runs from the `build` script.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "renderer");
const OUT = path.join(__dirname, "..", "dist", "renderer");
const EXTENSIONS = new Set([".html", ".css"]);

function copyAssets(srcDir, outDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(outDir, entry.name);
    if (entry.isDirectory()) {
      copyAssets(from, to);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`copy-renderer: no renderer source at ${SRC}`);
  process.exit(0);
}
copyAssets(SRC, OUT);
console.log("copy-renderer: copied HTML/CSS into dist/renderer");
