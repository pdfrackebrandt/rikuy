// Sharing without a server or an account. A project travels inside a link (deflated JSON in the
// fragment, which browsers never send to a server), comments live in the .tex itself as LaTeX
// comments, so Overleaf, Git and every TeX keep them and print nothing, and a coauthor's copy
// comes back as a three way merge against the version that was shared.

import { hunks } from './diff.js';

// ---- links --------------------------------------------------------------------------------

const V = '1.';  // format of the payload, so a later format can still read old links
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function through(bytes, stream) {
  const r = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(r).arrayBuffer());
}

// { v, name, main, files: [[name, text]], base, by, role, t } -> the text after "#share="
export async function packShare(o) {
  const z = await through(enc.encode(JSON.stringify(o)), new CompressionStream('deflate-raw'));
  return V + b64url(z);
}

export async function unpackShare(s) {
  s = decodeURIComponent(String(s).trim());
  if (!s.startsWith(V)) throw new Error('This link was made by another version of the editor.');
  const o = JSON.parse(dec.decode(await through(unb64url(s.slice(V.length)), new DecompressionStream('deflate-raw'))));
  if (!o || !Array.isArray(o.files) || !o.main) throw new Error('The link does not hold a document.');
  return o;
}

// the payload of a link or of a pasted URL, or null
export function shareParam(text) {
  const m = /[#&?]share=([A-Za-z0-9._%-]+)/.exec(String(text || ''));
  return m ? m[1] : null;
}

// ---- comments in the source ---------------------------------------------------------------
//   % comment (Ana) on "the source map": Is this the right term?
//   % reply (Pedro): Yes, as in the literature.
// A comment refers to the nearest line above it that is not a comment line. On its own line, a
// comment changes nothing TeX typesets: TeX drops it with its line end, and the line above
// already ended in a space.

const LINE = /^[ \t]*%[ \t]*(comment|reply)[ \t]*\(([^)\n]*)\)(?:[ \t]+on[ \t]+"([^"\n]*)")?[ \t]*:[ \t]?([^\n]*)$/i;

export function parseCommentLine(line) {
  const m = LINE.exec(line);
  return m ? { kind: m[1].toLowerCase(), who: m[2].trim(), quote: m[3] || '', body: m[4].trim() } : null;
}

