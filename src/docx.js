// Word files without Word: the zip, a small XML reader, Rikuy's own part (customXml) and the text
// of each block Rikuy marked with a bookmark. A .docx may come from a stranger, so everything here
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

// Rikuy's part: JSON in the text of one element in this namespace, so Word and LibreOffice keep it
// as an opaque custom XML part (both were seen to: test/word.py, docs/ARCHITECTURE.md)
export const RIKUY_NS = 'urn:rikuy:word:1';
export const ANCHOR = /^Rk\d{1,7}$/;
export const OBJ = '\uFFFC';

const dec = new TextDecoder('utf-8', { fatal: false });
const enc = new TextEncoder();

// ---- zip ---------------------------------------------------------------------------------

export function unzip(bytes, lim = LIMITS) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length > lim.file) throw new Error('The file is larger than ' + Math.round(lim.file / 1e6) + ' MB.');
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error(notDocx(bytes));
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
  if (!m.has('[Content_Types].xml') || !m.has('word/document.xml')) throw new Error(notDocx(bytes, m));
  // A DTD has no business in a Word file: it is how XML parsers are made to read other files
  // (XXE) or to expand a few bytes into gigabytes. Refused in every part, here, before pandoc (whose
  // parser would see them too) or this file's own reader gets the parts.
  for (const [n, b] of m) {
    if (!/\.(xml|rels)$/i.test(n)) continue;
    if (/<!(DOCTYPE|ENTITY)/i.test(text(b))) throw new Error('The file declares a DTD (in ' + n + '), which a Word file never needs; it is refused.');
  }
  return m;
}

