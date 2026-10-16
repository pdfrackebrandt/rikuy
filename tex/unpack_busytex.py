#!/usr/bin/env python3
"""Unpack BusyTeX's texlive-*.data packages (emscripten file_packager, MiniLZ4) into a tree.

Each package is one byte stream cut into 2048 byte chunks. compressedData in the .js lists,
per chunk, its offset and size in the .data file and whether it is LZ4 compressed (a chunk
that did not shrink is stored as is). The last chunk is usually shorter than 2048 bytes.

texlive-extra holds everything basic and recommended hold, so it is unpacked last; files that
several packages share (ls-R, the updmap maps, the formats) then come from it.
"""
import json, os, re, sys

import lz4.block

CHUNK = 2048


def numbers(meta, key):
    m = re.search(r'"%s":\[([^\]]*)\]' % key, meta)
    if not m:
        raise SystemExit(f'compressedData has no {key}')
    return [int(x) for x in m.group(1).split(',')]


def unpack(js_path, data_path, out_dir):
    js = open(js_path).read()
    data = open(data_path, 'rb').read()
    files = json.loads(re.search(r'"files":\s*(\[.*?\])\s*,\s*"remote_package_size"', js, re.DOTALL).group(1))
    meta = re.search(r'var compressedData = (\{.*?\});', js, re.DOTALL).group(1)
    offsets, sizes, successes = numbers(meta, 'offsets'), numbers(meta, 'sizes'), numbers(meta, 'successes')
    total = max(f['end'] for f in files)
    if not len(offsets) == len(sizes) == len(successes) == -(-total // CHUNK):
        raise SystemExit(f'{js_path}: {len(offsets)} chunks for {total} bytes')
    out = bytearray()
    for off, size, ok in zip(offsets, sizes, successes):
        want = min(CHUNK, total - len(out))
        raw = data[off:off + size]
        out += lz4.block.decompress(raw, uncompressed_size=want) if ok else raw[:want]
    if len(out) != total:
        raise SystemExit(f'{js_path}: got {len(out)} bytes, expected {total}')
    for f in files:
        dest = os.path.join(out_dir, f['filename'].lstrip('/'))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as fh:
            fh.write(out[f['start']:f['end']])
    print(f'  {len(files)} files, {total} bytes')


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('GALLEY_WORK', '/tmp/eng'), 'busy/busytex')
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ.get('GALLEY_WORK', '/tmp/eng'), 'tree-extra')
    os.makedirs(out, exist_ok=True)
    for name in ['texlive-basic', 'texlive-recommended', 'texlive-extra']:
        js, data = os.path.join(base, name + '.js'), os.path.join(base, name + '.data')
        if not (os.path.exists(js) and os.path.exists(data)):
            raise SystemExit(f'missing {js} or {data}')
        print(name)
        unpack(js, data, out)
