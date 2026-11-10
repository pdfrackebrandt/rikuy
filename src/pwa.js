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
  // (the first worker claiming a page that had none is not an update: nothing to say)
  let had = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!had) { had = true; return; }
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
    // The waiting version takes over once the one in charge has nothing left to do. Asked while
    // another window is still loading through it, Chromium can miss that moment (1 click in 3
    // made within a second of opening a second tab; none when that tab had been open for 3 s) and
    // then waits until the old version has been idle for minutes or its windows are closed.
    // Asking again, or a message through the old version, changes nothing, so the button says
    // what it waits for; controllerchange reloads the page whenever the new one takes over.
    upd.textContent = 'Updating…';
    setTimeout(() => {
      if (!APP.reg || !APP.reg.waiting) return;
      upd.textContent = 'Updating: waiting for other Rikuy windows';
      upd.title = 'The new version starts as soon as the other windows of Rikuy are idle or closed. Your work is saved; you can keep typing.';
    }, 4000);
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

// Files the system hands the installed app: opening a .tex, .bib or .zip with Rikuy (manifest
// file_handlers, Chromium on the desktop) queues their handles in launchQueue. They open exactly
// as the Open button opens files (app.openFiles); a .tex or .bib the user opened from their own
// disk is their own, as with the Open button. Called once the project in this browser is loaded.
export function takeLaunches(app) {
  if (!('launchQueue' in window) || !window.launchQueue || typeof window.launchQueue.setConsumer !== 'function') return;
  window.launchQueue.setConsumer(async (params) => {
    const files = [];
    for (const h of (params && params.files) || []) {
      if (!h || h.kind !== 'file' || typeof h.getFile !== 'function') continue;
      try { files.push(await h.getFile()); } catch (e) { /* gone or refused: skip it */ }
    }
    if (files.length) await app.openFiles(files);
  });
}

// Files shared to the installed app (manifest share_target): src/sw.js keeps the post under an
// id and opens ./?share-target=<id>. Any web page can post a form there as well, so nothing opens
// without the user's click, and then as a link from someone else opens: shell escape restricted
// until the owner allows it, and never over a file of the project open now (app.openFiles).
export async function takeShared(app) {
  let id = null;
  try { id = new URLSearchParams(location.search).get('share-target'); } catch (e) { return; }
  if (!id) return;
  try { history.replaceState(null, '', location.href.replace(/[?&]share-target=[^&#]*/, '').replace(/\?$/, '').replace(/\?#/, '#')); } catch (e) { /* framed */ }
  if (!/^\d+-[0-9a-f-]{36}$/.test(id) || !window.caches) return;
  const c = await caches.open('rikuy-share');
  const pre = new URL('_share/' + id + '/', location.href).href;
  const files = [];
  for (const r of await c.keys()) {
    if (!r.url.startsWith(pre)) continue;
    const res = await c.match(r);
    await c.delete(r);
    if (!res) continue;
    let name = 'shared.tex';
    try { name = decodeURIComponent(res.headers.get('X-Rikuy-Name') || name); } catch (e) { /* keep the default */ }
    files.push([+r.url.slice(pre.length), new File([await res.blob()], name.replace(/[\\/]/g, '_'))]);
  }
  files.sort((a, b) => a[0] - b[0]);
  if (!files.length) return;
  const list = files.map((x) => x[1]);
  const names = list.map((f) => f.name);
  app.toast('Shared to Rikuy: ' + names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '') + '.', 60000, { label: 'Open', fn: () => app.openFiles(list, 'share') });
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
    // Word too (pandoc, 16 MB, kept by its own worker), where this build has it
    keep.textContent = 'Keeping Word support…';
    const wordKept = await app.keepWord();
    if (APP.tree) { app.prefs.offlineTree = APP.tree; app.savePrefs(); }
    keep.textContent = 'Available offline';
    const also = wordKept ? ', and Word import and export' : '';
    app.toast(res.fetched ? 'Rikuy now works offline: the TeX engine and the packages of a typical paper (' + mb(res.total) + ')' + also + ' are kept in this browser.' : 'Rikuy already works offline here: everything a typical paper needs (' + mb(res.total) + ')' + also + ' is kept in this browser.', 9000);
  } catch (e) {
    keep.textContent = label;
    app.toast('Could not keep everything for offline use: ' + e.message, 9000);
  } finally { keep.disabled = false; }
}
