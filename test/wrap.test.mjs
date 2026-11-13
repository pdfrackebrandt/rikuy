// Inline wrappers as edits (src/wrap.js): put on and taken off byte for byte, with leading
// arguments (\textcolor{red}{…}) and options (\hl[green]{…}); hand written forms of the same kind
// found and taken off exactly; a selection over paragraphs wrapped part by part; a wrapper split
// around part of what it holds; every one of a kind cleared; selections that cross structure
// refused.
import assert from 'node:assert/strict';
import { GROUPS, groupNames, groupOf, defineGroup, opener, parseAt, enclosing, wrappersIn, wrapEdits, unwrapEdits, rewrapEdits, splitText, clearText, toggleEdits, mapPos, diffEdit } from '../src/wrap.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const at = (src, word, k = 0) => src.indexOf(word) + k;

ok('openers: a command, its leading arguments, its option', () => {
  assert.equal(opener({ cmd: 'textbf' }), '\\textbf{');
  assert.equal(opener({ cmd: 'textcolor', args: ['red'] }), '\\textcolor{red}{');
  assert.equal(opener({ cmd: 'hl', opt: 'green' }), '\\hl[green]{');
  assert.equal(opener({ cmd: 'textcolor', opt: 'HTML', args: ['C00000'] }), '\\textcolor[HTML]{C00000}{');
});

ok('parsing a wrapper where it starts: command, arguments, option, declaration in a group', () => {
  const t = 'a \\textcolor{red}{x {y} z} b \\hl[green]{w} {\\bfseries v} {\\bf  u}';
  const c = parseAt(t, t.indexOf('\\textcolor'));
  assert.deepEqual([c.cmd, c.args, t.slice(c.is, c.ie), t.slice(c.s, c.e)], ['textcolor', ['red'], 'x {y} z', '\\textcolor{red}{x {y} z}']);
  const h = parseAt(t, t.indexOf('\\hl'));
  assert.deepEqual([h.cmd, h.opt, t.slice(h.is, h.ie)], ['hl', 'green', 'w']);
  const d = parseAt(t, t.indexOf('{\\bfseries'));
  assert.deepEqual([d.cmd, d.decl, t.slice(d.is, d.ie)], ['bfseries', true, 'v']);
  assert.equal(t.slice(parseAt(t, t.indexOf('{\\bf ')).is, parseAt(t, t.indexOf('{\\bf ')).ie), 'u');
  // escaped braces and a comment do not close it
  const e = '\\textbf{a \\} b % }\n c}';
  assert.equal(parseAt(e, 0).e, e.length);
  assert.equal(parseAt('\\textbf{open', 0), null);
});

ok('wrap and unwrap give the bytes back; the selection stays on the words', () => {
  const src = 'Some plain words here.';
  const a = at(src, 'plain'), b = a + 'plain words'.length;
  const r = wrapEdits(src, a, b, { cmd: 'textcolor', args: ['red'] });
  const out = applyEdits(src, r.edits);
  assert.equal(out, 'Some \\textcolor{red}{plain words} here.');
  assert.equal(out.slice(r.sel.a, r.sel.b), 'plain words');
  const W = parseAt(out, out.indexOf('\\textcolor'));
  assert.equal(applyEdits(out, unwrapEdits(out, W)), src);
  // an empty selection: the empty wrapper, the caret between its braces
  const e = wrapEdits(src, 4, 4, { cmd: 'hl', opt: 'green' });
  assert.equal(applyEdits(src, e.edits), 'Some\\hl[green]{} plain words here.');
  assert.equal(e.p, 4 + '\\hl[green]{'.length);
});

ok('a selection over paragraphs: each paragraph its own wrapper, blank lines outside them', () => {
  const src = 'One two.\n\nThree four.\n\n  Five six.';
  const r = wrapEdits(src, at(src, 'two'), at(src, 'Five', 4), { cmd: 'textbf' });
  const out = applyEdits(src, r.edits);
  assert.equal(out, 'One \\textbf{two.}\n\n\\textbf{Three four.}\n\n  \\textbf{Five} six.');
  assert.equal(out.slice(r.sel.a, r.sel.b), 'two.}\n\n\\textbf{Three four.}\n\n  \\textbf{Five');
});

