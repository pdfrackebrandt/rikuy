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
  let P = 0;
  while (P < W.length && P < N.length && W[P].t === N[P].t) P++;
  let S = 0;
  while (S < W.length - P && S < N.length - P && W[W.length - 1 - S].t === N[N.length - 1 - S].t) S++;
  P = Math.min(P, A);
  S = Math.min(S, B);
  for (let tries = 0; tries < 12; tries++) {
    const res = splice(O, W, N, fwd, back, P, S, orig, now);
    if (res != null && same(res.replace(SKIP, ''), now)) return res;
    if (P === 0 && S === 0) break;
    if (P > 0) P--;
    if (S > 0) S--;
  }
  return null;
}

function splice(O, W, N, fwd, back, P, S, orig, now) {
  // the original tokens standing for the changed field tokens lie strictly between the last
  // lined-up token before the change and the first lined-up token after it
  let lo = 0, hi = O.length - 1;
  let leftEnd = 0, rightStart = orig.length;
  for (let j = P - 1; j >= 0; j--) if (fwd[j] >= 0) { lo = fwd[j] + 1; leftEnd = O[fwd[j]].e; break; }
  for (let j = W.length - S; j < W.length; j++) if (back[j] >= 0) { hi = back[j] - 1; rightStart = O[back[j]].s; break; }
  if (hi < lo - 1) return null;
  let oStart, oEnd;
  if (lo <= hi) { oStart = O[lo].s; oEnd = O[hi].e; } // replace those tokens
  else { oStart = oEnd = P > 0 ? leftEnd : rightStart; } // pure insertion
  if (oStart < leftEnd || oEnd > rightStart) return null;
  const nStart = P < N.length ? N[P].s : now.length;
  const nEnd = N.length - S > P ? N[N.length - S - 1].e : nStart;
  let mid = now.slice(nStart, nEnd);
  let left = orig.slice(0, oStart), right = orig.slice(oEnd);
  if (!mid && /\s$/.test(left) && /^\s/.test(right)) left = left.replace(/\s+$/, '');
  // keep a control word from running into a following letter, and vice versa
  if (/\\[A-Za-z]+$/.test(left) && /^[A-Za-z]/.test(mid)) mid = ' ' + mid;
  if (/\\[A-Za-z]+$/.test(mid || left) && /^[A-Za-z]/.test(right)) mid += ' ';
  return left + mid + right;
}

// Do two LaTeX strings typeset the same? Compares KaTeX's MathML with grouping removed.
export function makeSame(katex, macros, display) {
  const cache = new Map();
  const canon = (t) => {
    if (cache.has(t)) return cache.get(t);
    let v = null;
    try {
      const x = /&/.test(t) ? '\\begin{aligned}' + t + '\\end{aligned}' : t;
      v = katex.renderToString(x, { displayMode: !!display, output: 'mathml', throwOnError: true, strict: 'ignore', macros: { ...(macros || {}) } })
        .replace(/<annotation[\s\S]*?<\/annotation>/g, '').replace(/<\/?(mrow|semantics)>/g, '').replace(/\s+/g, ' ');
    } catch (e) { v = null; }
    if (cache.size > 400) cache.clear();
    cache.set(t, v);
    return v;
  };
  return (a, b) => { const x = canon(a); return x != null && x === canon(b); };
}
