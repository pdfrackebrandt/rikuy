// Project storage in this browser (IndexedDB, so images and large projects fit), plus the
// byte-level bookkeeping that lets an untouched file leave Rikuy exactly as it came in.

const DB = 'galley'; // Rikuy's first name, kept so documents already in a browser stay found
const VERSION = 2;
let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('snaps')) d.createObjectStore('snaps', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('vtext')) d.createObjectStore('vtext');
    };
    req.onsuccess = () => {
      const d = req.result;
      // a newer Rikuy in another tab needs to upgrade: step aside instead of blocking it
      d.onversionchange = () => { d.close(); dbp = null; };
      resolve(d);
    };
    req.onerror = () => reject(req.error);
    // an older tab is still open: wait a little for it to step aside, then do without
    req.onblocked = () => setTimeout(() => reject(new Error('blocked')), 4000);
  }).catch((e) => { dbp = null; throw e; });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

export const kvGet = (k) => tx('kv', 'readonly', (s) => s.get(k));
export const kvPut = (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k));
export const kvDel = (k) => tx('kv', 'readwrite', (s) => s.delete(k));
// Write v under k and hand back what was there, in one transaction: both requests go out at
// once, so a write made as the page closes is not left waiting on a read first.
export function kvSwap(k, v) {
  let was;
  return tx('kv', 'readwrite', (s) => { const g = s.get(k); g.onsuccess = () => { was = g.result; }; s.put(v, k); }).then(() => was);
}

// Versions. The list ('snaps') holds { id, t, label, named, name, main, sig } so it loads
// fast; each version's text, [[name, text], ...], sits under the same id in 'vtext'.
// Images and other binary files are shared by all versions.
export function snapAdd(v) {
  const { files, ...meta } = v;
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(['snaps', 'vtext'], 'readwrite');
    const r = t.objectStore('snaps').add(meta);
    r.onsuccess = () => t.objectStore('vtext').put(files, r.result);
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}
export const snapAll = () => tx('snaps', 'readonly', (s) => s.getAll());
export const snapFiles = (id) => tx('vtext', 'readonly', (s) => s.get(id));
export function snapDel(id) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(['snaps', 'vtext'], 'readwrite');
    t.objectStore('snaps').delete(id);
    t.objectStore('vtext').delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  }));
}
export async function snapPrune(keep) {
  const all = await snapAll();
  if (all.length <= keep) return 0;
  // keep versions the user named and the newest version of every project (once another project
  // is opened, its versions are all that is left of it); drop the oldest automatic ones
  const newest = new Map();
  for (const x of all) { const k = x.name + '|' + x.main; if (!newest.has(k) || newest.get(k).t < x.t) newest.set(k, x); }
  const last = new Set([...newest.values()].map((x) => x.id));
  const auto = all.filter((x) => !x.named && !last.has(x.id)).sort((a, b) => a.t - b.t);
  const drop = auto.slice(0, all.length - keep);
  for (const x of drop) await snapDel(x.id);
  return drop.length;
}

// ---- encodings ---------------------------------------------------------------------
// Decode bytes the way TeX files are usually written: UTF-8 if valid, else Latin-1.
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const bom = u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? u8.subarray(3) : u8);
    return { text, enc: 'utf-8', bom };
  } catch (e) {
    let text = '';
    for (let i = 0; i < u8.length; i++) text += String.fromCharCode(u8[i]);
    return { text, enc: 'latin1', bom: false };
  }
}
export function encodeText(text, enc, bom) {
  if (enc === 'latin1' && !/[^\u0000-ÿ]/.test(text)) {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
    return out;
  }
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xEF, 0xBB, 0xBF]);
  out.set(body, 3);
  return out;
}
