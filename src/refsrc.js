// References as LaTeX (batch B9): what a document's preamble and body say about its contents,
// notes, captions, bibliography and index, and the smallest edits that change each. Pure string
// functions: every one reads the text it is given and returns facts or edits [{ s, e, t }] on it
// (App.commit takes them with the file's name), [] when nothing needs to change. The model
// (src/model.js) reads refsSetup to draw the page as TeX prints it; src/cmd/refs.js writes.
//
// The text may be a stranger's: every scan is bounded (MAX characters, a cap on matches), no
// pattern can backtrack over the text, and comments are read as comments.

import { stripComments, preambleEnd, groupEnd, eolOf, packageLine, packageOptions, kvEdits, parseKV, hasPackage, provides } from './preamble.js';

const MAX = 200000;     // the most of a preamble read
const BODY = 2000000;   // the most of a body read for its bibliography and notes
const CAP = 2000;       // the most calls of one command read

// The calls of \name with n arguments in t (comments already blanked) from a to b: each argument
// a braced group or a lone control word (\renewcommand\thefootnote{...}); [{ s, e, star, args }]
export function cmdCalls(t, name, n, a = 0, b = t.length, opt = false) {
  const out = [], re = new RegExp('\\\\' + name + '(?![A-Za-z@])', 'g');
  re.lastIndex = a;
  const sp = (i) => { for (let k = 0; k < 200 && i < b && /[ \t\r\n]/.test(t[i]); k++) i++; return i; };
  for (let m, k = 0; (m = re.exec(t)) && m.index < b && k < CAP; k++) {
    let i = m.index + m[0].length, star = false, o = null;
    if (t[i] === '*') { star = true; i++; }
    if (opt && t[sp(i)] === '[') { const z = groupEnd(t, sp(i), 4000); if (z > 0 && z <= b) { o = [sp(i) + 1, z - 1]; i = z; } }
    const args = [];
    for (let j = 0; j < n; j++) {
      i = sp(i);
      if (t[i] === '{') { const z = groupEnd(t, i, 4000); if (z < 0 || z > b) break; args.push([i + 1, z - 1]); i = z; } else if (t[i] === '\\') {
        const w = /^\\(?:[A-Za-z@]+|.)/.exec(t.slice(i, i + 80));
        if (!w) break;
        args.push([i, i + w[0].length]); i += w[0].length;
      } else break;
    }
    if (args.length === n) out.push({ s: m.index, e: i, star, opt: o, args });
    re.lastIndex = Math.max(re.lastIndex, i);
  }
  return out;
}

// the preamble with its comments blanked, and where it ends (-1: no \begin{document})
// (each read once for a text: a look at the caret asks several commands of the same file, and on a
// long document blanking its comments took 7 ms a time)
const lastOf = (fn) => { let k = null, v; return (src) => (src === k ? v : ((k = src), (v = fn(src)))); };
const preOf = lastOf((src) => {
  const end = preambleEnd(src);
  return { end, t: stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end)) };
});
// the body (after \begin{document}) with comments blanked, offsets those of src
const bodyOf = lastOf((src) => {
  const end = preambleEnd(src), from = Math.max(0, end);
  return { from, t: stripComments(src.slice(0, Math.min(src.length, from + BODY))) };
});
const argOf = (t, c, k) => t.slice(c.args[k][0], c.args[k][1]).trim();
const unbrace = (x) => x.replace(/^\{\s*|\s*\}$/g, '').trim();

// The [s, e) to delete to take a call out: its whole line (with the line end) where nothing else
// is on it, else the call alone
export function lineSpan(src, s, e) {
  const ls = src.lastIndexOf('\n', s - 1) + 1;
  let le = src.indexOf('\n', e);
  if (le < 0) le = src.length;
  const before = src.slice(ls, s), after = src.slice(e, le).replace(/\r$/, '');
  if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) {
    let b = Math.min(src.length, le + 1);
    // (a line between two blank lines takes one of them with it: the paragraphs stay apart by one)
    const blankBefore = /\n[ \t]*\r?\n$/.test(src.slice(Math.max(0, ls - 4), ls)) || ls === 0;
    const m = /^[ \t]*\r?\n/.exec(src.slice(b, b + 40));
    if (blankBefore && m && ls > 0) b += m[0].length;
    return [ls, b];
  }
  return [s, e];
}
const drop = (src, s, e) => { const [a, b] = lineSpan(src, s, e); return { s: a, e: b, t: '' }; };

// A line of its own at the preamble's end, just before \begin{document}, in the file's line ends
export function preambleLine(src, text) {
  const end = preambleEnd(src);
  if (end < 0) return [];
  const at = src.lastIndexOf('\n', end - 1) + 1;
  const pre = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '';
  const s = pre ? end : at;
  return [{ s, e: s, t: (pre + text + '\n').replace(/\r?\n/g, eolOf(src)) }];
}

