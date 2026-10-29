// Share links, comments in the source and the three way merge (src/share.js).
import assert from 'node:assert/strict';
import { packShare, unpackShare, shareParam, findComments, commentEdit, stripComments, merge3, mergeProjects, commentOnly } from '../src/share.js';
import { changes } from '../src/diff.js';
import { TeXEngine } from '../src/tex.js';

let n = 0;
const ok = (name, f) => Promise.resolve(f()).then(() => { n++; }, (e) => { console.error('FAIL', name); throw e; });
const apply = (t, e) => t.slice(0, e.s) + e.t + t.slice(e.e);

const DOC = '\\documentclass{article}\n\\begin{document}\nThe source map is exact.\nSecond line here.\n\n\\begin{verbatim}\n50% done\n\\end{verbatim}\nLast.\\end{document}';

await ok('a link round trips, unicode and all', async () => {
  const o = { v: 1, name: 'Paper', main: 'main.tex', files: [['main.tex', DOC + ' ü — ∑ 😀'], ['refs.bib', '@article{a,}']], base: 'abc', by: 'Ana', role: 'coauthor' };
  const s = await packShare(o);
  assert.match(s, /^1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await unpackShare(s), o);
  assert.equal(shareParam('https://x.test/rikuy/#share=' + s), s);
  assert.equal(shareParam('#a=1&share=' + s), s);
  assert.equal(shareParam('https://x.test/'), null);
  await assert.rejects(unpackShare('2.abc'));
});

await ok('a hostile link is refused, not opened', async () => {
  const doc = (o) => packShare({ v: 1, name: 'x', main: 'main.tex', files: [['main.tex', 'x']], ...o });
  // names that would leave the project's folder, or reach its git repository
  for (const bad of ['../../texlive/texmf-dist/tex/latex/base/article.cls', 'a/../../b.tex', '.git/config', 'a\u0000.tex', '', 7]) {
    await assert.rejects(unpackShare(await doc({ files: [['main.tex', 'x'], [bad, 'y']] })), String(bad));
  }
  await assert.rejects(unpackShare(await doc({ files: [['main.tex', { toString: 1 }]] })));
  await assert.rejects(unpackShare(await doc({ main: 'other.tex' })));
  await assert.rejects(unpackShare(await doc({ files: Array.from({ length: 2001 }, (_, i) => ['f' + i + '.tex', '']) })));
  await assert.rejects(unpackShare('1.%E0%A4%A'));
  await assert.rejects(unpackShare('1.!!!!'));
  // a small link that inflates past the cap (64 MB of spaces): refused, quickly
  const zlib = await import('node:zlib');
  const z = zlib.deflateRawSync(Buffer.concat([Buffer.from('{"files":[["main.tex","'), Buffer.alloc(64e6, 32), Buffer.from('"]],"main":"main.tex"}')]), { level: 9 });
  const t0 = Date.now();
  await assert.rejects(unpackShare('1.' + z.toString('base64url')), /too large/);
  assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + ' ms');
  // backslashes, ./ and a leading / are tidied, other fields become strings of a sane length
  const o = await unpackShare(await doc({ files: [['main.tex', 'x'], ['figs\\a.tex', 'y'], ['./b.tex', 'z'], ['/abs/c.tex', 'w']], name: { a: 1 }, by: 'B'.repeat(5000), role: 'admin' }));
  assert.deepEqual(o.files.map((f) => f[0]), ['main.tex', 'figs/a.tex', 'b.tex', 'abs/c.tex']);
  assert.equal(o.name, 'main.tex');
  assert.equal(o.by.length, 200);
  assert.equal(o.role, 'coauthor');
});

await ok('a long document makes a short link', async () => {
  const body = Array.from({ length: 400 }, (_, i) => 'Sentence number ' + i + ' of a paper about mechanism design.').join('\n');
  const s = await packShare({ v: 1, name: 'x', main: 'main.tex', files: [['main.tex', body]] });
  assert.ok(s.length < body.length / 4, s.length + ' vs ' + body.length);
});

await ok('a comment goes on its own line under the line it is about', () => {
  const p = DOC.indexOf('source map');
  const e = commentEdit(DOC, p, { who: 'Ana (supervisor)', quote: 'source  map', body: 'Is this\nthe right term?' });
  const t = apply(DOC, e);
  assert.ok(t.includes('The source map is exact.\n% comment (Ana supervisor) on "source map": Is this the right term?\nSecond line'));
  const c = findComments(t, 'main.tex');
  assert.equal(c.length, 1);
  assert.equal(c[0].who, 'Ana supervisor');
  assert.equal(c[0].quote, 'source map');
  assert.equal(t.slice(c[0].as, c[0].ae), 'The source map is exact.');
  // a reply hangs under it, another comment on the same line after both
  const t2 = apply(t, commentEdit(t, c[0].e - 1, { who: 'Pedro', body: 'Yes.', reply: true }));
  const t3 = apply(t2, commentEdit(t2, p, { who: 'Ana', body: 'And this?' }));
  const c3 = findComments(t3, 'main.tex');
  assert.equal(c3.length, 2);
  assert.deepEqual(c3[0].replies, [{ who: 'Pedro', body: 'Yes.' }]);
  assert.equal(c3[1].body, 'And this?');
  assert.equal(t3.slice(c3[1].as, c3[1].ae), 'The source map is exact.');
  assert.equal(stripComments(t3), DOC);
});

