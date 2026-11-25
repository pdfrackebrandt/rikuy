// The page's marks drawn as CSS highlights (spelling, grammar, Find's hits), limited to the pages
// near the view.
//
// While a highlight holds ranges, Chromium works out its marks again after every change of the
// page (a keystroke, a class on a ribbon button) and paints again each text node a range is in,
// wherever it is: with dev/bench/long's 158 misspelt words spread over its 41 pages, a one letter
// change cost 4 to 5 ms of paint preparation and 3 ms of paint per frame against under 1 ms with
// no highlight. A mark on a page nobody sees draws nothing, so a highlight holds only the ranges
// on the pages within a screen of the view (an IntersectionObserver on the pages, with a screen's
// margin above and below), and takes the others as they come near. A set whose ranges are those
// already shown is not written again (writing one starts the same work over).
//
// The whole list stays the app's (S.bad, fs.hits, G.bad): only what the page draws is limited.

const sets = new Map(); // name -> the ranges asked for, all of them
const near = new Set(); // the pages within a screen of the view
let io = null, root = null, known = false, observed = new WeakSet();

// the pages near the view, as the observer last said
function watch(app) {
  if (typeof IntersectionObserver !== 'function' || !app.desk || !app.root) return null;
  if (!io || root !== app.desk) {
    if (io) io.disconnect();
    near.clear(); known = false; observed = new WeakSet();
    root = app.desk;
    io = new IntersectionObserver((es) => {
      let moved = false;
      for (const e of es) {
        if (e.isIntersecting) { if (!near.has(e.target)) { near.add(e.target); moved = true; } } else if (near.delete(e.target)) moved = true;
      }
      const first = !known;
      known = true;
      if (moved || first) for (const n of sets.keys()) draw(n);
    }, { root: app.desk, rootMargin: '100% 100% 100% 100%' });
  }
  for (const pg of app.root.children) if (pg.classList.contains('page') && !observed.has(pg)) { observed.add(pg); io.observe(pg); }
  for (const pg of [...near]) if (!pg.isConnected) { near.delete(pg); io.unobserve(pg); }
  return io;
}

const pageOf = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.closest('.page') : null; };
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
  // (before the observer's first answer, and where there is none, every range: as before)
  const rs = io && known ? all.filter((r) => near.has(pageOf(r.startContainer)) || near.has(pageOf(r.endContainer))) : all;
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
