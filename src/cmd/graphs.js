// Interactive graphs as an edge (task 70): Graph this, an equation of the document drawn as a live
// graph below it (src/graphthis.js reads the equation; Insert's graph writes it, src/cmd/insert.js),
// from the right click menu of an equation, the Equation tab and the search box; and File's
// Export as, "Web page with live graphs" (src/webpage.js).
import { register } from '../commands.js';
import { graphThis, paramValues } from '../graphthis.js';
import { absAtom } from '../editor.js';

const ICON = '<path d="M3 16.5h14M3.5 16V3.5"/><path d="M5 14c2.5-1 4-4 5.5-7.5S14 4 16 4"/><path d="M12.5 13.5l2.2-2.2m0 0 2.2-2.2m-2.2 2.2-2.2-2.2m2.2 2.2 2.2 2.2" stroke-width="1.3"/>';
const NONE = 'Right click an equation, or put the caret in a paragraph with one';

register(
  { id: 'graph-this', name: 'Graph this', label: 'Graph this', tab: 'equation', group: 'tools', order: 40, menu: { equation: 2 }, icon: ICON,
    title: 'Graph this: the equation drawn as a live graph below it, every other letter a slider (y = f(x), f(x), x = g(t) and y = h(t), F(x, y) = c, a pair of time derivatives). One undo takes it out',
    synonyms: ['Plot this', 'Plot equation', 'Graph equation', 'Draw this equation', 'Live graph of this equation', 'Interactive graph of this equation', 'Desmos'],
    when: (app) => !!app.graphThisTarget(), whyNot: () => NONE,
    run: (app) => app.graphThisRun() }
);

export const methods = {
  // The equation Graph this draws: the one open in its field or right clicked (the Equation tab's
  // and the menu's), else the one the caret is in, else the block's first display equation, else
  // its first in the line. { f, s, e, inner, display } or null
  graphThisTarget() {
    if (!this.model || this.stale) return null;
    const T = this.eqTarget && this.eqTarget();
    if (T && T.info && T.inner) return { f: T.f, s: T.s, e: T.e, inner: T.inner, display: T.display };
    const at = this.ribbonAt && this.ribbonAt();
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
  async graphThisRun() {
    const T = this.graphThisTarget();
    if (!T) { this.toast(NONE); return false; }
    let values = {};
    for (const [f, t] of this.files) if (/\.(tex|ltx)$/i.test(f) && t.length < 2e6) values = { ...paramValues(t), ...values };
    const r = graphThis(T.inner, { values });
    if (r.error) { this.toast('Graph this: ' + r.error + '.', 7000); return false; }
    if (this.eqPop && this.eqPop()) this.closePop();
    this.eqCtx = null;
    await this.graphInsert(r.spec, '', { f: T.f, p: T.e });
    this.toast('Graph this: ' + r.what + '. Drag a slider; Edit graph changes the rest.', 6000);
    return true;
  }
};