await ok('no comment where TeX would print it or before the document', () => {
  assert.equal(commentEdit(DOC, DOC.indexOf('50%'), { who: 'A', body: 'x' }), null);
  assert.equal(commentEdit(DOC, 3, { who: 'A', body: 'x' }), null);
  assert.equal(commentEdit(DOC, DOC.indexOf('Second'), { who: 'A', body: '   ' }), null);
  assert.notEqual(commentEdit(DOC, DOC.indexOf('Last'), { who: 'A', body: 'x' }), null);
});

await ok('a comment on the last line, which has no line end', () => {
  const t = 'a\\begin{document}\nend';
  const e = commentEdit(t, t.length - 1, { who: 'A', body: 'x' });
  assert.equal(apply(t, e), 'a\\begin{document}\nend\n% comment (A): x\n');
});

await ok('merge keeps both sides when they touch different lines', () => {
  const base = 'one\ntwo\nthree\nfour\n';
  assert.deepEqual(merge3(base, 'one\nTWO\nthree\nfour\n', 'one\ntwo\nthree\nFOUR\n'), { text: 'one\nTWO\nthree\nFOUR\n', clean: true });
  assert.deepEqual(merge3(base, 'one\nTWO\nthree\nfour\n', 'one\ntwo\nTHREE\nfour\n'), { text: 'one\nTWO\nTHREE\nfour\n', clean: true });
  assert.deepEqual(merge3(base, base, 'x\n'), { text: 'x\n', clean: true });
  assert.deepEqual(merge3(base, 'y\n', base), { text: 'y\n', clean: true });
  assert.equal(merge3(base, 'one\nTWO\nthree\nfour\n', 'one\nTwo!\nthree\nfour\n').clean, false);
  // an insertion right before a line the other side replaced
  assert.deepEqual(merge3(base, 'one\nnew\ntwo\nthree\nfour\n', 'one\nTWO\nthree\nfour\n'), { text: 'one\nnew\nTWO\nthree\nfour\n', clean: true });
  // a conflict on one line must keep the author's edits on lines the other side did not touch,
  // not drop the whole copy: both change line 3, only the author changed lines 1 and 5
  const five = 'one\ntwo\nthree\nfour\nfive\n';
  assert.deepEqual(
    merge3(five, 'ONE\ntwo\nthree-mine\nfour\nFIVE\n', 'one\ntwo\nthree-theirs\nfour\nfive\n'),
    { text: 'ONE\ntwo\nthree-theirs\nfour\nFIVE\n', clean: false });
});

await ok('merge of whole projects', () => {
  const m = (o) => new Map(Object.entries(o));
  const r = mergeProjects(m({ 'a.tex': 'a\n', 'b.tex': 'b\n', 'c.tex': 'c\n' }), m({ 'a.tex': 'A\n', 'b.tex': 'b\n', 'c.tex': 'c\n', 'mine.tex': 'm\n' }), m({ 'a.tex': 'a\n', 'c.tex': 'C\n', 'new.tex': 'n\n' }));
  assert.deepEqual(Object.fromEntries(r.files), { 'a.tex': 'A\n', 'c.tex': 'C\n', 'mine.tex': 'm\n', 'new.tex': 'n\n' });
  assert.deepEqual(r.conflicts, []);
});

await ok('a change that only adds a comment is told apart from a change to the text', () => {
  const t = apply(DOC, commentEdit(DOC, DOC.indexOf('Second'), { who: 'Ana', body: 'Hm.' }));
  const cs = changes(DOC, t, 'main.tex');
  assert.ok(cs.length && cs.every(commentOnly), JSON.stringify(cs));
  const t2 = t.replace('Second line', 'Second LINE');
  assert.ok(changes(DOC, t2, 'main.tex').some((c) => !commentOnly(c)));
});

await ok('the worker that compiled a document from a link is let go before anything else', async () => {
  const e = new TeXEngine('https://x.test/tex/');
  let workers = 0, resets = 0;
  e.start = async () => { if (!e.worker) { workers++; e.worker = { postMessage() {}, terminate() {} }; } };
  const reset = e.reset.bind(e);
  e.reset = () => { resets++; reset(); };
  const run = (project, untrusted) => { e.compile({ project, files: [], main: 'main.tex', untrusted }).catch(() => {}); return new Promise((r) => setTimeout(r, 0)); };
  await run('mine|main.tex', false);
  await run('mine|main.tex', false);
  assert.deepEqual([workers, resets], [1, 0]);
  await run('link|main.tex', true);
  await run('link|main.tex', true);
  assert.deepEqual([workers, resets], [1, 0], 'the same document from a link keeps its worker');
  await run('mine|main.tex', false);
  assert.deepEqual([workers, resets], [2, 1], 'another project gets a fresh worker');
  await run('link|main.tex', true);
  await run('link2|main.tex', true);
  assert.deepEqual([workers, resets], [3, 2], 'so does another document from a link');
});

console.log(n + '/' + n + ' passed');
