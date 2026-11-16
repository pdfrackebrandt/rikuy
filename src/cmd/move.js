// Drag to move (Word's H82): selected words dragged elsewhere on the page move there, a picture
// selected on the page is dragged by a press (mouse or finger) and dropped between paragraphs or
// among words. Each move is one commit, the text taken out and put in again in the same step, so
// one undo gives back the bytes of before; Ctrl (Option on a Mac) as it drops copies instead. A
// move never crosses files (one commit in two files would let an undo of one go without the
// other): a drop in another file says so and leaves both. What another page or program drags in
// is taken as its words and HTML, as a paste of them is (never as LaTeX it says it is).

import { onInstall } from '../commands.js';
import { BLOCKS } from '../render.js';
import { posFromDom, endsWithControlWord, styOfEl } from '../editor.js';

export const methods = {};
const TYPE = 'text/x-rikuy-move';
// a block's box on the page: all its items (a list's, a table's rows), where a picture goes before or after
function blockRect(it) {
  const all = [...document.querySelectorAll('#pages .it[data-b="' + it.dataset.b + '"]')].map((x) => x.getBoundingClientRect()).filter((q) => q.height);
  if (!all.length) return it.getBoundingClientRect();
  const top = Math.min(...all.map((q) => q.top)), bottom = Math.max(...all.map((q) => q.bottom)), left = Math.min(...all.map((q) => q.left)), right = Math.max(...all.map((q) => q.right));
  return { top, bottom, left, right, width: right - left, height: bottom - top };
}
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

