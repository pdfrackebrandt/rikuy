// The preamble as edits: a package added once, options merged into the line that loads it, the
// class's options, key=value lists (geometry, hyperref, enumitem and the like), a definition
// written once. Every function reads the text it is given and returns edits [{s, e, t}] on it
// (applyEdits in src/styles.js applies them, App.commit takes them with the file's name), or []
// when nothing needs to change, so the same call twice changes nothing the second time.
//
// The preamble may be a stranger's (a share link, an imported project): nothing here runs a
// pattern that can backtrack over the whole text, every scan is bounded, and comments are read
// as comments (a % line that names \usepackage loads nothing). test/preamble.test.mjs.

const MAX = 200000; // the most of a preamble read
const GROUP = 4000; // the most of one argument read

// The text with each comment's characters (from an unescaped % to the line's end) made spaces,
// so offsets stay those of the text
export function stripComments(t) {
  let out = '', i = 0;
  const n = Math.min(t.length, MAX * 2);
  while (i < n) {
    const c = t[i];
    if (c === '\\') { out += t.slice(i, i + 2); i += 2; continue; }
    if (c === '%') { const j = t.indexOf('\n', i); const e = j < 0 ? n : j; out += ' '.repeat(e - i); i = e; continue; }
    out += c; i++;
  }
  return out + t.slice(n);
}

// the line end a text is written with: CRLF where its first line ends so, else LF
export function eolOf(t) { const k = String(t).indexOf('\n'); return k > 0 && t[k - 1] === '\r' ? '\r\n' : '\n'; }

// where the preamble ends: the first \begin{document} that is no comment's, or -1
export function preambleEnd(src) {
  const m = /\\begin\s*\{document\}/.exec(stripComments(src.slice(0, MAX)));
  return m ? m.index : -1;
}

// the balanced group that opens at i ({ or [), as [i, end) with end after its closing one, or -1
export function groupEnd(t, i, limit = 20000) {
  const open = t[i], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let k = i, z = Math.min(t.length, i + limit); k < z; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (open === '[' && c === '{') { const e = groupEnd(t, k, limit); if (e < 0) return -1; k = e - 1; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return k + 1;
  }
  return -1;
}
// spaces and one line break, as TeX skips them between a command and its arguments
const skipWs = (t, i) => { let nl = 0; while (i < t.length && /\s/.test(t[i])) { if (t[i] === '\n' && ++nl > 1) break; i++; } return i; };

// Every \usepackage and \RequirePackage of the preamble, comments left out:
// [{ cmd, s, e, line: [ls, le), opts: [os, oe) or null, names: [{ name, s, e }], list: [ns, ne) }]
export function packages(src, end) {
  if (end == null) end = preambleEnd(src);
  const pre = stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end));
  const out = [], re = /\\(usepackage|RequirePackage)(?![A-Za-z@])/g;
  // (every match counts toward the bound, the ones that lead nowhere too, each group is read
  // 4000 characters at most, and after 20 groups that never close the rest is not read: 15 000
  // unclosed \usepackage[{ took a second for each look, and LaTeX itself stops at the first)
  let m, n = 0, bad = 0;
  while ((m = re.exec(pre)) && n++ < 4000 && out.length < 2000) {
    let i = skipWs(pre, m.index + m[0].length), opts = null;
    if (pre[i] === '[') { const e = groupEnd(pre, i, GROUP); if (e < 0) { if (++bad > 20) break; continue; } opts = [i + 1, e - 1]; i = skipWs(pre, e); }
    if (pre[i] !== '{') continue;
    const e = groupEnd(pre, i, GROUP);
    if (e < 0) { if (++bad > 20) break; continue; }
    const names = [];
    const body = pre.slice(i + 1, e - 1);
    for (let k = 0, re2 = /[^,\s][^,]*/g, n; (n = re2.exec(body)) && k < 100; k++) {
      const nm = n[0].trim();
      if (nm) names.push({ name: nm, s: i + 1 + n.index, e: i + 1 + n.index + n[0].trimEnd().length });
    }
    // (a version date after it: \usepackage{x}[2020/01/01])
    let z = e;
    if (pre[skipWs(pre, z)] === '[') { const v = groupEnd(pre, skipWs(pre, z), GROUP); if (v > 0) z = v; }
    const ls = pre.lastIndexOf('\n', m.index - 1) + 1, nl = pre.indexOf('\n', z);
    out.push({ cmd: m[1], s: m.index, e: z, line: [ls, nl < 0 ? pre.length : nl + 1], opts, names, list: [i + 1, e - 1] });
    re.lastIndex = e;
  }
  return out;
}

