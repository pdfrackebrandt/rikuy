// The installed app's part of the build: what only the hosted build has (Rikuy on its own site,
// dist/index.html served as a whole page). build.mjs calls it; RIKUY_SHARE (the copy inside the
// claude.ai artifact, whose host refuses service workers and installation) builds none of it.
//
//   appPage(html)    dist/index.html: the page with the app's head (version, manifest, icons) and
//                    KaTeX from lib/ instead of jsDelivr
//   appFiles(OUT)    lib/ (KaTeX, mhchem, CodeMirror, JSZip, MathLive: the npm files the page
//                    otherwise takes from jsDelivr, each checked against the hash the page pins),
//                    icons/, manifest.webmanifest
//   finishApp(OUT)   the version (a hash over every file but the content addressed packs),
//                    stamped into index.html, and sw.js with the list of files and their hashes
//   cleanApp(OUT)    takes those files out again, for a build of the artifact into a used dist/
//
// Usage on its own: node build/app.mjs DIR   (stamps DIR again after its files changed; tests)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const R = (p) => path.join(root, p);
const sha = (b, alg = 'sha256') => crypto.createHash(alg).update(b).digest('hex');

// the colours of the interface (src/app.css): the bar, the desk behind the pages, the ink
const THEME = { light: '#F5F7F9', dark: '#1B222A', background: '#DCE1E7' };
const DESCRIPTION = 'A LaTeX editor where you type on the typeset page. TeX Live 2026 runs in the browser; nothing is uploaded.';
const ZERO = '0000000000000000';
const META = /(<meta name="rikuy-app" content=")([0-9a-f]{16})(")/;

