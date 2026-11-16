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
// The words come from a stranger's document: each is bounded (64 characters, no line end) and a
// list at most 200,000 words; a longer word is answered as known, never asked.
/* global RikuyHunspell */

const MAX_WORD = 64, MAX_LIST = 200000, MAX_SUGGEST = 40;
let base = '', spec = null, M = null, starting = null;
const open = new Map();   // dict -> slot, or a promise while it opens

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

self.onmessage = async ({ data }) => {
  const { id, op } = data || {};
  try {
    let result = null;
    if (op === 'init') { base = String(data.base); spec = data.spec; result = true; }
    else if (!spec) throw new Error('not started');
    else if (op === 'check') result = await check(String(data.dict), data.words);
    else if (op === 'suggest') result = await suggest(String(data.dict), data.word);
    else if (op === 'load') { await dict(String(data.dict)); result = true; }
    else throw new Error('unknown op');
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String((e && e.message) || e) });
  }
};
