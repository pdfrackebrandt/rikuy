// Pictures in the source (src/picture.js): an \includegraphics found with what stands round it
// (the boxes that flip, turn, frame or size it; the center, figure, wrapfigure, paragraph or
// sentence it is in), and every Picture Format operation as small edits that come off again byte
// for byte: size, crop, rotate, flips, border, alt text, position and wrapping, caption, reset,
// change. Hand written forms read and edited in their own form; where a float cannot go (a
// minipage, columns, a list, beamer). The natural size TeX gives a PNG, a JPEG and a PDF, and the
// box graphicx makes of a picture's keys. A stranger's text read in bounded time.
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import * as X from '../src/picture.js';
import { applyEdits } from '../src/styles.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const doc = (body) => '\\documentclass{article}\n\\begin{document}\n' + body + '\n\\end{document}\n';
const at = (t, k = 0) => { let i = -1; for (let j = 0; j <= k; j++) i = t.indexOf('\\includegraphics', i + 1); return X.findPicture(t, parse(t), i); };
const run = (t, fn, k) => { const P = at(t, k); const r = fn(t, P); assert.ok(r && !r.error, r && r.error); return applyEdits(t, r.edits); };
const CENTER = doc('Before.\n\n\\begin{center}\n\\includegraphics[width=0.8\\linewidth]{a.png}\n\\end{center}\n\nAfter.');
const FIG = doc('Before.\n\n\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.5\\linewidth]{a.png}\n\\caption{A cat}\n\\label{fig:cat}\n\\end{figure}\n\nAfter.');

ok('found where it stands: a center, a figure, a wrapfigure, a paragraph of its own, a sentence, a minipage', () => {
  assert.equal(at(CENTER).block.kind, 'inline');
  assert.equal(at(FIG).block.kind, 'float');
  assert.ok(at(FIG).block.caption && at(FIG).block.label && at(FIG).block.sole);
  assert.equal(at(doc('\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\includegraphics[width=\\linewidth]{a}\n\\end{wrapfigure}\nText.')).block.kind, 'wrap');
  assert.equal(at(doc('A.\n\n\\includegraphics{a.png}\n\nB.')).block.kind, 'para');
  assert.equal(at(doc('Words \\includegraphics[height=1em]{a.png} more.')).block.kind, 'sentence');
  assert.equal(at(doc('\\begin{minipage}{0.4\\linewidth}\n\\includegraphics{a}\n\\end{minipage}')).block.kind, 'box');
  assert.equal(at(doc('\\begin{figure}\n\\includegraphics{a}\n\\includegraphics{b}\n\\end{figure}')).block.sole, false);
  assert.equal(at(doc('% \\includegraphics{x}\n\\includegraphics{a.png}'), 1).file.name, 'a.png');
  assert.equal(at(doc('% \\includegraphics{x}\n\\includegraphics{a.png}'), 0), null);
});

ok('size: width as a share of the line or a length, the height off with the shape kept, both when free', () => {
  assert.equal(run(CENTER, (t, P) => X.setSize(t, P, '0.5\\linewidth', null, false)), CENTER.replace('0.8\\linewidth', '0.5\\linewidth'));
  assert.equal(run(CENTER, (t, P) => X.setSize(t, P, '6cm', '4cm', true)), CENTER.replace('width=0.8\\linewidth', 'width=6cm,height=4cm'));
  const free = CENTER.replace('width=0.8\\linewidth', 'width=6cm,height=4cm');
  assert.equal(run(free, (t, P) => X.setSize(t, P, '6cm', null, false)), CENTER.replace('0.8\\linewidth', '6cm'));
  assert.equal(run(free, (t, P) => X.setSize(t, P, null, '3cm', false)), CENTER.replace('width=0.8\\linewidth', 'height=3cm'));
  const bare = doc('A.\n\n\\includegraphics{a.png}\n\nB.');
  assert.equal(run(bare, (t, P) => X.setSize(t, P, '\\linewidth', null, false)), bare.replace('\\includegraphics{', '\\includegraphics[width=\\linewidth]{'));
  // a scale goes when a width comes; \resizebox is sized in its own arguments
  const sc = CENTER.replace('width=0.8\\linewidth', 'scale=0.5');
  assert.equal(run(sc, (t, P) => X.setSize(t, P, '0.3\\linewidth', null, false)), CENTER.replace('0.8', '0.3'));
  const rz = doc('\\resizebox{0.7\\linewidth}{!}{\\includegraphics{a}}');
  assert.equal(X.sizeOf(rz, at(rz)).by, 'resize');
  assert.equal(run(rz, (t, P) => X.setSize(t, P, '5cm', null, false)), rz.replace('0.7\\linewidth', '5cm'));
  // a picture that fills its wrapfigure: the wrapfigure's width is its width
  const wr = doc('\\begin{wrapfigure}{r}{0.4\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]{a}\n\\end{wrapfigure}\nText.');
  assert.equal(X.sizeOf(wr, at(wr)).width, '0.4\\linewidth');
  assert.equal(run(wr, (t, P) => X.setSize(t, P, '0.3\\linewidth', null, false)), wr.replace('{0.4\\linewidth}', '{0.3\\linewidth}'));
});

