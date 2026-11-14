// Rikuy model: turns the syntax tree into blocks of flow items with
// numbering, cross references and citations resolved. Every editable
// character keeps a pointer to its exact source range.
import { parse, scanUserSigs, CHARS, ACCENTS, splitRows } from './parser.js';
import { parseBib, texToPlain, shortAuthors, entryYear, formatEntry } from './bib.js';
import { siTex, siOptions, siUnitSymbol } from './siunitx.js';
import { widgetPath, hashText } from './widget.js';
import { rtlDocument, languageDir } from './scripts.js';
import { isLatexMark, readEnvBegin, thmMakersIn } from './styles.js';
import { readHeadLooks, defaultLook, startsectionShapes } from './looks.js';
import { readPage, paperName, NO_MEDIA_CLASSES, setsMedia, KOMA_CLASS } from './pagesrc.js';
import { DVIPS_COLORS, BASE_COLORS } from './ui/kit.js';

const DVIPS = Object.fromEntries(DVIPS_COLORS), XC = Object.fromEntries(BASE_COLORS);
import { listSetup, formatOf, numText, bulletGlyph } from './lists.js';

const WIDGET_FILE = /\.html?$/i;
// the page's set up of the last preamble read (Builder.pageSetup)
const PAGE_CACHE = { key: null, lineAt: -1, value: null };
const STY = {
  textbf: 'bf', textit: 'it', emph: 'em', texttt: 'tt', textsc: 'sc', textsf: 'sf', textrm: 'rm', textup: 'up',
  textsl: 'sl', textmd: 'md', textnormal: 'rm', underline: 'ul', uline: 'ul', uuline: 'ul2', uwave: 'ulw',
  sout: 'so', xout: 'so', hl: 'hl', textsuperscript: 'sup', textsubscript: 'sub', mbox: 'nb', text: 'rm',
  fbox: 'fbox', MakeUppercase: 'upper', uppercase: 'upper', MakeLowercase: 'lower', lowercase: 'lower',
  textcircled: 'circ', centerline: 'rm', foreignlanguage: '', textls: 'ls', ensure: '', phantom: 'ph', hphantom: 'ph',
  // ulem's dashed and dotted lines; the double strikethrough the Font group defines (src/cmd/font.js)
  dashuline: 'uld', dotuline: 'ulo', culine: 'ul', dsout: 'so2', ruby: 'ruby',
  // graphicx's mirror (B8: a picture flipped by Flip Horizontal)
  reflectbox: 'fliph'
};
// the looks the page has for a family of type (\fontfamily{ppl}, fontspec's names, the document's
// font packages): a class y-ff-<look>, a face of app.css
const FAMILY_LOOK = {
  ptm: 'times', qtm: 'times', ntxtlf: 'times', ntxrm: 'times', ppl: 'palatino', qpl: 'palatino', pplx: 'palatino', pplj: 'palatino', zpltlf: 'palatino',
  phv: 'sans', qhv: 'sans', lmss: 'sans', cmss: 'sans', pag: 'sans', bch: 'charter', xch: 'charter', 'XCharter-TLF': 'charter', pnc: 'schola', qcs: 'schola',
  pbk: 'bookman', qbk: 'bookman', jkp: 'kp', lmtt: 'mono', cmtt: 'mono', pcr: 'mono', qcr: 'mono', lmr: 'serif', cmr: 'serif'
};
export function fontLook(name) {
  const n = String(name || '').trim();
  // (the document's text: "constructor" names no family, though every object has one)
  if (Object.hasOwn(FAMILY_LOOK, n)) return FAMILY_LOOK[n];
  const l = n.toLowerCase().replace(/[^a-z]/g, '');
  if (/termes|times/.test(l)) return 'times';
  if (/pagella|palatino|palladio/.test(l)) return 'palatino';
  if (/heros|helvetica|arial|biolinum|sans/.test(l)) return 'sans';
  if (/charter/.test(l)) return 'charter';
  if (/schola|schoolbook/.test(l)) return 'schola';
  if (/bonum|bookman/.test(l)) return 'bookman';
  if (/cursor|courier|mono|typewriter/.test(l)) return 'mono';
  if (/latinmodern|computermodern|^lm/.test(l)) return 'serif';
  return '';
}
const DECL = {
  bf: 'bf', bfseries: 'bf', it: 'it', itshape: 'it', em: 'em', tt: 'tt', ttfamily: 'tt', sc: 'sc', scshape: 'sc',
  sf: 'sf', sffamily: 'sf', rm: 'rm', rmfamily: 'rm', normalfont: 'rm', sl: 'sl', slshape: 'sl', upshape: 'up',
  mdseries: 'md', tiny: 'z-tiny', scriptsize: 'z-scriptsize', footnotesize: 'z-footnotesize', small: 'z-small',
  normalsize: 'z-normalsize', large: 'z-large', Large: 'z-Large', LARGE: 'z-LARGE', huge: 'z-huge', Huge: 'z-Huge'
};
// commands that set a file's contents in the PDF: [label on the page, index of the file argument]
const FILE_CMDS = {
  lstinputlisting: ['listing', 1], inputminted: ['listing', 2], verbatiminput: ['listing', 0], VerbatimInput: ['listing', 1],
  BVerbatimInput: ['listing', 1], LVerbatimInput: ['listing', 1], includepdf: ['PDF', 1], includesvg: ['figure', 1],
  includestandalone: ['figure', 1],
  // tables set from a database or a data file
  DTLdisplaydb: ['table', 1], DTLdisplaylongdb: ['table', 1], csvautotabular: ['table', 1], csvautobooktabular: ['table', 1],
  csvautolongtable: ['table', 1], csvautobooklongtable: ['table', 1], pgfplotstabletypeset: ['table', 1],
  DTLpiechart: ['chart', 2], DTLbarchart: ['chart', 2], DTLmultibarchart: ['chart', 2],
  // chemfig: a molecule drawn from its code (the code is not text)
  chemfig: ['molecule', -1], chemname: ['molecule', -1], arrow: ['arrow', -1],
};
const SI_CMDS = new Set(['num', 'SI', 'si', 'qty', 'unit', 'numrange', 'SIrange', 'qtyrange', 'numlist', 'SIlist', 'qtylist', 'numproduct', 'SIproduct', 'qtyproduct', 'ang', 'tablenum']);
// a package's options as { key: value or true }, for src/pagesrc.js setsMedia
const optsOf = (op) => Object.fromEntries(String(op || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const q = x.indexOf('='); return q < 0 ? [x, true] : [x.slice(0, q).trim(), x.slice(q + 1).trim()]; }));
const INVIS = new Set([
  'label', 'index', 'glossary', 'nocite', 'phantomsection', 'protect', 'relax', 'indent', 'sloppy', 'fussy',
  'frenchspacing', 'makeatletter', 'makeatother', 'raggedright', 'raggedleft', 'addcontentsline', 'setlength',
  'addtolength', 'setcounter', 'addtocounter', 'stepcounter', 'refstepcounter', 'hypersetup', 'pagestyle',
  'thispagestyle', 'pagenumbering', 'allowdisplaybreaks', 'linespread', 'setstretch', 'selectlanguage',
  'captionsetup', 'graphicspath', 'definecolor', 'usepackage', 'RequirePackage', 'bibliographystyle',
  'addbibresource', 'newcounter', 'theoremstyle', 'numberwithin', 'newtheorem', 'newcommand', 'renewcommand',
  'providecommand', 'DeclareRobustCommand', 'def', 'gdef', 'edef', 'xdef', 'let', 'DeclareMathOperator',
  'newenvironment', 'renewenvironment', 'nopagebreak', 'clubpenalty', 'widowpenalty', 'onehalfspacing',
  'doublespacing', 'singlespacing', 'title', 'author', 'date', 'documentclass', 'geometry', 'setkeys',
  'sisetup', 'DeclareSIUnit', 'centering', 'noindent', 'vfill', 'hrule', 'null', 'leavevmode', 'unskip', 'ignorespaces',
  'nolinebreak', 'linebreak_', 'setcitestyle', 'bibpunct', 'DeclareGraphicsExtensions', 'includeonly',
  'pagecolor', 'color', 'normalcolor', 'vphantom', 'strut', 'smallbreak', 'medbreak', 'bigbreak', 'goodbreak',
  'filbreak', 'enlargethispage', 'mskip', 'kern', 'hskip', 'vskip', 'thanks_', 'affil', 'affiliation', 'email',
  'address', 'shorttitle', 'subtitle', 'keywords_', 'hfil', 'endfirsthead', 'endhead', 'endfoot', 'endlastfoot',
  'tabularnewline_', 'newblock', 'hbox_', 'nobreak', 'printindex', 'makeindex', 'urlstyle', 'listfiles',
  'nonumber', 'notag', 'restoregeometry', 'newgeometry', 'linenumbers', 'nolinenumbers', 'doublespace',
  'lstset', 'tikzset', 'pgfplotsset', 'setlist', 'crefname', 'Crefname', 'newlength', 'AtBeginDocument',
  'AtEndDocument', 'setmainfont', 'setsansfont', 'setmonofont', 'newfontfamily', 'renewbibmacro',
  'DeclareFieldFormat', 'DeclareNameAlias', 'newacronym', 'usetikzlibrary', 'pgfplotstableread', 'tcbuselibrary',
  'SetKwInOut', 'algnewcommand', 'floatname', 'restylefloat', 'newfloat', 'DeclareCaptionFormat', 'setuptoc',
  'counterwithin', 'counterwithout', 'renewenvironment', 'newcolumntype', 'arraystretch', 'tabcolsep', 'renewcommand',
  'textwidth', 'linewidth', 'columnwidth', 'paperwidth', 'paperheight', 'textheight', 'baselineskip', 'parindent',
  'parskip', 'columnsep', 'columnseprule', 'tableofcontents', 'listoffigures', 'listoftables', 'pause', 'titlepage',
  'columnbreak', 'twocolumn', 'onecolumn', 'fi', 'else', 'ifpdf', 'newcount', 'newif', 'printglossaries', 'printglossary',
  'usetkzobj', 'psset', 'schemestart', 'schemestop', 'setatomsep', 'setchemfig', 'definesubmol', 'tikzstyle', 'pgfkeys', 'pgfmathsetmacro', 'pgfmathdeclarefunction', 'pgfdeclarelayer', 'pgfsetlayers',
  'usepgfplotslibrary', 'newglossaryentry', 'loadglsentries', 'makeglossaries', 'DTLloaddb', 'DTLloadrawdb', 'lstdefinestyle', 'colorlet',
  'thispagestyle', 'hline', 'cline', 'rowcolors', 'arrayrulecolor', 'columncolor', 'cellcolor', 'rowcolor', 'toprule', 'midrule', 'bottomrule', 'FloatBarrier', 'balance', 'tightlist',
  // CJK's font settings, and bidi's switches of direction (Builder.declDir reads those first)
  'CJKfamily', 'CJKtilde', 'CJKindent', 'setRTL', 'setLTR', 'setRL', 'setLR',
  // TeX's paragraph registers and setspace's and memoir's spacing (B2: Builder.flow reads them)
  'hangindent', 'hangafter', 'displaywidowpenalty', 'interlinepenalty', 'linepenalty', 'hyphenpenalty', 'exhyphenpenalty',
  'tolerance', 'pretolerance', 'emergencystretch', 'looseness', 'leftskip', 'rightskip', 'OnehalfSpacing', 'DoubleSpacing', 'SingleSpacing', 'setSpacing'
]);
const CITE_CMDS = new Set(['cite', 'citet', 'citep', 'citealt', 'citealp', 'citeauthor', 'citeyear', 'citeyearpar',
  'Citet', 'Citep', 'Citealt', 'Citealp', 'Citeauthor', 'textcite', 'parencite', 'autocite', 'Textcite',
  'Parencite', 'Autocite', 'footcite', 'smartcite', 'citenum']);
const REF_CMDS = new Set(['ref', 'eqref', 'pageref', 'cref', 'Cref', 'autoref', 'nameref', 'vref', 'Vref', 'labelcref']);
const SECTIONS = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
// memoir's \setsecnumdepth{…} names
const SECDEPTH = { ...SECTIONS, book: -2, none: -10, all: 10 };
// commands that end a line of text: an environment followed by one stands alone (Builder.flow)
const BLOCK_CMDS = /^(par|item|maketitle|tableofcontents|listoffigures|listoftables|newpage|clearpage|cleardoublepage|pagebreak|appendix|frontmatter|mainmatter|backmatter|bibliography|printbibliography|bigskip|medskip|smallskip|vspace|input|include|subfile|hrule|caption|captionof)$/;
const LIST_ENVS = new Set(['itemize', 'enumerate', 'description', 'compactitem', 'compactenum', 'inparaenum', 'asparaenum', 'enumerate*', 'itemize*', 'description*']);
const DEFAULT_THMS = {
  theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition',
  assumption: 'Assumption', remark: 'Remark', example: 'Example', claim: 'Claim', conjecture: 'Conjecture',
  hypothesis: 'Hypothesis', axiom: 'Axiom', fact: 'Fact', observation: 'Observation', notation: 'Notation',
  condition: 'Condition', problem: 'Problem', exercise: 'Exercise', question: 'Question', result: 'Result',
  thm: 'Theorem', lem: 'Lemma', prop: 'Proposition', cor: 'Corollary', defn: 'Definition', dfn: 'Definition',
  assump: 'Assumption', rem: 'Remark', ex: 'Example', conj: 'Conjecture', property: 'Property'
};
const SIZE_SETS = {
  10: { tiny: 0.5, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 },
  11: { tiny: 0.548, scriptsize: 0.731, footnotesize: 0.822, small: 0.913, normalsize: 1, large: 1.096, Large: 1.315, LARGE: 1.578, huge: 1.894, Huge: 2.272 },
  12: { tiny: 0.5, scriptsize: 0.667, footnotesize: 0.833, small: 0.9125, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.074 },
  // extsizes' (extarticle, extreport, extbook: size8.clo to size20.clo)
  8: { tiny: 0.625, scriptsize: 0.625, footnotesize: 0.75, small: 0.875, normalsize: 1, large: 1.25, Large: 1.369, LARGE: 1.5, huge: 1.8, Huge: 2.16 },
  9: { tiny: 0.556, scriptsize: 0.667, footnotesize: 0.778, small: 0.889, normalsize: 1, large: 1.111, Large: 1.217, LARGE: 1.333, huge: 1.6, Huge: 1.92 },
  14: { tiny: 0.417, scriptsize: 0.556, footnotesize: 0.694, small: 0.833, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 },
  17: { tiny: 0.463, scriptsize: 0.579, footnotesize: 0.694, small: 0.833, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 },
  20: { tiny: 0.482, scriptsize: 0.579, footnotesize: 0.694, small: 0.833, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.073, Huge: 2.487 }
};
// a base size other than 10, 11 and 12pt: the size of its \normalsize, its \baselineskip, the
// widest text, the paragraph indent and a footnote's \baselineskip, as extsizes sets them (KOMA's
// fontsize=13pt and the like: in proportion to 12pt)
const EXT = { 8: { fs: 8, bs: 9.5, tw: 330, pi: 12, fnbs: 7 }, 9: { fs: 9, bs: 11, tw: 330, pi: 14, fnbs: 8 }, 14: { fs: 14.4, bs: 17, tw: 430, pi: 21.6, fnbs: 12 },
  17: { fs: 17.28, bs: 22, tw: 480, pi: 25.9, fnbs: 14 }, 20: { fs: 20.74, bs: 25, tw: 480, pi: 31.1, fnbs: 17 } };
export const extSize = (pt) => EXT[pt] || (pt > 0 && !SIZE_SETS[pt] ? { fs: pt, bs: Math.round(pt * 1.2 * 10) / 10, tw: Math.min(480, Math.round(390 * pt / 12)), pi: 1.5 * pt, fnbs: Math.round(pt * 0.85 * 1.2) } : null);
const FN_SYMS = ['*', '†', '‡', '§', '¶', '‖', '**', '††', '‡‡'];
const isWS = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

function roman(n) {
  const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}
const alph = (n) => (n >= 1 && n <= 26 ? String.fromCharCode(96 + n) : String(n));

function parseLen(s, em = 10) {
  // returns length in pt, or null
  const m = /^\s*(-?[\d.]+)\s*(pt|em|ex|in|cm|mm|bp|pc|dd|cc|sp)?/.exec(s || '');
  if (!m) {
    if (/\\(text|line|column)width/.test(s || '')) { const f = /^\s*([\d.]*)/.exec(s)[1]; return { rel: f ? parseFloat(f) : 1 }; }
    return null;
  }
  const v = parseFloat(m[1]);
  const u = m[2] || 'pt';
  const k = { pt: 1, em, ex: em * 0.43, in: 72.27, cm: 28.45, mm: 2.845, bp: 1.00375, pc: 12, dd: 1.07, cc: 12.84, sp: 1 / 65536 }[u];
  const rest = (s || '').slice(m[0].length);
  if (/^\s*\\(text|line|column)width/.test(rest)) return { rel: v };
  return v * k;
}

// (B2) where a paragraph's first and last characters on the page come from in the source: the
// first and last of its items that has a place there (a macro's own text has none)
function visEdges(inl) {
  const at = (x, end) => {
    if (!x) return null;
    if (x.k === 'seg') { if (x.ph || !x.map || !x.map.length) return null; const v = end ? x.map[x.map.length - 1] : x.map[0]; return v >= 0 ? v : null; }
    const v = end ? x.e : x.s;
    return typeof v === 'number' && v >= 0 ? v : null;
  };
  let a = null, z = null;
  for (let i = 0; i < inl.length && a == null; i++) a = at(inl[i], false);
  for (let i = inl.length - 1; i >= 0 && z == null; i--) z = at(inl[i], true);
  return a != null && z != null && z >= a ? [a, z] : null;
}

// (B2) a list of options split at its commas outside braces, and a value's braces taken off
function splitTop(t) {
  const out = [];
  let d = 0, a = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++;
    else if (c === '}') d = Math.max(0, d - 1);
    else if (c === ',' && d === 0) { out.push(t.slice(a, i)); a = i + 1; }
  }
  out.push(t.slice(a));
  return out;
}
const unbrace = (t) => (t[0] === '{' && t[t.length - 1] === '}' ? t.slice(1, -1).trim() : t);
// (B2) xcolor's mix of red, green and blue in 255ths, as More colors writes an HTML colour:
// rgb,255:red,231;green,84;blue,128 -> #E75480
function mixColor(t) {
  const m = /^rgb\s*,\s*255\s*:\s*red\s*,\s*(\d{1,3})\s*;\s*green\s*,\s*(\d{1,3})\s*;\s*blue\s*,\s*(\d{1,3})$/.exec(String(t).trim());
  if (!m || [m[1], m[2], m[3]].some((x) => +x > 255)) return null;
  return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0').toUpperCase()).join('');
}

// (B2) line spacing declared in the body, and TeX's register assignments that are no text
// (B2) what a list's environment (quote, adjustwidth, itemize, a theorem) and a box's (tcolorbox,
// minipage) set for their paragraphs: no alignment from around them, as TeX's \list and
// \@parboxrestore set none (a center around a quote centres nothing in it)
const FLUSH = { align: null, flushAll: false };
const SPACING_ENV = { singlespace: 1, 'singlespace*': 1, SingleSpace: 1, onehalfspace: 'h', OnehalfSpace: 'h', doublespace: 'd', DoubleSpace: 'd', spacing: 'x', Spacing: 'x' };
const SPACING_DECL = new Set(['onehalfspacing', 'doublespacing', 'singlespacing', 'OnehalfSpacing', 'DoubleSpacing', 'SingleSpacing']);
const ASSIGN = new Set(['hangindent', 'hangafter', 'parindent', 'parskip', 'widowpenalty', 'clubpenalty', 'displaywidowpenalty', 'interlinepenalty', 'linepenalty',
  'hyphenpenalty', 'exhyphenpenalty', 'tolerance', 'pretolerance', 'emergencystretch', 'looseness', 'leftskip', 'rightskip']);
const ASSIGN_VALUE = /^[ \t]*=?[ \t]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:pt|bp|mm|cm|in|pc|dd|cc|sp|em|ex)?) ?/;
// setspace's stretch for one and a half and double spacing at 10, 11 and 12 pt (memoir's too)
const ONEHALF = { 10: 1.25, 11: 1.213, 12: 1.241 }, DOUBLE = { 10: 1.667, 11: 1.618, 12: 1.655 };
// the alignment a group {\centering ...\par} gives its paragraph: the declaration first in it,
// and a \par before it closes (else the paragraph ends after the group, without it)
function groupDecl(g, ctx) {
  const ns = g.nodes || [];
  const first = ns.find((n) => !(n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) && n.t !== 'comment');
  if (!first || first.t !== 'cmd' || !['centering', 'raggedright', 'raggedleft'].includes(first.name)) return null;
  const last = [...ns].reverse().find((n) => !(n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) && n.t !== 'comment');
  if (!last || !(last.t === 'par' || (last.t === 'cmd' && last.name === 'par'))) return null;
  return first.name === 'centering' ? 'center' : first.name === 'raggedright' ? 'left' : 'right';
}

// ---------------------------------------------------------------------------
// One pass when the previous result's labels and citations still hold;
// otherwise a second pass resolves forward references.
// whether a command of that name is anywhere in the nodes
function hasCmd(ns, name) {
  for (const n of ns) {
    if (n.t === 'cmd' && n.name === name) return true;
    if (n.nodes && hasCmd(n.nodes, name)) return true;
    if (n.args) for (const a of n.args) if (a && a.nodes && hasCmd(a.nodes, name)) return true;
  }
  return false;
}

// A colour given by its numbers, as xcolor's HTML, RGB and rgb models write one: "#RRGGBB", or
// null. The text is the document's, maybe a stranger's: only digits in range make a colour, and
// nothing else of it reaches the page's styles.
export function colorValue(model, spec) {
  model = String(model || '').trim();
  spec = String(spec || '').trim();
  if (model === 'HTML') return /^[0-9a-fA-F]{6}$/.test(spec) ? '#' + spec.toUpperCase() : null;
  const v = spec.split(',').map((x) => x.trim());
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  if (model === 'RGB' && v.length === 3 && v.every((x) => /^\d{1,3}$/.test(x) && +x <= 255)) return '#' + v.map((x) => hex(+x)).join('');
  if (model === 'rgb' && v.length === 3 && v.every((x) => /^(0|1|0?\.\d{1,6}|1\.0{1,6})$/.test(x))) return '#' + v.map((x) => hex(+x * 255)).join('');
  return null;
}

// The values of a .csv for the page (B7): its first 200 lines of words, 40 values a line, a value
// cut at 200 characters and a line read to 4000; each file read once per separator (a file
// unchanged is the same string, found again in the cache without reading it)
const CSV_CACHE = new Map(), CSV_BUDGET = 40000;
function csvRows(text, sep) {
  let bySep = CSV_CACHE.get(sep);
  if (!bySep) CSV_CACHE.set(sep, (bySep = new Map()));
  const hit = bySep.get(text);
  if (hit) return hit;
  const rows = [];
  for (let p = 0; p < text.length && rows.length < 200;) {
    let e = text.indexOf('\n', p);
    if (e < 0) e = text.length;
    const l = text.slice(p, Math.min(e, p + 4000)).replace(/\r$/, '');
    p = e + 1;
    if (!l.trim()) continue;
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < l.length && out.length < 40; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    rows.push(out.slice(0, 40).map((x) => { x = x.trim(); return x.length > 200 ? x.slice(0, 200) + '…' : x; }));
  }
  if (bySep.size >= 8) bySep.delete(bySep.keys().next().value);
  bySep.set(text, rows);
  return rows;
}

export function buildModel(project, hint) {
  if (hint && hint.labels) {
    const b = new Builder(project, hint);
    b.run();
    const r = b.result();
    if (sameRefs(hint, r)) return r;
    const b2 = new Builder(project, b);
    b2.run();
    return b2.result();
  }
  const p1 = new Builder(project, null);
  p1.run();
  const p2 = new Builder(project, p1);
  p2.run();
  return p2.result();
}

function sameRefs(a, b) {
  if (a.nociteAll !== b.nociteAll) return false;
  if (a.cites.length !== b.cites.length || a.cites.some((x, i) => x !== b.cites[i])) return false;
  if (a.labels.size !== b.labels.size) return false;
  for (const [k, v] of b.labels) { const w = a.labels.get(k); if (!w || w.num !== v.num || w.kind !== v.kind || w.name !== v.name) return false; }
  if (a.headings.length !== b.headings.length) return false;
  for (let i = 0; i < a.headings.length; i++) { const x = a.headings[i], y = b.headings[i]; if (x.num !== y.num || x.text !== y.text || x.level !== y.level) return false; }
  return true;
}

