// Picture Format's Corrections, Color, Transparency and Compress Pictures, as Word has them: the
// pixels worked on in C (src/picfx.js over tex/native/pic/pic.c), a new file beside the picture's
// own, \includegraphics pointed at it with a comment that says where it came from; Reset Picture
// goes back to the first file (src/cmd/picture.js). One commit each, one undo.

import { register } from '../commands.js';
import * as F from '../picfx.js';
import * as X from '../picture.js';
import { parse } from '../parser.js';
import { atomOfEl } from '../editor.js';
import { mapPos } from '../wrap.js';
import { openMenu } from '../ui/kit.js';
import { asset as appAsset } from '../pwa.js';
import { picFxDialog, compressDialog } from '../ui/picturedialogs.js';

const WHY = 'Select a picture first: click it on the page.';
// (the project's file the picture names, \includegraphics{a} finding a.png as TeX does)
const fileOf = (app, h) => { const st = app.picFxState(h); return app.picAssetName(st.orig) || st.orig; };
const raster = (app) => { const h = app.picHere(); return !!h && /\.(png|jpe?g)$/i.test(fileOf(app, h)); };
const whyNot = (app) => {
  const h = app.picHere();
  if (!h) return WHY;
  const f = fileOf(app, h);
  if (!app.picAssetName(app.picFxState(h).orig)) return 'The picture\'s file, ' + app.picFxState(h).orig + ', is not in the project: load it first.';
  return /\.(pdf|eps)$/i.test(f) ? 'Corrections work on PNG and JPEG pictures: TeX places a PDF or EPS picture as it is.' : 'Corrections work on PNG and JPEG pictures.';
};
const P = (id, name, o) => ({ id, name, when: raster, whyNot, ...o });
const ICON = {
  corrections: '<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" style="fill:currentColor" opacity=".45"/>',
  color: '<path d="M10 3.5c-3.6 0-6.5 2.6-6.5 6 0 3 2.6 5.5 5.5 5.5h1c.8 0 1.2.9.8 1.5-.5.8.1 1.5 1 1.5 3.5 0 4.7-3.5 4.7-6.5 0-4.4-2.9-8-6.5-8z"/><circle cx="7" cy="8" r="1"/><circle cx="10.5" cy="6.5" r="1"/><circle cx="13.5" cy="9" r="1"/>',
  transparency: '<path d="M3.5 3.5h13v13h-13z"/><path d="M3.5 3.5h4.3v4.3H3.5zM12.2 3.5h4.3v4.3h-4.3zM7.8 7.8h4.4v4.4H7.8zM3.5 12.2h4.3v4.3H3.5zM12.2 12.2h4.3v4.3h-4.3z" style="fill:currentColor;stroke:none" opacity=".45"/>',
  compress: '<path d="M3.5 4.5h13v11h-13z"/><path d="M7 7l3 3 3-3M7 13l3-3 3 3"/>'
};
const pct = (v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%';

register(
  P('picture-corrections', 'Corrections', { title: 'Corrections: sharpen or soften, brightness and contrast, worked into a copy of the picture (its file kept; Reset Picture goes back)', tab: 'picture-format', group: 'adjust', order: 3, kind: 'menu', icon: ICON.corrections, label: 'Corrections',
    synonyms: ['Brightness', 'Contrast', 'Sharpen', 'Soften', 'Picture corrections'], menu: { picture: 96 }, run: (app, args) => (args ? app.picFx(args) : app.picFxMenu('corrections')) }),
  P('picture-color', 'Color', { title: 'Color: saturation, colour tone, and recolour (grayscale, sepia, washout, black and white, a tint), worked into a copy of the picture', tab: 'picture-format', group: 'adjust', order: 4, kind: 'menu', icon: ICON.color, label: 'Color',
    synonyms: ['Recolor', 'Grayscale', 'Black and white', 'Sepia', 'Saturation', 'Color tone', 'Picture colour'], menu: { picture: 97 }, run: (app, args) => (args ? app.picFx(args) : app.picFxMenu('color')) }),
  P('picture-transparency', 'Transparency', { title: 'Transparency: the picture seen through, 15% to 95% (a PNG with an alpha channel; pdfLaTeX, XeLaTeX and LuaLaTeX keep it)', tab: 'picture-format', group: 'adjust', order: 5, kind: 'menu', icon: ICON.transparency, label: 'Transparency',
    synonyms: ['See through', 'Opacity', 'Fade picture'], menu: { picture: 98 }, run: (app, args) => (args ? app.picFx(args) : app.picFxMenu('transparency')) }),
  P('picture-fx-options', 'Format Picture', { title: 'Format Picture: sharpen, brightness, contrast, saturation, tone, recolour and transparency in numbers', synonyms: ['Picture Corrections Options', 'Picture Color Options', 'Picture Transparency Options'],
    run: (app, args) => (args ? app.picFx(args, true) : picFxDialog(app)) }),
  { id: 'picture-compress', name: 'Compress Pictures', title: 'Compress Pictures: the PNG and JPEG pictures of the document made no larger than their place needs at 96, 150 or 220 pixels per inch; the bytes saved are said', tab: 'picture-format', group: 'adjust', order: 6, icon: ICON.compress, label: 'Compress Pictures',
    also: [], synonyms: ['Reduce file size', 'Picture resolution', 'Downsample'], when: (app) => !!app.files && [...(app.assetBlobs || new Map()).keys()].some((k) => /\.(png|jpe?g)$/i.test(k)), whyNot: () => 'The document has no PNG or JPEG picture.',
    run: (app, args) => (args ? app.picCompress(args) : compressDialog(app)) }
);

let loading = null;
// Compress Pictures for one picture: { widthPx: the new width of the whole file, kept part and all }
// or { why } where it is left as it is. Its pixels per inch printed: the part of its width kept by
// trim or viewport, over that part's printed width as graphicx sizes it (graphicBox: before an angle
// turns it, or after it as graphicx's order says). A picture that a macro sizes (\\resizebox,
// \\scalebox) or turns by an angle not a quarter turn is left as it is, with that said.
export function compressPlan(P, nat, lw, ppi) {
  if (!nat || !nat.px) return { why: 'its size could not be read' };
  if ((P.wraps || []).some((w) => w.kind === 'resize' || w.kind === 'scale')) return { why: 'a macro sizes it' };
  const B = X.graphicBox(P.kv || [], nat, lw);
  if (!B || !(B.iw > 0)) return { why: 'its printed size could not be read' };
  if (B.angle && Math.abs(B.angle % 90) > 1e-6) return { why: 'it is turned by ' + B.angle + '°' };
  const keep = 1 - B.crop.l - B.crop.r;
  if (!(keep > 0)) return { why: 'its crop keeps nothing' };
  const eff = nat.px[0] * keep / (B.iw / 72.27);
  if (eff <= ppi * 1.02) return { why: 'already ' + Math.round(eff) + ' ppi as printed' };
  return { widthPx: Math.max(1, Math.ceil(nat.px[0] * ppi / eff)), eff };
}
export const methods = {
  // ---- the module ----------------------------------------------------------------------------------
  // fetched once, checked against the hash the build wrote (build.mjs PIC); its worker started from
  // beside the page (src/picworker.js); false where it cannot run
  picFxLoad() {
    if (this.picFxW || this.picFxMain) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      try {
        if (!(window.crypto && crypto.subtle) || typeof WebAssembly !== 'object') return false;
        const C = __RIKUY_PIC__;
        const at = (f) => (__RIKUY_APP__ ? appAsset(f) : new URL(f, location.href).href);
        const r = await fetch(at(C.file), { credentials: 'same-origin' });
        if (!r.ok) return false;
        const bytes = new Uint8Array(await r.arrayBuffer());
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
        if (h !== C.sha256) return false;
        this.picFxWasm = bytes;
        // (the pixels in a worker; where none starts, on the page, the module let go after each run)
        try {
          const w = new Worker(URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(at(C.worker)) + ');'], { type: 'text/javascript' })));
          const jobs = new Map();
          w.onmessage = ({ data }) => { const j = jobs.get(data && data.id); if (!j) return; jobs.delete(data.id); if (data.error) j.reject(new Error(data.error)); else j.resolve(data.result); };
          w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); for (const j of jobs.values()) j.reject(new Error('the picture worker stopped')); jobs.clear(); this.picFxW = null; };
          let seq = 0;
          const ask = (msg, transfer) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ id, ...msg }, transfer || []); });
          this.picFxW = { ask, w };
          await ask({ op: 'init', wasm: bytes.slice() });
        } catch (e) { this.picFxW = null; this.picFxMain = true; }
        return true;
      } catch (e) { return false; }
    })();
    const p = loading;
    p.then((ok) => { if (!ok) loading = null; });
    return p;
  },
  // the pixels worked on: in the worker, or on the page where there is none
  async picFxRun(bytes, settings, o) {
    if (this.picFxW) {
      try { this.picFxStats = { worker: true }; return await this.picFxW.ask({ op: 'render', bytes, settings, o }, [bytes.buffer]); } catch (e) { return { error: 'The picture tools stopped on this file: ' + e.message + '.' }; }
    }
    if (!F.picFxReady() && !(await F.loadPicFx(this.picFxWasm))) return { error: 'The picture tools did not load.' };
    const r = F.render(bytes, settings, o);
    if (F.picFxMemory() > 64 * 1024 * 1024) F.dropPicFx();
    this.picFxStats = { worker: false };
    return r;
  },
  // the selected picture's first file and the settings its comment holds
  picFxState(h) {
    const cur = h.P.file.name, L = F.lineOf(h.src, h.P.e);
    if (L.note) return { orig: L.note.orig, settings: L.note.settings, current: cur, note: true, other: L.other };
    return { orig: cur, settings: {}, current: cur, note: false, other: L.other };
  },
  // A change of the settings (keys of src/picfx.js KEYS, recolor, tint; null puts one back),
  // worked into a new file from the first; all: the settings given are all of them
  async picFx(change, all) {
    const h = this.picHere();
    if (!h) { this.toast(WHY); return false; }
    const st = this.picFxState(h);
    const settings = all ? { ...change } : { ...st.settings, ...change };
    for (const k of Object.keys(settings)) if (settings[k] == null) delete settings[k];
    if (change && change.recolor === null) delete settings.tint;
    return this.picFxWrite(h, st, F.clean(settings));
  },
  // The edited file of a picture written, the picture pointed at it, and its last edited file (one no
  // other picture names) taken out in the same step: one edited file a picture, undo bringing the
  // last one back. o: { widthPx, ppi, quality, collect (Compress: the edits and files, not committed) }
  async picFxWrite(h, st, settings, o = {}) {
    if (st.other) { this.toast('Another picture follows this one on its line: put this picture on a line of its own first (the comment that says where an edited picture came from would be read as that one\'s).', 8000); return false; }
    const key = this.picAssetName(st.orig);
    if (!key || !/\.(png|jpe?g)$/i.test(key)) { this.toast(key ? 'Corrections work on PNG and JPEG pictures: TeX places a PDF or EPS picture as it is.' : 'The picture\'s first file, ' + st.orig + ', is not in the project: load it, or Reset Picture.', 7000); return false; }
    const blob = this.assetBlobs.get(key);
    const drop = (name) => {
      // (the last edited file, where no other picture of the project names it)
      if (!name || name === key || !F.isEdited(name) || !this.assetBlobs.has(name)) return [];
      const used = [...this.files.values()].reduce((n, t) => n + (typeof t === 'string' ? t.split(name).length - 1 : 0), 0);
      return used <= 1 ? [{ name, blob: null }] : [];
    };
    if (F.isPlain(settings) && !o.widthPx) {
      const E = F.fxEdits(h.src, h.P, st.current, st.orig, {}, null);
      return E.error ? (this.toast(E.error, 8000), false) : this.picApply(h, { edits: E, blobs: drop(st.current) });
    }
    if (!(await this.picFxLoad())) { this.toast('The picture tools (WebAssembly) did not load in this browser, so the picture is as it was. Nothing else is affected.', 8000); return false; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const origHash = F.bytesHash(bytes);
    const jpeg = /\.jpe?g$/i.test(key);
    const nat = X.naturalSize(bytes.subarray(0, 1 << 19), key);
    const dpi = nat && nat.px && nat.w > 0 ? [nat.px[0] * 72 / nat.w, nat.px[1] * 72 / nat.h] : null;
    // (a run of more than half a second says so: a 12 megapixel photo takes seconds)
    const said = setTimeout(() => this.toast('Working on ' + key + '…', 30000), 500);
    const before = blob.size;
    const r = await this.picFxRun(bytes, settings, { jpeg, quality: o.quality || 92, widthPx: o.widthPx, dpi });
    clearTimeout(said);
    if (r.error) { this.toast(r.error, 7000); return false; }
    const s = { ...settings };
    if (o.widthPx && r.w < r.w0) s.compress = o.ppi;
    const name = F.editedName(key, s, r.ext, origHash);
    // (the picture may have moved while the pixels were worked on: read it again)
    const h2 = o.collect ? h : this.picHere();
    if (!h2 || h2.f !== h.f || h2.src !== this.src(h.f)) { this.toast('The picture changed meanwhile: try again.'); return false; }
    const E = F.fxEdits(h2.src, h2.P, st.current, st.orig, s, name);
    if (E.error) { this.toast(E.error, 8000); return false; }
    const blobs = [...(this.assetBlobs.has(name) ? [] : [{ name, blob: new Blob([r.bytes], { type: r.ext === 'png' ? 'image/png' : 'image/jpeg' }) }]), ...(st.current !== name ? drop(st.current) : [])];
    if (o.collect) return { edits: E.map((x) => ({ f: h2.f, ...x })), blobs, before, after: r.bytes.length };
    // (the "Working on" toast goes with the run)
    const tt = document.querySelector('#toast span');
    if (tt && /^Working on/.test(tt.textContent)) this.toast('Done.', 800);
    return E.length || blobs.length ? this.picApply(h2, { edits: E, blobs }) : false;
  },
  picFxMenu(which) {
    const h = this.picHere();
    if (!h) return false;
    const S = this.picFxState(h).settings;
    const b = document.getElementById('rc-picture-' + which);
    const at = b && b.offsetParent ? b : h.el;
    const item = (name, title, set, on) => ({ name, title, radio: true, checked: !!on, run: () => this.picFx(set) });
    let items = [];
    const close = (a, b2) => Math.abs((a || 0) - (b2 || 0)) < 1e-6;
    if (which === 'corrections') {
      items = [...[-0.5, -0.25, 0, 0.25, 0.5].map((v) => item(v ? (v > 0 ? 'Sharpen: ' : 'Soften: ') + Math.abs(v * 100) + '%' : 'Sharpen: 0%', 'sharpen ' + v, { sharpen: v || null }, close(S.sharpen, v))), null];
      for (const br of [-0.4, -0.2, 0, 0.2, 0.4]) for (const c of [-0.4, -0.2, 0, 0.2, 0.4]) items.push(item('Brightness: ' + pct(br) + ' Contrast: ' + pct(c), null, { brightness: br || null, contrast: c || null }, close(S.brightness, br) && close(S.contrast, c)));
    } else if (which === 'color') {
      items = [...[0, 0.33, 0.66, 1, 1.33, 1.66, 2, 3, 4].map((v) => item('Saturation: ' + Math.round(v * 100) + '%', null, { saturation: v === 1 ? null : v }, close(S.saturation ?? 1, v))), null,
        ...[[4700, -1], [5300, -0.62], [5900, -0.31], [6500, 0], [7200, 0.25], [7800, 0.45], [8800, 0.7], [11200, 1]].map(([k, v]) => item('Temperature: ' + k + ' K', null, { tone: v || null }, close(S.tone, v))), null,
        item('No Recolor', null, { recolor: null }, !S.recolor), item('Grayscale', null, { recolor: 'gray' }, S.recolor === 'gray'), item('Sepia', null, { recolor: 'sepia' }, S.recolor === 'sepia'), item('Washout', null, { recolor: 'washout' }, S.recolor === 'washout'),
        item('Black and White: 50%', null, { recolor: 'bw' }, S.recolor === 'bw'),
        ...[['2E75B6', 'Blue'], ['C55A11', 'Orange'], ['548235', 'Green'], ['7F6000', 'Gold'], ['7030A0', 'Purple'], ['595959', 'Gray']].map(([t, n]) => item(n + ' tint', 'a duotone of ' + n.toLowerCase(), { recolor: 'tint', tint: t }, S.recolor === 'tint' && S.tint === t)),
        null, { name: 'Picture Color Options…', run: () => picFxDialog(this) }];
    } else {
      items = [0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95].map((v) => item('Transparency: ' + Math.round(v * 100) + '%', null, { transparency: v || null }, close(S.transparency, v)));
      items.push(null, { name: 'Picture Transparency Options…', run: () => picFxDialog(this) });
    }
    if (which === 'corrections') items.push(null, { name: 'Picture Corrections Options…', run: () => picFxDialog(this) });
    openMenu(this, at, items, { label: { corrections: 'Corrections', color: 'Color', transparency: 'Transparency' }[which] });
    return true;
  },
  // Compress Pictures: { ppi: 96 | 150 | 220 | 330, all: every picture of the document, not the
  // selected one alone }. Each picture larger than its place needs at that resolution is written
  // again at that size (a JPEG at quality 85, a PNG as PNG); says what it saved.
  async picCompress(o) {
    const ppi = Math.max(50, Math.min(600, parseInt(o.ppi, 10) || 150));
    const sel = this.picHere();
    const els = o.all || !sel ? [...document.querySelectorAll('#pages .a-img')] : [sel.el];
    let before = 0, after = 0, n = 0;
    const seen = new Set(), all = [], blobs = [], why = [];
    for (const el of els) {
      const info = atomOfEl(el);
      if (!info || info.a.kind !== 'img' || info.a.ro) continue;
      const src = this.src(info.f);
      const Pq = X.findPicture(src, parse(src), info.s);
      if (!Pq || seen.has(info.f + ':' + info.s)) continue;
      seen.add(info.f + ':' + info.s);
      const h = { f: info.f, s: info.s, src, P: Pq, el };
      const st = this.picFxState(h);
      const key = this.picAssetName(st.orig);
      if (!key || !/\.(png|jpe?g)$/i.test(key)) { why.push(st.orig + ': ' + (key ? 'TeX places a PDF or EPS picture as it is' : 'not in the project')); continue; }
      const blob = this.assetBlobs.get(key);
      const nat = X.naturalSize(new Uint8Array(await blob.slice(0, 1 << 19).arrayBuffer()), key);
      // its pixels per inch as printed: the part kept by trim or viewport over its own width as
      // graphicx sizes it (before an angle turns it, or after: graphicx's order), not the box it takes
      const pr = compressPlan(Pq, nat, this.picLine(h), ppi);
      if (pr.why) { why.push(st.orig + ': ' + pr.why); continue; }
      const h1 = (this.picSelect({ f: info.f, s: info.s }), this.picHere());
      if (!h1) continue;
      const r = await this.picFxWrite(h1, this.picFxState(h1), this.picFxState(h1).settings, { widthPx: pr.widthPx, ppi, quality: 85, collect: true });
      if (r && r.edits && r.edits.length && r.after < r.before) { n++; before += r.before; after += r.after; all.push(...r.edits); blobs.push(...r.blobs); } else if (r && r.edits) why.push(st.orig + ': written smaller it was no smaller');
    }
    if (all.length) {
      this.closeGroup();
      this.commit(all, sel ? { f: sel.f, p: sel.s, bias: 1 } : null, 'picture', blobs);
      this.closeGroup();
    }
    if (sel) this.picSelect({ f: sel.f, s: mapPos(all.filter((x) => x.f === sel.f), sel.s, 1) }); else if (this.disarm) this.disarm();
    const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    // (honest about the project: its first files stay for Reset Picture, so the project grows by
    // the new files; the PDF carries the smaller ones)
    const added = blobs.reduce((t, b) => t + (b.blob ? b.blob.size : 0), 0);
    this.lastCompress = { n, before, after, skipped: why.length, why, added };
    const left = why.length ? ' Left as they are: ' + why.slice(0, 3).join('; ') + (why.length > 3 ? '; and ' + (why.length - 3) + ' more' : '') + '.' : '';
    this.toast(n ? 'Compressed ' + n + ' picture' + (n > 1 ? 's' : '') + ' to ' + ppi + ' ppi: the PDF carries ' + kb(after) + ' of pictures in place of ' + kb(before) + '. The project keeps the first files for Reset Picture, so it holds ' + kb(added) + ' more.' + left : 'Nothing to compress at ' + ppi + ' ppi.' + left, 12000);
    return n > 0;
  }

};
