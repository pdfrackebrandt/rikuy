// A coauthor's edits in Word, written back into the .tex as the smallest source patches.
//
// At export (src/wordast.js) every block got a bookmark and, kept in the .docx itself, the text
// it showed and the source range behind each character. Here the edited file's text of each
// block (src/docx.js extract) is compared with that, word by word; each change becomes an edit
// of the source as it was at export, through the character map, as typing on the page would make
// it: inside one source span a splice, across markup only the visible characters (so every brace
// stays), new text escaped for LaTeX. Equations changed in Word are read back to TeX by pandoc and
// patched token by token where the change can be found in the source, else replaced whole.
// Those edits are then carried onto the source as it is now (the owner may have kept writing): an
// edit lands where the text it touches is unchanged since export, and is never forced onto text
// the owner changed; it becomes a comment there instead, as does anything else that cannot be
// placed (generated text, a new table row, a picture). Word's comments become Rikuy comments.
import { diffSeq, changes } from './diff.js';
import { escapeTeX, endsWithControlWord } from './editor.js';
import { isBalanced } from './parser.js';
import { cleanPath, commentEdit, findComments } from './share.js';
import { unpackRuns } from './wordast.js';

const OBJ = '\uFFFC';
const RO = -1, ATOM = -2;

// ---- export: the map of the text as Word got it ------------------------------------------------

// The text pandoc wrote can differ from what the page showed (a citation as the citation style
// writes it, a space after a footnote's number): the two are lined up character by character and
// what pandoc added takes the atom it replaced, or is marked generated.
export function alignRuns(exp, actual) {
  const em = unpackRuns(exp.runs);
  if (exp.text === actual) return exp.runs;
  const ops = diffSeq([...exp.text].map(cu), [...actual].map(cu));
  const out = [];
  let ei = 0, del = [], add = 0;
  const flush = () => {
    if (add) {
      const atoms = new Set(del.filter(([s]) => s === ATOM).map(([, a]) => a));
      const one = atoms.size === 1 && del.every(([s]) => s === ATOM || s === RO) ? [...atoms][0] : null;
      for (let k = 0; k < add; k++) { if (one != null) out.push(ATOM, one); else out.push(RO, RO); }
    }
    del = []; add = 0;
  };
  for (const [op, ch] of ops) {
    const n = ch.length; // code units: an astral character is one element, two units
    if (op === ' ') { flush(); for (let k = 0; k < n; k++) { out.push(em[2 * ei], em[2 * ei + 1]); ei++; } }
    else if (op === '-') { for (let k = 0; k < n; k++) { del.push([em[2 * ei], em[2 * ei + 1]]); ei++; } }
    else add += n;
  }
  flush();
  return packMap(out);
}
const cu = (c) => c;

export function packMap(m) {
  const runs = [];
  for (let i = 0; i < m.length / 2;) {
    const s = m[2 * i], e = m[2 * i + 1];
    if (s === RO) { let n = 0; while (i < m.length / 2 && m[2 * i] === RO) { n++; i++; } runs.push([-1, n]); continue; }
    if (s === ATOM) { let n = 0; while (i < m.length / 2 && m[2 * i] === ATOM && m[2 * i + 1] === e) { n++; i++; } runs.push([-2, e, n]); continue; }
    if (e === s + 1) { let n = 0; while (i < m.length / 2 && m[2 * i] === s + n && m[2 * i + 1] === s + n + 1) { n++; i++; } runs.push([n, s]); continue; }
    runs.push([0, s, e]); i++;
  }
  return runs;
}

// ---- what a .docx says about itself is checked first --------------------------------------------

const MAX_TEXT = 32e6;
const isInt = (x) => Number.isInteger(x) && x >= -2 && x < 1e9;

