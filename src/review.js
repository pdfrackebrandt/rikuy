// Review: the versions of a project (kept as one works, named ones too, compared and restored),
// the changes since a version with Accept and Reject, and the marks of those changes on the
// pages, as Word's Track Changes draws them. The comments and the copy a coauthor sends back are
// src/collab.js's. The methods join App's prototype.

import { $, mk, mkBtn, store, PREFS, textSig, when } from './ui/dom.js';
import { atomOfEl } from './editor.js';
import { changes, spacingOnly, hunks, wordDiff } from './diff.js';
import { commentOnly } from './share.js';
import { kvGet, kvPut, decodeText, snapAdd, snapAll, snapFiles, snapDel, snapPrune } from './store.js';

// steps never absorbed into the base (rvAbsorbs)
const NO_ABSORB = new Set(['reject', 'merge', 'word', 'other-tab', 'restore', 'accept']);

// An edit (text p becoming c) put into the base b where it touches no change waiting between b
// and p. The edit's pieces (diff.js changes of p and c, walked part by part) are each tested
// against the waiting changes' own word operations, never their merged ranges or whole lines: a
// piece overlapping one stays part of that change, every other goes into b at its place there.
// The waiting changes are found as line hunks first, kept from one keystroke to the next (shifted
// by what went in), and read word by word only in the hunks an edit touches: a 127 kB file with
// 1,500 changes waiting costs a keystroke about what an empty one does. Pure, tested in
// test/review.test.mjs.
const overlaps = (a1, a2, b1, b2) => (a1 === a2 && b1 === b2 ? a1 === b1 : a1 === a2 ? b1 < a1 && a1 < b2 : b1 === b2 ? a1 < b1 && b1 < a2 : a1 < b2 && b1 < a2);
let hunkCache = null;
// (for the tests: the next call reads the hunks afresh)
export function absorbFresh() { hunkCache = null; }
// (a deletion and an insertion with nothing between them are one piece: a word replaced)
function pieces(chs) {
  const out = [];
  for (const ch of chs) {
    let ap = ch.as, cur = null;
    for (const [op, v] of ch.parts) {
      if (op === ' ') { ap += v.length; cur = null; continue; }
      if (!cur) { cur = { s: ap, e: ap, t: '' }; out.push(cur); }
      if (op === '-') { ap += v.length; cur.e = ap; } else cur.t += v;
    }
  }
  return out;
}
// a hunk's waiting operations, word by word: each with its range in p (an insertion's text, or
// the point a deletion was) and what it adds to b's length against p's
function hunkOps(h) {
  if (h.ops) return h.ops;
  const out = [];
  let ap = h.as, bp = h.bs;
  for (const [op, v] of wordDiff(h.a, h.b)) {
    if (op === ' ') { ap += v.length; bp += v.length; } else if (op === '-') { out.push({ ps: bp, pe: bp, d: v.length }); ap += v.length; } else { out.push({ ps: bp, pe: bp + v.length, d: -v.length }); bp += v.length; }
  }
  return (h.ops = out);
}
export function absorbText(b, p, c) {
  if (b === p) { hunkCache = null; return c; }
  const H0 = hunkCache && hunkCache.b === b && hunkCache.p === p ? hunkCache.H : hunks(b, p);
  const done = [];
  let safe = true;
  for (const s of pieces(changes(p, c, ''))) {
    // the hunks before it (their whole difference) and the one it touches, if any
    let d = 0, hit = -1;
    for (let i = 0; i < H0.length; i++) {
      const h = H0[i];
      if (h.be < s.s || (h.be === s.s && s.e > s.s)) { d += h.a.length - (h.be - h.bs); continue; }
      if (h.bs > s.e || (h.bs === s.e && s.e > s.s)) break;
      hit = i;
      break;
    }
    let abs = true;
    if (hit >= 0) {
      const h = H0[hit], ops = hunkOps(h);
      if (s.e > h.be || s.s < h.bs) safe = false;
      if (ops.some((o) => overlaps(s.s, s.e, o.ps, o.pe))) abs = false;
      else for (const o of ops) if (o.pe <= s.s && !(o.ps === o.pe && o.ps === s.s && s.s === s.e)) d += o.d;
    }
    done.push({ ...s, bs: s.s + d, hit, abs, dd: s.t.length - (s.e - s.s) });
  }
  let t = b;
  for (const e of done.slice().sort((x, y) => y.bs - x.bs)) if (e.abs) t = t.slice(0, e.bs) + e.t + t.slice(e.bs + (e.e - e.s));
  // (the hunks of the next keystroke: these with the pieces in them, the ones after moved; read
  // again where a piece ran past the hunk it touched)
  if (safe) {
    // (a hunk's word operations are kept too and moved with it: a hunk Myers gave up on, one
    // over the whole of a much changed file, is read word by word once, not at every keystroke)
    const H = H0.map((h) => ({ a: h.a, b: h.b, as: h.as, bs: h.bs, be: h.be, line: h.line, ops: h.ops ? h.ops.map((o) => ({ ...o })) : null }));
    const move = (ops, at, dd) => { if (ops) for (const o of ops) if (o.ps >= at) { o.ps += dd; o.pe += dd; } };
    for (const e of done.slice().sort((x, y) => y.s - x.s)) {
      let from;
      if (e.hit >= 0) {
        const h = H[e.hit], lb = e.s - h.bs;
        h.b = h.b.slice(0, lb) + e.t + h.b.slice(lb + (e.e - e.s));
        if (e.abs) { const la = e.bs - h.as; h.a = h.a.slice(0, la) + e.t + h.a.slice(la + (e.e - e.s)); move(h.ops, e.e, e.dd); } else if (h.ops) {
          // (an edit inside a waiting change: that change grows or shrinks by it, the ones after move)
          for (const o of h.ops) {
            if (o.ps >= e.e && !(o.ps === e.s && o.pe === e.s)) { o.ps += e.dd; o.pe += e.dd; }
            else if (o.pe >= e.s && o.pe > o.ps) { o.pe = Math.max(o.ps, o.pe + e.dd); o.d -= e.dd; }
          }
        }
        h.be += e.dd;
        from = e.hit + 1;
      } else { from = H.findIndex((h) => h.bs >= e.e); if (from < 0) from = H.length; }
      for (let i = from; i < H.length; i++) { H[i].bs += e.dd; H[i].be += e.dd; if (e.abs) H[i].as += e.dd; move(H[i].ops, -Infinity, e.dd); }
    }
    hunkCache = { b: t, p: c, H };
  } else hunkCache = null;
  return t;
}

