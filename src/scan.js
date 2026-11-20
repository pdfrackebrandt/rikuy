// A TeX text's comments, read once per text. Every reader of the preamble (src/preamble.js,
// src/looks.js, src/styles.js and the modules on top of them: the page's set up, the paragraph's,
// lists, references) needs the text with its comments made spaces and the place where the
// preamble ends; each once made that again from the whole file, one character at a time, and one
// build of the page's model asked a dozen times: on a 141 KB paper more than half of the build
// (docs/handoff/CPP-PLAN.md, B0). Now the answers for the last few texts are kept. A string is a
// value, so the same text always gets the same answer and nothing kept can be stale; a text is
// compared with what is kept by ===, which for another string of another length costs nothing.

const KEEP = 12;     // answers kept
const BUDGET = 8e6;  // characters kept in all, texts and answers
const SMALL = 1000;  // shorter texts are made again: cheaper than looking
const kept = [];
let size = 0;
function memo(kind, t, make) {
  if (t.length < SMALL) return make();
  for (let k = 0; k < kept.length; k++) {
    const x = kept[k];
    if (x.kind === kind && x.t === t) {
      if (k) { kept.splice(k, 1); kept.unshift(x); }
      return x.v;
    }
  }
  const v = make();
  const n = t.length + (typeof v === 'string' ? v.length : 0);
  kept.unshift({ kind, t, v, n });
  size += n;
  while (kept.length > KEEP || (size > BUDGET && kept.length > 1)) size -= kept.pop().n;
  return v;
}

// t's first n characters with each comment (from a % no backslash escapes to its line's end) made
// spaces, so offsets stay those of the text. As the readers always made it: a comment that runs
// past n is made spaces to its line's end, and a backslash at n - 1 takes the character after it
// along (callers that add the rest of the text, t.slice(n), rely on that being kept).
export function commentsBlanked(t, n) {
  return memo(n, t, () => blank(t, n));
}

// (the text between specials is copied in pieces, found by indexOf, not character by character)
function blank(t, n) {
  let out = '', from = 0, i = 0;
  let nb = t.indexOf('\\'), np = t.indexOf('%');
  while (i < n) {
    if (nb >= 0 && nb < i) nb = t.indexOf('\\', i);
    if (np >= 0 && np < i) np = t.indexOf('%', i);
    const k = nb < 0 ? np : np < 0 ? nb : Math.min(nb, np);
    if (k < 0 || k >= n) break;
    // a backslash keeps the character after it, which is then no comment's start
    if (k === nb) { i = k + 2; continue; }
    const j = t.indexOf('\n', k), e = j < 0 ? n : j;
    out += t.slice(from, k) + ' '.repeat(e - k);
    from = i = e;
  }
  if (i < n) i = n;
  return out + t.slice(from, i);
}

// where the preamble ends: the first \begin{document} that is no comment's, in the first 200,000
// characters, or -1
export function preambleEnd(src) {
  return memo('end', src, () => {
    const s = src.slice(0, 200000);
    const m = /\\begin\s*\{document\}/.exec(commentsBlanked(s, s.length));
    return m ? m.index : -1;
  });
}
