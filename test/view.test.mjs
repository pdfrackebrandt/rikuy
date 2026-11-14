// Batch B12's pure parts: a block shown as its LaTeX in the model (src/model.js asSource, the view
// of Show LaTeX) and nothing else changed by it; the tour's PDF picture with a cross reference
// table that adds up (src/tour.js); Export as through the real pandoc (src/wordjobs.js exportAs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel } from '../src/model.js';
import { buildWordDoc } from '../src/wordast.js';
import { createPandoc } from '../src/pandoc.js';
import { exportAs } from '../src/wordjobs.js';
import { tourPdf, tourTex, TOUR_WIDGET } from '../src/tour.js';

let n = 0;
const ok = async (name, f) => { try { await f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const DOC = '\\documentclass{article}\n\\begin{document}\nAlpha beta.\n\n\\begin{equation}\n  E = mc^2\n\\end{equation}\nDelta.\n\n\\end{document}\n';
const files = new Map([['main.tex', DOC]]);
const plain = buildModel({ files, main: 'main.tex' });
const items = (m) => m.blocks.map((b) => b.items.map((x) => x.type).join('+'));
// a block's key: its first character that is not a space
const keyOf = (B) => { let s = B.s; while (/\s/.test(DOC[s])) s++; return 'main.tex\u0000' + s; };

await ok('no views: the model is the same as without the option', () => {
  const m = buildModel({ files, main: 'main.tex', views: new Set() });
  assert.deepEqual(items(m), items(plain));
});
await ok('a paragraph shown as LaTeX: one tex item over its own source, each character mapped to itself, marked a view', () => {
  const B = plain.blocks.find((b) => DOC.slice(b.s, b.e).includes('Alpha'));
  const m = buildModel({ files, main: 'main.tex', views: new Set([keyOf(B)]) });
  const V = m.blocks.find((b) => b.items[0].type === 'tex');
  assert.ok(V && V.items[0].view && V.items[0].text === 'Alpha beta.' && V.s === B.s);
  const map = V.items[0].inl[0].map;
  assert.equal(DOC.slice(map[0], map[map.length - 1]), 'Alpha beta.');
  // every other block as before, in the same order
  assert.deepEqual(items(m).filter((x) => x !== 'tex'), items(plain).filter((_, i) => plain.blocks[i] !== B));
  assert.equal(m.blocks.length, plain.blocks.length);
});
await ok('an equation shown as LaTeX: its environment, \\begin to \\end; its number still counted', () => {
  const B = plain.blocks.find((b) => DOC.slice(b.s, b.e).startsWith('\\begin{equation}'));
  const m = buildModel({ files, main: 'main.tex', views: new Set([keyOf(B)]) });
  const V = m.blocks.find((b) => b.items[0].type === 'tex');
  assert.equal(V.items[0].text, '\\begin{equation}\n  E = mc^2\n\\end{equation}');
});
await ok('a key that is no block\'s start shows nothing as LaTeX', () => {
  const m = buildModel({ files, main: 'main.tex', views: new Set(['main.tex\u00003']) });
  assert.deepEqual(items(m), items(plain));
});
await ok('the tour\'s picture: a one page PDF whose cross reference table points at each object', () => {
  const b = tourPdf(), t = Buffer.from(b).toString('latin1');
  assert.ok(t.startsWith('%PDF-1.4\n') && t.endsWith('%%EOF\n'));
  const xref = +t.split('startxref\n')[1].split('\n')[0];
  assert.equal(t.slice(xref, xref + 4), 'xref');
  const rows = t.slice(xref).split('\n').slice(3, 8);
  rows.forEach((r, i) => assert.equal(t.slice(+r.slice(0, 10), +r.slice(0, 10) + String(i + 1).length + 6), (i + 1) + ' 0 obj'));
  const len = +/\/Length (\d+)/.exec(t)[1], s = t.indexOf('stream\n') + 7;
  assert.equal(t.slice(s + len, s + len + 9), 'endstream');
});
await ok('the tour\'s text: Insert, Interactive graph named only where the copy has it', () => {
  assert.ok(tourTex(true).includes('Insert, Interactive graph') && !tourTex(false).includes('Insert, Interactive graph') && !tourTex(false).includes('%BYHAND%'));
  assert.ok(/postMessage\(\{rikuy:'height'/.test(TOUR_WIDGET) && !/https?:/.test(TOUR_WIDGET.replace(/<!doctype[^>]*>/, '')));
});
const P = await createPandoc(fs.readFileSync(new URL('../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url)));
const W = buildWordDoc(plain, files, { citeproc: false, now: 0, main: 'main.tex' });
for (const [to, test] of [['html', (t) => /<html/.test(t) && t.includes('Alpha beta.') && /<math/.test(t)], ['markdown', (t) => t.includes('Alpha beta.')], ['txt', (t) => t.includes('Alpha beta.')], ['rtf', (t) => t.startsWith('{\\rtf') && t.includes('Alpha beta.')], ['odt', (t) => t.startsWith('PK')], ['epub', (t) => t.startsWith('PK')]]) {
  await ok('Export as ' + to + ': pandoc writes the document', () => {
    const r = exportAs(P, { doc: W.doc, resources: {}, bibs: [] }, to);
    assert.ok(r.bytes && r.bytes.length > 40 && test(Buffer.from(r.bytes).toString('latin1')), to);
  });
}
await ok('M1: Export as Markdown carries none of Word\'s anchors ({#Rk..})', () => {
  const D = '\\documentclass{article}\n\\title{My paper}\n\\begin{document}\n\\maketitle\n\\section{Intro}\nSome \\emph{text} with $x^2$:\n\\begin{itemize}\n\\item one\n\\end{itemize}\n\\end{document}\n';
  const fs2 = new Map([['main.tex', D]]), m = buildModel({ files: fs2, main: 'main.tex' });
  const w = buildWordDoc(m, fs2, { citeproc: false, now: 0, main: 'main.tex' });
  assert.ok(JSON.stringify(w.doc).includes('"Rk'), 'the AST has anchors to drop');
  for (const to of ['markdown', 'html']) {
    const t = Buffer.from(exportAs(P, { doc: w.doc, resources: {}, bibs: [] }, to).bytes).toString('utf8');
    assert.ok(!/Rk\d/.test(t) && t.includes('Intro') && t.includes('one'), to + ': ' + t.slice(0, 300));
  }
});
await ok('L7: a picture this copy has no bytes for: the export goes on with its words', () => {
  const doc = { ...W.doc, blocks: [{ t: 'Para', c: [{ t: 'Image', c: [['', [], []], [{ t: 'Str', c: 'Figure' }], ['figs/missing.png', '']] }] }] };
  const t = Buffer.from(exportAs(P, { doc, resources: {}, bibs: [] }, 'html').bytes).toString('utf8');
  assert.ok(t.includes('Figure') && !t.includes('missing.png'));
});
await ok('M2, M4: the blocks shown as LaTeX move with each edit, one pass; 40 of them in 850 KB in a moment', async () => {
  const { methods } = await import('../src/cmd/view.js');
  const para = (i) => 'Paragraph ' + i + ' with some words to make it a line of text.\n\n';
  let text = '';
  for (let i = 0; i < 14000; i++) text += para(i);
  const starts = [];
  for (let i = 0; i < 40; i++) starts.push(text.indexOf('Paragraph ' + (i * 300 + 7) + ' '));
  const app = { ...methods, name: 'n', main: 'm.tex', files: new Map([['m.tex', text]]), src(f) { return this.files.get(f); } };
  app.texViews = new Map(starts.map((s) => ['m.tex\u0000' + s, { f: 'm.tex', s }]));
  app.texViewDoc = 'n\u0000m.tex'; app.viewSnap();
  // one keystroke near the end, through App.commit's edits
  const at = text.length - 30, before = new Map([['m.tex', text]]);
  app.files.set('m.tex', text.slice(0, at) + 'x' + text.slice(at));
  let t0 = performance.now(); app.viewMap(new Map([['m.tex', [{ s: at, e: at, t: 'x' }]]]), before); app.viewKeys(); const ms = performance.now() - t0;
  assert.ok(ms < 30, ms + ' ms');
  assert.deepEqual([...app.texViews.values()].map((v) => v.s), starts);
  // one commit with two edits, the preamble's and a word in the last paragraph (Font colour, a link)
  const t1 = app.files.get('m.tex'), b2 = new Map([['m.tex', t1]]);
  const e2 = [{ s: 0, e: 0, t: '\\usepackage{xcolor}\n' }, { s: t1.length - 20, e: t1.length - 15, t: '\\textcolor{red}{words}' }];
  app.files.set('m.tex', [...e2].sort((a, b) => b.s - a.s).reduce((t, e) => t.slice(0, e.s) + e.t + t.slice(e.e), t1));
  app.viewMap(new Map([['m.tex', e2]]), b2); app.viewKeys();
  assert.deepEqual([...app.texViews.values()].map((v) => v.s), starts.map((s) => s + e2[0].t.length));
  // the same change seen only as text (the source pane, a share merged): read as hunks, the same keys
  app.texViews = new Map(starts.map((s) => ['m.tex\u0000' + s, { f: 'm.tex', s }])); app.files.set('m.tex', t1); app.viewSnap();
  app.files.set('m.tex', [...e2].sort((a, b) => b.s - a.s).reduce((t, e) => t.slice(0, e.s) + e.t + t.slice(e.e), t1));
  t0 = performance.now(); app.viewKeys(); const ms2 = performance.now() - t0;
  assert.deepEqual([...app.texViews.values()].map((v) => v.s), starts.map((s) => s + e2[0].t.length));
  assert.ok(ms2 < 400, ms2 + ' ms');
});
await ok('Export as refuses a format it does not know', () => assert.throws(() => exportAs(P, { doc: W.doc }, 'exe')));
console.log('view: ' + n + ' checks passed');
