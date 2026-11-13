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
import { methods } from '../src/cmd/para.js';

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
  // (review: KOMA-Script's half is half a line, parskip's own, Open; full is a whole line, and a
  // space in points goes to the nearer of the two)
  assert.equal(P.docParskip(kh).skip, 'open');
  assert.equal(ed(k, P.docParskipEdits(k, 'open').edits), kh);
  assert.equal(ed(k, P.docParskipEdits(k, 4).edits), kh);
  assert.equal(ed(k, P.docParskipEdits(k, 12).edits), D('X', '', '\\documentclass[parskip=full]{scrartcl}'));
  assert.equal(P.docParskip(D('X', '', '\\documentclass[parskip=full]{scrartcl}')).skip, 12);
  assert.equal(P.docParskip(D('X', '', '\\documentclass[12pt,parskip=full]{scrartcl}')).skip, 14.5);
  assert.deepEqual(P.docParskipEdits(kh, 'open').edits, [], 'Open on a document of parskip=half: nothing to write');
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


// ---- the hostile review of b265b6f (PR 24): each case as the reviewer gave it, run through the
// commands' own methods (paraUnits, paraRun, the dialog's paraDialogApply) on a page without a page
function App(text) {
  const files = new Map([['main.tex', text]]);
  const app = Object.assign(Object.create(null), methods, {
    main: 'main.tex', files, toasts: [], c: null, model: model(text),
    src: (f) => files.get(f), caretNow() { return this.c; }, toast(m) { this.toasts.push(m); }, preambleOthers: () => [], closeGroup() {},
    commit(edits, caret) {
      for (const f of new Set(edits.map((x) => x.f))) files.set(f, applyEdits(files.get(f), edits.filter((x) => x.f === f)));
      if (caret) this.c = caret.selA != null ? { f: caret.f, a: caret.selA, b: caret.selB, collapsed: false } : { f: caret.f, a: caret.p, b: caret.p, collapsed: true };
    }
  });
  return app;
}
// the caret at word w, or a selection from w to the end of w2; f(app, at) is the command's method
function run(text, w, w2, f) {
  const app = App(text), from = text.indexOf('\\begin{document}'), a = text.indexOf(w, from);
  app.c = w2 == null ? { f: 'main.tex', a, b: a, collapsed: true } : { f: 'main.tex', a, b: text.indexOf(w2, a) + w2.length, collapsed: false };
  f(app, { c: app.c, ctx: 'p', memo: {}, multi: w2 != null });
  const out = app.src('main.tex');
  return Object.assign(new String(out), { app, why: app.toasts.join(' | ') });
}
const al = (to) => (app, at) => app.paraAlign(to, at);
const RUN = (text, w, to, w2) => String(run(text, w, w2, al(to)));
// every environment balanced: what TeX would refuse first
const balanced = (t) => { const st = []; for (const m of t.matchAll(/\\(begin|end)\{([^}]+)\}/g)) { if (m[1] === 'begin') st.push(m[2]); else if (st.pop() !== m[2]) return false; } return !st.length; };

ok('review 1: several paragraphs of one environment selected: the environment edited once, every environment closed', () => {
  const s = D('\\begin{center}\nA\n\nB\n\\end{center}\n\nC\n\nD');
  const cases = [
    ['B', 'C', 'right', '\\begin{center}\nA\n\\end{center}\n\n\\begin{flushright}\nB\n\nC\n\\end{flushright}\n\nD'],
    ['A', 'D', 'center', '\\begin{center}\nA\n\nB\n\nC\n\nD\n\\end{center}'],
    ['B', 'D', 'justify', '\\begin{center}\nA\n\\end{center}\n\nB\n\nC\n\nD'],
    ['A', 'B', 'justify', 'A\n\nB\n\nC\n\nD'],
    ['A', 'B', 'right', '\\begin{flushright}\nA\n\nB\n\\end{flushright}\n\nC\n\nD'],
    ['A', 'C', 'left', '\\begin{flushleft}\nA\n\nB\n\nC\n\\end{flushleft}\n\nD']];
  for (const [w, w2, to, want] of cases) {
    const r = RUN(s, w, to, w2);
    assert.equal(body(r), want, w + '..' + w2 + ' ' + to);
    assert.ok(balanced(r));
  }
  // and back where the selection is one setting again
  assert.equal(RUN(RUN(s, 'A', 'right', 'B'), 'A', 'center', 'B'), s);
  const two = D('\\begin{center}\nA\n\\end{center}\n\nB\n\n\\begin{flushright}\nC\n\\end{flushright}');
  assert.equal(body(RUN(two, 'A', 'left', 'C')), '\\begin{flushleft}\nA\n\nB\n\nC\n\\end{flushleft}');
  assert.equal(body(RUN(two, 'A', 'center', 'C')), '\\begin{center}\nA\n\nB\n\nC\n\\end{center}');
  // a paragraph with a line of its own split out and back: the line goes back where it was
  const v = D('\\begin{center}\nA\n\n\\vspace{12pt}\nB\n\nC\n\\end{center}');
  assert.equal(RUN(RUN(v, 'B', 'justify'), 'B', 'center'), v);
});