ok('a selection that crosses structure is refused', () => {
  const src = 'a \\emph{b c} d';
  assert.equal(wrapEdits(src, at(src, 'a'), at(src, 'c'), { cmd: 'textbf' }).error, 'crosses');
});

ok('a selection inside a character of several code points takes it whole', () => {
  const src = 'x \u0915\u094d\u0937\u093f y';
  const r = wrapEdits(src, 3, 5, { cmd: 'textbf' });
  assert.equal(applyEdits(src, r.edits), 'x \\textbf{\u0915\u094d\u0937\u093f} y');
});

ok('hand written forms are the same kind: found around a selection and taken off exactly', () => {
  assert.equal(groupOf('bfseries'), 'bold');
  assert.equal(groupOf('textit'), 'italic');
  for (const [src, inner] of [['A \\textbf{bold words} z', 'bold words'], ['A {\\bfseries bold words} z', 'bold words'], ['A {\\bf bold words} z', 'bold words'], ['A \\textbf{x \\emph{bold words} y} z', 'x \\emph{bold words} y']]) {
    const a = at(src, 'words'), W = enclosing(src, a, a + 2, groupNames('bold'));
    assert.ok(W, src);
    assert.equal(src.slice(W.is, W.ie), inner, src);
    const off = applyEdits(src, unwrapEdits(src, W));
    assert.equal(off, 'A ' + inner + ' z', src);
  }
  // not bold: a group that only starts with another declaration, an escaped brace
  assert.equal(enclosing('{\\itshape x}', 9, 10, groupNames('bold')), null);
  assert.equal(enclosing('\\textbf\\{x', 9, 9, groupNames('bold')), null);
  // italic inside bold: the innermost of the kind asked for
  const nest = '\\emph{a \\textbf{b \\emph{c} d}}';
  const W = enclosing(nest, at(nest, 'c'), at(nest, 'c') + 1, groupNames('italic'));
  assert.equal(nest.slice(W.s, W.e), '\\emph{c}');
});

ok('toggle as the B button does it: on, off from inside, off from a caret in it', () => {
  const src = 'Some plain words.';
  const on = toggleEdits(src, 5, 10, 'bold', null);
  const b = applyEdits(src, on.edits);
  assert.equal(b, 'Some \\textbf{plain} words.');
  const W = enclosing(b, on.sel.a, on.sel.b, groupNames('bold'));
  const off = toggleEdits(b, on.sel.a, on.sel.b, 'bold', W);
  assert.equal(applyEdits(b, off.edits), src);
  assert.equal(applyEdits(b, off.edits).slice(off.sel.a, off.sel.b), 'plain');
  const caret = toggleEdits(b, at(b, 'lain'), at(b, 'lain'), 'bold', W);
  assert.equal(applyEdits(b, caret.edits), src);
  assert.equal(caret.p, at(src, 'lain'));
});

ok('a new argument for a wrapper: colour changed, option added, declaration made a command', () => {
  const c = 'x \\textcolor{red}{y} z';
  assert.equal(applyEdits(c, rewrapEdits(c, parseAt(c, 2), { cmd: 'textcolor', args: ['blue'] })), 'x \\textcolor{blue}{y} z');
  const h = 'x \\hl{y} z';
  assert.equal(applyEdits(h, rewrapEdits(h, parseAt(h, 2), { cmd: 'hl', opt: 'green' })), 'x \\hl[green]{y} z');
  const d = 'x {\\bf y} z';
  assert.equal(applyEdits(d, rewrapEdits(d, parseAt(d, 2), { cmd: 'textbf' })), 'x \\textbf{y} z');
  assert.deepEqual(rewrapEdits(c, parseAt(c, 2), { cmd: 'textcolor', args: ['red'] }), []);
});