// Where the body's last lines go (\printendnotes, \printindex, a bibliography): before
// \end{document}, and before what already ends the document there (a bibliography, an index,
// the notes) when before is given. { at, eol }; -1 without \end{document}.
export function endSpot(src, before = []) {
  const { t, from } = bodyOf(src);
  const m = t.lastIndexOf('\\end{document}');
  if (m < from) return { at: -1 };
  let at = src.lastIndexOf('\n', m - 1) + 1;
  if (at < from || /\S/.test(src.slice(at, m))) at = m;
  // (the lines just before it that are what comes last: walk back over them)
  for (let k = 0; k < 8 && before.length; k++) {
    const ls = src.lastIndexOf('\n', at - 2) + 1;
    if (ls < from || ls >= at) break;
    const line = t.slice(ls, at).trim();
    if (!line) { at = ls; continue; }
    if (!before.some((n) => line.startsWith('\\' + n))) break;
    at = ls;
  }
  // (blank lines walked over stay before what is added)
  while (at < m && /^[ \t]*\r?\n/.test(src.slice(at, m)) && src.slice(at, m).trim()) { const nl = src.indexOf('\n', at); if (nl < 0 || nl >= m) break; if (src.slice(at, nl).trim()) break; at = nl + 1; }
  return { at, eol: eolOf(src) };
}
// The edit that puts lines just before the document's end (see endSpot); [] without one
export function endLines(src, lines, before) {
  const { at, eol } = endSpot(src, before);
  if (at < 0) return [];
  const pre = at > 0 && src[at - 1] !== '\n' ? eol : '';
  return [{ s: at, e: at, t: pre + lines.join(eol) + eol }];
}

// ---- what the document says ---------------------------------------------------------------------
const STYLES = ['arabic', 'roman', 'Roman', 'alph', 'Alph', 'fnsymbol'];
// The numbering style a \renewcommand{\the<counter>}{...} body gives: one of STYLES, 'custom'
const styleOfBody = (body, counter) => {
  const m = new RegExp('^\\\\(' + STYLES.join('|') + ')\\s*\\{\\s*' + counter + '\\s*\\}$').exec(body.trim());
  return m ? m[1] : 'custom';
};
function renewOf(t, counter) {
  return cmdCalls(t, 'renewcommand', 2).filter((c) => unbrace(argOf(t, c, 0)) === '\\the' + counter);
}

