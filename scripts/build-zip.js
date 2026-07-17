// Builds the Chrome Web Store upload package: a zip of ONLY the files the
// extension needs at runtime (an allowlist - never docs/tests/scripts/tooling,
// so no synthetic tokens or dev cruft ship to users). Cross-platform (no `zip`
// binary needed), so it runs the same on Windows and in CI.
//
//   npm run build:zip   ->   dist/jotscope.zip
'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'jotscope.zip');

// Everything the extension loads at runtime - keep in sync with manifest.json
// and the popup's module imports. Files first, then whole directories.
const FILES = ['manifest.json', 'background.js', 'popup.html', 'popup.css', 'popup.js'];
const DIRS = ['styles', 'ui', 'utils', 'icons'];

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;

const zip = new AdmZip();
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) throw new Error(`Runtime file missing: ${f}`);
  zip.addLocalFile(p);
}
for (const d of DIRS) {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) throw new Error(`Runtime directory missing: ${d}/`);
  zip.addLocalFolder(p, d);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
zip.writeZip(OUT);

const entries = zip.getEntries().map(e => e.entryName).sort();
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`Packaged Jotscope v${version} -> ${path.relative(ROOT, OUT)} (${kb} KB, ${entries.length} files)`);
for (const e of entries) console.log('  ' + e);
