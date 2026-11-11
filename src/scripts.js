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
// a character of either script, anywhere: most documents have none and are then not read at all
const EITHER = new RegExp(HAN.source + '|' + ARABIC.source);
// A preamble is read up to here. No real one is longer, and a stranger's document (a link, a
// .zip) is read on the page at every key: with the bounds on each argument below, even one made
// to be slow (a megabyte of "\usepackage[" never closed) takes a moment, not minutes.
const PRE_MAX = 200000;

const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, '$1');
// what the reader sees of a body: commands' names, environments' names and math are not text
const proseOf = (t) => stripComments(t).replace(/\\(begin|end)\s*\{[^}]{0,200}\}/g, ' ').replace(/\\[A-Za-z@]+\*?/g, ' ').replace(/\$\$[^$]*\$\$|\$[^$\n]*\$/g, ' ');
const bodyOf = (tex) => { const i = tex.indexOf('\\begin{document}'); return i < 0 ? tex : tex.slice(i + 16); };
const preambleOf = (tex) => { const i = tex.indexOf('\\begin{document}'); return i < 0 ? '' : tex.slice(0, Math.min(i, PRE_MAX)); };

function count(text) {
  const out = { chinese: 0, arabic: 0, letters: 0 };
  for (const ch of proseOf(text)) {
    if (HAN.test(ch)) { out.chinese++; out.letters++; } else if (ARABIC.test(ch)) { if (LETTER.test(ch)) { out.arabic++; out.letters++; } } else if (LETTER.test(ch)) out.letters++;
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
      provided.some((l) => /^(chinese|japanese|korean)/.test(l)) || babel.some((l) => /^chinese/.test(l)),
    arabic: has('arabtex', 'arabxetex', 'arabi', 'arabluatex', 'bidi', 'xepersian', 'luabidi') || /^(xepersian|arabic)/i.test(cls.name) ||
      provided.some((l) => RTL_LANGUAGES.test(l)) || babel.some((l) => RTL_LANGUAGES.test(l) || /^bidi\s*=/.test(l)) || poly.some((l) => RTL_LANGUAGES.test(l))
  };
}

