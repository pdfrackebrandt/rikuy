// AutoCorrect as you type (src/autocorrect.js): what a typed character completes and the edit
// that corrects it, on the text before the caret; nothing inside a command's name, after an
// abbreviation, in a word that runs on, or with its switch off.
import assert from 'node:assert/strict';
import { correct, borderLine, DEFAULTS } from '../src/autocorrect.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
// the text after typing ch at the end of s, corrected: the typed character as typing writes it
const type = (s, ch, o = DEFAULTS, own = []) => {
  const r = correct(s, s.length, ch, o, own);
  if (!r) return s + ch;
  const t = s + ch, e = r.typed ? r.e + 1 : r.e;
  return t.slice(0, r.s) + r.t + t.slice(e);
};

ok('replace: (c) (r) (tm) and ... at once; arrows and the rest at the next space or sign', () => {
  assert.equal(type('Rikuy (c', ')'), 'Rikuy \\copyright{}');
  assert.equal(type('Brand(tm', ')'), 'Brand\\texttrademark{}');
  assert.equal(type('wait..', '.'), 'wait\\ldots{}');
  assert.equal(type('a ->', ' '), 'a \\textrightarrow{} ');
  assert.equal(type('a <=', ' '), 'a \\ensuremath{\\Leftarrow} ');
  assert.equal(type('a <=', '>'), 'a <=>');
  assert.equal(type('a <=>', ','), 'a \\ensuremath{\\Leftrightarrow},');
  assert.equal(type('x->y', ' '), 'x->y ');
  assert.equal(type('teh', ' ', DEFAULTS, [['teh', 'the']]), 'the ');
  assert.equal(type('xteh', ' ', DEFAULTS, [['teh', 'the']]), 'xteh ');
  assert.equal(type('a (c', ')', { ...DEFAULTS, replace: false }), 'a (c)');
  assert.equal(type('\\ldots', ' '), '\\ldots ');
});

ok('links: an address then a space or a sign becomes \\url{}; www. gets https://', () => {
  assert.equal(type('See https://rikuy.rackebrandt.pe/a?b=1#x', ' '), 'See \\url{https://rikuy.rackebrandt.pe/a?b=1#x} ');
  assert.equal(type('at www.example.org.', ' '), 'at \\url{https://www.example.org}. ');
  assert.equal(type('https://rikuy', '.'), 'https://rikuy.');
  assert.equal(type('See https://x.org/', ' ', { ...DEFAULTS, links: false }), 'See https://x.org/ ');
  assert.equal(type('\\url{https://x.org', ' '), '\\url{https://x.org ');
});

ok('capitals: a sentence\'s first letter, TWo INitial CApitals, days; not after e.g. or in a command', () => {
  assert.equal(type('It works. then', ' '), 'It works. Then ');
  assert.equal(type('First line.\n\nsecond', ' '), 'First line.\n\nSecond ');
  assert.equal(type('as e.g. this', ' '), 'as e.g. this ');
  assert.equal(type('It was 1.5 times', ' '), 'It was 1.5 times ');
  assert.equal(type('a THere', ' '), 'a There ');
  assert.equal(type('the IDs', ' '), 'the IDs ');
  assert.equal(type('on monday', ' '), 'on Monday ');
  assert.equal(type('\\section{intro', '}'), '\\section{intro}');
  assert.equal(type('\\section{intro', ' '), '\\section{Intro ');
  assert.equal(type('x \\textbf', ' '), 'x \\textbf ');
  assert.equal(type('It works. then', ' ', { ...DEFAULTS, capitals: false }), 'It works. then ');
});

ok('ordinals and fractions, off by default', () => {
  assert.equal(type('the 21st', ' '), 'the 21st ');
  assert.equal(type('the 21st', ' ', { ...DEFAULTS, ordinals: true }), 'the 21\\textsuperscript{st} ');
  assert.equal(type('add 1/2', ' ', { ...DEFAULTS, fractions: true }), 'add \\textonehalf{} ');
  assert.equal(type('add 11/2', ' ', { ...DEFAULTS, fractions: true }), 'add 11/2 ');
});

ok('border lines', () => {
  assert.equal(borderLine('---'), '\\noindent\\rule{\\linewidth}{0.4pt}');
  assert.equal(borderLine('  ====== '), '\\noindent\\rule{\\linewidth}{0.4pt}');
  assert.equal(borderLine('\\_\\_\\_'), '\\noindent\\rule{\\linewidth}{0.4pt}');
  assert.equal(borderLine('--'), null);
  assert.equal(borderLine('a ---'), null);
});

ok('bounded: only the last 200 characters are read', () => {
  const long = 'x'.repeat(100000) + ' https://a.org';
  const t0 = Date.now();
  for (let i = 0; i < 1000; i++) correct(long, long.length, ' ');
  assert.ok(Date.now() - t0 < 500);
});

console.log('autocorrect:', n, 'groups passed');
