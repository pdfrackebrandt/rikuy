// The page's marks drawn as CSS highlights (spelling, grammar, Find's hits), limited to what is
// near the view.
//
// While a highlight holds ranges, Chromium works its marks out again after every change of the
// page (a keystroke, a class on a ribbon button) and paints again each text node a range is in,
// wherever it is: with dev/bench/long's 158 misspelt words spread over its 41 pages, a one letter
// change cost 4 to 5 ms of paint preparation and 3 ms of paint per frame against under 1 ms with
// no highlight. A mark nobody sees draws nothing, so a highlight holds only the ranges in the
// page's items (its paragraphs, headings, floats, and the footnotes) within a screen of the view,
// an IntersectionObserver on them with a screen's margin on every side, and takes the others as
// they come near. Items, not pages: Web Layout and a phone's Mobile View are one long sheet. An
// item the observer has not answered for yet (one just drawn) counts as near. A set whose ranges
// are those already shown is not written again (writing one starts the same work over).
//
// The whole list stays the app's (S.bad, fs.hits, G.bad): only what the page draws is limited.

const sets = new Map(); // name -> the ranges asked for, all of them
let near = new WeakMap(); // an item -> whether it is within a screen of the view, as last said
let io = null, root = null, watched = new Set();

const ITEMS = '.it, .fn';
const itemOf = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.closest(ITEMS) : null; };
const isNear = (el) => !!el && el.isConnected && near.get(el) !== false;

function watch(app) {
  if (typeof IntersectionObserver !== 'function' || !app.desk || !app.root) return null;
  if (!io || root !== app.desk) {
    if (io) io.disconnect();
    near = new WeakMap(); watched = new Set();
    root = app.desk;
    io = new IntersectionObserver((es) => {
      let moved = false;
      for (const e of es) if (near.get(e.target) !== e.isIntersecting) { near.set(e.target, e.isIntersecting); moved = true; }
      if (moved) for (const n of sets.keys()) draw(n);
    }, { root: app.desk, rootMargin: '100% 100% 100% 100%' });
  }
  // (the items drawn since watched; those gone from the page let go)
  for (const el of watched) if (!el.isConnected) { io.unobserve(el); watched.delete(el); }
  for (const el of app.root.querySelectorAll(ITEMS)) if (!watched.has(el)) { watched.add(el); io.observe(el); }
  return io;
}

// whether the ranges a highlight holds are these, in this order
function same(h, rs) {
  if (!h || h.size !== rs.length) return false;
  let k = 0;
  for (const r of h) {
    const x = rs[k++];
    if (r !== x && (r.startContainer !== x.startContainer || r.startOffset !== x.startOffset || r.endContainer !== x.endContainer || r.endOffset !== x.endOffset)) return false;
  }
  return true;
}

function draw(name) {
  const HL = window.CSS && CSS.highlights;
  if (!HL || !window.Highlight) return;
  const all = sets.get(name);
  if (!all || !all.length) { if (HL.has(name)) HL.delete(name); return; }
  // (where there is no observer, every range: as before)
  const rs = io ? all.filter((r) => isNear(itemOf(r.startContainer)) || isNear(itemOf(r.endContainer))) : all;
  if (!rs.length) { if (HL.has(name)) HL.delete(name); return; }
  if (same(HL.get(name), rs)) return;
  HL.set(name, new window.Highlight(...rs));
}

// The highlight name shows these ranges where they are near the view (none: it goes)
export function setMarks(app, name, ranges) {
  if (ranges && ranges.length) sets.set(name, ranges); else sets.delete(name);
  watch(app);
  draw(name);
  if (!ranges || !ranges.length) { const HL = window.CSS && CSS.highlights; if (HL && HL.has(name)) HL.delete(name); }
}