// the line that loads a package (the last one, as LaTeX takes the first and ignores the rest
// except for an option clash; the first is what it uses), or null
export function packageLine(src, name, end) {
  return packages(src, end).find((p) => p.names.some((n) => n.name === name)) || null;
}
// (others: the text of the files the preamble reads, as usePackages takes them)
export const hasPackage = (src, name, end, others) => !!packageLine(src, name, end) || (others || []).some((t) => !!packageLine(t, name, -1));

// ---- key=value lists ----------------------------------------------------------------------
// [{ key, value (null for a flag), s, e }] of a comma list at [s, e) of t; commas in braces and
// brackets stay inside their value. Comments are read as comments: [%\n 11pt,%\n a4paper%\n] holds
// 11pt and a4paper, and an item's range ends before a comment after it.
export function parseKV(t, s = 0, e = t.length) {
  const u = stripComments(t.slice(s, e)), out = [];
  let start = 0;
  const push = (z) => {
    const raw = u.slice(start, z);
    const a = start + (raw.length - raw.trimStart().length), b = z - (raw.length - raw.trimEnd().length);
    if (b > a) {
      const item = u.slice(a, b), q = item.indexOf('=');
      out.push(q < 0 ? { key: item, value: null, s: s + a, e: s + b } : { key: item.slice(0, q).trim(), value: item.slice(q + 1).trim(), s: s + a, e: s + b });
    }
  };
  for (let i = 0; i < u.length; i++) {
    const c = u[i];
    if (c === '\\') { i++; continue; }
    if (c === '{' || c === '[') { const z = groupEnd(u, i, GROUP); if (z < 0) break; i = z - 1; continue; }
    if (c === ',') { push(i); start = i + 1; }
  }
  push(u.length);
  return out;
}
const kvText = (key, value) => (value === true || value == null ? key : key + '=' + value);

