// Word Count (Ctrl+Shift+G) and the proofing language's edits (Review › Language).
//
// Word Count counts as Word's dialog does, over what the page shows of the document (the model's
// text: math, commands, labels and keys are no words, as texcount counts): pages, words,
// characters without and with spaces, paragraphs and lines (as the page breaks them), with
// footnotes and captions or without; of the selection where there is one.
//
// The language: a selection's words go into \foreignlanguage{name}{…}, the language put on
// babel's options before the document's own (the last one is the document's) or, with
// polyglossia, as \setotherlanguage; the document's language is babel's last option (or its
// main=), or polyglossia's \setdefaultlanguage, or a new \usepackage[name]{babel}.

import { mk } from './dom.js';
import { proseRuns, mainLanguage, dictOf, DICT_NAME } from '../spell/words.js';

const WORDS = /[\p{L}\p{N}][\p{L}\p{N}\p{M}‌‍'’-]*/gu;
const count = (t) => (t.match(WORDS) || []).length;

function linesOf(range) {
  const tops = new Set();
  for (const q of range.getClientRects()) if (q.width > 1 && q.height > 1) tops.add(Math.round(q.top / 3));
  return tops.size;
}

// The words of the document as Word counts them: every heading, cell, list item and paragraph,
// footnotes and captions as the box says. The status bar shows it beside this dialog's: it counted
// the paragraphs alone, two numbers for one document.
export function docWords(model, notes) {
  let words = 0;
  for (const r of proseRuns(model, { code: true, notes, noMap: true })) words += count(r.text);
  return words;
}
// The words of a selection, counted over the text the page draws inside it by the same rules
// (headings and cells too, the contents' list not, a footnote's and a caption's as the box says)
export function selWords(root, r, notes) {
  const parts = [];
  for (const span of root.querySelectorAll('span.t')) {
    if (!r.intersectsNode(span) || span.classList.contains('ph') || span.closest('.toc') || (!notes && span.closest('[data-ctx="cap"], .fn'))) continue;
    const node = span.firstChild;
    if (!node) continue;
    const a = node === r.startContainer ? r.startOffset : 0, b = node === r.endContainer ? r.endOffset : node.length;
    parts.push(node.data.slice(a, b));
  }
  return count(parts.join(' '));
}

export function wordStats(app, notes, sel) {
  const out = { pages: app.layout ? app.layout.pages.length : 0 };
  const s = sel ? getSelection() : null;
  if (s && s.rangeCount && !s.isCollapsed && app.root.contains(s.anchorNode)) {
    const r = s.getRangeAt(0), t = String(s);
    out.sel = true;
    out.words = selWords(app.root, r, notes);
    out.chars = t.replace(/[\n\r]/g, '').length;
    out.charsNoSpace = t.replace(/\s/g, '').length;
    out.paras = [...app.root.querySelectorAll('.it')].filter((el) => r.intersectsNode(el) && /\S/.test(el.textContent)).length;
    out.lines = linesOf(r);
    return out;
  }
  const runs = proseRuns(app.model, { code: true, notes, noMap: true });
  let words = 0, chars = 0, ns = 0;
  for (const r of runs) { const t = r.text.replace(/\s+/g, ' '); words += count(t); chars += t.length; ns += t.replace(/\s/g, '').length; }
  out.words = words; out.chars = chars; out.charsNoSpace = ns;
  let paras = 0, lines = 0;
  const R = document.createRange();
  for (const el of app.root.querySelectorAll('.it')) {
    if (!/\S/.test(el.textContent) || el.closest('.toc') || (!notes && el.closest('[data-ctx="cap"], .fn'))) continue;
    paras++;
    R.selectNodeContents(el);
    lines += linesOf(R);
  }
  out.paras = paras; out.lines = lines;
  return out;
}

export function openWordCount(app) {
  const hasSel = (() => { const s = getSelection(); return s.rangeCount && !s.isCollapsed && app.root.contains(s.anchorNode); })();
  const p = app.makePop(null, 'pop-dlg rv-count', 'Word Count');
  const tab = mk('table', 'rv-stats');
  const cb = mk('input'); cb.type = 'checkbox'; cb.id = 'rv-count-notes'; cb.checked = app.prefs.countNotes !== false;
  const lab = mk('label', 'rv-chk'); lab.append(cb, ' Include footnotes and captions');
  const fill = () => {
    const S = wordStats(app, cb.checked, hasSel);
    tab.replaceChildren();
    const cap = mk('caption', '', S.sel ? 'Statistics of the selection' : 'Statistics');
    tab.append(cap);
    for (const [k, v] of [['Pages', S.pages], ['Words', S.words], ['Characters (no spaces)', S.charsNoSpace], ['Characters (with spaces)', S.chars], ['Paragraphs', S.paras], ['Lines', S.lines]]) {
      const tr = mk('tr');
      tr.append(mk('th', '', k), mk('td', '', Number(v || 0).toLocaleString('en-US')));
      tab.append(tr);
    }
  };
  // (the status bar's count follows the box, as Word's does)
  cb.addEventListener('change', () => { app.prefs.countNotes = cb.checked; app.savePrefs(); fill(); if (app.wordStatus) app.wordStatus(); });
  const row = mk('div', 'pop-row');
  const close = mk('button', 'btn sm', 'Close'); close.type = 'button';
  close.addEventListener('click', () => app.closePop());
  row.append(mk('span', 'grow'), close);
  fill();
  p.append(tab, lab, row);
  app.rvPlace();
  close.focus();
}

// ---- languages as LaTeX -------------------------------------------------------------------------

const BABEL = { en_US: 'english', en_GB: 'british', de_DE: 'ngerman', es_ES: 'spanish' };
const POLY = { en_US: ['english', ''], en_GB: ['english', 'variant=british'], de_DE: ['german', ''], es_ES: ['spanish', ''] };
const strip = (t) => t.replace(/(^|[^\\])%[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));

// babel's line in the main file's preamble: its range, its options' range (or where they would go)
function babelLine(pre) {
  const re = /\\usepackage\s*(\[([^\]]{0,2000})\])?\s*\{([^}]{0,500})\}/g;
  for (const m of pre.matchAll(re)) {
    const names = m[3].split(',').map((x) => x.trim());
    if (!names.includes('babel')) continue;
    // (babel in a list with others: its options are theirs too; left alone)
    if (names.length > 1) return { shared: true };
    const os = m[1] ? m.index + m[0].indexOf('[') + 1 : -1;
    return { s: m.index, e: m.index + m[0].length, os, oe: m[1] ? os + m[2].length : -1, opts: m[1] ? m[2] : null, at: m.index + '\\usepackage'.length };
  }
  return null;
}
const optList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