// What the preamble sets up for references, for the page and the controls:
//   tocdepth (null: the class's), fn: { style, start, restart: 'continuous'|'section'|'chapter'|'page',
//   custom }, within: { figure: 'section', ... } (\counterwithin), reset: { footnote: 'section' }
//   (\counterwithin*), endnotes: 'enotez'|'endnotes'|null, index: { pkg, make, columns, noclear },
//   pkgs: { hyperref, cleveref, varioref, amsmath, caption, newfloat, natbib, biblatex }
export function refsSetup(src, chapters = false) {
  const { t, end } = preOf(src);
  const has = (n) => !!packageLine(src, n, end);
  const R = { tocdepth: null, fn: { style: 'arabic', start: 1, restart: chapters ? 'chapter' : 'continuous' }, en: { style: 'arabic' }, within: {}, reset: {}, endnotes: null, index: null, pkgs: {} };
  for (const n of ['hyperref', 'cleveref', 'varioref', 'amsmath', 'mathtools', 'caption', 'newfloat', 'natbib', 'biblatex', 'footmisc', 'perpage', 'enotez', 'endnotes', 'imakeidx', 'makeidx', 'tocbibind']) R.pkgs[n] = has(n);
  if (R.pkgs.tocbibind) R.tocbibind = packageOptions(src, 'tocbibind', end) || {};
  { const m = /\\documentclass\s*\[([^\]]{0,600})\]/.exec(t); R.clsOpts = m ? m[1] : ''; }
  for (const c of cmdCalls(t, 'setcounter', 2)) {
    const n = argOf(t, c, 0), v = parseInt(argOf(t, c, 1), 10);
    if (!Number.isFinite(v)) continue;
    if (n === 'tocdepth') R.tocdepth = v;
    if (n === 'footnote') R.fn.start = v + 1;
  }
  for (const c of cmdCalls(t, 'settocdepth', 1)) { const v = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }[argOf(t, c, 0)]; if (v != null) R.tocdepth = v; }
  const fr = renewOf(t, 'footnote').pop();
  if (fr) R.fn.style = styleOfBody(argOf(t, fr, 1), 'footnote');
  const er = renewOf(t, 'endnote').pop();
  if (er) R.en.style = styleOfBody(argOf(t, er, 1), 'endnote');
  // (R4) enotez's own key, \setenotez{counter-format=roman}: the last one set wins, as in TeX
  else for (const c of cmdCalls(t, 'setenotez', 1)) {
    const kv = parseKV(t, c.args[0][0], c.args[0][1]).find((x) => x.key === 'counter-format');
    if (kv) R.en.style = kv.value === 'symbols' ? 'fnsymbol' : STYLES.includes(kv.value) ? kv.value : 'custom';
  }
  const fm = R.pkgs.footmisc ? packageOptions(src, 'footmisc', end) || {} : {};
  if (fm.symbol || fm['symbol*']) R.fn.style = 'fnsymbol';
  for (const c of [...cmdCalls(t, 'counterwithin', 2), ...cmdCalls(t, 'numberwithin', 2)]) {
    const a = argOf(t, c, 0), b = argOf(t, c, 1);
    if (!/^[A-Za-z]+$/.test(a) || !/^[A-Za-z]+$/.test(b)) continue;
    if (c.star) R.reset[a] = b; else R.within[a] = b;
  }
  for (const c of cmdCalls(t, 'counterwithout', 2)) { const a = argOf(t, c, 0); delete R.within[a]; R.reset[a] = null; }
  const fw = R.reset.footnote !== undefined ? R.reset.footnote : R.within.footnote;
  if (fw === null) R.fn.restart = 'continuous';
  else if (fw) R.fn.restart = fw === 'chapter' ? 'chapter' : fw === 'section' ? (chapters ? 'chapter' : 'section') : R.fn.restart;
  // (numbered within the section, 1.1, by \counterwithin or \numberwithin: a mode of its own)
  if (R.within.footnote && !(R.reset.footnote !== undefined)) R.fn.restart = 'within-' + R.within.footnote;
  if (fm.perpage || (R.pkgs.perpage && /\\MakePerPage\s*(\[[^\]]{0,20}\])?\s*\{\s*footnote\s*\}/.test(t))) R.fn.restart = 'page';
  R.fn.within = R.within.footnote || null;
  R.endnotes = R.pkgs.enotez ? 'enotez' : R.pkgs.endnotes ? 'endnotes' : null;
  // (R4) floats of the document's own (Word's New Label): newfloat's
  // \DeclareFloatingEnvironment[name=Scheme]{scheme}, float's \newfloat{scheme}{tbp}{los} with
  // \floatname{scheme}{Scheme}; and how captions are labelled: \captionsetup[figure]{labelformat=…}
  // with the formats \DeclareCaptionLabelFormat defines ('#2': the number alone)
  R.floats = {};
  for (const c of cmdCalls(t, 'DeclareFloatingEnvironment', 1, 0, t.length, true)) {
    const env = argOf(t, c, 0);
    if (!/^[A-Za-z]{1,30}$/.test(env)) continue;
    const kv = c.opt ? Object.fromEntries(parseKV(t, c.opt[0], c.opt[1]).map((x) => [x.key, unbrace(x.value || '')])) : {};
    R.floats[env] = { name: kv.name || env.charAt(0).toUpperCase() + env.slice(1), by: 'newfloat' };
  }
  for (const c of cmdCalls(t, 'newfloat', 3)) { const env = argOf(t, c, 0); if (/^[A-Za-z]{1,30}$/.test(env)) R.floats[env] = { name: env.charAt(0).toUpperCase() + env.slice(1), by: 'float' }; }
  for (const c of cmdCalls(t, 'floatname', 2)) { const env = argOf(t, c, 0); if (R.floats[env]) R.floats[env].name = unbrace(argOf(t, c, 1)); }
  R.capFormats = {};
  for (const c of cmdCalls(t, 'DeclareCaptionLabelFormat', 2)) { const n = argOf(t, c, 0); if (/^[A-Za-z-]{1,30}$/.test(n)) R.capFormats[n] = argOf(t, c, 1); }
  R.capLabel = {};
  for (const c of cmdCalls(t, 'captionsetup', 1, 0, t.length, true)) {
    const lf = parseKV(t, c.args[0][0], c.args[0][1]).find((x) => x.key === 'labelformat');
    if (!lf) continue;
    const kinds = c.opt ? t.slice(c.opt[0], c.opt[1]).split(',').map((x) => x.trim()).filter(Boolean) : ['*'];
    for (const k of kinds) R.capLabel[k] = lf.value;
  }
  if (R.pkgs.imakeidx || R.pkgs.makeidx || /\\makeindex(?![A-Za-z@])/.test(t)) {
    const mk = cmdCalls(t, 'makeindex', 0, 0, t.length, true);
    const kv = mk.length && mk[0].opt ? Object.fromEntries(parseKV(t, mk[0].opt[0], mk[0].opt[1]).map((x) => [x.key, x.value])) : {};
    R.index = { pkg: R.pkgs.imakeidx ? 'imakeidx' : R.pkgs.makeidx ? 'makeidx' : null, make: mk.length > 0, columns: R.pkgs.imakeidx ? parseInt(kv.columns, 10) || 2 : 2, noclear: /\\indexsetup\s*\{[^{}]{0,200}\bnoclearpage\b/.test(t), names: mk.map((c) => (c.opt ? Object.fromEntries(parseKV(t, c.opt[0], c.opt[1]).map((x) => [x.key, x.value])).name || '' : '')) };
    // (R4) each index by its name: its title, columns and makeindex style (options=-s file.ist:
    // Insert Index's Right align page numbers, or the document's own)
    R.index.mk = mk.map((c) => {
      const o = c.opt ? Object.fromEntries(parseKV(t, c.opt[0], c.opt[1]).map((x) => [x.key, unbrace(x.value || '')])) : {};
      const ist = /(?:^|\s)-s\s+([A-Za-z0-9_.\/-]{1,80}\.ist)\b/.exec(o.options || '');
      return { name: o.name || '', title: o.title || '', columns: parseInt(o.columns, 10) || 0, ist: ist ? ist[1] : null };
    });
  }
  return R;
}