ok('a width near a twentieth of the line is that share; else a length', () => {
  assert.equal(X.widthText(172.5, 345), '0.5\\linewidth');
  assert.equal(X.widthText(345, 345), '\\linewidth');
  assert.equal(X.widthText(176, 345), '0.5\\linewidth');
  assert.equal(X.widthText(197, 345), '6.92cm');
  assert.equal(X.widthText(172.5, 345, { base: 'textwidth' }), '0.5\\textwidth');
  assert.deepEqual(X.shareOf('0.5\\textwidth'), [0.5, 'textwidth']);
  assert.deepEqual(X.shareOf('\\columnwidth'), [1, 'columnwidth']);
  assert.equal(X.lengthPt('2cm', 345).toFixed(2), '56.91');
});

ok('crop: trim and clip in cm, read back in bp, off again byte for byte; viewport read as a crop', () => {
  const t = run(CENTER, (s, P) => X.setCrop(s, P, { l: 72 / 2.54, b: 0, r: 72 / 2.54, t: 0 }));
  assert.equal(t, CENTER.replace('width=0.8\\linewidth', 'width=0.8\\linewidth,trim=1cm 0 1cm 0,clip'));
  const c = X.cropOf(at(t), null);
  assert.ok(Math.abs(c.l - 28.35) < 0.01 && c.b === 0 && c.clip);
  assert.equal(run(t, (s, P) => X.setCrop(s, P, { l: 0, b: 0, r: 0, t: 0 })), CENTER);
  const hand = CENTER.replace('width=0.8\\linewidth', 'width=0.8\\linewidth, trim=10 20 30 40, clip');
  assert.deepEqual(['l', 'b', 'r', 't'].map((k) => X.cropOf(at(hand), null)[k]), [10, 20, 30, 40]);
  const vp = CENTER.replace('width=0.8\\linewidth', 'viewport=10 20 190 80,clip');
  assert.deepEqual(['l', 'b', 'r', 't'].map((k) => X.cropOf(at(vp), { w: 200, h: 100 })[k]), [10, 20, 10, 20]);
  assert.equal(run(vp, (s, P) => X.setCrop(s, P, { l: 0, b: 0, r: 0, t: 0 })), CENTER.replace('[width=0.8\\linewidth]', ''));
});

ok('rotate by quarter turns, back to no angle; a hand written \\rotatebox turned in its own argument', () => {
  const l = run(CENTER, (t, P) => X.rotate(t, P, 90));
  assert.equal(l, CENTER.replace('0.8\\linewidth]', '0.8\\linewidth,angle=90]'));
  assert.equal(X.angleOf(l, at(l)), 90);
  assert.equal(run(l, (t, P) => X.rotate(t, P, 90)), CENTER.replace('0.8\\linewidth]', '0.8\\linewidth,angle=180]'));
  assert.equal(run(l, (t, P) => X.rotate(t, P, -90)), CENTER);
  const rb = doc('\\rotatebox{90}{\\includegraphics{a}}');
  assert.equal(X.angleOf(rb, at(rb)), 90);
  assert.equal(run(rb, (t, P) => X.rotate(t, P, 90)), rb.replace('{90}', '{180}'));
  assert.equal(run(rb, (t, P) => X.rotate(t, P, -90)), doc('\\includegraphics{a}'));
});

