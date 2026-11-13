// Character formatting as edits of the source (src/charfmt.js, the pure part of the Font group):
// each format on and off byte for byte, the hand written forms, the forms src/wrap.js leaves to
// it ({\color{red} ..}, {\fontsize{..}{..}\selectfont ..}, \scalebox{..}[..]{..}), sizes and
// the document's size, the document's font, the preamble's lines, Change Case, *bold* and
// _italic_ as typed, Clear All Formatting, the Format Painter's reading; and the page's model of
// what they write (src/model.js), and bounded time on a stranger's text.
import assert from 'assert/strict';
import * as F from '../src/charfmt.js';
import { buildModel } from '../src/model.js';

let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } };
const doc = (body, pre = '') => '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
const sel = (t, w, k = 0) => { let i = -1; for (let j = 0; j <= k; j++) i = t.indexOf(w, i + 1); return [i, i + w.length]; };
// a command's result on the words w of t, and that the result keeps the same words selected
function on(t, w, fn) { const [a, b] = sel(t, w); const r = fn(t, a, b); assert.ok(r && !r.error, JSON.stringify(r)); return r; }

ok('each toggle writes its command, takes it off byte for byte, and reads its hand written forms', () => {
  const t = 'Hello world here.';
  for (const [g, cmd] of [['bold', 'textbf'], ['italic', 'emph'], ['underline', 'uline'], ['strike', 'sout'], ['dstrike', 'dsout'], ['sub', 'textsubscript'], ['sup', 'textsuperscript'],
    ['smallcaps', 'textsc'], ['allcaps', 'MakeUppercase'], ['border', 'fbox'], ['enclose', 'textcircled']]) {
    const r = on(t, 'world', (x, a, b) => F.toggle(x, a, b, g));
    assert.equal(r.text, 'Hello \\' + cmd + '{world} here.', g);
    assert.equal(r.text.slice(r.a, r.b), 'world');
    const back = F.toggle(r.text, r.a, r.b, g);
    assert.equal(back.text, t, g + ' off');
    // at a caret: the empty wrapper, the caret between its braces
    const c = F.toggle(t, 6, 6, g);
    assert.equal(c.text, 'Hello \\' + cmd + '{}world here.');
    assert.equal(c.a, 6 + cmd.length + 2);
  }
  // hand written forms come off exactly
  for (const [g, form] of [['bold', '\\textbf{world}'], ['bold', '{\\bfseries world}'], ['italic', '\\textit{world}'], ['italic', '{\\itshape world}'], ['underline', '\\underline{world}'],
    ['underline', '\\uuline{world}'], ['underline', '\\uwave{world}'], ['strike', '\\xout{world}'], ['smallcaps', '{\\scshape world}'], ['allcaps', '\\uppercase{world}']]) {
    const x = 'Hello ' + form + ' here.';
    const [a, b] = sel(x, 'world');
    assert.ok(F.around(x, a, b, g), g + ' reads ' + form);
    assert.equal(F.toggle(x, a, b, g).text, 'Hello world here.', form);
  }
});

ok('bold over words with bold inside makes one wrapper, \\emph in \\emph is not written', () => {
  const t = 'a \\textbf{b} c and \\emph{d} e';
  const [a] = sel(t, 'a'), [, b] = sel(t, 'c');
  assert.equal(F.toggle(t, a, b, 'bold').text, '\\textbf{a b c} and \\emph{d} e');
  const [a2] = sel(t, 'and');
  assert.equal(F.toggle(t, a2, t.length, 'italic').text, 'a \\textbf{b} c \\emph{and d e}');
});

ok('Subscript and Superscript exclude each other: one becomes the other in place', () => {
  const t = 'H\\textsubscript{2}O';
  const [a, b] = sel(t, '2');
  const r = F.toggle(t, a, b, 'sup', { other: 'sub' });
  assert.equal(r.text, 'H\\textsuperscript{2}O');
  assert.equal(r.text.slice(r.a, r.b), '2');
  assert.equal(F.toggle(r.text, r.a, r.b, 'sub', { other: 'sup' }).text, t);
});

