// The Spelling pane (F7), Word's: one word the dictionary does not know at a time, in its
// sentence (with grammar on, Harper's issues too, in their place among them: src/cmd/proofing.js),
// sentence, with Hunspell's suggestions and Ignore Once, Ignore All, Add to Dictionary, Change
// and Change All. It stays open while the page is worked on (as Find and Replace does: a press on
// the page does not close it), follows the edits, and on a phone is a sheet at the window's foot
// with 44 px buttons. The document's words reach it as text only.

import { mk } from './dom.js';
import { DICT_NAME } from '../spell/words.js';

function button(label, cls, title) { const b = mk('button', 'btn ' + (cls || 'ghost sm'), label); b.type = 'button'; b.setAttribute('aria-label', label); if (title) b.title = title; return b; }

function build(app) {
  const d = mk('div', 'fr sp-pane');
  d.id = 'sp-pane';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'sp-title');
  d.hidden = true;
  const head = mk('div', 'fr-head');
  const title = mk('span', '', 'Spelling');
  title.id = 'sp-title';
  const x = mk('button', 'pop-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
  head.append(title, x);
  const lab = mk('div', 'sp-lab');
  const ctx = mk('div', 'sp-ctx');
  ctx.setAttribute('aria-live', 'polite');
  const sl = mk('div', 'sp-sl', 'Suggestions');
  const list = mk('div', 'sp-list');
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Suggestions');
  const row1 = mk('div', 'fr-btns');
  const bOnce = button('Ignore Once', '', 'Leave this one as it is'), bAll = button('Ignore All', '', 'Leave this word as it is everywhere in this document (kept in this browser)');
  const bAdd = button('Add to Dictionary', '', 'Put the word on this document\'s own list, a % rikuy: words line that travels with the .tex');
  row1.append(bOnce, bAll, bAdd);
  const row2 = mk('div', 'fr-btns');
  const bChange = button('Change', 'sm', 'Change it to the suggestion chosen (Enter)'), bChangeAll = button('Change All', '', 'Change it everywhere in the document, in one step');
  const bPrev = button('Previous', '', 'The word before'), bNext = button('Next', '', 'The word after');
  bPrev.setAttribute('aria-label', 'Previous error'); bNext.setAttribute('aria-label', 'Next error');
  row2.append(bChange, bChangeAll, mk('span', 'grow'), bPrev, bNext);
  const st = mk('div', 'fr-st');
  st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
  d.append(head, lab, ctx, sl, list, row1, row2, st);
  // (in #main: on a desktop window it docks at the right as Word's panes do, app.css)
  (document.getElementById('main') || document.body).append(d);
  const P = { d, lab, ctx, list, st, bOnce, bAll, bAdd, bChange, bChangeAll, bPrev, bNext, cur: null, pick: null };
  app.spPane = P;
  const close = () => { d.hidden = true; P.cur = null; app.ribbonBack && app.ribbonBack(); };
  x.addEventListener('click', close);
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    // (Enter is Change, as Word's, on a suggestion too: the one with the focus)
    else if (e.key === 'Enter' && (!e.target.closest('button') || e.target.classList.contains('sp-opt'))) {
      e.preventDefault();
      if (e.target.classList.contains('sp-opt')) P.pick = e.target.textContent;
      bChange.click();
    }
  });
  const act = (fn) => () => { const c = P.cur; if (!c) return; P.after = { f: c.f, p: c.s }; P.back = document.activeElement; fn(c); };
  bOnce.addEventListener('click', act((c) => (c.g ? app.grammarIgnoreOnce(c) : app.spellIgnoreOnce(c))));
  bAll.addEventListener('click', act((c) => (c.g ? app.grammarIgnoreRule(c) : app.spellIgnoreAll(c.q))));
  bAdd.addEventListener('click', act((c) => { if (!c.g) app.spellAddWord(c.q); }));
  // (a Change is done once: the pane waits for the page's next check before it shows a word again,
  // so a second press, a double click or a double tap, finds nothing to change twice)
  const done = (c) => { P.cur = null; P.after = { f: c.f, p: c.s }; for (const b of [bOnce, bAll, bAdd, bChange, bChangeAll]) b.disabled = true; };
  bChange.addEventListener('click', act((c) => { if (c.g ? P.pickSg && app.grammarApply(c, P.pickSg) : P.pick && app.spellChange(c, P.pick)) done(c); }));
  bChangeAll.addEventListener('click', act((c) => { if (P.pick && app.spellChange(c, P.pick, true)) done(c); }));
  bNext.addEventListener('click', () => step(app, 1));
  bPrev.addEventListener('click', () => step(app, -1));
  return P;
}