ok('flips and the border: on and off byte for byte, in any order, hand written forms taken off as written', () => {
  const h = run(CENTER, (t, P) => X.flip(t, P, 'h'));
  assert.ok(h.includes('\\reflectbox{\\includegraphics[width=0.8\\linewidth]{a.png}}'));
  assert.ok(X.flipped(at(h), 'h'));
  const hv = run(h, (t, P) => X.flip(t, P, 'v'));
  assert.ok(hv.includes('\\reflectbox{\\scalebox{1}[-1]{\\includegraphics'));
  const b = run(hv, (t, P) => X.border(t, P));
  assert.ok(b.includes('{\\setlength{\\fboxsep}{0pt}\\fbox{\\reflectbox{\\scalebox{1}[-1]{\\includegraphics'));
  assert.ok(X.bordered(at(b)) && at(b).wraps.find((w) => w.kind === 'border').ours);
  assert.equal(run(run(run(b, (t, P) => X.flip(t, P, 'h')), (t, P) => X.border(t, P)), (t, P) => X.flip(t, P, 'v')), CENTER);
  const fb = doc('\\fbox{\\includegraphics{a}}');
  assert.ok(X.bordered(at(fb)));
  assert.equal(run(fb, (t, P) => X.border(t, P)), doc('\\includegraphics{a}'));
  const sx = doc('\\scalebox{-1}[1]{\\includegraphics{a}}');
  assert.ok(X.flipped(at(sx), 'h'));
  assert.equal(run(sx, (t, P) => X.flip(t, P, 'h')), doc('\\includegraphics{a}'));
});

ok('alt text: escaped as a key\'s value, read back as typed; decorative; a "% alt:" line for graphics\' own form', () => {
  const said = 'A 50% rise in {cats} & dogs_1 \\ #2 ~ ^';
  const t = run(CENTER, (s, P) => X.setAlt(s, P, said, false));
  assert.ok(t.includes('alt={A 50\\% rise in \\{cats\\} \\& dogs\\_1 \\textbackslash{} \\#2 \\~{} \\^{}}'));
  assert.equal(X.altOf(t, at(t)).text, said);
  const balanced = (s) => { let d = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '{') d++; if (s[i] === '}') d--; if (d < 0) return false; } return d === 0; };
  assert.ok(balanced(t));
  assert.equal(run(t, (s, P) => X.setAlt(s, P, '', false)), CENTER);
  // (decorative: a comment line, which every TeX reads; graphicx's artifact key is TeX Live 2024's)
  const d = run(CENTER, (s, P) => X.setAlt(s, P, '', true));
  assert.ok(d.includes('\\begin{center}\n% alt (decorative)\n\\includegraphics[width=0.8\\linewidth]') && X.altOf(d, at(d)).decorative, d);
  assert.equal(run(d, (s, P) => X.setAlt(s, P, '', false)), CENTER);
  const art = CENTER.replace('0.8\\linewidth]', '0.8\\linewidth,artifact]');
  assert.ok(X.altOf(art, at(art)).decorative);
  assert.equal(run(art, (s, P) => X.setAlt(s, P, 'Now said', false)), CENTER.replace('0.8\\linewidth]', '0.8\\linewidth,alt={Now said}]'));
  const bb = doc('A.\n\n\\includegraphics[0,0][100,50]{a.eps}\n\nB.');
  assert.equal(at(bb).keyval, false);
  const c = run(bb, (s, P) => X.setAlt(s, P, 'A plot', false));
  assert.ok(c.includes('% alt: A plot\n\\includegraphics[0,0]'));
  assert.equal(X.altOf(c, at(c)).text, 'A plot');
  assert.equal(run(c, (s, P) => X.setAlt(s, P, '', false)), bb);
});