ok('values: a colour, an underline\'s style, a highlight, a shading, given, changed, taken off', () => {
  const t = 'Some red words.';
  const red = on(t, 'red', (x, a, b) => F.setValue(x, a, b, 'color', { cmd: 'textcolor', args: ['red'] }));
  assert.equal(red.text, 'Some \\textcolor{red}{red} words.');
  const blue = F.setValue(red.text, red.a, red.b, 'color', { cmd: 'textcolor', opt: 'HTML', args: ['0070C0'] });
  assert.equal(blue.text, 'Some \\textcolor[HTML]{0070C0}{red} words.');
  assert.equal(F.setValue(blue.text, blue.a, blue.b, 'color', null).text, t);
  // a colour inside the selection goes, the new one is the only one
  const mixed = 'a \\textcolor{red}{b} c';
  assert.equal(F.setValue(mixed, 0, mixed.length, 'color', { cmd: 'textcolor', args: ['blue'] }).text, '\\textcolor{blue}{a b c}');
  // the hand written declaration keeps its form
  const decl = 'A {\\color{red} words here} b';
  const [a, b] = sel(decl, 'words here');
  const w = { cmd: 'textcolor', args: ['blue'], declAlt: { cmd: 'color', args: ['blue'], decl: true } };
  assert.equal(F.setValue(decl, a, b, 'color', w).text, 'A {\\color{blue} words here} b');
  assert.equal(F.setValue(decl, a, b, 'color', null).text, 'A words here b');
  // an underline's style: \uline to \uuline and back, and \underline written by hand too
  const u = on('x \\uline{yy} z', 'yy', (x, a2, b2) => F.setValue(x, a2, b2, 'underline', { cmd: 'uuline' }));
  assert.equal(u.text, 'x \\uuline{yy} z');
  assert.equal(on('x \\underline{yy} z', 'yy', (x, a2, b2) => F.setValue(x, a2, b2, 'underline', { cmd: 'uwave' })).text, 'x \\uwave{yy} z');
  assert.equal(on('x \\uline{yy} z', 'yy', (x, a2, b2) => F.setValue(x, a2, b2, 'underline', { cmd: 'culine', args: ['red'] })).text, 'x \\culine{red}{yy} z');
  // the highlighter: yellow as Word import writes it, another colour as its option
  const h = on(t, 'red', (x, a2, b2) => F.setValue(x, a2, b2, 'highlight', { cmd: 'hl', opt: null }));
  assert.equal(h.text, 'Some \\hl{red} words.');
  const g = F.setValue(h.text, h.a, h.b, 'highlight', { cmd: 'hl', opt: 'green' });
  assert.equal(g.text, 'Some \\hl[green]{red} words.');
  assert.equal(F.setValue(g.text, g.a, g.b, 'highlight', null).text, t);
  assert.equal(on(t, 'red', (x, a2, b2) => F.setValue(x, a2, b2, 'shading', { cmd: 'colorbox', args: ['lightgray'] })).text, 'Some \\colorbox{lightgray}{red} words.');
});

ok('sizes: a name at its points, any other as \\fontsize; hand written {\\large ..} changed and taken off', () => {
  assert.deepEqual(F.sizeWrapper(10, 12), { cmd: 'large', decl: true });
  assert.deepEqual(F.sizeWrapper(11, 10.95), { cmd: 'normalsize', decl: true });
  assert.deepEqual(F.sizeWrapper(10, 13), { cmd: 'fontsize', args: ['13', '15.6'], decl: true, select: true });
  assert.equal(F.sizePoints(12, 'large'), 14.4);
  assert.equal(F.sizePoints(14, 'normalsize'), 14.4);
  assert.equal(F.sizeNamed(12, 24.88), 'huge');
  assert.equal(F.stepSize('normalsize', 1), 'large');
  assert.equal(F.stepSize('small', 1), 'normalsize');
  assert.equal(F.stepSize('Huge', 1), null);
  assert.equal(F.stepSize('tiny', -1), null);
  assert.equal(F.nearestSize(10, 13), 'large');
  const t = 'Some big words.';
  const r = on(t, 'big', (x, a, b) => F.setValue(x, a, b, 'size', F.sizeWrapper(10, 14.4)));
  assert.equal(r.text, 'Some {\\Large big} words.');
  const r2 = F.setValue(r.text, r.a, r.b, 'size', F.sizeWrapper(10, 13));
  assert.equal(r2.text, 'Some {\\fontsize{13}{15.6}\\selectfont big} words.');
  assert.equal(F.sizeOf(10, F.around(r2.text, r2.a, r2.b, 'size')), 13);
  assert.equal(F.setValue(r2.text, r2.a, r2.b, 'size', null).text, t);
  // by hand, with a line break and spaces
  const hand = 'x {\\fontsize{20}{24}\\selectfont\n  big} y';
  const [a, b] = sel(hand, 'big');
  assert.equal(F.sizeOf(10, F.around(hand, a, b, 'size')), 20);
  assert.equal(F.setValue(hand, a, b, 'size', null).text, 'x big y');
});