// ---- edits: counters and their look ---------------------------------------------------------------
// The body's \setcounter{counter}{…} calls (where people set tocdepth: just before \tableofcontents)
export function bodyCounterCalls(src, counter) {
  const { t, from } = bodyOf(src);
  return cmdCalls(t, 'setcounter', 2, from).filter((c) => argOf(t, c, 0) === counter).map((c) => ({ s: c.s, e: c.e, v: [c.args[1][0], c.args[1][1]] }));
}
// \setcounter{counter}{value} in the preamble: its value changed where it stands, a new line, or
// (value null) every one taken out
export function setCounterEdits(src, counter, value) {
  const { t, end } = preOf(src);
  if (end < 0) return [];
  const cs = cmdCalls(t, 'setcounter', 2).filter((c) => argOf(t, c, 0) === counter);
  if (value == null) return cs.map((c) => drop(src, c.s, c.e));
  const last = cs[cs.length - 1];
  if (last) { const [a, b] = last.args[1]; return src.slice(a, b).trim() === String(value) ? [] : [{ s: a, e: b, t: String(value) }]; }
  return preambleLine(src, '\\setcounter{' + counter + '}{' + value + '}');
}

// How a counter is printed: \renewcommand{\the<counter>}{\<style>{<counter>}} written once, its
// body changed in place, or taken out for arabic (LaTeX's own); footmisc's symbol option dropped
// for any other style than symbols
export function counterStyleEdits(src, counter, style) {
  const { t, end } = preOf(src);
  if (end < 0 || !STYLES.includes(style)) return [];
  const rs = renewOf(t, counter), out = [];
  if (counter === 'footnote' && style !== 'fnsymbol') {
    const p = packageLine(src, 'footmisc', end);
    if (p && p.opts && p.names.length === 1) { const kv = parseKV(src, p.opts[0], p.opts[1]); if (kv.some((x) => x.key === 'symbol' || x.key === 'symbol*')) out.push(...optEdits(src, p, { symbol: null, 'symbol*': null })); }
  }
  if (style === 'arabic') return [...out, ...rs.map((c) => drop(src, c.s, c.e))];
  const body = '\\' + style + '{' + counter + '}', last = rs[rs.length - 1];
  if (last) { const [a, b] = last.args[1]; return src.slice(a, b) === body ? out : [...out, { s: a, e: b, t: body }]; }
  return [...out, ...preambleLine(src, '\\renewcommand{\\the' + counter + '}{' + body + '}')];
}
// (R4) How endnotes are numbered: enotez's \setenotez{counter-format=…} (its key changed where it
// stands, put in a \setenotez already there, or a line of its own; taken out for arabic, the line
// with it when nothing else is left), and \renewcommand{\theendnote} for the endnotes package or
// where the document set it so by hand
export function enoteFormatEdits(src, style, pkg) {
  const { t, end } = preOf(src);
  if (end < 0 || !STYLES.includes(style)) return [];
  if (pkg !== 'enotez' || renewOf(t, 'endnote').length) return counterStyleEdits(src, 'endnote', style);
  const fmt = style === 'fnsymbol' ? 'symbols' : style;
  const calls = cmdCalls(t, 'setenotez', 1);
  const kvOf = (c) => parseKV(t, c.args[0][0], c.args[0][1]);
  const withKey = calls.filter((c) => kvOf(c).some((x) => x.key === 'counter-format'));
  const last = withKey[withKey.length - 1];
  if (last) {
    const [a, b] = last.args[0];
    if (style !== 'arabic') return kvEdits(src, a, b, { 'counter-format': fmt });
    if (kvOf(last).length === 1) return [drop(src, last.s, last.e)];
    return kvEdits(src, a, b, { 'counter-format': null });
  }
  if (style === 'arabic') return [];
  if (calls.length) { const c = calls[calls.length - 1]; return kvEdits(src, c.args[0][0], c.args[0][1], { 'counter-format': fmt }); }
  return preambleLine(src, '\\setenotez{counter-format=' + fmt + '}');
}

// (R4) Word's New Label as LaTeX: a float of its own, newfloat's \DeclareFloatingEnvironment (its
// list's name and file too), at the preamble's end; the caller loads newfloat. env: its name in
// letters; name: the label as typed (escaped by the caller). [] where that float is there already.
export function newFloatEdits(src, env, name) {
  const { t, end } = preOf(src);
  if (end < 0 || !/^[a-z]{1,30}$/.test(env)) return [];
  if (cmdCalls(t, 'DeclareFloatingEnvironment', 1, 0, t.length, true).some((c) => argOf(t, c, 0) === env) || cmdCalls(t, 'newfloat', 3).some((c) => argOf(t, c, 0) === env)) return [];
  return preambleLine(src, '\\DeclareFloatingEnvironment[fileext=lo' + env + ',listname={List of ' + name + 's},name={' + name + '}]{' + env + '}');
}
// (R4) Word's Exclude label from caption: captions with their number alone ("1: …"), caption's
// \DeclareCaptionLabelFormat{nolabel}{#2}, defined once, for the caption's own \captionsetup
export function noLabelFormatEdits(src) {
  const { t, end } = preOf(src);
  if (end < 0) return [];
  if (cmdCalls(t, 'DeclareCaptionLabelFormat', 2).some((c) => argOf(t, c, 0) === 'nolabel')) return [];
  return preambleLine(src, '\\DeclareCaptionLabelFormat{nolabel}{#2}');
}

