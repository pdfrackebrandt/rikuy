// The equations' source edits (src/cmd/equation.js) and the Equation tab's tables (src/ui/eqtab.js),
// on strings: inline to display and back, byte for byte; a display's kind by its names alone; \[ \]
// for the unnumbered form where amsmath is not there; what each kind takes (rows, &); labels; the
// packages a formula needs; the slots of a template written as text; the saved equations kept
// bounded; every table's LaTeX well formed.
import assert from 'node:assert/strict';
import { topLevel, inlineDelims, displayDelims, kindEdits, kindWhyNot, flipNumber, isNumbered, unnumbered, toDisplayEdits, toInlineEdits, labelsIn, freeLabel, braceDepth, KINDS } from '../src/cmd/equation.js';
import { SYMBOLS, STRUCTURES, GALLERY, mathNeeds, mathSafe, provided, fillSlots, tileTex, readSaved, addSaved, SAVED_MAX } from '../src/ui/eqtab.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const apply = (src, edits) => [...edits].sort((a, b) => b.s - a.s).reduce((t, x) => t.slice(0, x.s) + x.t + t.slice(x.e), src);
// an atom as the model gives it: [s, e) the whole, [is, ie) its text
const atom = (src, whole, inner) => { const s = src.indexOf(whole), is = s + whole.indexOf(inner); return { s, e: s + whole.length, is, ie: is + inner.length }; };

ok('inline to display and back, byte for byte; the sentence around keeps its bytes', () => {
  for (const [src, whole, inner] of [['Text $x+1$ more.', '$x+1$', 'x+1'], ['Text \\(a \\)b', '\\(a \\)', 'a '], ['A $\\frac{a}{b}$, then', '$\\frac{a}{b}$', '\\frac{a}{b}'], ['Lines $a\n+b$ end', '$a\n+b$', 'a\n+b']]) {
    const a = atom(src, whole, inner);
    const d = toDisplayEdits(src, a);
    const out = apply(src, d);
    assert.equal(out, src.slice(0, a.s) + '\\begin{equation}\n  ' + inner + '\n\\end{equation}' + src.slice(a.e));
    const b = atom(out, out.slice(a.s, a.s + d[0].t.length), '\n  ' + inner + '\n');
    const r = toInlineEdits(out, b);
    assert.ok(r.edits, r.why);
    // ($…$ comes back for \(…\) too: the same formula)
    assert.equal(apply(out, r.edits), src.slice(0, a.s) + '$' + inner + '$' + src.slice(a.e));
  }
  assert.equal(toDisplayEdits('\\ensuremath{x}', { s: 0, e: 14, is: 12, ie: 13 }), null);
  assert.deepEqual(inlineDelims('a $x$', { s: 2, e: 5, is: 3, ie: 4 }), { open: '$', close: '$' });
});

ok('display to inline: a hand written layout comes off as its spaces, and what an inline formula cannot take stays', () => {
  const src = 'x \\begin{equation*} E=mc^2 \\end{equation*} y';
  const a = atom(src, '\\begin{equation*} E=mc^2 \\end{equation*}', ' E=mc^2 ');
  assert.equal(apply(src, toInlineEdits(src, a).edits), 'x $E=mc^2$ y');
  const br = '\\[\n  a\n\\]', ab = atom(br, br, '\n  a\n');
  assert.equal(apply(br, toInlineEdits(br, ab).edits), '$a$');
  for (const [inner, why] of [['a \\\\ b', /rows/], ['a &= b', /&/], ['a \\label{x}', /label/], ['a \\nonumber', /tag/], ['a % c\n', /comment/], ['  ', /empty/]]) {
    const s = '\\begin{equation}' + inner + '\\end{equation}';
    assert.match(toInlineEdits(s, atom(s, s, inner)).why, why, inner);
  }
  // rows and & inside a matrix or cases are no rows of the display
  const m = '\\begin{equation}\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\end{equation}';
  assert.ok(toInlineEdits(m, atom(m, m, '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}')).edits);
  const al = '\\begin{alignat}{2}a\\end{alignat}';
  assert.match(toInlineEdits(al, atom(al, al, 'a')).why, /alignat/);
});

