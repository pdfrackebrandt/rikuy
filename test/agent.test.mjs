// The agent tools (src/agent.js) without a browser: the ten tools' names, schemas and hints; the
// commands' argument schemas against the registry; which commands ask the person first; the
// document as data on the sample (sections, formulas with numbers and labels, the table, citations
// and the bibliography, labels and cross references, footnotes) and on a project with an
// interactive graph (its formulas and sliders); what changed between two texts; and llms.txt and
// llms-full.txt saying each tool and each command (one description each, the registry's).
import assert from 'node:assert/strict';
import fs from 'fs';
import { TOOLS, ARGS, asks, personOnly, documentModel, changesBetween, runnable, argsOf, validate, lostChars, EXAMPLES, BIG, pressWhere } from '../src/agent.js';
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
  // (consequentialHint is what a browser makes the person confirm: nothing a tool does leaves the
  // page or outlasts one Undo, so it is on none; review M10)
  for (const t of TOOLS) assert.equal(t.annotations.consequentialHint, false, t.name);
  assert.equal(TOOLS.find((x) => x.name === 'select').annotations.destructiveHint, false);
});

ok('every argument schema is a runnable command\'s, an object schema', () => {
  const ids = new Set(runnable().map((c) => c.id));
  for (const [id, sc] of Object.entries(ARGS)) {
    assert.ok(ids.has(id), id + ' is no runnable command');
    assert.equal(sc.type, 'object', id);
    assert.equal(argsOf(command(id)), sc);
  }
});

ok('what asks the person first: deleting, replacing all, pasting the clipboard; not formatting or inserting', () => {
  for (const id of ['delete-table', 'delete-rows', 'comment-delete-all', 'change-reject', 'clear-formatting', 'replace', 'toc-remove', 'paste', 'paste-text', 'paste-latex', 'paste-special'])
    assert.equal(asks(id), true, id);
  for (const id of ['bold', 'italic', 'insert-table', 'table', 'footnote', 'view-latex', 'animations', 'help-how', 'link', 'comment-new', 'copy', 'cut'])
    assert.equal(asks(id), false, id);
  const ids = runnable().map((c) => c.id), n = ids.filter(asks).length;
  assert.ok(n > 15 && n < ids.length / 4, n + ' of ' + ids.length);
});

ok('what only the person does (no tool runs it): sending the document out, opening another site, another document (review H1, L1)', () => {
  const P = ['share', 'download-pdf', 'download-word', 'download-latex', 'download-menu', 'export-as', 'save-as', 'print', 'markup-copy', 'link-open', 'help-report', 'help-agents', 'ask-grok', 'open', 'recent', 'new-document', 'new-blank', 'new-template', 'load-sample'];
  for (const id of P) { assert.equal(personOnly(id), true, id); assert.equal(asks(id), false, id); assert.ok(command(id), id); }
  for (const id of ['print-layout', 'bold', 'link', 'link-edit', 'copy', 'paste', 'view-pdf', 'versions', 'version-save', 'compare', 'save'])
    assert.equal(personOnly(id), false, id);
  // (and each says where the person presses it)
  assert.equal(pressWhere(command('download-pdf')), '"Download PDF" (the PDF pane\'s Download menu), or its name in the search box (Alt+Q)');
  assert.match(pressWhere(command('save-as')), /^"Save As", or F12,/);
  assert.match(pressWhere(command('link-open')), /the right click menu/);
});

