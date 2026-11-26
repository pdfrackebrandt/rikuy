// Inline code's syntax kept whole by every edit made on the page.
//
// \verb, \lstinline and \mintinline hold code between an opening (the command, its [options],
// minted's {language}, a delimiter or a brace) and a closing character, both drawn nowhere. An
// edit that took part of that syntax and not the whole run (Backspace after the code took its
// closing |, a selection from inside the code to past it took the | with what was typed over it)
// left the code running on to the line's end, which TeX refuses ("ended by end of line"). Word
// keeps a field's code whole the same way. So an edit's range is cut to the code's text and to
// what lies outside the run, the syntax left out; where it takes all of the code's text, or
// nothing but the syntax, it takes the whole run. Pure (no page), tested in
// test/codeguard.test.mjs; src/app.js commit applies it to the edits typed, deleted, pasted, cut
// and moved on the page, never to source written as it is (a LaTeX paragraph, a merge, Undo).

const NAME = /\\(verb|lstinline|mintinline)(?![A-Za-z])\*?/g;
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

// The runs of inline code on the lines holding [a, b] of src: { S, is, ie, E }, the run from S to
// E and its code from is to ie, read as src/parser.js reads them (one line at most; an unclosed
// one ends at the line's end, its closing character none).
export function codeRuns(src, a, b) {
  const out = [];
  let L0 = src.lastIndexOf('\n', Math.max(0, a) - 1) + 1;
  const L1 = (() => { const k = src.indexOf('\n', Math.max(a, b)); return k < 0 ? src.length : k; })();
  while (L0 <= L1) {
    let le = src.indexOf('\n', L0);
    if (le < 0) le = src.length;
    const line = src.slice(L0, le);
    NAME.lastIndex = 0;
    let from = 0;
    for (let m; (m = NAME.exec(line));) {
      const k = m.index;
      let bs = 0;
      while (k - bs - 1 >= 0 && line[k - bs - 1] === '\\') bs++;
      if (bs % 2) continue;
      // (after a comment's %, no command; a % in a run's code before is the code's)
      if (/(^|[^\\])(\\\\)*%/.test((from ? ' ' : '') + line.slice(from, k))) break;
      const code = m[1] !== 'verb';
      let p = k + m[0].length;
      const sp = () => { if (code) while (line[p] === ' ' || line[p] === '\t') p++; };
      sp();
      if (code && line[p] === '[') {
        let depth = 0, q = p + 1;
        for (; q < line.length; q++) { if (line[q] === '{') depth++; else if (line[q] === '}') depth--; else if (line[q] === ']' && depth <= 0) break; }
        if (q >= line.length) continue;
        p = q + 1; sp();
      }
      if (m[1] === 'mintinline') {
        const q = line[p] === '{' ? line.indexOf('}', p + 1) : -1;
        if (q < 0) continue;
        p = q + 1; sp();
      }
      const d = line[p];
      if (!d || isLetter(d) || /\s/.test(d)) continue;
      let end = -1, depth = 1;
      const close = code && d === '{' && m[1] === 'lstinline' ? '}' : d, bal = code && d === '{' && m[1] === 'mintinline';
      for (let q = p + 1; q < line.length; q++) {
        if (bal) { if (line[q] === '{') depth++; else if (line[q] === '}' && --depth === 0) { end = q; break; } } else if (line[q] === close) { end = q; break; }
      }
      const ie = end < 0 ? (line.endsWith('\r') ? line.length - 1 : line.length) : end;
      out.push({ S: L0 + k, is: L0 + p + 1, ie: L0 + ie, E: L0 + (end < 0 ? ie : end + 1), bal });
      NAME.lastIndex = from = (end < 0 ? ie : end + 1);
    }
    L0 = le + 1;
  }
  return out;
}

