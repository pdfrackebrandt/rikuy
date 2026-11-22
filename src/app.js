// Rikuy app shell: rebuild pipeline, history, input, popovers, files.
import { siInMath } from './siunitx.js';
import { buildModel, INCR } from './model.js';
import { Renderer, BLOCKS, esc, widgetCss } from './render.js';
import { Layout, geometry } from './layout.js';
import {
  posFromDom, CaretIndex, segOfSpan, atomOfEl, styOfEl, visibleRanges, escapeTeX, textToTeX, withPdfText,
  endsWithControlWord, isBalanced, diff, stepStart, stepJoin, boundary, clusterEdge, sourceEdge, backspaceUnits
} from './editor.js';
import { SAMPLE } from './sample.js';
import { splitRows, parseJS, scanUserSigs, setNativeParse } from './parser.js';
import { mathNeeds } from './ui/eqtab.js';
import { installWordTyping, wordShortcuts, makeDialect, classifyMacros, resolveCommand, PACKAGES, WORD_GROUPS, FIELD_MACROS, fieldValue, modelValue, mathOnly } from './wordmath.js';
import { isTallDef, fitBrackets, tallTest } from './fences.js';
import { loadCore, coreReady, coreCanRun, coreStats, nativeParse } from './native.js';
import { minimalRow, makeSame } from './minimal.js';
import { htmlToTeX, plainToTeX, unwrapMath } from './paste.js';
import { chainAt } from './charfmt.js';
import { mapPos } from './wrap.js';
import { findProblems, missingFigures } from './problems.js';
import { WidgetLayer } from './widget.js';
import { APP, appInit, asset as appAsset, registerApp, takeLaunches, takeShared, warmTeX } from './pwa.js';

