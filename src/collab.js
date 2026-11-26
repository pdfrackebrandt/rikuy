// Working with people who do not use the editor, or LaTeX: a link that opens the document ready
// to type in (no account; the document travels inside the link), comments on the typeset page
// that are LaTeX comments in the source, a copy sent back that arrives as tracked changes, and
// one click out to Overleaf or a plain .tex. The methods join App's prototype (app.js).

import { packShare, unpackShare, shareParam, texParam, unpackTex, findComments, commentEdit, stripComments, mergeProjects, commentOnly, onlyComments, commentsBack, bodyAt, linkRole, wideSaid } from './share.js';
import { kvGet, kvPut, kvDel } from './store.js';
import { graphShort, graphWhole } from './graph.js';
import { buildModel } from './model.js';

const $ = (s, r = document) => r.querySelector(s);
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(label, fn, cls) { const b = mk('button', cls || 'btn ghost sm', label); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }

// past this many characters a few mail and chat apps cut links short
const LONG_LINK = 60000;
const MAX_ADDRESS = 2 * 1024 * 1024;

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

const importId = () => Date.now().toString(36) + '-' + Array.from(crypto.getRandomValues(new Uint32Array(2)), (x) => x.toString(36)).join('');
// a project's name from a file's or an address's (no |, as Rename makes sure: this browser keeps a
// project's records under name|main file; no control characters)
export const cleanProjectName = (s, dflt = 'Untitled') => String(s || '').replace(/[\u0000-\u001F\u007F|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || dflt;

// Of two marks (a stranger's project: shell escape restricted unless allowed, live figures waiting
// unless allowed; null for one's own), the one that lets less run: any mark over none, and what
// each allows only where both allow it. The same object back when it is already the stricter.
export function stricterMark(a, b) {
  if (!a) return b || null;
  if (!b) return { ...a };
  const allowed = !!(a.allowed && b.allowed), widgets = !!(a.widgets && b.widgets);
  if (!!b.allowed === allowed && !!b.widgets === widgets) return b;
  // (the restricted one's origin and sender: they say why it is restricted)
  const v = { ...(a.allowed ? b : a), allowed };
  if (widgets) v.widgets = true; else delete v.widgets;
  return v;
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export const collab = {
  // ---- who is writing -----------------------------------------------------------------
  myName() { return String(this.prefs.who || '').trim(); },
  nameInput() {
    const i = mk('input', 'share-name');
    i.type = 'text'; i.placeholder = 'Your name'; i.value = this.myName(); i.autocomplete = 'name';
    i.setAttribute('aria-label', 'Your name, shown with your comments and changes');
    i.addEventListener('change', () => { this.prefs.who = i.value.trim(); this.savePrefs(); });
    return i;
  },

  // ---- links --------------------------------------------------------------------------
  // Where a link should open: a build for a hosted copy names its address; a page served on
  // its own uses its own address.
  shareBase() {
    if (typeof __RIKUY_SHARE__ !== 'undefined' && __RIKUY_SHARE__) return __RIKUY_SHARE__;
    try { if (window.top === window && /^https?:$/.test(location.protocol)) return location.href.split('#')[0]; } catch (e) { /* framed */ }
    return location.href.split('#')[0];
  },

  // role: 'coauthor' (edits and comments), 'comments' (comments only) or 'back'
  async makeShareLink(role) {
    let base = null, rid = null;
    if (role === 'back') { base = this.shareCtx && this.shareCtx.base; rid = (this.shareCtx && this.shareCtx.rid) || null; }
    else {
      // the version shared is kept, with the link's name and what it allows, so the copy that
      // comes back is compared with it and let in as that link allows (takeBack)
      rid = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const v = await this.snapshot(role === 'comments' ? 'Shared for comments' : 'Shared', { force: true, named: true, share: { rid, role } });
      base = (v && v.sig) || this.lastSig || null;
    }
    const o = { v: 1, name: this.name, main: this.main, files: [...this.files.entries()], base, by: this.myName() || 'A coauthor', role, rid, t: Date.now() };
    // (a graph's file as its description alone: the reader's Rikuy writes it again, src/share.js)
    const url = this.shareBase() + '#share=' + await packShare(o, graphShort);
    return { url, figures: this.assetBlobs.size };
  },

  async copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  },

  linkNote(L) {
    const parts = [];
    // a page inside a frame (the claude.ai artifact) never sees the address it was opened with
    let framed = false;
    try { framed = window.top !== window; } catch (e) { framed = true; }
    if (framed) parts.push('Here the page cannot read the link it is opened with, so whoever opens it pastes the link onto the page once (they will see Open it). A copy of Rikuy on its own site opens links directly.');
    if (L.figures) parts.push('The ' + plural(L.figures, 'figure stays', 'figures stay') + ' with you: the link carries the text, and the page shows a frame where a figure goes.');
    // Chrome opens no address longer than 2 MiB (a large live figure's .html travels in the link)
    if (L.url.length > MAX_ADDRESS) parts.push('This link is ' + (L.url.length / 1e6).toFixed(1) + ' million characters, more than Chrome opens from its address bar: whoever gets it pastes it onto this page, or send the .zip instead.');
    else if (L.url.length > LONG_LINK) parts.push('This link is long (' + Math.round(L.url.length / 1000) + ' thousand characters); if a chat app cuts it, send it by email.');
    return parts.join(' ');
  },

  // the Share button: a link for coauthors, or the copy back to whoever shared it, and the ways out
  openSharePanel() {
    const p = this.makePop($('#b-share'), 'pop-share', 'Share');
    const back = this.shareCtx && this.shareCtx.name === this.name && this.shareCtx.main === this.main && this.shareCtx.base;
    const field = mk('input', 'share-link'); field.readOnly = true; field.hidden = true; field.setAttribute('aria-label', 'The link');
    field.addEventListener('focus', () => field.select());
    const note = mk('p', 'share-note');
    const name = this.nameInput();
    const go = async (role, b) => {
      this.prefs.who = name.value.trim(); this.savePrefs();
      b.disabled = true;
      try {
        const L = await this.makeShareLink(role);
        field.value = L.url; field.hidden = false;
        const ok = await this.copyText(L.url);
        note.textContent = (ok ? 'Link copied. ' : 'Copy the link above. ') + this.linkNote(L);
        this.positionPop();
      } catch (e) { note.textContent = 'Could not make the link: ' + e.message; }
      b.disabled = false;
    };
    if (back) {
      p.append(mk('p', 'share-lead', 'Send your copy back to ' + this.shareCtx.by + '. When they open the link, your edits show up marked, for them to accept or reject, and your comments sit beside the text.'));
      const b1 = btn('Copy the link for ' + this.shareCtx.by, () => go('back', b1), 'btn sm');
      p.append(mk('label', 'share-row', 'Your name'), name, b1);
      p.append(mk('p', 'share-or', 'Or share it with someone new:'));
      const b2 = btn('Copy a new link', () => go('coauthor', b2));
      p.append(b2);
    } else {
      p.append(mk('p', 'share-lead', 'Anyone with the link opens this document and can type on the page and comment, with no account and nothing to install. The document travels inside the link: it is not uploaded anywhere.'));
      // (Word's Can edit and Can review: a comments only link's copy comes back with its comments alone)
      const perm = mk('select', 'share-perm');
      perm.setAttribute('aria-label', 'Link permission');
      for (const [v, t] of [['coauthor', 'Can edit and comment'], ['comments', 'Can comment only']]) { const o = mk('option', '', t); o.value = v; perm.append(o); }
      perm.value = this.prefs.shareRole === 'comments' ? 'comments' : 'coauthor';
      perm.addEventListener('change', () => { this.prefs.shareRole = perm.value; this.savePrefs(); });
      const b1 = btn('Copy link', () => go(perm.value, b1), 'btn sm');
      p.append(mk('label', 'share-row', 'Your name'), name, mk('label', 'share-row', 'Anyone with the link'), perm, b1);
    }
    p.append(field, note);
    p.append(mk('div', 'share-sep'));
    p.append(mk('p', 'share-or', 'Take it elsewhere, as plain LaTeX:'));
    const row = mk('div', 'pop-row share-out');
    row.append(btn('Open in Overleaf', () => this.openInOverleaf()), btn(this.exportLabel(), () => this.save()), btn('Word (.docx)', () => { this.closePop(true); this.saveDocx(); }));
    const strip = mk('label', 'share-strip');
    const cb = mk('input'); cb.type = 'checkbox'; cb.checked = !!this.prefs.stripComments;
    cb.addEventListener('change', () => { this.prefs.stripComments = cb.checked; this.savePrefs(); });
    strip.append(cb, document.createTextNode(' without the comments'));
    p.append(row, strip);
    this.positionPop();
    (back || !this.myName() ? name : p.querySelector('button.btn:not(.ghost)')).focus();
  },

  // ---- opening a link -----------------------------------------------------------------
  async openSharedLink(s) {
    let o;
    try { o = await unpackShare(s, graphWhole); } catch (e) { this.toast('Could not open the link: ' + e.message, 8000); return; }
    await this.openLinked(o);
  },
  // a link with plain LaTeX in it (#tex=...): one file, opened as a shared link's document is
  async openTexLink(s) {
    let o;
    try { o = unpackTex(s); } catch (e) { this.toast('Could not open the link: ' + e.message, 8000); return; }
    await this.openLinked(o);
  },
  // what a link held, checked (unpackShare, unpackTex), becomes the open document
  async openLinked(o) {
    const theirs = new Map(o.files);
    // (own: no sender was named, so there is nobody to be a guest of)
    const by = o.own ? '' : String(o.by || 'A coauthor');
    // a document the page cannot read (nesting deeper than the parser's stack) would replace
    // the open project with one whose page and panels fail on every start: refused instead
    try { buildModel({ files: theirs, main: o.main }); } catch (e) { this.toast('Could not open the link: the editor cannot read the document in it (' + e.message + ').', 8000); return; }
    const base = o.base ? (await this.allSnaps()).find((v) => v.sig === o.base) : null;
    if (o.role === 'back' && base) { await this.takeBack(o, base, theirs); return; }
    // (R4, security review) a copy back naming no version this browser has, for a document it
    // shared for comments only: its comments cannot be told from edits, so it does not open over
    // that document (a copy that changes its base's name would otherwise bring every edit in)
    if (o.role === 'back' && (await this.allSnaps()).some((v) => v.share && v.share.role === 'comments' && v.name === (o.name || o.main) && v.main === o.main)) {
      this.toast(by + "'s copy answers a link for comments only, and this browser does not have the version it was shared from: it is not opened. Ask " + by + ' to send the link again from the copy they were sent.', 10000);
      return;
    }
    // the same coauthor link opened again (bookmarked, or clicked a second time in the chat): they
    // are already in this document, so keep what they have typed instead of resetting it to the
    // pristine shared copy, which would silently throw their edits away. Only a link Share made
    // says which version it is (its base): one built by hand has none, and a second such link
    // under the same name may be a revised document, so it opens (the open one kept as a version).
    // (the reader's copy may stand under a name of its own, beside a project of theirs: review M1)
    if (o.role !== 'back' && !o.own && o.base && this.shareCtx && this.shareCtx.base === o.base && this.main === o.main && (this.name === (o.name || o.main) || (this.shareCtx.by === by && this.shareCtx.name === this.name))) {
      this.guestMode(true);
      this.toast('You already have this shared document open, so your edits are kept. Earlier versions are under Review, Versions.', 7000);
      return;
    }
    if (this.base) { await this.snapshot('Before opening a shared document', { force: !this.lastSig }); await this.stashBinary(); }
    // A project's figures (and the bytes its files came in) are kept under its name and main
    // file, and a link carries none: opened under the name of a project this browser keeps
    // them for (the author trying their own link), it would take that project's place and its
    // figures would be overwritten at the next switch. Then it opens as a project of its own.
    const keeps = async (n) => {
      if (n === this.name && o.main === this.main && (this.assetBlobs.size || this.extra.size || this.orig.size)) return true;
      try { const b = await kvGet('bin:' + n + '|' + o.main); return !!(b && ((b.assets || []).length || (b.extra || []).length || (b.orig || []).length)); } catch (e) { return false; }
    };
    // (review M1, V2) a link under the name of a project this browser keeps opens as a project of
    // its own beside it, never over it, whether it names a sender or none (#tex=, a #share= built
    // by hand): whoever made it may have relabelled a copy back as a new link. Only the reader's
    // own copy of that sender's document, which this browser marked as theirs when it first
    // opened, is opened over (kept as a version).
    const snaps = await this.allSnaps();
    const theirsAlready = async (n) => { if (!by) return false; try { const r = await kvGet('share:' + n + '|' + o.main); return !!(r && r.by === by); } catch (e) { return false; } };
    // (a name alone is enough: Recent documents lists projects by name, so a link under a kept name
    // with another main file would hide the kept one there; Grok Bot's check of cfb9711)
    const taken = async (n) => (await keeps(n)) || ((n === this.name || snaps.some((v) => v.name === n)) && !(await theirsAlready(n)));
    let name = o.name || o.main;
    for (let k = 1; await taken(name); k++) name = (o.name || o.main) + ' (' + (by ? 'from ' + by : 'from a link') + (k > 1 ? ' ' + k : '') + ')';
    const apart = name !== (o.name || o.main);
    // marked before it loads: loading may start a compile, which must already see the mark
    this.markFromLink(by, name, o.main);
    this.loadProject(theirs, o.main, name, by ? 'As ' + by + ' shared it' : 'As the link had it');
    // a link that names no sender: the reader's own document from here on (still marked as
    // from a link, so it compiles restricted until they allow more)
    // (a guest's record kept under this name, from an earlier link, would make them a guest of
    // that sender in this document at the next start)
    if (o.own) { kvDel('share:' + this.name + '|' + this.main).catch(() => {}); this.toast(apart ? 'The document from the link is open as a project of its own, ' + name + ': this browser keeps a document under that name, which stays as it was.' : 'The document from the link is open. The one you had is under Review, Versions.', 9000); return; }
    if (o.role === 'back') {
      this.toast(by + "'s copy is open" + (apart ? ' as a project of its own, ' + name + ', beside yours' : '') + '. This browser does not have the version you shared, so their edits cannot be marked; your earlier text is under Review, Versions.', 10000);
      return;
    }
    if (apart) this.toast('The link from ' + by + ' is open as a project of its own, ' + name + ': this browser keeps a document under that name, which stays as it was.', 9000);
    this.shareCtx = { base: o.base, by, name: this.name, main: this.main, role: o.role === 'comments' ? 'comments' : 'coauthor', rid: o.rid || null };
    kvPut('share:' + this.name + '|' + this.main, this.shareCtx).catch(() => {});
    this.guestMode(true);
  },

  // Text that came in a link was written by someone else, and shell escape lets a document run
  // programs in this page's worker, where they could reach this browser's other projects. So a
  // project opened from a link, or holding a copy that came back, compiles with TeX Live's
  // restricted shell escape (the programs TeX Live allows by default) until its owner allows
  // more for it. Kept per project, so switching away and back keeps the restriction.
  async linkInfo() { return this.markOf(this.name, this.main); },
  // the mark kept under a project's name and main file, or null
  async markOf(name, main) {
    const k = name + '|' + main;
    this.linkCache = this.linkCache || new Map();
    if (!this.linkCache.has(k)) {
      let v = null;
      try { v = this.noIdb ? null : await kvGet('link:' + k); } catch (e) { v = null; }
      if (!this.linkCache.has(k)) this.linkCache.set(k, v || null); // a mark made meanwhile wins
    }
    return this.linkCache.get(k);
  },
  // (id: this import's own, kept by the copies carryLink makes under the project's other main
  // files: an Allow given under one of them lifts only marks of the same import, V1)
  markFromLink(by, name = this.name, main = this.main, origin = 'link') {
    const k = name + '|' + main;
    const v = { by, t: Date.now(), allowed: false, origin, id: importId() };
    this.linkCache = this.linkCache || new Map();
    this.linkCache.set(k, v);
    this.keepMark(k, v);
  },
  // A mark written to storage. A write refused (storage full, the database deleted by another tab)
  // is said, here and under Problems at every compile; the tab keeps the mark it holds, since
  // freshMark never takes storage's word over a restriction held here (W1).
  keepMark(k, v) {
    if (this.noIdb) return;
    kvPut('link:' + k, v).catch((e) => {
      this.marksNotKept = this.marksNotKept || new Set();
      if (this.marksNotKept.has(k)) return;
      this.marksNotKept.add(k);
      this.toast('This browser\'s storage did not keep the mark that restricts shell escape for ' + k.slice(0, k.lastIndexOf('|')) + ' (' + ((e && (e.name || e.message)) || e) + '). It stays restricted in this tab, but another tab, or this one after a reload, would not know it: free some storage, then open the file again.', 14000);
    });
  },
  // The mark of the project (mark: linkInfo's, or null) under another of its main files, whose own
  // mark (there: markOf's, read before) it meets: the stricter of the two stays. The key may hold
  // a stranger's document (a version of another project kept under the same name, a branch or a
  // pull that brought another main file), so what the project had here never loosens it: no mark
  // never deletes one there, nor does an Allow given here lift a restriction there (review I1).
  // fresh: the copy is a mark of its own (an import id of its own): a version opened under the
  // project's name may hold another import's files (a clone or a .zip opened under that name before
  // names were kept apart), so an Allow given there must not reach this import's other marks (V1).
  // File, Main document and a pull keep the id: the files are the same ones.
  carryLink(mark, main, there, fresh = false) {
    const k = this.name + '|' + main;
    let v = stricterMark(mark, there);
    if (fresh && v && v !== there) v = { ...v, id: importId() };
    this.linkCache = this.linkCache || new Map();
    this.linkCache.set(k, v);
    if (v && v !== there) this.keepMark(k, v);
  },
  // A guest's record of the link the document came in (guest mode, Send back), kept under the
  // project's name and main file, goes with it to another of its main files (File, Main document):
  // left under the old one, the next start read none and the guest was the document's owner (N4).
  carryShare(from, main) {
    const c = this.shareCtx;
    if (!c || c.name !== this.name || c.main !== from) return;
    this.shareCtx = { ...c, main };
    if (!this.noIdb) kvPut('share:' + this.name + '|' + main, this.shareCtx).catch(() => {});
  },
  // the sample and a new document hold nothing of a stranger's: a mark left under their name
  // (by an archive dropped on the sample, or a link to a document of that name) goes
  clearLink(name = this.name, main = this.main) {
    const k = name + '|' + main;
    this.linkCache = this.linkCache || new Map();
    this.linkCache.set(k, null);
    if (!this.noIdb) kvDel('link:' + k).catch(() => {});
  },
  // What the owner allows (shell escape, live figures) is for the project's files as they are
  // now, whichever of its documents is the main one: the marks kept under its other documents
  // from the same import (the same id: a .zip, a clone, a link, and the copies carryLink made of
  // its mark) get it too, so switching the main document, which keeps the stricter of two marks,
  // does not take it back. A mark of another import kept under the same name (a stranger's
  // repository cloned under the name of the user's own project before names were kept apart), or
  // one from before marks had ids, is never lifted by this Allow (V1). The mark here, or null when
  // there is none (or another project opened meanwhile).
  //
  // Every mark is read from storage again first: another tab of this browser may have marked the
  // project anew since this one showed it (an archive dropped there, with its own id). Then this
  // tab, showing the text from before, refuses until it has that text (a reload, or the text
  // brought in when it gets the focus): its Allow was written over the new restriction, and the
  // other tab compiled the archive with full shell escape (W2).
  async allowMark(field) {
    const name = this.name, main = this.main, k = name + '|' + main;
    const shown = this.linkCache && this.linkCache.get(k);
    const others = (this.mainDocs ? this.mainDocs() : []).filter((d) => d !== main);
    const marks = await Promise.all([main, ...others].map((d) => this.freshMark(name, d)));
    const here = marks[0];
    if (!here || this.name !== name || this.main !== main) return null;
    this.markStale = this.markStale || new Set();
    if (shown && here.id !== shown.id) this.markStale.add(k);
    if (this.markStale.has(k)) {
      this.toast('This document changed in another tab of this browser: new files arrived there, so shell escape is restricted again. Reload this tab to see them before you allow it.', 10000);
      return null;
    }
    let out = here;
    [main, ...others].forEach((d, i) => {
      const m = marks[i];
      if (!m || m[field] || (i && !(here.id && m.id === here.id))) return;
      // (a new object: a read of storage under way in freshMark sees that the mark changed)
      const v = { ...m, [field]: true };
      if (!i) out = v;
      this.linkCache.set(name + '|' + d, v);
      this.keepMark(name + '|' + d, v);
    });
    return out;
  },
  // The mark as storage has it now, read again: another tab of this browser may have marked the
  // project as holding a stranger's files since this tab read it (an archive dropped there), and
  // its text comes here (adoptOtherTab) and compiles here (V2). Storage can add a restriction,
  // never take away one this tab holds (a write refused, or the database deleted by another tab,
  // left none there and the next compile ran with full shell escape, W1): the stricter of the two.
  // This tab loosens a mark only by its own Allow.
  async freshMark(name = this.name, main = this.main) {
    if (this.noIdb) return this.markOf(name, main);
    const k = name + '|' + main;
    this.linkCache = this.linkCache || new Map();
    const before = this.linkCache.get(k);
    let stored;
    try { stored = (await kvGet('link:' + k)) || null; } catch (e) { return this.markOf(name, main); }
    const held = this.linkCache.has(k) ? this.linkCache.get(k) : null;
    // Another import's mark in storage (another tab's archive, its own id): this tab's text is not
    // that tab's, so its Allow is refused until the text is (adoptOtherTab, or a reload; X2). Taking
    // the id into the tab's copy here made a tab that only compiled look up to date. (A mark this
    // tab wrote while storage was read is not another tab's: its copy changed meanwhile then.)
    if (held && held === before && stored && stored.id !== held.id) (this.markStale = this.markStale || new Set()).add(k);
    const v = stricterMark(held, stored);
    this.linkCache.set(k, v);
    return v;
  },
  // a name this browser keeps no project under (Review, Versions' and the open one's), as
  // "thesis (2)": a project from someone else (a .zip, a clone, a Word file) never takes the name
  // of the user's own, whose marks and versions are kept under it (I1, V1)
  async freeProjectName(want) {
    const kept = new Set((await this.allSnaps()).map((v) => v.name));
    kept.add(this.name);
    let name = want;
    for (let k = 2; kept.has(name); k++) name = want + ' (' + k + ')';
    return name;
  },
  async allowShellHere() {
    if (!(await this.allowMark('allowed'))) return;
    this.syncEngineMenu();
    if (document.body.classList.contains('pdf-on')) this.compilePdf({ clean: true });
    else this.pdfStale = true;
  },
  // said under Problems at every compile, and once per project in a toast that can allow it
  noteRestricted(issues) {
    const v = this.linkCache && this.linkCache.get(this.name + '|' + this.main);
    const who = v && v.by ? v.by : 'someone else';
    // a .zip or a git repository is content from someone else just as a link is, so it is
    // restricted the same way; the wording follows how it arrived
    const origin = v && v.origin;
    const lost = this.marksNotKept && this.marksNotKept.has(this.name + '|' + this.main) ? ' This browser\'s storage did not keep that mark: another tab, or this one after a reload, would not know it.' : '';
    const came = origin === 'zip' ? 'was opened from a .zip file' : origin === 'git' ? 'was cloned from a git repository' : origin === 'share' ? 'was shared to Rikuy from another app' : origin === 'docx' ? 'was opened from a Word file' : origin === 'word' ? 'has edits from a Word file by ' + who : 'came in a link from ' + who;
    issues.unshift({ sev: 'warn', file: null, line: null, msg: 'Shell escape is restricted: this document ' + came + ', so it runs only the programs TeX Live allows by default. Tick Shell escape if you trust it.' + lost });
    const k = this.name + '|' + this.main;
    this.restrictNoted = this.restrictNoted || new Set();
    if (this.restrictNoted.has(k)) return;
    this.restrictNoted.add(k);
    this.toast('This document ' + came + ', so until you allow it, it compiles with restricted shell escape: packages that run other programs (gnuplot, some figures) are skipped.', 10000, { label: 'Allow', fn: () => this.allowShellHere() });
  },

  // a copy coming back: three way merge with what I wrote meanwhile, their edits marked
  async takeBack(o, snap, theirs) {
    const by = String(o.by || 'A coauthor');
    const baseFiles = new Map((await this.versionFiles(snap)) || []);
    // What the link this copy answers allowed, as this browser kept it when it made the link: the
    // copy's own word for it is never taken. A link for comments only lets in comment lines alone,
    // in the files that were shared; a copy that names no link of this version, where one of its
    // links was for comments only, is taken as that one.
    const role = linkRole(await this.allSnaps(), snap.sig, o.rid);
    let dropped = 0;
    if (role === 'comments') {
      // (where the model of the version shared reads body text: there alone; review H2)
      let blocks = [];
      try { blocks = buildModel({ files: baseFiles, main: snap.main }).blocks; } catch (e) { blocks = []; }
      const r = commentsBack(baseFiles, theirs, (f) => bodyAt(blocks, f, baseFiles.get(f) || ''));
      theirs = r.files;
      dropped = r.dropped;
    }
    if (!(this.name === snap.name && this.main === snap.main)) {
      // back to that project first, as it was last kept
      const last = (await this.allSnaps()).find((v) => v.name === snap.name && v.main === snap.main) || snap;
      if (this.base) { await this.snapshot('Before opening a shared document', { force: !this.lastSig }); await this.stashBinary(); }
      await this.loadBinary(snap.name, snap.main);
      this.loadProject(new Map((await this.versionFiles(last)) || baseFiles), snap.main, snap.name, 'Opened', true);
    }
    const mine = new Map(this.files);
    // (changes of your own waiting: kept, theirs come beside them, never into the base)
    const pending = !!this.base && this.realChanges().length > 0;
    // (a copy for comments only merged by whole lines: its comment lines never mix into text)
    const { files, conflicts, wide } = mergeProjects(baseFiles, mine, theirs, { words: role !== 'comments' });
    await this.snapshot('Before the changes from ' + by, { force: true });
    this.closeGroup();
    const edits = [];
    for (const [n, t] of files) if ((this.files.get(n) ?? null) !== t) edits.push({ f: n, s: 0, e: (this.files.get(n) ?? '').length, t });
    // (their edits are theirs: the changes carry their name, src/review.js)
    this.rvBy = by;
    if (edits.length) { this.markFromLink(by, this.name, this.main, 'back'); this.commit(edits, null, 'merge'); }
    this.rvBy = null;
    this.closeGroup();
    if (!pending) this.setBase({ t: Date.now(), label: 'Before the changes from ' + by, files: mine });
    this.setMarks(true);
    this.toggleNav(true, 'changes');
    const n = this.currentChanges().filter((x) => !commentOnly(x)).length;
    const c = [...this.files].reduce((k, [f, t]) => k + findComments(t, f).length, 0) - [...mine].reduce((k, [f, t]) => k + findComments(t, f).length, 0);
    let msg = edits.length ? by + "'s copy is in: " + plural(n, 'change', 'changes') + (c > 0 ? ' and ' + plural(c, 'comment', 'comments') : '') + ', marked on the page. Accept or reject each under Review.' : by + ' sent the document back unchanged.';
    // (and how far theirs were taken where a conflict would have split a pair: review V4-B)
    if (conflicts.length) msg += ' In ' + conflicts.join(', ') + ' you both changed the same words, so theirs are shown there' + wideSaid(wide) + '; your text from before is under Review, Versions.';
    if (dropped) msg += ' The link let ' + by + ' comment only: ' + plural(dropped, 'edit of the text was', 'edits of the text were') + ' left out.';
    this.toast(msg, 12000);
  },

  // replace the open project with these files (the caller kept a version of the old one)
  loadProject(files, main, name, label, keepBinary) {
    if (!keepBinary) {
      for (const u of this.assets.values()) URL.revokeObjectURL(u);
      this.assets.clear(); this.assetBlobs.clear(); this.extra.clear(); this.orig.clear();
    }
    this.files = files;
    this.main = main;
    this.name = name;
    // (no place of the document before: a command with no caret on the page acts at this one's end)
    this.rbLast = null;
    this.binaryDirty = true;
    this.zipDirty = false;
    this.hist = []; this.redoStack = []; this.updateUndoUI();
    this.forceRender = true;
    this.srcFile = this.main;
    this.desk.scrollTop = 0;
    this.rebuild();
    if (this.cm || this.cmFallback) this.showSrcFile(this.main);
    this.updateFileTabs();
    this.persist();
    this.setBase({ t: Date.now(), label, files: this.files });
    this.lastSig = null;
    this.snapshot(label);
    this.resetPdf();
    this.shareCtx = null;
    this.guestMode(false);
    this.refreshNav();
    // a document opened from the backstage is shown on the page, as Word leaves File once the file is open
    if (this.rbTab === 'file' && this.selectTab) this.selectTab('home');
    if (this.noteSaveState) this.noteSaveState();
  },

  async loadShareCtx() {
    try { this.shareCtx = await kvGet('share:' + this.name + '|' + this.main); } catch (e) { this.shareCtx = null; }
    if (this.shareCtx && this.shareCtx.dismissed !== true) this.guestMode(true);
    // a copy from a link shows whose its missing figures are: redrawn once that is known
    if ((await this.linkInfo()) && this.figuresWith()) { this.forceRender = true; this.rebuild(); }
  },
  // who has the figures of a copy opened from a link (a link carries none), or null
  figuresWith() {
    const v = this.linkCache && this.linkCache.get(this.name + '|' + this.main);
    return v && (v.origin || 'link') === 'link' && v.by ? v.by : null;
  },

  // the view for someone the document was shared with: the page, a line saying what to do,
  // and the way back; the source stays one click away
  guestMode(on) {
    document.body.classList.toggle('guest', !!on);
    // (the Chinese and Arabic set up is offered to a document's owner only: looked at again)
    if (this.scriptsSoon) this.scriptsSoon();
    const g = $('#guest');
    if (!g) return;
    g.hidden = !on;
    if (!on) return;
    $('#guest-msg').textContent = this.shareCtx.role === 'comments'
      ? this.shareCtx.by + ' shared this document with you for comments. Select words and press New Comment (Ctrl+Alt+M); the text itself stays as it is.'
      : this.shareCtx.by + ' shared this document with you. Click anywhere on the page and type; select words to comment. Your edits are marked for ' + this.shareCtx.by + '.';
    if (document.body.classList.contains('src-on')) this.toggleSource(false);
    if (!this.markupOn()) this.setMarks(true);
    // (a guest's edits are changes for the owner: tracked from the start)
    if (this.base && !this.base.track) { this.base.track = true; this.saveBase(); }
  },

  // a shared link pasted into the page opens it, after asking
  maybeOpenPasted(text) {
    const s = shareParam(text), t = s ? null : texParam(text);
    if ((!s && t == null) || text.trim().split(/\s+/).length > 1) return false;
    this.toast('That is a link to a shared document.', 8000, { label: 'Open it', fn: () => (s ? this.openSharedLink(s) : this.openTexLink(t)) });
    return true;
  },

  // a comments only link's document: an edit that changes more than comment lines is refused
  // (src/review.js rvRefuse, from App.commit), whatever made it: typing, a command, the source
  commentsOnlyRefuse(edits) {
    const byF = new Map();
    for (const ed of edits) { if (!byF.has(ed.f)) byF.set(ed.f, []); byF.get(ed.f).push(ed); }
    for (const [f, list] of byF) {
      if (!this.files.has(f)) return true;
      const before = this.files.get(f);
      let t = before;
      for (const ed of list.slice().sort((x, y) => y.s - x.s || y.e - x.e)) t = t.slice(0, ed.s) + ed.t + t.slice(ed.e);
      if (!onlyComments(before, t)) return true;
    }
    return false;
  },

  // ---- comments -----------------------------------------------------------------------
  allComments() {
    const out = [];
    for (const [f, t] of this.files) if (/\.tex$/i.test(f)) out.push(...findComments(t, f));
    return out;
  },

  commentOnSelection() {
    const sel = getSelection();
    let c = this.caretNow();
    // (the last selection stands in for one a button's press collapsed, the caret left at one of
    // its ends; a caret put anywhere else since, inside it too, is where the comment goes, as Word
    // puts it: one on a word selected earlier went to that word's paragraph)
    const L = this.lastSel;
    if ((!c || c.collapsed) && L && Date.now() - this.lastSelT < 60000 && (!c || (c.f === L.f && (c.p === L.a || c.p === L.b)))) c = L;
    if (!c || c.f == null) { this.toast('Select the words the comment is about, or put the cursor there.'); return; }
    const quote = sel.rangeCount && !sel.isCollapsed ? String(sel) : '';
    const rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    this.hideBubble();
    this.commentPop({ f: c.f, p: c.b ?? c.p, quote, rect, caret: { f: c.f, p: c.b ?? c.p } });
  },

  // the comment box; with o.thread, a reply under that thread
  commentPop(o) {
    const p = this.makePop(o.anchor || null, 'pop-comment', o.thread ? 'Reply' : 'Comment');
    if (!o.anchor && o.rect) this.pop.rect = o.rect;
    if (o.thread) {
      const t = o.thread;
      const list = mk('div', 'cm-thread');
      for (const x of [{ who: t.who, body: t.body }, ...t.replies]) {
        const r = mk('div', 'cm-msg');
        r.append(mk('b', '', x.who), document.createTextNode(' ' + x.body));
        list.append(r);
      }
      p.append(list);
    } else if (o.quote) p.append(mk('div', 'cm-quote', o.quote.length > 120 ? o.quote.slice(0, 117) + '…' : o.quote));
    const name = this.nameInput();
    const ta = mk('textarea', 'cm-body'); ta.rows = 3; ta.placeholder = o.thread ? 'Reply' : 'Your comment';
    const send = () => {
      const who = name.value.trim() || this.myName();
      // (said, not only a placeholder: a press of Comment that does nothing read as broken)
      if (!who) { name.setAttribute('aria-invalid', 'true'); name.placeholder = 'Your name first'; hint.hidden = false; name.focus(); return; }
      this.prefs.who = who; this.savePrefs();
      const f = o.thread ? o.thread.f : o.f;
      const at = o.thread ? o.thread.e - 1 : o.p;
      // (a reader of a comments only link writes the form the author's copy takes it in: src/share.js)
      const ed = commentEdit(this.src(f), Math.max(0, at), { who, quote: o.quote, body: ta.value, reply: !!o.thread, safe: !!(this.shareCtx && this.shareCtx.role === 'comments') });
      if (!ed) {
        this.toast(ta.value.trim() ? 'A comment cannot go here: inside verbatim text or before \\begin{document} TeX would print it.' : 'Write the comment first.');
        return;
      }
      this.closePop(true);
      this.commit([{ f, ...ed }], o.caret || null, 'comment');
      this.closeGroup();
      this.refreshNav();
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
    const row = mk('div', 'pop-row');
    if (o.thread) row.append(btn('Resolve', () => { this.closePop(true); this.resolveComment(o.thread); }));
    row.append(mk('span', 'grow'), btn(o.thread ? 'Reply' : 'Comment', send, 'btn sm'));
    // the first comment from this browser asks for a name (a browser has no account name, as
    // Word has): the name box first, Enter there goes on to the comment
    const hint = mk('div', 'cm-hint', 'Type your name: it is shown with your comment.');
    hint.hidden = true;
    hint.setAttribute('role', 'status');
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } });
    name.addEventListener('input', () => { if (name.value.trim()) { name.removeAttribute('aria-invalid'); hint.hidden = true; } });
    const ask = !this.myName();
    if (ask) p.append(name, hint);
    p.append(ta, row);
    this.positionPop();
    (ask ? name : ta).focus();
  },

  resolveComment(t) {
    // the thread as it is now: the text may have moved since the list was drawn
    const now = findComments(this.src(t.f), t.f).find((x) => x.who === t.who && x.body === t.body && x.quote === t.quote);
    if (!now) { this.refreshNav(); return; }
    this.commit([{ f: t.f, s: now.s, e: now.e, t: '' }], null, 'comment');
    this.closeGroup();
    this.refreshNav();
  },

  // the top of the Review tab; with no comments only a line saying how to make one
  renderComments(body) {
    const list = this.allComments();
    const key = (/Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl') + '+Alt+M';
    if (!list.length) {
      body.append(mk('div', 'cm-none', 'Comments: select words on the page and press Comment (' + key + '). Each is a LaTeX comment line, which Overleaf, Git and TeX keep and never print.'));
      return;
    }
    body.append(mk('div', 'ver-h', plural(list.length, 'comment', 'comments')));
    for (const t of list) {
      const card = mk('div', 'cm-card');
      const head = mk('button', 'cm-head'); head.type = 'button';
      head.append(mk('b', '', t.who), document.createTextNode(' ' + t.body));
      if (t.quote) head.prepend(mk('span', 'cm-q', '“' + t.quote + '” '));
      // (the caret to the comment on the page, as Next Comment puts it and Word's pane does: the
      // press only scrolled, and the next key or Delete Comment acted where the caret had been;
      // a finger's tap brings no keyboard up)
      head.addEventListener('click', () => { this.goTo(t.f, t.as); if (!matchMedia('(pointer: coarse)').matches) this.restoreCaret({ f: t.f, p: t.as, bias: 1 }, true); this.flashComment(t); });
      card.append(head);
      for (const r of t.replies) { const x = mk('div', 'cm-reply'); x.append(mk('b', '', r.who), document.createTextNode(' ' + r.body)); card.append(x); }
      const row = mk('div', 'pop-row');
      row.append(btn('Reply', (e) => this.commentPop({ thread: t, anchor: e.currentTarget })), btn('Resolve', () => this.resolveComment(t)));
      card.append(row);
      body.append(card);
    }
    body.append(mk('div', 'ver-h', 'Changes'));
  },

  // DOM ranges of the words a comment quotes, inside the line it hangs under
  commentRanges(t) {
    const rs = this.index.domRanges(t.f, [[t.as, t.ae]]);
    if (!rs.length) return [];
    if (!t.quote) return [];
    const q = t.quote.replace(/…$/, '').replace(/\s+/g, ' ').trim();
    if (!q) return [];
    // the text of the line as the page shows it, with where each character sits
    const at = [];
    let text = '';
    // each range lies inside one text node (CaretIndex.domRanges)
    for (const r of rs) {
      const n = r.startContainer;
      if (n.nodeType !== 3) continue;
      for (let i = r.startOffset; i < r.endOffset; i++) {
        const ch = /\s/.test(n.data[i]) ? ' ' : n.data[i];
        if (ch === ' ' && text.endsWith(' ')) continue;
        text += ch; at.push([n, i]);
      }
    }
    const i = text.indexOf(q);
    if (i < 0) return [];
    const R = document.createRange();
    const [n0, o0] = at[i], [n1, o1] = at[i + q.length - 1];
    R.setStart(n0, o0); R.setEnd(n1, o1 + 1);
    return [R];
  },

  flashComment(t) {
    const rs = this.commentRanges(t);
    const HL = window.CSS && CSS.highlights;
    if (!rs.length || !HL || !window.Highlight) { this.flashRange(t.f, t.as, t.ae); return; }
    HL.set('g-cmt-on', new window.Highlight(...rs));
    clearTimeout(this.cmFlashT);
    this.cmFlashT = setTimeout(() => HL.delete('g-cmt-on'), 1600);
  },

  // the quoted words lightly marked, and a mark in the margin by each thread
  paintComments() {
    for (const x of this.root.querySelectorAll('.cm-layer')) x.remove();
    const HL = window.CSS && CSS.highlights;
    if (HL) HL.delete('g-cmt');
    // (Show Comments off, under Review: neither the words nor the margin's marks)
    if (!this.model || this.prefs.showCmt === false) return;
    const list = this.allComments();
    if (!list.length) return;
    const all = [];
    const layers = new Map();
    for (const t of list) {
      const rs = this.commentRanges(t);
      all.push(...rs);
      let where = rs[0];
      if (!where) {
        const r = this.index.find(t.f, t.ae, -1);
        if (!r || !r.node) continue;
        where = document.createRange();
        try { where.setStart(r.node, Math.min(r.offset, r.node.length ?? 0)); } catch (e) { continue; }
        where.collapse(true);
      }
      const q = where.getClientRects()[0] || where.getBoundingClientRect();
      const node = where.startContainer;
      const page = (node.nodeType === 1 ? node : node.parentElement).closest('.page');
      if (!q || !page) continue;
      let L = layers.get(page);
      if (!L) { L = mk('div', 'cm-layer'); L.contentEditable = 'false'; page.append(L); layers.set(page, L); L.used = []; }
      const P = page.getBoundingClientRect();
      let top = q.top - P.top;
      while (L.used.some((y) => Math.abs(y - top) < 22)) top += 22;
      L.used.push(top);
      const m = mk('button', 'cm-mark'); m.type = 'button';
      m.style.top = top + 'px';
      m.title = t.who + ': ' + t.body + (t.replies.length ? ' (' + plural(t.replies.length, 'reply', 'replies') + ')' : '');
      m.setAttribute('aria-label', 'Comment by ' + m.title);
      m.textContent = String(1 + t.replies.length);
      m.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      m.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.commentPop({ thread: t, anchor: m }); });
      L.append(m);
    }
    if (HL && window.Highlight && all.length) HL.set('g-cmt', new window.Highlight(...all));
  },

  // ---- leaving ------------------------------------------------------------------------
  // one .tex when the project is one file, else a .zip; both exactly the source
  exportLabel() { return this.singleFile() ? 'Download ' + this.main.split('/').pop() : 'Download .zip'; },
  singleFile() { return this.files.size === 1 && !this.assetBlobs.size && !this.extra.size; },
  exportText(t) { return this.prefs.stripComments ? stripComments(t) : t; },

  // Overleaf takes a whole project as a .zip in a data URL, posted to its /docs page
  async openInOverleaf() {
    try {
      const blob = await this.zipBlob({ git: false });
      const uri = 'data:application/zip;base64,' + await blobToBase64(blob);
      const form = document.createElement('form');
      form.method = 'POST'; form.action = 'https://www.overleaf.com/docs'; form.target = '_blank'; form.hidden = true;
      const field = (n, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; form.append(i); };
      field('snip_uri', uri);
      field('snip_name', (this.name || 'paper').replace(/[^\w.-]+/g, '-'));
      const eng = this.engineChoice && this.engineChoice();
      if (eng && /^(pdflatex|xelatex|lualatex)$/.test(eng)) field('engine', eng);
      field('main_document', this.main);
      // On the hosted copy the page's Content-Security-Policy is form-action 'self', so the POST to
      // overleaf.com is refused and no tab opens. Catch that and point to the way that does work,
      // instead of claiming success that never happened.
      let blocked = false;
      const onViol = (e) => { if (/^form-action/.test(e.effectiveDirective || '')) blocked = true; };
      document.addEventListener('securitypolicyviolation', onViol);
      document.body.append(form);
      form.submit();
      form.remove();
      await new Promise((r) => setTimeout(r, 60));
      document.removeEventListener('securitypolicyviolation', onViol);
      if (blocked) {
        this.toast('This copy of Rikuy cannot hand the project to Overleaf directly (its page is locked to its own site). Use Download .zip, then in Overleaf choose New Project, Upload Project.', 12000);
        return;
      }
      // the form posts to a new tab, so Rikuy never sees whether Overleaf accepted it; a large
      // project (the whole .zip travels in the data URL) is where it may be rejected, so say so
      // plainly here rather than leave a silent failure, and point to the reliable way in.
      const big = uri.length > 8e6;
      this.toast(big
        ? 'Overleaf is opening in a new tab. This project is large (' + Math.round(uri.length / 1e6) + ' MB), and Overleaf may refuse an import this size. If it does, use Download .zip and upload it there.'
        : 'Overleaf opens in a new tab with a copy of this project.', big ? 10000 : 6000);
    } catch (e) {
      this.toast('Could not send the project to Overleaf: ' + ((e && e.message) || e), 8000);
    }
  }
};

// Ctrl/Cmd+Alt+M comments, as in Word and Google Docs; pasted share links open
export function installCollab(app) {
  document.addEventListener('keydown', (e) => {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform || '') ? e.metaKey : e.ctrlKey;
    if (mod && e.altKey && (e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) { e.preventDefault(); app.commentOnSelection(); }
  });
  // a link opened in a tab that already shows the editor changes only the fragment
  window.addEventListener('hashchange', () => {
    const s = shareParam(location.hash), t = s ? null : texParam(location.hash);
    if (!s && t == null) return;
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* framed */ }
    if (s) app.openSharedLink(s); else app.openTexLink(t);
  });
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, .CodeMirror, .pop')) return;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text && app.maybeOpenPasted(text)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}
