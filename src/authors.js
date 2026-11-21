// Who wrote what: the layer of authors each file keeps beside Track Changes' base (src/review.js,
// whose header says what it is). Pure and without the page, so that the Word worker builds the
// layer of a file's tracked changes too (src/wordjobs.js openDocx). Tested in
// test/review.test.mjs and test/word.test.mjs.

import { changes } from './diff.js';

export const MAX_SEGS = 20000;
// segs: [{s, e, who}] sorted by s (e === s: a deletion there); one edit of the old text's
// [s, e) by text n characters long, made by who
// (rest: a range at the start standing for the pieces left out past MAX_SEGS (capped), in a name
// that is no one's, a Word file's "Word"; a deletion inside it is that name's too (byAuthor), and
// an edit that cuts it leaves two such ranges)
// (a deletion keeps the text it took, t, so that where two people's deletions meet each is told by
// its own words, byAuthor; capped, a longer one is told by its place alone)
const MAX_DEL = 2000;
export function authorEdit(segs, s, e, n, who, del) { return capped(edit(segs, s, e, n, who, del)).segs; }
// (the edit uncapped: stepEdit's segments are those beside the edits, not the layer)
function edit(segs, s, e, n, who, del) {
  const d = n - (e - s), out = [], inner = [], tail = [];
  for (const g of segs) {
    if (g.e < s || (g.e === s && (g.s < s || n === 0 || e > s))) { out.push(g); continue; }
    // (a deletion just after the deleted text: it follows it, at the same place when nothing is typed)
    if (g.s === e && g.e === e && e > s && n === 0) { tail.push({ ...g, s, e: s }); continue; }
    if (g.s > e || (g.s === e && e > s)) { out.push({ ...g, s: g.s + d, e: g.e + d }); continue; }
    // (a range the edit cuts: what is left of it before and after)
    if (g.s < s) out.push(piece(g, g.s, s));
    if (g.e > e) out.push(piece(g, s + n, g.e + d));
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
    if (L && L.who === g.who && L.e === g.s && g.e > g.s && L.e > L.s && !L.rest === !g.rest) L.e = g.e;
    else if (L && L.who === g.who && L.s === g.s && L.e === g.e && g.e === g.s) { if (L.t != null && g.t != null && L.t.length + g.t.length <= MAX_DEL) L.t += g.t; else delete L.t; }
    else if (L && L.who === g.who && L.s === g.s && L.e === g.e) continue;
    else m.push(g.e === g.s ? { ...g } : g);
  }
  return m;
}
const piece = (g, s, e) => (g.rest ? { s, e, who: g.who, rest: true } : { s, e, who: g.who });
// the layer kept to MAX_SEGS, the pieces at the start left out: where the layer has a rest range,
// or rest names one, a range from the start to the first piece kept stands for them, so that they
// are told apart from the person's own edits (they showed as "You", and Save as Word signed them
// with the person's name; review N1); else they have no author, as a project's own history
// before it had a layer. cut: how many were left out.
function capped(segs, rest) {
  if (segs.length <= MAX_SEGS) return { segs, cut: 0 };
  const who = segs[0].rest ? segs[0].who : rest;
  const keep = segs.slice(segs.length - MAX_SEGS + (who != null ? 1 : 0));
  return { segs: who != null && keep[0].s > 0 ? [{ s: 0, e: keep[0].s, who, rest: true }, ...keep] : keep, cut: segs.length - keep.length };
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

// The layer for a text reached from base by steps ([{who, tex}], each its author's): every edit
// of every step as authorEdit makes it, in one pass per step. A step's edits stand apart and in
// order, so each goes through authorEdit with the few segments beside it, and the segments to its
// right are kept as distances from the text's end, which the edits to their left do not change
// (a file with thousands of tracked changes, opened from Word: one call per edit over the whole
// layer took a minute). Returns { segs, cut, from }: cut, the segments left out at the start for
// MAX_SEGS, credited to rest (a Word file's changes no author is named for: "Word"); from, where
// the credited ones start.
export function authorSteps(base, steps, rest = 'Word') {
  let segs = [], prev = base;
  for (const st of steps) {
    segs = stepEdit(segs, editSpans(prev, st.tex, true), String(st.who || 'Word').slice(0, 200), prev);
    prev = st.tex;
  }
  const C = capped(segs, rest);
  const first = C.segs.find((g) => !g.rest);
  return { segs: C.segs, cut: C.cut, from: C.cut ? (first ? first.s : prev.length) : 0 };
}
// One step of the page (src/review.js rvAuthorStep): the layer segs of text prev moved to cur,
// cur's new pieces who's; fine, word by word where the step replaced much at once (a merge, Reject
// All). As authorEdit span by span, but in one pass: Reject All on a file with 3000 changes from
// Word took 1.5 s of the page's thread (review N3).
export function layerStep(segs, prev, cur, who, fine) {
  return capped(stepEdit(segs, editSpans(prev, cur, fine), who, prev)).segs;
}
// spans: editSpans', from the end backwards, in prev's offsets
function stepEdit(segs, spans, who, prev) {
  let L = prev.length, k = segs.length;
  // (done: the segments right of the edits made so far, the leftmost last, as distances from the end)
  const done = [];
  const far = (g) => ({ ...g, s: L - g.s, e: L - g.e });
  for (const x of spans) {
    let i = k;
    while (i > 0 && segs[i - 1].e >= x.s - 1) i--;
    const near = segs.slice(i, k);
    k = i;
    while (done.length && L - done[done.length - 1].s <= x.e + 1) near.push(far(done.pop()));
    const out = edit(near, x.s, x.e, x.n, who, prev.slice(x.s, x.e));
    L += x.n - (x.e - x.s);
    for (let j = out.length - 1; j >= 0; j--) done.push(far(out[j]));
  }
  const res = segs.slice(0, k);
  for (let j = done.length - 1; j >= 0; j--) res.push(far(done[j]));
  return res;
}