ok('position: in line (center) to a figure and back byte for byte, its caption \\captionof and \\caption', () => {
  const f = run(CENTER, (t, P) => X.setPosition(t, P, { mode: 'float', place: 'htbp' }));
  assert.equal(f, CENTER.replace('\\begin{center}', '\\begin{figure}[htbp]\n\\centering').replace('\\end{center}', '\\end{figure}'));
  assert.deepEqual(X.positionOf(f, at(f)), { mode: 'float', place: 'htbp' });
  assert.equal(run(f, (t, P) => X.setPosition(t, P, { mode: 'inline' })), CENTER);
  assert.equal(run(f, (t, P) => X.setPosition(t, P, { mode: 'float', place: 't' })), f.replace('[htbp]', '[t]'));
  const i = run(FIG, (t, P) => X.setPosition(t, P, { mode: 'inline' }));
  assert.ok(i.includes('\\begin{center}\n\\includegraphics') && i.includes('\\captionof{figure}{A cat}') && i.includes('\\end{center}'));
  const r = X.setPosition(FIG, at(FIG), { mode: 'inline' });
  assert.deepEqual(r.packages, ['caption']);
  assert.equal(run(i, (t, P) => X.setPosition(t, P, { mode: 'float', place: 'htbp' })), FIG);
  const H = X.setPosition(CENTER, at(CENTER), { mode: 'float', place: 'H' });
  assert.deepEqual(H.packages, ['float']);
  assert.ok(X.setPosition(CENTER, at(CENTER), { mode: 'float', place: 'H' }, { noH: 'no' }).error);
  // a figure with no placement gets one, and loses it again
  const np = doc('\\begin{figure}\n\\centering\n\\includegraphics{a}\n\\end{figure}');
  assert.equal(run(np, (t, P) => X.setPosition(t, P, { mode: 'float', place: 'b' })), np.replace('\\begin{figure}', '\\begin{figure}[b]'));
});

ok('wrap: a wrapfigure as wide as the picture was, the picture filling it; back to a figure or a center byte for byte', () => {
  const w = run(CENTER, (t, P) => X.setPosition(t, P, { mode: 'wrap', side: 'r' }));
  assert.equal(w, CENTER.replace('\\begin{center}', '\\begin{wrapfigure}{r}{0.8\\linewidth}\n\\centering').replace('\\end{center}', '\\end{wrapfigure}').replace('width=0.8\\linewidth', 'width=\\linewidth'));
  assert.deepEqual(X.positionOf(w, at(w)), { mode: 'wrap', side: 'r' });
  assert.deepEqual(X.setPosition(CENTER, at(CENTER), { mode: 'wrap', side: 'r' }).packages, ['wrapfig']);
  assert.equal(run(w, (t, P) => X.setPosition(t, P, { mode: 'inline' })), CENTER);
  assert.equal(run(w, (t, P) => X.setPosition(t, P, { mode: 'wrap', side: 'l' })), w.replace('{r}', '{l}'));
  const wf = run(FIG, (t, P) => X.setPosition(t, P, { mode: 'wrap', side: 'l' }));
  assert.ok(wf.includes('\\begin{wrapfigure}{l}{0.5\\linewidth}\n\\centering\n\\includegraphics[width=\\linewidth]') && wf.includes('\\caption{A cat}'));
  assert.equal(run(wf, (t, P) => X.setPosition(t, P, { mode: 'float', place: 'htbp' })), FIG);
  // a length width stays the picture's, and the wrapfigure takes it
  const cm = CENTER.replace('0.8\\linewidth', '5cm');
  assert.ok(run(cm, (t, P) => X.setPosition(t, P, { mode: 'wrap', side: 'r' })).includes('\\begin{wrapfigure}{r}{5cm}\n\\centering\n\\includegraphics[width=5cm]'));
});

