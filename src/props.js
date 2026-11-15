// File › Properties as edits on a string (src/cmd/file.js draws the dialog): the title and the
// author (\title, \author) and the PDF's subject and keywords (hyperref's pdfsubject and
// pdfkeywords). A field the person left as it was writes nothing; a changed one writes only the
// stretch that changed, so the source's own comments, line breaks, `&` of a tabular and LaTeX stay
// as they were, and only what was typed is escaped. hyperref, where nothing loads it, comes as a
// bare \usepackage{hyperref} (no option can clash with a class or a package that loads it too)
// before the packages that must follow it, its keys in a \hypersetup line. Every scan is bounded
// (preamble.js's helpers); test/file.test.mjs.

import { preambleEnd, lastCall, stripComments, packageLine, packages, usePackages, kvEdits, parseKV, docClass, eolOf } from './preamble.js';
import { diffSeq } from './diff.js';

// classes known to load hyperref themselves: a \usepackage of it would at best repeat it. Those of
// LATE set the PDF's own keys after a preamble \hypersetup (acmart in \maketitle): theirs go
// under \AtEndDocument, where a compile showed acmart's PDF taking the subject. Any other
// class may load hyperref too: hidelinks then goes only where it is new (\IfPackageLoadedTF).
const HYPER_CLASSES = new Set(['beamer', 'acmart', 'moderncv', 'tufte-handout', 'tufte-book', 'aastex631', 'aastex7', 'aastex701', 'elegantbook', 'elegantpaper', 'ctexbeamer', 'ltx-talk', 'jss']);
const LATE = new Set(['acmart', 'aastex631', 'aastex7', 'aastex701', 'elegantbook', 'elegantpaper']);
// packages documented to load after hyperref
const AFTER_HYPERREF = ['cleveref', 'hypcap', 'bookmark', 'glossaries', 'glossaries-extra', 'autonum', 'hyperxmp', 'zref-hyperref', 'algorithm', 'algorithm2e'];
const KEYS = { subject: 'pdfsubject', keywords: 'pdfkeywords' };

// the brace depth at position p of a preamble (comments as comments; at most its first 200 000 characters)
function depthAt(src, p) {
  const t = stripComments(src.slice(0, Math.min(p, 200000)));
  let d = 0;
  for (let i = 0; i < t.length; i++) { if (t[i] === '\\') { i++; continue; } if (t[i] === '{') d++; else if (t[i] === '}' && d > 0) d--; }
  return d;
}

// whether the character at i is escaped: an odd run of backslashes before it
const escaped = (s, i) => { let n = 0; while (i - n - 1 >= 0 && s[i - n - 1] === '\\') n++; return n % 2 === 1; };

// Braces pair, and the text does not end in a backslash that would take the closing brace
export function paired(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { if (i === s.length - 1) return false; i++; continue; }
    if (s[i] === '{') d++;
    else if (s[i] === '}' && --d < 0) return false;
  }
  return d === 0;
}

// Where text goes after prefix: inside math ($, \( or \[ open), and whether its first character
// is escaped already (an odd run of backslashes ends the prefix)
export function contextAt(prefix) {
  let math = false;
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i];
    if (c === '\\') { const d = prefix[i + 1]; if (d === '(' || d === '[') math = true; else if (d === ')' || d === ']') math = false; i++; continue; }
    if (c === '$') math = !math;
  }
  return { math, esc: escaped(prefix, prefix.length) };
}

// What a person typed, made safe in running text. LaTeX may be written in it (\emph{x}, $x^2$); a
// character that would stop TeX there is escaped: & % # always, _ and ^ outside math, a $ without
// its pair. ctx: the place it goes (contextAt), or true for inside math.
export function escapeTyped(t, ctx = false) {
  const inMath = ctx === true || !!(ctx && ctx.math), first = !!(ctx && ctx.esc);
  const dollars = [];
  for (let i = 0; i < t.length; i++) if (t[i] === '$' && !escaped(t, i)) dollars.push(i);
  const lone = new Set(dollars.length % 2 ? dollars : []);
  let out = '', math = inMath;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\r') continue;
    if (escaped(t, i) || (i === 0 && first)) { out += c; continue; }
    if (c === '$') { if (lone.has(i)) out += '\\$'; else { math = !math; out += c; } continue; }
    if (c === '&' || c === '%' || c === '#') { out += '\\' + c; continue; }
    if (!math && c === '_') { out += '\\_'; continue; }
    if (!math && c === '^') { out += '\\^{}'; continue; }
    out += c;
  }
  return out;
}

