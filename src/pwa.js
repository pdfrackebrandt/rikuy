// The installed app: what only the hosted build does (index.html served as a whole page by
// Rikuy's own site). The page registers the service worker (src/sw.js), asks for its files by
// version once that worker controls it, offers a new version when one is ready, says when the
// network is gone, and keeps the TeX files a typical paper needs for working offline.
//
// None of it runs in the copy inside the claude.ai artifact: that build is made with RIKUY_SHARE,
// which compiles this module out (__RIKUY_APP__ false), and a page whose document lacks
// <meta name="rikuy-app"> (rikuy.html, wrapped by a host, as the artifact host and the test
// servers do) never starts it either.

export const APP = { on: false, v: '', tree: '', reg: null, updating: false };

export function appInit() {
  const m = document.querySelector('meta[name="rikuy-app"]');
  if (!m || !/^[0-9a-f]{16}$/.test(m.content)) return APP;
  APP.on = true;
  APP.v = m.content;
  APP.tree = m.dataset.tree || '';
  return APP;
}

// The address of one of the build's own files. Under the service worker the page asks for it
// under _v/<version>/, so it gets its own version's copy even when another tab has already moved
// the worker on to a newer one (src/sw.js keeps the version before); a page no worker controls
// (a first visit, a browser without service workers) asks the server as any page does.
export function asset(p) {
  const pin = APP.on && navigator.serviceWorker && navigator.serviceWorker.controller ? '_v/' + APP.v + '/' : '';
  return new URL(pin + p, location.href).href;
}

// The folders of TeX Live a typical paper reads under pdfLaTeX, beyond the core packs every
// document reads: AMS math and fonts, the tools and graphics bundles, hyperref, geometry, tables,
// captions, lists, natbib and BibTeX's styles, cleveref, microtype, listings, algorithms,
// siunitx, TikZ and pgfplots, Latin Modern, the Times, Helvetica and Courier clones of psnfss,
// rsfs and doublestroke. The worker turns them into the packs that hold them (tex/engine.js,
// keepPlan): 60 packs, about 39 MB, with TeX Live 2026.20260711 as built in version 29. cm-super
// (the T1 fonts a document gets without lmodern, 29 MB more) and biber (15 MB) are left out:
// a document needing them fetches them the first time, online, and keeps them from then on.
export const OFFLINE_FOLDERS = [
  'tex/latex/base', 'tex/latex/amsmath', 'tex/latex/amsfonts', 'tex/latex/amscls', 'tex/latex/tools', 'tex/latex/graphics',
  'tex/latex/graphics-cfg', 'tex/latex/graphics-def', 'tex/latex/xcolor', 'tex/latex/hyperref', 'tex/latex/url', 'tex/latex/geometry',
  'tex/latex/booktabs', 'tex/latex/multirow', 'tex/latex/makecell', 'tex/latex/threeparttable', 'tex/latex/caption', 'tex/latex/float',
  'tex/latex/wrapfig', 'tex/latex/enumitem', 'tex/latex/natbib', 'tex/latex/cleveref', 'tex/latex/setspace', 'tex/latex/fancyhdr',
  'tex/latex/titlesec', 'tex/latex/appendix', 'tex/latex/microtype', 'tex/latex/lm', 'tex/latex/psnfss', 'tex/latex/listings',
  'tex/latex/algorithms', 'tex/latex/algorithmicx', 'tex/latex/siunitx', 'tex/latex/pgf', 'tex/latex/pgfplots', 'tex/latex/mathtools',
  'tex/latex/oberdiek', 'tex/latex/l3kernel', 'tex/latex/l3packages', 'tex/latex/l3backend', 'tex/latex/etoolbox', 'tex/latex/kvoptions',
  'tex/latex/xkeyval', 'tex/latex/preprint', 'tex/latex/jknapltx', 'tex/latex/doublestroke', 'tex/latex/was', 'tex/latex/cancel',
  'tex/latex/units', 'tex/latex/csquotes', 'tex/latex/footmisc', 'tex/latex/subfig', 'tex/latex/comment', 'tex/latex/epstopdf-pkg',
  'tex/generic/pgf', 'tex/generic/pgfplots', 'tex/generic/ulem', 'tex/generic/soul', 'tex/generic/babel', 'tex/generic/babel-english',
  'tex/generic/iftex',
  'fonts/type1/public/amsfonts', 'fonts/type1/public/lm', 'fonts/type1/public/rsfs', 'fonts/type1/public/doublestroke',
  'fonts/type1/urw/times', 'fonts/type1/urw/helvetic', 'fonts/type1/urw/courier', 'fonts/type1/urw/symbol', 'fonts/type1/urw/zapfding',
  'fonts/tfm/public/amsfonts', 'fonts/tfm/public/cm', 'fonts/tfm/public/lm', 'fonts/tfm/public/rsfs', 'fonts/tfm/public/doublestroke',
  'fonts/tfm/adobe/times', 'fonts/tfm/adobe/helvetic', 'fonts/tfm/adobe/courier', 'fonts/tfm/adobe/symbol', 'fonts/tfm/adobe/zapfding',
  'fonts/vf/adobe/times', 'fonts/vf/adobe/helvetic', 'fonts/vf/adobe/courier', 'fonts/tfm/jknappen/ec',
  'fonts/enc/dvips/lm', 'fonts/enc/dvips/base', 'bibtex/bst/base', 'bibtex/bst/natbib'
];