// The data from the file's custom XML part, as far as it is well formed, or null. Every field
// was written by whoever sent the file.
export function checkData(d) {
  if (!d || typeof d !== 'object' || d.rikuy !== 1 || !Array.isArray(d.files)) return null;
  const files = new Map();
  let size = 0;
  for (const f of d.files) {
    if (!Array.isArray(f) || typeof f[1] !== 'string') return null;
    const n = cleanPath(f[0]);
    if (n === null || n !== f[0]) return null;
    size += f[1].length;
    if (size > MAX_TEXT || files.size > 2000) return null;
    files.set(n, f[1]);
  }
  if (typeof d.main !== 'string' || !files.has(d.main)) return null;
  const len = (f) => (files.get(f) || '').length;
  const inFile = (f, p) => p == null || (isInt(p) && p >= 0 && p <= len(f));
  const atoms = [];
  for (const a of Array.isArray(d.atoms) ? d.atoms : []) {
    const ok = a && typeof a === 'object' && typeof a.k === 'string' && files.has(a.f) && inFile(a.f, a.s) && inFile(a.f, a.e) && inFile(a.f, a.is) && inFile(a.f, a.ie) && (a.s == null || a.e == null || a.s <= a.e);
    atoms.push(ok ? { k: a.k, f: a.f, s: a.s, e: a.e, is: a.is, ie: a.ie, ro: !!a.ro, disp: !!a.disp, tags: Array.isArray(a.tags) ? a.tags.map(String) : [], was: typeof a.was === 'string' ? a.was : null } : null);
  }
  const anchors = [];
  for (const A of Array.isArray(d.anchors) ? d.anchors : []) {
    if (!A || typeof A.id !== 'string' || !/^Rk\d{1,7}$/.test(A.id) || typeof A.text !== 'string' || !files.has(A.f) || !Array.isArray(A.runs)) continue;
    if (!A.runs.every((r) => Array.isArray(r) && r.length <= 3 && r.every(isInt))) continue;
    let map;
    try { map = unpackRuns(A.runs); } catch (e) { continue; }
    if (map.length !== 2 * A.text.length) continue;
    let ok = true;
    for (let i = 0; i < map.length && ok; i += 2) {
      const s = map[i], e = map[i + 1];
      if (s === ATOM) ok = e >= 0 && e < atoms.length;
      else if (s !== RO) ok = s >= 0 && e >= s && e <= len(A.f);
    }
    if (!ok || !inFile(A.f, A.s) || !inFile(A.f, A.e) || !inFile(A.f, A.ins) || !inFile(A.f, A.after)) continue;
    anchors.push({ id: A.id, k: String(A.k || 'p'), f: A.f, s: A.s ?? null, e: A.e ?? null, ins: A.ins ?? null, after: A.after ?? null, top: !!A.top, text: A.text, map });
  }
  return { name: typeof d.name === 'string' ? d.name.slice(0, 200) : d.main, main: d.main, files, anchors, atoms, t: typeof d.t === 'number' ? d.t : 0, sig: typeof d.sig === 'string' ? d.sig.slice(0, 100) : '' };
}

// ---- text changes -> source edits ---------------------------------------------------------------

const TOK = /[\p{L}\p{N}\p{M}]+|\s+|[\s\S]/gu;
const toks = (t) => t.match(TOK) || [];

// old text -> new text as hunks { a, b, A, B } (old [a, b), new [A, B)), word granular. Hunks a
// space or one short word apart are one change, as the Review tab shows them: "keeps writing" to
// "always writes" is one edit, so it is never half applied around an edit of the owner's. Each is
// then trimmed to the characters that differ.
export function textHunks(o, n) {
  if (o === n) return [];
  const ops = diffSeq(toks(o), toks(n));
  const out = [];
  let a = 0, A = 0, h = null;
  for (const [op, v] of ops) {
    if (op === ' ') { if (h) { out.push(h); h = null; } a += v.length; A += v.length; continue; }
    if (!h) h = { a, b: a, A, B: A };
    if (op === '-') { a += v.length; h.b = a; } else { A += v.length; h.B = A; }
  }
  if (h) out.push(h);
  const merged = [];
  for (const x of out) {
    const L = merged[merged.length - 1];
    const gap = L ? o.slice(L.b, x.a) : null;
    if (L && gap.length < 12 && /^\s*[\p{L}\p{N}]*\s*$/u.test(gap) && !gap.includes(OBJ) && !/\n\s*\n/.test(gap)) { L.b = x.b; L.B = x.B; continue; }
    merged.push({ ...x });
  }
  // then trimmed to the characters that differ, so café to cafés adds an s after caf\'e
  for (const x of merged) {
    while (x.a < x.b && x.A < x.B && o[x.a] === n[x.A] && o[x.a] !== OBJ) { x.a++; x.A++; }
    while (x.b > x.a && x.B > x.A && o[x.b - 1] === n[x.B - 1] && o[x.b - 1] !== OBJ) { x.b--; x.B--; }
  }
  return merged.filter((x) => x.a < x.b || x.A < x.B);
}

// position in the new text -> position in the old one, through the hunks
function newToOld(hs, p) {
  let d = 0;
  for (const h of hs) {
    if (p < h.A) break;
    if (p <= h.B) return Math.min(h.a + (p - h.A), h.b);
    d = h.b - h.B;
  }
  return p + d;
}

// what a paragraph break can be where new text goes: a blank line in running text, a space in a
// command's argument (a heading, a caption, a cell)
const PARA_OK = new Set(['p', 'li', 'fn']);
const ITEM = '\u2023'; // marks, inside new text, a paragraph that is a new list item

