// Word's Styles pane (Ctrl+Alt+Shift+S), Apply Styles (Ctrl+Shift+S), Modify Style, Create a Style
// and Update to Match Selection, over LaTeX: a heading's look is titlesec's \titleformat and
// \titlespacing lines (src/looks.js), a character style of the document's own a
// \newcommand{\name}[1]{…#1…}, a paragraph style a \newenvironment of formatting alone; each written
// once in the preamble and used as \name{…} or \begin{name}…\end{name}, so the file stays the
// LaTeX a person writes. Every change is one commit (one undo). The pane is no dialog: it stays
// open beside the page while the caret moves, its current style marked. The methods join App's
// prototype through src/cmd/styles.js.

import { $ } from './dom.js';
import { dialog, openMenu, numberField } from './kit.js';
import { command, enabled } from '../commands.js';
import { SIZES, defaultLook, headLookEdits } from '../looks.js';
import { isHeading, isEnvStyle, envOf, charDef, envDef, defRange, readCharBody, charBodyOf, readEnvBegin, envBeginOf, restyle } from '../styles.js';
import { enclosing, wrapEdits, unwrapEdits, parseAt } from '../wrap.js';
import { defineOnce } from '../preamble.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// classes whose headings titlesec must not set (they have their own means), and why
const NO_TITLESEC = [[/^scr(artcl|reprt|book)$/, 'KOMA-Script sets its headings with \\setkomafont and \\RedeclareSectionCommand, and warns against titlesec: Fonts on the Design tab sets their font.'],
  [/^memoir$/, 'memoir sets its headings with its own commands (\\setsecheadstyle, \\chapterstyle), and titlesec breaks them.'],
  [/^beamer$/, 'A beamer presentation\'s headings are its theme\'s.']];
// the inline commands Update to Match reads off a heading's words, and the field each sets
const TO_LOOK = { textbf: ['bf', true], textmd: ['bf', false], textit: ['it', true], emph: ['it', true], textup: ['it', false], textsc: ['sc', true], textsf: ['sf', true], texttt: ['tt', true], textrm: ['sf', false],
  bfseries: ['bf', true], itshape: ['it', true], scshape: ['sc', true], sffamily: ['sf', true], ttfamily: ['tt', true] };
