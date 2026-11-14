// How headings look, as the preamble says it (src/looks.js): titlesec's \titleformat and
// \titlespacing read into a look and written back from one, each heading's lines replaced where
// they stand and taken away again; KOMA-Script's \setkomafont; the accent colour; the Design tab's
// style sets read back from the looks they write; and every scan bounded on a stranger's preamble.
import assert from 'node:assert/strict';
import { readHeadLooks, readFormat, titleLines, lookLines, headLookEdits, defaultLook, formatOf, isDefaultLook, komaFontEdits, accentEdits, accentOf, STYLE_SETS, setLooks, setOf, lengthPt, startsectionShapes } from '../src/looks.js';
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
  assert.equal(T.chapter.fmts[0].args.shape.t, 'display');
  assert.equal(T.section.spacings[0].args.before.t, '12pt plus 2pt');
  assert.equal(lengthPt('12pt plus 2pt'), 12);
  assert.equal(lengthPt('1cm'), 28.45);
  // in a comment it is none
  assert.deepEqual(readHeadLooks(doc('% \\titleformat*{\\section}{\\itshape}\n'), 'article'), {});
});

ok('the last line of a heading (the one TeX takes) changed where it stands, new ones after the last; off takes them all away', () => {
  const t = doc('\\usepackage{titlesec}\n\\titleformat*{\\section}{\\itshape}\n\\titleformat*{\\section}{\\scshape}\n\\usepackage{xcolor}\n');
  const L = { ...defaultLook('section'), sf: true };
  const u = applyEdits(t, headLookEdits(t, { section: L }));
  assert.equal(u, doc('\\usepackage{titlesec}\n\\titleformat*{\\section}{\\itshape}\n\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}\n\\usepackage{xcolor}\n'));
  assert.deepEqual(headLookEdits(u, { section: readHeadLooks(u, 'article').section }), []);
  const v = applyEdits(u, headLookEdits(u, { subsection: { ...defaultLook('subsection'), it: true } }));
  assert.ok(v.includes('\\sffamily}\n\\titleformat*{\\subsection}{\\normalfont\\large\\bfseries\\itshape}\n\\usepackage{xcolor}'), v);
  assert.equal(applyEdits(v, headLookEdits(v, { section: null, subsection: null })), doc('\\usepackage{titlesec}\n\\usepackage{xcolor}\n'));
  // none yet: at the preamble's end; CRLF kept
  const w = doc('').replace(/\n/g, '\r\n'), x = applyEdits(w, headLookEdits(w, { section: L }));
  assert.ok(x.includes('\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\sffamily}\r\n\\begin{document}'), JSON.stringify(x));
  assert.equal(headLookEdits('no preamble', { section: L }), null);
  // a line holding more than the command keeps the rest
  const y = doc('\\titleformat*{\\section}{\\itshape} % mine\n'), z = applyEdits(y, headLookEdits(y, { section: null }));
  assert.ok(z.includes(' % mine\n') && !z.includes('titleformat'), z);
});

ok('review H3: a hand written titlesec line keeps every argument the dialog did not change, byte for byte', () => {
  const sec = (pre) => readHeadLooks(doc(pre), 'article').section;
  // (a) titlesec's *4 shorthand and a register: italic on, the spacing line stays as written
  for (const sp of ['\\titlespacing*{\\section}{0pt}{*4}{*1.5}\n', '\\titlespacing*{\\section}{0pt}{\\parskip}{\\parskip}\n']) {
    const t = doc('\\usepackage{titlesec}\n' + sp), L = { ...sec('\\usepackage{titlesec}\n' + sp), it: true }, u = applyEdits(t, headLookEdits(t, { section: L }));
    assert.ok(u.includes(sp) && u.includes('\\titleformat*{\\section}{\\normalfont\\Large\\bfseries\\itshape}'), u);
  }
  // (b) nothing changed: no edit at all, glue, indent and the non-star form kept
  const b = doc('\\titlespacing{\\section}{1em}{3.5ex plus 1ex minus .2ex}{2.3ex plus .2ex}\n');
  assert.deepEqual(headLookEdits(b, { section: readHeadLooks(b, 'article').section }), []);
  const b2 = applyEdits(b, headLookEdits(b, { section: { ...readHeadLooks(b, 'article').section, after: 6 } }));
  assert.ok(b2.includes('\\titlespacing{\\section}{1em}{3.5ex plus 1ex minus .2ex}{6pt}'), b2);
  // (c) label punctuation, separator and before code kept when only the format changes
  const c = doc('\\titleformat{\\section}[block]{\\Large\\bfseries}{\\thesection.}{0.5em}{\\MakeUppercase}\n');
  const c2 = applyEdits(c, headLookEdits(c, { section: { ...readHeadLooks(c, 'article').section, sf: true } }));
  assert.ok(c2.includes('\\titleformat{\\section}[block]{\\normalfont\\Large\\bfseries\\sffamily}{\\thesection.}{0.5em}{\\MakeUppercase}\n'), c2);
  const c3 = applyEdits(c, headLookEdits(c, { section: { ...readHeadLooks(c, 'article').section, rule: true } }));
  assert.ok(c3.includes('{\\MakeUppercase}[\\titlerule]\n'), c3);
  // (d) a four argument \titleformat and a three argument \titlespacing end where they end: the line break stays
  const d = doc('\\titleformat{\\section}{\\Large\\bfseries}{\\thesection}{1em}{}\n\\titlespacing*{\\section}{0pt}{12pt}{6pt}\n');
  const T = titleLines(d);
  assert.equal(d.slice(T.section.fmts[0].s, T.section.fmts[0].e), '\\titleformat{\\section}{\\Large\\bfseries}{\\thesection}{1em}{}');
  assert.equal(d.slice(T.section.spacings[0].s, T.section.spacings[0].e), '\\titlespacing*{\\section}{0pt}{12pt}{6pt}');
  const d2 = applyEdits(d, headLookEdits(d, { section: { ...readHeadLooks(d, 'article').section, it: true, before: 20 } }));
  assert.ok(d2.includes('{\\normalfont\\Large\\bfseries\\itshape}{\\thesection}{1em}{}\n\\titlespacing*{\\section}{0pt}{20pt}{6pt}\n\\begin{document}'), d2);
});