ok('review 2 and 3: the dialog over several paragraphs edits each where it is now, and the caret stays on its words', () => {
  const s = D('\\begin{center}\nAlpha words here.\n\\end{center}\n\nBeta words here.\n\nGamma.');
  const K = P.spacingKind('setspace');
  const dlg = (ops) => run(s, 'Alpha', 'Beta', (app, at) => app.paraDialogApply(app.paraUnits(at), ops, []));
  const sp = dlg([(t, V) => P.layerEdits(t, V, K, { lines: 1.5 }, { inherit: { lines: 1 } })]);
  assert.ok(balanced(String(sp)), String(sp));
  assert.equal(body(sp), '\\begin{onehalfspace}\n\\begin{center}\nAlpha words here.\n\\end{center}\n\nBeta words here.\n\\end{onehalfspace}\n\nGamma.');
  const before = dlg([(t, V) => P.spaceEdits(t, V, 'before', 12)]);
  assert.equal(body(before), '\\vspace{12pt}\n\\begin{center}\nAlpha words here.\n\\end{center}\n\n\\vspace{12pt}\nBeta words here.\n\nGamma.');
  // two settings at once: the second sees what the first wrote, in both paragraphs
  const both = dlg([(t, V) => P.alignEdits(t, V, 'right', {}), (t, V) => P.spaceEdits(t, V, 'before', 6)]);
  assert.ok(balanced(String(both)));
  assert.equal(body(both), '\\vspace{6pt}\n\\begin{flushright}\nAlpha words here.\n\n\\vspace{6pt}\nBeta words here.\n\\end{flushright}\n\nGamma.');
  // the selection after OK: the same words (the next key typed lands in them, not in a \begin)
  for (const r of [sp, before, both]) {
    const t = String(r), c = r.app.c;
    assert.ok(t.slice(c.a).startsWith('Alpha') && t.slice(0, c.b).endsWith('Beta'), JSON.stringify([t.slice(c.a, c.a + 12), t.slice(c.b - 8, c.b)]));
  }
  // a caret alone: after Center it is still at its word
  const one = run(PLAIN, 'Second', null, al('center'));
  assert.ok(String(one).slice(one.app.c.a).startsWith('Second'));
});

ok('review 4 and 5: no join with a commented out environment, a verbatim one, or a LaTeX paragraph\'s', () => {
  for (const s of [D('Intro.\n\n% \\begin{center}\n% Old text\n% \\end{center}\n\nC words here.\n\nAfter.'),
    D('Intro.\n\n\\begin{center}\nX\n\\end{center}\n% \\end{center}\n\nC words here.'),
    D('Intro.\n\n\\begin{verbatim}\n\\begin{center}\nX\n\\end{center}\n\\end{verbatim}\n\nC words here.'),
    D('C words here.\n\n%\\begin{center}\nX\n\\end{center}'),
    D('Intro.\n\n% rikuy: latex\n\\begin{center}\nRaw stuff \\LaTeX\n\\end{center}\n\nC words here.\n\nAfter.'),
    D('Intro.\n\nC words here.\n\n% rikuy: latex\n\\begin{center}\nRaw stuff\n\\end{center}\n\nAfter.')]) {
    const r = RUN(s, 'C words', 'center');
    assert.ok(r.includes('\\begin{center}\nC words here.\n\\end{center}'), body(r));
    assert.equal(RUN(r, 'C words', 'justify'), s);
  }
  // a real neighbour still joins
  assert.equal(body(RUN(D('\\begin{center}\nX\n\\end{center}\n\nC words here.'), 'C words', 'center')), '\\begin{center}\nX\n\nC words here.\n\\end{center}');
});

