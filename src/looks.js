// How headings look, as the preamble says it: titlesec's \titleformat and \titlespacing lines,
// read into a look ({ size, bf, it, sc, sf, tt, color, align, rule, shape, num, before, after })
// and written back from one, each level on a line of its own; KOMA-Script's \setkomafont for its
// headings' font; the document's accent colour (\definecolor{accent}{HTML}{…}). The Styles pane's
// Modify Style and the Design tab's Themes, Style Set, Colors and Fonts are made of these edits
// (src/ui/looks.js); the page draws what they read (src/model.js, heading()). Pure functions on a
// string, every scan bounded (a stranger's preamble): test/looks.test.mjs.

export const SIZES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'];
export const LOOK_CMDS = ['chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
const MAX = 200000, ARG = 2000;

// LaTeX's own look of each heading (article, report, book): what titlesec starts from
export function defaultLook(cmd, koma) {
  const L = {
    part: { size: 'Huge', bf: true, shape: 'display', align: 'center' },
    chapter: { size: 'huge', bf: true, shape: 'display' },
    section: { size: 'Large', bf: true },
    subsection: { size: 'large', bf: true },
    subsubsection: { size: 'normalsize', bf: true },
    paragraph: { size: 'normalsize', bf: true, shape: 'runin' },
    subparagraph: { size: 'normalsize', bf: true, shape: 'runin' }
  }[cmd];
  if (!L) return null;
  const out = { size: L.size, bf: !!L.bf, it: false, sc: false, sf: !!koma, tt: false, color: null, align: L.align || 'left', rule: false, shape: L.shape || 'hang', num: true, before: null, after: null };
  // (KOMA-Script's headings are sans serif and a little larger)
  if (koma && cmd === 'section') out.size = 'Large';
  return out;
}
const same = (a, b) => ['size', 'bf', 'it', 'sc', 'sf', 'tt', 'color', 'align', 'rule', 'shape', 'num', 'before', 'after'].every((k) => (a[k] ?? null) === (b[k] ?? null));
export const isDefaultLook = (cmd, look, koma) => !look || same(look, defaultLook(cmd, koma));

// ---- reading -------------------------------------------------------------------------------
// the balanced group at i ({…} or […]) as [i, end), or -1; never more than ARG characters
function group(t, i) {
  const open = t[i], close = open === '{' ? '}' : ']';
  let d = 0;
  for (let j = i, z = Math.min(t.length, i + ARG); j < z; j++) {
    const c = t[j];
    if (c === '\\') { j++; continue; }
    if (c === open) d++;
    else if (c === close && --d === 0) return j + 1;
  }
  return -1;
}
const skipSp = (t, i) => { for (let n = 0; n < 200 && i < t.length && /\s/.test(t[i]); n++) i++; return i; };
// comments made spaces, offsets kept
export function stripComments(t) {
  let out = '', i = 0;
  const n = Math.min(t.length, MAX);
  while (i < n) {
    const c = t[i];
    if (c === '\\') { out += t.slice(i, i + 2); i += 2; continue; }
    if (c === '%') { const j = t.indexOf('\n', i), e = j < 0 ? n : j; out += ' '.repeat(e - i); i = e; continue; }
    out += c; i++;
  }
  return out;
}
export function preambleEnd(src) {
  const m = /\\begin\s*\{document\}/.exec(stripComments(src.slice(0, MAX)));
  return m ? m.index : -1;
}

// A format's tokens into the look's fields; what is no font, size, colour or alignment is kept
// as it is (extra), so Modify Style writes it back
export function readFormat(fmt, base) {
  const L = { ...base, extra: '' };
  let i = 0, n = 0;
  const t = fmt;
  for (; i < t.length && n < 60; n++) {
    i = skipSp(t, i);
    if (i >= t.length) break;
    const m = /^\\([A-Za-z]+)/.exec(t.slice(i, i + 40));
    if (!m) { const z = t[i] === '{' ? group(t, i) : -1; const e = z > 0 ? z : i + 1; L.extra += t.slice(i, e); i = e; continue; }
    const w = m[1];
    i += m[0].length;
    if (w === 'normalfont') { L.bf = false; L.it = false; L.sc = false; L.sf = false; L.tt = false; L.size = 'normalsize'; }
    else if (SIZES.includes(w)) L.size = w;
    else if (w === 'bfseries' || w === 'bf') L.bf = true;
    else if (w === 'mdseries') L.bf = false;
    else if (w === 'itshape' || w === 'it' || w === 'slshape') L.it = true;
    else if (w === 'upshape') L.it = false;
    else if (w === 'scshape' || w === 'sc') L.sc = true;
    else if (w === 'sffamily' || w === 'sf') { L.sf = true; L.tt = false; }
    else if (w === 'ttfamily' || w === 'tt') { L.tt = true; L.sf = false; }
    else if (w === 'rmfamily' || w === 'rm') { L.sf = false; L.tt = false; }
    else if (w === 'filcenter' || w === 'centering') L.align = 'center';
    else if (w === 'filleft' || w === 'raggedleft') L.align = 'right';
    else if (w === 'filright' || w === 'raggedright') L.align = 'left';
    else if (w === 'color') {
      i = skipSp(t, i);
      const z = t[i] === '{' ? group(t, i) : -1;
      if (z < 0) { L.extra += '\\color'; continue; }
      L.color = t.slice(i + 1, z - 1).trim();
      i = z;
    } else L.extra += '\\' + w;
  }
  if (!L.extra) delete L.extra;
  return L;
}

// Every \titleformat, \titleformat* and \titlespacing(*) of the preamble, by heading: { cmd: { fmt:
// [s, e) of its line or command, look, spacing: [s, e) } }. Lines past the 300th are not read.
export function titleLines(src, end) {
  if (end == null) end = preambleEnd(src);
  const pre = stripComments(src.slice(0, end < 0 ? Math.min(src.length, MAX) : end));
  const out = {};
  const re = /\\(titleformat|titlespacing)(\*?)\s*/g;
  let m;
  for (let k = 0; (m = re.exec(pre)) && k < 300; k++) {
    let i = m.index + m[0].length;
    if (pre[i] !== '{') continue;
    const z = group(pre, i);
    if (z < 0) continue;
    const cmd = pre.slice(i + 1, z - 1).trim().replace(/^\\/, '');
    if (!/^(part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)$/.test(cmd)) continue;
    i = z;
    const args = [], opts = [];
    const take = (want) => { i = skipSp(pre, i); if (pre[i] !== want) return null; const e = group(pre, i); if (e < 0) return null; const a = pre.slice(i + 1, e - 1); i = e; return a; };
    // (each one's range kept: Modify replaces the first and takes the others away; the last says how TeX sets it)
    const rec = out[cmd] || (out[cmd] = { all: [] });
    if (m[1] === 'titleformat' && m[2]) {
      const f = take('{');
      if (f == null) continue;
      rec.fmt = { s: m.index, e: i, star: true };
      rec.all.push({ s: m.index, e: i });
      rec.format = f; rec.shape = rec.label = rec.afterCode = undefined;
    } else if (m[1] === 'titleformat') {
      const shape = take('[');
      // ({format}{label}{sep}{before}, then [after])
      for (let a = 0; a < 4; a++) { const g = take('{'); if (g == null) break; args.push(g); }
      if (args.length < 4) continue;
      const after = take('[');
      if (after != null) opts.push(after);
      rec.fmt = { s: m.index, e: i, star: false };
      rec.all.push({ s: m.index, e: i });
      rec.format = args[0]; rec.shape = shape; rec.label = args[1]; rec.sep = args[2]; rec.beforeCode = args[3]; rec.afterCode = after;
    } else {
      for (let a = 0; a < 3; a++) { const g = take('{'); if (g == null) break; args.push(g); }
      if (args.length < 3) continue;
      const right = take('[');
      rec.spacing = { s: m.index, e: i };
      rec.all.push({ s: m.index, e: i });
      rec.space = { left: args[0].trim(), before: args[1].trim(), after: args[2].trim(), right };
    }
  }
  return out;
}
// the first length of a skip ("12pt plus 2pt" is 12pt), in points, or null
export function lengthPt(t) {
  const m = /^\s*(-?\d*\.?\d+)\s*(pt|bp|mm|cm|in|ex|em|pc)?/.exec(String(t || ''));
  if (!m) return null;
  const f = { pt: 1, bp: 72.27 / 72, mm: 72.27 / 25.4, cm: 72.27 / 2.54, in: 72.27, pc: 12, ex: 4.3, em: 10 }[m[2] || 'pt'];
  return Math.round(parseFloat(m[1]) * f * 100) / 100;
}

// The look of every heading the preamble sets (titlesec, or KOMA-Script's \setkomafont): { cmd: look }
export function readHeadLooks(src, cls) {
  const koma = /^scr(artcl|reprt|book)$/.test(cls || '');
  const end = preambleEnd(src);
  if (end < 0) return {};
  const T = titleLines(src, end), out = {};
  for (const [cmd, r] of Object.entries(T)) {
    let L = defaultLook(cmd, koma);
    if (!L) continue;
    // (a format replaces the class's whole format: what it does not say is the text's own)
    if (r.format != null) L = readFormat(r.format, { ...L, size: 'normalsize', bf: false, it: false, sc: false, sf: false, tt: false });
    if (r.fmt && !r.fmt.star) {
      L.shape = (r.shape || '').trim() || 'hang';
      L.num = !!(r.label && r.label.trim());
      if (r.afterCode && /\\titlerule/.test(r.afterCode)) L.rule = true;
    }
    if (r.space) { L.before = lengthPt(r.space.before); L.after = lengthPt(r.space.after); }
    out[cmd] = L;
  }
  if (koma) {
    const pre = stripComments(src.slice(0, end));
    const re = /\\(setkomafont|addtokomafont)\s*\{(disposition|part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\}\s*\{/g;
    let m;
    for (let k = 0; (m = re.exec(pre)) && k < 100; k++) {
      const i = m.index + m[0].length - 1, z = group(pre, i);
      if (z < 0) continue;
      const fmt = pre.slice(i + 1, z - 1);
      for (const cmd of m[2] === 'disposition' ? LOOK_CMDS : [m[2]]) {
        const base = out[cmd] || defaultLook(cmd, true);
        const start = m[1] === 'setkomafont' ? { ...base, sf: false, bf: false, it: false, sc: false, tt: false, color: null } : base;
        out[cmd] = { ...readFormat(fmt, start), size: base.size };
        if (m[2] === 'disposition' && m[1] === 'setkomafont') out[cmd].komaDisp = true;
      }
    }
  }
  return out;
}

// ---- writing -------------------------------------------------------------------------------
// the format a look writes: \normalfont first, so it says all of the look
export function formatOf(L) {
  let f = '\\normalfont';
  if (L.size && L.size !== 'normalsize') f += '\\' + L.size;
  if (L.bf) f += '\\bfseries';
  if (L.it) f += '\\itshape';
  if (L.sc) f += '\\scshape';
  if (L.sf) f += '\\sffamily'; else if (L.tt) f += '\\ttfamily';
  if (L.extra) f += L.extra;
  if (L.color) f += '\\color{' + L.color + '}';
  if (L.align === 'center') f += '\\filcenter'; else if (L.align === 'right') f += '\\filleft';
  return f;
}
const LABEL = (cmd) => (cmd === 'chapter' ? '\\chaptertitlename\\ \\thechapter' : '\\the' + cmd);
const fmtPt = (v) => (Math.round(v * 10) / 10) + 'pt';
// The lines of one heading's look: \titleformat* where the format alone changes, \titleformat in
// full where the shape, the rule or the number does; \titlespacing* where a space is set
export function lookLines(cmd, L, koma) {
  const D = defaultLook(cmd, koma);
  if (!L || !D) return [];
  const out = [];
  const shaped = (L.shape || 'hang') !== D.shape || L.rule || L.num === false;
  const fmtSame = ['size', 'bf', 'it', 'sc', 'sf', 'tt', 'color', 'align'].every((k) => (L[k] ?? null) === (D[k] ?? null)) && !L.extra;
  if (shaped) {
    const shape = L.shape || 'hang', sep = shape === 'display' ? '20pt' : '1em';
    const label = L.num === false ? '' : LABEL(cmd);
    out.push('\\titleformat{\\' + cmd + '}[' + shape + ']{' + formatOf(L) + '}{' + label + '}{' + sep + '}{' + (shape === 'display' && cmd === 'chapter' ? '\\Huge' : '') + '}' + (L.rule ? '[\\titlerule]' : ''));
  } else if (!fmtSame) out.push('\\titleformat*{\\' + cmd + '}{' + formatOf(L) + '}');
  if (L.before != null || L.after != null) {
    const def = { chapter: [50, 40], section: [3.5 * 4.3, 2.3 * 4.3], subsection: [3.25 * 4.3, 1.5 * 4.3], subsubsection: [3.25 * 4.3, 1.5 * 4.3], paragraph: [3.25 * 4.3, 10], subparagraph: [3.25 * 4.3, 10] }[cmd] || [12, 6];
    out.push('\\titlespacing*{\\' + cmd + '}{0pt}{' + fmtPt(L.before ?? def[0]) + '}{' + fmtPt(L.after ?? def[1]) + '}');
  }
  return out;
}

// The edits that give the headings these looks ({ cmd: look, or null for LaTeX's own }): each
// heading's \titleformat and \titlespacing lines replaced where they are (the first one; others of
// the same heading go), new ones after the last of them or at the preamble's end. A line that
// holds more than the command keeps the rest. [] where nothing changes; null with no preamble.
export function headLookEdits(src, want, o = {}) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const T = titleLines(src, end), edits = [], add = [];
  let last = -1;
  for (const r of Object.values(T)) for (const x of r.all) last = Math.max(last, x.e);
  // a range as its whole line where nothing else stands on it
  const whole = (x) => {
    const ls = src.lastIndexOf('\n', x.s - 1) + 1, le = src.indexOf('\n', x.e);
    const lineEnd = le < 0 ? src.length : le;
    return src.slice(ls, x.s).trim() === '' && src.slice(x.e, lineEnd).trim() === '' ? { s: ls, e: le < 0 ? src.length : le + 1, line: true } : { s: x.s, e: x.e, line: false };
  };
  for (const [cmd, L] of Object.entries(want)) {
    const lines = L ? lookLines(cmd, L, o.koma) : [];
    const r = T[cmd] || { all: [] };
    const have = r.all.map(whole).sort((a, b) => a.s - b.s);
    const cur = have.map((x) => src.slice(x.s, x.e).trim()).join('\n');
    if (cur === lines.join('\n')) continue;
    if (have.length) {
      const nl = src.slice(have[0].s, have[0].e).endsWith('\r\n') ? '\r\n' : '\n';
      edits.push({ s: have[0].s, e: have[0].e, t: lines.length ? lines.join(nl) + (have[0].line ? nl : '') : have[0].line ? '' : '' });
      for (const x of have.slice(1)) edits.push({ s: x.s, e: x.e, t: '' });
    } else if (lines.length) add.push(...lines);
  }
  if (add.length) {
    if (last >= 0) {
      const le = src.indexOf('\n', last), at = le < 0 ? src.length : le + 1;
      edits.push({ s: at, e: at, t: add.join('\n') + '\n' });
    } else {
      const at = src.lastIndexOf('\n', end - 1) + 1, lead = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '', s = lead ? end : at;
      edits.push({ s, e: s, t: lead + add.join('\n') + '\n' });
    }
  }
  return edits;
}

// KOMA-Script: the headings' font for all of them, \setkomafont{disposition}{…} on a line of its
// own (written, changed or taken away again: sans serif bold is the class's own)
export function komaFontEdits(src, fmt) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const pre = stripComments(src.slice(0, end));
  const m = /\\setkomafont\s*\{disposition\}\s*\{/.exec(pre);
  if (m) {
    const i = m.index + m[0].length - 1, z = group(pre, i);
    if (z < 0) return null;
    if (fmt == null) {
      const ls = src.lastIndexOf('\n', m.index - 1) + 1, le = src.indexOf('\n', z);
      if (src.slice(ls, m.index).trim() === '' && src.slice(z, le < 0 ? src.length : le).trim() === '') return [{ s: ls, e: le < 0 ? src.length : le + 1, t: '' }];
      return [{ s: m.index, e: z, t: '' }];
    }
    return src.slice(i + 1, z - 1) === fmt ? [] : [{ s: i + 1, e: z - 1, t: fmt }];
  }
  if (fmt == null) return [];
  const at = src.lastIndexOf('\n', end - 1) + 1, lead = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '', s = lead ? end : at;
  return [{ s, e: s, t: lead + '\\setkomafont{disposition}{' + fmt + '}\n' }];
}

// The accent colour: \definecolor{accent}{HTML}{hex} written once (changed where it is), or
// taken away (null) where Rikuy's line is alone on its line
export function accentEdits(src, hex) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const pre = stripComments(src.slice(0, end));
  const m = /\\definecolor\s*\{accent\}\s*\{([^{}]{0,20})\}\s*\{([^{}]{0,40})\}/.exec(pre);
  if (m) {
    if (hex == null) {
      const ls = src.lastIndexOf('\n', m.index - 1) + 1, e = m.index + m[0].length, le = src.indexOf('\n', e);
      if (src.slice(ls, m.index).trim() === '' && src.slice(e, le < 0 ? src.length : le).trim() === '') return [{ s: ls, e: le < 0 ? src.length : le + 1, t: '' }];
      return [{ s: m.index, e, t: '' }];
    }
    const line = '\\definecolor{accent}{HTML}{' + hex + '}';
    return m[0] === line ? [] : [{ s: m.index, e: m.index + m[0].length, t: line }];
  }
  if (hex == null) return [];
  const at = src.lastIndexOf('\n', end - 1) + 1, lead = at < end && /\S/.test(src.slice(at, end)) ? '\n' : '', s = lead ? end : at;
  return [{ s, e: s, t: lead + '\\definecolor{accent}{HTML}{' + hex + '}\n' }];
}
// the accent colour the preamble defines, as #RRGGBB, or null
export function accentOf(src) {
  const end = preambleEnd(src);
  if (end < 0) return null;
  const m = /\\definecolor\s*\{accent\}\s*\{HTML\}\s*\{([0-9A-Fa-f]{6})\}/.exec(stripComments(src.slice(0, end)));
  return m ? m[1].toUpperCase() : null;
}

// ---- the Design tab's sets ------------------------------------------------------------------
// Style sets (Word's Document Formatting gallery): a look for each heading level as changes from
// LaTeX's own. "LaTeX" is no line at all.
export const STYLE_SETS = [
  { id: 'latex', name: 'LaTeX', title: 'LaTeX\'s own headings: no titlesec lines', heads: {} },
  { id: 'sans', name: 'Sans', title: 'Headings in sans serif, bold', heads: { chapter: { sf: true }, section: { sf: true }, subsection: { sf: true }, subsubsection: { sf: true } } },
  { id: 'centered', name: 'Centered', title: 'Section headings centred', heads: { chapter: { align: 'center' }, section: { align: 'center' }, subsection: { align: 'center' } } },
  { id: 'lines', name: 'Lines', title: 'A rule under each section heading', heads: { section: { rule: true }, chapter: { rule: true } } },
  { id: 'smallcaps', name: 'Small caps', title: 'Headings in small capitals, not bold; sections centred', heads: { chapter: { bf: false, sc: true, align: 'center' }, section: { bf: false, sc: true, align: 'center' }, subsection: { bf: false, sc: true }, subsubsection: { bf: false, it: true } } },
  { id: 'minimal', name: 'Minimalist', title: 'Smaller headings, the third level in italics', heads: { section: { size: 'large' }, subsection: { size: 'normalsize' }, subsubsection: { bf: false, it: true } } },
  { id: 'casual', name: 'Casual', title: 'Headings in sans serif and the accent colour', accent: true, heads: { chapter: { sf: true, color: 'accent' }, section: { sf: true, color: 'accent' }, subsection: { sf: true, color: 'accent' }, subsubsection: { sf: true } } }
];
// the looks a set gives a class's levels: { cmd: look or null }
export function setLooks(set, chapters, koma) {
  const out = {};
  for (const cmd of ['chapter', 'section', 'subsection', 'subsubsection']) {
    if (cmd === 'chapter' && !chapters) continue;
    const ch = set.heads[cmd];
    out[cmd] = ch ? { ...defaultLook(cmd, koma), ...ch } : null;
  }
  return out;
}
// which set the looks are, or null (looks of the document's own)
export function setOf(looks, chapters, koma) {
  const cur = (cmd) => (looks[cmd] ? looks[cmd] : defaultLook(cmd, koma));
  return STYLE_SETS.find((S) => Object.entries(setLooks(S, chapters, koma)).every(([cmd, L]) => same(cur(cmd), L || defaultLook(cmd, koma)))) || null;
}

// Theme colours (Word's Colors): the accent the headings take
export const COLORS = [
  { id: 'none', name: 'Black', hex: null, title: 'Headings in black, as LaTeX sets them' },
  { id: 'blue', name: 'Blue', hex: '1F4E79' }, { id: 'office', name: 'Office', hex: '2F5496' }, { id: 'teal', name: 'Teal', hex: '0E6F70' },
  { id: 'green', name: 'Green', hex: '2E6B30' }, { id: 'red', name: 'Red', hex: 'A4262C' }, { id: 'violet', name: 'Violet', hex: '5B2C83' },
  { id: 'orange', name: 'Orange', hex: 'B35309' }, { id: 'grey', name: 'Grey', hex: '44546A' }
];
// Theme fonts for headings (Word's Fonts): the body's font is the Font box's (Home)
export const HEAD_FONTS = [
  { id: 'same', name: 'Same as the text', title: 'Headings in the text\'s font (LaTeX\'s own)', set: { sf: false, tt: false, sc: false } },
  { id: 'sans', name: 'Sans serif', title: 'Headings in sans serif', set: { sf: true, tt: false } },
  { id: 'smallcaps', name: 'Small capitals', title: 'Headings in small capitals', set: { sc: true, sf: false, tt: false } },
  { id: 'mono', name: 'Typewriter', title: 'Headings in typewriter type', set: { tt: true, sf: false } }
];
// Themes: a style set, a colour and a heading font as one
export const THEMES = [
  { id: 'latex', name: 'LaTeX', set: 'latex', color: 'none', title: 'LaTeX\'s own look: black headings in the text\'s font' },
  { id: 'modern', name: 'Modern', set: 'sans', color: 'office', title: 'Sans serif headings in blue' },
  { id: 'classic', name: 'Classic', set: 'smallcaps', color: 'none', title: 'Centred small capitals, black' },
  { id: 'report', name: 'Report', set: 'lines', color: 'teal', title: 'Section headings over a rule, in teal' },
  { id: 'casual', name: 'Casual', set: 'casual', color: 'orange', title: 'Sans serif headings in orange' }
];
