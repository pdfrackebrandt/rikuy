// Galley model: turns the syntax tree into blocks of flow items with
// numbering, cross references and citations resolved. Every editable
// character keeps a pointer to its exact source range.
import { parse, scanUserSigs, CHARS, ACCENTS, splitRows } from './parser.js';
import { parseBib, texToPlain, shortAuthors, entryYear, formatEntry } from './bib.js';

const STY = {
  textbf: 'bf', textit: 'it', emph: 'em', texttt: 'tt', textsc: 'sc', textsf: 'sf', textrm: 'rm', textup: 'up',
  textsl: 'sl', textmd: 'md', textnormal: 'rm', underline: 'ul', uline: 'ul', uuline: 'ul', uwave: 'ul',
  sout: 'so', xout: 'so', hl: 'hl', textsuperscript: 'sup', textsubscript: 'sub', mbox: 'nb', text: 'rm',
  fbox: 'fbox', MakeUppercase: 'upper', uppercase: 'upper', MakeLowercase: 'lower', lowercase: 'lower',
  textcircled: 'rm', centerline: 'rm', foreignlanguage: '', textls: '', ensure: '', phantom: 'ph', hphantom: 'ph'
};
const DECL = {
  bf: 'bf', bfseries: 'bf', it: 'it', itshape: 'it', em: 'em', tt: 'tt', ttfamily: 'tt', sc: 'sc', scshape: 'sc',
  sf: 'sf', sffamily: 'sf', rm: 'rm', rmfamily: 'rm', normalfont: 'rm', sl: 'sl', slshape: 'sl', upshape: 'up',
  mdseries: 'md', tiny: 'z-tiny', scriptsize: 'z-scriptsize', footnotesize: 'z-footnotesize', small: 'z-small',
  normalsize: 'z-normalsize', large: 'z-large', Large: 'z-Large', LARGE: 'z-LARGE', huge: 'z-huge', Huge: 'z-Huge'
};
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
  'sisetup', 'centering', 'noindent', 'vfill', 'hrule', 'null', 'leavevmode', 'unskip', 'ignorespaces',
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
  'thispagestyle', 'hline', 'cline', 'rowcolors', 'arrayrulecolor', 'columncolor', 'cellcolor', 'rowcolor', 'toprule', 'midrule', 'bottomrule', 'FloatBarrier', 'balance', 'tightlist'
]);
const CITE_CMDS = new Set(['cite', 'citet', 'citep', 'citealt', 'citealp', 'citeauthor', 'citeyear', 'citeyearpar',
  'Citet', 'Citep', 'Citealt', 'Citealp', 'Citeauthor', 'textcite', 'parencite', 'autocite', 'Textcite',
  'Parencite', 'Autocite', 'footcite', 'smartcite', 'citenum']);
const REF_CMDS = new Set(['ref', 'eqref', 'pageref', 'cref', 'Cref', 'autoref', 'nameref', 'vref', 'Vref', 'labelcref']);
const SECTIONS = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
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
  12: { tiny: 0.5, scriptsize: 0.667, footnotesize: 0.833, small: 0.9125, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.074 }
};
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

