// The editor model on broken and odd input (unclosed groups and math, stray closers, empty
// arguments, accents, babel shorthands): every case must build without throwing.
import { buildModel } from '../src/model.js';
import { isBalanced } from '../src/parser.js';
const cases = [
  'Hello {unclosed group and \\textbf{bold',
  '\\begin{theorem} body with \\end{proof} stray \\end{theorem} after',
  '\\begin{itemize}\\item a \\item b',
  'Math $x + y and no close\n\nNext para',
  'Na\\"ive caf\\\'e \\c{c}a \\v{s} \\ss{} \\o \\i \\\'\\i',
  '\\newcommand{\\note}[2][Note]{\\textbf{#1:} #2}\\note{hello} and \\note[Warn]{careful}',
  '}}} stray closers {{',
  '\\section{}\n\nempty title',
  '\\begin{equation}\na=b\n',
  '% only a comment\n\n\\label{x}\n\nText',
  '\\begin{enumerate}[label=(\\roman*)]\\item one\\item two\\end{enumerate}',
  '\\begin{tabular}{|l|c|}\\hline a & b \\\\ \\multicolumn{2}{c}{wide}\\\\\\hline\\end{tabular}',
  'x\\footnote{} y \\textbf{} z',
  '\\documentclass{article}\\usepackage[ngerman]{babel}\\begin{document}Gr"u"se "`Hallo"\' Stra"se\\end{document}',
  ''
];
for (const c of cases) {
  try {
    const M = buildModel({ files: new Map([['m.tex', c]]), main: 'm.tex' });
    const show = (inl) => (inl||[]).map(x => x.k==='seg' ? x.t : x.k==='sty' ? `<${x.st}>${show(x.kids)}</>` : x.k==='chr' ? `[${x.text}]` : x.k==='mac' ? `{${show(x.kids)}}` : `<${x.k}:${x.text||x.tex||x.num||''}>`).join('');
    console.log('OK', JSON.stringify(c).slice(0,50).padEnd(52), '=>', M.blocks.map(b=>b.items.map(it=>it.type+(it.inl? ':'+show(it.inl):'')+(it.label?'#'+show(it.label):'')).join(' / ')).join(' || ').slice(0,150));
  } catch (e) { process.exitCode = 1; console.log('THROW', JSON.stringify(c).slice(0,50), e.stack.split('\n').slice(0,3).join(' | ')); }
}
const s = 'a \\textbf{bold} b $x$ c';
console.log('bal', isBalanced(s, 0, s.length), isBalanced(s, 3, 9), isBalanced(s,2,16), isBalanced(s, 11, 15));
// A character command takes an empty {} at most: text in a group after it is text of its own.
for (const [c, want] of [['x \\%{b} c', 'x %b c'], ['a\\textasciitilde{}{b c} d', 'a~b c d'], ['a\\ldots{}{\\em x}', 'a…x'], ['50\\%{} more', '50% more']]) {
  const M = buildModel({ files: new Map([['m.tex', c]]), main: 'm.tex' });
  const text = (inl) => (inl || []).map((x) => x.k === 'seg' ? x.t : x.kids ? text(x.kids) : '').join('');
  const got = M.blocks.map((b) => b.items.map((it) => text(it.inl)).join('')).join('');
  if (got !== want) { process.exitCode = 1; console.log('FAIL char command group', JSON.stringify(c), '=>', JSON.stringify(got)); }
}
// Ranges a deletion may take whole: never one that splits [...] or reads a % inside \verb as a comment.
for (const [s, a, b, want] of [
  ['\\begin{theorem}[Title]\\label{t} Body', 18, 33, false],
  ['see [1] and [2] here', 0, 20, true],
  ['Use \\verb|%| then \\textbf{bold}', 0, 26, false],
  ['Use \\verb|%| then \\textbf{bold}', 0, 31, true],
  ['line\\\\[2pt] next', 0, 16, true],
  ['$[0,1)$ interval', 0, 7, true]
]) {
  if (isBalanced(s, a, b) !== want) { process.exitCode = 1; console.log('FAIL isBalanced', JSON.stringify(s.slice(a, b)), 'should be', want); }
}
// An Overleaf thesis: a class of its own that loads book, macros in a package of its own and in an
// \input preamble, \frontmatter and \mainmatter. The page numbers it as the PDF does (Chapter 1,
// 1.1, (1.1)), knows \E, and shows neither \frontmatter nor \mainmatter as source.
{
  const files = new Map([
    ['thesis.tex', '\\documentclass[11pt]{MyThesis}\n\\usepackage{mymacros}\n\\input{preamble}\n\\usepackage[capitalise]{cleveref}\n\\begin{document}\n\\frontmatter\n\\chapter{Preface}\nHi.\n\\begin{acknowledgements}\nThanks.\n\\end{acknowledgements}\n\\mainmatter\n\\chapter{Intro}\\label{ch:i}\n\\section{Q}\\label{s:q}\n\\begin{equation}\\E x = \\V y\\label{e:v}\\end{equation}\nSee \\cref{ch:i}, \\cref{s:q} and \\ref{e:v}.\n\\end{document}\n'],
    ['MyThesis.cls', '\\ProvidesClass{MyThesis}\n\\LoadClass{book}\n\\def\\@supervisor{x}\n\\renewcommand{\\maketitle}{\\@supervisor}\n\\newcommand{\\V}{\\mathbb{V}}\n'],
    ['mymacros.sty', '\\ProvidesPackage{mymacros}\n\\newcommand{\\E}{\\mathbb{E}}\n\\def\\section{broken}\n'],
    ['preamble.tex', '\\newcommand{\\R}{\\mathbb{R}}\n']
  ]);
  const M = buildModel({ files, main: 'thesis.tex' });
  const text = (inl) => (inl || []).map((x) => x.k === 'seg' ? x.t : x.k === 'chr' ? x.text : x.kids ? text(x.kids) : x.text || '').join('');
  const heads = M.blocks.flatMap((b) => b.items.filter((it) => it.type === 'h').map((it) => (it.chapLabel ? it.chapLabel + ' ' : '') + it.num + ' ' + text(it.inl)));
  const body = M.blocks.flatMap((b) => b.items.filter((it) => it.type === 'p').map((it) => text(it.inl))).join(' | ');
  const want = { cls: M.opts.cls === 'book' && M.opts.chapters, macros: ['\\E', '\\V', '\\R'].every((k) => k in M.mathMacros), noInternals: !('\\section' in M.mathMacros) && !('\\maketitle' in M.mathMacros) && !('\\@' in M.mathMacros),
    heads: JSON.stringify(heads) === JSON.stringify([' Preface', ' Acknowledgements', 'Chapter 1 Intro', '1.1 Q']), refs: /See Chapter 1, Section 1\.1 and 1\.1\./.test(body),
    noChips: !M.warn.includes('\\frontmatter') && !M.warn.includes('\\mainmatter') };
  for (const [k, v] of Object.entries(want)) if (!v) { process.exitCode = 1; console.log('FAIL thesis project:', k, JSON.stringify({ heads, body, cls: M.opts.cls, macros: Object.keys(M.mathMacros), warn: M.warn })); }
}