ok('review 6: Tabs over a selection writes its fill at the selection\'s end and takes nothing away', () => {
  const s = D('\\begin{center}\nName\n\\end{center}\n\nSome \\textbf{bold} words.');
  const r = run(s, 'Some', 'bold', (app, at) => app.paraLeader('dots', at));
  assert.equal(body(r), '\\begin{center}\nName\n\\end{center}\n\nSome \\textbf{bold\\dotfill} words.');
  assert.ok(String(r).slice(r.app.c.a).startsWith('} words'));
});

ok('review 7: the group forms as written ({ \\centering, a line break, a comment) and a group over two paragraphs', () => {
  const g = (x) => D('Intro.\n\n' + x + '\n\nAfter.');
  for (const [x, right] of [['{ \\centering Words here.\\par}', '{ \\raggedleft Words here.\\par}'], ['{\\centering Words here.\\par }', '{\\raggedleft Words here.\\par }'],
    ['{\\centering\nWords here.\\par}', '{\\raggedleft\nWords here.\\par}'], ['{\\centering % c\nWords here.\\par}', '{\\raggedleft % c\nWords here.\\par}']]) {
    assert.equal(at(g(x), 'Words').it.align, 'center');
    assert.equal(body(RUN(g(x), 'Words', 'right')), 'Intro.\n\n' + right + '\n\nAfter.');
    assert.equal(body(RUN(g(x), 'Words', 'justify')), 'Intro.\n\nWords here.\n\nAfter.');
  }
  // the words' first line inside a group that starts on the line before: the group is the unit
  for (const x of ['{\\large\nWords here.\\par}', '\\textbf{%\nWords here.}', '\\noindent{\\small\nWords here.}']) {
    const r = RUN(g(x), 'Words', 'center');
    assert.equal(body(r), 'Intro.\n\n\\begin{center}\n' + x + '\n\\end{center}\n\nAfter.');
    assert.equal(RUN(r, 'Words', 'justify'), g(x));
  }
  // a unit whose range cuts a group is none: the parse refuses it, nothing is written
  const cut = D('A ' + '{\\bfseries x\n\nY} z');
  assert.equal(P.unitOf(cut, cut.indexOf('Y'), cut.indexOf('z') + 1, 0, cut.length).inArg, true);
});

ok('review 8: a list\'s or a box\'s paragraphs: the alignment goes inside, the page draws none from around it', () => {
  for (const env of ['quote', 'quotation', 'verse', 'abstract']) {
    const s = D('Intro.\n\n\\begin{' + env + '}\nWords of the env here.\n\\end{' + env + '}\n\nAfter.');
    const r = RUN(s, 'Words', 'center');
    assert.equal(body(r), 'Intro.\n\n\\begin{' + env + '}\n\\begin{center}\nWords of the env here.\n\\end{center}\n\\end{' + env + '}\n\nAfter.');
    assert.equal(at(r, 'Words').it.align, 'center');
    assert.equal(RUN(r, 'Words', 'justify'), s);
    // written outside by hand: TeX sets the words flush, the page too, the button says so
    const out = D('\\begin{center}\n\\begin{' + env + '}\nWords here.\n\\end{' + env + '}\n\\end{center}');
    assert.equal(at(out, 'Words').it.align, null, env);
    const u = P.unitOf(out, at(out, 'Words').it.ps, at(out, 'Words').it.pe, 0, out.length);
    assert.equal(P.alignOf(out, u).v, null);
  }
  const box = D('\\begin{center}\n\\begin{tcolorbox}\nWords here.\n\\end{tcolorbox}\n\\end{center}\n\n\\begin{center}\n\\begin{minipage}{5cm}\nMini words.\n\\end{minipage}\n\\end{center}\n\n\\begin{center}\n\\begin{itemize}\n\\item Item words.\n\\end{itemize}\n\\end{center}', '\\usepackage{tcolorbox}\n');
  for (const w of ['Words here', 'Mini words', 'Item words']) assert.equal(at(box, w).it.align, null, w);
  // B2's own layers in any order: indent, then Center, then shading, then Center: the alignment
  // inside adjustwidth and tcolorbox, where TeX centres
  let t = D('Intro body.\n\nCI words.\n\nCS words.\n\nAfter.', '\\usepackage{changepage}\n\\usepackage{tcolorbox}\n');
  t = String(run(t, 'CI', null, (app, at) => app.paraIndentStep(1, at)));
  t = RUN(t, 'CI', 'center');
  t = String(run(t, 'CS', null, (app, at) => app.paraShade('yellow!20', at)));
  t = RUN(t, 'CS', 'center');
  assert.ok(t.includes('\\begin{adjustwidth}{1.27cm}{}\n\\begin{center}\nCI words.\n\\end{center}\n\\end{adjustwidth}'), body(t));
  assert.ok(t.includes(']\n\\begin{center}\nCS words.\n\\end{center}\n\\end{tcolorbox}'), body(t));
  assert.equal(at(t, 'CI').it.align, 'center');
  assert.equal(at(t, 'CS').it.align, 'center');
});