Object.assign(methods, {
  // The page's dragstart: a selection of words starts a move; anything else stays put
  dragMoveStart(e) {
    const c = this.caretNow();
    const dt = e.dataTransfer;
    if (!dt || !c || c.collapsed || c.ghost || c.crossFile || this.stale || this.armed) return false;
    const latex = this.selectionLatex(c);
    if (!latex) return false;
    const plain = getSelection().toString().replace(/\u200B/g, '');
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    // (the formatting the words stand in, innermost first: they keep it where they go, as Word's)
    const src = this.src(c.f), wraps = [];
    const n0 = getSelection().anchorNode;
    for (let n = n0 && (n0.nodeType === 1 ? n0 : n0.parentElement); n && n !== this.root && wraps.length < 12; n = n.parentElement) {
      if (!n.dataset || !n.dataset.y) continue;
      const y = styOfEl(n);
      if (!y || y.f !== c.f || y.is == null || y.ie == null || !(y.is <= c.a && c.b <= y.ie) || (y.is === c.a && y.ie === c.b) || y.ie - y.s > 200000) continue;
      wraps.push({ is: y.is, ie: y.ie, pre: src.slice(y.s, y.is), post: src.slice(y.ie, y.e) });
    }
    this.dragMove = { f: c.f, a: c.a, b: c.b, latex, token, src, wraps };
    dt.setData('text/plain', plain);
    dt.setData(TYPE, token);
    dt.effectAllowed = 'copyMove';
    return true;
  },
  dragMoveOver(e) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const types = [...(dt.types || [])];
    if (types.includes('Files')) return;
    if (types.includes(TYPE) || types.includes('text/plain') || types.includes('text/html')) {
      e.preventDefault();
      dt.dropEffect = types.includes(TYPE) && !(isMac() ? e.altKey : e.ctrlKey) ? 'move' : 'copy';
    }
  },
  // The page's drop: true where it was handled here
  dragMoveDrop(e) {
    const dt = e.dataTransfer;
    if (!dt || (dt.files && dt.files.length)) return false;
    e.preventDefault();
    const M = this.dragMove;
    this.dragMove = null;
    const ours = !!M && dt.getData(TYPE) === M.token;
    const pos = this.posAtPoint(e.clientX, e.clientY);
    if (!pos) return true;
    if (ours) return this.moveSource(M, pos, isMac() ? e.altKey : e.ctrlKey);
    // (from elsewhere: its words and HTML, as a paste of them at the place dropped)
    this.restoreCaret({ f: pos.f, p: pos.p });
    const data = { 'text/plain': dt.getData('text/plain') || '', 'text/html': dt.getData('text/html') || '' };
    const kept = this.lastCopy;
    this.lastCopy = null;
    try { this.onPaste({ preventDefault() {}, clipboardData: { getData: (t) => data[t] || '', files: [] } }); } finally { this.lastCopy = kept; }
    return true;
  },
  dragMoveEnd() { this.dragMove = null; },
  // the source place under a point of the screen: { f, p } (never in a LaTeX block's header, an
  // equation or a picture: before or after them)
  posAtPoint(x, y) {
    // (Firefox has caretPositionFromPoint alone)
    let r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!r && document.caretPositionFromPoint) { const q = document.caretPositionFromPoint(x, y); if (q) r = { startContainer: q.offsetNode, startOffset: q.offset }; }
    if (!r || !this.root.contains(r.startContainer)) return null;
    const p = posFromDom(r.startContainer, r.startOffset, this.root);
    return p && !p.ghost && p.f != null && Number.isFinite(p.p) ? { f: p.f, p: p.p } : null;
  },
  // Move (or copy) source [M.a, M.b) of file M.f to pos, as Cut and Paste would, in one step. The
  // text is the one the drag began with: if the file changed meanwhile nothing moves.
  moveSource(M, pos, copy) {
    if (pos.f !== M.f) { this.toast('Text is moved within one file: copy it (Ctrl+C) and paste it in the other.', 6000); return false; }
    const src = this.src(M.f);
    if (src !== M.src) { this.toast('The text changed while it was dragged: nothing moved.'); return false; }
    if (!copy && pos.p >= M.a && pos.p <= M.b) return false;
    const del = copy ? [] : this.deletionEdits(M.f, M.a, M.b);
    // (Word's smart spacing: a word taken from between spaces takes one of them along, one put
    // between letters gets a space each side it needs)
    const W = /[\p{L}\p{N}]/u;
    if (del.length === 1 && del[0].s === M.a && del[0].e === M.b && !del[0].t && src[M.a - 1] === ' ' && /^[ .,;:!?)}]/.test(src[M.b] || '') && W.test(src[M.a] || '') && W.test(src[M.b - 1] || '')) del[0] = { ...del[0], s: M.a - 1 };
    // (a drop inside what the deletion takes, a wrapper left empty: at its edge)
    let at = pos.p;
    for (const d of del) if (at > d.s && at < d.e) at = d.e;
    let t = M.latex;
    // (wrapped again in what held it, but in none the place dropped is in too)
    for (const w of M.wraps || []) if (!(w.is <= at && at <= w.ie)) t = w.pre + t + w.post;
    if (this.texAt(M.f, at)) t = t.replace(/\r\n?/g, '\n');
    else if (/^[A-Za-z]/.test(t) && endsWithControlWord(src, at)) t = '{}' + t;
    // (a word, a number or a formula on either side: a space between)
    const wordL = (k) => W.test(src[k - 1] || '') || src[k - 1] === '$' || src.slice(k - 2, k) === '\\)';
    const wordR = (k) => W.test(src[k] || '') || src[k] === '$' || src.slice(k, k + 2) === '\\(';
    const lead = W.test(M.latex[0] || '') && wordL(at) ? ' ' : '', tail = W.test(M.latex[M.latex.length - 1] || '') && wordR(at) ? ' ' : '';
    const before = del.filter((d) => d.e <= at).reduce((n, d) => n + (d.e - d.s) - d.t.length, 0);
    const s = at - before + lead.length;
    this.closeGroup();
    this.commit([...del, { f: M.f, s: at, e: at, t: lead + t + tail }], { f: M.f, p: s + t.length, selA: s, selB: s + t.length }, copy ? 'paste' : 'move');
    this.closeGroup();
    return true;
  },

  // ---- a picture dragged by a press -------------------------------------------------------------
  // What moves with a selected picture: { f, s, e, block } (block: its environment or a paragraph
  // of its own, put between paragraphs; else the picture among words), or { error }
  picMovable() {
    const h = this.picHere && this.picHere();
    if (!h) return null;
    const B = h.P.block;
    if (B.kind === 'sentence') return { f: h.f, s: h.P.outer.s, e: h.P.outer.e, block: false };
    if ((B.kind === 'inline' || B.kind === 'float' || B.kind === 'wrap') && B.env) return { f: h.f, s: B.env.s, e: B.env.e, block: true };
    if (B.kind === 'para') return { f: h.f, s: h.P.outer.s, e: h.P.outer.e, block: true };
    return { error: 'This picture is inside a box or a table: move what holds it.' };
  },
  // The picture moved to the point dropped: among words where it stands among words, else before
  // or after the paragraph under the point (its upper or lower half)
  picMoveTo(x, y) {
    const W = this.picMovable();
    if (!W) return false;
    if (W.error) { this.toast(W.error, 5000); return false; }
    const src = this.src(W.f);
    let at;
    if (!W.block) {
      const p = this.posAtPoint(x, y);
      if (!p) return false;
      if (p.f !== W.f) { this.toast('A picture is moved within one file.'); return false; }
      at = p.p;
      if (at >= W.s && at <= W.e) return false;
      const t = src.slice(W.s, W.e);
      const before = at > W.s ? W.e - W.s : 0, off = Math.max(0, t.search(/\\includegraphics/));
      this.closeGroup();
      this.commit([{ f: W.f, s: W.s, e: W.e, t: '' }, { f: W.f, s: at, e: at, t }], { f: W.f, p: at - before, bias: 1 }, 'move');
      this.closeGroup();
      this.picSelect({ f: W.f, s: at - before + off });
      return true;
    }
    // a block: between paragraphs, at the paragraph under the point
    const hit = document.elementFromPoint(x, y);
    const it = hit && hit.closest ? hit.closest('#pages .it') : null;
    const B = it && BLOCKS.get(+it.dataset.b);
    if (!B || B.f == null) return false;
    if (B.f !== W.f) { this.toast('A picture is moved within one file.'); return false; }
    const r = blockRect(it);
    at = y < r.top + r.height / 2 ? B.s : B.e;
    // what goes: the block, from its line's start to what follows it; a blank line is left where
    // the paragraphs round it would otherwise join
    let ls = W.s;
    while (ls > 0 && (src[ls - 1] === ' ' || src[ls - 1] === '\t')) ls--;
    if (ls > 0 && src[ls - 1] !== '\n') ls = W.s;
    let z = W.e;
    while (z < src.length && /[ \t\r\n]/.test(src[z])) z++;
    // (dropped where it stands, or only blank lines away from it: nothing moves)
    if ((at >= ls && at <= z) || (at < ls && !src.slice(at, ls).trim()) || (at > z && !src.slice(z, at).trim())) return false;
    const nl = /\r\n/.test(src.slice(0, 4000)) ? '\r\n' : '\n';
    // (the words on either side keep what they had: one paragraph round a float in its middle,
    // two where a blank line stood after it)
    const blankBefore = ls === 0 || /\n[ \t]*\r?\n[ \t]*$/.test(src.slice(Math.max(0, ls - 200), ls));
    const blankAfter = /\n[ \t]*\r?\n/.test(src.slice(W.e, z));
    const gap = !blankBefore && blankAfter && z < src.length && !/^\\end\s*\{document\}/.test(src.slice(z, z + 20)) ? nl : '';
    const body = src.slice(W.s, W.e);
    // (put in as a paragraph of its own: a blank line each side)
    let nlB = 0; for (let k = at - 1; k >= 0 && /\s/.test(src[k]); k--) if (src[k] === '\n') nlB++;
    let nlA = 0; for (let k = at; k < src.length && /\s/.test(src[k]); k++) if (src[k] === '\n') nlA++;
    const pre = nl.repeat(Math.max(0, 2 - nlB)), post = nl.repeat(Math.max(0, 2 - nlA));
    const t = pre + body + post;
    const shift = at > ls ? (z - ls) - gap.length : 0;
    this.closeGroup();
    this.commit([{ f: W.f, s: ls, e: z, t: gap }, { f: W.f, s: at, e: at, t }], { f: W.f, p: at - shift + pre.length, bias: 1 }, 'move');
    this.closeGroup();
    // (the picture stays selected where it went)
    const off = body.search(/\\includegraphics/);
    if (off >= 0) this.picSelect({ f: W.f, s: at - shift + pre.length + off });
    return true;
  }
});

