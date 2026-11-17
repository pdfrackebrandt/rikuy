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

// Anyone can make a link, so what it holds is checked before it is opened. A link of half a
// megabyte can inflate to gigabytes; text this long is no document anyone shares.
const MAX_JSON = 32e6, MAX_FILES = 2000, MAX_LABEL = 200;

async function inflateCapped(bytes, cap) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > cap) { reader.cancel().catch(() => {}); throw new Error('The document in this link is too large to open.'); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// A file name from outside (a link, a .zip, a folder) as the project keeps it: forward slashes,
// no leading slash, no empty, . or .. parts, no .git folder, no control characters. null when it
// cannot be made safe, so no file lands outside the project's folder in TeX's file system or
// in git, whatever name a stranger gave it.
export function cleanPath(name) {
  if (typeof name !== 'string' || name.length > 1024) return null;
  const parts = name.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
  if (!parts.length || parts.some((p) => p === '..' || p.toLowerCase() === '.git' || /[\u0000-\u001f\u007f]/.test(p))) return null;
  return parts.join('/');
}

const label = (x, dflt) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, MAX_LABEL) : dflt);

// { v, name, main, files: [[name, text]], base, by, role, rid, t } -> the text after "#share="
// role: 'coauthor' (edits and comments), 'comments' (comments only) or 'back' (a copy sent back);
// rid: the link's own random name, which a copy sent back carries, so the sender's browser knows
// which link it answers and what that link allowed (src/collab.js takeBack)
export async function packShare(o) {
  const z = await through(enc.encode(JSON.stringify(o)), new CompressionStream('deflate-raw'));
  return V + b64url(z);
}

export async function unpackShare(s) {
  let o;
  try {
    s = decodeURIComponent(String(s).trim());
  } catch (e) { throw new Error('The link is damaged or cut short.'); }
  if (!s.startsWith(V)) throw new Error('This link was made by another version of the editor.');
  try {
    o = JSON.parse(dec.decode(await inflateCapped(unb64url(s.slice(V.length)), MAX_JSON)));
  } catch (e) {
    if (/too large/.test(e.message)) throw e;
    throw new Error('The link is damaged or cut short.');
  }
  if (!o || typeof o !== 'object' || !Array.isArray(o.files) || !o.files.length) throw new Error('The link does not hold a document.');
  if (o.files.length > MAX_FILES) throw new Error('The link holds too many files.');
  // every field is the sender's to choose: keep only well formed files with safe names
  const files = [];
  for (const f of o.files) {
    const n = Array.isArray(f) && typeof f[1] === 'string' ? cleanPath(f[0]) : null;
    if (n === null) throw new Error('The link holds a file with a name or content the editor cannot accept.');
    files.push([n, f[1]]);
  }
  const main = cleanPath(o.main);
  if (!main || !files.some(([n]) => n === main)) throw new Error('The link does not hold a document.');
  const out = {
    v: 1, name: label(o.name, main), main, files,
    base: typeof o.base === 'string' && o.base.length <= 100 ? o.base : null,
    by: label(o.by, 'A coauthor'), role: o.role === 'back' ? 'back' : o.role === 'comments' ? 'comments' : 'coauthor',
    rid: typeof o.rid === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(o.rid) ? o.rid : null
  };
  if (typeof o.t === 'number') out.t = o.t;
  // no sender named (Share always names one; a link built by hand may not): the reader's own
  // document, with nobody to mark edits for or send them back to
  if (out.role !== 'back' && !label(o.by, '')) out.own = true;
  return out;
}

// A link anyone can build with no compression code: "#tex=" and the base64url of one LaTeX
// file in UTF-8 (plain base64 with + / and = is read too, as most tools write that). What
// comes out has the shape unpackShare gives, and is opened by the same steps.
const MAX_TEX = 1e6; // characters: 750 kB of source, about the longest address every browser takes

// the payload of such a link, or null (in the fragment only: ?tex= is other sites' to use)
export function texParam(text) {
  const m = /#(?:[^#\s]*&)?tex=([A-Za-z0-9._%+/=-]*)/.exec(String(text || ''));
  return m ? m[1] : null;
}

