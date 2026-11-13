// Rikuy app shell: rebuild pipeline, history, input, popovers, files.
import { siInMath } from './siunitx.js';
import { buildModel } from './model.js';
import { Renderer, BLOCKS, esc, widgetCss } from './render.js';
import { Layout, geometry } from './layout.js';
import {
  posFromDom, CaretIndex, segOfSpan, atomOfEl, styOfEl, visibleRanges, escapeTeX, textToTeX,
  endsWithControlWord, isBalanced, diff, boundary, clusterEdge, sourceEdge, backspaceUnits
} from './editor.js';
import { SAMPLE } from './sample.js';
import { splitRows } from './parser.js';
import { installWordTyping, wordShortcuts, makeDialect, classifyMacros, resolveCommand, PACKAGES, WORD_GROUPS, FIELD_MACROS, fieldValue, modelValue } from './wordmath.js';
import { isTallDef, fitBrackets, tallTest } from './fences.js';
import { minimalRow, makeSame } from './minimal.js';
import { htmlToTeX, plainToTeX, unwrapMath } from './paste.js';
import { findProblems, missingFigures } from './problems.js';
import { WidgetLayer } from './widget.js';
import { APP, appInit, asset as appAsset, registerApp, takeLaunches, takeShared, warmTeX } from './pwa.js';

// Gray boxes of 320 by 240 points that stand in, in a coauthor's PDF, for figures a link does
// not carry: a PDF, a PNG whose resolution makes it that size, and EPS for latex with dvips.
const PLACEHOLDER_PDF = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMjAgMjQwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCA+PiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDUxID4+CnN0cmVhbQowLjg1IGcgMCAwIDMyMCAyNDAgcmUgZiAwLjYgRyAyIHcgMSAxIDMxOCAyMzggcmUgUwplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDIxOSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDUgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjMxOQolJUVPRgo=';
const PLACEHOLDER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAAAAACRn/EaAAAACXBIWXMAAAAjAAAAIwHV9BZdAAAADklEQVR42mO4CQQMcAIATFkKLSVMoyAAAAAASUVORK5CYII=';
const PLACEHOLDER_EPS = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 320 240\n0.85 setgray 0 0 320 240 rectfill\n0.6 setgray 2 setlinewidth 1 1 318 238 rectstroke\nshowpage\n';
import { texToPlain, shortAuthors, entryYear } from './bib.js';
import { kvGet, kvPut, kvDel, kvSwap, decodeText, encodeText, snapAdd, snapAll, snapFiles, snapDel, snapPrune } from './store.js';
import { changes, spacingOnly } from './diff.js';
import { TeXEngine, parseTeXLog } from './tex.js';
import { PdfView } from './pdfview.js';
import { collab, installCollab } from './collab.js';
import { word, installWord, isDocx } from './word.js';
import { ribbon } from './ribbon.js';
import { nav } from './nav.js';
import { review } from './review.js';
import { $, mk, mkBtn, store, load, PREFS, textSig, when } from './ui/dom.js';
// the command registry and everything drawn from it: the ribbon's tabs, the keys, the search box,
// the right click menu, the insert list (src/commands.js, src/cmd/*.js)
import { paletteItems, insertTextHooks, command, commands, describe, enabled, register, unregister, run as runCmd, joinMethods } from './commands.js';
import { methods as cmdMethods } from './cmd/index.js';
import { tabs, installRibbon } from './ribbon/tabs.js';
import { methods as galleryMethods } from './ui/gallery.js';
import { methods as searchMethods, installSearch } from './ui/search.js';
import { methods as menuMethods, installMenu } from './ui/menu.js';
import { installKeys } from './keys.js';
import * as kit from './ui/kit.js';
import { usePackages, hasPackage, usePackage, preambleEnd, stripComments, packages, docClass } from './preamble.js';
import { groupNames, enclosing, wrapEdits, unwrapEdits, mapPos } from './wrap.js';
import { LATEX_MARK, lineStart as lineAt } from './styles.js';
import { shareParam, texParam, commentOnly, cleanPath } from './share.js';
import { version as VERSION } from '../package.json';
import { savedToken, keepToken, dropReplaced, canonicalRemote, remoteHost, legacyChoice } from './gitauth.js';
import { scriptNeeds, scriptLines, addScriptSetup, scriptName, scriptSetup, MORE } from './scripts.js';

const PX_PER_PT = 96 / 72.27;
// Rikuy was called Galley at first; the keys of what a browser keeps keep that name, so
// nobody's documents or settings are lost
const STORE = 'galley.project.v1';
const ENGINE_LABEL = { pdflatex: 'pdfLaTeX', xelatex: 'XeLaTeX', lualatex: 'LuaLaTeX', latex: 'LaTeX (dvips)' };
// the TeX packs the last compile of a project read: {p: project, v: the tree's version, n: [packs]}
const TEXREAD = 'galley.texread.v1';
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
// how far the document zooms out and in: a quarter, and four times actual size
const ZOOM_MIN = 0.25, ZOOM_MAX = 4;

