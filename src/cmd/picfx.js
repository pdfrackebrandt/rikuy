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
const raster = (app) => { const h = app.picHere(); return !!h && /\.(png|jpe?g)$/i.test(app.picFxState(h).orig); };
const whyNot = (app) => { const h = app.picHere(); if (!h) return WHY; return 'Corrections work on PNG and JPEG pictures: TeX places a PDF picture as it is.'; };
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
    synonyms: ['Brightness', 'Contrast', 'Sharpen', 'Soften', 'Picture corrections'], menu: { picture: 70 }, run: (app, args) => (args ? app.picFx(args) : app.picFxMenu('corrections')) }),
  P('picture-color', 'Color', { title: 'Color: saturation, colour tone, and recolour (grayscale, sepia, washout, black and white, a tint), worked into a copy of the picture', tab: 'picture-format', group: 'adjust', order: 4, kind: 'menu', icon: ICON.color, label: 'Color',
    synonyms: ['Recolor', 'Grayscale', 'Black and white', 'Sepia', 'Saturation', 'Color tone', 'Picture colour'], menu: { picture: 71 }, run: (app, args) => (args ? app.picFx(args) : app.picFxMenu('color')) }),
  P('picture-transparency', 'Transparency', { title: 'Transparency: the picture seen through, 15% to 95% (a PNG with an alpha channel; pdfLaTeX, XeLaTeX and LuaLaTeX keep it)', tab: 'picture-format', group: 'adjust', order: 5, kind: 'menu', icon: ICON.transparency, label: 'Transparency',
    synonyms: ['See through', 'Opacity', 'Fade picture'], menu: { picture: 72 }, run: (app, args) => (args ? app.picFx(args) : app.picFxMenu('transparency')) }),
  P('picture-fx-options', 'Format Picture', { title: 'Format Picture: sharpen, brightness, contrast, saturation, tone, recolour and transparency in numbers', synonyms: ['Picture Corrections Options', 'Picture Color Options', 'Picture Transparency Options'],
    run: (app, args) => (args ? app.picFx(args, true) : picFxDialog(app)) }),
  { id: 'picture-compress', name: 'Compress Pictures', title: 'Compress Pictures: the PNG and JPEG pictures of the document made no larger than their place needs at 96, 150 or 220 pixels per inch; the bytes saved are said', tab: 'picture-format', group: 'adjust', order: 6, icon: ICON.compress, label: 'Compress Pictures',
    also: [], synonyms: ['Reduce file size', 'Picture resolution', 'Downsample'], when: (app) => !!app.files && [...(app.assetBlobs || new Map()).keys()].some((k) => /\.(png|jpe?g)$/i.test(k)), whyNot: () => 'The document has no PNG or JPEG picture.',
    run: (app, args) => (args ? app.picCompress(args) : compressDialog(app)) }
);

