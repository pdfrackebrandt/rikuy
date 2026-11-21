// Interactive graphs as an edge (task 70): Graph this, an equation of the document drawn as a live
// graph below it (src/graphthis.js reads the equation; Insert's graph writes it, src/cmd/insert.js),
// from the right click menu of an equation, the Equation tab and the search box; and File's
// Export as, "Web page with live graphs" (src/webpage.js).
import { register } from '../commands.js';
import { graphThis, paramValues } from '../graphthis.js';
import { absAtom } from '../editor.js';
import { webPage, sourceFiles, stripComments } from '../webpage.js';
import { dialog } from '../ui/kit.js';
import { mk } from '../ui/dom.js';
import { packShare } from '../share.js';
import { readGraph, graphCanvas, graphShort } from '../graph.js';

const ICON = '<path d="M3 16.5h14M3.5 16V3.5"/><path d="M5 14c2.5-1 4-4 5.5-7.5S14 4 16 4"/><path d="M12.5 13.5l2.2-2.2m0 0 2.2-2.2m-2.2 2.2-2.2-2.2m2.2 2.2 2.2 2.2" stroke-width="1.3"/>';
const NONE = 'Right click an equation, or put the caret in a paragraph with one';

register(
  { id: 'graph-this', name: 'Graph this', label: 'Graph this', tab: 'equation', group: 'tools', order: 40, menu: { equation: 2 }, icon: ICON,
    title: 'Graph this: the equation drawn as a live graph below it, every other letter a slider (y = f(x), f(x), x = g(t) and y = h(t), F(x, y) = c, a pair of time derivatives). One undo takes it out',
    synonyms: ['Plot this', 'Plot equation', 'Graph equation', 'Draw this equation', 'Live graph of this equation', 'Interactive graph of this equation', 'Desmos'],
    when: (app, at) => !!app.graphThisTarget(at), whyNot: () => NONE,
    run: (app, args, at) => app.graphThisRun(at) },
  // (also in File's Export as list, src/cmd/file.js)
  { id: 'export-web-page', name: 'Web page with live graphs', title: 'Export as one .html file that reads like the paper, its math set, its interactive graphs live, with a link that opens the source in Rikuy: for a website',
    synonyms: ['Export as web page', 'Export HTML', 'Publish', 'Website', 'Interactive web page', 'Live web page', 'HTML with graphs'],
    when: (app) => !!app.model, whyNot: () => 'The page cannot show the document as it is now', run: (app, args) => app.exportWebPage(args) }
);