// The edits that set keys in the list at [s, e) of src: { key: value } sets or replaces, true a
// flag, null takes the key out. Keys the list does not have go at its end, in the order given.
// drop(key) also takes out any key it says yes to (a4paper when letterpaper is set). The list
// from its first item to its last is written again from what stays, the text between two items
// (a comma, spaces, a comment) as it was, and returned as one edit: edits made item by item
// overlapped where two neighbours went ([a=1,b=2,c=3] without all three left "[{").
export function kvEdits(src, s, e, changes, drop) {
  const items = parseKV(src, s, e), want = Object.entries(changes), done = new Set(), kept = [];
  // keys set anew that the list does not hold take the place of the first item that goes for
  // them: those of its family together (a4paper becomes letterpaper, or paperwidth and
  // paperheight, where it stood, its comments around it kept), else the first of them
  const fresh = want.filter(([key, v]) => v !== null && !items.some((it) => it.key === key));
  items.forEach((it, k) => {
    const ch = want.find(([key]) => key === it.key);
    if (ch) done.add(ch[0]);
    if (!ch && drop && drop(it.key) && fresh.length) {
      const kin = fresh.filter(([key]) => drop(key)), take = kin.length ? kin : [fresh[0]];
      for (const [key, v] of take) { done.add(key); kept.push({ k: kept.some((x) => x.k === k) ? -2 : k, text: kvText(key, v) }); fresh.splice(fresh.findIndex(([x]) => x === key), 1); }
      return;
    }
    if ((ch && ch[1] === null) || (!ch && drop && drop(it.key))) return;
    const same = !ch || (ch[1] === true && it.value == null) || (it.value != null && String(ch[1]) === it.value);
    kept.push({ k, text: same ? src.slice(it.s, it.e) : kvText(it.key, ch[1]) });
  });
  for (const [key, v] of want) if (!done.has(key) && v !== null) kept.push({ k: -1, text: kvText(key, v) });
  const first = items.length ? items[0].s : s, last = items.length ? items[items.length - 1].e : s;
  let out = '';
  kept.forEach((x, n) => {
    // (between two items that both stay, what stood before the later one; else a comma)
    if (n) out += x.k > 0 && kept[n - 1].k >= 0 && kept[n - 1].k !== x.k ? src.slice(items[x.k - 1].e, items[x.k].s) : ',';
    out += x.text;
  });
  const d = diffText(src.slice(first, last), out);
  return d ? [{ s: first + d.s, e: first + d.e, t: d.t }] : [];
}
// kvEdits on the options in brackets [os, oe): a list left with nothing loses its brackets
function optionEdits(src, os, oe, changes, drop) {
  const e = kvEdits(src, os, oe, changes, drop);
  if (e.length && !/\S/.test(stripComments(applyOne(src.slice(os, oe), e[0].s - os, e[0].e - os, e[0].t)))) return [{ s: os - 1, e: oe + 1, t: '' }];
  return e;
}
const applyOne = (t, s, e, x) => t.slice(0, s) + x + t.slice(e);
function diffText(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let z = 0;
  while (z < a.length - p && z < b.length - p && a[a.length - 1 - z] === b[b.length - 1 - z]) z++;
  return p === a.length && p === b.length ? null : { s: p, e: a.length - z, t: b.slice(p, b.length - z) };
}

// ---- packages -------------------------------------------------------------------------------
// The brace depth and the depth of \if ... \fi at each of these places of a preamble (comments
// already blanked): a line added after a \usepackage inside \ifpdf ... \else or the braces of
// \IfFileExists{...}{...} would load its package only on one branch
function levels(pre, at) {
  const want = new Set(at), out = new Map();
  let braces = 0, conds = 0, newif = false;
  for (let i = 0; i < pre.length; i++) {
    if (want.has(i)) out.set(i, [braces, conds]);
    const c = pre[i];
    if (c === '{') braces++;
    else if (c === '}') braces = Math.max(0, braces - 1);
    else if (c === '\\') {
      const m = /^[A-Za-z@]+/.exec(pre.slice(i + 1, i + 40));
      if (!m) { i++; continue; }
      const w = m[0];
      if (w === 'newif') newif = true;
      else if (newif) newif = false;
      // (\iff is a symbol, \ifthenelse a command with arguments: neither opens a conditional)
      else if (/^if/.test(w) && w !== 'iff' && w !== 'ifthenelse') conds++;
      else if (w === 'fi') conds = Math.max(0, conds - 1);
      i += w.length;
    }
  }
  return out;
}

// the place just after the \documentclass line, or -1
function afterClass(src, end) {
  const pre = stripComments(src.slice(0, end));
  const d = /\\documentclass\b/.exec(pre);
  if (!d) return -1;
  let i = skipWs(pre, d.index + 14);
  if (pre[i] === '[') { const z = groupEnd(pre, i, GROUP); if (z > 0) i = skipWs(pre, z); }
  if (pre[i] !== '{') return -1;
  const z = groupEnd(pre, i, GROUP);
  if (z < 0) return -1;
  const nl = pre.indexOf('\n', z);
  return nl < 0 || nl >= end ? end : nl + 1;
}

