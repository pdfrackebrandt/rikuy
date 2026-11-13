// How much the native core saves, per ported function and in the situation it serves, with the
// JavaScript it replaced on the same machine in the same process: medians of N runs, each on a
// fresh string (a keystroke makes one), after a warm up long enough for both to reach their
// optimizing tier.
//   node dev/bench_native.mjs [-n 41] [--json out.json]   (on a shared machine: under one core,
//   taskset -c 0)
// Documents: dev/bench/*/main.tex, and a generated one of 3000 paragraphs (about 400 KB).
// Situations:
//   parse        parse() of the main file, the call model.js makes (JavaScript: parseJS)
//   keystroke    buildModel with the last model, one character typed in the middle of the body
//   first load   buildModel with no model (two passes, the second from the parse cache)
import fs from 'fs';
import path from 'path';
import { parse, parseJS, scanUserSigs, setNativeParse } from '../src/parser.js';
import { loadCore, nativeParse } from '../src/native.js';
import { buildModel } from '../src/model.js';

const root = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('-n', 41);
if (!(await loadCore(fs.readFileSync(path.join(root, 'tex/vendor/core/rikuy-core.wasm'))))) throw new Error('the core did not load');

function generated(paras = 3000) {
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const words = 'the model of capital and trade is identified from a shock to demand when commitment absent regulator estimator regions price index transition coalition voter persistence baseline sample'.split(' ');
  const out = ['\\documentclass[11pt]{article}', '\\usepackage{amsmath,amssymb}', '\\usepackage{natbib}', '\\usepackage{hyperref}',
    '\\newcommand{\\R}{\\mathbb{R}}', '\\newcommand{\\E}[1]{\\mathbb{E}\\left[#1\\right]}', '\\title{Generated}', '\\author{A}', '\\begin{document}', '\\maketitle', ''];
  for (let p = 0; p < paras; p++) {
    if (p % 60 === 0) out.push('\\section{Part ' + (p / 60 + 1) + '}\\label{sec:' + p + '}', '');
    const w = [];
    for (let k = 0, n = 12 + Math.floor(rnd() * 8); k < n; k++) {
      const r = rnd();
      w.push(r < 0.04 ? '$x_{' + k + '} = \\alpha + \\beta y$' : r < 0.06 ? '\\textbf{' + pick(words) + '}' : r < 0.08 ? '\\emph{' + pick(words) + ' ' + pick(words) + '}'
        : r < 0.09 ? '\\citep{ref' + Math.floor(rnd() * 40) + '}' : r < 0.10 ? 'Section~\\ref{sec:' + 60 * Math.floor(rnd() * (p / 60 + 1)) + '}' : pick(words));
    }
    out.push(w.join(' ') + '.');
    if (p % 25 === 12) out.push('', '\\begin{equation}\\label{eq:' + p + '}', '  y_t = \\E{x_t} + \\sum_{i=1}^{n} \\gamma_i z_{it} + \\varepsilon_t', '\\end{equation}');
    out.push('');
  }
  out.push('\\end{document}', '');
  return out.join('\n');
}

const docs = [];
for (const d of fs.readdirSync(path.join(root, 'dev/bench')).sort()) {
  const dir = path.join(root, 'dev/bench', d), files = new Map();
  if (!fs.existsSync(path.join(dir, 'main.tex'))) continue;
  for (const n of fs.readdirSync(dir)) if (/\.(tex|bib)$/.test(n)) files.set(n, fs.readFileSync(path.join(dir, n), 'utf8'));
  docs.push([d, files]);
}
docs.push(['generated', new Map([['main.tex', generated()]])]);

// the two builds one after the other in every round, so a slower stretch of the machine (or of
// the collector) falls on both
const both = (f) => {
  for (let w = 0; w < 30; w++) { setNativeParse(null); f(w); setNativeParse(nativeParse); f(w); }
  const a = [], b = [];
  for (let i = 0; i < N; i++) {
    const order = i & 1;
    for (const which of order ? [1, 0] : [0, 1]) {
      setNativeParse(which ? nativeParse : null);
      const t = performance.now(); f(i); (which ? b : a).push(performance.now() - t);
    }
  }
  const med = (t) => t.sort((x, y) => x - y)[t.length >> 1];
  const js = med(a), c = med(b);
  return { js: +js.toFixed(3), core: +c.toFixed(3), x: +(js / c).toFixed(2) };
};

const rows = [];
for (const [name, files] of docs) {
  const src = files.get('main.tex');
  const sigs = scanUserSigs(src, {});
  const mid = src.indexOf('\n\n', src.length >> 1) + 2;
  const typed = (i) => src.slice(0, mid) + 'xyz'.slice(0, 1 + (i % 3)) + src.slice(mid);
  for (let w = 0; w < 200; w++) { parseJS(typed(w), sigs); nativeParse(typed(w), sigs); }
  const parseRow = both((i) => parse(typed(i), { userSigs: sigs }));
  const prev = buildModel({ files, main: 'main.tex' });
  const key = both((i) => { const f = new Map(files); f.set('main.tex', typed(i)); buildModel({ files: f, main: 'main.tex' }, prev); });
  const first = both((i) => { const f = new Map(files); f.set('main.tex', src + ' '.repeat(1 + (i % 7))); buildModel({ files: f, main: 'main.tex' }); });
  rows.push({ doc: name, KB: Math.round(src.length / 1024), parse: parseRow, keystroke: key, firstLoad: first });
}
setNativeParse(nativeParse);
console.log('doc'.padEnd(10), 'KB'.padStart(4), '| parse: JS  core   x    | keystroke model: JS  core  x  | first load model: JS  core  x');
for (const r of rows) {
  const f = (o) => String(o.js).padStart(8) + String(o.core).padStart(8) + String(o.x).padStart(6);
  console.log(r.doc.padEnd(10), String(r.KB).padStart(4), '|', f(r.parse), '|', f(r.keystroke), '|', f(r.firstLoad));
}
const out = arg('--json');
if (out) fs.writeFileSync(out, JSON.stringify({ n: N, node: process.version, rows }, null, 1) + '\n');
