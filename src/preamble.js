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
  let m;
  while ((m = re.exec(pre)) && out.length < 2000) {
    let i = skipWs(pre, m.index + m[0].length), opts = null;
    if (pre[i] === '[') { const e = groupEnd(pre, i); if (e < 0) continue; opts = [i + 1, e - 1]; i = skipWs(pre, e); }
    if (pre[i] !== '{') continue;
    const e = groupEnd(pre, i);
    if (e < 0) continue;
    const names = [];
    const body = pre.slice(i + 1, e - 1);
    for (let k = 0, re2 = /[^,\s][^,]*/g, n; (n = re2.exec(body)) && k < 100; k++) {
      const nm = n[0].trim();
      if (nm) names.push({ name: nm, s: i + 1 + n.index, e: i + 1 + n.index + n[0].trimEnd().length });
    }
    // (a version date after it: \usepackage{x}[2020/01/01])
    let z = e;
    if (pre[skipWs(pre, z)] === '[') { const v = groupEnd(pre, skipWs(pre, z)); if (v > 0) z = v; }
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
export const hasPackage = (src, name, end) => !!packageLine(src, name, end);

// ---- key=value lists ----------------------------------------------------------------------
// [{ key, value (null for a flag), s, e }] of a comma list at [s, e) of t; commas in braces and
// brackets stay inside their value
export function parseKV(t, s = 0, e = t.length) {
  const out = [];
  let i = s, start = s;
  const push = (z) => {
    const raw = t.slice(start, z);
    const a = start + (raw.length - raw.trimStart().length), b = z - (raw.length - raw.trimEnd().length);
    if (b > a) {
      const item = t.slice(a, b), q = item.indexOf('=');
      out.push(q < 0 ? { key: item, value: null, s: a, e: b } : { key: item.slice(0, q).trim(), value: item.slice(q + 1).trim(), s: a, e: b });
    }
  };
  for (; i < e; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '{' || c === '[') { const z = groupEnd(t, i); if (z < 0 || z > e) break; i = z - 1; continue; }
    if (c === ',') { push(i); start = i + 1; }
  }
  push(e);
  return out;
}
const kvText = (key, value) => (value === true || value == null ? key : key + '=' + value);

// The edits that set keys in the list at [s, e) of src: { key: value } sets or replaces, true a
// flag, null takes the key out. Keys the list does not have go at its end, in the order given.
// drop(key) also takes out any key it says yes to (a4paper when letterpaper is set).
export function kvEdits(src, s, e, changes, drop) {
  const items = parseKV(src, s, e), edits = [];
  const want = Object.entries(changes);
  const done = new Set();
  for (const [k, it] of items.entries()) {
    const ch = want.find(([key]) => key === it.key);
    const gone = (ch && ch[1] === null) || (!ch && drop && drop(it.key));
    if (gone) {
      // the item and the comma before it (after it, for the first)
      const prev = items[k - 1], next = items[k + 1];
      if (prev) edits.push({ s: prev.e, e: it.e, t: '' });
      else if (next) edits.push({ s: it.s, e: next.s, t: '' });
      else edits.push({ s: it.s, e: it.e, t: '' });
      if (ch) done.add(ch[0]);
      continue;
    }
    if (ch) {
      done.add(ch[0]);
      const t = kvText(it.key, ch[1]);
      if (src.slice(it.s, it.e) !== t && !(ch[1] === true && it.value == null)) edits.push({ s: it.s, e: it.e, t });
    }
  }
  const add = want.filter(([key, v]) => !done.has(key) && v !== null).map(([key, v]) => kvText(key, v));
  if (add.length) {
    const kept = items.filter((it) => !edits.some((x) => x.s <= it.s && x.e >= it.e && x.t === ''));
    const at = kept.length ? kept[kept.length - 1].e : s;
    edits.push({ s: at, e: at, t: (kept.length ? ',' : '') + add.join(',') });
  }
  return edits;
}

// ---- packages -------------------------------------------------------------------------------
// Where a new line goes in the preamble: after the last \usepackage line, else after the
// \documentclass line, else at the preamble's end; and what goes before it (a line break when
// the text there does not end one)
function newLineAt(src, end) {
  const ps = packages(src, end).filter((p) => p.cmd === 'usepackage');
  let at = -1;
  if (ps.length) at = ps[ps.length - 1].line[1];
  else {
    const pre = stripComments(src.slice(0, end));
    const d = /\\documentclass\b/.exec(pre);
    if (d) {
      let i = skipWs(pre, d.index + 14);
      if (pre[i] === '[') { const z = groupEnd(pre, i); if (z > 0) i = skipWs(pre, z); }
      if (pre[i] === '{') { const z = groupEnd(pre, i); if (z > 0) { const nl = pre.indexOf('\n', z); at = nl < 0 || nl >= end ? end : nl + 1; } }
    }
  }
  if (at < 0 || at > end) at = end;
  return { at, pre: at > 0 && src[at - 1] !== '\n' ? '\n' : '' };
}

