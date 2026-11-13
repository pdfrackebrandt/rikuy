// Paragraphs as edits of the source (src/parasrc.js), on strings, with the page's model saying
// where each paragraph is (src/model.js, item.ps and pe): alignment in, changed, out and back
// byte for byte, split out of an environment that holds others and joined again; hand written
// forms ({\centering ...\par}, flushright, a declaration at a minipage's start) read and taken
// off; line spacing for a paragraph (setspace's environments) and the document (\onehalfspacing,
// \setstretch, setspace's options, \linespread kept as written, memoir's own); indents by
// adjustwidth; \noindent and \hangindent; the space before and after; keep with next, page break
// before, samepage; shading and borders as tcolorbox and rules; the document's paragraph spacing
// (parskip, KOMA's option); widows and orphans; what the model draws for each; a stranger's text
// read in bounded time.
import assert from 'node:assert/strict';
import * as P from '../src/parasrc.js';
import { buildModel } from '../src/model.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const D = (body, pre = '', cls = '\\documentclass{article}') => cls + '\n' + pre + '\\begin{document}\n' + body + '\n\\end{document}\n';
const model = (src) => buildModel({ files: new Map([['main.tex', src]]), main: 'main.tex' });
// the model's paragraph that holds word w, and its unit
function at(src, w) {
  const M = model(src), p = src.indexOf(w, src.indexOf('\\begin{document}'));
  for (const b of M.blocks) for (const it of b.items) if (it.ps != null && it.ps <= p && p < it.pe) return { it, b, M };
  throw new Error('no paragraph holds ' + w);
}
const U = (src, w) => { const { it, b } = at(src, w); return P.unitOf(src, it.ps, it.pe, b.s, b.e, it.vs != null ? { vs: it.vs, ve: it.ve } : null); };
const body = (src) => src.slice(src.indexOf('\\begin{document}') + 17, src.lastIndexOf('\n\\end{document}'));
const ed = (src, e) => { assert.ok(Array.isArray(e), e && e.why); return applyEdits(src, e); };
const ALIGN = (src, w, to) => ed(src, P.alignEdits(src, U(src, w), to, { inherit: at(src, w).it.align || null }));

const PLAIN = D('First paragraph.\n\nSecond paragraph of text.\n\nThird.');

ok('alignment: each in, changed, and Justify gives the bytes back', () => {
  for (const [to, env] of [['center', 'center'], ['right', 'flushright'], ['left', 'flushleft']]) {
    const t = ALIGN(PLAIN, 'Second', to);
    assert.equal(body(t), 'First paragraph.\n\n\\begin{' + env + '}\nSecond paragraph of text.\n\\end{' + env + '}\n\nThird.');
    assert.equal(P.alignOf(t, U(t, 'Second')).v, to);
    assert.equal(at(t, 'Second').it.align, to, 'the model draws it ' + to);
    assert.equal(ALIGN(t, 'Second', 'justify'), PLAIN);
  }
  const c = ALIGN(PLAIN, 'Second', 'center');
  assert.equal(body(ALIGN(c, 'Second', 'right')), 'First paragraph.\n\n\\begin{flushright}\nSecond paragraph of text.\n\\end{flushright}\n\nThird.');
});

ok('a paragraph in an environment of several is split out, and joined again', () => {
  const C = D('\\begin{center}\nA\n\nB\n\nC\n\\end{center}');
  const l = ALIGN(C, 'B', 'left');
  assert.equal(body(l), '\\begin{center}\nA\n\\end{center}\n\n\\begin{flushleft}\nB\n\\end{flushleft}\n\n\\begin{center}\nC\n\\end{center}');
  assert.equal(ALIGN(l, 'B', 'center'), C, 'centred again: one environment, the bytes of before');
  const j = ALIGN(C, 'B', 'justify');
  assert.equal(body(j), '\\begin{center}\nA\n\\end{center}\n\nB\n\n\\begin{center}\nC\n\\end{center}');
  assert.equal(ALIGN(j, 'B', 'center'), C);
  // the first and the last of them
  assert.equal(body(ALIGN(C, 'A', 'justify')), 'A\n\n\\begin{center}\nB\n\nC\n\\end{center}');
  assert.equal(body(ALIGN(C, 'C', 'justify')), '\\begin{center}\nA\n\nB\n\\end{center}\n\nC');
  // every paragraph of the model in a center environment is unindented, as \centering sets \parindent to 0
  const M = model(C);
  assert.ok(M.blocks[0].items.every((it) => it.indent === false && it.align === 'center'));
});