ok('a wrapper split around part of what it holds', () => {
  const src = 'x \\textbf{abc} y';
  const W = parseAt(src, 2), b = at(src, 'abc', 1);
  const r = splitText(src, W, b, b + 1);
  assert.equal(r.text, 'x \\textbf{a}b\\textbf{c} y');
  assert.equal(r.text.slice(r.a, r.b), 'b');
  const d = '{\\bf abc}';
  assert.equal(splitText(d, parseAt(d, 0), at(d, 'abc', 1), at(d, 'abc', 2)).text, '{\\bf a}b{\\bf c}');
  // at the edges: no empty wrapper left
  assert.equal(splitText(src, W, at(src, 'abc'), at(src, 'abc', 1)).text, 'x a\\textbf{bc} y');
  // not where a part would not be whole
  const n2 = '\\textbf{a \\emph{b c} d}';
  assert.equal(splitText(n2, parseAt(n2, 0), at(n2, 'c'), at(n2, 'c') + 1), null);
});

ok('clear all of some kinds: inside the selection, and around it split', () => {
  const src = 'P \\textbf{x \\emph{abc} y} \\textbf{q} Z';
  const names = [...groupNames('bold'), ...groupNames('italic')];
  const r = clearText(src, at(src, 'abc', 1), at(src, 'abc', 2), names);
  assert.equal(r.text, 'P \\textbf{x \\emph{a}}b\\textbf{\\emph{c} y} \\textbf{q} Z');
  const all = clearText(src, 0, src.length, names);
  assert.equal(all.text, 'P x abc y q Z');
  assert.equal(applyEdits(src, all.edits), all.text);
  assert.equal(clearText('plain', 0, 5, names), null);
});

ok('batches add kinds of their own', () => {
  defineGroup('strike', { write: 'sout', cmds: ['sout'] });
  assert.equal(groupOf('sout'), 'strike');
  assert.equal(GROUPS.strike.write, 'sout');
  assert.deepEqual(wrappersIn('a \\sout{b} \\textbf{c}', 0, 20, groupNames('strike')).map((w) => w.cmd), ['sout']);
});

ok('positions through edits; one edit between two texts', () => {
  const edits = [{ s: 5, e: 5, t: 'XX' }, { s: 1, e: 3, t: '' }];
  assert.equal(mapPos(edits, 0), 0);
  assert.equal(mapPos(edits, 4), 2);
  assert.equal(mapPos(edits, 6), 6);
  assert.deepEqual(diffEdit('abcdef', 'abXYef'), { s: 2, e: 4, t: 'XY' });
  assert.equal(diffEdit('a', 'a'), null);
});

ok('a stranger\'s text: a hundred thousand open braces read in bounded time', () => {
  const t0 = Date.now();
  const bad = '{'.repeat(100000) + 'x' + '\\textbf{'.repeat(5000);
  enclosing(bad, 100000, 100001, groupNames('bold'));
  clearText(bad, 0, 2000, groupNames('bold'));
  assert.ok(Date.now() - t0 < 4000, 'took ' + (Date.now() - t0) + ' ms');
});

ok('a stranger\'s thousands of {\\bf groups, unclosed: the ribbon\'s look at every caret move, and Clear All, stay quick', () => {
  // (each unmatched brace had its end looked for, 20 000 characters each, before its name was
  // compared; and Clear All took the wrappers off one at a time: four seconds for a thousand)
  const t0 = Date.now();
  const decl = '{\\bf '.repeat(4000) + 'x';
  for (let k = 0; k < 10; k++) { enclosing(decl, decl.length - 1, decl.length, groupNames('italic')); enclosing(decl, decl.length - 1, decl.length, groupNames('bold')); }
  const many = '\\textbf{a} '.repeat(1000) + '{\\bf '.repeat(1000);
  const r = clearText(many, 0, many.length, groupNames('bold'));
  assert.ok(r && !r.text.includes('\\textbf'));
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
});

