// The References tab's dialogs (batch B9), each Word's own, each writing through one command of
// src/cmd/refs.js (so an agent does the same by the command and its arguments): Caption,
// Cross-reference, Insert Hyperlink and Edit Hyperlink, Bookmark, Mark Index Entry, Index,
// Footnote and Endnote, and the short title of Add Text. The kit's dialog shell: role dialog, its
// title as its name, Close, Escape; on a phone a sheet at the screen's foot that scrolls.

import { dialog } from './kit.js';
import { mk } from './dom.js';
import { labelKey } from '../refsrc.js';

function row(label, field) {
  const r = mk('div', 'ps-row');
  const l = mk('label', 'ps-l', label);
  const inp = field.matches && field.matches('input, select, textarea') ? field : field.querySelector('input, select, textarea');
  if (inp) { if (!inp.id) inp.id = 'rf-' + label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, ''); l.htmlFor = inp.id; }
  r.append(l, field);
  return r;
}
function select(id, name, options, value) {
  const s = mk('select', 'ps-sel');
  s.id = id; s.setAttribute('aria-label', name);
  for (const [v, t] of options) s.add(new Option(t, v));
  if (value != null) s.value = value;
  return s;
}
function text(id, value, o = {}) {
  const i = mk('input', 'ps-text');
  i.id = id; i.type = o.type || 'text'; i.value = value || ''; i.autocomplete = 'off';
  if (o.placeholder) i.placeholder = o.placeholder;
  if (o.mode) i.inputMode = o.mode;
  if (o.code) { i.spellcheck = false; i.classList.add('code'); }
  return i;
}
function check(id, name, on) {
  const box = mk('label', 'ps-check');
  const c = mk('input'); c.type = 'checkbox'; c.id = id; c.checked = !!on;
  box.append(c, mk('span', '', name));
  return { box, c };
}
// OK and Cancel (or the names given); Enter in a field is OK, as in Word's dialogs
function buttons(app, p, ok, okName = 'OK', more = []) {
  const r = mk('div', 'pop-row ps-acts refs-acts');
  const cancel = mk('button', 'btn ghost sm', 'Cancel'); cancel.type = 'button';
  cancel.addEventListener('click', () => app.closePop());
  const b = mk('button', 'btn sm', okName); b.type = 'button';
  b.addEventListener('click', () => { const run = ok(); if (run === false) return; app.closePop(true); if (typeof run === 'function') run(); });
  r.append(...more, mk('span', 'grow'), cancel, b);
  p.append(r);
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=radio]), select')) { e.preventDefault(); b.click(); } });
  return b;
}
const btn = (name, fn, title) => { const b = mk('button', 'btn ghost sm', name); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; };
// Where a dialog opens: under its button, the folded group's button, or the ribbon
export function near(app, ...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.offsetParent) return { anchor: el };
    const g = el && el.closest('.rb-grp'), gb = g && g.querySelector('.rb-gbtn');
    if (gb && gb.offsetParent) return { anchor: gb };
  }
  const r = document.getElementById('ribbon'), q = r ? r.getBoundingClientRect() : { left: 40, bottom: 80 };
  return { rect: { left: q.left + 40, right: q.left + 200, top: q.bottom - 30, bottom: q.bottom, width: 160, height: 30 } };
}
// (focusing the page puts the browser's caret at its start: the kept place goes back in any case)
const back = (app) => {
  const r = app.rbRange;
  app.root.focus({ preventScroll: true });
  if (r && r.startContainer && app.root.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  return app.ribbonAt();
};
// the caret's place, kept while a field of the dialog has the focus, put back for OK (back)
const keep = (app) => { const s = getSelection(); if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange(); };
// a list of choices to pick one from: role listbox, each an option button
function listbox(id, name) { const l = mk('div', 'refs-list'); l.id = id; l.setAttribute('role', 'listbox'); l.setAttribute('aria-label', name); return l; }
function option(list, label, sub, on, pick) {
  const b = mk('button', 'refs-it' + (on ? ' on' : ''));
  b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(!!on));
  b.append(mk('b', '', label));
  if (sub) b.append(mk('small', '', sub));
  b.addEventListener('click', pick);
  list.appendChild(b);
  return b;
}

