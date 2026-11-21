// TeX's log read as Problems lists it (src/tex.js parseTeXLog, issueText): each error with the
// place TeX stopped, the source line's own text where TeX printed that place blank, and no empty
// "(at )" (every error read "message. (at )" when TeX's context line was blank).
import assert from 'node:assert/strict';
import { parseTeXLog, issueText } from '../src/tex.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

const LOG = [
  './main.tex:4: Undefined control sequence.',
  'l.4 Hello \\undefinedcommand',
  '                           {} world.',
  '',
  './main.tex:13: Paragraph ended before \\textbf was complete.',
  '<to be read again> ',
  '                   \\par ',
  'l.13 ',
  '     ',
  '',
  './main.tex:9: Missing $ inserted.',
  '<inserted text> ',
  '                $',
  'l.9    ',
  '       ',
  ''
].join('\n');

const SRC = ['\\documentclass{article}', '\\begin{document}', '', 'Hello \\undefinedcommand{} world.', '', '', '', '', '    a = \\frac{b}', '', '', '', '', '\\end{document}'];

ok('an error TeX stopped inside a line names where', () => {
  const [x] = parseTeXLog(LOG);
  assert.equal(issueText(x, SRC[x.line - 1]), 'Undefined control sequence. (at Hello \\undefinedcommand{} world.)');
});

ok('a blank context: the source line\'s own text, or nothing', () => {
  const xs = parseTeXLog(LOG);
  const par = xs.find((x) => /Paragraph ended/.test(x.msg)), dollar = xs.find((x) => /Missing \$/.test(x.msg));
  // (an empty line where TeX stopped: no "(at )")
  assert.equal(issueText(par, SRC[par.line - 1]), 'Paragraph ended before \\textbf was complete.');
  // (TeX printed only the line's indent: the line's words instead)
  assert.equal(issueText(dollar, SRC[dollar.line - 1]), 'Missing $ inserted. (at a = \\frac{b})');
  for (const x of xs) assert.doesNotMatch(issueText(x, ''), /\(at\s*\)/);
});

ok('warnings name no place', () => {
  const [w] = parseTeXLog('LaTeX Warning: Citation `x\' on page 1 undefined on input line 7.\n');
  assert.equal(issueText(w, 'see \\cite{x}'), 'Citation `x\' on page 1 undefined on input line 7.');
});

console.log('texlog:', n, 'passed');
