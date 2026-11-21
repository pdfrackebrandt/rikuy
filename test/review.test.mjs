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
const { authorSteps, layerStep, MAX_SEGS } = await import('../src/authors.js');
const { commentsOf, onlyComments, linkRole, commentsBack, bodyAt, findComments, listedFiles, safeCommentLine, parseCommentLine } = await import('../src/share.js');
// a reader's comment as the author's copy takes it in (src/share.js: the base32 form), and whether
// some words reached a text at all, as TeX source or inside a comment line's parts
const L = (who, quote, body) => safeCommentLine({ kind: 'comment', who, quote, body });
const reached = (text, w) => text.includes(w) || findComments(text, '').some((c) => [c.who, c.quote, c.body, ...c.replies.map((r) => r.body)].join(' ').includes(w));
const { buildModel } = await import('../src/model.js');
const { changes, hunks, hunkChanges } = await import('../src/diff.js');
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
  assert.strictEqual(r.text, 'A line.\n' + L('Ana', 'A', 'Why?') + '\nB line.\nC line.\n' + L('Ana', '', 'ok') + '\n');
  assert.strictEqual(r.dropped, 1);
  assert.ok(onlyComments(base, r.text), 'what comes in differs from the base in comment lines alone');
  assert.ok(!onlyComments('a\n', 'b\n') && onlyComments('a\n', 'a\n% reply (X): y\n'));
  // (security review) none in verbatim, listings or filecontents, where TeX prints or writes a % line, nor in the preamble
  const vb = 'X\n\\begin{document}\nA.\n\\begin{filecontents*}{run.sh}\necho hi\n\\end{filecontents*}\nB.\n\\end{document}\n';
  const vt = vb.replace('echo hi\n', 'echo hi\n% comment (Eve): $(touch /tmp/x)\n').replace('A.\n', 'A.\n% comment (Eve): fine\n').replace('X\n', 'X\n% comment (Eve): pre\n');
  const rv = commentsOf(vb, vt);
  assert.ok(rv.text.includes(L('Eve', '', 'fine')) && !reached(rv.text, 'touch') && !reached(rv.text, 'pre') && rv.dropped === 2, JSON.stringify(rv));
  const snaps = [{ sig: 's', share: { rid: 'edit-link-1', role: 'coauthor' } }, { sig: 's', share: { rid: 'cmnt-link-1', role: 'comments' } }, { sig: 't', share: { rid: 'other', role: 'coauthor' } }];
  assert.strictEqual(linkRole(snaps, 's', 'edit-link-1'), 'coauthor');
  assert.strictEqual(linkRole(snaps, 's', 'cmnt-link-1'), 'comments');
  assert.strictEqual(linkRole(snaps, 's', null), 'comments', 'a copy that drops its link\'s name is taken as the stricter link');
  assert.strictEqual(linkRole(snaps, 's', 'forged-name'), 'comments');
  assert.strictEqual(linkRole(snaps, 't', null), 'coauthor');
  assert.strictEqual(linkRole([], 'u', null), 'coauthor', 'a version shared before links had roles: as before');
});

