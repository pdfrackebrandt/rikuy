// Batch B3, lists: Bulleted list and Numbered list (paragraphs to a list's items and back, one
// kind of list to the other), and their items of the insert list. B3 adds the libraries, levels,
// restart and continue, sorting and automatic lists here.

import { register } from '../commands.js';
import { BLOCKS } from '../render.js';
import { blankPads } from '../styles.js';

// The list the caret is in, worked out once for each look at the ribbon (both buttons ask)
const listOf = (app, at) => { if (!at) return null; const m = at.memo || (at.memo = {}); if (!('list' in m)) m.list = app.listAt(at); return m.list; };
const can = (kind) => (app, at) => { const L = listOf(app, at); return !!L && !(L.kind === kind && L.labelled); };

register(
  { id: 'bullets', name: 'Bulleted list', order: 10, title: 'Bulleted list (Ctrl+Shift+L)', synonyms: ['Bullets', 'itemize'], tab: 'home', group: 'paragraph', el: 'rb-ul', kind: 'toggle',
    icon: '<path d="M4 6h.01M4 10h.01M4 14h.01M8 6h8.5M8 10h8.5M8 14h8.5"/>', keys: ['Ctrl+Shift+L'], menu: { list: 10 },
    when: can('itemize'), on: (app, at) => { const L = listOf(app, at); return !!L && L.kind === 'itemize'; }, run: (app) => app.toggleList('itemize'),
    palette: { k: 'itemize', d: 'Bulleted list', order: 120, t: { open: '\n\n\\begin{itemize}\n  \\item ', close: '\n\\end{itemize}\n\n' }, block: true } },
  { id: 'numbering', name: 'Numbered list', order: 20, title: 'Numbered list', synonyms: ['Numbering', 'enumerate'], tab: 'home', group: 'paragraph', el: 'rb-ol', kind: 'toggle',
    icon: '<path d="M3.4 4.9l1-.6v3.2M3.2 9h1.2c.9 0 .9 1 .2 1.6L3.2 12h1.9M8 6h8.5M8 10h8.5M8 14h8.5"/>', menu: { list: 20 },
    when: can('enumerate'), on: (app, at) => { const L = listOf(app, at); return !!L && L.kind === 'enumerate'; }, run: (app) => app.toggleList('enumerate'),
    palette: { k: 'enumerate', d: 'Numbered list', order: 130, t: { open: '\n\n\\begin{enumerate}\n  \\item ', close: '\n\\end{enumerate}\n\n' }, block: true } }
);

export const methods = {
  // The list the caret is in, if it is one the ribbon can work on (a bulleted or numbered list
  // that is a block of its own, not one inside another list or a theorem), else the plain
  // paragraphs the selection covers.
  listAt(at) {
    const { c, it, B } = at;
    if (c.ghost || !it || !B) return null;
    const src = this.src(B.f);
    if (it.dataset.li) {
      const [is, ie, ls, le, cmdE] = it.dataset.li.split(',').map((x) => +x + B.base);
      const L = src.slice(ls, le), bm = /^\\begin\s*\{(itemize|enumerate)\}(\s*\[[^\]]*\])?/.exec(L), em = /\\end\s*\{(itemize|enumerate)\}\s*$/.exec(L);
      if (!bm || !em || bm[1] !== em[1] || ls !== B.s || le !== B.e || /\\begin\s*\{/.test(L.slice(bm[0].length))) return null;
      // (labelled: \item[b)] has a label of its own, which a paragraph could not keep)
      return { kind: bm[1], f: B.f, is, ie, ls, le, cmdE, bodyS: ls + bm[0].length, bodyE: ls + em.index, begin: bm[0], end: em[0].trim(), labelled: /^\\item\s*\[/.test(src.slice(is, is + 60)) };
    }
    // every block from the one the selection starts in to the one it ends in
    const r = getSelection().getRangeAt(0);
    const of = (n) => { const el = n.nodeType === 1 ? n : n.parentElement, i = el && el.closest('.it'); return i ? { it: i, B: BLOCKS.get(+i.dataset.b) } : null; };
    const a = of(r.startContainer), z = of(r.endContainer);
    if (!a || !z || !a.B || !z.B || a.B.f !== z.B.f) return null;
    const paras = [];
    for (const X of this.renderer.blocks) {
      if (X.f !== a.B.f || X.s < a.B.s || X.e > z.B.e) continue;
      const item = X.items[0], p = item && this.plainPara(X, item.el);
      if (!p) return null;
      paras.push(p);
    }
    return paras.length ? { kind: null, f: a.B.f, paras: paras.sort((x, y) => x.s - y.s) } : null;
  },

  // Bulleted or numbered: paragraphs become the items of a new list; in a list of the other
  // kind the list changes its kind; in a list of this kind the caret's item becomes a paragraph
  // again, and the items before and after it stay lists of their own.
  toggleList(kind) {
    const at = this.ribbonAt(), L = at && this.listAt(at);
    if (!L) return;
    const f = L.f, src = this.src(f), c = at.c;
    this.closeGroup();
    if (L.paras) {
      const edits = [];
      let p = c.a, add = 0;
      L.paras.forEach((r, k) => {
        // (a paragraph that starts with a bracket: \item would read it as the item's label)
        const open = (k ? '' : '\\begin{' + kind + '}\n') + '  \\item ' + (src[r.s] === '[' ? '{}' : '');
        if (r.s <= c.a) add += open.length;
        edits.push({ f, s: r.s, e: r.s, t: open });
        if (k === L.paras.length - 1) edits.push({ f, s: r.e, e: r.e, t: '\n\\end{' + kind + '}' });
      });
      p = Math.max(c.a, L.paras[0].s) + add;
      this.commit(edits.reverse(), { f, p, bias: -1 }, 'block');
    } else if (L.kind !== kind) {
      const e0 = L.ls + L.begin.indexOf(L.kind), e1 = L.bodyE + L.end.indexOf(L.kind);
      this.commit([{ f, s: e1, e: e1 + L.kind.length, t: kind }, { f, s: e0, e: e0 + L.kind.length, t: kind }], { f, p: c.a + kind.length - L.kind.length, bias: -1 }, 'block');
    } else {
      if (L.labelled) return;
      // What comes before the first \item (\setlength\itemsep...) sets the list up: it stays
      // with each list that keeps items and goes only when none is left. A list is written
      // only around items: one with setup lines alone would stop TeX.
      const pre = src.slice(L.bodyS, L.is), k = pre.search(/\\item\b/);
      const setup = (k < 0 ? pre : pre.slice(0, k)).trim(), prev = k < 0 ? '' : pre.slice(k).trim(), after = src.slice(L.ie, L.bodyE).trim();
      const list = (items) => L.begin + '\n' + (setup ? '  ' + setup + '\n' : '') + '  ' + items + '\n' + L.end;
      const raw = src.slice(L.cmdE, L.ie), text = raw.trim().replace(/^\{\}(?=\[)/, '');
      const pad = blankPads(src, L.ls, L.le);
      const head = prev ? list(prev) + '\n\n' : pad.b, tail = after ? '\n\n' + list(after) : pad.a;
      const off = Math.min(text.length, Math.max(0, c.a - L.cmdE - (raw.length - raw.trimStart().length)));
      this.commit([{ f, s: L.ls, e: L.le, t: head + text + tail }], { f, p: L.ls + head.length + off, bias: -1 }, 'block');
    }
    this.closeGroup();
  },
};