export const methods = {
  // The equation Graph this draws: the one open in its field or right clicked (the Equation tab's
  // and the menu's), else the one the caret is in, else the block's first display equation, else
  // its first in the line. { f, s, e, inner, display } or null
  // (at: where the caret was, as the search box keeps it while it has the focus)
  graphThisTarget(at) {
    if (!this.model || this.stale) return null;
    const T = this.eqTarget && this.eqTarget();
    if (T && T.info && T.inner) return { f: T.f, s: T.s, e: T.e, inner: T.inner, display: T.display };
    at = at || (this.ribbonAt && this.ribbonAt());
    if (!at || !at.B || !at.B.atoms) return null;
    const mine = at.el && at.el.closest && at.el.closest('[data-a],[data-m]');
    const id = mine && (mine.dataset.a || mine.dataset.m);
    const math = at.B.atoms.filter((a) => a.kind === 'math' && a.is != null);
    const a = (id && at.B.atoms[+id.slice(id.indexOf('.') + 1)] && at.B.atoms[+id.slice(id.indexOf('.') + 1)].kind === 'math' ? at.B.atoms[+id.slice(id.indexOf('.') + 1)] : null) || math.find((x) => x.display) || math[0];
    if (!a) return null;
    const p = absAtom(at.B, a), src = this.src(p.f);
    return { f: p.f, s: p.s, e: p.e, inner: src.slice(p.is, p.ie), display: !!a.display };
  },

  // Graph this: the description from the equation, inserted after the equation's block as Insert's
  // graph is (its file, its picture, the command; one undo), and what was drawn said in words
  async graphThisRun(at) {
    const T = this.graphThisTarget(at);
    if (!T) { this.toast(NONE); return false; }
    let values = {};
    for (const [f, t] of this.files) if (/\.(tex|ltx)$/i.test(f) && t.length < 2e6) values = { ...paramValues(t), ...values };
    const r = graphThis(T.inner, { values });
    if (r.error) { this.toast('Graph this: ' + r.error + '.', 7000); return false; }
    if (this.eqPop && this.eqPop()) this.closePop();
    this.eqCtx = null;
    await this.graphInsert(r.spec, '', { f: T.f, after: T.e });
    // (the values the document's math gave, named: a slider that starts there is no surprise)
    const used = r.spec.sliders.filter((q) => Object.prototype.hasOwnProperty.call(values, q.name) && values[q.name] === q.value).map((q) => q.name + ' = ' + q.value);
    this.toast('Graph this: ' + r.what + (used.length ? '; from the document, ' + used.join(', ') : '') + '. Drag a slider; Edit graph changes the rest.', 7000);
    return true;
  },

  // A graph's drawing at its starting values, W CSS pixels wide at scale times the pixels, as a
  // PNG's data: what the page shows where it cannot run the graph, and what test/graphs.py holds
  // TeX's picture against
  graphDrawn(path, W, scale = 2) {
    const spec = readGraph(this.files.get(path));
    return spec ? graphCanvas(spec, W, scale).toDataURL('image/png') : null;
  },

  // File › Export as › Web page with live graphs: one .html file (src/webpage.js), downloaded.
  // Its "Open in Rikuy" link is a #share= link of the main file and the files it reads (none of
  // the project's other files), their % comments left out unless asked; the dialog says what it
  // carries and can leave it out. args { link, comments } skip the dialog (an agent, a test).
  async exportWebPage(args) {
    if (!this.model) return false;
    if (!args || typeof args !== 'object' || !('link' in args)) return this.webPageDialog();
    if (this.webBusy) return false;
    this.webBusy = true;
    try {
      this.toast('Making the web page…', 60000);
      const model = this.plainModel ? this.plainModel() : this.model;
      let openUrl = null;
      if (args.link) {
        try {
          const files = sourceFiles(this.files, this.main).map((n) => [n, this.files.get(n)]).filter(([, t]) => t.length < 2e6)
            .map(([n, t]) => [n, !args.comments && /\.(tex|ltx|sty|cls)$/i.test(n) ? stripComments(t, n) : t]);
          const u = this.shareBase() + '#share=' + await packShare({ v: 1, name: this.name || this.main, main: this.main, files }, graphShort);
          // (an address past about 2 MB is one no browser opens)
          if (u.length < 1.9e6) openUrl = u;
        } catch (e) { /* no link */ }
      }
      const html = await webPage({ model, files: this.files, main: this.main, name: this.name, assets: this.assetBlobs, graphs: this.graphFallbacks(), katex: window.katex, openUrl, pdfPicture: (b) => this.pdfPicture(b), lang: (model.opts && model.opts.lang) || 'en' });
      const blob = new Blob([html], { type: 'text/html' });
      const fname = ((this.name || '').replace(/\.tex$/i, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'paper') + '.html';
      const D = this.caps && this.caps.downloads;
      if (D) await D.save({ filename: fname, data: blob });
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      this.lastExport = { name: fname, size: blob.size, blob };
      this.toast('Saved ' + fname + ': open it in any browser, or put it on your website. Its graphs are live' + (openUrl ? '; its Open in Rikuy link carries the source.' : '.'), 6000);
      return true;
    } catch (e) {
      if (!(e && e.code === 'declined')) this.toast('Could not make the web page: ' + ((e && e.message) || e), 8000);
      return false;
    } finally { this.webBusy = false; }
  },
  // What the web page's link carries, said before it is made, and the choice to leave it out
  webPageDialog() {
    const names = sourceFiles(this.files, this.main);
    const p = dialog(this, { title: 'Web page with live graphs', cls: 'pop-web', rect: new DOMRect(Math.max(8, innerWidth / 2 - 230), 110, 0, 0) });
    const box = (text, on) => { const l = mk('label', 'gd-ck'), c = mk('input'); c.type = 'checkbox'; c.checked = on; l.append(c, mk('span', '', text)); return [l, c]; };
    const [l1, link] = box('Add an “Open in Rikuy” link to the page', true);
    const [l2, keep] = box('Keep the source\'s % comments in it', false);
    const what = mk('p', 'fd-note', 'The link carries the source: ' + names.slice(0, 6).join(', ') + (names.length > 6 ? ' and ' + (names.length - 6) + ' more' : '') + '. Anyone with the page can open it. The project\'s other files stay out.');
    const ok = mk('button', 'btn sm', 'Export'); ok.type = 'button';
    const cancel = mk('button', 'btn ghost sm', 'Cancel'); cancel.type = 'button';
    const row = mk('div', 'fd-btns');
    row.append(mk('span', 'grow'), ok, cancel);
    const sync = () => { what.hidden = !link.checked; l2.hidden = !link.checked; };
    link.addEventListener('change', sync);
    p.append(mk('p', 'fd-note', 'One .html file that reads like the paper: its math set, its graphs live in sandboxed frames, no request out.'), l1, what, l2, row);
    cancel.addEventListener('click', () => this.closePop());
    ok.addEventListener('click', () => { const a = { link: link.checked, comments: keep.checked }; this.closePop(); this.exportWebPage(a); });
    this.positionPop();
    ok.focus();
    return true;
  }
};