ok('hand written forms: {\\centering ...\\par}, a declaration scoped by an environment, flushright', () => {
  const g = D('{\\centering Group text.\\par}');
  assert.equal(at(g, 'Group').it.align, 'center', 'the model draws the group centred');
  assert.equal(body(ALIGN(g, 'Group', 'justify')), 'Group text.');
  assert.equal(body(ALIGN(g, 'Group', 'right')), '{\\raggedleft Group text.\\par}');
  // without \par the paragraph ends after the group, which TeX then does not centre
  const g2 = D('{\\centering Group text.}');
  assert.equal(at(g2, 'Group').it.align, null);
  const m = D('\\begin{minipage}{0.5\\linewidth}\n\\centering\nMini text.\n\\end{minipage}');
  assert.equal(P.alignOf(m, U(m, 'Mini')).from, 'decl');
  assert.equal(body(ALIGN(m, 'Mini', 'justify')), '\\begin{minipage}{0.5\\linewidth}\nMini text.\n\\end{minipage}');
  assert.equal(body(ALIGN(m, 'Mini', 'right')), '\\begin{minipage}{0.5\\linewidth}\n\\raggedleft\nMini text.\n\\end{minipage}');
  const r = D('Before.\n\n  \\begin{flushright}\n  Signed, me.\n  \\end{flushright}\n\nAfter.');
  assert.equal(body(ALIGN(r, 'Signed', 'justify')), 'Before.\n\n  Signed, me.\n\nAfter.');
});

ok('what goes with the paragraph stays with it; what reaches further stays outside', () => {
  const t = D('A.\n\n\\noindent Indentless.\n\nB.');
  const c = ALIGN(t, 'Indentless', 'center');
  assert.equal(body(c), 'A.\n\n\\begin{center}\n\\noindent Indentless.\n\\end{center}\n\nB.');
  assert.equal(ALIGN(c, 'Indentless', 'justify'), t);
  const d = D('A.\n\n\\onehalfspacing\n\\label{x}\nBody text here.\n\\label{y}\n% a note\n\\selectlanguage{english}\n\nB.');
  assert.equal(body(ALIGN(d, 'Body', 'center')), 'A.\n\n\\onehalfspacing\n\\label{x}\n\\begin{center}\nBody text here.\n\\label{y}\n% a note\n\\end{center}\n\\selectlanguage{english}\n\nB.');
  // a comment at the end of the last line: the environment ends after it, never inside it
  const k = D('A.\n\nText % a remark\n\nB.');
  assert.equal(body(ALIGN(k, 'Text', 'right')), 'A.\n\n\\begin{flushright}\nText % a remark\n\\end{flushright}\n\nB.');
});

ok('CRLF files stay CRLF', () => {
  const c = PLAIN.replace(/\n/g, '\r\n');
  const t = ALIGN(c, 'Second', 'center');
  assert.ok(t.includes('\r\n\\begin{center}\r\nSecond paragraph of text.\r\n\\end{center}\r\n'));
  assert.ok(!/[^\r]\n/.test(t));
  assert.equal(ALIGN(t, 'Second', 'justify'), c);
});

ok('nothing goes around a paragraph inside an argument or a group', () => {
  const t = D('\\parbox{5cm}{One.\n\nTwo.}');
  const M = model(t);
  const it = M.blocks.flatMap((b) => b.items.map((x) => [x, b])).find(([x]) => x.ps != null && t.slice(x.ps, x.pe).includes('Two'));
  if (it) {
    const u = P.unitOf(t, it[0].ps, it[0].pe, it[1].s, it[1].e);
    assert.ok(u.inArg || u.s <= t.indexOf('\\parbox'), 'either the whole \\parbox is the paragraph or the unit knows it is in an argument');
    if (u.inArg) assert.ok(P.alignEdits(t, u, 'center').why);
  }
});

