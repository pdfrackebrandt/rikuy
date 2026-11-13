// Lists as edits (src/lists.js): reading a list's items and nested lists; an item one level down
// (Tab) into a new list or the one that ends the item before, and back up (Shift+Tab) with the
// items after it staying under it; items made paragraphs again at any level, labels kept as words;
// what labels and numbers a list (enumitem's options, a pandoc list's \def\labelenumi and
// \setcounter, the enumerate package's "(a)", the preamble's \setlist and \renewcommand, LaTeX's
// own), and each written back where it is written; start, continuation, Restart at 1, spacing,
// kind; Word's automatic list markers; sorting; multilevel \setlist lines; LaTeX's depth limit; a
// stranger's long or hostile source read in bounded time.
import assert from 'node:assert/strict';
import * as X from '../src/lists.js';
import { buildModel } from '../src/model.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const ap = (src, r) => src.slice(0, r.s) + r.t + src.slice(r.e);
const apE = (src, edits) => { for (const x of [...edits].sort((a, b) => b.s - a.s)) src = src.slice(0, x.s) + x.t + src.slice(x.e); return src; };
const at = (src, w, k = 1) => src.indexOf(w) + k;
const L3 = '\\begin{itemize}\n  \\item One\n  \\item Two\n  \\item Three\n\\end{itemize}\n';
const N3 = '\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n      \\item Three\n    \\end{itemize}\n\\end{itemize}\n';
const cfg0 = X.listSetup('\\documentclass{article}\n\\begin{document}\n');

ok('reading: items, labels, nested lists, their parents, the chain at a place', () => {
  const src = '\\begin{enumerate}[label=\\alph*)]\n  \\item[x] One % note\n  \\item Two\n    \\begin{itemize}\n      \\item Deep\n    \\end{itemize}\n\\end{enumerate}';
  const [L] = X.readLists(src);
  assert.equal(L.name, 'enumerate'); assert.equal(L.kind, 'enum'); assert.equal(L.items.length, 2);
  assert.equal(src.slice(L.opt.is, L.opt.ie), 'label=\\alph*)');
  assert.equal(src.slice(L.items[0].lab.is, L.items[0].lab.ie), 'x');
  assert.equal(src.slice(L.items[0].s, L.items[0].e), '\\item[x] One % note');
  const C = L.items[1].lists[0];
  assert.equal(C.name, 'itemize'); assert.equal(C.parent.L, L); assert.equal(C.parent.k, 1); assert.ok(C.direct);
  assert.deepEqual(X.levelOf(C), { level: 1, depth: 2 });
  const ch = X.chainAt(X.readLists(src), at(src, 'Deep'));
  assert.equal(ch.length, 2); assert.equal(ch[1].L.name, 'itemize');
  assert.equal(src.slice(L.nameAt[0], L.nameAt[1]), 'enumerate'); assert.equal(src.slice(L.endAt[0], L.endAt[1]), 'enumerate');
});

ok('Tab: an item goes under the one before, into a new list of its kind or the list that ends it', () => {
  const r = X.demote(L3, 0, L3.length, at(L3, 'Two'), at(L3, 'Two'));
  const once = ap(L3, r);
  assert.equal(once, '\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n  \\item Three\n\\end{itemize}\n');
  assert.equal(once.slice(r.a - 1, r.a + 2), 'Two');
  const twice = ap(once, X.demote(once, 0, once.length, at(once, 'Three'), at(once, 'Three')));
  assert.equal(twice, N3);
  // the first item has none before it; a list one line long and an item with a comment
  assert.equal(X.demote(L3, 0, L3.length, at(L3, 'One'), at(L3, 'One')), null);
  const tight = '\\begin{itemize}\\item a \\item b % c\n\\item d\\end{itemize}';
  const t2 = ap(tight, X.demote(tight, 0, tight.length, at(tight, 'b ', 0), at(tight, 'b ', 0)));
  assert.equal(t2, '\\begin{itemize}\\item a\n    \\begin{itemize}\n      \\item b % c\n    \\end{itemize}\n\\item d\\end{itemize}');
});

