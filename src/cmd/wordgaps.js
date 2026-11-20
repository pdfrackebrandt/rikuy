// Word's buttons Rikuy lacked (PLAN task 67), the document's side of them: the Header & Footer
// tab's Navigation (Go to Header, Go to Footer, Previous, Next), Position (Header from Top, Footer
// from Bottom), Pictures, Quick Parts and Show Document Text. Each writes the smallest edit of the
// source, as LaTeX that compiles on pdfLaTeX, XeLaTeX and LuaLaTeX, and the page draws it as TeX
// prints it. Tables' are in src/cmd/table.js.

import { register, onInstall, command } from '../commands.js';
import { openMenu } from '../ui/kit.js';
import { usePackages, preambleEnd, hasPackage } from '../preamble.js';
import * as PS from '../pagesrc.js';
import { hfOpen, hfInsert } from '../ui/headerfooter.js';
import { readParts, partIsBlock } from '../quickparts.js';
import { dialog, numberField } from '../ui/kit.js';
import { mk } from '../ui/dom.js';
import { segOfSpan, boundary } from '../editor.js';
import { toLinear, linearEdit } from '../unimath.js';

const CM = 72.27 / 2.54, PX_PER_PT = 96 / 72.27;
const always = () => true;
const body = () => document.body.classList;
const OPEN_WHY = 'Open the header or footer first (double click the top or bottom margin)';
const hfOn = (app) => !!app.hf;
// (a look at the caret asks this of two boxes: the preamble's end found once per text of the main file)
// (and whether the page's layout is one the page model reads: KOMA-Script's classes and typearea,
// and memoir, work out their own margins, headsep and footskip, which the model does not read yet
// (the verification of 3d3bfc4: a KOMA header set 1 cm from the top went off the sheet), so the
// boxes say so there, until geometry lays the page out)
let sheetMemo = { text: null, ok: false, why: null, pre: null };
const sheetLook = (app) => {
  if (!(app.model && !app.stale && app.files && app.files.has(app.main)) || (app.model.opts && app.model.opts.cls === 'beamer')) return { ok: false, why: null };
  const t = app.src(app.main);
  if (sheetMemo.text !== t) {
    const end = preambleEnd(t);
    let why = null;
    // (the layout is the preamble's: typing in the body asks nothing again)
    if (end >= 0 && sheetMemo.pre === t.slice(0, end)) why = sheetMemo.why;
    else if (end >= 0) {
      const others = app.preambleOthers ? app.preambleOthers() : [];
      const M = PS.pageMode(t, { others });
      const who = M.byGeometry ? null : M.koma ? 'KOMA-Script\'s class' : M.cls && M.cls.name === 'memoir' ? 'memoir' : hasPackage(t, 'typearea', end, others) ? 'typearea' : null;
      if (who) why = 'Not in this document yet: ' + who + ' works out where the header and footer go, and Rikuy does not read that layout yet. Load geometry (Layout › Margins does) to set them here.';
    }
    sheetMemo = { text: t, ok: end >= 0, why, pre: end >= 0 ? t.slice(0, end) : null };
  }
  return sheetMemo;
};
const sheet = (app) => sheetLook(app).ok;
const hfWhy = (app) => sheetLook(app).why;

const I = {
  toHead: '<path d="M3.5 3.5h13v13h-13zM3.5 7.5h13"/><path d="M10 15V9.5M7.5 12L10 9.5l2.5 2.5"/>',
  toFoot: '<path d="M3.5 3.5h13v13h-13zM3.5 12.5h13"/><path d="M10 5v5.5M7.5 8L10 10.5 12.5 8"/>',
  prev: '<path d="M3.5 5.5h13v9h-13z"/><path d="M11.5 7.5L9 10l2.5 2.5"/>',
  next: '<path d="M3.5 5.5h13v9h-13z"/><path d="M8.5 7.5L11 10l-2.5 2.5"/>',
  pic: '<path d="M3.5 4.5h13v11h-13zM3.5 13.5l3.5-3.5 3 3 2.5-2 4 3.5M13 7.8h.01"/>',
  parts: '<path d="M4 4.5h7v5H4zM9 10.5h7v5H9z"/><path d="M12.5 4.5h3.5v4"/>',
  show: '<path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
  grid: '<path d="M3.5 3.5h13v13h-13z"/><path d="M3.5 7.8h13M3.5 12.2h13M7.8 3.5v13M12.2 3.5v13" stroke-dasharray="1.2 1.4"/>',
  zoom: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 16.5 16.5M6.5 8.5h4M8.5 6.5v4"/>',
  split: '<path d="M3.5 3.5h13v13h-13zM3.5 10h13" /><path d="M7 6.5h6M7 13.5h6"/>',
  vertical: '<path d="M6.5 2.5h7v6h-7zM6.5 11.5h7v6h-7z"/>',
  update: '<path d="M15.5 8A6 6 0 0 0 4.6 7M4.5 12a6 6 0 0 0 10.9 1"/><path d="M4.5 3.5V7H8M15.5 16.5V13H12"/>',
  convert: '<path d="M3.5 6.5h10l-2.5-2.5M16.5 13.5h-10l2.5 2.5"/>',
  text: '<path d="M4 15.5l3-9 3 9M5 12.5h4M12 9.5h4M14 7.5v8"/>',
  unicode: '<path d="M4 5.5v6a3 3 0 0 0 6 0v-6M13 5.5v10M13 5.5h3.5"/>',
  latex: '<path d="M3 5.5v8h4M8.5 13.5l2-8 2 8M9.2 11h2.6M13.5 5.5h4M15.5 5.5v8"/>',
  sign: '<path d="M3 14.5h14"/><path d="M4.5 12c2-4 3-6 4-5s-1 4 1 4 2-3 3.5-3 1 2 2.5 2"/><path d="M3.5 17h6"/>',
  date: '<rect x="3.5" y="4.5" width="13" height="12" rx="1.5"/><path d="M3.5 8h13M7 3v3M13 3v3"/>'
};

// The pages whose header differs from the open one's, in Rikuy's documents: odd and even pages
// in a two sided document (a page of the empty style, \thispagestyle{empty}, has none to edit)
function storyPage(app, dir) {
  const H = app.hf;
  if (!H || !app.layout || !app.layout.g.twoside || !app.plan) return -1;
  const side = (j) => (app.plan[j] && app.plan[j].num % 2 === 0 ? 'E' : 'O');
  const empty = (j) => { try { return app.layout.styleOf(app.plan[j]) === 'empty'; } catch { return false; } };
  const n = app.layout.pages.length;
  for (let j = H.k + dir; j >= 0 && j < n; j += dir) if (!empty(j) && side(j) !== H.side) return j;
  return -1;
}
const STORY_WHY = (app) => (!app.hf ? OPEN_WHY : !app.layout.g.twoside ? 'Every page has this header: Different Odd & Even Pages gives even pages their own.' : 'No page that way has a header of its own.');

