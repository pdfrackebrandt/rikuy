// AutoCorrect as you type (src/autocorrect.js): what a typed character completes and the edit
// that corrects it, on the text before the caret; nothing inside a command's name, after an
// abbreviation, in a word that runs on, or with its switch off.
import assert from 'node:assert/strict';
import { correct, borderLine, DEFAULTS } from '../src/autocorrect.js';
import { escapeTeX } from '../src/editor.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
// the text after typing ch at the end of s, corrected: the typed character as typing writes it
const type = (s, ch, o = DEFAULTS, own = [], ex = []) => {
  const r = correct(s, s.length, ch, o, own, ex);
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
  // a list's marker at a paragraph's start stays as typed (B3's automatic lists read it)
  assert.equal(type('a', ')'), 'a)');
  assert.equal(type('Text.\n\nb', '.'), 'Text.\n\nb.');
  assert.equal(type('x\n\n(c', ')'), 'x\n\n(c)');
  assert.equal(type('\\item (r', ')'), '\\item (r)');
  // the review's (M4): degrees and words written so on purpose, one's own exceptions, f(c), (a) (b) (c)
  for (const w of ['MPhil', 'DPhil', 'MRes', 'OAuth', 'OCaml', 'DNase', 'IPython']) assert.equal(type('an ' + w, ' '), 'an ' + w + ' ');
  assert.equal(type('a THere', ' ', DEFAULTS, [], ['THere']), 'a THere ');
  assert.equal(type('f(c', ')'), 'f(c)');
  assert.equal(type('items (a) (b) (c', ')'), 'items (a) (b) (c)');
  assert.equal(type('see https://x.org/a(c', ')'), 'see https://x.org/a(c)');
  assert.equal(type('see https://x.org/a->b', '-'), 'see https://x.org/a->b-');
  assert.equal(type('\\section{intro', '}'), '\\section{intro}');
  assert.equal(type('\\section{intro', ' '), '\\section{Intro ');
  assert.equal(type('x \\textbf', ' '), 'x \\textbf ');
  assert.equal(type('It works. then', ' ', { ...DEFAULTS, capitals: false }), 'It works. then ');
});

ok('a one word sentence, a sentence after a group or a note, and "i" in English (round 3)', () => {
  // the word with its stop or comma, capitalized at the space after them, as Word does at the stop
  assert.equal(type('The end. no.', ' '), 'The end. No. ');
  assert.equal(type('It came. yes,', ' '), 'It came. Yes, ');
  assert.equal(type('It came on monday.', ' '), 'It came on Monday. ');
  assert.equal(type('a THere.', ' '), 'a There. ');
  // never a list's marker at a paragraph's start, "a." or "ii.", nor an abbreviation's dots
  assert.equal(type('Text.\n\nb.', ' '), 'Text.\n\nb. ');
  assert.equal(type('Text.\n\nii.', ' '), 'Text.\n\nii. ');
  assert.equal(type('The end. e.g.', ' '), 'The end. e.g. ');
  assert.equal(type('It was. so.', ' ', { ...DEFAULTS, capitals: false }), 'It was. so. ');
  // the stop read through what closes after it; a note's text is a story of its own: its stop
  // ends no sentence of the text, and the stop before the note does
  assert.equal(type('\\textbf{The end.} next', ' '), '\\textbf{The end.} Next ');
  assert.equal(type('It ends.\\footnote{A note.} next', ' '), 'It ends.\\footnote{A note.} Next ');
  assert.equal(type('It ends.\\footnote{A note} next', ' '), 'It ends.\\footnote{A note} Next ');
  assert.equal(type('As shown by Smith\\footnote{See Smith (2020).} and', ' '), 'As shown by Smith\\footnote{See Smith (2020).} and ');
  assert.equal(type('We find\\todo{Check this.} that', ' '), 'We find\\todo{Check this.} that ');
  assert.equal(type('Smith\\thanks{Oxford.} and', ' '), 'Smith\\thanks{Oxford.} and ');
  assert.equal(type('It ends.\\label{s:a} next', ' '), 'It ends.\\label{s:a} Next ');
  assert.equal(type('see \\cite{a.b} next', ' '), 'see \\cite{a.b} next ');
  assert.equal(type('{\\bfseries Done.} next', ' '), '{\\bfseries Done.} Next ');
  assert.equal(type('as \\emph{e.g.} this', ' '), 'as \\emph{e.g.} this ');
  assert.equal(type('He said ``stop.\'\' then', ' '), 'He said ``stop.\'\' Then ');
  // "i" alone, in English only, never in i.e. or after an apostrophe
  const en = { ...DEFAULTS, english: () => true };
  assert.equal(type('so i', ' ', en), 'so I ');
  assert.equal(type('so i,', ' ', en), 'so I, ');
  assert.equal(type('so i', ' ', { ...DEFAULTS, english: () => false }), 'so i ');
  assert.equal(type('so i', ' ', { ...en, replace: false }), 'so i ');
  assert.equal(type('as i.e.', ' ', en), 'as i.e. ');
  assert.equal(type("Hawai'i", ' ', en), "Hawai'i ");
  assert.equal(type('café i', ' ', en), 'café I ');
  assert.equal(type('xéi', ' ', en), 'xéi ');
  assert.equal(type('Hawai\u02BBi', ' ', en), 'Hawai\u02BBi ');
  assert.equal(type('\\item i', ')', en), '\\item i)');
});

ok('smart quotes as typed or pasted: opening after a space, nested ones kept apart, code straight', () => {
  // typed a key at a time, each after the source's character before it
  // (typed a key at a time: the page hands over the two characters before the caret)
  const typed = (s) => { let t = ' '; for (const ch of s) t += escapeTeX(ch, t.slice(-2)); return t.slice(1); };
  // two straight double quotes: “”, as Word makes them (the second read the first as a single one)
  assert.equal(typed('say ""'), "say ``''");
  assert.equal(escapeTeX('say ""', ' '), "say ``''");
  assert.equal(typed("He said 'yes', it's rock 'n' roll"), "He said `yes', it's rock `n' roll");
  assert.equal(typed('\'"a"\''), "`{}``a'''");
  assert.equal(typed('"\'a\'"'), "```a'{}''");
  assert.equal(escapeTeX('"\'a\'"', ' '), "```a'{}''");
  assert.equal(escapeTeX('\'"a"\'', ' '), "`{}``a'''");
  // two straight quotes typed for LaTeX's own closing quote stay ''
  assert.equal(typed("end''"), "end''");
  assert.equal(escapeTeX("print 'a' \"b\"", ' ', { code: true }), "print 'a' \"b\"");
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
