// The task panes docked at the window's right (Styles, Spelling, the Thesaurus, Help: app.css
// docks them in #main from 1000 px): one at a time, the newest, as the right column holds one
// (three of them with the side panel ran past the window and made a phone's page wider than its
// screen); and docked only while the page keeps room to be read beside it, else it lies over the
// page's right side and the page keeps its width (Styles beside the PDF pane on a 1024 px tablet
// left the page 210 px, at 30 %). `app` is the editor (src/app.js).

import { $ } from './dom.js';

const PANES = '.stp, .sp-pane, .help-pane';
// the page's least width beside a docked pane, in CSS pixels
const ROOM = 560;

export function installDock(app) {
  const main = $('#main');
  if (!main || typeof MutationObserver === 'undefined') return;
  let order = [];
  const shown = () => [...main.children].filter((e) => e.matches(PANES) && !e.hidden);
  const close = (e) => {
    if (e.id === 'stylespane') e.remove();
    else if (e.id === 'helppane') e.remove();
    else { e.hidden = true; if (app.spPane && app.spPane.d === e) app.spPane.cur = null; }
  };
  const arrange = () => {
    const now = shown();
    order = order.filter((e) => now.includes(e));
    for (const e of now) if (!order.includes(e)) order.push(e);
    // (the older ones close: the newest is the one just asked for)
    if (window.innerWidth >= 1000) while (order.length > 1) close(order.shift());
    const pane = order[0];
    for (const e of now) if (e !== pane) e.classList.remove('pane-float');
    if (!pane || window.innerWidth < 1000) { if (pane) pane.classList.remove('pane-float'); return; }
    const desk = app.desk || $('#desk');
    const w = pane.getBoundingClientRect().width || 320;
    const floating = pane.classList.contains('pane-float');
    const room = desk.clientWidth + (floating ? 0 : w) - w;
    pane.classList.toggle('pane-float', room < ROOM);
  };
  let t = 0;
  const soon = () => { cancelAnimationFrame(t); t = requestAnimationFrame(arrange); };
  // (#main's own children only: a pane put in or taken out, and a pane shown or hidden; never the
  // page's nodes, which change at every keystroke)
  const watched = new WeakSet(), shownObs = new MutationObserver(soon);
  const watch = () => { for (const e of main.children) if (e.matches(PANES) && !watched.has(e)) { watched.add(e); shownObs.observe(e, { attributes: true, attributeFilter: ['hidden'] }); } };
  new MutationObserver(() => { watch(); soon(); }).observe(main, { childList: true });
  watch();
  // (the PDF and source panes and the side panel change the room as they open and close)
  for (const id of ['pdfpane', 'srcpane', 'nav']) { const e = $('#' + id); if (e) new ResizeObserver(soon).observe(e); }
  addEventListener('resize', soon);
}
