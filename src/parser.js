// Rikuy LaTeX parser: a forgiving syntax tree where every node keeps exact
// source offsets. Nothing here interprets meaning; model.js does that.

export const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*',
  'flalign', 'flalign*', 'alignat', 'alignat*', 'eqnarray', 'eqnarray*', 'displaymath', 'math',
  'dmath', 'dmath*', 'subequations_raw'
]);
export const RAW_ENVS = new Set([
  'verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'tikzpicture', 'tikzcd',
  'filecontents', 'filecontents*', 'algorithmic', 'algorithmicx', 'pgfpicture', 'forest', 'spverbatim'
]);

// The tables below have no prototype: a document's \constructor or \begin{toString} is a name
// like any other, not Object.prototype's (looked up in a plain object, it threw "sig is not
// iterable" and the page took no more typing).
const own = (o) => Object.assign(Object.create(null), o);

// Argument signatures. o = optional [..], m = mandatory, v = verbatim braces,
// p = optional (..) as used by \cmidrule.
const SIG = own({
  part: 'om', chapter: 'om', section: 'om', subsection: 'om', subsubsection: 'om', paragraph: 'om', subparagraph: 'om',
  textbf: 'm', textit: 'm', emph: 'm', texttt: 'm', textsc: 'm', textsf: 'm', textrm: 'm', textup: 'm',
  textsl: 'm', textmd: 'm', textnormal: 'm', underline: 'm', uline: 'm', uuline: 'm', uwave: 'm', sout: 'm', xout: 'm',
  hl: 'om', mbox: 'm', fbox: 'm', text: 'm', textsuperscript: 'm', textsubscript: 'm', ensuremath: 'm',
  footnote: 'om', footnotetext: 'om', footnotemark: 'o', thanks: 'm', marginpar: 'om', todo: 'om',
  cite: 'oom', citet: 'oom', citep: 'oom', citealt: 'oom', citealp: 'oom', citeauthor: 'oom', citeyear: 'oom',
  citeyearpar: 'oom', Citet: 'oom', Citep: 'oom', Citealt: 'oom', Citealp: 'oom', Citeauthor: 'oom',
  textcite: 'oom', parencite: 'oom', autocite: 'oom', Textcite: 'oom', Parencite: 'oom', Autocite: 'oom',
  footcite: 'oom', smartcite: 'oom', citenum: 'm', nocite: 'm',
  ref: 'm', eqref: 'm', pageref: 'm', cref: 'm', Cref: 'm', autoref: 'm', nameref: 'm', vref: 'm', Vref: 'm',
  labelcref: 'm', label: 'm',
  url: 'v', href: 'vm', hyperref: 'om', hypertarget: 'mm', hyperlink: 'mm', nolinkurl: 'v',
  includegraphics: 'om', rikuywidget: 'omm', caption: 'om', captionof: 'mom', subcaption: 'om',
  item: 'o', title: 'om', author: 'om', date: 'm', and: '',
  vspace: 'm', hspace: 'm', setlength: 'mm', addtolength: 'mm', setcounter: 'mm', addtocounter: 'mm',
  stepcounter: 'm', refstepcounter: 'm', newcounter: 'mo',
  usepackage: 'om', RequirePackage: 'om', documentclass: 'om', theoremstyle: 'm', numberwithin: 'omm',
  bibliography: 'm', bibliographystyle: 'm', addbibresource: 'om', printbibliography: 'o',
  input: 'm', include: 'm', includeonly: 'm', subfile: 'm',
  textcolor: 'omm', color: 'om', colorbox: 'omm', fcolorbox: 'ommm', pagecolor: 'om', definecolor: 'mmm',
  multicolumn: 'mmm', cellcolor: 'om', rowcolor: 'om', columncolor: 'om', rowcolors: 'ommm', arrayrulecolor: 'om', multirow: 'omomom', cline: 'm', cmidrule: 'opm', addlinespace: 'o',
  hypersetup: 'm', geometry: 'm', linespread: 'm', setstretch: 'm', pagestyle: 'm', thispagestyle: 'm',
  pagenumbering: 'm', makebox: 'oom', framebox: 'oom', raisebox: 'moom', parbox: 'ooomm', scalebox: 'mom',
  resizebox: 'mmm', rotatebox: 'omm', phantom: 'm', hphantom: 'm', vphantom: 'm', intertext: 'm',
  newline: '', linebreak: 'o', pagebreak: 'o', nopagebreak: 'o', centerline: 'm',
  keywords: 'm', JEL: 'm', jel: 'm', sisetup: 'm', num: 'om', SI: 'omm', si: 'om', qty: 'omm', unit: 'om', ce: 'm', pu: 'm',
  lstinputlisting: 'om', inputminted: 'omm', verbatiminput: 'm', VerbatimInput: 'om', BVerbatimInput: 'om', LVerbatimInput: 'om',
  includepdf: 'om', includesvg: 'om', includestandalone: 'om',
  DTLdisplaydb: 'om', DTLdisplaylongdb: 'om', csvautotabular: 'om', csvautobooktabular: 'om', csvautolongtable: 'om',
  csvautobooklongtable: 'om', pgfplotstabletypeset: 'om', DTLpiechart: 'ommm', DTLbarchart: 'ommm', DTLmultibarchart: 'ommm',
  usetkzobj: 'm', psset: 'm', chemfig: 'om', chemname: 'om', setatomsep: 'm', setchemfig: 'm', definesubmol: 'mom', ch: 'om',
  DeclareSIUnit: 'omm',
  tikzstyle: 'm', tikzset: 'm', pgfplotsset: 'm', pgfkeys: 'm', pgfmathsetmacro: 'mm', pgfmathdeclarefunction: 'mmm',
  pgfdeclarelayer: 'm', pgfsetlayers: 'm', usepgfplotslibrary: 'm', newglossaryentry: 'mm', newacronym: 'ommm',
  loadglsentries: 'om', DTLloaddb: 'omm', DTLloadrawdb: 'omm', lstdefinestyle: 'mm', colorlet: 'mm', numrange: 'omm', SIrange: 'ommm', qtyrange: 'ommm', numlist: 'om', SIlist: 'omm', qtylist: 'omm',
  numproduct: 'om', SIproduct: 'omm', qtyproduct: 'omm', ang: 'om', tablenum: 'om',
  affil: 'om', affiliation: 'm', email: 'm', address: 'm', subtitle: 'm', shorttitle: 'm',
  newpage: '', clearpage: '', cleardoublepage: '', tableofcontents: '', listoffigures: '', listoftables: '',
  maketitle: '', appendix: '', noindent: '', indent: '', centering: '', raggedright: '', raggedleft: '',
  bigskip: '', medskip: '', smallskip: '', par: '', hfill: '', vfill: '', hline: '', toprule: 'o', midrule: 'o',
  bottomrule: 'o', specialrule: 'mmm', endfirsthead: '', endhead: '', endfoot: '', endlastfoot: '',
  bibitem: 'om', newblock: '', textwidth: '', linewidth: '', columnwidth: '', paperwidth: '', baselineskip: '',
  setcitestyle: 'm', bibpunct: 'om', captionsetup: 'om', graphicspath: 'm', DeclareGraphicsExtensions: 'm',
  onehalfspacing: '', doublespacing: '', singlespacing: '', frenchspacing: '', sloppy: '', fussy: '',
  protect: '', relax: '', makeatletter: '', makeatother: '', phantomsection: '', clubpenalty: '', widowpenalty: '',
  addcontentsline: 'mmm', index: 'm', glossary: 'm', setkeys: 'mm', allowdisplaybreaks: 'o',
  selectlanguage: 'm', foreignlanguage: 'omm', babelsublr: 'm', CJKfamily: 'm', ensure: 'm', textls: 'om', lowercase: 'm', uppercase: 'm',
  MakeUppercase: 'm', MakeLowercase: 'm', textcircled: 'm',
  // character formats Rikuy's Font group writes (src/cmd/font.js): ulem's other lines, its double
  // strikethrough, a size and a family for a run of text, ruby
  dashuline: 'm', dotuline: 'm', culine: 'mm', dsout: 'm', fontsize: 'mm', fontfamily: 'm', fontspec: 'om', ruby: 'omm'
});

