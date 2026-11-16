// Round 3's objects (R3), their pure parts: fields and document properties as the model draws them
// (src/fields.js), cover pages written, replaced and taken out (src/cover.js), Quick Parts read
// back from a stranger's storage and the packages a part needs (src/quickparts.js), form fields
// written with names of their own (src/forms.js), a picture border's weight and colour (src/picture.js),
// a drawing's points (src/drawing.js), a table's alt text (src/table.js), and what Word gets of
// a table that pandoc's table has no field for (src/wordtable.js). Each edit by its inverse; a
// stranger's text read in bounded time.
import assert from 'node:assert/strict';
import { buildModel } from '../src/model.js';
import { parse } from '../src/parser.js';
import * as F from '../src/fields.js';
import * as C from '../src/cover.js';
import * as Q from '../src/quickparts.js';
import * as FM from '../src/forms.js';
import * as X from '../src/picture.js';
import * as D from '../src/drawing.js';
import * as T from '../src/table.js';
import * as WT from '../src/wordtable.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const apply = (src, edits) => { for (const x of [...edits].sort((a, b) => b.s - a.s)) src = src.slice(0, x.s) + x.t + src.slice(x.e); return src; };
const atoms = (M) => { const out = []; const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.k === 'chip' || x.k === 'form') out.push(x); for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v); } }; walk(M.blocks); return out; };
const W = (pre, body) => '\\documentclass{article}\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';

ok('fields: each is drawn as TeX prints it, the page and the pages left to the layout', () => {
  const M = buildModel({ main: 'paper.tex', files: new Map([['paper.tex', W('\\usepackage{titling}\n\\title{A \\textbf{Big} Title}\n\\author{Ann \\and Bob}\n', '\\section{One}\n\\subsection{Two}\nP \\thepage{} of \\pageref{LastPage}, \\thesection{} \\thesubsection{}, \\jobname, \\thetitle{}, \\theauthor{}, \\thedate{}.')]]) });
  const a = atoms(M).map((x) => [x.text, x.fld || '']);
  assert.deepEqual(a, [['1', 'page'], ['1', 'pages'], ['1', ''], ['1.1', ''], ['paper', ''], ['A Big Title', ''], ['Ann, Bob', ''], [' ', '']]);
  // \thedate with no \date: titling prints nothing, and so does the page
  // a name every object has is no field
  assert.equal(F.fieldText({}, 'constructor', null, () => ''), null);
  assert.equal(F.fieldText({}, 'toString', null, () => ''), null);
  assert.deepEqual(F.propertyTex('title', 'beamer'), { tex: '\\inserttitle', pk: [] });
  assert.deepEqual(F.propertyTex('author', 'memoir'), { tex: '\\theauthor', pk: [] });
  assert.deepEqual(F.propertyTex('date', 'article'), { tex: '\\thedate', pk: ['titling'] });
  assert.ok(F.FIELDS.every((x) => x.tex || x.prop));
});

