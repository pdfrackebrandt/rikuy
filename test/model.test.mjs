import fs from 'fs';
import { buildModel } from '../src/model.js';
const files = new Map([['main.tex', fs.readFileSync('sample/main.tex','utf8')], ['refs.bib', fs.readFileSync('sample/refs.bib','utf8')]]);
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