ok('line spacing of a paragraph: setspace\'s environments, changed, and the document\'s own takes it off', () => {
  const K = P.spacingKind();
  const t1 = ed(PLAIN, P.layerEdits(PLAIN, U(PLAIN, 'Second'), K, { lines: 1.5 }, { inherit: { lines: 1 } }));
  assert.equal(body(t1), 'First paragraph.\n\n\\begin{onehalfspace}\nSecond paragraph of text.\n\\end{onehalfspace}\n\nThird.');
  assert.equal(at(t1, 'Second').it.spread, 1.25, 'the model draws \\onehalfspacing\'s stretch at 10pt');
  const t2 = ed(t1, P.layerEdits(t1, U(t1, 'Second'), K, { multiple: 1.15 }, { inherit: { lines: 1 } }));
  assert.equal(body(t2), 'First paragraph.\n\n\\begin{spacing}{1.15}\nSecond paragraph of text.\n\\end{spacing}\n\nThird.');
  assert.equal(at(t2, 'Second').it.spread, 1.15);
  const t3 = ed(t2, P.layerEdits(t2, U(t2, 'Second'), K, { lines: 2 }, { inherit: { lines: 1 } }));
  assert.ok(body(t3).includes('\\begin{doublespace}'));
  assert.equal(ed(t3, P.layerEdits(t3, U(t3, 'Second'), K, { lines: 1 }, { inherit: { lines: 1 } })), PLAIN);
  // the document is double spaced: single for this paragraph is an environment of its own
  const dd = D('A.\n\nB.', '\\usepackage{setspace}\n\\doublespacing\n');
  assert.ok(body(ed(dd, P.layerEdits(dd, U(dd, 'B.'), K, { lines: 1 }, { inherit: { lines: 2 } }))).includes('\\begin{singlespace}\nB.\n\\end{singlespace}'));
  // memoir's
  const KM = P.spacingKind('memoir');
  const mm = D('A.\n\nB.', '', '\\documentclass{memoir}');
  assert.ok(body(ed(mm, P.layerEdits(mm, U(mm, 'B.'), KM, { lines: 1.5 }))).includes('\\begin{OnehalfSpace}\nB.\n\\end{OnehalfSpace}'));
});

ok('line spacing of the document: written once, changed in place, kept in the form written, taken off for single', () => {
  const d = D('X');
  let r = P.docSpacingEdits(d, { lines: 1.5 });
  assert.equal(r.needs, 'setspace');
  const d1 = ed(d, r.edits);
  assert.equal(d1, '\\documentclass{article}\n\\onehalfspacing\n\\begin{document}\nX\n\\end{document}\n');
  assert.deepEqual(P.docSpacing(d1).v, { lines: 1.5 });
  assert.equal(ed(d1, P.docSpacingEdits(d1, { multiple: 1.15 }).edits), d.replace('\\begin{document}', '\\setstretch{1.15}\n\\begin{document}'));
  assert.equal(ed(d1, P.docSpacingEdits(d1, { lines: 1 }).edits), d, 'single: the line goes, the bytes of before');
  // hand written forms
  const ls = D('X', '\\linespread{1.3}\n');
  assert.deepEqual(P.docSpacing(ls).v, { multiple: 1.3 });
  assert.equal(ed(ls, P.docSpacingEdits(ls, { multiple: 1.15 }).edits), D('X', '\\linespread{1.15}\n'));
  const rn = D('X', '\\renewcommand{\\baselinestretch}{1.5}\n');
  assert.deepEqual(P.docSpacing(rn).v, { multiple: 1.5 });
  assert.equal(ed(rn, P.docSpacingEdits(rn, { lines: 1 }).edits), D('X'));
  const op = D('X', '\\usepackage[onehalfspacing]{setspace}\n');
  assert.deepEqual(P.docSpacing(op).v, { lines: 1.5 });
  assert.equal(ed(op, P.docSpacingEdits(op, { lines: 2 }).edits), D('X', '\\usepackage[doublespacing]{setspace}\n'));
  assert.equal(ed(op, P.docSpacingEdits(op, { lines: 1 }).edits), D('X', '\\usepackage{setspace}\n'));
  const bd = '\\documentclass{article}\n\\usepackage{setspace}\n\\begin{document}\n\\doublespacing\nX\n\\end{document}\n';
  assert.deepEqual(P.docSpacing(bd).v, { lines: 2 }, 'at the body\'s start');
  assert.equal(model(bd).blocks[0].items[0].spread, 1.667, 'and the model draws the body\'s declaration');
  // commented out: nothing
  assert.equal(P.docSpacing(D('X', '% \\onehalfspacing\n')), null);
  // memoir and beamer
  assert.equal(ed(D('X', '', '\\documentclass{memoir}'), P.docSpacingEdits(D('X', '', '\\documentclass{memoir}'), { lines: 1.5 }).edits), D('X', '\\OnehalfSpacing\n', '\\documentclass{memoir}'));
  assert.ok(P.docSpacingEdits(D('X', '', '\\documentclass{beamer}'), { lines: 1.5 }).why);
});