ok('Tab on several selected items moves them together; their own lists come along a level deeper', () => {
  const src = '\\begin{enumerate}\n  \\item A\n  \\item B\n    \\begin{enumerate}\n      \\item Bx\n    \\end{enumerate}\n  \\item C\n  \\item D\n\\end{enumerate}';
  const r = X.demote(src, 0, src.length, at(src, 'B'), at(src, 'C'));
  assert.equal(ap(src, r), '\\begin{enumerate}\n  \\item A\n    \\begin{enumerate}\n      \\item B\n        \\begin{enumerate}\n          \\item Bx\n        \\end{enumerate}\n      \\item C\n    \\end{enumerate}\n  \\item D\n\\end{enumerate}');
});

ok('Shift+Tab: the item goes up after the item it stood in; the items after it stay under it', () => {
  const r = X.promote(N3, 0, N3.length, at(N3, 'Two'), at(N3, 'Two'));
  assert.equal(ap(N3, r), '\\begin{itemize}\n  \\item One\n  \\item Two\n    \\begin{itemize}\n      \\item Three\n    \\end{itemize}\n\\end{itemize}\n');
  const r2 = X.promote(N3, 0, N3.length, at(N3, 'Three'), at(N3, 'Three'));
  assert.equal(ap(N3, r2), '\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n  \\item Three\n\\end{itemize}\n');
  // Tab then Shift+Tab: the bytes of before
  const d = ap(L3, X.demote(L3, 0, L3.length, at(L3, 'Two'), at(L3, 'Two')));
  assert.equal(ap(d, X.promote(d, 0, d.length, at(d, 'Two'), at(d, 'Two'))), L3);
  // at the first level there is no level up
  assert.equal(X.promote(L3, 0, L3.length, at(L3, 'Two'), at(L3, 'Two')), null);
  // what the item above held after its list goes with the last item that came up
  const tail = '\\begin{itemize}\n  \\item P\n    \\begin{enumerate}[label=(\\roman*),start=2]\n      \\item a\n      \\item b\n      \\item c\n    \\end{enumerate}\n    More of P.\n\\end{itemize}';
  assert.equal(ap(tail, X.promote(tail, 0, tail.length, at(tail, 'item b', 6), at(tail, 'item b', 6))),
    '\\begin{itemize}\n  \\item P\n    \\begin{enumerate}[label=(\\roman*),start=2]\n      \\item a\n    \\end{enumerate}\n  \\item b\n    \\begin{enumerate}[label=(\\roman*)]\n      \\item c\n    \\end{enumerate}\n    More of P.\n\\end{itemize}');
});

ok('LaTeX nests lists four deep of a kind: a fifth is refused, not written', () => {
  // Tab pressed again and again on the last item: one level more each time, then refused at five
  let src = '\\begin{itemize}\\item a\\item b\\item c\\item d\\item e\\end{itemize}';
  const levels = [];
  for (const w of ['b', 'c', 'c', 'd', 'd', 'd', 'e', 'e', 'e', 'e']) {
    const p = at(src, '\\item ' + w, 6), r = X.demote(src, 0, src.length, p, p);
    if (!r || r.refused) { levels.push(w + (r ? '!' : '-')); continue; }
    src = ap(src, r);
    levels.push(w + X.levelOf(X.chainAt(X.readLists(src), at(src, '\\item ' + w, 6)).pop().L).level);
  }
  assert.deepEqual(levels, ['b2', 'c2', 'c3', 'd2', 'd3', 'd4', 'e2', 'e3', 'e4', 'e!']);
  let d = '\\begin{itemize}\\item a\\begin{itemize}\\item b\\begin{itemize}\\item c\\begin{itemize}\\item d\\item e\\end{itemize}\\end{itemize}\\end{itemize}\\end{itemize}';
  assert.deepEqual(X.demote(d, 0, d.length, at(d, 'item e', 5), at(d, 'item e', 5)), { refused: 'deep' });
});

