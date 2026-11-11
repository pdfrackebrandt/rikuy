// Chinese and Arabic text: which of the two scripts a document is written in, whether its
// preamble sets them up, and the lines that do. LaTeX's default fonts have neither script, so a
// document needs a package that names a font and, for Arabic, one that sets the text right to
// left. Rikuy adds those lines when asked (app.js) and when it reads a Word file (wordjobs.js).
//
// Chinese alone goes to XeLaTeX with ctex (the Fandol fonts, line breaks between characters,
// Chinese punctuation). Arabic goes to LuaLaTeX with babel's bidi=basic, the one route on which
// TeX orders mixed right to left and left to right text by itself, as a browser does; Chinese
// in the same document then goes through babel too. The worker picks the engine from these
// lines (pickEngine in tex/engine.js).

const HAN = /[⺀-⿟々-〇〡-〩㐀-䶿一-鿿豈-﫿]/;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/u;
// India's scripts (the danda and double danda, U+0964 and U+0965, stand in Devanagari's block
// and end sentences in most of the nine: they are no script's own). [id, name, its characters, babel's language and locale file, the Noto font
// the tree carries, the names babel and polyglossia give languages written in it, and for the
// two scripts babel's onchar has no character range for (2026), the range to tell it]
export const INDIC = [
  ['devanagari', 'Devanagari', /[\u0900-\u0963\u0966-\u097F\uA8E0-\uA8FF]/, 'hindi', 'hi', 'Noto Serif Devanagari', /^(hindi|marathi|sanskrit|sanskrit-deva(nagari)?|nepali|konkani|devanagari)$/],
  ['bengali', 'Bengali', /[\u0980-\u09FF]/, 'bengali', 'bn', 'Noto Serif Bengali', /^(bengali|bangla|assamese|sanskrit-beng(ali)?)$/],
  ['gurmukhi', 'Gurmukhi', /[\u0A00-\u0A7F]/, 'punjabi', 'pa', 'Noto Serif Gurmukhi', /^(punjabi|panjabi|gurmukhi)$/, 'Guru = {{0x0A00, 0x0A7F}}'],
  ['gujarati', 'Gujarati', /[\u0A80-\u0AFF]/, 'gujarati', 'gu', 'Noto Serif Gujarati', /^(gujarati|sanskrit-gujr|sanskrit-gujarati)$/, 'Gujr = {{0x0A80, 0x0AFF}}'],
  ['odia', 'Odia', /[\u0B00-\u0B7F]/, 'odia', 'or', 'Noto Sans Oriya', /^(odia|oriya)$/],
  ['tamil', 'Tamil', /[\u0B80-\u0BFF]/, 'tamil', 'ta', 'Noto Serif Tamil', /^tamil$/],
  ['telugu', 'Telugu', /[\u0C00-\u0C7F]/, 'telugu', 'te', 'Noto Serif Telugu', /^(telugu|sanskrit-telu(gu)?)$/],
  ['kannada', 'Kannada', /[\u0C80-\u0CFF]/, 'kannada', 'kn', 'Noto Serif Kannada', /^(kannada|sanskrit-knda|sanskrit-kannada)$/],
  ['malayalam', 'Malayalam', /[\u0D00-\u0D7F]/, 'malayalam', 'ml', 'Noto Serif Malayalam', /^(malayalam|sanskrit-mlym|sanskrit-malayalam)$/]
];
// Five more scripts on the same route, rows of the same shape with what differs in a ninth
// place: other fonts for sans serif and typewriter, no HarfBuzz for the square scripts, and the
// right to left one. Japanese is told by its kana and Korean by its hangul; the Chinese
// characters beside them are theirs (scriptNeeds).
export const MORE = [
  ['japanese', 'Japanese', /[\u3040-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/, 'japanese', 'ja', 'Harano Aji Mincho', /^japanese$/, null, { sf: 'Harano Aji Gothic', tt: 'Harano Aji Gothic', opt: '' }],
  ['korean', 'Korean', /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/, 'korean', 'ko', 'NanumMyeongjo', /^korean(-han[i]?)?$/, null, { sf: 'NanumGothic', tt: 'NanumGothic', opt: '' }],
  ['hebrew', 'Hebrew', /[\u0590-\u05FF\uFB1D-\uFB4F]/, 'hebrew', 'he', 'Hadasim CLM', /^hebrew$/, null, { rtl: true }],
  ['thai', 'Thai', /[\u0E00-\u0E7F]/, 'thai', 'th', 'Noto Serif Thai', /^thai$/, null, {}],
  ['sinhala', 'Sinhala', /[\u0D80-\u0DFF]/, 'sinhala', 'si', 'Noto Serif Sinhala', /^sinhala$/, null, { joiners: true }]
];
// every script that babel sets by its characters, in the order needs are listed
const BY_CHAR = [...INDIC, ...MORE];
const INDIC_ANY = /[\u0590-\u05FF\u0900-\u0E7F\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u31F0-\u31FF\uA8E0-\uA8FF\uAC00-\uD7AF\uFB1D-\uFB4F\uFF66-\uFF9F]/;
// languages written in Arabic's script (Hebrew runs right to left too, in a script of its own)
const ARABIC_LANGUAGES = /^(arabic|farsi|persian|urdu|kurdish|sorani|pashto|uyghur|sindhi|arabic-[a-z]+)$/;
// What a person calls the script with that id: 'Chinese', 'Arabic', 'Devanagari', ...
export const scriptName = (id) => (id === 'chinese' ? 'Chinese' : id === 'arabic' ? 'Arabic' : ([...INDIC, ...MORE].find((x) => x[0] === id) || [0, id])[1]);
// a character of either script, anywhere: most documents have none and are then not read at all
const EITHER = new RegExp(HAN.source + '|' + ARABIC.source + '|' + INDIC_ANY.source);
// A preamble is read up to here. No real one is longer, and a stranger's document (a link, a
// .zip) is read on the page at every key: with the bounds on each argument below, even one made
// to be slow (a megabyte of "\usepackage[" never closed) takes a moment, not minutes.
const PRE_MAX = 200000;

const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, '$1');
// what the reader sees of a body: commands' names, environments' names and math are not text
const proseOf = (t) => stripComments(t).replace(/\\(begin|end)\s*\{[^}]{0,200}\}/g, ' ').replace(/\\[A-Za-z@]+\*?/g, ' ').replace(/\$\$[^$]*\$\$|\$[^$\n]*\$/g, ' ');
// where \begin{document} stands, -1 without one; a commented one (a template's "% \begin{document}")
// is not it
const commented = (text, i) => /(^|[^\\])%/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i));
function docStart(tex) {
  for (let i = -1; ;) {
    i = tex.indexOf('\\begin{document}', i + 1);
    if (i < 0 || !commented(tex, i)) return i;
  }
}
const bodyOf = (tex) => { const i = docStart(tex); return i < 0 ? tex : tex.slice(i + 16); };
const preambleOf = (tex) => { const i = docStart(tex); return i < 0 ? '' : tex.slice(0, Math.min(i, PRE_MAX)); };