ok('indents: adjustwidth to Word\'s next step (1.27 cm) and back, the model\'s margins', () => {
  const t1 = ed(PLAIN, P.indentEdits(PLAIN, U(PLAIN, 'Second'), P.stepIndent(0, 1), 0));
  assert.equal(body(t1), 'First paragraph.\n\n\\begin{adjustwidth}{1.27cm}{}\nSecond paragraph of text.\n\\end{adjustwidth}\n\nThird.');
  assert.equal(Math.round(at(t1, 'Second').it.mx[0] * 10), Math.round(1.27 * P.PT.cm * 10));
  const i = P.indentOf(t1, U(t1, 'Second'));
  const t2 = ed(t1, P.indentEdits(t1, U(t1, 'Second'), P.stepIndent(i.l, 1), i.r));
  assert.ok(body(t2).includes('\\begin{adjustwidth}{2.54cm}{}'));
  assert.equal(ed(t1, P.indentEdits(t1, U(t1, 'Second'), P.stepIndent(i.l, -1), i.r)), PLAIN);
  // a hand written length in another unit steps to the next of Word's steps
  assert.equal(Math.round(P.stepIndent(P.lenPt('2em'), 1) / P.PT.cm * 100), 127);
  assert.equal(Math.round(P.stepIndent(P.lenPt('3cm'), -1) / P.PT.cm * 100), 254);
  assert.equal(P.stepIndent(P.lenPt('1cm'), -1), 0);
  const both = ed(PLAIN, P.indentEdits(PLAIN, U(PLAIN, 'Second'), 0.5 * P.PT.cm, 2 * P.PT.cm));
  assert.ok(body(both).includes('\\begin{adjustwidth}{0.5cm}{2cm}'));
});

ok('the first line: \\noindent, a hanging indent, back to LaTeX\'s own', () => {
  const h = ed(PLAIN, P.firstLineEdits(PLAIN, U(PLAIN, 'Second'), 'hanging', '1cm', { indented: true }));
  assert.equal(body(h), 'First paragraph.\n\n\\noindent\\hangindent=1cm Second paragraph of text.\n\nThird.');
  const it = at(h, 'Second').it;
  assert.equal(it.indent, false);
  assert.equal(Math.round(it.hang * 100), Math.round(P.PT.cm * 100), 'the model draws the hang');
  assert.deepEqual(P.firstLineOf(U(h, 'Second'), false), { special: 'hanging', by: '1cm' });
  assert.equal(ed(h, P.firstLineEdits(h, U(h, 'Second'), 'first', null, { indented: false })), PLAIN);
  const no = ed(PLAIN, P.firstLineEdits(PLAIN, U(PLAIN, 'Second'), 'none', null, { indented: true }));
  assert.equal(body(no), 'First paragraph.\n\n\\noindent Second paragraph of text.\n\nThird.');
  // TeX's own form, \hangafter too: read, and the text after it is no text of the page
  const tx = D('A.\n\n\\hangindent=2cm\\hangafter=1 Hung text.\n\nB.');
  assert.equal(at(tx, 'Hung').it.inl.map((x) => x.t || '').join(''), 'Hung text.');
  const tp = D('\\parindent=0pt After.');
  assert.equal(at(tp, 'After').it.inl.map((x) => x.t || '').join(''), 'After.');
});