// ---- Caption ---------------------------------------------------------------------------------------
export function openCaptionDialog(app, at) {
  keep(app);
  const T = app.captionTarget(at);
  if (T.why) { app.toast(T.why); return; }
  const O = app.model.opts, ch = !!O.chapters;
  const p = dialog(app, { title: 'Caption', ...near(app, 'rc-insert-caption'), cls: 'pop-ps pop-refs' });
  const lab = T.kind === 'figure' ? 'Figure' : 'Table';
  const n = (app.model.captions || []).filter((c) => c.kind === T.kind).length + 1;
  const words = text('cap-text', '', { placeholder: 'What it shows' });
  const pre = mk('span', 'cap-pre', lab + ' ' + n + ': ');
  const capRow = mk('div', 'ps-row cap-row');
  const cl = mk('label', 'ps-l', 'Caption'); cl.htmlFor = words.id;
  const wrap = mk('span', 'cap-in'); wrap.append(pre, words);
  capRow.append(cl, wrap);
  const pos = select('cap-pos', 'Position', [['above', 'Above selected item'], ['below', 'Below selected item']], T.kind === 'table' ? 'above' : 'below');
  const key = text('cap-label', labelKey(T.kind === 'figure' ? 'fig:' : 'tab:', '', new Set()), { code: true });
  let keyTyped = false;
  key.addEventListener('input', () => { keyTyped = true; });
  const taken = new Set(app.model.labels.keys());
  words.addEventListener('input', () => { if (!keyTyped) key.value = labelKey(T.kind === 'figure' ? 'fig:' : 'tab:', words.value, taken); });
  key.value = labelKey(T.kind === 'figure' ? 'fig:' : 'tab:', '', taken);
  // (as the preamble numbers them now: \counterwithout in a report is 1, 2, 3; review H3)
  const RR = O.refs || {};
  const within = RR.reset && RR.reset[T.kind] === null ? 'plain' : (RR.within && RR.within[T.kind]) || (ch ? 'chapter' : 'plain');
  const num = select('cap-num', 'Numbering', [['plain', '1, 2, 3'], ...(ch ? [['chapter', '1.1, 1.2 (by chapter)']] : []), ['section', ch ? '1.1.1 (by section)' : '1.1, 1.2 (by section)']], within === 'section' || within === 'chapter' ? within : 'plain');
  const num0 = num.value;
  const lc = check('cap-haslabel', 'A label to refer to it (Cross-reference finds it)', true);
  lc.c.addEventListener('change', () => { key.disabled = !lc.c.checked; });
  p.append(capRow, row('Position', pos), row('Numbering', num), lc.box, row('Label', key));
  p.append(mk('div', 'pop-note', T.mode === 'float' ? 'A \\caption and a \\label in this ' + T.kind + '.' : 'The ' + (T.kind === 'figure' ? 'picture' : 'table') + ' becomes a ' + T.kind + ' (\\begin{' + T.kind + '}[htbp], centred) with its caption.'));
  buttons(app, p, () => {
    // (the numbering written only where it was changed here)
    const args = { text: words.value, position: pos.value, label: lc.c.checked ? key.value.trim() : '' };
    if (num.value !== num0) args.numbering = num.value;
    return () => app.runCommand('insert-caption', args, back(app));
  });
  app.positionPop();
  words.focus();
}

// ---- Cross-reference --------------------------------------------------------------------------------
export function openCrossRefDialog(app, at) {
  keep(app);
  const p = dialog(app, { title: 'Cross-reference', ...near(app, 'ri-xref', 'rr-xref'), cls: 'pop-ps pop-refs' });
  const kinds = [['heading', 'Heading'], ['figure', 'Figure'], ['table', 'Table'], ['equation', 'Equation'], ['label', 'Bookmark (label)']];
  const ty = select('xref-type', 'Reference type', kinds, 'heading');
  const form = select('xref-form', 'Insert reference to', [], null);
  const list = listbox('xref-list', 'For which');
  let pick = null;
  const fillForms = () => {
    const was = form.value;
    form.replaceChildren();
    for (const [v, t] of app.refForms(ty.value)) form.add(new Option(t, v));
    if ([...form.options].some((o) => o.value === was)) form.value = was;
  };
  const draw = () => {
    list.replaceChildren();
    pick = null;
    const items = app.refTargets(ty.value);
    if (!items.length) list.appendChild(mk('div', 'empty', ty.value === 'figure' || ty.value === 'table' ? 'No captions of this kind yet (References › Insert Caption)' : 'None in the document yet'));
    items.slice(0, 500).forEach((it, k) => {
      const b = option(list, it.text, it.key ? it.key : 'a label is added: ' + (it.add ? labelKey(it.add.prefix, it.add.words, new Set(app.model.labels.keys())) : ''), k === 0, () => { pick = it; for (const x of list.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); } });
      if (k === 0) pick = it;
      if (!it.key && !it.add) b.disabled = true;
    });
  };
  ty.addEventListener('change', () => { fillForms(); draw(); });
  fillForms(); draw();
  p.append(row('Reference type', ty), row('Insert reference to', form), mk('div', 'ps-l refs-cap', 'For which'), list);
  buttons(app, p, () => {
    if (!pick) { app.toast('Pick what to refer to'); return false; }
    const args = { target: pick.key || { add: pick.add }, form: form.value, kind: ty.value };
    if (pick.key) args.target = pick.key;
    return () => app.runCommand('cross-reference', args, back(app));
  }, 'Insert');
  app.positionPop();
  ty.focus();
}