// Gray boxes of 320 by 240 points that stand in, in a coauthor's PDF, for figures a link does
// not carry: a PDF, a PNG whose resolution makes it that size, and EPS for latex with dvips.
const PLACEHOLDER_PDF = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMjAgMjQwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCA+PiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDUxID4+CnN0cmVhbQowLjg1IGcgMCAwIDMyMCAyNDAgcmUgZiAwLjYgRyAyIHcgMSAxIDMxOCAyMzggcmUgUwplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDIxOSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDUgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjMxOQolJUVPRgo=';
const PLACEHOLDER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAAAAACRn/EaAAAACXBIWXMAAAAjAAAAIwHV9BZdAAAADklEQVR42mO4CQQMcAIATFkKLSVMoyAAAAAASUVORK5CYII=';
const PLACEHOLDER_EPS = '%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 320 240\n0.85 setgray 0 0 320 240 rectfill\n0.6 setgray 2 setlinewidth 1 1 318 238 rectstroke\nshowpage\n';
import { texToPlain, shortAuthors, entryYear, parseBib } from './bib.js';
import { kvGet, kvPut, kvDel, kvSwap, decodeText, encodeText, snapAdd, snapAll, snapFiles, snapDel, snapPrune } from './store.js';
import { changes, spacingOnly } from './diff.js';
import { TeXEngine, parseTeXLog, issueText } from './tex.js';
import { PdfView } from './pdfview.js';
import { collab, installCollab, cleanProjectName } from './collab.js';
import { word, installWord, isDocx } from './word.js';
import { ribbon } from './ribbon.js';
import { nav } from './nav.js';
import { review } from './review.js';
import { $, mk, mkBtn, store, load, PREFS, textSig, when } from './ui/dom.js';
// the command registry and everything drawn from it: the ribbon's tabs, the keys, the search box,
// the right click menu, the insert list (src/commands.js, src/cmd/*.js)
import { labelsIn, labelPreview } from './find.js';
import { paletteItems, insertTextHooks, command, commands, describe, enabled, register, unregister, run as runCmd, joinMethods } from './commands.js';
import { methods as cmdMethods } from './cmd/index.js';
import { tabs, installRibbon } from './ribbon/tabs.js';
import { methods as galleryMethods } from './ui/gallery.js';
import { methods as searchMethods, installSearch } from './ui/search.js';
import { methods as menuMethods, installMenu } from './ui/menu.js';
import { installFileView } from './ui/fileview.js';
import { methods as helpPaneMethods } from './ui/helppane.js';
import { installDock } from './ui/dock.js';
import { installKeys } from './keys.js';
import { installMotion, flash } from './motion.js';
import { installCaret } from './caret.js';
import { installWebMcp } from './webmcp.js';
import { TOOLS, agentTools, callTool as callAgentTool, describeCommand } from './agent.js';
import * as kit from './ui/kit.js';
import { usePackages, hasPackage, usePackage, preambleEnd, stripComments, packages, docClass, pickMain } from './preamble.js';
import { LATEX_MARK, lineStart as lineAt, isEnvStyle, envOf, THM_STYLES, titleInfo } from './styles.js';
import { tableAt, cellAt as tableCellAt, colAlign, clipToCell, clearCells, blockTabular } from './table.js';
import { eolAt } from './blockenv.js';
import { shareParam, texParam, commentOnly, cleanPath } from './share.js';
import { version as VERSION } from '../package.json';
import { savedToken, keepToken, dropReplaced, canonicalRemote, remoteHost, legacyChoice } from './gitauth.js';
import { scriptNeeds, scriptLines, addScriptSetup, scriptName, scriptSetup, MORE } from './scripts.js';
// the character formats that carry a value (src/charfmt.js CHAR_KINDS): one is not another of its kind
const VALUED = new Set(['color', 'highlight', 'shading', 'size', 'family', 'spacing', 'scale', 'position', 'border', 'enclose']);

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
  cmBrackets: 'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/edit/matchbrackets.js',
  zip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  ml: 'https://cdn.jsdelivr.net/npm/mathlive@0.110.0/mathlive.min.js',
  chem: 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/contrib/mhchem.min.js'
};
// The hash of each file as published on npm, which jsDelivr serves unchanged: a CDN that
// served anything else would get no script run in this page. (CodeMirror's .min.js names
// are minified by jsDelivr itself, so their bytes are not the package's: the package's own
// files load instead.) A new version needs its new hash here.
const SRI = {
  [CDN.cm]: 'sha384-/WlgLpnUCi+5eS6SnLPKTwRY0l8X4TxBIroMKS0KpFjlFoST+ZbSMKqTpgS24m8i',
  [CDN.cmTex]: 'sha384-tab09zZeKEC2HRX/8GcAyeUuP7KBvb9DKKK4wegfZ/qW7tMcwh14TRJ0o6woQ9M0',
  [CDN.cmBrackets]: 'sha384-VTfea43jk3cts7Fd5DbskOZKCo1P+X4qCWSv0+oIhMKaSymJL4+KZ9eC6VzkZbab',
  [CDN.zip]: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
  [CDN.ml]: 'sha384-5IN6K0kiaz8MufrTGBvPCP3oDeMjmwe+DDTvuyQLNv6gc634FpKbQfllonjHJPmy',
  [CDN.chem]: 'sha384-fB8BH//9nBzROkMUsu/Dr35jWHIbnKesUo9rW0hfEgw8mZGnkAyBAjKX9F98OVuo'
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
// The proxy git's push, pull and clone go through by default: GitHub and GitLab send no CORS
// headers for git, so a browser cannot reach them directly. It is Rikuy's own, on the page's own
// site (/git, functions/git/[[path]].js on Cloudflare Pages, src/gitproxy.js), so the hosted
// policy keeps connect-src 'self' and no third party sees a token. The third party's address
// earlier versions filled in, and kept once used, counts as no choice; a proxy the user typed
// elsewhere is theirs (a copy of Rikuy served without the hosted policy can use it).
const gitProxyHere = () => new URL('git', location.href).href;
const OLD_GIT_PROXY = 'https://cors.isomorphic-git.org';
const gitProxyOf = (prefs) => (prefs.gitProxy == null || prefs.gitProxy === OLD_GIT_PROXY ? gitProxyHere() : prefs.gitProxy);
// what the CORS proxy field keeps: nothing when it holds this site's own (the page may move)
const keepGitProxy = (prefs, v) => { prefs.gitProxy = v === gitProxyHere() ? null : v; return v; };
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
// Whether this page may not compile WebAssembly (an empty module): Safari 15 refuses it under the
// hosted policy, which allows it by 'wasm-unsafe-eval' alone (build/app.mjs policy)
function wasmRefused() {
  try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return false; } catch (e) { return true; }
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
// What the insert list (\) offers comes from the command registry (src/commands.js,
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

// A $ typed in a formula's LaTeX box ends the formula, as the closing $ does in the source; not
// in an empty box (a dollar sign: newMath's own rule) nor after a backslash (\$, a dollar)
function dollarEnds(ta) {
  const before = ta.value.slice(0, ta.selectionStart);
  return !!ta.value.trim() && ta.selectionStart === ta.selectionEnd && !/(^|[^\\])(\\\\)*\\$/.test(before);
}
// The text of the latexmkrc that came with a project (Overleaf's and arXiv's archives carry one),
// for the document it names; '' when there is none.
async function latexmkrcText(extra) {
  // (its first 64 KB: a stranger's archive may hold a huge one)
  for (const [n, b] of extra) if (/^\.?latexmkrc$/i.test(n)) { try { return (typeof b === 'string' ? b : await b.slice(0, 65536).text()).slice(0, 65536); } catch (e) { return ''; } }
  return '';
}
// What the equation field is given, set as math. MathLive's setValue inserts in the mode at its
// caret, and after a value whose caret ends in \text{...} every later value went in as one text
// run: the LaTeX box's `a \text{s.t.} c` showed as \text{a \textbackslash text...}, and the next
// key typed in the field wrote that run back into the source.
const MATH_VALUE = { silenceNotifications: true, mode: 'math', format: 'latex' };

// at most this much of Undo's steps is kept across a reload (App.historyKept)
const HIST_BYTES = 2e6;

// What stands before a paragraph's first word when the caret there is at its start: a blank line,
// or the line of a \begin{...} (the document, a quote, a theorem with its [title]), a heading or
// \maketitle; then any comment lines and a \noindent, which belong to the paragraph below them
// (group 1: the new paragraph goes before them, src/app.js enter)
const PARA_START = /(?:\n[ \t]*\n|\\begin\s*\{[^{}\n]*\}(?:\[[^\]\n]*\])?[ \t]*\n|\\(?:part|chapter|section|subsection|subsubsection|paragraph)\*?\s*\{[^\n]*\}[ \t]*\n|\\maketitle[ \t]*\n)((?:[ \t]*%[^\n]*\n)*[ \t]*(?:\\noindent(?![A-Za-z])[ \t]*(?:\n[ \t]*)?)?)$/;
// whether the last thing the person did was a key or a press, as html.rk-keys: the focus rings
// follow it where the code moves the focus (a menu's first item, File's Back), since the
// browser's own guess, :focus-visible, differs between Chromium's versions there
if (typeof document !== 'undefined') {
  const set = (on) => { document.documentElement.classList.toggle('rk-keys', on); };
  document.addEventListener('keydown', (e) => { if (!['Shift', 'Control', 'Meta'].includes(e.key)) set(true); }, true);
  document.addEventListener('pointerdown', () => set(false), true);
}
// A field of a dialog, a pane or File kept in sight when the window shrinks under it, as the
// on-screen keyboard makes it (UI-PRINCIPLES.md T6, WCAG 2.4.11): the field the keys type into was
// left under the keyboard, below the sheet's scrolled part (Page setup's last margins, Properties'
// Keywords). The page itself is the browser's to scroll.
if (typeof window !== 'undefined') {
  let kt = 0;
  const inSight = () => {
    cancelAnimationFrame(kt);
    kt = requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || !a.matches || !a.matches('input, textarea, select') || !a.closest('.pop, #fr, .stp, .help-pane, .sp-pane, #rp-file')) return;
      const vv = window.visualViewport, r = a.getBoundingClientRect(), bottom = vv ? vv.offsetTop + vv.height : innerHeight;
      let top = vv ? vv.offsetTop : 0, low = bottom;
      for (let e = a.parentElement; e && e !== document.body; e = e.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(e).overflowY)) { const q = e.getBoundingClientRect(); top = Math.max(top, q.top); low = Math.min(low, q.bottom); }
      }
      if (r.top < top || r.bottom > low) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  window.addEventListener('resize', inSight);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', inSight);
  document.addEventListener('focusin', inSight);
}
// the controls a dialog's Tab goes round, in order: shown, enabled, reachable by Tab
function popFocusables(p) {
  return [...p.querySelectorAll('button, [href], input, select, textarea, [tabindex]')].filter((x) => x.tabIndex >= 0 && !x.disabled && !x.closest('[inert], [hidden]') && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
}

class App {
  constructor() {
    // (the project's texts; read while letters wait in the typing queue, typeQueue, they go in
    // first: whatever reads the text, a timer, a command, a script, sees what was typed)
    Object.defineProperty(this, 'files', { get() { if (this.typeQ) this.typeFlush(); return this.filesNow; }, set(v) { this.filesNow = v; }, configurable: true, enumerable: true });
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
      allow: () => this.allowWidgets(),
      // an interactive graph's Edit graph button and its menu (src/cmd/insert.js)
      decorate: (F) => this.graphDecorate && this.graphDecorate(F),
      menu: (F, x, y) => this.graphMenu && this.graphMenu(F, x, y),
      // (once a session: a live figure's frame did not load)
      stalled: () => {
        if (this.widgetStallNoted) return;
        this.widgetStallNoted = true;
        this.toast('A live figure could not start: its frame did not load (offline, and this browser no longer has the copy it kept). It shows its picture instead; with a connection it runs again.', 10000);
      }
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
    this.saveSoon = Object.assign(() => { this.zipDirty = true; this.unsaved = true; document.body.classList.add('zip-dirty'); persistSoon(); this.noteEdit(); this.noteSaveState(); }, { flush: () => persistSoon.flush(), cancel: () => persistSoon.cancel() });
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
      // (Undo's steps, written with this very copy of the project: historyKept)
      try {
        const H = await kvGet('history');
        if (H && H.t === (saved.hT ?? saved.t) && H.name === this.name && H.main === this.main && Array.isArray(H.hist)) {
          const live = (x) => ({ ...x, open: false, before: null, win: null, after: null });
          this.hist = H.hist.map(live);
          this.redoStack = (H.redo || []).map(live);
        }
      } catch (e) { /* the text loads without them */ }
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
    this.updateUndoUI();
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
    new ResizeObserver(debounce(() => this.refit(), 150)).observe(this.desk);
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
    loadCoreLater();
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
    // (Web Layout on a phone: the text at its actual size, the lines as wide as the screen)
    // (Mobile View, Web Layout under 700 px: the text at its actual size, whatever a phone's
    // sheet or text block setting is; a zoom chosen there scales it)
    const web = z === 'fit' && document.body.classList.contains('pg-web') && window.innerWidth < 700;
    // (and no margins to scroll past there: textFit's scroll kept the text 46 px off the screen's
    // left after Print Layout, view.py V3)
    this.textFit = !web && z === 'fit' && this.prefs.phone !== 'sheet' && window.innerWidth <= 520;
    if (web) px = PX_PER_PT;
    else if (this.textFit) px = Math.min(PX_PER_PT * 1.25, Math.max(avail / P.pw, (this.desk.clientWidth - 12) / P.tw));
    else if (z === 'fit') px = Math.min(PX_PER_PT * 1.25, avail / P.pw);
    else px = PX_PER_PT * z;
    px = Math.round(px * 1000) / 1000;
    const changed = px !== this.px;
    this.px = px;
    // (the zoom as a percentage, the one the status bar shows, as Word's does; fitting the width is
    // what a press does, its name)
    $('#zoomv').textContent = Math.round(px / PX_PER_PT * 100) + '%';
    // (its name stays "Fit width", what a press does; the zoom it shows is its description)
    $('#zoomv').setAttribute('aria-description', 'Zoom: ' + $('#zoomv').textContent);
    // with the text block as wide as the screen, the view starts at the text, not at the margin
    if (this.textFit && changed) requestAnimationFrame(() => { if (this.textFit) this.desk.scrollLeft = Math.max(0, P.ml * px - 6); });
    else if (web && changed) requestAnimationFrame(() => { if (!this.textFit) this.desk.scrollLeft = 0; });
    return changed;
  }

  rebuild(caret) {
    const t0 = performance.now();
    let model;
    // (views: the blocks shown as their LaTeX for a while, src/cmd/view.js Show LaTeX)
    // (pageFiles: Display for Review's Original draws the base's text, src/review.js)
    try { const files = this.pageFiles(); model = buildModel({ files, main: this.main, views: this.viewKeys() }, this.model && this.model.main === this.main && this.model.pageFiles === files ? this.model : null); model.main = this.main; Object.defineProperty(model, 'pageFiles', { value: files, configurable: true }); }
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

  // A float between a run in heading and its paragraph (src/model.js runIns, R2): TeX places the
  // float elsewhere and runs the heading into the paragraph after it. The items stay in the
  // source's order (the browser's selection, Delete and the caret follow it: a selection from
  // the heading into the text holds the float, which is drawn between them); the heading, which
  // takes no height, is drawn over its paragraph's first line, past the float.
  runInOverFloats(items) {
    for (let i = 0; i + 2 < items.length; i++) {
      const h = items[i].el;
      if (!h || !h.classList.contains('runin')) continue;
      h.style.transform = '';
      let j = i + 1;
      while (j < items.length && items[j].el && items[j].el.classList.contains('flt')) j++;
      const p = j > i + 1 && j < items.length ? items[j].el : null;
      if (!p || p.offsetParent !== h.offsetParent || p.offsetParent == null) continue;
      const dy = p.offsetTop - h.offsetTop;
      if (dy > 0) h.style.transform = 'translateY(' + dy + 'px)';
    }
  }

  layoutPass(force) {
    const model = this.model;
    const items = [], fns = [];
    for (const B of this.renderer.blocks) { for (const it of B.items) items.push(it); for (const f of B.fns) fns.push(f); }
    // (a wrapfigure goes into the paragraph it wraps: src/layout.js wrapPairs)
    items.splice(0, items.length, ...this.layout.wrapPairs(items));
    // (the sheet of the PDF TeX made of this set up, where there is one: src/layout.js sheetSize)
    const ps = this.pdfSheet, mk = model.opts.page && model.opts.page.mediaKey;
    model.opts.pdfSheet = ps && mk && ps.key === mk ? ps : null;
    // (View › Web Layout: the text as wide as the window, no pages: src/cmd/view.js)
    const g = this.viewGeometry(geometry(model.opts));
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
    // (headers, footers, line numbers, the watermark: drawn from the model's page set up, src/layout.js)
    this.layout.page = model.opts.page || {};
    this.layout.opts = model.opts;
    // (the text under a collapsed heading is left out of the page's view: src/cmd/find.js)
    this.foldFilter(items);
    // (every page drawn, or only those near the view in a document too big for that)
    const lazy = this.lazyPages(items);
    this.layout.measure(items, fns);
    const plan = this.layout.plan(items);
    this.layout.apply(plan);
    if (!lazy) this.root.classList.remove('lazy');
    this.runInOverFloats(items);
    this.items = items;
    this.plan = plan;
    this.index.dirty = true;
    this.tocPages(plan);
    if (this.markupOn()) this.marksSoon();
    this.commentsSoon();
    // (what Find found, marked again on the pages as they are now: src/cmd/find.js)
    this.findSoon();
    // (spelling's marks, on the pages as they are now: src/cmd/review.js)
    this.spellSoon();
    // (Show marks' dots, degree signs and label brackets: src/cmd/para.js)
    if (this.marksOn) this.paraMarksSoon();
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
    await this.allowMark('widgets');
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
    // not part of the document: contenteditable false, and the print rule hides it. The words
    // sit under the caret's own "Type here", so a blank page says what a dropped file does.
    const hint = mk('div', 'empty-hint');
    hint.id = 'empty-hint';
    hint.contentEditable = 'false';
    hint.setAttribute('role', 'note');
    hint.append(mk('p', '', 'Or drop a .tex file, a .zip, or a Word document on the page.'), mk('p', 'empty-keys', 'Alt+Q searches every command.'));
    g.appendChild(hint);
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

  // The reader's place by its source position: the caret when it is in view, else the text at the
  // window's top, with its distance from the top. A layout at another width or in another view
  // (a pane docked, Mobile View or Web Layout on and off) moves every line; kept as a place in the
  // source, it is found again where the text now is (a page fraction lost it: Part 81 to 51)
  readerSpot() {
    const D = this.desk.getBoundingClientRect(), s = getSelection();
    if (s.rangeCount && this.root.contains(s.anchorNode)) {
      const q = s.getRangeAt(0).getBoundingClientRect(), c = this.caretNow();
      if (q.height && q.top >= D.top && q.bottom <= D.bottom && c && !c.ghost && !c.crossFile) return { f: c.f, p: c.a, dy: q.top - D.top };
    }
    if (!document.caretRangeFromPoint) return null;
    for (const fy of [16, 48, 96, 160]) {
      for (const fx of [0.5, 0.3, 0.7]) {
        const r = document.caretRangeFromPoint(D.left + D.width * fx, D.top + fy);
        // (a letter of the page's text at that point: a point between lines or on a page's margin
        // gives the place of a whole block, often far from what is in view)
        if (!r || r.startContainer.nodeType !== 3 || !this.root.contains(r.startContainer)) continue;
        const q = r.getBoundingClientRect();
        if (!q.height || Math.abs(q.top + q.height / 2 - (D.top + fy)) > q.height) continue;
        const A = posFromDom(r.startContainer, r.startOffset, this.root);
        if (A && !A.ghost && A.f != null) return { f: A.f, p: A.p, dy: q.top - D.top };
      }
    }
    return null;
  }
  toReaderSpot(sp) {
    if (!sp) return;
    const x = this.index.find(sp.f, sp.p, 1);
    if (!x || !x.node) return;
    const r = document.createRange();
    try { r.setStart(x.node, x.offset); r.collapse(true); } catch (e) { return; }
    const go = () => {
      let q = r.getBoundingClientRect();
      if (!q.height) { const e = x.node.nodeType === 1 ? x.node : x.node.parentElement; if (!e) return; q = e.getBoundingClientRect(); }
      this.desk.scrollTop += q.top - this.desk.getBoundingClientRect().top - sp.dy;
    };
    go();
    // (pages out of view are drawn when they come into it, at their real height: the place is
    // looked up again once they are)
    requestAnimationFrame(() => requestAnimationFrame(() => { if (x.node.isConnected) go(); }));
  }

  // The page's width changed (the window, a pane docked or closed): laid out again at the new fit,
  // with what the reader looked at where it was on the screen (a docked pane sent a caret at y 387
  // to y -2520)
  refit() {
    const sp = this.readerSpot();
    if (!this.computePx()) return;
    this.relayout(true);
    this.toReaderSpot(sp);
  }

  relayout(force) {
    if (!this.model) return;
    const c = this.caretNow();
    // (Enter's new line, and the place after a display, are on the page alone until something is
    // typed: the pass takes them away, so with the caret on one it comes back where it was, with
    // what it holds. A font that came, the window resized (a phone's keyboard), a pane opened
    // after Enter lost it, and the next words went on the end of the line above)
    const G = c && c.ghost && this.ghost && !this.ghost.tex && !this.ghost.sticky ? { ...this.ghost } : null;
    // (a dialog's field with the focus, the Font dialog's size box: the page's selection is not
    // there to read, so what the dialog acts on is read from its own range, to be put on the new
    // nodes; it kept the old ones and OK formatted the document's start. A dialog's alone: a pane's
    // search box leaves the range an older press of the ribbon left, and Esc went there, ux.py)
    const fe = document.activeElement, field = fe && /^(INPUT|TEXTAREA|SELECT)$/.test(fe.tagName) && fe.closest('.pop');
    const RA = field && this.rbRange && this.root.contains(this.rbRange.startContainer) ? posFromDom(this.rbRange.startContainer, this.rbRange.startOffset, this.root) : null;
    const RB = RA && posFromDom(this.rbRange.endContainer, this.rbRange.endOffset, this.root);
    this.layoutPass(force);
    if (RA && RB && !RA.ghost && !RB.ghost && RA.f === RB.f) {
      const x = this.index.find(RA.f, RA.p, 1), y = this.index.find(RB.f, RB.p, -1);
      if (x && x.node && y && y.node) { const r = document.createRange(); r.setStart(x.node, x.offset); r.setEnd(y.node, y.offset); this.rbRange = r; }
    }
    if (G && !this.ghost) {
      this.ghostAt(G.f, G.pos, G.style, G.line);
      if (this.ghost) {
        const el = this.ghost.el;
        Object.assign(this.ghost, G, { el });
        if (G.pend) this.paintGhost();
        return;
      }
    }
    // (a selection stays one: a relayout, for the window's width or fonts that came, put it back as
    // a caret at its start, and the status bar's "3 of 12 words" went back to "12 words")
    if (c && document.activeElement === this.root) this.restoreCaret(c.collapsed || c.crossFile ? c : { ...c, selA: c.a, selB: c.b }, true);
    // With a ribbon button or its menu holding the focus the page keeps its selection, for the
    // button to act on; the pass's new nodes left it at a page's start. It goes back where it was,
    // the focus left where it is (Select sentence from Home's Select menu selected nothing).
    // (a docked pane's or the side panel's buttons and lists too: a pane that narrows the page lays it
    // out again at a new zoom, and F7 then Esc put the caret at the document's start)
    else if (c && !c.crossFile && document.activeElement && document.activeElement.closest('#ribbon, .pop, .stp, .sp-pane, .help-pane, #nav, #fr') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      const x = this.index.find(c.f, c.collapsed ? c.p : c.a, c.collapsed ? -1 : 1), y = c.collapsed ? x : this.index.find(c.f, c.b, -1);
      if (x && x.node && y && y.node) {
        getSelection().setBaseAndExtent(x.node, x.offset, y.node, y.offset);
        if (this.rbRange) this.rbRange = getSelection().getRangeAt(0).cloneRange();
      }
    }
  }

  tocPages(plan) {
    // (B9: the lists of figures and tables, the index's page numbers; src/cmd/refs.js)
    this.refPages(plan);
    const tocs = this.root.querySelectorAll('.toc-p:not([data-cap])');
    if (!tocs.length) return;
    const where = [];
    plan.forEach((pg, k) => { for (const e of pg.entries) if (e.it.kind === 'h' && e.a === 0) where.push({ el: e.it.el, page: k + 1 }); });
    const byText = new Map();
    for (const w of where) byText.set(w.el.textContent.replace(/\s+/g, ' ').trim(), w.page);
    for (const t of tocs) {
      const row = t.parentNode;
      const key = (row.dataset.full || (row.querySelector('.toc-n').textContent || '') + (row.querySelector('.toc-t').textContent || '')).replace(/\s+/g, ' ').trim();
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
    this.noteSaveState();
    this.lastMs = ms;
    this.updateFileTabs();
    this.ribbonSoon();
  }

  // the words beside the document's name: Saved once this browser has the edit, Not saved while it waits
  noteSaveState(kept) {
    const el = $('#savestate');
    if (!el) return;
    el.hidden = false;
    el.textContent = kept === false || this.unsaved ? 'Not saved' : 'Saved';
    el.title = kept === false ? 'This browser could not keep it: File, Save a copy, or a Download, keeps a copy' : this.unsaved ? 'Being kept in this browser' : 'Saved in this browser: it is here at your next visit';
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
    // (a place under a collapsed heading: it opens first, src/cmd/find.js)
    this.foldOpenAt(c.f, c.selA != null ? c.selA : c.p);
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
    // (right after a formula, a citation or a reference that ends its line, with no text after it
    // to hold the caret: after it in that line, where the page put it at the next paragraph's
    // start, and End, Enter there split that paragraph; the live report of a heading's formula)
    if (r.inexact) {
      const A = [...this.root.querySelectorAll('.atom')].find((x) => { const i = atomOfEl(x); return i && i.f === c.f && i.e === c.p && !i.a.display; });
      if (A && A.parentNode) {
        const i = [...A.parentNode.childNodes].indexOf(A) + 1;
        sel.collapse(A.parentNode, i);
        this.pending = { f: c.f, p: c.p, node: A.parentNode, offset: i };
        if (!quiet) this.scrollToCaret();
        return;
      }
    }
    sel.collapse(r.node, r.offset);
    const back = posFromDom(r.node, r.offset, this.root);
    this.pending = back && back.p !== c.p ? { f: c.f, p: c.p, node: r.node, offset: r.offset } : null;
    if (!quiet) this.scrollToCaret();
  }

  // After a display closes (Enter, Esc, a click away), the caret on a new line of its own right
  // after \end{equation}, in the same paragraph, as math papers go on ("where x is …", drawn below
  // the equation with no indent); a second Enter there makes a new paragraph. What was typed next
  // joined the equation's last line (\end{equation}After.). Closed by $$, as typed in the source,
  // the line goes on after it instead (dollarClosed).
  caretAfterDisplay(rc) {
    this.ghostAt(rc.f, rc.p, null, true);
    // (a place for the caret, not a step: Undo after a display closed undoes the display's edit,
    // where main's takeBackGhost took this line away as an Enter's empty paragraph and the edit
    // stayed; mathfield.py's one undo of the popover session)
    if (this.ghost) this.ghost.place = true;
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

  // As Word opens a document with the caret at its start, so the first keys type: at the start
  // of the first paragraph, without scrolling (the first text: a figure before it, as the
  // sample's live graph is, is no place to type). Not on a touch screen, where focusing the page
  // brings up the on-screen keyboard before anyone asked to type; not where something else
  // already has the focus (a link's guest bar, a dialog).
  placeInitialCaret() {
    // (a document of headings alone: the first heading's words; there was no caret, and the first
    // keys after a reload typed nothing)
    const first = this.root.querySelector('.it.p span.t:not(.gh)') || this.root.querySelector('.it:not(.atom) span.t:not(.gh)');
    if (!first || !first.firstChild || window.innerWidth < 700 || matchMedia('(pointer: coarse)').matches) return;
    const a = document.activeElement;
    if (a && a !== document.body && a !== this.root) return;
    if (this.caretNow()) return;
    this.root.focus({ preventScroll: true });
    getSelection().collapse(first.firstChild, 0);
  }

  // ---- edits & history ----------------------------------------------------------
  // blobs: pictures the same step puts in the project ([{ name, blob }], an interactive graph's
  // picture for the PDF): one undo takes them out again with the text, or back to what they were
  commit(edits, caret, kind, blobs) {
    // while the pages are stale (see rebuild) only edits made from the text itself go through
    if (this.stale && !/^(restore|reject|merge|other-tab|api)$/.test(kind || '')) { this.toast('The page cannot show the document as it is now. Edit the source, or undo.'); return; }
    // (src/review.js: none while the page shows the Original; comments only in a comments only link)
    if (this.rvRefuse(edits, kind)) return;
    edits = edits.filter((ed) => { const n = (this.files.get(ed.f) ?? '').length; return ed.s >= 0 && ed.e >= ed.s && ed.e <= n; });
    const swaps = (blobs || []).map(({ name, blob }) => ({ name, before: this.assetBlobs.get(name) || null, after: blob }));
    if (!edits.length && !swaps.length) { if (caret) this.restoreCaret(caret); return; }
    for (const b of swaps) this.setAsset(b.name, b.after);
    const cb = this.caretNow() || caret;
    this.removeGhost();
    const before = new Map();
    const byFile = new Map();
    for (const ed of edits) { if (!byFile.has(ed.f)) byFile.set(ed.f, []); byFile.get(ed.f).push(ed); }
    // (a file the step makes, as Table from Data File's .csv: undone, it goes again)
    const made = [...byFile.keys()].filter((f) => !this.files.has(f));
    // (what of each file the edits left alone, before the first and after the last, for the undo
    // record's comparison; edits that overlap say nothing)
    const win = new Map();
    for (const [f, list] of byFile) {
      let text = this.files.get(f) ?? '';
      before.set(f, text);
      list.sort((x, y) => y.s - x.s || y.e - x.e);
      let apart = true;
      for (let k = 1; k < list.length; k++) if (list[k].e > list[k - 1].s) apart = false;
      if (apart) win.set(f, { pre: list[list.length - 1].s, suf: text.length - list[0].e });
      for (const ed of list) text = text.slice(0, ed.s) + ed.t + text.slice(ed.e);
      this.files.set(f, text);
      // (the document's last selection, where a command acts with no caret on the page, moves too)
      if (this.rbLast && this.rbLast.f === f && this.rbLast.text === before.get(f)) this.restMove(f, list, text);
    }
    // (the blocks shown as LaTeX move with these edits, src/cmd/view.js; typing ends Repeat's turn)
    this.viewMap(byFile, before);
    if (!this.cmdDepth) this.lastAct = null;
    this.record(before, kind, cb && cb.f != null ? { f: cb.f, p: cb.p } : caret, caret, swaps, win);
    if (made.length) { const top = this.hist[this.hist.length - 1]; if (top) for (const d of top.files) if (made.includes(d.f)) d.made = true; }
    this.zipDirty = true;
    this.rebuild(caret);
    this.pushToSource();
    this.saveSoon();
  }

  // win: for each file, how much at its start (pre) and its end (suf) the edits left alone (commit)
  record(before, kind, cb, ca, swaps, win) {
    const files = [];
    const at = (w, f) => (w && w.get(f)) || { pre: 0, suf: 0 };
    for (const [f, b] of before) { const w = at(win, f); const d = diff(b, this.files.get(f), w.pre, w.suf); if (d) files.push({ f, ...d }); }
    if (swaps && swaps.length) {
      // (a step with pictures is a step of its own, never joined to the one before)
      if (this.hist.length) { const t = this.hist[this.hist.length - 1]; t.open = false; t.before = null; t.win = null; t.after = null; }
      this.hist.push(this.rvStep = { kind, files, blobs: swaps, caretBefore: cb, caretAfter: ca, time: Date.now(), open: false, before: null, abs: this.rvAbsorbs(kind) });
      if (this.hist.length > 400 && !this.histHold) this.hist.shift();
      this.redoStack = [];
      this.updateUndoUI();
      return;
    }
    if (!files.length) return;
    const now = Date.now();
    const top = this.hist[this.hist.length - 1];
    const contiguous = top && top.caretAfter && cb && top.caretAfter.f === cb.f && Math.abs(top.caretAfter.p - cb.p) <= 2;
    // Typing is undone word by word, as Word's: a step is a word with the spaces after it (a space
    // typed first goes with the word after it), and a new paragraph starts one. A heading's words
    // and the paragraph typed after it, or a sentence of 40 words, went in one Ctrl+Z.
    const typed = kind === 'type' && top && files.length === 1 ? files[0].ins : null;
    const prev = typed != null ? (this.files.get(files[0].f) || '')[files[0].s - 1] || '' : '';
    const had = typed != null ? ((top.files.find((d) => d.f === files[0].f) || {}).ins || '') : '';
    const newWord = typed != null && (/\n/.test(typed) || (/\s/.test(prev) && /^\S/.test(typed) && /\S/.test(had)));
    if (top && top.open && kind && top.kind === kind && now - top.time < 2000 && (kind !== 'type' && kind !== 'del' || contiguous) && !newWord) {
      // (what every edit of the step left alone is the least of what each left alone, for the files
      // nothing changed between its commits: src/editor.js stepJoin)
      stepJoin(top, before, (f) => this.files.get(f), win);
      top.files = [];
      for (const [f, b] of top.before) { const w = at(top.win, f); const d = diff(b, this.files.get(f), w.pre, w.suf); if (d) top.files.push({ f, ...d }); }
      top.caretAfter = ca; top.time = now;
      // (Track Changes: the step's edits go into the review base or not as when it was made)
      this.rvStep = top;
      return;
    }
    if (top) { top.open = false; top.before = null; top.win = null; top.after = null; }
    const s0 = stepStart(before, (f) => this.files.get(f), win);
    this.hist.push(this.rvStep = { kind, files, caretBefore: cb, caretAfter: ca, time: now, open: true, before, win: s0.win, after: s0.after, abs: this.rvAbsorbs(kind) });
    if (this.hist.length > 400 && !this.histHold) this.hist.shift();
    this.redoStack = [];
    this.updateUndoUI();
  }

  closeGroup() { const top = this.hist[this.hist.length - 1]; if (top) { top.open = false; top.before = null; top.win = null; top.after = null; } }

  // The undo and redo steps as IndexedDB keeps them across a reload: what each changed and where
  // the caret was, the newest first back to a step that holds pictures or Track Changes' base
  // (kept in memory only), at most 2 MB in all (HIST_BYTES: a character of text is two bytes,
  // as a string is held; 2e6 characters were 4 MB). Word loses its undo when the file closes; a
  // browser tab is closed by accident, and the steps are small.
  historyKept(meta) {
    // (Undo's steps first, the newest first; Redo's in what is left)
    let size = 0;
    const keep = (list) => {
      const out = [];
      for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i];
        if ((h.blobs && h.blobs.length) || h.base0 || h.base1) break;
        const n = h.files.reduce((m, d) => m + 2 * (d.f.length + d.del.length + d.ins.length) + 64, 160);
        if (size + n > HIST_BYTES) break;
        size += n;
        out.unshift({ kind: h.kind, files: h.files.map((d) => ({ f: d.f, s: d.s, del: d.del, ins: d.ins, ...(d.made ? { made: true } : {}) })), caretBefore: h.caretBefore || null, caretAfter: h.caretAfter || null, time: h.time, abs: h.abs });
      }
      return out;
    };
    return { t: meta.t, name: meta.name, main: meta.main, hist: keep(this.hist), redo: keep(this.redoStack) };
  }
  // What the steps are now, cheaply: persist writes them only when this changed (a save came
  // every few seconds of typing, and wrote up to 2 MB of steps each time)
  historySig() {
    const top = (l) => { const h = l[l.length - 1]; return h ? h.time + ':' + h.files.reduce((n, d) => n + d.s + ':' + d.del.length + ':' + d.ins.length + ';', '') : ''; };
    return [this.name, this.main, this.hist.length, top(this.hist), this.redoStack.length, top(this.redoStack)].join('|');
  }

  undo() {
    // (letters waiting to go in go first: Undo from the Edit menu or a gesture comes with no key)
    this.typeFlush();
    // (nothing stays selected across a change of the text: its offsets would be stale)
    this.disarm();
    // typing in the source pane joins the history only after a pause: take it in first, so
    // Ctrl+Z right after typing undoes that typing instead of wiping it
    if (this.srcRebuild.pending()) this.srcRebuild.flush();
    this.closePop(true);
    // (an empty paragraph Enter showed is a step of its own: takeBackGhost)
    if (this.takeBackGhost('undo')) return;
    const h = this.hist.pop();
    if (!h) { this.toast('Nothing to undo'); return; }
    if (!this.stepFits(h, true)) return;
    h.open = false; h.before = null; h.win = null; h.after = null;
    const was = new Map(h.files.map((d) => [d.f, this.files.get(d.f) ?? '']));
    for (const d of h.files) { const t = this.files.get(d.f) ?? ''; this.files.set(d.f, t.slice(0, d.s) + d.del + t.slice(d.s + d.ins.length)); if (d.made && !this.files.get(d.f)) this.files.delete(d.f); }
    for (const b of h.blobs || []) this.setAsset(b.name, b.before);
    this.viewMap(new Map(h.files.map((d) => [d.f, [{ s: d.s, e: d.s + d.ins.length, t: d.del }]])), was);
    this.lastAct = null;
    this.redoStack.push(h);
    // (src/review.js: an Accept's base back; the step's edit absorbed as it was when made)
    if (h.base0) this.rvBaseStep(h, true);
    this.rvStep = h;
    const c = h.caretBefore || (h.files[0] ? { f: h.files[0].f, p: h.files[0].s + h.files[0].del.length } : null);
    this.rebuild(c);
    this.pushToSource();
    this.saveSoon();
    this.updateUndoUI();
  }
  redo() {
    this.typeFlush();
    this.disarm();
    if (this.srcRebuild.pending()) this.srcRebuild.flush();
    this.closePop(true);
    const h = this.redoStack.pop();
    // nothing to redo: Ctrl+Y repeats the last command at the caret, as Word's does (src/cmd/view.js)
    if (!h) { if (!this.repeatLast()) this.toast('Nothing to redo'); return; }
    if (!this.stepFits(h, false)) return;
    const was = new Map(h.files.map((d) => [d.f, this.files.get(d.f) ?? '']));
    for (const d of h.files) { const t = this.files.get(d.f) ?? ''; this.files.set(d.f, t.slice(0, d.s) + d.ins + t.slice(d.s + d.del.length)); }
    for (const b of h.blobs || []) this.setAsset(b.name, b.after);
    this.viewMap(new Map(h.files.map((d) => [d.f, [{ s: d.s, e: d.s + d.del.length, t: d.ins }]])), was);
    this.hist.push(h);
    if (h.base1) this.rvBaseStep(h, false);
    this.rvStep = h;
    const c = h.caretAfter || (h.files[0] ? { f: h.files[0].f, p: h.files[0].s + h.files[0].ins.length } : null);
    this.rebuild(c);
    this.pushToSource();
    this.saveSoon();
    this.updateUndoUI();
  }
  // A step is applied only to the text it made (undo) or the text it was undone to (redo): each
  // file's text at its place must be what the step put there. A file replaced outside the
  // history (opened over by another of its name, before that was a step: openFiles) had its
  // coauthor's text cut at the old offsets with no word, and since the steps are kept across a
  // reload (historyKept) for as long as they last. Where one does not fit, every step goes, as
  // none can be trusted to fit either.
  stepFits(h, back) {
    const ok = h.files.every((d) => {
      if (!this.files.has(d.f)) return !back && !!d.made;
      const t = this.files.get(d.f), want = back ? d.ins : d.del;
      return d.s >= 0 && t.slice(d.s, d.s + want.length) === want;
    });
    if (ok) return true;
    // (what is kept across a reload goes at the next save; until then a reload meets this again)
    this.hist = []; this.redoStack = [];
    this.updateUndoUI();
    this.toast('The text changed outside Undo\'s history, so ' + (back ? 'Undo' : 'Redo') + ' would not fit it. The history is cleared; Review, Versions keeps earlier copies.', 8000);
    return false;
  }
  updateUndoUI() { $('#b-undo').disabled = !this.hist.length; $('#b-redo').disabled = !this.redoStack.length; if ($('#b-undo-x')) $('#b-undo-x').disabled = !this.hist.length; }

  src(f) { return this.files.get(f) ?? ''; }
  savePrefs() { store(PREFS, this.prefs); }

  // ---- input --------------------------------------------------------------------
  bindUI() {
    const R = this.root;
    // (letters waiting to go in, typeQueue: written before any other key, press or command)
    // (and how long each key waited for the page: the time since the keyboard made it)
    document.addEventListener('keydown', (e) => { this.keyLate = e.timeStamp ? performance.now() - e.timeStamp : 0; }, true);
    const first = (e) => { if (this.typeQ != null && !(e.type === 'keydown' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && this.typeQueueable(e.key))) this.typeFlush(); };
    document.addEventListener('keydown', first, true);
    document.addEventListener('pointerdown', first, true);
    R.addEventListener('pointerdown', () => { this.tabOut = 0; }, true);
    R.addEventListener('blur', first);
    R.addEventListener('compositionstart', first, true);
    R.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    R.addEventListener('keydown', (e) => this.onKeyDown(e));
    R.addEventListener('compositionstart', () => this.onCompStart());
    R.addEventListener('compositionend', (e) => this.onCompEnd(e));
    R.addEventListener('paste', (e) => this.onPaste(e));
    R.addEventListener('copy', (e) => this.onCopy(e, false));
    R.addEventListener('cut', (e) => this.onCopy(e, true));
    // (R3, src/cmd/move.js: selected words dragged move as one edit; a drop from elsewhere is a paste)
    R.addEventListener('dragstart', (e) => { if (!this.dragMoveStart(e)) e.preventDefault(); });
    R.addEventListener('dragover', (e) => this.dragMoveOver(e));
    R.addEventListener('dragend', () => this.dragMoveEnd());
    R.addEventListener('drop', (e) => { this.typeFlush(); if (!this.dragMoveDrop(e) && !(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length)) e.preventDefault(); });
    R.addEventListener('mousedown', (e) => this.onMouseDown(e), true);
    R.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('selectionchange', () => this.onSelChange());
    document.addEventListener('keydown', (e) => this.onGlobalKey(e));

    const D = this.desk;
    D.addEventListener('dragover', (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
    D.addEventListener('dragleave', (e) => { if (e.target === D) document.body.classList.remove('dropping'); });
    D.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); document.body.classList.remove('dropping'); this.caretAtPoint(e.clientX, e.clientY); this.openFiles([...e.dataTransfer.files]); } });
    D.addEventListener('scroll', () => { if (this.pop) this.positionPop(); if (!this._bubbleHold) this.hideBubble(); }, { passive: true });

    $('#b-open').addEventListener('click', () => $('#fileinput').click());
    $('#fileinput').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) this.openFiles(fs); });
    // (b-save is the ribbon's LaTeX download: src/ribbon.js answers its click)
    $('#b-copy').addEventListener('click', () => this.copySource());
    $('#b-share').addEventListener('click', () => this.openSharePanel());
    const qatSave = $('#qat-save');
    if (qatSave) qatSave.addEventListener('click', () => this.runCommand('save'));
    const comments = $('#b-comments');
    if (comments) comments.addEventListener('click', () => this.toggleNav(true, 'changes'));
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
      this.prefs.shellEscape = e.target.checked; store(PREFS, this.prefs); if (document.body.classList.contains('pdf-on')) this.compilePdf({ clean: true }); else this.pdfStale = true;
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
    // The status line's words on storage say only what the title's Saved does not: that this
    // browser is not keeping the work, or Word's progress. Its ordinary "Saved in this browser"
    // is the title's tooltip, as Word says where a document is saved by its name, not in its
    // status bar (the line took the room the zoom needs on a 1366 px window).
    const stSave = $('#st-save');
    const quiet = () => { const t = stSave.textContent.trim(); stSave.classList.toggle('st-quiet', !t || /^(Kept|Saved) in this browser$/.test(t)); };
    new MutationObserver(quiet).observe(stSave, { childList: true, characterData: true, subtree: true });
    quiet();
    // a click on the word count opens Word Count, as in Word
    $('#st-words').addEventListener('click', () => this.runCommand('word-count'));
    // a press on a button of the status bar leaves the page its focus, as the ribbon's do: the
    // dialog it opens (Word Count, Go To) gives the caret back when it closes
    $('#status').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    // the status line scrolls when it is wider than the window; the fades follow the cut edges
    const stBar = $('#status');
    if (stBar) {
      const edges = () => this.statusEdges();
      stBar.addEventListener('scroll', edges, { passive: true });
      window.addEventListener('resize', edges);
      if (window.ResizeObserver) new ResizeObserver(edges).observe(stBar);
      if (window.MutationObserver) new MutationObserver(edges).observe(stBar, { childList: true, subtree: true, characterData: true });
      edges();
    }
    $('#b-nav').addEventListener('click', () => this.toggleNav());
    $('#nav-close').addEventListener('click', () => this.toggleNav(false));
    // Where the bar shows icons alone (a phone hides Help and the zoom steps too), the menu
    // panel lists each of its actions by name: the bar's own buttons, pressed from here.
    // The three downloads come first: on a phone the ribbon's end, where they are, is a swipe away.
    // (Make available offline, the installed app's, too: a phone's status line has no room for it)
    for (const id of ['rb-pdf', 'rb-word', 'b-save', 'b-open', 'b-pdf', 'b-copy', 'b-share', 'b-undo', 'b-undo-x', 'b-redo', 'b-zout', 'zoomv', 'b-zin', 'b-src', 'b-help', 'b-offline']) {
      const b = $('#' + id), a = mk('button', 'nav-act');
      if (!b) continue;
      a.type = 'button'; a.dataset.for = id;
      // (a menu item under the button's own name: the bar's button of that name is still there)
      a.setAttribute('role', 'menuitem');
      a.setAttribute('aria-label', b.getAttribute('aria-label') || b.textContent.trim());
      const svg = b.querySelector('svg'), lab = b.querySelector('span');
      if (svg) a.appendChild(svg.cloneNode(true));
      // (Make available offline's own icon; the zoom's item keeps its text alone, as before)
      else if (id === 'b-offline') a.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 14.5h8.5a3 3 0 0 0 .4-6 4.5 4.5 0 0 0-8.7-1A3.5 3.5 0 0 0 6 14.5z"/><path d="M10 9v4.5m-2-2 2 2 2-2"/></svg>');
      a.appendChild(mk('span', '', (b.closest('.rb-dl') ? 'Download ' : '') + (lab ? lab.textContent : b.children.length ? '' : b.textContent.trim())));
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
    // (Track Changes' base, whose writes wait a moment: written now, or the last words typed
    // with tracking off would come back as changes)
    if (this.baseSaveT) this.saveBase(true);
    if (!this.unsaved) return;
    store(STORE, { name: this.name, main: this.main, files: [...this.files.entries()], t: Date.now(), zipDirty: this.zipDirty });
    this.saveSoon.flush();
  }

  onGlobalKey(e) {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    this.plainPaste = !!(mod && e.shiftKey && e.key.toLowerCase() === 'v');
    // (Ctrl+S is Save as Word's: kept in this browser, said; Save As, F12, downloads: src/cmd/file.js)
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.runCommand('save'); }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileinput').click(); }
    // Ctrl+N is a new browser tab in some browsers; where the page hears it, it is a new document
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n' && !e.defaultPrevented) { e.preventDefault(); this.runCommand('new-document'); }
    // Ctrl+W closes the source or the PDF when one is open. Otherwise the browser closes the tab:
    // that key is the browser's, and a page cannot always keep it.
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
      if (document.body.classList.contains('src-on')) { e.preventDefault(); this.toggleSource(false); }
      else if (document.body.classList.contains('pdf-on')) { e.preventDefault(); this.togglePdf(false); }
    }
    // (Ctrl+P is Go to File, src/cmd/find.js, whose first line is Print: from a field or the source too)
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p' && !e.defaultPrevented) { e.preventDefault(); this.runCommand('go-to-file'); }
    // (by the keys, the caret goes along both ways and the focus with it: Word's Alt+F9 does the same)
    if (mod && e.key === '\\') { e.preventDefault(); this.toggleSource(undefined, { keys: true }); }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); this.toggleNav(); }
    if (e.key === 'Escape') { if (this.pop) { this.closePop(); e.preventDefault(); } this.disarm(); }
    // Ctrl and + / - / 0 zoom the document where the document is what is being read: on the
    // page, or with nothing in particular in focus. In a field, the source or the PDF the
    // browser zooms as it always does.
    // (Ctrl+Shift+- types _ and is the nonbreaking hyphen, as in Word: src/cmd/insert.js)
    if (mod && !e.altKey && /^(=|\+|-|0)$/.test(e.key) && !e.defaultPrevented
      && (e.target === document.body || e.target === this.root || (e.target.closest && e.target.closest('#desk') && !e.target.closest('input, textarea, select, math-field, [contenteditable="true"]:not(#pages)')))) {
      e.preventDefault();
      if (e.key === '0') this.zoomTo(1, null);
      else this.setZoom(e.key === '-' ? -1 : +1);
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
    // (after $$, only a letter or a backslash may still make it a display: dollarPairTakes)
    // (AltGr types the backslash on many layouts)
    if (this.dollarPair && (((mod || e.altKey) && !(e.getModifierState && e.getModifierState('AltGraph'))) || !(e.key === 'Shift' || e.key === 'AltGraph' || /^[\p{L}\\]$/u.test(e.key)))) this.dollarPair = null;
    if (mod && !e.altKey) {
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (k === 'y') { e.preventDefault(); this.redo(); return; }
      // (Ctrl+B, I, U, M, K and Enter are the commands' keys: src/keys.js catches them first;
      // Ctrl+Enter in a table cell is Insert below, src/cmd/table.js, and a page break elsewhere)
      // the browser's own select-all ends on a page number, which cannot be selected, and
      // collapses to the top of the page: Ctrl+A then Ctrl+C copied nothing and Delete did nothing
      if (k === 'a' && !e.shiftKey) { e.preventDefault(); this.selectAllText(); return; }
      if (e.key === 'End' && this.textEnd(e.shiftKey)) { e.preventDefault(); return; }
    }
    // out of a footnote at the page's foot: Esc, or Right at its end (Shift+F5 too: goBack)
    if ((e.key === 'Escape' && !this.pop) || (e.key === 'ArrowRight' && !e.shiftKey && !mod && !e.altKey)) {
      const F = this.footnoteHere(), c = F && this.caretNow();
      if (F && (e.key === 'Escape' || (c && c.collapsed && c.a >= (F.ie != null ? F.ie : F.e - 1)))) { e.preventDefault(); this.leaveFootnote(F); return; }
    }
    // (Esc, then Tab, leaves the page, as it leaves the source pane: the keyboard's way out)
    // (Esc then Tab as one gesture: an Esc long before, a press since, and Tab stays on the page)
    const tabOut = !!this.tabOut && performance.now() - this.tabOut < 2000;
    if (e.key !== 'Shift') this.tabOut = 0;
    // Word's Ctrl+Down and Ctrl+Up (Word for Mac's Cmd+Down and Cmd+Up): the browser's own keeps
    // the caret's column into the next block and could land inside a display formula there,
    // which opened its editor
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey) {
      if (this.paraJump(e.key === 'ArrowDown' ? 1 : -1, e.shiftKey)) { e.preventDefault(); return; }
    }
    if (e.key === 'Tab') {
      const n = getSelection().anchorNode;
      const el = n && (n.nodeType === 1 ? n : n.parentElement);
      if (el && el.closest('td')) { e.preventDefault(); this.tabCell(e.shiftKey); return; }
      // Tab keeps the keyboard on the page, as Word's: it went to the status bar or the PDF's
      // engine list, where the next letters picked an engine (POWER-USER.md 6)
      if (!mod && !e.altKey && !tabOut && !e.defaultPrevented) {
        // (in a list's item where its own Tab could do nothing, which says why, the key goes on as
        // the list's rule has it (src/cmd/lists.js), and the page takes the keyboard back at once)
        if (el && el.closest('[data-li]')) { this.keepFocusPastTab(); return; }
        e.preventDefault(); this.tabOnPage(e.shiftKey); return;
      }
    }
    if (e.key === 'Escape') { this.disarm(); this.tabOut = performance.now(); }
    // Word's Shift+Enter: a line break inside the paragraph (\\), not a new paragraph
    if (e.key === 'Enter' && e.shiftKey && !mod && !e.altKey && !this.armed) { e.preventDefault(); this.enter(true); return; }
    // Enter on a formula, a citation or a reference selected alone (Shift and an arrow over it)
    // opens it, as a click does; it replaced it with a paragraph break (POWER-USER.md 8)
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey && !this.armed) {
      const S = this.atomSelected();
      if (S && /^(math|cite|ref)$/.test(S.info.a.kind)) { e.preventDefault(); this.openAtom(S.el, S.info); return; }
    }
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
      // Only what is still selected on the page goes, at the offsets it has now: an undo, a redo,
      // a merge or a caret moved by code since may have left the selection's offsets stale (they
      // once deleted half a picture and its \end{center})
      const A = this.armed, sel = getSelection();
      const info = A.el && A.el.isConnected ? atomOfEl(A.el) : null;
      const still = info && info.s != null && sel.rangeCount && sel.getRangeAt(0).intersectsNode(A.el);
      this.disarm();
      if (still) {
        e.preventDefault();
        this.commit([{ f: info.f, s: info.s, e: info.e, t: '' }], { f: info.f, p: info.s }, 'del-atom');
        return;
      }
    }
    // (a Code block a press selected, R2: a character typed opens its source, as Enter does; it
    // replaced the block and its paragraph break before, review M3. A phone's keyboard says no key
    // here: its text comes as beforeinput, which decides)
    if (this.armed && this.armed.kind === 'code') {
      if (e.key === 'Unidentified' || e.key === 'Process') return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); this.codeOpen(); return; }
    }
    if (this.armed && !['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) this.disarm();
  }
  // The caret to the start of the next paragraph (dir 1) or to the start of this one, the one
  // before when it is there already (dir -1), as Word's Ctrl+Down and Ctrl+Up; extend: the
  // selection grows to the paragraph's end (or start) instead. A paragraph is the text of a block
  // on the page, a table's cell or its caption; a display formula and a picture are passed over,
  // and a paragraph a page cuts is one. false where the caret is in none of them (a footnote at
  // the page's foot): the browser's own move then.
  paraJump(dir, extend) {
    const sel = getSelection();
    if (!sel.rangeCount || !this.root.contains(sel.focusNode)) return false;
    const spans = [...this.root.querySelectorAll('.it span.t')].filter((s) => !s.classList.contains('gh') && !s.closest('.atom') && s.firstChild && s.firstChild.nodeType === 3);
    // (each span's paragraph: its cell, else its block; the rest of a block a page cut joins it)
    const stops = [];
    for (const sp of spans) {
      const it = sp.closest('.it'), key = sp.closest('td') || it, L = stops[stops.length - 1];
      if (L && (L.key === key || (key === it && it.classList.contains('split-b') && L.key.classList && L.key.classList.contains('it') && L.key.dataset.b === it.dataset.b))) L.texts.push(sp);
      else stops.push({ key, texts: [sp] });
    }
    let here = stops.findIndex((st) => st.texts.some((sp) => sp.contains(sel.focusNode)));
    if (here < 0 && sel.focusNode.nodeType === 1) here = stops.findIndex((st) => sel.focusNode.contains(st.texts[0]));
    if (here < 0) return false;
    const start = (st) => [st.texts[0].firstChild, 0];
    const end = (st) => { const l = st.texts[st.texts.length - 1], t = l.lastChild || l.firstChild; return [t, t.length]; };
    const cmp = ([n, o]) => { const r = document.createRange(); r.setStart(n, o); try { return r.comparePoint(sel.focusNode, sel.focusOffset); } catch (err) { return 0; } };
    let to;
    if (dir > 0) {
      if (extend) to = cmp(end(stops[here])) < 0 ? end(stops[here]) : stops[here + 1] ? end(stops[here + 1]) : null;
      else to = stops[here + 1] ? start(stops[here + 1]) : end(stops[here]);
    } else to = cmp(start(stops[here])) > 0 ? start(stops[here]) : stops[here - 1] ? start(stops[here - 1]) : start(stops[here]);
    if (!to) return true;
    if (extend) sel.extend(to[0], to[1]);
    else sel.collapse(to[0], to[1]);
    const el = to[0].parentElement;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    return true;
  }
  codeOpen() {
    const el = this.armed && this.armed.el, info = el && atomOfEl(el);
    this.disarm();
    if (info) this.openAtom(el, info);
  }

  onBeforeInput(e) {
    const t = e.inputType;
    if (this.armed && this.armed.kind === 'code' && /^insert/.test(t)) { e.preventDefault(); this.codeOpen(); return; }
    if (e.isComposing || t === 'insertCompositionText' || t === 'deleteCompositionText' || t === 'insertFromComposition') return;
    e.preventDefault();
    if (this.composing) return;
    if (this.dollarPair && t === 'insertText' && this.dollarPairTakes(e.data)) return;
    this.dollarPair = null;
    // (R3) words dragged out of the page are copied there: a move within the page is the page's
    // own drop (src/cmd/move.js), so a deletion by drag only ever follows a drop elsewhere
    if (t === 'deleteByDrag' || t === 'insertFromDrop') return;
    // (every input but a letter that may wait writes the letters waiting first, before its target
    // ranges are read: Undo from a menu, a system's autocorrect, a gesture come with no key)
    if (!(t === 'insertText' && this.typeQ != null && this.typeQueueable(e.data))) this.typeFlush();
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
        if (!range && t === 'insertText' && this.typeQueueable(data)) { this.typeQueue(data); break; }
        this.typeFlush();
        this.typeIn(data, range);
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

  // Letters typed faster than the page is built (a long document; a phone, where a key's edit and
  // build take a third of a second): each key waited for the build of the one before, and the page
  // fell seconds behind the typing (POWER-USER.md 4). A letter or digit typed within moments of the
  // last edit waits here, and the letters behind it with it (the browser hands over the keys
  // already waiting before a timer), and they go in as one edit in the next task; a letter after a
  // pause goes in at once, as before. Any other key, a press, the page losing the focus or an input
  // method first write what waits (bindUI).
  typeQueueable(data) {
    // (a space ends the run: the word goes in first, so AutoCorrect and a system's own autocorrect,
    // which reads the page's text at the space, see it; review M1)
    if (!/^[\p{L}\p{N}]$/u.test(data || '')) return false;
    if (this.typeQ) return true;
    // (only a key that waited for the page, pressed while the key before was still being built:
    // a key in time goes in at once, as keys always have)
    if (this.composing || this.pop || this.armed || this.ghost || !(this.keyLate > 12)) return false;
    // (only a run going on where the last letters went, nothing else edited since: after Enter, a
    // blank paragraph's first letter or a command, the caret is the page's own again first)
    const E = this.typeEnd, c = this.caretNow(), n = this.hist.length;
    return !!E && !!c && !c.ghost && c.collapsed && c.f === E.f && c.a === E.a && n === E.n && this.hist[n - 1] === E.top;
  }
  typeQueue(data) {
    if (this.typeQ == null) { this.typeQ = ''; setTimeout(() => this.typeFlush(), 0); }
    this.typeQ += data;
  }
  typeFlush() {
    const q = this.typeQ;
    this.typeQ = null;
    if (q) this.typeIn(q, null);
  }
  // What came in one insert with no key (dictation, a phone's suggestion bar) after the formula
  // it began in has closed: on the page, where the caret now is; the second $ of a closing $$
  // taken as a key would be (W4)
  typeRest(rest) {
    if (rest[0] === '$' && this.swallowDollar && performance.now() - this.swallowDollar < 1500) { this.swallowDollar = 0; rest = rest.slice(1); }
    if (rest && this.caretNow()) this.typeIn(rest, null);
  }
  typeIn(data, range) {
    const run = this.typedRun, c0 = this.caretNow();
    this.insertText(data, range);
    // Word's Repeat (F4) types the last run of typing again: what was typed since the caret
    // last went elsewhere (src/cmd/view.js repeatLast)
    const c1 = this.caretNow();
    if (!this.cmdDepth && c1 && !c1.ghost) {
      const on = !range && run && c0 && !c0.ghost && run.f === c0.f && run.p === c0.a;
      this.typedRun = { f: c1.f, p: c1.a, text: (on ? run.text : '') + data };
      this.lastAct = { text: this.typedRun.text };
    }
    this.typeEnd = c1 && !c1.ghost && c1.collapsed ? { f: c1.f, a: c1.a, n: this.hist.length, top: this.hist[this.hist.length - 1] } : null;
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
    // a selection over several cells of a table: their words go and the cells stay, as Word
    // clears a block of cells; the & and \\ between them went too, which joined cells and rows
    const cells = clearCells(src, a, b);
    if (cells) return cells.map((x) => ({ f, s: x.s, e: x.e, t: '' }));
    if (/^\s+$/.test(slice)) {
      // (a blank line still on either side, where an empty paragraph's text went: no paragraphs
      // join, and a space put there stood at the end of the paragraph before; review V8)
      const apart = /\n[ \t\r]*\n[ \t\r]*$/.test(src.slice(Math.max(0, a - 100), a)) || /^[ \t\r]*\n[ \t\r]*\n/.test(src.slice(b, b + 100));
      if (!apart && (slice.match(/\n/g) || []).length >= 2) return [{ f, s: a, e: b, t: ' ' }];
      return [{ f, s: a, e: b, t: '' }];
    }
    // Only comment lines between two paragraphs (a note, a review comment): joining them takes
    // out the blank lines alone. The comments are text nobody sees on the page, and the line
    // break left before them keeps a space between the two paragraphs' words. A \noindent that
    // began the second paragraph goes too: in the middle of one it does nothing. (It was taken
    // with the comments as any text, and the words met with no space: "words.Second".)
    if (/^(?:\s|%[^\n]*\n|\\noindent(?![A-Za-z]))+$/.test(slice) && /\n[ \t]*\n/.test(slice)) {
      const lines = slice.split('\n').map((l) => (/^[ \t]*%/.test(l) ? l : l.replace(/\\noindent(?![A-Za-z])[ \t]*/g, '')));
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
    // (typed over the mark of the empty paragraph Enter showed: that paragraph goes, and the
    // letters go where Enter left the caret, as Word's; ghostOver)
    if (!range && this.ghostOver()) this.takeBackGhost('back');
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
    // (the second $ of a closing $$ is the next key or none: a $ typed later is a new formula)
    if (data !== '$') this.swallowDollar = 0;
    if (data === '$' && !range && !raw && (c.collapsed || c.ghost)) {
      // (the second $ of a display's closing $$: the first one closed it)
      if (this.swallowDollar && performance.now() - this.swallowDollar < 1500) { this.swallowDollar = 0; return; }
      this.newMath(); return;
    }
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
    // (an empty paragraph Enter showed: takeBackGhost)
    if (this.takeBackGhost(/Backward/.test(type) ? 'back' : 'del')) return;
    if (c && c.ghost) {
      // the spaces typed so far in a line or a paragraph to come in LaTeX go one by one
      if (/Backward/.test(type) && this.ghost.pend) { this.ghost.pend = this.ghost.pend.slice(0, -1); this.paintGhost(); return; }
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
      // In a table Backspace at a cell's start and Delete at its end do nothing, and a word or a
      // line taken stops at the cell's edge, as Word's: the & or \\ went, joining two cells or rows
      const clip = f === c.f && clipToCell(this.src(f), c.a, a, b);
      if (clip) { if (clip.a === clip.b) return; a = clip.a; b = clip.b; }
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
    if (atom.kind === 'code') { this.toast('Code selected: Normal in Styles makes it text again; press it again or Enter to edit its source.', 2400); return; }
    this.toast('Press Backspace again to delete this ' + ({ math: 'equation', cite: 'citation', ref: 'reference', fn: 'footnote', img: 'figure', widget: 'live figure', chip: 'command', raw: 'block' }[atom.kind] || 'item') + (atom.kind === 'br' || atom.kind === 'sp' ? '.' : ', or Enter to edit it.'), 1800);
  }
  disarm() {
    if (this.armed && this.armed.el) this.armed.el.classList.remove('sel');
    // (what was selected: a second press on a Code block opens its source, src/cmd/styles.js)
    this.lastArmed = this.armed ? this.armed.el : null;
    this.armed = null;
  }

  enter(soft) {
    const c = this.caretNow();
    if (!c) return;
    // (a second Enter on the line after a display: a new paragraph there)
    if (c.ghost && this.ghost.line && !this.ghost.pend) { this.ghost.line = false; this.ghost.el.classList.add('ind'); return; }
    // A second Enter where the first left the caret at a paragraph's start: a second empty
    // paragraph above it, as Word's, and one Backspace or Undo takes one away (review V2). The
    // first was shown again in its place, so a second Backspace joined the two paragraphs.
    if (!soft && this.ghost && this.ghost.keepAt && this.ghostKept()) { this.ghost.n = (this.ghost.n || 1) + 1; this.ghostLines(); this.enterAct(); return; }
    if (c.ghost) { if (this.ghost.tex) this.texGhostEnter(); else this.ghostLeaveEnv(); return; }
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
    // Enter at the end of a float's last caption: a paragraph after the float, as Word's Enter at a
    // caption's end. It did nothing, and a table or a figure at the document's end had no way past it.
    if (kind === 'cap') {
      const itemEl = el.closest('.it'), B = itemEl && BLOCKS.get(+itemEl.dataset.b);
      if (c.collapsed && B && B.e > p && /^(?:\s*\})+(?:\s|\\label\s*\{[^{}]*\}|%[^\n]*\n)*\\end\s*\{[^{}]+\}\s*$/.test(src.slice(p, B.e))) { this.showGhost(itemEl, f, B.e); this.enterAct(); }
      return;
    }
    if (kind === 'cell') return;
    const itemEl = el.closest('.it');
    if (kind === 'ttl') {
      // Enter in the title, an author or the date starts the text below them, after \maketitle
      // (it did nothing, so a document with a title alone had no way to its first paragraph)
      const B = itemEl && BLOCKS.get(+itemEl.dataset.b);
      if (B) { this.showGhost(itemEl, B.f, B.e); this.enterAct(); }
      return;
    }
    if (kind === 'h') {
      const B = itemEl && BLOCKS.get(+itemEl.dataset.b);
      // the \label on the heading's next line stays with the heading: the new paragraph goes after it
      const lab = B && /^\s*\\label\s*\{[^}]*\}/.exec(src.slice(B.e));
      if (B) { this.showGhost(itemEl, f, B.e + (lab ? lab[0].length : 0)); this.enterAct(); }
      return;
    }
    if (kind === 'li' && itemEl && itemEl.dataset.li) {
      const [is, ie, ls, le, cmdE, lkind] = itemEl.dataset.li.split(',');
      const B = BLOCKS.get(+itemEl.dataset.b);
      const base = B.base;
      const itemText = src.slice(+cmdE + base, +ie + base);
      if (!itemText.trim() && c.collapsed) {
        // exit the list: remove empty item, continue after the list
        const s = +is + base, e0 = +ie + base;
        // (the empty item's line goes and one line break stays: \end{itemize} was glued to the
        // item before it, "\item Fourth\end{itemize}")
        // (a file whose lines end in CR LF keeps them so: the break kept, and the two written)
        const nl = src.lastIndexOf('\n', e0 - 1), e = nl >= s ? (src[nl - 1] === '\r' && nl - 1 >= s ? nl - 1 : nl) : e0;
        let s2 = s; while (s2 > 0 && (src[s2 - 1] === ' ' || src[s2 - 1] === '\t')) s2--;
        if (src[s2 - 1] === '\n' && nl >= s) { s2--; if (src[s2 - 1] === '\r') s2--; }
        const listEnd = +le + base;
        const removed = e - s2;
        const NL = /\r\n/.test(src) ? '\r\n' : '\n';
        const ins = NL + NL;
        this.commit([{ f, s: s2, e, t: '' }, { f, s: listEnd, e: listEnd, t: ins }], { f, p: listEnd - removed + ins.length, bias: 1 }, 'enter');
        return;
      }
      const NL = /\r\n/.test(src) ? '\r\n' : '\n';
      const t = NL + (lkind === 'desc' ? '\\item[] ' : '\\item ');
      // indent like the current item line
      let ls2 = +is + base; let ind = '';
      while (ls2 > 0 && (src[ls2 - 1] === ' ' || src[ls2 - 1] === '\t')) { ind = src[ls2 - 1] + ind; ls2--; }
      const w = c.collapsed ? this.wrapBreak(el, f, p) : { p, close: '', open: '' };
      const ins = w.close + NL + ind + t.slice(NL.length) + w.open;
      this.commit([...edits, { f, s: w.p, e: w.p, t: ins }], { f, p: Math.max(w.p, p) + ins.length, bias: 1 }, 'enter');
      return;
    }
    // Paragraph: at end -> ghost paragraph; otherwise split
    if (c.collapsed && itemEl && this.atItemEnd(itemEl, sel)) {
      this.showGhost(itemEl, f, p);
      this.enterAct();
      return;
    }
    const w = c.collapsed ? this.wrapBreak(el, f, p) : { p, close: '', open: '' };
    // At a paragraph's start, where a blank line already stands before it: Word makes an empty
    // paragraph, which LaTeX has not, and each Enter piled blank lines up in the source (twelve
    // Enters, twelve). The empty paragraph shows above it, to type in (Up), the caret staying, as
    // Word's does; nothing is written until it is.
    const ps = c.collapsed && !w.close && itemEl && kind === 'p' ? PARA_START.exec(src.slice(Math.max(0, w.p - 400), w.p)) : null;
    if (ps) {
      const keep = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      this.showGhost(itemEl, f, w.p - ps[1].length, { before: true });
      if (keep) { sel.removeAllRanges(); sel.addRange(keep); this.ourSel = true; if (this.ghost) this.ghost.keepAt = keep; }
      this.enterAct();
      return;
    }
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
    g.className = 'it p ghostp' + (!o.line && (afterEl.classList.contains('ind') || afterEl.classList.contains('p') || afterEl.classList.contains('tex')) ? ' ind' : '') + (o.style === 'latex' ? ' tex' : isEnvStyle(o.style) ? ' quote' : '');
    g.dataset.ctx = 'p';
    // the new paragraph runs the way the one above it does
    if (afterEl.dir === 'rtl' || afterEl.dir === 'ltr') g.dir = afterEl.dir;
    const s = document.createElement('span');
    s.className = 't gh';
    s.textContent = '\u200B';
    g.appendChild(s);
    if (o.before) afterEl.before(g); else afterEl.after(g);
    // (line: a line of the paragraph above, after a display, written after a line break alone)
    this.ghost = { el: g, f, pos, before: !!o.before, style: o.style || null, pend: '', line: !!o.line };
    const sel = getSelection();
    this.ourSel = true;
    sel.collapse(s.firstChild, 1);
    this.scrollToCaret();
  }
  // Enter on the blank paragraph at the end of a theorem, a proof, a quote: it goes after the
  // \end, as Enter on a list's empty last item leaves the list (Word: the style's next paragraph
  // is Normal). Enter twice wrote blank lines inside it, and what was typed next went in too.
  ghostLeaveEnv() {
    const g = this.ghost;
    if (!g || g.before || g.style) return false;
    const m = /^\s*\\end\s*\{([^}]+)\}/.exec(this.src(g.f).slice(g.pos));
    // (a theorem like one, a proof, a quote, quotation or verse alone: a beamer frame, a minipage,
    // a center hold paragraphs of their own, and one left out of a frame is set nowhere; review H3)
    const name = m && m[1].trim(), thm = name && (THM_STYLES[name] || name === 'assumption' || (this.model && this.model.thms && this.model.thms.has(name)));
    if (!m || !(thm || /^(quote|quotation|verse)$/.test(name))) return false;
    const after = g.el.previousElementSibling;
    if (!after) return false;
    this.showGhost(after, g.f, g.pos + m[0].length);
    return true;
  }
  removeGhost() { if (this.ghost) { const g = this.ghost; this.ghost = null; g.el.remove(); if (g.restore) g.restore(); } }
  // the caret where Enter at a paragraph's start left it, the empty paragraph showing above it
  ghostKept() {
    const k = this.ghost && this.ghost.keepAt, sel = getSelection();
    return !!k && sel.rangeCount > 0 && sel.isCollapsed && sel.anchorNode === k.startContainer && sel.anchorOffset === k.startOffset;
  }
  // From that caret into the empty paragraph above it (Shift+Left, Shift+Up): its mark selected,
  // as Word's, which Backspace or Delete takes away alone (review V3). The empty paragraph went
  // as the selection left the caret, and the Backspace after it joined the two paragraphs.
  // (Chromium gives the selection's ends as places in the page's blocks, not in their text: a
  // selection over it and no words is that one)
  ghostOver() {
    const g = this.ghost, sel = getSelection();
    if (!g || !g.keepAt || !g.el.isConnected || !sel.rangeCount || sel.isCollapsed || !this.root.contains(sel.anchorNode)) return false;
    const r = sel.getRangeAt(0);
    return r.intersectsNode(g.el) && !r.toString().replace(/[\u200B\s]/g, '');
  }
  // one empty paragraph per Enter (enter): those after the first as lines above it
  ghostLines() { const g = this.ghost; if (g) g.el.style.paddingTop = g.n > 1 ? 'calc(' + (g.n - 1) + ' * var(--lh))' : ''; }
  // Enter that showed an empty paragraph is an action, as typing is: nothing is left to redo
  // after it, as in Word (review V9: Ctrl+Y brought back an edit undone before the Enter)
  enterAct() { if (this.redoStack.length) { this.redoStack = []; this.updateUndoUI(); } this.lastAct = null; }
  // The one rule for taking back an empty paragraph Enter showed (enter, showGhost). It wrote
  // nothing, so until something is typed in it, it is Enter's whole effect, and Backspace, Delete
  // and Undo take it away and do nothing else, as Word's Enter then Backspace or Ctrl+Z gives
  // back exactly what was there. Before, Backspace acted on the caret Enter had left at the next
  // paragraph's start and deleted the blank line before it, joining two paragraphs; Undo undid
  // the edit made before the Enter. how: 'back' (Backspace), 'del' (Delete) or 'undo'. True
  // where it took one away.
  takeBackGhost(how) {
    const g = this.ghost;
    // (the blank page's own paragraph is no Enter's)
    if (!g || g.sticky || (how === 'undo' && g.place)) return false;
    const inIt = this.root.contains(getSelection().anchorNode) && g.el.contains(getSelection().anchorNode);
    const kept = this.ghostKept(), over = !kept && this.ghostOver();
    if (how !== 'undo') {
      // Backspace and Delete in it or on its selected mark, or Backspace at the caret Enter left
      // below it; spaces waiting in a line to come go one by one first (deleteInput)
      if (g.pend || !(inIt || over || (kept && how === 'back'))) return false;
      // (Delete in the empty paragraph above a paragraph: the caret goes to that paragraph's start)
      if (how === 'del' && !(g.before || g.tex === 'before')) return false;
    }
    const back = () => { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(g.keepAt); this.ourSel = true; };
    // (of several Enters' empty paragraphs, one goes: review V2)
    if (g.n > 1 && !g.pend) {
      g.n--; this.ghostLines();
      if (over) back();
      this.ribbonSoon();
      return true;
    }
    this.removeGhost();
    if (kept || over) back();
    // (Backspace in it ends at the paragraph above, Delete and Undo at the place it stood for)
    else this.restoreCaret({ f: g.f, p: g.pos, bias: g.tex === 'before' || (how !== 'back' && (g.before || how === 'del')) ? 1 : -1 });
    this.ribbonSoon();
    return true;
  }
  // what is typed in the blank paragraph or line is LaTeX source, written as it is
  ghostRaw() { return !!this.ghost && (!!this.ghost.tex || this.ghost.style === 'latex'); }
  // extra: edits of the same step (the packages a paste needs, src/app.js pastePackages)
  ghostInsert(tex, extra = []) {
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
    const open = g.style === 'latex' ? LATEX_MARK + '\n' : isEnvStyle(g.style) ? '\\begin{' + envOf(g.style) + '}\n' : '';
    const close = isEnvStyle(g.style) ? '\n\\end{' + envOf(g.style) + '}' : '';
    const src = this.src(g.f);
    // comment lines right under the paragraph belong to it (a review comment is about the line
    // above it): the new paragraph goes after them (not for one before a block: those are its own)
    // (a LaTeX paragraph's mark is no comment on the line above: the skip stops before it)
    const cm = /^[ \t]*(?:%(?![ \t]*rikuy:[ \t]*latex[ \t]*\r?(?:\n|$))[^\n]*)?(?:\r?\n[ \t]*%(?![ \t]*rikuy:[ \t]*latex[ \t]*\r?(?:\n|$))[^\n]*)*/.exec(src.slice(g.pos));
    if (!g.before && cm[0].includes('%')) g.pos += cm[0].length;
    let nlB = 0; for (let k = g.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
    let nlA = 0; for (let k = g.pos; k < src.length && /\s/.test(src[k]); k++) if (src[k] === '\n') nlA++;
    // no blank lines at the very start or end of a file: there is no paragraph to keep apart
    const pre = g.pos === 0 ? '' : '\n'.repeat(Math.max(0, (g.line ? 1 : 2) - nlB));
    const post = g.pos >= src.length ? '' : '\n'.repeat(Math.max(0, (g.line ? 1 : 2) - nlA));
    this.removeGhost();
    const grew = extra.filter((x) => x.f === g.f && x.s <= g.pos).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.commit([...extra, { f: g.f, s: g.pos, e: g.pos, t: pre + open + tex + close + post }], { f: g.f, p: g.pos + grew + pre.length + open.length + tex.length, bias: -1 }, 'type');
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
    // (a block shown as its LaTeX, view: no mark line before it; what is typed is written as it is)
    return { it, B, f: B.f, is: T.is + b, ie: T.ie + b, ms: T.view ? T.is + b : lineAt(this.src(B.f), b), para: T.para, nest: T.nest.map(([s, e]) => [s + b, e + b]), view: !!T.view };
  }
  // whether source position p of file f is in the source of a LaTeX paragraph on the page (own:
  // one of the document's own, not a block only shown as LaTeX for now, src/cmd/view.js)
  texAt(f, p, own) {
    for (const B of this.renderer.blocks) if (B.tex && B.f === f && !(own && B.tex.view) && B.tex.is + B.base <= p && p <= B.tex.ie + B.base) return true;
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
    // a block shown as its LaTeX (Show LaTeX) has no mark to keep or take off: it is written as typed
    if (T.view) { t = t.replace(/\r?\n/g, src.includes('\r\n') ? '\r\n' : '\n'); if (a !== b || t) this.commit([{ f, s: a, e: b, t }], { f, p: a + t.length, bias: -1 }, kind); return; }
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
    // (shown as its LaTeX: a line break with the line's indent, a blank line too, as in the source)
    if (T.view) { const ind = /^[ \t]*/.exec(src.slice(Math.max(T.is, src.lastIndexOf('\n', p - 1) + 1), p))[0], nl = src.includes('\r\n') ? '\r\n' : '\n'; this.commit([{ f: T.f, s: p, e: p, t: nl + ind }], { f: T.f, p: p + nl.length + ind.length, bias: 1 }, 'enter'); return; }
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
    // (shown as its LaTeX: its edges stay where they are, as the source pane's would not move them)
    if (T.view && ((back && c.a <= T.is) || (!back && c.a >= T.ie))) return true;
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
  ghostAt(f, pos, style, line) {
    let prev = null, next = null;
    for (const B of this.renderer.blocks) {
      if (B.f !== f || !B.items.length) continue;
      if (B.e <= pos && (!prev || B.e >= prev.e)) prev = B;
      if (B.s >= pos && (!next || B.s < next.s)) next = B;
    }
    const els = (B) => [...this.root.querySelectorAll('.it[data-b="' + B.id + '"]')];
    const at = prev ? els(prev).pop() : next ? els(next)[0] : null;
    if (at) this.showGhost(at, f, pos, { before: !prev, style, line });
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
  // what Copy puts on the clipboard as LaTeX: words copied from inside a format
  // (\textbf{qu|ick|}) keep it, as Word's copy keeps a bold word bold (they were pasted plain):
  // the wrappers around them, outermost first, go round the words copied
  // (copyKept: the words and the wrappers put round them, for a paste where the same kinds of
  // format are around the place already: they go, or \emph{.. \emph{words}..} prints upright)
  copyLatex(c) {
    const src = this.src(c.f), t = this.selectionLatex(c);
    this.copyKept = null;
    // cells of a table: a table of their own (their & and \\ alone, pasted in a paragraph, stop TeX)
    const cells = blockTabular(src, c.a, c.b);
    if (cells) return cells;
    if (!isBalanced(src, c.a, c.b) || this.texAt(c.f, c.a)) return t;
    const X = chainAt(src, c.a, c.b).filter((x) => x.W.is <= c.a && c.b <= x.W.ie);
    if (!X.length) return t;
    const wraps = X.map((x) => ({ group: x.group, open: src.slice(x.W.s, x.W.is), close: src.slice(x.W.ie, x.W.e) }));
    this.copyKept = { inner: t, wraps };
    return wraps.map((w) => w.open).join('') + t + [...wraps].reverse().map((w) => w.close).join('');
  }
  // the copied LaTeX for a paste at p of file f: the wrappers copyLatex added that the place has
  // already, taken off
  pasteKept(latex, f, p) {
    const K = this.lastCopy && this.lastCopy.kept;
    if (!K || !latex || latex !== K.wraps.map((w) => w.open).join('') + K.inner + [...K.wraps].reverse().map((w) => w.close).join('')) return latex;
    // (a format with a value, a size, a family, a colour, goes only where the place has the same one:
    // {\Large big} pasted into {\small ..} stays large, as Word's paste keeps the copied look; a
    // format that is on or off goes where the place has it on)
    const src = this.src(f), same = (t) => t.replace(/\s+/g, ' ').trim();
    const here = chainAt(src, p, p).map((x) => ({ group: x.group, open: same(src.slice(x.W.s, x.W.is)) }));
    const keep = K.wraps.filter((w) => !here.some((h) => h.group === w.group && (!VALUED.has(w.group) || h.open === same(w.open))));
    return keep.map((w) => w.open).join('') + K.inner + [...keep].reverse().map((w) => w.close).join('');
  }
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
    const latex = this.copyLatex(c);
    const plain = getSelection().toString().replace(/\u200B/g, '');
    e.clipboardData.setData('text/plain', plain);
    try { e.clipboardData.setData('text/x-galley-latex', latex); } catch (err) { /* ignore */ }
    try { e.clipboardData.setData('text/html', selectionHTML(getSelection(), (el) => this.mathML(el))); } catch (err) { /* plain text still works */ }
    this.lastCopy = { plain, latex, kept: this.copyKept };
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
    // (a paste from the Edit menu comes with no key: the letters waiting go in before it)
    this.typeFlush();
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
    // an empty clipboard pastes nothing: the words selected stay (they were deleted)
    if (!plain && !html && !latex) return;
    // (Ctrl+Shift+V, Keep Text Only: the words alone, also of what was copied here, which came with
    // its formatting's LaTeX)
    if (plainOnly) latex = '';
    const c = this.caretNow();
    if (!c) return;
    // in LaTeX the source goes in as it is: the source of what was copied on the page, else the text
    const T = c.ghost ? null : this.texHere();
    if (T && T.f === c.f && !this.wholeDoc()) { this.texEdit(T, c.a, c.b, (latex || plain).replace(/\r\n?/g, '\n'), 'paste'); return; }
    if (c.ghost && this.ghostRaw()) { this.ghostInsert((latex || plain).replace(/\r\n?/g, '\n')); return; }
    // cells copied from a spreadsheet, pasted in a table: into the cells from the caret's, as Word's
    // Overwrite Cells (src/cmd/table.js); a whole table float went into the one cell, which TeX refuses
    if (!c.ghost && !plainOnly && this.tablePasteCells(plain)) return;
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
    // (a PDF's ligatures as letters; its Greek and symbols as formulas where pdfLaTeX compiles it: escapeTeX)
    const pdfText = !this.textEngine().unicode;
    // (a preamble that sets Greek up for pdfLaTeX's text: Greek pasted there stays letters)
    const greekSet = /\\usepackage\s*\[[^\]]*\b(greek|polutonikogreek|LGR)\b[^\]]*\]\s*\{(babel|fontenc)\}|\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*\b(textgreek|alphabeta|teubner|greektex|lgrx)\b|\\DeclareUnicodeCharacter\s*\{0?3[9AaBbCc][0-9A-Fa-f]\}|\\newunicodechar\s*\{[\u0370-\u03FF]\}/.test(pre);
    const rich = () => withPdfText(pdfText, () => {
      if (plainOnly) return textToTeX(plain, o.prev);
      let t = '';
      if (html && /<[a-z]/i.test(html)) { try { t = htmlToTeX(html, o); } catch (err) { t = ''; } }
      if (!t.trim()) t = plainToTeX(plain, o.prev, o);
      if (inline) t = t.replace(/\s*\n\s*\n\s*/g, ' ').replace(/\n/g, ' ');
      return t;
    }, { greek: !greekSet });
    if (c.ghost) { const t = latex || rich(); this.ghostInsert(t, this.pastePackages(t)); return; }
    if (whole) { const t = latex || rich(), pk = this.pastePackages(t); this.replaceBody(whole, t, 'paste'); if (pk.length) this.commit(pk, null, 'paste'); return; }
    const edits = this.deletionEdits(c.f, c.a, c.b);
    const at = edits.length && edits[0].s >= c.a ? edits[0].s : c.a;
    // (landing in a LaTeX paragraph from a selection that started outside it: as source)
    const raw = this.texAt(c.f, at);
    let t = raw ? (latex || plain).replace(/\r\n?/g, '\n') : this.pasteKept(latex, c.f, at) || rich();
    if (!raw && /^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
    if (!raw && /^[[*]/.test(t) && grabsBracket(src, at, t[0])) t = '{' + t[0] + '}' + t.slice(1);
    const removedBefore = edits.filter((ed) => ed.e <= at).reduce((s, ed) => s + (ed.e - ed.s), 0);
    const pk = raw ? [] : this.pastePackages(t), grew = pk.filter((x) => x.f === c.f && x.s <= at).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    this.commit([...edits, { f: c.f, s: at, e: at, t }, ...pk], { f: c.f, p: at - removedBefore + t.length + grew }, 'paste');
    // LaTeX source pasted as text got its backslashes escaped: offer to keep it as LaTeX
    if (!latex && !plainOnly && t !== plain && /\\[A-Za-z]+/.test(plain) && /\\textbackslash\{\}|\\\$/.test(t)) {
      const pos = { f: c.f, s: at - removedBefore, len: t.length, raw: plain };
      this.toast('Pasted as text.', 6000, { label: 'Paste as LaTeX', fn: () => {
        if (this.src(pos.f).slice(pos.s, pos.s + pos.len) !== t) { this.toast('The pasted text has changed since; paste it again.'); return; }
        this.commit([{ f: pos.f, s: pos.s, e: pos.s + pos.len, t: pos.raw }], { f: pos.f, p: pos.s + pos.raw.length }, 'paste');
      } });
    }
  }

  // (Bold, Italic, Underline and the rest of the Font group: src/cmd/font.js, toggleStyle among them)

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
    // Ctrl+click on a cross reference goes to its label, as in Word (Shift+F5 comes back)
    if ((e.metaKey || e.ctrlKey) && info.a.kind === 'ref') { this.followRef(info); return; }
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
    // (an empty paragraph Enter showed above the caret stays while the caret is where Enter left it)
    const kept = this.ghostKept() || this.ghostOver();
    if (this.ghost && !this.ghost.sticky && !kept && !(inRoot && this.ghost.el.contains(sel.anchorNode))) {
      // keep ghost while focus is in the popover; drop otherwise
      if (!this.pop) this.removeGhost();
    }
    if (this.pending && (!sel.rangeCount || sel.anchorNode !== this.pending.node || sel.anchorOffset !== this.pending.offset)) this.pending = null;
    if (this.allSel) {
      const r = sel.rangeCount ? sel.getRangeAt(0) : null, A = this.allSel;
      if (!r || r.startContainer !== A.sc || r.startOffset !== A.so || r.endContainer !== A.ec || r.endOffset !== A.eo) this.allSel = null;
    }
    if (!inRoot) { this.hideBubble(); return; }
    // the page's caret or selection by its place in the source, while the page has the focus: a
    // pane, a dialog or a list that took the focus gives it back there (src/ribbon.js
    // ribbonBack), as a DOM range does not survive the page being drawn again
    if (document.activeElement === this.root && !this.stale) {
      const c = this.caretNow();
      if (c && !c.ghost && !c.crossFile) this.lastPagePos = c.collapsed ? { f: c.f, p: c.p } : { f: c.f, selA: c.a, selB: c.b };
    }
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
    let r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) return;
    // the ribbon is taller than the old bar: a bubble that only cleared 56px sat under it,
    // and a selection below the fold put the bubble where a click could not reach it
    const rib = $('#ribbon');
    const chrome = rib && rib.offsetParent ? rib.getBoundingClientRect().bottom + 4 : 56;
    const off = r.bottom < chrome || r.top > window.innerHeight - 8;
    if (off && !this._bubblePlace) {
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (node && node.scrollIntoView) {
        // scrolling the page hides the bubble; hold that off until the words are in view
        this._bubbleHold = true;
        node.scrollIntoView({ block: 'center', inline: 'nearest' });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          this._bubbleHold = false;
          this._bubblePlace = true;
          const s = getSelection();
          if (s.rangeCount && !s.isCollapsed && this.root.contains(s.anchorNode)) this.showBubble();
          this._bubblePlace = false;
        }));
        return;
      }
    }
    const b = $('#bubble');
    b.hidden = false;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    let x = r.left + r.width / 2 - bw / 2;
    x = Math.max(8, Math.min(window.innerWidth - bw - 8, x));
    let y = r.top - bh - 8;
    if (y < chrome) y = r.bottom + 8;
    if (y + bh > window.innerHeight - 8) y = Math.max(chrome, window.innerHeight - bh - 8);
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
    if (k === 'en') return this.openEndnote(el, info);
    if (k === 'url') return this.openLinkFor(el, info);
    if (k === 'br' || k === 'sp') { this.arm({ f: info.f, s: info.s, e: info.e, el, kind: k }); return; }
    // a Code block (verbatim, R2): a press selects it, so the Styles show Code and Normal takes it
    // off; a second press, Enter or a double click opens its source
    if (k === 'raw' && info.a.name === 'verbatim' && this.lastArmed !== el) { this.arm({ f: info.f, s: info.s, e: info.e, el, kind: 'code' }); this.ribbonSync(); return; }
    return this.openRaw(el, info);
  }

  gotoFootnote(el, info) {
    // find footnote element with same block & number
    const bid = el.dataset.a.split('.')[0];
    const fns = this.root.querySelectorAll('.fn');
    for (const f of fns) {
      const sp = f.querySelector('span.t');
      if (!sp) continue;
      if (sp.dataset.g.split('.')[0] === bid && (f.querySelector('.fnn').dataset.n0 || f.querySelector('.fnn').textContent) === info.a.num) {
        const spans = f.querySelectorAll('span.t');
        const last = spans[spans.length - 1];
        const sel = getSelection();
        this.root.focus({ preventScroll: true });
        sel.collapse(last.firstChild, last.firstChild.data.length);
        flash(f);
        this.scrollToCaret();
        return;
      }
    }
  }

  // The footnote the caret types in at the page's foot: its mark's place in the text ({ f, s, e,
  // ie }), or null. The foot comes after the page's last line, so the browser's own keys (Right,
  // Down, Ctrl+End) found no way out of it, and all typed next went into the footnote.
  footnoteHere() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const n = sel.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
    const box = el && el.closest && el.closest('.fn');
    if (!box || !this.root.contains(box)) return null;
    const c = this.caretNow();
    if (!c || c.ghost) return null;
    let best = null;
    for (const m of this.root.querySelectorAll('.fnm[data-a]')) {
      const info = atomOfEl(m);
      if (!info || info.f !== c.f || info.s == null || !(info.s < c.a && c.a <= info.e)) continue;
      if (!best || info.e - info.s < best.e - best.s) best = info;
    }
    return best;
  }
  // Word's way back from a footnote (Shift+F5, Esc, or Right at its end): the caret after its mark
  leaveFootnote(F = this.footnoteHere()) {
    if (!F) return false;
    this.restoreCaret({ f: F.f, p: F.e, bias: 1 });
    this.scrollToCaret();
    return true;
  }
  // the caret where it is, back on the page after a Tab that went on to the next control
  keepFocusPastTab() {
    const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    setTimeout(() => {
      if (document.activeElement === this.root || !r || !r.startContainer.isConnected) return;
      this.root.focus({ preventScroll: true });
      const t = getSelection(); t.removeAllRanges(); t.addRange(r);
    }, 0);
  }
  // Tab on the page outside a table, a list or tab stops (those have their own): at a paragraph's
  // start Word's first line indent (Shift+Tab: none, \noindent), elsewhere a gap as a tab
  // leaves one (\quad), in a heading, a caption or the title too; nothing in a LaTeX paragraph.
  // Over a selection, as Word's (review L4, where it did nothing and said nothing): from a
  // paragraph's start the selected paragraphs' left indent a step in (Shift+Tab: out), from
  // inside the text the gap in the selection's place
  tabOnPage(back) {
    const at = this.ribbonAt(), c = at && at.c;
    if (!c || c.ghost || at.cell || (at.it && at.it.dataset.li) || /^(tex|li)$/.test(at.ctx || '') || this.texAt(c.f, c.a)) return false;
    const sel = getSelection();
    let start = false;
    if (at.it && sel.rangeCount) {
      const S = sel.getRangeAt(0), r = document.createRange();
      try { r.setStart(at.it, 0); r.setEnd(S.startContainer, S.startOffset); start = !r.toString().replace(/[\u200B\s]/g, ''); } catch (e) { start = false; }
    }
    const plain = !/^(h|cap|ttl)$/.test(at.ctx || '');
    if (!c.collapsed && start && plain) return this.runCommand(back ? 'paragraph-outdent' : 'paragraph-indent', null, at) !== false;
    if (c.collapsed && start && plain) return this.paraFirstLineKey(back, at);
    if (back) return false;
    const t = '\\quad' + (/[A-Za-z]/.test(this.src(c.f)[c.b] || '') ? ' ' : '');
    this.commit([...this.deletionEdits(c.f, c.a, c.b), { f: c.f, s: c.a, e: c.a, t }], { f: c.f, p: c.a + t.length, bias: 1 }, 'type');
    return true;
  }

  // The one formula, citation or reference the selection holds, with nothing else of the text:
  // { el, info }, or null
  atomSelected() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!this.root.contains(r.commonAncestorContainer)) return null;
    const box = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    const atoms = [...(box.closest('.atom') ? [box.closest('.atom')] : box.querySelectorAll('.atom'))].filter((a) => r.intersectsNode(a));
    if (atoms.length !== 1) return null;
    const el = atoms[0], info = atomOfEl(el);
    if (!info || info.s == null || info.a.ro) return null;
    const rest = r.toString().replace(el.textContent, '').replace(/[\u200B\s]/g, '');
    return rest ? null : { el, info };
  }
  // The cross reference selected alone (Shift and an arrow over it): its atom's info, or null. Not
  // one the caret only touches: a caret is always at a reference's edge after it is put in, the
  // moment a Word user presses F12 to save (review H1)
  refHere() {
    const S = this.atomSelected();
    return S && S.info.a.kind === 'ref' ? S.info : null;
  }
  // Go to the label a cross reference points to (F12 on it, or Ctrl+click), as Go To does for a
  // label; Shift+F5 comes back here while nothing has been edited since (src/cmd/find.js goBack)
  followRef(info = this.refHere()) {
    if (!info) return false;
    const m = /\{([^}]*)\}\s*$/.exec(this.src(info.f).slice(info.s, info.e));
    const key = m ? m[1].split(',')[0].trim() : '';
    if (!key || !this.labelPlaces().has(key)) { this.toast(key ? 'No \\label{' + key + '} in this project.' : 'This reference names no label.'); return false; }
    const c = this.caretNow();
    // (back to the reference as it was selected, or the caret where it was)
    const back = c && !c.ghost ? (c.collapsed ? { f: c.f, p: c.a } : { f: c.f, p: c.a, selA: c.a, selB: c.b }) : { f: info.f, p: info.e, bias: 1 };
    const r = this.goToTarget('label', key);
    if (!r.ok) { this.toast(r.msg); return false; }
    this.followBack = { back, n: this.hist.length };
    return true;
  }

  // Ctrl+End, as Word's: the end of the text, never the footnotes under the last page's lines
  textEnd(extend) {
    const spans = this.root.querySelectorAll('.flow span.t');
    const last = spans[spans.length - 1];
    // (a display formula or a table at the end: after it, on a blank paragraph, as Word's end
    // after both; it stopped before the formula or in the last cell, review L1)
    const its = [...this.root.querySelectorAll('.flow .it')].filter((x) => !x.parentElement.closest('.it')), end = its[its.length - 1];
    const B = !extend && end && end.dataset.b != null && (!last || !end.contains(last) || last.closest('td')) && this.renderer.blocks.find((x) => String(x.id) === end.dataset.b);
    if (B) { this.root.focus({ preventScroll: true }); this.showGhost(end, B.f, B.e); return true; }
    if (!last || !last.firstChild) return false;
    const sel = getSelection(), n = last.firstChild, o = n.data.length;
    this.root.focus({ preventScroll: true });
    if (extend && sel.rangeCount) sel.extend(n, o); else sel.collapse(n, o);
    this.scrollToCaret();
    return true;
  }

  // a menu's keys: the arrows step through its items and wrap, Home and End go to the ends
  menuKeys(el) {
    el.addEventListener('keydown', (e) => {
      // (→ on an item that opens a menu opens it, as Word's and every menu bar's)
      const f = document.activeElement;
      if (e.key === 'ArrowRight' && f && el.contains(f) && f.getAttribute('aria-haspopup') === 'menu' && f.getAttribute('aria-disabled') !== 'true') { e.preventDefault(); e.stopPropagation(); f.click(); return; }
      if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) return;
      // (a greyed item with its reason stays in reach: kit.js openMenu's why)
      const all = [...el.querySelectorAll('[role=menuitem], [role=menuitemradio]')].filter((a) => ((!a.disabled && a.getAttribute('aria-disabled') !== 'true') || a.dataset.reach) && a.offsetParent);
      if (!all.length) return;
      const i = all.indexOf(document.activeElement), n = all.length;
      const j = e.key === 'Home' || (i < 0 && e.key === 'ArrowDown') ? 0 : e.key === 'End' || i < 0 ? n - 1 : (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      all[j].focus();
      e.preventDefault(); e.stopPropagation();
    });
  }

  makePop(anchor, cls, title) {
    // A dialog opened from inside another (Paragraph's Tabs…, by a press or by the keys) takes
    // over where that one would have given the focus back, the page's caret or its opener: looked
    // for again, it found neither (the focus was in the dialog going away) and fell to the ribbon's
    // launcher, and the next key was lost
    const prev = this.pop, inPrev = !!(prev && prev.el.getAttribute('role') === 'dialog' && prev.el.contains(document.activeElement));
    this.closePop(inPrev);
    if (this.pop) this.closePop(false, true);
    const hand = inPrev ? { back: prev.back, opener: prev.opener } : this.popHandoff;
    this.popHandoff = null;
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
    // Where the caret or the selection was as it opened, when the page had it (a press on the
    // ribbon keeps the page's focus): closed with Escape, Cancel or Close, the document gets them
    // back, as Word gives the document back when a dialog closes. Without this the focus fell to
    // the page's body and the next keys typed nothing. (On a touch screen only when the page had
    // the focus: focusing it there brings up the on-screen keyboard.)
    const at = this.caretNow(), had = document.activeElement;
    // (a ribbon control, pressed or reached by the keys, gives the page its caret back, as Word's
    // ribbon does once its command has run; tabs.py's Frontier by keys. Under File's view, which
    // covers the page, the command is the opener and gets the focus back)
    const pageHad = had === this.root || (!matchMedia('(pointer: coarse)').matches && (!had || had === document.body || !!had.closest('#ribbon, #rb-top')));
    const back = hand ? hand.back : at && !at.ghost && !at.crossFile && pageHad ? { c: at.collapsed ? { f: at.f, p: at.p } : { f: at.f, selA: at.a, selB: at.b }, text: this.files.get(at.f) } : null;
    document.body.appendChild(p);
    // (the control it was opened from, by the keys: the focus goes back to it when the page does
    // not take it, as a dialog's opener does; File's commands under File's view)
    const opener = hand ? hand.opener : had && had !== this.root && had !== document.body && had.closest && !had.closest('#pages') ? had : null;
    this.pop = { el: p, anchor, anchorPos: null, onClose: null, session: 'pop' + Date.now(), back, opener };
    p.addEventListener('mousedown', (e) => e.stopPropagation());
    // A dialog takes the focus as it opens, as Word's do, by the keys or by a press on the ribbon
    // (a press there keeps the page's focus, and Check accessibility or AutoCorrect Options then
    // left the keys typing into the page under them); its first control, not Close, and under a
    // finger never a text field (the on-screen keyboard would cover the dialog). Tab and Shift+Tab
    // go round inside it: past Close they had walked out into the bar and the page.
    if (/(^| )pop-(dlg|share|comment)( |$)/.test(p.className)) {
      p.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
        const all = popFocusables(p);
        if (!all.length) return;
        const i = all.indexOf(document.activeElement);
        if (e.shiftKey ? i <= 0 : i === all.length - 1 || i < 0) { e.preventDefault(); all[e.shiftKey ? all.length - 1 : 0].focus(); }
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!this.pop || this.pop.el !== p || !p.isConnected) return;
        const coarse = matchMedia('(pointer: coarse)').matches, text = (x) => x.matches('input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea, [contenteditable]');
        const a = document.activeElement;
        if (p.contains(a)) {
          // (under a finger a dialog never opens into a text field, even one it focuses itself:
          // Android's keyboard came up over it; a tap on the field brings it. But a field the
          // command named, data-named (Alt Text opens Table Properties at its Description), keeps
          // the focus on every device, as Word's)
          if (!coarse || !text(a) || a.hasAttribute('data-named')) return;
        } else if (a && a !== document.body && a !== this.root && !(a.closest && a.closest('#ribbon, #rb-top, #bar, #status, #nav'))) return;
        // (only from the page or the chrome: a field that took it on purpose keeps it)
        const all = popFocusables(p).filter((x) => !(coarse && text(x)));
        const pick = all.find((x) => !x.classList.contains('pop-x')) || all[0];
        if (pick) pick.focus({ preventScroll: true });
      }));
    }
    setTimeout(() => {
      this.popOutside = (e) => {
        if (!this.pop || this.pop.el.contains(e.target) || (e.target.closest && e.target.closest('.atom'))) return;
        // (what the popover keeps as its own: the Equation tab of an equation's field, its menus)
        if (this.pop.inside && this.pop.inside(e.target)) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.some((n) => n && n.classList && [...n.classList].some((c) => c.startsWith('ML__') || c.startsWith('MLK__') || c.startsWith('ui-menu') || c === 'wm-chip')) || path.some((n) => n && n.tagName && /^MATH-VIRTUAL-KEYBOARD|^UI-MENU/i.test(n.tagName))) return;
        // (the press puts the caret where it lands: the old one is not put back under it)
        this.pop.back = null;
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
  // An arrow out of a formula in the line (attachField's move-out): Right puts the caret after it,
  // Left before it, as Word's arrows leave an equation. A new formula still empty closes as Esc.
  // how: 'arrow', 'extend' (Shift with it: the formula selected and the selection on by one
  // character, as Word's), 'tab' (forward). In a paragraph that runs right to left, Right leaves on
  // the formula's left, which is its logical start (review E8).
  leaveMath(d, how = 'arrow') {
    const P = this.pop;
    if (!P) return;
    const it = P.anchor && P.anchor.closest ? P.anchor.closest('.it') : null;
    const rtl = P.rtl != null ? P.rtl : !!(it && getComputedStyle(it).direction === 'rtl');
    if (rtl && how !== 'tab') d = d === 'forward' ? 'backward' : 'forward';
    P.leftBy = d;
    P.extend = how === 'extend';
    this.closePop();
  }
  closePop(silent, force) {
    if (!this.pop) return;
    const P = this.pop;
    // (the equation field's last keys, which MathLive has not told its input yet: attachField)
    if (P.pullField) P.pullField();
    if (!force && P.refuse && P.refuse()) return;
    if (P.onClose) { try { P.onClose(); } catch (e) { console.error(e); } }
    // (left by Left at its start: the caret before the formula, where it stands once written; with
    // Shift, the formula selected, the selection going on past it)
    if (P.leftBy && P.anchorPos && P.returnCaret && P.returnCaret.p != null) {
      const f0 = P.anchorPos.f, s0 = P.anchorPos.s, e0 = P.returnCaret.p;
      if (P.extend) P.returnCaret = P.leftBy === 'backward' ? { f: f0, selA: e0, selB: s0, extendBy: 'backward' } : { f: f0, selA: s0, selB: e0, extendBy: 'forward' };
      else if (P.leftBy === 'backward') P.returnCaret = { f: f0, p: s0, bias: -1 };
    }
    if (P.mathText) { try { this.ensurePackages(P.mathText(), P); } catch (e) { console.error(e); } }
    if (P.wordTyping) P.wordTyping.destroy();
    try { if (window.mathVirtualKeyboard && window.mathVirtualKeyboard.visible) window.mathVirtualKeyboard.hide(); } catch (e) { /* ignore */ }
    this.pop = null;
    if (this.popOutside) document.removeEventListener('mousedown', this.popOutside, true);
    // (closed quietly with the focus in it, as a button that opens the next dialog does: that one
    // inherits this one's way back, in the same task only)
    if (silent && P.el.getAttribute('role') === 'dialog' && P.el.contains(document.activeElement)) {
      this.popHandoff = { back: P.back, opener: P.opener };
      queueMicrotask(() => { this.popHandoff = null; });
    }
    P.el.remove();
    this.closeGroup();
    if (!silent && P.returnCaret) {
      this.restoreCaret(P.returnCaret);
      if (P.returnCaret.extendBy) try { getSelection().modify('extend', P.returnCaret.extendBy, 'character'); } catch (e) { /* the formula alone stays selected */ }
    }
    if (!silent && P.display && P.returnCaret && !P.removed && !P.dollarClosed && !P.midLine) this.caretAfterDisplay(P.returnCaret);
    // Opened from a blank paragraph and closed with nothing made, or a document that so far
    // holds only what the popover made (a first formula) and has no text to put the caret in:
    // the caret goes to the blank paragraph, so typing goes on
    if (!silent && this.ghost && this.root.contains(this.ghost.el) && !this.caretNow()) this.caretToGhost();
    // the caret or selection it opened on, unless a step since changed that file (the step then
    // put the caret where it belongs) or the focus already went somewhere; not while File's view
    // covers the page (a menu of File's closed: the keys stay in the view, src/ui/fileview.js)
    const B = P.back, lost = !document.activeElement || document.activeElement === document.body;
    // (dialogs only: a menu closed with Esc gives the focus back to its button, as a menu button does)
    if (!silent && !P.returnCaret && B && lost && P.el.getAttribute('role') === 'dialog' && !document.body.classList.contains('file-open') && this.files.get(B.c.f) === B.text) this.restoreCaret(B.c, true);
    // Share, Save and Help open from a button of the bar: closed from the keyboard, the focus
    // goes back to it (it fell to the page's start, and Tab began again from the menu button)
    if (P.anchor instanceof HTMLButtonElement && P.anchor.offsetParent && (!document.activeElement || document.activeElement === document.body)) P.anchor.focus({ preventScroll: true });
    else if (!silent && P.opener && P.opener.isConnected && P.opener.offsetParent && !P.opener.closest('[inert]') && (!document.activeElement || document.activeElement === document.body)) P.opener.focus({ preventScroll: true });
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
  // The packages what was pasted needs (\mathbb from a chat assistant's formula, amssymb's): in the
  // paste's own step, so Undo takes them with it. Pasted, \mathbb stopped TeX with "Undefined
  // control sequence", where the equation field adds the package for it.
  pastePackages(t) {
    // (only what stands in formulas: \mathbb in the text is no command of amssymb's)
    const need = new Set();
    for (const m of String(t).matchAll(/\$\$?((?:[^$\\]|\\[\s\S])+)\$\$?|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g)) {
      const x = m[1] || m[2] || m[3] || '';
      for (const p of mathNeeds(x)) need.add(p);
      x.replace(/\\([A-Za-z]+)/g, (q, n) => { if (PACKAGES[n]) need.add(PACKAGES[n]); return q; });
    }
    if (!need.size) return [];
    const f = this.main, src = this.src(f), others = this.preambleOthers();
    return usePackages(src, [...need].filter((x) => !hasPackage(src, x, undefined, others)), { others }).map((x) => ({ f, ...x }));
  }
  ensurePackages(tex, P) {
    // (amssymb's \mathbb and the like too, as the Equation tab adds them: typed in the field they
    // were written with no package, and TeX stopped at them)
    const need = new Set(mathNeeds(tex));
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
      try { mf.setValue(d, MATH_VALUE); canon[k] = modelValue(mf) || d; } catch (e) { canon[k] = d; }
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
    mf.setValue(st.latex, MATH_VALUE);
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
    // (the field as the box last set it: MathLive sends its input event a task after the change,
    // so one for keys typed before the box took over came after it and wrote the field's reading
    // of the box back over the box)
    // (as fromField reads it, fieldValue: a closing bracket typed over the field's waiting one
    // changes that, not the latex MathLive gives, and was lost; X3's run)
    // MathLive tells its input a moment after the key: a formula typed fast and closed at once
    // (x, Enter) closed the box empty and was lost. What the field holds is read into the LaTeX
    // box first, whatever closes it (pull, before Esc, Enter, a move out; main's PR 94).
    let given = fieldValue(mf);
    const pull = () => {
      const cur = fieldValue(mf);
      if (cur === given) return;
      // (taken: a later event for this same value is stale, one for a deletion is not; with given
      // left at the box's last value, the field emptied by Backspace matched it and the box kept
      // the last character, X1)
      given = cur;
      let tex;
      try { tex = fromField(cur, st); } catch (e) { return; }
      if (tex === ta.value) return;
      fromMf = true;
      ta.value = tex;
      ta.dispatchEvent(new Event('input'));
      fromMf = false;
    };
    mf.addEventListener('input', pull);
    const sync = () => {
      if (fromMf) return;
      st = toField(ta.value, opts.display, opts.env(), D);
      st.same = same;
      if (mf.getValue('latex') !== st.latex) mf.setValue(st.latex, MATH_VALUE);
      given = fieldValue(mf);
      st.ml = fieldRows(modelValue(mf), st.multi, D);
    };
    // MathLive focuses its keyboard sink 60 ms after the field takes the focus, whatever happened
    // since: the box focused sooner than that (a hand over by dictation as the field opens, CI's
    // \text{if}\}; a click or a fill of the box as the field arrives, browser.py's lost \gamma
    // under load, X3; a busy page that runs the timer late) lost its focus to the field, and the
    // next keys went into the formula. The focus comes to the field from the box only by a press
    // on the field, Tab, or the page's own call (backOk); any other goes back to the box.
    let backOk = false;
    mf.addEventListener('pointerdown', () => { backOk = true; }, true);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') backOk = true; });
    // While the box holds what the field cannot show (\begin{ or a brace not yet closed, an
    // environment not yet ended) the keys stay in the box, a press on the field too: the field's
    // reading of it replaced the box's text, \begin{ lost and } and & escaped (W3)
    const boxOnly = () => (P.held && P.held()) || (ta.value.match(/\\begin\s*\{/g) || []).length > (ta.value.match(/\\end\s*\{/g) || []).length;
    mf.addEventListener('focusin', (e) => {
      if (e.relatedTarget !== ta || !ta.isConnected) return;
      if (boxOnly()) {
        if (backOk) { backOk = false; this.toast('The equation field shows this once it is complete: type on in the LaTeX box.'); }
        queueMicrotask(() => ta.focus({ preventScroll: true }));
        return;
      }
      if (backOk) { backOk = false; return; }
      queueMicrotask(() => ta.focus({ preventScroll: true }));
    });
    // That late focus also came while an input method composed in the box (\text{ waiting, then a
    // composition, handed over by wordmath.js toBox, within 60 ms of the box's push focusing the
    // field again): the browser ended the composition as the box lost the focus, its ひ left in the
    // box as text and 日本 at the box's start. While the box composes, the field's sink takes the
    // focus only by a press on the field; the composition ends where it began. (MathLive, its blur
    // ignored while its own focus was under way, is told it has no focus, as focusField does: else
    // it took itself for focused and the next field's focus went otherwise.)
    let composing = false;
    for (const t of ['compositionstart', 'compositionupdate']) ta.addEventListener(t, () => { composing = true; });
    ta.addEventListener('compositionend', () => { composing = false; });
    try {
      const k = mf.shadowRoot && mf.shadowRoot.querySelector('.ML__keyboard-sink');
      if (k) {
        k.focus = function (o) {
          if (!composing || backOk || document.activeElement !== ta) { HTMLElement.prototype.focus.call(this, o); return; }
          if (mf._mathfield) mf._mathfield.blurred = true;
        };
      }
    } catch (e) { /* MathLive's own focus, as before */ }
    // (the page's own moves of the focus to the field)
    const fieldFocus = () => { backOk = true; focusField(mf); backOk = false; };
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
    P.pullField = pull;
    if (opts.onKey) mf.addEventListener('keydown', (e) => { if (!wt.active() && mf.mode !== 'latex') opts.onKey(e); }, true);
    const wt = installWordTyping(mf, {
      host: P.el,
      macros: () => plain,
      dialect: () => D,
      onNewRowOutside: opts.onNewRowOutside,
      renderTex: (t) => this.renderer.katex(t, false).html,
      decimalComma,
      baseDepth: () => (st.multi ? 1 : 0),
      onDollar: opts.onDollar,
      closer: () => this.pop && this.pop.closer,
      onCloser: () => opts.onEnter(),
      // (W2, W4) what came in one insert after the box took the keys, or after the formula closed
      boxType: (t) => { ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); },
      afterClose: (rest) => this.typeRest(rest),
      // what the field cannot hold, typed as LaTeX (\begin{aligned}): it goes on in the LaTeX
      // box above, at the caret's place, the field showing what it makes
      toLatex: (more) => {
        // (a box the field handed over to keeps the field's keys: Enter done, Ctrl+Enter a row;
        // review N2, where Enter in a display's box was a newline and the next words went in)
        if (this.pop) this.pop.boxFromField = true;
        // (keys typed into the field whose input event is still to come: in the box first)
        pull();
        backOk = false;
        let at = ta.value.length;
        try { const pre = fromField(mf.getValue(0, mf.position, 'latex'), st); if (ta.value.startsWith(pre)) at = pre.length; } catch (e) { /* at the end */ }
        ta.focus();
        ta.setRangeText(more, at, at, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    });
    mf.addEventListener('keydown', (e) => {
      if (wt.active() || mf.mode === 'latex') return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); pull(); opts.onEscape(); }
      else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); pull(); opts.onEnter(); }
    }, true);
    // Right at a formula's end, Left at its start: the caret leaves it, as Word's does; the words
    // typed next went into the formula, their spaces lost ($ihasincome$). Only in a formula in the
    // line: in a display the arrows stay in it.
    if (opts.onMoveOut) {
      // The keys that leave a formula: Right and Left (with Shift, the selection goes on out of it,
      // as Word's), and Tab at its end, which Word takes as leaving forward. Shift+Tab goes on to
      // the LaTeX box. MathLive sends move-out for all of them, Tab's leap and Shift+Tab's too.
      let key = null;
      mf.addEventListener('keydown', (e) => {
        const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
        key = plain && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? (e.shiftKey ? 'extend' : 'arrow') : plain && e.key === 'Tab' && !e.shiftKey ? 'tab' : null;
        // (Shift with an arrow at the field's edge sends no move-out: MathLive keeps the selection in)
        if (key === 'extend' && !wt.active() && mf.mode !== 'latex') {
          let at = -1, last = -2;
          try { at = mf.position; last = mf.lastOffset; } catch (x) { /* as MathLive has it */ }
          const d = e.key === 'ArrowRight' ? (at === last ? 'forward' : null) : (at === 0 ? 'backward' : null);
          if (d) { e.preventDefault(); e.stopImmediatePropagation(); pull(); setTimeout(() => { if (this.pop === P) opts.onMoveOut(d, 'extend'); }, 0); }
        }
      }, true);
      mf.addEventListener('move-out', (e) => {
        const d = e.detail && e.detail.direction, how = key;
        if (!how || (d !== 'forward' && d !== 'backward') || (how === 'tab' && d !== 'forward') || wt.active() || mf.mode === 'latex') return;
        e.preventDefault();
        pull();
        // (after MathLive is done with the key: the field torn down inside its handling threw
        // "Cannot read properties of undefined (reading 'host')", review E3)
        setTimeout(() => { if (this.pop === P) opts.onMoveOut(d, how); }, 0);
      });
    }
    P.wordTyping = wt;
    P.field = mf;
    if (P.insertTex) this.eqWireField(P, mf, D, ta, fieldFocus);
    P.fieldFocus = fieldFocus;
    if (!opts.keepFocus || document.activeElement !== ta || ta.value === opts.initial) {
      fieldFocus();
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
    this.pop.display = display;
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
      for (const [v, l] of [['equation', 'Numbered equation'], ['equation*', 'Unnumbered equation'], ['align', 'Aligned, numbered rows'], ['align*', 'Aligned, no numbers'], ['gather', 'Gathered, numbered'], ['gather*', 'Gathered, no numbers'], ['multline', 'Multline, numbered'], ['multline*', 'Multline, no number'], ['\\[', '\\[ \\] display']]) {
        const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === cur) o.selected = true; envSel.appendChild(o);
      }
      if (![...envSel.options].some((o) => o.selected)) { const o = document.createElement('option'); o.value = cur; o.textContent = cur; o.selected = true; envSel.appendChild(o); }
      // (the Equation tab's Numbered does the same: \begin and \end renamed, nothing inside moved)
      envSel.addEventListener('change', () => { if (!this.eqSetKind(envSel.value)) envSel.value = (this.pop && this.pop.env) || cur; });
      row.appendChild(envSel);
    }
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = display ? '\\name + Space or \\frac{a}{b}, x^(n+1), a/b, Space steps out, Ctrl+Enter new row, Enter done' : '\\name + Space or \\frac{a}{b}, x^(n+1), a/b, Space steps out, Enter or $ done';
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
    // (the closing $ with no key, from dictation, an on-screen keyboard or a script, as its key)
    ta.addEventListener('beforeinput', (e) => {
      if (e.data !== '$' || !(!display || (this.pop && this.pop.dollarClose)) || !dollarEnds(ta)) return;
      e.preventDefault(); if (stay()) return; push.flush();
      // (opened by $$, its second closing $ is taken however the page draws it: in a p{} or X
      // cell or a \parbox the display is drawn in the line, not as a display; W1)
      if (display || this.pop.dollarClose) { this.swallowDollar = performance.now(); this.pop.dollarClosed = true; }
      this.closePop();
    });
    // a one line display made one of rows (Ctrl+Enter), as Word's: false, said why, where it cannot
    const toRows = () => {
      const P = this.pop;
      const env = P.env || info.a.env;
      if (/^(align|alignat|flalign|gather|multline|eqnarray)\*?$/.test(env)) return true;
      const to = env === 'equation' ? 'align' : /^(equation\*|\\\[|\$\$|displaymath)$/.test(env) ? 'align*' : null;
      if (!to) { this.toast('This display cannot take rows. Pick Aligned in the menu.'); return false; }
      push.flush();
      this.changeEnv(to);
      const sel = P.el.querySelector('#pop-env');
      if (sel) { if (![...sel.options].some((o) => o.value === to)) { const o = document.createElement('option'); o.value = to; o.textContent = to; sel.appendChild(o); } sel.value = to; }
      return true;
    };
    ta.addEventListener('keydown', (e) => {
      const fieldKeys = display && this.pop && this.pop.boxFromField;
      // (in a box the field handed over to: Ctrl+Enter a new row, inside an environment of rows
      // the box holds or in the display made one of rows)
      if (fieldKeys && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        const pre = ta.value.slice(0, ta.selectionStart), open = (pre.match(/\\begin\s*\{/g) || []).length > (pre.match(/\\end\s*\{/g) || []).length;
        if (!open && !toRows()) return;
        ta.setRangeText(' \\\\\n', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input'));
        return;
      }
      if (e.key === 'Enter' && (!display || fieldKeys || e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); if (stay()) return; push.flush(); this.closePop(); }
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
      // (the closing $ of a formula in the line, as typed in the source; \$ stays a dollar sign)
      if (e.key === '$' && (!display || (this.pop && this.pop.dollarClose)) && dollarEnds(ta)) { e.preventDefault(); if (stay()) return; push.flush(); if (display || this.pop.dollarClose) { this.swallowDollar = performance.now(); this.pop.dollarClosed = true; } this.closePop(); }
      // \) or \] typed in the box ends a formula opened by \( or \[
      if (this.pop && this.pop.closer && e.key === this.pop.closer && /(^|[^\\])\\$/.test(ta.value.slice(0, ta.selectionStart))) {
        e.preventDefault(); ta.setRangeText('', ta.selectionStart - 1, ta.selectionStart, 'end'); ta.dispatchEvent(new Event('input'));
        if (stay()) return; push.flush(); this.closePop();
      }
    });
    // However the box closes, what was typed is kept: text held back is written made whole
    // (mathMadeWhole), in the box's undo step.
    const whole = () => mathMadeWhole(ta.value, kerr());
    this.pop.onClose = () => { push.cancel(); if (!this.pop) return; const v = held() ? whole() : ta.value; this.pop.applyInner(v); this.eqClosed(this.pop, v); };
    // what is written must itself pass the box's check; if making it whole could not get it
    // there, the box stays open with its message (closePop asks) and nothing is lost
    this.pop.refuse = () => !!held() && !!mathBreaksOut(whole(), this.renderer.katex(this.mathPreviewTex(whole(), display), display).err);
    this.pop.mathText = () => ta.value;
    // (for the Equation tab, src/cmd/equation.js: what is typed written now, whether it can be;
    // its places in the source moved by a package line the tab added before them)
    this.pop.flush = () => push.flush();
    this.pop.held = () => !!held();
    this.pop.shiftBy = (edits) => {
      const P = this.pop, sh = (g, p) => edits.reduce((q, x) => (x.f === g && x.e <= p ? q + x.t.length - (x.e - x.s) : q), p);
      if (!P) return;
      if (P.range) { const R = P.range; R.e = sh(R.f, R.e); R.s = sh(R.f, R.s); }
      if (P.anchorPos) P.anchorPos = { ...P.anchorPos, s: sh(P.anchorPos.f, P.anchorPos.s) };
      if (P.returnCaret) P.returnCaret = { ...P.returnCaret, p: sh(P.returnCaret.f, P.returnCaret.p) };
    };
    this.eqWire(this.pop, ta);
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
        if (!P || !toRows()) return;
        const mf = P.field;
        if (!mf) return;
        if (P.fieldFocus) P.fieldFocus(); else focusField(mf);
        try { mf.position = Math.max(0, mf.lastOffset - 1); } catch (e) { /* ignore */ }
        P.wordTyping.newRow();
      } : null,
      onEnter: () => { if (stay()) return; push.flush(); this.closePop(); },
      // ($ closes a formula in the line as it does in the source, $x^2$ typed as in Overleaf, and a
      // display opened by $$ at its closing $$, the second $ taken on the page: insertText)
      onDollar: (check) => {
        const ok = !display || !!(this.pop && this.pop.dollarClose);
        if (check || !ok) return ok;
        if (stay()) return;
        push.flush();
        if (display || this.pop.dollarClose) { this.swallowDollar = performance.now(); this.pop.dollarClosed = true; }
        this.closePop();
      },
      onMoveOut: display ? null : (d, how) => { if (stay()) return; push.flush(); this.leaveMath(d, how); },
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

  // o.open, o.close: the delimiters (\( and \) typed as such; $ by default); o.closer: the key
  // that after a backslash ends it
  newMath(o = {}) {
    const open = o.open || '$', close = o.close || '$';
    const c = this.caretNow();
    if (!c) return;
    const sel = getSelection();
    const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    // (where a display could stand instead, for the Equation tab's Display)
    const canDisplay = this.eqCanDisplayHere(this.ribbonAt());
    const p = this.makePop(null, 'pop-math', 'New inline math');
    const PM = this.pop;
    // (the history before the formula: emptied, it goes with every step it made; X1)
    const h0 = this.hist.length, redo0 = this.redoStack;
    this.pop.closer = o.closer || null;
    this.pop.display = false;
    { const n = sel.anchorNode, it = n && (n.nodeType === 1 ? n : n.parentElement); const P0 = it && it.closest ? it.closest('.it') : null; this.pop.rtl = !!(P0 && getComputedStyle(P0).direction === 'rtl'); }
    this.pop.eqWhere = { display: canDisplay };
    this.pop.rect = rect && (rect.width || rect.height) ? rect : (sel.anchorNode && sel.anchorNode.parentElement ? sel.anchorNode.parentElement.getBoundingClientRect() : null);
    const ta = document.createElement('textarea');
    ta.className = 'code'; ta.rows = 1; ta.spellcheck = false; ta.id = 'pop-newtex';
    ta.placeholder = 'e.g. x^2 + y^2 = r^2'; ta.setAttribute('aria-label', 'The formula, as LaTeX');
    const prev = document.createElement('div'); prev.className = 'pv';
    const err = document.createElement('div'); err.className = 'pv-err'; err.hidden = true;
    const row = document.createElement('div'); row.className = 'pop-row';
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = o.closer ? 'Enter or \\) to insert.' : 'Enter or $ to insert. $ at once is a dollar sign, or a display when a letter follows.';
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
        const t = open + v + close;
        if (ghost) {
          this.ghost = ghost;
          const src = this.src(ghost.f);
          let nlB = 0; for (let k = ghost.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
          const pre = '\n'.repeat(Math.max(0, 2 - nlB));
          // (a blank paragraph set to Quote: the formula goes in the quote)
          const [qo, qc] = isEnvStyle(ghost.style) ? ['\\begin{' + envOf(ghost.style) + '}\n', '\n\\end{' + envOf(ghost.style) + '}'] : ['', ''];
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
      const t = open + v + close;
      if (!v) { this.commit([{ f: ins.f, s: ins.s, e: ins.e, t: '' }], null, this.pop.session); ins = null; return; }
      this.commit([{ f: ins.f, s: ins.s, e: ins.e, t }], null, this.pop.session);
      ins.e = ins.s + t.length;
      this.pop.returnCaret = { f: ins.f, p: ins.e, bias: 1 };
    };
    // A formula closed empty goes as Word's empty equation does: with every step it made taken
    // back, no undo step left for it, the caret where the $ was (X1). (Not while it is open: the
    // page built again under it closed it.)
    const dropEmpty = () => {
      const P = this.pop, at = ins;
      ins = null;
      if (!P) return;
      const mine = this.hist.slice(h0);
      if (mine.length && mine.every((h) => h.kind === P.session)) {
        for (const h of mine.reverse()) {
          this.hist.pop();
          for (const d of h.files) { const s = this.files.get(d.f) ?? ''; this.files.set(d.f, s.slice(0, d.s) + d.del + s.slice(d.s + d.ins.length)); }
        }
        this.redoStack = redo0;
        this.rebuild(base ? { f: base.f, p: base.a } : undefined);
        this.pushToSource(); this.saveSoon(); this.updateUndoUI();
        if (ghost) this.ghostAt(ghost.f, ghost.pos, ghost.style);
      } else if (at) this.commit([{ f: at.f, s: at.s, e: at.e, t: '' }], null, P.session);
      else return;
      P.returnCaret = base ? { f: base.f, p: base.a } : null;
    };
    const push = debounce(() => this.pop && insert(ta.value), 160);
    const preview = () => { const r = this.renderer.katex(this.mathPreviewTex(ta.value, false), false); prev.innerHTML = ta.value ? r.html : ''; err.textContent = r.err ? plainMathError(r.err, ta.value) : ''; err.title = r.err || ''; err.hidden = !r.err || !ta.value; };
    // An empty formula: $ at once is a dollar sign, as $$ always was here (a price: $$5), and a
    // display, as $$ in the source (Overleaf's), when a letter or a backslash comes next
    // (dollarPairTakes); a space a dollar sign and the space, as a $ alone in prose is (review M6,
    // L6); \$ is a dollar sign too
    let keys = 0;
    const emptyKey = (k) => {
      // (keys typed into the field whose input event is still to come: "5 each" in one insert
      // found the formula empty at its space and wrote \$ there, the words after it lost; W4)
      if ((k === '$' || k === ' ') && !ta.value && this.pop && this.pop.pullField) this.pop.pullField();
      if (ta.value || ins || (k !== '$' && k !== ' ') || o.closer) return false;
      if (k === '$' && keys) return false;
      this.closePop(true);
      if (k === '$') {
        // (its own step, nothing typed after it joined to it: the next key may take it back)
        const redo0 = this.redoStack;
        this.closeGroup();
        if (ghost) { this.ghost = ghost; this.ghostInsert('\\$'); }
        else this.commit([{ f: base.f, s: base.a, e: base.b, t: '\\$' }], { f: base.f, p: base.a + 2 }, 'insert');
        this.closeGroup();
        const c2 = this.caretNow();
        this.dollarPair = c2 && !c2.ghost && c2.collapsed ? { f: c2.f, p: c2.a, n: this.hist.length, h: this.hist[this.hist.length - 1], redo0, at: base ? base.a : null, ghost: ghost ? { pos: ghost.pos, style: ghost.style } : null } : null;
        return true;
      }
      if (ghost) { this.ghost = ghost; this.ghostInsert('\\$ '); }
      else this.commit([{ f: base.f, s: base.a, e: base.b, t: '\\$ ' }], { f: base.f, p: base.a + 3 }, 'type');
      return true;
    };
    // $5 then a space is a price, as Word users type one ($5 now), or a formula that opens with a
    // number ($1 - \alpha$, $0 < x < 1$, $2 x$): the keys after the space decide (verification of
    // eb14945, V1; of 5446132, W6, W7). The space waits (pend, the number as typed; a % or \% after
    // it waits as the number does, $5% now). A sign, <, =, a backslash, a digit, a brace, ^, _, $
    // or Enter keeps the formula, the space in it. A letter starts a word, which waits beside the
    // formula, said in the box's hint and never drawn in it ($5each$ in math italics until the
    // space; befd04a's X2): $ right after the word ($2 x$) puts it in the formula and keeps the
    // formula; a space or a sentence's mark after it, Enter, Esc or the box closing makes the
    // price, written with the word in one step ($5 each, $5 each.). Backspace takes back the word's
    // letters, then the space. Text from an input method or a dead key after the space is a word,
    // never a variable (W5).
    let pend = null, word = '', priced = false;
    const PRICE = /^\d+([.,]\d+)?(\\?%)?[.,;:!?)]?$/;
    const priceText = (more) => '\\$' + pend.replace(/(^|[^\\])%/g, '$1\\%') + ' ' + more;
    // (a formula opened by $$ where a display cannot go: its closing $$ is one, the second $ taken)
    const pairDone = () => { if (this.pop && this.pop.pairInline) this.swallowDollar = performance.now(); };
    const makePrice = (more) => {
      push.cancel();
      const t = priceText(more), at = ins, P = this.pop;
      pend = null; word = '';
      ins = null; ta.value = '';
      if (at) this.commit([{ f: at.f, s: at.s, e: at.e, t }], null, P.session);
      // (closed as a price: not an empty formula to take away, with the price's own step)
      priced = true;
      this.closePop(true);
      if (at) this.restoreCaret({ f: at.f, p: at.s + t.length });
      else if (ghost) { this.ghost = ghost; this.ghostInsert(t); }
      else this.commit([{ f: base.f, s: base.a, e: base.b, t }], { f: base.f, p: base.a + t.length }, 'type');
      return true;
    };
    const hint0 = hint.textContent;
    const wait = () => {
      hint.textContent = pend === null ? hint0 : word ? '$' + pend + ' ' + word + ': a price at the next space or mark; $ keeps a formula.' : '$' + pend + ' and a space: a price if a word follows.';
      hint.classList.toggle('wait', pend !== null);
    };
    // k: a key's name, or with data a character that came with no key
    const priceKey = (k, inBox, data) => {
      if (!k || o.closer) return false;
      if (pend === null) {
        if (k !== ' ') return false;
        // (keys typed into the field whose input event is still to come)
        if (this.pop && this.pop.pullField) this.pop.pullField();
        if (!PRICE.test(ta.value)) return false;
        pend = ta.value; word = ''; wait();
        return true;
      }
      const ch = data ? k[0] : k.length === 1 ? k : null;
      // (Shift, Caps Lock, an input method's Process and the like come before what they make)
      if (!ch && !/^(Enter|Escape|Tab|Delete|Backspace|Arrow|Home|End|Page)/.test(k)) return false;
      if (ch && /^\p{L}$/u.test(ch)) { word += ch; wait(); return true; }
      if (k === 'Backspace') { if (word) word = word.slice(0, -1); else pend = null; wait(); return true; }
      if (word && ch && /^[ .,;:!?)'"]$/.test(ch)) return makePrice(word + ch);
      if (word && /^(Enter|Escape|Tab)$/.test(k)) return makePrice(word);
      if (!word && k === ' ') return true;
      // (anything else keeps the formula, the space and the word in it: in the box as typed, in the
      // field the word alone, which sets no space)
      const more = word ? ' ' + word : ch && ch !== '$' && inBox ? ' ' : '';
      pend = null; word = ''; wait();
      if (more) {
        if (inBox) ta.setRangeText(more, ta.selectionStart, ta.selectionEnd, 'end');
        else ta.value += more;
        ta.dispatchEvent(new Event('input'));
      }
      return false;
    };
    // (X1) Backspace in an empty formula takes the formula away, as Word's does an equation's
    const backKey = (k) => {
      if (k !== 'Backspace') return false;
      if (this.pop && this.pop.pullField) this.pop.pullField();
      if (ta.value) return false;
      push.cancel();
      this.closePop();
      return true;
    };
    // (W5) an input method's or a dead key's text after "$5 ": the price, with it as its word; it
    // went into the formula, and the waiting space after it
    p.addEventListener('compositionend', (e) => {
      if (pend === null || !e.data || this.pop !== PM) return;
      e.stopPropagation(); e.preventDefault();
      makePrice(word + e.data);
    }, true);
    ta.addEventListener('beforeinput', (e) => {
      // (W4) several characters with no key (dictation, a phone's suggestion bar) before the field
      // is there: one at a time through the rules below, as keys, and once the box has closed the
      // rest on the page; "5 each" went into the formula whole, the words lost
      if (e.inputType === 'insertText' && !e.isComposing && e.data && [...e.data].length > 1) {
        e.preventDefault();
        const chars = [...e.data];
        for (let i = 0; i < chars.length; i++) {
          if (this.pop !== PM) { this.typeRest(chars.slice(i).join('')); return; }
          const ch = chars[i];
          if (emptyKey(ch) || priceKey(ch, true, true)) continue;
          if (ch === '$' && !o.closer && dollarEnds(ta) && !stay()) { push.flush(); pairDone(); this.closePop(); continue; }
          ta.setRangeText(ch, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); keys++;
        }
        return;
      }
      if (emptyKey(e.data) || priceKey(e.data, true, true)) { e.preventDefault(); return; }
      // (the closing $ that comes with no key, from dictation, an on-screen keyboard or a script:
      // it went into the formula, and what followed with it)
      if (e.data === '$' && !o.closer && dollarEnds(ta)) { e.preventDefault(); if (stay()) return; push.flush(); pairDone(); this.closePop(); return; }
      keys++;
    });
    ta.addEventListener('input', () => { preview(); push(); });
    ta.addEventListener('keydown', (e) => {
      // (a named key after a price's space: Backspace takes the space back; characters come by beforeinput)
      if (pend !== null && e.key.length !== 1 && priceKey(e.key, true)) { e.preventDefault(); return; }
      if (backKey(e.key)) { e.preventDefault(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (stay()) return; push.flush(); this.closePop(); }
      if (e.key === 'Escape') { e.preventDefault(); push.flush(); this.closePop(); }
      if (e.key === '$' && !o.closer && dollarEnds(ta)) { e.preventDefault(); if (stay()) return; push.flush(); pairDone(); this.closePop(); }
      if (o.closer && e.key === o.closer && /(^|[^\\])\\$/.test(ta.value.slice(0, ta.selectionStart))) {
        e.preventDefault(); ta.setRangeText('', ta.selectionStart - 1, ta.selectionStart, 'end'); ta.dispatchEvent(new Event('input'));
        if (stay()) return; push.flush(); this.closePop();
      }
    });
    const whole = () => mathMadeWhole(ta.value, kerr(ta.value));
    this.pop.onClose = () => {
      push.cancel();
      const P = this.pop;
      if (!P) return;
      let v = '';
      // (closed as a price by its key: makePrice wrote it)
      if (priced) { /* written */ }
      // (closed by a click or the like with a word after "$5 ": the price, W6)
      else if (pend !== null && word) {
        const t = priceText(word);
        pend = null; word = '';
        if (ins) { this.commit([{ f: ins.f, s: ins.s, e: ins.e, t }], null, P.session); P.returnCaret = { f: ins.f, p: ins.s + t.length }; ins = null; }
        else if (ghost) { this.ghost = ghost; this.ghostInsert(t); P.returnCaret = null; }
        else { this.commit([{ f: base.f, s: base.a, e: base.b, t }], null, P.session); P.returnCaret = { f: base.f, p: base.a + t.length }; }
        ta.value = '';
      } else {
        v = held(ta.value) ? whole() : ta.value;
        if (!v) dropEmpty(); else insert(v);
      }
      // (the Equation tab's menus and the ribbon follow however the box closed: closed empty or as
      // a price, the ribbon kept the Equation tab of a formula gone, and Insert's Equation button,
      // agent.py's next step, stayed out of reach)
      this.eqClosed(P, v);
    };
    this.pop.refuse = () => !!held(ta.value) && !!held(whole());
    this.pop.mathText = () => ta.value;
    this.pop.returnCaret = base ? { f: base.f, p: base.a } : null;
    this.pop.flush = () => push.flush();
    this.pop.held = () => !!held(ta.value);
    this.pop.shiftBy = (edits) => {
      const P = this.pop, sh = (g, p) => edits.reduce((q, x) => (x.f === g && x.e <= p ? q + x.t.length - (x.e - x.s) : q), p);
      if (!P) return;
      if (ins) { ins.e = sh(ins.f, ins.e); ins.s = sh(ins.f, ins.s); }
      if (base) { base.b = sh(base.f, base.b); base.a = sh(base.f, base.a); }
      if (ghost) ghost.pos = sh(ghost.f, ghost.pos);
      if (P.anchorPos) P.anchorPos = { ...P.anchorPos, s: sh(P.anchorPos.f, P.anchorPos.s) };
      if (P.returnCaret) P.returnCaret = { ...P.returnCaret, p: sh(P.returnCaret.f, P.returnCaret.p) };
    };
    this.eqWire(this.pop, ta);
    this.positionPop();
    ta.focus();
    this.eqTab();
    this.attachField(prev, ta, {
      display: false, initial: '', keepFocus: true,
      env: () => '$',
      onEnter: () => { if (stay()) return; push.flush(); this.closePop(); },
      // the closing $ of $x^2$ typed as in Overleaf ends the formula; in an empty one it stays a
      // dollar sign (onKey, below)
      onDollar: (check, typing) => { const ok = !!(ta.value || ins || typing); if (check || !ok) return ok; if (stay()) return; push.flush(); pairDone(); this.closePop(); },
      onMoveOut: (d, how) => { if (stay()) return; push.flush(); this.leaveMath(d, how); },
      onEscape: () => { push.flush(); this.closePop(); },
      onKey: (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (emptyKey(e.key) || priceKey(e.key, false) || backKey(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (e.key.length === 1) keys++;
      }
    });
  }

  // $$ then a letter or a backslash, as Overleaf's $$x^2$$: the \$ the second $ wrote is taken
  // back with its step, as if never typed, and a display opens there with the key in its LaTeX
  // box, where what follows is typed as in the source and $$ closes it. Anything else after $$
  // (a digit, a space, a sign, Enter, Esc) keeps the dollar sign: a price, $$5, is \$5
  dollarPairTakes(data) {
    const P = this.dollarPair;
    this.dollarPair = null;
    if (!P || !/^[\p{L}\\]$/u.test(data || '')) return false;
    const c = this.caretNow(), h = this.hist[this.hist.length - 1];
    if (!c || c.ghost || !c.collapsed || c.f !== P.f || c.a !== P.p || this.hist.length !== P.n || h !== P.h || this.src(P.f).slice(P.p - 2, P.p) !== '\\$') return false;
    this.hist.pop();
    for (const d of h.files) { const s = this.files.get(d.f) ?? ''; this.files.set(d.f, s.slice(0, d.s) + d.del + s.slice(d.s + d.ins.length)); }
    this.redoStack = P.redo0;
    this.rebuild({ f: P.f, p: P.ghost ? P.ghost.pos : P.at });
    this.pushToSource(); this.saveSoon(); this.updateUndoUI();
    if (P.ghost) this.ghostAt(P.f, P.ghost.pos, P.ghost.style);
    this.newDisplayMath('\\[', { inLine: true });
    // (where a display cannot go, a command's argument or a table cell set in a line, a formula in
    // the line opens instead, its closing $$ taken as one: the key was lost there and the second $
    // written as \$; V2, V3)
    const pop = this.pop, ta = pop && pop.el.querySelector('#pop-tex, #pop-newtex');
    if (!pop || !ta) {
      // (no formula opened at all: the dollar sign and the key are written as typed)
      const c2 = this.caretNow(), t = '\\$' + escapeTeX(data, '$');
      if (c2 && !c2.ghost) this.commit([{ f: c2.f, s: c2.a, e: c2.b, t }], { f: c2.f, p: c2.a + t.length }, 'type');
      return true;
    }
    if (ta.id === 'pop-newtex') pop.pairInline = true;
    else pop.dollarClose = true;
    ta.value = data;
    ta.dispatchEvent(new Event('input'));
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return true;
  }

  // env: the Equation tab's Numbered on a new equation still empty makes it again of that kind;
  // o.inLine: typed as $$ in a line of text, whose words go on after \] (dollarPairTakes)
  newDisplayMath(env = 'equation', o = {}) {
    let c = this.caretNow();
    if (!c) return;
    // (not in a LaTeX paragraph or a line to come in one: an equation there is typed as its source)
    if (c.ghost ? this.ghostRaw() : this.texHere()) return;
    // in the blank paragraph of a new document too (the ribbon's Equation is pressed there)
    if (c.ghost) { c = { f: this.ghost.f, a: this.ghost.pos }; this.removeGhost(); }
    else {
      // never inside a command's argument (a document got \section{The exact PDF\n\begin{equation}…}):
      // a heading's goes after the heading and its label; in a caption, a footnote or another
      // command's braces a formula in the line is made instead
      const B = this.blockBase({ f: c.f, a: c.a, b: c.a }, true);
      // (nor in a table cell set in a line, l, c or r, where TeX stops at a display: LR mode)
      if (B === false || this.lineCellAt(c.f, c.a)) { this.newMath(); return; }
      if (B && B.a !== c.a) { c = { f: c.f, a: B.a }; this.restoreCaret({ f: c.f, p: c.a }, true); }
    }
    // (a file written with CRLF keeps them; a kind of amsmath's brings it, in the same step)
    const nl = eolAt(this.src(c.f), c.a);
    // (a line break before and after it only where none is: one after it, before the blank line
    // that was there, made two blank lines)
    // (typed as $$ in the middle of a line, none after it: the words typed after the closing $$
    // went between \] and that line break, which printed a space before the rest, "end ."; V4)
    const S0 = this.src(c.f), lineEnds = /^[ \t]*(\r?\n|$)/.test(S0.slice(c.a)), lead = /\n[ \t]*$/.test(S0.slice(0, c.a)) ? '' : nl, tail = /^[ \t]*\r?\n/.test(S0.slice(c.a)) || o.inLine ? '' : nl;
    const t = lead + (env === '\\[' ? '\\[' + nl + '  ' + nl + '\\]' : '\\begin{' + env + '}' + nl + '  ' + nl + '\\end{' + env + '}') + tail;
    const pk = this.eqKindPkgs(env);
    // (the history as it is before the equation: given up empty, it goes back to this)
    this.closeGroup();
    const h0 = this.hist.length, redo0 = this.redoStack;
    const a0 = c.a;
    c = { f: c.f, a: c.a + pk.filter((x) => x.f === c.f && x.e <= c.a).reduce((n, x) => n + x.t.length - (x.e - x.s), 0) };
    this.commit([{ f: c.f, s: a0, e: a0, t }, ...pk], { f: c.f, p: c.a + t.length }, 'insert');
    const el = this.findAtomEl({ f: c.f, s: c.a + lead.length, kind: 'math' });
    if (el) { const info = atomOfEl(el); if (info) { this.openMath(el, info); this.eqTab(); } }
    // closed with nothing typed, the equation goes again: it stayed as an empty environment,
    // which prints a number beside nothing
    const P = this.pop;
    if (!P || !P.onClose) return;
    P.eqNew = true;
    // (closed by Esc or a click too, the caret stays in the line, after \], as after its $$)
    if (o.inLine && !lineEnds) P.midLine = true;
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
      P.removed = true;
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
    const item = (k, e, loose) => ({ key: k, label: shortAuthors(e) + ' ' + entryYear(e), title: texToPlain(e.fields.title || '').replace(/[{}]/g, ''), ...(loose ? { loose } : {}) });
    for (const [k, e] of this.model.bibEntries) out.push(item(k, e));
    // A .bib the project holds that the document does not name (Open or a drop added it): its
    // entries are offered too, after the named ones, as Overleaf offers a project's, and a key
    // picked from one puts that file in the document's bibliography (citeBibFor). The list was
    // empty, saying no bibliography was loaded, right after the toast that said the .bib was added.
    if (!this.bibState().thebib) {
      const named = this.bibFilesNamed(), seen = new Set(out.map((x) => x.key));
      for (const [n, t] of this.files) {
        if (!/\.bib$/i.test(n) || typeof t !== 'string' || named.has(n)) continue;
        try { for (const [k, e] of parseBib(t, n)) if (!seen.has(k)) { seen.add(k); out.push(item(k, e, n)); } } catch (e) { /* a .bib it cannot read */ }
        if (out.length > 5000) break;
      }
    }
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
        b.addEventListener('click', () => { keys.push(h.key); search.value = ''; write(); if (h.loose) this.citeBibFor(h.loose); search.focus(); });
        list.appendChild(b);
      }
    };
    search.addEventListener('input', draw);
    // (Enter cites the highlighted work and closes; Ctrl+Enter cites it and stays for another)
    this.pickerKeys(search, list, true);
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

  // A picker's list by the keys, as a completion list is (POWER-USER.md 7): Up and Down move the
  // highlight, Enter takes it and closes the picker with the caret after what it wrote (Ctrl+Enter,
  // where more can be taken, takes it and stays), Esc closes. It went on taking the first item
  // and staying open, so the next words went into its search box.
  pickerKeys(input, list, more) {
    const items = () => [...list.querySelectorAll('.pitem')];
    // (a combobox with its listbox, as the search box is, and a polite count: arrowing through the
    // list said nothing to a screen reader; review M5)
    list.id = list.id || 'pk-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', input.getAttribute('aria-label') || 'Choices');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    const live = document.createElement('div');
    live.className = 'sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
    list.after(live);
    const mark = (i) => {
      const all = items();
      all.forEach((b, k) => { b.classList.toggle('on', k === i); b.id = 'pk-' + k; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = -1; });
      if (all[i]) { all[i].scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', all[i].id); } else input.removeAttribute('aria-activedescendant');
    };
    const count = () => { const n = items().length; live.textContent = n === 1 ? '1 match' : n + ' matches'; };
    input.addEventListener('input', () => { mark(0); count(); });
    input.addEventListener('keydown', (e) => {
      const all = items(), i = all.findIndex((b) => b.classList.contains('on'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (all.length) mark(e.key === 'ArrowDown' ? (i + 1) % all.length : (i <= 0 ? all.length - 1 : i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const b = all[Math.max(0, i)];
        if (b) b.click();
        if (more && (e.ctrlKey || e.metaKey)) { input.focus(); mark(0); } else this.closePop();
      } else if (e.key === 'Escape') { e.preventDefault(); this.closePop(); }
    });
    // (the place the list starts with: the label the reference points to now, or the first)
    requestAnimationFrame(() => { const all = items(); const i = all.findIndex((b) => b.classList.contains('on')); mark(Math.max(0, i)); });
  }
  // where each \label is: key -> { f, p } (the first of a key, as LaTeX takes it)
  labelPlaces() {
    const out = new Map();
    for (const [f, t] of this.files) if (/\.tex$/i.test(f)) for (const x of labelsIn(t)) if (!out.has(x.key)) out.set(x.key, { f, p: x.p });
    return out;
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
    const at = this.labelPlaces();
    const labels = [...this.model.labels.entries()].map(([k, v]) => ({ key: k, num: v.num, kind: v.kind, pv: at.has(k) ? labelPreview(this.src(at.get(k).f), at.get(k).p, v.kind) : { text: '' } }));
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.replaceChildren();
      for (const L of labels.filter((x) => !q || (x.key + ' ' + x.kind + ' ' + x.num + ' ' + (x.pv.text || x.pv.math || '')).toLowerCase().includes(q))) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pitem' + (L.key === key ? ' on' : '');
        b.innerHTML = '<b>' + esc(L.kind.charAt(0).toUpperCase() + L.kind.slice(1)) + ' ' + esc(L.num || '') + '</b><span>' + esc(L.key) + '</span>';
        // what it names: the heading's words, the equation drawn, the caption (Word's list shows them)
        const pv = document.createElement('span'); pv.className = 'pv-l';
        if (L.pv.math) { const r = this.renderer.katex(L.pv.math, false); if (r.err) pv.textContent = L.pv.math; else pv.innerHTML = r.html; } else pv.textContent = L.pv.text;
        if (pv.textContent) b.appendChild(pv);
        b.addEventListener('click', () => { key = L.key; if (L.kind === 'equation' && cmd === 'ref') cmd = 'eqref'; cs.value = cmd; write(); });
        list.appendChild(b);
      }
      if (!labels.length) { const n = document.createElement('div'); n.className = 'empty'; n.textContent = 'No labels yet. Add \\label{...} after a section, equation or figure.'; list.appendChild(n); }
    };
    search.addEventListener('input', draw);
    this.pickerKeys(search, list, false);
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
      const [qo, qc] = isEnvStyle(ghost.style) ? ['\\begin{' + envOf(ghost.style) + '}\n', '\n\\end{' + envOf(ghost.style) + '}'] : ['', ''];
      const o = qo + open.replace(/^\n+/, '');
      this.removeGhost();
      this.commit([{ f: ghost.f, s: ghost.pos, e: ghost.pos, t: pre + o + close + qc }], { f: ghost.f, p: ghost.pos + pre.length + o.length, bias: 1 }, 'insert');
      return;
    }
    const src = this.src(base.f);
    const inner = base.a !== base.b && isBalanced(src, base.a, base.b) ? src.slice(base.a, base.b) : '';
    this.commit([{ f: base.f, s: base.a, e: inner ? base.b : base.a, t: open + inner + close }], { f: base.f, p: base.a + open.length + inner.length, bias: 1 }, 'insert');
  }
  // Where a block (a figure, an environment, a list) typed from the insert list goes (review M2):
  // base as it is; after the heading it was typed in, and the heading's \label; inside another
  // command's argument (a caption, the title, a footnote), where it broke the command, nowhere
  // (false), said why. A bare group, {\bf ...}, takes it as the paragraph would.
  // A table cell that sets its words in a line (an l, c or r column, not p, m or X): a display
  // there stops TeX (LR mode), so a formula in the line is made instead (V3)
  lineCellAt(f, p) {
    const T = tableAt(this.src(f), p);
    const at = T && tableCellAt(T, p);
    if (!at) return false;
    return colAlign(T.spec.cols[at.cell.col]) !== 'p';
  }
  blockBase(base, quiet) {
    if (!base) return base;
    const src = this.src(base.f), B = this.renderer && this.renderer.blocks.find((x) => x.f === base.f && x.s <= base.a && base.a <= x.e);
    if (!B) return base;
    // the braces open at the caret, from the block's start
    const opens = [];
    for (let k = B.s; k < base.a; k++) {
      const ch = src[k];
      if (ch === '\\') { k++; continue; }
      if (ch === '{') opens.push(k); else if (ch === '}') opens.pop();
    }
    if (!opens.length) return base;
    const open = opens[0];
    // (the command's earlier arguments before it: \href{url}{text}, \parbox{4cm}{…},
    // \colorbox{red}{…}; read past, the text was taken for a bare group and got a display; W1)
    const m = /\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\]\s*|\{[^{}]*\})*$/.exec(src.slice(Math.max(B.s, open - 400), open));
    const name = m ? m[1] : '';
    if (!name) return base;
    if (/^(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)$/.test(name)) {
      const lab = /^\s*\\label\s*\{[^}]*\}/.exec(src.slice(B.e));
      const p = B.e + (lab ? lab[0].length : 0);
      return { f: base.f, a: p, b: p };
    }
    if (!quiet) this.toast('Not inside \\' + name + '{…}: put the caret after it, then the block.', 5000);
    return false;
  }
  // What was typed in the insert list as a command of its own (POWER-USER.md 10): it was written
  // as typed, \alpha and \frac into the text, where TeX stops (Missing $ inserted). A math
  // command opens a formula holding it; \begin{name} writes the environment; others as typed.
  runPaletteRaw(k, base, ghost) {
    const env = /^begin\s*\{?\s*([A-Za-z]+\*?)?\s*\}?$/.exec(k);
    if (env && env[1]) { base = this.blockBase(base); if (base === false) return; }
    const insertAt = (open, close) => this.insertPiece(base, ghost, open, close);
    const back = () => { if (base) this.restoreCaret({ f: base.f, p: base.a }); else if (ghost && this.ghost === ghost && ghost.el.isConnected) this.caretToGhost(); };
    if (env && !env[1]) { back(); this.runCommand('insert-env-other'); return; }
    if (env) {
      const name = env[1];
      if (/^(equation|align|gather|multline|flalign)\*?$/.test(name)) { back(); this.newDisplayMath(name); return; }
      // (a list with its first item, a table with a column for each & of its first row: empty they
      // stopped TeX, missing \item, a tabular with no columns)
      const inner = /^(itemize|enumerate)$/.test(name) ? ['  \\item ', ''] : name === 'description' ? ['  \\item[', '] '] : /^(tabular|array)$/.test(name) ? ['{ll}\n  ', ' & \\\\'] : ['', ''];
      insertAt('\n\n\\begin{' + name + '}' + (inner[0][0] === '{' ? '' : '\n') + inner[0], inner[1] + '\n\\end{' + name + '}\n\n');
      return;
    }
    if (mathOnly(k)) {
      back();
      this.newMath();
      const ta = this.pop && this.pop.el.querySelector('#pop-newtex');
      if (ta) { ta.value = '\\' + k + ' '; ta.dispatchEvent(new Event('input')); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      return;
    }
    insertAt('\\' + k + (/[A-Za-z]$/.test(k) ? ' ' : ''), '');
  }
  // insertPiece with edits of the preamble in the same step (a \newtheorem); the caret's place
  // moved by them
  insertPieceWith(base, ghost, open, close, needs) {
    const f = ghost ? ghost.f : base.f, at = ghost ? ghost.pos : base.a;
    const grow = needs.filter((x) => x.f === f && x.e <= at).reduce((n, x) => n + x.t.length - (x.e - x.s), 0);
    if (ghost) {
      this.ghost = ghost;
      const src = this.src(ghost.f);
      let nlB = 0; for (let k = ghost.pos - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
      const pre = '\n'.repeat(Math.max(0, 2 - nlB)), o = open.replace(/^\n+/, '');
      this.removeGhost();
      this.commit([...needs, { f, s: at, e: at, t: pre + o + close }], { f, p: at + grow + pre.length + o.length, bias: 1 }, 'insert');
      return;
    }
    const src = this.src(f);
    const inner = base.a !== base.b && isBalanced(src, base.a, base.b) ? src.slice(base.a, base.b) : '';
    this.commit([...needs, { f, s: base.a, e: inner ? base.b : base.a, t: open + inner + close }], { f, p: base.a + grow + open.length + inner.length, bias: 1 }, 'insert');
  }
  runPalette(x, base, ghost) {
    if (x.block && !x.raw) { base = this.blockBase(base); if (base === false) return; }
    const insertAt = (open, close) => this.insertPiece(base, ghost, open, close);
    // (the caret back where the list was opened: in the blank paragraph, or at its place in the text)
    const back = () => { if (base) this.restoreCaret({ f: base.f, p: base.a }); else if (ghost && this.ghost === ghost && ghost.el.isConnected) this.caretToGhost(); };
    if (x.act === 'math') { back(); this.newMath(); return; }
    if (x.act === 'equation') { back(); this.newDisplayMath(x.env || 'equation'); if (x.tex) this.eqInsert(x.tex); return; }
    if (x.act === 'cite' || x.act === 'ref' || x.act === 'eqref') {
      const cmd = x.act === 'cite' ? this.citeChoices()[0][0] : x.act;
      const t = '\\' + cmd + '{}';
      if (!base) { insertAt(t, ''); return; }
      this.commit([{ f: base.f, s: base.a, e: base.a, t }], { f: base.f, p: base.a + t.length, bias: 1 }, 'insert');
      const el = this.findAtomEl({ f: base.f, s: base.a, kind: x.act === 'eqref' ? 'ref' : x.act });
      if (el) { const info = atomOfEl(el); if (info) (x.act === 'cite' ? this.openCite(el, info) : this.openRef(el, info)); }
      return;
    }
    // an item that is a command of the registry run as its button runs it (Interactive graph)
    if (x.act === 'cmd') { if (base) this.restoreCaret({ f: base.f, p: base.a }); this.runCommand(x.id); return; }
    if (x.raw) return this.runPaletteRaw(x.k, base, ghost);
    const t = typeof x.t === 'function' ? x.t(this) : x.t;
    // (a theorem like environment brings its \newtheorem, proof amsthm, where the preamble has none)
    const needs = x.needs ? x.needs(this) : [];
    if (needs.length) return this.insertPieceWith(base, ghost, t.open, t.close, needs);
    insertAt(t.open, t.close);
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
      // (a raw command keeps its case, \O and \Gamma; one letter matches names only, as \o Enter
      // wrote \footnote{} where "Footnote" holds an o; review L5)
      const typed = inp.value.replace(/^\\/, '').trim(), q = typed.toLowerCase();
      // (a name typed whole first, then names it starts, then descriptions: "equation" Enter took
      // \eqref, whose description, Equation reference, comes earlier in the list)
      const rank = (x) => (!q ? 1 : x.k === q ? 0 : x.k.startsWith(q) ? 1 : 2);
      shown = items.filter((x) => !q || x.k.startsWith(q) || (q.length > 1 && x.d.toLowerCase().includes(q))).sort((a, b) => rank(a) - rank(b));
      if (q && !shown.some((x) => x.k === typed)) shown = [...shown, { k: typed, d: 'Insert \\' + typed + ' as typed', raw: true }];
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
    const back = () => { if (base) this.restoreCaret({ f: base.f, p: base.a }); else if (ghost && this.ghost === ghost && ghost.el.isConnected) this.caretToGhost(); };
    inp.addEventListener('input', () => {
      // a sign right after the backslash, as typed in the source (review M6): \( and \[ open a
      // formula ended by \) and \]; \$ \% \& \# \_ \{ \} are the sign itself
      const v = inp.value;
      if (v.length === 1 && /[([$%&#_{}]/.test(v)) {
        this.closePop(true);
        if (v === '(') { back(); this.newMath({ open: '\\(', close: '\\)', closer: ')' }); return; }
        if (v === '[') { back(); this.newDisplayMath('\\['); if (this.pop) this.pop.closer = ']'; return; }
        this.insertPiece(base, ghost, '\\' + v, '');
        return;
      }
      hi = 0; draw();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(shown.length - 1, hi + 1); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
      if (e.key === 'Enter') { e.preventDefault(); if (shown[hi]) run(shown[hi]); }
      // (Esc keeps what was typed, as the text it is: it went, and the keys after it with it; not
      // as a command, \sec in prose being an error TeX stops at, review of M6)
      if (e.key === 'Escape') { e.preventDefault(); const v = inp.value; this.closePop(true); if (v) this.insertPiece(base, ghost, escapeTeX('\\' + v, base ? this.src(base.f)[base.a - 1] || ' ' : ' '), ''); else back(); }
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
      if (y > a && x < b) flash(span, { inline: true });
    }
  }

  // ---- source pane -----------------------------------------------------------------
  // o.keys: opened by its key from the page, the source's cursor goes where the page's caret is
  // and the focus with it; closed by its key from the source, the page's caret goes where the
  // source's cursor was (it opened at line 1 and left the focus on the page, and closing dropped
  // the focus to nowhere)
  async toggleSource(force, o = {}) {
    // (in the LaTeX or PDF view across the window, src/cmd/view.js: back to the page, the source beside it)
    if (this.leaveView() && force == null) force = true;
    const on = force ?? !document.body.classList.contains('src-on');
    const was = document.body.classList.contains('src-on');
    const pageAt = on && !was ? this.caretNow() : null;
    const srcAt = !on && was && o.keys && this.cm && this.cm.hasFocus() ? { f: this.srcFile || this.main, p: this.cm.getDoc().indexFromPos(this.cm.getDoc().getCursor()) } : null;
    if (srcAt && this.srcRebuild.pending()) this.srcRebuild.flush();
    if (on && document.body.classList.contains('pdf-on')) this.togglePdf(false);
    document.body.classList.toggle('src-on', on);
    $('#b-src').setAttribute('aria-pressed', on ? 'true' : 'false');
    this.prefs.source = on;
    store(PREFS, this.prefs);
    if (on) {
      await this.ensureCM();
      this.showSrcFile(this.srcFile || this.main);
      if (pageAt && !pageAt.ghost && pageAt.f != null && this.cm) this.viewPlaceInSource({ f: pageAt.f, p: pageAt.a }, !o.keys);
      else this.revealCaret();
    }
    setTimeout(() => { if (this.computePx()) this.relayout(true); }, 30);
    if (srcAt) this.viewPlaceOnPage(srcAt);
  }

  async ensureCM() {
    if (this.cm || this.cmLoading) return this.cmLoading;
    this.cmLoading = (async () => {
      const host = $('#cmhost');
      try {
        await loadScript(CDN.cm);
        await loadScript(CDN.cmTex);
        // (the bracket that matches the one at the cursor, lit: a missing brace is LaTeX's commonest
        // slip; without it the source still works)
        await loadScript(CDN.cmBrackets).catch(() => {});
        this.cm = window.CodeMirror(host, {
          value: '', mode: 'stex', lineNumbers: true, lineWrapping: true, indentUnit: 2, tabSize: 2, matchBrackets: true,
          extraKeys: {
            'Ctrl-Z': () => this.undo(), 'Cmd-Z': () => this.undo(), 'Shift-Ctrl-Z': () => this.redo(), 'Shift-Cmd-Z': () => this.redo(), 'Ctrl-Y': () => this.redo(),
            // (Ctrl+S is the page's own shortcut, heard here too: a second one saved every file twice)
            // Tab indents in the source, so a keyboard that tabbed in stayed caught here, typing tabs
            // into the file: Escape, then Tab or Shift+Tab, moves on to the next control
            'Esc': () => { this.cmTabOut = true; },
            // Find and Replace in the source: the dialog with In LaTeX source ticked, the words
            // selected here as what to find (Ctrl+F was the browser's find bar)
            'Ctrl-F': () => this.srcFind('find'), 'Cmd-F': () => this.srcFind('find'), 'Ctrl-H': () => this.srcFind('replace'), 'Cmd-Alt-F': () => this.srcFind('replace')
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
        const note = await this.loadGitFiles(files, 'Switched to ' + v);
        this.toast('Switched to ' + v + '.' + note, note ? 9000 : undefined);
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
    const prox = mk('input'); prox.type = 'url'; prox.placeholder = 'CORS proxy, e.g. ' + gitProxyHere(); prox.value = gitProxyOf(this.prefs); prox.setAttribute('aria-label', 'CORS proxy');
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
      const proxy = keepGitProxy(this.prefs, prox.value.trim()); store(PREFS, this.prefs);
      const o = { token: t, remote: url.value.trim(), corsProxy: proxy, accepted: legacy.chosen() };
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
        let pulled = '';
        try {
          const o = opts();
          await G.pull(dir, o, this.gitAuthor().name ? this.gitAuthor() : { name: 'Rikuy', email: 'rikuy@localhost' });
          kept(o);
          pulled = await this.loadGitFiles(await G.workingFiles(dir), 'Pulled');
        } catch (err) { fail(b, err); return; }
        done(b); this.gitRefresh();
        if (pulled) this.toast(pulled.trim(), 9000);
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
    rem.append(url, tok, legacy.el, prox, rrow, mk('div', 'git-note', 'GitHub and GitLab need a token with write access. A browser cannot speak git to them itself, so Rikuy passes git\'s requests through its own proxy on this site (CORS proxy), which keeps nothing of them. Inside claude.ai the page can only reach its own server, so pushing works from Rikuy on its own site; here, Download LaTeX gives a clone to push from your computer.'));
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
            this.setBase({ t: c.commit.author.timestamp * 1000, label: 'Commit ' + c.oid.slice(0, 7) + ' · ' + subj, files, track: true });
            this.toggleNav(true, 'changes');
            this.toast('The changes since commit ' + c.oid.slice(0, 7) + ' are listed. Track Changes is on: your edits from here are changes too.', 6000);
            if (this.markupOn()) this.marksSoon();
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
    const prox = mk('input'); prox.type = 'url'; prox.placeholder = 'CORS proxy'; prox.value = gitProxyOf(this.prefs);
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
      const proxy = keepGitProxy(this.prefs, prox.value.trim()); store(PREFS, this.prefs);
      const o = { token: t, remote: u, corsProxy: proxy, depth: 200, accepted: legacy.chosen() };
      o.onAccepted = () => { o.accepted = true; };
      const name = await this.cloneName(u);
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
    if (/Failed to fetch|NetworkError|Load failed|Content Security Policy|CORS/i.test(m)) {
      // (the hosted copy reaches git hosts through its own proxy alone: its policy refuses any other address)
      if (__RIKUY_APP__) return 'Could not reach the remote. Rikuy reaches git hosts only through its own proxy, ' + gitProxyHere() + ': put that address in CORS proxy, or Download LaTeX and push from your computer. (' + m + ')';
      return 'Could not reach the remote. From inside claude.ai the page may only talk to its own server; run Rikuy on its own site, or Download LaTeX and push from your computer. (' + m + ')';
    }
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
    // (a pull or a branch without the main file: the document it has, or the one its latexmkrc names)
    const was = this.main;
    const main = texts.has(was) ? was : pickMain(texts, await latexmkrcText(extra)) || was;
    // The project's mark goes to its new main file, the stricter of it and the one kept there,
    // as on File, Main document (review I2): unmarked there, a pull or a branch that renamed
    // main.tex compiled a cloned repository with full shell escape. Read before anything changes.
    const [mark, there] = !origin && main !== was ? await Promise.all([this.linkInfo(), this.markOf(this.name, main)]) : [];
    // Whether the pull or the branch brought other code: a .tex, .sty, .cls, .bib or any file
    // TeX or a program it starts can read as code, not a picture (as a dropped .zip's zipCode).
    // An Allow given to a repository's earlier files does not cover them, as it does not cover a
    // dropped archive's: a clone allowed once compiled every later pull with full shell escape.
    // Every such file is compared byte for byte (a run.py padded to its old size kept the Allow,
    // X1); only while the project is allowed, the one case where it matters.
    const code = (n) => !/\.(png|jpe?g|gif|webp|pdf)$/i.test(n);
    const sameBytes = async (blob, bytes) => {
      if (!blob || !bytes || blob.size !== bytes.length) return false;
      const a = new Uint8Array(await blob.arrayBuffer());
      for (let i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
      return true;
    };
    const changedCode = async () => {
      for (const n of new Set([...texts.keys(), ...this.files.keys()])) if (code(n) && texts.get(n) !== this.files.get(n)) return true;
      for (const [n, b] of [...this.extra, ...this.assetBlobs]) if (code(n) && !texts.has(n) && !(await sameBytes(b, files.get(n)))) return true;
      for (const n of files.keys()) if (code(n) && !texts.has(n) && !this.extra.has(n) && !this.assetBlobs.has(n)) return true;
      return false;
    };
    const held = origin ? null : await this.linkInfo();
    const codeChanged = !origin && (main !== was || (!!held && !!held.allowed && await changedCode()));
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear();
    this.files = texts; this.orig = orig; this.extra = extra;
    for (const [n, b] of blobs) this.addAsset(n, b);
    this.main = main;
    // a cloned repository is someone else's content: its shell escape is restricted until the
    // owner allows more, marked before anything below can start a compile
    if (origin) this.markFromLink('', this.name, this.main, origin);
    else if (main !== was) this.carryLink(mark, main, there);
    let note = '';
    const now = !origin && codeChanged && this.linkCache && this.linkCache.get(this.name + '|' + this.main);
    if (now && now.allowed) {
      this.markFromLink(now.by || '', this.name, this.main, now.origin || 'git');
      note = ' Shell escape, allowed for this repository before, is restricted again: its TeX files changed. Allow it in the PDF pane if you trust them.';
    }
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
    return note;
  }

  // A clone's project name, from its address, and one of its own: github.com/x/thesis cloned beside
  // one's own thesis took its name, its versions and the marks kept under it, so an Allow given to
  // one's own document there reached the clone (V1)
  async cloneName(u) {
    return this.freeProjectName(cleanProjectName(/git\.overleaf\.com/.test(u) ? 'overleaf-' + u.split('/').pop().slice(0, 6) : u.replace(/\.git$/, '').split('/').pop(), 'paper'));
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

  // (end: the characters to p..end selected in the source, without its focus: a hit of Find)
  async reveal(f, p, focusSrc, end) {
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
      if (end != null) doc.setSelection(pos, doc.posFromIndex(end), { scroll: false });
      if (focusSrc) { this.cm.focus(); if (end == null) doc.setCursor(pos); }
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
    flash(it);
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
      // (in Mobile View: the text at its actual size, or a quarter larger to read)
      if (window.innerWidth < 700 && document.body.classList.contains('pg-web')) this.prefs.zoom = z === 'fit' ? 1.25 : 'fit';
      else if (window.innerWidth > 520) this.prefs.zoom = 'fit';
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
          // (a hidden file is left out, a Mac's or an editor's, but not the two kinds a LaTeX
          // project needs: latexmk's .latexmkrc, and a .keep or .gitkeep that is there only so its
          // folder exists, as \tikzexternalize[prefix=figures/] needs figures/ to write into)
          const hidden = (n) => /(^|\/)(__MACOSX|\.(?!(?:latexmkrc|keep|gitkeep)$))/.test(n);
          const names = Object.keys(z.files).filter((n) => !z.files[n].dir && !hidden(n));
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
            // (again on the name as cleanPath made it, \ read as /: figs\.htaccess is figs/.htaccess, review N6)
            if (hidden(rel)) continue;
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
      // A .bib opened on its own under a name BibTeX cannot read (Zotero exports "My Library.bib":
      // \bibliography{My Library} found no database, and every citation printed [?]) joins the
      // project under one it can, My-Library.bib, which the citation picker then writes (review
      // E15). Opened again, it replaces that file: the name it came under is kept with it
      // (this.orig's from). Another whose name comes to the same, "My  Library.bib", gets a free
      // one, My-Library-2.bib: it replaced the first, and the toast said Added (review V5). (One
      // from an archive keeps the name its document gives it.)
      const bibRenamed = [];
      for (const n of [...texts.keys()]) {
        const base = n.split('/').pop();
        if (!/\.bib$/i.test(n) || zipAdded.has(n) || /^[A-Za-z0-9_.-]+$/.test(base)) continue;
        const dir = n.slice(0, n.length - base.length), stem = base.slice(0, -4).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[-.]+|-+$/g, '') || 'references';
        const free = (k) => !texts.has(k) && !this.files.has(k) && !this.assetBlobs.has(k) && !this.extra.has(k);
        let safe = [...this.orig].find(([k, o]) => o && o.from === n && this.files.has(k) && !texts.has(k))?.[0];
        if (!safe) { safe = dir + stem + '.bib'; for (let k = 2; !free(safe); k++) safe = dir + stem + '-' + k + '.bib'; }
        texts.set(safe, texts.get(n)); texts.delete(n);
        if (orig.has(n)) { orig.set(safe, { ...orig.get(n), from: n }); orig.delete(n); }
        bibRenamed.push([n, safe]);
      }
      const bibNote = bibRenamed.length ? ' ' + bibRenamed.map(([a, b]) => a + ' is ' + b + ' here').join(', ') + ': BibTeX cannot read a name with spaces or signs.' : '';
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
      // (a file opened over another is a step of its own: typing before it and after it are two
      // undos, and Undo puts the text it replaced back. It was no step, so the steps before it
      // were applied to the new text at the old offsets: stepFits)
      this.closeGroup();
      const overText = new Map([...texts.keys()].filter((n) => this.files.has(n) && this.files.get(n) !== texts.get(n)).map((n) => [n, this.files.get(n)]));
      // (a text file over one of its name is said replaced, not added: review V5)
      for (const n of texts.keys()) if (this.files.has(n) && !replaced.includes(n)) replaced.push(n);
      for (const [n, t] of texts) this.files.set(n, t);
      if (overText.size) { this.record(overText, 'open', null, null); this.closeGroup(); }
      // (an opened file: no last selection of the one it replaced)
      this.rbLast = null;
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
      this.toast(said + use + bibNote + heldNote + markNote + skipNote, skipNote || use || bibNote || heldNote || markNote ? 9000 : undefined);
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
    // (a subfiles chapter compiles alone too, but the document is the one it names: never it
    // first; a latexmkrc that names the document is followed, as latexmk does)
    this.main = pickMain(texts, await latexmkrcText(extra)) || onlyTex[0];
    // A .zip or a project with a git history is content from someone else, like a share link:
    // its shell escape is restricted (the worker runs only TeX Live's safe programs, keeps no
    // LuaTeX font cache and is let go after) until the owner allows more. Loose .tex/.bib files
    // the user opened are their own and stay unrestricted.
    const theirs = !!(from || zipCode() || gitFiles.has('.git/HEAD'));
    // Such a project opens under a name this browser does not keep yet, as a share link does
    // (review I1): a stranger's thesis.zip opened under the name of the user's own thesis shared
    // its versions, and the marks kept per name and main file met the user's own there.
    // (no | in it: a .zip named thesis|talk.zip read as another split of the same key)
    const want = cleanProjectName(zipName || this.main.replace(/\.tex$/i, '').split('/').pop());
    const name = theirs ? await this.freeProjectName(want) : want;
    this.name = name;
    const renamed = name !== want ? ' This browser keeps a project named ' + want + ', so this one is ' + name + '.' : '';
    if (theirs) this.markFromLink('', this.name, this.main, from || (gitFiles.has('.git/HEAD') ? 'git' : 'zip'));
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
    this.toast('Opened ' + this.main + (texts.size > 1 ? ' and ' + (texts.size - 1) + ' more file' + (texts.size > 2 ? 's' : '') : '') + '.' + renamed + (missing.length ? ' Not found: ' + missing.join(', ') + '.' : '') + gitNote + (prev && prev !== this.name ? ' ' + prev + ' is kept under Review, Versions.' : '') + skipNote, skipNote ? 10000 : 7000);
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
    // (rikuy.sty loads graphicx for its live figures, but a document whose graphs go keeps its
    // pictures: they get graphicx of their own, so rikuy.sty does not count here)
    const others = d ? this.preambleOthers().filter((t) => !/\\ProvidesPackage\{rikuy\}/.test(t)) : [];
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
  // a picture of the project put in, replaced or (blob null) taken out, by a step of the history
  setAsset(name, blob) {
    const url = this.assets.get(name);
    if (url) URL.revokeObjectURL(url);
    this.assets.delete(name);
    this.assetBlobs.delete(name);
    if (blob) this.addAsset(name, blob);
    this.binaryDirty = true;
    this.forceRender = true;
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
      this.noteSaveState(ok && !partial);
    };
    this.unsaved = false;
    const fallback = () => show(store(STORE, meta), this.assetBlobs.size > 0 || this.extra.size > 0);
    if (this.noIdb) { fallback(); return; }
    // The write hands back the copy it replaces: when another tab of this browser saved it after
    // this one last read or wrote, that tab's text goes into the versions instead of being lost.
    const prevT = this.savedT;
    this.savedT = meta.t;
    const jobs = [];
    // Undo's history goes with the text it undoes, so a reload can still undo: the project names
    // the time its steps were written under (hT), and init reads them only where that and the
    // project match. Steps unchanged since the last write are not written again (historySig):
    // the project names that write's time. A failed write is retried at the next save, and until
    // then the project names a time no steps have, so none are taken.
    const sig = this.historySig();
    if (sig !== this.histSig || !this.histT) {
      this.histT = meta.t; this.histSig = sig;
      jobs.push(kvPut('history', this.historyKept(meta)).catch(() => { this.histSig = null; }));
    }
    meta.hT = this.histT;
    jobs.push(kvSwap('project', meta).then((cur) => { if (cur && cur.files && cur.t !== prevT) return this.keepOtherTab(cur); }));
    if (this.binaryDirty) {
      this.binaryDirty = false;
      jobs.push(kvPut('binary', {
        assets: [...this.assetBlobs.entries()],
        extra: [...this.extra.entries()],
        orig: [...this.orig.entries()].map(([n, o]) => [n, { bytes: o.bytes, enc: o.enc, bom: o.bom, from: o.from }])
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
    // (Track Changes' base another tab stored, its switch or an Accept, with or without new text)
    if (!this.noIdb && this.rvCheckBase) this.rvCheckBase();
    if (this.noIdb || this.unsaved || !this.model) return;
    let cur = null;
    try { cur = await kvGet('project'); } catch (e) { return; }
    if (!cur || !cur.files || cur.t === this.savedT || this.unsaved) return;
    if (cur.name !== this.name || cur.main !== this.main) return;
    // (that tab may have marked the project a stranger's since this one read its mark, as an
    // archive dropped there does: read again before its text is drawn and compiled here, V2)
    await this.freshMark();
    if (cur.name !== this.name || cur.main !== this.main || this.unsaved) return;
    this.syncEngineMenu();
    const edits = [];
    for (const [n, t] of cur.files) { const was = this.files.get(n); if (was !== t) edits.push({ f: n, s: 0, e: was == null ? 0 : was.length, t }); }
    this.savedT = cur.t;
    // (this tab has that tab's text now: its Allow is no longer refused, see allowMark)
    if (this.markStale) this.markStale.delete(this.name + '|' + this.main);
    if (!edits.length) return;
    this.closePop(true);
    this.closeGroup();
    this.commit(edits, null, 'other-tab');
    this.closeGroup();
    // (and that tab's Track Changes base and switch: its edits stay its changes)
    this.rvCheckBase();
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
  // The name a download takes: the document's, or for a new one still called Untitled, its title
  // as the page prints it, as Word offers a new file's first line ("Optimal Taxation under
  // Political Turnover.pdf", not Untitled.pdf). The project keeps its name: storage, versions,
  // the engine chosen and git are kept under it.
  fileBase() {
    let n = this.name || '';
    if (/^Untitled( \d+)?$/.test(n)) {
      const T = titleInfo(this.src(this.main) || '');
      if (T && T.title) {
        const t = texToPlain(this.src(this.main).slice(T.title.is, T.title.ie).replace(/\\thanks\s*\{[^{}]*\}/g, '').replace(/\\\\(\[[^\]]*\])?/g, ' ')).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
        if (t) n = t;
      }
    }
    // (a file name as Word suggests one: letters of any script, digits and spaces kept, only what
    // a file system refuses taken out; "Política Económica" came out Pol-tica-Econ-mica, and a
    // title in Chinese as paper; review E17)
    // (and what other programs trip on, review V7: the marks that turn text's direction or join
    // letters unseen, which can make "fdp.exe" read as "exe.pdf"; Windows' device names, which no
    // file there may have even with an extension, CON.pdf; at most 200 bytes of UTF-8, cut
    // between characters, so the name with its extension stays under the 255 of ext4 and APFS)
    n = n.normalize('NFC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
    let out = '', bytes = 0;
    for (const ch of [...n].slice(0, 100)) { const k = new TextEncoder().encode(ch).length; if (bytes + k > 200) break; out += ch; bytes += k; }
    out = out.replace(/[\s.]+$/, '').replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/i, '$1_');
    return out || 'paper';
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
        fname = this.fileBase() + '.zip';
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
    if (this.leaveView() && force == null) force = true;
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
      if (frac == null) bar.removeAttribute('aria-valuenow'); else bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      bar.firstChild.style.width = frac == null ? '' : Math.round(frac * 100) + '%';
      this.pdfWait(st.textContent);
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
  // (a file beside the main file's folder is ../ from it: talk/slides.tex reads ../style/defs)
  texPath(f) {
    const dir = this.main.includes('/') ? this.main.slice(0, this.main.lastIndexOf('/') + 1) : '';
    if (!dir || f.startsWith(dir)) return f.slice(dir.length);
    const up = dir.split('/').filter(Boolean), parts = f.split('/');
    let k = 0;
    while (k < up.length && k < parts.length - 1 && up[k] === parts[k]) k++;
    return '../'.repeat(up.length - k) + parts.slice(k).join('/');
  }
  fromTexPath(p) {
    if (!p) return this.main;
    const dir = this.main.includes('/') ? this.main.slice(0, this.main.lastIndexOf('/') + 1) : '';
    const clean = p.replace(/^\.\//, '');
    // (TeX names a file from the main file's folder: ../sections/intro.tex from talk/)
    const norm = (t) => { const out = []; for (const x of t.split('/')) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); } return out.join('/'); };
    const rel = norm(dir + clean), own = norm(clean);
    for (const c of [rel, rel + '.tex', own, own + '.tex', dir + clean, clean, dir + clean + '.tex', clean + '.tex']) if (this.files.has(c)) return c;
    for (const k of this.files.keys()) if (k.endsWith('/' + clean)) return k;
    return null;
  }

  fromPdf(file, line) {
    const f = this.fromTexPath(file);
    if (!f) return;
    // in the PDF view the page is not there to go to: the place is kept for going back to it
    if (this.viewPdfClick && this.viewPdfClick(f, line)) return;
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

  // The PDF's first page as the page's sheet, for documents of this set up (mediaKey): what TeX
  // made is what the page draws, whatever class or package set it (src/pagesrc.js mediaSet
  // knows the common ones before any PDF is made)
  takePdfSheet(key) {
    const p0 = this.pdfView && this.pdfView.pages && this.pdfView.pages[0];
    if (!key || !p0 || !(p0.w1 > 0)) return;
    const w = p0.w1 * 72.27 / 72, h = p0.h1 * 72.27 / 72, old = this.pdfSheet;
    this.pdfSheet = { key, w, h };
    if (this.model && (!old || old.key !== key || Math.abs(old.w - w) > 0.5 || Math.abs(old.h - h) > 0.5)) this.layoutPass();
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
    // (the text and engine as the run starts; the shell escape mode once the project's mark is read)
    let sig = this.pdfSigNow();
    // (what decides the PDF's sheet in the source compiled: the sheet TeX gives it is the page's)
    const mediaKey = this.model && this.model.opts.page ? this.model.opts.page.mediaKey : null;
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
      $('#pdfpane').setAttribute('aria-busy', 'true');
      this.pdfWait('TeX is getting ready. The first time, it downloads the engine, which takes a moment.');
      // a document that came in a link compiles restricted, and the worker keeps nothing of it
      // (read again from storage: another tab may have marked it since, V2)
      const li = await this.freshMark();
      const untrusted = !!(li && !li.allowed);
      sig = sig.slice(0, sig.lastIndexOf('|') + 1) + this.shellMode(li);
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
      // the copy on claude.ai has no room for the fonts of other scripts and a few large font
      // families (Libertinus, Droid, fbb): say where they are
      if (res.unkeptScripts && SCRIPT_HOST && navigator.onLine !== false) throw Object.assign(new Error('This copy of Rikuy has no room for the fonts this document needs (other scripts, or a large font family). Open the document in the full Rikuy at ' + SCRIPT_HOST + ' (Download, LaTeX saves it; Open there loads it).'), { scripts: true });
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
        return { sev: x.sev, f, p, line, msg: issueText(x, line ? this.src(f).slice(p).split('\n', 1)[0] : ''), key: 'tex:' + x.msg, tex: true };
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
        this.takePdfSheet(mediaKey);
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
      $('#pdf-host').replaceChildren();
      const d = document.createElement('div'); d.className = 'pdf-empty';
      // offline, a file TeX has not kept fails to load; say what to do rather than "Failed to fetch"
      const need = e && e.unkept ? ' (' + e.unkept.slice(0, 5).join(', ') + (e.unkept.length > 5 ? ' and more' : '') + ')' : '';
      const off = __RIKUY_APP__ && APP.on && navigator.onLine === false ? 'You are offline, and this document needs TeX files this browser has not kept yet' + need + '. Compile it once with a network and they stay; Make available offline (in the status bar, or the menu on a phone) keeps those of a typical paper and of the open document. ' : '';
      const line = document.createElement('p');
      line.textContent = e && e.scripts ? e.message + ' The page preview can still be printed.' : off + this.texFailText(e, !!off, !!need) + 'The page preview can still be printed.';
      said = st.textContent + '. ' + line.textContent;
      // the same words the pane says: a script reading the problem must not see "Failed to fetch"
      this.lastCompile.failed = line.textContent;
      const acts = document.createElement('div'); acts.className = 'pdf-acts';
      const again = document.createElement('button'); again.className = 'btn sm'; again.type = 'button'; again.textContent = 'Try again';
      again.addEventListener('click', () => this.compilePdf({ clean: true }));
      const b = document.createElement('button'); b.className = 'btn sm ghost'; b.type = 'button'; b.textContent = 'Print the preview';
      b.addEventListener('click', () => this.printPDF());
      acts.append(again, b);
      d.append(line, acts);
      $('#pdf-host').appendChild(d);
    } finally {
      clearInterval(this.compileTick);
      $('#pdf-re').textContent = 'Recompile';
      $('#pdfpane').setAttribute('aria-busy', 'false');
      bar.hidden = true;
      if (said) this.pdfSay(said);
      this.compiling = false;
      const again = this.compileAgain;
      this.compileAgain = false;
      if (again && document.body.classList.contains('pdf-on')) this.compilePdf({ clean: again === 'clean' });
      else if (this.pdfSigNow() !== sig) this.pdfSoon();
    }
  }

  // One run of TeX for a script (rikuy.api.compile): the PDF of the text as it is now, or why
  // there is none. As Download PDF does, it opens nothing: the preview stays open or closed as
  // it was, and the PDF TeX last made is taken when the text has not changed since.
  async compileResult() {
    const idle = async () => { while (this.compiling) await new Promise((r) => setTimeout(r, 100)); };
    await idle();
    const fresh = !!this.lastPdf && this.lastPdfSig === this.pdfSigNow() && !!this.lastCompile && this.lastCompile.ok;
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
    else this.pdfStale = true;
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
    const fname = this.fileBase() + '.pdf';
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
    const fname = this.fileBase() + '-print.html';
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
    // (a wide window: Help is a pane at the right, src/ui/helppane.js; pressed again, it closes)
    if (this.helpPaneOpen() && window.innerWidth >= 1000) { this.closeHelpPane(); return; }
    const p = this.makePop($('#b-help'), 'pop-help', 'How Rikuy works');
    const mod = isMac ? 'Cmd' : 'Ctrl';
    p.insertAdjacentHTML('beforeend', `
      <p>Rikuy is a writing app for papers: you type on the finished page, and it keeps a LaTeX file up to date behind it.</p>
      <p>The ribbon above the page works as in Word. Its tabs (Home, Insert, References, Review, View, Help, Table Layout while the caret is in a table, and Equation while an equation is open) each hold a row of buttons; Home has what you need most. Styles sets the paragraph you are in as Normal, a Heading, a Quote, or LaTeX, which shows it as its LaTeX source to type in directly. Make words bold, italic or underlined, start a list. Insert adds a formula, an equation, a table, a picture, a footnote, a citation or a link where the caret is. Search in the bar (Alt+Q) finds any command by its name, and a right click on the page lists what applies there.</p>
      <p>Download gives you the paper as a PDF, as a Word file or as LaTeX. Live graphs stay live only in the LaTeX download. Preview shows the PDF beside the page.</p>
      <p>The page is typeset from your LaTeX source. Every edit you make on the page is written back into the source as the smallest possible change.</p>
      <dl class="keys">
        <dt>Type, select, delete</dt><dd>As in any editor</dd>
        <dt>${mod}+B, ${mod}+I</dt><dd>Bold, italic (\\textbf, \\emph)</dd>
        <dt>${mod}+U, ${mod}+Shift+X, ${mod}+, and ${mod}+.</dt><dd>Underline (\\uline), strikethrough, subscript, superscript; ${mod}+Shift+A, K: all caps, small caps; ${mod}+Alt+H: highlight; ${mod}+D: the Font dialog; ${mod}+Shift+F: the font box</dd>
        <dt>${mod}+Shift+&gt; and &lt;, Shift+F3, ${mod}+Space</dt><dd>The next size up or down (the document's at a bare caret); lowercase, Capitalize Each Word, UPPERCASE in turn; clear the character formatting</dd>
        <dt>${mod}+Alt+1, 2, 3, ${mod}+Alt+0</dt><dd>Heading 1, 2, 3; Normal</dd>
        <dt>${mod}+Shift+L</dt><dd>Bulleted list</dd>
        <dt>Alt+Q</dt><dd>Search for a command by its name</dd>
        <dt>Shift+F10, right click</dt><dd>The menu of what applies here, with a marked word's spelling suggestions; a second right click gives the browser's</dd>
        <dt>${mod}+F1</dt><dd>Fold the ribbon to its tabs, and back</dd>
        <dt>$ or ${mod}+M</dt><dd>New inline math</dd>
        <dt>Alt+= (Mac: Control+=)</dt><dd>New equation: numbered on an empty line, in the line in text. (${mod}+Shift+E is Track Changes, as in Word)</dd>
        <dt>${mod}+Shift+E</dt><dd>Track Changes on and off</dd>
        <dt>F7, ${mod}+Shift+G</dt><dd>Spelling; Word Count</dd>
        <dt>${mod}+Alt+Space</dt><dd>Read Aloud from the cursor, and stop</dd>
        <dt>\\ or ${mod}+K</dt><dd>Insert a command</dd>
        <dt>Click math, a citation or a reference</dt><dd>Edit it in place</dd>
        <dt>Alt+click</dt><dd>Show that spot in the source</dd>
        <dt>Tab, ${mod}+Enter</dt><dd>Next cell (from the last, a new row), new row in tables</dd>
        <dt>${mod}+Enter</dt><dd>A page break (\\newpage) outside a table; in a table's cell it still adds a row. ${mod}+Shift+Enter: a column break</dd>
        <dt>Double click a page's top or bottom margin</dt><dd>Type its header or footer (fancyhdr); \\thepage is the page's number</dd>
        <dt>Tab, Shift+Tab in a list</dt><dd>The item one level down, under the item before it, or one up. Typing "- ", "1. " or "a) " at a paragraph's start makes it a list (Undo gives back what you typed)</dd>
        <dt>${mod}+Z, ${mod}+Shift+Z</dt><dd>Undo, redo</dd>
        <dt>${mod}+Alt+M</dt><dd>Comment on the selected words. A comment is a LaTeX comment line in the source, so Overleaf, Git and TeX keep it and print nothing</dd>
        <dt>Paste</dt><dd>From Word, Google Docs or the web: bold, italics, lists, links, tables and equations become LaTeX. ${mod}+Shift+V pastes plain text</dd>
        <dt>Copy</dt><dd>Keeps formatting; equations paste into Word as equations</dd>
        <dt>${mod}+Shift+O</dt><dd>Outline, problems (undefined references, missing citations, unclosed environments) and changes</dd>
        <dt>${mod}+F, ${mod}+H, ${mod}+G</dt><dd>On the page: Find (in the Navigation pane), Replace, Go To. What is found is the text the page shows, never a command or math; elsewhere ${mod}+F is the browser's own find</dd>
        <dt>Alt+Shift+arrows, ${mod}+Alt+O</dt><dd>Promote or demote a heading with those under it; move a paragraph, an item, or a heading's whole section up or down; the Outline view</dd>
        <dt>Esc, then Tab</dt><dd>Leave the page or the source pane, where Tab indents</dd>
        <dt>${mod}+P</dt><dd>Print: the PDF as TeX makes it, shown beside the page, then the browser's print dialog</dd>
        <dt>Preview</dt><dd>Compiles with TeX Live 2026, running in this browser, and shows the exact PDF: pdfLaTeX, XeLaTeX or LuaLaTeX (Auto reads a <code>% !TeX program</code> line or the preamble). Shell escape runs Ghostscript, gnuplot, Pygments for minted and makeindex here too. It recompiles after each edit; TeX's errors appear under Problems with their line; click the PDF to find that text, click the page to find it in the PDF</dd>
      </dl>
      <p><b>Review</b> lists the comments, then every edit since you opened the project, or since any saved version, with Accept and Reject; tick Show changes on the pages to see them marked like Word's Track Changes. Versions are kept every few minutes, when you leave, when you save the .zip, and under any name you give.</p>
      <p><b>Share</b> copies a link that opens this document for anyone, ready to type in, with no account: the document travels inside the link and is not uploaded. Coauthors type and comment on the page and send a link back; their edits arrive here as changes to accept or reject. Share also opens the project in Overleaf, and Download LaTeX gives a plain .tex (or a .zip with several files), so leaving takes one click. From Overleaf: Menu, Download, Source, and drop the .zip on the page. With Overleaf's Git integration, paste the project's address under Git, Clone, and push and pull keep both in step.</p>
      <p><b>Git</b> makes the project a real repository in this browser: commit, history, compare or restore any commit, branches, push and pull. Download LaTeX then gives a .zip with the .git folder in it, so the download is a clone; opening a .zip or folder that has one brings its history in.</p>
      <p><b>Equations</b> work like Word's equation editor, with every name from Word's Math AutoCorrect list. While one is open, the Equation tab has Word's symbols and structures (fraction, script, radical, integral, large operator, bracket, function, accent, limit and log, operator, matrix), the equation gallery, Numbered and Display; each puts LaTeX in at the field's caret. A right click on an equation changes it to inline or display, numbered or not, copies it as LaTeX or for Word, or labels it.</p>
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
    if (window.innerWidth >= 1000) this.dockHelp();
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
    // TeX is WebAssembly, which the hosted page's policy lets run through 'wasm-unsafe-eval':
    // Safari 15 and older do not know it and refuse every module. Asked of the page only when TeX
    // failed, so no other browser meets the refusal it would report.
    if (wasmRefused()) return 'This browser does not let the page run WebAssembly, which TeX is made of: Safari 15 and older lack the permission the page gives it. The editor works here; Safari 16 or later, Chrome, Edge or Firefox make the PDF. ';
    // a 404 is a page built without its TeX tree: the worker's words name the build step.
    // "Failed to fetch", a dropped connection, or that same sentence with no HTTP status is
    // what a visitor's browser says. They get plain words and the button that tries again.
    const httpMissing = /\(HTTP 4\d\d\)/.test(m);
    const fetchFailed = /Failed to fetch|NetworkError|Load failed/i.test(m);
    if (!httpMissing && (fetchFailed || /^The TeX tree is not next to this page/.test(m))) return off ? '' : 'The TeX engine could not be downloaded. Check your connection, then press Try again. ';
    return m && !(off && need) ? m + '. ' : '';
  }

  // the PDF pane while TeX has not made a page yet: the same sentence the status line shows,
  // in the pane, so a long download is not an empty grey panel
  pdfWait(line) {
    if (this.lastPdf) return;
    const host = $('#pdf-host');
    if (!host) return;
    let d = host.querySelector('.pdf-wait');
    if (!d) {
      host.replaceChildren();
      d = document.createElement('div'); d.className = 'pdf-empty pdf-wait';
      const b = document.createElement('b'); b.textContent = 'Making the PDF.';
      const s = document.createElement('span');
      d.append(b, document.createTextNode(' '), s);
      host.appendChild(d);
    }
    const s = d.querySelector('span');
    if (s) s.textContent = line || 'TeX is getting ready.';
  }

  // fades on the status line where its contents run past the window
  statusEdges() {
    const st = $('#status');
    if (!st) return;
    const cut = st.scrollWidth - st.clientWidth > 2;
    st.classList.toggle('st-fade-l', cut && st.scrollLeft > 2);
    st.classList.toggle('st-fade-r', cut && st.scrollLeft + st.clientWidth < st.scrollWidth - 2);
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
// names stay from version to version (commands and run came in 0.26.0; tools, callTool,
// getDocument, select, runCommand, editSource, insertGraph and undo with the agent tools, task
// 71, the others before); the rest of window.rikuy is the app itself and changes without notice.
// The agent tools (src/agent.js) are the same as WebMCP's: callTool(name, input) runs one as the
// browser's agent would, asking the person where the tool asks; the named methods are the same
// tools, throwing an Error with the tool's words where it returns one. Nothing here does more than a person at the keyboard can: a new
// source goes through the edit path typing takes (one undo takes it back), a compile is the
// one Download PDF runs, and a copy someone shared is read here but not changed.
function agentApi(app) {
  // (what the source pane and the typing queue hold, written first: an agent reads it all)
  const flush = () => { app.typeFlush(); if (app.srcRebuild.pending()) app.srcRebuild.flush(); };
  const mine = (what) => {
    if (document.body.classList.contains('guest')) throw new Error('rikuy.api.' + what + '() changes the document, and this one is open in guest view (a copy someone shared): a script can read it, not change it. getSource(), getFiles(), needs() and compile() work here.');
  };
  let tools = null;
  const T = () => tools || (tools = agentTools(app));
  const call = async (name, input) => { const r = await callAgentTool(app, T(), name, input); if (r && r.error) throw new Error(r.error); return r; };
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
      // (a caret on the page moves with the edit, as with any edit made around it: left where the
      // old page had it, the page drawn again would put it at another place, and a command run
      // later with no caret would act there)
      // (one whose words the edit took away is gone: no caret then, and the document's end stands
      // for it, src/ribbon.js)
      const ed = { s: d.s, e: d.s + d.del.length, t: d.ins }, c = app.caretNow();
      const gone = c && !c.ghost && c.f === app.main && ((ed.s < c.a && ed.e > c.a) || (ed.s < c.b && ed.e > c.b));
      const caret = c && !c.ghost && c.f === app.main && !gone ? (c.collapsed ? { f: c.f, p: mapPos([ed], c.p, 1), bias: 1 } : { f: c.f, p: mapPos([ed], c.a, 1), selA: mapPos([ed], c.a, 1), selB: mapPos([ed], c.b, -1) }) : null;
      if (gone) { getSelection().removeAllRanges(); app.rbLast = null; }
      app.closeGroup();
      app.commit([{ f: app.main, ...ed }], caret, 'api');
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
      return commands().filter((c) => c.run && c.searchable !== false).map((c) => describeCommand(app, c, at));
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
    },
    // ---- the agent tools (src/agent.js), as WebMCP has them
    tools: Object.freeze(TOOLS.map((t) => Object.freeze({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations, method: t.api }))),
    // one tool by its name: its result, or { error } in plain words (never throws)
    callTool(name, input) { return callAgentTool(app, T(), name, input); },
    // the document as data: sections, formulas, figures, graphs, citations, labels, problems...
    getDocument(include) { return call('get_document', Array.isArray(include) ? { include } : include && typeof include === 'object' ? include : {}); },
    // the caret (start) or a selection (start to end) at a place of a file's source
    select(file, start, end) { return call('select', { file, start, end }); },
    // a command, as run() does, saying what it changed: { ran, changed, undoSteps, selection }
    runCommand(id, args) { return call('run_command', { id, args }); },
    // { file, start, end, text, expected } or { at: 'selection', text }: one edit, said as changed
    editSource(edit) { return call('edit_source', edit); },
    // an interactive graph after the caret's paragraph
    insertGraph(spec, caption) { return call('insert_graph', { spec, caption }); },
    // the agent's own last edit back: a number of steps, or the step an edit returned
    undo(steps) { return call('undo', typeof steps === 'string' ? { step: steps } : steps && typeof steps === 'object' ? steps : steps ? { steps } : {}); }
  });
}

// (joined so that no module takes a name another or the app has: joinMethods throws, naming both)
joinMethods(App.prototype, { 'src/collab.js': collab, 'src/word.js': word, 'src/ribbon.js': ribbon, 'src/nav.js': nav, 'src/review.js': review, 'src/ribbon/tabs.js': tabs,
  'src/ui/gallery.js': galleryMethods, 'src/ui/search.js': searchMethods, 'src/ui/menu.js': menuMethods, 'src/ui/helppane.js': helpPaneMethods, 'src/cmd/*.js': cmdMethods });
// one item of the insert list, where the caret is: what the ribbon's Insert buttons press
App.prototype.insertFromPalette = function (k) {
  const c = this.caretNow(), x = paletteItems().find((y) => y.k === k);
  if (c && x) this.runPalette(x, c.ghost ? null : { f: c.f, a: c.a, b: c.b }, c.ghost ? this.ghost : null);
};
// Every page is drawn, so Chromium's accessibility tree, which leaves out what it does not draw
// (content-visibility: auto), has the whole document for screen readers and agents: on
// dev/bench/long 11 of 11 formulas and 43 of 43 headings, against 0 and 2 when only the pages
// near the view were drawn, for 130 ms more on its first render and 1 to 2 ms of layout and style
// a key. A document so big that drawing it whole could take the tab down (500 formulas of 120
// terms each, 1.3 million elements, crashed Chromium's renderer) has only the pages near the view
// drawn, as before (#pages.lazy). The items' elements are counted at most every two seconds while
// their number stays the same: one walk in the browser, under a millisecond for a long paper. The
// class comes on before the layout and goes only after it: the old pages of a big document are
// still there while the new ones are measured, and drawing them all then took the tab down too.
const LAZY = 250000;
App.prototype.lazyPages = function (items) {
  const now = performance.now();
  if (this.lazyAt != null && items.length === this.lazyItems && now - this.lazyAt < 2000) return this.lazyBig;
  this.lazyAt = now; this.lazyItems = items.length;
  let n = 0;
  for (const it of items) if (it.el) { n += it.el.getElementsByTagName('*').length; if (n > LAZY) break; }
  this.lazyBig = n > LAZY;
  if (this.lazyBig) this.root.classList.add('lazy');
  return this.lazyBig;
};
// a link opened from a command (Help's) as one in a document is: web and mail addresses only
// (an agent's tool never opens one: src/agent.js PERSON, and this for what that list misses)
App.prototype.openLink = function (u) { if (this.agentDepth) { this.toast('An AI agent asked to open a link; only you open links.'); return false; } return openLink(u); };
App.prototype.textSigNow = function () { return textSig(this.main, [...this.files.entries()]); };
// what the PDF was made from: the text and the engine chosen, so a PDF from another engine is not
// taken as this one's (rikuy.api.compile and Download PDF right after the engine was changed)
App.prototype.pdfSigNow = function (li) { return this.textSigNow() + '|' + this.engineChoice() + '|' + this.shellMode(li); };
// how shell escape runs for the open project: restricted (a stranger's, not allowed), on or off;
// part of what a PDF was made from, as the engine is: after Allow, or Shell escape ticked, with
// the preview closed, api.compile, Download PDF and Print gave the restricted PDF as this one's
App.prototype.shellMode = function (li = this.linkCache && this.linkCache.get(this.name + '|' + this.main)) { return li && !li.allowed ? 'restricted' : this.prefs.shellEscape !== false ? 'shell' : 'no shell'; };
// the Word worker's files, asked for as the page asks for its other files (src/word.js)
App.prototype.assetUrl = asset;

// The native core (src/native.js), a file beside the page (build.mjs: its name and SHA-256 are in
// the bundle). It is fetched once the page is in use, when the browser is idle: the first visit
// on a slow phone line waits for none of its bytes, and the document's first build is
// JavaScript's (the core gains little there). The bytes must have the hash the bundle names. If
// it cannot run (an old browser, a policy without WebAssembly, no network), the editor stays
// JavaScript, as it was before the core.
let coreLoading = null;
function loadCoreLater() {
  if (coreLoading) return coreLoading;
  coreLoading = new Promise((done) => {
    const go = async () => {
      try {
        // (no SubtleCrypto, as on a page over plain http: no check, so no core; and a host that
        // compiles no WebAssembly, which also forbids requests: nothing is asked for, so its
        // console stays clean. JavaScript is exact.)
        if (!(window.crypto && crypto.subtle) || !coreCanRun()) return done(false);
        const C = __RIKUY_CORE__;
        const r = await fetch(asset(C.file), { credentials: 'same-origin' });
        if (!r.ok) return done(false);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
        if (h !== C.sha256) return done(false);
        done(await loadCore(bytes));
      } catch (e) { done(false); }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
  });
  return coreLoading;
}

const app = new App();
// (for the tests and a look in the console: whether the core runs, what it has parsed, and
// whether its tree of a text is JavaScript's)
app.core = {
  ready: coreReady, stats: coreStats, load: loadCoreLater,
  same: (t) => { const u = scanUserSigs(t, {}), c = nativeParse(t, u, true); return !!c && JSON.stringify(c) === JSON.stringify(parseJS(t, u)); },
  // off and on again, for a comparison in the page (dev/bench_native_page.py)
  use: (on) => { setNativeParse(on && coreReady() ? nativeParse : null); }
};
// the incremental model build (src/model.js): on, and how many builds took it, for the tests and
// dev/bench_native_page.py --toggle incr
app.incr = INCR;
Object.defineProperty(app, 'api', { value: agentApi(app), enumerable: true });
window.rikuy = app;
installCollab(app);
installWord(app);
installRibbon(app);
// (Alt and a dialog's letter, before the keys of the commands: src/ui/kit.js)
kit.installAccessKeys();
installKeys(app, isMac, (id, at) => app.runCommand(id, null, at));
installSearch(app);
installMenu(app);
installFileView(app);
installDock(app);
// motion (src/motion.js), Word's animated caret (src/caret.js), and the tools an AI agent in this
// browser may use where the browser offers them (src/webmcp.js, WebMCP)
installMotion(app);
app.caret = installCaret(app);
app.ready.then(() => installWebMcp(app), () => {});
app.isBalanced = isBalanced;
// for tests and the batches' own checks: the registry and the parts controls are made of
app.cmds = { command, commands, describe, enabled, register, unregister, run: (id, args) => runCmd(app, id, args) };
app.kit = kit;
app.init().catch((e) => { console.error(e); app.readyFail(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Rikuy could not start: ' + e.message; });