ok('space before and after, keep with next, page break before, keep lines together', () => {
  const b = ed(PLAIN, P.spaceEdits(PLAIN, U(PLAIN, 'Second'), 'before', 12));
  assert.equal(body(b), 'First paragraph.\n\n\\vspace{12pt}\nSecond paragraph of text.\n\nThird.');
  const a = ed(b, P.spaceEdits(b, U(b, 'Second'), 'after', 6));
  assert.equal(body(a), 'First paragraph.\n\n\\vspace{12pt}\nSecond paragraph of text.\n\\vspace{6pt}\n\nThird.');
  assert.equal(P.spaceOf(U(a, 'Second'), 'before').pt, 12);
  assert.equal(P.spaceOf(U(a, 'Second'), 'after').pt, 6);
  assert.equal(body(ed(a, P.spaceEdits(a, U(a, 'Second'), 'before', 18))).split('\n')[2], '\\vspace{18pt}');
  assert.equal(ed(ed(a, P.spaceEdits(a, U(a, 'Second'), 'after', 0)), P.spaceEdits(b, U(b, 'Second'), 'before', 0)), PLAIN);
  // the lines go with the paragraph when it is aligned, and still read as its own
  const c = ALIGN(a, 'Second', 'center');
  assert.equal(P.spaceOf(U(c, 'Second'), 'before').pt, 12);
  assert.equal(P.spaceOf(U(c, 'Second'), 'after').pt, 6);
  // \medskip by hand
  assert.equal(P.spaceOf(U(D('A.\n\n\\medskip\nB here.'), 'B here'), 'before').pt, 6);
  const k = ed(PLAIN, P.flagEdits(PLAIN, U(PLAIN, 'Second'), 'keep', true));
  assert.equal(body(k), 'First paragraph.\n\nSecond paragraph of text.\n\\nopagebreak\n\nThird.');
  assert.ok(at(k, 'Second').it.keepNext, 'the page keeps it with the next');
  assert.ok(P.flagOf(U(k, 'Second'), 'keep'));
  assert.equal(ed(k, P.flagEdits(k, U(k, 'Second'), 'keep', false)), PLAIN);
  const pb = ed(PLAIN, P.flagEdits(PLAIN, U(PLAIN, 'Second'), 'break', true));
  assert.equal(body(pb), 'First paragraph.\n\n\\clearpage\nSecond paragraph of text.\n\nThird.');
  assert.equal(ed(pb, P.flagEdits(pb, U(pb, 'Second'), 'break', false)), PLAIN);
  assert.ok(P.flagOf(U(D('A.\n\n\\newpage\nB here.'), 'B here'), 'break'), 'a hand written \\newpage');
  const sp = ed(PLAIN, P.layerEdits(PLAIN, U(PLAIN, 'Second'), P.SAMEPAGE, true));
  assert.ok(body(sp).includes('\\begin{samepage}\nSecond paragraph of text.\n\\end{samepage}'));
  assert.ok(at(sp, 'Second').it.keepLines);
  assert.equal(ed(sp, P.layerEdits(sp, U(sp, 'Second'), P.SAMEPAGE, null)), PLAIN);
});