// kvEdits on a package line's options, the brackets gone when nothing is left
function optEdits(src, p, changes) {
  const ed = kvEdits(src, p.opts[0], p.opts[1], changes);
  if (ed.length === 1 && ed[0].s === p.opts[0] && ed[0].e === p.opts[1] && !ed[0].t.trim()) return [{ s: p.opts[0] - 1, e: p.opts[1] + 1, t: '' }];
  return ed;
}

// Where footnote numbers start again: 'continuous', 'section' (\counterwithin*{footnote}{section}),
// 'chapter' (a report's or a book's own), 'page' (footmisc's perpage). pkg: the edits that load
// footmisc, which the caller makes (App.packageEdits, with the files the preamble reads).
export function fnRestartEdits(src, mode, chapters) {
  const { t, end } = preOf(src);
  if (end < 0 || /^within-/.test(mode)) return { edits: [], pkg: null };
  const out = [];
  const calls = (n) => cmdCalls(t, n, 2).filter((c) => argOf(t, c, 0) === 'footnote');
  // (what restarts it now, other than the page: taken out unless it is what is asked)
  for (const c of [...calls('counterwithin'), ...calls('numberwithin')]) {
    const w = argOf(t, c, 1);
    if (!(mode === w && c.star)) out.push(drop(src, c.s, c.e));
  }
  for (const c of calls('counterwithout')) if (mode !== 'continuous' || !chapters) out.push(drop(src, c.s, c.e));
  const p = packageLine(src, 'footmisc', end);
  if (mode !== 'page' && p && p.opts && p.names.length === 1 && parseKV(src, p.opts[0], p.opts[1]).some((x) => x.key === 'perpage')) out.push(...optEdits(src, p, { perpage: null }));
  let pkg = null;
  if (mode === 'page') pkg = { footmisc: { perpage: true } };
  const have = (n, w, star) => calls(n).some((c) => argOf(t, c, 1) === w && !!c.star === star);
  if (mode === 'section' && !chapters && !have('counterwithin', 'section', true)) out.push(...preambleLine(src, '\\counterwithin*{footnote}{section}'));
  if (mode === 'continuous' && chapters && !have('counterwithout', 'chapter', false)) out.push(...preambleLine(src, '\\counterwithout{footnote}{chapter}'));
  return { edits: out, pkg };
}