// Header from Top and Footer from Bottom as Word measures them: the sheet's top edge to the
// header's top (the top margin less headsep and headheight), the footer's foot to the sheet's
// bottom edge (the sheet, the PDF's page, less the top margin, the text and footskip: not
// \paperheight, which is letter's where nothing sets the sheet, A4); written as geometry's
// headsep and footskip, which leave the text where it is
function hfDist(app, which) {
  if (!app.model || !app.layout) return null;
  const g = app.layout.g;
  return which === 'top' ? g.mt - (g.headsep ?? 25) - (g.headheight ?? 12) : g.ph - g.mt - g.th - (g.footskip ?? 30);
}
function hfDistEdits(app, which, pt) {
  const g = app.layout.g;
  const v = which === 'top' ? g.mt - (g.headheight ?? 12) - pt : g.ph - g.mt - g.th - pt;
  if (!(v >= 0)) return { error: which === 'top' ? 'The header would run into the text: at most ' + fmt(g.mt - (g.headheight ?? 12)) + ' from the top.' : 'The footer would run into the text: at most ' + fmt(g.ph - g.mt - g.th) + ' from the bottom.' };
  const src = app.src(app.main), others = app.preambleOthers();
  // (geometry's includehead and includefoot: the margin is the header's or the footer's place, so
  // it moves to pt and the length takes up the rest; the text stays where it is)
  const M = PS.pageMode(src, { others }), K = M.byGeometry ? M.keys : {};
  const inc = which === 'top' ? K.includehead || K.includeheadfoot || K.includeall : K.includefoot || K.includeheadfoot || K.includeall;
  const hf = which === 'top' ? { headsep: v } : { footskip: v };
  if (inc && K[which === 'top' ? 'nohead' : 'nofoot'] == null) hf[which === 'top' ? 'top' : 'bottom'] = pt;
  return { edits: PS.headFootEdits(src, hf, { others }) };
}
const fmt = (pt) => (Math.round(pt / CM * 100) / 100) + ' cm';

// Header and footer Quick Parts: the fields a header holds, and the Quick Parts saved that are a
// run of words (a paragraph's worth cannot stand in a header)
const HF_FIELDS = [['Page', '\\thepage', null], ['NumPages', '\\pageref{LastPage}', 'lastpage'], ['Date', '\\today', null], ['FileName', '\\jobname', null]];

register(
  // ---- Header & Footer › Navigation ----
  { id: 'hf-goto-header', name: 'Go to Header', label: 'Go to Header', title: 'Go to Header: the header of the page whose footer is open', icon: I.toHead, tab: 'headfoot', group: 'navigation', order: 10,
    synonyms: ['Header', 'Switch to header'], when: (app) => !!app.hf && app.hf.where === 'foot', whyNot: (app) => (app.hf ? 'The header is open.' : OPEN_WHY), run: (app) => hfOpen(app, 'head', { page: app.hf ? app.hf.k : undefined }) },
  { id: 'hf-goto-footer', name: 'Go to Footer', label: 'Go to Footer', title: 'Go to Footer: the footer of the page whose header is open', icon: I.toFoot, tab: 'headfoot', group: 'navigation', order: 20,
    synonyms: ['Footer', 'Switch to footer'], when: (app) => !!app.hf && app.hf.where === 'head', whyNot: (app) => (app.hf ? 'The footer is open.' : OPEN_WHY), run: (app) => hfOpen(app, 'foot', { page: app.hf ? app.hf.k : undefined }) },
  { id: 'hf-prev', name: 'Previous Header or Footer', label: 'Previous', title: 'Previous: the header or footer of the nearest page before this one that has its own (odd and even pages in a two sided document)', icon: I.prev, tab: 'headfoot', group: 'navigation', order: 30,
    synonyms: ['Previous section', 'Previous header'], when: (app) => storyPage(app, -1) >= 0, whyNot: STORY_WHY, run: (app) => { const j = storyPage(app, -1); return j >= 0 && hfOpen(app, app.hf.where, { page: j }); } },
  { id: 'hf-next', name: 'Next Header or Footer', label: 'Next', title: 'Next: the header or footer of the nearest page after this one that has its own (odd and even pages in a two sided document)', icon: I.next, tab: 'headfoot', group: 'navigation', order: 40,
    synonyms: ['Next section', 'Next header'], when: (app) => storyPage(app, 1) >= 0, whyNot: STORY_WHY, run: (app) => { const j = storyPage(app, 1); return j >= 0 && hfOpen(app, app.hf.where, { page: j }); } },
  // ---- Header & Footer › Insert: Pictures, Quick Parts ----
  { id: 'hf-picture', name: 'Header Pictures', label: 'Pictures', title: 'Pictures: a picture (a logo) where the caret is in the header or footer, a line high (\\includegraphics[height=\\baselineskip]{…}, graphicx)', icon: I.pic, tab: 'headfoot', group: 'insert', order: 30,
    synonyms: ['Logo', 'Picture in header', 'Image in header', 'includegraphics'], when: hfOn, whyNot: () => OPEN_WHY,
    run: (app, args) => (args && args.file ? app.hfPicture(args.file, args.blob, args.height) : app.hfPictureChoose()) },
  { id: 'hf-quick-parts', name: 'Header Quick Parts', label: 'Quick Parts', kind: 'menu', title: 'Quick Parts: a field (the page, the pages\' count, the date, the file\'s name) or a Quick Part you saved, where the caret is in the header or footer', icon: I.parts, tab: 'headfoot', group: 'insert', order: 40,
    synonyms: ['Field in header', 'Building blocks', 'NumPages', 'Page X of Y'], when: hfOn, whyNot: () => OPEN_WHY, menuItems: (app) => app.hfPartItems(),
    run: (app, args) => (args && args.tex != null ? app.hfPart(args) : (openMenu(app, app.hfAnchor('hf-quick-parts'), app.hfPartItems(), { label: 'Quick Parts' }), true)) },
  // ---- Header & Footer › Position ----
  { id: 'hf-header-top', name: 'Header from Top', title: 'Header from Top: the sheet\'s top edge to the header (Enter sets it; geometry\'s headsep, the text stays where it is)', tab: 'headfoot', group: 'position', order: 10, kind: 'custom', role: 'spinbutton', el: 'rc-hf-header-top',
    synonyms: ['Header position', 'headsep'], when: (app) => sheet(app) && !hfWhy(app), whyNot: (app) => hfWhy(app) || 'Open a LaTeX document first.', render: (app) => app.hfField('top'), sync: (app) => app.hfFieldSync('top'), run: (app, args) => (args && args.cm != null ? app.hfSetDist('top', args.cm) : false) },
  { id: 'hf-footer-bottom', name: 'Footer from Bottom', title: 'Footer from Bottom: the footer to the sheet\'s bottom edge (Enter sets it; geometry\'s footskip, the text stays where it is)', tab: 'headfoot', group: 'position', order: 20, kind: 'custom', role: 'spinbutton', el: 'rc-hf-footer-bottom',
    synonyms: ['Footer position', 'footskip'], when: (app) => sheet(app) && !hfWhy(app), whyNot: (app) => hfWhy(app) || 'Open a LaTeX document first.', render: (app) => app.hfField('bottom'), sync: (app) => app.hfFieldSync('bottom'), run: (app, args) => (args && args.cm != null ? app.hfSetDist('bottom', args.cm) : false) },
  // ---- Header & Footer › Options: Show Document Text ----
  { id: 'hf-show-text', name: 'Show Document Text', label: 'Show Document Text', title: 'Show Document Text: the page\'s text shown (dimmed) while the header or footer is open; off, only the header and footer show', icon: I.show, tab: 'headfoot', group: 'options', order: 40, kind: 'toggle',
    synonyms: ['Hide text', 'Document text'], when: () => true, on: (app) => !app.hfHideText, run: (app) => { app.hfHideText = !app.hfHideText; app.root.classList.toggle('hf-hide-text', app.hfHideText); app.ribbonSync(); return true; } }
);

