// The equations' source edits (src/cmd/equation.js) and the Equation tab's tables (src/ui/eqtab.js),
// on strings: inline to display and back, byte for byte; a display's kind by its names alone; \[ \]
// for the unnumbered form where amsmath is not there; what each kind takes (rows, &); labels; the
// packages a formula needs; the slots of a template written as text; the saved equations kept
// bounded; every table's LaTeX well formed.
import assert from 'node:assert/strict';
import { topLevel, inlineDelims, displayDelims, kindEdits, kindWhyNot, flipNumber, isNumbered, unnumbered, toDisplayEdits, toInlineEdits, labelsIn, freeLabel, braceDepth, envsAt, NO_DISPLAY, KINDS } from '../src/cmd/equation.js';
import { SYMBOLS, STRUCTURES, GALLERY, mathNeeds, mathSafe, fillSlots, tileTex, readSaved, addSaved, SAVED_MAX } from '../src/ui/eqtab.js';
import { provides } from '../src/preamble.js';
import katex from '../node_modules/katex/dist/katex.mjs';

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
  const nest = '\\begin{equation}\\begin{aligned}a \\label{x}\\end{aligned}\\end{equation}';
  assert.match(toInlineEdits(nest, atom(nest, nest, '\\begin{aligned}a \\label{x}\\end{aligned}')).why, /label/);
  // CRLF: the display written with the file's line ends, and back byte for byte
  const cr = 'A $x$ b.\r\nNext.\r\n', ca = atom(cr, '$x$', 'x');
  const crd = apply(cr, toDisplayEdits(cr, ca));
  assert.equal(crd, 'A \\begin{equation}\r\n  x\r\n\\end{equation} b.\r\nNext.\r\n');
  const cb = atom(crd, '\\begin{equation}\r\n  x\r\n\\end{equation}', '\r\n  x\r\n');
  assert.equal(apply(crd, toInlineEdits(crd, cb).edits), cr);
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
  // (the review's: a label in an equation, or in an align's rows, kept a number to point to)
  assert.match(kindWhyNot('equation*', 'equation', plain, 1), /label/);
  assert.match(kindWhyNot('\\[', 'equation', plain, 1), /label/);
  assert.match(kindWhyNot('align*', 'align', rows, 2), /label/);
  assert.equal(kindWhyNot('gather', 'align', rows, 2), '');
  assert.equal(kindWhyNot('equation*', 'equation', plain, 0), '');
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
  // the environments open at a formula: tabbing and lrbox hold no display (the review's case)
  const tb = '\\begin{document}\n\\begin{tabbing}\nA \\= $x$ \\\\\n\\end{tabbing}\n\\begin{center} $y$ \\end{center} % \\begin{lrbox}\n$z$';
  assert.deepEqual(envsAt(tb, 0, tb.indexOf('$x$')), ['document', 'tabbing']);
  assert.ok(envsAt(tb, 0, tb.indexOf('$x$')).some((x) => NO_DISPLAY.has(x)));
  assert.deepEqual(envsAt(tb, 0, tb.indexOf('$y$')), ['document', 'center']);
  assert.deepEqual(envsAt(tb, 0, tb.indexOf('$z$')), ['document']);
  assert.ok(envsAt('\\begin{lrbox}{\\b}$x$', 0, 15).includes('lrbox'));
  // the scan of a display's text is bounded
  assert.ok(topLevel('{'.repeat(30000)).big);
});