// Where the text of a step replacing [a, b) of src lands when a is in a run's code: -1 where it
// stays in the code (a place there, a range inside it, or one from after its first letter into
// the words after the run, clipped to the code by guardOne), else the place in the prose it goes
// to: the run's start where the range takes all of the code and more (the run goes whole), the
// run's end where it starts at the code's end. Written as code there, a pasted p_q went into the
// paragraph raw, TeX's Missing $.
export function proseAt(src, a, b = a) {
  for (const R of codeRuns(src, a, Math.max(a, b))) if (R.is <= a && a <= R.ie) return b <= R.ie ? -1 : a <= R.is ? R.S : a === R.ie ? R.E : -1;
  return -1;
}

// One edit [s, e) -> t of src made to keep the runs whole: a list of edits, t on the one that
// begins where the edit did (or the first, where that place was syntax).
// (minted's code in braces ends at the brace that balances: a part of it taken whole only where
// what it takes balances too, or the code read on past its end)
const balanced = (t) => { let d = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '\\') i++; else if (t[i] === '{') d++; else if (t[i] === '}' && --d < 0) return false; } return d === 0; };
function guardOne(src, ed) {
  let parts = [{ s: ed.s, e: ed.e }];
  for (const R of codeRuns(src, ed.s, ed.e)) {
    const next = [];
    const inner = (x) => !R.bal || x.s === x.e || x.e <= R.is || x.s >= R.ie || balanced(src.slice(Math.max(x.s, R.is), Math.min(x.e, R.ie)));
    for (const x of parts) {
      const { s, e } = x;
      if (s < e && s >= R.is && e <= R.ie && !inner(x)) { next.push({ s, e: s }); continue; }
      // (a place in the syntax, a letter typed there: to the code's edge it is next to)
      if (s === e) { next.push(s > R.S && s < R.is ? { s: R.is, e: R.is } : s > R.ie && s < R.E ? { s: R.E, e: R.E } : x); continue; }
      if (e <= R.S || s >= R.E || (s <= R.S && e >= R.E) || (s >= R.is && e <= R.ie)) { next.push(x); continue; }
      // nothing but the syntax of one side (Backspace just after the code, Delete just before it):
      // the code's letter next to it, as a key takes the letter before or after the caret; an
      // empty code, the whole run (it took the whole run while its code had letters)
      const cs = Math.max(s, R.is), ce = Math.min(e, R.ie);
      if (cs >= ce && s >= R.S && e <= R.E) {
        if (R.ie > R.is && s >= R.ie) next.push({ s: R.ie - (R.ie - 2 >= R.is && /[\uDC00-\uDFFF]/.test(src[R.ie - 1]) ? 2 : 1), e: R.ie });
        else if (R.ie > R.is && e <= R.is) next.push({ s: R.is, e: R.is + (/[\uD800-\uDBFF]/.test(src[R.is]) ? 2 : 1) });
        else next.push({ s: R.S, e: R.E });
        continue;
      }
      // all of the code's text with text outside the run: the whole run
      if (s <= R.is && e >= R.ie) { next.push({ s: Math.min(s, R.S), e: Math.max(e, R.E) }); continue; }
      if (s < R.S) next.push({ s, e: R.S });
      if (cs < ce) next.push(inner({ s: cs, e: ce }) ? { s: cs, e: ce } : { s: cs, e: cs });
      if (e > R.E) next.push({ s: R.E, e });
    }
    parts = next;
  }
  if (parts.length === 1 && parts[0].s === ed.s && parts[0].e === ed.e) return [ed];
  // (overlapping widened parts are one)
  parts.sort((x, y) => x.s - y.s);
  const merged = [];
  for (const x of parts) { const L = merged[merged.length - 1]; if (L && x.s <= L.e) L.e = Math.max(L.e, x.e); else merged.push({ ...x }); }
  const home = merged.find((x) => x.s <= ed.s && ed.s <= x.e) || merged[0];
  return merged.map((x) => ({ ...ed, s: x.s, e: x.e, t: x === home ? ed.t : '' }));
}

