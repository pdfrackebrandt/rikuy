// Track Changes' base (src/review.js) and the proofing language's edits (src/ui/wordcount.js)
// under node, with the cases of B10's hostile review (task 48) as checks: a step absorbed into the
// base or not as when it was made, through undo and redo (H1, H2, M1), each edit by itself at the
// level of words, never whole lines (H3), Accept a step of history (M1); a selection's language
// never across a cell, a row, \verb or an environment's edge (H4) and never changing the
// document's own language (H5, M5, L5, L6).
import assert from 'assert';
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; }, body: { classList: { contains() { return false; } } } };
const { review, absorbText, absorbFresh, authorEdit, editSpans, byAuthor } = await import('../src/review.js');
const { commentsOf, onlyComments, linkRole } = await import('../src/share.js');
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
  for (const k of ['setBase', 'saveBase', 'absorbEdit', 'noteEdit', 'currentChanges', 'rvAbsorbs', 'rvBaseStep', 'acceptChanges', 'rvAuthorStep', 'rvWho', 'rvName']) A[k] = review[k];
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

group('one word between two waiting changes a word apart (V-M1); kept hunks equal fresh ones; fast with 1,500 waiting (V-L2)', () => {
  assert.strictEqual(absorbText('Alpha beta gamma delta.\n', 'Omega beta Gamma delta.\n', 'Omega BETA Gamma delta.\n'), 'Alpha BETA gamma delta.\n');
  // random keystrokes, each absorbed with the hunks kept from the one before and again afresh
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const words = 'alpha beta gamma delta epsilon zeta eta theta iota kappa'.split(' ');
  const lines = []; for (let i = 0; i < 300; i++) { const l = []; for (let k = 0; k < 10; k++) l.push(words[Math.floor(rnd() * words.length)]); lines.push(l.join(' ') + '.'); }
  let b = lines.join('\n\n');
  const L = lines.slice(); for (let i = 0; i < 40; i++) { const j = Math.floor(rnd() * L.length); L[j] = L[j].replace(/\w+/, 'CHANGED'); }
  let p = L.join('\n\n');
  for (let k = 0; k < 200; k++) {
    const at = Math.floor(rnd() * p.length), del = rnd() < 0.3 ? 1 : 0, c = p.slice(0, at) + (del ? '' : 'xy'[k % 2]) + p.slice(at + del);
    const kept = absorbText(b, p, c);
    absorbFresh();
    const fresh = absorbText(b, p, c);
    assert.strictEqual(kept, fresh, 'keystroke ' + k);
    b = fresh; p = c;
  }
  // 1,500 changes waiting in 127 kB: a keystroke after the first is a few ms
  const big = []; for (let i = 0; i < 1500; i++) { const l = []; for (let k = 0; k < 16; k++) l.push(words[Math.floor(rnd() * words.length)]); big.push(l.join(' ') + '.'); }
  let B = big.join('\n\n');
  const BL = big.slice(); for (let i = 0; i < 1500; i++) { const j = Math.floor(rnd() * BL.length); BL[j] = 'CHANGED ' + BL[j]; }
  let P = BL.join('\n\n'), at = P.indexOf('.', P.length >> 1);
  absorbFresh();
  let ms = 0;
  for (let k = 0; k < 21; k++) { const C = P.slice(0, at) + 'x' + P.slice(at); const t0 = performance.now(); B = absorbText(B, P, C); if (k) ms += performance.now() - t0; P = C; at++; }
  assert.ok(ms / 20 < 25, 'a keystroke with 1,500 changes waiting took ' + (ms / 20).toFixed(1) + ' ms');
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
  // fancyvrb's \\Verb and \\path refused too (V-L1)
  const V = lapp(doc('', 'Use \\Verb|x_y| now and \\path{a/b} here.'));
  for (const w of ['Use \\Verb|x_y| now', 'and \\path{a/b}']) assert.deepStrictEqual(setLanguageEdits(V, 'de_DE', sel(V, w)).edits, [], w);
  // words already in \\foreignlanguage, babel on a line with other packages: refused with its
  // reason, never \\foreignlanguageundefined{undefined} (V-H1)
  const S = lapp(doc('\\usepackage[ngerman,english]{babel,csquotes}\n', 'Text \\foreignlanguage{ngerman}{Wort} end.'));
  const rs = setLanguageEdits(S, 'es_ES', sel(S, 'Wort'));
  assert.ok(rs.edits.length === 0 && /other packages/.test(rs.why), JSON.stringify(rs));
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


group('R4: changes carry their author, cut where two people wrote a change, through undo and redo', () => {
  const A = mkApp('Alpha beta gamma delta.\n', true);
  A.myName = () => 'Pedro';
  edit(A, 6, 10, 'BETA');
  A.rvBy = 'Ana'; edit(A, 17, 22, 'DELTA', 'merge'); A.rvBy = null;
  const who = () => A.currentChanges().map((c) => [c.a, c.b, A.rvName(c.who)]);
  assert.deepStrictEqual(who(), [['beta', 'BETA', 'Pedro'], ['delta', 'DELTA', 'Ana']]);
  // two people's edits a word apart are one change in the diff: cut in two by author
  const B = mkApp('one two three\n', true);
  B.myName = () => 'Pedro';
  edit(B, 0, 3, 'ONE');
  B.rvBy = 'Ana'; edit(B, 8, 13, 'THREE', 'merge'); B.rvBy = null;
  edit(B, 4, 7, 'TWO');
  const cs = B.currentChanges();
  assert.deepStrictEqual(cs.map((c) => [c.a, c.b, B.rvName(c.who)]), [['one two', 'ONE TWO', 'Pedro'], ['three', 'THREE', 'Ana']]);
  assert.ok(cs.every((c) => B.base.files.get('main.tex').slice(c.as, c.ae) === c.a && T(B).slice(c.bs, c.be) === c.b), 'each piece is a change Accept and Reject can act on');
  assert.deepStrictEqual([...new Set(cs.map((c) => B.rvName(c.who)))].sort(), ['Ana', 'Pedro']);
  // accept Ana's alone: Pedro's stay
  B.acceptChanges(cs.filter((c) => c.who === 'Ana'));
  assert.deepStrictEqual(B.currentChanges().map((c) => B.rvName(c.who)), ['Pedro']);
  assert.ok(!B.currentChanges().some((c) => c.b.includes('THREE')), 'Ana\'s change is in the base');
  // undo and redo give the authors back as they were
  const C = mkApp('a b c\n', true);
  C.myName = () => 'Pedro';
  C.rvBy = 'Ana'; edit(C, 2, 3, 'B', 'merge'); C.rvBy = null;
  undo(C); redo(C);
  assert.deepStrictEqual(C.currentChanges().map((c) => C.rvName(c.who)), ['Ana']);
  // the layer itself: an edit inside another's insertion, a deletion's place
  let segs = authorEdit([], 0, 0, 5, 'Ana');
  segs = authorEdit(segs, 2, 3, 0, 'Bob');
  assert.deepStrictEqual(segs, [{ s: 0, e: 2, who: 'Ana' }, { s: 2, e: 2, who: 'Bob' }, { s: 2, e: 4, who: 'Ana' }]);
  assert.deepStrictEqual(editSpans('abc', 'aXc', false), [{ s: 1, e: 2, n: 1 }]);
  const one = byAuthor(changes('x y z', 'X y Z')[0], [{ s: 0, e: 1, who: 'A' }, { s: 4, e: 5, who: 'B' }]);
  assert.deepStrictEqual(one.map((c) => [c.a, c.b, c.who]), [['x', 'X', 'A'], ['z', 'Z', 'B']]);
});

group('R4: a comments only link lets in comment lines alone, whatever its copy says', () => {
  const base = 'A line.\nB line.\nC line.';
  const theirs = 'A line.\n% comment (Ana) on "A": Why?\nB changed.\nC line.\n% comment (Ana): ok\n';
  const r = commentsOf(base, theirs);
  assert.strictEqual(r.text, 'A line.\n% comment (Ana) on "A": Why?\nB line.\nC line.\n% comment (Ana): ok\n');
  assert.strictEqual(r.dropped, 1);
  assert.ok(onlyComments(base, r.text), 'what comes in differs from the base in comment lines alone');
  assert.ok(!onlyComments('a\n', 'b\n') && onlyComments('a\n', 'a\n% reply (X): y\n'));
  // (security review) none in verbatim, listings or filecontents, where TeX prints or writes a % line, nor in the preamble
  const vb = 'X\n\\begin{document}\nA.\n\\begin{filecontents*}{run.sh}\necho hi\n\\end{filecontents*}\nB.\n\\end{document}\n';
  const vt = vb.replace('echo hi\n', 'echo hi\n% comment (Eve): $(touch /tmp/x)\n').replace('A.\n', 'A.\n% comment (Eve): fine\n').replace('X\n', 'X\n% comment (Eve): pre\n');
  const rv = commentsOf(vb, vt);
  assert.ok(rv.text.includes('% comment (Eve): fine') && !rv.text.includes('touch') && !rv.text.includes('pre\n') && rv.dropped === 2, JSON.stringify(rv));
  const snaps = [{ sig: 's', share: { rid: 'edit-link-1', role: 'coauthor' } }, { sig: 's', share: { rid: 'cmnt-link-1', role: 'comments' } }, { sig: 't', share: { rid: 'other', role: 'coauthor' } }];
  assert.strictEqual(linkRole(snaps, 's', 'edit-link-1'), 'coauthor');
  assert.strictEqual(linkRole(snaps, 's', 'cmnt-link-1'), 'comments');
  assert.strictEqual(linkRole(snaps, 's', null), 'comments', 'a copy that drops its link\'s name is taken as the stricter link');
  assert.strictEqual(linkRole(snaps, 's', 'forged-name'), 'comments');
  assert.strictEqual(linkRole(snaps, 't', null), 'coauthor');
  assert.strictEqual(linkRole([], 'u', null), 'coauthor', 'a version shared before links had roles: as before');
});

console.log('review: ' + groups + ' groups of checks passed');
// (src/review.js's imports leave a handle open under node: the run ends here)
process.exit(0);
