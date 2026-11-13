// The page's set up in Word and back (task 44): paper, orientation, margins, the gutter and
// mirrored margins, columns of the whole document, headers and footers in their three places
// with the page number, Page X of Y and the date as Word's fields, a different first page and
// even pages, the page numbers' format and start, line numbers, the page's colour and border.
// pageDocx writes them into the Word file pandoc made (its body's last w:sectPr, header and
// footer parts, settings); pageLatex reads them from a Word file as the preamble's lines and the
// body's first ones, the same LaTeX the page's own controls write (src/pagesrc.js). The page as
// Word gets it is described in the page's own thread (src/wordast.js pageForWord, from
// src/layout.js's numbers): this module runs in the Word worker and touches no page.
//
// A Word file may be a stranger's: everything read is bounded, and what goes into the LaTeX is
// the text of the header with TeX's signs escaped, numbers and colours checked to be such.

import { text, parseXml, find, textContent } from './docx.js';

const enc = new TextEncoder();
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const int = (x) => Math.max(0, Math.round(+x || 0));

// ---- the page into Word ----------------------------------------------------------------------------
// One paragraph of a header or footer: three places at the left margin, the centre and the right
// margin (tab stops), each a list of runs { t, b, i, field } (field: PAGE, NUMPAGES, DATE)
function hfPara(places, tw, style) {
  const runs = (list) => list.map((r) => {
    const rpr = (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '');
    const pr = rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '';
    if (r.field) return '<w:fldSimple w:instr="' + r.field + '"><w:r>' + pr + '<w:t>' + (r.field === 'PAGE' ? '1' : r.field === 'NUMPAGES' ? '1' : '') + '</w:t></w:r></w:fldSimple>';
    return '<w:r>' + pr + '<w:t xml:space="preserve">' + xmlEsc(r.t) + '</w:t></w:r>';
  }).join('');
  const tab = '<w:r><w:tab/></w:r>';
  return '<w:p><w:pPr><w:pStyle w:val="' + style + '"/><w:tabs><w:tab w:val="center" w:pos="' + int(tw / 2) + '"/><w:tab w:val="right" w:pos="' + int(tw) + '"/></w:tabs></w:pPr>'
    + runs(places[0] || []) + tab + runs(places[1] || []) + tab + runs(places[2] || []) + '</w:p>';
}
const hfPart = (kind, body) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:' + kind + ' ' + W_NS + '>' + body + '</w:' + kind + '>';
const empty3 = (P) => !P || P.every((x) => !x || !x.length);