ok('where a picture cannot float or wrap, the reason, and nothing written', () => {
  const why = (t, mode, o) => X.whyFixed(t, at(t), mode, o);
  assert.match(why(doc('\\begin{multicols}{2}\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\n\\end{multicols}'), 'float'), /columns/);
  assert.match(why(doc('\\begin{itemize}\n\\item x\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\n\\end{itemize}'), 'wrap'), /list/);
  assert.equal(why(doc('\\begin{itemize}\n\\item x\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\n\\end{itemize}'), 'float'), null);
  assert.match(why(CENTER, 'wrap', { nextIsList: true }), /list/);
  assert.match(why(CENTER, 'float', { beamer: true }), /beamer/);
  assert.match(why(doc('\\begin{minipage}{0.4\\linewidth}\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\n\\end{minipage}'), 'float'), /box/);
  assert.match(why(doc('Words \\includegraphics{a} more.'), 'float'), /sentence/);
  assert.match(why(doc('\\begin{figure}\n\\includegraphics{a}\n\\includegraphics{b}\n\\end{figure}'), 'inline'), /more than/);
  assert.match(why(doc('\\begin{figure}\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\n\\end{figure}'), 'float'), /inside a float/);
  assert.ok(X.setPosition(doc('Words \\includegraphics{a} more.'), at(doc('Words \\includegraphics{a} more.')), { mode: 'float' }).error);
});

ok('caption: \\caption in a float, \\captionof in a center, a center made round a paragraph of its own; the caret to one there is', () => {
  const f = X.captionEdits(FIG, at(FIG));
  assert.ok(!f.edits && FIG.slice(f.p, f.p + 5) === 'A cat');
  const nofig = FIG.replace('\\caption{A cat}\n', '');
  const r = X.captionEdits(nofig, at(nofig));
  const t = applyEdits(nofig, r.edits);
  assert.ok(t.includes('\\includegraphics[width=0.5\\linewidth]{a.png}\n\\caption{}\n\\label') && t.slice(r.p - 9, r.p + 1) === '\\caption{}');
  const c = X.captionEdits(CENTER, at(CENTER));
  assert.ok(applyEdits(CENTER, c.edits).includes('{a.png}\n\\captionof{figure}{}\n\\end{center}') && c.packages[0] === 'caption');
  const pa = doc('A.\n\n\\includegraphics{a.png}\n\nB.');
  const q = X.captionEdits(pa, at(pa)), u = applyEdits(pa, q.edits);
  assert.ok(u.includes('\\begin{center}\n\\includegraphics{a.png}\n\\captionof{figure}{}\n\\end{center}') && u.slice(q.p - 1, q.p + 1) === '{}');
  assert.ok(X.captionEdits(doc('Words \\includegraphics{a} more.'), at(doc('Words \\includegraphics{a} more.'))).error);
});

ok('reset, reset with size, change picture; a CRLF file keeps CRLF', () => {
  const all = '{\\setlength{\\fboxsep}{0pt}\\fbox{\\reflectbox{\\includegraphics[width=0.5\\linewidth,trim=1cm 0 0 0,clip,angle=90,alt={x}]{a.png}}}}';
  const t = doc('A.\n\n' + all + '\n\nB.');
  assert.equal(run(t, (s, P) => X.reset(s, P, false)), doc('A.\n\n\\includegraphics[width=0.5\\linewidth,alt={x}]{a.png}\n\nB.'));
  assert.equal(run(t, (s, P) => X.reset(s, P, true)), doc('A.\n\n\\includegraphics[alt={x}]{a.png}\n\nB.'));
  assert.equal(run(CENTER, (s, P) => X.changeFile(s, P, 'b.jpg')), CENTER.replace('{a.png}', '{b.jpg}'));
  const crlf = CENTER.replace(/\n/g, '\r\n');
  const f = run(crlf, (s, P) => X.setPosition(s, P, { mode: 'float', place: 'htbp' }));
  assert.ok(!/[^\r]\n/.test(f) && f.includes('\\begin{figure}[htbp]\r\n\\centering'));
  assert.equal(run(f, (s, P) => X.setPosition(s, P, { mode: 'inline' })), crlf);
});