ok("run_command's examples are commands an agent may run, from the registry; llms.txt's too (review M5)", () => {
  const ids = new Set(runnable().map((c) => c.id));
  for (const id of EXAMPLES) assert.ok(ids.has(id), id);
  const rc = TOOLS.find((t) => t.name === 'run_command');
  for (const id of EXAMPLES) assert.ok(rc.description.includes('"' + id + '" (' + command(id).name + ')'), id);
  // every id the tools and the guides quote as one to run: "x" (Name), run("x", run_command "x", {"id": "x"
  const quoted = (t) => [...t.matchAll(/\brun\("([a-z][a-z0-9-]*)"|run_command ((?:"[a-z][a-z0-9-]*"(?:, | or )?)+)|\{"id": "([a-z][a-z0-9-]*)"/g)]
    .flatMap((m) => (m[2] ? [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [m[1] || m[3]]));
  const all = [...[...rc.description.matchAll(/"([a-z][a-z0-9-]*)" \(/g)].map((m) => m[1]), ...TOOLS.flatMap((t) => quoted(t.description)), ...quoted(llms()), ...quoted(llmsFull())];
  assert.ok(all.length > 40, all.length);
  for (const id of all) assert.ok(ids.has(id), 'quoted as a command to run, and no command an agent may run: ' + id);
  // (no list of ids in the schema: list_commands is the catalogue, review M9)
  assert.equal(rc.inputSchema.properties.id.enum, undefined);
});

ok('inputs checked against their schemas, in words (review L2)', () => {
  assert.equal(validate(ARGS.table, { rows: 'many', cols: -4 }, 'args'), 'args.rows must be a whole number.');
  assert.equal(validate(ARGS.table, { rows: 2, cols: -4 }, 'args'), 'args.cols must be at least 1 and at most 30.');
  assert.equal(validate(ARGS.table, { rows: 2000, cols: 300 }, 'args'), 'args.rows must be at most 60.');
  assert.equal(validate(ARGS.table, { cols: 3 }, 'args'), 'args.rows is missing.');
  assert.equal(validate(ARGS.table, { rows: 2, cols: 3, colour: 'red' }, 'args'), 'args has no "colour": it takes rows, cols, fit, width.');
  assert.equal(validate(ARGS.table, { rows: 2, cols: 3, fit: 'window' }, 'args'), null);
  const T = (n) => TOOLS.find((t) => t.name === n).inputSchema;
  assert.match(validate(T('get_document'), { include: ['nonsense'] }), /^input\.include\[0\] must be one of "title"/);
  assert.equal(validate(T('edit_source'), { start: -1, text: '' }), 'input.start must be at least 0.');
  assert.equal(validate(T('edit_source'), { start: 1.5, text: '' }), 'input.start must be a whole number.');
  assert.equal(validate(T('undo'), { steps: 2, extra: 1 }), 'input has no "extra": it takes steps, step.');
  assert.equal(validate(T('compile'), { x: 1 }), 'input has no "x": it takes nothing.');
  assert.equal(validate(T('insert_graph'), { spec: { kind: 'pie' } }), 'input.spec.kind must be one of "function", "data", "curve", "dist".');
});

ok('what an edit takes out: the words that go, not those kept inside new markup', () => {
  assert.equal(lostChars('two words', '\\textbf{two words}'), 0);
  assert.equal(lostChars('\\textbf{two}', 'two'), 9);
  assert.equal(lostChars('x'.repeat(300), ''), 300);
  assert.equal(lostChars('the cat sat', 'the dog sat'), 3);
  assert.ok(BIG === 200);
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

ok('include picks parts; an empty include gives none (review M7)', () => {
  const m = buildModel({ files: sample, main: 'main.tex' });
  assert.deepEqual(Object.keys(documentModel(m, sample, 'main.tex', ['sections'])).sort(), ['main', 'sections', 'words']);
  assert.deepEqual(Object.keys(documentModel(m, sample, 'main.tex', [])).sort(), ['main', 'words']);
});

ok("a bibliography written in the text: thebibliography's \\bibitem, its key, label and text (review M6)", () => {
  const doc = '\\documentclass{article}\n\\begin{document}\nSee \\cite{solow} and \\cite{swan}.\n\\begin{thebibliography}{9}\n\\bibitem{solow} R. Solow. Growth. 1956.\n\\bibitem[Swan(1956)]{swan} T. Swan. Accumulation. 1956.\n\\end{thebibliography}\n\\end{document}\n';
  const files = new Map([['main.tex', doc]]);
  const d = documentModel(buildModel({ files, main: 'main.tex' }), files, 'main.tex', ['references']);
  assert.deepEqual(d.references.map((r) => [r.key, r.text]), [['solow', 'R. Solow. Growth. 1956.'], ['swan', 'T. Swan. Accumulation. 1956.']]);
  assert.equal(d.references[0].label, '[1]');
  assert.ok(doc.slice(d.references[1].start).startsWith('\\bibitem[Swan(1956)]{swan}'));
  assert.deepEqual([...d.cited].sort(), ['solow', 'swan']);
});

ok('a numbered alignment as written: align, not the starred form the page draws it with (review L3)', () => {
  const doc = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{align}\na &= b \\label{e1}\\\\\nc &= d\n\\end{align}\n\\begin{align*} x \\end{align*}\n\\end{document}\n';
  const files = new Map([['main.tex', doc]]);
  const d = documentModel(buildModel({ files, main: 'main.tex' }), files, 'main.tex', ['equations']);
  assert.equal(d.equations[0].latex, '\\begin{align} a &= b \\\\ c &= d \\end{align}');
  assert.deepEqual(d.equations[0].numbers, ['1', '2']);
  assert.equal(d.equations[1].latex, '\\begin{align*} x \\end{align*}');
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
  // (honest about the question: for the person, a speed bump, not a lock; and about hidden text: review H1, L7)
  assert.ok(!/only their\s+own press allows/.test(L));
  assert.match(L, /an agent must never answer it/);
  assert.match(L, /not a lock: an agent that\s+drives the browser's input/);
  assert.match(L, /\\phantom/);
  assert.match(L, /run_command does not run a download, a share,/);
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
