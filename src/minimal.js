// Write an edited equation row back with the smallest possible change.
//
// The equation field speaks a normalized LaTeX (x_{n} where you wrote x_n, no spaces). When
// one symbol changes, splicing that whole normalized row into the source would rewrite
// everything around it. Instead: find the changed tokens between the old and new field
// text, find where those tokens sit in the original source (lining the two up while
// ignoring spacing, braces and lifted \label/\tag), and replace only that span. The result
// is checked against the new row by `same`; if it does not mean the same thing the span is
// widened, and in the worst case the whole row is replaced as before.

const SKIP = /\\label\s*\{[^}]*\}|\\(?:nonumber|notag)\b|\\tag\*?\s*\{[^}]*\}/g;

function tokens(s, skipRowCmds) {
  const out = [];
  const skip = [];
  if (skipRowCmds) { let m; SKIP.lastIndex = 0; while ((m = SKIP.exec(s))) skip.push([m.index, m.index + m[0].length]); }
  let k = 0;
  for (let i = 0; i < s.length;) {
    while (k < skip.length && skip[k][1] <= i) k++;
    if (k < skip.length && skip[k][0] <= i) { i = skip[k][1]; continue; }
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '%') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i, i + 64));
      const t = m ? m[0] : '\\';
      out.push({ t, s: i, e: i + t.length });
      i += t.length;
      continue;
    }
    out.push({ t: c, s: i, e: i + 1 });
    i++;
  }
  return out;
}
const isBrace = (t) => t === '{' || t === '}';

// a[j] -> index in b of the token it lines up with, -1 for a brace only one side has.
// Stops (leaving undefined) at the first real mismatch.
function align(a, b, fromEnd) {
  const map = new Array(a.length);
  let i = fromEnd ? a.length - 1 : 0, j = fromEnd ? b.length - 1 : 0;
  const step = fromEnd ? -1 : 1;
  const inA = (x) => x >= 0 && x < a.length, inB = (x) => x >= 0 && x < b.length;
  while (inA(i)) {
    if (inB(j) && a[i].t === b[j].t) { map[i] = j; i += step; j += step; continue; }
    if (isBrace(a[i].t)) { map[i] = -1; i += step; continue; }
    if (inB(j) && isBrace(b[j].t)) { j += step; continue; }
    break;
  }
  return map;
}

export function minimalRow(orig, was, now, same) {
  if (was === now) return orig;
  const O = tokens(orig, true), W = tokens(was, false), N = tokens(now, false);
  const fwd = align(W, O, false), back = align(W, O, true);
  let A = 0;
  while (A < W.length && fwd[A] !== undefined) A++;
  let B = 0;
  while (B < W.length && back[W.length - 1 - B] !== undefined) B++;
  const ok = (res) => res != null && same(res.replace(SKIP, ''), now);
  // First line the old and new field text up ignoring braces: the field may give back what it
  // was given (x_n) and write the edited row normalized (x_{n}), and that is no change.
  const pre = pairs(W, N, false, 0, 0).filter(([i]) => i < A);
  const lastPre = pre.length ? pre[pre.length - 1] : [-1, -1];
  const suf = pairs(W, N, true, lastPre[0] + 1, lastPre[1] + 1).filter(([i]) => i >= W.length - B);
  for (let tries = 0; tries < 12; tries++) {
    const p = pre.length ? pre[pre.length - 1] : [-1, -1];
    const q = suf.length ? suf[suf.length - 1] : [W.length, N.length];
    // braces the field added around the last kept token (x^k -> x^{k}+1) close right after it
    let pn = p[1] + 1;
    const paired = new Set(pre.map(([, j]) => j));
    let open = 0;
    for (let j = 0; j < pn; j++) if (!paired.has(j)) open += N[j].t === '{' ? 1 : N[j].t === '}' ? -1 : 0;
    while (open > 0 && pn < q[1] && N[pn].t === '}') { pn++; open--; }
    const res = splice(O, W, N, fwd, back, p[0] + 1, pn, W.length - q[0], N.length - q[1], orig, now);
    if (ok(res)) return res;
    if (!pre.length && !suf.length) break;
    pre.pop();
    suf.pop();
  }
  // then token for token
  let P = 0;
  while (P < W.length && P < N.length && W[P].t === N[P].t) P++;
  let S = 0;
  while (S < W.length - P && S < N.length - P && W[W.length - 1 - S].t === N[N.length - 1 - S].t) S++;
  P = Math.min(P, A);
  S = Math.min(S, B);
  for (let tries = 0; tries < 12; tries++) {
    const res = splice(O, W, N, fwd, back, P, P, S, S, orig, now);
    if (ok(res)) return res;
    if (P === 0 && S === 0) break;
    if (P > 0) P--;
    if (S > 0) S--;
  }
  return null;
}

