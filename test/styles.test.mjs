// The styles of a paragraph as source edits (src/styles.js) and the LaTeX paragraph in the model
// (Builder.texBlock in src/model.js): which comment lines are the mark and which are not, what the
// model makes of a marked paragraph (its source, each character mapped to itself; counters,
// labels and headings as TeX has them), where a paragraph being typed with an unclosed brace
// ends, and every style change there and back, byte for byte.
import assert from 'node:assert/strict';
import { buildModel } from '../src/model.js';
import { LATEX_MARK, isLatexMark, latexSpot, restyle, applyEdits, quoteWords, startsLine } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const wrap = (body, pre = '') => '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
const model = (files, main = 'main.tex') => buildModel({ files: new Map(typeof files === 'string' ? [[main, files]] : Object.entries(files)), main });
const items = (M) => M.blocks.flatMap((b) => b.items.map((it) => ({ b, it })));
const texts = (M) => items(M).filter((x) => x.it.type === 'tex').map((x) => x.it.text);
const types = (M) => items(M).map((x) => x.it.type).join(' ');

ok('the mark: a comment line of its own that says rikuy: latex, with a line of text after it', () => {
  const at = (src) => { const s = src.indexOf('%'), e = src.indexOf('\n', s) + 1 + /^[ \t]*/.exec(src.slice(src.indexOf('\n', s) + 1))[0].length; return isLatexMark(src, s, e); };
  for (const yes of ['% rikuy: latex\nx', '%rikuy:latex\nx', '%   rikuy:  latex  \nx', '  % rikuy: latex\n  x', 'a\n% rikuy: latex\r\nx']) assert.equal(at(yes), true, yes);
  for (const no of ['text % rikuy: latex\nx', '% rikuy: latex\n\nx', '% rikuy: latex\n', '% rikuy: latex', '% rikuy: latexx\nx', '%% rikuy: latex\nx', '% Rikuy: LaTeX\nx', '% rikuy: latex please\nx', '% rikuy:\nx', '\\% rikuy: latex\nx'])
    assert.equal(at(no), false, no);
  assert.equal(LATEX_MARK, '% rikuy: latex');
});

ok('a marked paragraph is one item: its source to the next blank line, every character mapped to itself', () => {
  const src = wrap('Before.\n\n% rikuy: latex\nSome $x^2$ \\textbf{raw} 50\\%\n  indented % note\n\nAfter.');
  const M = model(src);
  assert.equal(types(M), 'p tex p');
  const { b, it } = items(M).find((x) => x.it.type === 'tex');
  assert.equal(it.text, 'Some $x^2$ \\textbf{raw} 50\\%\n  indented % note');
  assert.equal(src.slice(b.s, b.e), '% rikuy: latex\n' + it.text);
  assert.equal(src.slice(it.is, it.ie), it.text);
  const seg = it.inl[0];
  assert.equal(it.inl.length, 1);
  assert.equal(seg.t, it.text);
  for (let i = 0; i < seg.t.length; i++) assert.deepEqual([seg.map[2 * i], seg.map[2 * i + 1]], [it.is + i, it.is + i + 1]);
  assert.equal(it.para, true);
  // the block's key moves with its text, so the page draws it again when it is typed in
  const M2 = model(src.replace('indented', 'indent'));
  assert.notEqual(M2.blocks.find((x) => x.items[0].type === 'tex').key, b.key);
});

ok('what is not the mark stays as it was: a mark before a blank line, at the end, inside an environment, after text', () => {
  for (const body of ['% rikuy: latex\n\nWords.', 'Words.\n% rikuy: latex', 'Words. % rikuy: latex\nmore words.', '\\begin{quote}\n% rikuy: latex\nWords.\n\\end{quote}', '\\begin{itemize}\n\\item a\n% rikuy: latex\n\\item b\n\\end{itemize}']) {
    const M = model(wrap(body));
    assert.equal(texts(M).length, 0, body);
  }
  // the same paragraphs without a mark: the page is as before
  assert.equal(types(model(wrap('% rikuy: latex\n\nWords.'))), 'p');
  // a mark in a macro's text is the macro's, not the document's
  assert.equal(texts(model(wrap('\\newcommand\\x{% rikuy: latex\nA}\n\\x'))).length, 0);
});