export const methods = {
  hfAnchor(id) {
    const b = document.getElementById('rc-' + id);
    const g = b && b.closest('.rb-grp'), gb = g && g.querySelector('.rb-gbtn');
    return b && b.offsetParent ? b : gb && gb.offsetParent ? gb : this.hf ? this.hf.el : this.root;
  },
  // a picture into the open place: chosen from a file, added to the project, a line high
  hfPictureChoose() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf';
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) this.hfPicture(f.name, f); });
    inp.click();
    return true;
  },
  hfPicture(name, blob, height) {
    if (!this.hf) { this.toast(OPEN_WHY); return false; }
    const nm = this.pageAssetName(name, blob);
    const h = String(height || '\\baselineskip').replace(/[^0-9.a-z\\]/gi, '').slice(0, 30) || '\\baselineskip';
    const others = this.preambleOthers();
    return hfInsert(this, '\\includegraphics[height=' + h + ']{' + nm + '}', (src) => usePackages(src, { graphicx: null }, { others }));
  },
  hfPartItems() {
    const parts = readParts(this.prefs.quickParts).filter((x) => !partIsBlock(x.tex) && !/\n/.test(x.tex.trim()) && x.tex.length <= 300);
    return [...HF_FIELDS.map(([name, tex, pk]) => ({ name, title: tex + (pk ? ' (' + pk + ')' : ''), run: () => this.runCommand('hf-quick-parts', { tex, pk }) })),
      ...(parts.length ? [null] : []), ...parts.slice(0, 12).map((x) => ({ name: x.name, title: x.tex.slice(0, 160), run: () => this.runCommand('hf-quick-parts', { tex: x.tex }) }))];
  },
  hfPart(o) {
    if (!this.hf) { this.toast(OPEN_WHY); return false; }
    const others = this.preambleOthers();
    return hfInsert(this, String(o.tex).slice(0, 300), o.pk ? (src) => usePackages(src, { [o.pk]: null }, { others }) : null);
  },
  // the Position group's boxes, as Table Layout's Height and Width are
  hfField(which) {
    const box = document.createElement('label');
    box.className = 'pf-field';
    const lab = document.createElement('span');
    lab.className = 'pf-lab'; lab.textContent = which === 'top' ? 'Header from Top' : 'Footer from Bottom';
    lab.setAttribute('aria-hidden', 'true');
    const inp = document.createElement('input');
    const id = which === 'top' ? 'hf-header-top' : 'hf-footer-bottom';
    inp.type = 'text'; inp.id = 'rc-' + id; inp.className = 'pf-v'; inp.dataset.cmd = id;
    inp.setAttribute('role', 'spinbutton'); inp.setAttribute('aria-label', which === 'top' ? 'Header from Top' : 'Footer from Bottom');
    inp.autocomplete = 'off'; inp.spellcheck = false; inp.inputMode = 'decimal';
    inp.title = which === 'top' ? 'The sheet\'s top edge to the header, in cm' : 'The footer to the sheet\'s bottom edge, in cm';
    const set = (v) => {
      const m = /^\s*([\d.,]+)\s*(cm|mm|in|pt)?\s*$/.exec(String(v));
      if (!m) { this.toast('A length: 1.25 cm, 12 mm, 0.5in.'); this.hfFieldSync(which); return false; }
      const cm = parseFloat(m[1].replace(',', '.')) * ({ cm: 1, mm: 0.1, in: 2.54, pt: 2.54 / 72.27 }[m[2] || 'cm']);
      return this.runCommand(id, { cm });
    };
    inp.addEventListener('keydown', (e) => {
      // (the focus back where it was, the header's place or the page, so the box shows what is written)
      if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; if (this.hf && this.hf.last) this.hf.last.focus(); else this.root.focus({ preventScroll: true }); set(v); }
      else if (e.key === 'Escape') { e.preventDefault(); this.hfFieldSync(which); if (this.hf && this.hf.last) this.hf.last.focus(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = parseFloat(String(inp.value).replace(',', '.')) || 0;
        inp.value = Math.max(0, Math.round((cur + (e.key === 'ArrowUp' ? 0.1 : -0.1)) * 100) / 100) + ' cm';
        set(inp.value);
        setTimeout(() => { const x = document.getElementById(inp.id); if (x) x.focus(); }, 0);
      }
    });
    inp.addEventListener('focus', () => inp.select());
    box.append(lab, inp);
    return box;
  },
  hfFieldSync(which) {
    const inp = document.getElementById(which === 'top' ? 'rc-hf-header-top' : 'rc-hf-footer-bottom');
    if (!inp || document.activeElement === inp) return;
    const why = hfWhy(this);
    const d = why ? null : hfDist(this, which);
    inp.disabled = d == null;
    inp.value = d == null ? '' : fmt(d);
    inp.title = why || (which === 'top' ? 'The sheet\'s top edge to the header, in cm' : 'The footer to the sheet\'s bottom edge, in cm');
  },
  hfSetDist(which, cm) {
    const why = hfWhy(this);
    if (why) { this.toast(why, 7000); return false; }
    const r = hfDistEdits(this, which, cm * CM);
    if (r.error) { this.toast(r.error, 6000); this.hfFieldSync(which); return false; }
    const ok = this.pageEdit(r.edits, 'page-hf');
    // (the open fields follow the header to where TeX now sets it)
    if (this.hf && this.hf.place) setTimeout(() => this.hf && this.hf.place(), 50);
    return ok;
  }
};

