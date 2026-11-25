// Spelling's pure parts (src/spell/words.js) and Hunspell itself (tex/vendor/hunspell/) under node:
// which words of a page are prose and which are LaTeX, Word's rules for words not checked, the
// document's language and the languages of its parts, the document's word list and its edits,
// and Hunspell's answers in the four dictionaries. With CORPUS_DIR naming a LaTeX-examples
// clone, every document of the corpus: no word checked lies in a command's name, a label, a
// reference or a citation key, math, verbatim, a URL, a file name or a comment.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { buildModel } from '../src/model.js';
import { parse, CHARS, ACCENTS } from '../src/parser.js';
import { SAMPLE } from '../src/sample.js';
import { wordsIn, mainLanguage, dictOf, languageSpans, langAt, listedWords, addWordEdit, removeWordEdits, spellPlan, occSource, proseRuns, asked } from '../src/spell/words.js';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
let groups = 0;
const group = (name, fn) => { fn(); groups++; };
const ws = (t) => wordsIn(t).map((x) => x.w);
const model = (tex, extra = {}) => { const files = new Map([['main.tex', tex], ...Object.entries(extra)]); return { M: buildModel({ files, main: 'main.tex' }), files }; };
const doc = (body, pre = '') => '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
const planOf = (tex, extra) => { const { M, files } = model(tex, extra); return spellPlan(M, { files, main: 'main.tex' }); };
const asked_ = (P) => new Set([...P.words.values()].flatMap((s) => [...s]));

group('words: Word\'s rules for what is no word', () => {
  assert.deepStrictEqual(ws('The cat sat.'), ['The', 'cat', 'sat']);
  assert.deepStrictEqual(ws("don't well-known co‐op"), ["don't", 'well-known', 'co‐op']);
  assert.deepStrictEqual(ws('NASA and PDE are capitals'), ['and', 'are', 'capitals']);
  assert.deepStrictEqual(ws('x2 3D a4paper abc'), ['abc']);
  assert.deepStrictEqual(ws('see main.tex, www.example.org, https://x.y/zz and a@b.cd or a_b'), ['see', 'and', 'or']);
  assert.deepStrictEqual(ws('a I x'), []);
  assert.strictEqual(asked('it’s'), "it's");
  assert.strictEqual(ws('x'.repeat(70) + ' ok').join(), 'ok');
  // a stranger's run of closing marks: linear, not squared (it took a second for 20,000 before)
  const t0 = performance.now();
  assert.deepStrictEqual(ws(')'.repeat(200000) + 'a b' + '('.repeat(200000) + ' ok'), ['ok']);
  assert.ok(performance.now() - t0 < 500, 'wordsIn on 400,000 marks took ' + (performance.now() - t0) + ' ms');
});

group('language: babel, polyglossia, the class options', () => {
  const ml = (pre, cls = '') => { const m = mainLanguage('\\documentclass' + cls + '{article}\n' + pre + '\\begin{document}\nx\n\\end{document}'); return dictOf(m.name, m.variant); };
  assert.strictEqual(ml(''), '');
  assert.strictEqual(ml('\\usepackage[ngerman]{babel}\n'), 'de_DE');
  assert.strictEqual(ml('\\usepackage[ngerman,english]{babel}\n'), 'en_US');
  assert.strictEqual(ml('\\usepackage[english,main=spanish]{babel}\n'), 'es_ES');
  assert.strictEqual(ml('\\usepackage{babel}\n', '[a4paper,british]'), 'en_GB');
  assert.strictEqual(ml('% \\usepackage[ngerman]{babel}\n'), '');
  assert.strictEqual(ml('\\usepackage{polyglossia}\n\\setdefaultlanguage[variant=british]{english}\n'), 'en_GB');
  assert.strictEqual(ml('\\usepackage{polyglossia}\n\\setmainlanguage{german}\n'), 'de_DE');
  assert.strictEqual(ml('\\usepackage[french]{babel}\n'), null);
  assert.strictEqual(dictOf('en-GB'), 'en_GB');
  assert.strictEqual(dictOf('austrian'), 'de_DE');
});