ok('the packages a formula needs, and where they are there already', () => {
  assert.deepEqual([...mathNeeds('\\binom{n}{k} + \\mathbb{R}')].sort(), ['amsmath', 'amssymb']);
  assert.deepEqual([...mathNeeds('\\frac{a}{b}\\alpha')], []);
  assert.deepEqual([...mathNeeds('\\begin{pmatrix}a\\end{pmatrix}')], ['amsmath']);
  assert.deepEqual([...mathNeeds('', 'align*')], ['amsmath']);
  assert.deepEqual([...mathNeeds('', 'equation')], []);
  const D = (pre, cls = 'article') => '\\documentclass{' + cls + '}\n' + pre + '\\begin{document}\nx\n\\end{document}\n';
  assert.ok(provides(D('\\usepackage{mathtools}\n'), 'amsmath'));
  assert.ok(provides(D('', 'amsart'), 'amsmath'));
  assert.ok(!provides(D('\\usepackage{amssymb}\n'), 'amsmath'));
  // (amssymb after newtxmath stops TeX: \Bbbk already defined)
  assert.ok(provides(D('\\usepackage{newtxmath}\n'), 'amssymb'));
  assert.ok(provides(D('\\usepackage{unicode-math}\n'), 'amssymb'));
  assert.ok(!provides(D('\\usepackage{amsfonts}\n'), 'amssymb'));
});

ok('a template written as text: the selection in the first slot, the caret in the next empty one', () => {
  assert.deepEqual(fillSlots('\\frac{#?}{#?}', ''), { text: '\\frac{}{}', caret: 6 });
  assert.deepEqual(fillSlots('\\frac{#?}{#?}', 'x+1'), { text: '\\frac{x+1}{}', caret: 11 });
  assert.deepEqual(fillSlots('\\alpha', 'y'), { text: '\\alpha', caret: 6 });
  // (the review's: the selection in the slot Word's typing gives it, wrapSlot's: the radicand, not
  // the degree; the words over the arrow, not under it)
  assert.deepEqual(fillSlots('\\sqrt[#?]{#?}', 'x'), { text: '\\sqrt[]{x}', caret: 6 });
  assert.deepEqual(fillSlots('\\xrightarrow[#?]{#?}', 'f'), { text: '\\xrightarrow[]{f}', caret: 13 });
  assert.deepEqual(fillSlots('\\overset{#?}{#?}', 'b'), { text: '\\overset{}{b}', caret: 9 });
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
    ['\\end{equation} x \\begin{equation}', /no formula holds/], ['\\end{cases} x \\begin{cases}', /ends an environment/], ['\\begin{cases} a', /not ended/], ['\\end{document}', /no formula holds/], ['\\begin {document}', /no formula holds/], ['x'.repeat(5000), /long/]]) assert.match(mathSafe(t), why, t);
  // (the review's strings: each acts beyond the formula, or closes it)
  for (const t of ['E=mc^2\\gdef\\maketitle{}', 'x\\global\\let\\section\\relax', 'x\\iffalse', 'x\\csname iffalse\\endcsname', '\\begin{array}{c}\\end{math}junk\\begin{math}\\end{array}',
    'x\\catcode`\\$=12', 'x\\immediate\\write18{touch /tmp/pwn}', 'x\\input{/etc/passwd}', 'x \\string\\', 'x^^24', 'a\\def\\b{c}', 'a\\everymath{x}', 'a\\newcommand{\\x}{y}', 'a\\fi', 'a\\or b', 'a\\par b',
    'a\\begin{equation}b\\end{equation}', 'a\\begin{document}', 'a\\expandafter b', 'a\\makeatletter', 'a\\end b', 'a\\usepackage{x}', 'a\\directlua{os.exit()}']) assert.notEqual(mathSafe(t), '', t);
  for (const t of ['a\\iff b', 'x\\neq y', 'a\\leq b', '\\begin{cases}a\\\\b\\end{cases}', '\\begin{aligned}a&=b\\end{aligned}', '\\text{def}', 'e^{i\\pi}', '\\left(x\\right)', '\\operatorname{rank}A']) assert.equal(mathSafe(t), '', t);
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
  // every one drawn by KaTeX (as the menus and the check before inserting do), its slots empty groups
  const draw = (t) => katex.renderToString(t.replace(/#\?/g, '{}'), { throwOnError: true, strict: 'ignore', trust: false });
  for (const x of [...GALLERY, ...SYMBOLS.flatMap((g) => g.items), ...STRUCTURES.flatMap((g) => g.sections.flatMap((y) => y.items))]) assert.doesNotThrow(() => draw(x.tex), x.tex);
});

console.log('equation: ' + n + ' groups of checks passed');