ok('extra forms: a declaration that is an argument keeps its braces, a command after a control word keeps a space', () => {
  // {\color{blue} w} as \textcolor's text: only the declaration goes
  const t = 'x \\textcolor{red}{\\color{blue} w} y';
  const [a] = sel(t, 'w}');
  assert.equal(F.setValue(t, a, a + 1, 'color', null).text, 'x \\textcolor{red}{w} y');
  // its braces stay where a declaration inside would leak out
  assert.equal(F.clearFormats('x {\\color{red} a \\bf b} y', 2, 24).text, 'x {a \\bf b} y');
  // \scalebox{..}[..]{..} read whole; no \noindentWide
  const s = 'A \\noindent\\scalebox{1.2}[1]{Wide} b';
  const [p] = sel(s, 'Wide');
  const W = F.around(s, p, p, 'scale');
  assert.equal(W.opt2, '1');
  assert.equal(F.setValue(s, p, p + 4, 'scale', null).text, 'A \\noindent Wide b');
  assert.equal(F.openerAny({ cmd: 'scalebox', args: ['1.5'], opt2: '1' }), '\\scalebox{1.5}[1]{');
  assert.equal(F.openerAny({ cmd: 'fontfamily', args: ['ppl'], decl: true, select: true }), '{\\fontfamily{ppl}\\selectfont ');
  // braces in a comment are not counted
  const c = '\\footnote{\n%\\textcolor{red}{\nSome note words.\n%}\n}';
  const [q] = sel(c, 'note');
  assert.equal(F.around(c, q, q, 'color'), null);
});

ok('Clear All Formatting: inside and around the selection, a caret\'s wrappers whole, the alignment of its paragraph', () => {
  const t = 'A \\textbf{b \\emph{c} d} e';
  assert.equal(F.clearFormats(t, 2, t.length - 2).text, 'A b c d e');
  const [a, b] = sel(t, 'c');
  const r = F.clearFormats(t, a, b);
  assert.equal(r.text, 'A \\textbf{b }c\\textbf{ d} e');
  assert.equal(r.text.slice(r.a, r.b), 'c');
  const kt = 'x \\textcolor{red}{\\textbf{ab}} y', [kp] = sel(kt, 'ab');
  const k = F.clearFormats(kt, kp + 1, kp + 1);
  assert.equal(k.text, 'x ab y');
  assert.equal(F.clearFormats('plain text', 0, 5), null);
  // a wrapper around one end of the selection only: off the part the selection has
  const part = 'A {\\large one two} three';
  const pr = F.clearFormats(part, part.indexOf('two'), part.length);
  assert.equal(pr.text, 'A {\\large one }two three');
  assert.equal(pr.text.slice(pr.a, pr.b), 'two three');
  const nest = 'x\n\nSome \\textbf{bold \\textcolor{red}{red}} words {\\large big}.';
  assert.equal(F.clearFormats(nest, nest.indexOf('Some'), nest.indexOf('big') + 3).text, 'x\n\nSome bold red words big.');
  // a sentence starts after an environment's \begin and a full stop
  assert.equal(F.changeCase('\\begin{document}\nHELLO \\textbf{WORLD} AGAIN. NOW', 17, 49, 'sentence').text, '\\begin{document}\nHello \\textbf{world} again. Now');
  const cen = 'x\n\n\\begin{center}\nHello world\n\\end{center}\n\ny';
  const [p] = sel(cen, 'world');
  assert.equal(F.clearAlignment(cen, p, p + 5).text, 'x\n\nHello world\n\ny');
  // not an environment of several paragraphs
  assert.equal(F.clearAlignment('\\begin{center}\nA\n\nB\n\\end{center}', 15, 16), null);
});