ok('items made paragraphs again: in the middle, at either end, nested, labelled, a description\'s term in bold', () => {
  assert.equal(ap(L3, X.unlist(L3, 0, L3.length, at(L3, 'Two'), at(L3, 'Two'))), '\\begin{itemize}\n  \\item One\n\\end{itemize}\n\nTwo\n\n\\begin{itemize}\n  \\item Three\n\\end{itemize}\n');
  const doc = 'Before.\n\\begin{itemize}\n  \\item only\n\\end{itemize}\nAfter.';
  assert.equal(ap(doc, X.unlist(doc, 0, doc.length, at(doc, 'only'), at(doc, 'only'))), 'Before.\n\nonly\n\nAfter.');
  assert.equal(ap(N3, X.unlist(N3, 0, N3.length, at(N3, 'Two'), at(N3, 'Two'))), '\\begin{itemize}\n  \\item One\n\n    Two\n\n    \\begin{itemize}\n      \\item Three\n    \\end{itemize}\n\\end{itemize}\n');
  const lab = '\\begin{itemize}\n  \\item[a)] one\n  \\item[b)] two\n\\end{itemize}';
  assert.equal(ap(lab, X.unlist(lab, 0, lab.length, at(lab, 'two'), at(lab, 'two'))), '\\begin{itemize}\n  \\item[a)] one\n\\end{itemize}\n\nb) two');
  const d = '\\begin{description}\n  \\item[Term] Def\n  \\item[Other] More\n\\end{description}';
  assert.equal(ap(d, X.unlist(d, 0, d.length, at(d, 'Def'), at(d, 'Def'))), '\\textbf{Term} Def\n\n\\begin{description}\n  \\item[Other] More\n\\end{description}');
  // two selected items at once
  assert.equal(ap(L3, X.unlist(L3, 0, L3.length, at(L3, 'One'), at(L3, 'Two'))), 'One\n\nTwo\n\n\\begin{itemize}\n  \\item Three\n\\end{itemize}\n');
  // the set up stays with the list that keeps items
  const su = '\\begin{itemize}\n\\setlength\\itemsep{0pt}\n  \\item one\n  \\item two\n\\end{itemize}';
  assert.equal(ap(su, X.unlist(su, 0, su.length, at(su, 'one'), at(su, 'one'))), 'one\n\n\\begin{itemize}\n  \\setlength\\itemsep{0pt}\n  \\item two\n\\end{itemize}');
});

ok('formats: enumitem options, label*, the enumerate package, a pandoc list, the preamble, LaTeX\'s own', () => {
  const f = (src, c = cfg0, k = 0) => X.formatOf(src, X.allLists(X.readLists(src))[k], c);
  assert.deepEqual([f('\\begin{enumerate}[label=\\alph*), start=3, nosep]\\item a\\end{enumerate}').label, f('\\begin{enumerate}[label=\\alph*), start=3, nosep]\\item a\\end{enumerate}').start, f('\\begin{enumerate}[label=\\alph*), start=3, nosep]\\item a\\end{enumerate}').sep], ['\\alph*)', 3, 'nosep']);
  assert.equal(f('\\begin{enumerate}[(i)]\\item a\\end{enumerate}').label, '(\\roman*)');
  assert.equal(f('\\begin{enumerate}[(i)]\\item a\\end{enumerate}').from, 'short');
  const pd = f('\\begin{enumerate}\n\\def\\labelenumi{\\Alph{enumi}.}\n\\setcounter{enumi}{6}\n\\item G\n\\end{enumerate}');
  assert.deepEqual([pd.label, pd.from, pd.start, pd.startFrom], ['\\Alph*.', 'def', 7, 'counter']);
  const pre = '\\documentclass{article}\n\\usepackage{enumitem}\n\\setlist[enumerate,2]{label=\\arabic{enumi}.\\arabic*}\n\\setlist{nosep}\n\\renewcommand{\\labelitemi}{--}\n\\begin{document}\n';
  const cfg = X.listSetup(pre);
  const nested = '\\begin{enumerate}\\item a\\begin{enumerate}\\item b\\end{enumerate}\\end{enumerate}';
  const inner = f(nested, cfg, 1);
  assert.deepEqual([inner.label, inner.from, inner.sep, inner.level], ['\\arabic{enumi}.\\arabic*', 'setlist', 'nosep', 2]);
  assert.equal(f('\\begin{itemize}\\item a\\end{itemize}', cfg).label, '--');
  assert.equal(X.bulletGlyph(f('\\begin{itemize}\\item a\\end{itemize}', cfg).label), '–');
  assert.equal(f(nested, cfg0, 1).label, '(\\alph*)');
  assert.equal(f('\\begin{itemize}\\item a\\begin{itemize}\\item b\\end{itemize}\\end{itemize}', cfg0, 1).label, '\\normalfont\\bfseries\\textendash');
  assert.ok(f('\\begin{enumerate}[resume]\\item a\\end{enumerate}').resume);
  assert.equal(f('\\begin{itemize}\n\\tightlist\n\\item a\\end{itemize}').sep, 'tight');
});