// ---- who made a change ------------------------------------------------------------------------
// Changes are one difference between the text and the base, so they carry no author by
// themselves. Each file keeps a layer of who wrote what since: the ranges each step inserted
// (in the text as it is now) and the places it deleted, with the step's author (the name in
// AutoCorrect Options, or the coauthor whose copy came back in a link). A step's edit moves the
// layer along (authorEdit) and adds its own pieces; a change is then the author of the pieces
// it holds, and a change two people's pieces make up is cut in two (byAuthor). Kept with the base,
// for the text it was made on. Pure, tested in test/review.test.mjs.
const MAX_SEGS = 20000;
// segs: [{s, e, who}] sorted by s (e === s: a deletion there); one edit of the old text's
// [s, e) by text n characters long, made by who
// (a deletion keeps the text it took, t, so that where two people's deletions meet each is told by
// its own words, byAuthor; capped, a longer one is told by its place alone)
const MAX_DEL = 2000;
export function authorEdit(segs, s, e, n, who, del) {
  const d = n - (e - s), out = [], inner = [], tail = [];
  for (const g of segs) {
    if (g.e < s || (g.e === s && (g.s < s || n === 0 || e > s))) { out.push(g); continue; }
    // (a deletion just after the deleted text: it follows it, at the same place when nothing is typed)
    if (g.s === e && g.e === e && e > s && n === 0) { tail.push({ ...g, s, e: s }); continue; }
    if (g.s > e || (g.s === e && e > s)) { out.push({ ...g, s: g.s + d, e: g.e + d }); continue; }
    // (a range the edit cuts: what is left of it before and after)
    if (g.s < s) out.push({ s: g.s, e: s, who: g.who });
    if (g.e > e) out.push({ s: s + n, e: g.e + d, who: g.who });
    else if (g.s === g.e && g.s >= s && g.s <= e && e === s) out.push({ ...g, s: g.s + (g.s > s ? d : 0), e: g.s + (g.s > s ? d : 0) });
    // (an earlier deletion inside the text now deleted: kept, in its place among this one's words)
    else if (g.s === g.e && e > s) inner.push(g);
  }
  if (n > 0) out.push({ s, e: s + n, who });
  if (e > s) {
    const T = typeof del === 'string' && del.length === e - s ? del : null;
    const pt = (t, w) => { const g = { s, e: s, who: w }; if (t != null && t.length <= MAX_DEL) g.t = t; return g; };
    let off = 0;
    for (const g of inner) {
      if (T && g.s - s > off) out.push(pt(T.slice(off, g.s - s), who));
      out.push({ ...g, s, e: s });
      if (T) off = g.s - s;
    }
    if (!T || off < T.length || !inner.length) out.push(pt(T ? T.slice(off) : null, who));
    out.push(...tail);
  } else out.push(...tail);
  // (stable: points at one place stay in the order their texts stood)
  out.sort((a, b) => a.s - b.s || a.e - b.e);
  // (one author's neighbouring ranges are one; their deletions at one place, one text)
  const m = [];
  for (const g of out) {
    const L = m[m.length - 1];
    if (L && L.who === g.who && L.e === g.s && g.e > g.s && L.e > L.s) L.e = g.e;
    else if (L && L.who === g.who && L.s === g.s && L.e === g.e && g.e === g.s) { if (L.t != null && g.t != null && L.t.length + g.t.length <= MAX_DEL) L.t += g.t; else delete L.t; }
    else if (L && L.who === g.who && L.s === g.s && L.e === g.e) continue;
    else m.push(g.e === g.s ? { ...g } : g);
  }
  return m.length > MAX_SEGS ? m.slice(m.length - MAX_SEGS) : m;
}
// the edits that make cur of prev, in prev's offsets from the end backwards: one span where the
// two differ (a keystroke), or word by word where a step replaced much at once (a merge)
export function editSpans(prev, cur, fine) {
  let a = 0;
  const n = Math.min(prev.length, cur.length);
  while (a < n && prev.charCodeAt(a) === cur.charCodeAt(a)) a++;
  let b = 0;
  while (b < n - a && prev.charCodeAt(prev.length - 1 - b) === cur.charCodeAt(cur.length - 1 - b)) b++;
  const one = [{ s: a, e: prev.length - b, n: cur.length - b - a }];
  if (!fine || (one[0].e - one[0].s < 200 && one[0].n < 200)) return one;
  const out = [];
  for (const c of changes(prev, cur, '')) {
    let ap = c.as, bp = c.bs, run = null;
    for (const [op, v] of c.parts) {
      if (op === ' ') { ap += v.length; bp += v.length; run = null; continue; }
      if (!run) { run = { s: ap, e: ap, n: 0 }; out.push(run); }
      if (op === '-') { ap += v.length; run.e = ap; } else { run.n += v.length; bp += v.length; }
    }
  }
  return out.reverse();
}
// a change's authors, and the change cut where its pieces' authors differ: [{...c, who}]
export function byAuthor(c, segs, now) {
  if (!segs || !segs.length) return [{ ...c, who: '' }];
  const whoAt = (op, p, len) => {
    if (op === '+') { for (const g of segs) { if (g.s >= p + len) break; if (g.e > g.s && g.s < p + len && p < g.e) return g.who; } return ''; }
    let best = null;
    for (const g of segs) { if (g.s > p + 2) break; if (g.e === g.s && Math.abs(g.s - p) <= 2 && (!best || Math.abs(g.s - p) < Math.abs(best.s - p))) best = g; }
    return best ? best.who : '';
  };
  // (a deletion where marks with their texts stand: cut into each one's words, the rest of it going
  // with the piece before it; review M4)
  const marks = segs.filter((g) => g.e === g.s && g.t && g.s >= c.bs - 2 && g.s <= c.be + 2);
  const used = new Set();
  const parts = [];
  for (const [op, v, p] of c.parts) {
    if (op !== '-' || !marks.length) { parts.push([op, v, p, op === ' ' ? null : whoAt(op, p, v.length)]); continue; }
    const own = new Array(v.length).fill(null);
    for (const g of [...marks].sort((x, y) => y.t.length - x.t.length)) {
      if (used.has(g)) continue;
      for (const t of [g.t, g.t.trim()]) {
        if (!t) continue;
        let i = v.indexOf(t);
        while (i >= 0 && own.slice(i, i + t.length).some((x) => x)) i = v.indexOf(t, i + 1);
        if (i >= 0) { own.fill(g.who || ' ', i, i + t.length); used.add(g); break; }
      }
    }
    if (!own.some((x) => x)) { parts.push([op, v, p, whoAt(op, p, v.length)]); continue; }
    // (letters no mark holds: the piece before them, else the one after)
    for (let i = 0; i < own.length; i++) if (!own[i]) own[i] = i ? own[i - 1] : own.find((x) => x);
    let i = 0;
    while (i < v.length) { let j = i; while (j < v.length && own[j] === own[i]) j++; parts.push([op, v.slice(i, j), p, own[i] === ' ' ? '' : own[i]]); i = j; }
  }
  // (a deletion no step is known for, beside an insertion: one replacement, the insertion's author)
  for (let i = 0; i < parts.length; i++) if (parts[i][0] === '-' && !parts[i][3]) { const n = parts[i + 1] && parts[i + 1][0] === '+' ? parts[i + 1] : parts[i - 1] && parts[i - 1][0] === '+' ? parts[i - 1] : null; if (n) parts[i][3] = n[3]; }
  const whos = new Set(parts.filter((x) => x[3] != null).map((x) => x[3]));
  if (whos.size <= 1) return [{ ...c, who: [...whos][0] || '' }];
  // (one person's deleted word beside another's typed one, a space after both: each takes that
  // space, the typed word first, so that each is a whole word to accept or reject by itself)
  // (now: the text now, whose letters after the change are the base's too)
  if (typeof now === 'string' && now.slice(c.bs, c.be) === c.b && c.be < now.length) parts.push([' ', now[c.be], c.be, null, true]);
  for (let i = 0; i + 2 < parts.length; i++) {
    const [x, y, z] = [parts[i], parts[i + 1], parts[i + 2]];
    if (x[0] === ' ' || y[0] === ' ' || x[0] === y[0] || x[3] === y[3] || z[0] !== ' ' || !/^\s/.test(z[1])) continue;
    const ch = z[1][0], ins = x[0] === '+' ? x : y, del = x[0] === '-' ? x : y;
    parts.splice(i, 3, ['+', ins[1] + ch, ins[2], ins[3]], ['-', del[1] + ch, del[2], del[3]], ...(z[1].length > 1 ? [[' ', z[1].slice(1), z[2], null]] : []));
    // (the letter after the change taken in: the change ends a letter later in both texts)
    if (z[4]) { c = { ...c, a: c.a + ch, b: c.b + ch, ae: c.ae + 1, be: c.be + 1 }; }
    i++;
  }
  if (parts.length && parts[parts.length - 1][4]) parts.pop();
  // cut at the unchanged words between pieces of different authors
  const out = [];
  let cur = null, ap = c.as, bp = c.bs, line = c.line;
  const nl = (t) => (t.match(/\n/g) || []).length;
  for (const [op, v, , who] of parts) {
    if (op === ' ') {
      if (cur) { cur.pend = (cur.pend || '') + v; }
      ap += v.length; bp += v.length; line += nl(v);
      continue;
    }
    if (cur && cur.who !== who) { delete cur.pend; out.push(cur); cur = null; }
    if (cur && cur.pend) { cur.a += cur.pend; cur.b += cur.pend; cur.parts.push([' ', cur.pend, bp - cur.pend.length]); delete cur.pend; }
    if (!cur) cur = { f: c.f, as: ap, ae: ap, bs: bp, be: bp, a: '', b: '', line, parts: [], who };
    if (op === '-') { cur.a += v; cur.parts.push(['-', v, bp]); ap += v.length; } else { cur.b += v; cur.parts.push(['+', v, bp]); bp += v.length; line += nl(v); }
    cur.ae = ap; cur.be = bp;
  }
  if (cur) { delete cur.pend; out.push(cur); }
  return out;
}

