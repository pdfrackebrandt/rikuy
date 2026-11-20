// Picture Format's Corrections, Color, Transparency and Compress Pictures, as Word has them, on a
// PNG or JPEG of the project. The pixels are worked on in C (tex/native/pic/pic.c, built by
// tex/build_tools.sh pic into a standalone WebAssembly module of 80 KB), fetched the first time one
// of these tools runs and checked against the hash the build wrote; a page that cannot load it
// says so plainly and changes nothing (an optional tool: no JavaScript copy of it).
//
// The picture's own file is never changed. A new file is written beside it, named after it and the
// settings' hash (a-edited-3f2a9c1b.png: the same settings give the same file, and undo finds the
// file of before still there), \includegraphics points at it, and a comment at the end of its line
// says where it came from and how:
//
//   \includegraphics[width=0.5\linewidth]{a-edited-3f2a9c1b.png} % rikuy: from a.png, brightness 0.2, contrast -0.2
//
// Every change starts again from the first file with all the settings, so corrections never wear
// a picture down; Reset Picture puts the first file back and takes the comment off. The comment is
// plain LaTeX that TeX skips, and the document compiles anywhere with the files it has.

let X = null;

export function picFxReady() { return !!X; }
// bytes: the module. Resolves to true when it runs (under node too: test/picfx.test.mjs)
export async function loadPicFx(bytes) {
  try {
    const { instance } = await WebAssembly.instantiate(bytes, { env: { emscripten_notify_memory_growth() {} } });
    const x = instance.exports;
    if (x._initialize) x._initialize();
    X = x;
    return true;
  } catch (e) {
    X = null;
    return false;
  }
}