// Commands that take no arguments but print characters, keyed by name.
export const CHARS = own({
  '%': '%', '&': '&', '$': '$', '#': '#', '_': '_', '{': '{', '}': '}', ' ': ' ', ',': ' ',
  ';': ' ', ':': ' ', '>': ' ', '!': '', '/': '', '@': '', '-': '­', '|': '‖',
  textbackslash: '\\', textasciitilde: '~', textasciicircum: '^', ldots: '…', dots: '…',
  textellipsis: '…', textendash: '–', textemdash: '—', textquoteleft: '‘',
  textquoteright: '’', textquotedblleft: '“', textquotedblright: '”', textquotesingle: "'",
  S: '§', P: '¶', pounds: '£', euro: '€', texteuro: '€', EUR: '€',
  copyright: '©', textcopyright: '©', textregistered: '®', texttrademark: '™',
  dag: '†', ddag: '‡', textdagger: '†', textdaggerdbl: '‡', textbullet: '•',
  textperiodcentered: '·', textdegree: '°', degree: '°', textbar: '|', textless: '<',
  textgreater: '>', textsection: '§', textparagraph: '¶', ss: 'ß', SS: 'SS', ae: 'æ', AE: 'Æ',
  dh: 'ð', DH: 'Ð', th: 'þ', TH: 'Þ', ng: 'ŋ', NG: 'Ŋ',
  oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł',
  L: 'Ł', i: 'ı', j: 'ȷ', quad: ' ', qquad: '  ', enspace: ' ',
  enskip: ' ', thinspace: ' ', nobreakspace: ' ', textvisiblespace: '␣', slash: '/',
  textunderscore: '_', textdollar: '$', textsterling: '£', textyen: '¥', textcent: '¢',
  textperthousand: '‰', textpm: '±', texttimes: '×', textdiv: '÷', textminus: '−',
  textmu: 'µ', textonehalf: '½', textonequarter: '¼', textthreequarters: '¾',
  guillemotleft: '«', guillemotright: '»', guillemetleft: '«', guillemetright: '»',
  quotedblbase: '„', quotesinglbase: '‚', textexclamdown: '¡', textquestiondown: '¿',
  checkmark: '✓', textordfeminine: 'ª', textordmasculine: 'º', DJ: 'Đ', dj: 'đ',
  NG: 'Ŋ', ng: 'ŋ', TH: 'Þ', th: 'þ', DH: 'Ð', dh: 'ð', i_: 'i',
  '\n': ' ', '\t': ' ', glqq: '\u201E', grqq: '\u201C', glq: '\u201A', grq: '\u2018', flqq: '\u00AB', frqq: '\u00BB',
  flq: '\u2039', frq: '\u203A', percent: '%', textasteriskcentered: '*', textnumero: '\u2116'
});