// the arguments of \title, \author and \date in a preamble (2000 characters of each at most):
// the one text a preamble holds; a macro's definition there is not text until the body uses it
function titlesOf(pre) {
  let out = '';
  for (const m of stripComments(pre).matchAll(/\\(?:title|subtitle|author|date|institute)\s*(?:\[[^\]]{0,500}\]\s*)?\{/g)) {
    const from = m.index + m[0].length;
    let depth = 1, i = from;
    for (const end = Math.min(m.input.length, from + 2000); i < end && depth; i++) {
      const ch = m.input[i];
      if (ch === '\\') i++; else if (ch === '{') depth++; else if (ch === '}') depth--;
    }
    out += m.input.slice(from, i) + '\n';
    // a preamble has a handful of these; one made of thousands is not read on
    if (out.length > 20000) break;
  }
  return out;
}

function count(text) {
  const out = { chinese: 0, arabic: 0, letters: 0 };
  for (const ch of proseOf(text)) {
    if (HAN.test(ch)) { out.chinese++; out.letters++; } else if (ARABIC.test(ch)) { if (LETTER.test(ch)) { out.arabic++; out.letters++; } } else if (INDIC_ANY.test(ch)) {
      // (a script of India is a key of its own only when the text has it)
      const x = BY_CHAR.find((y) => y[2].test(ch));
      // vowel signs and viramas count with the letters: they are most of what such text is made of
      // (digits alone are no text of the script, as before)
      if (x && /[\p{L}\p{M}]/u.test(ch)) { out[x[0]] = (out[x[0]] || 0) + 1; out.letters++; }
    } else if (LETTER.test(ch)) out.letters++;
  }
  return out;
}