const order = (app) => {
  const rank = (f) => (f === app.main ? '' : f);
  const g = app.gr && app.grammarOn && app.grammarOn() ? app.gr.bad : [];
  return [...app.spellState().bad, ...g].sort((a, b) => (rank(a.f) < rank(b.f) ? -1 : rank(a.f) > rank(b.f) ? 1 : a.s - b.s));
};
function step(app, dir) {
  const P = app.spPane, list = order(app);
  if (!list.length) { P.cur = null; render(app); return; }
  const k = P.cur ? list.findIndex((y) => y.key === P.cur.key) : -1;
  P.cur = list[(k + dir + list.length) % list.length];
  const back = document.activeElement;
  show(app, P.cur);
  render(app);
  // (the keys stay in the pane: Enter changes, Escape closes)
  if (back && P.d.contains(back) && back.isConnected) back.focus({ preventScroll: true });
}
// the word on the page: selected where a keyboard is (on a phone, only shown: a selection there
// opens the on-screen keyboard over the pane)
function show(app, x) {
  if (!x) return;
  app.goTo(x.f, x.s);
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) { if (app.flashRange) app.flashRange(x.f, x.s, x.e); }
  else app.restoreCaret({ f: x.f, p: x.e, selA: x.s, selB: x.e });
}

function render(app) {
  const P = app.spPane;
  if (!P || P.d.hidden) return;
  const S = app.spellState();
  const x = P.cur;
  const all = order(app);
  const n = all.length;
  const gOn = !!(app.grammarOn && app.grammarOn());
  P.d.querySelector('#sp-title').textContent = gOn ? 'Spelling and Grammar' : 'Spelling';
  P.list.replaceChildren();
  P.pick = null; P.pickSg = null;
  for (const b of [P.bOnce, P.bAll, P.bAdd, P.bChange, P.bChangeAll, P.bPrev, P.bNext]) b.disabled = !x;
  if (x && x.g) {
    // a grammar issue: Harper's message, the words in their sentence, its corrections
    P.bAdd.disabled = true; P.bChangeAll.disabled = true;
    P.bAll.title = 'Leave these words as they are for this kind of issue in this document';
    P.lab.textContent = 'Grammar: ' + x.msg;
    P.ctx.replaceChildren();
    let a = Math.max(0, x.i - 60), b = Math.min(x.ctx.length, x.j + 60);
    let pre = x.ctx.slice(a, x.i), post = x.ctx.slice(x.j, b);
    if (a > 0) pre = '…' + pre.replace(/^\S*\s/, '');
    if (b < x.ctx.length) post = post.replace(/\s\S*$/, '') + '…';
    P.ctx.append(document.createTextNode(pre), mk('b', 'sp-w sp-g', x.words || '‸'), document.createTextNode(post));
    P.st.textContent = (all.findIndex((y) => y.key === x.key) + 1) + ' of ' + n;
    if (!x.sugg.length) { P.list.append(mk('div', 'sp-none', '(no suggestions)')); P.bChange.disabled = true; return; }
    x.sugg.forEach((sg, i) => {
      const o = mk('button', 'sp-opt', app.suggLabel(sg));
      o.type = 'button';
      o.setAttribute('role', 'option');
      o.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      o.addEventListener('click', () => { for (const y of P.list.children) y.setAttribute('aria-selected', 'false'); o.setAttribute('aria-selected', 'true'); P.pickSg = sg; });
      o.addEventListener('dblclick', () => { P.pickSg = sg; P.bChange.click(); });
      P.list.append(o);
    });
    P.pickSg = x.sugg[0];
    return;
  }
  P.bAll.title = 'Leave this word as it is everywhere in this document (kept in this browser)';
  if (!x) {
    P.lab.textContent = app.spellOn() ? (gOn ? 'No spelling or grammar issues' : 'No spelling errors') : (app.spellWhyNot() || 'Spelling is off');
    P.ctx.textContent = app.spellOn() && S.plan ? S.plan.occ.length.toLocaleString('en-US') + ' words checked in ' + (DICT_NAME[S.plan.dict] || S.plan.dict) + '.' : '';
    P.st.textContent = '';
    return;
  }
  P.lab.textContent = 'Not in the dictionary (' + (DICT_NAME[x.dict] || x.dict) + ')';
  // the word in its sentence, as the page shows it
  const run = S.plan && S.plan.runs[x.r];
  P.ctx.replaceChildren();
  if (run) {
    let a = Math.max(0, x.i - 60), b = Math.min(run.text.length, x.j + 60);
    let pre = run.text.slice(a, x.i), post = run.text.slice(x.j, b);
    if (a > 0) pre = '…' + pre.replace(/^\S*\s/, '');
    if (b < run.text.length) post = post.replace(/\s\S*$/, '') + '…';
    P.ctx.append(document.createTextNode(pre), mk('b', 'sp-w', x.w), document.createTextNode(post));
  } else P.ctx.append(mk('b', 'sp-w', x.w));
  const k = all.findIndex((y) => y.key === x.key);
  P.st.textContent = (k + 1) + ' of ' + n;
  const fill = (sugg) => {
    if (P.cur !== x) return;
    P.list.replaceChildren();
    if (!sugg.length) { P.list.append(mk('div', 'sp-none', '(no suggestions)')); P.bChange.disabled = P.bChangeAll.disabled = true; return; }
    sugg.forEach((s, i) => {
      const o = mk('button', 'sp-opt', s);
      o.type = 'button';
      o.setAttribute('role', 'option');
      o.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      o.addEventListener('click', () => {
        for (const y of P.list.children) y.setAttribute('aria-selected', 'false');
        o.setAttribute('aria-selected', 'true');
        P.pick = s;
      });
      o.addEventListener('dblclick', () => { P.pick = s; P.bChange.click(); });
      P.list.append(o);
    });
    P.pick = sugg[0];
  };
  const now = app.spellSuggestNow(x);
  if (now) fill(now);
  else { P.list.append(mk('div', 'sp-none', 'Looking for suggestions…')); app.spellSuggest(x).then(fill); }
}