// ---------------------------------------------------------------------------
// One pass when the previous result's labels and citations still hold;
// otherwise a second pass resolves forward references.
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
    this.subeq = null;
    this.targets = [];
    this.lastTarget = null;
    this.textMacros = new Map();
    this.mathMacros = {};
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
  }

  // ---- setup ----------------------------------------------------------------
  run() {
    const main = this.project.main;
    const src = this.files.get(main) || '';
    const userSigs = {};
    for (const [, t] of this.files) scanUserSigs(t, userSigs);
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
      this.collectDefs(docEnv.nodes, ctx);
      this.docBody = { s: docEnv.be, e: docEnv.es };
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
    const walk = (ns) => {
      for (const nd of ns) {
        if (nd.t === 'cmd') this.preCmd(nd, ctx);
        else if (nd.t === 'group') walk(nd.nodes);
        else if (nd.t === 'env' && !nd.raw && nd.nodes) walk(nd.nodes);
      }
    };
    walk(nodes);
    O.chapters = /^(report|book|scrbook|scrreprt|memoir|amsbook|thesis|ociamthesis)$/.test(O.cls);
    if (O.chapters) {
      if (!O.secnumdepthSet) O.secnumdepth = 2;
      for (const k of ['equation', 'figure', 'table']) if (!this.within[k]) this.within[k] = 'chapter';
    }
    if (O.parindent == null) O.parindent = O.parskip ? 0 : ({ 10: 15, 11: 17, 12: 18 }[O.pt] || 15);
    if (O.natbib && !O.forceNumeric) O.citeStyle = 'authoryear';
    if (O.biblatex) O.citeStyle = O.biblatexStyle === 'authoryear' ? 'authoryear' : 'numeric';
    if (['unsrt', 'unsrtnat', 'ieeetr', 'unsrt_abbrv'].includes(O.bibstyle)) O.sort = false;
    if (O.natbib && ['plain', 'unsrt', 'abbrv', 'alpha', 'ieeetr', 'siam', 'acm', 'amsplain', 'unsrtnat_num'].includes(O.bibstyle) && !O.forceAY) O.citeStyle = O.forceNumeric ? 'numeric' : O.citeStyle;
  }

  preCmd(nd, ctx) {
    const O = this.opts;
    const A = (k) => this.argText(ctx, nd.args[k]);
    switch (nd.name) {
      case 'documentclass': {
        const opts = A(0).split(',').map((x) => x.trim());
        O.cls = A(1).trim() || 'article';
        for (const o of opts) {
          if (/^(10|11|12)pt$/.test(o)) O.pt = parseInt(o, 10);
          if (o === 'a4paper') O.paper = 'a4';
          if (o === 'letterpaper') O.paper = 'letter';
          if (o === 'twocolumn') O.twocolumn = true;
          if (o === 'titlepage') O.titlepage = true;
          if (/^(ngerman|german|austrian|naustrian)$/.test(o)) O.lang = 'de';
          if (/^spanish$/.test(o)) O.lang = 'es';
          if (/^(french|francais)$/.test(o)) O.lang = 'fr';
        }
        if (/^(amsart|amsbook)$/.test(O.cls)) O.ams = true;
        break;
      }
      case 'usepackage': case 'RequirePackage': {
        const pk = A(1).split(',').map((x) => x.trim());
        const op = A(0);
        for (const p of pk) {
          if (p === 'natbib') {
            O.natbib = true;
            if (/numbers/.test(op)) O.forceNumeric = true;
            if (/authoryear/.test(op)) O.forceAY = true;
          }
          if (p === 'biblatex') {
            O.biblatex = true;
            O.biblatexStyle = /style\s*=\s*(authoryear|apa|chicago|ext-authoryear)/.test(op) ? 'authoryear' : 'numeric';
          }
          if (p === 'apacite' || p === 'harvard' || p === 'chicago') { O.natbib = true; O.forceAY = true; }
          if (p === 'setspace') { /* spacing commands handled separately */ }
          if (p === 'parskip') { O.parskip = 0.6; O.parindent = 0; }
          if (p === 'cleveref') O.cleveref = true;
          if (p === 'fullpage') O.margins = { l: 72.27, r: 72.27, t: 72.27, b: 72.27 };
          if (p === 'geometry' && op) this.geometry(op);
          if (p === 'babel') {
            const langs = op.split(',').map((x) => x.trim()).filter(Boolean);
            const last = langs[langs.length - 1] || 'english';
            O.lang = /german|ngerman|austrian/.test(last) ? 'de' : /spanish/.test(last) ? 'es' : /french/.test(last) ? 'fr' : 'en';
          }
          if (p === 'times' || p === 'mathptmx' || p === 'newtxtext') O.font = 'times';
          if (p === 'palatino' || p === 'mathpazo' || p === 'newpxtext') O.font = 'palatino';
          if (p === 'helvet') O.font = 'sans';
        }
        break;
      }
      case 'geometry': this.geometry(A(0)); break;
      case 'onehalfspacing': O.spread = { 10: 1.25, 11: 1.213, 12: 1.241 }[O.pt] || 1.25; break;
      case 'doublespacing': O.spread = { 10: 1.667, 11: 1.618, 12: 1.655 }[O.pt] || 1.65; break;
      case 'singlespacing': O.spread = 1; break;
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
      case 'setcounter': if (A(0).trim() === 'secnumdepth') { O.secnumdepth = parseInt(A(1), 10); O.secnumdepthSet = true; } break;
      default: this.defCmd(nd, ctx);
    }
  }

  geometry(op) {
    const O = this.opts;
    const kv = {};
    for (const part of op.split(',')) {
      const [k, v] = part.split('=').map((x) => (x || '').trim());
      if (k) kv[k] = v ?? true;
    }
    if (kv.a4paper) O.paper = 'a4';
    if (kv.letterpaper) O.paper = 'letter';
    if (kv.paper) O.paper = /a4/.test(kv.paper) ? 'a4' : 'letter';
    const L = (x) => { const v = parseLen(x, O.pt); return typeof v === 'number' ? v : null; };
    const m = { l: null, r: null, t: null, b: null };
    if (kv.margin) m.l = m.r = m.t = m.b = L(kv.margin);
    if (kv.hmargin) m.l = m.r = L(kv.hmargin);
    if (kv.vmargin) m.t = m.b = L(kv.vmargin);
    for (const [k, key] of [['left', 'l'], ['lmargin', 'l'], ['inner', 'l'], ['right', 'r'], ['rmargin', 'r'], ['outer', 'r'], ['top', 't'], ['tmargin', 't'], ['bottom', 'b'], ['bmargin', 'b']]) if (kv[k]) m[key] = L(kv[k]);
    if (kv.textwidth || kv.width) m.tw = L(kv.textwidth || kv.width);
    if (kv.textheight || kv.height) m.th = L(kv.textheight || kv.height);
    if (kv.scale) m.scale = parseFloat(kv.scale);
    if (Object.values(m).some((v) => v != null)) O.margins = { ...(O.margins || {}), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) };
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

  defCmd(nd, ctx) {
    const A = (k) => this.argText(ctx, nd.args[k]);
    if (nd.def && nd.def.kind === 'cmd') {
      const d = nd.def;
      this.textMacros.set(d.name, { nargs: d.nargs, dflt: d.dflt, body: d.body });
      if (d.dflt == null) this.mathMacros['\\' + d.name] = d.body;
      else this.mathMacros['\\' + d.name] = { opt: true, nargs: d.nargs, dflt: d.dflt, body: d.body };
    } else if (nd.def && nd.def.kind === 'let') {
      this.mathMacros['\\' + nd.def.name] = nd.def.body;
    } else if (nd.def && nd.def.kind === 'env') {
      this.envDefs.set(nd.def.name, nd.def);
    } else if (nd.def && nd.def.kind === 'op') {
      const nm = A(0).trim();
      this.mathMacros[nm] = '\\operatorname' + (nd.star ? '*' : '') + '{' + A(1) + '}';
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

  // ---- numbering -------------------------------------------------------------
  secNum(level) {
    const c = this.c;
    if (this.opts.chapters) {
      const ch = this.appendix ? (c.chapter > 0 ? String.fromCharCode(64 + c.chapter) : '0') : String(c.chapter);
      if (level === 0) return ch;
      if (level === 1) return ch + '.' + c.section;
      if (level === 2) return ch + '.' + c.section + '.' + c.subsection;
      if (level === 3) return ch + '.' + c.section + '.' + c.subsection + '.' + c.subsubsection;
      return '';
    }
    const top = this.appendix ? (c.section > 0 ? String.fromCharCode(64 + c.section) : '0') : String(c.section);
    if (level === 1) return top;
    if (level === 2) return top + '.' + c.subsection;
    if (level === 3) return top + '.' + c.subsection + '.' + c.subsubsection;
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
    let afterHeading = env.afterHeading || false;
    const self = this;
    const startUnit = () => { if (env.top) this.sig = []; };
    let pendingSig = null;

    const flushPara = () => {
      const ns = para;
      para = [];
      if (!ns.length) return;
      // Skip paragraphs with no visible content.
      if (ns.every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) || (n.t === 'cmd' && (INVIS.has(n.name) || n.name === 'label')))) {
        // labels still need registering
        for (const n of ns) if (n.t === 'cmd' && n.name === 'label') this.label(this.argText(ctx, n.args[0]), ctx);
        return;
      }
      if (env.top) this.sig = [];
      const fns = [];
      const inl = this.inl(ns, ctx, fns);
      trimInl(inl);
      const s = ns[0].s, e = ns[ns.length - 1].e;
      const indent = !(paraNoIndent || afterHeading || cont || env.noIndentFirst);
      this.use('i' + indent + (align || '') + (env.cls || ''));
      const item = { type: 'p', inl, indent, align, cls: env.cls || '', ctx: env.ctxKind || 'p', f: ctx.f, pad: env.pad || null, depth: env.depth || 0 };
      if (cont) item.cont = true;
      this.countWords(inl);
      env.noIndentFirst = false;
      paraNoIndent = false;
      afterHeading = false;
      cont = false;
      units.push({ f: ctx.f, s, e, items: [item], fns, sig: env.top ? this.sig.join('\u0001') : '' });
    };

    for (let k = 0; k < nodes.length; k++) {
      const nd = nodes[k];
      if (nd.t === 'par') { flushPara(); continue; }
      if (nd.t === 'include') continue;
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
        flushPara();
        if (env.top) this.sig = [];
        const r = this.envBlock(nd, ctx, env);
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
          if (SECTIONS[name] <= 0 && this.opts.chapters) units.push({ f: ctx.f, s: nd.s, e: nd.s, items: [{ type: 'pagebreak' }], fns: [], sig: 'cb' });
          if (env.top) this.sig = [];
          units.push(this.heading(nd, ctx));
          afterHeading = true;
          continue;
        }
        if (name === 'par') { flushPara(); continue; }
        if (name === 'noindent') { if (!para.some((n) => !(n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) && n.t !== 'comment')) { paraNoIndent = true; para = []; } continue; }
        if (name === 'centering') { align = 'center'; continue; }
        if (name === 'raggedright') { align = 'left'; continue; }
        if (name === 'raggedleft') { align = 'right'; continue; }
        if (name === 'maketitle') {
          flushPara();
          if (env.top) this.sig = [];
          const u = this.titleBlock(nd, ctx);
          if (u) units.push(u);
          continue;
        }
        if (name === 'tableofcontents') {
          flushPara();
          if (env.top) this.sig = [];
          const entries = (this.prev ? this.prev.headings : []).filter((h) => h.level >= 0 && h.level <= (this.opts.chapters ? 2 : 3));
          this.use(JSON.stringify(entries.map((h) => [h.num, h.text, h.level])));
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'toc', entries, chapters: !!this.opts.chapters }], fns: [], sig: this.sig.join('\u0001'), volatile: false });
          afterHeading = false;
          continue;
        }
        if (name === 'listoffigures' || name === 'listoftables') { flushPara(); continue; }
        if (name === 'newpage' || name === 'clearpage' || name === 'cleardoublepage' || name === 'pagebreak') {
          flushPara();
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'pagebreak' }], fns: [], sig: '' });
          continue;
        }
        if (name === 'appendix') { flushPara(); this.appendix = true; if (this.opts.chapters) this.c.chapter = 0; else this.c.section = 0; continue; }
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
          if (name === 'vspace') { const v = parseLen(this.argText(ctx, nd.args[0]), this.opts.pt); h = typeof v === 'number' ? v : 0; }
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'space', pt: h }], fns: [], sig: 'sp' + h });
          continue;
        }
        if (name === 'item' && env.list) { para.push(nd); continue; }
        if (name === 'caption' && env.float) { para.push(nd); continue; }
        if (name === 'hrule' || name === 'hline') {
          flushPara();
          units.push({ f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'rule' }], fns: [], sig: 'hr' });
          continue;
        }
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
    return units;
  }

  countWords(inl) {
    for (const x of inl) {
      if (x.k === 'seg') this.words += (x.t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
      else if (x.kids) this.countWords(x.kids);
    }
  }

  heading(nd, ctx) {
    const level = SECTIONS[nd.name];
    const titleArg = nd.args[1] || nd.args[0];
    const star = nd.star;
    let num = '';
    const minLevel = this.opts.chapters ? 0 : 1;
    const numbered = !star && level <= this.opts.secnumdepth && level >= minLevel && level <= 3;
    if (!star && level >= 0) {
      this.stepSection(level);
      if (numbered) num = this.secNum(level);
    }
    this.use('h' + num + (this.appendix ? 'A' : ''));
    if (!star) this.lastTarget = { num, kind: { '-1': 'part', 0: 'chapter', 1: 'section', 2: 'subsection', 3: 'subsubsection', 4: 'paragraph', 5: 'subparagraph' }[level] || 'section', name: this.appendix && level === minLevel ? 'appendix' : null };
    const fns = [];
    const inl = titleArg ? this.inl(titleArg.nodes, ctx, fns) : [];
    if (titleArg && !inl.length) inl.push({ k: 'seg', f: ctx.f, t: '​', map: [titleArg.is, titleArg.is], ph: true });
    const text = this.plain(inl);
    this.headings.push({ level, num, text, parts: this.tocParts(inl), star, f: ctx.f, s: nd.s });
    const de = this.opts.lang === 'de';
    const chapLabel = level === 0 && this.opts.chapters ? (this.appendix ? (de ? 'Anhang' : 'Appendix') : (de ? 'Kapitel' : 'Chapter')) : null;
    return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'h', level, num, inl, star, f: ctx.f, ctx: 'h', s: nd.s, e: nd.e, chapLabel }], fns, sig: this.sig ? this.sig.join('\u0001') : '' };
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
    let title = [], authors = [], date = null;
    this.thanksMode = true;
    if (m.title && m.title.a) { title = this.inl(m.title.a.nodes, m.title.ctx, fns); ranges.push([m.title.nd.s, m.title.nd.e]); }
    if (m.author && m.author.a) {
      const a = m.author.a;
      let cur = [];
      const groups = [cur];
      for (const n of a.nodes) {
        if (n.t === 'cmd' && n.name === 'and') { cur = []; groups.push(cur); } else cur.push(n);
      }
      authors = groups.map((g) => { const r = this.inl(g, m.author.ctx, fns); trimInl(r); return r; });
      ranges.push([m.author.nd.s, m.author.nd.e]);
    }
    if (m.date) {
      if (m.date.a) { date = this.inl(m.date.a.nodes, m.date.ctx, fns); trimInl(date); ranges.push([m.date.nd.s, m.date.nd.e]); }
    } else date = [{ k: 'chr', text: today(this.opts.lang) }];
    this.thanksMode = false;
    const s = Math.min(nd.s, ...ranges.map((r) => r[0]));
    const e = Math.max(nd.e, ...ranges.map((r) => r[1]));
    return { f: ctx.f, s, e, items: [{ type: 'title', title, authors, date, f: ctx.f }], fns, sig: (this.sig || []).join('\u0001') };
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
    for (const [, t] of this.files) {
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
      const items = [{ type: 'h', level: 'abs', num: '', inl: [{ k: 'chr', text: 'Abstract' }], star: true, ctx: 'h', f: ctx.f }];
      const fns = [];
      const us = this.flow(nd.nodes, ctx, { ...env, top: false, cls: 'abs', ctxKind: 'p', noIndentFirst: false });
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
      const us = this.flow(nd.nodes, ctx, { ...env, top: false, cls: (env.cls || '') + ' prf', noIndentFirst: true });
      const items = [];
      for (const u of us) { items.push(...u.items); fns.push(...u.fns); }
      const first = items.find((x) => x.type === 'p');
      if (first && items[0] === first) { first.lead = lead; first.indent = true; }
      else items.unshift({ type: 'p', inl: [], lead, indent: true, cls: (env.cls || '') + ' prf', ctx: 'p', f: ctx.f });
      const last = items[items.length - 1];
      if (last.type === 'p') last.tail = [{ k: 'chr', text: '□', cls: 'qed' }];
      else if (last.type === 'math') last.qed = true;
      return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
    }
    const thm = this.thms.get(name) || this.thms.get(base) || (DEFAULT_THMS[base] ? { title: DEFAULT_THMS[base], counter: base, style: /definition|assumption|example|remark|notation|condition|problem|exercise|question/.test(base) ? 'definition' : 'plain', auto: true } : null);
    if (thm) return this.theorem(nd, ctx, env, thm, name);
    if (['quote', 'quotation', 'verse'].includes(name)) {
      return this.container(nd, ctx, env, { cls: (env.cls || '') + ' quote', noIndentFirst: name !== 'quotation' });
    }
    if (['center', 'flushleft', 'flushright'].includes(name)) {
      return this.container(nd, ctx, env, { align: { center: 'center', flushleft: 'left', flushright: 'right' }[name], noIndentFirst: true });
    }
    if (/^(figure|table|wrapfigure|wraptable|SCfigure|sidewaysfigure|sidewaystable)\*?$/.test(name)) return this.floatBlock(nd, ctx, env);
    if (/^(tabular|tabularx|tabular\*|tabulary|longtable|array)$/.test(name)) {
      const t = this.tabular(nd, ctx);
      return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'float', kind: 'inline', parts: [t], f: ctx.f }], fns: t.fns || [] };
    }
    if (name === 'thebibliography') return this.theBib(nd, ctx);
    if (/^(small|footnotesize|scriptsize|large|Large|singlespace|onehalfspace|doublespace|spacing|minipage|landscape|appendices|otherlanguage\*?|titlepage|multicols\*?|adjustbox|threeparttable|tablenotes|acknowledgments|acknowledgements)$/.test(name)) {
      const ex = /^(small|footnotesize|scriptsize|large|Large)$/.test(name) ? { cls: (env.cls || '') + ' z-' + name } : {};
      if (name === 'appendices') { this.appendix = true; if (this.opts.chapters) this.c.chapter = 0; else this.c.section = 0; }
      if (name === 'acknowledgments' || name === 'acknowledgements') {
        const r = this.container(nd, ctx, env, {});
        if (r) r.items.unshift({ type: 'h', level: 3, num: '', inl: [{ k: 'chr', text: 'Acknowledgments' }], star: true, ctx: 'h', f: ctx.f });
        return r;
      }
      return this.container(nd, ctx, env, ex);
    }
    // Unknown environment: render content with a small tag.
    const r = this.container(nd, ctx, env, { cls: (env.cls || '') + ' unk' });
    if (r && r.items.length) r.items[0].envTag = name;
    else return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'raw', f: ctx.f, s: nd.s, e: nd.e, is: nd.be, ie: nd.es, text: '\\begin{' + name + '}', verb: false, name }], fns: [] };
    return r;
  }

  emptyPara(ctx, pos, cls) {
    return { type: 'p', inl: [{ k: 'seg', f: ctx.f, t: '​', map: [pos, pos], ph: true }], indent: false, cls: cls || '', ctx: 'p', f: ctx.f };
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
    const us = this.flow(nd.nodes, ctx, { ...env, top: false, cls: (env.cls || '') + ' thm ' + style, noIndentFirst: true });
    const items = [];
    for (const u of us) { items.push(...u.items); fns.push(...u.fns); }
    const first = items[0];
    if (first && first.type === 'p') { first.lead = lead; first.indent = false; first.thmFirst = true; }
    else {
      let php = nd.be;
      if (ctx.src[php] === '\n') php++;
      items.unshift({ type: 'p', inl: items.length ? [] : [{ k: 'seg', f: ctx.f, t: '\u200B', map: [php, php], ph: true }], lead, indent: false, cls: (env.cls || '') + ' thm ' + style, ctx: 'p', f: ctx.f, thmFirst: true });
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
    let fmt = null;
    const opt = nd.args[0] ? this.argText(ctx, nd.args[0]) : '';
    if (kind === 'enum' && opt) {
      const lm = /label\s*=\s*\{?([^,}]*(?:\{[^}]*\})?[^,}]*)\}?/.exec(opt);
      const L = lm ? lm[1] : (!/=/.test(opt) ? opt : null);
      if (L) fmt = L;
    }
    // split by \item
    const items = [];
    let cur = null;
    for (const n of nd.nodes) {
      if (n.t === 'cmd' && n.name === 'item') { cur = { cmd: n, nodes: [] }; items.push(cur); }
      else if (cur) cur.nodes.push(n);
    }
    const out = [], fns = [];
    let count = 0;
    items.forEach((it) => {
      count++;
      let label = null;
      const optA = it.cmd.args[0];
      const saveT = this.lastTarget;
      if (kind === 'enum') {
        const num = enumLabel(count, level, fmt);
        label = [{ k: 'chr', text: num.label }];
        this.lastTarget = { num: num.ref, kind: 'item' };
      }
      if (kind === 'item') label = [{ k: 'chr', text: ['•', '–', '∗', '·'][(level - 1) % 4] }];
      if (optA) {
        const kids = this.inl(optA.nodes, ctx, fns);
        if (!kids.length) kids.push({ k: 'seg', f: ctx.f, t: '​', map: [optA.is, optA.is], ph: true });
        label = [{ k: 'sty', st: kind === 'desc' ? 'bf' : '', kids, f: ctx.f, s: optA.s, e: optA.e, is: optA.is, ie: optA.ie }];
      }
      this.use('L' + count + level);
      const sub = { ...env, top: false, listDepth: depth, list: true, enumDepth: kind === 'enum' ? level : (env.enumDepth || 0), itemDepth: kind === 'item' ? level : (env.itemDepth || 0), ctxKind: 'li', noIndentFirst: true, depth: depth, cls: (env.cls || '') };
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
        its.unshift({ type: 'p', inl: [{ k: 'seg', f: ctx.f, t: '\u200B', map: [at, at], ph: true }], label, labelKind: kind, li: meta, indent: false, depth, cls: env.cls || '', ctx: 'li', f: ctx.f });
      }
      for (const x of its) { if (x.type === 'p' && x.depth == null) x.depth = depth; if (x.type === 'p' && x !== its[0]) x.li = x.li || { ...meta, cont: true }; if (x.type !== 'p') x.depth = depth; }
      out.push(...its);
      this.lastTarget = saveT;
    });
    if (!out.length) out.push({ type: 'p', inl: [{ k: 'chr', text: '' }], depth, indent: false, ctx: 'p', f: ctx.f });
    if (out.length) { out[0].sbList = depth === 1; out[out.length - 1].saList = depth === 1; }
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
      items.push({ type: 'p', inl, indent: false, cls: 'bibitem' + (numeric ? ' num' : ''), label: numeric ? [{ k: 'chr', text: '[' + (k + 1) + ']' }] : null, labelKind: 'bib', ctx: 'p', f: ctx.f, depth: numeric ? 1 : 0 });
    });
    return { f: ctx.f, s: nd.s, e: nd.e, items, fns };
  }

  floatBlock(nd, ctx, env) {
    const kind = /table/.test(nd.name) ? 'table' : 'figure';
    const fns = [];
    const parts = [];
    let num = '';
    const saveT = this.lastTarget;
    let align = null;
    let para = [];
    const flushP = () => {
      if (!para.length) return;
      const ns = para; para = [];
      if (ns.every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()) || (n.t === 'cmd' && INVIS.has(n.name)))) {
        for (const n of ns) if (n.t === 'cmd' && n.name === 'label') this.label(this.argText(ctx, n.args[0]), ctx);
        return;
      }
      const inl = this.inl(ns, ctx, fns);
      trimInl(inl);
      if (inl.length) parts.push({ type: 'p', inl, align: align || 'center', indent: false, ctx: 'p', f: ctx.f });
    };
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.t === 'par') { flushP(); continue; }
        if (n.t === 'cmd' && n.name === 'centering') { align = 'center'; continue; }
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
          parts.push({ type: 'caption', kind, num, inl: kids, f: ctx.f, ctx: 'cap' });
          continue;
        }
        if (n.t === 'env' && /^(tabular|tabularx|tabular\*|tabulary|longtable|array)$/.test(n.name)) { flushP(); parts.push(this.tabular(n, ctx, fns)); continue; }
        if (n.t === 'env' && /^(center|minipage|subfigure|subtable|threeparttable|adjustbox|small|footnotesize|scriptsize)$/.test(n.name)) { flushP(); walk(n.nodes); flushP(); continue; }
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
    return { f: ctx.f, s: nd.s, e: nd.e, items: [{ type: 'float', kind, num, parts, f: ctx.f, placement, wide: /\*$/.test(nd.name) }], fns };
  }

  tabular(nd, ctx, fnsOut) {
    const fns = fnsOut || [];
    const specArg = nd.name === 'tabular*' || nd.name === 'tabularx' || nd.name === 'tabulary' ? nd.args[nd.args.length - 1] : nd.args[1] || nd.args[0];
    const spec = specArg ? this.argText(ctx, specArg) : 'l';
    const cols = parseColSpec(spec);
    const rows = [];
    let row = { cells: [], top: [], s: null };
    let cell = [];
    let pendingRules = [];
    const pushCell = () => { row.cells.push(cell); cell = []; };
    const pushRow = (sepEnd) => {
      pushCell();
      const empty = row.cells.length === 1 && row.cells[0].every((n) => n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim()));
      row.rulesAbove = pendingRules; pendingRules = [];
      row.e = sepEnd;
      if (!empty || row.rulesAbove.length) rows.push({ ...row, empty });
      row = { cells: [], top: [], s: sepEnd };
    };
    for (const n of nd.nodes) {
      if (n.t === 'special' && n.ch === '&') { pushCell(); continue; }
      if (n.t === 'cmd' && (n.name === '\\' || n.name === 'tabularnewline')) { pushRow(n.e); continue; }
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
          continue;
        }
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
    const outRows = rows.map((r) => ({
      rules: r.rulesAbove,
      empty: r.empty,
      cells: r.empty ? [] : r.cells.map((c, ci) => this.tableCell(c, ctx, fns, ci, cols))
    }));
    return { type: 'tabular', cols, rows: outRows, f: ctx.f, s: nd.s, e: nd.e, fns };
  }

  tableCell(nodes, ctx, fns, ci, cols) {
    let bg = null, rowbg = null;
    nodes = nodes.filter((n) => {
      if (n.t === 'cmd' && (n.name === 'cellcolor' || n.name === 'rowcolor') && n.args.length) {
        const c = this.argText(ctx, n.args[n.args.length - 1]).trim();
        if (n.name === 'cellcolor') bg = c; else rowbg = c;
        return false;
      }
      return !(n.t === 'cmd' && /^(columncolor|rowcolors|arrayrulecolor|hiderowcolors|showrowcolors)$/.test(n.name));
    });
    // detect \multicolumn / \multirow
    const vis = nodes.filter((n) => !(n.t === 'comment' || (n.t === 'text' && !ctx.src.slice(n.s, n.e).trim())));
    let span = 1, align = (cols[ci] && cols[ci].align) || 'l', inner = nodes, pos = null;
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
    const inl = this.inl(inner, ctx, fns);
    trimInl(inl);
    if (!inl.length) {
      const p = pos != null ? pos : (nodes.length ? nodes[0].s : null);
      if (p != null) inl.push({ k: 'seg', f: ctx.f, t: '​', map: [p, p], ph: true });
    }
    return { inl, span, align, bg, rowbg };
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
    return t;
  }

  // ---- inline conversion --------------------------------------------------------
  inl(nodes, ctx, fns, out = []) {
    const acc = new Acc(out, ctx);
    for (let k = 0; k < nodes.length; k++) {
      const nd = nodes[k];
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
          const kids = this.inl(nd.nodes, ctx, fns);
          out.push(...kids);
          break;
        }
        case 'env': {
          acc.flush();
          if (nd.name === 'math') {
            const tex = this.mathRefs(ctx.src.slice(nd.be, nd.es));
            out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, is: nd.be, ie: nd.es, tex, display: false }));
          } else if (/^(tabular|array)$/.test(nd.name)) {
            out.push(this.chip(ctx, nd.s, nd.e, 'table', 'Inline tabular'));
          } else {
            const kids = nd.nodes ? this.inl(nd.nodes, ctx, fns) : [];
            out.push(...kids);
          }
          break;
        }
        case 'cmd': {
          const consumed = this.cmd(nd, ctx, fns, acc, out, nodes, k);
          if (consumed) return out;
          break;
        }
        default: break;
      }
    }
    acc.flush();
    return out;
  }

  chip(ctx, s, e, text, title, err) { return this.atom(ctx, { k: 'chip', s, e, text, title, err: !!err }); }

  atom(ctx, a) {
    a.f = ctx.f;
    if (ctx.pm) {
      const s = ctx.pm[a.s], e = ctx.pm[a.e - 1];
      if (s < 0 || e < 0) { a.ro = true; a.s = -1; a.e = -1; }
      else { a.s = s; a.e = e + 1; if (a.is != null) { a.is = ctx.pm[a.is]; a.ie = ctx.pm[a.ie - 1] + 1; if (a.is < 0) a.ro = true; } }
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
    if (name in STY && nd.args.some(Boolean)) {
      acc.flush();
      const a = nd.args.filter(Boolean).pop();
      if (name === 'foreignlanguage' || name === 'textls') { out.push(...this.inl(a.nodes, ctx, fns)); return false; }
      const kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: STY[name], kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name }));
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
      out.push({ k: 'sty', st: 'color', color: A(1).trim(), kids, f: ctx.f, decl: true });
      return true;
    }
    if ((name === 'textcolor' || name === 'colorbox') && nd.args[2]) {
      acc.flush();
      const a = nd.args[2];
      const kids = this.inl(a.nodes, ctx, fns);
      if (!kids.length) kids.push(this.ph(ctx, a.is));
      out.push(this.styAtom(ctx, { k: 'sty', st: name === 'colorbox' ? 'bg' : 'color', color: A(1).trim(), kids, s: nd.s, e: nd.e, is: a.is, ie: a.ie, cmd: name }));
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
      fns.push({ num, inl: kids, f: ctx.f, mark });
      return false;
    }
    if (name === 'footnotemark') { acc.flush(); this.c.footnote++; out.push(this.atom(ctx, { k: 'fn', s: nd.s, e: nd.e, num: String(this.c.footnote) })); return false; }
    if (name === 'footnotetext') {
      acc.flush();
      const a = nd.args[1];
      const kids = a ? this.inl(a.nodes, ctx, fns) : [];
      fns.push({ num: String(this.c.footnote), inl: kids, f: ctx.f });
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
      out.push(this.atom(ctx, { k: 'sp', s: nd.s, e: nd.e, w: 'fill', rule: name === 'hrulefill' }));
      return false;
    }
    if (name === 'rule') {
      acc.flush();
      out.push(this.atom(ctx, { k: 'rule', s: nd.s, e: nd.e, w: A(0), h: A(1) }));
      return false;
    }
    if (name === 'num' || name === 'SI' || name === 'si' || name === 'qty' || name === 'unit') {
      acc.flush();
      const unitTex = (u) => u.replace(/\\percent/g, '\\%').replace(/\\per\b/g, '/').replace(/\\(kilo|mega|giga|milli|micro|nano)/g, (m, p) => ({ kilo: 'k', mega: 'M', giga: 'G', milli: 'm', micro: '\\mu ', nano: 'n' }[p])).replace(/\\(meter|metre)/g, 'm').replace(/\\second/g, 's').replace(/\\gram/g, 'g').replace(/\\hour/g, 'h');
      let tex = '';
      if (name === 'num') tex = A(1);
      else if (name === 'si' || name === 'unit') tex = '\\mathrm{' + unitTex(A(1)) + '}';
      else tex = A(1) + '\\,\\mathrm{' + unitTex(A(2)) + '}';
      out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, tex, display: false, si: true }));
      return false;
    }
    if (name === 'ce' || name === 'pu') {
      acc.flush();
      out.push(this.atom(ctx, { k: 'math', s: nd.s, e: nd.e, tex: '\\' + name + '{' + A(0) + '}', display: false, chem: true }));
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
    if (INVIS.has(name) || nd.def) return false;
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
      const word = cmd === 'Cref' || cmd === 'autoref' || cmd === 'Vref' ? nm[1] : nm[0];
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
      warn: [...new Set(this.warn)],
      words: this.words,
      bibEntries: (this.ensureBib(), this.bibEntries),
      cites: this.cites,
      nociteAll: this.nociteAll,
      fragment: !!this.fragment,
      sizes: SIZE_SETS[this.opts.pt] || SIZE_SETS[10],
      thms: this.thms,
      docBody: this.docBody || null
    };
  }
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
  let pendingLeft = 0;
  const s = spec.replace(/\s+/g, '');
  while (k < s.length) {
    const c = s[k];
    if (c === '|') { if (cols.length) cols[cols.length - 1].vr = (cols[cols.length - 1].vr || 0) + 1; else pendingLeft++; k++; continue; }
    if (c === '@' || c === '!' || c === '>' || c === '<') { k++; if (s[k] === '{') k = skipBrace(s, k); continue; }
    if (c === '*') {
      k++;
      let n = 1, sub = '';
      if (s[k] === '{') { const e = skipBrace(s, k); n = parseInt(s.slice(k + 1, e - 1), 10) || 1; k = e; }
      if (s[k] === '{') { const e = skipBrace(s, k); sub = s.slice(k + 1, e - 1); k = e; }
      for (let r = 0; r < n; r++) cols.push(...parseColSpec(sub));
      continue;
    }
    if ('lcrXLCRJS'.includes(c)) { cols.push({ align: c === 'c' || c === 'C' || c === 'S' ? 'c' : c === 'r' || c === 'R' ? 'r' : 'l', vl: cols.length === 0 ? pendingLeft : 0, x: c === 'X' }); k++; continue; }
    if ('pmb'.includes(c)) {
      k++;
      let w = null;
      if (s[k] === '{') { const e = skipBrace(s, k); w = s.slice(k + 1, e - 1); k = e; }
      cols.push({ align: 'p', w, vl: cols.length === 0 ? pendingLeft : 0 });
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
