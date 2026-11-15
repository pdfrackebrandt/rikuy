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

export function wordStats(app, notes, sel) {
  const out = { pages: app.layout ? app.layout.pages.length : 0 };
  const s = sel ? getSelection() : null;
  if (s && s.rangeCount && !s.isCollapsed && app.root.contains(s.anchorNode)) {
    const r = s.getRangeAt(0), t = String(s);
    out.sel = true;
    out.words = count(t);
    out.chars = t.replace(/[\n\r]/g, '').length;
    out.charsNoSpace = t.replace(/\s/g, '').length;
    out.paras = [...app.root.querySelectorAll('.it')].filter((el) => r.intersectsNode(el) && /\S/.test(el.textContent)).length;
    out.lines = linesOf(r);
    return out;
  }
  const runs = proseRuns(app.model, { code: true, notes });
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
  cb.addEventListener('change', () => { app.prefs.countNotes = cb.checked; app.savePrefs(); fill(); });
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
// {edits, why}
export function setLanguageEdits(app, d, c) {
  const f = app.main, src = app.src(f);
  const b = /\\begin\s*\{document\}/.exec(src);
  if (!b) return { edits: [], why: 'The main file has no \\begin{document}.' };
  const pre = strip(src.slice(0, b.index));
  const poly = /\\set(?:default|main)language\s*(\[[^\]]{0,300}\])?\s*\{\s*[A-Za-z-]{1,30}\s*\}/.exec(pre);
  const ml = mainLanguage(src);
  const cur = dictOf(ml.name, ml.variant) || 'en_US';
  if (!c) {
    if (cur === d && (ml.name || d === 'en_US')) return { edits: [], why: 'The document is in ' + DICT_NAME[d] + ' already.' };
    if (poly) {
      const [name, v] = POLY[d];
      return { edits: [{ f, s: poly.index, e: poly.index + poly[0].length, t: poly[0].replace(/\\set(default|main)language[\s\S]*$/, (m, k) => '\\set' + k + 'language' + (v ? '[' + v + ']' : '') + '{' + name + '}') }] };
    }
    const L = babelLine(pre);
    const name = BABEL[d];
    if (L && L.shared) return { edits: [], why: 'babel is loaded with other packages on one line: set its language in the source.' };
    if (L) {
      const o = optList(L.opts);
      const mi = o.findIndex((x) => /^main\s*=/.test(x));
      if (mi >= 0) o[mi] = 'main=' + name;
      else {
        // the document's language: replaced where it is, unless the text still uses it
        // (\foreignlanguage{english}, otherlanguage): then the new one goes after it
        const k = o.indexOf(name);
        if (k >= 0) o.splice(k, 1);
        let last = -1;
        for (let i = 0; i < o.length; i++) if (dictOf(o[i]) !== null && !o[i].includes('=')) last = i;
        const used = last >= 0 && new RegExp('\\\\(?:foreignlanguage|selectlanguage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{\\s*' + o[last] + '\\s*\\}|\\{otherlanguage\\*?\\}\\s*\\{\\s*' + o[last] + '\\s*\\}').test(src.slice(b.index));
        if (last >= 0 && !used) o.splice(last, 1, name); else o.push(name);
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
  let depth = 0, ok = !/\n[ \t]*\n|\\(begin|end)\b|(^|[^\\])%/.test(piece);
  for (let i = 0; ok && i < piece.length; i++) {
    if (piece[i] === '\\') { i++; continue; }
    if (piece[i] === '{') depth++;
    else if (piece[i] === '}' && --depth < 0) ok = false;
  }
  if (!ok || depth) return { edits: [], why: 'Select words within one paragraph, not across formatting: the language goes around them as \\foreignlanguage.' };
  // the selection is a \foreignlanguage's words already (hand written or not): its language
  // changes, or with the document's own language the wrapper goes
  const pre2 = t.slice(Math.max(0, a - 80), a);
  const wrap = /\\foreignlanguage\s*(?:\[[^\]]{0,80}\])?\s*\{\s*([A-Za-z-]{1,30})\s*\}\s*\{$/.exec(pre2);
  if (wrap && t[z] === '}') {
    const ws = a - wrap[0].length;
    if (d === cur) return { edits: [{ f: c.f, s: ws, e: a, t: '' }, { f: c.f, s: z, e: z + 1, t: '' }] };
    const k = ws + wrap[0].indexOf('{') + 1 + wrap[0].slice(wrap[0].indexOf('{') + 1).search(/\S/);
    if (dictOf(wrap[1]) === d) return { edits: [], why: 'Those words are in ' + DICT_NAME[d] + ' already.' };
    const inner = optList(wrap[1]).length ? wrap[1] : '';
    const r = setLanguageEdits(app, d, { f: c.f, a: z, b: z, collapsed: false, onlyLoad: true });
    return { edits: [...(r.load || []), { f: c.f, s: k, e: k + inner.length, t: poly ? POLY[d][0] : BABEL[d] }] };
  }
  if (d === cur) return { edits: [], why: 'The document is in ' + DICT_NAME[d] + ': its words need no \\foreignlanguage.' };
  const edits = [];
  let lang;
  if (poly) {
    const [name, v] = POLY[d];
    lang = name;
    const other = new RegExp('\\\\setotherlanguages?\\s*(\\[[^\\]]{0,300}\\])?\\s*\\{[^}]*\\b' + name + '\\b');
    if (!other.test(pre) && !new RegExp('\\{\\s*' + name + '\\s*\\}').test(poly[0])) {
      let e = poly.index + poly[0].length;
      edits.push({ f, s: e, e, t: '\n\\setotherlanguage' + (v ? '[' + v + ']' : '') + '{' + name + '}' });
    }
  } else {
    lang = BABEL[d];
    const L = babelLine(pre);
    if (L && L.shared) return { edits: [], why: 'babel is loaded with other packages on one line: add the language in the source.' };
    const cls = /\\documentclass\s*(?:\[([^\]]{0,2000})\])?/.exec(pre);
    const known = [...optList(cls && cls[1]), ...optList(L && L.opts)];
    if (!known.includes(lang)) {
      // (before the others: babel's last language is the document's)
      if (L && L.os >= 0) edits.push({ f, s: L.os, e: L.os, t: lang + ',' });
      else if (L) edits.push({ f, s: L.at, e: L.at, t: '[' + lang + ',' + (BABEL[cur] || 'english') + ']' });
      else edits.push(...app.packageEdits({ babel: lang + ',' + (BABEL[cur] || 'english') }));
    }
  }
  if (c.onlyLoad) return { edits: [], load: edits };
  edits.push({ f: c.f, s: a, e: a, t: '\\foreignlanguage{' + lang + '}{' }, { f: c.f, s: z, e: z, t: '}' });
  return { edits };
}