ok('shading and borders: tcolorbox, its options changed in place, rules above and below', () => {
  const s1 = ed(PLAIN, P.boxEdits(PLAIN, U(PLAIN, 'Second'), 'yellow!20', false));
  assert.equal(body(s1), 'First paragraph.\n\n\\begin{tcolorbox}[colback=yellow!20,colframe=yellow!20,boxrule=0pt,sharp corners]\nSecond paragraph of text.\n\\end{tcolorbox}\n\nThird.');
  const it = at(s1, 'Second').it;
  assert.equal(it.box.bg, 'yellow!20');
  assert.equal(it.box.rule, 0);
  const s2 = ed(s1, P.boxEdits(s1, U(s1, 'Second'), 'yellow!20', true));
  assert.ok(body(s2).includes('[colback=yellow!20,colframe=black,boxrule=0.4pt,sharp corners]'));
  assert.equal(ed(s1, P.boxEdits(s1, U(s1, 'Second'), null, false)), PLAIN);
  // a box of a person's own keeps their options
  const own = D('A.\n\n\\begin{tcolorbox}[title=Note,colback=blue!5]\nBoxed.\n\\end{tcolorbox}\n\nB.');
  const o2 = ed(own, P.boxEdits(own, U(own, 'Boxed'), null, false));
  assert.ok(body(o2).includes('\\begin{tcolorbox}[title=Note,colback=white,colframe=white,boxrule=0pt]'), body(o2));
  const r = ed(PLAIN, P.ruleEdits(PLAIN, U(PLAIN, 'Second'), 'after', true));
  assert.equal(body(r), 'First paragraph.\n\nSecond paragraph of text.\n\\par\\noindent\\rule{\\linewidth}{0.4pt}\n\nThird.');
  assert.ok(P.ruleOf(U(r, 'Second'), 'after'));
  assert.equal(ed(r, P.ruleEdits(r, U(r, 'Second'), 'after', false)), PLAIN);
  const tp = ed(PLAIN, P.ruleEdits(PLAIN, U(PLAIN, 'Second'), 'before', true));
  assert.equal(body(tp), 'First paragraph.\n\n\\noindent\\rule{\\linewidth}{0.4pt}\\par\nSecond paragraph of text.\n\nThird.');
  assert.equal(ed(tp, P.ruleEdits(tp, U(tp, 'Second'), 'before', false)), PLAIN);
  assert.equal(body(ed(PLAIN, P.hrEdits(PLAIN, U(PLAIN, 'Second')))), 'First paragraph.\n\nSecond paragraph of text.\n\n\\noindent\\rule{\\linewidth}{0.4pt}\n\nThird.');
});

ok('the document\'s paragraph spacing: parskip, its skip, KOMA\'s option, memoir\'s, none', () => {
  const d = D('X');
  const r = P.docParskipEdits(d, 6);
  assert.deepEqual(r.needs, { parskip: 'skip=6pt' });
  const p1 = D('X', '\\usepackage[skip=6pt]{parskip}\n');
  assert.equal(P.docParskip(p1).skip, 6);
  assert.equal(model(p1).opts.parskip * 10, 6, 'the model reads the skip (in em of 10pt)');
  assert.equal(ed(p1, P.docParskipEdits(p1, 4).edits), D('X', '\\usepackage[skip=4pt]{parskip}\n'));
  assert.equal(ed(p1, P.docParskipEdits(p1, 'open').edits), D('X', '\\usepackage{parskip}\n'));
  assert.equal(ed(p1, P.docParskipEdits(p1, null).edits), d);
  const sl = D('X', '\\setlength{\\parskip}{1em}\n');
  assert.equal(P.docParskip(sl).skip, 10);
  assert.equal(ed(sl, P.docParskipEdits(sl, 6).edits), D('X', '\\setlength{\\parskip}{6pt}\n'));
  assert.equal(ed(sl, P.docParskipEdits(sl, null).edits), d);
  const k = D('X', '', '\\documentclass{scrartcl}');
  assert.equal(ed(k, P.docParskipEdits(k, 6).edits), D('X', '', '\\documentclass[parskip=half]{scrartcl}'));
  const kh = D('X', '', '\\documentclass[parskip=half]{scrartcl}');
  assert.equal(P.docParskip(kh).skip, 6);
  assert.equal(model(kh).opts.parskip > 0, true, 'the model reads KOMA\'s option');
  const m = D('X', '', '\\documentclass{memoir}');
  assert.equal(ed(m, P.docParskipEdits(m, 6).edits), D('X', '\\abnormalparskip{6pt}\n', '\\documentclass{memoir}'));
  assert.ok(P.docParskipEdits(D('X', '', '\\documentclass{beamer}'), 6).why);
  assert.equal(P.PARA_SETS.length, 6);
});