// The libraries the page loads from jsDelivr (the CDN map in src/app.js, KaTeX's tag in
// src/template.html), as npm installed them: the same files, which the page checks by the same
// integrity hashes.
function libs() {
  const src = fs.readFileSync(R('src/app.js'), 'utf8') + fs.readFileSync(R('src/template.html'), 'utf8');
  const urls = [...new Set(src.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^'"\s]+\.js/g))];
  return urls.map((url) => {
    const [, pkg, ver, file] = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/.exec(url);
    const dir = R('node_modules/' + pkg);
    const have = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    if (have !== ver) throw new Error(url + ': npm has ' + pkg + ' ' + have + ', the page pins ' + ver);
    const bytes = fs.readFileSync(path.join(dir, file));
    const sri = 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64');
    if (!src.includes(sri)) throw new Error(url + ': the npm file is not the one whose hash the page pins');
    return { url, bytes, name: path.basename(file) };
  });
}

function treeVersion(OUT) {
  // the TeX tree's own version (its index's v), so "Available offline" knows which tree it kept
  try {
    const b = fs.readFileSync(path.join(OUT, 'tex/tree.wasm'));
    let i = 9;
    const leb = () => { let n = 0, s = 0, x; do { x = b[i++]; n += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return n; };
    leb(); i += leb();
    return JSON.parse(zlib.gunzipSync(b.subarray(i))).v || '';
  } catch (e) { return ''; }
}

export function appPage(OUT, html, skeleton) {
  const tree = treeVersion(OUT);
  const head = '<meta name="rikuy-app" content="' + ZERO + '"' + (/^[0-9a-f]{16}$/.test(tree) ? ' data-tree="' + tree + '"' : '') + '>'
    + '<meta name="description" content="' + DESCRIPTION + '">'
    + '<meta name="theme-color" content="' + THEME.light + '" media="(prefers-color-scheme: light)">'
    + '<meta name="theme-color" content="' + THEME.dark + '" media="(prefers-color-scheme: dark)">'
    + '<link rel="manifest" href="manifest.webmanifest">'
    + '<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">'
    + '<link rel="icon" href="icons/icon-192.png" sizes="192x192" type="image/png">'
    + '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">';
  if (!skeleton.includes('<meta charset=utf8>')) throw new Error('build.mjs SKELETON changed: no <meta charset=utf8> to put the app head after');
  let page = html;
  for (const l of libs()) page = page.split('src="' + l.url + '"').join('src="lib/' + l.name + '"');
  if (/<script src="https:/.test(page)) throw new Error('index.html still loads a script from a CDN');
  return skeleton.replace('<meta charset=utf8>', '<meta charset=utf8>' + head) + page + '</body></html>';
}

export function manifest() {
  return {
    name: 'Rikuy',
    short_name: 'Rikuy',
    description: DESCRIPTION,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: THEME.background,
    theme_color: THEME.light,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}

export function appFiles(OUT) {
  const O = (p) => path.join(OUT, p);
  fs.rmSync(O('lib'), { recursive: true, force: true });
  fs.mkdirSync(O('lib'), { recursive: true });
  for (const l of libs()) fs.writeFileSync(O('lib/' + l.name), l.bytes);
  fs.rmSync(O('icons'), { recursive: true, force: true });
  fs.mkdirSync(O('icons'), { recursive: true });
  for (const f of fs.readdirSync(R('build/icons')).filter((n) => n.endsWith('.png'))) fs.copyFileSync(R('build/icons/' + f), O('icons/' + f));
  fs.writeFileSync(O('manifest.webmanifest'), JSON.stringify(manifest(), null, 1) + '\n');
}

export function cleanApp(OUT) {
  for (const p of ['lib', 'icons', 'manifest.webmanifest', 'sw.js']) fs.rmSync(path.join(OUT, p), { recursive: true, force: true });
}

function walk(dir, pre = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = pre + e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel + '/'));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

// What the service worker keeps (src/sw.js), and how:
//   TeX packs (tex/[pbtwm]-<hash>.wasm) and a mirror (mirror/): not at all; the TeX worker keeps
//     packs in IndexedDB by their hash
//   files named <name>-<16 hex digits>.<ext> elsewhere, whose SHA-256 begins with those digits:
//     content addressed, kept across versions (kind i)
//   everything else the page or the worker loads: bound to the version, kept at install (p) up
//     to 4 MiB, larger ones when first used (l)
//   rikuy.html, LICENSES.txt, 404.html, _headers: in the version, but not served by the worker
const PACK = /^tex\/[pbtwm]-[0-9a-f]{16}\.wasm$/;
const ADDRESSED = /-([0-9a-f]{16})\.[A-Za-z0-9]+$/;
const NOT_SERVED = new Set(['rikuy.html', 'LICENSES.txt', '404.html', '_headers', '_redirects']);
const PRECACHE_MAX = 4 * 1024 * 1024;

export function finishApp(OUT) {
  const index = path.join(OUT, 'index.html');
  const page = fs.readFileSync(index, 'utf8');
  if (!META.test(page)) throw new Error(index + ': no <meta name="rikuy-app">; build it with build.mjs first');
  const normal = page.replace(META, '$1' + ZERO + '$3');
  const files = {};
  const lines = [];
  for (const rel of walk(OUT).sort()) {
    if (rel === 'sw.js' || rel.startsWith('mirror/') || PACK.test(rel)) continue;
    const buf = rel === 'index.html' ? Buffer.from(normal) : fs.readFileSync(path.join(OUT, rel));
    const h = sha(buf);
    lines.push(rel + ' ' + h);
    if (rel === 'index.html' || NOT_SERVED.has(rel)) continue;
    // a name whose digits are not the start of the file's own SHA-256 (a hash of something else,
    // such as what the file wraps) is treated as bound to the version: never kept as immutable
    const ca = ADDRESSED.exec(path.basename(rel));
    files[rel] = [h, buf.length, ca && h.startsWith(ca[1]) ? 'i' : buf.length <= PRECACHE_MAX ? 'p' : 'l'];
  }
  const v = sha(lines.join('\n')).slice(0, 16);
  const stamped = normal.replace(META, '$1' + v + '$3');
  fs.writeFileSync(index, stamped);
  files[''] = ['', Buffer.byteLength(stamped), 'p'];
  const sw = '// Rikuy\'s service worker, written by build/app.mjs from src/sw.js: version ' + v + '.\n'
    + 'const RIKUY = ' + JSON.stringify({ v, files }) + ';\n' + fs.readFileSync(R('src/sw.js'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'sw.js'), sw);
  return { v, files: Object.keys(files).length, precache: Object.values(files).filter((f) => f[2] === 'p').reduce((s, f) => s + f[1], 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node build/app.mjs DIR'); process.exit(2); }
  const r = finishApp(path.resolve(dir));
  console.log(path.resolve(dir), 'version', r.v, r.files, 'files served by the service worker,', (r.precache / 1048576).toFixed(1), 'MB kept at install');
}