// The edits that turn the source text raw (as the file has it) into what the field holds now,
// value (the field holds raw with its line ends as \n), or []: one edit for each run of changed
// characters, so what lies between two changes is the source's own and never escaped; each run's
// typed text escaped in its place (contextAt of the field before it). A field over 20 000
// characters is compared as one stretch. origin, where the dialog kept it as the person typed: for
// each character of value the place in the field it came from, or -1 for one typed. The text alone
// cannot tell which of two & was typed ("Ann & Ben" to "Ann & Co & Ben"); the typing can.
export function fieldEdits(raw, value, eol = '\n', origin = null) {
  const W = raw.replace(/\r\n?/g, '\n');
  value = String(value).replace(/\r\n?/g, '\n');
  if (value === W) return [];
  // (the raw places of W's characters: a \r\n is one \n of W)
  const at = [];
  for (let i = 0; i < raw.length; i++) { at.push(i); if (raw[i] === '\r' && raw[i + 1] === '\n') i++; }
  at.push(raw.length);
  const out = [];
  const emit = (ws, we, v, t) => {
    const x = escapeTyped(t, contextAt(value.slice(0, v))).replace(/\n/g, eol);
    if (ws !== we || x) out.push({ s: at[ws], e: at[we], t: x });
  };
  if (originOk(W, value, origin)) {
    let w = 0, run = null;
    for (let k = 0; k <= value.length; k++) {
      const o = k < value.length ? origin[k] : W.length;
      if (o === -1) { if (!run) run = { ws: w, v: k, t: '' }; run.t += value[k]; continue; }
      if (o > w && !run) run = { ws: w, v: k, t: '' };
      if (run) { emit(run.ws, o, run.v, run.t); run = null; }
      w = o + 1;
    }
    return out;
  }
  let ops;
  if (W.length + value.length > 40000) {
    let p = 0;
    while (p < W.length && p < value.length && W[p] === value[p]) p++;
    let q = 0;
    while (q < W.length - p && q < value.length - p && W[W.length - 1 - q] === value[value.length - 1 - q]) q++;
    ops = [[' ', W.slice(0, p)], ['-', W.slice(p, W.length - q)], ['+', value.slice(p, value.length - q)], [' ', W.slice(W.length - q)]];
  } else ops = diffSeq([...W], [...value]);
  let w = 0, v = 0, run = null;
  const close = () => { if (run) emit(run.ws, w, run.v, run.t); run = null; };
  for (const [op, val] of ops) {
    const n = val.length;
    if (!n) continue;
    if (op === ' ') { close(); w += n; v += n; continue; }
    if (!run) run = { ws: w, v, t: '' };
    if (op === '-') w += n; else { run.t += val; v += n; }
  }
  close();
  return out;
}
// an origin that fits: one entry for each character, the kept ones in order and the same as W's
function originOk(W, value, origin) {
  if (!Array.isArray(origin) || origin.length !== value.length) return false;
  let last = -1;
  for (let k = 0; k < origin.length; k++) {
    const o = origin[k];
    if (o === -1) continue;
    if (!(o > last && o < W.length && W[o] === value[k])) return false;
    last = o;
  }
  return true;
}
// (one stretch: the edits applied to raw)
const applyTo = (raw, eds) => [...eds].sort((x, y) => y.s - x.s).reduce((t, x) => t.slice(0, x.s) + x.t + t.slice(x.e), raw);

// The argument of the last \title or \author (in the preamble, else in the first 200 000 characters)
function call(src, cmd, end) {
  return lastCall(src, cmd, end) || lastCall(src, cmd, Math.min(src.length, 200000));
}

// { title, author, subject, keywords } as the source has them, with the places they were read
// from: { value: { title: ..., ... }, at: { subject: 'setup' | 'options', ... } }
export function readProperties(src) {
  const end = preambleEnd(src), value = {}, at = {};
  for (const k of ['title', 'author']) { const c = call(src, k, end); value[k] = c ? src.slice(c.arg[0], c.arg[1]) : null; }
  const hs = end >= 0 ? lastCall(src, 'hypersetup', end) : null;
  const line = end >= 0 ? packageLine(src, 'hyperref', end) : null;
  const kvAt = (s, e) => {
    const out = new Map();
    // (comments read as comments: \hypersetup{%\n pdfsubject={X}})
    const plain = stripComments(src.slice(0, e));
    for (const x of parseKV(plain, s, e)) if (x.value != null) out.set(x.key, x.value.trim().replace(/^\{([^]*)\}$/, '$1'));
    return out;
  };
  const inSetup = hs ? kvAt(hs.arg[0], hs.arg[1]) : new Map();
  const inOpts = line && line.opts ? kvAt(line.opts[0], line.opts[1]) : new Map();
  for (const [k, key] of Object.entries(KEYS)) {
    if (inSetup.has(key)) { value[k] = inSetup.get(key); at[k] = 'setup'; }
    else if (inOpts.has(key)) { value[k] = inOpts.get(key); at[k] = 'options'; }
    else value[k] = null;
  }
  return { value, at };
}