// ---- edits: the bibliography --------------------------------------------------------------------
// What a file says of its bibliography: the system (biblatex, natbib, plain BibTeX, a list written
// by hand), the style, and where each command is ({ s, e, args } of the file's text)
// others: the text of the files the preamble reads (App.preambleOthers): biblatex loaded by the
// project's own .sty is biblatex, and wants no natbib and no \bibliography (review H8)
export function bibSetup(src, others = []) {
  const { end } = preOf(src);
  const { t, from } = bodyOf(src);
  const has = (n) => !!packageLine(src, n, end) || (others.length ? hasPackage(src, n, end, others) || provides(src, n, others, end) : false);
  const B = { biblatex: has('biblatex') || has('biblatex-chicago'), natbib: has('natbib'), style: null, styleCall: null, bib: null, print: null, thebib: false, resources: [], files: [], elsewhere: false };
  B.elsewhere = B.biblatex && !packageLine(src, 'biblatex', end) && !packageLine(src, 'biblatex-chicago', end);
  B.system = B.biblatex ? 'biblatex' : B.natbib ? 'natbib' : 'bibtex';
  if (B.biblatex) {
    const o = packageOptions(src, 'biblatex', end) || {};
    B.style = o.style || o.bibstyle || 'numeric';
    for (const c of cmdCalls(t, 'addbibresource', 1, 0, Math.max(0, end), true)) B.resources.push({ ...c, name: argOf(t, c, 0) });
    for (const o of others.slice(0, 20)) { const u = stripComments(o.slice(0, MAX)); for (const c of cmdCalls(u, 'addbibresource', 1, 0, u.length, true)) B.resources.push({ name: u.slice(c.args[0][0], c.args[0][1]).trim(), other: true }); }
    const pr = cmdCalls(t, 'printbibliography', 0, from, t.length, true);
    if (pr.length) B.print = pr[0];
    B.files = B.resources.map((r) => r.name);
  } else {
    const st = cmdCalls(t, 'bibliographystyle', 1);
    if (st.length) { B.styleCall = st[st.length - 1]; B.style = argOf(t, B.styleCall, 0); }
    // (natbib's numbers: its option, or \setcitestyle{numbers} in the preamble)
    if (B.natbib) { const o = packageOptions(src, 'natbib', end) || {}; B.numbers = !!o.numbers || /\\setcitestyle\s*\{[^{}]{0,80}\bnumbers\b/.test(t.slice(0, Math.max(0, end))); }
    const bb = cmdCalls(t, 'bibliography', 1, from);
    if (bb.length) { B.bib = bb[0]; B.print = bb[0]; B.files = argOf(t, bb[0], 0).split(',').map((x) => x.trim()).filter(Boolean); }
  }
  B.thebib = t.indexOf('\\begin{thebibliography}', from) >= 0;
  if (B.thebib && !B.print) B.system = 'thebibliography';
  return B;
}

// The citation styles each system offers: [value, Word's name or a plain one, what it gives].
// BibTeX's are its own .bst files (and natbib's), biblatex's its styles; every one is in the tree.
export const BIB_STYLES = {
  biblatex: [['apa', 'APA', 'Author and year, APA 7th edition'], ['chicago-authordate', 'Chicago', 'Author and date, Chicago Manual of Style'], ['ieee', 'IEEE', 'Numbered, IEEE'],
    ['mla', 'MLA', 'Author and page, MLA 9th edition'], ['authoryear', 'Harvard', 'Author and year'], ['numeric', 'Numbered', 'Numbered in alphabetical order'], ['alphabetic', 'Alphabetic', 'Labels from authors and year: [Knu84]']],
  // (natbib takes only its own .bst in its author and year mode; a numbered style is the same .bst
  // with natbib's numbers option, which bibStyleEdits sets and takes away: review H6)
  natbib: [['plainnat', 'Author–year', 'Author and year (plainnat)'], ['apalike', 'APA', 'APA-like (apalike)'], ['abbrvnat', 'Author–year, abbreviated', 'First names abbreviated (abbrvnat)'],
    ['unsrtnat', 'Author–year, in order cited', 'Listed in the order cited (unsrtnat)'], ['IEEEtranN:numbers', 'IEEE', 'Numbered, IEEE (IEEEtranN, natbib\'s numbers)'],
    ['plainnat:numbers', 'Numbered', 'Numbered in alphabetical order (plainnat, natbib\'s numbers)'], ['unsrtnat:numbers', 'Numbered, in order cited', 'Numbered in the order cited (unsrtnat, natbib\'s numbers)']],
  bibtex: [['plain', 'Numbered', 'Numbered in alphabetical order (plain)'], ['unsrt', 'Numbered, in order cited', 'Numbered in the order cited (unsrt)'], ['ieeetr', 'IEEE', 'Numbered in the order cited (ieeetr)'],
    ['abbrv', 'Abbreviated', 'First names abbreviated (abbrv)'], ['alpha', 'Alphabetic', 'Labels from authors and year (alpha)'], ['apalike', 'APA', 'APA-like, author and year (apalike)']]
};
const SAFE_STYLE = /^[A-Za-z0-9-]{1,40}(:numbers)?$/;

// The style set: biblatex's style= option (bibstyle= and citestyle= go with it), or the argument
// of \bibliographystyle, written next to \bibliography where the file has none
export function bibStyleEdits(src, style, others = []) {
  if (!SAFE_STYLE.test(style)) return [];
  const B = bibSetup(src, others), { end } = preOf(src);
  if (B.system === 'biblatex') {
    const p = packageLine(src, 'biblatex', end);
    if (!p || p.names.length !== 1) return [];
    if (!p.opts) return [{ s: p.list[0] - 1, e: p.list[0] - 1, t: '[style=' + style + ']' }];
    const kv = parseKV(src, p.opts[0], p.opts[1]);
    if (kv.some((x) => x.key === 'style' && x.value === style) && !kv.some((x) => x.key === 'bibstyle' || x.key === 'citestyle')) return [];
    return kvEdits(src, p.opts[0], p.opts[1], { style }, (k) => k === 'bibstyle' || k === 'citestyle');
  }
  if (B.system === 'thebibliography') return [];
  // natbib: the .bst, and its numbers option on its line as the style wants it
  // (BibTeX's own numbered styles under natbib, as an agent may ask: natbib's numbered ones; alpha
  // has no natbib form, review V6)
  if (B.natbib) { const NAT = { ieeetr: 'IEEEtranN:numbers', plain: 'plainnat:numbers', unsrt: 'unsrtnat:numbers', abbrv: 'abbrvnat:numbers' }; if (NAT[style]) style = NAT[style]; if (style === 'alpha') return []; }
  const num = /:numbers$/.test(style);
  style = style.replace(/:numbers$/, '');
  const opt = [];
  if (B.natbib) {
    // (\setcitestyle{numbers} in the preamble taken off for an author and year style, review V7)
    if (!num) { const pt = stripComments(src.slice(0, Math.max(0, end))); for (const c of cmdCalls(pt, 'setcitestyle', 1)) { const [a, b] = c.args[0], kv = parseKV(pt, a, b); if (!kv.some((x) => x.key === 'numbers')) continue; opt.push(kv.length === 1 ? drop(src, c.s, c.e) : kvEdits(src, a, b, { numbers: null, authoryear: true })[0]); } }
    const p = packageLine(src, 'natbib', end);
    if (p && p.names.length === 1 && (num ? !B.numbers : !!(packageOptions(src, 'natbib', end) || {}).numbers)) {
      if (!p.opts) { if (num) opt.push({ s: p.list[0] - 1, e: p.list[0] - 1, t: '[numbers]' }); } else {
        const kv = parseKV(src, p.opts[0], p.opts[1]);
        const ed = kvEdits(src, p.opts[0], p.opts[1], num ? { numbers: true, authoryear: null } : { numbers: null });
        opt.push(...(ed.length === 1 && !ed[0].t.trim() && kv.length === 1 ? [{ s: p.opts[0] - 1, e: p.opts[1] + 1, t: '' }] : ed));
      }
    }
  } else if (num) return [];
  const withOpt = (ed) => [...opt, ...ed];
  if (B.styleCall) { const [a, b] = B.styleCall.args[0]; return withOpt(src.slice(a, b).trim() === style ? [] : [{ s: a, e: b, t: style }]); }
  if (B.bib) { const ls = src.lastIndexOf('\n', B.bib.s - 1) + 1, ind = src.slice(ls, B.bib.s); return withOpt([{ s: B.bib.s, e: B.bib.s, t: '\\bibliographystyle{' + style + '}' + eolOf(src) + (/^[ \t]*$/.test(ind) ? ind : '') }]); }
  return withOpt([]);
}

// The bibliography's title: biblatex's title= of \printbibliography, else \refname (\bibname with
// chapters) set just before \bibliography; null: the class's own
export function bibTitle(src, chapters, others = []) {
  const B = bibSetup(src, others), { t } = bodyOf(src);
  if (B.system === 'biblatex') {
    if (!B.print || !B.print.opt) return null;
    const kv = parseKV(t, B.print.opt[0], B.print.opt[1]).find((x) => x.key === 'title');
    return kv ? unbrace(kv.value || '') : null;
  }
  const name = chapters ? 'bibname' : 'refname';
  const r = cmdCalls(t, 'renewcommand', 2).filter((c) => unbrace(argOf(t, c, 0)) === '\\' + name).pop();
  return r ? argOf(t, r, 1) : null;
}
// The edits that give the bibliography this title (null: the class's own, any title taken out).
// title is LaTeX already (the caller escapes what was typed).
export function bibTitleEdits(src, title, chapters, others = []) {
  const B = bibSetup(src, others), { t } = bodyOf(src), nl = eolOf(src);
  if (B.system === 'biblatex') {
    const P = B.print;
    if (!P) return [];
    const v = title == null ? null : /[,=\]\[]/.test(title) ? '{' + title + '}' : title;
    if (!P.opt) return v == null ? [] : [{ s: P.e, e: P.e, t: '[title=' + v + ']' }];
    const kv = parseKV(t, P.opt[0], P.opt[1]);
    if (v == null && !kv.some((x) => x.key === 'title')) return [];
    if (v == null && kv.length === 1) return [{ s: P.opt[0] - 1, e: P.opt[1] + 1, t: '' }];
    return kvEdits(src, P.opt[0], P.opt[1], { title: v });
  }
  if (!B.bib) return [];
  const name = chapters ? 'bibname' : 'refname';
  const rs = cmdCalls(t, 'renewcommand', 2).filter((c) => unbrace(argOf(t, c, 0)) === '\\' + name && c.s >= Math.max(0, preambleEnd(src)));
  if (title == null) return rs.map((c) => drop(src, c.s, c.e));
  const last = rs[rs.length - 1];
  if (last) { const [a, b] = last.args[1]; return src.slice(a, b) === title ? [] : [{ s: a, e: b, t: title }]; }
  // (just before \bibliographystyle where it stands right before \bibliography, else \bibliography)
  const at = B.styleCall && B.styleCall.s < B.bib.s && !/\S/.test(t.slice(B.styleCall.e, B.bib.s)) ? B.styleCall.s : B.bib.s;
  const ls = src.lastIndexOf('\n', at - 1) + 1, ind = src.slice(ls, at);
  return [{ s: at, e: at, t: '\\renewcommand{\\' + name + '}{' + title + '}' + nl + (/^[ \t]*$/.test(ind) ? ind : '') }];
}

// ---- edits: notes, contents, indexes ---------------------------------------------------------------
// The calls of these commands in a file's body (comments left out): [{ s, e, name }]
const NARGS = { bibliography: 1, bibliographystyle: 1, addcontentsline: 3 };
export function bodyCalls(src, names, opt = false) {
  const { t, from } = bodyOf(src), out = [];
  for (const n of names) for (const c of cmdCalls(t, n, NARGS[n] || 0, from, t.length, opt)) out.push({ ...c, name: n });
  return out.sort((a, b) => a.s - b.s);
}
// The \footnote{ or \endnote{ commands of a file, to turn one kind into the other: { s, e } of
// each command's name (without the backslash), in the body, comments and verbatim left out
export function noteNames(src, name) {
  const { t, from } = bodyOf(src), out = [];
  const re = new RegExp('\\\\' + name + '(?![A-Za-z@*])', 'g');
  // (not inside a verbatim: its ranges found once, in one pass)
  const verb = [];
  for (let i = t.indexOf('\\begin{verbatim}', from), k = 0; i >= 0 && k < 5000; k++) {
    const z = t.indexOf('\\end{verbatim}', i);
    verb.push([i, z < 0 ? t.length : z]);
    if (z < 0) break;
    i = t.indexOf('\\begin{verbatim}', z);
  }
  // (and not in a heading's or a caption's argument: moved to the contents, an endnote there is
  // printed twice by enotez, review L7)
  for (const n of ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'caption']) for (const c of cmdCalls(t, n, 1, from, t.length, true)) verb.push([c.opt ? c.opt[0] : c.args[0][0], c.e]);
  verb.sort((a, b) => a[0] - b[0]);
  let v = 0;
  re.lastIndex = from;
  for (let m, k = 0; (m = re.exec(t)) && k < 20000; k++) {
    while (v < verb.length && verb[v][1] < m.index) v++;
    if (verb.slice(v, v + 12).some(([a, b]) => a <= m.index && m.index < b)) continue;
    out.push({ s: m.index + 1, e: m.index + 1 + name.length });
  }
  return out;
}