// How many letters of each script a text has: {chinese, arabic, letters}. A text with no
// character of either script is not read: all three are 0 then.
export function scriptsIn(text) {
  if (!EITHER.test(text)) return { chinese: 0, arabic: 0, letters: 0 };
  return count(text);
}

// A command's optional [..] and its {..} are read so that no stretch of the preamble is gone over
// twice: the space before the brace is the bracket's when there is one, and an argument is 2000
// characters at most. The preamble may be a stranger's (a link, a .zip): one made of 100 000
// spaces after \usepackage, or of brackets never closed, held the page for minutes at every key.
// (The last preamble's packages are kept: the three functions below ask for the same ones.)
let pkgsOf = ['', new Map()];
const packagesOf = (pre) => {
  if (pkgsOf[0] === pre) return pkgsOf[1];
  const pkgs = new Map();
  pkgsOf = [pre, pkgs];
  for (const m of pre.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]{0,2000})\]\s*)?\{([^}]{0,2000})\}/g)) for (const x of m[2].split(',')) pkgs.set(x.trim(), m[1] || '');
  return pkgs;
};
const classOf = (pre) => { const m = /\\documentclass\s*(?:\[([^\]]{0,2000})\]\s*)?\{([^}]{0,2000})\}/.exec(pre); return m ? { name: m[2].trim(), options: m[1] || '' } : { name: '', options: '' }; };
const options = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export const RTL_LANGUAGES = /^(arabic|farsi|persian|hebrew|urdu|kurdish|sorani|pashto|syriac|uyghur|sindhi|arabic-[a-z]+)$/;
// True for a babel or polyglossia language name whose text runs right to left.
export const rtlLanguage = (name) => RTL_LANGUAGES.test(String(name || '').trim().toLowerCase());

// Which scripts the preamble of a main file already sets up: {chinese, arabic}.
export function scriptSetup(tex) {
  const pre = stripComments(preambleOf(tex));
  const pkgs = packagesOf(pre);
  const cls = classOf(pre);
  const has = (...names) => names.some((n) => pkgs.has(n));
  const babel = options((pkgs.get('babel') || '') + ',' + cls.options);
  const provided = [...pre.matchAll(/\\babelprovide\s*(?:\[[^\]]{0,2000}\]\s*)?\{([^}]{0,2000})\}/g)].map((m) => m[1].trim());
  const poly = [...pre.matchAll(/\\set(?:main|default|other)languages?\s*(?:\[[^\]]{0,2000}\]\s*)?\{([^}]{0,2000})\}/g)].flatMap((m) => options(m[1]));
  return {
    chinese: /^(ctex|ctexart|ctexrep|ctexbook|ctexbeamer|ltjs?(article|report|book)|u?jl?(article|report|book)|elegant(paper|book|note))/i.test(cls.name) ||
      has('ctex', 'xeCJK', 'CJK', 'CJKutf8', 'luatexja', 'luatexja-fontspec', 'luatexja-preset', 'zxjatype', 'xeCJKfntef', 'kotex', 'xetexko') ||
      provided.some((l) => /^chinese/.test(l)) || babel.some((l) => /^chinese/.test(l)),
    arabic: has('arabtex', 'arabxetex', 'arabi', 'arabluatex', 'bidi', 'xepersian', 'luabidi') || /^(xepersian|arabic)/i.test(cls.name) ||
      [...provided, ...babel, ...poly].some((l) => ARABIC_LANGUAGES.test(l)),
    // India's scripts, a key each when set up: a language written in the script, however loaded
    ...Object.fromEntries(BY_CHAR.map((x) => [x[0], [...provided, ...babel, ...poly].some((l) => x[6].test(l)) || (x[0] === 'devanagari' && has('devanagari', 'devnag'))]).filter((e) => e[1]))
  };
}

