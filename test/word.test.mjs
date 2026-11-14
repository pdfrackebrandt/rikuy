// Word support (src/docx.js, src/wordast.js, src/wordsync.js, src/wordjobs.js) with the real pandoc
// (npm's pandoc-wasm, through src/pandoc.js as the worker runs it): a project exported to .docx and
// read back unchanged gives no edit; each block's bookmark and text survive; text edited in the
// .docx comes back as the smallest source patch on the tricky cases (escaped %, $ and &, \emph,
// accents, a change across formatting, footnotes, citations, equations); an edit of text the owner
// changed since is a conflict, not applied; hostile files are refused. Chinese and Arabic: a Word
// file in either opens with the preamble lines of src/scripts.js and its text as it is, right to
// left paragraphs and all; a document in either goes to Word with its runs, paragraphs, tables
// and section marked as Word wants them (the XML is checked), and comes back the same. India's
// nine scripts the same way: set up on opening with every mark and joiner kept, each run's font
// and language written for Word on saving, an edit of one word one small patch.
// Japanese, Korean, Hebrew, Thai and Sinhala as well: Hebrew right to left as Arabic is, the East
// Asian font and language of the defaults the document's own, Thai edited by its words.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel, colorValue } from '../src/model.js';
import { buildWordDoc, expandMath, unpackRuns, wordColor, listStyle, uncolor } from '../src/wordast.js';
import { createPandoc } from '../src/pandoc.js';
import { exportDocx, readDocx, docxToLatex } from '../src/wordjobs.js';
import { checkData, planImport, unpackRead, rebase, textHunks, mathPatch, stripNumbers, safeMath } from '../src/wordsync.js';
import { unzip, zip, extract, parseXml, readRikuyPart, text } from '../src/docx.js';
import { isBalanced } from '../src/parser.js';
import { scriptNeeds, scriptLines, addScriptSetup, rtlDocument, INDIC } from '../src/scripts.js';
import { scanDir, resolve } from '../src/wordbidi.js';
import { zipSync } from 'fflate';
import { pageForWord } from '../src/pageword.js';
import { hfPlaces } from '../src/wordpage.js';