// What a file that is not a .docx is, where its first bytes or its parts say: a person who
// renamed a .doc or an .odt needs to hear which program saves it as .docx, not only "no".
function notDocx(bytes, parts) {
  const save = ' Open it in Word or LibreOffice, save it as "Word Document (.docx)", and open that file here.';
  if (!bytes.length) return 'The file is empty.';
  if (parts) {
    const mt = parts.has('mimetype') ? text(parts.get('mimetype')).trim() : '';
    if (/opendocument\.text/.test(mt)) return 'This is an OpenDocument text (.odt), not a Word file (.docx).' + save;
    if (/opendocument/.test(mt)) return 'This is an OpenDocument file, not a Word file (.docx).';
    if (parts.has('ppt/presentation.xml')) return 'This is a PowerPoint file, not a Word file (.docx).';
    if (parts.has('xl/workbook.xml')) return 'This is an Excel file, not a Word file (.docx).';
    if (parts.has('word/document.xml')) return 'This Word file is damaged: it has lost its list of parts ([Content_Types].xml).' + save;
    return 'This is a zip archive, not a Word file (.docx): it has no word/document.xml.';
  }
  const b = bytes;
  if (b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'This is a file in the old Word format (.doc), or one protected by a password, not a .docx.' + save;
  const head = text(b.subarray(0, 64));
  if (/^\s*\{\\rtf/.test(head)) return 'This is a Rich Text file (.rtf), not a Word file (.docx).' + save;
  if (/^%PDF/.test(head)) return 'This is a PDF, not a Word file (.docx).';
  if (/^\s*<(\?xml|html|!doctype|w:wordDocument|\?mso)/i.test(head)) return 'This is a web page or an XML document saved from Word, not a .docx.' + save;
  return 'This is not a Word file (.docx).';
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
// strict: a part that ends inside an element, or closes one it never opened, is an error; asked
// for where the tree is written back (premark), so a part cut short is never mended into a
// shorter document that reads as whole.
export function parseXml(src, lim = LIMITS, strict = false) {
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
      if (strict && (e < 0 || stack.length < 2 || stack[stack.length - 1].n !== name)) throw new Error('A part of the file is not well formed XML.');
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
  if (strict && stack.length > 1) throw new Error('A part of the file is not well formed XML.');
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

// ---- Rikuy's part ----------------------------------------------------------------------------

// The docx with Rikuy's data in a custom XML part: item, its properties, and the relationships
// from the document and to the properties, as Word itself writes custom XML.
export function addRikuyPart(bytes, data) {
  const parts = unzip(bytes);
  let k = 1;
  while (parts.has('customXml/item' + k + '.xml')) k++;
  const json = JSON.stringify(data);
  parts.set('customXml/item' + k + '.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<rikuy xmlns="' + RIKUY_NS + '">' + escText(json) + '</rikuy>');
  const guid = '{' + 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]) + '}';
  parts.set('customXml/itemProps' + k + '.xml', '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<ds:datastoreItem ds:itemID="' + guid + '" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="' + RIKUY_NS + '"/></ds:schemaRefs></ds:datastoreItem>');
  parts.set('customXml/_rels/item' + k + '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps' + k + '.xml"/></Relationships>');
  let ct = text(parts.get('[Content_Types].xml'));
  if (!/Extension="xml"/i.test(ct)) ct = ct.replace('</Types>', '<Default Extension="xml" ContentType="application/xml"/></Types>');
  ct = ct.replace('</Types>', '<Override PartName="/customXml/itemProps' + k + '.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>');
  parts.set('[Content_Types].xml', ct);
  const rp = 'word/_rels/document.xml.rels';
  let rels = text(parts.get(rp));
  let id = 'rIdRikuy';
  while (rels.includes('Id="' + id + '"')) id += 'x';
  rels = rels.replace('</Relationships>', '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item' + k + '.xml"/></Relationships>');
  parts.set(rp, rels);
  return zip(parts);
}

// Rikuy's data, if the file carries it (any custom XML item in Rikuy's namespace), else null.
// It is the sender's to write, so the caller checks every field before using it.
export function readRikuyPart(parts) {
  for (const [n, b] of parts) {
    if (!/^customXml\/item\d+\.xml$/i.test(n)) continue;
    if (b.length > LIMITS.rikuy) continue;
    let root;
    try { root = parseXml(text(b)); } catch (e) { continue; }
    const el = root.c.find((x) => typeof x !== 'string');
    if (!el || local(el.n) !== 'rikuy') continue;
    const ns = Object.entries(el.a).find(([k]) => k === 'xmlns' || k.startsWith('xmlns:'));
    if (!ns || ns[1] !== RIKUY_NS) continue;
    try { const d = JSON.parse(textContent(el)); if (d && typeof d === 'object') return d; } catch (e) { /* not ours after all */ }
  }
  return null;
}

// ---- the text of each marked block ------------------------------------------------------------

// What a reader of the document sees, block by block. Every block Rikuy exported starts with a
// bookmark named Rk<n>; a region runs from one such bookmark to the next, so a paragraph the
// coauthor added after a block joins that block's region as a new paragraph ("\n\n"). Tracked
// insertions count, tracked deletions do not (the document as it reads with all changes accepted).
// Equations, footnote marks and pictures are one OBJ character each, with what they are in objs.
//   regions: Map id -> { id, text, objs: [{at, k: 'math'|'note'|'obj', xml, display, note}],
//            cs: [[commentId, at]], ce: [[commentId, at]], joined, box, tracked }
export function extract(parts) {
  const R = { regions: new Map(), order: [], pre: region(null, 'body'), notes: new Map(), comments: new Map(), orphans: [], authors: new Set(), tracked: false, dupes: 0 };
  const doc = parseXml(text(parts.get('word/document.xml')));
  const body = find(doc, 'w:body');
  if (body) stream(R, body, 'body', R.pre);
  if (parts.has('word/footnotes.xml')) {
    const fx = parseXml(text(parts.get('word/footnotes.xml')));
    const fr = find(fx, 'w:footnotes');
    for (const fn of kids(fr, 'w:footnote')) {
      const t = fn.a['w:type'];
      if (t === 'separator' || t === 'continuationSeparator' || t === 'continuationNotice') continue;
      const pre = region(null, 'fn' + fn.a['w:id']);
      const before = R.order.length;
      stream(R, fn, 'fn' + fn.a['w:id'], pre);
      R.notes.set(fn.a['w:id'], { pre, anchors: R.order.slice(before) });
    }
  }
  comments(R, parts);
  return R;
}

function region(id, box) { return { id, text: '', objs: [], cs: [], ce: [], items: [], joined: false, box, tracked: false }; }

function stream(R, container, box, pre) {
  const S = { R, cur: pre, glue: false, pending: [], box, boxes: 0 };
  blocks(S, container, box);
}

function blocks(S, el, box) {
  for (const c of el.c) {
    if (typeof c === 'string') continue;
    switch (c.n) {
      case 'w:p': para(S, c, box); break;
      case 'w:tbl':
        for (const tr of kids(c, 'w:tr')) for (const tc of kids(tr, 'w:tc')) { S.boxes++; blocks(S, tc, box + '/c' + S.boxes); }
        break;
      case 'w:sdt': { const sc = kid(c, 'w:sdtContent'); if (sc) blocks(S, sc, box); break; }
      case 'w:customXml': case 'w:ins': case 'w:moveTo': blocks(S, c, box); break;
      case 'w:bookmarkStart': if (ANCHOR.test(c.a['w:name'] || '')) S.pending.push(c.a['w:name']); break;
      default: break;
    }
  }
}

function para(S, p, box) {
  const R = S.R;
  const pieces = S.pending.map((id) => ({ t: 'a', id }));
  S.pending = [];
  const ppr = kid(p, 'w:pPr');
  const prpr = ppr && kid(ppr, 'w:rPr');
  const markDel = !!(prpr && (kid(prpr, 'w:del') || kid(prpr, 'w:moveFrom')));
  const markIns = !!(prpr && (kid(prpr, 'w:ins') || kid(prpr, 'w:moveTo')));
  const st = { del: false, fld: [], tracked: markDel || markIns };
  inline(S, p, pieces, st);
  if (st.tracked) R.tracked = true;
  // the paragraph belongs to the first new anchor in it; a second one there means the coauthor
  // joined two paragraphs
  let owner = null;
  for (const x of pieces) if (x.t === 'a' && !R.regions.has(x.id)) { owner = x; break; }
  const has = pieces.some((x) => (x.t === 's' && x.s) || x.t === 'o' || x.t === 'cs' || x.t === 'ce');
  let cur = S.cur;
  if (owner) {
    cur = newRegion(S, owner.id, box);
    cur.joined = S.glue;
  } else if (has) {
    if (cur.box !== box && cur.id) {
      // a paragraph in a table cell or footnote of its own, with no anchor: new content Rikuy
      // cannot place (a new row, a new cell); kept so it is reported, never dropped silently
      const o = region(null, box);
      o.after = cur.id;
      R.orphans.push(o);
      S.cur = cur = o;
    } else if (!S.glue && (cur.text || cur.objs.length)) {
      cur.text += '\n\n';
      // a paragraph of a Word list (Enter in a bulleted or numbered list): a new item
      if (ppr && kid(ppr, 'w:numPr')) cur.items.push(cur.text.length);
    }
  }
  if (st.tracked) cur.tracked = true;
  for (const x of pieces) {
    if (x.t === 'a') {
      if (x === owner) continue;
      if (R.regions.has(x.id)) { if (x.id !== owner?.id) R.dupes++; continue; }
      const r = newRegion(S, x.id, box);
      r.joined = true;
      if (st.tracked) r.tracked = true;
      cur = r;
      continue;
    }
    if (x.t === 's') cur.text += x.s;
    else if (x.t === 'o') { cur.objs.push({ ...x.o, at: cur.text.length }); cur.text += OBJ; }
    else if (x.t === 'cs') cur.cs.push([x.id, cur.text.length]);
    else if (x.t === 'ce') cur.ce.push([x.id, cur.text.length]);
  }
  S.cur = cur;
  S.glue = markDel;
}

function newRegion(S, id, box) {
  const r = region(id, box);
  S.R.regions.set(id, r);
  S.R.order.push(id);
  S.cur = r;
  return r;
}

function inline(S, el, out, st) {
  for (const c of el.c) {
    if (typeof c === 'string') continue;
    const n = c.n;
    switch (n) {
      case 'w:pPr': case 'w:rPr': case 'w:proofErr': case 'w:lastRenderedPageBreak': case 'w:permStart': case 'w:permEnd': break;
      case 'w:r': run(S, c, out, st); break;
      case 'w:ins': case 'w:moveTo': st.tracked = true; if (c.a['w:author']) S.R.authors.add(c.a['w:author']); inline(S, c, out, st); break;
      case 'w:del': case 'w:moveFrom': {
        st.tracked = true;
        if (c.a['w:author']) S.R.authors.add(c.a['w:author']);
        const was = st.del; st.del = true; inline(S, c, out, st); st.del = was;
        break;
      }
      case 'w:hyperlink': case 'w:smartTag': case 'w:customXml': case 'w:fldSimple': case 'w:dir': case 'w:bdo': inline(S, c, out, st); break;
      case 'w:sdt': { const sc = kid(c, 'w:sdtContent'); if (sc) inline(S, sc, out, st); break; }
      case 'w:bookmarkStart': if (ANCHOR.test(c.a['w:name'] || '')) out.push({ t: 'a', id: c.a['w:name'] }); break;
      case 'w:commentRangeStart': out.push({ t: 'cs', id: c.a['w:id'] }); break;
      case 'w:commentRangeEnd': out.push({ t: 'ce', id: c.a['w:id'] }); break;
      case 'm:oMath': case 'm:oMathPara':
        if (!st.del && !st.fld.some((f) => f === 'instr')) out.push({ t: 'o', o: { k: 'math', xml: serialize(c), display: n === 'm:oMathPara' } });
        break;
      case 'mc:AlternateContent': if (!st.del) out.push({ t: 'o', o: { k: 'obj' } }); break;
      default: break;
    }
  }
}

function run(S, r, out, st) {
  for (const c of r.c) {
    if (typeof c === 'string') continue;
    // fields: their code is not text; their result is
    if (c.n === 'w:fldChar') {
      const t = c.a['w:fldCharType'];
      if (t === 'begin') st.fld.push('instr');
      else if (t === 'separate' && st.fld.length) st.fld[st.fld.length - 1] = 'result';
      else if (t === 'end') st.fld.pop();
      continue;
    }
    if (st.fld.some((f) => f === 'instr')) continue;
    if (st.del) {
      if (c.n === 'w:delText' || c.n === 'w:t') continue;
      continue;
    }
    const push = (s) => out.push({ t: 's', s });
    switch (c.n) {
      case 'w:t': push(textContent(c)); break;
      case 'w:tab': case 'w:ptab': push('\t'); break;
      case 'w:br': { const t = c.a['w:type']; if (t !== 'page' && t !== 'column') push('\n'); break; }
      case 'w:cr': push('\n'); break;
      case 'w:noBreakHyphen': push('-'); break;
      case 'w:sym': { const ch = parseInt(c.a['w:char'] || '', 16); if (ch >= 0x20 && ch < 0xd800 && !(ch >= 0xe000 && ch < 0xf900)) push(String.fromCharCode(ch)); break; }
      case 'w:footnoteReference': out.push({ t: 'o', o: { k: 'note', note: c.a['w:id'] } }); break;
      case 'w:endnoteReference': out.push({ t: 'o', o: { k: 'obj', endnote: c.a['w:id'] } }); break;
      case 'w:drawing': case 'w:pict': case 'w:object': case 'mc:AlternateContent': out.push({ t: 'o', o: { k: 'obj' } }); break;
      default: break;
    }
  }
}

// Word's comments: who, when, the text, and (Word 2013 on) which comment a reply answers
function comments(R, parts) {
  if (!parts.has('word/comments.xml')) return;
  const cx = parseXml(text(parts.get('word/comments.xml')));
  const byPara = new Map();
  for (const c of kids(find(cx, 'w:comments'), 'w:comment')) {
    const ps = kids(c, 'w:p');
    const body = ps.map((p) => { const o = []; inline({ R }, p, o, { del: false, fld: [] }); return o.filter((x) => x.t === 's').map((x) => x.s).join(''); }).join('\n').trim();
    const id = c.a['w:id'];
    const info = { id, author: (c.a['w:author'] || '').trim(), date: c.a['w:date'] || '', body, parent: null, done: false };
    R.comments.set(id, info);
    const last = ps[ps.length - 1];
    if (last && last.a['w14:paraId']) byPara.set(last.a['w14:paraId'], info);
  }
  if (parts.has('word/commentsExtended.xml')) {
    const ex = parseXml(text(parts.get('word/commentsExtended.xml')));
    for (const e of kids(find(ex, 'w15:commentsEx'), 'w15:commentEx')) {
      const me = byPara.get(e.a['w15:paraId']);
      if (!me) continue;
      if (e.a['w15:done'] === '1') me.done = true;
      const parent = e.a['w15:paraIdParent'] && byPara.get(e.a['w15:paraIdParent']);
      if (parent) me.parent = parent.id;
    }
  }
}

// ---- a Word file of nothing but equations -----------------------------------------------------

// pandoc reads OMML into TeX; equations are taken out of their documents into one file of their
// own, one paragraph each, so each comes back as one formula in a known order.
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
export function mathDocx(xmls) {
  const paras = xmls.map((x, i) => '<w:p><w:r><w:t xml:space="preserve">@' + i + '@ </w:t></w:r>' + x + '</w:p>').join('');
  const parts = new Map([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'],
    ['word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + paras + '</w:body></w:document>']
  ]);
  return zip(parts);
}

// pandoc's JSON of mathDocx's file -> the TeX of each equation, by its number
export function mathFromJson(json, n) {
  const out = new Array(n).fill(null);
  const blocks = (JSON.parse(json).blocks || []);
  for (const b of blocks) {
    if (b.t !== 'Para' && b.t !== 'Plain') continue;
    let idx = -1;
    const tex = [];
    for (const x of b.c) {
      if (x.t === 'Str' && /^@\d+@$/.test(x.c)) idx = +x.c.slice(1, -1);
      else if (x.t === 'Math') tex.push(x.c[1]);
    }
    if (idx >= 0 && idx < n && tex.length) out[idx] = tex.join(' ');
  }
  return out;
}

// ---- a stranger's file, made ready for pandoc ---------------------------------------------------

// pandoc reads the text and structure of a Word file and passes over some of what its reader
// sees: comments, a field written the short way (w:fldSimple: a caption's number, a cross
// reference), text colour, centred paragraphs, page breaks, and it copies a table of contents as
// the stale paragraphs Word last stored. premark() rewrites the parts pandoc reads so these
// survive: short fields in the long form pandoc knows, and marks in the text, which pandoc
// carries into its LaTeX, where src/wordjobs.js turns each into the command it stands for. It
// reads the runs of a right to left paragraph but not that the paragraph is one (w:bidi), and
// passes over text Word wrapped to say which way it runs (w:dir, w:bdo), words and all. A
// mark is made of private use characters only (U+E000 to U+E01F, taken out of the file's own
// text first): letters or digits would end up in the labels pandoc makes from headings. It
// also reports what cannot be kept (headers, charts), for the notes the user is shown.
const M0 = 0xe010;
const code = (s) => [...String(s)].map((c) => String.fromCharCode(M0 + parseInt(c, 16))).join('');
export const decode = (s) => [...s].map((c) => (c.charCodeAt(0) - M0).toString(16)).join('').toUpperCase();
export const MARKS = /[-]/;
const MARKS_ALL = /[-]/g;
export const mark = {
  comment: (id) => '' + code(id) + '',
  toc: (k) => '' + code(k) + '',     // 0 contents, 1 figures, 2 tables
  page: '',
  color: (hex) => '' + code(hex) + '',
  colorEnd: '',
  center: ['', ''],
  right: ['', ''],
  // at the head of a right to left paragraph (w:bidi); src/wordjobs.js groups such paragraphs
  // and uses the four after it for the groups' ends
  rtl: '',
  rtlGroup: ['', ''],
  ltrGroup: ['', '']
};

const mk = (n, a = {}, c = []) => ({ n, a, c });
// own: made here; the walk leaves it as it is (it takes private use characters out of the file's text)
const markRun = (s) => ({ ...mk('w:r', {}, [mk('w:t', { 'xml:space': 'preserve' }, [s])]), own: true });
const fld = (t) => mk('w:r', {}, [mk('w:fldChar', { 'w:fldCharType': t })]);
const val = (el, name) => { const k = el && kid(el, name); return k ? k.a['w:val'] || '' : ''; };
function each(el, fn) {
  if (typeof el === 'string') return;
  fn(el);
  for (const c of el.c) each(c, fn);
}

// a run's colour when it is one a reader would call coloured: not black or nearly, not white
function colorOf(rpr) {
  const v = val(rpr, 'w:color');
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  const n = parseInt(v, 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (Math.max(r, g, b) < 0x40 || Math.min(r, g, b) > 0xf0) return null;
  return v.toUpperCase();
}

// style id -> its name as Word files spell it in every language ("heading 1", "toc 2"), the
// colour of a character style, and the size of the body text in half points
function styleInfo(parts) {
  const S = { names: new Map(), colors: new Map(), sz: 0, bidi: new Map(), jc: new Map(), based: new Map(), bidiDefault: false };
  if (!parts.has('word/styles.xml')) return S;
  let st;
  try { st = find(parseXml(text(parts.get('word/styles.xml'))), 'w:styles'); } catch (e) { return S; }
  if (!st) return S;
  const dd = kid(st, 'w:docDefaults');
  const dsz = dd && find(dd, 'w:sz');
  if (dsz) S.sz = +dsz.a['w:val'] || 0;
  S.bidiDefault = onOff(dd && kid(dd, 'w:pPrDefault') && kid(kid(dd, 'w:pPrDefault'), 'w:pPr'), 'w:bidi') === true;
  for (const s of kids(st, 'w:style')) {
    const id = s.a['w:styleId'];
    if (!id) continue;
    S.names.set(id, (val(s, 'w:name') || id).toLowerCase());
    if (s.a['w:type'] === 'paragraph') {
      const b = onOff(kid(s, 'w:pPr'), 'w:bidi');
      if (b != null) S.bidi.set(id, b);
      if (val(kid(s, 'w:pPr'), 'w:jc')) S.jc.set(id, val(kid(s, 'w:pPr'), 'w:jc'));
      if (val(s, 'w:basedOn')) S.based.set(id, val(s, 'w:basedOn'));
      if (s.a['w:default'] === '1') S.normal = id;
    }
    const rpr = kid(s, 'w:rPr');
    if (s.a['w:type'] === 'character') { const c = colorOf(rpr); if (c) S.colors.set(id, c); }
    if (s.a['w:type'] === 'paragraph' && s.a['w:default'] === '1' && +val(rpr, 'w:sz')) S.sz = +val(rpr, 'w:sz');
  }
  return S;
}

// a property Word switches on by naming it and off with w:val="0": true, false, or null when
// the element does not say
function onOff(el, name) {
  const k = el && kid(el, name);
  if (!k) return null;
  return !/^(0|false|off)$/.test(k.a['w:val'] || '');
}
// what a paragraph's style says (or one that style is based on), where the paragraph does not
function styled(C, sid, map) {
  const S = C.styles;
  for (let id = sid || S.normal, k = 0; id && k < 20; id = S.based.get(id), k++) if (map.has(id)) return map.get(id);
  return null;
}
// whether a paragraph runs right to left: by its own properties, else its style's, else the
// document's defaults
function isBidi(C, ppr, sid) {
  const own = onOff(ppr, 'w:bidi');
  return own != null ? own : styled(C, sid, C.styles.bidi) ?? C.styles.bidiDefault;
}

// text of the file's without characters that would read as marks
const bare = (t) => String(t || '').replace(MARKS_ALL, '');

// Word's comments as threads: head id -> { who, body, quote, replies: [{ who, body }] }
function threads(parts) {
  const T = new Map();
  if (!parts.has('word/comments.xml')) return T;
  let X;
  try { X = extract(parts); } catch (e) { return T; }
  const regs = [X.pre, ...X.orphans, ...[...X.notes.values()].map((n) => n.pre), ...X.regions.values()];
  const root = (c) => { let k = 0; while (c && c.parent != null && k++ < 50) c = X.comments.get(c.parent); return c; };
  for (const [id, c] of X.comments) {
    if (c.parent != null || !c.body || !/^\d{1,9}$/.test(id)) continue;
    let quote = '';
    for (const R of regs) {
      const s = R.cs.find((x) => x[0] === id);
      if (!s) continue;
      const e = R.ce.find((x) => x[0] === id);
      // the words of the first paragraph the comment covers: a Rikuy comment sits under one line
      quote = R.text.slice(s[1], Math.max(s[1], e ? e[1] : s[1])).split('\n\n')[0].replace(new RegExp(OBJ, 'g'), '').replace(/\s+/g, ' ').trim();
      break;
    }
    T.set(id, { who: bare(c.author), body: bare(c.body) + (c.done ? ' (resolved in Word)' : ''), quote: bare(quote), replies: [] });
  }
  for (const c of X.comments.values()) {
    if (c.parent == null || !c.body) continue;
    const r = root(c);
    if (r && T.has(r.id)) T.get(r.id).replies.push({ who: bare(c.author), body: bare(c.body) });
  }
  return T;
}

// what a header or footer says besides the page number
function headText(root) {
  let depth = 0, s = '';
  each(root, (x) => {
    if (x.n === 'w:fldChar') { const t = x.a['w:fldCharType']; if (t === 'begin') depth++; else if (t === 'end') depth = Math.max(0, depth - 1); }
    else if (x.n === 'w:fldSimple') x.c = [];
    else if (x.n === 'w:t' && !depth) s += textContent(x);
    else if (x.n === 'w:tab' || x.n === 'w:p') s += ' ';
  });
  s = s.replace(/\s+/g, ' ').trim();
  return /[^\W\d_]{2}/u.test(s.replace(/\b(page|of|seite|von|p[áa]gina|de|sur)\b/gi, '')) ? s : '';
}

// parts: unzip()'s. Returns { parts: the map pandoc should read, info }.
export function premark(parts) {
  const info = { threads: threads(parts), toc: 0, breaks: 0, colors: new Map(), chars: 0, aligned: 0, rtl: 0, tracked: 0, charts: 0, art: 0, fields: 0, mathcolor: 0, heads: [], cols: [], page: null, sz: 0, endnotes: false, unread: [] };
  const styles = styleInfo(parts);
  info.sz = styles.sz;
  const out = new Map(parts);
  const C = { info, styles, heads: new Set(info.threads.keys()), pending: [], changed: false };
  for (const name of ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml']) {
    if (!parts.has(name)) continue;
    let root;
    // a part this reader cannot follow goes to pandoc as it is
    try { root = parseXml(text(parts.get(name)), LIMITS, true); } catch (e) { info.unread.push(name); continue; }
    C.changed = false;
    const main = name === 'word/document.xml';
    C.body = main;
    const body = main ? find(root, 'w:body') : root.c.find((x) => typeof x !== 'string');
    if (!body) continue;
    if (main) {
      blocksFix(C, body, true);
      each(body, (x) => {
        if (x.n !== 'w:sectPr') return;
        info.cols.push(+((kid(x, 'w:cols') || { a: {} }).a['w:num']) || 1);
        const sz = kid(x, 'w:pgSz'), mar = kid(x, 'w:pgMar');
        const num = (el, k) => { const v = +(el && el.a[k]); return v > 0 && v < 1e5 ? v : 0; };
        if (sz) info.page = { w: num(sz, 'w:w'), h: num(sz, 'w:h'), top: num(mar, 'w:top'), right: num(mar, 'w:right'), bottom: num(mar, 'w:bottom'), left: num(mar, 'w:left') };
      });
    } else {
      for (const n of body.c) if (typeof n !== 'string') blocksFix(C, n, false);
      if (name === 'word/endnotes.xml' && kids(body, 'w:endnote').some((n) => !n.a['w:type'] || n.a['w:type'] === 'normal')) info.endnotes = true;
    }
    if (C.changed) out.set(name, enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + serialize(root)));
  }
  for (const [n, b] of parts) {
    if (!/^word\/(header|footer)\d*\.xml$/.test(n)) continue;
    try { const t = bare(headText(parseXml(text(b)))); if (t && !info.heads.includes(t)) info.heads.push(t); } catch (e) { /* not text a reader saw */ }
  }
  return { parts: out, info };
}

function blocksFix(C, box, top) {
  tocFields(C, box);
  const out = [];
  for (const c of box.c) {
    if (typeof c === 'string') { out.push(c); continue; }
    switch (c.n) {
      case 'w:p': paraFix(C, c, top); break;
      case 'w:tbl': for (const tr of kids(c, 'w:tr')) for (const tc of kids(tr, 'w:tc')) blocksFix(C, tc, false); break;
      case 'w:sdt': {
        const g = find(kid(c, 'w:sdtPr'), 'w:docPartGallery');
        // the table of contents Word last stored: LaTeX makes its own
        if (g && /table of contents/i.test(g.a['w:val'] || '')) { out.push(tocPara(C, instrOf(c))); continue; }
        const sc = kid(c, 'w:sdtContent');
        if (sc) blocksFix(C, sc, top);
        break;
      }
      case 'w:ins': case 'w:moveTo': case 'w:customXml': blocksFix(C, c, top); break;
      case 'w:commentRangeStart': if (C.heads.delete(c.a['w:id'])) C.pending.push(c.a['w:id']); break;
      default: break;
    }
    out.push(c);
  }
  box.c = out;
}

const instrOf = (el) => { let s = ''; each(el, (x) => { if (x.n === 'w:instrText') s += textContent(x); }); return s; };
function tocPara(C, instr) {
  const m = /\\c\s+"?\s*(\w+)/.exec(instr);
  C.info.toc++;
  C.changed = true;
  return { ...mk('w:p', {}, [markRun(mark.toc(m ? (/^tab/i.test(m[1]) ? 2 : 1) : 0))]), own: true };
}

// A table of contents outside a content control: the paragraphs from the one where a TOC field
// begins to the one where it ends. They go only when each reads like an entry (a toc style, a
// link to a heading, a page reference), so a field that never ends takes no text with it.
function tocFields(C, box) {
  const ps = box.c;
  const cut = [];
  let depth = 0, start = -1, at = 0, instr = '', wait = false;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (typeof p === 'string' || p.n !== 'w:p') continue;
    each(p, (x) => {
      if (x.n === 'w:fldChar') {
        const t = x.a['w:fldCharType'];
        if (t === 'begin') { depth++; wait = true; }
        else if (t === 'end') { if (start >= 0 && depth === at) { cut.push([start, i, instr]); start = -1; } depth = Math.max(0, depth - 1); }
      } else if (x.n === 'w:instrText' && wait) {
        const s = textContent(x);
        if (!s.trim()) return;
        wait = false;
        if (start < 0 && /^\s*TOC\b/.test(s)) { start = i; at = depth; instr = s; }
      }
    });
  }
  const sname = (p) => C.styles.names.get(val(kid(p, 'w:pPr'), 'w:pStyle')) || val(kid(p, 'w:pPr'), 'w:pStyle').toLowerCase();
  for (const [a, b, ins] of cut.reverse()) {
    let ok = true;
    for (let i = a; i <= b && ok; i++) {
      const p = ps[i];
      if (typeof p === 'string') continue;
      if (p.n !== 'w:p') { ok = false; break; }
      let entry = /^(toc|table of figures)/.test(sname(p)), words = false;
      each(p, (x) => { if ((x.n === 'w:hyperlink' && x.a['w:anchor']) || (x.n === 'w:instrText' && /PAGEREF/.test(textContent(x)))) entry = true; if (x.n === 'w:t' && textContent(x).trim()) words = true; });
      if (words && !entry) ok = false;
    }
    if (!ok) continue;
    let from = a;
    for (let k = a - 1; k >= 0; k--) { const p = ps[k]; if (typeof p === 'string') continue; if (p.n === 'w:p' && sname(p) === 'toc heading') from = k; break; }
    ps.splice(from, b - from + 1, tocPara(C, ins));
  }
}

// styles of code: pandoc's Source Code and Verbatim Char, its token styles (KeywordTok, StringTok,
// ...), Word's HTML Code and HTML Preformatted
const CODE = /^source code$|verbatim|tok$|(^| )code( |$)|preformatted/i;

function paraFix(C, p, top) {
  if (p.own) return;
  const ppr = kid(p, 'w:pPr');
  const sid = val(ppr, 'w:pStyle');
  const sname = C.styles.names.get(sid) || sid.toLowerCase();
  // text Rikuy or LaTeX styles itself keeps no colour or alignment of Word's
  const own = /^(heading|title|subtitle|caption|toc|table of|author|abstract|date|bibliography)/.test(sname) || CODE.test(sname);
  const prpr = kid(ppr, 'w:rPr');
  if (prpr && (kid(prpr, 'w:ins') || kid(prpr, 'w:del') || kid(prpr, 'w:moveFrom') || kid(prpr, 'w:moveTo'))) C.info.tracked++;
  const st = { color: !own, link: false, n: 0, hold: false };
  p.c = inlineFix(C, p.c, st);
  const at = () => { const i = p.c.indexOf(ppr); return i < 0 ? 0 : i + 1; };
  if (C.pending.length) { p.c.splice(at(), 0, ...C.pending.map((id) => markRun(mark.comment(id)))); C.pending = []; C.changed = true; }
  // (a style may align its paragraphs: Rikuy's own Word files centre text that way)
  const jc = val(ppr, 'w:jc') || styled(C, sid, C.styles.jc) || '';
  // In a right to left paragraph Word's "left" and "start" are the edge the text starts at (the
  // right one) and "right" and "end" the other; LaTeX's flushright in a right to left paragraph
  // is that other edge too, so the same mark serves both ways, and "left", "start" and "both"
  // ask for nothing in either.
  const m = jc === 'center' ? mark.center : jc === 'right' || jc === 'end' ? mark.right : null;
  // a centred or right aligned paragraph of words, in the body (a table sets its own cells; a
  // display equation and a picture with a caption are centred by LaTeX)
  if (m && top && !own && st.n && !st.hold && !(ppr && kid(ppr, 'w:numPr'))) {
    p.c.splice(at(), 0, markRun(m[0]));
    p.c.push(markRun(m[1]));
    C.info.aligned++;
    C.changed = true;
  }
  // a right to left paragraph of words in the body: headings too, but not what pandoc reads
  // as the title block or a caption, where a mark would be part of the title
  if (C.body && st.n && !st.hold && (!own || /^heading/.test(sname)) && isBidi(C, ppr, sid)) {
    p.c.splice(at(), 0, markRun(mark.rtl));
    C.info.rtl++;
    C.changed = true;
  }
}

function inlineFix(C, cs, st) {
  const out = [];
  for (const c of cs) {
    if (typeof c === 'string') { out.push(c); continue; }
    switch (c.n) {
      case 'w:r': runFix(C, c, st); break;
      case 'w:fldSimple': {
        // the short form of a field, which pandoc drops with the text it shows (a caption's
        // number, a cross reference), written as the long form it reads
        out.push(fld('begin'), mk('w:r', {}, [mk('w:instrText', { 'xml:space': 'preserve' }, [c.a['w:instr'] || ''])]), fld('separate'), ...inlineFix(C, c.c, st), fld('end'));
        C.info.fields++;
        C.changed = true;
        continue;
      }
      case 'w:hyperlink': { const was = st.link; st.link = true; c.c = inlineFix(C, c.c, st); st.link = was; break; }
      case 'w:ins': case 'w:moveTo': C.info.tracked++; c.c = inlineFix(C, c.c, st); break;
      case 'w:del': case 'w:moveFrom': C.info.tracked++; break;
      case 'w:smartTag': case 'w:customXml': c.c = inlineFix(C, c.c, st); break;
      // text Word wrapped to say which way it runs: pandoc reads the runs only without the
      // wrapper, and TeX finds the direction of the words in them by itself
      case 'w:dir': case 'w:bdo': out.push(...inlineFix(C, c.c, st)); C.changed = true; continue;
      case 'w:sdt': { const sc = kid(c, 'w:sdtContent'); if (sc) sc.c = inlineFix(C, sc.c, st); break; }
      case 'w:commentRangeStart':
        out.push(c);
        if (C.heads.delete(c.a['w:id'])) { out.push(markRun(mark.comment(c.a['w:id']))); C.changed = true; }
        continue;
      case 'm:oMathPara': st.hold = true; mathColor(C, c); break;
      case 'm:oMath': mathColor(C, c); break;
      default: break;
    }
    out.push(c);
  }
  return out;
}

// colour inside a formula is not carried (texmath has no colour): counted, to say so
function mathColor(C, m) {
  let n = 0;
  each(m, (x) => { if (x.n === 'm:r' && colorOf(kid(x, 'w:rPr'))) n = 1; });
  C.info.mathcolor += n;
}

function runFix(C, r, st) {
  if (r.own) return;
  const ts = [];
  for (let i = 0; i < r.c.length; i++) {
    const c = r.c[i];
    if (typeof c === 'string') continue;
    if (c.n === 'w:t') {
      c.c = c.c.map((s) => (typeof s === 'string' && MARKS.test(s) ? (C.changed = true, s.replace(MARKS_ALL, '')) : s));
      if (textContent(c).trim()) ts.push(c);
    } else if (c.n === 'w:br' && c.a['w:type'] === 'page') {
      r.c[i] = mk('w:t', { 'xml:space': 'preserve' }, [mark.page]);
      C.info.breaks++;
      C.changed = true;
    } else if (c.n === 'w:commentReference') {
      // a comment with no range: it stands where its mark is
      if (C.heads.delete(c.a['w:id'])) { r.c.splice(++i, 0, mk('w:t', { 'xml:space': 'preserve' }, [mark.comment(c.a['w:id'])])); C.changed = true; }
    } else if (c.n === 'w:drawing' || c.n === 'w:pict' || c.n === 'w:object' || c.n === 'mc:AlternateContent') {
      st.hold = true;
      // a text box's words are read by pandoc too: no mark of the file's own in them either
      each(c, (x) => { if (x.n === 'w:t' && MARKS.test(textContent(x))) { x.c = x.c.map((t) => (typeof t === 'string' ? bare(t) : t)); C.changed = true; } });
      const pick = c.n === 'mc:AlternateContent' ? kid(c, 'mc:Choice') || c : c;
      if (find(pick, 'c:chart')) C.info.charts++;
      else if (find(pick, 'dgm:relIds')) C.info.art++;
    }
  }
  const len = ts.reduce((n, t) => n + textContent(t).replace(/\s/g, '').length, 0);
  st.n += len;
  C.info.chars += len;
  if (!len || !st.color || st.link) return;
  const rpr = kid(r, 'w:rPr');
  // code is set verbatim in LaTeX, where a mark's command would be printed as it is written:
  // the colours of syntax highlighting (pandoc's, Quarto's, R Markdown's token styles) stay behind
  if (CODE.test(C.styles.names.get(val(rpr, 'w:rStyle')) || val(rpr, 'w:rStyle'))) return;
  const col = colorOf(rpr) || C.styles.colors.get(val(rpr, 'w:rStyle')) || null;
  if (!col) return;
  const first = ts[0], last = ts[ts.length - 1];
  first.c.unshift(mark.color(col));
  last.c.push(mark.colorEnd);
  first.a['xml:space'] = last.a['xml:space'] = 'preserve';
  C.info.colors.set(col, (C.info.colors.get(col) || 0) + len);
  C.changed = true;
}