// ---- natural size and the box graphicx makes -----------------------------------------------------
import zlib from 'node:zlib';
function png(w, h, dpi) {
  const crcT = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[k] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih)];
  if (dpi) { const p = Buffer.alloc(9); p.writeUInt32BE(Math.round(dpi / 0.0254), 0); p.writeUInt32BE(Math.round(dpi / 0.0254), 4); p[8] = 1; parts.push(chunk('pHYs', p)); }
  parts.push(chunk('IDAT', zlib.deflateSync(Buffer.alloc((w * 3 + 1) * h))), chunk('IEND', Buffer.alloc(0)));
  return new Uint8Array(Buffer.concat(parts));
}
ok('natural size: a PNG at its pHYs (rounded dpi, as pdfTeX) or 72 dpi, a JPEG at its JFIF density, a PDF\'s MediaBox', () => {
  assert.deepEqual(X.naturalSize(png(300, 200, 150)).w.toFixed(2), '144.00');
  assert.deepEqual(X.naturalSize(png(300, 200)).w, 300);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 144, 0, 144, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3]);
  const j = X.naturalSize(jpg);
  assert.equal(j.w, 100) ; assert.equal(j.h, 50);
  const pdf = new TextEncoder().encode('%PDF-1.5\n1 0 obj << /Type /Page /MediaBox [0 0 360 216] >> endobj');
  assert.deepEqual(X.naturalSize(pdf), { w: 360, h: 216 });
  assert.equal(X.naturalSize(new Uint8Array([1, 2, 3])), null);
});
ok('the box graphicx makes: width then angle turns the sized picture, angle then width sizes the turned box; trim cuts the natural size', () => {
  const nat = { w: 200, h: 100 }, kv = (s) => X.findPicture('\\includegraphics[' + s + ']{a}', parse('\\includegraphics[' + s + ']{a}'), 0).kv;
  const a = X.graphicBox(kv('width=100pt,angle=90'), nat, 345);
  assert.ok(Math.abs(a.bw - 50) < 0.01 && Math.abs(a.bh - 100) < 0.01 && Math.abs(a.iw - 100) < 0.01);
  const b = X.graphicBox(kv('angle=90,width=100pt'), nat, 345);
  assert.ok(Math.abs(b.bw - 100) < 0.01 && Math.abs(b.bh - 200) < 0.01);
  const c = X.graphicBox(kv('trim=50 0 50 0,clip,width=0.5\\linewidth'), nat, 300);
  assert.ok(Math.abs(c.bw - 150) < 0.01 && Math.abs(c.bh - 150) < 0.01 && c.clip && c.crop.l === 0.25);
  const d = X.graphicBox(kv('width=3cm,height=3cm'), nat, 345);
  assert.ok(Math.abs(d.bw - d.bh) < 0.01);
  const e = X.graphicBox(kv('width=3cm,height=3cm,keepaspectratio'), nat, 345);
  assert.ok(Math.abs(e.bw - 2 * e.bh) < 0.01);
});

