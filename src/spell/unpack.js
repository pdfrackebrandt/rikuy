// A dictionary or a thesaurus piece as build.mjs packs it (gzip), unpacked in the spell worker: by
// the browser's own DecompressionStream where it has one, else by fflate. Firefox 102 to 112 and
// Safari 16.0 to 16.3 run Hunspell under the page's policy but have no DecompressionStream: without
// this the Spelling pane and the Thesaurus found a dead worker there, though the page said spelling
// was available.
import { gunzipSync } from 'fflate';

export async function gunzip(bytes) {
  if (typeof DecompressionStream === 'function') return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return gunzipSync(bytes);
}
