// The Selection Pane's list and its renaming (src/objlist.js): every object of a document with its
// caption and label, in order; a label renamed with each reference, in every file, and back.
import assert from 'node:assert/strict';
import * as L from '../src/objlist.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const apply = (files, edits) => { const out = new Map(files); for (const f of out.keys()) { let s = out.get(f); for (const x of edits.filter((y) => y.f === f).sort((a, b) => b.s - a.s)) s = s.slice(0, x.s) + x.t + s.slice(x.e); out.set(f, s); } return out; };

const MAIN = '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nSee Figure~\\ref{fig:a} and \\cref{eq:1,fig:a}.\n\n'
  + '\\begin{figure}[h]\n\\centering\n\\includegraphics{a.png}\n\\caption{A \\textbf{nice} picture}\\label{fig:a}\n\\end{figure}\n\n'
  + '\\begin{equation}a=b\\label{eq:1}\\end{equation}\n\\[ c = d \\]\n'
  + '\\begin{center}\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n\\end{center}\n'
  + '\\begin{center}\n\\includegraphics{b.png}\n\\end{center}\n\\smartdiagram[flow diagram]{A, B}\n'
  + '\\begin{table}\n\\caption{Numbers}\n\\begin{tabular}{ll}a&b\\end{tabular}\n\\end{table}\n\\begin{tabular}{l}x\\end{tabular}\n\\input{two}\n\\end{document}\n';
const TWO = 'As \\eqref{eq:1} says, \\autoref{fig:a}.\n\\begin{center}\\begin{tikzpicture}\\begin{axis}\\addplot coordinates {(1,2)};\\end{axis}\\end{tikzpicture}\\end{center}\n';
const files = new Map([['main.tex', MAIN], ['two.tex', TWO]]);

ok('every object, in order, its kind, caption, label and a name', () => {
  const X = L.objectList(files, ['main.tex', 'two.tex']);
  assert.deepEqual(X.map((x) => [x.kind, x.name, x.label && x.label.key, x.inside]), [
    ['figure', 'A nice picture', 'fig:a', false], ['picture', 'Picture 1', null, true], ['equation', 'Equation 1', 'eq:1', false], ['equation', 'Equation 2', null, false],
    ['drawing', 'Drawing 1', null, false], ['picture', 'Picture 2', null, false], ['smartart', 'SmartArt 1', null, false], ['table', 'Numbers', null, false], ['table', 'Table 2', null, false], ['chart', 'Chart 1', null, false]]);
  const fig = X[0];
  assert.equal(MAIN.slice(fig.label.s, fig.label.e), 'fig:a');
  assert.ok(MAIN.slice(fig.s, fig.e).startsWith('\\begin{figure}'));
  assert.equal(X[9].f, 'two.tex');
});

ok('a label renamed with every reference in every file (cleveref lists too), and back', () => {
  const E = L.renameLabel(files, 'fig:a', 'fig:sunset');
  assert.equal(E.length, 4);
  const b = apply(files, E);
  assert.ok(b.get('main.tex').includes('\\ref{fig:sunset} and \\cref{eq:1,fig:sunset}') && b.get('main.tex').includes('\\label{fig:sunset}'));
  assert.ok(b.get('two.tex').includes('\\autoref{fig:sunset}'));
  const back = apply(b, L.renameLabel(b, 'fig:sunset', 'fig:a'));
  assert.deepEqual([...back], [...files]);
  assert.ok(L.renameLabel(files, 'fig:a', 'eq:1').error);
  assert.ok(L.renameLabel(files, 'fig:a', 'a b').error);
  assert.deepEqual(L.renameLabel(files, 'fig:a', 'fig:a'), []);
});

ok('where a name goes: after a float\'s caption, before an equation\'s end; none for a lone picture', () => {
  const X = L.objectList(files, ['main.tex']);
  const tab = X.find((x) => x.name === 'Numbers');
  assert.equal(MAIN.slice(L.labelPlace(MAIN, tab).at - 9, L.labelPlace(MAIN, tab).at), '{Numbers}');
  const eq = L.objectList(new Map([['m.tex', '\\begin{document}\n\\begin{equation}x\\end{equation}\n\\end{document}']]), ['m.tex'])[0];
  assert.equal(L.labelPlace('\\begin{document}\n\\begin{equation}x\\end{equation}\n\\end{document}', eq).at, 34);
  assert.equal(L.labelPlace(MAIN, X.find((x) => x.name === 'Picture 2')), null);
  assert.equal(L.plainText('A \\emph{very} $x^2$ \\cite{k} test~one'), 'A very x^2 test one');
});