// Where a new line goes in the preamble: after the last \usepackage line that is loaded whatever
// happens (outside braces and conditionals); with \usepackage lines but none of those, just before
// \begin{document}; with none, after the \documentclass line, else at the preamble's end. And
// what goes before it (a line break when the text there does not end one).
function newLineAt(src, end) {
  const ps = packages(src, end).filter((p) => p.cmd === 'usepackage');
  let at = -1;
  if (ps.length) {
    const lv = levels(stripComments(src.slice(0, end)), ps.map((p) => p.s));
    const sure = ps.filter((p) => { const l = lv.get(p.s); return l && !l[0] && !l[1]; });
    at = sure.length ? sure[sure.length - 1].line[1] : src.lastIndexOf('\n', end - 1) + 1;
  } else at = afterClass(src, end);
  if (at < 0 || at > end) at = end;
  return { at, pre: at > 0 && src[at - 1] !== '\n' ? '\n' : '' };
}

// ---- which packages give another's commands, and which must come first --------------------------
// Packages whose commands a class or another package gives already: a second load is useless, and
// amssymb after newtxmath, newpxmath, unicode-math or acmart stops TeX ("\Bbbk already defined",
// checked in the page's TeX Live). mathabx, MnSymbol and stix give no \mathbb of amssymb's: not here.
const PROVIDED = {
  amsmath: { pkgs: ['mathtools', 'empheq', 'unicode-math', 'fontsetup', 'newtxmath', 'newpxmath', 'newtx', 'libertinust1math', 'libertinus'], classes: ['amsart', 'amsbook', 'amsproc', 'acmart', 'beamer'] },
  amssymb: { pkgs: ['newtxmath', 'newpxmath', 'newtx', 'unicode-math', 'fontsetup', 'libertinust1math', 'libertinus', 'mathdesign', 'kpfonts', 'fdsymbol', 'txfonts', 'pxfonts', 'boisik', 'lucidabr', 'mtpro2'], classes: ['acmart', 'beamer'] }
};
PROVIDED.amsfonts = { pkgs: ['amssymb', ...PROVIDED.amssymb.pkgs], classes: [...PROVIDED.amssymb.classes] };
// A package that must be loaded before others: its new line goes above the first of them that the
// preamble loads. amsmath after cleveref stops TeX ("cleveref must be loaded after amsmath"); after
// esint, wasysym, txfonts, pxfonts or mathabx it defines \iint a second time; hyperref goes before
// cleveref and bookmark, which need it first.
const AMS_FIRST = ['cleveref', 'hyperref', 'esint', 'wasysym', 'txfonts', 'pxfonts', 'mathabx', 'MnSymbol', 'varioref', 'unicode-math', 'fontsetup'];
const BEFORE = { amsmath: AMS_FIRST, amssymb: AMS_FIRST, amsfonts: AMS_FIRST, mathtools: AMS_FIRST, hyperref: ['cleveref', 'bookmark', 'hypcap'] };
export const packageOrder = (name) => BEFORE[name] || null;

// Whether the document has a package's commands: loaded itself (the preamble, or a file it
// reads), or given by a package it loads or by its class (PROVIDED)
export function provides(src, name, others, end, memo = new Map()) {
  if (end == null) end = preambleEnd(src);
  if (findPackage(src, end, name, others, memo)) return true;
  const P = PROVIDED[name];
  if (!P) return false;
  const d = docClass(src);
  if (d && P.classes.includes(d.name)) return true;
  return P.pkgs.some((x) => !!findPackage(src, end, x, others, memo));
}

// Where a new line for this package goes when it must come before others the preamble loads:
// above the first of them (where that line stands free, outside braces and conditionals), else
// right after \documentclass (one of them loaded in a file the preamble reads, or inside a
// conditional); null where none of them is loaded (the usual place, after the last package)
function placeBefore(src, end, name, others, memo = new Map()) {
  const first = BEFORE[name];
  if (!first) return null;
  // (each text's list of packages read once: memo, as findPackage keeps it)
  if (!memo.has(src)) memo.set(src, packages(src, end));
  const ps = memo.get(src).filter((p) => p.names.some((n) => first.includes(n.name)));
  if (ps.length) {
    const p = ps[0], lv = levels(stripComments(src.slice(0, end)), [p.s]).get(p.s);
    if (lv && !lv[0] && !lv[1]) return { at: p.line[0], pre: '' };
  } else if (!first.some((x) => !!findPackage(src, end, x, others, memo))) return null;
  const at = afterClass(src, end);
  return at < 0 ? null : { at, pre: at > 0 && src[at - 1] !== '\n' ? '\n' : '' };
}