// LaTeX for new text from Word: escaped as typing it on the page would be; objects in it (an
// equation or a footnote the coauthor inserted) as LaTeX of their own
function texFor(text, objs, at, ctx) {
  let out = '';
  let prev = ctx.prev;
  let k = 0;
  for (const part of text.split(OBJ)) {
    let t = part.replace(/\r/g, '').replace(/\t/g, ' ');
    t = t.replace(/\n{2,}/g, '\u2029').replace(/\n/g, ' ');
    const paras = t.split('\u2029');
    out += paras.map((p, i) => {
      const item = p.startsWith(ITEM);
      const body = escapeTeX(item ? p.slice(1) : p, i ? ' ' : prev);
      if (!i) return body;
      return (!ctx.paras ? ' ' : item && ctx.list ? '\n\\item ' : '\n\n') + body;
    }).join('');
    if (part) prev = part[part.length - 1];
    if (k < objs.length) {
      const o = objs[k++];
      const r = ctx.obj(o);
      if (r) { out += r; prev = 'x'; }
    }
  }
  return out;
}

// The plan: { files: Map name -> new text (only those that change), applied, conflicts, skipped,
// comments, deleted, who }. data: checkData's; X: extract()'s of the edited file, with
// X.mathTex (Map obj -> TeX) for its equations; cur: the project's files now.
// H.who: the coauthor's name for comments; H.mathPatch(orig, was, now, atom): the new source of a
// changed equation, or null.
export function planImport(data, X, cur, H = {}) {
  const who = H.who || 'Word';
  const base = data.files;
  const edits = []; // in the source as exported: { f, s, e, t, kind, what }
  const notes = []; // could not be placed: { f, p (base offset) or null, quote, body }
  const comments = []; // Word comments: { f, p, who, quote, body, reply }
  const stats = { applied: 0, conflicts: 0, skipped: 0, comments: 0, math: 0, deleted: 0, joined: 0, moved: 0, inserted: 0 };
  const byId = new Map(data.anchors.map((A) => [A.id, A]));
  const atomOf = (A, i) => (A.map[2 * i] === ATOM ? A.map[2 * i + 1] : null);
  const srcOf = (A, i) => (A.map[2 * i] >= 0 ? [A.map[2 * i], A.map[2 * i + 1]] : null);
  const mathTex = X.mathTex || new Map();
  const deletedTop = new Set();

  const objTex = (A) => (o) => {
    if (o.k === 'math') {
      const t = safeMath(mathTex.get(o));
      if (!t) { notes.push({ f: A.f, p: null, body: 'An equation was added in Word here; pandoc could not read it.' }); return ''; }
      return o.display ? '\n\\[\n' + t + '\n\\]\n' : '$' + t + '$';
    }
    if (o.k === 'note') {
      const fn = X.notes.get(o.note);
      if (fn && !fn.anchors.length) return '\\footnote{' + texFor(fn.pre.text, fn.pre.objs, 0, { prev: ' ', paras: true, obj: objTex(A) }) + '}';
      return '';
    }
    notes.push({ f: A.f, p: null, body: 'A picture or object was added in Word here; Rikuy does not bring those in.' });
    return '';
  };

  // where text inserted at old position i goes in the source
  const insertAt = (A, i) => {
    for (let k = i - 1; k >= 0; k--) {
      const s = srcOf(A, k);
      if (s) return s[1];
      const at = atomOf(A, k);
      if (at != null && data.atoms[at] && data.atoms[at].e != null && !data.atoms[at].ro) return data.atoms[at].e;
      if (A.map[2 * k] === RO && k === i - 1) continue;
    }
    for (let k = i; k < A.text.length; k++) {
      const s = srcOf(A, k);
      if (s) return s[0];
      const at = atomOf(A, k);
      if (at != null && data.atoms[at] && data.atoms[at].s != null && !data.atoms[at].ro) return data.atoms[at].s;
    }
    return A.ins;
  };

  const note = (A, i, body, quote) => {
    let p = null;
    for (let k = Math.min(i, A.text.length - 1); k >= 0 && p == null; k--) { const s = srcOf(A, k); if (s) p = s[0]; }
    if (p == null) p = A.ins ?? A.s;
    notes.push({ f: A.f, p, quote: quote || '', body });
    stats.skipped++;
  };

  const show = (t) => '“' + t.replace(new RegExp(OBJ, 'g'), '…').replace(/\s+/g, ' ').trim().slice(0, 80) + '”';

  // Text with no bookmark of its own (a code listing, the line that stands for a TikZ picture)
  // belongs in Word to the block before it. When that block is deleted, Word hands the text to
  // the block before that one, where it would read as words the coauthor typed and be written
  // into the source a second time: it is taken off there, as the source still has what made it.
  const tail = (A) => {
    let k = A.text.length;
    while (k > 0 && A.map[2 * (k - 1)] === RO) k--;
    const j = A.text.indexOf('\n\n', k);
    return j < 0 ? '' : A.text.slice(j);
  };
  const cut = new Map();
  data.anchors.forEach((A, i) => {
    const R = X.regions.get(A.id);
    if (!R) return;
    let acc = '';
    for (let j = i + 1; j < data.anchors.length && !X.regions.has(data.anchors[j].id); j++) acc += tail(data.anchors[j]);
    if (!acc || !R.text.endsWith(acc) || R.text.length - acc.length < A.text.length - tail(A).length) return;
    const n = R.text.length - acc.length;
    cut.set(A.id, { ...R, text: R.text.slice(0, n), objs: R.objs.filter((o) => o.at < n), items: (R.items || []).filter((x) => x <= n), cs: R.cs.filter((x) => x[1] <= n), ce: R.ce.map((x) => [x[0], Math.min(x[1], n)]) });
  });

  for (const A of data.anchors) {
    const R = cut.get(A.id) || X.regions.get(A.id);
    if (!R) {
      // the block is gone from the Word file: a paragraph of its own is deleted whole
      if (A.top && A.s != null && isBalanced(base.get(A.f), A.s, A.e)) { edits.push(delBlock(base.get(A.f), A)); stats.deleted++; deletedTop.add(A.id); }
      else edits.push(...textEdits(A, A.text, '', [], []));
      continue;
    }
    if (R.joined) {
      const prevId = data.anchors[data.anchors.indexOf(A) - 1]?.id;
      const P = prevId && byId.get(prevId);
      const PR = P && X.regions.get(P.id);
      const prevGone = P && PR && !PR.text.replace(/\s/g, '') && P.top;
      if (P && !prevGone && P.top && A.top && P.f === A.f && P.e != null && A.s != null && P.e <= A.s && /^\s*$/.test(base.get(A.f).slice(P.e, A.s))) {
        edits.push({ f: A.f, s: P.e, e: A.s, t: ' ', kind: 'join' });
        stats.joined++;
      } else if (P && !prevGone) note(A, 0, 'In Word this paragraph was joined to the one before; Rikuy left them apart.');
    }
    // a top level paragraph whose text is all gone (tracked deletion) is deleted whole
    if (A.top && A.s != null && !R.text.replace(/\s/g, '') && A.text.replace(/\s/g, '') && isBalanced(base.get(A.f), A.s, A.e)) {
      edits.push(delBlock(base.get(A.f), A)); stats.deleted++; deletedTop.add(A.id);
      continue;
    }
    const hs = textHunks(A.text, R.text);
    edits.push(...textEdits(A, A.text, R.text, R.objs, hs, R.items || []));
    // equations kept in place but changed inside
    for (const o of R.objs) {
      if (o.k !== 'math') continue;
      const i = newToOld(hs, o.at);
      if (A.text[i] !== OBJ || hs.some((h) => h.A <= o.at && o.at < h.B)) continue;
      const ai = atomOf(A, i);
      const at = ai != null ? data.atoms[ai] : null;
      if (!at || at.k !== 'math') continue;
      const now = safeMath(mathTex.get(o));
      if (now == null || at.was == null) continue;
      const strip = (t) => stripNumbers(t, at.tags);
      if (canon(strip(now)) === canon(strip(at.was))) continue;
      if (at.ro || at.is == null) { note(A, i, 'An equation from a macro was changed in Word to ' + now + '; edit the macro instead.'); continue; }
      const orig = base.get(at.f).slice(at.is, at.ie);
      const next = (H.mathPatch || mathPatch)(orig, strip(at.was), strip(now), at);
      if (next == null || next === orig) continue;
      edits.push({ f: at.f, s: at.is, e: at.ie, t: next, kind: 'math', what: 'equation' });
      stats.math++;
    }
    // Word comments in this block
    for (const [cid, at] of R.cs) {
      const c = X.comments.get(cid);
      if (!c || !c.body) continue;
      const end = (R.ce.find((x) => x[0] === cid) || [null, at])[1];
      const quote = R.text.slice(at, Math.max(at, end)).replace(new RegExp(OBJ, 'g'), '').replace(/\s+/g, ' ').trim();
      const i = newToOld(hs, at);
      let p = null;
      for (let k = Math.min(i, A.text.length - 1); k >= 0 && p == null; k--) { const s = srcOf(A, k); if (s) p = s[0]; }
      if (p == null) for (let k = i; k < A.text.length && p == null; k++) { const s = srcOf(A, k); if (s) p = s[0]; }
      if (p == null) p = A.ins ?? A.s;
      if (p == null) continue;
      comments.push({ f: A.f, p, who: c.author || who, quote, body: c.body, id: cid, parent: c.parent });
    }
  }

  // text in a new table row or cell, or a new paragraph after a table: where it can go
  for (const o of X.orphans) {
    const A = byId.get(o.after);
    const t = o.text.replace(new RegExp(OBJ, 'g'), '').trim();
    if (!A || !t) continue;
    if (o.box === 'body' && A.after != null) {
      edits.push({ f: A.f, s: A.after, e: A.after, t: '\n\n' + texFor(o.text.replace(/^\n+/, ''), o.objs, 0, { prev: ' ', paras: true, obj: objTex(A) }), kind: 'insert' });
      stats.inserted++;
    } else note(A, A.text.length, 'Added in Word, in a new table cell or row, not brought in: ' + show(t));
  }
  // blocks moved in Word: the order of the bookmarks says which
  const order = X.order.filter((id) => byId.has(id));
  const idx = new Map(data.anchors.map((A, i) => [A.id, i]));
  const keep = lis(order.map((id) => idx.get(id)));
  for (let k = 0; k < order.length; k++) {
    if (keep.has(k)) continue;
    const A = byId.get(order[k]);
    if (A.k === 'fn') continue;
    stats.moved++;
    note(A, 0, 'In Word this paragraph was moved; Rikuy kept it where it was (move it in the source if you agree).');
  }

  // ---- the edits, carried onto the source as it is now ----
  const out = new Map();
  const conflicts = [];
  const applied = [];
  const byFile = new Map();
  for (const e of edits) { if (!byFile.has(e.f)) byFile.set(e.f, []); byFile.get(e.f).push(e); }
  for (const [f, list] of byFile) {
    const b = base.get(f), c = cur.get(f);
    if (c == null) { for (const e of list) conflicts.push({ ...e, why: 'the file is no longer in the project' }); continue; }
    const chg = b === c ? [] : changes(b, c, f);
    list.sort((x, y) => x.s - y.s || x.e - y.e);
    // two edits of the same range (a block deleted and an edit inside it): the first wins
    const clean = [];
    for (const e of list) { const L = clean[clean.length - 1]; if (L && (e.s < L.e || (e.s === L.s && e.e === L.e && e.s === e.e && L.t === e.t))) continue; clean.push(e); }
    const placed = [];
    for (const e of clean) {
      const r = rebase(e, chg);
      if (r == null) { conflicts.push({ ...e, cur: null }); continue; }
      placed.push({ ...e, s: r.s, e: r.e });
    }
    let t = c;
    for (const e of placed.sort((x, y) => y.s - x.s)) { t = t.slice(0, e.s) + e.t + t.slice(e.e); applied.push(e); }
    out.set(f, { text: t, placed, chg });
  }
  stats.applied = applied.length;
  stats.conflicts = conflicts.length;

  // ---- comments: Word's, then what could not be placed, at their place in the new text ----
  const pos = (f, p) => {
    if (p == null) return null;
    const F = out.get(f);
    const b = base.get(f);
    const chg = F ? F.chg : (b === cur.get(f) ? [] : changes(b, cur.get(f) || '', f));
    let q = p;
    for (const c of chg) { if (c.ae <= p) q += (c.be - c.bs) - (c.ae - c.as); else if (c.as < p) { q = c.bs; break; } }
    if (F) for (const e of F.placed) if (e.e <= q) q += e.t.length - (e.e - e.s); else if (e.s < q) q = e.s + e.t.length;
    return q;
  };
  const text = (f) => (out.get(f) || { text: cur.get(f) }).text;
  const set = (f, t) => { const F = out.get(f); if (F) F.text = t; else out.set(f, { text: t, placed: [], chg: [] }); };
  const existing = (f) => findComments(text(f), f);
  const addComment = (f, p, o) => {
    if (p == null || text(f) == null) return false;
    const ed = commentEdit(text(f), Math.max(0, Math.min(p, text(f).length)), o);
    if (!ed) return false;
    set(f, text(f).slice(0, ed.s) + ed.t + text(f).slice(ed.e));
    return true;
  };
  // a Word comment is new unless the same words by the same person are a comment or reply here
  // already (Rikuy's own comments go to Word and come back with the file)
  const known = (f, w, body) => existing(f).some((th) => (th.who === w && th.body === body) || th.replies.some((r) => r.who === w && r.body === body));
  const placedC = new Map();
  for (const c of comments.sort((x, y) => (x.parent ? 1 : 0) - (y.parent ? 1 : 0))) {
    const w = c.who.replace(/[()]/g, '') || who;
    if (known(c.f, w, c.body.replace(/\s+/g, ' ').trim())) { placedC.set(c.id, c); continue; }
    const p = pos(c.f, c.p);
    if (c.parent && placedC.has(c.parent)) {
      // a reply: under its thread, found again by its words
      const par = placedC.get(c.parent);
      const th = existing(c.f).find((t) => t.body === par.body.replace(/\s+/g, ' ').trim() && t.who === (par.who.replace(/[()]/g, '') || who));
      if (th) {
        const ed = commentEdit(text(c.f), th.e - 1, { who: w, body: c.body, reply: true });
        if (ed) { set(c.f, text(c.f).slice(0, ed.s) + ed.t + text(c.f).slice(ed.e)); stats.comments++; placedC.set(c.id, c); continue; }
      }
    }
    if (addComment(c.f, p, { who: w, quote: c.quote, body: c.body })) { stats.comments++; placedC.set(c.id, c); }
  }
  for (const e of conflicts) {
    const was = base.get(e.f).slice(e.s, e.e);
    const body = e.why ? 'From Word, not applied (' + e.why + ').' : e.kind === 'math' ? 'In Word this equation became ' + e.t + ' ; not applied, because it changed here since the export.' : 'In Word: ' + (was ? show(plain(was)) + ' became ' : 'added ') + show(plain(e.t)) + '. Not applied: this text changed here since the export.';
    addComment(e.f, pos(e.f, e.s), { who, quote: plain(was), body });
  }
  for (const n of notes) addComment(n.f, pos(n.f, n.p), { who, quote: n.quote, body: n.body });

  const files = new Map();
  for (const [f, F] of out) if (F.text !== cur.get(f)) files.set(f, F.text);
  return { files, applied, conflicts, notes, stats, who };

  // the source edits for one block's text change
  function textEdits(A, o, n, objs, hs, items = []) {
    if (!hs.length && o !== n) hs = textHunks(o, n);
    const src = base.get(A.f);
    const res = [];
    for (const h of hs) {
      // a new Word list paragraph in a list item's text starts an \item of its own
      let newText = n.slice(h.A, h.B);
      if (A.k === 'li') for (const p of [...items].sort((x, y) => y - x)) if (p > h.A && p <= h.B) newText = newText.slice(0, p - h.A) + ITEM + newText.slice(p - h.A);
      const newObjs = objs.filter((x) => x.at >= h.A && x.at < h.B);
      // what the old characters are: source characters, whole atoms, generated text
      const srcR = [];
      const atomsHit = new Map();
      let gen = 0;
      for (let i = h.a; i < h.b; i++) {
        const s = srcOf(A, i);
        if (s) { if (s[1] > s[0]) srcR.push(s); continue; }
        const ai = atomOf(A, i);
        if (ai != null) atomsHit.set(ai, (atomsHit.get(ai) || 0) + 1);
        else if (!/\s/.test(o[i])) gen++;
      }
      // an atom only partly in the change (a citation's text edited) cannot be edited from Word
      let partial = false;
      for (const [ai, cnt] of atomsHit) {
        let total = 0;
        for (let i = 0; i < o.length; i++) if (atomOf(A, i) === ai) total++;
        const at = data.atoms[ai];
        if (cnt < total || !at || at.ro || at.s == null) partial = true;
      }
      if (gen || partial) {
        // said with the whole of each atom touched: “Knuth (1984)” became “Knuth (1985)”, not 4 to 5
        let lo = h.a, hi = h.b;
        for (let i = 0; i < o.length; i++) if (atomsHit.has(atomOf(A, i))) { lo = Math.min(lo, i); hi = Math.max(hi, i + 1); }
        const was = o.slice(lo, hi), now = n.slice(h.A - (h.a - lo), h.B + (hi - h.b));
        note(A, lo, (gen ? 'In Word, text Rikuy generates (a number, a heading\'s label) was changed: ' : 'In Word, a citation, reference or other generated item was changed: ') + show(was) + ' became ' + show(now) + '. Not applied.', plain(was));
        continue;
      }
      for (const [ai] of atomsHit) { const at = data.atoms[ai]; srcR.push([at.s, at.e]); }
      srcR.sort((x, y) => x[0] - y[0]);
      // a new paragraph typed after a heading, a caption or an equation goes after its command
      if (h.a === h.b && h.a === o.length && /^\n\n/.test(newText) && !PARA_OK.has(A.k) && A.after != null) {
        res.push({ f: A.f, s: A.after, e: A.after, t: '\n\n' + texFor(newText.replace(/^\n+/, ''), newObjs, h.A, { prev: ' ', paras: true, obj: objTex(A) }), kind: 'insert' });
        stats.inserted++;
        continue;
      }
      let at = srcR.length ? srcR[0][0] : insertAt(A, h.a);
      if (at == null) { note(A, h.a, 'Added in Word, not placed: ' + show(newText)); continue; }
      const ctx = (p) => ({ prev: p > 0 ? src[p - 1] : ' ', paras: PARA_OK.has(A.k), list: A.k === 'li', obj: objTex(A) });
      let t = texFor(newText, newObjs, h.A, ctx(at));
      if (/^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
      if (!srcR.length) { res.push({ f: A.f, s: at, e: at, t, kind: 'insert' }); continue; }
      const S = srcR[0][0], E = Math.max(...srcR.map((r) => r[1]));
      if (isBalanced(src, S, E)) { res.push({ f: A.f, s: S, e: E, t, kind: newText ? 'replace' : 'delete' }); continue; }
      // across markup: only the visible characters go, so every brace stays; the new text takes
      // the place of the first of them, as typing over a selection on the page does
      const merged = [];
      for (const r of srcR) { const L = merged[merged.length - 1]; if (L && r[0] <= L[1]) L[1] = Math.max(L[1], r[1]); else merged.push([r[0], r[1]]); }
      merged.forEach((r, k) => res.push({ f: A.f, s: r[0], e: r[1], t: k === 0 ? t : '', kind: 'replace' }));
    }
    return res;
  }
}

// a deleted paragraph goes with the space after it, so no blank lines pile up
function delBlock(src, A) {
  let e = A.e;
  while (e < src.length && /[ \t]/.test(src[e])) e++;
  if (src[e] === '\n') { e++; while (e < src.length && /[ \t]/.test(src[e])) e++; if (src[e] === '\n') e++; }
  return { f: A.f, s: A.s, e, t: '', kind: 'delete', what: 'paragraph' };
}

// an edit of the exported source carried onto the current one; null where the owner changed the
// same text since (or inserted at the same point)
export function rebase(ed, chg) {
  let d = 0;
  for (const c of chg) {
    const ins = ed.s === ed.e, cins = c.as === c.ae;
    if (ed.s < c.ae && c.as < ed.e) return null;
    if (ins && c.as < ed.s && ed.s < c.ae) return null;
    if (ins && cins && c.as === ed.s) return null;
    if (cins && ed.s < c.as && c.as < ed.e) return null;
    if (c.ae <= ed.s) d += (c.be - c.bs) - (c.ae - c.as);
  }
  return { s: ed.s + d, e: ed.e + d };
}

// longest increasing subsequence: the positions that kept their order
function lis(a) {
  const tails = [], prev = new Array(a.length).fill(-1), at = [];
  for (let i = 0; i < a.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[tails[m]] < a[i]) lo = m + 1; else hi = m; }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
    at[lo] = i;
  }
  const keep = new Set();
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) keep.add(k);
  return keep;
}

