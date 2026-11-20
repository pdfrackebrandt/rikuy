// Picture Format's picture tools (src/picfx.js over tex/vendor/pic/rikuy-pic.wasm, the C of
// tex/native/pic/pic.c): the pixels each correction gives, a resize's means, PNG and JPEG written
// and read back; the comment that says where a new file came from, written and read back, and the
// edits that point a picture at it and back at its first file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as F from '../src/picfx.js';

let n = 0;
const ok = async (name, f) => { try { await f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const apply = (src, edits) => { for (const x of [...edits].sort((a, b) => b.s - a.s)) src = src.slice(0, x.s) + x.t + src.slice(x.e); return src; };

// a PNG of w by h, its left half one colour and its right half another (RGBA)
function png(w, h, left, right) {
  const crcT = []; for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[k] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const rows = [];
  for (let y = 0; y < h; y++) { rows.push(Buffer.from([0])); for (let x = 0; x < w; x++) rows.push(Buffer.from(x < w / 2 ? left : right)); }
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
}
const at = (m, x, y) => [...m.px.subarray(4 * (y * m.w + x), 4 * (y * m.w + x) + 4)];

await ok('the module loads: one import, the exports the page calls', async () => {
  const bytes = fs.readFileSync(new URL('../tex/vendor/pic/rikuy-pic.wasm', import.meta.url));
  const m = new WebAssembly.Module(bytes);
  assert.deepEqual(WebAssembly.Module.imports(m).map((x) => x.name), ['emscripten_notify_memory_growth']);
  assert.ok(await F.loadPicFx(bytes));
  assert.ok(F.picFxReady());
});

const P = png(40, 20, [200, 100, 50, 255], [20, 40, 220, 255]);
await ok('as it is: a PNG read and written again gives the same pixels', () => {
  const r = F.render(P, {});
  assert.equal(r.ext, 'png'); assert.equal(r.w, 40); assert.equal(r.h, 20); assert.equal(r.alpha, false);
  const m = F.measure(r.bytes);
  assert.deepEqual(at(m, 5, 5), [200, 100, 50, 255]); assert.deepEqual(at(m, 35, 5), [20, 40, 220, 255]);
});

await ok('Corrections: brightness adds, contrast spreads from the middle gray, sharpen and soften at an edge', () => {
  const b = F.measure(F.render(P, { brightness: 0.2 }).bytes);
  assert.deepEqual(at(b, 5, 5).slice(0, 3), [251, 151, 101]);
  const c = F.measure(F.render(P, { contrast: 0.4 }).bytes);
  // (200 - 127.5) / 0.6 + 127.5 = 248.3; (100 - 127.5) / 0.6 + 127.5 = 81.7
  assert.deepEqual(at(c, 5, 5).slice(0, 3), [248, 82, 0]);
  const cl = F.measure(F.render(P, { contrast: -0.4 }).bytes);
  assert.deepEqual(at(cl, 5, 5).slice(0, 3), [171, 111, 81]);
  // at the edge between the halves a sharpened pixel goes past both colours, a softened one between
  const sh = F.measure(F.render(P, { sharpen: 0.5 }).bytes), so = F.measure(F.render(P, { sharpen: -1 }).bytes);
  assert.ok(at(sh, 19, 5)[0] > 200, String(at(sh, 19, 5)));
  assert.ok(at(so, 19, 5)[0] < 200 && at(so, 19, 5)[0] > 20, String(at(so, 19, 5)));
  assert.deepEqual(at(sh, 5, 5), [200, 100, 50, 255]);
});

await ok('Color: saturation, tone, grayscale, sepia, washout, black and white, a tint', () => {
  const g = F.measure(F.render(P, { saturation: 0 }).bytes);
  const p = at(g, 5, 5);
  assert.ok(p[0] === p[1] && p[1] === p[2], String(p));
  assert.deepEqual(at(F.measure(F.render(P, { recolor: 'gray' }).bytes), 5, 5), p);
  const sp = at(F.measure(F.render(P, { recolor: 'sepia' }).bytes), 5, 5);
  assert.ok(sp[0] > sp[1] && sp[1] > sp[2], String(sp));
  const w = at(F.measure(F.render(P, { recolor: 'washout' }).bytes), 35, 5);
  assert.ok(w[0] > 170 && w[2] > 200, String(w));
  assert.deepEqual(at(F.measure(F.render(P, { recolor: 'bw' }).bytes), 5, 5).slice(0, 3), [0, 0, 0]);
  // a tint: the middle gray is the colour itself, black stays black
  const t = F.measure(F.render(png(2, 1, [128, 128, 128, 255], [0, 0, 0, 255]), { recolor: 'tint', tint: '2E75B6' }).bytes);
  assert.deepEqual(at(t, 0, 0).slice(0, 3).map((v) => Math.abs(v - [46, 117, 182][at(t, 0, 0).indexOf(v)]) <= 2), [true, true, true]);
  assert.deepEqual(at(t, 1, 0).slice(0, 3), [0, 0, 0]);
  const warm = at(F.measure(F.render(P, { tone: 0.5 }).bytes), 35, 5);
  assert.ok(warm[0] > 20 && warm[2] < 220, String(warm));
  const s2 = at(F.measure(F.render(P, { saturation: 2 }).bytes), 5, 5);
  assert.ok(s2[0] > 200 && s2[2] < 50, String(s2));
});

await ok('Transparency: alpha times 1 - t, written as a PNG even from a JPEG', () => {
  const r = F.render(P, { transparency: 0.5 });
  assert.equal(r.ext, 'png'); assert.equal(r.alpha, true);
  assert.equal(at(F.measure(r.bytes), 5, 5)[3], 128);
  const j = F.render(P, {}, { jpeg: true });
  assert.equal(j.ext, 'jpg');
  assert.deepEqual([...j.bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const jt = F.render(j.bytes, { transparency: 0.3 }, { jpeg: true });
  assert.equal(jt.ext, 'png');
  // a JPEG read back: within a few levels of its colours
  const jm = F.measure(j.bytes), q = at(jm, 5, 5);
  assert.ok(Math.abs(q[0] - 200) < 8 && Math.abs(q[1] - 100) < 8 && Math.abs(q[2] - 50) < 8, String(q));
});

await ok('Compress: down to the width asked, each pixel the mean of those it covers', () => {
  const r = F.render(png(40, 20, [255, 255, 255, 255], [0, 0, 0, 255]), {}, { widthPx: 4 });
  assert.equal(r.w, 4); assert.equal(r.h, 2);
  const m = F.measure(r.bytes);
  assert.deepEqual(at(m, 0, 0), [255, 255, 255, 255]); assert.deepEqual(at(m, 3, 1), [0, 0, 0, 255]);
  // an odd width: the pixel over the edge is gray
  const o = F.measure(F.render(png(10, 2, [255, 255, 255, 255], [0, 0, 0, 255]), {}, { widthPx: 3 }).bytes);
  assert.ok(at(o, 1, 0)[0] > 100 && at(o, 1, 0)[0] < 160, String(at(o, 1, 0)));
  // never up
  assert.equal(F.render(P, {}, { widthPx: 400 }).w, 40);
  // a picture of more than 40 million pixels is refused before it is decoded (its header alone)
  assert.match(F.render(png(10000, 4001, [0, 0, 0, 255], [0, 0, 0, 255]), {}).error, /40 million/);
  assert.ok(F.render(new Uint8Array([1, 2, 3, 4]), {}).error);
});

await ok('the comment: written, read back; settings cleaned; a name from the first file and the settings', () => {
  const s = { brightness: 0.2, contrast: -0.2, recolor: 'tint', tint: '#2e75b6', junk: 5, saturation: 1 };
  assert.deepEqual(F.clean(s), { brightness: 0.2, contrast: -0.2, recolor: 'tint', tint: '2E75B6' });
  assert.equal(F.noteText('figs/a.png', s), 'from figs/a.png, brightness 0.2, contrast -0.2, recolor tint, tint 2E75B6');
  assert.deepEqual(F.readNote('} % rikuy: ' + F.noteText('figs/a.png', s)), { orig: 'figs/a.png', settings: F.clean(s) });
  const nm = F.editedName('figs/a.png', s, 'png');
  assert.match(nm, /^figs\/a-edited-[0-9a-f]{8}\.png$/);
  assert.equal(F.editedName('figs/a.png', s, 'png'), nm);
  assert.notEqual(F.editedName('figs/a.png', { brightness: 0.4 }, 'png'), nm);
  assert.equal(F.clean({ brightness: 9 }).brightness, 1);
  // (no name that climbs out of the project's folder)
  assert.match(F.editedName('../../x/./a.png', s, 'png'), /^x\/a-edited-[0-9a-f]{8}\.png$/);
  assert.match(F.editedName('/etc/a.png', s, 'png'), /^etc\/a-edited-[0-9a-f]{8}\.png$/);
  assert.equal(F.readNote('% rikuy: from a.png, brightness 0.2 trailing words'), null);
});

await ok('the edits: the file and the comment at the line\'s end; plain settings put the first file back', () => {
  const pre = 'A\n\\begin{center}\n';
  const line = '\\includegraphics[width=0.5\\linewidth]{a.png}';
  const src = pre + line + '\n\\end{center}\n';
  const P2 = { file: { is: src.indexOf('{a.png}') + 1, ie: src.indexOf('{a.png}') + 6 }, e: src.indexOf(line) + line.length };
  const nm = F.editedName('a.png', { brightness: 0.2 }, 'png');
  const one = apply(src, F.fxEdits(src, P2, 'a.png', 'a.png', { brightness: 0.2 }, nm));
  assert.equal(one, pre + line.replace('a.png', nm) + ' % rikuy: from a.png, brightness 0.2\n\\end{center}\n');
  const Q = { file: { is: one.indexOf(nm), ie: one.indexOf(nm) + nm.length }, e: one.indexOf(nm) + nm.length + 1 };
  const L = F.lineOf(one, Q.e);
  assert.deepEqual([L.note.orig, L.note.settings], ['a.png', { brightness: 0.2 }]);
  const nm2 = F.editedName('a.png', { brightness: 0.2, contrast: 0.2 }, 'png');
  const two = apply(one, F.fxEdits(one, Q, nm, 'a.png', { brightness: 0.2, contrast: 0.2 }, nm2));
  assert.equal(two, pre + line.replace('a.png', nm2) + ' % rikuy: from a.png, brightness 0.2, contrast 0.2\n\\end{center}\n');
  const Q2 = { file: { is: two.indexOf(nm2), ie: two.indexOf(nm2) + nm2.length }, e: two.indexOf(nm2) + nm2.length + 1 };
  assert.equal(apply(two, F.fxEdits(two, Q2, nm2, 'a.png', {}, null)), src);
  // a line with a comment of its own: the note after it, without a second %; \r\n kept
  const c = src.replace(line + '\n', line + '% mine\r\n');
  const Pc = { ...P2 };
  const cc = apply(c, F.fxEdits(c, Pc, 'a.png', 'a.png', { saturation: 0 }, 'x.png'));
  assert.ok(cc.includes('{x.png}% mine rikuy: from a.png, saturation 0\r\n'), cc);
  const Qc = { file: { is: cc.indexOf('x.png'), ie: cc.indexOf('x.png') + 5 }, e: cc.indexOf('x.png') + 6 };
  assert.equal(apply(cc, F.fxEdits(cc, Qc, 'x.png', 'a.png', {}, null)), c);
  // a \% is no comment
  assert.equal(F.lineOf('} 50\\% wide\n', 0).comment, false);
  assert.equal(F.lineOf('}\\includegraphics{b}\n', 0).other, true);
});

console.log('picfx: ' + n + ' groups passed');
