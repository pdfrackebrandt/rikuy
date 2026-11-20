// Word's keys that type or move text (src/cmd/typing.js) and Go Back's places (src/cmd/find.js),
// on strings: Alt+X both ways, the accent keys' letters, the places of the last edits moved
// through the edits made after them.
import assert from 'node:assert/strict';
import '../src/cmd/index.js';
import { unicodeToggle, accented, openBraces } from '../src/cmd/typing.js';
import { editSpots } from '../src/cmd/find.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
// the source with Alt+X done at the caret | (or over the selection [ ])
function altX(s) {
  const a = s.indexOf('['), b = s.indexOf(']');
  const src = s.replace(/[[\]|]/g, '');
  const r = a >= 0 ? unicodeToggle(src, a, b - 1) : unicodeToggle(src, s.indexOf('|'), s.indexOf('|'));
  if (!r) return null;
  return src.slice(0, r.s) + (r.ch != null ? r.ch : r.code) + src.slice(r.e);
}

ok('Alt+X: the hex code before the caret becomes its character, U+ too', () => {
  assert.equal(altX('caf00e9|'), 'café');
  assert.equal(altX('caf U+00E9|'), 'caf é');
  assert.equal(altX('x 1F600|'), 'x \u{1F600}');
  assert.equal(altX('x 2192|.'), 'x →.');
  // the longest run that is a character Unicode has given: not the private F00E9, nor 10FFFF
  assert.equal(altX('xyz1D400|'), 'xyz\u{1D400}');
  assert.equal(altX('ab10FFFF|'), 'ab10FF\u00ff');
});

ok('Alt+X: without a code, the character before the caret becomes its code', () => {
  assert.equal(altX('café|'), 'caf00E9');
  assert.equal(altX('a →|'), 'a 2192');
  assert.equal(altX('\u{1F600}|'), '1F600');
  // an escaped sign is the one character it stands for; ~ is the no-break space
  assert.equal(altX('50\\%|'), '500025');
  assert.equal(altX('a~|'), 'a00A0');
});

ok('Alt+X: never a command\'s name, a brace or a control character', () => {
  assert.equal(altX('\\bf|'), null);
  assert.equal(altX('\\textbf{x}|'), null);
  assert.equal(altX(' |'), null);
  // 1 alone is U+0001, a control character: the digit's own code instead
  assert.equal(altX('x 1|'), 'x 0031');
});

ok('Alt+X after a letter LaTeX writes with an accent: the code of the character it makes, as Word gives for é', () => {
  assert.equal(altX("caf\\'e|"), 'caf00E9');
  assert.equal(altX("caf\\'{e}|"), 'caf00E9');
  assert.equal(altX("caf{\\'e}|"), 'caf00E9');
  assert.equal(altX('x \\"o|'), 'x 00F6');
  assert.equal(altX('\\c{c}|a'), '00E7a');
  assert.equal(altX('\\v s|'), '0161');
  assert.equal(altX("na\\'\\i|ve"), 'na00EDve');
  assert.equal(altX('Stra\\ss{}|e'), 'Stra00DFe');
  assert.equal(altX('{\\o}|'), '00F8');
  // a brace of something else's is no part of it: \textbf{caf\'e} after its }
  assert.equal(altX("\\textbf{caf\\'e}|"), null);
  // a line break (\\\\) then o is no \\o
  assert.equal(altX('a\\\\o|'), 'a\\\\006F');
  // and the code goes back to the character
  assert.equal(altX('caf00E9|'), 'caf\u00e9');
});

ok('Alt+X over a selection: a code becomes its character, a character its code', () => {
  assert.equal(altX('a [00e9] b'), 'a é b');
  assert.equal(altX('a [é] b'), 'a 00E9 b');
  assert.equal(altX('a [two] b'), null);
});

ok('the accent keys: the letter after them as Word makes it', () => {
  assert.equal(accented('acute', 'e'), 'é');
  assert.equal(accented('acute', 'E'), 'É');
  assert.equal(accented('acute', 'd'), 'ð');
  assert.equal(accented('grave', 'a'), 'à');
  assert.equal(accented('circumflex', 'o'), 'ô');
  assert.equal(accented('tilde', 'n'), 'ñ');
  assert.equal(accented('umlaut', 'u'), 'ü');
  assert.equal(accented('umlaut', 'y'), 'ÿ');
  assert.equal(accented('ring', 'A'), 'Å');
  assert.equal(accented('ligature', 'a'), 'æ');
  assert.equal(accented('ligature', 'O'), 'Œ');
  assert.equal(accented('ligature', 's'), 'ß');
  assert.equal(accented('slash', 'o'), 'ø');
  // none: the letter is typed as it is
  assert.equal(accented('tilde', 'k'), null);
  assert.equal(accented('acute', '1'), null);
  assert.equal(accented('acute', 'ab'), null);
});

ok('Go Back: the last four places edited, newest first, moved through the edits after them', () => {
  const step = (f, s, del, ins) => ({ files: [{ f, s, del, ins }] });
  const hist = [
    step('main.tex', 10, '', 'abc'), // caret then at 13
    step('main.tex', 200, '', 'x'), // 201
    step('ch.tex', 5, '', 'yy'), // 7 in another file
    step('main.tex', 100, 'zzzzz', '') // 100: 5 characters out before 201, not before 13
  ];
  assert.deepEqual(editSpots(hist, 4), [{ f: 'main.tex', p: 100 }, { f: 'ch.tex', p: 7 }, { f: 'main.tex', p: 196 }, { f: 'main.tex', p: 13 }]);
  // places closer than 40 characters are one place; n of them at most
  assert.deepEqual(editSpots([step('a', 0, '', 'a'), step('a', 1, '', 'b'), step('a', 2, '', 'c')], 4), [{ f: 'a', p: 3 }]);
  assert.equal(editSpots(hist, 2).length, 2);
  // an edit over the place: the place to the end of what replaced it
  assert.deepEqual(editSpots([step('a', 50, '', 'q'), step('a', 40, 'x'.repeat(20), 'yy')], 4), [{ f: 'a', p: 42 }]);
  assert.deepEqual(editSpots([], 4), []);
});

ok('the Spike\'s pieces join as paragraphs, but with a space inside a command\'s argument', () => {
  const s = 'Text.\n\n\\section{Clo|sing} and \\{ \\textbf{x} % {\nmore|';
  const at = (k) => s.replace(/\|/g, '').length && s.split('|').slice(0, k).join('').length;
  const src = s.replace(/\|/g, '');
  assert.equal(openBraces(src, at(1)), 1);
  assert.equal(openBraces(src, at(2)), 0);
});

console.log('typing: ' + n + ' groups of checks passed');