ok('verification V5: a \\titleformat* after a full line folds into it when the shape, rule or number changes; numbers on give the label back', () => {
  const d = doc('\\usepackage{titlesec}\n\\titleformat{\\section}[block]{\\Large\\bfseries}{\\thesection.}{0.5em}{\\MakeUppercase}\n\\titleformat*{\\section}{\\Large\\itshape}\n');
  const u = applyEdits(d, headLookEdits(d, { section: { ...readHeadLooks(d, 'article').section, rule: true } }));
  assert.equal(u, doc('\\usepackage{titlesec}\n\\titleformat{\\section}[block]{\\normalfont\\Large\\itshape}{\\thesection.}{0.5em}{\\MakeUppercase}[\\titlerule]\n'));
  const off = applyEdits(u, headLookEdits(u, { section: { ...readHeadLooks(u, 'article').section, num: false } }));
  assert.ok(off.includes('{}{0.5em}'), off);
  const on = applyEdits(off, headLookEdits(off, { section: { ...readHeadLooks(off, 'article').section, num: true } }, { labels: { section: '\\thesection.' } }));
  assert.equal(on, u);
});

ok('review H2: under titlesec\'s explicit option every line is the full form with #1', () => {
  const t = doc('\\usepackage[explicit]{titlesec}\n');
  const u = applyEdits(t, headLookEdits(t, { subsection: { ...defaultLook('subsection'), bf: false } }, { explicit: true }));
  assert.ok(u.includes('\\titleformat{\\subsection}[hang]{\\normalfont\\large}{\\thesubsection}{1em}{#1}') && !u.includes('titleformat*'), u);
  const v = applyEdits(t, headLookEdits(t, { section: { ...defaultLook('section'), num: false } }, { explicit: true }));
  assert.ok(v.includes('{\\normalfont\\Large\\bfseries}{}{1em}{#1}'), v);
});

ok('review M3: a hand written \\@startsection for \\paragraph: the sign of its after skip says run in or not', () => {
  assert.deepEqual(startsectionShapes(['\\renewcommand\\paragraph{\\@startsection{paragraph}{4}{\\z@}{3.25ex \\@plus1ex \\@minus.2ex}{1.5ex \\@plus .2ex}{\\normalfont\\normalsize\\bfseries}}']), { paragraph: 'hang' });
  assert.deepEqual(startsectionShapes(['\\renewcommand{\\subparagraph}{\\@startsection{subparagraph}{5}{\\parindent}{3.25ex}{-1em}{\\bfseries}}']), { subparagraph: 'runin' });
  assert.deepEqual(startsectionShapes(['% \\renewcommand\\paragraph{\\@startsection{paragraph}{4}{0pt}{1ex}{1ex}{}}']), {});
  // verification V3: an after skip of zero runs in (\z@, 0pt); the \def form is read
  assert.deepEqual(startsectionShapes(['\\renewcommand\\paragraph{\\@startsection{paragraph}{4}{\\z@}{3.25ex \\@plus1ex}{\\z@}{\\normalfont\\bfseries}}']), { paragraph: 'runin' });
  assert.deepEqual(startsectionShapes(['\\def\\paragraph{\\@startsection{paragraph}{4}{0pt}{1ex}{0pt}{x}}']), { paragraph: 'runin' });
  assert.deepEqual(startsectionShapes(['\\def\\subparagraph{\\@startsection{subparagraph}{5}{0pt}{1ex}{1.5ex \\@plus .2ex}{x}}']), { subparagraph: 'hang' });
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