// The edits of one step, each kept clear of inline code's syntax. files: the texts by name.
// Returns { edits, moved }: moved(f, p) takes a place in the text the original edits make to the
// one the new ones make (the caret's), or null where nothing changed.
// Whether the lines [a, b) of src hold inline code that all closes on its lines, and the balance of
// the braces outside its code ({ up, } down): what an edit must keep as it found it
function intact(src, a, b) {
  let net = 0, from = a, closed = true;
  for (const R of codeRuns(src, a, Math.max(a, b - 1))) {
    if (R.S < a || R.E > b) continue;
    net += braceNet(src.slice(from, R.S)); from = R.E;
    if (R.E === R.ie) closed = false;
  }
  net += braceNet(src.slice(from, b));
  return { closed, net };
}
function braceNet(t) {
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '%') { const k = t.indexOf('\n', i); if (k < 0) break; i = k; continue; }
    if (c === '{') d++; else if (c === '}') d--;
  }
  return d;
}
const MARKUP = /[\\{}$%&#^_~]/;

// The edits of one step, kept clear of inline code's syntax. files: the texts by name. o.typing:
// the step is what was typed, deleted, pasted, cut or moved (its letters may go into the code);
// else a command's (a format, Replace All, a link, a list, a style): what it writes holding
// LaTeX's markup goes beside the code, never into it (Ctrl+B over "cd here" wrote \textbf{ into
// the code and its } after it, TeX's Extra }), the format then on the words outside the code.
// Returns { edits, moved, why }: moved(f, p) takes a place in the text the old edits make to the
// one the new ones make (the caret's), null where nothing changed; why, where the step cannot be
// made without breaking the code and nothing is done, the words that say so (edits then []).
export function keepCodeSyntax(files, edits, o = {}) {
  const near = (src, ed) => /\\(?:verb|lstinline|mintinline)/.test(src.slice(Math.max(0, src.lastIndexOf('\n', ed.s - 1)), (() => { const k = src.indexOf('\n', ed.e); return k < 0 ? src.length : k; })()));
  if (!edits.some((ed) => { const src = files.get(ed.f); return src != null && ed.s != null && near(src, ed); })) return { edits, moved: null };
  let why;
  if (!o.typing) {
    // (markup written into a run's code by a command: an insertion to the run's edge, away from the
    // rest of the step's edits, so the command takes the words beside the code and leaves the code
    // as it is; with nothing of the step beside the run, or over the code's letters, that edit is
    // not made, said why)
    const FMT = 'Inline code takes no formatting: it is printed as it is typed.';
    edits = edits.flatMap((ed) => {
      const src = files.get(ed.f);
      if (src == null || ed.s == null || !MARKUP.test(ed.t || '')) return [ed];
      for (const R of codeRuns(src, ed.s, ed.e)) {
        if (ed.e < R.is || ed.s > R.ie || (ed.s <= R.S && ed.e >= R.E)) continue;
        if (ed.s !== ed.e) { why = FMT; return []; }
        const others = edits.filter((x) => x !== ed && x.f === ed.f);
        if (others.some((x) => x.s >= R.E)) return [{ ...ed, s: R.E, e: R.E }];
        if (others.some((x) => x.e <= R.S)) return [{ ...ed, s: R.S, e: R.S }];
        why = FMT; return [];
      }
      return [ed];
    });
    // (a format's opener with its closer dropped, or the other way: neither)
    if (why && edits.some((ed) => /[{}]/.test(ed.t || '') && braceNet(ed.t))) edits = edits.filter((ed) => !(/[{}]/.test(ed.t || '') && braceNet(ed.t)));
    if (!edits.length) return { edits: [], moved: null, why };
  }
  const r = guardStep(files, edits);
  // (last, whatever the step: the code it found closed stays closed, the braces outside it as
  // they were; a step that would break them is not made)
  const after = r.edits;
  for (const f of new Set(after.map((x) => x.f))) {
    const src = files.get(f), mine = after.filter((x) => x.f === f);
    if (src == null || !mine.length) continue;
    const lo = Math.min(...mine.map((x) => src.lastIndexOf('\n', x.s - 1) + 1)), hi = Math.max(...mine.map((x) => { const k = src.indexOf('\n', x.e); return k < 0 ? src.length : k; }));
    if (!/\\(?:verb|lstinline|mintinline)/.test(src.slice(lo, hi))) continue;
    // (a { typed in minted's braced code: its } comes with a later key, as it does in any editor)
    const x0 = mine[0];
    if (o.typing && mine.length === 1 && x0.s === x0.e && x0.t === '{' && codeRuns(src, x0.s, x0.s).some((R) => R.bal && R.is <= x0.s && x0.s <= R.ie)) continue;
    let t = src.slice(lo, hi);
    for (const x of [...mine].sort((a, b) => b.s - a.s)) t = t.slice(0, x.s - lo) + x.t + t.slice(x.e - lo);
    const A = intact(src, lo, hi), B = intact(t, 0, t.length);
    if (A.closed && (!B.closed || A.net !== B.net)) return { edits: [], moved: null, why: o.typing ? 'That would break the inline code here: its closing character or a brace in it would go.' : 'This cannot reach into inline code, which is printed as it is typed: select the words beside it.' };
  }
  return why ? { ...r, edits: r.edits === edits ? [...r.edits] : r.edits, why: r.why || why } : r;
}

function guardStep(files, edits) {
  let changed = false, cut = false;
  const out = [], pairs = [];
  // (a step of several edits that takes all of a run's code with text outside the run, a selection
  // from before the code to its end cut into the words and the code's text: the whole run, no
  // empty \lstinline|| left; one edit over the code's text alone still replaces only that)
  const pre = edits.map((ed) => {
    const src = files.get(ed.f);
    if (src == null || ed.s == null || edits.length < 2 || !/\\(?:verb|lstinline|mintinline)/.test(src.slice(Math.max(0, ed.s - 200), ed.e + 200))) return ed;
    for (const R of codeRuns(src, ed.s, ed.e)) {
      if (R.ie > R.is && ed.s <= R.is && ed.e >= R.ie && (ed.s > R.S || ed.e < R.E) && edits.some((o) => o !== ed && o.f === ed.f && (o.e <= R.S || o.s >= R.E))) {
        changed = true;
        return { ...ed, s: Math.min(ed.s, R.S), e: Math.max(ed.e, R.E) };
      }
    }
    return ed;
  });
  edits.forEach((o, i) => {
    const ed = pre[i], src = files.get(ed.f);
    if (src == null || ed.s == null || !/\\(?:verb|lstinline|mintinline)/.test(src.slice(Math.max(0, src.lastIndexOf('\n', ed.s - 1)), (() => { const k = src.indexOf('\n', ed.e); return k < 0 ? src.length : k; })()))) { out.push(ed); pairs.push([o, [ed]]); return; }
    const g = guardOne(src, ed);
    if (g.length !== 1 || g[0] !== ed) changed = true;
    if (o.e > o.s && g.every((x) => x.s === x.e)) cut = true;
    out.push(...g); pairs.push([o, g]);
  });
  if (!changed) return { edits, moved: null };
  // a place in the text as the old edits write it: through the old edits back to the source (or
  // into an edit's inserted text), then forward through the new ones
  const moved = (f, p) => {
    const old = pairs.filter(([o]) => o.f === f).sort((x, y) => x[0].s - y[0].s);
    let shift = 0, src = null, inT = null;
    for (const [o, g] of old) {
      const s2 = o.s + shift;
      if (p < s2) break;
      if (p <= s2 + o.t.length) { if (o.t.length) inT = { g, k: p - s2 }; else src = o.s; break; }
      shift += o.t.length - (o.e - o.s);
    }
    if (!inT && src == null) src = p - shift;
    const neu = out.filter((x) => x.f === f).sort((x, y) => x.s - y.s);
    let d = 0;
    for (const x of neu) {
      if (inT && inT.g.includes(x) && x.t) return x.s + d + inT.k;
      if (!inT && src < x.s) break;
      if (!inT && src < x.e) return x.s + d + x.t.length;
      d += x.t.length - (x.e - x.s);
    }
    return inT ? null : src + d;
  };
  // (a part of minted's braced code that would leave its braces unbalanced is not taken: said why)
  return { edits: out, moved, why: cut ? 'Part of the code is kept: taking it would leave the code\'s braces unbalanced.' : undefined };
}