group('R4 review: a comments only copy brings comment lines into body text alone (H1, H2, M2)', () => {
  const doc0 = '\\documentclass{article}\n\\begin{document}\nHello.\nWorld.\n\\end{document}\n';
  // H1: a lone \r ends TeX's line: what follows it would be read as TeX; nothing of such a copy is taken
  const cr = doc0.replace('Hello.\n', 'Hello.\n% comment (Eve): fine\r\\immediate\\write18{echo pwned}\\textbf{CRINJECTED}\n');
  const r1 = commentsOf(doc0, cr);
  assert.ok(r1.text === doc0 && r1.dropped === 1 && !findComments(r1.text, 'main.tex').length, JSON.stringify(r1));
  assert.ok(!onlyComments(doc0, cr), 'nor is it a copy of comments alone');
  for (const ch of ['\u2028', '\u2029', '\u0085']) assert.strictEqual(commentsOf(doc0, doc0.replace('Hello.\n', 'Hello.\n% comment (Eve): x' + ch + '\\textbf{LSINJECTED}\n')).text, doc0, 'nor one with ' + escape(ch));
  // (a file with CRLF line ends keeps its comment lines)
  const crlf = doc0.replace(/\n/g, '\r\n'), crlf2 = crlf.replace('Hello.\r\n', 'Hello.\r\n% comment (Ana): ok\r\n');
  assert.strictEqual(commentsOf(crlf, crlf2).text, crlf.replace('Hello.\r\n', 'Hello.\r\n' + L('Ana', '', 'ok') + '\r\n'));
  // H2: comment lines only in .tex and .ltx files the document reads, in body text; every other file as it was
  const base = '\\documentclass{article}\n\\usepackage{tcolorbox}\\tcbuselibrary{listings}\n\\begin{document}\n\\section{Intro}\nHello.\n\\begin{itemize}\n\\item One\n\\end{itemize}\n'
    + '\\begin{tcblisting}{}\nx = 1\n\\end{tcblisting}\n\\begin{foo}\nF.\n\\end{foo}\n\\begin{luacode*}\ntex.print("a")\n\\end{luacode*}\nSee \\url{http://a.b/\nc}.\n\\begin{tikzpicture}\n\\draw (0,0)--(1,1);\n\\end{tikzpicture}\nEnd.\n\\end{document}\n';
  let th = base;
  for (const [a, w] of [['Hello.\n', 'OK1'], ['\\item One\n', 'OK2'], ['\\section{Intro}\n', 'OK3'], ['End.\n', 'OK4'], ['x = 1\n', 'BAD1'], ['F.\n', 'BAD2'], ['tex.print("a")\n', 'BAD3'], ['http://a.b/\n', 'BAD4'], ['(1,1);\n', 'BAD5']]) th = th.replace(a, a + '% comment (Eve): ' + w + '\n');
  const bib = '@book{k, title={T}}\n', sty = '\\ProvidesPackage{my}\n';
  const files = new Map([['main.tex', base], ['refs.bib', bib], ['my.sty', sty], ['unread.tex', 'Never read.\n'], ['data.csv', 'a,b\n']]);
  const theirs = new Map([['main.tex', th], ['refs.bib', bib + '% comment (Eve): @preamble{"\\textbf{BIBINJECTED}"}\n'], ['my.sty', sty + '% comment (Eve): x\n\\def\\x{STYINJECTED}\n'],
    ['unread.tex', 'Never read.\n% comment (Eve): BAD6\n'], ['data.csv', 'a,b\n% comment (Eve): c,d\n'], ['new.tex', '\\textbf{NEWFILE}']]);
  const blocks = buildModel({ files, main: 'main.tex' }).blocks;
  const r = commentsBack(files, theirs, (f) => bodyAt(blocks, f, files.get(f)));
  const m = r.files.get('main.tex');
  for (const w of ['OK1', 'OK2', 'OK3', 'OK4']) assert.ok(m.includes(L('Eve', '', w) + '\n'), w);
  for (const w of ['BAD1', 'BAD2', 'BAD3', 'BAD4', 'BAD5']) assert.ok(!reached(m, w), w);
  for (const f of ['refs.bib', 'my.sty', 'unread.tex', 'data.csv']) assert.strictEqual(r.files.get(f), files.get(f), f + ' byte for byte as the base had it');
  assert.ok(!r.files.has('new.tex') && r.dropped === 10, 'a file they added is not taken; each line left out counted: ' + r.dropped);
  // M2: where a file of the project changes what % is, no comment line comes in at all
  const cat = '\\documentclass{article}\n\\begin{document}\nPercent table:\n{\\catcode`\\%=12\nRates are 5% and 7%.\n}\nEnd.\n\\end{document}\n';
  const catT = cat.replace('Rates are 5% and 7%.\n', 'Rates are 5% and 7%.\n% comment (Eve): ok \\textbf{CATINJECTED}\n').replace('End.\n', 'End.\n% comment (Eve): fine\n');
  const cf = new Map([['main.tex', cat]]), cb = buildModel({ files: cf, main: 'main.tex' }).blocks;
  const rc = commentsBack(cf, new Map([['main.tex', catT]]), (f) => bodyAt(cb, f, cf.get(f)));
  assert.ok(rc.files.get('main.tex') === cat && rc.dropped >= 1, 'a catcode of % changed: none at all');
  for (const c of ['\\catcode`\\^^25=12', '\\ExplSyntaxOn\\char_set_catcode:nn {37} {12}\\ExplSyntaxOff', '\\ExplSyntaxOn\\char_set_catcode_other:n {37}\\ExplSyntaxOff', '\\catcode\\numexpr36+1\\relax=12', '\\catcode\'45=12', '\\char_set_catcode_other:N \\%', '\\catcode37=12', '\\catcode `\\% = 12', '\\makeother\\%', '\\@makeother\\%', '\\let\\do\\@makeother\\dospecials', '\\catcode"25=11'])
    assert.ok(commentsBack(new Map([['main.tex', cat.replace('\\catcode`\\%=12', c)]]), new Map([['main.tex', catT.replace('\\catcode`\\%=12', c)]]), () => () => true).files.get('main.tex').indexOf('CATINJECTED') < 0 && !reached(commentsBack(new Map([['main.tex', cat.replace('\\catcode`\\%=12', c)]]), new Map([['main.tex', catT.replace('\\catcode`\\%=12', c)]]), () => () => true).files.get('main.tex'), 'CATINJECTED'), c);
  // (V3, V4) \verb|}| keeps the count; a line inside a multi-line \url is out; a % in \href's address is a letter;
  // a file the document lists as it stands takes none
  const back1 = (files, edit) => { const th = new Map(files); edit(th); const bl = buildModel({ files, main: 'main.tex' }).blocks; return commentsBack(files, th, (f) => bodyAt(bl, f, files.get(f))); };
  const vd = '\\documentclass{article}\n\\usepackage{url,hyperref,listings}\n\\begin{document}\nSee \\verb|}| and \\url{http://a.b/\nc} then.\nA \\href{http://x.org/a%20b}{the page}.\nSame paragraph.\n\n\\input{code}\n\\lstinputlisting{code.tex}\n\\end{document}\n';
  const vf = new Map([['main.tex', vd], ['code.tex', 'Code line.\n']]);
  const rv3 = back1(vf, (th) => { th.set('main.tex', vd.replace('http://a.b/\n', 'http://a.b/\n% comment (Eve): URLV3\n').replace('{the page}.\n', '{the page}.\n% comment (Eve): HREFOK\n')); th.set('code.tex', 'Code line.\n% comment (Eve): LISTED\n'); });
  assert.ok(!reached(rv3.files.get('main.tex'), 'URLV3') && rv3.files.get('main.tex').includes(L('Eve', '', 'HREFOK') + '\n') && rv3.files.get('code.tex') === 'Code line.\n', JSON.stringify([...rv3.files]));
  // (Grok Bot's check of V1 to V4) a catcode in an \input file of any extension; \url|...| with a %
  // before a multi-line \url{...}; a listed name with dir/.. or quotes
  const pre4 = (x) => '\\documentclass{article}\n\\usepackage{url}\n' + x + '\\begin{document}\nFirst line.\n\nSecond line.\n\\end{document}\n';
  for (const [n, t] of [['setup.txt', '\\catcode`\\%=12\n'], ['fig.tikz', '\\catcode37=12\n']]) {
    const d = pre4('\\input{' + n + '}\n');
    const r = back1(new Map([['main.tex', d], [n, t]]), (th) => th.set('main.tex', d.replace('First line.\n', 'First line.\n% comment (Eve): \\textbf{EXEC}\n')));
    assert.ok(!reached(r.files.get('main.tex'), 'EXEC'), n);
  }
  const vu = '\\documentclass{article}\n\\usepackage{url}\n\\begin{document}\nSee \\url|http://x/%| and \\url{http://a.b/\nc} then.\n\\end{document}\n';
  const ru = back1(new Map([['main.tex', vu]]), (th) => th.set('main.tex', vu.replace('http://a.b/\n', 'http://a.b/\n% comment (Eve): URLD\n')));
  assert.ok(!reached(ru.files.get('main.tex'), 'URLD'), ru.files.get('main.tex'));
  for (const l of ['\\lstinputlisting[firstline=2]{sub/../code.tex}', '\\VerbatimInput{"code.tex"}'])
    assert.ok(listedFiles(new Map([['main.tex', l]])).has('code.tex'), l);
  for (const l of ['\\lstinputlisting[language=TeX]{./code}', '\\verbatiminput{code.tex}', '\\inputminted{latex}{code.tex}', '\\tcbinputlisting{listing file=code.tex}', '\\VerbatimInput[frame=single]{code}'])
    assert.ok(listedFiles(new Map([['main.tex', l]])).has('code.tex'), l);
  const sty2 = new Map([['main.tex', doc0], ['p.sty', '\\catcode`\\%=12\n']]);
  assert.strictEqual(commentsBack(sty2, new Map([['main.tex', doc0.replace('Hello.\n', 'Hello.\n% comment (Eve): x\n')], ['p.sty', '\\catcode`\\%=12\n']]), () => () => true).files.get('main.tex'), doc0, 'a package of the project changing it: none either');
});

