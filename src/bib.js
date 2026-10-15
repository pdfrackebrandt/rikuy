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
