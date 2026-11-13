// Word's Find and Replace dialog: three tabs, Find, Replace and Go To. It stays open while the
// page is worked on (it is no popover: a press on the page does not close it), named by its title
// with a Close button, Escape closes it and leaves the hit it showed selected on the page, as
// Word does. On a phone it is a sheet at the window's foot. Every field and button is named; the
// document's text reaches it only as text (the search box's own, a label's key in the list).

import { $, mk } from './dom.js';
import { openMenu } from './kit.js';
import { FORMATS, FMT } from '../find.js';

const OPTS = [['matchCase', 'Match case'], ['wholeWord', 'Find whole words only'], ['wildcards', 'Use wildcards'], ['regex', 'Use regular expressions'], ['source', 'In LaTeX source'], ['insel', 'In selection']];
const WHAT = [['page', 'Page'], ['section', 'Section'], ['footnote', 'Footnote'], ['equation', 'Equation'], ['figure', 'Figure'], ['table', 'Table'], ['comment', 'Comment'], ['label', 'Label']];
const SPECIAL = [['^?', 'Any character'], ['^#', 'Any digit'], ['^$', 'Any letter'], ['^w', 'White space'], ['^s', 'Nonbreaking space'], ['^=', 'En dash'], ['^+', 'Em dash'], ['^^', 'Caret character'], ['^&', 'Find what text (in Replace with)']];
const WILD = [['?', 'Any character'], ['*', 'Any run of characters'], ['@', 'One or more of the one before'], ['{2,4}', 'From 2 to 4 of the one before'], ['[a-z]', 'One of these characters'], ['[!a-z]', 'Not one of these'], ['<', 'Beginning of a word'], ['>', 'End of a word'], ['()', 'A group, \\1 in Replace with']];

function el(tag, cls, text) { return mk(tag, cls, text); }
function field(id, label, type = 'text') {
  const l = el('label', 'fr-f');
  const s = el('span', 'fr-l', label);
  const i = el('input');
  i.type = type; i.id = id; i.autocomplete = 'off'; i.spellcheck = false;
  // (named outright: a label around a field reads its value into the name)
  i.setAttribute('aria-label', label);
  l.append(s, i);
  return { l, i, s };
}
function button(label, cls, title) { const b = el('button', 'btn ' + (cls || 'ghost sm'), label); b.type = 'button'; b.setAttribute('aria-label', label); if (title) b.title = title; return b; }