ok('the Format Painter reads the formats around the caret, outermost first, and writes them again', () => {
  const t = 'x \\textcolor{red}{\\textbf{ab}} y plain';
  const [a] = sel(t, 'ab');
  const f = F.formatsAt(t, a, a);
  assert.deepEqual(f.map((x) => x.group), ['color', 'bold']);
  let s = { text: t, ...(() => { const [p, q] = sel(t, 'plain'); return { a: p, b: q }; })() };
  for (const x of f) s = F.wrapIn(s.text, s.a, s.b, x.group, x.w);
  assert.equal(s.text, 'x \\textcolor{red}{\\textbf{ab}} y \\textcolor{red}{\\textbf{plain}}');
  assert.deepEqual(F.formatsAt('{\\large\\bfseries x}', 9, 9).map((x) => x.group), ['size']);
});

ok('the document\'s size: the class\'s option, extsizes for 8, 9, 14, 17, 20pt, KOMA\'s fontsize, 10pt back to none', () => {
  const art = '\\documentclass{article}\n\\begin{document}x\\end{document}';
  const app = (t, e) => { let s = t; for (const x of [...e].sort((p, q) => q.s - p.s)) s = s.slice(0, x.s) + x.t + s.slice(x.e); return s; };
  const s11 = app(art, F.docSizeEdits(art, 11));
  assert.ok(s11.startsWith('\\documentclass[11pt]{article}'));
  assert.equal(app(s11, F.docSizeEdits(s11, 10)), art);
  const s14 = app(art, F.docSizeEdits(art, 14));
  assert.ok(s14.startsWith('\\documentclass[14pt]{extarticle}'));
  assert.equal(F.docSize(s14), 14);
  assert.ok(app(s14, F.docSizeEdits(s14, 12)).startsWith('\\documentclass[12pt]{extarticle}'));
  const many = '\\documentclass[a4paper,11pt,twoside]{report}\n\\begin{document}x\\end{document}';
  assert.ok(app(many, F.docSizeEdits(many, 12)).startsWith('\\documentclass[a4paper,twoside,12pt]{report}') || app(many, F.docSizeEdits(many, 12)).startsWith('\\documentclass[a4paper,12pt,twoside]{report}'));
  assert.ok(app(many, F.docSizeEdits(many, 10)).startsWith('\\documentclass[a4paper,twoside]{report}'));
  const koma = '\\documentclass{scrartcl}\n\\begin{document}x\\end{document}';
  assert.ok(app(koma, F.docSizeEdits(koma, 13)).startsWith('\\documentclass[fontsize=13pt]{scrartcl}'));
  assert.equal(F.docSizeEdits('\\documentclass{revtex4-2}\n\\begin{document}x\\end{document}', 12), null);
  assert.equal(F.docSizeEdits(art, 13), null);
  assert.deepEqual(F.docSizes('extbook'), [8, 9, 10, 11, 12, 14, 17, 20]);
});

ok('the document\'s font: its package lines in the place of the one before, Helvetica with \\familydefault, fontspec\'s \\setmainfont', () => {
  const app = (t, e) => { let s = t; for (const x of [...e].sort((p, q) => q.s - p.s)) s = s.slice(0, x.s) + x.t + s.slice(x.e); return s; };
  const t = doc('x', '\\usepackage{amsmath}\n');
  assert.equal(F.docFont(t).id, 'cm');
  const times = app(t, F.docFontEdits(t, 'times'));
  assert.ok(times.includes('\\usepackage{amsmath}\n\\usepackage{newtxtext,newtxmath}\n'));
  assert.equal(F.docFont(times).id, 'times');
  const helv = app(times, F.docFontEdits(times, 'helvetica'));
  assert.ok(helv.includes('\\usepackage{amsmath}\n\\usepackage{tgheros}\n\\renewcommand{\\familydefault}{\\sfdefault}\n') && !helv.includes('newtx'), helv);
  assert.equal(F.docFont(helv).id, 'helvetica');
  const pal = app(helv, F.docFontEdits(helv, 'palatino'));
  assert.ok(!pal.includes('familydefault') && pal.includes('\\usepackage{newpxtext,newpxmath}\n'), pal);
  assert.equal(app(pal, F.docFontEdits(pal, 'cm')), t);
  // a font among other packages on one line: only its name goes
  const mixed = doc('x', '\\usepackage{amsmath,mathptmx,graphicx}\n');
  assert.ok(app(mixed, F.docFontEdits(mixed, 'charter')).includes('\\usepackage{amsmath,graphicx}\n\\usepackage{XCharter}\n'));
  // fontspec: the main font by name, fontspec added once
  const xe = '% !TeX program = xelatex\n' + doc('x');
  const xt = app(xe, F.docFontEdits(xe, 'times'));
  assert.ok(xt.includes('\\usepackage{fontspec}\n\\setmainfont{TeX Gyre Termes}\n'), xt);
  assert.equal(F.docFont(xt).id, 'times');
  assert.ok(app(xt, F.docFontEdits(xt, 'palatino')).includes('\\setmainfont{TeX Gyre Pagella}'));
  assert.equal(F.docFontEdits(xe, 'kp'), null);
  assert.equal(F.usesFontspec(doc('x', '\\usepackage{fontspec}\n')), true);
  assert.equal(F.usesFontspec(doc('x'), 'lualatex'), true);
  // a selection's family
  assert.deepEqual(F.familyWrapper('sans'), { cmd: 'textsf' });
  assert.deepEqual(F.familyWrapper('palatino', false), { cmd: 'fontfamily', args: ['ppl'], decl: true, select: true });
  assert.deepEqual(F.familyWrapper('palatino', true), { cmd: 'fontspec', args: ['TeX Gyre Pagella'], decl: true });
  assert.equal(F.familyOf({ cmd: 'fontfamily', args: ['ppl'] }), 'palatino');
});

