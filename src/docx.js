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
export const OBJ = '￼';

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

function region(id, box) { return { id, text: '', objs: [], cs: [], ce: [], joined: false, box, tracked: false }; }

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
    } else if (!S.glue && (cur.text || cur.objs.length)) cur.text += '\n\n';
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