// ---- Link --------------------------------------------------------------------------------------------
// L: a link read from the source (a \url clicked), else the link at the caret
export function openLinkDialog(app, at, L, el) {
  keep(app);
  L = L || app.linkAt(at);
  const p = dialog(app, { title: L ? 'Edit Hyperlink' : 'Insert Hyperlink', ...(el ? { anchor: el } : near(app, 'rb-link', 'ri-link')), cls: 'pop-ps pop-refs' });
  const src = L ? app.src(L.f) : '';
  const shown = L ? (L.text ? app.plainOf(L.f, L.text[0], L.text[1]).replace(/\s+/g, ' ').trim() : L.url) : (at && !at.c.collapsed && !at.c.ghost ? getSelection().toString().replace(/\s+/g, ' ').trim() : '');
  const mail = L && /^mailto:/i.test(L.url || '');
  const kind = L ? (L.cmd === 'hyperref' ? 'place' : mail ? 'mail' : 'web') : 'web';
  const group = mk('div', 'refs-seg'); group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Link to');
  const radios = {};
  for (const [v, t] of [['web', 'Web page'], ['mail', 'E-mail address'], ['place', 'Place in this document']]) {
    const l = mk('label', 'ps-check');
    const r = mk('input'); r.type = 'radio'; r.name = 'link-to'; r.value = v; r.id = 'link-to-' + v; r.checked = v === kind;
    l.append(r, mk('span', '', t));
    group.append(l);
    radios[v] = r;
  }
  const words = text('link-text', shown);
  const addr = text('link-url', L && !mail && L.url ? L.url : '', { placeholder: 'https://', mode: 'url', code: true });
  const email = text('link-mail', mail ? L.url.replace(/^mailto:/i, '').replace(/\?.*$/, '') : '', { type: 'email', mode: 'email' });
  const subj = text('link-subject', mail && /\?subject=/.test(L.url) ? decodeURIComponent(L.url.replace(/^.*\?subject=/, '')) : '');
  const places = listbox('link-places', 'Place in this document');
  let place = null;
  const targets = [...app.refTargets('heading'), ...app.refTargets('label').filter((x) => !/^(sec|chap):/.test(x.key || ''))];
  targets.slice(0, 400).forEach((it) => {
    const on = L && L.label && it.key === L.label;
    const b = option(places, it.text, it.key || 'a label is added', on, () => { place = it; for (const x of places.children) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); } if (!words.value.trim()) words.value = it.text.replace(/^[\d.]+ /, ''); });
    if (on) place = it;
  });
  const rows = { web: row('Address', addr), mail: [row('E-mail address', email), row('Subject', subj)], place: places };
  const box = mk('div', 'link-box');
  const show = () => { const v = Object.keys(radios).find((k) => radios[k].checked); box.replaceChildren(...[].concat(rows[v])); };
  for (const r of Object.values(radios)) r.addEventListener('change', show);
  show();
  p.append(group, row('Text to display', words), box);
  const more = [];
  if (L) {
    more.push(btn('Remove Link', () => { app.closePop(true); app.linkRemove(back(app), L); }));
    if (L.url && !mail) more.push(btn('Open', () => app.openLink(L.url), 'Open it in a new tab'), btn('Copy', () => { try { navigator.clipboard.writeText(L.url).then(() => app.toast('Copied ' + L.url)); } catch (e) { app.toast('The browser did not let the page copy it'); } }, 'Copy its address'));
  }
  buttons(app, p, () => {
    const v = Object.keys(radios).find((k) => radios[k].checked);
    const o = { kind: v, text: words.value, link: L || undefined };
    if (v === 'web') o.url = addr.value;
    if (v === 'mail') { o.url = email.value; o.subject = subj.value; }
    if (v === 'place') { if (!place) { app.toast('Pick a place in this document'); return false; } if (place.key) o.label = place.key; else o.target = { add: place.add }; o.url = ''; }
    // (the words unchanged: the link's own source stays as its words)
    if (L && words.value.replace(/\s+/g, ' ').trim() === shown) o.text = null;
    if (!L && words.value.replace(/\s+/g, ' ').trim() === shown && shown) o.text = null;
    return () => app.runCommand('link', o, back(app));
  }, 'OK', more);
  void src;
  app.positionPop();
  (kind === 'web' ? addr : kind === 'mail' ? email : words).focus();
}

