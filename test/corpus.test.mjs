import fs from 'fs';
import path from 'path';
import { buildModel } from '../src/model.js';
const root = process.argv[2];
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
console.log('docs', docs, 'ok', ok, 'fail', fail);
for (const x of failures.slice(0, 15)) console.log('FAIL', x[0].replace(root, ''), x[1]);
console.log('slow', slow.slice(0, 10));
console.log('top unknown:', [...warnCount].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => k + ':' + v).join('  '));
