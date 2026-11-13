// Review: the versions of a project (kept as one works, named ones too, compared and restored),
// the changes since a version with Accept and Reject, and the marks of those changes on the
// pages, as Word's Track Changes draws them. The comments and the copy a coauthor sends back are
// src/collab.js's. The methods join App's prototype.

import { $, mk, mkBtn, store, PREFS, textSig, when } from './ui/dom.js';
import { atomOfEl } from './editor.js';
import { changes, spacingOnly } from './diff.js';
import { commentOnly } from './share.js';
import { kvGet, kvPut, decodeText, snapAdd, snapAll, snapFiles, snapDel, snapPrune } from './store.js';

export const review = {
  // ---- versions and changes ---------------------------------------------------------
  // The project's text is kept as a version every few minutes of editing, when the tab is
  // left, when a .zip is saved, and before anything replaces the text. The Changes tab
  // compares the text with one version (at first, how it was when opened) and lists each
  // change with Accept (keep it) and Reject (put the old text back); "Show on pages" marks
  // the same changes on the typeset pages, like Word's Track Changes.
  isMine(v) { return v.main === this.main && v.name === this.name; },

  async loadReview() {
    let r = null;
    try { r = this.noIdb ? null : await kvGet('review'); } catch (e) { r = null; }
    if (r && r.main === this.main && r.name === this.name && r.files) this.base = { t: r.t, label: r.label, id: r.id, files: new Map(r.files) };
    else this.setBase({ t: Date.now(), label: 'When opened', files: this.files });
    const mine = (await this.allSnaps()).filter((v) => this.isMine(v));
    if (mine.length) { this.lastSig = mine[0].sig; this.lastSnapT = mine[0].t; }
    await this.snapshot('Session start');
    this.refreshNav();
    if (this.prefs.marks) this.marksSoon();
  },

  // Images and other binary files are kept per project, so opening a version of another
  // project brings its figures back with its text.
  async stashBinary() {
    if (this.noIdb) return;
    try {
      await kvPut('bin:' + this.name + '|' + this.main, {
        assets: [...this.assetBlobs.entries()], extra: [...this.extra.entries()],
        orig: [...this.orig.entries()].map(([n, o]) => [n, { bytes: o.bytes, enc: o.enc, bom: o.bom }])
      });
    } catch (e) { /* text versions still work */ }
  },

  async loadBinary(name, main) {
    for (const u of this.assets.values()) URL.revokeObjectURL(u);
    this.assets.clear(); this.assetBlobs.clear(); this.extra.clear(); this.orig.clear();
    this.binaryDirty = true;
    if (this.noIdb) return;
    try {
      const bin = await kvGet('bin:' + name + '|' + main);
      if (!bin) return;
      for (const [n, b] of bin.assets || []) this.addAsset(n, b);
      for (const [n, b] of bin.extra || []) this.extra.set(n, b);
      for (const [n, o] of bin.orig || []) this.orig.set(n, { ...o, text: decodeText(o.bytes).text });
    } catch (e) { /* none kept */ }
  },

  setBase(b) {
    this.base = { t: b.t, label: b.label || '', id: b.id, files: new Map(b.files) };
    this.chg = null;
    if (!this.noIdb) kvPut('review', { t: b.t, label: this.base.label, id: b.id, main: this.main, name: this.name, files: [...this.base.files.entries()] }).catch(() => {});
  },

  noteEdit() {
    this.pdfStale = true;
    this.pdfSoon();
    this.snapDirty = true;
    this.chg = null;
    const since = Date.now() - (this.lastSnapT || 0);
    if (since > 15 * 60e3) { this.snapshot(''); return; }
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => { if (this.snapDirty) this.snapshot(''); }, Math.max(30e3, 5 * 60e3 - since));
  },

  async snapshot(label, o = {}) {
    const files = [...this.files.entries()];
    const sig = textSig(this.main, files);
    if (!o.force && sig === this.lastSig) { this.snapDirty = false; return null; }
    const v = { t: Date.now(), label: label || '', named: !!o.named, name: this.name, main: this.main, sig, files };
    this.lastSig = sig; this.lastSnapT = v.t; this.snapDirty = false;
    clearTimeout(this.snapTimer);
    try {
      if (this.noIdb) throw new Error('no storage');
      v.id = await snapAdd(v);
      snapPrune(80).then((n) => { if (n) this.snapList = null; }).catch(() => {});
    } catch (e) {
      v.id = 'm' + v.t;
      this.memSnaps.push(v);
      const old = this.memSnaps.findIndex((x) => !x.named);
      if (this.memSnaps.length > 30 && old >= 0) this.memSnaps.splice(old, 1);
    }
    this.snapList = null;
    if (document.body.classList.contains('nav-on') && this.navTab === 'changes') this.refreshNav();
    return v;
  },

  async allSnaps() {
    if (this.snapList) return this.snapList;
    let list = [];
    if (!this.noIdb) { try { list = await snapAll(); } catch (e) { list = []; } }
    this.snapList = [...list, ...this.memSnaps.map(({ files, ...m }) => m)].sort((a, b) => b.t - a.t);
    return this.snapList;
  },

  async versionFiles(v) {
    const m = this.memSnaps.find((x) => x.id === v.id);
    if (m) return m.files;
    try { return await snapFiles(v.id); } catch (e) { return null; }
  },

  currentChanges() {
    if (!this.base) return [];
    const C = this.chg;
    if (C && C.base === this.base && C.files.size === this.files.size && [...this.files].every(([n, t]) => C.files.get(n) === t)) return C.list;
    const list = [];
    for (const [n, t] of this.files) {
      const a = this.base.files.get(n) ?? '';
      if (a !== t) list.push(...changes(a, t, n));
    }
    this.chg = { base: this.base, files: new Map(this.files), list };
    return list;
  },

  acceptChanges(cs) {
    cs = cs.filter((c) => (this.base.files.get(c.f) ?? '').slice(c.as, c.ae) === c.a && this.src(c.f).slice(c.bs, c.be) === c.b);
    if (!cs.length) { this.refreshNav(); return; }
    const files = new Map(this.base.files);
    const byF = new Map();
    for (const c of cs) { if (!byF.has(c.f)) byF.set(c.f, []); byF.get(c.f).push(c); }
    for (const [f, list] of byF) {
      let t = files.get(f) ?? '';
      for (const c of list.sort((x, y) => y.as - x.as)) t = t.slice(0, c.as) + c.b + t.slice(c.ae);
      files.set(f, t);
    }
    this.setBase({ ...this.base, files });
    this.refreshNav();
    if (this.prefs.marks) this.marksSoon();
  },

  rejectChanges(cs, label) {
    // the list may be a moment behind the text: act only on changes still exactly there
    cs = cs.filter((c) => this.src(c.f).slice(c.bs, c.be) === c.b);
    if (!cs.length) { this.refreshNav(); return; }
    if (cs.length > 1) this.snapshot(label || 'Before rejecting changes', { force: true });
    this.closeGroup();
    this.commit(cs.map((c) => ({ f: c.f, s: c.bs, e: c.be, t: c.a })), null, 'reject');
    this.closeGroup();
    this.refreshNav();
    if (cs.length === 1) this.goTo(cs[0].f, cs[0].bs);
  },

  setMarks(on) {
    this.prefs.marks = !!on;
    store(PREFS, this.prefs);
    this.paintChanges();
    const cb = $('#chg-show');
    if (cb) cb.checked = !!on;
  },

  async compareWith(v) {
    const files = await this.versionFiles(v);
    if (!files) { this.toast('That version could not be read.'); return; }
    this.setBase({ t: v.t, label: v.label || 'Automatic version', id: v.id, files });
    this.refreshNav();
    if (this.prefs.marks) this.marksSoon();
  },

  async restoreVersion(v) {
    const files = await this.versionFiles(v);
    if (!files) { this.toast('That version could not be read.'); return; }
    if (!this.isMine(v)) { await this.openVersion(v, files); return; }
    const edits = [];
    for (const [n, t] of files) { const cur = this.files.get(n); if (cur !== t) edits.push({ f: n, s: 0, e: cur == null ? 0 : cur.length, t }); }
    if (!edits.length) { this.toast('That version is the same as the text now.'); return; }
    await this.snapshot('Before restoring a version');
    this.closeGroup();
    this.commit(edits, null, 'restore');
    this.closeGroup();
    this.toast('Restored the version from ' + when(v.t) + '.', 6000, { label: 'Undo', fn: () => this.undo() });
  },

  async openVersion(v, files) {
    await this.snapshot('Before opening ' + v.name, { force: !this.lastSig });
    await this.stashBinary();
    await this.loadBinary(v.name, v.main);
    this.files = new Map(files);
    this.main = v.main;
    this.name = v.name;
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.binaryDirty = true; this.zipDirty = true; this.forceRender = true;
    this.srcFile = this.main;
    this.desk.scrollTop = 0;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.updateFileTabs();
    this.persist();
    this.lastSig = v.sig;
    this.setBase({ t: v.t, label: v.label || 'Automatic version', id: v.id, files });
    this.resetPdf();
    this.toast('Opened the version of ' + v.name + ' from ' + when(v.t) + '.', 6000);
  },

  renderChanges(body) {
    const all = this.currentChanges();
    // comment lines are listed above, as comments; Accept all takes them along
    const real = all.filter((c) => !spacingOnly(c) && !commentOnly(c)), space = all.filter(spacingOnly);
    const top = mk('div', 'chg-top');
    const cmp = mk('div', 'chg-base');
    cmp.append('Changes since ', mk('b', '', this.base ? when(this.base.t) : ''), this.base && this.base.label ? ' · ' + this.base.label : '');
    const lab = mk('label', 'chg-show');
    const cb = mk('input');
    cb.type = 'checkbox'; cb.id = 'chg-show'; cb.checked = !!this.prefs.marks;
    cb.addEventListener('change', () => this.setMarks(cb.checked));
    lab.append(cb, 'Show changes on the pages');
    top.append(cmp, lab);
    if (all.length) {
      const row = mk('div', 'chg-bulk');
      row.append(mk('span', 'chg-n', real.length + (real.length === 1 ? ' change' : ' changes')), mk('span', 'grow'),
        mkBtn('Accept all', () => this.acceptChanges(this.currentChanges()), 'Keep every change and compare from here on'),
        mkBtn('Reject all', () => this.rejectChanges(this.currentChanges(), 'Before rejecting all changes'), 'Put back the text of the compared version (Ctrl+Z undoes)'));
      top.append(row);
    }
    body.append(top);
    if (!all.length) body.append(mk('div', 'nav-empty', 'No changes since then. Each edit you make shows up here with Accept and Reject.'));
    const MAX = 250;
    for (const c of real.slice(0, MAX)) body.append(this.changeItem(c));
    if (real.length > MAX) body.append(mk('div', 'nav-empty', (real.length - MAX) + ' more. Accept or reject some to see the rest.'));
    if (space.length) {
      const it = mk('div', 'chg spacing');
      const row = mk('div', 'chg-row');
      row.append(mk('span', 'where', space.length + (space.length === 1 ? ' line break or spacing change' : ' line break or spacing changes') + ' (same on the page)'), mk('span', 'grow'),
        mkBtn('Accept', () => this.acceptChanges(space)), mkBtn('Reject', () => this.rejectChanges(space)));
      it.append(row);
      body.append(it);
    }
    const vh = mk('div', 'ver-h', 'Versions');
    const form = mk('form', 'ver-form');
    const inp = mk('input');
    inp.type = 'text'; inp.placeholder = 'Name this version'; inp.maxLength = 80; inp.setAttribute('aria-label', 'Name this version');
    form.append(inp, mkBtn('Save', null, 'Keep the text as it is now under this name', 'submit'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      inp.value = '';
      inp.blur();
      this.snapshot(name, { force: true, named: true }).then(() => this.toast('Saved the version “' + name + '”.'));
    });
    const list = mk('div', 'ver-list');
    body.append(vh, form, list);
    this.allSnaps().then((vs) => this.fillVersions(list, vs));
  },

  changeItem(c) {
    const it = mk('div', 'chg');
    const txt = mk('button', 'chg-txt');
    txt.type = 'button';
    txt.title = 'Show it on the page';
    const src = this.src(c.f);
    let pre = src.slice(Math.max(0, c.bs - 36), c.bs), post = src.slice(c.be, c.be + 36);
    if (c.bs > 36) pre = '…' + pre.replace(/^\S*\s/, '');
    if (c.be + 36 < src.length) post = post.replace(/\s\S*$/, '') + '…';
    const flat = (t) => t.replace(/\s+/g, ' ');
    const clip = (t) => (t.length > 160 ? t.slice(0, 70) + ' … ' + t.slice(-70) : t);
    txt.append(mk('span', 'ctx', flat(pre)));
    for (const [op, v] of c.parts) txt.append(op === ' ' ? document.createTextNode(flat(clip(v))) : mk(op === '-' ? 'del' : 'ins', '', flat(clip(v)) || '¶'));
    txt.append(mk('span', 'ctx', flat(post)));
    txt.addEventListener('click', () => { this.goTo(c.f, c.bs); if (window.innerWidth <= 860) this.toggleNav(false); });
    const row = mk('div', 'chg-row');
    const kind = !c.a ? 'Added' : !c.b ? 'Deleted' : 'Changed';
    row.append(mk('span', 'where', kind + ' · ' + c.f + ':' + c.line), mk('span', 'grow'),
      mkBtn('Accept', () => this.acceptChanges([c]), 'Keep this change'),
      mkBtn('Reject', () => this.rejectChanges([c]), 'Put the old text back'));
    it.append(txt, row);
    return it;
  },

  fillVersions(list, vs) {
    list.replaceChildren();
    if (!vs.length) { list.append(mk('div', 'nav-empty', 'Versions are kept as you work: every few minutes, when you leave, and when you save the .zip.')); return; }
    for (const v of vs.slice(0, 120)) {
      const mine = this.isMine(v);
      const row = mk('div', 'ver' + (this.base && this.base.id != null && this.base.id === v.id ? ' on' : ''));
      const l = mk('div', 'ver-l');
      const w = when(v.t);
      l.append(mk('span', 'ver-t', w[0].toUpperCase() + w.slice(1)), mk('span', 'ver-n' + (v.named ? ' named' : ''), v.label || 'Automatic'));
      if (!mine) l.append(mk('span', 'ver-p', v.name));
      const acts = mk('div', 'ver-a');
      if (mine) acts.append(mkBtn('Compare', () => this.compareWith(v), 'List and mark the changes made since this version'), mkBtn('Restore', () => this.restoreVersion(v), 'Bring back the text of this version (Ctrl+Z undoes)'));
      else acts.append(mkBtn('Open', () => this.restoreVersion(v), 'Open this version of ' + v.name + ' (the current project is kept as a version)'));
      if (v.named) acts.append(mkBtn('×', () => { snapDel(v.id).catch(() => {}); this.memSnaps = this.memSnaps.filter((x) => x.id !== v.id); this.snapList = null; this.lastSig = null; this.refreshNav(); }, 'Delete this named version'));
      row.append(l, acts);
      list.append(row);
    }
  },

  // Track-changes marks on the pages: inserted text underlined, deletions as a small red
  // wedge (hover shows what was deleted), changed equations outlined, and a bar in the
  // margin beside each changed line.
  paintChanges() {
    for (const x of this.root.querySelectorAll('.mk-layer')) x.remove();
    for (const x of this.root.querySelectorAll('.chg-atom')) x.classList.remove('chg-atom');
    const HL = window.CSS && CSS.highlights;
    if (HL) HL.delete('g-ins');
    if (!this.prefs.marks || !this.base || !this.model) return;
    const list = this.currentChanges().filter((c) => !spacingOnly(c) && !commentOnly(c));
    if (!list.length) return;
    const ins = new Map(), dels = [];
    for (const c of list) {
      for (const [op, v, p] of c.parts) {
        if (op === '+' && v.trim()) { if (!ins.has(c.f)) ins.set(c.f, []); ins.get(c.f).push([p, p + v.length]); }
        else if (op === '-' && v.trim()) dels.push({ f: c.f, p, text: v });
      }
    }
    for (const rs of ins.values()) rs.sort((a, b) => a[0] - b[0]);
    const ranges = [];
    for (const [f, rs] of ins) ranges.push(...this.index.domRanges(f, rs));
    const atomHit = [];
    for (const el of this.root.querySelectorAll('[data-a]')) {
      const A = atomOfEl(el);
      if (!A || A.s == null || A.e == null) continue;
      const rs = ins.get(A.f) || [];
      const hit = rs.some(([s, e]) => s < A.e && e > A.s) || dels.some((d) => d.f === A.f && d.p > A.s && d.p < A.e);
      if (hit && !el.parentElement.closest('.chg-atom')) { el.classList.add('chg-atom'); atomHit.push(A); }
    }
    if (HL && window.Highlight) HL.set('g-ins', new window.Highlight(...ranges));
    const layers = new Map();
    const layer = (page) => {
      let L = layers.get(page);
      if (!L) { L = mk('div', 'mk-layer'); L.contentEditable = 'false'; L.setAttribute('aria-hidden', 'true'); page.append(L); L.bars = []; layers.set(page, L); }
      return L;
    };
    const pageOf = (n) => (n.nodeType === 1 ? n : n.parentElement).closest('.page');
    const bar = (page, q) => { const P = page.getBoundingClientRect(); layer(page).bars.push([q.top - P.top, q.bottom - P.top]); };
    for (const r of ranges) { const page = pageOf(r.startContainer); if (page) for (const q of r.getClientRects()) if (q.height) bar(page, q); }
    for (const el of this.root.querySelectorAll('.chg-atom')) { const page = pageOf(el); if (page) for (const q of el.getClientRects()) if (q.height) bar(page, q); }
    for (const d of dels) {
      if (atomHit.some((A) => A.f === d.f && d.p > A.s && d.p < A.e)) continue;
      const r = this.index.find(d.f, d.p, -1);
      if (!r || !r.node) continue;
      const R = document.createRange();
      try { R.setStart(r.node, Math.min(r.offset, r.node.length ?? 0)); } catch (e) { continue; }
      R.collapse(true);
      const q = R.getClientRects()[0] || R.getBoundingClientRect();
      const page = pageOf(r.node);
      if (!q || !q.height || !page) continue;
      const P = page.getBoundingClientRect();
      const m = mk('span', 'del-mk');
      m.style.left = (q.left - P.left) + 'px'; m.style.top = (q.top - P.top) + 'px'; m.style.height = q.height + 'px';
      m.title = 'Deleted: ' + (d.text.length > 300 ? d.text.slice(0, 300) + '…' : d.text);
      layer(page).append(m);
      bar(page, q);
    }
    for (const [page, L] of layers) {
      const flow = page.querySelector('.flow');
      const x = flow ? flow.getBoundingClientRect().left - page.getBoundingClientRect().left - 14 : 24;
      const bs = L.bars.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const b of bs) { const last = merged[merged.length - 1]; if (last && b[0] <= last[1] + 2) last[1] = Math.max(last[1], b[1]); else merged.push([b[0], b[1]]); }
      for (const [t, b] of merged) { const e = mk('span', 'chg-bar'); e.style.left = x + 'px'; e.style.top = t + 'px'; e.style.height = (b - t) + 'px'; L.append(e); }
    }
  }
};
