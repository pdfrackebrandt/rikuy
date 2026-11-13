// The Design tab's Document formatting group as Word's, over LaTeX's preamble: Themes (a style set,
// a colour and a heading font as one), Style Set (how the headings look: titlesec's \titleformat
// lines, none for LaTeX's own), Colors (the accent the headings take: \definecolor{accent}, which
// every colour picker lists first as one of the document's colours) and Fonts (the headings' font;
// the text's own is the Font box's, Home). Each pick is one commit; picking LaTeX's own takes the
// lines away again. The page draws the headings as the lines say (src/model.js reads them through
// src/looks.js). The methods join App's prototype through src/cmd/styles.js.

import { openGallery, openMenu } from './kit.js';
import { command } from '../commands.js';
import { STYLE_SETS, COLORS, HEAD_FONTS, THEMES, defaultLook, headLookEdits, accentEdits, accentOf, komaFontEdits, stripComments } from '../looks.js';

const LEVELS = (ch) => [...(ch ? ['chapter'] : []), 'section', 'subsection', 'subsubsection'];
const FAMILY = ['sf', 'tt', 'sc'];
// what a set says of a level, as fields: a set that says nothing of the font or the colour keeps
// the headings' own
function setFields(S, cmd) { return S.heads[cmd] || {}; }
// one edit where several go in at one place (the preamble's end): their order kept
function joinInserts(edits) {
  const out = [];
  for (const x of edits) {
    const y = out.find((z) => z.f === x.f && z.s === x.s && z.e === x.s && x.e === x.s);
    if (y) y.t += x.t; else out.push({ ...x });
  }
  return out;
}

