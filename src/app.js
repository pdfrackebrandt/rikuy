// Rikuy app shell: rebuild pipeline, history, input, popovers, files.
import { siInMath } from './siunitx.js';
import { buildModel } from './model.js';
import { Renderer, BLOCKS, esc, widgetCss } from './render.js';
import { Layout, geometry } from './layout.js';
import {
  posFromDom, CaretIndex, segOfSpan, atomOfEl, styOfEl, visibleRanges, escapeTeX, textToTeX,
  endsWithControlWord, isBalanced, diff, boundary
} from './editor.js';
import { SAMPLE } from './sample.js';
import { splitRows } from './parser.js';
import { installWordTyping, wordShortcuts, makeDialect, classifyMacros, resolveCommand, PACKAGES, WORD_GROUPS, FIELD_MACROS, fieldValue, modelValue } from './wordmath.js';
import { isTallDef, fitBrackets, tallTest } from './fences.js';
import { minimalRow, makeSame } from './minimal.js';
import { htmlToTeX, plainToTeX, unwrapMath } from './paste.js';
import { findProblems, missingFigures } from './problems.js';
import { WidgetLayer } from './widget.js';

// Gray boxes of 320 by 240 points that stand in, in a coauthor's PDF, for figures a link does
// not carry: a PDF, a PNG whose resolution makes it that size, and EPS for latex with dvips.
const PLACEHOLDER_PDF = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMjAgMjQwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCA+PiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDUxID4+CnN0cmVhbQowLjg1IGcgMCAwIDMyMCAyNDAgcmUgZiAwLjYgRyAyIHcgMSAxIDMxOCAyMzggcmUgUwplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDIxOSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDUgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjMxOQolJUVPRgo=';
const PLACEHOLDER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAAAAACRn/EaAAAACXBIWXMAAAAjAAAAIwHV9BZdAAAADklEQVR42mO4CQQMcAIATFkKLSVMoyAAAAAASUVORK5CYII=';
const PLACEHOLDER_EPS = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 320 240\n0.85 setgray 0 0 320 240 rectfill\n0.6 setgray 2 setlinewidth 1 1 318 238 rectstroke\nshowpage\n';
import { texToPlain, shortAuthors, entryYear } from './bib.js';
import { kvGet, kvPut, kvSwap, decodeText, encodeText, snapAdd, snapAll, snapFiles, snapDel, snapPrune } from './store.js';
import { changes, spacingOnly } from './diff.js';
import { TeXEngine, parseTeXLog } from './tex.js';
import { PdfView } from './pdfview.js';
import { collab, installCollab } from './collab.js';
import { shareParam, commentOnly, cleanPath } from './share.js';
import { savedToken, keepToken, dropReplaced } from './gitauth.js';

const $ = (s, r = document) => r.querySelector(s);
const PX_PER_PT = 96 / 72.27;
// Rikuy was called Galley at first; the keys of what a browser keeps keep that name, so
// nobody's documents or settings are lost
const STORE = 'galley.project.v1';
const ENGINE_LABEL = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX', latex: 'LaTeX (dvips)' };
const PREFS = 'galley.prefs.v1';
const CDN = {
  cm: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.js',
  cmTex: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/stex/stex.js',
  zip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  ml: 'https://cdn.jsdelivr.net/npm/mathlive@0.110.0/mathlive.min.js',
  chem: 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/mhchem.min.js'
};
// The hash of each file as published on npm, which jsDelivr serves unchanged: a CDN that
// served anything else would get no script run in this page. (CodeMirror's .min.js names
// are minified by jsDelivr itself, so their bytes are not the package's: the package's own
// files load instead.) A new version needs its new hash here.
const SRI = {
  [CDN.cm]: 'sha384-/WlgLpnUCi+5eS6SnLPKTwRY0l8X4TxBIroMKS0KpFjlFoST+ZbSMKqTpgS24m8i',
  [CDN.cmTex]: 'sha384-tab09zZeKEC2HRX/8GcAyeUuP7KBvb9DKKK4wegfZ/qW7tMcwh14TRJ0o6woQ9M0',
  [CDN.zip]: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
  [CDN.ml]: 'sha384-5IN6K0kiaz8MufrTGBvPCP3oDeMjmwe+DDTvuyQLNv6gc634FpKbQfllonjHJPmy',
  [CDN.chem]: 'sha384-F2ptQFZqNJuqfGGl28mIXyQ5kXH48spn7rcoS0Y9psqIKAcZPLd1NzwFlm/bl1mH'
};
// what an opened .zip may unpack to; past it the tab would run out of memory
const MAX_ZIP = 1.5e9;
// .html: live figures (rikuy.sty), which travel in share links, diff in git and open in the source pane
const TEXT_EXT = /\.(tex|bib|sty|cls|bst|bbl|txt|ltx|dtx|clo|cfg|def|md|html?)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp)$/i;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    if (SRI[src]) { s.integrity = SRI[src]; s.crossOrigin = 'anonymous'; }
    s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
// A link in a document opens only as a web or mail address: the document may be a
// stranger's, and a javascript: or data: address would run as, or pretend to be, this page.
function openLink(u) {
  let s = String(u || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, ''); // \url{www.example.org}
  let url;
  try { url = new URL(s); } catch (e) { return false; }
  if (!/^(https?|mailto|ftp):$/.test(url.protocol)) return false;
  window.open(url.href, '_blank', 'noopener');
  return true;
}
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
// Focus a MathLive field, working around its guard that sometimes ignores focus().
function focusField(mf) {
  try { mf.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (document.activeElement === mf) return;
  try {
    const m = mf._mathfield;
    if (m) m.blurred = true;
    const sink = mf.shadowRoot && mf.shadowRoot.querySelector('.ML__keyboard-sink');
    if (sink) sink.focus({ preventScroll: true });
  } catch (e) { /* ignore */ }
}
// The selection as clean HTML for Word, Google Docs and mail: bold and italics as tags,
// math as MathML (Word turns it into live equations), page furniture dropped.
function selectionHTML(sel, mathml) {
  if (!sel.rangeCount) return '';
  const range = sel.getRangeAt(0);
  const box = document.createElement('div');
  box.appendChild(range.cloneContents());
  for (const a of box.querySelectorAll('.a-math, .atom.m')) {
    const live = document.querySelector('[data-a="' + a.dataset.a + '"]');
    const m = live && mathml(live);
    if (m) { const t = document.createElement('template'); t.innerHTML = m; a.replaceWith(t.content); }
  }
  for (const k of box.querySelectorAll('.katex')) {
    const m = k.querySelector('math');
    if (m) k.replaceWith(m.cloneNode(true)); else k.remove();
  }
  for (const x of box.querySelectorAll('[aria-hidden="true"], .lbl-num, .pg-foot, .fn-mark-hidden, script, style')) x.remove();
  const tagFor = (el) => {
    const c = el.classList || { contains: () => false };
    if (c.contains('y-bf')) return 'b';
    if (c.contains('y-em') || c.contains('y-it')) return 'i';
    if (c.contains('y-ul')) return 'u';
    if (c.contains('y-tt')) return 'code';
    if (c.contains('y-sup')) return 'sup';
    if (c.contains('y-sub')) return 'sub';
    return null;
  };
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (ch.nodeType !== 1) continue;
      if (ch.tagName.toLowerCase() === 'math') continue;
      walk(ch);
      if (/^(SUP|SUB|B|I|EM|STRONG|U|CODE|A|TABLE|THEAD|TBODY|TR|TD|TH|UL|OL|LI|BR|IMG)$/.test(ch.tagName)) { ch.removeAttribute('class'); ch.removeAttribute('style'); ch.removeAttribute('data-s'); continue; }
      const t = tagFor(ch);
      const block = /^(DIV|P|LI|H[1-6])$/.test(ch.tagName) && (ch.classList.contains('it') || ch.tagName !== 'DIV');
      const repl = document.createElement(t || (block ? (ch.classList.contains('h') ? 'h3' : 'p') : 'span'));
      while (ch.firstChild) repl.appendChild(ch.firstChild);
      if (repl.tagName === 'SPAN') { ch.replaceWith(...repl.childNodes); } else ch.replaceWith(repl);
    }
  };
  walk(box);
  // formatting that encloses the whole selection (a word inside \textbf) is not in the clone
  let html = box.innerHTML;
  for (let n = range.commonAncestorContainer; n && n.id !== 'pages'; n = n.parentNode) {
    if (n.nodeType !== 1) continue;
    const t = tagFor(n) || (/^(SUP|SUB)$/.test(n.tagName) ? n.tagName.toLowerCase() : null);
    if (t) html = '<' + t + '>' + html + '</' + t + '>';
  }
  return '<meta charset="utf-8">' + html.replace(/\u200B/g, '');
}

// How many { are open at position p, counting from the start of its paragraph.
function braceDepth(src, p) {
  let s = src.lastIndexOf('\n\n', p - 1);
  s = s < 0 ? 0 : s;
  let d = 0;
  for (let i = s; i < p; i++) {
    const ch = src[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '%') { while (i < p && src[i] !== '\n') i++; continue; }
    if (ch === '{') d++;
    else if (ch === '}') d = Math.max(0, d - 1);
  }
  return d;
}
// Would a "[" (or "*") written at p be taken as the optional argument (or the star) of the
// command before it? \\ and \item look past spaces and one line break for one: "\\" then
// "[1]" on the next line is a TeX error, "\item" then "[x]" replaces the bullet with x.
function grabsBracket(src, p, ch) {
  let k = p;
  const sp = () => { while (k > 0 && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--; };
  sp();
  if (src[k - 1] === '\n') { k--; if (src[k - 1] === '\r') k--; sp(); }
  const star = ch === '[' && src[k - 1] === '*';
  if (star) k--;
  let n = 0;
  while (k - n > 0 && src[k - n - 1] === '\\') n++;
  if (n >= 2 && n % 2 === 0) return true;
  return ch === '[' && !star && endsWithControlWord(src, k);
}
const crlfOnly = (t) => t.includes('\r\n') && !/(^|[^\r])\n/.test(t);
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function mkBtn(label, fn, title, type) { const b = mk('button', 'btn ghost sm', label); b.type = type || 'button'; if (title) b.title = title; if (fn) b.addEventListener('click', fn); return b; }
function textSig(main, files) {
  let h = 0x811c9dc5;
  const add = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } h ^= 0xff; };
  add(main);
  for (const [n, t] of files) { add(n); add(t); }
  return (h >>> 0).toString(36) + ':' + files.reduce((s, x) => s + x[1].length, 0);
}
function when(t) {
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dd = Math.round((day(now) - day(d)) / 864e5);
  if (dd === 0) return 'today ' + hm;
  if (dd === 1) return 'yesterday ' + hm;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ', ' + hm;
}
async function copyRich(html, text) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    }
  } catch (e) { /* fall back to a copy event */ }
  const on = (e) => { e.clipboardData.setData('text/html', html); e.clipboardData.setData('text/plain', text); e.preventDefault(); e.stopImmediatePropagation(); };
  document.addEventListener('copy', on, true);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.removeEventListener('copy', on, true);
  return ok;
}
const lineOf = (src, p) => { let n = 1; for (let i = 0; i < p && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; };
const lineStart = (src, line) => { let p = 0; for (let n = 1; n < line; n++) { const i = src.indexOf('\n', p); if (i < 0) return src.length; p = i + 1; } return p; };
const fmtMB = (b) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB';
function debounce(fn, ms) { let t = null; const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); }; d.flush = (...a) => { clearTimeout(t); t = null; fn(...a); }; d.cancel = () => { clearTimeout(t); t = null; }; d.pending = () => t !== null; return d; }

// ---------------------------------------------------------------------------
// LaTeX box <-> visual equation field. Row commands (\label, \tag, \notag)
// are lifted out before the field sees them and put back on the same row.
const ROW_CMD = /\\label\s*\{[^}]*\}|\\(?:nonumber|notag)\b|\\tag\*?\s*\{[^}]*\}/g;
function toField(tex, display, env, D) {
  const base = (env || '').replace(/\*$/, '');
  const spans = display ? splitRows(tex) : [{ s: 0, e: tex.length }];
  if (spans.length > 1 && !tex.slice(spans[spans.length - 1].s, spans[spans.length - 1].e).trim()) spans.pop();
  const rows = spans.map((r) => {
    const text = tex.slice(r.s, r.e);
    const sfx = [];
    const clean = display ? text.replace(ROW_CMD, (m) => { sfx.push(m); return ''; }) : text;
    const lead = (/^\s*/.exec(text) || [''])[0];
    const trail = (/\s*$/.exec(text) || [''])[0];
    return { s: r.s, e: r.e, text, clean: clean.trim(), sfx: sfx.join(' '), lead, trail };
  });
  const multi = display && (rows.length > 1 || /^(align|flalign|alignat|eqnarray|gather|multline)$/.test(base));
  const wrap = /^(gather|multline)$/.test(base) ? 'gathered' : 'aligned';
  const latex = multi ? '\\begin{' + wrap + '}' + rows.map((r) => D.toField(r.clean)).join('\\\\') + '\\end{' + wrap + '}' : (rows[0] ? D.toField(rows[0].clean) : '');
  return { tex, latex, multi, rows, ml: null, D };
}
// Field value -> list of row strings (text typed outside the block joins the edge rows).
function fieldRows(v, multi, D) {
  if (!multi) return [D.fromField(v.trim())];
  const m = /\\begin\{(aligned|gathered|split|align\*?|gather\*?)\}([\s\S]*)\\end\{\1\}/.exec(v);
  const inner = m ? m[2] : v;
  const rows = splitRows(inner).map((r) => inner.slice(r.s, r.e).trim());
  while (rows.length > 1 && !rows[rows.length - 1]) rows.pop();
  if (m) {
    const before = v.slice(0, m.index).trim(), after = v.slice(m.index + m[0].length).trim();
    if (before) rows[0] = before + ' ' + rows[0];
    if (after) rows[rows.length - 1] = (rows[rows.length - 1] + ' ' + after).trim();
  }
  return rows.map((r) => D.fromField(r));
}
// Does the field hold the formula as written? Each row read back must typeset the same.
function faithful(st, same) {
  if (!st.ml || st.ml.length !== st.rows.length) return false;
  return st.rows.every((r, i) => r.clean === st.ml[i] || same(r.clean, st.ml[i]));
}
// Rebuild the LaTeX box text, touching only rows that changed.
function fromField(v, st) {
  const now = fieldRows(v, st.multi, st.D);
  const was = st.ml || st.rows.map((r) => r.clean);
  const R = st.rows;
  const withSfx = (t, r) => t + (r && r.sfx ? ' ' + r.sfx : '');
  if (now.length === R.length) {
    let out = st.tex;
    for (let i = R.length - 1; i >= 0; i--) {
      if (now[i] === was[i]) continue;
      // change only the tokens that changed; the rest of the row keeps its spelling and spacing
      const small = st.same && st.ml ? minimalRow(R[i].text, was[i], now[i], st.same) : null;
      out = out.slice(0, R[i].s) + (small != null ? small : R[i].lead + withSfx(now[i], R[i]) + R[i].trail) + out.slice(R[i].e);
    }
    return out;
  }
  // Rows were added or removed: keep unchanged rows verbatim, labels follow their rows.
  const used = new Set();
  const pick = now.map((t) => { const j = was.findIndex((w, k) => !used.has(k) && w === t); if (j >= 0) used.add(j); return j; });
  const lines = now.map((t, i) => {
    const j = pick[i];
    if (j >= 0) return '  ' + R[j].text.trim();
    const k = i < R.length && !used.has(i) && !pick.includes(i) ? i : -1;
    if (k >= 0) used.add(k);
    return '  ' + withSfx(t, k >= 0 ? R[k] : null);
  });
  return lines.join(' \\\\\n');
}

class App {
  constructor() {
    this.files = new Map();
    this.main = 'main.tex';
    this.name = 'Editing in Print';
    this.assets = new Map();
    this.assetBlobs = new Map();
    this.extra = new Map(); // files Rikuy does not read (data, fonts, figures it cannot show): saved back untouched
    this.orig = new Map(); // name -> { bytes, enc, bom, text } as opened, so untouched files leave byte-identical
    this.zipDirty = false;
    this.root = $('#pages');
    this.sheet = $('#sheet');
    this.desk = $('#desk');
    this.host = { flow: $('#mflow'), fns: $('#mfns') };
    this.renderer = new Renderer(this);
    this.layout = new Layout(this.root, this.host);
    this.index = new CaretIndex(this.root);
    this.index.blocksOf = () => this.renderer.blocks;
    // live figures: their frames, laid over the boxes the pages keep for them (src/widget.js)
    this.widgets = new WidgetLayer(this.root, $('#wlayer'), {
      scale: () => (this.px || PX_PER_PT) / PX_PER_PT,
      text: (p) => this.files.get(p),
      maxHeight: () => (this.layout.g ? this.layout.g.th : 550) * PX_PER_PT,
      resized: (key) => this.widgetResized(key),
      source: (ph, e) => this.widgetSource(ph, e),
      allow: () => this.allowWidgets()
    });
    this.relayoutSoon = debounce(() => this.relayout(), 40);
    // a figure, or a live figure's fallback, measured before its picture loaded: measured again
    // once it has, or the pages kept it at no height and the text below ran into it
    this.sheet.addEventListener('load', (e) => {
      const late = (this.items || []).filter((it) => it.late && it.late.delete(e.target));
      if (!late.length) return;
      this.layout.invalidate(late);
      this.relayoutSoon();
    }, true);
    this.hist = [];
    this.redoStack = [];
    this.prefix = 'r0|';
    this.renderVer = 0;
    this.prefs = Object.assign({ zoom: 'fit', source: window.innerWidth > 1100, style: 'Plain, direct academic prose. No em dashes. No filler, no hedging.' }, load(PREFS) || {});
    this.pop = null;
    this.ghost = null;
    this.pending = null;
    this.armed = null;
    const persistSoon = debounce(() => this.persist(), 700);
    // unsaved: an edit waits for persistSoon. Leaving the page writes only then: a tab that changed
    // nothing must not write its older copy over what another tab saved since.
    this.saveSoon = Object.assign(() => { this.zipDirty = true; this.unsaved = true; document.body.classList.add('zip-dirty'); persistSoon(); this.noteEdit(); }, { flush: () => persistSoon.flush(), cancel: () => persistSoon.cancel() });
    this.memSnaps = []; // versions kept in memory when this browser cannot store them
    this.marksSoon = debounce(() => this.paintChanges(), 180);
    this.commentsSoon = debounce(() => this.paintComments(), 200);
    this.pdfSoon = debounce(() => { if (document.body.classList.contains('pdf-on')) this.compilePdf(); }, 1400);
    this.texIssues = [];
    this.syncSoon = debounce(() => this.revealCaret(), 120);
    this.problemsSoon = debounce(() => this.refreshNav(), 350);
    this.srcRebuild = debounce(() => this.fromSource(), 260);
    this.caps = { sample: null, downloads: null };
  }

