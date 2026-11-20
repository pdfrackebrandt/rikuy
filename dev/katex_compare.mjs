// Every formula the page draws, rendered by two KaTeX builds and compared: for a KaTeX update.
// The formulas are those of the editor's model (src/model.js) of each document given: display
// and inline math, with the document's own macros, siunitx and the options the page renders with
// (src/render.js Renderer.katex, which this calls). For each formula: an error in one and not the
// other, and HTML that differs; the counts, and the first examples of each.
// Usage: node dev/katex_compare.mjs OLD_KATEX_DIR NEW_KATEX_DIR [FILE.tex | CORPUS_DIR]...
//   (a KaTeX package's folder, the one holding package.json and dist/; a folder is walked for
//   .tex files with \documentclass, read with the .tex and .bib files beside them)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { buildModel } from '../src/model.js';
import { Renderer } from '../src/render.js';

const [oldDir, newDir, ...inputs] = process.argv.slice(2);
if (!oldDir || !newDir || !inputs.length) {
  console.error('usage: node dev/katex_compare.mjs OLD_KATEX_DIR NEW_KATEX_DIR [FILE.tex | CORPUS_DIR]...');
  process.exit(2);
}
// each build with its mhchem (\ce, \pu), as the page loads it (src/app.js CDN chem)
function load(dir) {
  const req = createRequire(path.resolve(dir, 'package.json'));
  const K = req(path.resolve(dir, 'dist/katex.js'));
  globalThis.katex = K;
  try { req(path.resolve(dir, 'dist/contrib/mhchem.js')); } catch (e) { console.error('mhchem not loaded from', dir, e.message); }
  return K;
}
const KO = load(oldDir), KN = load(newDir);
console.log('old', KO.version, 'new', KN.version);

const docs = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tex$/.test(e.name)) docs.push(p); } };
for (const x of inputs) { if (fs.statSync(x).isDirectory()) walk(x); else docs.push(x); }

// every formula of a model: display math (type math), inline atoms (k math), parts of entries (m)
function formulas(M) {
  const out = [];
  const seen = new Set();
  const visit = (o) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { for (const x of o) visit(x); return; }
    if (o.type === 'math' && typeof o.tex === 'string') out.push([o.tex, true]);
    else if (o.k === 'math' && typeof o.tex === 'string') out.push([o.tex, false]);
    else if (typeof o.m === 'string' && Object.keys(o).length <= 3) out.push([o.m, false]);
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
  };
  visit(M.blocks);
  return out;
}
function render(K, M, list) {
  globalThis.window = { katex: K };
  const r = new Renderer(null);
  r.setMacros(M.mathMacros || {}, { opts: M.siOpts, units: M.siUnits, lang: M.opts && M.opts.lang });
  return list.map(([t, d]) => r.katex(t, d));
}

let n = 0, nDocs = 0, same = 0, newErr = [], fixed = [], bothErr = 0, diff = [];
for (const f of docs) {
  const text = fs.readFileSync(f, 'utf8');
  if (!/\\documentclass/.test(text)) continue;
  const proj = new Map();
  for (const x of fs.readdirSync(path.dirname(f))) if (/\.(tex|bib)$/.test(x)) proj.set(x, fs.readFileSync(path.join(path.dirname(f), x), 'utf8'));
  let M;
  try { M = buildModel({ files: proj, main: path.basename(f) }); } catch (e) { continue; }
  nDocs++;
  const list = formulas(M);
  const a = render(KO, M, list), b = render(KN, M, list);
  list.forEach(([t, d], i) => {
    n++;
    const x = a[i], y = b[i];
    if (x.err && y.err) bothErr++;
    else if (!x.err && y.err) newErr.push([f, t, y.err]);
    else if (x.err && !y.err) fixed.push([f, t, x.err]);
    else if (x.html === y.html) same++;
    else diff.push([f, t, d]);
  });
}
const short = (f) => path.relative(process.cwd(), f);
console.log(JSON.stringify({ documents: nDocs, formulas: n, sameHtml: same, htmlDiffers: diff.length, errorOnlyInNew: newErr.length, errorOnlyInOld: fixed.length, errorInBoth: bothErr }));
for (const [f, t, e] of newErr.slice(0, 40)) console.log('NEW ERROR', short(f), JSON.stringify(t.slice(0, 120)), '::', e);
for (const [f, t, e] of fixed.slice(0, 20)) console.log('OLD ERROR ONLY', short(f), JSON.stringify(t.slice(0, 120)), '::', e);
for (const [f, t, d] of diff.slice(0, 20)) console.log('HTML DIFFERS', d ? 'display' : 'inline', short(f), JSON.stringify(t.slice(0, 120)));
if (process.env.KATEX_DIFF_OUT) fs.writeFileSync(process.env.KATEX_DIFF_OUT, JSON.stringify({ diff: diff.map(([f, t, d]) => [short(f), t, d]), newErr, fixed }, null, 1));
