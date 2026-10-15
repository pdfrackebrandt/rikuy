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
  } catch (e) { console.log('THROW', JSON.stringify(c).slice(0,50), e.stack.split('\n').slice(0,3).join(' | ')); }
}
const s = 'a \\textbf{bold} b $x$ c';
console.log('bal', isBalanced(s, 0, s.length), isBalanced(s, 3, 9), isBalanced(s,2,16), isBalanced(s, 11, 15));