onInstall((app) => {
  // A press on the selected picture that moves more than a few pixels drags it: a line shows where
  // it would go; letting go puts it there, Escape gives up. Mouse and finger alike (a selected
  // picture takes the finger: CSS touch-action none on it).
  let D = null;
  const mark = document.createElement('div');
  mark.className = 'move-mark';
  mark.hidden = true;
  mark.setAttribute('aria-hidden', 'true');
  document.body.append(mark);
  const show = (x, y) => {
    const W = app.picMovable();
    if (!W || W.error) { mark.hidden = true; return; }
    if (W.block) {
      const hit = document.elementFromPoint(x, y), it = hit && hit.closest ? hit.closest('#pages .it') : null;
      if (!it) { mark.hidden = true; return; }
      const r = blockRect(it), top = y < r.top + r.height / 2;
      Object.assign(mark.style, { left: r.left + 'px', top: (top ? r.top - 2 : r.bottom) + 'px', width: r.width + 'px', height: '2px' });
    } else {
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
      const b = r && app.root.contains(r.startContainer) ? r.getBoundingClientRect() : null;
      if (!b || !b.height) { mark.hidden = true; return; }
      Object.assign(mark.style, { left: b.left + 'px', top: b.top + 'px', width: '2px', height: b.height + 'px' });
    }
    mark.hidden = false;
  };
  const end = (ev, drop) => {
    const d = D;
    D = null;
    mark.hidden = true;
    document.documentElement.classList.remove('pic-moving');
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('keydown', esc, true);
    if (d && d.moving) { d.el.style.opacity = ''; if (app.picHandles) app.picHandles.soon(); }
    if (d && d.moving && drop) app.picMoveTo(ev.clientX, ev.clientY);
  };
  const move = (ev) => {
    if (!D || ev.pointerId !== D.id) return;
    if (!D.moving && Math.hypot(ev.clientX - D.x, ev.clientY - D.y) < 8) return;
    if (!D.moving) {
      D.moving = true;
      document.documentElement.classList.add('pic-moving');
      D.el.style.opacity = '0.5';
      if (app.picHandles) app.picHandles.hide();
    }
    ev.preventDefault();
    show(ev.clientX, ev.clientY);
  };
  const up = (ev) => { if (D && ev.pointerId === D.id) { if (D.moving) { ev.preventDefault(); ev.stopPropagation(); } end(ev, true); } };
  const cancel = (ev) => end(ev, false);
  const esc = (ev) => { if (ev.key === 'Escape' && D) { ev.preventDefault(); ev.stopPropagation(); end(ev, false); } };
  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    const A = app.armed;
    if (!A || A.kind !== 'img' || !A.el || !A.el.isConnected || !A.el.contains(ev.target) || app.picCropping) return;
    D = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, el: A.el, moving: false };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', esc, true);
  }, true);
  // (a drag that moved selects nothing on its way up: the click after it is the drop's)
  document.addEventListener('click', (ev) => { if (document.documentElement.classList.contains('pic-moving')) { ev.preventDefault(); ev.stopPropagation(); } }, true);
});