// ---- Bookmark -----------------------------------------------------------------------------------------
export function openBookmarkDialog(app, at) {
  keep(app);
  const p = dialog(app, { title: 'Bookmark', ...near(app, 'rc-bookmark'), cls: 'pop-ps pop-refs' });
  const name = text('bm-name', '', { code: true, placeholder: 'sec:intro' });
  const list = listbox('bm-list', 'Bookmarks');
  const sort = select('bm-sort', 'Sort by', [['name', 'Name'], ['place', 'Location']], 'place');
  const draw = () => {
    list.replaceChildren();
    const all = app.labelSpots();
    const items = sort.value === 'name' ? [...all].sort((a, b) => a.key.localeCompare(b.key)) : all;
    if (!items.length) list.appendChild(mk('div', 'empty', 'No bookmarks yet'));
    for (const L of items.slice(0, 500)) option(list, L.key, L.f !== app.main ? L.f : '', L.key === name.value, () => { name.value = L.key; draw(); });
  };
  sort.addEventListener('change', draw);
  name.addEventListener('input', draw);
  const go = btn('Go To', () => { const k = name.value.trim(); app.closePop(true); app.bookmarkGo(k); });
  const del = btn('Delete', () => { app.bookmarkDelete(name.value.trim()); name.value = ''; draw(); }, 'Take the \\label out');
  p.append(row('Bookmark name', name), list, row('Sort by', sort));
  draw();
  buttons(app, p, () => { const k = name.value.trim(); return () => app.runCommand('bookmark', { add: k }, back(app)); }, 'Add', [go, del]);
  app.positionPop();
  name.focus();
}

// ---- Mark Index Entry ------------------------------------------------------------------------------
export function openMarkEntryDialog(app, at) {
  keep(app);
  const p = dialog(app, { title: 'Mark Index Entry', ...near(app, 'rc-mark-entry'), cls: 'pop-ps pop-refs' });
  const sel = at && !at.c.collapsed && !at.c.ghost ? getSelection().toString().replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const main = text('ix-main', sel), sub = text('ix-sub', '');
  const opts = mk('fieldset', 'ps-sec'); opts.append(mk('legend', '', 'Options'));
  const radio = (v, t, on) => { const l = mk('label', 'ps-check'); const r = mk('input'); r.type = 'radio'; r.name = 'ix-opt'; r.value = v; r.id = 'ix-' + v; r.checked = on; l.append(r, mk('span', '', t)); opts.append(l); return r; };
  const cur = radio('page', 'Current page', true);
  const see = radio('see', 'Cross-reference: see', false);
  const seeT = text('ix-see', '', { placeholder: 'another entry' }); seeT.setAttribute('aria-label', 'Cross-reference'); opts.append(seeT);
  const range = radio('range', 'Page range: from the selection\'s start to its end', false);
  if (!sel) range.disabled = true;
  seeT.addEventListener('input', () => { see.checked = true; });
  const fmt = mk('fieldset', 'ps-sec'); fmt.append(mk('legend', '', 'Page number format'));
  const bold = check('ix-bold', 'Bold', false), ital = check('ix-italic', 'Italic', false);
  fmt.append(bold.box, ital.box);
  p.append(row('Main entry', main), row('Subentry', sub), opts, fmt);
  const args = () => ({ main: main.value, sub: sub.value, see: see.checked ? seeT.value : '', range: range.checked, bold: bold.c.checked, italic: ital.c.checked });
  const all = btn('Mark All', () => { const a = { ...args(), all: true, range: false }; app.closePop(true); app.runCommand('mark-entry', a, back(app)); }, 'Every place these words stand in the text');
  buttons(app, p, () => { const a = args(); return () => app.runCommand('mark-entry', a, back(app)); }, 'Mark', [all]);
  void cur;
  app.positionPop();
  main.focus();
}