// Accent commands -> combining marks.
export const ACCENTS = own({
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
  u: '̆', v: '̌', H: '̋', c: '̧', k: '̨', r: '̊', d: '̣', b: '̱',
  t: '͡'
});

const DEF_CMDS = new Set(['newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'newcommandx']);
const ENV_DEF = new Set(['newenvironment', 'renewenvironment']);
const DIM_CMDS = new Set(['vskip', 'hskip', 'kern', 'vspace_', 'mskip']);

// Environment argument signatures (after \begin{name}).
const ENV_SIG = own({
  tabular: 'om', 'tabular*': 'mom', tabularx: 'mm', tabulary: 'mm', longtable: 'om', array: 'om',
  figure: 'o', 'figure*': 'o', table: 'o', 'table*': 'o', wrapfigure: 'omom', wraptable: 'omom',
  itemize: 'o', enumerate: 'o', description: 'o', minipage: 'ooom', thebibliography: 'm',
  multicols: 'moo', 'multicols*': 'moo', subfigure: 'om', subtable: 'om', threeparttable: 'o',
  alignat: 'm', 'alignat*': 'm', proof: 'o', adjustbox: 'm', center: '', tcolorbox: 'o', mdframed: 'o',
  minted: 'om', lstlisting: 'o', Verbatim: 'o', spacing: 'm', otherlanguage: 'm', 'otherlanguage*': 'm',
  landscape: '', appendices: '', resizebox_env: '',
  // CJK's encoding and font family are settings, not text: \begin{CJK*}[T1]{UTF8}{gbsn}
  CJK: 'omm', 'CJK*': 'omm'
});
// environments whose body is text and that take no optional title (any other unknown one does)
const PLAIN_ENVS = new Set(['document', 'abstract', 'center', 'quote', 'quotation', 'verse', 'flushleft', 'flushright', 'small', 'footnotesize', 'scriptsize', 'large', 'Large', 'appendix', 'appendices', 'singlespace', 'onehalfspace', 'doublespace', 'titlepage', 'landscape', 'acknowledgments', 'acknowledgements', 'RTL', 'LTR']);

// What the C++ parser (tex/native/core/parse.cc) reads at load: the tables are kept here only.
export const PARSE_TABLES = { SIG, CHARS, ACCENTS, ENV_SIG, MATH_ENVS, RAW_ENVS, DEF_CMDS, ENV_DEF, DIM_CMDS, PLAIN_ENVS };

export const MATH_SCAN = 5000;
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isWS = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

// Scan a whole source once for user macro arities so arguments attach correctly.
export function scanUserSigs(src, into = {}) {
  const re = /\\(?:re|provide)?newcommand\*?\s*\{?\s*\\([A-Za-z]+)\s*\}?\s*(?:\[\s*(\d)\s*\])?\s*(\[)?/g;
  let m;
  while ((m = re.exec(src))) {
    const n = m[2] ? +m[2] : 0;
    const opt = !!m[3] && n > 0;
    into[m[1]] = (opt ? 'o' + 'm'.repeat(n - 1) : 'm'.repeat(n));
  }
  const re2 = /\\def\s*\\([A-Za-z]+)((?:#\d)*)\s*\{/g;
  while ((m = re2.exec(src))) into[m[1]] = 'm'.repeat((m[2].match(/#/g) || []).length);
  // environments whose opening code starts a picture are pictures themselves: kept as source
  // blocks (drawn in the PDF) like tikzpicture, instead of having their body read as text
  const W = '(?:\\s|%[^\\n]*(?:\\n|$))*';
  const re3 = new RegExp('\\\\(?:re|provide)?newenvironment\\*?' + W + '\\{\\s*([A-Za-z@*]+)\\s*\\}' + W + '(?:\\[[^\\]]*\\]' + W + '){0,2}\\{|\\\\(?:New|Renew|Provide)DocumentEnvironment' + W + '\\{\\s*([A-Za-z@*]+)\\s*\\}' + W + '\\{[^{}]*\\}' + W + '\\{', 'g');
  while ((m = re3.exec(src))) {
    let d = 0, k = re3.lastIndex - 1;
    for (; k < src.length; k++) { const c = src[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}' && --d === 0) break; }
    const begin = src.slice(re3.lastIndex, k);
    if (/\\begin\s*\{\s*(tikzpicture|pgfpicture|tikzcd|forest|pspicture|circuitikz)\s*\}|\\tikz\b/.test(begin)) into[' rawenv:' + (m[1] || m[2])] = 'raw';
  }
  return into;
}

// The C++ parser, once src/native.js has loaded it (setNativeParse): the same tree, made several
// times faster on a long file. It answers null where it cannot (no core, a short text, nesting
// past its depth), and parseJS, which it is tested against, does the work.
let nativeParse = null;
export function setNativeParse(f) { nativeParse = f; }

export function parse(src, opts = {}) {
  const userSigs = opts.userSigs || scanUserSigs(src);
  if (nativeParse) { const r = nativeParse(src, userSigs); if (r) return r; }
  return parseJS(src, userSigs);
}

// (a user's signature is an own entry: \constructor is no member of Object.prototype here)
const userSig = (sigs, name) => (Object.prototype.hasOwnProperty.call(sigs, name) ? sigs[name] : undefined);

export function parseJS(src, userSigs) {
  const n = src.length;
  const envStack = [];
  let i = 0;

  function skipSpacesNoPar() {
    // Skip spaces and at most one newline (not a blank line).
    let j = i, nl = 0;
    while (j < n && isWS(src[j])) {
      if (src[j] === '\n') { nl++; if (nl > 1) return; }
      j++;
    }
    if (nl > 1) return;
    i = j;
  }
  function peekAfterSpaces() {
    let j = i, nl = 0;
    while (j < n && isWS(src[j])) { if (src[j] === '\n') nl++; j++; }
    return nl > 1 ? -1 : j;
  }

  function parseSeq(stop) {
    const nodes = [];
    let ts = -1;
    const flush = () => { if (ts >= 0 && ts < i) nodes.push({ t: 'text', s: ts, e: i }); ts = -1; };
    while (i < n) {
      const c = src[i];
      if (stop === '}' && c === '}') break;
      if (stop === ']' && c === ']') break;
      if (c === '\\') {
        // Stop at \end{...} that closes this or an ancestor env.
        if (src.startsWith('\\end', i) && !isLetter(src[i + 4] || '')) {
          const m = /^\\end\s*\{([^}]*)\}/.exec(src.slice(i, i + 80));
          if (m) {
            const name = m[1].trim();
            if (envStack.length && envStack.includes(name)) break;
          }
        }
        flush();
        nodes.push(parseCommand(stop));
        continue;
      }
      if (c === '{') { flush(); nodes.push(parseGroup()); continue; }
      if (c === '}') { flush(); nodes.push({ t: 'special', ch: '}', s: i, e: i + 1, err: true }); i++; continue; }
      if (c === '$') { flush(); nodes.push(parseDollar()); continue; }
      if (c === '%') {
        flush();
        let j = i;
        while (j < n && src[j] !== '\n') j++;
        if (j < n) {
          j++; // eat newline
          // TeX also drops leading spaces on the next line.
          while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
        }
        nodes.push({ t: 'comment', s: i, e: j });
        i = j;
        continue;
      }
      if (c === '~' || c === '&' || c === '^' || c === '_' || c === '#') {
        flush(); nodes.push({ t: 'special', ch: c, s: i, e: i + 1 }); i++; continue;
      }
      if (isWS(c)) {
        let j = i, nl = 0;
        while (j < n && isWS(src[j])) { if (src[j] === '\n') nl++; j++; }
        const prev = nodes[nodes.length - 1];
        if (ts < 0 && prev && prev.t === 'comment' && src[prev.e - 1] === '\n' && nl >= 1) nl++;
        if (nl >= 2) { flush(); nodes.push({ t: 'par', s: i, e: j, nl }); i = j; continue; }
        if (ts < 0) ts = i;
        i = j;
        continue;
      }
      if (ts < 0) ts = i;
      i++;
    }
    flush();
    return nodes;
  }

  function parseGroup() {
    const s = i;
    i++; // {
    const nodes = parseSeq('}');
    let e, ie = i;
    if (src[i] === '}') { i++; e = i; } else { e = i; }
    return { t: 'group', s, e, is: s + 1, ie, nodes };
  }

  // A $ or $$ closes within MATH_SCAN code units or not at all: the longest formula of the corpus's
  // documents is 728, and a scan that ran to the end of the text from every $ that never closes
  // (braces TeX does not count, in a \verb or a verbatim, keep it from closing) stalled the page
  // for seconds on a crafted file. (parse.cc reads the same bound.)
  function findClosingDollar(from, double) {
    let depth = 0;
    const end = Math.min(n, from + MATH_SCAN);
    for (let j = from; j < end; j++) {
      const c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '%') { while (j < end && src[j] !== '\n') j++; }
      else if (c === '\n') {
        let k = j + 1;
        while (k < n && (src[k] === ' ' || src[k] === '\t' || src[k] === '\r')) k++;
        if (src[k] === '\n') return -1; // blank line ends math (TeX error)
      } else if (c === '$' && depth <= 0) {
        if (double) { if (src[j + 1] === '$') return j; }
        else return j;
      }
    }
    return -1;
  }

  function parseDollar() {
    const s = i;
    const dbl = src[i + 1] === '$';
    const from = i + (dbl ? 2 : 1);
    const close = findClosingDollar(from, dbl);
    if (close < 0) { i = from; return { t: 'special', ch: dbl ? '$$' : '$', s, e: from, err: true }; }
    i = close + (dbl ? 2 : 1);
    return { t: 'math', s, e: i, is: from, ie: close, display: dbl, delim: dbl ? '$$' : '$' };
  }

  // The first place of a string at or after p (src.indexOf), remembered per string: nothing found
  // from p is nothing from any later place, and k found from p is k from every place up to k.
  // Searches that do not move i past what they find (\( without \), the [ after an unknown
  // command, \begin{equation} without its end) once ran to the end of the text for every
  // occurrence: seconds on a crafted file of 100 KB, a stranger's through a share link, again at
  // every keystroke. (parse.cc remembers the same way.)
  const seen = new Map();
  function nextAt(pat, p) {
    const c = seen.get(pat);
    if (c && p >= c[0] && (c[1] < 0 || p <= c[1])) return c[1];
    const k = src.indexOf(pat, p);
    seen.set(pat, [p, k]);
    return k;
  }
  // Where a raw environment ends: every \end{name} of the text (\end { name } too, with spaces
  // anywhere JavaScript's \s takes them), found in one pass the first time one is asked for, then
  // a binary search per environment. A memo per name once let 8000 environments of 8000 names,
  // none ended, scan the text 8000 times. Names of other characters than these (no environment
  // Rikuy or a document defines has them) take the searches below.
  const END_NAME = /^[A-Za-z@*_]*$/;
  let endIx = null;
  function endIndex() {
    endIx = new Map();
    const sp = (c) => c !== undefined && /\s/.test(c);
    const nameCh = (c) => c !== undefined && /[A-Za-z@*_]/.test(c);
    for (let k = src.indexOf('\\end'); k >= 0; k = src.indexOf('\\end', k + 4)) {
      let p = k + 4;
      while (sp(src[p])) p++;
      if (src[p] !== '{') continue;
      let a = p + 1;
      while (sp(src[a])) a++;
      let b = a;
      while (nameCh(src[b])) b++;
      let c = b;
      while (sp(src[c])) c++;
      if (src[c] !== '}') continue;
      const name = src.slice(a, b);
      let e = endIx.get(name);
      if (!e) endIx.set(name, (e = { x: [], l: [], len: [] }));
      if (src[k + 4] === '{' && a === k + 5 && c === b) e.x.push(k);
      e.l.push(k); e.len.push(c + 1 - k);
    }
  }
  const atOrAfter = (list, p) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] < p) lo = m + 1; else hi = m; } return lo; };
  // [start of the end, its length] at or after p, \end{name} first, else \end { name }; [-1, 0]
  function rawEnd(name, p) {
    if (!END_NAME.test(name)) {
      const closer = '\\end{' + name + '}', k = nextAt(closer, p);
      if (k >= 0) return [k, closer.length];
      const mm = looseEnd(name, p);
      return [mm[1], mm[2]];
    }
    if (!endIx) endIndex();
    const e = endIx.get(name);
    if (!e) return [-1, 0];
    const x = atOrAfter(e.x, p);
    if (x < e.x.length) return [e.x[x], name.length + 6];
    const l = atOrAfter(e.l, p);
    return l < e.l.length ? [e.l[l], e.len[l]] : [-1, 0];
  }
  // the same for \end { name } with spaces in it: [from, start of the match, its length]
  const seenLoose = new Map();
  function looseEnd(name, p) {
    let c = seenLoose.get(name);
    if (!(c && p >= c[0] && (c[1] < 0 || p <= c[1]))) {
      const re = new RegExp('\\\\end\\s*\\{\\s*' + name.replace(/[*]/g, '\\*') + '\\s*\\}', 'g');
      re.lastIndex = p;
      const mm = re.exec(src);
      c = [p, mm ? mm.index : -1, mm ? mm[0].length : 0];
      seenLoose.set(name, c);
    }
    return c;
  }

  function parseArgs(sig) {
    const args = [];
    for (const kind of sig) {
      const save = i;
      if (kind === 'o' || kind === 'p') {
        const open = kind === 'o' ? '[' : '(';
        const close = kind === 'o' ? ']' : ')';
        const j = peekAfterSpaces();
        if (j >= 0 && src[j] === open) {
          i = j;
          const s = i; i++;
          let nodes;
          if (kind === 'o') nodes = parseSeq(']');
          else { while (i < n && src[i] !== ')') i++; nodes = []; }
          const ie = i;
          if (src[i] === close) i++;
          args.push({ o: true, s, e: i, is: s + 1, ie, nodes });
        } else {
          args.push(null);
          i = save;
        }
      } else if (kind === 'm' || kind === 'v') {
        const j = peekAfterSpaces();
        if (j < 0 || j >= n) { args.push(null); continue; }
        i = j;
        if (src[i] === '{') {
          if (kind === 'v') {
            const s = i; let depth = 0; let k = i;
            for (; k < n; k++) {
              if (src[k] === '\\') { k++; continue; }
              if (src[k] === '{') depth++;
              else if (src[k] === '}') { depth--; if (depth === 0) break; }
            }
            i = Math.min(n, k + 1);
            args.push({ o: false, s, e: i, is: s + 1, ie: Math.min(k, n), nodes: [], raw: true });
          } else {
            const g = parseGroup();
            args.push({ o: false, s: g.s, e: g.e, is: g.is, ie: g.ie, nodes: g.nodes });
          }
        } else if (src[i] === '}' || src[i] === ']' || (src[i] === '\\' && src.startsWith('\\end', i) && !isLetter(src[i + 4] || ''))) {
          args.push(null); i = save;
        } else if (src[i] === '\\') {
          const s = i;
          const node = parseCommand(null, true);
          args.push({ o: false, s, e: i, is: s, ie: i, nodes: [node], single: true });
        } else {
          const s = i; i++;
          args.push({ o: false, s, e: i, is: s, ie: i, nodes: [{ t: 'text', s, e: i }], single: true });
        }
      }
    }
    return args;
  }

  function parseCommand(stop, noArgs) {
    const s = i;
    let j = i + 1;
    if (j >= n) { i = n; return { t: 'special', ch: '\\', s, e: n, err: true }; }
    let name;
    const word = isLetter(src[j]);
    if (word) {
      while (j < n && isLetter(src[j])) j++;
      name = src.slice(i + 1, j);
    } else {
      name = src[j]; j++;
    }
    let star = false;
    if (src[j] === '*' && (word || name === '\\') && !(name in CHARS)) { star = true; j++; }
    const ne = j;
    i = j;
    if (word) skipSpacesNoPar();
    const ge = i;
    const node = { t: 'cmd', name, s, e: ge, ne, star, args: [] };
    if (noArgs) { return node; }

    if (name === 'begin') return parseEnv(s, stop);
    if (name === 'end') {
      const m = /^\s*\{([^}]*)\}/.exec(src.slice(i, i + 80));
      if (m) i += m[0].length;
      return { t: 'stray', name: m ? m[1] : '', s, e: i };
    }
    if (name === '(' || name === '[') {
      const closer = name === '(' ? '\\)' : '\\]';
      const k = nextAt(closer, ne);
      if (k < 0) { i = ne; return { t: 'special', ch: '\\' + name, s, e: ne, err: true }; }
      i = k + 2;
      return { t: 'math', s, e: i, is: ne, ie: k, display: name === '[', delim: name === '(' ? '\\(' : '\\[' };
    }
    if (name === 'verb') {
      const d = src[ne];
      if (!d || isLetter(d) || isWS(d)) { i = ne; return node; }
      const k = src.indexOf(d, ne + 1);
      const end = k < 0 ? n : k;
      i = Math.min(n, end + 1);
      return { t: 'verb', s, e: i, is: ne + 1, ie: end };
    }
    if (DEF_CMDS.has(name)) return parseDef(node);
    if (ENV_DEF.has(name)) return parseEnvDef(node);
    if (name === 'def' || name === 'gdef' || name === 'edef' || name === 'xdef') return parseTeXDef(node);
    if (name === 'let') {
      const m = /^\s*\\([A-Za-z]+|.)\s*=?\s*(\\[A-Za-z]+|\\.|[^\s])/.exec(src.slice(ne, ne + 120));
      if (m) { i = ne + m[0].length; node.e = i; node.def = { kind: 'let', name: m[1], body: m[2] }; }
      return node;
    }
    if (name === 'DeclareMathOperator') {
      node.args = parseArgs('mm');
      node.e = lastEnd(node);
      node.def = { kind: 'op' };
      return node;
    }
    if (name === 'newtheorem') {
      node.args = parseArgs(star ? 'mm' : 'momo');
      node.e = lastEnd(node);
      return node;
    }
    if (DIM_CMDS.has(name)) {
      const m = /^\s*(?:-?[\d.]+\s*(?:pt|em|ex|in|cm|mm|bp|pc|dd|cc|sp|mu)|\\[A-Za-z]+)(?:\s*plus\s*-?[\d.]+\s*(?:fill|fil|pt|em|ex|in|cm|mm|mu))?(?:\s*minus\s*-?[\d.]+\s*(?:pt|em|ex|in|cm|mm|mu))?/.exec(src.slice(ne, ne + 120));
      if (m) { i = ne + m[0].length; node.e = i; }
      return node;
    }
    if (name in ACCENTS && (word ? name.length === 1 : true)) {
      // \'e, \'{e}, \"\i, \c c
      if (!word) {
        if (src[i] === '{') {
          const g = parseGroup();
          node.args = [{ o: false, s: g.s, e: g.e, is: g.is, ie: g.ie, nodes: g.nodes }];
        } else if (src[i] === '\\') {
          const s2 = i; const c2 = parseCommand(null, true);
          node.args = [{ o: false, s: s2, e: i, is: s2, ie: i, nodes: [c2], single: true }];
        } else if (i < n && !isWS(src[i])) {
          node.args = [{ o: false, s: i, e: i + 1, is: i, ie: i + 1, nodes: [{ t: 'text', s: i, e: i + 1 }], single: true }];
          i++;
        }
      } else {
        node.args = parseArgs('m');
      }
      node.accent = true;
      node.e = lastEnd(node);
      return node;
    }
    let sig = SIG[name];
    if (sig === undefined) sig = userSig(userSigs, name);
    if (name === '\\') sig = 'o';
    if (sig === undefined && name in CHARS) {
      // A character command takes no argument: an empty {} after it only ends its name, and a
      // group with text in it (\%{b}, \ldots{}{\em x}) is text of its own, shown and kept
      i = ne;
      if (src[i] === '{' && src[i + 1] === '}') {
        i += 2;
        node.args = [{ o: false, s: ne, e: i, is: ne + 1, ie: ne + 1, nodes: [] }];
        node.e = i;
      } else { i = ge; node.e = ge; }
      return node;
    }
    if (sig === undefined) {
      // Unknown: attach directly adjacent {..} groups (no whitespace) only.
      const args = [];
      i = ne;
      while (src[i] === '{' || (src[i] === '[' && args.length === 0 && nextAt(']', i) > 0 && src[nextAt(']', i) + 1] === '{')) {
        if (src[i] === '[') { const a = parseArgs('o')[0]; args.push(a); continue; }
        const g = parseGroup();
        args.push({ o: false, s: g.s, e: g.e, is: g.is, ie: g.ie, nodes: g.nodes });
      }
      if (args.length === 0) { i = ge; }
      node.args = args;
      node.unknown = true;
      node.e = args.length ? lastEnd(node) : ge;
      return node;
    }
    if (sig.length) {
      const save = i;
      node.args = parseArgs(sig);
      if (node.args.every((a) => !a)) { i = save; node.e = ge; }
      else node.e = lastEnd(node);
    }
    if (name === 'tikzstyle' && node.args[0]) {
      // \tikzstyle{name}=[keys] (or +=): the keys belong to the command, not to the text
      const m = /^\s*\+?=\s*\[/.exec(src.slice(i, i + 40));
      if (m) { i = Math.min(n, matchBracket(i + m[0].length - 1) + 1); node.e = i; }
    }
    return node;
  }

  function lastEnd(node) {
    let e = node.ne;
    for (const a of node.args) if (a) e = Math.max(e, a.e);
    // keep i consistent
    if (i < e) i = e;
    return Math.max(e, i);
  }

  function parseDef(node) {
    // \newcommand{\name}[n][default]{body}  or \newcommand\name...
    let m = /^\s*(?:\{\s*\\([A-Za-z]+|.)\s*\}|\\([A-Za-z]+|.))/.exec(src.slice(node.ne, node.ne + 200));
    if (!m) { i = node.ne; return node; }
    const name = m[1] || m[2];
    i = node.ne + m[0].length;
    let nargs = 0, dflt = null;
    let j = peekAfterSpaces();
    if (j >= 0 && src[j] === '[') {
      const k = nextAt(']', j);
      if (k > 0) { nargs = parseInt(src.slice(j + 1, k), 10) || 0; i = k + 1; }
    }
    j = peekAfterSpaces();
    if (j >= 0 && src[j] === '[') {
      const k = matchBracket(j);
      dflt = src.slice(j + 1, k); i = k + 1;
    }
    j = peekAfterSpaces();
    let bs = -1, be = -1;
    if (j >= 0 && src[j] === '{') { i = j; const k = matchBrace(j); bs = j + 1; be = k; i = Math.min(n, k + 1); }
    node.e = i;
    node.def = { kind: 'cmd', name, nargs, dflt, body: bs >= 0 ? src.slice(bs, be) : '', bs, be };
    return node;
  }

  function parseEnvDef(node) {
    const m = /^\s*\{([^}]*)\}/.exec(src.slice(node.ne, node.ne + 200));
    if (!m) { i = node.ne; return node; }
    i = node.ne + m[0].length;
    let nargs = 0;
    let j = peekAfterSpaces();
    // (no ] after the [: indexOf's -1 once put i back to 0, and the parse ran for ever)
    if (j >= 0 && src[j] === '[') { const k = nextAt(']', j); if (k > 0) { nargs = parseInt(src.slice(j + 1, k), 10) || 0; i = k + 1; } }
    j = peekAfterSpaces();
    if (j >= 0 && src[j] === '[') { const k = matchBracket(j); i = k + 1; }
    const parts = [];
    for (let t = 0; t < 2; t++) {
      j = peekAfterSpaces();
      if (j >= 0 && src[j] === '{') { const k = matchBrace(j); parts.push(src.slice(j + 1, k)); i = Math.min(n, k + 1); }
    }
    node.e = i;
    node.def = { kind: 'env', name: m[1].trim(), nargs, begin: parts[0] || '', end: parts[1] || '' };
    return node;
  }

  function parseTeXDef(node) {
    const m = /^\s*\\([A-Za-z]+|.)((?:\s*#\d)*)\s*/.exec(src.slice(node.ne, node.ne + 200));
    if (!m) { i = node.ne; return node; }
    i = node.ne + m[0].length;
    let bs = -1, be = -1;
    if (src[i] === '{') { const k = matchBrace(i); bs = i + 1; be = k; i = Math.min(n, k + 1); }
    node.e = i;
    node.def = { kind: 'cmd', name: m[1], nargs: (m[2].match(/#/g) || []).length, dflt: null, body: bs >= 0 ? src.slice(bs, be) : '', bs, be };
    return node;
  }

  function matchBrace(j) {
    let depth = 0;
    for (let k = j; k < n; k++) {
      const c = src[k];
      if (c === '\\') { k++; continue; }
      if (c === '%') { while (k < n && src[k] !== '\n') k++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return k; }
    }
    return n;
  }
  function matchBracket(j) {
    let depth = 0;
    for (let k = j + 1; k < n; k++) {
      const c = src[k];
      if (c === '\\') { k++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === ']' && depth === 0) return k;
    }
    return n;
  }

  function parseEnv(s, stop) {
    const m = /^\s*\{([^}]*)\}/.exec(src.slice(i, i + 120));
    if (!m) return { t: 'stray', name: 'begin', s, e: i };
    const name = m[1].trim();
    i += m[0].length;
    const nameEnd = i;
    let sig = ENV_SIG[name] || '';
    if (MATH_ENVS.has(name) || RAW_ENVS.has(name) || userSig(userSigs, ' rawenv:' + name)) {
      let args = [];
      if (name === 'alignat' || name === 'alignat*') { args = parseArgs('m'); }
      else if (name === 'minted') { args = parseArgs('om'); }
      else if (name === 'lstlisting' || name === 'Verbatim') {
        // optional arg must be on the same line
        if (src[i] === '[') args = parseArgs('o');
      }
      const be = i;
      // (whitespace inside \end { name } is tolerated)
      const [k, len] = rawEnd(name, be);
      if (k < 0) { i = be; return { t: 'stray', name: 'begin{' + name + '}', s, e: be, err: true }; }
      i = k + len;
      return { t: 'env', name, s, e: i, bs: s, be, es: k, args, raw: true, math: MATH_ENVS.has(name), nameEnd };
    }
    // Args for theorem-like envs: optional title.
    if (!sig && !PLAIN_ENVS.has(name)) sig = 'o';
    let args = [];
    if (sig) {
      // optional args of envs must not swallow text on the next line: only if '[' or '{' follows.
      args = parseArgs(sig);
    }
    const be = i;
    envStack.push(name);
    const nodes = parseSeq({ env: name });
    envStack.pop();
    let es = i, e = i;
    const mm = /^\\end\s*\{([^}]*)\}/.exec(src.slice(i, i + 80));
    if (mm && mm[1].trim() === name) { i += mm[0].length; e = i; }
    return { t: 'env', name, s, e, bs: s, be, es, args, nodes, nameEnd };
  }

  const nodes = parseSeq(null);
  // Anything left (stray closers) becomes errors.
  while (i < n) {
    const c = src[i];
    nodes.push({ t: 'special', ch: c, s: i, e: i + 1, err: true });
    i++;
    nodes.push(...parseSeq(null));
  }
  return nodes;
}

// Split a math body at top-level \\ (row separators) respecting braces and nested envs.
export function splitRows(tex) {
  const rows = [];
  let depth = 0, envDepth = 0, start = 0;
  for (let k = 0; k < tex.length; k++) {
    const c = tex[k];
    if (c === '%') { while (k < tex.length && tex[k] !== '\n') k++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '\\') {
      if (tex.startsWith('\\begin', k) && !isLetter(tex[k + 6] || '')) envDepth++;
      else if (tex.startsWith('\\end', k) && !isLetter(tex[k + 4] || '')) envDepth--;
      else if (tex[k + 1] === '\\' && depth === 0 && envDepth === 0) {
        let e = k + 2;
        if (tex[e] === '*') e++;
        const m = /^\s*\[[^\]]*\]/.exec(tex.slice(e, e + 40));
        if (m) e += m[0].length;
        rows.push({ s: start, e: k, sepEnd: e });
        start = e; k = e - 1; continue;
      }
      k++;
    }
  }
  rows.push({ s: start, e: tex.length, sepEnd: tex.length });
  return rows;
}

// Check whether deleting/wrapping src[a,b) keeps the document well formed.
export function isBalanced(src, a, b) {
  if (a > b) return false;
  // Not inside a control word or splitting an escape.
  const insideCs = (p) => {
    if (p <= 0 || p >= src.length) return false;
    if (src[p - 1] === '\\') { let nb = 0, k = p - 1; while (k >= 0 && src[k] === '\\') { nb++; k--; } if (nb % 2 === 1) return true; } // splits \x
    if (!isLetter(src[p]) || !isLetter(src[p - 1])) return false;
    let k = p - 1;
    while (k >= 0 && isLetter(src[k])) k--;
    if (k < 0 || src[k] !== '\\') return false;
    let nb = 0;
    while (k >= 0 && src[k] === '\\') { nb++; k--; }
    return nb % 2 === 1;
  };
  if (insideCs(a) || insideCs(b)) return false;
  // brackets count too: a range that takes the ] of an optional argument (a theorem's title,
  // \item[...]) and not its [ leaves "Runaway argument" behind
  let depth = 0, dollars = 0, brackets = 0;
  const envs = [];
  for (let k = a; k < b; k++) {
    const c = src[k];
    if (c === '\\') {
      const rest = src.slice(k, k + 60);
      let m;
      // \verb|...|: a % or a brace between the delimiters is text, not a comment or a group
      if ((m = /^\\(?:verb\*?|lstinline)(?![A-Za-z])/.exec(rest))) {
        const at = k + m[0].length, d = src[at];
        const close = d && !/[\s{[a-zA-Z]/.test(d) ? src.indexOf(d, at + 1) : -1;
        if (close >= 0 && !src.slice(at, close).includes('\n')) { if (close >= b) return false; k = close; continue; }
      }
      if ((m = /^\\begin\s*\{([^}]*)\}/.exec(rest))) { envs.push(m[1].trim()); k += m[0].length - 1; continue; }
      if ((m = /^\\end\s*\{([^}]*)\}/.exec(rest))) {
        if (envs.pop() !== m[1].trim()) return false;
        k += m[0].length - 1; continue;
      }
      if (src[k + 1] === '(' || src[k + 1] === '[') { dollars++; k++; continue; }
      if (src[k + 1] === ')' || src[k + 1] === ']') { dollars--; if (dollars < 0) return false; k++; continue; }
      k++; continue;
    }
    if (c === '%') { while (k < b && src[k] !== '\n') k++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < 0) return false; }
    else if (c === '$') dollars ^= 1;
    else if (c === '[' && !dollars) brackets++;
    else if (c === ']' && !dollars) { brackets--; if (brackets < 0) return false; }
  }
  if (depth !== 0 || envs.length || dollars !== 0 || brackets !== 0) return false;
  // A comment started before a and running into the range is fine; but the range
  // must not end inside a comment line whose start lies outside (rare); ignore.
  return true;
}