const plain = (t) => String(t).replace(/\\[A-Za-z]+\*?\s*/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

// ---- equations ---------------------------------------------------------------------------------

// TeX that pandoc read from a stranger's equation goes into math mode in the source. pandoc escapes
// what an equation's text says (\backslash, \$), so this only ever refuses a formula pandoc would not
// write: one that leaves math mode, or reaches files or the shell. Defense in depth; null if so.
const MATH_ENV = /^(aligned|alignedat|gathered|split|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|cases|smallmatrix|subarray)\*?$/;
export function safeMath(t) {
  if (typeof t !== 'string') return null;
  if (/(^|[^\\])(\\\\)*\$/.test(t) || /\\[()[\]]/.test(t)) return null;
  // ^^5c is TeX's own spelling of a backslash: no command name can be trusted once it appears
  if (/\^\^/.test(t)) return null;
  if (/\\(write|input|include|includegraphics|includepdf|openout|openin|immediate|catcode|def|edef|gdef|xdef|let|newcommand|renewcommand|providecommand|special|directlua|latelua|csname|usepackage|RequirePackage|documentclass|read|newwrite|newread|ShellEscape|scantokens|uccode|lccode|expandafter|href|url|verb)(?![A-Za-z])/.test(t)) return null;
  for (const m of t.matchAll(/\\(?:begin|end)\s*\{([^}]*)\}/g)) if (!MATH_ENV.test(m[1])) return null;
  return t;
}