export function unpackTex(s) {
  s = String(s).trim();
  if (s.length > MAX_TEX) throw new Error('The document in this link is too large to open: a #tex= link holds up to 750 kB of LaTeX. A #share= link is compressed and holds more, and Open takes a .tex file of any size.');
  let text;
  try {
    s = decodeURIComponent(s).replace(/=+$/, '');
    if (!/^[A-Za-z0-9_+/-]*$/.test(s) || s.length % 4 === 1) throw new Error('not base64');
    text = new TextDecoder('utf-8', { fatal: true }).decode(unb64url(s));
  } catch (e) { throw new Error('The link is damaged or cut short.'); }
  if (!text.trim()) throw new Error('The link does not hold a document.');
  // base64 cut at a multiple of four still decodes: a link shortened on its way (chat and mail
  // programs do that) would open as the first part of the document. A whole one ends itself.
  if (!/\\end\s*\{document\}/.test(text)) throw new Error('The link is cut short, or what it holds is not a whole LaTeX document: it has no \\end{document}.');
  return { v: 1, name: 'main.tex', main: 'main.tex', files: [['main.tex', text]], base: null, by: '', role: 'coauthor', own: true };
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

// (a line is TeX's: it ends at a line feed or a carriage return, so neither is in a comment line;
// a CRLF file's lines keep their \r at the end: review H1)
const LINE = /^[ \t]*%[ \t]*(comment|reply)[ \t]*\(([^)\n\r\u0085\u2028\u2029]*)\)(?:[ \t]+on[ \t]+"([^"\n\r\u0085\u2028\u2029]*)")?[ \t]*:[ \t]?([^\n\r\u0085\u2028\u2029]*)\r?$/i;

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
// (any environment whose name says code, verbatim, a listing, a file written or a program run:
// tcblisting, VerbatimOut, luacode*, pycode, sagesilent, asy, gnuplot, scontents, verbatimwrite
// and their like; a % line there is printed, written or run, not dropped: review M2)
const VERBATIM = /\\(begin|end)\s*\{([A-Za-z@]{0,40}(?:verb|Verb|listing|minted|code|lua|py|sage|asy|gnuplot|contents|Out|write|tcb|comment|alltt|Sinput|Soutput|Schunk|tikz|pgf|forest|lily|only|dot|ipe|mp)[A-Za-z@]{0,40}\*?)\}/g;
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
  // Take every one of their hunks, and every one of mine that clashes with none of theirs, so my
  // edits on lines they did not touch survive: a clash on one line must not throw away the rest of
  // my work. Where we do clash, their version wins (and the result is flagged as not clean, so the
  // author is told and keeps the pre-merge text under Versions).
  let clean = true;
  const keep = [];
  for (const a of A) { if (C.some((c) => clash(a, c))) clean = false; else keep.push(a); }
  // an insertion at a point goes before a replacement that starts there
  let out = '', p = 0;
  for (const h of [...keep, ...C].sort((x, y) => x.s - y.s || x.e - y.e)) {
    if (h.s < p) continue; // a kept hunk never overlaps a later one, but never write past p
    out += base.slice(p, h.s) + h.t; p = h.e;
  }
  return { text: out + base.slice(p), clean };
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
const COMMENT_LINES = /(^|\n)[ \t]*%[ \t]*(?:comment|reply)[ \t]*\([^)\n\r]*\)[^\n\r]*/gi;
const bare = (t) => String(t).replace(COMMENT_LINES, '$1').replace(/\s+/g, ' ').trim();
const HAS = /%[ \t]*(?:comment|reply)[ \t]*\(/i;
export const commentOnly = (c) => (HAS.test(c.a) || HAS.test(c.b)) && bare(c.a) === bare(c.b);

// whether after differs from before only in its comment lines (added, removed, changed): what a
// comments only link lets through (src/collab.js); bounded, one pass over each text
const WHOLE = /^[ \t]*%[ \t]*(?:comment|reply)[ \t]*\([^)\n\r]*\)[^\n\r]*(?:\r?\n|$)/gim;
const isComment = (line) => !!parseCommentLine(line.replace(/\r?\n$/, ''));
export function onlyComments(before, after) {
  // (a line end added at the very end, as a comment under the last line brings, is no change)
  const strip = (t) => String(t).replace(WHOLE, '').replace(/\n$/, '');
  return strip(before) === strip(after);
}