ok('a LaTeX paragraph in an \\input file, and several in a row', () => {
  const M = model({ 'main.tex': wrap('\\input{part}'), 'part.tex': 'One.\n\n% rikuy: latex\n\\emph{two}\n\n% rikuy: latex\nthree\n\n% rikuy: latex\n\\begin{itemize}\n\\item four\n\\end{itemize}\n' });
  assert.deepEqual(texts(M), ['\\emph{two}', 'three', '\\begin{itemize}\n\\item four\n\\end{itemize}']);
  assert.ok(items(M).filter((x) => x.it.type === 'tex').every((x) => x.it.f === 'part.tex'));
});

ok('what TeX counts in it still counts: section numbers, labels, equations, footnotes, words for the outline', () => {
  const M = model(wrap('\\section{One}\n\n% rikuy: latex\n\\section{Two}\\label{s2}\nText\\footnote{n}.\n\\begin{equation}\\label{e}a\\end{equation}\n\n\\section{Three}\nSee \\ref{s2} and \\ref{e}.', '\\usepackage{amsmath}\n'));
  assert.deepEqual(M.headings.map((h) => h.num + ' ' + h.text), ['1 One', '2 Two', '3 Three']);
  assert.equal(M.labels.get('s2').num, '2');
  assert.equal(M.labels.get('e').num, '1');
  const last = items(M).at(-1).it.inl.map((x) => x.t || x.text || '').join('');
  assert.ok(/See 2 and/.test(last), last);
  // a heading at its end: the paragraph after it starts without an indent, as after any heading
  const H = model(wrap('% rikuy: latex\n\\section{Two}\nAfter it.'));
  assert.equal(types(H), 'tex');
  const A = model(wrap('% rikuy: latex\n\\section{Two}\n\nAfter it.'));
  assert.equal(items(A).at(-1).it.indent, false);
});

ok('a brace, a bracket or an environment typed and not yet closed ends the paragraph at its first blank line', () => {
  for (const [body, want] of [['% rikuy: latex\nA \\textbf{open\nline\n\nNext.\n\nLast.', 'A \\textbf{open\nline'],
    ['% rikuy: latex\n\\begin{itemize}\n\\item x\n\nNext.\n\nLast.', '\\begin{itemize}\n\\item x'],
    ['% rikuy: latex\n\\section[short\n\nNext.\n\nLast.', '\\section[short'],
    ['% rikuy: latex\n\\fbox{\\emph{deep\n\nNext.\n\nLast.', '\\fbox{\\emph{deep']]) {
    const M = model(wrap(body));
    assert.deepEqual(texts(M), [want], body);
    assert.ok(/Next\..*Last\./.test(items(M).filter((x) => x.it.type === 'p').map((x) => x.it.inl.map((y) => y.t || '').join('')).join(' ')), body);
  }
  // one closed is one TeX keeps going over a blank line: the paragraph holds it whole
  assert.deepEqual(texts(model(wrap('% rikuy: latex\n{\\bf a\n\nb}\n\nNext.'))), ['{\\bf a\n\nb}']);
  const M = model(wrap('% rikuy: latex\n\\begin{equation}\na\n\n\\end{equation}\nmore\n\nNext.', '\\usepackage{amsmath}\n'));
  const it = items(M).find((x) => x.it.type === 'tex').it;
  assert.equal(it.text, '\\begin{equation}\na\n\n\\end{equation}\nmore');
  assert.equal(it.nest.length, 1);
  assert.equal(it.para, false);
});

ok('the spaces at the end of its last line are the paragraph\'s own', () => {
  assert.deepEqual(texts(model(wrap('% rikuy: latex\nline \\textbf{  \n\nAfter.'))), ['line \\textbf{  ']);
});

ok('para: one paragraph of text, which a heading or a quote could hold', () => {
  const para = (body) => items(model(wrap(body, '\\usepackage{amsmath}\n'))).find((x) => x.it.type === 'tex').it.para;
  assert.equal(para('% rikuy: latex\nWords $x$ and \\emph{y}.'), true);
  assert.equal(para('% rikuy: latex\nWords\\footnote{n}.'), true);
  for (const no of ['% rikuy: latex\n\\section{H}', '% rikuy: latex\n\\begin{center}x\\end{center}', '% rikuy: latex\nA\n\\[ x \\]\nB', '% rikuy: latex\n\\begin{itemize}\\item a\\end{itemize}'])
    assert.equal(para(no), false, no);
});

