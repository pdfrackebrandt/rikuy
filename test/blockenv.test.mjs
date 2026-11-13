// Paragraphs in an environment (src/blockenv.js): put in on lines of their own and taken out
// byte for byte; arguments and options; another environment in its place; one written by hand
// left a paragraph of its own; a declaration at a block's start; CRLF files; a stranger's
// paragraph of spaces read in bounded time.
import assert from 'node:assert/strict';
import { envOpen, envClose, envWords, wrapBlockEdits, unwrapBlockEdits, rewrapBlockEdits, declAtStart, blankPads, startsLine } from '../src/blockenv.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const DOC = 'Before.\n\nThe words of it,\nover two lines.\n\nAfter.';
const S = DOC.indexOf('The'), E = DOC.indexOf('lines.') + 6;
const block = (t, name) => { const s = t.indexOf('\\begin{' + name), e = t.indexOf('\\end{' + name) + ('\\end{' + name + '}').length; return [s, e]; };

ok('openers with options and arguments', () => {
  assert.equal(envOpen('quote'), '\\begin{quote}');
  assert.equal(envOpen('spacing', { args: ['1.5'] }), '\\begin{spacing}{1.5}');
  assert.equal(envOpen('adjustwidth', { args: ['1cm', ''] }), '\\begin{adjustwidth}{1cm}{}');
  assert.equal(envOpen('tcolorbox', { opt: 'colback=yellow!10,boxrule=0pt' }), '\\begin{tcolorbox}[colback=yellow!10,boxrule=0pt]');
  assert.equal(envClose('center'), '\\end{center}');
});

ok('in and out again, byte for byte, for each kind', () => {
  for (const [name, o, nargs] of [['quote', {}, {}], ['center', {}, {}], ['flushright', {}, {}], ['spacing', { args: ['1.5'] }, { spacing: 1 }], ['adjustwidth', { args: ['1cm', ''] }, { adjustwidth: 2 }], ['tcolorbox', { opt: 'colback=white' }, {}]]) {
    const t = applyEdits(DOC, wrapBlockEdits(DOC, S, E, name, o));
    assert.equal(t, 'Before.\n\n' + envOpen(name, o) + '\nThe words of it,\nover two lines.\n' + envClose(name) + '\n\nAfter.', name);
    const [s, e] = block(t, name);
    const W = envWords(t, s, e, [name], nargs);
    assert.ok(W, name);
    assert.equal(t.slice(W.ws, W.we), 'The words of it,\nover two lines.');
    assert.deepEqual([W.opt, W.args], [o.opt ?? null, o.args || []], name);
    assert.equal(applyEdits(t, unwrapBlockEdits(t, W)), DOC, name + ' back');
  }
});

ok('only where the paragraph starts its line', () => {
  const t = 'Before. \\noindent The words.';
  assert.equal(wrapBlockEdits(t, t.indexOf('\\noindent'), t.length, 'center'), null);
  assert.equal(startsLine(DOC, S), true);
});

ok('one environment for another, and new arguments; its words stay', () => {
  const t = applyEdits(DOC, wrapBlockEdits(DOC, S, E, 'center'));
  const [s, e] = block(t, 'center');
  const r = applyEdits(t, rewrapBlockEdits(t, envWords(t, s, e, ['center', 'flushright']), 'flushright'));
  assert.equal(r, t.replace('\\begin{center}', '\\begin{flushright}').replace('\\end{center}', '\\end{flushright}'));
  const sp = applyEdits(DOC, wrapBlockEdits(DOC, S, E, 'spacing', { args: ['1.5'] }));
  const [s2, e2] = block(sp, 'spacing');
  assert.equal(applyEdits(sp, rewrapBlockEdits(sp, envWords(sp, s2, e2, ['spacing'], { spacing: 1 }), 'spacing', { args: ['2'] })), sp.replace('{spacing}{1.5}', '{spacing}{2}'));
});

ok('one written by hand: its words stay a paragraph of their own when it goes', () => {
  const t = 'Before.\n\\begin{center}   The words.  \\end{center}\nAfter.';
  const [s, e] = block(t, 'center');
  const W = envWords(t, s, e, ['center']);
  assert.equal(t.slice(W.ws, W.we), 'The words.');
  assert.equal(applyEdits(t, unwrapBlockEdits(t, W)), 'Before.\n\nThe words.\n\nAfter.');
  // not the environment asked for, or not all of the block
  assert.equal(envWords(t, s, e, ['quote']), null);
  assert.equal(envWords(t, s, e - 3, ['center']), null);
});

ok('an [option] only where the environment takes one: center\'s "[t]" is the text it centres', () => {
  const t = 'Before.\n\\begin{center}[t] words\n\\end{center}\nAfter.';
  const [s, e] = block(t, 'center');
  const W = envWords(t, s, e, ['center']);
  assert.equal(W.opt, null);
  assert.equal(t.slice(W.ws, W.we), '[t] words');
  assert.equal(applyEdits(t, unwrapBlockEdits(t, W)), 'Before.\n\n[t] words\n\nAfter.');
  const f = 'Before.\n\\begin{figure}[t]\nwords\n\\end{figure}\nAfter.', [fs, fe] = block(f, 'figure');
  assert.equal(envWords(f, fs, fe, ['figure']).opt, 't');
  // (a batch with an environment of its own names it)
  assert.equal(envWords(t, s, e, ['center'], {}, ['center']).opt, 't');
});

ok('a file written with CRLF keeps them', () => {
  const crlf = DOC.replace(/\n/g, '\r\n');
  const s = crlf.indexOf('The'), e = crlf.indexOf('lines.') + 6;
  const t = applyEdits(crlf, wrapBlockEdits(crlf, s, e, 'quote'));
  assert.ok(t.includes('\\begin{quote}\r\nThe') && t.includes('lines.\r\n\\end{quote}'));
  const [bs, be] = block(t, 'quote');
  assert.equal(applyEdits(t, unwrapBlockEdits(t, envWords(t, bs, be, ['quote']))), crlf);
});

ok('a declaration at a block\'s start', () => {
  const t = '\\centering\n\\includegraphics{x}';
  assert.deepEqual(declAtStart(t, 0, t.length, ['centering', 'raggedleft']), { name: 'centering', s: 0, e: 11 });
  assert.equal(declAtStart('\\centerline{x}', 0, 14, ['centering']), null);
  assert.equal(declAtStart('  \\raggedleft words', 0, 19, ['raggedleft']).e, 14);
});

ok('the blank lines a paragraph needs', () => {
  assert.deepEqual(blankPads('a\nb\nc', 2, 3), { b: '\n', a: '\n' });
  assert.deepEqual(blankPads('\\section{x}\nb\n\\end{itemize}', 12, 13), { b: '', a: '' });
});

ok('a stranger\'s block of 100 000 spaces is read in bounded time', () => {
  const t = '\\begin{quote}' + ' '.repeat(100000) + 'x';
  const t0 = Date.now();
  for (let k = 0; k < 20; k++) envWords(t, 0, t.length, ['quote']);
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms');
});

console.log('blockenv: ' + n + ' groups of checks passed');
