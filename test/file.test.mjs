// File › Properties as edits on strings (src/props.js): the cases of B12's hostile review (H1-H3,
// L4, L5) and the round trips of file.py, without a browser.
import assert from 'node:assert/strict';
import { readProperties, propertyEdits, escapeTyped, paired, fieldEdits, contextAt } from '../src/props.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const apply = (src, edits) => [...edits].sort((a, b) => b.s - a.s).reduce((t, e) => t.slice(0, e.s) + e.t + t.slice(e.e), src);
const set = (src, v, o) => { const r = propertyEdits(src, v, o); assert.ok(!r.error, r.error); return apply(src, r.edits); };

const AUTH = '\\documentclass{article}\n\\title{A study}\n\\author{%\n  Jane Doe\\thanks{Funded by X.}\\\\\n  Department of Y % office 3\n  \\and\n  John Roe}\n\\begin{document}\\maketitle Text.\\end{document}\n';
ok('H1: keywords alone leave a commented, multi-line author as it is', () => {
  const out = set(AUTH, { keywords: 'economics, AI' });
  assert.ok(out.includes(AUTH.slice(AUTH.indexOf('\\author'), AUTH.indexOf('\\begin'))), out);
  assert.ok(out.includes('\\IfPackageLoadedTF{hyperref}{}{\\PassOptionsToPackage{hidelinks}{hyperref}}\n\\usepackage{hyperref}\n\\hypersetup{pdfkeywords={economics, AI}}\n'), out);
});
ok('H1: every field sent back as shown (line ends as \\n) writes nothing', () => {
  const v = readProperties(AUTH).value;
  assert.deepEqual(propertyEdits(AUTH, v).edits, []);
  const crlf = AUTH.replace(/\n/g, '\r\n'), w = readProperties(crlf).value;
  assert.deepEqual(propertyEdits(crlf, { title: w.title, author: w.author.replace(/\r\n/g, '\n') }).edits, []);
});
ok('H1: an IEEE tabular author keeps its & when the title changes', () => {
  const d = '\\documentclass{article}\n\\title{T}\n\\author{\\begin{tabular}{cc}\n Ann & Ben\\\\\n MIT & ETH\n\\end{tabular}}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(d, { title: 'T2' }), d.replace('\\title{T}', '\\title{T2}'));
});
ok('H1: a change writes only the stretch typed, escaped; the rest stays as written', () => {
  const d = '\\documentclass{article}\n\\title{Growth \\& AI % draft\n  today}\n\\begin{document}x\\end{document}\n';
  const v = readProperties(d).value.title;
  assert.equal(set(d, { title: v.replace('today', 'R&D today') }), d.replace('  today', '  R\\&D today'));
});
ok('L4: typed specials escaped (\\\\% counted as two backslashes, _ and lone $), LaTeX and math kept', () => {
  assert.equal(escapeTyped('A \\\\% B'), 'A \\\\\\% B');
  assert.equal(escapeTyped('Q3_report 50$'), 'Q3\\_report 50\\$');
  assert.equal(escapeTyped('$x_i^2$ and \\emph{y} & z'), '$x_i^2$ and \\emph{y} \\& z');
  assert.equal(escapeTyped('a^b'), 'a\\^{}b');
  assert.ok(!paired('C:\\') && paired('C:\\\\') && !paired('a}b{') && paired('{a}'));
  const d = '\\documentclass{article}\n\\title{x}\n\\begin{document}x\\end{document}\n';
  assert.ok(propertyEdits(d, { title: 'C:\\' }).error);
});
ok('H2: hyperref, bare, before cleveref; its keys in \\hypersetup', () => {
  const d = '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{cleveref}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(d, { subject: 'Uber' }), d.replace('\\usepackage{cleveref}', '\\IfPackageLoadedTF{hyperref}{}{\\PassOptionsToPackage{hidelinks}{hyperref}}\n\\usepackage{hyperref}\n\\hypersetup{pdfsubject={Uber}}\n\\usepackage{cleveref}'));
});
ok('H3: a class that loads hyperref gets a \\hypersetup line, no \\usepackage', () => {
  for (const c of ['{beamer}', '[11pt]{moderncv}', '{tufte-handout}']) {
    const d = '\\documentclass' + c + '\n\\begin{document}x\\end{document}\n';
    assert.equal(set(d, { subject: 'Uber' }), d.replace('\\begin{document}', '\\hypersetup{pdfsubject={Uber}}\n\\begin{document}'), c);
  }
  // V2: acmart sets the PDF's keys as the document begins: after it
  const d = '\\documentclass[sigconf]{acmart}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(d, { subject: 'Uber' }), d.replace('\\begin{document}', '\\AtEndDocument{\\hypersetup{pdfsubject={Uber}}}\n\\begin{document}'));
  assert.ok(propertyEdits(d, { keywords: 'a, b' }).error.includes('\\keywords'));
});
ok('hyperref loaded, no \\hypersetup: a \\hypersetup line right after it; the options untouched', () => {
  const d = '\\documentclass{article}\n\\usepackage[colorlinks]{hyperref}\n\\usepackage{cleveref}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(d, { keywords: 'a, b' }), d.replace('{hyperref}\n', '{hyperref}\n\\hypersetup{pdfkeywords={a, b}}\n'));
});
ok('L5: a key in hyperref\'s options is changed and cleared there, with a \\hypersetup beside it', () => {
  const d = '\\documentclass{article}\n\\usepackage[pdfsubject={X}]{hyperref}\n\\hypersetup{colorlinks}\n\\begin{document}x\\end{document}\n';
  assert.equal(readProperties(d).value.subject, 'X');
  assert.equal(set(d, { subject: '' }), d.replace('[pdfsubject={X}]', ''));
  assert.equal(set(d, { subject: 'Y' }), d.replace('{X}', '{Y}'));
});
ok('L5: a \\hypersetup with comments is read as TeX reads it', () => {
  const d = '\\documentclass{article}\n\\usepackage{hyperref}\n\\hypersetup{%\n  pdfsubject={X}, % the subject\n  pdfkeywords=one}\n\\begin{document}x\\end{document}\n';
  assert.deepEqual([readProperties(d).value.subject, readProperties(d).value.keywords], ['X', 'one']);
});
ok('fieldEdits: CRLF kept in a text that gains a line', () => {
  assert.deepEqual(fieldEdits('a\r\nb', 'a\nnew\nb', '\r\n'), [{ s: 3, e: 3, t: 'new\r\n' }]);
});
ok('V1: two changes in one field leave the source between them as it was (a % comment, a tabular &)', () => {
  const a = '\\documentclass{article}\n\\author{Alice % office 3\n  \\and Bob}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(a, { author: 'Alicia % office 3\n  \\and Rob' }), a.replace('Alice', 'Alicia').replace('Bob', 'Rob'));
  const t = '\\documentclass{article}\n\\author{\\begin{tabular}{cc}\n Ann & Ben\\\\\n MIT & ETH\n\\end{tabular}}\n\\begin{document}x\\end{document}\n';
  const v = readProperties(t).value.author;
  assert.equal(set(t, { author: v.replace('Ann', 'Anna').replace('ETH', 'EPFL') }), t.replace('Ann', 'Anna').replace('ETH', 'EPFL'));
  // a typed & in one of two changes is escaped, the source's own stays: which & was typed is known
  // from the typing (the dialog's origin), where the text alone is ambiguous
  const nv = v.replace('Ann', 'Ann & Co').replace('ETH', 'EPFL');
  const at = nv.indexOf(' & Co'), e2 = nv.indexOf('EPFL'), eth = v.indexOf('ETH');
  const org = [...nv].map((_, k) => (k < at ? k : k < at + 5 ? -1 : k < e2 ? k - 5 : k < e2 + 4 ? -1 : eth + 3 + (k - e2 - 4)));
  const r = propertyEdits(t, { author: nv }, { origins: { author: org } });
  assert.equal(apply(t, r.edits), t.replace('Ann', 'Ann \\& Co').replace('ETH', 'EPFL'));
});
ok('V5: typed text escaped in its place: after a backslash, inside \\( \\) and \\[ \\]', () => {
  const d = '\\documentclass{article}\n\\title{R\\&D and \\(x\\)}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(d, { title: 'R\\#D and \\(x_1\\)' }), d.replace('R\\&D', 'R\\#D').replace('\\(x\\)', '\\(x_1\\)'));
  assert.deepEqual(contextAt('a \\[ x'), { math: true, esc: false });
  assert.deepEqual(contextAt('R\\'), { math: false, esc: true });
  assert.equal(escapeTyped('#', { esc: true }), '#');
});
ok('V6: hyperref loaded in \\AtEndPreamble: the keys as the document begins', () => {
  const h = '\\documentclass{article}\n\\AtEndPreamble{\\usepackage{hyperref}}\n\\begin{document}x\\end{document}\n';
  assert.equal(set(h, { subject: 'U' }), h.replace('\\begin{document}', '\\AtBeginDocument{\\hypersetup{pdfsubject={U}}}\n\\begin{document}'));
});
ok('V7: an unknown class gets hidelinks only where hyperref is new to the document', () => {
  const d = '\\documentclass{lipics-v2021}\n\\begin{document}x\\end{document}\n';
  const out = set(d, { subject: 'U' });
  assert.ok(out.includes('\\IfPackageLoadedTF{hyperref}{}{\\PassOptionsToPackage{hidelinks}{hyperref}}') && !/hypersetup\{hidelinks/.test(out), out);
});
console.log('file: ' + n + ' groups of checks passed');