// The dialog, made once and kept
function build(app) {
  const d = el('div', 'fr');
  d.id = 'fr';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'fr-title');
  d.hidden = true;
  const head = el('div', 'fr-head');
  const title = el('span', '', 'Find and Replace');
  title.id = 'fr-title';
  const x = el('button', 'pop-x');
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
  head.append(title, x);
  const tabs = el('div', 'fr-tabs');
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Find and Replace');
  const T = {};
  for (const [id, name] of [['find', 'Find'], ['replace', 'Replace'], ['goto', 'Go To']]) {
    const t = el('button', 'fr-tab', name);
    t.type = 'button'; t.id = 'fr-t-' + id; t.setAttribute('role', 'tab'); t.dataset.tab = id;
    t.setAttribute('aria-controls', id === 'goto' ? 'fr-p-goto' : 'fr-p-find');
    tabs.append(t); T[id] = t;
  }
  // Find and Replace share one panel: Replace adds its field and buttons
  const pf = el('div', 'fr-panel');
  pf.id = 'fr-p-find'; pf.setAttribute('role', 'tabpanel');
  const q = field('fr-q', 'Find what'), r = field('fr-r', 'Replace with');
  r.l.classList.add('fr-rep');
  const fmt = el('div', 'fr-fmt');
  fmt.hidden = true;
  const opts = el('div', 'fr-opts');
  opts.setAttribute('role', 'group'); opts.setAttribute('aria-label', 'Search options');
  const O = {};
  for (const [k, name] of OPTS) {
    const l = el('label', 'fr-o');
    const c = el('input'); c.type = 'checkbox'; c.dataset.o = k;
    l.append(c, document.createTextNode(' ' + name));
    opts.append(l); O[k] = c;
  }
  const row = el('div', 'fr-row');
  const bFmt = button('Format', 'ghost sm fr-menu', 'Find text with this formatting: bold, italic, a heading level, a footnote');
  const bSpec = button('Special', 'ghost sm fr-menu', 'Word\'s codes: any character, any digit, white space; with wildcards their signs');
  const bNoFmt = button('No formatting', 'ghost sm', 'Find text whatever its formatting');
  for (const b of [bFmt, bSpec]) { b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg>'); }
  row.append(bFmt, bSpec, bNoFmt);
  const st = el('div', 'fr-st');
  st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
  const btns = el('div', 'fr-btns');
  // (named "Replace one": Home's Replace, which opens this dialog, keeps the name "Replace", so an
  // agent finds each by its name alone; the visible word is Word's)
  const bRep = button('Replace', 'ghost sm fr-rep', 'Replace the result shown, then show the next (Enter in Replace with)');
  bRep.setAttribute('aria-label', 'Replace one');
  const bAll = button('Replace All', 'ghost sm fr-rep', 'Replace every result at once: one undo takes it all back');
  const bPrev = button('Find Previous', 'ghost sm', 'The result before (Shift+Enter)');
  const bNext = button('Find Next', 'sm', 'The next result (Enter)');
  btns.append(bRep, bAll, el('span', 'grow'), bPrev, bNext);
  pf.append(q.l, fmt, r.l, opts, row, st, btns);
  // Go To
  const pg = el('div', 'fr-panel');
  pg.id = 'fr-p-goto'; pg.setAttribute('role', 'tabpanel'); pg.setAttribute('aria-labelledby', 'fr-t-goto'); pg.hidden = true;
  const wl = el('label', 'fr-f');
  const what = el('select');
  what.id = 'fr-what';
  what.setAttribute('aria-label', 'Go to what');
  for (const [v, n] of WHAT) what.add(new Option(n, v));
  wl.append(el('span', 'fr-l', 'Go to what'), what);
  const n = field('fr-n', 'Enter page number');
  const list = el('datalist');
  list.id = 'fr-list';
  n.i.setAttribute('list', 'fr-list');
  const hint = el('p', 'hint', 'Enter + and - to move from where you are: +2 goes two on. Empty, Previous and Next go one at a time.');
  const gst = el('div', 'fr-st');
  gst.setAttribute('role', 'status'); gst.setAttribute('aria-live', 'polite');
  const gb = el('div', 'fr-btns');
  const bGPrev = button('Previous', 'ghost sm'), bGo = button('Next', 'sm');
  gb.append(el('span', 'grow'), bGPrev, bGo);
  pg.append(wl, n.l, list, hint, gst, gb);
  d.append(head, tabs, pf, pg);
  document.body.append(d);

  const D = { d, T, pf, pg, q: q.i, r: r.i, fmt, O, st, gst, what, n: n.i, nl: n.s, list, bGo, bGPrev, bFmt, bSpec, bNoFmt };
  app.fr = D;

  // ---- what each part does
  x.addEventListener('click', () => closeFindDialog(app));
  d.addEventListener('mousedown', (e) => { if (!e.target.closest('input, select, label')) e.preventDefault(); });
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFindDialog(app); }
  });
  tabs.addEventListener('click', (e) => { const t = e.target.closest('[role=tab]'); if (t) selectTab(app, t.dataset.tab, true); });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = Object.values(T), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const to = all[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    selectTab(app, to.dataset.tab, true);
    to.focus();
  });
  let qt = 0;
  q.i.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => app.findSet({ q: q.i.value }), 180); });
  q.i.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(qt);
    if (app.findState().q !== q.i.value) app.findSet({ q: q.i.value });
    app.findGo(e.shiftKey ? -1 : 1);
  });
  r.i.addEventListener('input', () => { app.findState().rep = r.i.value; });
  r.i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.findState().rep = r.i.value; app.replaceOne(); } });
  for (const [k] of OPTS) O[k].addEventListener('change', () => {
    const o = { [k]: O[k].checked };
    if (k === 'insel' && O[k].checked && !app.findState().sel) { O[k].checked = false; return; }
    app.findSet({ o });
  });
  bNext.addEventListener('click', () => { if (app.findState().q !== q.i.value) app.findSet({ q: q.i.value }); app.findGo(1); });
  bPrev.addEventListener('click', () => { if (app.findState().q !== q.i.value) app.findSet({ q: q.i.value }); app.findGo(-1); });
  bRep.addEventListener('click', () => { const fs = app.findState(); fs.rep = r.i.value; if (fs.q !== q.i.value) app.findSet({ q: q.i.value }); app.replaceOne(); });
  bAll.addEventListener('click', () => { const fs = app.findState(); fs.rep = r.i.value; if (fs.q !== q.i.value) app.findSet({ q: q.i.value }); app.replaceAll(); });
  bNoFmt.addEventListener('click', () => app.findSet({ o: { fmt: 0 } }));
  bFmt.addEventListener('click', () => {
    const fs = app.findState();
    const items = FORMATS.map((f) => ({ name: f.name, title: f.cmd, checked: !!(fs.o.fmt & FMT[f.id]), run: () => { app.findSet({ o: { fmt: fs.o.fmt ^ FMT[f.id] } }); q.i.focus(); } }));
    openMenu(app, bFmt, items, { label: 'Format' });
  });
  bSpec.addEventListener('click', () => {
    const fs = app.findState(), into = document.activeElement === r.i || D.lastField === r.i ? r.i : q.i;
    const list = fs.o.wildcards ? WILD : SPECIAL;
    const items = list.map(([code, name]) => ({ name, keys: code, run: () => insertCode(app, into, code) }));
    openMenu(app, bSpec, items, { label: 'Special' });
  });
  q.i.addEventListener('focus', () => { D.lastField = q.i; });
  r.i.addEventListener('focus', () => { D.lastField = r.i; });
  // Go To: the field's label says what it asks for; with something in it the button goes there
  const label = () => {
    const k = what.value;
    D.nl.textContent = k === 'label' ? 'Enter label' : 'Enter ' + WHAT.find((w) => w[0] === k)[1].toLowerCase() + ' number';
    n.i.setAttribute('aria-label', D.nl.textContent);
    list.replaceChildren();
    if (k === 'label' || k === 'section') {
      for (const t of app.goToTargets(k).slice(0, 500)) {
        const o = document.createElement('option');
        o.value = t.num || '';
        if (t.text) o.label = t.text;
        list.append(o);
      }
    }
    goLabel();
  };
  const goLabel = () => { const v = n.i.value.trim(); bGo.textContent = v ? 'Go To' : 'Next'; bGo.setAttribute('aria-label', bGo.textContent); bGPrev.disabled = !!v; };
  what.addEventListener('change', label);
  n.i.addEventListener('input', goLabel);
  // (the place gone to is kept for when the dialog closes; the focus stays in the dialog, as in Word)
  const go = (dir) => {
    const back = document.activeElement;
    const r2 = app.goToTarget(what.value, n.i.value, dir);
    gst.textContent = r2.msg;
    gst.classList.toggle('bad', !r2.ok);
    const sel = getSelection();
    if (r2.ok && sel.rangeCount && app.root.contains(sel.anchorNode)) app.rbRange = sel.getRangeAt(0).cloneRange();
    app.pageStatus();
    if (back && D.d.contains(back)) back.focus({ preventScroll: true });
  };
  n.i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(1); } });
  bGo.addEventListener('click', () => go(1));
  bGPrev.addEventListener('click', () => go(-1));
  D.label = label;
  // dragged by its head, out of the way of the text
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || window.innerWidth < 640) return;
    const R = d.getBoundingClientRect(), x0 = e.clientX - R.left, y0 = e.clientY - R.top;
    const move = (ev) => { d.style.left = Math.max(0, Math.min(window.innerWidth - R.width, ev.clientX - x0)) + 'px'; d.style.top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - y0)) + 'px'; d.style.right = 'auto'; };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  return D;
}

