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
  'a \\rikuywidget b \\rikuywidget[width=1cm]{} c \\rikuywidget{../../x.html}{} \\rikuywidget{w.html}{f.png',
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
// Inline code read as \verb is, a % in it code (R's %>%, a format's %d): read as a comment, it took
// the rest of the line off the page ("Use x Next line words."). Its end as TeX's: listings' braces
// at the first }, minted's at the one that balances, every kind at its line's end at the latest
// (an unclosed one took the rest of the file); spaces before [options] and {code} skipped, as
// TeX's look for them skips them; \url|..| as url.sty reads it. The native core reads the same
// (native.test.mjs compares the trees).
for (const [c, want, blocks] of [['Use \\lstinline|x % 2| for odd.\nNext.', 'Use x % 2 for odd. Next.'], ['Use \\lstinline{f() {} ok.\nNext.', 'Use f() { ok. Next.'],
  ['Use \\lstinline[language=R]{df %>% f} ok.\nNext.', 'Use df %>% f ok. Next.'], ['Use \\mintinline{r}{a %in% {b}} ok.\nNext.', 'Use a %in% {b} ok. Next.'],
  ['Use \\mintinline[x]{r}|a % b| ok.\nNext.', 'Use a % b ok. Next.'], ['Use \\verb|x % 2| ok.\nNext.', 'Use x % 2 ok. Next.'],
  ['Use \\lstinline [style=x]{a % b} ok.\nNext.', 'Use a % b ok. Next.'], ['Use \\lstinline {a % b} ok.\nNext.', 'Use a % b ok. Next.'],
  ['Use \\lstinline[language={[LaTeX]TeX}]|a % b| ok.\nNext.', 'Use a % b ok. Next.'], ['See \\url|a%b| for more.\nNext.', 'See a%b for more. Next.'],
  ['Use \\lstinline|bad\n\nNext \\textbf{para}.\n\nLast.', 'Use bad Next para. Last.', 3], ['Use \\lstinline{bad\n\nNext \\textbf{para}.\n\nLast.', 'Use bad Next para. Last.', 3],
  ['Use \\verb|bad\r\n\r\nNext.', 'Use bad Next.', 2],
  // (options never closed stop at the blank line, as TeX's optional argument does)
  ['a \\lstinline[style\n\nNext para \\cite[p.~3]{k} more.', 'a [style Next para more.', 2]]) {
  const M = buildModel({ files: new Map([['m.tex', c]]), main: 'm.tex' });
  const text = (inl) => (inl || []).map((x) => x.k === 'seg' ? x.t : x.kids ? text(x.kids) : x.k === 'verb' || x.k === 'url' ? x.text : '').join('');
  const got = M.blocks.map((b) => b.items.map((it) => text(it.inl)).join('')).join(' ').replace(/\s+/g, ' ').trim();
  if (got !== want || (blocks && M.blocks.length !== blocks)) { process.exitCode = 1; console.log('FAIL inline code', JSON.stringify(c), '=>', JSON.stringify(got), M.blocks.length); }
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

// The undo record's comparison from where the edits were (App.commit's windows, joined over a
// step's commits by src/editor.js stepStart and stepJoin as App.record does): the same answer as
// comparing from the ends, on random texts with repeats (where the smallest difference slides
// past the edit), one to three edits a commit, up to four commits a step over two files, and
// now and then a file changed between two commits outside them (a file opened over it, B0's
// review F1), which must cost the step its window and never give a record of a text that was not.
{
  const { diff, stepStart, stepJoin } = await import('../src/editor.js');
  let seed = 7, bad = 0, n = 0, outside = 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const piece = () => ['a', 'aa', 'b', ' ', '\n', 'ab', '\\x', '%'][Math.floor(rnd() * 8)];
  const words = (k) => { let t = ''; for (let i = 0; i < k; i++) t += piece(); return t; };
  // one commit's edits on t (apart, applied from the last as commit applies them): [text, window]
  const commit = (t) => {
    const list = [];
    let p = 0;
    for (let k = 0, m = 1 + Math.floor(rnd() * 3); k < m && p <= t.length; k++) {
      const s = p + Math.floor(rnd() * (t.length - p + 1)), e = Math.min(t.length, s + Math.floor(rnd() * 4));
      list.push({ s, e, t: rnd() < 0.3 ? '' : words(1 + Math.floor(rnd() * 3)) });
      p = e;
    }
    list.sort((x, y) => y.s - x.s || y.e - x.e);
    const w = { pre: list[list.length - 1].s, suf: t.length - list[0].e };
    for (const ed of list) t = t.slice(0, ed.s) + ed.t + t.slice(ed.e);
    return [t, w];
  };
  for (let trial = 0; trial < 3000; trial++) {
    const files = new Map([['a.tex', words(Math.floor(rnd() * 60))], ['b.tex', words(Math.floor(rnd() * 30))]]);
    const now = (f) => files.get(f);
    let step = null;
    for (let c = 0, cs = 1 + Math.floor(rnd() * 4); c < cs; c++) {
      // (between two commits, a file changed outside them)
      if (step && rnd() < 0.25) { const f = rnd() < 0.5 ? 'a.tex' : 'b.tex'; files.set(f, commit(files.get(f))[0]); outside++; }
      const before = new Map(), win = new Map();
      for (const f of rnd() < 0.7 ? ['a.tex'] : rnd() < 0.5 ? ['b.tex'] : ['a.tex', 'b.tex']) {
        before.set(f, files.get(f));
        const [t, w] = commit(files.get(f));
        files.set(f, t); win.set(f, w);
      }
      if (!step) { step = { before: new Map(before), ...stepStart(before, now, win) }; } else stepJoin(step, before, now, win);
      for (const [f, b] of step.before) {
        const w = step.win.get(f) || { pre: 0, suf: 0 };
        n++;
        if (JSON.stringify(diff(b, now(f), w.pre, w.suf)) !== JSON.stringify(diff(b, now(f)))) { bad++; if (bad === 1) console.log('FAIL undo diff', JSON.stringify({ b, now: now(f), w })); }
      }
    }
  }
  if (bad) process.exitCode = 1;
  console.log('undo diff from the edits:', n - bad, 'of', n, 'the same (' + outside + ' files changed between commits)');
}
