// The picture tools' worker (src/picfx.js over tex/native/pic/pic.c): the page sends the module's
// bytes once (checked against the build's hash there), then a picture and its settings at a time;
// the pixels are worked on here, so the page keeps answering while a 12 megapixel photo takes
// seconds. WebAssembly memory never shrinks: a run that left the module above 64 MB lets it go,
// and the next run starts a fresh one (as tex/tools.js does for its programs).

import { loadPicFx, picFxReady, picFxMemory, dropPicFx, render } from './picfx.js';

const KEEP = 64 * 1024 * 1024;
let wasm = null;
self.onmessage = async ({ data }) => {
  const { id, op } = data || {};
  try {
    if (op === 'init') { wasm = data.wasm; self.postMessage({ id, result: true }); return; }
    if (op === 'render') {
      if (!picFxReady() && !(wasm && await loadPicFx(wasm))) { self.postMessage({ id, result: { error: 'The picture tools did not load.' } }); return; }
      const r = render(data.bytes, data.settings, data.o || {});
      const mem = picFxMemory();
      if (mem > KEEP) dropPicFx();
      self.postMessage({ id, result: { ...r, mem, dropped: mem > KEEP } }, r.bytes ? [r.bytes.buffer] : []);
      return;
    }
    self.postMessage({ id, error: 'no such job' });
  } catch (e) {
    dropPicFx();
    self.postMessage({ id, error: String((e && e.message) || e) });
  }
};