ok('labels written where they are written: an option, a short label, a definition; or added the document\'s way', () => {
  const one = (src, code, mech = 'enumitem', c = cfg0) => { const r = X.labelEdits(src, X.readLists(src)[0], code, c, mech); return r && { t: apE(src, r.edits), pkgs: r.pkgs }; };
  assert.deepEqual(one('\\begin{enumerate}\\item a\\end{enumerate}', '\\alph*)'), { t: '\\begin{enumerate}[label=\\alph*)]\\item a\\end{enumerate}', pkgs: ['enumitem'] });
  assert.equal(one('\\begin{enumerate}[label=\\alph*),start=2]\\item a\\end{enumerate}', '\\roman*.').t, '\\begin{enumerate}[label=\\roman*.,start=2]\\item a\\end{enumerate}');
  // LaTeX's own label again: the key goes, and empty brackets with it
  assert.equal(one('\\begin{enumerate}[label=\\alph*)]\\item a\\end{enumerate}', null).t, '\\begin{enumerate}\\item a\\end{enumerate}');
  assert.equal(one('\\begin{enumerate}[label=\\alph*)]\\item a\\end{enumerate}', '\\arabic*.').t, '\\begin{enumerate}\\item a\\end{enumerate}');
  assert.equal(one('\\begin{enumerate}[(a)]\\item a\\end{enumerate}', '\\roman*.', 'short').t, '\\begin{enumerate}[i.]\\item a\\end{enumerate}');
  assert.equal(one('\\begin{enumerate}[(a)]\\item a\\end{enumerate}', null, 'short').t, '\\begin{enumerate}\\item a\\end{enumerate}');
  assert.equal(one('\\begin{enumerate}\\item a\\end{enumerate}', 'Step \\arabic*:', 'short').t, '\\begin{enumerate}[Step 1:]\\item a\\end{enumerate}');
  assert.equal(one('\\begin{enumerate}\n\\def\\labelenumi{\\alph{enumi})}\n\\item a\\end{enumerate}', '(\\roman*)').t, '\\begin{enumerate}\n\\def\\labelenumi{(\\roman{enumi})}\n\\item a\\end{enumerate}');
  assert.equal(one('\\begin{itemize}\\item a\\end{itemize}', '$\\circ$').t, '\\begin{itemize}[label=$\\circ$]\\item a\\end{itemize}');
  // bullets without enumitem (the enumerate package loaded): \renewcommand in the list
  assert.equal(one('\\begin{itemize}\n  \\item a\n\\end{itemize}', '$\\circ$', 'short').t, '\\begin{itemize}\n  \\renewcommand{\\labelitemi}{$\\circ$}\n  \\item a\n\\end{itemize}');
  assert.equal(one('\\begin{itemize}\\item a\\end{itemize}', '\\textbullet').t, '\\begin{itemize}\\item a\\end{itemize}');
  // a value with a comma or a bracket is braced
  assert.equal(one('\\begin{enumerate}\\item a\\end{enumerate}', 'Item [\\arabic*]').t, '\\begin{enumerate}[label={Item [\\arabic*]}]\\item a\\end{enumerate}');
  // a description list has no label of its own
  assert.equal(one('\\begin{description}\\item[x] a\\end{description}', '\\alph*)'), null);
});