// The line of a package in the main preamble or in one of the others (the text of files it
// reads: \input{preamble}, a .sty of the project), with the text it was found in
// (memo: the lists of a call that looks for several names, each text read once)
function findPackage(src, end, name, others, memo = new Map()) {
  const list = (t, e) => { if (!memo.has(t)) memo.set(t, packages(t, e)); return memo.get(t); };
  const p = list(src, end).find((x) => x.names.some((n) => n.name === name));
  if (p) return { p, text: src, main: true };
  for (const t of others || []) {
    if (typeof t !== 'string' || t === src) continue;
    const q = list(t, -1).find((x) => x.names.some((n) => n.name === name));
    if (q) return { p: q, text: t, main: false };
  }
  return null;
}

// The edits that load these packages, each once: names a list of names or { name: options }.
// A package already loaded gets the options it lacks merged into its line (a line that loads
// several packages, or one in another file, gets \PassOptionsToPackage instead: before that line,
// or after the \documentclass line, which comes before the file is read). o.end: where the
// preamble ends, if the caller knows it better (the parser's docBody); o.others: the text of the
// files the preamble reads (App.preambleOthers), where a package may be loaded too. Without a
// preamble (an \input file) there is nothing to add to: [].
export function usePackages(src, names, o = {}) {
  const end = o.end != null ? o.end : preambleEnd(src);
  if (end < 0) return [];
  const want = Array.isArray(names) ? names.map((n) => [n, null]) : Object.entries(names);
  const lines = [], edits = [], memo = new Map();
  // (a line for a package that must come before others the preamble loads goes above them)
  const early = new Map();
  for (const [name, opts] of want) {
    const found = findPackage(src, end, name, o.others, memo);
    const ch = opts == null ? {} : typeof opts === 'string' ? Object.fromEntries(parseKV(opts).map((x) => [x.key, x.value == null ? true : x.value])) : opts;
    // (asked for without options and given by the class or another package: nothing to add)
    if (!found && !Object.keys(ch).length && PROVIDED[name] && provides(src, name, o.others, end, memo)) continue;
    if (!found) {
      const line = '\\usepackage' + (Object.keys(ch).length ? '[' + Object.entries(ch).filter(([, v]) => v !== null).map(([k, v]) => kvText(k, v)).join(',') + ']' : '') + '{' + name + '}';
      const pb = placeBefore(src, end, name, o.others, memo);
      if (pb) { const k = pb.at; if (!early.has(k)) early.set(k, { ...pb, lines: [] }); early.get(k).lines.push(line); } else lines.push(line);
      continue;
    }
    if (!Object.keys(ch).length) continue;
    const { p, text, main } = found;
    if (p.names.length > 1 || !main) {
      const have = p.opts ? parseKV(text, p.opts[0], p.opts[1]) : [];
      // (and what a \PassOptionsToPackage before it gives this package)
      const pass = stripComments(main ? src.slice(0, p.s) : src.slice(0, end));
      for (let k = 0, re = /\\PassOptionsToPackage\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, m; (m = re.exec(pass)) && k < 200; k++)
        if (m[2].split(',').some((x) => x.trim() === name)) have.push(...parseKV(m[1]));
      const lack = Object.entries(ch).filter(([k, v]) => v !== null && !have.some((h) => h.key === k && (v === true ? h.value == null : h.value === String(v))));
      const at = main ? p.line[0] : afterClass(src, end);
      if (lack.length && at >= 0) edits.push({ s: at, e: at, t: (at > 0 && src[at - 1] !== '\n' ? '\n' : '') + '\\PassOptionsToPackage{' + lack.map(([k, v]) => kvText(k, v)).join(',') + '}{' + name + '}\n' });
      continue;
    }
    if (p.opts) edits.push(...optionEdits(src, p.opts[0], p.opts[1], ch, o.drop));
    else {
      const t = Object.entries(ch).filter(([, v]) => v !== null).map(([k, v]) => kvText(k, v)).join(',');
      if (t) edits.push({ s: p.list[0] - 1, e: p.list[0] - 1, t: '[' + t + ']' });
    }
  }
  if (lines.length) { const { at, pre } = newLineAt(src, end); edits.push({ s: at, e: at, t: pre + lines.join('\n') + '\n' }); }
  for (const { at, pre, lines: ls } of early.values()) {
    // (two insertions at one place make one edit: the early lines before the usual ones)
    const same = edits.find((x) => x.s === at && x.e === at);
    if (same) same.t = pre + ls.join('\n') + '\n' + same.t.replace(/^\n/, '');
    else edits.push({ s: at, e: at, t: pre + ls.join('\n') + '\n' });
  }
  // (a file written with CRLF gets its own line ends)
  const nl = eolOf(src);
  return nl === '\n' ? edits : edits.map((x) => ({ ...x, t: x.t.replace(/\r?\n/g, nl) }));
}
export const usePackage = (src, name, opts, o) => usePackages(src, { [name]: opts == null ? null : opts }, o);

