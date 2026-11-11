// Chinese and Arabic (src/scripts.js): which scripts a text is written in, what a preamble sets
// up, whether a document runs right to left and the lines that set it up; then the page's model
// of the commands and environments that turn text or only name CJK's font (src/model.js).
import assert from 'node:assert/strict';
import { scriptsIn, scriptSetup, scriptNeeds, rtlDocument, scriptLines, addScriptSetup, languageDir, RTL_LANGUAGES, INDIC, scriptName } from '../src/scripts.js';
import { buildModel } from '../src/model.js';
import { clusterAt, clusterEdge, backspaceUnits } from '../src/editor.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const doc = (pre, body = 'Text.') => '\\documentclass{article}\n' + pre + (pre ? '\n' : '') + '\\begin{document}\n' + body + '\n\\end{document}\n';

// ---- scriptsIn ----------------------------------------------------------------------
ok('letters of each script are counted', () => {
  assert.deepEqual(scriptsIn('abc 中文 عربي'), { chinese: 2, arabic: 4, letters: 9 });
  // a text with neither script is not read at all: nothing is counted, its letters neither
  assert.deepEqual(scriptsIn('plain text, no more'), { chinese: 0, arabic: 0, letters: 0 });
  // Arabic digits and punctuation are no letters: a year or a comma alone needs no font set up
  assert.equal(scriptsIn('١٢٣، 2024').arabic, 0);
  // Persian and Urdu letters are in the Arabic script
  assert.equal(scriptsIn('پژوهش').arabic, 5);
});
ok('comments, commands and math do not count', () => {
  assert.deepEqual(scriptsIn('text % 中文 in a comment\nmore'), { chinese: 0, arabic: 0, letters: 8 });
  assert.deepEqual(scriptsIn('text % a comment\nmore'), { chinese: 0, arabic: 0, letters: 0 });
  assert.equal(scriptsIn('50\\% 中').chinese, 1, 'an escaped percent starts no comment');
  assert.equal(scriptsIn('$中 + ب$ and $$文$$ x').chinese, 0);
  assert.equal(scriptsIn('$中 + ب$ and $$文$$ x').arabic, 0);
  assert.deepEqual(scriptsIn('\\begin{otherlanguage}{arabic}\\textbf{x}\\end{otherlanguage} 中'), { chinese: 1, arabic: 0, letters: 8 }, 'names of commands and environments are not text');
  assert.equal(scriptsIn('\\textbf{中文}').chinese, 2, 'a command\'s argument is text');
});

// ---- scriptSetup --------------------------------------------------------------------
ok('packages and classes that set Chinese up', () => {
  for (const pre of ['\\usepackage{ctex}', '\\usepackage[UTF8]{ctex}', '\\usepackage{xeCJK}', '\\usepackage{CJKutf8}', '\\usepackage{CJK}', '\\usepackage{luatexja-fontspec}',
    '\\usepackage{amsmath, xeCJK}', '\\usepackage[chinese]{babel}', '\\usepackage{babel}\n\\babelprovide[import, onchar=ids fonts]{chinese}', '\\RequirePackage{ctex}']) {
    assert.deepEqual(scriptSetup(doc(pre)), { chinese: true, arabic: false }, pre);
  }
  for (const cls of ['ctexart', 'ctexrep', 'ctexbook', 'ctexbeamer', 'ltjsarticle', 'elegantpaper']) {
    assert.equal(scriptSetup('\\documentclass[12pt]{' + cls + '}\n\\begin{document}x\\end{document}').chinese, true, cls);
  }
  assert.deepEqual(scriptSetup(doc('\\usepackage{amsmath}')), { chinese: false, arabic: false });
});
ok('packages and classes that set Arabic up', () => {
  for (const pre of ['\\usepackage{arabtex}', '\\usepackage{arabxetex}', '\\usepackage{bidi}', '\\usepackage{xepersian}', '\\usepackage[arabic]{babel}', '\\usepackage[english, bidi=basic]{babel}',
    '\\usepackage{babel}\n\\babelprovide[import, main]{arabic}', '\\usepackage{babel}\n\\babelprovide{hebrew}', '\\usepackage{polyglossia}\n\\setmainlanguage{arabic}',
    '\\usepackage{polyglossia}\n\\setotherlanguage{farsi}', '\\usepackage{polyglossia}\n\\setotherlanguages{english, urdu}', '\\usepackage{polyglossia}\n\\setdefaultlanguage[numerals=maghrib]{arabic}']) {
    assert.deepEqual(scriptSetup(doc(pre)), { chinese: false, arabic: true }, pre);
  }
  assert.equal(scriptSetup('\\documentclass[arabic]{article}\n\\usepackage{babel}\n\\begin{document}x\\end{document}').arabic, true, 'a class option babel reads');
  assert.equal(scriptSetup('\\documentclass{xepersian-thesis}\n\\begin{document}x\\end{document}').arabic, true);
});
ok('a set up in a comment or after \\begin{document} is none', () => {
  assert.deepEqual(scriptSetup(doc('% \\usepackage{ctex}\n%\\usepackage[arabic]{babel}')), { chinese: false, arabic: false });
  assert.deepEqual(scriptSetup(doc('', '\\usepackage{ctex}')), { chinese: false, arabic: false });
  assert.deepEqual(scriptSetup('no document at all \\usepackage{ctex}'), { chinese: false, arabic: false });
});

// ---- scriptNeeds --------------------------------------------------------------------
ok('needs: what the text has and the preamble lacks', () => {
  const plain = doc('', '中文 text');
  assert.deepEqual([...scriptNeeds(plain, [plain])], ['chinese']);
  assert.deepEqual([...scriptNeeds(doc('\\usepackage{ctex}', '中文'), null)], [], 'set up: nothing needed');
  const both = doc('', '中文 and عربي');
  assert.deepEqual([...scriptNeeds(both, [both])], ['chinese', 'arabic']);
  assert.deepEqual([...scriptNeeds(doc('\\usepackage{ctex}', '中文 and عربي'))], ['arabic']);
  assert.deepEqual([...scriptNeeds(doc('', 'Only Latin.'))], []);
  // the main file's preamble is not its text: a Chinese comment-free \title there still is not body
  assert.deepEqual([...scriptNeeds(doc('\\newcommand{\\zh}{中文}', 'Latin'))], [], 'the preamble is not counted');
});
ok('needs over several files', () => {
  const main = doc('', '\\input{ch1}\n\\input{ch2}');
  const n1 = scriptNeeds(main, [main, 'First chapter in English.', '第二章 是中文的。']);
  assert.deepEqual([...n1], ['chinese']);
  assert.equal(n1.arabicMain, false);
  const n2 = scriptNeeds(main, [main, 'هذا فصل باللغة العربية', 'and a longer chapter that is written in English']);
  assert.deepEqual([...n2], ['arabic']);
  assert.equal(n2.arabicMain, false, 'not mostly Arabic');
  const n3 = scriptNeeds(main, [main, 'هذا فصل باللغة العربية وهو طويل', 'ok']);
  assert.equal(n3.arabicMain, true, 'mostly Arabic: an Arabic document');
  // a file that sets a script up itself does not count: only the main file's preamble does
  assert.deepEqual([...scriptNeeds(main, [main, '\\usepackage{ctex} 中文'])], ['chinese']);
});

