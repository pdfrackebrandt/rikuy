// The Selection Pane's list (Word's Layout › Selection Pane): every figure, table, picture,
// drawing, chart, SmartArt and display equation of the document, in the order of its files, each
// with its caption and its \label (Word's object name: the name a cross reference uses); and a
// label renamed with every reference to it, in every file. Pure, on the parser's tree and strings
// (test/objlist.test.mjs).

import { parse } from './parser.js';

const FLOATS = { figure: 'figure', 'figure*': 'figure', table: 'table', 'table*': 'table', wrapfigure: 'figure', wraptable: 'table', sidewaysfigure: 'figure', sidewaystable: 'table', SCfigure: 'figure' };
const MATHS = new Set(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*']);
const TABULARS = new Set(['tabular', 'tabular*', 'tabularx', 'longtable', 'tabulary', 'array']);
export const KIND_NAMES = { figure: 'Figure', table: 'Table', picture: 'Picture', drawing: 'Drawing', chart: 'Chart', smartart: 'SmartArt', equation: 'Equation' };

// a caption's words as they print, near enough: commands' names gone, their arguments kept
export function plainText(t) {
  return String(t || '').replace(/\\(label|ref|cite[a-z]*|footnote)\s*\{[^{}]*\}/g, '').replace(/\\[a-zA-Z@]+\*?\s*(\[[^\]]*\])?/g, '').replace(/[{}$~]/g, (c) => (c === '~' ? ' ' : '')).replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 120);
}
const argOf = (src, a) => (a ? src.slice(a.is, a.ie) : '');
// \label{…} in a stretch of text: { key, s, e } (s, e: the key's own characters)
function labelIn(src, s, e) {
  const re = /\\label\s*\{([^{}]{0,200})\}/g;
  re.lastIndex = s;
  const m = re.exec(src);
  if (!m || m.index >= e) return null;
  const ks = m.index + m[0].indexOf('{') + 1;
  return { key: m[1], s: ks, e: ks + m[1].length };
}

