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

const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, '$1');
// what the reader sees of a body: commands' names, environments' names and math are not text
const proseOf = (t) => stripComments(t).replace(/\\(begin|end)\s*\{[^}]*\}/g, ' ').replace(/\\[A-Za-z@]+\*?/g, ' ').replace(/\$\$[^$]*\$\$|\$[^$\n]*\$/g, ' ');
const bodyOf = (tex) => { const i = tex.indexOf('\\begin{document}'); return i < 0 ? tex : tex.slice(i + 16); };
const preambleOf = (tex) => { const i = tex.indexOf('\\begin{document}'); return i < 0 ? '' : tex.slice(0, i); };

// How many letters of each script a text has: {chinese, arabic, letters}.
export function scriptsIn(text) {
  const out = { chinese: 0, arabic: 0, letters: 0 };
  for (const ch of proseOf(text)) {
    if (HAN.test(ch)) { out.chinese++; out.letters++; } else if (ARABIC.test(ch)) { if (LETTER.test(ch)) { out.arabic++; out.letters++; } } else if (LETTER.test(ch)) out.letters++;
  }
  return out;
}

const packagesOf = (pre) => {
  const pkgs = new Map();
  for (const m of pre.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) for (const x of m[2].split(',')) pkgs.set(x.trim(), m[1] || '');
  return pkgs;
};
const classOf = (pre) => { const m = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/.exec(pre); return m ? { name: m[2].trim(), options: m[1] || '' } : { name: '', options: '' }; };
const options = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

const RTL_LANGUAGES = /^(arabic|farsi|persian|hebrew|urdu|kurdish|sorani|pashto|syriac|uyghur|sindhi|arabic-[a-z]+)$/;

// Which scripts the preamble of a main file already sets up: {chinese, arabic}.
export function scriptSetup(tex) {
  const pre = stripComments(preambleOf(tex));
  const pkgs = packagesOf(pre);
  const cls = classOf(pre);
  const has = (...names) => names.some((n) => pkgs.has(n));
  const babel = options((pkgs.get('babel') || '') + ',' + cls.options);
  const provided = [...pre.matchAll(/\\babelprovide\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
  const poly = [...pre.matchAll(/\\set(?:main|default|other)languages?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].flatMap((m) => options(m[1]));
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
  const n = { chinese: 0, arabic: 0, letters: 0 };
  for (const t of texts && texts.length ? texts : [mainTex]) {
    const c = scriptsIn(t === mainTex ? bodyOf(t) : t);
    n.chinese += c.chinese; n.arabic += c.arabic; n.letters += c.letters;
  }
  const have = scriptSetup(mainTex);
  const out = [];
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
  if (/\\setmainlanguage\s*(?:\[[^\]]*\])?\s*\{\s*([a-z-]+)/.test(pre)) return RTL_LANGUAGES.test(RegExp.$1);
  for (const m of pre.matchAll(/\\babelprovide\s*\[([^\]]*)\]\s*\{([^}]*)\}/g)) if (options(m[1]).includes('main')) return RTL_LANGUAGES.test(m[2].trim());
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
    pre = pre.split('\n').map((line) => {
      const code = line.replace(/(^|[^\\])%.*$/, '$1');
      const m = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{babel\}/.exec(code);
      if (!m || /\bbidi\s*=/.test(m[1] || '')) return line;
      const opt = (m[1] || '').trim().replace(/,\s*$/, '');
      return line.slice(0, m.index) + '\\usepackage[' + (opt ? opt + ', ' : '') + 'bidi=basic]{babel}' + line.slice(m.index + m[0].length);
    }).join('\n');
  }
  const block = lines.join('\n') + '\n';
  return pre.replace(/[ \t]*$/, '') + (pre.endsWith('\n') || !pre ? '' : '\n') + block + tex.slice(at);
}