ok('the preamble: each package once with its options merged, definitions once, dvipsnames where xcolor will get it', () => {
  const app = (t, e) => { let s = t; for (const x of [...e].sort((p, q) => q.s - p.s)) s = s.slice(0, x.s) + x.t + s.slice(x.e); return s; };
  const t = doc('x', '\\usepackage{amsmath}\n');
  const needs = [F.needsOf('underline', { cmd: 'uline' }), F.needsOf('highlight', { cmd: 'hl', opt: 'green' }), F.needsOf('color', { cmd: 'textcolor', args: ['BrickRed'] }), F.needsOf('dstrike', { cmd: 'dsout' })];
  const once = app(t, F.preambleFor(t, needs));
  assert.ok(once.includes('\\usepackage{amsmath}\n\\usepackage[normalem]{ulem}\n\\usepackage[dvipsnames]{xcolor}\n' + F.DEFS.hl + '\n' + F.DEFS.dsout + '\n\\begin{document}'), once);
  assert.deepEqual(F.preambleFor(once, needs), []);
  // options merged into a line that loads the package
  const has = doc('x', '\\usepackage{xcolor}\n\\usepackage{ulem}\n');
  const merged = app(has, F.preambleFor(has, needs.slice(0, 3)));
  assert.ok(merged.includes('\\usepackage[dvipsnames]{xcolor}\n\\usepackage[normalem]{ulem}\n'), merged);
  // tikz loads xcolor before: the option reaches it first
  const tk = doc('x', '\\usepackage{tikz}\n');
  const tz = app(tk, F.preambleFor(tk, [F.needsOf('color', { cmd: 'textcolor', args: ['BrickRed'] })]));
  assert.ok(tz.includes('\\PassOptionsToPackage{dvipsnames}{xcolor}\n\\usepackage{tikz}\n') && !tz.includes('\\usepackage[dvipsnames]{xcolor}'), tz);
  // beamer: the class's option
  const bm = '\\documentclass{beamer}\n\\begin{document}x\\end{document}';
  assert.ok(app(bm, F.preambleFor(bm, [F.needsOf('color', { cmd: 'textcolor', args: ['BrickRed'] })])).startsWith('\\documentclass[xcolor=dvipsnames]{beamer}'));
  // Word import's highlighter of before takes a colour in place
  const old = doc('\\hl{x}', '\\usepackage{xcolor}\n\\usepackage[normalem]{ulem}\n\\DeclareRobustCommand{\\hl}{\\bgroup\\markoverwith{\\textcolor{yellow}{\\rule[-.5ex]{2pt}{2.5ex}}}\\ULon}\n');
  const up = app(old, F.preambleFor(old, [F.needsOf('highlight', { cmd: 'hl', opt: 'green' })]));
  assert.ok(up.includes(F.DEFS.hl) && up.split('DeclareRobustCommand').length === 2, up);
  assert.equal(F.hlTakesColor(old), true);
  assert.equal(F.hlTakesColor(doc('x', '\\newcommand{\\hl}[1]{#1}\n')), false);
  // a file without a preamble gets none
  assert.deepEqual(F.preambleFor('Just a chapter.', needs), []);
});

