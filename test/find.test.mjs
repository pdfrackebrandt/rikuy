// Find and Replace and the outline as edits (src/find.js, src/outline.js): the query as a pattern
// (plain text with Word's ^ codes, Word's wildcards, regular expressions; Match case, Find whole
// words only), straight quotes and spaces finding the typeset curly quotes and nonbreaking spaces,
// no hit across an atom or a paragraph's end, the replacement's groups and codes, runs of one
// formatting, a hit's context; a heading promoted and demoted with those under it (starred and
// short titled forms kept), a section's range (stopping at the back matter and \end{document}, none
// across files), two sections or paragraphs swapped and moved with the space between them kept,
// a new heading's edit; and a person's own pattern bounded in time.
import assert from 'node:assert/strict';
import { compile, expand, hitsIn, runsWith, context, hitsInSource, joinRanges, labelsIn, SEP, PARA, FMT } from '../src/find.js';
import { headingAt, sectionRange, under, promoteEdits, swapEdit, moveEdits, newHeading, eolOf } from '../src/outline.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const find = (text, q, o = {}) => { const c = compile(q, o); assert.ok(c.re, c.error); return hitsIn(text, c.re).hits.map((h) => text.slice(h.i, h.j)); };

ok('plain text: case folded unless Match case; whole words only', () => {
  const t = 'The theme of these Theses: the end.';
  assert.deepEqual(find(t, 'the'), ['The', 'the', 'the', 'The', 'the']);
  assert.deepEqual(find(t, 'the', { matchCase: true }), ['the', 'the', 'the']);
  assert.deepEqual(find(t, 'the', { wholeWord: true }), ['The', 'the']);
  assert.deepEqual(find('café cafés', 'café', { wholeWord: true }), ['café']);
  // signs are themselves, never a pattern
  assert.deepEqual(find('a.b axb (c) 50%', 'a.b'), ['a.b']);
  assert.deepEqual(find('a.b axb (c) 50%', '(c)'), ['(c)']);
  assert.deepEqual(find('a.b axb (c) 50%', '50%'), ['50%']);
});

ok('a space finds a nonbreaking one, a straight quote the curly ones, as the page draws ~ and `` \'\'', () => {
  const t = 'Fig.\u00A03 and \u201Cquoted\u201D and it\u2019s';
  assert.deepEqual(find(t, 'Fig. 3'), ['Fig.\u00A03']);
  assert.deepEqual(find(t, '"quoted"'), ['\u201Cquoted\u201D']);
  assert.deepEqual(find(t, "it's"), ['it\u2019s']);
});

ok('Word\'s ^ codes: any character, digit, letter, white space, nonbreaking space, caret, dashes', () => {
  const t = 'a1 b2 c^3 x\u00A0y 1\u20132';
  assert.deepEqual(find(t, '^$^#'), ['a1', 'b2']);
  assert.deepEqual(find(t, 'c^^'), ['c^']);
  assert.deepEqual(find(t, 'x^sy'), ['x\u00A0y']);
  assert.deepEqual(find(t, '1^=2'), ['1\u20132']);
  assert.deepEqual(find('ab  cd', 'b^wc'), ['b  c']);
  assert.deepEqual(find('abc', 'a^?c'), ['abc']);
});

