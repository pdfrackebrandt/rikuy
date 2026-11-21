// Word's animated caret: on the typeset page the caret glides to its new place (100 ms, easing
// both ways) as Word 365's does, as a key moves it or a click puts it elsewhere in view; a jump
// out of view is a jump. As a character is typed or deleted it moves at once: a glide then cost
// each key a frame of Chromium's Event Timing (dev/bench/sample, 240 keys: a median of 32 ms
// gliding against 24 with the caret jumping or off), what INP takes, for a move of one letter. File › Options › Animated caret turns it off
// (src/cmd/motion.js); so do Animations off, the system's reduced motion and forced colours, where
// the browser's own caret is the right one.
//
// The browser's caret stays where it is, made transparent (html[data-caret="custom"],
// src/motion.css), and an element in the desk's scrolling area draws one in its place: it scrolls
// with the pages for nothing, and moves by transform alone. Its place is read once a frame, just
// after the frame that shows the edit is painted, so the layout it reads is done already and the
// keystroke's own frame is not held up by it. Where no place can be read (a caret between two
// boxes with no text), the browser's caret shows instead, and while an input method composes, as
// its text is its own.
//
// Nothing of it may make typing slower (rule P7). Measured on dev/bench/long (dev/bench_typing.py):
// an animation running while the next key comes, on a page whose main thread is already full,
// delayed that key's paint by some milliseconds (the browser gives an animating page's frames
// their turn first). So the blink is a timer, as the browser's own caret's is (530 ms on, 530 off,
// held on while the caret moves), not an animation that runs for ever; and the glide steps aside
// while the page is slow: where keys take more than 40 ms to show (a long document on a slow
// machine, where a glide of 100 ms would show as two or three jerks anyway), the caret jumps, as
// the browser's does, until keys show quickly again.

import { motionMode, motionSettings, onMotion, tokens, timed } from './motion.js';

