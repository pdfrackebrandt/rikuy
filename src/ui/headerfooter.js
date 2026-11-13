// The header and the footer typed on the page, as in Word: a double click in a page's top or
// bottom margin (or Header › Edit header) opens its three places, left, centre and right, as
// fields where the header or footer is drawn; the Header & Footer tab shows meanwhile (CONTEXTS
// in src/ribbon/order.js), and Escape, Close header and footer or a press on the text closes
// them. A place holds LaTeX as fancyhdr takes it (\thepage is the page's number): typed text is
// written to \fancyhead or \fancyfoot as it is typed, one step of history for each run of
// typing in one place (src/pagesrc.js slotEdits through App.pageSlotSteps). In a two sided
// document a place is the odd or the even pages', the page's own.

import { mk } from './dom.js';

const POS = ['L', 'C', 'R'], NAMES = ['left', 'center', 'right'];

export function installHeaderFooter(app) {
  app.root.addEventListener('dblclick', (e) => {
    const pg = e.target.closest && e.target.closest('.page');
    if (!pg || app.hf || !pg.querySelector('.pb')) return;
    const pb = pg.querySelector('.pb').getBoundingClientRect();
    const where = e.clientY < pb.top ? 'head' : e.clientY > pb.bottom ? 'foot' : null;
    if (!where) return;
    e.preventDefault();
    hfOpen(app, where, { page: [...app.root.querySelectorAll(':scope > .page')].indexOf(pg) });
  });
  // a press on the text closes them, as in Word
  app.root.addEventListener('mousedown', (e) => { if (app.hf && !e.target.closest('.hfedit')) hfClose(app, false); }, true);
}

// the page the caret is on, else the first one in sight
function pageInView(app) {
  const pages = [...app.root.querySelectorAll(':scope > .page')];
  const c = getSelection().rangeCount ? getSelection().getRangeAt(0).startContainer : null;
  const el = c && (c.nodeType === 1 ? c : c.parentElement);
  const mine = el && el.closest && el.closest('.page');
  if (mine && pages.includes(mine)) return pages.indexOf(mine);
  const top = app.desk ? app.desk.getBoundingClientRect().top : 0;
  const k = pages.findIndex((p) => p.getBoundingClientRect().bottom > top + 40);
  return Math.max(0, k);
}

// The places' text for a page: the document's fancyhdr places (the fancy style, wherever it is
// used), else what the plain style shows (the page number at the foot's centre), else nothing
function slotsOf(app, k, where) {
  const L = app.layout, pg = app.plan && app.plan[k];
  const page = app.model.opts.page || {};
  const side = L.g.twoside && pg && pg.num % 2 === 0 ? 'E' : 'O';
  const W = where === 'head' ? 'H' : 'F';
  if (page.fancy && page.slots) return { side, texts: POS.map((p) => page.slots[W + side + p] || '') };
  const st = page.style || 'plain';
  return { side, texts: POS.map((p) => (st !== 'empty' && W === 'F' && p === 'C' ? '\\thepage' : '')) };
}