// The options a package is loaded with, as { key: value or true }, or null when it is not loaded
export function packageOptions(src, name, end, others) {
  const f = findPackage(src, end == null ? preambleEnd(src) : end, name, others);
  if (!f) return null;
  const { p, text } = f;
  return p.opts ? Object.fromEntries(parseKV(text, p.opts[0], p.opts[1]).map((x) => [x.key, x.value == null ? true : x.value])) : {};
}

// ---- the class --------------------------------------------------------------------------------
// { name, s, e, opts: [os, oe) or null, nameAt: [ns, ne), options: { key: value or true } } or null
export function docClass(src) {
  const end = preambleEnd(src);
  const pre = stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end));
  const m = /\\documentclass(?![A-Za-z@])/.exec(pre);
  if (!m) return null;
  let i = skipWs(pre, m.index + m[0].length), opts = null;
  if (pre[i] === '[') { const z = groupEnd(pre, i, GROUP); if (z < 0) return null; opts = [i + 1, z - 1]; i = skipWs(pre, z); }
  if (pre[i] !== '{') return null;
  const z = groupEnd(pre, i, GROUP);
  if (z < 0) return null;
  return { name: pre.slice(i + 1, z - 1).trim(), s: m.index, e: z, opts, nameAt: [i + 1, z - 1], options: opts ? Object.fromEntries(parseKV(src, opts[0], opts[1]).map((x) => [x.key, x.value == null ? true : x.value])) : {} };
}
// The class's options set: { '11pt': true, twoside: true, fontsize: '13pt', a4paper: null }.
// drop(key): options that go when these are set (another size when one is set: /^\d+pt$/).
export function classOptions(src, changes, drop) {
  const d = docClass(src);
  if (!d) return [];
  if (d.opts) return optionEdits(src, d.opts[0], d.opts[1], changes, drop);
  const t = Object.entries(changes).filter(([, v]) => v !== null).map(([k, v]) => kvText(k, v)).join(',');
  return t ? [{ s: d.nameAt[0] - 1, e: d.nameAt[0] - 1, t: '[' + t + ']' }] : [];
}
export function setClass(src, name) {
  const d = docClass(src);
  if (!d || d.name === name) return [];
  return [{ s: d.nameAt[0], e: d.nameAt[1], t: name }];
}