ok('cover pages: written after \\begin{document}, a new design in the old one\'s place, removed to the bytes of before', () => {
  const src = W('\\title{Report}\n\\author{Ann}\n', '\\maketitle\nText.');
  const P = { title: true, author: true, date: false };
  const r = C.coverEdits(src, 'plain', P, 'article');
  const one = apply(src, r.edits);
  assert.deepEqual(r.packages, ['titling']);
  assert.match(one, /\\begin\{document\}\n\\begin\{titlepage\}\n\\centering\n\\vspace\*\{\\fill\}\n\{\\Huge\\bfseries \\thetitle\{\}\\par\}/);
  assert.match(one, /\{\\large \\today\{\}\\par\}/);
  assert.equal(C.coverDesign(one), 'plain');
  const two = apply(one, C.coverEdits(one, 'sideline', P, 'article').edits);
  assert.equal(C.coverDesign(two), 'sideline');
  assert.equal((two.match(/titlepage/g) || []).length, 2);
  assert.equal(apply(two, C.coverRemoveEdits(two)), src);
  assert.equal(apply(one, C.coverRemoveEdits(one)), src);
  // a document without \title: words to type over, no package
  const bare = W('', 'Text.'), b = C.coverEdits(bare, 'motion', {}, 'article');
  assert.deepEqual(b.packages, []);
  assert.match(apply(bare, b.edits), /\\raggedleft[\s\S]*Document title[\s\S]*Author name/);
  // memoir has the commands itself; beamer has no cover page; a hand written titlepage is the cover
  assert.deepEqual(C.coverEdits(src.replace('{article}', '{memoir}'), 'plain', P, 'memoir').packages, []);
  assert.ok(C.coverEdits(src, 'plain', P, 'beamer').error);
  const hand = W('', '% the cover\n\\begin{titlepage}\nMine % not \\end{titlepage}\n\\end{titlepage}\nText.');
  assert.equal(C.coverDesign(hand), 'own');
  assert.equal(apply(hand, C.coverRemoveEdits(hand)), W('', '% the cover\nText.'));
  // CRLF kept
  const crlf = src.replace(/\n/g, '\r\n');
  assert.ok(!/[^\r]\n/.test(apply(crlf, C.coverEdits(crlf, 'plain', P, 'article').edits)));
  // titlepage drawn as a page of its own, unnumbered, the text after it on page 1
  const M = buildModel({ main: 'm.tex', files: new Map([['m.tex', one]]) });
  const items = M.blocks.flatMap((b) => b.items.map((i) => i.type + (i.mark ? JSON.stringify(i.mark) : '')));
  assert.deepEqual(items.slice(0, 3), ['pagebreak', 'pagemark{"thisStyle":"empty"}', 'pagemark{"page":1}']);
  assert.ok(items.includes('pagemark{"page":1}', 4));
});

ok('Quick Parts: a stranger\'s storage read with caps, names unique; a part\'s packages; whole groups', () => {
  assert.deepEqual(Q.readParts(null), []);
  assert.deepEqual(Q.readParts([{ name: 'a', tex: 'x' }, { name: 'a', tex: 'y' }, { name: 3, tex: 'z' }, { name: 'b', tex: 'x'.repeat(70000) }, { name: 'c\u0000d', tex: '\\textbf{c}' }, null]), [{ name: 'a', tex: 'x' }, { name: 'c d', tex: '\\textbf{c}' }]);
  assert.equal(Q.readParts(Array.from({ length: 300 }, (_, i) => ({ name: 'p' + i, tex: 'x' }))).length, Q.MAX_PARTS);
  assert.deepEqual(Q.partPackages('\\textcolor{red}{x} \\begin{align}a\\end{align} \\href{u}{v} \\toprule'), ['xcolor', 'amsmath', 'hyperref', 'booktabs']);
  assert.deepEqual(Q.partPackages('\\thetitle', 'memoir'), []);
  assert.deepEqual(Q.partPackages('\\constructor \\toString'), []);
  assert.equal(Q.partName('\\textbf{Kind regards}, Ann'), 'Kind regards , Ann');
  assert.ok(Q.partIsBlock('One.\n\nTwo.') && Q.partIsBlock('\\begin{itemize}\\item x\\end{itemize}') && !Q.partIsBlock('Kind \\textbf{regards}'));
  const s = 'Hello \\textcolor{red}{world}. And \\textbf{bold \\emph{x} y} z';
  const g = (a, b) => { const r = Q.wholeGroups(s, s.indexOf(a), s.indexOf(b) + b.length); return r && s.slice(r[0], r[1]); };
  assert.equal(g('Hello', 'wor'), 'Hello \\textcolor{red}{world}');
  assert.equal(g('ld}.', 'And'), '\\textcolor{red}{world}. And');
  assert.equal(g('bold', 'emph{x'), 'bold \\emph{x}');
  assert.equal(Q.wholeGroups('a $x + y$ b', 4, 9), null);
  // bounded on a stranger's text: a long unclosed run
  const t0 = Date.now();
  const big = '{'.repeat(200000) + 'x';
  Q.wholeGroups(big, 100000, 200001);
  assert.ok(Date.now() - t0 < 1500, 'wholeGroups took ' + (Date.now() - t0) + ' ms');
});

