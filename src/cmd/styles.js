// Batch B4, styles: the style of the paragraph the caret is in (Normal, Title, Heading 1 to 3,
// LaTeX, Quote) by the Styles gallery (src/ui/gallery.js), the style list of a narrow window and
// the keys Ctrl+Alt+0 to 3; the headings of the insert list. B4 adds more styles, the Styles pane,
// Modify Style and the Design tab's looks here.

import { register } from '../commands.js';
import { $ } from '../ui/dom.js';
import { NOT_PLAIN, latexSpot, restyle, startsLine } from '../styles.js';

const HEAD = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(\[[^\]]*\])?\s*\{/;
export const HEADS = ['section', 'subsection', 'subsubsection'];
// why a tile cannot apply where the caret is (its tooltip says so)
export const WHY = {
  none: 'Click in the text of the page first.',
  multi: 'Not for a selection over several paragraphs.',
  title: 'The title is the one \\title sets: edit its words where they stand.',
  part: 'Not for one part of a list, a table or a theorem: LaTeX takes it as a whole.',
  latex: 'Not here: a LaTeX paragraph stands on lines of its own and ends at a blank line, and this one has text right before or after it.',
  head: 'Not here: a heading holds one paragraph of plain text, with no footnote, display, list or environment.',
  quote: 'Not here: a quote holds one paragraph of text.',
  line: 'Not on a line to come in a LaTeX paragraph: type it first.'
};

// the caret's block's style, once for each look at the ribbon
const styleOf = (app, at) => { if (!at) return null; const m = at.memo || (at.memo = {}); if (!('style' in m)) m.style = app.blockStyle(at); return m.style; };
const style = (id, v, name, el, more = {}) => ({
  id, name, el, static: true, fit: true, only: 'wide', tab: 'home', group: 'styles', title: more.title || name,
  when: (app, at) => { const st = styleOf(app, at); return !!st && st.to.has(v); },
  on: (app, at) => { const st = styleOf(app, at); return !!st && st.v === v; },
  run: (app) => { app.setBlockStyle(v); app.ribbonSync(); },
  whyNot: (app, at) => app.whyNot(styleOf(app, at) || { on: false }, v),
  ...more
});

register(
  // the gallery: one control of tiles, and the list in its place on a narrow window (both drawn
  // in src/template.html; src/ui/gallery.js paints them)
  { id: 'styles-gallery', name: 'Styles', el: 'rb-gallery', role: 'group', kind: 'custom', tab: 'home', group: 'styles', only: 'wide', searchable: false, title: 'Styles',
    render: () => $('#rb-gw'), sync: (app, at) => app.styleSync(at) },
  { id: 'style-list', name: 'Style of this paragraph', el: 'rb-style', role: 'combobox', kind: 'custom', tab: 'home', group: 'styles', only: 'narrow', searchable: false, title: 'Style of the paragraph the caret is in',
    render: () => $('#rb-style') },
  style('style-normal', 'p', 'Normal', 'rb-st-p', { keys: ['Ctrl+Alt+0'], title: 'Normal: a paragraph of text (Ctrl+Alt+0)', synonyms: ['Normal text', 'Paragraph', 'Body text'] }),
  style('style-title', 'title', 'Title', 'rb-st-title', { title: 'Title: the document\'s title, from \\title' }),
  style('style-heading1', 'section', 'Heading 1', 'rb-st-section', { keys: ['Ctrl+Alt+1'], title: 'Heading 1: a section (Ctrl+Alt+1)', synonyms: ['Section'],
    palette: { k: 'section', d: 'Section heading', order: 100, t: { open: '\n\n\\section{', close: '}\n\n' }, block: true } }),
  style('style-heading2', 'subsection', 'Heading 2', 'rb-st-subsection', { keys: ['Ctrl+Alt+2'], title: 'Heading 2: a subsection (Ctrl+Alt+2)', synonyms: ['Subsection'],
    palette: { k: 'subsection', d: 'Subsection heading', order: 110, t: { open: '\n\n\\subsection{', close: '}\n\n' }, block: true } }),
  style('style-heading3', 'subsubsection', 'Heading 3', 'rb-st-subsubsection', { keys: ['Ctrl+Alt+3'], title: 'Heading 3: a subsubsection (Ctrl+Alt+3)', synonyms: ['Subsubsection'] }),
  style('style-latex', 'latex', 'LaTeX source', 'rb-st-latex', { title: 'LaTeX source: shows the paragraph as LaTeX that you type directly', synonyms: ['LaTeX paragraph', 'Raw LaTeX', 'Source'] }),
  style('style-quote', 'quote', 'Quote', 'rb-st-quote', { synonyms: ['Quotation', 'Block quote'] }),
  { id: 'styles-prev', name: 'Previous styles', resync: false, el: 'rb-st-up', static: true, fit: true, only: 'wide', tab: 'home', group: 'styles', searchable: false, when: () => true, run: (app) => app.pageGallery(-1) },
  { id: 'styles-next', name: 'Next styles', resync: false, el: 'rb-st-down', static: true, fit: true, only: 'wide', tab: 'home', group: 'styles', searchable: false, when: () => true, run: (app) => app.pageGallery(1) },
  { id: 'styles-more', name: 'More styles', resync: false, el: 'rb-st-more', static: true, only: 'wide', tab: 'home', group: 'styles', title: 'All the styles', synonyms: ['Styles', 'Style'], when: () => true, run: (app) => app.openStyles() }
);

export const methods = {
  // The style of the caret's block: v is 'p', 'title', a heading's command, 'latex', 'quote' or
  // '' (something else: a list, a table, a theorem); to, the styles the ribbon may change it to;
  // b, where its words are for restyle (src/styles.js).
  blockStyle(at) {
    const { c, it, B } = at, none = new Set();
    if (c.ghost) {
      // a line to come in a LaTeX paragraph keeps its paragraph's style
      if (this.ghost.tex) return { v: 'latex', to: none, why: WHY.line };
      return { v: this.ghost.style || 'p', to: new Set(['p', ...HEADS, 'latex', 'quote']) };
    }
    if (!it || !B) return { v: '', to: none };
    const ctx = it.dataset.ctx;
    // a selection that runs over several paragraphs: the list would change only the first
    if (at.multi) return { v: ctx === 'p' ? 'p' : ctx === 'tex' ? 'latex' : '', to: none, why: WHY.multi };
    if (ctx === 'ttl') return { v: 'title', to: none, why: WHY.title };
    const src = this.src(B.f);
    if (ctx === 'tex') {
      // back to what its source makes; a heading or a quote only of what is one paragraph of text
      const T = this.texBox(it);
      if (!T) return { v: 'latex', to: none };
      const words = src.slice(T.is, T.ie), to = new Set(['p']);
      if (T.para) { to.add('quote'); if (!NOT_PLAIN.test(words) && words[0] !== '%') HEADS.forEach((h) => to.add(h)); }
      return { v: 'latex', to, b: { v: 'latex', s: T.ms, ws: T.is, we: T.ie, e: T.ie } };
    }
    const spot = latexSpot(src, B.s, B.e);
    const latex = (to) => { if (spot >= 0) to.add('latex'); return to; };
    if (ctx === 'h') {
      const m = HEAD.exec(src.slice(B.s, B.e));
      const v = m && HEADS.includes(m[1]) ? m[1] : '';
      if (!v || src[B.e - 1] !== '}') return { v, to: latex(new Set()), b: { spot } };
      // the \label on the heading's next line stays with it: a paragraph made of it ends after the label
      const lab = /^[ \t]*\\label\s*\{[^}]*\}/.exec(src.slice(B.e, B.e + 400));
      return { v, to: latex(new Set(['p', 'quote', ...HEADS.filter((h) => h !== v)])), b: { v, s: B.s, ws: B.s + m[0].length, we: B.e - 1, e: B.e, after: lab ? B.e + lab[0].length : null, spot } };
    }
    const q = this.quoteOf(B);
    if (q) return { v: 'quote', to: latex(new Set(q.one ? ['p', ...(q.plain ? HEADS : [])] : [])), b: { v: 'quote', s: B.s, ws: q.ws, we: q.we, e: B.e, spot } };
    const r = this.plainPara(B, it);
    // (Quote only for a paragraph that starts its line: after \noindent or the like on the same
    // line, the environment would go in after it, and the way back would not be byte for byte)
    if (r) return { v: 'p', to: latex(new Set([...HEADS, ...(startsLine(src, r.s) ? ['quote'] : [])])), b: { v: 'p', s: r.s, ws: r.s, we: r.e, e: r.e, spot } };
    if (ctx === 'p' && B.items.length === 1 && !/\bthm\b/.test(it.className)) {
      // a paragraph with a footnote or a display in it: no heading can hold it, a quote can
      let s = B.s, e = B.e;
      while (s < e && /\s/.test(src[s])) s++;
      while (e > s && /\s/.test(src[e - 1])) e--;
      const words = src.slice(s, e), quote = e > s && startsLine(src, s) && !/^\\begin\s*\{/.test(words) && !/\n[ \t]*\n/.test(words);
      return { v: 'p', to: latex(new Set(quote ? ['quote'] : [])), b: { v: 'p', s, ws: s, we: e, e, spot } };
    }
    return { v: '', to: latex(new Set()), b: { spot } };
  },

  // Normal, Heading 1 to 3, LaTeX and Quote: the caret's block takes the style by the smallest
  // edit (restyle in src/styles.js): the words are not touched, the command, the environment or
  // the mark's line goes around them or away. One commit, so one undo restores the source byte for
  // byte. A blank paragraph (after Enter, a new document) set to LaTeX or Quote shows so, and
  // the mark or the environment goes in with its first character.
  setBlockStyle(to) {
    const at = this.ribbonAt();
    if (!at) return;
    const { c } = at, cur = this.blockStyle(at);
    if (cur.v === to || !cur.to.has(to)) return;
    this.closeGroup();
    if (c.ghost) {
      const g = this.ghost;
      if (to === 'p' || to === 'latex' || to === 'quote') {
        g.style = to === 'p' ? null : to;
        g.pend = '';
        g.el.classList.toggle('tex', to === 'latex');
        g.el.classList.toggle('quote', to === 'quote');
        this.paintGhost();
        return;
      }
      g.style = null;
      this.insertPiece(null, g, '\\' + to + '{', '}');
      this.closeGroup();
      return;
    }
    const f = at.B.f, r = restyle(this.src(f), cur.b, to, c.a);
    if (!r) return;
    this.commit(r.edits.map((x) => ({ f, ...x })), { f, p: r.p, bias: -1 }, 'block');
    this.closeGroup();
  },
};