group('S5: a comment from a comments only copy runs nothing, even where % stopped being a comment', () => {
  // three documents that make % an ordinary character without naming a catcode in any form the
  // source can be searched for: a \csname built name, \scantokens over a name made of strings, Lua
  const docs = [
    '\\documentclass{article}\n\\begin{document}\n\\csname c\\string atcode\\endcsname 37=12\nFirst line.\n\nSecond line.\n\\end{document}\n',
    '\\documentclass{article}\n\\edef\\rkcc{\\string\\c atcode}\n\\begin{document}\n\\scantokens\\expandafter{\\rkcc 37=12\\relax}\nFirst line.\n\nSecond line.\n\\end{document}\n',
    '\\documentclass{article}\n\\usepackage{luacode}\n\\begin{document}\n\\begin{luacode}\ntex["set" .. "cat" .. "code"]("global", 37, 12)\n\\end{luacode}\nFirst line.\n\nSecond line.\n\\end{document}\n'
  ];
  const payload = '\\uppercase{rkinjected} \\immediate\\write18{echo x} } $ & # ^^5c _ ~ % \u00e9 \u65e5';
  for (const d of docs) {
    const files = new Map([['main.tex', d]]);
    const blocks = buildModel({ files, main: 'main.tex' }).blocks;
    const theirs = d.replace('First line.\n', 'First line.\n% comment (Eve) on "First {line}": ' + payload + '\n').replace('Second line.\n', 'Second line.\n% comment (E\\ve$): fine\n% reply (Mallory): \\def\\x{X}\\x\n');
    const r = commentsBack(files, new Map([['main.tex', theirs]]), (f) => bodyAt(blocks, f, files.get(f)));
    const m = r.files.get('main.tex');
    const added = m.split('\n').filter((l) => !d.split('\n').includes(l));
    assert.strictEqual(added.length, 3, d + '\n' + m);
    // every line that came in: % and then letters, digits and spaces alone, whatever % has become
    for (const l of added) assert.ok(/^% (comment|reply)32( [A-Z2-7]+| 0)+$/.test(l), l);
    assert.ok(!/\\(uppercase|write18|def|immediate)/.test(m), 'no command of theirs in the source');
    const c = findComments(m, 'main.tex');
    assert.deepStrictEqual(c.map((x) => [x.who, x.quote, x.body, x.replies.map((y) => [y.who, y.body])]),
      [['Eve', 'First {line}', payload, []], ['E\\ve$', '', 'fine', [['Mallory', '\\def\\x{X}\\x']]]], 'shown as typed');
    // and again: the same copy brings nothing new, and keeps them
    assert.strictEqual(commentsBack(r.files, new Map([['main.tex', theirs]]), (f) => bodyAt(buildModel({ files: r.files, main: 'main.tex' }).blocks, f, r.files.get(f))).files.get('main.tex'), m, 'the same comments in their first form are the same lines');
  }
  // a comment line of the base in the first form, which their copy keeps: kept as it was, not
  // written again; one they took out goes, in either form
  const b = 'A line.\n% comment (Ana): mine\nB line.\n' + L('Eve', '', 'old') + '\nC line.\n';
  assert.strictEqual(commentsOf(b, b).text, b);
  const t2 = b.replace(L('Eve', '', 'old') + '\n', '% comment (Eve): old\n');
  assert.strictEqual(commentsOf(b, t2).text, b, 'the same comment in the other form is the same line');
  assert.strictEqual(commentsOf(b, b.replace('% comment (Ana): mine\n', '')).text, b.replace('% comment (Ana): mine\n', ''));
  // a line that only looks like the base32 form is no comment and does not come in
  assert.strictEqual(parseCommentLine('% comment32 AB \\input{x} CD'), null);
  assert.strictEqual(commentsOf('A.\nB.\n', 'A.\n% comment32 AB \\input{x} CD\nB.\n').text, 'A.\nB.\n');
  // what a reader of such a link writes is already in that form, and Review sees it as a comment
  assert.ok(onlyComments(b, b.replace('C line.\n', 'C line.\n' + L('Bo', 'C', 'x') + '\n')));
});