ok('review 9: a figure without \\centering where the class or the preamble centres it, \\centerline, the centering environment', () => {
  const fig = '\\begin{figure}\n\\rule{1cm}{1cm} XX\n\\caption{c}\n\\end{figure}';
  const parts = (s) => model(s).blocks.flatMap((b) => b.items).filter((x) => x.type === 'float').flatMap((x) => x.parts.filter((q) => q.type === 'p').map((q) => q.align));
  for (const [cls, pre, want] of [['article', '', 'left'], ['memoir', '', 'left'], ['IEEEtran', '', 'left'], ['scrartcl', '', 'left'], ['amsart', '', 'center'], ['amsbook', '', 'center'], ['revtex4-2', '', 'center'], ['acmart', '', 'center'],
    ['article', '\\usepackage{floatrow}\n', 'center'], ['article', '\\makeatletter\n\\g@addto@macro\\@floatboxreset\\centering\n\\makeatother\n', 'center'], ['article', '%\\g@addto@macro\\@floatboxreset\\centering\n', 'left']]) {
    assert.deepEqual(parts(D(fig, pre, '\\documentclass{' + cls + '}')), [want], cls + ' ' + pre);
  }
  assert.deepEqual(parts(D('\\begin{frame}\n' + fig + '\n\\end{frame}', '', '\\documentclass{beamer}')), ['center']);
  assert.deepEqual(parts(D('\\begin{figure}\n\\centerline{\\rule{1cm}{1cm} XX}\n\\caption{c}\n\\end{figure}')), ['center']);
  assert.deepEqual(parts(D('\\begin{figure}\n\\begin{centering}\n\\rule{1cm}{1cm} XX\n\\end{centering}\n\\caption{c}\n\\end{figure}')), ['center']);
  // the ribbon's state and its edits: the class's own is no declaration; another is one
  const am = D(fig, '', '\\documentclass{amsart}');
  const app = App(am), B = app.model.blocks.find((b) => b.items.some((x) => x.type === 'float'));
  assert.equal(app.floatAlign(B).v, 'center');
  assert.deepEqual(app.floatAlignEdits(am, B, 'center'), []);
  assert.equal(body(applyEdits(am, app.floatAlignEdits(am, B, 'left'))), fig.replace('}\n\\rule', '}\n\\raggedright\n\\rule'));
  const ce = D('\\begin{figure}\n\\begin{centering}\nX\n\\end{centering}\n\\caption{c}\n\\end{figure}');
  const a2 = App(ce);
  assert.equal(a2.floatAlign(a2.model.blocks.find((b) => b.items.some((x) => x.type === 'float'))).v, 'center');
});

ok('review 10: an environment taken off leaves the paragraph\'s own lines on it, no blank line between', () => {
  for (const [label, f] of [['before', (a, at) => a.paraSpace('before', 12, at)], ['after', (a, at) => a.paraSpace('after', 12, at)], ['keep', (a, at) => a.paraToggle('keep', true, at)],
    ['break', (a, at) => a.paraToggle('break', true, at)], ['rule', (a, at) => a.paraBorder('bottom', at)]]) {
    const s1 = String(run(D('Intro.\n\nWords here.\n\nAfter.'), 'Words', null, f));
    const s3 = RUN(RUN(s1, 'Words', 'center'), 'Words', 'justify');
    assert.equal(s3, s1, label);
  }
  // a comment after \begin stays when the environment goes
  assert.equal(body(RUN(D('A\n\n\\begin{center}% c\nWords here.\n\\end{center}\n\nC'), 'Words', 'justify')), 'A\n\n% c\nWords here.\n\nC');
  // \noindent on its line, \par at the words' end: theirs
  for (const s of [D('A\n\n\\noindent\nWords here.\n\nC'), D('A\n\nWords here.\\par\n\nC')]) assert.equal(RUN(RUN(s, 'Words', 'center'), 'Words', 'justify'), s);
});