// Tokens of a and b that line up, braces only one side has skipped: [ia, ib] pairs, from the
// start (or from the end, not reaching before i0, j0).
function pairs(a, b, fromEnd, i0, j0) {
  const out = [];
  let i = fromEnd ? a.length - 1 : 0, j = fromEnd ? b.length - 1 : 0;
  const step = fromEnd ? -1 : 1;
  const inA = (x) => x >= i0 && x < a.length, inB = (x) => x >= j0 && x < b.length;
  while (inA(i) && inB(j)) {
    if (a[i].t === b[j].t) { out.push([i, j]); i += step; j += step; continue; }
    if (isBrace(a[i].t)) { i += step; continue; }
    if (isBrace(b[j].t)) { j += step; continue; }
    break;
  }
  return out;
}

// pw, pn: tokens of the old and new field text kept at the start; sw, sn: at the end
function splice(O, W, N, fwd, back, pw, pn, sw, sn, orig, now) {
  // the original tokens standing for the changed field tokens lie strictly between the last
  // lined-up token before the change and the first lined-up token after it
  let lo = 0, hi = O.length - 1;
  let leftEnd = 0, rightStart = orig.length;
  for (let j = pw - 1; j >= 0; j--) if (fwd[j] >= 0) { lo = fwd[j] + 1; leftEnd = O[fwd[j]].e; break; }
  for (let j = W.length - sw; j < W.length; j++) if (back[j] >= 0) { hi = back[j] - 1; rightStart = O[back[j]].s; break; }
  if (hi < lo - 1) return null;
  let oStart, oEnd;
  if (lo <= hi) { oStart = O[lo].s; oEnd = O[hi].e; } // replace those tokens
  else { oStart = oEnd = pw > 0 ? leftEnd : rightStart; } // pure insertion
  if (oStart < leftEnd || oEnd > rightStart) return null;
  const nStart = pn < N.length ? N[pn].s : now.length;
  const nEnd = N.length - sn > pn ? N[N.length - sn - 1].e : nStart;
  let mid = now.slice(nStart, nEnd);
  let left = orig.slice(0, oStart), right = orig.slice(oEnd);
  if (!mid && /\s$/.test(left) && /^\s/.test(right)) left = left.replace(/\s+$/, '');
  // keep a control word from running into a following letter, and vice versa
  if (/\\[A-Za-z]+$/.test(left) && /^[A-Za-z]/.test(mid)) mid = ' ' + mid;
  if (/\\[A-Za-z]+$/.test(mid || left) && /^[A-Za-z]/.test(right)) mid += ' ';
  return left + mid + right;
}

// Do two LaTeX strings typeset the same? Compares KaTeX's MathML with grouping removed.
// pre: what the page does to a formula before KaTeX sees it (siunitx commands, say)
export function makeSame(katex, macros, display, pre) {
  const cache = new Map();
  const canon = (t) => {
    if (cache.has(t)) return cache.get(t);
    let v = null;
    try {
      const u = pre ? pre(t) : t;
      const x = /&/.test(u) ? '\\begin{aligned}' + u + '\\end{aligned}' : u;
      v = katex.renderToString(x, { displayMode: !!display, output: 'mathml', throwOnError: true, strict: 'ignore', macros: { ...(macros || {}) } })
        .replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<\/?(mrow|semantics)>/g, '').replace(/\s+/g, ' ')
          // G^* and G^{*} set the same in TeX; KaTeX marks only the braced one's spacing
          .replace(/ lspace="0em" rspace="0em"/g, '');
    } catch (e) { v = null; }
    if (cache.size > 400) cache.clear();
    cache.set(t, v);
    return v;
  };
  return (a, b) => { const x = canon(a); return x != null && x === canon(b); };
}