// P (pageForWord): { w, h, land, margins: { top, bottom, left, right, header, footer, gutter },
// mirror, cols: { num, space, sep }, head: { odd, even, first }, foot: { … } (each [[runs] x3] or
// null), titlePg, evenOdd, pgNum: { fmt, start }, lnNum: { countBy, restart }, background (hex),
// border: { space, sz, color } }. parts: unzip()'s map, changed in place.
export function pageDocx(parts, P) {
  if (!P || !parts.has('word/document.xml')) return parts;
  let d = text(parts.get('word/document.xml'));
  const k = d.lastIndexOf('<w:sectPr');
  if (k < 0) return parts;
  const close = d.indexOf('</w:sectPr>', k);
  const selfClose = /^<w:sectPr\s*\/>/.exec(d.slice(k, k + 20));
  let inner = selfClose ? '' : close > k ? d.slice(d.indexOf('>', k) + 1, close) : '';
  const end = selfClose ? k + selfClose[0].length : close + '</w:sectPr>'.length;
  // headers and footers: their parts, their relationships, their types
  const refs = [];
  let rels = text(parts.get('word/_rels/document.xml.rels') || enc.encode('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'));
  let types = text(parts.get('[Content_Types].xml'));
  let n = 0;
  const tw = (P.w - P.margins.left - P.margins.right - (P.margins.gutter || 0));
  const add = (kind, type, places) => {
    n++;
    const name = kind + n + '.xml', id = 'rIdRikuyHF' + n;
    parts.set('word/' + name, enc.encode(hfPart(kind === 'header' ? 'hdr' : 'ftr', hfPara(places, tw, kind === 'header' ? 'Header' : 'Footer'))));
    rels = rels.replace('</Relationships>', '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + kind + '" Target="' + name + '"/></Relationships>');
    types = types.replace('</Types>', '<Override PartName="/word/' + name + '" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + kind + '+xml"/></Types>');
    refs.push('<w:' + kind + 'Reference w:type="' + type + '" r:id="' + id + '"/>');
  };
  for (const [kind, H] of [['header', P.head], ['footer', P.foot]]) {
    if (!H) continue;
    if (!empty3(H.odd)) add(kind, 'default', H.odd);
    if (P.evenOdd && H.even && !empty3(H.even)) add(kind, 'even', H.even);
    // (a first page of its own: empty unless it has places of its own)
    if (P.titlePg) add(kind, 'first', H.first || [[], [], []]);
  }
  if (refs.length) { parts.set('word/_rels/document.xml.rels', enc.encode(rels)); parts.set('[Content_Types].xml', enc.encode(types)); }
  // the section's own: Word wants them in this order
  const M = P.margins;
  const sect = [
    ...refs,
    inner.match(/<w:footnotePr>[\s\S]*?<\/w:footnotePr>/)?.[0] || '',
    '<w:pgSz w:w="' + int(P.w) + '" w:h="' + int(P.h) + '"' + (P.land ? ' w:orient="landscape"' : '') + '/>',
    '<w:pgMar w:top="' + int(M.top) + '" w:right="' + int(M.right) + '" w:bottom="' + int(M.bottom) + '" w:left="' + int(M.left) + '" w:header="' + int(M.header) + '" w:footer="' + int(M.footer) + '" w:gutter="' + int(M.gutter) + '"/>',
    P.border ? '<w:pgBorders w:offsetFrom="page">' + ['top', 'left', 'bottom', 'right'].map((s) => '<w:' + s + ' w:val="single" w:sz="' + int(P.border.sz) + '" w:space="' + Math.min(31, int(P.border.space)) + '" w:color="' + (P.border.color || '000000') + '"/>').join('') + '</w:pgBorders>' : '',
    P.lnNum ? '<w:lnNumType w:countBy="' + Math.max(1, int(P.lnNum.countBy)) + '" w:restart="' + P.lnNum.restart + '"/>' : '',
    P.pgNum ? '<w:pgNumType' + (P.pgNum.fmt && P.pgNum.fmt !== 'decimal' ? ' w:fmt="' + P.pgNum.fmt + '"' : '') + (P.pgNum.start != null ? ' w:start="' + int(P.pgNum.start) + '"' : '') + '/>' : '',
    P.cols && P.cols.num > 1 ? '<w:cols w:num="' + int(P.cols.num) + '" w:space="' + int(P.cols.space) + '"' + (P.cols.sep ? ' w:sep="1"' : '') + '/>' : '',
    P.titlePg ? '<w:titlePg/>' : '',
    // (what pandoc or the right to left set up put there besides)
    ...(inner.match(/<w:(?:bidi|rtlGutter)\b[^>]*\/>/g) || [])
  ].filter(Boolean).join('');
  d = d.slice(0, k) + '<w:sectPr>' + sect + '</w:sectPr>' + d.slice(end);
  // the page's colour
  if (P.background && /^[0-9A-F]{6}$/.test(P.background)) d = d.replace(/(<w:document\b[^>]*>)/, '$1<w:background w:color="' + P.background + '"/>');
  parts.set('word/document.xml', enc.encode(d));
  // settings: even pages of their own, mirrored margins, the background shown
  if (parts.has('word/settings.xml') && (P.evenOdd || P.mirror || P.background)) {
    let s = text(parts.get('word/settings.xml'));
    // (each where Word's schema has it: its settings are a sequence, and Word refuses a file
    // with one out of its place)
    const after = (tags, x) => {
      let at = -1;
      for (const t of tags) { const m = new RegExp('<w:' + t + '\\b[^>]*?(?:/>|>[\\s\\S]*?</w:' + t + '>)').exec(s); if (m && m.index + m[0].length > at) at = m.index + m[0].length; }
      if (at < 0) { const m = /<w:settings\b[^>]*>/.exec(s); at = m ? m.index + m[0].length : -1; }
      if (at >= 0) s = s.slice(0, at) + x + s.slice(at);
    };
    if (P.background) after(['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries'], '<w:displayBackgroundShape/>');
    if (P.mirror) after(['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries', 'displayBackgroundShape', 'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts', 'saveFormsData'], '<w:mirrorMargins/>');
    if (P.evenOdd) after(['defaultTabStop', 'autoHyphenation', 'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle'], '<w:evenAndOddHeaders/>');
    parts.set('word/settings.xml', enc.encode(s));
  }
  return parts;
}

// ---- the page from Word ---------------------------------------------------------------------------
// What a Word file says of its page beyond the paper and the margins (src/wordjobs.js writes
// those): { lines: preamble lines, body: lines at the body's start, packages, notes }
const TEX_SIGNS = /[\\{}$&#^_%~]/g;
const texEsc = (s) => s.replace(TEX_SIGNS, (c) => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }[c] || '\\' + c));
// A header or footer part as its three places in LaTeX: split at its tabs (one place: by the
// paragraph's alignment); PAGE is \thepage, NUMPAGES \pageref{LastPage}, DATE \today
export function hfPlaces(xml) {
  let root;
  try { root = parseXml(xml); } catch (e) { return null; }
  const paras = [];
  const walk = (el, out, depth = 0) => {
    if (!el || typeof el === 'string' || depth > 40) return;
    if (el.n === 'w:p') { paras.push(el); return; }
    for (const c of el.c || []) walk(c, out, depth + 1);
  };
  walk(root, paras);
  for (const p of paras.slice(0, 20)) {
    const segs = [''];
    let field = 0, instr = '', used = false;
    const go = (el, depth = 0) => {
      if (!el || typeof el === 'string' || depth > 40) return;
      if (el.n === 'w:fldSimple') { segs[segs.length - 1] += fieldTex(el.a['w:instr']); used = true; return; }
      if (el.n === 'w:fldChar') { const t = el.a['w:fldCharType']; if (t === 'begin') { field++; instr = ''; } else if (t === 'separate') { if (field === 1) { segs[segs.length - 1] += fieldTex(instr); used = true; } } else if (t === 'end') field = Math.max(0, field - 1); return; }
      if (el.n === 'w:instrText') { instr += textContent(el); return; }
      if (el.n === 'w:tab' && !field) { if (segs.length < 3) segs.push(''); return; }
      if (el.n === 'w:t' && !field) { segs[segs.length - 1] += texEsc(textContent(el)).slice(0, 300); used = true; return; }
      if (el.n === 'w:pPr' || el.n === 'w:rPr') return;
      for (const c of el.c || []) go(c, depth + 1);
    };
    go(p);
    const s = segs.map((x) => x.replace(/\s+/g, ' ').trim());
    if (!used || s.every((x) => !x)) continue;
    if (s.length === 3) return s;
    if (s.length === 2) return [s[0], '', s[1]];
    const jc = find(p, 'w:jc');
    const al = jc && jc.a['w:val'];
    return al === 'center' ? ['', s[0], ''] : al === 'right' || al === 'end' ? ['', '', s[0]] : [s[0], '', ''];
  }
  return null;
}
function fieldTex(instr) {
  const w = String(instr || '').trim().split(/\s+/)[0].toUpperCase();
  return w === 'PAGE' ? '\\thepage{}' : w === 'NUMPAGES' || w === 'SECTIONPAGES' ? '\\pageref{LastPage}' : w === 'DATE' || w === 'TIME' ? '\\today{}' : '';
}
const FMT = { lowerRoman: 'roman', upperRoman: 'Roman', lowerLetter: 'alph', upperLetter: 'Alph', decimal: 'arabic' };

// parts: the Word file's; sect: its body's last w:sectPr element (parseXml's). Returns the LaTeX.
export function pageLatex(parts, sect, rels) {
  const out = { lines: [], body: [], packages: [], notes: [], heads: false };
  if (!sect) return out;
  const kids = (el, name) => (el.c || []).filter((c) => typeof c !== 'string' && c.n === name);
  const one = (name) => kids(sect, name)[0] || null;
  // headers and footers by their type
  const places = {};
  for (const kind of ['header', 'footer']) for (const ref of kids(sect, 'w:' + kind + 'Reference')) {
    const type = ref.a['w:type'] || 'default', target = rels && rels.get(ref.a['r:id']);
    if (!target || !/^(header|footer)\d*\.xml$/.test(target) || !parts.has('word/' + target)) continue;
    const pl = hfPlaces(text(parts.get('word/' + target)));
    if (pl) places[kind + ':' + type] = pl;
  }
  const settings = parts.has('word/settings.xml') ? text(parts.get('word/settings.xml')).slice(0, 200000) : '';
  const evenOdd = /<w:evenAndOddHeaders\b(?![^>]*w:val="(?:0|false)")/.test(settings);
  const titlePg = !!one('w:titlePg') && (one('w:titlePg').a['w:val'] || 'true') !== 'false' && one('w:titlePg').a['w:val'] !== '0';
  const sel = (P, side) => ['L', 'C', 'R'].map((c, k) => [c + (side || ''), P[k]]).filter(([, t]) => t);
  const cmds = [];
  for (const [kind, cmd] of [['header', '\\fancyhead'], ['footer', '\\fancyfoot']]) {
    const D = places[kind + ':default'], E = evenOdd ? places[kind + ':even'] : null;
    if (D) for (const [s, t] of sel(D, E ? 'O' : '')) cmds.push(cmd + '[' + s + ']{' + t + '}');
    if (E) for (const [s, t] of sel(E, 'E')) cmds.push(cmd + '[' + s + ']{' + t + '}');
  }
  if (cmds.length) {
    out.heads = true;
    out.packages.push('fancyhdr');
    out.lines.push('\\pagestyle{fancy}', '\\fancyhf{}', '\\renewcommand{\\headrulewidth}{0pt}', ...cmds);
    if (cmds.some((c) => c.includes('\\pageref{LastPage}'))) out.packages.push('lastpage');
    if (evenOdd) out.twoside = true;
    // (a first page of its own with nothing on it, as Word's usually is)
    if (titlePg && !places['header:first'] && !places['footer:first']) out.body.push('\\thispagestyle{empty}');
  } else if (!Object.keys(places).length && (kids(sect, 'w:headerReference').length || kids(sect, 'w:footerReference').length)) {
    // (empty headers and footers: a page with nothing at its head or foot)
    out.lines.push('\\pagestyle{empty}');
  }
  // the page numbers' format and start
  const pn = one('w:pgNumType');
  if (pn) {
    const fmt = FMT[pn.a['w:fmt']];
    if (fmt && fmt !== 'arabic') out.body.unshift('\\pagenumbering{' + fmt + '}');
    const st = pn.a['w:start'];
    if (st != null && /^\d{1,5}$/.test(st) && +st !== 1) out.body.splice(fmt && fmt !== 'arabic' ? 1 : 0, 0, '\\setcounter{page}{' + +st + '}');
  }
  // line numbers
  const ln = one('w:lnNumType');
  if (ln && ln.a['w:countBy'] && +ln.a['w:countBy'] > 0) {
    const r = ln.a['w:restart'];
    out.packages.push(r === 'newPage' || !r ? ['lineno', 'pagewise'] : 'lineno');
    out.lines.push('\\linenumbers');
    if (+ln.a['w:countBy'] > 1 && +ln.a['w:countBy'] < 1000) out.lines.push('\\modulolinenumbers[' + (+ln.a['w:countBy']) + ']');
    if (r === 'newSection') out.notes.push('Line numbers restart at each of Word\'s sections; here they run on.');
  }
  // columns: more than two, or two with a line between or a space of their own
  const cols = one('w:cols');
  if (cols && +cols.a['w:num'] > 1) {
    const sp = +cols.a['w:space'];
    // (LaTeX's own 10pt, Word's own 0.5in, need no line)
    if (sp > 0 && sp < 20000 && Math.abs(sp - 199) > 6 && sp !== 720) out.lines.push('\\setlength{\\columnsep}{' + (Math.round(sp / 1440 * 254) / 100) + 'cm}');
    if (cols.a['w:sep'] === '1' || cols.a['w:sep'] === 'true') out.lines.push('\\setlength{\\columnseprule}{0.4pt}');
  }
  // the page's colour
  const bg = /<w:background\b[^>]*w:color="([0-9A-Fa-f]{6})"/.exec(text(parts.get('word/document.xml')).slice(0, 4000));
  if (bg && bg[1].toUpperCase() !== 'FFFFFF') { out.packages.push('xcolor'); out.lines.push('\\pagecolor[HTML]{' + bg[1].toUpperCase() + '}'); }
  // a border around the page
  const pb = one('w:pgBorders');
  const top = pb && kids(pb, 'w:top')[0];
  if (top && top.a['w:val'] && top.a['w:val'] !== 'none' && top.a['w:val'] !== 'nil') {
    const space = Math.min(31, +top.a['w:space'] || 24), fromText = (pb.a['w:offsetFrom'] || 'text') !== 'page';
    const inset = fromText ? 1.5 : space / 72 * 2.54;
    const w = Math.max(0.25, (+top.a['w:sz'] || 4) / 8);
    const c = /^[0-9A-Fa-f]{6}$/.test(top.a['w:color'] || '') && top.a['w:color'] !== '000000' && top.a['w:color'].toLowerCase() !== 'auto' ? top.a['w:color'].toUpperCase() : null;
    out.packages.push('tikz');
    if (c) out.lines.push('\\definecolor{pageborder}{HTML}{' + c + '}');
    const opt = [Math.abs(w - 0.4) > 0.01 ? 'line width=' + (Math.round(w * 100) / 100) + 'pt' : '', c ? 'pageborder' : ''].filter(Boolean).join(',');
    const dd = (Math.round(inset * 100) / 100) + 'cm';
    out.lines.push('\\AddToHook{shipout/background}{\\begin{tikzpicture}[remember picture,overlay]\\draw' + (opt ? '[' + opt + ']' : '') + ' ([shift={(' + dd + ',-' + dd + ')}]current page.north west) rectangle ([shift={(-' + dd + ',' + dd + ')}]current page.south east);\\end{tikzpicture}}');
  }
  out.mirror = /<w:mirrorMargins\b(?![^>]*w:val="(?:0|false)")/.test(settings);
  return out;
}
// word/_rels/document.xml.rels as a map of Id to Target
export function relsMap(parts) {
  const out = new Map();
  if (!parts.has('word/_rels/document.xml.rels')) return out;
  const t = text(parts.get('word/_rels/document.xml.rels')).slice(0, 400000);
  for (let k = 0, re = /<Relationship\b[^>]*>/g, m; (m = re.exec(t)) && k < 2000; k++) {
    const id = /\bId="([^"]{1,80})"/.exec(m[0]), tg = /\bTarget="([^"]{1,200})"/.exec(m[0]);
    if (id && tg) out.set(id[1], tg[1]);
  }
  return out;
}
