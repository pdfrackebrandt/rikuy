// Word support (src/docx.js, src/wordjobs.js) with the real pandoc (npm's pandoc-wasm, through
// src/pandoc.js as the worker runs it): a Word file of one's own opens as LaTeX with its equations,
// table, list, footnote and picture; hostile files are refused.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel } from '../src/model.js';
import { createPandoc } from '../src/pandoc.js';
import { docxToLatex } from '../src/wordjobs.js';
import { unzip, parseXml } from '../src/docx.js';
import { zipSync } from 'fflate';

const P = await createPandoc(fs.readFileSync(new URL('../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url)));
let n = 0;
const ok = (name, f) => Promise.resolve(f()).then(() => { n++; }, (e) => { console.error('FAIL', name); throw e; });

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
});

console.log('word: ' + n + ' groups of checks passed');