ok('Change Case: the letters only; commands, keys, math and comments keep theirs', () => {
  const t = 'Hello \\textbf{world} $x+y$ \\cite{Key} \\ref{sec:A} the end % a Comment\nnext';
  const up = F.changeCase(t, 0, t.indexOf('% a'), 'upper').text;
  assert.equal(up, 'HELLO \\textbf{WORLD} $x+y$ \\cite{Key} \\ref{sec:A} THE END % a Comment\nnext');
  assert.equal(F.changeCase('hello \\textbf{world} again. now this', 0, 37, 'sentence').text, 'Hello \\textbf{world} again. Now this');
  assert.equal(F.changeCase('hello \\textbf{world} again', 0, 26, 'title').text, 'Hello \\textbf{World} Again');
  assert.equal(F.changeCase('Hello World', 0, 11, 'toggle').text, 'hELLO wORLD');
  // Shift+F3: lower, then each word capitalised, then upper, then lower
  let s = 'some words';
  s = F.changeCase(s, 0, 10, 'cycle').text; assert.equal(s, 'Some Words');
  s = F.changeCase(s, 0, 10, 'cycle').text; assert.equal(s, 'SOME WORDS');
  s = F.changeCase(s, 0, 10, 'cycle').text; assert.equal(s, 'some words');
  // the colour's name and \href's address keep theirs, \href's words change
  const hr = '\\textcolor{red}{a} \\href{http://x.org/Ab}{link}';
  assert.equal(F.changeCase(hr, 0, hr.length, 'upper').text, '\\textcolor{red}{A} \\href{http://x.org/Ab}{LINK}');
  // letters written as commands, and ß that would grow
  assert.equal(F.changeCase('stra\\ss e \\o l', 0, 14, 'upper').text, 'STRA\\SS E \\O L');
  assert.equal(F.changeCase('straße', 0, 6, 'upper').text, 'STRAßE');
  assert.equal(F.changeCase('ABC', 0, 3, 'upper'), null);
  assert.deepEqual(F.wordAt('one two three', 5), [4, 7]);
  assert.equal(F.wordAt('\\textbf', 3), null);
});

ok('*bold* and _italic_ as they are typed: the words between the marks, at a word\'s start only', () => {
  assert.deepEqual(F.autoFormat('Some *bold words', 16, '*'), { s: 5, e: 16, t: '\\textbf{bold words}', p: 24 });
  assert.deepEqual(F.autoFormat('Some \\_it', 9, '_'), { s: 5, e: 9, t: '\\emph{it}', p: 14 });
  assert.equal(F.autoFormat('a*b', 3, '*'), null);
  assert.equal(F.autoFormat('x * y', 5, '*'), null);
  assert.equal(F.autoFormat('*bold ', 6, '*'), null);
  assert.equal(F.autoFormat('* bold', 6, '*'), null);
  assert.equal(F.autoFormat('*a\nb', 4, '*'), null);
  assert.equal(F.autoFormat('*$x$', 4, '*'), null);
  assert.equal(F.autoFormat('\\\\_it', 5, '_'), null);
});

ok('the page\'s model draws what the Font group writes', () => {
  const m = buildModel({ files: new Map([['a.tex', '\\documentclass[14pt]{extarticle}\n\\usepackage{XCharter}\n\\begin{document}\nA {\\fontsize{13}{15.6}\\selectfont big} \\hl[green]{x} \\textcolor{BrickRed}{r} \\ruby{base}{read} \\raisebox{2pt}{up} \\uuline{d} \\dsout{s} {\\fontfamily{ppl}\\selectfont p} \\textls[80]{t}\n\\end{document}']]), main: 'a.tex' });
  assert.equal(m.opts.pt, 14);
  assert.equal(m.opts.ext.fs, 14.4);
  assert.equal(m.opts.font, 'charter');
  const sty = [];
  const walk = (xs) => { for (const x of xs || []) { if (x.k === 'sty') sty.push(x); walk(x.kids); } };
  for (const B of m.blocks) for (const it of B.items) walk(it.inl);
  const by = (st) => sty.find((x) => x.st === st);
  assert.equal(by('fs').fs, 13);
  assert.equal(by('hl').color, '#00FF00');
  assert.equal(by('color').color, '#B6321C');
  assert.equal(by('ruby').title, 'read');
  assert.equal(by('raise').raise, 2);
  assert.ok(by('ul2') && by('so2') && by('ff-palatino'));
  assert.equal(by('ls').ls, 80);
  // Helvetica as the sans serif alone leaves the text in its serif; \familydefault makes it sans
  const h = (pre) => buildModel({ files: new Map([['a.tex', '\\documentclass{article}\n' + pre + '\\begin{document}\nx\n\\end{document}']]), main: 'a.tex' }).opts.font;
  assert.equal(h('\\usepackage{helvet}\n'), undefined);
  assert.equal(h('\\usepackage{helvet}\n\\renewcommand{\\familydefault}{\\sfdefault}\n'), 'sans');
  assert.equal(h('\\usepackage{fontspec}\n\\setmainfont{TeX Gyre Pagella}\n'), 'palatino');
  // an option the class does not take is no size (article in 14pt is 10pt)
  assert.equal(buildModel({ files: new Map([['a.tex', '\\documentclass[14pt]{article}\n\\begin{document}\nx\n\\end{document}']]), main: 'a.tex' }).opts.pt, 10);
});