// The edits that put a selection, or with c null the document, in dictionary d's language:
// {edits, why}. The document's own language is never changed by a selection's: babel's last
// language stays last (its name as the document has it, a French document stays French), and
// a language the text still switches to anywhere in the project stays loaded.
const LANGISH = /^[a-z]{2,}(?:-[a-z]{2,4})?$/i;
const isLang = (o) => !o.includes('=') && LANGISH.test(o) && dictOf(o) !== undefined && (dictOf(o) !== null || KNOWN_OTHER.test(o));
const KNOWN_OTHER = /^(french|francais|frenchb|italian|portuguese|portuges|brazil|brazilian|dutch|danish|swedish|norsk|nynorsk|norwegian|finnish|polish|czech|slovak|slovene|croatian|serbian|russian|ukrainian|greek|turkish|hungarian|romanian|catalan|galician|basque|irish|welsh|latin|estonian|latvian|lithuanian|icelandic|arabic|hebrew|farsi|persian|hindi|chinese|japanese|korean|thai|vietnamese|indonesian|malay|afrikaans|albanian|bulgarian|macedonian|esperanto|interlingua)$/i;
// whether the project's text (any .tex file's body) still switches to language name (a name not
// made of letters is taken as used: kept). Plain string searches, no pattern built from it.
function usedIn(app, name) {
  if (!/^[A-Za-z-]{1,30}$/.test(name)) return true;
  const arg = new RegExp('^\\s*(?:\\[[^\\]]{0,80}\\])?\\s*\\{\\s*' + name + '\\s*\\}');
  for (const [f, t] of app.files) {
    if (!/\.tex$/i.test(f)) continue;
    const k = t.search(/\\begin\s*\{document\}/);
    const body = f === app.main && k >= 0 ? t.slice(k) : t;
    if (body.includes('\\text' + name) || body.includes('\\begin{' + name + '}')) return true;
    for (const w of ['\\foreignlanguage', '\\selectlanguage', '\\begin{otherlanguage}', '\\begin{otherlanguage*}']) {
      for (let i = body.indexOf(w); i >= 0; i = body.indexOf(w, i + w.length)) if (arg.test(body.slice(i + w.length, i + w.length + 120))) return true;
    }
  }
  return false;
}
// what a selection's words may not hold to be wrapped in one argument: a cell or row's end, an
// item, \verb, fancyvrb's \Verb and \path (illegal in an argument), an environment's edge, a
// paragraph's end, a comment
const UNWRAPPABLE = /(^|[^\\])&|\\\\|\\(?:tabularnewline|cr|crcr|item|verb|Verb|lstinline|mintinline|path|begin|end|par)\b|\n[ \t]*\n|(^|[^\\])%/;
export function setLanguageEdits(app, d, c) {
  const f = app.main, src = app.src(f);
  const b = /\\begin\s*\{document\}/.exec(src);
  if (!b) return { edits: [], why: 'The main file has no \\begin{document}.' };
  const pre = strip(src.slice(0, b.index));
  const poly = /\\set(?:default|main)language\s*(\[[^\]]{0,300}\])?\s*\{\s*([A-Za-z-]{1,30})\s*\}/.exec(pre);
  const ml = mainLanguage(src);
  // (the document's language: its own name; English only where nothing sets one)
  const curName = ml.name || '';
  const cur = curName ? dictOf(curName, ml.variant) : 'en_US';
  if (!c) {
    if (cur === d) return { edits: [], why: 'The document is in ' + DICT_NAME[d] + ' already.' };
    if (poly) {
      const [name, v] = POLY[d];
      const edits = [{ f, s: poly.index, e: poly.index + poly[0].length, t: poly[0].replace(/\\set(default|main)language[\s\S]*$/, (m, k) => '\\set' + k + 'language' + (v ? '[' + v + ']' : '') + '{' + name + '}') }];
      const old = poly[2].toLowerCase();
      if (old !== name && usedIn(app, old) && !new RegExp('\\\\setotherlanguages?\\s*(\\[[^\\]]{0,300}\\])?\\s*\\{[^}]*\\b' + old + '\\b').test(pre)) edits[0].t += '\n\\setotherlanguage{' + old + '}';
      return { edits };
    }
    const L = babelLine(pre);
    const name = BABEL[d];
    if (L && L.shared) return { edits: [], why: 'babel is loaded with other packages on one line: set its language in the source.' };
    if (L) {
      const o = optList(L.opts);
      const mi = o.findIndex((x) => /^main\s*=/.test(x));
      if (mi >= 0) {
        const old = o[mi].replace(/^main\s*=\s*/, '');
        o[mi] = 'main=' + name;
        if (old !== name && usedIn(app, old) && !o.includes(old)) o.unshift(old);
      } else {
        // babel's last language is the document's: replaced, unless the text still uses it
        const k = o.indexOf(name);
        if (k >= 0) o.splice(k, 1);
        let last = -1;
        for (let i = 0; i < o.length; i++) if (isLang(o[i])) last = i;
        if (last >= 0 && !usedIn(app, o[last])) o.splice(last, 1, name); else o.push(name);
      }
      if (L.os >= 0) return { edits: [{ f, s: L.os, e: L.oe, t: o.join(',') }] };
      return { edits: [{ f, s: L.at, e: L.at, t: '[' + o.join(',') + ']' }] };
    }
    return { edits: app.packageEdits({ babel: name }) };
  }
  // a selection: within one paragraph of one file, braces balanced, outside the preamble
  if (c.f == null || (c.collapsed && !c.onlyLoad)) return { edits: [], why: 'Select the words first.' };
  const t = app.src(c.f), a = c.a, z = c.b, piece = t.slice(a, z);
  if (c.f === f && a < b.index) return { edits: [], why: 'Select words of the text.' };
  let depth = 0, ok = !UNWRAPPABLE.test(piece);
  for (let i = 0; ok && i < piece.length; i++) {
    if (piece[i] === '\\') { i++; continue; }
    if (piece[i] === '{') depth++;
    else if (piece[i] === '}' && --depth < 0) ok = false;
  }
  if (!ok || depth) return { edits: [], why: 'Select words within one paragraph or one cell, not across formatting: the language goes around them as \\foreignlanguage.' };
  // the selection is a \foreignlanguage's words already (hand written or not): its language
  // changes, or with the document's own language the wrapper goes
  const pre2 = t.slice(Math.max(0, a - 80), a);
  const wrap = /\\foreignlanguage\s*(?:\[[^\]]{0,80}\])?\s*\{\s*([A-Za-z-]{1,30})\s*\}\s*\{$/.exec(pre2);
  if (wrap && t[z] === '}') {
    const ws = a - wrap[0].length;
    if (d === cur) return { edits: [{ f: c.f, s: ws, e: a, t: '' }, { f: c.f, s: z, e: z + 1, t: '' }] };
    if (dictOf(wrap[1]) === d) return { edits: [], why: 'Those words are in ' + DICT_NAME[d] + ' already.' };
    const r = setLanguageEdits(app, d, { f: c.f, a: z, b: z, collapsed: false, onlyLoad: true });
    // (the language could not be loaded, as with babel on a line with other packages: why not)
    if (r.why || !r.lang) return { edits: [], why: r.why || 'Nothing to change.' };
    return { edits: [...(r.load || []), { f: c.f, s: ws, e: a, t: '\\foreignlanguage' + r.opt + '{' + r.lang + '}{' }] };
  }
  if (d === cur && !c.onlyLoad) return { edits: [], why: 'The document is in ' + DICT_NAME[d] + ': its words need no \\foreignlanguage.' };
  const edits = [];
  let lang, opt = '';
  if (poly) {
    const [name, v] = POLY[d];
    lang = name;
    // (polyglossia's English in its other variant: the variant on the command, as polyglossia reads it)
    if (v && poly[2].toLowerCase() === name) opt = '[' + v + ']';
    const other = new RegExp('\\\\setotherlanguages?\\s*(\\[[^\\]]{0,300}\\])?\\s*\\{[^}]*\\b' + name + '\\b');
    if (!other.test(pre) && poly[2].toLowerCase() !== name) {
      const e = poly.index + poly[0].length;
      edits.push({ f, s: e, e, t: '\n\\setotherlanguage' + (v ? '[' + v + ']' : '') + '{' + name + '}' });
    }
  } else {
    lang = BABEL[d];
    const L = babelLine(pre);
    if (L && L.shared) return { edits: [], why: 'babel is loaded with other packages on one line: add the language in the source.' };
    const cls = /\\documentclass\s*(?:\[([^\]]{0,2000})\])?/.exec(pre);
    const known = [...optList(cls && cls[1]), ...optList(L && L.opts)];
    // the document's language stays babel's last: its own name, or English where nothing set one
    const main = curName || 'english';
    if (!known.includes(lang)) {
      if (L && L.os >= 0) edits.push({ f, s: L.os, e: L.os, t: lang + ',' });
      else if (L) edits.push({ f, s: L.at, e: L.at, t: '[' + lang + ',' + main + ']' });
      else edits.push(...app.packageEdits({ babel: lang + ',' + main }));
    }
  }
  if (c.onlyLoad) return { edits: [], load: edits, lang, opt };
  edits.push({ f: c.f, s: a, e: a, t: '\\foreignlanguage' + opt + '{' + lang + '}{' }, { f: c.f, s: z, e: z, t: '}' });
  return { edits };
}