// ---- the review of bd641ad -----------------------------------------------------------------------
import fs from 'node:fs';
ok('review H2, H7: a size key added to a turned picture goes before its angle, as graphicx needs', () => {
  const t = doc('\\begin{center}\n\\includegraphics[angle=-90]{a.png}\n\\end{center}');
  assert.equal(run(t, (s, P) => X.setSize(s, P, null, '3cm', false)), t.replace('[angle=-90]', '[height=3cm,angle=-90]'));
  const u = doc('\\includegraphics[width=3cm,angle=90]{a.png}');
  assert.equal(run(u, (s, P) => X.setSize(s, P, '3cm', '3cm', true)), u.replace('[width=3cm,angle=90]', '[width=3cm,height=3cm,angle=90]'));
  // the page's box as pdfLaTeX's (tex/box.tex): sizes after the angle size the turned box
  const kv = (o) => X.findPicture('\\includegraphics[' + o + ']{a}', parse('\\includegraphics[' + o + ']{a}'), 0).kv;
  const nat = { w: 200, h: 100 };
  const B = X.graphicBox(kv('width=3cm,angle=90,height=3cm'), nat, 345);
  assert.ok(Math.abs(B.bw - 42.68) < 0.1 && Math.abs(B.bh - 85.36) < 0.1, JSON.stringify(B));
  const F = X.graphicBox(kv('width=3cm,height=3cm,angle=90'), nat, 345);
  assert.ok(Math.abs(F.bw - 85.36) < 0.1 && Math.abs(F.bh - 85.36) < 0.1);
});
ok('review L5: Rotate leaves an angle given by a macro alone', () => {
  const t = doc('\\includegraphics[angle=\\myangle]{a.png}');
  assert.ok(X.rotate(t, at(t), -90).error);
  assert.equal(X.angleKnown(t, at(t)), false);
});
ok('review H6, M6, L1: the natural size as the three engines read it: Exif, JFIF in dots per cm, a PDF\'s /Rotate', () => {
  // a 300 by 150 JPEG with only Exif at 180 dpi (Canon), as pdfTeX: 120.45pt
  const jpg = (app) => new Uint8Array([0xff, 0xd8, ...app, 0xff, 0xc0, 0, 17, 8, 0, 150, 1, 44, 3]);
  const tiff = (le, x, unit) => {
    const w16 = (v) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255]), w32 = (v) => (le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
    const ifd = [...w16(3), ...w16(0x011a), ...w16(5), ...w32(1), ...w32(50), ...w16(0x011b), ...w16(5), ...w32(1), ...w32(58), ...w16(0x0128), ...w16(3), ...w32(1), ...w16(unit), 0, 0, ...w32(0)];
    const body = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...w16(42), ...w32(8), ...ifd];
    while (body.length < 50) body.push(0);
    body.push(...w32(x), ...w32(1), ...w32(x), ...w32(1));
    const seg = [0x45, 0x78, 0x69, 0x66, 0, 0, ...body];
    return [0xff, 0xe1, (seg.length + 2) >> 8, (seg.length + 2) & 255, ...seg];
  };
  const pt = (r) => Math.round(r.w * 72.27 / 72 * 100) / 100;
  assert.equal(pt(X.naturalSize(jpg(tiff(true, 180, 2)))), 120.45);
  assert.equal(pt(X.naturalSize(jpg(tiff(false, 300, 2)))), 72.27);
  // JFIF in dots per cm: 118 is 299 dpi to pdfTeX (72.51pt for 300 px)
  const jfif = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 2, 0, 118, 0, 118, 0, 0];
  assert.equal(pt(X.naturalSize(jpg(jfif))), 72.51);
  // the reviewer's files, measured by pdfTeX, XeTeX and LuaTeX (tex/nat*.log)
  const dir = '/tmp/review-b8-out/tex/';
  if (fs.existsSync(dir + 'jcanon.jpg')) for (const [f, w] of [['jcanon.jpg', 120.45], ['jexif.jpg', 72.27], ['jboth.jpg', 301.12], ['jcm.jpg', 72.51], ['prot.pdf', 100.37], ['p0.pdf', 200.75]]) assert.ok(Math.abs(X.naturalSize(new Uint8Array(fs.readFileSync(dir + f))).w * 72.27 / 72 - w) < 0.02, f);
  const pdf = new TextEncoder().encode('%PDF-1.5\n1 0 obj << /Type /Page /MediaBox [0 0 200 100] /Rotate 90 >> endobj');
  assert.deepEqual(X.naturalSize(pdf), { w: 100, h: 200 });
});
ok('review H8, M3: starred captions keep their stars both ways; figure* keeps its star', () => {
  const t = doc('\\begin{figure}[htbp]\n\\centering\n\\includegraphics{a.png}\n\\caption*{Unnumbered}\n\\end{figure}');
  const i = run(t, (s, P) => X.setPosition(s, P, { mode: 'inline' }));
  assert.ok(i.includes('\\captionof*{figure}{Unnumbered}'), i);
  assert.equal(run(i, (s, P) => X.setPosition(s, P, { mode: 'float', place: 'htbp' })), t);
  const w = doc('\\begin{figure*}[t]\n\\centering\n\\includegraphics{a.png}\n\\end{figure*}');
  assert.ok(X.setPosition(w, at(w), { mode: 'inline' }).error && X.setPosition(w, at(w), { mode: 'wrap', side: 'r' }).error);
  assert.equal(run(w, (s, P) => X.setPosition(s, P, { mode: 'float', place: 'b' })), w.replace('[t]', '[b]'));
});
ok('review M4: wrap only where wrapfig wraps: not in a quote, a theorem or a proof, not before a heading', () => {
  for (const env of ['quote', 'theorem', 'proof', 'abstract']) {
    const t = doc('\\begin{' + env + '}\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\nText.\n\\end{' + env + '}');
    assert.match(X.whyFixed(t, at(t), 'wrap', {}), new RegExp(env));
    assert.equal(X.whyFixed(t, at(t), 'float', {}), null);
  }
  assert.match(X.whyFixed(CENTER, at(CENTER), 'wrap', { nextIsHeading: true }), /heading/);
});