// [{ kind, f, s, e, caption, label: { key, s, e } | null, inside: whether it is in a figure or a
// table listed already, n: its number among its kind, name: its caption or "Picture 2" }]
export function objectList(files, order) {
  const out = [];
  const count = {};
  for (const f of order || [...files.keys()]) {
    const src = files.get(f);
    if (typeof src !== 'string' || !/\.tex$/i.test(f)) continue;
    const begin = src.indexOf('\\begin{document}');
    let nodes;
    try { nodes = parse(src); } catch (e) { continue; }
    // (a \label in a comment is none: the labels read as the renaming reads them)
    const labs = scanRefs(src).labels;
    const labelIn = (src2, a, z) => { const l = labs.find((x) => x.s > a && x.e < z); return l ? { key: l.key, s: l.s, e: l.e } : null; };
    const add = (kind, n, caption, label, inside) => out.push({ kind, f, s: n.s, e: n.e, caption, label, inside });
    const walk = (list, inFloat, depth) => {
      if (depth > 60) return;
      for (const n of list) {
        if (n.e <= begin && f === (order && order[0])) continue;
        if (n.t === 'env') {
          if (FLOATS[n.name]) {
            const cap = findCmd(n.nodes || [], 'caption');
            const label = labelIn(src, n.s, n.e);
            add(FLOATS[n.name], n, cap ? plainText(argOf(src, cap.args.filter((a) => a && !a.o).pop())) : '', label, false);
            walk(n.nodes || [], true, depth + 1);
            continue;
          }
          if (MATHS.has(n.name)) { add('equation', n, '', labelIn(src, n.s, n.e), inFloat); continue; }
          if (n.name === 'tikzpicture') { add(/\\begin\{axis\}/.test(src.slice(n.s, n.e)) ? 'chart' : 'drawing', n, '', null, inFloat); continue; }
          if (TABULARS.has(n.name) && !inFloat) { add('table', n, '', null, false); continue; }
          if (n.nodes) walk(n.nodes, inFloat, depth + 1);
          continue;
        }
        if (n.t === 'math' && /^(\\\[|\$\$)/.test(src.slice(n.s, n.s + 2))) { add('equation', n, '', null, inFloat); continue; }
        if (n.t === 'cmd') {
          if (n.name === 'includegraphics') { add('picture', n, '', null, inFloat); continue; }
          if (n.name === 'smartdiagram') { add('smartart', n, '', null, inFloat); continue; }
          for (const a of n.args || []) if (a && a.nodes) walk(a.nodes, inFloat, depth + 1);
          continue;
        }
        if (n.nodes) walk(n.nodes, inFloat, depth + 1);
      }
    };
    walk(nodes, false, 0);
  }
  for (const x of out) {
    x.n = count[x.kind] = (count[x.kind] || 0) + 1;
    x.name = x.caption || KIND_NAMES[x.kind] + ' ' + x.n;
  }
  return out;
}
function findCmd(list, name, depth = 0) {
  for (const n of list) {
    if (n.t === 'cmd' && n.name === name) return n;
    if (depth < 20) {
      const kids = n.t === 'cmd' ? (n.args || []).flatMap((a) => (a && a.nodes) || []) : n.nodes || [];
      const r = findCmd(kids, name, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

// the commands whose arguments name labels (cleveref's take several, comma separated; the range
// commands two; hyperref's \hyperref its optional argument; subcaption's \subref; fancyref's)
const REF_CMDS = new Set(['ref', 'eqref', 'pageref', 'autoref', 'autopageref', 'nameref', 'vref', 'Vref', 'vpageref', 'cref', 'Cref', 'cpageref', 'Cpageref', 'crefrange', 'Crefrange',
  'cpagerefrange', 'Cpagerefrange', 'labelcref', 'namecref', 'nameCref', 'namecrefs', 'nameCrefs', 'lcnamecref', 'lcnamecrefs', 'subref', 'fref', 'Fref', 'hyperref', 'zref', 'zcref', 'zpageref']);
// (raw environments whose text is no LaTeX: nothing in them is a label or a reference)
const VERBATIM = /^(verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|spverbatim|lstlisting|minted|comment|filecontents\*?)$/;
// (listings' label= in its options: a name taken, and renamed with the others)
const KV_LABEL = /(^|,)\s*label\s*=\s*(\{([^{}]{1,200})\}|([^,\]{}\s][^,\]{}]{0,199}))/;
const blank = (t) => t.replace(/(^|[^\\])%[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
// The project's text files: .tex and its kin, and every file a \input, \include, \subfile or \import
// names, whatever its name ends in (\input{plot.tikz}): [[f, src]]
export function textFiles(files) {
  const named = new Set();
  for (const [f, src] of files) {
    if (typeof src !== 'string' || !/\.(tex|ltx)$/i.test(f)) continue;
    const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : '';
    const re = /\\(input|include|subfile|import|subimport|includefrom|subincludefrom)\s*(\{([^{}]{0,200})\})?\s*\{([^{}]{1,200})\}/g;
    let m;
    const t = blank(src);
    while ((m = re.exec(t))) {
      const name = (m[3] ? m[3].replace(/\/?$/, '/') : '') + m[4].trim();
      for (const c of [name, dir + name]) { if (files.has(c)) named.add(c); if (files.has(c + '.tex')) named.add(c + '.tex'); }
    }
  }
  return [...files].filter(([f, src]) => typeof src === 'string' && (/\.(tex|ltx|tikz|pgf|tkz|sty|cls)$/i.test(f) || named.has(f)));
}
// The document's own commands that hand an argument to \ref or its kin
// (\newcommand{\figref}[1]{Figure~\ref{#1}}): Map name -> { keys: the arguments that are keys, as
// numbers among the mandatory ones from 0, opt: whether its first argument is optional }
export function refMacros(texts) {
  const M = new Map();
  for (const [, src] of texts) {
    const t = blank(src);
    const re = /\\(?:(?:re|provide)?newcommand\*?|DeclareRobustCommand\*?)\s*\{?\s*\\([a-zA-Z@]+)\s*\}?\s*(?:\[(\d)\])?\s*(\[[^\]]{0,80}\])?\s*\{|\\[gex]?def\s*\\([a-zA-Z@]+)((?:#\d){1,9})\s*\{/g;
    let m;
    while ((m = re.exec(t))) {
      // (its body, by its braces)
      let d = 1, i = m.index + m[0].length;
      const b0 = i;
      while (i < t.length && d && i - b0 < 4000) { if (t[i] === '\\') { i += 2; continue; } if (t[i] === '{') d++; else if (t[i] === '}') d--; i++; }
      const body = t.slice(b0, i - 1);
      const name = m[1] || m[4], opt = !!m[3];
      const keys = new Set();
      const rr = /\\([a-zA-Z]+)\*?\s*(\[[^\]{}]{0,200}\])?\{([^{}]{0,200})\}/g;
      let r;
      while ((r = rr.exec(body))) {
        if (!REF_CMDS.has(r[1])) continue;
        const arg = r[1] === 'hyperref' ? (r[2] || '') : r[3];
        for (const p of arg.matchAll(/#(\d)/g)) { const k = +p[1] - 1 - (opt ? 1 : 0); if (k >= 0) keys.add(k); }
      }
      if (keys.size && !REF_CMDS.has(name) && name !== 'label') M.set(name, { keys: [...keys], opt });
    }
  }
  return M;
}
const MATH_RAW = /^(equation|align|gather|multline|flalign|eqnarray|alignat|split|aligned|gathered)\*?$/;
// Every \label and every reference to one in a file, with where its key is: { labels, refs }, each
// [{ key, s, e }]. Read on the parser's tree: nothing in a comment, nothing in verbatim, listings or
// minted (a listing's label= counts as a label); in a raw environment's text (an equation, a
// tikzpicture's nodes) by its own scan. macros: refMacros' map, the document's own reference commands.
export function scanRefs(src, macros = new Map()) {
  const labels = [], refs = [];
  const keys = (is, ie, into) => {
    const t = src.slice(is, ie);
    let k = is;
    for (const part of t.split(',')) { const lead = part.length - part.trimStart().length, key = part.trim(); if (key) into.push({ key, s: k + lead, e: k + lead + key.length }); k += part.length + 1; }
  };
  const kvLabel = (is, ie) => {
    const m = KV_LABEL.exec(src.slice(is, ie));
    if (!m) return;
    const key = (m[3] || m[4]).trim(), at = is + m.index + m[0].indexOf(m[3] || m[4]) + (m[3] || m[4]).indexOf(key);
    labels.push({ key, s: at, e: at + key.length });
  };
  // (a raw environment's text as the parser keeps it: its own \label and references, comments out)
  const scanRaw = (s, e) => {
    const re = /(^|[^\\])%[^\n]*|\\(label|[a-zA-Z]+)\*?\s*(\[[^\]{}]{0,200}\])?\{([^{}]{0,400})\}/g;
    re.lastIndex = s;
    let m;
    while ((m = re.exec(src)) && m.index < e) {
      if (!m[2]) continue;
      const ks = m.index + m[0].lastIndexOf('{') + 1;
      if (m[2] === 'label') labels.push({ key: m[4], s: ks, e: ks + m[4].length });
      else if (REF_CMDS.has(m[2])) keys(ks, ks + m[4].length, refs);
      else if (macros.has(m[2]) && !macros.get(m[2]).opt && macros.get(m[2]).keys.includes(0)) keys(ks, ks + m[4].length, refs);
      // (the words of a node: read on, inside the braces)
      re.lastIndex = m.index + m[0].indexOf('{', m[0].indexOf(m[2]) + m[2].length) + 1;
    }
  };
  const walk = (list, depth) => {
    if (!list || depth > 80) return;
    for (const n of list) {
      if (n.t === 'comment') continue;
      if (n.t === 'math') { scanRaw(n.s, n.e); continue; }
      if (n.t === 'env' && n.raw) {
        if (!VERBATIM.test(n.name)) scanRaw(n.s, n.e);
        else if (n.name === 'lstlisting') { const h = /^\\begin\s*\{lstlisting\}\s*\[([^\]]{0,400})\]/.exec(src.slice(n.s, n.s + 440)); if (h) kvLabel(n.s + h[0].indexOf('[') + 1, n.s + h[0].length - 1); }
        continue;
      }
      if (n.t === 'cmd') {
        if (n.name === 'label') { const a = (n.args || []).find((x) => x && !x.o); if (a) labels.push({ key: src.slice(a.is, a.ie), s: a.is, e: a.ie }); continue; }
        if (n.name === 'lstinputlisting') { const o = (n.args || []).find((x) => x && x.o); if (o) kvLabel(o.is, o.ie); continue; }
        if (REF_CMDS.has(n.name)) {
          const args = (n.args || []).filter(Boolean);
          // (\hyperref[key]{words}: the optional one names it; the others: every mandatory one)
          const named = n.name === 'hyperref' ? args.filter((x) => x.o) : args.filter((x) => !x.o);
          for (const a of named) keys(a.is, a.ie, refs);
          if (n.name === 'hyperref') for (const a of args.filter((x) => !x.o)) walk(a.nodes, depth + 1);
          continue;
        }
        if (macros.has(n.name)) {
          const D = macros.get(n.name), mand = (n.args || []).filter((x) => x && !x.o);
          for (const k of D.keys) if (mand[k]) keys(mand[k].is, mand[k].ie, refs);
          for (const a of mand.filter((x, i) => !D.keys.includes(i))) if (a.nodes) walk(a.nodes, depth + 1);
          continue;
        }
        for (const a of n.args || []) if (a && a.nodes) walk(a.nodes, depth + 1);
        continue;
      }
      if (n.nodes) walk(n.nodes, depth + 1);
    }
  };
  walk(parse(src), 0);
  return { labels, refs };
}
// A label renamed: its \label and every reference to it, in every text file, through the
// document's own reference commands: [{ f, s, e, t }] with left (how many places still name the
// old key, where Rikuy could not follow: verbatim, a command it cannot read) and leftIn (their
// files); or { error } where the new name is taken or no name
export function renameLabel(files, from, to) {
  to = String(to || '').trim();
  if (!to || /[{}\\%#,\s]/.test(to)) return { error: 'A name of letters, digits and : - _ . (no spaces, commas or braces).' };
  if (to === from) return [];
  const edits = [];
  const T = textFiles(files), M = refMacros(T);
  for (const [f, src] of T) {
    const R = scanRefs(src, M);
    for (const l of R.labels) {
      if (l.key === to) return { error: 'The name ' + to + ' is taken already (' + f + ').' };
      if (l.key === from) edits.push({ f, s: l.s, e: l.e, t: to });
    }
    for (const r of R.refs) if (r.key === from) edits.push({ f, s: r.s, e: r.e, t: to });
  }
  // (the old key where it still stands as a command's key, comments aside)
  let left = 0;
  const leftIn = new Set();
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('([{,\\[=]\\s*)(' + esc + ')(?=\\s*[},\\]])', 'g');
  for (const [f, src] of T) {
    const at = new Set(edits.filter((x) => x.f === f).map((x) => x.s));
    for (const m of blank(src).matchAll(re)) if (!at.has(m.index + m[1].length)) { left++; leftIn.add(f); }
  }
  edits.left = left;
  edits.leftIn = [...leftIn];
  return edits;
}
// Where a name goes in an object that has none: after a float's \caption, at the end of an
// equation's body. { f, at } or null (a picture outside a float has no number to refer to)
export function labelPlace(src, x) {
  const t = src.slice(x.s, x.e);
  if (x.kind === 'figure' || x.kind === 'table') {
    const m = /\\caption\s*(\[[^\]]*\])?\{/.exec(t);
    if (!m) return null;
    let d = 1, i = m.index + m[0].length;
    while (i < t.length && d) { if (t[i] === '{') d++; else if (t[i] === '}') d--; i++; }
    return d ? null : { at: x.s + i };
  }
  if (x.kind === 'equation' && /^\\begin\{(equation|align|gather|multline|flalign)\}/.test(t)) {
    const z = t.lastIndexOf('\\end{');
    return z > 0 ? { at: x.s + z } : null;
  }
  return null;
}