group('R4 review: two people\'s edits that touch keep each one\'s author, and Reject by one undoes theirs alone (M4)', () => {
  const run = (base, steps) => {
    let t = base, segs = [];
    for (const [who, f] of steps) { const n = f(t); for (const x of editSpans(t, n, false)) segs = authorEdit(segs, x.s, x.e, x.n, who, t.slice(x.s, x.e)); t = n; }
    const parts = [];
    for (const c of changes(base, t, 'main.tex')) parts.push(...byAuthor(c, segs, t));
    return { t, parts, got: parts.map((d) => d.who + ':' + d.a + '>' + d.b) };
  };
  const B = 'The quick brown fox jumps.\n';
  assert.deepStrictEqual(run(B, [['Me', (t) => t.replace('quick ', 'quick big ')], ['Eve', (t) => t.replace('brown ', '')]]).got, ['Me:>big ', 'Eve:brown >']);
  assert.deepStrictEqual(run(B, [['Eve', (t) => t.replace('jumps', '')], ['Me', (t) => t.replace('fox ', '')]]).got, ['Me:fox >', 'Eve:jumps>']);
  assert.deepStrictEqual(run(B, [['Eve', (t) => t.replace('fox', 'cat')], ['Me', (t) => t.replace('cat', 'dog')]]).got, ['Me:>dog ', 'Eve:fox >']);
  // a deletion that takes in another's deletion: both kept, each with its words
  const r3 = run('a b c d e\n', [['Eve', (t) => t.replace('c ', '')], ['Me', (t) => t.replace('b d ', '')]]);
  assert.deepStrictEqual(r3.got, ['Me:b >', 'Eve:c >', 'Me:d >']);
  // Reject by Eve: her words back, mine still gone; and the other way round
  for (const [steps, who, want] of [[[['Me', (t) => t.replace('quick ', 'quick big ')], ['Eve', (t) => t.replace('brown ', '')]], 'Eve', 'The quick big brown fox jumps.\n'],
    [[['Eve', (t) => t.replace('jumps', '')], ['Me', (t) => t.replace('fox ', '')]], 'Eve', 'The quick brown jumps.\n'],
    [[['Eve', (t) => t.replace('jumps', '')], ['Me', (t) => t.replace('fox ', '')]], 'Me', 'The quick brown fox .\n']]) {
    const { t, parts } = run(B, steps);
    let out = t;
    for (const d of parts.filter((x) => x.who === who).sort((x, y) => y.bs - x.bs)) out = out.slice(0, d.bs) + d.a + out.slice(d.be);
    assert.strictEqual(out, want, 'Reject All by ' + who);
  }
  // in the page: Eve's copy deletes next to my deletion; Reject All of Eve's leaves mine
  const A = mkApp('The quick brown fox jumps.\n', true);
  A.myName = () => 'Pedro';
  edit(A, 16, 20, '');
  A.rvBy = 'Eve'; edit(A, 16, 21, '', 'merge'); A.rvBy = null;
  const cs = A.currentChanges();
  assert.deepStrictEqual(cs.map((c) => [c.a, A.rvName(c.who)]), [['fox ', 'Pedro'], ['jumps', 'Eve']]);
  // (Reject as rejectChanges makes it: each piece's old text put back, one step)
  for (const c of cs.filter((x) => x.who === 'Eve').sort((x, y) => y.bs - x.bs)) edit(A, c.bs, c.be, c.a, 'reject');
  assert.strictEqual(T(A), 'The quick brown jumps.\n');
  assert.deepStrictEqual(A.currentChanges().map((c) => [c.a, A.rvName(c.who)]), [['fox ', 'Pedro']], 'my deletion still waits, still mine');
  // what is kept with the base keeps the deleted words, and only text
  review.rvAuthorsFrom.call(A, { authors: [['main.tex', T(A).length, [{ s: 16, e: 16, who: 'Pedro', t: 'fox ' }, { s: 1, e: 1, who: 'X', t: { evil: 1 } }]]] });
  assert.deepStrictEqual(A.authors.get('main.tex'), [{ s: 16, e: 16, who: 'Pedro', t: 'fox ' }, { s: 1, e: 1, who: 'X' }]);
});