// ---- rtlDocument --------------------------------------------------------------------
ok('right to left by the main language', () => {
  const yes = ['\\usepackage[arabic]{babel}', '\\usepackage[english, arabic]{babel}', '\\usepackage[main=arabic, english]{babel}', '\\usepackage[english, main=hebrew]{babel}',
    '\\usepackage[english, bidi=basic]{babel}\n\\babelprovide[import, main]{arabic}', '\\usepackage{babel}\n\\babelprovide[main, import]{farsi}',
    '\\usepackage{polyglossia}\n\\setmainlanguage{arabic}', '\\usepackage{polyglossia}\n\\setmainlanguage[numerals=maghrib]{arabic}\n\\setotherlanguage{english}',
    '\\usepackage{xepersian}', '\\usepackage[bidi=basic, english, urdu]{babel}'];
  const no = ['', '\\usepackage[english]{babel}', '\\usepackage[arabic, english]{babel}', '\\usepackage[main=english, arabic]{babel}', '\\usepackage[english, bidi=basic]{babel}\n\\babelprovide[import, onchar=ids fonts]{arabic}',
    '\\usepackage{polyglossia}\n\\setmainlanguage{english}\n\\setotherlanguage{arabic}', '% \\usepackage[arabic]{babel}', '\\usepackage{ctex}', '\\usepackage{bidi}'];
  for (const pre of yes) assert.equal(rtlDocument(doc(pre)), true, pre);
  for (const pre of no) assert.equal(rtlDocument(doc(pre)), false, pre);
});
ok('class options count for babel, before its own', () => {
  assert.equal(rtlDocument('\\documentclass[12pt, a4paper, arabic]{article}\n\\usepackage{babel}\n\\begin{document}x\\end{document}'), true);
  assert.equal(rtlDocument('\\documentclass[arabic]{article}\n\\usepackage[english]{babel}\n\\begin{document}x\\end{document}'), false, 'the package\'s last language is the main one');
  assert.equal(rtlDocument('\\documentclass[arabic]{article}\n\\begin{document}x\\end{document}'), false, 'no babel: the option says nothing');
  assert.equal(rtlDocument('\\documentclass{xepersian-thesis}\n\\begin{document}x\\end{document}'), true);
  assert.equal(rtlDocument('\\usepackage[arabic]{babel} and no document'), false);
});

// ---- addScriptSetup -----------------------------------------------------------------
const needs = (list, arabicMain = false) => Object.assign([...list], { arabicMain });
ok('a plain document: ctex for Chinese alone', () => {
  const t = doc('\\usepackage{amsmath}', '中文');
  const out = addScriptSetup(t, needs(['chinese']));
  assert.equal(out, t.replace('\\begin{document}', '\\usepackage[scheme=plain]{ctex} % Chinese text, set with XeLaTeX\n\\begin{document}'));
  assert.deepEqual(scriptSetup(out), { chinese: true, arabic: false });
  assert.deepEqual([...scriptNeeds(out, [out])], [], 'set up once, nothing more is needed');
});
ok('a plain document: babel, Amiri and bidi for Arabic', () => {
  const t = doc('', 'عربي');
  const out = addScriptSetup(t, needs(['arabic']));
  assert.equal(out, t.replace('\\begin{document}', '\\usepackage[english, bidi=basic]{babel} % LuaLaTeX orders right to left text by itself\n\\babelprovide[import, onchar=ids fonts]{arabic}\n\\babelfont[arabic]{rm}[Renderer=Harfbuzz]{Amiri}\n\\begin{document}'));
  assert.equal(rtlDocument(out), false, 'some Arabic in a left to right document');
  const main = addScriptSetup(t, needs(['arabic'], true));
  assert.ok(main.includes('\\babelprovide[import, main]{arabic}\n\\babelfont{rm}[Renderer=Harfbuzz]{Amiri}\n\\begin{document}'));
  assert.equal(rtlDocument(main), true, 'an Arabic document runs right to left once set up');
  assert.deepEqual(scriptSetup(main), { chinese: false, arabic: true });
});
ok('both: Chinese goes through babel too', () => {
  const out = addScriptSetup(doc('', '中 ع'), needs(['chinese', 'arabic']));
  assert.deepEqual(scriptLines(needs(['chinese', 'arabic']), doc('')), ['\\usepackage[english, bidi=basic]{babel} % LuaLaTeX orders right to left text by itself',
    '\\babelprovide[import, onchar=ids fonts]{arabic}', '\\babelfont[arabic]{rm}[Renderer=Harfbuzz]{Amiri}', '\\babelprovide[import, onchar=ids fonts]{chinese}', '\\babelfont[chinese]{rm}{FandolSong}']);
  assert.deepEqual(scriptSetup(out), { chinese: true, arabic: true });
  assert.ok(!out.includes('ctex'));
});
ok('an existing babel gains bidi=basic and is not loaded twice', () => {
  const noOpt = addScriptSetup(doc('\\usepackage{babel}', 'ع'), needs(['arabic']));
  assert.ok(noOpt.includes('\\usepackage[bidi=basic]{babel}\n\\babelprovide[import, onchar=ids fonts]{arabic}'), noOpt);
  assert.equal(noOpt.match(/\{babel\}/g).length, 1);
  const withOpt = addScriptSetup(doc('\\usepackage[french, english]{babel}', 'ع'), needs(['arabic']));
  assert.ok(withOpt.includes('\\usepackage[french, english, bidi=basic]{babel}\n'), withOpt);
  assert.equal(withOpt.match(/\{babel\}/g).length, 1);
  const has = doc('\\usepackage[english, bidi=basic]{babel}', '中');
  const zh = addScriptSetup(has, needs(['chinese']));
  assert.ok(zh.includes('\\usepackage[english, bidi=basic]{babel}\n\\babelprovide[import, onchar=ids fonts]{chinese}\n\\babelfont[chinese]{rm}{FandolSong}\n\\begin{document}'), 'babel with bidi is there: Chinese through babel, the line as it was');
});
ok('babel in a comment is left alone', () => {
  const t = doc('% \\usepackage[english]{babel}\n\\usepackage{amsmath} % not \\usepackage{babel}', 'ع');
  const out = addScriptSetup(t, needs(['arabic']));
  assert.ok(out.startsWith('\\documentclass{article}\n% \\usepackage[english]{babel}\n\\usepackage{amsmath} % not \\usepackage{babel}\n\\usepackage[english, bidi=basic]{babel} % LuaLaTeX'), out);
});
ok('nothing without \\begin{document}, or without needs', () => {
  assert.equal(addScriptSetup('A fragment with 中文 and no document.', needs(['chinese'])), null);
  assert.equal(addScriptSetup(doc('', 'x'), needs([])), null);
  // the text after \begin{document} comes out as it went in
  const t = doc('', '中文 % \\begin{document} in a comment');
  assert.ok(addScriptSetup(t, needs(['chinese'])).endsWith(t.slice(t.indexOf('\\begin{document}'))));
});

