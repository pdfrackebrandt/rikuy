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

console.log('wrap: ' + n + ' groups of checks passed');