group('a Word file\'s tracked changes: the layer of who wrote what made in one pass per step, the same as one edit at a time, in a linear time; a listing of the changes halves to its segments (word review M2)', () => {
  // (a small generator, the same cases every run)
  let seed = 7;
  const rnd = (n) => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) % n; };
  const W = ['a', 'b', ' ', '\n', 'xy', 'the ', '\n\n'];
  const oneByOne = (base, steps) => { let segs = [], prev = base; for (const st of steps) { for (const x of editSpans(prev, st.tex, true)) segs = authorEdit(segs, x.s, x.e, x.n, st.who, prev.slice(x.s, x.e)); prev = st.tex; } return segs; };
  let many = 0;
  for (let k = 0; k < 600; k++) {
    let base = ''; const len = 5 + rnd(60) + rnd(2) * 300; for (let i = 0; i < len; i++) base += W[rnd(W.length)];
    const steps = []; let cur = base;
    for (let j = 0; j < 1 + rnd(4); j++) {
      let x = cur;
      const edits = 1 + rnd(30); for (let m = 0; m < edits; m++) { const p = rnd(x.length + 1), q = Math.min(x.length, p + rnd(5) * rnd(2)); let ins = ''; for (let i = 0; i < rnd(3); i++) ins += W[rnd(W.length)]; x = x.slice(0, p) + ins + x.slice(q); }
      if (editSpans(cur, x, true).length > 1) many++;
      steps.push({ who: ['Ana', 'Bo', 'Cy'][rnd(3)], tex: x }); cur = x;
    }
    const want = oneByOne(base, steps), got = authorSteps(base, steps);
    assert.deepStrictEqual(got.segs, want, JSON.stringify({ base, steps }));
    assert.strictEqual(got.cut, 0);
    // (their starts and ends rise together, which the halving of byAuthor takes for granted)
    for (let i = 1; i < want.length; i++) assert.ok(want[i].s >= want[i - 1].s && want[i].e >= want[i - 1].e, JSON.stringify(want));
  }
  assert.ok(many > 100, 'steps of many edits each: ' + many);
  // 21000 insertions by two people (20000 took 54 s one edit at a time); the layer keeps MAX_SEGS,
  // the ones at the start left out, counted and credited to "Word" by one range (review N1: they
  // showed as the person's own, "You"). (Lines of thirty changed words between lines
  // left as they were: diff.js takes no more than 1500 edits at a time as edits apart.)
  const lines = (f) => { let t = '', k = 0; for (let i = 0; i < 700; i++) { const ws = []; for (let j = 0; j < 30; j++, k++) ws.push(f('w' + k, k)); t += ws.join(' ') + '\nkept line ' + i + '\n'; } return t; };
  const base = lines((w) => w), ana = lines((w, k) => k % 2 ? w : w + 'x'), now = lines((w) => w + 'x');
  const t0 = Date.now();
  const A = authorSteps(base, [{ who: 'Ana', tex: ana }, { who: 'Bo', tex: now }]);
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, 'authorSteps on 21000 edits: ' + ms + ' ms');
  assert.strictEqual(A.segs.length, MAX_SEGS);
  assert.ok(A.cut >= 21000 - MAX_SEGS, 'cut ' + A.cut);
  assert.deepStrictEqual([A.segs[0].s, A.segs[0].who, A.segs[0].rest, A.segs[0].e === A.from, A.from > 0], [0, 'Word', true, true, true]);
  // (a word changed is the word replaced: its old letters a mark, its new ones a range)
  const rs = A.segs.filter((g) => g.e > g.s).slice(-2).map((g) => g.who + ':' + now.slice(g.s, g.e));
  assert.deepStrictEqual(rs, ['Ana:w20998x', 'Bo:w20999x']);
  // (hunks with blank lines between them are one only where that changes fewer characters: a
  // join and a split near each other, not two edits the lines' diff pairs well)
  const J = changes('x\n\nFirst para\n\nsecond para joined.\n\nThird para split here.\n\ny\n', 'x\n\nFirst para second para joined.\n\nThird para split\n\nhere.\n\ny\n', 'f');
  assert.deepStrictEqual(J.map((c) => [c.a, c.b]), [['\n\n', ' '], [' ', '\n\n']]);
  const T = 'The first has some words.\n\nThe second has more words.\n% comment (Ana): Is it?\n\nEnd.\n';
  assert.deepStrictEqual(changes(T, T.replace('some', 'some good').replace('more words', 'words'), 'f').map((c) => [c.a, c.b]), [['', 'good '], ['more ', '']]);
  // the changes listed by author, each its own, in a time the page does not feel
  const t1 = Date.now();
  const list = [];
  for (const c of changes(base, now, 'main.tex')) list.push(...byAuthor(c, A.segs, now));
  assert.ok(Date.now() - t1 < 3000, 'byAuthor over 20000 segments: ' + (Date.now() - t1) + ' ms');
  assert.ok(list.some((c) => c.who === 'Ana') && list.some((c) => c.who === 'Bo') && !list.some((c) => c.who === ''), 'every change has an author');
  // (a change at the edge of the two may go either way)
  assert.ok(list.filter((c) => c.be <= A.from).length > 300 && list.every((c) => c.be > A.from || c.who === 'Word') && list.every((c) => c.bs < A.from + 20 || c.who === 'Ana' || c.who === 'Bo'), 'the start, left out, is "Word"\'s, the rest Ana\'s and Bo\'s');
  // (the person's own edit there is theirs, and cuts the range in two that stay "Word"'s; a deletion
  // inside it with no mark is "Word"'s; the range is kept by the project's store and by the cap)
  const at = now.indexOf('w100x'), mine = now.slice(0, at) + 'mine ' + now.slice(at + 2);
  // (a layer with room: in a full one the cap takes the first pieces, this one too)
  const S = authorEdit(A.segs.slice(0, 5000), at, at + 2, 5, '', now.slice(at, at + 2));
  const L2 = []; for (const c of changes(base, mine, 'main.tex')) L2.push(...byAuthor(c, S, mine));
  const near = L2.filter((c) => c.be >= at - 40 && c.bs <= at + 40).map((c) => [c.who, c.a, c.b]);
  assert.ok(near.some((x) => x[0] === '' && x[2].includes('mine')) && near.filter((x) => x[0] === 'Word').length >= 2 && S.filter((g) => g.rest).length === 2, JSON.stringify(near));
  const D = base.replace(' w3 ', ' '), dl = byAuthor(changes(base, D, 'main.tex')[0], [{ s: 0, e: 900, who: 'Word', rest: true }], D);
  assert.deepStrictEqual(dl.map((c) => [c.who, c.b]), [['Word', '']]);
  const R = Object.create(review); R.files = new Map([['main.tex', mine]]);
  R.rvAuthorsFrom({ authors: [['main.tex', mine.length, S]] });
  assert.deepStrictEqual(R.authors.get('main.tex').slice(0, 1), [S[0]]);
  const full = layerStep(A.segs, now, now.replace('kept line 600', 'kept line 600 and more'), 'Cy', false);
  assert.ok(full.length === MAX_SEGS && full[0].rest && full[0].who === 'Word' && full[0].s === 0, JSON.stringify(full.slice(0, 2)));
});