const $ = (s) => document.querySelector(s);
const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';

// Registers the service worker and wires the status bar: the offline mark, "Update ready" and
// "Make available offline". `app` is the editor (src/app.js).
export function registerApp(app) {
  const net = $('#st-net'), upd = $('#st-update'), keep = $('#b-offline');
  if (keep) {
    keep.hidden = false;
    if (APP.tree && app.prefs.offlineTree === APP.tree) keep.textContent = 'Available offline';
    keep.addEventListener('click', () => keepOffline(app));
  }
  const showNet = () => { if (net) net.hidden = navigator.onLine !== false; };
  window.addEventListener('online', () => { showNet(); if (APP.reg) APP.reg.update().catch(() => {}); });
  window.addEventListener('offline', showNet);
  showNet();
  const sw = navigator.serviceWorker;
  // a page inside a frame, or not on https (or localhost), gets no worker: browsers refuse it there
  if (!sw || !window.isSecureContext || window.top !== window) return;
  // a new version took over (this tab's button, or another tab's): this tab reloads only if it
  // asked; otherwise it offers to, as it runs the older version until then
  sw.addEventListener('controllerchange', () => {
    if (APP.updating) { location.reload(); return; }
    if (!upd || !APP.reg || !APP.reg.active) return;
    upd.textContent = 'Updated in another window: reload';
    upd.title = 'Rikuy was updated in another window. This tab goes on with the version it opened with until you reload it; your work is kept either way.';
    upd.dataset.reload = '1';
    upd.hidden = false;
  });
  if (upd) upd.addEventListener('click', () => {
    app.leaving();
    if (upd.dataset.reload) { location.reload(); return; }
    const w = APP.reg && APP.reg.waiting;
    if (!w) { location.reload(); return; }
    APP.updating = true;
    w.postMessage({ rikuy: 'activate' });
  });
  const ready = () => {
    if (!upd || !APP.reg || !APP.reg.waiting || !sw.controller) return;
    upd.textContent = 'Update ready';
    upd.title = 'A new version of Rikuy is ready. Click to restart with it; your work is saved first. Otherwise it starts the next time you open Rikuy.';
    delete upd.dataset.reload;
    upd.hidden = false;
  };
  sw.register(new URL('sw.js', location.href).href, { scope: './', updateViaCache: 'none' }).then((reg) => {
    APP.reg = reg;
    // a version installing now may have begun before this page listened (the browser looks for
    // one on every navigation): follow it as well as any found later
    const watch = (w) => { if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') ready(); }); };
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    ready();
    // every open looks for a new version; it installs in the background and waits
    if (navigator.onLine !== false) reg.update().then(() => { watch(reg.installing); ready(); }).catch(() => {});
    // look for a new version now and then while the page is open and in view
    setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false) reg.update().catch(() => {}); }, 3600e3);
  }).catch(() => { /* no offline copy; the page works as before */ });
}

// "Make available offline": the engine, the core packs and the packs of OFFLINE_FOLDERS, kept by
// the TeX worker in its IndexedDB cache (tex/engine.js, keep). Packs this browser already keeps
// (everything any document compiled here read) are not fetched again.
export async function keepOffline(app) {
  const keep = $('#b-offline');
  if (!keep || keep.disabled) return;
  if (navigator.onLine === false) { app.toast('Connect to the network once to make Rikuy available offline.', 6000); return; }
  keep.disabled = true;
  const label = keep.textContent;
  try {
    // ask the browser not to clear what Rikuy keeps when space runs short (granted to installed
    // apps and sites people use; refused quietly elsewhere)
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    keep.textContent = 'Starting TeX…';
    const tex = app.texEngine();
    const res = await tex.keep(OFFLINE_FOLDERS, (s) => { keep.textContent = 'Keeping for offline: ' + mb(s.got) + ' of ' + mb(s.total); });
    if (APP.tree) { app.prefs.offlineTree = APP.tree; app.savePrefs(); }
    keep.textContent = 'Available offline';
    app.toast(res.fetched ? 'Rikuy now works offline: the TeX engine and the packages of a typical paper (' + mb(res.total) + ') are kept in this browser.' : 'Rikuy already works offline here: everything a typical paper needs (' + mb(res.total) + ') is kept in this browser.', 9000);
  } catch (e) {
    keep.textContent = label;
    app.toast('Could not keep everything for offline use: ' + e.message, 9000);
  } finally { keep.disabled = false; }
}
