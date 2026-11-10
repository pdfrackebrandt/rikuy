// Word support (src/docx.js, src/wordast.js, src/wordjobs.js) with the real pandoc (npm's
// pandoc-wasm, through src/pandoc.js as the worker runs it): a project exported to .docx keeps a
// bookmark and the text of every block, mapped to the source, with Word equations (the project's
// macros expanded, numbered), citations set by citeproc, footnotes and comments; a Word file of
// one's own opens as LaTeX; hostile files are refused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel } from '../src/model.js';
import { buildWordDoc, expandMath, unpackRuns } from '../src/wordast.js';
import { createPandoc } from '../src/pandoc.js';
import { exportDocx, docxToLatex } from '../src/wordjobs.js';
import { unzip, extract, parseXml, text, textContent, RIKUY_NS } from '../src/docx.js';
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
// Rikuy's custom XML part of an exported file
function rikuyData(parts) {
  for (const [k, b] of parts) if (/^customXml\/item\d+\.xml$/.test(k) && text(b).includes(RIKUY_NS)) return JSON.parse(textContent(parseXml(text(b)).c.find((x) => typeof x !== 'string')));
  return null;
}

await ok('every block keeps its bookmark and its text, each character mapped to the source that made it', async () => {
  const sample = (x) => fs.readFileSync(new URL('../sample/' + x, import.meta.url), 'utf8');
  const files = new Map([['main.tex', sample('main.tex')], ['refs.bib', sample('refs.bib')]]);
  const E = exportFiles(files);
  assert.equal(E.lost, 0);
  const parts = unzip(E.docx);
  const data = rikuyData(parts);
  assert.ok(data && data.rikuy === 1 && data.main === 'main.tex' && data.anchors.length > 30);
  assert.deepEqual(new Map(data.files), files);
  const X = extract(parts);
  for (const A of data.anchors) assert.equal(X.regions.get(A.id)?.text, A.text, A.id);
  const main = files.get('main.tex');
  const A = data.anchors.find((x) => x.text.startsWith('Click anywhere'));
  const m = unpackRuns(A.runs);
  assert.equal(main.slice(m[0], m[0] + 14), 'Click anywhere');
  // 50\% on the page is one character from two of the source
  const i = A.text.indexOf('50%') + 2;
  assert.equal(main.slice(m[2 * i], m[2 * i + 1]), '\\%');
});

await ok('equations are Word equations, with the project\'s macros expanded and their numbers; citations by citeproc; comments as Word comments', async () => {
  const src = doc('As \\citet{knuth1984} shows,\n\\begin{equation}\n  \\E[x] = \\frac{a}{b^2} \\label{eq:a}\n\\end{equation}\nand $x+1$ holds.\\footnote{A note.}\n% comment (Pedro) on "holds": Really?\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n', '\\newcommand{\\E}{\\mathbb{E}}\n');
  const files = new Map([['main.tex', src], ['refs.bib', BIB]]);
  const E = exportFiles(files);
  const parts = unzip(E.docx);
  const d = text(parts.get('word/document.xml'));
  assert.ok(d.includes('<m:oMathPara') && (d.match(/<m:oMath>/g) || []).length >= 2);
  assert.ok(d.includes('double-struck') && !d.includes('\\E'));
  assert.ok(d.replace(/<[^>]+>/g, '').includes('(1)'), 'the equation number is in the Word file');
  assert.ok(d.includes('Knuth (1984)') && d.includes('The TeXbook'));
  assert.match(text(parts.get('word/footnotes.xml')), /A note\./);
  assert.match(text(parts.get('word/comments.xml')), /w:author="Pedro"[\s\S]*Really\?/);
  // each equation as pandoc reads it back, to tell later what a coauthor changed in it
  const data = rikuyData(parts);
  const was = data.atoms.filter((a) => a.k === 'math').map((a) => a.was);
  assert.ok(was.some((t) => /\\frac\{a\}\{b\^\{2\}\}/.test(t)) && was.some((t) => /x \+ 1/.test(t)), was);
  assert.equal(expandMath('\\E[x] + \\key{a}', { '\\E': '\\mathbb{E}', '\\key': '\\texttt{#1}' }), '\\mathbb{E}[x] + \\texttt{a}');
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
  assert.deepEqual(unpackRuns([[2, 5], [0, 9, 11], [-1, 1], [-2, 0, 1]]), [5, 6, 6, 7, 9, 11, -1, -1, -2, 0]);
});

console.log('word: ' + n + ' groups of checks passed');
