// File › Properties as edits on a string (src/cmd/file.js draws the dialog): the title and the
// author (\title, \author) and the PDF's subject and keywords (hyperref's pdfsubject and
// pdfkeywords). A field the person left as it was writes nothing; a changed one writes only the
// stretch that changed, so the source's own comments, line breaks, `&` of a tabular and LaTeX stay
// as they were, and only what was typed is escaped. hyperref, where nothing loads it, comes as a
// bare \usepackage{hyperref} (no option can clash with a class or a package that loads it too)
// before the packages that must follow it, its keys in a \hypersetup line. Every scan is bounded
// (preamble.js's helpers); test/file.test.mjs.

import { preambleEnd, lastCall, stripComments, packageLine, packages, hasPackage, usePackages, kvEdits, parseKV, docClass, eolOf } from './preamble.js';

// classes that load hyperref themselves: a \usepackage of it would at best repeat it
const HYPER_CLASSES = new Set(['beamer', 'acmart', 'moderncv', 'tufte-handout', 'tufte-book', 'aastex631', 'aastex7', 'aastex701', 'elegantbook', 'elegantpaper', 'ctexbeamer', 'ltx-talk', 'jss']);
// packages documented to load after hyperref
const AFTER_HYPERREF = ['cleveref', 'hypcap', 'bookmark', 'glossaries', 'glossaries-extra', 'autonum', 'hyperxmp', 'zref-hyperref', 'algorithm', 'algorithm2e'];
const KEYS = { subject: 'pdfsubject', keywords: 'pdfkeywords' };

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

// What a person typed, made safe in running text. LaTeX may be written in it (\emph{x}, $x^2$); a
// character that would stop TeX there is escaped: & % # always, _ and ^ outside math, a $ without
// its pair. inMath: the place it goes is inside $...$ already.
export function escapeTyped(t, inMath = false) {
  const dollars = [];
  for (let i = 0; i < t.length; i++) if (t[i] === '$' && !escaped(t, i)) dollars.push(i);
  const lone = new Set(dollars.length % 2 ? dollars : []);
  let out = '', math = inMath;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\r') continue;
    if (escaped(t, i)) { out += c; continue; }
    if (c === '$') { if (lone.has(i)) out += '\\$'; else { math = !math; out += c; } continue; }
    if (c === '&' || c === '%' || c === '#') { out += '\\' + c; continue; }
    if (!math && c === '_') { out += '\\_'; continue; }
    if (!math && c === '^') { out += '\\^{}'; continue; }
    out += c;
  }
  return out;
}

// The one edit that turns the source text raw (as the file has it) into what the field holds now,
// value; null when the field shows raw unchanged. The field holds raw with its line ends as \n.
export function fieldEdit(raw, value, eol = '\n') {
  const W = raw.replace(/\r\n?/g, '\n');
  value = String(value).replace(/\r\n?/g, '\n');
  if (value === W) return null;
  // the raw places of W's characters (a \r\n is one \n of W)
  const at = [];
  for (let i = 0; i < raw.length; i++) { at.push(i); if (raw[i] === '\r' && raw[i + 1] === '\n') i++; }
  at.push(raw.length);
  let p = 0;
  while (p < W.length && p < value.length && W[p] === value[p]) p++;
  let q = 0;
  while (q < W.length - p && q < value.length - p && W[W.length - 1 - q] === value[value.length - 1 - q]) q++;
  // (math at the place: an odd count of the $ before it)
  let dol = 0;
  for (let i = 0; i < p; i++) if (W[i] === '$' && !escaped(W, i)) dol++;
  const t = escapeTyped(value.slice(p, value.length - q), dol % 2 === 1).replace(/\n/g, eol);
  return { s: at[p], e: at[W.length - q], t };
}

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
    const raw = cur[k] ?? '', ed = fieldEdit(raw, v[k], eol);
    if (!ed) continue;
    const next = raw.slice(0, ed.s) + ed.t + raw.slice(ed.e);
    if (!paired(next)) return { error: 'The ' + k + ' would not close: its braces do not pair, or it ends in a backslash.' };
    if (k === 'title' || k === 'author') {
      const c = call(src, k, end);
      if (c) edits.push({ s: c.arg[0] + ed.s, e: c.arg[0] + ed.e, t: ed.t });
      else if (next) { const p = src.lastIndexOf('\n', end - 1) + 1; edits.push({ s: p, e: p, t: '\\' + k + '{' + next + '}' + eol }); }
    } else keys[k] = next;
  }
  if (!Object.keys(keys).length) return { edits };
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
  const loaded = !!line || hasPackage(src, 'hyperref', end, o.others) || HYPER_CLASSES.has(clsName);
  if (loaded) {
    // after hyperref's own line, or at the preamble's end when the class or another file loads it
    const p = line ? line.line[1] : src.lastIndexOf('\n', end - 1) + 1;
    const pre = p > 0 && src[p - 1] !== '\n' ? eol : '';
    edits.push({ s: p, e: p, t: pre + '\\hypersetup{' + set.join(',') + '}' + (pre ? '' : eol) });
    return { edits };
  }
  // hyperref new: bare, before the first package that must follow it, its keys set after it
  const lines = '\\usepackage{hyperref}' + eol + '\\hypersetup{hidelinks,' + set.join(',') + '}' + eol;
  const ps = packages(src, end);
  const first = ps.find((x) => x.names.some((n) => AFTER_HYPERREF.includes(n.name)));
  if (first) { const p = src.lastIndexOf('\n', first.s - 1) + 1; edits.push({ s: p, e: p, t: lines }); return { edits }; }
  const add = usePackages(src, { hyperref: null }, { end, others: o.others });
  if (!add.length) return { edits };
  const a = add[0];
  edits.push({ s: a.s, e: a.e, t: a.t.endsWith('\n') ? a.t + '\\hypersetup{hidelinks,' + set.join(',') + '}' + eol : a.t + eol + '\\hypersetup{hidelinks,' + set.join(',') + '}' });
  return { edits };
}