// The edits that load these packages, each once: names a list of names or { name: options }.
// A package already loaded gets the options it lacks merged into its line (a line that loads
// several packages gets \PassOptionsToPackage before it instead: its options are every one's).
// o.end: where the preamble ends, if the caller knows it better (the parser's docBody); without
// a preamble (an \input file) there is nothing to add to: [].
export function usePackages(src, names, o = {}) {
  const end = o.end != null ? o.end : preambleEnd(src);
  if (end < 0) return [];
  const want = Array.isArray(names) ? names.map((n) => [n, null]) : Object.entries(names);
  const lines = [], edits = [];
  const ps = packages(src, end);
  for (const [name, opts] of want) {
    const p = ps.find((x) => x.names.some((n) => n.name === name));
    const ch = opts == null ? {} : typeof opts === 'string' ? Object.fromEntries(parseKV(opts).map((x) => [x.key, x.value == null ? true : x.value])) : opts;
    if (!p) { lines.push('\\usepackage' + (Object.keys(ch).length ? '[' + Object.entries(ch).filter(([, v]) => v !== null).map(([k, v]) => kvText(k, v)).join(',') + ']' : '') + '{' + name + '}'); continue; }
    if (!Object.keys(ch).length) continue;
    if (p.names.length > 1) {
      const have = p.opts ? parseKV(src, p.opts[0], p.opts[1]) : [];
      // (and what a \PassOptionsToPackage before it gives this package)
      const pass = stripComments(src.slice(0, p.s));
      for (let k = 0, re = /\\PassOptionsToPackage\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, m; (m = re.exec(pass)) && k < 200; k++)
        if (m[2].split(',').some((x) => x.trim() === name)) have.push(...parseKV(m[1]));
      const lack = Object.entries(ch).filter(([k, v]) => v !== null && !have.some((h) => h.key === k && (v === true ? h.value == null : h.value === String(v))));
      if (lack.length) edits.push({ s: p.line[0], e: p.line[0], t: '\\PassOptionsToPackage{' + lack.map(([k, v]) => kvText(k, v)).join(',') + '}{' + name + '}\n' });
      continue;
    }
    if (p.opts) edits.push(...kvEdits(src, p.opts[0], p.opts[1], ch, o.drop));
    else {
      const t = Object.entries(ch).filter(([, v]) => v !== null).map(([k, v]) => kvText(k, v)).join(',');
      if (t) edits.push({ s: p.list[0] - 1, e: p.list[0] - 1, t: '[' + t + ']' });
    }
  }
  if (lines.length) { const { at, pre } = newLineAt(src, end); edits.push({ s: at, e: at, t: pre + lines.join('\n') + '\n' }); }
  return edits;
}
export const usePackage = (src, name, opts, o) => usePackages(src, { [name]: opts == null ? null : opts }, o);

// The options a package is loaded with, as { key: value or true }, or null when it is not loaded
export function packageOptions(src, name, end) {
  const p = packageLine(src, name, end);
  if (!p) return null;
  return p.opts ? Object.fromEntries(parseKV(src, p.opts[0], p.opts[1]).map((x) => [x.key, x.value == null ? true : x.value])) : {};
}

// ---- the class --------------------------------------------------------------------------------
// { name, s, e, opts: [os, oe) or null, nameAt: [ns, ne), options: { key: value or true } } or null
export function docClass(src) {
  const end = preambleEnd(src);
  const pre = stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end));
  const m = /\\documentclass(?![A-Za-z@])/.exec(pre);
  if (!m) return null;
  let i = skipWs(pre, m.index + m[0].length), opts = null;
  if (pre[i] === '[') { const z = groupEnd(pre, i); if (z < 0) return null; opts = [i + 1, z - 1]; i = skipWs(pre, z); }
  if (pre[i] !== '{') return null;
  const z = groupEnd(pre, i);
  if (z < 0) return null;
  return { name: pre.slice(i + 1, z - 1).trim(), s: m.index, e: z, opts, nameAt: [i + 1, z - 1], options: opts ? Object.fromEntries(parseKV(src, opts[0], opts[1]).map((x) => [x.key, x.value == null ? true : x.value])) : {} };
}
// The class's options set: { '11pt': true, twoside: true, fontsize: '13pt', a4paper: null }.
// drop(key): options that go when these are set (another size when one is set: /^\d+pt$/).
export function classOptions(src, changes, drop) {
  const d = docClass(src);
  if (!d) return [];
  if (d.opts) return kvEdits(src, d.opts[0], d.opts[1], changes, drop);
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
    if (pre[i] === '[') { const z = groupEnd(pre, i); if (z < 0) continue; opt = [i + 1, z - 1]; i = skipWs(pre, z); }
    if (pre[i] !== '{') continue;
    const z = groupEnd(pre, i);
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
  return [{ s, e: s, t: pre + text + '\n' }];
}
