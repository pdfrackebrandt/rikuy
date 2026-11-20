// The agent tools (src/agent.js) without a browser: the ten tools' names, schemas and hints; the
// commands' argument schemas against the registry; which commands ask the person first; the
// document as data on the sample (sections, formulas with numbers and labels, the table, citations
// and the bibliography, labels and cross references, footnotes) and on a project with an
// interactive graph (its formulas and sliders); what changed between two texts; and llms.txt and
// llms-full.txt saying each tool and each command (one description each, the registry's).
import assert from 'node:assert/strict';
import fs from 'fs';
import { TOOLS, ARGS, asks, documentModel, changesBetween, runnable, argsOf } from '../src/agent.js';
import { command } from '../src/commands.js';
import '../src/cmd/index.js';
import { buildModel } from '../src/model.js';
import { graphHtml, TEMPLATES } from '../src/graph.js';
import { llms, llmsFull } from '../build/app.mjs';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const R = (p) => new URL('../' + p, import.meta.url);

ok('ten tools, each named, titled, described, with an object schema and the four hints', () => {
  assert.deepEqual(TOOLS.map((t) => t.name), ['get_document', 'get_source', 'select', 'list_commands', 'run_command', 'edit_source', 'set_source', 'insert_graph', 'compile', 'undo']);
  for (const t of TOOLS) {
    assert.match(t.name, /^[a-z]+(_[a-z]+)*$/, t.name);
    assert.ok(t.title && t.description.length > 60 && t.description.length < 1600, t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    for (const r of t.inputSchema.required || []) assert.ok(r in t.inputSchema.properties, t.name + ' requires ' + r);
    for (const h of ['readOnlyHint', 'untrustedContentHint', 'destructiveHint', 'consequentialHint']) assert.equal(typeof t.annotations[h], 'boolean', t.name + ' ' + h);
    assert.ok(t.api && /^[a-z][A-Za-z]+$/.test(t.api), t.name);
  }
  assert.deepEqual(TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name), ['get_document', 'get_source', 'list_commands', 'compile']);
  // (what returns a document's text says it is its author's)
  for (const t of TOOLS) assert.equal(t.annotations.untrustedContentHint, t.name !== 'list_commands', t.name);
  for (const t of ['run_command', 'edit_source', 'set_source', 'undo']) assert.equal(TOOLS.find((x) => x.name === t).annotations.destructiveHint, true, t);
});

ok('every argument schema is a runnable command\'s, an object schema', () => {
  const ids = new Set(runnable().map((c) => c.id));
  for (const [id, sc] of Object.entries(ARGS)) {
    assert.ok(ids.has(id), id + ' is no runnable command');
    assert.equal(sc.type, 'object', id);
    assert.equal(argsOf(command(id)), sc);
  }
});

ok('what asks the person first: deleting, replacing all, sharing, downloading, opening a link; not formatting or inserting', () => {
  for (const id of ['delete-table', 'delete-rows', 'comment-delete-all', 'change-reject', 'clear-formatting', 'share', 'download-pdf', 'download-latex', 'export-as', 'link-open', 'new-document', 'load-sample', 'replace', 'toc-remove'])
    assert.equal(asks(id), true, id);
  for (const id of ['bold', 'italic', 'insert-table', 'table', 'footnote', 'view-latex', 'animations', 'help-how', 'link', 'comment-new'])
    assert.equal(asks(id), false, id);
  const ids = runnable().map((c) => c.id), n = ids.filter(asks).length;
  assert.ok(n > 15 && n < ids.length / 4, n + ' of ' + ids.length);
});

const sample = new Map([['main.tex', fs.readFileSync(R('sample/main.tex'), 'utf8')], ['refs.bib', fs.readFileSync(R('sample/refs.bib'), 'utf8')]]);
const D = documentModel(buildModel({ files: sample, main: 'main.tex' }), sample, 'main.tex');
const at = (o) => sample.get(o.file).slice(o.start, o.end);

ok('the sample as data: title, authors, date; sections with numbers, labels and places', () => {
  assert.equal(D.title.title, 'Editing in Print');
  assert.deepEqual(D.title.authors, ['Rikuy']);
  assert.ok(D.title.date);
  const s = D.sections.find((x) => x.title === 'The round trip');
  assert.equal(s.number, '2'); assert.equal(s.level, 1); assert.equal(s.label, 'sec:roundtrip');
  assert.match(at(s), /^\\section\{The round trip\}/);
  assert.ok(D.sections.length >= 5);
});

ok('every formula: its LaTeX, numbers and labels, display or inline, in source order', () => {
  const bell = D.equations.find((e) => e.numbers.includes('1'));
  assert.equal(bell.display, true); assert.deepEqual(bell.labels, ['eq:bellman']);
  assert.match(bell.latex, /^V\(k\) = \\max/); assert.ok(!/\\label|\\tag/.test(bell.latex));
  const al = D.equations.find((e) => e.numbers.includes('2'));
  assert.deepEqual(al.numbers, ['2', '3']); assert.deepEqual(al.labels.sort(), ['eq:cond', 'eq:mle']);
  const inl = D.equations.find((e) => !e.display);
  assert.equal(inl.latex, '\\alpha + \\beta = \\gamma'); assert.equal(at(inl), '$\\alpha + \\beta = \\gamma$');
  for (let k = 1; k < D.equations.length; k++) assert.ok(D.equations[k].start > D.equations[k - 1].start);
});

