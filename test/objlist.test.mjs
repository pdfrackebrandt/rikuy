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

console.log('objlist: ' + n + ' groups passed');
