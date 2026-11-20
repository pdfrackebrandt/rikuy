// Go to File (Ctrl+P), as VS Code's quick open: the project's files by a few letters of their
// names, Enter goes to the one highlighted. A file drawn on the page (the main file, an \input)
// puts the caret at its first paragraph; one that is not (a .bib, a .sty) opens in the source
// pane. Print is the list's first line while nothing is typed, so Ctrl+P then Enter prints, as
// Word's Ctrl+P then Enter does (docs/handoff/POWER-USER.md 17).

import { mk } from './dom.js';

const TEXT = /\.(tex|bib|sty|cls|bst|txt|ltx|dtx|clo|cfg|def|md)$/i;

// how well a query's letters stand in a file's name: 3 its start, 2 inside it, 1 in order, 0 not
export function fileScore(q, name) {
  const n = name.toLowerCase(), w = q.toLowerCase().replace(/\s+/g, '');
  if (!w) return 1;
  if (n.startsWith(w) || n.split('/').pop().startsWith(w)) return 3;
  if (n.includes(w)) return 2;
  let k = 0;
  for (const ch of n) if (ch === w[k] && ++k === w.length) return 1;
  return 0;
}

export function openQuickOpen(app) {
  const back = app.caretNow();
  const p = app.makePop(null, 'pop-qo', 'Go to File');
  app.pop.rect = { left: window.innerWidth / 2 - 180, right: window.innerWidth / 2 + 180, top: 70, bottom: 70, width: 360, height: 0 };
  app.pop.returnCaret = back && !back.ghost ? { f: back.f, p: back.a } : null;
  const inp = mk('input');
  inp.type = 'text'; inp.id = 'pop-qo-q'; inp.placeholder = 'A file\'s name'; inp.autocomplete = 'off'; inp.spellcheck = false;
  inp.setAttribute('aria-label', 'File name');
  const list = mk('div', 'plist');
  list.id = 'qo-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Files');
  // (a combobox over its listbox, with a polite count, as the search box is: review M5)
  inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-controls', list.id); inp.setAttribute('aria-expanded', 'true'); inp.setAttribute('aria-autocomplete', 'list');
  const live = mk('div', 'sr');
  live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  p.append(inp, list, live);
  const onPage = (f) => app.renderer && app.renderer.blocks.find((B) => B.f === f && B.e > B.s);
  let rows = [], hi = 0;
  const go = async (r) => {
    if (!r) return;
    app.closePop(true);
    if (r.print) { app.runCommand('print'); return; }
    const B = onPage(r.f);
    if (B) { app.restoreCaret({ f: r.f, p: B.s, bias: 1 }); app.goTo(r.f, B.s); return; }
    await app.toggleSource(true);
    if (app.showSrcFile) app.showSrcFile(r.f);
    if (app.cm) { app.cm.focus(); app.cm.setCursor({ line: 0, ch: 0 }); }
  };
  const draw = () => {
    const q = inp.value.trim();
    const files = [...app.files.keys()].filter((f) => TEXT.test(f)).map((f) => ({ f, s: fileScore(q, f) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (a.f === app.main ? -1 : b.f === app.main ? 1 : a.f.localeCompare(b.f)));
    rows = [...(!q ? [{ print: true }] : []), ...files];
    hi = Math.min(hi, Math.max(0, rows.length - 1));
    list.replaceChildren();
    rows.forEach((r, i) => {
      const b = mk('button', 'pitem' + (i === hi ? ' on' : ''));
      b.type = 'button'; b.id = 'qo-' + i;
      b.setAttribute('role', 'option'); b.setAttribute('aria-selected', i === hi ? 'true' : 'false');
      b.append(mk('b', '', r.print ? 'Print PDF' : r.f), mk('span', '', r.print ? 'Enter prints, as Word\'s Ctrl+P' : r.f === app.main ? 'the main file' : onPage(r.f) ? 'on the page' : 'in the source'));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => go(r));
      list.append(b);
    });
    if (rows[hi]) inp.setAttribute('aria-activedescendant', 'qo-' + hi); else inp.removeAttribute('aria-activedescendant');
    const n = rows.filter((r) => !r.print).length;
    live.textContent = n === 1 ? '1 file' : n + ' files';
    if (!rows.length) list.append(mk('div', 'empty', 'No file of this project by that name.'));
  };
  inp.addEventListener('input', () => { hi = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) hi = (hi + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      draw();
      const o = list.querySelector('.pitem.on');
      if (o) o.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); go(rows[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); app.closePop(); }
  });
  draw();
  app.positionPop();
  inp.focus();
}