// ---- the settings --------------------------------------------------------------------------------
// [key, default, low, high]: sharpen and brightness and contrast as Word's percentages / 100,
// saturation 0..4 (1 as it is), tone -1..1 (Word's 4700 K to 11200 K: 6500 K is 0), transparency
// 0..1, compress the pixels per inch a compressed picture keeps
export const KEYS = [['sharpen', 0, -1, 1], ['brightness', 0, -1, 1], ['contrast', 0, -1, 1], ['saturation', 1, 0, 4], ['tone', 0, -1, 1], ['transparency', 0, 0, 1], ['compress', 0, 50, 600]];
export const RECOLORS = { gray: 1, sepia: 2, washout: 3, bw: 4, tint: 5 };
const r3 = (v) => Math.round(v * 1000) / 1000;
// settings cleaned: numbers in range, a recolor Rikuy knows, a tint as six hex digits
export function clean(o) {
  const out = {};
  for (const [k, d, lo, hi] of KEYS) {
    const v = parseFloat(o && o[k]);
    if (Number.isFinite(v) && Math.abs(v - d) > 1e-9) out[k] = r3(Math.min(hi, Math.max(lo, v)));
  }
  if (o && o.recolor && RECOLORS[o.recolor]) {
    out.recolor = o.recolor;
    if (o.recolor === 'tint') { const t = String(o.tint || '').replace(/^#/, '').toUpperCase(); out.tint = /^[0-9A-F]{6}$/.test(t) ? t : '2E75B6'; }
  }
  return out;
}
export const isPlain = (o) => Object.keys(clean(o)).length === 0;
// the comment's words: "from a.png, brightness 0.2, recolor tint, tint 2E75B6"
export function noteText(orig, o) {
  const c = clean(o);
  return 'from ' + orig + Object.entries(c).map(([k, v]) => ', ' + k + ' ' + v).join('');
}
// the comment at the end of a line, read: { orig, settings } or null
export function readNote(line) {
  const m = /(?:^|\s)rikuy: from ([^,\s%{}\\]{1,240})((?:, [a-z]+ [-\w.]{1,12}){0,12})\s*$/.exec(String(line || ''));
  if (!m) return null;
  const o = {};
  for (const x of m[2].split(', ').filter(Boolean)) { const [k, v] = x.split(' '); o[k] = k === 'recolor' || k === 'tint' ? v : parseFloat(v); }
  return { orig: m[1], settings: clean(o) };
}
// FNV-1a of a string, as eight hex digits: the new file's name from its first file and settings
export function hash8(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
// the new file's name: beside the first, its kind the one it is written as
// (orig: the project's own name of the file, never a document's text: no "..", no leading "/",
// so a project downloaded as a zip holds no name that climbs out of its folder)
export function editedName(orig, o, ext) {
  orig = String(orig).split('/').filter((x) => x && x !== '..' && x !== '.').join('/') || 'picture';
  const dot = orig.lastIndexOf('.'), base = dot > orig.lastIndexOf('/') ? orig.slice(0, dot) : orig;
  return base + '-edited-' + hash8(noteText(orig, o) + '|' + ext) + '.' + ext;
}

// ---- where the comment goes ----------------------------------------------------------------------
// The line of a picture: from the end of its \includegraphics (e) to the line's end, and the note on
// it, if any. { at: where a new note goes (the line's end), note: { s, e, orig, settings } | null,
// comment: whether the line already holds a comment, other: another \includegraphics after it }
export function lineOf(src, e) {
  let z = src.indexOf('\n', e);
  if (z < 0) z = src.length;
  if (src[z - 1] === '\r') z--;
  const rest = src.slice(e, z);
  // (a % that is no \%)
  const pc = /(^|[^\\])%/.exec(rest);
  const out = { at: z, note: null, comment: !!pc, other: /\\includegraphics/.test(pc ? rest.slice(0, pc.index + 1) : rest) };
  const m = /( ?%)? rikuy: from [^\r\n]*$/.exec(rest);
  if (m) {
    const R = readNote(rest.slice(m.index));
    if (R) out.note = { s: e + m.index, e: z, ...R, own: !!m[1] };
  }
  return out;
}
// The edits that point a picture at its new file and say so at its line's end (or, settings plain,
// back at its first file with the comment gone). P: { file: { is, ie }, e } as src/picture.js reads it.
export function fxEdits(src, P, current, orig, settings, newName) {
  const L = lineOf(src, P.e);
  const edits = [];
  const plain = isPlain(settings);
  const name = plain ? orig : newName;
  if (name !== current) edits.push({ s: P.file.is, e: P.file.ie, t: name });
  const text = plain ? '' : (L.note ? (L.note.own ? ' %' : '') : L.comment ? '' : ' %') + ' rikuy: ' + noteText(orig, settings);
  if (L.note) { if (src.slice(L.note.s, L.note.e) !== text) edits.push({ s: L.note.s, e: L.note.e, t: text }); }
  else if (text) edits.push({ s: L.at, e: L.at, t: text });
  return edits;
}

// ---- the pixels --------------------------------------------------------------------------------
// The first file's bytes with the settings worked in: { bytes, ext ('png' | 'jpg'), w, h, alpha } or
// { error }. widthPx: the width a compressed picture keeps (none: as it is).
export function render(bytes, settings, o = {}) {
  if (!X) return { error: 'The picture tools did not load.' };
  // (a trap in the module, a picture that broke it: the module is loaded afresh next time)
  try { return renderIn(bytes, settings, o); } catch (e) { X = null; return { error: 'The picture tools stopped on this file: it is no PNG or JPEG they can read.' }; }
}
function renderIn(bytes, settings, o) {
  const s = clean(settings);
  const n = bytes.length;
  const p = X.pic_in(n);
  if (!p) return { error: 'The picture is too large to work on here.' };
  new Uint8Array(X.memory.buffer, p, n).set(bytes);
  const dec = X.pic_decode(n);
  if (dec === -1) { X.pic_done(); return { error: 'The picture has more than 40 million pixels: too large to work on in a browser tab.' }; }
  if (!dec) { X.pic_done(); return { error: 'This file is no PNG or JPEG the picture tools read (a CMYK JPEG, a 16 bit PNG with odd chunks, or a broken file).' }; }
  const w0 = X.pic_width(), h0 = X.pic_height();
  const rc = s.recolor ? RECOLORS[s.recolor] : 0, tint = s.tint ? [0, 2, 4].map((i) => parseInt(s.tint.slice(i, i + 2), 16)) : [0, 0, 0];
  X.pic_adjust(s.sharpen || 0, s.brightness || 0, s.contrast || 0, s.saturation ?? 1, s.tone || 0, rc, tint[0], tint[1], tint[2], s.transparency || 0);
  if (o.widthPx && o.widthPx < w0) X.pic_resize(Math.max(1, Math.round(o.widthPx)), Math.max(1, Math.round(h0 * o.widthPx / w0)));
  const w = X.pic_width(), h = X.pic_height();
  // a JPEG stays a JPEG unless it is to see through; a PNG stays a PNG
  const alpha = !!(s.transparency || X.pic_has_alpha());
  const jpeg = !!o.jpeg && !alpha;
  const len = X.pic_encode(jpeg ? 1 : 0, o.quality || 90, alpha ? 1 : 0);
  if (!len) { X.pic_done(); return { error: 'The picture could not be written.' }; }
  let out = new Uint8Array(X.memory.buffer, X.pic_out(), len).slice();
  X.pic_done();
  // (the first file's pixels per inch, scaled with a compressed width: TeX sizes a picture with no
  // width of its own by them, so the new file prints the size the first one did)
  if (o.dpi && o.dpi[0] > 0 && o.dpi[1] > 0) out = withDensity(out, jpeg, o.dpi[0] * w / w0, o.dpi[1] * h / h0);
  return { bytes: out, ext: jpeg ? 'jpg' : 'png', w, h, w0, h0, alpha };
}
// A PNG's pHYs (pixels per metre) put after its IHDR, or a JFIF's density (stb_image_write's
// header: units at byte 13, X and Y at 14 and 16) made dots per inch
const CRC = (() => { const t = new Uint32Array(256); for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function withDensity(bytes, jpeg, dx, dy) {
  if (jpeg) {
    if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[6] === 0x4a && bytes[7] === 0x46)) return bytes;
    const b = bytes.slice(), X2 = Math.max(1, Math.min(65535, Math.round(dx))), Y2 = Math.max(1, Math.min(65535, Math.round(dy)));
    b[13] = 1; b[14] = X2 >> 8; b[15] = X2 & 255; b[16] = Y2 >> 8; b[17] = Y2 & 255;
    return b;
  }
  if (!(bytes[0] === 0x89 && bytes[12] === 0x49 && bytes[13] === 0x48)) return bytes;
  const at = 8 + 25;   // after the signature and the IHDR chunk (13 bytes of data)
  const ppm = (v) => Math.max(1, Math.round(v / 0.0254));
  const c = new Uint8Array(21), dv = new DataView(c.buffer);
  dv.setUint32(0, 9); c.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm(dx)); dv.setUint32(12, ppm(dy)); c[16] = 1;
  dv.setUint32(17, crc32(c.subarray(4, 17)));
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, at)); out.set(c, at); out.set(bytes.subarray(at), at + 21);
  return out;
}
// a picture's pixels read only: for the tests and for a dialog's numbers
export function measure(bytes) {
  if (!X) return null;
  const p = X.pic_in(bytes.length);
  if (!p) return null;
  new Uint8Array(X.memory.buffer, p, bytes.length).set(bytes);
  if (!X.pic_decode(bytes.length)) { X.pic_done(); return null; }
  const w = X.pic_width(), h = X.pic_height(), px = new Uint8Array(X.memory.buffer, X.pic_pixels(), w * h * 4).slice();
  X.pic_done();
  return { w, h, px };
}
