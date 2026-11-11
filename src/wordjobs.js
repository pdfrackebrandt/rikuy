// What the Word worker does, given a pandoc (src/pandoc.js): write a project's page as .docx with
// Rikuy's part in it, read an edited .docx back, open a stranger's .docx as LaTeX. Kept apart from
// the worker's messaging so the node tests run the same code.
import { unzip, zip, extract, addRikuyPart, readRikuyPart, mathDocx, mathFromJson, text, premark, decode, mark, MARKS, LIMITS } from './docx.js';
import { alignRuns, exportData, allObjs, safeMath } from './wordsync.js';
import { commentEdit } from './share.js';
import { isBalanced } from './parser.js';
import { safeUrl } from './wordast.js';
import { scriptNeeds, scriptLines, otherDirection, INDIC } from './scripts.js';

// pandoc's messages worth telling the user: the ones that say something was lost
const said = (ws) => (ws || []).filter((w) => w.verbosity && w.verbosity !== 'INFO').map((w) => w.pretty || w.type).slice(0, 20);

// The text of each equation in a Word file, as pandoc reads OMML into TeX: one run for all of them
export function mathTeX(P, objs) {
  if (!objs.length) return [];
  const r = P.convert({ from: 'docx', to: 'json', 'input-files': ['m.docx'] }, null, { 'm.docx': mathDocx(objs.map((o) => o.xml)) });
  return mathFromJson(r.stdout || '{"blocks":[]}', objs.length);
}

// req: { doc (pandoc JSON), anchors (packAnchor's), atoms, resources: {name: bytes|string},
//        bibs: [names], csl: name|null, citeproc, toc, project: { name, main, files: [[n, t]], sig } }
export function exportDocx(P, req) {
  const opts = { from: 'json', to: 'docx', 'output-file': 'out.docx' };
  if (req.citeproc && req.bibs && req.bibs.length) { opts.citeproc = true; opts.bibliography = req.bibs; if (req.csl) opts.csl = req.csl; }
  if (req.toc) opts['table-of-contents'] = true;
  const r = P.convert(opts, JSON.stringify(req.doc), req.resources || {});
  if (!r.files['out.docx']) throw new Error('pandoc wrote no Word file: ' + (r.stderr || '').trim().slice(0, 300));
  const docx = styled(r.files['out.docx'], !!(req.doc.meta && req.doc.meta.dir && req.doc.meta.dir.c === 'rtl'));
  // what Word got, block by block, lined up with what the page showed
  const X = extract(unzip(docx));
  const anchors = [];
  let lost = 0;
  for (const A of req.anchors) {
    const R = X.regions.get(A.id);
    if (!R) { lost++; continue; }
    anchors.push({ ...A, text: R.text, runs: alignRuns(A, R.text) });
  }
  // each equation as pandoc reads it back from Word, to tell later what a coauthor changed
  const atoms = req.atoms.map((a) => ({ ...a }));
  const objs = [];
  const owner = [];
  for (const A of anchors) {
    const R = X.regions.get(A.id);
    for (const o of R.objs) {
      if (o.k !== 'math') continue;
      // the atom at that place in the aligned map
      const m = runAt(A.runs, o.at);
      if (m != null) { objs.push(o); owner.push(m); }
    }
  }
  const tex = mathTeX(P, objs);
  tex.forEach((t, i) => { const a = atoms[owner[i]]; if (a && t != null) a.was = t; });
  const unread = tex.filter((t) => t == null).length;
  // The file carries the source of what it shows, to place a coauthor's edits later: the main
  // file and the files its blocks come from, not the whole project (a chapter no \input names,
  // notes, a .bib would otherwise travel to everyone the Word file is sent to).
  const used = new Set([req.project.main, ...anchors.map((A) => A.f), ...atoms.map((a) => a && a.f).filter(Boolean)]);
  const data = exportData({ ...req.project, files: req.project.files.filter(([n]) => used.has(n)), anchors, atoms, t: Date.now(), app: req.app });
  const out = addRikuyPart(docx, data);
  // json: what the worker hashes into the export's mark (src/wordworker.js)
  return { docx: out, warnings: said(r.warnings), lost, unread, size: out.length, json: JSON.stringify(data) };
}