// What of theirs a comments only link lets in: base with their comment lines, and without the
// comment lines they took out, and nothing else. Line by line in each hunk: a comment line of
// theirs goes after the line of the base it stands under in their copy (that line's own comments
// first); one under a line they changed, under the line before that; at the hunk's start if none. { text, dropped: hunks whose
// text they changed, left out }
// (where TeX reads lines as they are, verbatim, listings, filecontents and the like, a % line is
// printed or written to a file, so no comment line goes there: security review)
function verbatimRanges(text) {
  const out = [];
  let depth = 0, from = 0;
  VERBATIM.lastIndex = 0;
  for (let m, k = 0; (m = VERBATIM.exec(text)) && k < 100000; k++) {
    if (m[1] === 'begin') { if (depth++ === 0) from = m.index; } else if (depth > 0 && --depth === 0) out.push([from, m.index + m[0].length]);
  }
  if (depth > 0) out.push([from, text.length]);
  return out;
}
const inRanges = (R, p) => { let lo = 0, hi = R.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (R[m][1] <= p) lo = m + 1; else if (R[m][0] >= p) hi = m - 1; else return true; } return false; };
// A document where % may not end a line as a comment: a file of the project that names a catcode
// at all, in any syntax (\catcode`\%, \catcode`\^^25, \catcode\numexpr36+1\relax, expl3's
// \char_set_catcode:nn {37}, a catcode table, \makeother, \@sanitize, \dospecials, a ^^ code):
// no comment line comes in (the words alone: syntax has too many forms, review V1)
export const PERCENT_CATCODE = /catcode|cctab|makeother|@sanitize|dospecials|\^\^/;
// (and the line ends some engines read beside it: NEL, U+2028, U+2029)
const LONE_CR = /\r(?!\n)|[\u0085\u2028\u2029]/;
// o.at(p): whether a line may go in at offset p of base (the caller's knowledge of the document:
// body text, not code); o.none: no comment line at all (a catcode of % changed)
export function commentsOf(base, theirs, o = {}) {
  if (base === theirs) return { text: base, dropped: 0 };
  // (a lone \r ends TeX's line where Rikuy reads on: nothing of such a copy is taken, review H1)
  if (o.none || LONE_CR.test(theirs) || PERCENT_CATCODE.test(base)) return { text: base, dropped: 1 };
  let out = '', p = 0, dropped = 0;
  const lines = (t) => t.match(/[^\n]*\n|[^\n]+$/g) || [];
  const verb = verbatimRanges(base);
  const begin = base.search(/\\begin\s*\{document\}/);
  // (where a comment line may go in or come out: in the body, out of code, as the caller allows)
  const ok = (q) => !(begin >= 0 && q <= begin) && !inRanges(verb, q) && (!o.at || o.at(q));
  for (const h of hunks(base, theirs)) {
    out += base.slice(p, h.as);
    p = h.as + h.a.length;
    const A = lines(h.a), B = lines(h.b);
    // each line of the base's hunk with where it starts and ends
    const pos = [];
    let q = h.as;
    for (const l of A) { pos.push([q, q + l.length]); q += l.length; }
    let lost = false;
    // their comment lines taken out: only where a comment line may stand
    const keepIdx = [];
    A.forEach((l, i) => { if (!isComment(l) || B.includes(l) || !ok(pos[i][0])) { keepIdx.push(i); if (isComment(l) && !B.includes(l)) lost = true; } });
    const keep = keepIdx.map((i) => A[i]);
    const res = keep.map((l) => [l]);
    let anchor = -1;
    const head = [];
    for (const l of B) {
      // (a line they changed keeps the anchor before it: its comments go under the line above)
      if (!isComment(l)) { const k = keep.findIndex((x) => x.replace(/\r?\n$/, '') === l.replace(/\r?\n$/, '')); if (k >= 0) anchor = k; else lost = true; continue; }
      if (A.includes(l)) continue;
      const at = anchor < 0 ? h.as : pos[keepIdx[anchor]][1];
      if (!ok(at)) { lost = true; continue; }
      const line = l.endsWith('\n') ? l : l + '\n';
      if (anchor < 0) { head.push(line); continue; }
      // (under a last line with no line end: the line ends first, which TeX reads as it did)
      const g = res[anchor];
      if (!g[g.length - 1].endsWith('\n')) g[g.length - 1] += '\n';
      g.push(line);
    }
    // (lines of the base they removed that are no comment: kept, and counted)
    if (A.some((l, i) => !isComment(l) && !keepIdx.includes(i))) lost = true;
    if (lost || B.length - B.filter(isComment).length !== A.length - A.filter(isComment).length) dropped++;
    out += head.join('') + res.map((g) => g.join('')).join('');
  }
  return { text: out + base.slice(p), dropped };
}