ok('Word\'s wildcards: ? * @ {n,m} [set] [!set] < > ( ) and \\ before a sign', () => {
  const w = { wildcards: true, matchCase: true };
  assert.deepEqual(find('cat cot cut cart', 'c?t', w), ['cat', 'cot', 'cut']);
  assert.deepEqual(find('cat cart', 'c*t', w), ['cat', 'cart']);
  assert.deepEqual(find('lot loot', 'lo@t', w), ['lot', 'loot']);
  assert.deepEqual(find('10 100 1000', '10{2,3}', w), ['100', '1000']);
  assert.deepEqual(find('10 100 1000', '10{2;3}', w), ['100', '1000']);
  assert.deepEqual(find('bat cat hat', '[bc]at', w), ['bat', 'cat']);
  assert.deepEqual(find('bat cat hat', '[!bc]at', w), ['hat']);
  assert.deepEqual(find('ab0 ab9 abx', 'ab[0-9]', w), ['ab0', 'ab9']);
  assert.deepEqual(find('interest rest', '<rest', w), ['rest']);
  assert.deepEqual(find('interest restful', 'rest>', w), ['rest']);
  assert.deepEqual(find('what? why*', 'what\\?', w), ['what?']);
  const c = compile('(<[A-Z][a-z]@>) (<[A-Z][a-z]@>)', w), t = 'by Ada Lovelace today';
  const h = hitsIn(t, c.re).hits;
  assert.equal(expand('\\2, \\1', h[0].m, w), 'Lovelace, Ada');
  assert.ok(compile('a{x}', w).error && compile('[ab', w).error);
  // as in Word, wildcards match case whatever Match case says: [A-Z] means capitals
  assert.deepEqual(find('Ada and bob', '<[A-Z][a-z]@>', { wildcards: true }), ['Ada']);
});

ok('regular expressions, with JavaScript\'s groups and Word\'s \\1 in the replacement; a broken one says why', () => {
  const r = { regex: true, matchCase: true };
  const c = compile('(\\d+)%', r), t = 'up 50% and 7%';
  const h = hitsIn(t, c.re).hits;
  assert.deepEqual(h.map((x) => expand('$1 percent', x.m, r)), ['50 percent', '7 percent']);
  assert.equal(expand('\\1 pc ($$)', h[0].m, r), '50 pc ($)');
  assert.equal(expand('$&!', h[1].m, r), '7%!');
  assert.equal(expand('[$<n>]', hitsIn('x=4', compile('(?<n>\\d)', r).re).hits[0].m, r), '[4]');
  assert.ok(compile('(a', r).error.startsWith('This pattern cannot be read'));
  // Word's ^& in any mode; a plain $1 stays text without regular expressions
  const p = compile('cat', {});
  const m = hitsIn('a cat', p.re).hits[0].m;
  assert.equal(expand('^&s and $1', m, {}), 'cats and $1');
});

ok('no hit runs across an atom or a paragraph\'s end, even when a pattern could reach over them', () => {
  const t = 'see ' + SEP + ' here' + PARA + 'next one';
  assert.deepEqual(find(t, 'see  here'), []);
  assert.deepEqual(find(t, 'here next'), []);
  assert.deepEqual(find(t, 'here\\snext', { regex: true }), []);
  assert.deepEqual(find(t, 'e.', { regex: true }), ['ee', 'er', 'ex']);
});

ok('empty matches are skipped, the count is bounded, a slow pattern is stopped', () => {
  assert.deepEqual(find('abc', 'x*', { regex: true }), []);
  const many = 'a '.repeat(30000);
  const r = hitsIn(many, compile('a', {}).re);
  assert.ok(r.more && r.hits.length === 10000);
  // a pattern of one's own on a long text: the search gives up after its time, the page goes on
  const t0 = Date.now();
  const s = hitsIn('ab'.repeat(200000), compile('(?:ab|a)(?=b)', { regex: true }).re, { budget: 50 });
  assert.ok(Date.now() - t0 < 2000 && (s.stopped || s.hits.length));
});

ok('runs of one formatting (Find with a format and nothing typed), their spaces left out', () => {
  const text = 'a bold run and more' + PARA + 'bold';
  const fmt = new Uint32Array(text.length);
  for (let i = 1; i < 11; i++) fmt[i] = FMT.bold;
  for (let i = text.length - 4; i < text.length; i++) fmt[i] = FMT.bold | FMT.italic;
  assert.deepEqual(runsWith(fmt, text, FMT.bold).map((h) => text.slice(h.i, h.j)), ['bold run', 'bold']);
  assert.deepEqual(runsWith(fmt, text, FMT.bold | FMT.italic).map((h) => text.slice(h.i, h.j)), ['bold']);
});

