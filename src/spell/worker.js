// The spell worker: Hunspell (tex/build_tools.sh hunspell, tex/native/spell/spell.cc) off the
// page's thread. build.mjs writes it as one classic script, Emscripten's glue (RikuyHunspell)
// followed by this file. Every file it fetches (the module, each .aff and .dic) must have the
// SHA-256 the page's bundle names, or nothing of it is used. A dictionary is read when a word in
// its language first comes, and kept while the worker lives.
//
// Messages: {id, op, ...} in, {id, result} or {id, error} out.
//   init    {base, spec}           where the files are and what they are (__RIKUY_SPELL__)
//   check   {dict, words}          the words' answers as one string, '1' known and '0' not
//   suggest {dict, word}           Hunspell's suggestions, at most 8
//   synonyms {dict, thes, word}    MyThes's entry for the word, or for the stem Hunspell finds of
//                                  it in dict: {head, meanings: [{pos, terms}]}
// The words come from a stranger's document: each is bounded (64 characters, no line end) and a
// list at most 200,000 words; a longer word is answered as known, never asked.
//
// A thesaurus is its index (read whole by MyThes, 0.4 to 3 MB) and its data in pieces of at most
// 1 MiB (spec.thes[name].dat, each with its SHA-256). MyThes reads the data through a device of
// Emscripten's file system that serves the pieces fetched so far; a lookup that reads into a
// piece not yet here notes it and finds nothing, the worker fetches and checks that piece, and
// asks again (at most four times: an entry spans two pieces at most).
/* global RikuyHunspell */

const MAX_WORD = 64, MAX_LIST = 200000, MAX_SUGGEST = 40;
let base = '', spec = null, M = null, starting = null;
const open = new Map();   // dict -> slot, or a promise while it opens
const thesOpen = new Map();   // thesaurus -> {slot, T}, or a promise while it opens
let devN = 0;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function get(file) {
  const r = await fetch(new URL(file.name, base).href, { credentials: 'same-origin' });
  if (!r.ok) throw new Error('could not fetch ' + file.name + ' (' + r.status + ')');
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== file.sha256) throw new Error(file.name + ' is not the file this page was built with');
  return bytes;
}

function start() {
  if (!starting) starting = (async () => {
    const wasmBinary = await get(spec.wasm);
    M = await RikuyHunspell({ wasmBinary, print: () => {}, printErr: () => {} });
  })();
  return starting;
}

function cstr(s) {
  const n = M.lengthBytesUTF8(s) + 1, p = M._malloc(n);
  M.stringToUTF8(s, p, n);
  return p;
}

async function dict(name) {
  const d = spec.dicts[name];
  if (!d) throw new Error('no dictionary ' + name);
  let h = open.get(name);
  if (h == null) {
    h = (async () => {
      await start();
      const [aff, dic] = await Promise.all([get(d.aff), get(d.dic)]);
      const A = '/' + name + '.aff', D = '/' + name + '.dic';
      M.FS.writeFile(A, aff); M.FS.writeFile(D, dic);
      const pa = cstr(A), pd = cstr(D);
      const slot = M._spell_open(pa, pd);
      M._free(pa); M._free(pd);
      // (Hunspell has read both: the copies go)
      M.FS.unlink(A); M.FS.unlink(D);
      if (slot < 0) throw new Error('dictionary ' + name + ' did not open');
      return slot;
    })();
    open.set(name, h);
    h.then((slot) => open.set(name, slot), () => open.delete(name));
  }
  return h;
}

const clean = (w) => String(w).replace(/[\n\r\0]/g, '');
async function check(name, words) {
  if (!Array.isArray(words) || words.length > MAX_LIST) throw new Error('too many words');
  const slot = await dict(name);
  const ask = [], at = [];
  const out = new Array(words.length).fill('1');
  words.forEach((w, k) => { const c = clean(w); if (c && c.length <= MAX_WORD) { ask.push(c); at.push(k); } });
  if (ask.length) {
    const s = ask.join('\n') + '\n';
    const n = M.lengthBytesUTF8(s), p = M._malloc(n + 1);
    M.stringToUTF8(s, p, n + 1);
    const r = M.UTF8ToString(M._spell_check_list(slot, p, n));
    M._free(p);
    for (let k = 0; k < at.length; k++) out[at[k]] = r[k] === '0' ? '0' : '1';
  }
  return out.join('');
}

async function suggest(name, word) {
  const w = clean(word);
  if (!w || w.length > MAX_SUGGEST) return [];
  const slot = await dict(name);
  const p = cstr(w);
  const r = M.UTF8ToString(M._spell_suggest(slot, p));
  M._free(p);
  return r.split('\n').filter(Boolean).slice(0, 8);
}

