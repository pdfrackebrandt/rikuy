// Word support (src/docx.js, src/wordast.js, src/wordsync.js, src/wordjobs.js) with the real pandoc
// (npm's pandoc-wasm, through src/pandoc.js as the worker runs it): a project exported to .docx and
// read back unchanged gives no edit; each block's bookmark and text survive; text edited in the
// .docx comes back as the smallest source patch on the tricky cases (escaped %, $ and &, \emph,
// accents, a change across formatting, footnotes, citations, equations); an edit of text the owner
// changed since is a conflict, not applied; hostile files are refused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel } from '../src/model.js';
import { buildWordDoc, expandMath, unpackRuns } from '../src/wordast.js';
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
  for (const s of ['\\section{Introduction}', '\\(x^{2} + \\alpha\\)', '\\[\\int_{0}^{1}', '\\begin{itemize}', 'Peru & 3.1', '\\footnote{Data from the World Bank.}', '\\includegraphics[width=2in', '\\href{https://example.org/data}{online}']) assert.ok(r.tex.includes(s), s);
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
  for (const bad of ['x$ \\input{a}', 'a\\)b', '\\immediate\\write18{x}', '\\end{equation}x', '\\def\\a{b}']) assert.equal(safeMath(bad), null, bad);
  assert.equal(safeMath('\\begin{aligned}a&=b\\\\ c&=\\$5\\end{aligned}'), '\\begin{aligned}a&=b\\\\ c&=\\$5\\end{aligned}');
});

console.log('word: ' + n + ' groups of checks passed');