function insertCode(app, input, code) {
  const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
  input.value = input.value.slice(0, a) + code + input.value.slice(b);
  input.focus();
  input.setSelectionRange(a + code.length - (code === '()' ? 1 : 0), a + code.length - (code === '()' ? 1 : 0));
  input.dispatchEvent(new Event('input'));
}

function selectTab(app, tab, focus) {
  const D = app.fr;
  D.tab = tab;
  for (const [id, t] of Object.entries(D.T)) { const on = id === tab; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; t.classList.toggle('on', on); }
  D.pf.hidden = tab === 'goto';
  D.pg.hidden = tab !== 'goto';
  D.pf.setAttribute('aria-labelledby', 'fr-t-' + (tab === 'goto' ? 'find' : tab));
  D.d.classList.toggle('fr-replace', tab === 'replace');
  if (tab === 'goto') { D.label(); if (focus) D.n.focus(); }
  else if (focus) { D.q.focus(); D.q.select(); }
}

// Opens the dialog on a tab: the words selected on the page (a few, on one line) become what
// is looked for; a longer selection is offered as the place to look in (In selection)
export function openFindDialog(app, tab = 'find') {
  const D = app.fr || build(app);
  const fs = app.findState();
  const s = getSelection();
  const c = app.caretNow();
  if (s.rangeCount && app.root.contains(s.anchorNode)) app.rbRange = s.getRangeAt(0).cloneRange();
  if (c && !c.collapsed && !c.ghost && c.f != null && tab !== 'goto') {
    // (a few words are what to find; more, a sentence or a paragraph, are where to look; either
    // way the selection can be ticked as the place, and it follows the edits made in it)
    const words = String(s).trim();
    fs.sel = { f: c.f, a: c.a, b: c.b };
    (fs.snap = fs.snap || new Map()).set(c.f, app.src(c.f));
    if (words && words.length <= 32 && !/\n/.test(words) && words.split(/\s+/).length <= 4) { D.q.value = words; fs.q = words; fs.o.insel = false; }
    else fs.o.insel = true;
  } else if (tab !== 'goto') { fs.sel = null; fs.o.insel = false; }
  D.q.value = fs.q;
  D.r.value = fs.rep;
  D.d.hidden = false;
  document.body.classList.add('fr-on');
  selectTab(app, tab, true);
  if (tab !== 'goto') { fs.on = true; app.findRun(); }
  findDialogSync(app);
}

