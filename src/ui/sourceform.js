// Sources (batch B9): Word's Create Source form, writing a correct entry into the project's .bib
// file, and its Source Manager (cite, edit, copy, delete; BibTeX pasted in). An entry written by
// hand is read where it stands and changed field by field (src/bib.js bibFieldEdits): a field
// left as it was is never written again, so the file keeps its own bytes, its order, its
// comments and its way of writing (braces or quotes, padding, commas).

import { dialog } from './kit.js';
import { mk } from './dom.js';
import { near } from './refsdialog.js';
import { parseBib, bibSpans, SOURCE_TYPES, FIELD_NAMES, MORE_FIELDS, bibEscape, bibKey, bibEntryText, bibFieldEdits, bibDeleteEdit, bibAppendEdit, texToPlain, shortAuthors, entryYear } from '../bib.js';
import { stripComments } from '../preamble.js';

const KEY = /^[A-Za-z0-9_:.\-+/]{1,80}$/;
const MAX_BIB = 4000000;

// The .bib files of the project, those the document reads first (\bibliography,
// \addbibresource in any .tex file): [{ name, used }]
export function sourceFiles(app) {
  const named = [];
  for (const [n, t] of app.files) {
    if (!/\.(tex|ltx)$/i.test(n)) continue;
    const s = stripComments(t.slice(0, 2000000));
    for (let re = /\\(?:bibliography|addbibresource)\s*(?:\[[^\]\n]{0,200}\])?\s*\{([^{}\n]{1,500})\}/g, m, k = 0; (m = re.exec(s)) && k < 200; k++)
      for (const b of m[1].split(',')) { const x = b.trim(); const f = [x, x + '.bib'].find((c) => app.files.has(c)) || (x ? (/\.bib$/i.test(x) ? x : x + '.bib') : null); if (f && !named.includes(f)) named.push(f); }
  }
  const out = named.map((name) => ({ name, used: true }));
  for (const n of app.files.keys()) if (/\.bib$/i.test(n) && !named.includes(n)) out.push({ name: n, used: false });
  return out;
}
// Every entry of those files: [{ key, type, fields, file, s, e, used }]
export function allSources(app) {
  const out = [], seen = new Set();
  for (const F of sourceFiles(app)) {
    const t = app.src(F.name);
    if (!t || t.length > MAX_BIB) continue;
    for (const e of parseBib(t, F.name).values()) { if (seen.has(e.key)) continue; seen.add(e.key); out.push({ ...e, used: F.used }); }
  }
  return out;
}
const nameOf = (type) => (SOURCE_TYPES.find((x) => x[0] === type) || [type, type])[1];
const fieldsOf = (type) => (SOURCE_TYPES.find((x) => x[0] === type) || SOURCE_TYPES[SOURCE_TYPES.length - 1])[2];
const label = (e) => (shortAuthors(e) || e.key) + ' ' + (entryYear(e) || '');
// an address as a .bib field holds it: spaces, braces and backslashes encoded, % and # escaped
// (url.sty and biblatex read a .bib's url as it is written: % and # stay bare, review L4; an address
// an earlier Rikuy wrote with \# and \% is read back without them, review M8)
const urlField = (u) => String(u).trim().replace(/\\([%#&_~])/g, '$1').replace(/[\\{}\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

// A new source, by the form or by an agent: { type, fields: { name: typed text }, key, cite }.
// The entry goes at the end of the first .bib the document reads (refs.bib, and the
// bibliography's lines, where it reads none), and a citation of it at the caret: one step.
export function addSource(app, o, at) {
  if (app.bibWhyNot()) { app.toast(app.bibWhyNot()); return false; }
  const B = app.bibState();
  const want = SOURCE_TYPES.some((x) => x[0] === o.type) ? o.type : 'misc';
  const type = want === 'online' && !B.biblatex ? 'misc' : want;
  const fields = {};
  for (const [k, v] of Object.entries(o.fields || {})) {
    if (!/^[a-z][a-z0-9_-]{0,30}$/.test(k) || !String(v ?? '').trim()) continue;
    fields[k] = k === 'url' ? urlField(v) : bibEscape(String(v).trim());
  }
  // (a web site in BibTeX: @misc, its site as howpublished, the day it was read as a note)
  if (want === 'online' && type === 'misc') {
    if (fields.organization) { fields.howpublished = fields.organization; delete fields.organization; }
    if (fields.urldate) { fields.note = 'Accessed ' + fields.urldate; delete fields.urldate; }
  }
  if (!fields.title && !fields.author) { app.toast('A source needs at least its author or its title'); return false; }
  const taken = new Set(allSources(app).map((e) => e.key));
  if (o.key && (!KEY.test(o.key) || taken.has(o.key))) { app.toast(taken.has(o.key) ? 'A source has that tag already: pick another' : 'A tag: letters, digits and : - _ . / + only'); return false; }
  const key = o.key || bibKey(fields, taken);
  const w = app.refsWork();
  const had = sourceFiles(app);
  const citeAt = o.cite !== false && at && !at.cell && /^(p|h|fn|cap|li|)$/.test(at.ctx || '') ? app.refsSpot(at) : null;
  const m = citeAt ? w.mark(citeAt.f, citeAt.p, -1) : null;
  // (no bibliography yet: its lines first, natbib's with refs.bib, so the entry is cited from it)
  if (!app.bibAt()) app.bibInsert(null, w, 'end');
  const file = had.length ? had[0].name : 'refs.bib';
  w.apply(file, [bibAppendEdit(w.src(file), bibEntryText(type, key, fields, /\r\n/.test(w.src(file).slice(0, 4000)) ? '\r\n' : '\n'))]);
  let caret = null;
  if (citeAt) {
    const cmd = app.citeChoices()[0][0], t = citeAt.pre + '\\' + cmd + '{' + key + '}';
    w.apply(citeAt.f, [{ s: m.p, e: m.p, t }]);
    caret = { f: citeAt.f, p: m.p + t.length, bias: 1 };
  }
  w.commit(caret, 'insert');
  return key;
}

// An entry changed: { type, fields: { name: text as shown or typed } }; the fields shown as they
// were are left alone
export function editSource(app, key, o, shown) {
  const E = allSources(app).find((e) => e.key === key);
  if (!E) return false;
  const ch = {};
  if (o.type && o.type !== E.type) ch['@type'] = o.type;
  for (const [k, v] of Object.entries(o.fields || {})) {
    const was = shown && Object.prototype.hasOwnProperty.call(shown, k) ? shown[k] : '';
    if (String(v ?? '') === String(was)) continue;
    const t = String(v ?? '').trim();
    // (a field the form showed as the .bib holds it is LaTeX: written as typed, never escaped again;
    // only text typed into an empty field is escaped, review H1)
    if (t && was && !balanced(t)) { app.toast('The braces of ' + k + ' do not balance: nothing written'); return false; }
    ch[k] = !t ? '' : k === 'url' ? urlField(t) : was ? t : bibEscape(t);
  }
  const ed = bibFieldEdits(app.src(E.file), E, ch);
  if (!ed.length) return true;
  const w = app.refsWork();
  w.apply(E.file, ed);
  return w.commit(null, 'format');
}
const balanced = (t) => { let d = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '\\') { i++; continue; } if (t[i] === '{') d++; else if (t[i] === '}' && --d < 0) return false; } return d === 0; };
// the keys another entry builds on (crossref, xref, xdata): deleting one breaks BibTeX's run (review M6)
const builtOn = (all) => { const out = new Set(); for (const e of all) for (const k of ['crossref', 'xref', 'xdata']) if (e.fields[k]) for (const x of String(e.fields[k]).split(',')) out.add(x.trim()); return out; };
// What the form shows of a field: what is between its braces or quotes, or the value as written
export function shownFields(app, E) {
  const sp = bibSpans(app.src(E.file), E);
  const out = {};
  if (sp) for (const f of sp.fields) out[f.name] = app.src(E.file).slice(f.q ? f.is : f.vs, f.q ? f.ie : f.ve);
  return out;
}

// ---- the form ------------------------------------------------------------------------------------
// Create Source (o.at: the caret, cited there) or Edit Source (o.key)
export function openSourceForm(app, o = {}) {
  const E = o.key ? allSources(app).find((e) => e.key === o.key) : null;
  const shown = E ? shownFields(app, E) : {};
  const p = dialog(app, { title: E ? 'Edit Source' : 'Create Source', ...near(app, 'rc-add-source', 'rc-manage-sources'), cls: 'pop-ps pop-refs pop-src' });
  const B = app.bibState();
  let type = E ? E.type : 'article';
  const top = mk('div', 'ps-row');
  const tl = mk('label', 'ps-l', 'Type of source');
  const ts = mk('select', 'ps-sel'); ts.id = 'src-type';
  tl.htmlFor = ts.id;
  for (const [v, n] of SOURCE_TYPES) if (v !== 'online' || B.biblatex || !E) ts.add(new Option(n, v));
  if (E && ![...ts.options].some((x) => x.value === E.type)) ts.add(new Option(E.type, E.type));
  ts.value = type;
  top.append(tl, ts);
  const box = mk('div', 'src-fields');
  const allBox = mk('label', 'ps-check');
  const all = mk('input'); all.type = 'checkbox'; all.id = 'src-all';
  allBox.append(all, mk('span', '', 'Show all bibliography fields'));
  const keyRow = mk('div', 'ps-row');
  const kl = mk('label', 'ps-l', 'Tag name');
  const ki = mk('input', 'ps-text'); ki.id = 'src-key'; ki.autocomplete = 'off'; ki.spellcheck = false;
  kl.htmlFor = ki.id;
  ki.value = E ? E.key : '';
  if (E) { ki.readOnly = true; ki.title = 'A source\'s tag is how the text cites it: it stays'; }
  keyRow.append(kl, ki);
  let keyTyped = !!E;
  ki.addEventListener('input', () => { keyTyped = true; });
  const cite = mk('label', 'ps-check');
  const ci = mk('input'); ci.type = 'checkbox'; ci.id = 'src-cite'; ci.checked = !E && !!o.at;
  cite.append(ci, mk('span', '', 'Cite it here'));
  const vals = {};
  const draw = () => {
    for (const inp of box.querySelectorAll('input, textarea')) vals[inp.dataset.f] = inp.value;
    box.replaceChildren();
    const names = [...fieldsOf(type)];
    for (const k of Object.keys(shown)) if (!names.includes(k)) names.push(k);
    if (all.checked) for (const k of MORE_FIELDS) if (!names.includes(k)) names.push(k);
    for (const k of names) {
      const r = mk('div', 'ps-row');
      const l = mk('label', 'ps-l', FIELD_NAMES[k] || k);
      // (a value over several lines in a box that keeps its lines: an input drops them, review H1)
      const multi = /\n/.test(shown[k] || '');
      const i = mk(multi ? 'textarea' : 'input', multi ? 'ps-ta' : 'ps-text'); i.id = 'src-f-' + k; i.dataset.f = k; i.autocomplete = 'off';
      if (multi) i.rows = Math.min(4, (shown[k].match(/\n/g) || []).length + 1);
      l.htmlFor = i.id;
      i.value = vals[k] ?? shown[k] ?? '';
      if (k === 'author' || k === 'editor') i.placeholder = 'Last, First and Last, First';
      if (k === 'year') i.inputMode = 'numeric';
      if (k === 'url') { i.inputMode = 'url'; i.placeholder = 'https://'; }
      i.addEventListener('input', () => { if (!keyTyped && !E) ki.value = bibKey({ author: field('author'), year: field('year'), title: field('title') }, new Set(allSources(app).map((x) => x.key))); });
      r.append(l, i);
      box.appendChild(r);
    }
  };
  const field = (k) => { const i = box.querySelector('[data-f="' + k + '"]'); return i ? i.value : vals[k] || ''; };
  ts.addEventListener('change', () => { type = ts.value; draw(); });
  all.addEventListener('change', draw);
  draw();
  const acts = mk('div', 'pop-row ps-acts');
  const cancel = mk('button', 'btn ghost sm', 'Cancel'); cancel.type = 'button';
  const ok = mk('button', 'btn sm', 'OK'); ok.type = 'button';
  acts.append(mk('span', 'grow'), cancel, ok);
  p.append(top, box, allBox, keyRow);
  if (!E && o.at) p.append(cite);
  p.append(acts);
  const note = mk('div', 'pop-note', 'Written to ' + ((sourceFiles(app)[0] || {}).name || 'refs.bib') + (E ? '' : ' as an @entry; LaTeX in a field is kept as it is'));
  p.insertBefore(note, acts);
  cancel.addEventListener('click', () => app.closePop());
  ok.addEventListener('click', () => {
    const fields = {};
    for (const inp of box.querySelectorAll('input, textarea')) fields[inp.dataset.f] = inp.value;
    const at = o.at;
    app.closePop(true);
    if (E) editSource(app, E.key, { type, fields }, shown);
    else addSource(app, { type, fields, key: keyTyped ? ki.value.trim() : '', cite: ci.checked }, at);
    if (o.back) openSourceManager(app);
  });
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); ok.click(); } });
  app.positionPop();
  const first = box.querySelector('input');
  if (first) first.focus();
  return p;
}