group('language spans: \\selectlanguage to its group\'s end, otherlanguage, \\foreignlanguage, polyglossia', () => {
  const t = 'A {\\selectlanguage{ngerman} Haus} B \\foreignlanguage{spanish}{casa} C \\begin{otherlanguage}{british}colour\\end{otherlanguage} D \\textgerman{Hund} E\n\\selectlanguage{spanish}\nfin';
  const sp = languageSpans(t);
  const at = (w) => langAt(sp, t.indexOf(w));
  assert.strictEqual(at('Haus'), 'ngerman');
  assert.strictEqual(at('B '), '');
  assert.strictEqual(at('casa'), 'spanish');
  assert.strictEqual(at('colour'), 'british');
  assert.strictEqual(at('Hund'), 'german');
  assert.strictEqual(at('E\n'), '');
  assert.strictEqual(at('fin'), 'spanish');
  assert.deepStrictEqual(languageSpans('no switch here'), []);
  // the plan asks each word of its dictionary; a language without one is not checked
  const P = planOf(doc('Ein {\\selectlanguage{ngerman}Haus} and \\foreignlanguage{french}{maison} here.'));
  assert.ok(P.words.get('de_DE').has('Haus') && !P.words.get('en_US').has('Haus'));
  assert.ok(!asked_(P).has('maison') && P.skipped.get('french') === 1);
});

group('the plan: prose only, never LaTeX', () => {
  const P = planOf(doc('Some \\textbf{bold} text, \\emph{emph} and $\\alpha xyzzy$ math \\label{sec:keyword} \\ref{fig:refkey} \\cite{citekey2020} '
    + '\\texttt{codeword} \\url{https://example.com/urlword} \\verb|verbword| \\href{https://h.org/hrefword}{linktext} \\footnote{notetext}.\n'
    + '\\begin{verbatim}\nverbatimword\n\\end{verbatim}\n% commentword\n\\includegraphics{figurefile}\n\\begin{tabular}{ll}cellone & celltwo\\\\\\end{tabular}', '\\usepackage{graphicx,hyperref}\n'));
  const A = asked_(P);
  for (const w of ['Some', 'bold', 'text', 'emph', 'math', 'linktext', 'notetext', 'cellone', 'celltwo']) assert.ok(A.has(w), w);
  for (const w of ['textbf', 'alpha', 'xyzzy', 'keyword', 'sec', 'refkey', 'fig', 'citekey', 'codeword', 'urlword', 'verbword', 'hrefword', 'verbatimword', 'commentword', 'figurefile', 'tabular', 'll', 'includegraphics']) assert.ok(!A.has(w), w);
  // code the page shows as text: a drawing program's environment, an unknown command's key=value list
  const C = asked_(planOf(doc('Prose here.\n\\begin{asy}\nimport graphthree;\nreal xfun(real t) {return cosine;}\n\\end{asy}\n\\psSolid[objectname=cylindre,hval=1] after.')));
  assert.ok(C.has('Prose') && C.has('after') && !C.has('import') && !C.has('graphthree') && !C.has('cosine') && !C.has('cylindre') && !C.has('objectname'), [...C].join(' '));
  // (task 48's review) \\- is no break in a word; circuitikz, tcblisting, Sweave and \\iffalse are code
  const H = planOf(doc('A hy\\-phen\\-ation here.'));
  assert.ok(asked_(H).has('hyphenation') && !asked_(H).has('hy'), [...asked_(H)].join(' '));
  const K = asked_(planOf(doc('Words.\n\\begin{circuitikz}\\draw (0,0) to[short, o-*] (1,0) node[right] {lbl};\\end{circuitikz}\n\\begin{tcblisting}{}\nlistingword\n\\end{tcblisting}\n\\begin{Sinput}\nsinputword\n\\end{Sinput}\n\\iffalse\nhiddenword\n\\fi\nAfter.')));
  assert.ok(K.has('Words') && K.has('After') && !K.has('short') && !K.has('right') && !K.has('listingword') && !K.has('sinputword') && !K.has('hiddenword'), [...K].join(' '));
  // a document in a language with no dictionary: its words are not asked of any (the browser's own
  // spelling takes them), counted as skipped under its name; its English parts are checked
  for (const pre of ['\\usepackage[french]{babel}\n', '\\usepackage{polyglossia}\n\\setdefaultlanguage{french}\n', '\\usepackage[english,french]{babel}\n']) {
    const F = planOf(doc('Bonjour le monde, voici un texte. \\foreignlanguage{english}{The colour.}', pre));
    assert.ok(F.dict === null && !F.words.has(null) && !F.words.has('null') && F.skipped.get('french') > 3 && (F.words.get('en_US') || new Set()).has('colour'), pre + JSON.stringify([...F.words.keys()]) + JSON.stringify([...F.skipped]));
  }
  // the sample: its source words are where the page has them
  const files = new Map(Object.entries(SAMPLE));
  const M = buildModel({ files, main: 'main.tex' });
  const S = spellPlan(M, { files, main: 'main.tex' });
  assert.ok(S.occ.length > 400);
  for (const o of S.occ) { const x = occSource(S, o); assert.ok(x, o.q); assert.strictEqual(files.get(x.f).slice(x.s, x.e).replace(/\\/g, ''), x.w.replace(/\\/g, '')); }
  // a word run across markup keeps every character's place
  const W = planOf(doc('A \\textbf{wr}ong one.'));
  const o = W.occ.find((x) => x.q === 'wrong');
  const x = occSource(W, o);
  assert.deepStrictEqual(x.parts.length, 2);
  // Word Count's runs take code and leave notes out when asked
  const R = proseRuns(model(doc('One \\texttt{two}\\footnote{three}.')).M, { code: true, notes: false }).map((r) => r.text).join('|');
  assert.ok(/two/.test(R) && !/three/.test(R), R);
});

