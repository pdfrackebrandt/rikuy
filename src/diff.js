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
  for (const h of joinBlank(hunks(a, b), a, b, f)) for (const c of h.list || hunkChanges(h, f)) out.push(c);
  return out;
}
// the changes of one hunk, as changes() lists them
export function hunkChanges(h, f) {
  const out = [];
  // One run of characters put in or taken out with a line end in it (Enter in the middle of a word,
  // or Backspace joining two paragraphs): that run, as Word marks the paragraph mark. The words'
  // diff saw "para" and "pa", "ra" as other words and listed a deletion and an insertion with the
  // paragraph break between them in neither, so Reject at the caret after Enter took back half of
  // it and lost the rest of the paragraph.
  let pre = 0;
  const n = Math.min(h.a.length, h.b.length);
  while (pre < n && h.a.charCodeAt(pre) === h.b.charCodeAt(pre)) pre++;
  let suf = 0;
  while (suf < n - pre && h.a.charCodeAt(h.a.length - 1 - suf) === h.b.charCodeAt(h.b.length - 1 - suf)) suf++;
  // (not inside a surrogate pair or a control word's letters: the run then starts at the word's start)
  // (only a run with a line end in it, Enter's or a join's: a letter typed in a word stays a word
  // replaced, which absorbText reads to keep an edit inside a waiting change part of it)
  const pure = pre + suf === n && h.a !== h.b && /\n/.test((h.a.length > h.b.length ? h.a : h.b).slice(pre, pre + Math.abs(h.a.length - h.b.length)));
  if (pure) {
    // (the run may slide where its ends repeat, "one two three" less "two " or " two" or "wo t":
    // it goes where its edges best meet the words round it, a space or a line end, the last of the
    // best as diff-match-patch's semantic clean up places it)
    const L = h.a.length > h.b.length ? h.a : h.b, k = L.length - n;
    while (pre > 0 && L[pre - 1] === L[pre + k - 1]) pre--;
    const edge = (x, y) => (!x || !y ? 6 : /\n/.test(x) && /\n/.test(y) ? 5 : /\n/.test(x + y) ? 4 : /\s/.test(x + y) ? (/[.!?;:,]/.test(x) || /[.!?;:,]/.test(y) ? 3 : 2) : /[^\p{L}\p{N}]/u.test(x + y) ? 1 : 0);
    let best = -1, at = pre;
    for (let q = pre; q + k <= L.length; q++) {
      if (q > pre && L[q - 1] !== L[q + k - 1]) break;
      const sc = edge(L[q - 1], L[q]) + edge(L[q + k - 1], L[q + k]);
      if (sc >= best) { best = sc; at = q; }
    }
    pre = at;
  }
  if (pure && !/[\uD800-\uDBFF]$/.test(h.a.slice(0, pre)) && !/\\[A-Za-z]*$/.test(h.a.slice(0, pre))) {
    const d = Math.abs(h.a.length - h.b.length), a = h.a.length > h.b.length ? h.a.slice(pre, pre + d) : '', b = h.b.length > h.a.length ? h.b.slice(pre, pre + d) : '', bs = h.bs + pre;
    return [{ f, as: h.as + pre, ae: h.as + pre + a.length, bs, be: bs + b.length, a, b, line: h.line + nl(h.a.slice(0, pre)), parts: [a ? ['-', a, bs] : ['+', b, bs]] }];
  }
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
  return out;
}
// Hunks with only blank lines between them as one, where the block's changes, as listed, hold
// fewer characters than the hunks' together and none of them reaches across a paragraph break but
// a join or a split (a break against spacing, nothing else): a blank line is a poor anchor, and
// where one paragraph was joined to the next and another split (a Word file's tracked changes,
// each its author's) the lines' diff pairs the wrong paragraphs, by blank lines, and lists the
// join as text put in at one place and taken out at another, which no author's step made; over
// the block the words' diff finds the paragraph break that went and the one that came. (The
// characters listed, not the words' diff's: changes() takes the spaces between nearby edits in,
// and a block could list fewer edits but more characters, or one change across a break that Word
// cannot take as a tracked change and Accept and Reject act on as a whole; review N2. Small blocks
// only: past 2000 characters the words' diff could pass MAXD and give the block as one replacement.)
const listed = (h, f) => { if (!h.list) { h.list = hunkChanges(h, f); h.cost = 0; for (const c of h.list) h.cost += c.a.length + c.b.length; } return h.cost; };
const PAR = /\n[ \t]*\n/;
const crosses = (c) => (PAR.test(c.a) || PAR.test(c.b)) && /\S/.test(c.a + c.b);
function joinBlank(H, a, b, f) {
  const out = [];
  let i = 0;
  while (i < H.length) {
    // (a block grown from H[i] while each hunk taken in lists fewer characters; it ends at the
    // last size whose changes cross no break, a join and a split being two steps: the join alone
    // with the paragraph after it lists that paragraph as moved, the split then gives it back)
    let B = H[i], good = B, end = i, j = i + 1;
    for (; j < H.length; j++) {
      const h = H[j], gap = a.slice(B.as + B.a.length, h.as);
      if (!/^\s+$/.test(gap) || gap.length > 8 || h.as + h.a.length - B.as + h.be - B.bs > 2000) break;
      const M = { a: a.slice(B.as, h.as + h.a.length), b: b.slice(B.bs, h.be), as: B.as, bs: B.bs, be: h.be, line: B.line };
      if (!(listed(M, f) < listed(B, f) + listed(h, f))) break;
      B = M;
      if (!M.list.some(crosses)) { good = M; end = j; }
    }
    out.push(good);
    i = end + 1;
  }
  return out;
}
// Only line breaks or spacing that TeX typesets the same (a blank line is a new paragraph,
// and removing the only space joins two words, so neither counts).
const sp = (t) => t.replace(/\n[ \t]*\n\s*/g, '\u00b6').replace(/\s+/g, ' ');
export const spacingOnly = (c) => sp(c.a) === sp(c.b);