const SIZE_NAME = { tiny: 'Tiny', scriptsize: 'Script', footnotesize: 'Footnote', small: 'Small', normalsize: 'Normal', large: 'Large', Large: 'Larger', LARGE: 'Very large', huge: 'Huge', Huge: 'Largest' };
const NAME_OK = /^[A-Za-z]{2,30}$/;
// the word around p in the source (letters, digits, an apostrophe or a hyphen inside), or null
function wordIn(src, p) {
  const W = /[\p{L}\p{N}\p{M}'’-]/u;
  let a = p, b = p;
  while (a > 0 && p - a < 200 && W.test(src[a - 1])) a--;
  while (b < src.length && b - p < 200 && W.test(src[b])) b++;
  // (a command's name is no word: \textbf at the caret stays as it is)
  if (a > 0 && src[a - 1] === '\\') return null;
  return b > a ? { a, b } : null;
}

export const methods = {
  // ---- what the headings look like now -----------------------------------------------------
  titlesecWhy() {
    const cls = this.model ? this.model.opts.cls || 'article' : 'article';
    for (const [re, why] of NO_TITLESEC) if (re.test(cls)) return why;
    if (!this.model || this.stylePreEnd() < 0) return 'The main file has no preamble to set it in.';
    return null;
  },
  headLookOf(cmd) {
    const O = this.model ? this.model.opts : {}, L = (O.heads && O.heads[cmd]) || defaultLook(cmd, !!O.koma);
    return L ? { ...L } : null;
  },
  // A heading's look written: its lines, titlesec and xcolor where they are missing, one commit
  writeHeadLooks(want, label) {
    const f = this.main, src = this.src(f), why = this.titlesecWhy();
    if (why) { this.toast(why); return false; }
    const ed = headLookEdits(src, want, { koma: false });
    if (!ed) return false;
    if (!ed.length) return true;
    const removing = Object.values(want).every((L) => !L);
    const pk = removing ? [] : this.packageEdits(['titlesec', ...(Object.values(want).some((L) => L && L.color) ? ['xcolor'] : [])]);
    this.commitPreamble([...ed.map((x) => ({ f, ...x })), ...pk], label);
    return true;
  },
  // edits of the preamble, with the caret kept where it was in the words
  commitPreamble(edits, kind) {
    const c = this.caretNow();
    const shift = (f, p) => edits.filter((x) => x.f === f && x.e <= p).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.closeGroup();
    this.commit(edits, c && !c.ghost ? (c.collapsed ? { f: c.f, p: c.a + shift(c.f, c.a), bias: -1 } : { f: c.f, p: c.b + shift(c.f, c.b), selA: c.a + shift(c.f, c.a), selB: c.b + shift(c.f, c.b) }) : null, kind || 'format');
    this.closeGroup();
  },

  // ---- the Styles pane -----------------------------------------------------------------------
  toggleStylesPane(open) {
    const had = $('#stylespane');
    if (had && open !== true) { had.remove(); this.ribbonBack(); return; }
    if (had) return;
    const P = el('aside', 'stp');
    P.id = 'stylespane';
    P.setAttribute('role', 'complementary');
    P.setAttribute('aria-label', 'Styles pane');
    const h = el('div', 'stp-h'), x = el('button', 'pop-x');
    h.append(el('span', 'stp-t', 'Styles'));
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
    x.addEventListener('click', () => this.toggleStylesPane(false));
    h.append(x);
    const list = el('div', 'stp-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Styles of this document');
    const foot = el('div', 'stp-f');
    const prev = el('label', 'stp-prev'), cb = el('input');
    cb.type = 'checkbox'; cb.checked = this.stpPreview !== false;
    cb.addEventListener('change', () => { this.stpPreview = cb.checked; this.paneFill(); });
    prev.append(cb, document.createTextNode(' Show preview'));
    const add = el('button', 'btn ghost sm', 'New Style…');
    add.type = 'button'; add.title = 'Create a Style: a character style (\\newcommand) or a paragraph style (\\newenvironment) from the formatting at the caret';
    add.addEventListener('click', () => { this.ribbonBack(); this.runCommand('create-style'); });
    const num = el('button', 'btn ghost sm', 'Heading numbers off');
    num.type = 'button'; num.id = 'stp-num'; num.setAttribute('aria-pressed', 'false'); num.title = command('heading-numbers-off').title;
    num.addEventListener('click', () => { this.ribbonBack(); this.runCommand('heading-numbers-off'); });
    foot.append(prev, num, add);
    P.append(h, list, foot);
    P.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.toggleStylesPane(false); return; }
      if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key) || !e.target.matches('[role=option]')) return;
      const all = [...list.querySelectorAll('[role=option]')], i = all.indexOf(e.target), n = all.length;
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      e.preventDefault(); all[j].focus();
    });
    // (a press in the pane keeps the caret on the page)
    P.addEventListener('mousedown', (e) => { if (!e.target.closest('input, select')) e.preventDefault(); });
    // (the caret stays on the page, as with Word's pane: Tab reaches the pane's list, and a style
    // picked there goes to the place the caret had)
    const sel = getSelection();
    if (sel.rangeCount && this.root.contains(sel.anchorNode)) this.rbRange = sel.getRangeAt(0).cloneRange();
    list.addEventListener('focusin', () => { const s = getSelection(); if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange(); });
    document.body.append(P);
    this.paneFill();
    this.ribbonSync();
    const cur = list.querySelector('[aria-selected="true"]') || list.querySelector('[role=option]');
    if (cur) cur.tabIndex = 0;
  },
  paneFill() {
    const P = $('#stylespane');
    if (!P) return;
    const list = P.querySelector('.stp-list'), K = this.styleCatalog(), st = this.rbStyle || { v: 'p', to: new Set(), on: false };
    list.textContent = '';
    const heads = { para: 'Paragraph styles', env: 'LaTeX environments', own: 'This document\'s environments' };
    let g = null;
    const row = (name, title, cls, on, can, apply, menu) => {
      const r = el('div', 'stp-row');
      const a = el('div', 'stp-o ' + (cls || ''));
      a.setAttribute('role', 'option'); a.tabIndex = -1; a.setAttribute('aria-label', name); a.title = title;
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      if (!can) a.setAttribute('aria-disabled', 'true');
      a.append(el('span', 'stp-n', name));
      a.addEventListener('click', () => { if (a.getAttribute('aria-disabled') === 'true') return; this.ribbonBack(); apply(); this.ribbonSync(); });
      a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); } });
      a.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
      const o = el('button', 'stp-x');
      o.type = 'button'; o.setAttribute('aria-label', name + ' options'); o.title = 'Modify, Update to Match Selection, Select All Instances';
      o.innerHTML = '<svg viewBox="0 0 10 8" aria-hidden="true"><path d="M1.5 2.5 5 6l3.5-3.5"/></svg>';
      o.addEventListener('click', () => menu());
      o.tabIndex = -1;
      r.append(a, o);
      list.append(r);
      return a;
    };
    for (const x of K.all) {
      if (x.v === 'title' && st.v !== 'title') continue;
      if (x.group !== g) { g = x.group; const t = el('div', 'stp-g', heads[g]); t.setAttribute('role', 'presentation'); list.append(t); }
      const can = st.on && (st.to.has(x.v) || (x.v === st.v && st.to.size > 0));
      const cls = this.stpPreview !== false ? 'stp-look ' + (isHeading(x.v) ? 'stl-' + x.v : isEnvStyle(x.v) ? 'stl-env' : x.v === 'latex' ? 'stl-latex' : 'stl-p') : '';
      const a = row(x.name, (can || x.v === st.v ? x.name : x.name + ': ' + this.whyNot(st, x.v)), cls, x.v === st.v, can, () => this.setBlockStyle(x.v), (cx, cy) => this.styleMenu(x.v, x.name, a, cx, cy));
      a.dataset.style = x.v;
    }
    if (K.chars.length) {
      const t = el('div', 'stp-g', 'Character styles'); t.setAttribute('role', 'presentation'); list.append(t);
      const at = this.ribbonAt(), here = at ? this.charStyleAt(at) : null;
      for (const c of K.chars) {
        const a = row(c.name, '\\' + c.name + '{…}: ' + c.body, 'stl-char', here === c.name, !!at && !at.c.ghost, () => this.applyCharStyle(c.name), (cx, cy) => this.styleMenu('char:' + c.name, c.name, a, cx, cy));
        a.dataset.style = 'char:' + c.name;
      }
    }
    const num = $('#stp-num'), nc = command('heading-numbers-off');
    if (num && nc && this.model) num.setAttribute('aria-pressed', nc.on(this) ? 'true' : 'false');
  },
  // the pane follows the caret: its style marked, those that cannot apply here dimmed
  paneSync(at, st) {
    const P = $('#stylespane');
    if (!P) return;
    const K = this.styleCatalog();
    if (P.dataset.k !== String(K.all.length) + '|' + K.chars.length + '|' + K.levels.length) { P.dataset.k = String(K.all.length) + '|' + K.chars.length + '|' + K.levels.length; this.paneFill(); }
    const here = at && !at.c.ghost ? this.charStyleAt(at) : null;
    for (const a of P.querySelectorAll('[role=option]')) {
      const v = a.dataset.style;
      if (/^char:/.test(v)) { a.setAttribute('aria-selected', here === v.slice(5) ? 'true' : 'false'); if (at && !at.c.ghost) a.removeAttribute('aria-disabled'); else a.setAttribute('aria-disabled', 'true'); continue; }
      const can = st.on !== false && !!at && (st.to.has(v) || (v === st.v && st.to.size > 0));
      a.setAttribute('aria-selected', v === st.v ? 'true' : 'false');
      if (can) a.removeAttribute('aria-disabled'); else a.setAttribute('aria-disabled', 'true');
    }
    const num = $('#stp-num'), nc = command('heading-numbers-off');
    if (num && nc && this.model) num.setAttribute('aria-pressed', nc.on(this) ? 'true' : 'false');
  },
  // a style's own menu (the pane's arrow, a right click on it, a tile's right click)
  styleMenu(v, name, anchor, x, y) {
    const items = [];
    const ch = /^char:/.test(v);
    items.push({ name: 'Update ' + name + ' to Match Selection', title: 'The formatting at the caret becomes the style\'s', disabled: !this.canUpdateStyle(v), run: () => { this.ribbonBack(); this.runCommand('update-style', { v }); } });
    items.push({ name: 'Modify…', title: 'Font, size, colour, alignment, spacing and numbering', disabled: !this.canModifyStyle(v), run: () => { this.ribbonBack(); this.runCommand('modify-style', { v }); } });
    // (a heading's own toggle, which a right click on the page has too: a phone has no right click)
    const h = isHeading(v) ? this.headingAt(this.ribbonAt()) : null;
    if (h && h.cmd === v) items.push({ name: 'Unnumbered heading', checked: h.star, title: command('heading-unnumbered').title, run: () => { this.ribbonBack(); this.runCommand('heading-unnumbered'); } });
    if (!ch) items.push({ name: 'Select All Instances', title: 'Selects the first paragraph in this style and says how many there are', disabled: !this.styleInstances(v, 1).length, run: () => { this.ribbonBack(); this.selectStyleInstances(v); } });
    const slot = !ch && Object.entries(this.gallerySlots(v).val).find(([, w]) => w === v);
    if (slot && slot[0] !== 'p' && slot[0] !== 'latex' && slot[0] !== 'title') {
      const inG = this.galleryHas(slot[0]);
      items.push(null, { name: inG ? 'Remove from Style Gallery' : 'Add to Style Gallery', run: () => { if (inG) this.galleryRemove(slot[0]); else this.galleryAdd(slot[0]); this.paneFill(); } });
    }
    openMenu(this, x != null ? new DOMRect(x, y, 0, 0) : anchor, items, { label: name + ' style' });
  },

  // ---- how many, and which ---------------------------------------------------------------------
  // the paragraphs of the document in a style: [{ f, s }] by where they start
  // (each block's first item found in one walk of the page; max: stop at that many)
  styleInstances(v, max = 1000) {
    const out = [];
    if (!this.renderer || !v) return out;
    const first = new Map();
    for (const it of this.root.querySelectorAll('.it[data-b]')) if (!first.has(it.dataset.b)) first.set(it.dataset.b, it);
    for (const B of this.renderer.blocks) {
      const it = first.get(String(B.id));
      if (!it) continue;
      if (out.length >= max) break;
      let st;
      try { st = this.styleOfBlock(B, it); } catch (e) { continue; }
      if (st.v === v) out.push({ f: B.f, s: B.s, it });
    }
    return out;
  },
  selectStyleInstances(v) {
    const all = this.styleInstances(v);
    if (!all.length) { this.toast('No paragraph of this document is in that style.'); return; }
    const first = all[0], r = document.createRange();
    r.selectNodeContents(first.it);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    first.it.scrollIntoView({ block: 'center' });
    this.toast(all.length + (all.length === 1 ? ' paragraph is' : ' paragraphs are') + ' in ' + this.styleName(v) + '; the first is selected.');
  },

  // ---- character styles of the document's own --------------------------------------------------
  charStyleAt(at) {
    if (!at || !at.c || at.c.ghost) return null;
    const K = this.styleCatalog();
    if (!K.chars.length) return null;
    const W = enclosing(this.src(at.c.f), at.c.a, at.c.b, K.chars.map((c) => c.name));
    return W ? W.cmd : null;
  },
  // \name{…} around the selection (the word at the caret), or off again where it is there
  applyCharStyle(name) {
    const c = this.caretNow();
    if (!c || c.ghost) return false;
    const f = c.f, src = this.src(f), W = enclosing(src, c.a, c.b, [name]);
    this.closeGroup();
    if (W) {
      const ed = unwrapEdits(src, W), d = (W.is - W.s);
      this.commit(ed.map((x) => ({ f, ...x })), c.collapsed ? { f, p: c.a - d, bias: -1 } : { f, p: c.b - d, selA: c.a - d, selB: c.b - d }, 'format');
    } else {
      let a = c.a, b = c.b;
      if (a === b) { const w = wordIn(src, a); if (w) { a = w.a; b = w.b; } }
      const r = wrapEdits(src, a, b, '\\' + name + '{');
      if (r.error) { this.toast('The selection runs across a brace or an environment: select inside one paragraph.'); return false; }
      this.commit(r.edits.map((x) => ({ f, ...x })), r.sel ? { f, p: r.sel.b, selA: r.sel.a, selB: r.sel.b } : { f, p: r.p, bias: r.bias }, 'format');
    }
    this.closeGroup();
    return true;
  },

  // ---- Apply Styles (Ctrl+Shift+S) -------------------------------------------------------------
  openApplyStyles() {
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    const K = this.styleCatalog(), st = this.rbStyle || { v: 'p' };
    // (the box takes the focus: the place on the page is kept for Enter)
    const c0 = this.caretNow();
    const p = dialog(this, { title: 'Apply Styles', rect: new DOMRect(Math.max(8, window.innerWidth - 340), 120, 0, 0), cls: 'pop-apply' });
    const lab = el('label', 'fd-l', 'Style name');
    const inp = el('input', 'fd-in');
    inp.id = 'apply-style-name'; inp.setAttribute('aria-label', 'Style name'); inp.autocomplete = 'off'; inp.spellcheck = false;
    const dl = el('datalist');
    dl.id = 'apply-style-list';
    for (const x of K.all) dl.append(new Option(x.name));
    for (const c of K.chars) dl.append(new Option(c.name));
    inp.setAttribute('list', dl.id);
    inp.value = this.styleName(st.v) || '';
    lab.htmlFor = inp.id;
    const row = el('div', 'fd-btns');
    const ok = el('button', 'btn sm', 'Reapply'), mod = el('button', 'btn ghost sm', 'Modify…');
    ok.type = mod.type = 'button';
    const find = () => {
      const q = inp.value.trim().toLowerCase();
      return K.all.find((x) => x.name.toLowerCase() === q || x.v.toLowerCase() === q) || K.chars.map((c) => ({ v: 'char:' + c.name, name: c.name })).find((x) => x.name.toLowerCase() === q)
        || K.all.find((x) => x.name.toLowerCase().startsWith(q) && q) || null;
    };
    const sync = () => { const x = find(); ok.textContent = x && x.v === st.v ? 'Reapply' : 'Apply'; ok.disabled = !x; mod.disabled = !x || !this.canModifyStyle(x.v); };
    const go = () => {
      const x = find();
      if (!x) { this.toast('No style of that name here.'); return; }
      this.closePop(true);
      this.ribbonBack();
      if (c0 && !c0.ghost) this.restoreCaret(c0.collapsed ? { f: c0.f, p: c0.a, bias: -1 } : { f: c0.f, p: c0.b, selA: c0.a, selB: c0.b }, true);
      if (/^char:/.test(x.v)) this.applyCharStyle(x.v.slice(5)); else this.setBlockStyle(x.v);
      this.ribbonSync();
    };
    inp.addEventListener('input', sync);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    ok.addEventListener('click', go);
    mod.addEventListener('click', () => { const x = find(); if (!x) return; this.closePop(true); this.ribbonBack(); this.runCommand('modify-style', { v: x.v }); });
    row.append(ok, mod);
    p.append(lab, inp, dl, row);
    sync();
    this.positionPop();
    inp.focus(); inp.select();
  },

  // ---- Modify Style --------------------------------------------------------------------------
  canModifyStyle(v) {
    if (!v || !this.model) return false;
    if (isHeading(v)) return v !== 'part' && !this.titlesecWhy();
    if (v === 'p') return !!command('font-dialog') || !!command('paragraph-dialog');
    if (/^char:/.test(v)) return !!defRange(this.src(this.main), v.slice(5), 'cmd');
    if (/^env:/.test(v)) return !!defRange(this.src(this.main), envOf(v), 'env');
    return false;
  },
  modifyWhy(v) {
    if (isHeading(v)) return v === 'part' ? 'Part keeps LaTeX\'s look here.' : this.titlesecWhy();
    if (v === 'p') return 'Normal is the document\'s font (Font, Home) and its paragraphs\' spacing (Paragraph).';
    return 'Only a style of this document\'s own (\\newcommand, \\newenvironment in its main file) or a heading can be changed here; LaTeX\'s environments keep their class\'s look.';
  },
  openModifyStyle(v) {
    if (!this.canModifyStyle(v)) { this.toast(this.modifyWhy(v) || 'This style cannot be changed here.'); return false; }
    if (v === 'p') { if (command('font-dialog')) this.runCommand('font-dialog'); else this.runCommand('paragraph-dialog'); return true; }
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    const head = isHeading(v), ch = /^char:/.test(v), name = ch ? v.slice(5) : head ? v : envOf(v);
    const src = this.src(this.main);
    let F;
    if (head) F = this.headLookOf(v);
    else { const r = defRange(src, name, ch ? 'cmd' : 'env'); F = (ch ? readCharBody(src.slice(r.s, r.e)) : readEnvBegin(src.slice(r.s, r.e))) || {}; }
    const p = dialog(this, { title: 'Modify Style', rect: new DOMRect(Math.max(8, window.innerWidth / 2 - 200), 110, 0, 0), cls: 'pop-modstyle' });
    p.append(el('div', 'ms-name', 'Style: ' + this.styleName(ch ? '' : v) + (ch ? '\\' + name : '') + (head ? '  (\\' + v + ')' : /^env:/.test(v) ? '  (' + name + ')' : '')));
    const form = this.styleForm(F, { head, ch, cmd: head ? v : null });
    p.append(form.el);
    const row = el('div', 'fd-btns'), ok = el('button', 'btn sm', 'OK'), no = el('button', 'btn ghost sm', 'Cancel');
    ok.type = no.type = 'button';
    if (head) { const def = el('button', 'btn ghost sm', 'LaTeX\'s own'); def.type = 'button'; def.title = 'Takes this heading\'s titlesec lines away'; def.addEventListener('click', () => { this.closePop(true); this.ribbonBack(); this.writeHeadLooks({ [v]: null }); this.ribbonSync(); }); row.append(def); }
    row.append(ok, no);
    p.append(row);
    no.addEventListener('click', () => { this.closePop(true); this.ribbonBack(); });
    ok.addEventListener('click', () => {
      const G = form.get();
      this.closePop(true);
      this.ribbonBack();
      if (head) this.writeHeadLooks({ [v]: G }, 'format');
      else this.rewriteDef(name, ch ? 'cmd' : 'env', ch ? charBodyOf(G) : envBeginOf(G), G.color);
      this.ribbonSync();
    });
    this.positionPop();
    const first = p.querySelector('select, input, button:not(.pop-x)');
    if (first) first.focus();
    return true;
  },
  // A form of a style's formatting: { el, get() }. o.head adds a heading's alignment, rule, run in,
  // number and spacing; o.ch leaves out what a character style cannot hold (alignment).
  styleForm(F, o) {
    const box = el('div', 'ms-form');
    const field = (label, ctl) => { const r = el('label', 'ms-row'); r.append(el('span', 'ms-l', label), ctl); box.append(r); return ctl; };
    const select = (id, label, opts, cur) => { const s = el('select', 'fd-sel'); s.id = id; s.setAttribute('aria-label', label); for (const [v, t] of opts) s.add(new Option(t, v)); s.value = cur; return field(label, s); };
    const fam = select('ms-family', 'Font', [['rm', 'Same as the text'], ['sf', 'Sans serif'], ['tt', 'Typewriter']], F.sf ? 'sf' : F.tt ? 'tt' : 'rm');
    const size = o.ch && !F.size ? null : select('ms-size', 'Size', SIZES.map((z) => [z, SIZE_NAME[z] + ' (\\' + z + ')']), F.size || 'normalsize');
    const checks = el('div', 'ms-checks');
    const check = (id, label, on) => { const l = el('label', 'ms-c'), c = el('input'); c.type = 'checkbox'; c.id = id; c.checked = !!on; l.append(c, document.createTextNode(' ' + label)); checks.append(l); return c; };
    const bf = check('ms-bold', 'Bold', F.bf), it = check('ms-italic', 'Italic', F.it), sc = check('ms-sc', 'Small caps', F.sc);
    const ul = o.ch ? check('ms-ul', 'Underline', F.ul) : null;
    box.append(checks);
    const colors = [['', 'Automatic'], ...((this.model && [...this.model.colors.keys()].filter((n) => /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(n)).slice(0, 30).map((n) => [n, n])) || []), ...['black', 'darkgray', 'gray', 'red', 'blue', 'teal', 'olive', 'orange', 'violet', 'brown'].map((n) => [n, n])];
    if (F.color && !colors.some(([v]) => v === F.color)) colors.splice(1, 0, [F.color, F.color]);
    const seen = new Set(), cols = colors.filter(([v]) => (seen.has(v) ? false : (seen.add(v), true)));
    const col = select('ms-color', 'Colour', cols, F.color || '');
    const align = o.ch ? null : select('ms-align', 'Alignment', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], F.align || 'left');
    let rule = null, runin = null, num = null, before = null, after = null;
    if (o.head) {
      const hc = el('div', 'ms-checks');
      const hcheck = (id, label, on) => { const l = el('label', 'ms-c'), c = el('input'); c.type = 'checkbox'; c.id = id; c.checked = !!on; l.append(c, document.createTextNode(' ' + label)); hc.append(l); return c; };
      rule = hcheck('ms-rule', 'Rule below', F.rule);
      runin = /paragraph$/.test(o.cmd) || o.cmd === 'subsubsection' ? hcheck('ms-runin', 'Runs into its paragraph', F.shape === 'runin') : null;
      num = hcheck('ms-num', 'Numbered', F.num !== false);
      box.append(hc);
      const D = defaultLook(o.cmd, false);
      before = numberField({ id: 'ms-before', name: 'Space before', value: { value: F.before ?? Math.round((o.cmd === 'section' ? 3.5 : 3.25) * 4.3), unit: 'pt' }, units: ['pt'], step: 1, min: 0, max: 200 });
      after = numberField({ id: 'ms-after', name: 'Space after', value: { value: F.after ?? Math.round(o.cmd === 'section' ? 2.3 * 4.3 : 1.5 * 4.3), unit: 'pt' }, units: ['pt'], step: 1, min: 0, max: 200 });
      const sp = el('div', 'ms-sp');
      const l1 = el('label', 'ms-row'), l2 = el('label', 'ms-row');
      l1.append(el('span', 'ms-l', 'Space before'), before); l2.append(el('span', 'ms-l', 'Space after'), after);
      sp.append(l1, l2);
      box.append(sp);
      const spaced = { b: F.before != null, a: F.after != null };
      before.addEventListener('change', () => { spaced.b = true; }, true);
      after.addEventListener('change', () => { spaced.a = true; }, true);
      before.addEventListener('keydown', () => { spaced.b = true; }, true);
      after.addEventListener('keydown', () => { spaced.a = true; }, true);
      box.spaced = spaced;
      void D;
    }
    // the preview: the words in the style's look
    const pv = el('div', 'ms-preview', o.head ? 'Heading text' : 'Sample text');
    const paint = () => {
      pv.style.fontFamily = fam.value === 'sf' ? 'var(--font-doc-sf)' : fam.value === 'tt' ? 'var(--font-doc-tt)' : 'var(--font-doc)';
      pv.style.fontWeight = bf.checked ? 'bold' : 'normal'; pv.style.fontStyle = it.checked ? 'italic' : 'normal'; pv.style.fontVariant = sc.checked ? 'small-caps' : 'normal';
      pv.style.textAlign = align ? align.value : 'left';
      pv.style.borderBottom = rule && rule.checked ? '1px solid currentColor' : '';
      pv.style.textDecoration = ul && ul.checked ? 'underline' : '';
      const z = size ? size.value : 'normalsize';
      pv.style.fontSize = Math.round(14 * ({ tiny: .5, scriptsize: .7, footnotesize: .8, small: .9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.73, huge: 2.07, Huge: 2.49 }[z] || 1)) + 'px';
      const cv = col.value, hex = cv && this.model && this.model.colors.get(cv);
      pv.style.color = hex && /^#?[0-9A-Fa-f]{6}$/.test(hex) ? (hex[0] === '#' ? hex : '#' + hex) : /^[a-z]+$/.test(cv) ? cv : '';
    };
    box.addEventListener('input', paint); box.addEventListener('change', paint);
    box.append(pv);
    paint();
    return {
      el: box,
      get: () => {
        const G = o.head ? { ...F } : {};
        G.sf = fam.value === 'sf'; G.tt = fam.value === 'tt';
        if (size) G.size = size.value;
        G.bf = bf.checked; G.it = it.checked; G.sc = sc.checked;
        if (ul) G.ul = ul.checked;
        G.color = col.value || null;
        if (align) G.align = align.value;
        if (o.head) {
          G.rule = rule.checked; G.num = num.checked;
          if (runin) G.shape = runin.checked ? 'runin' : (defaultLook(o.cmd, false).shape === 'runin' ? 'hang' : defaultLook(o.cmd, false).shape);
          if (box.spaced.b) G.before = before.get().value;
          if (box.spaced.a) G.after = after.get().value;
          if (G.before != null && G.after == null) G.after = after.get().value;
          if (G.after != null && G.before == null) G.before = before.get().value;
        }
        return G;
      }
    };
  },
  // a style of the document's own given another body (a \newcommand's) or start (a \newenvironment's)
  rewriteDef(name, kind, text, color) {
    const f = this.main, src = this.src(f), r = defRange(src, name, kind);
    if (!r) return false;
    if (src.slice(r.s, r.e) === text) return true;
    const pk = color ? this.packageEdits(['xcolor']) : [];
    this.commitPreamble([{ f, s: r.s, e: r.e, t: text }, ...pk], 'format');
    return true;
  },

  // ---- Create a Style ------------------------------------------------------------------------
  // the formatting at the caret: the inline commands around the selection or the word, read off
  // the text (\textbf{\textcolor{red}{…}} gives bold and red)
  formatHere() {
    const c = this.caretNow(), F = {};
    if (!c || c.ghost) return F;
    const src = this.src(c.f), names = ['textbf', 'textit', 'emph', 'textsc', 'textsf', 'texttt', 'uline', 'underline', 'textcolor', 'MakeUppercase', 'bfseries', 'itshape', 'scshape', 'sffamily', 'ttfamily'];
    let a = c.a, b = c.b;
    for (let k = 0; k < 8; k++) {
      const W = enclosing(src, a, b, names);
      if (!W) break;
      const m = { textbf: 'bf', bfseries: 'bf', textit: 'it', emph: 'it', itshape: 'it', textsc: 'sc', scshape: 'sc', textsf: 'sf', sffamily: 'sf', texttt: 'tt', ttfamily: 'tt', uline: 'ul', underline: 'ul', MakeUppercase: 'upper' }[W.cmd];
      if (m) F[m] = true;
      if (W.cmd === 'textcolor' && W.args && W.args[0] && /^[A-Za-z][A-Za-z0-9!.]{0,40}$/.test(W.args[0])) F.color = W.args[0];
      a = W.s; b = W.e;
    }
    return F;
  },
  openCreateStyle() {
    const s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) this.rbRange = s.getRangeAt(0).cloneRange();
    // (the dialog's fields take the focus: the place on the page is kept for OK)
    const c0 = this.caretNow(), at0 = this.ribbonAt();
    const F = this.formatHere();
    const p = dialog(this, { title: 'Create a Style', rect: new DOMRect(Math.max(8, window.innerWidth / 2 - 200), 110, 0, 0), cls: 'pop-modstyle' });
    const nameRow = el('label', 'ms-row'), name = el('input', 'fd-in');
    name.id = 'cs-name'; name.setAttribute('aria-label', 'Name'); name.placeholder = 'keyterm'; name.autocomplete = 'off'; name.spellcheck = false;
    name.title = 'Letters only: it becomes the LaTeX name, \\keyterm{…} or \\begin{keyterm}';
    nameRow.append(el('span', 'ms-l', 'Name'), name);
    const kindRow = el('label', 'ms-row'), kind = el('select', 'fd-sel');
    kind.id = 'cs-type'; kind.setAttribute('aria-label', 'Style type');
    kind.add(new Option('Character (\\newcommand)', 'char')); kind.add(new Option('Paragraph (\\newenvironment)', 'para'));
    kindRow.append(el('span', 'ms-l', 'Style type'), kind);
    p.append(nameRow, kindRow);
    let form = this.styleForm(F, { ch: true });
    p.append(form.el);
    kind.addEventListener('change', () => { const G = form.get(); const nf = this.styleForm(G, { ch: kind.value === 'char' }); form.el.replaceWith(nf.el); form = nf; });
    const note = el('div', 'ms-note', '');
    const row = el('div', 'fd-btns'), ok = el('button', 'btn sm', 'OK'), no = el('button', 'btn ghost sm', 'Cancel');
    ok.type = no.type = 'button';
    row.append(ok, no);
    p.append(note, row);
    const check = () => {
      const n = name.value.trim(), src = this.src(this.main), M = this.model;
      let why = '';
      if (!NAME_OK.test(n)) why = 'Letters only, two or more (LaTeX\'s names have no digits or spaces).';
      else if (kind.value === 'char' && (M.textMacros.has(n) || defRange(src, n, 'cmd') || /^(text|math|section|par|item|label|ref|cite|begin|end|new|renew|def|let|if|else|fi|relax|the|end)/.test(n))) why = '\\' + n + ' is taken: LaTeX or this document has a command of that name.';
      else if (kind.value === 'para' && (M.envDefs.has(n) || M.thms.has(n) || /^(document|center|quote|quotation|verse|itemize|enumerate|description|figure|table|tabular|abstract|equation|align|minipage|proof|theorem)$/.test(n))) why = 'An environment of that name exists.';
      // (nothing said before a name is typed)
      note.textContent = n ? why : '';
      ok.disabled = !!why;
    };
    name.addEventListener('input', check); kind.addEventListener('change', check);
    check();
    no.addEventListener('click', () => { this.closePop(true); this.ribbonBack(); });
    ok.addEventListener('click', () => { check(); if (ok.disabled) return; const G = form.get(), n = name.value.trim(), k = kind.value; this.closePop(true); this.ribbonBack(); this.createStyle(n, k, G, c0, at0); this.ribbonSync(); });
    this.positionPop();
    name.focus();
  },
  // The style's definition, once in the preamble, and the style on the selection (a character
  // style) or the caret's paragraph (a paragraph style): one commit
  createStyle(name, kind, F, c0, at0) {
    const f = this.main, src = this.src(f);
    if (!NAME_OK.test(name)) return false;
    // (where the caret was when the dialog opened, if the text has not changed since)
    if (c0 && !c0.ghost && at0 && at0.B) { this.restoreCaret(c0.collapsed ? { f: c0.f, p: c0.a, bias: -1 } : { f: c0.f, p: c0.b, selA: c0.a, selB: c0.b }, true); }
    const def = defineOnce(src, name, kind === 'char' ? charDef(name, F) : envDef(name, F), { kind: kind === 'char' ? 'command' : 'environment' }).map((x) => ({ f, ...x }));
    if (!def.length) { this.toast('The preamble defines ' + name + ' already.'); return false; }
    const pk = F.color || F.ul ? this.packageEdits({ ...(F.color ? { xcolor: null } : {}), ...(F.ul ? { ulem: 'normalem' } : {}) }) : [];
    const c = this.caretNow(), at = this.ribbonAt();
    let use = [], caret = null;
    if (c && !c.ghost && kind === 'char') {
      let a = c.a, b = c.b;
      if (a === b) { const w = wordIn(this.src(c.f), a); if (w) { a = w.a; b = w.b; } }
      const r = a < b ? wrapEdits(this.src(c.f), a, b, '\\' + name + '{') : null;
      if (r && !r.error) { use = r.edits.map((x) => ({ f: c.f, ...x })); caret = r.sel ? { f: c.f, p: r.sel.b, selA: r.sel.a, selB: r.sel.b } : { f: c.f, p: r.p, bias: -1 }; }
    } else if (at && !at.c.ghost && kind === 'para') {
      const st = this.blockStyle(at);
      if (st.b && !st.many && (st.to.has('quote') || (st.v && isEnvStyle(st.v)))) {
        const r = restyle(this.src(at.B.f), st.b, 'env:' + name, c.a);
        if (r) { use = r.edits.map((x) => ({ f: at.B.f, ...x })); caret = { f: at.B.f, p: r.p, bias: -1 }; }
      }
    }
    const all = [...def, ...pk, ...use];
    if (caret) { const grow = [...def, ...pk].filter((x) => x.f === caret.f && x.s <= (caret.selA ?? caret.p)).reduce((n, x) => n + x.t.length - (x.e - x.s), 0); caret = { ...caret, p: caret.p + grow, ...(caret.selA != null ? { selA: caret.selA + grow, selB: caret.selB + grow } : {}) }; }
    this.closeGroup();
    this.commit(all, caret || (c && !c.ghost ? { f: c.f, p: c.a + all.filter((x) => x.f === c.f && x.s <= c.a).reduce((n, x) => n + x.t.length - (x.e - x.s), 0), bias: -1 } : null), 'format');
    this.closeGroup();
    return true;
  },

  // ---- Update to Match Selection ---------------------------------------------------------------
  // A heading whose words are all inside inline formatting (\section{\textsf{\textcolor{blue}{X}}}):
  // that formatting becomes the heading level's look, and comes off the words. A character style
  // the caret is in, with formatting inside it: the same, into its \newcommand's body.
  matchPlan(v) {
    const at = this.ribbonAt();
    if (!at || at.c.ghost || !this.model) return null;
    const names = Object.keys(TO_LOOK).concat(['textcolor', 'color']);
    const peel = (src, ws, we) => {
      const F = {}, edits = [];
      let s = ws, e = we, n = 0;
      for (; n < 6; n++) {
        while (s < e && /\s/.test(src[s])) s++;
        while (e > s && /\s/.test(src[e - 1])) e--;
        const W = parseAt(src, s, new Set(names));
        if (!W || W.e !== e) break;
        if (W.cmd === 'textcolor') { if (!W.args || !/^[A-Za-z][A-Za-z0-9!.]{0,40}$/.test(W.args[0] || '')) break; F.color = W.args[0]; }
        else if (TO_LOOK[W.cmd]) F[TO_LOOK[W.cmd][0]] = TO_LOOK[W.cmd][1];
        else break;
        edits.push(...unwrapEdits(src, W));
        s = W.is; e = W.ie;
      }
      return n ? { F, edits } : null;
    };
    if (isHeading(v)) {
      if (this.titlesecWhy()) return null;
      const h = this.headingAt(at);
      if (!h || h.cmd !== v) return null;
      const src = this.src(at.B.f), m = /^\\[A-Za-z]+\*?\s*(\[[^\]]*\])?\s*\{/.exec(src.slice(at.B.s, at.B.e));
      if (!m) return null;
      const P = peel(src, at.B.s + m[0].length, at.B.e - 1);
      return P ? { kind: 'head', f: at.B.f, ...P } : null;
    }
    if (/^char:/.test(v)) {
      const name = v.slice(5), src = this.src(at.c.f), W = enclosing(src, at.c.a, at.c.b, [name]);
      if (!W || !defRange(this.src(this.main), name, 'cmd')) return null;
      const P = peel(src, W.is, W.ie);
      return P ? { kind: 'char', name, f: at.c.f, ...P } : null;
    }
    return null;
  },
  canUpdateStyle(v) { return !!this.matchPlan(v); },
  updateStyle(v) {
    const P = this.matchPlan(v);
    if (!P) { this.toast('Put the caret in a ' + this.styleName(v) + ' whose words all have the formatting to take (\\textsf{…}, \\textcolor{…}{…}).'); return false; }
    const f = this.main, src = this.src(f);
    let pre;
    if (P.kind === 'head') {
      const why = this.titlesecWhy();
      if (why) { this.toast(why); return false; }
      const L = { ...this.headLookOf(v), ...P.F };
      pre = headLookEdits(src, { [v]: L }, {}) || [];
      pre = [...pre.map((x) => ({ f, ...x })), ...this.packageEdits(['titlesec', ...(L.color ? ['xcolor'] : [])])];
    } else {
      const r = defRange(src, P.name, 'cmd'), F = { ...(readCharBody(src.slice(r.s, r.e)) || {}), ...P.F };
      pre = [{ f, s: r.s, e: r.e, t: charBodyOf(F) }, ...(F.color ? this.packageEdits(['xcolor']) : [])];
    }
    this.commitPreamble([...pre, ...P.edits.map((x) => ({ f: P.f, ...x }))], 'format');
    return true;
  }
};