group('the document\'s word list: read, added to, taken off, line ends kept', () => {
  const t = doc('x', '% rikuy: words Rikuy Hunspell\n% cspell:words foo, bar\n%  cSpell:ignore baz\n');
  assert.deepStrictEqual([...listedWords(t)].sort(), ['Hunspell', 'Rikuy', 'bar', 'baz', 'foo']);
  const P = planOf(doc('Rikuy and Hunspell', '% rikuy: words Rikuy Hunspell\n'));
  assert.ok(!asked_(P).has('Rikuy') && !asked_(P).has('Hunspell') && asked_(P).has('and'));
  const a = doc('x');
  const e1 = addWordEdit(a, 'Rikuy');
  const a1 = a.slice(0, e1.s) + e1.t + a.slice(e1.e);
  assert.ok(a1.includes('% rikuy: words Rikuy\n\\begin{document}'), a1);
  const e2 = addWordEdit(a1, 'Hunspell');
  const a2 = a1.slice(0, e2.s) + e2.t + a1.slice(e2.e);
  assert.ok(a2.includes('% rikuy: words Rikuy Hunspell\n\\begin{'), a2);
  const crlf = a2.replace(/\n/g, '\r\n');
  const e3 = addWordEdit(crlf, 'More');
  const a3 = crlf.slice(0, e3.s) + e3.t + crlf.slice(e3.e);
  assert.ok(a3.includes('% rikuy: words Rikuy Hunspell More\r\n'), JSON.stringify(a3));
  const long = doc('x', '% rikuy: words ' + 'abcdefgh '.repeat(10).trim() + '\n');
  const e4 = addWordEdit(long, 'New');
  assert.ok(e4.t.startsWith('\n% rikuy: words New'), JSON.stringify(e4));
  assert.strictEqual(addWordEdit(a, 'two words'), null);
  assert.strictEqual(addWordEdit(a, 'a%b'), null);
  let r = a2;
  for (const ed of removeWordEdits(r, 'Rikuy').reverse()) r = r.slice(0, ed.s) + ed.t + r.slice(ed.e);
  assert.ok(r.includes('% rikuy: words Hunspell\n'), r);
  for (const ed of removeWordEdits(r, 'Hunspell').reverse()) r = r.slice(0, ed.s) + ed.t + r.slice(ed.e);
  assert.strictEqual(r, a);
});

