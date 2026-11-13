// How headings look, as the preamble says it (src/looks.js): titlesec's \titleformat and
// \titlespacing read into a look and written back from one, each heading's lines replaced where
// they stand and taken away again; KOMA-Script's \setkomafont; the accent colour; the Design tab's
// style sets read back from the looks they write; and every scan bounded on a stranger's preamble.
import assert from 'node:assert/strict';
import { readHeadLooks, readFormat, titleLines, lookLines, headLookEdits, defaultLook, formatOf, isDefaultLook, komaFontEdits, accentEdits, accentOf, STYLE_SETS, setLooks, setOf, lengthPt } from '../src/looks.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const doc = (pre, cls = 'article') => '\\documentclass{' + cls + '}\n' + pre + '\\begin{document}\nText.\n\\end{document}\n';

ok('a look written as lines reads back as the same look', () => {
  const cases = [
    ['section', { sf: true }], ['section', { align: 'center', color: 'accent' }], ['section', { rule: true }], ['subsection', { bf: false, sc: true, size: 'normalsize' }],
    ['paragraph', { shape: 'hang' }], ['section', { num: false }], ['chapter', { sf: true }], ['subsection', { before: 12, after: 6 }], ['subsubsection', { it: true, bf: false }]
  ];
  for (const [cmd, ch] of cases) {
    const L = { ...defaultLook(cmd, false), ...ch }, lines = lookLines(cmd, L, false), t = doc(lines.join('\n') + '\n');
    const back = readHeadLooks(t, 'article')[cmd];
    for (const k of Object.keys(ch)) assert.equal(back[k], L[k], cmd + ' ' + k + ' ' + lines.join(' | '));
    assert.ok(!isDefaultLook(cmd, back, false), cmd);
  }
  // the format alone: the short form; the shape, the rule or the number: the full one
  assert.deepEqual(lookLines('section', { ...defaultLook('section'), sf: true }), ['\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}']);
  assert.deepEqual(lookLines('section', { ...defaultLook('section'), rule: true }), ['\\titleformat{\\section}[hang]{\\normalfont\\Large\\bfseries}{\\thesection}{1em}{}[\\titlerule]']);
  assert.deepEqual(lookLines('section', defaultLook('section')), []);
  assert.equal(formatOf({ size: 'large', bf: true, color: 'accent', align: 'center' }), '\\normalfont\\large\\bfseries\\color{accent}\\filcenter');
});

ok('a hand written \\titleformat* replaces the class\'s format: what it does not say is the text\'s', () => {
  const L = readHeadLooks(doc('\\usepackage{titlesec}\n\\titleformat*{\\section}{\\Large\\itshape}\n'), 'article').section;
  assert.deepEqual([L.size, L.bf, L.it], ['Large', false, true]);
  const F = readFormat('\\bfseries\\unknownthing{x}\\color{blue}', defaultLook('section'));
  assert.equal(F.color, 'blue');
  assert.equal(F.extra, '\\unknownthing{x}');
  // titlesec's full form without a shape is hang; [display] is kept
  const T = titleLines(doc('\\titleformat{\\chapter}[display]{\\normalfont\\huge\\bfseries}{\\chaptertitlename\\ \\thechapter}{20pt}{\\Huge}\n\\titlespacing*{\\section}{0pt}{12pt plus 2pt}{6pt}\n', 'report'));
  assert.equal(T.chapter.shape, 'display');
  assert.equal(T.section.space.before, '12pt plus 2pt');
  assert.equal(lengthPt('12pt plus 2pt'), 12);
  assert.equal(lengthPt('1cm'), 28.45);
  // in a comment it is none
  assert.deepEqual(readHeadLooks(doc('% \\titleformat*{\\section}{\\itshape}\n'), 'article'), {});
});

ok('the lines replaced where they stand, others of the heading gone, new ones after the last; off takes them away', () => {
  const t = doc('\\usepackage{titlesec}\n\\titleformat*{\\section}{\\itshape}\n\\titleformat*{\\section}{\\scshape}\n\\usepackage{xcolor}\n');
  const L = { ...defaultLook('section'), sf: true };
  const u = applyEdits(t, headLookEdits(t, { section: L }));
  assert.equal(u, doc('\\usepackage{titlesec}\n\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}\n\\usepackage{xcolor}\n'));
  assert.deepEqual(headLookEdits(u, { section: L }), []);
  const v = applyEdits(u, headLookEdits(u, { subsection: { ...defaultLook('subsection'), it: true } }));
  assert.ok(v.includes('\\sffamily}\n\\titleformat*{\\subsection}{\\normalfont\\large\\bfseries\\itshape}\n\\usepackage{xcolor}'), v);
  assert.equal(applyEdits(v, headLookEdits(v, { section: null, subsection: null })), doc('\\usepackage{titlesec}\n\\usepackage{xcolor}\n'));
  // none yet: at the preamble's end; CRLF kept
  const w = doc('').replace(/\n/g, '\r\n'), x = applyEdits(w, headLookEdits(w, { section: L }));
  assert.ok(x.includes('\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}\n\\begin{document}'), x);
  assert.equal(headLookEdits('no preamble', { section: L }), null);
  // a line holding more than the command keeps the rest
  const y = doc('\\titleformat*{\\section}{\\itshape} % mine\n'), z = applyEdits(y, headLookEdits(y, { section: null }));
  assert.ok(z.includes(' % mine\n') && !z.includes('titleformat'), z);
});

ok('KOMA-Script\'s heading font, the accent colour', () => {
  const k = doc('', 'scrartcl');
  assert.equal(readHeadLooks(k, 'scrartcl').section, undefined);
  const k2 = applyEdits(k, komaFontEdits(k, '\\normalfont\\bfseries'));
  assert.ok(k2.includes('\\setkomafont{disposition}{\\normalfont\\bfseries}\n\\begin{document}'));
  assert.equal(readHeadLooks(k2, 'scrartcl').section.sf, false);
  assert.equal(applyEdits(k2, komaFontEdits(k2, null)), k);
  const a = doc('\\usepackage{xcolor}\n'), a2 = applyEdits(a, accentEdits(a, '1F4E79'));
  assert.equal(accentOf(a2), '1F4E79');
  assert.equal(applyEdits(a2, accentEdits(a2, '0E6F70')).includes('{HTML}{0E6F70}'), true);
  assert.equal(applyEdits(a2, accentEdits(a2, null)), a);
});

ok('a style set reads back from the looks it writes; LaTeX\'s is none', () => {
  for (const ch of [false, true]) for (const S of STYLE_SETS) {
    const want = setLooks(S, ch, false), t = applyEdits(doc('', ch ? 'report' : 'article'), headLookEdits(doc('', ch ? 'report' : 'article'), want) || []);
    const looks = readHeadLooks(t, ch ? 'report' : 'article');
    assert.equal((setOf(looks, ch, false) || {}).id, S.id, S.id + ' ' + ch);
  }
  assert.equal(setOf({}, false, false).id, 'latex');
});

ok('a stranger\'s preamble: bounded scans', () => {
  const big = doc('\\titleformat{\\section}' + '{'.repeat(50000) + '\n' + '\\titleformat*{\\section}{'.repeat(2000) + '\n' + ' '.repeat(100000) + '\n');
  const t0 = Date.now();
  readHeadLooks(big, 'article'); headLookEdits(big, { section: defaultLook('section') }); accentOf(big); komaFontEdits(big, null);
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
});

console.log('looks: ' + n + ' groups of checks passed');