ok('start, continue, Restart at 1, spacing, kind', () => {
  const L = (s) => X.readLists(s)[0];
  const e = '\\begin{enumerate}[label=\\alph*)]\n  \\item a\n  \\item b\n\\end{enumerate}';
  assert.equal(apE(e, X.startEdits(e, L(e), 5, cfg0, 'enumitem').edits), e.replace('\\alph*)]', '\\alph*),start=5]'));
  const s5 = e.replace('\\alph*)]', '\\alph*),start=5]');
  assert.equal(apE(s5, X.startEdits(s5, L(s5), 1, cfg0, 'enumitem').edits), e);
  assert.equal(apE(s5, X.resumeEdits(s5, L(s5), true, cfg0).edits), e.replace('\\alph*)]', '\\alph*),resume]'));
  const pd = '\\begin{enumerate}\n\\setcounter{enumi}{4}\n\\item E\n\\end{enumerate}';
  assert.equal(apE(pd, X.startEdits(pd, L(pd), 3, cfg0, 'enumitem').edits), pd.replace('{4}', '{2}'));
  assert.equal(apE(pd, X.startEdits(pd, L(pd), 1, cfg0, 'enumitem').edits), '\\begin{enumerate}\n\\item E\n\\end{enumerate}');
  assert.equal(apE('\\begin{enumerate}\n  \\item a\n\\end{enumerate}', X.startEdits('\\begin{enumerate}\n  \\item a\n\\end{enumerate}', L('\\begin{enumerate}\n  \\item a\n\\end{enumerate}'), 4, cfg0, 'short').edits), '\\begin{enumerate}\n  \\setcounter{enumi}{3}\n  \\item a\n\\end{enumerate}');
  const r = X.restartEdit(s5, L(s5), 1);
  assert.equal(ap(s5, r), '\\begin{enumerate}[label=\\alph*),start=5]\n  \\item a\n\\end{enumerate}\n\\begin{enumerate}[label=\\alph*)]\n  \\item b\n\\end{enumerate}');
  const i = '\\begin{itemize}\n\\setlength{\\itemsep}{0pt}\n\\item a\n\\end{itemize}';
  assert.equal(apE(i, X.sepEdits(i, L(i), 'nosep', cfg0).edits), '\\begin{itemize}[nosep]\n\\item a\n\\end{itemize}');
  assert.equal(apE('\\begin{itemize}[nosep]\\item a\\end{itemize}', X.sepEdits('\\begin{itemize}[nosep]\\item a\\end{itemize}', L('\\begin{itemize}[nosep]\\item a\\end{itemize}'), null, cfg0).edits), '\\begin{itemize}\\item a\\end{itemize}');
  assert.equal(apE('\\begin{itemize}\\item a\\end{itemize}', X.sepEdits('\\begin{itemize}\\item a\\end{itemize}', L('\\begin{itemize}\\item a\\end{itemize}'), '2pt', cfg0).edits), '\\begin{itemize}[itemsep=2pt]\\item a\\end{itemize}');
  // another kind: a label or a start that was the other kind's goes
  assert.equal(apE(s5, X.kindEdits(s5, L(s5), 'itemize')), '\\begin{itemize}\n  \\item a\n  \\item b\n\\end{itemize}');
  assert.equal(apE('\\begin{itemize}[nosep]\\item a\\end{itemize}', X.kindEdits('\\begin{itemize}[nosep]\\item a\\end{itemize}', L('\\begin{itemize}[nosep]\\item a\\end{itemize}'), 'enumerate')), '\\begin{enumerate}[nosep]\\item a\\end{enumerate}');
});

ok('Word\'s automatic list markers', () => {
  const m = (t) => { const x = X.autoMarker(t); return x && [x.name, x.star, x.start]; };
  assert.deepEqual(m('-'), ['itemize', null, 1]); assert.deepEqual(m('*'), ['itemize', null, 1]);
  assert.deepEqual(m('1.'), ['enumerate', '\\arabic*.', 1]); assert.deepEqual(m('3)'), ['enumerate', '\\arabic*)', 3]);
  assert.deepEqual(m('a)'), ['enumerate', '\\alph*)', 1]); assert.deepEqual(m('(b)'), ['enumerate', '(\\alph*)', 2]);
  assert.deepEqual(m('i.'), ['enumerate', '\\roman*.', 1]); assert.deepEqual(m('IV.'), ['enumerate', '\\Roman*.', 4]);
  assert.deepEqual(m('A.'), ['enumerate', '\\Alph*.', 1]);
  for (const t of ['1', 'ab.', '(a.', '--', '1.2', '', 'iiii.']) assert.equal(X.autoMarker(t), null, t);
});