// ---- Hunspell, the committed module and dictionaries ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rikuy-spell-'));
fs.copyFileSync(path.join(ROOT, 'tex/vendor/hunspell/hunspell.js'), path.join(tmp, 'hunspell.cjs'));
const require = createRequire(import.meta.url);
const H = await require(path.join(tmp, 'hunspell.cjs'))({ wasmBinary: fs.readFileSync(path.join(ROOT, 'tex/vendor/hunspell/hunspell.wasm')), print: () => {}, printErr: () => {} });
const cs = (s) => { const n = H.lengthBytesUTF8(s) + 1, p = H._malloc(n); H.stringToUTF8(s, p, n); return p; };
const openDict = (name) => {
  for (const e of ['aff', 'dic']) H.FS.writeFile('/' + name + '.' + e, fs.readFileSync(path.join(ROOT, 'tex/vendor/hunspell/dict/' + name + '.' + e)));
  return H._spell_open(cs('/' + name + '.aff'), cs('/' + name + '.dic'));
};
const check = (h, words) => { const s = words.join('\n') + '\n'; const n = H.lengthBytesUTF8(s); const p = H._malloc(n + 1); H.stringToUTF8(s, p, n + 1); return H.UTF8ToString(H._spell_check_list(h, p, n)); };
const suggest = (h, w) => H.UTF8ToString(H._spell_suggest(h, cs(w))).split('\n').filter(Boolean);
group('Hunspell: the four dictionaries, suggestions, words added', () => {
  const D = Object.fromEntries(['en_US', 'en_GB', 'de_DE', 'es_ES'].map((d) => [d, openDict(d)]));
  for (const d in D) assert.ok(D[d] >= 0, d);
  assert.strictEqual(check(D.en_US, ['color', 'colour', 'recieve', "don't", 'well-known']), '10011');
  assert.strictEqual(check(D.en_GB, ['colour', 'organise', 'color']), '110');
  assert.strictEqual(check(D.de_DE, ['Häuser', 'Straße', 'Hauss']), '110');
  assert.strictEqual(check(D.es_ES, ['niño', 'mañana', 'ninno']), '110');
  assert.ok(suggest(D.en_US, 'recieve').includes('receive'));
  assert.ok(suggest(D.de_DE, 'Strase').includes('Straße'));
  H._spell_add(D.en_US, cs('Rikuy'));
  assert.strictEqual(check(D.en_US, ['Rikuy']), '1');
  // what a stranger's document may hold: long, odd and empty words do not stop it
  assert.strictEqual(check(D.en_US, ['', 'a'.repeat(300), '\u0000x', '𝔘𝔫𝔦']).length, 4);
  // 20,000 distinct words in one call
  const many = Array.from({ length: 20000 }, (_, i) => 'w' + i.toString(36) + 'ord');
  const t0 = performance.now();
  assert.strictEqual(check(D.en_US, many).length, 20000);
  console.log('hunspell: 20000 words checked in', Math.round(performance.now() - t0), 'ms');
});
// (R4) MyThes in the same module: the data whole here (the worker serves it piece by piece)
const openThes = (name) => {
  const dir = path.join(ROOT, 'tex/vendor/hunspell/thes');
  H.FS.writeFile('/' + name + '.idx', fs.readFileSync(path.join(dir, name + '.idx')));
  const pieces = fs.readdirSync(dir).filter((x) => x.startsWith(name + '.dat.')).sort().map((x) => fs.readFileSync(path.join(dir, x)));
  H.FS.writeFile('/' + name + '.dat', Buffer.concat(pieces));
  return H._thes_open(cs('/' + name + '.idx'), cs('/' + name + '.dat'));
};
const look = (t, w) => H.UTF8ToString(H._thes_lookup(t, cs(w))).split('\n').filter(Boolean).map((l) => l.split('\t'));
group('R4 MyThes: WordNet, OpenThesaurus, LibreOffice\'s Spanish (ISO8859-1), and Hunspell\'s stems', () => {
  const D = { en: openDict('en_US'), de: openDict('de_DE'), es: openDict('es_ES') };
  const T = { en: openThes('en_US'), de: openThes('de_DE'), es: openThes('es_ES') };
  for (const k in T) assert.ok(T[k] >= 0, k);
  const fast = look(T.en, 'fast');
  assert.ok(fast.length > 3 && fast.some((m) => m[0] === '(adj)' && m.some((x) => x.startsWith('speedy'))), JSON.stringify(fast.slice(0, 2)));
  assert.deepStrictEqual(look(T.en, 'qwzxv'), []);
  // inflected: no entry of its own, its stem has one
  assert.deepStrictEqual(look(T.de, 'häuser'), []);
  const stems = H.UTF8ToString(H._spell_stem(D.de, cs('Häuser'))).split('\n').filter(Boolean);
  assert.ok(stems.includes('Haus'), stems.join(','));
  assert.ok(look(T.de, 'haus').length > 0);
  assert.ok(H.UTF8ToString(H._spell_stem(D.es, cs('corriendo'))).split('\n').includes('correr'));
  // Spanish's file is ISO8859-1: the word and the answer in UTF-8 all the same
  const rap = look(T.es, 'rápido');
  assert.ok(rap.length > 0 && rap.flat().some((x) => /[áéíóúñ]/.test(x)), JSON.stringify(rap.slice(0, 1)));
  assert.deepStrictEqual(look(T.es, '中文'), [], 'a word with no place in ISO8859-1 is in no entry');
  // a stranger's words: long, empty, odd
  for (const w of ['', 'a'.repeat(400), '\u0000', '😀']) assert.ok(Array.isArray(look(T.en, w)));
});
fs.rmSync(tmp, { recursive: true, force: true });