// The scripts a project's text is in that its main file does not set up: [] or some of
// 'chinese', 'arabic'. texts: every .tex file of the project, the main one included.
export function scriptNeeds(mainTex, texts) {
  const list = texts && texts.length ? texts : [mainTex];
  const out = [];
  out.arabicMain = false;
  out.hebrewMain = false;
  // no character of either script in any file: nothing to count, and no preamble to read
  if (!list.some((t) => EITHER.test(t))) return out;
  const n = { chinese: 0, arabic: 0, letters: 0 };
  for (const t of list) {
    const c = count(t === mainTex ? bodyOf(t) : t);
    n.chinese += c.chinese; n.arabic += c.arabic; n.letters += c.letters;
    for (const x of BY_CHAR) if (c[x[0]]) n[x[0]] = (n[x[0]] || 0) + c[x[0]];
  }
  // a title or an author's name stands in the preamble: text as well, though not weighed below
  const head = count(titlesOf(preambleOf(mainTex)));
  const have = scriptSetup(mainTex);
  if ((n.chinese || head.chinese) && !have.chinese) out.push('chinese');
  if ((n.arabic || head.arabic) && !have.arabic) out.push('arabic');
  // Japanese and Korean: a document that has a set up for Chinese characters of any kind (ctex,
  // xeCJK, luatexja, kotex) has theirs. Chinese characters beside kana are Japanese text, set
  // in the Japanese font and not asked for again as Chinese; beside hangul they stay a need of
  // their own, because a Korean font has few thousand of them (plan takes them from Korean).
  for (const x of BY_CHAR) if ((n[x[0]] || head[x[0]]) && !have[x[0]] && !((x[0] === 'japanese' || x[0] === 'korean') && have.chinese)) out.push(x[0]);
  if ((out.includes('japanese') || have.japanese) && out[0] === 'chinese') out.shift();
  // a document mostly in Arabic is an Arabic document: its paragraphs run from the right
  out.arabicMain = n.arabic > n.letters / 2;
  out.hebrewMain = (n.hebrew || 0) > n.letters / 2;
  return out;
}

// True when the document as a whole runs right to left: its main language is one that does.
export function rtlDocument(tex) {
  const pre = stripComments(preambleOf(tex));
  const pkgs = packagesOf(pre);
  const cls = classOf(pre);
  if (/\\setmainlanguage\s*(?:\[[^\]]{0,2000}\]\s*)?\{\s*([a-z-]+)/.test(pre)) return RTL_LANGUAGES.test(RegExp.$1);
  for (const m of pre.matchAll(/\\babelprovide\s*\[([^\]]{0,2000})\]\s*\{([^}]{0,2000})\}/g)) if (options(m[1]).includes('main')) return RTL_LANGUAGES.test(m[2].trim());
  if (pkgs.has('babel')) {
    // babel's main language: main=..., else the last language named (class options count first)
    const all = [...options(cls.options), ...options(pkgs.get('babel'))];
    const main = all.map((o) => /^main\s*=\s*(.+)$/.exec(o)).filter(Boolean).pop();
    if (main) return RTL_LANGUAGES.test(main[1].trim());
    const langs = all.filter((o) => !o.includes('=') && /^[a-z-]+$/.test(o) && !/^(a4paper|letterpaper|twoside|oneside|twocolumn|onecolumn|draft|final|titlepage|notitlepage|landscape|fleqn|leqno|\d+pt|shorthands|activeacute|activegrave|noconfigs|showlanguages|silent|strings|base|nocase|headfoot)$/.test(o));
    if (langs.length) return RTL_LANGUAGES.test(langs[langs.length - 1]);
  }
  return pkgs.has('xepersian') || /^xepersian/i.test(cls.name);
}