// One of the build's own files (git.js, tex/...): in the installed app, the copy of this page's
// version (src/pwa.js); elsewhere simply the file next to the page.
const asset = (p) => (__RIKUY_APP__ ? appAsset(p) : new URL(p, location.href).href);
// the full Rikuy's address, which the copy on claude.ai names for what it has no room for
const SCRIPT_HOST = typeof __RIKUY_WORD_HOST__ === 'undefined' ? '' : __RIKUY_WORD_HOST__;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    if (SRI[src]) { s.integrity = SRI[src]; s.crossOrigin = 'anonymous'; }
    // the installed app ships these libraries itself (lib/, the same npm files: build/app.mjs), so
    // it works offline and asks no CDN; the hash still has to match
    s.src = __RIKUY_APP__ && APP.on && SRI[src] ? asset('lib/' + src.slice(src.lastIndexOf('/') + 1)) : src;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src));
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
// What a formula's source has that would not stay inside the formula once written into the
// document: braces left open, closing braces with none before them, a backslash at the very end
// (it would take the formula's closing $ or brace as its name), a comment at the very end (it
// would hide the closing $). \{ and \} are characters; % starts a comment.
function mathScan(tex) {
  let open = 0, extra = 0, slash = false, comment = false;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') { if (i === tex.length - 1) slash = true; i++; continue; }
    if (ch === '%') { const nl = tex.indexOf('\n', i); if (nl < 0) { comment = true; break; } i = nl; continue; }
    if (ch === '{') open++;
    else if (ch === '}') { if (open) open--; else extra++; }
  }
  return { open, extra, slash, comment };
}
// Such a text is not written while it is typed: an unclosed { took the rest of the paragraph
// into the formula (the page showed it as red source), a } or a $ too many ends it early. This
// is the reason shown in the box, or ''.
function mathBreaksOut(tex, katexErr) {
  const s = mathScan(tex);
  if (s.extra) return 'A } has no { before it.';
  if (s.open) return 'A { is not closed.';
  if (/^Can't use function '\$'/.test(katexErr || '')) return 'A $ cannot stand inside a formula: write \\$ for the sign.';
  if (s.slash) return 'A \\ at the end needs a name after it, as in \\alpha.';
  if (s.comment) return 'A % makes the rest of its line a comment: write \\% for the sign.';
  return '';
}
// The same text made whole, with what was typed kept: a closing brace at the end for each one
// left open, an opening one at the start for each } that has none, a stray $ as the sign \$, a
// line end after a comment at the very end. A lone backslash at the end is dropped: nothing can
// follow it but the formula's own end. This is what a formula's box writes when it closes while
// its text is held back, so the text is not lost and undo has a step for it.
function mathMadeWhole(tex, katexErr) {
  const dollar = /^Can't use function '\$'/.test(katexErr || '');
  const s = mathScan(tex);
  let out = '';
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') { if (i < tex.length - 1) out += tex.slice(i, i + 2); i++; continue; }
    if (ch === '%') { const nl = tex.indexOf('\n', i); out += tex.slice(i, nl < 0 ? tex.length : nl); if (nl < 0) break; i = nl - 1; continue; }
    out += ch === '$' && dollar ? '\\$' : ch;
  }
  return '{'.repeat(s.extra) + out + (s.comment ? '\n' : '') + '}'.repeat(s.open);
}
// KaTeX's message for a mistake in a formula, in plain words where there are some ("Expected
// 'EOF', got '#' at position 3" says little to someone who has never seen TeX). KaTeX's own
// words stay as the tooltip of the line.
function plainMathError(msg, tex) {
  const m = String(msg || '');
  const hold = mathBreaksOut(tex || '', m);
  let x;
  if (hold) return hold;
  if ((x = /^Undefined control sequence: (\\\S+)/.exec(m))) return 'This command is not known: ' + x[1];
  if ((x = /^Expected group after '(.)'/.exec(m))) return 'Something is missing after ' + x[1] + '.';
  if ((x = /^Double (super|sub)script/.exec(m))) return 'Two ' + (x[1] === 'super' ? '^' : '_') + ' in a row: put the first in braces, as in {x^2}^3.';
  if (/expected '\}' at end of input/.test(m)) { x = (tex || '').match(/\\[A-Za-z]+/g); return 'Something is missing after ' + (x ? x[x.length - 1] : 'the last command') + '.'; }
  if (/expected '\]'/.test(m)) return 'A [ is not closed.';
  if (/^Expected '\\right'/.test(m)) return '\\left has no \\right to close it.';
  if (/^Expected 'EOF', got '\\right'/.test(m)) return '\\right has no \\left before it.';
  if (/^Expected 'EOF', got '\\end'/.test(m)) return '\\end has no \\begin before it.';
  if (/^Expected 'EOF', got '&'/.test(m)) return '& separates columns: it works in a matrix or in aligned rows.';
  if (/^Expected 'EOF', got '#'/.test(m)) return '# cannot stand here: write \\# for the sign.';
  if ((x = /^No such environment: (\S+)/.exec(m))) return 'This environment is not known: ' + x[1];
  if ((x = /^Mismatch: \\begin\{([^}]+)\} matched by \\end\{([^}]+)\}/.exec(m))) return '\\begin{' + x[1] + '} is closed by \\end{' + x[2] + '}: the two names must be the same.';
  if (/^Expected & or/.test(m)) return 'A \\begin{…} is not closed by its \\end{…}.';
  return m;
}
// What the insert list (\ or Ctrl+K) offers comes from the command registry (src/commands.js,
// each command's palette field; src/cmd/*.js), in the list's own order.
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
    // A first visit shows the page alone: the source pane, open by default on a wide screen,
    // put a wall of LaTeX beside the page for someone who has never seen any. zoom stays 'fit'
    // or a number, the two the version before this one reads (it multiplies anything else, and
    // after a rollback the page would have no size); what 'fit' fits on a phone is in `phone`.
    const kept = load(PREFS);
    this.newPrefs = !kept;
    this.prefs = Object.assign({ zoom: 'fit', source: false, style: 'Plain, direct academic prose. No em dashes. No filler, no hedging.' }, kept || {});
    if (typeof this.prefs.zoom !== 'number') this.prefs.zoom = 'fit';
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
    this.scriptsSoon = debounce(() => this.scriptNotice(), 500);
    this.caps = { sample: null, downloads: null };
    // settled when init is through: the document is on the page (rikuy.api.whenReady)
    this.ready = new Promise((yes, no) => { this.readyDone = yes; this.readyFail = no; });
    this.ready.catch(() => { /* said on the page */ });
  }

  async init() {
    let saved = null;
    try { saved = await kvGet('project'); } catch (e) { saved = null; this.noIdb = true; }
    this.savedT = saved ? saved.t : null; // the copy in IndexedDB this tab last read or wrote
    const ls = load(STORE);
    if (ls && ls.files && (!saved || (ls.t || 0) > (saved.t || 0))) saved = ls; // a session that could not use IndexedDB
    if (this.newPrefs) {
      // someone who was here before the first visit changed (a project kept, no settings ever
      // written) keeps the source pane a wide screen gave them; a newcomer's choice is written
      // now, so the next visit is no first visit
      if (saved && saved.files && saved.files.length && window.innerWidth > 1100) this.prefs.source = true;
      store(PREFS, this.prefs);
    }
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
    // the installed app (hosted build only): its service worker, updates, the offline marks
    if (__RIKUY_APP__ && appInit().on) registerApp(this);
    await this.waitForKaTeX();
    // (the hosted page's fonts are files, asked for from its head: on a slow line they can come
    // seconds after the page, and a layout made before them would only be made again)
    await Promise.race([this.loadFonts(), new Promise((r) => setTimeout(r, __RIKUY_APP__ && APP.on ? 20000 : 2500))]);
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
    // (#tex=...: the same with plain LaTeX in it, for whoever builds a link without compressing)
    const shared = shareParam(location.hash), tex = shared ? null : texParam(location.hash);
    if (shared || tex != null) {
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* framed */ }
      if (shared) await this.openSharedLink(shared); else await this.openTexLink(tex);
    }
    // someone a document was shared with sees the page; the source is one click away
    if (this.prefs.source && !document.body.classList.contains('guest')) this.toggleSource(true);
    if (this.prefs.nav && window.innerWidth > 860) this.toggleNav(true);
    if (this.prefs.pdf && window.innerWidth > 860) this.togglePdf(true);
    setTimeout(() => this.ensureMathLive(), 2500);
    this.placeInitialCaret();
    this.readyDone();
    // files the system handed the installed app: opened with Rikuy, or shared to it
    if (__RIKUY_APP__ && APP.on) { await takeShared(this); takeLaunches(this); }
    // TeX fetched and started ahead of the first press of Preview, where the line allows it
    if (__RIKUY_APP__ && APP.on) warmTeX(this);
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
    // the interface's faces as well: they are in the page, or asked for from its head (the hosted
    // page: build.mjs's FIRST_FONTS is this list), so they cost no time, and any face
    // that finishes loading after boot lays the pages out again (the loadingdone listener in
    // init), which drops a selection; a weight first used by a toast or the selection bubble did
    const faces = ['400 16px "Paper Modern Serif"', 'italic 400 16px "Paper Modern Serif"', 'bold 16px "Paper Modern Serif"', 'italic bold 16px "Paper Modern Serif"', '16px "Paper Modern Typewriter"', '16px KaTeX_Main', 'italic 16px KaTeX_Math', '16px KaTeX_Size1', '16px KaTeX_Size2', '16px KaTeX_AMS',
      '400 13px "IBM Plex Sans"', '500 13px "IBM Plex Sans"', '600 13px "IBM Plex Sans"', '400 13px "IBM Plex Mono"', '500 13px "IBM Plex Mono"'];
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
    const z = this.prefs.zoom;
    // On a phone the whole sheet across the screen leaves the text about 6px high. Until a zoom
    // is chosen, the text block fills the width there and the margins are off to the sides:
    // half as large again, and a line is read without moving the page.
    // (prefs.phone: 'sheet' once the whole sheet was chosen with the zoom button there)
    this.textFit = z === 'fit' && this.prefs.phone !== 'sheet' && window.innerWidth <= 520;
    if (this.textFit) px = Math.min(PX_PER_PT * 1.25, Math.max(avail / P.pw, (this.desk.clientWidth - 12) / P.tw));
    else if (z === 'fit') px = Math.min(PX_PER_PT * 1.25, avail / P.pw);
    else px = PX_PER_PT * z;
    px = Math.round(px * 1000) / 1000;
    const changed = px !== this.px;
    this.px = px;
    $('#zoomv').textContent = this.textFit ? Math.round(px / PX_PER_PT * 100) + '%' : z === 'fit' ? 'Fit' : Math.round(z * 100) + '%';
    // (its name stays "Fit width", what a press does; the zoom it shows is its description)
    $('#zoomv').setAttribute('aria-description', 'Zoom: ' + $('#zoomv').textContent);
    // with the text block as wide as the screen, the view starts at the text, not at the margin
    if (this.textFit && changed) requestAnimationFrame(() => { if (this.textFit) this.desk.scrollLeft = Math.max(0, P.ml * px - 6); });
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
    const optSig = JSON.stringify([O.pt, O.lang, O.font, O.citeStyle, O.parskip, O.cleveref, O.spread, !!O.rtl]);
    if (macroChanged || optSig !== this.optSig || this.forceRender) { this.prefix = 'r' + (++this.renderVer) + '|'; this.optSig = optSig; this.forceRender = false; }
    this.renderer.sync(model, this.prefix);
    this.layoutPass();
    if (caret) this.restoreCaret(caret);
    // the edit took the last text off the page: the caret goes to the blank paragraph that
    // stands in for it (it was left nowhere, and the next keystroke did nothing)
    if (caret && this.ghost && this.ghost.sticky && document.activeElement === this.root && caret.f === this.ghost.f && caret.p >= this.ghost.pos) this.caretToGhost();
    this.status(performance.now() - t0);
  }

  layoutPass(force) {
    const model = this.model;
    const items = [], fns = [];
    for (const B of this.renderer.blocks) { for (const it of B.items) items.push(it); for (const f of B.fns) fns.push(f); }
    const g = geometry(model.opts);
    // (whose fonts draw the Chinese characters is part of it: other fonts, other widths)
    const cjk = this.cjkOrder();
    const gsig = JSON.stringify(g) + '|' + this.px + '|' + model.opts.spread + '|' + model.opts.parindent + '|' + model.opts.pt + '|' + model.opts.font + '|' + cjk;
    if (gsig !== this.gsig || force) {
      this.gsig = gsig;
      if (cjk) document.documentElement.dataset.cjk = cjk; else delete document.documentElement.dataset.cjk;
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
    // (what Find found, marked again on the pages as they are now: src/cmd/find.js)
    this.findSoon();
    this.emptyGhost();
    this.widgets.place();
  }

  // Chinese characters are shared by Chinese, Japanese and Korean, whose fonts draw them each
  // their own way, and a character does not say whose it is. The document does, as scripts.js
  // tells the three apart: kana make it Japanese ('ja'), hangul Korean ('ko'), and with neither
  // a set up for one of the two languages; else '' and the Chinese fonts come first as before.
  // Looked at with every build of the page, so by a pattern's one pass over each file.
  cjkOrder() {
    const ja = MORE.find((x) => x[0] === 'japanese')[2], ko = MORE.find((x) => x[0] === 'korean')[2];
    let j = 0, k = 0, han = false;
    const texts = [];
    for (const [n, t] of this.files) {
      if (n !== this.main && !/\.tex$/i.test(n)) continue;
      texts.push(t);
      if (!j && ja.test(t)) j = 1;
      if (!k && ko.test(t)) k = 1;
      if (!han && /[\u3400-\u9FFF]/.test(t)) han = true;
    }
    if (j && k) {
      // both: the one the text has more of
      const count = (re) => texts.reduce((sum, t) => sum + (t.match(new RegExp(re.source, 'g')) || []).length, 0);
      j = count(ja); k = count(ko);
    } else if (!j && !k && han) {
      const have = scriptSetup(this.src(this.main));
      j = have.japanese ? 1 : 0; k = have.korean ? 1 : 0;
    }
    return j && j >= k ? 'ja' : k ? 'ko' : '';
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
    // a title block does not count: its text is \title's, and below it there is still nowhere
    // to put a first paragraph
    for (const t of this.root.querySelectorAll('span.t')) if (!t.closest('.it.ttl')) return;
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
    // (a document whose main language runs right to left starts at the right)
    if (this.model.opts.rtl) g.dir = 'rtl';
    g.appendChild(mk('span', 't gh', '\u200B'));
    flow.appendChild(g);
    this.ghost = { el: g, f, pos, sticky: true };
  }
  // a picture dropped on the text goes where it was dropped: the caret moves to that spot
  caretAtPoint(x, y) {
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (r && this.root.contains(r.startContainer) && posFromDom(r.startContainer, r.startOffset, this.root)) getSelection().collapse(r.startContainer, r.startOffset);
  }
  caretToGhost() {
    this.root.focus({ preventScroll: true });
    getSelection().collapse(this.ghost.el.firstChild.firstChild, 1);
  }

  relayout(force) {
    if (!this.model) return;
    const c = this.caretNow();
    this.layoutPass(force);
    // (a selection stays one: a relayout, for the window's width or fonts that came, put it back as
    // a caret at its start, and the status bar's "3 of 12 words" went back to "12 words")
    if (c && document.activeElement === this.root) this.restoreCaret(c.collapsed || c.crossFile ? c : { ...c, selA: c.a, selB: c.b }, true);
    // With a ribbon button or its menu holding the focus the page keeps its selection, for the
    // button to act on; the pass's new nodes left it at a page's start. It goes back where it was,
    // the focus left where it is (Select sentence from Home's Select menu selected nothing).
    else if (c && !c.crossFile && document.activeElement && document.activeElement.closest('#ribbon, .pop') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      const x = this.index.find(c.f, c.collapsed ? c.p : c.a, c.collapsed ? -1 : 1), y = c.collapsed ? x : this.index.find(c.f, c.b, -1);
      if (x && x.node && y && y.node) {
        getSelection().setBaseAndExtent(x.node, x.offset, y.node, y.offset);
        if (this.rbRange) this.rbRange = getSelection().getRangeAt(0).cloneRange();
      }
    }
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
    // (page x of y and the words, of the selection too: src/cmd/find.js)
    this.countStatus(pages, m.words);
    this.problemsSoon();
    this.scriptsSoon();
    $('#docname').textContent = this.name;
    this.lastMs = ms;
    this.updateFileTabs();
    this.ribbonSoon();
  }

  // ---- Chinese, Arabic and India's scripts ---------------------------------------
  // LaTeX's own fonts have none of these scripts: a document with such text and no set up for it
  // (src/scripts.js knows which) fails in the PDF or loses the characters. A slim bar under the
  // ribbon says so and offers the lines; nothing is added to the source without the click on its
  // button. The bar is looked at a moment after the page was built again, not at every key, never
  // while an input method is composing, and not in a copy someone shared, whose set up is its
  // author's.

  // What the open project's text needs and its main file does not set up: [] or some of
  // 'chinese', 'arabic' and India's scripts (scriptNeeds), or null where no set up can be
  // offered now.
  // (guestToo: what a shared copy needs, which rikuy.api.needs() says; the notice is its author's)
  scriptNeedsNow(guestToo) {
    if (this.stale || !this.files.has(this.main) || (!guestToo && document.body.classList.contains('guest'))) return null;
    const texts = [];
    for (const [n, t] of this.files) if (n === this.main || /\.tex$/i.test(n)) texts.push(t);
    const main = this.src(this.main);
    // (a project with no Chinese or Arabic character costs one look at each file)
    const needs = scriptNeeds(main, texts);
    // no \begin{document} to put the lines before: nothing to offer
    return needs.length && addScriptSetup(main, needs) != null ? needs : [];
  }

  async scriptNotice() {
    const bar = $('#script-note');
    if (!bar) return;
    const key = this.name + '|' + this.main;
    // project -> the needs its notice was dismissed for ('': not dismissed), kept with the
    // project's other marks in this browser
    this.scriptSeen = this.scriptSeen || new Map();
    if (!this.scriptSeen.has(key)) {
      let v = null;
      try { v = this.noIdb ? null : await kvGet('scripts:' + key); } catch (e) { v = null; }
      if (!this.scriptSeen.has(key)) this.scriptSeen.set(key, v && typeof v.dismissed === 'string' ? v.dismissed : '');
    }
    // (the store answered later: an input method may be composing now, or another project be open)
    if (this.composing || key !== this.name + '|' + this.main) { this.scriptsSoon(); return; }
    const needs = this.scriptNeedsNow();
    if (!needs) { bar.hidden = true; return; }
    const sig = needs.join(',');
    // dismissed for other needs than the document has now: that answer no longer holds
    if (this.scriptSeen.get(key) && this.scriptSeen.get(key) !== sig) {
      this.scriptSeen.set(key, '');
      if (!this.noIdb) kvDel('scripts:' + key).catch(() => {});
    }
    const show = !!sig && this.scriptSeen.get(key) !== sig;
    if (show && bar.dataset.needs !== sig) {
      // the scripts by the names people call them, in the order scriptNeeds gives them:
      // "Devanagari", "Chinese and Arabic", "Chinese, Tamil and Bengali"
      const names = needs.map(scriptName);
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      $('#script-msg').textContent = 'This document has ' + list + ' text. LaTeX needs ' + (names.length > 1 ? 'fonts' : 'a font') +
        (needs.includes('arabic') || needs.includes('hebrew') ? ' and right to left setup' : '') + ' for it.';
      bar.dataset.needs = sig;
    }
    if (bar.hidden === show) bar.hidden = !show;
  }

  // The bar's button: the lines go into the main file's preamble as one edit, so one undo takes
  // them out again, and the source pane, the versions and the PDF see them as any other edit.
  scriptSetUp() {
    if (this.srcRebuild.pending()) this.srcRebuild.flush();
    $('#script-note').hidden = true;
    const needs = this.scriptNeedsNow();
    const main = this.src(this.main);
    const next = needs && needs.length ? addScriptSetup(main, needs) : null;
    const d = next == null ? null : diff(main, next);
    if (!d) return null;
    // The engine the lines lead to, read from the lines themselves: ctex alone is XeLaTeX's,
    // anything of babel's (bidi, a script set by its characters) is LuaLaTeX's (pickEngine in
    // tex/engine.js reads the same lines).
    const lines = scriptLines(needs, main);
    const engine = lines.some((l) => /\\usepackage\b[^{]*\{ctex\}/.test(l)) && !lines.some((l) => /\\babel(provide|font)\b|\{babel\}/.test(l)) ? 'xelatex' : 'lualatex';
    const c = this.caretNow();
    const caret = c && c.f != null && !c.ghost ? { f: c.f, p: c.f === this.main && c.p >= d.s + d.del.length ? c.p + d.ins.length - d.del.length : c.p } : null;
    this.closeGroup();
    this.commit([{ f: this.main, s: d.s, e: d.s + d.del.length, t: d.ins }], caret, 'setup');
    this.closeGroup();
    const chosen = this.engineChoice();
    this.toast(chosen === 'auto' || chosen === engine ? 'Added. The PDF is now made with ' + ENGINE_LABEL[engine] + '.'
      : 'Added. The PDF needs ' + ENGINE_LABEL[engine] + ': set the engine to Auto in the preview.', 6000);
    return engine;
  }

  // Hidden for this project until what it needs changes
  scriptDismiss() {
    const bar = $('#script-note'), key = this.name + '|' + this.main, sig = bar.dataset.needs || '';
    bar.hidden = true;
    (this.scriptSeen = this.scriptSeen || new Map()).set(key, sig);
    if (!this.noIdb) kvPut('scripts:' + key, { dismissed: sig, t: Date.now() }).catch(() => {});
  }

  // ---- caret ------------------------------------------------------------------
  caretNow() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!this.root.contains(r.startContainer)) return null;
    // (first: the blank paragraph may be standing for a place inside a link, see restoreCaret)
    if (this.pending && r.collapsed && this.pending.node === r.startContainer && this.pending.offset === r.startOffset) {
      return { f: this.pending.f, p: this.pending.p, a: this.pending.p, b: this.pending.p, collapsed: true };
    }
    if (this.ghost && this.ghost.el.contains(r.startContainer)) return { ghost: true, f: this.ghost.f, p: this.ghost.pos };
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
    if (!r || !r.node) {
      // No text on the page to hold the caret, and the place is inside what the page does show
      // (a document that so far is one link: between its braces). The blank paragraph holds the
      // caret and stands for that place, so what is typed goes there, not after the link.
      if (this.ghost && this.ghost.sticky && c.f === this.ghost.f && c.p < this.ghost.pos) {
        this.caretToGhost();
        this.pending = { f: c.f, p: c.p, node: this.ghost.el.firstChild.firstChild, offset: 1 };
      }
      return;
    }
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
    if (this.stale && !/^(restore|reject|merge|other-tab|api)$/.test(kind || '')) { this.toast('The page cannot show the document as it is now. Edit the source, or undo.'); return; }
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
    D.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); document.body.classList.remove('dropping'); this.caretAtPoint(e.clientX, e.clientY); this.openFiles([...e.dataTransfer.files]); } });
    D.addEventListener('scroll', () => { if (this.pop) this.positionPop(); this.hideBubble(); }, { passive: true });

    $('#b-open').addEventListener('click', () => $('#fileinput').click());
    $('#fileinput').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) this.openFiles(fs); });
    // (b-save is the ribbon's LaTeX download: src/ribbon.js answers its click)
    $('#b-copy').addEventListener('click', () => this.copySource());
    $('#b-share').addEventListener('click', () => this.openSharePanel());
    $('#guest-send').addEventListener('click', () => this.openSharePanel());
    $('#guest-x').addEventListener('click', () => { $('#guest').hidden = true; document.body.classList.remove('guest'); if (this.shareCtx) { this.shareCtx.dismissed = true; kvPut('share:' + this.name + '|' + this.main, this.shareCtx).catch(() => {}); } this.scriptsSoon(); });
    $('#script-go').addEventListener('click', () => this.scriptSetUp());
    $('#script-x').addEventListener('click', () => this.scriptDismiss());
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
    this.zoomGestures();
    $('#b-ai').addEventListener('click', () => this.openAsk());
    $('#b-help').addEventListener('click', () => this.openHelp());
    $('#b-sample').addEventListener('click', () => this.resetToSample());
    $('#b-new').addEventListener('click', () => this.newDocument());
    $('#st-warn').addEventListener('click', () => this.toggleNav(true, 'problems'));
    $('#b-nav').addEventListener('click', () => this.toggleNav());
    $('#nav-close').addEventListener('click', () => this.toggleNav(false));
    // Where the bar shows icons alone (a phone hides Help and the zoom steps too), the menu
    // panel lists each of its actions by name: the bar's own buttons, pressed from here.
    // The three downloads come first: on a phone the ribbon's end, where they are, is a swipe away.
    for (const id of ['rb-pdf', 'rb-word', 'b-save', 'b-open', 'b-pdf', 'b-copy', 'b-share', 'b-undo', 'b-redo', 'b-zout', 'zoomv', 'b-zin', 'b-src', 'b-help']) {
      const b = $('#' + id), a = mk('button', 'nav-act');
      a.type = 'button'; a.dataset.for = id;
      // (a menu item under the button's own name: the bar's button of that name is still there)
      a.setAttribute('role', 'menuitem');
      a.setAttribute('aria-label', b.getAttribute('aria-label'));
      const svg = b.querySelector('svg'), lab = b.querySelector('span');
      if (svg) a.appendChild(svg.cloneNode(true));
      a.appendChild(mk('span', '', (b.closest('.rb-dl') ? 'Download ' : '') + (lab ? lab.textContent : '')));
      // the zoom steps leave the panel open, to press again
      a.addEventListener('click', () => { if (!/^b-z/.test(id)) this.toggleNav(false); b.click(); if (/^b-z|zoomv/.test(id)) this.navActs(); });
      $('#nav-acts').appendChild(a);
    }
    this.menuKeys($('#nav-acts'));
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
    // Ctrl and + / - / 0 zoom the document where the document is what is being read: on the
    // page, or with nothing in particular in focus. In a field, the source or the PDF the
    // browser zooms as it always does.
    if (mod && !e.altKey && /^(=|\+|-|_|0)$/.test(e.key) && !e.defaultPrevented
      && (e.target === document.body || e.target === this.root || (e.target.closest && e.target.closest('#desk') && !e.target.closest('input, textarea, select, math-field, [contenteditable="true"]:not(#pages)')))) {
      e.preventDefault();
      if (e.key === '0') this.zoomTo(1, null);
      else this.setZoom(e.key === '-' || e.key === '_' ? -1 : +1);
    }
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
      // (Ctrl+B, I, U, M, K and Shift+E are the commands' keys: src/keys.js catches them first)
      if (k === 'enter') { e.preventDefault(); this.tableRow(); return; }
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
      // (a LaTeX paragraph's mark goes too: the paragraph it marked joins the one before, as text)
      const mark = (l) => /^[ \t]*%[ \t]*rikuy:[ \t]*latex[ \t]*\r?$/.test(l);
      const kept = lines.filter((l, i) => i === 0 || (i === lines.length - 1 ? !mark(l) : l.trim() !== '' && !mark(l)));
      return [{ f, s: a, e: b, t: kept.join('\n') }];
    }
    if (isBalanced(src, a, b) && !/\\(begin|end)\s*\{(document)\}/.test(slice) && !/\\(section|subsection|subsubsection|chapter|part|maketitle|item|bibliography)\b/.test(slice)) {
      return [{ f, s: a, e: b, t: '' }];
    }
    const vr = visibleRanges(this.renderer.blocks, f, a, b);
    return vr.map(([s, e]) => ({ f, s, e, t: '' }));
  }

  // Everything on the page is selected: what is typed, pasted or deleted then replaces the
  // document's body, as New document would, and the preamble stays. Taking only the visible
  // characters, as for any other selection, left every heading, list, theorem and table
  // standing empty with no way to remove them. Only Select all counts (allSel: the range
  // selectAllText made and still the selection), or a selection that holds the whole page, as
  // a phone's own Select all makes: one drawn from the first word to the last can leave a
  // picture, an equation, a listing or an \input outside it, and those must stay. The body is
  // the one the parser found: with no \begin{document}, or no \end{document} to close it,
  // there is none to replace, and the selection is deleted as any other.
  wholeDoc() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !this.root.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0), A = this.allSel;
    if (!(A && r.startContainer === A.sc && r.startOffset === A.so && r.endContainer === A.ec && r.endOffset === A.eo)) {
      const all = document.createRange();
      all.selectNodeContents(this.root);
      if (r.compareBoundaryPoints(Range.START_TO_START, all) > 0 || r.compareBoundaryPoints(Range.END_TO_END, all) < 0) return null;
    }
    const d = this.model && !this.stale && this.model.main === this.main ? this.model.docBody : null;
    return d && d.closed ? { s: d.s, e: d.e } : null;
  }
  // one edit, so one undo step brings the whole document back as it was
  replaceBody(w, tex, kind) {
    const pad = '\n\n';
    this.commit([{ f: this.main, s: w.s, e: w.e, t: tex ? pad + tex + pad : pad }], { f: this.main, p: w.s + pad.length + tex.length, bias: -1 }, kind);
  }

  insertText(data, range) {
    if (!data) return;
    const whole = range ? null : this.wholeDoc();
    if (whole) { this.replaceBody(whole, escapeTeX(data, ' '), 'replace'); return; }
    const c = this.caretNow();
    if (!c) return;
    // in a LaTeX paragraph, or a line or a paragraph to come in LaTeX, what is typed is the source
    const T = c.ghost ? null : this.texHere();
    if (T && c.f === T.f) { const r = range && range.f === T.f ? range : c; this.texEdit(T, r.a, r.b, data, c.collapsed && !range ? 'type' : 'replace'); return; }
    const raw = c.ghost && this.ghostRaw();
    // What typing passes through (AutoCorrect's place): a hook may write it itself or change it.
    // Not in a LaTeX paragraph or a line to come in one (above and here): typed there is source.
    if (!raw && !(!c.ghost && this.texAt(c.f, c.a))) {
      for (const h of insertTextHooks) {
        const r = h(this, data, range);
        if (r === true) return;
        if (typeof r === 'string') data = r;
      }
      if (!data) return;
    }
    // in a blank paragraph too (a new document, the line after Enter): there they were typed
    // as the characters, though that is where an equation or a heading most often starts
    if (data === '$' && !range && !raw && (c.collapsed || c.ghost)) { this.newMath(); return; }
    if (data === '\\' && !range && !raw && (c.collapsed || c.ghost)) { this.openPalette(); return; }
    if (c.ghost) { this.ghostInsert(raw ? data : escapeTeX(data, ' ')); return; }
    const f = range ? range.f : c.f;
    let a = range ? range.a : c.a, b = range ? range.b : c.b;
    const edits = this.deletionEdits(f, a, b);
    let at = a;
    // If deletion collapsed to visible ranges, insertion goes where the first visible char was
    if (edits.length && edits[0].s > a && edits.length > 0 && edits[0].t === '') at = edits[0].s;
    const t = this.escapeAt(f, at, data);
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

  // Text typed, or written by Replace, at p of file f as the source takes it there. A selection
  // from a paragraph into a LaTeX paragraph or back: the text is written as the place it lands in
  // takes it, as source in the box, escaped in the text; {} after a control word, a bracket kept
  // from being read as the optional argument of the command before it.
  escapeAt(f, at, data) {
    const src = this.src(f), lands = this.texAt(f, at);
    let t = lands ? data : escapeTeX(data, src[at - 1] || ' ');
    if (!lands && /^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
    if (!lands && /^[[*]/.test(t) && grabsBracket(src, at, t[0])) t = '{' + t[0] + '}' + t.slice(1);
    return t;
  }

  deleteInput(type, ranges) {
    const c = this.caretNow();
    if (c && c.ghost) {
      // the spaces typed so far in a line or a paragraph to come in LaTeX go one by one
      if (/Backward/.test(type) && this.ghost.pend) { this.ghost.pend = this.ghost.pend.slice(0, -1); this.paintGhost(); return; }
      if (/Backward/.test(type) && !this.ghost.sticky) { const g = this.ghost; this.removeGhost(); this.restoreCaret({ f: g.f, p: g.pos, bias: g.tex === 'before' ? 1 : -1 }); }
      return;
    }
    const whole = this.wholeDoc();
    if (whole) { this.replaceBody(whole, '', 'del'); return; }
    if (!c) return;
    const T = this.texHere();
    if (T && c.f === T.f && this.texDelete(T, c, type, ranges)) return;
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
        // A heading whose words were all deleted: the next Backspace or Delete takes the heading
        // itself. It stayed as a number with nothing after it, and only the source could remove it.
        if (ph.closest('.it.h')) {
          // the command is looked for just before the caret, not through the whole file: a long
          // document from someone else must not make a keystroke slow
          const src = this.src(c.f), from = Math.max(0, c.a - 400);
          const open = /\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\*?\s*(?:\[[^\]]*\]\s*)?\{\s*$/.exec(src.slice(from, c.a));
          const close = /^\s*\}/.exec(src.slice(c.a, c.a + 400));
          if (open && close) {
            this.commit([{ f: c.f, s: from + open.index, e: c.a + close[0].length, t: '' }], { f: c.f, p: from + open.index, bias: -1 }, 'del');
            return;
          }
        }
      }
      const tr = ranges && ranges[0];
      let r = tr ? this.rangeToSrc(tr) : null;
      if (r && r.a === r.b) r = null;
      // A character made of several code points (क्षि: a consonant, a virama, a consonant, a
      // vowel sign). Backspace takes the code point before the caret, as the browser's own
      // Backspace does and writers of India's scripts expect: the vowel sign, then the letter,
      // then the virama. The browser names the whole character as the range, also when the
      // caret stands inside it (after a virama the next letter has joined). Delete takes the
      // whole character after the caret, as natively, or what is left of the one the caret is
      // in. Only where the page shows the source's own characters: a letter written as a
      // command (\'e) goes whole.
      if (r && r.f === c.f && tr.startContainer === tr.endContainer && tr.startContainer.nodeType === 3) {
        const text = this.src(r.f), node = tr.startContainer, sel = getSelection();
        if (type === 'deleteContentBackward' && r.a < c.a && c.a <= r.b && r.b - r.a > 1 && node.data.slice(tr.startOffset, tr.endOffset) === text.slice(r.a, r.b)) {
          r = { f: r.f, a: c.a - backspaceUnits(text.slice(r.a, c.a)), b: c.a };
        } else if (type === 'deleteContentForward' && r.a > c.a && sel.anchorNode === node && sel.anchorOffset < tr.startOffset &&
          node.data.slice(sel.anchorOffset, tr.startOffset) === text.slice(c.a, r.a) && clusterEdge(text, c.a, 1) === r.a) {
          r = { f: r.f, a: c.a, b: r.a };
        }
      }
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
    if (c.ghost) { if (this.ghost.tex) this.texGhostEnter(); return; }
    const T = this.texHere();
    if (T && c.f === T.f) { this.texEnter(T, c); return; }
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
    if (kind === 'cell' || kind === 'cap') return;
    const itemEl = el.closest('.it');
    if (kind === 'ttl') {
      // Enter in the title, an author or the date starts the text below them, after \maketitle
      // (it did nothing, so a document with a title alone had no way to its first paragraph)
      const B = itemEl && BLOCKS.get(+itemEl.dataset.b);
      if (B) this.showGhost(itemEl, B.f, B.e);
      return;
    }
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

  // o.before: the blank paragraph goes before el (the text it stands for goes in at pos, before
  // what is there); o.style: 'latex' or 'quote', which its first character will be written in
  showGhost(afterEl, f, pos, o = {}) {
    this.removeGhost();
    const g = document.createElement('div');
    g.className = 'it p ghostp' + (afterEl.classList.contains('ind') || afterEl.classList.contains('p') || afterEl.classList.contains('tex') ? ' ind' : '') + (o.style === 'latex' ? ' tex' : o.style === 'quote' ? ' quote' : '');
    g.dataset.ctx = 'p';
    // the new paragraph runs the way the one above it does
    if (afterEl.dir === 'rtl' || afterEl.dir === 'ltr') g.dir = afterEl.dir;
    const s = document.createElement('span');
    s.className = 't gh';
    s.textContent = '\u200B';
    g.appendChild(s);
    if (o.before) afterEl.before(g); else afterEl.after(g);
    this.ghost = { el: g, f, pos, before: !!o.before, style: o.style || null, pend: '' };
    const sel = getSelection();
    this.ourSel = true;
    sel.collapse(s.firstChild, 1);
    this.scrollToCaret();
  }
  removeGhost() { if (this.ghost) { const g = this.ghost; this.ghost = null; g.el.remove(); if (g.restore) g.restore(); } }
  // what is typed in the blank paragraph or line is LaTeX source, written as it is
  ghostRaw() { return !!this.ghost && (!!this.ghost.tex || this.ghost.style === 'latex'); }
  ghostInsert(tex) {
    const g = this.ghost;
    if (g.tex) { this.texGhostInsert(tex); return; }
    // Spaces alone after the mark would make a blank line, which marks nothing: they wait in
    // the blank paragraph for the first character that is not one
    if (g.style === 'latex') {
      // (a line break at either end of what is pasted would be a blank line after the mark, or
      // after the paragraph's last line: one that marks nothing, or one that splits it)
      tex = (g.pend + tex).replace(/^[ \t]*(?:\r?\n[ \t]*)+/, '').replace(/(?:[ \t]*\r?\n)+[ \t]*$/, '');
      if (!tex.trim()) { g.pend = (g.pend + tex).replace(/[^ \t]/g, ''); this.paintGhost(); return; }
    }
    const open = g.style === 'latex' ? LATEX_MARK + '\n' : g.style === 'quote' ? '\\begin{quote}\n' : '';
    const close = g.style === 'quote' ? '\n\\end{quote}' : '';
    const src = this.src(g.f);
    // comment lines right under the paragraph belong to it (a review comment is about the line
    // above it): the new paragraph goes after them (not for one before a block: those are its own)
    // (a LaTeX paragraph's mark is no comment on the line above: the skip stops before it)
    const cm = /^[ \t]*(?:%(?![ \t]*rikuy:[ \t]*latex[ \t]*\r?(?:\n|$))[^\n]*)?(?:\r?\n[ \t]*%(?![ \t]*rikuy:[ \t]*latex[ \t]*\r?(?:\n|$))[^\n]*)*/.exec(src.slice(g.pos));
    if (!g.before && cm[0].includes('%')) g.pos += cm[0].length;
    let nlB = 0; for (let k = g.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
    let nlA = 0; for (let k = g.pos; k < src.length && /\s/.test(src[k]); k++) if (src[k] === '\n') nlA++;
    // no blank lines at the very start or end of a file: there is no paragraph to keep apart
    const pre = g.pos === 0 ? '' : '\n'.repeat(Math.max(0, 2 - nlB));
    const post = g.pos >= src.length ? '' : '\n'.repeat(Math.max(0, 2 - nlA));
    this.removeGhost();
    this.commit([{ f: g.f, s: g.pos, e: g.pos, t: pre + open + tex + close + post }], { f: g.f, p: g.pos + pre.length + open.length + tex.length, bias: -1 }, 'type');
  }

  // ---- LaTeX paragraphs (src/styles.js) ----------------------------------------------
  // A LaTeX paragraph's box on the page is its source, character for character: what is typed,
  // pasted or deleted there is written as it is, never escaped. What needs care is the blank
  // line: TeX ends a paragraph there, and with it the mark's reach, so what came after it would
  // leave the box and be typeset. A line left empty is therefore never written: Enter where it
  // would leave one, or a deletion that empties a line, shows a line to come (a ghost, as the
  // blank paragraph after Enter is) that the next character typed fills. A second Enter on it
  // is a blank line asked for: at the box's end or start it leaves the box for a paragraph of
  // text, in its middle it ends the paragraph there and starts a second LaTeX one with the rest.

  // the LaTeX paragraph a node of the page is in: its block, where its source runs (is, ie),
  // where its mark's line starts (ms), whether it is one paragraph of text without the mark
  texBox(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const it = el && el.closest ? el.closest('.it.tex:not(.ghostp)') : null;
    const B = it && BLOCKS.get(+it.dataset.b);
    if (!B || !B.tex || !this.root.contains(it)) return null;
    const b = B.base, T = B.tex;
    return { it, B, f: B.f, is: T.is + b, ie: T.ie + b, ms: lineAt(this.src(B.f), b), para: T.para, nest: T.nest.map(([s, e]) => [s + b, e + b]) };
  }
  // whether source position p of file f is in the source of a LaTeX paragraph on the page
  texAt(f, p) {
    for (const B of this.renderer.blocks) if (B.tex && B.f === f && B.tex.is + B.base <= p && p <= B.tex.ie + B.base) return true;
    return false;
  }
  // the one the caret, and all of the selection, is in
  texHere() {
    const s = getSelection();
    if (!s.rangeCount || (this.ghost && this.ghost.el.contains(s.anchorNode))) return null;
    const a = this.texBox(s.anchorNode);
    if (!a || s.isCollapsed) return a;
    const z = this.texBox(s.focusNode);
    return z && z.B === a.B ? a : null;
  }

  // [a, b) of the paragraph's source becomes t
  texEdit(T, a, b, t, kind) {
    const f = T.f, src = this.src(f);
    a = Math.max(T.is, Math.min(a, T.ie)); b = Math.max(a, Math.min(b, T.ie));
    const nested = T.nest.some(([x, y]) => x < a && b < y);
    // A line break at an end of what is written there, beside nothing but spaces on that side of
    // the line (or the paragraph's own start or end), would be a blank line: it goes. Blank lines
    // inside what is pasted stay: they were meant.
    if (!nested && /\n/.test(t)) {
      const left = src.slice(Math.max(T.is, src.lastIndexOf('\n', a - 1) + 1), a);
      let re = src.indexOf('\n', b);
      if (re < 0 || re > T.ie) re = T.ie;
      if (!left.trim()) t = t.replace(/^[ \t]*(?:\r?\n[ \t]*)+/, '');
      if (!src.slice(b, re).trim()) t = t.replace(/(?:[ \t]*\r?\n)+[ \t]*$/, '');
      if (!t && a === b) return;
    }
    const out = src.slice(0, a) + t + src.slice(b), q = a + t.length, ie = T.ie + t.length - (b - a);
    const ls = Math.max(T.is, out.lastIndexOf('\n', q - 1) + 1);
    let le = out.indexOf('\n', q);
    if (le < 0 || le > ie) le = ie;
    const line = out.slice(ls, le);
    // (inside an environment or a group a blank line ends nothing; one pasted is meant)
    if (line.trim() || nested || /\n[ \t]*\n/.test(t)) { this.commit([{ f, s: a, e: b, t }], { f, p: q, bias: -1 }, kind); return; }
    if (!out.slice(T.is, ie).trim()) {
      // Nothing left: the mark goes too, with the blank lines it stood between (one stays where
      // it kept two paragraphs apart), and a blank paragraph set to LaTeX takes the caret.
      const w = /^\s*/.exec(src.slice(T.ie))[0];
      const keep = /\n[ \t]*\n/.test(w) && !/\n[ \t]*\n[ \t]*$/.test(src.slice(0, T.ms)) && src.slice(0, T.ms).trim() ? '\n' : '';
      this.commit([{ f, s: T.ms, e: T.ie + w.length, t: keep }], { f, p: T.ms, bias: -1 }, kind);
      this.ghostAt(f, T.ms, 'latex');
      return;
    }
    // the empty line goes with the line break before it (after it, for the first line), and a
    // line to come stands in its place with the spaces it had
    const first = ls === T.is, cut = first ? [ls, le + 1] : [ls - 1, le], pos = first ? T.is : ls - 1;
    this.commit([{ f, s: T.is, e: T.ie, t: out.slice(T.is, cut[0]) + out.slice(cut[1], ie) }], { f, p: pos, bias: first ? 1 : -1 }, kind);
    this.showTexGhost(f, pos, first ? 'before' : 'after', line);
  }

  // Enter in a LaTeX paragraph: a line break, with the line's indent; where it would leave an
  // empty line, a line to come instead
  texEnter(T, c) {
    if (!c.collapsed) { this.texEdit(T, c.a, c.b, '\n', 'enter'); return; }
    const src = this.src(T.f), p = Math.max(T.is, Math.min(c.a, T.ie));
    const ls = Math.max(T.is, src.lastIndexOf('\n', p - 1) + 1);
    let le = src.indexOf('\n', p);
    if (le < 0 || le > T.ie) le = T.ie;
    const left = src.slice(ls, p), right = src.slice(p, le);
    if ((left.trim() && right.trim()) || T.nest.some(([x, y]) => x < p && p < y)) {
      const ind = /^[ \t]*/.exec(left)[0];
      this.commit([{ f: T.f, s: p, e: p, t: '\n' + ind }], { f: T.f, p: p + 1 + ind.length, bias: 1 }, 'enter');
      return;
    }
    if (!right.trim()) this.showTexGhost(T.f, le, 'after');
    else this.showTexGhost(T.f, ls, 'before');
  }

  // Backspace and Delete in a LaTeX paragraph; false where the paragraph's edge leaves it to the
  // page's own deleting
  texDelete(T, c, type, ranges) {
    const back = /Backward/.test(type), src = this.src(T.f);
    if (!c.collapsed) { this.texEdit(T, c.a, c.b, '', 'del'); return true; }
    // Backspace at its start takes the LaTeX style off, as at a list item's start the bullet
    // goes: the source stays, now typeset. A second one joins it to the paragraph before.
    if (back && c.a <= T.is) { this.commit([{ f: T.f, s: T.ms, e: T.is, t: '' }], { f: T.f, p: T.ms, bias: 1 }, 'block'); return true; }
    if (!back && c.a >= T.ie) {
      // Delete at its end brings the next paragraph's source in, on a line of its own
      const r = this.fallbackDeleteRange(c, false);
      if (!r || !/^\s+$/.test(src.slice(r.a, r.b))) return false;
      this.commit([{ f: T.f, s: r.a, e: r.b, t: '\n' }], { f: T.f, p: T.ie, bias: -1 }, 'del');
      return true;
    }
    const tr = ranges && ranges[0];
    let r = tr ? this.rangeToSrc(tr) : null;
    if (r && (r.f !== T.f || r.a === r.b || (back ? r.b > c.a : r.a < c.a))) r = null;
    if (!r) {
      // one character: both halves of a pair
      const pair = (i) => /[\uDC00-\uDFFF]/.test(src[i] || '') && /[\uD800-\uDBFF]/.test(src[i - 1] || '');
      r = back ? { a: c.a - (pair(c.a - 1) ? 2 : 1), b: c.a } : { a: c.a, b: c.a + (pair(c.a + 1) ? 2 : 1) };
    }
    this.texEdit(T, Math.max(r.a, T.is), Math.min(r.b, T.ie), '', 'del');
    return true;
  }

  // A line to come in a LaTeX paragraph, at pos: 'after' the line that ends there, or 'before'
  // the line that starts there. Drawn in the box's text, which is split around it and put
  // together again when it goes (removeGhost).
  showTexGhost(f, pos, mode, pend = '') {
    this.removeGhost();
    const r = this.index.find(f, pos, mode === 'after' ? -1 : 1);
    if (!r || !r.node || r.inexact || !r.node.parentNode.closest('.it.tex')) return false;
    const node = r.node, span = node.parentNode, k = r.offset, g = mk('span', 't gh tex-gh');
    let restore = null;
    if (k >= node.data.length) span.after(g);
    else if (k <= 0) span.before(g);
    else {
      const rest = span.cloneNode(false);
      rest.dataset.o = String(+(span.dataset.o || 0) + k);
      rest.textContent = node.data.slice(k);
      node.data = node.data.slice(0, k);
      span.after(g); g.after(rest);
      // Put back together without moving the selection: setting the text node's data put every
      // place in it at its start, and removing the split off span moved the places in it after
      // the line, so the next key acted at the box's start or end. The text is appended (places
      // in the node stay) and a place in the split off part goes to the same character.
      restore = () => {
        if (!node.isConnected || !rest.isConnected) return;
        const sel = getSelection(), len = node.data.length, rn = rest.firstChild;
        const at = (n, o) => (n === rn ? [node, len + o] : n === rest ? [node, len + (o ? rn.data.length : 0)] : [n, o]);
        const moved = sel.rangeCount && (rest.contains(sel.anchorNode) || rest.contains(sel.focusNode));
        const A = sel.rangeCount ? at(sel.anchorNode, sel.anchorOffset) : null, F = sel.rangeCount ? at(sel.focusNode, sel.focusOffset) : null;
        node.appendData(rn.data);
        rest.remove();
        if (moved) { this.ourSel = true; sel.setBaseAndExtent(A[0], A[1], F[0], F[1]); }
      };
    }
    this.ghost = { el: g, f, pos, tex: mode, pend, restore };
    this.paintGhost();
    this.ribbonSoon();
    return true;
  }
  // the blank line or paragraph to come, with the spaces typed in it so far, the caret at its end
  paintGhost() {
    const g = this.ghost, z = '​', pend = g.pend || '';
    const span = g.tex ? g.el : g.el.firstChild;
    span.textContent = g.tex === 'after' ? '\n' + pend + z : g.tex === 'before' ? pend + z + '\n' : z + pend;
    if (document.activeElement !== this.root) this.root.focus({ preventScroll: true });
    this.ourSel = true;
    getSelection().collapse(span.firstChild, (g.tex === 'after' ? 1 : 0) + pend.length + 1);
    this.scrollToCaret();
  }
  // the first character that is not a space, typed on a line to come, writes the line
  texGhostInsert(t) {
    const g = this.ghost;
    // (a line break at an end of what is pasted on a line to come would leave a blank line beside it)
    const text = ((g.pend || '') + t).replace(/^[ \t]*(?:\r?\n[ \t]*)+/, '').replace(/(?:[ \t]*\r?\n)+[ \t]*$/, '');
    if (!text.trim()) { g.pend = (g.pend || '') + t.replace(/[^ \t]/g, ''); this.paintGhost(); return; }
    this.removeGhost();
    const ins = g.tex === 'after' ? '\n' + text : text + '\n';
    this.commit([{ f: g.f, s: g.pos, e: g.pos, t: ins }], { f: g.f, p: g.pos + (g.tex === 'after' ? 1 : 0) + text.length, bias: -1 }, 'type');
  }
  // Enter on a line to come: a blank line asked for
  texGhostEnter() {
    const g = this.ghost, T = this.texBox(g.el);
    if (!T) return;
    const els = [...this.root.querySelectorAll('.it[data-b="' + T.B.id + '"]')];
    this.removeGhost();
    if (g.tex === 'after' && g.pos >= T.ie) { this.showGhost(els[els.length - 1], T.f, T.ie); return; }
    if (g.tex === 'before' && g.pos <= T.is) { this.showGhost(els[0], T.f, T.ms, { before: true }); return; }
    const t = g.tex === 'after' ? '\n\n' + LATEX_MARK : '\n' + LATEX_MARK + '\n';
    this.commit([{ f: T.f, s: g.pos, e: g.pos, t }], { f: T.f, p: g.pos + t.length + (g.tex === 'after' ? 1 : 0), bias: 1 }, 'enter');
  }
  // a blank paragraph for pos, after the block of the page that ends before it (before the one
  // that starts after it, where none does)
  ghostAt(f, pos, style) {
    let prev = null, next = null;
    for (const B of this.renderer.blocks) {
      if (B.f !== f || !B.items.length) continue;
      if (B.e <= pos && (!prev || B.e >= prev.e)) prev = B;
      if (B.s >= pos && (!next || B.s < next.s)) next = B;
    }
    const els = (B) => [...this.root.querySelectorAll('.it[data-b="' + B.id + '"]')];
    const at = prev ? els(prev).pop() : next ? els(next)[0] : null;
    if (at) this.showGhost(at, f, pos, { before: !prev, style });
  }

  onCompStart() {
    this.composing = true;
    this.compCaret = this.caretNow();
    this.compTex = this.compCaret && !this.compCaret.ghost ? this.texHere() : null;
  }
  onCompEnd(e) {
    this.composing = false;
    const c = this.compCaret;
    this.compCaret = null;
    const data = e.data || '';
    if (!c) { this.forceRender = true; this.rebuild(); return; }
    if (c.ghost) { if (data && this.ghost) this.ghostInsert(this.ghostRaw() ? data : escapeTeX(data, ' ')); else this.relayout(true); return; }
    // The browser mutated the DOM; rebuild from source regardless.
    this.forceRender = true;
    if (!data) { this.rebuild({ f: c.f, p: c.a }); return; }
    const T = this.compTex;
    this.compTex = null;
    if (T && T.f === c.f) { this.texEdit(T, c.a, c.b, data, 'type'); return; }
    const src = this.src(c.f);
    const edits = c.collapsed ? [] : this.deletionEdits(c.f, c.a, c.b);
    const raw = this.texAt(c.f, c.a);
    let t = raw ? data : escapeTeX(data, src[c.a - 1] || ' ');
    if (!raw && /^[A-Za-z]/.test(t) && endsWithControlWord(src, c.a)) t = '{}' + t;
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
      const whole = this.wholeDoc();
      if (whole) { this.replaceBody(whole, '', 'cut'); return; }
      const T = this.texHere();
      if (T && T.f === c.f) { this.texEdit(T, c.a, c.b, '', 'cut'); return; }
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
    // a .docx copied in the file manager and pasted here opens as Open would open it
    const docx = [...(dt.files || [])].find((f) => isDocx(f));
    if (docx) { this.openDocx(docx); return; }
    const imgs = !plain && !html ? [...(dt.files || [])].filter((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type)) : [];
    if (imgs.length) { this.openFiles(imgs.map((f, i) => new File([f], 'pasted-' + Date.now().toString(36) + (i ? '-' + i : '') + '.' + f.type.slice(6).replace('jpeg', 'jpg'), { type: f.type })), undefined, { fresh: true }); return; }
    let latex = '';
    try { latex = dt.getData('text/x-galley-latex') || ''; } catch (err) { latex = ''; }
    if (!latex && this.lastCopy && plain === this.lastCopy.plain) latex = this.lastCopy.latex;
    const c = this.caretNow();
    if (!c) return;
    // in LaTeX the source goes in as it is: the source of what was copied on the page, else the text
    const T = c.ghost ? null : this.texHere();
    if (T && T.f === c.f && !this.wholeDoc()) { this.texEdit(T, c.a, c.b, (latex || plain).replace(/\r\n?/g, '\n'), 'paste'); return; }
    if (c.ghost && this.ghostRaw()) { this.ghostInsert((latex || plain).replace(/\r\n?/g, '\n')); return; }
    const src = this.src(c.ghost ? this.ghost.f : c.f);
    const at0 = c.ghost ? this.ghost.pos : c.a;
    // inside a command argument (a heading, a cell, a caption) a paste stays one paragraph
    // over a selection of everything the paste becomes the body: paragraphs stay paragraphs
    // though the selection starts in the title
    const whole = c.ghost ? null : this.wholeDoc();
    const inArg = c.ghost || whole ? false : braceDepth(src, at0) > 0;
    const el = getSelection().anchorNode && (getSelection().anchorNode.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode.parentElement);
    const inline = inArg || (!whole && !!(el && el.closest && el.closest('td, .it.h, .cap')));
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
    if (whole) { this.replaceBody(whole, latex || rich(), 'paste'); return; }
    const edits = this.deletionEdits(c.f, c.a, c.b);
    const at = edits.length && edits[0].s >= c.a ? edits[0].s : c.a;
    // (landing in a LaTeX paragraph from a selection that started outside it: as source)
    const raw = this.texAt(c.f, at);
    let t = raw ? (latex || plain).replace(/\r\n?/g, '\n') : latex || rich();
    if (!raw && /^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
    if (!raw && /^[[*]/.test(t) && grabsBracket(src, at, t[0])) t = '{' + t[0] + '}' + t.slice(1);
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
    // (a LaTeX paragraph shows source: bold there is \textbf, written by hand)
    if (!c || c.ghost || this.texHere()) return;
    // every form of the kind counts: \textbf, \bf, \bfseries are bold (src/wrap.js)
    const names = groupNames({ textbf: 'bold', emph: 'italic', underline: 'underline', texttt: 'mono' }[cmd] || cmd);
    const sel = getSelection();
    // Are we inside a matching style wrapper? The page's own (the model's) first
    let wrapper = null;
    const anc = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    for (let n = anc; n && n !== this.root; n = n.parentElement) {
      if (n.dataset && n.dataset.y) { const y = styOfEl(n); if (y && names.includes(y.cmd)) { wrapper = y; break; } }
    }
    const src = this.src(c.f);
    // a group the page draws without a range of its own ({\bfseries ...}, {\bf ...}): from the source
    if (!wrapper) wrapper = enclosing(src, c.a, c.b, names);
    if (wrapper && (c.collapsed || (c.a >= wrapper.is && c.b <= wrapper.ie))) {
      // (src/wrap.js: a group's braces stay where it is an argument or follows a command, and the
      // words never run into a command before them)
      const edits = unwrapEdits(src, wrapper), at = (p) => mapPos(edits, p);
      this.commit(edits.map((x) => ({ f: c.f, ...x })), c.collapsed ? { f: c.f, p: at(c.a) } : { f: c.f, p: at(c.a), selA: at(c.a), selB: at(c.b) }, 'style');
      return;
    }
    // The wrapper around the selection (src/wrap.js): an empty one at a caret, the caret between
    // its braces; a character of several code points taken whole; one for each paragraph's part
    // of a selection over several (one around all of them took the blank lines into its braces,
    // which TeX refuses: "Paragraph ended before \textbf was complete"); none over structure.
    const r = wrapEdits(src, c.a, c.b, '\\' + cmd + '{');
    if (r.error) { this.toast('That selection crosses structure. Select text inside one paragraph or cell.'); return; }
    this.commit(r.edits.map((x) => ({ f: c.f, ...x })), r.sel ? { f: c.f, p: r.p, selA: r.sel.a, selB: r.sel.b } : { f: c.f, p: r.p, bias: r.bias }, 'style');
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
      // (not a click on the title above it, which is edited where it stands)
      if (this.ghost && this.ghost.sticky && !e.target.closest('.it.ttl')) { e.preventDefault(); this.caretToGhost(); }
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
    if (this.allSel) {
      const r = sel.rangeCount ? sel.getRangeAt(0) : null, A = this.allSel;
      if (!r || r.startContainer !== A.sc || r.startOffset !== A.so || r.endContainer !== A.ec || r.endOffset !== A.eo) this.allSel = null;
    }
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
    // what wholeDoc knows a Select all by, until the selection changes
    const now = sel.getRangeAt(0);
    this.allSel = { sc: now.startContainer, so: now.startOffset, ec: now.endContainer, eo: now.endOffset };
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

  // a menu's keys: the arrows step through its items and wrap, Home and End go to the ends
  menuKeys(el) {
    el.addEventListener('keydown', (e) => {
      if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) return;
      const all = [...el.querySelectorAll('[role=menuitem], [role=menuitemradio]')].filter((a) => !a.disabled && a.getAttribute('aria-disabled') !== 'true' && a.offsetParent);
      if (!all.length) return;
      const i = all.indexOf(document.activeElement), n = all.length;
      const j = e.key === 'Home' || (i < 0 && e.key === 'ArrowDown') ? 0 : e.key === 'End' || i < 0 ? n - 1 : (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      all[j].focus();
      e.preventDefault(); e.stopPropagation();
    });
  }

  makePop(anchor, cls, title) {
    this.closePop();
    if (this.pop) this.closePop(false, true);
    const p = document.createElement('div');
    p.className = 'pop ' + (cls || '');
    // named by its title, so a screen reader and an agent can tell the dialogs apart. Not
    // called modal: the page behind stays in reach of Tab, and a press there closes it
    p.setAttribute('role', 'dialog');
    if (title) {
      const h = document.createElement('div');
      h.className = 'pop-h';
      const t = document.createElement('span');
      t.textContent = title;
      t.id = 'pop-title';
      p.setAttribute('aria-labelledby', t.id);
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
  // force: for a box that would refuse (a formula's text that cannot be written, see
  // openMath) when another popover is opening over it; its text is then written as it is
  closePop(silent, force) {
    if (!this.pop) return;
    const P = this.pop;
    if (!force && P.refuse && P.refuse()) return;
    if (P.onClose) { try { P.onClose(); } catch (e) { console.error(e); } }
    if (P.mathText) { try { this.ensurePackages(P.mathText(), P); } catch (e) { console.error(e); } }
    if (P.wordTyping) P.wordTyping.destroy();
    try { if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide(); } catch (e) { /* ignore */ }
    this.pop = null;
    if (this.popOutside) document.removeEventListener('mousedown', this.popOutside, true);
    P.el.remove();
    this.closeGroup();
    if (!silent && P.returnCaret) this.restoreCaret(P.returnCaret);
    // Opened from a blank paragraph and closed with nothing made, or a document that so far
    // holds only what the popover made (a first formula) and has no text to put the caret in:
    // the caret goes to the blank paragraph, so typing goes on
    if (!silent && this.ghost && this.root.contains(this.ghost.el) && !this.caretNow()) this.caretToGhost();
    // Share, Save and Help open from a button of the bar: closed from the keyboard, the focus
    // goes back to it (it fell to the page's start, and Tab began again from the menu button)
    if (P.anchor instanceof HTMLButtonElement && P.anchor.offsetParent && (!document.activeElement || document.activeElement === document.body)) P.anchor.focus({ preventScroll: true });
  }

  // The text of the project's files the main file's preamble reads: \input and \include files,
  // and its own .sty and .cls files, two levels deep, 20 at most. A package one of them loads is
  // loaded (src/preamble.js, others): a second \usepackage with other options stopped TeX
  // (option clash).
  preambleOthers() {
    const out = [], seen = new Set([this.main]);
    const visit = (text, depth) => {
      if (depth > 2 || out.length >= 20) return;
      const end = preambleEnd(text), pre = stripComments(text.slice(0, end < 0 ? Math.min(text.length, 200000) : end));
      const names = [];
      for (let k = 0, re = /\\(?:input|include)\s*\{([^{}\n]{1,200})\}/g, m; (m = re.exec(pre)) && k < 200; k++) names.push(m[1].trim());
      for (const p of packages(text, end).slice(0, 200)) for (const n of p.names) names.push(n.name + '.sty');
      const d = docClass(text);
      if (d) names.push(d.name + '.cls');
      for (const n of names) {
        const f = [n, n + '.tex'].find((x) => this.files.has(x) && !seen.has(x));
        if (!f || out.length >= 20) continue;
        seen.add(f);
        out.push(this.files.get(f));
        visit(this.files.get(f), depth + 1);
      }
    };
    visit(this.src(this.main), 0);
    return out;
  }

  // The edits that load these packages in the main file (src/preamble.js's usePackages, with the
  // files its preamble reads): [{ f, s, e, t }]
  packageEdits(names, o = {}) {
    return usePackages(this.src(this.main), names, { ...o, others: this.preambleOthers() }).map((x) => ({ f: this.main, ...x }));
  }

  // A few Word symbols need a package beyond amsmath and amssymb (\\llbracket needs stmaryrd).
  // Add the \\usepackage line once, in the same undo step as the equation edit.
  ensurePackages(tex, P) {
    const need = new Set();
    String(tex).replace(/\\([A-Za-z]+)/g, (m, n) => { if (PACKAGES[n]) need.add(PACKAGES[n]); return m; });
    if (!need.size) return;
    const f = this.main;
    const src = this.src(f);
    // (src/preamble.js: once, after the last \usepackage line; commented lines load nothing)
    const others = this.preambleOthers();
    const add = [...need].filter((x) => !hasPackage(src, x, undefined, others));
    const edits = usePackages(src, add, { others });
    if (!edits.length) return;
    const top = this.hist[this.hist.length - 1];
    if (top && top.open && top.kind === P.session) top.time = Date.now();
    this.commit(edits.map((x) => ({ f, ...x })), null, P.session);
    const at = edits[0].s, grew = edits.reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    if (P.returnCaret && P.returnCaret.f === f && P.returnCaret.p >= at) P.returnCaret = { ...P.returnCaret, p: P.returnCaret.p + grew };
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
    // The text box MathLive keeps inside the field takes the keys. MathLive writes what it reads
    // aloud into that box's label and empties it between; empty, it gets the field's name.
    const nameSink = () => {
      try {
        const k = mf.shadowRoot && mf.shadowRoot.querySelector('[part="keyboard-sink"]');
        if (!k) return;
        const fill = () => { if (!k.getAttribute('aria-label')) k.setAttribute('aria-label', 'Equation editor'); };
        fill();
        new MutationObserver(fill).observe(k, { attributes: true, attributeFilter: ['aria-label'] });
      } catch (e) { /* unnamed, as before */ }
    };
    // Inside the artifact viewer the page is framed; keep the on-screen keyboard in this page.
    const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
    try { mf.mathVirtualKeyboardPolicy = framed ? 'sandboxed' : 'auto'; } catch (e) { /* ignore */ }
    holder.replaceWith(mf);
    nameSink();
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
    ta.setAttribute('aria-label', 'The math, as LaTeX');
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
      envSel.setAttribute('aria-label', 'Kind of equation');
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
      err.textContent = r.err || held() ? plainMathError(r.err, ta.value) + (held() ? ' The document keeps the formula as it was until this is put right.' : '') : '';
      err.title = r.err || '';
      err.hidden = !(r.err || held());
    };
    // text that would not stay a formula in the document is not written there (mathBreaksOut)
    const kerr = () => this.renderer.katex(this.mathPreviewTex(ta.value, display), display).err;
    const held = () => mathBreaksOut(ta.value, kerr());
    // Enter says the formula is done. With a } or a $ too many there is no telling which one was
    // meant, so the box stays open with its message; an open brace is closed for the writer.
    const stay = () => /^A [}$]/.test(held());
    preview();
    const push = debounce(() => { if (this.pop && !held()) this.pop.applyInner(ta.value); }, 140);
    ta.addEventListener('input', () => { preview(); push(); ta.rows = Math.min(10, Math.max(display ? 3 : 1, ta.value.split('\n').length)); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (!display || e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); if (stay()) return; push.flush(); this.closePop(); }
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
    });
    // However the box closes, what was typed is kept: text held back is written made whole
    // (mathMadeWhole), in the box's undo step.
    const whole = () => mathMadeWhole(ta.value, kerr());
    this.pop.onClose = () => { push.cancel(); if (!this.pop) return; this.pop.applyInner(held() ? whole() : ta.value); };
    // what is written must itself pass the box's check; if making it whole could not get it
    // there, the box stays open with its message (closePop asks) and nothing is lost
    this.pop.refuse = () => !!held() && !!mathBreaksOut(whole(), this.renderer.katex(this.mathPreviewTex(whole(), display), display).err);
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
      onEnter: () => { if (stay()) return; push.flush(); this.closePop(); },
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
    ta.placeholder = 'e.g. x^2 + y^2 = r^2'; ta.setAttribute('aria-label', 'The formula, as LaTeX');
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
    const kerr = (v) => this.renderer.katex(this.mathPreviewTex(v, false), false).err;
    const held = (v) => (v ? mathBreaksOut(v, kerr(v)) : '');
    const stay = () => /^A [}$]/.test(held(ta.value));
    const insert = (v) => {
      // not while it would not stay a formula in the document (an unclosed brace); when the box
      // closes it comes here made whole
      if (held(v)) return;
      if (!ins) {
        if (!v) return;
        const t = '$' + v + '$';
        if (ghost) {
          this.ghost = ghost;
          const src = this.src(ghost.f);
          let nlB = 0; for (let k = ghost.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
          const pre = '\n'.repeat(Math.max(0, 2 - nlB));
          // (a blank paragraph set to Quote: the formula goes in the quote)
          const [qo, qc] = ghost.style === 'quote' ? ['\\begin{quote}\n', '\n\\end{quote}'] : ['', ''];
          this.commit([{ f: ghost.f, s: ghost.pos, e: ghost.pos, t: pre + qo + t + qc + '\n\n' }], null, this.pop.session);
          ins = { f: ghost.f, s: ghost.pos + pre.length + qo.length, e: ghost.pos + pre.length + qo.length + t.length };
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
    const preview = () => { const r = this.renderer.katex(this.mathPreviewTex(ta.value, false), false); prev.innerHTML = ta.value ? r.html : ''; err.textContent = r.err ? plainMathError(r.err, ta.value) : ''; err.title = r.err || ''; err.hidden = !r.err || !ta.value; };
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
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (stay()) return; push.flush(); this.closePop(); }
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
    });
    const whole = () => mathMadeWhole(ta.value, kerr(ta.value));
    this.pop.onClose = () => { push.cancel(); if (this.pop) insert(held(ta.value) ? whole() : ta.value); };
    this.pop.refuse = () => !!held(ta.value) && !!held(whole());
    this.pop.mathText = () => ta.value;
    this.pop.returnCaret = base ? { f: base.f, p: base.a } : null;
    this.positionPop();
    ta.focus();
    this.attachField(prev, ta, {
      display: false, initial: '', keepFocus: true,
      env: () => '$',
      onEnter: () => { if (stay()) return; push.flush(); this.closePop(); },
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
    let c = this.caretNow();
    if (!c) return;
    // (not in a LaTeX paragraph or a line to come in one: an equation there is typed as its source)
    if (c.ghost ? this.ghostRaw() : this.texHere()) return;
    // in the blank paragraph of a new document too (the ribbon's Equation is pressed there)
    if (c.ghost) { c = { f: this.ghost.f, a: this.ghost.pos }; this.removeGhost(); }
    const t = '\n\\begin{equation}\n  \n\\end{equation}\n';
    // (the history as it is before the equation: given up empty, it goes back to this)
    this.closeGroup();
    const h0 = this.hist.length, redo0 = this.redoStack;
    this.commit([{ f: c.f, s: c.a, e: c.a, t }], { f: c.f, p: c.a + t.length }, 'insert');
    const el = this.findAtomEl({ f: c.f, s: c.a + 1, kind: 'math' });
    if (el) { const info = atomOfEl(el); if (info) this.openMath(el, info); }
    // closed with nothing typed, the equation goes again: it stayed as an empty environment,
    // which prints a number beside nothing
    const P = this.pop;
    if (!P || !P.onClose) return;
    const done = P.onClose;
    P.onClose = () => {
      done();
      if (this.src(c.f).slice(c.a, c.a + t.length) !== t) return;
      // Its insertion is taken back and leaves no step, forward or back: with a step of its
      // own for the removal, the first undo brought the empty equation back.
      if (this.hist.length === h0 + 1) {
        const h = this.hist.pop();
        for (const d of h.files) { const s = this.files.get(d.f) ?? ''; this.files.set(d.f, s.slice(0, d.s) + d.del + s.slice(d.s + d.ins.length)); }
        this.redoStack = redo0;
        this.rebuild({ f: c.f, p: c.a });
        this.pushToSource(); this.saveSoon(); this.updateUndoUI();
      } else this.commit([{ f: c.f, s: c.a, e: c.a + t.length, t: '' }], null, P.session);
      P.returnCaret = { f: c.f, p: c.a };
    };
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
      inp.type = 'text'; inp.id = 'pop-describe'; inp.placeholder = 'Describe the math in words'; inp.setAttribute('aria-label', 'Describe the math in words');
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
    ta.setAttribute('aria-label', 'LaTeX source');
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
    const cs = document.createElement('select'); cs.id = 'pop-citecmd'; cs.setAttribute('aria-label', 'Citation style');
    const choices = this.citeChoices();
    for (const [v, l] of choices) { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cmd) o.selected = true; cs.appendChild(o); }
    if (![...cs.options].some((o) => o.selected)) { const o = document.createElement('option'); o.value = cmd; o.textContent = '\\' + cmd; o.selected = true; cs.appendChild(o); }
    cs.addEventListener('change', () => { cmd = cs.value; write(); });
    top.appendChild(cs);
    const chips = document.createElement('div'); chips.className = 'chips';
    const search = document.createElement('input'); search.type = 'search'; search.id = 'pop-citesearch'; search.placeholder = 'Search the bibliography'; search.setAttribute('aria-label', 'Search the bibliography');
    const list = document.createElement('div'); list.className = 'plist';
    const notes = document.createElement('div'); notes.className = 'pop-row notes';
    const preI = document.createElement('input'); preI.type = 'text'; preI.placeholder = 'Before (see)'; preI.value = pre; preI.id = 'pop-citepre'; preI.setAttribute('aria-label', 'Text before the citation');
    const postI = document.createElement('input'); postI.type = 'text'; postI.placeholder = 'After (p.~4)'; postI.value = post; postI.id = 'pop-citepost'; postI.setAttribute('aria-label', 'Text after the citation');
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
    const cs = document.createElement('select'); cs.id = 'pop-refcmd'; cs.setAttribute('aria-label', 'Kind of reference');
    for (const [v, l] of [['ref', '\\ref  2'], ['eqref', '\\eqref  (2)'], ['cref', '\\cref  eq. (2)'], ['Cref', '\\Cref  Equation (2)'], ['autoref', '\\autoref  Section 2'], ['pageref', '\\pageref']]) { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cmd) o.selected = true; cs.appendChild(o); }
    cs.addEventListener('change', () => { cmd = cs.value; write(); });
    top.appendChild(cs);
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Filter labels'; search.id = 'pop-refsearch'; search.setAttribute('aria-label', 'Filter labels');
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
  // one item of the insert list, at a place in the text (base) or in the blank paragraph (ghost)
  insertPiece(base, ghost, open, close) {
    if (ghost) {
      this.ghost = ghost;
      const src = this.src(ghost.f);
      let nlB = 0; for (let k = ghost.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
      const pre = '\n'.repeat(Math.max(0, 2 - nlB));
      // (a blank paragraph set to Quote: what is inserted goes in the quote)
      const [qo, qc] = ghost.style === 'quote' ? ['\\begin{quote}\n', '\n\\end{quote}'] : ['', ''];
      const o = qo + open.replace(/^\n+/, '');
      this.removeGhost();
      this.commit([{ f: ghost.f, s: ghost.pos, e: ghost.pos, t: pre + o + close + qc }], { f: ghost.f, p: ghost.pos + pre.length + o.length, bias: 1 }, 'insert');
      return;
    }
    const src = this.src(base.f);
    const inner = base.a !== base.b && isBalanced(src, base.a, base.b) ? src.slice(base.a, base.b) : '';
    this.commit([{ f: base.f, s: base.a, e: inner ? base.b : base.a, t: open + inner + close }], { f: base.f, p: base.a + open.length + inner.length, bias: 1 }, 'insert');
  }
  runPalette(x, base, ghost) {
    const insertAt = (open, close) => this.insertPiece(base, ghost, open, close);
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
  }

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
    inp.type = 'text'; inp.id = 'pop-cmd'; inp.className = 'code'; inp.placeholder = 'footnote, cite, section, equation, \u2026'; inp.setAttribute('aria-label', 'What to insert');
    inp.autocomplete = 'off'; inp.spellcheck = false;
    const list = document.createElement('div'); list.className = 'plist';
    const hint = document.createElement('div'); hint.className = 'hint pad'; hint.textContent = 'Enter inserts the highlighted item. Anything else you type is inserted as a raw command.';
    p.append(inp, list, hint);
    const items = paletteItems();
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
    const run = (x) => { this.closePop(true); this.runPalette(x, base, ghost); };
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
            // (Ctrl+S is the page's own shortcut, heard here too: a second one saved every file twice)
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
        ta.setAttribute('aria-label', 'LaTeX source');
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

  // ---- git ---------------------------------------------------------------------------------
  // A real repository per project, kept in this browser (src/git.js). The editor's files are
  // the working tree: the panel writes them into it, so a commit takes exactly what is open.
  loadGit() {
    if (!this.gitP) {
      this.gitP = import(asset('git.js'));
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
    // the record is the address as the user gave it or as Rikuy uses it (canonicalRemote)
    if (typeof rec === 'string') return rec === remote || (rec && rec === canonicalRemote(remote)) ? 'own' : 'theirs';
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
      out.append(mk('div', 'git-intro', 'This project is not a git repository yet. Starting one keeps every commit of it in this browser; Download LaTeX then gives a .zip that is a clone you can push from your computer.'));
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
    // compared as the browser will request them: an <input type=url> drops the spaces, tabs and
    // line breaks a quoted .git/config value can keep, so " https://host/x" from a stranger's
    // config looked typed by the user, got the host's token and became the user's own remote
    const remoteC = canonicalRemote(remote);
    const changed = () => canonicalRemote(url.value) !== remoteC;
    const mine = () => changed() || from !== 'theirs';
    const fill = () => savedToken(this.prefs, url.value.trim(), mine());
    let shown = tok.value = fill(), typed = false;
    const legacy = this.gitLegacyButton(url, tok, () => { typed = true; shown = tok.value; }, mine);
    tok.addEventListener('input', () => { typed = true; legacy.sync(); });
    url.addEventListener('input', () => { if (!typed) shown = tok.value = fill(); legacy.sync(); });
    const opts = () => {
      const t = tok.value.trim();
      dropReplaced(this.prefs, t, shown);
      this.prefs.gitProxy = prox.value.trim(); store(PREFS, this.prefs);
      const o = { token: t, remote: url.value.trim(), corsProxy: this.prefs.gitProxy, accepted: legacy.chosen() };
      o.onAccepted = () => { o.accepted = true; };
      return o;
    };
    // after a pull or push worked: the token is kept for the host, and a token the user typed,
    // or one the remote asked for and took, makes the remote theirs
    const kept = (o) => {
      keepToken(this.prefs, o.remote, o.token, shown, o.accepted);
      store(PREFS, this.prefs);
      if (o.token && (typed || o.accepted) && o.remote === canonicalRemote(remote) && from !== 'own') this.gitOwnRemote(dir, o.remote);
      shown = o.token;
    };
    const saveUrl = async () => {
      const u = url.value.trim();
      if (u && changed()) {
        if (!canonicalRemote(u)) { this.toast(G.BAD_REMOTE, 7000); return ''; }
        await G.setRemote(dir, u); this.gitOwnRemote(dir, canonicalRemote(u));
      }
      return u;
    };
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
    // the host the browser will reach, not the address as written (canonicalRemote)
    const host = remoteHost(remote);
    if (from === 'theirs') rem.append(mk('div', 'git-note git-foreign', 'This remote came in the .git folder of the project you opened, so no token is filled in for it. Give one only if ' + host + ' is yours.'));
    else if (from === 'unknown' && tok.value) rem.append(mk('div', 'git-note git-unknown', 'This repository is older than Rikuy\'s record of where remotes come from, so your token is filled in as before. Check that ' + host + ' is yours before you pull or push.'));
    rem.append(url, tok, legacy.el, prox, rrow, mk('div', 'git-note', 'GitHub and GitLab need a token with write access and, from a browser, a CORS proxy. Inside claude.ai the page can only reach its own server, so pushing works from Rikuy on its own site; here, Download LaTeX gives a clone to push from your computer.'));
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
    out.append(mk('div', 'git-note', 'Download LaTeX gives a .zip with the .git folder in it, so the download is a clone: unzip it and git log, git push work as usual. isomorphic-git ' + G.version + '.'));
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
    const legacy = this.gitLegacyButton({ get value() { return G.gitUrlOf(url.value); } }, tok, () => { typed = true; shown = tok.value; });
    tok.addEventListener('input', () => { typed = true; legacy.sync(); });
    url.addEventListener('input', () => { if (!typed) shown = tok.value = savedToken(this.prefs, G.gitUrlOf(url.value), true); legacy.sync(); });
    const b = mkBtn('Clone', async () => {
      // an Overleaf project's address becomes its git address (Overleaf, Account settings, Git integration)
      const u = canonicalRemote(G.gitUrlOf(url.value));
      if (!u) { if (url.value.trim()) this.toast(G.BAD_REMOTE, 7000); url.focus(); return; }
      const t = tok.value.trim();
      dropReplaced(this.prefs, t, shown);
      this.prefs.gitProxy = prox.value.trim(); store(PREFS, this.prefs);
      const o = { token: t, remote: u, corsProxy: this.prefs.gitProxy, depth: 200, accepted: legacy.chosen() };
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
    det.append(url, tok, legacy.el, prox, b);
    return det;
  }

  // The single token of earlier versions, offered for a host only when the user picks it here:
  // its prefix names no host (or one the remote is not), so filling it in for whatever address
  // was typed sent it to strangers' remotes. The button names the host it will go to.
  gitLegacyButton(url, tok, picked, mine = () => true) {
    // the choice is for the host the button named: an address edited afterwards is not chosen
    let chosen = '';
    const host = () => canonicalRemote(url.value) && new URL(canonicalRemote(url.value)).origin;
    const el = mkBtn('', () => {
      const t = mine() ? legacyChoice(this.prefs, url.value) : '';
      if (!t) return;
      tok.value = t; chosen = host(); picked(); sync();
    }, 'Fill in the access token you saved in an earlier version of Rikuy');
    el.classList.add('git-legacy');
    const sync = () => {
      const t = mine() ? legacyChoice(this.prefs, url.value) : '';
      if (tok.value !== t || host() !== chosen) chosen = '';
      el.hidden = !t || !!tok.value.trim();
      if (t) el.textContent = 'Use the token you saved before, for ' + remoteHost(url.value);
    };
    sync();
    return { el, sync, chosen: () => !!chosen && chosen === host() && tok.value.trim() === this.prefs.gitToken };
  }

  gitError(e) {
    const m = String((e && (e.message || e.code)) || e);
    if (/Failed to fetch|NetworkError|Load failed|Content Security Policy|CORS/i.test(m)) return 'Could not reach the remote. From inside claude.ai the page may only talk to its own server; run Rikuy on its own site, or Download LaTeX and push from your computer. (' + m + ')';
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

  // Zoom as people zoom elsewhere: a pinch on a trackpad, Ctrl with the mouse wheel, Ctrl and
  // + / - / 0. Over the pages these zoom the document, as in Word, and the number in the bar
  // follows; the browser's own zoom would have enlarged the bar too and left that number
  // where it was. The point under the pointer stays under it. Elsewhere (the source, the PDF,
  // a field) the keys keep the browser's zoom.
  zoomGestures() {
    const desk = this.desk;
    let pend = 1, at = null, raf = 0;
    const flush = () => {
      raf = 0;
      const z = (this.prefs.zoom === 'fit' ? this.px / PX_PER_PT : this.prefs.zoom) * pend;
      pend = 1;
      this.zoomTo(z, at);
    };
    // a pinch arrives as wheel events with ctrlKey set (Chrome, Edge, Firefox); a mouse wheel
    // with Ctrl held too. Every event of a frame makes one zoom: a layout per frame at most.
    desk.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      pend *= Math.min(2, Math.max(0.5, Math.exp(-dy * 0.0022)));
      at = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(flush);
    }, { passive: false });
    // Safari tells a pinch apart, as a gesture with a scale from where it began
    let base = 1;
    desk.addEventListener('gesturestart', (e) => { e.preventDefault(); base = this.prefs.zoom === 'fit' ? this.px / PX_PER_PT : this.prefs.zoom; });
    desk.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      pend = 1;
      at = { x: e.clientX, y: e.clientY };
      const z = base * e.scale;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.zoomTo(z, at); });
    });
  }

  // The zoom set to z (a scale, 1 is actual size), with the point at (x, y) of the window kept
  // where it is: the page under it and the place on that page.
  zoomTo(z, at) {
    z = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100;
    const cur = this.prefs.zoom === 'fit' ? this.px / PX_PER_PT : this.prefs.zoom;
    if (Math.abs(z - cur) < 0.005 && this.prefs.zoom !== 'fit') return;
    const desk = this.desk, r = desk.getBoundingClientRect();
    const x = at ? at.x : r.left + desk.clientWidth / 2, y = at ? at.y : r.top + desk.clientHeight / 2;
    const pages = [...this.root.querySelectorAll('.page')];
    let k = -1, fx = 0, fy = 0;
    for (let i = 0; i < pages.length; i++) {
      const q = pages[i].getBoundingClientRect();
      if (y < q.bottom || i === pages.length - 1) { k = i; fx = (x - q.left) / q.width; fy = (y - q.top) / q.height; break; }
    }
    this.prefs.zoom = z;
    clearTimeout(this.zoomSave);
    this.zoomSave = setTimeout(() => store(PREFS, this.prefs), 400);
    if (!this.computePx()) return;
    this.relayout(true);
    const pg = k >= 0 && this.root.querySelectorAll('.page')[k];
    if (!pg) return;
    const q = pg.getBoundingClientRect();
    desk.scrollLeft += q.left + fx * q.width - x;
    desk.scrollTop += q.top + fy * q.height - y;
  }

  setZoom(dir) {
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    // on a phone, where − and + are hidden, the Fit button switches between fitting the width
    // (text a few pixels high) and actual size
    // (and the size the page opens at there, the text block across the screen)
    const z = this.prefs.zoom;
    // text block, actual size, whole sheet, and round again
    if (dir === 0) {
      if (window.innerWidth > 520) this.prefs.zoom = 'fit';
      else if (z !== 'fit') { this.prefs.zoom = 'fit'; this.prefs.phone = 'sheet'; }
      else if (this.prefs.phone === 'sheet') this.prefs.phone = 'text';
      else this.prefs.zoom = 1;
    } else {
      const cur = z === 'fit' ? this.px / PX_PER_PT : z;
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

  // from: how the files came when not from the user's own disk ('share': shared to the installed
  // app, which any page can do), so the project opens as someone else's
  // opts.fresh: pictures from the clipboard, which have no name of their own (every screenshot
  // is image.png) and so never stand for a file the project has
  async openFiles(list, from, opts = {}) {
    // a Word file opens as a project of its own, or brings a coauthor's edits back (src/word.js)
    const docx = list.find((f) => isDocx(f));
    if (docx) {
      if (list.length > 1) this.toast('Opening ' + docx.name + ' alone: a Word file opens on its own.', 6000);
      await this.openDocx(docx, from);
      return;
    }
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
    // what was not opened and why, in words for someone who only dropped a file: a .zip that is
    // not one, a picture under a text file's name, a word processor's file that is not .docx
    const unread = [], notText = [], wordLike = [];
    // The names that came out of an archive. With any of them added that TeX, or a program TeX
    // starts, can run or read as code, the project holds a stranger's files: marked as someone
    // else's, its shell escape restricted. Raster pictures and PDFs alone do not make it so
    // (a .zip of figures dropped on one's own paper), nor does an archive that gave nothing.
    const zipAdded = new Set();
    const zipCode = () => [...zipAdded].some((n) => (texts.has(n) || blobs.has(n) || extra.has(n)) && !/\.(png|jpe?g|gif|webp|pdf)$/i.test(n));
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
          if (!names.length) unread.push(file.name + ' has no files in it.');
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
              // not text, whatever its name says: kept as the file it is, not shown as a page of noise
              zipAdded.add(rel);
              if (d.text.includes('\0')) { extra.set(rel, new Blob([bytes])); continue; }
              texts.set(rel, d.text);
              orig.set(rel, { bytes, enc: d.enc, bom: d.bom, text: d.text });
            } else if (IMG_EXT.test(rel) || /\.(pdf|eps)$/i.test(rel)) { blobs.set(rel, await z.files[n].async('blob')); zipAdded.add(rel); }
            else { extra.set(rel, await z.files[n].async('blob')); zipAdded.add(rel); }
          }
        } catch (e) {
          // the reason stays in the message shown at the end (it used to be replaced at once by
          // "Nothing to open. Choose ... .zip files"); JSZip's own words for a file that is no
          // archive are a question and a link to its documentation
          const mine = /^it would unpack/.test((e && e.message) || '');
          // (zipName stays: files read before a damaged entry still open as someone else's)
          unread.push(file.name + (mine ? ' was not opened: ' + e.message + '.' : ' is not a .zip file this page can read: it may be damaged, or another kind of file under that name.'));
        }
      } else {
        const rel = cleanPath(stripTop(nm));
        if (rel === null) { skipped.push(nm); continue; }
        // Word's old format and other word processors' files: added silently as a file of the
        // project, they looked opened and nothing showed
        if (/\.(doc|odt|rtf|pages|wpd)$/i.test(rel)) { wordLike.push(nm); continue; }
        if (TEXT_EXT.test(rel)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const d = decodeText(bytes);
          // a picture or an archive renamed .tex, or UTF-16 text: it opened as a page of noise
          if (d.text.includes('\0')) { notText.push(nm); continue; }
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
    const few = (a) => a.slice(0, 4).join(', ') + (a.length > 4 ? ' and ' + (a.length - 4) + ' more' : '');
    if (notText.length) unread.push(few(notText) + (notText.length === 1 ? ' was not opened: it is' : ' were not opened: they are') + ' not text this page can read (a picture or an archive under a text file\'s name, or text saved as UTF-16).');
    if (wordLike.length) unread.push(few(wordLike) + (wordLike.length === 1 ? ' was' : ' were') + ' not opened: Rikuy reads Word files saved as .docx. In your word processor choose Save As, Word Document (.docx), and open that.');
    const skipNote = (skipped.length ? ' Left out ' + skipped.length + (skipped.length === 1 ? ' file whose name points' : ' files whose names point') + ' outside the project: ' + skipped.slice(0, 3).join(', ') + (skipped.length > 3 ? '…' : '.') : '') + (unread.length ? ' ' + unread.join(' ') : '');
    if (!texts.size && !blobs.size && !extra.size) { this.toast(skipNote.trim() || 'Nothing to open. Choose .tex, .bib, image, .zip or Word .docx files.', 10000); return; }
    // files shared to the app may come from any web page: they add to the project open now only
    // under names it does not have, never over one of its files
    const held = [];
    if (from) for (const n of [...texts.keys(), ...blobs.keys(), ...extra.keys()]) if (this.files.has(n) || this.assetBlobs.has(n) || this.extra.has(n)) held.push(n);
    const hasDoc = [...texts.entries()].some(([n, t]) => /\.tex$/i.test(n) && /\\documentclass/.test(t));
    const onlyTex = [...texts.keys()].filter((n) => /\.tex$/i.test(n));
    // a chapter (a .tex with no \documentclass) opened beside a document of one's own joins its
    // project, as an upload to Overleaf does; it used to replace the whole thesis. Over the
    // untouched sample it still opens on its own.
    const sample = this.files.size === Object.keys(SAMPLE).length && Object.entries(SAMPLE).every(([n, t]) => this.files.get(n) === t);
    if (!hasDoc && (!onlyTex.length || (!sample && !zipName))) {
      for (const n of held) { texts.delete(n); orig.delete(n); blobs.delete(n); extra.delete(n); }
      if (!texts.size && !blobs.size && !extra.size) { this.toast('Not opened: this project already has ' + held.join(', ') + '. Open them from a new document.', 9000); return; }
      // Add to the current project (bib files, images, chapters). A file of the same name is
      // replaced, as an upload to Overleaf replaces it: the version before is kept in History
      // first (opening a .tex with the installed app comes here too, and left no way back).
      // A picture dropped, pasted or opened into one's own document goes where the caret is, as
      // in a word processor: it used to join the project unseen, with a message naming the
      // command to write. Its name comes from outside, and in the source it is letters, digits,
      // dot, dash and underscore alone, with no folder: it cannot close the braces, start a
      // command or a comment. Pictures shared to the app by another page are not placed.
      // A name of its own, too: never the name of a file the project has, whose bytes it would
      // replace (two pictures named in another script both came to figure.png, and versions
      // keep text alone, so the first was gone for good).
      // Dropped or opened under exactly the name of a picture the project has, it is that
      // picture made again (a plot drawn anew): its bytes are replaced and no second figure is
      // placed, unless the text does not include it yet. Only a name that came to an existing
      // one by being made safe, and a pasted picture, get a new name.
      let placed = null;
      const toPlace = [], replaced = [];
      // (PNG, JPEG and PDF, which every TeX engine here includes as they are; an SVG, a GIF or
      // an EPS joins the project as before and is not written into the text)
      if (!from && !zipName && !texts.size && !extra.size && blobs.size && blobs.size <= 12 && [...blobs.keys()].every((n) => /\.(png|jpe?g|pdf)$/i.test(n))) {
        const safe = new Map();
        const taken = (n) => safe.has(n) || this.assetBlobs.has(n) || this.files.has(n) || this.extra.has(n);
        for (const [n, b] of blobs) {
          if (!opts.fresh && this.assetBlobs.has(n) && !safe.has(n)) {
            safe.set(n, b);
            replaced.push(n);
            const stem = n.replace(/\.[^.]+$/, '');
            const used = [...this.files.values()].some((s) => s.includes(n) || s.includes(stem + '}'));
            // (a name the project took from elsewhere is written into the source only if it is safe there)
            if (!used && /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(n)) toPlace.push(n);
            continue;
          }
          const ext = /\.[A-Za-z0-9]+$/.exec(n)[0].toLowerCase();
          const base = (n.split('/').pop().slice(0, -ext.length).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'figure').slice(0, 60);
          let name = base + ext;
          for (let k = 2; taken(name); k++) name = base + '-' + k + ext;
          safe.set(name, b);
          toPlace.push(name);
        }
        blobs.clear();
        for (const [n, b] of safe) blobs.set(n, b);
      }
      const over = [...texts.keys(), ...blobs.keys(), ...extra.keys()].filter((n) => this.files.has(n) || this.assetBlobs.has(n) || this.extra.has(n));
      if (over.length && this.base) await this.snapshot('Before ' + over[0] + (over.length > 1 ? ' and ' + (over.length - 1) + ' more' : '') + ' was replaced', { force: true });
      // Files shared to the app may come from any web page, and a class, a package or a .bib is
      // code TeX runs: with them in it, the project is someone else's as far as shell escape
      // goes, until the owner ticks Shell escape (the click on Open was all that was asked).
      // The same for code that came in an archive with no document of its own (a .zip holding a
      // class alone joined the user's project unmarked; see zipCode). Loose files the user
      // opened stay theirs. An Allow given before goes: new files arrived, and the message says so.
      let markNote = '';
      if (from || zipCode()) {
        const was = from ? null : await this.linkInfo();
        this.markFromLink('', this.name, this.main, from || 'zip');
        if (!from) markNote = was && was.allowed ? ' Shell escape, allowed for this project before, is restricted again: new files from an archive arrived. Allow it in the PDF pane if you trust them.' : ' They came in an archive, so shell escape is restricted for this project until you allow it in the PDF pane.';
      }
      for (const [n, t] of texts) this.files.set(n, t);
      for (const [n, o] of orig) this.orig.set(n, o);
      for (const [n, b] of blobs) this.addAsset(n, b);
      for (const [n, b] of extra) this.extra.set(n, b);
      this.binaryDirty = true;
      this.zipDirty = true;
      this.forceRender = true;
      // one edit for the figure and its package: one undo takes both out again. Worked out here,
      // after every await above, from the text and the caret as they are now.
      if (toPlace.length) placed = this.figureEdits(toPlace);
      // (a step of its own: two pictures dropped one after the other are two undos)
      if (placed) { this.closeGroup(); this.commit(placed.edits, placed.caret, 'figure'); this.closeGroup(); }
      else { this.rebuild(this.caretNow()); this.pushToSource(); }
      this.updateFileTabs();
      this.saveSoon();
      // an added chapter or figure shows on the page only once the source names it
      const fig = [...blobs.keys()][0];
      const widget = [...texts.keys()].find((n) => /\.html?$/i.test(n));
      // a PDF dropped alone is most often a document someone hoped to edit
      const asFig = !texts.size && !extra.size && [...blobs.keys()].every((n) => /\.pdf$/i.test(n)) ? ' as a figure (a PDF cannot be opened for editing here)' : '';
      const added = [...texts.keys(), ...blobs.keys(), ...extra.keys()].filter((n) => !replaced.includes(n));
      const use = placed ? ' Undo takes ' + (toPlace.length === 1 ? 'it' : 'them') + ' out of the text again.' : !added.length ? '' : onlyTex.length ? ' Write \\input{' + onlyTex[0].replace(/\.tex$/i, '') + '} where it goes.' : widget ? ' Write \\rikuywidget{' + widget + '}{' + (fig || 'fallback.png') + '} where it goes (rikuy.sty, from Rikuy\'s sample/widget, defines it).' : fig ? ' Write \\includegraphics{' + fig + '} where it goes.' : '';
      const heldNote = held.length ? ' Not replaced: ' + held.join(', ') + ', which the project has.' : '';
      // a few names, then a count: a .zip of fifty pictures filled the screen with their names
      const said = (replaced.length ? few(replaced) + ' replaced' + (placed && !added.length ? ' and placed in the text' : '') + '.' + (added.length ? ' ' : '') : '')
        + (added.length ? 'Added ' + few(added) + ' to the project' + asFig + (placed ? ' and placed ' + (added.length === 1 ? 'it' : 'them') + ' in the text' : '') + '.' : '');
      this.toast(said + use + heldNote + markNote + skipNote, skipNote || use || heldNote || markNote ? 9000 : undefined);
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
    if (from || zipCode() || gitFiles.has('.git/HEAD')) this.markFromLink('', this.name, this.main, from || (gitFiles.has('.git/HEAD') ? 'git' : 'zip'));
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

  // Where a block of its own (a picture, a table) goes: after the paragraph, list or table the
  // caret is in, at the end of the text when there is no caret; and the blank lines it needs
  // before and after there.
  afterBlockPos() {
    const c = this.caretNow();
    let f = this.main, p = -1;
    if (c && c.ghost) { f = this.ghost.f; p = this.ghost.pos; }
    else if (c) {
      const n = getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
      // a footnote is drawn at the foot of the page, outside its paragraph: its block is the
      // one its text belongs to, the paragraph that holds the footnote
      const it = el && el.closest('.it'), sp = !it && el ? el.closest('span.t') : null, seg = sp ? segOfSpan(sp) : null;
      const B = it ? BLOCKS.get(+it.dataset.b) : seg && seg.B;
      if (B) { f = B.f; p = B.e; }
    }
    // where the preamble ends and where the text ends are the parser's (model.docBody): a
    // comment that names \begin{document} is neither
    const d = this.model && !this.stale && this.model.main === this.main ? this.model.docBody : null;
    if (p < 0 || (f === this.main && d && p < d.s)) { f = this.main; p = d ? d.e : this.src(this.main).length; }
    const src = this.src(f);
    let nlB = 0; for (let k = p - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
    let nlA = 0; for (let k = p; k < src.length && /\s/.test(src[k]); k++) if (src[k] === '\n') nlA++;
    return { f, p, d, pre: p === 0 ? '' : '\n'.repeat(Math.max(0, 2 - nlB)), post: '\n'.repeat(Math.max(0, 2 - nlA)) };
  }

  // The edits that put these pictures of the project into the text: a centered
  // \includegraphics after the paragraph, list or table the caret is in (inside one, or inside
  // a heading's braces, the block would stop TeX), at the end of the text when there is no
  // caret; and \usepackage{graphicx} when the preamble has none. names are safe (openFiles).
  figureEdits(names) {
    const { f, p, pre, post, d } = this.afterBlockPos();
    const main = this.src(this.main);
    const tex = names.map((n) => '\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{' + n + '}\n\\end{center}').join('\n\n');
    const edits = [{ f, s: p, e: p, t: pre + tex + post }];
    let shift = 0;
    // graphicx once, after the last \usepackage line, as a package for an equation's symbol is
    // added (src/preamble.js); graphics, loaded by hand, does as well
    const others = d ? this.preambleOthers() : [];
    if (d && !hasPackage(main, 'graphics', d.at, others)) {
      const add = usePackage(main, 'graphicx', null, { end: d.at, others });
      for (const x of add) edits.push({ f: this.main, ...x });
      if (f === this.main) shift = add.reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    }
    return { edits, caret: { f, p: p + shift + pre.length + tex.length, bias: -1 } };
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
      this.saveTitle();
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
    this.clearLink(name, 'main.tex');
    this.loadProject(new Map([['main.tex', '\\documentclass{article}\n\\usepackage{amsmath}\n\n\\begin{document}\n\n\\end{document}\n']]), 'main.tex', name, 'New document');
    // ready to type: the button kept the focus, so the first words went nowhere and a space
    // pressed it again
    if (this.ghost && this.ghost.sticky) this.caretToGhost();
    this.toast('A new document. The one you had is under Review, Versions.', 5000);
  }

  async doReset() {
    await this.snapshot('Before loading the sample', { force: !this.lastSig });
    await this.stashBinary();
    this.loadSample();
    this.clearLink();
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
  // shown: the pane already holds what the last run left (Download PDF opens it on an error)
  togglePdf(force, shown) {
    const on = force ?? !document.body.classList.contains('pdf-on');
    if (on && document.body.classList.contains('src-on') && window.innerWidth < 1500) this.toggleSource(false);
    document.body.classList.toggle('pdf-on', on);
    $('#b-pdf').setAttribute('aria-pressed', on ? 'true' : 'false');
    this.prefs.pdf = on;
    store(PREFS, this.prefs);
    if (on) {
      this.pdfPane();
      if (!shown && (!this.lastPdf || this.pdfStale)) this.compilePdf();
    }
    setTimeout(() => { if (this.computePx()) this.relayout(true); }, 30);
  }

  pdfPane() {
    if (!this.pdfView) this.pdfView = new PdfView($('#pdf-host'), { workerUrl: asset('tex/pdf.worker.min.mjs'), onClickSource: (f, line) => this.fromPdf(f, line) });
    return this.pdfView;
  }

  texEngine() {
    if (!this.tex) {
      // a full TeX Live mirror: ?texlive=URL, or the one a self-hosted build names (RIKUY_MIRROR)
      let mirror = null;
      try { mirror = new URLSearchParams(location.search).get('texlive') || (typeof __RIKUY_MIRROR__ !== 'undefined' && __RIKUY_MIRROR__) || null; } catch (e) { /* none */ }
      // the page's own address can name a mirror only on its own site: a link to someone's copy
      // with ?texlive= pointing elsewhere would fill their browser's TeX cache from a stranger
      try { if (mirror && new URLSearchParams(location.search).get('texlive') === mirror && new URL(mirror, location.href).origin !== location.origin) mirror = null; } catch (e) { mirror = null; }
      this.tex = new TeXEngine(new URL('tex/', location.href).href, mirror ? new URL(mirror, location.href).href : null, asset('tex/'));
      // (a TeX started ahead of any press says nothing in the PDF pane; what it said last is
      // shown when a compile joins it)
      this.tex.onStatus = (s) => {
        this.texLast = s;
        if (!this.texQuiet) this.texStatus(s);
        // TeX begins to typeset: the PDF viewer's scripts come meanwhile
        if (s.status === 'pass' && !this.pdfWarmed) { this.pdfWarmed = true; this.pdfPane().warm(); }
      };
    }
    return this.tex;
  }

  // What TeX is doing and how a run ended, as one line of plain text in the page's "PDF status"
  // region. The pane shows the same in three places (its status, its bar, its message), which
  // are gone while it is closed; this line is there for a screen reader and an agent either way.
  pdfSay(text) {
    const el = $('#pdf-live');
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (el && el.textContent !== text) el.textContent = text;
  }

  texStatus(s) {
    const st = $('#pdf-status'), bar = $('#pdf-prog');
    const say = (html, frac) => {
      st.innerHTML = html;
      // (the megabytes change many times a second: said once, without them)
      this.pdfSay(s.status === 'engine' ? 'Downloading TeX Live, once\u2026' : st.textContent);
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

  // "Make available offline" (src/pwa.js) compiles the open document once: whatever it reads
  // beyond the planned folders is then kept too. Gives the packs it read, [number, folder].
  // Also whether it went through: {read, unkept, ok, failed}, or null when no compile ended
  // (another project was opened, or nothing came back in six minutes).
  async compileForOffline() {
    const until = Date.now() + 360000;
    const idle = async () => { while (this.compiling && Date.now() < until) await new Promise((r) => setTimeout(r, 150)); };
    await idle();
    if (this.compiling) return null;
    this.pdfPane(); // the viewer too: its scripts are then kept with the rest
    await Promise.race([this.compilePdf(), new Promise((r) => setTimeout(r, Math.max(0, until - Date.now())))]);
    await idle();
    return this.compiling ? null : this.lastCompile;
  }

  async compilePdf(opts = {}) {
    if (this.compiling) { this.compileAgain = opts.clean ? 'clean' : (this.compileAgain || true); return; }
    this.compiling = true;
    this.lastCompile = null;
    this.pdfStale = false;
    this.stopped = false;
    const gen = this.pdfGen || 0;
    const st = $('#pdf-status'), bar = $('#pdf-prog'), msg = $('#pdf-msg');
    let said = ''; // how the run ended, for the "PDF status" line
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
      if (this.texQuiet) { this.texQuiet = false; if (!engine.info && this.texLast) this.texStatus(this.texLast); }
      if (__RIKUY_APP__ && !this.prefs.texUsed) { this.prefs.texUsed = true; this.savePrefs(); }
      if (!engine.info) bar.hidden = false;
      // a document that came in a link compiles restricted, and the worker keeps nothing of it
      const li = await this.linkInfo();
      const untrusted = !!(li && !li.allowed);
      this.syncEngineMenu();
      // The packs this project's last compile read, handed to the worker to load together before
      // TeX starts. Without them TeX asks for each when it first opens a file from it, one after
      // another and with everything else waiting; in a later session they come from what the
      // browser kept (a repeat visit's first PDF came 0.4 s sooner of 5.6), and where nothing
      // was kept they are the downloads this document needs anyway.
      const project = this.name + '|' + this.main;
      const prefetch = (info) => { const h = load(TEXREAD); return h && info && h.p === project && h.v === info.v && Array.isArray(h.n) ? h.n.filter((n) => Number.isInteger(n) && n >= 0 && n < info.packs).slice(0, 400) : []; };
      const res = await engine.compile({ project, files: await this.compileFiles(), main: this.main, clean: !!opts.clean, prefetch, bibSig, engine: this.engineChoice(), shellEscape: this.prefs.shellEscape !== false && !untrusted, untrusted });
      if (gen !== (this.pdfGen || 0)) return; // another project was opened meanwhile
      // (a pass from the preamble's format opens no class or package: its list is short of them)
      if (res.ok && engine.info && !res.fromFormat && !(res.unkept && res.unkept.length)) store(TEXREAD, { p: project, v: engine.info.v, n: (res.read || []).map((x) => x[0]) });
      this.lastCompile = { read: res.read || [], unkept: res.unkept || [], unkeptScripts: !!res.unkeptScripts, ok: !!res.ok, failed: '', engine: res.engine || null, pages: 0 };
      // TeX stopped where a file's pack could not be loaded (offline, or the network failed)
      // the copy on claude.ai has no room for the Chinese and Arabic fonts: say where they are
      if (res.unkeptScripts && SCRIPT_HOST && navigator.onLine !== false) throw Object.assign(new Error('This copy of Rikuy has no room for the Chinese and Arabic fonts this document needs. Open the document in the full Rikuy at ' + SCRIPT_HOST + ' (Download, LaTeX saves it; Open there loads it).'), { scripts: true });
      if (res.unkept && res.unkept.length) throw Object.assign(new Error('Some TeX files could not be loaded (' + res.unkept.slice(0, 5).join(', ') + (res.unkept.length > 5 ? ' and more' : '') + '); check the network and compile again'), { unkept: res.unkept });
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
        this.lastCompile.pages = n;
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
      const first = this.texIssues.find((x) => x.sev === 'error') || this.texIssues.find((x) => x.sev === 'warn');
      said = st.textContent + (errs || warns ? '. ' + msg.textContent.replace(/\.? ?Show them$/, '') + '. First: ' + first.msg + (first.line ? ' (' + first.f + ', line ' + first.line + ')' : '') : '') + (res.ok ? '' : '. No PDF was made.');
    } catch (e) {
      const why = this.stopped ? 'stopped' : String((e && e.message) || e || 'failed');
      if (this.lastCompile) this.lastCompile.failed = why; else this.lastCompile = { read: [], unkept: [], ok: false, failed: why };
      if (this.stopped) {
        this.stopped = false;
        st.innerHTML = '<b>' + (this.engineLabel || 'TeX') + '</b> stopped';
        msg.hidden = false; msg.classList.remove('ok');
        msg.innerHTML = '<b>Stopped after ' + Math.round((Date.now() - this.compileStart) / 1000) + ' s.</b> A loop in a macro, or a very long document, keeps TeX busy.';
        said = st.textContent + '. ' + msg.textContent;
        this.compileAgain = false;
        return;
      }
      st.textContent = 'TeX could not run here';
      $('#pdf-host').innerHTML = '';
      const d = document.createElement('div'); d.className = 'pdf-empty';
      // offline, a file TeX has not kept fails to load; say what to do rather than "Failed to fetch"
      const need = e && e.unkept ? ' (' + e.unkept.slice(0, 5).join(', ') + (e.unkept.length > 5 ? ' and more' : '') + ')' : '';
      const off = __RIKUY_APP__ && APP.on && navigator.onLine === false ? 'You are offline, and this document needs TeX files this browser has not kept yet' + need + '. Compile it once with a network and they stay; Make available offline in the status bar keeps those of a typical paper and of the open document. ' : '';
      d.textContent = e && e.scripts ? e.message + ' The page preview can still be printed.' : off + this.texFailText(e, !!off, !!need) + 'The page preview can still be printed.';
      said = st.textContent + '. ' + d.textContent;
      const b = document.createElement('button'); b.className = 'btn sm'; b.type = 'button'; b.textContent = 'Print the preview'; b.style.marginTop = '10px';
      b.addEventListener('click', () => this.printPDF());
      d.append(document.createElement('br'), b);
      $('#pdf-host').appendChild(d);
    } finally {
      clearInterval(this.compileTick);
      $('#pdf-re').textContent = 'Recompile';
      bar.hidden = true;
      if (said) this.pdfSay(said);
      this.compiling = false;
      const again = this.compileAgain;
      this.compileAgain = false;
      if (again && document.body.classList.contains('pdf-on')) this.compilePdf({ clean: again === 'clean' });
      else if (textSig(this.main, [...this.files.entries()]) !== sig) this.pdfSoon();
    }
  }

  // One run of TeX for a script (rikuy.api.compile): the PDF of the text as it is now, or why
  // there is none. As Download PDF does, it opens nothing: the preview stays open or closed as
  // it was, and the PDF TeX last made is taken when the text has not changed since.
  async compileResult() {
    const idle = async () => { while (this.compiling) await new Promise((r) => setTimeout(r, 100)); };
    await idle();
    const fresh = !!this.lastPdf && this.lastPdfSig === this.textSigNow() && !!this.lastCompile && this.lastCompile.ok;
    if (!fresh) { this.pdfPane(); await this.compilePdf(); await idle(); }
    const c = this.lastCompile || { ok: false, failed: 'another document was opened while TeX ran' };
    const ok = !!c.ok && !!this.lastPdf;
    // TeX's own findings; a run that could not start or was stopped has one problem, saying why
    const problems = c.failed ? [{ severity: 'error', message: c.failed, file: null, line: null }]
      : this.texIssues.map((x) => ({ severity: x.sev === 'warn' ? 'warning' : x.sev, message: x.msg, file: x.f || null, line: x.line || null }));
    if (!ok && !problems.some((x) => x.severity === 'error')) problems.unshift({ severity: 'error', message: 'TeX made no PDF', file: null, line: null });
    return { ok, engine: c.engine || null, pages: ok ? c.pages || 0 : 0, problems, pdf: ok ? new Uint8Array(this.lastPdf.slice(0)) : null };
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
    this.pdfSay('');
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
    const html = '<!doctype html><html lang="' + (sheet.lang || 'en') + '"' + (/^(ja|ko)$/.test(document.documentElement.dataset.cjk || '') ? ' data-cjk="' + document.documentElement.dataset.cjk + '"' : '') + '><head><meta charset="utf-8"><title>' + esc(this.name || 'paper') + '</title><style>' + css +
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
      <p>Rikuy is a writing app for papers: you type on the finished page, and it keeps a LaTeX file up to date behind it.</p>
      <p>The ribbon above the page works as in Word. Its tabs (Home, Insert, References, Review, View, Help, and Table Layout while the caret is in a table) each hold a row of buttons; Home has what you need most. Styles sets the paragraph you are in as Normal, a Heading, a Quote, or LaTeX, which shows it as its LaTeX source to type in directly. Make words bold, italic or underlined, start a list. Insert adds a formula, an equation, a table, a picture, a footnote, a citation or a link where the caret is. Search in the bar (Alt+Q) finds any command by its name, and a right click on the page lists what applies there.</p>
      <p>Download gives you the paper as a PDF, as a Word file or as LaTeX. Live graphs stay live only in the LaTeX download. Preview shows the PDF beside the page.</p>
      <p>The page is typeset from your LaTeX source. Every edit you make on the page is written back into the source as the smallest possible change.</p>
      <dl class="keys">
        <dt>Type, select, delete</dt><dd>As in any editor</dd>
        <dt>${mod}+B, ${mod}+I</dt><dd>Bold, italic (\\textbf, \\emph)</dd>
        <dt>${mod}+Alt+1, 2, 3, ${mod}+Alt+0</dt><dd>Heading 1, 2, 3; Normal</dd>
        <dt>${mod}+Shift+L</dt><dd>Bulleted list</dd>
        <dt>Alt+Q</dt><dd>Search for a command by its name</dd>
        <dt>Shift+F10, right click</dt><dd>The menu of what applies here; a second right click gives the browser's (spelling)</dd>
        <dt>${mod}+F1</dt><dd>Fold the ribbon to its tabs, and back</dd>
        <dt>$ or ${mod}+M</dt><dd>New inline math</dd>
        <dt>${mod}+Shift+E</dt><dd>New numbered equation</dd>
        <dt>\\ or ${mod}+K</dt><dd>Insert a command</dd>
        <dt>Click math, a citation or a reference</dt><dd>Edit it in place</dd>
        <dt>Alt+click</dt><dd>Show that spot in the source</dd>
        <dt>Tab, ${mod}+Enter</dt><dd>Next cell, new row in tables</dd>
        <dt>Tab, Shift+Tab in a list</dt><dd>The item one level down, under the item before it, or one up. Typing "- ", "1. " or "a) " at a paragraph's start makes it a list (Undo gives back what you typed)</dd>
        <dt>${mod}+Z, ${mod}+Shift+Z</dt><dd>Undo, redo</dd>
        <dt>${mod}+Alt+M</dt><dd>Comment on the selected words. A comment is a LaTeX comment line in the source, so Overleaf, Git and TeX keep it and print nothing</dd>
        <dt>Paste</dt><dd>From Word, Google Docs or the web: bold, italics, lists, links, tables and equations become LaTeX. ${mod}+Shift+V pastes plain text</dd>
        <dt>Copy</dt><dd>Keeps formatting; equations paste into Word as equations</dd>
        <dt>${mod}+Shift+O</dt><dd>Outline, problems (undefined references, missing citations, unclosed environments) and changes</dd>
        <dt>${mod}+F, ${mod}+H, ${mod}+G</dt><dd>On the page: Find (in the Navigation pane), Replace, Go To. What is found is the text the page shows, never a command or math; elsewhere ${mod}+F is the browser's own find</dd>
        <dt>Alt+Shift+arrows, ${mod}+Alt+O</dt><dd>Promote or demote a heading with those under it; move a paragraph, an item, or a heading's whole section up or down; the Outline view</dd>
        <dt>Esc, then Tab</dt><dd>Leave the source pane, where Tab indents</dd>
        <dt>PDF or ${mod}+P</dt><dd>Compiles with TeX Live 2026, running in this browser, and shows the exact PDF: pdfLaTeX, XeLaTeX or LuaLaTeX (Auto reads a <code>% !TeX program</code> line or the preamble). Shell escape runs Ghostscript, gnuplot, Pygments for minted and makeindex here too. It recompiles after each edit; TeX's errors appear under Problems with their line; click the PDF to find that text, click the page to find it in the PDF</dd>
      </dl>
      <p><b>Review</b> lists the comments, then every edit since you opened the project, or since any saved version, with Accept and Reject; tick Show changes on the pages to see them marked like Word's Track Changes. Versions are kept every few minutes, when you leave, when you save the .zip, and under any name you give.</p>
      <p><b>Share</b> copies a link that opens this document for anyone, ready to type in, with no account: the document travels inside the link and is not uploaded. Coauthors type and comment on the page and send a link back; their edits arrive here as changes to accept or reject. Share also opens the project in Overleaf, and Download LaTeX gives a plain .tex (or a .zip with several files), so leaving takes one click. From Overleaf: Menu, Download, Source, and drop the .zip on the page. With Overleaf's Git integration, paste the project's address under Git, Clone, and push and pull keep both in step.</p>
      <p><b>Git</b> makes the project a real repository in this browser: commit, history, compare or restore any commit, branches, push and pull. Download LaTeX then gives a .zip with the .git folder in it, so the download is a clone; opening a .zip or folder that has one brings its history in.</p>
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
      <p class="pop-note">Rikuy is free software under the GNU Affero General Public License 3.0 or later. Its source, with the sources and licenses of the programs it runs (TeX Live, Ghostscript, Asymptote, gnuplot and the rest), is at <a href="https://github.com/pdfrackebrandt/rikuy" target="_blank" rel="noopener">github.com/pdfrackebrandt/rikuy</a>; the license texts are also in <a href="LICENSES.txt" target="_blank" rel="noopener">LICENSES.txt</a> next to this page.</p>
      <p class="pop-note">Rikuy is made by one person, for free. If it helps you, <a href="https://github.com/pdfrackebrandt/rikuy" target="_blank" rel="noopener">star it on GitHub</a> (that is how others find it), tell a coauthor, and <a href="https://github.com/pdfrackebrandt/rikuy/issues/new/choose" target="_blank" rel="noopener">report what breaks</a>.</p>`);
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

  // Why TeX did not start, for the PDF pane. The worker's message for a missing TeX tree is
  // written for whoever built the page (tex/build_tree.py, README.md) and is right when the
  // server says the file is not there. A visitor whose download failed (no answer, a server
  // error) read the same build instructions: they get what to do instead.
  texFailText(e, off, need) {
    const m = (e && e.message) || '';
    if (/^The TeX tree is not next to this page/.test(m) && !/\(HTTP 4\d\d\)/.test(m)) return off ? '' : 'The TeX engine could not be downloaded. Check your connection, then press Recompile. ';
    return m && !(off && need) ? m + '. ' : '';
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

// ---- for scripts on the page ------------------------------------------------------------
// window.rikuy.api: what a script on the page (an AI agent's, a test's) may count on. These
// ten names stay from version to version (commands and run came in 0.26.0, the others before); the rest of window.rikuy is the app itself and
// changes without notice. Nothing here does more than a person at the keyboard can: a new
// source goes through the edit path typing takes (one undo takes it back), a compile is the
// one Download PDF runs, and a copy someone shared is read here but not changed.
function agentApi(app) {
  const flush = () => { if (app.srcRebuild.pending()) app.srcRebuild.flush(); };
  const mine = (what) => {
    if (document.body.classList.contains('guest')) throw new Error('rikuy.api.' + what + '() changes the document, and this one is open in guest view (a copy someone shared): a script can read it, not change it. getSource(), getFiles(), needs() and compile() work here.');
  };
  return Object.freeze({
    // the build: the package's version, and in the installed app the hash of its files too
    version: VERSION + (__RIKUY_APP__ && appInit().on ? '+' + appInit().v : ''),
    // resolves once the app has started and the document is on the page
    whenReady() { return app.ready.then(() => undefined); },
    // the main file's text, as it is now
    getSource() { flush(); return app.src(app.main); },
    // every file of the project: text as { name, text }, anything else as { name, bytes }
    getFiles() {
      flush();
      const out = [...app.files].map(([name, text]) => ({ name, text }));
      const seen = new Set(app.files.keys());
      for (const m of [app.assetBlobs, app.extra]) for (const [name, b] of m) if (!seen.has(name)) { seen.add(name); out.push({ name, bytes: b.size ?? b.byteLength ?? 0 }); }
      return out;
    },
    // the main file becomes this text, as one edit; resolves when the page shows it
    async setSource(text) {
      if (typeof text !== 'string') throw new TypeError('rikuy.api.setSource(text) takes the LaTeX source as a string.');
      await app.ready;
      mine('setSource');
      // a source the page cannot read would leave it showing the old text: refused, as a link's is
      try { buildModel({ files: new Map([...app.files, [app.main, text]]), main: app.main }); }
      catch (e) { throw new Error('The page cannot read this source (' + e.message + '). Nothing was changed.'); }
      // (an open dialog writes what it holds as it closes: before the two texts are compared)
      app.closePop(true, true);
      flush();
      const main = app.src(app.main), d = diff(main, text);
      if (!d) return;
      app.closeGroup();
      app.commit([{ f: app.main, s: d.s, e: d.s + d.del.length, t: d.ins }], null, 'api');
      app.closeGroup();
      if (app.src(app.main) !== text) throw new Error('The source could not be changed.');
    },
    // one run of TeX on the project as it is: { ok, engine, pages, problems, pdf }
    async compile() { await app.ready; flush(); return app.compileResult(); },
    // the scripts the text is in and the preamble does not set up: ids such as 'chinese'
    needs() { flush(); return [...(app.scriptNeedsNow(true) || [])]; },
    // what "Set it up" does; resolves to the engine the lines lead to, or null when none were added
    async setUpScripts() { await app.ready; mine('setUpScripts'); return app.scriptSetUp() || null; },
    // every command of the interface, as the ribbon, the keys and the search box have them:
    // [{ id, name, tab, group, keys, enabled }], enabled where the caret is now
    commands() {
      flush();
      const at = app.ribbonAt();
      if (at) at.memo = {};
      return commands().filter((c) => c.run && c.searchable !== false).map((c) => ({ id: c.id, name: c.name, tab: c.tab || null, group: c.group || null, keys: [...(c.keys || []), ...(c.keysElsewhere || [])], enabled: enabled(app, c, at) }));
    },
    // one command by its id where the caret is, as its button does: resolves to true when it ran,
    // false when it cannot run there (commands() says which can)
    async run(id, args) {
      await app.ready;
      mine('run');
      if (typeof id !== 'string' || !command(id) || !command(id).run) throw new TypeError('rikuy.api.run(id) takes the id of a command: rikuy.api.commands() lists them.');
      flush();
      const r = await app.runCommand(id, args);
      return r !== false;
    }
  });
}

// (joined so that no module takes a name another or the app has: joinMethods throws, naming both)
joinMethods(App.prototype, { 'src/collab.js': collab, 'src/word.js': word, 'src/ribbon.js': ribbon, 'src/nav.js': nav, 'src/review.js': review, 'src/ribbon/tabs.js': tabs,
  'src/ui/gallery.js': galleryMethods, 'src/ui/search.js': searchMethods, 'src/ui/menu.js': menuMethods, 'src/cmd/*.js': cmdMethods });
// one item of the insert list, where the caret is: what the ribbon's Insert buttons press
App.prototype.insertFromPalette = function (k) {
  const c = this.caretNow(), x = paletteItems().find((y) => y.k === k);
  if (c && x) this.runPalette(x, c.ghost ? null : { f: c.f, a: c.a, b: c.b }, c.ghost ? this.ghost : null);
};
// a link opened from a command (Help's) as one in a document is: web and mail addresses only
App.prototype.openLink = openLink;
App.prototype.textSigNow = function () { return textSig(this.main, [...this.files.entries()]); };
// the Word worker's files, asked for as the page asks for its other files (src/word.js)
App.prototype.assetUrl = asset;

const app = new App();
Object.defineProperty(app, 'api', { value: agentApi(app), enumerable: true });
window.rikuy = app;
installCollab(app);
installWord(app);
installRibbon(app);
installKeys(app, isMac, (id, at) => app.runCommand(id, null, at));
installSearch(app);
installMenu(app);
app.isBalanced = isBalanced;
// for tests and the batches' own checks: the registry and the parts controls are made of
app.cmds = { command, commands, describe, enabled, register, unregister, run: (id, args) => runCmd(app, id, args) };
app.kit = kit;
app.init().catch((e) => { console.error(e); app.readyFail(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Rikuy could not start: ' + e.message; });
