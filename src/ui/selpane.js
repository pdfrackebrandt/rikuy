// Word's Selection Pane (Layout › Arrange, and every object's Arrange): every figure, table,
// picture, drawing, chart, SmartArt and display equation of the document (src/objlist.js), each a
// row with its name (its caption, or "Picture 2"), its label to rename, and an eye that shows or
// hides it on the page alone (the source and the PDF keep it: Word's hide is the page's too). A
// press on a row goes to the object and selects it; Show All and Hide All; a name changed is one
// commit with every reference to it. The pane is no dialog: it stays open as the document changes.

import { mk } from './dom.js';
import { objectList, renameLabel, labelPlace, KIND_NAMES } from '../objlist.js';
import { atomOfEl } from '../editor.js';
import { BLOCKS } from '../render.js';

const EYE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.4" fill="currentColor"/></svg>';
const SHUT = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/><path d="M3.5 16.5l13-13" stroke="currentColor" stroke-width="1.6"/></svg>';
const key = (x) => x.f + ':' + x.kind + ':' + x.n;

function build(app) {
  const d = mk('div', 'fr sel-pane');
  d.id = 'sel-pane';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-labelledby', 'sel-title');
  d.hidden = true;
  const head = mk('div', 'fr-head');
  const title = mk('span', '', 'Selection');
  title.id = 'sel-title';
  const x = mk('button', 'pop-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
  x.addEventListener('click', () => { d.hidden = true; });
  head.append(title, x);
  const bar = mk('div', 'fr-btns');
  // (sm: a narrow window's rule makes a plain .btn an icon of 32 px)
  const all = mk('button', 'btn ghost sm', 'Show All'), none = mk('button', 'btn ghost sm', 'Hide All');
  all.type = none.type = 'button';
  all.addEventListener('click', () => { app.selHidden.clear(); app.selApplyHidden(); render(app); });
  none.addEventListener('click', () => { for (const it of app.selItems()) app.selHidden.add(key(it)); app.selApplyHidden(); render(app); });
  bar.append(all, none);
  const list = mk('div', 'sel-list');
  list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Objects of the document');
  const st = mk('div', 'fr-st');
  st.setAttribute('role', 'status'); st.setAttribute('aria-live', 'polite');
  d.append(head, bar, list, st);
  document.body.append(d);
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); d.hidden = true; app.ribbonBack(); } });
  return (app.selPane = { d, list, st });
}

function render(app) {
  const P = app.selPane;
  if (!P || P.d.hidden) return;
  const items = app.selItems();
  P.list.textContent = '';
  if (!items.length) { P.list.append(mk('div', 'sp-none', 'No figures, tables, pictures, drawings, charts, SmartArt or equations in this document.')); return; }
  for (const it of items) {
    const row = mk('div', 'sel-row' + (it.inside ? ' sel-in' : ''));
    row.setAttribute('role', 'listitem');
    const go = mk('button', 'sel-go');
    go.type = 'button';
    go.append(mk('span', 'sel-k', KIND_NAMES[it.kind]), mk('span', 'sel-n', it.name));
    go.title = 'Go to it' + (it.f !== app.main ? ' (' + it.f + ')' : '');
    go.setAttribute('aria-label', it.name + ', ' + KIND_NAMES[it.kind].toLowerCase());
    go.addEventListener('click', () => app.selGo(it));
    const lab = mk('input', 'sel-lab');
    lab.type = 'text'; lab.value = it.label ? it.label.key : '';
    lab.placeholder = it.label || labelPlace(app.src(it.f), it) ? 'name' : '';
    lab.disabled = !it.label && !labelPlace(app.src(it.f), it);
    lab.title = lab.disabled ? 'Only a figure, a table or a numbered equation has a name to refer to: Insert Caption makes a picture a figure' : 'Its name (\\label): a new one renames every reference to it; Enter writes it';
    lab.setAttribute('aria-label', 'Name of ' + it.name);
    lab.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); app.selRename(it, lab.value); } });
    const eye = mk('button', 'sel-eye');
    eye.type = 'button';
    const hidden = app.selHidden.has(key(it));
    eye.innerHTML = hidden ? SHUT : EYE;
    eye.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    eye.setAttribute('aria-label', 'Show ' + it.name);
    eye.title = hidden ? 'Hidden on the page (the source and the PDF keep it): show it' : 'Hide it on the page alone';
    eye.addEventListener('click', () => { if (app.selHidden.has(key(it))) app.selHidden.delete(key(it)); else app.selHidden.add(key(it)); app.selApplyHidden(); render(app); });
    row.append(go, lab, eye);
    P.list.append(row);
  }
}