ok('a hit in its context, cut at words, never over a paragraph\'s end', () => {
  const t = 'First para.' + PARA + 'The quick brown fox jumps over the lazy dog and keeps running far away.';
  const i = t.indexOf('fox');
  const [a, h, b] = context(t, i, i + 3, 12);
  assert.equal(h, 'fox');
  assert.ok(a.endsWith('brown ') && !a.includes('First'), a);
  assert.ok(b.startsWith(' jumps') && b.endsWith('\u2026'), b);
});

ok('in LaTeX source: hits anywhere, commands too; ranges joined', () => {
  const src = '\\section{Intro}\\label{sec:intro} see \\ref{sec:intro}';
  const h = hitsInSource(src, compile('sec:intro', {}).re).hits;
  assert.deepEqual(h.map((x) => src.slice(x.i, x.j)), ['sec:intro', 'sec:intro']);
  assert.deepEqual(joinRanges([[5, 6], [0, 2], [2, 4], [6, 8]]), [[0, 4], [5, 8]]);
});

ok('a file\'s labels for Go To: keys, not the commented ones; a stranger\'s thousands read in one pass', () => {
  const t = '\\section{A}\\label{s:a}\n% \\label{old}\nx \\% y \\label{e:1} z\n\\label{ spaced }';
  assert.deepEqual(labelsIn(t).map((x) => x.key), ['s:a', 'e:1', 'spaced']);
  assert.equal(t.slice(labelsIn(t)[1].p, labelsIn(t)[1].p + 7), '\\label{');
  // no closing brace anywhere after, no % anywhere: each label once, not the rest of the file again
  const t0 = Date.now();
  const big = '\\label{'.repeat(60000) + 'x'.repeat(200000);
  const big2 = 'a\\label{k}'.repeat(60000);
  assert.equal(labelsIn(big).length, 0);
  assert.equal(labelsIn(big2).length, 20000);
  assert.ok(Date.now() - t0 < 1000, 'took ' + (Date.now() - t0) + ' ms');
});

ok('review: a hyphen is a hyphen (well-known, state-of-the-art, 2024-11, e-mail), in every mode', () => {
  const t = 'A well-known, state-of-the-art e-mail of 2024-11.';
  for (const q of ['well-known', 'state-of-the-art', '2024-11', 'e-mail']) {
    assert.deepEqual(find(t, q), [q], q);
    assert.deepEqual(find(t, q, { wholeWord: true }), [q], q + ' whole');
    assert.deepEqual(find(t, q, { wildcards: true, matchCase: true }), [q], q + ' wildcards');
  }
  assert.deepEqual(find('a-b a_b', '[a-z]-[a-z]', { wildcards: true }), ['a-b']);
  assert.deepEqual(find('x-y', '[-]', { wildcards: true }), ['-']);
});

ok('review: a pattern runs on each paragraph apart; [^x]+ finds each paragraph\'s run', () => {
  const t = 'abc' + PARA + 'def' + SEP + 'gh';
  assert.deepEqual(find(t, '[^x]+', { regex: true }), ['abc', 'def', 'gh']);
  assert.deepEqual(find(t, '^\\w', { regex: true }), ['a', 'd', 'g']);
});

ok('review: Word\'s * and @ are bounded, so a long paragraph without the end of the pattern costs little', () => {
  const t0 = Date.now();
  assert.deepEqual(find('a'.repeat(200000), 'a*b', { wildcards: true }), []);
  assert.deepEqual(find('a'.repeat(200000), 'a@b', { wildcards: true }), []);
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
  assert.deepEqual(find('cat cart', 'c*t', { wildcards: true }), ['cat', 'cart']);
});

ok('review: ^p is a blank line in the LaTeX source, and in the page\'s text says where it works', () => {
  const c = compile('end.^p', {});
  assert.ok(c.error && /In LaTeX source/.test(c.error), c.error);
  const src = 'One end.\n\nTwo end.\r\n\r\nThree.';
  assert.deepEqual(hitsInSource(src, compile('end.^p', { source: true }).re).hits.map((h) => JSON.stringify(src.slice(h.i, h.j))), ['"end.\\n\\n"', '"end.\\r\\n\\r\\n"']);
  assert.equal(expand('^p', ['x'], {}), '\n\n');
});