// ---- a document made to be slow -----------------------------------------------------
// The preamble may be a stranger's (a link, a .zip) and is read on the page at every key. Each
// of these took minutes before the arguments were bounded and the preamble's length was.
ok('a megabyte of unclosed \\usepackage[ is handled in under a second', () => {
  const tail = '\n\\begin{document}\n中文 and عربي\n\\end{document}\n';
  const hostile = [
    '\\documentclass{article}\n' + '\\usepackage['.repeat(Math.ceil(1e6 / 12)),
    '\\documentclass{article}\n' + '\\usepackage{'.repeat(Math.ceil(1e6 / 12)),
    '\\documentclass{article}\n\\usepackage' + ' '.repeat(1e6) + 'x',
    '\\documentclass{article}\n\\usepackage{babel}\\babelprovide' + ' '.repeat(5e5) + 'x\\setmainlanguage' + ' '.repeat(5e5) + 'x',
    '\\documentclass' + ' '.repeat(1e6) + 'x' + '\\babelprovide['.repeat(2e4),
    '\\documentclass{article}\n' + ('\\usepackage' + ' '.repeat(40) + '\n').repeat(2e4) + ' '.repeat(2e5)
  ];
  for (const pre of hostile) {
    const t = pre + tail;
    assert.ok(t.length > 1e6);
    const t0 = performance.now();
    const needs = scriptNeeds(t, [t]);
    rtlDocument(t);
    scriptSetup(t);
    const out = addScriptSetup(t, needs);
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, Math.round(ms) + ' ms for ' + JSON.stringify(pre.slice(24, 60)));
    assert.deepEqual([...needs], ['chinese', 'arabic']);
    assert.ok(out.endsWith('\\babelfont[chinese]{rm}{FandolSong}' + tail), 'and the lines still go before \\begin{document}');
  }
  // the body: a megabyte of environments never closed, of dollars, of comment signs
  for (const body of ['\\begin{'.repeat(15e4) + '中', '$'.repeat(1e6) + '中', ('% ' + 'x'.repeat(98) + '\n').repeat(1e4) + '中', '\\begin' + ' '.repeat(1e6) + '中']) {
    const t0 = performance.now();
    assert.equal(scriptsIn(body).chinese, 1);
    assert.ok(performance.now() - t0 < 1000, Math.round(performance.now() - t0) + ' ms for the body ' + JSON.stringify(body.slice(0, 20)));
  }
  // and a document with neither script costs one look: no preamble is read
  const big = '\\documentclass{article}\n' + '\\usepackage['.repeat(1e5) + '\n\\begin{document}\nLatin only.\n\\end{document}\n';
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) assert.deepEqual([...scriptNeeds(big, [big])], []);
  assert.ok(performance.now() - t0 < 500, Math.round(performance.now() - t0) + ' ms for twenty looks');
});
ok('a preamble is read up to 200 000 characters', () => {
  const pad = '% ' + 'x'.repeat(98) + '\n';
  const near = '\\documentclass{article}\n' + pad.repeat(1900) + '\\usepackage[arabic]{babel}\n\\begin{document}x\\end{document}';
  const far = '\\documentclass{article}\n' + pad.repeat(2100) + '\\usepackage[arabic]{babel}\n\\begin{document}x\\end{document}';
  assert.equal(rtlDocument(near), true);
  assert.equal(rtlDocument(far), false);
});

// ---- languages ----------------------------------------------------------------------
ok('the direction of a language by its name', () => {
  for (const l of ['arabic', 'farsi', 'persian', 'hebrew', 'urdu', 'Arabic', ' hebrew ', 'arabic-dz']) assert.equal(languageDir(l), 'rtl', l);
  for (const l of ['english', 'ngerman', 'french', 'chinese', 'greek']) assert.equal(languageDir(l), 'ltr', l);
  for (const l of ['', 'klingon', 'arabicx', null, undefined]) assert.equal(languageDir(l), null, String(l));
  assert.ok(RTL_LANGUAGES.test('farsi') && !RTL_LANGUAGES.test('english'));
});

