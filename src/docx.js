// Word files without Word: the zip and a small XML reader. A .docx may come from a stranger, so everything here
// treats it as hostile: sizes are capped before anything is inflated, a part that declares a DTD
// is refused (no entity is ever expanded, so neither XXE nor a billion laughs), nesting is capped,
// and the zip handed on to pandoc is the one rebuilt here from what passed. Used by the Word
// worker (src/wordworker.js) and by the node tests; nothing here needs a DOM.
import { unzipSync, zipSync } from 'fflate';

export const LIMITS = {
  file: 100e6,      // a .docx larger than this is refused unread
  total: 400e6,     // what all its parts may unpack to
  entries: 4000,    // parts in the zip
  xml: 64e6,        // one XML part, unpacked
  depth: 400,       // elements inside elements
  rikuy: 64e6       // Rikuy's own part
};

const dec = new TextDecoder('utf-8', { fatal: false });
const enc = new TextEncoder();

// ---- zip ---------------------------------------------------------------------------------

export function unzip(bytes, lim = LIMITS) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length > lim.file) throw new Error('The file is larger than ' + Math.round(lim.file / 1e6) + ' MB.');
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This is not a Word file (.docx).');
  let total = 0, n = 0;
  let out;
  try {
    out = unzipSync(bytes, {
      // sizes as the zip declares them, before anything is inflated: a bomb is refused here
      filter: (f) => {
        n++;
        total += f.originalSize;
        if (n > lim.entries) throw new Error('The file holds too many parts.');
        if (total > lim.total) throw new Error('The file would unpack to more than ' + Math.round(lim.total / 1e6) + ' MB.');
        return true;
      }
    });
  } catch (e) {
    if (/parts|unpack/.test(e.message)) throw e;
    throw new Error('The file is damaged or not a Word file (' + e.message + ').');
  }
  const m = new Map();
  for (const [k, v] of Object.entries(out)) {
    if (k.endsWith('/')) continue;
    // a name that climbs out (../) or starts at the root means nothing inside a .docx
    const name = k.replace(/\\/g, '/');
    if (name.split('/').some((p) => p === '..') || name.startsWith('/')) continue;
    m.set(name, v);
  }
  if (!m.has('[Content_Types].xml') || !m.has('word/document.xml')) throw new Error('This is not a Word file (.docx): it has no word/document.xml.');
  // A DTD has no business in a Word file: it is how XML parsers are made to read other files
  // (XXE) or to expand a few bytes into gigabytes. Refused in every part, here, before pandoc (whose
  // parser would see them too) or this file's own reader gets the parts.
  for (const [n, b] of m) {
    if (!/\.(xml|rels)$/i.test(n)) continue;
    if (/<!(DOCTYPE|ENTITY)/i.test(text(b))) throw new Error('The file declares a DTD (in ' + n + '), which a Word file never needs; it is refused.');
  }
  return m;
}

// the parts as a zip again: fixed dates, so the same parts make the same bytes
export function zip(parts) {
  const o = {};
  const mtime = new Date(Date.UTC(2000, 0, 1));
  // [Content_Types].xml first, as Word writes it; some readers look there first
  const names = [...parts.keys()].sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0));
  for (const n of names) {
    const v = parts.get(n);
    o[n] = [typeof v === 'string' ? enc.encode(v) : v, { level: /\.(png|jpe?g|gif|zip)$/i.test(n) ? 0 : 6, mtime }];
  }
  return zipSync(o);
}

export function text(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return dec.decode(bytes);
}

// ---- XML -----------------------------------------------------------------------------------

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function unescapeXml(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : '';
    }
    // only the five XML predefines; any other named entity would need a DTD, which is refused
    return ENT[e] ?? '';
  });
}
export const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

// A tree of { n: name, a: {attrs}, c: [children] }, text as strings. Not validating; refuses DTDs.
export function parseXml(src, lim = LIMITS) {
  if (src.length > lim.xml) throw new Error('A part of the file is too large.');
  const root = { n: '#doc', a: {}, c: [] };
  const stack = [root];
  let i = 0;
  const L = src.length;
  while (i < L) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { pushText(stack, src.slice(i)); break; }
    if (lt > i) pushText(stack, src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? L : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      stack[stack.length - 1].c.push(src.slice(lt + 9, e < 0 ? L : e));
      i = e < 0 ? L : e + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt + 2); i = e < 0 ? L : e + 2; continue; }
    if (src.startsWith('<!', lt)) throw new Error('The file declares a DTD, which a Word file never needs; it is refused.');
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt);
      const name = src.slice(lt + 2, e < 0 ? L : e).trim();
      // close up to the matching element; a stray end tag is ignored
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].n === name) { stack.length = k; break; }
      i = e < 0 ? L : e + 1;
      continue;
    }
    // a start tag: name, attributes (quoted values may hold >), maybe />
    let j = lt + 1;
    while (j < L && !/[\s/>]/.test(src[j])) j++;
    const el = { n: src.slice(lt + 1, j), a: {}, c: [] };
    for (;;) {
      while (j < L && /\s/.test(src[j])) j++;
      if (j >= L) break;
      if (src[j] === '>' || (src[j] === '/' && src[j + 1] === '>')) break;
      let k = j;
      while (k < L && !/[\s=/>]/.test(src[k])) k++;
      const an = src.slice(j, k);
      while (k < L && /\s/.test(src[k])) k++;
      if (src[k] !== '=') { j = Math.max(k, j + 1); continue; }
      k++;
      while (k < L && /\s/.test(src[k])) k++;
      const q = src[k];
      if (q !== '"' && q !== "'") { j = k + 1; continue; }
      const e = src.indexOf(q, k + 1);
      if (e < 0) { j = L; break; }
      el.a[an] = unescapeXml(src.slice(k + 1, e));
      j = e + 1;
    }
    const self = src[j] === '/';
    i = self ? j + 2 : j + 1;
    stack[stack.length - 1].c.push(el);
    if (!self) {
      if (stack.length > lim.depth) throw new Error('The file nests its parts too deeply.');
      stack.push(el);
    }
  }
  return root;
}
function pushText(stack, s) {
  const top = stack[stack.length - 1];
  if (top === stack[0] && !s.trim()) return;
  top.c.push(unescapeXml(s));
}

export function serialize(node) {
  if (typeof node === 'string') return escText(node);
  if (node.n === '#doc') return node.c.map(serialize).join('');
  let s = '<' + node.n;
  for (const [k, v] of Object.entries(node.a)) s += ' ' + k + '="' + escAttr(v) + '"';
  if (!node.c.length) return s + '/>';
  return s + '>' + node.c.map(serialize).join('') + '</' + node.n + '>';
}

export const local = (n) => n.slice(n.indexOf(':') + 1);
export const kids = (el, name) => (el ? el.c.filter((x) => typeof x !== 'string' && (name == null || x.n === name)) : []);
export const kid = (el, name) => (el ? el.c.find((x) => typeof x !== 'string' && x.n === name) : null);
export function find(el, name) {
  if (!el || typeof el === 'string') return null;
  if (el.n === name) return el;
  for (const c of el.c) { const r = find(c, name); if (r) return r; }
  return null;
}
export function textContent(el) {
  if (typeof el === 'string') return el;
  return el.c.map(textContent).join('');
}