ok('a display\'s kind: the names in \\begin and \\end only; \\[ \\] both ways', () => {
  const src = 'x\n\\begin{equation}\n  a=b\n\\end{equation}\ny';
  const a = atom(src, '\\begin{equation}\n  a=b\n\\end{equation}', '\n  a=b\n');
  const d = displayDelims(src, a);
  assert.equal(d.name, 'equation');
  const star = apply(src, kindEdits(src, a, d, 'equation*'));
  assert.equal(star, 'x\n\\begin{equation*}\n  a=b\n\\end{equation*}\ny');
  const b = atom(star, '\\begin{equation*}\n  a=b\n\\end{equation*}', '\n  a=b\n');
  assert.equal(apply(star, kindEdits(star, b, displayDelims(star, b), 'equation')), src);
  const br = apply(src, kindEdits(src, a, d, '\\['));
  assert.equal(br, 'x\n\\[\n  a=b\n\\]\ny');
  const c = atom(br, '\\[\n  a=b\n\\]', '\n  a=b\n');
  assert.deepEqual(displayDelims(br, c), { kind: '\\[' });
  assert.equal(apply(br, kindEdits(br, c, displayDelims(br, c), 'equation')), src);
  // spaces in the names' braces are kept
  const sp = '\\begin {align}a\\\\b\\end {align}', e = atom(sp, sp, 'a\\\\b');
  assert.equal(apply(sp, kindEdits(sp, e, displayDelims(sp, e), 'align*')), '\\begin {align*}a\\\\b\\end {align*}');
  assert.equal(displayDelims('\\begin{equation}a\\end{align}', { s: 0, e: 29, is: 16, ie: 17 }), null);
});

ok('numbers on and off, and what each kind takes', () => {
  assert.equal(flipNumber('equation', 'equation*'), 'equation*');
  assert.equal(flipNumber('equation', '\\['), '\\[');
  assert.equal(flipNumber('\\[', 'equation*'), 'equation');
  assert.equal(flipNumber('$$', 'equation*'), 'equation');
  assert.equal(flipNumber('align*', ''), 'align');
  assert.equal(flipNumber('gather', ''), 'gather*');
  assert.equal(flipNumber('cases', ''), null);
  assert.ok(isNumbered('align') && !isNumbered('align*') && !isNumbered('\\[') && !isNumbered('$'));
  const rows = topLevel('a \\\\ b'), amp = topLevel('a &= b'), plain = topLevel('a = b');
  assert.match(kindWhyNot('equation', 'align', rows), /rows/);
  assert.match(kindWhyNot('gather', 'align', amp), /&/);
  assert.equal(kindWhyNot('gather', 'align', rows), '');
  assert.equal(kindWhyNot('align', 'equation', plain), '');
  assert.match(kindWhyNot('align', 'alignat', plain), /alignat/);
  assert.equal(kindWhyNot('alignat*', 'alignat', plain), '');
  assert.equal(KINDS.length, 8);
});

ok('the unnumbered form follows the document: \\[ without amsmath, else the one it uses more', () => {
  assert.equal(unnumbered('\\begin{equation*}a\\end{equation*}', false), '\\[');
  assert.equal(unnumbered('nothing', true), 'equation*');
  assert.equal(unnumbered('\\[a\\] \\[b\\] \\begin{equation*}c\\end{equation*}', true), '\\[');
  // (a line break with space, \\[2pt], is no display)
  assert.equal(unnumbered('a\\\\[2pt] b\\\\[3pt] \\begin{equation*}c\\end{equation*}', true), 'equation*');
});

ok('labels, a free one, and braces around a formula', () => {
  assert.deepEqual(labelsIn('a \\label{eq:x} b \\label{ eq:y }'), ['eq:x', 'eq:y']);
  assert.equal(freeLabel(new Set(['eq:1', 'eq:2'])), 'eq:3');
  const s = 'A \\textbf{b $x$} c $y$ \\{ $z$';
  assert.equal(braceDepth(s, 0, s.indexOf('$x$')), 1);
  assert.equal(braceDepth(s, 0, s.indexOf('$y$')), 0);
  assert.equal(braceDepth(s, 0, s.indexOf('$z$')), 0);
  assert.equal(braceDepth('% {\n$x$', 0, 5), 0);
  assert.equal(braceDepth('x'.repeat(30000), 0, 25000), -1);
  // the scan of a display's text is bounded
  assert.ok(topLevel('{'.repeat(30000)).big);
});

ok('the packages a formula needs, and where they are there already', () => {
  assert.deepEqual([...mathNeeds('\\binom{n}{k} + \\mathbb{R}')].sort(), ['amsmath', 'amssymb']);
  assert.deepEqual([...mathNeeds('\\frac{a}{b}\\alpha')], []);
  assert.deepEqual([...mathNeeds('\\begin{pmatrix}a\\end{pmatrix}')], ['amsmath']);
  assert.deepEqual([...mathNeeds('', 'align*')], ['amsmath']);
  assert.deepEqual([...mathNeeds('', 'equation')], []);
  const has = (list) => (x) => list.includes(x);
  assert.ok(provided('amsmath', has(['mathtools']), 'article'));
  assert.ok(provided('amsmath', has([]), 'amsart'));
  assert.ok(!provided('amsmath', has(['amssymb']), 'article'));
  // (amssymb after newtxmath stops TeX: \Bbbk already defined)
  assert.ok(provided('amssymb', has(['newtxmath']), 'article'));
  assert.ok(provided('amssymb', has(['unicode-math']), 'article'));
  assert.ok(!provided('amssymb', has(['amsfonts']), 'article'));
});