ok('figures and tables: kind, number, caption, label, place', () => {
  assert.equal(D.figures.length, 1);
  const t = D.figures[0];
  assert.equal(t.kind, 'table'); assert.equal(t.number, '1'); assert.equal(t.caption, 'Shortcuts. On a Mac, use Cmd for Ctrl.'); assert.deepEqual(t.labels, ['tab:keys']);
  assert.match(at(t), /^\\begin\{table\}/);
});

ok('citations with keys and command, the bibliography, labels, cross references, footnotes', () => {
  const c = D.citations.find((x) => x.keys.includes('knuth1984'));
  assert.equal(c.command, 'citet'); assert.equal(c.text, 'Knuth (1984)'); assert.equal(c.missing, false); assert.match(at(c), /^\\citet\{knuth1984\}$/);
  assert.equal(D.references.length, 5);
  assert.ok(D.references.find((r) => r.key === 'knuth1984').text.startsWith('Knuth, Donald E.'));
  assert.deepEqual([...D.cited].sort(), ['kastrup2002', 'knuth1984', 'knuthplass1981', 'lamport1994', 'wen2018']);
  assert.deepEqual(D.labels.find((l) => l.name === 'eq:bellman'), { name: 'eq:bellman', kind: 'equation', number: '1', file: 'main.tex' });
  const r = D.crossReferences.find((x) => x.label === 'eq:bellman');
  assert.equal(r.command, 'eqref'); assert.equal(r.text, '(1)'); assert.equal(at(r), '\\eqref{eq:bellman}');
  assert.equal(D.footnotes.length, 2);
  assert.deepEqual(D.warnings, []);
});

ok('include picks parts', () => {
  const d = documentModel(buildModel({ files: sample, main: 'main.tex' }), sample, 'main.tex', ['sections']);
  assert.deepEqual(Object.keys(d).sort(), ['main', 'sections', 'words']);
});

ok('an interactive graph: its widget, picture, kind, formulas and sliders', () => {
  const spec = TEMPLATES.find((t) => t.id === 'function').spec;
  const tex = '\\documentclass{article}\n\\usepackage{rikuy}\n\\begin{document}\nText.\n\n\\begin{center}\n\\rikuywidget[width=\\linewidth]{graphs/function-ab.html}{graphs/function-ab.png}\n\\end{center}\n% \\rikuywidget{graphs/no.html}{graphs/no.png}\n\\end{document}\n';
  const files = new Map([['main.tex', tex], ['graphs/function-ab.html', graphHtml(spec)]]);
  const d = documentModel(buildModel({ files, main: 'main.tex' }), files, 'main.tex', ['graphs']);
  assert.equal(d.graphs.length, 1, 'the commented one is no graph');
  const g = d.graphs[0];
  assert.equal(g.widget, 'graphs/function-ab.html'); assert.equal(g.picture, 'graphs/function-ab.png');
  assert.equal(g.graph.kind, 'function'); assert.deepEqual(g.graph.formulas, ['a sin(b x)']);
  assert.deepEqual(g.graph.sliders.map((q) => q.name), ['a', 'b']);
  assert.match(tex.slice(g.start, g.end), /^\\rikuywidget\[/);
});

ok('what changed: one range a file, text out and in, files made and gone', () => {
  const a = new Map([['m', 'Hello world'], ['x', 'gone']]), b = new Map([['m', 'Hello brave world'], ['y', 'new']]);
  assert.deepEqual(changesBetween(a, b), [
    { file: 'm', start: 6, end: 6, removed: '', inserted: 'brave ' },
    { file: 'x', deleted: true, start: 0, end: 4, removed: 'gone', inserted: '' },
    { file: 'y', made: true, start: 0, end: 0, removed: '', inserted: 'new' }]);
  assert.deepEqual(changesBetween(a, new Map(a)), []);
});

ok('llms.txt lists the ten tools with their descriptions; llms-full.txt every command once, with the registry\'s description', () => {
  const L = llms(), F = llmsFull();
  for (const t of TOOLS) assert.ok(L.includes('- ' + t.name + '(') && L.includes(t.description), t.name);
  for (const k of ['callTool', 'getDocument', 'editSource', 'runCommand']) assert.ok(L.includes(k), k);
  const lines = F.split('\n').filter((l) => /^- [a-z0-9-]+: "/.test(l));
  const ids = lines.map((l) => l.slice(2, l.indexOf(':')));
  assert.equal(new Set(ids).size, ids.length);
  for (const c of runnable()) {
    const l = lines.find((x) => x.startsWith('- ' + c.id + ': "'));
    assert.ok(l, c.id);
    assert.ok(l.includes((c.title || c.name).replace(/\s+/g, ' ')), c.id);
  }
});

console.log('agent: ' + n + ' groups of checks passed');
