// Batch B3, lists, as Word has them (Home ▸ Paragraph): Bulleted list and Numbered list with their
// libraries (bullets and number formats written as enumitem's label=), Multilevel list (every
// list's levels at once, \setlist in the preamble), Decrease Indent and Increase Indent (in a list
// the item's level: Tab and Shift+Tab), Change List Level, Define New Bullet, Define New Number
// Format, Set Numbering Value, Restart at 1, Continue Numbering, the space between items, Sort,
// the description list, and Word's automatic lists ("- " or "1. " typed at a paragraph's start).
// The edits are src/lists.js's, on strings; here they are committed, one undo each, with the
// package they need written once (App.packageEdits). Hand written forms count as Rikuy's own: a
// pandoc list's \def\labelenumi{\alph{enumi})}, the enumerate package's "(a)", \setcounter{enumi}
// at a list's start, \setlength{\itemsep}{0pt}, \renewcommand{\labelitemi}, are shown and changed
// where they are written.

import { register, onInsertText, onInstall, command, enabled, run as runCmd } from '../commands.js';
import { BLOCKS } from '../render.js';
import { diffEdit } from '../wrap.js';
import { docClass, hasPackage, preambleEnd } from '../preamble.js';
import { openMenu } from '../ui/kit.js';
import { $ } from '../ui/dom.js';
import { readLists, allLists, selectedItems, restartEdit, crlf, formatOf, labelEdits, startEdits, resumeEdits, sepEdits, kindEdits, demote, promote, unlist, listFrom, autoMarker, sortEdit,
  multilevelEdits, multilevelOf, listSetup, mechOf, levelOf, BULLETS, NUMBERS, MULTI, OWN_SYMBOLS, bulletGlyph, numText, sameBullet, sameNumber, DEFAULT, indentAt, MAX_LEVEL } from '../lists.js';
import { openBulletDialog, openNumberDialog, openValueDialog, openMultilevelDialog, openSortDialog, openSpacingDialog } from '../ui/listdialog.js';

const ENVS = { item: 'itemize', enum: 'enumerate', desc: 'description' };
// The list the caret is in (or the paragraphs it covers), worked out once for each look at the ribbon
const listOf = (app, at) => { if (!at) return null; const m = at.memo || (at.memo = {}); if (!('list' in m)) m.list = app.listAt(at); return m.list; };
const inList = (app, at) => { const I = listOf(app, at); return I && I.L ? I : null; };
const can = (env) => (app, at) => { const I = listOf(app, at); return !!I && (!I.L || I.L.editable); };
const isOn = (env) => (app, at) => { const I = inList(app, at); return !!I && I.L.name === env && !I.cont; };
const numbered = (app, at) => { const I = inList(app, at); return I && I.L.kind === 'enum' && I.L.editable ? I : null; };
const why = (app, at) => {
  const I = listOf(app, at);
  if (!at) return 'Put the caret on the page first.';
  if (at.cell) return 'In a table cell: lists there are the table\'s.';
  if (!I) return 'Put the caret in a paragraph or in a list.';
  if (I.L && !I.L.editable) return 'This list is a ' + I.L.name + ' (paralist): its labels are its own.';
  return '';
};
// the icons, 20 by 20, drawn as Word's are
const ICON = {
  bullets: '<path d="M4 6h.01M4 10h.01M4 14h.01M8 6h8.5M8 10h8.5M8 14h8.5"/>',
  numbers: '<path d="M3.4 4.9l1-.6v3.2M3.2 9h1.2c.9 0 .9 1 .2 1.6L3.2 12h1.9M8 6h8.5M8 10h8.5M8 14h8.5"/>',
  multi: '<path d="M3.5 5h.01M6.5 10h.01M9.5 15h.01M6.5 5h10M9.5 10h7M12.5 15h4"/>',
  outdent: '<path d="M8.5 5h8M8.5 10h8M8.5 15h8M3.5 4.5h3M6 8l-2.5 2L6 12"/>',
  indent: '<path d="M8.5 5h8M8.5 10h8M8.5 15h8M3.5 4.5h3M3.5 8L6 10l-2.5 2"/>',
  sort: '<path d="M4 4.5h3.2L4 9.5h3.2M4.2 15.5l1.4-4 1.4 4M4.6 14.3h2M12.5 4v12M10 13.5l2.5 2.5 2.5-2.5"/>'
};