ok('review 11: the dialog in a figure shows its alignment and sets it, the rest of the dialog with it', () => {
  const fig = D('Text.\n\n\\begin{figure}\n\\centering\n\\rule{1cm}{1cm}\n\\caption{c}\n\\end{figure}');
  const app = App(fig), B = app.model.blocks.find((b) => b.items.some((x) => x.type === 'float'));
  app.c = { f: 'main.tex', a: B.s + 20, b: B.s + 20, collapsed: true };
  const p = app.paraUnits({ c: app.c, ctx: 'p', memo: {} });
  assert.ok(p.float);
  assert.equal(app.paraAlignNow(p), 'center', 'shown Centered, not Justified');
  // Centered chosen again: nothing toggled; Right: \raggedleft; with the widows box in the same step
  app.paraDialogApply(p, [], [(t) => P.widowEdits(t, true)], 'center');
  assert.equal(app.src('main.tex'), applyEdits(fig, P.widowEdits(fig, true)));
  const a2 = App(fig), p2 = a2.paraUnits({ c: { f: 'main.tex', a: B.s + 20, b: B.s + 20, collapsed: true }, ctx: 'p', memo: {} });
  a2.c = { f: 'main.tex', a: B.s + 20, b: B.s + 20, collapsed: true };
  a2.paraDialogApply(p2, [], [(t) => P.widowEdits(t, true)], 'right');
  const t2 = a2.src('main.tex');
  assert.ok(t2.includes('\\begin{figure}\n\\raggedleft\n\\rule') && P.widowControl(t2).on, t2);
});

ok('review 12 and 13: an HTML colour as shading; {\\centering ...} without \\par is not centred', () => {
  const hex = P.htmlColor('E75480');
  assert.equal(hex, 'rgb,255:red,231;green,84;blue,128');
  const s = D('Intro.\n\nWords here.\n\nAfter.', '\\usepackage{tcolorbox}\n');
  const r = String(run(s, 'Words', null, (app, at) => app.paraShade(hex, at)));
  assert.ok(r.includes('\\begin{tcolorbox}[colback={rgb,255:red,231;green,84;blue,128},colframe={rgb,255:red,231;green,84;blue,128},boxrule=0pt,sharp corners]'), body(r));
  assert.equal(at(r, 'Words').it.box.bg, '#E75480', 'the page draws the colour');
  const u = P.unitOf(r, at(r, 'Words').it.ps, at(r, 'Words').it.pe, 0, r.length);
  assert.equal(P.boxOf(r, u).shading, hex);
  assert.equal(String(run(r, 'Words', null, (app, at) => app.paraShade(null, at))), s);
  const g = D('Intro.\n\n{\\centering Words here.}\n\nAfter.');
  assert.equal(at(g, 'Words').it.align, null);
  assert.equal(P.alignOf(g, P.unitOf(g, at(g, 'Words').it.ps, at(g, 'Words').it.pe, 0, g.length)).v, null);
  assert.equal(body(RUN(g, 'Words', 'center')), 'Intro.\n\n\\begin{center}\n{\\centering Words here.}\n\\end{center}\n\nAfter.');
});