// the numbers export puts after a numbered formula (\qquad (n)), as pandoc reads them back
export function stripNumbers(t, tags) {
  let s = t;
  for (const n of tags || []) {
    const q = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // after the spacing export put there, or (LibreOffice drops the spacing) at a row's end
    s = s.replace(new RegExp('\\s*(?:\\\\q?quad\\s*)+\\(\\s*' + q + '\\s*\\)|\\s*\\(\\s*' + q + '\\s*\\)(?=\\s*(?:\\\\\\\\|\\\\end\\{|$))', 'g'), '');
  }
  return s.trim();
}
// TeX compared as tokens, spacing aside
// (spacing, fonts, braces and \left and \right aside: LibreOffice rewrites every equation it
// opens, dropping \mathbb and spacing, and a formula nobody touched must not count as edited)
export const canon = (t) => core(mtoks(t)).map((x) => norm(x.t)).join(' ');

// TeX texmath writes and TeX people write, told apart only by spelling
const SAME = { '\\lbrack': '[', '\\rbrack': ']', '\\lbrace': '\\{', '\\rbrace': '\\}', '\\left': '', '\\right': '', '\\bigl': '', '\\bigr': '', '\\Bigl': '', '\\Bigr': '', '\\biggl': '', '\\biggr': '', '\\Biggl': '', '\\Biggr': '', '\\big': '', '\\Big': '', '\\bigg': '', '\\Bigg': '', '\\mathrm': '', '\\,': '', '\\;': '', '\\!': '', '\\ ': '', '\\widehat': '\\hat', '\\widetilde': '\\tilde', '\\leq': '\\le', '\\geq': '\\ge', '\\neq': '\\ne', '\\to': '\\rightarrow', '\\mathbb': '', '\\mathbf': '', '\\mathit': '', '\\mathcal': '', '\\mathsf': '', '\\mathtt': '', '\\mathfrak': '', '\\boldsymbol': '', '\\bm': '', '\\quad': '', '\\qquad': '', '\\:': '', '\\displaystyle': '', '\\limits': '' };
function mtoks(s) {
  const out = [];
  const re = /\\[A-Za-z]+|\\.|%[^\n]*|\s+|[\s\S]/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[0];
    if (/^\s|^%/.test(t)) continue;
    out.push({ t, s: m.index, e: m.index + t.length });
  }
  return out;
}
const norm = (t) => (t in SAME ? SAME[t] : t);
const core = (list) => list.filter((x) => x.t !== '{' && x.t !== '}' && norm(x.t) !== '');