// ---- the outline ------------------------------------------------------------------------------
const BOOK = '\\documentclass{book}\n\\begin{document}\n\\chapter{One}\nText one.\n\n\\section*{Starred}\nA.\n\n\\subsection[Short]{Long title}\nB.\n\n\\chapter{Two}\nText two.\n\\end{document}\n';
const heads = (src, f = 'main.tex') => {
  const out = [];
  const re = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\b/g;
  let m;
  while ((m = re.exec(src))) out.push({ f, s: m.index, level: headingAt(src, m.index).level });
  return out;
};

ok('a heading command where it is written: its name, level, star; nothing for other text', () => {
  const s = BOOK.indexOf('\\section*');
  assert.deepEqual(headingAt(BOOK, s), { name: 'section', level: 1, star: true, s, e: s + 8 });
  assert.equal(headingAt(BOOK, BOOK.indexOf('Text one')), null);
  assert.equal(headingAt('\\sectionmark{x}', 0), null);
});

ok('promote and demote: the heading and every heading under it, starred and short titles kept; bounds refused', () => {
  const H = heads(BOOK), src = () => BOOK;
  const k = H.findIndex((h) => BOOK.startsWith('\\section*', h.s));
  assert.deepEqual(under(H, k), [k + 1]);
  const up = applyEdits(BOOK, promoteEdits(src, H, k, -1, 0));
  assert.ok(up.includes('\\chapter*{Starred}') && up.includes('\\section[Short]{Long title}') && up.includes('\\chapter{One}'), up);
  const down = applyEdits(BOOK, promoteEdits(src, H, k, +1, 0));
  assert.ok(down.includes('\\subsection*{Starred}') && down.includes('\\subsubsection[Short]{Long title}'), down);
  // a chapter cannot go above \chapter (min 0), an article's section above \section (min 1)
  assert.equal(promoteEdits(src, H, 0, -1, 0), null);
  const art = '\\section{A}\n\\subparagraph{deep}\n';
  assert.equal(promoteEdits(() => art, heads(art), 0, -1, 1), null);
  assert.equal(promoteEdits(() => art, heads(art), 0, +1, 1), null, 'its \\subparagraph would go deeper than there is');
  // headings in other files are edited where they are
  const H2 = [{ f: 'main.tex', s: 0, level: 1 }, { f: 'b.tex', s: 0, level: 2 }];
  const files = { 'main.tex': '\\section{A}\n\\input{b}', 'b.tex': '\\subsection{B}' };
  assert.deepEqual(promoteEdits((f) => files[f], H2, 0, 1, 1).map((e) => [e.f, e.t]), [['main.tex', 'subsection'], ['b.tex', 'subsubsection']]);
});

ok('a section\'s range: to the next heading of its level, before the back matter or \\end{document}; none across files', () => {
  const src = '\\section{A}\nText A.\n\\subsection{A1}\nMore.\n\n\\section{B}\nText B.\n\n\\appendix\n\\section{C}\nC.\n\\end{document}\n';
  const H = heads(src), end = src.indexOf('\\end{document}');
  const r = (k) => { const x = sectionRange(src, H, k, end); return src.slice(x.s, x.e); };
  assert.equal(r(0), '\\section{A}\nText A.\n\\subsection{A1}\nMore.');
  assert.equal(r(2), '\\section{B}\nText B.');
  assert.equal(r(3), '\\section{C}\nC.');
  assert.equal(sectionRange('x', [{ f: 'a', s: 0, level: 1 }, { f: 'b', s: 0, level: 2 }, { f: 'a', s: 1, level: 1 }], 0), null);
});