ok('numbers and bullets as the page shows them', () => {
  assert.equal(X.numText('\\arabic{enumi}.\\arabic*.', 2, [3]), '3.2.');
  assert.equal(X.numText('(\\alph*)', 2), '(b)');
  assert.equal(X.numText('\\textbf{\\Roman*.}', 4), 'IV.');
  assert.equal(X.starOf('\\theenumi.\\alph{enumii}', 2), '{\\arabic{enumi}}.\\alph*');
  assert.equal(X.l2eOf('(\\roman*)', 2), '(\\roman{enumii})');
  assert.equal(X.shortOf('\\alph*)'), 'a)'); assert.equal(X.shortOf('x] \\arabic*'), '{x] }1'); assert.equal(X.shortOf('Item \\arabic*'), '{Item }1'); assert.equal(X.shortOf('\\arabic{enumi}.\\arabic*'), '{\\arabic{enumi}.}1');
  assert.equal(X.starOfShort('{Step} 1:'), '{Step} \\arabic*:');
  const g = ['\\textbullet', '$\\bullet$', '--', '\\tiny$\\blacksquare$', '$\\circ$', '\\checkmark', '{}', 'x', '\\normalfont\\bfseries\\textendash', '\\ding{51}'].map(X.bulletGlyph);
  assert.deepEqual(g, ['•', '•', '–', '▪', '◦', '✓', '', 'x', '–', null]);
  assert.ok(X.sameBullet('$\\bullet$', '\\textbullet') && !X.sameBullet('$\\circ$', '\\textbullet'));
});

ok('sorting: items by their words, numbers, descending, comments kept on their lines', () => {
  const src = '\\begin{itemize}\n  \\item Pear\n  \\item apple % fruit\n  \\item Fig\n\\end{itemize}';
  const [L] = X.readLists(src);
  const pieces = L.items.map((x) => ({ s: x.s, e: x.e }));
  const r = X.sortEdit(src, pieces, ['Pear', 'apple', 'Fig']);
  assert.equal(ap(src, r), '\\begin{itemize}\n  \\item apple % fruit\n  \\item Fig\n  \\item Pear\n\\end{itemize}');
  assert.equal(ap(src, X.sortEdit(src, pieces, ['Pear', 'apple', 'Fig'], { descending: true })), '\\begin{itemize}\n  \\item Pear\n  \\item Fig\n  \\item apple % fruit\n\\end{itemize}');
  const one = '\\begin{itemize}\\item b % x\n\\item a\\end{itemize}';
  const [M] = X.readLists(one);
  assert.equal(ap(one, X.sortEdit(one, M.items.map((x) => ({ s: x.s, e: x.e })), ['b', 'a'])), '\\begin{itemize}\\item a\n\\item b % x\n\\end{itemize}');
  const nums = 'x10\n\nx9\n\nx100';
  assert.equal(ap(nums, X.sortEdit(nums, [{ s: 0, e: 3 }, { s: 5, e: 7 }, { s: 9, e: 13 }], ['x10', 'x9', 'x100'], { type: 'number' })), 'x9\n\nx10\n\nx100');
  assert.equal(X.sortEdit(nums, [{ s: 0, e: 3 }], ['x10']), null);
});

ok('multilevel lists: \\setlist lines changed where they are, added once, taken out for LaTeX\'s own', () => {
  const pre = '\\documentclass{article}\n\\usepackage{enumitem}\n\\setlist[enumerate,2]{label=(\\roman*)}\n\\begin{document}\nx\n\\end{document}';
  const r = X.multilevelEdits(pre, 'enum', X.MULTI[0].labels);
  const t = apE(pre, r.edits);
  assert.equal(t, '\\documentclass{article}\n\\usepackage{enumitem}\n\\setlist[enumerate,2]{label=\\alph*.}\n\\setlist[enumerate,1]{label=\\arabic*.}\n\\setlist[enumerate,3]{label=\\roman*.}\n\\setlist[enumerate,4]{label=\\Alph*.}\n\\begin{document}\nx\n\\end{document}');
  assert.deepEqual(X.multilevelOf(X.listSetup(t), 'enum'), X.MULTI[0].labels);
  assert.equal(apE(t, X.multilevelEdits(t, 'enum', null).edits), '\\documentclass{article}\n\\usepackage{enumitem}\n\\begin{document}\nx\n\\end{document}');
  // a \setlist with more than a label keeps the rest
  const more = '\\documentclass{article}\n\\setlist[itemize,1]{label=--,nosep}\n\\begin{document}\n';
  assert.equal(apE(more, X.multilevelEdits(more, 'item', null).edits), '\\documentclass{article}\n\\setlist[itemize,1]{nosep}\n\\begin{document}\n');
  assert.equal(X.multilevelEdits('no preamble', 'enum', null), null);
});