// A changed equation's new source. pandoc's TeX for the old and the new Word equation differ in
// a few tokens; those tokens, with a little context on either side, are found in the original
// source (spelling differences such as \lbrack for [ and braces aside) and replaced there, so the
// rest of the formula keeps its macros and spacing. Where that cannot be done with certainty, the
// formula is replaced by pandoc's TeX, its \label commands kept.
export function mathPatch(orig, was, now) {
  const W = core(mtoks(was)), N = core(mtoks(now)), O = core(mtoks(orig));
  let p = 0;
  while (p < W.length && p < N.length && norm(W[p].t) === norm(N[p].t)) p++;
  let q = 0;
  while (q < W.length - p && q < N.length - p && norm(W[W.length - 1 - q].t) === norm(N[N.length - 1 - q].t)) q++;
  // the changed tokens of the old formula and their context, sought in the original
  for (const ctx of [3, 2, 1]) {
    const L = W.slice(Math.max(0, p - ctx), p).map((x) => norm(x.t));
    const R = W.slice(W.length - q, Math.min(W.length, W.length - q + ctx)).map((x) => norm(x.t));
    const mid = W.slice(p, W.length - q).map((x) => norm(x.t));
    const pat = [...L, ...mid, ...R];
    if (!pat.length) break;
    const hits = [];
    for (let i = 0; i + pat.length <= O.length; i++) {
      let ok = true;
      for (let k = 0; k < pat.length && ok; k++) ok = norm(O[i + k].t) === pat[k];
      if (ok) hits.push(i);
    }
    if (hits.length !== 1) continue;
    const i = hits[0];
    const oS = i + L.length, oE = i + L.length + mid.length; // tokens of O to replace: [oS, oE)
    const newMid = N.slice(p, N.length - q).map((x) => x.t);
    let s, e;
    if (oE > oS) { s = O[oS].s; e = O[oE - 1].e; }
    else { s = e = L.length ? O[i + L.length - 1].e : O[oS].s; }
    let rep = newMid.join('');
    // a control word must not run into a letter after it
    rep = newMid.map((t, k) => (/^\\[A-Za-z]+$/.test(t) && /^[A-Za-z]/.test(newMid[k + 1] || '') ? t + ' ' : t)).join('');
    if (/^\\[A-Za-z]+$/.test(newMid[newMid.length - 1] || '') && /^[A-Za-z]/.test(orig.slice(e))) rep += ' ';
    if (/\\[A-Za-z]+$/.test(orig.slice(0, s)) && /^[A-Za-z]/.test(rep)) rep = ' ' + rep;
    // a replaced token in braces of its own (x^2 vs x^{2}) keeps the original's grouping
    return orig.slice(0, s) + rep + orig.slice(e);
  }
  const labels = (orig.match(/\\label\s*\{[^}]*\}/g) || []).join(' ');
  let body = now.replace(/^\\begin\{aligned\}\s*([\s\S]*?)\s*\\end\{aligned\}$/, '$1');
  if (!/\\\\/.test(orig)) body = now;
  return body + (labels ? ' ' + labels : '');
}

