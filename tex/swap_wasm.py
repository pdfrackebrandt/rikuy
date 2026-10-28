#!/usr/bin/env python3
"""Put a newly patched engine (patch_wasm.py's output) into a built tex/ folder without
rebuilding the packs: writes its w-*.wasm parts, points tree.wasm's index at them and deletes
the old parts. The result is what build_tree.py packs would write (same gzip, same names).

Usage: swap_wasm.py TEX_DIR [PATCHED.wasm]
"""
import gzip, hashlib, json, os, sys


def leb(n):
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def wrap(payload):
    body = leb(6) + b'galley' + payload
    return b'\0asm\x01\0\0\0' + b'\x00' + leb(len(body)) + body


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def main(d, src):
    raw = open(os.path.join(d, 'tree.wasm'), 'rb').read()
    idx = json.loads(gzip.decompress(raw[raw.index(b'galley') + 6:]))
    wz = gzip.compress(open(src, 'rb').read(), 9, mtime=0)
    if idx['wasmHash'] == sha(wz):
        print('already', idx['wasmHash'])
        return
    old = [w['f'] for w in idx['wasm']]
    wasm, CH = [], 14_000_000
    for i in range(0, len(wz), CH):
        part = wz[i:i + CH]
        fn = 'w-%s.wasm' % sha(part)
        open(os.path.join(d, fn), 'wb').write(wrap(part))
        wasm.append({'f': fn, 'z': len(part)})
    idx['wasm'], idx['wasmHash'], idx['wasmSize'] = wasm, sha(wz), os.path.getsize(src)
    js = json.dumps(idx, separators=(',', ':')).encode()
    open(os.path.join(d, 'tree.wasm'), 'wb').write(wrap(gzip.compress(js, 9, mtime=0)))
    for f in old:
        if f not in [w['f'] for w in wasm]:
            os.remove(os.path.join(d, f))
    print('engine', old, '->', [w['f'] for w in wasm])


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ.get('RIKUY_WORK', '/tmp/eng'), 'busytex-patched.wasm'))
