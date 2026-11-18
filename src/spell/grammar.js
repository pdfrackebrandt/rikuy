// The grammar worker: Harper (src/spell/harper.js) off the page's thread, started the first time
// grammar is asked for. build.mjs writes it as one classic script. The module is fetched once,
// used only with the SHA-256 the page's bundle names, and kept while the worker lives.
//
// Messages: {id, op, ...} in, {id, result} or {id, error} out.
//   init {base, spec}       where the module is and what it is (__RIKUY_SPELL__.grammar)
//   lint {text, dialect}    the lints of one text, at most 200,000 characters
import { harperBytes, lintText } from './harper.js';

const MAX_TEXT = 200000;
let base = '', spec = null, starting = null;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function start() {
  if (!starting) starting = (async () => {
    const r = await fetch(new URL(spec.wasm.name, base).href, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('could not fetch ' + spec.wasm.name + ' (' + r.status + ')');
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== spec.wasm.sha256) throw new Error(spec.wasm.name + ' is not the file this page was built with');
    harperBytes(bytes);
  })();
  starting.catch(() => { starting = null; });
  return starting;
}

self.onmessage = async ({ data }) => {
  const { id, op } = data || {};
  try {
    let result = null;
    if (op === 'init') { base = String(data.base); spec = data.spec; result = true; }
    else if (!spec) throw new Error('not started');
    else if (op === 'lint') {
      const text = String(data.text || '');
      if (text.length > MAX_TEXT) throw new Error('text too long');
      await start();
      result = await lintText(text, data.dialect === 1 ? 1 : 0);
    } else throw new Error('unknown op');
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String((e && e.message) || e) });
  }
};