// the data of a thesaurus as a device MyThes reads with fseek and fgets: the pieces it has
function thesDevice(name, pieces) {
  const offs = [];
  let total = 0;
  for (const p of pieces) { offs.push(total); total += p.size; }
  const T = { pieces, offs, total, have: new Map(), missing: new Set(), loading: new Map() };
  const at = (pos) => { let lo = 0, hi = offs.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (offs[mid] <= pos) lo = mid; else hi = mid - 1; } return lo; };
  const id = M.FS.makedev(64 + (devN++ % 64), 0);
  M.FS.registerDevice(id, {
    read(stream, buffer, offset, length, pos) {
      if (pos >= total || length <= 0) return 0;
      const k = at(pos), d = T.have.get(k);
      if (!d) { T.missing.add(k); return 0; }
      const a = pos - offs[k], n = Math.min(length, d.length - a);
      buffer.set(d.subarray(a, a + n), offset);
      return n;
    },
    llseek(stream, offset, whence) {
      let p = offset;
      if (whence === 1) p += stream.position; else if (whence === 2) p += total;
      if (p < 0) throw new M.FS.ErrnoError(28);
      return p;
    }
  });
  const path = '/' + name + '.dat';
  M.FS.mkdev(path, id);
  return { T, path };
}
function piece(T, k) {
  if (T.have.has(k)) return Promise.resolve();
  if (!T.loading.has(k)) T.loading.set(k, get(T.pieces[k]).then((b) => { T.have.set(k, b); T.loading.delete(k); }, (e) => { T.loading.delete(k); throw e; }));
  return T.loading.get(k);
}
async function thesaurus(name) {
  const d = spec.thes && spec.thes[name];
  if (!d) throw new Error('no thesaurus ' + name);
  let h = thesOpen.get(name);
  if (h == null) {
    h = (async () => {
      await start();
      const idx = await get(d.idx);
      const I = '/' + name + '.idx';
      M.FS.writeFile(I, idx);
      const { T, path } = thesDevice(name, d.dat);
      const pi = cstr(I), pd = cstr(path);
      const slot = M._thes_open(pi, pd);
      M._free(pi); M._free(pd);
      // (MyThes has read the index whole: the copy goes)
      M.FS.unlink(I);
      if (slot < 0) throw new Error('thesaurus ' + name + ' did not open');
      return { slot, T };
    })();
    thesOpen.set(name, h);
    h.then((x) => thesOpen.set(name, x), () => thesOpen.delete(name));
  }
  return h;
}
async function lookup(t, w) {
  for (let i = 0; i < 4; i++) {
    t.T.missing.clear();
    const p = cstr(w);
    const r = M.UTF8ToString(M._thes_lookup(t.slot, p));
    M._free(p);
    if (!t.T.missing.size) {
      return r.split('\n').filter(Boolean).slice(0, 80).map((line) => { const [pos, ...terms] = line.split('\t'); return { pos, terms: terms.filter(Boolean).slice(0, 60) }; });
    }
    await Promise.all([...t.T.missing].slice(0, 2).map((k) => piece(t.T, k)));
  }
  return [];
}
async function synonyms(dictName, thesName, word) {
  const w = clean(word).trim();
  if (!w || w.length > MAX_SUGGEST) return { head: null, meanings: [] };
  const t = await thesaurus(thesName);
  const cands = [w.toLowerCase()];
  // (an inflected word: its stems, as Hunspell finds them, are the entries LibreOffice looks up)
  let slot = -1;
  try { slot = await dict(dictName); } catch (e) { slot = -1; }
  if (slot >= 0) {
    const p = cstr(w);
    const r = M.UTF8ToString(M._spell_stem(slot, p));
    M._free(p);
    for (const s of r.split('\n')) { const l = s.toLowerCase(); if (l && !cands.includes(l)) cands.push(l); }
  }
  for (const c of cands.slice(0, 6)) {
    const meanings = await lookup(t, c);
    if (meanings.length) return { head: c, meanings };
  }
  return { head: null, meanings: [] };
}

self.onmessage = async ({ data }) => {
  const { id, op } = data || {};
  try {
    let result = null;
    if (op === 'init') { base = String(data.base); spec = data.spec; result = true; }
    else if (!spec) throw new Error('not started');
    else if (op === 'check') result = await check(String(data.dict), data.words);
    else if (op === 'suggest') result = await suggest(String(data.dict), data.word);
    else if (op === 'load') { await dict(String(data.dict)); result = true; }
    else if (op === 'synonyms') result = await synonyms(String(data.dict), String(data.thes), data.word);
    else throw new Error('unknown op');
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String((e && e.message) || e) });
  }
};