ok('a template written as text: the selection in the first slot, the caret in the next empty one', () => {
  assert.deepEqual(fillSlots('\\frac{#?}{#?}', ''), { text: '\\frac{}{}', caret: 6 });
  assert.deepEqual(fillSlots('\\frac{#?}{#?}', 'x+1'), { text: '\\frac{x+1}{}', caret: 11 });
  assert.deepEqual(fillSlots('\\alpha', 'y'), { text: '\\alpha', caret: 6 });
  assert.deepEqual(fillSlots('\\sqrt{#?}', 'a'), { text: '\\sqrt{a}', caret: 8 });
  assert.equal(tileTex('\\frac{#?}{1}'), '\\frac{{\\color{#9a9a9a}\\square}}{1}');
});

ok('saved equations: bounded, named, a name met again replaced, a broken store read as none', () => {
  assert.deepEqual(readSaved('not json'), []);
  assert.deepEqual(readSaved('{"a":1}'), []);
  assert.deepEqual(readSaved(JSON.stringify([{ name: 'x', tex: 'a' }, { name: 3, tex: 'b' }, { name: 'y', tex: 'c'.repeat(5000) }])), [{ name: 'x', tex: 'a' }]);
  let list = [];
  for (let i = 0; i < 50; i++) list = addSaved(list, 'eq ' + i, 'x^' + i);
  assert.equal(list.length, SAVED_MAX);
  assert.equal(list[0].name, 'eq 49');
  list = addSaved(list, '  eq   49 ', 'new');
  assert.equal(list.filter((x) => x.name === 'eq 49').length, 1);
  assert.equal(list[0].tex, 'new');
  assert.equal(addSaved([], '', 'a')[0].name, 'Saved equation');
  assert.equal(addSaved([], 'n'.repeat(200), 'a')[0].name.length, 80);
});

ok('a saved equation is written only where it stays a formula (one from a stranger\'s document cannot close it early)', () => {
  for (const t of ['x^2', '\\frac{a}{b}', '\\text{a \\$ b}', '\\begin{pmatrix}a\\\\b\\end{pmatrix}', 'a\\%b', '\\{x\\}']) assert.equal(mathSafe(t), '', t);
  for (const [t, why] of [['x$ \\input{/etc/passwd} $', /\$/], ['a } b', /\}/], ['{a', /\{/], ['a % c', /comment/], ['a\n\nb', /blank/], ['a\\', /backslash/], ['a \\] b \\[', /delimiters/],
    ['\\end{equation} x \\begin{equation}', /ends an environment/], ['\\begin{cases} a', /not ended/], ['\\end{document}', /environment/], ['\\begin {document}', /environment/], ['x'.repeat(5000), /long/]]) assert.match(mathSafe(t), why, t);
  // (and a store holding one keeps it out of the gallery)
  assert.deepEqual(readSaved(JSON.stringify([{ name: 'bad', tex: 'x$ y' }, { name: 'ok', tex: 'y' }])), [{ name: 'ok', tex: 'y' }]);
});

ok('the tables: every name once in its menu, braces balanced, slots only in templates', () => {
  const balanced = (t) => { let d = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '\\') { i++; continue; } if (t[i] === '{') d++; if (t[i] === '}' && --d < 0) return false; } return d === 0; };
  for (const g of SYMBOLS) {
    const names = g.items.map((s) => s.tex + ' ' + s.name);
    assert.equal(new Set(names).size, names.length, g.name);
    for (const s of g.items) { assert.ok(balanced(s.tex) && !s.tex.includes('#?'), s.tex); }
  }
  for (const g of STRUCTURES) {
    const names = g.sections.flatMap((x) => x.items.map((s) => s.name));
    assert.equal(new Set(names).size, names.length, g.name);
    for (const s of g.sections.flatMap((x) => x.items)) assert.ok(balanced(s.tex.replace(/\\(left|right|middle)\\?[{}]/g, '')), s.tex);
  }
  assert.equal(STRUCTURES.length, 11);
  assert.deepEqual(STRUCTURES.map((g) => g.name), ['Fraction', 'Script', 'Radical', 'Integral', 'Large operator', 'Bracket', 'Function', 'Accent', 'Limit and log', 'Operator', 'Matrix']);
  assert.equal(GALLERY.length, 9);
  for (const g of GALLERY) assert.ok(balanced(g.tex.replace(/\\(left|right)[()]/g, '')) && !mathSafe(g.tex), g.name);
  for (const g of SYMBOLS) for (const x of g.items) assert.equal(mathSafe(x.tex), '', x.tex);
  for (const g of STRUCTURES) for (const x of g.sections.flatMap((y) => y.items)) assert.equal(mathSafe(x.tex.replace(/#\?/g, '')), '', x.tex);
});

console.log('equation: ' + n + ' groups of checks passed');