register(
  { id: 'bullets', name: 'Bulleted list', order: 10, title: 'Bulleted list (Ctrl+Shift+L); the arrow: the bullet library, Change List Level, Define New Bullet', synonyms: ['Bullets', 'itemize', 'Bullet library', 'Bullet points'], tab: 'home', group: 'paragraph', el: 'rb-ul', kind: 'split',
    icon: ICON.bullets, keys: ['Ctrl+Shift+L'], menu: { list: 10 },
    when: can('itemize'), whyNot: why, on: isOn('itemize'), run: (app) => app.toggleList('itemize'), menuItems: (app, at) => app.bulletItems(at),
    palette: { k: 'itemize', d: 'Bulleted list', order: 120, t: { open: '\n\n\\begin{itemize}\n  \\item ', close: '\n\\end{itemize}\n\n' }, block: true } },
  { id: 'numbering', name: 'Numbered list', order: 20, title: 'Numbered list; the arrow: the numbering library, Change List Level, Define New Number Format, Set Numbering Value', synonyms: ['Numbering', 'enumerate', 'Numbering library'], tab: 'home', group: 'paragraph', el: 'rb-ol', kind: 'split',
    icon: ICON.numbers, menu: { list: 20 },
    when: can('enumerate'), whyNot: why, on: isOn('enumerate'), run: (app) => app.toggleList('enumerate'), menuItems: (app, at) => app.numberItems(at),
    palette: { k: 'enumerate', d: 'Numbered list', order: 130, t: { open: '\n\n\\begin{enumerate}\n  \\item ', close: '\n\\end{enumerate}\n\n' }, block: true } },
  { id: 'multilevel', name: 'Multilevel list', order: 25, title: 'Multilevel list: the labels of every level of every list (\\setlist), Change List Level, Define New Multilevel List', synonyms: ['Outline numbering', 'List levels', 'setlist'], tab: 'home', group: 'paragraph', el: 'rb-ml', kind: 'menu',
    icon: ICON.multi, when: (app, at) => !!at && app.listMech() !== 'beamer', whyNot: (app, at) => !at ? 'Put the caret on the page first.' : 'Beamer sets every list\'s labels in its theme (\\setbeamertemplate).',
    run: (app) => app.openListMenu('multilevel'), menuItems: (app, at) => app.multiItems(at) },
  { id: 'indent-decrease', name: 'Decrease Indent', order: 30, title: 'Decrease Indent: in a list, the item one level up (Shift+Tab)', synonyms: ['Outdent', 'Promote list item', 'Decrease list level'], tab: 'home', group: 'paragraph', el: 'rb-outdent',
    icon: ICON.outdent, keysElsewhere: ['Shift+Tab'], menu: { list: 25 },
    when: (app, at) => inList(app, at) ? !!app.levelCan(at, -1) : enabled(app, 'paragraph-outdent', at), whyNot: (app, at) => inList(app, at) ? 'The item is at the list\'s first level: Bulleted list or Numbered list makes it a paragraph.' : 'In a list, the item one level up; a paragraph\'s own indent is the Paragraph dialog\'s.',
    run: (app, args, at) => inList(app, at) ? app.listLevel(-1) : runCmd(app, 'paragraph-outdent', args, at) },
  { id: 'indent-increase', name: 'Increase Indent', order: 40, title: 'Increase Indent: in a list, the item one level down, under the item before it (Tab)', synonyms: ['Indent', 'Demote list item', 'Increase list level'], tab: 'home', group: 'paragraph', el: 'rb-indent',
    icon: ICON.indent, keysElsewhere: ['Tab'], menu: { list: 26 },
    when: (app, at) => inList(app, at) ? !!app.levelCan(at, 1) : enabled(app, 'paragraph-indent', at), whyNot: (app, at) => inList(app, at) ? app.levelWhy(at) : 'In a list, the item one level down; a paragraph\'s own indent is the Paragraph dialog\'s.',
    run: (app, args, at) => inList(app, at) ? app.listLevel(1) : runCmd(app, 'paragraph-indent', args, at) },
  { id: 'list-level', name: 'Change List Level', title: 'Change List Level: the item at another level of its list', synonyms: ['List level', 'Outline level of a list item'], menu: { list: 30 },
    when: (app, at) => !!inList(app, at) && (!!app.levelCan(at, 1) || !!app.levelCan(at, -1)), whyNot: () => 'Put the caret in a list item that has an item before it, or in a nested one.',
    run: (app, args) => (args && args.level ? app.listLevelTo(args.level) : app.openListMenu('level')) },
  { id: 'list-restart', name: 'Restart at 1', title: 'Restart at 1: the numbering starts again at this item', synonyms: ['Restart numbering', 'New list'], menu: { list: 40 },
    when: (app, at) => { const I = numbered(app, at); return !!I && (I.k > 0 || !!I.fmt.resume || I.fmt.start !== 1); }, whyNot: () => 'The item is the first of a list that starts at 1.', run: (app) => app.listRestart() },
  { id: 'list-continue', name: 'Continue Numbering', title: 'Continue Numbering: the list goes on from the numbered list before it (enumitem\'s resume)', synonyms: ['Resume numbering', 'Continue list'], menu: { list: 41 },
    when: (app, at) => { const I = numbered(app, at); return !!I && !I.fmt.resume && app.listBefore(I) && !['short', 'beamer', 'paralist'].includes(app.listMech()); }, whyNot: () => 'Put the caret in a numbered list that has one before it.', on: (app, at) => { const I = numbered(app, at); return I ? !!I.fmt.resume : null; }, run: (app) => app.listResume(true) },
  { id: 'list-value', name: 'Set Numbering Value', title: 'Set Numbering Value: the number this list starts at, or continue the one before', synonyms: ['Start at', 'Starting number', 'Numbering value'], menu: { list: 42 },
    when: (app, at) => !!numbered(app, at), whyNot: () => 'Put the caret in a numbered list.', run: (app, args) => (args && args.value != null ? app.listStart(+args.value) : openValueDialog(app)) },
  { id: 'list-spacing', name: 'List spacing', title: 'The space between the list\'s items: LaTeX\'s own, none between them, none at all, or your own', synonyms: ['Space between items', 'Compact list', 'nosep', 'itemsep'], menu: { list: 50 },
    when: (app, at) => !!inList(app, at) && inList(app, at).L.editable && app.listMech() !== 'beamer', whyNot: () => 'Put the caret in a list.',
    run: (app, args) => (args && 'sep' in args ? app.listSpacing(args.sep) : app.openListMenu('spacing')) },
  { id: 'bullet-define', name: 'Define New Bullet', title: 'Define New Bullet: any symbol, character or LaTeX as the list\'s bullet', synonyms: ['Custom bullet', 'Bullet symbol'],
    when: (app, at) => { const I = listOf(app, at); return !!I && (!I.L || I.L.kind !== 'desc') && app.listMech() !== 'beamer'; }, whyNot: (app, at) => app.listMech() === 'beamer' ? 'Beamer sets bullets in its theme.' : why(app, at), run: (app, args) => (args && args.code != null ? app.listLabel('itemize', args.code) : openBulletDialog(app)) },
  { id: 'number-define', name: 'Define New Number Format', title: 'Define New Number Format: the number style, the text around it and where it starts', synonyms: ['Custom numbering', 'Number format'],
    when: (app, at) => { const I = listOf(app, at); return !!I && (!I.L || I.L.kind !== 'desc'); }, whyNot: why, run: (app, args) => (args && args.label != null ? app.listLabel('enumerate', args.label) : openNumberDialog(app)) },
  { id: 'multilevel-define', name: 'Define New Multilevel List', title: 'Define New Multilevel List: the label of each level of every numbered or bulleted list', synonyms: ['Custom multilevel list'],
    when: (app, at) => !!at && app.listMech() !== 'beamer', whyNot: () => 'Beamer sets every list\'s labels in its theme.', run: (app, args) => (args && args.kind ? app.listMultilevel(args.kind, args.labels || null) : openMultilevelDialog(app)) },
  { id: 'description-list', name: 'Description list', title: 'Description list: each item a term in bold and its description', synonyms: ['Definition list', 'Glossary list', 'description'], kind: 'toggle', menu: { list: 15 },
    when: can('description'), whyNot: why, on: isOn('description'), run: (app) => app.toggleList('description'),
    palette: { k: 'description', d: 'Description list', order: 135, t: { open: '\n\n\\begin{description}\n  \\item[', close: '] \n\\end{description}\n\n' }, block: true } },
  { id: 'sort', name: 'Sort', order: 50, title: 'Sort: the list\'s items, or the selected paragraphs, by their text, a number or a date', synonyms: ['Sort Text', 'Sort list', 'Sort paragraphs', 'Alphabetize'], tab: 'home', group: 'paragraph', el: 'rb-sort',
    icon: ICON.sort, menu: { list: 60 }, when: (app, at) => !!app.sortTarget(at), whyNot: () => 'Put the caret in a list, or select two paragraphs or more.', run: (app, args) => (args && args.order ? app.listSort(args) : openSortDialog(app)) }
);