const P = await createPandoc(fs.readFileSync(new URL('../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url)));
let n = 0;
const ok = (name, f) => Promise.resolve(f()).then(() => { n++; }, (e) => { console.error('FAIL', name); throw e; });

const doc = (body, pre = '') => '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{natbib}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
const BIB = '@book{knuth1984, author={Knuth, Donald E.}, title={The TeXbook}, publisher={Addison-Wesley}, year={1984}}\n';

function exportFiles(files, main = 'main.tex') {
  const m = buildModel({ files, main });
  const bibs = [...files.keys()].filter((x) => /\.bib$/.test(x));
  const citeproc = bibs.length > 0 && m.cites.length > 0;
  const W = buildWordDoc(m, files, { citeproc, now: 0, main });
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

await ok('a LaTeX paragraph goes to Word as plain code with a read only bookmark: edits there come back as a comment under it, not as words elsewhere', async () => {
  const src = doc('First paragraph.\n\n% rikuy: latex\nRaw \\textbf{bold} 50\\% & $x^2$\n  second line\n\nLast paragraph.\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  assert.equal(E.lost, 0);
  const xml = text(unzip(E.docx).get('word/document.xml'));
  // as source, in the code paragraph style, one Word line for each of its lines; the mark is not in it
  assert.ok(/SourceCode/.test(xml) && xml.includes('Raw \\textbf{bold} 50\\% &amp; $x^2$') && xml.includes('  second line') && !xml.includes('rikuy'), xml.slice(xml.indexOf('Raw') - 300, xml.indexOf('Raw') + 200));
  // unchanged, nothing changes; a word changed in the paragraph after it arrives, the LaTeX paragraph stays as it was
  assert.equal(importInto(E.docx, files).files.size, 0);
  await roundTrip(src, rep('Last paragraph.', 'Last words.'), src.replace('Last paragraph.', 'Last words.'));
  const texts = (t) => buildModel({ files: new Map([['main.tex', t]]), main: 'main.tex' }).blocks.flatMap((x) => x.items).filter((x) => x.type === 'tex').map((x) => x.text);
  // Changed in Word inside the code (a word added, letters added, a word deleted, a line changed):
  // nothing of it is written anywhere, a comment under the paragraph's last line says so, and the
  // mark still marks the same paragraph. (A code block with no bookmark of its own belonged in
  // Word to the paragraph before it: added words went there, "First paragraph.new".)
  for (const [what, a, b] of [['a word added', 'Raw ', 'Raw new '], ['letters added', 'Raw ', 'Rawer '], ['a word deleted', '  second line', '  line'], ['a line changed', 'second line', 'other line']]) {
    const got = importInto(edit(E.docx, rep(a, b)), files).files.get('main.tex');
    assert.ok(/^  second line\n% comment \(Ana\)[^\n]*: In Word, a LaTeX paragraph was changed: .*Not applied: it is changed as its LaTeX, on the page or in the source\.$/m.test(got), what + ': ' + got);
    assert.equal(got.replace(/^% comment \(Ana\).*\n/m, ''), src, what);
    assert.equal(texts(got)[0].split('\n% comment')[0], 'Raw \\textbf{bold} 50\\% & $x^2$\n  second line', what);
  }
  // a verbatim listing is protected the same way
  const vsrc = doc('First paragraph.\n\n\\begin{verbatim}\nx <- lm(y)\n\\end{verbatim}\n\nLast paragraph.\n');
  const vfiles = new Map([['main.tex', vsrc]]);
  const V = exportFiles(vfiles);
  const vgot = importInto(edit(V.docx, rep('x &lt;- lm(y)', 'x &lt;- glm(y)')), vfiles).files.get('main.tex');
  assert.ok(/\\end\{verbatim\}\n% comment \(Ana\)[^\n]*: In Word, a code listing was changed: .*Not applied/.test(vgot) && vgot.replace(/^% comment \(Ana\).*\n/m, '') === vsrc && !vgot.includes('glm'), vgot);
});

await ok('a paragraph deleted in Word just before a LaTeX paragraph leaves its mark on a line of its own', async () => {
  const del = (needle) => (d) => d.replace(new RegExp('<w:p>(?:(?!<w:p>)[\\s\\S])*?' + needle + '[\\s\\S]*?</w:p>'), '');
  for (const body of ['First paragraph.\n\n% rikuy: latex\nRaw \\textbf{x}\n\nLast.\n', '\\section{A}\nFirst paragraph.\n\n% rikuy: latex\nRaw \\textbf{x}\n\nLast.\n', 'Zero.\n\nFirst paragraph.\n\n% rikuy: latex\nRaw \\textbf{x}\n\nLast.\n']) {
    const src = doc(body), files = new Map([['main.tex', src]]);
    const got = importInto(edit(exportFiles(files).docx, del('First paragraph')), files).files.get('main.tex');
    // (joined to \begin{document} or the heading's line, the mark had marked nothing)
    assert.ok(/(^|\n)% rikuy: latex\nRaw/.test(got) && !got.includes('First paragraph'), got);
    assert.deepEqual(buildModel({ files: new Map([['main.tex', got]]), main: 'main.tex' }).blocks.flatMap((x) => x.items).filter((x) => x.type === 'tex').map((x) => x.text), ['Raw \\textbf{x}']);
  }
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

// (B7) merged cells: Word's own spans, both ways
await ok('to Word: a cell merged across (\\multicolumn) and one merged down (\\multirow) are Word\'s merged cells, and opened again they are LaTeX\'s', async () => {
  const src = doc('\\begin{table}[h]\n\\centering\n\\begin{tabular}{lll}\n\\toprule\n\\multicolumn{2}{c}{Wide head} & Last \\\\\n\\midrule\n\\multirow{2}{*}{Tall} & b1 & c1 \\\\\n & b2 & c2 \\\\\n\\bottomrule\n\\end{tabular}\n\\caption{Spans}\n\\end{table}\n', '\\usepackage{booktabs,multirow}\n');
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  const d = text(unzip(E.docx).get('word/document.xml'));
  assert.match(d, /<w:gridSpan w:val="2" \/>(?:(?!<\/w:tc>)[\s\S])*Wide head/);
  assert.match(d, /<w:vMerge w:val="restart" \/>(?:(?!<\/w:tc>)[\s\S])*Tall/);
  assert.match(d, /<w:vMerge w:val="continue" \/>/);
  // every cell's words where they were; nothing changed, nothing to bring back
  for (const w of ['Wide head', 'Last', 'Tall', 'b1', 'c1', 'b2', 'c2']) assert.ok(d.includes('>' + w + '<'), w);
  assert.equal(importInto(E.docx, files).files.size, 0);
  // an edit in a merged cell comes back to it
  await roundTrip(src, rep('>Tall<', '>Taller<'), src.replace('{Tall}', '{Taller}'));
  // opened as a stranger's file: LaTeX's merged cells again
  const t = bodyOf(open(E.docx).tex);
  assert.ok(/\\multicolumn\{2\}\{(?:[^{}]|\{\})*\}\{%?\s*Wide head\}/.test(t), t);
  assert.ok(/\\multirow\{2\}\{\*\}\{Tall\}/.test(t), t);
});


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
  // (the header is kept now, as fancyhdr's: task 44)
  assert.ok(t.slice(0, t.indexOf('\\begin{document}')).includes('\\usepackage{fancyhdr}\n') && t.includes('\\fancyhead[L]{Draft: do not cite}'), 'the header');
  for (const s of ['Armenian: Հայ', '1 chart', '1 Word comment came in', '2 tracked changes in the file were accepted', 'Endnotes are footnotes', 'table of contents is LaTeX', '2 equations typed with a number'])
    assert.ok(said.includes(s), s + '\n' + said);
  assert.ok(t.startsWith('% Opened from a Word file by Rikuy.\n% - Not kept: 3 characters pdfLaTeX has no font'));
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
  const r = open(tiny(wp('ქართული ენა ერთ-ერთი უძველესი ენაა მსოფლიოში. იგი საქართველოს სახელმწიფო ენაა და მას საკუთარი დამწერლობა აქვს.') + wp('Latin too.')));
  assert.match(r.tex, /\\usepackage\{fontspec\}/);
  assert.ok(!/fontenc|ctex|babel/.test(r.tex));
  assert.ok(/^Not kept: a font for \d+ characters \(Georgian: /.test(r.warnings[0]), r.warnings[0]);
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
  assert.ok(bodyOf(r.tex).includes('\\texttt{inline code}') && !/textcolor|xcolor/.test(r.tex), r.tex);
  // and a mark that gets into code all the same (here a page break inside a listing and inside an
  // inline code span) is dropped there, not printed as \newpage
  const br = edit(made, (d) => d.replace('<w:t xml:space="preserve">import</w:t>', '<w:t xml:space="preserve">import</w:t><w:br w:type="page"/>').replace(/(<w:rStyle w:val="VerbatimChar" \/><\/w:rPr>)<w:t/, '$1<w:br w:type="page"/><w:t'));
  const t2 = open(br).tex;
  assert.ok(!/newpage|[\uE000-\uE01F]/.test(t2) && t2.includes('\\begin{verbatim}\nimport os\n') && /\\texttt\{inline code\}/.test(t2), t2);
  // a direct colour on a run of code, and on a run in a code style of Word's own
  const col = edit(made, (d) => d.replace(/<w:rStyle w:val="(NormalTok|VerbatimChar)" \/>/g, '<w:rStyle w:val="$1" /><w:color w:val="FF0000" />'));
  assert.ok(!/textcolor/.test(open(col).tex));
});

await ok('names from the document that every object has (constructor, __proto__) are unknown names, not lookups that hit', () => {
  for (const c of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf!50', 'Constructor']) assert.equal(wordColor(c), null, c);
  assert.equal(wordColor('Red!50'), 'FF8080');
  // Save as Word with such a colour name: the text without the colour, said so; no throw
  const src = doc('A \\textcolor{constructor}{word}, \\colorbox{__proto__}{two}, \\textcolor{toString!30}{three} and $\\textcolor{hasOwnProperty}{x}$.\n', '\\usepackage{xcolor}\n\\definecolor{__proto__}{HTML}{C00000}\n\\definecolor{constructor}{rgb}{2,0,0}\n');
  const files = new Map([['main.tex', src]]);
  const m = buildModel({ files, main: 'main.tex' });
  const W = buildWordDoc(m, files, { now: 0 });
  assert.ok(W.degraded.some((d) => /text in a colour the preamble defines, without the colour \(2\)/.test(d)), W.degraded.join('|'));
  const d = text(unzip(exportFiles(files).docx).get('word/document.xml'));
  assert.ok(d.includes('word') && d.includes('three') && /<w:rStyle w:val="ShadeC00000" \/>/.test(d), 'the defined one keeps its shade');
  // a Word file whose text, styles, bookmarks and comment ids are such names opens like any other
  const odd = open(tiny('<w:p><w:pPr><w:pStyle w:val="constructor"/></w:pPr><w:bookmarkStart w:id="1" w:name="__proto__"/><w:r><w:rPr><w:rStyle w:val="toString"/></w:rPr><w:t>Odd \u2264 names</w:t></w:r><w:bookmarkEnd w:id="1"/><w:commentRangeStart w:id="constructor"/></w:p><w:p><w:hyperlink w:anchor="constructor"><w:r><w:t>link</w:t></w:r></w:hyperlink></w:p>'));
  assert.ok(bodyOf(odd.tex).includes('Odd \\(\\leq\\) names\n\nlink'), odd.tex);
});


// ---- Chinese and Arabic ----------------------------------------------------------------------

const fixture = (name) => open(fs.readFileSync(new URL('./fixtures/' + name, import.meta.url)));
const preambleOf = (tex) => tex.slice(tex.indexOf('\\documentclass'), tex.indexOf('\\begin{document}'));
// what a main file must have had added: exactly the lines src/scripts.js gives, nothing more to add
function setUp(tex, lines) {
  const pre = preambleOf(tex);
  for (const l of lines) assert.ok(pre.split('\n').includes(l), l + '\n' + pre);
  assert.equal(pre.split('\n').filter((l) => /ctex|[bB]abel|labelitemi|fontspec|fontenc|inputenc|lmodern|textalpha|setmainfont/.test(l)).length, lines.length, pre);
  assert.deepEqual([...scriptNeeds(tex, [tex])], []);
  assert.equal(addScriptSetup(tex, scriptNeeds(tex, [tex])), null);
}
const BABEL = '\\usepackage[english, bidi=basic]{babel} % LuaLaTeX orders right to left text by itself';
const AR = ['\\babelprovide[import, onchar=ids fonts]{arabic}', '\\babelfont[arabic]{rm}[Renderer=Harfbuzz]{Amiri}', '\\babelfont[arabic]{sf}[Renderer=Harfbuzz]{Amiri}', '\\babelfont[arabic]{tt}[Renderer=Harfbuzz]{Amiri}'];
const AR_MAIN = ['\\babelprovide[import, main]{arabic}', '\\babelfont{rm}[Renderer=Harfbuzz]{Amiri}', '\\babelfont{sf}[Renderer=Harfbuzz]{Amiri}', '\\babelfont{tt}[Renderer=Harfbuzz]{Amiri}'];
const ZH = ['\\babelprovide[import, onchar=ids fonts]{chinese}', '\\babelfont[chinese]{rm}{FandolSong}', '\\babelfont[chinese]{sf}{FandolHei}', '\\babelfont[chinese]{tt}{FandolFang}'];
const CTEX = '\\usepackage[scheme=plain]{ctex} % Chinese text, set with XeLaTeX';
const paras = (d) => d.slice(d.indexOf('<w:body>')).split(/<w:p>|<w:p (?=[^>]*>)/).slice(1).map((x) => x.split('</w:p>')[0]);
const textOf = (x) => unescape(x.replace(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g, '').replace(/<[^>]+>/g, ''));
const unescape = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const exported = (E) => { const parts = unzip(E.docx); return { d: text(parts.get('word/document.xml')), st: text(parts.get('word/styles.xml')), se: text(parts.get('word/settings.xml')), fn: parts.has('word/footnotes.xml') ? text(parts.get('word/footnotes.xml')) : '' }; };
const defaults = (st) => /<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/.exec(st)[0].replace(/\s+/g, ' ');

await ok('a Chinese Word file opens as a ctex document: every character as it is, no space between its runs, nothing listed as lost', () => {
  const r = fixture('word-chinese.docx');
  const t = r.tex, b = bodyOf(t);
  setUp(t, [CTEX]);
  assert.equal(rtlDocument(t), false);
  assert.match(t, /\\documentclass\[11pt\]\{article\}\n\\usepackage\[letterpaper[^\]]*\]\{geometry\}\n\\usepackage\[scheme=plain\]\{ctex\}/);
  // eight runs of four fonts and two languages: one sentence, the comment under it
  assert.ok(t.includes('\n\\title{制度变迁与经济增长}\n'));
  for (const s of ['\\section{引言}', '\\subsection{数据与方法}',
    '\n本文研究\\textbf{制度变迁}对\\emph{经济增长}的影响，数据来自World Bank（2020年），结果稳健。\\footnote{数据来自\\textbf{世界银行}。}\n% comment (王芳) on "稳健": 请引用文献。\n',
    // Chinese quotation marks, the long dash and the dots stay characters (pandoc alone writes ``, --- and \ldots)
    '\n他说：\u201c制度\u2018很\u2019重要\u201d\u2014\u2014见《经济学》、〈导论〉\u2026\u2026全角\u3000空格！ＡＢＣ１２３；繁體字：經濟學。\n',
    '\\begin{itemize}\n\\item\n  第一项：数据\n\\item\n  第二项：方法\n\\end{itemize}', '\\item\n  步骤一\n\\item\n  步骤二\n\\end{enumerate}',
    '国家 & 增长率 \\\\\n\\midrule\n秘鲁 & 3.1 \\\\\n智利 & 2.4 \\\\', '\nThe model (模型) uses GDP 数据 from 2020 to 2024.\n'])
    assert.ok(b.includes(s), s + '\n' + b);
  assert.ok(!/\\ldots|``|---|\\RL|otherlanguage/.test(b), b);
  assert.deepEqual(r.warnings, ['1 Word comment came in as a comment under its text.']);
  assert.ok(isBalanced(t, 0, t.length) && !/[\uE000-\uE01F]/.test(t));
  const m = buildModel({ files: new Map([['main.tex', t]]), main: 'main.tex' });
  const kinds = m.blocks.flatMap((u) => u.items.map((x) => x.type));
  assert.ok(kinds.includes('title') && kinds.includes('float') && !kinds.includes('raw'), kinds.join(' '));
});

await ok('an Arabic Word file opens as a right to left document: text in the order it is read, marks and joiners kept, each alignment at its own edge', () => {
  const r = fixture('word-arabic.docx');
  const t = r.tex, b = bodyOf(t);
  setUp(t, [BABEL, ...AR_MAIN]);
  assert.equal(rtlDocument(t), true);
  assert.ok(t.includes('\n\\title{النمو والمؤسسات}\n'));
  for (const s of ['\\section{مقدمة}', '\\section{النتائج}',
    // runs of both directions and both kinds of digits, in the order they are read
    '\nندرس \\textbf{النمو} في ظل مؤسسات ضعيفة، بمعدل 5\\% سنة ٢٠٢٤ و2025؛ هل هذا صحيح؟\\footnote{بيانات البنك الدولي، ٢٠٢٤.}\n% comment (سارة) on "النمو": أضف مرجعًا.\n',
    // vowel marks, the tatweel, the non joiner in the Persian word and the joiner after the heh stay; the direction marks go
    '\n\u0645\u064f\u062d\u064e\u0645\u064e\u0651\u062f\u064c \u0642\u0627\u0644 \u0645\u0640\u0640\u0640\u0631\u062d\u0628\u0627\u060c \u0648\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645 \u0647\u200d.\u0642 \u062b\u0645 World Bank (GDP) \u0623\u064a\u0636\u064b\u0627.\n',
    // in a right to left paragraph Word's "left" and "both" are the edge the text starts at: nothing to say;
    // "right" is the far edge, which is flushright's in a right to left paragraph of LaTeX's too
    '\n\nمحاذاة إلى البداية.\n\n\\begin{flushright}\nمحاذاة إلى النهاية.\n\\end{flushright}\n\nنص مضبوط من الجانبين.\n\n\\begin{center}\nفي الوسط.\n\\end{center}\n',
    '\\begin{itemize}\n\\item\n  النتيجة الأولى\n\\item\n  النتيجة الثانية\n\\end{itemize}', '\\item\n  الخطوة ١\n\\item\n  الخطوة ٢\n\\end{enumerate}',
    // a table Word sets from the right keeps its cells in the order they are read
    'البلد & النمو \\\\\n\\midrule\nبيرو & ٣٫١ \\\\\nتشيلي & 2.4 \\\\',
    // the one paragraph that runs left to right, and the text Word wrapped in w:dir (pandoc alone drops it)
    '\n\\begin{otherlanguage}{english}\nAn English paragraph in the Arabic document.\n\\end{otherlanguage}\n', '\nقبل نص داخل الغلاف بعد.\n'])
    assert.ok(b.includes(s), s + '\n' + b);
  assert.equal((b.match(/otherlanguage/g) || []).length, 2);
  assert.ok(!/\\RL|\\LR|\{RTL\}|[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/.test(t), 'no command of the bidi package, no direction mark');
  assert.deepEqual(r.warnings, ['1 Word comment came in as a comment under its text.']);
  assert.ok(isBalanced(t, 0, t.length) && !/[\uE000-\uE01F]/.test(t));
  const m = buildModel({ files: new Map([['main.tex', t]]), main: 'main.tex' });
  assert.ok(!m.blocks.flatMap((u) => u.items.map((x) => x.type)).includes('raw'));
});

await ok('an English Word file with Arabic and Chinese phrases: both set up, the Arabic paragraph in its environment, nothing of the file\'s in the preamble', () => {
  const r = fixture('word-mixed.docx');
  const t = r.tex, b = bodyOf(t);
  setUp(t, [BABEL, ...AR, ...ZH]);
  assert.equal(rtlDocument(t), false);
  // the whole preamble: the class, the page, the script lines, and the packages the body uses
  assert.deepEqual(preambleOf(t).trim().split('\n').map((l) => l.replace(/^\\usepackage\[letterpaper.*$/, 'GEOMETRY')),
    ['\\documentclass[11pt]{article}', 'GEOMETRY', BABEL, ...AR, ...ZH, '\\usepackage{amsmath,amssymb}', '\\usepackage{booktabs}']);
  for (const s of ['\nThe Arabic word مرحبا means hello, and 你好 means the same in Chinese.\n', '\nIn Arabic, \\textbf{السلام عليكم ورحمة الله}, written right to left; numbers such as 2024 stay.\n',
    '\n\\begin{otherlanguage}{arabic}\nهذه فقرة كاملة بالعربية داخل مستند إنجليزي.\n\\end{otherlanguage}\n', '\nChinese: 北京、上海 and Peking University (北京大学).\n',
    'hello & مرحبا & 你好 \\\\\nthanks & شكرا & 谢谢 \\\\',
    // words that read as LaTeX are words
    '\nType \\textbackslash babelfont\\{rm\\}\\{Evil\\} or \\textbackslash input\\{/etc/passwd\\} at 100\\% \\& more: 字.\n'])
    assert.ok(b.includes(s), s + '\n' + b);
  // and the font and language names the file's runs carry (w:rFonts, w:lang) are nowhere
  assert.ok(!/\\input|\\write|Evil\}|zh-CN|en\}|SimSun|Arial/.test(t.replace(/\\textbackslash input/g, '')), t);
  assert.deepEqual(r.warnings, []);
});

await ok('right to left paragraphs by style and by default, switched off, in scripts with no font; start and end; joiners and direction marks; text that tries to be a mark', () => {
  const R = (t, rpr = '<w:rtl/>') => '<w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + t + '</w:t></w:r>';
  const p = (ppr, runs) => '<w:p><w:pPr>' + ppr + '</w:pPr>' + runs + '</w:p>';
  const AR1 = 'هذه فقرة عربية أولى في مستند.', AR2 = 'وهذه فقرة ثانية.';
  const styles = (normal, extra = '', dflt = '') => ({ 'word/styles.xml': '<w:styles ' + NSW + '><w:docDefaults><w:pPrDefault><w:pPr>' + dflt + '</w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr>' + normal + '</w:pPr></w:style><w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body"/><w:basedOn w:val="Normal"/></w:style>' + extra + '</w:styles>' });
  const eng = wp('An English paragraph that is long enough to make the document one that runs left to right as a whole.');
  const wrapped = (x) => '\n\\begin{otherlanguage}{arabic}\n' + x + '\n\\end{otherlanguage}\n';
  // the direction on the paragraph's style, on the style that one is based on, and in the defaults
  for (const [st, ppr] of [[styles('<w:bidi/>'), ''], [styles('<w:bidi/>'), '<w:pStyle w:val="Body"/>'], [styles('', '', '<w:bidi/>'), ''], [styles('<w:bidi w:val="0"/>', '<w:style w:type="paragraph" w:styleId="Rtl"><w:name w:val="Rtl"/><w:basedOn w:val="Normal"/><w:pPr><w:bidi w:val="1"/></w:pPr></w:style>'), '<w:pStyle w:val="Rtl"/>']]) {
    const t = bodyOf(open(tiny(p(ppr, R(AR1)) + p('<w:bidi w:val="0"/>', '<w:r><w:t>' + 'Left to right, said on the paragraph. '.repeat(3) + '</w:t></w:r>'), st)).tex);
    assert.ok(t.includes(wrapped(AR1) + '\nLeft to right, said'), t);
  }
  assert.ok(!bodyOf(open(tiny(p('<w:bidi w:val="false"/>', R(AR1)) + p('<w:bidi w:val="off"/>', '<w:r><w:t>' + 'Left to right as well. '.repeat(4) + '</w:t></w:r>'), styles('<w:bidi/>'))).tex).includes('otherlanguage'));
  // neighbours share one environment, a list and a formula between them too; headings go in with their text
  const list = (t) => p('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:bidi/>', R(t));
  const num = { 'word/numbering.xml': '<w:numbering ' + NSW + '><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>' };
  const g = bodyOf(open(tiny(eng + p('<w:pStyle w:val="Heading1"/><w:bidi/>', R('عنوان')) + p('<w:bidi/>', R(AR1)) + '<w:p><m:oMathPara><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></m:oMathPara></w:p>' + list('بند أول') + list('بند ثان') + p('<w:bidi/>', R(AR2)) + eng,
    { ...num, 'word/styles.xml': '<w:styles ' + NSW + '><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>' })).tex);
  assert.ok(g.includes('\n\\begin{otherlanguage}{arabic}\n\\section{عنوان}') && g.includes(AR1 + '\n\n\\[x = 1\\]\n\n\\begin{itemize}') && g.includes('\\end{itemize}\n\n' + AR2 + '\n\\end{otherlanguage}\n\nAn English'), g);
  assert.equal((g.match(/begin\{otherlanguage\}/g) || []).length, 1);
  // Word's start and end, in both directions (strict files write them): only the far edge is said
  const al = (jc, bidi) => p((bidi ? '<w:bidi/>' : '') + '<w:jc w:val="' + jc + '"/>', bidi ? R(AR2) : '<w:r><w:t>Aligned text.</w:t></w:r>');
  for (const jc of ['start', 'left', 'both', 'distribute']) {
    assert.ok(!/flush|ragged/.test(open(tiny(p('<w:bidi/>', R(AR1)) + al(jc, true))).tex), jc);
    assert.ok(!/flush|ragged/.test(open(tiny(eng + al(jc, false))).tex), jc);
  }
  for (const jc of ['end', 'right']) {
    assert.ok(open(tiny(p('<w:bidi/>', R(AR1)) + al(jc, true))).tex.includes('\n\\begin{flushright}\n' + AR2 + '\n\\end{flushright}\n'), jc);
    assert.ok(open(tiny(eng + al(jc, false))).tex.includes('\n\\begin{flushright}\nAligned text.\n\\end{flushright}\n'), jc);
  }
  // mostly Arabic, typed without ever setting a paragraph right to left: the document runs right to left, nothing is wrapped
  const plainAr = open(tiny(wp(AR1) + wp(AR2) + wp('Short.'))).tex;
  assert.ok(preambleOf(plainAr).includes(AR_MAIN[0]) && !plainAr.includes('otherlanguage'), plainAr);
  // Syriac has no font here: no set up, so nothing turns its paragraph, and its "right" (the left edge) is not flushright
  const he = open(tiny(eng + p('<w:bidi/><w:jc w:val="right"/>', R('ܫܠܡܐ ܥܠܡܐ'))));
  assert.ok(!/babel|otherlanguage|flushright|\\RL/.test(he.tex) && he.tex.includes('\nܫܠܡܐ ܥܠܡܐ\n') && /^Not kept: 8 characters pdfLaTeX has no font or name for \(Syriac: /.test(he.warnings[0]), he.tex + he.warnings[0]);
  // w:bdo, and runs that are right to left with no paragraph that is: text only, in reading order
  const bdo = bodyOf(open(tiny('<w:p><w:r><w:t xml:space="preserve">See </w:t></w:r><w:bdo w:val="rtl">' + R('كلمة') + '</w:bdo><w:r><w:t xml:space="preserve"> and </w:t></w:r><w:dir w:val="ltr"><w:r><w:t>this</w:t></w:r></w:dir><w:r><w:t>.</w:t></w:r></w:p>')).tex);
  assert.ok(bdo.includes('\nSee كلمة and this.\n'), bdo);
  // joiners shape Arabic letters and stay there; elsewhere the joiner goes as before, and every mark that only says a direction goes
  const j = bodyOf(open(tiny(wp('می\u200cخواهم ه\u200d a\u200db \u200fعربي\u200e \u202bمضمن\u202c \u2067معزول\u2069 \u061cانتهى'))).tex);
  assert.ok(j.includes('\nمی\u200cخواهم ه\u200d ab عربي مضمن معزول انتهى\n'), JSON.stringify(j));
  // Chinese beside scripts that still have no font: set up for Chinese, the others listed as before
  const ja = open(tiny(wp('中文文本，研究表明。') + wp('ខ្មែរ ລາວ')));
  assert.ok(preambleOf(ja.tex).includes(CTEX) && /^Not kept: a font for 8 characters \(Khmer: ខ្មែរ; Lao: ລາວ\): the fonts the document is set up with have none/.test(ja.warnings[0]), ja.warnings[0]);
  // Greek and Cyrillic have fonts under pdfLaTeX only: beside Chinese they are listed too, and no pdfLaTeX font line is written
  const gr = open(tiny(wp('中文 Ελληνικά Привет')));
  assert.ok(preambleOf(gr.tex).includes(CTEX) && !/fontenc|textalpha|lmodern|T2A/.test(gr.tex) && /^Not kept: a font for 14 characters \(Greek or Cyrillic\)/.test(gr.warnings[0]), gr.tex);
  // full width punctuation alone is no Chinese text: nothing is set up, and it is listed as before
  const fw = open(tiny(wp('Wide，comma')));
  assert.ok(!/ctex|babel/.test(fw.tex) && /^Not kept: 1 character pdfLaTeX has no font or name for \(Chinese or Japanese: ，\)/.test(fw.warnings[0]), fw.warnings[0]);
  // a file whose own text holds the marks Rikuy groups paragraphs with, or the words of an environment, gets neither
  const forged = open(tiny(wp('\uE00C') + wp(AR1 + ' \\begin{otherlanguage}{arabic} \\babelprovide[main]{hebrew} \uE00B') + wp('\uE00D') + wp('\uE00E') + eng));
  assert.ok(!/\n\\begin\{otherlanguage\}|\n\\babelprovide\[main\]/.test(bodyOf(forged.tex)) && bodyOf(forged.tex).includes('\\textbackslash begin\\{otherlanguage\\}\\{arabic\\} \\textbackslash babelprovide{[}main{]}\\{hebrew\\}'), forged.tex);
  setUp(forged.tex, [BABEL, ...AR]);
});

await ok('section numbers typed into headings are LaTeX\'s own when they are the ones it would give; one out of step and all stay', () => {
  const h = (l, t) => '<w:p><w:pPr><w:pStyle w:val="Heading' + l + '"/></w:pPr><w:r><w:t>' + t + '</w:t></w:r></w:p>';
  const st = { 'word/styles.xml': '<w:styles ' + NSW + '>' + [1, 2].map((l) => '<w:style w:type="paragraph" w:styleId="Heading' + l + '"><w:name w:val="heading ' + l + '"/></w:style>').join('') + '</w:styles>' };
  const a = open(tiny(h(1, '1 Introduction') + wp('Text.') + h(2, '1.1 Data') + h(2, '1.2 Method') + h(1, '2 Results') + h(2, '2.1 Main') + h(1, 'References') + wp('Knuth, D. The TeXbook.'), st));
  for (const s of ['\\section{Introduction}', '\\subsection{Data}', '\\subsection{Method}', '\\section{Results}', '\\subsection{Main}', '\\section*{References}']) assert.ok(a.tex.includes(s), s + a.tex);
  assert.ok(a.warnings.includes('The section numbers typed in 5 headings are LaTeX\'s own now.'), a.warnings.join('|'));
  const b = open(tiny(h(1, '1 Introduction') + h(1, '3 Results') + h(1, '2024 in review'), st));
  // (the last heading of a file is a heading too: pandoc alone leaves one that ends the document out)
  assert.ok(b.tex.includes('\\section{1 Introduction}') && b.tex.includes('\\section{3 Results}') && b.tex.includes('\\section{2024 in review}\\label{in-review}\n\n\\end{document}'), b.tex);
});

const AR_DOC = (body, main) => '\\documentclass{article}\n' + [BABEL, ...(main ? AR_MAIN : AR), ...ZH].join('\n') + '\n\\title{' + (main ? 'عنوان الورقة' : 'A Title') + '}\n\\author{Ana}\n\\begin{document}\n\\maketitle\n' + body + '\n\\end{document}\n';
const run = (t, rpr = '') => '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + t + '</w:t></w:r>';
const RTL = '<w:rtl />', EA = '<w:rFonts w:hint="eastAsia" />';
const bare = (x) => x.replace(/<w:bookmark(Start|End)[^>]*>/g, '');

await ok('to Word, a left to right document: Arabic runs are w:rtl, paragraphs follow their wrappers, Chinese has its font, the preamble stays behind', () => {
  const src = AR_DOC(String.raw`English with مرحبا بالعالم and 你好世界 inside, 12 items (see عربي).

\begin{otherlanguage}{arabic}
هذه فقرة عربية with English و 2024.

\begin{enumerate}
\item واحد
\item اثنان
\end{enumerate}

\begin{tabular}{ll}
أ & ب \\
ج & 12 \\
\end{tabular}
\end{otherlanguage}

A \foreignlanguage{arabic}{نص عربي!} phrase, \textarabic{نص (a)} then \RL{يمين 1.} and \LR{left (ع)}.

\begin{RTL}
فقرة في RTL.
\end{RTL}

\begin{Arabic}
فقرة بوليغلوسيا.
\end{Arabic}

\begin{CJK}{UTF8}{gbsn}
中文段落。
\end{CJK}

\begin{CJK*}{UTF8}{gbsn}
中文段落二。\CJKfamily{gkai}楷体。
\end{CJK*}

\begin{tabular}{ll}
a & عربي \\
\end{tabular}

\selectlanguage{arabic}
بعد التبديل.

\selectlanguage{english}
Back to English.
`);
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  assert.equal(E.lost, 0);
  const { d, st, se } = exported(E);
  const ps = paras(d).map(bare);
  const P1 = (t) => ps.find((x) => textOf(x).includes(t));
  // an Arabic phrase in a left to right paragraph: its own run, right to left; the paragraph stays as it is
  assert.equal(P1('English with'), '<w:pPr><w:pStyle w:val="FirstParagraph" /></w:pPr>' + run('English with ') + run('مرحبا بالعالم', RTL) + run(' and ') + run('你好世界', EA) + run(' inside, 12 items (see ') + run('عربي', RTL) + run(').'));
  // \begin{otherlanguage}{arabic}: right to left paragraphs; the English words and nothing else left to right; the number with the Arabic
  assert.equal(P1('هذه فقرة'), '<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run('هذه فقرة عربية ', RTL) + run('with English') + run(' و 2024.', RTL));
  // its list numbers from the right, its table is set from the right
  assert.equal(P1('واحد'), '<w:pPr><w:pStyle w:val="Compact" /><w:numPr><w:ilvl w:val="0" /><w:numId w:val="1001" /></w:numPr><w:bidi /></w:pPr>' + run('واحد', RTL));
  const tables = d.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g);
  assert.equal(tables.length, 2);
  assert.ok(tables[0].startsWith('<w:tbl><w:tblPr><w:tblStyle w:val="Table" /><w:bidiVisual /><w:tblW '), tables[0].slice(0, 120));
  assert.ok(bare(tables[0]).includes('<w:pPr><w:pStyle w:val="Compact" /><w:bidi /><w:jc w:val="left" /></w:pPr>' + run('12', RTL)), tables[0]);
  // a table of the left to right text is not, Arabic cell or no
  assert.ok(!tables[1].includes('bidi') && bare(tables[1]).includes(run('عربي', RTL)));
  // \foreignlanguage, \textarabic and \RL: what they hold is right to left, punctuation and digits too; a Latin letter stays a
  // left to right run; \LR the other way round
  assert.equal(P1('phrase'), '<w:pPr><w:pStyle w:val="BodyText" /></w:pPr>' + run('A ') + run('نص عربي!', RTL) + run(' phrase, ') + run('نص (', RTL) + run('a') + run(')', RTL) + run(' then ') + run('يمين 1.', RTL) + run(' and ') + run('left (') + run('ع', RTL) + run(')') + run('.'));
  for (const t of ['فقرة في ', 'فقرة بوليغلوسيا.', 'بعد التبديل.']) assert.ok(P1(t).startsWith('<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run(t, RTL)), t + P1(t));
  assert.ok(P1('Back to English.').startsWith('<w:pPr><w:pStyle w:val="BodyText" /></w:pPr>'));
  // the CJK package's wrappers: their text, not their arguments
  assert.equal(P1('中文段落。'), '<w:pPr><w:pStyle w:val="BodyText" /></w:pPr>' + run('中文段落。', EA));
  assert.equal(P1('楷体'), '<w:pPr><w:pStyle w:val="BodyText" /></w:pPr>' + run('中文段落二。楷体。', EA));
  const words = textOf(d);
  for (const w of ['UTF8', 'gbsn', 'gkai', 'babel', 'bidi=basic', 'Amiri', 'FandolSong', 'onchar', 'otherlanguage', 'arabic', 'selectlanguage']) assert.ok(!words.includes(w), w);
  // title, section and every other paragraph stay left to right
  assert.equal(ps.filter((x) => x.includes('<w:bidi />')).length, 10);
  assert.ok(!/<w:bidi/.test(d.slice(d.lastIndexOf('<w:sectPr'))) && !P1('A Title').includes('bidi'));
  // the fonts and languages for the two scripts, once, in the document's defaults; the theme's for headings
  assert.equal(defaults(st), '<w:rPrDefault> <w:rPr> <w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsia="SimSun" w:cs="Amiri" /> <w:sz w:val="24" /> <w:szCs w:val="24" /> <w:lang w:bidi="ar-SA" w:eastAsia="zh-CN" w:val="en-US" /> </w:rPr> </w:rPrDefault>');
  assert.match(se, /<w:themeFontLang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA" \/>/);
  // what Word got is what the page showed: nothing to bring back
  const plan = importInto(E.docx, files);
  assert.equal(plan.files.size, 0);
  assert.equal(plan.stats.applied + plan.stats.conflicts + plan.stats.skipped, 0);
});

await ok('to Word, a right to left document: every paragraph, the section and the tables; a wrapper turns its paragraphs back; code reads left to right', () => {
  const src = AR_DOC(String.raw`\tableofcontents
\section{مقدمة}
هذه فقرة عربية with English و 2024.\footnote{حاشية عربية with Latin.}

\begin{enumerate}
\item واحد
\item اثنان
\end{enumerate}

\begin{otherlanguage}{english}
An English paragraph with عربي inside.

\begin{itemize}
\item one
\end{itemize}

\begin{tabular}{ll}
a & b \\
\end{tabular}
\end{otherlanguage}

\begin{LTR}
Another one.
\end{LTR}

\begin{flushright}
محاذاة.
\end{flushright}

\begin{tabular}{lr}
\hline
أ & ب \\
\hline
ج & 12 \\
\hline
\end{tabular}

بعد الجدول.

\begin{verbatim}
x <- 1
\end{verbatim}

\newpage
نهاية \texttt{code} هنا، 中文 أيضا.
`, true);
  const files = new Map([['main.tex', src]]);
  assert.equal(rtlDocument(src), true);
  const m = buildModel({ files, main: 'main.tex' });
  const W = buildWordDoc(m, files, { now: 0, main: 'main.tex' });
  assert.equal(W.rtl, true);
  assert.deepEqual(W.doc.meta.dir, { t: 'MetaString', c: 'rtl' });
  const E = exportDocx(P, { doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources: {}, bibs: [], citeproc: false, toc: true, project: { name: 'Paper', main: 'main.tex', files: [...files] } });
  const { d, st, se, fn } = exported(E);
  const ps = paras(d).map(bare);
  const P1 = (t) => ps.find((x) => textOf(x).includes(t));
  const BIDI = /^\s*<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<w:bidi \/>/;
  // left to right: only what the wrappers hold (a paragraph, a list item, a table cell of two, a second paragraph) and the code
  const ltr = ps.filter((x) => !BIDI.test(x)).map(textOf);
  assert.deepEqual(ltr, ['An English paragraph with عربي inside.', 'one', 'a', 'b', 'Another one.', 'x <- 1']);
  assert.ok(ps.length - ltr.length >= 14, String(ps.length));
  // the title block and the contents, which pandoc's template writes, and the page break
  assert.match(P1('عنوان الورقة'), /^\s*<w:pPr>\s*<w:pStyle w:val="Title" \/>\s*<w:bidi \/><\/w:pPr>\s*<w:r><w:rPr><w:rtl \/><\/w:rPr><w:t xml:space="preserve">عنوان الورقة<\/w:t><\/w:r>/);
  assert.match(P1('Ana'), /^\s*<w:pPr>\s*<w:pStyle w:val="Author" \/>\s*<w:bidi \/><\/w:pPr>\s*<w:r><w:t xml:space="preserve">Ana<\/w:t><\/w:r>/);
  assert.ok(d.includes('<w:p><w:pPr><w:bidi /></w:pPr><w:r><w:fldChar w:fldCharType="begin" w:dirty="true" />') && d.includes('<w:p><w:pPr><w:bidi /></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>'));
  assert.equal(P1('مقدمة'), '<w:pPr><w:pStyle w:val="Heading1" /><w:bidi /></w:pPr>' + run('1 مقدمة', RTL));
  assert.equal(P1('هذه فقرة').replace(/<w:r><w:rPr><w:rStyle w:val="FootnoteReference" \/>[\s\S]*$/, ''), '<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run('هذه فقرة عربية ', RTL) + run('with English') + run(' و 2024.', RTL));
  assert.match(bare(fn), /<w:pPr><w:pStyle w:val="FootnoteText" \/><w:bidi \/><\/w:pPr>[\s\S]*<w:r><w:rPr><w:rtl \/><\/w:rPr><w:t xml:space="preserve">حاشية عربية <\/w:t><\/w:r><w:r><w:t xml:space="preserve">with Latin<\/w:t><\/w:r><w:r><w:rPr><w:rtl \/><\/w:rPr><w:t xml:space="preserve">.<\/w:t><\/w:r>/);
  assert.equal(P1('واحد'), '<w:pPr><w:pStyle w:val="Compact" /><w:numPr><w:ilvl w:val="0" /><w:numId w:val="1001" /></w:numPr><w:bidi /></w:pPr>' + run('واحد', RTL));
  assert.equal(P1('An English'), '<w:pPr><w:pStyle w:val="FirstParagraph" /></w:pPr>' + run('An English paragraph with ') + run('عربي', RTL) + run(' inside.'));
  assert.equal(P1('one'), '<w:pPr><w:pStyle w:val="Compact" /><w:numPr><w:ilvl w:val="0" /><w:numId w:val="1002" /></w:numPr></w:pPr>' + run('one'));
  // flushright in a right to left paragraph is its far edge in LaTeX and "right" is that edge in Word
  assert.equal(P1('محاذاة.'), '<w:pPr><w:pStyle w:val="RightAligned" /><w:bidi /></w:pPr>' + run('محاذاة.', RTL));
  assert.match(st, /w:styleId="RightAligned">(?:(?!<\/w:style>)[\s\S])*<w:pPr><w:jc w:val="right" \/><\/w:pPr><\/w:style>/);
  const tables = d.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g);
  assert.ok(!tables[0].includes('bidi') && tables[1].startsWith('<w:tbl><w:tblPr><w:tblStyle w:val="Table" /><w:bidiVisual /><w:tblW '));
  assert.equal(P1('x <- 1'), '<w:pPr><w:pStyle w:val="SourceCode" /></w:pPr><w:r><w:rPr><w:rStyle w:val="VerbatimChar" /></w:rPr><w:t xml:space="preserve">x &lt;- 1</w:t></w:r>');
  assert.equal(P1('نهاية'), '<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run('نهاية ', RTL) + run('code', '<w:rStyle w:val="VerbatimChar" />') + run(' هنا، ', RTL) + run('中文', EA) + run(' أيضا.', RTL));
  assert.match(d, /<w:sectPr>(?:(?!<\/w:sectPr>)[\s\S])*<w:bidi \/><\/w:sectPr>/);
  assert.equal(defaults(st), '<w:rPrDefault> <w:rPr> <w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsia="SimSun" w:cs="Amiri" /> <w:sz w:val="24" /> <w:szCs w:val="24" /> <w:lang w:bidi="ar-SA" w:eastAsia="zh-CN" w:val="en-US" /> </w:rPr> </w:rPrDefault>');
  assert.match(se, /<w:themeFontLang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA" \/>/);
  // the parts still parse, and Rikuy reads its own file back with nothing changed
  for (const part of [d, st, se, fn]) parseXml(part, undefined, true);
  assert.equal(E.lost, 0);
  assert.equal(importInto(E.docx, files).files.size, 0);
});

await ok('to Word: a document with neither script is written as before; one in Chinese alone has its font and no direction; the model\'s own dir is taken', () => {
  const plain = exported(exportFiles(new Map([['main.tex', doc('Plain \\emph{English} text, with an é and a —.\n\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n')]])));
  assert.ok(!/w:bidi|w:rtl|w:bidiVisual/.test(plain.d) && !/SimSun|Amiri/.test(plain.st) && /w:eastAsiaTheme="minorEastAsia"/.test(defaults(plain.st)) && /<w:themeFontLang w:val="en-US" \/>/.test(plain.se));
  const zh = '\\documentclass{article}\n' + CTEX + '\n\\begin{document}\n\\section{引言}\n中文\\textbf{粗体}文本，English 混排。\n\\end{document}\n';
  const Z = exported(exportFiles(new Map([['main.tex', zh]])));
  assert.equal(defaults(Z.st), '<w:rPrDefault> <w:rPr> <w:rFonts w:asciiTheme="minorHAnsi" w:cstheme="minorBidi" w:hAnsiTheme="minorHAnsi" w:eastAsia="SimSun" /> <w:sz w:val="24" /> <w:szCs w:val="24" /> <w:lang w:bidi="ar-SA" w:eastAsia="zh-CN" w:val="en-US" /> </w:rPr> </w:rPrDefault>');
  assert.match(Z.se, /<w:themeFontLang w:val="en-US" w:eastAsia="zh-CN" \/>/);
  assert.ok(!/w:bidi|w:rtl/.test(Z.d) && !textOf(Z.d).includes('ctex') && bare(Z.d).includes(run('中文', EA) + run('粗体', EA + '<w:b /><w:bCs />') + run('文本，English', EA) + run(' ') + run('混排。', EA)), Z.d);
  // a model that says which way a block and a stretch of text run (dir), and the document (opts.dir)
  const files = new Map([['main.tex', doc('First paragraph, plain.\n\nSecond paragraph, \\emph{turned}.\n')]]);
  const m = buildModel({ files, main: 'main.tex' });
  const items = m.blocks.flatMap((u) => u.items);
  items[1].dir = 'rtl';
  items[0].inl = [{ ...items[0].inl[0], dir: 'rtl' }];
  const W = buildWordDoc(m, files, { now: 0 });
  const d1 = paras(exported(exportDocx(P, { doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources: {}, bibs: [], project: { name: 'P', main: 'main.tex', files: [...files] } })).d).map(bare);
  assert.equal(d1[0], '<w:pPr><w:pStyle w:val="FirstParagraph" /></w:pPr>' + run('First paragraph, plain') + run('.', RTL));
  assert.equal(d1[1], '<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run('Second paragraph, ') + run('turned', '<w:i /><w:iCs />') + run('.', RTL));
  const m2 = buildModel({ files, main: 'main.tex' });
  m2.opts.dir = 'rtl';
  assert.equal(buildWordDoc(m2, files, { now: 0 }).rtl, true);
  assert.equal(buildWordDoc(m, files, { now: 0, rtl: true }).doc.meta.dir.c, 'rtl');
});

await ok('the wrappers of a source that set a direction, and how mixed text divides into runs', () => {
  // @a to @t stand at twenty places of a source: each has the paragraph's direction where a wrapper sets it, and the text's
  const src = '@a \\foreignlanguage{arabic}{@b \\LR{@c} @d} @e\n\\begin{otherlanguage}{arabic}\n@f \\textenglish{@g}\n\\begin{verbatim}\n\\begin{RTL}\n\\end{verbatim}\n@h\n\\end{otherlanguage}\n@i \\begin{otherlanguage*}{hebrew}@j\\end{otherlanguage*} % \\begin{RTL}\n@k \\RLE{@l} \\texthebrew[opt]{@m}\n\\begin{quote}\\setRTL @n\\end{quote} @o \\begin{hebrew}[numerals=arabic] @p\\end{hebrew}\n\\begin{CJK*}{UTF8}{bsmi}\n@q\\CJKfamily{bkai}@r\\end{CJK*} \\selectlanguage{farsi} @s \\selectlanguage{french} @t';
  const S = scanDir(src);
  const of = (ch) => { const p = src.indexOf('@' + ch); return [S.block(p), S.inline(p), S.hidden(p)]; };
  for (const hid of ['UTF8', 'bsmi', 'bkai', 'numerals']) assert.equal(S.hidden(src.indexOf(hid)), true, hid);
  assert.equal(scanDir('Plain \\emph{text} with \\begin{itemize}\\item x\\end{itemize}'), null);
  // a source built to be read again and again (wrappers that never close, environments never ended, ends never begun) is read once
  const t0 = Date.now();
  for (const bad of ['\\RL{'.repeat(60000), '\\texthebrew['.repeat(60000), '\\begin{RTL}'.repeat(40000) + '\\end{x}'.repeat(40000), '\\CJKfamily{a}x'.repeat(40000), '\\foreignlanguage{arabic}{'.repeat(30000) + '}'.repeat(30000)]) {
    const B = scanDir(bad);
    if (B) for (let p = 0; p < bad.length; p += 7) { B.block(p); B.inline(p); B.hidden(p); }
  }
  assert.ok(Date.now() - t0 < 5000, 'scanned in ' + (Date.now() - t0) + ' ms');
  // spaces and punctuation go with the text both their sides agree on, else with the paragraph; a number with the text before it
  const dirs = (cls, base) => resolve(cls.split(''), base).join('');
  assert.equal(dirs('LLNRRNDDNRRNNLL', 'ltr'), 'LLLRRRRRRRRLLLL');
  assert.equal(dirs('LLNRRNDDNRRNNLL', 'rtl'), 'LLRRRRRRRRRRRLL');
  assert.equal(dirs('RRMMNNDDNLLNDDN', 'rtl'), 'RRRRRRRRRLLLLLR');
  assert.equal(dirs('DDNRRBNLL', 'ltr'), 'LLLRRLLLL');
  assert.equal(dirs('MNDD', 'rtl'), 'RRRR');
});

await ok('a round trip through Word and back as a stranger\'s file gives the same body, direction and all, for each of the three files', () => {
  for (const name of ['word-chinese.docx', 'word-arabic.docx', 'word-mixed.docx']) {
    const t1 = fixture(name).tex;
    const E1 = exportFiles(new Map([['main.tex', t1]]));
    assert.equal(E1.lost, 0, name);
    const r2 = open(E1.docx);
    // lists Rikuy writes are tight ones, which the Word file python-docx made had not said
    assert.equal(bodyOf(r2.tex).replace(/\\tightlist\n/g, ''), bodyOf(t1), name);
    assert.deepEqual(preambleOf(r2.tex).split('\n').filter((l) => /ctex|babel/.test(l)), preambleOf(t1).split('\n').filter((l) => /ctex|babel/.test(l)), name);
    // and from then on nothing moves
    const r3 = open(exportFiles(new Map([['main.tex', r2.tex]])).docx);
    assert.equal(bodyOf(r3.tex), bodyOf(r2.tex), name);
    // while the file as Rikuy's own, read for a coauthor's edits, has none
    assert.equal(importInto(E1.docx, new Map([['main.tex', t1]])).files.size, 0, name);
  }
});

await ok('a coauthor\'s edits to Chinese and Arabic text in Word come back as the smallest patches', async () => {
  const pre = [BABEL, ...AR, ...ZH].join('\n') + '\n';
  const zh = doc('研究表明，制度变迁对经济增长具有显著影响。本文利用\\textbf{秘鲁}的数据进行了检验，结果稳健。\n', pre);
  // one character of a sentence with no spaces; two changes a clause apart stay two; one inside \textbf stays inside
  await roundTrip(zh, rep('显著', '重大'), zh.replace('显著', '重大'));
  const p2 = await roundTrip(zh, (d) => rep('秘鲁', '智利')(rep('检验', '验证')(rep('研究表明', '研究显示')(d))), zh.replace('秘鲁', '智利').replace('检验', '验证').replace('研究表明', '研究显示'));
  assert.deepEqual(p2.applied.map((e) => [zh.slice(e.s, e.e), e.t]).sort(), [['检验', '验证'], ['秘鲁', '智利'], ['表明', '显示']].sort());
  // Chinese quotation marks and the long dash typed in Word stay those characters, as on opening a Word file
  await roundTrip(zh, rep('结果稳健。', '结果稳健，见“附录”——表1。'), zh.replace('结果稳健。', '结果稳健，见“附录”——表1。'));
  // each character is a word: changes a clause apart are two, changes two characters apart are one
  assert.deepEqual(textHunks('制度变迁对经济增长具有显著影响', '体制变迁对经济增长具有重大影响'), [{ a: 0, b: 2, A: 0, B: 2 }, { a: 11, b: 13, A: 11, B: 13 }]);
  assert.deepEqual(textHunks('制度变迁对经济增长具有显著影响', '制度变迁对经济发展具有重大影响'), [{ a: 7, b: 13, A: 7, B: 13 }]);
  // Arabic: a word, a word with its vowel marks, a number, text in a wrapper, a paragraph in an environment, a footnote
  const ar = doc('هذه فقرة عربية مع \\emph{كلمة} مهمة و 50\\% من النص، سنة ٢٠٢٤.\\footnote{حاشية أولى.}\n\nA \\foreignlanguage{arabic}{نص عربي} phrase and \\RL{يمين}.\n\n\\begin{otherlanguage}{arabic}\nفقرة داخل البيئة.\n\\end{otherlanguage}\n', pre);
  await roundTrip(ar, rep('فقرة عربية', 'جملة عربية'), ar.replace('فقرة عربية', 'جملة عربية'));
  await roundTrip(ar, rep('كلمة', 'كَلِمَةٌ'), ar.replace('كلمة', 'كَلِمَةٌ'));
  const p3 = await roundTrip(ar, (d) => rep('٢٠٢٤', '٢٠٢٥')(rep('نص عربي', 'نص فارسی می\u200cخواهم')(rep('يمين', 'يسار')(rep('فقرة داخل البيئة.', 'فقرة داخل البيئة، 100% & أكثر.')(d)))),
    ar.replace('٢٠٢٤', '٢٠٢٥').replace('نص عربي', 'نص فارسی می\u200cخواهم').replace('يمين', 'يسار').replace('فقرة داخل البيئة.', 'فقرة داخل البيئة، 100\\% \\& أكثر.'));
  assert.equal(p3.stats.applied, 4);
  assert.equal(p3.stats.conflicts + p3.stats.skipped, 0);
  const files = new Map([['main.tex', ar]]);
  const E = exportFiles(files);
  assert.equal(importInto(edit(E.docx, rep('حاشية أولى', 'حاشية ثانية'), 'word/footnotes.xml'), files).files.get('main.tex'), ar.replace('حاشية أولى', 'حاشية ثانية'));
  // a paragraph added in Word under the Arabic one, by a Word that marks it right to left and cuts it into runs
  const added = edit(E.docx, (d) => d.replace(/(فقرة داخل البيئة\.[\s\S]*?<\/w:p>)/, '$1<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">فقرة </w:t></w:r><w:dir w:val="rtl"><w:r><w:rPr><w:rtl/></w:rPr><w:t>جديدة</w:t></w:r></w:dir><w:r><w:t xml:space="preserve"> with {braces}.</w:t></w:r></w:p>'));
  assert.equal(importInto(added, files).files.get('main.tex'), ar.replace('فقرة داخل البيئة.', 'فقرة داخل البيئة.\n\nفقرة جديدة with \\{braces\\}.'));
  // the owner changed the same Arabic words since: not applied, said in a comment
  const mine = new Map([['main.tex', ar.replace('فقرة عربية', 'فقرة قصيرة')]]);
  const clash = importInto(edit(E.docx, rep('فقرة عربية', 'فقرة فارسية')), mine);
  assert.equal(clash.stats.conflicts, 1);
  assert.ok(clash.files.get('main.tex').includes('فقرة قصيرة') && /% comment \(Ana\) on "[^"]*": In Word: /.test(clash.files.get('main.tex')), clash.files.get('main.tex'));
});


// ---- India's scripts ---------------------------------------------------------------------------

// the lines src/scripts.js gives for these scripts in a preamble that has none
const linesFor = (...ids) => scriptLines(Object.assign(ids, { arabicMain: false }), '');
const INDIC_BABEL = '\\usepackage[english]{babel} % LuaLaTeX sets each script in its own font';
const HI = ['\\babelprovide[import=hi, onchar=ids fonts]{hindi}', '\\babelfont[hindi]{rm}[Renderer=Harfbuzz]{Noto Serif Devanagari}', '\\babelfont[hindi]{sf}[Renderer=Harfbuzz]{Noto Serif Devanagari}', '\\babelfont[hindi]{tt}[Renderer=Harfbuzz]{Noto Serif Devanagari}', '\\directlua{for _, c in ipairs({0x964, 0x965, 0x200C, 0x200D}) do Babel.chr_to_loc[c] = -2000 end} % a danda or a joiner belongs to the script before it'];
// the order Word's schema gives the properties of a run: Word refuses a file that has them in another
const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
function rprInOrder(xml) {
  let n = 0;
  for (const m of xml.matchAll(/<w:rPr>((?:(?!<\/w:rPr>)[\s\S])*)<\/w:rPr>/g)) {
    const names = [...m[1].matchAll(/<w:([A-Za-z]+)\b[^>]*\/>/g)].map((x) => RPR_ORDER.indexOf(x[1]));
    assert.ok(names.every((k, i) => k >= 0 && (i === 0 || k > names[i - 1])), m[0]);
    n++;
  }
  return n;
}
const NIRMALA = '<w:rFonts w:cs="Nirmala UI" />';
const langOf = (l) => '<w:lang w:bidi="' + l + '" />';
const hi = (t, f = '') => run(t, NIRMALA + f + langOf('hi-IN'));

await ok('a Hindi Word file opens set up for Devanagari: conjuncts, nukta, vowel signs, joiners, dandas and digits as they are, its runs joined, nothing listed as lost', () => {
  const r = fixture('word-hindi.docx');
  const t = r.tex, b = bodyOf(t);
  assert.deepEqual(linesFor('devanagari'), [INDIC_BABEL, ...HI]);
  setUp(t, [INDIC_BABEL, ...HI]);
  assert.equal(rtlDocument(t), false);
  assert.match(t, /\\documentclass\[11pt\]\{article\}\n\\usepackage\[letterpaper[^\]]*\]\{geometry\}\n\\usepackage\[english\]\{babel\}/);
  assert.ok(t.includes('\n\\title{भारत की अर्थव्यवस्था}\n'));
  for (const s of ['\\section{परिचय}',
    // six runs of three fonts, one with Word's w:cs mark: one sentence, with its nukta (ज़) and its conjuncts, the comment under it
    '\nयह दस्ताव\u0947\u091c\u093c \\textbf{हिन्दी} में लिखा गया है। इसमें क्ष, त्र, ज्ञ और श्री जैसे संयुक्ताक्षर हैं॥\\footnote{स्रोत: \\textbf{विश्व बैंक}, २०२४।}\n% comment (अनीता) on "संयुक्ताक्षर": संदर्भ जोड़ें।\n',
    // anusvara, chandrabindu, visarga; the joiner and the non joiner after the virama; both kinds of digits
    '\nहि\u0902दी में मा\u0901 और दु\u0903ख; क\u094d\u200dष तथा क\u094d\u200cष। GDP growth २०२४ में ७.५\\% रही, 2025 में ६\\%।\n',
    '\\begin{itemize}\n\\item\n  पहला बिंदु\n\\item\n  दूसरा बिंदु\n\\end{itemize}', '\\item\n  चरण एक\n\\item\n  चरण दो\n\\end{enumerate}',
    'देश & वृद्धि \\\\\n\\midrule\nभारत & ७.२ \\\\\nनेपाल & 3.9 \\\\'])
    assert.ok(b.includes(s), s + '\n' + b);
  assert.ok(!/\\RL|otherlanguage|fontenc|fontspec|Mangal|Kokila|hi-IN/.test(t), t);
  assert.deepEqual(r.warnings, ['1 Word comment came in as a comment under its text.']);
  assert.ok(isBalanced(t, 0, t.length) && !/[\uE000-\uE01F]/.test(t));
  const m = buildModel({ files: new Map([['main.tex', t]]), main: 'main.tex' });
  const kinds = m.blocks.flatMap((u) => u.items.map((x) => x.type));
  assert.ok(kinds.includes('title') && kinds.includes('float') && !kinds.includes('raw'), kinds.join(' '));
});

await ok('a Word file with a line in each of the other eight scripts of India: all nine set up, every line as it is, nothing of the file\'s in the preamble', () => {
  const r = fixture('word-indic.docx');
  const t = r.tex, b = bodyOf(t);
  const lines = linesFor(...INDIC.map((x) => x[0]));
  // babel's line, four lines a script, the two that tell babel where Gurmukhi and Gujarati are,
  // and the one for dandas and joiners
  assert.equal(lines.length, 40);
  setUp(t, lines);
  assert.deepEqual(preambleOf(t).trim().split('\n').map((l) => l.replace(/^\\usepackage\[letterpaper.*$/, 'GEOMETRY')), ['\\documentclass[11pt]{article}', 'GEOMETRY', ...lines, '\\usepackage{amsmath,amssymb}', '\\usepackage{booktabs}']);
  for (const s of ['Bengali: \\textbf{বাংলা:} আমি বাংলায় গান গাই, ক্ষমা করবেন। ১২৩', 'Tamil: \\textbf{தமிழ்:} வணக்கம், மிக்க நன்றி. ௧௨௩', 'Telugu: \\textbf{తెలుగు:} నమస్కారం, ధన్యవాదాలు. ౧౨౩',
    'Gujarati: \\textbf{ગુજરાતી:} નમસ્તે, આભાર. ૧૨૩', 'Kannada: \\textbf{ಕನ್ನಡ:} ನಮಸ್ಕಾರ, ಧನ್ಯವಾದಗಳು. ೧೨೩',
    // the joiner that makes Malayalam's older chillu stays
    'Malayalam: \\textbf{മലയാളം:} നമസ്കാരം, നന്ദി, അവന\u0d4d\u200d. ൧൨൩', 'Gurmukhi: \\textbf{ਪੰਜਾਬੀ:} ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, ਧੰਨਵਾਦ। ੧੨੩', 'Odia: \\textbf{ଓଡ଼ିଆ:} ନମସ୍କାର, ଧନ୍ୟବାଦ। ୧୨୩',
    'Together: हिन्दी বাংলা தமிழ் in one line.', 'धन्यवाद & நன்றி & ధన్యవాదాలు \\\\\n१ & ௧ & ౧ \\\\', 'Odd names: नाम.'])
    assert.ok(b.includes('\n' + s + '\n'), s + '\n' + b);
  // the font and language names its runs carry (w:rFonts, w:lang) are nowhere
  assert.ok(!/\\input|Evil|passwd|hi-IN|Vrinda|Latha|Mangal/.test(t), t);
  assert.deepEqual(r.warnings, []);
});

await ok('India\'s scripts beside others: with Arabic and Chinese, with scripts that have no font, digits alone, joiners, runs cut inside a word, words that read as LaTeX', () => {
  const R = (t, rpr) => '<w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + t + '</w:t></w:r>';
  // Arabic, Hindi and Chinese in one file: the lines of all three, in the order src/scripts.js gives them
  const three = open(tiny(wp('English with हिन्दी शब्द, مرحبا بالعالم and 中文 in one paragraph that is mostly English words.')));
  setUp(three.tex, linesFor('chinese', 'arabic', 'devanagari'));
  assert.ok(preambleOf(three.tex).includes('bidi=basic') && bodyOf(three.tex).includes('\nEnglish with हिन्दी शब्द, مرحبا بالعالم and 中文 in one paragraph'), three.tex);
  assert.deepEqual(three.warnings, []);
  // Khmer, Lao and Georgian still have no font: listed as before, beside a script that is set up
  const mix = open(tiny(wp('हिन्दी ខ្មែរ ລາວ ქართული')));
  assert.ok(preambleOf(mix.tex).includes(HI[0]) && /^Not kept: a font for 15 characters \(Khmer: ខ្មែរ; Lao: ລາວ; Georgian: ქართული\): the fonts the document is set up with have none/.test(mix.warnings[0]), mix.warnings[0]);
  // and alone, as before
  const si = open(tiny(wp('Word ລາວ')));
  assert.ok(!/babel/.test(si.tex) && /^Not kept: 3 characters pdfLaTeX has no font or name for \(Lao: ລາວ\)/.test(si.warnings[0]), si.warnings[0]);
  // digits with no letter of their script are not text in it: nothing is set up, and they are listed
  const dg = open(tiny(wp('Total १२३ and ৪৫')));
  assert.ok(!/babel/.test(dg.tex) && /^Not kept: 5 characters pdfLaTeX has no font or name for \(Devanagari: १२३; Bengali: ৪৫\)/.test(dg.warnings[0]), dg.warnings[0]);
  // a joiner stays between letters of these scripts and goes between Latin ones; the dandas all the scripts share come with Bengali alone
  const j = open(tiny(wp('क\u094d\u200dष र\u094d\u200dय a\u200db বাংলা। শেষ॥')));
  assert.ok(bodyOf(j.tex).includes('\nक\u094d\u200dष र\u094d\u200dय ab বাংলা। শেষ॥\n'), JSON.stringify(bodyOf(j.tex)));
  assert.deepEqual(j.warnings, []);
  // a word Word cut into runs at each change of font, with bold in the middle and the complex script mark: no space comes between
  const cut = open(tiny('<w:p>' + R('हि', '<w:rFonts w:cs="Mangal"/><w:lang w:bidi="hi-IN"/>') + R('न्', '<w:rFonts w:cs="Kokila"/><w:cs/>') + R('दी', '<w:rFonts w:cs="Nirmala UI"/><w:lang w:bidi="mr-IN"/>') + R(' की ', '<w:lang w:bidi="hi-IN"/>') + R('भा', '<w:rFonts w:cs="Mangal"/><w:b/><w:bCs/>') + R('षा', '<w:rFonts w:cs="Aparajita"/><w:b/><w:bCs/>') + '<w:r><w:t>।</w:t></w:r></w:p>'));
  assert.ok(bodyOf(cut.tex).includes('\nहिन्दी की \\textbf{भाषा}।\n'), bodyOf(cut.tex));
  // words in a Hindi run that read as LaTeX are words
  const bad = open(tiny(wp('नमस्ते \\input{/etc/passwd} \\babelprovide[main]{hindi} $x$ 50% {}')));
  assert.ok(bodyOf(bad.tex).includes('\nनमस्ते \\textbackslash input\\{/etc/passwd\\} \\textbackslash babelprovide{[}main{]}\\{hindi\\} \\$x\\$ 50\\% \\{\\}\n'), bodyOf(bad.tex));
  setUp(bad.tex, [INDIC_BABEL, ...HI]);
});

await ok('to Word: each run in one of India\'s scripts has its font and its language, left to right, in the order Word wants; Arabic beside it keeps its own', () => {
  const pre = linesFor('arabic', 'devanagari', 'bengali', 'tamil', 'chinese').join('\n') + '\n\\usepackage[normalem]{ulem}\n\\usepackage{xcolor}\n';
  const src = '\\documentclass{article}\n' + pre + '\\title{भारत}\n\\begin{document}\n\\maketitle\n\\section{परिचय}\n'
    + 'English हिन्दी शब्द and বাংলা here, مرحبا too, 中文 and தமிழ்.\\footnote{टिप्पणी: বাংলা।}\n\n'
    + '\\textbf{हिन्दी} \\emph{தமிழ்} \\texttt{कोड} \\textcolor{red}{लाल} \\uline{রেখা} क\u094d\u200dष।\n\n'
    + 'पहला वाक्य यहाँ है।\n% comment (अनीता) on "वाक्य": जाँचें।\n\n'
    + '\\begin{itemize}\n\\item पहला\n\\end{itemize}\n\n\\begin{tabular}{ll}\nदेश & 12 \\\\\n\\end{tabular}\n\\end{document}\n';
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  assert.equal(E.lost, 0);
  const parts = unzip(E.docx);
  const { d, st, se, fn } = exported(E);
  const ps = paras(d).map(bare);
  const P1 = (t) => ps.find((x) => textOf(x).includes(t));
  // a run pandoc wrote with two of the scripts is cut where the script changes; the Arabic run is right to left
  // and has no font of its own (the defaults name Amiri); Chinese keeps its East Asian hint
  assert.equal(P1('English').replace(/<w:r><w:rPr><w:rStyle w:val="FootnoteReference" \/>[\s\S]*$/, ''), '<w:pPr><w:pStyle w:val="FirstParagraph" /></w:pPr>'
    + hi('English हिन्दी शब्द and ') + run('বাংলা here, ', NIRMALA + langOf('bn-IN')) + run('مرحبا', RTL) + run(' too, ') + run('中文', EA) + run(' and தமிழ்.', NIRMALA + langOf('ta-IN')));
  // bold, italic, code, colour and underline: the font after the style, the language last
  assert.equal(P1('कोड'), '<w:pPr><w:pStyle w:val="BodyText" /></w:pPr>' + hi('हिन्दी', '<w:b /><w:bCs />') + run(' ') + run('தமிழ்', NIRMALA + '<w:i /><w:iCs />' + langOf('ta-IN')) + run(' ')
    + run('कोड', '<w:rStyle w:val="VerbatimChar" />' + NIRMALA + langOf('hi-IN')) + run(' ') + run('लाल', '<w:rStyle w:val="ColourFF0000" />' + NIRMALA + langOf('hi-IN')) + run(' ')
    + run('রেখা', NIRMALA + '<w:u w:val="single" />' + langOf('bn-IN')) + hi(' क\u094d\u200dष।'));
  assert.match(P1('भारत'), /<w:pStyle w:val="Title" \/>\s*<\/w:pPr>\s*<w:r><w:rPr><w:rFonts w:cs="Nirmala UI" \/><w:lang w:bidi="hi-IN" \/><\/w:rPr><w:t xml:space="preserve">भारत<\/w:t><\/w:r>/);
  assert.equal(P1('परिचय'), '<w:pPr><w:pStyle w:val="Heading1" /></w:pPr>' + hi('1 परिचय'));
  assert.equal(P1('देश'), '<w:pPr><w:pStyle w:val="Compact" /><w:jc w:val="left" /></w:pPr>' + hi('देश'));
  // the footnote and the comment are parts of their own: the same there
  assert.ok(bare(fn).includes(hi('टिप्पणी: ') + run('বাংলা।', NIRMALA + langOf('bn-IN'))), fn.slice(-700));
  assert.ok(text(parts.get('word/comments.xml')).includes(hi('जाँचें।')), text(parts.get('word/comments.xml')).slice(-500));
  // left to right: no run of these scripts is w:rtl, no paragraph w:bidi
  assert.equal((d.match(/<w:rtl \/>/g) || []).length, 1);
  assert.ok(!/w:bidi \/>|bidiVisual/.test(d));
  // every run's properties, old and new, stand in the schema's order, and the parts still parse
  assert.ok(rprInOrder(d) > 12 && rprInOrder(fn) >= 2 && rprInOrder(text(parts.get('word/comments.xml'))) >= 1);
  for (const part of [d, st, se, fn, text(parts.get('word/comments.xml'))]) parseXml(part, undefined, true);
  // the defaults are Arabic's and Chinese's; nothing of the preamble is text
  assert.equal(defaults(st), '<w:rPrDefault> <w:rPr> <w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsia="SimSun" w:cs="Amiri" /> <w:sz w:val="24" /> <w:szCs w:val="24" /> <w:lang w:bidi="ar-SA" w:eastAsia="zh-CN" w:val="en-US" /> </w:rPr> </w:rPrDefault>');
  const words = textOf(d);
  for (const w of ['babelprovide', 'babelfont', 'Noto', 'Harfbuzz', 'onchar', 'hindi', 'bengali', 'import=']) assert.ok(!words.includes(w), w);
  assert.equal(importInto(E.docx, files).files.size, 0);
  // a document in Hindi alone: its runs as above, the defaults as pandoc wrote them, nothing right to left
  const one = '\\documentclass{article}\n' + [INDIC_BABEL, ...HI].join('\n') + '\n\\begin{document}\nयह हिन्दी है। Plain English too.\n\nOnly English here.\n\\end{document}\n';
  const H = exported(exportFiles(new Map([['main.tex', one]])));
  assert.deepEqual(paras(H.d).map(bare), ['<w:pPr><w:pStyle w:val="FirstParagraph" /></w:pPr>' + hi('यह हिन्दी है। Plain English too.'), '<w:pPr><w:pStyle w:val="BodyText" /></w:pPr>' + run('Only English here.')]);
  assert.ok(!/w:rtl|w:bidi \/>/.test(H.d) && !/Amiri|SimSun|Nirmala/.test(H.st) && /w:cstheme="minorBidi"/.test(defaults(H.st)) && /<w:themeFontLang w:val="en-US" \/>/.test(H.se));
  // each of the nine has its language
  const all = '\\documentclass{article}\n' + linesFor(...INDIC.map((x) => x[0])).join('\n') + '\n\\begin{document}\nहिन्दी বাংলা ਪੰਜਾਬੀ ગુજરાતી ଓଡ଼ିଆ தமிழ் తెలుగు ಕನ್ನಡ മലയാളം\n\\end{document}\n';
  const A = exported(exportFiles(new Map([['main.tex', all]])));
  assert.deepEqual([...A.d.matchAll(/<w:rFonts w:cs="Nirmala UI" \/><w:lang w:bidi="([a-z]+-IN)" \/><\/w:rPr><w:t xml:space="preserve">([^<]*)</g)].map((m) => m[1] + ' ' + m[2].trim()),
    ['hi-IN हिन्दी', 'bn-IN বাংলা', 'pa-IN ਪੰਜਾਬੀ', 'gu-IN ગુજરાતી', 'or-IN ଓଡ଼ିଆ', 'ta-IN தமிழ்', 'te-IN తెలుగు', 'kn-IN ಕನ್ನಡ', 'ml-IN മലയാളം']);
});

await ok('a round trip through Word and back gives the same body for the Hindi file and the file of eight scripts', () => {
  for (const name of ['word-hindi.docx', 'word-indic.docx']) {
    const t1 = fixture(name).tex;
    const E1 = exportFiles(new Map([['main.tex', t1]]));
    assert.equal(E1.lost, 0, name);
    const r2 = open(E1.docx);
    assert.equal(bodyOf(r2.tex).replace(/\\tightlist\n/g, ''), bodyOf(t1), name);
    assert.deepEqual(preambleOf(r2.tex).split('\n').filter((l) => /babel/.test(l)), preambleOf(t1).split('\n').filter((l) => /babel/.test(l)), name);
    const r3 = open(exportFiles(new Map([['main.tex', r2.tex]])).docx);
    assert.equal(bodyOf(r3.tex), bodyOf(r2.tex), name);
    assert.equal(importInto(E1.docx, new Map([['main.tex', t1]])).files.size, 0, name);
  }
});

await ok('a coauthor\'s edit to a word in one of India\'s scripts is one small patch, never half a syllable', async () => {
  // a word is its letters with their marks and joiners; a change inside one is trimmed to whole syllables
  assert.deepEqual(textHunks('भारत की अर्थव्यवस्था', 'भारत कि अर्थव्यवस्था'), [{ a: 5, b: 7, A: 5, B: 7 }]);
  assert.deepEqual(textHunks('एक पक्ष है', 'एक पक्त है'), [{ a: 4, b: 7, A: 4, B: 7 }]);
  assert.deepEqual(textHunks('क\u094d\u200dष यहाँ', 'क\u094d\u200cष यहाँ'), [{ a: 0, b: 4, A: 0, B: 4 }]);
  assert.deepEqual(textHunks('நன்றி வணக்கம்', 'நன்றி வணக்கங்கள்'), [{ a: 11, b: 13, A: 11, B: 16 }]);
  assert.deepEqual(textHunks('می\u200cخواهم بروم', 'می\u200cخواهیم بروم'), [{ a: 7, b: 7, A: 7, B: 8 }]);
  assert.deepEqual(textHunks('a \ud83d\ude00 b', 'a \ud83d\ude01 b'), [{ a: 2, b: 4, A: 2, B: 4 }]);
  assert.deepEqual(textHunks('a café b', 'a cafés b'), [{ a: 6, b: 6, A: 6, B: 7 }]);
  const pre = linesFor('devanagari', 'tamil').join('\n') + '\n';
  const src = doc('भारत की \\textbf{अर्थव्यवस्था} तेज़ी से बढ़ रही है। इसमें क\u094d\u200dष और २०२४ हैं।\\footnote{स्रोत: विश्व बैंक।}\n\nTamil: நன்றி வணக்கம்.\n', pre);
  // (one paragraph after a paragraph with a footnote: unchanged, it is not read as moved)
  await roundTrip(src, (d) => d, src);
  const p1 = await roundTrip(src, rep('भारत की ', 'भारत कि '), src.replace('भारत की ', 'भारत कि '));
  assert.deepEqual(p1.applied.map((e) => [src.slice(e.s, e.e), e.t]), [['की', 'कि']]);
  const p2 = await roundTrip(src, (d) => rep('अर्थव्यवस्था', 'अर्थनीति')(rep('२०२४', '२०२५')(rep('வணக்கம்', 'வணக்கங்கள்')(rep('बढ़ रही', 'घट रही')(d)))),
    src.replace('अर्थव्यवस्था', 'अर्थनीति').replace('२०२४', '२०२५').replace('வணக்கம்', 'வணக்கங்கள்').replace('बढ़ रही', 'घट रही'));
  assert.equal(p2.stats.applied, 4);
  assert.equal(p2.stats.conflicts + p2.stats.skipped, 0);
  // text typed in Word with a joiner and with characters LaTeX reads: the joiner stays, the rest is escaped
  await roundTrip(src, rep('हैं।', 'हैं, र\u094d\u200dय भी & 50%।'), src.replace('हैं।\\footnote', 'हैं, र\u094d\u200dय भी \\& 50\\%।\\footnote'));
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  assert.equal(importInto(edit(E.docx, rep('विश्व बैंक', 'रिज़र्व बैंक'), 'word/footnotes.xml'), files).files.get('main.tex'), src.replace('विश्व बैंक', 'रिज़र्व बैंक'));
  // the owner changed the same word since: not applied, said in a comment
  const clash = importInto(edit(E.docx, rep('तेज़ी से', 'धीरे से')), new Map([['main.tex', src.replace('तेज़ी', 'जल्दी')]]));
  assert.equal(clash.stats.conflicts, 1);
  assert.ok(clash.files.get('main.tex').includes('जल्दी से') && /% comment \(Ana\) on "[^"]*": In Word: /.test(clash.files.get('main.tex')), clash.files.get('main.tex'));
});

await ok('a span with two scripts in it comes back from Word as one span: code, bold, italic and the rest, in India\'s scripts, Chinese and Arabic', () => {
  // each script's run has its own font and language in the Word file (or its direction, or the East Asian hint)
  const body = 'A \\texttt{कोड தமிழ்} and \\textbf{हिन्दी বাংলা தமிழ்} and \\emph{हिन्दी தமிழ்} here.\n\n'
    + '\\uline{हिन्दी தமிழ்} \\sout{हिन्दी தமிழ்} \\textcolor[HTML]{C00000}{हिन्दी தமிழ்} \\textsc{हिन्दी தமிழ்} x\\textsuperscript{हिन्दी தமிழ்}.\n\n'
    + '\\texttt{中文 code} \\texttt{عربي code كلمة} \\textbf{中文 and عربي here} \\texttt{x\\_y z}.';
  const src = '\\documentclass{article}\n' + linesFor('chinese', 'arabic', 'devanagari', 'bengali', 'tamil').join('\n') + '\n\\usepackage[normalem]{ulem}\n\\usepackage{xcolor}\n\\begin{document}\n' + body + '\n\\end{document}\n';
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  // in the file the code span is two runs, one for each script
  assert.ok(bare(exported(E).d).includes(run('कोड ', '<w:rStyle w:val="VerbatimChar" />' + NIRMALA + langOf('hi-IN')) + run('தமிழ்', '<w:rStyle w:val="VerbatimChar" />' + NIRMALA + langOf('ta-IN'))));
  const back = bodyOf(open(E.docx).tex);
  assert.equal(back, '\\begin{document}\n\n' + body + '\n\n\\end{document}\n');
  assert.equal(importInto(E.docx, files).files.size, 0);
  // the spaces of code TeX would drop keep pandoc's "\ ": two together, one at an end; a space after a backslash's name is none
  const made = P.convert({ from: 'markdown', to: 'docx', 'output-file': 'out.docx' }, 'Code `two words`, `a  b`, `back\\ slash` and `x_y {z} 50%`.\n', {}).files['out.docx'];
  assert.ok(bodyOf(open(made).tex).includes('\nCode \\texttt{two words}, \\texttt{a\\ \\ b}, \\texttt{back\\textbackslash{} slash} and \\texttt{x\\_y \\{z\\} 50\\%}.\n'), open(made).tex);
  const ends = bodyOf(open(edit(made, rep('>two words<', '> two words <'))).tex);
  assert.ok(ends.includes('\\texttt{\\ two words\\ },'), ends);
  // code runs side by side in a stranger's file are one span too, whatever fonts cut them (pandoc reads no bold on code)
  const V = (t, rpr = '') => '<w:r><w:rPr><w:rStyle w:val="VerbatimChar"/>' + rpr + '</w:rPr><w:t xml:space="preserve">' + t + '</w:t></w:r>';
  const st = { 'word/styles.xml': '<w:styles ' + NSW + '><w:style w:type="character" w:styleId="VerbatimChar"><w:name w:val="Verbatim Char"/></w:style></w:styles>' };
  const cut = bodyOf(open(tiny('<w:p><w:r><w:t xml:space="preserve">See </w:t></w:r>' + V('print(', '<w:rFonts w:ascii="Consolas"/>') + V('"नमस्ते', '<w:rFonts w:cs="Mangal"/><w:lang w:bidi="hi-IN"/>') + V(' வணக்கம்"', '<w:rFonts w:cs="Latha"/><w:lang w:bidi="ta-IN"/>') + V(')') + V(' end', '<w:b/>') + '<w:r><w:t>.</w:t></w:r></w:p>', st)).tex);
  assert.ok(cut.includes('\nSee \\texttt{print("नमस्ते வணக்கம்") end}.\n'), cut);
});

// ---- Japanese, Korean, Hebrew, Thai and Sinhala ------------------------------------------------

const needsOf = (ids, flags = {}) => Object.assign(ids, { arabicMain: false, hebrewMain: false }, flags);
const JA = ['\\babelprovide[import=ja, onchar=ids fonts]{japanese}', '\\babelfont[japanese]{rm}{Harano Aji Mincho}', '\\babelfont[japanese]{sf}{Harano Aji Gothic}', '\\babelfont[japanese]{tt}{Harano Aji Gothic}'];
// the properties of the run that holds these words
const propsOf = (xml, words) => { const m = new RegExp('<w:r>(?:<w:rPr>((?:(?!</w:rPr>)[\\s\\S])*)</w:rPr>)?<w:t xml:space="preserve">[^<]*' + words + '[^<]*</w:t></w:r>').exec(bare(xml)); assert.ok(m, words); return m[1] || ''; };

await ok('a Japanese Word file opens set up for Japanese: kana and kanji joined across runs, full width punctuation, a ruby\'s word kept and its reading told', () => {
  const r = fixture('word-japanese.docx');
  const t = r.tex, b = bodyOf(t);
  assert.deepEqual(scriptLines(needsOf(['japanese']), ''), [INDIC_BABEL, ...JA]);
  setUp(t, [INDIC_BABEL, ...JA]);
  assert.ok(t.includes('\n\\title{日本の経済成長}\n'));
  for (const s of ['\\section{はじめに}',
    // seven runs of three fonts and a ruby: one sentence, no space in it
    '\n本稿では、\\textbf{制度}が経済成長に与える影響を\\emph{データ}で検証する。\\footnote{出典：\\textbf{世界銀行}。}\n',
    '\n「引用」と『書名』、コーヒー・ｶﾀｶﾅ…全角\u3000空格！ＡＢＣ１２３。\n',
    '\\item\n  第一に、データ\n\\item\n  第二に、方法\n\\end{itemize}', '国 & 成長率 \\\\\n\\midrule\n日本 & 1.2 \\\\\nペルー & 3.1 \\\\', '\nThe model (モデル) uses GDP データ from 2020.\n'])
    assert.ok(b.includes(s), s + '\n' + b);
  assert.ok(!t.includes('けいざい') && !/ctex|chinese|fontspec|MS Mincho|ja-JP/.test(t), t);
  assert.deepEqual(r.warnings, ['Not kept: the readings set above 1 word (ruby); the words are kept.']);
  assert.ok(isBalanced(t, 0, t.length) && !/[\uE000-\uE01F]/.test(t));
});

await ok('a Korean Word file opens set up for Korean: words with their spaces, a syllable spelt in its letters, hanja', () => {
  const r = fixture('word-korean.docx');
  const t = r.tex, b = bodyOf(t);
  // its hanja are set by the Chinese lines: a Korean font has few thousand of them, and with
  // two such scripts each keeps to its serif
  setUp(t, scriptLines(needsOf(['chinese', 'korean']), ''));
  assert.ok(/Babel\.script_blocks\.Kore/.test(preambleOf(t)) && preambleOf(t).includes('\\babelfont[chinese]{rm}{FandolSong}') && !/FandolHei|NanumGothic/.test(preambleOf(t)));
  assert.ok(preambleOf(t).includes('\\babelprovide[import=ko, onchar=ids fonts]{korean}\n\\babelfont[korean]{rm}{NanumMyeongjo}\n') && t.includes('\n\\title{한국의 경제 성장}\n'));
  for (const s of ['\\section{서론}', '\n본 논문은 \\textbf{제도}가 경제 성장(經濟成長)에 미치는 영향을 분석한다. \u1112\u119e\u11ab글 2024년 3.5\\%.\\footnote{출처: 세계은행.}\n',
    '\\item\n  첫째, 자료\n\\item\n  둘째, 방법\n\\end{enumerate}', '나라 & 성장률 \\\\\n\\midrule\n한국 & 2.6 \\\\\n페루 & 3.1 \\\\', '\nThe model (모형) uses GDP data.\n'])
    assert.ok(b.includes(s), s + '\n' + b);
  assert.ok(!/ctex|Batang|ko-KR/.test(t));
  assert.deepEqual(r.warnings, []);
});

await ok('a Hebrew Word file opens as a right to left document: points and cantillation marks kept, text in reading order, its English paragraph turned', () => {
  const r = fixture('word-hebrew.docx');
  const t = r.tex, b = bodyOf(t);
  const lines = scriptLines(needsOf(['hebrew'], { hebrewMain: true }), '');
  assert.deepEqual(lines.slice(0, 3), [BABEL, '\\babelprovide[import=he, main]{hebrew}', '\\babelfont{rm}[Renderer=Harfbuzz]{Hadasim CLM}']);
  setUp(t, lines);
  assert.equal(rtlDocument(t), true);
  assert.ok(t.includes('\n\\title{צמיחה ומוסדות}\n'));
  for (const s of ['\\section{מבוא}', '\nאנו חוקרים את \\textbf{הצמיחה} במוסדות חלשים, בשיעור של 5\\% בשנת 2024; האם זה נכון?\\footnote{נתוני הבנק העולמי, 2024.}\n',
    // shin with its dot and qamats, holam; a tipcha and a munach among the points; the maqaf and the geresh; the direction marks gone
    '\n\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd \u05e2\u05d5\u05b9\u05dc\u05b8\u05dd, \u05d1\u05b0\u05bc\u05e8\u05b5\u05d0\u05e9\u05b4\u05c1\u0596\u05d9\u05ea \u05d1\u05b8\u05bc\u05e8\u05b8\u05a3\u05d0 ועוד: בית\u05beספר, ג\u05f3ירפה, World Bank (GDP) גם.\n',
    // "right" in a right to left paragraph is its far edge, flushright's there
    '\n\\begin{flushright}\nיישור לקצה.\n\\end{flushright}\n', '\\item\n  התוצאה הראשונה\n\\item\n  התוצאה השנייה\n\\end{itemize}',
    'מדינה & צמיחה \\\\\n\\midrule\nפרו & 3.1 \\\\\nישראל & 2.4 \\\\', '\n\\begin{otherlanguage}{english}\nAn English paragraph in the Hebrew document.\n\\end{otherlanguage}\n'])
    assert.ok(b.includes(s), s + '\n' + b);
  assert.equal((b.match(/otherlanguage/g) || []).length, 2);
  assert.ok(!/\\RL|arabic|Amiri|David|he-IL|[\u200e\u200f]/.test(t), t);
  assert.deepEqual(r.warnings, []);
});

await ok('an English Word file with a line each of Thai, Sinhala, Hebrew, Japanese and Korean: all five set up, the Hebrew paragraph in its own environment, nothing of the file\'s in the preamble', () => {
  const r = fixture('word-scripts.docx');
  const t = r.tex, b = bodyOf(t);
  const lines = scriptLines(needsOf(['japanese', 'korean', 'hebrew', 'thai', 'sinhala']), '');
  assert.equal(lines.length, 23);  // babel's, four a script, the dandas' and joiners', and Korean giving up Chinese characters
  setUp(t, lines);
  assert.equal(rtlDocument(t), false);
  assert.deepEqual(preambleOf(t).trim().split('\n').map((l) => l.replace(/^\\usepackage\[letterpaper.*$/, 'GEOMETRY')), ['\\documentclass[11pt]{article}', 'GEOMETRY', ...lines, '\\usepackage{amsmath,amssymb}', '\\usepackage{booktabs}']);
  for (const s of [
    // Thai has no space between its words and none comes between its runs; tone marks and digits as they are
    'Thai: \\textbf{ภาษาไทย}เป็นภาษาราชการของประเทศไทย น\u0e49\u0e33ด\u0e37\u0e48ม ๑๒๓',
    // the joiner in sri stays
    'Sinhala: \\textbf{සිංහල} ආයුබෝවන්, ස්තුතියි. \u0dc1\u0dca\u200d\u0dbb\u0dd3 ලංකා',
    'Hebrew: שלום עולם means hello, world.', '\\begin{otherlanguage}{hebrew}\nזוהי פסקה שלמה בעברית בתוך מסמך באנגלית.\n\\end{otherlanguage}',
    'Japanese: 日本語のテキストです。', 'Korean: 한국어 문장입니다.', 'ขอบคุณ & ස්තුතියි & תודה & ありがとう & 감사합니다 \\\\',
    'Type \\textbackslash babelprovide{[}main{]}\\{hebrew\\} or \\textbackslash input\\{/etc/passwd\\}: ไทย.'])
    assert.ok(b.includes('\n' + s + '\n'), s + '\n' + b);
  assert.ok(!/\\input|\\write|Evil|th-TH|ja-JP|Angsana|Iskoola|David/.test(t.replace(/\\textbackslash input/g, '')), t);
  assert.deepEqual(r.warnings, []);
});

await ok('the five scripts beside others: Arabic and Hebrew paragraphs each in their own environment, kana beside Chinese, a ruby in a stranger\'s file, scripts that still have no font', () => {
  const R = (t, rpr = '<w:rtl/>') => '<w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + t + '</w:t></w:r>';
  const p = (ppr, runs) => '<w:p><w:pPr>' + ppr + '</w:pPr>' + runs + '</w:p>';
  const eng = wp('An English paragraph that is long enough to make the document one that runs left to right as a whole, whatever else it holds.');
  // a right to left group is Hebrew's or Arabic's by its letters
  const two = open(tiny(eng + p('<w:bidi/>', R('זוהי פסקה בעברית.')) + p('<w:bidi/>', R('ועוד אחת, עם كلمة.')) + eng + p('<w:bidi/>', R('هذه فقرة عربية.')) + eng));
  assert.ok(bodyOf(two.tex).includes('\n\\begin{otherlanguage}{hebrew}\nזוהי פסקה בעברית.\n\nועוד אחת, עם كلمة.\n\\end{otherlanguage}\n') && bodyOf(two.tex).includes('\n\\begin{otherlanguage}{arabic}\nهذه فقرة عربية.\n\\end{otherlanguage}\n'), two.tex);
  setUp(two.tex, scriptLines(needsOf(['arabic', 'hebrew']), ''));
  // mostly Hebrew, typed without setting a paragraph right to left: a Hebrew document, nothing wrapped
  const plainHe = open(tiny(wp('זוהי פסקה ראשונה בעברית במסמך.') + wp('Short.')));
  assert.ok(preambleOf(plainHe.tex).includes('\\babelprovide[import=he, main]{hebrew}') && !plainHe.tex.includes('otherlanguage'), plainHe.tex);
  // Chinese characters beside kana are Japan's: one set up, no ctex; beside hangul Korea's
  const jz = open(tiny(wp('漢字とかなの文章です。') + wp('中文文本')));
  setUp(jz.tex, [INDIC_BABEL, ...JA]);
  assert.deepEqual(jz.warnings, []);
  // a ruby: the word stays in its sentence, the reading is told; with no ruby nothing is said
  const rb = open(tiny('<w:p><w:r><w:t>東京の</w:t></w:r><w:r><w:ruby><w:rubyPr/><w:rt><w:r><w:t>とうきょう</w:t></w:r></w:rt><w:rubyBase><w:r><w:rPr><w:b/></w:rPr><w:t>東京</w:t></w:r></w:rubyBase></w:ruby></w:r><w:r><w:t>です \\input{x}。</w:t></w:r></w:p>'));
  assert.ok(bodyOf(rb.tex).includes('\n東京の\\textbf{東京}です \\textbackslash input\\{x\\}。\n') && !rb.tex.includes('とうきょう') && rb.warnings[0] === 'Not kept: the readings set above 1 word (ruby); the words are kept.', rb.tex);
  // Thai digits alone are no Thai text; Khmer, Lao, Tibetan, Georgian, Armenian and Ethiopic have no font and are named
  const rest = open(tiny(wp('Total ๑๒๓ ខ្មែរ ລາວ བོད ქართული Հայ አማርኛ')));
  assert.ok(!/babel/.test(rest.tex) && /^Not kept: 28 characters pdfLaTeX has no font or name for \(Thai: ๑๒๓; Khmer: ខ្មែរ; Lao: ລາວ; Tibetan: བོད; Georgian: ქართული; Armenian: Հայ; Ethiopic: አማርኛ\)/.test(rest.warnings[0]), rest.warnings[0]);
  // a joiner stays in Sinhala and goes between Latin letters; Thai's zero width space goes as before
  const j = open(tiny(wp('\u0dc1\u0dca\u200d\u0dbb\u0dd3 a\u200db ภาษา\u200bไทย')));
  assert.ok(bodyOf(j.tex).includes('\n\u0dc1\u0dca\u200d\u0dbb\u0dd3 ab ภาษาไทย\n'), JSON.stringify(bodyOf(j.tex)));
});

await ok('to Word: Hebrew runs are right to left with their font and language, Thai and Sinhala have theirs, Japanese and Korean the East Asian ones; the defaults are the document\'s', () => {
  const pre = scriptLines(needsOf(['arabic', 'japanese', 'korean', 'hebrew', 'thai', 'sinhala']), '').join('\n') + '\n';
  const src = '\\documentclass{article}\n' + pre + '\\begin{document}\n'
    + 'English עברית here, مرحبا too, ไทย and සිංහල, 日本語のテキスト and 한국어 문장.\\footnote{הערה ו ไทย.}\n\n'
    + '\\textbf{עברית} \\texttt{ไทย} \\emph{かなです} \\textbf{한글} \\textbf{සිංහල}.\n\n'
    + '\\begin{otherlanguage}{hebrew}\nפסקה בעברית עם 12.\n\\end{otherlanguage}\n\\end{document}\n';
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  assert.equal(E.lost, 0);
  const { d, st, se, fn } = exported(E);
  // Hebrew beside Arabic: the defaults are Arabic's, so the Hebrew run names its own; both are right to left
  const HE = '<w:rFonts w:cs="Times New Roman" />', HE_LANG = '<w:lang w:bidi="he-IL" />';
  assert.equal(propsOf(d, 'עברית'), HE + RTL + HE_LANG);
  assert.equal(propsOf(d, 'مرحبا'), RTL);
  assert.equal(propsOf(d, 'פסקה בעברית עם 12'), HE + RTL + HE_LANG);
  assert.ok(bare(d).includes('<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run('פסקה בעברית עם 12.', HE + RTL + HE_LANG)), d);
  // Thai and Sinhala: complex scripts set left to right, each its own font
  assert.ok(/^<w:rFonts w:cs="Leelawadee UI" \/><w:lang w:bidi="th-TH" \/>$/.test(propsOf(d, 'ไทย and ')), propsOf(d, 'ไทย and '));
  assert.ok(/^<w:rFonts (w:hint="eastAsia" )?w:cs="Nirmala UI" \/><w:lang w:bidi="si-LK" \/>$/.test(propsOf(d, 'සිංහල, ')), propsOf(d, 'සිංහල, '));
  // both Japan's and Korea's set up, more kana than hangul: the defaults are Japanese, hangul names Korean on its runs
  assert.equal(defaults(st), '<w:rPrDefault> <w:rPr> <w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsia="Yu Mincho" w:cs="Amiri" /> <w:sz w:val="24" /> <w:szCs w:val="24" /> <w:lang w:bidi="ar-SA" w:eastAsia="ja-JP" w:val="en-US" /> </w:rPr> </w:rPrDefault>');
  assert.match(se, /<w:themeFontLang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA" \/>/);
  assert.ok(!/w:eastAsia="/.test(propsOf(d, '日本語のテキスト')) && /w:eastAsia="Malgun Gothic"/.test(propsOf(d, '한국어 문장')) && /<w:lang w:eastAsia="ko-KR" \/>$/.test(propsOf(d, '한국어 문장')), propsOf(d, '한국어 문장'));
  // bold, code and italic: the font after the style, the direction before the language
  assert.ok(bare(d).includes(run('עברית', HE + '<w:b /><w:bCs />' + RTL + HE_LANG) + run(' ') + run('ไทย', '<w:rStyle w:val="VerbatimChar" /><w:rFonts w:cs="Leelawadee UI" /><w:lang w:bidi="th-TH" />')), d);
  assert.ok(/<w:i \/><w:iCs \/><\/w:rPr><w:t xml:space="preserve">かなです</.test(bare(d)) && /w:eastAsia="Malgun Gothic" \/><w:b \/><w:bCs \/><w:lang w:eastAsia="ko-KR" \/><\/w:rPr><w:t xml:space="preserve">한글</.test(bare(d)) && bare(d).includes(run('සිංහල', NIRMALA + '<w:b /><w:bCs />' + langOf('si-LK'))), d);
  assert.ok(bare(fn).includes(run('הערה ו', HE + RTL + HE_LANG)) && /<w:rFonts w:cs="Leelawadee UI" \/><w:lang w:bidi="th-TH" \/><\/w:rPr><w:t xml:space="preserve">[^<]*ไทย/.test(bare(fn)), fn.slice(-600));
  assert.ok(rprInOrder(d) > 10 && rprInOrder(fn) >= 2);
  for (const part of [d, st, se, fn]) parseXml(part, undefined, true);
  const words = textOf(d);
  for (const w of ['babelprovide', 'babelfont', 'Noto', 'Harano', 'Nanum', 'Harfbuzz', 'onchar', 'hebrew', 'directlua']) assert.ok(!words.includes(w), w);
  assert.equal(importInto(E.docx, files).files.size, 0);

  // a Hebrew document: right to left as a whole, the defaults Hebrew's, so its runs need say only their direction
  const hsrc = '\\documentclass{article}\n' + scriptLines(needsOf(['hebrew'], { hebrewMain: true }), '').join('\n') + '\n\\title{כותרת}\n\\begin{document}\n\\maketitle\n\\section{מבוא}\nזוהי פסקה בעברית with English ו־2024.\n\n'
    + '\\begin{otherlanguage}{english}\nAn English paragraph.\n\\end{otherlanguage}\n\n\\begin{tabular}{ll}\nא & ב \\\\\n\\end{tabular}\n\\end{document}\n';
  assert.equal(rtlDocument(hsrc), true);
  const hfiles = new Map([['main.tex', hsrc]]);
  const HEx = exportFiles(hfiles);
  const H = exported(HEx);
  const hp = paras(H.d).map(bare);
  assert.deepEqual(hp.filter((x) => !/^\s*<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<w:bidi \/>/.test(x)).map(textOf), ['An English paragraph.']);
  assert.ok(hp.includes('<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>' + run('זוהי פסקה בעברית ', RTL) + run('with English') + run(' ו־2024.', RTL)), H.d);
  assert.match(H.d, /<w:tblStyle w:val="Table" \/><w:bidiVisual \/>/);
  assert.match(H.d, /<w:bidi \/><\/w:sectPr>/);
  assert.equal(defaults(H.st), '<w:rPrDefault> <w:rPr> <w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:hAnsiTheme="minorHAnsi" w:cs="Times New Roman" /> <w:sz w:val="24" /> <w:szCs w:val="24" /> <w:lang w:bidi="he-IL" w:eastAsia="zh-CN" w:val="en-US" /> </w:rPr> </w:rPrDefault>');
  assert.match(H.se, /<w:themeFontLang w:val="en-US" w:bidi="he-IL" \/>/);
  assert.ok(!/Amiri|ar-SA|w:cs="Times New Roman" \/><w:rtl/.test(H.d + H.st));
  assert.equal(importInto(HEx.docx, hfiles).files.size, 0);

  // the East Asian language of the defaults is the one the document sets up
  const eaOf = (preamble, body) => { const X = exported(exportFiles(new Map([['main.tex', '\\documentclass{article}\n' + preamble + '\n\\begin{document}\n' + body + '\n\\end{document}\n']]))); return [(/w:eastAsia="([^"]*)"/.exec(defaults(X.st).split('<w:lang')[0]) || [])[1], (/<w:lang[^>]* w:eastAsia="([^"]*)"/.exec(defaults(X.st)) || [])[1], X.d]; };
  const [jf, jl, jd] = eaOf([INDIC_BABEL, ...JA].join('\n'), '日本語のテキストです。漢字だけ：経済成長。');
  assert.deepEqual([jf, jl], ['Yu Mincho', 'ja-JP']);
  assert.ok(!/w:eastAsia="/.test(jd) && !/w:rtl|w:bidi \/>/.test(jd));
  assert.deepEqual(eaOf(scriptLines(needsOf(['korean']), '').join('\n'), '한국어 문장입니다. 經濟成長.').slice(0, 2), ['Malgun Gothic', 'ko-KR']);
  // set up for Japanese, the text all kanji: still Japanese
  assert.deepEqual(eaOf([INDIC_BABEL, ...JA].join('\n'), '経済成長').slice(0, 2), ['Yu Mincho', 'ja-JP']);
  // a Chinese document with a Japanese and a Korean line: the defaults stay Chinese, the two lines name their own
  const [cf, cl, cd] = eaOf(CTEX, '中文文本，研究表明。\n\n日本語のテキストです。\n\n한국어 문장입니다.');
  assert.deepEqual([cf, cl], ['SimSun', 'zh-CN']);
  assert.ok(/w:eastAsia="Yu Mincho" \/><w:lang w:eastAsia="ja-JP" \/>$/.test(propsOf(cd, '日本語のテキスト')) && /w:eastAsia="Malgun Gothic" \/><w:lang w:eastAsia="ko-KR" \/>$/.test(propsOf(cd, '한국어')) && !/w:eastAsia="/.test(propsOf(cd, '中文文本')), cd);
  assert.ok(rprInOrder(cd) >= 3);
});

await ok('a round trip through Word and back gives the same body for the Japanese, Korean, Hebrew and five script files', () => {
  for (const name of ['word-japanese.docx', 'word-korean.docx', 'word-hebrew.docx', 'word-scripts.docx']) {
    const t1 = fixture(name).tex;
    const E1 = exportFiles(new Map([['main.tex', t1]]));
    assert.equal(E1.lost, 0, name);
    const r2 = open(E1.docx);
    assert.equal(bodyOf(r2.tex).replace(/\\tightlist\n/g, ''), bodyOf(t1), name);
    assert.deepEqual(preambleOf(r2.tex).split('\n').filter((l) => /[bB]abel/.test(l)), preambleOf(t1).split('\n').filter((l) => /[bB]abel/.test(l)), name);
    const r3 = open(exportFiles(new Map([['main.tex', r2.tex]])).docx);
    assert.equal(bodyOf(r3.tex), bodyOf(r2.tex), name);
    assert.equal(importInto(E1.docx, new Map([['main.tex', t1]])).files.size, 0, name);
  }
});

await ok('a coauthor\'s edit in Japanese, Thai, Korean, Hebrew or Sinhala is a small patch: Thai by its words, kana by character, never half a cluster', async () => {
  // Thai has no spaces: two words changed at the ends of a sentence are two changes, each its word's
  assert.deepEqual(textHunks('ภาษาไทยเป็นภาษาราชการของประเทศไทย', 'ภาษาลาวเป็นภาษาราชการของประเทศลาว'), [{ a: 4, b: 7, A: 4, B: 7 }, { a: 30, b: 33, A: 30, B: 33 }]);
  assert.deepEqual(textHunks('ภาษาไทยเป็นภาษาราชการของประเทศไทย', 'ภาษาไทยเป็นภาษาประจำชาติของประเทศไทย'), [{ a: 15, b: 21, A: 15, B: 24 }]);
  // a vowel changed under a tone mark is its consonant's cluster changed; sara am stays with its consonant
  assert.deepEqual(textHunks('น\u0e49\u0e33ด\u0e37\u0e48ม', 'น\u0e49\u0e33ด\u0e34\u0e48ม'), [{ a: 3, b: 6, A: 3, B: 6 }]);
  assert.deepEqual(textHunks('ทำ', 'ทา'), [{ a: 0, b: 2, A: 0, B: 2 }]);
  // kana and kanji by character; Korean and Hebrew by their words; a point added is its letter changed
  assert.deepEqual(textHunks('日本語のテキストです', '日本語の文章です'), [{ a: 4, b: 8, A: 4, B: 6 }]);
  assert.deepEqual(textHunks('한국어 문장입니다', '한국어 문서입니다'), [{ a: 5, b: 6, A: 5, B: 6 }]);
  assert.deepEqual(textHunks('\u1112\u119e\u11ab글', '\u1112\u1161\u11ab글'), [{ a: 0, b: 3, A: 0, B: 3 }]);
  assert.deepEqual(textHunks('שלום עולם', 'שלום עו\u05b9ל\u05b8ם'), [{ a: 6, b: 8, A: 6, B: 10 }]);
  // Sinhala's conjunct with its joiner is one cluster
  assert.deepEqual(textHunks('\u0dc1\u0dca\u200d\u0dbb\u0dd3 ලංකා', '\u0dc1\u0dca\u200d\u0dbb\u0dcf ලංකා'), [{ a: 0, b: 5, A: 0, B: 5 }]);
  const pre = scriptLines(needsOf(['japanese', 'korean', 'hebrew', 'thai', 'sinhala']), '').join('\n') + '\n';
  const src = doc('ภาษาไทยเป็น\\textbf{ภาษาราชการ}ของประเทศไทย\n\n日本語の\\emph{テキスト}です。한국어 문장입니다.\n\nA phrase, \\foreignlanguage{hebrew}{שלום עולם}, and \u0dc1\u0dca\u200d\u0dbb\u0dd3 ලංකා.\\footnote{出典：世界銀行。}\n\nLast.\n', pre);
  await roundTrip(src, (d) => d, src);
  const p1 = await roundTrip(src, rep('ของประเทศไทย', 'ของประเทศลาว'), src.replace('ของประเทศไทย', 'ของประเทศลาว'));
  assert.deepEqual(p1.applied.map((e) => [src.slice(e.s, e.e), e.t]), [['ไทย', 'ลาว']]);
  const p2 = await roundTrip(src, (d) => rep('ภาษาราชการ', 'ภาษาทางการ')(rep('テキスト', 'テクスト')(rep('문장입니다', '문서입니다')(rep('שלום עולם', 'שלום רב')(rep('ලංකා', 'ලංකාව')(d))))),
    src.replace('ภาษาราชการ', 'ภาษาทางการ').replace('テキスト', 'テクスト').replace('문장입니다', '문서입니다').replace('שלום עולם', 'שלום רב').replace('ලංකා', 'ලංකාව'));
  assert.equal(p2.stats.applied, 5);
  assert.equal(p2.stats.conflicts + p2.stats.skipped, 0);
  assert.ok(p2.applied.every((e) => src.slice(e.s, e.e).length <= 4 && e.t.length <= 4), JSON.stringify(p2.applied.map((e) => [src.slice(e.s, e.e), e.t])));
  // Hebrew typed in Word with a point, a maqaf and characters LaTeX reads
  await roundTrip(src, rep('שלום עולם', 'שלום עו\u05b9לם, בית\u05beספר & 50%'), src.replace('שלום עולם', 'שלום עו\u05b9לם, בית\u05beספר \\& 50\\%'));
  const files = new Map([['main.tex', src]]);
  const E = exportFiles(files);
  assert.equal(importInto(edit(E.docx, rep('世界銀行', '日本銀行'), 'word/footnotes.xml'), files).files.get('main.tex'), src.replace('世界銀行', '日本銀行'));
  // a word with a ruby added over it in Word reads as the word: nothing changes
  const withRuby = edit(E.docx, (d) => d.replace(/<w:r>((?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?)<w:t xml:space="preserve">日本語の<\/w:t><\/w:r>/, (m, rpr) => '<w:r><w:ruby><w:rubyPr/><w:rt><w:r><w:t>にほんご</w:t></w:r></w:rt><w:rubyBase><w:r>' + rpr + '<w:t>日本語</w:t></w:r></w:rubyBase></w:ruby></w:r><w:r>' + rpr + '<w:t>の</w:t></w:r>'));
  assert.notEqual(withRuby.length, E.docx.length);
  assert.equal(importInto(withRuby, files).files.size, 0);
});

await ok('the page\'s set up goes to Word and comes back: paper, margins, columns, headers and footers with their fields, numbers, line numbers, colour, border', async () => {
  const src = '\\documentclass[twocolumn,twoside]{article}\n\\usepackage[a4paper,landscape,margin=2cm,bindingoffset=1cm]{geometry}\n\\usepackage{fancyhdr}\n\\usepackage{lastpage}\n\\pagestyle{fancy}\n\\fancyhf{}\n\\renewcommand{\\headrulewidth}{0pt}\n'
    + '\\fancyhead[LE,RO]{\\thepage}\n\\fancyhead[RE,LO]{\\textbf{My} paper \\& notes}\n\\fancyfoot[C]{Page \\thepage\\ of \\pageref{LastPage}}\n\\usepackage[pagewise]{lineno}\n\\linenumbers\n\\modulolinenumbers[5]\n\\usepackage{xcolor}\n\\pagecolor{yellow!10}\n'
    + '\\usepackage{tikz}\n\\AddToHook{shipout/background}{\\begin{tikzpicture}[remember picture,overlay]\\draw ([shift={(1cm,-1cm)}]current page.north west) rectangle ([shift={(-1cm,1cm)}]current page.south east);\\end{tikzpicture}}\n'
    + '\\begin{document}\n\\pagenumbering{roman}\n\\setcounter{page}{3}\nHello.\n\\end{document}\n';
  const files = new Map([['main.tex', src]]);
  const m = buildModel({ files, main: 'main.tex' });
  const W = buildWordDoc(m, files, { main: 'main.tex' });
  const E = exportDocx(P, { doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources: {}, bibs: [], page: pageForWord(m, src), project: { name: 'P', main: 'main.tex', files: [...files] } });
  const parts = unzip(E.docx);
  const d = text(parts.get('word/document.xml'));
  const sect = d.slice(d.lastIndexOf('<w:sectPr'));
  assert.match(sect, /<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
  assert.match(sect, /<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" [^>]*w:gutter="567"\/>/);
  assert.match(sect, /<w:pgBorders w:offsetFrom="page"><w:top w:val="single" w:sz="3" w:space="28"/);
  assert.match(sect, /<w:lnNumType w:countBy="5" w:restart="newPage"\/><w:pgNumType w:fmt="lowerRoman" w:start="3"\/><w:cols w:num="2" w:space="199"\/>/);
  assert.match(sect, /<w:headerReference w:type="default" r:id="rIdRikuyHF1"\/><w:headerReference w:type="even" r:id="rIdRikuyHF2"\/><w:footerReference w:type="default"/);
  assert.match(d, /<w:background w:color="FFFFE6"\/>/);
  const settings = text(parts.get('word/settings.xml'));
  assert.ok(settings.indexOf('<w:evenAndOddHeaders/>') > settings.indexOf('<w:defaultTabStop') && settings.indexOf('<w:displayBackgroundShape/>') > settings.indexOf('<w:zoom'));
  // the odd header: the title at the left, the page's number at the right; the even one mirrored
  const h1 = text(parts.get('word/header1.xml')), h2 = text(parts.get('word/header2.xml'));
  assert.match(h1, /<w:b\/><\/w:rPr><w:t xml:space="preserve">My<\/w:t>[\s\S]*paper &amp; notes[\s\S]*<w:tab\/>[\s\S]*<w:tab\/>[\s\S]*<w:fldSimple w:instr="PAGE">/);
  assert.match(h2, /^[\s\S]*<\/w:pPr><w:fldSimple w:instr="PAGE">/);
  assert.match(text(parts.get('word/footer3.xml')), /Page <\/w:t><\/w:r><w:fldSimple w:instr="PAGE">[\s\S]* of <\/w:t><\/w:r><w:fldSimple w:instr="NUMPAGES">/);
  assert.match(text(parts.get('[Content_Types].xml')), /PartName="\/word\/header1.xml" ContentType="application\/vnd.openxmlformats-officedocument.wordprocessingml.header\+xml"/);
  // and opened again as a Word file: the same constructs in LaTeX
  const back = docxToLatex(P, E.docx, 'x.docx').tex;
  for (const want of ['\\documentclass[12pt,twocolumn,twoside]{article}', 'landscape', 'bindingoffset=1cm', '\\usepackage{fancyhdr}', '\\pagestyle{fancy}', '\\fancyhead[RO]{\\thepage{}}', '\\fancyhead[LO]{My paper \\& notes}', '\\fancyhead[LE]{\\thepage{}}',
    '\\fancyfoot[CO]{Page \\thepage{} of \\pageref{LastPage}}', '\\usepackage{lastpage}', '\\usepackage[pagewise]{lineno}', '\\linenumbers', '\\modulolinenumbers[5]', '\\pagecolor[HTML]{FFFFE6}', 'shipout/background', '\\begin{document}\n\\pagenumbering{roman}\n\\setcounter{page}{3}']) {
    assert.ok(back.includes(want.replace('[12pt,', back.includes('[12pt,') ? '[12pt,' : '[')), 'opened again it has ' + want + ':\n' + back.slice(0, 1400));
  }
  assert.ok(!/Not kept:.*header/.test(back), back.slice(0, 400));
  // a header Word wrote: the page number as a field of three parts, the text centred by alignment
  assert.deepEqual(hfPlaces('<w:hdr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Draft 50%</w:t></w:r></w:p></w:hdr>'), ['', 'Draft 50\\%', '']);
  assert.deepEqual(hfPlaces('<w:ftr><w:p><w:r><w:t>A</w:t></w:r><w:r><w:tab/></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:tab/></w:r><w:r><w:t>B</w:t></w:r></w:p></w:ftr>'), ['A', '\\thepage{}', 'B']);
  // a coauthor's edit of the text still comes back with headers in the file
  const plan = importInto(edit(E.docx, (x) => x.replace('Hello.', 'Hello again.')), files);
  assert.equal(plan.files.get('main.tex'), src.replace('Hello.', 'Hello again.'));
});

await ok('a picture\'s alt text and size go to Word (its description) and come back as alt={…} (B8)', () => {
  const png = new Uint8Array(fs.readFileSync(new URL('../build/icons/' + fs.readdirSync(new URL('../build/icons/', import.meta.url)).find((f) => f.endsWith('.png')), import.meta.url)));
  const src = doc('Before.\n\n\\begin{center}\n\\includegraphics[width=0.5\\linewidth,alt={A 50\\% rise in {cats}}]{a.png}\n\\end{center}\n\nAfter.', '\\usepackage{graphicx}\n');
  const files = new Map([['main.tex', src]]);
  const m = buildModel({ files, main: 'main.tex' });
  const W = buildWordDoc(m, files, { now: 0, main: 'main.tex', asset: (n) => (n === 'a.png' ? 'a.png' : null) });
  const E = exportDocx(P, { doc: W.doc, anchors: W.anchors, atoms: W.atoms, resources: { 'a.png': png }, bibs: [], project: { name: 'Paper', main: 'main.tex', files: [...files] } });
  const d = text(unzip(E.docx).get('word/document.xml'));
  assert.match(d, /<wp:docPr [^>]*descr="A 50% rise in \{cats\}"/);
  const r = docxToLatex(P, E.docx, 'p.docx');
  assert.ok(/\\includegraphics\[[^\]]*alt=\{A 50\\% rise in \\\{cats\\\}\}/.test(r.tex), r.tex.slice(r.tex.indexOf('includegraphics') - 1, r.tex.indexOf('includegraphics') + 120));
  // a height with the width (the shape not kept) goes too
  const two = src.replace('width=0.5\\linewidth,', 'width=4cm,height=2cm,');
  const W2 = buildWordDoc(buildModel({ files: new Map([['main.tex', two]]), main: 'main.tex' }), new Map([['main.tex', two]]), { now: 0, main: 'main.tex', asset: (n) => n });
  const img = JSON.stringify(W2.doc).match(/"t":"Image","c":\[\["",\[\],(\[[^\]]*\](?:,\[[^\]]*\])*\])/);
  assert.ok(img && img[1].includes('"height","2cm"') && img[1].includes('"width","4cm"'), img && img[1]);
});

console.log('word: ' + n + ' groups of checks passed');