const PARSE_CACHE = new Map();
// (B2) the parse the model made of a file's text, for the paragraph commands (src/parasrc.js
// unitOf): read again at every move of the caret, a long text would be parsed each time
export function parsedText(t) { for (const v of PARSE_CACHE.values()) if (v.text === t) return v.nodes; return null; }

class Builder {
  constructor(project, prev) {
    this.project = project;
    this.prev = prev;
    this.files = project.files; // Map name -> text
    this.labels = new Map();
    this.cites = [];
    this.citeSet = new Set();
    this.nociteAll = false;
    this.blocks = [];
    this.warn = [];
    this.headings = [];
    this.words = 0;
    this.thms = new Map();
    this.thmStyle = 'plain';
    this.within = {};
    this.c = { part: 0, section: 0, subsection: 0, subsubsection: 0, paragraph: 0, subparagraph: 0, equation: 0, figure: 0, table: 0, footnote: 0, thanks: 0 };
    this.thmc = new Map();
    this.appendix = false;
    // multicols environments met so far, by file: each one's paragraphs share its number as their
    // region (one that does not move as text is typed before it)
    this.mcCount = new Map();
    this.subeq = null;
    this.targets = [];
    this.lastTarget = null;
    this.textMacros = new Map();
    this.mathMacros = {};
    this.colors = new Map(); // \definecolor's names -> #RRGGBB
    this.inCell = 0;
    this.siOpts = {};
    this.siUnits = new Map();
    this.envDefs = new Map();
    this.meta = { title: null, author: null, date: null };
    this.bibFiles = [];
    this.bibEntries = new Map();
    this.thebib = null;
    this.depthLimit = 0;
    this.opts = {
      cls: 'article', paper: 'letter', pt: 10, margins: null, spread: 1, parskip: 0, parindent: null,
      lang: 'en', citeStyle: 'numeric', natbib: false, biblatex: false, bibstyle: 'plain', numberSecs: true,
      secnumdepth: 3, cleveref: false, twocolumn: false, titlepage: false, sort: true, aysep: ','
    };
    this.included = new Set();
    // the way text runs where the builder is: 'rtl' or 'ltr'. The main language sets it (run),
    // \selectlanguage and the language environments change it, a group or an environment ends
    // the change.
    this.dir = 'ltr';
  }

  // ---- setup ----------------------------------------------------------------
  run() {
    const main = this.project.main;
    const src = this.files.get(main) || '';
    const userSigs = {};
    // a widget's HTML is no TeX: its script's backslashes are not definitions
    for (const [n, t] of this.files) if (!WIDGET_FILE.test(n)) scanUserSigs(t, userSigs);
    this.userSigs = userSigs;
    this.parsed = new Map();
    const nodes = this.parseFile(main);
    let docEnv = nodes.find((n) => n.t === 'env' && n.name === 'document');
    this.collectBibItems(nodes, { f: main, src, pm: null });
    const ctx = { f: main, src, pm: null };
    this.mainCtx = ctx;
    if (docEnv) {
      const pre = nodes.slice(0, nodes.indexOf(docEnv));
      this.preamble(pre, ctx);
      // a document whose main language is Arabic, Hebrew or the like runs right to left as a whole
      this.opts.rtl = rtlDocument(src);
      this.dir = this.opts.rtl ? 'rtl' : 'ltr';
      this.collectDefs(docEnv.nodes, ctx);
      // at: where \begin{document} starts; closed: its \end{document} was found
      this.docBody = { s: docEnv.be, e: docEnv.es, at: docEnv.s, closed: docEnv.e > docEnv.es };
      this.top(docEnv.nodes, ctx);
    } else {
      this.fragment = true;
      this.preamble(nodes.filter((n) => n.t === 'cmd' && /^(documentclass|usepackage|newcommand|renewcommand|providecommand|def|DeclareMathOperator|newtheorem|theoremstyle|numberwithin|title|author|date|bibliographystyle|addbibresource|let)$/.test(n.name)), ctx);
      this.collectDefs(nodes, ctx);
      this.top(nodes, ctx);
    }
  }

  collectBibItems(nodes, ctx) {
    const walk = (ns) => {
      for (const nd of ns) {
        if (nd.t === 'env' && nd.name === 'thebibliography') {
          this.bibItems = new Map();
          let k = 0;
          for (const n of nd.nodes) {
            if (n.t === 'cmd' && n.name === 'bibitem') {
              k++;
              const key = this.argText(ctx, n.args[1]).trim();
              const lab = n.args[0] ? texToPlain(this.argText(ctx, n.args[0])) : '';
              const m = /^(.*?)\s*\((\d{4}[a-z]?|n\.d\.)\)/.exec(lab);
              this.bibItems.set(key, { num: k, author: m ? m[1].trim() : lab || key, year: m ? m[2] : '', hasAY: !!m });
            }
          }
        } else if (nd.t === 'env' && nd.nodes) walk(nd.nodes);
      }
    };
    walk(nodes);
  }

  parseFile(name) {
    if (this.parsed.has(name)) return this.parsed.get(name);
    const t = this.files.get(name) || '';
    const sigKey = this.userSigKey || (this.userSigKey = JSON.stringify(this.userSigs));
    const hit = PARSE_CACHE.get(name);
    if (hit && hit.text === t && hit.sig === sigKey) { this.parsed.set(name, hit.nodes); return hit.nodes; }
    const nodes = parse(t, { userSigs: this.userSigs });
    PARSE_CACHE.set(name, { text: t, sig: sigKey, nodes });
    this.parsed.set(name, nodes);
    return nodes;
  }

  argText(ctx, a) { return a ? ctx.src.slice(a.is, a.ie) : ''; }