// The line Rikuy writes for Chinese alone. When Arabic joins it the document moves to LuaLaTeX,
// where ctex would need luatexja: the line goes and babel sets the Chinese too.
const OWN_CTEX = /^[ \t]*\\usepackage\[scheme=plain\]\{ctex\}[^\n]*\n?/m;
// Packages that hold a document to one engine. The Arabic lines are LuaLaTeX's (bidi=basic) and
// ctex's line is XeLaTeX's: beside a package of another engine they would break a document that
// compiles, so nothing is offered there and the document's author sets the script up.
const XE_ONLY = ['xeCJK', 'polyglossia', 'xltxtra', 'xunicode', 'mathspec', 'xepersian', 'bidi', 'arabxetex', 'pstricks', 'pst-all', 'zxjatype', 'xetexko', 'CJK', 'CJKutf8', 'kotex'];
const LUA_ONLY = ['luacode', 'luatexja', 'luatexja-fontspec', 'luatexja-preset', 'luatextra', 'luamplib', 'luabidi', 'arabluatex', 'lua-ul', 'luacolor', 'lualatex-math'];
const PDF_ARABIC = ['arabtex', 'arabi'];
const CJK_CLASS = /^(ctex|ctexart|ctexrep|ctexbook|ctexbeamer|ltjs?(article|report|book)|u?jl?(article|report|book)|elegant(paper|book|note))/i;

