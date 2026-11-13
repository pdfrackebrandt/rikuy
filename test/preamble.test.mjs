// The preamble as edits (src/preamble.js): a package added once after the others, options merged
// into the line that loads it, the class's options, key=value lists of geometry, hyperref and
// enumitem, a definition written once; comments read as comments; a stranger's preamble read in
// bounded time. Every edit applied, then the same call again: nothing more to do.
import assert from 'node:assert/strict';
import { stripComments, preambleEnd, packages, hasPackage, packageOptions, parseKV, kvEdits, usePackage, usePackages, docClass, classOptions, setClass, lastCall, setPackageKeys, defines, defineOnce } from '../src/preamble.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const doc = (pre, body = 'Text.') => '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
// an edit applied, then the same call on the result changes nothing
const twice = (src, f) => { const a = applyEdits(src, f(src)); assert.deepEqual(f(a), [], 'a second time changes nothing'); return a; };

ok('comments: blanked with their offsets kept; \\% is no comment', () => {
  const t = 'a % b {c}\n\\% d % e\nf';
  const s = stripComments(t);
  assert.equal(s.length, t.length);
  assert.equal(s, 'a        \n\\% d    \nf');
});

ok('the preamble ends at the first \\begin{document} that no comment holds', () => {
  const src = '\\documentclass{article}\n% \\begin{document} in a note\n\\usepackage{x}\n\\begin{document}\nA\n\\end{document}';
  assert.equal(preambleEnd(src), src.indexOf('\\begin{document}\nA'));
  assert.equal(preambleEnd('no document here'), -1);
});

ok('packages: names, options, lists, RequirePackage, version dates; commented lines load nothing', () => {
  const src = doc('\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath, amssymb}\n%\\usepackage{hyperref}\n\\RequirePackage{xcolor}[2020/01/01]\n\\usepackage\n  [a4paper, margin = 2cm]\n  {geometry}\n');
  const ps = packages(src);
  assert.deepEqual(ps.map((p) => p.names.map((x) => x.name)), [['inputenc'], ['amsmath', 'amssymb'], ['xcolor'], ['geometry']]);
  assert.equal(hasPackage(src, 'hyperref'), false);
  assert.equal(hasPackage(src, 'amssymb'), true);
  assert.deepEqual(packageOptions(src, 'geometry'), { a4paper: true, margin: '2cm' });
  assert.deepEqual(packageOptions(src, 'amsmath'), {});
  assert.equal(packageOptions(src, 'graphicx'), null);
});

ok('a package goes in once, after the last \\usepackage line', () => {
  const src = doc('\\usepackage{amsmath}\n\\usepackage{hyperref} % links\n');
  const a = twice(src, (t) => usePackage(t, 'graphicx'));
  assert.equal(a, doc('\\usepackage{amsmath}\n\\usepackage{hyperref} % links\n\\usepackage{graphicx}\n'));
  // several at once: one edit, in the order asked
  const b = twice(src, (t) => usePackages(t, ['xcolor', 'amsmath', 'ulem']));
  assert.equal(b, doc('\\usepackage{amsmath}\n\\usepackage{hyperref} % links\n\\usepackage{xcolor}\n\\usepackage{ulem}\n'));
  assert.equal(usePackages(src, ['xcolor', 'ulem']).length, 1);
});

ok('with no \\usepackage, after the \\documentclass line (options over several lines too)', () => {
  assert.equal(twice(doc(''), (t) => usePackage(t, 'graphicx')), doc('\\usepackage{graphicx}\n'));
  const src = '\\documentclass[\n  11pt,\n  a4paper\n]{article} % mine\n\\title{T}\n\\begin{document}\nx\n\\end{document}\n';
  assert.equal(twice(src, (t) => usePackage(t, 'xcolor')), src.replace('% mine\n', '% mine\n\\usepackage{xcolor}\n'));
  // a comment that names \begin{document} is not the preamble's end
  const c = '\\documentclass{article}\n% was: \\begin{document} here\n\\usepackage{amsmath}\n\\begin{document}\nA.\n\\end{document}\n';
  assert.equal(twice(c, (t) => usePackage(t, 'graphicx')), c.replace('{amsmath}\n', '{amsmath}\n\\usepackage{graphicx}\n'));
  // no preamble (an \input file): nothing to add to
  assert.deepEqual(usePackage('Just a chapter.\n', 'graphicx'), []);
});