ok('review 15 and 17: an indented environment split and joined keeps its spaces; display math in a paragraph goes with it', () => {
  const s = D('  \\begin{center}\n  A\n\n  B\n\n  C\n  \\end{center}');
  assert.equal(body(RUN(s, 'B', 'right')), '  \\begin{center}\n  A\n  \\end{center}\n\n  \\begin{flushright}\n  B\n  \\end{flushright}\n\n  \\begin{center}\n  C\n  \\end{center}');
  for (const [w, to] of [['A', 'justify'], ['B', 'right'], ['C', 'justify'], ['B', 'justify']]) assert.equal(RUN(RUN(s, w, to), w, 'center'), s, w + ' ' + to);
  const crlf = D('\\begin{center}\nA\n\nB\n\nC\n\\end{center}').replace(/\n/g, '\r\n');
  assert.equal(RUN(RUN(crlf, 'B', 'left'), 'B', 'center'), crlf);
  const m = D('A\n\nB starts\n\\[ x^2 \\]\nand B continues.\n\nC');
  const want = 'A\n\n\\begin{center}\nB starts\n\\[ x^2 \\]\nand B continues.\n\\end{center}\n\nC';
  assert.equal(body(RUN(m, 'B starts', 'center')), want);
  assert.equal(body(RUN(m, 'and B', 'center')), want);
  assert.equal(RUN(RUN(m, 'and B', 'center'), 'B starts', 'justify'), m);
});

ok('review, lows: a theorem\'s first paragraph says why; every paragraph of a long text at once; the parse not made again per caret move', () => {
  const th = D('\\newtheorem{thm}{Theorem}\n\\begin{thm}\nFirst of thm\n\nSecond of thm\n\\end{thm}');
  assert.match(run(th, 'First of', null, al('center')).why, /first paragraph of a theorem/);
  assert.ok(RUN(th, 'Second of', 'center').includes('\\begin{center}\nSecond of thm\n\\end{center}\n\\end{thm}'));
  let b = '';
  for (let i = 0; i < 1500; i++) b += 'Paragraph ' + i + ' with some \\textbf{bold} words and $x^2$ math, more words to fill.\n\n';
  const big = D('\\begin{spacing}{1.5}\n' + b + '\\end{spacing}', '\\usepackage{setspace}\n');
  const t0 = Date.now();
  const r = run(big, 'Paragraph 0 ', 'to fill.\n\n\\end', al('center'));
  assert.ok(!r.why && String(r).includes('\\begin{spacing}{1.5}\n\\begin{center}\nParagraph 0 ') && String(r).includes('to fill.\n\\end{center}\n\n\\end{spacing}'), r.why);
  let h = '';
  for (let i = 0; i < 400; i++) h += (i % 8 === 0 ? '\\section{S' + i + '}\n' : '') + 'Para ' + i + ' words.\n\n';
  const hd = D(h);
  const r2 = run(hd, '\\section', 'Para 399 words.', al('right'));
  assert.equal((String(r2).match(/\\begin\{flushright\}/g) || []).length, 50);
  assert.ok(balanced(String(r2)));
  assert.ok(Date.now() - t0 < 6000, 'took ' + (Date.now() - t0) + ' ms');
  // nowidow's all option read as preamble.js reads options: a hostile preamble in bounded time
  const t1 = Date.now();
  P.widowControl(D('X', '\\usepackage[' + 'all '.repeat(20000)));
  P.widowControl(D('X', '\\usepackage' + ' '.repeat(50000) + '['));
  assert.ok(Date.now() - t1 < 300, 'took ' + (Date.now() - t1) + ' ms');
  assert.equal(P.widowControl(D('X', '\\usepackage[all]{nowidow}\n')).on, true);
  // the review's new reads, on a stranger's text: a \noindent and 100 000 spaces before the words;
  // 5000 \begin{center} on one long line before an \end{center} that a join looks back from
  const t2 = Date.now();
  const sp = D('\\noindent' + ' '.repeat(100000) + 'x\nWords here.');
  P.unitOf(sp, sp.indexOf('\\noindent'), sp.indexOf('\n\\end{document}'), 0, sp.length, { vs: sp.indexOf('Words'), ve: sp.indexOf('here.') + 5 });
  const many = D('\\begin{verbatim}\n' + '\\begin{center}'.repeat(5000) + '\n\\end{verbatim}\n\n\\begin{center}\nX\n\\end{center}\n\nC words here.');
  // (past what a join reads back, the paragraph gets an environment of its own: nothing is joined unseen)
  assert.ok(RUN(many, 'C words', 'center').endsWith('C words here.\n\\end{center}\n\\end{document}\n'));
  assert.ok(Date.now() - t2 < 1500, 'took ' + (Date.now() - t2) + ' ms');
});

console.log('para: ' + n + ' groups of checks passed');