// ---- the page's model ---------------------------------------------------------------
const build = (tex) => buildModel({ files: new Map([['main.tex', tex]]), main: 'main.tex' });
const show = (inl) => (inl || []).map((x) => x.k === 'seg' ? x.t.replace(/\u200B/g, '∅') : x.k === 'sty' ? '<' + x.st + (x.dir ? ':' + x.dir : '') + '>' + show(x.kids) + '</>' : x.k === 'chr' ? '[' + x.text + ']' : x.k === 'mac' ? '{' + show(x.kids) + '}' : '<' + x.k + '>').join('');
const items = (M) => M.blocks.flatMap((b) => b.items);
const lines = (M) => items(M).map((it) => it.type + (it.dir ? ' ' + it.dir : '') + (it.inl ? ' | ' + show(it.inl) : ''));
// every character of a wrapper's text points at itself in the source
const mapsHold = (M, src) => {
  const walk = (inl) => { for (const x of inl || []) { if (x.k === 'seg' && !x.ph) for (let i = 0; i < x.t.length; i++) { const raw = src.slice(x.map[2 * i], x.map[2 * i + 1]); assert.ok(x.t[i] === ' ' ? /^\s+$/.test(raw) : raw === x.t[i] || raw.length === 2 && raw.includes(x.t[i]), JSON.stringify([x.t[i], raw])); } if (x.kids) walk(x.kids); } };
  for (const b of M.blocks) { for (const it of b.items) { walk(it.inl); walk(it.title); for (const p of it.parts || []) walk(p.inl); } for (const f of b.fns) walk(f.inl); }
};
const AR = '\\usepackage[english, bidi=basic]{babel}\n\\babelprovide[import, main]{arabic}';

