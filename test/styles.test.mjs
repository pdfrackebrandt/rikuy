// The styles of a paragraph as source edits (src/styles.js) and the LaTeX paragraph in the model
// (Builder.texBlock in src/model.js): which comment lines are the mark and which are not, what the
// model makes of a marked paragraph (its source, each character mapped to itself; counters,
// labels and headings as TeX has them), where a paragraph being typed with an unclosed brace
// ends, and every style change there and back, byte for byte.
import assert from 'node:assert/strict';
import { buildModel } from '../src/model.js';
import { LATEX_MARK, isLatexMark, latexSpot, restyle, applyEdits, quoteWords, startsLine, headLevels, headName, isEnvStyle, envOf, thmLine, starEdits, numberingEdits, charStyleBody, formatOnlyBegin, readCharBody, charBodyOf, readEnvBegin, envBeginOf, charDef, envDef, defRange } from '../src/styles.js';

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


// ---- B4: every heading, the environments, numbering, the document's own styles ----------------
const B = (src, words, ws, we, v) => ({ v, s: ws, ws, we, e: we, spot: -1 });
ok('heading levels by class, and Word\'s names for them', () => {
  assert.deepEqual(headLevels(false), ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']);
  assert.deepEqual(headLevels(true), ['chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']);
  assert.equal(headName('section', true), 'Heading 2');
  assert.equal(headName('paragraph', false), 'Heading 4');
  assert.equal(headName('part', false), 'Part');
  assert.ok(isEnvStyle('quotation') && isEnvStyle('theorem') && isEnvStyle('env:claim') && !isEnvStyle('section') && !isEnvStyle('p'));
  assert.equal(envOf('env:claim'), 'claim');
});

ok('every heading and environment there and back, byte for byte, the words untouched', () => {
  const t = wrap('Before.\n\nWords here.\n\nAfter.'), s = t.indexOf('Words'), e = s + 'Words here.'.length;
  for (const to of ['paragraph', 'subparagraph', 'chapter', 'part', 'quotation', 'verse', 'abstract', 'theorem', 'proof', 'env:aside']) {
    const r = restyle(t, { v: 'p', s, ws: s, we: e, e, spot: -1 }, to, s + 2);
    const u = applyEdits(t, r.edits);
    assert.ok(u.includes('Words here.'), to);
    const name = envOf(to);
    if (isEnvStyle(to)) {
      assert.ok(u.includes('\\begin{' + name + '}\nWords here.\n\\end{' + name + '}'), u);
      const q = quoteWords(u, u.indexOf('\\begin{' + name), u.indexOf('\\end{' + name) + ('\\end{' + name + '}').length, new Set([name]));
      const back = applyEdits(u, restyle(u, { v: to, s: u.indexOf('\\begin{' + name), ws: q.ws, we: q.we, e: u.indexOf('\\end{' + name) + ('\\end{' + name + '}').length }, 'p', q.ws).edits);
      assert.equal(back, t, to);
    } else {
      assert.ok(u.includes('\\' + to + '{Words here.}'), u);
      const hs = u.indexOf('\\' + to + '{'), he = u.indexOf('}', hs) + 1;
      assert.equal(applyEdits(u, restyle(u, { v: to, s: hs, ws: hs + to.length + 2, we: he - 1, e: he }, 'p', hs + 3).edits), t, to);
    }
    assert.ok(r.p >= s && r.p <= u.length);
  }
  // one environment to another: its name alone at both ends, a theorem's [title] kept
  const th = wrap('\\begin{theorem}[Euclid]\nWords.\n\\end{theorem}'), a = th.indexOf('\\begin{theorem}'), z = th.indexOf('\\end{theorem}') + 13, q = quoteWords(th, a, z, new Set(['theorem']));
  assert.equal(th.slice(q.ws, q.we), 'Words.');
  assert.equal(applyEdits(th, restyle(th, { v: 'theorem', s: a, ws: q.ws, we: q.we, e: z }, 'lemma', q.ws).edits), wrap('\\begin{lemma}[Euclid]\nWords.\n\\end{lemma}'));
  // a quote's text that starts with a bracket is its text, not an option
  const qb = wrap('\\begin{quote}[t] said\n\\end{quote}'), qa = qb.indexOf('\\begin{quote}');
  assert.equal(qb.slice(quoteWords(qb, qa, qb.indexOf('\\end{quote}') + 11).ws).slice(0, 3), '[t]');
  // a heading to a deeper one keeps its star and short title
  const h = wrap('\\subsubsection*{Deep}\nText.'), hs = h.indexOf('\\sub'), he = h.indexOf('}', hs) + 1;
  assert.ok(applyEdits(h, restyle(h, { v: 'subsubsection', s: hs, ws: hs + 16, we: he - 1, e: he }, 'paragraph', hs + 17).edits).includes('\\paragraph*{Deep}'));
});

ok('numbered and unnumbered: the star after the name, and secnumdepth in the preamble once', () => {
  const t = wrap('\\section{A}\nText.'), s = t.indexOf('\\section');
  const u = applyEdits(t, starEdits(t, { s }));
  assert.ok(u.includes('\\section*{A}'));
  assert.equal(applyEdits(u, starEdits(u, { s })), t);
  const off = applyEdits(t, numberingEdits(t, true, false));
  assert.ok(off.includes('\\setcounter{secnumdepth}{0}\n\\begin{document}'));
  assert.equal(applyEdits(off, numberingEdits(off, false, false)), t);
  assert.deepEqual(numberingEdits(off, true, false), []);
  assert.ok(applyEdits(t, numberingEdits(t, true, true)).includes('{secnumdepth}{-1}'));
  // a hand written one with another number is changed where it stands; one inside a comment is none
  const hand = wrap('x', '\\setcounter{secnumdepth}{2} % deeper\n');
  assert.ok(applyEdits(hand, numberingEdits(hand, true, false)).includes('\\setcounter{secnumdepth}{0} % deeper'));
  const com = wrap('x', '% \\setcounter{secnumdepth}{0}\n');
  assert.ok(applyEdits(com, numberingEdits(com, true, false)).includes('% \\setcounter{secnumdepth}{0}\n\\setcounter{secnumdepth}{0}\n'));
  assert.equal(numberingEdits('no preamble', true, false), null);
});

ok('a theorem\'s \\newtheorem, with its style where it has one', () => {
  assert.equal(thmLine('theorem', false), '\\newtheorem{theorem}{Theorem}');
  assert.equal(thmLine('definition', false), '\\theoremstyle{definition}\n\\newtheorem{definition}{Definition}');
  assert.equal(thmLine('proof', false), '');
  assert.equal(thmLine('lemma', true), '');
});

ok('the document\'s own styles: a \\newcommand that only formats its argument, an environment of declarations', () => {
  for (const yes of ['\\textbf{#1}', '\\textcolor{accent}{\\textbf{\\textit{#1}}}', '{\\bfseries #1}', '{\\color{red}\\itshape #1}', '\\emph{\\textsc{#1}}'])
    assert.ok(charStyleBody(yes), yes);
  for (const no of ['#1 and #2', '\\textbf{#1} x', '\\section{#1}', '\\href{#1}{x}', '#1#1', '\\textcolor{a}b{#1}', 'x'.repeat(400) + '#1'])
    assert.ok(!charStyleBody(no), no);
  assert.ok(formatOnlyBegin('\\par\\itshape\\color{accent}\\centering') && !formatOnlyBegin('\\begin{center}') && !formatOnlyBegin(''));
  const F = { bf: true, it: true, color: 'accent' };
  assert.deepEqual(readCharBody(charBodyOf(F)), F);
  assert.equal(charDef('keyterm', F), '\\newcommand{\\keyterm}[1]{\\textcolor{accent}{\\textbf{\\textit{#1}}}}');
  const G = { it: true, align: 'center', size: 'small' };
  assert.deepEqual(readEnvBegin(envBeginOf(G)), G);
  assert.equal(envDef('aside', G), '\\newenvironment{aside}{\\par\\small\\itshape\\centering}{\\par}');
  const t = wrap('x', '\\newcommand{\\keyterm}[1]{\\textbf{#1}}\n\\newcommand\\other[1]{#1}\n\\newenvironment{aside}{\\par\\itshape}{\\par}\n');
  const r = defRange(t, 'keyterm', 'cmd'), r2 = defRange(t, 'aside', 'env');
  assert.equal(t.slice(r.s, r.e), '\\textbf{#1}');
  assert.equal(t.slice(r2.s, r2.e), '\\par\\itshape');
  assert.equal(t.slice(defRange(t, 'other', 'cmd').s, defRange(t, 'other', 'cmd').e), '#1');
  assert.equal(defRange(t, 'missing', 'cmd'), null);
  assert.equal(defRange(wrap('x', '% \\newcommand{\\keyterm}[1]{#1}\n'), 'keyterm', 'cmd'), null);
});

ok('the model: \\paragraph runs into the paragraph after it (a blank line between or not), \\part is numbered I, titlesec\'s look is read', () => {
  const M = model(wrap('\\part{Whole}\n\\section{A}\nText.\n\n\\paragraph{Lead}\n\nRuns in.\n\n\\subparagraph{Sub} Also.\n\n\\paragraph{Alone}\n\\begin{itemize}\\item x\\end{itemize}',
    '\\usepackage{titlesec}\n\\titleformat{\\section}[hang]{\\normalfont\\Large\\bfseries\\sffamily\\filcenter}{\\thesection}{1em}{}[\\titlerule]\n'));
  const its = items(M).map((x) => x.it);
  const part = its.find((x) => x.type === 'h' && x.level === -1), sec = its.find((x) => x.type === 'h' && x.level === 1);
  assert.equal(part.num, 'I');
  assert.equal(part.chapLabel, 'Part');
  assert.deepEqual([sec.look.sf, sec.look.align, sec.look.rule, sec.look.size], [true, 'center', true, 'Large']);
  const lead = its.find((x) => x.type === 'h' && x.level === 4 && texts.length >= 0 && x.inl.some((y) => y.t === 'Lead'));
  const after = its[its.indexOf(lead) + 1];
  assert.ok(lead.runIn && after.runIn && after.runIn.text === 'Lead');
  const sub = its.find((x) => x.type === 'h' && x.level === 5);
  assert.ok(sub.runIn && its[its.indexOf(sub) + 1].runIn.level === 5);
  // before a list it stands on its own line
  const alone = its.find((x) => x.type === 'h' && x.inl.some((y) => y.t === 'Alone'));
  assert.ok(alone.runInto && !alone.runIn);
  // a \titleformat with shape hang for \paragraph sets it on its own line
  const M2 = model(wrap('\\paragraph{Lead}\nText.', '\\usepackage{titlesec}\n\\titleformat{\\paragraph}[hang]{\\normalfont\\bfseries}{}{0pt}{}\n'));
  assert.ok(!items(M2).find((x) => x.it.type === 'h').it.runIn);
  // an environment of the document's own that only formats: its paragraphs in that look
  const M3 = model(wrap('\\begin{aside}\nSet apart.\n\\end{aside}', '\\newenvironment{aside}{\\par\\itshape\\color{red}}{\\par}\n'));
  const p = items(M3).find((x) => x.it.type === 'p').it;
  assert.ok(p.look && p.look.it && p.look.color && !p.envTag);
});

console.log('styles: ' + n + ' groups of checks passed');
