#!/usr/bin/env python3
"""Rikuy's hosted copy is a claude.ai artifact, which takes a version in publishes of limited
size. This plans those publishes for dist/: at most ~58 MB and 240 entries each (a publish may carry
64 MB and 255 files), the engine and core first, and the first one also removing what the live
version holds that this build no longer has (so the version stays under its 256 MB).

Usage: publish_batches.py [live-files.txt]   (one published path per line, from a files listing)
Writes $RIKUY_WORK/batch<i>.json, each a `files` map for the Artifact tool (path -> source or null).
"""
import json, os, sys, gzip

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
ROOT = os.path.normpath(ROOT)
D = os.path.join(ROOT, 'tex')
raw = open(os.path.join(D, 'tree.wasm'), 'rb').read()
idx = json.loads(gzip.decompress(raw[raw.index(b'galley') + 6:]))

live = set()
if len(sys.argv) > 1:
    live = set(l.strip() for l in open(sys.argv[1]) if l.strip())

first = ['engine.js', 'busytex.js', 'fflate.js', 'shell.js', 'tools.js', 'biber.js', 'pdf.worker.min.mjs', 'tree.wasm', 'gs.js', 'gnuplot.js', 'pyodide.js']
first += [w['f'] for w in idx['wasm']]
first += [idx['packs'][n]['f'] for n in idx['core']]
first += [idx['biber']['wasm']['f'], idx['biber']['data']['f']]
tools = []
for k, t in idx['tools'].items():
    for v in t.values():
        for a in (v if isinstance(v, list) else [v]):
            if isinstance(a, dict) and 'f' in a:
                tools.append(a['f'])
# the Chinese and Arabic packs ('x' in the index, 47 MB) stay out: the artifact has no room for
# them, and the worker tells a document that needs one where the hosted Rikuy is
rest = [p['f'] for i, p in enumerate(idx['packs']) if i not in set(idx['core']) and not p.get('x')]
left_out = set(p['f'] for p in idx['packs'] if p.get('x'))
order = []
for f in first + tools + rest:
    if f not in order:
        order.append(f)
on_disk = set(os.listdir(D))
missing = [f for f in order if f not in on_disk]
assert not missing, missing
extra = sorted(on_disk - set(order) - left_out)
assert not [f for f in extra if f.endswith('.wasm')], extra  # a pack the index does not know
order += extra

# content-addressed files already live need no upload
hashed = lambda f: f[:2] in ('p-', 'w-', 'b-', 't-')
uploads = [f for f in order if not (hashed(f) and 'tex/' + f in live)]
# the editor's native core, beside the page (build.mjs), named by its hash
core = sorted('core/' + f for f in os.listdir(os.path.join(ROOT, 'core')))
assert len(core) == 1 and core[0].startswith('core/rikuy-core-') and core[0].endswith('.wasm'), core
new_paths = set('tex/' + f for f in order) | {'git.js', 'LICENSES.txt', 'index.html'} | set(core)
removals = sorted(p for p in live if p not in new_paths)

batches, cur, size = [], {p: None for p in removals}, 0
cur['git.js'] = os.path.join(ROOT, 'git.js')
# the licenses of what the page ships travel with it (build.mjs writes them)
cur['LICENSES.txt'] = os.path.join(ROOT, 'LICENSES.txt')
for c in core:
    if c not in live:
        cur[c] = os.path.join(ROOT, c)
LIM = 58_000_000
for f in uploads:
    s = os.path.getsize(os.path.join(D, f))
    if cur and (size + s > LIM or len(cur) >= 240):
        batches.append(cur); cur, size = {}, 0
    cur['tex/' + f] = os.path.join(D, f)
    size += s
if cur:
    batches.append(cur)
for i, b in enumerate(batches):
    json.dump(b, open(os.path.join(os.environ.get('RIKUY_WORK', '/tmp/eng'), 'batch%d.json') % i, 'w'))
    print(i, len(b), 'entries', sum(1 for v in b.values() if v is None), 'removals',
          round(sum(os.path.getsize(v) for v in b.values() if v) / 1e6, 1), 'MB')
print('uploads', len(uploads), 'of', len(order), 'kept', len(order) - len(uploads), 'removed', len(removals))
