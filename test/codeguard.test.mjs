// src/codeguard.js: inline code's syntax kept whole by edits made on the page (its header says why)
import assert from 'node:assert/strict';
import { codeRuns, keepCodeSyntax } from '../src/codeguard.js';

let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name, e.message); process.exitCode = 1; } };
const apply = (src, edits) => { let t = src; for (const ed of [...edits].sort((a, b) => b.s - a.s)) t = t.slice(0, ed.s) + ed.t + t.slice(ed.e); return t; };
const run = (src, s, e, t) => { const files = new Map([['m', src]]); const r = keepCodeSyntax(files, [{ f: 'm', s, e, t }]); return { text: apply(src, r.edits), r }; };

ok('runs read as the parser reads them', () => {
  const s = 'a \\lstinline|x % y| b \\verb+q+ \\mintinline[o]{py}{f({})} \\lstinline{g {} h\n\\lstinline|open';
  const R = codeRuns(s, 0, s.length).map((x) => [s.slice(x.S, x.is), s.slice(x.is, x.ie), s.slice(x.ie, x.E)]);
  assert.deepEqual(R, [['\\lstinline|', 'x % y', '|'], ['\\verb+', 'q', '+'], ['\\mintinline[o]{py}{', 'f({})', '}'], ['\\lstinline{', 'g {', '}'], ['\\lstinline|', 'open', '']]);
});
const S = 'Use \\lstinline|abcd| here.';
const at = (t) => S.indexOf(t);
ok('a selection from inside the code to past it keeps the closing |', () => assert.equal(run(S, at('cd|'), at(' here') + 3, 'X').text, 'Use \\lstinline|abX|re.'));
ok('one from before the run into its code keeps the opening', () => assert.equal(run(S, at('Use') + 2, at('cd|'), 'X').text, 'UsX\\lstinline|cd| here.'));
ok('the closing | alone (Backspace after the code): the code\'s last letter', () => assert.equal(run(S, at('| here'), at(' here'), '').text, 'Use \\lstinline|abc| here.'));
ok('the opening alone (Delete before the code): its first letter', () => assert.equal(run(S, at('\\lst'), at('\\lst') + 1, '').text, 'Use \\lstinline|bcd| here.'));
ok('an empty code\'s closer: the whole run', () => assert.equal(run('Use \\lstinline|| here.', 15, 16, '').text, 'Use  here.'));
ok('all of the code\'s text and more: the whole run, no empty shell', () => assert.equal(run(S, 0, at('| here'), 'X').text, 'X here.'));
ok('inside the code, or the whole run, or outside it: as it came', () => {
  for (const [s, e] of [[at('bc'), at('d|')], [at('\\lst'), at(' here')], [0, 3], [at('here'), S.length]]) { const r = run(S, s, e, 'X'); assert.equal(r.r.moved, null, S.slice(s, e)); }
});
ok('a join from the code\'s end: the closer stays', () => assert.equal(run('a \\lstinline|ab|\n\nNext.', 15, 18, '').text.replace(/\n/g, '/'), 'a \\lstinline|ab|Next.'));
ok('the caret after the letters typed over a cut range', () => {
  const r = run(S, at('cd|'), at(' here') + 3, 'X');
  assert.equal(r.r.moved('m', at('cd|') + 1), at('cd|') + 1);
});
ok('\\verb and braces of minted the same', () => {
  assert.equal(run('a \\verb|xy| b', 9, 12, 'Q').text, 'a \\verb|xQ|b');
  assert.equal(run('a \\mintinline{c}{xy} b', 18, 22, '').text, 'a \\mintinline{c}{x}');
});
console.log('codeguard: ' + n + ' passed');