ok('an Arabic document: every text block runs right to left', () => {
  const src = doc(AR + '\n\\title{عنوان}\\author{مؤلف}', '\\maketitle\n\\begin{abstract}ملخص.\\end{abstract}\n\\section{مقدمة}\nنص عربي\\footnote{حاشية} مع English.\n\n\\begin{itemize}\\item واحد\\item اثنان\\end{itemize}\n\\begin{figure}\\caption{شكل}\\end{figure}\n\\begin{tabular}{ll}أ&ب\\\\\\end{tabular}\n\\[x=1\\]');
  const M = build(src);
  assert.equal(M.opts.rtl, true);
  const its = items(M);
  for (const it of its.filter((x) => ['p', 'h', 'title'].includes(x.type))) assert.equal(it.dir, 'rtl', it.type);
  assert.equal(its.filter((x) => x.type === 'p' && x.label).length, 2, 'the list items');
  assert.equal(M.blocks.flatMap((b) => b.fns)[0].dir, 'rtl', 'the footnote');
  const floats = its.filter((x) => x.type === 'float');
  assert.equal(floats[0].parts[0].type + floats[0].parts[0].dir, 'captionrtl');
  assert.equal(floats[0].dir, undefined, 'a float has no direction of its own');
  assert.equal(floats[1].parts[0].type + floats[1].parts[0].dir, 'tabularrtl', 'cells run right to left, the columns stay');
  assert.equal(its.find((x) => x.type === 'math').dir, undefined, 'a formula stays left to right');
  mapsHold(M, src);
});
ok('a document with no such language has no direction anywhere', () => {
  const M = build(doc('\\usepackage[ngerman]{babel}', '\\section{A}\nText with عربي and 中文.\\footnote{n}\n\n\\begin{itemize}\\item x\\end{itemize}'));
  assert.equal(M.opts.rtl, false);
  for (const it of items(M)) assert.equal(it.dir, undefined, it.type);
  assert.equal(M.blocks.flatMap((b) => b.fns)[0].dir, undefined);
  assert.deepEqual(M.warn, []);
});
ok('commands that turn their argument', () => {
  const src = doc('', 'A \\foreignlanguage{arabic}{عربي} b \\textarabic{نص} c \\RL{يمين} d \\texthebrew{עב} e \\foreignlanguage[date]{farsi}{فا} f.');
  const M = build(src);
  assert.deepEqual(lines(M), ['p | A <dir:rtl>عربي</> b <dir:rtl>نص</> c <dir:rtl>يمين</> d <dir:rtl>עב</> e <dir:rtl>فا</> f.']);
  assert.deepEqual(M.warn, [], 'none is an unknown command');
  const w = items(M)[0].inl.filter((x) => x.k === 'sty');
  assert.deepEqual(w.map((x) => src.slice(x.s, x.e)), ['\\foreignlanguage{arabic}{عربي}', '\\textarabic{نص}', '\\RL{يمين}', '\\texthebrew{עב}', '\\foreignlanguage[date]{farsi}{فا}']);
  assert.deepEqual(w.map((x) => src.slice(x.is, x.ie)), ['عربي', 'نص', 'يمين', 'עב', 'فا'], 'the wrapper knows its text, for Enter and for an empty one');
  mapsHold(M, src);
});
ok('left to right in left to right is plain text; in right to left it turns', () => {
  const body = 'A \\foreignlanguage{german}{Straße} b \\LR{left} c \\babelsublr{sub} d \\textenglish{eng} e.';
  const ltr = build(doc('', body));
  assert.deepEqual(lines(ltr), ['p | A Straße b left c sub d eng e.']);
  assert.deepEqual(ltr.warn, []);
  const rtl = build(doc(AR, body));
  assert.deepEqual(lines(rtl), ['p rtl | A <dir:ltr>Straße</> b <dir:ltr>left</> c <dir:ltr>sub</> d <dir:ltr>eng</> e.']);
  // nested: English inside Arabic inside English
  assert.deepEqual(lines(build(doc('', 'x \\foreignlanguage{arabic}{ع \\foreignlanguage{english}{in} ب} y'))), ['p | x <dir:rtl>ع <dir:ltr>in</> ب</> y']);
});
ok('a name the document defines itself is its own', () => {
  const M = build(doc('\\newcommand{\\LR}{likelihood ratio}\\newcommand{\\RL}[1]{(#1)}', 'The \\LR{} test and \\RL{x}.'));
  assert.ok(!JSON.stringify(items(M)).includes('"st":"dir"'));
  assert.ok(lines(M)[0].includes('likelihood ratio'));
  // a language the page does not know changes nothing, as before
  assert.deepEqual(lines(build(doc('', 'a \\foreignlanguage{klingon}{tlh} b'))), ['p | a tlh b']);
});
ok('an empty wrapper keeps a place to type in', () => {
  const src = doc('', 'a \\foreignlanguage{arabic}{} b');
  const w = items(build(src))[0].inl.find((x) => x.k === 'sty');
  assert.equal(w.dir, 'rtl');
  assert.equal(w.kids.length, 1);
  assert.ok(w.kids[0].ph && w.kids[0].map[0] === src.indexOf('{} b') + 1);
});
ok('environments that turn their paragraphs', () => {
  for (const [open, close] of [['\\begin{otherlanguage}{arabic}', '\\end{otherlanguage}'], ['\\begin{otherlanguage*}{arabic}', '\\end{otherlanguage*}'], ['\\begin{Arabic}', '\\end{Arabic}'], ['\\begin{arabic}', '\\end{arabic}'],
    ['\\begin{hebrew}', '\\end{hebrew}'], ['\\begin{farsi}', '\\end{farsi}'], ['\\begin{persian}', '\\end{persian}'], ['\\begin{urdu}', '\\end{urdu}'], ['\\begin{RTL}', '\\end{RTL}'], ['\\begin{Arabic}[numerals=maghrib]', '\\end{Arabic}']]) {
    const src = doc('', 'Before.\n\n' + open + '\nفقرة أولى.\n\nفقرة ثانية.\n' + close + '\n\nAfter.');
    const M = build(src);
    assert.deepEqual(lines(M), ['p | Before.', 'p rtl | فقرة أولى.', 'p rtl | فقرة ثانية.', 'p | After.'], open);
    assert.deepEqual(M.warn, []);
    assert.equal(M.blocks.length, 4, 'each paragraph is a block of its own, as in the document');
    assert.ok(items(M).every((it) => !it.envTag), 'no tag of an unknown environment');
    mapsHold(M, src);
  }
  const ltr = build(doc(AR, 'نص.\n\n\\begin{otherlanguage}{english}\nEnglish.\n\\end{otherlanguage}\n\n\\begin{LTR}\nLeft.\n\\end{LTR}\n\n\\begin{english}\nToo.\n\\end{english}\n\nنص.'));
  assert.deepEqual(lines(ltr), ['p rtl | نص.', 'p ltr | English.', 'p ltr | Left.', 'p ltr | Too.', 'p rtl | نص.']);
});
ok('an environment around words of a line stays in the line', () => {
  const src = doc('', 'Inline \\begin{otherlanguage*}{arabic}عربي\\end{otherlanguage*} here.\n\n\\begin{RTL}نص\\end{RTL} tail.');
  const M = build(src);
  assert.deepEqual(lines(M), ['p | Inline <dir:rtl>عربي</> here.', 'p | <dir:rtl>نص</> tail.']);
  const w = items(M)[0].inl.find((x) => x.k === 'sty');
  assert.equal(src.slice(w.s, w.e), '\\begin{otherlanguage*}{arabic}عربي\\end{otherlanguage*}');
  assert.equal(src.slice(w.is, w.ie), 'عربي');
  mapsHold(M, src);
});
ok('an empty environment has a paragraph to type in, running its way', () => {
  const src = doc('', '\\begin{otherlanguage}{arabic}\\end{otherlanguage}');
  const it = items(build(src))[0];
  assert.equal(it.type + it.dir, 'prtl');
  assert.ok(it.inl[0].ph && it.inl[0].map[0] === src.indexOf('\\end{otherlanguage}'));
});
ok('\\selectlanguage holds until the next one, the end of its group or of its environment', () => {
  const M = build(doc('', 'One.\n\n\\selectlanguage{arabic}\nاثنان.\n\nثلاثة.\n\n\\selectlanguage{english}\nFour.'));
  assert.deepEqual(lines(M), ['p | One.', 'p rtl | اثنان.', 'p rtl | ثلاثة.', 'p | Four.']);
  assert.deepEqual(lines(build(doc('', 'Start \\selectlanguage{arabic}نهاية.\n\nالتالي.'))), ['p | Start <dir:rtl>نهاية.</>', 'p rtl | التالي.'], 'in a line: the rest of it turns');
  assert.deepEqual(lines(build(doc('', '{\\selectlanguage{hebrew}עב} then.\n\nNext.'))), ['p | <dir:rtl>עב</> then.', 'p | Next.'], 'a group ends it');
  assert.deepEqual(lines(build(doc('', '\\begin{quote}\n\\selectlanguage{arabic}\nنص.\n\\end{quote}\n\nAfter.'))), ['p rtl | نص.', 'p | After.'], 'an environment ends it');
  assert.deepEqual(lines(build(doc(AR, 'نص.\n\n\\selectlanguage{english}\nEnglish.\n\n\\section{S}'))), ['p rtl | نص.', 'p ltr | English.', 'h ltr | S']);
  assert.deepEqual(lines(build(doc('', '\\setRTL\nنص.\n\n\\setLTR\nBack.'))), ['p rtl | نص.', 'p | Back.'], 'bidi\'s switches');
});
ok('a block is drawn again when the direction before it changes', () => {
  const a = build(doc('', '\\selectlanguage{arabic}\n\nنص.'));
  const b = build(doc('', '\\selectlanguage{english}\n\nنص.'));
  const key = (M) => M.blocks.find((x) => x.items[0].inl && show(x.items[0].inl) === 'نص.').key;
  assert.notEqual(key(a), key(b));
});
ok('many switches in one paragraph are runs side by side, not one inside the other', () => {
  // 550 pairs in one paragraph overflowed the stack (a call per switch): the page then kept
  // showing the document before. Each run is a wrapper of its own beside the others.
  const src = doc('', '\\selectlanguage{arabic} مرحبا \\selectlanguage{english} b '.repeat(550).trim());
  const M = build(src);
  const it = items(M)[0];
  assert.equal(items(M).length, 1);
  assert.equal(it.dir, 'rtl', 'the paragraph runs the way its first words do');
  const runs = it.inl.filter((x) => x.k === 'sty');
  assert.equal(runs.length, 550);
  assert.ok(runs.every((x) => x.st === 'dir' && x.dir === 'ltr' && x.decl && show(x.kids).trim() === 'b' && x.kids.every((y) => y.k === 'seg')), 'English runs turn, none holds another');
  assert.equal(it.inl.filter((x) => x.k === 'seg' && x.t.includes('مرحبا')).length, 550, 'Arabic runs are the paragraph\'s own words');
  mapsHold(M, src);
  assert.deepEqual(lines(build(doc('', 'a \\selectlanguage{arabic}ب \\selectlanguage{hebrew}ג \\selectlanguage{english}d \\selectlanguage{farsi}ه.\n\nو.'))), ['p | a <dir:rtl>ب ג </>d <dir:rtl>ه.</>', 'p rtl | و.'], 'the same direction again goes on in the same run');
  assert.deepEqual(lines(build(doc(AR, 'ا \\textbf{ب \\selectlanguage{english}c \\bfseries d} ه'))), ['p rtl | ا <bf>ب <dir:ltr>c <bf>d</></></> ه'], 'inside an argument, with a font switch after it');
  // deep the other way too: 3000 switches, well past where the stack ended
  assert.equal(items(build(doc('', 'x \\selectlanguage{arabic} ع \\selectlanguage{english} y '.repeat(3000))))[0].inl.filter((x) => x.k === 'sty').length, 3000);
});
ok('a long run of comments before many \\selectlanguage builds in linear time', () => {
  // 50 000 comment lines, then 4 300 switches to a language that changes nothing (203 kB): the
  // paragraph so far was looked through again for each of them, 1.2 s at every key
  const src = doc('', '%\n'.repeat(50000) + '\\selectlanguage{german} '.repeat(4300) + 'Text.');
  assert.ok(src.length > 200000 && src.length < 206000, String(src.length));
  build(src);
  const t0 = performance.now();
  const M = build(src);
  const ms = performance.now() - t0;
  assert.deepEqual(lines(M), ['p | Text.']);
  assert.ok(ms < 500, Math.round(ms) + ' ms');
  // and the same for environments in a line after many blank nodes
  const env = doc('', '%c\n'.repeat(40000) + 'x ' + '\\begin{CJK}{UTF8}{gbsn}中\\end{CJK} '.repeat(4000));
  const t1 = performance.now();
  assert.equal(items(build(env)).length, 1);
  assert.ok(performance.now() - t1 < 1000, Math.round(performance.now() - t1) + ' ms');
});
ok('the contents run the way the text does where they stand, and follow a change', () => {
  const at = (lang) => { const M = build(doc('', '\\selectlanguage{' + lang + '}\n\n\\tableofcontents\n\n\\section{S}\nText.')); return M.blocks.find((b) => b.items[0].type === 'toc'); };
  const ar = at('arabic'), en = at('english');
  assert.equal(ar.items[0].dir, 'rtl');
  assert.equal(en.items[0].dir, undefined);
  assert.notEqual(ar.key, en.key, 'drawn again when the language before them changes');
  assert.equal(at('hebrew').key.split('\u0000')[2], ar.key.split('\u0000')[2], 'and not when the direction stays');
  assert.equal(build(doc(AR, '\\tableofcontents\n\\section{S}')).blocks[0].items[0].dir, 'rtl');
});
ok('CJK wrappers are transparent', () => {
  for (const env of ['CJK', 'CJK*']) {
    const src = doc('\\usepackage{CJKutf8}', 'Before.\n\n\\begin{' + env + '}{UTF8}{gbsn}\n中文段落。\n\n第二段\\CJKfamily{gkai}楷体。\n\\end{' + env + '}\n\nMixed \\begin{' + env + '}{UTF8}{gbsn}中文\\end{' + env + '} inline.');
    const M = build(src);
    assert.deepEqual(lines(M), ['p | Before.', 'p | 中文段落。', 'p | 第二段楷体。', 'p | Mixed 中文 inline.'], env);
    assert.deepEqual(M.warn, []);
    assert.ok(items(M).every((it) => !it.envTag));
    mapsHold(M, src);
  }
  // the whole body in one CJK environment, as such documents are written: paragraphs are blocks
  const whole = build(doc('\\usepackage{CJKutf8}', '\\begin{CJK}{UTF8}{gbsn}\n\\section{引言}\n第一段。\n\n第二段。\n\\end{CJK}'));
  assert.deepEqual(lines(whole), ['h | 引言', 'p | 第一段。', 'p | 第二段。']);
  assert.equal(whole.blocks.length, 3);
  assert.deepEqual(lines(build(doc('', '\\begin{CJK}[T1]{UTF8}{gbsn}字\\end{CJK}'))), ['p | 字'], 'the optional font encoding too');
});
ok('an environment the document defines under a language\'s name is its own', () => {
  const M = build(doc('\\newenvironment{hebrew}{\\begin{quote}}{\\end{quote}}', '\\begin{hebrew}\nText.\n\\end{hebrew}'));
  assert.equal(items(M)[0].dir, undefined);
});