export function hfOpen(app, where, o = {}) {
  if (!app.model || !app.layout.pages.length) return false;
  hfClose(app, false);
  const k = Math.min(app.layout.pages.length - 1, o.page != null && o.page >= 0 ? o.page : pageInView(app));
  const P = app.layout.pages[k];
  const { side, texts } = slotsOf(app, k, where);
  const two = !!app.layout.g.twoside;
  const name = (where === 'head' ? 'Header' : 'Footer') + (two ? (side === 'E' ? ' (even pages)' : ' (odd pages)') : '');
  const box = mk('div', 'hfedit ' + where);
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', name);
  box.contentEditable = 'false';
  box.append(mk('span', 'hf-tag', name));
  const inputs = POS.map((p, i) => {
    const inp = mk('input', 'hf-in hf-' + NAMES[i]);
    inp.type = 'text';
    inp.value = texts[i];
    inp.spellcheck = false;
    inp.setAttribute('aria-label', (where === 'head' ? 'Header ' : 'Footer ') + NAMES[i]);
    inp.placeholder = i === 1 ? (where === 'head' ? 'Header' : 'Footer') : '';
    inp.title = 'LaTeX: \\thepage is the page number, \\today the date';
    let t = 0;
    const write = () => { clearTimeout(t); t = 0; hfWrite(app, where, i, inp.value); };
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(write, 350); });
    inp.addEventListener('change', write);
    inp.addEventListener('focus', () => { if (app.hf) app.hf.last = inp; });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); write(); hfClose(app, true); }
      else if (e.key === 'Enter') { e.preventDefault(); write(); }
    });
    inp.flush = () => { if (t) write(); };
    return inp;
  });
  box.append(...inputs);
  // (outside the page's editable text: the page's own keys and typing never reach the fields)
  document.body.appendChild(box);
  P.el.classList.add('hf-' + where);
  app.root.classList.add('hf-on');
  app.hf = { where, k, side, inputs, el: box, P, last: inputs[POS.indexOf(o.slot || 'L')] || inputs[0] };
  const place = () => hfPlace(app);
  app.hf.place = place;
  app.desk.addEventListener('scroll', place, { passive: true });
  window.addEventListener('resize', place);
  app.hf.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
  if (app.hf.ro) app.hf.ro.observe(app.root);
  place();
  app.hf.last.focus();
  app.ribbonSync();
  if (app.rbTabs && app.rbTabs.includes('headfoot')) app.selectTab('headfoot');
  return true;
}

// The fields over the page's header or footer, where TeX sets it (src/layout.js: the head's
// baseline headsep above the text, the foot's footskip under it); hidden while the page is out of
// the desk's sight
export function hfPlace(app) {
  const H = app.hf;
  if (!H) return;
  const P = app.layout.pages[H.k];
  if (!P || !P.el.isConnected) { hfClose(app, false); return; }
  const g = app.layout.g, px = app.px, r = P.el.getBoundingClientRect(), d = app.desk.getBoundingClientRect();
  const even = P.el.classList.contains('even');
  const fs = g.pt * px;
  const base = H.where === 'head' ? (g.mt - (g.headsep ?? 25)) * px : (g.mt + g.th + g.footskip) * px;
  const top = r.top + base - fs - 7;
  H.el.style.left = (r.left + ((even ? g.mlE : g.ml) ?? g.ml) * px) + 'px';
  H.el.style.width = (g.tw * px) + 'px';
  H.el.style.top = top + 'px';
  H.el.style.setProperty('--fs', fs + 'px');
  H.el.style.visibility = top < d.top - 4 || top > d.bottom - 10 ? 'hidden' : '';
}

// What one place holds, written: on this side's pages in a two sided document, else on both
function hfWrite(app, where, i, value) {
  const H = app.hf;
  if (!H) return;
  const text = escapeText(value);
  const place = (where === 'head' ? 'H' : 'F') + POS[i];
  const edits = app.pageSlotSteps([place], text, { side: H.side });
  if (!edits.length) return;
  // (each run of typing in one place is one step of history: record joins them)
  app.commit(edits.map((x) => ({ f: app.main, ...x })), null, 'hf-' + place);
  hfPlace(app);
}
// & % # typed as words, not as TeX's own signs
export const escapeText = (v) => String(v).replace(/(^|[^\\])([&%#])/g, '$1\\$2').replace(/(^|[^\\])([&%#])/g, '$1\\$2').slice(0, 400);

export function hfClose(app, back) {
  const H = app.hf;
  if (!H) return false;
  for (const inp of H.inputs) inp.flush();
  app.hf = null;
  H.el.remove();
  app.desk.removeEventListener('scroll', H.place);
  window.removeEventListener('resize', H.place);
  if (H.ro) H.ro.disconnect();
  H.P.el.classList.remove('hf-head', 'hf-foot');
  app.root.classList.remove('hf-on');
  app.closeGroup();
  app.ribbonSync();
  if (back) { app.root.focus({ preventScroll: true }); if (app.ribbonBack) app.ribbonBack(); }
  return true;
}

// \today or \thepage where the caret is in the open header or footer
export function hfInsert(app, tex) {
  const H = app.hf;
  if (!H) return false;
  const inp = H.last || H.inputs[0];
  const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
  inp.value = inp.value.slice(0, a) + tex + inp.value.slice(b);
  inp.focus();
  inp.setSelectionRange(a + tex.length, a + tex.length);
  inp.dispatchEvent(new Event('change'));
  return true;
}