group('hunks taken as one block list no more characters than apart, and no change across a paragraph break but a join or a split (review N2)', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (n) => Math.floor(rnd() * n);
  const W = ['alpha', 'beta', 'gamma', 'delta', 'x', 'y', 'z', 'the', 'and', '.', ','];
  const para = () => { const w = []; for (let i = 1 + ri(12); i > 0; i--) w.push(W[ri(W.length)]); return w.join(' '); };
  const doc = () => { const ps = []; for (let i = 2 + ri(15); i > 0; i--) ps.push(para()); return ps.join(rnd() < 0.8 ? '\n\n' : '\n\n\n') + '\n'; };
  // (a join, a split, a paragraph out or in, a word changed: one to four of them)
  const mutate = (t) => {
    const ps = t.split('\n\n');
    for (let k = 1 + ri(4); k > 0; k--) {
      if (!ps.length) ps.push(para());
      const i = ri(ps.length), r = rnd();
      if (r < 0.2 && i + 1 < ps.length) { ps[i] += ' ' + ps[i + 1]; ps.splice(i + 1, 1); }
      else if (r < 0.4) { const w = ps[i].split(' '), c = ri(w.length + 1); ps.splice(i, 1, w.slice(0, c).join(' '), w.slice(c).join(' ')); }
      else if (r < 0.6) ps.splice(i, 1);
      else if (r < 0.75) ps.splice(i, 0, para());
      else { const w = ps[i].split(' '); w[ri(w.length)] = W[ri(W.length)]; ps[i] = w.join(' '); }
    }
    return ps.join('\n\n');
  };
  const chars = (cs) => cs.reduce((n, c) => n + c.a.length + c.b.length, 0);
  const across = (c) => /\n[ \t]*\n/.test(c.a + '\0' + c.b) && /\S/.test(c.a + c.b);
  let pairs = 0, fewer = 0;
  for (let it = 0; it < 3000; it++) {
    const a = doc(), b = mutate(a);
    if (a === b) continue;
    pairs++;
    const C = changes(a, b, 'm'), apart = hunks(a, b).flatMap((h) => hunkChanges(h, 'm'));
    let back = b;
    for (const c of [...C].sort((x, y) => y.bs - x.bs)) back = back.slice(0, c.bs) + c.a + back.slice(c.be);
    let fwd = a;
    for (const c of [...C].sort((x, y) => y.as - x.as)) fwd = fwd.slice(0, c.as) + c.b + fwd.slice(c.ae);
    assert.ok(back === a && fwd === b, 'Reject All and Accept All exact: ' + JSON.stringify([a, b]));
    assert.ok(chars(C) <= chars(apart), 'no more characters than the hunks apart: ' + JSON.stringify([a, b, C.map((c) => [c.a, c.b])]));
    for (const c of C) assert.ok(!across(c) || apart.some((o) => o.as === c.as && o.a === c.a && o.b === c.b), 'a change across a paragraph break only where the hunks apart list it: ' + JSON.stringify([a, b, c.a, c.b]));
    if (chars(C) < chars(apart)) fewer++;
  }
  assert.ok(pairs > 2900 && fewer > 100, pairs + ' pairs, ' + fewer + ' with fewer characters');
  // (review N2's pair: delta to gamma and a paragraph out, not one change across the break)
  const a = 'beta and delta .\n\ngamma z alpha z\n\n, y alpha y\n\nand z z , , z and z x z\n\nthe alpha the . gamma beta y x x\n\nx , and x\n';
  const b = 'beta and gamma .\n\n, y alpha y\n\nand z z ,\n\nthe alpha the . gamma beta y x x\n\nx , and x\n';
  assert.deepStrictEqual(changes(a, b, 'm').slice(0, 2).map((c) => [c.a, c.b]), [['delta', 'gamma'], ['gamma z alpha z\n\n', '']]);
});

console.log('review: ' + groups + ' groups of checks passed');
// (src/review.js's imports leave a handle open under node: the run ends here)
process.exit(0);