ok('the look at each move of the caret, and Clear All: the ends of the groups found in one walk', () => {
  // (each unclosed {\bf had its end looked for alone, 20 000 characters: 40 ms a look, three
  // looks at every move)
  const t0 = Date.now();
  const un = '{\\bf a '.repeat(4000) + 'x' + '%{\n'.repeat(4000) + 'word';
  for (let k = 0; k < 100; k++) assert.equal(enclosing(un, un.length - 1 - (k % 3), un.length - 1 - (k % 3), groupNames(['bold', 'italic', 'underline'][k % 3])), null);
  const closed = '{\\bf a '.repeat(4000) + 'x' + '}'.repeat(4000);
  for (let k = 0; k < 100; k++) assert.equal(enclosing(closed, 4000 * 7 - 1 - k, 4000 * 7 - 1 - k, groupNames('bold')).cmd, 'bf');
  // and Clear All on 3000 nested groups and on 20 000 in a row (0.2 s and 0.5 s before)
  // (2000 wrappers inside a selection at most, and the braces of one holding more than 4000
  // characters kept, as with a stranger's text a result that is whole matters more)
  const nested = '{\\bf x '.repeat(3000) + '}'.repeat(3000), flat = '{\\bf x} '.repeat(20000), few = '{\\bf x} '.repeat(1500);
  assert.ok(clearText(nested, 0, nested.length, groupNames('bold')).text.length < nested.length);
  assert.ok(clearText(flat, 0, flat.length, groupNames('bold')).text.startsWith('x '.repeat(2000) + '{\\bf x}'));
  assert.ok(clearText(few, 0, few.length, groupNames('bold')).text === 'x '.repeat(1500));
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
});

// ---- a review's cases (the braces of a hand written group, comments, a command before) ----------
// B off with the caret in the word, as the B button does it
const off = (src, word, names = groupNames('bold'), group = 'bold') => {
  const k = src.indexOf(word) + 1, W = enclosing(src, k, k, names);
  if (!W) return null;
  const r = toggleEdits(src, k, k, group, W);
  return applyEdits(src, r.edits);
};

ok('a group {\\bf ...} that is an argument or follows a command keeps its braces; \\bf alone goes', () => {
  for (const [src, word, want, names] of [
    ['\\noindent{\\bf Proof.} The claim follows.', 'Proof', '\\noindent{Proof.} The claim follows.'],
    ['\\section{\\bf Intro}\nText', 'Intro', '\\section{Intro}\nText'],
    ['\\textcolor{red}{\\bf warning text} is here.', 'warning', '\\textcolor{red}{warning text} is here.'],
    ['\\href{https://x.org}{\\bf link text}', 'link', '\\href{https://x.org}{link text}'],
    ['\\centerline{\\bf Abstract}', 'Abstract', '\\centerline{Abstract}'],
    ['\\item[{\\bf Step}] do it', 'Step', '\\item[{Step}] do it'],
    ['\\multicolumn{2}{|c|}{\\bf Header words} \\\\', 'Header', '\\multicolumn{2}{|c|}{Header words} \\\\'],
    ['\\mbox{\\tt code}', 'code', '\\mbox{code}', groupNames('mono')],
    ['\\noindent {\\bf Proof.} x', 'Proof', '\\noindent {Proof.} x'],
    // as the corpus writes them
    ['\\multicolumn{3}{|c|}{\\bf Results} \\\\ \\hline', 'Results', '\\multicolumn{3}{|c|}{Results} \\\\ \\hline'],
    ['\\textcolor{red}{\\bf Achtung:} Text', 'Achtung', '\\textcolor{red}{Achtung:} Text'],
    ['\\begin{description}\n\\item[{\\bf Step 1:}] Start\n\\end{description}', 'Step', '\\begin{description}\n\\item[{Step 1:}] Start\n\\end{description}'],
    // (verbatim from the corpus at 8bfd313b8d98: after a superscript's group, and an argument
    // whose words are a command)
    ['Varianz $u\\lambda^{3}{\\bf Var}(t)$. Genauso', 'Var}', 'Varianz $u\\lambda^{3}{Var}(t)$. Genauso'],
    ['  \\fancyhead[L]{\\small\\textcolor{GruenPrimary}{\\bfseries\\partei}\\hspace{0.8em}\\textcolor{Grau}{Stadtrat Plattling}}', 'partei', '  \\fancyhead[L]{\\small\\textcolor{GruenPrimary}{\\partei}\\hspace{0.8em}\\textcolor{Grau}{Stadtrat Plattling}}']
  ]) assert.equal(off(src, word, names, names ? 'mono' : 'bold'), want, src);
});