// ---- (R4) grammar: the page's prose as Harper reads it, and Harper itself ----
{
  const { grammarBlocks, lintSource } = await import('../src/spell/words.js');
  const { harperBytes, lintText } = await import('../src/spell/harper.js');
  const doc = '\\documentclass{article}\n\\usepackage[german,english]{babel}\n\\begin{document}\nLet $x$ be small\\footnote{A note.} and he go home \\cite{k}.\n\n\\foreignlanguage{german}{Das ist gut.} It is is clear \\texttt{code} here.\n\\begin{tabular}{ll}a & b\\\\ c & d\\end{tabular}\n\\end{document}\n';
  const files = new Map([['main.tex', doc]]);
  const B = grammarBlocks(buildModel({ files, main: 'main.tex' }), { files, main: 'main.tex' });
  group('R4 grammar\'s text: a formula, a citation or code stands as x, a footnote apart, another language and table cells left out', () => {
    const texts = B.map((b) => b.text);
    assert.ok(texts.includes('Let x be small and he go home x.'), JSON.stringify(texts));
    assert.ok(texts.includes('A note.'));
    assert.ok(texts.includes('x It is is clear x here.'), JSON.stringify(texts));
    assert.ok(texts.every((t) => !/Das ist|&/.test(t)) && texts.includes('a') && texts.includes('d'));
    const g = B.find((b) => b.text.startsWith('Let'));
    const k = g.text.indexOf('go');
    assert.strictEqual(doc.slice(lintSource(g, k, k + 2).s, lintSource(g, k, k + 2).e), 'go');
    assert.strictEqual(lintSource(g, 4, 9), null, 'a span over the formula\'s x has no place in the source');
  });
  harperBytes(fs.readFileSync(path.join(ROOT, 'tex/vendor/harper/harper_wasm_slim_bg.wasm')));
  const t0 = performance.now();
  const L = await lintText('He go home. It is is clear. 😀 It is is so. This is an useful result.');
  console.log('harper: started and linted in', Math.round(performance.now() - t0), 'ms');
  group('R4 Harper: agreement, a repeated word, an article; offsets in UTF-16 past a character beyond U+FFFF', () => {
    const t = 'He go home. It is is clear. 😀 It is is so. This is an useful result.';
    const words = L.map((l) => t.slice(l.s, l.e));
    assert.ok(words.includes('go') && words.filter((w) => w === 'is is').length === 2 && words.includes('an'), JSON.stringify(words));
    assert.ok(L.find((l) => t.slice(l.s, l.e) === 'go').sugg.some((x) => x.text === 'goes'));
    assert.ok(!L.some((l) => /^Spelling$/.test(l.kind)), 'no spelling: Hunspell\'s');
  });
  const t2 = 'A introduction to it. Their is a problem. A APPLE A DAY. A APPLE, a day.';
  const L2 = await lintText(t2);
  group('Harper\'s suggestions as Word gives them: "A introduction" to "An", never "AN" (but AN in capitals), none twice', () => {
    const at = (w, i = 0) => L2.filter((l) => t2.slice(l.s, l.e) === w)[i];
    assert.deepStrictEqual(at('A').sugg.map((x) => x.text), ['An'], JSON.stringify(L2));
    for (const at of [t2.indexOf('A APPLE'), t2.lastIndexOf('A APPLE')]) {
      const caps = L2.find((l) => l.s === at);
      assert.ok(!caps || caps.sugg.every((x) => x.text === x.text.toUpperCase()), JSON.stringify(caps));
    }
    for (const l of L2) assert.strictEqual(new Set(l.sugg.map((x) => x.kind + x.text)).size, l.sugg.length, JSON.stringify(l.sugg));
    assert.ok(at('Their') && at('Their').sugg.length >= 1);
  });
}

