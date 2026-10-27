// siunitx on the page: what \num, \SI and friends turn into, and whether KaTeX can set it
import katex from 'katex';
import { siTex, siInMath, siUnitSymbol } from '../src/siunitx.js';
import { buildModel } from '../src/model.js';

let bad = 0;
const units = new Map([['EUR', siUnitSymbol('\\text{\\euro}')], ['pixel', siUnitSymbol('px')], ['epoch', siUnitSymbol('epoch')]]);
const T = (name, args, want, opts = {}, lang) => {
  const got = siTex(name, args, opts, units, lang);
  let ok = got === want;
  try { katex.renderToString(got, { throwOnError: true, strict: 'ignore', macros: { '\\Betrag': '1' } }); } catch (e) { ok = false; console.log('  katex:', e.message); }
  if (!ok) { bad++; console.log('FAIL', name, JSON.stringify(args), '\n  got ', got, '\n  want', want); }
};
T('num', { a: '1000' }, '1000');
T('num', { a: '12345' }, '12\\,345');
T('num', { a: '3.14159' }, '3.141\\,59');
T('num', { a: '3.141592' }, '3.141\\,592');
T('num', { a: '1e3' }, '1\\times 10^{3}');
T('num', { a: '-1.6' }, '-1.6');
T('num', { a: '1.234', opt: 'round-mode=places,round-precision=2' }, '1.23');
T('num', { a: '1,5' }, '1.5');
T('num', { a: '1,5' }, '1{,}5', { 'output-decimal-marker': '{,}' });
T('num', { a: '1.5' }, '1{,}5', { locale: 'DE' });
T('num', { a: '2x3' }, '2\\times 3');
T('num', { a: '1.2+-0.1' }, '1.2\\pm 0.1');
T('si', { a: '\\kilo\\hertz' }, '\\mathrm{kHz}');
T('si', { a: '\\meter/\\second^2' }, '\\mathrm{m}\\mathrm{/}\\mathrm{s}\\mathrm{^2}');
T('si', { a: 'm/s^2' }, '\\mathrm{m/s^2}');
T('si', { a: '\\kilo\\bit\\per\\second', opt: 'per-mode=symbol' }, '\\mathrm{kbit}/\\mathrm{s}');
T('si', { a: '\\kilo\\bit\\per\\second' }, '\\mathrm{kbit}\\,\\mathrm{s}^{-1}');
T('si', { a: '\\meter\\per\\square\\second', opt: 'per-mode=fraction' }, '\\frac{\\mathrm{m}}{\\mathrm{s}^{2}}');
T('si', { a: '\\square\\metre' }, '\\mathrm{m}^{2}');
T('si', { a: '\\metre\\cubed' }, '\\mathrm{m}^{3}');
T('SI', { a: '180', b: '\\celsius' }, '180\\,\\mathrm{{}^{\\circ}C}');
T('SI', { a: '30', b: '\\degree' }, '30\\mathrm{{}^{\\circ}}');
T('SI', { a: '99', b: '\\percent' }, '99\\,\\mathrm{\\%}');
T('SI', { a: '6', b: '\\milli\\second' }, '6\\,\\mathrm{ms}');
T('SI', { a: '5', b: '\\micro\\metre' }, '5\\,\\mathrm{\\mu m}');
T('qty', { a: '1000', b: '\\EUR' }, '1000\\,\\mathrm{\\text{€}}');
T('SI', { a: '10', b: '\\pixel' }, '10\\,\\mathrm{px}');
T('SI', { a: '23', b: '\\second\\per\\epoch' }, '23\\,\\mathrm{s}\\,\\mathrm{epoch}^{-1}');
T('SI', { a: '2', b: '\\ohm' }, '2\\,\\mathrm{\\Omega}');
T('SIrange', { a: '50', b: '90', c: '\\percent' }, '50\\,\\mathrm{\\%}\\text{ to }90\\,\\mathrm{\\%}');
T('SIrange', { a: '50', b: '90', c: '\\percent' }, '50\\text{--}90\\,\\mathrm{\\%}', { 'range-phrase': '--', 'range-units': 'single' });
T('numrange', { a: '1', b: '2' }, '1\\text{ bis }2', {}, 'de');
T('numlist', { a: '1;2;3' }, '1\\text{, }2\\text{ and }3');
T('SIlist', { a: '1;2', b: '\\metre' }, '1\\,\\mathrm{m}\\text{ and }2\\,\\mathrm{m}');
T('ang', { a: '1;2;3' }, "1{}^{\\circ}2{}'3{}''");
T('num', { a: '\\Betrag' }, '\\Betrag');
// in a formula
const m = siInMath('N = \\frac{33\\si{\\kilo\\hertz}}{10\\si{\\hertz}} + \\SI[per-mode=symbol]{1}{\\metre\\per\\second}', {}, units, 'en');
const want = 'N = \\frac{33{\\mathrm{kHz}}}{10{\\mathrm{Hz}}} + {1\\,\\mathrm{m}/\\mathrm{s}}';
if (m !== want) { bad++; console.log('FAIL in math\n  got ', m, '\n  want', want); }
try { katex.renderToString(m, { throwOnError: true }); } catch (e) { bad++; console.log('FAIL katex in math', e.message); }
// \sisetup, \DeclareSIUnit and package options reach the page
const src = '\\documentclass{article}\\usepackage[per-mode=symbol]{siunitx}\\DeclareSIUnit\\EUR{\\text{\\euro}}\\sisetup{range-phrase=--}\n\\begin{document}\nA \\qty{5}{\\EUR\\per\\hour} and \\SIrange{1}{2}{\\metre}.\n\\end{document}\n';
const M = buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
const texs = [];
const walk = (inl) => { for (const x of inl || []) { if (x.k === 'math' || x.tex) texs.push(x.tex); if (x.kids) walk(x.kids); } };
for (const b of M.blocks) for (const it of b.items) walk(it.inl);
const w2 = ['5\\,\\mathrm{\\text{€}}/\\mathrm{h}', '1\\,\\mathrm{m}\\text{--}2\\,\\mathrm{m}'];
if (JSON.stringify(texs) !== JSON.stringify(w2)) { bad++; console.log('FAIL model', JSON.stringify(texs), 'want', JSON.stringify(w2)); }
console.log(bad ? bad + ' failed' : 'siunitx ok');
if (bad) process.exitCode = 1;