  async init() {
    let saved = null;
    try { saved = await kvGet('project'); } catch (e) { saved = null; this.noIdb = true; }
    this.savedT = saved ? saved.t : null; // the copy in IndexedDB this tab last read or wrote
    const ls = load(STORE);
    if (ls && ls.files && (!saved || (ls.t || 0) > (saved.t || 0))) saved = ls; // a session that could not use IndexedDB
    if (saved && saved.files && saved.files.length) {
      this.files = new Map(saved.files);
      this.main = saved.main || this.files.keys().next().value;
      this.name = saved.name || this.main;
      this.zipDirty = !!saved.zipDirty;
      try {
        const bin = await kvGet('binary');
        if (bin) {
          for (const [n, b] of bin.assets || []) this.addAsset(n, b);
          for (const [n, b] of bin.extra || []) this.extra.set(n, b);
          for (const [n, o] of bin.orig || []) this.orig.set(n, { ...o, text: decodeText(o.bytes).text });
        }
      } catch (e) { /* text still loads */ }
    } else this.loadSample();
    this.bindUI();
    this.applyPrefs();
    await this.waitForKaTeX();
    await Promise.race([this.loadFonts(), new Promise((r) => setTimeout(r, 2500))]);
    this.computePx();
    // whether this project came from someone else, before its live figures are drawn
    await this.linkInfo();
    this.rebuild();
    $('#boot').hidden = true;
    document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', debounce(() => this.relayout(true), 200));
    new ResizeObserver(debounce(() => { if (this.computePx()) this.relayout(true); }, 150)).observe(this.desk);
    this.initCaps();
    await this.loadReview();
    await this.loadShareCtx();
    // a link with a document in it (#share=...): open that document; the fragment goes, so a
    // reload keeps what was typed since
    const shared = shareParam(location.hash);
    if (shared) {
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* framed */ }
      await this.openSharedLink(shared);
    }
    // someone a document was shared with sees the page; the source is one click away
    if (this.prefs.source && !document.body.classList.contains('guest')) this.toggleSource(true);
    if (this.prefs.nav && window.innerWidth > 860) this.toggleNav(true);
    if (this.prefs.pdf && window.innerWidth > 860) this.togglePdf(true);
    setTimeout(() => this.ensureMathLive(), 2500);
    this.placeInitialCaret();
  }

  loadSample() {
    this.files = new Map(Object.entries(SAMPLE));
    this.main = 'main.tex';
    this.name = 'Editing in Print';
    this.assets.clear();
    this.assetBlobs.clear();
    this.extra.clear();
    this.orig.clear();
    this.binaryDirty = true;
    this.zipDirty = false;
  }

  async waitForKaTeX() {
    for (let i = 0; i < 100 && !window.katex; i++) await new Promise((r) => setTimeout(r, 50));
    if (!window.katex) {
      this.toast('Math rendering library did not load. Equations show as source until it does.');
      const t = setInterval(() => { if (window.katex) { clearInterval(t); this.renderer.mathCache.clear(); this.forceRender = true; this.rebuild(this.caretNow()); } }, 1000);
    }
  }

  async loadFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const faces = ['400 16px "Paper Modern Serif"', 'italic 400 16px "Paper Modern Serif"', 'bold 16px "Paper Modern Serif"', 'italic bold 16px "Paper Modern Serif"', '16px "Paper Modern Typewriter"', '16px KaTeX_Main', 'italic 16px KaTeX_Math', '16px KaTeX_Size1', '16px KaTeX_Size2', '16px KaTeX_AMS'];
    await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)));
  }

  async initCaps() {
    const C = window.claude;
    if (!C || !C.use) return;
    C.use('sample').then((s) => { this.caps.sample = s; document.body.classList.toggle('has-ai', !!s); }).catch(() => {});
    C.use('downloads').then((d) => { this.caps.downloads = d; document.body.classList.toggle('has-dl', !!d); }).catch(() => {});
  }

  // ---- layout ------------------------------------------------------------------
  computePx() {
    const P = geometry(this.model ? this.model.opts : { paper: 'letter', pt: 10 });
    const avail = Math.max(240, this.desk.clientWidth - (window.innerWidth < 640 ? 16 : 56));
    let px;
    if (this.prefs.zoom === 'fit') px = Math.min(PX_PER_PT * 1.25, avail / P.pw);
    else px = PX_PER_PT * this.prefs.zoom;
    px = Math.round(px * 1000) / 1000;
    const changed = px !== this.px;
    this.px = px;
    $('#zoomv').textContent = this.prefs.zoom === 'fit' ? 'Fit' : Math.round(this.prefs.zoom * 100) + '%';
    return changed;
  }

  rebuild(caret) {
    const t0 = performance.now();
    let model;
    try { model = buildModel({ files: this.files, main: this.main }, this.model && this.model.main === this.main ? this.model : null); model.main = this.main; }
    catch (e) {
      // The pages still show the text before this change, and their offsets no longer match it:
      // a keystroke there would land in the wrong place. They take no typing until a build works.
      console.error(e);
      this.stale = true;
      this.root.classList.add('stale');
      this.root.contentEditable = 'false';
      this.toast('The page cannot show this version of the document (' + e.message + '). Edit the source, or undo.', 8000);
      return;
    }
    if (this.stale) { this.stale = false; this.root.classList.remove('stale'); this.root.contentEditable = 'true'; }
    this.model = model;
    // chemistry (\ce, \pu): KaTeX's mhchem, fetched the first time a document uses it
    if (!this.chemReq && window.katex && [...this.files.values()].some((t) => /\\(?:ce|pu|ch)\s*[[{]/.test(t))) {
      this.chemReq = true;
      loadScript(CDN.chem).then(() => { this.renderer.mathCache.clear(); this.forceRender = true; this.rebuild(this.caretNow()); }).catch(() => { /* \ce stays as source */ });
    }
    this.computePx();
    const macroChanged = this.renderer.setMacros(model.mathMacros, { opts: model.siOpts, units: model.siUnits, lang: model.opts.lang });
    const O = model.opts;
    const optSig = JSON.stringify([O.pt, O.lang, O.font, O.citeStyle, O.parskip, O.cleveref, O.spread]);
    if (macroChanged || optSig !== this.optSig || this.forceRender) { this.prefix = 'r' + (++this.renderVer) + '|'; this.optSig = optSig; this.forceRender = false; }
    this.renderer.sync(model, this.prefix);
    this.layoutPass();
    if (caret) this.restoreCaret(caret);
    this.status(performance.now() - t0);
  }

  layoutPass(force) {
    const model = this.model;
    const items = [], fns = [];
    for (const B of this.renderer.blocks) { for (const it of B.items) items.push(it); for (const f of B.fns) fns.push(f); }
    const g = geometry(model.opts);
    const gsig = JSON.stringify(g) + '|' + this.px + '|' + model.opts.spread + '|' + model.opts.parindent + '|' + model.opts.pt + '|' + model.opts.font;
    if (gsig !== this.gsig || force) {
      this.gsig = gsig;
      this.layout.setGeometry(g, this.px, this.sheet, model.sizes, model.opts);
      this.sheet.dataset.font = model.opts.font || '';
      this.sheet.lang = { de: 'de', es: 'es', fr: 'fr' }[model.opts.lang] || 'en';
      for (const it of items) { it.measured = false; it.pieces = null; }
      for (const f of fns) f.measured = false;
    }
    this.removeGhost();
    this.layout.measure(items, fns);
    const plan = this.layout.plan(items);
    this.layout.apply(plan);
    this.items = items;
    this.plan = plan;
    this.index.dirty = true;
    this.tocPages(plan);
    if (this.prefs.marks) this.marksSoon();
    this.commentsSoon();
    this.emptyGhost();
    this.widgets.place();
  }

  // ---- live figures ------------------------------------------------------------
  // Live figures run at once in one's own projects. In a project from someone else (a link, a
  // .zip, a git clone: markFromLink) they wait for its owner's click, kept per project like the
  // shell escape it may allow. A widget cannot reach this page, its storage or the project, and
  // its policy refuses every request, but Chromium lets any script open WebRTC connections, which
  // no policy stops: a stranger's widget could tell its author who opens the document, and when.
  widgetsAllowed() {
    const k = this.name + '|' + this.main;
    if (!this.linkCache || !this.linkCache.has(k)) {
      // not known yet (another project of one's own, just switched to): drawn again once it is
      if (!this.linkAsk) {
        this.linkAsk = this.linkInfo().then(() => { this.linkAsk = null; if (this.widgetsAllowed()) { this.forceRender = true; this.rebuild(this.caretNow()); } });
      }
      return false;
    }
    const v = this.linkCache.get(k);
    return !v || !!v.widgets;
  }

  async allowWidgets() {
    const v = await this.linkInfo();
    if (v && !v.widgets) { v.widgets = true; if (!this.noIdb) kvPut('link:' + this.name + '|' + this.main, v).catch(() => {}); }
    this.forceRender = true;
    this.rebuild(this.caretNow());
  }

  // the height a widget last asked for, so its box is drawn again at that size, not the default
  widgetHeight(key, path) { return this.widgets.heights.get(key) || this.widgets.byPath.get(path) || 0; }

  // a widget asked for another height: its boxes take it, and the blocks they are in are measured
  // again (moving a box costs nothing: the frame is not in it)
  widgetResized(key) {
    const css = widgetCss(this.widgets.heights.get(key));
    const touched = [];
    for (const it of this.items || []) {
      if (!it.widgets) continue;
      let hit = false;
      for (const ph of it.widgets) if (ph.dataset.w === key) { ph.classList.add('sized'); ph.style.height = css; hit = true; }
      if (hit) touched.push(it);
    }
    if (!touched.length) return;
    this.layout.invalidate(touched);
    this.widgets.placeSoon();
    this.relayoutSoon();
  }

  // the tab on a widget's frame: its command in the source popover, as for a figure; with Alt,
  // its line in the source pane. The widget itself takes every other click.
  widgetSource(ph, e) {
    const info = atomOfEl(ph);
    if (!info || info.s == null) return;
    if (e.altKey) { this.reveal(info.f, info.s, true); return; }
    this.disarm();
    this.openAtom(ph, info);
  }

  // A document with no text on the page to type into (a new one, an empty file, a preamble
  // alone): a blank paragraph at the end of its body that stays, so typing on the page starts it.
  emptyGhost() {
    if (this.root.querySelector('span.t')) return;
    const flows = this.root.querySelectorAll('.page .flow');
    const flow = flows[flows.length - 1];
    if (!flow) return;
    const f = this.main, src = this.src(f);
    const begin = /\\begin\s*\{document\}/.exec(src);
    const from = begin ? begin.index + begin[0].length : 0;
    const end = src.slice(from).search(/\\end\s*\{document\}/);
    let pos = begin && end >= 0 ? from + end : src.length;
    while (pos > from && /\s/.test(src[pos - 1])) pos--;
    const g = mk('div', 'it p ghostp empty');
    g.dataset.ctx = 'p';
    g.appendChild(mk('span', 't gh', '\u200B'));
    flow.appendChild(g);
    this.ghost = { el: g, f, pos, sticky: true };
  }

  relayout(force) {
    if (!this.model) return;
    const c = this.caretNow();
    this.layoutPass(force);
    if (c && document.activeElement === this.root) this.restoreCaret(c, true);
  }

  tocPages(plan) {
    const tocs = this.root.querySelectorAll('.toc-p');
    if (!tocs.length) return;
    const where = [];
    plan.forEach((pg, k) => { for (const e of pg.entries) if (e.it.kind === 'h' && e.a === 0) where.push({ el: e.it.el, page: k + 1 }); });
    const byText = new Map();
    for (const w of where) byText.set(w.el.textContent.replace(/\s+/g, ' ').trim(), w.page);
    for (const t of tocs) {
      const row = t.parentNode;
      const key = ((row.querySelector('.toc-n').textContent || '') + (row.querySelector('.toc-t').textContent || '')).replace(/\s+/g, ' ').trim();
      let pg = byText.get(key);
      if (pg == null) for (const [k, v] of byText) if (k.endsWith(row.querySelector('.toc-t').textContent.trim())) { pg = v; break; }
      t.textContent = pg != null ? String(pg) : '';
    }
  }

  status(ms) {
    const m = this.model;
    const pages = this.layout.pages.length;
    $('#st-pages').textContent = pages + (pages === 1 ? ' page' : ' pages');
    $('#st-words').textContent = m.words.toLocaleString('en-US') + ' words';
    this.problemsSoon();
    $('#docname').textContent = this.name;
    this.lastMs = ms;
    this.updateFileTabs();
  }

  // ---- caret ------------------------------------------------------------------
  caretNow() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!this.root.contains(r.startContainer)) return null;
    if (this.ghost && this.ghost.el.contains(r.startContainer)) return { ghost: true, f: this.ghost.f, p: this.ghost.pos };
    if (this.pending && r.collapsed && this.pending.node === r.startContainer && this.pending.offset === r.startOffset) {
      return { f: this.pending.f, p: this.pending.p, a: this.pending.p, b: this.pending.p, collapsed: true };
    }
    const A = posFromDom(r.startContainer, r.startOffset, this.root);
    if (!A || A.ghost) return null;
    let Bp = A;
    if (!r.collapsed) { Bp = posFromDom(r.endContainer, r.endOffset, this.root); if (!Bp || Bp.ghost) Bp = A; }
    if (Bp.f !== A.f) return { f: A.f, p: A.p, a: A.p, b: A.p, collapsed: true, crossFile: true };
    const a = Math.min(A.p, Bp.p), b = Math.max(A.p, Bp.p);
    return { f: A.f, p: A.p, a, b, collapsed: r.collapsed || a === b, range: r };
  }

  restoreCaret(c, quiet) {
    if (!c || c.f == null) return;
    const sel = getSelection();
    if (c.selA != null) {
      const x = this.index.find(c.f, c.selA, 1), y = this.index.find(c.f, c.selB, -1);
      if (x && y) { sel.setBaseAndExtent(x.node, x.offset, y.node, y.offset); this.root.focus({ preventScroll: true }); return; }
    }
    const r = this.index.find(c.f, c.p, c.bias ?? -1);
    if (!r || !r.node) return;
    if (document.activeElement !== this.root) this.root.focus({ preventScroll: true });
    sel.collapse(r.node, r.offset);
    const back = posFromDom(r.node, r.offset, this.root);
    this.pending = back && back.p !== c.p ? { f: c.f, p: c.p, node: r.node, offset: r.offset } : null;
    if (!quiet) this.scrollToCaret();
  }

  scrollToCaret() {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.bottom === 0)) {
      const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (!n) return;
      rect = n.getBoundingClientRect();
    }
    const D = this.desk.getBoundingClientRect();
    if (rect.bottom > D.bottom - 40) this.desk.scrollTop += rect.bottom - D.bottom + 80;
    else if (rect.top < D.top + 20) this.desk.scrollTop -= D.top - rect.top + 80;
  }

  placeInitialCaret() {
    const first = this.root.querySelector('.it.p span.t');
    if (!first || window.innerWidth < 700) return;
  }

  // ---- edits & history ----------------------------------------------------------
  commit(edits, caret, kind) {
    // while the pages are stale (see rebuild) only edits made from the text itself go through
    if (this.stale && !/^(restore|reject|merge|other-tab)$/.test(kind || '')) { this.toast('The page cannot show the document as it is now. Edit the source, or undo.'); return; }
    edits = edits.filter((ed) => { const n = (this.files.get(ed.f) ?? '').length; return ed.s >= 0 && ed.e >= ed.s && ed.e <= n; });
    if (!edits.length) { if (caret) this.restoreCaret(caret); return; }
    const cb = this.caretNow() || caret;
    this.removeGhost();
    const before = new Map();
    const byFile = new Map();
    for (const ed of edits) { if (!byFile.has(ed.f)) byFile.set(ed.f, []); byFile.get(ed.f).push(ed); }
    for (const [f, list] of byFile) {
      let text = this.files.get(f) ?? '';
      before.set(f, text);
      list.sort((x, y) => y.s - x.s || y.e - x.e);
      for (const ed of list) text = text.slice(0, ed.s) + ed.t + text.slice(ed.e);
      this.files.set(f, text);
    }
    this.record(before, kind, cb && cb.f != null ? { f: cb.f, p: cb.p } : caret, caret);
    this.zipDirty = true;
    this.rebuild(caret);
    this.pushToSource();
    this.saveSoon();
  }

  record(before, kind, cb, ca) {
    const files = [];
    for (const [f, b] of before) { const d = diff(b, this.files.get(f)); if (d) files.push({ f, ...d }); }
    if (!files.length) return;
    const now = Date.now();
    const top = this.hist[this.hist.length - 1];
    const contiguous = top && top.caretAfter && cb && top.caretAfter.f === cb.f && Math.abs(top.caretAfter.p - cb.p) <= 2;
    if (top && top.open && kind && top.kind === kind && now - top.time < 2000 && (kind !== 'type' && kind !== 'del' || contiguous)) {
      for (const [f, b] of before) if (!top.before.has(f)) top.before.set(f, b);
      top.files = [];
      for (const [f, b] of top.before) { const d = diff(b, this.files.get(f)); if (d) top.files.push({ f, ...d }); }
      top.caretAfter = ca; top.time = now;
      return;
    }
    if (top) { top.open = false; top.before = null; }
    this.hist.push({ kind, files, caretBefore: cb, caretAfter: ca, time: now, open: true, before });
    if (this.hist.length > 400) this.hist.shift();
    this.redoStack = [];
    this.updateUndoUI();
  }

  closeGroup() { const top = this.hist[this.hist.length - 1]; if (top) { top.open = false; top.before = null; } }

  undo() {
    // typing in the source pane joins the history only after a pause: take it in first, so
    // Ctrl+Z right after typing undoes that typing instead of wiping it
    if (this.srcRebuild.pending()) this.srcRebuild.flush();
    this.closePop(true);
    const h = this.hist.pop();
    if (!h) { this.toast('Nothing to undo'); return; }
    h.open = false; h.before = null;
    for (const d of h.files) { const t = this.files.get(d.f) ?? ''; this.files.set(d.f, t.slice(0, d.s) + d.del + t.slice(d.s + d.ins.length)); }
    this.redoStack.push(h);
    const c = h.caretBefore || (h.files[0] ? { f: h.files[0].f, p: h.files[0].s + h.files[0].del.length } : null);
    this.rebuild(c);
    this.pushToSource();
    this.saveSoon();
    this.updateUndoUI();
  }
  redo() {
    if (this.srcRebuild.pending()) this.srcRebuild.flush();
    this.closePop(true);
    const h = this.redoStack.pop();
    if (!h) { this.toast('Nothing to redo'); return; }
    for (const d of h.files) { const t = this.files.get(d.f) ?? ''; this.files.set(d.f, t.slice(0, d.s) + d.ins + t.slice(d.s + d.del.length)); }
    this.hist.push(h);
    const c = h.caretAfter || (h.files[0] ? { f: h.files[0].f, p: h.files[0].s + h.files[0].ins.length } : null);
    this.rebuild(c);
    this.pushToSource();
    this.saveSoon();
    this.updateUndoUI();
  }
  updateUndoUI() { $('#b-undo').disabled = !this.hist.length; $('#b-redo').disabled = !this.redoStack.length; }

  src(f) { return this.files.get(f) ?? ''; }
  savePrefs() { store(PREFS, this.prefs); }

  // ---- input --------------------------------------------------------------------
  bindUI() {
    const R = this.root;
    R.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    R.addEventListener('keydown', (e) => this.onKeyDown(e));
    R.addEventListener('compositionstart', () => this.onCompStart());
    R.addEventListener('compositionend', (e) => this.onCompEnd(e));
    R.addEventListener('paste', (e) => this.onPaste(e));
    R.addEventListener('copy', (e) => this.onCopy(e, false));
    R.addEventListener('cut', (e) => this.onCopy(e, true));
    R.addEventListener('dragstart', (e) => e.preventDefault());
    R.addEventListener('drop', (e) => { if (!(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)) e.preventDefault(); });
    R.addEventListener('mousedown', (e) => this.onMouseDown(e), true);
    R.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('selectionchange', () => this.onSelChange());
    document.addEventListener('keydown', (e) => this.onGlobalKey(e));

    const D = this.desk;
    D.addEventListener('dragover', (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
    D.addEventListener('dragleave', (e) => { if (e.target === D) document.body.classList.remove('dropping'); });
    D.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); document.body.classList.remove('dropping'); this.openFiles([...e.dataTransfer.files]); } });
    D.addEventListener('scroll', () => { if (this.pop) this.positionPop(); this.hideBubble(); }, { passive: true });

    $('#b-open').addEventListener('click', () => $('#fileinput').click());
    $('#fileinput').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) this.openFiles(fs); });
    $('#b-save').addEventListener('click', () => this.save());
    $('#b-copy').addEventListener('click', () => this.copySource());
    $('#b-share').addEventListener('click', () => this.openSharePanel());
    $('#guest-send').addEventListener('click', () => this.openSharePanel());
    $('#guest-x').addEventListener('click', () => { $('#guest').hidden = true; document.body.classList.remove('guest'); if (this.shareCtx) { this.shareCtx.dismissed = true; kvPut('share:' + this.name + '|' + this.main, this.shareCtx).catch(() => {}); } });
    $('#b-pdf').addEventListener('click', () => this.togglePdf());
    $('#pdf-x').addEventListener('click', () => this.togglePdf(false));
    $('#pdf-re').addEventListener('click', () => { if (this.compiling && this.passStart && Date.now() - this.passStart > 4000) this.stopPdf(); else this.compilePdf({ clean: true }); });
    $('#pdf-dl').addEventListener('click', () => this.downloadPdf());
    $('#pdf-engine').addEventListener('change', (e) => this.setEngine(e.target.value));
    $('#pdf-shell').addEventListener('change', (e) => {
      // ticking it on a document that came in a link allows shell escape for that document only
      const li = this.linkCache && this.linkCache.get(this.name + '|' + this.main);
      if (e.target.checked && li && !li.allowed) { if (this.prefs.shellEscape === false) { this.prefs.shellEscape = true; store(PREFS, this.prefs); } this.allowShellHere(); return; }
      this.prefs.shellEscape = e.target.checked; store(PREFS, this.prefs); if (document.body.classList.contains('pdf-on')) this.compilePdf({ clean: true });
    });
    this.syncEngineMenu();
    $('#pdf-msg').addEventListener('click', () => { if (this.texIssues.some((x) => x.sev !== 'info')) this.toggleNav(true, 'problems'); });
    window.addEventListener('beforeprint', () => { this.printSeen = true; if (!this.printing) this.preparePrint(); });
    window.addEventListener('afterprint', () => { if (!this.printing) this.endPrint(); });
    $('#b-undo').addEventListener('click', () => this.undo());
    $('#b-redo').addEventListener('click', () => this.redo());
    $('#b-src').addEventListener('click', () => this.toggleSource());
    $('#b-zin').addEventListener('click', () => this.setZoom(+1));
    $('#b-zout').addEventListener('click', () => this.setZoom(-1));
    $('#zoomv').addEventListener('click', () => this.setZoom(0));
    $('#b-ai').addEventListener('click', () => this.openAsk());
    $('#b-help').addEventListener('click', () => this.openHelp());
    $('#b-sample').addEventListener('click', () => this.resetToSample());
    $('#b-new').addEventListener('click', () => this.newDocument());
    $('#st-warn').addEventListener('click', () => this.toggleNav(true, 'problems'));
    $('#b-nav').addEventListener('click', () => this.toggleNav());
    $('#nav-close').addEventListener('click', () => this.toggleNav(false));
    $('#nt-outline').addEventListener('click', () => this.toggleNav(true, 'outline'));
    $('#nt-problems').addEventListener('click', () => this.toggleNav(true, 'problems'));
    $('#nt-changes').addEventListener('click', () => this.toggleNav(true, 'changes'));
    $('#nt-git').addEventListener('click', () => this.toggleNav(true, 'git'));
    $('#nav-body').addEventListener('focusout', () => setTimeout(() => { if (this.navStale && !$('#nav-body').contains(document.activeElement)) this.refreshNav(); }, 0));
    // a phone kills a hidden page without beforeunload: the last keystrokes are written as it hides
    const away = () => { this.leaving(); if (this.snapDirty) this.snapshot(''); };
    window.addEventListener('pagehide', away);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') away(); else this.adoptOtherTab(); });
    window.addEventListener('focus', () => this.adoptOtherTab());
    D.addEventListener('scroll', debounce(() => this.markCurrentHeading(), 80), { passive: true });
    $('#bubble').addEventListener('mousedown', (e) => e.preventDefault());
    $('#bubble').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'bf') this.toggleStyle('textbf');
      if (a === 'em') this.toggleStyle('emph');
      if (a === 'tt') this.toggleStyle('texttt');
      if (a === 'ai') this.openAsk();
      if (a === 'cm') this.commentOnSelection();
      if (a === 'src') this.revealCaret(true);
    });
    $('#gutter').addEventListener('pointerdown', (e) => this.dragGutter(e));
    window.addEventListener('beforeunload', () => this.leaving());
  }

  // Leaving with an edit not written yet. IndexedDB may not finish before the page is gone (a
  // quick navigation drops the write), so the text also goes to localStorage, which is written
  // at once; init takes whichever copy is newer, and the next write to IndexedDB clears it.
  leaving() {
    if (!this.unsaved) return;
    store(STORE, { name: this.name, main: this.main, files: [...this.files.entries()], t: Date.now(), zipDirty: this.zipDirty });
    this.saveSoon.flush();
  }

  onGlobalKey(e) {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    this.plainPaste = !!(mod && e.shiftKey && e.key.toLowerCase() === 'v');
    if (mod && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(); }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileinput').click(); }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); if (document.body.classList.contains('pdf-on')) this.compilePdf(); else this.togglePdf(true); }
    if (mod && e.key === '\\') { e.preventDefault(); this.toggleSource(); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); this.toggleNav(); }
    if (e.key === 'Escape') { if (this.pop) { this.closePop(); e.preventDefault(); } this.disarm(); }
    // Ctrl+Z where no field takes it, after a click on Reject, a zoom button or the bubble, undoes
    // in the document as on the page; it did nothing until a click back on the page
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && (k === 'z' || k === 'y') && !e.defaultPrevented && !(e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], .CodeMirror, math-field'))) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) this.redo(); else this.undo();
    }
  }

  onKeyDown(e) {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (k === 'y') { e.preventDefault(); this.redo(); return; }
      if (k === 'b') { e.preventDefault(); this.toggleStyle('textbf'); return; }
      if (k === 'i') { e.preventDefault(); this.toggleStyle('emph'); return; }
      if (k === 'u') { e.preventDefault(); this.toggleStyle('underline'); return; }
      if (k === 'm') { e.preventDefault(); this.newMath(); return; }
      if (k === 'e' && e.shiftKey) { e.preventDefault(); this.newDisplayMath(); return; }
      if (k === 'enter') { e.preventDefault(); this.tableRow(); return; }
      if (k === 'k') { e.preventDefault(); this.openPalette(); return; }
      // the browser's own select-all ends on a page number, which cannot be selected, and
      // collapses to the top of the page: Ctrl+A then Ctrl+C copied nothing and Delete did nothing
      if (k === 'a' && !e.shiftKey) { e.preventDefault(); this.selectAllText(); return; }
    }
    if (e.key === 'Tab') {
      const n = getSelection().anchorNode;
      const el = n && (n.nodeType === 1 ? n : n.parentElement);
      if (el && el.closest('td')) { e.preventDefault(); this.tabCell(e.shiftKey); return; }
    }
    if (e.key === 'Escape') { this.disarm(); }
    // Enter on an equation, citation or block that Backspace selected opens it, as a click does:
    // the keyboard's way in (Enter used to replace it with a paragraph break)
    if (e.key === 'Enter' && !e.shiftKey && this.armed && this.armed.el && this.armed.el.isConnected) {
      const info = atomOfEl(this.armed.el);
      if (info && !['br', 'sp'].includes(info.a.kind)) {
        e.preventDefault();
        const el = this.armed.el;
        this.disarm();
        this.openAtom(el, info);
        return;
      }
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && this.armed) {
      e.preventDefault();
      const A = this.armed;
      this.disarm();
      this.commit([{ f: A.f, s: A.s, e: A.e, t: '' }], { f: A.f, p: A.s }, 'del-atom');
      return;
    }
    if (this.armed && !['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) this.disarm();
  }

  onBeforeInput(e) {
    const t = e.inputType;
    if (e.isComposing || t === 'insertCompositionText' || t === 'deleteCompositionText' || t === 'insertFromComposition') return;
    e.preventDefault();
    if (this.composing) return;
    switch (t) {
      case 'insertText': case 'insertReplacementText': {
        let data = e.data;
        if (data == null && e.dataTransfer) data = e.dataTransfer.getData('text/plain');
        if (data == null) return;
        let range = null;
        if (t === 'insertReplacementText' && e.getTargetRanges) {
          const tr = e.getTargetRanges()[0];
          if (tr) range = this.rangeToSrc(tr);
        }
        this.insertText(data, range);
        break;
      }
      case 'insertParagraph': this.enter(false); break;
      case 'insertLineBreak': this.enter(true); break;
      case 'deleteContentBackward': case 'deleteContentForward': case 'deleteWordBackward': case 'deleteWordForward':
      case 'deleteSoftLineBackward': case 'deleteHardLineBackward': case 'deleteSoftLineForward': case 'deleteHardLineForward':
      case 'deleteContent': case 'deleteByCut': case 'deleteEntireSoftLine': case 'deleteByDrag': {
        const ranges = e.getTargetRanges ? e.getTargetRanges() : [];
        this.deleteInput(t, ranges);
        break;
      }
      case 'formatBold': this.toggleStyle('textbf'); break;
      case 'formatItalic': this.toggleStyle('emph'); break;
      case 'formatUnderline': this.toggleStyle('underline'); break;
      case 'historyUndo': this.undo(); break;
      case 'historyRedo': this.redo(); break;
      default: break;
    }
  }

  rangeToSrc(r) {
    const A = posFromDom(r.startContainer, r.startOffset, this.root);
    const B = posFromDom(r.endContainer, r.endOffset, this.root);
    if (!A || !B || A.ghost || B.ghost || A.f !== B.f) return null;
    return { f: A.f, a: Math.min(A.p, B.p), b: Math.max(A.p, B.p) };
  }

  // Build deletion edits for [a,b) in f without breaking markup.
  deletionEdits(f, a, b) {
    if (a >= b) return [];
    const src = this.src(f);
    const slice = src.slice(a, b);
    if (/^\s+$/.test(slice)) {
      if ((slice.match(/\n/g) || []).length >= 2) return [{ f, s: a, e: b, t: ' ' }];
      return [{ f, s: a, e: b, t: '' }];
    }
    // Only comment lines between two paragraphs (a note, a review comment): joining them takes
    // out the blank lines alone. The comments are text nobody sees on the page, and the line
    // break left before them keeps a space between the two paragraphs' words.
    if (/^(?:\s|%[^\n]*\n)+$/.test(slice) && /\n[ \t]*\n/.test(slice)) {
      const lines = slice.split('\n');
      const kept = lines.filter((l, i) => i === 0 || i === lines.length - 1 || l.trim() !== '');
      return [{ f, s: a, e: b, t: kept.join('\n') }];
    }
    if (isBalanced(src, a, b) && !/\\(begin|end)\s*\{(document)\}/.test(slice) && !/\\(section|subsection|subsubsection|chapter|part|maketitle|item|bibliography)\b/.test(slice)) {
      return [{ f, s: a, e: b, t: '' }];
    }
    const vr = visibleRanges(this.renderer.blocks, f, a, b);
    return vr.map(([s, e]) => ({ f, s, e, t: '' }));
  }

  insertText(data, range) {
    if (!data) return;
    const c = this.caretNow();
    if (c && c.ghost) { this.ghostInsert(escapeTeX(data, ' ')); return; }
    if (!c) return;
    if (data === '$' && (!range && c.collapsed)) { this.newMath(); return; }
    if (data === '\\' && (!range && c.collapsed)) { this.openPalette(); return; }
    const f = range ? range.f : c.f;
    let a = range ? range.a : c.a, b = range ? range.b : c.b;
    const src = this.src(f);
    const edits = this.deletionEdits(f, a, b);
    let at = a;
    // If deletion collapsed to visible ranges, insertion goes where the first visible char was
    if (edits.length && edits[0].s > a && edits.length > 0 && edits[0].t === '') at = edits[0].s;
    const prev = src[at - 1] || ' ';
    let t = escapeTeX(data, prev);
    if (/^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
    if (/^[[*]/.test(t) && grabsBracket(src, at, t[0])) t = '{' + t[0] + '}' + t.slice(1);
    // merge if insertion point coincides with a deletion start
    const merged = [];
    let inserted = false;
    for (const ed of edits) {
      if (!inserted && ed.s === at) { merged.push({ ...ed, t: ed.t + t }); inserted = true; }
      else merged.push(ed);
    }
    if (!inserted) merged.push({ f, s: at, e: at, t });
    const removedBefore = edits.filter((ed) => ed.e <= at).reduce((s, ed) => s + (ed.e - ed.s) - ed.t.length, 0);
    const caret = { f, p: at - removedBefore + t.length, bias: -1 };
    this.commit(merged, caret, edits.length ? 'replace' : 'type');
  }

  deleteInput(type, ranges) {
    const c = this.caretNow();
    if (c && c.ghost) {
      if (/Backward/.test(type) && !this.ghost.sticky) { const g = this.ghost; this.removeGhost(); this.restoreCaret({ f: g.f, p: g.pos }); }
      return;
    }
    if (!c) return;
    let f = c.f, a = c.a, b = c.b;
    if (c.collapsed) {
      // Caret in an empty placeholder: remove the empty wrapper it belongs to.
      const an = getSelection().anchorNode;
      const phEl = an && (an.nodeType === 1 ? an : an.parentElement);
      if (phEl && phEl.closest && phEl.closest('span.t.ph')) {
        const ph = phEl.closest('span.t.ph');
        const wrap = ph.parentElement && ph.parentElement.closest('[data-y]');
        const y = wrap && styOfEl(wrap);
        if (y && this.src(y.f).slice(y.is, y.ie).trim() === '') {
          this.commit([{ f: y.f, s: y.s, e: y.e, t: '' }], { f: y.f, p: y.s }, 'del');
          return;
        }
      }
      const tr = ranges && ranges[0];
      let r = tr ? this.rangeToSrc(tr) : null;
      if (r && r.a === r.b) r = null;
      // With nothing selected, Backspace takes only what is before the caret and Delete only
      // what is after it. At the start of a theorem's body the browser names a range that begins
      // past the generated "Theorem 1." label, which maps to the paragraph's end: taken as it
      // came, one Backspace deleted the whole paragraph.
      if (r && (/Backward/.test(type) ? r.b > c.a : r.a < c.a)) r = null;
      if (!r) {
        // Nothing the browser would delete: paragraph boundary or atom edge.
        r = this.fallbackDeleteRange(c, /Backward/.test(type));
        if (!r) return;
      }
      f = r.f; a = r.a; b = r.b;
      // Select-first for atoms
      let vr = visibleRanges(this.renderer.blocks, f, a, b);
      // One keystroke takes one visible thing: a range reaching over several (two display
      // formulas before a paragraph) is cut to the one next to the caret, which is then selected
      // first like any formula; whole, both went at once.
      if (vr.length > 1) {
        if (/Backward/.test(type)) a = vr[vr.length - 1][0]; else b = vr[0][1];
        vr = visibleRanges(this.renderer.blocks, f, a, b);
      }
      // Nothing of it is on the page, yet it holds a command with an argument (a letter's
      // \date{...} and \subject{...}, a \label, a \vspace): one keystroke would delete what the
      // user cannot see. The caret steps over it instead.
      if (!vr.length && /\\[A-Za-z@]+\*?\s*(?:\[[^\]]*\]\s*)*\{/.test(this.src(f).slice(a, b))) {
        this.restoreCaret({ f, p: /Backward/.test(type) ? a : b, bias: /Backward/.test(type) ? -1 : 1 });
        return;
      }
      const atom = this.soleAtom(f, a, b, vr);
      if (atom) { this.arm(atom); return; }
    }
    const edits = this.deletionEdits(f, a, b);
    if (!edits.length) {
      const p = /Backward/.test(type) || !c.collapsed ? a : b;
      this.restoreCaret({ f, p, bias: /Backward/.test(type) ? -1 : 1 });
      return;
    }
    const removedBefore = edits.filter((ed) => ed.e <= a).reduce((s, ed) => s + (ed.e - ed.s) - ed.t.length, 0);
    let p = a - removedBefore;
    const first = edits[0];
    if (first.s >= a) p = first.s + first.t.length;
    this.commit(edits, { f, p, bias: -1 }, 'del');
  }

  fallbackDeleteRange(c, backward) {
    const src = this.src(c.f);
    const p = c.a;
    // Find adjacent visible position from the index
    if (this.index.dirty) this.index.build();
    const arr = this.index.byFile.get(c.f) || [];
    if (backward) {
      let prevEnd = null;
      for (const E of arr) if (E.b < p && (prevEnd == null || E.b > prevEnd)) prevEnd = E.b;
      if (prevEnd == null) return null;
      return { f: c.f, a: prevEnd, b: p };
    }
    let nextStart = null;
    for (const E of arr) if (E.a > p && (nextStart == null || E.a < nextStart)) nextStart = E.a;
    if (nextStart == null) return null;
    void src;
    return { f: c.f, a: p, b: nextStart };
  }

  soleAtom(f, a, b, vr) {
    if (vr.length !== 1) return null;
    for (const B of this.renderer.blocks) {
      for (let k = 0; k < B.atoms.length; k++) {
        const at = B.atoms[k];
        if (at.ro || at.soft || at.kind === 'br' || at.kind === 'sp') continue;
        const off = at.absolute ? 0 : B.base;
        if ((at.f || B.f) === f && at.s + off === vr[0][0] && at.e + off === vr[0][1] && at.s + off >= a && at.e + off <= b) {
          const el = this.root.querySelector('[data-a="' + B.id + '.' + k + '"]');
          return { f, s: at.s + off, e: at.e + off, el, kind: at.kind };
        }
      }
    }
    return null;
  }

  arm(atom) {
    this.disarm();
    this.armed = atom;
    if (atom.el) {
      atom.el.classList.add('sel');
      const r = document.createRange();
      r.selectNode(atom.el);
      const s = getSelection();
      this.ourSel = true;
      s.removeAllRanges(); s.addRange(r);
    }
    this.toast('Press Backspace again to delete this ' + ({ math: 'equation', cite: 'citation', ref: 'reference', fn: 'footnote', img: 'figure', widget: 'live figure', chip: 'command', raw: 'block' }[atom.kind] || 'item') + (atom.kind === 'br' || atom.kind === 'sp' ? '.' : ', or Enter to edit it.'), 1800);
  }
  disarm() {
    if (this.armed && this.armed.el) this.armed.el.classList.remove('sel');
    this.armed = null;
  }

  enter(soft) {
    const c = this.caretNow();
    if (!c) return;
    if (c.ghost) return;
    const sel = getSelection();
    const node = sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const ctxEl = el && el.closest('[data-ctx]');
    const kind = ctxEl ? ctxEl.dataset.ctx : 'p';
    const f = c.f;
    const src = this.src(f);
    let edits = c.collapsed ? [] : this.deletionEdits(f, c.a, c.b);
    const p = c.a;
    if (soft) {
      if (kind === 'cell') { this.commit([...edits, { f, s: p, e: p, t: '\\newline ' }], { f, p: p + 9 }, 'type'); return; }
      if (kind === 'h' || kind === 'cap') return;
      this.commit([...edits, { f, s: p, e: p, t: '\\\\\n' }], { f, p: p + 3, bias: 1 }, 'type');
      return;
    }
    if (kind === 'cell' || kind === 'cap' || kind === 'ttl') return;
    const itemEl = el.closest('.it');
    if (kind === 'h') {
      const B = itemEl && BLOCKS.get(+itemEl.dataset.b);
      // the \label on the heading's next line stays with the heading: the new paragraph goes after it
      const lab = B && /^\s*\\label\s*\{[^}]*\}/.exec(src.slice(B.e));
      if (B) this.showGhost(itemEl, f, B.e + (lab ? lab[0].length : 0));
      return;
    }
    if (kind === 'li' && itemEl && itemEl.dataset.li) {
      const [is, ie, ls, le, cmdE, lkind] = itemEl.dataset.li.split(',');
      const B = BLOCKS.get(+itemEl.dataset.b);
      const base = B.base;
      const itemText = src.slice(+cmdE + base, +ie + base);
      if (!itemText.trim() && c.collapsed) {
        // exit the list: remove empty item, continue after the list
        const s = +is + base, e = +ie + base;
        let s2 = s; while (s2 > 0 && (src[s2 - 1] === ' ' || src[s2 - 1] === '\t')) s2--;
        if (src[s2 - 1] === '\n') s2--;
        const listEnd = +le + base;
        const removed = e - s2;
        const ins = '\n\n';
        this.commit([{ f, s: s2, e, t: '' }, { f, s: listEnd, e: listEnd, t: ins }], { f, p: listEnd - removed + ins.length, bias: 1 }, 'enter');
        return;
      }
      const t = '\n' + (lkind === 'desc' ? '\\item[] ' : '\\item ');
      // indent like the current item line
      let ls2 = +is + base; let ind = '';
      while (ls2 > 0 && (src[ls2 - 1] === ' ' || src[ls2 - 1] === '\t')) { ind = src[ls2 - 1] + ind; ls2--; }
      const w = c.collapsed ? this.wrapBreak(el, f, p) : { p, close: '', open: '' };
      const ins = w.close + '\n' + ind + t.slice(1) + w.open;
      this.commit([...edits, { f, s: w.p, e: w.p, t: ins }], { f, p: Math.max(w.p, p) + ins.length, bias: 1 }, 'enter');
      return;
    }
    // Paragraph: at end -> ghost paragraph; otherwise split
    if (c.collapsed && itemEl && this.atItemEnd(itemEl, sel)) {
      this.showGhost(itemEl, f, p);
      return;
    }
    const w = c.collapsed ? this.wrapBreak(el, f, p) : { p, close: '', open: '' };
    const ins = w.close + '\n\n' + w.open;
    // a break moved before a wrapper leaves the caret at the start of its text, still inside it
    this.commit([...edits, { f, s: w.p, e: w.p, t: ins }], { f, p: Math.max(w.p, p) + ins.length, bias: 1 }, 'enter');
  }

  // Enter inside \textbf{...}, \emph{...} and the like: TeX stops with "Paragraph ended before
  // \textbf was complete" at a break inside their argument, so they close before the break and
  // open again after it. At the very start or end of one the break goes outside it instead.
  wrapBreak(el, f, p) {
    const src = this.src(f);
    let close = '', open = '';
    for (let n = el; n && n !== this.root && !n.classList.contains('it'); n = n.parentElement) {
      const y = n.dataset.y ? styOfEl(n) : null;
      if (!y || y.f !== f || !Number.isFinite(y.s) || p < y.is || p > y.ie) continue;
      if (!close && p === y.ie) { p = y.e; continue; }
      if (!open && p === y.is) { p = y.s; continue; }
      close += src.slice(y.ie, y.e);
      open = src.slice(y.s, y.is) + open;
    }
    return { p, close, open };
  }

  atItemEnd(itemEl, sel) {
    if (itemEl.classList.contains('split-a')) return false;
    const r = document.createRange();
    r.setStart(sel.anchorNode, sel.anchorOffset);
    r.setEnd(itemEl, itemEl.childNodes.length);
    const frag = r.cloneContents();
    const txt = [...frag.querySelectorAll('span.t')].map((s) => s.textContent).join('').replace(/[\u200B\s]/g, '');
    const atoms = frag.querySelectorAll('.atom:not(.a-br)').length;
    // also text directly in the frag's first partial text node
    let lead = '';
    if (sel.anchorNode.nodeType === 3) lead = sel.anchorNode.data.slice(sel.anchorOffset).replace(/[\u200B\s]/g, '');
    return !txt && !atoms && !lead;
  }

  showGhost(afterEl, f, pos) {
    this.removeGhost();
    const g = document.createElement('div');
    g.className = 'it p ghostp' + (afterEl.classList.contains('ind') || afterEl.classList.contains('p') ? ' ind' : '');
    g.dataset.ctx = 'p';
    const s = document.createElement('span');
    s.className = 't gh';
    s.textContent = '\u200B';
    g.appendChild(s);
    afterEl.after(g);
    this.ghost = { el: g, f, pos };
    const sel = getSelection();
    this.ourSel = true;
    sel.collapse(s.firstChild, 1);
    this.scrollToCaret();
  }
  removeGhost() { if (this.ghost) { this.ghost.el.remove(); this.ghost = null; } }
  ghostInsert(tex) {
    const g = this.ghost;
    const src = this.src(g.f);
    // comment lines right under the paragraph belong to it (a review comment is about the line
    // above it): the new paragraph goes after them
    const cm = /^[ \t]*(?:%[^\n]*)?(?:\r?\n[ \t]*%[^\n]*)*/.exec(src.slice(g.pos));
    if (cm[0].includes('%')) g.pos += cm[0].length;
    let nlB = 0; for (let k = g.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
    let nlA = 0; for (let k = g.pos; k < src.length && /\s/.test(src[k]); k++) if (src[k] === '\n') nlA++;
    // no blank lines at the very start or end of a file: there is no paragraph to keep apart
    const pre = g.pos === 0 ? '' : '\n'.repeat(Math.max(0, 2 - nlB));
    const post = g.pos >= src.length ? '' : '\n'.repeat(Math.max(0, 2 - nlA));
    this.removeGhost();
    this.commit([{ f: g.f, s: g.pos, e: g.pos, t: pre + tex + post }], { f: g.f, p: g.pos + pre.length + tex.length, bias: -1 }, 'type');
  }

  onCompStart() {
    this.composing = true;
    this.compCaret = this.caretNow();
  }
  onCompEnd(e) {
    this.composing = false;
    const c = this.compCaret;
    this.compCaret = null;
    const data = e.data || '';
    if (!c) { this.forceRender = true; this.rebuild(); return; }
    if (c.ghost) { if (data) this.ghostInsert(escapeTeX(data, ' ')); else this.relayout(true); return; }
    // The browser mutated the DOM; rebuild from source regardless.
    this.forceRender = true;
    if (!data) { this.rebuild({ f: c.f, p: c.a }); return; }
    const src = this.src(c.f);
    const edits = c.collapsed ? [] : this.deletionEdits(c.f, c.a, c.b);
    let t = escapeTeX(data, src[c.a - 1] || ' ');
    if (/^[A-Za-z]/.test(t) && endsWithControlWord(src, c.a)) t = '{}' + t;
    // the deletions of a replaced selection lie after c.a: they do not move the caret back
    const removedBefore = edits.filter((ed) => ed.e <= c.a).reduce((s, ed) => s + (ed.e - ed.s) - ed.t.length, 0);
    this.commit([...edits, { f: c.f, s: c.a, e: c.a, t }], { f: c.f, p: c.a - removedBefore + t.length }, 'type');
  }

  // ---- clipboard ------------------------------------------------------------------
  selectionLatex(c) {
    const src = this.src(c.f);
    if (isBalanced(src, c.a, c.b)) return src.slice(c.a, c.b);
    const vr = visibleRanges(this.renderer.blocks, c.f, c.a, c.b);
    let out = '';
    let last = null;
    for (const [s, e] of vr) {
      if (last != null && /\n\s*\n/.test(src.slice(last, s))) out += '\n\n';
      out += src.slice(s, e);
      last = e;
    }
    return out;
  }
  onCopy(e, cut) {
    const c = this.caretNow();
    if (!c || c.collapsed) return;
    e.preventDefault();
    const latex = this.selectionLatex(c);
    const plain = getSelection().toString().replace(/\u200B/g, '');
    e.clipboardData.setData('text/plain', plain);
    try { e.clipboardData.setData('text/x-galley-latex', latex); } catch (err) { /* ignore */ }
    try { e.clipboardData.setData('text/html', selectionHTML(getSelection(), (el) => this.mathML(el))); } catch (err) { /* plain text still works */ }
    this.lastCopy = { plain, latex };
    if (cut) {
      const edits = this.deletionEdits(c.f, c.a, c.b);
      this.commit(edits, { f: c.f, p: c.a }, 'cut');
    }
  }
  onPaste(e) {
    e.preventDefault();
    const dt = e.clipboardData;
    if (!dt) return;
    const plain = dt.getData('text/plain') || '';
    const html = dt.getData('text/html') || '';
    const plainOnly = this.plainPaste;
    this.plainPaste = false;
    // a screenshot or an image copied from a page joins the project, as a dropped file does (the
    // paste did nothing at all), under a name of its own: browsers call every pasted image image.png
    const imgs = !plain && !html ? [...(dt.files || [])].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type)) : [];
    if (imgs.length) { this.openFiles(imgs.map((f, i) => new File([f], 'pasted-' + Date.now().toString(36) + (i ? '-' + i : '') + '.' + f.type.slice(6).replace('jpeg', 'jpg'), { type: f.type }))); return; }
    let latex = '';
    try { latex = dt.getData('text/x-galley-latex') || ''; } catch (err) { latex = ''; }
    if (!latex && this.lastCopy && plain === this.lastCopy.plain) latex = this.lastCopy.latex;
    const c = this.caretNow();
    if (!c) return;
    const src = this.src(c.ghost ? this.ghost.f : c.f);
    const at0 = c.ghost ? this.ghost.pos : c.a;
    // inside a command argument (a heading, a cell, a caption) a paste stays one paragraph
    const inArg = c.ghost ? false : braceDepth(src, at0) > 0;
    const el = getSelection().anchorNode && (getSelection().anchorNode.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode.parentElement);
    const inline = inArg || !!(el && el.closest && el.closest('td, .it.h, .cap'));
    const pre = this.src(this.main).split(/\\begin\s*\{document\}/)[0];
    const o = { prev: src[at0 - 1] || ' ', hyperref: /\\usepackage(\[[^\]]*\])?\{[^}]*hyperref/.test(pre), booktabs: /\\usepackage(\[[^\]]*\])?\{[^}]*booktabs/.test(pre), inlineOnly: inline };
    const rich = () => {
      if (plainOnly) return textToTeX(plain, o.prev);
      let t = '';
      if (html && /<[a-z]/i.test(html)) { try { t = htmlToTeX(html, o); } catch (err) { t = ''; } }
      if (!t.trim()) t = plainToTeX(plain, o.prev, o);
      if (inline) t = t.replace(/\s*\n\s*\n\s*/g, ' ').replace(/\n/g, ' ');
      return t;
    };
    if (c.ghost) { this.ghostInsert(latex || rich()); return; }
    const edits = this.deletionEdits(c.f, c.a, c.b);
    const at = edits.length && edits[0].s >= c.a ? edits[0].s : c.a;
    let t = latex || rich();
    if (/^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
    if (/^[[*]/.test(t) && grabsBracket(src, at, t[0])) t = '{' + t[0] + '}' + t.slice(1);
    const removedBefore = edits.filter((ed) => ed.e <= at).reduce((s, ed) => s + (ed.e - ed.s), 0);
    this.commit([...edits, { f: c.f, s: at, e: at, t }], { f: c.f, p: at - removedBefore + t.length }, 'paste');
    // LaTeX source pasted as text got its backslashes escaped: offer to keep it as LaTeX
    if (!latex && !plainOnly && t !== plain && /\\[A-Za-z]+/.test(plain) && /\\textbackslash\{\}|\\\$/.test(t)) {
      const pos = { f: c.f, s: at - removedBefore, len: t.length, raw: plain };
      this.toast('Pasted as text.', 6000, { label: 'Paste as LaTeX', fn: () => {
        if (this.src(pos.f).slice(pos.s, pos.s + pos.len) !== t) { this.toast('The pasted text has changed since; paste it again.'); return; }
        this.commit([{ f: pos.f, s: pos.s, e: pos.s + pos.len, t: pos.raw }], { f: pos.f, p: pos.s + pos.raw.length }, 'paste');
      } });
    }
  }

  // ---- styles ---------------------------------------------------------------------
  toggleStyle(cmd) {
    const c = this.caretNow();
    if (!c || c.ghost) return;
    const groups = { textbf: ['textbf', 'bf', 'bfseries'], emph: ['emph', 'textit', 'it', 'itshape'], underline: ['underline', 'uline'], texttt: ['texttt', 'tt', 'ttfamily'] };
    const names = groups[cmd] || [cmd];
    const sel = getSelection();
    // Are we inside a matching style wrapper?
    let wrapper = null;
    const anc = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    for (let n = anc; n && n !== this.root; n = n.parentElement) {
      if (n.dataset && n.dataset.y) { const y = styOfEl(n); if (y && names.includes(y.cmd)) { wrapper = y; break; } }
    }
    const src = this.src(c.f);
    if (wrapper && (c.collapsed || (c.a >= wrapper.is && c.b <= wrapper.ie))) {
      const inner = src.slice(wrapper.is, wrapper.ie);
      const shift = wrapper.is - wrapper.s;
      this.commit([{ f: c.f, s: wrapper.s, e: wrapper.e, t: inner }], c.collapsed ? { f: c.f, p: c.a - shift } : { f: c.f, p: c.a - shift, selA: c.a - shift, selB: c.b - shift }, 'style');
      return;
    }
    const open = '\\' + cmd + '{';
    if (c.collapsed) {
      this.commit([{ f: c.f, s: c.a, e: c.a, t: open + '}' }], { f: c.f, p: c.a + open.length, bias: 1 }, 'style');
      return;
    }
    if (!isBalanced(src, c.a, c.b)) { this.toast('That selection crosses structure. Select text inside one paragraph or cell.'); return; }
    this.commit([{ f: c.f, s: c.b, e: c.b, t: '}' }, { f: c.f, s: c.a, e: c.a, t: open }], { f: c.f, p: c.b + open.length, selA: c.a + open.length, selB: c.b + open.length }, 'style');
  }

  // ---- tables --------------------------------------------------------------------
  tabCell(back) {
    const sel = getSelection();
    const n = sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const td = el && el.closest('td');
    if (!td) return;
    const cells = [...td.closest('table').querySelectorAll('td:not(.rule-cell)')];
    const i = cells.indexOf(td);
    const next = cells[i + (back ? -1 : 1)];
    if (!next) return;
    const sp = next.querySelector('span.t');
    if (!sp) return;
    const r = document.createRange();
    r.selectNodeContents(sp);
    sel.removeAllRanges(); sel.addRange(r);
  }
  tableRow() {
    const sel = getSelection();
    const n = sel.anchorNode;
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    const td = el && el.closest('td');
    if (!td) { this.toast('Ctrl+Enter adds a table row when the caret is in a table cell.'); return; }
    const tr = td.closest('tr');
    const ncol = [...tr.children].reduce((s, x) => s + (x.colSpan || 1), 0);
    // find the end of this row in source: last visible position in the row, then the next \\
    const spans = tr.querySelectorAll('span.t');
    const last = spans[spans.length - 1];
    const info = last && segOfSpan(last);
    if (!info) return;
    const f = info.seg.f;
    const src = this.src(f);
    const p = boundary(info.B, info.seg, info.o + info.len);
    const m = /\\\\(\s*\[[^\]]*\])?/g;
    m.lastIndex = p;
    const hit = m.exec(src);
    if (!hit) return;
    const at = hit.index + hit[0].length;
    const ins = '\n' + Array(ncol).fill(' ').join('&') + '\\\\';
    this.commit([{ f, s: at, e: at, t: ins }], { f, p: at + 2, bias: 1 }, 'table');
  }

  // ---- mouse ---------------------------------------------------------------------
  onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.mk-layer')) { e.preventDefault(); this.toggleNav(true, 'changes'); return; }
    const atomEl = e.target.closest('.atom');
    if (e.altKey) {
      e.preventDefault();
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      let pos = null;
      if (atomEl) { const a = atomOfEl(atomEl); if (a) pos = { f: a.f, p: a.s }; }
      else if (r) pos = posFromDom(r.startContainer, r.startOffset, this.root);
      if (pos && !pos.ghost) this.reveal(pos.f, pos.p, true);
      return;
    }
    if (!atomEl) {
      this.disarm();
      // an empty document: a click anywhere on the page goes to the blank paragraph
      if (this.ghost && this.ghost.sticky) { e.preventDefault(); this.root.focus({ preventScroll: true }); getSelection().collapse(this.ghost.el.firstChild.firstChild, 1); }
      return;
    }
    const info = atomOfEl(atomEl);
    if (!info) return;
    e.preventDefault();
    this.disarm();
    if ((e.metaKey || e.ctrlKey) && (info.a.kind === 'url' || atomEl.closest('.y-link'))) { const u = info.a.url || atomEl.closest('.y-link').dataset.url; if (u) openLink(u); return; }
    this.openAtom(atomEl, info);
  }

  onClick(e) {
    if (this.pdfView && document.body.classList.contains('pdf-on') && !e.target.closest('.atom')) {
      const c = this.caretNow();
      if (c && c.f != null && !c.ghost) this.pdfView.reveal(this.texPath(c.f), lineOf(this.src(c.f), c.a));
    }
    const link = e.target.closest('.y-link');
    if (link && (e.metaKey || e.ctrlKey) && link.dataset.url) openLink(link.dataset.url);
    const mac = e.target.closest('.mac');
    if (mac && e.altKey) { const a = atomOfEl(mac); if (a) this.openRaw(mac, a); }
  }

  onSelChange() {
    const sel = getSelection();
    const inRoot = sel.rangeCount && this.root.contains(sel.anchorNode);
    if (this.ghost && !this.ghost.sticky && !(inRoot && this.ghost.el.contains(sel.anchorNode))) {
      // keep ghost while focus is in the popover; drop otherwise
      if (!this.pop) this.removeGhost();
    }
    if (this.pending && (!sel.rangeCount || sel.anchorNode !== this.pending.node || sel.anchorOffset !== this.pending.offset)) this.pending = null;
    if (!inRoot) { this.hideBubble(); return; }
    if (this.ourSel) { this.ourSel = false; }
    if (!sel.isCollapsed) { this.showBubble(); const c = this.caretNow(); if (c && !c.collapsed) { this.lastSel = c; this.lastSelT = Date.now(); } } else this.hideBubble();
    this.syncSoon();
  }

  // Select all: from the first character of the text on the pages to the last one
  selectAllText() {
    const ts = this.root.querySelectorAll('span.t');
    if (!ts.length) return;
    const a = ts[0].firstChild || ts[0], z = ts[ts.length - 1].lastChild || ts[ts.length - 1];
    const r = document.createRange();
    r.setStart(a, 0);
    r.setEnd(z, z.nodeType === 3 ? z.length : z.childNodes.length);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  showBubble() {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) return;
    const b = $('#bubble');
    b.hidden = false;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    let x = r.left + r.width / 2 - bw / 2;
    x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
    let y = r.top - bh - 8;
    if (y < 56) y = r.bottom + 8;
    b.style.left = x + 'px';
    b.style.top = y + 'px';
  }
  hideBubble() { $('#bubble').hidden = true; }

  // ---- popovers ------------------------------------------------------------------
  openAtom(el, info) {
    const k = info.a.kind;
    // made by a macro's own text: nothing of it sits at this spot in the file, so no editor
    // may open on it (a formula's field wrote its edit at offsets into the macro's text)
    if (info.a.ro && k !== 'fn') { this.toast('This comes from a macro: edit its definition, in the preamble or the .sty file that has it.'); return; }
    if (k === 'math') return info.is == null ? this.openRaw(el, info) : this.openMath(el, info);
    if (k === 'cite') return this.openCite(el, info);
    if (k === 'ref') return this.openRef(el, info);
    if (k === 'fn') return this.gotoFootnote(el, info);
    if (k === 'br' || k === 'sp') { this.arm({ f: info.f, s: info.s, e: info.e, el, kind: k }); return; }
    return this.openRaw(el, info);
  }

  gotoFootnote(el, info) {
    // find footnote element with same block & number
    const bid = el.dataset.a.split('.')[0];
    const fns = this.root.querySelectorAll('.fn');
    for (const f of fns) {
      const sp = f.querySelector('span.t');
      if (!sp) continue;
      if (sp.dataset.g.split('.')[0] === bid && f.querySelector('.fnn').textContent === info.a.num) {
        const spans = f.querySelectorAll('span.t');
        const last = spans[spans.length - 1];
        const sel = getSelection();
        this.root.focus({ preventScroll: true });
        sel.collapse(last.firstChild, last.firstChild.data.length);
        f.classList.add('flash');
        setTimeout(() => f.classList.remove('flash'), 900);
        this.scrollToCaret();
        return;
      }
    }
  }

  makePop(anchor, cls, title) {
    this.closePop();
    const p = document.createElement('div');
    p.className = 'pop ' + (cls || '');
    p.setAttribute('role', 'dialog');
    if (title) {
      const h = document.createElement('div');
      h.className = 'pop-h';
      const t = document.createElement('span');
      t.textContent = title;
      const x = document.createElement('button');
      x.className = 'pop-x'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
      x.addEventListener('click', () => this.closePop());
      h.append(t, x);
      p.appendChild(h);
    }
    document.body.appendChild(p);
    this.pop = { el: p, anchor, anchorPos: null, onClose: null, session: 'pop' + Date.now() };
    p.addEventListener('mousedown', (e) => e.stopPropagation());
    setTimeout(() => {
      this.popOutside = (e) => {
        if (!this.pop || this.pop.el.contains(e.target) || (e.target.closest && e.target.closest('.atom'))) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.some((n) => n && n.classList && [...n.classList].some((c) => c.startsWith('ML__') || c.startsWith('MLK__') || c.startsWith('ui-menu') || c === 'wm-chip')) || path.some((n) => n && n.tagName && /^MATH-VIRTUAL-KEYBOARD|^UI-MENU/i.test(n.tagName))) return;
        this.closePop();
      };
      document.addEventListener('mousedown', this.popOutside, true);
    }, 0);
    return p;
  }
  positionPop() {
    const P = this.pop;
    if (!P) return;
    let a = P.anchor;
    if ((!a || !a.isConnected) && P.anchorPos) a = this.findAtomEl(P.anchorPos);
    if (a && a.isConnected) P.anchor = a;
    let r;
    if (a && a.isConnected) r = a.getBoundingClientRect();
    else if (P.rect) r = P.rect;
    else return;
    const el = P.el;
    const w = el.offsetWidth;
    const VH = window.innerHeight - (this.kbH || 0);
    el.style.maxHeight = Math.max(160, VH - 60) + 'px';
    const h = el.offsetHeight;
    const chip = () => { if (P.wordTyping) requestAnimationFrame(() => P.wordTyping && P.wordTyping.reposition()); };
    if (window.innerWidth < 640) { el.classList.add('sheet-mode'); chip(); return; }
    let x = r.left;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    let y = r.bottom + 8;
    if (y + h > VH - 8) y = r.top - h - 8;
    y = Math.max(52, Math.min(VH - h - 8, y));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    chip();
  }
  findAtomEl(pos) {
    for (const B of this.renderer.blocks) {
      for (let k = 0; k < B.atoms.length; k++) {
        const at = B.atoms[k];
        const off = at.absolute ? 0 : B.base;
        if ((at.f || B.f) === pos.f && at.s + off === pos.s && at.kind === pos.kind) {
          const el = this.root.querySelector('[data-a="' + B.id + '.' + k + '"]');
          if (el) return el;
        }
      }
    }
    return null;
  }
  closePop(silent) {
    if (!this.pop) return;
    const P = this.pop;
    if (P.onClose) { try { P.onClose(); } catch (e) { console.error(e); } }
    if (P.mathText) { try { this.ensurePackages(P.mathText(), P); } catch (e) { console.error(e); } }
    if (P.wordTyping) P.wordTyping.destroy();
    try { if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide(); } catch (e) { /* ignore */ }
    this.pop = null;
    if (this.popOutside) document.removeEventListener('mousedown', this.popOutside, true);
    P.el.remove();
    this.closeGroup();
    if (!silent && P.returnCaret) this.restoreCaret(P.returnCaret);
  }

  // A few Word symbols need a package beyond amsmath and amssymb (\\llbracket needs stmaryrd).
  // Add the \\usepackage line once, in the same undo step as the equation edit.
  ensurePackages(tex, P) {
    const need = new Set();
    String(tex).replace(/\\([A-Za-z]+)/g, (m, n) => { if (PACKAGES[n]) need.add(PACKAGES[n]); return m; });
    if (!need.size) return;
    const f = this.main;
    const src = this.src(f);
    const docAt = src.search(/\\begin\s*\{document\}/);
    if (docAt < 0) return;
    const pre = src.slice(0, docAt);
    const have = new Set();
    pre.replace(/(^|[^\\])%.*$/gm, '$1').replace(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g, (m, l) => { l.split(',').forEach((x) => have.add(x.trim())); return m; });
    const add = [...need].filter((x) => !have.has(x));
    if (!add.length) return;
    let at = -1;
    const re = /^[ \t]*\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\}[^\n]*\n/gm;
    let m;
    while ((m = re.exec(pre))) at = m.index + m[0].length;
    if (at < 0) { const d = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]*\}[^\n]*\n/.exec(pre); if (!d) return; at = d.index + d[0].length; }
    const text = add.map((x) => '\\usepackage{' + x + '}\n').join('');
    const top = this.hist[this.hist.length - 1];
    if (top && top.open && top.kind === P.session) top.time = Date.now();
    this.commit([{ f, s: at, e: at, t: text }], null, P.session);
    if (P.returnCaret && P.returnCaret.f === f && P.returnCaret.p >= at) P.returnCaret = { ...P.returnCaret, p: P.returnCaret.p + text.length };
    this.toast('Added ' + add.map((x) => '\\usepackage{' + x + '}').join(', ') + ' for a symbol in this equation.');
  }

  // Live-editing a source range from a popover.
  liveRange(f, s, e) {
    const P = this.pop;
    P.range = { f, s, e };
    return (text, caret) => {
      const R = P.range;
      const cur = this.src(R.f).slice(R.s, R.e);
      if (cur === text) return;
      const keepSel = document.activeElement;
      this.commit([{ f: R.f, s: R.s, e: R.e, t: text }], null, P.session);
      // the caret goes back after the formula or citation when the popover closes: it moves with
      // the range's end, or what is typed next lands inside the new text (\end{ More.equation})
      const rc = P.returnCaret;
      if (rc && rc.f === R.f && rc.p >= R.e) P.returnCaret = { ...rc, p: rc.p + text.length - (R.e - R.s) };
      R.e = R.s + text.length;
      if (keepSel && keepSel.isConnected) keepSel.focus({ preventScroll: true });
      this.positionPop();
      void caret;
    };
  }

  ensureMathLive() {
    if (window.MathfieldElement) return Promise.resolve(true);
    if (this.mlLoading) return this.mlLoading;
    this.mlLoading = loadScript(CDN.ml).then(() => {
      const M = window.MathfieldElement;
      if (!M) return false;
      try { M.fontsDirectory = null; M.soundsDirectory = null; M.keypressSound = null; M.plonkSound = null; } catch (e) { /* older API */ }
      return true;
    }).catch(() => { this.mlLoading = null; return false; });
    return this.mlLoading;
  }

  mlMacros() {
    const out = {};
    for (const [k, v] of Object.entries(this.renderer.macros)) if (typeof v === 'string' && /^\\[A-Za-z]+$/.test(k) && !/^\\(mleft|mright)$/.test(k)) out[k.slice(1)] = v;
    return out;
  }

  // Replace the static preview with an editable equation field.
  async attachField(holder, ta, opts) {
    ta.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      const inner = t ? unwrapMath(t) : null;
      if (inner == null) return;
      e.preventDefault();
      ta.setRangeText(inner, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    });
    const ok = await this.ensureMathLive();
    const P = this.pop;
    if (!ok || !P || !holder.isConnected) return null;
    const mf = new window.MathfieldElement();
    mf.className = 'mfield';
    mf.id = 'pop-field';
    mf.setAttribute('aria-label', 'Equation editor');
    // Inside the artifact viewer the page is framed; keep the on-screen keyboard in this page.
    const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    try { mf.mathVirtualKeyboardPolicy = framed ? 'sandboxed' : 'auto'; } catch (e) { /* ignore */ }
    holder.replaceWith(mf);
    const docMacros = this.mlMacros();
    const { ops, operators, plain } = classifyMacros(docMacros);
    try { mf.macros = { ...mf.macros, ...docMacros, ...FIELD_MACROS }; } catch (e) { /* ignore */ }
    try { mf.inlineShortcuts = wordShortcuts(mf.inlineShortcuts); } catch (e) { /* ignore */ }
    try { mf.smartFence = true; mf.scriptDepth = 4; mf.defaultMode = opts.display ? 'math' : 'inline-math'; } catch (e) { /* ignore */ }
    // Operators with limits (\DeclareMathOperator*) live in the field in expanded form;
    // read back how the field writes each one so it can be folded back to its name.
    const canon = {};
    for (const [k, d] of Object.entries(ops)) {
      try { mf.setValue(d, { silenceNotifications: true }); canon[k] = modelValue(mf) || d; } catch (e) { canon[k] = d; }
    }
    let fieldMacros = [];
    try { fieldMacros = Object.keys(mf.macros).filter((k) => /^[A-Za-z]+$/.test(k) && !canon[k]); } catch (e) { fieldMacros = Object.keys(plain); }
    const tallMacros = new Set(Object.entries(docMacros).filter(([, v]) => isTallDef(v)).map(([k]) => k));
    const optMacros = new Set((this.renderer.optMacros || []).filter(([, v]) => v.opt).map(([k]) => String(k).replace(/^\\/, '')));
    const pre = this.src(this.main).split(/\\begin\s*\{document\}/)[0];
    const decimalComma = /^(de|fr|es)$/.test((this.model && this.model.opts.lang) || '') && !/\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(icomma|ziffer|ncccomma)\b/.test(pre);
    const D = makeDialect({ display: !!opts.display, ops: canon, operators, fieldMacros, tallMacros, optMacros });
    if (framed && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) mf.addEventListener('focusin', () => { try { window.mathVirtualKeyboard.show(); } catch (e) { /* ignore */ } });
    if (!this.kbWatch && window.mathVirtualKeyboard) {
      this.kbWatch = true;
      try {
        window.mathVirtualKeyboard.addEventListener('geometrychange', () => {
          const K = window.mathVirtualKeyboard;
          this.kbH = K.visible && K.boundingRect ? K.boundingRect.height : 0;
          document.documentElement.style.setProperty('--kb-h', (this.kbH || 0) + 'px');
          this.positionPop();
        });
      } catch (e) { /* ignore */ }
    }
    const strMacros = {};
    for (const [k, v] of Object.entries(this.renderer.macros)) if (typeof v === 'string') strMacros[k] = v;
    const R = this.renderer;
    const same = window.katex ? makeSame(window.katex, strMacros, !!opts.display, R.si ? (t) => siInMath(t, R.si.opts, R.si.units, R.si.lang) : null) : null;
    let st = toField(ta.value, opts.display, opts.env(), D);
    st.same = same;
    mf.setValue(st.latex, { silenceNotifications: true });
    st.ml = fieldRows(modelValue(mf), st.multi, D);
    // A formula the field cannot hold as written (an array with *{n}{c} columns, a command it
    // does not know) would come back changed after the first keystroke: keep it as source.
    if (same && opts.initial && ta.value === opts.initial && !faithful(st, same)) {
      mf.replaceWith(holder);
      const n = document.createElement('div');
      n.className = 'pop-note';
      n.id = 'pop-lossy';
      n.textContent = 'The equation field cannot show all of this formula, so it is edited as source here.';
      holder.after(n);
      this.positionPop();
      return null;
    }
    let fromMf = false;
    mf.addEventListener('input', () => {
      const tex = fromField(fieldValue(mf), st);
      if (tex === ta.value) return;
      fromMf = true;
      ta.value = tex;
      ta.dispatchEvent(new Event('input'));
      fromMf = false;
    });
    const sync = () => {
      if (fromMf) return;
      st = toField(ta.value, opts.display, opts.env(), D);
      st.same = same;
      if (mf.getValue('latex') !== st.latex) mf.setValue(st.latex, { silenceNotifications: true });
      st.ml = fieldRows(modelValue(mf), st.multi, D);
    };
    ta.addEventListener('input', sync);
    mf.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text/plain');
      const inner = t ? unwrapMath(t) : null;
      if (inner == null) return;
      e.preventDefault(); e.stopImmediatePropagation();
      mf.insert(D.toField(inner), { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after', mode: 'math' });
      mf.dispatchEvent(new Event('input'));
    }, true);
    // MathLive 0.108+ can miss focusing itself when clicked while another input has focus.
    mf.addEventListener('pointerup', () => { if (document.activeElement !== mf) focusField(mf); }, true);
    P.syncField = sync;
    if (opts.onKey) mf.addEventListener('keydown', (e) => { if (!wt.active() && mf.mode !== 'latex') opts.onKey(e); }, true);
    const wt = installWordTyping(mf, {
      host: P.el,
      macros: () => plain,
      dialect: () => D,
      onNewRowOutside: opts.onNewRowOutside,
      renderTex: (t) => this.renderer.katex(t, false).html,
      decimalComma,
      baseDepth: () => (st.multi ? 1 : 0)
    });
    mf.addEventListener('keydown', (e) => {
      if (wt.active() || mf.mode === 'latex') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); opts.onEscape(); }
      else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); opts.onEnter(); }
    }, true);
    P.wordTyping = wt;
    P.field = mf;
    if (!opts.keepFocus || document.activeElement !== ta || ta.value === opts.initial) {
      focusField(mf);
      try { mf.executeCommand('moveToMathfieldEnd'); if (st.multi) mf.position = Math.max(0, mf.lastOffset - 1); } catch (e) { /* ignore */ }
    }
    this.positionPop();
    return mf;
  }

  openMath(el, info) {
    const display = !!info.a.display;
    const f = info.f;
    const src = this.src(f);
    const inner = src.slice(info.is, info.ie);
    const p = this.makePop(el, 'pop-math', display ? 'Display math' : 'Inline math');
    this.pop.env = info.a.env;
    this.pop.anchorPos = { f, s: info.s, kind: 'math' };
    this.pop.returnCaret = { f, p: info.e, bias: 1 };
    const ta = document.createElement('textarea');
    ta.className = 'code';
    ta.id = 'pop-tex';
    ta.spellcheck = false;
    const lead = display ? inner.match(/^\n?/)[0] : '';
    // the trailing line end is looked for after the leading one: in a new, empty equation
    // ("\n  \n") it is the last line end alone, not the whole blank line, which TeX reads as a
    // paragraph break inside the equation (Missing $ inserted)
    const rest = inner.slice(lead.length);
    const end = rest.match(/\n\s*$/);
    // an equation whose two lines hold nothing ("\n"): the formula goes on a line of its own
    const trail = !display ? '' : end ? end[0] : rest.trim() ? '' : lead;
    ta.value = display ? (end ? rest.slice(0, end.index) : rest) : inner;
    ta.rows = Math.min(10, Math.max(display ? 3 : 1, ta.value.split('\n').length));
    const prev = document.createElement('div');
    prev.className = 'pv';
    const err = document.createElement('div');
    err.className = 'pv-err';
    p.append(ta, prev, err);
    const row = document.createElement('div');
    row.className = 'pop-row';
    if (display) {
      const envSel = document.createElement('select');
      envSel.id = 'pop-env';
      const cur = info.a.env;
      for (const [v, l] of [['equation', 'Numbered equation'], ['equation*', 'Unnumbered equation'], ['align', 'Aligned, numbered rows'], ['align*', 'Aligned, no numbers'], ['gather', 'Gathered, numbered'], ['\\[', '\\[ \\] display']]) {
        const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cur) o.selected = true; envSel.appendChild(o);
      }
      if (![...envSel.options].some((o) => o.selected)) { const o = document.createElement('option'); o.value = cur; o.textContent = cur; o.selected = true; envSel.appendChild(o); }
      envSel.addEventListener('change', () => this.changeEnv(envSel.value));
      row.appendChild(envSel);
    }
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = display ? '\\name + Space, x^(n+1), a/b, Space steps out, Ctrl+Enter new row, Enter done' : '\\name + Space, x^(n+1), a/b, Space steps out, Enter done';
    row.appendChild(hint);
    if (this.caps.sample) {
      const ai = document.createElement('button');
      ai.className = 'btn ghost sm'; ai.type = 'button'; ai.textContent = 'Describe it';
      ai.addEventListener('click', () => this.describeMath(ta, display));
      row.appendChild(ai);
    }
    const word = document.createElement('button');
    word.className = 'btn ghost sm'; word.type = 'button'; word.textContent = 'Copy for Word';
    word.title = 'Copy this equation as MathML; Word, PowerPoint and OneNote paste it as an editable equation';
    word.addEventListener('click', () => this.copyEquation(ta.value, display));
    row.appendChild(word);
    const done = document.createElement('button');
    done.className = 'btn sm'; done.type = 'button'; done.textContent = 'Done';
    done.addEventListener('click', () => this.closePop());
    row.appendChild(done);
    // Brackets in the source that are smaller than what they hold: offer Word's sizing.
    const docMacros = this.mlMacros();
    const tall = tallTest(display, new Set(Object.entries(docMacros).filter(([, v]) => isTallDef(v)).map(([k]) => k)));
    const optNames = new Set((this.renderer.optMacros || []).filter(([, v]) => v.opt).map(([k]) => String(k).replace(/^\\/, '')));
    const fit = fitBrackets(ta.value, tall, optNames);
    if (fit.count) {
      const note = document.createElement('div');
      note.className = 'pop-fit';
      const t = document.createElement('span');
      t.textContent = fit.count === 1 ? 'One pair of brackets is smaller than what it holds.' : fit.count + ' pairs of brackets are smaller than what they hold.';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ghost sm'; b.textContent = 'Fit them, like Word';
      b.addEventListener('click', () => {
        const now = fitBrackets(ta.value, tall, optNames);
        ta.value = now.text;
        ta.dispatchEvent(new Event('input'));
        note.remove();
        this.positionPop();
      });
      note.append(t, b);
      p.appendChild(note);
    }
    p.appendChild(row);
    const apply = this.liveRange(f, info.is, info.ie);
    this.pop.applyInner = (v) => apply(lead + v + trail);
    const preview = () => {
      const r = this.renderer.katex(this.mathPreviewTex(ta.value, display), display);
      prev.innerHTML = r.html;
      err.textContent = r.err ? r.err : '';
      err.hidden = !r.err;
    };
    preview();
    const push = debounce(() => this.pop && this.pop.applyInner(ta.value), 140);
    ta.addEventListener('input', () => { preview(); push(); ta.rows = Math.min(10, Math.max(display ? 3 : 1, ta.value.split('\n').length)); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!display || e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); push.flush(); this.closePop(); }
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
    });
    this.pop.onClose = () => push.flush();
    this.pop.mathText = () => ta.value;
    this.positionPop();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const initial = ta.value;
    this.attachField(prev, ta, {
      display, initial, keepFocus: true,
      env: () => (this.pop && this.pop.env) || info.a.env,
      // Ctrl+Enter in a one-line display: turn it into an align so it can take rows.
      onNewRowOutside: display ? () => {
        const P = this.pop;
        if (!P) return;
        const env = P.env || info.a.env;
        const to = env === 'equation' ? 'align' : /^(equation\*|\\\[|\$\$|displaymath)$/.test(env) ? 'align*' : null;
        if (!to) { this.toast('This display cannot take rows. Pick Aligned in the menu.'); return; }
        push.flush();
        this.changeEnv(to);
        const sel = P.el.querySelector('#pop-env');
        if (sel) { if (![...sel.options].some((o) => o.value === to)) { const o = document.createElement('option'); o.value = to; o.textContent = to; sel.appendChild(o); } sel.value = to; }
        const mf = P.field;
        if (!mf) return;
        focusField(mf);
        try { mf.position = Math.max(0, mf.lastOffset - 1); } catch (e) { /* ignore */ }
        P.wordTyping.newRow();
      } : null,
      onEnter: () => { push.flush(); this.closePop(); },
      onEscape: () => { push.flush(); this.closePop(); }
    });
  }

  mathPreviewTex(t, display) {
    let x = t.replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '');
    if (display && /\\\\/.test(x) && !/\\begin\{/.test(x)) x = '\\begin{aligned}' + x + '\\end{aligned}';
    x = x.replace(/\\(eqref|ref|cref|Cref)\s*\{([^}]*)\}/g, (m, c, k) => { const L = this.model.labels.get(k); return '\\text{' + (c === 'eqref' ? '(' : '') + (L ? L.num : '??') + (c === 'eqref' ? ')' : '') + '}'; });
    return x;
  }

  changeEnv(env) {
    const P = this.pop;
    if (!P || !P.range) return;
    const f = P.range.f;
    const src = this.src(f);
    const el = P.anchor && P.anchor.isConnected ? P.anchor : this.findAtomEl(P.anchorPos);
    const info = el && atomOfEl(el);
    if (!info) return;
    const inner = src.slice(info.is, info.ie).replace(/^\n?/, '\n').replace(/\s*$/, '\n');
    const wrap = env === '\\[' ? '\\[' + inner + '\\]' : '\\begin{' + env + '}' + inner + '\\end{' + env + '}';
    this.commit([{ f, s: info.s, e: info.e, t: wrap }], null, P.session);
    const openLen = env === '\\[' ? 2 : ('\\begin{' + env + '}').length;
    P.range = { f, s: info.s + openLen, e: info.s + openLen + inner.length };
    const lead = '\n', trail = '\n';
    P.applyInner = (v) => {
      const R = P.range;
      const t = lead + v + trail;
      if (this.src(f).slice(R.s, R.e) === t) return;
      this.commit([{ f, s: R.s, e: R.e, t }], null, P.session);
      R.e = R.s + t.length;
    };
    P.anchorPos = { f, s: info.s, kind: 'math' };
    P.env = env;
    if (P.syncField) P.syncField();
    this.positionPop();
  }

  newMath() {
    const c = this.caretNow();
    if (!c) return;
    const sel = getSelection();
    const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const p = this.makePop(null, 'pop-math', 'New inline math');
    this.pop.rect = rect && (rect.width || rect.height) ? rect : (sel.anchorNode && sel.anchorNode.parentElement ? sel.anchorNode.parentElement.getBoundingClientRect() : null);
    const ta = document.createElement('textarea');
    ta.className = 'code'; ta.rows = 1; ta.spellcheck = false; ta.id = 'pop-newtex';
    ta.placeholder = 'e.g. x^2 + y^2 = r^2';
    const prev = document.createElement('div'); prev.className = 'pv';
    const err = document.createElement('div'); err.className = 'pv-err'; err.hidden = true;
    const row = document.createElement('div'); row.className = 'pop-row';
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'Enter to insert. Type $ again for a dollar sign.';
    row.appendChild(hint);
    if (this.caps.sample) {
      const ai = document.createElement('button');
      ai.className = 'btn ghost sm'; ai.type = 'button'; ai.textContent = 'Describe it';
      ai.addEventListener('click', () => this.describeMath(ta, false));
      row.appendChild(ai);
    }
    p.append(ta, prev, err, row);
    let ins = null;
    const base = c.ghost ? null : { f: c.f, a: c.a, b: c.b };
    const ghost = c.ghost ? this.ghost : null;
    const insert = (v) => {
      if (!ins) {
        if (!v) return;
        const t = '$' + v + '$';
        if (ghost) {
          this.ghost = ghost;
          const src = this.src(ghost.f);
          let nlB = 0; for (let k = ghost.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
          const pre = '\n'.repeat(Math.max(0, 2 - nlB));
          this.commit([{ f: ghost.f, s: ghost.pos, e: ghost.pos, t: pre + t + '\n\n' }], null, this.pop.session);
          ins = { f: ghost.f, s: ghost.pos + pre.length, e: ghost.pos + pre.length + t.length };
        } else {
          const edits = base.a !== base.b ? this.deletionEdits(base.f, base.a, base.b) : [];
          const removed = edits.reduce((s, ed) => s + (ed.e - ed.s), 0);
          this.commit([...edits, { f: base.f, s: base.a, e: base.a, t }], null, this.pop.session);
          ins = { f: base.f, s: base.a - (edits.length && edits[0].s < base.a ? removed : 0), e: 0 };
          ins.e = ins.s + t.length;
        }
        this.pop.anchorPos = { f: ins.f, s: ins.s, kind: 'math' };
        this.pop.returnCaret = { f: ins.f, p: ins.e, bias: 1 };
        return;
      }
      const t = '$' + v + '$';
      if (!v) { this.commit([{ f: ins.f, s: ins.s, e: ins.e, t: '' }], null, this.pop.session); ins = null; return; }
      this.commit([{ f: ins.f, s: ins.s, e: ins.e, t }], null, this.pop.session);
      ins.e = ins.s + t.length;
      this.pop.returnCaret = { f: ins.f, p: ins.e, bias: 1 };
    };
    const push = debounce(() => this.pop && insert(ta.value), 160);
    const preview = () => { const r = this.renderer.katex(this.mathPreviewTex(ta.value, false), false); prev.innerHTML = ta.value ? r.html : ''; err.textContent = r.err || ''; err.hidden = !r.err || !ta.value; };
    ta.addEventListener('beforeinput', (e) => {
      if (e.data === '$' && !ta.value && !ins) {
        e.preventDefault();
        this.closePop(true);
        if (ghost) { this.ghost = ghost; this.ghostInsert('\\$'); }
        else this.commit([{ f: base.f, s: base.a, e: base.b, t: '\\$' }], { f: base.f, p: base.a + 2 }, 'type');
      }
    });
    ta.addEventListener('input', () => { preview(); push(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); push.flush(); this.closePop(); }
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
    });
    this.pop.onClose = () => push.flush();
    this.pop.mathText = () => ta.value;
    this.pop.returnCaret = base ? { f: base.f, p: base.a } : null;
    this.positionPop();
    ta.focus();
    this.attachField(prev, ta, {
      display: false, initial: '', keepFocus: true,
      env: () => '$',
      onEnter: () => { push.flush(); this.closePop(); },
      onEscape: () => { push.flush(); this.closePop(); },
      onKey: (e) => {
        if (e.key === '$' && !ta.value && !ins) {
          e.preventDefault(); e.stopPropagation();
          this.closePop(true);
          if (ghost) { this.ghost = ghost; this.ghostInsert('\\$'); }
          else this.commit([{ f: base.f, s: base.a, e: base.b, t: '\\$' }], { f: base.f, p: base.a + 2 }, 'type');
        }
      }
    });
  }

  newDisplayMath() {
    const c = this.caretNow();
    if (!c || c.ghost) return;
    const t = '\n\\begin{equation}\n  \n\\end{equation}\n';
    this.commit([{ f: c.f, s: c.a, e: c.a, t }], { f: c.f, p: c.a + t.length }, 'insert');
    const el = this.findAtomEl({ f: c.f, s: c.a + 1, kind: 'math' });
    if (el) { const info = atomOfEl(el); if (info) this.openMath(el, info); }
  }

  async describeMath(ta, display) {
    const S = this.caps.sample;
    if (!S) return;
    const box = this.pop.el;
    let row = box.querySelector('.ask-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'ask-row';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.id = 'pop-describe'; inp.placeholder = 'Describe the math in words';
      const go = document.createElement('button');
      go.className = 'btn sm'; go.type = 'button'; go.textContent = 'Write it';
      row.append(inp, go);
      box.insertBefore(row, box.querySelector('.pop-row'));
      const run = async () => {
        if (!inp.value.trim()) return;
        go.disabled = true; go.textContent = 'Thinking\u2026';
        try {
          const macros = Object.keys(this.model.mathMacros).slice(0, 40).join(' ');
          const { text } = await S('Write LaTeX math for the description below. Reply with only the LaTeX, no dollar signs, no code fences, no commentary.' + (display ? ' It is a display equation; use \\\\ only if multiple aligned rows are needed.' : ' It is inline math.') + (macros ? ' The document defines these macros you may use: ' + macros + '.' : '') + '\n\nCurrent math (may be empty): ' + ta.value + '\n\nDescription: ' + inp.value, { modelTier: 'quick' });
          ta.value = text.trim().replace(/^```\w*\n?|```$/g, '').replace(/^\$+|\$+$/g, '').trim();
          ta.dispatchEvent(new Event('input'));
        } catch (e) { this.toast(e && e.code === 'not_granted' ? 'Claude is not enabled for this page.' : 'Claude could not answer just now.'); }
        go.disabled = false; go.textContent = 'Write it';
      };
      go.addEventListener('click', run);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    }
    row.querySelector('input').focus();
  }

  openRaw(el, info) {
    const f = info.f;
    if (info.s == null) return;
    const src = this.src(f);
    const kindName = { chip: 'Command source', raw: 'Source block', img: 'Figure source', widget: 'Live figure source', url: 'Link source', verb: 'Verbatim source', logo: 'Command source', bib: 'Bibliography entry', mac: 'Macro call', rule: 'Rule' }[info.a.kind] || 'Source';
    const p = this.makePop(el, 'pop-raw', kindName + (f !== this.main ? ' \u00B7 ' + f : ''));
    this.pop.anchorPos = { f, s: info.s, kind: info.a.kind };
    this.pop.returnCaret = { f, p: info.e, bias: 1 };
    const ta = document.createElement('textarea');
    ta.className = 'code';
    ta.id = 'pop-raw';
    ta.spellcheck = false;
    ta.value = src.slice(info.s, info.e);
    ta.rows = Math.min(16, Math.max(2, ta.value.split('\n').length + 1));
    p.appendChild(ta);
    if (el && el.title) { const n = document.createElement('div'); n.className = 'pop-note'; n.textContent = el.title; p.appendChild(n); }
    const row = document.createElement('div'); row.className = 'pop-row';
    const del = document.createElement('button'); del.className = 'btn ghost sm danger'; del.type = 'button'; del.textContent = 'Delete';
    del.addEventListener('click', () => { const R = this.pop.range; this.closePop(true); this.commit([{ f: R.f, s: R.s, e: R.e, t: '' }], { f: R.f, p: R.s }, 'del-atom'); });
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'Changes apply as you type';
    const done = document.createElement('button'); done.className = 'btn sm'; done.type = 'button'; done.textContent = 'Done';
    done.addEventListener('click', () => this.closePop());
    row.append(del, hint, done);
    p.appendChild(row);
    const apply = this.liveRange(f, info.s, info.e);
    const push = debounce(() => this.pop && apply(ta.value), 220);
    ta.addEventListener('input', push);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); push.flush(); this.closePop(); }
    });
    this.pop.onClose = () => push.flush();
    this.positionPop();
    ta.focus();
  }

  bibList() {
    const out = [];
    for (const [k, e] of this.model.bibEntries) out.push({ key: k, label: shortAuthors(e) + ' ' + entryYear(e), title: texToPlain(e.fields.title || '').replace(/[{}]/g, '') });
    return out;
  }

  openCite(el, info) {
    const f = info.f;
    const src = this.src(f);
    const raw = src.slice(info.s, info.e);
    const m = /^\\([A-Za-z]+\*?)\s*((?:\[[^\]]*\]\s*){0,2})\{([^}]*)\}/.exec(raw);
    if (!m) return this.openRaw(el, info);
    let cmd = m[1];
    const opts = (m[2].match(/\[[^\]]*\]/g) || []).map((x) => x.slice(1, -1));
    let pre = opts.length === 2 ? opts[0] : '';
    let post = opts.length === 2 ? opts[1] : (opts[0] || '');
    let keys = m[3].split(',').map((s) => s.trim()).filter(Boolean);
    const p = this.makePop(el, 'pop-cite', 'Citation');
    this.pop.anchorPos = { f, s: info.s, kind: 'cite' };
    this.pop.returnCaret = { f, p: info.e, bias: 1 };
    const apply = this.liveRange(f, info.s, info.e);
    const write = () => {
      const o = pre ? '[' + pre + '][' + post + ']' : (post ? '[' + post + ']' : '');
      apply('\\' + cmd + o + '{' + keys.join(', ') + '}');
      draw();
    };
    const top = document.createElement('div'); top.className = 'pop-row';
    const cs = document.createElement('select'); cs.id = 'pop-citecmd';
    const choices = this.citeChoices();
    for (const [v, l] of choices) { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cmd) o.selected = true; cs.appendChild(o); }
    if (![...cs.options].some((o) => o.selected)) { const o = document.createElement('option'); o.value = cmd; o.textContent = '\\' + cmd; o.selected = true; cs.appendChild(o); }
    cs.addEventListener('change', () => { cmd = cs.value; write(); });
    top.appendChild(cs);
    const chips = document.createElement('div'); chips.className = 'chips';
    const search = document.createElement('input'); search.type = 'search'; search.id = 'pop-citesearch'; search.placeholder = 'Search the bibliography';
    const list = document.createElement('div'); list.className = 'plist';
    const notes = document.createElement('div'); notes.className = 'pop-row notes';
    const preI = document.createElement('input'); preI.type = 'text'; preI.placeholder = 'Before (see)'; preI.value = pre; preI.id = 'pop-citepre';
    const postI = document.createElement('input'); postI.type = 'text'; postI.placeholder = 'After (p.~4)'; postI.value = post; postI.id = 'pop-citepost';
    const wnotes = debounce(() => { pre = preI.value; post = postI.value; write(); }, 300);
    preI.addEventListener('input', wnotes); postI.addEventListener('input', wnotes);
    notes.append(preI, postI);
    p.append(top, chips, search, list, notes);
    const all = this.bibList();
    const draw = () => {
      chips.replaceChildren();
      for (const k of keys) {
        const c = document.createElement('span'); c.className = 'chipk';
        const ent = all.find((x) => x.key === k);
        c.textContent = ent ? ent.label : k + ' (not found)';
        c.title = k;
        if (!ent) c.classList.add('miss');
        const x = document.createElement('button'); x.type = 'button'; x.innerHTML = '&times;'; x.setAttribute('aria-label', 'Remove ' + k);
        x.addEventListener('click', () => { keys = keys.filter((y) => y !== k); write(); });
        c.appendChild(x);
        chips.appendChild(c);
      }
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      const hits = all.filter((x) => !keys.includes(x.key) && (!q || (x.key + ' ' + x.label + ' ' + x.title).toLowerCase().includes(q))).slice(0, 30);
      if (!all.length) { const n = document.createElement('div'); n.className = 'empty'; n.textContent = 'No bibliography loaded. Open your .bib file to cite from it.'; list.appendChild(n); }
      for (const h of hits) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pitem';
        b.innerHTML = '<b>' + esc(h.label) + '</b><span>' + esc(h.title) + '</span>';
        b.addEventListener('click', () => { keys.push(h.key); search.value = ''; write(); search.focus(); });
        list.appendChild(b);
      }
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = list.querySelector('.pitem'); if (b) b.click(); } if (e.key === 'Escape') this.closePop(); });
    draw();
    this.positionPop();
    search.focus();
  }

  // The citation commands the document's packages define: natbib's \citep and \citet, biblatex's
  // own (it has \citep only with its natbib option), or LaTeX's \cite alone. Offering another
  // gives "Undefined control sequence" in the PDF while the page shows the citation.
  citeChoices() {
    const O = this.model.opts;
    const ay = O.citeStyle === 'authoryear';
    if (O.biblatex && !O.biblatexNatbib && !O.natbib) return ay ? [['parencite', '(Author, Year)'], ['textcite', 'Author (Year)'], ['cite', 'Author Year'], ['citeauthor', 'Author'], ['citeyear', 'Year']] : [['cite', '[1]'], ['textcite', 'Author [1]'], ['citeauthor', 'Author']];
    if (O.natbib || O.biblatex) return ay ? [['citep', '(Author, Year)'], ['citet', 'Author (Year)'], ['citealt', 'Author Year'], ['citealp', 'Author, Year'], ['citeauthor', 'Author'], ['citeyear', 'Year'], ['cite', '\\cite']] : [['cite', '[1]'], ['citep', '[1] (natbib)'], ['citet', 'Author [1]'], ['citeauthor', 'Author']];
    return [['cite', '[1]']];
  }

  openRef(el, info) {
    const f = info.f;
    const src = this.src(f);
    const raw = src.slice(info.s, info.e);
    const m = /^\\([A-Za-z]+\*?)\s*\{([^}]*)\}/.exec(raw);
    if (!m) return this.openRaw(el, info);
    let cmd = m[1];
    let key = m[2].trim();
    const p = this.makePop(el, 'pop-ref', 'Cross reference');
    this.pop.anchorPos = { f, s: info.s, kind: 'ref' };
    this.pop.returnCaret = { f, p: info.e, bias: 1 };
    const apply = this.liveRange(f, info.s, info.e);
    const write = () => { apply('\\' + cmd + '{' + key + '}'); draw(); };
    const top = document.createElement('div'); top.className = 'pop-row';
    const cs = document.createElement('select'); cs.id = 'pop-refcmd';
    for (const [v, l] of [['ref', '\\ref  2'], ['eqref', '\\eqref  (2)'], ['cref', '\\cref  eq. (2)'], ['Cref', '\\Cref  Equation (2)'], ['autoref', '\\autoref  Section 2'], ['pageref', '\\pageref']]) { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cmd) o.selected = true; cs.appendChild(o); }
    cs.addEventListener('change', () => { cmd = cs.value; write(); });
    top.appendChild(cs);
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Filter labels'; search.id = 'pop-refsearch';
    const list = document.createElement('div'); list.className = 'plist';
    p.append(top, search, list);
    const labels = [...this.model.labels.entries()].map(([k, v]) => ({ key: k, num: v.num, kind: v.kind }));
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      for (const L of labels.filter((x) => !q || (x.key + ' ' + x.kind + ' ' + x.num).toLowerCase().includes(q))) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pitem' + (L.key === key ? ' on' : '');
        b.innerHTML = '<b>' + esc(L.kind.charAt(0).toUpperCase() + L.kind.slice(1)) + ' ' + esc(L.num || '') + '</b><span>' + esc(L.key) + '</span>';
        b.addEventListener('click', () => { key = L.key; if (L.kind === 'equation' && cmd === 'ref') cmd = 'eqref'; cs.value = cmd; write(); });
        list.appendChild(b);
      }
      if (!labels.length) { const n = document.createElement('div'); n.className = 'empty'; n.textContent = 'No labels yet. Add \\label{...} after a section, equation or figure.'; list.appendChild(n); }
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = list.querySelector('.pitem'); if (b) b.click(); } });
    draw();
    this.positionPop();
    search.focus();
  }

  // ---- command palette -------------------------------------------------------------
  openPalette() {
    const c = this.caretNow();
    if (!c) return;
    const sel = getSelection();
    const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const base = c.ghost ? null : { f: c.f, a: c.a, b: c.b };
    const ghost = c.ghost ? this.ghost : null;
    const p = this.makePop(null, 'pop-pal', 'Insert');
    this.pop.rect = rect && (rect.width || rect.height) ? rect : (sel.anchorNode && sel.anchorNode.parentElement ? sel.anchorNode.parentElement.getBoundingClientRect() : null);
    this.pop.returnCaret = base ? { f: base.f, p: base.a } : null;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'pop-cmd'; inp.className = 'code'; inp.placeholder = 'footnote, cite, section, equation, \u2026';
    inp.autocomplete = 'off'; inp.spellcheck = false;
    const list = document.createElement('div'); list.className = 'plist';
    const hint = document.createElement('div'); hint.className = 'hint pad'; hint.textContent = 'Enter inserts the highlighted item. Anything else you type is inserted as a raw command.';
    p.append(inp, list, hint);
    const B = (open, close) => ({ open, close });
    const items = [
      { k: 'footnote', d: 'Footnote', t: B('\\footnote{', '}') },
      { k: 'cite', d: 'Citation', act: 'cite' },
      { k: 'ref', d: 'Cross reference', act: 'ref' },
      { k: 'eqref', d: 'Equation reference', act: 'eqref' },
      { k: 'emph', d: 'Emphasis', t: B('\\emph{', '}') },
      { k: 'textbf', d: 'Bold', t: B('\\textbf{', '}') },
      { k: 'texttt', d: 'Typewriter', t: B('\\texttt{', '}') },
      { k: 'equation', d: 'Numbered equation', act: 'equation' },
      { k: 'math', d: 'Inline math', act: 'math' },
      { k: 'section', d: 'Section heading', t: B('\n\n\\section{', '}\n\n'), block: true },
      { k: 'subsection', d: 'Subsection heading', t: B('\n\n\\subsection{', '}\n\n'), block: true },
      { k: 'itemize', d: 'Bulleted list', t: B('\n\n\\begin{itemize}\n  \\item ', '\n\\end{itemize}\n\n'), block: true },
      { k: 'enumerate', d: 'Numbered list', t: B('\n\n\\begin{enumerate}\n  \\item ', '\n\\end{enumerate}\n\n'), block: true },
      { k: 'proposition', d: 'Proposition', t: B('\n\n\\begin{proposition}\n', '\n\\end{proposition}\n\n'), block: true },
      { k: 'lemma', d: 'Lemma', t: B('\n\n\\begin{lemma}\n', '\n\\end{lemma}\n\n'), block: true },
      { k: 'theorem', d: 'Theorem', t: B('\n\n\\begin{theorem}\n', '\n\\end{theorem}\n\n'), block: true },
      { k: 'definition', d: 'Definition', t: B('\n\n\\begin{definition}\n', '\n\\end{definition}\n\n'), block: true },
      { k: 'assumption', d: 'Assumption', t: B('\n\n\\begin{assumption}\n', '\n\\end{assumption}\n\n'), block: true },
      { k: 'proof', d: 'Proof', t: B('\n\n\\begin{proof}\n', '\n\\end{proof}\n\n'), block: true },
      { k: 'label', d: 'Label', t: B('\\label{', '}') },
      { k: 'url', d: 'URL', t: B('\\url{', '}') },
      { k: 'ldots', d: 'Ellipsis \u2026', t: B('\\ldots{}', '') },
      { k: 'newline', d: 'Line break', t: B('\\\\\n', '') }
    ];
    let hi = 0;
    let shown = items;
    const draw = () => {
      const q = inp.value.replace(/^\\/, '').trim().toLowerCase();
      shown = items.filter((x) => !q || x.k.startsWith(q) || x.d.toLowerCase().includes(q));
      if (q && !shown.some((x) => x.k === q)) shown = [...shown, { k: q, d: 'Insert \\' + q + ' as typed', raw: true }];
      hi = Math.min(hi, shown.length - 1);
      list.replaceChildren();
      shown.slice(0, 12).forEach((x, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pitem' + (i === hi ? ' on' : '');
        b.innerHTML = '<b class="mono">\\' + esc(x.k) + '</b><span>' + esc(x.d) + '</span>';
        b.addEventListener('click', () => run(x));
        list.appendChild(b);
      });
    };
    const insertAt = (open, close) => {
      if (ghost) {
        this.ghost = ghost;
        const src = this.src(ghost.f);
        let nlB = 0; for (let k = ghost.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
        const pre = '\n'.repeat(Math.max(0, 2 - nlB));
        const o = open.replace(/^\n+/, '');
        this.removeGhost();
        this.commit([{ f: ghost.f, s: ghost.pos, e: ghost.pos, t: pre + o + close }], { f: ghost.f, p: ghost.pos + pre.length + o.length, bias: 1 }, 'insert');
        return;
      }
      const src = this.src(base.f);
      const inner = base.a !== base.b && isBalanced(src, base.a, base.b) ? src.slice(base.a, base.b) : '';
      this.commit([{ f: base.f, s: base.a, e: inner ? base.b : base.a, t: open + inner + close }], { f: base.f, p: base.a + open.length + inner.length, bias: 1 }, 'insert');
    };
    const run = (x) => {
      this.closePop(true);
      if (x.act === 'math') { if (base) this.restoreCaret({ f: base.f, p: base.a }); this.newMath(); return; }
      if (x.act === 'equation') { if (base) this.restoreCaret({ f: base.f, p: base.a }); this.newDisplayMath(); return; }
      if (x.act === 'cite' || x.act === 'ref' || x.act === 'eqref') {
        const cmd = x.act === 'cite' ? this.citeChoices()[0][0] : x.act;
        const t = '\\' + cmd + '{}';
        if (!base) { insertAt(t, ''); return; }
        this.commit([{ f: base.f, s: base.a, e: base.a, t }], { f: base.f, p: base.a + t.length, bias: 1 }, 'insert');
        const el = this.findAtomEl({ f: base.f, s: base.a, kind: x.act === 'eqref' ? 'ref' : x.act });
        if (el) { const info = atomOfEl(el); if (info) (x.act === 'cite' ? this.openCite(el, info) : this.openRef(el, info)); }
        return;
      }
      if (x.raw) { insertAt('\\' + x.k + (/[A-Za-z]$/.test(x.k) ? ' ' : ''), ''); return; }
      insertAt(x.t.open, x.t.close);
    };
    inp.addEventListener('input', () => { hi = 0; draw(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(shown.length - 1, hi + 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
      if (e.key === 'Enter') { e.preventDefault(); if (shown[hi]) run(shown[hi]); }
      if (e.key === 'Escape') { e.preventDefault(); this.closePop(); }
      if (e.key === 'Backspace' && !inp.value) { e.preventDefault(); this.closePop(); }
    });
    draw();
    this.positionPop();
    inp.focus();
  }

  // ---- Ask Claude ------------------------------------------------------------------
  openAsk() {
    const S = this.caps.sample;
    if (!S) { this.toast('Ask Claude works when this page is open in Claude.'); return; }
    let c = this.caretNow();
    if (!c || c.collapsed) c = this.lastSel && Date.now() - (this.lastSelT || 0) < 600000 ? this.lastSel : null;
    if (!c || c.collapsed) { this.toast('Select some text on the page first.'); return; }
    this.askLast = c;
    const f = c.f;
    const src = this.src(f);
    let a = c.a, b = c.b;
    if (!isBalanced(src, a, b)) {
      for (const B of this.renderer.blocks) if (B.f === f && B.s <= a && B.e >= b) { a = B.s; b = B.e; break; }
    }
    const fragment = src.slice(a, b);
    let ctxS = a, ctxE = b;
    for (const B of this.renderer.blocks) if (B.f === f && B.e <= a && B.e > a - 2000) ctxS = Math.min(ctxS, B.s);
    for (const B of this.renderer.blocks) if (B.f === f && B.s >= b && B.s < b + 1500) ctxE = Math.max(ctxE, B.e);
    const context = src.slice(Math.max(0, ctxS), Math.min(src.length, ctxE));
    const panel = $('#ask');
    panel.hidden = false;
    document.body.classList.add('asking');
    $('#ask-frag').textContent = fragment.length > 600 ? fragment.slice(0, 600) + '\u2026' : fragment;
    $('#ask-style').value = this.prefs.style || '';
    const out = $('#ask-out');
    out.value = '';
    out.hidden = true;
    $('#ask-actions').hidden = true;
    const runBtns = panel.querySelectorAll('[data-ask]');
    let ctl = null;
    const run = async (instr) => {
      if (!instr.trim()) return;
      ctl && ctl.abort();
      ctl = new AbortController();
      this.prefs.style = $('#ask-style').value;
      store(PREFS, this.prefs);
      out.hidden = false;
      out.value = 'Thinking\u2026';
      $('#ask-actions').hidden = true;
      $('#ask-stop').hidden = false;
      const prompt = [
        'You are editing a LaTeX research paper. Rewrite the LaTeX fragment below following the instruction.',
        'Reply with only the replacement LaTeX for the fragment: no code fences, no commentary, no preamble.',
        'Keep every \\cite, \\ref, \\label, footnote and math expression unless the instruction asks to change them. Keep blank lines between paragraphs.',
        this.prefs.style ? 'House style: ' + this.prefs.style : '',
        'Instruction: ' + instr,
        '', 'Surrounding text, for context only:', context.slice(0, 6000),
        '', 'Fragment to rewrite:', fragment
      ].filter((x) => x !== null).join('\n');
      try {
        const { text } = await S(prompt, { signal: ctl.signal, cache: false, onText: ({ text }) => { out.value = text; } });
        out.value = text.replace(/^```(?:latex|tex)?\n?|\n?```\s*$/g, '');
        $('#ask-actions').hidden = false;
      } catch (e) {
        if (e && e.code === 'cancelled') { out.value = e.text || ''; if (out.value) $('#ask-actions').hidden = false; }
        else { out.value = (e && e.text) || ''; this.toast(e && e.code === 'not_granted' ? 'Claude is not enabled for this page.' : e && e.code === 'rate_limited' ? 'Claude is busy. Try again in a moment.' : 'Claude could not answer just now.'); }
      }
      $('#ask-stop').hidden = true;
    };
    for (const btn of runBtns) btn.onclick = () => run(btn.dataset.ask);
    $('#ask-go').onclick = () => run($('#ask-instr').value);
    $('#ask-instr').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run($('#ask-instr').value); } };
    $('#ask-stop').onclick = () => ctl && ctl.abort();
    $('#ask-close').onclick = () => { ctl && ctl.abort(); panel.hidden = true; document.body.classList.remove('asking'); };
    $('#ask-accept').onclick = () => {
      const t = out.value;
      if (this.src(f).slice(a, b) !== fragment) { this.toast('The text changed since you asked. Ask again.'); return; }
      panel.hidden = true;
      document.body.classList.remove('asking');
      this.commit([{ f, s: a, e: b, t }], { f, p: a + t.length }, 'ask');
      this.flashRange(f, a, a + t.length);
    };
    $('#ask-discard').onclick = () => { out.hidden = true; $('#ask-actions').hidden = true; };
    $('#ask-instr').focus();
  }

  flashRange(f, a, b) {
    for (const span of this.root.querySelectorAll('span.t')) {
      const i = segOfSpan(span);
      if (!i || i.seg.f !== f) continue;
      const x = boundary(i.B, i.seg, i.o), y = boundary(i.B, i.seg, i.o + i.len);
      if (y > a && x < b) { span.classList.add('flash'); setTimeout(() => span.classList.remove('flash'), 1400); }
    }
  }

  // ---- source pane -----------------------------------------------------------------
  async toggleSource(force) {
    const on = force ?? !document.body.classList.contains('src-on');
    if (on && document.body.classList.contains('pdf-on')) this.togglePdf(false);
    document.body.classList.toggle('src-on', on);
    $('#b-src').setAttribute('aria-pressed', on ? 'true' : 'false');
    this.prefs.source = on;
    store(PREFS, this.prefs);
    if (on) {
      await this.ensureCM();
      this.showSrcFile(this.srcFile || this.main);
      this.revealCaret();
    }
    setTimeout(() => { if (this.computePx()) this.relayout(true); }, 30);
  }

  async ensureCM() {
    if (this.cm || this.cmLoading) return this.cmLoading;
    this.cmLoading = (async () => {
      const host = $('#cmhost');
      try {
        await loadScript(CDN.cm);
        await loadScript(CDN.cmTex);
        this.cm = window.CodeMirror(host, {
          value: '', mode: 'stex', lineNumbers: true, lineWrapping: true, indentUnit: 2, tabSize: 2,
          extraKeys: {
            'Ctrl-Z': () => this.undo(), 'Cmd-Z': () => this.undo(), 'Shift-Ctrl-Z': () => this.redo(), 'Shift-Cmd-Z': () => this.redo(), 'Ctrl-Y': () => this.redo(),
            'Ctrl-S': () => this.save(), 'Cmd-S': () => this.save(),
            // Tab indents in the source, so a keyboard that tabbed in stayed caught here, typing tabs
            // into the file: Escape, then Tab or Shift+Tab, moves on to the next control
            'Esc': () => { this.cmTabOut = true; }
          }
        });
        this.cm.on('keydown', (cm, e) => {
          if (e.key === 'Tab' && this.cmTabOut) e.codemirrorIgnore = true; // the browser moves the focus
          if (e.key !== 'Escape') this.cmTabOut = false;
        });
        this.cm.getInputField().setAttribute('aria-label', 'LaTeX source. Tab indents; Escape, then Tab, leaves.');
        this.cm.on('changes', (cm, chs) => { if (chs.some((c) => c.origin !== 'galley' && c.origin !== 'setValue')) this.srcRebuild(); });
        // leaving the pane (a click on the page) takes its typing in before the page edits anything
        this.cm.on('blur', () => { if (this.srcRebuild.pending()) this.srcRebuild.flush(); });
        this.cm.on('cursorActivity', debounce(() => { if (this.cm.hasFocus()) this.revealInPage(); }, 120));
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.className = 'cm-fallback';
        ta.spellcheck = false;
        host.appendChild(ta);
        ta.addEventListener('input', () => this.srcRebuild());
        ta.addEventListener('blur', () => { if (this.srcRebuild.pending()) this.srcRebuild.flush(); });
        this.cmFallback = ta;
      }
    })();
    return this.cmLoading;
  }

  showSrcFile(name) {
    this.srcFile = name;
    const text = this.src(name);
    // a file written with \r\n line ends: CodeMirror joins its lines with them too, so offsets
    // in the pane are offsets in the file and no edit turns its line ends into \n
    if (this.cm) { this.cm.setOption('lineSeparator', crlfOnly(text) ? '\r\n' : null); this.cm.setValue(text); this.cm.clearHistory(); this.cm.setOption('mode', /\.(bib|html?)$/i.test(name) ? 'text/plain' : 'stex'); }
    else if (this.cmFallback) this.cmFallback.value = text;
    this.updateFileTabs();
  }

  updateFileTabs() {
    const tabs = $('#ftabs');
    if (!tabs) return;
    const names = [...this.files.keys()].filter((n) => TEXT_EXT.test(n));
    const sig = names.join('|') + '#' + (this.srcFile || this.main);
    if (tabs.dataset.sig === sig) return;
    tabs.dataset.sig = sig;
    tabs.replaceChildren();
    for (const n of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ftab' + (n === (this.srcFile || this.main) ? ' on' : '');
      b.textContent = n;
      b.title = n === this.main ? 'Main file' : n;
      b.addEventListener('click', () => this.showSrcFile(n));
      tabs.appendChild(b);
    }
  }

  pushToSource() {
    const name = this.srcFile || this.main;
    const text = this.src(name);
    if (this.cm) {
      const cur = this.cm.getValue();
      const d = diff(cur, text);
      if (!d) return;
      const doc = this.cm.getDoc();
      doc.replaceRange(d.ins, doc.posFromIndex(d.s), doc.posFromIndex(d.s + d.del.length), 'galley');
    } else if (this.cmFallback && this.cmFallback.value !== text) this.cmFallback.value = text;
  }

  fromSource() {
    const name = this.srcFile || this.main;
    let text = this.cm ? this.cm.getValue() : this.cmFallback ? this.cmFallback.value : null;
    // a textarea (and a line pasted into the pane) gives \n: a \r\n file keeps its line ends
    if (text != null && crlfOnly(this.src(name))) text = text.replace(/\r?\n/g, '\r\n');
    if (text == null || text === this.src(name)) return;
    const before = new Map([[name, this.src(name)]]);
    this.files.set(name, text);
    this.record(before, 'src', null, null);
    const c = this.caretNow();
    this.rebuild(document.activeElement === this.root ? c : null);
    this.saveSoon();
  }

  // ---- outline and problems -------------------------------------------------------------
  toggleNav(force, tab) {
    const on = force ?? !document.body.classList.contains('nav-on');
    document.body.classList.toggle('nav-on', on);
    $('#b-nav').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (tab) this.navTab = tab;
    this.navTab = this.navTab || 'outline';
    document.body.classList.toggle('nav-wide', this.navTab === 'changes' || this.navTab === 'git');
    for (const [id, t] of [['#nt-outline', 'outline'], ['#nt-problems', 'problems'], ['#nt-changes', 'changes'], ['#nt-git', 'git']]) { $(id).classList.toggle('on', this.navTab === t); $(id).setAttribute('aria-selected', this.navTab === t ? 'true' : 'false'); }
    this.prefs.nav = on;
    store(PREFS, this.prefs);
    if (on) this.refreshNav();
    if (window.innerWidth > 860) setTimeout(() => { if (this.computePx()) this.relayout(true); }, 30);
  }

  computeProblems() {
    const m = this.model;
    if (!m) return [];
    const mathErrors = [];
    for (const el of this.root.querySelectorAll('.has-err')) {
      const info = atomOfEl(el) || atomOfEl(el.closest('[data-a],[data-m]'));
      if (info && info.f != null && info.s != null) mathErrors.push({ f: info.f, p: info.s, msg: el.title || 'cannot be typeset' });
    }
    const pre = this.src(this.main).split(/\\begin\s*\{document\}/)[0];
    const gp = /\\graphicspath\s*\{((?:\{[^}]*\})+)\}/.exec(pre);
    const found = findProblems({
      files: this.files, main: this.main, bibKeys: new Set(m.bibEntries ? m.bibEntries.keys() : []), unknown: m.warn,
      mathErrors, assets: [...this.assetBlobs.keys(), ...this.extra.keys()], graphicsPath: gp ? [...gp[1].matchAll(/\{([^}]*)\}/g)].map((x) => x[1]) : [],
      figuresWith: this.figuresWith()
    });
    // what pdfLaTeX itself reported on the last compile comes first: it is the real verdict
    const tex = this.texIssues.filter((x) => x.sev !== 'info' || x.msg.startsWith('Overfull'));
    return [...tex, ...found.filter((x) => x.sev !== 'info' || !tex.length)];
  }

  refreshNav() {
    const probs = this.computeProblems();
    this.problems = probs;
    const serious = probs.filter((x) => x.sev !== 'info').length;
    const wb = $('#st-warn');
    wb.hidden = !probs.length;
    wb.textContent = serious ? serious + (serious === 1 ? ' problem' : ' problems') : probs.length + (probs.length === 1 ? ' command shown as source' : ' commands shown as source');
    $('#nt-count').textContent = probs.length ? String(probs.length) : '';
    $('#nav-dot').hidden = !probs.some((x) => x.sev === 'error');
    if (this.base && (document.body.classList.contains('nav-on') || this.prefs.marks)) {
      const n = this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c)).length + this.allComments().length;
      $('#nt-ccount').textContent = n ? String(n) : '';
    }
    if (!document.body.classList.contains('nav-on')) return;
    const body = $('#nav-body');
    if (this.navTab === 'git') {
      if (body.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { this.navStale = true; return; }
      this.navStale = false;
      // the panel writes the project into the repository to show its status: not on every
      // keystroke, at most about once a second while typing
      const now = Date.now();
      clearTimeout(this.gitTimer);
      if (this.gitRendering || now - (this.gitLast || 0) < 1200) { this.gitTimer = setTimeout(() => this.refreshNav(), 1250); return; }
      this.gitLast = now;
      this.gitRendering = true;
      this.renderGit(body).finally(() => { this.gitRendering = false; });
      return;
    }
    if (this.navTab === 'changes') {
      // do not pull the panel out from under someone typing a version name
      if (body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { this.navStale = true; return; }
      this.navStale = false;
      const y = body.scrollTop;
      body.replaceChildren();
      // Review, as in Word: the comments, then the changes and versions
      this.renderComments(body);
      this.renderChanges(body);
      body.scrollTop = y;
      return;
    }
    body.replaceChildren();
    if (this.navTab === 'problems') {
      if (!probs.length) { const e = document.createElement('div'); e.className = 'nav-empty'; e.textContent = 'No problems found. References, citations, labels, environments and math all resolve.'; body.appendChild(e); return; }
      for (const x of probs) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'prob ' + x.sev + (x.tex ? ' tex' : '');
        const dot = document.createElement('span'); dot.className = 'sev';
        const msg = document.createElement('span'); msg.textContent = x.msg;
        const where = document.createElement('span'); where.className = 'where'; where.textContent = x.f + (x.line ? ':' + x.line : '');
        b.append(dot, msg, where);
        b.addEventListener('click', () => { this.goTo(x.f, x.p); if (window.innerWidth <= 860) this.toggleNav(false); });
        body.appendChild(b);
      }
      return;
    }
    const hs = (this.model.headings || []).filter((h) => h.level <= 3);
    if (!hs.length) { const e = document.createElement('div'); e.className = 'nav-empty'; e.textContent = 'No sections yet. Headings appear here as you add \\section{...}.'; body.appendChild(e); return; }
    const top = Math.min(...hs.map((h) => h.level));
    this.navHeads = hs.map((h) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'nav-item l' + Math.min(3, h.level - top);
      const n = document.createElement('span'); n.className = 'num'; n.textContent = h.star ? '' : (h.num || '');
      const t = document.createElement('span'); t.textContent = h.text || '';
      b.append(n, t);
      b.addEventListener('click', () => { this.goTo(h.f, h.s, true); if (window.innerWidth <= 860) this.toggleNav(false); });
      body.appendChild(b);
      return { h, b };
    });
    this.markCurrentHeading();
  }

  // ---- versions and changes ---------------------------------------------------------
  // The project's text is kept as a version every few minutes of editing, when the tab is
  // left, when a .zip is saved, and before anything replaces the text. The Changes tab
  // compares the text with one version (at first, how it was when opened) and lists each
  // change with Accept (keep it) and Reject (put the old text back); "Show on pages" marks
  // the same changes on the typeset pages, like Word's Track Changes.
  isMine(v) { return v.main === this.main && v.name === this.name; }

  async loadReview() {
    let r = null;
    try { r = this.noIdb ? null : await kvGet('review'); } catch (e) { r = null; }
    if (r && r.main === this.main && r.name === this.name && r.files) this.base = { t: r.t, label: r.label, id: r.id, files: new Map(r.files) };
    else this.setBase({ t: Date.now(), label: 'When opened', files: this.files });
    const mine = (await this.allSnaps()).filter((v) => this.isMine(v));
    if (mine.length) { this.lastSig = mine[0].sig; this.lastSnapT = mine[0].t; }
    await this.snapshot('Session start');
    this.refreshNav();
    if (this.prefs.marks) this.marksSoon();
  }

  // Images and other binary files are kept per project, so opening a version of another
  // project brings its figures back with its text.
  async stashBinary() {
    if (this.noIdb) return;
    try {
      await kvPut('bin:' + this.name + '|' + this.main, {
        assets: [...this.assetBlobs.entries()], extra: [...this.extra.entries()],
        orig: [...this.orig.entries()].map(([n, o]) => [n, { bytes: o.bytes, enc: o.enc, bom: o.bom }])
      });
    } catch (e) { /* text versions still work */ }
  }
  async loadBinary(name, main) {
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear(); this.extra.clear(); this.orig.clear();
    this.binaryDirty = true;
    if (this.noIdb) return;
    try {
      const bin = await kvGet('bin:' + name + '|' + main);
      if (!bin) return;
      for (const [n, b] of bin.assets || []) this.addAsset(n, b);
      for (const [n, b] of bin.extra || []) this.extra.set(n, b);
      for (const [n, o] of bin.orig || []) this.orig.set(n, { ...o, text: decodeText(o.bytes).text });
    } catch (e) { /* none kept */ }
  }

  setBase(b) {
    this.base = { t: b.t, label: b.label || '', id: b.id, files: new Map(b.files) };
    this.chg = null;
    if (!this.noIdb) kvPut('review', { t: b.t, label: this.base.label, id: b.id, main: this.main, name: this.name, files: [...this.base.files.entries()] }).catch(() => {});
  }

  noteEdit() {
    this.pdfStale = true;
    this.pdfSoon();
    this.snapDirty = true;
    this.chg = null;
    const since = Date.now() - (this.lastSnapT || 0);
    if (since > 15 * 60e3) { this.snapshot(''); return; }
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => { if (this.snapDirty) this.snapshot(''); }, Math.max(30e3, 5 * 60e3 - since));
  }

  async snapshot(label, o = {}) {
    const files = [...this.files.entries()];
    const sig = textSig(this.main, files);
    if (!o.force && sig === this.lastSig) { this.snapDirty = false; return null; }
    const v = { t: Date.now(), label: label || '', named: !!o.named, name: this.name, main: this.main, sig, files };
    this.lastSig = sig; this.lastSnapT = v.t; this.snapDirty = false;
    clearTimeout(this.snapTimer);
    try {
      if (this.noIdb) throw new Error('no storage');
      v.id = await snapAdd(v);
      snapPrune(80).then((n) => { if (n) this.snapList = null; }).catch(() => {});
    } catch (e) {
      v.id = 'm' + v.t;
      this.memSnaps.push(v);
      const old = this.memSnaps.findIndex((x) => !x.named);
      if (this.memSnaps.length > 30 && old >= 0) this.memSnaps.splice(old, 1);
    }
    this.snapList = null;
    if (document.body.classList.contains('nav-on') && this.navTab === 'changes') this.refreshNav();
    return v;
  }

  async allSnaps() {
    if (this.snapList) return this.snapList;
    let list = [];
    if (!this.noIdb) { try { list = await snapAll(); } catch (e) { list = []; } }
    this.snapList = [...list, ...this.memSnaps.map(({ files, ...m }) => m)].sort((a, b) => b.t - a.t);
    return this.snapList;
  }

  async versionFiles(v) {
    const m = this.memSnaps.find((x) => x.id === v.id);
    if (m) return m.files;
    try { return await snapFiles(v.id); } catch (e) { return null; }
  }

  currentChanges() {
    if (!this.base) return [];
    const C = this.chg;
    if (C && C.base === this.base && C.files.size === this.files.size && [...this.files].every(([n, t]) => C.files.get(n) === t)) return C.list;
    const list = [];
    for (const [n, t] of this.files) {
      const a = this.base.files.get(n) ?? '';
      if (a !== t) list.push(...changes(a, t, n));
    }
    this.chg = { base: this.base, files: new Map(this.files), list };
    return list;
  }

  acceptChanges(cs) {
    cs = cs.filter((c) => (this.base.files.get(c.f) ?? '').slice(c.as, c.ae) === c.a && this.src(c.f).slice(c.bs, c.be) === c.b);
    if (!cs.length) { this.refreshNav(); return; }
    const files = new Map(this.base.files);
    const byF = new Map();
    for (const c of cs) { if (!byF.has(c.f)) byF.set(c.f, []); byF.get(c.f).push(c); }
    for (const [f, list] of byF) {
      let t = files.get(f) ?? '';
      for (const c of list.sort((x, y) => y.as - x.as)) t = t.slice(0, c.as) + c.b + t.slice(c.ae);
      files.set(f, t);
    }
    this.setBase({ ...this.base, files });
    this.refreshNav();
    if (this.prefs.marks) this.marksSoon();
  }

  rejectChanges(cs, label) {
    // the list may be a moment behind the text: act only on changes still exactly there
    cs = cs.filter((c) => this.src(c.f).slice(c.bs, c.be) === c.b);
    if (!cs.length) { this.refreshNav(); return; }
    if (cs.length > 1) this.snapshot(label || 'Before rejecting changes', { force: true });
    this.closeGroup();
    this.commit(cs.map((c) => ({ f: c.f, s: c.bs, e: c.be, t: c.a })), null, 'reject');
    this.closeGroup();
    this.refreshNav();
    if (cs.length === 1) this.goTo(cs[0].f, cs[0].bs);
  }

  setMarks(on) {
    this.prefs.marks = !!on;
    store(PREFS, this.prefs);
    this.paintChanges();
    const cb = $('#chg-show');
    if (cb) cb.checked = !!on;
  }

  async compareWith(v) {
    const files = await this.versionFiles(v);
    if (!files) { this.toast('That version could not be read.'); return; }
    this.setBase({ t: v.t, label: v.label || 'Automatic version', id: v.id, files });
    this.refreshNav();
    if (this.prefs.marks) this.marksSoon();
  }

  async restoreVersion(v) {
    const files = await this.versionFiles(v);
    if (!files) { this.toast('That version could not be read.'); return; }
    if (!this.isMine(v)) { await this.openVersion(v, files); return; }
    const edits = [];
    for (const [n, t] of files) { const cur = this.files.get(n); if (cur !== t) edits.push({ f: n, s: 0, e: cur == null ? 0 : cur.length, t }); }
    if (!edits.length) { this.toast('That version is the same as the text now.'); return; }
    await this.snapshot('Before restoring a version');
    this.closeGroup();
    this.commit(edits, null, 'restore');
    this.closeGroup();
    this.toast('Restored the version from ' + when(v.t) + '.', 6000, { label: 'Undo', fn: () => this.undo() });
  }

  async openVersion(v, files) {
    await this.snapshot('Before opening ' + v.name, { force: !this.lastSig });
    await this.stashBinary();
    await this.loadBinary(v.name, v.main);
    this.files = new Map(files);
    this.main = v.main;
    this.name = v.name;
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.binaryDirty = true; this.zipDirty = true; this.forceRender = true;
    this.srcFile = this.main;
    this.desk.scrollTop = 0;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.updateFileTabs();
    this.persist();
    this.lastSig = v.sig;
    this.setBase({ t: v.t, label: v.label || 'Automatic version', id: v.id, files });
    this.resetPdf();
    this.toast('Opened the version of ' + v.name + ' from ' + when(v.t) + '.', 6000);
  }

  // ---- git ---------------------------------------------------------------------------------
  // A real repository per project, kept in this browser (src/git.js). The editor's files are
  // the working tree: the panel writes them into it, so a commit takes exactly what is open.
  loadGit() {
    if (!this.gitP) {
      this.gitP = import(new URL('git.js', location.href).href);
      this.gitP.catch(() => { this.gitP = null; });
    }
    return this.gitP;
  }

  // the project as bytes, as a .zip would hold it
  async gitFiles() {
    const files = new Map();
    for (const [n, t] of this.files) { const o = this.orig.get(n); files.set(n, o && o.text === t ? o.bytes : encodeText(t, o ? o.enc : 'utf-8', o ? o.bom : false)); }
    for (const [n, b] of this.assetBlobs) files.set(n, new Uint8Array(await b.arrayBuffer()));
    for (const [n, b] of this.extra) if (!files.has(n)) files.set(n, new Uint8Array(await b.arrayBuffer()));
    // git writes each at the repository's folder + its name: never outside it, never into .git
    for (const n of [...files.keys()]) if (cleanPath(n) !== n) files.delete(n);
    return files;
  }

  // whether a repository exists for this project, without loading git when none was ever made
  async hasGitRepo() {
    try {
      if (indexedDB.databases) { const dbs = await indexedDB.databases(); if (!dbs.some((d) => d.name === 'galley-git')) return false; }
      const G = await this.loadGit();
      return await G.isRepo(G.dirFor(this.name));
    } catch (e) { return false; }
  }

  gitAuthor() {
    return { name: this.prefs.gitName || '', email: this.prefs.gitEmail || '' };
  }

  // Where a repository's remote came from, kept per repository folder: 'own' (the user typed
  // it, cloned from it, or gave it a token), 'theirs' (it came in the .git folder of an opened
  // .zip or folder: someone else's choice, so no token is filled in), or 'unknown' (a clone or
  // an opened .git from before this was recorded, which cannot be told apart: the token the user
  // already uses is offered, with a word to check the host).
  async gitRemoteFrom(dir, remote) {
    if (!remote) return 'own';
    this.gitRemotes = this.gitRemotes || new Map();
    let rec = this.gitRemotes.get(dir);
    if (rec === undefined) {
      try { rec = this.noIdb ? null : await kvGet('gitremote:' + dir); } catch (e) { rec = null; }
      if (!this.gitRemotes.has(dir)) this.gitRemotes.set(dir, typeof rec === 'string' ? rec : null);
      rec = this.gitRemotes.get(dir);
    }
    if (typeof rec === 'string') return rec === remote ? 'own' : 'theirs';
    const li = await this.linkInfo();
    return li && li.origin === 'git' ? 'unknown' : 'own';
  }
  gitOwnRemote(dir, url) {
    this.gitRemotes = this.gitRemotes || new Map();
    this.gitRemotes.set(dir, url);
    if (!this.noIdb) kvPut('gitremote:' + dir, url).catch(() => {});
  }

  // after something done in the Git panel: show its result now
  gitRefresh() { this.gitLast = 0; this.gitRendering = false; this.refreshNav(); }

  async renderGit(body) {
    const gen = (this.gitGen = (this.gitGen || 0) + 1);
    const y = body.scrollTop;
    let G;
    try { G = await this.loadGit(); } catch (e) {
      body.replaceChildren(mk('div', 'nav-empty', 'Git could not load here: ' + e.message));
      return;
    }
    const dir = G.dirFor(this.name);
    const out = mk('div', 'git');
    const busy = (b, label) => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = label; };
    const done = (b) => { b.disabled = false; if (b.dataset.label) b.textContent = b.dataset.label; };
    const fail = (b, e) => { done(b); this.toast(this.gitError(e), 9000); };
    if (!(await G.isRepo(dir))) {
      if (gen !== this.gitGen) return;
      out.append(mk('div', 'git-intro', 'This project is not a git repository yet. Starting one keeps every commit of it in this browser; Save .zip then gives a clone you can push from your computer.'));
      const row = mk('div', 'git-row');
      row.append(mkBtn('Start a repository', async (e) => {
        const b = e.currentTarget; busy(b, 'Starting…');
        try {
          await G.init(dir);
          await G.writeTree(dir, await this.gitFiles());
          if (!this.gitAuthor().name) { done(b); this.gitRefresh(); return; }
          await G.commitAll(dir, 'Start ' + this.name, this.gitAuthor());
          this.toast('Started a git repository for ' + this.name + '.');
        } catch (err) { fail(b, err); return; }
        this.gitRefresh();
      }, 'git init, then a first commit of the project'));
      out.append(row);
      out.append(this.gitCloneForm(G));
      out.append(mk('div', 'git-note', 'To bring in a repository with its history, open a .zip of its folder (with the .git folder inside) or the folder itself.'));
      body.replaceChildren(out);
      return;
    }
    let st = [], br = { current: null, list: [] }, commits = [], remote = null;
    try {
      await G.writeTree(dir, await this.gitFiles());
      [st, br, commits, remote] = await Promise.all([G.status(dir), G.branches(dir), G.log(dir), G.remoteUrl(dir)]);
    } catch (e) {
      if (gen !== this.gitGen) return;
      body.replaceChildren(mk('div', 'nav-empty', 'The repository could not be read: ' + this.gitError(e)));
      return;
    }
    if (gen !== this.gitGen) return;
    $('#nt-gcount').textContent = st.length ? String(st.length) : '';

    // branch
    const head = mk('div', 'git-head');
    const sel = mk('select', 'git-branch');
    sel.setAttribute('aria-label', 'Branch');
    for (const b of br.list) { const o = mk('option', '', b); o.value = b; if (b === br.current) o.selected = true; sel.append(o); }
    if (!br.current) { const o = mk('option', '', '(detached)'); o.value = ''; o.selected = true; sel.prepend(o); }
    const newOpt = mk('option', '', 'New branch…'); newOpt.value = '\u0000new'; sel.append(newOpt);
    const nb = mk('form', 'ver-form git-newbranch');
    nb.hidden = true;
    const nbIn = mk('input'); nbIn.type = 'text'; nbIn.placeholder = 'New branch name'; nbIn.setAttribute('aria-label', 'New branch name');
    nb.append(nbIn, mkBtn('Create', null, 'git switch -c, from the current commit', 'submit'), mkBtn('Cancel', () => { nb.hidden = true; sel.value = br.current || ''; }));
    nb.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nbIn.value.trim().replace(/\s+/g, '-');
      if (!name) { nbIn.focus(); return; }
      try { await G.createBranch(dir, name); this.toast('On the new branch ' + name + '.'); } catch (err) { this.toast(this.gitError(err), 8000); }
      nbIn.blur();
      this.gitRefresh();
    });
    const switchTo = async (v) => {
      try {
        await this.snapshot('Before switching to ' + v, { force: true });
        const files = await G.switchBranch(dir, v);
        await this.loadGitFiles(files, 'Switched to ' + v);
        this.toast('Switched to ' + v + '.');
      } catch (e) { this.toast(this.gitError(e), 8000); }
      this.gitRefresh();
    };
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (v === '\u0000new') { nb.hidden = false; nbIn.focus(); return; }
      sel.value = br.current || '';
      if (st.length) this.toast(st.length + ' uncommitted change' + (st.length === 1 ? '' : 's') + ' would be replaced by the files of ' + v + ' (a version of the text now stays under Changes).', 9000, { label: 'Switch', fn: () => switchTo(v) });
      else switchTo(v);
    });
    head.append(mk('span', 'git-lbl', 'Branch'), sel, mk('span', 'grow'), mk('span', 'git-st', st.length ? st.length + (st.length === 1 ? ' change' : ' changes') : 'Clean'));
    out.append(head, nb);

    // what changed
    if (st.length) {
      const list = mk('div', 'git-files');
      for (const x of st.slice(0, 40)) {
        const r = mk('div', 'git-file ' + x.change);
        r.append(mk('span', 'git-ch', x.change === 'added' ? 'A' : x.change === 'deleted' ? 'D' : 'M'), mk('span', 'git-path', x.path));
        list.append(r);
      }
      if (st.length > 40) list.append(mk('div', 'git-note', (st.length - 40) + ' more'));
      out.append(list);
    }

    // commit
    const form = mk('form', 'ver-form git-commit');
    const msg = mk('input');
    msg.type = 'text'; msg.placeholder = st.length ? 'Commit message' : 'Nothing to commit'; msg.maxLength = 300; msg.setAttribute('aria-label', 'Commit message');
    msg.disabled = !st.length;
    const cbtn = mkBtn('Commit', null, 'git add -A and git commit', 'submit');
    cbtn.disabled = !st.length;
    form.append(msg, cbtn);
    const who = mk('div', 'git-who');
    const a = this.gitAuthor();
    const nm = mk('input'); nm.type = 'text'; nm.placeholder = 'Your name'; nm.value = a.name; nm.setAttribute('aria-label', 'Author name');
    const em = mk('input'); em.type = 'email'; em.placeholder = 'Email'; em.value = a.email; em.setAttribute('aria-label', 'Author email');
    who.append(nm, em);
    if (a.name && a.email) who.hidden = true;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const m = msg.value.trim();
      if (!m) { msg.focus(); return; }
      if (nm.value.trim()) this.prefs.gitName = nm.value.trim();
      if (em.value.trim()) this.prefs.gitEmail = em.value.trim();
      store(PREFS, this.prefs);
      if (!this.prefs.gitName || !this.prefs.gitEmail) { who.hidden = false; (this.prefs.gitName ? em : nm).focus(); this.toast('A commit needs your name and email.'); return; }
      busy(cbtn, 'Committing…');
      try {
        await G.writeTree(dir, await this.gitFiles());
        const sha = await G.commitAll(dir, m, this.gitAuthor());
        msg.value = '';
        msg.blur();
        this.toast('Committed ' + sha.slice(0, 7) + ': ' + m);
      } catch (err) { fail(cbtn, err); return; }
      this.gitRefresh();
    });
    out.append(form, who);

    // remote
    const rem = mk('details', 'git-remote');
    rem.open = !!remote && !!this.gitRemoteOpen;
    rem.addEventListener('toggle', () => { this.gitRemoteOpen = rem.open; });
    const sum = mk('summary', '', remote ? 'Remote: ' + remote.replace(/^https?:\/\//, '') : 'Remote (push and pull)');
    rem.append(sum);
    const url = mk('input'); url.type = 'url'; url.placeholder = 'https://github.com/you/paper.git'; url.value = remote || ''; url.setAttribute('aria-label', 'Remote URL');
    const tok = mk('input'); tok.type = 'password'; tok.placeholder = 'Access token (kept in this browser for this host)'; tok.setAttribute('aria-label', 'Access token');
    const prox = mk('input'); prox.type = 'url'; prox.placeholder = 'CORS proxy, e.g. https://cors.isomorphic-git.org'; prox.value = this.prefs.gitProxy ?? 'https://cors.isomorphic-git.org'; prox.setAttribute('aria-label', 'CORS proxy');
    // the token kept for the remote's host, not filled in for a remote that came with an opened
    // project; a URL typed here is the user's own, and the field follows it until a token is typed
    const from = await this.gitRemoteFrom(dir, remote);
    if (gen !== this.gitGen) return;
    const fill = () => savedToken(this.prefs, url.value.trim(), url.value.trim() !== (remote || '') || from !== 'theirs');
    let shown = tok.value = fill(), typed = false;
    tok.addEventListener('input', () => { typed = true; });
    url.addEventListener('input', () => { if (!typed) shown = tok.value = fill(); });
    const opts = () => {
      const t = tok.value.trim();
      dropReplaced(this.prefs, t, shown);
      this.prefs.gitProxy = prox.value.trim(); store(PREFS, this.prefs);
      const o = { token: t, remote: url.value.trim(), corsProxy: this.prefs.gitProxy, accepted: false };
      o.onAccepted = () => { o.accepted = true; };
      return o;
    };
    // after a pull or push worked: the token is kept for the host, and a token the user typed,
    // or one the remote asked for and took, makes the remote theirs
    const kept = (o) => {
      keepToken(this.prefs, o.remote, o.token, shown, o.accepted);
      store(PREFS, this.prefs);
      if (o.token && (typed || o.accepted) && o.remote === (remote || '') && from !== 'own') this.gitOwnRemote(dir, o.remote);
      shown = o.token;
    };
    const saveUrl = async () => { const u = url.value.trim(); if (u && u !== remote) { await G.setRemote(dir, u); this.gitOwnRemote(dir, u); } return u; };
    const rrow = mk('div', 'git-row');
    rrow.append(
      mkBtn('Pull', async (e) => {
        const b = e.currentTarget;
        if (!(await saveUrl())) { url.focus(); return; }
        if (st.length) { this.toast('Commit your ' + st.length + ' change' + (st.length === 1 ? '' : 's') + ' first: pull merges into the last commit.', 7000); msg.focus(); return; }
        busy(b, 'Pulling…');
        try {
          const o = opts();
          await G.pull(dir, o, this.gitAuthor().name ? this.gitAuthor() : { name: 'Rikuy', email: 'rikuy@localhost' });
          kept(o);
          await this.loadGitFiles(await G.workingFiles(dir), 'Pulled');
        } catch (err) { fail(b, err); return; }
        done(b); this.gitRefresh();
      }, 'git pull (fetch and merge)'),
      mkBtn('Push', async (e) => {
        const b = e.currentTarget;
        if (!(await saveUrl())) { url.focus(); return; }
        busy(b, 'Pushing…');
        try {
          const o = opts();
          const r = await G.push(dir, o);
          if (r && r.ok === false) throw new Error(r.error || 'the remote refused the push');
          kept(o);
          this.toast('Pushed ' + (br.current || 'HEAD') + ' to ' + url.value.trim().replace(/^https?:\/\//, '') + '.');
        } catch (err) { fail(b, err); return; }
        done(b);
      }, 'git push'));
    const host = (remote || '').replace(/^https?:\/\//, '').split('/')[0];
    if (from === 'theirs') rem.append(mk('div', 'git-note git-foreign', 'This remote came in the .git folder of the project you opened, so no token is filled in for it. Give one only if ' + host + ' is yours.'));
    else if (from === 'unknown' && tok.value) rem.append(mk('div', 'git-note git-unknown', 'This repository is older than Rikuy\'s record of where remotes come from, so your token is filled in as before. Check that ' + host + ' is yours before you pull or push.'));
    rem.append(url, tok, prox, rrow, mk('div', 'git-note', 'GitHub and GitLab need a token with write access and, from a browser, a CORS proxy. Inside claude.ai the page can only reach its own server, so pushing works from Rikuy on its own site; here, Save .zip gives a clone to push from your computer.'));
    out.append(rem);

    // history
    out.append(mk('div', 'ver-h', 'History' + (commits.length ? ' · ' + commits.length + (commits.length >= 300 ? '+' : '') : '')));
    const hist = mk('div', 'ver-list');
    if (!commits.length) hist.append(mk('div', 'nav-empty', 'No commits yet.'));
    for (const c of commits.slice(0, 200)) {
      const it = mk('div', 'ver git-c');
      const l = mk('div', 'ver-l');
      const subj = c.commit.message.split('\n')[0];
      l.append(mk('span', 'ver-n named', subj), mk('span', 'ver-p', c.commit.author.name + ' · ' + when(c.commit.author.timestamp * 1000) + ' · ' + c.oid.slice(0, 7)));
      const act = mk('div', 'ver-a');
      act.append(
        mkBtn('Compare', async () => {
          try {
            const files = await this.gitTextFiles(await G.filesAt(dir, c.oid));
            this.setBase({ t: c.commit.author.timestamp * 1000, label: 'Commit ' + c.oid.slice(0, 7) + ' · ' + subj, files });
            this.toggleNav(true, 'changes');
            if (this.prefs.marks) this.marksSoon();
          } catch (e) { this.toast(this.gitError(e), 8000); }
        }, 'Show what changed since this commit, with Accept and Reject'),
        mkBtn('Restore', async () => {
          try {
            const files = await this.gitTextFiles(await G.filesAt(dir, c.oid));
            const edits = [];
            for (const [n, t] of files) { const cur = this.files.get(n); if (cur !== t) edits.push({ f: n, s: 0, e: cur == null ? 0 : cur.length, t }); }
            if (!edits.length) { this.toast('The text is the same as in that commit.'); return; }
            await this.snapshot('Before restoring commit ' + c.oid.slice(0, 7));
            this.closeGroup(); this.commit(edits, null, 'restore'); this.closeGroup();
            this.toast('Restored the text of ' + c.oid.slice(0, 7) + '. Commit it to make it the newest.', 6000, { label: 'Undo', fn: () => this.undo() });
          } catch (e) { this.toast(this.gitError(e), 8000); }
        }, 'Put the text of this commit back (an edit, so Ctrl+Z undoes it)'));
      it.append(l, act);
      hist.append(it);
    }
    out.append(hist);
    out.append(mk('div', 'git-note', 'Save .zip includes the .git folder, so the download is a clone: unzip it and git log, git push work as usual. isomorphic-git ' + G.version + '.'));
    body.replaceChildren(out);
    body.scrollTop = y;
  }

  gitCloneForm(G) {
    const det = mk('details', 'git-remote');
    det.append(mk('summary', '', 'Clone from a URL'));
    const url = mk('input'); url.type = 'url'; url.placeholder = 'https://github.com/you/paper.git, or an Overleaf project'; url.setAttribute('aria-label', 'Repository URL, or the address of an Overleaf project');
    const tok = mk('input'); tok.type = 'password'; tok.placeholder = 'Access token (private repositories; for Overleaf, its Git token)'; tok.setAttribute('aria-label', 'Access token');
    const prox = mk('input'); prox.type = 'url'; prox.placeholder = 'CORS proxy'; prox.value = this.prefs.gitProxy ?? 'https://cors.isomorphic-git.org';
    // the token kept for the host of the address typed, until a token is typed
    let shown = '', typed = false;
    tok.addEventListener('input', () => { typed = true; });
    url.addEventListener('input', () => { if (!typed) shown = tok.value = savedToken(this.prefs, G.gitUrlOf(url.value), true); });
    const b = mkBtn('Clone', async () => {
      // an Overleaf project's address becomes its git address (Overleaf, Account settings, Git integration)
      const u = G.gitUrlOf(url.value);
      if (!u) { url.focus(); return; }
      const t = tok.value.trim();
      dropReplaced(this.prefs, t, shown);
      this.prefs.gitProxy = prox.value.trim(); store(PREFS, this.prefs);
      const o = { token: t, remote: u, corsProxy: this.prefs.gitProxy, depth: 200, accepted: false };
      o.onAccepted = () => { o.accepted = true; };
      const name = /git\.overleaf\.com/.test(u) ? 'overleaf-' + u.split('/').pop().slice(0, 6) : u.replace(/\.git$/, '').split('/').pop() || 'paper';
      b.disabled = true; b.textContent = 'Cloning…';
      try {
        const files = await G.clone(G.dirFor(name), u, o);
        keepToken(this.prefs, u, t, shown, o.accepted); store(PREFS, this.prefs);
        shown = t;
        // the address typed here is the user's own remote
        this.gitOwnRemote(G.dirFor(name), u);
        await this.openRepoFiles(name, files);
      } catch (e) { this.toast(this.gitError(e), 9000); }
      b.disabled = false; b.textContent = 'Clone';
    });
    det.append(url, tok, prox, b);
    return det;
  }

  gitError(e) {
    const m = String((e && (e.message || e.code)) || e);
    if (/Failed to fetch|NetworkError|Load failed|Content Security Policy|CORS/i.test(m)) return 'Could not reach the remote. From inside claude.ai the page may only talk to its own server; run Rikuy on its own site, or Save .zip and push from your computer. (' + m + ')';
    if (/401|403|auth/i.test(m)) return 'The remote refused the credentials. Check the token and that it can write to this repository. (' + m + ')';
    if (/MergeConflict|conflict/i.test(m)) return 'Pull found conflicting edits to the same lines. Commit, then merge on your computer, or restore one side. (' + m + ')';
    return m;
  }

  // text files of a commit as the editor holds them (decoded as on opening)
  async gitTextFiles(bytesMap) {
    const out = new Map();
    for (const [n, b] of bytesMap) if (TEXT_EXT.test(n)) out.set(n, decodeText(b).text);
    return out;
  }

  // put a checked-out tree into the editor (branch switch, pull): text, images, other files
  async loadGitFiles(files, label, origin) {
    const texts = new Map(), blobs = new Map(), extra = new Map(), orig = new Map();
    for (const [n, b] of files) {
      if (TEXT_EXT.test(n)) { const d = decodeText(b); texts.set(n, d.text); orig.set(n, { bytes: b, enc: d.enc, bom: d.bom, text: d.text }); }
      else if (IMG_EXT.test(n) || /\.(pdf|eps)$/i.test(n)) blobs.set(n, new Blob([b]));
      else extra.set(n, new Blob([b]));
    }
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear();
    this.files = texts; this.orig = orig; this.extra = extra;
    for (const [n, b] of blobs) this.addAsset(n, b);
    if (!this.files.has(this.main)) {
      const docs = [...texts.entries()].filter(([n, t]) => /\.tex$/i.test(n) && /\\documentclass/.test(t));
      this.main = (docs.find(([n]) => /(^|\/)main\.tex$/i.test(n)) || docs[0] || [this.main])[0];
    }
    // a cloned repository is someone else's content: its shell escape is restricted until the
    // owner allows more, marked before anything below can start a compile
    if (origin) this.markFromLink('', this.name, this.main, origin);
    this.binaryDirty = true; this.forceRender = true;
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.srcFile = this.main;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.updateFileTabs();
    this.persist();
    this.setBase({ t: Date.now(), label, files: this.files });
    this.lastSig = null;
    this.snapshot(label);
    this.resetPdf();
  }

  async openRepoFiles(name, files) {
    if (this.base) { await this.snapshot('Before opening another project', { force: !this.lastSig }); await this.stashBinary(); }
    this.name = name;
    this.main = '';
    await this.loadGitFiles(files, 'Cloned', 'git');
    this.toast('Cloned ' + name + '.');
  }

  renderChanges(body) {
    const all = this.currentChanges();
    // comment lines are listed above, as comments; Accept all takes them along
    const real = all.filter((c) => !spacingOnly(c) && !commentOnly(c)), space = all.filter(spacingOnly);
    const top = mk('div', 'chg-top');
    const cmp = mk('div', 'chg-base');
    cmp.append('Changes since ', mk('b', '', this.base ? when(this.base.t) : ''), this.base && this.base.label ? ' · ' + this.base.label : '');
    const lab = mk('label', 'chg-show');
    const cb = mk('input');
    cb.type = 'checkbox'; cb.id = 'chg-show'; cb.checked = !!this.prefs.marks;
    cb.addEventListener('change', () => this.setMarks(cb.checked));
    lab.append(cb, 'Show changes on the pages');
    top.append(cmp, lab);
    if (all.length) {
      const row = mk('div', 'chg-bulk');
      row.append(mk('span', 'chg-n', real.length + (real.length === 1 ? ' change' : ' changes')), mk('span', 'grow'),
        mkBtn('Accept all', () => this.acceptChanges(this.currentChanges()), 'Keep every change and compare from here on'),
        mkBtn('Reject all', () => this.rejectChanges(this.currentChanges(), 'Before rejecting all changes'), 'Put back the text of the compared version (Ctrl+Z undoes)'));
      top.append(row);
    }
    body.append(top);
    if (!all.length) body.append(mk('div', 'nav-empty', 'No changes since then. Each edit you make shows up here with Accept and Reject.'));
    const MAX = 250;
    for (const c of real.slice(0, MAX)) body.append(this.changeItem(c));
    if (real.length > MAX) body.append(mk('div', 'nav-empty', (real.length - MAX) + ' more. Accept or reject some to see the rest.'));
    if (space.length) {
      const it = mk('div', 'chg spacing');
      const row = mk('div', 'chg-row');
      row.append(mk('span', 'where', space.length + (space.length === 1 ? ' line break or spacing change' : ' line break or spacing changes') + ' (same on the page)'), mk('span', 'grow'),
        mkBtn('Accept', () => this.acceptChanges(space)), mkBtn('Reject', () => this.rejectChanges(space)));
      it.append(row);
      body.append(it);
    }
    const vh = mk('div', 'ver-h', 'Versions');
    const form = mk('form', 'ver-form');
    const inp = mk('input');
    inp.type = 'text'; inp.placeholder = 'Name this version'; inp.maxLength = 80; inp.setAttribute('aria-label', 'Name this version');
    form.append(inp, mkBtn('Save', null, 'Keep the text as it is now under this name', 'submit'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      inp.value = '';
      inp.blur();
      this.snapshot(name, { force: true, named: true }).then(() => this.toast('Saved the version “' + name + '”.'));
    });
    const list = mk('div', 'ver-list');
    body.append(vh, form, list);
    this.allSnaps().then((vs) => this.fillVersions(list, vs));
  }

  changeItem(c) {
    const it = mk('div', 'chg');
    const txt = mk('button', 'chg-txt');
    txt.type = 'button';
    txt.title = 'Show it on the page';
    const src = this.src(c.f);
    let pre = src.slice(Math.max(0, c.bs - 36), c.bs), post = src.slice(c.be, c.be + 36);
    if (c.bs > 36) pre = '…' + pre.replace(/^\S*\s/, '');
    if (c.be + 36 < src.length) post = post.replace(/\s\S*$/, '') + '…';
    const flat = (t) => t.replace(/\s+/g, ' ');
    const clip = (t) => (t.length > 160 ? t.slice(0, 70) + ' … ' + t.slice(-70) : t);
    txt.append(mk('span', 'ctx', flat(pre)));
    for (const [op, v] of c.parts) txt.append(op === ' ' ? document.createTextNode(flat(clip(v))) : mk(op === '-' ? 'del' : 'ins', '', flat(clip(v)) || '¶'));
    txt.append(mk('span', 'ctx', flat(post)));
    txt.addEventListener('click', () => { this.goTo(c.f, c.bs); if (window.innerWidth <= 860) this.toggleNav(false); });
    const row = mk('div', 'chg-row');
    const kind = !c.a ? 'Added' : !c.b ? 'Deleted' : 'Changed';
    row.append(mk('span', 'where', kind + ' · ' + c.f + ':' + c.line), mk('span', 'grow'),
      mkBtn('Accept', () => this.acceptChanges([c]), 'Keep this change'),
      mkBtn('Reject', () => this.rejectChanges([c]), 'Put the old text back'));
    it.append(txt, row);
    return it;
  }

  fillVersions(list, vs) {
    list.replaceChildren();
    if (!vs.length) { list.append(mk('div', 'nav-empty', 'Versions are kept as you work: every few minutes, when you leave, and when you save the .zip.')); return; }
    for (const v of vs.slice(0, 120)) {
      const mine = this.isMine(v);
      const row = mk('div', 'ver' + (this.base && this.base.id != null && this.base.id === v.id ? ' on' : ''));
      const l = mk('div', 'ver-l');
      const w = when(v.t);
      l.append(mk('span', 'ver-t', w[0].toUpperCase() + w.slice(1)), mk('span', 'ver-n' + (v.named ? ' named' : ''), v.label || 'Automatic'));
      if (!mine) l.append(mk('span', 'ver-p', v.name));
      const acts = mk('div', 'ver-a');
      if (mine) acts.append(mkBtn('Compare', () => this.compareWith(v), 'List and mark the changes made since this version'), mkBtn('Restore', () => this.restoreVersion(v), 'Bring back the text of this version (Ctrl+Z undoes)'));
      else acts.append(mkBtn('Open', () => this.restoreVersion(v), 'Open this version of ' + v.name + ' (the current project is kept as a version)'));
      if (v.named) acts.append(mkBtn('×', () => { snapDel(v.id).catch(() => {}); this.memSnaps = this.memSnaps.filter((x) => x.id !== v.id); this.snapList = null; this.lastSig = null; this.refreshNav(); }, 'Delete this named version'));
      row.append(l, acts);
      list.append(row);
    }
  }

  // Track-changes marks on the pages: inserted text underlined, deletions as a small red
  // wedge (hover shows what was deleted), changed equations outlined, and a bar in the
  // margin beside each changed line.
  paintChanges() {
    for (const x of this.root.querySelectorAll('.mk-layer')) x.remove();
    for (const x of this.root.querySelectorAll('.chg-atom')) x.classList.remove('chg-atom');
    const HL = window.CSS && CSS.highlights;
    if (HL) HL.delete('g-ins');
    if (!this.prefs.marks || !this.base || !this.model) return;
    const list = this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c));
    if (!list.length) return;
    const ins = new Map(), dels = [];
    for (const c of list) {
      for (const [op, v, p] of c.parts) {
        if (op === '+' && v.trim()) { if (!ins.has(c.f)) ins.set(c.f, []); ins.get(c.f).push([p, p + v.length]); }
        else if (op === '-' && v.trim()) dels.push({ f: c.f, p, text: v });
      }
    }
    for (const rs of ins.values()) rs.sort((a, b) => a[0] - b[0]);
    const ranges = [];
    for (const [f, rs] of ins) ranges.push(...this.index.domRanges(f, rs));
    const atomHit = [];
    for (const el of this.root.querySelectorAll('[data-a]')) {
      const A = atomOfEl(el);
      if (!A || A.s == null || A.e == null) continue;
      const rs = ins.get(A.f) || [];
      const hit = rs.some(([s, e]) => s < A.e && e > A.s) || dels.some((d) => d.f === A.f && d.p > A.s && d.p < A.e);
      if (hit && !el.parentElement.closest('.chg-atom')) { el.classList.add('chg-atom'); atomHit.push(A); }
    }
    if (HL && window.Highlight) HL.set('g-ins', new window.Highlight(...ranges));
    const layers = new Map();
    const layer = (page) => {
      let L = layers.get(page);
      if (!L) { L = mk('div', 'mk-layer'); L.contentEditable = 'false'; L.setAttribute('aria-hidden', 'true'); page.append(L); L.bars = []; layers.set(page, L); }
      return L;
    };
    const pageOf = (n) => (n.nodeType === 1 ? n : n.parentElement).closest('.page');
    const bar = (page, q) => { const P = page.getBoundingClientRect(); layer(page).bars.push([q.top - P.top, q.bottom - P.top]); };
    for (const r of ranges) { const page = pageOf(r.startContainer); if (page) for (const q of r.getClientRects()) if (q.height) bar(page, q); }
    for (const el of this.root.querySelectorAll('.chg-atom')) { const page = pageOf(el); if (page) for (const q of el.getClientRects()) if (q.height) bar(page, q); }
    for (const d of dels) {
      if (atomHit.some((A) => A.f === d.f && d.p > A.s && d.p < A.e)) continue;
      const r = this.index.find(d.f, d.p, -1);
      if (!r || !r.node) continue;
      const R = document.createRange();
      try { R.setStart(r.node, Math.min(r.offset, r.node.length ?? 0)); } catch (e) { continue; }
      R.collapse(true);
      const q = R.getClientRects()[0] || R.getBoundingClientRect();
      const page = pageOf(r.node);
      if (!q || !q.height || !page) continue;
      const P = page.getBoundingClientRect();
      const m = mk('span', 'del-mk');
      m.style.left = (q.left - P.left) + 'px'; m.style.top = (q.top - P.top) + 'px'; m.style.height = q.height + 'px';
      m.title = 'Deleted: ' + (d.text.length > 300 ? d.text.slice(0, 300) + '…' : d.text);
      layer(page).append(m);
      bar(page, q);
    }
    for (const [page, L] of layers) {
      const flow = page.querySelector('.flow');
      const x = flow ? flow.getBoundingClientRect().left - page.getBoundingClientRect().left - 14 : 24;
      const bs = L.bars.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const b of bs) { const last = merged[merged.length - 1]; if (last && b[0] <= last[1] + 2) last[1] = Math.max(last[1], b[1]); else merged.push([b[0], b[1]]); }
      for (const [t, b] of merged) { const e = mk('span', 'chg-bar'); e.style.left = x + 'px'; e.style.top = t + 'px'; e.style.height = (b - t) + 'px'; L.append(e); }
    }
  }

  headingEl(f, s) {
    for (const B of this.renderer.blocks) if (B.f === f && B.s <= s && B.e > s) return B.items[0] && B.items[0].el;
    return null;
  }

  markCurrentHeading() {
    if (!this.navHeads || !document.body.classList.contains('nav-on') || this.navTab !== 'outline') return;
    const D = this.desk.getBoundingClientRect();
    let cur = null;
    for (const x of this.navHeads) {
      const el = this.headingEl(x.h.f, x.h.s);
      if (el && el.isConnected && el.getBoundingClientRect().top < D.top + 120) cur = x;
    }
    for (const x of this.navHeads) x.b.classList.toggle('cur', x === cur);
  }

  // Show a source position on the page (and in the source pane if it is open).
  goTo(f, p, heading) {
    let el = heading ? this.headingEl(f, p) : null;
    if (!el) {
      const r = this.index.find(f, p, 1);
      if (r && r.node) el = r.node.nodeType === 1 ? r.node : r.node.parentElement;
    }
    if (!el || !el.isConnected) el = this.headingEl(f, p);
    if (el && el.isConnected) {
      const it = el.closest('.it') || el;
      const R = it.getBoundingClientRect(), D = this.desk.getBoundingClientRect();
      this.desk.scrollTop += R.top - D.top - (heading ? 24 : D.height / 3);
      it.classList.remove('flash'); void it.offsetWidth; it.classList.add('flash');
      setTimeout(() => it.classList.remove('flash'), 900);
    }
    if (document.body.classList.contains('src-on') || !el) this.reveal(f, p, false);
  }

  revealCaret(focusSrc) {
    if (!document.body.classList.contains('src-on')) { if (focusSrc) this.toggleSource(true); return; }
    const c = this.caretNow();
    if (!c || c.ghost) return;
    this.reveal(c.f, c.a, focusSrc);
  }

  async reveal(f, p, focusSrc) {
    if (!document.body.classList.contains('src-on')) await this.toggleSource(true);
    await this.ensureCM();
    if ((this.srcFile || this.main) !== f) this.showSrcFile(f);
    if (this.cm) {
      const doc = this.cm.getDoc();
      const pos = doc.posFromIndex(p);
      if (this.syncMark) this.syncMark.clear();
      this.syncLine && this.cm.removeLineClass(this.syncLine, 'background', 'cm-sync');
      this.syncLine = this.cm.addLineClass(pos.line, 'background', 'cm-sync');
      this.cm.scrollIntoView({ line: pos.line, ch: pos.ch }, 120);
      if (focusSrc) { this.cm.focus(); doc.setCursor(pos); }
    } else if (this.cmFallback && focusSrc) { this.cmFallback.focus(); this.cmFallback.setSelectionRange(p, p); }
  }

  revealInPage() {
    if (!this.cm) return;
    const doc = this.cm.getDoc();
    const p = doc.indexFromPos(doc.getCursor());
    const f = this.srcFile || this.main;
    const r = this.index.find(f, p, -1);
    let el = r && r.entry ? r.entry.span : null;
    if (!el) {
      for (const B of this.renderer.blocks) if (B.f === f && B.s <= p && B.e >= p) { el = B.items[0] && B.items[0].el; break; }
    }
    if (!el || !el.isConnected) return;
    const it = el.closest('.it') || el;
    const R = it.getBoundingClientRect(), D = this.desk.getBoundingClientRect();
    if (R.top < D.top + 30 || R.bottom > D.bottom - 30) this.desk.scrollTop += R.top - D.top - D.height / 3;
    it.classList.remove('flash'); void it.offsetWidth; it.classList.add('flash');
    setTimeout(() => it.classList.remove('flash'), 900);
  }

  dragGutter(e) {
    e.preventDefault();
    const pane = $('#srcpane');
    const startX = e.clientX, startW = pane.offsetWidth;
    const move = (ev) => { const w = Math.max(260, Math.min(window.innerWidth * 0.7, startW - (ev.clientX - startX))); pane.style.width = w + 'px'; };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.prefs.srcW = pane.offsetWidth; store(PREFS, this.prefs); if (this.computePx()) this.relayout(true); if (this.cm) this.cm.refresh(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  applyPrefs() {
    if (this.prefs.srcW) $('#srcpane').style.width = this.prefs.srcW + 'px';
  }

  setZoom(dir) {
    const steps = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    // on a phone, where − and + are hidden, the Fit button switches between fitting the width
    // (text a few pixels high) and actual size
    if (dir === 0) this.prefs.zoom = this.prefs.zoom === 'fit' && window.innerWidth <= 520 ? 1 : 'fit';
    else {
      const cur = this.prefs.zoom === 'fit' ? this.px / PX_PER_PT : this.prefs.zoom;
      let i = steps.findIndex((s) => s >= cur - 0.001);
      if (i < 0) i = steps.length - 1;
      if (dir > 0) i = steps[i] > cur + 0.001 ? i : Math.min(steps.length - 1, i + 1);
      else i = Math.max(0, (steps[i] < cur - 0.001 ? i : i - 1));
      this.prefs.zoom = steps[i];
    }
    store(PREFS, this.prefs);
    if (this.computePx()) this.relayout(true);
  }

  // ---- files ----------------------------------------------------------------------
  assetURL(name) {
    if (!name) return null;
    const base = name.replace(/^\.\//, '');
    const cands = [base, ...['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].map((x) => base + x)];
    for (const c of cands) if (this.assets.has(c)) return this.assets.get(c);
    const short = base.split('/').pop();
    for (const [k, v] of this.assets) { const kb = k.split('/').pop(); if (kb === short || kb.replace(/\.[^.]+$/, '') === short) return v; }
    return null;
  }

  // a figure the page cannot draw but the project has, as \includegraphics{plot} names plot.pdf
  // or plot.eps without the extension: it is there, in the PDF, not missing
  vectorFigure(name) {
    const short = (name || '').replace(/^\.\//, '').split('/').pop();
    return [...this.assetBlobs.keys()].some((k) => /\.(pdf|eps)$/i.test(k) && k.split('/').pop().replace(/\.[^.]+$/, '') === short);
  }

  async openFiles(list) {
    const texts = new Map();
    const blobs = new Map();
    const orig = new Map();
    const extra = new Map();
    let zipName = null;
    const gitFiles = new Map(); // a repository's .git folder, when the project came with one
    const gitIn = [];
    // names inside a .zip are whatever its maker wrote (../, /, \): one that would leave the
    // project's folder, here or in git, is left out and named
    const skipped = [];
    const gitOk = (p) => /^\.git\//.test(p) && cleanPath(p.slice(5)) === p.slice(5);
    for (const file of list) {
      const nm = file.webkitRelativePath || file.name;
      if (/(^|\/)\.git\//.test(nm)) { gitIn.push(file); continue; }
      if (/\.zip$/i.test(nm)) {
        zipName = nm.replace(/\.zip$/i, '');
        try {
          if (!window.JSZip) await loadScript(CDN.zip);
          const z = await window.JSZip.loadAsync(file);
          // a zip bomb is refused by the sizes it declares, before anything is inflated
          let total = 0;
          for (const n of Object.keys(z.files)) total += (z.files[n]._data && z.files[n]._data.uncompressedSize) || 0;
          if (total > MAX_ZIP) throw new Error('it would unpack to ' + fmtMB(total) + ', more than this page can hold');
          const names = Object.keys(z.files).filter((n) => !z.files[n].dir && !/(^|\/)(__MACOSX|\.)/.test(n));
          const prefix = commonDir(names);
          for (const n of Object.keys(z.files)) {
            if (z.files[n].dir || !n.startsWith(prefix)) continue;
            const rel = n.slice(prefix.length);
            if (rel.startsWith('.git/')) { if (gitOk(rel)) gitFiles.set(rel, await z.files[n].async('uint8array')); else skipped.push(rel); }
          }
          for (const n of names) {
            const rel = cleanPath(n.slice(prefix.length));
            if (rel === null) { skipped.push(n); continue; }
            if (TEXT_EXT.test(rel)) {
              const bytes = await z.files[n].async('uint8array');
              const d = decodeText(bytes);
              texts.set(rel, d.text);
              orig.set(rel, { bytes, enc: d.enc, bom: d.bom, text: d.text });
            } else if (IMG_EXT.test(rel) || /\.(pdf|eps)$/i.test(rel)) blobs.set(rel, await z.files[n].async('blob'));
            else extra.set(rel, await z.files[n].async('blob'));
          }
        } catch (e) { this.toast('Could not read ' + file.name + ': ' + e.message); }
      } else {
        const rel = cleanPath(stripTop(nm));
        if (rel === null) { skipped.push(nm); continue; }
        if (TEXT_EXT.test(rel)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const d = decodeText(bytes);
          texts.set(rel, d.text);
          orig.set(rel, { bytes, enc: d.enc, bom: d.bom, text: d.text });
        } else if (IMG_EXT.test(rel) || /\.(pdf|eps)$/i.test(rel)) blobs.set(rel, file);
        else extra.set(rel, file);
      }
    }
    for (const f of gitIn) {
      const nm = f.webkitRelativePath || f.name;
      const rel = nm.slice(nm.search(/(^|\/)\.git\//) + (nm.startsWith('.git/') ? 0 : 1));
      if (gitOk(rel)) gitFiles.set(rel, new Uint8Array(await f.arrayBuffer())); else skipped.push(nm);
    }
    const skipNote = skipped.length ? ' Left out ' + skipped.length + (skipped.length === 1 ? ' file whose name points' : ' files whose names point') + ' outside the project: ' + skipped.slice(0, 3).join(', ') + (skipped.length > 3 ? '…' : '.') : '';
    if (!texts.size && !blobs.size && !extra.size) { this.toast(skipNote.trim() || 'Nothing to open. Choose .tex, .bib, image or .zip files.', 9000); return; }
    const hasDoc = [...texts.entries()].some(([n, t]) => /\.tex$/i.test(n) && /\\documentclass/.test(t));
    const onlyTex = [...texts.keys()].filter((n) => /\.tex$/i.test(n));
    // a chapter (a .tex with no \documentclass) opened beside a document of one's own joins its
    // project, as an upload to Overleaf does; it used to replace the whole thesis. Over the
    // untouched sample it still opens on its own.
    const sample = this.files.size === Object.keys(SAMPLE).length && Object.entries(SAMPLE).every(([n, t]) => this.files.get(n) === t);
    if (!hasDoc && (!onlyTex.length || (!sample && !zipName))) {
      // Add to the current project (bib files, images, chapters)
      for (const [n, t] of texts) this.files.set(n, t);
      for (const [n, o] of orig) this.orig.set(n, o);
      for (const [n, b] of blobs) this.addAsset(n, b);
      for (const [n, b] of extra) this.extra.set(n, b);
      this.binaryDirty = true;
      this.zipDirty = true;
      this.forceRender = true;
      this.rebuild(this.caretNow());
      this.pushToSource();
      this.updateFileTabs();
      this.saveSoon();
      // an added chapter or figure shows on the page only once the source names it
      const fig = [...blobs.keys()][0];
      const widget = [...texts.keys()].find((n) => /\.html?$/i.test(n));
      const use = onlyTex.length ? ' Write \\input{' + onlyTex[0].replace(/\.tex$/i, '') + '} where it goes.' : widget ? ' Write \\rikuywidget{' + widget + '}{' + (fig || 'fallback.png') + '} where it goes (rikuy.sty, from Rikuy\'s sample/widget, defines it).' : fig ? ' Write \\includegraphics{' + fig + '} where it goes.' : '';
      this.toast('Added ' + [...texts.keys(), ...blobs.keys(), ...extra.keys()].join(', ') + ' to the project.' + use + skipNote, skipNote || use ? 9000 : undefined);
      return;
    }
    // the project open until now stays in this browser; the toast says where, so nobody thinks it gone
    const prev = this.base && !sample ? this.name : null;
    if (this.base) { await this.snapshot('Before opening another project', { force: !this.lastSig }); await this.stashBinary(); }
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear();
    this.files = texts;
    this.orig = orig;
    this.extra = extra;
    for (const [n, b] of blobs) this.addAsset(n, b);
    this.binaryDirty = true;
    this.zipDirty = false;
    const docs = [...texts.entries()].filter(([n, t]) => /\.tex$/i.test(n) && /\\documentclass/.test(t) && /\\begin\s*\{document\}/.test(t));
    const pick = docs.find(([n]) => /(^|\/)main\.tex$/i.test(n)) || docs.sort((x, y) => x[0].split('/').length - y[0].split('/').length)[0] || [onlyTex[0]];
    this.main = pick[0];
    this.name = zipName || this.main.replace(/\.tex$/i, '').split('/').pop();
    // A .zip or a project with a git history is content from someone else, like a share link:
    // its shell escape is restricted (the worker runs only TeX Live's safe programs, keeps no
    // LuaTeX font cache and is let go after) until the owner allows more. Loose .tex/.bib files
    // the user opened are their own and stay unrestricted.
    if (zipName || gitFiles.has('.git/HEAD')) this.markFromLink('', this.name, this.main, gitFiles.has('.git/HEAD') ? 'git' : 'zip');
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.forceRender = true;
    this.srcFile = this.main;
    this.desk.scrollTop = 0;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.updateFileTabs();
    this.persist();
    this.setBase({ t: Date.now(), label: 'Opened', files: this.files });
    this.lastSig = null;
    this.snapshot('Opened');
    this.resetPdf();
    const missing = this.missingInputs();
    let gitNote = '';
    if (gitFiles.has('.git/HEAD')) {
      try {
        const G = await this.loadGit();
        // its remote is the .zip's, not the user's, until the user sets one or gives it a token
        this.gitOwnRemote(G.dirFor(this.name), '');
        if (await G.importGit(G.dirFor(this.name), gitFiles)) {
          const n = (await G.log(G.dirFor(this.name))).length;
          gitNote = ' Its git history came along (' + n + (n === 1 ? ' commit' : ' commits') + '; see Git).';
        }
      } catch (e) { gitNote = ' Its .git folder could not be read: ' + e.message + '.'; }
    }
    this.toast('Opened ' + this.main + (texts.size > 1 ? ' and ' + (texts.size - 1) + ' more file' + (texts.size > 2 ? 's' : '') : '') + '.' + (missing.length ? ' Not found: ' + missing.join(', ') + '.' : '') + gitNote + (prev && prev !== this.name ? ' ' + prev + ' is kept under Review, Versions.' : '') + skipNote, skipNote ? 10000 : 7000);
  }

  addAsset(name, blob) {
    this.assetBlobs.set(name, blob);
    if (IMG_EXT.test(name)) this.assets.set(name, URL.createObjectURL(blob));
  }

  missingInputs() {
    const miss = [];
    const t = this.src(this.main);
    const re = /\\(?:input|include|bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(t))) for (const nm of m[1].split(',')) {
      const n = nm.trim();
      if (!n) continue;
      const isBib = /bibliography|addbibresource/.test(m[0]);
      const ok = [...this.files.keys()].some((k) => k === n || k === n + (isBib ? '.bib' : '.tex') || k.endsWith('/' + n) || k.endsWith('/' + n + (isBib ? '.bib' : '.tex')));
      if (!ok) miss.push(n + (isBib && !/\.bib$/.test(n) ? '.bib' : ''));
    }
    return miss;
  }

  // Keep the project in this browser: text on every change, binary files when they change.
  persist() {
    const meta = { name: this.name, main: this.main, files: [...this.files.entries()], t: Date.now(), zipDirty: this.zipDirty };
    // when this browser keeps nothing (storage turned off, as in some private windows, or
    // full) or keeps the text but not the figures, the user hears it once, not only in the
    // status line, so nobody closes the page trusting a copy that is not there
    const show = (ok, partial) => {
      const out = this.singleFile() ? 'the .tex' : 'the .zip';
      $('#st-save').textContent = !ok ? 'Not kept in this browser. Save ' + out + '.' : partial ? 'Text kept in this browser, figures not. Save ' + out + '.' : 'Saved in this browser';
      if ((!ok || partial) && !this.saveWarned) {
        this.saveWarned = true;
        this.toast((!ok ? 'This browser is not keeping your work: its storage is full or turned off here.' : 'This browser keeps the text but not the figures: its storage is full or turned off here.') + ' Save ' + out + ' before you close the page.', 12000);
      }
      document.body.classList.toggle('zip-dirty', !!this.zipDirty);
      const what = this.singleFile() ? this.main.split('/').pop() : 'the project as .zip';
      $('#b-save').title = (this.zipDirty ? 'Changes since you last saved. ' : '') + 'Download ' + what + ' (Ctrl+S)';
      $('#b-save span').textContent = this.singleFile() ? 'Save .tex' : 'Save .zip';
    };
    this.unsaved = false;
    const fallback = () => show(store(STORE, meta), this.assetBlobs.size > 0 || this.extra.size > 0);
    if (this.noIdb) { fallback(); return; }
    // The write hands back the copy it replaces: when another tab of this browser saved it after
    // this one last read or wrote, that tab's text goes into the versions instead of being lost.
    const prevT = this.savedT;
    this.savedT = meta.t;
    const jobs = [kvSwap('project', meta).then((cur) => { if (cur && cur.files && cur.t !== prevT) return this.keepOtherTab(cur); })];
    if (this.binaryDirty) {
      this.binaryDirty = false;
      jobs.push(kvPut('binary', {
        assets: [...this.assetBlobs.entries()],
        extra: [...this.extra.entries()],
        orig: [...this.orig.entries()].map(([n, o]) => [n, { bytes: o.bytes, enc: o.enc, bom: o.bom }])
      }));
    }
    Promise.all(jobs).then(() => { show(true); try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ } })
      .catch(() => { this.noIdb = true; fallback(); });
  }

  // Another tab saved this project (or another one) after this tab last read it: keep that text
  // as a named version, so it is never pruned, and say where it is.
  async keepOtherTab(cur) {
    const sig = textSig(cur.main, cur.files);
    if (sig === textSig(this.main, [...this.files.entries()])) return;
    try { await snapAdd({ t: Date.now(), label: 'From another tab', named: true, name: cur.name || cur.main, main: cur.main, sig, files: cur.files }); } catch (e) { return; }
    this.snapList = null;
    this.toast('This document is open in another tab too. What that tab saved is kept under Review, Versions, as “From another tab”.', 9000);
  }

  // Back in this tab after working in another one on the same project: take its text, as one
  // step Ctrl+Z undoes, so this tab does not go on from an older copy.
  async adoptOtherTab() {
    if (this.noIdb || this.unsaved || !this.model) return;
    let cur = null;
    try { cur = await kvGet('project'); } catch (e) { return; }
    if (!cur || !cur.files || cur.t === this.savedT || this.unsaved) return;
    if (cur.name !== this.name || cur.main !== this.main) return;
    const edits = [];
    for (const [n, t] of cur.files) { const was = this.files.get(n); if (was !== t) edits.push({ f: n, s: 0, e: was == null ? 0 : was.length, t }); }
    this.savedT = cur.t;
    if (!edits.length) return;
    this.closePop(true);
    this.closeGroup();
    this.commit(edits, null, 'other-tab');
    this.closeGroup();
    this.toast('Brought in what was typed in another tab. Ctrl+Z undoes it.', 5000);
  }

  resetToSample() {
    if (!this.confirmReset) {
      this.confirmReset = true;
      this.toast('This replaces your current document with the sample.', 5000, { label: 'Replace', fn: () => { this.confirmReset = false; this.doReset(); } });
      setTimeout(() => { this.confirmReset = false; }, 5000);
      return;
    }
  }
  // a blank article to type into; the open project stays under Review, Versions
  async newDocument() {
    await this.snapshot('Before starting a new document', { force: !this.lastSig });
    await this.stashBinary();
    const taken = new Set((await this.allSnaps()).map((v) => v.name));
    let name = 'Untitled';
    for (let k = 2; taken.has(name) || name === this.name; k++) name = 'Untitled ' + k;
    this.loadProject(new Map([['main.tex', '\\documentclass{article}\n\\usepackage{amsmath}\n\n\\begin{document}\n\n\\end{document}\n']]), 'main.tex', name, 'New document');
    this.toast('A new document. The one you had is under Review, Versions.', 5000);
  }

  async doReset() {
    await this.snapshot('Before loading the sample', { force: !this.lastSig });
    await this.stashBinary();
    this.loadSample();
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.forceRender = true;
    this.srcFile = this.main;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.persist();
    this.setBase({ t: Date.now(), label: 'Sample', files: this.files });
    this.lastSig = null;
    this.snapshot('Sample');
    this.resetPdf();
    this.refreshNav();
  }

  // the project as a .zip: text in the encoding it came in (untouched files byte for byte),
  // figures and other files as they were; with git, its .git folder too
  async zipBlob(o = {}) {
    if (!window.JSZip) await loadScript(CDN.zip);
    const z = new window.JSZip();
    for (const [n, t] of this.files) {
      const o2 = this.orig.get(n);
      const out = /\.tex$/i.test(n) ? this.exportText(t) : t;
      z.file(n, o2 && o2.text === out ? o2.bytes : encodeText(out, o2 ? o2.enc : 'utf-8', o2 ? o2.bom : false));
    }
    for (const [n, b] of this.assetBlobs) z.file(n, b);
    for (const [n, b] of this.extra) if (!this.files.has(n) && !this.assetBlobs.has(n)) z.file(n, b);
    // a project kept in git leaves as a clone: its .git folder goes into the .zip too
    let withGit = false;
    if (o.git !== false && (this.gitP || (await this.hasGitRepo()))) {
      try {
        const G = await this.loadGit();
        const dir = G.dirFor(this.name);
        if (await G.isRepo(dir)) {
          await G.writeTree(dir, await this.gitFiles());
          for (const [n, b] of await G.exportAll(dir)) if (n.startsWith('.git/')) z.file(n, b);
          withGit = true;
        }
      } catch (e) { /* the .zip without history is still a good .zip */ }
    }
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    blob.withGit = withGit;
    return blob;
  }

  // Save: one file stays one .tex, anything more a .zip; both exactly the source
  async save() {
    const D = this.caps.downloads;
    const standalone = !window.claude;
    if (!D && !standalone) { this.toast('Saving is not available in this view. Use Copy source instead.'); return; }
    try {
      let blob, fname, withGit = false;
      const single = this.singleFile() && !(this.gitP && (await this.hasGitRepo()));
      if (single) {
        const o = this.orig.get(this.main);
        const out = this.exportText(this.src(this.main));
        blob = new Blob([o && o.text === out ? o.bytes : encodeText(out, o ? o.enc : 'utf-8', o ? o.bom : false)], { type: 'application/x-tex' });
        fname = this.main.split('/').pop();
      } else {
        blob = await this.zipBlob();
        withGit = blob.withGit;
        fname = (this.name || 'paper').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') + '.zip';
      }
      if (D) await D.save({ filename: fname, data: blob });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      this.zipDirty = false;
      this.persist();
      this.snapshot('Saved ' + fname);
      this.toast('Saved ' + fname + (withGit ? ', with its git history (unzip it: git log and git push work there).' : single ? '.' : '. Upload it to Overleaf or unzip it next to your other files.'), 7000);
    } catch (e) {
      if (e && e.code === 'declined') return;
      this.toast('Could not save: ' + ((e && (e.message || e.code)) || 'unknown error'));
    }
  }

  // ---- real pdfLaTeX ---------------------------------------------------------------
  // The PDF pane compiles the project with pdfTeX from TeX Live 2026 (WebAssembly, in a
  // worker) and shows the result with PDF.js. It recompiles a moment after each edit while
  // open; TeX's errors go to the Problems list with their line; clicking the PDF finds the
  // source line (SyncTeX), and clicking the page finds the spot in the PDF.
  togglePdf(force) {
    const on = force ?? !document.body.classList.contains('pdf-on');
    if (on && document.body.classList.contains('src-on') && window.innerWidth < 1500) this.toggleSource(false);
    document.body.classList.toggle('pdf-on', on);
    $('#b-pdf').setAttribute('aria-pressed', on ? 'true' : 'false');
    this.prefs.pdf = on;
    store(PREFS, this.prefs);
    if (on) {
      if (!this.pdfView) this.pdfView = new PdfView($('#pdf-host'), { workerUrl: new URL('tex/pdf.worker.min.mjs', location.href).href, onClickSource: (f, line) => this.fromPdf(f, line) });
      if (!this.lastPdf || this.pdfStale) this.compilePdf();
    }
    setTimeout(() => { if (this.computePx()) this.relayout(true); }, 30);
  }

  texEngine() {
    if (!this.tex) {
      // a full TeX Live mirror: ?texlive=URL, or the one a self-hosted build names (RIKUY_MIRROR)
      let mirror = null;
      try { mirror = new URLSearchParams(location.search).get('texlive') || (typeof __RIKUY_MIRROR__ !== 'undefined' && __RIKUY_MIRROR__) || null; } catch (e) { /* none */ }
      // the page's own address can name a mirror only on its own site: a link to someone's copy
      // with ?texlive= pointing elsewhere would fill their browser's TeX cache from a stranger
      try { if (mirror && new URLSearchParams(location.search).get('texlive') === mirror && new URL(mirror, location.href).origin !== location.origin) mirror = null; } catch (e) { mirror = null; }
      this.tex = new TeXEngine(new URL('tex/', location.href).href, mirror ? new URL(mirror, location.href).href : null);
      this.tex.onStatus = (s) => this.texStatus(s);
    }
    return this.tex;
  }

  texStatus(s) {
    const st = $('#pdf-status'), bar = $('#pdf-prog');
    const say = (html, frac) => {
      st.innerHTML = html;
      bar.hidden = false;
      bar.classList.toggle('busy', frac == null);
      bar.firstChild.style.width = frac == null ? '' : Math.round(frac * 100) + '%';
    };
    if (s.status === 'index') say('Starting TeX…');
    else if (s.status === 'engine') say('Downloading TeX Live, once: ' + fmtMB(s.got) + ' of ' + fmtMB(s.total), s.got / s.total);
    else if (s.status === 'compile-engine') say('Preparing TeX…');
    else if (s.status === 'core') say('Loading LaTeX…');
    else if (s.status === 'fetch') say('Fetching packages…');
    else if (s.status === 'pass') { this.passNo = s.n; if (s.engine) this.engineLabel = ENGINE_LABEL[s.engine]; if (!this.passStart) this.passStart = Date.now(); say((s.engine ? ENGINE_LABEL[s.engine] + ': t' : 'T') + 'ypesetting' + (s.n > 1 ? ', pass ' + s.n : '') + '…'); }
    else if (s.status === 'driver') say('Writing the PDF (' + (s.tool || 'xdvipdfmx') + ')…');
    else if (s.status === 'tool') say('Running ' + esc(s.tool) + '…');
    else if (s.status === 'tool-fetch') say('Fetching ' + esc(s.tool) + ', once…');
    else if (s.status === 'bibtex') say('Bibliography…');
    else if (s.status === 'biber-fetch') say('Fetching biber for biblatex, once…');
    else if (s.status === 'biber') say('Bibliography (biber)…');
  }

  // Where TeX sees a project file: relative to the main file's folder.
  texPath(f) {
    const dir = this.main.includes('/') ? this.main.slice(0, this.main.lastIndexOf('/') + 1) : '';
    return dir && f.startsWith(dir) ? f.slice(dir.length) : f;
  }
  fromTexPath(p) {
    if (!p) return this.main;
    const dir = this.main.includes('/') ? this.main.slice(0, this.main.lastIndexOf('/') + 1) : '';
    const clean = p.replace(/^\.\//, '');
    for (const c of [dir + clean, clean, dir + clean + '.tex', clean + '.tex']) if (this.files.has(c)) return c;
    for (const k of this.files.keys()) if (k.endsWith('/' + clean)) return k;
    return null;
  }

  fromPdf(file, line) {
    const f = this.fromTexPath(file);
    if (!f) return;
    this.goTo(f, lineStart(this.src(f), line));
  }

  async compileFiles() {
    const files = [];
    // a Latin-1 file goes to TeX in Latin-1, as it would on disk
    for (const [n, t] of this.files) { const o = this.orig.get(n); files.push({ path: n, data: o && o.enc === 'latin1' ? encodeText(t, 'latin1', false) : t }); }
    const bin = async (b) => new Uint8Array(await b.arrayBuffer());
    for (const [n, b] of this.assetBlobs) files.push({ path: n, data: await bin(b) });
    for (const [n, b] of this.extra) if (!this.files.has(n) && !this.assetBlobs.has(n)) files.push({ path: n, data: await bin(b) });
    // A copy opened from a link has none of the sender's figures. TeX gets a gray box for each,
    // so a coauthor who never wrote LaTeX sees the document compile, not "File not found" errors.
    if (this.figuresWith()) {
      const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      for (const n of missingFigures({ files: this.files, assets: [...this.assetBlobs.keys(), ...this.extra.keys()] })) {
        const ext = (/\.([A-Za-z]+)$/.exec(n) || [])[1];
        const low = ext ? ext.toLowerCase() : '';
        if (/^(png|jpe?g)$/.test(low)) files.push({ path: n, data: b64(PLACEHOLDER_PNG) }); // TeX reads the type from the bytes
        else if (low === 'pdf') files.push({ path: n, data: b64(PLACEHOLDER_PDF) });
        else if (low === 'eps') files.push({ path: n, data: PLACEHOLDER_EPS });
        else if (!ext) { files.push({ path: n + '.pdf', data: b64(PLACEHOLDER_PDF) }); files.push({ path: n + '.eps', data: PLACEHOLDER_EPS }); }
      }
    }
    // the worker writes each file at the project's folder + its name: a name with .. (kept from
    // before names were checked on the way in) would overwrite TeX's own files or another
    // project's for the rest of the session
    return files.filter((x) => cleanPath(x.path) === x.path);
  }

  async compilePdf(opts = {}) {
    if (this.compiling) { this.compileAgain = opts.clean ? 'clean' : (this.compileAgain || true); return; }
    this.compiling = true;
    this.pdfStale = false;
    this.stopped = false;
    const gen = this.pdfGen || 0;
    const st = $('#pdf-status'), bar = $('#pdf-prog'), msg = $('#pdf-msg');
    const sig = textSig(this.main, [...this.files.entries()]);
    // a long TeX run gets a clock and a Stop button; one that never ends is stopped after
    // 5 minutes of typesetting (downloading the engine does not count)
    this.compileStart = Date.now();
    this.passNo = 0;
    this.passStart = 0;
    clearInterval(this.compileTick);
    this.compileTick = setInterval(() => {
      if (!this.passStart) return;
      const t = Math.round((Date.now() - this.passStart) / 1000);
      if (t >= 4) {
        st.innerHTML = 'Typesetting' + (this.passNo > 1 ? ', pass ' + this.passNo : '') + '… ' + t + ' s';
        $('#pdf-re').textContent = 'Stop';
      }
      if (t >= 300) { clearInterval(this.compileTick); this.stopPdf(true); }
    }, 1000);
    const bibSig = textSig('', [...this.files].filter(([n]) => /\.(bib|bibtex)$/i.test(n)));
    try {
      const engine = this.texEngine();
      if (!engine.info) bar.hidden = false;
      // a document that came in a link compiles restricted, and the worker keeps nothing of it
      const li = await this.linkInfo();
      const untrusted = !!(li && !li.allowed);
      this.syncEngineMenu();
      const res = await engine.compile({ project: this.name + '|' + this.main, files: await this.compileFiles(), main: this.main, clean: !!opts.clean, bibSig, engine: this.engineChoice(), shellEscape: this.prefs.shellEscape !== false && !untrusted, untrusted });
      if (gen !== (this.pdfGen || 0)) return; // another project was opened meanwhile
      const issues = parseTeXLog(res.log);
      this.engineLabel = res.engineLabel || 'LaTeX';
      this.showEngine(res);
      // programs a package wanted that cannot run in a browser (inkscape, R, ...)
      for (const p of res.missing || []) issues.unshift({ sev: 'warn', file: null, line: null, msg: 'Shell escape: ' + p + ' cannot run in the browser, so what it makes is missing' });
      if (untrusted) this.noteRestricted(issues);
      for (const r of res.runs) if (r.cmd !== 'tex' && r.cmd !== 'shell' && r.code) issues.unshift({ sev: r.cmd === 'biber' ? 'warn' : 'error', file: null, line: null, msg: (r.cmd === 'bibtex' ? 'BibTeX: ' : '') + (r.log.split('\n').find((l) => /error|warning|I couldn't|I found no/i.test(l)) || r.log.split('\n')[0] || 'failed').trim() });
      this.texIssues = issues.map((x) => {
        const known = x.file && this.fromTexPath(x.file);
        const f = known || this.main;
        const line = known ? x.line : null;
        const p = line ? lineStart(this.src(f), line) : 0;
        return { sev: x.sev, f, p, line, msg: x.msg + (x.ctx ? ' (at ' + x.ctx.trim().slice(0, 60) + ')' : ''), key: 'tex:' + x.msg, tex: true };
      });
      this.problemsSoon();
      const errs = this.texIssues.filter((x) => x.sev === 'error').length;
      const warns = this.texIssues.filter((x) => x.sev === 'warn').length;
      if (res.ok) {
        this.lastPdf = res.pdf;
        this.lastPdfSig = sig;
        // drawn while the pane is closed, the pages would have no width: draw them on reopening
        if (!document.body.classList.contains('pdf-on')) this.pdfStale = true;
        const n = await this.pdfView.show(new Uint8Array(res.pdf), res.synctex ? new Uint8Array(res.synctex) : null);
        st.innerHTML = '<b>' + this.engineLabel + '</b> · ' + n + (n === 1 ? ' page' : ' pages') + ' · ' + (res.ms / 1000).toFixed(1) + ' s';
        $('#pdf-dl').disabled = false;
      } else {
        st.innerHTML = '<b>' + this.engineLabel + '</b> stopped';
        if (!this.lastPdf) $('#pdf-host').innerHTML = '<div class="pdf-empty"><b>No PDF yet.</b> ' + this.engineLabel + ' stopped at the first error below. Fix it on the page or in the source and it compiles again by itself.</div>';
      }
      msg.hidden = !(errs || warns);
      msg.classList.toggle('ok', !errs && !warns);
      msg.innerHTML = errs ? '<b>' + errs + (errs === 1 ? ' error' : ' errors') + '</b>' + (warns ? ', ' + warns + (warns === 1 ? ' warning' : ' warnings') : '') + ' from ' + this.engineLabel + '. Show them' :
        warns ? warns + (warns === 1 ? ' warning' : ' warnings') + ' from ' + this.engineLabel + ', such as undefined references. Show them' : '';
      if (errs || warns) msg.firstChild && (msg.title = this.texIssues.slice(0, 3).map((x) => x.msg).join('\n'));
    } catch (e) {
      if (this.stopped) {
        this.stopped = false;
        st.innerHTML = '<b>' + (this.engineLabel || 'TeX') + '</b> stopped';
        msg.hidden = false; msg.classList.remove('ok');
        msg.innerHTML = '<b>Stopped after ' + Math.round((Date.now() - this.compileStart) / 1000) + ' s.</b> A loop in a macro, or a very long document, keeps TeX busy.';
        this.compileAgain = false;
        return;
      }
      st.textContent = 'TeX could not run here';
      $('#pdf-host').innerHTML = '';
      const d = document.createElement('div'); d.className = 'pdf-empty';
      d.textContent = (e && e.message ? e.message + '. ' : '') + 'The page preview can still be printed.';
      const b = document.createElement('button'); b.className = 'btn sm'; b.type = 'button'; b.textContent = 'Print the preview'; b.style.marginTop = '10px';
      b.addEventListener('click', () => this.printPDF());
      d.append(document.createElement('br'), b);
      $('#pdf-host').appendChild(d);
    } finally {
      clearInterval(this.compileTick);
      $('#pdf-re').textContent = 'Recompile';
      bar.hidden = true;
      this.compiling = false;
      const again = this.compileAgain;
      this.compileAgain = false;
      if (again && document.body.classList.contains('pdf-on')) this.compilePdf({ clean: again === 'clean' });
      else if (textSig(this.main, [...this.files.entries()]) !== sig) this.pdfSoon();
    }
  }

  // Which engine compiles this project: Auto (a magic comment, else what the preamble loads)
  // or one the author picked, kept per project.
  engineChoice() {
    const m = this.prefs.engines || {};
    return m[this.name] || 'auto';
  }
  setEngine(v) {
    this.prefs.engines = Object.assign({}, this.prefs.engines, { [this.name]: v });
    store(PREFS, this.prefs);
    this.syncEngineMenu();
    if (document.body.classList.contains('pdf-on')) this.compilePdf({ clean: true });
  }
  syncEngineMenu() {
    const sel = $('#pdf-engine');
    if (sel) sel.value = this.engineChoice();
    const se = $('#pdf-shell');
    const li = this.linkCache && this.linkCache.get(this.name + '|' + this.main);
    if (se) se.checked = this.prefs.shellEscape !== false && !(li && !li.allowed);
  }
  showEngine(res) {
    const sel = $('#pdf-engine');
    if (!sel) return;
    const auto = sel.querySelector('option[value=auto]');
    auto.textContent = this.engineChoice() === 'auto' && res.engineLabel ? 'Auto: ' + res.engineLabel : 'Auto';
    sel.title = res.engineWhy === 'magic comment' ? 'Chosen by the % !TeX program line' : res.engineWhy === 'chosen' ? 'Chosen here' :
      'Auto picks ' + res.engineLabel + (res.engineWhy && res.engineWhy !== 'default' ? ' (' + res.engineWhy + ')' : '');
  }

  stopPdf(auto) {
    if (!this.tex || !this.compiling) return;
    this.stopped = true;
    this.tex.stop();
    if (auto) this.toast((this.engineLabel || 'TeX') + ' ran for 5 minutes without finishing, so it was stopped.', 6000);
  }

  // a different project: its PDF and pdfLaTeX's verdict start over
  resetPdf() {
    this.pdfGen = (this.pdfGen || 0) + 1;
    this.lastPdf = null;
    this.texIssues = [];
    this.lastBibSig = null;
    if (this.pdfView) this.pdfView.clear();
    $('#pdf-dl').disabled = true;
    $('#pdf-msg').hidden = true;
    $('#pdf-status').textContent = 'LaTeX';
    this.syncEngineMenu();
    if (document.body.classList.contains('pdf-on')) this.compilePdf();
    else this.pdfStale = true;
  }

  async downloadPdf() {
    if (!this.lastPdf) return;
    const fname = (this.name || 'paper').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') + '.pdf';
    const blob = new Blob([this.lastPdf], { type: 'application/pdf' });
    try {
      if (this.caps.downloads) await this.caps.downloads.save({ filename: fname, data: blob });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } catch (e) {
      if (e && e.code === 'declined') return;
      this.toast('Could not save the PDF: ' + ((e && e.message) || 'unknown error'));
    }
  }

  // MathML for a math atom on the page (for Word, which turns it into an equation).
  mathML(el) {
    const info = atomOfEl(el);
    if (!info || info.is == null || !window.katex) return null;
    const display = !!(info.a && info.a.display);
    let tex = this.src(info.f).slice(info.is, info.ie);
    tex = this.mathPreviewTex(tex, display);
    try {
      const macros = {};
      for (const [k, v] of Object.entries(this.renderer.macros)) if (typeof v === 'string') macros[k] = v;
      return window.katex.renderToString(tex, { output: 'mathml', displayMode: display, throwOnError: false, strict: 'ignore', macros });
    } catch (e) { return null; }
  }

  // ---- print / PDF ---------------------------------------------------------------------
  // Pages print at exactly the document's paper size. Inside a sandboxed frame print() is
  // ignored; then the same pages are downloaded as a print-ready file instead.
  preparePrint() {
    if (this.printZoom !== undefined) return;
    this.printZoom = this.prefs.zoom;
    this.prefs.zoom = 1;
    if (this.computePx()) this.relayout(true);
    const pg = this.root.querySelector('.page');
    const st = $('#print-page') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'print-page' }));
    if (pg) st.textContent = '@page { size: ' + pg.offsetWidth + 'px ' + pg.offsetHeight + 'px; margin: 0; }';
  }
  endPrint() {
    if (this.printZoom === undefined) return;
    this.prefs.zoom = this.printZoom;
    this.printZoom = undefined;
    if (this.computePx()) this.relayout(true);
  }
  async printPDF() {
    if (this.pop) this.closePop(true);
    this.printing = true;
    this.printSeen = false;
    this.preparePrint();
    await new Promise((r) => setTimeout(r, 80));
    try { window.print(); } catch (e) { /* blocked */ }
    await new Promise((r) => setTimeout(r, 300));
    const blocked = !this.printSeen;
    this.printing = false;
    if (blocked) await this.exportPrintCopy();
    this.endPrint();
  }
  async exportPrintCopy() {
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('\n');
    const clone = this.root.cloneNode(true);
    clone.removeAttribute('contenteditable');
    for (const x of clone.querySelectorAll('[contenteditable]')) x.removeAttribute('contenteditable');
    for (const x of clone.querySelectorAll('.mk-layer')) x.remove();
    for (const x of clone.querySelectorAll('.chg-atom')) x.classList.remove('chg-atom');
    for (const img of clone.querySelectorAll('img[src^="blob:"]')) {
      try {
        const b = await (await fetch(img.src)).blob();
        img.src = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
      } catch (e) { /* leave it */ }
    }
    const sheet = this.sheet;
    const html = '<!doctype html><html lang="' + (sheet.lang || 'en') + '"><head><meta charset="utf-8"><title>' + esc(this.name || 'paper') + '</title><style>' + css +
      '\nbody{margin:0;background:#fff;overflow:visible;height:auto}#pages{display:block}.page{box-shadow:none;margin:0 auto;break-after:page;content-visibility:visible;contain:none}.page:last-child{break-after:auto}.has-err,.ghostp{outline:none}.w-live .wfb{visibility:visible}' +
      '@media screen{#pages{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 0;background:#DCE1E7}.page{box-shadow:0 1px 2px rgba(0,0,0,.2)}}</style></head><body>' +
      '<div class="sheet" lang="' + (sheet.lang || 'en') + '" style="' + (sheet.getAttribute('style') || '').replace(/"/g, '&quot;') + '"' + (sheet.dataset.font ? ' data-font="' + sheet.dataset.font + '"' : '') + '>' + clone.outerHTML + '</div>' +
      '<script>addEventListener("load",function(){setTimeout(function(){print()},500)})<\/script></body></html>';
    const blob = new Blob([html], { type: 'text/html' });
    const fname = (this.name || 'paper').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') + '-print.html';
    try {
      if (this.caps.downloads) await this.caps.downloads.save({ filename: fname, data: blob });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      this.toast('Printing is blocked in this view, so the pages were saved as ' + fname + '. Open it and it prints; choose Save as PDF.', 9000);
    } catch (e) {
      if (e && e.code === 'declined') return;
      this.toast('Could not save the print copy: ' + ((e && e.message) || 'unknown error'));
    }
  }

  // An equation as MathML, which Word (and PowerPoint, OneNote, LibreOffice) turn into a
  // native, editable equation on paste. Plain text carries the MathML too: Word reads it.
  async copyEquation(tex, display) {
    const macros = {};
    for (const [k, v] of Object.entries(this.renderer.macros)) if (typeof v === 'string') macros[k] = v;
    let ml = '';
    try { ml = window.katex.renderToString(this.mathPreviewTex(tex, display), { output: 'mathml', displayMode: display, throwOnError: true, strict: 'ignore', macros }); }
    catch (e) { this.toast('Fix the error in this equation first, then copy it.'); return; }
    const m = /<math[\s\S]*<\/math>/.exec(ml);
    if (!m) return;
    const math = m[0].replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<\/?semantics>/g, '');
    const ok = await copyRich(math, math);
    this.toast(ok ? 'Copied. Paste into Word for an editable equation.' : 'Copy was blocked here. Select the equation on the page and copy it instead.');
  }

  async copySource() {
    const name = this.srcFile && document.body.classList.contains('src-on') ? this.srcFile : this.main;
    const text = this.src(name);
    try { await navigator.clipboard.writeText(text); this.toast('Copied ' + name + ' to the clipboard.'); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      this.toast(ok ? 'Copied ' + name + ' to the clipboard.' : 'Copy was blocked. Open the source pane and select the text.');
    }
  }

  openHelp() {
    const p = this.makePop($('#b-help'), 'pop-help', 'How Rikuy works');
    const mod = isMac ? 'Cmd' : 'Ctrl';
    p.insertAdjacentHTML('beforeend', `
      <p>The page is typeset from your LaTeX source. Every edit you make on the page is written back into the source as the smallest possible change.</p>
      <dl class="keys">
        <dt>Type, select, delete</dt><dd>As in any editor</dd>
        <dt>${mod}+B, ${mod}+I</dt><dd>\\textbf, \\emph</dd>
        <dt>$ or ${mod}+M</dt><dd>New inline math</dd>
        <dt>${mod}+Shift+E</dt><dd>New numbered equation</dd>
        <dt>\\ or ${mod}+K</dt><dd>Insert a command</dd>
        <dt>Click math, a citation or a reference</dt><dd>Edit it in place</dd>
        <dt>Alt+click</dt><dd>Show that spot in the source</dd>
        <dt>Tab, ${mod}+Enter</dt><dd>Next cell, new row in tables</dd>
        <dt>${mod}+Z, ${mod}+Shift+Z</dt><dd>Undo, redo</dd>
        <dt>${mod}+Alt+M</dt><dd>Comment on the selected words. A comment is a LaTeX comment line in the source, so Overleaf, Git and TeX keep it and print nothing</dd>
        <dt>Paste</dt><dd>From Word, Google Docs or the web: bold, italics, lists, links, tables and equations become LaTeX. ${mod}+Shift+V pastes plain text</dd>
        <dt>Copy</dt><dd>Keeps formatting; equations paste into Word as equations</dd>
        <dt>${mod}+Shift+O</dt><dd>Outline, problems (undefined references, missing citations, unclosed environments) and changes</dd>
        <dt>Esc, then Tab</dt><dd>Leave the source pane, where Tab indents</dd>
        <dt>PDF or ${mod}+P</dt><dd>Compiles with TeX Live 2026, running in this browser, and shows the exact PDF: pdfLaTeX, XeLaTeX or LuaLaTeX (Auto reads a <code>% !TeX program</code> line or the preamble). Shell escape runs Ghostscript, gnuplot, Pygments for minted and makeindex here too. It recompiles after each edit; TeX's errors appear under Problems with their line; click the PDF to find that text, click the page to find it in the PDF</dd>
      </dl>
      <p><b>Review</b> lists the comments, then every edit since you opened the project, or since any saved version, with Accept and Reject; tick Show changes on the pages to see them marked like Word's Track Changes. Versions are kept every few minutes, when you leave, when you save the .zip, and under any name you give.</p>
      <p><b>Share</b> copies a link that opens this document for anyone, ready to type in, with no account: the document travels inside the link and is not uploaded. Coauthors type and comment on the page and send a link back; their edits arrive here as changes to accept or reject. Share also opens the project in Overleaf, and Save gives a plain .tex (or a .zip with several files), so leaving takes one click. From Overleaf: Menu, Download, Source, and drop the .zip on the page. With Overleaf's Git integration, paste the project's address under Git, Clone, and push and pull keep both in step.</p>
      <p><b>Git</b> makes the project a real repository in this browser: commit, history, compare or restore any commit, branches, push and pull. Save .zip then includes the .git folder, so the download is a clone; opening a .zip or folder that has one brings its history in.</p>
      <p><b>Equations</b> work like Word's equation editor, with every name from Word's Math AutoCorrect list.</p>
      <dl class="keys">
        <dt>\\alpha then Space</dt><dd>&alpha;. Any LaTeX or Word name: \\degree, \\cbrt, \\matrix, \\doubleR</dd>
        <dt>sin x, max_x, lim_n</dt><dd>Function names turn upright on their own. In display math, max_x puts x below</dd>
        <dt>a/b, x^2, x_i</dt><dd>Fraction, superscript, subscript. An operator ends them: x^2+1</dd>
        <dt>x^(n+1), (a+b)/c</dt><dd>Parentheses group and disappear, as in Word</dd>
        <dt>( [ { | \\langle</dt><dd>Brackets grow with what they hold. The closing one finishes the pair, any kind: [0,1)</dd>
        <dt>Space</dt><dd>Step out of a superscript, subscript, fraction or root</dd>
        <dt>-&gt; &lt;= &gt;= != +- ~= ...</dt><dd>&rarr; &le; &ge; &ne; &plusmn; &cong; &hellip;</dd>
        <dt>Tab</dt><dd>Next empty slot, or pick a suggestion</dd>
        <dt>&amp;, ${mod}+Enter or Shift+Enter</dt><dd>Next column, new row (a single equation becomes aligned)</dd>
        <dt>"if x &gt; 0"</dt><dd>Quotes give upright text, \\text{if x &gt; 0}</dd>
        <dt>a/=b, x/\\in A</dt><dd>A slash before a relation crosses it out: &ne;, &notin;, &nlt;. \\/ is a plain slash</dd>
        <dt>Select, then \\sqrt or (</dt><dd>Wraps the selection, as in Word</dd>
        <dt>Paste $x^2$ or \\[...\\]</dt><dd>The delimiters come off</dd>
      </dl>
      <details class="wm-all"><summary>All equation shortcuts</summary>
        <input type="search" class="wm-filter" placeholder="Filter, e.g. arrow, int, hat" aria-label="Filter equation shortcuts">
        <div class="wm-list"></div>
      </details>
      <p class="pop-note">The editable pages break lines the way the browser does, so they can differ slightly from TeX; the PDF pane is TeX itself. Your .tex is never reformatted.</p>
      <p class="pop-note">Rikuy is free software under the GNU Affero General Public License 3.0 or later. Its source, with the sources and licenses of the programs it runs (TeX Live, Ghostscript, Asymptote, gnuplot and the rest), is at <a href="https://github.com/pdfrackebrandt/rikuy" target="_blank" rel="noopener">github.com/pdfrackebrandt/rikuy</a>; the license texts are also in <a href="LICENSES.txt" target="_blank" rel="noopener">LICENSES.txt</a> next to this page.</p>`);
    const det = p.querySelector('.wm-all');
    det.addEventListener('toggle', () => { if (det.open && !det.dataset.filled) this.fillShortcutList(det); this.positionPop(); });
    this.positionPop();
  }

  // Every equation shortcut, grouped and rendered, with a filter.
  fillShortcutList(det) {
    det.dataset.filled = '1';
    const list = det.querySelector('.wm-list');
    const D = makeDialect({ display: true });
    const sections = [];
    for (const [title, names] of WORD_GROUPS) {
      const sec = document.createElement('section');
      const h = document.createElement('h4');
      h.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'wm-grid';
      const fn = /^Functions/.test(title);
      for (const n of names.split(' ')) {
        const t = resolveCommand(n, null, D);
        if (!t) continue;
        const it = document.createElement('div');
        it.className = 'wm-item';
        it.dataset.k = (n + ' ' + title).toLowerCase();
        const sym = document.createElement('span');
        sym.className = 'wm-sym';
        sym.innerHTML = this.renderer.katex(t.replace(/#\?/g, '\\square'), false).html;
        const code = document.createElement('code');
        code.textContent = (fn ? '' : '\\') + n;
        it.title = code.textContent + '  \u2192  ' + t.replace(/#\?/g, '\u25a1');
        it.append(sym, code);
        grid.appendChild(it);
      }
      sec.append(h, grid);
      sections.push(sec);
      list.appendChild(sec);
    }
    const filter = det.querySelector('.wm-filter');
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase().replace(/^\\/, '');
      for (const sec of sections) {
        let any = false;
        for (const it of sec.querySelectorAll('.wm-item')) { const ok = !q || it.dataset.k.includes(q); it.hidden = !ok; any = any || ok; }
        sec.hidden = !any;
      }
    });
  }

  toast(msg, ms = 3200, action) {
    const t = $('#toast');
    t.replaceChildren();
    const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = action.label;
      b.addEventListener('click', () => { t.hidden = true; action.fn(); });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.hidden = true; }, ms);
  }
}

function commonDir(names) {
  if (!names.length) return '';
  const parts = names.map((n) => n.split('/'));
  if (parts.some((p) => p.length < 2)) return '';
  const first = parts[0][0];
  return parts.every((p) => p[0] === first) ? first + '/' : '';
}
function stripTop(n) { const i = n.indexOf('/'); return i > 0 && n.split('/').length > 1 ? n.slice(i + 1) : n; }

Object.assign(App.prototype, collab);

const app = new App();
window.rikuy = app;
installCollab(app);
app.isBalanced = isBalanced;
app.init().catch((e) => { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Rikuy could not start: ' + e.message; });