// ---- Index --------------------------------------------------------------------------------------------
export function openIndexDialog(app) {
  keep(app);
  const p = dialog(app, { title: 'Index', ...near(app, 'rc-insert-index'), cls: 'pop-ps pop-refs' });
  const R = (app.model.opts.refs || {}).index;
  const cols = select('ix-cols', 'Columns', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], String(R ? R.columns : 2));
  if (R && R.pkg === 'makeidx') { cols.disabled = true; cols.title = 'makeidx sets the index in two columns; imakeidx sets any number'; }
  const n = (app.model.indexEntries || []).length;
  p.append(row('Columns', cols), mk('div', 'pop-note', n ? n + ' entr' + (n === 1 ? 'y' : 'ies') + ' marked (References › Mark Entry). TeX runs makeindex for you.' : 'No entries yet: mark them with References › Mark Entry (Alt+Shift+X).'));
  buttons(app, p, () => { const c = +cols.value; return () => app.runCommand('insert-index', { columns: c }, back(app)); });
  app.positionPop();
  cols.focus();
}

// ---- Footnote and Endnote ----------------------------------------------------------------------------
export function openNotesDialog(app) {
  keep(app);
  const p = dialog(app, { title: 'Footnote and Endnote', ...near(app, 'rc-footnote-options'), cls: 'pop-ps pop-refs' });
  const O = app.model.opts, R = O.refs || { fn: { style: 'arabic', start: 1, restart: 'continuous' } }, ch = !!O.chapters;
  // (the document's own format and numbering shown as its own, and kept unless changed: review H4)
  const style = select('fn-format', 'Number format', [...(R.fn.style === 'custom' ? [['custom', 'This document\'s own']] : []), ['arabic', '1, 2, 3'], ['alph', 'a, b, c'], ['Alph', 'A, B, C'], ['roman', 'i, ii, iii'], ['Roman', 'I, II, III'], ['fnsymbol', '*, †, ‡']], R.fn.style);
  const start = text('fn-start', String(R.fn.start || 1), { mode: 'numeric' });
  start.classList.add('ps-num');
  const restart = select('fn-restart', 'Numbering', [['continuous', 'Continuous'], ch ? ['chapter', 'Restart each chapter'] : ['section', 'Restart each section'], ['page', 'Restart each page'],
    ...(/^within-/.test(R.fn.restart) ? [[R.fn.restart, 'Within each ' + R.fn.restart.slice(7) + ': 1.1, 1.2']] : [])], R.fn.restart);
  const s0 = style.value, st0 = String(R.fn.start || 1), r0 = restart.value;
  const conv = select('fn-convert', 'Convert', [['', 'Leave notes as they are'], ['en', 'Convert all footnotes to endnotes'], ['fn', 'Convert all endnotes to footnotes']], '');
  const sec = mk('fieldset', 'ps-sec'); sec.append(mk('legend', '', 'Footnote layout'), row('Number format', style), row('Start at', start), row('Numbering', restart));
  p.append(sec, row('Convert', conv));
  if (R.fn.style === 'custom') p.append(mk('div', 'pop-note', 'This document numbers its footnotes its own way (\\thefootnote): a format picked here replaces it.'));
  buttons(app, p, () => {
    const o = {};
    if (start.value.trim() !== st0) o.start = start.value;
    if (restart.value !== r0) o.restart = restart.value;
    if (style.value !== s0 && style.value !== 'custom') o.style = style.value;
    if (conv.value) o.convert = conv.value;
    if (!Object.keys(o).length) return;
    return () => app.runCommand('footnote-options', o, back(app));
  }, 'Apply');
  app.positionPop();
  style.focus();
}

// ---- Add Text › Text in the Table of Contents ----------------------------------------------------------
export function openShortTitleDialog(app, at) {
  keep(app);
  const h = app.headingAt(at);
  if (!h) return;
  const p = dialog(app, { title: 'Text in the Table of Contents', ...near(app, 'rc-toc-add-text'), cls: 'pop-ps pop-refs' });
  const src = app.src(at.B.f);
  const m = /^\\[A-Za-z]+\s*\[([^\]\n]{0,300})\]/.exec(src.slice(h.s, h.s + 400));
  const inp = text('toc-short', m ? m[1] : '');
  p.append(row('Short title', inp), mk('div', 'pop-note', 'The contents and the running heads show it; the heading keeps its words. Empty: the heading\'s own.'));
  buttons(app, p, () => { const v = inp.value.trim(); return () => { back(app); app.shortTitle(at, v ? app.escapeAt(at.B.f, h.s, v) : ''); }; });
  app.positionPop();
  inp.focus();
}