ok('a stranger\'s names are only names: \\setmainfont{constructor}, \\fontfamily{__proto__}, \\hl[toString]', () => {
  const m = buildModel({ files: new Map([['a.tex', '\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{constructor}\n\\begin{document}\n{\\fontfamily{__proto__}\\selectfont x} \\hl[toString]{y} \\textcolor{hasOwnProperty}{z}\n\\end{document}']]), main: 'a.tex' });
  assert.equal(m.opts.font, '');
  const sty = [];
  const walk = (xs) => { for (const x of xs || []) { if (x.k === 'sty') sty.push(x); walk(x.kids); } };
  for (const B of m.blocks) for (const it of B.items) walk(it.inl);
  assert.ok(sty.every((x) => typeof x.st === 'string' && /^[a-z0-9-]+$/.test(x.st) && (x.color == null || typeof x.color === 'string')), JSON.stringify(sty.map((x) => [x.st, x.color])));
  assert.equal(F.familyOf({ cmd: 'fontfamily', args: ['constructor'] }), null);
});

ok('a stranger\'s text costs little: unbalanced braces, long runs, many marks', () => {
  const big = '{'.repeat(60000) + 'x' + '\\color{red}'.repeat(5000);
  let t0 = performance.now();
  F.around(big, 60000, 60000, 'color'); F.around(big, 60000, 60000, 'size'); F.around(big, 60000, 60001, 'bold');
  F.formatsAt(big, 60000, 60000);
  assert.ok(performance.now() - t0 < 1500, 'around: ' + (performance.now() - t0));
  t0 = performance.now();
  F.changeCase('a'.repeat(300000), 0, 300000, 'upper');
  F.changeCase('\\cite{'.repeat(50000), 0, 300000, 'upper');
  F.autoFormat('*' + ' '.repeat(100000) + 'x', 100002, '*');
  F.clearFormats('{\\bf '.repeat(20000), 100, 200);
  assert.ok(performance.now() - t0 < 3000, 'others: ' + (performance.now() - t0));
  // patterns that once backtracked: spaces after \\renewcommand, an option list without its brace
  t0 = performance.now();
  const sp = '\\documentclass{article}\n\\renewcommand' + ' '.repeat(60000) + 'x\n\\PassOptionsToPackage{' + 'dvipsnames '.repeat(15000) + '\n\\usepackage{tikz}\n\\begin{document}x\\end{document}';
  F.docFont(sp); F.docFontEdits(sp, 'times'); F.preambleFor(sp, [F.needsOf('color', { cmd: 'textcolor', args: ['BrickRed'] })]);
  assert.ok(performance.now() - t0 < 1500, 'patterns: ' + (performance.now() - t0));
  // a selection over a stranger's thousands of unclosed declarations
  t0 = performance.now();
  const decls = '{\\color{'.repeat(40000);
  F.clearFormats(decls, 0, decls.length); F.toggle(decls, 0, decls.length, 'bold');
  assert.ok(performance.now() - t0 < 2000, 'selection: ' + (performance.now() - t0));
  t0 = performance.now();
  const pre = '\\documentclass{article}\n' + '\\usepackage{x}\n'.repeat(3000) + '\\begin{document}x\\end{document}';
  F.docFont(pre); F.docFontEdits(pre, 'times'); F.preambleFor(pre, [F.needsOf('highlight', { cmd: 'hl' })]); F.usesFontspec(pre);
  assert.ok(performance.now() - t0 < 3000, 'preamble: ' + (performance.now() - t0));
});

console.log('font: ' + n + ' groups of checks passed');