export const methods = {
  // the headings' looks now: { cmd: look } for the levels the Design tab sets
  designLooks() {
    const ch = !!(this.model && this.model.opts.chapters), out = {};
    for (const cmd of LEVELS(ch)) out[cmd] = this.headLookOf(cmd);
    return out;
  },
  // which style set, colour and heading font the document has (null: one of its own)
  designState() {
    const ch = !!(this.model && this.model.opts.chapters), L = this.designLooks(), src = this.src(this.main);
    const plain = (l, cmd) => { const D = defaultLook(cmd, false), o = {}; for (const k of ['size', 'bf', 'it', 'align', 'rule', 'shape', 'num', ...FAMILY]) o[k] = l[k] ?? D[k]; return o; };
    let set = null;
    for (const S of STYLE_SETS) {
      if (LEVELS(ch).every((cmd) => {
        const want = { ...plain(defaultLook(cmd, false), cmd), ...setFields(S, cmd) }, have = plain(L[cmd], cmd);
        // (the font and the colour are Fonts' and Colors': a set that does not say them leaves them)
        return ['size', 'bf', 'it', 'align', 'rule', 'shape', 'num'].every((k) => want[k] === have[k]) && FAMILY.every((k) => !(k in setFields(S, cmd)) || want[k] === have[k]) && (!('sc' in setFields(S, cmd)) || want.sc === have.sc);
      })) { set = S.id; break; }
    }
    const acc = accentOf(src), colored = LEVELS(ch).every((c) => L[c].color === 'accent');
    const none = LEVELS(ch).every((c) => !L[c].color);
    const color = none ? 'none' : colored && acc ? (COLORS.find((x) => x.hex === acc) || { id: null }).id : null;
    const s = L.section;
    const font = s.tt ? 'mono' : s.sf ? 'sans' : s.sc ? 'smallcaps' : 'same';
    return { set, color, font };
  },
  designWhy(what) {
    if (!this.model) return 'Open a document first.';
    if (this.stylePreEnd() < 0) return 'The main file has no preamble to set it in.';
    if (what === 'fonts' && this.model.opts.koma) return null;
    return this.titlesecWhy();
  },

  // The edits of a whole look: each level's look from the set, the colour and the font asked for
  // (each one null: as it is now), the accent's line, the packages; one commit
  designEdits({ set, color, font }) {
    const f = this.main, src = this.src(f), ch = !!this.model.opts.chapters, cur = this.designLooks(), st = this.designState();
    const S = STYLE_SETS.find((x) => x.id === (set || st.set || 'latex')) || STYLE_SETS[0];
    const C = color ? COLORS.find((x) => x.id === color) : null, Fo = font ? HEAD_FONTS.find((x) => x.id === font) : null;
    const want = {};
    for (const cmd of LEVELS(ch)) {
      const D = defaultLook(cmd, false), sf = setFields(S, cmd), had = cur[cmd];
      const L = set ? { ...D, ...sf } : { ...had };
      // what the set does not say: the headings' colour and font as they were
      if (set) { for (const k of FAMILY) if (!(k in sf)) L[k] = had[k]; if (!('color' in sf)) L.color = had.color; }
      if (C) L.color = C.hex ? 'accent' : null;
      if (Fo) Object.assign(L, Fo.set);
      if (S.accent && !C && !accentOf(src) && L.color === 'accent') L.color = null;
      L.before = had.before; L.after = had.after;
      want[cmd] = Object.keys(D).every((k) => (L[k] ?? null) === (D[k] ?? null)) ? null : L;
    }
    const ed = headLookEdits(src, want, {}) || [];
    let acc = [];
    if (C) {
      // (Black takes the accent away where nothing else of the document uses it)
      if (C.hex) acc = accentEdits(src, C.hex) || [];
      else if (!this.accentUsedElsewhere()) acc = accentEdits(src, null) || [];
    } else if (Object.values(want).some((L) => L && L.color === 'accent') && !accentOf(src)) acc = accentEdits(src, COLORS[1].hex) || [];
    const usesColor = Object.values(want).some((L) => L && L.color) || (C && C.hex);
    const any = Object.values(want).some(Boolean);
    const pk = [...(any ? ['titlesec'] : []), ...(usesColor ? ['xcolor'] : [])];
    const edits = joinInserts([...ed, ...acc].map((x) => ({ f, ...x })));
    return edits.length ? [...edits, ...(pk.length ? this.packageEdits(pk) : [])] : [];
  },
  // whether the document uses its accent colour anywhere but its own line and the headings' lines
  accentUsedElsewhere() {
    const src = stripComments(this.src(this.main));
    let n = 0;
    for (let i = src.indexOf('accent'), k = 0; i >= 0 && k < 5000; i = src.indexOf('accent', i + 6), k++) {
      const ls = src.lastIndexOf('\n', i) + 1, line = src.slice(ls, src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i));
      if (/\\definecolor\s*\{accent\}|\\titleformat/.test(line)) continue;
      if (/[{!]accent[}!]/.test(src.slice(i - 1, i + 7))) n++;
    }
    for (const t of [...this.files.keys()].filter((x) => x !== this.main && /\.tex$/.test(x)).slice(0, 50)) if (/[{!]accent[}!]/.test(stripComments(this.files.get(t) || ''))) n++;
    return n > 0;
  },
  applyDesign(o, kind) {
    const why = this.designWhy(o.font && !o.set && !o.color ? 'fonts' : '');
    if (why) { this.toast(why); return false; }
    // KOMA-Script: the headings' font by its own line
    if (this.model.opts.koma && o.font) {
      const fmt = { same: '\\normalfont\\bfseries', sans: null, smallcaps: '\\normalfont\\scshape', mono: '\\normalfont\\ttfamily\\bfseries' }[o.font];
      const ed = komaFontEdits(this.src(this.main), fmt);
      if (ed && ed.length) this.commitPreamble(ed.map((x) => ({ f: this.main, ...x })), kind || 'format');
      return true;
    }
    const ed = this.designEdits(o);
    if (ed.length) this.commitPreamble(ed, kind || 'format');
    return true;
  },

  // ---- the menus ---------------------------------------------------------------------------
  // a heading drawn in a set's look, small, for its tile (the code's own markup)
  setTile(S, hex) {
    // (the tile is paper in both themes: its colours are a page's, not the interface's)
    const col = hex ? '#' + hex : '#1F4E79';
    const st = (cmd) => { const L = { ...defaultLook(cmd, false), ...setFields(S, cmd) }; return 'font-family:' + (L.sf ? 'var(--font-doc-sf)' : 'var(--font-doc)') + ';font-weight:' + (L.bf ? 700 : 400) + ';font-style:' + (L.it ? 'italic' : 'normal') + ';font-variant:' + (L.sc ? 'small-caps' : 'normal') + ';text-align:' + (L.align || 'left') + (L.rule ? ';border-bottom:1px solid currentColor' : '') + (L.color || hex ? ';color:' + col : ''); };
    return '<span class="ds-t" aria-hidden="true"><b style="' + st('section') + ';font-size:12px">Heading</b><i style="' + st('subsection') + ';font-size:10px">Subheading</i><s>Text of the page</s></span>';
  },
  designMenu(what, anchor) {
    const why = this.designWhy(what), D = this.designState();
    const back = (fn) => () => { this.ribbonBack(); fn(); this.ribbonSync(); };
    if (what === 'sets') {
      return openGallery(this, anchor, STYLE_SETS.map((S) => ({ name: S.name, title: S.title, html: this.setTile(S), checked: D.set === S.id, disabled: !!why, run: back(() => this.applyDesign({ set: S.id })) })), { label: 'Style Set', columns: 4, cls: 'pop-design' });
    }
    if (what === 'themes') {
      return openGallery(this, anchor, THEMES.map((T) => {
        const S = STYLE_SETS.find((x) => x.id === T.set), C = COLORS.find((x) => x.id === T.color);
        const html = this.setTile(S, C && C.hex);
        return { name: T.name, title: T.title, html, checked: D.set === T.set && D.color === T.color, disabled: !!why, run: back(() => this.applyDesign({ set: T.set, color: T.color, font: T.font || null })) };
      }), { label: 'Themes', columns: 3, cls: 'pop-design' });
    }
    if (what === 'colors') {
      return openMenu(this, anchor, COLORS.map((C) => ({ name: C.name, title: C.title || ('Headings in ' + C.name.toLowerCase() + ': \\definecolor{accent}{HTML}{' + C.hex + '}'), swatch: C.hex || '000000', checked: D.color === C.id, radio: true, disabled: !!why, run: back(() => this.applyDesign({ color: C.id })) })), { label: 'Colors' });
    }
    const items = HEAD_FONTS.map((F) => ({ name: F.name, title: F.title + (this.model && this.model.opts.koma ? ' (\\setkomafont{disposition})' : ''), checked: D.font === F.id, radio: true, disabled: !!why, run: back(() => this.applyDesign({ font: F.id })) }));
    const fc = command('font-name');
    items.push(null, { name: 'Text font…', title: 'The text\'s font: the Font box of Home', disabled: !fc, run: () => { this.ribbonBack(); this.selectTab('home'); this.runCommand('font-name'); } });
    return openMenu(this, anchor, items, { label: 'Fonts' });
  }
};
