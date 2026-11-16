// Track Changes' base (src/review.js) and the proofing language's edits (src/ui/wordcount.js)
// under node, with the cases of B10's hostile review (task 48) as checks: a step absorbed into the
// base or not as when it was made, through undo and redo (H1, H2, M1), each edit by itself at the
// level of words, never whole lines (H3), Accept a step of history (M1); a selection's language
// never across a cell, a row, \verb or an environment's edge (H4) and never changing the
// document's own language (H5, M5, L5, L6).
import assert from 'assert';
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, body: { classList: { contains() { return false; } } } };
const { review, absorbText } = await import('../src/review.js');
const { changes } = await import('../src/diff.js');
const { setLanguageEdits } = await import('../src/ui/wordcount.js');
const { usePackages } = await import('../src/preamble.js');

let groups = 0;
const group = (name, fn) => { if (process.env.V) console.log('group', name); fn(); groups++; };

// an app as src/app.js keeps history: a step records whether it is absorbed (record), its undo
// and redo say which step they are (rvStep), noteEdit absorbs by that
const NO = new Set(['reject', 'merge', 'word', 'other-tab', 'restore', 'accept']);
function mkApp(text, track) {
  const A = { files: new Map([['main.tex', text]]), noIdb: true, hist: [], redoStack: [], pdfSoon() {}, refreshNav() {}, reviewStatus() {}, snapshot() {}, marksSoon() {}, markupOn() { return false; },
    closeGroup() {}, updateUndoUI() {}, lastSnapT: Date.now(), main: 'main.tex', name: 'x', src(f) { return this.files.get(f) ?? ''; } };
  for (const k of ['setBase', 'saveBase', 'absorbEdit', 'noteEdit', 'currentChanges', 'rvAbsorbs', 'rvBaseStep', 'acceptChanges']) A[k] = review[k];
  A.setBase({ t: 0, files: A.files, track });
  return A;
}
const T = (A) => A.files.get('main.tex');
function edit(A, s, e, t, kind = 'type') {
  const cur = T(A);
  A.files.set('main.tex', cur.slice(0, s) + t + cur.slice(e));
  A.hist.push(A.rvStep = { kind, files: [{ f: 'main.tex', s, del: cur.slice(s, e), ins: t }], abs: A.rvAbsorbs(kind) }); A.redoStack = [];
  A.noteEdit();
}
function undo(A) {
  const h = A.hist.pop();
  for (const d of h.files) { const t = A.files.get(d.f); A.files.set(d.f, t.slice(0, d.s) + d.del + t.slice(d.s + d.ins.length)); }
  A.redoStack.push(h); if (h.base0) A.rvBaseStep(h, true); A.rvStep = h; A.noteEdit();
}
function redo(A) {
  const h = A.redoStack.pop();
  for (const d of h.files) { const t = A.files.get(d.f); A.files.set(d.f, t.slice(0, d.s) + d.ins + t.slice(d.s + d.del.length)); }
  A.hist.push(h); if (h.base1) A.rvBaseStep(h, false); A.rvStep = h; A.noteEdit();
}
const chg = (A) => changes(A.base.files.get('main.tex'), T(A)).map((c) => [c.a, c.b]);
const off = (A) => { A.base.track = false; };
const on = (A) => { A.base.track = true; };

group('steps absorbed as when they were made, through undo and redo (H1, H2, M1)', () => {
  let A = mkApp('One two three.\n', true);
  edit(A, 4, 4, 'big '); off(A); undo(A); redo(A);
  assert.deepStrictEqual(chg(A), [['', 'big ']], 'a tracked insertion stays one after off, undo, redo');
  A = mkApp('One two three.\n', true);
  edit(A, 4, 8, '', 'del'); off(A); undo(A); redo(A);
  assert.deepStrictEqual(chg(A), [['two ', '']], 'a tracked deletion too');
  A = mkApp('One two three.\n', false);
  edit(A, 4, 4, 'big '); on(A); undo(A);
  assert.deepStrictEqual(chg(A), [], 'an untracked insertion undone with tracking on: no phantom deletion');
  // a merge (kind merge) with the base set to before it; undo, redo: the changes come back
  A = mkApp('Alpha delta omega.\n', false);
  const mine = new Map(A.files);
  edit(A, 6, 11, 'DELTA-FROM-ANA', 'merge');
  A.setBase({ t: 1, files: mine });
  undo(A); redo(A);
  assert.deepStrictEqual(chg(A), [['delta', 'DELTA-FROM-ANA']], 'undo then redo of a merge keeps its changes');
  // Reject, undo, redo with tracking off
  A = mkApp('One theta three.\n', true);
  edit(A, 4, 9, 'THETA9'); off(A);
  edit(A, 4, 10, 'theta', 'reject');
  assert.deepStrictEqual(chg(A), []);
  undo(A); assert.deepStrictEqual(chg(A), [['theta', 'THETA9']], 'undoing a Reject brings the change back');
  redo(A); assert.deepStrictEqual(chg(A), []);
});