ok('a group whose words hold another declaration keeps its braces: nothing leaks past it', () => {
  assert.equal(off('{\\bf\\large Title words} and the rest of the paragraph.', 'Title'), '{\\large Title words} and the rest of the paragraph.');
  assert.equal(off('{\\bf bold \\it bolditalic} plain after', 'bold '), '{bold \\it bolditalic} plain after');
  assert.equal(off('A {\\bf see \\ref{x}} b', 'see'), 'A {see \\ref{x}} b');
  // one that stands free loses its braces with \\bf
  assert.equal(off('Some {\\bf plain words} here.', 'plain'), 'Some plain words here.');
  assert.equal(off('x {\\it y} z', 'y', groupNames('italic'), 'italic'), 'x y z');
  assert.equal(off('{\\bfseries Plain} at the start', 'Plain'), 'Plain at the start');
});

ok('off right after a command: a space (or {}) keeps the words from running into it', () => {
  assert.equal(off('\\noindent\\textbf{Proof.} The claim.', 'Proof'), '\\noindent Proof. The claim.');
  assert.equal(off('\\item\\textbf{[x]} y', 'x]'), '\\item{}[x] y');
  assert.equal(off('a \\textbf{\\LaTeX}ing', 'LaTeX'), 'a \\LaTeX{}ing');
  assert.equal(off('see \\textbf{word} here', 'word'), 'see word here');
  const c = clearText('\\noindent{\\bf Proof.} x', 0, 24, groupNames('bold'));
  assert.equal(c.text, '\\noindent{Proof.} x');
  assert.equal(clearText('\\section{\\bf A} \\textbf{b}', 0, 26, groupNames('bold')).text, '\\section{A} b');
});

ok('braces in comments count for nothing', () => {
  const bold = groupNames('bold');
  for (const [src, word] of [['Intro % {\\bf old\nThe caret text here} and more', 'caret'], ['%{\\bf\nCaret here.\n%}\n\\begin{center}x\\end{center}}', 'Caret'],
    ['\\footnote{\n%\\textbf{\nSome note words here.\n%}\n}', 'note'], ['x \\% {\\bf y} % z\nw', 'w']]) {
    const k = src.indexOf(word) + 1;
    assert.equal(enclosing(src, k, k, bold), null, src);
  }
  // the real one is still found past a comment
  const src = '\\textbf{a % } not this\nb}';
  const W = enclosing(src, src.indexOf('b}') + 1, src.indexOf('b}') + 1, bold);
  assert.equal(src.slice(W.s, W.e), src);
});

ok('a part of a group that is an argument stays in one group; declarations that would move along refuse', () => {
  const src = '\\textcolor{red}{\\bf abc} d', W = enclosing(src, src.indexOf('abc') + 1, src.indexOf('abc') + 2, groupNames('bold'));
  assert.equal(splitText(src, W, src.indexOf('abc') + 1, src.indexOf('abc') + 2).text, '\\textcolor{red}{{\\bf a}b{\\bf c}} d');
  const d = '{\\bf a \\it b c}', V = parseAt(d, 0);
  assert.equal(splitText(d, V, d.indexOf('b c'), d.indexOf('b c') + 1), null);
  const f = 'x {\\bf abc} y', U = parseAt(f, 2);
  assert.equal(splitText(f, U, f.indexOf('abc') + 1, f.indexOf('abc') + 2).text, 'x {\\bf a}b{\\bf c} y');
});

console.log('wrap: ' + n + ' groups of checks passed');
