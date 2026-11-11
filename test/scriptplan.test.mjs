// The set up lines beside what a preamble already holds (src/scripts.js): cases an independent
// review found, where the lines broke a document that compiled or missed their place.
import assert from 'node:assert/strict';
import { scriptNeeds, scriptLines, addScriptSetup } from '../src/scripts.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const doc = (pre, body = 'Text.') => '\\documentclass{article}\n' + pre + (pre ? '\n' : '') + '\\begin{document}\n' + body + '\n\\end{document}\n';
const set = (tex) => addScriptSetup(tex, scriptNeeds(tex));

ok('Arabic joining Rikuy\'s own Chinese line: ctex goes, babel sets both', () => {
  const zh = set(doc('', '你好'));
  assert.ok(zh.includes('\\usepackage[scheme=plain]{ctex}'));
  const both = set(zh.replace('你好', '你好，世界！这是中文 مرحبا'));
  assert.ok(!both.includes('ctex'), both);
  assert.ok(both.includes('\\usepackage[english, bidi=basic]{babel}') && both.includes('\\babelprovide[import, onchar=ids fonts]{arabic}') && both.includes('\\babelfont[chinese]{rm}{FandolSong}'), both);
  assert.deepEqual([...scriptNeeds(both)], []);
});
ok('nothing is offered beside a package or class of another engine', () => {
  for (const pre of ['\\usepackage{xeCJK}\n\\setCJKmainfont{FandolSong}', '\\usepackage{polyglossia}\n\\setmainlanguage{english}', '\\usepackage{ctex}', '\\usepackage{CJKutf8}', '\\usepackage{pstricks}']) {
    const t = doc(pre, 'Hello مرحبا');
    assert.deepEqual(scriptLines(scriptNeeds(t), t), [], pre);
    assert.equal(set(t), null, pre);
  }
  const cls = '\\documentclass{ctexart}\n\\begin{document}\n你好 مرحبا\n\\end{document}\n';
  assert.equal(set(cls), null);
  // Chinese beside LuaLaTeX only code or pdfLaTeX's Arabic: ctex would move the engine under them
  for (const pre of ['\\usepackage{luacode}', '\\directlua{tex.print(1)}', '\\usepackage[LAE,T1]{fontenc}\n\\usepackage[arabic,english]{babel}', '\\usepackage{arabtex}']) assert.equal(set(doc(pre, '你好')), null, pre);
  assert.equal(set('% !TeX program = lualatex\n' + doc('', '你好')), null);
  // while XeLaTeX's own Arabic (polyglossia) takes the ctex line
  assert.ok(set(doc('\\usepackage{polyglossia}\n\\setmainlanguage{english}\n\\setotherlanguage{arabic}', '你好')).includes('{ctex}'));
});
ok('babel however it is loaded', () => {
  const multi = set(doc('\\usepackage[\n  spanish,\n  english\n]{babel}', 'Hola مرحبا'));
  assert.ok(/\\usepackage\[\n {2}spanish,\n {2}english, bidi=basic\]\{babel\}/.test(multi), multi);
  assert.equal((multi.match(/\{babel\}/g) || []).length, 1);
  assert.ok(set(doc('\\RequirePackage[french]{babel}', 'Oui مرحبا')).includes('\\RequirePackage[french, bidi=basic]{babel}'));
  assert.ok(set(doc('\\usepackage{babel}', 'x مرحبا')).includes('\\usepackage[bidi=basic]{babel}'));
  // a list with other packages shares its options with them: left alone, nothing offered
  assert.equal(set(doc('\\usepackage{amsmath,babel}', 'x مرحبا')), null);
  // a commented babel is no babel
  const c = set(doc('% \\usepackage[german]{babel}', 'x مرحبا'));
  assert.ok(c.includes('% \\usepackage[german]{babel}') && c.includes('\\usepackage[english, bidi=basic]{babel}'), c);
});
ok('a commented \\begin{document} is not where the preamble ends', () => {
  const t = '\\documentclass{article}\n% \\begin{document}\n\\usepackage{amsmath}\n\\begin{document}\n你好\n\\end{document}\n';
  const out = set(t);
  assert.ok(out.includes('% \\begin{document}\n\\usepackage{amsmath}\n\\usepackage[scheme=plain]{ctex}'), out);
  assert.ok(out.indexOf('{ctex}') < out.lastIndexOf('\\begin{document}'));
  assert.equal(set('% \\begin{document}\n你好\n'), null);
});
ok('line ends stay as the file has them', () => {
  const t = doc('\\usepackage[spanish]{babel}', 'Hola amigos y amigas مرحبا').replace(/\n/g, '\r\n');
  const out = set(t);
  assert.ok(!/[^\r]\n/.test(out), JSON.stringify(out));
  assert.ok(out.includes('\\babelprovide[import, onchar=ids fonts]{arabic}\r\n\\babelfont'));
});
ok('a title or an author in the preamble is text; a macro there is not', () => {
  assert.deepEqual([...scriptNeeds(doc('\\title{经济增长}\n\\author{A. Writer}', '\\maketitle Latin'))], ['chinese']);
  assert.deepEqual([...scriptNeeds(doc('\\author{محمد}', 'Latin'))], ['arabic']);
  assert.equal(scriptNeeds(doc('\\author{محمد}', 'Latin only, a long English body here.')).arabicMain, false);
  assert.deepEqual([...scriptNeeds(doc('\\newcommand{\\zh}{中文}', 'Latin'))], []);
});
ok('set up twice adds nothing twice', () => {
  for (const body of ['你好', 'Hello مرحبا', 'كل هذا النص عربي تماما']) {
    const once = set(doc('', body));
    assert.deepEqual([...scriptNeeds(once)], [], body);
    assert.equal(set(once), null);
  }
});
ok('crafted preambles stay fast', () => {
  for (const t of ['\\documentclass{article}\n' + '% \\begin{document}\n'.repeat(40000) + '\\begin{document}\n你好\n', doc('\\usepackage['.repeat(60000), '你好 مرحبا'), doc('\\title{'.repeat(60000), '你好')]) {
    const t0 = Date.now();
    scriptNeeds(t); set(t);
    assert.ok(Date.now() - t0 < 1000, (Date.now() - t0) + ' ms');
  }
});

console.log(n + '/' + n + ' passed');