  preamble(nodes, ctx) {
    const O = this.opts;
    this.preWalk(nodes, ctx, false);
    // the page: two sided by the class (a book is), its headers and footers, line numbers,
    // watermark, colour and border (src/pagesrc.js reads them; src/layout.js draws them)
    if (O.twoside == null) O.twoside = /^(book|scrbook|memoir)$/.test(O.cls);
    if (O.openright == null) O.openright = /^(book|scrbook|memoir)$/.test(O.cls) && O.twoside;
    O.page = this.pageSetup(ctx);
    O.chapters = /^(report|book|scrbook|scrreprt|memoir|amsbook|thesis|ociamthesis)$/.test(O.cls);
    // (B2) where a figure's or a table's parts stand when it says nothing: centred by beamer, the
    // AMS classes, revtex and acmart, by floatrow, and by \centering added to \@floatboxreset in
    // the preamble; at the left margin otherwise (a float's \parindent is 0)
    if (O.floatAlign !== 'center') {
      const pre = ctx.src.slice(0, Math.min(ctx.src.length, 400000)), k = pre.search(/\\begin\s*\{document\}/);
      const head = (k < 0 ? pre : pre.slice(0, k)).replace(/(^|[^\\])%[^\n]*/g, '$1');
      O.floatAlign = /^(beamer|amsart|amsbook|amsproc|revtex4|revtex4-1|revtex4-2|acmart)$/.test(O.cls) ||
        /\\(?:g@addto@macro|apptocmd|appto)\s*(?:\{\s*)?\\@floatboxreset\s*(?:\}\s*)?(?:\{\s*)?\\centering(?![A-Za-z])/.test(head) ||
        /\\(?:def|gdef)\s*\\@floatboxreset\s*\{[^{}]{0,300}\\centering(?![A-Za-z])/.test(head) ? 'center' : 'left';
    }
    // how the headings look: titlesec's lines, KOMA-Script's fonts (src/looks.js)
    O.koma = /^scr(artcl|reprt|book)$/.test(O.cls);
    O.heads = ctx.f === this.project.main ? readHeadLooks(ctx.src, O.cls) : {};
    // \paragraph and \subparagraph as the preamble or the project's own classes and packages set
    // them by \@startsection (a positive after skip: on a line of their own)
    O.secShapes = startsectionShapes([ctx.src.slice(0, 200000), ...[...this.files].filter(([n]) => /\.(sty|cls)$/.test(n)).slice(0, 10).map(([, t]) => t)]);
    // theorems made by thmtools, mdframed and llncs' own forms, drawn as TeX prints them (their
    // name=, numbered=no, sibling=); boxes and tcolorbox's theorems are no theorems here
    if (ctx.f === this.project.main) for (const t of thmMakersIn(ctx.src)) if (!this.thms.has(t.name)) this.thms.set(t.name, { title: t.title, counter: t.numbered ? t.sibling || t.name : null, style: t.style });
    if (O.chapters) {
      if (!O.secnumdepthSet) O.secnumdepth = 2;
      for (const k of ['equation', 'figure', 'table']) if (!this.within[k]) this.within[k] = 'chapter';
    }
    // (as the preamble leaves it: memoir's \mainmatter changes it again as the text is read)
    O.secnumdepthPre = O.secnumdepth;
    O.ext = extSize(O.pt);
    if (O.parindent == null) O.parindent = O.parskip ? 0 : ({ 10: 15, 11: 17, 12: 18 }[O.pt] || (O.ext ? O.ext.pi : 15));
    if (O.natbib && !O.forceNumeric) O.citeStyle = 'authoryear';
    if (O.biblatex) O.citeStyle = O.biblatexStyle === 'authoryear' ? 'authoryear' : 'numeric';
    if (['unsrt', 'unsrtnat', 'ieeetr', 'unsrt_abbrv'].includes(O.bibstyle)) O.sort = false;
    if (O.natbib && ['plain', 'unsrt', 'abbrv', 'alpha', 'ieeetr', 'siam', 'acm', 'amsplain', 'unsrtnat_num'].includes(O.bibstyle) && !O.forceAY) O.citeStyle = O.forceNumeric ? 'numeric' : O.citeStyle;
  }

  // The preamble's commands, here or in a file it reads: \input{preamble}, or a class or package
  // that comes with the project (own: thesis.cls, macros.sty), so that \E from macros.sty is known
  // on the page. From those only new names are taken (\newcommand, \DeclareMathOperator,
  // \newtheorem), and the project's other packages they load: TeX refuses \newcommand for a
  // command that exists, so none hides one of LaTeX's own. What else a copy of a journal's class
  // does (\title, counters, package options held in macros, \@internals) is left to TeX.
  preWalk(ns, c, own) {
    for (const nd of ns) {
      if (nd.t === 'group') this.preWalk(nd.nodes, c, own);
      else if (nd.t === 'env' && !nd.raw && nd.nodes) this.preWalk(nd.nodes, c, own);
      else if (nd.t !== 'cmd') continue;
      else if (nd.name === 'input' && nd.args[0]) this.preFile(this.resolveFile(this.argText(c, nd.args[0])), own);
      else if (!own) this.preCmd(nd, c);
      else if (nd.name === 'definecolor') this.defColor(nd, c);
      else if (nd.name === 'usepackage' || nd.name === 'RequirePackage') {
        for (const p of this.argText(c, nd.args[1]).split(',')) {
          if (this.files.has(p.trim() + '.sty')) this.preFile(p.trim() + '.sty', true);
          // (the project's own class or package may load what lays out the page or sets its sheet)
          if (p.trim() === 'geometry') this.geometry(this.argText(c, nd.args[0]));
          if (!this.files.has(p.trim() + '.sty') && setsMedia(p.trim(), optsOf(this.argText(c, nd.args[0])))) this.opts.media = true;
        }
      } else if (/^(newcommand|providecommand|newenvironment|DeclareMathOperator|newtheorem|theoremstyle|numberwithin)$/.test(nd.name) &&
        !(nd.def && (nd.def.bs < 0 || /@/.test(c.src.slice(nd.s, nd.def.bs > 0 ? nd.def.bs : nd.e))))) this.defCmd(nd, c);
    }
  }

  preFile(f, own) {
    if (!f || this.included.has('pre:' + f)) return;
    this.included.add('pre:' + f);
    this.preWalk(this.parseFile(f), { f, src: this.files.get(f) || '', pm: null }, own);
  }

  classOpts(list) {
    const O = this.opts;
    for (const o of list.split(',').map((x) => x.trim())) {
      if (/^(10|11|12)pt$/.test(o)) O.pt = parseInt(o, 10);
      // extarticle and its kin (and memoir, beamer) take more sizes; KOMA's fontsize= any
      else if (/^(8|9|14|17|20)pt$/.test(o) && /^(ext(article|report|book|letter|proc)|memoir|beamer)$/.test(O.cls)) O.pt = parseInt(o, 10);
      else if (/^fontsize\s*=\s*\d+(\.\d+)?pt$/.test(o) && /^scr/.test(O.cls)) O.pt = parseFloat(o.split('=')[1]);
      if (paperName(o)) { O.paper = paperName(o); O.paperByClass = true; }
      if (o === 'twocolumn') O.twocolumn = true;
      if (o === 'onecolumn') O.twocolumn = false;
      // the page's sides and its orientation (src/layout.js lays the page out from them)
      if (o === 'landscape') O.landscape = true;
      if (o === 'twoside') O.twoside = true;
      if (o === 'oneside') O.twoside = false;
      if (o === 'openright') O.openright = true;
      if (o === 'openany') O.openright = false;
      if (o === 'titlepage') O.titlepage = true;
      if (o === 'notitlepage') O.notitlepage = true;
      if (/^(ngerman|german|austrian|naustrian)$/.test(o)) O.lang = 'de';
      if (/^spanish$/.test(o)) O.lang = 'es';
      if (/^(french|francais)$/.test(o)) O.lang = 'fr';
    }
  }

  preCmd(nd, ctx) {
    const O = this.opts;
    const A = (k) => this.argText(ctx, nd.args[k]);
    switch (nd.name) {
      case 'definecolor': this.defColor(nd, ctx); break;
      case 'documentclass': {
        O.cls = A(1).trim() || 'article';
        this.classOpts(A(0));
        // a class that comes with the project and loads a standard one (\LoadClass{book}) is laid
        // out as that one: chapters, numbered 1.1. Its own new commands are known too.
        for (let k = 0; k < 4 && this.files.has(O.cls + '.cls'); k++) {
          const own = O.cls + '.cls';
          this.preFile(own, true);
          const m = /\\LoadClass(?:WithOptions)?\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}/.exec(this.files.get(own).replace(/(^|[^\\])%.*$/gm, '$1'));
          if (!m || !(/^(article|report|book|scrartcl|scrreprt|scrbook|memoir|amsbook)$/.test(m[2].trim()) || this.files.has(m[2].trim() + '.cls'))) break;
          O.cls = m[2].trim();
          this.classOpts(m[1] || '');
        }
        if (/^(amsart|amsbook)$/.test(O.cls)) O.ams = true;
        // KOMA's classes (typearea), memoir, beamer, IEEEtran, elsarticle and acmart set the PDF's
        // sheet themselves (src/pagesrc.js pageMode)
        if (!NO_MEDIA_CLASSES.has(O.cls)) O.media = true;
        // (KOMA's paper=a5 and paper=landscape)
        for (const x of (/(?:^|,)\s*paper\s*=\s*([A-Za-z0-9:]+)/.exec(A(0)) || ['', ''])[1].split(':')) {
          if (paperName(x + 'paper')) { O.paper = paperName(x + 'paper'); O.paperByClass = true; }
          if (x === 'landscape') O.landscape = true;
        }
        // (KOMA-Script's paper where none is given: A4)
        if (KOMA_CLASS.test(O.cls) && !O.paperByClass) O.paper = 'a4';
        // (B2) KOMA-Script's own space between paragraphs: half a line or a whole one, no indent
        if (/^scr(?:artcl|reprt|book)$/.test(O.cls)) {
          const m = /(?:^|,)\s*parskip\s*=\s*(full|half)/.exec(A(0));
          if (m) { O.parskip = m[1] === 'full' ? 1.2 : 0.6; O.parindent = 0; }
        }
        break;
      }
      case 'usepackage': case 'RequirePackage': {
        const pk = A(1).split(',').map((x) => x.trim());
        const op = A(0);
        for (const p of pk) {
          if (p === 'siunitx') Object.assign(this.siOpts, siOptions(op));
          if (p === 'natbib') {
            O.natbib = true;
            if (/numbers/.test(op)) O.forceNumeric = true;
            if (/authoryear/.test(op)) O.forceAY = true;
          }
          if (p === 'biblatex') {
            O.biblatex = true;
            O.biblatexStyle = /style\s*=\s*(authoryear|apa|chicago|ext-authoryear)/.test(op) ? 'authoryear' : 'numeric';
            // natbib=true gives biblatex natbib's \citep and \citet; without it they are undefined
            O.biblatexNatbib = /\bnatbib\b(?!\s*=\s*false)/.test(op);
          }
          if (this.files.has(p + '.sty')) this.preFile(p + '.sty', true);
          if (p === 'apacite' || p === 'harvard' || p === 'chicago') { O.natbib = true; O.forceAY = true; }
          if (p === 'setspace') { /* spacing commands handled separately */ }
          if (p === 'floatrow') O.floatAlign = 'center';
          if (p === 'parskip') {
            // (B2) its skip option: \usepackage[skip=6pt]{parskip}
            const sk = /(?:^|,)\s*skip\s*=\s*([^,]{1,40})/.exec(op), v = sk ? parseLen(sk[1].replace(/\s+(?:plus|minus).*$/, ''), O.pt) : null;
            O.parskip = typeof v === 'number' ? v / O.pt : 0.6; O.parindent = 0;
          }
          if (p === 'cleveref') { O.cleveref = true; O.crefCap = /capitali[sz]e/.test(op); }
          if (p === 'fullpage') O.margins = { l: 72.27, r: 72.27, t: 72.27, b: 72.27 };
          // (geometry with no options lays the page out by its own defaults; with pass it leaves
          // the class's layout and only sets the PDF's sheet)
          if (p === 'geometry') this.geometry(op);
          // what sets the PDF's sheet to LaTeX's paper: without any of it TeX Live's sheet is A4
          // (src/pagesrc.js mediaSet)
          if (!this.files.has(p + '.sty') && setsMedia(p, optsOf(op))) O.media = true;
          // (typearea's paper is A4 where the class's options give none)
          if (p === 'typearea' && !O.paperByClass) O.paper = 'a4';
          if (p === 'babel') {
            const langs = op.split(',').map((x) => x.trim()).filter(Boolean);
            const last = langs[langs.length - 1] || 'english';
            O.lang = /german|ngerman|austrian/.test(last) ? 'de' : /spanish/.test(last) ? 'es' : /french/.test(last) ? 'fr' : 'en';
          }
          if (p === 'times' || p === 'mathptmx' || p === 'newtxtext' || p === 'tgtermes' || p === 'txfonts') O.font = 'times';
          if (p === 'palatino' || p === 'mathpazo' || p === 'newpxtext' || p === 'tgpagella' || p === 'pxfonts') O.font = 'palatino';
          // (Helvetica as the sans serif only: the text stays in the serif without \familydefault)
          if (p === 'helvet' || p === 'tgheros') O.sans = 'helvetica';
          if (p === 'XCharter' || p === 'charter' || p === 'charterbt') O.font = 'charter';
          if (p === 'tgschola' || p === 'newcent') O.font = 'schola';
          if (p === 'tgbonum' || p === 'bookman') O.font = 'bookman';
          if (p === 'kpfonts') O.font = 'kp';
          if (p === 'lmodern') O.font = '';
        }
        break;
      }
      case 'geometry': this.geometry(A(0)); break;
      // (the kernel's PDF management sets the PDF's sheet from the paper)
      case 'DocumentMetadata': O.media = true; break;
      // (the numbers' format from the first page: \pagenumbering{gobble} in the preamble prints none)
      case 'pagenumbering': O.numbering = A(0).trim(); break;
      case 'onehalfspacing': O.spread = { 10: 1.25, 11: 1.213, 12: 1.241 }[O.pt] || 1.25; break;
      case 'doublespacing': O.spread = { 10: 1.667, 11: 1.618, 12: 1.655 }[O.pt] || 1.65; break;
      case 'singlespacing': O.spread = 1; break;
      case 'OnehalfSpacing': O.spread = ONEHALF[O.pt] || 1.25; break;
      case 'DoubleSpacing': O.spread = DOUBLE[O.pt] || 1.667; break;
      case 'SingleSpacing': O.spread = 1; break;
      case 'setSpacing': O.spread = parseFloat(A(0)) || 1; break;
      case 'abnormalparskip': { const v = parseLen(A(0), O.pt); if (typeof v === 'number') O.parskip = v / O.pt; break; }
      case 'nonzeroparskip': O.parskip = 0.6; break;
      case 'linespread': O.spread = parseFloat(A(0)) || 1; break;
      case 'setstretch': O.spread = parseFloat(A(0)) || 1; break;
      case 'setlength': {
        const what = A(0).trim(); const len = parseLen(A(1), O.pt);
        if (what === '\\parindent' && typeof len === 'number') O.parindent = len;
        if (what === '\\parskip' && typeof len === 'number') O.parskip = len / O.pt;
        break;
      }
      case 'bibliographystyle': O.bibstyle = A(0).trim(); break;
      case 'setcitestyle': if (/numbers/.test(A(0))) O.forceNumeric = true; if (/authoryear/.test(A(0))) O.forceAY = true; if (/aysep=\{\}/.test(A(0))) O.aysep = ''; break;
      case 'addbibresource': this.bibFiles.push(A(1).trim()); break;
      case 'title': this.meta.title = { nd, ctx, a: nd.args[1] }; break;
      case 'author': this.meta.author = { nd, ctx, a: nd.args[1] }; break;
      case 'date': this.meta.date = { nd, ctx, a: nd.args[0] }; break;
      case 'setcounter': if (A(0).trim() === 'secnumdepth') { O.secnumdepth = parseInt(A(1), 10); O.secnumdepthSet = true; } else if (A(0).trim() === 'maxsecnumdepth') O.maxsecnumdepth = parseInt(A(1), 10); break;
      // memoir's own: by a sectioning name, none or all
      case 'setsecnumdepth': { const v = SECDEPTH[A(0).trim()]; if (v != null) { O.secnumdepth = v; O.secnumdepthSet = true; } break; }
      case 'maxsecnumdepth': { const v = SECDEPTH[A(0).trim()]; if (v != null) O.maxsecnumdepth = v; break; }
      // fontspec's main font, by its name (the page has a look for the common ones)
      case 'setmainfont': { const a = nd.args.filter((x) => x && !x.o).pop(); if (a) O.font = (fontLook(this.argText(ctx, a)) || '').replace('serif', ''); break; }
      default:
        // \renewcommand{\familydefault}{\sfdefault}: the document in its sans serif
        if (nd.def && nd.def.name === 'familydefault') O.font = /\\sfdefault\b/.test(nd.def.body) ? 'sans' : /\\ttdefault\b/.test(nd.def.body) ? 'mono' : O.font;
        // (B2) \renewcommand{\baselinestretch}{1.5}: the stretch, and the macro as any other
        if (nd.def && nd.def.name === 'baselinestretch' && parseFloat(nd.def.body) > 0) O.spread = parseFloat(nd.def.body);
        this.defCmd(nd, ctx);
    }
  }

  // geometry's keys, as \usepackage[...]{geometry} and each \geometry{...} give them, the later
  // winning: src/layout.js works the page out from them as geometry does
  geometry(op) {
    const O = this.opts;
    O.geometry = true;
    O.media = true;
    op = op || '';
    const kv = O.geo || (O.geo = {});
    // (commas inside braces stay in their value: hmargin={1cm,2cm})
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i < op.length && i < 4000; i++) {
      const c = op[i];
      if (c === '{') depth++; else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === ',' && !depth) { parts.push(op.slice(start, i)); start = i + 1; }
    }
    parts.push(op.slice(start, 4000));
    for (const part of parts.slice(0, 200)) {
      const q = part.indexOf('=');
      const k = (q < 0 ? part : part.slice(0, q)).replace(/%[^\n]*/g, '').trim(), v = q < 0 ? true : part.slice(q + 1).trim();
      if (!k) continue;
      // another paper size takes the place of the one before
      if (paperName(k) || k === 'paper' || k === 'papername') for (const x of Object.keys(kv)) if (paperName(x) || /^paper(name|width|height)?$/.test(x)) delete kv[x];
      if (k === 'landscape') delete kv.portrait;
      if (k === 'portrait') delete kv.landscape;
      kv[k] = v;
    }
    // pass: geometry leaves the class's text block and every key alone (src/layout.js)
    O.geoPass = kv.pass === true;
  }

  // The page's set up beyond its size, read once for each preamble (it is the same at most keys)
  pageSetup(ctx) {
    const others = [];
    for (const k of this.included) if (k.startsWith('pre:')) others.push(this.files.get(k.slice(4)) || '');
    const end = this.files.get(ctx.f) === ctx.src ? ctx.src.search(/\\begin\s*\{document\}/) : -1;
    const key = (end < 0 ? ctx.src.slice(0, 200000) : ctx.src.slice(0, end)) + '\u0000' + others.join('\u0000');
    if (PAGE_CACHE.key === key && PAGE_CACHE.lineAt === ctx.src.indexOf('\\linenumbers')) return PAGE_CACHE.value;
    let value = null;
    try { value = readPage(ctx.src, others); } catch (e) { value = null; }
    if (value && value.color) {
      // a colour of the document's own, or one given by its numbers, as #RRGGBB
      value.color.css = value.color.model ? colorValue(value.color.model, value.color.color) : this.colors.get(value.color.color) || value.color.color;
    }
    PAGE_CACHE.key = key; PAGE_CACHE.lineAt = ctx.src.indexOf('\\linenumbers'); PAGE_CACHE.value = value;
    return value;
  }

  collectDefs(nodes, ctx) {
    const walk = (ns, c) => {
      for (const nd of ns) {
        if (nd.t === 'cmd') {
          if (nd.name === 'input' || nd.name === 'include' || nd.name === 'subfile') {
            const f = this.resolveFile(this.argText(c, nd.args[0]));
            if (f && !this.included.has('defs:' + f)) {
              this.included.add('defs:' + f);
              walk(this.parseFile(f), { f, src: this.files.get(f), pm: null });
            }
          } else this.defCmd(nd, c);
          for (const a of nd.args) if (a && a.nodes) walk(a.nodes, c);
        } else if (nd.t === 'group') walk(nd.nodes, c);
        else if (nd.t === 'env' && nd.nodes) walk(nd.nodes, c);
      }
    };
    walk(nodes, ctx);
  }

  // \definecolor{name}{HTML}{C00000}: the name stands for that colour on the page
  defColor(nd, ctx) {
    const name = this.argText(ctx, nd.args[0]).trim();
    const v = colorValue(this.argText(ctx, nd.args[1]), this.argText(ctx, nd.args[2]));
    if (name && v) this.colors.set(name, v);
  }

  // the colour of \textcolor[model]{spec} and the like, for the page: #RRGGBB where the document
  // gives numbers or a name of its own, else the text as written (render.js knows xcolor's names)
  colorArg(ctx, opt, val) {
    const spec = this.argText(ctx, val).trim();
    if (opt) return colorValue(this.argText(ctx, opt), spec) || spec;
    // (xcolor's dvipsnames, BrickRed and the like, which the Font Color picker writes: as the
    // values they print in, for the page and for Word)
    return this.named(spec) || (Object.hasOwn(DVIPS, spec) ? '#' + DVIPS[spec] : spec);
  }

  // a name of the document's own; used, so the block is drawn again when its \definecolor changes
  named(name) {
    const v = this.colors.get(name);
    if (v) this.use('c' + name + v);
    return v;
  }

  defCmd(nd, ctx) {
    const A = (k) => this.argText(ctx, nd.args[k]);
    if (nd.name === 'definecolor') { this.defColor(nd, ctx); return; }
    if (nd.def && nd.def.kind === 'cmd') {
      const d = nd.def;
      this.textMacros.set(d.name, { nargs: d.nargs, dflt: d.dflt, body: d.body });
      // KaTeX counts a string macro's arguments as #1, #2, ... up to the first one missing, so a body
      // that skips one (\newcommand{\second}[2]{#2}) would take none: those expand here instead
      let seen = 0;
      while (d.body.replace(/##/g, '').includes('#' + (seen + 1))) seen++;
      if (d.dflt == null && seen === d.nargs) this.mathMacros['\\' + d.name] = d.body;
      else this.mathMacros['\\' + d.name] = { opt: d.dflt != null, nargs: d.nargs, dflt: d.dflt, body: d.body };
    } else if (nd.def && nd.def.kind === 'let') {
      this.mathMacros['\\' + nd.def.name] = nd.def.body;
    } else if (nd.def && nd.def.kind === 'env') {
      this.envDefs.set(nd.def.name, nd.def);
    } else if (nd.def && nd.def.kind === 'op') {
      const nm = A(0).trim();
      this.mathMacros[nm] = '\\operatorname' + (nd.star ? '*' : '') + '{' + A(1) + '}';
    } else if (nd.name === 'sisetup') {
      Object.assign(this.siOpts, siOptions(A(0)));
    } else if (nd.name === 'DeclareSIUnit') {
      const nm = A(1).trim().replace(/^\\/, '');
      if (/^[A-Za-z]+$/.test(nm)) this.siUnits.set(nm, siUnitSymbol(A(2)));
    } else if (nd.name === 'theoremstyle') {
      this.thmStyle = A(0).trim();
    } else if (nd.name === 'newtheorem') {
      const name = A(0).trim();
      if (nd.star) this.thms.set(name, { title: texToPlain(A(1)), counter: null, style: this.thmStyle });
      else {
        const shared = nd.args[1] ? A(1).trim() : null;
        const title = texToPlain(A(2));
        const within = nd.args[3] ? A(3).trim() : null;
        this.thms.set(name, { title, counter: shared || name, style: this.thmStyle });
        if (within && !shared) this.within[name] = within;
      }
    } else if (nd.name === 'numberwithin') {
      this.within[A(1).trim()] = A(2).trim();
    }
  }

  resolveFile(name) {
    name = (name || '').trim();
    if (!name) return null;
    const cands = [name, name + '.tex', name.replace(/^\.\//, ''), name.replace(/^\.\//, '') + '.tex'];
    for (const c of cands) if (this.files.has(c)) return c;
    const base = name.split('/').pop();
    for (const [k] of this.files) if (k.endsWith('/' + base) || k.endsWith('/' + base + '.tex') || k === base + '.tex') return k;
    return null;
  }

  // ---- direction -------------------------------------------------------------
  // The direction an item, a footnote or a table's cells get on the page: none where nothing
  // runs right to left, so a document without such text is drawn exactly as it always was.
  dirOf() { return this.dir === 'rtl' || this.opts.rtl ? this.dir : undefined; }

  // A command that sets the direction of its argument: babel's \foreignlanguage{arabic}{..} and
  // \babelsublr{..}, polyglossia's \textarabic{..}, bidi's \RL{..} and \LR{..} (xepersian
  // writes them \rl and \lr). Returns [direction, argument], or null for any other command, a
  // language the page does not know and a name the document defines itself (\LR for a
  // likelihood ratio).
  dirCmd(nd, ctx) {
    const name = nd.name;
    if (this.textMacros.has(name)) return null;
    let d = null, a = null;
    if (name === 'foreignlanguage') { d = languageDir(this.argText(ctx, nd.args[1])); a = nd.args[2]; }
    else {
      const m = /^text([a-z]+)$/.exec(name);
      d = name === 'RL' || name === 'rl' ? 'rtl' : name === 'LR' || name === 'lr' || name === 'babelsublr' ? 'ltr' : m ? languageDir(m[1]) : null;
      if (d) a = nd.args.filter((x) => x && !x.o).pop();
    }
    return d && a && a.nodes && !a.raw ? [d, a] : null;
  }

  // A command that sets the direction of what follows it, up to the end of its group or
  // environment: \selectlanguage{arabic}, bidi's \setRTL and \setLTR. 'rtl', 'ltr' or null.
  declDir(nd, ctx) {
    const name = nd.name;
    if (name === 'selectlanguage') return languageDir(this.argText(ctx, nd.args[0]));
    if (this.textMacros.has(name)) return null;
    return name === 'setRTL' || name === 'setRL' ? 'rtl' : name === 'setLTR' || name === 'setLR' ? 'ltr' : null;
  }

  // An environment that only sets the language, the direction or CJK's font of its text:
  // babel's otherlanguage, polyglossia's Arabic, hebrew or english, bidi's RTL and LTR, CJK.
  // Returns { dir } with 'rtl', 'ltr' or null (CJK and a language not known here change no
  // direction), or null for any other environment.
  dirEnv(nd, ctx) {
    const name = nd.name;
    if (nd.raw || !nd.nodes || this.envDefs.has(name) || this.thms.has(name)) return null;
    if (name === 'CJK' || name === 'CJK*') return { dir: null };
    if (name === 'otherlanguage' || name === 'otherlanguage*') return { dir: languageDir(this.argText(ctx, nd.args[0])) };
    if (name === 'RTL' || name === 'LTR') return { dir: name === 'RTL' ? 'rtl' : 'ltr' };
    const d = languageDir(name);
    return d ? { dir: d } : null;
  }

  // Whether nodes are words of one line: no paragraph break and nothing that stands as a block
  lineOnly(nodes, ctx) {
    return nodes.every((n) => n.t === 'comment' || n.t === 'text' || n.t === 'group' || n.t === 'special' || n.t === 'verb' || (n.t === 'math' && !n.display) ||
      (n.t === 'cmd' && !(n.name in SECTIONS) && !BLOCK_CMDS.test(n.name)) ||
      (n.t === 'env' && ((n.name === 'math' && n.raw) || (!!this.dirEnv(n, ctx) && this.lineOnly(n.nodes, ctx)))));
  }

  // ---- numbering -------------------------------------------------------------
  secNum(level) {
    const c = this.c;
    if (this.opts.chapters) {
      const ch = this.appendix ? (c.chapter > 0 ? String.fromCharCode(64 + c.chapter) : '0') : String(c.chapter);
      if (level === 0) return ch;
      if (level === 1) return ch + '.' + c.section;
      if (level === 2) return ch + '.' + c.section + '.' + c.subsection;
      if (level === 3) return ch + '.' + c.section + '.' + c.subsection + '.' + c.subsubsection;
      if (level === 4) return ch + '.' + c.section + '.' + c.subsection + '.' + c.subsubsection + '.' + c.paragraph;
      if (level === 5) return ch + '.' + c.section + '.' + c.subsection + '.' + c.subsubsection + '.' + c.paragraph + '.' + (c.subparagraph || 0);
      return '';
    }
    const top = this.appendix ? (c.section > 0 ? String.fromCharCode(64 + c.section) : '0') : String(c.section);
    if (level === 1) return top;
    if (level === 2) return top + '.' + c.subsection;
    if (level === 3) return top + '.' + c.subsection + '.' + c.subsubsection;
    if (level === 4) return top + '.' + c.subsection + '.' + c.subsubsection + '.' + c.paragraph;
    if (level === 5) return top + '.' + c.subsection + '.' + c.subsubsection + '.' + c.paragraph + '.' + (c.subparagraph || 0);
    return '';
  }
  withinPrefix(counter) {
    const w = this.within[counter];
    if (!w) return '';
    if (w === 'chapter') return this.secNum(0) + '.';
    if (w === 'section') return this.secNum(1) + '.';
    if (w === 'subsection') return this.secNum(2) + '.';
    return '';
  }
  stepSection(level) {
    const c = this.c;
    if (level === 0) { c.chapter = (c.chapter || 0) + 1; c.section = 0; c.subsection = 0; c.subsubsection = 0; c.paragraph = 0; }
    if (level === 1) { c.section++; c.subsection = 0; c.subsubsection = 0; c.paragraph = 0; }
    if (level === 2) { c.subsection++; c.subsubsection = 0; c.paragraph = 0; }
    if (level === 3) { c.subsubsection++; c.paragraph = 0; }
    if (level === 4) c.paragraph++;
    if (level <= 4) c.subparagraph = 0;
    if (level === 5) c.subparagraph = (c.subparagraph || 0) + 1;
    // reset counters numbered within
    for (const [cnt, w] of Object.entries(this.within)) {
      if ((w === 'chapter' && level === 0) || (w === 'section' && level <= 1) || (w === 'subsection' && level <= 2)) {
        if (cnt in c) c[cnt] = 0; else this.thmc.set(cnt, 0);
        for (const [nm, t] of this.thms) if (t.counter === cnt) this.thmc.set(cnt, 0);
      }
    }
  }
  eqNumber() {
    if (this.subeq) { this.subeq.n++; return this.subeq.base + alph(this.subeq.n); }
    this.c.equation++;
    return this.withinPrefix('equation') + this.c.equation;
  }
  label(key, ctx) {
    key = key.trim();
    const t = this.lastTarget || { num: '', kind: 'section' };
    if (!this.labels.has(key)) this.labels.set(key, { ...t, f: ctx.f });
  }
  lookupLabel(key) {
    key = key.trim();
    return this.labels.get(key) || (this.prev && this.prev.labels.get(key)) || null;
  }

  // ---- signatures for block reuse -------------------------------------------
  use(x) { if (this.sig) this.sig.push(String(x)); }

  // ---- top level ---------------------------------------------------------------
  top(nodes, ctx) {
    const units = this.flow(nodes, ctx, { top: true, afterHeading: false });
    for (const u of units) this.blocks.push(u);
  }

  // Flow: groups nodes into paragraphs and block elements. Returns units.
  // env: { top, depth, cls, align, list, thm, afterHeading, noindent, ctxKind }
  flow(nodes, ctx, env) {
    const units = [];
    let para = [];
    let paraNoIndent = env.noindent || false;
    let align = env.align || null;
    let cont = false; // continuing after display math
    // (B2) what declarations in this flow set for the paragraphs after them: the line spacing
    // (setspace's \onehalfspacing in the body), whether the first lines lose their indent (an
    // alignment declaration sets \parindent to 0), and what the next paragraph's own start sets
    // (\hangindent=1cm)
    let spread = env.spread ?? null;
    let flushStart = !!align;
    let hang = null;
    let afterHeading = env.afterHeading || false;
    const self = this;
    const startUnit = () => { if (env.top) this.sig = []; };
    let pendingSig = null;
    // nothing of it shows on the page
    const blank = (n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) || (n.t === 'cmd' && (INVIS.has(n.name) || n.name === 'label'));
    // A language, direction or CJK environment around some words of a line (text before it, or
    // after it before the paragraph ends) stays in that line, as TeX sets it; alone, or holding
    // paragraphs, it is a block of its own.
    // Whether the paragraph gathered so far shows anything. Each node is looked at once (seen
    // counts them; flushPara and \noindent start over): asked anew for every \selectlanguage,
    // 50 000 comment lines before 4 000 of those took over a second at every key.
    let seen = 0, shows = false;
    const paraShows = () => { for (; !shows && seen < para.length; seen++) if (!blank(para[seen])) shows = true; return shows; };
    const inLine = (nd, k) => {
      if (!this.lineOnly(nd.nodes, ctx)) return false;
      if (paraShows()) return true;
      for (let j = k + 1; j < nodes.length; j++) {
        const n = nodes[j];
        if (n.t === 'par') return false;
        if (!blank(n)) return this.lineOnly([n], ctx);
      }
      return false;
    };

    const flushPara = () => {
      const ns = para;
      para = [];
      seen = 0; shows = false;
      if (!ns.length) return;
      // Skip paragraphs with no visible content.
      if (ns.every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) || (n.t === 'cmd' && (INVIS.has(n.name) || n.name === 'label')))) {
        // labels still need registering
        for (const n of ns) if (n.t === 'cmd' && n.name === 'label') this.label(this.argText(ctx, n.args[0]), ctx);
        return;
      }
      if (env.top) this.sig = [];
      // (B7) a table in a group with the settings before it, {\renewcommand{\arraystretch}{1.5}
      // \begin{tabular}…\end{tabular}}: drawn as the table it is, not as a box of source
      {
        // (a label after the group, where Repeat Header Rows puts a float's label without a caption)
        const vis = ns.filter((n) => !blank(n) && !(n.t === 'cmd' && n.name === 'label'));
        if (vis.length === 1 && vis[0].t === 'group' && ctx.src[vis[0].e - 1] === '}') {
          const inner = vis[0].nodes.filter((n) => !(n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim())));
          const tabs = inner.filter((n) => n.t === 'env' && /^(tabular|tabularx|tabular\*|tabulary|longtable)$/.test(n.name));
          if (tabs.length === 1 && inner.every((n) => n === tabs[0] || this.tableSetting(n, ctx))) {
            const set = {};
            for (const n of inner) { const x = n !== tabs[0] && this.tableSetting(n, ctx); if (x) set[x.key] = x.value; }
            const t = this.tabular(tabs[0], ctx, [], set);
            for (const n of ns) if (n.t === 'cmd' && n.name === 'label') this.label(this.argText(ctx, n.args[0]), ctx);
            units.push({ f: ctx.f, s: ns[0].s, e: ns[ns.length - 1].e, items: [{ type: 'float', kind: 'inline', parts: [t], f: ctx.f }], fns: t.fns || [], sig: env.top ? this.sig.join('\u0001') : '' });
            return;
          }
        }
      }
      const fns = [];
      // the paragraph runs the way text ran at its start (a \selectlanguage further on in it
      // turns the rest of its line, and the paragraphs after it)
      const dir = this.dirOf();
      const inl = this.inl(ns, ctx, fns);
      trimInl(inl);
      const s = ns[0].s, e = ns[ns.length - 1].e;
      // a paragraph that is one group {\centering ...\par}: its alignment is the group's
      let pAlign = align;
      const g0 = ns.find((n) => !blank(n));
      if (g0 && g0.t === 'group' && ns.slice(ns.indexOf(g0) + 1).every(blank)) { const d = groupDecl(g0, ctx); if (d) pAlign = d; }
      const indent = !(paraNoIndent || afterHeading || cont || env.noIndentFirst || flushStart || env.flushAll || (pAlign && pAlign !== align));
      // (a \nopagebreak with nothing to show after it: read from the end, once)
      let kn = ns.length - 1;
      while (kn >= 0 && blank(ns[kn]) && !(ns[kn].t === 'cmd' && ns[kn].name === 'nopagebreak')) kn--;
      const keepNext = kn >= 0 && ns[kn].t === 'cmd' && ns[kn].name === 'nopagebreak';
      this.use('i' + indent + (pAlign || '') + (env.cls || '') + (dir || '') + '|' + [spread, env.mx, hang, env.box && JSON.stringify(env.box), env.keepLines, env.nohy, keepNext].join(','));
      const item = { type: 'p', inl, indent, align: pAlign, cls: env.cls || '', ctx: env.ctxKind || 'p', f: ctx.f, pad: env.pad || null, depth: env.depth || 0 };
      if (spread != null) item.spread = spread;
      if (env.mx) item.mx = env.mx;
      if (hang != null) item.hang = hang;
      if (env.box) item.box = env.box;
      if (env.keepLines) item.keepLines = true;
      if (env.nohy) item.nohy = true;
      if (keepNext) item.keepNext = true;
      // (where its words are in the source: the paragraph commands of src/cmd/para.js start there;
      // not for a macro's text, whose nodes are the macro's)
      if (!ctx.pm) { item.ps = s; item.pe = e; const v = visEdges(inl); if (v) { item.vs = v[0]; item.ve = v[1]; } }
      if (dir) item.dir = dir;
      if (cont) item.cont = true;
      this.countWords(inl);
      env.noIndentFirst = false;
      paraNoIndent = false;
      afterHeading = false;
      cont = false;
      hang = null;
      flushStart = !!align;
      units.push({ f: ctx.f, s, e, items: [item], fns, sig: env.top ? this.sig.join('\u0001') : '', plain: true });
    };

    // (a text node whose start an assignment took, \hangindent=1cm: what is left of it)
    let over = null;
    for (let k = 0; k < nodes.length; k++) {
      const nd = over && over.has(k) ? over.get(k) : nodes[k];
      if (nd.t === 'par') { flushPara(); continue; }
      if (nd.t === 'include') continue;
      // A LaTeX paragraph (src/styles.js): the mark's line, then everything to the next blank
      // line, shown as its source. In the document's own text only (its body, the files it
      // \inputs, and the language, direction and subequations environments whose paragraphs are
      // the body's own; not inside another environment or a macro's text), at the start of a
      // paragraph (a mark under a line of text is a comment inside that paragraph, as TeX reads
      // it), and only with something after the mark before that blank line.
      if (nd.t === 'comment' && env.top && !ctx.pm && k + 1 < nodes.length && nodes[k + 1].t !== 'par' && !paraShows() && isLatexMark(ctx.src, nd.s, nd.e)) {
        flushPara();
        let j = k + 1;
        while (j < nodes.length && nodes[j].t !== 'par') j++;
        // A brace or an environment opened in it and not closed (a \textbf{ being typed) takes
        // the rest of the text as the parser reads it: the paragraph ends at its first blank
        // line all the same, and what follows is the document's as before. So for a \verb or
        // an argument read as it is (\url{, \href{) open over a blank line, where TeX stops
        // with an error: what follows is read again without it.
        const body = nodes.slice(k + 1, j), last = body[body.length - 1];
        let cut = cutOpen(ctx.src, last);
        const raw = cut ? -1 : rawCut(ctx.src, last);
        if (raw >= 0) cut = { node: { t: 'text', s: last.s, e: raw }, rest: this.readAfter(ctx, last.s, raw), whole: true };
        if (cut) body[body.length - 1] = cut.node;
        const u = this.texBlock(nd, body, ctx, env);
        units.push(u);
        afterHeading = u.items[0].endsHeading; cont = false; paraNoIndent = false;
        if (cut) {
          for (const v of this.flow(cut.whole ? cut.rest : [...cut.rest, ...nodes.slice(j)], ctx, { ...env, afterHeading })) units.push(v);
          this.runIns(units);
          return units;
        }
        k = j - 1;
        continue;
      }
      if (nd.t === 'math' && nd.display) {
        flushPara();
        if (env.top) this.sig = [];
        const it = this.displayMath(nd, ctx, null);
        units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [it], fns: [], sig: env.top ? this.sig.join('\u0001') : '' });
        cont = true; afterHeading = false;
        // swallow following whitespace-only text so the continuation isn't indented
        continue;
      }
      if (nd.t === 'env') {
        if (nd.name === 'math' && nd.raw) { para.push(nd); continue; }
        const wrap = this.dirEnv(nd, ctx);
        if (wrap && inLine(nd, k)) { para.push(nd); continue; }
        flushPara();
        if (env.top) this.sig = [];
        // an environment is a group: a \selectlanguage inside it ends with it
        const dirWas = this.dir;
        this.use('d' + dirWas);
        const r = this.envBlock(nd, ctx, wrap ? { ...env, afterHeading, spread } : spread !== (env.spread ?? null) ? { ...env, spread } : env);
        this.dir = dirWas;
        if (r) {
          const us = Array.isArray(r) ? r : [r];
          for (const u of us) {
            if (env.top && !u.sig) u.sig = this.sig.join('\u0001');
            units.push(u);
          }
          if (nd.math) cont = true; else { cont = false; }
          afterHeading = false;
          if (nd.math) { /* continuation */ }
        }
        continue;
      }
      if (nd.t === 'cmd') {
        const name = nd.name;
        if (name === 'input' || name === 'include' || name === 'subfile') {
          flushPara();
          const f = this.resolveFile(this.argText(ctx, nd.args[0]));
          if (f && !this.included.has(f)) {
            this.included.add(f);
            const sub = { f, src: this.files.get(f), pm: null };
            let ns = this.parseFile(f);
            const d = ns.find((n) => n.t === 'env' && n.name === 'document');
            if (d) ns = d.nodes;
            const us = this.flow(ns, sub, { ...env, afterHeading });
            for (const u of us) units.push(u);
          } else if (!f) {
            if (env.top) this.sig = [];
            units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'p', inl: [{ k: 'chip', f: ctx.f, s: nd.s, e: nd.e, text: '\\input{' + this.argText(ctx, nd.args[0]) + '}', title: 'File not loaded. Open it alongside the main file.', err: true }], indent: false, ctx: 'p', f: ctx.f }], fns: [], sig: '' });
          }
          continue;
        }
        if (name in SECTIONS) {
          flushPara();
          if (SECTIONS[name] <= 0 && this.opts.chapters) units.push({ f: ctx.f, s: nd.s, e: nd.s, items: [{ type: 'pagebreak', odd: !!this.opts.openright, chapter: true }], fns: [], sig: 'cb' });
          if (env.top) this.sig = [];
          this.use('d' + this.dir);
          units.push(this.heading(nd, ctx));
          afterHeading = true;
          continue;
        }
        if (name === 'par') { flushPara(); continue; }
        if (name === 'noindent') { if (!para.some((n) => !(n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) && n.t !== 'comment')) { paraNoIndent = true; para = []; seen = 0; shows = false; } continue; }
        if (name === 'centering' || name === 'raggedright' || name === 'raggedleft') {
          align = name === 'centering' ? 'center' : name === 'raggedright' ? 'left' : 'right';
          // (\parindent is 0 from here on: for this paragraph too when it has not started)
          if (!paraShows()) flushStart = true;
          continue;
        }
        // line spacing declared in the body (setspace's, memoir's): the paragraphs after it
        if (SPACING_DECL.has(name) || ((name === 'setstretch' || name === 'setSpacing' || name === 'linespread') && nd.args[0])) {
          const v = this.spacingOf(name, nd, ctx);
          if (v != null) spread = v;
          para.push(nd);
          continue;
        }
        // TeX's assignments to a paragraph's registers at its start (\hangindent=1cm\hangafter=1)
        // and to the document's (\parindent=0pt): read, and the value is no text of the page
        if (ASSIGN.has(name)) {
          const nx = nodes[k + 1], m = nx && nx.t === 'text' ? ASSIGN_VALUE.exec(ctx.src.slice(nx.s, Math.min(nx.e, nx.s + 60))) : null;
          if (m) {
            // (TeX reads \hangindent when the paragraph ends: set anywhere in it, it holds for it)
            if (name === 'hangindent') { const v = parseLen(m[1], this.opts.pt); if (typeof v === 'number') hang = v; }
            if (nx.s + m[0].length < nx.e) (over || (over = new Map())).set(k + 1, { ...nx, s: nx.s + m[0].length });
            else k++;
            if (name === 'hangindent' || name === 'hangafter') continue;
          }
          para.push(nd);
          continue;
        }
        if (name === 'maketitle') {
          flushPara();
          if (env.top) this.sig = [];
          this.use('d' + this.dir);
          const u = this.titleBlock(nd, ctx);
          if (u) units.push(u);
          // a title page of its own (report, book and KOMA's, or the titlepage option): the text
          // starts on the next page, numbered 1 again in a one sided document, as the titlepage
          // environment does
          const O = this.opts;
          if (u && (O.titlepage || (!O.notitlepage && /^(report|book|scrreprt|scrbook)$/.test(O.cls)))) {
            units.push({ f: ctx.f, s: nd.e, e: nd.e, items: [{ type: 'pagebreak', column: false }], fns: [], sig: 'tp' });
            if (!O.twoside) units.push({ f: ctx.f, s: nd.e, e: nd.e, items: [{ type: 'pagemark', mark: { page: 1 } }], fns: [], sig: 'tp1' });
          }
          continue;
        }
        if (name === 'tableofcontents') {
          flushPara();
          if (env.top) this.sig = [];
          const entries = (this.prev ? this.prev.headings : []).filter((h) => h.level >= 0 && h.level <= (this.opts.chapters ? 2 : 3));
          this.use(JSON.stringify(entries.map((h) => [h.num, h.text, h.level])));
          // (its direction is the text's where it stands: drawn again when a \selectlanguage before it changes)
          this.use('d' + this.dir);
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'toc', entries, chapters: !!this.opts.chapters, dir: this.dirOf() }], fns: [], sig: this.sig.join('\u0001'), volatile: false });
          afterHeading = false;
          continue;
        }
        if (name === 'listoffigures' || name === 'listoftables') { flushPara(); continue; }
        // \ifodd\value{page}\hbox{}\clearpage\fi (and with \else before \hbox): on to an even (an
        // odd) page, a blank one before it where the page it is on is not (src/pagesrc.js BREAKS)
        if (name === 'ifodd' && !paraShows()) {
          const at = (j) => { while (j < nodes.length && nodes[j].t === 'text' && !ctx.src.slice(nodes[j].s, nodes[j].e).trim()) j++; return j; };
          const is = (j, n) => nodes[j] && nodes[j].t === 'cmd' && nodes[j].name === n;
          let j = at(k + 1);
          if (is(j, 'value') && this.argText(ctx, nodes[j].args[0]).trim() === 'page') {
            j = at(j + 1);
            const odd = is(j, 'else');
            if (odd) j = at(j + 1);
            if (is(j, 'hbox') || is(j, 'null')) {
              j = at(j + 1);
              if (is(j, 'clearpage') || is(j, 'newpage')) {
                j = at(j + 1);
                if (is(j, 'fi')) {
                  flushPara();
                  units.push({ f: ctx.f, s: nd.s, e: nodes[j].e, items: [{ type: 'pagebreak', parity: odd ? 'odd' : 'even' }], fns: [], sig: 'par' + (odd ? 'o' : 'e') });
                  k = j;
                  continue;
                }
              }
            }
          }
        }
        if (name === 'newpage' || name === 'clearpage' || name === 'cleardoublepage' || name === 'pagebreak') {
          flushPara();
          // (\cleardoublepage goes on to an odd page in a two sided document; \newpage in two
          // columns ends the column, \clearpage the page)
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'pagebreak', odd: name === 'cleardoublepage', column: name === 'newpage' || name === 'pagebreak' }], fns: [], sig: '' });
          continue;
        }
        // the page's own commands in the text: a column ends, the page's style, its numbers
        if (name === 'columnbreak') {
          flushPara();
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'pagebreak', column: true, only: true }], fns: [], sig: '' });
          continue;
        }
        const pageCounter = (name === 'setcounter' || name === 'addtocounter') && this.argText(ctx, nd.args[0]).trim() === 'page';
        if (name === 'thispagestyle' || name === 'pagestyle' || name === 'pagenumbering' || pageCounter) {
          const a = this.argText(ctx, nd.args[pageCounter ? 1 : 0]).trim();
          // (\addtocounter{page}{-1}: the page it is on takes the number less one, and those after)
          const mark = name === 'setcounter' ? { page: parseInt(a, 10) } : name === 'addtocounter' ? { pageAdd: parseInt(a, 10) } : name === 'pagenumbering' ? { numbering: a } : name === 'pagestyle' ? { style: a } : { thisStyle: a };
          // (one inside a paragraph's words is left to TeX: the paragraph stays whole)
          if (paraShows() || (name === 'setcounter' && !Number.isFinite(mark.page)) || (name === 'addtocounter' && !Number.isFinite(mark.pageAdd))) { para.push(nd); continue; }
          flushPara();
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'pagemark', mark }], fns: [], sig: 'pm' + JSON.stringify(mark) });
          continue;
        }
        // \null between two page breaks: an empty page, as TeX gives it
        if (name === 'null' && !paraShows()) {
          let j = k + 1;
          while (j < nodes.length && blank(nodes[j])) j++;
          const nx = nodes[j];
          if (!nx || nx.t === 'par' || (nx.t === 'cmd' && /^(newpage|clearpage|cleardoublepage|pagebreak)$/.test(nx.name))) {
            flushPara();
            units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'space', pt: 0 }], fns: [], sig: 'null' });
            continue;
          }
        }
        if (name === 'vfill' && !paraShows()) {
          flushPara();
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'space', pt: 0, fill: true }], fns: [], sig: 'fill' });
          continue;
        }
        if (name === 'appendix') { flushPara(); this.appendix = true; if (this.opts.chapters) this.c.chapter = 0; else this.c.section = 0; continue; }
        // a book's front and back matter: chapters there have no number; \mainmatter numbers them
        if (name === 'frontmatter' || name === 'mainmatter' || name === 'backmatter') {
          flushPara(); this.front = name !== 'mainmatter';
          // (memoir's \mainmatter numbers down to maxsecnumdepth again, whatever secnumdepth was)
          if (name === 'mainmatter' && this.opts.cls === 'memoir') { this.opts.secnumdepth = this.opts.maxsecnumdepth ?? 2; this.use('mm' + this.opts.secnumdepth); }
          continue;
        }
        if (name === 'bibliography' || name === 'printbibliography') {
          flushPara();
          if (env.top) this.sig = [];
          if (name === 'bibliography') for (const b of this.argText(ctx, nd.args[0]).split(',')) this.bibFiles.push(b.trim());
          units.push(this.refsBlock(nd, ctx));
          continue;
        }
        if (name === 'bigskip' || name === 'medskip' || name === 'smallskip' || name === 'vspace') {
          flushPara();
          let h = { bigskip: 12, medskip: 6, smallskip: 3 }[name];
          const arg = name === 'vspace' ? this.argText(ctx, nd.args[0]) : '';
          if (name === 'vspace') { const v = parseLen(arg, this.opts.pt); h = typeof v === 'number' ? v : 0; }
          // (\vspace*{\fill} takes what the page has left: a title page centred, a line at its foot)
          const fill = name === 'vspace' && /\\(?:fill|vfill|stretch)\b/.test(arg);
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'space', pt: h, fill }], fns: [], sig: 'sp' + h + (fill ? 'f' : '') });
          continue;
        }
        if (name === 'item' && env.list) { para.push(nd); continue; }
        if (name === 'caption' && env.float) { para.push(nd); continue; }
        if (name === 'hrule' || name === 'hline') {
          flushPara();
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'rule' }], fns: [], sig: 'hr' });
          continue;
        }
        // \selectlanguage{arabic} before a paragraph's first word: that paragraph and the ones
        // after it run its way. Further on in a line it turns the rest of the line (Builder.inl).
        const dd = this.declDir(nd, ctx);
        if (dd && !paraShows()) this.dir = dd;
        // definitions in the body
        if (nd.def || name === 'newtheorem' || name === 'theoremstyle' || name === 'numberwithin') {
          // already collected; invisible
          para.push(nd);
          continue;
        }
      }
      para.push(nd);
    }
    flushPara();
    this.runIns(units);
    return units;
  }

  // \paragraph and \subparagraph run into the paragraph after them, as TeX sets them (a blank
  // line between them too): the heading is drawn over the start of that paragraph's first line,
  // which keeps its room (render.js); one followed by anything else stands on its own line.
  runIns(units) {
    for (let i = 0; i + 1 < units.length; i++) {
      const u = units[i], h = u.items.length === 1 ? u.items[0] : null;
      if (!h || h.type !== 'h' || !h.runInto || h.runIn) continue;
      const n = units[i + 1], p = n.items[0];
      // (a paragraph of this flow, or one of an environment of declarations alone: a quote, a
      // centring, a theorem or a list starts with \@trivlist, which sets the heading on its own line)
      if (!p || p.type !== 'p' || p.runIn || n.f !== u.f || p.ctx !== 'p' || !n.plain) continue;
      h.runIn = true;
      p.runIn = { num: h.num, text: this.plain(h.inl), level: h.level, look: h.look || null };
      u.sig += '\u0001ri';
      n.sig += '\u0001ri' + h.num + '\u0002' + p.runIn.text + (h.look ? JSON.stringify(h.look) : '');
    }
  }

  // The nodes after position at of the file, at the depth of the environment that holds it,
  // read again with [s, at) blanked: what a \verb or an argument read as it is had swallowed
  readAfter(ctx, s, at) {
    const src = ctx.src, blanked = src.slice(0, s) + src.slice(s, at).replace(/[^\n]/g, ' ') + src.slice(at);
    let ns = parse(blanked, { userSigs: this.userSigs });
    for (;;) {
      const env = ns.find((x) => x.t === 'env' && !x.raw && x.nodes && x.s < at && at < x.e);
      if (!env) break;
      ns = env.nodes;
    }
    return ns.filter((x) => x.s >= at);
  }

  // A LaTeX paragraph: one item that shows the source from the line after the mark to the last
  // character of its nodes, each character mapped to itself, so the box is edited as text. The
  // nodes still go through the builder, and what it makes of them is dropped: counters,
  // labels, headings for the outline and the contents, footnote numbers and words stay as TeX
  // will have them for everything after it.
  texBlock(mark, nodes, ctx, env) {
    const src = ctx.src, is = src.indexOf('\n', mark.s) + 1, end = nodes[nodes.length - 1].e;
    let ie = end;
    while (ie > is && /\s/.test(src[ie - 1])) ie--;
    // (spaces at the end of its last line are its own: the one just typed there stays in the box)
    while (src[ie] === ' ' || src[ie] === '\t') ie++;
    if (env.top) this.sig = [];
    const us = this.flow(nodes, ctx, { ...env, top: false });
    const one = us.length === 1 && us[0].items.length === 1 ? us[0].items[0] : null;
    const last = us.length ? us[us.length - 1].items : [];
    const map = new Array(2 * (ie - is));
    for (let i = 0; i < ie - is; i++) { map[2 * i] = is + i; map[2 * i + 1] = is + i + 1; }
    const text = src.slice(is, ie);
    // where a blank line typed in it stays inside an environment or a group, and does not end it
    const nest = nodes.filter((n) => !n.cut && ((n.t === 'env' && (n.raw || n.e > n.es)) || (n.t === 'group' && src[n.e - 1] === '}'))).map((n) => [n.s, n.e]);
    const item = {
      type: 'tex', f: ctx.f, s: mark.s, e: ie, is, ie, text, nest,
      inl: [{ k: 'seg', f: ctx.f, t: text, map }],
      // what it would be without the mark: one paragraph of text, which a heading or a quote may hold
      para: !!one && one.type === 'p' && (one.ctx || 'p') === 'p' && !one.li && !one.lead && !nodes.some((n) => (n.t === 'env' && !(n.name === 'math' && n.raw)) || (n.t === 'math' && n.display)),
      endsHeading: !!last.length && last[last.length - 1].type === 'h'
    };
    return { f: ctx.f, s: mark.s, e: ie, items: [item], fns: [], sig: 'tex' };
  }

  countWords(inl) {
    for (const x of inl) {
      // (marks and joiners are part of a word: नमस्ते is one word, not three)
      if (x.k === 'seg') this.words += (x.t.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200C\u200D'’-]*/gu) || []).length;
      else if (x.kids) this.countWords(x.kids);
    }
  }

  heading(nd, ctx) {
    const level = SECTIONS[nd.name];
    const titleArg = nd.args[1] || nd.args[0];
    const star = nd.star;
    let num = '';
    const minLevel = this.opts.chapters ? 0 : 1;
    const front = this.front && level === 0 && this.opts.chapters; // \frontmatter's Preface, unnumbered
    // (the look's label may be empty: titlesec's {} prints no number, though the counter steps)
    const look = this.headLook(nd.name);
    const numbered = !star && !front && level <= this.opts.secnumdepth && level >= minLevel && level <= 5 && !(look && look.num === false);
    if (!star && !front && level >= 0) {
      this.stepSection(level);
      if (numbered) num = this.secNum(level);
    }
    // \part: Part I, II, … above its title, where secnumdepth reaches it (a class with chapters
    // numbers its parts down to -1, article down to 0)
    if (level === -1 && !star && this.opts.secnumdepth >= (this.opts.chapters ? -1 : 0)) { this.c.part++; num = roman(this.c.part).toUpperCase(); }
    this.use('h' + num + (this.appendix ? 'A' : ''));
    if (!star && !front) this.lastTarget = { num, kind: { '-1': 'part', 0: 'chapter', 1: 'section', 2: 'subsection', 3: 'subsubsection', 4: 'paragraph', 5: 'subparagraph' }[level] || 'section', name: this.appendix && level === minLevel ? 'appendix' : null };
    const fns = [];
    const inl = titleArg ? this.inl(titleArg.nodes, ctx, fns) : [];
    if (titleArg && !inl.length) inl.push({ k: 'seg', f: ctx.f, t: '​', map: [titleArg.is, titleArg.is], ph: true });
    const text = this.plain(inl);
    this.headings.push({ level, num, text, parts: this.tocParts(inl), star, f: ctx.f, s: nd.s });
    const de = this.opts.lang === 'de';
    const chapLabel = level === 0 && this.opts.chapters && !front ? (this.appendix ? (de ? 'Anhang' : 'Appendix') : (de ? 'Kapitel' : 'Chapter')) : level === -1 && num ? (de ? 'Teil' : 'Part') : null;
    // the look the preamble gives this heading (titlesec, KOMA-Script), where it is not LaTeX's own
    if (look) this.use('L' + JSON.stringify(look));
    const it = { type: 'h', level, num, inl, star, f: ctx.f, ctx: 'h', s: nd.s, e: nd.e, chapLabel, dir: this.dirOf() };
    if (look) it.look = look;
    // (titlesec's display shape: the number on a line of its own above the title)
    if (look && look.shape === 'display' && num && !chapLabel) it.numBlock = true;
    // run in where the shape is titlesec's runin, or a \paragraph or \subparagraph that the preamble
    // does not set on a line of its own by \@startsection
    if (look ? look.shape === 'runin' : level >= 4 && (this.opts.secShapes || {})[nd.name] !== 'hang') it.runInto = true;
    return { f: ctx.f, s: nd.s, e: nd.e, items: [it], fns, sig: this.sig ? this.sig.join('\u0001') : '' };
  }

  // a heading's look for the page: { size, bf, it, sc, sf, tt, color (as CSS takes it), align,
  // rule, shape } from the preamble, or null where it is LaTeX's own
  headLook(cmd) {
    const O = this.opts, L = (O.heads && O.heads[cmd]) || (O.koma ? defaultLook(cmd, true) : null);
    if (!L) return null;
    const out = { size: L.size, bf: L.bf, it: L.it, sc: L.sc, sf: L.sf, tt: L.tt, align: L.align, rule: !!L.rule, shape: L.shape, num: L.num !== false };
    if (L.color) out.color = this.named(L.color) || L.color;
    return out;
  }

  tocParts(inl) {
    const out = [];
    const walk = (xs) => {
      for (const x of xs) {
        if (x.k === 'seg') out.push(x.t.replace(/\u200B/g, ''));
        else if (x.k === 'chr') out.push(x.text);
        else if (x.k === 'math') out.push({ m: x.tex });
        else if (x.kids) walk(x.kids);
        else if (x.k === 'fn') continue;
        else if (x.text) out.push(x.text);
      }
    };
    walk(inl);
    return out;
  }

  plain(inl) {
    let s = '';
    for (const x of inl) {
      if (x.k === 'seg') s += x.t.replace(/​/g, '');
      else if (x.k === 'chr') s += x.text;
      else if (x.kids) s += this.plain(x.kids);
      else if (x.k === 'math') s += x.tex;
      else if (x.text) s += x.text;
    }
    return s;
  }

  titleBlock(nd, ctx) {
    const m = this.meta;
    if (!m.title && !m.author) return null;
    const fns = [];
    const ranges = [];
    // a \title in a preamble file of its own (\input{preamble}) is not a range of this file
    const at = (x) => { if (x.ctx.f === ctx.f) ranges.push([x.nd.s, x.nd.e]); };
    let title = [], authors = [], date = null;
    this.thanksMode = true;
    if (m.title && m.title.a) { title = this.inl(m.title.a.nodes, m.title.ctx, fns); at(m.title); }
    if (m.author && m.author.a) {
      const a = m.author.a;
      let cur = [];
      const groups = [cur];
      for (const n of a.nodes) {
        if (n.t === 'cmd' && n.name === 'and') { cur = []; groups.push(cur); } else cur.push(n);
      }
      authors = groups.map((g) => { const r = this.inl(g, m.author.ctx, fns); trimInl(r); return r; });
      at(m.author);
    }
    if (m.date) {
      if (m.date.a) { date = this.inl(m.date.a.nodes, m.date.ctx, fns); trimInl(date); at(m.date); }
    } else date = [{ k: 'chr', text: today(this.opts.lang) }];
    this.thanksMode = false;
    const s = Math.min(nd.s, ...ranges.map((r) => r[0]));
    const e = Math.max(nd.e, ...ranges.map((r) => r[1]));
    return { f: ctx.f, s, e, items: [{ type: 'title', title, authors, date, f: ctx.f, dir: this.dirOf() }], fns, sig: (this.sig || []).join('\u0001') };
  }

  refsBlock(nd, ctx) {
    // Gather bib entries
    const O = this.opts;
    this.ensureBib();
    const list = this.refList();
    const head = O.cls === 'book' || O.cls === 'report' ? 'Bibliography' : 'References';
    const entries = list.map((r) => ({ label: r.label, runs: r.runs, f: r.e ? r.e.file : null, s: r.e ? r.e.s : 0, e: r.e ? r.e.e : 0, key: r.key }));
    this.use(JSON.stringify(entries.map((x) => [x.label, x.runs.map((r) => r.t).join('')])));
    return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'refs', head, entries, numeric: O.citeStyle === 'numeric' }], fns: [], sig: this.sig.join('\u0001') };
  }

  resolveBib(name) {
    name = name.trim();
    const cands = [name, name + '.bib'];
    for (const c of cands) if (this.files.has(c)) return c;
    for (const [k] of this.files) if (k.endsWith('/' + name) || k.endsWith('/' + name + '.bib')) return k;
    return null;
  }

  ensureBib() {
    if (this.bibLoaded) return;
    this.bibLoaded = true;
    const names = new Set(this.bibFiles);
    // Also scan for \bibliography / \addbibresource anywhere in main source.
    for (const [n, t] of this.files) {
      if (WIDGET_FILE.test(n)) continue;
      const re = /\\(?:bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(t))) for (const b of m[1].split(',')) names.add(b.trim());
    }
    for (const b of names) {
      const f = this.resolveBib(b);
      if (!f) continue;
      const ents = parseBib(this.files.get(f), f);
      for (const [k, v] of ents) if (!this.bibEntries.has(k)) this.bibEntries.set(k, v);
    }
  }

  refList() {
    // entries cited (pass1 order), formatted
    this.ensureBib();
    const O = this.opts;
    const src = this.prev || this;
    let keys = [...src.cites];
    if (src.nociteAll) for (const k of this.bibEntries.keys()) if (!keys.includes(k)) keys.push(k);
    const out = [];
    if (this.thebib) return this.thebib.list;
    for (const k of keys) {
      const e = this.bibEntries.get(k);
      if (!e) continue;
      out.push({ key: k, e, sortKey: (shortAuthors(e) + ' ' + entryYear(e) + ' ' + texToPlain(e.fields.title || '')).toLowerCase() });
    }
    if (O.sort || O.citeStyle === 'authoryear') out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    // disambiguate author-year
    const groups = new Map();
    for (const r of out) {
      const g = shortAuthors(r.e) + '|' + entryYear(r.e);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    }
    for (const g of groups.values()) if (g.length > 1) g.forEach((r, k) => { r.suffix = alph(k + 1); });
    out.forEach((r, k) => {
      r.num = k + 1;
      r.label = O.citeStyle === 'numeric' ? '[' + (k + 1) + ']' : '';
      r.runs = formatEntry(r.e, r.suffix || '');
    });
    return out;
  }

  citeInfo(key) {
    this.ensureBib();
    if (!this._refIndex) {
      this._refIndex = new Map();
      for (const r of this.refList()) this._refIndex.set(r.key, r);
    }
    const r = this._refIndex.get(key);
    if (r) {
      const e = r.e;
      if (!e) return { author: r.author || key, year: r.year || '', num: r.num, ok: true };
      return { author: shortAuthors(e), year: entryYear(e) + (r.suffix || ''), num: r.num, ok: true };
    }
    const e = this.bibEntries.get(key);
    if (e) return { author: shortAuthors(e), year: entryYear(e), num: '?', ok: true };
    if (this.bibItems && this.bibItems.has(key)) { const b = this.bibItems.get(key); return { author: b.author, year: b.year, num: b.num, ok: true }; }
    return { ok: false };
  }

  // ---- environments ---------------------------------------------------------
  envBlock(nd, ctx, env) {
    const name = nd.name;
    const base = name.replace(/\*$/, '');
    if (nd.math) {
      const it = this.displayMath(nd, ctx, name);
      return { f: ctx.f, s: nd.s, e: nd.e, items: [it], fns: [] };
    }
    if (nd.raw) {
      const text = ctx.src.slice(nd.be, nd.es).replace(/^\n/, '').replace(/\s+$/, '');
      const verb = /verbatim|lstlisting|minted|Verbatim/.test(name);
      if (name === 'comment') return null;
      return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'raw', f: ctx.f, s: nd.s, e: nd.e, is: nd.be, ie: nd.es, text, verb, name }], fns: [] };
    }
    if (name === 'document') return this.flow(nd.nodes, ctx, env);
    const wrap = this.dirEnv(nd, ctx);
    if (wrap) {
      // Its paragraphs are the document's own, each a block as in `document`, running the
      // environment's way (flow's caller puts the direction back at its end). An empty one
      // gets a paragraph to type in.
      if (wrap.dir) this.dir = wrap.dir;
      const us = this.flow(nd.nodes, ctx, env);
      return us.length ? us : { f: ctx.f, s: nd.s, e: nd.e, items: [this.emptyPara(ctx, nd.be, env.cls)], fns: [] };
    }
    if (name === 'subequations') {
      this.c.equation++;
      this.subeq = { base: this.withinPrefix('equation') + this.c.equation, n: 0 };
      const saveT = this.lastTarget;
      this.lastTarget = { num: this.subeq.base, kind: 'equation' };
      const us = this.flow(nd.nodes, ctx, { ...env });
      this.subeq = null;
      this.lastTarget = saveT;
      return us.length ? us : null;
    }
    if (LIST_ENVS.has(name)) return this.listBlock(nd, ctx, env);
    if (name === 'abstract') {
      const items = [{ type: 'h', level: 'abs', num: '', inl: [{ k: 'chr', text: 'Abstract' }], star: true, ctx: 'h', f: ctx.f, dir: this.dirOf() }];
      const fns = [];
      const us = this.flow(nd.nodes, ctx, { ...env, top: false, cls: 'abs', ctxKind: 'p', noIndentFirst: false, ...FLUSH });
      for (const u of us) { items.push(...u.items); fns.push(...u.fns); }
      if (items.length === 1) items.push(this.emptyPara(ctx, nd.be, 'abs'));
      return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
    }
    if (name === 'proof') {
      const fns = [];
      const optArg = nd.args[0];
      const lead = [];
      if (optArg) {
        lead.push({ k: 'sty', st: 'it', kids: this.inl(optArg.nodes, ctx, fns), f: ctx.f, s: optArg.s, e: optArg.e, is: optArg.is, ie: optArg.ie });
        lead.push({ k: 'chr', text: '.', cls: 'it' });
      } else lead.push({ k: 'chr', text: this.opts.lang === 'de' ? 'Beweis.' : 'Proof.', cls: 'it' });
      lead.push({ k: 'chr', text: ' ', cls: 'sp' });
      const us = this.flow(nd.nodes, ctx, { ...env, top: false, cls: (env.cls || '') + ' prf', noIndentFirst: true, ...FLUSH });
      const items = [];
      for (const u of us) { items.push(...u.items); fns.push(...u.fns); }
      const first = items.find((x) => x.type === 'p');
      if (first && items[0] === first) { first.lead = lead; first.indent = true; }
      else items.unshift({ type: 'p', inl: [], lead, indent: true, cls: (env.cls || '') + ' prf', ctx: 'p', f: ctx.f, dir: this.dirOf() });
      const last = items[items.length - 1];
      if (last.type === 'p') last.tail = [{ k: 'chr', text: '□', cls: 'qed' }];
      else if (last.type === 'math') last.qed = true;
      return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
    }
    const thm = this.thms.get(name) || this.thms.get(base) || (DEFAULT_THMS[base] ? { title: DEFAULT_THMS[base], counter: base, style: /definition|assumption|example|remark|notation|condition|problem|exercise|question/.test(base) ? 'definition' : 'plain', auto: true } : null);
    if (thm) return this.theorem(nd, ctx, env, thm, name);
    // a tcolorbox (B8's shaded text box): its paragraphs in one frame, as wide as its width= says
    if (name === 'tcolorbox') {
      const o = nd.args[0] ? this.argText(ctx, nd.args[0]) : '';
      const r = this.container(nd, ctx, env, { cls: (env.cls || '') + ' tcb' });
      const ps = r.items.filter((x) => x.type === 'p');
      if (ps.length) { ps[0].cls = (ps[0].cls || '') + ' tcb-a'; ps[ps.length - 1].cls = (ps[ps.length - 1].cls || '') + ' tcb-z'; }
      const w = /(?:^|,)\s*width\s*=\s*([\d.]*)\s*\\(?:linewidth|textwidth|columnwidth)/.exec(o);
      const share = w ? (w[1] === '' ? 1 : parseFloat(w[1])) : null;
      const bg = /(?:^|,)\s*colback\s*=\s*([A-Za-z]+(?:![\d.]+(?:![A-Za-z]+)?)*)/.exec(o);
      for (const x of ps) { if (share && share > 0 && share < 1) { x.boxW = share; x.boxC = /(?:^|,)\s*center\s*(,|$)/.test(o); } if (bg) x.boxBg = bg[1]; }
      return r;
    }
    if (['quote', 'quotation', 'verse'].includes(name)) {
      return this.container(nd, ctx, env, { cls: (env.cls || '') + ' quote', noIndentFirst: name !== 'quotation', ...FLUSH });
    }
    // a center holding a \captionof (B8's picture in line with a caption, caption's package):
    // drawn as TeX prints it, a figure's parts with "Figure 1: …" under them, where it is written
    if (['center', 'flushleft', 'flushright'].includes(name) && !env.inMc) {
      const cap = nd.nodes.find((n) => n.t === 'cmd' && n.name === 'captionof' && n.args[0]);
      if (cap) {
        const k = this.argText(ctx, cap.args[0]).trim();
        if (k === 'figure' || k === 'table') {
          const r = this.floatBlock(nd, ctx, env, k, name === 'center' ? null : name === 'flushleft' ? 'left' : 'right');
          for (const it of r.items) if (it.type === 'float') it.placement = 'H';
          return r;
        }
      }
    }
    if (['center', 'flushleft', 'flushright'].includes(name)) {
      // (\centering and its like set \parindent to 0: no paragraph of it is indented)
      return this.container(nd, ctx, env, { align: { center: 'center', flushleft: 'left', flushright: 'right' }[name], noIndentFirst: true, flushAll: true });
    }
    if (/^(figure|table|wrapfigure|wraptable|SCfigure|SCtable|sidewaysfigure|sidewaystable)$/.test(name) && env.inMc) {
      // TeX sets a float inside multicols and throws it away (multicol's warning: Floats and
      // marginpars not allowed): numbered, not in the PDF. The page says so where it stands.
      this.floatBlock(nd, ctx, env);
      const first = ctx.src.slice(nd.s, Math.min(nd.e, nd.s + 200)).split('\n')[0];
      return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'raw', f: ctx.f, s: nd.s, e: nd.e, is: nd.be, ie: nd.es, text: first + (nd.e - nd.s > first.length ? ' …' : ''), verb: false, name: name + ' left out of the PDF: TeX takes no float inside multicols', lost: true }], fns: [] };
    }
    // (B2) the paragraph's settings as environments: setspace's and memoir's line spacing,
    // changepage's adjustwidth (a list: its first paragraph unindented), tcolorbox's shading and
    // frame (its paragraphs unindented, as in a minipage), samepage, babel's hyphenrules
    if (name in SPACING_ENV) {
      const k = SPACING_ENV[name], pt = this.opts.pt;
      const v = k === 1 ? 1 : k === 'h' ? ONEHALF[pt] || 1.25 : k === 'd' ? DOUBLE[pt] || 1.667 : parseFloat(this.argText(ctx, nd.args[0]));
      return this.container(nd, ctx, env, v > 0 && v < 10 ? { spread: v } : {});
    }
    if (name === 'adjustwidth' || name === 'adjustwidth*') {
      const L = (a) => { const t = this.argText(ctx, a).trim(); if (!t) return 0; const v = parseLen(t, this.opts.pt); return typeof v === 'number' ? v : 0; };
      const m = env.mx || [0, 0];
      return this.container(nd, ctx, env, { mx: [m[0] + L(nd.args[0]), m[1] + L(nd.args[1])], noIndentFirst: true, ...FLUSH });
    }
    if (name === 'tcolorbox') return this.boxEnv(nd, ctx, env);
    if (name === 'samepage') return this.container(nd, ctx, env, { keepLines: true });
    if (name === 'hyphenrules') return this.container(nd, ctx, env, this.argText(ctx, nd.args[0]).trim() === 'nohyphenation' ? { nohy: true } : {});
    if (name === 'nolinenumbers') return this.container(nd, ctx, env, {});
    if (/^(figure|table|wrapfigure|wraptable|SCfigure|SCtable|sidewaysfigure|sidewaystable)\*?$/.test(name)) return this.floatBlock(nd, ctx, env);
    if (/^(tabular|tabularx|tabular\*|tabulary|longtable|array)$/.test(name)) {
      const t = this.tabular(nd, ctx);
      return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'float', kind: 'inline', parts: [t], f: ctx.f }], fns: t.fns || [] };
    }
    if (name === 'thebibliography') return this.theBib(nd, ctx);
    if (/^multicols\*?$/.test(name) && !nd.raw && nd.nodes) {
      // multicols: its paragraphs set in columns on the page (src/layout.js), balanced unless
      // starred. Each is a block of its own, as the document's are, so that typing in one draws
      // that one again and not the whole environment.
      const n = Math.max(1, Math.min(10, parseInt(this.argText(ctx, nd.args && nd.args[0]), 10) || 2));
      const ord = (this.mcCount.get(ctx.f) || 0) + 1;
      this.mcCount.set(ctx.f, ord);
      const mc = { n, key: ctx.f + ':mc' + ord, star: name.endsWith('*') };
      // (its optional argument, \begin{multicols}{2}[\section{...}], is set across, before them)
      const pre = nd.args && nd.args[1] && nd.args[1].nodes ? this.flow(nd.args[1].nodes, ctx, env) : [];
      const us = this.flow(nd.nodes, ctx, { ...env, inMc: true });
      const list = us.length ? us : [{ f: ctx.f, s: nd.s, e: nd.e, items: [this.emptyPara(ctx, nd.be, env.cls)], fns: [] }];
      for (const u of list) {
        for (const it of u.items) if (!it.mc) it.mc = mc;
        u.sig = (u.sig || '') + '\u0001mc' + n + ':' + ord + (mc.star ? '*' : '');
      }
      return [...pre, ...list];
    }
    if (/^(small|footnotesize|scriptsize|large|Large|minipage|landscape|appendices|otherlanguage\*?|titlepage|multicols\*?|adjustbox|threeparttable|tablenotes|acknowledgments|acknowledgements)$/.test(name)) {
      const ex = /^(small|footnotesize|scriptsize|large|Large)$/.test(name) ? { cls: (env.cls || '') + ' z-' + name } : name === 'minipage' ? { ...FLUSH, flushAll: true } : {};
      if (name === 'appendices') { this.appendix = true; if (this.opts.chapters) this.c.chapter = 0; else this.c.section = 0; }
      if (name === 'acknowledgments' || name === 'acknowledgements') {
        const r = this.container(nd, ctx, env, {});
        // the heading is spelt as the environment is: a thesis in British English says Acknowledgements
        if (r) r.items.unshift({ type: 'h', level: 3, num: '', inl: [{ k: 'chr', text: name === 'acknowledgements' ? 'Acknowledgements' : 'Acknowledgments' }], star: true, ctx: 'h', f: ctx.f, dir: this.dirOf() });
        return r;
      }
      const r = this.container(nd, ctx, env, ex);
      // (a multicols read raw, or nested where a block cannot be cut: one block in columns)
      if (/^multicols\*?$/.test(name) && r) {
        const n = Math.max(1, Math.min(10, parseInt(this.argText(ctx, nd.args && nd.args[0]), 10) || 2));
        for (const it of r.items) if (!it.mc) it.mc = { n, key: ctx.f + ':' + nd.s, star: name.endsWith('*') };
      }
      return r;
    }
    // An environment of the document's own that only formats its paragraphs (a paragraph style:
    // \newenvironment{note}{\par\itshape\color{accent}}{\par}): its paragraphs in that look
    const ud = this.envDefs.get(name), F = ud && !ud.nargs ? readEnvBegin(ud.begin) : null;
    if (F) {
      const r = this.container(nd, ctx, env, { align: F.align || env.align || null, noIndentFirst: false });
      const look = { size: F.size || null, bf: !!F.bf, it: !!F.it, sc: !!F.sc, sf: !!F.sf, tt: !!F.tt, color: F.color ? this.named(F.color) || F.color : null };
      this.use('E' + JSON.stringify(look));
      if (r) for (const it of r.items) if (it.type === 'p') it.look = look;
      if (r) { r.plain = true; return r; }
    }
    // Unknown environment: render content with a small tag.
    const r = this.container(nd, ctx, env, { cls: (env.cls || '') + ' unk' });
    if (r && r.items.length) r.items[0].envTag = name;
    else return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'raw', f: ctx.f, s: nd.s, e: nd.e, is: nd.be, ie: nd.es, text: '\\begin{' + name + '}', verb: false, name }], fns: [] };
    return r;
  }

  // (B2) tcolorbox: its paragraphs on its colback, in its frame; first and last carry the box's
  // padding (Rikuy draws the box as its paragraphs' background and borders)
  boxEnv(nd, ctx, env) {
    const kv = {};
    const opt = nd.args[0] ? this.argText(ctx, nd.args[0]) : '';
    // (braces keep a value's commas: colback={rgb,255:red,231;green,84;blue,128})
    for (const part of splitTop(opt.slice(0, 2000))) { const k = part.indexOf('='); const key = (k < 0 ? part : part.slice(0, k)).trim(); if (key) kv[key] = k < 0 ? true : unbrace(part.slice(k + 1).trim()); }
    const rule = kv.boxrule != null ? parseLen(String(kv.boxrule), this.opts.pt) : 1.42;
    const L = (x, d) => { const v = x != null ? parseLen(String(x), this.opts.pt) : null; return typeof v === 'number' ? v : d; };
    const box = { bg: kv.colback ? this.colorText(String(kv.colback)) : '#F2F2F2', fr: kv.colframe ? this.colorText(String(kv.colframe)) : '#404040', rule: typeof rule === 'number' ? rule : 1.42,
      l: L(kv.left, 11.38) + L(kv.boxsep, 2.85), r: L(kv.right, 11.38) + L(kv.boxsep, 2.85), t: L(kv.top, 5.69) + L(kv.boxsep, 2.85), b: L(kv.bottom, 5.69) + L(kv.boxsep, 2.85), sharp: !!kv['sharp corners'] || kv.arc === '0pt' };
    const r = this.container(nd, ctx, env, { box, noIndentFirst: true, ...FLUSH, flushAll: true });
    const ps = r.items.filter((it) => it.type === 'p');
    if (ps.length) { ps[0].boxFirst = true; ps[ps.length - 1].boxLast = true; }
    return r;
  }
  // a colour as tcolorbox's options write it (a name, red!20): the document's own name resolved
  colorText(t) { return this.named(t) || mixColor(t) || t; }

  // (B2) the stretch a spacing declaration sets: \onehalfspacing, \setstretch{1.15}
  spacingOf(name, nd, ctx) {
    const pt = this.opts.pt;
    if (name === 'onehalfspacing' || name === 'OnehalfSpacing') return ONEHALF[pt] || 1.25;
    if (name === 'doublespacing' || name === 'DoubleSpacing') return DOUBLE[pt] || 1.667;
    if (name === 'singlespacing' || name === 'SingleSpacing') return 1;
    const v = parseFloat(this.argText(ctx, nd.args[0]));
    return v > 0 && v < 10 ? v : null;
  }

  emptyPara(ctx, pos, cls) {
    return { type: 'p', inl: [{ k: 'seg', f: ctx.f, t: '​', map: [pos, pos], ph: true }], indent: false, cls: cls || '', ctx: 'p', f: ctx.f, dir: this.dirOf() };
  }

  container(nd, ctx, env, ex) {
    const us = this.flow(nd.nodes, ctx, { ...env, top: false, ...ex });
    const items = [], fns = [];
    for (const u of us) { items.push(...u.items); fns.push(...u.fns); }
    if (!items.length) items.push(this.emptyPara(ctx, nd.be, ex.cls));
    return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
  }

  theorem(nd, ctx, env, thm, name) {
    let num = '';
    if (thm.counter) {
      const cnt = thm.counter;
      const n = (this.thmc.get(cnt) || 0) + 1;
      this.thmc.set(cnt, n);
      const w = this.within[cnt] || (this.thms.get(cnt) && this.within[cnt]);
      num = (w ? this.withinPrefix(cnt) : '') + n;
    }
    this.use('t' + name + num);
    const saveT = this.lastTarget;
    this.lastTarget = { num, kind: name.replace(/\*$/, ''), name: thm.title };
    const fns = [];
    const lead = [{ k: 'chr', text: thm.title + (num ? ' ' + num : ''), cls: thm.style === 'remark' ? 'it' : 'bf' }];
    const opt = nd.args[0];
    if (opt) {
      lead.push({ k: 'chr', text: ' (', cls: thm.style === 'plain' ? 'up' : '' });
      lead.push({ k: 'sty', st: thm.style === 'plain' ? 'up' : '', kids: this.inl(opt.nodes, ctx, fns), f: ctx.f, s: opt.s, e: opt.e, is: opt.is, ie: opt.ie });
      lead.push({ k: 'chr', text: ')', cls: thm.style === 'plain' ? 'up' : '' });
    }
    lead.push({ k: 'chr', text: '.', cls: thm.style === 'remark' ? 'it' : 'bf' });
    lead.push({ k: 'chr', text: ' ', cls: 'sp' });
    const style = thm.style === 'definition' ? 'thm-def' : thm.style === 'remark' ? 'thm-rem' : 'thm-plain';
    const us = this.flow(nd.nodes, ctx, { ...env, top: false, cls: (env.cls || '') + ' thm ' + style, noIndentFirst: true, ...FLUSH });
    const items = [];
    for (const u of us) { items.push(...u.items); fns.push(...u.fns); }
    const first = items[0];
    if (first && first.type === 'p') { first.lead = lead; first.indent = false; first.thmFirst = true; }
    else {
      let php = nd.be;
      if (ctx.src[php] === '\n') php++;
      items.unshift({ type: 'p', inl: items.length ? [] : [{ k: 'seg', f: ctx.f, t: '\u200B', map: [php, php], ph: true }], lead, indent: false, cls: (env.cls || '') + ' thm ' + style, ctx: 'p', f: ctx.f, thmFirst: true, dir: this.dirOf() });
    }
    items[0].sbThm = true;
    items[items.length - 1].saThm = true;
    this.lastTarget = saveT;
    return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
  }

  listBlock(nd, ctx, env) {
    const name = nd.name.replace(/\*$/, '');
    const depth = (env.listDepth || 0) + 1;
    const kind = /enum/.test(name) ? 'enum' : name === 'description' ? 'desc' : 'item';
    const level = kind === 'enum' ? (env.enumDepth || 0) + 1 : (env.itemDepth || 0) + 1;
    // split by \item
    const items = [];
    let cur = null;
    for (const n of nd.nodes) {
      if (n.t === 'cmd' && n.name === 'item') { cur = { cmd: n, nodes: [] }; items.push(cur); }
      else if (cur) cur.nodes.push(n);
    }
    // What labels and numbers it, as TeX reads it (src/lists.js, which the list commands share):
    // its options (enumitem's label=, start=, resume, nosep; the enumerate package's "(a)"), its
    // own set up (\def\labelenumi, \setcounter{enumi}, \setlength{\itemsep}), the preamble's
    // \setlist and \renewcommand of \labelitemi or \theenumi, LaTeX's own by level
    const cfg = this.listCfg || (this.listCfg = this.docBody ? listSetup(this.mainCtx.src, this.docBody.at) : listSetup(''));
    const a0 = nd.args[0];
    const L = { name: nd.name, kind, s: nd.s, e: nd.e, be: nd.be, es: nd.es, opt: a0 && a0.o !== false ? { s: a0.s, e: a0.e, is: a0.is, ie: a0.ie } : null, setupE: items.length ? items[0].cmd.s : nd.es };
    let F = kind === 'desc' ? null : formatOf(ctx.src, L, cfg, { level, depth });
    const vals = env.enumVals || [], thes = env.enumThe || [];
    let count = 0;
    // enumitem's resume, as TeX keeps it: the count of the numbered list that ended last where this
    // one stands (a list's count is kept in the group its \end closes into: one inside an itemize
    // is gone with it), if it ended at this level; a series' (series=foo, resume=foo) everywhere;
    // resume* takes that list's options too
    const scope = this.enumScope || (this.enumScope = { last: null });
    if (F && kind === 'enum') {
      count = F.start - 1;
      if (F.resume) {
        const last = F.resumeName ? this.enumSeries && this.enumSeries.get(F.resumeName) : scope.last;
        count = last && last.level === level ? last.count : 0;
        if (F.resume === 'resume*' && last && last.F && F.from !== 'opt') F = { ...F, label: last.F.label, from: last.F.from, star: last.F.star, ref: F.ref ?? last.F.ref, theStar: last.F.theStar, sep: F.sep || last.F.sep };
      }
    }
    const first = count + 1;
    const bullet = kind === 'item' ? (F && bulletGlyph(F.label)) ?? ['•', '–', '∗', '·'][(level - 1) % 4] : null;
    // the space between items (enumitem's nosep and itemsep, \setlength{\itemsep}, \tightlist)
    const sep = !F || !F.sep ? null : F.sep === 'nosep' ? 0 : F.sep === 'noitemsep' || F.sep === 'tight' ? 0.2 : itemSep(parseLen(F.sep, this.opts.pt));
    const out = [], fns = [];
    const outer = scope;
    this.enumScope = { last: outer.last };
    // what a \label in an item refers to: the item's number, or with a label of its own the one
    // before it (such an item steps no counter)
    let listTarget = this.lastTarget;
    items.forEach((it) => {
      const optA = it.cmd.args[0];
      if (!(optA && kind === 'enum')) count++;
      let label = null;
      const saveT = this.lastTarget;
      if (kind === 'enum') {
        let star = F.label || '\\arabic*.';
        if (F.star && env.enumLabel) star = env.enumLabel.replace(/[{}]/g, '') + star;
        const text = numText(star, count, vals);
        label = [{ k: 'chr', text }];
        // \ref gives enumitem's ref= or its label as written, else LaTeX's \theenumi with the
        // levels above it (1a, 1(a)i), each level's \theenum in its own style
        const own = F.from === 'opt' || F.from === 'setlist';
        const ref = F.ref != null ? numText(F.ref, count, vals) : own ? text : theRef(level, [...vals.slice(0, level - 1), count], [...thes.slice(0, level - 1), F.theStar]);
        if (!optA) listTarget = { num: ref, kind: 'item' };
        this.lastTarget = listTarget;
      }
      if (kind === 'item') label = [{ k: 'chr', text: bullet }];
      if (optA) {
        const kids = this.inl(optA.nodes, ctx, fns);
        if (!kids.length) kids.push({ k: 'seg', f: ctx.f, t: '\u200B', map: [optA.is, optA.is], ph: true });
        label = [{ k: 'sty', st: kind === 'desc' ? 'bf' : '', kids, f: ctx.f, s: optA.s, e: optA.e, is: optA.is, ie: optA.ie }];
      }
      // (the label and the spacing are the block's own: a \setlist in the preamble changes them)
      this.use('L' + count + level + (label && label[0] && label[0].text != null ? label[0].text : '') + '|' + (sep ?? ''));
      const sub = { ...env, ...FLUSH, top: false, listDepth: depth, list: true, enumDepth: kind === 'enum' ? level : (env.enumDepth || 0), itemDepth: kind === 'item' ? level : (env.itemDepth || 0), ctxKind: 'li', noIndentFirst: true, depth: depth, cls: (env.cls || ''),
        enumVals: kind === 'enum' ? [...vals.slice(0, level - 1), count] : vals, enumThe: kind === 'enum' ? [...thes.slice(0, level - 1), F.theStar] : thes,
        enumLabel: kind === 'enum' && label && label[0].text != null ? label[0].text : env.enumLabel };
      const us = this.flow(it.nodes, ctx, sub);
      const its = [];
      for (const u of us) { its.push(...u.items); fns.push(...u.fns); }
      const firstP = its[0] && its[0].type === 'p' ? its[0] : null;
      const itemEnd = it.nodes.length ? it.nodes[it.nodes.length - 1].e : it.cmd.e;
      const meta = { kind, itemS: it.cmd.s, itemE: itemEnd, listS: nd.s, listE: nd.e, cmdE: it.cmd.e, empty: !its.length };
      if (firstP) { firstP.label = label; firstP.labelKind = kind; firstP.li = meta; firstP.indent = false; }
      else {
        let php = optA ? optA.e : it.cmd.ne;
        if (ctx.src[php] === ' ') php++;
        const at = ctx.pm ? ctx.pm[php] : php;
        its.unshift({ type: 'p', inl: [{ k: 'seg', f: ctx.f, t: '\u200B', map: [at, at], ph: true }], label, labelKind: kind, li: meta, indent: false, depth, cls: env.cls || '', ctx: 'li', f: ctx.f, dir: this.dirOf() });
      }
      if (sep != null && its[0]) { its[0].liSep = sep; if (F.sep === 'nosep') its[0].liTop = 0; }
      for (const x of its) { if (x.type === 'p' && x.depth == null) x.depth = depth; if (x.type === 'p' && x !== its[0]) x.li = x.li || { ...meta, cont: true }; if (x.type !== 'p') x.depth = depth; }
      out.push(...its);
      this.lastTarget = saveT;
    });
    this.enumScope = outer;
    if (kind === 'enum') {
      const save = { level, count, F };
      outer.last = save;
      if (F && F.series) (this.enumSeries || (this.enumSeries = new Map())).set(F.series, save);
    }
    if (!out.length) out.push({ type: 'p', inl: [{ k: 'chr', text: '' }], depth, indent: false, ctx: 'p', f: ctx.f });
    // (nosep: no space around the list either)
    if (out.length) { out[0].sbList = depth === 1; out[out.length - 1].saList = depth === 1 && !(F && F.sep === 'nosep'); }
    // (Word's numbered list starts at the list's number, in its style: wordast.js)
    if (kind === 'enum' && out[0] && F) out[0].listFmt = wordFmt(F.label, first);
    return { f: ctx.f, s: nd.s, e: nd.e, items: out, fns };
  }

  theBib(nd, ctx) {
    const items = [{ type: 'h', level: 1, num: '', inl: [{ k: 'chr', text: this.opts.cls === 'article' ? 'References' : 'Bibliography' }], star: true, ctx: 'h', f: ctx.f }];
    const fns = [];
    let cur = null; const groups = [];
    for (const n of nd.nodes) {
      if (n.t === 'cmd' && n.name === 'bibitem') { cur = { cmd: n, nodes: [] }; groups.push(cur); }
      else if (cur) cur.nodes.push(n);
    }
    groups.forEach((g, k) => {
      const lab = g.cmd.args[0] ? texToPlain(this.argText(ctx, g.cmd.args[0])) : null;
      const inl = this.inl(g.nodes.filter((n) => !(n.t === 'cmd' && n.name === 'newblock')), ctx, fns);
      trimInl(inl);
      const numeric = this.opts.citeStyle === 'numeric' || !lab;
      items.push({ type: 'p', inl, indent: false, cls: 'bibitem' + (numeric ? ' num' : ''), label: numeric ? [{ k: 'chr', text: '[' + (k + 1) + ']' }] : null, labelKind: 'bib', ctx: 'p', f: ctx.f, depth: numeric ? 1 : 0, dir: this.dirOf() });
    });
    return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
  }

  floatBlock(nd, ctx, env, kindOver, alignOver) {
    const kind = kindOver || (/table/.test(nd.name) ? 'table' : 'figure');
    const fns = [];
    const parts = [];
    let num = '';
    const saveT = this.lastTarget;
    let align = alignOver || null;
    let para = [];
    // (B7) the settings before a table in the float, drawn with it
    let tset = null;
    const flushP = () => {
      if (!para.length) return;
      const ns = para; para = [];
      if (ns.every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) || (n.t === 'cmd' && INVIS.has(n.name)))) {
        for (const n of ns) if (n.t === 'cmd' && n.name === 'label') this.label(this.argText(ctx, n.args[0]), ctx);
        return;
      }
      const inl = this.inl(ns, ctx, fns);
      trimInl(inl);
      if (inl.length) parts.push({ type: 'p', inl, align: align || dflt, indent: false, ctx: 'p', f: ctx.f, dir: this.dirOf() });
    };
    // (with no declaration: the class's own, src/model.js preamble)
    const dflt = this.opts.floatAlign || 'left';
    const walk = (nodes) => {
      for (const [i, n] of nodes.entries()) {
        if (n.t === 'par') { flushP(); continue; }
        // (B2) \centering, \raggedleft, \raggedright; with none TeX sets a float's parts at the left
        // margin (a float's \parindent is 0)
        if (n.t === 'cmd' && (n.name === 'centering' || n.name === 'raggedleft' || n.name === 'raggedright')) { align = n.name === 'centering' ? 'center' : n.name === 'raggedleft' ? 'right' : 'left'; continue; }
        if (n.t === 'env' && (n.name === 'center' || n.name === 'centering' || n.name === 'flushleft' || n.name === 'flushright')) { flushP(); const was = align; align = n.name === 'center' || n.name === 'centering' ? 'center' : n.name === 'flushleft' ? 'left' : 'right'; walk(n.nodes); flushP(); align = was; continue; }
        // (\centerline{...}: its words a centred line of their own)
        if (n.t === 'cmd' && n.name === 'centerline' && n.args && n.args[0] && n.args[0].nodes) { flushP(); const was = align; align = 'center'; para = [...n.args[0].nodes]; flushP(); align = was; continue; }
        if (n.t === 'cmd' && (n.name === 'caption' || n.name === 'captionof')) {
          flushP();
          if (!num) {
            this.c[kind]++;
            num = this.withinPrefix(kind) + this.c[kind];
            this.lastTarget = { num, kind };
          }
          this.use('F' + kind + num);
          const a = n.name === 'captionof' ? n.args[2] : n.args[1];
          const kids = a ? this.inl(a.nodes, ctx, fns) : [];
          if (a && !kids.length) kids.push({ k: 'seg', f: ctx.f, t: '​', map: [a.is, a.is], ph: true });
          parts.push({ type: 'caption', kind, num, inl: kids, f: ctx.f, ctx: 'cap', dir: this.dirOf() });
          continue;
        }
        if (n.t === 'env' && /^(tabular|tabularx|tabular\*|tabulary|longtable|array)$/.test(n.name)) { flushP(); const t = this.tabular(n, ctx, fns, tset); if ((align || dflt) !== 'center') t.falign = align || dflt; parts.push(t); continue; }
        // (a size is the table's only where a table follows it in the float: else it is the text's)
        { const st = this.tableSetting(n, ctx); if (st && (st.key !== 'size' || nodes.slice(i + 1, i + 40).some((x) => x.t === 'env' && /^(tabular|tabularx|tabular\*|tabulary|longtable)$/.test(x.name)))) { (tset = tset || {})[st.key] = st.value; continue; } }
        // (B7) a table csvsimple sets from a data file of the project: drawn from the file
        if (n.t === 'cmd' && /^csvauto(book)?tabular$/.test(n.name) && n.args[1]) { const t = this.csvTable(n, ctx); if (t) { flushP(); if ((align || dflt) !== 'center') t.falign = align || dflt; parts.push(t); continue; } }
        if (n.t === 'env' && /^(minipage|subfigure|subtable|threeparttable|adjustbox|small|footnotesize|scriptsize)$/.test(n.name)) { flushP(); walk(n.nodes); flushP(); continue; }
        // a language or direction environment around a figure's parts: they run its way
        if (n.t === 'env' && this.dirEnv(n, ctx)) { flushP(); const was = this.dir; this.dir = this.dirEnv(n, ctx).dir || was; walk(n.nodes); flushP(); this.dir = was; continue; }
        if (n.t === 'env' && n.name === 'tablenotes') { flushP(); const r = this.container(n, ctx, env, { cls: 'z-footnotesize', noIndentFirst: true }); parts.push(...r.items); fns.push(...r.fns); continue; }
        if (n.t === 'cmd' && n.name === 'resizebox' && n.args[2]) { walk(n.args[2].nodes); continue; }
        if (n.t === 'cmd' && n.name === 'label') { this.label(this.argText(ctx, n.args[0]), ctx); continue; }
        if (n.t === 'env' && n.math) { flushP(); parts.push(this.displayMath(n, ctx, n.name)); continue; }
        if (n.t === 'math' && n.display) { flushP(); parts.push(this.displayMath(n, ctx, null)); continue; }
        para.push(n);
      }
    };
    walk(nd.nodes);
    flushP();
    this.lastTarget = saveT;
    if (!parts.length) parts.push({ type: 'p', inl: [{ k: 'chip', f: ctx.f, s: nd.s, e: nd.e, text: kind, title: 'Empty ' + kind }], align: 'center', indent: false, ctx: 'p', f: ctx.f });
    const placement = nd.args[0] ? this.argText(ctx, nd.args[0]) : 'tbp';
    // (a wrapfigure's width: the line its pictures' \linewidth is, B8)
    const wrapW = /^wrap(figure|table)$/.test(nd.name) && nd.args[3] ? this.argText(ctx, nd.args[3]).trim() : null;
    return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'float', kind, num, parts, f: ctx.f, placement, wide: /\*$/.test(nd.name), wrapW }], fns };
  }

  // set: what stands before the table in its float or group (B7: \rowcolors, \arraystretch,
  // \tabcolsep, \arrayrulewidth, \arrayrulecolor), drawn with it
  tabular(nd, ctx, fnsOut, set) {
    const fns = fnsOut || [];
    const specArg = nd.name === 'tabular*' || nd.name === 'tabularx' || nd.name === 'tabulary' ? nd.args[nd.args.length - 1] : nd.args[1] || nd.args[0];
    const spec = specArg ? this.argText(ctx, specArg) : 'l';
    const cols = parseColSpec(spec);
    const rows = [];
    let row = { cells: [], top: [], s: null };
    let cell = [];
    let pendingRules = [];
    // (where each cell starts: an empty cell, && or & \\, has no node to hold the caret)
    let at = specArg ? specArg.e : nd.s;
    const pushCell = () => { cell.p0 = at; row.cells.push(cell); cell = []; };
    const pushRow = (sepEnd) => {
      pushCell();
      const empty = row.cells.length === 1 && row.cells[0].every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()));
      row.rulesAbove = pendingRules; pendingRules = [];
      row.e = sepEnd;
      if (!empty || row.rulesAbove.length) rows.push({ ...row, empty });
      row = { cells: [], top: [], s: sepEnd };
    };
    for (const n of nd.nodes) {
      if (n.t === 'special' && n.ch === '&') { pushCell(); at = n.e; continue; }
      if (n.t === 'cmd' && (n.name === '\\' || n.name === 'tabularnewline')) { pushRow(n.e); at = n.e; continue; }
      if (n.t === 'cmd' && /^(hline|toprule|midrule|bottomrule|cline|cmidrule|specialrule|addlinespace|morecmidrules|hhline)$/.test(n.name)) {
        if (cell.every((x) => x.t === 'comment' || (x.t === 'text' && !ctx.src.slice(x.s, x.e).trim())) && row.cells.length === 0) {
          const kindR = n.name === 'toprule' || n.name === 'bottomrule' ? 'heavy' : n.name === 'addlinespace' ? 'space' : 'light';
          let range = null;
          if (n.name === 'cline' || n.name === 'cmidrule') {
            const m = /(\d+)\s*-\s*(\d+)/.exec(this.argText(ctx, n.args[n.args.length - 1]));
            if (m) range = [+m[1], +m[2]];
          }
          pendingRules.push({ kind: kindR, range });
          cell = [];
          at = n.e;
          continue;
        }
      }
      // (\noalign{…} between rows, as pandoc writes after each rule, and longtable's markers: no cell's)
      if (n.t === 'cmd' && /^(noalign|endhead|endfirsthead|endfoot|endlastfoot)$/.test(n.name) && row.cells.length === 0 && cell.every((x) => x.t === 'comment' || (x.t === 'text' && !ctx.src.slice(x.s, x.e).trim()))) {
        cell = [];
        at = n.e;
        continue;
      }
      if (row.s == null) row.s = n.s;
      cell.push(n);
    }
    pushCell();
    {
      row.rulesAbove = pendingRules;
      const empty = row.cells.every((c) => c.every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim())));
      if (!empty || pendingRules.length) rows.push({ ...row, empty });
    }
    const outRows = rows.map((r) => {
      // (each cell knows its column, for the column's own bold, colour and alignment)
      let col = 0;
      return { rules: r.rulesAbove, empty: r.empty, cells: r.empty ? [] : r.cells.map((c) => { const x = this.tableCell(c, ctx, fns, col, cols); col += x.span; return x; }) };
    });
    // the columns stay in their order; the words in the cells run the way the text around runs
    const t = { type: 'tabular', cols, rows: outRows, f: ctx.f, s: nd.s, e: nd.e, fns, dir: this.dirOf() };
    if (set) Object.assign(t, set);
    return t;
  }
  // \csvautotabular{file} and \csvautobooktabular{file} (B7), as csvsimple sets them: the file's
  // first line the header, every value centred, rules round the header (booktabs' or \hline and
  // bars). Read only on the page (each cell stands for the command): the data is the file's. At
  // most 200 rows of 40 values; null where the file is not in the project.
  csvTable(nd, ctx) {
    const name = this.argText(ctx, nd.args[1]).trim();
    const text = this.files.get(name) ?? this.files.get(name + '.csv');
    if (text == null || text.length > 2000000) return null;
    const opt = nd.args[0] ? this.argText(ctx, nd.args[0]) : '';
    const sep = /separator\s*=\s*semicolon/.test(opt) ? ';' : /separator\s*=\s*tab/.test(opt) ? '\t' : /separator\s*=\s*space/.test(opt) ? ' ' : ',';
    const rows = csvRows(text, sep);
    if (!rows.length) return null;
    // (a stranger's project may set one big file in many tables: past a budget of cells for the
    // whole document the command stays a command)
    this.csvBudget = (this.csvBudget ?? CSV_BUDGET) - rows.length * Math.max(...rows.map((r) => r.length));
    if (this.csvBudget < 0) return null;
    const n = Math.max(...rows.map((r) => r.length));
    const book = nd.name === 'csvautobooktabular';
    const cols = Array.from({ length: n }, (_, k) => ({ align: 'c', vl: !book && k === 0 ? 1 : 0, vr: book ? 0 : 1 }));
    const cell = (t) => ({ inl: t ? [this.atom(ctx, { k: 'chip', s: nd.s, e: nd.e, text: t, plain: true, title: '\\' + nd.name + '{' + name + '}: from the file' })] : [], span: 1, align: 'c', bg: null, rowbg: null });
    const rule = (kind) => ({ kind, range: null });
    const out = rows.map((r, k) => ({ rules: k === 0 ? [rule(book ? 'heavy' : 'light')] : k === 1 ? [rule('light')] : [], empty: false, cells: Array.from({ length: n }, (_, j) => cell(r[j] || '')) }));
    out.push({ rules: [rule(book ? 'heavy' : 'light')], empty: true, cells: [] });
    this.use('csv' + name + text.length);
    return { type: 'tabular', cols, rows: out, f: ctx.f, s: nd.s, e: nd.e, fns: [], dir: this.dirOf() };
  }
  // A setting written before a table (B7): { key, value } or null
  tableSetting(n, ctx) {
    if (n.t !== 'cmd') return null;
    // (a size for the table's words: \small before it, as Repeat Header Rows carries a float's)
    if (/^(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)$/.test(n.name) && !n.args.some(Boolean)) return { key: 'size', value: n.name };
    const a = (k) => (n.args[k] ? this.argText(ctx, n.args[k]).trim() : '');
    if (n.name === 'rowcolors' && n.args.length >= 3) {
      const [st, odd, even] = n.args.filter(Boolean).slice(-3).map((x) => this.argText(ctx, x).trim());
      return { key: 'band', value: { start: parseInt(st, 10) || 1, odd: odd ? this.colorArg(ctx, null, n.args.filter(Boolean).slice(-2)[0]) : null, even: even ? this.colorArg(ctx, null, n.args.filter(Boolean).slice(-1)[0]) : null } };
    }
    if (n.name === 'renewcommand' && n.def && n.def.name === 'arraystretch') return { key: 'stretch', value: parseFloat(n.def.body) || 1 };
    if (n.name === 'setlength') {
      const k = a(0).replace(/^\\/, '');
      if (k === 'tabcolsep' || k === 'arrayrulewidth' || k === 'extrarowheight') return { key: k, value: a(1) };
    }
    if (n.name === 'arrayrulecolor' && n.args.length) return { key: 'rulecolor', value: this.colorArg(ctx, n.args.length > 1 ? n.args[0] : null, n.args[n.args.length - 1]) };
    return null;
  }

  // A list in a table cell, for the page to draw (read only: a cell's words are edited on the
  // page, a list in it as source). Only a plain one: \item after \item, before the first nothing
  // but space and the settings pandoc writes, no footnote (its number is the page's to give).
  // Anything else is left to what the page did before. build: its items' inlines, else whether.
  cellList(nd, ctx, build) {
    const items = [];
    for (const n of nd.nodes) {
      if (n.t === 'cmd' && n.name === 'item') { if (n.args.some(Boolean)) return null; items.push([]); continue; }
      if (items.length) { items[items.length - 1].push(n); continue; }
      if (n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) || (n.t === 'cmd' && /^(tightlist|def|setcounter|setlength)$/.test(n.name))) continue;
      return null;
    }
    if (!items.length || hasCmd(nd.nodes, 'footnote')) return null;
    if (!build) return true;
    return { ordered: nd.name === 'enumerate', items: items.map((ns) => { const inl = this.inl(ns, ctx, []); trimInl(inl); return inl; }) };
  }

  tableCell(nodes, ctx, fns, ci, cols) {
    // (where the cell starts, kept before the filter below makes another array)
    const p0 = nodes.p0;
    let bg = null, rowbg = null;
    nodes = nodes.filter((n) => {
      if (n.t === 'cmd' && (n.name === 'cellcolor' || n.name === 'rowcolor') && n.args.length) {
        const c = this.colorArg(ctx, n.args.length > 1 ? n.args[0] : null, n.args[n.args.length - 1]);
        if (n.name === 'cellcolor') bg = c; else rowbg = c;
        return false;
      }
      return !(n.t === 'cmd' && /^(columncolor|rowcolors|arrayrulecolor|hiderowcolors|showrowcolors)$/.test(n.name));
    });
    // detect \multicolumn / \multirow
    const vis = nodes.filter((n) => !(n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim())));
    let span = 1, align = (cols[ci] && cols[ci].align) || 'l', inner = nodes, pos = null, rowsN = 1, rot = 0, vpos = null;
    if (vis.length === 1 && vis[0].t === 'cmd' && vis[0].name === 'multicolumn' && vis[0].args[2]) {
      const mc = vis[0];
      span = parseInt(this.argText(ctx, mc.args[0]), 10) || 1;
      const sp = parseColSpec(this.argText(ctx, mc.args[1]));
      if (sp[0]) align = sp[0].align;
      inner = mc.args[2].nodes;
      pos = mc.args[2].is;
    } else if (vis.length === 1 && vis[0].t === 'cmd' && vis[0].name === 'multirow') {
      const a = vis[0].args.filter(Boolean).pop();
      inner = a.nodes; pos = a.is;
    }
    // (B7) a \multirow inside the \multicolumn too, and how many rows it covers
    // (\multirow[vpos]{n}[struts]{width}[move]{text}); words turned whole by \rotatebox{90} or {270}
    const own = (ns) => ns.filter((n) => !(n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim())));
    let iv = own(inner), mr = vis.length === 1 && vis[0].t === 'cmd' && vis[0].name === 'multirow' ? vis[0] : null;
    if (!mr && iv.length === 1 && iv[0].t === 'cmd' && iv[0].name === 'multirow' && iv[0].args[5]) { mr = iv[0]; inner = mr.args[5].nodes; pos = mr.args[5].is; iv = own(inner); }
    if (mr && mr.args[1]) {
      rowsN = parseInt(this.argText(ctx, mr.args[1]), 10) || 1;
      if (mr.args[0]) vpos = this.argText(ctx, mr.args[0]).trim();
    }
    if (iv.length === 1 && iv[0].t === 'cmd' && iv[0].name === 'rotatebox' && iv[0].args[2]) {
      const ang = ((parseInt(this.argText(ctx, iv[0].args[1]), 10) % 360) + 360) % 360;
      if (ang === 90 || ang === 270) { rot = ang; inner = iv[0].args[2].nodes; pos = iv[0].args[2].is; }
    }
    this.inCell++;
    let inl;
    try { inl = this.inl(inner, ctx, fns); } finally { this.inCell--; }
    trimInl(inl);
    if (!inl.length) {
      // (a cell of spaces only: what is typed there goes after its line's end, or after the
      // space after its &, so "& x &" and a new row's "\nx &" come out as a person writes them)
      let p = pos != null ? pos : (nodes.length ? nodes[0].s : p0 != null ? p0 : null);
      // (the spaces around it, the ones a command before it took in too, at most 200 each way)
      if (pos == null && p != null && nodes.every((n) => n.t === 'text' && !ctx.src.slice(n.s, n.e).trim())) {
        const src = ctx.src;
        let a = p, z = nodes.length ? nodes[nodes.length - 1].e : p;
        while (a > 0 && a > p - 200 && /[ \t\r\n]/.test(src[a - 1])) a--;
        while (z < src.length && z < p + 200 && /[ \t\r\n]/.test(src[z])) z++;
        const t = src.slice(a, z), nl = t.lastIndexOf('\n');
        p = a + (nl >= 0 ? nl + 1 : t[0] === ' ' ? 1 : 0);
      }
      if (p != null) inl.push({ k: 'seg', f: ctx.f, t: '​', map: [p, p], ph: true });
    }
    const col = cols[ci] || {};
    const out = { inl, span, align, bg: bg || (col.bg ? (col.bg.model ? colorValue(col.bg.model, col.bg.value) || col.bg.value : this.named(col.bg.value) || col.bg.value) : null), rowbg };
    if (rowsN > 1) out.rows = Math.min(rowsN, 200);
    if (rot) out.rot = rot;
    if (vpos) out.vpos = vpos;
    if (col.bold) out.bold = true;
    if (span === 1 && col.palign) out.palign = col.palign;
    if (col.valign) out.valign = col.valign;
    return out;
  }

  // ---- display math -----------------------------------------------------------
  displayMath(nd, ctx, envName) {
    const inner = ctx.src.slice(nd.raw ? nd.be : nd.is, nd.raw ? nd.es : nd.ie);
    const is = nd.raw ? nd.be : nd.is, ie = nd.raw ? nd.es : nd.ie;
    const env = envName || (nd.delim === '$$' ? '$$' : '\\[');
    const base = env.replace(/\*$/, '');
    const star = /\*$/.test(env) || env === '$$' || env === '\\[' || base === 'displaymath' || base === 'math';
    let rows = [];
    let multi = ['align', 'flalign', 'eqnarray', 'alignat', 'gather', 'multline'].includes(base);
    const tags = [];
    const out = [];
    if (multi) {
      const rs = splitRows(inner);
      rs.forEach((r, k) => {
        let t = inner.slice(r.s, r.e);
        const info = this.rowInfo(t, ctx);
        t = info.tex;
        let tag = null;
        if (base === 'multline') {
          if (k === rs.length - 1 && !star && !info.notag) tag = info.tag ?? this.eqNumber();
          else if (info.tag) tag = info.tag;
        } else if (info.tag != null) tag = info.tag;
        else if (!star && !info.notag && t.trim() !== '') tag = this.eqNumber();
        for (const key of info.labels) { this.lastTarget = { num: tag || '', kind: 'equation' }; this.label(key, ctx); }
        if (base === 'eqnarray') t = t.replace(/&\s*([^&]*?)\s*&/, '&$1 ');
        out.push(t + (tag != null ? ' \\tag{' + tag + '}' : ''));
        if (tag != null) tags.push(tag);
      });
      let envOut = base === 'gather' || base === 'multline' ? 'gather*' : base === 'alignat' ? 'alignat*' : 'align*';
      let tex;
      if (base === 'alignat') {
        const m = /^\s*\{\s*(\d+)\s*\}/.exec(ctx.src.slice(nd.nameEnd, nd.be));
        tex = '\\begin{alignat*}{' + (m ? m[1] : (nd.args[0] ? this.argText(ctx, nd.args[0]) : '1')) + '}' + out.join('\\\\') + '\\end{alignat*}';
      } else tex = '\\begin{' + envOut + '}' + out.join('\\\\') + '\\end{' + envOut + '}';
      this.use('M' + tags.join(','));
      return { type: 'math', f: ctx.f, s: nd.s, e: nd.e, is, ie, env, tex, tags };
    }
    const info = this.rowInfo(inner, ctx);
    let tag = info.tag;
    if (tag == null && !star && !info.notag) tag = this.eqNumber();
    for (const key of info.labels) { this.lastTarget = { num: tag || '', kind: 'equation' }; this.label(key, ctx); }
    const tex = info.tex + (tag != null ? ' \\tag{' + tag + '}' : '');
    if (tag != null) tags.push(tag);
    this.use('M' + tags.join(','));
    return { type: 'math', f: ctx.f, s: nd.s, e: nd.e, is, ie, env, tex, tags };
  }

  rowInfo(t, ctx) {
    const labels = [];
    let tag = null, notag = false;
    t = t.replace(/\\label\s*\{([^}]*)\}/g, (m, k) => { labels.push(k); return ''; });
    t = t.replace(/\\(nonumber|notag)\b/g, () => { notag = true; return ''; });
    t = t.replace(/\\tag\*?\s*\{([^}]*)\}/g, (m, k) => { tag = k; return ''; });
    t = this.mathRefs(t);
    return { tex: t, labels, tag, notag };
  }

  mathRefs(t) {
    t = t.replace(/\\(eqref|ref|cref|Cref|autoref)\s*\{([^}]*)\}/g, (m, cmd, key) => {
      const L = this.lookupLabel(key.split(',')[0]);
      this.use('r' + key + (L ? L.num : '?'));
      const n = L ? L.num : '??';
      return cmd === 'eqref' ? '\\text{(' + n + ')}' : '\\text{' + n + '}';
    });
    t = t.replace(/\\intertext\s*\{([^}]*)\}/g, '\\text{$1}');
    t = t.replace(/\\(shortintertext)\s*\{([^}]*)\}/g, '\\text{$2}');
    // KaTeX takes \textcolor{#RRGGBB}{..} and CSS names: a colour given by its numbers
    // (\textcolor[HTML]{C00000}) or defined in the preamble goes in as its value
    if (t.includes('color')) t = t.replace(/\\(textcolor|color|colorbox)\s*(?:\[([^\]{}]*)\])?\s*\{([^{}]*)\}/g, (m, cmd, model, spec) => {
      const v = model != null ? colorValue(model, spec) : this.named(spec.trim());
      return v ? '\\' + cmd + '{' + v + '}' : m;
    });
    return t;
  }

  // ---- inline conversion --------------------------------------------------------
  inl(nodes, ctx, fns, out = []) {
    const acc = new Acc(out, ctx);
    // \selectlanguage{arabic} in the middle of a line (and bidi's \setRTL): the words after it,
    // up to the next one or the line's end, turn. They are one run beside the others, a wrapper
    // only where they run another way than the line did at its start (base); `out` is then the
    // run's own list. The direction stays for what follows (flow reads it for the next
    // paragraph) until the group or the environment it is in ends. Runs are made here in the
    // loop, never by a call per switch: 550 switches in one paragraph overflowed the stack.
    const top = out, base = this.dir;
    let run = null;
    const closeRun = () => {
      if (!run) return;
      if (run.kids.some((x) => x.k !== 'seg' || x.t.trim())) top.push(run); else top.push(...run.kids);
      run = null;
    };
    for (let k = 0; k < nodes.length; k++) {
      const nd = nodes[k];
      const decl = nd.t === 'cmd' ? this.declDir(nd, ctx) : null;
      if (decl) {
        if (decl === this.dir) continue;
        acc.flush();
        closeRun();
        this.dir = decl;
        if (decl !== base) run = { k: 'sty', st: 'dir', dir: decl, kids: [], f: ctx.f, decl: true };
        out = acc.out = run ? run.kids : top;
        continue;
      }
      switch (nd.t) {
        case 'text': this.text(nd, ctx, acc); break;
        case 'par': acc.ch(' ', nd.s, nd.e); break;
        case 'comment': acc.flush(); break;
        case 'special': {
          if (nd.ch === '~') acc.ch(' ', nd.s, nd.e);
          else { acc.flush(); out.push(this.chip(ctx, nd.s, nd.e, nd.ch, nd.err ? 'Unbalanced ' + nd.ch : 'Special character ' + nd.ch + ' is only valid in math or tables', true)); }
          break;
        }
        case 'stray': acc.flush(); out.push(this.chip(ctx, nd.s, nd.e, /^begin/.test(nd.name) ? '\\' + nd.name : '\\end{' + nd.name + '}', /^begin/.test(nd.name) ? 'Environment is never closed' : 'Unmatched \\end', true)); break;
        case 'math': {
          acc.flush();
          const tex = this.mathRefs(ctx.src.slice(nd.is, nd.ie).replace(/\\label\s*\{[^}]*\}/g, ''));
          out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, is: nd.is, ie: nd.ie, tex, display: false }));
          this.use('m');
          break;
        }
        case 'verb': acc.flush(); out.push(this.atom(ctx, { k: 'verb', s: nd.s, e: nd.e, text: ctx.src.slice(nd.is, nd.ie) })); break;
        case 'group': {
          acc.flush();
          if (!nd.nodes.length) break;
          // (a \selectlanguage inside the group ends with it)
          const dirWas = this.dir;
          const kids = this.inl(nd.nodes, ctx, fns);
          this.dir = dirWas;
          out.push(...kids);
          break;
        }
        case 'env': {
          acc.flush();
          if (nd.name === 'math') {
            const tex = this.mathRefs(ctx.src.slice(nd.be, nd.es));
            out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, is: nd.be, ie: nd.es, tex, display: false }));
          } else if (/^(tabular|array)$/.test(nd.name)) {
            // in a table's cell the inner table is drawn (read only; edited as source)
            const table = this.inCell && nd.name === 'tabular' && nd.nodes && !hasCmd(nd.nodes, 'footnote') ? this.tabular(nd, ctx, []) : null;
            if (table && table.rows.some((r) => !r.empty)) out.push(this.atom(ctx, { k: 'chip', s: nd.s, e: nd.e, text: 'table', title: 'A table in a table cell. Click to edit its source.', plain: true, table }));
            else out.push(this.chip(ctx, nd.s, nd.e, 'table', 'Inline tabular'));
          } else if (this.inCell && /^(itemize|enumerate)$/.test(nd.name) && nd.nodes && this.cellList(nd, ctx)) {
            out.push(this.atom(ctx, { k: 'chip', s: nd.s, e: nd.e, text: 'list', title: 'A list in a table cell. Click to edit its source.', plain: true, list: this.cellList(nd, ctx, true) }));
          } else {
            // In a line of text. A language or direction environment turns its words (the page
            // keeps it as a wrapper, so Enter inside it closes and opens it again as for \textbf);
            // CJK and every other environment show their text as it is.
            const wrap = nd.nodes ? this.dirEnv(nd, ctx) : null;
            const dirWas = this.dir;
            const turn = wrap && wrap.dir && !(wrap.dir === 'ltr' && dirWas === 'ltr');
            if (turn) this.dir = wrap.dir;
            const kids = nd.nodes ? this.inl(nd.nodes, ctx, fns) : [];
            this.dir = dirWas;
            if (turn) {
              if (!kids.length) kids.push(this.ph(ctx, nd.be));
              out.push(this.styAtom(ctx, { k: 'sty', st: 'dir', dir: wrap.dir, kids, s: nd.s, e: nd.e, is: nd.be, ie: nd.es, cmd: nd.name }));
            } else out.push(...kids);
          }
          break;
        }
        case 'cmd': {
          const consumed = this.cmd(nd, ctx, fns, acc, out, nodes, k);
          if (consumed) { closeRun(); return top; }
          break;
        }
        default: break;
      }
    }
    acc.flush();
    closeRun();
    return top;
  }

  chip(ctx, s, e, text, title, err) { return this.atom(ctx, { k: 'chip', s, e, text, title, err: !!err }); }

  atom(ctx, a) {
    a.f = ctx.f;
    if (ctx.pm) {
      const s = ctx.pm[a.s], e = ctx.pm[a.e - 1];
      // made by a macro's own text (its \newcommand body, not an argument): nothing of it is in
      // the file at the call site, so it is shown but not edited there. Its inner range is cleared
      // too: left as offsets into the macro's text, an edit of the formula wrote them into the file
      // at those numbers (\documentcla+1ss).
      if (s < 0 || e < 0) { a.ro = true; a.s = -1; a.e = -1; if (a.is != null) { a.is = -1; a.ie = -1; } }
      else { a.s = s; a.e = e + 1; if (a.is != null) { a.is = ctx.pm[a.is]; a.ie = ctx.pm[a.ie - 1] + 1; if (a.is < 0 || a.ie <= 0) a.ro = true; } }
    }
    return a;
  }

  text(nd, ctx, acc) {
    const src = ctx.src;
    const de = this.opts.lang === 'de';
    let k = nd.s;
    while (k < nd.e) {
      const c = src[k];
      if (isWS(c)) { let j = k; while (j < nd.e && isWS(src[j])) j++; acc.ch(' ', k, j); k = j; continue; }
      if (c === '-' && src[k + 1] === '-' && k + 1 < nd.e) {
        if (src[k + 2] === '-' && k + 2 < nd.e) { acc.ch('—', k, k + 3); k += 3; } else { acc.ch('–', k, k + 2); k += 2; }
        continue;
      }
      if (c === '`') { if (src[k + 1] === '`' && k + 1 < nd.e) { acc.ch('“', k, k + 2); k += 2; } else { acc.ch('‘', k, k + 1); k++; } continue; }
      if (c === "'") { if (src[k + 1] === "'" && k + 1 < nd.e) { acc.ch('”', k, k + 2); k += 2; } else { acc.ch('’', k, k + 1); k++; } continue; }
      if ((c === '?' || c === '!') && src[k + 1] === '`' && k + 1 < nd.e) { acc.ch(c === '?' ? '¿' : '¡', k, k + 2); k += 2; continue; }
      if (c === '"') {
        if (de && k + 1 < nd.e) {
          const d = src[k + 1];
          const um = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü', s: 'ß', '`': '„', "'": '“', '-': '', '=': '-', '|': '' }[d];
          if (um !== undefined) { if (um) acc.ch(um, k, k + 2); k += 2; continue; }
        }
        acc.ch('”', k, k + 1); k++; continue;
      }
      const code = src.charCodeAt(k);
      if (code >= 0xD800 && code < 0xDC00 && k + 1 < nd.e) { acc.ch(src.slice(k, k + 2), k, k + 2); k += 2; continue; }
      acc.ch(c, k, k + 1); k++;
    }
  }

  cmd(nd, ctx, fns, acc, out, nodes, k) {
    const name = nd.name;
    const A = (i) => this.argText(ctx, nd.args[i]);
    if (nd.accent) {
      const a = nd.args[0];
      let base = '';
      if (a) {
        if (a.nodes.length === 1 && a.nodes[0].t === 'cmd' && a.nodes[0].name in CHARS) base = CHARS[a.nodes[0].name];
        else base = texToPlain(ctx.src.slice(a.is, a.ie));
      }
      if (base === 'ı') base = 'i';
      if (base === 'ȷ') base = 'j';
      const ch = base ? (base.slice(0, 1) + ACCENTS[name]).normalize('NFC') + base.slice(1) : ACCENTS[name];
      acc.ch(ch, nd.s, nd.e);
      return false;
    }
    if (name in CHARS && !(this.textMacros.has(name))) {
      const v = CHARS[name];
      if (v.length >= 1 && v.length <= 2) acc.ch(v, nd.s, nd.e);
      return false;
    }
    if (name === '\\' || name === 'newline' || name === 'linebreak') {
      acc.flush();
      if (this.inTable) return false;
      out.push(this.atom(ctx, { k: 'br', s: nd.s, e: nd.e }));
      return false;
    }
    const turn = this.dirCmd(nd, ctx);
    if (turn) {
      acc.flush();
      const [d, a] = turn;
      // left to right inside left to right changes nothing: its words are words of the line
      if (d === 'ltr' && this.dir === 'ltr') { out.push(...this.inl(a.nodes, ctx, fns)); return false; }
      const dirWas = this.dir;
      this.dir = d;
      const kids = this.inl(a.nodes, ctx, fns);
      this.dir = dirWas;
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: 'dir', dir: d, kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name }));
      return false;
    }
    // graphicx's \scalebox{x}[y]{...} around a picture and \rotatebox[...]{angle}{...}: drawn scaled
    // and turned (B8: Flip Vertical writes \scalebox{1}[-1]{...}); a \scalebox of words is the Font
    // group's below
    const onlyPic = (g) => { const sol = g ? g.nodes.filter((x) => !(x.t === 'text' && !ctx.src.slice(x.s, x.e).trim()) && x.t !== 'comment') : []; return sol.length === 1 && sol[0].t === 'cmd' && /^(includegraphics|reflectbox|scalebox|rotatebox|fbox)$/.test(sol[0].name); };
    if ((name === 'rotatebox' || (name === 'scalebox' && onlyPic(nd.args.filter((x) => x && !x.o).pop()))) && nd.args.filter((x) => x && !x.o).length >= 2) {
      acc.flush();
      const ms = nd.args.filter((x) => x && !x.o), a = ms[ms.length - 1];
      const n1 = parseFloat(this.argText(ctx, ms[0])), o = name === 'scalebox' ? nd.args.find((x) => x && x.o) : null;
      const xf = name === 'scalebox' ? { sx: Number.isFinite(n1) ? n1 : 1, sy: o && Number.isFinite(parseFloat(this.argText(ctx, o))) ? parseFloat(this.argText(ctx, o)) : (Number.isFinite(n1) ? n1 : 1) } : { rot: Number.isFinite(n1) ? n1 : 0 };
      const kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: 'xf', xf, kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name }));
      return false;
    }
    // a size or a family for the rest of the group, as the Font group writes them:
    // {\fontsize{14}{17}\selectfont ...}, {\fontfamily{ppl}\selectfont ...}, {\fontspec{TeX Gyre Pagella} ...}
    if ((name === 'fontsize' && nd.args[1]) || (name === 'fontfamily' && nd.args[0]) || (name === 'fontspec' && nd.args[1])) {
      acc.flush();
      const kids = this.inl(nodes.slice(k + 1), ctx, fns);
      if (name === 'fontsize') { const pt = parseFloat(A(0)); out.push({ k: 'sty', st: 'fs', fs: pt > 0 && pt < 400 ? pt : null, kids, f: ctx.f, decl: true }); }
      else { const look = fontLook(A(name === 'fontspec' ? 1 : 0)); out.push({ k: 'sty', st: look ? 'ff-' + look : 'ff', kids, f: ctx.f, decl: true }); }
      return true;
    }
    // ruby (luatexja-ruby, the ruby package): the reading above its base, as the title the page shows
    if (name === 'ruby' && nd.args[1] && nd.args[2]) {
      acc.flush();
      const a = nd.args[1], kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: 'ruby', kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name, title: texToPlain(A(2)).replace(/\|/g, '') }));
      return false;
    }
    // a run moved up or down, or scaled across: \raisebox{2pt}{..}, \scalebox{1.2}[1]{..}
    if ((name === 'raisebox' || name === 'scalebox') && nd.args[0] && nd.args[nd.args.length - 1]) {
      acc.flush();
      const a = nd.args[nd.args.length - 1], kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      const v = name === 'raisebox' ? parseLen(A(0), this.opts.pt) : parseFloat(A(0));
      const x = { k: 'sty', st: name === 'raisebox' ? 'raise' : 'scale', kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name };
      if (typeof v === 'number' && Number.isFinite(v)) x[name === 'raisebox' ? 'raise' : 'scale'] = v;
      out.push(this.styAtom(ctx, x));
      return false;
    }
    if (name in STY && nd.args.some(Boolean)) {
      acc.flush();
      const a = nd.args.filter(Boolean).pop();
      if (name === 'foreignlanguage') { out.push(...this.inl(a.nodes, ctx, fns)); return false; }
      const kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      const x = { k: 'sty', st: STY[name], kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name };
      // the highlighter's colour (\hl[green]{..}, the Font group's \hl); microtype's tracking
      // (xcolor's own names as their values: the highlighter is drawn in the colour TeX prints)
      if (name === 'hl' && nd.args[0] && nd.args[0] !== a) { const c = this.colorArg(ctx, null, nd.args[0]); x.color = Object.hasOwn(XC, c) ? '#' + XC[c] : c; }
      // (an underline in a colour of its own, \culine{red}{..}: the line's colour, not the words')
      if (name === 'culine' && nd.args[0] && nd.args[0] !== a) x.color = this.colorArg(ctx, null, nd.args[0]);
      if (name === 'textls') { const t = nd.args[0] && nd.args[0] !== a ? parseFloat(A(0)) : 100; if (Number.isFinite(t)) x.ls = t; }
      // (an \fbox with no gap: \fboxsep set to 0pt just before it, as Picture Border writes it;
      // an \fbox around one minipage, Insert › Text Box: a box of the minipage's width)
      if (name === 'fbox') { const sol = a.nodes.filter((n) => !(n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) && n.t !== 'comment'); if (sol.length === 1 && sol[0].t === 'env' && sol[0].name === 'minipage') { const wa = sol[0].args.filter((z) => z && !z.o).pop(); x.mp = wa ? this.argText(ctx, wa).trim().slice(0, 80) : '\\linewidth'; } }
      if (name === 'fbox' && /\\fboxsep\s*(=\s*0\s*(pt)?|\}?\s*\{\s*0\s*(pt|cm|mm|bp)?\s*\})\s*$/.test(ctx.src.slice(Math.max(0, nd.s - 40), nd.s))) x.tight = true;
      out.push(this.styAtom(ctx, x));
      return false;
    }
    if (name in DECL) {
      acc.flush();
      const rest = nodes.slice(k + 1);
      const kids = this.inl(rest, ctx, fns);
      out.push({ k: 'sty', st: DECL[name], kids, f: ctx.f, decl: true });
      return true;
    }
    if (name === 'color' && nd.args[1]) {
      acc.flush();
      const rest = nodes.slice(k + 1);
      const kids = this.inl(rest, ctx, fns);
      out.push({ k: 'sty', st: 'color', color: this.colorArg(ctx, nd.args[0], nd.args[1]), kids, f: ctx.f, decl: true });
      return true;
    }
    if ((name === 'textcolor' || name === 'colorbox') && nd.args[2]) {
      acc.flush();
      const a = nd.args[2];
      const kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: name === 'colorbox' ? 'bg' : 'color', color: this.colorArg(ctx, nd.args[0], nd.args[1]), kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name }));
      return false;
    }
    if (name === 'footnote' || (name === 'thanks')) {
      acc.flush();
      const a = name === 'footnote' ? nd.args[1] : nd.args[0];
      let num;
      if (name === 'thanks' || this.thanksMode) { this.c.thanks++; num = FN_SYMS[(this.c.thanks - 1) % FN_SYMS.length]; }
      else if (nd.args[0]) { num = texToPlain(A(0)); }
      else { this.c.footnote++; num = String(this.c.footnote); }
      this.use('f' + num);
      const saveT = this.lastTarget;
      this.lastTarget = { num, kind: 'footnote' };
      const kids = a ? this.inl(a.nodes, ctx, fns) : [];
      trimInl(kids);
      if (a && !kids.length) kids.push(this.ph(ctx, a.is));
      this.lastTarget = saveT;
      const mark = this.atom(ctx, { k: 'fn', s: nd.s, e: nd.e, num, is: a ? a.is : null, ie: a ? a.ie : null });
      out.push(mark);
      fns.push({ num, inl: kids, f: ctx.f, mark, dir: this.dirOf() });
      return false;
    }
    if (name === 'footnotemark') { acc.flush(); this.c.footnote++; out.push(this.atom(ctx, { k: 'fn', s: nd.s, e: nd.e, num: String(this.c.footnote) })); return false; }
    if (name === 'footnotetext') {
      acc.flush();
      const a = nd.args[1];
      const kids = a ? this.inl(a.nodes, ctx, fns) : [];
      fns.push({ num: String(this.c.footnote), inl: kids, f: ctx.f, dir: this.dirOf() });
      return false;
    }
    if (CITE_CMDS.has(name)) {
      acc.flush();
      const keysRaw = A(2) || A(0);
      const keyArg = nd.args[2] || nd.args[nd.args.length - 1];
      const keys = (keyArg ? this.argText(ctx, keyArg) : '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const key of keys) if (!this.citeSet.has(key)) { this.citeSet.add(key); this.cites.push(key); }
      const pre = nd.args[0] && nd.args[1] ? texToPlain(A(0)) : '';
      const post = nd.args[1] ? texToPlain(A(1)) : (nd.args[0] ? texToPlain(A(0)) : '');
      const r = this.citeText(name, keys, pre, post);
      this.use('c' + r.text);
      out.push(this.atom(ctx, { k: 'cite', s: nd.s, e: nd.e, text: r.text, keys, cmd: name + (nd.star ? '*' : ''), missing: r.missing }));
      return false;
    }
    if (name === 'nocite') {
      for (const key of A(0).split(',').map((s) => s.trim())) {
        if (key === '*') this.nociteAll = true;
        else if (key && !this.citeSet.has(key)) { this.citeSet.add(key); this.cites.push(key); }
      }
      return false;
    }
    if (REF_CMDS.has(name)) {
      acc.flush();
      const keys = A(0).split(',').map((s) => s.trim()).filter(Boolean);
      const parts = keys.map((key) => {
        const L = this.lookupLabel(key);
        this.use('r' + key + (L ? L.num + L.kind : '?'));
        return { key, L };
      });
      const text = this.refText(name, parts);
      out.push(this.atom(ctx, { k: 'ref', s: nd.s, e: nd.e, text, key: A(0).trim(), cmd: name, missing: parts.some((p) => !p.L) }));
      return false;
    }
    if (name === 'label') { this.label(A(0), ctx); return false; }
    if (name === 'url' || name === 'nolinkurl') {
      acc.flush();
      out.push(this.atom(ctx, { k: 'url', s: nd.s, e: nd.e, text: A(0), url: A(0) }));
      return false;
    }
    if (name === 'href' && nd.args[1]) {
      acc.flush();
      const a = nd.args[1];
      const kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: 'link', url: A(0), kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name }));
      return false;
    }
    if (name === 'hyperref' && nd.args[1]) {
      acc.flush();
      const a = nd.args[1];
      out.push(...this.inl(a.nodes, ctx, fns));
      return false;
    }
    if (name === 'hyperlink' && nd.args[1]) { acc.flush(); out.push(...this.inl(nd.args[1].nodes, ctx, fns)); return false; }
    if (name === 'hypertarget' && nd.args[1]) { acc.flush(); out.push(...this.inl(nd.args[1].nodes, ctx, fns)); return false; }
    if (name === 'includegraphics') {
      acc.flush();
      const file = A(1).trim();
      const opts = A(0);
      out.push(this.atom(ctx, { k: 'img', s: nd.s, e: nd.e, file, opts }));
      return false;
    }
    // fontawesome5's \faIcon{name} (Insert › Icons): one atom, drawn as the icon
    if ((name === 'faIcon' || name === 'faIcon*') && nd.args.some((x) => x && !x.o)) {
      acc.flush();
      out.push(this.atom(ctx, { k: 'icon', s: nd.s, e: nd.e, name: A(nd.args[0] && nd.args[0].o ? 1 : 0).trim().slice(0, 60) }));
      return false;
    }
    // smartdiagram's \smartdiagram[kind]{items} (Insert › SmartArt): one atom, drawn as its boxes
    if (name === 'smartdiagram' && nd.args.some((x) => x && !x.o)) {
      acc.flush();
      const o = nd.args.find((x) => x && x.o), m = nd.args.filter((x) => x && !x.o).pop();
      out.push(this.atom(ctx, { k: 'smart', s: nd.s, e: nd.e, kind: o ? this.argText(ctx, o).trim().slice(0, 60) : 'flow diagram', items: ctx.src.slice(m.is, m.ie).slice(0, 4000) }));
      return false;
    }
    // lettrine's \lettrine[options]{T}{his} (Insert › Drop Cap): the letter dropped over its lines,
    // the rest of the word in small capitals, both typed in place
    if (name === 'lettrine' && nd.args.filter((x) => x && !x.o).length >= 2) {
      acc.flush();
      const ms = nd.args.filter((x) => x && !x.o), o = nd.args.find((x) => x && x.o);
      const ot = o ? this.argText(ctx, o) : '';
      const ln = /(?:^|,)\s*lines\s*=\s*(\d+)/.exec(ot), hang = /(?:^|,)\s*lhang\s*=\s*([\d.]+)/.exec(ot);
      const k1 = this.inl(ms[0].nodes, ctx, fns), k2 = this.inl(ms[1].nodes, ctx, fns);
      if (!k1.length) k1.push(this.ph(ctx, ms[0].is));
      const y = this.styAtom(ctx, { k: 'sty', st: 'dropcap', kids: k1, s: nd.s, e: nd.e, is: ms[0].is, ie: ms[0].ie, cmd: name });
      y.lines = ln ? Math.max(2, Math.min(10, +ln[1])) : 2;
      if (hang && +hang[1] > 0) y.hang = Math.min(1, +hang[1]);
      out.push(y);
      if (k2.length) out.push(this.styAtom(ctx, { k: 'sty', st: 'sc', kids: k2, s: ms[1].s, e: ms[1].e, is: ms[1].is, ie: ms[1].ie, cmd: 'lettrine' }));
      return false;
    }
    if (name === 'rikuywidget') {
      // a live figure (rikuy.sty): TeX prints the fallback image, the page runs the widget. Its
      // file's signature is part of the block's key, so a widget edited in the source pane is
      // drawn again from its new text.
      acc.flush();
      const file = A(1).trim();
      const wfile = widgetPath(this.files, this.project.main, file);
      const wsig = wfile ? hashText(this.files.get(wfile)) : '';
      this.use('W' + (wfile || '-' + file) + ':' + wsig);
      out.push(this.atom(ctx, { k: 'widget', s: nd.s, e: nd.e, file, wfile, wsig, fallback: A(2).trim(), opts: A(0) }));
      return false;
    }
    if (name === 'ensuremath') {
      acc.flush();
      const a = nd.args[0];
      if (a) out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, is: a.is, ie: a.ie, tex: this.mathRefs(ctx.src.slice(a.is, a.ie)), display: false }));
      return false;
    }
    if (name === 'LaTeX' || name === 'TeX' || name === 'LaTeXe' || name === 'BibTeX' || name === 'XeLaTeX' || name === 'pdfLaTeX' || name === 'LuaLaTeX') {
      acc.flush();
      out.push(this.atom(ctx, { k: 'logo', s: nd.s, e: nd.e, text: name }));
      return false;
    }
    if (name === 'today') { acc.flush(); out.push(this.atom(ctx, { k: 'chip', s: nd.s, e: nd.e, text: today(this.opts.lang), plain: true })); return false; }
    if (name === 'hspace' || name === 'hfill' || name === 'quad' || name === 'qquad') {
      acc.flush();
      let w = '1em';
      if (name === 'hspace') { const v = parseLen(A(0), this.opts.pt); w = typeof v === 'number' ? (v / this.opts.pt) + 'em' : '1em'; }
      if (name === 'hfill') w = 'fill';
      out.push(this.atom(ctx, { k: 'sp', s: nd.s, e: nd.e, w }));
      return false;
    }
    if (name === 'hrulefill' || name === 'dotfill') {
      acc.flush();
      out.push(this.atom(ctx, { k: 'sp', s: nd.s, e: nd.e, w: 'fill', rule: name === 'hrulefill', dots: name === 'dotfill' }));
      return false;
    }
    if (name === 'rule') {
      acc.flush();
      out.push(this.atom(ctx, { k: 'rule', s: nd.s, e: nd.e, w: A(0), h: A(1) }));
      return false;
    }
    if (SI_CMDS.has(name)) {
      acc.flush();
      const args = { opt: A(0), a: A(1), b: A(2), c: A(3) };
      const tex = siTex(name, args, this.siOpts, this.siUnits, this.opts.lang);
      out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, tex, display: false, si: true }));
      return false;
    }
    if (name === 'ce' || name === 'pu' || name === 'ch') {
      // chemformula's \ch reads like mhchem's \ce
      acc.flush();
      const t = name === 'ch' ? '\\ce{' + A(1) + '}' : '\\' + name + '{' + A(0) + '}';
      out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, tex: t, display: false, chem: true }));
      return false;
    }
    if (name === 'item') {
      acc.flush();
      out.push(this.chip(ctx, nd.s, nd.e, '\\item', '\\item outside a list', true));
      return false;
    }
    if (name === 'caption' || name === 'captionof') {
      // caption outside float: render as paragraph content
      acc.flush();
      const a = name === 'captionof' ? nd.args[2] : nd.args[1];
      if (a) out.push(...this.inl(a.nodes, ctx, fns));
      return false;
    }
    // vertical space inside a line (\title{\vspace{-1.5em}...}, a box's \smallskip) has no width: TeX
    // ends the paragraph or ignores it, and the page shows nothing either
    if (INVIS.has(name) || nd.def || name === 'vspace' || name === 'smallskip' || name === 'medskip' || name === 'bigskip') return false;
    if (name === 'marginpar' || name === 'todo') {
      acc.flush();
      const a = nd.args[1];
      out.push(this.atom(ctx, { k: 'chip', s: nd.s, e: nd.e, text: name === 'todo' ? 'TODO' : 'margin', title: a ? texToPlain(ctx.src.slice(a.is, a.ie)) : '', note: true }));
      return false;
    }
    // User text macros
    const M = this.textMacros.get(name);
    if (M && this.depthLimit < 8) {
      acc.flush();
      this.depthLimit++;
      try {
        const exp = expandMacro(ctx, nd, M);
        const sub = { f: ctx.f, src: exp.src, pm: exp.pm };
        const subNodes = parse(exp.src, { userSigs: this.userSigs });
        const kids = this.inl(subNodes, sub, fns);
        this.use('x' + name);
        out.push({ k: 'mac', f: ctx.f, s: nd.s, e: nd.e, kids, name, ro: !!ctx.pm });
      } finally { this.depthLimit--; }
      return false;
    }
    if (/^(textbf|emph)$/.test(name)) return false;
    // a command that reads a file or a database into the PDF: one block, so its name is not edited as text
    const FC = FILE_CMDS[name];
    if (FC) {
      acc.flush();
      const file = FC[1] >= 0 && nd.args[FC[1]] ? texToPlain(this.argText(ctx, nd.args[FC[1]])).trim() : '';
      out.push(this.chip(ctx, nd.s, nd.e, FC[0] + (file ? ' ' + file : ''), '\\' + name + ': set in the PDF. Click to edit the command.'));
      return false;
    }
    // Unknown command
    acc.flush();
    const lastM = nd.args.filter((a) => a && !a.o).pop();
    if (lastM && lastM.nodes && lastM.nodes.length && !lastM.raw) {
      const kids = this.inl(lastM.nodes, ctx, fns);
      out.push(this.styAtom(ctx, { k: 'sty', st: 'unk', kids, s: nd.s, e: nd.e, is: lastM.is, ie: lastM.ie, cmd: name, title: '\\' + name }));
      if (!this.knownWarn) this.knownWarn = new Set();
      return false;
    }
    if (!nd.args.length && /^(hfil|hss|vss|break|nobreak|allowbreak|ignorespaces|unskip|par|xspace|@|maketitle|selectfont|fontsize|usefont|fontfamily)$/.test(name)) return false;
    this.warn.push('\\' + name);
    out.push(this.chip(ctx, nd.s, nd.e, '\\' + name + (nd.star ? '*' : ''), 'Unknown command. Click to edit its source.'));
    return false;
  }

  ph(ctx, pos) {
    const p = ctx.pm ? ctx.pm[pos] : pos;
    if (p == null || p < 0) return { k: 'chr', text: '' };
    return { k: 'seg', f: ctx.f, t: '​', map: [p, p], ph: true };
  }

  styAtom(ctx, a) {
    a.f = ctx.f;
    if (ctx.pm) {
      const m = (x) => (x == null ? null : (ctx.pm[x] ?? -1));
      a.s = m(a.s); a.e = a.e != null ? m(a.e - 1) + 1 : null; a.is = m(a.is); a.ie = a.ie != null ? m(a.ie - 1) + 1 : null;
      if (a.s < 0 || a.is < 0) a.ro = true;
    }
    return a;
  }

  citeText(cmd, keys, pre, post) {
    const O = this.opts;
    const infos = keys.map((k) => ({ k, ...this.citeInfo(k) }));
    const missing = infos.some((x) => !x.ok);
    const cap = /^[A-Z]/.test(cmd);
    const c = cmd.toLowerCase();
    const sep = O.aysep === '' ? ' ' : ', ';
    const A = (x) => (x.ok ? x.author : x.k + '?');
    const Y = (x) => (x.ok ? x.year : '?');
    let text;
    const P = (s) => (s ? s + ' ' : '');
    const Q = (s) => (s ? ', ' + s : '');
    if (O.citeStyle === 'numeric' && !['citeauthor', 'citeyear', 'citeyearpar', 'citet', 'textcite'].includes(c)) {
      const nums = infos.map((x) => (x.ok ? x.num : '?'));
      text = '[' + P(pre) + nums.join(', ') + Q(post) + ']';
      if (c === 'citenum') text = nums.join(', ');
    } else if (O.citeStyle === 'numeric' && (c === 'citet' || c === 'textcite')) {
      text = infos.map((x) => A(x) + ' [' + (x.ok ? x.num : '?') + ']').join(', ');
    } else {
      switch (c) {
        case 'citet': case 'cite': case 'textcite':
          text = infos.map((x, i) => A(x) + ' (' + Y(x) + (i === infos.length - 1 ? Q(post) : '') + ')').join('; ');
          break;
        case 'citep': case 'parencite': case 'autocite': case 'footcite': case 'smartcite':
          text = '(' + P(pre) + infos.map((x) => A(x) + sep + Y(x)).join('; ') + Q(post) + ')';
          break;
        case 'citealt': text = P(pre) + infos.map((x) => A(x) + ' ' + Y(x)).join('; ') + Q(post); break;
        case 'citealp': text = P(pre) + infos.map((x) => A(x) + sep + Y(x)).join('; ') + Q(post); break;
        case 'citeauthor': text = infos.map(A).join('; '); break;
        case 'citeyear': text = infos.map(Y).join('; '); break;
        case 'citeyearpar': text = '(' + infos.map(Y).join('; ') + ')'; break;
        default: text = '(' + infos.map((x) => A(x) + sep + Y(x)).join('; ') + ')';
      }
    }
    if (cap) text = text.charAt(0).toUpperCase() + text.slice(1);
    if (!keys.length) text = '[?]';
    return { text, missing };
  }

  refText(cmd, parts) {
    const names = this.opts.cleveref ? {
      equation: ['eq.', 'Equation'], section: ['section', 'Section'], subsection: ['section', 'Section'], subsubsection: ['section', 'Section'],
      figure: ['fig.', 'Figure'], table: ['table', 'Table'], item: ['item', 'Item'], footnote: ['footnote', 'Footnote'], appendix: ['appendix', 'Appendix']
    } : {
      equation: ['eq.', 'Equation'], section: ['section', 'Section'], subsection: ['section', 'Section'], subsubsection: ['section', 'Section'],
      figure: ['Figure', 'Figure'], table: ['Table', 'Table'], item: ['item', 'Item'], footnote: ['footnote', 'Footnote'], appendix: ['Appendix', 'Appendix']
    };
    const fmt = (p) => {
      if (!p.L) return '??';
      const L = p.L;
      const n = L.num || '??';
      if (cmd === 'eqref') return '(' + n + ')';
      if (cmd === 'ref' || cmd === 'pageref' || cmd === 'vref' || cmd === 'labelcref') return n;
      if (cmd === 'nameref') return n;
      let nm = names[L.name === 'appendix' ? 'appendix' : L.kind];
      if (!nm) { const t = (L.name || L.kind || ''); nm = [t.toLowerCase(), t.charAt(0).toUpperCase() + t.slice(1)]; }
      let word = cmd === 'Cref' || cmd === 'autoref' || cmd === 'Vref' ? nm[1] : nm[0];
      // cleveref's capitalise option: Fig. 3.2 and Chapter 3, mid sentence too
      if (this.opts.crefCap && word) word = word.charAt(0).toUpperCase() + word.slice(1);
      const num = L.kind === 'equation' ? '(' + n + ')' : n;
      return (word ? word + ' ' : '') + num;
    };
    return parts.map(fmt).join(', ');
  }

  result() {
    // Attach volatile flags and keys.
    const blocks = this.blocks.map((u) => {
      const src = this.files.get(u.f) || '';
      const key = u.f + '\u0000' + src.slice(u.s, u.e) + '\u0000' + (u.sig || '') + '\u0000' + u.items.map((x) => x.type).join(',');
      return { ...u, key };
    });
    return {
      opts: this.opts,
      blocks,
      labels: this.labels,
      headings: this.headings,
      mathMacros: this.mathMacros,
      textMacros: this.textMacros,
      siOpts: this.siOpts,
      siUnits: this.siUnits,
      warn: [...new Set(this.warn)],
      words: this.words,
      bibEntries: (this.ensureBib(), this.bibEntries),
      cites: this.cites,
      nociteAll: this.nociteAll,
      fragment: !!this.fragment,
      sizes: SIZE_SETS[this.opts.pt] || (this.opts.pt > 12 ? SIZE_SETS[14] : this.opts.pt < 10 ? SIZE_SETS[9] : SIZE_SETS[10]),
      thms: this.thms,
      // (the document's own environments and colours, for the Styles pane and Modify Style)
      envDefs: this.envDefs,
      colors: this.colors,
      docBody: this.docBody || null
    };
  }
}

// A node opened and never closed (a group, an optional argument, an environment, or a command
// whose last argument is one of those) holds the rest of its text as the parser reads it, blank
// lines and all. Cut at its first blank line: { node: the part before it, rest: the nodes after
// it }, or null where n is closed or holds no blank line of its own.
function cutOpen(src, n) {
  if (!n) return null;
  if (n.t === 'cmd') {
    const args = n.args || [];
    let k = args.length - 1;
    while (k >= 0 && !args[k]) k--;
    const a = args[k];
    if (!a || !a.nodes || a.raw) return null;
    const r = cutOpen(src, { ...a, t: a.o ? 'opt' : 'group' });
    if (!r) return null;
    const next = [...args];
    next[k] = { ...a, e: r.node.e, ie: r.node.e, nodes: r.node.nodes };
    return { node: { ...n, e: r.node.e, args: next, cut: true }, rest: r.rest };
  }
  const closed = n.t === 'group' ? src[n.e - 1] === '}' : n.t === 'opt' ? src[n.e - 1] === ']' : n.t === 'env' ? !!n.raw || n.e > n.es : true;
  if (closed || !n.nodes || !n.nodes.length) return null;
  const kids = n.nodes, q = kids.findIndex((x) => x.t === 'par');
  if (q >= 0) { const at = kids[q].s; return { node: { ...n, e: at, ie: at, es: at, nodes: kids.slice(0, q), cut: true }, rest: kids.slice(q) }; }
  const r = cutOpen(src, kids[kids.length - 1]);
  return r && { node: { ...n, e: r.node.e, ie: r.node.e, es: r.node.e, nodes: [...kids.slice(0, -1), r.node], cut: true }, rest: r.rest };
}

// Where a \verb, or a command's argument read as it is (\url{, \href{), runs over a blank line,
// the place of that blank line; else -1. TeX ends the paragraph there with an error.
function rawCut(src, n) {
  const BLANK = /\n[ \t]*\n/;
  if (!n) return -1;
  if (n.t === 'verb') { const k = src.slice(n.s, n.e).search(BLANK); return k < 0 ? -1 : n.s + k; }
  if (n.t === 'cmd') for (const a of n.args || []) if (a && a.raw) { const k = src.slice(a.s, a.e).search(BLANK); if (k >= 0) return a.s + k; }
  return -1;
}

// Accumulates characters into editable segments.
class Acc {
  constructor(out, ctx) { this.out = out; this.ctx = ctx; this.seg = null; }
  ch(c, s, e) {
    const pm = this.ctx.pm;
    let a = s, b = e;
    if (pm) {
      a = pm[s]; const bb = pm[e - 1];
      if (a == null || a < 0 || bb == null || bb < 0) {
        this.flush();
        const last = this.out[this.out.length - 1];
        if (last && last.k === 'chr' && !last.cls) last.text += c; else this.out.push({ k: 'chr', text: c });
        return;
      }
      b = bb + 1;
    }
    if (!this.seg) this.seg = { k: 'seg', f: this.ctx.f, t: '', map: [] };
    for (let i = 0; i < c.length; i++) { this.seg.t += c[i]; this.seg.map.push(a, b); }
  }
  flush() { if (this.seg) { this.out.push(this.seg); this.seg = null; } }
}

// Trim leading/trailing visible whitespace from an inline list (TeX drops them).
function trimInl(inl) {
  const first = (arr) => {
    for (const x of arr) {
      if (x.k === 'seg') {
        const m = /^[ ]+/.exec(x.t);
        if (m && !x.ph) { x.t = x.t.slice(m[0].length); x.map = x.map.slice(m[0].length * 2); }
        if (x.t.length) return true;
        continue;
      }
      if (x.k === 'sty' && !x.decl) return true;
      if (x.k === 'sty' && x.decl) { if (first(x.kids)) return true; continue; }
      if (x.k === 'chr' && x.text === '') continue;
      return true;
    }
    return false;
  };
  const last = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      const x = arr[i];
      if (x.k === 'seg') {
        const m = /[ ]+$/.exec(x.t);
        if (m && !x.ph) { x.t = x.t.slice(0, x.t.length - m[0].length); x.map = x.map.slice(0, x.t.length * 2); }
        if (x.t.length) return true;
        continue;
      }
      if (x.k === 'sty' && x.decl) { if (last(x.kids)) return true; continue; }
      return true;
    }
    return false;
  };
  first(inl);
  last(inl);
  for (let i = inl.length - 1; i >= 0; i--) if (inl[i].k === 'seg' && !inl[i].t.length) inl.splice(i, 1);
}

function today(lang) {
  const d = new Date();
  const M = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  };
  if (lang === 'de') return d.getDate() + '. ' + M.de[d.getMonth()] + ' ' + d.getFullYear();
  if (lang === 'es') return d.getDate() + ' de ' + M.es[d.getMonth()] + ' de ' + d.getFullYear();
  return M.en[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

// the space before an item, in em, for an \itemsep of v pt (LaTeX's own, 4pt, and \parsep's 4pt
// draw as 0.45 em)
const itemSep = (v) => Math.max(0, Math.min(3, 0.45 * ((typeof v === 'number' ? v : 4) + 4) / 8));
// LaTeX's \ref of an item of a numbered list at a level: \theenumi with the levels above it
// (\p@enumii is \theenumi: 1a; \p@enumiii is \theenumi(\theenumii): 1(a)i)
function theRef(level, v, stars = []) {
  const DEF = ['\\arabic*', '\\alph*', '\\roman*', '\\Alph*'];
  const t = [0, 1, 2, 3].map((i) => numText(stars[i] || DEF[i], v[i] || 0));
  if (level === 1) return t[0];
  if (level === 2) return t[0] + t[1];
  if (level === 3) return t[0] + '(' + t[1] + ')' + t[2];
  return t[0] + '(' + t[1] + ')' + t[2] + t[3];
}
// a numbered list's style as pandoc's OrderedList names it: [start, style, delimiter]
function wordFmt(star, start) {
  const m = /^(\()?\\(arabic|alph|Alph|roman|Roman)\*([.)])?$/.exec(String(star || '').replace(/\s+/g, ''));
  if (!m) return null;
  const style = { arabic: 'Decimal', alph: 'LowerAlpha', Alph: 'UpperAlpha', roman: 'LowerRoman', Roman: 'UpperRoman' }[m[2]];
  return [Math.max(1, start || 1), { t: style }, { t: m[1] && m[3] === ')' ? 'TwoParens' : m[3] === ')' ? 'OneParen' : m[3] === '.' ? 'Period' : 'DefaultDelim' }];
}

function enumLabel(n, level, fmt) {
  const val = (kind) => ({ arabic: String(n), alph: alph(n), Alph: alph(n).toUpperCase(), roman: roman(n), Roman: roman(n).toUpperCase() }[kind]);
  if (fmt) {
    let f = fmt;
    if (/\\(arabic|alph|Alph|roman|Roman)\*/.test(f)) {
      const lab = f.replace(/\\(arabic|alph|Alph|roman|Roman)\*/g, (m, k) => val(k)).replace(/[{}]/g, '').replace(/\\(textbf|textit|emph)\s*/g, '');
      return { label: lab, ref: lab.replace(/[.)]$/, '') };
    }
    // enumerate package style: (a), i., A)
    const m = /([aAiI1])/.exec(f);
    if (m) {
      const k = { a: 'alph', A: 'Alph', i: 'roman', I: 'Roman', 1: 'arabic' }[m[1]];
      const lab = f.replace(m[1], val(k));
      return { label: lab, ref: val(k) };
    }
  }
  if (level === 1) return { label: n + '.', ref: String(n) };
  if (level === 2) return { label: '(' + alph(n) + ')', ref: alph(n) };
  if (level === 3) return { label: roman(n) + '.', ref: roman(n) };
  return { label: alph(n).toUpperCase() + '.', ref: alph(n).toUpperCase() };
}

function parseColSpec(spec) {
  const cols = [];
  let k = 0;
  let pendingLeft = 0, pre = '';
  // (what >{…} sets in a column: bold, a background, a paragraph column's alignment; B7)
  const take = (col) => {
    if (pre) {
      if (/\\(bfseries|bf)(?![A-Za-z])/.test(pre)) col.bold = true;
      const cc = /\\columncolor(\[[^\]]*\])?\{([^{}]*)\}/.exec(pre);
      if (cc) col.bg = { model: cc[1] ? cc[1].slice(1, -1) : null, value: cc[2] };
      if (col.align === 'p' || col.x) col.palign = /\\centering/.test(pre) ? 'c' : /\\raggedleft/.test(pre) ? 'r' : /\\raggedright/.test(pre) ? 'l' : null;
    }
    pre = '';
    return col;
  };
  const s = spec.replace(/\s+/g, '');
  while (k < s.length) {
    const c = s[k];
    if (c === '|') { if (cols.length) cols[cols.length - 1].vr = (cols[cols.length - 1].vr || 0) + 1; else pendingLeft++; k++; continue; }
    if (c === '>') { k++; if (s[k] === '{') { const e = skipBrace(s, k); pre += s.slice(k + 1, e - 1); k = e; } continue; }
    if (c === '@' || c === '!' || c === '<') { k++; if (s[k] === '{') k = skipBrace(s, k); continue; }
    if (c === '*') {
      k++;
      let n = 1, sub = '';
      if (s[k] === '{') { const e = skipBrace(s, k); n = parseInt(s.slice(k + 1, e - 1), 10) || 1; k = e; }
      if (s[k] === '{') { const e = skipBrace(s, k); sub = s.slice(k + 1, e - 1); k = e; }
      // (B7: a stranger's *{3000000}{c} took seconds and *{100}{*{100}{*{100}{c}}} more: the
      // columns stop at 1000, as a page could never show more)
      const one = parseColSpec(sub);
      for (let r = 0; r < n && cols.length < 1000; r++) cols.push(...one.slice(0, 1000 - cols.length).map((x) => ({ ...x })));
      continue;
    }
    if ('lcrXLCRJS'.includes(c)) { cols.push(take({ align: c === 'c' || c === 'C' || c === 'S' ? 'c' : c === 'r' || c === 'R' ? 'r' : 'l', vl: cols.length === 0 ? pendingLeft : 0, x: c === 'X' })); k++; continue; }
    if ('pmb'.includes(c)) {
      k++;
      let w = null;
      if (s[k] === '{') { const e = skipBrace(s, k); w = s.slice(k + 1, e - 1); k = e; }
      cols.push(take({ align: 'p', w, vl: cols.length === 0 ? pendingLeft : 0, valign: c === 'm' ? 'm' : c === 'b' ? 'b' : null }));
      continue;
    }
    k++;
  }
  if (!cols.length) cols.push({ align: 'l' });
  return cols;
}
function skipBrace(s, k) {
  let d = 0;
  for (; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (d === 0) return k + 1; } }
  return s.length;
}

// Expand a user macro call keeping a map from expanded text back to source.
function expandMacro(ctx, nd, M) {
  const src = ctx.src;
  const args = [];
  let ai = 0;
  const all = nd.args || [];
  if (M.dflt != null) {
    const o = all[0];
    if (o && o.o) args.push({ text: src.slice(o.is, o.ie), at: o.is });
    else args.push({ text: M.dflt, at: -1 });
    ai = 1;
  }
  for (let k = ai; k < all.length; k++) {
    const a = all[k];
    if (!a) { args.push({ text: '', at: -1 }); continue; }
    args.push({ text: src.slice(a.is, a.ie), at: a.is });
  }
  let out = '';
  const pm = [];
  const body = M.body;
  const outerPm = ctx.pm;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (c === '#' && /\d/.test(body[k + 1] || '')) {
      const n = +body[k + 1] - 1;
      const a = args[n];
      if (a) {
        for (let j = 0; j < a.text.length; j++) {
          out += a.text[j];
          const p = a.at < 0 ? -1 : a.at + j;
          pm.push(p < 0 ? -1 : (outerPm ? outerPm[p] : p));
        }
      }
      k++;
      continue;
    }
    out += c; pm.push(-1);
  }
  pm.push(-1);
  return { src: out, pm: Int32Array.from(pm) };
}

export { trimInl, parseColSpec, enumLabel, today };