ok('review M6: \\crefrange\'s second key, \\hyperref[..], \\subref, fancyref; nothing in verbatim or a comment', () => {
  const T = 'A \\crefrange{fig:x}{fig:a} and \\hyperref[fig:a]{the figure}, \\subref{fig:a}, \\fref{fig:a}, \\Cpageref{fig:a}.\n'
    + '\\begin{verbatim}\\ref{fig:a}\\end{verbatim}\n% \\label{fig:b} in a comment\n\\begin{align}x \\label{eq:z} % \\ref{fig:a}\n\\end{align} $\\eqref{eq:z}$\n\\label{fig:a}';
  const f = new Map([['m.tex', T]]);
  const E = L.renameLabel(f, 'fig:a', 'fig:sun');
  const after = apply(f, E).get('m.tex');
  assert.equal(after, T.replace(/fig:a\}\{fig:a\}/, 'fig:a}{fig:sun}').replace('hyperref[fig:a]', 'hyperref[fig:sun]').replace('subref{fig:a}', 'subref{fig:sun}').replace('fref{fig:a}', 'fref{fig:sun}')
    .replace('Cpageref{fig:a}', 'Cpageref{fig:sun}').replace('\\label{fig:a}', '\\label{fig:sun}').replace('\\crefrange{fig:x}{fig:a}', '\\crefrange{fig:x}{fig:sun}'));
  assert.ok(after.includes('\\begin{verbatim}\\ref{fig:a}\\end{verbatim}') && after.includes('% \\ref{fig:a}'));
  // a label in a comment is no name taken; one in an equation is
  assert.deepEqual(L.renameLabel(f, 'fig:a', 'fig:b').length, 6);
  assert.ok(L.renameLabel(f, 'fig:a', 'eq:z').error);
  assert.equal(apply(f, L.renameLabel(f, 'eq:z', 'eq:w')).get('m.tex'), T.replace(/eq:z/g, 'eq:w'));
});

ok('review N6: a reference in a tikzpicture, in an \\input file of any name, through the document\'s own \\figref; what is left said; a listing\'s label= is a name', () => {
  const F = new Map([
    ['main.tex', '\\documentclass{article}\n\\newcommand{\\figref}[1]{Figure~\\ref{#1}}\n\\newcommand{\\see}[2][see]{#1 \\autoref{#2}}\n\\def\\Fig#1{Fig.~\\ref{#1}}\n\\begin{document}\n\\input{chap1}\n\\begin{figure}\\caption{A}\\label{fig:a}\\end{figure}\n'
      + 'See \\figref{fig:a}, \\see[look at]{fig:a}, \\Fig{fig:a}.\n\\begin{tikzpicture}\\node {see \\ref{fig:a}};\\end{tikzpicture}\n\\begin{align}x\\label{eq:a}\\text{ by \\cref{fig:a}}\\end{align}\n\\input{plot.tikz}\n\\end{document}\n'],
    ['chap1.tex', 'In chapter one, \\ref{fig:a}, and \\begin{lstlisting}\n\\ref{fig:a}\n\\end{lstlisting} and \\footnote{see \\Cref{fig:a}}. % \\ref{fig:a}\n'],
    ['plot.tikz', '\\begin{tikzpicture}\\node {\\ref{fig:a}};\\end{tikzpicture}'],
    ['data.csv', 'fig:a,1\n']]);
  const E = L.renameLabel(F, 'fig:a', 'fig:b');
  const G = apply(F, E);
  assert.equal((G.get('main.tex').match(/fig:a/g) || []).length, 0, G.get('main.tex'));
  assert.ok(G.get('main.tex').includes('\\figref{fig:b}') && G.get('main.tex').includes('\\see[look at]{fig:b}') && G.get('main.tex').includes('\\Fig{fig:b}') && G.get('main.tex').includes('\\node {see \\ref{fig:b}}'));
  assert.equal(G.get('plot.tikz'), '\\begin{tikzpicture}\\node {\\ref{fig:b}};\\end{tikzpicture}');
  assert.equal(G.get('data.csv'), 'fig:a,1\n');
  // the listing's text and the comment stay; the listing is said to still name it
  assert.equal(G.get('chap1.tex'), 'In chapter one, \\ref{fig:b}, and \\begin{lstlisting}\n\\ref{fig:a}\n\\end{lstlisting} and \\footnote{see \\Cref{fig:b}}. % \\ref{fig:a}\n');
  assert.equal(E.left, 1); assert.deepEqual(E.leftIn, ['chap1.tex']);
  // and back, byte for byte
  const H = apply(G, L.renameLabel(G, 'fig:b', 'fig:a'));
  for (const [f, t] of F) assert.equal(H.get(f), t, f);
  // a listing's label= is a name taken, renamed with its references
  const lst = new Map([['m.tex', '\\begin{lstlisting}[caption=Code, label=lst:x]\nx\n\\end{lstlisting}\nSee \\ref{lst:x}.\n\\label{fig:a}']]);
  assert.match(L.renameLabel(lst, 'fig:a', 'lst:x').error, /taken/);
  assert.equal(apply(lst, L.renameLabel(lst, 'lst:x', 'lst:y')).get('m.tex'), lst.get('m.tex').replace(/lst:x/g, 'lst:y'));
});

console.log('objlist: ' + n + ' groups passed');
