// Batch B11, inserting and the clipboard: the insert list (\ or Ctrl+K) and the environments,
// marks and breaks it offers; Cut and Copy for the right click menu; Insert › Interactive graph,
// Rikuy's live figures made as easily as Word's charts (src/graph.js, src/ui/graphdialog.js).
// B11 adds Paste and its options, symbols, special characters, building blocks, the date,
// AutoCorrect (src/autocorrect.js, through onInsertText in src/commands.js) and the Insert tab's
// LaTeX group here.

import { register, command, onInsertText, onInstall } from '../commands.js';
import { openMenu, openGallery, dialog } from '../ui/kit.js';
import { mk } from '../ui/dom.js';
import { chordText } from '../keys.js';
import { SYMBOLS, openSymbols } from '../ui/symbol.js';
import { correct, borderLine, DEFAULTS as AC_DEFAULTS, REPLACE } from '../autocorrect.js';
import { openGraphDialog } from '../ui/graphdialog.js';
import { kit as GK, graphHtml, readGraph, isGraph, sameGraph, graphPNG, TEMPLATES, RIKUY_STY } from '../graph.js';
import { widgetPath } from '../widget.js';

const piece = (open, close) => ({ open, close });
const env = (k, d, order) => ({ id: 'insert-' + k, name: d, synonyms: [k], run: (app) => app.insertFromPalette(k), palette: { k, d, order, t: piece('\n\n\\begin{' + k + '}\n', '\n\\end{' + k + '}\n\n'), block: true } });
const sel = (app, at) => !!at && !at.c.ghost && !at.c.collapsed;

// ---- interactive graphs ---------------------------------------------------------------------

