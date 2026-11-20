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

// the commands whose argument names labels (cleveref's take several, comma separated)
const REFS = /\\(ref|eqref|pageref|autoref|nameref|vref|cref|Cref|cpageref|Cpageref|crefrange|Crefrange|labelcref|namecref|nameCref|hyperref)\*?\s*(\[[^\]]{0,200}\])?\{([^{}]{0,400})\}/g;
// A label renamed: its \label and every reference to it, in every file: [{ f, s, e, t }], or
// { error } where the new name is taken or no name
export function renameLabel(files, from, to) {
  to = String(to || '').trim();
  if (!to || /[{}\\%#,\s]/.test(to)) return { error: 'A name of letters, digits and : - _ . (no spaces, commas or braces).' };
  if (to === from) return [];
  const edits = [];
  for (const [f, src] of files) {
    if (typeof src !== 'string' || !/\.tex$/i.test(f)) continue;
    const lab = /\\label\s*\{([^{}]{0,200})\}/g;
    let m;
    while ((m = lab.exec(src))) {
      if (m[1] === to) return { error: 'The name ' + to + ' is taken already (' + f + ').' };
      if (m[1] === from) { const s = m.index + m[0].indexOf('{') + 1; edits.push({ f, s, e: s + from.length, t: to }); }
    }
    REFS.lastIndex = 0;
    while ((m = REFS.exec(src))) {
      const s0 = m.index + m[0].lastIndexOf('{') + 1;
      let k = s0;
      for (const part of m[3].split(',')) {
        const lead = part.length - part.trimStart().length, key = part.trim();
        if (key === from) edits.push({ f, s: k + lead, e: k + lead + key.length, t: to });
        k += part.length + 1;
      }
    }
  }
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
