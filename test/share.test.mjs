// Share links, comments in the source and the three way merge (src/share.js).
import assert from 'node:assert/strict';
import { packShare, unpackShare, shareParam, texParam, unpackTex, findComments, commentEdit, stripComments, merge3, mergeProjects, commentOnly } from '../src/share.js';
import { changes } from '../src/diff.js';
import { TeXEngine } from '../src/tex.js';

import zlib from 'node:zlib';
import { llms, llmsFull, robots, sitemap, structured } from '../build/app.mjs';

let n = 0;
const ok = (name, f) => Promise.resolve(f()).then(() => { n++; }, (e) => { console.error('FAIL', name); throw e; });
const apply = (t, e) => t.slice(0, e.s) + e.t + t.slice(e.e);

const DOC = '\\documentclass{article}\n\\begin{document}\nThe source map is exact.\nSecond line here.\n\n\\begin{verbatim}\n50% done\n\\end{verbatim}\nLast.\\end{document}';

// llms.txt tells an agent how to make a link by hand: the recipe there must give a link the
// page opens, and its example must be the JSON the page reads
await ok('a link built by llms.txt\'s recipe opens', async () => {
  const guide = llms();
  const line = guide.split('\n').map((l) => l.trim()).find((l) => l.startsWith('{"v":1'));
  assert.ok(line, 'the guide shows the JSON');
  const example = JSON.parse(line);
  assert.deepEqual(Object.keys(example), ['v', 'name', 'main', 'files', 'by']);
  assert.ok(example.files[0][1].startsWith('\\documentclass'), 'the example escapes its backslash as JSON does');
  const o = { v: 1, name: 'From an agent', main: 'main.tex', files: [['main.tex', DOC + ' ü ∑']], by: 'An agent' };
  // raw DEFLATE, base64url without padding, after "1."
  const payload = zlib.deflateRawSync(Buffer.from(JSON.stringify(o), 'utf8'), { level: 9 }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const m = /^\s*(https:\/\/\S+)#share=1\.<payload>$/m.exec(guide);
  assert.ok(m, 'the guide shows the link');
  const got = await unpackShare(shareParam(m[1] + '#share=1.' + payload));
  assert.equal(got.main, 'main.tex');
  assert.equal(got.files[0][1], DOC + ' ü ∑');
  assert.equal(got.by, 'An agent');
  assert.ok(/compressobj\(9, zlib\.DEFLATED, -15\)/.test(guide), 'the Python lines ask for raw DEFLATE');
});

// a link with the LaTeX itself as base64url after #tex=, no compression
await ok('a #tex= link gives its LaTeX back, unicode and all', () => {
  const text = DOC + ' ü — ∑ 😀 中文 عربي';
  const want = { v: 1, name: 'main.tex', main: 'main.tex', files: [['main.tex', text]], base: null, by: '', role: 'coauthor', own: true };
  const url = Buffer.from(text, 'utf8').toString('base64url');
  assert.match(url, /^[A-Za-z0-9_-]+$/);
  assert.equal(texParam('https://x.test/rikuy/#tex=' + url), url);
  assert.deepEqual(unpackTex(texParam('https://x.test/rikuy/#tex=' + url)), want);
  // Python's urlsafe_b64encode pads with =, and most other tools write + and /: read as well,
  // also when a program wrote the = as %3D
  const padded = Buffer.from(text + '!', 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  assert.ok(padded.endsWith('='));
  assert.equal(unpackTex(texParam('https://x.test/#tex=' + padded)).files[0][1], text + '!');
  assert.equal(unpackTex(texParam('https://x.test/#tex=' + padded.replace(/=/g, '%3D'))).files[0][1], text + '!');
  const plain = Buffer.from('\\documentclass{article}\\begin{document}>>>???~~~\\end{document}', 'utf8').toString('base64');
  assert.ok(/[+/]/.test(plain), 'the example has a + or a /');
  assert.equal(unpackTex(texParam('#tex=' + plain)).files[0][1], '\\documentclass{article}\\begin{document}>>>???~~~\\end{document}');
  // in the fragment only, alone or after another part of it
  assert.equal(texParam('#a=1&tex=QUJD'), 'QUJD');
  assert.equal(texParam('https://x.test/render?tex=QUJD'), null);
  assert.equal(texParam('https://x.test/#latex=QUJD'), null);
  assert.equal(texParam('https://x.test/'), null);
  assert.equal(texParam('#tex='), '');
  // a share link is still a share link
  assert.equal(shareParam('#tex=QUJD'), null);
});

// llms.txt's recipe for it: the link it shows and its line of Python give a link that opens
await ok('a #tex= link built by llms.txt\'s recipe opens', () => {
  const guide = llms();
  const m = /^\s*(https:\/\/\S+)#tex=<base64url of the LaTeX source as UTF-8>$/m.exec(guide);
  assert.ok(m, 'the guide shows the link');
  assert.ok(/#tex=" \+ base64\.urlsafe_b64encode\(tex\.encode\("utf-8"\)\)\.decode\(\)/.test(guide), 'the Python line');
  // what that line gives: base64url with its padding
  const link = m[1] + '#tex=' + Buffer.from(DOC + ' ü ∑', 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  assert.equal(unpackTex(texParam(link)).files[0][1], DOC + ' ü ∑');
});

await ok('a hostile or broken #tex= link is refused, with a reason', () => {
  const b64 = (x) => Buffer.from(x).toString('base64url');
  for (const bad of ['', '!!!!', 'A', 'QUJD*', '%E0%A4%A', b64([0xff, 0xfe, 0x41]), b64([0xc3]), b64('   \n\t ')]) assert.throws(() => unpackTex(bad), /damaged or cut short|does not hold a document/, JSON.stringify(bad));
  assert.throws(() => unpackTex(b64('   ')), /does not hold a document/);
  assert.throws(() => unpackTex(b64([0xff])), /damaged or cut short/);
  // the limit: a million characters of base64 pass, one more does not, and neither takes long
  const t0 = Date.now();
  const full = b64('a'.repeat(750000 - 14) + '\\end{document}');
  assert.equal(full.length, 1e6);
  assert.equal(unpackTex(full).files[0][1].length, 750000);
  assert.throws(() => unpackTex('YWFh'.repeat(250000) + 'YWFh'), /too large to open: a #tex= link holds up to 750 kB/);
  assert.throws(() => unpackTex('%41'.repeat(400000)), /too large/);
  assert.throws(() => unpackTex('A'.repeat(64e6)), /too large/);
  assert.ok(Date.now() - t0 < 1500, 'in ' + (Date.now() - t0) + ' ms');
  // what is in it is text and stays text: one file under a fixed name, nothing else settable
  const o = unpackTex(b64('<img src=x onerror=alert(1)>\\input{../../etc/passwd}\u0000\\end{document}'));
  assert.deepEqual([o.name, o.main, o.files.length, o.files[0][0], o.by, o.role, o.base], ['main.tex', 'main.tex', 1, 'main.tex', '', 'coauthor', null]);
  assert.equal(o.files[0][1], '<img src=x onerror=alert(1)>\\input{../../etc/passwd}\u0000\\end{document}');
  // cut at a multiple of four characters the base64 still decodes: refused all the same, as the
  // document has lost its end; and so is text that never was a document
  const whole = b64(DOC);
  for (const n of [40, 100, whole.length - 20 - (whole.length - 20) % 4]) assert.throws(() => unpackTex(whole.slice(0, n)), /cut short, or what it holds is not a whole LaTeX document/, 'cut at ' + n);
  assert.throws(() => unpackTex(b64('hello world')), /not a whole LaTeX document: it has no \\end\{document\}/);
  assert.equal(unpackTex(b64(DOC + '% a comment after the end\n')).files[0][1], DOC + '% a comment after the end\n');
  // a pattern that cannot be made slow: a megabyte with no payload in it
  const t1 = Date.now();
  assert.equal(texParam('#' + 'a&'.repeat(500000) + 'x'), null);
  assert.equal(texParam('#'.repeat(1e6)), null);
  assert.ok(Date.now() - t1 < 1000, 'in ' + (Date.now() - t1) + ' ms');
});

// "by" is optional in a link built by hand: without it there is nobody to be the guest of
await ok('a link that names no sender opens as the reader\'s own document', async () => {
  const link = (o) => packShare({ v: 1, main: 'main.tex', files: [['main.tex', DOC]], ...o });
  const o = await unpackShare(await link({}));
  assert.equal(o.own, true);
  assert.equal(o.name, 'main.tex', 'named by its main file');
  assert.equal((await unpackShare(await link({ by: '   ' }))).own, true);
  assert.equal((await unpackShare(await link({ by: 7 }))).own, true);
  assert.equal('own' in (await unpackShare(await link({ by: 'Ana' }))), false);
  assert.equal('own' in (await unpackShare(await link({ role: 'back' }))), false, 'a copy coming back is never one\'s own');
  assert.equal('own' in (await unpackShare(await link({ by: 'Ana', own: true }))), false, 'the link cannot say so itself');
});

// what the guide says must be what the page does: the limits and names it gives are checked
// where they are made (test/agent.py does the clicking)
await ok('llms.txt says what is so, and llms-full.txt adds to it', () => {
  const guide = llms(), full = llmsFull();
  assert.ok(!/no fonts yet/.test(guide), 'the old limit is gone');
  assert.ok(/no fonts for scripts beyond those named above: none for Khmer, Lao, Tibetan, Georgian,\s+Armenian or Ethiopic/.test(guide));
  for (const h of ['## Handing a person a document', '## For agents with JavaScript access', '## For agents that click', '## Where documents are kept', '## What it cannot do', '## Facts']) assert.ok(guide.includes('\n' + h + '\n'), h);
  for (const k of ['version', 'whenReady()', 'getSource()', 'getFiles()', 'setSource(text)', 'compile()', 'needs()', 'setUpScripts()']) assert.ok(guide.includes('\n- ' + k + ':'), k);
  assert.ok(/- Version: \d+\.\d+\.\d+\n/.test(guide) && /- Questions and problems: https:\/\/\S+\/issues\n/.test(guide));
  assert.ok(/up to 750 kB of LaTeX \(1,000,000\s+characters of base64\)/.test(guide), 'the limit unpackTex has');
  // the sizes it gives are the sample's
  assert.ok(full.startsWith(guide) && full.length > guide.length + 4000);
  for (const h of ['## Keyboard', '## Engines and programs', '## The sample document']) assert.ok(full.includes('\n' + h + '\n'), h);
  const sample = /```latex\n([\s\S]*?)\n```/.exec(full)[1];
  assert.ok(sample.startsWith('\\documentclass') && sample.endsWith('\\end{document}'));
  const tex = Buffer.from(sample + '\n', 'utf8').toString('base64url').length;
  assert.ok(Math.abs(tex - 6300) < 100, 'the #tex= link of the sample is ' + tex + ' characters');
});

await ok('robots.txt, the sitemap and the page\'s data for search engines', () => {
  const r = robots();
  assert.ok(r.startsWith('User-agent: *\nAllow: /\n'));
  for (const a of ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'Amazonbot', 'meta-externalagent']) assert.ok(r.includes('\nUser-agent: ' + a + '\nAllow: /\n'), a);
  assert.ok(!/Disallow/i.test(r) && /\nSitemap: https:\/\/\S+\/sitemap\.xml\n$/.test(r));
  const locs = [...sitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, 3);
  assert.ok(locs[1] === locs[0] + 'llms.txt' && locs[2] === locs[0] + 'llms-full.txt');
  const s = structured();
  assert.deepEqual([s['@context'], s['@type'], s.name, s.operatingSystem, s.offers.price, s.url], ['https://schema.org', 'SoftwareApplication', 'Rikuy', 'Any (web browser)', '0', locs[0]]);
  assert.ok(/^\d+\.\d+\.\d+$/.test(s.softwareVersion) && /^https:\/\/github\.com\//.test(s.sameAs) && s.description.length > 40 && s.applicationCategory);
});

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