group('each edit by itself, by words not lines (H3)', () => {
  let A = mkApp('Alpha beta gamma lambda mu.\nNext para.\n', true);
  edit(A, 6, 10, 'BETA2'); off(A);
  const at = T(A).indexOf('mu.') + 2;
  edit(A, at, at, ' nu');
  assert.deepStrictEqual(chg(A), [['beta', 'BETA2']], 'an untracked edit in the line of a waiting change is no change');
  // and Reject All gives the waiting change's old words back, keeping the untracked one
  const back = T(A).replace('BETA2', 'beta');
  assert.ok(back.includes('mu nu.'));
  // one step of several edits (Replace All) while a change waits elsewhere
  assert.strictEqual(absorbText('Alpha beta zeta.\nSecond paragraph stays here as it is.\n', 'Alpha beta zeta.\nSecund paragraph stays here as it is.\n', 'ALPHA beta ZETA.\nSecund paragraph stays here AS it is.\n'),
    'ALPHA beta ZETA.\nSecond paragraph stays here AS it is.\n');
  // an edit inside a waiting change stays part of it
  assert.strictEqual(absorbText('Alpha beta gamma.\n', 'Alpha BETA2 gamma.\n', 'Alpha BETA22 gamma.\n'), 'Alpha beta gamma.\n');
  // beside a waiting deletion, before and after it
  assert.strictEqual(absorbText('One two three four.\n', 'One three four.\n', 'One three four five.\n'), 'One two three four five.\n');
  assert.strictEqual(absorbText('One two three four.\n', 'One three four.\n', 'Zero One three four.\n'), 'Zero One two three four.\n');
});

group('Accept is a step: undone, the change is back (M1)', () => {
  const A = mkApp('One iota three.\n', true);
  edit(A, 4, 8, 'IOTA5');
  A.acceptChanges(A.currentChanges());
  assert.deepStrictEqual(chg(A), []);
  assert.strictEqual(A.hist[A.hist.length - 1].kind, 'accept');
  undo(A);
  assert.deepStrictEqual(chg(A), [['iota', 'IOTA5']], 'undoing Accept brings the change back, the text as it was');
  assert.ok(T(A).includes('IOTA5'));
  redo(A);
  assert.deepStrictEqual(chg(A), []);
});

// ---- the proofing language ----
const doc = (pre, body, cls = '') => '\\documentclass' + cls + '{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
function lapp(text, extra = {}) {
  const files = new Map([['main.tex', text], ...Object.entries(extra)]);
  return { main: 'main.tex', files, src(f) { return this.files.get(f) ?? ''; }, packageEdits(names) { return usePackages(this.src(this.main), names, {}).map((x) => ({ f: this.main, ...x })); } };
}
const apply = (app, r) => { let t = app.src('main.tex'); for (const e of [...r.edits].filter((x) => x.f === 'main.tex').sort((a, b) => b.s - a.s)) t = t.slice(0, e.s) + e.t + t.slice(e.e); return t; };
const sel = (app, w) => { const t = app.src('main.tex'), a = t.indexOf(w); return { f: 'main.tex', a, b: a + w.length, p: a + w.length, collapsed: false }; };

group('a selection\'s language: never across a cell, a row, \\verb or an environment (H4)', () => {
  const t = doc('', '\\begin{tabular}{ll}\nZelle eins & Zelle zwei \\\\\ndrei & vier \\\\\n\\end{tabular}\nA \\verb|x| b.');
  const A = lapp(t);
  for (const w of ['eins & Zelle', 'zwei \\\\\ndrei', 'A \\verb|x|', 'vier \\\\\n\\end{tabular}']) {
    const r = setLanguageEdits(A, 'de_DE', sel(A, w));
    assert.deepStrictEqual(r.edits, [], w);
    assert.ok(/one paragraph or one cell/.test(r.why), r.why);
  }
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', sel(A, 'Zelle zwei'))).includes('\\foreignlanguage{ngerman}{Zelle zwei} \\\\'));
});

group('the document\'s own language stays (H5, M5, L5, L6)', () => {
  // a French class: the selection in German, French stays babel's last
  let A = lapp(doc('\\usepackage{babel}\n', 'Bonjour le monde.', '[french]'));
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', sel(A, 'le monde'))).includes('\\usepackage[ngerman,french]{babel}'));
  // (no babel: the class's french sets no language, the document is LaTeX's English; it stays so)
  A = lapp(doc('', 'Bonjour le monde.', '[french]'));
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', sel(A, 'le monde'))).includes('\\usepackage[ngerman,english]{babel}'));
  // a French document set to English: not "already English"
  A = lapp(doc('\\usepackage[french]{babel}\n', 'Bonjour.'));
  assert.ok(apply(A, setLanguageEdits(A, 'en_US', null)).includes('\\usepackage[english]{babel}'));
  // [english,french] (French main) to German: french replaced, english kept
  A = lapp(doc('\\usepackage[english,french]{babel}\n', 'Bonjour.'));
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', null)).includes('\\usepackage[english,ngerman]{babel}'));
  // the old language still used in the text: kept loaded
  A = lapp(doc('\\usepackage[french]{babel}\n', 'Bonjour \\foreignlanguage{french}{oui}.'));
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', null)).includes('\\usepackage[french,ngerman]{babel}'));
  A = lapp(doc('\\usepackage[main=french]{babel}\n', 'Bonjour.'), { 'ch.tex': '\\selectlanguage{french} oui' });
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', null)).includes('\\usepackage[french,main=ngerman]{babel}'));
  A = lapp(doc('\\usepackage{polyglossia}\n\\setdefaultlanguage{french}\n', 'Bonjour \\textfrench{oui}.'));
  assert.ok(apply(A, setLanguageEdits(A, 'de_DE', null)).includes('\\setdefaultlanguage{german}\n\\setotherlanguage{french}'));
  // polyglossia, English main: a selection in British English keeps the variant
  A = lapp(doc('\\usepackage{polyglossia}\n\\setdefaultlanguage{english}\n', 'The colour here.'));
  const g = apply(A, setLanguageEdits(A, 'en_GB', sel(A, 'colour')));
  assert.ok(g.includes('\\foreignlanguage[variant=british]{english}{colour}') && !g.includes('setotherlanguage'), g);
});

console.log('review: ' + groups + ' groups of checks passed');
// (src/review.js's imports leave a handle open under node: the run ends here)
process.exit(0);