// The scripts a project's text is in that its main file does not set up: [] or some of
// 'chinese', 'arabic'. texts: every .tex file of the project, the main one included.
export function scriptNeeds(mainTex, texts) {
  const list = texts && texts.length ? texts : [mainTex];
  const out = [];
  out.arabicMain = false;
  // no character of either script in any file: nothing to count, and no preamble to read
  if (!list.some((t) => EITHER.test(t))) return out;
  const n = { chinese: 0, arabic: 0, letters: 0 };
  for (const t of list) {
    const c = count(t === mainTex ? bodyOf(t) : t);
    n.chinese += c.chinese; n.arabic += c.arabic; n.letters += c.letters;
  }
  const have = scriptSetup(mainTex);
  if (n.chinese && !have.chinese) out.push('chinese');
  if (n.arabic && !have.arabic) out.push('arabic');
  // a document mostly in Arabic is an Arabic document: its paragraphs run from the right
  out.arabicMain = n.arabic > n.letters / 2;
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

// The preamble lines for the scripts in `needs` (scriptNeeds' result), as one block.
export function scriptLines(needs, tex) {
  const pre = stripComments(preambleOf(tex || ''));
  const pkgs = packagesOf(pre);
  const lines = [];
  if (needs.includes('arabic') || (needs.includes('chinese') && (/\bbidi\s*=/.test(pkgs.get('babel') || '') || /\\babelfont\b/.test(pre)))) {
    if (!pkgs.has('babel')) lines.push('\\usepackage[english, bidi=basic]{babel} % LuaLaTeX orders right to left text by itself');
    if (needs.includes('arabic')) {
      lines.push(needs.arabicMain ? '\\babelprovide[import, main]{arabic}' : '\\babelprovide[import, onchar=ids fonts]{arabic}');
      lines.push((needs.arabicMain ? '\\babelfont{rm}' : '\\babelfont[arabic]{rm}') + '[Renderer=Harfbuzz]{Amiri}');
    }
    if (needs.includes('chinese')) {
      lines.push('\\babelprovide[import, onchar=ids fonts]{chinese}');
      lines.push('\\babelfont[chinese]{rm}{FandolSong}');
    }
  } else if (needs.includes('chinese')) {
    lines.push('\\usepackage[scheme=plain]{ctex} % Chinese text, set with XeLaTeX');
  }
  return lines;
}

// The main file with those lines in its preamble, or null when it has none to put them in.
// An existing \usepackage{babel} gains bidi=basic instead of being loaded twice.
export function addScriptSetup(tex, needs) {
  const at = tex.indexOf('\\begin{document}');
  if (at < 0 || !needs.length) return null;
  const lines = scriptLines(needs, tex);
  if (!lines.length) return null;
  let pre = tex.slice(0, at);
  if (lines.some((l) => l.startsWith('\\babelprovide'))) {
    // (babel is looked for in the lines of the part of the preamble that is read at all)
    const cut = pre.length > PRE_MAX ? pre.lastIndexOf('\n', PRE_MAX) + 1 : pre.length;
    pre = pre.slice(0, cut).split('\n').map((line) => {
      const code = line.replace(/(^|[^\\])%.*$/, '$1');
      const m = /\\usepackage\s*(?:\[([^\]]{0,2000})\]\s*)?\{babel\}/.exec(code);
      if (!m || /\bbidi\s*=/.test(m[1] || '')) return line;
      const opt = (m[1] || '').trim().replace(/,\s*$/, '');
      return line.slice(0, m.index) + '\\usepackage[' + (opt ? opt + ', ' : '') + 'bidi=basic]{babel}' + line.slice(m.index + m[0].length);
    }).join('\n') + pre.slice(cut);
  }
  const block = lines.join('\n') + '\n';
  // (the spaces before \begin{document} go; counted from the end, not looked for by a pattern
  // that would try every run of spaces in the preamble)
  let end = pre.length;
  while (end > 0 && (pre[end - 1] === ' ' || pre[end - 1] === '\t')) end--;
  return pre.slice(0, end) + (pre.endsWith('\n') || !pre ? '' : '\n') + block + tex.slice(at);
}

// Languages babel and polyglossia set left to right, by the names documents give them. Not all
// of them: a name the page does not know leaves the direction as it was.
const LTR_LANGUAGES = /^(english|american|british|usenglish|ukenglish|canadian|australian|french|francais|canadien|acadian|german|ngerman|austrian|naustrian|swissgerman|nswissgerman|spanish|catalan|galician|basque|portuguese|portuges|brazilian|brazil|italian|latin|romanian|dutch|afrikaans|danish|swedish|norsk|nynorsk|norwegian|icelandic|finnish|estonian|latvian|lithuanian|polish|czech|slovak|slovene|slovenian|croatian|serbian|bulgarian|macedonian|russian|ukrainian|belarusian|greek|polutonikogreek|turkish|hungarian|magyar|albanian|irish|welsh|breton|esperanto|interlingua|indonesian|bahasa|malay|vietnamese|thai|hindi|bengali|tamil|sanskrit|armenian|georgian|mongolian|chinese|japanese|korean|chinese-[a-z-]+|english-[a-z-]+)$/;

// The direction text in that language runs: 'rtl', 'ltr', or null for a name not known here.
// The page takes it for \foreignlanguage, \selectlanguage, otherlanguage and polyglossia's own
// commands and environments (model.js).
export function languageDir(name) {
  const n = String(name || '').trim().toLowerCase();
  return RTL_LANGUAGES.test(n) ? 'rtl' : LTR_LANGUAGES.test(n) ? 'ltr' : null;
}