ok('form fields: Word\'s controls as hyperref writes them, names of their own, labels escaped; the page reads them', () => {
  const esc = (t) => t.replace(/[\\{}$&#^_%~]/g, (x) => '\\' + x);
  assert.equal(FM.controlTex('text', '', { escape: esc }), '\\TextField[name=text1, width=4cm]{}');
  assert.equal(FM.controlTex('text', '\\TextField[name=text1]{}\\TextField[name={text2}]{}', { label: 'Your name & age', escape: esc }), '\\TextField[name=text3, width=4cm]{Your name \\& age}');
  assert.equal(FM.controlTex('check', '', { label: 'Agree', escape: esc }), '\\CheckBox[name=check1]{Agree}');
  assert.equal(FM.controlTex('combo', '', { items: ['A, B', 'C=D', 'E'], escape: esc }), '\\ChoiceMenu[combo, name=combo1, width=4cm]{}{A B,C D,E}');
  assert.match(FM.controlTex('date', '', { escape: esc }), /^\\TextField\[name=date1, width=3cm, format=\{AFDate_FormatEx\("dd\/mm\/yyyy"\);\}/);
  assert.equal(FM.readField('CheckBox', 'name=c, checked').checked, true);
  assert.equal(FM.readField('ChoiceMenu', 'combo,name=x').kind, 'combo');
  assert.equal(FM.readField('TextField', 'name=d, format={AFDate_FormatEx("dd/mm/yyyy");}').kind, 'date');
  const M = buildModel({ main: 'm.tex', files: new Map([['m.tex', W('\\usepackage{hyperref}\n', '\\begin{Form}\nName \\TextField[name=t, width=2cm]{Who} \\CheckBox[name=c,checked]{Ok} \\ChoiceMenu[name=l]{}{One,Two}\n\\end{Form}')]]) });
  const f = atoms(M).filter((x) => x.k === 'form').map((x) => [x.kind, x.label, Math.round(x.wpt || 0), x.value, x.checked]);
  assert.deepEqual(f, [['text', 'Who', 57, '', false], ['check', 'Ok', 0, '', true], ['list', '', 86, 'One', false]]);
  // names read in bounded time from a stranger's text
  const t0 = Date.now();
  FM.fieldNames('\\TextField['.repeat(100000));
  assert.ok(Date.now() - t0 < 1000);
});

ok('a picture border\'s weight and colour: written, changed, taken off, read back; Reset and Off take the whole group', () => {
  const run = (src, f) => { const P = X.findPicture(src, parse(src), src.indexOf('\\includegraphics')); return apply(src, f(src, P).edits); };
  const s0 = 'A \\includegraphics[width=2cm]{a.png} b';
  const s1 = run(s0, (s, P) => X.borderSet(s, P, { weight: '1.5pt' }));
  assert.equal(s1, 'A {\\setlength{\\fboxsep}{0pt}\\setlength{\\fboxrule}{1.5pt}\\fbox{\\includegraphics[width=2cm]{a.png}}} b');
  const s2 = run(s1, (s, P) => X.borderSet(s, P, { color: { model: null, value: 'red' } }));
  assert.equal(s2, 'A {\\setlength{\\fboxsep}{0pt}\\setlength{\\fboxrule}{1.5pt}\\color{red}\\fbox{\\includegraphics[width=2cm]{a.png}}} b');
  const P2 = X.findPicture(s2, parse(s2), s2.indexOf('\\includegraphics'));
  assert.deepEqual(X.borderStyle(s2, P2), { weight: '1.5pt', color: { model: null, value: 'red' } });
  assert.ok(X.bordered(P2));
  const s3 = run(s2, (s, P) => X.borderSet(s, P, { color: { model: 'HTML', value: '1F4E79' } }));
  assert.match(s3, /\\color\[HTML\]\{1F4E79\}\\fbox/);
  assert.equal(run(run(s3, (s, P) => X.borderSet(s, P, { weight: null })), (s, P) => X.borderSet(s, P, { color: null })), 'A {\\setlength{\\fboxsep}{0pt}\\fbox{\\includegraphics[width=2cm]{a.png}}} b');
  assert.equal(run(s3, (s, P) => X.border(s, P, false)), s0);
  assert.equal(run(s3, (s, P) => X.reset(s, P, false)), s0);
  // hand written: the weight and a colour in another order, in their group
  const h = 'A {\\color{blue}\\setlength{\\fboxsep}{0pt}\\setlength\\fboxrule{2pt}\\fbox{\\includegraphics{a.png}}} b';
  const Ph = X.findPicture(h, parse(h), h.indexOf('\\includegraphics'));
  assert.deepEqual(X.borderStyle(h, Ph), { weight: '2pt', color: { model: null, value: 'blue' } });
  assert.equal(run(h, (s, P) => X.border(s, P, false)), 'A \\includegraphics{a.png} b');
  // a bare \fbox (with its gap) given a weight: a group round it
  assert.equal(run('\\fbox{\\includegraphics{a.png}}', (s, P) => X.borderSet(s, P, { weight: '1pt' })), '{\\setlength{\\fboxrule}{1pt}\\fbox{\\includegraphics{a.png}}}');
});

ok('a drawing\'s points: each coordinate with where its text is, written back moved', () => {
  for (const [id] of D.SHAPES) {
    const t = D.shapeTex(id), P = D.tikzPoints(t);
    assert.ok(P && P.length >= 2, id);
    for (const p of P) assert.ok(p.e > p.s && !/[()]/.test(t.slice(p.s, p.e)), id);
  }
  const t = D.shapeTex('rectangle'), P = D.tikzPoints(t);
  const moved = t.slice(0, P[1].s) + D.pointText(P[1], 4.123, 1.5) + t.slice(P[1].e);
  assert.ok(moved.includes('(0,0) rectangle (4.12,1.5)') && D.readTikz(moved));
  const c = D.tikzPoints(D.shapeTex('circle'));
  assert.equal(D.pointText(c[1], 4, 5), '5');
  const o = D.tikzPoints(D.shapeTex('oval'));
  assert.equal(D.pointText(o[1], 0, 3), '1.5 and 2');
  // options and comments are no coordinates; a picture the page does not draw has none
  assert.deepEqual(D.tikzPoints('\\begin{tikzpicture}[scale=2]\n% (9,9)\n\\draw[->] (0,0) -- (1,2);\n\\end{tikzpicture}').map((p) => [p.x, p.y]), [[0, 0], [1, 2]]);
  assert.equal(D.tikzPoints('\\begin{tikzpicture}\\node at (0,0) {x};\\end{tikzpicture}'), null);
});

ok('a table\'s alt text: a "% alt:" line before it, read back, changed, taken off to the bytes of before', () => {
  const s = 'x\n\\begin{table}\n\\centering\n  \\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{table}\n';
  const at = (t) => T.tableAt(t, t.indexOf('a &'), 0, t.length);
  const one = apply(s, T.setTableAlt(s, at(s), 'Prices: 100% & more').edits);
  assert.ok(one.includes('\\centering\n  % alt: Prices: 100% & more\n  \\begin{tabular}'));
  assert.equal(T.tableAlt(one, at(one)).text, 'Prices: 100% & more');
  assert.equal(apply(one, T.setTableAlt(one, at(one), '').edits), s);
  const crlf = s.replace(/\n/g, '\r\n'), c1 = apply(crlf, T.setTableAlt(crlf, at(crlf), 'A').edits);
  assert.equal(T.tableAlt(c1, at(c1)).text, 'A');
  assert.equal(apply(c1, T.setTableAlt(c1, at(c1), 'B').edits), crlf.replace('  \\begin{tabular}', '  % alt: B\r\n  \\begin{tabular}'));
});

ok('Word: a table\'s shading, turned words and alt text written into the cells pandoc wrote, in Word\'s order', () => {
  const cell = (kv) => [['', [], kv], { t: 'AlignDefault' }, 1, 1, [{ t: 'Plain', c: [] }]];
  const doc = { blocks: [{ t: 'Table', c: [['', [], [['rk-alt', 'A "quoted" <alt>']]], [null, []], [], [['', [], []], [[['', [], []], [cell([['rk-shd', 'FFFF00']]), cell([['rk-rot', '90']])]]]], [[['', [], []], 0, [], [[['', [], []], [cell([]), cell([['rk-shd', 'D9D9D9'], ['rk-rot', '270']])]]]]], [['', [], []], []]] }] };
  const X2 = WT.tableExtras(doc);
  assert.equal(X2.length, 1);
  const tc = (pr) => '<w:tc>' + pr + '<w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc>';
  const xml = '<w:body><w:tbl><w:tblPr><w:tblStyle w:val="Table" /></w:tblPr><w:tr>' + tc('<w:tcPr><w:tcW w:w="0" w:type="auto" /></w:tcPr>') + tc('') + '</w:tr><w:tr>' + tc('<w:tcPr><w:vAlign w:val="top" /></w:tcPr>') + tc('<w:tcPr><w:vAlign w:val="top" /></w:tcPr>') + '</w:tr></w:tbl></w:body>';
  const out = WT.applyTableExtras(xml, X2);
  assert.ok(out.includes('<w:tblDescription w:val="A &quot;quoted&quot; &lt;alt&gt;" /></w:tblPr>'));
  assert.ok(out.includes('<w:tcPr><w:tcW w:w="0" w:type="auto" /><w:shd w:val="clear" w:color="auto" w:fill="FFFF00" /></w:tcPr>'));
  assert.ok(out.includes('<w:tcPr><w:textDirection w:val="btLr" /></w:tcPr>'));
  assert.ok(out.includes('<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9" /><w:textDirection w:val="tbRl" /><w:vAlign w:val="top" /></w:tcPr>'));
  // nothing to write: the same bytes; a document with no extras gives none
  assert.equal(WT.applyTableExtras(xml, []), xml);
  assert.deepEqual(WT.tableExtras({ blocks: [{ t: 'Table', c: [['', [], []], [null, []], [], [['', [], []], []], [], [['', [], []], []]] }] }), []);
});

ok('a stranger\'s document read in bounded time: thousands of fields and form fields, long options, a cover page after many comments', () => {
  const body = ('\\thepage{} \\pageref{LastPage} \\thesection{} \\TextField[name=x, width=4cm, ' + 'a='.repeat(300) + ']{L} \\ChoiceMenu[combo]{}{' + 'a,'.repeat(500) + '}\n\n').repeat(400);
  const t0 = Date.now();
  buildModel({ main: 'm.tex', files: new Map([['m.tex', W('', body)]]) });
  assert.ok(Date.now() - t0 < 4000, 'model ' + (Date.now() - t0) + ' ms');
  const t1 = Date.now();
  C.coverAt(W('', '%x\n'.repeat(100000) + '\\begin{titlepage}' + '%'.repeat(200000)));
  T.tableAlt('x\n'.repeat(10) + ' '.repeat(300000) + '\\begin{tabular}{l}a\\end{tabular}', { s: 300020 });
  assert.ok(Date.now() - t1 < 1000, 'cover and alt ' + (Date.now() - t1) + ' ms');
  // a field's options cannot reach an object's prototype
  assert.equal(FM.readField('TextField', '__proto__=x, constructor=y').kind, 'text');
  assert.equal({}.x, undefined);
});

console.log('objects: ' + n + ' groups passed');