// the style changes, as the ribbon makes them (b as blockStyle in src/ribbon.js gives it)
const P = (src, words) => { const s = src.indexOf(words); return { v: 'p', s, ws: s, we: s + words.length, e: s + words.length, spot: latexSpot(src, s, s + words.length) }; };
const L = (src, words) => { const ws = src.indexOf(words), s = src.lastIndexOf(LATEX_MARK, ws); return { v: 'latex', s, ws, we: ws + words.length, e: ws + words.length }; };
const H = (src, cmd, words) => { const s = src.indexOf('\\' + cmd + '{' + words), ws = s + cmd.length + 2, we = ws + words.length; const lab = /^[ \t]*\\label\s*\{[^}]*\}/.exec(src.slice(we + 1)); return { v: cmd, s, ws, we, e: we + 1, after: lab ? we + 1 + lab[0].length : null, spot: latexSpot(src, s, we + 1) }; };
const Q = (src, words) => { const s = src.indexOf('\\begin{quote}'), ws = src.indexOf(words), we = ws + words.length, e = src.indexOf('\\end{quote}') + 11; return { v: 'quote', s, ws, we, e, spot: latexSpot(src, s, e) }; };
const step = (src, b, to, p) => { const r = restyle(src, b, to, p ?? b.ws + 2); assert.ok(r, b.v + ' to ' + to); return { src: applyEdits(src, r.edits), p: r.p }; };

ok('Normal to LaTeX writes the mark\'s line alone, LaTeX to Normal takes it alone away; the caret stays in the words', () => {
  const src = wrap('First.\n\nSecond $x$ words.\n\nThird.');
  const a = step(src, P(src, 'Second $x$ words.'), 'latex', src.indexOf('cond'));
  assert.equal(a.src, src.replace('Second', LATEX_MARK + '\nSecond'));
  assert.equal(a.src.slice(a.p, a.p + 4), 'cond');
  const b = step(a.src, L(a.src, 'Second $x$ words.'), 'p', a.p);
  assert.equal(b.src, src);
  assert.equal(b.src.slice(b.p, b.p + 4), 'cond');
  // only the edit for the mark: one splice, so one undo step
  assert.equal(restyle(src, P(src, 'Second $x$ words.'), 'latex', 0).edits.length, 1);
});

ok('every style to every other and back is the source it started from, byte for byte', () => {
  const words = 'Some words here.';
  const src = wrap('Before.\n\n' + words + '\n\nAfter.');
  const shapes = {
    p: (t) => t,
    latex: (t) => t.replace(words, LATEX_MARK + '\n' + words),
    section: (t) => t.replace(words, '\\section{' + words + '}'),
    subsection: (t) => t.replace(words, '\\subsection{' + words + '}'),
    subsubsection: (t) => t.replace(words, '\\subsubsection{' + words + '}'),
    quote: (t) => t.replace(words, '\\begin{quote}\n' + words + '\n\\end{quote}')
  };
  const block = (t, v) => v === 'p' ? P(t, words) : v === 'latex' ? L(t, words) : v === 'quote' ? Q(t, words) : H(t, v, words);
  for (const a of Object.keys(shapes)) for (const z of Object.keys(shapes)) {
    if (a === z) continue;
    const from = shapes[a](src);
    if (z === 'latex') {
      // LaTeX marks the block as it is (a heading's or a quote's source shows in the box), and
      // Normal on that box takes the mark away: the heading or the quote again
      const b = block(from, a), there = step(from, b, 'latex').src;
      assert.equal(there, from.slice(0, b.s) + LATEX_MARK + '\n' + from.slice(b.s), a + ' to LaTeX');
      const ws = b.s + LATEX_MARK.length + 1, we = ws + b.e - b.s;
      assert.equal(step(there, { v: 'latex', s: b.s, ws, we, e: we }, 'p').src, from, a + ' to LaTeX and back');
      continue;
    }
    // (LaTeX to a heading or a quote is offered where its source is one paragraph of text: here it is)
    const there = step(from, block(from, a), z).src;
    assert.equal(there, shapes[z](src), a + ' to ' + z);
    if (a !== 'latex') assert.equal(step(there, block(there, z), a).src, from, a + ' to ' + z + ' and back');
  }
});