ok('the page draws what TeX prints: start, resume per level, \\setlist, a pandoc list, bullets, \\ref', () => {
  const src = '\\documentclass{article}\n\\usepackage{enumitem}\n\\setlist[enumerate,2]{label=\\arabic{enumi}.\\arabic*.}\n\\begin{document}\n' +
    '\\begin{enumerate}[start=3]\n\\item A\\label{a}\n\\item B\n  \\begin{enumerate}\n  \\item Ba\\label{ba}\n  \\end{enumerate}\n\\end{enumerate}\n' +
    '\\begin{enumerate}[resume]\n\\item C\n\\end{enumerate}\n\\begin{itemize}[label=$\\circ$,nosep]\n\\item c\n\\end{itemize}\n' +
    '\\begin{enumerate}\n\\def\\labelenumi{\\alph{enumi})}\n\\setcounter{enumi}{4}\n\\item E\n\\end{enumerate}\n\\begin{enumerate}[(i)]\\item R\\label{r}\\end{enumerate}\nSee \\ref{a}, \\ref{ba}, \\ref{r}.\n\\end{document}\n';
  const M = buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
  const labels = M.blocks.flatMap((b) => b.items).filter((x) => x.label).map((x) => x.label.map((y) => y.text).join(''));
  assert.deepEqual(labels, ['3.', '4.', '4.1.', '5.', '◦', 'e)', '(i)']);
  const sep = M.blocks.flatMap((b) => b.items).find((x) => x.label && x.label[0].text === '◦');
  assert.equal(sep.liSep, 0);
  const last = M.blocks[M.blocks.length - 1].items[0].inl.map((x) => x.text || '').join('');
  assert.ok(last.includes('3') && last.includes('4.1.') && last.includes('i'), last);
  const first = M.blocks.flatMap((b) => b.items).find((x) => x.listFmt);
  assert.deepEqual(first.listFmt, [3, { t: 'Decimal' }, { t: 'Period' }]);
  // LaTeX's own \ref of a nested item: 1a
  const d2 = '\\documentclass{article}\n\\begin{document}\n\\begin{enumerate}\\item A\\begin{enumerate}\\item B\\label{b}\\end{enumerate}\\end{enumerate}\nRef \\ref{b}.\n\\end{document}\n';
  const M2 = buildModel({ files: new Map([['main.tex', d2]]), main: 'main.tex' });
  assert.ok(M2.blocks[M2.blocks.length - 1].items[0].inl.map((x) => x.text || '').join('').includes('1a'));
});

ok('a file written with CRLF keeps CRLF, and the caret its place', () => {
  const s = '\\begin{itemize}\r\n  \\item One\r\n  \\item Two\r\n\\end{itemize}\r\n';
  const r = X.demote(s, 0, s.length, at(s, 'Two'), at(s, 'Two'));
  const t = ap(s, r);
  assert.equal(t, '\\begin{itemize}\r\n  \\item One\r\n    \\begin{itemize}\r\n      \\item Two\r\n    \\end{itemize}\r\n\\end{itemize}\r\n');
  assert.equal(t.slice(r.a - 1, r.a + 2), 'Two');
  assert.equal(ap(t, X.promote(t, 0, t.length, at(t, 'Two'), at(t, 'Two'))), s);
  const e = '\\begin{enumerate}\r\n  \\item a\r\n\\end{enumerate}';
  assert.equal(apE(e, X.startEdits(e, X.readLists(e)[0], 3, cfg0, 'short').edits), '\\begin{enumerate}\r\n  \\setcounter{enumi}{2}\r\n  \\item a\r\n\\end{enumerate}');
  const u = ap(s, X.unlist(s, 0, s.length, at(s, 'Two'), at(s, 'Two')));
  assert.ok(!/[^\r]\n/.test(u), JSON.stringify(u));
});