// ---- View: Gridlines, Zoom, Split, Vertical ---------------------------------------------------------------
// the zooms Word's Zoom dialog lists
const ZOOMS = [['2', '200%'], ['1', '100%'], ['0.75', '75%'], ['page', 'Page width'], ['text', 'Text width'], ['whole', 'Whole page'], ['many', 'Many pages']];
register(
  { id: 'view-gridlines-page', name: 'Gridlines', label: 'Gridlines', title: 'Gridlines: lines on the page where the text\'s baselines fall, and every centimetre across, to line things up by eye; the screen only', icon: I.grid, tab: 'view', group: 'show', order: 3, kind: 'toggle',
    synonyms: ['Grid', 'Baseline grid', 'Drawing grid'], when: always, on: (app) => !!app.pageGrid, run: (app) => app.viewGrid() },
  { id: 'zoom-dialog', name: 'Zoom dialog', label: 'Zoom', title: 'Zoom…: 200 %, 100 %, 75 %, the page\'s width, the text\'s width, a whole page, many pages, or a percent of your own', icon: I.zoom, tab: 'view', group: 'zoom', order: 5,
    synonyms: ['Zoom', 'Zoom options', 'Text width', 'Many pages', 'Percent'], when: always, run: (app, args) => (args && args.zoom != null ? app.zoomChoose(args.zoom, args) : zoomDialog(app)) },
  { id: 'split-view', name: 'Split', label: 'Split', title: 'Split: a second view of the document under the first, scrolled on its own (a press in it takes the caret there); again to close it', icon: I.split, tab: 'view', group: 'window', order: 10, kind: 'toggle',
    synonyms: ['Split window', 'Two views', 'Remove Split'], when: (app) => !!app.model, on: (app) => !!app.split, run: (app) => app.splitView() },
  { id: 'page-vertical', name: 'Vertical', label: 'Vertical', title: 'Vertical: the pages one under the other, scrolled up and down (Side to Side\'s other half)', icon: I.vertical, tab: 'view', group: 'movement', order: 5, kind: 'toggle',
    synonyms: ['Vertical page movement', 'Scroll', 'One under the other'], when: always, on: () => !body().contains('pg-side'), run: (app) => app.setPagesAcross(0) }
);

// Word's Zoom dialog
function zoomDialog(app) {
  const p = dialog(app, { title: 'Zoom', cls: 'pop-zoom', rect: new DOMRect(Math.max(8, innerWidth / 2 - 180), 110, 0, 0) });
  const cur = app.prefs.zoom === 'fit' ? 'page' : String(app.prefs.zoom);
  const g = mk('div', 'tb-radios zd-radios');
  g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', 'Zoom to');
  const inputs = ZOOMS.map(([v, label]) => {
    const l = mk('label', 'tb-r'), i = mk('input');
    i.type = 'radio'; i.name = 'zd'; i.value = v; i.checked = v === cur; i.setAttribute('aria-label', label);
    l.append(i, mk('span', '', label)); g.append(l);
    return i;
  });
  const many = mk('select', 'tb-sel');
  for (let n = 2; n <= 6; n++) many.add(new Option(n + ' pages', String(n)));
  many.setAttribute('aria-label', 'Pages across');
  const pct = numberField({ id: 'zd-pct', name: 'Percent', value: { value: Math.round((app.px / PX_PER_PT) * 100), unit: '%' }, units: ['%'], step: 10, min: 25, max: 400 });
  const row = (cls, ...k) => { const d = mk('div', cls); d.append(...k); return d; };
  const f = (name, el) => { const l = mk('label', 'tb-f'); l.append(mk('span', 'tb-l', name), el); return l; };
  let typed = false;
  pct.addEventListener('input', () => { typed = true; for (const i of inputs) i.checked = false; });
  const ok = () => {
    const pick = inputs.find((i) => i.checked);
    const z = !pick || typed ? pct.get().value / 100 : pick.value;
    app.closePop(true);
    app.runCommand('zoom-dialog', { zoom: z, pages: +many.value });
  };
  const btns = mk('div', 'tb-btns'), o = mk('button', 'btn primary', 'OK'), c = mk('button', 'btn ghost', 'Cancel');
  o.type = c.type = 'button';
  o.addEventListener('click', ok); c.addEventListener('click', () => app.closePop(true));
  btns.append(c, o);
  p.append(row('tb-sec', g), row('tb-sec', f('Many pages', many), f('Percent', pct)), btns);
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=radio]), select')) { e.preventDefault(); ok(); } });
  app.positionPop();
  (inputs.find((i) => i.checked) || inputs[1]).focus();
  return true;
}