// Word's automatic lists: "- " or "1. " typed at a paragraph's start (A3; Options can switch it off:
// app.prefs.autoLists === false)
onInsertText((app, text, range) => {
  if (text !== ' ' || range || (app.prefs && app.prefs.autoLists === false)) return;
  const c = app.caretNow();
  if (!c || c.ghost || !c.collapsed) return;
  const at = app.ribbonAt();
  if (!at || at.cell || !at.it || at.it.dataset.li || !at.B || at.B.f !== c.f) return;
  const pp = app.plainPara(at.B, at.it);
  if (!pp || c.a <= pp.s || c.a - pp.s > 6) return;
  const M = autoMarker(app.src(c.f).slice(pp.s, c.a));
  if (!M) return;
  return app.autoList(at, pp, M) ? true : undefined;
});

// Tab and Shift+Tab in a list item change its level (not in a table cell: those keys are the
// table's); Enter in an empty nested item takes it a level up, as Word does
onInstall((app) => {
  app.root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || app.composing || e.defaultPrevented) return;
    if (e.key !== 'Tab' && !(e.key === 'Enter' && !e.shiftKey)) return;
    const at = app.ribbonAt();
    if (!at || at.cell || !at.it || !at.it.dataset.li) return;
    const I = app.listAt(at);
    if (!I || !I.L) return;
    if (e.key === 'Enter') {
      const it = I.L.items[I.k];
      if (!at.c.collapsed || I.chain.length < 2 || !I.L.editable || /\S/.test(I.src.slice(it.cmdE, it.e)) || it.lab || it.lists.length) return;
      e.preventDefault(); e.stopImmediatePropagation();
      app.listLevel(-1);
      return;
    }
    // (at the first level Shift+Tab leaves the page, as everywhere: the keyboard's way out)
    if (e.shiftKey && I.chain.length < 2) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!app.listLevel(e.shiftKey ? -1 : 1)) app.toast(e.shiftKey ? 'This item cannot go a level up here.' : app.levelWhy(at));
  }, true);
  // the libraries' tiles: the arrow keys move in two directions
  document.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    if (!a || !a.classList || !a.classList.contains('li-tile') || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
    const menu = a.parentElement, tiles = [...menu.children].filter((x) => x.classList.contains('li-tile') && x.getAttribute('aria-disabled') !== 'true');
    const cols = +((/\bli-c(\d)\b/.exec(a.className) || [, 3])[1]), i = tiles.indexOf(a);
    let j = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' ? i - cols : i + cols;
    e.preventDefault(); e.stopImmediatePropagation();
    if (j >= 0 && j < tiles.length) { tiles[j].focus(); return; }
    // below the last row: the menu's first item after the tiles
    if (e.key === 'ArrowDown') { const next = [...menu.querySelectorAll('[role^=menuitem]')].find((x) => !x.classList.contains('li-tile') && x.getAttribute('aria-disabled') !== 'true'); if (next) next.focus(); }
  }, true);
});

