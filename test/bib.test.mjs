// Batch B9's edits on strings: a .bib entry written and read back (src/bib.js), a hand written
// entry changed field by field with every other byte kept, and the References tab's preamble and
// body edits (src/refsrc.js): contents' depth, footnote numbering, the citation style per system,
// the bibliography's title, makeindex's entries and page lists.
import { parseBib, bibSpans, bibEntryText, bibFieldEdits, bibDeleteEdit, bibAppendEdit, bibEscape, bibKey, texToPlain } from '../src/bib.js';
import * as R from '../src/refsrc.js';
import { buildModel } from '../src/model.js';

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)); } };
const ap = (t, ed) => { for (const x of [...ed].sort((a, b) => b.s - a.s || b.e - a.e)) t = t.slice(0, x.s) + x.t + t.slice(x.e); return t; };

// ---- an entry written, then read back
{
  const fields = { author: bibEscape('Knuth, Donald E.'), title: bibEscape('The TeXbook & more: 100% #1 a_b'), year: '1984', publisher: bibEscape('Addison-Wesley') };
  const key = bibKey(fields, new Set());
  const t = bibEntryText('book', key, fields);
  check('the key is author, year, the title\'s first word', key === 'knuth1984texbook', key);
  const e = parseBib(t, 'refs.bib').get(key);
  check('an entry written is read back: its type and key', e && e.type === 'book' && e.key === key, t);
  check('and every field as written', e && e.fields.title === 'The TeXbook \\& more: 100\\% \\#1 a\\_b' && e.fields.year === '1984' && e.fields.author === 'Knuth, Donald E.', e && e.fields);
  check('and the plain words TeX prints', e && texToPlain(e.fields.title) === 'The TeXbook & more: 100% #1 a_b', e && texToPlain(e.fields.title));
  check('a year bare, the = signs in a column', /\n {2}year {6}= 1984,\n/.test(t) && /\n {2}author {4}= \{Knuth/.test(t), t);
  check('a taken key gets b', bibKey(fields, new Set([key])) === key + 'b');
  check('nothing to change: no edit', bibFieldEdits(t, e, { title: e.fields.title, year: '1984' }).length === 0);
  check('escaping is idempotent and leaves LaTeX alone', bibEscape('\\& {\\"o} $x_1$') === '\\& {\\"o} $x\\_1$' && bibEscape(bibEscape('a & b')) === 'a \\& b', bibEscape('\\& {\\"o} $x_1$'));
  check('unbalanced braces are escaped, a lone backslash at the end too', bibEscape('a } b {') === 'a \\} b \\{' && bibEscape('x\\') === 'x\\textbackslash{}');
}

// ---- a hand written entry changed where it stands
{
  const hand = '% my library\n@Article{Lamport:94,\n\tAuthor = "Leslie Lamport",\n\tTitle  = {{\\LaTeX}: A Document Preparation System},\n\tYear   = 1994,\n\tMonth  = jan # "~5",\n\tNote   = {keep me}\n}\n\n@book{other, title={Other}}\n';
  const e = parseBib(hand, 'lib.bib').get('Lamport:94');
  const sp = bibSpans(hand, e);
  check('its fields read with their places', sp && sp.fields.map((f) => f.name).join() === 'author,title,year,month,note' && sp.fields[0].q === '"' && sp.fields[2].q === '' && sp.fields[3].q === '', sp && sp.fields.map((f) => [f.name, f.q]));
  let t = ap(hand, bibFieldEdits(hand, e, { title: '{\\LaTeX}: A Document Preparation System, 2nd ed.' }));
  check('one field changed: only its words move, its braces and the rest kept byte for byte', t === hand.replace('System},', 'System, 2nd ed.},'), t);
  t = ap(hand, bibFieldEdits(hand, e, { author: 'Leslie B. Lamport' }));
  check('a quoted field stays quoted', t === hand.replace('"Leslie Lamport"', '"Leslie B. Lamport"'), t);
  t = ap(hand, bibFieldEdits(hand, e, { pages: '1--20' }));
  check('a new field after the last, with the entry\'s tab, padding and no trailing comma', t === hand.replace('{keep me}\n}', '{keep me},\n\tpages  = {1--20}\n}'), t);
  t = ap(hand, bibFieldEdits(hand, e, { note: '' }));
  check('a field taken out with its line, and the comma before it when it was the last', t === hand.replace(',\n\tNote   = {keep me}\n', '\n'), t);
  t = ap(hand, bibFieldEdits(hand, e, { year: '1995', month: 'feb' }));
  check('a bare number stays bare; a month abbreviation too', t === hand.replace('= 1994', '= 1995').replace('jan # "~5"', 'feb'), t);
  t = ap(hand, bibFieldEdits(hand, e, { '@type': 'book' }));
  check('the type changed alone', t === hand.replace('@Article{', '@book{'), t);
  const crlf = hand.replace(/\n/g, '\r\n'), e2 = parseBib(crlf, 'x').get('Lamport:94');
  t = ap(crlf, bibFieldEdits(crlf, e2, { pages: '3' }));
  check('a CRLF file keeps its line ends', t.includes('{keep me},\r\n\tpages  = 3\r\n}') && !/[^\r]\n/.test(t), JSON.stringify(t.slice(150, 260)));
  const o = parseBib(hand, 'lib.bib').get('other');
  t = ap(hand, bibFieldEdits(hand, o, { year: '2001' }));
  check('an entry on one line gets its field on that line', t.endsWith('@book{other, title={Other}, year=2001}\n'), t.slice(-60));
  t = ap(hand, [bibDeleteEdit(hand, e)]);
  check('an entry deleted with its blank line, the comment before it kept', t === '% my library\n@book{other, title={Other}}\n', t);
  t = ap(hand, [bibAppendEdit(hand, '@misc{n,\n  title = {N}\n}\n')]);
  check('an entry added at the end after one blank line', t === hand + '\n' + '@misc{n,\n  title = {N}\n}\n', t.slice(-60));
  check('a stranger\'s .bib of 20 000 unclosed entries reads in time', (() => { const big = '@article{a,'.repeat(20000); const t0 = Date.now(); parseBib(big, 'x'); return Date.now() - t0 < 2000; })());
}

// ---- refsrc: the preamble's and the body's edits
{
  const D = '\\documentclass{article}\n\\usepackage{natbib}\n\\begin{document}\nFirst.\n\n\\tableofcontents\n\nSecond.\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n\\end{document}\n';
  const c = R.bodyCalls(D, ['tableofcontents'])[0], [a, b] = R.lineSpan(D, c.s, c.e);
  check('a command\'s line taken out with one of the blank lines around it', ap(D, [{ s: a, e: b, t: '' }]) === D.replace('\\tableofcontents\n\n', ''));
  const d2 = ap(D, R.setCounterEdits(D, 'tocdepth', 2));
  check('tocdepth written once before \\begin{document}', d2 === D.replace('\\begin{document}', '\\setcounter{tocdepth}{2}\n\\begin{document}'));
  check('changed in place', ap(d2, R.setCounterEdits(d2, 'tocdepth', 1)) === d2.replace('{tocdepth}{2}', '{tocdepth}{1}') && R.refsSetup(d2).tocdepth === 2);
  check('and taken out: the bytes of before', ap(d2, R.setCounterEdits(d2, 'tocdepth', null)) === D);
  check('a commented \\setcounter is no setting', R.refsSetup(D.replace('\\begin{document}', '%\\setcounter{tocdepth}{1}\n\\begin{document}')).tocdepth === null);
  const r = ap(D, R.counterStyleEdits(D, 'footnote', 'roman'));
  check('footnotes numbered i, ii: one line, read back', r.includes('\\renewcommand{\\thefootnote}{\\roman{footnote}}\n\\begin{document}') && R.refsSetup(r).fn.style === 'roman');
  check('arabic again takes the line out', ap(r, R.counterStyleEdits(r, 'footnote', 'arabic')) === D);
  const fm = D.replace('\\usepackage{natbib}', '\\usepackage{natbib}\n\\usepackage[symbol,perpage]{footmisc}');
  check('footmisc\'s symbol and perpage read', R.refsSetup(fm).fn.style === 'fnsymbol' && R.refsSetup(fm).fn.restart === 'page');
  check('another style drops symbol, its other option kept', ap(fm, R.counterStyleEdits(fm, 'footnote', 'alph')).includes('\\usepackage[perpage]{footmisc}'));
  const sec = ap(D, R.fnRestartEdits(D, 'section', false).edits);
  check('restart each section: \\counterwithin*, read back, and off again', sec.includes('\\counterwithin*{footnote}{section}') && R.refsSetup(sec).fn.restart === 'section' && ap(sec, R.fnRestartEdits(sec, 'continuous', false).edits) === D);
  const rep = D.replace('{article}', '{report}');
  check('a report\'s footnotes start again each chapter; continuous writes \\counterwithout', R.refsSetup(rep, true).fn.restart === 'chapter' && ap(rep, R.fnRestartEdits(rep, 'continuous', true).edits).includes('\\counterwithout{footnote}{chapter}'));
  check('the bibliography read: natbib, its style', R.bibSetup(D).system === 'natbib' && R.bibSetup(D).style === 'plainnat');
  check('its style changed in place', ap(D, R.bibStyleEdits(D, 'apalike')) === D.replace('{plainnat}', '{apalike}'));
  check('a style that is no style name is refused', R.bibStyleEdits(D, 'x}\\input{y').length === 0);
  const t1 = ap(D, R.bibTitleEdits(D, 'Works Cited', false));
  check('a title: \\renewcommand{\\refname} before \\bibliographystyle, read back, off again', t1.includes('\\renewcommand{\\refname}{Works Cited}\n\\bibliographystyle') && R.bibTitle(t1, false) === 'Works Cited' && ap(t1, R.bibTitleEdits(t1, null, false)) === D);
  const BL = '\\documentclass{article}\n\\usepackage[style=authoryear,backend=biber]{biblatex}\n\\addbibresource{refs.bib}\n\\begin{document}\nX\n\\printbibliography\n\\end{document}\n';
  check('biblatex: style= changed in its options', ap(BL, R.bibStyleEdits(BL, 'apa')) === BL.replace('style=authoryear', 'style=apa') && R.bibSetup(BL).system === 'biblatex');
  const bt = ap(BL, R.bibTitleEdits(BL, 'Works Cited', false));
  check('biblatex: the title as \\printbibliography[title=…], and off again', bt.includes('\\printbibliography[title=Works Cited]') && R.bibTitle(bt) === 'Works Cited' && ap(bt, R.bibTitleEdits(bt, null, false)) === BL);
  check('the notes go before the bibliography at the end', ap(D, R.endLines(D, ['\\printendnotes'], ['bibliographystyle', 'bibliography'])).includes('Second.\n\\printendnotes\n\\bibliographystyle'));
  check('a hand written list is no system to restyle', R.bibSetup('\\documentclass{article}\n\\begin{document}\n\\begin{thebibliography}{9}\\bibitem{a} A.\\end{thebibliography}\n\\end{document}\n').system === 'thebibliography');
  check('\\footnote to \\endnote: the names alone, not in verbatim or comments', (() => { const s = '\\begin{document}\nA\\footnote{x} %\\footnote{c}\n\\begin{verbatim}\\footnote{v}\\end{verbatim}\n\\footnotemark\n\\end{document}'; const n = R.noteNames(s, 'footnote'); return n.length === 1 && s.slice(n[0].s, n[0].e) === 'footnote'; })());
  check('an index entry quotes makeindex\'s own characters', R.indexArg({ main: 'a!b', sub: 'c@d', fmt: 'textbf' }) === 'a"!b!c"@d|textbf' && R.indexArg({ main: 'x', see: 'y' }) === 'x|see{y}' && R.indexArg({ main: 'x', range: 'open' }) === 'x|(');
  const ix = R.readIndexArg('sort@\\textit{Shown}!sub|textbf');
  check('and is read back: sort key, levels, page format', ix.levels[0].sort === 'sort' && ix.levels[0].text === '\\textit{Shown}' && ix.levels[1].text === 'sub' && ix.fmt === 'textbf');
  check('page lists as makeindex writes them: three in a row a range', JSON.stringify(R.pageList([{ page: 3 }, { page: 1 }, { page: 2 }, { page: 5 }, { page: 6 }, { page: 2 }]).map((x) => x.t)) === '["1–3","5","6"]');
  check('symbols, numbers, letters; case together', ['zeta', 'Alpha', '42', '$x$', 'beta'].sort((x, y) => { const a = R.indexKey(x), b = R.indexKey(y); return a.grp - b.grp || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); }).join() === '$x$,42,Alpha,beta,zeta');
  check('a label from words', R.labelKey('fig:', 'A Cat, in the Hat!', new Set()) === 'fig:a-cat-in-the-hat' && R.labelKey('sec:', 'Intro', new Set(['sec:intro'])) === 'sec:intro-2');
  check('imakeidx read: columns and noclearpage', (() => { const s = '\\documentclass{article}\n\\usepackage{imakeidx}\n\\makeindex[columns=3]\n\\indexsetup{noclearpage}\n\\begin{document}\n\\end{document}'; const x = R.refsSetup(s).index; return x && x.pkg === 'imakeidx' && x.columns === 3 && x.noclear; })());
  check('a stranger\'s preamble of 50 000 unclosed \\setcounter reads in time', (() => { const s = '\\documentclass{article}\n' + '\\setcounter{'.repeat(50000) + '\n\\begin{document}\n\\end{document}'; const t0 = Date.now(); R.refsSetup(s); R.setCounterEdits(s, 'tocdepth', 2); return Date.now() - t0 < 3000; })());
}

// ---- a stranger's document: bounded work (the security audit's quick profile, B9)
{
  const many = '\\begin{document}\n' + 'a\\footnote{x} '.repeat(20000) + '\n\\end{document}';
  let t0 = Date.now();
  check('20 000 footnotes and no verbatim: converting reads the text once', R.noteNames(many, 'footnote').length === 20000 && Date.now() - t0 < 1500, Date.now() - t0);
  const doc = '\\documentclass{article}\n\\usepackage{imakeidx}\\usepackage{enotez}\n\\makeindex\n\\begin{document}\n' + 'w\\index{e!f|textbf}\\endnote{n} '.repeat(2000) + '\n' + '\\printindex\\printendnotes\n'.repeat(60) + '\\end{document}\n';
  t0 = Date.now();
  const M = buildModel({ main: 'main.tex', files: new Map([['main.tex', doc]]) });
  const rows = M.blocks.flatMap((b) => b.items).filter((x) => x.type === 'idx').reduce((n, x) => n + x.rows.length, 0);
  check('60 indexes and 60 notes lists of 2000 entries: drawn within bounds, in time', rows <= 8 * 2 + 5000 + 60 && Date.now() - t0 < 6000, [rows, Date.now() - t0]);
}

console.log(`bib.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