// The edits [{s, e, t}] that set the fields of v ({ title, author, subject, keywords }, each the
// field's text; a field left out or as it was writes nothing), or { error }.
// o.others: the text of the files the preamble reads (App.preambleOthers).
export function propertyEdits(src, v, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return { error: 'This file has no preamble to hold them.' };
  const { value: cur, at } = readProperties(src), eol = eolOf(src), edits = [];
  const keys = {};
  for (const k of ['title', 'author', 'subject', 'keywords']) {
    if (v[k] == null) continue;
    const raw = cur[k] ?? '', eds = fieldEdits(raw, v[k], eol, o.origins && o.origins[k]);
    if (!eds.length) continue;
    const next = applyTo(raw, eds);
    if (!paired(next)) return { error: 'The ' + k + ' would not close: its braces do not pair, or it ends in a backslash.' };
    if (k === 'title' || k === 'author') {
      const c = call(src, k, end);
      if (c) for (const ed of eds) edits.push({ s: c.arg[0] + ed.s, e: c.arg[0] + ed.e, t: ed.t });
      else if (next) { const p = src.lastIndexOf('\n', end - 1) + 1; edits.push({ s: p, e: p, t: '\\' + k + '{' + next + '}' + eol }); }
    } else keys[k] = next;
  }
  if (!Object.keys(keys).length) return { edits };
  // (acmart's PDF has no keywords whatever is set: its own \keywords{..} prints them in the paper)
  if (keys.keywords && /^\s*\\documentclass\s*(\[[^\]]{0,400}\])?\s*\{acmart\}/.test(src.slice(0, 2000))) return { error: 'acmart leaves keywords out of the PDF: write \\keywords{...} in the document, which the paper prints.' };
  const hs = lastCall(src, 'hypersetup', end), line = packageLine(src, 'hyperref', end);
  const toOpts = {}, toSetup = {};
  for (const [k, x] of Object.entries(keys)) {
    const val = x ? '{' + x + '}' : null;
    // (each key where it is read from; a new one in \hypersetup)
    if (at[k] === 'options' && line && line.opts && line.names.length === 1) toOpts[KEYS[k]] = val;
    else toSetup[KEYS[k]] = val;
  }
  if (Object.keys(toOpts).length) {
    const [os, oe] = line.opts, ed = kvEdits(src, os, oe, toOpts);
    // (a list left with nothing loses its brackets)
    const rest = ed.reduce((t, x) => t.slice(0, x.s - os) + x.t + t.slice(x.e - os), src.slice(os, oe));
    edits.push(...(ed.length && !/\S/.test(stripComments(rest)) ? [{ s: os - 1, e: oe + 1, t: '' }] : ed));
  }
  if (!Object.keys(toSetup).length) return { edits };
  if (hs) { edits.push(...kvEdits(src, hs.arg[0], hs.arg[1], toSetup)); return { edits }; }
  const set = Object.entries(toSetup).filter(([, x]) => x != null).map(([a, b]) => a + '=' + b);
  if (!set.length) return { edits };
  const cls = docClass(src), clsName = cls ? src.slice(cls.nameAt[0], cls.nameAt[1]).trim() : '';
  const setLine = '\\hypersetup{' + set.join(',') + '}';
  const atEnd = () => { const p = src.lastIndexOf('\n', end - 1) + 1; return { s: p, e: p }; };
  if (HYPER_CLASSES.has(clsName)) {
    edits.push({ ...atEnd(), t: (LATE.has(clsName) ? '\\AtEndDocument{' + setLine + '}' : setLine) + eol });
    return { edits };
  }
  if (line) {
    // after hyperref's own line, unless that line is inside braces or a hook (\AtEndPreamble{..}),
    // where hyperref does not exist yet at the line after: then as the document begins
    if (depthAt(src, line.s) > 0) edits.push({ ...atEnd(), t: '\\AtBeginDocument{' + setLine + '}' + eol });
    else { const p = line.line[1], pre = p > 0 && src[p - 1] !== '\n' ? eol : ''; edits.push({ s: p, e: p, t: pre + setLine + (pre ? '' : eol) }); }
    return { edits };
  }
  // hyperref new to the main file: bare, before the first package that must follow it; hidelinks
  // only where nothing (the class, an \input file) has loaded it, so a class's colours stay
  const lines = '\\IfPackageLoadedTF{hyperref}{}{\\PassOptionsToPackage{hidelinks}{hyperref}}' + eol + '\\usepackage{hyperref}' + eol + setLine + eol;
  const ps = packages(src, end);
  const first = ps.find((x) => x.names.some((n) => AFTER_HYPERREF.includes(n.name)));
  if (first) { const p = src.lastIndexOf('\n', first.s - 1) + 1; edits.push({ s: p, e: p, t: lines }); return { edits }; }
  const add = usePackages(src, { hyperref: null }, { end });
  if (!add.length) return { edits };
  const x = add[0], lead = x.t.slice(0, x.t.indexOf('\\usepackage'));
  // (usePackages' line ends with a line break where it goes before a line, without one at a line's end)
  edits.push({ s: x.s, e: x.e, t: lead + (/\n$/.test(x.t) ? lines : lines.slice(0, -eol.length)) });
  return { edits };
}