const tile = (name, html, checked, run, cols, title) => ({ name, label: '', html, title: title || name, checked: !!checked, radio: true, cls: 'li-tile li-c' + cols, run });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const methods = {
  // ---- where the caret is ---------------------------------------------------------------------
  // The list the caret is in: { f, B, src, lists, chain, L (the innermost list), k, m (the items the
  // selection covers), fmt (src/lists.js formatOf), cont (a paragraph of the item after its first),
  // labelled }; or the plain paragraphs the selection covers: { L: null, f, paras }; or null.
  listAt(at) {
    const { c, it, B } = at;
    if (!c || c.ghost || !it || !B || at.cell) return null;
    const src = this.src(B.f);
    if (it.dataset.li) {
      const lists = readLists(src, B.s, B.e, this.model && this.model.userSigs);
      const a = c.f === B.f ? c.a : B.s, b = c.f === B.f ? Math.max(c.a, c.b) : a;
      const sel = selectedItems(lists, a, b);
      if (!sel) return null;
      const item = sel.L.items[sel.k];
      return { f: B.f, B, src, lists, ...sel, a, b, fmt: formatOf(src, sel.L, this.listCfg()), cont: /,1$/.test(it.dataset.li), labelled: !!item.lab };
    }
    // every block from the one the selection starts in to the one it ends in
    const r = getSelection().getRangeAt(0);
    const of = (n) => { const el = n.nodeType === 1 ? n : n.parentElement, i = el && el.closest('.it'); return i ? { it: i, B: BLOCKS.get(+i.dataset.b) } : null; };
    const A = of(r.startContainer), Z = of(r.endContainer);
    if (!A || !Z || !A.B || !Z.B || A.B.f !== Z.B.f) return null;
    const paras = [];
    for (const X of this.renderer.blocks) {
      if (X.f !== A.B.f || X.s < A.B.s || X.e > Z.B.e) continue;
      const item = X.items[0], p = item && this.plainPara(X, item.el);
      if (!p) return null;
      paras.push(p);
    }
    return paras.length ? { L: null, f: A.B.f, paras: paras.sort((x, y) => x.s - y.s) } : null;
  },
  // what the preamble says of lists (the model reads it once a build)
  listCfg() {
    const M = this.model;
    if (M && M.listCfg) return M.listCfg;
    const src = this.src(this.main), end = M && M.docBody ? M.docBody.at : preambleEnd(src);
    const cfg = listSetup(src, end);
    if (M) M.listCfg = cfg;
    return cfg;
  },
  // how this document writes a list's label (src/lists.js mechOf)
  listMech() {
    // (asked at every move of the caret: read once for each build of the page)
    const M = this.model;
    if (M && M.listMech) return M.listMech;
    const src = this.src(this.main), d = docClass(src), others = this.preambleOthers();
    const v = mechOf({ cls: d ? d.name : 'article', has: (p) => hasPackage(src, p, undefined, others) });
    if (M) M.listMech = v;
    return v;
  },
  // the packages a label needs that the document has not (amssymb's symbols where no package
  // gives them already: newtxmath and unicode-math clash with it)
  listPkgs(pkgs) {
    const src = this.src(this.main), others = this.preambleOthers(), out = [];
    for (const p of new Set(pkgs)) {
      if (p === 'amssymb' && OWN_SYMBOLS.some((q) => hasPackage(src, q, undefined, others))) continue;
      if (p === 'enumitem' && ['beamer'].includes(this.listMech())) continue;
      out.push(p);
    }
    return out;
  },
  // One change to the list: edits in its file, the packages they need, the caret where it was or
  // where the change says; one commit, one undo
  listCommit(f, edits, pkgs, caret) {
    const want = this.listPkgs(pkgs || []);
    const all = edits.map((x) => ({ f, ...x }));
    const pe = want.length ? this.packageEdits(want) : [];
    // (the preamble's edits come before the list: the caret moves by what they add)
    let shift = 0;
    const first = Math.min(...edits.map((x) => x.s), Infinity);
    for (const x of pe) if (x.f === f && x.s <= first) shift += x.t.length - (x.e - x.s);
    if (caret && caret.f === f) { if (caret.p != null) caret = { ...caret, p: caret.p + shift }; if (caret.selA != null) caret = { ...caret, selA: caret.selA + shift, selB: caret.selB + shift }; }
    this.closeGroup();
    this.commit([...all, ...pe], caret, 'list');
    this.closeGroup();
    return true;
  },
  // the caret after a change: where it was in the old text, carried over the edits before it
  listCaret(f, edits, p, q) {
    const map = (x) => { let d = 0; for (const e of edits) if (e.e <= x) d += e.t.length - (e.e - e.s); return x + d; };
    return q != null && q !== p ? { f, selA: map(p), selB: map(q) } : { f, p: map(p), bias: -1 };
  },

  // ---- Bulleted list, Numbered list, Description list --------------------------------------------
  // Paragraphs become the items of a new list (with a label of the library's: opts.label); in a list
  // of another kind the list changes its kind; in a list of this kind the selected items become
  // paragraphs again, those before and after them staying lists of their own (and in a nested
  // list, paragraphs of the item above). A label of an item's own stays as its first words.
  toggleList(env, opts = {}) {
    const at = this.ribbonAt(), I = at && this.listAt(at);
    if (!I) return false;
    const c = at.c;
    if (!I.L) {
      const src = this.src(I.f), mech = this.listMech();
      let open = '', pkgs = [];
      if (opts.label != null) {
        const fake = { name: env, kind: env === 'enumerate' ? 'enum' : 'item', s: 0, be: 0, es: 0, setupE: 0, opt: null, parent: null, items: [] };
        // ([label=...], or a \renewcommand line where the document labels lists without enumitem)
        const r = labelEdits('', fake, opts.label, this.listCfg(), mech);
        if (r && r.edits.length) { open = r.edits[0].t; pkgs = r.pkgs; }
      }
      const { edits, p } = listFrom(src, I.paras, env, open, c.a);
      return this.listCommit(I.f, edits.reverse(), [...pkgs, ...(opts.pkgs || [])], { f: I.f, p, bias: -1 });
    }
    const { L, src } = I;
    if (!L.editable) return false;
    if (L.name !== env) {
      const edits = kindEdits(src, L, env);
      if (!edits) return false;
      let pkgs = [];
      if (opts.label != null) {
        // the new kind's label too, in the same step (the list starts where it did)
        const after = applyAll(src, edits), L2 = allLists(readLists(after, I.B.s, I.B.e + after.length - src.length, this.model && this.model.userSigs)).find((x) => x.s === L.s);
        const r = L2 && labelEdits(after, L2, opts.label, this.listCfg(), this.listMech());
        if (r) { const d = diffEdit(src, applyAll(after, r.edits)); pkgs = [...r.pkgs, ...(opts.pkgs || [])]; return this.listCommit(I.f, d ? [d] : [], pkgs, this.listCaret(I.f, d ? [d] : [], c.a, c.b)); }
      }
      return this.listCommit(I.f, edits, pkgs, this.listCaret(I.f, edits, c.a, c.b));
    }
    const r = unlist(src, I.B.s, I.B.e, I.a, I.b, this.model && this.model.userSigs);
    if (!r) return false;
    return this.listCommit(I.f, [{ s: r.s, e: r.e, t: r.t }], [], { f: I.f, p: r.a ?? r.s, bias: -1 });
  },

  // ---- levels --------------------------------------------------------------------------------------
  // whether the caret's items can go a level down (1) or up (-1): the change, or null
  levelCan(at, d) {
    const I = inList(this, at);
    if (!I || !I.L.editable) return null;
    const m = at.memo || (at.memo = {}), key = 'lvl' + d;
    if (!(key in m)) m[key] = (d > 0 ? demote : promote)(I.src, I.B.s, I.B.e, I.a, I.b, this.model && this.model.userSigs);
    const r = m[key];
    return r && !r.refused ? r : null;
  },
  levelWhy(at) {
    const I = inList(this, at);
    if (!I) return 'Put the caret in a list item.';
    if (I.k === 0) return 'The first item of a list has no item before it to go under.';
    const r = (at.memo && at.memo.lvl1) || demote(I.src, I.B.s, I.B.e, I.a, I.b, this.model && this.model.userSigs);
    if (r && r.refused) return 'LaTeX nests lists ' + MAX_LEVEL + ' deep.';
    return 'This item cannot go a level down here.';
  },
  // Tab and Shift+Tab, Increase and Decrease Indent: the selected items one level down or up
  listLevel(d) {
    const at = this.ribbonAt(), I = at && inList(this, at);
    if (!I) return false;
    const r = (d > 0 ? demote : promote)(I.src, I.B.s, I.B.e, I.a, I.b, this.model && this.model.userSigs);
    if (!r || r.refused) return false;
    const collapsed = at.c.collapsed;
    return this.listCommit(I.f, [{ s: r.s, e: r.e, t: r.t }], [], collapsed || r.b == null ? { f: I.f, p: r.a ?? r.s, bias: -1 } : { f: I.f, selA: r.a, selB: r.b });
  },
  // Change List Level: to level n of its kind, in steps, as one change
  listLevelTo(n) {
    const at = this.ribbonAt(), I = at && inList(this, at);
    if (!I) return false;
    const now = levelOf(I.L).level, d = n > now ? 1 : -1, sigs = this.model && this.model.userSigs;
    let src = I.src, re = I.B.e, a = I.a, b = I.b;
    for (let i = 0; i < Math.abs(n - now); i++) {
      const r = (d > 0 ? demote : promote)(src, I.B.s, re, a, b, sigs);
      if (!r || r.refused) break;
      src = src.slice(0, r.s) + r.t + src.slice(r.e);
      re += r.t.length - (r.e - r.s);
      a = r.a ?? a; b = r.b ?? a;
    }
    const e = diffEdit(I.src, src);
    if (!e) return false;
    return this.listCommit(I.f, [e], [], { f: I.f, p: a, bias: -1 });
  },

  // ---- labels and numbers -----------------------------------------------------------------------------
  // A bullet or a number format of the library (code: LaTeX's for bullets, enumitem's for numbers;
  // null for the level's own): on paragraphs a new list with it, on a list of the other kind the
  // list changed to this kind with it, on a list of this kind its label
  listLabel(env, code) {
    const at = this.ribbonAt(), I = at && this.listAt(at);
    if (!I) return false;
    const pk = env === 'itemize' ? (BULLETS.concat([]).find((x) => x.code === code) || {}).pkg : null;
    const pkgs = pk ? [pk] : env === 'itemize' && /\\(checkmark|blacksquare|blacktriangleright|square|blacklozenge|lozenge|bigstar)\b/.test(code || '') ? ['amssymb'] : [];
    if (!I.L || I.L.name !== env) return this.toggleList(env, { label: code, pkgs });
    const r = labelEdits(I.src, I.L, code, this.listCfg(), this.listMech());
    if (!r) { this.toast('This list\'s label is written in a way Rikuy cannot change here; the source can.'); return false; }
    if (!r.edits.length) return true;
    return this.listCommit(I.f, r.edits, [...r.pkgs, ...(code != null ? pkgs : [])], this.listCaret(I.f, r.edits, at.c.a, at.c.b));
  },
  // the number the list starts at
  listStart(n) {
    const at = this.ribbonAt(), I = at && numbered(this, at);
    if (!I) return false;
    const r = startEdits(I.src, I.L, n, this.listCfg(), this.listMech());
    if (!r) return false;
    if (!r.edits.length) return true;
    return this.listCommit(I.f, r.edits, r.pkgs, this.listCaret(I.f, r.edits, at.c.a, at.c.b));
  },
  listResume(on) {
    const at = this.ribbonAt(), I = at && numbered(this, at);
    if (!I) return false;
    const r = resumeEdits(I.src, I.L, on, this.listCfg());
    if (!r || !r.edits.length) return false;
    return this.listCommit(I.f, r.edits, r.pkgs, this.listCaret(I.f, r.edits, at.c.a, at.c.b));
  },
  // whether a numbered list stands before this one in its file (Continue Numbering has one to go on from)
  listBefore(I) { const t = I.src.slice(Math.max(0, I.L.s - 200000), I.L.s); return /\\begin\s*\{enumerate\}/.test(t); },
  // Restart at 1: the first item's list starts at 1 again (no start, no continuation); an item
  // further down starts a list of its own there, with the list's options
  listRestart() {
    const at = this.ribbonAt(), I = at && numbered(this, at);
    if (!I) return false;
    if (I.k === 0) {
      const r = startEdits(I.src, I.L, 1, this.listCfg(), this.listMech());
      return r && r.edits.length ? this.listCommit(I.f, r.edits, r.pkgs, this.listCaret(I.f, r.edits, at.c.a, at.c.b)) : false;
    }
    const e = restartEdit(I.src, I.L, I.k);
    if (!e) return false;
    return this.listCommit(I.f, [e], [], this.listCaret(I.f, [e], at.c.a, at.c.b));
  },
  // the space between the list's items: 'nosep', 'noitemsep', a length, null (LaTeX's own)
  listSpacing(sep) {
    const at = this.ribbonAt(), I = at && inList(this, at);
    if (!I || !I.L.editable) return false;
    const r = sepEdits(I.src, I.L, sep, this.listCfg());
    if (!r || !r.edits.length) return false;
    return this.listCommit(I.f, r.edits, r.pkgs, this.listCaret(I.f, r.edits, at.c.a, at.c.b));
  },
  // Multilevel list: the labels of levels 1 to 4 of every list of a kind (null: LaTeX's own); the
  // caret's list, and the lists in it, become that kind
  listMultilevel(kind, labels) {
    const src = this.src(this.main), end = this.model && this.model.docBody ? this.model.docBody.at : preambleEnd(src);
    const r = multilevelEdits(src, kind, labels, end);
    if (!r) { this.toast('The document has no preamble to write the levels in.'); return false; }
    const at = this.ribbonAt(), I = at && this.listAt(at), env = ENVS[kind];
    const pre = r.edits.map((x) => ({ f: this.main, ...x }));
    const body = [];
    let caret = null;
    if (I && I.L) {
      // the caret's whole list, every level of it, of this kind; their own labels give way to the levels'
      const all = [];
      const walk = (L) => { all.push(L); for (const it of L.items) for (const C of it.lists) if (C.direct) walk(C); };
      walk(I.chain[0].L);
      for (const L of all) {
        if (!L.editable || L.kind === 'desc') continue;
        if (L.kind !== kind) { const e = kindEdits(I.src, L, env); if (e) body.push(...e); }
        else if (labels && L.opt && (optHas(I.src, L, 'label') || optHas(I.src, L, 'label*'))) { const o = labelEdits(I.src, L, null, { ...this.listCfg(), setlist: [] }, 'enumitem'); if (o) body.push(...o.edits); }
      }
      caret = { f: I.f, a: at.c.a, b: at.c.b };
    } else if (I && I.paras && labels) {
      const { edits, p } = listFrom(this.src(I.f), I.paras, env, '', at.c.a);
      body.push(...edits);
      caret = { f: I.f, a: p, b: p, after: true };
    } else if (at && at.c && !at.c.ghost) caret = { f: at.c.f, a: at.c.a, b: at.c.b };
    const f = I ? I.f : null;
    const pe = r.pkgs.length ? this.packageEdits(this.listPkgs([...r.pkgs, ...((labels || []).some((x) => /blacksquare|checkmark|blacktriangle/.test(x)) ? ['amssymb'] : [])])) : [];
    // (the \setlist lines before the package's line in the array: where both go at the preamble's
    // end, the one applied first ends up last, and \setlist must come after \usepackage{enumitem})
    const all = [...pre, ...body.map((x) => ({ f, ...x })), ...pe];
    if (!all.length) return true;
    if (caret) {
      const same = all.filter((x) => x.f === caret.f && (!caret.after || x.f !== f || pre.includes(x) || pe.includes(x)));
      caret = this.listCaret(caret.f, same, caret.a, caret.b);
    }
    this.closeGroup();
    this.commit(all, caret, 'list');
    this.closeGroup();
    return true;
  },

  // ---- automatic lists ---------------------------------------------------------------------------------
  // The space after "- " or "1. " at a paragraph's start: first the space as typed (its own step),
  // then the paragraph made a list (a step of its own, so Undo gives the typed text back), joined to
  // the list right before it where that one goes on the same way
  autoList(at, pp, M) {
    const f = at.B.f, c = at.c, B = at.B;
    this.commit([{ f, s: c.a, e: c.a, t: ' ' }], { f, p: c.a + 1, bias: -1 }, 'type');
    this.closeGroup();
    const src = this.src(f), s = pp.s, e = pp.e + 1;
    let rs = c.a + 1;
    while (rs < e && (src[rs] === ' ' || src[rs] === '\t')) rs++;
    const rest = src.slice(rs, e), guard = rest[0] === '[' ? '{}' : '';
    const cfg = this.listCfg(), mech = this.listMech();
    // the list just before, if this item goes on with it
    const bs = this.renderer.blocks, i = bs.findIndex((x) => x.f === f && x.s === B.s);
    const P = i > 0 ? bs[i - 1] : null;
    if (P && P.f === f && /^\s*$/.test(src.slice(P.e, s))) {
      const L = readLists(src, P.s, P.e, this.model && this.model.userSigs).find((x) => x.s === P.s && x.e === P.e && x.editable && x.closed && x.name === M.name);
      if (L && L.items.length) {
        const F = formatOf(src, L, cfg);
        const goesOn = M.name === 'itemize' || (sameNumber(F.label, M.star) && F.start + L.items.length === M.start && !F.resume);
        if (goesOn) {
          const last = L.items[L.items.length - 1], ind = indentAt(src, last.s) ?? '  ';
          const lead = crlf(src, '\n' + ind + '\\item ' + guard), t = lead + rest + src.slice(last.e, L.e);
          this.commit([{ f, s: last.e, e, t }], { f, p: last.e + lead.length, bias: -1 }, 'autoformat');
          this.closeGroup();
          this.autoToast();
          return true;
        }
      }
    }
    let open = '', pkgs = [];
    if (M.name === 'enumerate') {
      const fake = { name: 'enumerate', kind: 'enum', s: 0, be: 0, es: 0, setupE: 0, opt: null, parent: null, items: [] };
      const lab = labelEdits('', fake, M.star, cfg, mech);
      if (lab && lab.edits.length) { open = lab.edits[0].t; pkgs.push(...lab.pkgs); }
      if (M.start !== 1) {
        const st = startEdits('', fake, M.start, cfg, mech);
        if (st && st.edits.length) {
          const t = st.edits[0].t;
          if (t.startsWith('[') && open.startsWith('[')) open = open.slice(0, -1) + ',' + t.slice(1);
          else open += t;
          pkgs.push(...st.pkgs);
        }
      }
    }
    // (a label written in the list's set up starts on a line of its own: the edit gave its line break)
    const head = crlf(src, '\\begin{' + M.name + '}' + open + '\n  \\item ' + guard);
    const t = head + rest + crlf(src, '\n\\end{' + M.name + '}');
    this.listCommit(f, [{ s, e, t }], pkgs, { f, p: s + head.length, bias: -1 });
    this.autoToast();
    return true;
  },
  autoToast() {
    this.toast('Automatic list. Undo gives back what you typed.', 4500, { label: 'Stop automatic lists', fn: () => { this.prefs.autoLists = false; this.savePrefs(); this.toast('Automatic lists are off; Options can turn them on again.'); } });
  },

  // ---- sorting -------------------------------------------------------------------------------------------
  // What Sort acts on: the selected items of a list (all of them with only a caret in it), or the
  // selected paragraphs: { kind: 'items' | 'paragraphs', f, B, pieces: [{ s, e }] } or null. (Their
  // words, the keys, are read only when Sort runs: this is asked at every move of the caret.)
  sortTarget(at) {
    if (!at) return null;
    const m = at.memo || (at.memo = {});
    if ('sort' in m) return m.sort;
    m.sort = null;
    const I = listOf(this, at);
    if (I && I.L && I.L.editable) {
      const L = I.L, all = at.c.collapsed || I.k === I.m;
      const k = all ? 0 : I.k, n = all ? L.items.length - 1 : I.m;
      if (n - k < 1) return null;
      m.sort = { kind: 'items', f: I.f, B: I.B, src: I.src, items: L.items.slice(k, n + 1), pieces: L.items.slice(k, n + 1).map((it) => ({ s: it.s, e: it.e })) };
    } else if (I && I.paras && I.paras.length > 1) {
      m.sort = { kind: 'paragraphs', f: I.f, pieces: I.paras.map((p) => ({ s: p.s, e: p.e })) };
    }
    return m.sort;
  },
  // the words of what Sort sorts, as the page shows them: an item's first paragraph without its
  // label, a paragraph's text (one walk over the page's items, not one per piece)
  sortKeys(T) {
    const src = this.src(T.f);
    if (T.kind === 'items') {
      const byStart = new Map();
      for (const x of T.B.items) {
        const el = x.el;
        if (!el || !el.dataset.li) continue;
        const v = el.dataset.li.split(',');
        if (v[6] === '1') continue;
        let t = '';
        for (const n of el.childNodes) if (!(n.classList && (n.classList.contains('lbl') || n.classList.contains('dlbl')))) t += n.textContent;
        byStart.set(+v[0] + T.B.base, t.replace(/​/g, '').trim());
      }
      return T.items.map((it) => byStart.get(it.s) ?? src.slice(it.cmdE, it.e).replace(/\\[A-Za-z]+\*?|[{}$]/g, '').trim());
    }
    const blocks = this.renderer.blocks.filter((x) => x.f === T.f);
    let j = 0;
    return T.pieces.map((p) => {
      while (j < blocks.length && blocks[j].e < p.e) j++;
      const B = blocks[j];
      return B && B.s <= p.s && B.items[0] ? B.items[0].el.textContent : src.slice(p.s, p.e);
    });
  },
  // Sort: o { type 'text' | 'number' | 'date', order 'ascending' | 'descending', caseSensitive }
  listSort(o) {
    const at = this.ribbonAt(), T = at && this.sortTarget(at);
    if (!T) return false;
    const src = this.src(T.f);
    const r = sortEdit(src, T.pieces, this.sortKeys(T), { type: o.type || 'text', descending: o.order === 'descending', caseSensitive: !!o.caseSensitive, lang: this.model && this.model.opts.lang });
    if (!r) { this.toast('Already in that order.'); return true; }
    const d = diffEdit(src.slice(r.s, r.e), r.t);
    const e = d ? { s: r.s + d.s, e: r.s + d.e, t: d.t } : null;
    if (!e) return true;
    return this.listCommit(T.f, [e], [], { f: T.f, p: T.pieces[0].s, bias: 1 });
  },

  // ---- the menus ----------------------------------------------------------------------------------------
  // Bulleted list's arrow: the bullet library (the list's own bullet checked), then the commands
  bulletItems(at) {
    const I = listOf(this, at), cur = I && I.L && I.L.kind === 'item' ? I.fmt.label : null, beamer = this.listMech() === 'beamer';
    const items = [{ ...tile('None', '<span class="li-g li-none">None</span>', false, () => this.listNone('itemize'), 5, 'No bullet: the items become paragraphs'), disabled: !(I && I.L) }];
    for (const b of BULLETS) items.push({ ...tile(b.name, '<span class="li-g">' + esc(b.glyph) + '</span>', cur != null && sameBullet(cur, b.code), () => this.listLabel('itemize', b.code), 5, b.name + ': ' + b.code), disabled: beamer });
    return [...items, null, ...this.cmdItems(['list-level', 'bullet-define', 'list-spacing'])];
  },
  numberItems(at) {
    const I = listOf(this, at), cur = I && I.L && I.L.kind === 'enum' ? I.fmt.label : null;
    const items = [{ ...tile('None', '<span class="li-g li-none">None</span>', false, () => this.listNone('enumerate'), 3, 'No numbering: the items become paragraphs'), disabled: !(I && I.L) }];
    for (const n of NUMBERS) items.push(tile(n.name, '<span class="li-n">' + n.show.map((x) => '<span>' + esc(x) + '<i></i></span>').join('') + '</span>', cur != null && sameNumber(cur, n.star), () => this.listLabel('enumerate', n.star), 3, n.name + ': label=' + n.star));
    return [...items, null, ...this.cmdItems(['list-level', 'number-define', 'list-value', 'list-restart', 'list-continue', 'list-spacing'])];
  },
  multiItems(at) {
    const cfg = this.listCfg(), have = { enum: multilevelOf(cfg, 'enum'), item: multilevelOf(cfg, 'item') };
    const items = MULTI.map((p) => {
      const now = have[p.kind], on = p.labels ? p.labels.every((x, i) => now[i] != null && (p.kind === 'enum' ? sameNumber(now[i], x) : sameBullet(now[i], x))) : now.every((x) => x == null);
      const lines = [0, 1, 2].map((i) => {
        const code = p.labels ? p.labels[i] : DEFAULT[p.kind][i];
        const t = p.kind === 'enum' ? numText(code, 1, [1, 1, 1]) : (bulletGlyph(code) || '•');
        return '<span style="--l:' + i + '">' + esc(t) + '<i></i></span>';
      }).join('');
      return tile(p.name, '<span class="li-m">' + lines + '</span>', on, () => this.listMultilevel(p.kind, p.labels), 4, p.name + (p.labels ? ': \\setlist for each level' : ': no \\setlist of Rikuy\'s'));
    });
    return [...items, null, ...this.cmdItems(['list-level', 'multilevel-define', 'description-list'])];
  },
  // None in a library: the list's items made paragraphs, as the button does on its own kind
  listNone(env) {
    const at = this.ribbonAt(), I = at && inList(this, at);
    if (!I) return false;
    return this.toggleList(I.L.name === env ? env : I.L.name);
  },
  // commands of the registry as menu items (disabled where they cannot run)
  cmdItems(ids) {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    return ids.map((id) => {
      const c = command(id);
      if (!c) return null;
      const on = c.on ? c.on(this, at) : null;
      return { name: c.name + (/define|value/.test(id) ? '…' : ''), title: c.title, checked: id === 'description-list' && on != null ? on : undefined, disabled: !enabled(this, c, at), run: () => { this.ribbonBack(); this.runCommand(id); } };
    });
  },
  // the menu of Multilevel list, Change List Level or List spacing, at its button (or the group's,
  // folded, or the caret)
  openListMenu(which) {
    const at = this.ribbonAt();
    if (at) at.memo = {};
    const anchor = ['#rb-ml', '#rb-ul-x', '#rb-ol-x', '#rg-home-paragraph'].map((s) => $(s)).find((x) => x && x.offsetParent) || null;
    const s = getSelection();
    const rect = s.rangeCount && this.root.contains(s.anchorNode) ? s.getRangeAt(0).getBoundingClientRect() : this.root.getBoundingClientRect();
    const where = which === 'multilevel' ? ($('#rb-ml') && $('#rb-ml').offsetParent ? $('#rb-ml') : anchor) : new DOMRect(rect.left, rect.bottom, 0, 0);
    if (which === 'multilevel') return openMenu(this, where || rect, this.multiItems(at), { label: 'Multilevel list' });
    if (which === 'level') {
      const I = inList(this, at);
      if (!I) return null;
      const lv = levelOf(I.L), kind = I.L.kind, cfg = this.listCfg();
      const items = [];
      for (let n = 1; n <= MAX_LEVEL; n++) {
        const reach = n === lv.level || (n < lv.level ? I.chain.length - (lv.level - n) >= 1 && !!this.levelCan(at, -1) : !!this.levelCan(at, 1));
        const code = multilevelOf(cfg, kind)[n - 1] || (DEFAULT[kind] || [])[n - 1] || '';
        const show = kind === 'enum' ? numText(code, 1, [1, 1, 1]) : kind === 'item' ? (bulletGlyph(code) || '•') : '';
        items.push({ name: 'Level ' + n, label: 'Level ' + n + (show ? '   ' + show : ''), checked: n === lv.level, radio: true, disabled: !reach, run: () => { this.ribbonBack(); this.listLevelTo(n); } });
      }
      return openMenu(this, where, items, { label: 'Change List Level' });
    }
    if (which === 'spacing') {
      const I = inList(this, at);
      if (!I) return null;
      const sep = I.fmt.sepFrom === 'opt' ? I.fmt.sep : I.fmt.sep && I.fmt.sepFrom === 'def' ? 'def' : null;
      const items = [
        { name: 'LaTeX\'s spacing', title: 'The space LaTeX puts between items', checked: !sep, radio: true, run: () => { this.ribbonBack(); this.listSpacing(null); } },
        { name: 'No space between items', title: 'enumitem\'s noitemsep', checked: sep === 'noitemsep', radio: true, run: () => { this.ribbonBack(); this.listSpacing('noitemsep'); } },
        { name: 'Compact', title: 'No space between items, nor around the list: enumitem\'s nosep', checked: sep === 'nosep', radio: true, run: () => { this.ribbonBack(); this.listSpacing('nosep'); } },
        null,
        { name: 'Custom spacing…', title: 'A space of your own between items: enumitem\'s itemsep', checked: !!sep && !['nosep', 'noitemsep'].includes(sep), radio: true, run: () => openSpacingDialog(this) }
      ];
      return openMenu(this, where, items, { label: 'List spacing' });
    }
    return null;
  }
};

const optHas = (src, L, key) => !!L.opt && new RegExp('(^|[,\\s\\[])' + key.replace('*', '\\*') + '\\s*=').test(src.slice(L.opt.s, L.opt.e));
const applyAll = (t, edits) => { for (const x of [...edits].sort((a, b) => b.s - a.s)) t = t.slice(0, x.s) + x.t + t.slice(x.e); return t; };