// ---- India's scripts ----------------------------------------------------------------
const WORDS = { devanagari: 'हिन्दी', bengali: 'বাংলা', gurmukhi: 'ਪੰਜਾਬੀ', gujarati: 'ગુજરાતી', odia: 'ଓଡ଼ିଆ', tamil: 'தமிழ்', telugu: 'తెలుగు', kannada: 'ಕನ್ನಡ', malayalam: 'മലയാളം' };
ok('each of India\'s nine scripts is counted under its own name', () => {
  assert.deepEqual(INDIC.map((x) => x[0]), Object.keys(WORDS));
  for (const [id, word] of Object.entries(WORDS)) {
    const c = scriptsIn('Latin ' + word + ' text');
    const letters = [...word].filter((ch) => /\p{L}/u.test(ch)).length;
    assert.equal(c[id], letters, id + ': its letters, the vowel signs and viramas not among them');
    assert.deepEqual(Object.keys(c).sort(), ['arabic', 'chinese', id, 'letters'].sort(), id + ' and no other script');
    assert.equal(c.letters, letters + 9);
    // both ends of its block, and the block before and after it are not it
    const range = INDIC.find((x) => x[0] === id)[2];
    assert.ok([...word].every((ch) => range.test(ch)), id);
    assert.equal(INDIC.filter((x) => x[2].test(word[0])).length, 1, 'one row per character');
  }
  assert.equal(scriptsIn('\\textbf{हिन्दी} % टिप्पणी\n$क$').devanagari, 3, 'comments and math do not count');
  assert.deepEqual(INDIC.map((x) => scriptName(x[0])), ['Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Odia', 'Tamil', 'Telugu', 'Kannada', 'Malayalam']);
  assert.deepEqual(['chinese', 'arabic'].map(scriptName), ['Chinese', 'Arabic']);
});
ok('a preamble that sets one of them up, by babel, \\babelprovide or polyglossia', () => {
  for (const [id, , , babel, , , names] of INDIC) {
    for (const pre of ['\\usepackage[english, ' + babel + ']{babel}', '\\usepackage{babel}\n\\babelprovide[import, onchar=ids fonts]{' + babel + '}', '\\usepackage{babel}\n\\babelprovide{' + babel + '}',
      '\\usepackage{polyglossia}\n\\setmainlanguage{english}\n\\setotherlanguage{' + babel + '}', '\\usepackage{polyglossia}\n\\setmainlanguage[numerals=western]{' + babel + '}', '\\usepackage{polyglossia}\n\\setotherlanguages{english, ' + babel + '}']) {
      const have = scriptSetup(doc(pre));
      assert.equal(have[id], true, pre);
      assert.deepEqual(Object.keys(have).sort(), ['arabic', 'chinese', id].sort(), 'and only it: ' + pre);
    }
    assert.ok(names.test(babel));
  }
  for (const lang of ['marathi', 'sanskrit', 'nepali']) assert.equal(scriptSetup(doc('\\usepackage[' + lang + ']{babel}')).devanagari, true, lang);
  assert.equal(scriptSetup(doc('\\usepackage{babel}\n\\babelprovide{bangla}')).bengali, true);
  assert.equal(scriptSetup(doc('\\usepackage[english]{babel}')).devanagari, undefined);
  assert.equal(scriptSetup(doc('% \\usepackage[hindi]{babel}')).devanagari, undefined, 'not in a comment');
});
ok('needs and lines for a mixed document', () => {
  const t = doc('', 'Hello हिन्दी and தமிழ் and 中文.');
  const needs = scriptNeeds(t, [t]);
  assert.deepEqual([...needs], ['chinese', 'devanagari', 'tamil']);
  assert.deepEqual(scriptLines(needs, t), ['\\usepackage[english]{babel} % LuaLaTeX sets each script in its own font',
    '\\babelprovide[import=hi, onchar=ids fonts]{hindi}', '\\babelfont[hindi]{rm}[Renderer=Harfbuzz]{Noto Serif Devanagari}',
    '\\babelprovide[import=ta, onchar=ids fonts]{tamil}', '\\babelfont[tamil]{rm}[Renderer=Harfbuzz]{Noto Serif Tamil}',
    '\\babelprovide[import, onchar=ids fonts]{chinese}', '\\babelfont[chinese]{rm}{FandolSong}']);
  // every script alone: its own two lines after babel's, and before them the line that tells
  // babel where Gurmukhi's and Gujarati's characters are (it has no range for the two)
  for (const [id, name, , babel, code, font, , range] of INDIC) {
    const d = doc('', 'Text ' + WORDS[id] + '.');
    const n1 = scriptNeeds(d, [d]);
    assert.deepEqual([...n1], [id]);
    const own = scriptLines(n1, d).slice(1);
    assert.equal(!!range, id === 'gurmukhi' || id === 'gujarati');
    if (range) assert.equal(own.shift(), '\\directlua{Babel.script_blocks.' + range + "} % where " + name + "'s characters are: babel has no entry");
    assert.deepEqual(own, ['\\babelprovide[import=' + code + ', onchar=ids fonts]{' + babel + '}', '\\babelfont[' + babel + ']{rm}[Renderer=Harfbuzz]{' + font + '}'], id);
    assert.equal(rtlDocument(addScriptSetup(d, n1)), false);
  }
  // text in another file of the project counts, and Arabic beside it brings its bidi
  const main = doc('', '\\input{ch}');
  assert.deepEqual([...scriptNeeds(main, [main, 'বাংলা লেখা'])], ['bengali']);
  const ar = doc('', 'Mostly English text here, with عربي and తెలుగు words.');
  assert.deepEqual(scriptLines(scriptNeeds(ar, [ar]), ar), ['\\usepackage[english, bidi=basic]{babel} % LuaLaTeX orders right to left text by itself', '\\babelprovide[import, onchar=ids fonts]{arabic}',
    '\\babelfont[arabic]{rm}[Renderer=Harfbuzz]{Amiri}', '\\babelprovide[import=te, onchar=ids fonts]{telugu}', '\\babelfont[telugu]{rm}[Renderer=Harfbuzz]{Noto Serif Telugu}']);
});
ok('set up twice adds nothing', () => {
  for (const body of ['Hello हिन्दी and தமிழ் and 中文.', 'ગુજરાતી', 'ಕನ್ನಡ and മലയാളം and ଓଡ଼ିଆ and ਪੰਜਾਬੀ and বাংলা and తెలుగు', 'English, عربي and हिन्दी in one long enough sentence.']) {
    const t = doc('\\usepackage{amsmath}', body);
    const once = addScriptSetup(t, scriptNeeds(t, [t]));
    assert.ok(once && once !== t, body);
    const again = scriptNeeds(once, [once]);
    assert.deepEqual([...again], [], body);
    assert.equal(addScriptSetup(once, again), null);
    assert.equal(once.match(/\{babel\}/g).length, 1);
    assert.ok(once.endsWith(t.slice(t.indexOf('\\begin{document}'))), 'the body as it was');
  }
  // one more script later: its lines alone, babel not loaded again
  const t = doc('', 'हिन्दी');
  const once = addScriptSetup(t, scriptNeeds(t, [t]));
  const more = once.replace('हिन्दी', 'हिन्दी தமிழ்');
  const needs = scriptNeeds(more, [more]);
  assert.deepEqual([...needs], ['tamil']);
  assert.deepEqual(scriptLines(needs, more), ['\\babelprovide[import=ta, onchar=ids fonts]{tamil}', '\\babelfont[tamil]{rm}[Renderer=Harfbuzz]{Noto Serif Tamil}']);
  // Rikuy's own ctex line makes way: the document moves to LuaLaTeX, Chinese through babel
  const zh = doc('\\usepackage[scheme=plain]{ctex} % Chinese text, set with XeLaTeX', '中文 हिन्दी');
  const out = addScriptSetup(zh, scriptNeeds(zh, [zh]));
  assert.ok(!out.includes('ctex') && out.includes('\\babelfont[chinese]{rm}{FandolSong}') && out.includes('{hindi}'), out);
  assert.deepEqual([...scriptNeeds(out, [out])], []);
});
ok('beside xeCJK, polyglossia or a CJK class nothing is offered', () => {
  for (const pre of ['\\usepackage{xeCJK}', '\\usepackage{polyglossia}\n\\setmainlanguage{english}', '\\usepackage{ctex}', '\\usepackage{CJKutf8}', '\\usepackage{xepersian}']) {
    for (const id of ['devanagari', 'tamil', 'malayalam']) {
      const t = doc(pre, 'Text ' + WORDS[id] + '.');
      const needs = scriptNeeds(t, [t]);
      assert.ok(needs.includes(id), pre);
      assert.deepEqual(scriptLines(needs, t), [], pre + ' ' + id);
      assert.equal(addScriptSetup(t, needs), null, pre + ' ' + id);
    }
  }
  const cls = '\\documentclass{ctexart}\n\\begin{document}\n中文 हिन्दी\n\\end{document}\n';
  assert.equal(addScriptSetup(cls, scriptNeeds(cls, [cls])), null);
});
ok('India\'s languages run left to right, and their wrappers are text', () => {
  for (const l of ['hindi', 'marathi', 'bengali', 'punjabi', 'gujarati', 'odia', 'tamil', 'telugu', 'kannada', 'malayalam']) assert.equal(languageDir(l), 'ltr', l);
  const M = build(doc('\\usepackage{polyglossia}', 'A \\texthindi{हिन्दी} b \\foreignlanguage{telugu}{తెలుగు} c.\n\n\\begin{hindi}\nनमस्ते।\n\\end{hindi}\n\n\\begin{otherlanguage}{tamil}\nதமிழ்.\n\\end{otherlanguage}'));
  assert.deepEqual(lines(M), ['p | A हिन्दी b తెలుగు c.', 'p | नमस्ते।', 'p | தமிழ்.']);
  assert.deepEqual(M.warn, []);
  assert.ok(items(M).every((it) => !it.envTag && it.dir === undefined));
  assert.deepEqual(lines(build(doc(AR, 'نص \\texthindi{हिन्दी} نص'))), ['p rtl | نص <dir:ltr>हिन्दी</> نص'], 'left to right inside a right to left line');
});
ok('a word is counted once, whatever marks it carries', () => {
  assert.equal(build(doc('', 'यह हिन्दी क्षितिज नमस्ते का वाक्य है।')).words, 7);
  assert.equal(build(doc('', 'தமிழ் மொழி. বাংলা ভাষা। ಕನ್ನಡ')).words, 5);
  assert.equal(build(doc('', 'Plain words, as before: it\'s twenty-one.')).words, 6);
  assert.equal(build(doc('', 'مَرْحَبًا بِكُمْ')).words, 2, 'Arabic with its vowel marks');
});