Object.assign(methods, {
  // Zoom's choices: a factor, 'page' (the page's width), 'text' (the text block's), 'whole' (one
  // page in the window), 'many' (o.pages across)
  zoomChoose(z, o = {}) {
    if (z === 'page') return this.zoomPageWidth(), true;
    if (z === 'whole') return this.zoomPages(1);
    if (z === 'many') return this.zoomPages(Math.max(2, Math.min(6, +o.pages || 2)));
    if (z === 'text') {
      const g = this.layout && this.layout.g;
      if (!g) return false;
      this.setPagesAcross(0);
      this.zoomTo(Math.max(0.25, Math.min(4, (this.desk.clientWidth - 40) / (g.tw * PX_PER_PT))), null);
      // (the text block in the middle of the window, its margins out of sight at the sides)
      const pg = this.root.querySelector('.page');
      if (pg) this.desk.scrollLeft = Math.max(0, pg.offsetLeft + g.ml * this.px - 20);
      this.zoomShow();
      return true;
    }
    const f = parseFloat(z);
    if (!(f > 0)) return false;
    this.setPagesAcross(0);
    this.zoomTo(f, null);
    this.zoomShow();
    return true;
  },
  // View › Gridlines: lines at the text's baselines (from its first, topskip down) and every
  // centimetre across the text block, drawn over each page's text area
  viewGrid(on) {
    this.pageGrid = on == null ? !this.pageGrid : !!on;
    this.root.classList.toggle('pg-grid-lines', this.pageGrid);
    const g = this.layout && this.layout.g;
    if (g) { this.root.style.setProperty('--grid-bs', String(g.bs || 12)); this.root.style.setProperty('--grid-top', String(g.pt || 10)); }
    this.ribbonSync();
    return true;
  },
  // Split: the second view, a copy of the pages kept current as they change, scrolled on its own;
  // a press in it puts the caret there in the first view. It is read only, and says so (Word's
  // second pane takes typing; here the first view is the one that edits). Only the pages near its
  // window are copied, at idle time, and only those that changed since: the others stand in as
  // empty pages of their size (the review of PR 84, M5: a whole document copied per edit cost
  // 190 ms a keystroke on a long document).
  splitView(on) {
    const want = on == null ? !this.split : !!on;
    if (want === !!this.split) return true;
    const desk = this.desk;
    if (want) {
      const col = mk('div', 'desk-col');
      col.id = 'desk-col';
      desk.parentNode.insertBefore(col, desk);
      const bar = mk('div', 'split-bar');
      bar.setAttribute('role', 'separator'); bar.setAttribute('aria-label', 'Split');
      bar.setAttribute('aria-orientation', 'horizontal'); bar.setAttribute('aria-valuemin', '15'); bar.setAttribute('aria-valuemax', '85'); bar.setAttribute('aria-valuenow', '50');
      bar.tabIndex = 0;
      bar.title = 'Drag to size the two views (or the arrow keys)';
      const view = mk('section', 'split-view');
      view.id = 'split-view'; view.setAttribute('aria-label', 'Second view of the document (read only)'); view.tabIndex = 0;
      const note = mk('div', 'split-note', 'Second view, read only: a press here puts the caret there in the top view, where you type.');
      col.append(desk, bar, view);
      const S = { col, view, bar, box: null, pages: [], nodes: [], dirty: new Set(), whole: true, timer: 0 };
      const pagesNow = () => [...this.root.children].filter((x) => x.classList && x.classList.contains('page'));
      const strip = (c) => {
        c.removeAttribute('id'); c.removeAttribute('contenteditable'); c.removeAttribute('role'); c.removeAttribute('aria-multiline'); c.removeAttribute('aria-describedby'); c.removeAttribute('spellcheck');
        for (const x of c.querySelectorAll('[id]')) x.removeAttribute('id');
        for (const x of c.querySelectorAll('[contenteditable]')) x.removeAttribute('contenteditable');
        return c;
      };
      const stub = (pg) => { const d = pg.cloneNode(false); strip(d); d.classList.add('split-stub'); d.style.width = pg.offsetWidth + 'px'; d.style.height = pg.offsetHeight + 'px'; return d; };
      const refresh = () => {
        S.timer = 0;
        if (!this.split) return;
        const top = view.scrollTop, left = view.scrollLeft;
        if (S.whole) {
          // (the sheet, whose style holds the page's sizes, and the pages' box, empty)
          const sh = this.root.parentNode.cloneNode(false);
          sh.removeAttribute('id');
          const c = strip(this.root.cloneNode(false));
          c.setAttribute('aria-label', 'Document (second view, read only)');
          c.className = this.root.className + ' split-pages';
          sh.append(c);
          view.replaceChildren(note, sh);
          S.box = c; S.pages = []; S.nodes = []; S.whole = false;
        }
        const P = pagesNow();
        if (P.length !== S.pages.length || P.some((x, k) => x !== S.pages[k])) {
          const was = new Map(S.pages.map((x, k) => [x, S.nodes[k]]));
          S.nodes = P.map((pg) => (!S.dirty.has(pg) && was.get(pg)) || stub(pg));
          S.pages = P;
          S.box.replaceChildren(...S.nodes);
        }
        // the pages the view's window meets, and one either side: copied where a stand in or changed
        const vr = view.getBoundingClientRect();
        let n = 0;
        for (let k = 0; k < P.length; k++) {
          const r = S.nodes[k].getBoundingClientRect();
          if (r.bottom < vr.top - vr.height || r.top > vr.bottom + vr.height) continue;
          if (!S.nodes[k].classList.contains('split-stub') && !S.dirty.has(P[k])) continue;
          const c = strip(P[k].cloneNode(true));
          S.nodes[k].replaceWith(c); S.nodes[k] = c; S.dirty.delete(P[k]);
          // (a few pages a turn: more wait for the next idle time)
          if (++n >= 4) { soon(); break; }
        }
        view.scrollTop = top; view.scrollLeft = left;
      };
      const soon = () => {
        if (S.timer) return;
        S.timer = typeof requestIdleCallback === 'function' ? requestIdleCallback(refresh, { timeout: 400 }) : setTimeout(refresh, 150);
      };
      S.cancel = () => { if (S.timer) (typeof cancelIdleCallback === 'function' ? cancelIdleCallback : clearTimeout)(S.timer); S.timer = 0; };
      const mo = new MutationObserver((recs) => {
        for (const r of recs) {
          const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          if (t === this.root || t === this.root.parentNode) { if (r.type === 'attributes') S.whole = true; continue; }
          const pg = t && t.closest && t.closest('.page');
          if (pg && pg.parentNode === this.root) S.dirty.add(pg);
        }
        soon();
      });
      mo.observe(this.root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
      mo.observe(this.root.parentNode, { attributes: true, attributeFilter: ['class', 'style'] });
      S.onResize = () => { S.whole = true; soon(); };
      addEventListener('resize', S.onResize);
      view.addEventListener('scroll', soon, { passive: true });
      view.addEventListener('click', (e) => {
        const sp = e.target.closest && e.target.closest('[data-g]'), info = sp && segOfSpan(sp);
        if (!info) return;
        this.restoreCaret({ f: info.B.f || this.main, p: boundary(info.B, info.seg, info.o) });
        this.root.focus({ preventScroll: true });
        const r = getSelection().rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : null;
        if (r) desk.scrollTop += r.top - desk.getBoundingClientRect().top - desk.clientHeight / 3;
      });
      // (a key typed while the second view has the focus: it says where typing goes)
      view.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || !(e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter')) return;
        e.preventDefault();
        this.toast('The second view is read only: type in the top view (a press here puts the caret there).', 5000);
      });
      // the bar: dragged with a mouse or a finger, or the arrow keys, between 15 and 85 % of the height
      const share = (f) => {
        f = Math.max(0.15, Math.min(0.85, f));
        desk.style.flex = '0 0 ' + (f * 100).toFixed(1) + '%';
        bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
        S.share = f;
        soon();
      };
      bar.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { bar.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        bar.classList.add('dragging');
        const move = (ev) => { const r = col.getBoundingClientRect(); share((ev.clientY - r.top) / r.height); };
        const up = () => { bar.classList.remove('dragging'); bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
        bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
      });
      bar.addEventListener('keydown', (e) => {
        const d = { ArrowUp: -0.05, ArrowDown: 0.05, PageUp: -0.15, PageDown: 0.15 }[e.key];
        if (d == null && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        share(e.key === 'Home' ? 0.15 : e.key === 'End' ? 0.85 : (S.share ?? 0.5) + d);
      });
      S.mo = mo;
      this.split = S;
      refresh();
      view.scrollTop = desk.scrollTop;
      refresh();
    } else {
      const S = this.split;
      S.mo.disconnect();
      S.cancel();
      removeEventListener('resize', S.onResize);
      desk.style.flex = '';
      S.col.parentNode.insertBefore(desk, S.col);
      S.col.remove();
    }
    if (!want) this.split = null;
    body().toggle('split-on', want);
    if (this.computePx && this.computePx()) this.relayout(true);
    this.ribbonSync();
    return true;
  }
});

// ---- References: Update Table, Update Index -----------------------------------------------------------------
// What updating means here: the page's lists are drawn from the source at every keystroke, so
// they are current already, and Update rebuilds them at once and shows them; the PDF's take
// TeX's passes, which its next compile runs (now, where the PDF is open)
const LISTS = {
  toc: { re: /\\tableofcontents(?![A-Za-z@])/, sel: '.toc', what: 'The table of contents' },
  tof: { re: /\\listof(?:figures|tables)(?![A-Za-z@])/, sel: '.toc', what: 'The table of figures' },
  toa: { re: /\\printindex\s*\[\s*toa\s*\]/, sel: '.refs-h, .idx-e', what: 'The table of authorities' },
  index: { re: /\\printindex(?!\s*\[\s*toa\s*\])(?![A-Za-z@])/, sel: '.refs-h, .idx-e', what: 'The index' }
};
const hasList = (app, k) => !!app.files && [...app.files.entries()].some(([n, t]) => /\.(tex|ltx)$/i.test(n) && LISTS[k].re.test(String(t).replace(/(^|[^\\])%[^\n]*/g, '$1')));
const upd = (id, k, name, group, order, title, syn) => ({ id, name, label: name, title, icon: I.update, tab: 'references', group, order, synonyms: syn,
  when: (app) => !!app.model && hasList(app, k), whyNot: () => LISTS[k].what + ' is not in the document yet: insert it first.', run: (app) => app.refsUpdate(k) });
register(
  upd('update-toc', 'toc', 'Update Table', 'toc', 15, 'Update Table: the table of contents rebuilt on the page now, and in the PDF at its next compile (TeX\'s passes)', ['Update table of contents', 'Refresh contents', 'Update field']),
  upd('update-tof', 'tof', 'Update Table of Figures', 'captions', 25, 'Update Table: the lists of figures and tables rebuilt on the page now, and in the PDF at its next compile', ['Update list of figures', 'Update list of tables']),
  upd('update-index', 'index', 'Update Index', 'index', 30, 'Update Index: the index rebuilt on the page now, and in the PDF at its next compile (makeindex runs then)', ['Refresh index', 'Rebuild index']),
  upd('update-toa', 'toa', 'Update Table of Authorities', 'authorities', 30, 'Update Table: the table of authorities rebuilt on the page now, and in the PDF at its next compile (makeindex runs then)', ['Update authorities', 'Refresh table of authorities'])
);

// ---- Equation: Convert (Professional, Linear), Unicode or LaTeX, Normal Text, Equation Options ------------------
const mfOf = (app) => { const P = app.eqPop && app.eqPop(); return P ? P.el.querySelector('math-field') : null; };
const fieldOpen = (app) => !!mfOf(app);
const FIELD_WHY = 'Open an equation first (click it, or Insert › Equation)';
register(
  { id: 'eq-convert', name: 'Convert', label: 'Convert', kind: 'menu', title: 'Convert: the equation as Word\'s Linear format (a text, (a+b)/c, in Unicode or LaTeX as chosen beside) or back to Professional (built up)', icon: I.convert, tab: 'equation', group: 'conversions', order: 5,
    synonyms: ['Linear', 'Professional', 'Build up', 'UnicodeMath'], when: fieldOpen, whyNot: () => FIELD_WHY,
    menuItems: (app) => [{ name: 'Professional', title: 'Built up, as it prints', checked: !app.eqLinearOn(), radio: true, run: () => app.runCommand('eq-convert', { to: 'professional' }) },
      { name: 'Linear', title: app.prefs.eqFormat === 'latex' ? 'Its LaTeX, to type in' : 'Word\'s UnicodeMath, to type in: (a+b)/c, x^2, √(x)', checked: app.eqLinearOn(), radio: true, run: () => app.runCommand('eq-convert', { to: 'linear' }) }],
    run: (app, args) => (args && args.to ? app.eqConvert(args.to) : (openMenu(app, app.hfAnchor('eq-convert'), app.commandMenu(command('eq-convert')), { label: 'Convert' }), true)) },
  { id: 'eq-unicode', name: 'Unicode', label: 'Unicode', kind: 'toggle', title: 'Unicode: Linear shows and reads Word\'s UnicodeMath, (a+b)/c', icon: I.unicode, tab: 'equation', group: 'conversions', order: 6,
    synonyms: ['UnicodeMath', 'Linear format'], when: always, on: (app) => app.prefs.eqFormat !== 'latex', run: (app) => app.eqFormat('unicode') },
  { id: 'eq-latex-format', name: 'LaTeX format', label: 'LaTeX', kind: 'toggle', title: 'LaTeX: Linear shows and reads the equation\'s LaTeX, \\frac{a+b}{c}', icon: I.latex, tab: 'equation', group: 'conversions', order: 7,
    synonyms: ['LaTeX input', 'Linear LaTeX'], when: always, on: (app) => app.prefs.eqFormat === 'latex', run: (app) => app.eqFormat('latex') },
  { id: 'eq-normal-text', name: 'Normal Text', label: 'Normal Text', kind: 'toggle', title: 'Normal Text: what you type next is words, upright (\\text{…}); again for maths', icon: I.text, tab: 'equation', group: 'conversions', order: 8,
    synonyms: ['Text in equation', 'abc', 'text'], when: fieldOpen, whyNot: () => FIELD_WHY, on: (app) => { const mf = mfOf(app); return !!mf && mf.mode === 'text'; }, run: (app) => app.eqNormalText() },
  { id: 'eq-options', name: 'Equation Options', title: 'Equation Options…: what Alt+= makes on an empty line (numbered, unnumbered, or a display with no number), and the Linear format (Unicode or LaTeX)', icon: I.convert,
    synonyms: ['Equation settings', 'Math options', 'Default equation'], when: always, run: (app, args) => (args ? app.eqOptions(args) : eqOptionsDialog(app)) }
);

// Equation Options (the Tools group's corner arrow)
function eqOptionsDialog(app) {
  const p = dialog(app, { title: 'Equation Options', cls: 'pop-eqopt', rect: new DOMRect(Math.max(8, innerWidth / 2 - 180), 110, 0, 0) });
  const rg = (name, items, val) => {
    const g = mk('div', 'tb-radios'); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', name); g.append(mk('div', 'tb-gl', name));
    const ins = items.map(([v, label]) => { const l = mk('label', 'tb-r'), i = mk('input'); i.type = 'radio'; i.name = 'eo-' + name.length; i.value = v; i.checked = v === val; i.setAttribute('aria-label', label); l.append(i, mk('span', '', label)); g.append(l); return i; });
    g.value = () => (ins.find((i) => i.checked) || ins[0]).value;
    return g;
  };
  const env = rg('New equations on an empty line', [['equation', 'Numbered (equation)'], ['equation*', 'Unnumbered (equation*)'], ['\\[', 'Display, no number']], app.prefs.eqNewEnv || 'equation');
  const fmt = rg('Linear format', [['unicode', 'Unicode (UnicodeMath)'], ['latex', 'LaTeX']], app.prefs.eqFormat === 'latex' ? 'latex' : 'unicode');
  const note = mk('p', 'tb-note', 'Alt+= in a sentence makes a formula in the line ($…$), as in Word.');
  const btns = mk('div', 'tb-btns'), o = mk('button', 'btn primary', 'OK'), c = mk('button', 'btn ghost', 'Cancel');
  o.type = c.type = 'button';
  o.addEventListener('click', () => { const v = { newEnv: env.value(), format: fmt.value() }; app.closePop(true); app.runCommand('eq-options', v); });
  c.addEventListener('click', () => app.closePop(true));
  btns.append(c, o);
  const sec = (k) => { const d = mk('div', 'tb-sec'); d.append(k); return d; };
  p.append(sec(env), sec(fmt), note, btns);
  app.positionPop();
  p.querySelector('input:checked').focus();
  return true;
}

// ---- Insert: Signature Line ------------------------------------------------------------------------------
// Word's Signature Line as LaTeX: space to sign in, a rule, the signer's name, title and e-mail,
// the date (\today) if asked; a block after the caret's paragraph
export function signatureTex(o = {}) {
  const esc = (t) => String(t || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200).replace(/[\\{}]/g, '').replace(/[&%$#_]/g, (m) => '\\' + m).replace(/\^/g, '\\textasciicircum{}').replace(/~/g, '\\textasciitilde{}');
  const lines = [esc(o.name), esc(o.title), esc(o.email)].filter(Boolean);
  if (o.date) lines.push('\\today');
  const w = /^\d+(\.\d+)?(cm|mm|in|pt)$/.test(String(o.width || '')) ? o.width : '6cm';
  // (\\* between the lines: no page break between the line and the words under it)
  return '\\par\\bigskip\\bigskip\n\\noindent\\rule{' + w + '}{0.4pt}' + (lines.length ? '\\\\*\n' + lines.join('\\\\*\n') : '') + '\\par\n';
}
register(
  { id: 'signature-line', name: 'Signature Line', label: 'Signature Line', title: 'Signature Line…: room to sign, a line, the signer\'s name, title and e-mail, and the date if you like, after the paragraph the caret is in', icon: I.sign, tab: 'insert', group: 'text', order: 60,
    synonyms: ['Signature', 'Sign here', 'Signature block'], when: (app, at) => !!at && !!app.model, whyNot: () => 'Put the caret in the text first',
    run: (app, args) => (args ? app.blockCommand(signatureTex(args)) : signatureDialog(app)) }
);
function signatureDialog(app) {
  const s = getSelection(); app.rbRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  const p = dialog(app, { title: 'Signature Setup', cls: 'pop-sign', rect: new DOMRect(Math.max(8, innerWidth / 2 - 180), 110, 0, 0) });
  const field = (name, val = '') => { const l = mk('label', 'tb-f'), i = mk('input', 'tb-ftext'); i.type = 'text'; i.value = val; i.setAttribute('aria-label', name); l.append(mk('span', 'tb-l', name), i); l.input = i; return l; };
  const n = field('Suggested signer'), t = field('Suggested signer\'s title'), e = field('Suggested signer\'s e-mail address');
  const d = mk('label', 'tb-ck'), di = mk('input'); di.type = 'checkbox'; di.checked = true; di.setAttribute('aria-label', 'Show sign date in signature line'); d.append(di, mk('span', '', 'Show sign date in signature line'));
  const btns = mk('div', 'tb-btns'), o = mk('button', 'btn primary', 'OK'), c = mk('button', 'btn ghost', 'Cancel');
  o.type = c.type = 'button';
  const ok = () => {
    const v = { name: n.input.value, title: t.input.value, email: e.input.value, date: di.checked };
    const r = app.rbRange;
    app.closePop(true);
    app.root.focus({ preventScroll: true });
    if (r && app.root.contains(r.startContainer)) { const g = getSelection(); g.removeAllRanges(); g.addRange(r); }
    app.runCommand('signature-line', v);
  };
  o.addEventListener('click', ok); c.addEventListener('click', () => app.closePop(true));
  btns.append(c, o);
  const sec = mk('div', 'tb-sec'); sec.append(n, t, e, d);
  p.append(sec, mk('p', 'tb-note', 'LaTeX draws the line and the words; the PDF is signed afterwards in a PDF reader, as Word\'s line is.'), btns);
  p.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('input[type=text]')) { ev.preventDefault(); ok(); } });
  app.positionPop();
  n.input.focus();
  return true;
}