export function installCaret(app) {
  const pages = document.getElementById('pages'), desk = document.getElementById('desk');
  if (!pages || !desk || typeof matchMedia !== 'function') return null;
  const fc = matchMedia('(forced-colors: active)');
  const root = document.documentElement;
  let el = null, raf = 0, shown = false, last = null, h0 = 0, composing = false, blinkT = 0, lit = true;
  // a key's time to its paint, smoothed; the key not yet seen painted
  let keyAt = 0, lag = 0;
  const stats = { glides: 0, jumps: 0, slow: 0, typed: 0 };
  // (when a key last changed the text: the move it makes is a jump)
  let typedAt = -1e9;
  // (ms: a key that took longer to show stops the glide; test/motion.py moves it to test both ways)
  const ctl = { slow: 40 };
  const wanted = () => motionMode() === 'full' && motionSettings().caret && !fc.matches;

  function make() {
    el = document.createElement('div');
    el.className = 'rk-caret';
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    desk.append(el);
  }
  // on, then off after half the blink's time, on again...
  function blink(restart) {
    clearTimeout(blinkT); blinkT = 0;
    if (!el || el.hidden) return;
    if (restart || !lit) { lit = true; el.style.opacity = ''; }
    const half = tokens().blink / 2;
    const tick = () => { if (!el || el.hidden) { blinkT = 0; return; } lit = !lit; el.style.opacity = lit ? '' : '0'; blinkT = setTimeout(tick, half); };
    blinkT = setTimeout(tick, half);
  }
  // neither caret: a selection
  function none() {
    if (el && !el.hidden) el.hidden = true;
    clearTimeout(blinkT); blinkT = 0;
    shown = false;
  }
  // the browser's caret back, ours hidden
  function native() {
    if (root.dataset.caret) delete root.dataset.caret;
    none();
  }

  // the caret's box on the screen: a collapsed range's own rect (Chromium, Firefox and Safari
  // give one inside text), else the edge of the character beside it
  function caretRect(r) {
    const q = r.getClientRects();
    if (q.length && q[q.length - 1].height > 0) { const b = q[q.length - 1]; return { x: b.left, y: b.top, h: b.height }; }
    const n = r.startContainer, o = r.startOffset;
    if (n.nodeType !== 3) return null;
    const p = document.createRange();
    if (o < n.length) { p.setStart(n, o); p.setEnd(n, o + 1); const b = p.getClientRects()[0]; if (b && b.height) return { x: b.left, y: b.top, h: b.height }; }
    if (o > 0) { p.setStart(n, o - 1); p.setEnd(n, o); const bs = p.getClientRects(), b = bs[bs.length - 1]; if (b && b.height) return { x: b.right, y: b.top, h: b.height }; }
    return null;
  }

  const update = timed(() => {
    raf = 0;
    // (how long the last key took to show, now that it has)
    if (keyAt) { const d = performance.now() - keyAt; keyAt = 0; if (d < 1000) lag = lag ? lag * 0.5 + d * 0.5 : d; }
    if (!wanted()) { native(); return; }
    const sel = getSelection();
    if (composing || document.activeElement !== pages || !sel.rangeCount) { native(); return; }
    const r = sel.getRangeAt(0);
    if (!pages.contains(r.startContainer)) { native(); return; }
    if (!sel.isCollapsed) { if (root.dataset.caret !== 'custom') root.dataset.caret = 'custom'; none(); return; }
    const c = caretRect(r);
    if (!c) { native(); return; }
    if (!el) make();
    const d = desk.getBoundingClientRect();
    const x = Math.round((c.x - d.left + desk.scrollLeft - desk.clientLeft) * 2) / 2;
    const y = Math.round((c.y - d.top + desk.scrollTop - desk.clientTop) * 2) / 2;
    const h = Math.round(c.h * 2) / 2;
    // (a glide only where both places are in view and the page keeps up; a move out of view, the
    // first showing, or a slow page jumps)
    const top = desk.scrollTop, bottom = top + desk.clientHeight;
    const seen = (yy) => yy + h > top && yy < bottom;
    const moved = !last || last.x !== x || last.y !== y;
    const slow = lag > ctl.slow, typed = performance.now() - typedAt < 250;
    const glide = shown && last && seen(last.y) && seen(y) && !slow && !typed;
    if (moved) { if (glide) stats.glides++; else { stats.jumps++; if (slow) stats.slow++; else if (typed) stats.typed++; } }
    el.classList.toggle('rk-jump', !glide);
    if (h !== h0) { el.style.height = h + 'px'; h0 = h; }
    if (moved) el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    el.classList.toggle('rk-tex', !!(n && n.closest('.it.tex')));
    if (root.dataset.caret !== 'custom') root.dataset.caret = 'custom';
    const was = el.hidden;
    if (was) el.hidden = false;
    // (held on while it moves, as a caret being typed with is)
    if (moved || was) blink(true);
    shown = true;
    last = { x, y };
  });
  // (read after the frame that shows the edit is painted, in a task of its own)
  const after = new MessageChannel();
  after.port1.onmessage = update;
  const soon = () => { if (!raf) raf = requestAnimationFrame(() => after.port2.postMessage(0)); };

  document.addEventListener('selectionchange', soon);
  pages.addEventListener('keydown', (e) => {
    if (!keyAt && !/^(Shift|Control|Alt|Meta|CapsLock)$/.test(e.key)) keyAt = e.timeStamp || performance.now();
    if ((e.key.length === 1 && !e.ctrlKey && !e.metaKey) || /^(Backspace|Delete|Enter|Tab)$/.test(e.key)) typedAt = performance.now();
  }, true);
  pages.addEventListener('focus', soon);
  pages.addEventListener('blur', soon);
  pages.addEventListener('input', soon);
  pages.addEventListener('compositionstart', () => { composing = true; native(); });
  pages.addEventListener('compositionend', () => { composing = false; soon(); });
  addEventListener('resize', soon);
  // (the page laid out again: zoom, a pane opened beside it, fonts come)
  if (typeof ResizeObserver === 'function') new ResizeObserver(soon).observe(pages);
  fc.addEventListener('change', soon);
  onMotion(() => { last = null; soon(); });
  soon();
  ctl.update = update;
  ctl.stats = stats;
  return Object.defineProperties(ctl, { el: { get: () => el }, lag: { get: () => lag } });
}
