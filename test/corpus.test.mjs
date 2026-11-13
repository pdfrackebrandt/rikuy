// The editor model on every document of a corpus (a LaTeX-examples clone): each must build
// without throwing; also lists the slow ones and the commands the model does not know.
import fs from 'fs';
import path from 'path';
import { buildModel } from '../src/model.js';
import { loadCore } from '../src/native.js';
// the model as the page builds it: with the native core (test/native.test.mjs CORPUS_DIR builds
// every document both ways and compares)
const core = await loadCore(fs.readFileSync(new URL('../tex/vendor/core/rikuy-core.wasm', import.meta.url)));
const root = process.argv[2];
if (!root) {
  console.error('usage: node test/corpus.test.mjs CORPUS_DIR   (e.g. a clone of MartinThoma/LaTeX-examples at 8bfd313b8d98)');
  process.exit(2);
}
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tex$/.test(e.name)) files.push(p); } };
walk(root);
let ok = 0, fail = 0, docs = 0, slow = [];
const warnCount = new Map();
const failures = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  if (!/\\documentclass/.test(t)) continue;
  docs++;
  const dir = path.dirname(f);
  const proj = new Map();
  for (const n of fs.readdirSync(dir)) if (/\.(tex|bib)$/.test(n)) proj.set(n, fs.readFileSync(path.join(dir, n), 'utf8'));
  const t0 = performance.now();
  try {
    const M = buildModel({ files: proj, main: path.basename(f) });
    const dt = performance.now() - t0;
    if (dt > 300) slow.push([f, Math.round(dt)]);
    for (const w of M.warn) warnCount.set(w, (warnCount.get(w) || 0) + 1);
    ok++;
  } catch (e) { fail++; failures.push([f, e.stack.split('\n').slice(0, 3).join(' | ')]); }
}
console.log('docs', docs, 'ok', ok, 'fail', fail, 'native core', core ? 'on' : 'OFF');
if (!core) process.exitCode = 1;
if (fail) process.exitCode = 1;
for (const x of failures.slice(0, 15)) console.log('FAIL', x[0].replace(root, ''), x[1]);
console.log('slow', slow.slice(0, 10));
console.log('top unknown:', [...warnCount].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => k + ':' + v).join('  '));