ok('verification N1, N5, N8: JFIF of no unit hides Exif; Exif truncated, unit "none" as inches; keyEdits taking the angle away', () => {
  // the fixture: JFIF of unit 0 (PIL's header) and Exif at 300 dpi; pdfLaTeX, XeLaTeX and the
  // page's TeX give 301.12pt (72 dpi)
  const ea = new Uint8Array(fs.readFileSync(new URL('./fixtures/jfif0-exif300.jpg', import.meta.url)));
  assert.ok(Math.abs(X.naturalSize(ea).w * 72.27 / 72 - 301.124) < 0.01);
  const tiff = (x, den, unit) => {
    const w16 = (v) => [v & 255, v >> 8], w32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24];
    const ifd = [...w16(2), ...w16(0x011a), ...w16(5), ...w32(1), ...w32(38), ...w16(0x0128), ...w16(3), ...w32(1), ...w16(unit), 0, 0, ...w32(0)];
    const body = [0x49, 0x49, ...w16(42), ...w32(8), ...ifd];
    while (body.length < 38) body.push(0);
    body.push(...w32(x), ...w32(den));
    const seg = [0x45, 0x78, 0x69, 0x66, 0, 0, ...body];
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (seg.length + 2) >> 8, (seg.length + 2) & 255, ...seg, 0xff, 0xc0, 0, 17, 8, 0, 150, 1, 44, 3]);
  };
  const pt = (b) => Math.round(X.naturalSize(b).w * 72.27 / 72 * 100) / 100;
  assert.equal(pt(tiff(2997, 10, 2)), 72.51);   // 299.7 dpi: 299, as pdfTeX
  assert.equal(pt(tiff(300, 1, 1)), 72.27);     // no unit: taken as dots per inch, as pdfTeX
  const t = doc('\\includegraphics[width=1cm,angle=90]{a}');
  assert.equal(run(t, (s, P) => ({ edits: X.keyEdits(s, P, { angle: null, height: '2cm' }) })), doc('\\includegraphics[width=1cm,height=2cm]{a}'));
  // free on a hand written angle then width: both before the angle, so TeX sizes them as written
  const u = doc('\\includegraphics[angle=90,width=3cm]{a}');
  assert.equal(run(u, (s, P) => X.setSize(s, P, '3cm', '2cm', true)), doc('\\includegraphics[width=3cm,height=2cm,angle=90]{a}'));
  // wrap allowed where wrapfig works (a language's environment), refused in a quote
  const ol = doc('\\begin{otherlanguage}{german}\n\\begin{center}\n\\includegraphics{a}\n\\end{center}\nText.\n\\end{otherlanguage}');
  assert.equal(X.whyFixed(ol, at(ol), 'wrap', {}), null);
});

ok('a stranger\'s text is read in bounded time', () => {
  const t0 = Date.now();
  const opts = doc('\\includegraphics[' + 'a={x},['.repeat(20000) + ']{x}');
  const Q = at(opts);
  if (Q) { X.altOf(opts, Q); X.sizeOf(opts, Q); X.positionOf(opts, Q); X.cropOf(Q, { w: 1, h: 1 }); }
  const nest = doc('\\fbox{'.repeat(250) + '\\includegraphics{y}' + '}'.repeat(250));
  const P = at(nest);
  assert.ok(P && P.wraps.length === 250);
  X.altOf(nest, P); X.sizeOf(nest, P); X.positionOf(nest, P); X.border(nest, P);
  X.naturalSize(new Uint8Array(1 << 19).fill(0xff));
  X.naturalSize(new TextEncoder().encode('%PDF-1.5 ' + '/MediaBox ['.repeat(40000)));
  assert.ok(Date.now() - t0 < 3000, Date.now() - t0);
});

console.log('picture: ' + n + ' passed');