// ---- the corpus: nothing of LaTeX is ever a word ----
const CORPUS = process.env.CORPUS_DIR || process.argv[2];
if (CORPUS && fs.existsSync(CORPUS)) {
  // the arguments that are keys, names or addresses, by command
  const KEYS = new Set(['label', 'ref', 'eqref', 'pageref', 'autoref', 'cref', 'Cref', 'nameref', 'cite', 'citep', 'citet', 'citeauthor', 'citeyear', 'nocite', 'parencite', 'textcite', 'autocite', 'footcite',
    'url', 'input', 'include', 'includegraphics', 'includepdf', 'bibliography', 'bibliographystyle', 'addbibresource', 'usepackage', 'RequirePackage', 'documentclass', 'begin', 'end',
    'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment', 'DeclareMathOperator', 'newtheorem', 'lstinputlisting', 'inputminted', 'verbatiminput', 'color', 'pagecolor',
    'setlength', 'setcounter', 'addtocounter', 'pagestyle', 'thispagestyle', 'pagenumbering', 'hypersetup', 'geometry', 'path', 'nolinkurl', 'texttt', 'verb', 'lstinline', 'mintinline', 'def', 'let']);
  const RAW = /^(verbatim\*?|Verbatim|lstlisting|minted|comment|filecontents\*?|tikzpicture|pspicture\*?|asy|asydef|gnuplot)$/;
  const forbidden = (src) => {
    const out = [];
    const walk = (nodes, depth) => {
      if (!nodes || depth > 300) return;
      for (const n of nodes) {
        if (n.t === 'comment' || n.t === 'math' || n.t === 'verb') { out.push([n.s, n.e]); continue; }
        if (n.t === 'cmd') {
          // (a command that is a character, \\ae or \\'e, makes a letter of a word)
          if (!(n.name in CHARS) && !(n.name in ACCENTS)) out.push([n.s, n.ne != null ? n.ne : n.s + 1 + n.name.length]);
          if (KEYS.has(n.name)) { out.push([n.s, n.e]); continue; }
          // \\href's address; a colour's name
          if (n.name === 'href' || n.name === 'textcolor' || n.name === 'colorbox') { const a = (n.args || []).find((x) => x && !x.o); if (a) out.push([a.s, a.e]); }
          for (const a of n.args || []) if (a && a.nodes) walk(a.nodes, depth + 1);
          continue;
        }
        if (n.t === 'env') {
          // \begin{name} itself (its arguments below), and \end{name}
          out.push([n.s, n.nameEnd != null ? n.nameEnd + 1 : n.args && n.args[0] ? n.args[0].s : n.be != null ? n.be : n.s]);
          if (n.es != null) out.push([n.es, n.e]);
          if (n.raw || RAW.test(n.name) || n.math) { out.push([n.s, n.e]); continue; }
          // (a mandatory argument is a specification, tabular's ll; an optional one may be a title)
          for (const a of n.args || []) if (a && !a.o) out.push([a.s, a.e]);
          walk(n.nodes, depth + 1);
          continue;
        }
        if (n.t === 'group') walk(n.nodes, depth + 1);
      }
    };
    walk(parse(src), 0);
    return out.sort((a, b) => a[0] - b[0]);
  };
  const files = [];
  const scan = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '.git') scan(p); } else if (e.name.endsWith('.tex')) files.push(p); } };
  scan(CORPUS);
  let docs = 0, words = 0, bad = 0;
  const examples = [];
  for (const f of files.sort()) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/\\begin\s*\{document\}/.test(text)) continue;
    const proj = new Map([[path.basename(f), text]]);
    let M;
    try { M = buildModel({ files: proj, main: path.basename(f) }); } catch (e) { continue; }
    const P = spellPlan(M, { files: proj, main: path.basename(f) });
    const F = forbidden(text);
    docs++;
    for (const o of P.occ) {
      const x = occSource(P, o);
      if (!x || x.f !== path.basename(f)) continue;
      words++;
      for (const [s, e] of x.parts) {
        // (the forbidden ranges are sorted by start; a binary search for the first that may hold s)
        let lo = 0, hi = F.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (F[m][0] <= s) lo = m + 1; else hi = m; }
        let hit = null;
        for (let k = lo - 1; k >= 0 && k >= lo - 400; k--) if (F[k][0] <= s && s < F[k][1] && e <= F[k][1] + 0) { hit = F[k]; break; }
        if (hit) { bad++; const k = path.relative(CORPUS, f); if (!examples.some((y) => y.startsWith(k + ':')) && examples.length < 40) examples.push(k + ': ' + JSON.stringify(text.slice(Math.max(hit[0], s - 40), s + 30)) + ' word ' + x.w); break; }
      }
    }
  }
  console.log('corpus: ' + docs + ' documents, ' + words + ' words checked, ' + bad + ' inside LaTeX');
  for (const e of examples) console.log('  ' + e);
  if (bad) { console.log('spell: ' + bad + ' words inside LaTeX'); process.exit(1); }
  groups++;
}

console.log('spell: ' + groups + ' groups of checks passed');