ok('two sections swapped: one edit, the space between kept; never across other text', () => {
  const src = '\\section{A}\nText A.\n\n\\section{B}\nText B.\n\\end{document}';
  const H = heads(src), end = src.indexOf('\\end{document}');
  const a = sectionRange(src, H, 0, end), b = sectionRange(src, H, 1, end);
  const e = swapEdit(src, 'main.tex', a, b);
  assert.equal(applyEdits(src, [e]), '\\section{B}\nText B.\n\n\\section{A}\nText A.\n\\end{document}');
  // a heading and its paragraph on the next line: a blank line between them once swapped
  const p = 'Para one.\n\\section{H}';
  assert.equal(applyEdits(p, [swapEdit(p, 'f', { s: 0, e: 9 }, { s: 10, e: p.length })]), '\\section{H}\n\nPara one.');
  assert.equal(swapEdit('A.\n\\begin{x}\nB.', 'f', { s: 0, e: 2 }, { s: 13, e: 15 }), null);
  // two items of a list keep their own line break and indent
  const items = '  \\item one\n  \\item two\n';
  const a2 = { s: 2, e: items.indexOf('\n') }, b2 = { s: items.indexOf('\\item two'), e: items.length };
  assert.equal(applyEdits(items, [swapEdit(items, 'f', a2, b2, true)]), '  \\item two\n  \\item one\n');
  // (the line before or after read in linear time: one of 40 000 "\\begin{a" took 10 s per test)
  const long = 'x ' + '\\begin{a'.repeat(40000) + '\nPara one.\n\nPara two.', t0 = Date.now();
  const k = long.indexOf('Para');
  assert.ok(swapEdit(long, 'f', { s: k, e: k + 9 }, { s: k + 11, e: long.length }) && Date.now() - t0 < 1000, 'a long hostile line next to the move: ' + (Date.now() - t0) + ' ms');
  const it = 'x \\begin{itemize}\nPara.\n\\section{H}';
  assert.deepEqual(swapEdit(it, 'f', { s: 18, e: 23 }, { s: 24, e: it.length }), { f: 'f', s: 18, e: it.length, t: '\\section{H}\n\nPara.' });
});

ok('a section dragged before another, or to the end: two edits, one step, blank lines as they were', () => {
  const src = '\\begin{document}\n\\section{A}\nA.\n\n\\section{B}\nB.\n\n\\section{C}\nC.\n\\end{document}\n';
  const H = heads(src), end = src.indexOf('\\end{document}');
  const C = sectionRange(src, H, 2, end), A = sectionRange(src, H, 0, end);
  assert.equal(applyEdits(src, moveEdits(src, 'f', C.s, C.e, H[0].s)), '\\begin{document}\n\\section{C}\nC.\n\n\\section{A}\nA.\n\n\\section{B}\nB.\n\\end{document}\n');
  assert.equal(applyEdits(src, moveEdits(src, 'f', A.s, A.e, end)), '\\begin{document}\n\\section{B}\nB.\n\n\\section{C}\nC.\n\n\\section{A}\nA.\n\\end{document}\n');
  // onto itself, or the last one to the end: nothing
  assert.equal(moveEdits(src, 'f', A.s, A.e, A.s), null);
  assert.equal(moveEdits(src, 'f', C.s, C.e, end), null);
});

ok('a new heading before one, or after a section, with the caret between its braces', () => {
  const src = '\\section{A}\nA.';
  const b = newHeading('section', 'before', 0);
  const t1 = applyEdits(src, [{ s: b.s, e: b.s, t: b.t }]);
  assert.equal(t1, '\\section{}\n\n\\section{A}\nA.');
  assert.equal(t1[b.caret - 1] + t1[b.caret], '{}');
  const a = newHeading('subsection', 'after', src.length);
  const t2 = applyEdits(src, [{ s: a.s, e: a.s, t: a.t }]);
  assert.equal(t2, '\\section{A}\nA.\n\n\\subsection{}');
  assert.equal(t2[a.caret - 1] + t2[a.caret], '{}');
});

