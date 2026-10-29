// Working with people who do not use the editor, or LaTeX: a link that opens the document ready
// to type in (no account; the document travels inside the link), comments on the typeset page
// that are LaTeX comments in the source, a copy sent back that arrives as tracked changes, and
// one click out to Overleaf or a plain .tex. The methods join App's prototype (app.js).

import { packShare, unpackShare, shareParam, findComments, commentEdit, stripComments, mergeProjects, commentOnly } from './share.js';
import { kvGet, kvPut } from './store.js';
import { buildModel } from './model.js';

const $ = (s, r = document) => r.querySelector(s);
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(label, fn, cls) { const b = mk('button', cls || 'btn ghost sm', label); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }

// past this many characters a few mail and chat apps cut links short
const LONG_LINK = 60000;

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

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

  async makeShareLink(role) {
    let base = null;
    if (role === 'back') base = this.shareCtx && this.shareCtx.base;
    else {
      // the version shared is kept, so the copy that comes back can be compared with it
      const v = await this.snapshot('Shared', { force: true, named: true });
      base = (v && v.sig) || this.lastSig || null;
    }
    const o = { v: 1, name: this.name, main: this.main, files: [...this.files.entries()], base, by: this.myName() || 'A coauthor', role, t: Date.now() };
    const url = this.shareBase() + '#share=' + await packShare(o);
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
    if (L.url.length > LONG_LINK) parts.push('This link is long (' + Math.round(L.url.length / 1000) + ' thousand characters); if a chat app cuts it, send it by email.');
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
      const b1 = btn('Copy link', () => go('coauthor', b1), 'btn sm');
      p.append(mk('label', 'share-row', 'Your name'), name, b1);
    }
    p.append(field, note);
    p.append(mk('div', 'share-sep'));
    p.append(mk('p', 'share-or', 'Take it elsewhere, as plain LaTeX:'));
    const row = mk('div', 'pop-row share-out');
    row.append(btn('Open in Overleaf', () => this.openInOverleaf()), btn(this.exportLabel(), () => this.save()));
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
    try { o = await unpackShare(s); } catch (e) { this.toast('Could not open the link: ' + e.message, 8000); return; }
    const theirs = new Map(o.files);
    const by = String(o.by || 'A coauthor');
    // a document the page cannot read (nesting deeper than the parser's stack) would replace
    // the open project with one whose page and panels fail on every start: refused instead
    try { buildModel({ files: theirs, main: o.main }); } catch (e) { this.toast('Could not open the link: the editor cannot read the document in it (' + e.message + ').', 8000); return; }
    const base = o.base ? (await this.allSnaps()).find((v) => v.sig === o.base) : null;
    if (o.role === 'back' && base) { await this.takeBack(o, base, theirs); return; }
    // the same coauthor link opened again (bookmarked, or clicked a second time in the chat): they
    // are already in this document, so keep what they have typed instead of resetting it to the
    // pristine shared copy, which would silently throw their edits away.
    if (o.role !== 'back' && this.shareCtx && this.shareCtx.base === o.base && this.name === (o.name || o.main) && this.main === o.main) {
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
    let name = o.name || o.main;
    for (let k = 1; await keeps(name); k++) name = (o.name || o.main) + ' (' + by + (k > 1 ? ' ' + k : '') + ')';
    // marked before it loads: loading may start a compile, which must already see the mark
    this.markFromLink(by, name, o.main);
    this.loadProject(theirs, o.main, name, 'As ' + by + ' shared it');
    if (o.role === 'back') {
      this.toast(by + "'s copy is open. This browser does not have the version you shared, so their edits cannot be marked; your earlier text is under Review, Versions.", 10000);
      return;
    }
    this.shareCtx = { base: o.base, by, name: this.name, main: this.main };
    kvPut('share:' + this.name + '|' + this.main, this.shareCtx).catch(() => {});
    this.guestMode(true);
  },

  // Text that came in a link was written by someone else, and shell escape lets a document run
  // programs in this page's worker, where they could reach this browser's other projects. So a
  // project opened from a link, or holding a copy that came back, compiles with TeX Live's
  // restricted shell escape (the programs TeX Live allows by default) until its owner allows
  // more for it. Kept per project, so switching away and back keeps the restriction.
  async linkInfo() {
    const k = this.name + '|' + this.main;
    this.linkCache = this.linkCache || new Map();
    if (!this.linkCache.has(k)) {
      let v = null;
      try { v = this.noIdb ? null : await kvGet('link:' + k); } catch (e) { v = null; }
      if (!this.linkCache.has(k)) this.linkCache.set(k, v || null); // a mark made meanwhile wins
    }
    return this.linkCache.get(k);
  },
  markFromLink(by, name = this.name, main = this.main, origin = 'link') {
    const k = name + '|' + main;
    const v = { by, t: Date.now(), allowed: false, origin };
    this.linkCache = this.linkCache || new Map();
    this.linkCache.set(k, v);
    if (!this.noIdb) kvPut('link:' + k, v).catch(() => {});
  },
  async allowShellHere() {
    const v = await this.linkInfo();
    if (!v) return;
    v.allowed = true;
    if (!this.noIdb) kvPut('link:' + this.name + '|' + this.main, v).catch(() => {});
    this.syncEngineMenu();
    if (document.body.classList.contains('pdf-on')) this.compilePdf({ clean: true });
  },
  // said under Problems at every compile, and once per project in a toast that can allow it
  noteRestricted(issues) {
    const v = this.linkCache && this.linkCache.get(this.name + '|' + this.main);
    const who = v && v.by ? v.by : 'someone else';
    // a .zip or a git repository is content from someone else just as a link is, so it is
    // restricted the same way; the wording follows how it arrived
    const origin = v && v.origin;
    const came = origin === 'zip' ? 'was opened from a .zip file' : origin === 'git' ? 'was cloned from a git repository' : 'came in a link from ' + who;
    issues.unshift({ sev: 'warn', file: null, line: null, msg: 'Shell escape is restricted: this document ' + came + ', so it runs only the programs TeX Live allows by default. Tick Shell escape if you trust it.' });
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
    if (!(this.name === snap.name && this.main === snap.main)) {
      // back to that project first, as it was last kept
      const last = (await this.allSnaps()).find((v) => v.name === snap.name && v.main === snap.main) || snap;
      if (this.base) { await this.snapshot('Before opening a shared document', { force: !this.lastSig }); await this.stashBinary(); }
      await this.loadBinary(snap.name, snap.main);
      this.loadProject(new Map((await this.versionFiles(last)) || baseFiles), snap.main, snap.name, 'Opened', true);
    }
    const mine = new Map(this.files);
    const { files, conflicts } = mergeProjects(baseFiles, mine, theirs);
    await this.snapshot('Before the changes from ' + by, { force: true });
    this.closeGroup();
    const edits = [];
    for (const [n, t] of files) if ((this.files.get(n) ?? null) !== t) edits.push({ f: n, s: 0, e: (this.files.get(n) ?? '').length, t });
    if (edits.length) { this.markFromLink(by); this.commit(edits, null, 'merge'); }
    this.closeGroup();
    this.setBase({ t: Date.now(), label: 'Before the changes from ' + by, files: mine });
    this.setMarks(true);
    this.toggleNav(true, 'changes');
    const n = this.currentChanges().filter((x) => !commentOnly(x)).length;
    const c = [...this.files].reduce((k, [f, t]) => k + findComments(t, f).length, 0) - [...mine].reduce((k, [f, t]) => k + findComments(t, f).length, 0);
    let msg = edits.length ? by + "'s copy is in: " + plural(n, 'change', 'changes') + (c > 0 ? ' and ' + plural(c, 'comment', 'comments') : '') + ', marked on the page. Accept or reject each under Review.' : by + ' sent the document back unchanged.';
    if (conflicts.length) msg += ' In ' + conflicts.join(', ') + ' you both edited the same lines, so their version is shown; yours is under Review, Versions.';
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
  },

  async loadShareCtx() {
    try { this.shareCtx = await kvGet('share:' + this.name + '|' + this.main); } catch (e) { this.shareCtx = null; }
    if (this.shareCtx && this.shareCtx.dismissed !== true) this.guestMode(true);
  },

  // the view for someone the document was shared with: the page, a line saying what to do,
  // and the way back; the source stays one click away
  guestMode(on) {
    document.body.classList.toggle('guest', !!on);
    const g = $('#guest');
    if (!g) return;
    g.hidden = !on;
    if (!on) return;
    $('#guest-msg').textContent = this.shareCtx.by + ' shared this document with you. Click anywhere on the page and type; select words to comment. Your edits are marked for ' + this.shareCtx.by + '.';
    if (document.body.classList.contains('src-on')) this.toggleSource(false);
    if (!this.prefs.marks) this.setMarks(true);
  },

  // a shared link pasted into the page opens it, after asking
  maybeOpenPasted(text) {
    const s = shareParam(text);
    if (!s || text.trim().split(/\s+/).length > 1) return false;
    this.toast('That is a link to a shared document.', 8000, { label: 'Open it', fn: () => this.openSharedLink(s) });
    return true;
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
    if ((!c || c.collapsed) && this.lastSel && Date.now() - this.lastSelT < 60000) c = this.lastSel;
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
      if (!who) { name.focus(); name.placeholder = 'Your name first'; return; }
      this.prefs.who = who; this.savePrefs();
      const f = o.thread ? o.thread.f : o.f;
      const at = o.thread ? o.thread.e - 1 : o.p;
      const ed = commentEdit(this.src(f), Math.max(0, at), { who, quote: o.quote, body: ta.value, reply: !!o.thread });
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
    if (!this.myName()) p.append(name);
    p.append(ta, row);
    this.positionPop();
    ta.focus();
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
      head.addEventListener('click', () => { this.goTo(t.f, t.as); this.flashComment(t); });
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
    if (!this.model) return;
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
    const s = shareParam(location.hash);
    if (!s) return;
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* framed */ }
    app.openSharedLink(s);
  });
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, .CodeMirror, .pop')) return;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text && app.maybeOpenPasted(text)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}