// ---- a command's key=value argument in the preamble: \geometry{...}, \hypersetup{...}, \setlist[...]{...}
// The last such command (the one TeX applies last) and its argument, or null
export function lastCall(src, cmd, end) {
  if (end == null) end = preambleEnd(src);
  const pre = stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end));
  const re = new RegExp('\\\\' + cmd + '(?![A-Za-z@])', 'g');
  let m, last = null, n = 0;
  while ((m = re.exec(pre)) && n++ < 1000) {
    let i = skipWs(pre, m.index + m[0].length), opt = null;
    if (pre[i] === '[') { const z = groupEnd(pre, i, GROUP); if (z < 0) continue; opt = [i + 1, z - 1]; i = skipWs(pre, z); }
    if (pre[i] !== '{') continue;
    const z = groupEnd(pre, i, GROUP);
    if (z < 0) continue;
    last = { s: m.index, e: z, opt, arg: [i + 1, z - 1] };
  }
  return last;
}
// Keys of a package that also has a setup command (geometry and \geometry, hyperref and
// \hypersetup): the setup command's argument if the preamble has one, else the package's
// options; the package is loaded with them when it is not.
export function setPackageKeys(src, pkg, setup, changes, o = {}) {
  const end = o.end != null ? o.end : preambleEnd(src);
  if (end < 0) return [];
  const call = setup ? lastCall(src, setup, end) : null;
  if (call) return kvEdits(src, call.arg[0], call.arg[1], changes, o.drop);
  return usePackages(src, { [pkg]: changes }, { ...o, end });
}

// ---- definitions -------------------------------------------------------------------------------
// what defines each kind of name; read by a scan, not by one pattern with several runs of
// spaces in it, which a stranger's \newcommand followed by thousands of spaces turned into
// minutes of backtracking
const DEFINERS = {
  command: /\\(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)DocumentCommand|[gex]?def|let)(?![A-Za-z@])/g,
  environment: /\\(?:(?:re)?newenvironment|(?:New|Renew)DocumentEnvironment|newtheorem)(?![A-Za-z@])/g,
  color: /\\(?:definecolor|providecolor|colorlet)(?![A-Za-z@])/g,
  counter: /\\newcounter(?![A-Za-z@])/g,
  length: /\\newlength(?![A-Za-z@])/g
};
// whether the preamble defines a command (name without its backslash), an environment, a colour,
// a counter or a length
export function defines(src, name, kind = 'command', end) {
  if (end == null) end = preambleEnd(src);
  const pre = stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end));
  const want = String(name).replace(/^\\/, ''), re = new RegExp(DEFINERS[kind].source, 'g');
  const skip = (i, chars) => { for (let n = 0; n < 64 && i < pre.length && chars.includes(pre[i]); n++) i++; return i; };
  for (let m, k = 0; (m = re.exec(pre)) && k < 5000; k++) {
    let i = m.index + m[0].length;
    if (kind === 'command' || kind === 'length') {
      // \newcommand*{\name}, \newcommand\name, \def\name, \newlength{\name}
      i = skip(i, ' \t\r\n*{');
      if (pre[i] !== '\\') continue;
      const nm = /^\\([A-Za-z@]+|.)/.exec(pre.slice(i, i + 80));
      if (nm && nm[1] === want) return true;
    } else {
      // \newenvironment*{name}, \definecolor[named]{name}, \newcounter{name}
      i = skip(i, ' \t\r\n*');
      if (pre[i] === '[') { const z = groupEnd(pre, i, 400); if (z < 0) continue; i = skip(z, ' \t\r\n'); }
      if (pre[i] !== '{') continue;
      const z = pre.indexOf('}', i);
      if (z > i && z - i < 200 && pre.slice(i + 1, z).trim() === want) return true;
    }
  }
  return false;
}
// The edits that write a definition once: text (lines, without a last line break) goes at the
// preamble's end, after the packages it may use, unless the preamble defines name already.
export function defineOnce(src, name, text, o = {}) {
  const end = o.end != null ? o.end : preambleEnd(src);
  if (end < 0 || defines(src, name, o.kind || 'command', end)) return [];
  // (at the start of \begin{document}'s line)
  const at = src.lastIndexOf('\n', end - 1) + 1;
  const pre = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '';
  const s = pre ? end : at;
  const nl = eolOf(src);
  return [{ s, e: s, t: (pre + text + '\n').replace(/\r?\n/g, nl) }];
}