ok('a stranger\'s long source: a heading looked at in a bounded slice, a section\'s end found fast', () => {
  const big = '\\section{A}\n' + 'x \\appendixy '.repeat(40000) + '\n\\section{B}\n';
  const t0 = Date.now();
  const H = heads(big);
  const r = sectionRange(big, H, 0);
  assert.ok(r.e > 100000 && Date.now() - t0 < 1000, Date.now() - t0);
  assert.equal(headingAt('\\section' + ' '.repeat(100000) + '*{x}', 0).star, false);
});

ok('review: a paragraph moved past a heading never runs into the text beyond it', () => {
  const d1 = '\\begin{document}\nPara one.\n\n\\section{A}\nPara two.\n\\end{document}';
  const one = { s: d1.indexOf('Para one'), e: d1.indexOf('Para one') + 9 }, h = { s: d1.indexOf('\\section'), e: d1.indexOf('\\section') + 11 };
  assert.equal(applyEdits(d1, [swapEdit(d1, 'f', one, h)]), '\\begin{document}\n\\section{A}\n\nPara one.\n\nPara two.\n\\end{document}');
  const d2 = '\\begin{document}\nText a.\n\\section{B}\nPara b.\n\\end{document}';
  const hb = { s: d2.indexOf('\\section'), e: d2.indexOf('\\section') + 11 }, pb = { s: d2.indexOf('Para b'), e: d2.indexOf('Para b') + 7 };
  assert.equal(applyEdits(d2, [swapEdit(d2, 'f', hb, pb)]), '\\begin{document}\nText a.\n\nPara b.\n\n\\section{B}\n\\end{document}');
  // two paragraphs apart by a blank line: the bytes around them stay
  const d3 = 'x\n\nA.\n\nB.\n\ny';
  assert.equal(applyEdits(d3, [swapEdit(d3, 'f', { s: 3, e: 5 }, { s: 7, e: 9 })]), 'x\n\nB.\n\nA.\n\ny');
});

ok('review: a file with Windows line breaks keeps them when sections move', () => {
  const src = '\\begin{document}\r\n\\section{A}\r\nText a.\r\n\r\n\\section{B}\r\nText b.\r\n\\end{document}\r\n';
  assert.equal(eolOf(src), '\r\n');
  const H = heads(src), end = src.indexOf('\\end{document}');
  const a = sectionRange(src, H, 0, end), b = sectionRange(src, H, 1, end);
  const out = applyEdits(src, [swapEdit(src, 'f', a, b)]);
  assert.equal(out, '\\begin{document}\r\n\\section{B}\r\nText b.\r\n\r\n\\section{A}\r\nText a.\r\n\\end{document}\r\n');
  assert.ok(!/[^\r]\n/.test(out));
  const d = src.replace('Text a.\r\n\r\n', 'Text a.\r\n');
  const out2 = applyEdits(d, [swapEdit(d, 'f', sectionRange(d, heads(d), 0, d.indexOf('\\end{')), sectionRange(d, heads(d), 1, d.indexOf('\\end{')))]);
  assert.ok(!/[^\r]\n/.test(out2) && out2.includes('Text b.\r\n\r\n\\section{A}'), JSON.stringify(out2));
  const m = moveEdits(src, 'f', a.s, a.e, a.e === 0 ? 0 : sectionRange(src, H, 1, end).e, true);
  assert.ok(!/[^\r]\n/.test(applyEdits(src, m)), JSON.stringify(applyEdits(src, m)));
});

ok('review: a section moved after the last one goes before the bibliography, not after it', () => {
  const src = '\\begin{document}\n\\section{A}\nText a.\n\n\\section{B}\nText b.\n\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n';
  const H = heads(src), end = src.indexOf('\\end{document}');
  const A = sectionRange(src, H, 0, end), B = sectionRange(src, H, 1, end);
  assert.equal(applyEdits(src, moveEdits(src, 'f', A.s, A.e, B.e, true)),
    '\\begin{document}\n\\section{B}\nText b.\n\n\\section{A}\nText a.\n\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n');
  // after the section just before it: where it is already, nothing
  assert.equal(moveEdits(src, 'f', B.s, B.e, A.e, true), null);
});

console.log('find: ' + n + ' groups of checks passed');