// ---- the Source Manager -------------------------------------------------------------------------
export function openSourceManager(app) {
  const at = app.ribbonAt();
  const p = dialog(app, { title: 'Source Manager', ...near(app, 'rc-manage-sources'), cls: 'pop-ps pop-refs pop-srcm' });
  const search = mk('input', 'ps-text'); search.type = 'search'; search.id = 'srcm-search'; search.placeholder = 'Search: author, title, tag'; search.setAttribute('aria-label', 'Search sources');
  const list = mk('div', 'refs-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Sources'); list.id = 'srcm-list';
  const prev = mk('div', 'pop-note src-prev');
  const acts = mk('div', 'pop-row ps-acts refs-acts');
  const btn = (name, fn, title) => { const b = mk('button', 'btn ghost sm', name); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; };
  let sel = null;
  const cited = new Set(app.model.cites || []);
  const citeB = btn('Cite', () => { const k = sel; app.closePop(true); if (k && at) { const sp = app.refsSpot(at); if (sp) { const w = app.refsWork(), t = sp.pre + '\\' + app.citeChoices()[0][0] + '{' + k + '}'; w.apply(sp.f, [{ s: sp.p, e: sp.p, t }]); w.commit({ f: sp.f, p: sp.p + t.length, bias: 1 }); } } }, 'A citation of it at the caret');
  const editB = btn('Edit…', () => { if (sel) openSourceForm(app, { key: sel, back: true }); });
  const copyB = btn('Copy', () => { const E = allSources(app).find((e) => e.key === sel); if (!E) return; const t = app.src(E.file).slice(E.s, E.e); try { navigator.clipboard.writeText(t).then(() => app.toast('Copied @' + E.type + '{' + E.key + '}')); } catch (e) { app.toast('The browser did not let the page copy it'); } }, 'Its BibTeX to the clipboard');
  const delB = btn('Delete', () => {
    const E = allSources(app).find((e) => e.key === sel);
    if (!E) return;
    const w = app.refsWork();
    w.apply(E.file, [bibDeleteEdit(app.src(E.file), E)]);
    w.commit(null, 'format');
    sel = null;
    draw();
  });
  const newB = btn('New…', () => openSourceForm(app, { at, back: true }));
  if (!at) citeB.hidden = true;
  acts.append(newB, citeB, editB, copyB, delB);
  const paste = mk('details', 'src-paste');
  const sum = mk('summary', '', 'Paste BibTeX');
  const ta = mk('textarea', 'ps-ta'); ta.id = 'srcm-paste'; ta.rows = 4; ta.setAttribute('aria-label', 'BibTeX to add'); ta.placeholder = '@article{key, author = {…}, title = {…}, …}'; ta.spellcheck = false;
  const addB = btn('Add', () => {
    const t = ta.value.slice(0, 1000000);
    const got = [...parseBib(t, 'paste').values()];
    const taken = new Set(allSources(app).map((e) => e.key));
    const fresh = got.filter((e) => !taken.has(e.key) && KEY.test(e.key));
    if (!fresh.length) { app.toast(got.length ? 'Every one of them is a source already' : 'No BibTeX entry in what was pasted'); return; }
    const w = app.refsWork();
    const had = sourceFiles(app);
    if (!app.bibAt()) app.bibInsert(null, w, 'end');
    const file = had.length ? had[0].name : 'refs.bib';
    const nl = /\r\n/.test(w.src(file).slice(0, 4000)) ? '\r\n' : '\n';
    w.apply(file, [bibAppendEdit(w.src(file), fresh.map((e) => t.slice(e.s, e.e).trim() + nl).join(nl))]);
    w.commit(null, 'insert');
    ta.value = '';
    app.toast('Added ' + fresh.length + ' source' + (fresh.length === 1 ? '' : 's') + (got.length > fresh.length ? '; ' + (got.length - fresh.length) + ' had a tag in use' : ''));
    draw();
  }, 'Add the entries pasted: those whose tag is new');
  paste.append(sum, ta, addB);
  p.append(search, list, prev, acts, paste);
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const all = allSources(app);
    list.replaceChildren();
    const hits = all.filter((e) => !q || (e.key + ' ' + label(e) + ' ' + texToPlain(e.fields.title || '')).toLowerCase().includes(q)).slice(0, 300);
    if (!all.length) list.appendChild(mk('div', 'empty', 'No sources yet. New… writes the first one.'));
    for (const e of hits) {
      const b = mk('button', 'refs-it' + (e.key === sel ? ' on' : ''));
      b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(e.key === sel));
      b.append(mk('b', '', label(e)), mk('span', '', texToPlain(e.fields.title || '').replace(/[{}]/g, '') || e.key), mk('small', '', (cited.has(e.key) ? '✓ cited · ' : '') + nameOf(e.type) + ' · ' + e.key));
      b.addEventListener('click', () => { sel = e.key; draw(); });
      b.addEventListener('dblclick', () => { sel = e.key; editB.click(); });
      list.appendChild(b);
    }
    const E = all.find((e) => e.key === sel);
    prev.textContent = E ? app.src(E.file).slice(E.s, Math.min(E.e, E.s + 600)) : 'Pick a source to cite, edit, copy or delete it.';
    for (const b of [citeB, editB, copyB, delB]) b.disabled = !E;
    const used = builtOn(all);
    delB.disabled = !E || cited.has(E.key) || used.has(E.key);
    delB.title = E && cited.has(E.key) ? 'The text cites it: take its citations out first' : E && used.has(E.key) ? 'Another entry builds on it (crossref): BibTeX needs it' : 'Take the entry out of its .bib file';
  };
  search.addEventListener('input', draw);
  draw();
  app.positionPop();
  search.focus();
  return p;
}