// One \index{…} entry from the Mark Entry fields: main and sub entries (! between them), the
// page's look (|textbf, |textit), a cross reference (|see{…}), a range's end (|( and |)). The
// texts are LaTeX already (escaped by the caller); makeindex's own characters ! @ | " in them
// are quoted with ".
export function indexArg(o) {
  const q = (x) => String(x || '').replace(/["!@|]/g, (c) => '"' + c);
  let a = q(o.main);
  if (o.sort) a = q(o.sort) + '@' + a;
  if (o.sub) a += '!' + q(o.sub);
  if (o.third && o.sub) a += '!' + q(o.third);
  if (o.see) a += '|see{' + o.see + '}';
  else if (o.range === 'open') a += '|(' + (o.fmt || '');
  else if (o.range === 'close') a += '|)';
  else if (o.fmt) a += '|' + o.fmt;
  return a;
}
// An \index{…} argument read back: { levels: [{ sort, text }], see, fmt, range }; makeindex's
// quote character " keeps the next character as it is
export function readIndexArg(a) {
  const out = { levels: [], see: null, seealso: null, fmt: null, range: null };
  let cur = '', sort = null, i = 0, depth = 0;
  const n = Math.min(a.length, 2000);
  const push = () => { out.levels.push({ sort: sort == null ? cur : sort, text: cur }); cur = ''; sort = null; };
  for (; i < n; i++) {
    const c = a[i];
    if (c === '"' && i + 1 < n) { cur += a[++i]; continue; }
    if (c === '\\') { cur += c + (a[i + 1] || ''); i++; continue; }
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth === 0 && c === '!') { push(); continue; }
    if (depth === 0 && c === '@' && sort == null) { sort = cur; cur = ''; continue; }
    if (depth === 0 && c === '|') { i++; break; }
    cur += c;
  }
  push();
  if (i <= n) {
    const enc = a.slice(i, n);
    let m;
    if ((m = /^see\s*\{(.*)\}$/.exec(enc))) out.see = m[1];
    else if ((m = /^seealso\s*\{(.*)\}$/.exec(enc))) out.seealso = m[1];
    else if (enc[0] === '(') { out.range = 'open'; out.fmt = enc.slice(1) || null; } else if (enc[0] === ')') out.range = 'close';
    else if (enc) out.fmt = enc;
  }
  return out;
}

// makeindex's order: symbols, then numbers, then letters, each letter group with upper and
// lower case together (Aa before ab), by the entry as written (\textit{x} sorts among the symbols
// unless a sort key comes before an @, as in makeindex)
export function indexKey(s) {
  const t = String(s).trim();
  const c = t[0] || '';
  const grp = /[A-Za-zÀ-ɏ]/.test(c) ? 2 : /[0-9]/.test(c) ? 1 : 0;
  return { grp, key: t.toLowerCase(), raw: t, letter: grp === 2 ? c.toLowerCase() : grp === 1 ? '#' : '!' };
}
// Page numbers as makeindex writes them: sorted, three or more in a row made a range (1–3), each
// with its look; pages: [{ page, fmt, range }]
export function pageList(pages) {
  const seen = new Map();
  for (const p of pages) if (p.page != null && !seen.has(p.page)) seen.set(p.page, p.fmt || '');
  const ns = [...seen.keys()].sort((a, b) => a - b), out = [];
  for (let k = 0; k < ns.length;) {
    let j = k;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1 && seen.get(ns[j + 1]) === seen.get(ns[k])) j++;
    if (j - k >= 2) { out.push({ t: ns[k] + '–' + ns[j], fmt: seen.get(ns[k]) }); k = j + 1; } else { out.push({ t: String(ns[k]), fmt: seen.get(ns[k]) }); k++; }
  }
  return out;
}