// ---- what the worker read, on the page's side --------------------------------------------------

// every equation of a read file, in the order the worker converted them
export function allObjs(X) {
  const out = [];
  for (const R of [X.pre, ...X.regions.values(), ...X.orphans, ...[...X.notes.values()].map((n) => n.pre)]) for (const o of R.objs) if (o.k === 'math') out.push(o);
  return out;
}

// the inverse of readDocx's packing, page side: objects found again by identity for mathTex
export function unpackRead(x) {
  const X = { regions: new Map(x.regions), order: x.order, pre: x.pre, orphans: x.orphans, notes: new Map(x.notes), comments: new Map(x.comments), authors: x.authors, tracked: x.tracked, dupes: x.dupes, mathTex: new Map() };
  const objs = allObjs(X);
  objs.forEach((o, i) => { if (x.mathTex[i] != null) X.mathTex.set(o, x.mathTex[i]); });
  return X;
}

// ---- the data a .docx carries ------------------------------------------------------------------

// What the export keeps in the file (customXml): the source as it was, every block's text and map
export function exportData({ name, main, files, anchors, atoms, t, sig, app }) {
  return {
    rikuy: 1, app: app || 'Rikuy', t: t || Date.now(), name, main, sig: sig || '',
    files: [...files].filter(([n, x]) => typeof x === 'string'),
    anchors, atoms
  };
}
