// Myers diff over arrays (lines or words), and hunks with character offsets so one change
// can be reverted on its own.

export function diffSeq(a, b) {
  // returns list of [op, value] with op in ' ', '-', '+'
  const n = a.length, m = b.length;
  let s = 0;
  while (s < n && s < m && a[s] === b[s]) s++;
  let ea = n, eb = m;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb);
  const mid = myers(A, B);
  const out = [];
  for (let i = 0; i < s; i++) out.push([' ', a[i]]);
  // (a loop, not push(...mid): spreading a list of a few hundred thousand overflows the stack)
  for (const x of mid) out.push(x);
  for (let i = ea; i < n; i++) out.push([' ', a[i]]);
  return out;
}

// Myers' O(ND) diff. Each step keeps only the diagonals it reached (2d+3 of them), and past
// MAXD edits the rest is treated as one replacement, so a huge paste cannot stall the page.
const MAXD = 1500;
function myers(a, b) {
  const n = a.length, m = b.length, max = n + m;
  if (!n) return b.map((x) => ['+', x]);
  if (!m) return a.map((x) => ['-', x]);
  const whole = () => [...a.map((x) => ['-', x]), ...b.map((x) => ['+', x])];
  const o = max + 2; // diagonal k lives at v[o + k]
  const v = new Int32Array(2 * max + 5);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    if (d > MAXD) return whole();
    trace.push(v.slice(o - d - 1, o + d + 2)); // diagonals -d-1 .. d+1 before step d
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[o + k - 1] < v[o + k + 1])) x = v[o + k + 1];
      else x = v[o + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[o + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, d);
    }
  }
  return whole();
}
function backtrack(trace, a, b, D) {
  const out = [];
  let x = a.length, y = b.length;
  for (let d = D; d > 0; d--) {
    const t = trace[d];
    const at = (k) => t[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(prevK), py = px - prevK;
    while (x > px && y > py) { out.push([' ', a[x - 1]]); x--; y--; }
    if (x === px) out.push(['+', b[y - 1]]); else out.push(['-', a[x - 1]]);
    x = px; y = py;
  }
  while (x > 0 && y > 0) { out.push([' ', a[x - 1]]); x--; y--; }
  return out.reverse();
}

const splitLines = (t) => t.match(/[^\n]*\n|[^\n]+$/g) || [];

// Hunks between old text a and current text b: { a, b, bs, be, line } where [bs, be) is
// the range in b to replace with a to undo the hunk.
export function hunks(a, b) {
  if (a === b) return [];
  const A = splitLines(a), B = splitLines(b);
  const ops = diffSeq(A, B);
  const out = [];
  let aPos = 0, bPos = 0, line = 1, cur = null;
  for (const [op, val] of ops) {
    if (op === ' ') { if (cur) { out.push(cur); cur = null; } aPos += val.length; bPos += val.length; line++; continue; }
    if (!cur) cur = { a: '', b: '', as: aPos, bs: bPos, be: bPos, line };
    if (op === '-') { cur.a += val; aPos += val.length; }
    else { cur.b += val; bPos += val.length; cur.be = bPos; line++; }
  }
  if (cur) out.push(cur);
  return out;
}

// Word-level marks for showing one hunk: [[op, text], ...]
export function wordDiff(a, b) {
  const tok = (t) => t.match(/\s+|[A-Za-zÀ-ɏ0-9]+|\\[A-Za-z]+|./g) || [];
  const ops = diffSeq(tok(a), tok(b));
  const out = [];
  for (const [op, v] of ops) {
    const last = out[out.length - 1];
    if (last && last[0] === op) last[1] += v; else out.push([op, v]);
  }
  return out;
}

// Changes the way a reviewer sees them: word-level edits inside each changed line, with
// nearby edits (separated by a word or less) merged into one. Each change knows where it
// sits in the old text [as, ae) and the current text [bs, be), so it can be accepted
// (copied into the old text) or rejected (old text put back) on its own.
//   { f, as, ae, bs, be, a, b, line, parts: [[op, text, posInCurrent]] }
const nl = (t) => { let n = 0; for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) n++; return n; };
export function changes(a, b, f) {
  const out = [];
  for (const h of joinBlank(hunks(a, b), a, b)) {
    const ops = wordDiff(h.a, h.b);
    let ap = h.as, bp = h.bs, line = h.line;
    let cur = null, pend = null;
    const flush = () => { if (cur) out.push(cur); cur = null; pend = null; };
    for (const [op, v] of ops) {
      if (op === ' ') {
        if (cur && !(v.length >= 10 || /\S\s+\S/.test(v) || nl(v) > 1)) pend = { v, ap, bp };
        else flush();
        ap += v.length; bp += v.length; line += nl(v);
        continue;
      }
      if (cur && pend) {
        cur.a += pend.v; cur.b += pend.v; cur.parts.push([' ', pend.v, pend.bp]);
        pend = null;
      }
      if (!cur) cur = { f, as: ap, ae: ap, bs: bp, be: bp, a: '', b: '', line, parts: [] };
      if (op === '-') { cur.a += v; ap += v.length; cur.parts.push(['-', v, bp]); }
      else { cur.b += v; cur.parts.push(['+', v, bp]); bp += v.length; line += nl(v); }
      cur.ae = ap; cur.be = bp;
    }
    flush();
  }
  return out;
}
// Hunks with only blank lines between them as one, where the words' diff over the block changes
// fewer characters than over each: a blank line is a poor anchor, and where one paragraph was
// joined to the next and another split (a Word file's tracked changes, each its author's) the
// lines' diff pairs the wrong paragraphs, by blank lines, and lists the join as text put in at
// one place and taken out at another, which no author's step made; over the block the words'
// diff finds the paragraph break that went and the one that came. (Edits that the lines' diff
// pairs well stay as they were; and small blocks only: past 2000 characters the words' diff
// could pass MAXD and give the block as one replacement.)
const cost = (h) => { if (h.cost == null) { h.cost = 0; for (const [op, v] of wordDiff(h.a, h.b)) if (op !== ' ') h.cost += v.length; } return h.cost; };
function joinBlank(H, a, b) {
  const out = [];
  for (const h of H) {
    const L = out[out.length - 1];
    const gap = L ? a.slice(L.as + L.a.length, h.as) : null;
    if (L && /^\s+$/.test(gap) && gap.length <= 8 && h.as + h.a.length - L.as + h.be - L.bs <= 2000) {
      const M = { a: a.slice(L.as, h.as + h.a.length), b: b.slice(L.bs, h.be), as: L.as, bs: L.bs, be: h.be, line: L.line };
      if (cost(M) < cost(L) + cost(h)) { out[out.length - 1] = M; continue; }
    }
    out.push(h);
  }
  return out;
}
// Only line breaks or spacing that TeX typesets the same (a blank line is a new paragraph,
// and removing the only space joins two words, so neither counts).
const sp = (t) => t.replace(/\n[ \t]*\n\s*/g, '\u00b6').replace(/\s+/g, ' ');
export const spacingOnly = (c) => sp(c.a) === sp(c.b);