Object.assign(methods, {
  refsUpdate(k) {
    const L = LISTS[k];
    if (!L || !hasList(this, k)) { this.toast(L ? L.what + ' is not in the document yet.' : 'Nothing to update.'); return false; }
    this.forceRender = true;
    this.rebuild();
    // (shown: the list flashes where it stands on the page)
    requestAnimationFrame(() => {
      const els = [...this.root.querySelectorAll(L.sel)];
      for (const el of els) { el.classList.remove('rk-updated'); void el.offsetWidth; el.classList.add('rk-updated'); }
      setTimeout(() => { for (const el of els) el.classList.remove('rk-updated'); }, 1400);
    });
    const pdf = document.body.classList.contains('pdf-on');
    if (pdf && this.compilePdf) this.compilePdf(); else this.pdfStale = true;
    this.toast(L.what + ' is up to date on the page' + (pdf ? '; the PDF is being made with it now.' : '; the PDF takes it at its next compile.'), 5000);
    return true;
  },
  eqLinearOn() { const P = this.eqPop && this.eqPop(); return !!(P && P.el.querySelector('#pop-lin') && !P.el.querySelector('#pop-lin').hidden); },
  eqFormat(f) {
    const was = this.prefs.eqFormat === 'latex' ? 'latex' : 'unicode';
    this.prefs.eqFormat = f === 'latex' ? 'latex' : 'unicode';
    this.savePrefs();
    // (Linear open: it shows the new format at once)
    if (this.eqLinearOn() && was !== this.prefs.eqFormat) { this.eqConvert('professional'); this.eqConvert('linear'); }
    this.ribbonSync();
    return true;
  },
  // Convert: Linear shows the equation as a text in the chosen format, which writes the source as
  // it is typed; Professional the field again
  eqConvert(to) {
    const P = this.eqPop && this.eqPop();
    if (!P) { this.toast(FIELD_WHY); return false; }
    const ta = P.el.querySelector('#pop-tex'), mf = P.el.querySelector('math-field');
    if (!ta) return false;
    let lin = P.el.querySelector('#pop-lin');
    if (to === 'linear') {
      if (this.prefs.eqFormat === 'latex') {
        if (lin) lin.hidden = true;
        P.el.classList.add('eq-linear-latex');
        if (mf) mf.hidden = true;
        ta.focus();
        this.ribbonSync();
        return true;
      }
      if (!lin) {
        lin = mk('textarea', 'code pop-lin');
        lin.id = 'pop-lin'; lin.spellcheck = false; lin.rows = 2;
        lin.setAttribute('aria-label', 'The equation, in Word\'s linear format');
        const note = mk('div', 'pop-lin-note');
        note.id = 'pop-lin-note'; note.setAttribute('role', 'status'); note.hidden = true;
        lin.setAttribute('aria-describedby', note.id);
        const say = (t) => { note.textContent = t || ''; note.hidden = !t; };
        // What is typed is written into the source only where it reads back as it was typed
        // (src/unimath.js linearEdit: the equation into the box and out again unchanged, only the
        // typed part replaced); otherwise on Enter, as Word builds an equation up then
        const write = (enter) => {
          // (typed back to what it showed first: the first bytes again; otherwise from what was last
          // written, so each change is merged on its own and the rest keeps its bytes)
          const back = lin.value === lin.firstText;
          const r = back ? { tex: lin.origTex, live: true } : linearEdit(lin.lastTex, lin.value, lin.lastText);
          if (r.error) { say(r.error); return false; }
          // (a command's name still being typed, \alp, waits for its end)
          const typing = /\\[A-Za-z]*$/.test(lin.value.slice(0, lin.selectionStart));
          if (!enter && (!r.live || typing)) { say(r.live ? '' : 'Enter writes this into the equation: ' + (r.why === 'source' ? 'the equation has LaTeX the linear format would change.' : 'what you typed is not read back the same yet.')); return false; }
          say('');
          lin.lastTex = r.tex; lin.lastText = lin.value;
          if (r.tex !== ta.value) { ta.value = r.tex; ta.dispatchEvent(new Event('input')); }
          return true;
        };
        lin.addEventListener('input', () => write(false));
        lin.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); if (write(true)) this.eqConvert('professional'); } });
        (mf || ta).before(lin);
        lin.after(note);
      }
      const L = toLinear(ta.value);
      lin.origTex = lin.lastTex = ta.value;
      lin.value = lin.firstText = lin.lastText = L == null ? ta.value : L;
      lin.readOnly = L == null;
      const note = P.el.querySelector('#pop-lin-note');
      if (note) { note.textContent = L == null ? 'Too many brackets inside one another for the linear format: edit it as LaTeX.' : ''; note.hidden = L != null; }
      lin.hidden = false;
      if (mf) mf.hidden = true;
      P.el.classList.remove('eq-linear-latex');
      lin.focus();
    } else {
      if (lin) lin.hidden = true;
      const note = P.el.querySelector('#pop-lin-note');
      if (note) note.hidden = true;
      P.el.classList.remove('eq-linear-latex');
      if (mf) { mf.hidden = false; mf.focus(); }
    }
    this.positionPop();
    this.ribbonSync();
    return true;
  },
  eqNormalText() {
    const mf = mfOf(this);
    if (!mf) { this.toast(FIELD_WHY); return false; }
    try { mf.executeCommand(['switchMode', mf.mode === 'text' ? 'math' : 'text']); } catch { return false; }
    mf.focus();
    this.ribbonSync();
    return true;
  },
  eqOptions(o) {
    if (o.newEnv && /^(equation\*?|\\\[)$/.test(o.newEnv)) this.prefs.eqNewEnv = o.newEnv;
    if (o.format) this.prefs.eqFormat = o.format === 'latex' ? 'latex' : 'unicode';
    this.savePrefs();
    this.toast('Equation Options kept: Alt+= on an empty line makes ' + ({ equation: 'a numbered equation', 'equation*': 'an unnumbered equation', '\\[': 'a display with no number' }[this.prefs.eqNewEnv || 'equation']) + '; Linear is ' + (this.prefs.eqFormat === 'latex' ? 'LaTeX' : 'Unicode') + '.', 5000);
    this.ribbonSync();
    return true;
  }
});

onInstall(() => {});