// The styles Rikuy names in the tree (src/wordast.js: Colour C00000, Shade FFFF00, Highlight,
// Centred, Right Aligned) come out of pandoc empty: each gets here what its name says, so
// coloured and centred text looks in Word as it does on the page.
//
// Chinese and Arabic. pandoc marks the runs and paragraphs that run right to left (w:rtl,
// w:bidi: src/wordbidi.js); the rest of what Word wants is written here. A file with Chinese
// text names an East Asian font and language once, in the document's defaults, and one with
// Arabic text a complex script font and language, the faces the PDF is set in where Word has
// them (SimSun is Windows' Song face, as FandolSong is; Amiri is the PDF's own): without them
// Word picks the font for those characters from the reader's own settings. A table whose
// paragraphs all run right to left has its columns from the right too (w:bidiVisual). rtl: the
// document itself runs right to left, so its section does and so do the paragraphs pandoc's
// template wrote (the title block, the contents field), which the tree has no say over.
const HAN = /[\u2E80-\u2FDF\u3005-\u3007\u3021-\u3029\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;
const EAST_ASIA = { font: 'SimSun', lang: 'zh-CN' }, COMPLEX = { font: 'Amiri', lang: 'ar-SA' };
// India's scripts (src/scripts.js has the nine) are complex scripts to Word as Arabic is, but
// set left to right, and a file may hold several: each run of one gets its font and its
// language on the run itself (w:rFonts w:cs, w:lang w:bidi), since the defaults name one font
// and one language only, Arabic's when the file has both. Nirmala UI is the one font of
// Windows with all nine; where it is missing Word takes another that has the script. A run
// pandoc wrote with two of the scripts in it is cut where the script changes. The danda and
// double danda, which all of them share, go with the text before them.
const INDIC_FONT = 'Nirmala UI';
const INDIC_OWN = /[\u0900-\u0963\u0966-\u0D7F\uA8E0-\uA8FF]/;
const indicOf = (ch) => (INDIC_OWN.test(ch) && INDIC.find((x) => x[2].test(ch))) || null;
function indicRuns(xml) {
  if (!INDIC_OWN.test(xml)) return xml;
  return xml.replace(/<w:r>(?:<w:rPr>((?:(?!<\/w:rPr>)[\s\S])*)<\/w:rPr>)?<w:t xml:space="preserve">([^<]*)<\/w:t><\/w:r>/g, (run, rpr, t) => {
    if (!INDIC_OWN.test(t)) return run;
    const segs = [];
    let cur = '', sc = null;
    for (const ch of t) {
      const x = indicOf(ch);
      if (x && sc && x !== sc) { segs.push([cur, sc]); cur = ''; }
      if (x) sc = x;
      cur += ch;
    }
    segs.push([cur, sc]);
    return segs.map(([seg, x]) => '<w:r><w:rPr>' + indicProps(rpr || '', x) + '</w:rPr><w:t xml:space="preserve">' + seg + '</w:t></w:r>').join('');
  });
}
// a run's properties with the font and the language of one of the scripts, each at its place in
// the order Word's schema gives a run's properties: the fonts after the style, the language last
function indicProps(rpr, x) {
  const lang = x[4] + '-IN';
  if (/<w:rFonts\b[^>]*\/>/.test(rpr)) rpr = rpr.replace(/<w:rFonts\b[^>]*\/>/, (f) => attrSet(f, 'w:cs', INDIC_FONT));
  else {
    const st = /^\s*<w:rStyle\b[^>]*\/>/.exec(rpr);
    const k = st ? st[0].length : 0;
    rpr = rpr.slice(0, k) + '<w:rFonts w:cs="' + INDIC_FONT + '" />' + rpr.slice(k);
  }
  if (/<w:lang\b[^>]*\/>/.test(rpr)) return rpr.replace(/<w:lang\b[^>]*\/>/, (l) => attrSet(l, 'w:bidi', lang));
  return rpr + '<w:lang w:bidi="' + lang + '" />';
}
const attrSet = (tag, name, v) => (new RegExp(' ' + name + '="[^"]*"').test(tag) ? tag.replace(new RegExp(' ' + name + '="[^"]*"'), ' ' + name + '="' + v + '"') : tag.replace(/\s*\/>$/, ' ' + name + '="' + v + '" />'));
function styled(docx, rtl) {
  const parts = unzip(docx);
  const p = 'word/styles.xml';
  if (!parts.has(p)) return docx;
  let n = 0;
  const dp = 'word/document.xml';
  let d = text(parts.get(dp));
  const words = d + (parts.has('word/footnotes.xml') ? text(parts.get('word/footnotes.xml')) : '');
  const han = HAN.test(words), arabic = rtl || ARABIC.test(words);
  const d0 = d;
  // pandoc names the body's style only on a paragraph with no other property: one that has
  // its direction and nothing else is a body paragraph all the same
  if (d.includes('<w:bidi />') && /w:styleId="BodyText"/.test(text(parts.get(p)))) d = d.replace(/<w:pPr><w:bidi \/><\/w:pPr>/g, '<w:pPr><w:pStyle w:val="BodyText" /><w:bidi /></w:pPr>');
  if (rtl) {
    d = d.replace(/<w:p>(\s*)<w:pPr>(\s*<w:pStyle w:val="(?:Title|Subtitle|Author|Date|AbstractTitle)" \/>\s*)<\/w:pPr>/g, '<w:p>$1<w:pPr>$2<w:bidi /></w:pPr>')
      // a paragraph with no properties at all is the template's or a page break's, never one
      // the tree set left to right
      .replace(/<w:p>(?=\s*<w:r>)/g, '<w:p><w:pPr><w:bidi /></w:pPr>');
    const k = d.lastIndexOf('</w:sectPr>');
    if (k >= 0 && !/<w:bidi\b/.test(d.slice(d.lastIndexOf('<w:sectPr'), k))) d = d.slice(0, k) + '<w:bidi />' + d.slice(k);
  }
  if (d.includes('<w:bidi />') && d.includes('<w:tbl>')) d = bidiTables(d);
  d = indicRuns(d);
  if (d !== d0) { parts.set(dp, d); n++; }
  for (const name of ['word/footnotes.xml', 'word/comments.xml']) {
    if (!parts.has(name)) continue;
    const was = text(parts.get(name)), now = indicRuns(was);
    if (now !== was) { parts.set(name, now); n++; }
  }
  let st = text(parts.get(p));
  if (han || arabic) {
    const s0 = st;
    st = st.replace(/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/, (def) => {
      let fonts = (/<w:rFonts\b[^>]*\/>/.exec(def) || ['<w:rFonts />'])[0], lang = (/<w:lang\b[^>]*\/>/.exec(def) || ['<w:lang />'])[0];
      const f0 = fonts, l0 = lang;
      // a theme font would win over the one named here
      if (han) { fonts = attrSet(fonts.replace(/ w:eastAsiaTheme="[^"]*"/, ''), 'w:eastAsia', EAST_ASIA.font); lang = attrSet(lang, 'w:eastAsia', EAST_ASIA.lang); }
      if (arabic) { fonts = attrSet(fonts.replace(/ w:cstheme="[^"]*"/, ''), 'w:cs', COMPLEX.font); lang = attrSet(lang, 'w:bidi', COMPLEX.lang); }
      const put = (x, was, now) => (x.includes(was) ? x.replace(was, now) : x.replace(/<w:rPr>/, '<w:rPr>' + now));
      return /<w:rPr>/.test(def) ? put(put(def, l0, lang), f0, fonts) : def;
    });
    if (st !== s0) n++;
    // headings take their fonts from the theme, which has one for each script: these say which
    const sp = 'word/settings.xml';
    if (parts.has(sp)) {
      const se = text(parts.get(sp)).replace(/<w:themeFontLang\b[^>]*\/>/, (t) => { if (han) t = attrSet(t, 'w:eastAsia', EAST_ASIA.lang); if (arabic) t = attrSet(t, 'w:bidi', COMPLEX.lang); return t; });
      parts.set(sp, se);
    }
  }
  st = st.replace(/(<w:style [^>]*w:styleId="(Colour|Shade|Highlight|Centred|RightAligned)([0-9A-F]{6})?"[^>]*>(?:(?!<\/w:style>)[\s\S])*?)(<\/w:style>)/g, (s, head, kind, hex, end) => {
    const add = kind === 'Colour' && hex ? '<w:rPr><w:color w:val="' + hex + '" /></w:rPr>'
      : kind === 'Shade' && hex ? '<w:rPr><w:shd w:val="clear" w:color="auto" w:fill="' + hex + '" /></w:rPr>'
        : kind === 'Highlight' && !hex ? '<w:rPr><w:shd w:val="clear" w:color="auto" w:fill="FFFF00" /></w:rPr>'
          : kind === 'Centred' && !hex ? '<w:pPr><w:jc w:val="center" /></w:pPr>'
            : kind === 'RightAligned' && !hex ? '<w:pPr><w:jc w:val="right" /></w:pPr>' : '';
    if (!add || /<w:[pr]Pr>/.test(head)) return s;
    n++;
    return head + add + end;
  });
  if (!n) return docx;
  parts.set(p, st);
  return zip(parts);
}

// w:bidiVisual on each table of document.xml whose paragraphs all carry w:bidi
function bidiTables(d) {
  const RE = /<(\/?)w:tbl>/g;
  const open = [], put = [];
  for (let m; (m = RE.exec(d));) {
    if (!m[1]) { open.push(m.index); continue; }
    const s = open.pop();
    if (s == null) continue;
    const paras = d.slice(s, m.index).split(/<w:p>|<w:p (?=[^>]*>)/).slice(1);
    if (!paras.length || !paras.every((x) => /^\s*<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<w:bidi \/>/.test(x))) continue;
    // its place among the table's properties: after the style, before the width
    const pr = /<w:tblPr>(\s*<w:tblStyle\b[^>]*\/>)?/.exec(d.slice(s, m.index));
    if (pr) put.push(s + pr.index + pr[0].length);
  }
  for (const k of put.sort((a, b) => b - a)) d = d.slice(0, k) + '<w:bidiVisual />' + d.slice(k);
  return d;
}

// the atom index of text position i in run coded map, or null
function runAt(runs, i) {
  let p = 0;
  for (const r of runs) {
    const n = r[0] > 0 ? r[0] : r[0] === 0 ? 1 : r[0] === -1 ? r[1] : r[2];
    if (i < p + n) return r[0] === -2 ? r[1] : null;
    p += n;
  }
  return null;
}

// An edited .docx: Rikuy's data if it carries it, the text of each block, its equations as TeX
export function readDocx(P, bytes) {
  const parts = unzip(bytes);
  const data = readRikuyPart(parts);
  if (!data) return { data: null };
  const X = extract(parts);
  const objs = allObjs(X);
  const tex = mathTeX(P, objs);
  const mathTex = objs.map((o, i) => tex[i]);
  let lastBy = '';
  if (parts.has('docProps/core.xml')) {
    const m = /<cp:lastModifiedBy>([^<]*)<\/cp:lastModifiedBy>/.exec(text(parts.get('docProps/core.xml')));
    if (m) lastBy = m[1].trim();
  }
  // Maps and Sets do not cross postMessage as the page needs them: plain arrays instead
  return {
    data,
    X: {
      regions: [...X.regions.entries()], order: X.order, pre: X.pre, orphans: X.orphans,
      notes: [...X.notes.entries()], comments: [...X.comments.entries()], authors: [...X.authors], tracked: X.tracked, dupes: X.dupes,
      mathTex
    },
    lastBy
  };
}

// ---- a stranger's .docx, opened as LaTeX ----------------------------------------------------------

const MEDIA_MAX = 50e6;
const PICTURE = /^(png|jpe?g|gif|svg|webp|bmp|tiff?|emf|wmf|pdf|eps)$/;

// Characters pdfLaTeX sets with T1 and TS1 fonts as they are (measured against the kernel's own
// tables); Greek and Cyrillic come with their encodings (preamble below).
const PLAIN = /^[\u0000-\u0125\u0128-\u0137\u0139-\u013E\u0141-\u0148\u014A-\u0165\u0168-\u017E\u0192\u01C4-\u01D4\u01E2\u01E3\u01E6-\u01EB\u01F0\u01F4\u01F5\u0218-\u021B\u0232\u0233\u0237\u200C\u2010-\u2016\u2018-\u201A\u201C-\u201E\u2020-\u2022\u2026\u2030\u2031\u2039-\u203B\u203D\u2044\u20AC\u2103\u2116\u2117\u2122\u2126\u2190-\u2193\u25E6\u25EF\u266A\uFB00-\uFB04]$/;
const GREEK = /^[\u0370-\u03FF\u1F00-\u1FFF]$/;
const CYRILLIC = /^[\u0400-\u04FF]$/;
const im = (x) => '\\(' + x + '\\)';
// What Word users type as text and LaTeX has only as a command. Without these every such
// character is an error in the log and a gap in the PDF.
const SYMBOL = {
  '↔': im('\\leftrightarrow'), '⇒': im('\\Rightarrow'), '⇐': im('\\Leftarrow'), '⇔': im('\\Leftrightarrow'), '↦': im('\\mapsto'), '⟶': im('\\longrightarrow'), '⟹': im('\\Longrightarrow'), '↗': im('\\nearrow'), '↘': im('\\searrow'),
  '≤': im('\\leq'), '≥': im('\\geq'), '≠': im('\\neq'), '≈': im('\\approx'), '≡': im('\\equiv'), '∼': im('\\sim'), '≃': im('\\simeq'), '≅': im('\\cong'), '≪': im('\\ll'), '≫': im('\\gg'), '∝': im('\\propto'), '≲': im('\\lesssim'), '≳': im('\\gtrsim'),
  '∞': im('\\infty'), '∑': im('\\sum'), '∏': im('\\prod'), '∫': im('\\int'), '√': im('\\surd'), '∂': im('\\partial'), '∇': im('\\nabla'), '∆': im('\\Delta'), '∈': im('\\in'), '∉': im('\\notin'), '∋': im('\\ni'), '⊂': im('\\subset'), '⊃': im('\\supset'), '⊆': im('\\subseteq'), '⊇': im('\\supseteq'),
  '∪': im('\\cup'), '∩': im('\\cap'), '∅': im('\\emptyset'), '∀': im('\\forall'), '∃': im('\\exists'), '∧': im('\\land'), '∨': im('\\lor'), '⊕': im('\\oplus'), '⊗': im('\\otimes'), '⋅': im('\\cdot'), '∙': im('\\cdot'), '∗': im('\\ast'), '∘': im('\\circ'), '∓': im('\\mp'),
  '′': im('^{\\prime}'), '″': im('^{\\prime\\prime}'), '⊥': im('\\perp'), '∥': im('\\parallel'), '∠': im('\\angle'), '∴': im('\\therefore'), '∵': im('\\because'), 'ℓ': im('\\ell'), 'ℏ': im('\\hbar'), 'ℝ': im('\\mathbb{R}'), 'ℕ': im('\\mathbb{N}'), 'ℤ': im('\\mathbb{Z}'), 'ℚ': im('\\mathbb{Q}'), 'ℂ': im('\\mathbb{C}'),
  '✓': im('\\checkmark'), '✔': im('\\checkmark'), '✗': im('\\times'), '✘': im('\\times'), '★': im('\\bigstar'), '☆': im('\\star'), '□': im('\\square'), '☐': im('\\square'), '■': im('\\blacksquare'), '▪': im('\\blacksquare'), '●': im('\\bullet'), '○': im('\\circ'), '◆': im('\\blacklozenge'), '◊': im('\\lozenge'),
  '▶': im('\\blacktriangleright'), '►': im('\\blacktriangleright'), '▲': im('\\blacktriangle'), '▼': im('\\blacktriangledown'), '△': im('\\triangle'), '♠': im('\\spadesuit'), '♣': im('\\clubsuit'), '♥': im('\\heartsuit'), '♦': im('\\diamondsuit'),
  '\u2212': '\\textminus{}', '\u2009': '\\,', '\u200A': '\\,', '\u202F': '\\,', '\u2002': '\\enspace{}', '\u2003': '\\quad{}', '\u2007': '~', '\u200B': '', '\u200D': '', '\u200E': '', '\u200F': '', '\u061C': '', '\u202A': '', '\u202B': '', '\u202C': '', '\u202D': '', '\u202E': '', '\u2066': '', '\u2067': '', '\u2068': '', '\u2069': '', '\u2060': '', '\uFEFF': '', '\u2028': '\\\\{}', '\u2015': '---', '\u2017': '\\_',
  '⁰': '\\textsuperscript{0}', '⁴': '\\textsuperscript{4}', '⁵': '\\textsuperscript{5}', '⁶': '\\textsuperscript{6}', '⁷': '\\textsuperscript{7}', '⁸': '\\textsuperscript{8}', '⁹': '\\textsuperscript{9}', '⁺': '\\textsuperscript{+}', '⁻': '\\textsuperscript{\\textminus}', 'ⁿ': '\\textsuperscript{n}',
  '₀': '\\textsubscript{0}', '₁': '\\textsubscript{1}', '₂': '\\textsubscript{2}', '₃': '\\textsubscript{3}', '₄': '\\textsubscript{4}', '₅': '\\textsubscript{5}', '₆': '\\textsubscript{6}', '₇': '\\textsubscript{7}', '₈': '\\textsubscript{8}', '₉': '\\textsubscript{9}',
  '⅓': im('\\tfrac{1}{3}'), '⅔': im('\\tfrac{2}{3}'), '⅛': im('\\tfrac{1}{8}'), '⅜': im('\\tfrac{3}{8}'), '⅝': im('\\tfrac{5}{8}'), '⅞': im('\\tfrac{7}{8}'), '℃': '\\textcelsius{}', '℉': '\\textdegree{}F', '\u212B': '\\AA{}', '\u212A': 'K',
  'Ħ': '\\textmd{H}', 'ħ': im('\\hbar'), 'ſ': 's', 'ŀ': 'l\\textperiodcentered{}', 'Ŀ': 'L\\textperiodcentered{}', 'ŉ': "'n", 'ĸ': 'k'
};
// the same characters where texmath left them in a formula
const MATHSYM = { '≔': '\\mathrel{:=}', '≕': '\\mathrel{=:}', '≝': '\\overset{\\mathrm{def}}{=}', '≢': '\\not\\equiv ', '⊄': '\\not\\subset ', '⊅': '\\not\\supset ', '∯': '\\oint\\!\\!\\!\\oint ', '∰': '\\oint\\!\\!\\!\\oint\\!\\!\\!\\oint ', '≉': '\\not\\approx ', '∌': '\\not\\ni ', '⟂': '\\perp ', '⩽': '\\leqslant ', '⩾': '\\geqslant ', '\u2212': '-' };
// The marks that say which way text runs (U+200E, U+200F, U+061C, the embeddings and isolates)
// go with the other characters above that print nothing: babel orders the words without them.
// A zero width joiner goes too, except in Arabic script and in India's scripts, where it and
// the non joiner (which pdfLaTeX knows as well) choose the shape of the letters beside them (in
// Devanagari whether two consonants join, in Malayalam a letter's final form).
const JOINS = /[\u0600-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC\u0900-\u0D7F\uA8E0-\uA8FF]/;
// Characters the fonts of the hosted Rikuy have once the preamble sets the script up
// (src/scripts.js): Chinese with its punctuation and full width forms, Arabic, and each of
// India's scripts with the danda and double danda they share (which stand in Devanagari's block).
const INDIC_SHARED = /[\u0964\u0965\u200C\u200D]/;
const FONTED = {
  ...Object.fromEntries(INDIC.map((x) => [x[0], { test: (ch) => x[2].test(ch) || INDIC_SHARED.test(ch) }])), chinese: /[\u2E80-\u2FDF\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/, arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u200C\u200D]/ };
const HAN_TEXT = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const SCRIPTS = [[/[\u3040-\u30FF\u31F0-\u31FF]/, 'Japanese'], [/[\u1100-\u11FF\uAC00-\uD7AF\u3130-\u318F]/, 'Korean'], [/[\u2E80-\u2FDF\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/, 'Chinese or Japanese'],
  [/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/, 'Arabic'], [/[\u0590-\u05FF\uFB1D-\uFB4F]/, 'Hebrew'], ...INDIC.map((x) => [x[2], x[1]]), [/[\u0D80-\u0DFF]/, 'Sinhala'], [/[\u0E00-\u0EFF]/, 'Thai or Lao'],
  [/[\u1E00-\u1EFF\u0180-\u024F]/, 'accented Latin'], [/[\uD800-\uDFFF\u2600-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F]/, 'emoji and pictographs']];

const MARKS_G = /[\uE000-\uE01F]/g;

// every array of the tree, deepest last: fn may change it in place
function arrays(x, fn) {
  if (Array.isArray(x)) { fn(x); for (const y of x) arrays(y, fn); return; }
  if (!x || typeof x !== 'object') return;
  if ('c' in x) arrays(x.c, fn);
}
const plain = (inl) => { let s = ''; walk(inl, (x) => { if (x.t === 'Str') s += x.c; else if (x.t === 'Space' || x.t === 'SoftBreak') s += ' '; }); return s; };

// "Figure 2: " or "Table 3. " at the head of a caption, as Word writes captions: n characters
// gone from the first inlines when the number is the one LaTeX will give the float itself
const CAPTION = /^\s*(figure|fig\.?|table|tab\.?|figura|tabla|cuadro|gr[áa]fico|abbildung|abb\.?|tabelle|tableau|tabela|tabella|chart|graph|scheme|plate|map)[\s\u00A0]*(\d+)(?!\.?\d)\s*[:.\-\u2013\u2014]?\s*/i;
function uncaption(blocks, n) {
  const b = blocks && blocks[0];
  if (!b || (b.t !== 'Para' && b.t !== 'Plain')) return null;
  // the first words, also those inside the bookmark Word puts around "Figure 2" once the
  // text refers to it
  const lead = [];
  const into = (a) => { for (const x of a) { if (lead.length > 12) return false; if (x.t === 'Str' || x.t === 'Space') lead.push(x); else if (x.t === 'Span') { if (into(x.c[1]) === false) return false; } else return false; } return true; };
  into(b.c);
  const head = lead.map((x) => (x.t === 'Str' ? x.c : ' ')).join('');
  const mm = CAPTION.exec(head);
  if (!mm || +mm[2] !== n) return null;
  let cut = mm[0].length;
  for (const x of lead) {
    if (cut <= 0) break;
    const len = x.t === 'Str' ? x.c.length : 1;
    if (x.t === 'Str') x.c = x.c.slice(Math.min(cut, len)); else if (len <= cut) { x.t = 'Str'; x.c = ''; }
    cut -= len;
  }
  const empty = (a) => { for (let i = a.length - 1; i >= 0; i--) { if (a[i].t === 'Str' && !a[i].c) a.splice(i, 1); else if (a[i].t === 'Span') empty(a[i].c[1]); } };
  empty(b.c);
  // the bookmarks at its head, which the text's references to this float name
  const ids = [];
  for (const x of b.c) { if (x.t === 'Span') { if (x.c[0][0]) ids.push(x.c[0][0]); } else break; }
  return { word: mm[1], ids };
}

// several formulas in one of Word's math paragraphs (Shift+Enter in an equation), which pandoc
// writes side by side as {a}{b}: one per line, lined up at the first = when each has one
function mathLines(tex) {
  const rows = [];
  let i = 0;
  while (i < tex.length) {
    if (tex[i] !== '{') return null;
    let d = 0, j = i;
    for (; j < tex.length; j++) { if (tex[j] === '\\') { j++; continue; } if (tex[j] === '{') d++; else if (tex[j] === '}' && --d === 0) break; }
    if (j >= tex.length) return null;
    rows.push(tex.slice(i + 1, j));
    i = j + 1;
  }
  if (rows.length < 2 || !rows.slice(0, -1).every((r) => /\n\s*$/.test(r))) return null;
  const eq = (r) => { let d = 0; for (let k = 0; k < r.length; k++) { const c = r[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}') d--; else if (c === '=' && d === 0) return k; } return -1; };
  const lines = rows.map((r) => r.trim()).filter(Boolean);
  if (lines.some((r) => /\\\\|\\begin\{/.test(r))) return null;
  const al = lines.every((r) => eq(r) >= 0);
  return '\\begin{' + (al ? 'aligned' : 'gathered') + '}\n' + lines.map((r) => (al ? r.slice(0, eq(r)) + '&' + r.slice(eq(r)) : r)).join(' \\\\\n') + '\n\\end{' + (al ? 'aligned' : 'gathered') + '}';
}

// the document's tree, tidied before pandoc writes it; N collects what the user is told
function tidy(doc, info, textW, N) {
  directions(doc);
  // Code that Word holds in two runs side by side is one code span: pandoc joins bold and
  // italic runs that differ in what it does not read, but not code. Rikuy's own files have such
  // runs wherever the script changes (each has its font and language, indicRuns), and Word
  // cuts a run at every change of font.
  const recode = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const x = a[i], y = a[i - 1];
      if (!x || !y || x.t !== 'Code' || y.t !== 'Code' || JSON.stringify(x.c[0]) !== JSON.stringify(y.c[0])) continue;
      y.c[1] += x.c[1];
      a.splice(i, 1);
    }
  };
  arrays(doc.blocks, recode);
  for (const v of Object.values(doc.meta || {})) arrays(v, recode);
  let nfig = 0, ntab = 0, neq = 0;
  const floats = new Map(); // bookmark of a caption LaTeX numbers -> the number
  const count = (k, n = 1) => { N[k] = (N[k] || 0) + n; };
  // an equation with its number: \begin{equation}, numbered by LaTeX when Word's number is the
  // next one, else tagged with Word's
  const numbered = (tex, label) => {
    const t = safeMath(tex.trim());
    if (!t) return null;
    const auto = label === String(neq + 1);
    if (auto) neq++;
    count('numbered');
    return { t: 'RawBlock', c: ['latex', '\\begin{equation}\n' + t + (auto ? '' : '\n\\tag{' + label + '}') + '\n\\end{equation}'] };
  };
  const LABEL = /^\(((?:[A-Z]\.?)?\d{1,3}(?:\.\d{1,3}){0,2}[a-z]?)\)$/;
  arrays(doc.blocks, (a) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!x || typeof x !== 'object' || typeof x.t !== 'string') continue;
      if (x.t === 'Figure' || (x.t === 'Table' && x.c[1][1].length)) {
        const n = x.t === 'Figure' ? ++nfig : ++ntab;
        const u = uncaption(x.c[1][1], n);
        if (u) { count('captions'); for (const id of u.ids) floats.set(id, n); }
      }
      else if (x.t === 'Image') {
        // as wide a share of the line as in Word, never wider than the text; small ones as they are
        const kv = x.c[0][2], w = kv.find((p) => p[0] === 'width');
        const inch = w && /^([\d.]+)in$/.exec(w[1]);
        if (inch && +inch[1] / textW > 0.3) { w[1] = Math.round(Math.min(1, +inch[1] / textW) * 100) + '%'; x.c[0][2] = kv.filter((p) => p[0] !== 'height'); }
      } else if (x.t === 'Math' && x.c[0].t === 'DisplayMath') {
        const ml = mathLines(x.c[1]);
        if (ml) { x.c[1] = ml; count('mathlines'); }
      } else if (x.t === 'Para') {
        const inl = x.c.filter((y) => y.t !== 'Space' && y.t !== 'SoftBreak' && !(y.t === 'Str' && !y.c.replace(MARKS_G, '')));
        // Word's own numbered equation: "formula#(2)", which pandoc writes as a one cell array
        const own = inl.length === 1 && inl[0].t === 'Math' && /^\\begin\{array\}\{[lcr]\}\n([\s\S]*?)\\#\(([A-Za-z0-9.-]{1,12})\)\n\\end\{array\}$/.exec(inl[0].c[1]);
        // the way people type one: a formula, a tab, "(2)"
        const typed = inl.length === 2 && inl[0].t === 'Math' && inl[1].t === 'Str' && LABEL.exec(inl[1].c);
        const eq = own ? numbered(own[1], own[2]) : typed ? numbered(inl[0].c[1], typed[1]) : null;
        if (eq) a[i] = eq;
      } else if (x.t === 'BulletList' && i > 0 && a[i - 1] && a[i - 1].t === 'BulletList') {
        // lists Word keeps under different numbers with nothing between them read as one list
        a[i - 1].c.push(...x.c);
        a.splice(i--, 1);
      }
    }
  });
  // Section numbers typed into the headings ("2.1 Data", as Rikuy's and pandoc's own Word files
  // have them): where every such number is the one LaTeX will give the heading, counting the
  // headings that have one, the numbers go and a heading without one is \section*. One number
  // out of step and nothing changes.
  const heads = doc.blocks.filter((b) => b && b.t === 'Header' && b.c[0] <= 3);
  const typed = (b) => { const f = b.c[2][0]; return f && f.t === 'Str' && b.c[2][1] && b.c[2][1].t === 'Space' && /^\d{1,3}(\.\d{1,3}){0,2}$/.test(f.c) ? f.c : null; };
  const cnt = [0, 0, 0];
  const due = heads.map((b) => {
    if (!typed(b)) return null;
    const l = b.c[0];
    cnt[l - 1]++;
    cnt.fill(0, l);
    return cnt.slice(0, l).join('.');
  });
  if (heads.some(typed) && heads.every((b, i) => !typed(b) || (typed(b) === due[i] && !due[i].split('.').includes('0')))) {
    for (const b of heads) {
      if (typed(b)) { b.c[2].splice(0, 2); count('headnums'); } else if (!b.c[1][1].includes('unnumbered')) b.c[1][1].push('unnumbered');
    }
  }
  // a link to a bookmark the file does not have (a reference whose target was deleted) is its text
  const ids = new Set();
  walk(doc.blocks, (x) => { const a = x.t === 'Header' ? x.c[1] : Array.isArray(x.c) && Array.isArray(x.c[0]) && typeof x.c[0][0] === 'string' ? x.c[0] : null; if (a && a[0]) ids.add(a[0]); });
  arrays(doc.blocks, (a) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (x && x.t === 'Link' && /^#/.test(x.c[2][0]) && !ids.has(x.c[2][0].slice(1))) { a.splice(i, 1, ...x.c[1]); i += x.c[1].length - 1; }
    }
  });
  // a bookmark nothing in the file refers to (Word leaves many: _GoBack, _Hlk..., Rikuy's own
  // Rk... in a file exported elsewhere) would be a \phantomsection\label in every such place,
  // and an error inside \title: it goes
  const linked = new Set();
  walk([doc.blocks, Object.values(doc.meta || {})], (x) => { if (x.t === 'Link' && /^#/.test(x.c[2][0])) linked.add(x.c[2][0].slice(1)); });
  const unmarked = (a) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!x || x.t !== 'Span' || !x.c[0][0] || linked.has(x.c[0][0])) continue;
      // pandoc's span for a bookmark has the class "anchor" and nothing else
      if (x.c[0][1].some((c) => c !== 'anchor') || x.c[0][2].length) x.c[0][0] = '';
      else { a.splice(i, 1, ...x.c[1]); i--; }
    }
  };
  arrays(doc.blocks, unmarked);
  for (const v of Object.values(doc.meta || {})) arrays(v, unmarked);
  // Word's cross reference to such a float ("Figure 2", a link to the caption's bookmark) is a
  // \ref: it follows the float when figures are added or moved
  if (floats.size) arrays(doc.blocks, (a) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!x || x.t !== 'Link' || !/^#/.test(x.c[2][0]) || !floats.has(x.c[2][0].slice(1))) continue;
      const id = x.c[2][0].slice(1), mm = /^(.*?\D)[\s\u00A0]*(\d+)$/.exec(plain(x.c[1]));
      if (!mm || +mm[2] !== floats.get(id) || !/^[\w:.-]+$/.test(id)) continue;
      a.splice(i, 1, { t: 'Str', c: mm[1].trim() }, { t: 'RawInline', c: ['latex', '~\\ref{' + id + '}'] });
      count('refs');
    }
  });
  // text: symbols LaTeX has only as commands; scripts and what has no font
  const seen = { greek: 0, cyrillic: 0, other: new Map() };
  const strs = (a) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!x || typeof x !== 'object') continue;
      if (x.t === 'Math') {
        let t = '';
        for (const ch of x.c[1]) t += Object.hasOwn(MATHSYM, ch) ? MATHSYM[ch] : ch;
        x.c[1] = t;
        for (const ch of t) if (ch > '\u007f' && !PLAIN.test(ch) && !GREEK.test(ch) && !CYRILLIC.test(ch) && !MARKS.test(ch)) seen.other.set(ch, (seen.other.get(ch) || 0) + 1);
        continue;
      }
      if (x.t !== 'Str' || !/[^\u0000-\u00ff]/.test(x.c)) continue;
      const out = [];
      let cur = '';
      const chars = [...x.c];
      // Chinese text has its own quotation marks, dashes and dots in these characters: where
      // pandoc would write TeX's (``, ---, \ldots), which are set in the Latin font, they stay
      const han = HAN_TEXT.test(x.c);
      for (let k = 0; k < chars.length; k++) {
        const ch = chars[k];
        if ((ch === '\u200D' || ch === '\u200C') && (JOINS.test(chars[k - 1] || '') || JOINS.test(chars[k + 1] || ''))) { cur += ch; continue; }
        if (han && /[\u2018\u2019\u201C\u201D\u2014\u2026]/.test(ch)) {
          if (cur) { out.push({ t: 'Str', c: cur }); cur = ''; }
          out.push({ t: 'RawInline', c: ['latex', ch] });
          continue;
        }
        if (ch < '\u0100' || PLAIN.test(ch) || MARKS.test(ch)) { cur += ch; continue; }
        if (GREEK.test(ch)) { seen.greek++; cur += ch; continue; }
        if (CYRILLIC.test(ch)) { seen.cyrillic++; cur += ch; continue; }
        const to = Object.hasOwn(SYMBOL, ch) ? SYMBOL[ch] : null;
        if (to == null) { seen.other.set(ch, (seen.other.get(ch) || 0) + 1); cur += ch; continue; }
        if (cur) { out.push({ t: 'Str', c: cur }); cur = ''; }
        if (to) out.push({ t: 'RawInline', c: ['latex', to] });
        count('symbols');
      }
      if (cur) out.push({ t: 'Str', c: cur });
      a.splice(i, 1, ...out);
      i += out.length - 1;
    }
  };
  arrays(doc.blocks, strs);
  for (const v of Object.values(doc.meta || {})) arrays(v, strs);
  return seen;
}