let loading = null;
export const methods = {
  // ---- the module ----------------------------------------------------------------------------------
  // fetched once, checked against the hash the build wrote (build.mjs PIC); false where it cannot run
  picFxLoad() {
    if (F.picFxReady()) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      try {
        if (!(window.crypto && crypto.subtle) || typeof WebAssembly !== 'object') return false;
        const C = __RIKUY_PIC__;
        const url = __RIKUY_APP__ ? appAsset(C.file) : new URL(C.file, location.href).href;
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) return false;
        const bytes = new Uint8Array(await r.arrayBuffer());
        const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
        if (h !== C.sha256) return false;
        return await F.loadPicFx(bytes);
      } catch (e) { return false; }
    })();
    const p = loading;
    p.then((ok) => { if (!ok) loading = null; });
    return p;
  },
  // the selected picture's first file and the settings its comment holds
  picFxState(h) {
    const cur = h.P.file.name, L = F.lineOf(h.src, h.P.e);
    if (L.note) return { orig: L.note.orig, settings: L.note.settings, current: cur, note: true };
    return { orig: cur, settings: {}, current: cur, note: false };
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
  async picFxWrite(h, st, settings, o = {}) {
    if (/\.pdf$/i.test(st.orig) || !/\.(png|jpe?g)$/i.test(st.orig)) { this.toast('Corrections work on PNG and JPEG pictures: TeX places a PDF picture as it is.', 6000); return false; }
    const key = this.picAssetName(st.orig);
    const blob = key && this.assetBlobs.get(key);
    if (!blob) { this.toast('The picture\'s first file, ' + st.orig + ', is not in the project: load it, or Reset Picture.', 7000); return false; }
    if (F.isPlain(settings) && !o.widthPx) return this.picApply(h, { edits: F.fxEdits(h.src, h.P, st.current, st.orig, {}, null) });
    if (!(await this.picFxLoad())) { this.toast('The picture tools (WebAssembly) did not load in this browser, so the picture is as it was. Nothing else is affected.', 8000); return false; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const jpeg = /\.jpe?g$/i.test(st.orig);
    const nat = X.naturalSize(bytes.subarray(0, 1 << 19), st.orig);
    const dpi = nat && nat.px && nat.w > 0 ? [nat.px[0] * 72 / nat.w, nat.px[1] * 72 / nat.h] : null;
    const r = F.render(bytes, settings, { jpeg, quality: o.quality || 92, widthPx: o.widthPx, dpi });
    if (r.error) { this.toast(r.error, 7000); return false; }
    const s = { ...settings };
    if (o.widthPx && r.w < r.w0) s.compress = o.ppi;
    const name = F.editedName(st.orig, s, r.ext);
    // (the picture may have moved while the pixels were worked on: read it again)
    const h2 = this.picHere();
    if (!h2 || h2.f !== h.f || h2.src !== h.src) { this.toast('The picture changed meanwhile: try again.'); return false; }
    if (!this.assetBlobs.has(name)) { this.addAsset(name, new Blob([r.bytes], { type: r.ext === 'png' ? 'image/png' : 'image/jpeg' })); this.binaryDirty = true; this.zipDirty = true; this.forceRender = true; }
    const edits = F.fxEdits(h2.src, h2.P, st.current, st.orig, s, name);
    // (Compress Pictures gathers every picture's edits into one commit)
    if (o.collect) return { edits: edits.map((x) => ({ f: h2.f, ...x })), before: blob.size, after: r.bytes.length };
    return edits.length ? this.picApply(h2, { edits }) : false;
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
    let before = 0, after = 0, n = 0, skipped = 0;
    const seen = new Set(), all = [];
    for (const el of els) {
      const info = atomOfEl(el);
      if (!info || info.a.kind !== 'img' || info.a.ro) continue;
      const src = this.src(info.f);
      const Pq = X.findPicture(src, parse(src), info.s);
      if (!Pq) continue;
      const h = { f: info.f, s: info.s, src, P: Pq, el };
      const st = this.picFxState(h);
      if (!/\.(png|jpe?g)$/i.test(st.orig) || seen.has(info.f + ':' + info.s)) { skipped++; continue; }
      seen.add(info.f + ':' + info.s);
      const d = this.picDrawn(h);
      const widthPx = Math.ceil(d.w / 72.27 * ppi);
      // (this picture made the selected one while its pixels are worked on: picFxWrite reads it)
      this.picSelect({ f: info.f, s: info.s });
      const h1 = this.picHere();
      if (!h1) continue;
      const blob = this.assetBlobs.get(this.picAssetName(st.orig) || '');
      const nat = blob ? X.naturalSize(new Uint8Array(await blob.slice(0, 1 << 19).arrayBuffer()), st.orig) : null;
      if (nat && nat.px && nat.px[0] <= widthPx) { skipped++; continue; }
      const r = await this.picFxWrite(h1, this.picFxState(h1), this.picFxState(h1).settings, { widthPx, ppi, quality: 85, collect: true });
      if (r && r.edits && r.edits.length && r.after < r.before) { n++; before += r.before; after += r.after; all.push(...r.edits); } else skipped++;
    }
    if (all.length) {
      this.closeGroup();
      this.commit(all, sel ? { f: sel.f, p: sel.s, bias: 1 } : null, 'picture');
      this.closeGroup();
    }
    if (sel) this.picSelect({ f: sel.f, s: mapPos(all.filter((x) => x.f === sel.f), sel.s, 1) }); else if (this.disarm) this.disarm();
    const kb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    this.lastCompress = { n, before, after, skipped };
    this.toast(n ? 'Compressed ' + n + ' picture' + (n > 1 ? 's' : '') + ' to ' + ppi + ' ppi: ' + kb(before) + ' to ' + kb(after) + ', ' + kb(Math.max(0, before - after)) + ' saved. The first files stay in the project; Reset Picture goes back.' : 'Nothing to compress: every picture is already no larger than its place needs at ' + ppi + ' ppi.', 9000);
    return n > 0;
  }
};