// What to add for `needs`: {lines, dropCtex}, or null when the preamble leaves no sound way.
function plan(needs, tex) {
  const pre = stripComments(preambleOf(tex || ''));
  const pkgs = packagesOf(pre);
  const cls = classOf(pre);
  const has = (names) => names.some((n) => pkgs.has(n));
  const ownCtex = OWN_CTEX.test(pre);
  const babel = pkgs.get('babel') || '';
  const lines = [];
  // A font for each of the three families: with one for rm alone, text in \textsf, in \texttt
  // and on every beamer slide (sans serif throughout) had no glyph and was gone from the PDF.
  const fonts = (lang, opt, rm, sf, tt) => [['rm', rm], ['sf', sf || rm], ['tt', tt || rm]].map((f) => '\\babelfont' + (lang ? '[' + lang + ']' : '') + '{' + f[0] + '}' + opt + '{' + f[1] + '}');
  // Each Chinese, Japanese or Korean font is some megabytes that LuaTeX holds whole: with a
  // Mincho and a Gothic beside a Myeongjo and a Gothic the engine ran out of memory in the
  // browser and stopped with no message. Where two of the three meet, each keeps to its serif.
  const square = ['chinese', 'japanese', 'korean'];
  const crowded = square.filter((k) => needs.includes(k) || new RegExp('\\\\babelprovide\\s*(?:\\[[^\\]]{0,2000}\\]\\s*)?\\{' + k + '\\}').test(pre)).length > 1;
  const chinese = () => lines.push('\\babelprovide[import, onchar=ids fonts]{chinese}', ...(crowded ? fonts('chinese', '', 'FandolSong') : fonts('chinese', '', 'FandolSong', 'FandolHei', 'FandolFang')));
  // a line at the head of the file that names the engine (% !TeX program = ...) holds the
  // document to it: the lines of another engine would then print nothing, or their own source
  const magic = ((/^[^\n]{0,200}!TeX\s+(?:TS-)?program\s*=\s*([A-Za-z]+)/m.exec((tex || '').slice(0, 2000)) || [])[1] || '').toLowerCase();
  const indic = BY_CHAR.filter((x) => needs.includes(x[0]));
  const rtl = needs.includes('arabic') || needs.includes('hebrew');
  if (needs.includes('arabic') || indic.length) {
    if (has(XE_ONLY) || CJK_CLASS.test(cls.name) || (pkgs.has('ctex') && !ownCtex) || (magic && !magic.includes('lua'))) return null;
    if (rtl && !pkgs.has('babel')) lines.push('\\usepackage[english, bidi=basic]{babel} % LuaLaTeX orders right to left text by itself');
    if (needs.includes('arabic')) {
      lines.push(needs.arabicMain ? '\\babelprovide[import, main]{arabic}' : '\\babelprovide[import, onchar=ids fonts]{arabic}');
      lines.push(...fonts(needs.arabicMain ? '' : 'arabic', '[Renderer=Harfbuzz]', 'Amiri'));
    } else if (!rtl && !pkgs.has('babel')) lines.push('\\usepackage[english]{babel} % LuaLaTeX sets each script in its own font');
    // HarfBuzz shapes India's scripts (conjuncts, vowel signs that stand before their consonant)
    for (const x of indic) if (x[7]) lines.push('\\directlua{Babel.script_blocks.' + x[7] + '} % where ' + x[1] + "'s characters are: babel has no entry");
    for (const x of indic) {
      const o = crowded && square.includes(x[0]) ? { opt: '' } : x[8] || {};
      // a document mostly in Hebrew is a Hebrew document, as with Arabic
      const main = o.rtl && needs.hebrewMain && !needs.arabicMain;
      lines.push('\\babelprovide[import=' + x[4] + (main ? ', main' : ', onchar=ids fonts') + ']{' + x[3] + '}', ...fonts(main ? '' : x[3], o.opt === undefined ? '[Renderer=Harfbuzz]' : o.opt, x[5], o.sf, o.tt));
      // a list's bullet is text in the document's own font, and the Hebrew one has none
      if (main) lines.push('\\renewcommand{\\labelitemi}{$\\bullet$} % the Hebrew font has no bullet of its own');
      if (x[0] === 'korean' || (x[0] === 'japanese' && /\\babelprovide\s*(?:\[[^\]]{0,2000}\]\s*)?\{korean\}/.test(pre))) {
        // babel counts Chinese characters as Korean's and as Japanese's and Chinese's alike, and
        // which of them gets one is then chance: in a document with Japanese they came out in
        // the Korean font, as empty boxes. Korean keeps its hangul; beside Japanese it gives up
        // the shared punctuation too. After \babelprovide{korean}, which makes the table anew; the
        // loop counts down from a fixed number because # is TeX's own character in a preamble.
        const ja = needs.includes('japanese') || /\\babelprovide\s*(?:\[[^\]]{0,2000}\]\s*)?\{japanese\}/.test(pre);
        const line = '\\directlua{local k = Babel.script_blocks.Kore for i = 12, 1, -1 do if k[i] and (k[i][1] == 0x4E00' + (ja ? ' or k[i][1] == 0x3000 or k[i][1] == 0xFF00' : '') + ') then table.remove(k, i) end end} % Chinese characters are not Korean\'s to set';
        if (!pre.includes(line) && !lines.includes(line)) lines.push(line);
      }
    }
    // the danda and the joiners are in no script's range (the danda in Devanagari's alone): each
    // would fall back to the Latin font, the danda missing and the conjunct around a joiner
    // broken in two. -2000 is babel's own mark for "as the character before", as for accents.
    if (indic.some((x) => !x[8] || x[8].joiners) && !pre.includes('Babel.chr_to_loc')) lines.push('\\directlua{for _, c in ipairs({0x964, 0x965, 0x200C, 0x200D}) do Babel.chr_to_loc[c] = -2000 end} % a danda or a joiner belongs to the script before it');
    if (needs.includes('chinese') || ownCtex) chinese();
    return { lines, dropCtex: ownCtex };
  }
  if (needs.includes('chinese')) {
    // a document already on babel's LuaLaTeX route takes its Chinese from babel as well
    if (/\bbidi\s*=\s*basic/.test(babel) || /\\babelprovide\s*\[[^\]]{0,2000}\bonchar\s*=/.test(pre)) chinese();
    else if (has(LUA_ONLY) || has(PDF_ARABIC) || /\\directlua\b/.test(pre) || (magic && !magic.includes('xe')) || options(babel + ',' + cls.options).some((o) => RTL_LANGUAGES.test(o))) return null;
    else lines.push('\\usepackage[scheme=plain]{ctex} % Chinese text, set with XeLaTeX');
  }
  return { lines, dropCtex: false };
}

// The preamble lines for the scripts in `needs` (scriptNeeds' result): [] when there is nothing
// to add, or when the preamble holds the document to an engine the lines would not run on.
export function scriptLines(needs, tex) {
  const p = plan(needs, tex);
  return p ? p.lines : [];
}