export const methods = {
  selItems() {
    const order = [this.main, ...[...this.files.keys()].filter((f) => f !== this.main).sort()];
    return objectList(this.files, order);
  },
  selPaneOpen() {
    if (!this.selHidden) this.selHidden = new Set();
    const P = this.selPane || build(this);
    P.d.hidden = false;
    render(this);
    const first = P.d.querySelector('.sel-go');
    if (first && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) first.focus();
    return true;
  },
  selPaneRefresh() { if (this.selPane && !this.selPane.d.hidden) render(this); },
  // the page's elements of an object: its atoms, or the blocks of a float, a table or an equation
  selElements(it) {
    const out = [];
    for (const el of document.querySelectorAll('#pages [data-a]')) {
      const a = atomOfEl(el);
      if (a && a.f === it.f && a.s >= it.s && a.e <= it.e) out.push(el);
    }
    if (it.kind === 'picture' || it.kind === 'drawing' || it.kind === 'chart' || it.kind === 'smartart') return out;
    for (const el of document.querySelectorAll('#pages .it[data-b]')) {
      const B = BLOCKS.get(+el.dataset.b);
      if (B && B.f === it.f && B.s < it.e && B.e > it.s && !out.some((x) => x.contains(el))) out.push(el);
    }
    return out;
  },
  // hidden ones as the page is drawn again
  selApplyHidden() {
    for (const el of document.querySelectorAll('#pages .sel-hidden')) el.classList.remove('sel-hidden');
    if (!this.selHidden || !this.selHidden.size) return;
    for (const it of this.selItems()) if (this.selHidden.has(key(it))) for (const el of this.selElements(it)) el.classList.add('sel-hidden');
  },
  selGo(it) {
    const els = this.selElements(it);
    const el = els[0];
    if (!el) { this.toast(it.name + ' is not on the page now (' + it.f + ').'); return false; }
    el.scrollIntoView({ block: 'center' });
    if (it.kind === 'picture' && el.classList.contains('a-img')) { const a = atomOfEl(el); if (a) this.picSelect({ f: a.f, s: a.s }, { tab: true }); }
    else if ((it.kind === 'drawing' || it.kind === 'chart') && this.objSelect) this.objSelect(el.closest('.raw.drawn') || el);
    else if (it.kind === 'smartart' && this.objSelect) this.objSelect(el);
    else { this.root.focus({ preventScroll: true }); this.restoreCaret({ f: it.f, p: it.s, bias: 1 }); el.scrollIntoView({ block: 'center' }); }
    return true;
  },
  selRename(it, to) {
    to = String(to || '').trim();
    const src = this.src(it.f);
    if (it.label) {
      const E = renameLabel(this.files, it.label.key, to);
      if (E.error) { this.toast(E.error, 6000); return false; }
      if (!E.length) return false;
      this.closeGroup();
      this.commit(E, null, 'label');
      this.closeGroup();
    } else {
      const P = labelPlace(src, it);
      if (!P || !to) return false;
      const E = renameLabel(this.files, '\u0000', to);
      if (E.error) { this.toast(E.error, 6000); return false; }
      this.closeGroup();
      this.commit([{ f: it.f, s: P.at, e: P.at, t: '\\label{' + to + '}' }], null, 'label');
      this.closeGroup();
    }
    this.selPane.st.textContent = 'Named ' + to + '.';
    return true;
  }
};

export function installSelPane(app) {
  app.selHidden = new Set();
  // (a page drawn again: hidden ones hidden again, the list read again)
  const sync = app.layoutPass;
  app.layoutPass = function (...a) {
    const r = sync.apply(this, a);
    if (this.selHidden && this.selHidden.size) this.selApplyHidden();
    clearTimeout(this.selT);
    this.selT = setTimeout(() => this.selPaneRefresh(), 120);
    return r;
  };
}