ok('a heading with its \\label after it becomes a paragraph that keeps the label and a blank line after it', () => {
  const src = wrap('\\section{Opening}\\label{s:o}\nText after.');
  const a = step(src, H(src, 'section', 'Opening'), 'p');
  assert.equal(a.src, wrap('Opening\\label{s:o}\n\nText after.'));
  assert.equal(step(a.src, P(a.src, 'Opening\\label{s:o}'), 'section').src, wrap('\\section{Opening\\label{s:o}}\n\nText after.'));
  // and LaTeX on it takes the label line into the paragraph; on a heading with text right under it, nothing
  assert.ok(latexSpot(src, src.indexOf('\\section'), src.indexOf('}') + 1) < 0);
  const t = wrap('\\section{Opening}\n\\label{s:o}\n\nText after.');
  const b = step(t, H(t, 'section', 'Opening'), 'latex');
  assert.equal(b.src, t.replace('\\section', LATEX_MARK + '\n\\section'));
  assert.deepEqual(texts(model(b.src)), ['\\section{Opening}\n\\label{s:o}']);
});

ok('a heading on a paragraph whose last line ends in a comment closes its brace on a line of its own', () => {
  const src = wrap('Words % a note');
  const a = step(src, P(src, 'Words % a note'), 'section');
  assert.equal(a.src, wrap('\\section{Words % a note\n}'));
});

ok('latexSpot: a block that starts its line and ends at a blank line, the end of its text or a comment line', () => {
  const at = (body, words) => { const src = wrap(body), s = src.indexOf(words); return latexSpot(src, s, s + words.length) >= 0; };
  assert.equal(at('A.\n\nB words.\n\nC.', 'B words.'), true);
  assert.equal(at('A.\n\nB words.', 'B words.'), true);
  assert.equal(at('A.\n\nB words.\n% a note\n\nC.', 'B words.'), true);
  assert.equal(at('A. B words.\n\nC.', 'B words.'), false);
  assert.equal(at('B words.\n\\section{Next}', 'B words.'), false);
  assert.equal(at('\\begin{itemize}\n\\item a\n\\end{itemize}\nAfter.', '\\begin{itemize}\n\\item a\n\\end{itemize}'), false);
  assert.equal(at('\\begin{itemize}\n\\item a\n\\end{itemize}\n\nAfter.', '\\begin{itemize}\n\\item a\n\\end{itemize}'), true);
});

ok('quoteWords: a quote or quotation as a block, its words; and quickly on a stranger\'s long text', () => {
  const at = (t) => { const r = quoteWords(t, 0, t.length); return r && [r.name, t.slice(r.ws, r.we)]; };
  assert.deepEqual(at('\\begin{quote}\n  Said here.\n\\end{quote}'), ['quote', 'Said here.']);
  assert.deepEqual(at('\\begin{quotation}Said.\\end{quotation}  \n'), ['quotation', 'Said.']);
  assert.deepEqual(at('\\begin{quote}\\end{quote}'), ['quote', '']);
  for (const no of ['Words.', '\\begin{quote}x\\end{quotation}', '\\begin{quotation}x\\end{quote}', '\\begin{quote}x', 'x \\begin{quote}y\\end{quote}']) assert.equal(at(no), null, no);
  // the ribbon asks at every move of the caret: a paragraph of spaces must not stall it (the
  // pattern this replaces took 1.4 s on 60 000 spaces and grew with their square)
  for (const t of ['Words' + ' '.repeat(400000) + 'x', 'W' + ' \n'.repeat(200000) + 'x', '\\begin{quote}' + ' '.repeat(400000) + 'x']) {
    const t0 = performance.now();
    assert.equal(at(t), null);
    assert.ok(performance.now() - t0 < 100, (performance.now() - t0) + ' ms');
  }
});

ok('a mark under a line of text is a comment inside that paragraph, as TeX reads it: no box', () => {
  // (TeX makes one paragraph of "Before it." and the lines after the comment; the page did show
  // a paragraph and a box, and Enter after "Before it." put the new paragraph between them)
  const M = model(wrap('Before it.\n% rikuy: latex\nalpha \\x\n\nAfter it.'));
  assert.equal(types(M), 'p p');
  assert.equal(texts(M).length, 0);
  // at a paragraph's start it counts: after a blank line, a heading, \noindent alone on its line
  for (const body of ['Before.\n\n% rikuy: latex\nalpha', '\\section{A}\n% rikuy: latex\nalpha', '\\noindent\n% rikuy: latex\nalpha'])
    assert.deepEqual(texts(model(wrap(body))), ['alpha'], body);
});

