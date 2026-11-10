// Word support (src/docx.js, src/wordast.js, src/wordsync.js, src/wordjobs.js) with the real pandoc
// (npm's pandoc-wasm, through src/pandoc.js as the worker runs it): a project exported to .docx and
// read back unchanged gives no edit; each block's bookmark and text survive; text edited in the
// .docx comes back as the smallest source patch on the tricky cases (escaped %, $ and &, \emph,
// accents, a change across formatting, footnotes, citations, equations); an edit of text the owner
// changed since is a conflict, not applied; hostile files are refused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel, colorValue } from '../src/model.js';
import { buildWordDoc, expandMath, unpackRuns, wordColor, listStyle, uncolor } from '../src/wordast.js';
import { createPandoc } from '../src/pandoc.js';
import { exportDocx, readDocx, docxToLatex } from '../src/wordjobs.js';
import { checkData, planImport, unpackRead, rebase, textHunks, mathPatch, stripNumbers, safeMath } from '../src/wordsync.js';
import { unzip, zip, extract, parseXml, readRikuyPart, text } from '../src/docx.js';
import { isBalanced } from '../src/parser.js';
import { zipSync } from 'fflate';

const P = await createPandoc(fs.readFileSync(new URL('../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url)));
let n = 0;
const ok = (name, f) => Promise.resolve(f()).then(() => { n++; }, (e) => { console.error('FAIL', name); throw e; });

const doc = (body, pre = '') => '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{natbib}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
const BIB = '@book{knuth1984, author={Knuth, Donald E.}, title={The TeXbook}, publisher={Addison-Wesley}, year={1984}}\n';

function exportFiles(files, main = 'main.tex') {
  const m = buildModel({ files, main });
  const bibs = [...files.keys()].filter((x) => /\.bib$/.test(x));
  const citeproc = bibs.length > 0 && m.cites.length > 0;
  const W = buildWordDoc(m, files, { citeproc, now: 0 });
  const resources = {};
  for (const b of bibs) resources[b] = files.get(b);
  return exportDocx(P, { doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources, bibs, citeproc, project: { name: 'Paper', main, files: [...files] } });
}
// the .docx with its document.xml changed by fn, as a coauthor's Word would save it
function edit(docx, fn, part = 'word/document.xml') {
  const parts = unzip(docx);
  parts.set(part, fn(text(parts.get(part))));
  return zip(parts);
}
function importInto(docx, cur, who = 'Ana') {
  const r = readDocx(P, docx);
  const data = checkData(r.data);
  assert.ok(data, 'the file carries readable Rikuy data');
  return planImport(data, unpackRead(r.X), cur, { who });
}
// the source after the coauthor's edit: only `want` differs from `src`
async function roundTrip(src, change, want, extra = {}) {
  const files = new Map([['main.tex', src], ...Object.entries(extra)]);
  const E = exportFiles(files);
  const plan = importInto(edit(E.docx, change), files);
  const got = plan.files.get('main.tex') ?? src;
  assert.equal(got, want);
  return plan;
}
const rep = (a, b) => (d) => { assert.ok(d.includes(a), 'the docx says ' + a); return d.replace(a, b); };

await ok('an unchanged round trip changes nothing, and every block keeps its bookmark', async () => {
  const sample = (x) => fs.readFileSync(new URL('../sample/' + x, import.meta.url), 'utf8');
  const files = new Map([['main.tex', sample('main.tex')], ['refs.bib', sample('refs.bib')]]);
  const E = exportFiles(files);
  assert.equal(E.lost, 0);
  const parts = unzip(E.docx);
  const data = checkData(readRikuyPart(parts));
  assert.ok(data.anchors.length > 30);
  const X = extract(parts);
  for (const A of data.anchors) assert.equal(X.regions.get(A.id)?.text, A.text, A.id);
  // every character of a block maps to the source that made it, or is generated, or an atom
  const main = files.get('main.tex');
  const A = data.anchors.find((x) => x.text.startsWith('Click anywhere'));
  const m = A.map;
  assert.equal(main.slice(m[0], m[1] + 13), 'Click anywhere');
  const plan = importInto(E.docx, files);
  assert.equal(plan.files.size, 0);
  assert.equal(plan.stats.applied + plan.stats.conflicts + plan.stats.skipped, 0);
});

await ok('escaped specials: % $ & # come back escaped, in place', async () => {
  const src = doc('Costs rose 50\\% in R\\&D.\n');
  await roundTrip(src, rep('Costs rose 50% in R&amp;D.', 'Costs rose 60% in R&amp;D, $5 a #1 item.'), src.replace('50\\% in R\\&D.', '60\\% in R\\&D, \\$5 a \\#1 item.'));
});

await ok('a word inside \\emph changes inside the braces; one across formatting keeps the braces', async () => {
  const src = doc('A plain \\emph{fancy} text.\n');
  await roundTrip(src, rep('fancy', 'grand'), src.replace('fancy', 'grand'));
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  // "plain fancy" -> "simple": the selection runs out of \emph{}
  const plan = importInto(edit(E.docx, (d) => d.replace(/A plain ([\s\S]*?)fancy/, (m, mid) => 'A simple' + mid.replace(/<w:t[^>]*>[^<]*<\/w:t>/g, (t) => t.replace(/>[^<]*</, '><')))), files);
  const got = plan.files.get('main.tex');
  assert.ok(isBalanced(got, 0, got.length), got);
  assert.match(got, /A simple\s*\\emph\{\} text\./);
});

await ok('accents written as TeX: an edit next to é keeps \\\'e', async () => {
  const src = doc('A caf\\\'e in Lima.\n');
  await roundTrip(src, rep('café in', 'cafés in'), src.replace("caf\\'e in", "caf\\'es in"));
  await roundTrip(src, rep('café in', 'bar in'), src.replace("caf\\'e in", 'bar in'));
});

await ok('quotes, dashes and non breaking spaces from Word become TeX', async () => {
  const src = doc('He said it once.\n');
  await roundTrip(src, rep('He said it once.', 'He said “it” once\u00a0more — twice.'), src.replace('He said it once.', "He said ``it'' once~more --- twice."));
});

await ok('a footnote edited in Word patches the footnote', async () => {
  const src = doc('Text.\\footnote{See the appendix.} More.\n');
  await roundTrip(src, (d) => d, src);
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const plan = importInto(edit(E.docx, rep('See the appendix.', 'See the online appendix.'), 'word/footnotes.xml'), files);
  assert.equal(plan.files.get('main.tex'), src.replace('See the appendix.', 'See the online appendix.'));
});

await ok('a citation is generated text: edited in Word it is not applied, but noted as a comment', async () => {
  const src = doc('As \\citet{knuth1984} shows, it works.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n');
  const files = new Map([['main.tex', src], ['refs.bib', BIB]]);
  const E = exportFiles(files);
  assert.ok(text(unzip(E.docx).get('word/document.xml')).includes('Knuth (1984)'));
  const plan = importInto(edit(E.docx, rep('Knuth (1984)', 'Knuth (1985)')), files);
  const got = plan.files.get('main.tex');
  assert.ok(got.includes('\\citet{knuth1984}'));
  assert.match(got, /% comment \(Ana\) on "[^"]*": In Word, a citation, reference or other generated item was changed: “Knuth \(1984\)” became “Knuth \(1985\)”/);
  // deleting the whole citation deletes the command
  const plan2 = importInto(edit(E.docx, rep('Knuth (1984)', '')), files);
  assert.ok(plan2.files.get('main.tex').includes('As  shows, it works.') && !plan2.files.get('main.tex').includes('citet'), plan2.files.get('main.tex'));
});

await ok('an equation edited in Word: only the changed token, macros and label kept', async () => {
  const src = doc('Then\n\\begin{equation}\n  \\E[x] = \\frac{a}{b^2} \\label{eq:a}\n\\end{equation}\nand $x+1$ holds.\n', '\\newcommand{\\E}{\\mathbb{E}}\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const d0 = text(unzip(E.docx).get('word/document.xml'));
  // b squared becomes b cubed, in the OMML
  const plan = importInto(edit(E.docx, (d) => { const i = d.indexOf('<m:oMathPara'); const j = d.indexOf('<m:t>2</m:t>', i); return d.slice(0, j) + '<m:t>3</m:t>' + d.slice(j + 12); }), files);
  assert.equal(plan.files.get('main.tex'), src.replace('b^2', 'b^3'));
  assert.equal(plan.stats.math, 1);
  // the inline one: x+1 -> x+2
  const plan2 = importInto(edit(E.docx, (d) => { const i = d.lastIndexOf('<m:oMath>'); const j = d.indexOf('<m:t>1</m:t>', i); return d.slice(0, j) + '<m:t>2</m:t>' + d.slice(j + 12); }), files);
  assert.equal(plan2.files.get('main.tex'), src.replace('$x+1$', '$x+2$'));
  assert.ok(d0.replace(/<[^>]+>/g, '').includes('(1)'), 'the equation number is in the Word file');
});

await ok('paragraphs: deleted, added, joined; tracked changes count as accepted', async () => {
  const src = doc('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const delPara = (d) => d.replace(/<w:p>(?:(?!<w:p>)[\s\S])*?Second paragraph\.[\s\S]*?<\/w:p>/, '');
  assert.equal(importInto(edit(E.docx, delPara), files).files.get('main.tex'), src.replace('Second paragraph.\n\n', ''));
  const addPara = (d) => d.replace(/(Second paragraph\.[\s\S]*?<\/w:p>)/, '$1<w:p><w:r><w:t>New one.</w:t></w:r></w:p>');
  assert.equal(importInto(edit(E.docx, addPara), files).files.get('main.tex'), src.replace('Second paragraph.', 'Second paragraph.\n\nNew one.'));
  // Word joins two paragraphs: the second's text moves into the first paragraph
  const join = (d) => d.replace(/(First paragraph\.)<\/w:t>([\s\S]*?)<\/w:p>\s*<w:p>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?/, '$1</w:t>$2');
  assert.equal(importInto(edit(E.docx, join), files).files.get('main.tex'), src.replace('First paragraph.\n\nSecond', 'First paragraph. Second'));
  // a tracked insertion and a tracked deletion
  const tracked = (d) => d.replace('Third paragraph.', 'Third </w:t></w:r><w:del w:id="1" w:author="Ana"><w:r><w:delText>paragraph</w:delText></w:r></w:del><w:ins w:id="2" w:author="Ana"><w:r><w:t>block</w:t></w:r></w:ins><w:r><w:t>.');
  const p = importInto(edit(E.docx, tracked), files);
  assert.equal(p.files.get('main.tex'), src.replace('Third paragraph.', 'Third block.'));
  // a paragraph deleted with changes tracked (its text and its mark) is deleted whole
  const trDel = (d) => d.replace(/(<w:p>(?:(?!<w:p>)[\s\S])*?)<w:r><w:t xml:space="preserve">Second paragraph\.<\/w:t><\/w:r>/, (m, a) => a.replace('<w:pPr>', '<w:pPr><w:rPr><w:del w:id="5" w:author="Ana"/></w:rPr>') + '<w:del w:id="6" w:author="Ana"><w:r><w:delText>Second paragraph.</w:delText></w:r></w:del>');
  assert.equal(importInto(edit(E.docx, trDel), files).files.get('main.tex'), src.replace('Second paragraph.\n\n', ''));
});

await ok('a paragraph added to a Word list is a new \\item', async () => {
  const src = doc('\\begin{itemize}\n  \\item One\n  \\item Two\n\\end{itemize}\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const plan = importInto(edit(E.docx, (d) => d.replace(/(<w:p>(<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)(?:(?!<w:p>)[\s\S])*?>Two<[\s\S]*?<\/w:p>)/, (m, all, ppr) => all + '<w:p>' + ppr + '<w:r><w:t>Three</w:t></w:r></w:p>')), files);
  assert.equal(plan.files.get('main.tex'), src.replace('\\item Two', '\\item Two\n\\item Three'));
});

await ok('Word comments become Rikuy comments; Rikuy\'s own come back without doubling', async () => {
  const src = doc('The claim is strong.\n% comment (Pedro) on "strong": Too strong?\n\nNext.\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const parts = unzip(E.docx);
  assert.match(text(parts.get('word/comments.xml')), /Too strong\?/);
  // unchanged: the comment that went to Word is not added again
  assert.equal(importInto(E.docx, files).files.size, 0);
  // a new comment from Word on "claim", and a reply to Pedro's
  let d2 = edit(E.docx, (d) => d.replace('The claim', 'The </w:t></w:r><w:commentRangeStart w:id="50"/><w:r><w:t>claim</w:t></w:r><w:commentRangeEnd w:id="50"/><w:r><w:t xml:space="preserve">'));
  d2 = edit(d2, (c) => c.replace('</w:comments>', '<w:comment w:id="50" w:author="Ana"><w:p><w:r><w:t>Cite it.</w:t></w:r></w:p></w:comment></w:comments>'), 'word/comments.xml');
  const got = importInto(d2, files).files.get('main.tex');
  assert.ok(got.includes('% comment (Pedro) on "strong": Too strong?\n% comment (Ana) on "claim": Cite it.\n'), got);
});

await ok('an edit of text the owner changed since the export is a conflict: not applied, noted', async () => {
  const src = doc('The owner keeps writing here. Another sentence stays.\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const mine = new Map([['main.tex', src.replace('keeps writing', 'went on writing')]]);
  const plan = importInto(edit(E.docx, rep('keeps writing here. Another sentence stays', 'always writes here. Another sentence remains')), mine);
  const got = plan.files.get('main.tex');
  assert.equal(plan.stats.conflicts, 1);
  assert.ok(got.includes('The owner went on writing here. Another sentence remains.'), got); // the other edit merges
  assert.match(got, /% comment \(Ana\) on "[^"]*writing[^"]*": In Word: “keeps writing” became “always writes”\. Not applied/);
  // rebase on its own: overlapping ranges clash, others shift
  const chg = [{ as: 10, ae: 15, bs: 10, be: 20 }];
  assert.equal(rebase({ s: 12, e: 14 }, chg), null);
  assert.equal(rebase({ s: 10, e: 10 }, [{ as: 10, ae: 10, bs: 10, be: 12 }]), null);
  assert.deepEqual(rebase({ s: 30, e: 32 }, chg), { s: 35, e: 37 });
  assert.deepEqual(rebase({ s: 2, e: 4 }, chg), { s: 2, e: 4 });
});

await ok('text hunks are word granular, and nearby words make one change', () => {
  assert.deepEqual(textHunks('a keeps writing b', 'a always writes b'), [{ a: 2, b: 15, A: 2, B: 15 }]);
  assert.deepEqual(textHunks('a café b', 'a cafés b'), [{ a: 6, b: 6, A: 6, B: 7 }]);
  assert.deepEqual(textHunks('one two three four five six seven', 'one two THREE four five six SEVEN').length, 2);
  assert.equal(stripNumbers('y = x \\quad\\quad(3)', ['3']), 'y = x');
  assert.equal(mathPatch('\\frac{a}{b^2} + \\E x', '\\frac{a}{b^{2}} + \\mathbb{E}x', '\\frac{a}{b^{3}} + \\mathbb{E}x'), '\\frac{a}{b^3} + \\E x');
  assert.equal(expandMath('\\E[x] + \\key{a}', { '\\E': '\\mathbb{E}', '\\key': '\\texttt{#1}' }), '\\mathbb{E}[x] + \\texttt{a}');
});

await ok('headings, abstract, nested lists, a description, a theorem, a proof, a table cell, a caption: each edit lands in its own place', async () => {
  const src = String.raw`\documentclass{article}
\usepackage{amsmath,amsthm,siunitx,hyperref,tikz}
\newtheorem{theorem}{Theorem}
\newcommand{\key}[1]{\textbf{#1}}
\title{Rich \emph{Doc}}
\author{A. One \and B. Two}
\begin{document}
\maketitle
\begin{abstract}
An abstract here.
\end{abstract}
\section{Lists}\label{sec:l}
\begin{itemize}
  \item First item with \key{bold}.
  \item Second item
  \begin{enumerate}
    \item Nested one
    \item Nested two
  \end{enumerate}
  \item Third item
\end{itemize}
\begin{description}
\item[Term] Its definition.
\end{description}
\begin{theorem}[Main]
Every \(x\) is \SI{3}{\metre} long.
\end{theorem}
\begin{proof}
Trivial.
\end{proof}
See \url{https://example.org} and \href{https://ex.org}{the site}, Section~\ref{sec:l}.
\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}
\begin{table}[h]
\begin{tabular}{lr}
\hline
\multicolumn{2}{c}{Head} \\
\hline
a & 1 \\
b & 2 \\
\hline
\end{tabular}
\caption{A table.}
\end{table}
\end{document}
`;
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const d = text(unzip(E.docx).get('word/document.xml'));
  assert.match(d.replace(/<[^>]+>/g, ''), /\[Figure \(tikzpicture\): drawn in the PDF; Rikuy keeps its source\]/);
  const pairs = [['Nested two', 'Nested 2'], ['Its definition.', 'Its meaning.'], ['Third item', 'Third point'], ['>a<', '>alpha<'], ['A table.', 'The table.'], ['1 Lists<', '1 Lists here<'], ['An abstract here.', 'An abstract there.'], ['Trivial.', 'Obvious.'], ['First item with ', 'First entry with '], ['>Doc<', '>Document<']];
  const plan = importInto(edit(E.docx, (x) => pairs.reduce((t, [a, b]) => { assert.ok(t.includes(a), a); return t.replace(a, b); }, x)), files);
  const want = [['An abstract here.', 'An abstract there.'], ['{Lists}', '{Lists here}'], ['First item with', 'First entry with'], ['Nested two', 'Nested 2'], ['Third item', 'Third point'], ['Its definition.', 'Its meaning.'], ['Trivial.', 'Obvious.'], ['\na & 1', '\nalpha & 1'], ['{A table.}', '{The table.}'], ['\\emph{Doc}', '\\emph{Document}']].reduce((t, [a, b]) => t.replace(a, b), src);
  assert.equal(plan.files.get('main.tex'), want);
  assert.equal(plan.stats.skipped + plan.stats.moved + plan.stats.conflicts, 0);
});

await ok('a stranger\'s .docx opens as LaTeX with its equations, table, list, footnote and picture', async () => {
  // written by python-docx (test/word_fixture.py), kept here so npm test needs no Python packages
  const fx = fs.readFileSync(new URL('./fixtures/word-fixture.docx', import.meta.url));
  const r = docxToLatex(P, new Uint8Array(fx), 'fx.docx');
  for (const s of ['\\section{Introduction}', '\\(x^{2} + \\alpha\\)', '\\[\\int_{0}^{1}', '\\begin{itemize}', 'Peru & 3.1', '\\footnote{Data from the World Bank.}', '\\includegraphics[width=0.33\\linewidth', '\\href{https://example.org/data}{online}']) assert.ok(r.tex.includes(s), s);
  assert.ok(!r.tex.includes('javascript'));
  assert.deepEqual(Object.keys(r.media), ['figures/figure1.png']);
  const m = buildModel({ files: new Map([['main.tex', r.tex]]), main: 'main.tex' });
  assert.ok(m.blocks.length > 8);
});

await ok('hostile files: bombs, DTDs, deep nesting, names that climb out, forged Rikuy data', () => {
  // a zip that declares 600 MB is refused before anything is inflated
  const big = zipSync({ '[Content_Types].xml': new Uint8Array(1), 'word/document.xml': new Uint8Array(1), 'a.bin': [new Uint8Array(300e6), { level: 1 }], 'b.bin': [new Uint8Array(300e6), { level: 1 }] });
  assert.throws(() => unzip(big), /unpack to more than/);
  const mk = (xml) => zipSync({ '[Content_Types].xml': new TextEncoder().encode('<Types/>'), 'word/document.xml': new TextEncoder().encode(xml) });
  assert.throws(() => unzip(mk('<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:document>&x;</w:document>')), /DTD/);
  assert.throws(() => parseXml('<a>'.repeat(1000)), /too deeply/);
  assert.equal(parseXml('<a t="&lt;&#x41;&unknown;"/>').c[0].a.t, '<A');
  const parts = unzip(zipSync({ '[Content_Types].xml': new Uint8Array(1), 'word/document.xml': new Uint8Array(1), '../evil.xml': new Uint8Array(1) }));
  assert.ok(![...parts.keys()].some((k) => k.includes('..')));
  // Rikuy data that points outside its files, or names a file outside the project
  const good = { rikuy: 1, name: 'x', main: 'main.tex', files: [['main.tex', 'abc']], anchors: [{ id: 'Rk1', f: 'main.tex', text: 'abc', runs: [[3, 0]] }], atoms: [] };
  assert.equal(checkData(good).anchors.length, 1);
  assert.equal(checkData({ ...good, anchors: [{ id: 'Rk1', f: 'main.tex', text: 'abc', runs: [[3, 5]] }] }).anchors.length, 0);
  assert.equal(checkData({ ...good, anchors: [{ id: 'Rk1', f: 'main.tex', text: 'ab', runs: [[3, 0]] }] }).anchors.length, 0);
  assert.equal(checkData({ ...good, files: [['../../etc/x.tex', 'a'], ['main.tex', 'b']] }), null);
  assert.equal(checkData({ ...good, main: 'other.tex' }), null);
  assert.deepEqual(unpackRuns([[2, 5], [0, 9, 11], [-1, 1], [-2, 0, 1]]), [5, 6, 6, 7, 9, 11, -1, -1, -2, 0]);
  // an equation's text cannot leave math mode or reach the shell: pandoc escapes it, and a formula
  // that still would is refused
  const tex = (xml) => { const r = P.convert({ from: 'docx', to: 'json', 'input-files': ['m.docx'] }, null, { 'm.docx': zipSync({ '[Content_Types].xml': new TextEncoder().encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), '_rels/.rels': new TextEncoder().encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'), 'word/document.xml': new TextEncoder().encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p>' + xml + '</w:p></w:body></w:document>') }) }); return JSON.parse(r.stdout).blocks[0].c.find((x) => x.t === 'Math').c[1]; };
  const t = tex('<m:oMath><m:r><m:t>}\\end{equation}\\immediate\\write18{rm x}$</m:t></m:r></m:oMath>');
  assert.ok(!/\\write|[^\\]\$/.test(t.replace(/\\backslash/g, '')) && safeMath(t) === t, t);
  for (const bad of ['x$ \\input{a}', 'a\\)b', '\\immediate\\write18{x}', '\\end{equation}x', '\\def\\a{b}', 'x^^5cwrite18{id}', '\\ShellEscape{id}', '\\includegraphics{/etc/passwd}', '\\href{javascript:1}{x}']) assert.equal(safeMath(bad), null, bad);
  assert.equal(safeMath('x^{2}+\\frac{a}{b}^{\\prime}'), 'x^{2}+\\frac{a}{b}^{\\prime}');
  assert.equal(safeMath('\\begin{aligned}a&=b\\\\ c&=\\$5\\end{aligned}'), '\\begin{aligned}a&=b\\\\ c&=\\$5\\end{aligned}');
});

await ok('a paragraph deleted in Word before a code listing: the listing is not written a second time', async () => {
  const src = doc('First paragraph.\n\n\\begin{quote}\nA quoted passage.\n\\end{quote}\n\\begin{verbatim}\nx <- lm(y ~ k)\n\\end{verbatim}\nLast paragraph.\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const del = (d) => d.replace(/<w:p>(?:(?!<w:p>)[\s\S])*?A quoted passage\.[\s\S]*?<\/w:p>/, '');
  const plan = importInto(edit(E.docx, del), files);
  assert.equal(plan.files.get('main.tex'), src.replace('\\begin{quote}\nA quoted passage.\n\\end{quote}\n', ''));
  // and words typed after the listing in Word still arrive
  const add = (d) => del(d).replace(/(lm\(y ~ k\)[\s\S]*?<\/w:p>)/, '$1<w:p><w:r><w:t>Typed in Word.</w:t></w:r></w:p>');
  assert.ok(importInto(edit(E.docx, add), files).files.get('main.tex').includes('Typed in Word.'));
});

await ok('to Word: colour, highlight, centred text and a list\'s own labels are kept, and still round trip', async () => {
  const src = doc('\\textcolor{red}{Red words} and \\hl{marked ones} and \\textcolor[HTML]{0F9ED5}{blue}.\n\n\\begin{center}\nA centred line.\n\\end{center}\n\n\\begin{enumerate}[label=(\\alph*)]\n  \\item Alpha\n  \\item Beta\n\\end{enumerate}\n', '\\usepackage{xcolor,soul,enumitem}\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const parts = unzip(E.docx);
  const d = text(parts.get('word/document.xml')), st = text(parts.get('word/styles.xml')), nu = text(parts.get('word/numbering.xml'));
  assert.match(d, /<w:rStyle w:val="ColourFF0000" \/><\/w:rPr><w:t[^>]*>Red words/);
  assert.match(d, /<w:rStyle w:val="Highlight" \/><\/w:rPr><w:t[^>]*>marked ones/);
  assert.match(d, /<w:pStyle w:val="Centred" \/>/);
  assert.match(st, /w:styleId="ColourFF0000">(?:(?!<\/w:style>)[\s\S])*<w:rPr><w:color w:val="FF0000" \/><\/w:rPr><\/w:style>/);
  assert.match(st, /w:styleId="Colour0F9ED5">(?:(?!<\/w:style>)[\s\S])*<w:color w:val="0F9ED5" \/>/);
  assert.match(st, /w:styleId="Highlight">(?:(?!<\/w:style>)[\s\S])*<w:shd [^>]*w:fill="FFFF00" \/>/);
  assert.match(st, /w:styleId="Centred">(?:(?!<\/w:style>)[\s\S])*<w:pPr><w:jc w:val="center" \/><\/w:pPr><\/w:style>/);
  assert.match(nu, /<w:numFmt w:val="lowerLetter" \/><w:lvlText w:val="\(%1\)" \/>/);
  assert.equal(importInto(E.docx, files).files.size, 0);
  await roundTrip(src, (x) => rep('Red words', 'Crimson words')(rep('A centred line.', 'A centred heading.')(x)), src.replace('Red words', 'Crimson words').replace('A centred line.', 'A centred heading.'));
  assert.equal(wordColor('blue!50'), '8080FF');
  assert.equal(wordColor('mycolour'), null);
  assert.deepEqual(listStyle('iv)'), [1, { t: 'DefaultStyle' }, { t: 'DefaultDelim' }]);
  assert.deepEqual(listStyle('3.'), [3, { t: 'Decimal' }, { t: 'Period' }]);
});

// a .docx of one body, as small as pandoc reads: for the cases a line of XML says best
const NSW = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
function tiny(body, extra = {}) {
  const u = (t) => new TextEncoder().encode(t);
  const over = Object.keys(extra).map((k) => '<Override PartName="/' + k + '" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + k.replace(/^word\/|\.xml$/g, '') + '+xml"/>').join('');
  const o = {
    '[Content_Types].xml': u('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' + over + '</Types>'),
    '_rels/.rels': u('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': u('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'),
    'word/document.xml': u('<?xml version="1.0"?><w:document ' + NSW + '><w:body>' + body + '</w:body></w:document>')
  };
  for (const [k, v] of Object.entries(extra)) o[k] = u(v);
  return zipSync(o);
}
const open = (bytes) => docxToLatex(P, new Uint8Array(bytes), 'x.docx');
const bodyOf = (tex) => tex.slice(tex.indexOf('\\begin{document}'));
const wp = (t, ppr = '') => '<w:p>' + ppr + '<w:r><w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>';

await ok('a Word file of what pandoc alone loses: nothing goes without a word, and every command has its package', () => {
  // test/word_fixture.py's make_rich()
  const r = open(fs.readFileSync(new URL('./fixtures/word-rich.docx', import.meta.url)));
  const t = r.tex, b = bodyOf(t);
  // kept, which plain pandoc drops or writes so that LaTeX stops
  assert.ok(t.includes('\\title{Reform and Growth\\\\[0.5ex]\\large Evidence from Peru}'), 'the subtitle');
  for (const s of ['\\tableofcontents', '\\textcolor[HTML]{C00000}{red words}', '\\hl{marked}', '\\uline{under}', '\\sout{struck}',
    'p \\(\\leq\\) 0.05', '\\(\\neq\\) 0', '\\(\\infty\\)', '\\textminus{} 5\\,\\%', 'Ελληνικά, Привет', '\n% comment (Ana P) on "robust": Is it? \\input{/etc/passwd} 50% }\n',
    '\\begin{center}\nCentred line.\n\\end{center}', 'Before the break.\n\n\\newpage', 'See Figure~\\ref{_Ref7} and', '\\label{_Ref7}{}A blue box.}', 'width=1\\linewidth', '\\begin{table}[htbp]\n\\centering\n\\caption{Growth by region}\n\\begin{tabular}',
    '\\multirow{2}{*}{Region}', 'South & 3 & \\begin{tabular}{@{}ll@{}}', '\\begin{aligned}\nx &= 1 \\\\\ny &= 2 + x \\\\\nz &= 3\n\\end{aligned}', '\\begin{equation}\nE = mc^{2}\n\\end{equation}', '\\begin{equation}\nF = ma\n\\tag{7}\n\\end{equation}', '\\footnote{The endnote text.}', 'The result is strong and'])
    assert.ok(b.includes(s), s + '\n' + b);
  for (const s of ['Stale entry', '\\ul{', '\\st{', 'longtable', 'Figure 1:', 'Table 1:', 'weak']) assert.ok(!b.includes(s), s);
  // every command the body uses is defined by the preamble: these were undefined before
  for (const [cmd, pkg] of [['\\multirow', '{multirow}'], ['\\hl{', '\\DeclareRobustCommand{\\hl}'], ['\\uline{', '[normalem]{ulem}'], ['\\textcolor', '{xcolor}'], ['\\ref{', '{hyperref}'], ['\\toprule', '{booktabs}'], ['Ελ', '\\usepackage{textalpha}'], ['Привет', '\\DeclareTextSymbolDefault']])
    assert.ok(b.includes(cmd) && t.slice(0, t.indexOf('\\begin{document}')).includes(pkg), cmd);
  assert.match(t, /\\usepackage\[LGR,T2A,T1\]\{fontenc\}/);
  assert.match(t, /\\documentclass\[11pt\]\{article\}\n\\usepackage\[letterpaper,[^\]]*\]\{geometry\}/);
  assert.ok(!/[\uE000-\uE01F]/.test(t), 'no mark is left in the source');
  assert.ok(isBalanced(t, 0, t.length));
  // told: in the result and at the top of the source
  const said = r.warnings.join(' ');
  for (const s of ['Chinese or Japanese: 你好', '1 chart', 'the header and footer text (“Draft: do not cite”)', '1 Word comment came in', '2 tracked changes in the file were accepted', 'Endnotes are footnotes', 'table of contents is LaTeX', '2 equations typed with a number'])
    assert.ok(said.includes(s), s + '\n' + said);
  assert.ok(t.startsWith('% Opened from a Word file by Rikuy.\n% - Not kept: 2 characters pdfLaTeX has no font'));
  // and the page reads it: a title, the contents, a page break, three floats, no raw source
  const m = buildModel({ files: new Map([['main.tex', t]]), main: 'main.tex' });
  const kinds = m.blocks.flatMap((u) => u.items.map((x) => x.type));
  for (const k of ['title', 'toc', 'pagebreak', 'float', 'math']) assert.ok(kinds.includes(k), k);
  assert.ok(!kinds.includes('raw'), kinds.join(' '));
});

await ok('comments with replies, a short field, a field that never ends, colour that is the ink, marks a file brings itself', () => {
  const cm = '<w:comments ' + NSW + ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:comment w:id="3" w:author="Ana"><w:p w14:paraId="A1"><w:r><w:t>Cite it.</w:t></w:r></w:p></w:comment><w:comment w:id="4" w:author="Ben"><w:p w14:paraId="B2"><w:r><w:t>Done.</w:t></w:r></w:p></w:comment><w:comment w:id="5" w:author="Cy"><w:p w14:paraId="C3"><w:r><w:t>No range.</w:t></w:r></w:p></w:comment></w:comments>';
  const ex = '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="A1" w15:done="0"/><w15:commentEx w15:paraId="B2" w15:paraIdParent="A1" w15:done="0"/></w15:commentsEx>';
  const body = '<w:p><w:r><w:t xml:space="preserve">The </w:t></w:r><w:commentRangeStart w:id="3"/><w:commentRangeStart w:id="4"/><w:r><w:t>claim</w:t></w:r><w:commentRangeEnd w:id="3"/><w:commentRangeEnd w:id="4"/><w:r><w:t xml:space="preserve"> holds, see </w:t></w:r><w:fldSimple w:instr=" REF _Ref1 \\h "><w:r><w:t>Table 2</w:t></w:r></w:fldSimple><w:r><w:t>.</w:t></w:r><w:r><w:commentReference w:id="5"/></w:r></w:p>'
    + wp('Second paragraph.');
  const r = open(tiny(body, { 'word/comments.xml': cm, 'word/commentsExtended.xml': ex }));
  assert.ok(bodyOf(r.tex).includes('The claim holds, see Table 2.\n% comment (Ana) on "claim": Cite it.\n% reply (Ben): Done.\n% comment (Cy): No range.\n\nSecond paragraph.'), r.tex);
  assert.ok(r.warnings.some((w) => /^2 Word comments came in/.test(w)), r.warnings.join('|'));
  // plain pandoc on the same file: neither the comments nor the field's text
  const raw = P.convert({ from: 'docx', to: 'latex', 'input-files': ['in.docx'], wrap: 'none' }, null, { 'in.docx': tiny(body, { 'word/comments.xml': cm }) }).stdout;
  assert.ok(!raw.includes('Table 2') && !raw.includes('Cite it'), raw);
  // a TOC field with no end takes no text with it; one that ends goes as a whole
  const toc = (end) => '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:hyperlink w:anchor="_Toc1"><w:r><w:t>Old entry 4</w:t></w:r></w:hyperlink></w:p>' + (end ? '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' : '') + wp('Real text.') + wp('More text.');
  assert.ok(bodyOf(open(tiny(toc(true))).tex).includes('\\tableofcontents\n\nReal text.\n\nMore text.'));
  const open2 = bodyOf(open(tiny(toc(false))).tex);
  assert.ok(open2.includes('Real text.') && open2.includes('More text.') && !open2.includes('\\tableofcontents'), open2);
  // one colour over the whole text is the ink of the document, not a colour
  const col = (c, t) => '<w:p><w:r><w:rPr><w:color w:val="' + c + '"/></w:rPr><w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>';
  const ink = bodyOf(open(tiny(col('1F4E79', 'All of the text is dark blue here.') + col('1F4E79', 'And here too, with ') + col('FF0000', 'red'))).tex);
  assert.ok(!ink.includes('1F4E79') && ink.includes('\\textcolor[HTML]{FF0000}{red}'), ink);
  // not a colour, nearly black: left alone
  assert.ok(!/textcolor/.test(open(tiny(col('zzzzzz', 'a') + col('101010', 'b') + wp('c'))).tex));
  // private use characters of the file's own are not read as marks (a page break, a colour)
  const own = open(tiny(wp('A\uE004B \uE005\uE010\uE010\uE010\uE010\uE010\uE010\uE001C\uE006 \uE000\uE011\uE001D \uE003\uE010\uE001')));
  assert.ok(bodyOf(own.tex).includes('AB C D') && !/newpage|textcolor|tableofcontents|% comment/.test(own.tex), own.tex);
  // a page break inside a table cell has no place: it goes, the row stays whole
  const cell = open(tiny('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t><w:br w:type="page"/></w:r></w:p></w:tc><w:tc>' + wp('b') + '</w:tc></w:tr></w:tbl>'));
  assert.ok(/a & b \\\\/.test(cell.tex) && !cell.tex.includes('\\newpage'), cell.tex);
});

await ok('files that are not a .docx say what they are; a part cut short is an error, not half a document', () => {
  const u = (t) => new TextEncoder().encode(t);
  const pad = (b) => { const o = new Uint8Array(64); o.set(b); return o; };
  assert.throws(() => open(pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), /old Word format \(\.doc\)[\s\S]*save it as "Word Document/);
  assert.throws(() => open(pad(u('{\\rtf1\\ansi hello}'))), /Rich Text file \(\.rtf\)/);
  assert.throws(() => open(zipSync({ mimetype: u('application/vnd.oasis.opendocument.text'), 'content.xml': u('<a/>') })), /OpenDocument text \(\.odt\)/);
  assert.throws(() => open(zipSync({ '[Content_Types].xml': u('<Types/>'), 'xl/workbook.xml': u('<a/>') })), /Excel file/);
  assert.throws(() => open(new Uint8Array(0)), /empty/);
  assert.throws(() => parseXml('<a><b></a>', undefined, true), /well formed/);
  assert.throws(() => parseXml('<a><b>', undefined, true), /well formed/);
  assert.equal(parseXml('<a><b/>t</a>', undefined, true).c[0].c.length, 2);
  // word/document.xml cut in the middle: pandoc refuses it and so does Rikuy (never the first half)
  const whole = unzip(tiny(wp('One.') + wp('Two.') + wp('Three.')));
  const d = text(whole.get('word/document.xml'));
  whole.set('word/document.xml', d.slice(0, d.indexOf('Two.') + 2));
  assert.throws(() => open(zip(whole)), /damaged: its text \(word\/document\.xml\) is cut short/);
  // an empty document opens, and says so
  assert.ok(open(tiny('')).warnings.includes('The Word file has no text.'));
});

await ok('bookmarks nothing refers to are not labels: a Rikuy export opened as a stranger\'s file compiles; an author\'s footnote is \\thanks', () => {
  const src = doc('\\maketitle\n\\section{One}\\label{sec:one}\nText in Section~\\ref{sec:one}.\\footnote{A note.}\n', '\\title{A \\emph{Title}}\n\\author{Ana\\thanks{Lima.} \\and Ben}\n');
  const E = exportFiles(new Map([['main.tex', src]]));
  const r = open(E.docx);
  assert.ok(!/\\label\{Rk\d+\}|phantomsection|\{\}/.test(r.tex), r.tex);
  assert.ok(r.tex.includes('\\title{A \\emph{Title}}\n\\author{Ana\\thanks{Lima.} \\and Ben}'), r.tex);
  assert.ok(r.tex.includes('\\footnote{A note.}'));
  // Word's own leftovers (_GoBack, _Hlk) go the same way; a bookmark a link names stays
  const bm = (n, t) => '<w:bookmarkStart w:id="1" w:name="' + n + '"/><w:r><w:t xml:space="preserve">' + t + '</w:t></w:r><w:bookmarkEnd w:id="1"/>';
  const t2 = open(tiny('<w:p>' + bm('_Hlk123', 'Marked ') + bm('target', 'place') + '</w:p><w:p><w:hyperlink w:anchor="target"><w:r><w:t>go there</w:t></w:r></w:hyperlink></w:p>')).tex;
  assert.ok(!t2.includes('_Hlk123') && t2.includes('\\label{target}') && t2.includes('\\hyperref[target]{go there}') && t2.includes('{hyperref}'), t2);
});

await ok('a document mostly in a script TeX Live has no default font for is set up for XeLaTeX, and says so', () => {
  const r = open(tiny(wp('研究表明，制度变迁对经济增长具有显著影响。本文利用秘鲁的数据进行了检验，结果稳健。政策含义在最后一节讨论。') + wp('Latin too.')));
  assert.match(r.tex, /\\usepackage\{fontspec\}/);
  assert.ok(!/fontenc/.test(r.tex));
  assert.ok(/^Not kept: a font for \d+ characters \(Chinese or Japanese: /.test(r.warnings[0]), r.warnings[0]);
});

await ok('the page\'s model: colours by number and by \\definecolor, in text and in formulas; a list and a table in a table cell', () => {
  const src = doc('A \\textcolor[HTML]{0f9ed5}{blue}, \\textcolor{key}{key}, \\colorbox{soft}{soft}, \\colorbox[RGB]{255,255,0}{y}, \\textcolor{red}{r}, \\textcolor{bad}{b}, \\textcolor[HTML]{url(x)}{w}, {\\color[rgb]{1,0,0} d}.\n'
    + 'Math $\\textcolor[HTML]{0F9ED5}{x} + \\textcolor{key}{y} + {\\color{key} z} + \\textcolor{red}{w} + \\textcolor[HTML]{zz}{v}$.\n\n'
    + '\\begin{tabular}{ll}\n\\begin{itemize}\n\\tightlist\n\\item\n  one \\textbf{b}\n\\item two\n  \\begin{enumerate}\n  \\def\\labelenumi{\\arabic{enumi}.}\n  \\item deep\n  \\end{enumerate}\n\\end{itemize} & \\begin{tabular}{ll}\nin1 & \\cellcolor[HTML]{FFFF00} in2 \\\\\n\\end{tabular} \\\\\n'
    + '\\begin{itemize} stray \\item x \\end{itemize} & \\begin{itemize}\\item y\\footnote{n}\\end{itemize} \\\\\n\\end{tabular}\n',
  '\\usepackage{xcolor}\n\\definecolor{key}{HTML}{C00000}\n\\definecolor{soft}{rgb}{0.9,0.95,1}\n\\definecolor{bad}{HTML}{url(x)}\n\\definecolor{worse}{RGB}{300,0,0}\n');
  const m = buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
  const items = m.blocks.flatMap((u) => u.items);
  const cols = items[0].inl.filter((x) => x.k === 'sty').map((x) => x.st + ' ' + x.color);
  // a colour is #RRGGBB or the text as written, which the page takes only as a name it knows
  assert.deepEqual(cols, ['color #0F9ED5', 'color #C00000', 'bg #E6F2FF', 'bg #FFFF00', 'color red', 'color bad', 'color url(x)', 'color #FF0000']);
  assert.equal(items[0].inl.find((x) => x.k === 'math').tex, '\\textcolor{#0F9ED5}{x} + \\textcolor{#C00000}{y} + {\\color{#C00000} z} + \\textcolor{red}{w} + \\textcolor[HTML]{zz}{v}');
  for (const [mdl, spec, want] of [['HTML', 'C00000', '#C00000'], ['HTML', 'C0000', null], ['HTML', 'red;x', null], ['RGB', '160, 43, 147', '#A02B93'], ['RGB', '256,0,0', null], ['RGB', '1,2', null], ['rgb', '0,0.5,1', '#0080FF'], ['rgb', '1.5,0,0', null], ['rgb', '1e3,0,0', null], ['cmyk', '0,0,0,1', null], ['HTML', 'url(//x)', null]])
    assert.equal(colorValue(mdl, spec), want, mdl + ' ' + spec);
  // the cells: a plain list and an inner table are drawn; the others are as before
  const rows = items.find((x) => x.type === 'float' || x.type === 'tabular');
  const tab = rows.type === 'tabular' ? rows : rows.parts.find((p) => p.type === 'tabular');
  const [c00, c01] = tab.rows[0].cells, [c10, c11] = tab.rows[1].cells;
  const chip = (c) => c.inl.find((x) => x.k === 'chip');
  assert.equal(chip(c00).list.ordered, false);
  assert.equal(chip(c00).list.items.length, 2);
  assert.equal(chip(c00).list.items[1].find((x) => x.k === 'chip').list.ordered, true);
  assert.ok(!chip(c00).err && chip(c00).s >= 0 && src.slice(chip(c00).s, chip(c00).e).startsWith('\\begin{itemize}') && src.slice(chip(c00).s, chip(c00).e).endsWith('\\end{itemize}'));
  assert.equal(chip(c01).table.rows[0].cells.length, 2);
  assert.equal(chip(c01).table.rows[0].cells[1].bg, '#FFFF00');
  assert.ok(chip(c10).err && chip(c10).text === '\\item' && !chip(c10).list, 'text before the first item: as before');
  assert.ok(!c11.inl.some((x) => x.k === 'chip' && x.list), 'a footnote in the list: as before');
  // outside a table's cell nothing changes
  const m2 = buildModel({ files: new Map([['main.tex', doc('Text \\begin{tabular}{l}a\\end{tabular} more.\n')]]), main: 'main.tex' });
  assert.ok(!m2.blocks.flatMap((u) => u.items).some((it) => (it.inl || []).some((x) => x.k === 'chip' && (x.table || x.list))));
});

await ok('to Word: a formula with colour stays a Word equation; a colour the preamble defines is kept', () => {
  const src = doc('Then $\\textcolor{red}{x} + \\textcolor[HTML]{0F9ED5}{y^2} + {\\color{key} z}$ and \\textcolor{key}{key words}.\n\\[ \\textcolor{key}{E} = mc^2 \\]\n', '\\usepackage{xcolor}\n\\definecolor{key}{HTML}{C00000}\n');
  const files = new Map([['main.tex', src]]);
  const m = buildModel({ files, main: 'main.tex' });
  const W = buildWordDoc(m, files, { now: 0 });
  assert.ok(W.degraded.some((d) => /a formula without its colours \(2\)/.test(d)), W.degraded.join('|'));
  const E = exportFiles(files);
  const d = text(unzip(E.docx).get('word/document.xml'));
  assert.equal((d.match(/<m:oMath>/g) || []).length, 2);
  assert.ok(!d.includes('textcolor') && !/\$[^<]*\$/.test(d.replace(/<[^>]+>/g, '')), 'no formula left as TeX text');
  assert.match(d, /<w:rStyle w:val="ColourC00000" \/><\/w:rPr><w:t[^>]*>key words/);
  assert.equal(importInto(E.docx, files).files.size, 0);
  assert.equal(uncolor('\\textcolor{red}{x}+{\\color[HTML]{C00000} y}+\\frac{a}{b}'), '{x}+{ y}+\\frac{a}{b}');
});

await ok('code keeps no colour marks: a file pandoc wrote with highlighted code opens as plain verbatim', () => {
  // as pandoc, Quarto and R Markdown write code: Source Code paragraphs, a coloured character style per token
  const made = P.convert({ from: 'markdown', to: 'docx', 'output-file': 'out.docx', 'highlight-style': 'pygments' }, 'Text with `inline code` and **bold**.\n\n```python\nimport os\nx = "a string"  # comment\n```\n\nAfter.\n', {}).files['out.docx'];
  assert.match(text(unzip(made).get('word/document.xml')), /<w:rStyle w:val="ImportTok" \/>/);
  const r = open(made);
  assert.ok(bodyOf(r.tex).includes('\\begin{verbatim}\nimport os\nx = "a string"  # comment\n\\end{verbatim}'), r.tex);
  assert.ok(bodyOf(r.tex).includes('\\texttt{inline\\ code}') && !/textcolor|xcolor/.test(r.tex), r.tex);
  // and a mark that gets into code all the same (here a page break inside a listing and inside an
  // inline code span) is dropped there, not printed as \newpage
  const br = edit(made, (d) => d.replace('<w:t xml:space="preserve">import</w:t>', '<w:t xml:space="preserve">import</w:t><w:br w:type="page"/>').replace(/(<w:rStyle w:val="VerbatimChar" \/><\/w:rPr>)<w:t/, '$1<w:br w:type="page"/><w:t'));
  const t2 = open(br).tex;
  assert.ok(!/newpage|[\uE000-\uE01F]/.test(t2) && t2.includes('\\begin{verbatim}\nimport os\n') && /\\texttt\{inline\\ code\}/.test(t2), t2);
  // a direct colour on a run of code, and on a run in a code style of Word's own
  const col = edit(made, (d) => d.replace(/<w:rStyle w:val="(NormalTok|VerbatimChar)" \/>/g, '<w:rStyle w:val="$1" /><w:color w:val="FF0000" />'));
  assert.ok(!/textcolor/.test(open(col).tex));
});

console.log('word: ' + n + ' groups of checks passed');
