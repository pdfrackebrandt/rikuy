// Paragraphs in an environment, as edits: \begin{quote} and \end{quote} on lines of their own
// around the paragraphs [s, e), and taken off again byte for byte; another environment or other
// arguments in their place (center to flushright, spacing{1.5} to spacing{2}); a declaration at a
// block's start (\centering) read as the same as its environment. Quote in the Styles gallery
// (restyle in src/styles.js) is one use; alignment, line spacing, indents, shading and borders
// are others. Pure functions on a string; test/blockenv.test.mjs.

export const lineStart = (src, p) => src.lastIndexOf('\n', p - 1) + 1;
// whether nothing but spaces stands before p on its line
export const startsLine = (src, p) => !/\S/.test(src.slice(lineStart(src, p), p));
// the line ending of the line that holds p: a file written with CRLF keeps them
export function eolAt(src, p) {
  const k = src.indexOf('\n', p);
  return k > 0 && src[k - 1] === '\r' ? '\r\n' : '\n';
}

// The blank lines a paragraph needs before s and after e to stay a paragraph of its own: without
// one TeX runs it into the words beside it. None where one is there, where the text starts or
// ends, or where the neighbour is no paragraph (a heading, the end or the start of a block).
export const HEADING_LINE = /^\s*\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\b.*\}\s*$/;
export function blankPads(src, s, e) {
  const before = src.slice(0, s), after = src.slice(e);
  const prev = before.trimEnd().split('\n').pop(), next = after.trimStart().split('\n')[0];
  // (an environment's opening line ends a paragraph also with its arguments after it: \begin{otherlanguage}{german})
  const closed = /\\(?:(?:begin|end)\s*\{[^}]*\}(?:\s*[[{][^\]{}]*[\]}])*|maketitle|\]|par)\s*$/.test(prev) || HEADING_LINE.test(prev);
  const opens = /^\\(?:(?:begin|end)\s*\{|\[|item\b|bibliography)/.test(next) || HEADING_LINE.test(next);
  // (a file written with CRLF: its \r is a space here, and the lines added end as its own do)
  const nl = eolAt(src, s);
  return {
    b: !before.trim() || closed || /(^|\n)[ \t\r]*\n[ \t\r]*$/.test(before) ? '' : /\n[ \t\r]*$/.test(before) ? nl : nl + nl,
    a: !after.trim() || opens || /^[ \t\r]*\n[ \t\r]*\n/.test(after) ? '' : /^[ \t\r]*\n/.test(after) ? nl : nl + nl
  };
}

// \begin{name}[opt]{arg}… as written by a control
export function envOpen(name, o = {}) {
  return '\\begin{' + name + '}' + (o.opt != null && o.opt !== '' ? '[' + o.opt + ']' : '') + (o.args || []).map((a) => '{' + a + '}').join('');
}
export const envClose = (name) => '\\end{' + name + '}';

// A block [s, e) that is one environment of these names, as { name, ws, we, head: [s, hs), opt,
// args, tail: [ts, e) }: [ws, we) its words without the spaces around them, the head its \begin
// line with its arguments, the tail its \end. args: how many braced arguments the environment
// takes (spacing and adjustwidth take some). The end is looked for in the last characters alone:
// a pattern that starts with \s* is tried at every place of the text, and a stranger's
// paragraph of 60 000 spaces took seconds at every move of the caret.
// the environments that take an [option] after \begin: anywhere else "[t]" is text
export const OPT_ENVS = new Set(['tcolorbox', 'figure', 'figure*', 'table', 'table*', 'minipage', 'itemize', 'enumerate', 'description', 'wrapfigure', 'multicols', 'quote*', 'lstlisting', 'framed', 'mdframed', 'adjustwidth*']);
export function envWords(src, s, e, names, nargs = {}, opts = OPT_ENVS) {
  const m = /^\\begin\s*\{([A-Za-z*]+)\}/.exec(src.slice(s, Math.min(e, s + 200)));
  if (!m || !names.includes(m[1])) return null;
  const name = m[1];
  let i = s + m[0].length, opt = null;
  const args = [];
  const brace = (k) => { let d = 0; for (let j = k, z = Math.min(src.length, k + 4000); j < z; j++) { const c = src[j]; if (c === '\\') { j++; continue; } if (c === '{' || c === '[') d++; else if ((c === '}' || c === ']') && --d === 0) return j + 1; } return -1; };
  if (src[i] === '[' && (opts.has ? opts.has(name) : opts.includes(name))) { const z = brace(i); if (z < 0) return null; opt = src.slice(i + 1, z - 1); i = z; }
  for (let n = nargs[name] || 0; n > 0; n--) {
    if (src[i] !== '{') return null;
    const z = brace(i);
    if (z < 0) return null;
    args.push(src.slice(i + 1, z - 1));
    i = z;
  }
  let z = e;
  while (z > s && /\s/.test(src[z - 1])) z--;
  const close = envClose(name), tail = src.slice(Math.max(i, z - close.length - 20), z), k = tail.search(/\\end\s*\{[A-Za-z*]+\}$/);
  if (k < 0 || !tail.endsWith(name + '}')) return null;
  const ts = z - tail.length + k;
  let ws = i, we = ts;
  while (ws < we && /\s/.test(src[ws])) ws++;
  while (we > ws && /\s/.test(src[we - 1])) we--;
  return { name, s, e: z, ws, we, head: [s, i], tail: [ts, z], opt, args };
}

// The edits that put the paragraphs [s, e) in an environment, its lines of their own around
// them: s must start its line (else the words before it on the line would go in too).
export function wrapBlockEdits(src, s, e, name, o = {}) {
  if (!startsLine(src, s)) return null;
  const nl = eolAt(src, s);
  return [{ s: e, e, t: nl + envClose(name) }, { s, e: s, t: envOpen(name, o) + nl }];
}

// The edits that take the environment W (envWords) off its words. What wrapBlockEdits wrote, with
// the words kept apart from their neighbours without it, goes exactly (the bytes of before);
// anything else leaves the words a paragraph of their own, with the blank lines that needs.
export function unwrapBlockEdits(src, W) {
  const nl = '\r?\n';
  const asWritten = new RegExp('^' + esc(src.slice(W.head[0], W.head[1])) + nl + '$').test(src.slice(W.head[0], W.ws)) && new RegExp('^' + nl + '\\\\end\\{' + esc(W.name) + '\\}$').test(src.slice(W.we, W.e));
  const pad = blankPads(src, W.s, W.e);
  if (asWritten && !pad.b && !pad.a) return [{ s: W.we, e: W.e, t: '' }, { s: W.s, e: W.ws, t: '' }];
  return [{ s: W.we, e: W.e, t: pad.a }, { s: W.s, e: W.ws, t: pad.b }];
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The edits that give the environment W another name or other arguments; its words stay
export function rewrapBlockEdits(src, W, name, o = {}) {
  const head = envOpen(name, o), out = [];
  if (src.slice(W.tail[0], W.tail[1]) !== envClose(name)) out.push({ s: W.tail[0], e: W.tail[1], t: envClose(name) });
  if (src.slice(W.head[0], W.head[1]) !== head) out.push({ s: W.head[0], e: W.head[1], t: head });
  return out;
}

// A declaration at the start of a block (\centering, \raggedleft, as written in a figure or a
// group: {\centering …\par}), as [s, e) to take away with the spaces after it, or null
export function declAtStart(src, s, e, names) {
  let i = s;
  while (i < e && /\s/.test(src[i])) i++;
  const m = /^\\([A-Za-z]+)(?![A-Za-z])[ \t]*(?:\r?\n[ \t]*)?/.exec(src.slice(i, Math.min(e, i + 60)));
  return m && names.includes(m[1]) ? { name: m[1], s: i, e: i + m[0].length } : null;
}