// A label key from words: lowercase letters, digits and hyphens, at most 30 characters, with its
// kind's prefix (sec:, fig:, tab:, eq:)
export function labelKey(prefix, words, taken) {
  const base = String(words || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\\[a-z]+/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'x';
  let k = prefix + base, n = 2;
  while (taken && taken.has(k) && n < 1000) k = prefix + base + '-' + n++;
  return k;
}

// (R4) a makeindex style's page numbers: 'dots' where the first page follows its entry after
// \dotfill (Word's right aligned page numbers with dots), 'space' after \hfill, else null
export function istRight(text) {
  const m = /^\s*delim_0\s+"((?:[^"\\\n]|\\.){0,80})"/m.exec(String(text || '').slice(0, 20000));
  if (!m) return null;
  return /\\\\dotfill/.test(m[1]) ? 'dots' : /\\\\hfill/.test(m[1]) ? 'space' : null;
}
// the style Insert Index writes for right aligned page numbers, a file of the project
export const RIGHT_IST = 'index-right.ist';
export const RIGHT_IST_TEXT = '% Written by Rikuy (Insert Index, Right align page numbers): makeindex puts each entry\'s\n% page numbers at the right margin, joined to it by a row of dots\ndelim_0 "\\\\dotfill "\ndelim_1 "\\\\dotfill "\ndelim_2 "\\\\dotfill "\n';