// Where in file f the model reads body text: in its blocks of paragraphs, headings, lists,
// displays, floats and tables, out of any brace group (an argument a command may read as it
// stands, \url{...}'s), and in what is only white space beside such a block. blocks:
// buildModel(...).blocks of the base; text: that file's base text. An environment the model does
// not know, raw TeX, pictures, a file the document never reads: none of these.
const BODY_ITEMS = new Set(['p', 'h', 'math', 'float', 'title', 'space', 'rule', 'pagebreak', 'pagemark', 'toc', 'caption', 'tabular', 'idx', 'refs']);
export function bodyAt(blocks, f, text) {
  const body = (b) => b.plain || (Array.isArray(b.items) && b.items.length > 0 && b.items.every((i) => i && BODY_ITEMS.has(i.type) && !i.envTag && !/\bunk\b/.test(i.cls || '')));
  const B = blocks.filter((b) => b.f === f && Number.isInteger(b.s) && Number.isInteger(b.e)).sort((a, b) => a.s - b.s);
  const R = [];
  B.forEach((b, i) => {
    const ok = body(b);
    if (ok) R.push([b.s, b.e, true]);
    const n = B[i + 1];
    if (n && (ok || body(n)) && n.s > b.e && /^\s*$/.test(text.slice(b.e, n.s))) R.push([b.e, n.s, false]);
  });
  // (brace depth from the block's start: a % line inside a group is out)
  const flat = (s, q) => {
    let d = 0;
    for (let i = s; i < q; i++) {
      const c = text[i];
      if (c === '\\') { i++; continue; }
      if (c === '%') { while (i < q && text[i] !== '\n') i++; continue; }
      if (c === '{') d++;
      else if (c === '}') d--;
    }
    return d === 0;
  };
  return (q) => R.some(([s, e, blk]) => q >= s && q <= e && (!blk || flat(s, q)));
}

// A copy back from a link for comments only, file by file: comment lines come in only in .tex and
// .ltx files, where at(f) (bodyAt) says the model reads body text, and in none where a file of the
// project changes what % is; every other file stays byte for byte as the base had it, and a file
// they added or removed is not taken (review H2, M2)
export function commentsBack(baseFiles, theirs, at) {
  const none = [...baseFiles].some(([n, t]) => /\.(tex|ltx|sty|cls|def|cfg|clo|dtx|ins)$/i.test(n) && PERCENT_CATCODE.test(t));
  const files = new Map();
  let dropped = 0;
  for (const [n, b] of baseFiles) {
    const t = theirs.get(n);
    if (t === b) { files.set(n, b); continue; }
    if (t == null || !/\.(tex|ltx)$/i.test(n)) { files.set(n, b); dropped++; continue; }
    const r = commentsOf(b, t, { none, at: at ? at(n) : () => false });
    files.set(n, r.text);
    dropped += r.dropped;
  }
  for (const n of theirs.keys()) if (!baseFiles.has(n)) dropped++;
  return { files, dropped };
}

// What a copy sent back may bring in, from the versions this browser shared ({sig, share: {rid,
// role}}): the link it names by rid, else, where any link of that version was for comments only,
// comments only (a copy cannot lift its own limit by dropping or changing its link's name)
export function linkRole(snaps, sig, rid) {
  const same = (snaps || []).filter((v) => v && v.sig === sig && v.share);
  const link = rid && same.find((v) => v.share.rid === rid);
  return link ? (link.share.role === 'comments' ? 'comments' : 'coauthor') : same.some((v) => v.share.role === 'comments') ? 'comments' : 'coauthor';
}