// opened by F7, the status bar or a menu: at the word given, the one at the caret, or the next
// one after the caret
export function openSpellPane(app, x) {
  const P = app.spPane || build(app);
  P.d.hidden = false;
  if (!app.spellOn() && app.spellAvailable() && app.prefs.spell === false) { P.cur = null; render(app); return; }
  P.cur = x || app.spellAt() || (app.grammarAt && app.grammarAt()) || null;
  if (!P.cur) {
    const c = app.caretNow();
    const list = order(app);
    P.cur = (c && c.f != null && list.find((y) => (y.f === c.f && y.s >= c.p) || (y.f !== c.f && c.f === app.main && y.f !== app.main))) || list[0] || null;
  }
  if (P.cur) show(app, P.cur);
  render(app);
  const first = P.d.querySelector('.sp-opt') || P.bNext;
  if (first && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) first.focus();
}

// after a check or an edit: the same word if it is still marked, else the next one from where
// the last action was
export function spellPaneRefresh(app) {
  const P = app.spPane;
  if (!P || P.d.hidden) return;
  const list = order(app);
  const same = P.cur && list.find((y) => y.key === P.cur.key && y.s === P.cur.s);
  if (same) P.cur = same;
  else {
    const at = P.after || (P.cur ? { f: P.cur.f, p: P.cur.s } : null);
    P.cur = (at && list.find((y) => y.f === at.f && y.s >= at.p)) || list[0] || null;
    if (P.cur && P.after) show(app, P.cur);
  }
  P.after = null;
  render(app);
  const back = P.back;
  P.back = null;
  if (back && back.isConnected && P.d.contains(back) && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) back.focus({ preventScroll: true });
}