// Every \rikuywidget of the project's .tex files, outside comments: where the command is, its
// arguments as written, and the widget's file in the project. Bounded: at most 500, arguments of
// at most 2000 characters (a stranger's document is read here).
const usesCache = { key: null, val: [] };
function widgetUses(app) {
  let key = app.main + '|' + app.files.size;
  for (const [f, t] of app.files) if (/\.(tex|ltx)$/i.test(f)) key += '|' + f + ':' + t.length + ':' + (t.length ? t.charCodeAt(t.length >> 1) : 0);
  // (the key is cheap; a change of the same length in the same place is caught by the text)
  if (usesCache.key === key && usesCache.texts && [...usesCache.texts].every(([f, t]) => app.files.get(f) === t)) return usesCache.val;
  const out = [], texts = new Map();
  for (const [f, t] of app.files) {
    if (!/\.(tex|ltx)$/i.test(f) || t.length > 5e6) continue;
    texts.set(f, t);
    let k = 0;
    while (out.length < 500 && (k = t.indexOf('\\rikuywidget', k)) >= 0) {
      const s = k;
      k += 12;
      if (/[A-Za-z@]/.test(t[k] || '')) continue;
      // commented out: a % before it on its line that no backslash escapes
      let ls = s;
      while (ls > 0 && t[ls - 1] !== '\n' && s - ls < 4000) ls--;
      let com = false;
      for (let j = ls; j < s; j++) if (t[j] === '%' && t[j - 1] !== '\\') { com = true; break; }
      if (com) continue;
      const args = [];
      let p = k;
      const skip = () => { while (p < t.length && /[ \t\r\n]/.test(t[p]) && p - k < 200) p++; };
      skip();
      let opt = null;
      if (t[p] === '[') { const q = t.indexOf(']', p); if (q < 0 || q - p > 2000) continue; opt = { s: p + 1, e: q }; p = q + 1; skip(); }
      for (let a = 0; a < 2; a++) {
        if (t[p] !== '{') break;
        let d = 0, q = p;
        for (; q < t.length && q - p < 2000; q++) { if (t[q] === '\\') { q++; continue; } if (t[q] === '{') d++; else if (t[q] === '}' && --d === 0) break; }
        if (d !== 0 || t[q] !== '}') break;
        args.push({ s: p + 1, e: q, v: t.slice(p + 1, q) });
        p = q + 1;
        if (a === 0) skip();
      }
      if (args.length < 2) continue;
      out.push({ f, s, e: p, opt, html: args[0], fb: args[1], path: widgetPath(app.files, app.main, args[0].v) });
      k = p;
    }
  }
  usesCache.key = key; usesCache.texts = texts; usesCache.val = out;
  return out;
}
const graphUses = (app) => widgetUses(app).filter((u) => u.path && isGraph(app.files.get(u.path)));
const dirOf = (p) => (p && p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

// The graph the caret means: an armed live figure, else one in the caret's block
function graphAt(app, at) {
  const G = graphUses(app);
  if (!G.length) return null;
  const A = app.armed;
  if (A && A.kind === 'widget') { const u = G.find((x) => x.f === A.f && x.s <= A.s && A.s < x.e); if (u) return u; }
  if (at && at.B) { const u = G.find((x) => x.f === at.B.f && x.s >= at.B.s && x.s < at.B.e); if (u) return u; }
  return null;
}

// a free name for a new graph's files, beside the main file: graphs/function-1.html and .png
function freshName(app, kind) {
  const dir = dirOf(app.main);
  const base = { function: 'function', data: 'data', curve: 'curve', dist: 'distribution' }[kind] || 'graph';
  for (let n = 1; n < 1000; n++) {
    const rel = 'graphs/' + base + '-' + n;
    if (![rel + '.html', rel + '.png'].some((x) => app.files.has(dir + x) || app.assetBlobs.has(dir + x) || app.extra.has(dir + x))) return rel;
  }
  return 'graphs/' + base + '-' + Date.now();
}

// the width of the text at 100 %, in CSS pixels: the live figure's width, and so the picture's
const textWidthPx = (app) => Math.round(((app.layout && app.layout.g && app.layout.g.tw) || 345) * 96 / 72.27);

register(
  { id: 'insert-list', name: 'Insert list', title: 'The list of things to insert: footnote, citation, section, environments and more (\\ or Ctrl+K)', synonyms: ['Insert a command', 'Command'], keys: ['Ctrl+K'], run: (app) => app.openPalette() },
  env('proposition', 'Proposition', 140), env('lemma', 'Lemma', 150), env('theorem', 'Theorem', 160), env('definition', 'Definition', 170), env('assumption', 'Assumption', 180), env('proof', 'Proof', 190),
  { id: 'insert-ldots', name: 'Ellipsis', synonyms: ['Dots', 'ldots'], keys: ['Ctrl+Alt+.'], run: (app) => app.insertFromPalette('ldots'), palette: { k: 'ldots', d: 'Ellipsis …', order: 220, t: piece('\\ldots{}', '') } },
  { id: 'insert-newline', name: 'Line break', synonyms: ['New line'], run: (app) => app.insertFromPalette('newline'), palette: { k: 'newline', d: 'Line break', order: 230, t: piece('\\\\\n', '') } },
  // (the page's own copy and cut handlers give the LaTeX: the focus goes back to the page first)
  { id: 'cut', name: 'Cut', title: 'Cut (Ctrl+X)', keysElsewhere: ['Ctrl+X'], menu: { selection: 10 }, when: sel,
    icon: '<circle cx="6" cy="14.5" r="2.2"/><circle cx="14" cy="14.5" r="2.2"/><path d="M7.6 12.9 14 3.5M12.4 12.9 6 3.5"/>', run: (app) => { app.ribbonBack(); document.execCommand('cut'); } },
  { id: 'copy', name: 'Copy', title: 'Copy, as LaTeX and as text (Ctrl+C)', keysElsewhere: ['Ctrl+C'], menu: { selection: 11 }, when: sel,
    icon: '<rect x="7" y="6.5" width="9" height="10.5" rx="1.2"/><path d="M4.5 13.5V4.2c0-.7.5-1.2 1.2-1.2h7"/>', run: (app) => { app.ribbonBack(); document.execCommand('copy'); } },

  // Rikuy's live figures, as Word's Insert Chart: a gallery of kinds, a dialog with the graph live
  // beside its fields. Help's guide (B12) calls this id.
  // (one button: its dialog opens on the gallery of kinds, so the row keeps the room an arrow takes)
  { id: 'insert-interactive-graph', name: 'Interactive graph', label: 'Interactive graph', tab: 'insert', group: 'illustrations', order: 60,
    title: 'A live graph: a function with sliders, data with a fit, a curve or a distribution. The page runs it, the PDF prints its picture',
    synonyms: ['Live figure', 'Live graph', 'Chart', 'Plot', 'Graph', 'Slider', 'Widget', 'Desmos', 'rikuywidget'],
    icon: '<path d="M3 16.5h14"/><path d="M3.5 16V3.5"/><path d="M4 13c2.5-6 4.5-7 6.5-3.5S14 11 16.5 5"/><circle cx="10.5" cy="9.5" r="1.6"/>',
    when: (app, at) => !!app.model && !app.stale && (!!at || app.files.has(app.main)),
    whyNot: () => 'The page cannot show the document as it is now',
    menuItems: (app) => {
      const items = TEMPLATES.map((t) => ({ name: t.name, title: t.title, run: () => app.graphDialog({ template: t.id }) }));
      const G = graphUses(app);
      if (G.length) items.push(null, ...G.slice(0, 12).map((u) => ({ name: 'Edit ' + u.html.v.trim(), title: 'Edit the graph in ' + u.path, run: () => app.graphEdit(u.path) })));
      return items;
    },
    run: (app, args) => app.graphDialog(args || {}),
    palette: { k: 'graph', d: 'Interactive graph (live figure)', order: 235, act: 'cmd' } },
  { id: 'edit-graph', name: 'Edit graph', title: 'Change this interactive graph: its formulas or data, its sliders, its axes',
    synonyms: ['Edit live figure', 'Change graph', 'Edit chart'], menu: { graph: 1 },
    when: (app) => graphUses(app).length > 0,
    whyNot: () => 'The document has no interactive graph (Insert, Interactive graph makes one)',
    run: (app, args, at) => {
      const file = args && args.file;
      if (file) return app.graphEdit(file);
      const u = graphAt(app, at) || (graphUses(app).length === 1 ? graphUses(app)[0] : null);
      if (u) return app.graphEdit(u.path);
      // several and none at the caret: which one
      const G = graphUses(app);
      openMenu(app, app.root.getBoundingClientRect(), G.slice(0, 20).map((g) => ({ name: g.html.v.trim(), title: g.path, run: () => app.graphEdit(g.path) })), { label: 'Edit graph' });
      return true;
    } }
);

export const methods = {
  // whether the caret means an interactive graph (the right click menu's 'graph' items)
  graphHere(at) { return !!graphAt(this, at); },

  // the dialog for a new graph (o.template: its kind's id, o.spec: a description)
  graphDialog(o = {}) {
    // where it goes is where the caret was as the dialog opened
    const c = this.caretNow();
    const spot = c ? { f: c.ghost ? this.ghost.f : c.f, p: c.ghost ? this.ghost.pos : c.b } : null;
    return openGraphDialog(this, { template: o.template, spec: o.spec, onDone: (spec, { caption }) => this.graphInsert(spec, caption, spot) });
  },

  // The edits of a new graph, as one commit: its file, its picture, the command after the caret's
  // block, rikuy.sty beside the main file where the project has none, \usepackage{rikuy}
  async graphInsert(spec, caption, spot) {
    const s = GK.normalize(spec);
    GK.formulas(s);
    const blob = await graphPNG(s, textWidthPx(this));
    const dir = dirOf(this.main), rel = freshName(this, s.kind);
    if (spot) this.restoreCaret(spot);
    const { f, p, pre, post } = this.afterBlockPos();
    const cmd = '\\rikuywidget[width=\\linewidth]{' + rel + '.html}{' + rel + '.png}';
    const cap = String(caption || '').trim();
    const text = cap ? '\\begin{figure}[htbp]\n\\centering\n' + cmd + '\n\\caption{' + this.escapeAt(f, p, cap) + '}\n\\end{figure}' : '\\begin{center}\n' + cmd + '\n\\end{center}';
    const edits = [{ f, s: p, e: p, t: pre + text + post }, { f: dir + rel + '.html', s: 0, e: 0, t: graphHtml(s) }];
    const hasSty = [...this.files.keys(), ...this.assetBlobs.keys(), ...this.extra.keys()].some((k) => k === 'rikuy.sty' || k.endsWith('/rikuy.sty'));
    if (!hasSty) edits.push({ f: dir + 'rikuy.sty', s: 0, e: 0, t: RIKUY_STY });
    const pk = this.packageEdits(['rikuy']);
    edits.push(...pk);
    // the caret after the new block (the package line moves it when both are in the main file)
    const shift = f === this.main ? pk.filter((x) => x.s <= p).reduce((n, x) => n + x.t.length - (x.e - x.s), 0) : 0;
    this.closeGroup();
    this.commit(edits, { f, p: p + shift + pre.length + text.length, bias: -1 }, undefined, [{ name: dir + rel + '.png', blob }]);
    this.toast('Inserted a live graph: drag its sliders on the page. The PDF prints its picture.', 4000);
    return true;
  },

  // the dialog on the graph of this widget file
  graphEdit(path) {
    const html = this.files.get(path);
    const spec = readGraph(html);
    if (!spec) { this.toast('This live figure was not made by Insert, Interactive graph: edit its HTML in the source.'); return false; }
    return openGraphDialog(this, { spec, edit: { path }, onDone: (s) => this.graphUpdate(path, s) });
  },

  // A graph changed: its file and its picture, as one commit. Nothing changed: nothing written.
  async graphUpdate(path, spec) {
    const old = this.files.get(path);
    const was = readGraph(old);
    if (was && sameGraph(was, spec)) { this.toast('The graph is as it was: nothing to write.'); return true; }
    const s = GK.normalize(spec);
    GK.formulas(s);
    const blob = await graphPNG(s, textWidthPx(this));
    const edits = [{ f: path, s: 0, e: (this.files.get(path) || '').length, t: graphHtml(s) }];
    // the picture: the one its commands name where that is a PNG, else a PNG beside the widget
    // that those commands are pointed at
    const dir = dirOf(this.main);
    const uses = widgetUses(this).filter((u) => u.path === path);
    const pngOf = (u) => (/\.png$/i.test(u.fb.v.trim()) ? u.fb.v.trim() : null);
    let rel = uses.map(pngOf).find(Boolean);
    if (!rel) {
      rel = path.slice(dir.length).replace(/\.html?$/i, '') + '.png';
      for (const u of uses) edits.push({ f: u.f, s: u.fb.s, e: u.fb.e, t: rel });
    }
    this.closeGroup();
    this.commit(edits, null, undefined, [{ name: dir + rel.replace(/^\.\//, ''), blob }]);
    return true;
  },

  // ---- on the page: the Edit graph button over a graph, its menu, and the first time hint ----
  // (WidgetLayer's host calls these for each frame it makes, src/widget.js)
  graphDecorate(F) {
    if (!isGraph(this.files.get(F.path))) return;
    F.box.classList.add('wgraph');
    const b = mk('button', 'w-edit', 'Edit graph');
    b.type = 'button';
    b.title = 'Change this graph: its formulas or data, sliders and axes (or right click it)';
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => this.runCommand('edit-graph', { file: F.path }));
    F.box.append(b);
    if (!(this.prefs && this.prefs.graphHint) && !this.graphHinted) {
      this.graphHinted = true;
      const h = mk('div', 'w-hint');
      h.setAttribute('role', 'note');
      h.append(mk('span', '', 'A live graph: drag its sliders. The PDF prints this picture at the starting values. Edit graph changes it.'));
      const x = mk('button', 'btn sm', 'Got it');
      x.type = 'button';
      x.addEventListener('mousedown', (e) => e.preventDefault());
      x.addEventListener('click', () => { this.prefs.graphHint = 1; this.savePrefs(); for (const n of document.querySelectorAll('.w-hint')) n.remove(); });
      h.append(x);
      F.box.append(h);
    }
  },

  // a right click or a long press inside a graph's frame (its own script sends where): Rikuy's
  // menu for it. Only for a graph's frame, at most once a second: a frame cannot open menus at will
  graphMenu(F, x, y) {
    if (!isGraph(this.files.get(F.path))) return;
    const now = Date.now();
    if (now - (this.graphMenuT || 0) < 1000) return;
    this.graphMenuT = now;
    const r = F.box.getBoundingClientRect(), w = parseFloat(F.box.style.width) || r.width;
    const k = r.width / w;
    const px = r.left + Math.max(0, Math.min(w, Number(x) || 0)) * k, py = r.top + Math.max(0, Math.min(r.height / k, Number(y) || 0)) * k;
    openMenu(this, new DOMRect(px, py, 0, 0), [
      { name: 'Edit graph', title: 'Change its formulas or data, sliders and axes', run: () => this.runCommand('edit-graph', { file: F.path }) },
      { name: 'Show its LaTeX', title: 'Its \\rikuywidget command', run: () => this.widgetSource(F.ph, {}) }
    ], { label: 'Graph menu' });
  }
};

// ---- the clipboard: Paste and its options (H2, H3) ----------------------------------------------
const PASTE_WHY = 'Put the caret on the page';
register(
  // (no button on Home's row: there it took the Styles gallery's tiles from 1920 px (test/ribbon.py);
  // Ctrl+V, the right click menu and the search box have it, and its options are commands of
  // their own the search box finds)
  { id: 'paste', name: 'Paste', keysElsewhere: ['Ctrl+V'], menu: { text: 12, selection: 12 },
    title: 'Paste (Ctrl+V): from Rikuy as its LaTeX, from elsewhere with its formatting as LaTeX. Ctrl+Shift+V: the text only; the search box: Paste Special, as LaTeX source',
    icon: '<path d="M7 4.5H5.2c-.7 0-1.2.5-1.2 1.2v10.6c0 .7.5 1.2 1.2 1.2h9.6c.7 0 1.2-.5 1.2-1.2V5.7c0-.7-.5-1.2-1.2-1.2H13"/><rect x="7" y="3" width="6" height="3" rx=".8"/>',
    whyNot: () => PASTE_WHY, run: (app) => app.pasteFrom('keep'),
    menuItems: () => [
      { name: 'Cut', title: 'Cut (Ctrl+X)', keys: 'Ctrl+X', command: 'cut' },
      { name: 'Copy', title: 'Copy, as LaTeX and as text (Ctrl+C)', keys: 'Ctrl+C', command: 'copy' },
      null,
      { name: 'Keep Source Formatting', title: 'As Ctrl+V: bold, lists, links and tables as LaTeX', command: 'paste' },
      { name: 'Keep Text Only', title: 'The words alone, escaped as typing escapes them (Ctrl+Shift+V)', keys: 'Ctrl+Shift+V', command: 'paste-text' },
      { name: 'As LaTeX source', title: 'The clipboard\'s text is LaTeX: written into the source as it is', command: 'paste-latex' },
      null,
      { name: 'Paste Special', title: 'Choose the form: LaTeX copied in Rikuy, formatted text, text only, LaTeX source', command: 'paste-special' }
    ] },
  { id: 'paste-text', name: 'Keep Text Only', title: 'Paste the words alone (Ctrl+Shift+V)', keysElsewhere: ['Ctrl+Shift+V'], synonyms: ['Paste as plain text', 'Paste unformatted'], whyNot: () => PASTE_WHY, run: (app) => app.pasteFrom('text') },
  { id: 'paste-latex', name: 'Paste as LaTeX source', title: 'Paste the clipboard\'s text as LaTeX, unescaped', synonyms: ['Paste LaTeX', 'Paste source'], whyNot: () => PASTE_WHY, run: (app) => app.pasteFrom('latex') },
  { id: 'paste-special', name: 'Paste Special', title: 'Paste in the form chosen', synonyms: ['Paste options'], whyNot: () => PASTE_WHY, run: (app) => app.pasteSpecial() }
);

// ---- symbols and special characters (I44, I45) ---------------------------------------------------
const tex = (id, name, t, o = {}) => ({ id, name, title: name + ' (' + t + ')' + (o.keys ? ' (' + o.keys[0] + ')' : ''), when: (app, at) => !!at && !app.armed, whyNot: () => PASTE_WHY, run: (app) => app.insertTeX(t, o.pkgs), ...o });
register(
  { id: 'symbol', name: 'Symbol', label: 'Symbol', tab: 'insert', group: 'symbols', order: 30, glyph: '<span class="sym-g">Ω</span>', synonyms: ['Symbols', 'Special characters', 'Character', 'Insert symbol'],
    title: 'Symbols as LaTeX: ©, °, €, §, arrows; the ones used last first. The arrow: the grid and More Symbols', when: (app, at) => !!at && !app.armed, whyNot: () => PASTE_WHY,
    run: (app) => app.symbolGrid(), menuItems: (app) => app.symbolItems() },
  { id: 'more-symbols', name: 'More Symbols', title: 'Every symbol, with a search, and Word\'s Special Characters', when: (app, at) => !!at && !app.armed, whyNot: () => PASTE_WHY, run: (app) => openSymbols(app, (t) => app.insertTeX(t, t.includes('checkmark') ? ['amssymb'] : t.includes('nobreakdash') ? ['amsmath'] : []), (id) => { const c = command(id); return c && c.keys ? chordText(c.keys[0]) : ''; }) },
  tex('insert-em-dash', 'Em dash', '---', { keys: ['Ctrl+Alt+-'], synonyms: ['Long dash'] }),
  tex('insert-en-dash', 'En dash', '--', { synonyms: ['Short dash', 'Range dash'] }),
  tex('insert-nbsp', 'Nonbreaking space', '~', { keys: ['Ctrl+Shift+Space'], synonyms: ['No-break space', 'Tie'] }),
  tex('insert-nb-hyphen', 'Nonbreaking hyphen', '\\nobreakdash-', { keys: ['Ctrl+Shift+_'], pkgs: ['amsmath'], synonyms: ['No-break hyphen'] }),
  tex('insert-copyright', 'Copyright', '\\copyright{}', { keys: ['Ctrl+Alt+C'], synonyms: ['©'] }),
  tex('insert-registered', 'Registered', '\\textregistered{}', { keys: ['Ctrl+Alt+R'], synonyms: ['®'] }),
  tex('insert-trademark', 'Trademark', '\\texttrademark{}', { keys: ['Ctrl+Alt+T'], synonyms: ['™', 'TM'] })
);

// ---- the date and the time (I38) ----------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
register(
  { id: 'date-time', name: 'Date & Time', label: 'Date & Time', tab: 'insert', group: 'text', order: 30, kind: 'menu', synonyms: ['Date', 'Time', 'Today'],
    icon: '<rect x="3.5" y="4.5" width="13" height="12" rx="1.5"/><path d="M3.5 8h13M7 3v3M13 3v3"/>',
    title: 'Today\'s date, as \\today (updated every time TeX runs, in the document\'s language) or as text; the time', when: (app, at) => !!at && !app.armed, whyNot: () => PASTE_WHY,
    menuItems: (app) => {
      const d = new Date(), loc = (o) => d.toLocaleDateString('en-GB', o), us = (o) => d.toLocaleDateString('en-US', o);
      const fixed = [loc({ day: 'numeric', month: 'long', year: 'numeric' }), us({ month: 'long', day: 'numeric', year: 'numeric' }), d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        loc({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(), pad(d.getHours()) + ':' + pad(d.getMinutes())];
      return [{ name: 'Update automatically (\\today)', title: 'The date TeX prints each time it runs, in the document\'s language (Alt+Shift+D)', keys: 'Alt+Shift+D', command: 'insert-date' }, null,
        ...fixed.map((t) => ({ name: t, title: 'As text: it stays this date', run: () => app.insertTeX(app.escapeTyped(t)) }))];
    } },
  tex('insert-date', 'Date', '\\today{}', { keys: ['Alt+Shift+D'], title: 'Today\'s date, updated each time TeX runs (\\today) (Alt+Shift+D)', synonyms: ['Today', 'Insert date'] }),
  { id: 'insert-time', name: 'Time', title: 'The time now, as text (Alt+Shift+T)', keys: ['Alt+Shift+T'], synonyms: ['Insert time', 'Clock'], when: (app, at) => !!at && !app.armed, whyNot: () => PASTE_WHY,
    run: (app) => { const d = new Date(); return app.insertTeX(pad(d.getHours()) + ':' + pad(d.getMinutes())); } }
);

// ---- text from a file, a PDF's pages (I39, I40) --------------------------------------------------
register(
  // (no control of its own on the row: Insert's row has no room for it at 870 px; the search box,
  // Help and agents reach it)
  { id: 'object', name: 'Object', label: 'Object', kind: 'menu', synonyms: ['Insert object', 'Insert file'],
    icon: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15M8 10h4M8 13h4"/>', title: 'Text from a .tex file (\\input) or a PDF\'s pages (\\includepdf)',
    when: (app) => !!app.model && !app.stale, menuItems: () => [{ name: 'Text from file', title: 'A .tex file, read here by \\input', command: 'text-from-file' }, { name: 'PDF pages', title: 'Every page of a PDF (pdfpages)', command: 'insert-pdf' }] },
  { id: 'text-from-file', name: 'Text from file', synonyms: ['Insert file', 'input', 'include', 'Chapter'],
    icon: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15M8 10h4M8 13h4"/>',
    title: 'A .tex file joins the project and \\input{name} reads it here', when: (app) => !!app.model && !app.stale, run: (app) => app.pickFile('.tex,.ltx,.txt', (f) => app.textFromFile(f)) },
  { id: 'insert-pdf', name: 'PDF pages', synonyms: ['Insert PDF', 'includepdf', 'pdfpages'],
    icon: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15"/><path d="M7.5 14v-4h1.3a1.2 1.2 0 0 1 0 2.4H7.5"/>',
    title: 'Every page of a PDF, as pages of the document (\\includepdf, pdfpages)', when: (app) => !!app.model && !app.stale, run: (app) => app.pickFile('.pdf,application/pdf', (f) => app.pdfPages(f)) }
);

// ---- Insert › LaTeX (I47): environments, the live figure ------------------------------------------
const ENVS = [['center', 'Centered', '\\begin{center}'], ['flushleft', 'Flush left', '\\begin{flushleft}'], ['flushright', 'Flush right', '\\begin{flushright}'], ['quote', 'Quote', '\\begin{quote}'],
  ['quotation', 'Quotation', '\\begin{quotation}'], ['verse', 'Verse', '\\begin{verse}'], ['verbatim', 'Verbatim', '\\begin{verbatim}'], ['minipage', 'Minipage', '\\begin{minipage}{0.48\\linewidth}'], ['abstract', 'Abstract', '\\begin{abstract}']];
register(
  { id: 'insert-environment', name: 'Environment', label: 'Environment', tab: 'insert', group: 'latex', order: 10, kind: 'menu', synonyms: ['begin', 'LaTeX environment', 'Theorem', 'Proof', 'Verbatim'],
    icon: '<path d="M6.5 4C4.5 4 4.5 5 4.5 7s-1 3-1 3 1 1 1 3 0 3 2 3M13.5 4c2 0 2 1 2 3s1 3 1 3-1 1-1 3 0 3-2 3"/>',
    title: '\\begin{…} and \\end{…} around a new paragraph: theorems, proof, quote, verbatim, minipage, or one by its name',
    menuItems: () => [
      ...['theorem', 'lemma', 'proposition', 'definition', 'assumption', 'proof'].map((k) => ({ name: command('insert-' + k).name, command: 'insert-' + k })), null,
      ...ENVS.map(([k, n]) => ({ name: n, title: '\\begin{' + k + '}', command: 'insert-env-' + k })), null,
      { name: 'Other environment', title: 'Any environment by its name', command: 'insert-env-other' }] },
  ...ENVS.map(([k, n, open], i) => ({ id: 'insert-env-' + k, name: n + ' environment', synonyms: [k], run: (app) => app.insertFromPalette(k), palette: { k, d: n + ' (' + k + ')', order: 240 + i, t: piece('\n\n' + open + '\n', '\n\\end{' + k + '}\n\n'), block: true } })),
  { id: 'insert-env-other', name: 'Other environment', title: 'An environment by its name: \\begin{name} … \\end{name}', synonyms: ['Custom environment'], run: (app) => app.otherEnv() }
);

// ---- AutoCorrect (A5–A7, A9, A10) and its options (F19, F20) --------------------------------------
register(
  { id: 'autocorrect-options', name: 'AutoCorrect Options', label: 'AutoCorrect Options', tab: 'file', group: 'options', order: 20, synonyms: ['Options', 'Proofing', 'User name', 'Initials', 'AutoFormat', 'Replace text as you type'],
    icon: '<path d="M4 15.5 9.5 4h1L16 15.5M6.5 11h7"/><path d="m12.5 16 1.6 1.6 3-3.6"/>',
    title: 'Your name and initials (on comments and changes), and what AutoCorrect does as you type', when: () => true, run: (app) => app.autocorrectOptions() }
);
const acOn = (app) => ({ ...AC_DEFAULTS, ...((app.prefs && app.prefs.autocorrect) || {}) });
onInsertText((app, data, range) => {
  if (data.length !== 1 || (range && range.a !== range.b)) return;
  const o = acOn(app);
  if (o.off) return;
  const c = app.caretNow();
  if (!c || c.ghost || !c.collapsed || app.texHere()) return;
  const src = app.src(c.f), p = c.a;
  // not inside math, a comment, a verbatim or a command's name: the page's own spans say text
  const r = correct(src, p, data, o, (app.prefs.acList || []).filter((x) => Array.isArray(x) && x.length === 2));
  if (!r) return;
  // the character as typing writes it, then the correction: one undo gives back what was typed
  const t = app.escapeAt(c.f, p, data);
  app.commit([{ f: c.f, s: p, e: p, t }], { f: c.f, p: p + t.length, bias: -1 }, 'type');
  app.closeGroup();
  // (a replacement ending in the typed character takes it in; a word's correction is before it)
  const e = r.typed ? p + t.length : r.e;
  const caret = r.typed ? r.s + r.t.length : p + t.length + r.t.length - (r.e - r.s);
  app.commit([{ f: c.f, s: r.s, e, t: r.t }], { f: c.f, p: caret, bias: -1 }, 'autocorrect');
  app.closeGroup();
  return true;
});
onInstall((app) => {
  // ---, ___ or === alone on a line, then Enter: a rule across the text (A7)
  app.root.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertParagraph' || acOn(app).borders === false || acOn(app).off) return;
    const at = app.ribbonAt();
    if (!at || !at.c.collapsed || at.c.ghost || !at.B || app.texHere()) return;
    const w = app.plainPara(at.B, at.it);
    if (!w || at.c.a !== w.e) return;
    const t = borderLine(app.src(at.B.f).slice(w.s, w.e));
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    app.commit([{ f: at.B.f, s: w.s, e: w.e, t }], { f: at.B.f, p: w.s + t.length, bias: -1 }, 'autocorrect');
    app.closeGroup();
  }, true);
});

Object.assign(methods, {
  // LaTeX written at the caret as it is (a symbol's command), over the selection; the packages it
  // needs in the same step. In a LaTeX paragraph it is source anyway.
  insertTeX(t, pkgs = []) {
    const c = this.caretNow();
    if (!c || !t) return false;
    this.closeGroup();
    const T = c.ghost ? null : this.texHere();
    if (T && T.f === c.f) { this.texEdit(T, c.a, c.b, t, 'insert'); return true; }
    let edits, f, at;
    if (c.ghost) {
      const g = this.ghost, s = this.src(g.f);
      let nl = 0;
      for (let k = g.pos - 1; k >= 0 && /\s/.test(s[k]); k--) if (s[k] === '\n') nl++;
      const pre = g.pos === 0 ? '' : '\n'.repeat(Math.max(0, 2 - nl));
      this.removeGhost();
      f = g.f; at = g.pos;
      t = pre + t;
      edits = [];
    } else {
      f = c.f;
      edits = this.deletionEdits(c.f, c.a, c.b);
      at = edits.length && edits[0].s >= c.a ? edits[0].s : c.a;
    }
    const src = this.src(f);
    // a dash after a dash would make a longer one; a quote after a quote another
    if ((/^-/.test(t) && src[at - 1] === '-') || (/^[`']/.test(t) && src[at - 1] === t[0])) t = '{}' + t;
    const removed = edits.filter((ed) => ed.e <= at).reduce((n, ed) => n + (ed.e - ed.s), 0);
    const pk = pkgs.length ? this.packageEdits(pkgs) : [];
    const shift = f === this.main ? pk.filter((x) => x.s <= at).reduce((n, x) => n + x.t.length - (x.e - x.s), 0) : 0;
    this.commit([...edits, { f, s: at, e: at, t }, ...pk], { f, p: at - removed + shift + t.length, bias: -1 }, 'insert');
    this.closeGroup();
    return true;
  },
  // text from the dialog as typing writes it (fixed dates: "14/11/2026")
  escapeTyped(t) { const c = this.caretNow(); return c && !c.ghost ? this.escapeAt(c.f, c.a, t) : t.replace(/[\\{}$&#^_%~]/g, (x) => '\\' + x); },

  // the symbol grid: the ones used last, then Word's first twenty
  symbolItems() {
    const recent = (this.prefs.symRecent || []).filter((x) => SYMBOLS.some((y) => y[1] === x)).slice(0, 10);
    const list = [...recent.map((x) => SYMBOLS.find((y) => y[1] === x)), ...SYMBOLS.filter((y) => !recent.includes(y[1]))].slice(0, 20);
    return [...list.map(([ch, t, name]) => ({ name, title: name + ': ' + t, html: '<span class="sym-g">' + ch.replace(/[<&]/g, '') + '</span>', label: '', run: () => this.insertSymbol(t) })), null, { name: 'More Symbols', title: 'Every symbol, and Special Characters', command: 'more-symbols' }];
  },
  symbolGrid() {
    const b = document.getElementById('rc-symbol') || this.root;
    const items = this.symbolItems().filter(Boolean).map((it) => it.command ? { ...it, run: () => this.runCommand(it.command) } : it);
    openGallery(this, b, items, { label: 'Symbol', columns: 5, cls: 'pop-symgrid' });
  },
  insertSymbol(t) {
    this.prefs.symRecent = [t, ...(this.prefs.symRecent || []).filter((x) => x !== t)].slice(0, 10);
    this.savePrefs();
    return this.insertTeX(t, t.includes('checkmark') ? ['amssymb'] : []);
  },

  // ---- Paste and its options ----
  async clipboardRead() {
    const out = { plain: '', html: '', latex: '' };
    if (navigator.clipboard && navigator.clipboard.read) {
      for (const it of await navigator.clipboard.read()) for (const type of it.types) {
        if (type === 'text/plain') out.plain = await (await it.getType(type)).text();
        else if (type === 'text/html') out.html = await (await it.getType(type)).text();
      }
    } else out.plain = await navigator.clipboard.readText();
    // (what Rikuy copied comes back as its LaTeX: the page's copy kept it)
    if (this.lastCopy && out.plain === this.lastCopy.plain) out.latex = this.lastCopy.latex;
    return out;
  },
  async pasteFrom(mode) {
    let d;
    try { d = await this.clipboardRead(); } catch (e) {
      this.toast('This browser lets a page read the clipboard only from its keys: press ' + (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl') + (mode === 'text' ? '+Shift' : '') + '+V.', 6000);
      return false;
    }
    this.ribbonBack();
    this.pasteData(d, mode);
    return true;
  },
  // the page's own paste (onPaste) with the clipboard's forms chosen: keep (as Ctrl+V), text
  // (the words alone), latex (the text as LaTeX source)
  pasteData(d, mode) {
    const data = { 'text/plain': d.plain || '', 'text/html': mode === 'keep' ? d.html || '' : '', 'text/x-galley-latex': mode === 'latex' ? d.plain || '' : mode === 'keep' ? d.latex || '' : '' };
    const kept = this.lastCopy;
    if (mode !== 'keep') this.lastCopy = null;
    this.plainPaste = mode === 'text';
    try { this.onPaste({ preventDefault() {}, clipboardData: { getData: (t) => data[t] || '', files: [] } }); } finally { this.lastCopy = kept; this.plainPaste = false; }
  },
  async pasteSpecial() {
    let d;
    try { d = await this.clipboardRead(); } catch (e) { return this.pasteFrom('keep'); }
    const at = this.caretNow();
    const p = dialog(this, { title: 'Paste Special', cls: 'pop-pastesp', rect: new DOMRect(Math.max(8, innerWidth / 2 - 200), 120, 0, 0) });
    const forms = [d.latex && ['keep', 'LaTeX copied in Rikuy', 'What was copied, as its source'], d.html && ['keep', 'Formatted text (HTML)', 'Bold, italic, lists, links and tables as LaTeX'],
      ['text', 'Unformatted text', 'The words alone, escaped'], ['latex', 'LaTeX source', 'The text as LaTeX, written as it is']].filter(Boolean);
    const list = mk('div', 'ps-list');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'As');
    let pick = forms[0][0];
    forms.forEach(([m, name, why], i) => {
      const l = mk('label', 'fd-ck');
      const r = mk('input');
      r.type = 'radio'; r.name = 'ps'; r.checked = i === 0; r.setAttribute('aria-label', name);
      r.addEventListener('change', () => { pick = m; });
      l.append(r, mk('span', '', name), mk('small', 'gd-hint', ' ' + why));
      list.append(l);
    });
    const ok = mk('button', 'btn primary', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', () => { this.closePop(); if (at) this.restoreCaret({ f: at.f, p: at.a }); this.pasteData(d, pick); });
    const row = mk('div', 'gd-btns');
    row.append(mk('span', 'grow'), ok);
    p.append(list, row);
    this.positionPop();
  },

  // ---- files ----
  pickFile(accept, then) {
    const i = mk('input');
    i.type = 'file'; i.accept = accept; i.hidden = true;
    i.addEventListener('change', () => { const f = i.files && i.files[0]; i.remove(); if (f) then(f); });
    document.body.append(i);
    i.click();
  },
  freeName(name) {
    const dir = dirOf(this.main);
    let n = String(name).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '') || 'file';
    const [base, ext] = /^(.*?)(\.[^.]*)?$/.exec(n).slice(1);
    for (let k = 1; [this.files, this.assetBlobs, this.extra].some((m) => m.has(dir + n)); k++) n = base + '-' + k + (ext || '');
    return n;
  },
  // a .tex file joins the project, \input{name} reads it after the caret's block: one step
  async textFromFile(file) {
    if (file.size > 5e6) { this.toast('That file is over 5 MB: not text to \\input.'); return false; }
    const text = await file.text();
    const name = this.freeName(/\.(tex|ltx)$/i.test(file.name) ? file.name : file.name.replace(/\.[^.]*$/, '') + '.tex');
    const { f, p, pre, post } = this.afterBlockPos();
    const t = '\\input{' + name.replace(/\.tex$/i, '') + '}';
    this.closeGroup();
    this.commit([{ f, s: p, e: p, t: pre + t + post }, { f: dirOf(this.main) + name, s: 0, e: 0, t: text }], { f, p: p + pre.length + t.length, bias: -1 });
    return true;
  },
  // a PDF's pages: the file joins the project and \includepdf puts every page in (pdfpages)
  async pdfPages(file) {
    const name = this.freeName(file.name.replace(/\.pdf$/i, '') + '.pdf');
    const { f, p, pre, post } = this.afterBlockPos();
    const t = '\\includepdf[pages=-]{' + name + '}';
    const pk = this.packageEdits(['pdfpages']);
    const shift = f === this.main ? pk.filter((x) => x.s <= p).reduce((n, x) => n + x.t.length - (x.e - x.s), 0) : 0;
    this.closeGroup();
    this.commit([{ f, s: p, e: p, t: pre + t + post }, ...pk], { f, p: p + shift + pre.length + t.length, bias: -1 }, undefined, [{ name: dirOf(this.main) + name, blob: file }]);
    return true;
  },

  // an environment by its name
  otherEnv() {
    const c = this.caretNow();
    const spot = c ? { f: c.ghost ? this.ghost.f : c.f, p: c.ghost ? this.ghost.pos : c.a } : null;
    const p = dialog(this, { title: 'Other environment', cls: 'pop-env', rect: new DOMRect(Math.max(8, innerWidth / 2 - 180), 120, 0, 0) });
    const i = mk('input', 'gd-in code');
    i.type = 'text'; i.placeholder = 'align*, tikzpicture, frame'; i.setAttribute('aria-label', 'Environment name');
    const ok = mk('button', 'btn primary', 'Insert');
    ok.type = 'button';
    const go = () => {
      const n = i.value.trim();
      if (!/^[A-Za-z]{1,40}\*?$/.test(n)) { i.classList.add('gd-bad'); return; }
      this.closePop();
      if (spot) this.restoreCaret(spot);
      const c2 = this.caretNow();
      this.insertPiece(c2 && !c2.ghost ? { f: c2.f, a: c2.a, b: c2.b } : null, c2 && c2.ghost ? this.ghost : null, '\n\n\\begin{' + n + '}\n', '\n\\end{' + n + '}\n\n');
    };
    ok.addEventListener('click', go);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const row = mk('div', 'gd-btns');
    row.append(mk('span', 'grow'), ok);
    p.append(i, row);
    this.positionPop();
    i.focus();
  },

  // ---- AutoCorrect Options (F20) and the name on comments (F19) ----
  autocorrectOptions() {
    const p = dialog(this, { title: 'AutoCorrect Options', cls: 'pop-acopt', rect: new DOMRect(Math.max(8, innerWidth / 2 - 260), 80, 0, 0) });
    const o = acOn(this);
    const save = () => { this.savePrefs(); };
    const sec = (name) => { const s = mk('fieldset', 'gd-sec'); s.append(mk('legend', '', name)); p.append(s); return s; };
    const you = sec('Your name');
    const row = mk('div', 'gd-row');
    const name = mk('input', 'gd-in'); name.type = 'text'; name.value = this.prefs.who || ''; name.autocomplete = 'name'; name.setAttribute('aria-label', 'User name');
    const ini = mk('input', 'gd-in'); ini.type = 'text'; ini.value = this.prefs.initials || ''; ini.maxLength = 8; ini.setAttribute('aria-label', 'Initials');
    name.addEventListener('change', () => { this.prefs.who = name.value.trim().slice(0, 80); save(); });
    ini.addEventListener('change', () => { this.prefs.initials = ini.value.trim().slice(0, 8); save(); });
    const lab = (t, el, cls) => { const l = mk('label', 'gd-f' + (cls ? ' ' + cls : '')); l.append(mk('span', 'gd-l', t), el); return l; };
    row.append(lab('User name', name, 'gd-grow'), lab('Initials', ini));
    you.append(row, mk('p', 'gd-hint', 'Written with your comments and changes: % comment (your name).'));
    const ac = sec('As you type');
    const sw = [['off', 'Turn AutoCorrect off', true], ['replace', 'Replace text as you type: (c) ©, (tm) ™, ... …, -> →'], ['links', 'Internet addresses as links (\\url)'], ['capitals', 'Capitalize the first letter of sentences'],
      ['twoCaps', 'Correct TWo INitial CApitals'], ['days', 'Capitalize the names of days'], ['ordinals', 'Ordinals (1st) as superscript'], ['fractions', 'Fractions (1/2) as ½'], ['borders', 'Border lines: ---, ___ or === then Enter']];
    for (const [k, t, neg] of sw) {
      const l = mk('label', 'fd-ck');
      const c = mk('input');
      c.type = 'checkbox'; c.checked = neg ? !!o.off : o[k] !== false; c.setAttribute('aria-label', t);
      c.addEventListener('change', () => { this.prefs.autocorrect = { ...(this.prefs.autocorrect || {}), [k]: c.checked }; save(); });
      l.append(c, mk('span', '', t));
      ac.append(l);
    }
    {
      // (B1's *bold* and _italic_, kept in the same place)
      const l = mk('label', 'fd-ck'), c = mk('input');
      c.type = 'checkbox'; c.checked = !(this.prefs.autocorrect && this.prefs.autocorrect.boldItalic === false); c.setAttribute('aria-label', '*Bold* and _italic_ with real formatting');
      c.addEventListener('change', () => { this.prefs.autocorrect = { ...(this.prefs.autocorrect || {}), boldItalic: c.checked }; save(); });
      l.append(c, mk('span', '', '*Bold* and _italic_ with real formatting'));
      ac.append(l);
    }
    // the person's own replacements, after Word's list
    const own = sec('Replace with your own');
    const r2 = mk('div', 'gd-row');
    const a = mk('input', 'gd-in'); a.type = 'text'; a.setAttribute('aria-label', 'Replace'); a.placeholder = 'teh';
    const b = mk('input', 'gd-in'); b.type = 'text'; b.setAttribute('aria-label', 'With'); b.placeholder = 'the';
    const add = mk('button', 'btn ghost', 'Add');
    add.type = 'button';
    const listEl = mk('div', 'ac-list');
    const draw = () => {
      listEl.textContent = '';
      for (const [x, y] of this.prefs.acList || []) {
        const it = mk('div', 'ac-row');
        const del = mk('button', 'btn ghost icon', '×');
        del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + x);
        del.addEventListener('click', () => { this.prefs.acList = (this.prefs.acList || []).filter((z) => z[0] !== x); save(); draw(); });
        it.append(mk('code', '', x), mk('span', '', ' → '), mk('code', '', y), del);
        listEl.append(it);
      }
      for (const [x, y] of REPLACE) { const it = mk('div', 'ac-row ac-word'); it.append(mk('code', '', x), mk('span', '', ' → '), mk('code', '', y)); listEl.append(it); }
    };
    add.addEventListener('click', () => {
      const x = a.value.trim().slice(0, 30), y = b.value.slice(0, 200);
      if (!x || /\s/.test(x)) { a.classList.add('gd-bad'); return; }
      // (what it writes is typed text, escaped as typing escapes it)
      this.prefs.acList = [[x, y.replace(/[\\{}$&#^_%~]/g, (z) => '\\' + z)], ...(this.prefs.acList || []).filter((z) => z[0] !== x)].slice(0, 200);
      save(); a.value = ''; b.value = ''; draw();
    });
    r2.append(lab('Replace', a, 'gd-grow'), lab('With', b, 'gd-grow'), add);
    own.append(r2, listEl);
    draw();
    this.positionPop();
  }
});