ok('the document\'s first line indent and widows', () => {
  const d = D('X');
  const t = ed(d, P.docParindentEdits(d, 1.25 * P.PT.cm));
  assert.equal(t, D('X', '\\setlength{\\parindent}{1.25cm}\n'));
  assert.equal(Math.round(P.docParindent(t).pt / P.PT.cm * 100), 125);
  assert.equal(ed(t, P.docParindentEdits(t, 2 * P.PT.cm)), D('X', '\\setlength{\\parindent}{2cm}\n'));
  const w = ed(d, P.widowEdits(d, true));
  assert.equal(w, D('X', '\\widowpenalty=10000\n\\clubpenalty=10000\n'));
  assert.ok(P.widowControl(w).on);
  assert.equal(ed(w, P.widowEdits(w, false)), d);
  const hw = D('X', '\\widowpenalty 300\n\\clubpenalty=300\n');
  assert.ok(!P.widowControl(hw).on);
  assert.equal(ed(hw, P.widowEdits(hw, true)), D('X', '\\widowpenalty 10000\n\\clubpenalty=10000\n'));
  assert.ok(P.widowControl(D('X', '\\usepackage[all]{nowidow}\n')).on);
});

ok('the model draws what the environments say', () => {
  const t = D('\\begin{adjustwidth}{1cm}{2cm}\nOne.\n\nTwo.\n\\end{adjustwidth}\n\n\\begin{tcolorbox}[colback=yellow!20]\nIn a box.\n\nAnd more.\n\\end{tcolorbox}\n\n\\begin{hyphenrules}{nohyphenation}\nNo breaks.\n\\end{hyphenrules}\n\n\\begin{figure}\n\\rule{1cm}{1cm}\n\\end{figure}\n\n\\begin{figure}\n\\raggedleft\n\\rule{1cm}{1cm}\n\\end{figure}');
  const M = model(t), items = M.blocks.flatMap((b) => b.items);
  const ps = items.filter((x) => x.type === 'p');
  assert.deepEqual(ps[0].mx.map(Math.round), [28, 57]);
  assert.equal(ps[0].indent, false, 'adjustwidth\'s first paragraph is unindented (\\item[])');
  assert.equal(ps[1].indent, true);
  assert.ok(ps[2].box && ps[2].boxFirst && !ps[2].boxLast && ps[3].boxLast);
  assert.equal(ps[2].indent, false);
  assert.ok(ps[4].nohy);
  const fl = items.filter((x) => x.type === 'float');
  assert.equal(fl[0].parts[0].align, 'left', 'a figure without \\centering is set at the left margin, as TeX sets it');
  assert.equal(fl[1].parts[0].align, 'right');
});

ok('a stranger\'s text: long lines and many lines read in bounded time', () => {
  const big = D('A.\n\n' + 'x'.repeat(200000) + ' ' + ' '.repeat(100000) + '\n\nB.', '\\linespread{' + '1'.repeat(5000) + '\n' + '\\setlength{\\parskip}{'.repeat(2000) + '\n');
  const t0 = Date.now();
  P.docSpacing(big); P.docParskip(big); P.widowControl(big); P.docParindent(big);
  const u = P.unitOf(big, big.indexOf('xxx'), big.indexOf('\n\nB.'), big.indexOf('\\begin{document}') + 16, big.length);
  assert.ok(u);
  P.alignEdits(big, u, 'center');
  const vs = D('A.\n\n' + '\\vspace{1pt}\n'.repeat(5000) + 'Text.\n\nB.');
  P.unitOf(vs, vs.indexOf('Text'), vs.indexOf('Text') + 5, 0, vs.length);
  // runs of spaces after a command's name (each of these took 0.6 s for 20 000 spaces, and the
  // ribbon asks at every move of the caret): linear now
  const sp = ' '.repeat(200000);
  for (const cmd of ['\\renewcommand', '\\setlength', '\\widowpenalty', '\\parindent', '\\setstretch']) {
    const t = D('X', cmd + sp + 'x\n');
    P.docSpacing(t); P.docParskip(t); P.docParindent(t); P.widowControl(t);
  }
  // a paragraph of 20 000 \nopagebreak: the model reads its end once
  model(D('Words ' + '\\nopagebreak '.repeat(20000)));
  // nested past what the parser takes: the unit is known to be none to wrap
  const deep = 'A ' + '{'.repeat(20000) + 'x' + '}'.repeat(20000);
  const ud = P.unitOf(deep, 0, deep.length, 0, deep.length);
  assert.ok(!ud || ud.inArg || ud.levels.length === 1);
  assert.ok(Date.now() - t0 < 2500, 'took ' + (Date.now() - t0) + ' ms');
});

console.log('para: ' + n + ' groups of checks passed');