// Which way the paragraphs run. pandoc puts every right to left run of a Word file in a span,
// which its LaTeX writer makes \RL{..} of, a command of a package the document does not load:
// the spans go, as TeX orders the words itself (babel's bidi=basic, src/scripts.js). What TeX
// cannot find by itself is a paragraph's own direction, which premark() marked: the blocks of
// the body are grouped by it, and each group stands between two lines of one mark, which
// unmark() makes an environment of where the group runs against the document, once the text
// has said which way that is. A list or a table runs as most of its paragraphs do; what has no
// words (a formula, a picture) goes with the blocks around it.
function directions(doc) {
  const R = mark.rtl;
  const unspan = (a) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!x || x.t !== 'Span' || x.c[0][0] || x.c[0][1].length || !x.c[0][2].length || !x.c[0][2].every((kv) => kv[0] === 'dir')) continue;
      a.splice(i, 1, ...x.c[1]);
      i--;
    }
  };
  arrays(doc.blocks, unspan);
  for (const v of Object.values(doc.meta || {})) arrays(v, unspan);
  // a footnote's paragraphs are not the paragraph's it hangs on
  const some = (x, test) => (Array.isArray(x) ? x.some((y) => some(y, test)) : !x || typeof x !== 'object' || x.t === 'Note' ? false : x.t === 'Str' ? test(x.c) : 'c' in x && some(x.c, test));
  const count = (x, n) => {
    if (Array.isArray(x)) { for (const y of x) count(y, n); return; }
    if (!x || typeof x !== 'object') return;
    if (x.t === 'Para' || x.t === 'Plain' || x.t === 'Header') {
      if (!some(x.c, (t) => /[^\s\uE000-\uE01F]/.test(t))) return;
      n.all++;
      if (some(x.c, (t) => t.includes(R))) n.rtl++;
    } else if ('c' in x) count(x.c, n);
  };
  const dirs = doc.blocks.map((b) => { const n = { all: 0, rtl: 0 }; count(b, n); return !n.all ? null : 2 * n.rtl > n.all ? 'rtl' : 'ltr'; });
  const strip = (a) => {
    for (let i = a.length - 1; i >= 0; i--) {
      const x = a[i];
      if (!x || x.t !== 'Str' || !x.c.includes(R)) continue;
      x.c = x.c.split(R).join('');
      if (x.c) continue;
      a.splice(i, 1);
      // the space the paragraph began with, which pandoc drops only at the very start
      if (!i && a[0] && a[0].t === 'Space') a.splice(0, 1);
    }
  };
  arrays(doc.blocks, strip);
  for (const v of Object.values(doc.meta || {})) arrays(v, strip);
  // a document with no right to left paragraph has nothing to group
  if (!dirs.includes('rtl')) return;
  for (let i = 0; i < dirs.length; i++) {
    if (dirs[i]) continue;
    let j = i;
    while (j < dirs.length && !dirs[j]) j++;
    if (i && j < dirs.length && dirs[i - 1] === dirs[j]) dirs.fill(dirs[j], i, j);
    i = j;
  }
  const raw = (c) => ({ t: 'RawBlock', c: ['latex', c] });
  const out = [];
  for (let i = 0; i < dirs.length; i++) {
    const m = dirs[i] === 'rtl' ? mark.rtlGroup : dirs[i] === 'ltr' ? mark.ltrGroup : null;
    if (m && dirs[i - 1] !== dirs[i]) out.push(raw(m[0]));
    out.push(doc.blocks[i]);
    if (m && dirs[i + 1] !== dirs[i]) out.push(raw(m[1]));
  }
  doc.blocks = out;
}