export function closeFindDialog(app) {
  const D = app.fr;
  if (!D || D.d.hidden) return;
  D.d.hidden = true;
  document.body.classList.remove('fr-on');
  // the hit shown stays selected; the marks go unless the Navigation pane's box still searches
  const fs = app.findState();
  const keep = app.navOpen && app.navOpen('outline') && app.nv && app.nv.q.value;
  if (D.tab !== 'goto' && fs.hits[fs.cur]) app.findSelectCur(); else app.ribbonBack();
  if (!keep) app.findClear();
}

// What the dialog shows from the search's state: the options, the format, the count
export function findDialogSync(app) {
  const D = app.fr;
  if (!D || D.d.hidden) return;
  const fs = app.findState();
  for (const [k] of OPTS) D.O[k].checked = !!fs.o[k];
  D.O.insel.disabled = !fs.sel;
  D.O.insel.parentElement.classList.toggle('off', !fs.sel);
  const src = !!fs.o.source;
  D.bFmt.disabled = src;
  const names = FORMATS.filter((f) => fs.o.fmt & FMT[f.id]).map((f) => f.name);
  D.fmt.hidden = !names.length || src;
  D.fmt.textContent = 'Format: ' + names.join(', ');
  D.bNoFmt.disabled = !names.length;
  const t = app.findSummary();
  if (D.st.textContent !== t) D.st.textContent = t;
  D.st.classList.toggle('bad', !!fs.msg && !fs.hits.length);
}