ok('an empty item keeps its one space, so what is typed there stays the item\'s', () => {
  const s = '\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n      \\item \n    \\end{itemize}\n\\end{itemize}';
  const [L] = X.readLists(s);
  assert.equal(s.slice(L.items[0].lists[0].items[1].s, L.items[0].lists[0].items[1].e), '\\item ');
  const p = s.indexOf('\\item \n') + 6;
  assert.equal(ap(s, X.promote(s, 0, s.length, p, p)), '\\begin{itemize}\n  \\item One\n    \\begin{itemize}\n      \\item Two\n    \\end{itemize}\n  \\item \n\\end{itemize}');
});

ok('a stranger\'s source: long, unclosed, nested deep, read in bounded time', () => {
  let t0 = Date.now();
  const many = '\\begin{itemize}\n' + '  \\item x\n'.repeat(20000) + '\\end{itemize}';
  const r = X.demote(many, 0, many.length, many.length - 30, many.length - 30);
  assert.ok(r && Date.now() - t0 < 3000, 'demote on 20 000 items ' + (Date.now() - t0) + ' ms');
  t0 = Date.now();
  const pre = '\\documentclass{article}\n' + '\\setlist['.repeat(20000) + '\\renewcommand{'.repeat(20000) + '\n\\begin{document}\n';
  X.listSetup(pre);
  assert.ok(Date.now() - t0 < 2000, 'listSetup ' + (Date.now() - t0) + ' ms');
  t0 = Date.now();
  const deep = '\\begin{itemize}\\item a'.repeat(300) + '\\end{itemize}'.repeat(300);
  X.chainAt(X.readLists(deep), deep.length - 2000);
  assert.ok(Date.now() - t0 < 2000, 'deep ' + (Date.now() - t0) + ' ms');
  t0 = Date.now();
  const opt = '\\begin{enumerate}[' + 'label={'.repeat(5000) + ']\\item a\\end{enumerate}';
  const [L] = X.readLists(opt);
  if (L) X.formatOf(opt, L, cfg0);
  assert.ok(Date.now() - t0 < 2000, 'options ' + (Date.now() - t0) + ' ms');
  // a \theenumi that names itself does not grow without end (TeX loops; the page must not)
  t0 = Date.now();
  const self = X.starOf('\\theenumi.', 1, { 1: '\\theenumi'.repeat(200) });
  assert.ok(self.length <= 2000 && Date.now() - t0 < 500, 'self naming ' + self.length + ' chars, ' + (Date.now() - t0) + ' ms');
  const M = buildModel({ files: new Map([['main.tex', '\\documentclass{article}\n\\renewcommand{\\theenumi}{' + '\\theenumi'.repeat(150) + '}\n\\begin{document}\n\\begin{enumerate}\\item a\\item b\\end{enumerate}\n\\end{document}\n']]), main: 'main.tex' });
  assert.ok(M.blocks.length && Date.now() - t0 < 2000, 'the page with it ' + (Date.now() - t0) + ' ms');
  // a label of 100 000 characters on 2000 items is not copied onto each
  t0 = Date.now();
  const long = '\\documentclass{article}\n\\usepackage{enumitem}\n\\begin{document}\n\\begin{enumerate}[label={' + 'x'.repeat(100000) + '\\arabic*}]\n' + '\\item a\n'.repeat(2000) + '\\end{enumerate}\n\\end{document}\n';
  const M2 = buildModel({ files: new Map([['main.tex', long]]), main: 'main.tex' });
  const lab = M2.blocks.flatMap((b) => b.items).find((x) => x.label);
  assert.ok(lab.label[0].text.length <= 400 && Date.now() - t0 < 3000, 'long label ' + lab.label[0].text.length + ', ' + (Date.now() - t0) + ' ms');
  // a region larger than the bound is not read at all
  assert.deepEqual(X.readLists('x'.repeat(500000)), []);
});

console.log('lists: ' + n + ' groups of checks passed');