// pandoc's longtable, as a LaTeX author writes a table: a tabular in a table float under its
// caption, or centred. The page shows it as a table (a longtable's caption was a row, its head
// twice), and a table inside a table, which longtable cannot be, compiles. A table of more
// than LONG rows stays a longtable, which breaks over pages.
const LONG = 40;
const LT = /\\(begin|end)\{longtable\}/g;
// the group pandoc puts around a table without a caption, to keep the table counter still; the
// editor reads a table in a group as inline text, and a tabular counts nothing
const GROUP = '{\\def\\LTcaptype{none} % do not increment counter\n';
function tables(tex, inner = false) {
  const B = '\\begin{longtable}', E = '\\end{longtable}';
  let out = '', pos = 0;
  for (;;) {
    const b = tex.indexOf(B, pos);
    if (b < 0) break;
    let d = 0, e = -1, mm;
    LT.lastIndex = b;
    while ((mm = LT.exec(tex))) { if (mm[1] === 'begin') d++; else if (--d === 0) { e = mm.index + E.length; break; } }
    if (e < 0) break;
    // the tables it holds first: they become tabulars, which a cell may hold
    const t = B + tables(tex.slice(b + B.length, e - E.length), true) + E;
    const grouped = tex.slice(Math.max(pos, b - GROUP.length), b) === GROUP && tex.slice(e, e + 2) === '\n}';
    // a longtable that stays and has no caption gives the number it took back
    out += tex.slice(pos, grouped ? b - GROUP.length : b) + (oneTable(t, inner) || t + (grouped ? '\n\\addtocounter{table}{-1}' : ''));
    pos = grouped ? e + 2 : e;
  }
  return out + tex.slice(pos);
}
function oneTable(t, inner) {
  const head = /^\\begin\{longtable\}\[\]\{/.exec(t);
  if (!head) return null;
  let d = 1, k = head[0].length;
  for (; k < t.length && d; k++) { if (t[k] === '\\') { k++; continue; } if (t[k] === '{') d++; else if (t[k] === '}') d--; }
  if (d) return null;
  // column widths as a share of the line: the same lengths, without the calc package
  const spec = t.slice(head[0].length, k - 1).replace(/p\{\(\\linewidth - (\d+)\\tabcolsep\) \* \\real\{([\d.]+)\}\}/g, (s, n, f) => 'p{' + (+f).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '\\dimexpr\\linewidth-' + n + '\\tabcolsep\\relax}');
  const lines = t.slice(k).split('\n');
  if (lines[0].trim()) return null;
  lines.shift();
  if (lines.pop() !== '\\end{longtable}') return null;
  let caption = null;
  const cm = /^\\caption\{([\s\S]*)\}\\tabularnewline$/.exec(lines[0] || '');
  if (cm) { caption = cm[1]; lines.shift(); }
  const iFirst = lines.indexOf('\\endfirsthead'), iHead = lines.indexOf('\\endhead'), iFoot = lines.indexOf('\\endlastfoot');
  if (iHead < 0 || iFoot !== iHead + 2 || lines[iHead + 1] !== '\\bottomrule' || lines[0] !== '\\toprule') return null;
  const headRows = lines.slice(iFirst >= 0 ? iFirst + 1 : 0, iHead);   // \toprule, rows, \midrule (or \toprule alone)
  const body = lines.slice(iFoot + 1);
  const nrows = body.filter((l) => /\\\\$/.test(l)).length;
  if (!inner && nrows > LONG) return null;
  // a table of one row is all head: no rule under it but the last
  if (!nrows && headRows[headRows.length - 1] === '\\midrule') headRows.pop();
  const tab = ['\\begin{tabular}{' + spec + '}', ...headRows, ...body, '\\bottomrule', '\\end{tabular}'];
  if (inner) return tab.join('\n');
  if (caption != null) return ['\\begin{table}[htbp]', '\\centering', '\\caption{' + caption + '}', ...tab, '\\end{table}'].join('\n');
  return ['\\begin{center}', ...tab, '\\end{center}'].join('\n');
}

// Where LaTeX prints its source as written (verbatim, \verb, a \texttt code span) a mark has no
// command to become: any that got there (a coloured run in a style not known as code) goes.
// The comments' marks stay: comments() places them outside or says they have no place.
function uncode(tex) {
  const bare = (t) => t.replace(/[\uE003\uE005][\uE010-\uE01F]*\uE001?/g, '').replace(/[\uE002\uE004\uE006-\uE00F]/g, '');
  if (!/[\uE002-\uE00F]/.test(tex)) return tex;
  tex = tex.replace(/\\begin\{(verbatim\*?|Verbatim|Highlighting|lstlisting)\}[\s\S]*?\\end\{\1\}/g, bare)
    .replace(/\\(?:verb\*?|VERB|lstinline)([^A-Za-z\s{])[^\n]*?\1/g, bare);
  // \texttt{...} and \passthrough{...}: to the brace that closes them
  let out = '', pos = 0;
  const re = /\\(?:texttt|passthrough)\{/g;
  for (let mm; (mm = re.exec(tex));) {
    let d = 1, k = re.lastIndex;
    for (; k < tex.length && d; k++) { if (tex[k] === '\\') { k++; continue; } if (tex[k] === '{') d++; else if (tex[k] === '}') d--; }
    if (d) break;
    out += tex.slice(pos, re.lastIndex) + bare(tex.slice(re.lastIndex, k));
    pos = re.lastIndex = k;
  }
  return out + tex.slice(pos);
}

// pandoc writes every space of a code span as "\ ", which keeps the spaces TeX would drop: one
// at the span's ends, the second of two. A single space between two words needs no keeping, and
// \texttt{two words} saved as Word and opened again is \texttt{two words}.
function codeSpaces(tex) {
  if (!tex.includes('\\ ')) return tex;
  let out = '', pos = 0;
  const re = /\\texttt\{/g;
  for (let mm; (mm = re.exec(tex));) {
    let d = 1, k = re.lastIndex;
    for (; k < tex.length && d; k++) { if (tex[k] === '\\') { k++; continue; } if (tex[k] === '{') d++; else if (tex[k] === '}') d--; }
    if (d) break;
    const arg = tex.slice(re.lastIndex, k - 1);
    // not after a command's name (the space would end the name and be gone), nor after a backslash
    out += tex.slice(pos, re.lastIndex) + arg.replace(/\\ /g, (m, at) => {
      const before = arg.slice(Math.max(0, at - 60), at), after = arg.slice(at + 2, at + 4);
      return !before || !after || /\s$|\\ $|\\[A-Za-z]*$|^[A-Za-z]{60}$/.test(before) || /^\s|^\\ /.test(after) ? m : ' ';
    });
    pos = re.lastIndex = k - 1;
  }
  return out + tex.slice(pos);
}

// pandoc's marks (premark) in the LaTeX it wrote, each as the command it stands for
// S: { arabic: the preamble sets Arabic up, rtl: the document itself runs right to left }
function unmark(tex, info, N, S) {
  const count = (k, n = 1) => { N[k] = (N[k] || 0) + n; };
  tex = uncode(tex);
  // the groups of paragraphs directions() set between marks: one that runs against the
  // document goes into the environment that turns it. Where Arabic is not set up (another
  // right to left script, which has no font here) nothing can turn a paragraph, and one that
  // lost its direction keeps no right alignment either: in Word that was its left edge.
  if (/[\uE00C-\uE00F]/.test(tex)) {
    const [RO, RC] = mark.rtlGroup, [LO, LC] = mark.ltrGroup;
    // (marks out of step are not directions()'s: a file pandoc read as it came may hold them
    // in its own text, and gets no half of an environment for it)
    const seq = tex.split('\n').filter((l) => l === RO || l === RC || l === LO || l === LC).join('');
    const paired = new RegExp('^(?:' + RO + RC + '|' + LO + LC + ')*$').test(seq);
    const wrapR = paired && S.arabic && !S.rtl ? otherDirection(true) : null, wrapL = paired && S.arabic && S.rtl ? otherDirection(false) : null;
    const out = [];
    let inR = false, skip = false;
    for (const line of tex.split('\n')) {
      // an environment's first and last lines stand against its text, with no blank line
      if (skip && !line.trim()) { skip = false; continue; }
      skip = false;
      if (line === RO || line === LO) {
        const w = line === RO ? wrapR : wrapL;
        inR = line === RO;
        if (w) out.push(w[0]);
        skip = true;
      } else if (line === RC || line === LC) {
        const w = line === RC ? wrapR : wrapL;
        inR = false;
        if (out.length && !out[out.length - 1].trim()) out.pop();
        if (w) out.push(w[1]);
        out.push('');
        skip = true;
      } else out.push(inR && !S.arabic ? line.replace(/[\uE009\uE00A]/g, '') : line);
    }
    tex = out.join('\n');
  }
  // a table of contents, and the lists of figures and tables
  tex = tex.replace(/^[ \t]*\uE003([\uE010-\uE01F])\uE001[ \t]*$/gm, (s, k) => { count('toc'); return ['\\tableofcontents', '\\listoffigures', '\\listoftables'][+decode(k)] || '\\tableofcontents'; });
  // a page break: where it ends or begins a paragraph (inside a table row or the argument of a
  // command a new page has no place, and Word's goes)
  const bareOf = (t) => t.replace(MARKS_G, '');
  const free = (t) => isBalanced(t, 0, t.length) && !/(^|[^\\])&|\\\\\s*$/.test(t);
  tex = tex.split('\n').map((line) => {
    if (line.indexOf('\uE004') < 0) return line;
    if (!bareOf(line).trim()) { count('breaks'); return '\\newpage'; }
    const end = /^([^\uE004]*)\uE004([\uE006\uE008\uE00A]*)$/.exec(line);
    if (end && free(bareOf(end[1]))) { count('breaks'); return end[1] + end[2] + '\n\n\\newpage'; }
    const start = /^([\uE007\uE009]?)\uE004([^\uE004]*)$/.exec(line);
    if (start && free(bareOf(start[2]))) { count('breaks'); return '\\newpage\n\n' + start[1] + start[2]; }
    return line;
  }).join('\n');
  // centred and right aligned paragraphs; neighbours share one environment
  for (const [a, b, env] of [['\uE007', '\uE008', 'center'], ['\uE009', '\uE00A', 'flushright']]) {
    tex = tex.replace(new RegExp('^' + a + '([^\\n' + a + b + ']*)' + b + '$', 'gm'), (s, t) => {
      const bare = bareOf(t);
      if (!bare.trim() || !free(bare)) return t;
      count('aligned');
      return '\\begin{' + env + '}\n' + t + '\n\\end{' + env + '}';
    });
    tex = tex.split('\\end{' + env + '}\n\n\\begin{' + env + '}\n').join('\n');
  }
  // colour: one colour over most of the text is the document's ink, not a mark of anything
  const base = ink(info);
  const OPEN = '\uE005([\uE010-\uE01F]{6})\uE001';
  let was;
  do { was = tex; tex = tex.replace(new RegExp('(' + OPEN + ')([^\uE005\uE006]*)\uE006( ?)\\1', 'g'), '$1$3$4'); } while (tex !== was);
  tex = tex.replace(new RegExp(OPEN + '([^\uE005\uE006]*)\uE006', 'g'), (s, c, t) => {
    const hex = decode(c), bare = bareOf(t);
    if (base.has(hex) || !/^[0-9A-F]{6}$/.test(hex) || !bare.trim() || /\n\s*\n/.test(bare) || !isBalanced(bare, 0, bare.length) || /(^|[^\\])&/.test(bare)) return t;
    count('colors');
    return '\\textcolor[HTML]{' + hex + '}{' + t + '}';
  });
  // marks that found no place go; the comments' stay for comments()
  return tex.replace(/[\uE003\uE005][\uE010-\uE01F]*\uE001?/g, '').replace(/[\uE002\uE004\uE006-\uE00F]/g, '');
}

const ink = (info) => new Set([...info.colors].filter(([, n]) => n / (info.chars || 1) > 0.5).map(([c]) => c));

// Word's comments, each under the line of the text it is on, as Rikuy writes comments
function comments(tex, info, N) {
  const RE = /\uE000([\uE010-\uE01F]{1,9})\uE001/;
  let placed = 0;
  const left = new Map(info ? info.threads : []);
  const put = (p, T) => {
    const e = commentEdit(tex, p, { who: T.who || 'Word', quote: T.quote, body: T.body });
    if (!e) return false;
    tex = tex.slice(0, e.s) + e.t + tex.slice(e.e);
    let at = e.s + (e.t[0] === '\n' ? 1 : 0);
    for (const r of T.replies) {
      const re = commentEdit(tex, at, { who: r.who || 'Word', body: r.body, reply: true });
      if (!re) continue;
      tex = tex.slice(0, re.s) + re.t + tex.slice(re.e);
      at = re.s + (re.t[0] === '\n' ? 1 : 0);
    }
    placed++;
    return true;
  };
  // each mark costs a pass over the text: a file with more marks than any reviewer leaves
  // comments keeps the first 5000
  for (let guard = 0; guard < 5000; guard++) {
    const mm = RE.exec(tex);
    if (!mm) break;
    tex = tex.slice(0, mm.index) + tex.slice(mm.index + mm[0].length);
    const id = decode(mm[1]).replace(/^0+(?=\d)/, '');
    const T = left.get(id);
    if (!T) continue;
    if (put(mm.index, T)) left.delete(id);
  }
  tex = tex.replace(/[\uE000-\uE01F]/g, '');
  // one with no place in the text (in the title, in a float pandoc moved): after the title
  const body = tex.search(/\\begin\s*\{document\}/);
  const first = body < 0 ? -1 : tex.indexOf('\n', tex.indexOf('\\maketitle', body) >= 0 ? tex.indexOf('\\maketitle', body) : body);
  for (const [id, T] of [...left]) if (first >= 0 && put(first - 1, T)) left.delete(id);
  if (placed) N.comments = placed;
  if (left.size) N.uncommented = left.size;
  return tex;
}

const cm = (twips) => (twips / 1440 * 2.54).toFixed(2).replace(/\.?0+$/, '') + 'cm';
// the page as Word had it: paper and margins for the geometry package
function geometry(pg) {
  if (!pg || !pg.w || !pg.h) return '';
  const near = (a, b) => Math.abs(a - b) < 30;
  const W = Math.min(pg.w, pg.h), H = Math.max(pg.w, pg.h);
  const o = [];
  if (near(W, 11906) && near(H, 16838)) o.push('a4paper');
  else if (near(W, 12240) && near(H, 15840)) o.push('letterpaper');
  else o.push('paperwidth=' + cm(pg.w), 'paperheight=' + cm(pg.h));
  if (pg.w > pg.h && o[0].endsWith('paper')) o.push('landscape');
  const { top, right, bottom, left } = pg;
  if (top && right && bottom && left) {
    if (near(top, bottom) && near(left, right) && near(top, left)) o.push('margin=' + cm(top));
    else o.push('top=' + cm(top), 'bottom=' + cm(bottom), 'left=' + cm(left), 'right=' + cm(right));
  }
  return '\\usepackage[' + o.join(',') + ']{geometry}';
}

// docx -> { tex (a whole document with a short preamble), media: {name: bytes}, bib, warnings }
export function docxToLatex(P, bytes, name) {
  // the zip pandoc reads is the one rebuilt from what passed the checks
  const parts = unzip(bytes);
  const opts = { from: 'docx+citations', to: 'json', 'input-files': ['in.docx'], 'extract-media': 'media', 'track-changes': 'accept' };
  let info = null, r = null;
  try {
    const pre = premark(parts);
    r = P.convert(opts, null, { 'in.docx': zip(pre.parts) });
    if (r.stdout) info = pre.info;
  } catch (e) { r = null; }
  // the file as it came, should pandoc not take the marked one
  if (!r || !r.stdout) r = P.convert(opts, null, { 'in.docx': zip(parts) });
  if (!r.stdout) throw new Error('The file is damaged: its text (word/document.xml) is cut short or not valid, so nothing in it can be read. Open it in Word, which offers to repair it, save it again and open that file here. (pandoc: ' + (r.stderr || '').trim().slice(0, 200) + ')');
  const doc = JSON.parse(r.stdout);
  const media = {};
  const renamed = new Map();
  let k = 0, total = 0;
  for (const [n, b] of Object.entries(r.files)) {
    if (!n.startsWith('media/')) continue;
    const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(n) || [, 'bin'])[1].toLowerCase();
    // pictures only: the project keeps them as figures, never as a .tex or .html of the sender's
    if (!PICTURE.test(ext)) continue;
    if (b.length > MEDIA_MAX || (total += b.length) > LIMITS.total) continue;
    const nn = 'figures/figure' + (++k) + '.' + ext;
    renamed.set(n, nn);
    media[nn] = b;
  }
  const warn = said(r.warnings);
  const odd = new Set();
  const N = {};
  // links only to web or mail addresses; pictures only from the file itself
  walk(doc.blocks, (x) => {
    if (x.t === 'Link') { const u = safeUrl(x.c[2][0]); if (!u) { x.t = 'Span'; x.c = [x.c[0], x.c[1]]; } else x.c[2][0] = u; }
    if (x.t === 'Image') {
      const to = renamed.get(x.c[2][0]);
      if (!to) { x.t = 'Span'; x.c = [['', [], []], [{ t: 'Str', c: '[picture]' }]]; N.nopicture = (N.nopicture || 0) + 1; return; }
      x.c[2][0] = to;
      if (/\.(emf|wmf|tiff?)$/i.test(to)) odd.add(to.split('.').pop());
    }
    // a table of short cells as plain columns (l, c, r): pandoc writes the widths Word kept as
    // p{} columns with a minipage in every head cell, which reads badly in the source
    if (x.t === 'Table') {
      let long = false;
      walk([x.c[3], x.c[4], x.c[5]], (y) => { if (y.t === 'Str' && y.c.length > 30) long = true; if (y.t === 'Para' || y.t === 'Plain') { let n = 0; walk(y.c, (z) => { if (z.t === 'Str') n += z.c.length + 1; }); if (n > 40) long = true; } });
      if (!long) x.c[2] = x.c[2].map(([al]) => [al, { t: 'ColWidthDefault' }]);
    }
  });
  const pg = info && info.page;
  const textW = pg && pg.w && pg.left && pg.right && pg.w - pg.left - pg.right > 1440 ? (pg.w - pg.left - pg.right) / 1440 : 6.5;
  const seen = tidy(doc, info, textW, N);
  const refs = doc.meta && doc.meta.references;
  let bib = '';
  if (refs) {
    const b = P.convert({ from: 'json', to: 'biblatex' }, JSON.stringify({ ...doc, blocks: [] }), {});
    bib = b.stdout || '';
  }
  // pandoc's natbib writer takes a heading that ends the document for the title of the list of
  // references and leaves it out of the body: with an empty block after it the heading stays
  if (doc.blocks.length && doc.blocks[doc.blocks.length - 1].t === 'Header') doc.blocks.push({ t: 'RawBlock', c: ['latex', ''] });
  const body = P.convert({ from: 'json', to: 'latex', 'cite-method': 'natbib', wrap: 'none' }, JSON.stringify(doc), {});
  let tex = body.stdout || '';
  // the meta data pandoc read (title, authors, date, abstract) in LaTeX of its own
  const metaTex = (key) => {
    const v = doc.meta && doc.meta[key];
    if (!v) return '';
    const one = (x) => P.convert({ from: 'json', to: 'latex', wrap: 'none' }, JSON.stringify({ 'pandoc-api-version': doc['pandoc-api-version'], meta: {}, blocks: [{ t: x.t === 'MetaBlocks' ? 'Div' : 'Plain', c: x.t === 'MetaBlocks' ? [['', [], []], x.c] : x.c }] }), {}).stdout.trim();
    if (v.t === 'MetaList') return v.c.map(one).join(' \\and ');
    if (v.t === 'MetaString') return v.c;
    return one(v);
  };
  // a footnote on the title or an author (an affiliation) is \thanks there: \footnote stops LaTeX
  const front = (key) => metaTex(key).replace(/\\footnote\{/g, '\\thanks{');
  let title = front('title');
  const subtitle = front('subtitle'), author = front('author'), date = front('date'), abstract = metaTex('abstract');
  // Word's Subtitle style: under the title, smaller, as LaTeX authors set one
  if (subtitle) title = title ? title + '\\\\[0.5ex]\\large ' + subtitle : subtitle;
  // pandoc puts \hspace{0pt} after a formula that ends a paragraph; it typesets as nothing
  tex = tex.replace(/(\\\))\\hspace\{0pt\}/g, '$1');
  // after each rule of a table pandoc writes \noalign{}, which sets nothing: the typeset page
  // (and so the Word file saved from it) showed the word \noalign in the table's cells
  tex = tex.replace(/(\\(?:toprule|midrule|bottomrule))\\noalign\{\}/g, '$1');
  tex = tables(tex);
  tex = codeSpaces(tex);
  // pandoc's names for underlined and struck text are soul's, which the page does not draw; ulem's
  // it does
  tex = tex.replace(/\\ul\{/g, '\\uline{').replace(/\\st\{/g, '\\sout{');
  // Chinese, Arabic and India's scripts: which of them the text is in, and whether it is mostly
  // Arabic and so runs right to left as a whole (src/scripts.js, which also has the preamble's
  // lines for them)
  const probe = '\\begin{document}\n' + tex + '\n' + abstract;
  const needs = scriptNeeds(probe, [probe, [title, author, date].join('\n')]);
  const arabic = needs.includes('arabic');
  tex = unmark(tex, info || { chars: 0, colors: new Map() }, N, { arabic, rtl: arabic && !!needs.arabicMain });
  const used = (re) => re.test(tex) || re.test(title) || re.test(abstract) || re.test(author);
  // pandoc writes some commands of its own: those used get their definitions
  const size = info && info.sz >= 23 ? '12pt' : info && info.sz >= 21 ? '11pt' : '';
  const two = info && info.cols.length && info.cols.every((n) => n === 2);
  const cls = [size, two ? 'twocolumn' : ''].filter(Boolean).join(',');
  const pre = ['\\documentclass' + (cls ? '[' + cls + ']' : '') + '{article}'];
  const geo = geometry(pg);
  if (geo) pre.push(geo);
  // with those lines the document is XeLaTeX's or LuaLaTeX's, with fonts for those scripts:
  // nothing of pdfLaTeX's font set up goes beside them (T1 would take the text off those fonts)
  const uni = needs.length > 0;
  const fonted = (ch) => needs.some((k) => FONTED[k].test(ch));
  let nofont = 0;
  for (const [ch, c] of seen.other) if (!fonted(ch)) nofont += c;
  // pdfLaTeX stops for good at its hundredth error, and each character it has no font for is
  // one: a document mostly in such a script gets XeLaTeX, which leaves the gaps and goes on
  const xe = !uni && nofont >= 40;
  if (uni) pre.push(...scriptLines(needs, ''));
  else if (xe) pre.push('\\usepackage{fontspec} % XeLaTeX; \\setmainfont{...} names a font that has the document\'s script');
  else {
    pre.push('\\usepackage[' + [seen.greek ? 'LGR' : '', seen.cyrillic ? 'T2A' : '', 'T1'].filter(Boolean).join(',') + ']{fontenc}', '\\usepackage{lmodern}');
    // Greek and Cyrillic letters among Latin text: each is set in the font of its own encoding
    if (seen.greek) pre.push('\\usepackage{textalpha}');
    if (seen.cyrillic) pre.push('\\makeatletter % Cyrillic letters, wherever they stand, are set in the Cyrillic font (T2A)',
      '\\@for\\x:=a,b,v,g,d,e,zh,z,i,ishrt,k,l,m,n,o,p,r,s,t,u,f,h,c,ch,sh,shch,hrdsn,ery,sftsn,erev,yu,ya,yo,ii,yi,ie,gup,je,lje,nje,dje,tshe,dzhe,dze,ushrt,ghcrs,shha,zhdsc,zdsc,kdsc,kbeak,kvcrs,ae,ndsc,ng,otld,sdsc,y,yhcrs,hdsc,chvcrs,chrdsc,schwa,q,w\\do{%',
      '  \\expandafter\\DeclareTextSymbolDefault\\csname cyr\\x\\endcsname{T2A}\\uppercase\\expandafter{\\expandafter\\def\\expandafter\\y\\expandafter{\\x}}%',
      '  \\expandafter\\DeclareTextSymbolDefault\\csname CYR\\y\\endcsname{T2A}}',
      '\\makeatother');
  }
  pre.push('\\usepackage{amsmath,amssymb}');
  if (used(/\\(cancel|bcancel|xcancel)\b/)) pre.push('\\usepackage{cancel}');
  if (used(/\\includegraphics/)) pre.push('\\usepackage{graphicx}');
  if (used(/\\(toprule|midrule|bottomrule)\b/)) pre.push('\\usepackage{booktabs}');
  if (used(/\\begin\{longtable\}/)) pre.push('\\usepackage{longtable}');
  if (used(/\\arraybackslash/)) pre.push('\\usepackage{array}');
  if (used(/\\real\{/)) pre.push('\\usepackage{calc}');
  if (used(/\\multirow\b/)) pre.push('\\usepackage{multirow}');
  if (used(/\\(textcolor|hl)\b/)) pre.push('\\usepackage{xcolor}');
  if (used(/\\(sout|uline|hl)\{/)) pre.push('\\usepackage[normalem]{ulem}');
  // Word's highlighter: pandoc writes soul's \hl, which stops at a formula inside it and, before
  // 2023, at an accented letter; this one (ulem's) takes both and breaks across lines
  if (used(/\\hl\{/)) pre.push('\\DeclareRobustCommand{\\hl}{\\bgroup\\markoverwith{\\textcolor{yellow}{\\rule[-.5ex]{2pt}{2.5ex}}}\\ULon}');
  if (used(/\\(cite[tp]?|citeauthor|citeyear)\{/) || bib) pre.push('\\usepackage[authoryear,round]{natbib}');
  if (used(/\\(texttt|verb)|\\begin\{verbatim\}/)) { /* the class has them */ }
  if (used(/\\(href|url|hyperlink|hypertarget|hyperref|phantomsection|nolinkurl)\b/)) pre.push('\\usepackage[hidelinks]{hyperref}');
  if (used(/\\tightlist/)) pre.push('\\providecommand{\\tightlist}{\\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}}');
  if (used(/\\pandocbounded/)) pre.push('% pictures at their own size, no wider than the text', '\\newcommand{\\pandocbounded}[1]{\\resizebox{\\ifdim\\width>\\linewidth\\linewidth\\else\\width\\fi}{!}{#1}}');
  if (used(/\\begin\{CSLReferences\}/)) pre.push('\\newenvironment{CSLReferences}[2]{}{}', '\\newcommand{\\CSLLeftMargin}[1]{#1}', '\\newcommand{\\CSLRightInline}[1]{#1}', '\\newcommand{\\CSLBlock}[1]{#1}');
  if (used(/\\(passthrough|NormalTok)/)) pre.push('\\providecommand{\\passthrough}[1]{#1}');
  const lines = [...pre];
  if (title) lines.push('', '\\title{' + title + '}');
  if (author) lines.push('\\author{' + author + '}');
  if (title || author) lines.push('\\date{' + (date || '') + '}');
  lines.push('', '\\begin{document}');
  if (title || author) lines.push('\\maketitle');
  if (abstract) lines.push('', '\\begin{abstract}', abstract, '\\end{abstract}');
  lines.push('', tex.trim(), '');
  if (bib) lines.push('\\bibliographystyle{plainnat}', '\\bibliography{references}', '');
  lines.push('\\end{document}', '');
  let out = comments(lines.join('\n'), info, N);
  // ---- what the user is told: what came differently, and what did not come at all
  const s = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  const notes = [];
  const lost = [];
  if (!tex.trim() && !title) notes.push('The Word file has no text.');
  // The scripts src/scripts.js sets up have fonts then; what else is beside them does not. The
  // fonts XeLaTeX and LuaLaTeX start with have no Greek or Cyrillic either (pdfLaTeX's do).
  const by = new Map();
  let n = 0;
  for (const [ch, c] of seen.other) { if (fonted(ch)) continue; n += c; const sc = (SCRIPTS.find(([re]) => re.test(ch)) || [, 'other symbols'])[1]; by.set(sc, (by.get(sc) || '') + ((by.get(sc) || '').length < 12 ? ch : '')); }
  if (uni) n += seen.greek + seen.cyrillic;
  if ((xe || uni) && seen.greek + seen.cyrillic) by.set('Greek or Cyrillic', '');
  if (by.size) {
    const which = [...by].map(([sc, ex]) => sc + (ex ? ': ' + ex : '')).join('; ');
    lost.push(uni ? 'a font for ' + s(n, 'character') + ' (' + which + '): the fonts the document is set up with have none, so the PDF leaves them out until the preamble names one that does; the page and the source keep them'
      : xe ? 'a font for ' + s(n, 'character') + ' (' + which + '): TeX Live\'s default fonts have none, so the PDF leaves them out until the preamble names one that does (\\setmainfont{...}; the document is set up for XeLaTeX); the page and the source keep them'
      : s(n, 'character') + ' pdfLaTeX has no font or name for (' + which + '): the page and the source keep them, the PDF leaves them out until the document names a font that has them (XeLaTeX with fontspec)');
  }
  if (N.nopicture) lost.push(s(N.nopicture, 'picture') + ' the file only links to, or in a format that is not a picture (marked [picture])');
  if (info) {
    if (info.charts || info.art) lost.push([info.charts ? s(info.charts, 'chart') : '', info.art ? s(info.art, 'SmartArt drawing') : ''].filter(Boolean).join(' and ') + ' (Word draws them itself; save each as a picture in Word to keep it)');
    if (info.heads.length) lost.push('the header and footer text (“' + info.heads.join('”, “').replace(/\s+/g, ' ').slice(0, 120) + '”)');
    if (N.uncommented) lost.push(s(N.uncommented, 'comment') + ' with no place in the text');
    if (info.cols.some((n) => n > 1) && !two) lost.push('the columns of the part set in columns');
    if (info.colors.size && !N.colors && !ink(info).size) lost.push('text colour');
    if (info.mathcolor) lost.push('colour inside ' + s(info.mathcolor, 'formula'));
    if (info.unread.length) lost.push('comments, colours and page breaks (' + info.unread.join(', ') + ' is not well formed, so only its text was read)');
  } else lost.push('comments, colours, page breaks and short fields (the file could only be read as plain pandoc reads it)');
  if (/\\footnote\{\}/.test(out)) lost.push('the text of a footnote (its part of the file could not be read)');
  if (lost.length) notes.push('Not kept: ' + lost.join('; ') + '.');
  if (N.comments) notes.push(s(N.comments, 'Word comment') + ' came in as ' + (N.comments === 1 ? 'a comment' : 'comments') + ' under ' + (N.comments === 1 ? 'its' : 'their') + ' text.');
  if (info && info.tracked) notes.push(s(info.tracked, 'tracked change') + ' in the file ' + (info.tracked === 1 ? 'was' : 'were') + ' accepted.');
  if (info && info.endnotes) notes.push('Endnotes are footnotes here.');
  if (N.toc) notes.push('The table of contents is LaTeX\'s own now.');
  if (N.headnums) notes.push('The section numbers typed in ' + s(N.headnums, 'heading') + ' are LaTeX\'s own now.');
  if (N.numbered) notes.push(s(N.numbered, 'equation') + ' typed with a number ' + (N.numbered === 1 ? 'is' : 'are') + ' numbered by LaTeX.');
  if (odd.size) notes.push('Pictures in formats pdfLaTeX cannot include (' + [...odd].join(', ') + ') are in figures/; convert them to PNG or PDF.');
  const all = [...notes, ...warn];
  // the notes stay with the document, above its first line, where a toast is gone in seconds
  if (all.length) out = '% Opened from a Word file by Rikuy.\n' + all.map((n) => '% - ' + n.replace(/\s+/g, ' ')).join('\n') + '\n' + out;
  return { tex: out, media, bib, warnings: all, name };
}

function walk(blocks, fn) {
  const go = (x) => {
    if (Array.isArray(x)) { for (const y of x) go(y); return; }
    if (!x || typeof x !== 'object') return;
    if (typeof x.t === 'string') fn(x);
    if ('c' in x) go(x.c);
  };
  go(blocks);
}
