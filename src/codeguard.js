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
      // all of the code's text, or nothing but syntax: the whole run
      const cs = Math.max(s, R.is), ce = Math.min(e, R.ie);
      if ((s <= R.is && e >= R.ie) || (cs >= ce && s >= R.S && e <= R.E)) { next.push({ s: Math.min(s, R.S), e: Math.max(e, R.E) }); continue; }
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
export function keepCodeSyntax(files, edits) {
  let changed = false;
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
  return { edits: out, moved };
}
