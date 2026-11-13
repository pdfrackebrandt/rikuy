// Small helpers the page's modules share: elements made and found, the settings kept in the
// browser, the time of a version said in words, the signature of a project's text. (They were
// app.js's own until the side panel and the ribbon moved into modules of their own.)

export const $ = (s, r = document) => r.querySelector(s);
export function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
export function mkBtn(label, fn, title, type) { const b = mk('button', 'btn ghost sm', label); b.type = type || 'button'; if (title) b.title = title; if (fn) b.addEventListener('click', fn); return b; }

// Rikuy was called Galley at first; the keys of what a browser keeps keep that name, so
// nobody's documents or settings are lost
export const PREFS = 'galley.prefs.v1';
export function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
export function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

export function textSig(main, files) {
  let h = 0x811c9dc5;
  const add = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } h ^= 0xff; };
  add(main);
  for (const [n, t] of files) { add(n); add(t); }
  return (h >>> 0).toString(36) + ':' + files.reduce((s, x) => s + x[1].length, 0);
}
export function when(t) {
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dd = Math.round((day(now) - day(d)) / 864e5);
  if (dd === 0) return 'today ' + hm;
  if (dd === 1) return 'yesterday ' + hm;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }) + ', ' + hm;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