ok('options merged into the line that loads the package, a key replaced, a flag added once', () => {
  const src = doc('\\usepackage[a4paper]{geometry}\n');
  assert.equal(twice(src, (t) => usePackage(t, 'geometry', { margin: '2cm' })), doc('\\usepackage[a4paper,margin=2cm]{geometry}\n'));
  const m = doc('\\usepackage[margin=1in, a4paper]{geometry}\n');
  assert.equal(twice(m, (t) => usePackage(t, 'geometry', { margin: '2cm' })), doc('\\usepackage[margin=2cm, a4paper]{geometry}\n'));
  assert.equal(twice(doc('\\usepackage{ulem}\n'), (t) => usePackage(t, 'ulem', 'normalem')), doc('\\usepackage[normalem]{ulem}\n'));
  // a new package with options
  assert.equal(twice(doc(''), (t) => usePackage(t, 'hyperref', { hidelinks: true })), doc('\\usepackage[hidelinks]{hyperref}\n'));
  // a key taken out, and one that another replaces (letterpaper for a4paper)
  assert.equal(twice(m, (t) => usePackage(t, 'geometry', { margin: null })), doc('\\usepackage[a4paper]{geometry}\n'));
  assert.equal(twice(m, (t) => usePackages(t, { geometry: { letterpaper: true } }, { drop: (k) => /paper$/.test(k) && k !== 'letterpaper' })), doc('\\usepackage[margin=1in,letterpaper]{geometry}\n'));
});

ok('a line that loads several packages: their options are every one\'s, so \\PassOptionsToPackage goes before it', () => {
  const src = doc('\\usepackage{amsmath,ulem}\n');
  assert.equal(twice(src, (t) => usePackage(t, 'ulem', 'normalem')), doc('\\PassOptionsToPackage{normalem}{ulem}\n\\usepackage{amsmath,ulem}\n'));
});

ok('key=value lists: braces and brackets keep their commas', () => {
  const t = 'colback=yellow!10, title={A, B}, label=[x,y], draft';
  assert.deepEqual(parseKV(t).map((x) => [x.key, x.value]), [['colback', 'yellow!10'], ['title', '{A, B}'], ['label', '[x,y]'], ['draft', null]]);
  assert.equal(applyEdits(t, kvEdits(t, 0, t.length, { title: '{C}', draft: null, sharp: true })), 'colback=yellow!10, title={C}, label=[x,y],sharp');
  assert.deepEqual(kvEdits('', 0, 0, {}), []);
});

ok('geometry and hyperref keys: in \\geometry{} or \\hypersetup{} where the preamble has one, else the package line', () => {
  const g = doc('\\usepackage{geometry}\n\\geometry{a4paper}\n');
  assert.equal(twice(g, (t) => setPackageKeys(t, 'geometry', 'geometry', { margin: '2cm' })), doc('\\usepackage{geometry}\n\\geometry{a4paper,margin=2cm}\n'));
  const h = doc('\\usepackage{hyperref}\n');
  assert.equal(twice(h, (t) => setPackageKeys(t, 'hyperref', 'hypersetup', { hidelinks: true })), doc('\\usepackage[hidelinks]{hyperref}\n'));
  assert.equal(twice(doc(''), (t) => setPackageKeys(t, 'geometry', 'geometry', { margin: '2.54cm' })), doc('\\usepackage[margin=2.54cm]{geometry}\n'));
  assert.deepEqual(lastCall(doc('\\hypersetup{a}\n\\hypersetup{b}\n'), 'hypersetup').arg.length, 2);
});