// What wraps a stretch of text that runs the other way than the document: [begin, end]. The
// languages are the two scriptLines' babel line knows, english and arabic (or lang: hebrew, where
// the stretch is Hebrew's); the environment sets
// the paragraphs' direction as well as the text's (\foreignlanguage would set only the text's).
export const otherDirection = (rtl, lang) => ['\\begin{otherlanguage}{' + (rtl ? lang || 'arabic' : 'english') + '}', '\\end{otherlanguage}'];

// The main file with those lines in its preamble, or null when it has none to put them in or
// they would not fit it (scriptLines). An existing \usepackage{babel} gains bidi=basic instead of
// being loaded twice; Rikuy's own ctex line makes way for babel's Chinese when Arabic joins it.
export function addScriptSetup(tex, needs) {
  const at = docStart(tex);
  if (at < 0 || !needs.length) return null;
  const p = plan(needs, tex);
  if (!p || !p.lines.length) return null;
  const eol = tex.includes('\r\n') ? '\r\n' : '\n';
  let pre = tex.slice(0, at);
  if (p.dropCtex) pre = pre.replace(OWN_CTEX, '');
  if ((needs.includes('arabic') || needs.includes('hebrew')) && !p.lines.some((l) => l.includes('{babel}'))) {
    // babel is loaded already: find where, in the part of the preamble that is read at all and
    // outside comments, whatever lines its options run over
    const head = pre.slice(0, PRE_MAX);
    let found = null;
    for (const m of head.matchAll(/\\(usepackage|RequirePackage)\s*(?:\[([^\]]{0,2000})\]\s*)?\{([^}]{0,2000})\}/g)) {
      if (commented(head, m.index)) continue;
      const names = m[3].split(',').map((x) => x.trim());
      if (!names.includes('babel')) continue;
      // options shared with other packages are not Rikuy's to take apart
      if (names.length > 1) return null;
      found = m;
      break;
    }
    if (!found) return null;
    if (!/\bbidi\s*=/.test(found[2] || '')) {
      const opt = (found[2] || '').replace(/[\s,]+$/, '');
      pre = pre.slice(0, found.index) + '\\' + found[1] + '[' + (opt.trim() ? opt + ', ' : '') + 'bidi=basic]{babel}' + pre.slice(found.index + found[0].length);
    }
  }
  const block = p.lines.join(eol) + eol;
  // (the spaces before \begin{document} go; counted from the end, not looked for by a pattern
  // that would try every run of spaces in the preamble)
  let end = pre.length;
  while (end > 0 && (pre[end - 1] === ' ' || pre[end - 1] === '\t')) end--;
  return pre.slice(0, end) + (pre.endsWith('\n') || !pre ? '' : eol) + block + tex.slice(at);
}

// Languages babel and polyglossia set left to right, by the names documents give them. Not all
// of them: a name the page does not know leaves the direction as it was.
const LTR_LANGUAGES = /^(english|american|british|usenglish|ukenglish|canadian|australian|french|francais|canadien|acadian|german|ngerman|austrian|naustrian|swissgerman|nswissgerman|spanish|catalan|galician|basque|portuguese|portuges|brazilian|brazil|italian|latin|romanian|dutch|afrikaans|danish|swedish|norsk|nynorsk|norwegian|icelandic|finnish|estonian|latvian|lithuanian|polish|czech|slovak|slovene|slovenian|croatian|serbian|bulgarian|macedonian|russian|ukrainian|belarusian|greek|polutonikogreek|turkish|hungarian|magyar|albanian|irish|welsh|breton|esperanto|interlingua|indonesian|bahasa|malay|vietnamese|thai|hindi|marathi|nepali|konkani|bengali|bangla|assamese|punjabi|panjabi|gujarati|odia|oriya|tamil|telugu|kannada|malayalam|sinhala|sanskrit|armenian|georgian|mongolian|chinese|japanese|korean|chinese-[a-z-]+|english-[a-z-]+)$/;

// The direction text in that language runs: 'rtl', 'ltr', or null for a name not known here.
// The page takes it for \foreignlanguage, \selectlanguage, otherlanguage and polyglossia's own
// commands and environments (model.js).
export function languageDir(name) {
  const n = String(name || '').trim().toLowerCase();
  return RTL_LANGUAGES.test(n) ? 'rtl' : LTR_LANGUAGES.test(n) ? 'ltr' : null;
}
