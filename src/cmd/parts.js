// Round 3's Insert (R3): Cover Page (Insert › Pages), Quick Parts with Word's Document Property and
// Field (Insert › Text), and the form fields Word calls content controls (Insert › Text, Word's
// Developer tab), each as the LaTeX that prints the same (src/cover.js, src/fields.js,
// src/quickparts.js, src/forms.js), one commit and one undo each.

import { register, command } from '../commands.js';
import { openMenu, dialog } from '../ui/kit.js';
import { mk } from '../ui/dom.js';
import { COVERS, coverEdits, coverRemoveEdits, coverAt, coverDesign } from '../cover.js';
import { FIELDS, propertyTex } from '../fields.js';
import { readParts, partName, partNeeds, partIsBlock, wholeGroups, MAX_PARTS, MAX_TEXT } from '../quickparts.js';
import { preambleFor } from '../charfmt.js';
import { CONTROLS, controlTex, formEdits } from '../forms.js';
import { hasPackage } from '../preamble.js';

export const methods = {};
const WHY_CARET = 'Put the caret in the text first.';
const cls = (app) => (app.model && app.model.opts && app.model.opts.cls) || '';
const mainSrc = (app) => app.src(app.main);
// what the document's preamble says: \title, \author, \date (commented lines say nothing)
const props = (app) => {
  const s = mainSrc(app), b = s.search(/\\begin\s*\{document\}/), pre = (b < 0 ? s : s.slice(0, b)).replace(/(^|[^\\])%[^\n]*/g, '$1');
  return { title: /\\title\s*[[{]/.test(pre), author: /\\author\s*[[{]/.test(pre), date: /\\date\s*\{/.test(pre) };
};
const atText = (app, at) => !!at && !app.armed;
// a menu button's menu, at its button where the row shows it, else at the page
const menuOf = (app, id, label) => { const b = document.getElementById('rc-' + id); openMenu(app, b && b.offsetParent ? b : app.root, app.commandMenu(command(id)), { label }); return true; };
const ICON = {
  cover: '<path d="M5 2.5h10v15H5z"/><path d="M7.5 7h5M7.5 9.5h5M8.5 12h3"/>',
  parts: '<path d="M3.5 4.5h6v5h-6zM10.5 4.5h6v5h-6zM3.5 10.5h6v5h-6z"/><path d="M13.5 11v4M11.5 13h4"/>',
  form: '<path d="M3.5 5.5h13v4h-13zM3.5 12h5v4h-5z"/><path d="M4.8 14l1 1 1.8-2.2M10.5 14h6"/>'
};

// ---- Cover Page (I1) -----------------------------------------------------------------------------
// (the cover page of the main file's text, read once for each text: the ribbon asks often)
let coverMemo = { src: null, v: null };
const coverHere = (app) => { const s = mainSrc(app); if (coverMemo.src !== s) coverMemo = { src: s, v: coverAt(s) }; return coverMemo.v; };
register(
  { id: 'cover-page', name: 'Cover Page', label: 'Cover Page', tab: 'insert', group: 'pages', order: 10, kind: 'menu', icon: ICON.cover,
    title: 'Cover Page: a page of its own before the text with the title, the author and the date (titlepage); a new design takes the old one\'s place',
    synonyms: ['Title page', 'titlepage', 'Front page', 'Cover'],
    when: (app) => !!app.model && !app.stale && cls(app) !== 'beamer', whyNot: (app) => (cls(app) === 'beamer' ? 'A presentation\'s title page is a frame of its own (\\titlepage in a frame).' : 'Open a document first.'),
    run: (app, args) => (args && args.design ? app.coverPage(args.design, !!args.replace) : app.coverMenu()),
    menuItems: (app) => app.coverItems() },
  { id: 'cover-page-remove', name: 'Remove Current Cover Page', title: 'Take the cover page out (the titlepage the text starts with)', synonyms: ['Delete cover page', 'Remove title page'],
    when: (app) => !!app.model && !app.stale && !!coverHere(app), whyNot: () => 'The document has no cover page (a titlepage first in its text).', run: (app) => app.coverRemove() }
);
Object.assign(methods, {
  coverItems() {
    const now = coverDesign(mainSrc(this));
    return [...COVERS.map(([id, name, d]) => ({ name, title: d, checked: now === id, radio: true, run: () => this.coverPage(id) })), null,
      { name: 'Remove Current Cover Page', title: 'Take the cover page out', disabled: !now, command: 'cover-page-remove' }];
  },
  coverMenu() { return menuOf(this, 'cover-page', 'Cover Page'); },
  coverPage(id, replace) {
    if (!COVERS.some((x) => x[0] === id)) return false;
    const f = this.main, src = this.src(f);
    // (a title page of the document's own, its logos and all: asked first, as Word asks)
    if (!replace && coverDesign(src) === 'own') { this.toast('The text starts with a title page of its own.', 8000, { label: 'Replace it', fn: () => this.coverPage(id, true) }); return false; }
    const r = coverEdits(src, id, props(this), cls(this));
    if (r.error) { this.toast(r.error, 6000); return false; }
    const pk = r.packages.length ? this.packageEdits(r.packages) : [];
    const shift = pk.filter((x) => x.f === f && x.s <= r.at).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.closeGroup();
    this.removeGhost();
    this.commit([...r.edits.map((x) => ({ f, ...x })), ...pk], { f, p: r.at + shift, bias: 1 }, 'insert');
    this.closeGroup();
    this.goToCover();
    return true;
  },
  coverRemove() {
    const f = this.main, ed = coverRemoveEdits(this.src(f));
    if (!ed.length) return false;
    this.closeGroup();
    this.commit(ed.map((x) => ({ f, ...x })), { f, p: ed[0].s, bias: 1 }, 'insert');
    this.closeGroup();
    return true;
  },
  // (Word shows the cover it put in: the first page, in view)
  goToCover() { const p = document.querySelector('#pages .page'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'start' }); }
});

// ---- Quick Parts, Document Property and Field (I31, I32, I33) ------------------------------------------
const fieldById = (id) => FIELDS.find((x) => x.id === String(id || '').toUpperCase()) || null;
register(
  { id: 'quick-parts', name: 'Quick Parts', label: 'Quick Parts', tab: 'insert', group: 'text', order: 15, kind: 'menu', icon: ICON.parts,
    title: 'Quick Parts: the pieces you saved, a document property (title, author, date) or a field (page, pages, section, date, time, file name)',
    synonyms: ['Building blocks', 'AutoText', 'Snippets', 'Saved text', 'Document property', 'Field'],
    when: atText, whyNot: () => WHY_CARET, menuItems: (app) => app.quickPartItems(), run: (app) => menuOf(app, 'quick-parts', 'Quick Parts') },
  { id: 'insert-field', name: 'Field', title: 'Field…: a page\'s number, the pages\' count, the section\'s number, the date, the time, the file\'s name, a document property, as TeX prints them',
    synonyms: ['Insert field', 'Page field', 'NumPages', 'thepage', 'LastPage', 'jobname', 'Time field', 'Section number'],
    keys: ['Ctrl+F9'], when: atText, whyNot: () => WHY_CARET, run: (app, args) => (args && args.field ? app.insertField(args.field) : app.fieldDialog()) },
  // Word's Alt+Shift+P: the page's number where the caret is (\thepage), as Alt+Shift+D is the date
  { id: 'insert-page-field', name: 'Page Field', title: 'Page Field: the number of the page it stands on (\\thepage) (Alt+Shift+P)', synonyms: ['PAGE field', 'Page number here', 'thepage'],
    keys: ['Alt+Shift+P'], mac: { 'Alt+Shift+P': 'Control+Shift+P' }, when: atText, whyNot: () => WHY_CARET, run: (app) => app.insertField('PAGE') },
  { id: 'quick-part-save', name: 'Save Selection to Quick Part Gallery', title: 'Keep the selected text, with its formatting, as a Quick Part to put in again in any document (kept in this browser)',
    synonyms: ['Save as building block', 'New building block', 'Save snippet', 'AutoText'], keys: ['Alt+F3'],
    when: (app, at) => !!at && !app.armed && !!app.caretNow() && !app.caretNow().collapsed, whyNot: () => 'Select the text to keep first.', run: (app, args) => app.quickPartSave(args && args.name) },
  { id: 'building-blocks', name: 'Building Blocks Organizer', title: 'Your Quick Parts: put one in, rename it or delete it', synonyms: ['Organize Quick Parts', 'Manage building blocks', 'Quick Parts gallery'],
    when: () => true, run: (app) => app.partsOrganizer() },
  { id: 'quick-part-insert', name: 'Insert Quick Part', title: 'A saved Quick Part, by its name, at the caret', searchable: false,
    when: atText, whyNot: () => WHY_CARET, run: (app, args) => app.quickPartInsert(args && args.name) }
);
Object.assign(methods, {
  quickParts() { return readParts(this.prefs.quickParts); },
  quickPartItems() {
    const parts = this.quickParts(), P = props(this);
    const prop = (id, name, has) => ({ name, title: has ? 'The document\'s ' + name.toLowerCase() + ', from \\' + (id === 'CREATEDATE' ? 'date' : name.toLowerCase()) : 'The document has no \\' + name.toLowerCase() + ' yet (File › Properties)', disabled: !has, run: () => this.insertField(id) });
    return [...parts.slice(0, 12).map((x) => ({ name: x.name, title: x.tex.slice(0, 160), run: () => this.quickPartInsert(x.name) })), ...(parts.length ? [null] : []),
      prop('TITLE', 'Title', P.title), prop('AUTHOR', 'Author', P.author), { name: 'Date', title: P.date ? 'The document\'s date, from \\date' : 'The day the PDF is made (\\today)', run: () => this.insertField('CREATEDATE') }, null,
      { name: 'Field…', title: 'Page, pages, section, date, time, file name', command: 'insert-field' },
      { name: 'Building Blocks Organizer…', title: 'Your Quick Parts: insert, rename, delete', command: 'building-blocks' },
      { name: 'Save Selection to Quick Part Gallery…', title: 'Keep the selected text as a Quick Part', disabled: !this.caretNow() || this.caretNow().collapsed, command: 'quick-part-save' }];
  },
  // a field at the caret: its LaTeX, its package in the same step
  insertField(id) {
    const F = fieldById(id);
    if (!F) return false;
    let tex = F.tex, pk = F.pk || [];
    if (F.prop) {
      const P = props(this);
      if (F.prop === 'date' && !P.date) { tex = '\\today'; pk = []; }
      else if (!P[F.prop]) { this.toast('The document has no \\' + F.prop + ' yet: give it one in File › Properties, then insert its ' + F.name.toLowerCase() + '.', 6000); return false; }
      else { const T = propertyTex(F.prop, cls(this)); tex = T.tex; pk = T.pk; }
    }
    // (\thepage{}: the braces end the command's name before the words that follow it)
    return this.insertTeX(/\}$/.test(tex) ? tex : tex + '{}', pk);
  },
  fieldDialog() {
    const at = this.caretNow();
    const p = dialog(this, { title: 'Field', cls: 'pop-field', rect: new DOMRect(Math.max(8, innerWidth / 2 - 220), 90, 0, 0) });
    const list = mk('div', 'ps-list');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Field names');
    let pick = FIELDS[0].id;
    FIELDS.forEach((F, i) => {
      const l = mk('label', 'fd-ck');
      const r = mk('input');
      r.type = 'radio'; r.name = 'fld'; r.checked = i === 0; r.setAttribute('aria-label', F.name);
      r.addEventListener('change', () => { pick = F.id; });
      l.append(r, mk('span', '', F.name), mk('small', 'gd-hint', ' ' + F.d));
      list.append(l);
    });
    const ok = mk('button', 'btn primary', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', () => { this.closePop(); if (at) this.restoreCaret(at.collapsed ? { f: at.f, p: at.a } : { f: at.f, p: at.b, selA: at.a, selB: at.b }); this.insertField(pick); });
    const row = mk('div', 'gd-btns');
    row.append(mk('span', 'grow'), ok);
    p.append(list, row);
    this.positionPop();
    return true;
  },
  // Save Selection to Quick Part Gallery: the selection's LaTeX, under a name
  quickPartSave(name) {
    const c = this.caretNow();
    if (!c || c.collapsed) { this.toast('Select the text to keep first.'); return false; }
    // (the formatting round the selected words comes with them: whole groups, else what Copy takes)
    const all = this.src(c.f), W = this.texAt(c.f, c.a) ? null : wholeGroups(all, c.a, c.b);
    const tex = W ? all.slice(W[0], W[1]) : this.selectionLatex(c);
    if (!tex.trim()) return false;
    if (tex.length > MAX_TEXT) { this.toast('That is too long for a Quick Part (64 000 characters at most).'); return false; }
    const keep = (n) => {
      const nm = String(n || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 80) || partName(tex);
      const list = this.quickParts().filter((x) => x.name !== nm);
      if (list.length >= MAX_PARTS) { this.toast('The gallery is full (' + MAX_PARTS + ' Quick Parts): delete some in the Building Blocks Organizer.'); return false; }
      this.prefs.quickParts = [{ name: nm, tex }, ...list];
      this.savePrefs();
      this.toast('Kept as the Quick Part "' + nm + '" (Insert › Quick Parts).');
      return true;
    };
    if (name != null) return keep(name);
    const p = dialog(this, { title: 'Create New Building Block', cls: 'pop-qpsave', rect: new DOMRect(Math.max(8, innerWidth / 2 - 200), 120, 0, 0) });
    const i = mk('input', 'gd-in');
    i.type = 'text'; i.value = partName(tex); i.setAttribute('aria-label', 'Name'); i.maxLength = 80;
    const l = mk('label', 'gd-f gd-grow');
    l.append(mk('span', 'gd-l', 'Name'), i);
    const prev = mk('pre', 'qp-prev', tex.slice(0, 400) + (tex.length > 400 ? '…' : ''));
    const ok = mk('button', 'btn primary', 'OK');
    ok.type = 'button';
    const go = () => { if (keep(i.value)) this.closePop(); };
    ok.addEventListener('click', go);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); go(); } });
    const row = mk('div', 'gd-btns');
    row.append(mk('span', 'grow'), ok);
    p.append(l, mk('p', 'gd-hint', 'Kept in this browser, for every document: Insert › Quick Parts.'), prev, row);
    this.positionPop();
    i.focus(); i.select();
    return true;
  },
  // a part at the caret (words) or after the caret's paragraph (paragraphs, an environment), with
  // the packages its commands need, in one step
  quickPartInsert(name) {
    const x = this.quickParts().find((q) => q.name === name);
    if (!x) { this.toast('No Quick Part has that name.'); return false; }
    const needs = partNeeds(x.tex, cls(this));
    // (url: unless hyperref, url or xurl gives \url already)
    if (/\\url\s*\{/.test(x.tex) && !['hyperref', 'url', 'xurl'].some((n) => hasPackage(mainSrc(this), n, undefined, this.preambleOthers()))) needs.push({ pkgs: { url: null } });
    // (packages with the Font group's options, its definitions once: src/charfmt.js)
    const ed = preambleFor(mainSrc(this), needs, { others: this.preambleOthers() }).map((y) => ({ f: this.main, ...y }));
    const c = this.caretNow();
    const T = c && !c.ghost ? this.texHere() : null;
    if (!partIsBlock(x.tex) || (T && T.f === c.f)) return this.insertTeX(x.tex, { edits: ed });
    const { f, p, pre, post } = this.afterBlockPos();
    const nl = /\r\n/.test(this.src(f).slice(0, 4000)) ? '\r\n' : '\n';
    const body = x.tex.replace(/\r?\n/g, nl);
    const shift = ed.filter((y) => y.f === f && y.s <= p).reduce((n, y) => n + y.t.length - (y.e - y.s), 0);
    this.closeGroup();
    this.removeGhost();
    this.commit([{ f, s: p, e: p, t: pre.replace(/\n/g, nl) + body + post.replace(/\n/g, nl) }, ...ed], { f, p: p + shift + pre.length + body.length, bias: -1 }, 'insert');
    this.closeGroup();
    return true;
  },
  partsOrganizer() {
    const p = dialog(this, { title: 'Building Blocks Organizer', cls: 'pop-parts', rect: new DOMRect(Math.max(8, innerWidth / 2 - 240), 80, 0, 0) });
    const at = this.caretNow();
    const listEl = mk('div', 'qp-list');
    listEl.setAttribute('role', 'list');
    listEl.setAttribute('aria-label', 'Quick Parts');
    const draw = () => {
      listEl.textContent = '';
      const parts = this.quickParts();
      if (!parts.length) listEl.append(mk('p', 'gd-hint', 'No Quick Parts yet: select text, then Insert › Quick Parts › Save Selection to Quick Part Gallery.'));
      for (const x of parts) {
        const r = mk('div', 'qp-row');
        r.setAttribute('role', 'listitem');
        const nm = mk('input', 'gd-in qp-name');
        nm.type = 'text'; nm.value = x.name; nm.maxLength = 80; nm.setAttribute('aria-label', 'Name of ' + x.name);
        nm.addEventListener('change', () => {
          const v = nm.value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 80);
          const all = this.quickParts();
          if (!v || all.some((y) => y.name === v && y !== x)) { nm.value = x.name; return; }
          this.prefs.quickParts = all.map((y) => (y.name === x.name ? { name: v, tex: y.tex } : y));
          this.savePrefs(); draw();
        });
        const ins = mk('button', 'btn ghost', 'Insert');
        ins.type = 'button'; ins.setAttribute('aria-label', 'Insert ' + x.name);
        ins.disabled = !at;
        ins.addEventListener('click', () => { this.closePop(); if (at) this.restoreCaret(at.collapsed ? { f: at.f, p: at.a } : { f: at.f, p: at.b, selA: at.a, selB: at.b }); this.quickPartInsert(x.name); });
        const del = mk('button', 'btn ghost', 'Delete');
        del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + x.name);
        del.addEventListener('click', () => { this.prefs.quickParts = this.quickParts().filter((y) => y.name !== x.name); this.savePrefs(); draw(); });
        r.append(nm, mk('code', 'qp-tex', x.tex.slice(0, 80).replace(/\s+/g, ' ')), ins, del);
        listEl.append(r);
      }
    };
    draw();
    p.append(listEl);
    this.positionPop();
    return true;
  }
});

