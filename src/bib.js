// BibTeX reading and author-year / numeric formatting.
import { parse, CHARS, ACCENTS } from './parser.js';

const LOGOS = { TeX: 'TeX', LaTeX: 'LaTeX', LaTeXe: 'LaTeX2\u03B5', BibTeX: 'BibTeX', XeLaTeX: 'XeLaTeX', pdfLaTeX: 'pdfLaTeX' };

export function parseBib(src, file) {
  const entries = new Map();
  const strings = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
  const n = src.length;
  let i = 0;
  const ws = () => { while (i < n && /\s/.test(src[i])) i++; };
  const readValue = () => {
    ws();
    let out = '';
    for (;;) {
      ws();
      const c = src[i];
      if (c === '{') {
        let depth = 0, s = i;
        for (; i < n; i++) {
          if (src[i] === '\\') { i++; continue; }
          if (src[i] === '{') depth++;
          else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
        }
        out += src.slice(s + 1, i - 1);
      } else if (c === '"') {
        let depth = 0, s = ++i;
        for (; i < n; i++) {
          if (src[i] === '\\') { i++; continue; }
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          else if (src[i] === '"' && depth === 0) break;
        }
        out += src.slice(s, i); i++;
      } else {
        const m = /^[A-Za-z0-9_.:+\/-]+/.exec(src.slice(i, i + 200));
        if (!m) break;
        i += m[0].length;
        const k = m[0].toLowerCase();
        out += /^\d+$/.test(m[0]) ? m[0] : (strings[k] ?? m[0]);
      }
      ws();
      if (src[i] === '#') { i++; continue; }
      break;
    }
    return out;
  };
  while (i < n) {
    const at = src.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const m = /^([A-Za-z]+)\s*([{(])/.exec(src.slice(i, i + 40));
    if (!m) continue;
    const type = m[1].toLowerCase();
    i += m[0].length;
    const close = m[2] === '{' ? '}' : ')';
    if (type === 'comment' || type === 'preamble') {
      let depth = 1;
      for (; i < n && depth > 0; i++) { if (src[i] === '{' || src[i] === '(') depth++; else if (src[i] === '}' || src[i] === ')') depth--; }
      continue;
    }
    if (type === 'string') {
      ws();
      const km = /^[A-Za-z0-9_:-]+/.exec(src.slice(i, i + 100));
      if (!km) continue;
      i += km[0].length; ws();
      if (src[i] === '=') i++;
      strings[km[0].toLowerCase()] = readValue();
      ws(); if (src[i] === close) i++;
      continue;
    }
    ws();
    const km = /^[^,\s}]+/.exec(src.slice(i, i + 300));
    if (!km) continue;
    const key = km[0];
    i += km[0].length;
    const fields = {};
    for (;;) {
      ws();
      if (src[i] === ',') { i++; ws(); }
      if (i >= n || src[i] === close) { i++; break; }
      const fm = /^([A-Za-z0-9_:+-]+)\s*=/.exec(src.slice(i, i + 100));
      if (!fm) { // skip junk to next comma or close
        while (i < n && src[i] !== ',' && src[i] !== close) i++;
        continue;
      }
      i += fm[0].length;
      fields[fm[1].toLowerCase()] = readValue();
    }
    entries.set(key, { key, type, fields, file, s: at, e: i });
  }
  return entries;
}

// LaTeX field text to plain unicode.
export function texToPlain(s) {
  if (!s) return '';
  if (!/[\\{}$~`'-]/.test(s)) return s;
  const nodes = parse(s);
  let out = '';
  const walk = (ns) => {
    for (const nd of ns) {
      if (nd.t === 'text') out += lig(s.slice(nd.s, nd.e).replace(/\s+/g, ' '));
      else if (nd.t === 'group') walk(nd.nodes);
      else if (nd.t === 'special') out += nd.ch === '~' ? ' ' : (nd.err ? '' : nd.ch);
      else if (nd.t === 'math') out += s.slice(nd.is, nd.ie);
      else if (nd.t === 'cmd') {
        if (nd.accent) {
          const a = nd.args[0];
          let base = a ? plainOf(s, a.nodes) : '';
          if (base === 'ı') base = 'i';
          out += (base.slice(0, 1) + ACCENTS[nd.name]).normalize('NFC') + base.slice(1);
        } else if (nd.name in CHARS) out += CHARS[nd.name];
        else if (LOGOS[nd.name]) out += LOGOS[nd.name];
        else if (nd.args && nd.args.length) {
          const last = nd.args.filter(Boolean).pop();
          if (last && !last.raw) walk(last.nodes);
          else if (last) out += s.slice(last.is, last.ie);
        }
      }
    }
  };
  walk(nodes);
  return out;
}
function plainOf(s, nodes) { return texToPlain(nodes.map((n) => s.slice(n.s, n.e)).join('')); }
function lig(t) {
  return t.replace(/---/g, '—').replace(/--/g, '–').replace(/``/g, '“').replace(/''/g, '”').replace(/`/g, '‘').replace(/'/g, '’');
}

function splitTop(s, sep) {
  const out = []; let depth = 0, last = 0;
  const re = new RegExp('^\\s+' + sep + '\\s+', 'i');
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '{') depth++; else if (c === '}') depth--;
    else if (depth === 0 && /\s/.test(c)) {
      const m = re.exec(s.slice(k));
      if (m) { out.push(s.slice(last, k)); k += m[0].length - 1; last = k + 1; }
    }
  }
  out.push(s.slice(last));
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseNames(s) {
  if (!s) return [];
  return splitTop(s, 'and').map((raw) => {
    if (/^others$/i.test(raw)) return { last: 'others', first: '', others: true };
    const parts = splitTopComma(raw);
    let first = '', last = '';
    if (parts.length >= 2) { last = parts[0]; first = parts[parts.length - 1]; }
    else {
      const toks = splitWords(raw);
      if (toks.length === 1) last = toks[0];
      else {
        // von particles: lowercase words before last
        let k = toks.length - 1;
        let v = k;
        while (v > 1 && /^[a-z]/.test(toks[v - 1])) v--;
        last = toks.slice(v).join(' ');
        first = toks.slice(0, v).join(' ');
      }
    }
    return { last: texToPlain(last).trim(), first: texToPlain(first).trim() };
  });
}
function splitTopComma(s) {
  const out = []; let depth = 0, last = 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '{') depth++; else if (s[k] === '}') depth--;
    else if (s[k] === ',' && depth === 0) { out.push(s.slice(last, k).trim()); last = k + 1; }
  }
  out.push(s.slice(last).trim());
  return out;
}
function splitWords(s) {
  const out = []; let depth = 0, cur = '';
  for (const c of s) {
    if (c === '{') depth++; if (c === '}') depth--;
    if (/\s/.test(c) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

export function entryYear(e) {
  const f = e.fields;
  return texToPlain(f.year || (f.date || '').slice(0, 4) || 'n.d.');
}
export function shortAuthors(e) {
  const names = parseNames(e.fields.author || e.fields.editor || '');
  if (!names.length) {
    const t = texToPlain(e.fields.organization || e.fields.institution || e.fields.key || e.key);
    return t;
  }
  if (names.length === 1) return names[0].last;
  if (names.length === 2 && !names[1].others) return names[0].last + ' and ' + names[1].last;
  return names[0].last + ' et al.';
}
export function longAuthors(e, field = 'author') {
  const names = parseNames(e.fields[field] || '');
  return names.map((nm, k) => {
    if (nm.others) return 'others';
    if (k === 0) return nm.first ? nm.last + ', ' + nm.first : nm.last;
    return (nm.first ? nm.first + ' ' : '') + nm.last;
  });
}
function joinNames(list) {
  if (list.length <= 1) return list.join('');
  if (list[list.length - 1] === 'others') return list.slice(0, -1).join(', ') + ', et al.';
  if (list.length === 2) return list[0] + ', and ' + list[1];
  return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
}

// Format a reference entry as a list of runs [{t, it}].
export function formatEntry(e, suffix = '') {
  const f = e.fields;
  const P = (x) => texToPlain(x || '').replace(/[{}]/g, '').trim();
  const runs = [];
  const add = (t, it) => { if (t) runs.push({ t, it: !!it }); };
  let who = longAuthors(e, 'author');
  let eds = false;
  if (!who.length) { who = longAuthors(e, 'editor'); eds = who.length > 0; }
  const whoTxt = who.length ? joinNames(who) + (eds ? ', ed' + (who.length > 1 ? 's' : '') + '.' : '') : P(f.organization || f.institution || e.key);
  add(whoTxt.replace(/\.$/, '') + '. ');
  add(entryYear(e) + suffix + '. ');
  const title = P(f.title);
  const t = e.type;
  if (['book', 'booklet', 'manual', 'proceedings', 'collection'].includes(t)) {
    add(title, true); add('. ');
    if (f.edition) add(P(f.edition) + ' ed. ');
    const pub = [P(f.address || f.location), P(f.publisher)].filter(Boolean).join(': ');
    if (pub) add(pub + '. ');
  } else {
    add('“' + title.replace(/[.?!]$/, (m) => m) + (/[.?!]$/.test(title) ? '' : '.') + '” ');
    if (t === 'article') {
      add(P(f.journal || f.journaltitle), true);
      let vol = P(f.volume);
      if (f.number || f.issue) vol += ' (' + P(f.number || f.issue) + ')';
      if (vol) add(' ' + vol);
      if (f.pages) add((vol ? ': ' : ', ') + P(f.pages).replace(/--?/g, '–'));
      add('. ');
    } else if (t === 'incollection' || t === 'inproceedings' || t === 'inbook' || t === 'conference') {
      add('In ');
      add(P(f.booktitle), true);
      if (f.editor) add(', edited by ' + parseNames(f.editor).map((x) => (x.first ? x.first + ' ' : '') + x.last).join(' and '));
      if (f.pages) add(', ' + P(f.pages).replace(/--?/g, '–'));
      add('. ');
      const pub = [P(f.address || f.location), P(f.publisher)].filter(Boolean).join(': ');
      if (pub) add(pub + '. ');
    } else if (t === 'phdthesis' || t === 'mastersthesis' || t === 'thesis') {
      add((t === 'mastersthesis' ? 'Master’s thesis' : 'PhD diss.') + ', ' + P(f.school || f.institution) + '. ');
    } else {
      const bits = [P(f.type), P(f.number), P(f.institution || f.organization || f.school || f.publisher), P(f.howpublished), P(f.note)].filter(Boolean);
      if (t === 'techreport' && !f.type) bits.unshift('Technical Report');
      if (bits.length) add(bits.join(', ') + '. ');
    }
  }
  if (f.doi) add('https://doi.org/' + P(f.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '') + '.');
  else if (f.url) add(P(f.url) + '.');
  return runs;
}

// ---- writing .bib entries (batch B9: Add New Source, Manage Sources) ----------------------------
// Word's kinds of source as BibTeX types, with the fields its Create Source form shows for each
// (Word's names), the ones a style needs first. A biblatex document gets @online for a web site.
export const SOURCE_TYPES = [
  ['article', 'Journal Article', ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages', 'doi']],
  ['book', 'Book', ['author', 'title', 'publisher', 'address', 'year', 'edition', 'isbn']],
  ['incollection', 'Book Section', ['author', 'title', 'booktitle', 'editor', 'publisher', 'address', 'year', 'pages']],
  ['inproceedings', 'Conference Proceedings', ['author', 'title', 'booktitle', 'publisher', 'address', 'year', 'pages', 'doi']],
  ['techreport', 'Report', ['author', 'title', 'institution', 'number', 'address', 'year']],
  ['online', 'Web site', ['author', 'title', 'organization', 'url', 'year', 'urldate']],
  ['phdthesis', 'Thesis (doctoral)', ['author', 'title', 'school', 'address', 'year']],
  ['mastersthesis', 'Thesis (master’s)', ['author', 'title', 'school', 'address', 'year']],
  ['misc', 'Miscellaneous', ['author', 'title', 'howpublished', 'year', 'url', 'note']]
];
export const FIELD_NAMES = {
  author: 'Author', title: 'Title', journal: 'Journal name', year: 'Year', volume: 'Volume', number: 'Issue', pages: 'Pages', doi: 'DOI',
  publisher: 'Publisher', address: 'City', edition: 'Edition', isbn: 'ISBN', booktitle: 'Book title', editor: 'Editor', institution: 'Institution',
  organization: 'Name of web site', url: 'URL', urldate: 'Date accessed', school: 'University', howpublished: 'Published as', note: 'Comments', month: 'Month'
};
// fields every type may take beyond its own, for "Show all bibliography fields"
export const MORE_FIELDS = ['month', 'note', 'url', 'doi', 'editor', 'series', 'chapter', 'edition', 'address', 'publisher', 'isbn', 'issn', 'keywords', 'abstract'];

// Typed text as a BibTeX field's LaTeX: TeX's own characters & % # _ escaped where they stand
// bare, braces kept where they balance (escaped where they do not), a backslash at the end made
// \textbackslash{}; what is already LaTeX (\&, {\"o}, $x^2$) stays as it is.
export function bibEscape(t) {
  let s = String(t ?? '').replace(/\r?\n|\r/g, ' ');
  let d = 0, ok = true;
  for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '{') d++; else if (s[i] === '}' && --d < 0) { ok = false; break; } }
  if (d !== 0) ok = false;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { if (i === s.length - 1) out += '\\textbackslash{}'; else { out += c + s[i + 1]; i++; } continue; }
    if ('&%#_'.includes(c)) { out += '\\' + c; continue; }
    if (!ok && (c === '{' || c === '}')) { out += '\\' + c; continue; }
    out += c;
  }
  return out;
}

// A new entry's key, as people write them: the first author's last name, the year, the title's
// first word that is no small word (knuth1984texbook), lowercase ASCII; one the files have
// already gets b, c, ...
const SMALL = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'and', 'for', 'to', 'with', 'at', 'by', 'from', 'der', 'die', 'das', 'el', 'la', 'le', 'les', 'los', 'un', 'une']);
export function bibKey(fields, taken = new Set()) {
  const ascii = (x) => texToPlain(String(x || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const names = parseNames(fields.author || fields.editor || '');
  const last = names.length ? ascii(names[0].last).replace(/[^a-z]/g, '') : '';
  const year = (/\d{4}/.exec(String(fields.year || fields.date || '')) || [''])[0];
  const word = ascii(fields.title).split(/[^a-z0-9]+/).find((w) => w && !SMALL.has(w)) || '';
  const base = (last + year + word).slice(0, 40) || 'source';
  let k = base;
  for (let n = 0; taken.has(k) && n < 26 * 27; n++) k = base + (n < 26 ? String.fromCharCode(98 + n) : String(n));
  return k;
}

// A new entry as text: @type{key,\n  field = {value},\n ...}\n, the values LaTeX already (bibEscape),
// numbers bare as BibTeX allows (year = 1984), empty fields left out
export function bibEntryText(type, key, fields, eol = '\n') {
  const ks = Object.keys(fields).filter((k) => /^[a-z][a-z0-9_-]{0,30}$/.test(k) && String(fields[k] ?? '').trim());
  const w = Math.max(0, ...ks.map((k) => k.length));
  const lines = ks.map((k) => { const v = String(fields[k]).trim(); return '  ' + k.padEnd(w) + ' = ' + (/^\d{1,5}$/.test(v) ? v : '{' + v + '}'); });
  return '@' + type + '{' + key + ',' + eol + lines.join(',' + eol) + eol + '}' + eol;
}

// Where each part of an entry is in its file: the type [ts, te), the key [ks, ke), and each field
// { name, s (its name's start), e (after its value), vs, ve (the value as written), is, ie (inside
// its braces or quotes; the whole value when it is bare or joined by #), q ('{', '"' or '') and
// comma (after the field's own comma, or -1) }. The scan stays within the entry (entry.s to
// entry.e as parseBib found them).
export function bibSpans(src, entry) {
  const end = Math.min(entry.e, src.length);
  let i = entry.s + 1;
  const ws = () => { while (i < end && /\s/.test(src[i])) i++; };
  const tm = /^[A-Za-z]+/.exec(src.slice(i, i + 40));
  if (!tm) return null;
  const out = { ts: i, te: i + tm[0].length, fields: [], close: end - 1 };
  i += tm[0].length; ws();
  const open = src[i];
  if (open !== '{' && open !== '(') return null;
  i++; ws();
  const km = /^[^,\s}]+/.exec(src.slice(i, i + 300));
  if (!km) return null;
  out.ks = i; out.ke = i + km[0].length;
  i = out.ke;
  const closer = open === '{' ? '}' : ')';
  const group = (q) => {
    let d = 0;
    for (; i < end; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') d++;
      else if (c === '}') { if (q === '{' && --d === 0) { i++; return true; } if (q === '"') d--; } else if (c === '"' && q === '"' && d === 0 && i > 0) { i++; return true; }
    }
    return false;
  };
  for (let guard = 0; i < end && guard < 500; guard++) {
    ws();
    if (src[i] === ',') { i++; ws(); }
    if (i >= end || src[i] === closer) break;
    const fm = /^([A-Za-z0-9_:+.-]+)(\s*)=/.exec(src.slice(i, i + 100));
    if (!fm) { while (i < end && src[i] !== ',' && src[i] !== closer) i++; continue; }
    const f = { name: fm[1].toLowerCase(), s: i, eq: i + fm[1].length + fm[2].length };
    i += fm[0].length; ws();
    f.vs = i;
    let parts = 0, q = '';
    for (;;) {
      ws();
      const c = src[i];
      if (c === '{' || c === '"') { const at = i; i++; if (c === '"') { if (!group('"')) break; } else { i = at; if (!group('{')) break; } q = parts ? '' : c; } else {
        const m = /^[A-Za-z0-9_.:+/-]+/.exec(src.slice(i, i + 200));
        if (!m) break;
        i += m[0].length; q = '';
      }
      parts++;
      const save = i; ws();
      if (src[i] === '#') { i++; q = ''; continue; }
      i = save; break;
    }
    f.ve = i;
    if (parts === 1 && (src[f.vs] === '{' || src[f.vs] === '"')) { f.q = src[f.vs]; f.is = f.vs + 1; f.ie = f.ve - 1; } else { f.q = ''; f.is = f.vs; f.ie = f.ve; }
    f.e = i;
    const save = i; ws();
    f.comma = src[i] === ',' ? i + 1 : -1;
    i = save;
    out.fields.push(f);
  }
  return out;
}

// The smallest edits that give an entry these fields: { name: text } changes a value inside its
// braces or quotes (a bare value is given braces unless it is a number), adds a field after the
// last one in the entry's own way (its indent, = column and comma), and with '' or null takes a
// field out (its line too where it stands alone). Values are LaTeX already (bibEscape). type and
// key may change too: { '@type': 'book', '@key': 'k' }.
export function bibFieldEdits(src, entry, changes) {
  const sp = bibSpans(src, entry);
  if (!sp) return [];
  const out = [];
  const nl = src.slice(entry.s, entry.e).includes('\r\n') ? '\r\n' : '\n';
  if (changes['@type'] && changes['@type'] !== src.slice(sp.ts, sp.te).toLowerCase()) out.push({ s: sp.ts, e: sp.te, t: changes['@type'] });
  if (changes['@key'] && changes['@key'] !== src.slice(sp.ks, sp.ke)) out.push({ s: sp.ks, e: sp.ke, t: changes['@key'] });
  const fields = sp.fields;
  const adds = [], gone = new Set();
  for (const [name, v0] of Object.entries(changes)) {
    if (name[0] === '@') continue;
    const v = v0 == null ? '' : String(v0).trim();
    const f = fields.find((x) => x.name === name);
    if (!f) { if (v && /^[a-z][a-z0-9_-]{0,30}$/.test(name)) adds.push([name, v]); continue; }
    if (!v) {
      gone.add(f);
      // the field and its comma; its line where nothing else is on it
      const ls = src.lastIndexOf('\n', f.s - 1) + 1, alone = !src.slice(ls, f.s).trim();
      const e = f.comma > 0 ? f.comma : f.e;
      const le = src.indexOf('\n', e);
      if (alone && le >= 0 && !src.slice(e, le).trim()) out.push({ s: ls, e: le + 1, t: '' }); else out.push({ s: f.s, e, t: '' });
      continue;
    }
    const cur = src.slice(f.is, f.ie);
    if (f.q && cur === v) continue;
    if (!f.q && (cur === v || src.slice(f.vs, f.ve) === v)) continue;
    if (f.q === '{') out.push({ s: f.is, e: f.ie, t: v });
    else if (f.q === '"') out.push({ s: f.is, e: f.ie, t: v.replace(/"/g, '{"}') });
    else out.push({ s: f.vs, e: f.ve, t: /^\d{1,5}$/.test(v) || (name === 'month' && /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(v)) ? v : '{' + v + '}' });
  }
  const kept = fields.filter((f) => !gone.has(f)), last = kept[kept.length - 1], orig = fields[fields.length - 1];
  // (the entry's way: a comma after its last field or not)
  const trailing = !!orig && orig.comma > 0;
  if (adds.length) {
    const first = fields[0];
    const ls = first ? src.lastIndexOf('\n', first.s - 1) + 1 : -1;
    // (an entry on one line gets its new fields on that line)
    const one = !!first && (ls < entry.s || /\S/.test(src.slice(ls, first.s)));
    const indent = one ? ' ' : first ? /^[ \t]*/.exec(src.slice(ls, first.s))[0] : '  ', br = one ? '' : nl;
    // (names padded to one column where the entry pads them: the = signs in a line)
    const gap = first ? src.slice(first.s + first.name.length, first.eq) : ' ', after = first ? src.slice(first.eq + 1, first.vs) : ' ', col = first ? first.eq - first.s : 0;
    const pad = (n) => (/^ +$/.test(gap) && n.length < col ? n.padEnd(col) : n + (gap ? ' ' : '')) + '=' + (/^[ \t]*$/.test(after) ? after : ' ');
    const lines = adds.map(([n, v]) => indent + pad(n) + (/^\d{1,5}$/.test(v) ? v : '{' + v + '}'));
    if (!last) out.push({ s: sp.ke + 1, e: sp.ke + 1, t: br + lines.join(',' + br) + (trailing ? ',' : '') });
    else if (last.comma > 0) out.push({ s: last.comma, e: last.comma, t: br + lines.join(',' + br) + (trailing ? ',' : '') });
    else out.push({ s: last.e, e: last.e, t: ',' + br + lines.join(',' + br) });
  } else if (last && last !== orig && !trailing && last.comma > 0) out.push({ s: last.comma - 1, e: last.comma, t: '' });
  return out;
}

// The edit that takes an entry out of its file, with the blank line after it
export function bibDeleteEdit(src, entry) {
  let s = entry.s, e = Math.min(entry.e, src.length);
  const ls = src.lastIndexOf('\n', s - 1) + 1;
  if (!src.slice(ls, s).trim()) s = ls;
  let k = e;
  while (k < src.length && (src[k] === ' ' || src[k] === '\t')) k++;
  if (src[k] === '\r') k++;
  let ate = false;
  if (src[k] === '\n') { e = k + 1; let j = e; while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++; if (src[j] === '\n' && s === ls) { e = j + 1; ate = true; } }
  // (the last entry: the blank line before it goes instead)
  if (!ate && s === ls && !src.slice(e).trim()) { const m = /\r?\n[ \t]*\r?\n$/.exec(src.slice(Math.max(0, s - 8), s)); if (m) s -= m[0].length - (m[0].startsWith('\r') ? 2 : 1); }
  return { s, e, t: '' };
}

// The edit that adds entries (text) at a file's end, a blank line before them
export function bibAppendEdit(src, text) {
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const t = text.replace(/\r?\n/g, nl);
  const pre = !src.length ? '' : src.endsWith(nl + nl) ? '' : src.endsWith(nl) ? nl : nl + nl;
  return { s: src.length, e: src.length, t: pre + t };
}