// ---- characters of several code points (src/editor.js) --------------------------------
ok('the cluster a code unit belongs to', () => {
  const t = 'a क्षि नमस्ते 😀x e\u0301 👨‍👩‍👧 🇮🇳.';
  const want = (plain) => {
    const out = [];
    for (let i = 0; i < t.length;) { const [a, b] = clusterAt(t, i, plain); assert.equal(a, i, 'starts at ' + i); for (let k = a; k < b; k++) assert.deepEqual(clusterAt(t, k, plain), [a, b], 'unit ' + k); out.push(t.slice(a, b)); i = b; }
    return out;
  };
  const seg = want(false);
  assert.ok(seg.includes('😀') && seg.includes('e\u0301') && seg.includes('👨‍👩‍👧') && seg.includes('🇮🇳') && seg.includes('स्ते'), JSON.stringify(seg));
  // a conjunct is one cluster where the browser's Unicode data joins it, else it ends at the
  // virama: either way no cluster ends before a vowel sign or inside a pair
  assert.ok(seg.includes('क्षि') || (seg.includes('क्') && seg.includes('षि')), JSON.stringify(seg));
  for (const c of seg) assert.ok(!/^[\p{M}\u200D\uDC00-\uDFFF]/u.test(c), JSON.stringify(c));
  // without Intl.Segmenter: marks, viramas, joiners and pairs still hold together
  const plain = want(true);
  assert.ok(plain.includes('क्षि') && plain.includes('स्ते') && plain.includes('😀') && plain.includes('e\u0301') && plain.includes('👨‍👩‍👧'), JSON.stringify(plain));
  for (const c of plain) assert.ok(!/^[\p{M}\u200D\uDC00-\uDFFF]/u.test(c), JSON.stringify(c));
  for (const [id, word] of Object.entries(WORDS)) for (const p of [false, true]) {
    for (let i = 0; i < word.length; i++) { const [a, b] = clusterAt(word, i, p); assert.ok(a <= i && i < b && !/^\p{M}/u.test(word.slice(a, b)), id + ' ' + i); }
  }
  assert.deepEqual(clusterAt('abc', 5), [5, 5]);
});
ok('the edge of a cluster before and after a place', () => {
  const t = 'a क्षि b';
  const [a, b] = clusterAt(t, 3);
  assert.equal(clusterEdge(t, 3, -1), a);
  assert.equal(clusterEdge(t, 3, 1), b);
  assert.equal(clusterEdge(t, a, 1), a, 'an edge stays');
  assert.equal(clusterEdge(t, b, -1), b);
  assert.equal(clusterEdge(t, 0, -1), 0);
  assert.equal(clusterEdge(t, t.length, 1), t.length);
  assert.equal(clusterEdge('😀', 1, -1), 0);
  assert.equal(clusterEdge('😀', 1, 1), 2);
  assert.equal(clusterEdge('कि', 1, 1), 2);
  // Latin text has an edge at every place: nothing ever moves there
  const latin = 'Plain \\textbf{text} with $x$.';
  for (let i = 0; i <= latin.length; i++) { assert.equal(clusterEdge(latin, i, -1), i); assert.equal(clusterEdge(latin, i, 1), i); }
});
ok('Backspace takes the last code point, and an emoji whole', () => {
  assert.equal(backspaceUnits('क्षि'), 1);
  assert.equal(backspaceUnits('क्'), 1);
  assert.equal(backspaceUnits('கி'), 1);
  assert.equal(backspaceUnits('e\u0301'), 1);
  assert.equal(backspaceUnits('x'), 1);
  assert.equal(backspaceUnits('𠀀'), 2, 'both halves of a pair');
  assert.equal(backspaceUnits('क𑀓'), 2);
  assert.equal(backspaceUnits('😀'), 2);
  assert.equal(backspaceUnits('👨‍👩‍👧'), 8);
  assert.equal(backspaceUnits('🇮🇳'), 4);
  assert.equal(backspaceUnits('1\uFE0F\u20E3'), 3);
  // what is left is never half a pair
  for (const c of ['क्षि', '𠀀', 'क𑀓', '😀', 'e\u0301']) { const rest = c.slice(0, c.length - backspaceUnits(c)); assert.ok(!/[\uD800-\uDBFF]$/.test(rest), c); }
});

console.log(n + '/' + n + ' passed');