// every comment thread of a file: { f, s, e, who, quote, body, replies: [{who, body}], as, ae }
// [s, e) are the comment lines with their line ends, [as, ae) the line they refer to
export function findComments(text, f) {
  const out = [];
  let pos = 0, prevS = 0, prevE = 0, thread = null;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos);
    const next = end < 0 ? text.length : end + 1;
    if (end < 0) end = text.length;
    const c = parseCommentLine(text.slice(pos, end));
    if (c && c.kind === 'comment') {
      thread = { f, s: pos, e: next, who: c.who, quote: c.quote, body: c.body, replies: [], as: prevS, ae: prevE };
      out.push(thread);
    } else if (c && c.kind === 'reply' && thread && thread.e === pos) {
      thread.replies.push({ who: c.who, body: c.body });
      thread.e = next;
    } else if (!c) {
      thread = null;
      if (text.slice(pos, end).trim()) { prevS = pos; prevE = end; }
    }
    pos = next;
  }
  return out;
}

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const quoteOf = (t) => { t = clean(t).replace(/"/g, "'"); return t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t; };
const whoOf = (t) => clean(t).replace(/[()]/g, '') || 'Anonymous';

// environments whose lines TeX reads as they are: a % there would be printed
const VERBATIM = /\\(begin|end)\{(verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|lstlisting|minted|comment|filecontents\*?|alltt|code)\}/g;
function inVerbatim(text, p) {
  let depth = 0;
  VERBATIM.lastIndex = 0;
  let m;
  while ((m = VERBATIM.exec(text)) && m.index < p) depth += m[1] === 'begin' ? 1 : -1;
  return depth > 0;
}

// the edit {s, e, t} that adds a comment (or a reply) under the line holding offset p, after
// the comments already there; null where a comment would change the document
export function commentEdit(text, p, { who, quote, body, reply }) {
  body = clean(body);
  if (!body) return null;
  const begin = text.search(/\\begin\s*\{document\}/);
  if (begin >= 0 && p < begin) return null;
  if (inVerbatim(text, p)) return null;
  let at = text.indexOf('\n', p);
  let pre = '';
  if (at < 0) { at = text.length; pre = '\n'; } else at += 1;
  // a new thread goes after the comment lines already under this line; a reply right under its own
  while (!reply && at < text.length) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    if (!parseCommentLine(text.slice(at, end))) break;
    at = Math.min(text.length, end + 1);
    if (end === text.length) { pre = '\n'; break; }
  }
  const head = reply ? '% reply (' + whoOf(who) + ')' : '% comment (' + whoOf(who) + ')' + (quote && clean(quote) ? ' on "' + quoteOf(quote) + '"' : '');
  return { s: at, e: at, t: pre + head + ': ' + body + '\n' };
}

// the source without the comment threads (for an export without them)
export function stripComments(text) {
  let out = '', pos = 0;
  for (const c of findComments(text, '')) { out += text.slice(pos, c.s); pos = c.e; }
  return out + text.slice(pos);
}

// ---- bringing a coauthor's copy back ------------------------------------------------------

// two edits of the same base clash when their ranges overlap, or when both insert at one point
// (which goes first is anyone's guess)
const clash = (a, c) => (a.s < c.e && c.s < a.e) || (a.s === a.e && c.s === c.e && a.s === c.s);

// base -> mine and base -> theirs, line by line: both kept when they touch different lines
export function merge3(base, mine, theirs) {
  if (theirs === base || theirs === mine) return { text: mine, clean: true };
  if (mine === base) return { text: theirs, clean: true };
  const A = hunks(base, mine).map((h) => ({ s: h.as, e: h.as + h.a.length, t: h.b }));
  const C = hunks(base, theirs).map((h) => ({ s: h.as, e: h.as + h.a.length, t: h.b }));
  for (const a of A) for (const c of C) if (clash(a, c)) return { text: theirs, clean: false };
  // an insertion at a point goes before a replacement that starts there
  let out = '', p = 0;
  for (const h of [...A, ...C].sort((x, y) => x.s - y.s || x.e - y.e)) { out += base.slice(p, h.s) + h.t; p = h.e; }
  return { text: out + base.slice(p), clean: true };
}

// whole projects as Maps name -> text; a file one side removed and the other left alone goes
export function mergeProjects(base, mine, theirs) {
  const files = new Map(), conflicts = [];
  for (const n of new Set([...base.keys(), ...mine.keys(), ...theirs.keys()])) {
    const b = base.get(n), m = mine.get(n), t = theirs.get(n);
    if (t === undefined) { if (m !== undefined && b === undefined) files.set(n, m); else if (m !== undefined && m !== b) files.set(n, m); continue; }
    if (m === undefined) { if (b === undefined || t !== b) files.set(n, t); continue; }
    const r = merge3(b ?? '', m, t);
    if (!r.clean) conflicts.push(n);
    files.set(n, r.text);
  }
  return { files, conflicts };
}

// a tracked change that only adds or removes comment lines: the Review tab shows those as
// comments, not as changes to the text
const COMMENT_LINES = /(^|\n)[ \t]*%[ \t]*(?:comment|reply)[ \t]*\([^)\n]*\)[^\n]*/gi;
const bare = (t) => String(t).replace(COMMENT_LINES, '$1').replace(/\s+/g, ' ').trim();
const HAS = /%[ \t]*(?:comment|reply)[ \t]*\(/i;
export const commentOnly = (c) => (HAS.test(c.a) || HAS.test(c.b)) && bare(c.a) === bare(c.b);