ok('a \\verb or an argument read as it is, open over a blank line, ends the box there: the rest is the document\'s again', () => {
  for (const open of ['\\verb|', '\\verb+', '\\url{', '\\href{']) {
    const M = model(wrap('% rikuy: latex\n' + open + 'x\n\nNext para.\n\n\\section{S}\nLast para.', '\\usepackage{hyperref}\n'));
    assert.deepEqual(texts(M), [open + 'x'], open);
    assert.equal(types(M), 'tex p h p', open);
    assert.deepEqual(M.headings.map((h) => h.num + ' ' + h.text), ['1 S'], open);
  }
  // closed on its own line, nothing is cut
  assert.deepEqual(texts(model(wrap('% rikuy: latex\n\\url{a.org} \\verb|x|\n\nNext.', '\\usepackage{url}\n'))), ['\\url{a.org} \\verb|x|']);
});

ok('Quote and back is byte for byte also inside an environment and in a file written with CRLF; Quote only where the paragraph starts its line', () => {
  const words = 'Said here.';
  for (const src of [wrap('\\begin{otherlanguage}{german}\nSaid here.\n\\end{otherlanguage}\n\nAfter.', '\\usepackage[german,english]{babel}\n'), wrap('Before.\n\nSaid here.\n\nAfter.').replace(/\n/g, '\r\n'), wrap('\\section{H}\nSaid here.\n\nAfter.')]) {
    const there = step(src, P(src, words), 'quote').src;
    assert.ok(!/\r\n/.test(src) || !/[^\r]\n/.test(there), 'CRLF kept: ' + JSON.stringify(there));
    const back = step(there, Q(there, words), 'p').src;
    assert.equal(back, src);
  }
  const t = wrap('Before.\n\n\\noindent Said here.\n\nAfter.');
  assert.equal(startsLine(t, t.indexOf('Said')), false);
  assert.equal(startsLine(t, t.indexOf('\\noindent')), true);
  // a quote written by hand with no blank line around it keeps its paragraph apart on the way back
  const h = wrap('Before.\n\\begin{quote}\nSaid here.\n\\end{quote}\nAfter.');
  assert.equal(step(h, Q(h, words), 'p').src, wrap('Before.\n\nSaid here.\n\nAfter.'));
  // LaTeX in a CRLF file writes its mark with CRLF
  const c = wrap('Before.\n\nSaid here.\n\nAfter.').replace(/\n/g, '\r\n');
  assert.ok(step(c, P(c, words), 'latex').src.includes('% rikuy: latex\r\nSaid here.'));
});

ok('where the mark counts, as llms-full.txt and docs/ARCHITECTURE.md say', () => {
  for (const [body, pre] of [['\\begin{otherlanguage}{german}\n% rikuy: latex\nA\n\\end{otherlanguage}', '\\usepackage[german,english]{babel}\n'], ['\\begin{CJK}{UTF8}{gbsn}\n% rikuy: latex\nA\n\\end{CJK}', '\\usepackage{CJK}\n'],
    ['\\begin{RTL}\n% rikuy: latex\nA\n\\end{RTL}', '\\usepackage{bidi}\n'], ['\\begin{subequations}\n% rikuy: latex\nA\n\\end{subequations}', '\\usepackage{amsmath}\n'], ['\\begin{itemize}\\item x\\end{itemize}\n% rikuy: latex\nA', '']])
    assert.deepEqual(texts(model(wrap(body, pre))), ['A'], body);
  for (const body of ['\\begin{center}\n% rikuy: latex\nA\n\\end{center}', '\\begin{quote}\n% rikuy: latex\nA\n\\end{quote}', '\\begin{minipage}{3cm}\n% rikuy: latex\nA\n\\end{minipage}'])
    assert.deepEqual(texts(model(wrap(body))), [], body);
  // in the preamble it is a comment like any other
  assert.deepEqual(texts(model('\\documentclass{article}\n% rikuy: latex\n\\usepackage{x}\n\\begin{document}\nA\n\\end{document}\n')), []);
});

console.log('styles: ' + n + ' groups of checks passed');