export const review = {
  // ---- versions and changes ---------------------------------------------------------
  // The project's text is kept as a version every few minutes of editing, when the tab is
  // left, when a .zip is saved, and before anything replaces the text. The Changes tab
  // compares the text with one version (at first, how it was when opened) and lists each
  // change with Accept (keep it) and Reject (put the old text back); "Show on pages" marks
  // the same changes on the typeset pages, like Word's Track Changes.
  isMine(v) { return v.main === this.main && v.name === this.name; },

  // ---- who made a change ----------------------------------------------------------------------
  // a step's author: the coauthor whose copy is coming in, else the name in AutoCorrect Options
  // ('' when none is set: shown as that name once it is, or "You")
  rvWho(kind) { return kind === 'merge' && this.rvBy ? this.rvBy : (this.myName ? this.myName() : ''); },
  rvName(who) { return who || (this.myName && this.myName()) || 'You'; },
  // the layer of who wrote what, moved by a step made, undone or redone (the layer before and
  // after a step is kept with it, so an undo gives its authors back as they were)
  rvAuthorStep(h) {
    const prev = this.trackPrev;
    if (!this.authors) this.authors = new Map();
    if (h && this.redoStack && this.redoStack[this.redoStack.length - 1] === h && h.seg0) { this.authors = new Map(h.seg0); return; }
    if (h && h.seg1 && !h.open && this.hist[this.hist.length - 1] === h) { this.authors = new Map(h.seg1); return; }
    if (!prev) return;
    if (h && !h.seg0) h.seg0 = new Map(this.authors);
    if (h && h.who == null) h.who = this.rvWho(h.kind);
    const who = h ? h.who : this.rvWho('');
    const fine = !!(h && /^(merge|word|other-tab|restore|reject)$/.test(h.kind || ''));
    for (const [f, cur] of this.files) {
      const p = prev.get(f);
      if (p === cur || p == null) continue;
      let segs = this.authors.get(f) || [];
      for (const x of editSpans(p, cur, fine)) segs = authorEdit(segs, x.s, x.e, x.n, who, p.slice(x.s, x.e));
      this.authors.set(f, segs);
    }
    for (const f of [...this.authors.keys()]) if (!this.files.has(f)) this.authors.delete(f);
    if (h) h.seg1 = new Map(this.authors);
  },
  rvAuthorsFrom(r) {
    this.authors = new Map();
    for (const x of Array.isArray(r.authors) ? r.authors : []) {
      if (!Array.isArray(x) || typeof x[0] !== 'string' || !Array.isArray(x[2])) continue;
      const t = this.files.get(x[0]);
      if (t == null || t.length !== x[1]) continue;
      const segs = x[2].filter((g) => g && Number.isInteger(g.s) && Number.isInteger(g.e) && g.s >= 0 && g.e >= g.s && g.e <= t.length && typeof g.who === 'string').slice(0, 20000).map((g) => (g.e === g.s && typeof g.t === 'string' && g.t.length <= 2000 ? { s: g.s, e: g.e, who: g.who.slice(0, 200), t: g.t } : { s: g.s, e: g.e, who: g.who.slice(0, 200) }));
      this.authors.set(x[0], segs);
    }
  },
  // the people whose changes are waiting, in the order they first come
  rvReviewers() {
    const out = [];
    for (const c of this.realChanges ? this.realChanges() : []) { const n = this.rvName(c.who); if (!out.includes(n)) out.push(n); }
    return out;
  },
  rvShown(c) { return !(this.rvHidden && this.rvHidden.has(this.rvName(c.who))); },
  // Display for Review's Original: the page draws the base's text, as it was before the changes,
  // and takes no edit until another view is chosen (rvRefuse); app.js rebuild reads pageFiles
  pageFiles() {
    const B = this.base;
    return B && this.prefs.markup === 'original' && B.files.has(this.main) ? B.files : this.files;
  },
  // edits the page must not make here: any while it shows the Original, and anything but comments
  // in a document a comments only link opened (src/collab.js); true when refused, with the reason
  rvRefuse(edits, kind) {
    if (this.pageFiles() !== this.files && !/^(restore|reject|merge|other-tab)$/.test(kind || '')) {
      this.toast('The page shows the Original, the text before the changes: choose Simple Markup, All Markup or No Markup under Display for Review to edit.', 6000);
      return true;
    }
    if (this.shareCtx && this.shareCtx.role === 'comments' && this.commentsOnlyRefuse(edits)) {
      this.toast(this.shareCtx.by + ' shared this document for comments only: select words and press New Comment (Ctrl+Alt+M). The text itself stays as it is.', 6000);
      return true;
    }
    return false;
  },

  async loadReview() {
    let r = null;
    try { r = this.noIdb ? null : await kvGet('review'); } catch (e) { r = null; }
    if (r && r.main === this.main && r.name === this.name && r.files) { this.base = { t: r.t, label: r.label, id: r.id, files: new Map(r.files), track: !!r.track, n: r.n || 0 }; this.trackPrev = new Map(this.files); this.rvAuthorsFrom(r); }
    else this.setBase({ t: Date.now(), label: 'When opened', files: this.files });
    const mine = (await this.allSnaps()).filter((v) => this.isMine(v));
    if (mine.length) { this.lastSig = mine[0].sig; this.lastSnapT = mine[0].t; }
    await this.snapshot('Session start');
    this.refreshNav();
    if (this.markupOn()) this.marksSoon();
    this.reviewStatus();
  },

  // Images and other binary files are kept per project, so opening a version of another
  // project brings its figures back with its text.
  async stashBinary() {
    if (this.noIdb) return;
    try {
      await kvPut('bin:' + this.name + '|' + this.main, {
        assets: [...this.assetBlobs.entries()], extra: [...this.extra.entries()],
        orig: [...this.orig.entries()].map(([n, o]) => [n, { bytes: o.bytes, enc: o.enc, bom: o.bom }])
      });
    } catch (e) { /* text versions still work */ }
  },

  async loadBinary(name, main) {
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear(); this.extra.clear(); this.orig.clear();
    this.binaryDirty = true;
    if (this.noIdb) return;
    try {
      const bin = await kvGet('bin:' + name + '|' + main);
      if (!bin) return;
      for (const [n, b] of bin.assets || []) this.addAsset(n, b);
      for (const [n, b] of bin.extra || []) this.extra.set(n, b);
      for (const [n, o] of bin.orig || []) this.orig.set(n, { ...o, text: decodeText(o.bytes).text });
    } catch (e) { /* none kept */ }
  },

  // b.track: whether edits are kept as changes from here on (Track Changes); a new base keeps
  // the switch where it was unless it says
  setBase(b) {
    const track = b.track != null ? !!b.track : !!(this.base && this.base.track);
    this.base = { t: b.t, label: b.label || '', id: b.id, files: new Map(b.files), track, n: this.base ? this.base.n || 0 : 0 };
    this.trackPrev = new Map(this.files);
    this.chg = null;
    // (a new base is this tab's own decision: written whatever another tab stored)
    this.saveBase(true, true);
    if (this.reviewStatus) this.reviewStatus();
  },
  // The stored base carries a count (n), one more at every write. A tab writes only over the
  // base it last read: where another tab stored a newer one (its Track Changes switched, an
  // Accept), this tab takes that one instead of writing over it; force: a base of its own.
  saveBase(now, force) {
    clearTimeout(this.baseSaveT);
    const go = async () => {
      this.baseSaveT = null;
      const B = this.base;
      if (this.noIdb || !B) return;
      let r = null;
      try { r = await kvGet('review'); } catch (e) { r = null; }
      const same = r && r.main === this.main && r.name === this.name;
      if (!force && same && (r.n || 0) > (B.n || 0)) { this.rvReloadBase(r); return; }
      B.n = Math.max(B.n || 0, same ? r.n || 0 : 0) + 1;
      // (who wrote what, for the text it was made on: its length says which)
      const authors = [...(this.authors || new Map())].filter(([f]) => this.files.has(f)).map(([f, g]) => [f, this.files.get(f).length, g]);
      kvPut('review', { t: B.t, label: B.label, id: B.id, main: this.main, name: this.name, files: [...B.files.entries()], track: !!B.track, n: B.n, authors }).catch(() => {});
    };
    if (now) return go();
    this.baseSaveT = setTimeout(go, 1500);
    return null;
  },
  // on coming back to this tab: another tab's newer base, if it stored one
  async rvCheckBase() {
    if (this.noIdb || !this.base) return;
    let r = null;
    try { r = await kvGet('review'); } catch (e) { return; }
    if (r && r.main === this.main && r.name === this.name && (r.n || 0) > (this.base.n || 0)) this.rvReloadBase(r);
  },

  // With Track Changes off an edit is no change: the base takes it too (absorbText). Which
  // steps do is decided once, when a step is made (record, src/app.js: h.abs), and kept: its
  // undo and redo do the same later, whatever the switch says then, so a change made with
  // tracking on stays a change through them, and a merge or a Word import never goes into the
  // base by a redo.
  absorbEdit() {
    const B = this.base, prev = this.trackPrev;
    if (!B || !prev) { this.trackPrev = new Map(this.files); return; }
    let moved = false;
    for (const [f, cur] of this.files) {
      const p = prev.get(f);
      if (p === cur) continue;
      const b = B.files.get(f);
      if (p == null) { if (b == null) { B.files.set(f, cur); moved = true; } continue; }
      if (b == null) continue;
      const nb = b === p ? cur : absorbText(b, p, cur);
      if (nb !== b) { B.files.set(f, nb); moved = true; }
    }
    for (const f of prev.keys()) if (!this.files.has(f) && B.files.has(f) && B.files.get(f) === prev.get(f)) { B.files.delete(f); moved = true; }
    this.trackPrev = new Map(this.files);
    if (moved) { this.chg = null; this.saveBase(); }
  },
  // whether a step made now goes into the base: Track Changes off, and an edit of the person's
  // own (a Reject, a merge, a Word import, another tab's text, a restored version never)
  rvAbsorbs(kind) { return !!(this.base && !this.base.track) && !NO_ABSORB.has(kind || ''); },
  // Accept's step, undone and redone: the base before it and after it
  rvBaseStep(h, undo) {
    if (!this.base) return;
    this.base.files = new Map(undo ? h.base0 : h.base1);
    this.chg = null;
    this.trackPrev = new Map(this.files);
    this.saveBase();
  },
  // after another tab's text came in: its base and switch, as that tab left them
  async rvReloadBase(r) {
    if (!r) { try { r = this.noIdb ? null : await kvGet('review'); } catch (e) { r = null; } }
    if (!r || r.main !== this.main || r.name !== this.name || !r.files) return;
    this.base = { t: r.t, label: r.label, id: r.id, files: new Map(r.files), track: !!r.track, n: r.n || 0 };
    this.trackPrev = new Map(this.files);
    this.rvAuthorsFrom(r);
    this.chg = null;
    this.refreshNav();
    if (this.markupOn()) this.marksSoon();
    if (this.reviewStatus) this.reviewStatus();
  },

  noteEdit() {
    // (the step this edit is: made, undone or redone; an edit with no step of its own, as the
    // empty equation taken back, does as the switch says)
    const h = this.rvStep;
    this.rvStep = null;
    this.rvAuthorStep(h);
    const abs = h ? !!h.abs : !!(this.base && !this.base.track);
    if (abs) this.absorbEdit(); else this.trackPrev = new Map(this.files);
    this.pdfStale = true;
    this.pdfSoon();
    this.snapDirty = true;
    this.chg = null;
    const since = Date.now() - (this.lastSnapT || 0);
    if (since > 15 * 60e3) { this.snapshot(''); return; }
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => { if (this.snapDirty) this.snapshot(''); }, Math.max(30e3, 5 * 60e3 - since));
  },

  async snapshot(label, o = {}) {
    const files = [...this.files.entries()];
    const sig = textSig(this.main, files);
    if (!o.force && sig === this.lastSig) { this.snapDirty = false; return null; }
    const v = { t: Date.now(), label: label || '', named: !!o.named, name: this.name, main: this.main, sig, files };
    // (a version shared by a link: the link's name and what it allows, for the copy sent back)
    if (o.share) v.share = o.share;
    this.lastSig = sig; this.lastSnapT = v.t; this.snapDirty = false;
    clearTimeout(this.snapTimer);
    try {
      if (this.noIdb) throw new Error('no storage');
      v.id = await snapAdd(v);
      snapPrune(80).then((n) => { if (n) this.snapList = null; }).catch(() => {});
    } catch (e) {
      v.id = 'm' + v.t;
      this.memSnaps.push(v);
      const old = this.memSnaps.findIndex((x) => !x.named);
      if (this.memSnaps.length > 30 && old >= 0) this.memSnaps.splice(old, 1);
    }
    this.snapList = null;
    if (document.body.classList.contains('nav-on') && this.navTab === 'changes') this.refreshNav();
    return v;
  },

  async allSnaps() {
    if (this.snapList) return this.snapList;
    let list = [];
    if (!this.noIdb) { try { list = await snapAll(); } catch (e) { list = []; } }
    this.snapList = [...list, ...this.memSnaps.map(({ files, ...m }) => m)].sort((a, b) => b.t - a.t);
    return this.snapList;
  },

  async versionFiles(v) {
    const m = this.memSnaps.find((x) => x.id === v.id);
    if (m) return m.files;
    try { return await snapFiles(v.id); } catch (e) { return null; }
  },

  currentChanges() {
    if (!this.base) return [];
    const C = this.chg;
    if (C && C.base === this.base && C.files.size === this.files.size && [...this.files].every(([n, t]) => C.files.get(n) === t)) return C.list;
    const list = [];
    const A = this.authors;
    for (const [n, t] of this.files) {
      const a = this.base.files.get(n) ?? '';
      if (a !== t) for (const c of changes(a, t, n)) list.push(...byAuthor(c, A && A.get(n), t));
    }
    this.chg = { base: this.base, files: new Map(this.files), list };
    return list;
  },

  acceptChanges(cs) {
    cs = cs.filter((c) => (this.base.files.get(c.f) ?? '').slice(c.as, c.ae) === c.a && this.src(c.f).slice(c.bs, c.be) === c.b);
    if (!cs.length) { this.refreshNav(); return; }
    const files = new Map(this.base.files);
    const byF = new Map();
    for (const c of cs) { if (!byF.has(c.f)) byF.set(c.f, []); byF.get(c.f).push(c); }
    for (const [f, list] of byF) {
      let t = files.get(f) ?? '';
      for (const c of list.sort((x, y) => y.as - x.as)) t = t.slice(0, c.as) + c.b + t.slice(c.ae);
      files.set(f, t);
    }
    // (a step of history of its own, the base before and after: Ctrl+Z takes an Accept back)
    const base0 = new Map(this.base.files);
    this.setBase({ ...this.base, files });
    this.closeGroup();
    this.hist.push({ kind: 'accept', files: [], base0, base1: new Map(files), caretBefore: null, caretAfter: null, time: Date.now(), open: false, before: null });
    if (this.hist.length > 400) this.hist.shift();
    this.redoStack = [];
    this.updateUndoUI();
    this.refreshNav();
    if (this.markupOn()) this.marksSoon();
  },

  rejectChanges(cs, label) {
    // the list may be a moment behind the text: act only on changes still exactly there
    cs = cs.filter((c) => this.src(c.f).slice(c.bs, c.be) === c.b);
    if (!cs.length) { this.refreshNav(); return; }
    if (cs.length > 1) this.snapshot(label || 'Before rejecting changes', { force: true });
    this.closeGroup();
    this.commit(cs.map((c) => ({ f: c.f, s: c.bs, e: c.be, t: c.a })), null, 'reject');
    this.closeGroup();
    this.refreshNav();
    if (cs.length === 1) this.goTo(cs[0].f, cs[0].bs);
  },

  // the pane's "Show changes on the pages": All Markup or No Markup (Display for Review)
  setMarks(on) { this.setMarkup(on ? 'all' : 'none'); },

  async compareWith(v) {
    const files = await this.versionFiles(v);
    if (!files) { this.toast('That version could not be read.'); return; }
    // (tracked from here: with it off every later edit would go into the version compared with)
    this.setBase({ t: v.t, label: v.label || 'Automatic version', id: v.id, files, track: true });
    this.refreshNav();
    if (this.markupOn()) this.marksSoon();
    this.toast('Compared with the version from ' + when(v.t) + '. Track Changes is on: your edits from here are changes too.', 6000);
  },

  async restoreVersion(v) {
    const files = await this.versionFiles(v);
    if (!files) { this.toast('That version could not be read.'); return; }
    if (!this.isMine(v)) { await this.openVersion(v, files); return; }
    const edits = [];
    for (const [n, t] of files) { const cur = this.files.get(n); if (cur !== t) edits.push({ f: n, s: 0, e: cur == null ? 0 : cur.length, t }); }
    if (!edits.length) { this.toast('That version is the same as the text now.'); return; }
    await this.snapshot('Before restoring a version');
    this.closeGroup();
    this.commit(edits, null, 'restore');
    this.closeGroup();
    this.toast('Restored the version from ' + when(v.t) + '.', 6000, { label: 'Undo', fn: () => this.undo() });
  },

  async openVersion(v, files) {
    await this.snapshot('Before opening ' + v.name, { force: !this.lastSig });
    await this.stashBinary();
    await this.loadBinary(v.name, v.main);
    this.files = new Map(files);
    this.main = v.main;
    this.name = v.name;
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.binaryDirty = true; this.zipDirty = true; this.forceRender = true;
    this.srcFile = this.main;
    this.desk.scrollTop = 0;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.updateFileTabs();
    this.persist();
    this.lastSig = v.sig;
    this.setBase({ t: v.t, label: v.label || 'Automatic version', id: v.id, files });
    this.resetPdf();
    this.toast('Opened the version of ' + v.name + ' from ' + when(v.t) + '.', 6000);
  },

  renderChanges(body) {
    const all = this.currentChanges();
    // comment lines are listed above, as comments; Accept all takes them along
    const real = all.filter((c) => !spacingOnly(c) && !commentOnly(c)), space = all.filter(spacingOnly);
    const top = mk('div', 'chg-top');
    const cmp = mk('div', 'chg-base');
    cmp.append('Changes since ', mk('b', '', this.base ? when(this.base.t) : ''), this.base && this.base.label ? ' · ' + this.base.label : '');
    const lab = mk('label', 'chg-show');
    const cb = mk('input');
    cb.type = 'checkbox'; cb.id = 'chg-show'; cb.checked = this.markup() === 'all';
    cb.addEventListener('change', () => this.setMarks(cb.checked));
    lab.append(cb, 'Show changes on the pages');
    top.append(cmp, lab);
    if (all.length) {
      const row = mk('div', 'chg-bulk');
      row.append(mk('span', 'chg-n', real.length + (real.length === 1 ? ' change' : ' changes')), mk('span', 'grow'),
        mkBtn('Accept all', () => this.acceptChanges(this.currentChanges()), 'Keep every change and compare from here on'),
        mkBtn('Reject all', () => this.rejectChanges(this.currentChanges(), 'Before rejecting all changes'), 'Put back the text of the compared version (Ctrl+Z undoes)'));
      top.append(row);
    }
    body.append(top);
    if (!all.length) body.append(mk('div', 'nav-empty', 'No changes since then. Each edit you make shows up here with Accept and Reject.'));
    const MAX = 250;
    for (const c of real.slice(0, MAX)) body.append(this.changeItem(c));
    if (real.length > MAX) body.append(mk('div', 'nav-empty', (real.length - MAX) + ' more. Accept or reject some to see the rest.'));
    if (space.length) {
      const it = mk('div', 'chg spacing');
      const row = mk('div', 'chg-row');
      row.append(mk('span', 'where', space.length + (space.length === 1 ? ' line break or spacing change' : ' line break or spacing changes') + ' (same on the page)'), mk('span', 'grow'),
        mkBtn('Accept', () => this.acceptChanges(space)), mkBtn('Reject', () => this.rejectChanges(space)));
      it.append(row);
      body.append(it);
    }
    const vh = mk('div', 'ver-h', 'Versions');
    const form = mk('form', 'ver-form');
    const inp = mk('input');
    inp.type = 'text'; inp.placeholder = 'Name this version'; inp.maxLength = 80; inp.setAttribute('aria-label', 'Name this version');
    form.append(inp, mkBtn('Save', null, 'Keep the text as it is now under this name', 'submit'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      inp.value = '';
      inp.blur();
      this.snapshot(name, { force: true, named: true }).then(() => this.toast('Saved the version “' + name + '”.'));
    });
    const list = mk('div', 'ver-list');
    body.append(vh, form, list);
    this.allSnaps().then((vs) => this.fillVersions(list, vs));
  },

  changeItem(c) {
    const it = mk('div', 'chg');
    const txt = mk('button', 'chg-txt');
    txt.type = 'button';
    txt.title = 'Show it on the page';
    const src = this.src(c.f);
    let pre = src.slice(Math.max(0, c.bs - 36), c.bs), post = src.slice(c.be, c.be + 36);
    if (c.bs > 36) pre = '…' + pre.replace(/^\S*\s/, '');
    if (c.be + 36 < src.length) post = post.replace(/\s\S*$/, '') + '…';
    const flat = (t) => t.replace(/\s+/g, ' ');
    const clip = (t) => (t.length > 160 ? t.slice(0, 70) + ' … ' + t.slice(-70) : t);
    txt.append(mk('span', 'ctx', flat(pre)));
    for (const [op, v] of c.parts) txt.append(op === ' ' ? document.createTextNode(flat(clip(v))) : mk(op === '-' ? 'del' : 'ins', '', flat(clip(v)) || '¶'));
    txt.append(mk('span', 'ctx', flat(post)));
    txt.addEventListener('click', () => { this.goTo(c.f, c.bs); if (window.innerWidth <= 860) this.toggleNav(false); });
    const row = mk('div', 'chg-row');
    const kind = !c.a ? 'Added' : !c.b ? 'Deleted' : 'Changed';
    row.append(mk('span', 'where', kind + ' · ' + this.rvName(c.who) + ' · ' + c.f + ':' + c.line), mk('span', 'grow'),
      mkBtn('Accept', () => this.acceptChanges([c]), 'Keep this change'),
      mkBtn('Reject', () => this.rejectChanges([c]), 'Put the old text back'));
    it.append(txt, row);
    return it;
  },

  fillVersions(list, vs) {
    list.replaceChildren();
    if (!vs.length) { list.append(mk('div', 'nav-empty', 'Versions are kept as you work: every few minutes, when you leave, and when you save the .zip.')); return; }
    for (const v of vs.slice(0, 120)) {
      const mine = this.isMine(v);
      const row = mk('div', 'ver' + (this.base && this.base.id != null && this.base.id === v.id ? ' on' : ''));
      const l = mk('div', 'ver-l');
      const w = when(v.t);
      l.append(mk('span', 'ver-t', w[0].toUpperCase() + w.slice(1)), mk('span', 'ver-n' + (v.named ? ' named' : ''), v.label || 'Automatic'));
      if (!mine) l.append(mk('span', 'ver-p', v.name));
      const acts = mk('div', 'ver-a');
      if (mine) acts.append(mkBtn('Compare', () => this.compareWith(v), 'List and mark the changes made since this version'), mkBtn('Restore', () => this.restoreVersion(v), 'Bring back the text of this version (Ctrl+Z undoes)'));
      else acts.append(mkBtn('Open', () => this.restoreVersion(v), 'Open this version of ' + v.name + ' (the current project is kept as a version)'));
      if (v.named) acts.append(mkBtn('×', () => { snapDel(v.id).catch(() => {}); this.memSnaps = this.memSnaps.filter((x) => x.id !== v.id); this.snapList = null; this.lastSig = null; this.refreshNav(); }, 'Delete this named version'));
      row.append(l, acts);
      list.append(row);
    }
  },

  // Track-changes marks on the pages: inserted text underlined, deletions as a small red
  // wedge (hover shows what was deleted), changed equations outlined, and a bar in the
  // margin beside each changed line.
  paintChanges() {
    for (const x of this.root.querySelectorAll('.mk-layer')) x.remove();
    for (const x of this.root.querySelectorAll('.chg-atom')) x.classList.remove('chg-atom');
    const HL = window.CSS && CSS.highlights;
    if (HL) HL.delete('g-ins');
    // (Display for Review: no marks, the bars alone, or all; Show Markup's Insertions and Deletions)
    for (const k of ['g-ins2', 'g-ins3', 'g-ins4']) if (HL) HL.delete(k);
    const mode = this.markup();
    if (mode === 'none' || mode === 'original' || this.prefs.showIns === false || !this.base || !this.model) return;
    // (Show Markup's Specific People: the changes of those shown)
    const list = this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c) && this.rvShown(c));
    if (!list.length) return;
    const all = mode === 'all';
    // (each reviewer a colour of their own, as Word gives them: the first four)
    const people = this.rvReviewers();
    const tone = (c) => Math.max(0, people.indexOf(this.rvName(c.who))) % 4;
    const ins = new Map(), dels = [];
    for (const c of list) {
      const k = tone(c);
      for (const [op, v, p] of c.parts) {
        if (op === '+' && v.trim()) { const key = c.f + '\u0000' + k; if (!ins.has(key)) ins.set(key, []); ins.get(key).push([p, p + v.length]); }
        else if (op === '-' && v.trim()) dels.push({ f: c.f, p, text: v, k, who: this.rvName(c.who) });
      }
    }
    for (const rs of ins.values()) rs.sort((a, b) => a[0] - b[0]);
    const ranges = [], byTone = [[], [], [], []];
    for (const [key, rs] of ins) { const [f, k] = key.split('\u0000'); const R = this.index.domRanges(f, rs); ranges.push(...R); byTone[+k].push(...R); }
    const insOf = new Map();
    for (const [key, rs] of ins) { const f = key.split('\u0000')[0]; if (!insOf.has(f)) insOf.set(f, []); insOf.get(f).push(...rs); }
    const atomHit = [];
    for (const el of this.root.querySelectorAll('[data-a]')) {
      const A = atomOfEl(el);
      if (!A || A.s == null || A.e == null) continue;
      const rs = insOf.get(A.f) || [];
      const hit = rs.some(([s, e]) => s < A.e && e > A.s) || dels.some((d) => d.f === A.f && d.p > A.s && d.p < A.e);
      if (hit && !el.parentElement.closest('.chg-atom')) { el.classList.add('chg-atom'); atomHit.push(A); }
    }
    if (HL && window.Highlight && all) byTone.forEach((R, k) => { if (R.length) HL.set(k ? 'g-ins' + (k + 1) : 'g-ins', new window.Highlight(...R)); });
    // (Simple Markup: the outline of a changed equation goes, its bar stays)
    const atomEls = [...this.root.querySelectorAll('.chg-atom')];
    if (!all) for (const x of atomEls) x.classList.remove('chg-atom');
    const layers = new Map();
    const layer = (page) => {
      let L = layers.get(page);
      if (!L) { L = mk('div', 'mk-layer'); L.contentEditable = 'false'; L.setAttribute('aria-hidden', 'true'); page.append(L); L.bars = []; layers.set(page, L); }
      return L;
    };
    const pageOf = (n) => (n.nodeType === 1 ? n : n.parentElement).closest('.page');
    const bar = (page, q) => { const P = page.getBoundingClientRect(); layer(page).bars.push([q.top - P.top, q.bottom - P.top]); };
    for (const r of ranges) { const page = pageOf(r.startContainer); if (page) for (const q of r.getClientRects()) if (q.height) bar(page, q); }
    for (const el of atomEls) { const page = pageOf(el); if (page) for (const q of el.getClientRects()) if (q.height) bar(page, q); }
    for (const d of dels) {
      if (atomHit.some((A) => A.f === d.f && d.p > A.s && d.p < A.e)) continue;
      const r = this.index.find(d.f, d.p, -1);
      if (!r || !r.node) continue;
      const R = document.createRange();
      try { R.setStart(r.node, Math.min(r.offset, r.node.length ?? 0)); } catch (e) { continue; }
      R.collapse(true);
      const q = R.getClientRects()[0] || R.getBoundingClientRect();
      const page = pageOf(r.node);
      if (!q || !q.height || !page) continue;
      const P = page.getBoundingClientRect();
      if (!all) { bar(page, q); continue; }
      const m = mk('span', 'del-mk' + (d.k ? ' a' + (d.k + 1) : ''));
      m.style.left = (q.left - P.left) + 'px'; m.style.top = (q.top - P.top) + 'px'; m.style.height = q.height + 'px';
      m.title = 'Deleted by ' + d.who + ': ' + (d.text.length > 300 ? d.text.slice(0, 300) + '…' : d.text);
      layer(page).append(m);
      bar(page, q);
    }
    for (const [page, L] of layers) {
      const flow = page.querySelector('.flow');
      const x = flow ? flow.getBoundingClientRect().left - page.getBoundingClientRect().left - 14 : 24;
      const bs = L.bars.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const b of bs) { const last = merged[merged.length - 1]; if (last && b[0] <= last[1] + 2) last[1] = Math.max(last[1], b[1]); else merged.push([b[0], b[1]]); }
      for (const [t, b] of merged) { const e = mk('span', 'chg-bar'); e.style.left = x + 'px'; e.style.top = t + 'px'; e.style.height = (b - t) + 'px'; L.append(e); }
    }
  }
};