ok('the class: its name and options; an option set, one replacing another of its kind, a class changed', () => {
  const src = '\\documentclass[11pt]{article}\n\\begin{document}\nx\n\\end{document}\n';
  assert.deepEqual(docClass(src).options, { '11pt': true });
  assert.equal(twice(src, (t) => classOptions(t, { twoside: true })), src.replace('[11pt]', '[11pt,twoside]'));
  assert.equal(twice(src, (t) => classOptions(t, { '12pt': true }, (k) => /^\d+pt$/.test(k))), src.replace('[11pt]', '[12pt]'));
  const bare = '\\documentclass{report}\n\\begin{document}\nx\n\\end{document}\n';
  assert.equal(twice(bare, (t) => classOptions(t, { a4paper: true })), bare.replace('{report}', '[a4paper]{report}'));
  assert.equal(twice(bare, (t) => setClass(t, 'book')), bare.replace('{report}', '{book}'));
});

ok('a definition written once, at the preamble\'s end; one the preamble has in any form is kept', () => {
  const hl = '\\newcommand{\\hl}[2][yellow]{\\colorbox{#1}{#2}}';
  const src = doc('\\usepackage{xcolor}\n');
  assert.equal(twice(src, (t) => defineOnce(t, 'hl', hl)), doc('\\usepackage{xcolor}\n' + hl + '\n'));
  for (const d of ['\\newcommand\\hl{x}', '\\def\\hl#1{#1}', '\\providecommand*{\\hl}{x}', '\\DeclareRobustCommand{\\hl}{x}', '\\NewDocumentCommand{\\hl}{m}{#1}', '\\let\\hl\\relax'])
    assert.deepEqual(defineOnce(doc(d + '\n'), 'hl', hl), [], d);
  // not \hlx, and not in a comment
  assert.equal(defines(doc('\\newcommand{\\hlx}{x}\n% \\newcommand{\\hl}{x}\n'), 'hl'), false);
  assert.equal(defines(doc('\\definecolor{accent}{HTML}{C00000}\n'), 'accent', 'color'), true);
  assert.equal(defines(doc('\\newtheorem{theorem}{Theorem}\n'), 'theorem', 'environment'), true);
  // \begin{document} with something before it on its line
  const glued = '\\documentclass{article}\\begin{document}x\\end{document}';
  assert.equal(applyEdits(glued, defineOnce(glued, 'x', '\\def\\x{}')), '\\documentclass{article}\n\\def\\x{}\n\\begin{document}x\\end{document}');
});

ok('a stranger\'s preamble: unclosed groups and a hundred thousand braces read in bounded time', () => {
  const t0 = Date.now();
  const bad = '\\documentclass{article}\n\\usepackage[' + '{'.repeat(100000) + '\n\\usepackage{x' + ' '.repeat(100000) + '\n\\begin{document}\n\\end{document}';
  packages(bad); usePackage(bad, 'graphicx'); defineOnce(bad, 'hl', '\\def\\hl{}'); docClass(bad); lastCall(bad, 'geometry');
  const many = '\\documentclass{article}\n' + '\\usepackage{a}\n'.repeat(20000) + '\\begin{document}\n\\end{document}';
  assert.equal(packages(many).length, 2000);
  assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + ' ms');
});

ok('a stranger\'s \\newcommand followed by thousands of spaces: whether it defines a name is read in linear time', () => {
  // (a first version matched with one pattern holding three runs of spaces: 2000 of them took
  // over a second and 8000 over a minute, at every edit that wrote a definition)
  const t0 = Date.now();
  for (const pre of ['\\newcommand' + ' '.repeat(90000) + '*' + ' '.repeat(90000) + 'x', '\\providecommand \t'.repeat(9000) + 'x', '\\definecolor' + ' '.repeat(90000) + '[' + 'x'.repeat(90000), '\\newcounter' + '{'.repeat(90000)]) {
    const src = doc(pre + '\n');
    assert.equal(defines(src, 'hl'), false);
    assert.equal(defines(src, 'accent', 'color'), false);
    assert.equal(defineOnce(src, 'hl', '\\def\\hl{}').length, 1);
  }
  assert.ok(Date.now() - t0 < 2000, 'took ' + (Date.now() - t0) + ' ms');
});

console.log('preamble: ' + n + ' groups of checks passed');
