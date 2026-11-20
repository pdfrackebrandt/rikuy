// The editor model on the sample document: prints its blocks, and checks that every character
// on the page maps back to the source text that makes it.
import fs from 'fs';
import { buildModel } from '../src/model.js';
// the repository's sample/, found from this file rather than the working folder
const sample = (n) => fs.readFileSync(new URL('../sample/' + n, import.meta.url), 'utf8');
const files = new Map([['main.tex', sample('main.tex')], ['refs.bib', sample('refs.bib')]]);
const t0 = performance.now();
const M = buildModel({ files, main: 'main.tex' });
const t1 = performance.now();
console.log('build ms', (t1-t0).toFixed(1), 'blocks', M.blocks.length, 'words', M.words, 'warn', M.warn);
const src = files.get('main.tex');
const show = (inl) => inl.map(x => x.k==='seg' ? x.t : x.k==='sty' ? `<${x.st}>${show(x.kids)}</${x.st}>` : x.k==='chr' ? `[${x.text}]` : x.k==='mac' ? `{mac:${show(x.kids)}}` : `<${x.k}:${x.text||x.tex||x.num||''}>`).join('');
for (const b of M.blocks) {
  for (const it of b.items) {
    let d = it.type;
    if (it.type==='p') d += (it.indent?' ind':'') + (it.lead? ' lead='+show(it.lead):'') + (it.label? ' label='+show(it.label):'') + ' | ' + show(it.inl).slice(0,110);
    if (it.type==='h') d += ' '+it.level+' '+it.num+' '+show(it.inl);
    if (it.type==='math') d += ' '+it.env+' tags='+it.tags+' '+it.tex.slice(0,60);
    if (it.type==='title') d += ' '+show(it.title)+' / '+it.authors.map(show).join(' & ')+' / '+show(it.date||[]);
    if (it.type==='float') d += ' '+it.kind+' '+it.num+' parts='+it.parts.map(p=>p.type).join(',');
    if (it.type==='refs') d += ' '+it.entries.map(e=>e.runs.map(r=>r.t).join('')).join('\n      ');
    console.log(' ', d);
  }
  for (const fn of b.fns) console.log('   fn', fn.num, show(fn.inl));
}
console.log([...M.labels].map(([k,v])=>k+'='+v.num+'('+v.kind+')').join(', '));
// verify seg maps point to sensible source
let bad=0, checked=0;
const check=(inl)=>{ for (const x of inl) { if (x.k==='seg' && !x.ph) { for (let i=0;i<x.t.length;i++){ const s=x.map[2*i], e=x.map[2*i+1]; checked++; const raw=files.get(x.f).slice(s,e); const ch=x.t[i]; if (ch===' ' ? !/^\s+$/.test(raw) && raw!=='~' && !raw.startsWith('\\') : (raw!==ch && !raw.startsWith('\\') && !/^(--|---|``|''|`|'|~)$/.test(raw))) { if(bad<10) console.log('BAD map', JSON.stringify(ch), JSON.stringify(raw)); bad++; } } } if (x.kids) check(x.kids); } };
for (const b of M.blocks) { for (const it of b.items) { if (it.inl) check(it.inl); if (it.lead) check(it.lead); if (it.title) { check(it.title); it.authors.forEach(check);} if (it.parts) it.parts.forEach(p=>{ if (p.inl) check(p.inl); if (p.rows) p.rows.forEach(r=>r.cells.forEach(c=>check(c.inl)));}); } b.fns.forEach(f=>check(f.inl)); }
console.log('map check', checked, 'bad', bad);
if (bad) process.exitCode = 1;

// Live figures (sample/widget): \rikuywidget is one atom whose widget file is resolved from the
// main file's folder, rikuy.sty's own definition is not expanded as a macro, and the block's key
// moves when the widget's text does (so the page draws it again) and only then.
{
  const W = (n) => fs.readFileSync(new URL('../sample/widget/' + n, import.meta.url), 'utf8');
  const wf = new Map([['main.tex', W('main.tex')], ['rikuy.sty', W('rikuy.sty')], ['widgets/clt.html', W('widgets/clt.html')]]);
  const find = (M) => {
    for (const b of M.blocks) for (const it of b.items) for (const p of it.parts || []) for (const x of p.inl || []) if (x.k === 'widget') return { b, it, x };
    return null;
  };
  const M1 = buildModel({ files: wf, main: 'main.tex' });
  const w = find(M1);
  const fails = [];
  if (!w) fails.push('no widget atom');
  else {
    const src = wf.get('main.tex');
    if (src.slice(w.x.s, w.x.e) !== '\\rikuywidget[width=\\textwidth]{widgets/clt.html}{figures/clt.png}') fails.push('atom range ' + JSON.stringify(src.slice(w.x.s, w.x.e)));
    if (w.x.wfile !== 'widgets/clt.html' || w.x.fallback !== 'figures/clt.png' || w.x.opts !== 'width=\\textwidth') fails.push('atom fields ' + JSON.stringify([w.x.wfile, w.x.fallback, w.x.opts]));
    if (w.it.type !== 'float' || !w.it.parts.some((p) => p.type === 'caption')) fails.push('not in a figure with its caption');
    if (M1.textMacros.has('rikuywidget') || M1.warn.length) fails.push('macro or warning: ' + M1.warn.join(','));
    const edited = new Map(wf); edited.set('widgets/clt.html', wf.get('widgets/clt.html').replace('value="4"', 'value="5"'));
    const k2 = find(buildModel({ files: edited, main: 'main.tex' })).b.key;
    const k3 = find(buildModel({ files: new Map(wf), main: 'main.tex' })).b.key;
    if (k2 === w.b.key) fails.push('key unchanged after the widget changed');
    if (k3 !== w.b.key) fails.push('key changed with nothing changed');
    const moved = new Map([['paper/main.tex', src.replace('widgets/clt.html', '../widgets/clt.html')], ['widgets/clt.html', wf.get('widgets/clt.html')]]);
    const m = find(buildModel({ files: moved, main: 'paper/main.tex' }));
    if (!m || m.x.wfile !== 'widgets/clt.html') fails.push('path relative to the main file not resolved');
    const gone = find(buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' }));
    if (!gone || gone.x.wfile !== null) fails.push('a missing widget file resolves');
  }
  console.log('widget model', fails.length ? 'FAIL ' + fails.join('; ') : 'ok');
  if (fails.length) process.exitCode = 1;
}

// A .bib is read once per text (Builder.ensureBib, parsedBib): a build after it gives the same
// model; another text of the same file, or another project's file of the same name, its own
// entries, never the kept ones.
{
  const fails = [];
  const { modelText, bibKept } = await import('../src/model.js');
  const bib = sample('refs.bib');
  const a = modelText(buildModel({ files, main: 'main.tex' }));
  const b = modelText(buildModel({ files: new Map(files), main: 'main.tex' }));
  if (a !== b) fails.push('the same files give the same model with the kept entries');
  const key = (/@\w+\s*\{\s*([^,\s]+)/.exec(bib) || [])[1];
  const changed = bib.replace(/title\s*=\s*\{/i, 'title = {Changed ');
  const m2 = buildModel({ files: new Map([...files, ['refs.bib', changed]]), main: 'main.tex' });
  const e2 = [...m2.bibEntries.values()].find((e) => /^Changed /.test(e.fields.title || ''));
  if (!e2) fails.push('an edited .bib is read again');
  const m3 = buildModel({ files, main: 'main.tex' });
  if ([...m3.bibEntries.values()].some((e) => /^Changed /.test(e.fields.title || ''))) fails.push('the text before the edit gives its own entries again');
  const other = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\\begin{document}\\cite{zz}\\bibliography{refs}\\end{document}'], ['refs.bib', '@book{zz, title={Other}, author={O. Ther}, year={2001}}']]), main: 'main.tex' });
  if (!other.bibEntries.has('zz') || other.bibEntries.has(key)) fails.push('another project\'s refs.bib is its own');
  // (B0's review F3) the kept entries are frozen: a writer throws, and the next build is unchanged
  const one = [...buildModel({ files, main: 'main.tex' }).bibEntries.values()][0];
  let threw = false;
  try { one.fields.title = 'Written'; } catch (e) { threw = true; }
  try { one.key = 'other'; } catch (e) { threw = threw && true; }
  if (!threw || [...buildModel({ files, main: 'main.tex' }).bibEntries.values()].some((e) => e.fields.title === 'Written')) fails.push('a kept entry cannot be written');
  // (F2) what is kept: past the budget the older files go, and the newest stays however large
  const many = (k, n) => Array.from({ length: n }, (_, i) => '@book{k' + k + '_' + i + ', title={T' + i + '}, author={A. Author}, year={2000}}').join('\n');
  const bigBib = many('big', 62000);
  const mb = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\\begin{document}\\cite{kbig_5}\\bibliography{big}\\end{document}'], ['big.bib', bigBib]]), main: 'main.tex' });
  if (bigBib.length < 4e6 || !mb.bibEntries.has('kbig_5')) fails.push('a .bib past the budget is still read (' + bigBib.length + ')');
  const again = buildModel({ files, main: 'main.tex' });
  if (again.bibEntries.has('kbig_5') || a !== modelText(again)) fails.push('another project after it reads its own .bib');
  if (JSON.stringify(bibKept()) !== '["refs.bib"]') fails.push('only what the last build asked for is kept: ' + JSON.stringify(bibKept()));
  // a small .bib of a project closed since is let go too
  buildModel({ files: new Map([['main.tex', '\\documentclass{article}\\begin{document}\\cite{kx_1}\\bibliography{x}\\end{document}'], ['x.bib', many('x', 3)]]), main: 'main.tex' });
  buildModel({ files, main: 'main.tex' });
  if (JSON.stringify(bibKept()) !== '["refs.bib"]') fails.push('a closed project\'s small .bib is let go: ' + JSON.stringify(bibKept()));
  // two files asked together are both kept, past the budget too (the model holds their entries)
  const two = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\\begin{document}\\cite{kbig_5,ksmall_1}\\bibliography{big,small}\\end{document}'], ['big.bib', bigBib], ['small.bib', many('small', 5)]]), main: 'main.tex' });
  if (!two.bibEntries.has('ksmall_1') || !two.bibEntries.has('kbig_5') || JSON.stringify(bibKept().sort()) !== '["big.bib","small.bib"]') fails.push('the files a build asks for stay, past the budget too: ' + JSON.stringify(bibKept()));
  console.log('bib cache', fails.length ? 'FAIL ' + fails.join('; ') : 'ok');
  if (fails.length) process.exitCode = 1;
}
