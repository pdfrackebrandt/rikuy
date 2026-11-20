// Word's buttons Rikuy lacked (PLAN task 67), the document's side of them: the Header & Footer
// tab's Navigation (Go to Header, Go to Footer, Previous, Next), Position (Header from Top, Footer
// from Bottom), Pictures, Quick Parts and Show Document Text. Each writes the smallest edit of the
// source, as LaTeX that compiles on pdfLaTeX, XeLaTeX and LuaLaTeX, and the page draws it as TeX
// prints it. Tables' are in src/cmd/table.js.

import { register, onInstall } from '../commands.js';
import { openMenu } from '../ui/kit.js';
import { usePackages, preambleEnd } from '../preamble.js';
import * as PS from '../pagesrc.js';
import { hfOpen, hfInsert } from '../ui/headerfooter.js';
import { readParts, partIsBlock } from '../quickparts.js';

const CM = 72.27 / 2.54;
const OPEN_WHY = 'Open the header or footer first (double click the top or bottom margin)';
const hfOn = (app) => !!app.hf;
const sheet = (app) => !!(app.model && !app.stale && app.files && app.files.has(app.main) && preambleEnd(app.src(app.main)) >= 0 && !(app.model.opts && app.model.opts.cls === 'beamer'));

const I = {
  toHead: '<path d="M3.5 3.5h13v13h-13zM3.5 7.5h13"/><path d="M10 15V9.5M7.5 12L10 9.5l2.5 2.5"/>',
  toFoot: '<path d="M3.5 3.5h13v13h-13zM3.5 12.5h13"/><path d="M10 5v5.5M7.5 8L10 10.5 12.5 8"/>',
  prev: '<path d="M3.5 5.5h13v9h-13z"/><path d="M11.5 7.5L9 10l2.5 2.5"/>',
  next: '<path d="M3.5 5.5h13v9h-13z"/><path d="M8.5 7.5L11 10l-2.5 2.5"/>',
  pic: '<path d="M3.5 4.5h13v11h-13zM3.5 13.5l3.5-3.5 3 3 2.5-2 4 3.5M13 7.8h.01"/>',
  parts: '<path d="M4 4.5h7v5H4zM9 10.5h7v5H9z"/><path d="M12.5 4.5h3.5v4"/>',
  show: '<path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>'
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
// bottom edge (the paper less the top margin, the text and footskip); written as geometry's
// headsep and footskip, which leave the text where it is
function hfDist(app, which) {
  if (!app.model || !app.layout) return null;
  const g = app.layout.g;
  return which === 'top' ? g.mt - (g.headsep ?? 25) - (g.headheight ?? 12) : (g.paperH || g.ph) - g.mt - g.th - (g.footskip ?? 30);
}
function hfDistEdits(app, which, pt) {
  const g = app.layout.g;
  const v = which === 'top' ? g.mt - (g.headheight ?? 12) - pt : (g.paperH || g.ph) - g.mt - g.th - pt;
  if (!(v >= 0)) return { error: which === 'top' ? 'The header would run into the text: at most ' + fmt(g.mt - (g.headheight ?? 12)) + ' from the top.' : 'The footer would run into the text: at most ' + fmt((g.paperH || g.ph) - g.mt - g.th) + ' from the bottom.' };
  return { edits: PS.headFootEdits(app.src(app.main), which === 'top' ? { headsep: v } : { footskip: v }, { others: app.preambleOthers() }) };
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
  { id: 'hf-picture', name: 'Header Picture', label: 'Pictures', title: 'Pictures: a picture (a logo) where the caret is in the header or footer, a line high (\\includegraphics[height=\\baselineskip]{…}, graphicx)', icon: I.pic, tab: 'headfoot', group: 'insert', order: 30,
    synonyms: ['Logo', 'Picture in header', 'Image in header', 'includegraphics'], when: hfOn, whyNot: () => OPEN_WHY,
    run: (app, args) => (args && args.file ? app.hfPicture(args.file, args.blob, args.height) : app.hfPictureChoose()) },
  { id: 'hf-quick-parts', name: 'Header Quick Parts', label: 'Quick Parts', kind: 'menu', title: 'Quick Parts: a field (the page, the pages\' count, the date, the file\'s name) or a Quick Part you saved, where the caret is in the header or footer', icon: I.parts, tab: 'headfoot', group: 'insert', order: 40,
    synonyms: ['Field in header', 'Building blocks', 'NumPages', 'Page X of Y'], when: hfOn, whyNot: () => OPEN_WHY, menuItems: (app) => app.hfPartItems(),
    run: (app, args) => (args && args.tex != null ? app.hfPart(args) : (openMenu(app, app.hfAnchor('hf-quick-parts'), app.hfPartItems(), { label: 'Quick Parts' }), true)) },
  // ---- Header & Footer › Position ----
  { id: 'hf-header-top', name: 'Header from Top', title: 'Header from Top: the sheet\'s top edge to the header (Enter sets it; geometry\'s headsep, the text stays where it is)', tab: 'headfoot', group: 'position', order: 10, kind: 'custom', role: 'spinbutton', el: 'rc-hf-header-top',
    synonyms: ['Header position', 'headsep'], when: sheet, render: (app) => app.hfField('top'), sync: (app) => app.hfFieldSync('top'), run: (app, args) => (args && args.cm != null ? app.hfSetDist('top', args.cm) : false) },
  { id: 'hf-footer-bottom', name: 'Footer from Bottom', title: 'Footer from Bottom: the footer to the sheet\'s bottom edge (Enter sets it; geometry\'s footskip, the text stays where it is)', tab: 'headfoot', group: 'position', order: 20, kind: 'custom', role: 'spinbutton', el: 'rc-hf-footer-bottom',
    synonyms: ['Footer position', 'footskip'], when: sheet, render: (app) => app.hfField('bottom'), sync: (app) => app.hfFieldSync('bottom'), run: (app, args) => (args && args.cm != null ? app.hfSetDist('bottom', args.cm) : false) },
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
      if (e.key === 'Enter') { e.preventDefault(); set(inp.value); }
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
    const d = hfDist(this, which);
    inp.disabled = d == null;
    inp.value = d == null ? '' : fmt(d);
  },
  hfSetDist(which, cm) {
    const r = hfDistEdits(this, which, cm * CM);
    if (r.error) { this.toast(r.error, 6000); this.hfFieldSync(which); return false; }
    const ok = this.pageEdit(r.edits, 'page-hf');
    // (the open fields follow the header to where TeX now sets it)
    if (this.hf && this.hf.place) setTimeout(() => this.hf && this.hf.place(), 50);
    return ok;
  }
};

onInstall(() => {});