// ---- Form fields: Word's content controls (DV1) -------------------------------------------------------
register(
  { id: 'form-fields', name: 'Form Fields', label: 'Form Fields', tab: 'insert', group: 'text', order: 30, kind: 'menu', icon: ICON.form,
    title: 'Form Fields: Word\'s content controls as fields the PDF reader fills in (hyperref\'s Form): text, a check box, a combo box, a drop-down list, a date',
    synonyms: ['Content controls', 'Developer', 'Controls', 'Fillable form', 'PDF form', 'Form', 'Legacy forms'],
    when: atText, whyNot: () => WHY_CARET,
    menuItems: () => CONTROLS.map(([k, name, d]) => ({ name, title: d, command: 'form-' + k })), run: (app) => menuOf(app, 'form-fields', 'Form Fields') },
  ...CONTROLS.map(([k, name, d]) => ({ id: 'form-' + k, name, title: name + ': ' + d, synonyms: { text: ['Text field', 'TextField', 'Text box field'], check: ['Checkbox', 'CheckBox', 'Tick box'], combo: ['Combo box', 'ChoiceMenu'], list: ['Drop-down list', 'Dropdown', 'Choice list'], date: ['Date picker', 'Date field'] }[k],
    when: atText, whyNot: () => WHY_CARET, run: (app, args) => app.insertControl(k, args || {}) }))
);
Object.assign(methods, {
  // A field at the caret, in hyperref's Form: the one there is (made to reach the caret), or one
  // round the whole text (a document has one Form); hyperref in the same step
  insertControl(kind, o = {}) {
    const c = this.caretNow();
    if (!c) return false;
    const f = c.ghost ? this.ghost.f : c.f, p = c.ghost ? this.ghost.pos : c.b;
    if (this.texAt(f, p)) { this.toast('The caret is in a LaTeX paragraph: write the field there yourself (\\TextField, \\CheckBox, \\ChoiceMenu).'); return false; }
    const main = this.main, msrc = this.src(main);
    const all = [...this.files.values()].filter((t) => typeof t === 'string').join('\n').slice(0, 2e6);
    const t = controlTex(kind, all, { label: o.label, items: o.items, escape: (x) => this.escapeAt(f, p, x) });
    if (!t) return false;
    const edits = [{ f, s: p, e: p, t }];
    const fe = formEdits(msrc, f === main ? p : null);
    if (fe.error) this.toast(fe.error, 8000);
    else edits.push(...fe.map((x) => ({ f: main, ...x })));
    edits.push(...this.packageEdits(['hyperref']));
    // (the caret after the field: the edits before it in its file move it)
    const mine = edits.filter((x) => x.f === f);
    let caret = p;
    for (const x of mine) if (x.s < p || (x.s === p && x !== edits[0])) caret += x.t.length - (x.e - x.s);
    caret += edits[0].t.length;
    this.closeGroup();
    if (c.ghost) this.removeGhost();
    this.commit(edits, { f, p: caret, bias: -1 }, 'insert');
    this.closeGroup();
    return true;
  }
});
